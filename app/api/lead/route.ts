import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const fd = await req.formData();

    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const company = String(fd.get("company") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();

    if (!name || !email) {
      return NextResponse.json(
        { ok: false, error: "Name and email are required." },
        { status: 400 }
      );
    }

    const to = process.env.LEAD_TO_EMAIL;
    const from = process.env.LEAD_FROM_EMAIL;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing RESEND_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    if (!to || !from) {
      return NextResponse.json(
        { ok: false, error: "Missing LEAD_TO_EMAIL or LEAD_FROM_EMAIL in .env.local" },
        { status: 500 }
      );
    }

    await resend.emails.send({
      from,
      to,
      subject: `New MittenIQ Waitlist Lead - ${name}`,
      text:
        `New lead from MittenIQ site.\n\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Company: ${company || "N/A"}\n` +
        `Notes: ${notes || "None provided"}\n`,
    });

    return NextResponse.json({
      ok: true,
      message: "Lead captured successfully.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST /api/lead (not meant for browser)." },
    { status: 405 }
  );
}