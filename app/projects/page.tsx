// app/projects/page.tsx
"use client"

import { useEffect, useState } from "react"
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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

  async function createProject() {
    setCreating(true)
    setError(null)
    try {
      await postJson<{ ok: true; project: Project }>("/api/projects", {})
      await load()
    } catch (e: any) {
      setError(String(e?.message || e || "Failed to create project"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Projects</h1>

        <button
          onClick={createProject}
          disabled={creating}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
        >
          {creating ? "Creating…" : "Create Project"}
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
              Click <span className="font-medium">Create Project</span> to generate your first project.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10"
              >
                <div className="font-medium">{p.name}</div>
                <div className="mt-1 text-sm opacity-70">
                  {(p._count?.uploads ?? 0)} uploads
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}