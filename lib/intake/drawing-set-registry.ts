/**
 * Drawing sheet index registry: parse index-like rows and normalize D/E/I sheet IDs.
 * No npm dependencies.
 *
 * PDF text is often flattened to a single line (no newlines). Rows are detected by
 * splitting on sheet-id boundaries, not only on newline breaks.
 */

import type { IntakePreparedPage } from "./types"

export type DrawingSetRegistryEntry = {
  canonicalSheetNumber: string
  normalizedVariants: string[]
  canonicalTitle: string
}

export type DrawingSetRegistry = {
  /** `${L}-${n}` (e.g. E-6) → entry */
  byLogicalKey: Map<string, DrawingSetRegistryEntry>
  entries: DrawingSetRegistryEntry[]
}

export type RegistryRejectedLine = {
  line: string
  reason: string
}

export type ParsedDrawingIndexRow = {
  idRaw: string
  titleRaw: string
  logicalKey: string
  letter: string
  num: number
}

const PREVIEW_LEN = 120

function trimPreview(s: string, max = PREVIEW_LEN): string {
  const t = s.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function collapseHyphens(s: string): string {
  return s.replace(/[–—]/g, "-")
}

/** E-001 ↔ E-1, E-006 ↔ E-6, I-008 ↔ I-8 */
export function buildNormalizedVariants(letter: string, num: number): string[] {
  const L = letter.toUpperCase()
  const out = new Set<string>()
  out.add(`${L}-${num}`)
  out.add(`${L}-${String(num).padStart(2, "0")}`)
  out.add(`${L}-${String(num).padStart(3, "0")}`)
  return [...out].map((v) => collapseHyphens(v).toUpperCase())
}

export function parseSheetCell(raw: string): { letter: string; num: number } | null {
  const m = collapseHyphens(raw)
    .trim()
    .toUpperCase()
    .match(/^([DEI])-0*(\d{1,4})$/)
  if (!m) return null
  const num = parseInt(m[2], 10)
  if (!Number.isFinite(num) || num < 0 || num > 9999) return null
  return { letter: m[1], num }
}

function logicalSheetKey(letter: string, num: number): string {
  return `${letter.toUpperCase()}-${num}`
}

function pageTextForRegistry(page: IntakePreparedPage): string {
  const norm = page.rawText.normalizedText?.trim() ?? ""
  const full = page.rawText.fullText?.trim() ?? ""
  const raw = full.length >= norm.length ? full : norm || full
  const ocrNorm = page.ocrText.normalizedText?.trim() ?? ""
  const ocrFull = page.ocrText.fullText?.trim() ?? ""
  const ocrPick =
    ocrFull.length >= ocrNorm.length ? ocrFull : ocrNorm || ocrFull || ocrNorm
  return [raw, ocrPick].filter(Boolean).join("\n\n")
}

function flattenRegistryText(text: string): string {
  return collapseHyphens(text).replace(/\s+/g, " ").trim()
}

/**
 * Split flattened page text into segments that each begin with a D/E/I sheet id token.
 */
export function splitIntoSheetIndexSegments(flatText: string): string[] {
  if (!flatText) return []
  const parts = flatText.split(/(?=\b[DEI]-\d{1,4}\b)/i)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/**
 * Parse one segment that should start with something like "D-000 COVER" or "E-001 | LEGEND".
 */
export function parseLeadingSheetIndexRow(segment: string): { idRaw: string; titleRaw: string } | null {
  const s = collapseHyphens(segment).trim()
  if (!s.length) return null

  const withDelim = s.match(
    /^\s*((?:D|E|I)-\d{1,4})(?:\s*\|\s*|\s*[-–—:]\s+|\s+)(.+)$/i,
  )
  if (withDelim) {
    const titleRaw = withDelim[2].replace(/\s+/g, " ").trim()
    return { idRaw: withDelim[1], titleRaw }
  }

  const spacesOnly = s.match(/^\s*((?:D|E|I)-\d{1,4})\s+(.{3,})$/i)
  if (spacesOnly) {
    const titleRaw = spacesOnly[2].replace(/\s+/g, " ").trim()
    return { idRaw: spacesOnly[1], titleRaw }
  }

  return null
}

/** Uppercase + hyphen normalize only; keeps digit run from the index row (e.g. D-000). */
function literalSheetNumberFromParsedRow(parsed: ParsedDrawingIndexRow): string {
  return collapseHyphens(parsed.idRaw).trim().toUpperCase()
}

/**
 * Same logical sheet: prefer the spelling whose numeric suffix has more digits (index zero-padding).
 */
function preferMorePaddedSheetDisplay(current: string, incoming: string): string {
  const a = collapseHyphens(current).trim().toUpperCase()
  const b = collapseHyphens(incoming).trim().toUpperCase()
  const ca = parseSheetCell(a)
  const cb = parseSheetCell(b)
  if (!ca || !cb || ca.letter !== cb.letter || ca.num !== cb.num) return current
  const da = a.match(/-(\d+)$/i)?.[1]?.length ?? 0
  const db = b.match(/-(\d+)$/i)?.[1]?.length ?? 0
  return db > da ? b : a
}

function mergeRowIntoRegistry(
  byLogicalKey: Map<string, DrawingSetRegistryEntry>,
  entries: DrawingSetRegistryEntry[],
  parsed: ParsedDrawingIndexRow,
): void {
  const lkey = parsed.logicalKey
  const normalizedVariants = buildNormalizedVariants(parsed.letter, parsed.num)
  const literalSheetNumber = literalSheetNumberFromParsedRow(parsed)
  const titleRaw = parsed.titleRaw.slice(0, 200)

  let entry = byLogicalKey.get(lkey)
  if (!entry) {
    entry = {
      canonicalSheetNumber: literalSheetNumber,
      normalizedVariants: [...normalizedVariants],
      canonicalTitle: titleRaw,
    }
    byLogicalKey.set(lkey, entry)
    entries.push(entry)
  } else {
    entry.canonicalSheetNumber = preferMorePaddedSheetDisplay(entry.canonicalSheetNumber, literalSheetNumber)
    if (titleRaw.length > entry.canonicalTitle.length) {
      entry.canonicalTitle = titleRaw
    }
    for (const v of normalizedVariants) {
      if (!entry.normalizedVariants.includes(v)) entry.normalizedVariants.push(v)
    }
  }
}

export type ParseDrawingIndexFromTextResult = {
  acceptedRows: ParsedDrawingIndexRow[]
  rejectedLines: RegistryRejectedLine[]
}

/**
 * Parse drawing index rows from one text block (one page or merged).
 */
export function parseDrawingIndexFromText(text: string): ParseDrawingIndexFromTextResult {
  const acceptedRows: ParsedDrawingIndexRow[] = []
  const rejectedLines: RegistryRejectedLine[] = []
  const flat = flattenRegistryText(text)
  if (!flat) return { acceptedRows, rejectedLines }

  const segments = splitIntoSheetIndexSegments(flat)
  for (const segment of segments) {
    const preview = trimPreview(segment, 140)
    const parsed = parseLeadingSheetIndexRow(segment)
    if (!parsed) {
      if (segment.length >= 6) {
        rejectedLines.push({
          line: preview,
          reason: "no_sheet_row_pattern_at_segment_start",
        })
      }
      continue
    }

    const cell = parseSheetCell(parsed.idRaw)
    if (!cell) {
      rejectedLines.push({ line: preview, reason: "sheet_id_unparseable" })
      continue
    }
    if (parsed.titleRaw.length < 3) {
      rejectedLines.push({ line: preview, reason: "title_too_short" })
      continue
    }

    acceptedRows.push({
      idRaw: parsed.idRaw,
      titleRaw: parsed.titleRaw,
      logicalKey: logicalSheetKey(cell.letter, cell.num),
      letter: cell.letter,
      num: cell.num,
    })
  }

  return { acceptedRows, rejectedLines }
}

export type Page1RegistryDebugLog = {
  pageNumber: 1
  rawTextPreview: string
  ocrTextPreview: string
  combinedTextPreview: string
  normalizedLinesPreview: string[]
  rowHits: number
  acceptedEntries: number
  rejectedLines: RegistryRejectedLine[]
}

export type DrawingRegistryBuildLog = {
  sourcePageNumbers: number[]
  rowHits: number
  acceptedEntries: number
  exampleEntries: Array<{ sheetNumber: string; title: string }>
  rejectedRowCount: number
  rejectionReasonsSummary: Record<string, number>
}

export function buildPage1RegistryDebug(
  preparedPages: IntakePreparedPage[],
): Page1RegistryDebugLog | null {
  const p1 = preparedPages.find((p) => p.pageNumber === 1)
  if (!p1) return null

  const rawFull = p1.rawText.fullText ?? ""
  const rawNorm = p1.rawText.normalizedText ?? ""
  const ocrFull = p1.ocrText.fullText ?? ""
  const ocrNorm = p1.ocrText.normalizedText ?? ""
  const combined = pageTextForRegistry(p1)
  const flat = flattenRegistryText(combined)
  const segments = splitIntoSheetIndexSegments(flat)
  const { acceptedRows, rejectedLines } = parseDrawingIndexFromText(combined)

  return {
    pageNumber: 1,
    rawTextPreview: trimPreview(rawFull, 400),
    ocrTextPreview: trimPreview(ocrFull || ocrNorm, 400),
    combinedTextPreview: trimPreview(combined, 500),
    normalizedLinesPreview: segments.slice(0, 18).map((s) => trimPreview(s, 96)),
    rowHits: acceptedRows.length,
    acceptedEntries: acceptedRows.length,
    rejectedLines: rejectedLines.slice(0, 40),
  }
}

export function buildDrawingRegistryBuildLog(params: {
  preparedPages: IntakePreparedPage[]
  registry: DrawingSetRegistry
  /** Total rows accepted by the parser before the 3-row threshold is applied. */
  parsedRowHits: number
  allRejected: RegistryRejectedLine[]
}): DrawingRegistryBuildLog {
  const { preparedPages, registry, parsedRowHits, allRejected } = params
  const rejectionReasonsSummary: Record<string, number> = {}
  for (const r of allRejected) {
    rejectionReasonsSummary[r.reason] = (rejectionReasonsSummary[r.reason] ?? 0) + 1
  }

  const exampleEntries = registry.entries.slice(0, 8).map((e) => ({
    sheetNumber: e.canonicalSheetNumber,
    title: e.canonicalTitle.slice(0, 80),
  }))

  return {
    sourcePageNumbers: preparedPages.map((p) => p.pageNumber),
    rowHits: parsedRowHits,
    acceptedEntries: registry.entries.length,
    exampleEntries,
    rejectedRowCount: allRejected.length,
    rejectionReasonsSummary,
  }
}

/**
 * Collect index rows from all pages. Requires a minimum **accepted** row count so random
 * matches do not build a bogus registry.
 */
export function buildDrawingSetRegistryFromPreparedPages(
  pages: IntakePreparedPage[],
): DrawingSetRegistry {
  return buildDrawingSetRegistryFromPreparedPagesWithLog(pages).registry
}

/**
 * Same as {@link buildDrawingSetRegistryFromPreparedPages} but returns diagnostics for logging.
 * Prefer this at intake boundaries when you need `visibleIntake:drawingRegistryBuild`.
 */
export function buildDrawingSetRegistryFromPreparedPagesWithLog(
  pages: IntakePreparedPage[],
): { registry: DrawingSetRegistry; buildLog: DrawingRegistryBuildLog } {
  const byLogicalKey = new Map<string, DrawingSetRegistryEntry>()
  const entries: DrawingSetRegistryEntry[] = []
  const perPageAccepted: number[] = []
  const allRejected: RegistryRejectedLine[] = []

  for (const page of pages) {
    const text = pageTextForRegistry(page)
    if (!text) {
      perPageAccepted.push(0)
      continue
    }
    const { acceptedRows, rejectedLines } = parseDrawingIndexFromText(text)
    allRejected.push(...rejectedLines)
    perPageAccepted.push(acceptedRows.length)
    for (const row of acceptedRows) {
      mergeRowIntoRegistry(byLogicalKey, entries, row)
    }
  }

  let registry: DrawingSetRegistry = { byLogicalKey, entries }
  const rowHits = perPageAccepted.reduce((a, b) => a + b, 0)
  if (rowHits < 3) {
    registry = { byLogicalKey: new Map(), entries: [] }
  }

  const parsedRowHits = perPageAccepted.reduce((a, b) => a + b, 0)
  const buildLog = buildDrawingRegistryBuildLog({
    preparedPages: pages,
    registry,
    parsedRowHits,
    allRejected,
  })

  return { registry, buildLog }
}

export function lookupRegistryEntry(
  registry: DrawingSetRegistry,
  sheetId: string | null | undefined,
): DrawingSetRegistryEntry | undefined {
  if (!sheetId?.trim() || registry.byLogicalKey.size === 0) return undefined
  const parsed = parseSheetCell(sheetId)
  if (!parsed) return undefined
  return registry.byLogicalKey.get(logicalSheetKey(parsed.letter, parsed.num))
}

export function registryLogicalKeyForSheetId(sheetId: string | null | undefined): string | null {
  const p = parseSheetCell(sheetId ?? "")
  if (!p) return null
  return logicalSheetKey(p.letter, p.num)
}
