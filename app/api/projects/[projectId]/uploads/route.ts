// app/api/projects/[projectId]/uploads/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  try {
    const userId = await requireUserId()
    const { projectId } = await ctx.params

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 })
    }

    const uploads = await prisma.upload.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        intakeStatus: true,
        intakeStage: true,
        intakeDelayReason: true,
        intakeError: true,
        pageCount: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ ok: true, uploads })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to fetch uploads"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}