/**
 * Deterministic title-block drawing identity hints (no npm deps).
 * Intended for pages already routed as DRAWING.
 */

import {
  lookupRegistryEntry,
  type DrawingSetRegistry,
} from "./drawing-set-registry"
import {
  POSITIONAL_EVIDENCE_CONFIDENCE,
  type DrawingSheetIdCandidateKind,
  type IntakeDrawingIdentityHints,
  type IntakePreparedPage,
} from "./types"

const TITLE_BLOCK_LABEL_RE =
  /DRAWING\s*(?:NO|NUMBER|#)|\bSHEET\b|\bDRAWING\b|\bTITLE\b|\bSCALE\b|DATE\s+OF\s+PLAN|JOB\s*(?:NO|NUMBER|#)/i

const DRAWING_NO_NEAR_RE = /DRAWING\s*NO/i

/** D/E/I with optional spaces: D-1, D - 001, E-06, I-1 */
const DEI_SHEET_RE = /\b([DEI])\s*-\s*(\d{1,3})\b/gi

/** Project-style C-#### */
const C_PROJECT_RE = /\b(C)\s*-\s*(\d{4,})\b/gi

/** Shorter C-## (1–3 digit suffix; does not overlap C-####) */
const C_SHORT_RE = /\b(C)\s*-\s*(\d{1,3})\b/gi

const TITLEISH_RE =
  /\b(PLAN|DIAGRAM|LEGEND|DETAIL|SCHEDULE|PIPING|WIRING|ELECTRICAL|PROPOSED|REMOVAL|CONDUIT|RACK|HANGERS?|PUMP|HORIZONTAL|VERTICAL|ROOM|POWER|ONE[-\s]?LINE|PROCESS|HSCP)\b/i

const MAX_SHEET_TITLE_LEN = 100
const MAX_TITLE_WORDS = 14

const DEBUG_DRAWING_IDENTITY =
  typeof process !== "undefined" && process.env.DEBUG_DRAWING_IDENTITY === "1"

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function collapseHyphens(s: string): string {
  return s.replace(/[–—]/g, "-")
}

function rawTextForScan(page: IntakePreparedPage): string {
  const n = page.rawText.normalizedText?.trim()
  if (n) return n
  return normalizeSpaces(page.rawText.fullText ?? "")
}

function ocrTextForScan(page: IntakePreparedPage): string {
  const n = page.ocrText.normalizedText?.trim()
  if (n) return n
  return normalizeSpaces(page.ocrText.fullText ?? "")
}

function combinedPageText(page: IntakePreparedPage): string {
  return normalizeSpaces([rawTextForScan(page), ocrTextForScan(page)].filter(Boolean).join(" \n "))
}

function effectiveGeometryTrust(page: IntakePreparedPage): number {
  return (
    page.positionalEvidence?.confidence ??
    POSITIONAL_EVIDENCE_CONFIDENCE.NATIVE_PDF_POSITIONS
  )
}

/** Scales title-block / band region score bonuses when x/y are approximated, not pdf.js-native. */
function geometryRegionWeight(trust: number): number {
  if (trust >= 0.9) return 1
  return 0.55 + 0.45 * Math.min(1, trust / 0.55)
}

function hasTitleBlockContext(text: string, matchIndex: number, window = 100): boolean {
  const start = Math.max(0, matchIndex - window)
  const end = Math.min(text.length, matchIndex + window)
  return TITLE_BLOCK_LABEL_RE.test(text.slice(start, end))
}

function hasDrawingNoNear(text: string, matchIndex: number, window = 55): boolean {
  const start = Math.max(0, matchIndex - window)
  const end = Math.min(text.length, matchIndex + window)
  return DRAWING_NO_NEAR_RE.test(text.slice(start, end))
}

function isParagraphLikeTitle(s: string): boolean {
  const t = s.trim()
  if (t.length > MAX_SHEET_TITLE_LEN) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > MAX_TITLE_WORDS) return true
  if ((t.match(/[.!?]/g) ?? []).length >= 2) return true
  return false
}

type Region = { key: string; text: string; priority: number }

