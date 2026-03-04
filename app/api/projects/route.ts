// app/api/projects/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET() {
  try {
    const userId = await requireUserId()

    const projects = await prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { uploads: true } },
      },
    })

    return NextResponse.json({ ok: true, projects })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to fetch projects"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId()
    const body = await req.json().catch(() => ({}))

    const nameRaw = typeof body?.name === "string" ? body.name : ""
    const name = nameRaw.trim() || `Project ${new Date().toISOString()}`

    const project = await prisma.project.create({
      data: {
        name,
        ownerId: userId,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ ok: true, project })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to create project"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}