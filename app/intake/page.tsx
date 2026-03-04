"use client"

import React, { useEffect, useMemo, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

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
  [key: string]: any
}

type UploadPayload = {
  id: string
  projectId: string
  kind: string
  filename: string
  sizeBytes: number
  mimeType: string
  status: string
  createdAt: string
  updatedAt: string
  pageCount: number | null
  isSearchable: boolean | null
  isRasterOnly: boolean | null
  intakeReport: any
  intakeStatus: "PENDING" | "READY" | "FAILED"
  intakeError: string | null
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
              tone={
                band === "GOOD" ? "good" : band === "PROBLEM" ? "bad" : "warn"
              }
            />
            <Badge label={searchLabel} tone={isSearchable ? "good" : "warn"} />
            <Badge label={rasterLabel} tone={isRasterHeavy ? "warn" : "good"} />
            <Badge
              label={structLabel}
              tone={
                report.hasXref
                  ? "good"
                  : report.hasXref === false
                  ? "warn"
                  : "neutral"
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <Banner band={band} />
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Upload ID"
            value={report.uploadId ? report.uploadId : "—"}
            mono
          />
          <Stat
            label="Pages"
            value={typeof report.pageCount === "number" ? report.pageCount : "—"}
          />
          <Stat
            label="File size (reported)"
            value={
              typeof report.contentLength === "number"
                ? formatBytes(report.contentLength)
                : "—"
            }
          />
          <Stat
            label="Bytes analyzed"
            value={
              typeof report.bytesAnalyzed === "number"
                ? formatBytes(report.bytesAnalyzed)
                : "—"
            }
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Stat
            label="Content type"
            value={report.contentType ? String(report.contentType) : "—"}
            mono
          />
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

function IntakeInner() {
  const searchParams = useSearchParams()
  const uploadId = (searchParams?.get("uploadId") || "").trim()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upload, setUpload] = useState<UploadPayload | null>(null)

  const reportRef = useRef<HTMLDivElement | null>(null)

  const report: IntakeReport | null = useMemo(() => {
    if (!upload?.intakeReport) return null
    const r = (upload.intakeReport || {}) as IntakeReport
    return { uploadId: upload.id, ...r }
  }, [upload])

  async function load() {
    if (!uploadId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(uploadId)}`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to fetch upload (${res.status})`)
      }
      setUpload(data.upload as UploadPayload)
      setTimeout(
        () =>
          reportRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0
      )
    } catch (e: any) {
      setUpload(null)
      setError(String(e?.message || e || "Failed to load intake"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intake</h1>
          <p className="mt-1 text-sm text-zinc-400">
            View-only intake report for an uploaded file.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/projects"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Projects Dashboard
          </Link>

          <button
            type="button"
            onClick={load}
            disabled={!uploadId || loading}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {!uploadId && (
        <div className="rounded-2xl border border-rose-800/60 bg-rose-950/30 px-4 py-4 text-rose-100">
          <div className="text-sm font-semibold">Missing uploadId</div>
          <div className="mt-1 text-xs opacity-90">
            Open intake from a project upload row so the URL includes{" "}
            <span className="font-mono">?uploadId=...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-800/60 bg-rose-950/30 px-4 py-4 text-rose-100">
          <div className="text-sm font-semibold">Could not load intake</div>
          <div className="mt-1 text-xs opacity-90">{error}</div>
        </div>
      )}

      {upload && (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-200 truncate">
                {upload.filename}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {upload.kind} • {formatBytes(upload.sizeBytes)} • {upload.mimeType}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                label={`Intake: ${upload.intakeStatus}`}
                tone={
                  upload.intakeStatus === "READY"
                    ? "good"
                    : upload.intakeStatus === "FAILED"
                    ? "bad"
                    : "warn"
                }
              />
              <Badge label={`Pages: ${upload.pageCount ?? "—"}`} tone="neutral" />
            </div>
          </div>

          {upload.intakeStatus === "FAILED" && (
            <div className="mt-3 rounded-xl border border-rose-800/60 bg-rose-950/25 px-3 py-2 text-xs text-rose-100">
              {upload.intakeError
                ? upload.intakeError
                : "Intake failed with no error message."}
            </div>
          )}
        </div>
      )}

      <div ref={reportRef} className="mt-6">
        {loading && !upload && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            Loading…
          </div>
        )}

        {upload && upload.intakeStatus !== "READY" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            Intake status is{" "}
            <span className="font-semibold">{upload.intakeStatus}</span>. Report
            will appear when READY.
          </div>
        )}

        {upload && upload.intakeStatus === "READY" && report && (
          <ReportPanel report={report} />
        )}

        {upload && upload.intakeStatus === "READY" && !report && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            READY, but no intakeReport was stored on this upload.
          </div>
        )}
      </div>
    </div>
  )
}

export default function IntakePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
            Loading intake…
          </div>
        </div>
      }
    >
      <IntakeInner />
    </Suspense>
  )
}