import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    // Optional JSON body (so we can include name/email/message later)
    const fd = await req.formData();

const name = String(fd.get("name") ?? "");
const email = String(fd.get("email") ?? "");
const company = String(fd.get("company") ?? "");
const note = String(fd.get("note") ?? "");

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
      from, // MUST be a string like "onboarding@resend.dev" or your verified domain sender
      to,
      subject: "New MittenIQ lead",
      text:
    `New lead from MittenIQ site.\n\n` +
`Name: ${name}\n` +
`Email: ${email}\n` +
`Company: ${company}\n` +
`Note: ${note}\n`,    
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

// If you VISIT /api/lead in the browser, that’s a GET request.
// We return a helpful message instead of a confusing error.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST /api/lead (this endpoint is not meant to be opened in a browser)." },
    { status: 405 }
  );
}