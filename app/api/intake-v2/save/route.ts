import { NextResponse } from "next/server"
import { requireUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const userId = await requireUserId()
    const body = await req.json().catch(() => null)
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : ""
    const result = body?.result

    if (!uploadId || !result) {
      return NextResponse.json({ ok: false, error: "Missing uploadId or result" }, { status: 400 })
    }

    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, project: { ownerId: userId } },
      select: { id: true, intakeReport: true },
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    const existing = (upload.intakeReport ?? {}) as Record<string, unknown>

    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        intakeReport: { ...existing, v2: result },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
    }
    console.error("intake-v2/save POST:", err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
