import { NextResponse } from "next/server"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"
import { r2, R2_BUCKET } from "@/lib/r2"

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
        intakeStage: true,
        intakeDelayReason: true,
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  try {
    const userId = await requireUserId()
    const { uploadId } = await ctx.params

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
        r2Key: true,
        intakeStatus: true,
      },
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    if (upload.intakeStatus === "PROCESSING") {
      return NextResponse.json(
        { ok: false, error: "Cannot delete upload while intake is processing." },
        { status: 409 }
      )
    }

    const r2Key = upload.r2Key?.trim() ?? ""

    await prisma.upload.delete({
      where: { id: upload.id },
    })

    if (r2Key) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: r2Key,
          })
        )
      } catch (r2Err) {
        console.error("Upload delete: R2 object delete failed", {
          uploadId: upload.id,
          r2Key,
          r2Err,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    const msg = err?.message ?? "Failed to delete upload"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
