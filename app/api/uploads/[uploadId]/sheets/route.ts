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
      return NextResponse.json(
        { ok: false, error: "Missing uploadId" },
        { status: 400 }
      )
    }

    const upload = await prisma.upload.findFirst({
      where: {
        id: uploadId,
        project: { ownerId: userId },
      },
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

        sheetNumber: true,
        sheetName: true,
        discipline: true,

        pageClass: true,
        sectionNumber: true,
        sectionTitle: true,
        isElectricalRelated: true,

        sheetType: true,
        scaleStatus: true,
        scaleConfidence: true,
        notes: true,

        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ ok: true, sheets })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to fetch sheets"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500

    return NextResponse.json(
      { ok: false, error: msg },
      { status }
    )
  }
}