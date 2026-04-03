// app/projects/[projectId]/intake/IntakeClient.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import PreBidChecklist from "@/components/agents/PreBidChecklist"

type IntakeReport = {
  uploadId?: string
  bytesAnalyzed?: number
  contentType?: string | null
  contentLength?: number | null
  isPdf?: boolean
  hasXref?: boolean
  pageCount?: number | null
  likelySearchable?: boolean
  likelyRasterHeavy?: boolean
  notes?: string[]
  [key: string]: any
}

type UploadMeta = {
  id: string
  projectId: string
  filename: string
  status: "PENDING" | "UPLOADED" | "FAILED"
  intakeStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED"
  intakeStage?: string | null
  intakeDelayReason?: string | null
  intakeError: string | null
  intakeReport: IntakeReport | null
  pageCount: number | null
  createdAt: string
  updatedAt: string
}

type IntakeV2TocEntry = {
  sectionNumber: string
  sectionTitle: string
  documentPageRef: string | null
  pdfPageNumber: number | null
  csiDivision: number | null
  source: "front-end" | "technical"
}

type IntakeV2TocPayload = {
  ok: boolean
  error?: string
  entries: IntakeV2TocEntry[]
  frontEndEntriesFound: number
  technicalEntriesFound: number
  resolvedCount: number
  durationMs: number
}

type IntakeV2PageSizeRow = {
  widthIn: number
  heightIn: number
  label: "Specifications" | "Drawings"
  count: number
}

type IntakeV2ClientPayload = {
  ok: boolean
  error?: string
  pageCount: number
  pageSizes: IntakeV2PageSizeRow[]
  toc: IntakeV2TocPayload
}

const CSI_DIVISION_NAMES: Record<number, string> = {
  0: "Bidding and Contracting Requirements",
  1: "General Requirements",
  2: "Existing Conditions",
  3: "Concrete",
  4: "Masonry",
  5: "Metals",
  6: "Wood/Plastics/Composites",
  7: "Thermal and Moisture",
  8: "Openings",
  9: "Finishes",
  10: "Specialties",
  11: "Equipment",
  12: "Furnishings",
  13: "Special Construction",
  14: "Conveying",
  21: "Fire Suppression",
  22: "Plumbing",
  23: "HVAC",
  26: "Electrical",
  27: "Communications",
  28: "Electronic Safety",
  31: "Earthwork",
  32: "Exterior Improvements",
  33: "Utilities",
  40: "Process Integration",
  43: "Process Gas Handling",
  44: "Pollution Control",
  46: "Water and Wastewater Equipment",
}

function emptyIntakeV2Toc(): IntakeV2TocPayload {
  return {
    ok: false,
    entries: [],
    frontEndEntriesFound: 0,
    technicalEntriesFound: 0,
    resolvedCount: 0,
    durationMs: 0,
  }
}

function normalizeIntakeV2Toc(raw: unknown): IntakeV2TocPayload {
  if (!raw || typeof raw !== "object") return emptyIntakeV2Toc()
  const o = raw as Record<string, unknown>
  const entries = Array.isArray(o.entries)
    ? (o.entries as unknown[]).map((e) => {
        if (!e || typeof e !== "object") return null
        const x = e as Record<string, unknown>
        return {
          sectionNumber: String(x.sectionNumber ?? ""),
          sectionTitle: String(x.sectionTitle ?? ""),
          documentPageRef:
            x.documentPageRef === null || typeof x.documentPageRef === "string"
              ? (x.documentPageRef as string | null)
              : null,
          pdfPageNumber:
            typeof x.pdfPageNumber === "number" && Number.isFinite(x.pdfPageNumber)
              ? x.pdfPageNumber
              : null,
          csiDivision:
            typeof x.csiDivision === "number" && Number.isFinite(x.csiDivision)
              ? x.csiDivision
              : null,
          source: x.source === "technical" ? "technical" : "front-end",
        } as IntakeV2TocEntry
      })
    : []
  return {
    ok: o.ok === true,
    error: typeof o.error === "string" ? o.error : undefined,
    entries: entries.filter(Boolean) as IntakeV2TocEntry[],
    frontEndEntriesFound: typeof o.frontEndEntriesFound === "number" ? o.frontEndEntriesFound : 0,
    technicalEntriesFound: typeof o.technicalEntriesFound === "number" ? o.technicalEntriesFound : 0,
    resolvedCount: typeof o.resolvedCount === "number" ? o.resolvedCount : 0,
    durationMs: typeof o.durationMs === "number" ? o.durationMs : 0,
  }
}

