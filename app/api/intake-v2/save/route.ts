import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { requireUserId } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

function sanitizeForPostgres(obj: unknown): unknown {
  if (typeof obj === "string") {
    // Remove null bytes and other control characters Postgres rejects in JSON
    return obj
      .replace(/\u0000/g, "")
      .replace(/\\u0000/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForPostgres)
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        sanitizeForPostgres(v),
      ])
    )
  }
  return obj
}

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

    const sanitizedResult = sanitizeForPostgres(result)
    const sanitizedExisting = sanitizeForPostgres(existing)
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        intakeReport: {
          ...(sanitizedExisting as Record<string, unknown>),
          v2: sanitizedResult,
        } as Prisma.InputJsonValue,
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
