import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const uploadId = String(body?.uploadId ?? "");
  const ok = body?.ok !== false;

  if (!uploadId) {
    return NextResponse.json({ ok: false, error: "Missing uploadId" }, { status: 400 });
  }

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, status: true, intakeStatus: true },
  });

  if (!upload) {
    return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 });
  }

  // Idempotency / state machine guard:
  // Only allow transitions out of PENDING.
  if (upload.status !== "PENDING") {
    // If it's already in the desired "completed" state, treat as ok.
    if (ok && upload.status === "UPLOADED") {
      const current = await prisma.upload.findUnique({ where: { id: uploadId } });
      return NextResponse.json({ ok: true, upload: current, note: "Already UPLOADED" });
    }
    if (!ok && upload.status === "FAILED") {
      const current = await prisma.upload.findUnique({ where: { id: uploadId } });
      return NextResponse.json({ ok: true, upload: current, note: "Already FAILED" });
    }

    return NextResponse.json(
      { ok: false, error: `Invalid transition: status is ${upload.status}` },
      { status: 409 }
    );
  }

  const updated = await prisma.upload.update({
    where: { id: uploadId },
    data: ok
      ? { status: "UPLOADED", intakeStatus: "PENDING", intakeError: null }
      : { status: "FAILED", intakeStatus: "FAILED", intakeError: "Upload failed" },
  });

  return NextResponse.json({ ok: true, upload: updated });
}