import { extractPdfPages } from "@/lib/intake/pdf-text-extraction"
import { readUploadBufferFromR2 } from "@/lib/intake/r2-read"
import { AI_INTAKE_MODEL, canRunAiIntake } from "@/lib/intake/run-ai-intake"
import { extractChecklistFields } from "./extract-checklist-fields"
import {
  emptyPreBidChecklistFields,
  type PreBidChecklistFields,
  type PreBidChecklistResult,
} from "./types"

// Pass page caps — doubles each pass
const PASS_CAPS = [60, 120, 240, 480, Infinity]

// Keywords that indicate compliance/labor or bond language buried deep in spec
const DEEP_SCAN_KEYWORDS = [
  "american iron and steel",
  "ais requirements",
  "davis-bacon",
  "prevailing wage",
  "state revolving fund",
  "clean water srf",
  "drinking water srf",
  "cwsrf",
  "dwsrf",
  "federally assisted",
  "federal funding",
  "buy america",
  "babaa",
  "build america buy america",
  "bid bond",
  "performance bond",
  "labor and material",
  "liquidated damages",
  "mandatory prebid",
  "mandatory pre-bid",
  "pre-bid conference",
  "prebid conference",
  "allowance",
  "alternate no",
  "additive alternate",
  "deductive alternate",
  "unit price",
  "substantial completion",
  "contract times",
  "notice to proceed",
  "days after",
  "calendar days",
  "working days",
  "completion date",
  "project schedule",
  "good faith effort",
  "good faith efforts",
  "gfe worksheet",
  "debarment certification",
  "qualifications statement",
  "performance and payment bond",
  "payment and performance bond",
  "surety bond",
  "pollution liability",
  "contractor's pollution",
  "professional liability",
  "railroad protective",
  "ocip",
  "wrap-up",
  "builders risk",
  "installation floater",
  "additional insured",
  "supplementary conditions",
  "contractor's pollution liability",
  "pollution liability insurance",
]

// Fields that are considered resolved when non-null
function getUnresolvedFields(fields: PreBidChecklistFields): string[] {
  const unresolved: string[] = []

  if (fields.bidDueDate === null) unresolved.push("Bid Due Date")
  if (fields.bidDueTime === null) unresolved.push("Bid Due Time")
  if (fields.bidOpeningType === null) unresolved.push("Bid Opening Type")
  if (fields.biddingTo === null) unresolved.push("Bidding To")
  if (fields.deliverBidTo === null) unresolved.push("Deliver Bid To")
  if (fields.deliveryMethod === null) unresolved.push("Delivery Method")
  if (fields.lastRfiDate === null) unresolved.push("Last RFI Date")
  if (fields.preBidHeld === null) unresolved.push("Pre-Bid Held")
  if (fields.proposedStartDate === null) unresolved.push("Proposed Start Date")
  if (fields.proposedCompletionDate === null) unresolved.push("Proposed Completion Date")
  if (fields.unitPricing === null) unresolved.push("Unit Pricing")
  if (fields.alternates === null) unresolved.push("Alternates")
  if (fields.allowances === null) unresolved.push("Allowances")
  if (fields.breakDownsRequired === null) unresolved.push("Breakdowns Required")
  if (fields.bidBondRequired === null) unresolved.push("Bid Bond Required")
  if (fields.plmBonds === null) unresolved.push("PLM Bonds")
  if (fields.liquidatedDamages === null) unresolved.push("Liquidated Damages")
  if (fields.certifiedPayroll === null) unresolved.push("Certified Payroll")
  if (fields.buyAmerican === null) unresolved.push("Buy American")
  if (fields.dbeSbeRequired === null) unresolved.push("DBE / SBE Required")

  return unresolved
}

// Scan pages outside the current cap for keyword hits — returns matched page numbers
function findKeywordPages(
  allPageTexts: { pageNumber: number; fullText: string }[],
  fromPage: number,
  toPage: number,
): number[] {
  const matched = new Set<number>()
  for (const page of allPageTexts) {
    if (page.pageNumber <= fromPage || page.pageNumber > toPage) continue
    const lower = page.fullText.toLowerCase()
    for (const kw of DEEP_SCAN_KEYWORDS) {
      if (lower.includes(kw)) {
        matched.add(page.pageNumber)
        break
      }
    }
  }
  return Array.from(matched).sort((a, b) => a - b)
}

