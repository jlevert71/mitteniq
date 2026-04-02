/**
 * Canonical sheet registry from AI index extraction + deterministic page verification.
 */

import type { IntakeNormalizedPage, IntakePreparedPage } from "./types"
import type { RegistrySkipEntry } from "./visible-intake-selection"

export type ExtractedIndexSheetRow = {
  sheetNumber: string
  sheetTitle: string
}

export type CanonicalSheetRegistry = {
  /** Literal display string from index (zero-padding preserved). */
  byLiteral: Map<string, { title: string; sourcePage: number }>
  /** `${L}-${n}` → literal key (first wins). */
  byLogical: Map<string, string>
}

function collapseHyphens(s: string): string {
  return s.replace(/[–—]/g, "-")
}

export function logicalKeyFromSheetId(raw: string): string | null {
  const m = collapseHyphens(raw)
    .trim()
    .toUpperCase()
    .match(/^([A-Z])-0*(\d{1,4})$/)
  if (!m) return null
  const n = parseInt(m[2], 10)
  if (!Number.isFinite(n) || n < 0 || n > 9999) return null
  return `${m[1]}-${n}`
}

function normalizeTitleKey(t: string): string {
  return collapseHyphens(t)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function buildCanonicalSheetRegistryFromRows(
  rows: ExtractedIndexSheetRow[],
  sourcePage: number,
): CanonicalSheetRegistry {
  const byLiteral = new Map<string, { title: string; sourcePage: number }>()
  const byLogical = new Map<string, string>()

  for (const r of rows) {
    const lit = collapseHyphens(r.sheetNumber).replace(/\s+/g, " ").trim().toUpperCase()
    const title = r.sheetTitle.replace(/\s+/g, " ").trim().slice(0, 240)
    if (!lit || !title || title.length < 2) continue
    const lk = logicalKeyFromSheetId(lit)
    if (!lk) continue
    if (!byLiteral.has(lit)) {
      byLiteral.set(lit, { title, sourcePage })
    }
    if (!byLogical.has(lk)) {
      byLogical.set(lk, lit)
    }
  }

  return { byLiteral, byLogical }
}

function pageCombinedText(page: IntakePreparedPage): string {
  const raw = page.rawText.normalizedText?.trim() ?? page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText ?? ""
  return [raw, ocr].filter(Boolean).join("\n")
}

function collectSheetIdCandidatesFromText(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /\b([A-Z])-0*(\d{1,4})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = collapseHyphens(m[0]).trim().toUpperCase()
    const lk = logicalKeyFromSheetId(raw)
    if (lk && !seen.has(lk)) {
      seen.add(lk)
      out.push(raw)
    }
  }
  return out
}

function titleStrongMatch(pageTitle: string | null, registryTitle: string): boolean {
  const a = normalizeTitleKey(pageTitle ?? "")
  const b = normalizeTitleKey(registryTitle)
  if (a.length < 6 || b.length < 6) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return false
}

export type PageVerificationOutcome = {
  matchedSkips: Array<{ pageNumber: number; entry: RegistrySkipEntry }>
  /** Pages that need full `runAiIntake`. */
  escalatedPageNumbers: number[]
  /** Non-index, non-drawing-route pages filled without LLM. */
  generalStubPages: Map<number, IntakeNormalizedPage>
  matchedViaRegistry: number
  unmatchedPages: number
  escalatedToAi: number
}

export function verifyDrawingPagesAgainstCanonicalRegistry(params: {
  preparedPages: IntakePreparedPage[]
  indexPageNumbers: Set<number>
  registry: CanonicalSheetRegistry
  blankSkipPageNumbers: Set<number>
}): PageVerificationOutcome {
  const { preparedPages, indexPageNumbers, registry, blankSkipPageNumbers } = params

  const matchedSkips: Array<{ pageNumber: number; entry: RegistrySkipEntry }> = []
  const escalatedPageNumbers: number[] = []
  const generalStubPages = new Map<number, IntakeNormalizedPage>()
  let matchedViaRegistry = 0
  let unmatchedPages = 0
  let escalatedToAi = 0

  for (const page of preparedPages) {
    const pn = page.pageNumber
    if (blankSkipPageNumbers.has(pn) || indexPageNumbers.has(pn)) continue

    if (page.routing.likelyType !== "DRAWING") {
      generalStubPages.set(pn, buildMinimalNonDrawingStub(page))
      continue
    }

    const text = pageCombinedText(page)
    const head = text.split(/\n/).slice(0, 100).join("\n")
    const hints = page.drawingIdentityHints
    const hintNum = hints?.sheetNumberCandidate?.trim() ?? ""
    const hintTitle = hints?.sheetTitleCandidate?.trim() ?? null

    let resolvedLiteral: string | null = null
    let resolvedTitle: string | null = null

    if (hintNum) {
      const litTry = collapseHyphens(hintNum).trim().toUpperCase()
      if (registry.byLiteral.has(litTry)) {
        resolvedLiteral = litTry
        resolvedTitle = registry.byLiteral.get(litTry)!.title
      } else {
        const hlk = logicalKeyFromSheetId(litTry)
        if (hlk && registry.byLogical.has(hlk)) {
          resolvedLiteral = registry.byLogical.get(hlk)!
          resolvedTitle = registry.byLiteral.get(resolvedLiteral)!.title
        }
      }
    }

    if (!resolvedLiteral) {
      const candidates = collectSheetIdCandidatesFromText(head)
      const hits: string[] = []
      for (const c of candidates) {
        const lit = collapseHyphens(c).trim().toUpperCase()
        if (registry.byLiteral.has(lit)) hits.push(lit)
        else {
          const lk = logicalKeyFromSheetId(lit)
          if (lk && registry.byLogical.has(lk)) hits.push(registry.byLogical.get(lk)!)
        }
      }
      const uniq = [...new Set(hits)]
      if (uniq.length === 1) {
        resolvedLiteral = uniq[0]!
        resolvedTitle = registry.byLiteral.get(resolvedLiteral)!.title
      }
    }

    if (!resolvedLiteral && hintTitle) {
      const matches: string[] = []
      for (const [lit, row] of registry.byLiteral) {
        if (titleStrongMatch(hintTitle, row.title)) matches.push(lit)
      }
      if (matches.length === 1) {
        resolvedLiteral = matches[0]!
        resolvedTitle = registry.byLiteral.get(resolvedLiteral)!.title
      }
    }

    if (resolvedLiteral && resolvedTitle) {
      matchedViaRegistry += 1
      matchedSkips.push({
        pageNumber: pn,
        entry: {
          kind: "drawing",
          sheetNumber: resolvedLiteral,
          title: resolvedTitle.slice(0, 240),
          resolutionCode: "DETERMINISTIC_PROBABLE",
          orderedResolutionLabel: "INDEX_FIRST_CANONICAL_REGISTRY",
        },
      })
      continue
    }

    unmatchedPages += 1
    const hasHint = Boolean(hintNum && logicalKeyFromSheetId(hintNum))
    const hasTextIds = collectSheetIdCandidatesFromText(head).length > 0
    if (!hasHint && !hasTextIds) {
      escalatedToAi += 1
      escalatedPageNumbers.push(pn)
    } else {
      generalStubPages.set(pn, buildDrawingUnmatchedIndexFirstStub(page))
    }
  }

  return {
    matchedSkips,
    escalatedPageNumbers,
    generalStubPages,
    matchedViaRegistry,
    unmatchedPages,
    escalatedToAi,
  }
}

