import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null; 

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded." },
        { status: 400 }
      );
    }

    // Strong PDF validation
const name = file.name.toLowerCase();
const isPdfByName = name.endsWith(".pdf");
const isPdfByType = file.type === "application/pdf";

// Check actual file header
const buffer = await file.arrayBuffer();
const bytes = new Uint8Array(buffer.slice(0, 4));
const header = String.fromCharCode(...bytes);
const isPdfByHeader = header === "%PDF";

if (!(isPdfByName || isPdfByType) || !isPdfByHeader) {
  return NextResponse.json(
    { error: "Only PDF files are allowed." },
    { status: 400 }
  );
}

    // Basic file info (real, not fake)
    const fileSizeKB = Math.round(buffer.byteLength / 1024);

    // Fake structured report (but now based on real file)
    return NextResponse.json({
      ok: true,
      report: {
        fileName: file.name,
        fileSizeKB,
        textSearchable: true,
        contentTypeGuess: "vector",
        scaleConfidence: 0.72,
        warnings: [
          "Scale not verified yet. Calibration required.",
        ],
        recommendations: [
          "Confirm scale using known dimension.",
          "Review title block for sheet metadata.",
        ],
      },
    });

  } catch (err) {
    return NextResponse.json(
      { error: "Server error processing file." },
      { status: 500 }
    );
  }
}