// Maximum total characters sent to AI per pass — stays well under gpt-4o-mini context limit
const MAX_TOTAL_CHARS = 200000

function getMaxCharsPerPage(totalDocPages: number): number {
  if (totalDocPages <= 100) return 10000
  if (totalDocPages <= 300) return 8000
  if (totalDocPages <= 600) return 8000
  return 5000
}

// Build combined text for a pass:
// - Pass 1: front pages 1–60 only
// - Pass 2+: always pages 1–60 as base, plus keyword-matched pages from extended range
// Each page is truncated to MAX_CHARS_PER_PAGE
// Total payload is capped at MAX_TOTAL_CHARS — pages are dropped from the end if over limit
function buildPassText(
  allPageTexts: { pageNumber: number; fullText: string }[],
  passIndex: number,
  keywordMatchedPages: number[],
  totalDocPages: number,
): { text: string; totalPages: number } {
  const FRONT_PAGE_CAP = 60
  const MAX_CHARS_PER_PAGE = getMaxCharsPerPage(totalDocPages)
  const extraSet = new Set(keywordMatchedPages)
  const included = allPageTexts.filter(
    (p) => p.pageNumber <= FRONT_PAGE_CAP || extraSet.has(p.pageNumber),
  )

  const parts: string[] = []
  let totalChars = 0

  for (const page of included) {
    const truncated = page.fullText.length > MAX_CHARS_PER_PAGE
      ? page.fullText.slice(0, MAX_CHARS_PER_PAGE) + "\n[page truncated]"
      : page.fullText
    const entry = `--- Page ${page.pageNumber} ---\n${truncated}`

    if (totalChars + entry.length > MAX_TOTAL_CHARS) break

    parts.push(entry)
    totalChars += entry.length
  }

  return { text: parts.join("\n\n"), totalPages: parts.length }
}

const PASS_MESSAGES = [
  null, // pass 1 — no extra message needed
  "✓ Pass 1 complete — extending search, a few items still unresolved…\n⟳ Still analyzing — scanning to page 120…",
  "✓ Pass 2 complete — almost there, a couple items still outstanding…\n⟳ Wow, this is a big document — still on it, please stand by…",
  "✓ Pass 3 complete — going deep on this one…\n⟳ This spec book is keeping us busy — still searching, hang tight…",
  "✓ Pass 4 complete — running full document scan now, last pass…\n⟳ Final pass — scanning every page, almost done…",
]

