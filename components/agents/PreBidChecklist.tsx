"use client"

import { useCallback, useEffect, useState } from "react"
import {
  emptyPreBidChecklistFields,
  type PreBidChecklistFields,
  type PreBidChecklistResult,
} from "@/lib/agents/pre-bid-checklist/types"

type Props = {
  uploadId: string
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-white border-b border-white/15 pb-2">
      {children}
    </h3>
  )
}

function FieldRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-start sm:gap-4 py-2 border-b border-white/10">
      <div className="text-xs text-white/55 uppercase tracking-wide pt-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function PaperInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-transparent border-0 border-b border-dashed border-white/25 px-0 py-1 text-sm text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none focus:ring-0 ${props.className ?? ""}`}
    />
  )
}

function Answer({ value }: { value: string | null }) {
  if (!value) return <span className="text-sm text-white/35 italic">Not found in document</span>
  return <span className="text-sm text-white">{value}</span>
}

function YesNo({ value, alertMessage }: { value: boolean | null; alertMessage?: string }) {
  if (value === true) {
    return <span className="text-sm font-medium text-emerald-400">YES</span>
  }
  if (value === false) {
    return <span className="text-sm font-medium text-red-400">NO</span>
  }
  return <span className="text-sm text-white/35 italic">Not found in document</span>
}

function Alert({ message }: { message: string }) {
  return (
    <div className="mt-1 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <span className="text-amber-400 mt-0.5">⚠</span>
      <span className="text-xs text-amber-200">{message}</span>
    </div>
  )
}

function StaticNote({ message }: { message: string }) {
  return (
    <div className="mt-1 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
      <span className="text-xs text-blue-200/70">{message}</span>
    </div>
  )
}

function ProgressLog({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  const expanded = lines.flatMap((line) => line.split("\n"))
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 space-y-1">
      {expanded.map((line, i) => (
        <div key={i} className="text-xs text-white/60 font-mono">{line}</div>
      ))}
    </div>
  )
}

