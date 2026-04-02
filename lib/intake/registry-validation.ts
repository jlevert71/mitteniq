/**
 * Registry-led labeling and validation when front-of-file structure scan is credible.
 * Authority: front index/TOC → page signals → AI (fallback only when authority inactive).
 */

import { parseSheetCell, registryLogicalKeyForSheetId } from "./drawing-set-registry"
import type {
  FrontStructureDrawingEntry,
  FrontStructureScanResult,
} from "./front-structure-scan"
import type {
  IntakeDrawingIdentityHints,
  IntakeNormalizedPage,
  IntakePreparedPage,
  IntakeReviewStatus,
  IntakeRunResult,
} from "./types"

export const MIN_REGISTRY_AUTHORITY_CONFIDENCE = 0.52

/** Structured review / audit labels for drawing index vs page identity edge cases. */
export const DRAWING_IDENTITY_REASON_REPEATED_SHEET = "DRAWING_SHEET_NUMBER_REPEATED_ON_MULTIPLE_PAGES"
export const DRAWING_IDENTITY_REASON_SECONDARY = "DRAWING_SECONDARY_DUPLICATE_IDENTITY"
export const DRAWING_IDENTITY_REASON_CONFLICTS_INDEX = "DRAWING_IDENTITY_CONFLICTS_WITH_INDEX"
export const DRAWING_IDENTITY_REASON_REVIEW = "DRAWING_PAGE_IDENTITY_CONFLICT_REVIEW_REQUIRED"
export const DRAWING_IDENTITY_REASON_PRIMARY_OWNER = "DRAWING_PRIMARY_REGISTRY_OWNER"
export const DRAWING_IDENTITY_REASON_WEAK_HINT = "DRAWING_IDENTITY_HINT_WEAKLY_CONTRADICTS_SEQUENCE"

export type RegistryAuthorityKind = "NONE" | "DRAWING_INDEX" | "SPEC_TOC"

export type RegistryValidationStatus =
  | "MATCHED_TO_REGISTRY"
  | "BLANK_PAGE"
  | "NOT_IN_REGISTRY"
  | "DUPLICATE_REGISTRY_MATCH"
  | "MISSING_EXPECTED_ENTRY"
  | "REVIEW_REQUIRED"
  | "SKIPPED_NO_AUTHORITY"

export type RegistryPageValidation = {
  pageNumber: number
  status: RegistryValidationStatus
  registryKey: string | null
  matchedEntryIndex: number | null
  notes: string[]
}

export type RegistryValidationSummary = {
  registryFound: boolean
  registryType: RegistryAuthorityKind
  totalEntries: number
  matchedPages: number
  blankPages: number
  unmatchedPages: number
  duplicateMatches: number
  missingEntries: number
  reviewRequiredPages: number
}

export type RegistryValidationResult = {
  authorityActive: boolean
  authorityKind: RegistryAuthorityKind
  reasonInactive: string | null
  documentAddendumLabel: string | null
  frontStructureConfidence: number
  totalEntries: number
  perPage: RegistryPageValidation[]
  summary: RegistryValidationSummary
}

function mergeEvidence(ev: string | null, msg: string): string {
  const e = ev?.trim()
  if (!e) return msg
  return `${e} Registry authority: ${msg}`
}

