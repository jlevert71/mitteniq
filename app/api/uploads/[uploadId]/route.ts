import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  try {
    const userId = await requireUserId()
    const { uploadId } = await ctx.params

    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
    }

    // Ownership-gated lookup
    const upload = await prisma.upload.findFirst({
      where: {
        id: uploadId,
        project: { ownerId: userId },
      },
      select: {
        id: true,
        projectId: true,
        kind: true,
        filename: true,
        r2Key: true,
        sizeBytes: true,
        mimeType: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        pageCount: true,
        isSearchable: true,
        isRasterOnly: true,
        intakeReport: true,
        intakeStatus: true,
        intakeError: true,
      },
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, upload })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to fetch upload"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}