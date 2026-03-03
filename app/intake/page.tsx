"use client"

import React, { useCallback, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

type UiStage = "IDLE" | "UPLOADING" | "ANALYZING" | "READY" | "FAILED"

type UploadRow = {
  fileName: string
  fileSize: number
  uploadId?: string
  stage: UiStage
  message?: string
}

type IntakeReport = {
  uploadId?: string
  bytesAnalyzed?: number
  contentType?: string
  contentLength?: number
  isPdf?: boolean
  hasXref?: boolean
  pageCount?: number
  likelySearchable?: boolean
  likelyRasterHeavy?: boolean
  notes?: string[]
  // allow extra keys without breaking UI
  [key: string]: any
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function isPdf(file: File) {
  const byType = (file.type || "").toLowerCase() === "application/pdf"
  const byName = (file.name || "").toLowerCase().endsWith(".pdf")
  return byType || byName
}

/**
 * Presign responses can vary. We only require: uploadId + PUT url.
 */
function extractPresign(data: any): { uploadId: string; putUrl: string } {
  const uploadId =
    data?.uploadId ??
    data?.id ??
    data?.upload?.id ??
    data?.result?.uploadId ??
    data?.result?.id

  const putUrl =
    data?.putUrl ??
    data?.url ??
    data?.presignedUrl ??
    data?.signedUrl ??
    data?.uploadUrl ??
    data?.result?.putUrl ??
    data?.result?.url ??
    data?.result?.presignedUrl

  if (!uploadId || !putUrl) {
    throw new Error("Presign response missing uploadId and/or PUT URL.")
  }
  return { uploadId: String(uploadId), putUrl: String(putUrl) }
}

function extractAnalyzeReport(data: any): IntakeReport | null {
  const report =
    data?.report ??
    data?.intakeReport ??
    data?.result?.report ??
    data?.result?.intakeReport ??
    data?.upload?.report ??
    data?.upload?.intakeReport ??
    data?.upload?.intake ??
    data?.intake

  return (report ?? null) as IntakeReport | null
}

async function postJson<T = any>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })

  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.error || data.message)) ||
      (typeof data === "string" ? data : null) ||
      `Request failed (${res.status})`
    throw new Error(String(msg))
  }

  // Respect ok:false on 200
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(
      String(data.error || data.message || "Request failed (ok=false)")
    )
  }

  return data as T
}

function Badge({
  label,
  tone,
}: {
  label: string
  tone: "good" | "warn" | "bad" | "neutral"
}) {
  const cls =
    tone === "good"
      ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-200"
      : tone === "warn"
      ? "border-amber-800/60 bg-amber-950/35 text-amber-200"
      : tone === "bad"
      ? "border-rose-800/60 bg-rose-950/35 text-rose-200"
      : "border-zinc-700 bg-zinc-950/30 text-zinc-200"

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        cls,
      ].join(" ")}
    >
      {label}
    </span>
  )
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div
        className={[
          "mt-1 text-sm text-zinc-100",
          mono ? "font-mono text-xs" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  )
}

function scoreFromReport(r: IntakeReport) {
  // Simple, explainable heuristic (UI-only).
  let score = 50
  if (r.isPdf) score += 15
  if (r.hasXref) score += 10
  if (r.likelySearchable) score += 15
  if (r.likelyRasterHeavy === false) score += 10
  if (typeof r.pageCount === "number" && r.pageCount > 0) score += 5
  if (Array.isArray(r.notes) && r.notes.length > 0)
    score -= Math.min(20, r.notes.length * 5)

  score = Math.max(0, Math.min(100, score))

  let band: "GOOD" | "REVIEW" | "PROBLEM" = "REVIEW"
  if (score >= 80) band = "GOOD"
  else if (score < 55) band = "PROBLEM"

  return { score, band }
}

function Banner({ band }: { band: "GOOD" | "REVIEW" | "PROBLEM" }) {
  const map = {
    GOOD: {
      title: "File looks good",
      desc: "Searchable PDF detected. Low scan risk. Safe to proceed.",
      cls: "border-emerald-800/60 bg-emerald-950/35 text-emerald-100",
    },
    REVIEW: {
      title: "Proceed, but review flags",
      desc: "Some signals suggest extra caution (common with mixed scans).",
      cls: "border-amber-800/60 bg-amber-950/30 text-amber-100",
    },
    PROBLEM: {
      title: "File quality risk",
      desc: "High chance this file will cause measurement or scope misses.",
      cls: "border-rose-800/60 bg-rose-950/30 text-rose-100",
    },
  } as const

  const x = map[band]
  return (
    <div className={["rounded-2xl border px-4 py-4", x.cls].join(" ")}>
      <div className="text-sm font-semibold">{x.title}</div>
      <div className="mt-1 text-xs opacity-90">{x.desc}</div>
    </div>
  )
}

