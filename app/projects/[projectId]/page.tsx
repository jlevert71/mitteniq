"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

type Project = {
  id: string
  name: string
}

type Upload = {
  id: string
  filename: string
  intakeStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED"
  intakeStage?: string | null
  intakeDelayReason?: string | null
  pageCount: number | null
}

function storageKey(projectId: string) {
  return `miq:purchasedFunctions:${projectId}`
}

// Back-compat: legacy IDs + canonical ID for Document Intake & Estimate Organization
function hasIntakeSheetSetup(purchased: string[]) {
  return (
    purchased.includes("document-intake-estimate-organization") ||
    purchased.includes("intake-sheet-setup") ||
    purchased.includes("file-intake-analysis")
  )
}

const FN_LABELS: Record<string, string> = {
  "document-intake-estimate-organization": "Document Intake & Estimate Organization",
  "intake-sheet-setup": "Document Intake & Estimate Organization",
  "file-intake-analysis": "Document Intake & Estimate Organization",
}

function StatusBadge({ status }: { status: Upload["intakeStatus"] }) {
  const base = "px-2 py-1 rounded-md text-[11px] font-medium border"

  if (status === "READY") {
    return <span className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-400`}>READY</span>
  }

  if (status === "FAILED") {
    return <span className={`${base} border-red-500/40 bg-red-500/10 text-red-400`}>FAILED</span>
  }

  if (status === "PROCESSING") {
    return <span className={`${base} border-blue-500/40 bg-blue-500/10 text-blue-300`}>PROCESSING</span>
  }

  return <span className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-400`}>PENDING</span>
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
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/10 transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-xs text-white/60 mt-1">{subtitle}</div>
        </div>

        <span className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs">
          Open →
        </span>
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

  const [purchasedRaw, setPurchasedRaw] = useState<string[]>([])
  const [showIntakeAccess, setShowIntakeAccess] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadProject = useCallback(async () => {
    const p = await fetch(`/api/projects/${projectId}`, { cache: "no-store" }).then((r) => r.json())
    if (p.ok) setProject(p.project)

    const u = await fetch(`/api/projects/${projectId}/uploads`, { cache: "no-store" }).then((r) => r.json())
    if (u.ok) setUploads(u.uploads)
  }, [projectId])

  function loadPurchasedFns() {
    try {
      const raw = localStorage.getItem(storageKey(projectId))
      const arr = raw ? JSON.parse(raw) : []
      if (Array.isArray(arr)) setPurchasedRaw(arr.map(String))
      else setPurchasedRaw([])
    } catch {
      setPurchasedRaw([])
    }
  }

  useEffect(() => {
    void loadProject()
    loadPurchasedFns()
  }, [projectId, loadProject])

  useEffect(() => {
    const hasProcessing = uploads.some((u) => u.intakeStatus === "PROCESSING")
    if (!hasProcessing) return

    const id = window.setInterval(() => {
      void loadProject()
    }, 3000)

    return () => window.clearInterval(id)
  }, [uploads, loadProject])

  const deleteUpload = useCallback(
    async (u: Upload) => {
      if (u.intakeStatus === "PROCESSING") {
        window.alert("Cannot delete upload while intake is processing.")
        return
      }
      if (
        !window.confirm(
          `Delete "${u.filename}"? This removes the upload and its intake data. This cannot be undone.`
        )
      ) {
        return
      }
      try {
        const res = await fetch(`/api/uploads/${encodeURIComponent(u.id)}`, { method: "DELETE" })
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (res.status === 409) {
          window.alert(
            data?.error ?? "Cannot delete upload while intake is processing."
          )
          return
        }
        if (!res.ok || !data?.ok) {
          window.alert(data?.error ?? "Delete failed.")
          return
        }
        await loadProject()
      } catch {
        window.alert("Delete failed.")
      }
    },
    [loadProject]
  )

  async function handleFiles(files: FileList) {
    if (!files.length) return
    setBusy(true)

    for (const file of Array.from(files)) {
      try {
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
        if (!presignRes.ok || !presign.ok) continue

        const uploadId = String(presign.upload.id)
        const uploadUrl = String(presign.presignedUrl)

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        })
        if (!putRes.ok) continue

        await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        })

        await fetch("/api/uploads/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        })

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

  const readyUploads = useMemo(() => uploads.filter((u) => u.intakeStatus === "READY"), [uploads])
  const hasCombined = useMemo(() => hasIntakeSheetSetup(purchasedRaw), [purchasedRaw])

  // Compact efficiency strip placeholders
  const savings = {
    timeSavedHours: "0.0h",
    manualCost: "$0",
    mittenCost: "$0",
    savings: "$0",
    note: "(tracking starts after first purchase)",
  }

  const agentBase = `/projects/${projectId}/agents`

  // Normalize purchased list for display (don’t show both old + new as separate cards)
  const displayPurchased = useMemo(() => {
    const set = new Set(purchasedRaw)
    if (hasCombined) {
      set.delete("file-intake-analysis")
      set.delete("intake-sheet-setup")
      set.add("document-intake-estimate-organization")
    }
    return Array.from(set)
  }, [purchasedRaw, hasCombined])

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* HEADER */}
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-semibold">{project ? project.name : "Loading…"}</h1>
          <div className="text-sm opacity-60 mt-1">Project workspace</div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/50">Project efficiency:</span>

            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
              Time saved <span className="font-semibold">{savings.timeSavedHours}</span>
            </span>

            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
              Manual cost <span className="font-semibold">{savings.manualCost}</span>
            </span>

            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
              MittenIQ cost <span className="font-semibold">{savings.mittenCost}</span>
            </span>

            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-emerald-200">
              Savings <span className="font-semibold">{savings.savings}</span>
            </span>

            <span className="text-white/40">{savings.note}</span>
          </div>
        </div>

        <Link
          href="/projects"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        >
          Projects Dashboard
        </Link>
      </div>

      {/* AGENTS STRIP */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold">Agents</div>
        <div className="text-xs text-white/60 mt-1">Open an agent workspace to purchase functions and run tasks.</div>

        <div className="grid md:grid-cols-4 gap-4 mt-4">
          <AgentTile title="Estimating Assistant" subtitle="Intake + sheet setup + organization" href={`${agentBase}/estimating-assistant`} />
          <AgentTile title="Junior Estimator" subtitle="Early electrical quantities" href={`${agentBase}/junior-estimator`} />
          <AgentTile title="Senior Estimator" subtitle="Scope logic + refinement" href={`${agentBase}/senior-estimator`} />
          <AgentTile title="Chief Estimator" subtitle="Pricing + executive outputs" href={`${agentBase}/chief-estimator`} />
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        {/* PURCHASED FUNCTIONS (REPORT HUB) */}
        <div id="agents" className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex justify-between items-start gap-4">
            <div>
              <div className="text-sm font-semibold">Purchased functions</div>
              <div className="text-xs text-white/60 mt-1">Report hub for purchased tasks.</div>
            </div>

            <button
              onClick={loadPurchasedFns}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
            >
              Refresh purchases
            </button>
          </div>

          {displayPurchased.length === 0 ? (
            <div className="mt-4 text-sm text-white/60">No purchased functions yet.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {displayPurchased.map((id) => (
                <div key={id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="text-sm font-semibold">{FN_LABELS[id] ?? id}</div>
                      <div className="text-xs text-white/60 mt-1">Reports available here.</div>
                    </div>

                    {id === "document-intake-estimate-organization" && (
                      <button
                        onClick={() => setShowIntakeAccess((v) => !v)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                      >
                        {showIntakeAccess ? "Hide reports" : "View intake reports"}
                      </button>
                    )}
                  </div>

                  {id === "document-intake-estimate-organization" && showIntakeAccess && (
                    <div className="mt-4 space-y-2">
                      {readyUploads.length === 0 ? (
                        <div className="text-sm text-white/60">No READY uploads yet.</div>
                      ) : (
                        readyUploads.map((u) => (
                          <div
                            key={u.id}
                            className="flex justify-between items-center border border-white/10 rounded-lg px-3 py-2"
                          >
                            <div className="text-sm truncate">{u.filename}</div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Link
                                href={`/projects/${projectId}/intake?uploadId=${u.id}`}
                                className="text-xs border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10"
                              >
                                Open intake →
                              </Link>

                              <Link
                                href={`/api/uploads/${u.id}/file`}
                                className="text-xs border border-white/10 rounded-lg px-3 py-2 hover:bg-white/10"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open PDF →
                              </Link>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* UPLOAD PANEL */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Upload drawings/specs</div>
              <div className="text-xs text-white/60 mt-1">Drop PDFs to begin intake processing.</div>
            </div>
            {busy && <div className="text-xs text-blue-400 mt-1">Processing…</div>}
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`mt-4 p-10 text-center border-2 rounded-2xl cursor-pointer transition ${
              dragActive ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/[0.03]"
            }`}
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          >
            <div className="text-base font-medium">Drop PDFs here</div>
            <div className="text-xs opacity-60 mt-2">or click to browse</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files)
            }}
          />

          <div className="mt-4">
            <div className="text-sm font-semibold">Uploads</div>
            <div className="text-xs text-white/60 mt-1">Status only here. Reports live in Purchased functions.</div>

            <div className="mt-3 space-y-2">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="flex justify-between items-center border border-white/10 rounded-lg px-3 py-2 bg-white/5"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="text-sm truncate">{u.filename}</div>
                    {u.intakeStatus === "PROCESSING" && u.intakeStage && (
                      <div className="text-[11px] text-blue-300/80 mt-0.5">Stage: {u.intakeStage}</div>
                    )}
                    {u.intakeStatus === "PROCESSING" && u.intakeDelayReason && (
                      <div className="text-[11px] text-white/45 mt-0.5 leading-snug">{u.intakeDelayReason}</div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <StatusBadge status={u.intakeStatus} />
                    <button
                      type="button"
                      disabled={u.intakeStatus === "PROCESSING"}
                      onClick={() => void deleteUpload(u)}
                      className="text-red-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Delete"
                      aria-label="Delete upload"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {uploads.length === 0 && <div className="text-sm opacity-60">No uploads yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}