function buildIntakeV2ClientPayload(raw: Record<string, unknown>): IntakeV2ClientPayload {
  const pageSizesRaw = raw.pageSizes
  const pageSizes: IntakeV2PageSizeRow[] = Array.isArray(pageSizesRaw)
    ? pageSizesRaw
        .map((row) => {
          if (!row || typeof row !== "object") return null
          const r = row as Record<string, unknown>
          const widthIn = Number(r.widthIn)
          const heightIn = Number(r.heightIn)
          const count = Number(r.count)
          const label = r.label === "Specifications" ? "Specifications" : "Drawings"
          if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || !Number.isFinite(count)) return null
          return { widthIn, heightIn, label, count }
        })
        .filter(Boolean) as IntakeV2PageSizeRow[]
    : []
  return {
    ok: raw.ok === true,
    error: typeof raw.error === "string" ? raw.error : undefined,
    pageCount: typeof raw.pageCount === "number" && Number.isFinite(raw.pageCount) ? raw.pageCount : 0,
    pageSizes,
    toc: normalizeIntakeV2Toc(raw.toc),
  }
}

function divisionHeading(csi: number | null): string {
  if (csi === null) return "Division — Other"
  const name = CSI_DIVISION_NAMES[csi]
  if (name) return `Division ${csi} — ${name}`
  const xx = String(csi).padStart(2, "0")
  return `Division ${xx}`
}

function formatSizeInches(w: number, h: number): string {
  const fmt = (n: number) => n.toFixed(1)
  return `${fmt(w)}" × ${fmt(h)}"`
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
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
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(String(data.error || data.message || "Request failed (ok=false)"))
  }
  return data as T
}

async function postJson<T>(url: string, body: any): Promise<T> {
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
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(String(data.error || data.message || "Request failed (ok=false)"))
  }
  return data as T
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs opacity-90">
      {label}
    </span>
  )
}