export default function PreBidChecklist({ uploadId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<PreBidChecklistResult["meta"] | null>(null)
  const [fields, setFields] = useState<PreBidChecklistFields | null>(null)
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [savedChecklistLoadedOnOpen, setSavedChecklistLoadedOnOpen] = useState(false)
  const [hasCompletedScan, setHasCompletedScan] = useState(false)

  const addProgress = useCallback((line: string) => {
    setProgressLines((prev) => [...prev, line])
  }, [])

  const loadSaved = useCallback(async () => {
    if (!uploadId) {
      setLoadingSaved(false)
      return
    }
    setSavedChecklistLoadedOnOpen(false)
    setHasCompletedScan(false)
    try {
      const res = await fetch(`/api/agents/pre-bid-checklist?uploadId=${encodeURIComponent(uploadId)}`)
      const data = await res.json() as { ok: boolean; checklist: Record<string, unknown> | null }
      if (data.ok && data.checklist) {
        setSavedChecklistLoadedOnOpen(true)
        const c = data.checklist
        setFields({
          projectName: (c.projectName as string | null) ?? null,
          bidDueDate: (c.bidDueDate as string | null) ?? null,
          bidDueTime: (c.bidDueTime as string | null) ?? null,
          bidOpeningType: (c.bidOpeningType as string | null) ?? null,
          biddingTo: (c.biddingTo as string | null) ?? null,
          deliverBidTo: (c.deliverBidTo as string | null) ?? null,
          deliveryMethod: (c.deliveryMethod as string | null) ?? null,
          numberOfCopies: (c.numberOfCopies as number | null) ?? null,
          documentsAvailableAt: (c.documentsAvailableAt as string | null) ?? null,
          lastRfiDate: (c.lastRfiDate as string | null) ?? null,
          preBidHeld: (c.preBidHeld as boolean | null) ?? null,
          preBidMandatory: (c.preBidMandatory as boolean | null) ?? null,
          preBidMandatoryScope: (c.preBidMandatoryScope as "primes_only" | "primes_and_subs" | null) ?? null,
          preBidDate: (c.preBidDate as string | null) ?? null,
          preBidTime: (c.preBidTime as string | null) ?? null,
          preBidLocation: (c.preBidLocation as string | null) ?? null,
          proposedStartDate: (c.proposedStartDate as string | null) ?? null,
          proposedCompletionDate: (c.proposedCompletionDate as string | null) ?? null,
          unitPricing: (c.unitPricing as boolean | null) ?? null,
          alternates: (c.alternates as boolean | null) ?? null,
          alternatesCount: (c.alternatesCount as number | null) ?? null,
          alternatesDescription: (c.alternatesDescription as string | null) ?? null,
          allowances: (c.allowances as boolean | null) ?? null,
          allowanceItems: Array.isArray(c.allowanceItems)
            ? (c.allowanceItems as { description: string; amount: string }[]).map((item) => ({
                description: item.description,
                amount: item.amount,
              }))
            : [],
          breakDownsRequired: (c.breakDownsRequired as boolean | null) ?? null,
          bidBondRequired: (c.bidBondRequired as boolean | null) ?? null,
          bidBondAmount: (c.bidBondAmount as string | null) ?? null,
          plmBonds: (c.plmBonds as boolean | null) ?? null,
          liquidatedDamages: (c.liquidatedDamages as boolean | null) ?? null,
          liquidatedDamagesAmount: (c.liquidatedDamagesAmount as string | null) ?? null,
          obligee: (c.obligee as string | null) ?? null,
          specialInsuranceRequired: (c.specialInsuranceRequired as boolean | null) ?? null,
          specialInsuranceType: (c.specialInsuranceType as string | null) ?? null,
          certifiedPayroll: (c.certifiedPayroll as boolean | null) ?? null,
          buyAmerican: (c.buyAmerican as boolean | null) ?? null,
          dbeSbeRequired: (c.dbeSbeRequired as boolean | null) ?? null,
          dbeSbeGoalPercent: (c.dbeSbeGoalPercent as string | null) ?? null,
        })
        setProgressLines(["✓ Loaded saved checklist."])
      }
    } catch (e) {
      console.error("loadSaved", e)
    } finally {
      setLoadingSaved(false)
    }
  }, [uploadId])

  useEffect(() => {
    void loadSaved()
  }, [loadSaved])

  const updateField = useCallback(<K extends keyof PreBidChecklistFields>(
    key: K,
    v: PreBidChecklistFields[K]
  ) => {
    setFields((prev) => {
      const base = prev ?? emptyPreBidChecklistFields()
      return { ...base, [key]: v }
    })
  }, [])

  const runScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setProgressLines([])
    setFields(null)
    setMeta(null)

    addProgress("⟳ Pass 1 — scanning bid documents, pages 1–60…")

    try {
      const res = await fetch("/api/agents/pre-bid-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      })
      const data = (await res.json()) as PreBidChecklistResult & { error?: string }

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`)
        return
      }

      if (data.meta) {
        setMeta(data.meta)
        if (data.meta.progressLog && data.meta.progressLog.length > 0) {
          setProgressLines(data.meta.progressLog)
        }
      }

      setFields(data.fields)

      if (!data.ok && data.error) {
        setError(data.error)
      } else {
        setHasCompletedScan(true)
      }
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Request failed")
      addProgress("✗ Scan failed — see error message above.")
    } finally {
      setLoading(false)
    }
  }, [uploadId, addProgress])

  const f = fields ?? emptyPreBidChecklistFields()
  const hasRun = fields !== null

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Pre-Bid Checklist</div>
          <div className="text-xs text-white/50 mt-0.5">
            Bid summary extracted from spec book front-end documents.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={loading || loadingSaved || !uploadId}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-40"
          >
            {loading
              ? "Scanning…"
              : loadingSaved
                ? "Loading…"
                : savedChecklistLoadedOnOpen || hasCompletedScan
                  ? "Re-run Pre-Bid Checklist"
                  : "Run Pre-Bid Checklist"}
          </button>

          {hasRun && !loading && (
            <span className="text-xs text-emerald-400 font-medium">✓ Saved</span>
          )}
        </div>
      </div>

      {/* PROGRESS LOG */}
      <ProgressLog lines={progressLines} />

      {/* ERROR */}
      {error && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          {error}
        </div>
      )}

      {/* META */}
      {meta && (
        <div className="mt-3 text-[11px] text-white/40 font-mono">
          Pages scanned: {meta.pagesScanned} · {meta.durationMs}ms · {meta.model} · {meta.passesRun} pass{meta.passesRun !== 1 ? "es" : ""}
        </div>
      )}

      {/* RESULTS */}
      {hasRun && (
        <div className="mt-6 space-y-1">

          {/* SECTION 1 — PROJECT & BID IDENTITY */}
          <SectionTitle>Project &amp; Bid Identity</SectionTitle>

          <FieldRow label="Project name">
            <PaperInput
              value={f.projectName ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("projectName", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Bid due date">
            <PaperInput
              value={f.bidDueDate ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("bidDueDate", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Bid due time">
            <PaperInput
              value={f.bidDueTime ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("bidDueTime", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Bid opening">
            <Answer value={f.bidOpeningType} />
          </FieldRow>

          <FieldRow label="Bidding to">
            <PaperInput
              value={f.biddingTo ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("biddingTo", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Deliver bid to">
            <PaperInput
              value={f.deliverBidTo ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("deliverBidTo", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Delivery method">
            <PaperInput
              value={f.deliveryMethod ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("deliveryMethod", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="# of copies">
            <PaperInput
              type="number"
              min="1"
              value={f.numberOfCopies ?? 1}
              onChange={(e) => {
                const t = e.target.value
                const n = Math.round(Number(t))
                updateField("numberOfCopies", n >= 1 ? n : 1)
              }}
            />
          </FieldRow>

          <FieldRow label="Documents available at">
            <PaperInput
              value={f.documentsAvailableAt ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("documentsAvailableAt", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Last RFI date">
            <PaperInput
              value={f.lastRfiDate ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("lastRfiDate", e.target.value.trim() || null)}
            />
          </FieldRow>

          {/* SECTION 2 — PRE-BID MEETING */}
          <SectionTitle>Pre-Bid Meeting</SectionTitle>

          <FieldRow label="Pre-bid held">
            <YesNo value={f.preBidHeld} />
            {f.preBidHeld === true && (
              <StaticNote message="Attending the pre-bid meeting is always recommended — even when not mandatory. It's the best opportunity to ask questions, meet the owner or GC, and get a feel for the project scope before committing to a number." />
            )}
          </FieldRow>

          {f.preBidHeld === true && (
            <>
              <FieldRow label="Mandatory">
                <YesNo value={f.preBidMandatory} />
                {f.preBidMandatory === null && (
                  <Alert message="Pre-bid is scheduled but mandatory attendance was not stated — verify with project documents." />
                )}
              </FieldRow>

              {f.preBidMandatory === true && (
                <FieldRow label="Mandatory for">
                  {f.preBidMandatoryScope === "primes_and_subs" ? (
                    <span className="text-sm text-white">Primes &amp; Subcontractors</span>
                  ) : f.preBidMandatoryScope === "primes_only" ? (
                    <span className="text-sm text-white">Prime bidders only</span>
                  ) : (
                    <Alert message="Mandatory attendance required but scope (primes only vs. primes and subs) was not stated — verify before bid day." />
                  )}
                </FieldRow>
              )}

              <FieldRow label="Pre-bid date">
                <PaperInput
                  value={f.preBidDate ?? ""}
                  placeholder="Not found in document"
                  onChange={(e) => updateField("preBidDate", e.target.value.trim() || null)}
                />
                {f.preBidDate === null && f.preBidHeld === true && (
                  <Alert message="Pre-bid is scheduled but the date was not found — manual review required." />
                )}
              </FieldRow>

              <FieldRow label="Pre-bid time">
                <PaperInput
                  value={f.preBidTime ?? ""}
                  placeholder="Not found in document"
                  onChange={(e) => updateField("preBidTime", e.target.value.trim() || null)}
                />
              </FieldRow>

              <FieldRow label="Pre-bid location">
                <PaperInput
                  value={f.preBidLocation ?? ""}
                  placeholder="Not found in document"
                  onChange={(e) => updateField("preBidLocation", e.target.value.trim() || null)}
                />
                {f.preBidLocation === null && f.preBidHeld === true && (
                  <Alert message="Pre-bid is scheduled but the location was not found — manual review required." />
                )}
              </FieldRow>
            </>
          )}

          {/* SECTION 3 — SCHEDULE */}
          <SectionTitle>Schedule</SectionTitle>

          <FieldRow label="Proposed start">
            <PaperInput
              value={f.proposedStartDate ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("proposedStartDate", e.target.value.trim() || null)}
            />
          </FieldRow>

          <FieldRow label="Proposed completion">
            <div className="space-y-0.5">
              {(f.proposedCompletionDate ?? "").split("\n").filter(Boolean).map((line, i) => (
                <div key={i} className="text-sm text-white">{line}</div>
              ))}
              {!f.proposedCompletionDate && (
                <span className="text-sm text-white/35 italic">Not found in document</span>
              )}
            </div>
          </FieldRow>

          {/* SECTION 4 — BID PRICING FORMAT */}
          <SectionTitle>Bid Pricing Format</SectionTitle>

          <FieldRow label="Unit pricing required">
            <YesNo value={f.unitPricing} />
          </FieldRow>

          <FieldRow label="Alternates">
            <YesNo value={f.alternates} />
            {f.alternates === true && f.alternatesCount !== null && (
              <div className="mt-1 text-xs text-white/60">Count: {f.alternatesCount}</div>
            )}
            {f.alternates === true && f.alternatesDescription && (
              <div className="mt-1 text-xs text-white/60">{f.alternatesDescription}</div>
            )}
            {f.alternates === true && f.alternatesCount === null && (
              <Alert message="Alternates are required but the count was not found — review bid form." />
            )}
          </FieldRow>

          <FieldRow label="Allowances">
            <YesNo value={f.allowances} />
            {f.allowances === true && f.allowanceItems.length === 0 && (
              <Alert message="Allowances are required but no details were found — manual review required." />
            )}
            {f.allowanceItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {f.allowanceItems.map((item, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-xs text-white/85">{item.description}</div>
                    <div className="text-xs text-white/50 mt-0.5">Amount: {item.amount}</div>
                  </div>
                ))}
              </div>
            )}
          </FieldRow>

          <FieldRow label="Breakdowns required">
            <YesNo value={f.breakDownsRequired} />
          </FieldRow>

          {/* SECTION 5 — BONDS & INSURANCE */}
          <SectionTitle>Bonds &amp; Insurance</SectionTitle>

          <FieldRow label="Bid bond required">
            <YesNo value={f.bidBondRequired} />
            {f.bidBondRequired === true && f.bidBondAmount === null && (
              <Alert message="Bid bond is required but the amount or percentage was not found — manual review required." />
            )}
          </FieldRow>

          {f.bidBondRequired === true && (
            <FieldRow label="Bid bond amount">
              <PaperInput
                value={f.bidBondAmount ?? ""}
                placeholder="Not found in document"
                onChange={(e) => updateField("bidBondAmount", e.target.value.trim() || null)}
              />
            </FieldRow>
          )}

          <FieldRow label="PLM bonds">
            <YesNo value={f.plmBonds} />
            {f.plmBonds === true && (
              <StaticNote message="Required of prime contractor. If prime requires sub bonds, add 3% to proposal." />
            )}
          </FieldRow>

          <FieldRow label="Obligee">
            <PaperInput
              value={f.obligee ?? ""}
              placeholder="Not found in document"
              onChange={(e) => updateField("obligee", e.target.value.trim() || null)}
            />
            {f.bidBondRequired === true && f.obligee === null && f.biddingTo !== null && (
              <Alert message={`Obligee not explicitly stated — in most cases the obligee is the Owner. Likely: ${f.biddingTo}. Verify with bonding documents before submitting bond application.`} />
            )}
            {f.bidBondRequired === true && f.obligee === null && f.biddingTo === null && (
              <Alert message="Bid bond is required but the obligee was not found — needed for bond application." />
            )}
          </FieldRow>

          <FieldRow label="Liquidated damages">
            <YesNo value={f.liquidatedDamages} />
            {f.liquidatedDamages === true && f.liquidatedDamagesAmount === null && (
              <Alert message="Liquidated damages apply but the amount or formula was not found — manual review required." />
            )}
          </FieldRow>

          {f.liquidatedDamages === true && (
            <FieldRow label="LD amount / terms">
              <PaperInput
                value={f.liquidatedDamagesAmount ?? ""}
                placeholder="Not found in document"
                onChange={(e) => updateField("liquidatedDamagesAmount", e.target.value.trim() || null)}
              />
            </FieldRow>
          )}

          <FieldRow label="Special insurance">
            <YesNo value={f.specialInsuranceRequired} />
            {f.specialInsuranceRequired === true && f.specialInsuranceType === null && (
              <Alert message="Special insurance is required but the type was not found — manual review required." />
            )}
          </FieldRow>

          {f.specialInsuranceRequired === true && (
            <FieldRow label="Insurance type">
              <Answer value={f.specialInsuranceType} />
            </FieldRow>
          )}

          {/* SECTION 6 — COMPLIANCE & LABOR */}
          <SectionTitle>Compliance &amp; Labor</SectionTitle>

          <FieldRow label="Certified payroll">
            <YesNo value={f.certifiedPayroll} />
            {f.certifiedPayroll === true && (
              <StaticNote message="Davis-Bacon or prevailing wage applies. Certified payroll records required throughout project." />
            )}
          </FieldRow>

          <FieldRow label="Buy American">
            <YesNo value={f.buyAmerican} />
            {f.buyAmerican === true && (
              <StaticNote message="AIS or Buy American requirements apply. All iron and steel products must be domestically produced unless a waiver is approved." />
            )}
          </FieldRow>

          <FieldRow label="DBE / SBE required">
            <YesNo value={f.dbeSbeRequired} />
            {f.dbeSbeRequired === true && f.dbeSbeGoalPercent && (
              <div className="mt-1 text-sm text-white">
                Participation goal: <span className="font-medium text-emerald-400">{f.dbeSbeGoalPercent}</span>
              </div>
            )}
            {f.dbeSbeRequired === true && (
              <StaticNote message="Prime contractor must meet DBE/SBE participation goals. Be prepared to provide your DBE/SBE certification status — this can be a factor in sub selection." />
            )}
          </FieldRow>

        </div>
      )}
    </div>
  )
}
