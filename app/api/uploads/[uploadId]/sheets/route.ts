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
      select: { id: true },
    })

    if (!upload) {
      return NextResponse.json(
        { ok: false, error: "Upload not found" },
        { status: 404 }
      )
    }

    const sheets = await prisma.sheet.findMany({
      where: { uploadId },
      orderBy: { pageNumber: "asc" },
      select: {
        id: true,
        uploadId: true,
        pageNumber: true,
        scaleConfidence: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ ok: true, sheets })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to fetch sheets" },
      { status: 500 }
    )
  }
}