export default function IntakeClient({ projectId, uploadId }: { projectId: string; uploadId: string }) {
  const router = useRouter()
  const backHref = useMemo(() => `/projects/${projectId}`, [projectId])

  const [meta, setMeta] = useState<UploadMeta | null>(null)
  const [statusLine, setStatusLine] = useState("Loading…")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intakeV2, setIntakeV2] = useState<IntakeV2ClientPayload | null>(null)
  const [intakeV2Loading, setIntakeV2Loading] = useState(false)
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(() => new Set())
  const [pdfViewer, setPdfViewer] = useState<{
    url: string
    page: number
    totalPages: number
  } | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)

  function toggleDivision(key: string) {
    setExpandedDivisions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function openAtPage(pdfPageNumber: number) {
    setPdfLoading(true)
    setPdfError(null)
    setPdfViewer(null)
    try {
      const res = await fetch(`/api/uploads/${uploadId}/file?page=${pdfPageNumber}`)
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        url?: string
        page?: number
      } | null
      if (!data?.ok || !data.url) {
        setPdfError("Could not load PDF.")
        setPdfLoading(false)
        return
      }
      setPdfViewer({ url: data.url, page: pdfPageNumber, totalPages: 0 })
    } catch {
      setPdfError("Could not load PDF.")
    } finally {
      setPdfLoading(false)
    }
  }

  async function hydrate() {
    setLoading(true)
    setError(null)
    setStatusLine("Loading upload…")

    try {
      const data = await getJson<{ ok: true; upload: UploadMeta }>(
        `/api/uploads/get?uploadId=${encodeURIComponent(uploadId)}`
      )

      const u = data.upload

      // Hard scope check: upload must belong to the project in the route
      if (u.projectId !== projectId) {
        router.replace(backHref)
        return
      }

      setMeta(u)

      if (u.intakeStatus === "READY") {
        setStatusLine("Ready ✅")
        setLoading(false)
        return
      }

      if (u.intakeStatus === "PROCESSING") {
        setStatusLine(
          u.intakeStage ? `Analyzing… (${u.intakeStage})` : "Analyzing…"
        )
        setLoading(false)
        return
      }

      // If upload not fully completed, don't hammer analyze (it will 409)
      if (u.status !== "UPLOADED") {
        setStatusLine(
          u.status === "PENDING"
            ? "Upload still processing. Go back and wait for READY."
            : "Upload failed."
        )
        setLoading(false)
        return
      }

      // UPLOADED but not READY — run analyze once (idempotent when READY later)
      setStatusLine("Analyzing…")
      const analyze = await postJson<any>("/api/uploads/analyze", { uploadId })
      setMeta({
        ...u,
        intakeStatus: "PROCESSING",
        intakeStage: "STARTING",
        intakeDelayReason: null,
      })
      setStatusLine("Analyzing…")
      setLoading(false)
    } catch (e: any) {
      setError(String(e?.message || e || "Failed"))
      setLoading(false)
    }
  }

  useEffect(() => {
    hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadId, projectId])

  useEffect(() => {
    setIntakeV2(null)
    setIntakeV2Loading(false)
  }, [uploadId])

  useEffect(() => {
    if (!meta || meta.id !== uploadId) return
    const ac = new AbortController()

    const v2cached = meta.intakeReport?.v2
    if (
      v2cached &&
      typeof v2cached === "object" &&
      v2cached !== null &&
      !Array.isArray(v2cached)
    ) {
      setIntakeV2Loading(true)
      setIntakeV2(buildIntakeV2ClientPayload(v2cached as Record<string, unknown>))
      setIntakeV2Loading(false)
      return
    }

    setIntakeV2Loading(true)
    setIntakeV2(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/intake-v2/test?uploadId=${encodeURIComponent(uploadId)}`,
          { cache: "no-store", signal: ac.signal }
        )
        const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (ac.signal.aborted) return
        if (!res.ok) {
          const errMsg =
            typeof raw.error === "string" ? raw.error : `Request failed (${res.status})`
          setIntakeV2({
            ok: false,
            error: errMsg,
            pageCount: 0,
            pageSizes: [],
            toc: { ...emptyIntakeV2Toc(), error: errMsg },
          })
          return
        }
        setIntakeV2(buildIntakeV2ClientPayload(raw))
        try {
          await fetch("/api/intake-v2/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId, result: raw }),
            signal: ac.signal,
          })
        } catch {
          /* persist best-effort */
        }
      } catch (e) {
        if (ac.signal.aborted) return
        const errMsg = e instanceof Error ? e.message : "Failed to load intake report"
        setIntakeV2({
          ok: false,
          error: errMsg,
          pageCount: 0,
          pageSizes: [],
          toc: { ...emptyIntakeV2Toc(), error: errMsg },
        })
      } finally {
        if (!ac.signal.aborted) setIntakeV2Loading(false)
      }
    })()
    return () => ac.abort()
  }, [meta, uploadId])

  useEffect(() => {
    if (!pdfViewer || !pdfCanvasRef.current) return
    let cancelled = false
    const canvas = pdfCanvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"

        const loadingTask = pdfjs.getDocument({ url: pdfViewer.url })
        const pdf = await loadingTask.promise
        if (cancelled) return

        if (pdfViewer.totalPages === 0) {
          setPdfViewer((prev) => (prev ? { ...prev, totalPages: pdf.numPages } : prev))
        }

        const pageNum = Math.max(1, Math.min(pdfViewer.page, pdf.numPages))
        const page = await pdf.getPage(pageNum)
        if (cancelled) return

        const viewport = page.getViewport({ scale: 1.5 })
        canvas.width = viewport.width
        canvas.height = viewport.height

        const renderTask = page.render({ canvasContext: ctx, canvas, viewport })
        await renderTask.promise
      } catch {
        if (!cancelled) setPdfError("Failed to render page.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdfViewer])

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm opacity-70">
            <Link href={backHref} className="hover:underline">
              ← Back to Project
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Intake</h1>
          <p className="mt-1 text-sm text-white/60">Analysis-only. Uploads happen on the Project page.</p>
          <div className="mt-2 text-xs opacity-60 font-mono break-all">uploadId: {uploadId}</div>
        </div>

        <button
          onClick={hydrate}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm opacity-70">File</div>
            <div className="mt-1 font-medium break-all">{meta?.filename ?? "—"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge label={`Upload: ${meta?.status ?? "—"}`} />
            <Badge label={`Intake: ${meta?.intakeStatus ?? "—"}`} />
            {meta?.intakeStage && <Badge label={`Stage: ${meta.intakeStage}`} />}
            <Badge label={`Pages: ${meta?.pageCount ?? "—"}`} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm opacity-90">
          {loading ? "Loading…" : statusLine}
          {!loading && meta?.intakeStatus === "PROCESSING" && meta.intakeDelayReason && (
            <div className="mt-2 text-xs text-white/50 leading-snug">{meta.intakeDelayReason}</div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <div className="font-medium">Error</div>
            <div className="mt-1 opacity-90">{error}</div>
          </div>
        )}

        {meta?.intakeStatus === "FAILED" && meta?.intakeError && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <div className="font-medium">Intake failed</div>
            <div className="mt-1 opacity-90">{meta.intakeError}</div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-medium">Intake Report</div>

        {intakeV2Loading || !intakeV2 ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            No report available yet.
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 space-y-6 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">File Health</div>
              {intakeV2.ok ? (
                <div className="mt-2 flex items-start gap-2 text-emerald-300/95">
                  <span className="shrink-0 font-medium" aria-hidden>
                    ✓
                  </span>
                  <span>File validated — PDF is readable and can be trusted.</span>
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-2 text-red-300/95">
                  <span className="shrink-0 font-medium" aria-hidden>
                    ✗
                  </span>
                  <span>
                    File could not be validated — {intakeV2.error ?? "Unknown error"}
                  </span>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Page Summary</div>
              <div className="mt-2 text-white/85">
                Total pages: <span className="font-medium text-white">{intakeV2.pageCount}</span>
              </div>
              {intakeV2.pageSizes.length === 0 ? (
                <div className="mt-2 text-white/55">Page size data not available.</div>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[320px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.04] text-white/55">
                        <th className="px-3 py-2 font-medium">Size</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium text-right">Pages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...intakeV2.pageSizes]
                        .sort((a, b) => b.count - a.count)
                        .map((row, i) => (
                          <tr key={i} className="border-b border-white/10 last:border-0 text-white/80">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatSizeInches(row.widthIn, row.heightIn)}
                            </td>
                            <td className="px-3 py-2">{row.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.count} {row.count === 1 ? "page" : "pages"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Specification Section Index
              </div>
              {!intakeV2.toc.ok ? (
                <div className="mt-2 text-amber-200/85">
                  Section index unavailable — {intakeV2.toc.error ?? "Unknown error"}
                </div>
              ) : intakeV2.toc.entries.length === 0 ? (
                <div className="mt-2 text-white/55">No table of contents found in this document.</div>
              ) : (
                <div className="mt-3 space-y-5">
                  {(() => {
                    const buckets = new Map<number | null, IntakeV2TocEntry[]>()
                    for (const e of intakeV2.toc.entries) {
                      const k = e.csiDivision
                      const list = buckets.get(k) ?? []
                      list.push(e)
                      buckets.set(k, list)
                    }
                    const keys = [...buckets.keys()].sort((a, b) => {
                      if (a === null) return 1
                      if (b === null) return -1
                      return a - b
                    })
                    return (
                      <>
                        <div className="flex justify-end mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              const allKeys = keys.map((div) => (div === null ? "other" : String(div)))
                              const allExpanded = allKeys.every((k) => expandedDivisions.has(k))
                              if (allExpanded) {
                                setExpandedDivisions(new Set())
                              } else {
                                setExpandedDivisions(new Set(allKeys))
                              }
                            }}
                            className="text-xs text-white/50 hover:text-white/80 border border-white/10 rounded-lg px-3 py-1"
                          >
                            {keys.every((div) =>
                              expandedDivisions.has(div === null ? "other" : String(div))
                            )
                              ? "Collapse All"
                              : "Expand All"}
                          </button>
                        </div>
                        {keys.map((div) => {
                          const divKey = div === null ? "other" : String(div)
                          const expanded = expandedDivisions.has(divKey)
                          return (
                            <div key={divKey}>
                              <button
                                type="button"
                                onClick={() => toggleDivision(divKey)}
                                className="w-full text-left text-sm font-semibold text-white border-b border-white/15 pb-1.5 mb-2 flex items-center gap-2 cursor-pointer hover:bg-white/[0.04] rounded-sm"
                              >
                                <span className="text-white/60 w-4 shrink-0 select-none" aria-hidden>
                                  {expanded ? "▼" : "▶"}
                                </span>
                                <span>{divisionHeading(div)}</span>
                              </button>
                              {expanded && (
                                <ul className="space-y-2">
                                  {(buckets.get(div) ?? []).map((e, idx) => (
                                    <li
                                      key={`${e.sectionNumber}-${idx}`}
                                      className="text-xs text-white/75 leading-snug"
                                    >
                                      {e.pdfPageNumber !== null && e.pdfPageNumber > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => void openAtPage(e.pdfPageNumber!)}
                                          className="font-medium text-sky-300 hover:text-sky-200 cursor-pointer bg-transparent border-0 p-0 text-left"
                                        >
                                          {e.sectionNumber}
                                        </button>
                                      ) : (
                                        <span className="font-medium text-white/90">{e.sectionNumber}</span>
                                      )}
                                      <span className="text-white/50"> — </span>
                                      <span>{e.sectionTitle}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {(pdfLoading || pdfError || pdfViewer) && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">PDF Viewer</div>
            <button
              type="button"
              onClick={() => {
                setPdfViewer(null)
                setPdfError(null)
                setPdfLoading(false)
              }}
              className="text-xs text-white/50 hover:text-white/80 border border-white/10 rounded-lg px-3 py-1"
            >
              Close
            </button>
          </div>

          {pdfLoading && <div className="text-sm text-white/50 p-4">Loading…</div>}

          {pdfError && <div className="text-sm text-red-300/90 p-4">{pdfError}</div>}

          {pdfViewer && !pdfLoading && !pdfError && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-white/60">
                <button
                  type="button"
                  disabled={pdfViewer.page <= 1}
                  onClick={() =>
                    setPdfViewer((prev) => (prev ? { ...prev, page: prev.page - 1 } : prev))
                  }
                  className="border border-white/10 rounded px-2 py-1 disabled:opacity-30 hover:bg-white/10"
                >
                  ← Prev
                </button>
                <span>
                  Page {pdfViewer.page}
                  {pdfViewer.totalPages > 0 ? ` of ${pdfViewer.totalPages}` : ""}
                </span>
                <button
                  type="button"
                  disabled={pdfViewer.totalPages > 0 && pdfViewer.page >= pdfViewer.totalPages}
                  onClick={() =>
                    setPdfViewer((prev) => (prev ? { ...prev, page: prev.page + 1 } : prev))
                  }
                  className="border border-white/10 rounded px-2 py-1 disabled:opacity-30 hover:bg-white/10"
                >
                  Next →
                </button>
              </div>
              <div className="overflow-auto rounded-lg border border-white/10 bg-black/30 max-h-[70vh]">
                <canvas ref={pdfCanvasRef} className="block mx-auto" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <PreBidChecklist uploadId={uploadId} />
      </div>
    </div>
  )
}