/**
 * Front-of-file structure scan: discover drawing index / spec TOC / addendum identity
 * using deterministic signals and conservative extraction. Prefer running after OCR so
 * cover/sheet-index text is present. Additive only.
 */

import {
  buildDrawingSetRegistryFromPreparedPagesWithLog,
  parseDrawingIndexFromText,
  parseLeadingSheetIndexRow,
  parseSheetCell,
  splitIntoSheetIndexSegments,
} from "./drawing-set-registry"
import {
  extractSpecOutlineWithSectionRanges,
  parseCsiOutlineTitle,
  type SpecOutlineEntry,
  type SpecSectionRange,
} from "./spec-outline"
import type { IntakePreparedPage, IntakeRouteType } from "./types"

/** Default drawing / front-matter text window (1-based page indices covered). */
export const FRONT_SCAN_DRAWING_DEFAULT_PAGES = 5
/** Extended window when initial drawing-index signals are weak but promising. */
export const FRONT_SCAN_DRAWING_EXTENDED_PAGES = 8
/** Max pages to walk when searching for a spec TOC (inclusive of page 1). */
export const FRONT_SCAN_SPEC_MAX_PAGES = 20

export type DocumentKindGuess = "DRAWINGS" | "SPECS" | "MIXED" | "UNKNOWN"

export type StructureFound = "DRAWING_INDEX" | "WEAK_DRAWING_INDEX" | "SPEC_TOC" | "NONE"

/** Coarse runtime / reporting mode (orthogonal to raw `structureFound` string). */
export type IntakeStructureMode =
  | "STRONG_DRAWING_INDEX"
  | "WEAK_DRAWING_INDEX"
  | "STRONG_SPEC_TOC"
  | "NONE"

export type FrontStructureDrawingEntry = {
  sheetNumber: string
  title: string
}

export type FrontStructureSpecEntry = {
  sectionNumber: string | null
  title: string
  page: number | null
}

export type FrontStructureScanResult = {
  documentKindGuess: DocumentKindGuess
  structureFound: StructureFound
  confidence: number
  scannedPages: number[]
  addendumLabel: string | null
  drawingEntries?: FrontStructureDrawingEntry[]
  specEntries?: FrontStructureSpecEntry[]
  /** Populated when `structureFound === "WEAK_DRAWING_INDEX"` for logs / diagnostics. */
  weakIndexDiagnostics?: {
    entrySource: "strict_registry" | "loose_segments" | "merged"
    reasonSummary: Record<string, number>
  }
}

export function deriveIntakeStructureMode(
  scan: FrontStructureScanResult,
  authorityCredible: boolean,
): IntakeStructureMode {
  if (authorityCredible && scan.structureFound === "DRAWING_INDEX") return "STRONG_DRAWING_INDEX"
  if (authorityCredible && scan.structureFound === "SPEC_TOC") return "STRONG_SPEC_TOC"
  if (scan.structureFound === "WEAK_DRAWING_INDEX") return "WEAK_DRAWING_INDEX"
  return "NONE"
}

const DRAWING_INDEX_PHRASES = [
  /\bsheet\s+index\b/i,
  /\bdrawing\s+index\b/i,
  /\bdrawing\s+sheet\s+index\b/i,
  /\blist\s+of\s+drawings\b/i,
  /\bdrawing\s+list\b/i,
  /\bsheet\s+list\b/i,
  /\bindex\s+of\s+drawings\b/i,
  /\bindex\s+of\s+sheets\b/i,
  /\bcover\s*[/&]\s*sheet\s+index\b/i,
  /\bcover\s+sheet\s+index\b/i,
  /\bsheet\s+index\s*[/&]\s*cover\b/i,
]


const SPEC_TOC_PHRASES = [
  /\btable\s+of\s+contents\b/i,
  /\bcontents\b/i,
]

