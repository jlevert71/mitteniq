// app/projects/page.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

type Project = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  _count?: { uploads: number }
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

async function deleteJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" })
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getJson<{ ok: true; projects: Project[] }>("/api/projects")
      setProjects(data.projects ?? [])
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to load projects"))
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setCreateError(null)
    setNewName("")
    setCreateOpen(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function closeCreate() {
    if (creating) return
    setCreateOpen(false)
  }

  async function createProject() {
    setCreating(true)
    setCreateError(null)
    setError(null)

    try {
      await postJson<{ ok: true; project: Project }>("/api/projects", {
        name: newName.trim() || undefined,
      })
      setCreateOpen(false)
      setNewName("")
      await load()
    } catch (e: any) {
      setCreateError(String(e?.message || e || "Failed to create project"))
    } finally {
      setCreating(false)
    }
  }

  function openDelete(p: Project) {
    setDeleteError(null)
    setDeleteTarget(p)
    setDeleteOpen(true)
  }

  function closeDelete() {
    if (deleting) return
    setDeleteOpen(false)
    setDeleteTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    setError(null)

    try {
      await deleteJson<{ ok: true }>(`/api/projects/${deleteTarget.id}`)
      setDeleteOpen(false)
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      setDeleteError(String(e?.message || e || "Failed to delete project"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects Dashboard</h1>
          <div className="mt-1 text-sm opacity-60">
            Create a project, upload bid docs, and view intake reports.
          </div>
        </div>

        <button
          onClick={openCreate}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          Create Project
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <div className="font-medium">Error</div>
          <div className="mt-1 opacity-90">{error}</div>
          <div className="mt-3 text-sm">
            If this says <span className="font-mono">UNAUTHENTICATED</span>, go to{" "}
            <Link href="/login" className="text-blue-400 hover:underline">
              /login
            </Link>{" "}
            and log in again.
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm opacity-70">
            Loading…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <div className="font-medium">No projects yet.</div>
            <div className="mt-2 text-sm opacity-70">
              Click <span className="font-medium">Create Project</span> to start.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10"
              >
                <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="mt-1 text-sm opacity-70">{(p._count?.uploads ?? 0)} uploads</div>
                </Link>

                <button
                  type="button"
                  onClick={() => openDelete(p)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                  title="Delete project"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Create project"
          onKeyDown={(e) => {
            if (e.key === "Escape") closeCreate()
            if (e.key === "Enter" && !creating) createProject()
          }}
        >
          <div className="absolute inset-0 bg-black/70" onMouseDown={closeCreate} />
          <div className="relative mx-auto mt-28 w-full max-w-lg px-6">
            <div
              className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Create a project</div>
                  <div className="mt-1 text-sm text-white/60">
                    Name it now (or leave blank and we’ll auto-name it).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <div className="mt-5">
                <label className="mb-1 block text-xs text-white/60">Project name</label>
                <input
                  ref={nameInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder='e.g. "Downtown Library Renovation"'
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>

              {createError && (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                  {createError}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createProject}
                  disabled={creating}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create Project"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteOpen && deleteTarget && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Delete project"
          onKeyDown={(e) => {
            if (e.key === "Escape") closeDelete()
          }}
        >
          <div className="absolute inset-0 bg-black/70" onMouseDown={closeDelete} />
          <div className="relative mx-auto mt-28 w-full max-w-lg px-6">
            <div
              className="rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="text-lg font-semibold">Delete this project?</div>
              <div className="mt-2 text-sm text-white/70">
                This permanently removes the project and its uploads/intake data. This can’t be undone.
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                <div className="text-white/60">Project</div>
                <div className="mt-1 font-medium">{deleteTarget.name}</div>
              </div>

              {deleteError && (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                  {deleteError}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDelete}
                  disabled={deleting}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete project"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}