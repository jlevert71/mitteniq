// app/api/uploads/get/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const userId = await requireUserId()

    const { searchParams } = new URL(req.url)
    const uploadId = String(searchParams.get("uploadId") ?? "").trim()

    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
    }

    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: {
        id: true,
        projectId: true,
        filename: true,
        status: true,
        intakeStatus: true,
        intakeError: true,
        intakeReport: true,
        pageCount: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { ownerId: true } },
      },
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    if (upload.project.ownerId !== userId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden", note: "Upload exists but is owned by a different user." },
        { status: 403 }
      )
    }

    const { project, ...rest } = upload
    return NextResponse.json({ ok: true, upload: rest })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to fetch upload"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}