function collectRegions(page: IntakePreparedPage): Region[] {
  const le = page.layoutEvidence
  const regions: Region[] = []
  if (le.lowYRightCornerText?.trim()) {
    regions.push({ key: "lowYRightCorner", text: le.lowYRightCornerText, priority: 0 })
  }
  if (le.lowYBandText?.trim()) {
    regions.push({ key: "lowYBand", text: le.lowYBandText, priority: 1 })
  }
  if (le.highYRightCornerText?.trim()) {
    regions.push({ key: "highYRightCorner", text: le.highYRightCornerText, priority: 2 })
  }
  const combined = combinedPageText(page)
  if (combined) {
    regions.push({ key: "fullTextCombined", text: combined, priority: 3 })
  }
  return regions
}

type SheetFormatKind = "DEI" | "C_PROJECT" | "C_SHORT" | "SYNTHETIC"

type ScoredDrawingMatch = {
  id: string
  index: number
  regionKey: string
  regionPriority: number
  hasTitleBlockContext: boolean
  nearDrawingNo: boolean
  registryBonus: number
  score: number
  formatKind: SheetFormatKind
}

function normalizeDeiId(letter: string, digits: string): string {
  return `${letter.toUpperCase()}-${digits}`.toUpperCase()
}

function collectDeiMatches(
  text: string,
  regionKey: string,
  regionPriority: number,
  registry: DrawingSetRegistry,
  geometryTrust: number,
): ScoredDrawingMatch[] {
  const out: ScoredDrawingMatch[] = []
  const t = collapseHyphens(text)
  let m: RegExpExecArray | null
  const re = new RegExp(DEI_SHEET_RE.source, DEI_SHEET_RE.flags)
  const gw = geometryRegionWeight(geometryTrust)
  while ((m = re.exec(t)) !== null) {
    const id = normalizeDeiId(m[1] ?? "", m[2] ?? "")
    const idx = m.index
    const nearSlice = t.slice(Math.max(0, idx - 35), Math.min(t.length, idx + 35))
    if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(nearSlice)) continue

    const hasCtx = hasTitleBlockContext(t, idx)
    const nearDn = hasDrawingNoNear(t, idx)
    const regHit = lookupRegistryEntry(registry, id)
    const registryBonus = regHit ? 95 : 0

    let score = 40
    score += (3 - regionPriority) * 22 * gw
    if (hasCtx) score += 38
    if (nearDn) score += 52
    score += registryBonus
    if (regionPriority === 0) score += 28 * gw
    if (geometryTrust < 0.88 && regionPriority <= 1) {
      score -= Math.round(18 * ((0.88 - geometryTrust) / 0.43))
    }

    out.push({
      id,
      index: idx,
      regionKey,
      regionPriority,
      hasTitleBlockContext: hasCtx,
      nearDrawingNo: nearDn,
      registryBonus,
      score,
      formatKind: "DEI",
    })
  }
  return out
}

function collectCProjectMatches(
  text: string,
  regionKey: string,
  regionPriority: number,
  geometryTrust: number,
): ScoredDrawingMatch[] {
  const out: ScoredDrawingMatch[] = []
  const t = collapseHyphens(text)
  let m: RegExpExecArray | null
  const re = new RegExp(C_PROJECT_RE.source, C_PROJECT_RE.flags)
  const gw = geometryRegionWeight(geometryTrust)
  while ((m = re.exec(t)) !== null) {
    const id = `C-${m[2]}`.toUpperCase()
    const idx = m.index
    const nearSlice = t.slice(Math.max(0, idx - 35), Math.min(t.length, idx + 35))
    if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(nearSlice)) continue

    const hasCtx = hasTitleBlockContext(t, idx)
    const nearDn = hasDrawingNoNear(t, idx)

    let score = 28
    score += (3 - regionPriority) * 16 * gw
    if (hasCtx) score += 24
    if (nearDn) score += 18
    if (regionPriority === 0) score += 14 * gw
    if (geometryTrust < 0.88 && regionPriority <= 1) {
      score -= Math.round(12 * ((0.88 - geometryTrust) / 0.43))
    }

    out.push({
      id,
      index: idx,
      regionKey,
      regionPriority,
      hasTitleBlockContext: hasCtx,
      nearDrawingNo: nearDn,
      registryBonus: 0,
      score,
      formatKind: "C_PROJECT",
    })
  }
  return out
}

