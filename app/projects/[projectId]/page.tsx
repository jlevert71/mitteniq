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
      <span
        className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-400`}
      >
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
    <span
      className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-400`}
    >
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
    <div className={`rounded-xl border ${accentStyles} p-4`}>
      <div className="text-sm opacity-60">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
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
    const p = await fetch(`/api/projects/${projectId}`, {
      cache: "no-store",
    }).then((r) => r.json())
    if (p.ok) setProject(p.project)

    const u = await fetch(`/api/projects/${projectId}/uploads`, {
      cache: "no-store",
    }).then((r) => r.json())
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

        // ✅ Refresh immediately so the new upload shows up as PENDING
        await loadProject()

        // PUT
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        })
        if (!putRes.ok) {
          // If PUT fails, leave it pending; later we can mark FAILED here if you want.
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

        // ✅ Refresh again so READY flips in the list
        await loadProject()
      } catch {
        // Silent per-file failure (we keep UI simple).
        // Later we can add a "last error" toast without clutter.
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {project ? project.name : "Loading…"}
        </h1>
        <div className="text-sm opacity-60 mt-1">Blueprint Intake Control</div>
      </div>

      {/* DROP BAY */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mb-10 cursor-pointer rounded-2xl border-2 
        ${
          dragActive
            ? "border-blue-500 bg-blue-500/5"
            : "border-white/10 bg-white/[0.03]"
        }
        p-12 text-center transition`}
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <div className="text-lg font-medium">Drop Drawings or Specs Here</div>
        <div className="text-sm opacity-60 mt-2">
          Drag files here or click to browse. Intake runs automatically.
        </div>

        {busy && (
          <div className="text-sm mt-4 text-blue-400">Processing files…</div>
        )}

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

      {/* SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <SummaryCard label="Total" value={summary.total} />
        <SummaryCard label="Ready" value={summary.ready} accent="emerald" />
        <SummaryCard label="Pending" value={summary.pending} accent="amber" />
        <SummaryCard label="Failed" value={summary.failed} accent="red" />
      </div>

      {/* UPLOAD LIST */}
      <div className="space-y-4">
        {uploads.map((u) => (
          <div
            key={u.id}
            className="rounded-xl border border-white/10 bg-white/5 p-5"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{u.filename}</div>
                <div className="text-sm opacity-60 mt-1">
                  Pages: {u.pageCount ?? "Unknown"}
                </div>
              </div>

              <div className="text-right space-y-2">
                <StatusBadge status={u.intakeStatus} />
                <Link
  href={`/projects/${projectId}/intake?uploadId=${u.id}`}
  className="text-sm text-blue-400 hover:underline"
>
  Open Intake →
</Link>
              </div>
            </div>
          </div>
        ))}

        {uploads.length === 0 && (
          <div className="text-sm opacity-60">No uploads yet.</div>
        )}
      </div>
    </div>
  )
}