import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  try {
    const { uploadId } = await ctx.params

    if (!uploadId) {
      return NextResponse.json(
        { ok: false, error: "Missing uploadId" },
        { status: 400 }
      )
    }

    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
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
      return NextResponse.json(
        { ok: false, error: "Upload not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, upload })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to fetch upload" },
      { status: 500 }
    )
  }
}