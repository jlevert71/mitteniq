import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { r2, R2_BUCKET } from "@/lib/r2"
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { requireUserId } from "@/lib/auth"

export const runtime = "nodejs"

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableR2ReadError(e: any) {
  const name = String(e?.name ?? "")
  const code = String(e?.Code ?? e?.code ?? "")
  const http = Number(e?.$metadata?.httpStatusCode ?? 0)
  const msg = String(e?.message ?? "")

  // S3-ish "not ready / not found yet" or transient errors
  if (name === "NoSuchKey" || code === "NoSuchKey") return true
  if (http === 404) return true

  // occasional transient network-ish failures
  if (name.includes("Timeout") || msg.toLowerCase().includes("timeout")) return true
  if (msg.toLowerCase().includes("socket") || msg.toLowerCase().includes("network")) return true

  return false
}

// Lightweight PDF checks (v0)
function basicPdfChecks(buf: Buffer) {
  const head = buf.subarray(0, 1024).toString("latin1")
  const tail = buf.subarray(Math.max(0, buf.length - 4096)).toString("latin1")

  const isPdf = head.includes("%PDF-")
  const hasXref = tail.includes("startxref")

  const hasTextOps = buf.includes(Buffer.from("BT")) && buf.includes(Buffer.from("ET"))
  const hasImages = buf.includes(Buffer.from("/Image"))
  const hasFont = buf.includes(Buffer.from("/Font"))

  const pageMatches = buf.toString("latin1").match(/\/Type\s*\/Page\b/g)
  const pageCount = pageMatches ? pageMatches.length : null

  return {
    isPdf,
    hasXref,
    pageCount,
    likelySearchable: !!(hasTextOps || hasFont),
    likelyRasterHeavy: !!(hasImages && !hasFont && !hasTextOps),
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId()

    const body = await req.json().catch(() => null)
    const uploadId = String(body?.uploadId ?? "").trim()

    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
    }

    // Ownership-gated lookup (prevents leaking existence)
    const upload = await prisma.upload.findFirst({
      where: {
        id: uploadId,
        project: { ownerId: userId },
      },
      select: {
        id: true,
        r2Key: true,
        status: true,
        intakeStatus: true,
        intakeError: true,
        intakeReport: true,
      },
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }
    if (!upload.r2Key) {
      return NextResponse.json({ ok: false, error: "Upload missing r2Key" }, { status: 400 })
    }

    // --- State machine guards ---
    if (upload.status !== "UPLOADED") {
      return NextResponse.json(
        { ok: false, error: `Cannot analyze unless status is UPLOADED (currently ${upload.status})` },
        { status: 409 }
      )
    }

    // Idempotent: if already READY, do not re-run analysis
    if (upload.intakeStatus === "READY") {
      return NextResponse.json({
        ok: true,
        upload,
        report: upload.intakeReport ?? null,
        note: "Already READY",
      })
    }

    // Set PENDING, but DO NOT clear the previous error until we succeed.
    await prisma.upload.update({
      where: { id: uploadId },
      data: { intakeStatus: "PENDING" },
    })
    // --------------------------------

    // Retry reading from R2 to avoid transient "not ready" failures
    const attempts = 5
    const delaysMs = [250, 500, 1000, 1500, 2000]

    let head: any = null
    let buf: Buffer | null = null
    let lastErr: any = null

    for (let i = 0; i < attempts; i++) {
      try {
        head = await r2.send(
          new HeadObjectCommand({
            Bucket: R2_BUCKET,
            Key: upload.r2Key,
          })
        )

        const obj = await r2.send(
          new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: upload.r2Key,
          })
        )

        if (!obj.Body) throw new Error("R2 GetObject returned empty body")

        buf = await streamToBuffer(obj.Body)

        // Got bytes — break out
        break
      } catch (e: any) {
        lastErr = e

        if (i < attempts - 1 && isRetryableR2ReadError(e)) {
          await sleep(delaysMs[i] ?? 1000)
          continue
        }
        throw e
      }
    }

    if (!buf) {
      throw lastErr ?? new Error("Failed to read object from R2")
    }

    const checks = basicPdfChecks(buf)

    const report = {
      uploadId,
      bytesAnalyzed: buf.length,
      contentType: head?.ContentType ?? null,
      contentLength: head?.ContentLength ?? null,
      ...checks,
      notes: [
        checks.isPdf ? null : "File does not look like a PDF (missing %PDF- header).",
        checks.pageCount == null ? "Could not estimate page count (v0 heuristic)." : null,
      ].filter(Boolean),
    }

    // 1) Update intake fields (do NOT set Upload.status here)
    const updated = await prisma.upload.update({
      where: { id: uploadId },
      data: {
        pageCount: checks.pageCount ?? undefined,
        isSearchable: checks.likelySearchable,
        isRasterOnly: checks.likelyRasterHeavy,
        intakeReport: report as any,
        intakeStatus: "READY",
        intakeError: null, // clear only on success
      },
    })

    // 2) Refresh Sheets
    const pageCount = checks.pageCount ?? 0
    if (pageCount > 0) {
      await prisma.sheet.deleteMany({ where: { uploadId } })

      await prisma.$executeRawUnsafe(`
        INSERT INTO "Sheet"
          ("id","uploadId","pageNumber","sheetType","scaleStatus","scaleConfidence","notes","createdAt","updatedAt")
        SELECT
          gen_random_uuid(),
          '${uploadId}',
          gs AS "pageNumber",
          CASE WHEN gs = 1 THEN 'PLAN' ELSE 'DETAIL' END::"SheetType",
          CASE WHEN gs = 1 THEN 'UNVERIFIED' ELSE 'NO_SCALE_NEEDED' END::"ScaleStatus",
          CASE WHEN gs = 1 THEN 35 ELSE 90 END,
          CASE WHEN gs = 1 THEN 'Scale verification required (v0).' ELSE NULL END,
          now(),
          now()
        FROM generate_series(1, ${pageCount}) AS gs;
      `)
    }

    return NextResponse.json({ ok: true, upload: updated, report, pageCount })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const isAuth = msg === "UNAUTHENTICATED"
    const status = isAuth ? 401 : 500

    // Best-effort persist failure state (including a minimal failure report)
    try {
      // We don't have uploadId in scope if JSON parse failed; guard it.
      // (This is fine because the only common path here still has uploadId.)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const body = null
    } catch {}

    // Pull uploadId out again safely for persistence
    // (keep it minimal and safe)
    try {
      // eslint-disable-next-line no-inner-declarations
      const body2 = await req.json().catch(() => null)
      const uploadId2 = String(body2?.uploadId ?? "").trim()
      if (uploadId2) {
        await prisma.upload.update({
          where: { id: uploadId2 },
          data: {
            intakeStatus: "FAILED",
            intakeError: msg,
            intakeReport: { ok: false, stage: "analyze", error: msg } as any,
          },
        })
      }
    } catch {
      // ignore
    }

    console.error("Analyze error:", e)
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}