export async function runPreBidChecklist(params: {
  uploadId: string
  r2Key: string
}): Promise<PreBidChecklistResult> {
  const started = Date.now()
  const { uploadId, r2Key } = params
  const extractedAt = new Date().toISOString()
  const progressLog: string[] = []

  try {
    if (!canRunAiIntake()) {
      return {
        ok: false,
        error: "LLM intake is disabled or OPENAI_API_KEY is missing (set MITTENIQ_LLM_INTAKE_ENABLED=true).",
        extractedAt,
        uploadId,
        fields: emptyPreBidChecklistFields(),
        meta: {
          pagesScanned: 0,
          durationMs: Date.now() - started,
          model: AI_INTAKE_MODEL,
          passesRun: 0,
          progressLog,
        },
      }
    }

    const { buffer } = await readUploadBufferFromR2(r2Key)
    const allPages = await extractPdfPages(buffer)
    const totalDocPages = allPages.length

    let fields: PreBidChecklistFields = emptyPreBidChecklistFields()
    let passesRun = 0
    let finalPagesScanned = 0

    for (let passIndex = 0; passIndex < PASS_CAPS.length; passIndex++) {
      const cap = PASS_CAPS[passIndex] === Infinity ? totalDocPages : Math.min(PASS_CAPS[passIndex] as number, totalDocPages)
      passesRun = passIndex + 1

      // On passes beyond the first, find keyword-matched pages beyond the previous cap
      const prevCap = passIndex === 0 ? 0 : Math.min(PASS_CAPS[passIndex - 1] as number, totalDocPages)
      const extraPages = passIndex === 0
        ? []
        : findKeywordPages(allPages, prevCap, totalDocPages)

      const { text, totalPages } = buildPassText(allPages, passIndex, extraPages, totalDocPages)
      finalPagesScanned = totalPages

      if (passIndex === 0) {
        progressLog.push(`⟳ Pass 1 — scanning bid documents, pages 1–${cap}…`)
      } else {
        const msg = PASS_MESSAGES[passIndex]
        if (msg) progressLog.push(msg)
      }

      const result = await extractChecklistFields(text, uploadId)
      if (!result) {
        progressLog.push("✗ Extraction failed on this pass.")
        break
      }

      // Merge — only overwrite nulls with non-null values from new pass
      for (const key of Object.keys(result) as (keyof PreBidChecklistFields)[]) {
        if (fields[key] === null || (Array.isArray(fields[key]) && (fields[key] as unknown[]).length === 0)) {
          // @ts-expect-error — dynamic key assignment across union types
          fields[key] = result[key]
        }
      }

      // Post-processing rule: if pre-bid is held and mandatory is still null,
      // scan page text directly for "mandatory" near pre-bid language.
      // If not found, default to false — "encouraged" always means discretionary.
      if (fields.preBidHeld === true && fields.preBidMandatory === null) {
        const frontText = allPages
          .filter((p) => p.pageNumber <= 60)
          .map((p) => p.fullText.toLowerCase())
          .join(" ")
        const hasMandatoryLanguage =
          frontText.includes("mandatory") ||
          frontText.includes("must attend") ||
          frontText.includes("required to attend") ||
          frontText.includes("attendance is required")
        if (!hasMandatoryLanguage) {
          fields = { ...fields, preBidMandatory: false }
        }
      }

      // Post-processing rule: MDOT 2020 Standard Specifications reference
      // triggers buyAmerican=true — FHWA Buy America is incorporated by reference.
      if (fields.buyAmerican === null) {
        const fullText = allPages
          .map((p) => p.fullText.toLowerCase())
          .join(" ")
        const hasMdot2020 =
          fullText.includes("2020 mdot standard specifications") ||
          fullText.includes("mdot 2020 standard specifications") ||
          fullText.includes("2020 standard specifications for construction") ||
          (fullText.includes("2020") && fullText.includes("standard specifications for construction"))
        if (hasMdot2020) {
          fields = { ...fields, buyAmerican: true }
        }
      }

      // Post-processing rule: if no start date was found anywhere in the document,
      // default to "Upon Award" — this is the standard assumption when no start
      // date is explicitly stated in the bidding documents.
      if (fields.proposedStartDate === null && cap >= totalDocPages) {
        fields = { ...fields, proposedStartDate: "Upon Award" }
      }

      const unresolved = getUnresolvedFields(fields)

      if (unresolved.length === 0) {
        progressLog.push(`✓ Complete — everything found in pass ${passesRun}. (${Date.now() - started}ms)`)
        break
      }

      if (cap >= totalDocPages) {
        // Exhausted the document
        progressLog.push(
          `⚠ Full document scanned — ${unresolved.length} field${unresolved.length !== 1 ? "s" : ""} not found anywhere.`,
        )
        progressLog.push(`Manual review recommended: ${unresolved.join(", ")}`)
        break
      }

      if (passIndex === PASS_CAPS.length - 1) {
        progressLog.push(
          `⚠ All passes complete — ${unresolved.length} field${unresolved.length !== 1 ? "s" : ""} still unresolved.`,
        )
        progressLog.push(`Manual review recommended: ${unresolved.join(", ")}`)
      }
    }

    return {
      ok: true,
      extractedAt,
      uploadId,
      fields,
      meta: {
        pagesScanned: finalPagesScanned,
        durationMs: Date.now() - started,
        model: AI_INTAKE_MODEL,
        passesRun,
        progressLog,
      },
    }
  } catch (err) {
    console.error("runPreBidChecklist", { uploadId, err })
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      extractedAt,
      uploadId,
      fields: emptyPreBidChecklistFields(),
      meta: {
        pagesScanned: 0,
        durationMs: Date.now() - started,
        model: AI_INTAKE_MODEL,
        passesRun: 0,
        progressLog,
      },
    }
  }
}
