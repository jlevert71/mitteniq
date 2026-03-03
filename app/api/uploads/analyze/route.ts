import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { r2, R2_BUCKET } from "@/lib/r2"
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"

export const runtime = "nodejs"

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
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
  const body = await req.json().catch(() => null)
  const uploadId = String(body?.uploadId ?? "").trim()

  if (!uploadId) {
    return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
  }

  // Pull full state needed for gating
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, r2Key: true, status: true, intakeStatus: true, intakeError: true, intakeReport: true },
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
    return NextResponse.json({ ok: true, upload, report: upload.intakeReport ?? null, note: "Already READY" })
  }

  // If FAILED or PENDING, we allow (re)run. Clear previous error up front.
  await prisma.upload.update({
    where: { id: uploadId },
    data: { intakeStatus: "PENDING", intakeError: null },
  })
  // --------------------------------

  try {
    const head = await r2.send(
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

    const buf = await streamToBuffer(obj.Body)
    const checks = basicPdfChecks(buf)

    const report = {
      uploadId,
      bytesAnalyzed: buf.length,
      contentType: head.ContentType ?? null,
      contentLength: head.ContentLength ?? null,
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
        intakeError: null,
      },
    })

    // 2) Refresh Sheets
    const pageCount = checks.pageCount ?? 0
    if (pageCount > 0) {
      await prisma.sheet.deleteMany({ where: { uploadId } })

      // NOTE: uploadId is server-side generated/canonical (cuid), but we still avoid injection patterns.
      // Keeping executeRawUnsafe because of enum casts + generate_series, but values are controlled.
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

    try {
      await prisma.upload.update({
        where: { id: uploadId },
        data: { intakeStatus: "FAILED", intakeError: msg },
      })
    } catch {
      // ignore
    }

    console.error("Analyze error:", e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}