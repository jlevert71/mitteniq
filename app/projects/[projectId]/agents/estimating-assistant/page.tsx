"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

type Project = { id: string; name: string }

export default function EstimatingAssistantPage() {
  const params = useParams()
  const projectId = String(params.projectId)

  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    ;(async () => {
      const p = await fetch(`/api/projects/${projectId}`, { cache: "no-store" }).then((r) => r.json())
      if (p?.ok) setProject(p.project)
    })()
  }, [projectId])

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Estimating Assistant</h1>
          <div className="mt-1 text-sm text-white/60">
            Project: <span className="text-white">{project ? project.name : "Loading…"}</span>
          </div>
        </div>

        <Link
          href={`/projects/${projectId}`}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        >
          Back to Project
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="text-sm font-semibold">Placeholder</div>
        <div className="mt-2 text-sm text-white/70">
          This is the project-scoped workspace for the Estimating Assistant. Tool UI goes here next.
        </div>
      </div>
    </div>
  )
}