function buildDrawingUnmatchedIndexFirstStub(prepared: IntakePreparedPage): IntakeNormalizedPage {
  const hintNum = prepared.drawingIdentityHints?.sheetNumberCandidate?.trim() ?? null
  const hintTitle = prepared.drawingIdentityHints?.sheetTitleCandidate?.trim() ?? null
  return {
    pageNumber: prepared.pageNumber,
    final: {
      pageClass: "DRAWING",
      pageSubtype: "BODY_PAGE",
      sheetNumber: hintNum,
      sheetTitle: hintTitle ?? "Drawing sheet",
      discipline: null,
      sectionNumber: null,
      sectionTitle: null,
      electricalRelevance: null,
      scaleStatus: "UNVERIFIED",
      scaleConfidence: 50,
      printSize: prepared.pdfFacts.printSize,
    },
    aiSignals: {
      structuralRole: "DRAWING_PAGE",
      sectionSignalStrength: "NONE",
      packetSignalStrength: "NONE",
      isLikelySectionStart: false,
      isLikelySectionContinuation: false,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    anchor: null,
    confidence: { overall: 0.58 },
    review: {
      status: "REVIEW_REQUIRED",
      reasons: ["INDEX_FIRST_SHEET_NOT_IN_AI_REGISTRY"],
    },
    evidence:
      "Index-first: sheet-like signal on page but no row matched AI-extracted index; no full-page AI run.",
  }
}

function buildMinimalNonDrawingStub(prepared: IntakePreparedPage): IntakeNormalizedPage {
  const st =
    prepared.specSignals.detectedSectionTitle?.trim() ||
    prepared.specSignals.headerHint?.trim() ||
    "Document page"
  return {
    pageNumber: prepared.pageNumber,
    final: {
      pageClass: "GENERAL_DOCUMENT",
      pageSubtype: "BODY_PAGE",
      sheetNumber: null,
      sheetTitle: st.slice(0, 180),
      discipline: null,
      sectionNumber: prepared.specSignals.detectedSectionNumber,
      sectionTitle: prepared.specSignals.detectedSectionTitle,
      electricalRelevance: null,
      scaleStatus: "NO_SCALE_NEEDED",
      scaleConfidence: 80,
      printSize: prepared.pdfFacts.printSize,
    },
    aiSignals: {
      structuralRole: prepared.specSignals.likelyIndexOrTocPage ? "TABLE_OF_CONTENTS" : "OTHER",
      sectionSignalStrength: "WEAK",
      packetSignalStrength: "NONE",
      isLikelySectionStart: false,
      isLikelySectionContinuation: true,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    anchor: null,
    confidence: { overall: 0.62 },
    review: { status: "NOT_REQUIRED", reasons: ["INDEX_FIRST_NON_DRAWING_STUB"] },
    evidence: "Index-first pipeline: non-drawing route page filled without full document AI.",
  }
}

export function buildIndexExtractionPageStub(prepared: IntakePreparedPage): IntakeNormalizedPage {
  return {
    pageNumber: prepared.pageNumber,
    final: {
      pageClass: "GENERAL_DOCUMENT",
      pageSubtype: "INDEX_PAGE",
      sheetNumber: null,
      sheetTitle: "Sheet index",
      discipline: null,
      sectionNumber: null,
      sectionTitle: null,
      electricalRelevance: null,
      scaleStatus: "NO_SCALE_NEEDED",
      scaleConfidence: 90,
      printSize: prepared.pdfFacts.printSize,
    },
    aiSignals: {
      structuralRole: "INDEX_PAGE",
      sectionSignalStrength: "STRONG",
      packetSignalStrength: "NONE",
      isLikelySectionStart: false,
      isLikelySectionContinuation: false,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    anchor: null,
    confidence: { overall: 0.8 },
    review: { status: "NOT_REQUIRED", reasons: ["INDEX_FIRST_TARGETED_EXTRACTION"] },
    evidence:
      "Index-first: sheet list extracted via targeted LLM on index page(s) only; not full per-page interpretation.",
  }
}