export function normalizeCsiSection(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const cleaned = raw.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()
  const digits = cleaned.replace(/\D/g, "")
  if (digits.length === 6) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`
  }
  const m = cleaned.match(/\b(\d{2})\s+(\d{2})\s+(\d{2})\b/)
  if (m) return `${m[1]} ${m[2]} ${m[3]}`
  return null
}

function isFastBlankBypass(page: IntakePreparedPage | undefined): boolean {
  const c = page?.fastBlank?.classification
  return c === "TRUE_BLANK" || c === "INTENTIONAL_BLANK"
}

function drawingSheetCandidates(
  prepared: IntakePreparedPage | undefined,
  final: IntakeNormalizedPage["final"],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string | null | undefined) => {
    const t = s?.trim()
    if (!t || seen.has(t.toUpperCase())) return
    seen.add(t.toUpperCase())
    out.push(t)
  }
  push(final.sheetNumber)
  push(prepared?.drawingIdentityHints?.sheetNumberCandidate ?? null)
  return out
}

/**
 * Map 1-based PDF page number to drawing index entry index when row count matches
 * page count (1:1, page p → entry p-1) or is exactly one fewer (dedicated index page:
 * page 1 unmapped, page p≥2 → entry p-2).
 */
const ORDERED_REGISTRY_STUB_REASONS = new Set([
  "ORDERED_REGISTRY_ASSIGNMENT",
  "ORDERED_REGISTRY_ASSIGNMENT_WITH_HINT_AGREEMENT",
])

export function isOrderedRegistryStubPage(page: IntakeNormalizedPage): boolean {
  return page.review.reasons.some((r) => ORDERED_REGISTRY_STUB_REASONS.has(r))
}

/** Trim index-derived titles polluted by template text (e.g. "SHEET NO. SHEET TITLE"). */
export function cleanRegistryDisplayTitle(title: string, _sheetNumber: string): string {
  let t = title.replace(/\s+/g, " ").trim()
  const templateNoise = /\bSHEET\s+NO\.?\s*SHEET\s+TITLE\b/i
  const tn = templateNoise.exec(t)
  if (tn && tn.index >= 12) {
    t = t.slice(0, tn.index).trim()
  }
  const sheetNo = /\bSHEET\s+NO\.?\b/i
  const sn = sheetNo.exec(t)
  if (sn && sn.index >= 24 && sn.index < t.length - 8) {
    t = t.slice(0, sn.index).trim()
  }
  if (t.length > 96) {
    t = `${t.slice(0, 93).trim()}…`
  }
  return t
}

/**
 * Final display title for a registry row: clean index text, strip leading sheet echo
 * (e.g. "E-6 — …"), and cut legal/body boilerplate tails.
 */
export function finalRegistryTitleFromEntry(
  canonicalSheetNumber: string,
  rawTitle: string,
): string {
  let t = cleanRegistryDisplayTitle(rawTitle, canonicalSheetNumber)
  const esc = canonicalSheetNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  t = t.replace(new RegExp(`^\\s*${esc}\\s*[–—-]\\s*`, "i"), "").trim()
  t = cleanRegistryDisplayTitle(t, canonicalSheetNumber)
  const boiler = /\bFOR ADDITIONAL INFORMATION\b/i
  const bm = boiler.exec(t)
  if (bm && bm.index >= 12) {
    t = t.slice(0, bm.index).trim()
  }
  if (t.length > 96) {
    t = `${t.slice(0, 93).trim()}…`
  }
  return t
}

function pageOwnsExpectedDrawingOrdinal(
  pageNum: number,
  expectedEntryIdx: number,
  entries: FrontStructureDrawingEntry[],
  pagesOut: IntakeNormalizedPage[],
  firstOwnerByDrawingKey: Map<string, number>,
): boolean {
  if (expectedEntryIdx < 0 || expectedEntryIdx >= entries.length) return false
  const lkExp = registryLogicalKeyForSheetId(entries[expectedEntryIdx].sheetNumber)
  if (!lkExp) return false
  if (firstOwnerByDrawingKey.get(lkExp) !== pageNum) return false
  const page = pagesOut.find((p) => p.pageNumber === pageNum)
  if (!page) return false
  const lkPage = registryLogicalKeyForSheetId(page.final.sheetNumber)
  return lkPage === lkExp
}

function sequenceSupportsRegistryGapFill(params: {
  pageNumber: number
  ord: number
  totalPages: number
  entries: FrontStructureDrawingEntry[]
  pagesOut: IntakeNormalizedPage[]
  firstOwnerByDrawingKey: Map<string, number>
}): boolean {
  const { pageNumber, ord, totalPages, entries, pagesOut, firstOwnerByDrawingKey } = params
  const n = entries.length
  if (n < 2) return false

  if (pageNumber === 1 && ord === 0) {
    return pageOwnsExpectedDrawingOrdinal(2, 1, entries, pagesOut, firstOwnerByDrawingKey)
  }
  if (pageNumber === totalPages && ord === n - 1) {
    return pageOwnsExpectedDrawingOrdinal(
      totalPages - 1,
      ord - 1,
      entries,
      pagesOut,
      firstOwnerByDrawingKey,
    )
  }
  if (pageNumber > 1 && pageNumber < totalPages && ord > 0 && ord < n - 1) {
    return (
      pageOwnsExpectedDrawingOrdinal(
        pageNumber - 1,
        ord - 1,
        entries,
        pagesOut,
        firstOwnerByDrawingKey,
      ) &&
      pageOwnsExpectedDrawingOrdinal(
        pageNumber + 1,
        ord + 1,
        entries,
        pagesOut,
        firstOwnerByDrawingKey,
      )
    )
  }
  return false
}

function explainSequenceGapFillFailure(params: {
  pageNumber: number
  ord: number
  totalPages: number
  entries: FrontStructureDrawingEntry[]
  pagesOut: IntakeNormalizedPage[]
  firstOwnerByDrawingKey: Map<string, number>
}): string | null {
  if (sequenceSupportsRegistryGapFill(params)) return null
  const { pageNumber, ord, totalPages, entries, pagesOut, firstOwnerByDrawingKey } = params
  const n = entries.length
  if (n < 2) return "drawing_entry_count_lt_2"

  const snap = (pageNum: number, entryIdx: number): string => {
    const e = entries[entryIdx]
    const lk = registryLogicalKeyForSheetId(e.sheetNumber)
    const ownerPage = lk ? firstOwnerByDrawingKey.get(lk) : undefined
    const pg = pagesOut.find((p) => p.pageNumber === pageNum)
    const finalLk = registryLogicalKeyForSheetId(pg?.final.sheetNumber ?? null)
    return `page${pageNum}_expects_row${entryIdx}_${e.sheetNumber}_lk_${lk}_registryOwner_${ownerPage ?? "none"}_finalSheetLk_${finalLk ?? "none"}`
  }

  if (pageNumber === 1 && ord === 0) {
    return `first_page_ord0_prev_neighbor_check_failed:${snap(2, 1)}`
  }
  if (pageNumber === totalPages && ord === n - 1) {
    return `last_page_ord_last_prev_neighbor_check_failed:${snap(totalPages - 1, ord - 1)}`
  }
  if (pageNumber > 1 && pageNumber < totalPages && ord > 0 && ord < n - 1) {
    if (
      !pageOwnsExpectedDrawingOrdinal(
        pageNumber - 1,
        ord - 1,
        entries,
        pagesOut,
        firstOwnerByDrawingKey,
      )
    ) {
      return `interior_prev_failed:${snap(pageNumber - 1, ord - 1)}`
    }
    if (
      !pageOwnsExpectedDrawingOrdinal(
        pageNumber + 1,
        ord + 1,
        entries,
        pagesOut,
        firstOwnerByDrawingKey,
      )
    ) {
      return `interior_next_failed:${snap(pageNumber + 1, ord + 1)}`
    }
  }
  return `sequence_rule_not_applicable_for_page${pageNumber}_ord${ord}_totalPages${totalPages}_entryCount${n}`
}

function likelyPollutedSheetTitleHint(title: string | null | undefined): boolean {
  const t = title?.trim() ?? ""
  if (!t) return false
  if (/\bFOR ADDITIONAL INFORMATION\b/i.test(t)) return true
  if (t.length > 140) return true
  return false
}

/**
 * When sequence implies registry row A but merged sheet-number candidates parse to other keys.
 * STRONG: multiple distinct keys, registry-validated hint, or high-confidence DRAWING_NUMBER disagreeing.
 */
function classifyHintVersusSequenceStrength(args: {
  expectedLk: string
  hintKeys: string[]
  hints: IntakeDrawingIdentityHints | undefined
}): "WEAK" | "STRONG" {
  const { expectedLk, hintKeys, hints } = args
  const unique = [...new Set(hintKeys)]
  if (unique.length >= 2) return "STRONG"
  if (unique.length === 1 && unique[0] !== expectedLk) {
    if (hints?.registryValidated === true) return "STRONG"
    const kind = hints?.selectedCandidateKind
    const conf = hints?.confidence ?? 0
    if (kind === "DRAWING_NUMBER" && conf >= 0.88) return "STRONG"
    return "WEAK"
  }
  return "WEAK"
}

/**
 * Page-level drawing number treated as a strong claim (title block / validated hint).
 * Used only for explicit identity-conflict labeling, not to loosen gap-fill.
 */
function strongClaimedDrawingLogicalKeyForIdentity(
  page: IntakeNormalizedPage,
  hints: IntakeDrawingIdentityHints | undefined,
): string | null {
  if (hints?.registryValidated === true) {
    const lk =
      registryLogicalKeyForSheetId(hints.sheetNumberCandidate) ??
      registryLogicalKeyForSheetId(page.final.sheetNumber)
    if (lk) return lk
  }
  if (hints?.selectedCandidateKind === "DRAWING_NUMBER" && (hints.confidence ?? 0) >= 0.75) {
    return (
      registryLogicalKeyForSheetId(hints.sheetNumberCandidate) ??
      registryLogicalKeyForSheetId(page.final.sheetNumber)
    )
  }
  return null
}

function pushUniqueReviewReason(page: IntakeNormalizedPage, reason: string) {
  if (!page.review.reasons.includes(reason)) page.review.reasons.push(reason)
}

/** Clean display title for page-claimed identity (not registry row text). */
function cleanPageClaimedDrawingTitle(
  title: string | null | undefined,
  sheetNumber: string | null | undefined,
): string | null {
  let t = title?.replace(/\s+/g, " ").trim() ?? ""
  if (!t) return null
  const esc = sheetNumber?.trim()
  if (esc) {
    const e = esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    t = t.replace(new RegExp(`^\\s*${e}\\s*[–—-]\\s*`, "i"), "").trim()
  }
  const boiler = /\bFOR ADDITIONAL INFORMATION\b/i
  const bm = boiler.exec(t)
  if (bm && bm.index >= 12) t = t.slice(0, bm.index).trim()
  if (t.length > 96) t = `${t.slice(0, 93).trim()}…`
  return t || null
}

function pickCleanerSheetTitleForIdentityConflict(
  page: IntakeNormalizedPage,
  hints: IntakeDrawingIdentityHints | undefined,
): string | null {
  const snHint = hints?.sheetNumberCandidate ?? null
  const snAi = page.final.sheetNumber
  const cleanedHint = cleanPageClaimedDrawingTitle(hints?.sheetTitleCandidate, snHint)
  const cleanedAi = cleanPageClaimedDrawingTitle(page.final.sheetTitle, snAi)
  const aiPolluted = likelyPollutedSheetTitleHint(page.final.sheetTitle)
  const hintPolluted = likelyPollutedSheetTitleHint(hints?.sheetTitleCandidate)
  if (cleanedHint && (!cleanedAi || (aiPolluted && !hintPolluted))) return cleanedHint
  if (cleanedAi) return cleanedAi
  return cleanedHint
}

export function orderedDrawingEntryIndexForPage(params: {
  pageNumber: number
  totalPages: number
  entryCount: number
}): number | null {
  const { pageNumber, totalPages, entryCount } = params
  if (pageNumber < 1 || pageNumber > totalPages) return null
  if (entryCount === totalPages) {
    const idx = pageNumber - 1
    return idx >= 0 && idx < entryCount ? idx : null
  }
  if (entryCount === totalPages - 1 && pageNumber >= 2) {
    const idx = pageNumber - 2
    return idx >= 0 && idx < entryCount ? idx : null
  }
  return null
}

export function buildDrawingIndexMap(
  scan: FrontStructureScanResult,
): Map<string, { sheetNumber: string; title: string; index: number }> {
  const m = new Map<string, { sheetNumber: string; title: string; index: number }>()
  const entries = scan.drawingEntries ?? []
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]
    const p = parseSheetCell(e.sheetNumber)
    if (!p) continue
    const key = `${p.letter.toUpperCase()}-${p.num}`
    // First wins for canonical row (front scan order)
    if (!m.has(key)) {
      m.set(key, {
        sheetNumber: e.sheetNumber.trim(),
        title: e.title.trim().slice(0, 240),
        index: i,
      })
    }
  }
  return m
}

export function buildSpecTocMap(
  scan: FrontStructureScanResult,
): Map<string, { sectionNumber: string | null; title: string; page: number | null; index: number }> {
  const m = new Map<
    string,
    { sectionNumber: string | null; title: string; page: number | null; index: number }
  >()
  const entries = scan.specEntries ?? []
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]
    const norm = normalizeCsiSection(e.sectionNumber ?? "")
    if (!norm) continue
    if (!m.has(norm)) {
      m.set(norm, {
        sectionNumber: e.sectionNumber?.trim() ?? norm,
        title: e.title.trim().slice(0, 240),
        page: e.page,
        index: i,
      })
    }
  }
  return m
}

function specSectionCandidates(
  prepared: IntakePreparedPage | undefined,
  final: IntakeNormalizedPage["final"],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string | null | undefined) => {
    const n = normalizeCsiSection(s ?? null)
    if (!n || seen.has(n)) return
    seen.add(n)
    out.push(n)
  }
  push(final.sectionNumber)
  push(prepared?.specSignals.detectedSectionNumber ?? null)
  return out
}

export function isFrontStructureAuthorityCredible(scan: FrontStructureScanResult): boolean {
  if (scan.confidence < MIN_REGISTRY_AUTHORITY_CONFIDENCE) return false
  if (scan.structureFound === "DRAWING_INDEX") {
    return (scan.drawingEntries?.length ?? 0) >= 3
  }
  if (scan.structureFound === "SPEC_TOC") {
    return (scan.specEntries?.length ?? 0) >= 2
  }
  return false
}

/**
 * Apply canonical labels from front structure scan when credible; record validation per page.
 * Does not call the LLM; runs after `runAiIntake`.
 */
export function applyRegistryLedValidationAndLabels(params: {
  intake: IntakeRunResult
  preparedPages: IntakePreparedPage[]
  frontStructureScan: FrontStructureScanResult
}): { intake: IntakeRunResult; validation: RegistryValidationResult } {
  const { intake, preparedPages, frontStructureScan } = params

  const preparedByPage = new Map<number, IntakePreparedPage>()
  for (const p of preparedPages) {
    preparedByPage.set(p.pageNumber, p)
  }

  const authorityActive = isFrontStructureAuthorityCredible(frontStructureScan)
  const authorityKind: RegistryAuthorityKind =
    authorityActive && frontStructureScan.structureFound === "DRAWING_INDEX"
      ? "DRAWING_INDEX"
      : authorityActive && frontStructureScan.structureFound === "SPEC_TOC"
        ? "SPEC_TOC"
        : "NONE"

  let reasonInactive: string | null = null
  if (!authorityActive) {
    if (frontStructureScan.structureFound === "WEAK_DRAWING_INDEX") {
      reasonInactive = "weak_drawing_index_not_authoritative"
    } else if (frontStructureScan.structureFound === "NONE") reasonInactive = "no_structure_found"
    else if (frontStructureScan.confidence < MIN_REGISTRY_AUTHORITY_CONFIDENCE) {
      reasonInactive = "low_front_structure_confidence"
    } else if (
      frontStructureScan.structureFound === "DRAWING_INDEX" &&
      (frontStructureScan.drawingEntries?.length ?? 0) < 3
    ) {
      reasonInactive = "insufficient_drawing_entries"
    } else if (
      frontStructureScan.structureFound === "SPEC_TOC" &&
      (frontStructureScan.specEntries?.length ?? 0) < 2
    ) {
      reasonInactive = "insufficient_spec_entries"
    } else {
      reasonInactive = "weak_or_unknown_registry"
    }
  }

  const perPage: RegistryPageValidation[] = []
  const gapFillCandidatePageNumbers: number[] = []
  const pagesOut = intake.pages.map((page) => ({
    ...page,
    final: { ...page.final },
    review: { ...page.review, reasons: [...page.review.reasons] },
  }))

  if (!authorityActive) {
    for (const page of pagesOut) {
      perPage.push({
        pageNumber: page.pageNumber,
        status: "SKIPPED_NO_AUTHORITY",
        registryKey: null,
        matchedEntryIndex: null,
        notes: [reasonInactive ?? "inactive"],
      })
    }
    const validation: RegistryValidationResult = {
      authorityActive: false,
      authorityKind: "NONE",
      reasonInactive,
      documentAddendumLabel: frontStructureScan.addendumLabel,
      frontStructureConfidence: frontStructureScan.confidence,
      totalEntries: 0,
      perPage,
      summary: {
        registryFound: false,
        registryType: "NONE",
        totalEntries: 0,
        matchedPages: 0,
        blankPages: 0,
        unmatchedPages: 0,
        duplicateMatches: 0,
        missingEntries: 0,
        reviewRequiredPages: 0,
      },
    }
    console.log("visibleIntake:gapFillAssignmentSummary", {
      initialOwnedPages: 0,
      initialUnownedPages: 0,
      gapFillAssignmentsApplied: 0,
      gapFillAssignmentsRejected: 0,
      rejectedReasonSummary: {},
      finalOwnedPages: 0,
      finalUnownedPages: 0,
    })
    console.log("visibleIntake:unownedPageAudit", { pages: [] })
    console.log("visibleIntake:unownedPageAuditSummary", {
      totalUnownedPages: 0,
      contradictionBlocks: 0,
      weakContradictions: 0,
      strongContradictions: 0,
      sequenceBreaks: 0,
      alreadyOwnedBlocks: 0,
      otherBlocks: 0,
    })
    console.log("visibleIntake:identityConflictSummary", {
      repeatedSheetNumberPages: 0,
      sequenceContradictionPages: 0,
      primaryOwnedPages: 0,
      secondaryDuplicateIdentityPages: 0,
      unresolvedConflictPages: 0,
      exampleConflicts: [] as Array<Record<string, unknown>>,
    })
    return { intake, validation }
  }

  const drawingMap = buildDrawingIndexMap(frontStructureScan)
  const specMap = buildSpecTocMap(frontStructureScan)

  const totalEntries =
    authorityKind === "DRAWING_INDEX"
      ? drawingMap.size
      : authorityKind === "SPEC_TOC"
        ? specMap.size
        : 0

  const firstOwnerByDrawingKey = new Map<string, number>()
  const matchedDrawingKeys = new Set<string>()
  const matchedSpecKeys = new Set<string>()

  let matchedPages = 0
  let blankPages = 0
  let unmatchedPages = 0
  let duplicateMatches = 0
  let reviewRequiredPages = 0
  let reconciledOrdinalRecoveries = 0
  let orderedClaimsInValidation = 0

  const registryPassOrder =
    authorityKind === "DRAWING_INDEX"
      ? [...pagesOut].sort((a, b) => {
          const ao = isOrderedRegistryStubPage(a) ? 0 : 1
          const bo = isOrderedRegistryStubPage(b) ? 0 : 1
          if (ao !== bo) return ao - bo
          return a.pageNumber - b.pageNumber
        })
      : pagesOut

  for (const page of registryPassOrder) {
    const prepared = preparedByPage.get(page.pageNumber)
    const notes: string[] = []

    if (isFastBlankBypass(prepared)) {
      blankPages += 1
      perPage.push({
        pageNumber: page.pageNumber,
        status: "BLANK_PAGE",
        registryKey: null,
        matchedEntryIndex: null,
        notes: ["fast_blank_bypass"],
      })
      continue
    }

    if (authorityKind === "DRAWING_INDEX") {
      if (page.final.pageClass !== "DRAWING") {
        unmatchedPages += 1
        perPage.push({
          pageNumber: page.pageNumber,
          status: "NOT_IN_REGISTRY",
          registryKey: null,
          matchedEntryIndex: null,
          notes: ["not_drawing_class"],
        })
        continue
      }

      const candidates = drawingSheetCandidates(prepared, page.final)
      let matchedKey: string | null = null
      let matchedEntry: { sheetNumber: string; title: string; index: number } | null = null

      for (const cand of candidates) {
        const lk = registryLogicalKeyForSheetId(cand)
        if (!lk) continue
        const entry = drawingMap.get(lk)
        if (entry) {
          matchedKey = lk
          matchedEntry = entry
          break
        }
      }

      let stolenCandidateKey = false
      if (
        matchedKey &&
        firstOwnerByDrawingKey.get(matchedKey) !== undefined &&
        firstOwnerByDrawingKey.get(matchedKey) !== page.pageNumber
      ) {
        stolenCandidateKey = true
        matchedKey = null
        matchedEntry = null
      }

      let matchedViaOrderFallback = false

      if (!matchedKey || !matchedEntry) {
        const entries = frontStructureScan.drawingEntries ?? []
        const totalPages = pagesOut.length
        const ord = orderedDrawingEntryIndexForPage({
          pageNumber: page.pageNumber,
          totalPages,
          entryCount: entries.length,
        })

        if (ord !== null) {
          const e = entries[ord]
          const lk = registryLogicalKeyForSheetId(e.sheetNumber)
          if (lk) {
            const mapEntry = drawingMap.get(lk)
            if (mapEntry) {
              const hintKeys = candidates
                .map((c) => registryLogicalKeyForSheetId(c))
                .filter((k): k is string => k !== null)
              const stubOrdered = isOrderedRegistryStubPage(page)
              const conflict =
                !stubOrdered && hintKeys.length > 0 && !hintKeys.includes(lk)
              if (!conflict && firstOwnerByDrawingKey.get(lk) === undefined) {
                matchedKey = lk
                matchedEntry = mapEntry
                matchedViaOrderFallback = true
                if (stolenCandidateKey) reconciledOrdinalRecoveries += 1
              }
            }
          }
        }
      }

      if (!matchedKey || !matchedEntry) {
        unmatchedPages += 1
        gapFillCandidatePageNumbers.push(page.pageNumber)
        perPage.push({
          pageNumber: page.pageNumber,
          status: "NOT_IN_REGISTRY",
          registryKey: null,
          matchedEntryIndex: null,
          notes: ["no_sheet_match"],
        })
        continue
      }

      const displayTitle = finalRegistryTitleFromEntry(
        matchedEntry.sheetNumber,
        matchedEntry.title,
      )

      const firstOwner = firstOwnerByDrawingKey.get(matchedKey)
      if (firstOwner !== undefined && firstOwner !== page.pageNumber) {
        const entries = frontStructureScan.drawingEntries ?? []
        const totalPages = pagesOut.length
        const ord = orderedDrawingEntryIndexForPage({
          pageNumber: page.pageNumber,
          totalPages,
          entryCount: entries.length,
        })
        let rescued = false
        if (ord !== null) {
          const e = entries[ord]
          const lkAlt = registryLogicalKeyForSheetId(e.sheetNumber)
          if (lkAlt && lkAlt !== matchedKey) {
            const altEntry = drawingMap.get(lkAlt)
            if (altEntry && firstOwnerByDrawingKey.get(lkAlt) === undefined) {
              matchedKey = lkAlt
              matchedEntry = altEntry
              matchedViaOrderFallback = true
              rescued = true
              reconciledOrdinalRecoveries += 1
            }
          }
        }

        if (!rescued) {
          duplicateMatches += 1
          reviewRequiredPages += 1
          page.review.status = "REVIEW_REQUIRED" as IntakeReviewStatus
          pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REPEATED_SHEET)
          pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_SECONDARY)
          pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REVIEW)
          const primaryOwnerPage = pagesOut.find((pg) => pg.pageNumber === firstOwner)
          if (primaryOwnerPage) pushUniqueReviewReason(primaryOwnerPage, DRAWING_IDENTITY_REASON_PRIMARY_OWNER)
          page.review.reasons.push(
            `Duplicate drawing registry match for sheet ${matchedEntry.sheetNumber}`,
          )
          page.evidence = mergeEvidence(page.evidence, `duplicate sheet ${matchedEntry.sheetNumber}`)
          perPage.push({
            pageNumber: page.pageNumber,
            status: "DUPLICATE_REGISTRY_MATCH",
            registryKey: matchedKey,
            matchedEntryIndex: matchedEntry.index,
            notes: [
              `first_owner_page_${firstOwner}`,
              "identity_duplicate_registry_match_secondary",
            ],
          })
          page.final.sheetNumber = matchedEntry.sheetNumber
          page.final.sheetTitle = finalRegistryTitleFromEntry(
            matchedEntry.sheetNumber,
            matchedEntry.title,
          )
          matchedDrawingKeys.add(matchedKey)
          continue
        }

        const displayTitleRescued = finalRegistryTitleFromEntry(
          matchedEntry.sheetNumber,
          matchedEntry.title,
        )
        firstOwnerByDrawingKey.set(matchedKey, page.pageNumber)
        matchedDrawingKeys.add(matchedKey)
        page.final.sheetNumber = matchedEntry.sheetNumber
        page.final.sheetTitle = displayTitleRescued
        page.evidence = mergeEvidence(
          page.evidence,
          `reconciled to ordinal sheet ${matchedEntry.sheetNumber} (registry ownership). Title source: REGISTRY_TITLE_FORCED_CLEAN.`,
        )
        matchedPages += 1
        if (matchedViaOrderFallback) orderedClaimsInValidation += 1
        perPage.push({
          pageNumber: page.pageNumber,
          status: "MATCHED_TO_REGISTRY",
          registryKey: matchedKey,
          matchedEntryIndex: matchedEntry.index,
          notes: [
            ...notes,
            "reconciled_ordinal_after_duplicate",
            "ordered_index_fallback",
            "title_source_REGISTRY_TITLE_FORCED_CLEAN",
          ],
        })
        continue
      }

      firstOwnerByDrawingKey.set(matchedKey, page.pageNumber)
      matchedDrawingKeys.add(matchedKey)
      page.final.sheetNumber = matchedEntry.sheetNumber
      page.final.sheetTitle = displayTitle
      page.evidence = mergeEvidence(
        page.evidence,
        matchedViaOrderFallback
          ? `ordered sheet ${matchedEntry.sheetNumber} from drawing index (page order)`
          : `canonical sheet ${matchedEntry.sheetNumber} from drawing index`,
      )
      page.evidence = mergeEvidence(page.evidence, "Title source: REGISTRY_TITLE_FORCED_CLEAN.")
      matchedPages += 1
      if (matchedViaOrderFallback) orderedClaimsInValidation += 1
      perPage.push({
        pageNumber: page.pageNumber,
        status: "MATCHED_TO_REGISTRY",
        registryKey: matchedKey,
        matchedEntryIndex: matchedEntry.index,
        notes: matchedViaOrderFallback
          ? [...notes, "ordered_index_fallback", "title_source_REGISTRY_TITLE_FORCED_CLEAN"]
          : [...notes, "title_source_REGISTRY_TITLE_FORCED_CLEAN"],
      })
      continue
    }

    if (authorityKind === "SPEC_TOC") {
      if (page.final.pageClass !== "SPECIFICATION") {
        unmatchedPages += 1
        perPage.push({
          pageNumber: page.pageNumber,
          status: "NOT_IN_REGISTRY",
          registryKey: null,
          matchedEntryIndex: null,
          notes: ["not_specification_class"],
        })
        continue
      }

      const candidates = specSectionCandidates(prepared, page.final)
      let matchedNorm: string | null = null
      let matchedEntry: {
        sectionNumber: string | null
        title: string
        page: number | null
        index: number
      } | null = null

      for (const cand of candidates) {
        const e = specMap.get(cand)
        if (e) {
          matchedNorm = cand
          matchedEntry = e
          break
        }
      }

      if (!matchedNorm || !matchedEntry) {
        unmatchedPages += 1
        perPage.push({
          pageNumber: page.pageNumber,
          status: "NOT_IN_REGISTRY",
          registryKey: null,
          matchedEntryIndex: null,
          notes: ["no_section_match"],
        })
        continue
      }

      const canonNum = matchedEntry.sectionNumber ?? matchedNorm
      page.final.sectionNumber = canonNum
      page.final.sectionTitle = matchedEntry.title
      page.evidence = mergeEvidence(
        page.evidence,
        `canonical section ${canonNum} from spec TOC`,
      )
      matchedSpecKeys.add(matchedNorm)
      matchedPages += 1
      perPage.push({
        pageNumber: page.pageNumber,
        status: "MATCHED_TO_REGISTRY",
        registryKey: matchedNorm,
        matchedEntryIndex: matchedEntry.index,
        notes,
      })
    }
  }

  let gapFillAssignmentsApplied = 0
  let gapFillAssignmentsRejected = 0
  const rejectedReasonSummary: Record<string, number> = {}
  let gapFillInitialOwnedPages = 0
  let gapFillInitialUnownedPages = 0

  const bumpGapReject = (reason: string) => {
    gapFillAssignmentsRejected += 1
    rejectedReasonSummary[reason] = (rejectedReasonSummary[reason] ?? 0) + 1
  }

  if (authorityKind === "DRAWING_INDEX") {
    gapFillInitialOwnedPages = new Set(firstOwnerByDrawingKey.values()).size
    gapFillInitialUnownedPages = gapFillCandidatePageNumbers.length

    const entries = frontStructureScan.drawingEntries ?? []
    const totalPages = pagesOut.length
    const sortedGapPages = [...gapFillCandidatePageNumbers].sort((a, b) => a - b)

    for (const pnum of sortedGapPages) {
      const page = pagesOut.find((pg) => pg.pageNumber === pnum)
      if (!page) {
        bumpGapReject("page_missing")
        continue
      }
      if (page.final.pageClass !== "DRAWING") {
        bumpGapReject("not_drawing_class")
        continue
      }

      const ord = orderedDrawingEntryIndexForPage({
        pageNumber: pnum,
        totalPages,
        entryCount: entries.length,
      })
      if (ord === null) {
        bumpGapReject("no_ordinal_mapping")
        continue
      }

      const entry = entries[ord]
      const lk = registryLogicalKeyForSheetId(entry.sheetNumber)
      if (!lk) {
        bumpGapReject("no_logical_key")
        continue
      }
      const mapEntry = drawingMap.get(lk)
      if (!mapEntry) {
        bumpGapReject("entry_not_in_map")
        continue
      }
      if (firstOwnerByDrawingKey.get(lk) !== undefined) {
        bumpGapReject("registry_row_already_owned")
        continue
      }

      if (
        !sequenceSupportsRegistryGapFill({
          pageNumber: pnum,
          ord,
          totalPages,
          entries,
          pagesOut,
          firstOwnerByDrawingKey,
        })
      ) {
        bumpGapReject("sequence_not_supported")
        continue
      }

      const prepared = preparedByPage.get(pnum)
      const candidates = drawingSheetCandidates(prepared, page.final)
      const hintKeys = candidates
        .map((c) => registryLogicalKeyForSheetId(c))
        .filter((k): k is string => k !== null)
      const stubOrdered = isOrderedRegistryStubPage(page)
      if (!stubOrdered && hintKeys.length > 0 && !hintKeys.includes(lk)) {
        bumpGapReject("hint_contradicts_sequence")
        continue
      }

      firstOwnerByDrawingKey.set(lk, pnum)
      matchedDrawingKeys.add(lk)
      page.final.sheetNumber = mapEntry.sheetNumber
      page.final.sheetTitle = finalRegistryTitleFromEntry(mapEntry.sheetNumber, mapEntry.title)
      page.evidence = mergeEvidence(
        page.evidence,
        `gap-filled sheet ${mapEntry.sheetNumber} from drawing index (sequence continuity). Title source: REGISTRY_TITLE_FORCED_CLEAN.`,
      )
      unmatchedPages -= 1
      matchedPages += 1

      const ppIdx = perPage.findIndex(
        (row) => row.pageNumber === pnum && row.status === "NOT_IN_REGISTRY",
      )
      if (ppIdx >= 0) {
        perPage[ppIdx] = {
          pageNumber: pnum,
          status: "MATCHED_TO_REGISTRY",
          registryKey: lk,
          matchedEntryIndex: mapEntry.index,
          notes: ["registry_sequence_gap_fill", "title_source_REGISTRY_TITLE_FORCED_CLEAN"],
        }
      }

      gapFillAssignmentsApplied += 1
    }
  }

  const gapFillFinalOwnedPages =
    authorityKind === "DRAWING_INDEX" ? new Set(firstOwnerByDrawingKey.values()).size : 0
  const gapFillFinalUnownedPages =
    authorityKind === "DRAWING_INDEX"
      ? Math.max(0, gapFillInitialUnownedPages - gapFillAssignmentsApplied)
      : 0

  console.log("visibleIntake:gapFillAssignmentSummary", {
    initialOwnedPages: gapFillInitialOwnedPages,
    initialUnownedPages: gapFillInitialUnownedPages,
    gapFillAssignmentsApplied,
    gapFillAssignmentsRejected,
    rejectedReasonSummary,
    finalOwnedPages: gapFillFinalOwnedPages,
    finalUnownedPages: gapFillFinalUnownedPages,
  })

  if (authorityKind === "DRAWING_INDEX") {
    const entries = frontStructureScan.drawingEntries ?? []
    const totalPages = pagesOut.length
    const stillUnownedPages = [...gapFillCandidatePageNumbers]
      .filter((pnum) => {
        const row = perPage.find((r) => r.pageNumber === pnum)
        return row?.status === "NOT_IN_REGISTRY" && row.notes.includes("no_sheet_match")
      })
      .sort((a, b) => a - b)

    const audits: Array<{
      pageNumber: number
      expectedRegistryIndex: number | null
      expectedRegistrySheetNumber: string | null
      expectedRegistryLogicalKey: string | null
      expectedRegistryTitle: string | null
      currentHintSheetNumber: string | null
      currentHintSheetTitle: string | null
      currentAiSheetNumber: string | null
      currentAiSheetTitle: string | null
      sheetNumberCandidatesRaw: string[]
      hintDerivedLogicalKeys: string[]
      gapFillFirstBlockReason: string
      contradictionReason: string
      contradictionStrength: "NONE" | "WEAK" | "STRONG" | "N_A"
      registryRowAlreadyOwned: boolean
      registryRowOwnerPageNumber: number | null
      sequenceSupported: boolean
      sequenceFailureDetail: string | null
      likelyPollutedHintTitle: boolean
      orderedRegistryStubPage: boolean
      hintSelectedCandidateKind: string | null
      hintConfidence: number | null
      hintRegistryValidated: boolean | null
      finalDisposition: string
    }> = []

    let contradictionBlocks = 0
    let weakContradictions = 0
    let strongContradictions = 0
    let sequenceBreaks = 0
    let alreadyOwnedBlocks = 0
    let otherBlocks = 0

    for (const pnum of stillUnownedPages) {
      const page = pagesOut.find((pg) => pg.pageNumber === pnum)
      const prepared = preparedByPage.get(pnum)
      const hints = prepared?.drawingIdentityHints
      const orderStub = page ? isOrderedRegistryStubPage(page) : false

      let gapFillFirstBlockReason = "unknown"
      let contradictionReason = ""
      let contradictionStrength: "NONE" | "WEAK" | "STRONG" | "N_A" = "N_A"
      let registryRowAlreadyOwned = false
      let registryRowOwnerPageNumber: number | null = null
      let sequenceSupported = false
      let sequenceFailureDetail: string | null = null
      let expectedRegistryIndex: number | null = null
      let expectedRegistrySheetNumber: string | null = null
      let expectedRegistryLogicalKey: string | null = null
      let expectedRegistryTitle: string | null = null

      const sheetNumberCandidatesRaw =
        page && page.final.pageClass === "DRAWING"
          ? drawingSheetCandidates(prepared, page.final)
          : []
      const hintDerivedLogicalKeys = sheetNumberCandidatesRaw
        .map((c) => registryLogicalKeyForSheetId(c))
        .filter((k): k is string => k !== null)

      if (!page) {
        gapFillFirstBlockReason = "page_missing"
        otherBlocks += 1
        contradictionReason = "intake page missing after clone"
      } else if (page.final.pageClass !== "DRAWING") {
        gapFillFirstBlockReason = "not_drawing_class"
        otherBlocks += 1
        contradictionReason = `pageClass is ${page.final.pageClass}, not DRAWING`
      } else {
        const ord = orderedDrawingEntryIndexForPage({
          pageNumber: pnum,
          totalPages,
          entryCount: entries.length,
        })
        if (ord === null) {
          gapFillFirstBlockReason = "no_ordinal_mapping"
          otherBlocks += 1
          contradictionReason = `no ordinal mapping (entries=${entries.length}, totalPages=${totalPages})`
        } else {
          expectedRegistryIndex = ord
          const entry = entries[ord]
          expectedRegistrySheetNumber = entry.sheetNumber
          expectedRegistryLogicalKey = registryLogicalKeyForSheetId(entry.sheetNumber)
          expectedRegistryTitle =
            expectedRegistryLogicalKey !== null
              ? finalRegistryTitleFromEntry(entry.sheetNumber, entry.title)
              : null

          const lk = expectedRegistryLogicalKey
          const mapEntry = lk ? drawingMap.get(lk) : undefined

          if (!lk || !mapEntry) {
            gapFillFirstBlockReason = !lk ? "no_logical_key" : "entry_not_in_map"
            otherBlocks += 1
            contradictionReason = !lk
              ? "could not parse logical key for expected registry sheet id"
              : "expected row missing from drawingMap"
          } else {
            sequenceSupported = sequenceSupportsRegistryGapFill({
              pageNumber: pnum,
              ord,
              totalPages,
              entries,
              pagesOut,
              firstOwnerByDrawingKey,
            })
            sequenceFailureDetail = sequenceSupported
              ? null
              : explainSequenceGapFillFailure({
                  pageNumber: pnum,
                  ord,
                  totalPages,
                  entries,
                  pagesOut,
                  firstOwnerByDrawingKey,
                })

            const owner = firstOwnerByDrawingKey.get(lk)
            if (owner !== undefined) {
              gapFillFirstBlockReason = "registry_row_already_owned"
              alreadyOwnedBlocks += 1
              registryRowAlreadyOwned = true
              registryRowOwnerPageNumber = owner
              contradictionReason = `sequence expects ${entry.sheetNumber} (${lk}) but registry row is already owned by page ${owner}`
              contradictionStrength = "N_A"
            } else if (!sequenceSupported) {
              gapFillFirstBlockReason = "sequence_not_supported"
              sequenceBreaks += 1
              contradictionReason = sequenceFailureDetail ?? "sequence_not_supported"
              contradictionStrength = "N_A"
            } else if (
              !orderStub &&
              hintDerivedLogicalKeys.length > 0 &&
              !hintDerivedLogicalKeys.includes(lk)
            ) {
              gapFillFirstBlockReason = "hint_contradicts_sequence"
              contradictionBlocks += 1
              const hw = classifyHintVersusSequenceStrength({
                expectedLk: lk,
                hintKeys: hintDerivedLogicalKeys,
                hints,
              })
              contradictionStrength = hw
              if (hw === "WEAK") weakContradictions += 1
              else strongContradictions += 1
              contradictionReason = `merged sheet-number candidate keys [${hintDerivedLogicalKeys.join(", ")}] omit sequence key ${lk} (raw candidates: ${JSON.stringify(sheetNumberCandidatesRaw)}); orderedStub=${orderStub}`
            } else {
              gapFillFirstBlockReason = "unexplained_still_unowned"
              otherBlocks += 1
              contradictionReason =
                "gap-fill predicates passed but page remained unowned (unexpected)"
            }
          }
        }
      }

      audits.push({
        pageNumber: pnum,
        expectedRegistryIndex,
        expectedRegistrySheetNumber,
        expectedRegistryLogicalKey,
        expectedRegistryTitle,
        currentHintSheetNumber: hints?.sheetNumberCandidate ?? null,
        currentHintSheetTitle: hints?.sheetTitleCandidate ?? null,
        currentAiSheetNumber: page?.final.sheetNumber ?? null,
        currentAiSheetTitle: page?.final.sheetTitle ?? null,
        sheetNumberCandidatesRaw,
        hintDerivedLogicalKeys,
        gapFillFirstBlockReason,
        contradictionReason,
        contradictionStrength,
        registryRowAlreadyOwned,
        registryRowOwnerPageNumber,
        sequenceSupported,
        sequenceFailureDetail,
        likelyPollutedHintTitle: likelyPollutedSheetTitleHint(hints?.sheetTitleCandidate),
        orderedRegistryStubPage: orderStub,
        hintSelectedCandidateKind: hints?.selectedCandidateKind ?? null,
        hintConfidence: hints?.confidence ?? null,
        hintRegistryValidated: hints?.registryValidated ?? null,
        finalDisposition: "REMAIN_UNOWNED_GAP_FILL_BLOCKED",
      })
    }

    const primaryOwnedPages = new Set(firstOwnerByDrawingKey.values()).size
    let sequenceContradictionPages = 0
    let secondaryDuplicateIdentityPages = 0
    let unresolvedConflictPages = 0
    let identityConflictReviewAdds = 0
    const primaryOwnersInRepeatEvents = new Set<number>()
    const exampleConflicts: Array<{
      pageNumber: number
      expectedRegistrySheetNumber: string | null
      currentHintSheetNumber: string | null
      currentAiSheetNumber: string | null
      conflictType: string
      finalDisposition: string
    }> = []

    for (const a of audits) {
      const page = pagesOut.find((pg) => pg.pageNumber === a.pageNumber)
      if (!page) continue
      const prepared = preparedByPage.get(a.pageNumber)
      const hints = prepared?.drawingIdentityHints
      const expectedLk = a.expectedRegistryLogicalKey
      const strongLk = strongClaimedDrawingLogicalKeyForIdentity(page, hints)
      const prevReviewRequired = page.review.status === "REVIEW_REQUIRED"

      let conflictType: string
      let finalDisposition: string
      let perPageNote: string

      if (
        a.gapFillFirstBlockReason === "registry_row_already_owned" &&
        expectedLk &&
        strongLk === expectedLk
      ) {
        secondaryDuplicateIdentityPages += 1
        conflictType = "REPEATED_SHEET_PRIMARY_HOLDS_REGISTRY_ROW"
        finalDisposition = "PRESERVE_PAGE_SHEET_CLAIM_REGISTRY_ROW_TAKEN_REVIEW"
        perPageNote = "identity_repeated_sheet_secondary"
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REPEATED_SHEET)
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_SECONDARY)
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REVIEW)
        page.evidence = mergeEvidence(
          page.evidence,
          `Drawing index primary owner of ${a.expectedRegistrySheetNumber ?? expectedLk} is page ${a.registryRowOwnerPageNumber ?? "?"}. This page repeats the same sheet identity.`,
        )
        const cleaner = pickCleanerSheetTitleForIdentityConflict(page, hints)
        if (cleaner) page.final.sheetTitle = cleaner
        page.evidence = mergeEvidence(
          page.evidence,
          "Title source: PAGE_CLAIMED_TITLE_CLEANED (repeated sheet number).",
        )
        const ownerPg = pagesOut.find((pg) => pg.pageNumber === a.registryRowOwnerPageNumber)
        if (ownerPg) {
          pushUniqueReviewReason(ownerPg, DRAWING_IDENTITY_REASON_PRIMARY_OWNER)
          primaryOwnersInRepeatEvents.add(ownerPg.pageNumber)
        }
      } else if (
        a.gapFillFirstBlockReason === "registry_row_already_owned" &&
        expectedLk &&
        strongLk &&
        strongLk !== expectedLk
      ) {
        unresolvedConflictPages += 1
        conflictType = "REGISTRY_ROW_HELD_SEQUENCE_IMPLIES_DIFFERENT_SHEET_THAN_PAGE_CLAIM"
        finalDisposition = "REMAIN_UNOWNED_REGISTRY_OWNER_VS_SEQUENCE_REVIEW"
        perPageNote = "identity_registry_owned_sequence_mismatch_claim"
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REVIEW)
        const cleaner = pickCleanerSheetTitleForIdentityConflict(page, hints)
        if (cleaner) page.final.sheetTitle = cleaner
      } else if (
        a.gapFillFirstBlockReason === "hint_contradicts_sequence" &&
        a.contradictionStrength === "STRONG"
      ) {
        sequenceContradictionPages += 1
        conflictType = "PAGE_STRONG_IDENTITY_CONTRADICTS_INDEX_SEQUENCE"
        finalDisposition = "PRESERVE_PAGE_STRONG_IDENTITY_VS_INDEX_REVIEW"
        perPageNote = "identity_sequence_strong_contradiction"
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_CONFLICTS_INDEX)
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REVIEW)
        page.evidence = mergeEvidence(
          page.evidence,
          `Drawing index order implies sheet ${a.expectedRegistrySheetNumber ?? expectedLk ?? "?"} for this page; strong title-block identity disagrees — preserved page identity for review.`,
        )
        const cleaner = pickCleanerSheetTitleForIdentityConflict(page, hints)
        if (cleaner) page.final.sheetTitle = cleaner
        page.evidence = mergeEvidence(
          page.evidence,
          "Title source: PAGE_CLAIMED_TITLE_CLEANED (index vs identity conflict).",
        )
      } else if (a.gapFillFirstBlockReason === "hint_contradicts_sequence") {
        unresolvedConflictPages += 1
        conflictType = "PAGE_HINT_WEAKLY_CONTRADICTS_SEQUENCE"
        finalDisposition = "REMAIN_UNOWNED_WEAK_HINT_VS_SEQUENCE_REVIEW"
        perPageNote = "identity_sequence_weak_contradiction"
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_WEAK_HINT)
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REVIEW)
        const cleaner = pickCleanerSheetTitleForIdentityConflict(page, hints)
        if (cleaner) page.final.sheetTitle = cleaner
      } else {
        unresolvedConflictPages += 1
        conflictType = "UNRESOLVED_SEQUENCE_OR_CLASSIFICATION"
        finalDisposition = a.finalDisposition
        perPageNote = "identity_unresolved_other"
        pushUniqueReviewReason(page, DRAWING_IDENTITY_REASON_REVIEW)
        const cleaner = pickCleanerSheetTitleForIdentityConflict(page, hints)
        if (cleaner) page.final.sheetTitle = cleaner
      }

      page.review.status = "REVIEW_REQUIRED" as IntakeReviewStatus
      if (!prevReviewRequired) identityConflictReviewAdds += 1

      const ppRow = perPage.find(
        (row) => row.pageNumber === a.pageNumber && row.status === "NOT_IN_REGISTRY",
      )
      if (ppRow && !ppRow.notes.includes(perPageNote)) {
        ppRow.notes = [...ppRow.notes, perPageNote]
      }

      if (exampleConflicts.length < 12) {
        exampleConflicts.push({
          pageNumber: a.pageNumber,
          expectedRegistrySheetNumber: a.expectedRegistrySheetNumber,
          currentHintSheetNumber: a.currentHintSheetNumber,
          currentAiSheetNumber: a.currentAiSheetNumber,
          conflictType,
          finalDisposition,
        })
      }
    }

    reviewRequiredPages += identityConflictReviewAdds

    const repeatedSheetNumberPages =
      secondaryDuplicateIdentityPages + primaryOwnersInRepeatEvents.size

    console.log("visibleIntake:identityConflictSummary", {
      repeatedSheetNumberPages,
      sequenceContradictionPages,
      primaryOwnedPages,
      secondaryDuplicateIdentityPages,
      unresolvedConflictPages,
      exampleConflicts,
    })

    console.log("visibleIntake:unownedPageAudit", { pages: audits })
    console.log("visibleIntake:unownedPageAuditSummary", {
      totalUnownedPages: audits.length,
      contradictionBlocks,
      weakContradictions,
      strongContradictions,
      sequenceBreaks,
      alreadyOwnedBlocks,
      otherBlocks,
    })
  } else {
    console.log("visibleIntake:unownedPageAudit", { pages: [] })
    console.log("visibleIntake:unownedPageAuditSummary", {
      totalUnownedPages: 0,
      contradictionBlocks: 0,
      weakContradictions: 0,
      strongContradictions: 0,
      sequenceBreaks: 0,
      alreadyOwnedBlocks: 0,
      otherBlocks: 0,
    })
    console.log("visibleIntake:identityConflictSummary", {
      repeatedSheetNumberPages: 0,
      sequenceContradictionPages: 0,
      primaryOwnedPages: 0,
      secondaryDuplicateIdentityPages: 0,
      unresolvedConflictPages: 0,
      exampleConflicts: [],
    })
  }

  if (authorityActive) {
    perPage.sort((a, b) => a.pageNumber - b.pageNumber)
  }

  let missingEntries = 0
  if (authorityKind === "DRAWING_INDEX") {
    for (const key of drawingMap.keys()) {
      if (!matchedDrawingKeys.has(key)) missingEntries += 1
    }
  } else if (authorityKind === "SPEC_TOC") {
    for (const key of specMap.keys()) {
      if (!matchedSpecKeys.has(key)) missingEntries += 1
    }
  }

  if (authorityActive && authorityKind === "DRAWING_INDEX") {
    const exclusiveClaims = Math.max(0, matchedPages - duplicateMatches)
    console.log("visibleIntake:registryOwnershipSummary", {
      registryEntryCount: totalEntries,
      orderedClaims: orderedClaimsInValidation,
      exclusiveClaims,
      duplicateConflicts: duplicateMatches,
      reclaimedAssignments: reconciledOrdinalRecoveries,
      remainingUnownedEntries: missingEntries,
      pagesEscalatedForOwnershipConflict: duplicateMatches,
    })
  }

  const validation: RegistryValidationResult = {
    authorityActive: true,
    authorityKind,
    reasonInactive: null,
    documentAddendumLabel: frontStructureScan.addendumLabel,
    frontStructureConfidence: frontStructureScan.confidence,
    totalEntries,
    perPage,
    summary: {
      registryFound: true,
      registryType: authorityKind,
      totalEntries,
      matchedPages,
      blankPages,
      unmatchedPages,
      duplicateMatches,
      missingEntries,
      reviewRequiredPages,
    },
  }

  const intakeOut: IntakeRunResult = {
    ...intake,
    pages: pagesOut,
  }

  return { intake: intakeOut, validation }
}

export function summarizeRegistryValidation(v: RegistryValidationResult): {
  registryFound: boolean
  registryType: RegistryAuthorityKind
  totalEntries: number
  matchedPages: number
  blankPages: number
  unmatchedPages: number
  duplicateMatches: number
  missingEntries: number
  addendumLabel: string | null
} {
  return {
    registryFound: v.summary.registryFound,
    registryType: v.summary.registryType,
    totalEntries: v.summary.totalEntries,
    matchedPages: v.summary.matchedPages,
    blankPages: v.summary.blankPages,
    unmatchedPages: v.summary.unmatchedPages,
    duplicateMatches: v.summary.duplicateMatches,
    missingEntries: v.summary.missingEntries,
    addendumLabel: v.documentAddendumLabel,
  }
}