function ReportPanel({ report }: { report: IntakeReport }) {
  const { score, band } = scoreFromReport(report)

  const notes = Array.isArray(report.notes) ? report.notes : []
  const isSearchable = report.likelySearchable === true
  const isRasterHeavy = report.likelyRasterHeavy === true

  const searchLabel = isSearchable
    ? "Text-selectable (searchable)"
    : "Likely image-only (not searchable)"
  const rasterLabel = isRasterHeavy
    ? "Scan-heavy (image-based pages)"
    : "Not scan-heavy"
  const structLabel =
    report.hasXref === true
      ? "PDF structure OK"
      : report.hasXref === false
      ? "PDF structure questionable"
      : "PDF structure unknown"

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40">
      <div className="border-b border-zinc-800 px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">Intake report</div>
            <div className="mt-1 text-xs text-zinc-400">
              Quick-read file checks for estimating readiness.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              label={`Confidence: ${score}/100`}
              tone={band === "GOOD" ? "good" : band === "PROBLEM" ? "bad" : "warn"}
            />
            <Badge label={searchLabel} tone={isSearchable ? "good" : "warn"} />
            <Badge label={rasterLabel} tone={isRasterHeavy ? "warn" : "good"} />
            <Badge
              label={structLabel}
              tone={report.hasXref ? "good" : report.hasXref === false ? "warn" : "neutral"}
            />
          </div>
        </div>

        <div className="mt-4">
          <Banner band={band} />
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Stat label="Upload ID" value={report.uploadId ? report.uploadId : "—"} mono />
          <Stat label="Pages" value={typeof report.pageCount === "number" ? report.pageCount : "—"} />
          <Stat
            label="File size (reported)"
            value={typeof report.contentLength === "number" ? formatBytes(report.contentLength) : "—"}
          />
          <Stat
            label="Bytes analyzed"
            value={typeof report.bytesAnalyzed === "number" ? formatBytes(report.bytesAnalyzed) : "—"}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Stat label="Content type" value={report.contentType ? String(report.contentType) : "—"} mono />
          <Stat
            label="Next step"
            value={
              band === "GOOD"
                ? "Proceed to sheet review & scale verification."
                : band === "REVIEW"
                ? "Proceed, but check scan-heavy sheets before measuring."
                : "Stop and replace/improve the PDF before takeoff."
            }
          />
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
          <div className="text-sm font-medium text-zinc-200">Flags</div>
          {notes.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-400">None detected.</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {notes.map((n, idx) => (
                <li
                  key={idx}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/30">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-200">
            Raw JSON (debug)
          </summary>
          <pre className="max-h-[520px] overflow-auto px-4 pb-4 text-xs leading-relaxed text-zinc-100">
            {JSON.stringify(report, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}

export default function IntakePage() {
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const reportRef = useRef<HTMLDivElement | null>(null)

  // Pull projectId from URL (preferred): /intake?projectId=xxxx
  const qpProjectId = (searchParams?.get("projectId") || "").trim()
  const [projectId, setProjectId] = useState<string>(qpProjectId)

  const [dragOver, setDragOver] = useState(false)
  const [row, setRow] = useState<UploadRow | null>(null)
  const [report, setReport] = useState<IntakeReport | null>(null)

  const projectIdEffective = (qpProjectId || projectId || "").trim()
  const busy = !!row && (row.stage === "UPLOADING" || row.stage === "ANALYZING")

  const canInteract = useMemo(() => {
    return !busy && !!projectIdEffective
  }, [busy, projectIdEffective])

  // Auto-scroll to report when analysis completes
  React.useEffect(() => {
    if (row?.stage === "READY" && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [row?.stage])

  const resetAll = useCallback(() => {
    setRow(null)
    setReport(null)
    setDragOver(false)
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const runWorkflow = useCallback(
    async (file: File) => {
      const pid = projectIdEffective
      if (!pid) {
        setRow({
          fileName: file.name || "Selected file",
          fileSize: file.size || 0,
          stage: "FAILED",
          message: "Missing projectId. Use /intake?projectId=... or paste it above.",
        })
        setReport(null)
        return
      }

      if (!isPdf(file)) {
        setRow({
          fileName: file.name || "Selected file",
          fileSize: file.size || 0,
          stage: "FAILED",
          message: "PDF files only.",
        })
        setReport(null)
        return
      }

      setReport(null)
      setRow({
        fileName: file.name,
        fileSize: file.size,
        stage: "UPLOADING",
        message: "Uploading…",
      })

      try {
        // 1) Presign (project-scoped). Backend expects sizeBytes.
        const presignData = await postJson("/api/uploads/presign", {
          projectId: pid,
          filename: file.name,
          contentType: "application/pdf",
          sizeBytes: file.size,
        })
        const { uploadId, putUrl } = extractPresign(presignData)

        setRow((r) =>
          r ? { ...r, uploadId, stage: "UPLOADING", message: "Uploading…" } : null
        )

        // 2) PUT to R2
        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        })
        if (!putRes.ok) {
          throw new Error(`Upload to storage failed (${putRes.status}).`)
        }

        // 3) Complete
        await postJson("/api/uploads/complete", { uploadId, projectId: pid })

        // 4) Analyze
        setRow((r) =>
          r ? { ...r, uploadId, stage: "ANALYZING", message: "Analyzing…" } : null
        )

        const analyzeData = await postJson("/api/uploads/analyze", { uploadId, projectId: pid })
        const nextReport = extractAnalyzeReport(analyzeData)

        setRow((r) => (r ? { ...r, uploadId, stage: "READY", message: "Ready ✅" } : null))
        setReport(nextReport)
      } catch (e: any) {
        const msg = String(e?.message || e || "Failed.")
        setRow((r) =>
          r
            ? { ...r, stage: "FAILED", message: `Failed ❌  ${msg}` }
            : { fileName: "Upload", fileSize: 0, stage: "FAILED", message: `Failed ❌  ${msg}` }
        )
        setReport(null)
      }
    },
    [projectIdEffective]
  )

  const onPick = useCallback(
    (f: File | null | undefined) => {
      if (!f) return
      if (busy) return
      void runWorkflow(f)
    },
    [busy, runWorkflow]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!canInteract) return
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files || [])
      onPick(files[0])
    },
    [canInteract, onPick]
  )

  const openPicker = useCallback(() => {
    if (!canInteract) return
    inputRef.current?.click()
  }, [canInteract])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Intake</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload a PDF and run intake analysis automatically (project-scoped).
        </p>
      </div>

      {/* Project Id */}
      <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">Project</div>
            <div className="mt-1 text-xs text-zinc-400">
              Required. Use <span className="font-mono">/intake?projectId=...</span> or paste it below.
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-[520px] md:flex-row md:items-center md:justify-end">
            <input
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-70"
              placeholder="projectId"
              value={qpProjectId ? qpProjectId : projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!!qpProjectId || busy}
            />
            <div className="text-xs text-zinc-400 md:w-[160px] md:text-right">
              {projectIdEffective ? <span className="text-zinc-200">Set ✅</span> : "Missing"}
            </div>
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openPicker()
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!canInteract) return
          setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!canInteract) return
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
        }}
        onDrop={onDrop}
        className={[
          "relative rounded-2xl border p-8 transition",
          "bg-gradient-to-b from-[#071a2a] to-[#050f18]",
          "border-[#1f3a52]",
          dragOver ? "ring-2 ring-[#2b7bbb]" : "",
          canInteract ? "cursor-pointer" : "cursor-not-allowed opacity-70",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl [background-image:radial-gradient(circle_at_1px_1px,rgba(43,123,187,0.18)_1px,transparent_0)] [background-size:22px_22px] opacity-40" />

        <div className="relative flex flex-col items-center justify-center text-center">
          <div className="text-base font-medium text-zinc-100">
            {!projectIdEffective
              ? "Enter Project ID to enable uploads"
              : dragOver
              ? "Drop to upload"
              : "Drag & drop a PDF here"}
          </div>
          <div className="mt-1 text-sm text-zinc-300">
            or <span className="text-[#7cc5ff]">click to browse</span>
          </div>
          <div className="mt-4 text-xs text-zinc-400">
            PDF only. Upload → analyze runs automatically.
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

      {/* Upload Row */}
      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="text-sm font-medium text-zinc-200">Upload</div>
          <button
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
            onClick={resetAll}
            disabled={!row || busy}
          >
            Clear
          </button>
        </div>

        {!row ? (
          <div className="px-4 py-6 text-sm text-zinc-400">No file selected yet.</div>
        ) : (
          <div className="px-4 py-4">
            <div className="grid grid-cols-12 gap-3 text-sm">
              <div className="col-span-12 md:col-span-6">
                <div className="text-zinc-200">{row.fileName}</div>
                <div className="mt-1 text-xs text-zinc-400">{formatBytes(row.fileSize)}</div>
              </div>

              <div className="col-span-12 md:col-span-3">
                <div className="text-xs text-zinc-400">Upload ID</div>
                <div className="mt-1 font-mono text-xs text-zinc-200">{row.uploadId ?? "—"}</div>
              </div>

              <div className="col-span-12 md:col-span-3">
                <div className="text-xs text-zinc-400">Status</div>
                <div className="mt-1 text-zinc-200">{row.message ?? row.stage}</div>
              </div>
            </div>

            {row.stage === "FAILED" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
                  onClick={openPicker}
                  disabled={!canInteract}
                >
                  Try another PDF
                </button>
                <div className="text-xs text-zinc-400">Fix the message above, then retry.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Intake Report */}
      <div ref={reportRef} className="mt-6">
        {!row ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            Upload a PDF to generate the intake report.
          </div>
        ) : row.stage === "ANALYZING" ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            Analyzing…
          </div>
        ) : report ? (
          <ReportPanel report={report} />
        ) : row.stage === "READY" ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            READY, but no report payload was returned.
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            Upload a PDF to generate the intake report.
          </div>
        )}
      </div>
    </div>
  )
}