"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

type Project = {
  id: string
  name: string
}

type Upload = {
  id: string
  filename: string
  intakeStatus: "PENDING" | "READY" | "FAILED"
  pageCount: number | null
  createdAt: string
}

function StatusBadge({ status }: { status: Upload["intakeStatus"] }) {
  const base = "px-2 py-1 rounded-md text-xs font-medium border inline-block"

  if (status === "READY") {
    return (
      <span className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-400`}>
        READY
      </span>
    )
  }

  if (status === "FAILED") {
    return (
      <span className={`${base} border-red-500/40 bg-red-500/10 text-red-400`}>
        FAILED
      </span>
    )
  }

  return (
    <span className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-400`}>
      PENDING
    </span>
  )
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: "emerald" | "amber" | "red"
}) {
  const accentStyles =
    accent === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : accent === "amber"
      ? "border-amber-500/40 bg-amber-500/5"
      : accent === "red"
      ? "border-red-500/40 bg-red-500/5"
      : "border-white/10 bg-white/5"

  return (
    <div className={`rounded-xl border ${accentStyles} p-3`}>
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  )
}

function AgentTile({
  title,
  subtitle,
  href,
}: {
  title: string
  subtitle: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-white/60">{subtitle}</div>
        </div>

        <span className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/80 group-hover:border-white/20">
          Open →
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/60">
        Project-scoped agent workspace.
      </div>
    </Link>
  )
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = String(params.projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function loadProject() {
    const p = await fetch(`/api/projects/${projectId}`, { cache: "no-store" }).then((r) => r.json())
    if (p.ok) setProject(p.project)

    const u = await fetch(`/api/projects/${projectId}/uploads`, { cache: "no-store" }).then((r) => r.json())
    if (u.ok) setUploads(u.uploads)
  }

  useEffect(() => {
    loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const summary = useMemo(() => {
    const total = uploads.length
    const ready = uploads.filter((u) => u.intakeStatus === "READY").length
    const failed = uploads.filter((u) => u.intakeStatus === "FAILED").length
    const pending = uploads.filter((u) => u.intakeStatus === "PENDING").length
    return { total, ready, failed, pending }
  }, [uploads])

  async function handleFiles(files: FileList) {
    if (!files.length) return
    setBusy(true)

    for (const file of Array.from(files)) {
      try {
        // PRESIGN (creates Upload row with intakeStatus=PENDING)
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            filename: file.name,
            mimeType: file.type || "application/pdf",
            sizeBytes: file.size,
            kind: "DRAWING",
          }),
        })

        const presign = await presignRes.json()
        if (!presignRes.ok || !presign.ok) {
          continue
        }

        const uploadId = String(presign.upload.id)
        const uploadUrl = String(presign.presignedUrl)

        // refresh immediately so the new upload shows up as PENDING
        await loadProject()

        // PUT
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        })
        if (!putRes.ok) {
          await loadProject()
          continue
        }

        // COMPLETE
        const completeRes = await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        })
        if (!completeRes.ok) {
          await loadProject()
          continue
        }

        // ANALYZE
        const analyzeRes = await fetch("/api/uploads/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        })
        if (!analyzeRes.ok) {
          await loadProject()
          continue
        }

        // refresh again so READY flips in the list
        await loadProject()
      } catch {
        await loadProject()
      }
    }

    setBusy(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  const agentBase = `/projects/${projectId}/agents`

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {project ? project.name : "Loading…"}
          </h1>
          <div className="text-sm opacity-60 mt-1">Project workspace</div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/projects"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Projects Dashboard
          </Link>
        </div>
      </div>

      {/* Top grid: Agents + Upload */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agents */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Agents</div>
              <div className="mt-1 text-xs text-white/60">
                These live inside this project. Click an agent to open its workspace.
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AgentTile title="Estimating Assistant" subtitle="Intake + organization + spec workflows" href={`${agentBase}/estimating-assistant`} />
            <AgentTile title="Junior Estimator" subtitle="Early electrical quantities + checkpoints" href={`${agentBase}/junior-estimator`} />
            <AgentTile title="Senior Estimator" subtitle="Scope logic + refinement" href={`${agentBase}/senior-estimator`} />
            <AgentTile title="Chief Estimator" subtitle="Pricing/budget + executive outputs" href={`${agentBase}/chief-estimator`} />
          </div>
        </div>

        {/* Upload */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Upload drawings/specs</div>
              <div className="mt-1 text-xs text-white/60">
                Drag in PDFs or click to browse. Intake runs automatically.
              </div>
            </div>

            {busy && (
              <div className="text-xs text-blue-400 mt-1">
                Processing…
              </div>
            )}
          </div>

          {/* DROP BAY (more compact) */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={[
              "mt-4 cursor-pointer rounded-2xl border-2 p-8 text-center transition",
              dragActive ? "border-blue-500 bg-blue-500/5" : "border-white/10 bg-white/[0.03]",
            ].join(" ")}
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          >
            <div className="text-base font-medium">Drop PDFs here</div>
            <div className="text-xs opacity-60 mt-2">or click to browse</div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files)
              }}
            />
          </div>

          {/* SUMMARY (compact) */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Total" value={summary.total} />
            <SummaryCard label="Ready" value={summary.ready} accent="emerald" />
            <SummaryCard label="Pending" value={summary.pending} accent="amber" />
            <SummaryCard label="Failed" value={summary.failed} accent="red" />
          </div>
        </div>
      </div>

      {/* Upload List */}
      <div className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Uploads</div>
            <div className="mt-1 text-xs text-white/60">Open a file to view its intake report.</div>
          </div>
        </div>

        <div className="space-y-4">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.filename}</div>
                  <div className="text-sm opacity-60 mt-1">
                    Pages: {u.pageCount ?? "Unknown"}
                  </div>
                </div>

                <div className="text-right space-y-2 shrink-0">
                  <StatusBadge status={u.intakeStatus} />

                  <div className="flex flex-col items-end gap-1">
                    <Link
                      href={`/api/uploads/${u.id}/file`}
                      className="text-sm text-blue-400 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open PDF →
                    </Link>

                    <Link
                      href={`/intake?uploadId=${u.id}`}
                      className="text-sm text-blue-400 hover:underline"
                    >
                      Open Intake →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {uploads.length === 0 && (
            <div className="text-sm opacity-60">No uploads yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}