const ADDENDUM_LABEL_RE =
  /\b(addendum|addenda)\s*(?:no\.?|number|#)?\s*([0-9]+|[ivxlcdm]+)?\b/gi

const CSI_LINE_RE = /^\s*((?:\d{2}\s+\d{2}\s+\d{2})|(?:\d{6}))\s+(.{3,200})\s*$/

function mapRouteToDocumentKind(route: IntakeRouteType): DocumentKindGuess {
  if (route === "DRAWING") return "DRAWINGS"
  if (route === "SPEC") return "SPECS"
  if (route === "MIXED") return "MIXED"
  return "UNKNOWN"
}

function pageCombinedText(page: IntakePreparedPage): string {
  const raw = page.rawText.normalizedText?.trim() ?? page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText ?? ""
  return [raw, ocr].filter(Boolean).join("\n")
}

function combinedTextForPages(pages: IntakePreparedPage[]): string {
  return pages.map(pageCombinedText).filter(Boolean).join("\n\n")
}

function countDrawingIndexPhrases(text: string): number {
  const t = text.slice(0, 120_000)
  let n = 0
  for (const re of DRAWING_INDEX_PHRASES) {
    re.lastIndex = 0
    if (re.test(t)) n += 1
  }
  return n
}

function countDenseDeiIndexLines(text: string): number {
  return parseDrawingIndexFromText(text).acceptedRows.length
}

function hasDenseShortRegistryLines(text: string): boolean {
  const flat = text.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()
  const segs = splitIntoSheetIndexSegments(flat)
  let hits = 0
  for (const seg of segs) {
    if (parseLeadingSheetIndexRow(seg)) hits += 1
  }
  return hits >= 8
}

const COVER_INDEX_TITLE_WINDOW = 2500
const COVER_OR_INDEX_TITLE_RE =
  /\b(cover|sheet\s+index|drawing\s+index|sheet\s+list|list\s+of\s+drawings)\b/i

function countSpecTocPhrases(text: string): number {
  const t = text.slice(0, 120_000).toLowerCase()
  let n = 0
  if (/\btable\s+of\s+contents\b/i.test(t)) n += 2
  if (/\bcontents\b/.test(t)) n += 1
  return n
}

function extractAddendumLabel(text: string): string | null {
  const window = text.slice(0, 80_000)
  ADDENDUM_LABEL_RE.lastIndex = 0
  const m = ADDENDUM_LABEL_RE.exec(window)
  if (!m) return null
  const raw = m[0].replace(/\s+/g, " ").trim()
  if (raw.length < 8) return null
  return raw.slice(0, 120)
}

function extractCsiLinesFromText(text: string): FrontStructureSpecEntry[] {
  const out: FrontStructureSpecEntry[] = []
  for (const line of text.split(/\n+/)) {
    const m = line.match(CSI_LINE_RE)
    if (!m) continue
    const numRaw = m[1].replace(/\s+/g, " ").trim()
    const title = m[2].replace(/\s+/g, " ").trim()
    if (title.length < 3) continue
    let sectionNumber: string | null = numRaw
    if (/^\d{6}$/.test(numRaw.replace(/\s/g, ""))) {
      const d = numRaw.replace(/\D/g, "")
      sectionNumber = `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)}`
    }
    out.push({
      sectionNumber,
      title: title.slice(0, 240),
      page: null,
    })
    if (out.length >= 48) break
  }
  return out
}

function outlineToSpecEntries(
  outline: SpecOutlineEntry[],
  ranges: SpecSectionRange[],
): FrontStructureSpecEntry[] {
  if (ranges.length >= 2) {
    return ranges.slice(0, 40).map((r) => ({
      sectionNumber: r.sectionNumber,
      title: (r.sectionTitle || r.rawTitle).slice(0, 240),
      page: r.startPage,
    }))
  }
  const fromOutline: FrontStructureSpecEntry[] = []
  for (const e of outline) {
    const parsed = parseCsiOutlineTitle(e.title)
    if (parsed) {
      fromOutline.push({
        sectionNumber: parsed.sectionNumber,
        title: parsed.sectionTitle.slice(0, 240),
        page: e.page,
      })
    }
    if (fromOutline.length >= 40) break
  }
  return fromOutline
}

export type DrawingScan = {
  score: number
  entries: FrontStructureDrawingEntry[]
  scannedMax: number
  /** Sum of accepted parse rows before dedupe (same as drawing registry build log). */
  parsedRowHits: number
}

/**
 * Scan early pages for D/E/I sheet-index rows (used by front structure scan and debug logs).
 */
export function scanDrawingIndex(
  preparedPages: IntakePreparedPage[],
  startMax: number,
): DrawingScan {
  const capped = Math.min(startMax, preparedPages.length)
  const slice = preparedPages.slice(0, capped)
  const text = combinedTextForPages(slice)
  const phrases = countDrawingIndexPhrases(text)
  const denseDei = countDenseDeiIndexLines(text)
  const { registry, buildLog } = buildDrawingSetRegistryFromPreparedPagesWithLog(slice)
  const parsedRowHits = buildLog.rowHits
  const entries: FrontStructureDrawingEntry[] = registry.entries.map((e) => ({
    sheetNumber: e.canonicalSheetNumber,
    title: e.canonicalTitle,
  }))

  let score = 0
  if (entries.length >= 8 && phrases >= 1) score = 0.88
  else if (entries.length >= 5 && phrases >= 1) score = 0.78
  else if (entries.length >= 3 && phrases >= 1) score = 0.68
  else if (entries.length >= 5) score = 0.58
  else if (entries.length >= 3) score = 0.52
  else score = 0

  if (
    entries.length >= 3 &&
    phrases === 0 &&
    denseDei >= 4 &&
    score < 0.58
  ) {
    score = 0.58
  }

  return { score, entries, scannedMax: capped, parsedRowHits }
}

function collapseHyphensLocal(s: string): string {
  return s.replace(/[–—]/g, "-")
}

/**
 * Loose segment parse for weak-index assist only: shorter title floor than strict registry rows.
 */
function collectLooseDrawingIndexEntriesFromText(text: string, maxEntries = 36): FrontStructureDrawingEntry[] {
  const flat = collapseHyphensLocal(text).replace(/\s+/g, " ").trim()
  const segs = splitIntoSheetIndexSegments(flat)
  const byKey = new Map<string, FrontStructureDrawingEntry>()
  for (const seg of segs) {
    const row = parseLeadingSheetIndexRow(seg)
    if (!row) continue
    const cell = parseSheetCell(row.idRaw)
    if (!cell) continue
    if (row.titleRaw.trim().length < 2) continue
    const key = `${cell.letter.toUpperCase()}-${cell.num}`
    const sheetNumber = collapseHyphensLocal(row.idRaw).trim().toUpperCase()
    const title = row.titleRaw.replace(/\s+/g, " ").trim().slice(0, 240)
    if (!byKey.has(key)) {
      byKey.set(key, { sheetNumber, title })
    }
    if (byKey.size >= maxEntries) break
  }
  return [...byKey.values()]
}

function mergeDrawingEntriesPreferStrict(
  strict: FrontStructureDrawingEntry[],
  loose: FrontStructureDrawingEntry[],
): FrontStructureDrawingEntry[] {
  const byKey = new Map<string, FrontStructureDrawingEntry>()
  const add = (e: FrontStructureDrawingEntry, preferLongerTitle: boolean) => {
    const p = parseSheetCell(e.sheetNumber)
    if (!p) return
    const key = `${p.letter.toUpperCase()}-${p.num}`
    const cur = byKey.get(key)
    if (!cur || (preferLongerTitle && e.title.length > cur.title.length)) {
      byKey.set(key, { sheetNumber: e.sheetNumber.trim(), title: e.title.trim().slice(0, 240) })
    }
  }
  for (const e of loose) add(e, false)
  for (const e of strict) add(e, true)
  return [...byKey.values()]
}

function shouldConsiderWeakDrawingPath(fileDefaultType: IntakeRouteType): boolean {
  return fileDefaultType === "DRAWING" || fileDefaultType === "MIXED" || fileDefaultType === "UNKNOWN"
}

function computeWeakDrawingIndexAttachment(params: {
  drawing: DrawingScan
  preparedPages: IntakePreparedPage[]
  fileDefaultType: IntakeRouteType
}): {
  useWeak: boolean
  entries: FrontStructureDrawingEntry[]
  entrySource: "strict_registry" | "loose_segments" | "merged"
  reasonSummary: Record<string, number>
} {
  const { drawing, preparedPages, fileDefaultType } = params
  const reasonSummary: Record<string, number> = {}
  if (!shouldConsiderWeakDrawingPath(fileDefaultType)) {
    reasonSummary.skipped_spec_file_default = 1
    return { useWeak: false, entries: [], entrySource: "strict_registry", reasonSummary }
  }

  const slice = preparedPages.slice(0, Math.min(FRONT_SCAN_DRAWING_EXTENDED_PAGES, preparedPages.length))
  const text = combinedTextForPages(slice)
  const phrases = countDrawingIndexPhrases(text)
  const loose = collectLooseDrawingIndexEntriesFromText(text)
  const merged = mergeDrawingEntriesPreferStrict(drawing.entries, loose)
  const hits = drawing.parsedRowHits
  let entrySource: "strict_registry" | "loose_segments" | "merged" = "strict_registry"
  if (merged.length > drawing.entries.length) {
    entrySource = drawing.entries.length > 0 ? "merged" : "loose_segments"
  }

  if (merged.length >= 4) {
    reasonSummary.qualify_four_plus_unique_ids = 1
    return { useWeak: true, entries: merged, entrySource, reasonSummary }
  }
  if (merged.length >= 2 && hits >= 3 && phrases >= 1) {
    reasonSummary.qualify_two_ids_with_phrase_and_row_hits = 1
    return { useWeak: true, entries: merged, entrySource, reasonSummary }
  }
  if (merged.length >= 2 && hits >= 4) {
    reasonSummary.qualify_two_ids_with_row_hits = 1
    return { useWeak: true, entries: merged, entrySource, reasonSummary }
  }
  if (merged.length >= 6) {
    reasonSummary.qualify_six_plus_unique_ids = 1
    return { useWeak: true, entries: merged, entrySource, reasonSummary }
  }
  reasonSummary.disqualified_insufficient_evidence = 1
  return { useWeak: false, entries: [], entrySource: "strict_registry", reasonSummary }
}

type SpecScan = {
  score: number
  entries: FrontStructureSpecEntry[]
  scannedMax: number
  tocPageSignals: number
  csiLineCount: number
}

function scanSpecTocFromPages(
  preparedPages: IntakePreparedPage[],
  maxPages: number,
): SpecScan {
  const capped = Math.min(maxPages, preparedPages.length)
  const slice = preparedPages.slice(0, capped)
  const combined = combinedTextForPages(slice)
  let tocSignals = 0
  for (const p of slice) {
    if (p.specSignals.likelyIndexOrTocPage) tocSignals += 1
  }
  const csiLines = extractCsiLinesFromText(combined)
  const phraseWeight = countSpecTocPhrases(combined)

  let score = 0
  if (csiLines.length >= 8 && phraseWeight >= 1) score = 0.82
  else if (csiLines.length >= 5 && phraseWeight >= 1) score = 0.74
  else if (csiLines.length >= 4 && tocSignals >= 1) score = 0.68
  else if (csiLines.length >= 4) score = 0.58
  else if (phraseWeight >= 2 && csiLines.length >= 2) score = 0.55
  else if (tocSignals >= 2 && csiLines.length >= 2) score = 0.52
  else score = 0

  return {
    score,
    entries: csiLines,
    scannedMax: capped,
    tocPageSignals: tocSignals,
    csiLineCount: csiLines.length,
  }
}

function mergeScannedPages(a: number, b: number): number[] {
  const n = Math.max(a, b)
  return Array.from({ length: n }, (_, i) => i + 1)
}

/**
 * Deterministic front-of-file scan after router. Prefer **after OCR** so cover/index
 * text is available (raster or scanned cover sheets often lack embedded text until OCR).
 */
export async function runFrontStructureScan(params: {
  preparedPages: IntakePreparedPage[]
  pdfBuffer: Buffer
  fileDefaultType: IntakeRouteType
}): Promise<FrontStructureScanResult> {
  const { preparedPages, pdfBuffer, fileDefaultType } = params
  const documentKindGuess = mapRouteToDocumentKind(fileDefaultType)

  const empty: FrontStructureScanResult = {
    documentKindGuess,
    structureFound: "NONE",
    confidence: 0,
    scannedPages: [],
    addendumLabel: null,
  }

  if (preparedPages.length === 0) return empty

  const addendumText = combinedTextForPages(
    preparedPages.slice(0, Math.min(FRONT_SCAN_DRAWING_EXTENDED_PAGES, preparedPages.length)),
  )
  const addendumLabel = extractAddendumLabel(addendumText)

  let outline: SpecOutlineEntry[] = []
  let sectionRanges: SpecSectionRange[] = []
  try {
    const loaded = await extractSpecOutlineWithSectionRanges(pdfBuffer)
    outline = loaded.outline
    sectionRanges = loaded.sectionRanges
  } catch {
    outline = []
    sectionRanges = []
  }

  const outlineEntries = outlineToSpecEntries(outline, sectionRanges)
  let outlineScore = 0
  if (sectionRanges.length >= 4) outlineScore = 0.9
  else if (sectionRanges.length >= 2) outlineScore = 0.78
  else if (outlineEntries.length >= 4) outlineScore = 0.65
  else if (outlineEntries.length >= 2) outlineScore = 0.52
  else outlineScore = 0

  // Drawing index: 5 pages, extend to 8 if phrase hit but registry still thin
  let drawing = scanDrawingIndex(preparedPages, FRONT_SCAN_DRAWING_DEFAULT_PAGES)
  if (
    drawing.score < 0.58 &&
    countDrawingIndexPhrases(
      combinedTextForPages(preparedPages.slice(0, FRONT_SCAN_DRAWING_DEFAULT_PAGES)),
    ) >= 1 &&
    preparedPages.length > FRONT_SCAN_DRAWING_DEFAULT_PAGES
  ) {
    const extended = scanDrawingIndex(preparedPages, FRONT_SCAN_DRAWING_EXTENDED_PAGES)
    if (extended.score >= drawing.score) drawing = extended
  }

  // Spec TOC from text (walk forward until cap or strong signal)
  const specText = scanSpecTocFromPages(preparedPages, FRONT_SCAN_SPEC_MAX_PAGES)

  let specScore = Math.max(specText.score, outlineScore)
  let specEntries: FrontStructureSpecEntry[] = []
  if (specText.score >= outlineScore && specText.entries.length > 0) {
    specEntries = specText.entries
  } else if (outlineEntries.length > 0) {
    specEntries = outlineEntries
    specScore = outlineScore
  } else if (specText.entries.length > 0) {
    specEntries = specText.entries
  }

  let structureFound: StructureFound = "NONE"
  let confidence = 0
  let scannedPages: number[] = []
  let drawingEntries: FrontStructureDrawingEntry[] | undefined
  let specEntriesOut: FrontStructureSpecEntry[] | undefined

  const strongDrawing = drawing.score >= 0.52 && drawing.entries.length >= 3
  const strongSpec = specScore >= 0.52 && specEntries.length >= 2

  const scannedDrawing = mergeScannedPages(drawing.scannedMax, FRONT_SCAN_DRAWING_EXTENDED_PAGES)
  const scannedSpec = mergeScannedPages(specText.scannedMax, FRONT_SCAN_SPEC_MAX_PAGES)
  const scannedBoth = mergeScannedPages(
    Math.max(drawing.scannedMax, specText.scannedMax),
    FRONT_SCAN_SPEC_MAX_PAGES,
  )

  if (strongDrawing || strongSpec) {
    if (strongDrawing && strongSpec) {
      const takeSpec =
        fileDefaultType === "SPEC" ||
        (fileDefaultType === "MIXED" && specScore > drawing.score + 0.03) ||
        (fileDefaultType === "UNKNOWN" && specScore > drawing.score + 0.03)
      if (takeSpec) {
        structureFound = "SPEC_TOC"
        confidence = specScore
        scannedPages = scannedSpec
        specEntriesOut = specEntries
      } else {
        structureFound = "DRAWING_INDEX"
        confidence = drawing.score
        scannedPages = scannedDrawing
        drawingEntries = drawing.entries
      }
    } else if (strongDrawing) {
      structureFound = "DRAWING_INDEX"
      confidence = drawing.score
      scannedPages = scannedDrawing
      drawingEntries = drawing.entries
    } else {
      structureFound = "SPEC_TOC"
      confidence = specScore
      scannedPages = scannedSpec
      specEntriesOut = specEntries
    }
  } else {
    structureFound = "NONE"
    confidence = Math.max(drawing.score, specScore) * 0.4
    scannedPages = scannedBoth
  }

  let weakIndexDiagnostics: FrontStructureScanResult["weakIndexDiagnostics"]

  if (structureFound === "NONE") {
    const weakAttach = computeWeakDrawingIndexAttachment({
      drawing,
      preparedPages,
      fileDefaultType,
    })
    if (weakAttach.useWeak && weakAttach.entries.length > 0) {
      structureFound = "WEAK_DRAWING_INDEX"
      drawingEntries = weakAttach.entries
      weakIndexDiagnostics = {
        entrySource: weakAttach.entrySource,
        reasonSummary: weakAttach.reasonSummary,
      }
      confidence = Math.min(
        0.48,
        Math.max(0.22, drawing.score + 0.06, weakAttach.entries.length * 0.015),
      )
      scannedPages = scannedDrawing
    } else {
      drawingEntries = undefined
      specEntriesOut = undefined
    }
  }

  return {
    documentKindGuess,
    structureFound,
    confidence,
    scannedPages,
    addendumLabel,
    drawingEntries,
    specEntries: specEntriesOut,
    weakIndexDiagnostics,
  }
}

export function summarizeFrontStructureScan(result: FrontStructureScanResult): {
  documentKindGuess: DocumentKindGuess
  structureFound: StructureFound
  confidence: number
  scannedPages: number[]
  entryCount: number
  addendumLabel: string | null
} {
  const entryCount =
    result.structureFound === "DRAWING_INDEX" || result.structureFound === "WEAK_DRAWING_INDEX"
      ? result.drawingEntries?.length ?? 0
      : result.structureFound === "SPEC_TOC"
        ? result.specEntries?.length ?? 0
        : 0

  return {
    documentKindGuess: result.documentKindGuess,
    structureFound: result.structureFound,
    confidence: result.confidence,
    scannedPages: result.scannedPages,
    entryCount,
    addendumLabel: result.addendumLabel,
  }
}

const FRONT_DEBUG_SCAN_PAGES = 8

export type VisibleIntakeFrontStructureDebug = {
  scannedPages: number[]
  candidatePages: Array<{
    pageNumber: number
    route: string
    fastBlankClass: string | null
    indexSignals: {
      hasSheetListTerms: boolean
      hasNumberTitlePattern: boolean
      hasDenseListStructure: boolean
      hasCoverOrIndexTitle: boolean
    }
    extractedDrawingEntryCount: number
    rejectedReasons: string[]
    acceptedAsIndexCandidate: boolean
  }>
  finalStructureFound: StructureFound
  finalDrawingEntryCount: number
  finalConfidence: number
  finalAuthorityCredible: boolean
  confidenceReducedReasons: string[]
}

/**
 * Compact structured log payload for `visibleIntake:frontStructureDebug`.
 * Call after `runFrontStructureScan`; pass `finalAuthorityCredible` from
 * `isFrontStructureAuthorityCredible(result)` to avoid circular imports.
 */
export function buildVisibleIntakeFrontStructureDebug(params: {
  preparedPages: IntakePreparedPage[]
  result: FrontStructureScanResult
  finalAuthorityCredible: boolean
}): VisibleIntakeFrontStructureDebug {
  const { preparedPages, result, finalAuthorityCredible } = params
  const n = Math.min(FRONT_DEBUG_SCAN_PAGES, preparedPages.length)
  const candidatePages: VisibleIntakeFrontStructureDebug["candidatePages"] = []

  for (let i = 0; i < n; i++) {
    const page = preparedPages[i]
    const text = pageCombinedText(page)
    const fastBlankClass = page.fastBlank?.classification ?? null
    const route = page.routing.likelyType
    const phraseN = countDrawingIndexPhrases(text)
    const hasSheetListTerms = phraseN >= 1
    const hasCoverOrIndexTitle = COVER_OR_INDEX_TITLE_RE.test(
      text.slice(0, COVER_INDEX_TITLE_WINDOW),
    )
    const deiRows = countDenseDeiIndexLines(text)
    const hasNumberTitlePattern = deiRows >= 1
    const hasDenseListStructure =
      hasDenseShortRegistryLines(text) || deiRows >= 4

    const rejectedReasons: string[] = []
    const isFastBlank =
      fastBlankClass === "TRUE_BLANK" || fastBlankClass === "INTENTIONAL_BLANK"

    const acceptedAsIndexCandidate =
      !isFastBlank &&
      (hasSheetListTerms ||
        hasCoverOrIndexTitle ||
        (hasDenseListStructure && hasNumberTitlePattern && deiRows >= 3))

    if (!acceptedAsIndexCandidate) {
      if (isFastBlank) rejectedReasons.push("fast_blank")
      else {
        if (!hasSheetListTerms && !hasCoverOrIndexTitle) {
          rejectedReasons.push("no_surface_index_signal")
        }
        if (deiRows < 2 && !hasDenseListStructure) {
          rejectedReasons.push("thin_registry_like_rows")
        }
      }
    }

    candidatePages.push({
      pageNumber: page.pageNumber,
      route,
      fastBlankClass,
      indexSignals: {
        hasSheetListTerms,
        hasNumberTitlePattern,
        hasDenseListStructure,
        hasCoverOrIndexTitle,
      },
      extractedDrawingEntryCount: deiRows,
      rejectedReasons,
      acceptedAsIndexCandidate,
    })
  }

  const confidenceReducedReasons: string[] = []
  if (result.structureFound === "NONE") {
    confidenceReducedReasons.push("structure_none_confidence_scaled")
  }
  if (result.structureFound === "WEAK_DRAWING_INDEX") {
    confidenceReducedReasons.push("weak_drawing_index_no_full_authority")
  }
  if (!finalAuthorityCredible) {
    if (result.confidence < 0.52) {
      confidenceReducedReasons.push("below_registry_authority_floor")
    }
    if (result.structureFound === "DRAWING_INDEX" && (result.drawingEntries?.length ?? 0) < 3) {
      confidenceReducedReasons.push("drawing_entries_under_3")
    }
  }

  const finalDrawingEntryCount =
    result.structureFound === "DRAWING_INDEX" || result.structureFound === "WEAK_DRAWING_INDEX"
      ? result.drawingEntries?.length ?? 0
      : 0

  return {
    scannedPages: result.scannedPages,
    candidatePages,
    finalStructureFound: result.structureFound,
    finalDrawingEntryCount,
    finalConfidence: result.confidence,
    finalAuthorityCredible,
    confidenceReducedReasons,
  }
}
