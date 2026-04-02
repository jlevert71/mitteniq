"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

type Project = { id: string; name: string }

type FnId = "document-intake-estimate-organization" | "rfq-generator"

type FnDef = {
  id: FnId
  title: string
  desc: string
  priceLabel: string
  status: "LIVE" | "COMING_SOON"
  purchasable: boolean
}

function storageKey(projectId: string) {
  return `miq:purchasedFunctions:${projectId}`
}

// Back-compat: legacy IDs count as purchased for Document Intake & Estimate Organization
function hasDocumentIntakePurchase(purchased: string[]) {
  return (
    purchased.includes("document-intake-estimate-organization") ||
    purchased.includes("intake-sheet-setup") ||
    purchased.includes("file-intake-analysis")
  )
}

function Badge({
  label,
  tone,
}: {
  label: string
  tone: "good" | "warn" | "neutral"
}) {
  const cls =
    tone === "good"
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-500/35 bg-amber-500/10 text-amber-200"
      : "border-white/10 bg-white/5 text-white/70"

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  )
}

function FunctionTile({
  fn,
  checked,
  disabled,
  purchased,
  onToggle,
}: {
  fn: FnDef
  checked: boolean
  disabled: boolean
  purchased: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{fn.title}</div>

            {purchased && <Badge label="Purchased" tone="good" />}
            {!purchased && fn.status === "COMING_SOON" && <Badge label="In development" tone="warn" />}
          </div>

          <div className="mt-2 text-xs text-white/65">{fn.desc}</div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-xs text-white/60">{fn.priceLabel}</div>

          <label className={`inline-flex items-center gap-2 text-xs ${disabled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={onToggle}
            />
            Select
          </label>
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-white/10 bg-black/20">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-white/80">
          Pricing details (coming later)
        </summary>
        <div className="px-3 pb-3 text-xs text-white/60">
          Placeholder. This will explain what drives cost (pages, complexity, time saved, etc.).
        </div>
      </details>
    </div>
  )
}

export default function EstimatingAssistantPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = String(params.projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [purchasedRaw, setPurchasedRaw] = useState<string[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  // AI interface (stub)
  const [chatInput, setChatInput] = useState("")
  const [chatLog, setChatLog] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: "This is the Estimating Assistant workspace. Purchase a function to unlock reports and actions." },
  ])

  const functions: FnDef[] = useMemo(
    () => [
      {
        id: "document-intake-estimate-organization",
        title: "Document Intake & Estimate Organization",
        desc:
          "Validates and processes uploaded PDFs — confirms file integrity, identifies page sizes and print counts, indexes spec sections by CSI division, and organizes drawings and specs into discipline folders sized for vendor and sub distribution.",
        priceLabel: "Price: $X.XX (TBD)",
        status: "LIVE",
        purchasable: true,
      },
      {
        id: "rfq-generator",
        title: "RFQ Generator",
        desc:
          "Extracts material and equipment requirements from spec sections to generate ready-to-send RFQ emails for subs and vendors — lighting, gear, switchgear schedules, and more.",
        priceLabel: "Price: $X.XX (TBD)",
        status: "COMING_SOON",
        purchasable: false,
      },
    ],
    []
  )

  function loadPurchased() {
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
    ;(async () => {
      const p = await fetch(`/api/projects/${projectId}`, { cache: "no-store" }).then((r) => r.json())
      if (p?.ok) setProject(p.project)
    })()

    loadPurchased()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const documentIntakePurchased = useMemo(() => hasDocumentIntakePurchase(purchasedRaw), [purchasedRaw])

  const selectableIds = useMemo(() => {
    // Only allow selecting purchasable LIVE functions that aren't already purchased
    return functions
      .filter((f) => f.purchasable)
      .filter((f) => {
        if (f.id === "document-intake-estimate-organization") return !documentIntakePurchased
        return !purchasedRaw.includes(f.id)
      })
      .map((f) => f.id)
  }, [functions, purchasedRaw, documentIntakePurchased])

  const anySelected = useMemo(() => selectableIds.some((id) => selected[id]), [selectableIds, selected])

  function toggleSelectAll() {
    const next: Record<string, boolean> = { ...selected }
    const allOn = selectableIds.every((id) => next[id] === true)
    for (const id of selectableIds) next[id] = !allOn
    setSelected(next)
  }

  function toggleOne(id: FnId) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function purchaseSelected() {
    const picked = selectableIds.filter((id) => selected[id])
    if (picked.length === 0) return

    const merged = Array.from(new Set([...(purchasedRaw ?? []), ...picked]))
    localStorage.setItem(storageKey(projectId), JSON.stringify(merged))
    setPurchasedRaw(merged)

    setSelected({})

    // return to project workspace (report hub)
    router.push(`/projects/${projectId}#agents`)
  }

  function sendChat() {
    const text = chatInput.trim()
    if (!text) return

    setChatLog((l) => [...l, { role: "user", text }])
    setChatInput("")

    setTimeout(() => {
      setChatLog((l) => [
        ...l,
        {
          role: "assistant",
          text:
            "Stubbed AI interface. Later this will route your request to purchased functions and return reports in the Project workspace.",
        },
      ])
    }, 150)
  }

  const hasAnyPurchase = purchasedRaw.length > 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Estimating Assistant</h1>
          <div className="mt-1 text-sm text-white/60">
            Project: <span className="text-white">{project ? project.name : "Loading…"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPurchased}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            title="Reload purchases stored locally for this project"
          >
            Refresh
          </button>

          <Link
            href={`/projects/${projectId}`}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Back to Project
          </Link>
        </div>
      </div>

      {/* AI interface (top) */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">AI interface</div>
            <div className="mt-1 text-xs text-white/60">
              Later this will execute purchased functions and push results to the Project report hub.
            </div>
          </div>

          {!hasAnyPurchase && <Badge label="Limited until first purchase" tone="warn" />}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="max-h-56 overflow-auto space-y-3 text-sm">
            {chatLog.map((m, idx) => (
              <div key={idx} className={m.role === "user" ? "text-white" : "text-white/80"}>
                <span className="text-white/40 text-xs mr-2">
                  {m.role === "user" ? "You" : "MittenIQ"}
                </span>
                {m.text}
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask something… (stub for now)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
            <button
              type="button"
              onClick={sendChat}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Function selection */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold">Functions</div>
            <div className="mt-1 text-xs text-white/60">
              Consolidated into meaningful purchases (no nickel-and-dime tile spam).
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={selectableIds.length === 0}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              Select all
            </button>

            <button
              type="button"
              onClick={purchaseSelected}
              disabled={!anySelected}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
            >
              Purchase selected
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          {functions.map((fn) => {
            const isPurchased =
              fn.id === "document-intake-estimate-organization"
                ? documentIntakePurchased
                : purchasedRaw.includes(fn.id)

            const isDisabled = isPurchased || !fn.purchasable

            return (
              <FunctionTile
                key={fn.id}
                fn={fn}
                purchased={isPurchased}
                disabled={isDisabled}
                checked={!!selected[fn.id]}
                onToggle={() => toggleOne(fn.id)}
              />
            )
          })}
        </div>
      </div>

      {/* Pricing methodology (bottom) */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-semibold">Pricing methodology</div>
        <div className="mt-2 text-sm text-white/70">
          Placeholder area. Later we’ll explain how MittenIQ prices each function (time saved vs. tool cost),
          and how the savings meter is calculated.
        </div>
      </div>
    </div>
  )
}