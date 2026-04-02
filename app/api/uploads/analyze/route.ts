import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"
import { runIntakeAnalysis } from "@/lib/intake/run-intake-analysis"

export const runtime = "nodejs"

export async function POST(req: Request) {
  let uploadIdForFailure = ""

  try {
    const userId = await requireUserId()
    const body = await req.json().catch(() => null)
    const uploadId = String(body?.uploadId ?? "").trim()
    uploadIdForFailure = uploadId

    console.log("ANALYZE: start", { uploadId })

    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
    }

    const upload = await prisma.upload.findFirst({
      where: {
        id: uploadId,
        project: { ownerId: userId },
      },
      select: {
        id: true,
        projectId: true,
        filename: true,
        r2Key: true,
        status: true,
        intakeStatus: true,
        intakeStage: true,
        intakeError: true,
        intakeReport: true,
      },
    })

    console.log("ANALYZE: upload loaded", {
      found: Boolean(upload),
      status: upload?.status ?? null,
      filename: upload?.filename ?? null,
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    if (!upload.r2Key) {
      return NextResponse.json({ ok: false, error: "Upload missing r2Key" }, { status: 400 })
    }

    if (upload.status !== "UPLOADED") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot analyze unless status is UPLOADED (currently ${upload.status})`,
        },
        { status: 409 },
      )
    }

    if (process.env.MITTENIQ_V1_INTAKE_ENABLED === "true") {
      await prisma.upload.update({
        where: { id: uploadId },
        data: {
          intakeStatus: "PROCESSING",
          intakeStage: "STARTING",
          intakeError: null,
          intakeDelayReason: null,
        },
      })

      void (async () => {
        try {
          await runIntakeAnalysis({
            uploadId,
            filename: upload.filename ?? null,
            r2Key: upload.r2Key,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          try {
            await prisma.upload.update({
              where: { id: uploadId },
              data: {
                intakeStatus: "FAILED",
                intakeStage: "FAILED",
                intakeError: message,
                intakeDelayReason: null,
                intakeReport: { ok: false, stage: "analyze", error: message } as never,
              },
            })
          } catch (updateError) {
            console.error("ANALYZE: failed to persist detached failure status", updateError)
          }
          console.error("ANALYZE: detached intake analysis error", error)
        }
      })()

      return NextResponse.json({
        ok: true,
        status: "PROCESSING",
        message: "Analysis started",
        uploadId: upload.id,
        projectId: upload.projectId,
      })
    }

    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        intakeStatus: "READY",
        intakeStage: "v2_ready",
      },
    })

    return NextResponse.json({
      ok: true,
      status: "READY",
      message: "Upload ready",
      uploadId: upload.id,
      projectId: upload.projectId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isAuth = message === "UNAUTHENTICATED"
    const status = isAuth ? 401 : 500

    try {
      if (uploadIdForFailure) {
        await prisma.upload.update({
          where: { id: uploadIdForFailure },
          data: {
            intakeStatus: "FAILED",
            intakeStage: "FAILED",
            intakeError: message,
            intakeDelayReason: null,
            intakeReport: { ok: false, stage: "analyze", error: message } as never,
          },
        })
      }
    } catch {
      // ignore
    }

    console.error("Analyze error:", error)
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}