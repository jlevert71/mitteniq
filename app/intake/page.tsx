"use client";

import { useState } from "react";

interface IntakeReport {
  filename: string;
  fileSizeKB: number;
  textSearchable: boolean;
  contentTypeGuess: string;
  scaleConfidence: number;
  warnings: string[];
  recommendations: string[];
  extractedSignals: unknown;
}

export default function IntakePage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<IntakeReport | null>(null);

  const onFileChange = (e: any) => {
    const f = e.target.files?.[0];

    // Nothing selected
    if (!f) {
      setFile(null);
      setReport(null);   // clear any old report
      return;
    }

    // Not a PDF -> reject, clear picker and report
    if (f.type !== "application/pdf") {
      setError("PDF files only. Please choose a .pdf.");
      e.target.value = "";  // clears the file picker
      setFile(null);
      setReport(null);      // clear old report
      return;
    }

    // Valid PDF -> clear errors & old report, store file
    setError(null);
    setReport(null);
    setFile(f);
  };  

  // Handle file selection in the browser
         // 🔹 NEW: clear old report

  // Call the /api/intake endpoint
  const onGenerate = async () => {
    if (!file) {
      setError("Please select a PDF first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/intake", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null as any);

      if (!res.ok || !data) {
        throw new Error(data?.error || `API error: ${res.status}`);
      }

      setReport(data.report);
    } catch (e: any) {
      setError(e?.message ?? "Something failed.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">File Intake Report</h1>
        <p className="mt-2 text-sm text-white/60">
          Upload a drawing set (PDF) to generate an intake report.
        </p>

        {/* Upload area */}
        <div className="mt-8">
          <label
            htmlFor="pdffile"
            className="inline-block cursor-pointer rounded-md border border-white/20 px-4 py-2 text-sm hover:border-white/40"
          >
            Choose PDF
          </label>
          <input
            id="pdffile"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onFileChange}
          />

          {/* Conditional area under the file picker */}
          {file ? (
            <>
              {/* Show selected file name */}
              <div className="mt-2 text-sm text-white/60">
                Selected:{" "}
                <span className="text-white/80">{file.name}</span>
              </div>

              {/* Only show this button when a file exists */}
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="mt-4 rounded-md border border-white/20 px-4 py-2 text-sm hover:border-white/40 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Report"}
              </button>

              {/* Show any error from the API */}
              {error && (
                <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}
            </>
          ) : (
            // Nothing selected yet – no button, just a hint
            <div className="mt-2 text-sm text-white/60">
              No file selected yet.
            </div>
          )}

          {/* If we have no file but still somehow get an error, show it here too */}
          {!file && error && (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Results section */}
        {report && (
          <div className="mt-10 rounded-lg border border-white/10 p-5">
            <h2 className="text-lg font-semibold">Results</h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-white/60">File</div>
                <div className="text-sm">{report.filename}</div>
              </div>

              <div>
                <div className="text-xs text-white/60">Size (KB)</div>
                <div className="text-sm">{report.fileSizeKB}</div>
              </div>

              <div>
                <div className="text-xs text-white/60">Text searchable</div>
                <div className="text-sm">
                  {report.textSearchable ? "Yes" : "No"}
                </div>
              </div>

              <div>
                <div className="text-xs text-white/60">Content type guess</div>
                <div className="text-sm">{report.contentTypeGuess}</div>
              </div>

              <div>
                <div className="text-xs text-white/60">Scale confidence</div>
                <div className="text-sm">
                  {(report.scaleConfidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-medium">Warnings</div>
                <ul className="mt-2 list-disc pl-5 text-sm text-white/70">
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-sm font-medium">Recommendations</div>
                <ul className="mt-2 list-disc pl-5 text-sm text-white/70">
                  {report.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 text-sm font-medium text-white/70">
                Extracted signals (debug view)
              </div>
              <pre className="max-h-64 overflow-auto rounded-md bg-white/5 p-3 text-xs text-white/70">
                {JSON.stringify(report.extractedSignals, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}