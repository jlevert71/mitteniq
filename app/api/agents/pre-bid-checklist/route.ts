import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { runPreBidChecklist } from "@/lib/agents/pre-bid-checklist/run-pre-bid-checklist"
import { savePreBidChecklist } from "@/lib/agents/pre-bid-checklist/save-checklist"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const userId = await requireUserId()
    const body = await req.json().catch(() => null)
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : ""

    if (!uploadId) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid uploadId. Send JSON { "uploadId": "<id>" }.' },
        { status: 400 },
      )
    }

    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, project: { ownerId: userId } },
      select: { id: true, r2Key: true },
    })

    if (!upload?.r2Key) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    const result = await runPreBidChecklist({ uploadId: upload.id, r2Key: upload.r2Key })

    if (result.ok) {
      await savePreBidChecklist({
        uploadId: upload.id,
        fields: result.fields,
        meta: result.meta,
        extractedAt: result.extractedAt,
      })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
    }
    console.error("pre-bid-checklist API:", err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserId()
    const { searchParams } = new URL(req.url)
    const uploadId = searchParams.get("uploadId")?.trim() ?? ""

    if (!uploadId) {
      return NextResponse.json(
        { ok: false, error: "Missing uploadId query parameter." },
        { status: 400 },
      )
    }

    const checklist = await prisma.preBidChecklist.findUnique({
      where: { uploadId },
      include: {
        allowanceItems: {
          orderBy: { sortOrder: "asc" },
        },
        upload: {
          select: { project: { select: { ownerId: true } } },
        },
      },
    })

    if (!checklist) {
      return NextResponse.json({ ok: true, checklist: null }, { status: 200 })
    }

    if (checklist.upload.project.ownerId !== userId) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, checklist }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
    }
    console.error("pre-bid-checklist GET API:", err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
