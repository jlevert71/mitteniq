// app/projects/[projectId]/intake/IntakeClient.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

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
  intakeStatus: "PENDING" | "READY" | "FAILED"
  intakeError: string | null
  intakeReport: IntakeReport | null
  pageCount: number | null
  createdAt: string
  updatedAt: string
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
  const [report, setReport] = useState<IntakeReport | null>(null)
  const [statusLine, setStatusLine] = useState("Loading…")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setReport(u.intakeReport ?? null)
        setStatusLine("Ready ✅")
        setLoading(false)
        return
      }

      // If upload not fully completed, don't hammer analyze (it will 409)
      if (u.status !== "UPLOADED") {
        setReport(null)
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
      setMeta(analyze.upload ?? u)
      setReport((analyze.report ?? null) as IntakeReport | null)
      setStatusLine("Ready ✅")
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
            <Badge label={`Pages: ${meta?.pageCount ?? "—"}`} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm opacity-90">
          {loading ? "Loading…" : statusLine}
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

        {!report ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            No report available yet.
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-white/90">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}