/**
 * Local test hook for intake_v2 only. Does not persist or trigger v1 intake.
 * Requires an authenticated session (same cookie as the rest of the app).
 */
import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { readUploadBufferFromR2 } from "@/lib/intake/r2-read"
import { prisma } from "@/lib/prisma"
import { runIntakeV2 } from "@/lib/intake_v2/run-intake-v2"
import type { IntakeV2RunResult } from "@/lib/intake_v2/types"

export const runtime = "nodejs"

function jsonBody(result: IntakeV2RunResult, extra: Record<string, unknown>) {
  return {
    ...extra,
    ok: result.ok,
    error: result.error,
    pageCount: result.pageCount,
    meta: result.meta,
    rows: result.rows,
    pagePreviews: result.pagePreviews,
    pageSizes: result.pageSizes,
    toc: result.toc,
  }
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserId()
    const { searchParams } = new URL(req.url)
    const uploadId = String(searchParams.get("uploadId") ?? "").trim()
    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
    }

    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, project: { ownerId: userId } },
      select: { id: true, filename: true, r2Key: true },
    })

    if (!upload?.r2Key) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    const { buffer } = await readUploadBufferFromR2(upload.r2Key)
    const result = await runIntakeV2(buffer)
    return NextResponse.json(
      jsonBody(result, {
        source: "uploadId",
        uploadId: upload.id,
        filename: upload.filename,
      }),
      { status: 200 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
    }
    console.error("intake-v2/test GET:", err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId()
    const contentType = req.headers.get("content-type") ?? ""

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const file = form.get("file")
      if (!file || typeof file === "string" || !(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: 'Expected form field "file" (PDF).' },
          { status: 400 },
        )
      }
      const lower = file.name.toLowerCase()
      if (!lower.endsWith(".pdf")) {
        return NextResponse.json({ ok: false, error: "Only PDF files are supported." }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await runIntakeV2(buffer)
      return NextResponse.json(
        jsonBody(result, { source: "file", filename: file.name }),
        { status: 200 },
      )
    }

    const body = await req.json().catch(() => null)
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : ""
    if (!uploadId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Send multipart/form-data with field "file" (PDF), or JSON { "uploadId": "<id>" } with Content-Type: application/json.',
        },
        { status: 400 },
      )
    }

    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, project: { ownerId: userId } },
      select: { id: true, filename: true, r2Key: true },
    })

    if (!upload?.r2Key) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    const { buffer } = await readUploadBufferFromR2(upload.r2Key)
    const result = await runIntakeV2(buffer)
    return NextResponse.json(
      jsonBody(result, {
        source: "uploadId",
        uploadId: upload.id,
        filename: upload.filename,
      }),
      { status: 200 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
    }
    console.error("intake-v2/test:", err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
