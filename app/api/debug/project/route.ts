/**
 * DEV-ONLY — not used by the MittenIQ in-app flow (no references under `app/` except this file).
 * Creates a throwaway `Project` for local debugging. Disabled when `NODE_ENV !== "development"`.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { ok: false, error: "This endpoint is only available in development." },
      { status: 403 },
    )
  }

  try {
    const userId = await requireUserId()

    const p = await prisma.project.create({
      data: {
        name: `Debug Project ${new Date().toISOString()}`,
        ownerId: userId,
      },
    })

    return NextResponse.json({ ok: true, project: p })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to create project"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}