function collectCShortMatches(
  text: string,
  regionKey: string,
  regionPriority: number,
  geometryTrust: number,
): ScoredDrawingMatch[] {
  const out: ScoredDrawingMatch[] = []
  const t = collapseHyphens(text)
  let m: RegExpExecArray | null
  const re = new RegExp(C_SHORT_RE.source, C_SHORT_RE.flags)
  const gw = geometryRegionWeight(geometryTrust)
  while ((m = re.exec(t)) !== null) {
    const digits = m[2] ?? ""
    if (digits.length >= 4) continue
    const id = `C-${digits}`.toUpperCase()
    const idx = m.index

    const hasCtx = hasTitleBlockContext(t, idx)
    const nearDn = hasDrawingNoNear(t, idx)

    let score = 26
    score += (3 - regionPriority) * 14 * gw
    if (hasCtx) score += 20
    if (nearDn) score += 14
    if (regionPriority === 0) score += 12 * gw
    if (geometryTrust < 0.88 && regionPriority <= 1) {
      score -= Math.round(10 * ((0.88 - geometryTrust) / 0.43))
    }

    out.push({
      id,
      index: idx,
      regionKey,
      regionPriority,
      hasTitleBlockContext: hasCtx,
      nearDrawingNo: nearDn,
      registryBonus: 0,
      score,
      formatKind: "C_SHORT",
    })
  }
  return out
}

function collectAllMatchesForRegion(
  text: string,
  regionKey: string,
  regionPriority: number,
  registry: DrawingSetRegistry,
  geometryTrust: number,
): ScoredDrawingMatch[] {
  return [
    ...collectDeiMatches(text, regionKey, regionPriority, registry, geometryTrust),
    ...collectCProjectMatches(text, regionKey, regionPriority, geometryTrust),
    ...collectCShortMatches(text, regionKey, regionPriority, geometryTrust),
  ]
}

type DrawingIdentityPickMeta = {
  allCandidates: ScoredDrawingMatch[]
  usedOcrOnlyFallback: boolean
  usedSyntheticFallback: boolean
}

function pickBestDrawingNumberWithMeta(
  regions: Region[],
  registry: DrawingSetRegistry,
  page: IntakePreparedPage,
): { best: ScoredDrawingMatch; meta: DrawingIdentityPickMeta } {
  const geometryTrust = effectiveGeometryTrust(page)
  const allCandidates: ScoredDrawingMatch[] = []
  for (const r of regions) {
    allCandidates.push(
      ...collectAllMatchesForRegion(r.text, r.key, r.priority, registry, geometryTrust),
    )
  }

  let usedOcrOnlyFallback = false
  if (!allCandidates.length) {
    const ocrOnly = ocrTextForScan(page)
    if (ocrOnly) {
      usedOcrOnlyFallback = true
      const ocrTrust = Math.min(
        geometryTrust,
        POSITIONAL_EVIDENCE_CONFIDENCE.APPROXIMATED_FROM_OCR,
      )
      allCandidates.push(
        ...collectAllMatchesForRegion(ocrOnly, "ocrTextOnly", 4, registry, ocrTrust),
      )
    }
  }

  let usedSyntheticFallback = false
  let best: ScoredDrawingMatch
  if (allCandidates.length) {
    allCandidates.sort((a, b) => b.score - a.score)
    best = allCandidates[0]!
  } else {
    usedSyntheticFallback = true
    const id = `PAGE-${page.pageNumber}`
    best = {
      id,
      index: 0,
      regionKey: "syntheticPageFallback",
      regionPriority: 99,
      hasTitleBlockContext: false,
      nearDrawingNo: false,
      registryBonus: 0,
      score: -1000,
      formatKind: "SYNTHETIC",
    }
    allCandidates.push(best)
  }

  return {
    best,
    meta: { allCandidates, usedOcrOnlyFallback, usedSyntheticFallback },
  }
}

