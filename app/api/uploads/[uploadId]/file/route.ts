import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { prisma } from "@/lib/prisma"
import { requireUserId } from "@/lib/auth"
import { r2, R2_BUCKET } from "@/lib/r2"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  try {
    const userId = await requireUserId()
    const { uploadId } = await ctx.params

    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const wantsPageJson = searchParams.has("page")

    const upload = await prisma.upload.findFirst({
      where: {
        id: uploadId,
        project: { ownerId: userId },
      },
      select: {
        id: true,
        r2Key: true,
        filename: true,
        mimeType: true,
      },
    })

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 })
    }

    if (!upload.r2Key) {
      return NextResponse.json({ ok: false, error: "Upload missing r2Key" }, { status: 500 })
    }

    const cmd = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: upload.r2Key,
      ResponseContentType: upload.mimeType || "application/pdf",
      ResponseContentDisposition: `inline; filename="${upload.filename.replace(/"/g, "")}"`,
    })

    const signedUrl = await getSignedUrl(r2, cmd, { expiresIn: 60 * 5 })

    if (wantsPageJson) {
      const raw = searchParams.get("page")
      const pageNumber = raw !== null && raw !== "" ? Number(raw) : NaN
      if (!Number.isFinite(pageNumber) || pageNumber < 1) {
        return NextResponse.json({ ok: false, error: "Invalid page" }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        url: signedUrl,
        page: Math.trunc(pageNumber),
      })
    }

    return NextResponse.redirect(signedUrl)
  } catch (err: any) {
    const msg = err?.message ?? "Failed to open file"
    const status = msg === "UNAUTHENTICATED" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}