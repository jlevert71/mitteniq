import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "@/lib/r2";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function safeExt(filename: string) {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const projectId = String(body?.projectId ?? "");
  const filename = String(body?.filename ?? "");
  const mimeType = String(body?.contentType ?? body?.mimeType ?? "");
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  const kind = String(body?.kind ?? "DRAWING"); // DRAWING | SPEC

  if (!projectId)
    return NextResponse.json({ ok: false, error: "Missing projectId" }, { status: 400 });

  if (!filename)
    return NextResponse.json({ ok: false, error: "Missing filename" }, { status: 400 });

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid sizeBytes" }, { status: 400 });
  }

  const MAX_BYTES = 200 * 1024 * 1024; // 200MB
  if (sizeBytes > MAX_BYTES)
    return NextResponse.json({ ok: false, error: "File too large" }, { status: 413 });

  const ext = safeExt(filename);

  // --- PDF ONLY ENFORCEMENT ---
  if (ext !== "pdf") {
    return NextResponse.json(
      { ok: false, error: "Only PDF files are allowed" },
      { status: 400 }
    );
  }

  if (mimeType !== "application/pdf") {
    return NextResponse.json(
      { ok: false, error: "Invalid content type. Must be application/pdf" },
      { status: 400 }
    );
  }
  // --------------------------------

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project)
    return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

  const upload = await prisma.upload.create({
    data: {
      projectId,
      kind: kind === "SPEC" ? "SPEC" : "DRAWING",
      filename,
      r2Key: "",
      sizeBytes,
      mimeType: "application/pdf", // lock it explicitly
      status: "PENDING",
    },
  });

  const key = `projects/${projectId}/uploads/${upload.id}/${filename}`;

  await prisma.upload.update({
    where: { id: upload.id },
    data: { r2Key: key },
  });

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: "application/pdf",
  });

  const url = await getSignedUrl(r2, cmd, { expiresIn: 60 * 5 });

  return NextResponse.json({
    ok: true,
    upload: { id: upload.id, r2Key: key },
    presignedUrl: url,
  });
}