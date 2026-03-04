// app/api/projects/[projectId]/route.ts
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
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    })

    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, project })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to fetch project"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  try {
    const userId = await requireUserId()
    const { projectId } = await ctx.params

    // Confirm ownership first (avoids leaking existence)
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    })

    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 })
    }

    // Cascades: Project -> Upload -> Sheet (per schema.prisma)
    await prisma.project.delete({
      where: { id: projectId },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to delete project"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}