function extractTitleNearSheetInRegion(
  text: string,
  match: ScoredDrawingMatch,
  strictTitleBlock: boolean,
): string | null {
  const t = collapseHyphens(text)
  const window = t.slice(
    Math.max(0, match.index - 140),
    Math.min(t.length, match.index + 260),
  )

  const parts = window.split(/\n+|\s{3,}|\s*\/\s*/)
  let best: string | null = null
  let bestScore = 0

  for (const part of parts) {
    const p = normalizeSpaces(part)
    if (p.length < 6) continue
    if (p.length > MAX_SHEET_TITLE_LEN && strictTitleBlock) continue
    if (isParagraphLikeTitle(p)) continue
    if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(p)) continue
    if (/\bC-\d{4,}\b/i.test(p)) continue
    if (new RegExp(`\\b${match.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(p) && p.length < 14) {
      continue
    }
    if (/^\d+$/.test(p)) continue
    if (!/[A-Za-z]{2,}/.test(p)) continue

    let score = 0
    if (TITLEISH_RE.test(p)) score += 55
    score += Math.min(p.length, 90) / 5
    if (p === p.toUpperCase() && p.length > 10) score += 10
    if (strictTitleBlock) score += 20

    if (score > bestScore) {
      bestScore = score
      best = p.slice(0, MAX_SHEET_TITLE_LEN)
    }
  }

  return best
}

function bestTitleFromTitleBlockRegions(
  regions: Region[],
  match: ScoredDrawingMatch,
): { title: string | null; titleBlockPreferred: boolean } {
  let best: string | null = null
  let bestScore = 0
  let titleBlockPreferred = false

  for (const r of regions) {
    if (r.priority > 1) continue
    const strict = r.priority <= 1
    const title = extractTitleNearSheetInRegion(r.text, match, strict)
    if (!title) continue
    let score = TITLEISH_RE.test(title) ? 45 : 0
    score += Math.min(title.length, 90) / 4
    score += (2 - r.priority) * 15
    if (score > bestScore) {
      bestScore = score
      best = title
      titleBlockPreferred = true
    }
  }

  return { title: best, titleBlockPreferred }
}

/** Try title from any region including full combined / OCR-only text */
function bestTitleFromAnyRegion(
  regions: Region[],
  match: ScoredDrawingMatch,
  ocrOnlyText: string,
): { title: string | null; titleBlockPreferred: boolean } {
  const fromBlocks = bestTitleFromTitleBlockRegions(regions, match)
  if (fromBlocks.title) return fromBlocks

  const extraRegions: Region[] = [
    ...regions.filter((r) => r.priority >= 3),
    ...(ocrOnlyText ? [{ key: "ocrTitleScan", text: ocrOnlyText, priority: 4 } as Region] : []),
  ]
  let best: string | null = null
  let bestScore = 0
  for (const r of extraRegions) {
    const title = extractTitleNearSheetInRegion(r.text, match, false)
    if (!title || isParagraphLikeTitle(title)) continue
    let score = TITLEISH_RE.test(title) ? 30 : 0
    score += Math.min(title.length, 90) / 6
    if (score > bestScore) {
      bestScore = score
      best = title
    }
  }
  return { title: best, titleBlockPreferred: false }
}

const EMPTY_REGISTRY: DrawingSetRegistry = { byLogicalKey: new Map(), entries: [] }

export function extractDrawingIdentityHintsForDrawingPage(
  page: IntakePreparedPage,
  registry: DrawingSetRegistry,
): IntakeDrawingIdentityHints {
  const ocrOnly = ocrTextForScan(page)
  let regions = collectRegions(page)
  if (!regions.length && combinedPageText(page)) {
    regions = [{ key: "fullTextCombined", text: combinedPageText(page), priority: 3 }]
  }
  if (!regions.length && ocrOnly) {
    regions = [{ key: "ocrTextOnly", text: ocrOnly, priority: 4 }]
  }

  const { best: drawingMatch, meta } = pickBestDrawingNumberWithMeta(regions, registry, page)

  if (DEBUG_DRAWING_IDENTITY) {
    console.log("drawingIdentity:extract", {
      pageNumber: page.pageNumber,
      candidateCount: meta.allCandidates.length,
      topCandidate: drawingMatch.id,
      usedOcrOnlyFallback: meta.usedOcrOnlyFallback,
      usedSyntheticFallback: meta.usedSyntheticFallback,
      regionKeys: regions.map((r) => r.key),
      positionalEvidence: page.positionalEvidence?.source ?? null,
      positionalConfidence: effectiveGeometryTrust(page),
    })
  }

  const regEntry =
    drawingMatch.formatKind === "DEI" ? lookupRegistryEntry(registry, drawingMatch.id) : null
  const canonicalNumber = regEntry?.canonicalSheetNumber ?? drawingMatch.id

  const { title: blockTitle, titleBlockPreferred } =
    drawingMatch.formatKind === "SYNTHETIC"
      ? { title: null as string | null, titleBlockPreferred: false }
      : bestTitleFromAnyRegion(regions, drawingMatch, ocrOnly)

  let sheetTitle: string | null = null
  let titleRegistryValidated = false

  if (regEntry) {
    sheetTitle = regEntry.canonicalTitle.slice(0, MAX_SHEET_TITLE_LEN)
    titleRegistryValidated = true
  } else {
    sheetTitle = blockTitle
    if (!sheetTitle && drawingMatch.formatKind !== "SYNTHETIC" && drawingMatch.regionPriority <= 2) {
      for (const r of regions) {
        if (r.priority > 2) continue
        const t = extractTitleNearSheetInRegion(r.text, drawingMatch, r.priority <= 1)
        if (t) {
          sheetTitle = t
          break
        }
      }
    }
    if (!sheetTitle && drawingMatch.formatKind !== "SYNTHETIC") {
      for (const r of regions) {
        if (r.priority <= 2) continue
        const t = extractTitleNearSheetInRegion(r.text, drawingMatch, false)
        if (t && !isParagraphLikeTitle(t)) {
          sheetTitle = t
          break
        }
      }
    }
    if (!sheetTitle && drawingMatch.formatKind !== "SYNTHETIC") {
      const loose = bestTitleFromAnyRegion(regions, drawingMatch, ocrOnly)
      sheetTitle = loose.title
    }
  }

  if (sheetTitle && isParagraphLikeTitle(sheetTitle)) {
    sheetTitle = regEntry?.canonicalTitle.slice(0, MAX_SHEET_TITLE_LEN) ?? null
    titleRegistryValidated = Boolean(regEntry)
  }

  const evidence: string[] = [
    `sheet:${canonicalNumber}@${drawingMatch.regionKey}${drawingMatch.nearDrawingNo ? "+drawingNo" : ""}${regEntry ? "+registry" : ""}${meta.usedOcrOnlyFallback ? "+ocrOnlyScan" : ""}${meta.usedSyntheticFallback ? "+syntheticPageFallback" : ""}`,
  ]
  if (sheetTitle) {
    evidence.push(`title:${sheetTitle.slice(0, 72)}${sheetTitle.length > 72 ? "…" : ""}`)
  }
  const layoutNote = page.layoutEvidence.positionalLayoutNote?.trim()
  if (layoutNote) {
    evidence.push(layoutNote)
  }

  const geometryTrust = effectiveGeometryTrust(page)
  let confidence = 0.82
  if (drawingMatch.formatKind === "SYNTHETIC") {
    confidence = 0.32
  } else if (regEntry) {
    confidence = sheetTitle ? 0.97 : 0.93
  } else if (drawingMatch.registryBonus > 0) {
    confidence = sheetTitle ? 0.96 : 0.92
  } else if (drawingMatch.nearDrawingNo && drawingMatch.regionPriority <= 1) {
    confidence = sheetTitle ? 0.95 : 0.91
  } else if (drawingMatch.hasTitleBlockContext && drawingMatch.regionPriority <= 2) {
    confidence = sheetTitle ? 0.94 : 0.9
  } else if (drawingMatch.regionPriority <= 1) {
    confidence = sheetTitle ? 0.92 : 0.88
  } else if (drawingMatch.regionPriority === 2) {
    confidence = sheetTitle ? 0.9 : 0.86
  } else if (drawingMatch.regionPriority <= 4) {
    confidence = sheetTitle ? 0.78 : 0.72
  } else {
    confidence = sheetTitle ? 0.84 : 0.8
  }

  if (meta.usedOcrOnlyFallback && drawingMatch.formatKind !== "SYNTHETIC") {
    confidence = Math.max(0.2, confidence - 0.08)
  }

  if (drawingMatch.formatKind !== "SYNTHETIC") {
    confidence *= 0.58 + 0.42 * geometryTrust
  }

  const selectedKind: DrawingSheetIdCandidateKind =
    drawingMatch.formatKind === "SYNTHETIC"
      ? "PAGE_LABEL"
      : drawingMatch.formatKind === "DEI"
        ? "DRAWING_NUMBER"
        : drawingMatch.formatKind === "C_PROJECT"
          ? "PROJECT_NUMBER"
          : "INTERNAL_TAG"

  const registryValidated = Boolean(regEntry)
  const registryAssistMessage = registryValidated
    ? `canonicalized to ${canonicalNumber}${sheetTitle ? ` — ${sheetTitle}` : ""}`
    : null

  return {
    sheetNumberCandidate: canonicalNumber,
    sheetTitleCandidate: sheetTitle,
    titleBlockEvidence: evidence,
    confidence: Math.round(Math.min(0.99, Math.max(0, confidence)) * 100) / 100,
    selectedCandidateKind: selectedKind,
    registryValidated,
    titleRegistryValidated,
    sheetTitleTitleBlockPreferred: titleBlockPreferred && Boolean(sheetTitle),
    registryAssistMessage,
  }
}

export function extractDrawingIdentityHints(
  page: IntakePreparedPage,
  registry: DrawingSetRegistry = EMPTY_REGISTRY,
): IntakeDrawingIdentityHints | undefined {
  if (page.routing.likelyType !== "DRAWING") return undefined
  return extractDrawingIdentityHintsForDrawingPage(page, registry)
}

/** Higher = more plausible as a drawing sheet number for this product set. */
export function drawingSheetNumberPlausibility(sheet: string | null | undefined): number {
  if (!sheet?.trim()) return 0
  const t = collapseHyphens(sheet).trim().toUpperCase()
  if (/\bD-\d{1,3}\b/.test(t)) return 4
  if (/\bE-00[1-7]\b/.test(t) || /\bE-[1-8]\b/.test(t)) return 4
  if (/\bI-00[1-8]\b/.test(t) || /\bI-[1-8]\b/.test(t)) return 4
  if (/\bC-\d{1,2}\b/.test(t)) return 2
  return 1
}

export function shouldPreferHintSheetNumber(
  aiSheet: string | null,
  hintSheet: string | null,
  hintConfidence: number,
): boolean {
  if (hintConfidence < 0.9 || !hintSheet?.trim()) return false
  const h = collapseHyphens(hintSheet).trim().toUpperCase()
  const a = aiSheet ? collapseHyphens(aiSheet).trim().toUpperCase() : ""
  if (a === h) return false
  return drawingSheetNumberPlausibility(hintSheet) > drawingSheetNumberPlausibility(aiSheet)
}

function drawingTitlePlausibility(title: string | null | undefined): number {
  if (!title?.trim()) return 0
  const t = title.trim()
  let s = Math.min(t.length / 10, 8)
  if (TITLEISH_RE.test(t)) s += 6
  return s
}

export function shouldPreferHintSheetTitle(
  aiTitle: string | null,
  hintTitle: string | null,
  hintConfidence: number,
): boolean {
  if (hintConfidence < 0.9 || !hintTitle?.trim()) return false
  if (!aiTitle?.trim()) return true
  return drawingTitlePlausibility(hintTitle) > drawingTitlePlausibility(aiTitle)
}

export function attachDrawingIdentityHintsToPreparedPages(
  pages: IntakePreparedPage[],
  registry: DrawingSetRegistry = EMPTY_REGISTRY,
): IntakePreparedPage[] {
  return pages.map((page) => {
    if (page.routing.likelyType !== "DRAWING") {
      if (page.drawingIdentityHints === undefined) return page
      const { drawingIdentityHints: _removed, ...rest } = page
      return rest as IntakePreparedPage
    }
    const hints = extractDrawingIdentityHintsForDrawingPage(page, registry)
    if (!hints.sheetNumberCandidate && !hints.sheetTitleCandidate) return page
    return { ...page, drawingIdentityHints: hints }
  })
}
