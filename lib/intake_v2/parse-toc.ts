/**
 * TOC parser for spec books.
 * Supports two TOC formats found in real Michigan spec books:
 *   Format A: section number + spaces + title (no page refs)
 *             Covers: Fishbeck CSI 8-digit, GFA C-series alphanumeric,
 *             legacy 5-digit, ITB mixed format
 *   Format B: title + dot leaders + page ref (older style)
 * Resolves section numbers to PDF page numbers via body text scan.
 * Never guesses a PDF page number — stores null if not confidently matched.
 * MDOT proposal docs have no TOC and will correctly return zero entries.
 */
import type { IntakeV2PageTextInput, TocEntry, TocParseResult } from "./types"

// CSI MasterFormat 8-digit: "26 05 00" or "260500"
const CSI_8_RE = /^(\d{2})\s(\d{2})\s(\d{2})\b|^(\d{6})\b/

// Legacy 5-digit CSI: "16060", "02240"
const CSI_5_RE = /^(\d{5})\b/

// GFA/alphanumeric style: "C-111", "C-200", "C-941-2"
const ALPHA_SECTION_RE = /^([A-Z]-\d{1,3}(?:-\d{1,2})?)\b/

// Combined section number detector
const ANY_SECTION_RE = /^(\d{2}\s\d{2}\s\d{2}|\d{2}\s\d{4}(?:\.\d{2})?|\d{6}|\d{5}|[A-Z]-\d{1,3}(?:-\d{1,2})?)\b/

// Division header: "DIVISION 26  ELECTRICAL" or "DIVISION 1 – General Requirements"
const DIVISION_HEADER_RE = /^DIVISION\s+\d{1,2}\b/i

// Format B: title + dot leaders + page ref
const DOT_LEADER_RE = /^(.{4,80}?)\s*\.{2,}\s*([A-Z0-9][\w-]*\d)\s*$/

// TOC block signals
const TOC_HEADER_RE = /\b(TABLE\s+OF\s+CONTENTS?|SECTION\s+00\s+01\s+10)\b/i

// Body section header for PDF page resolution
const BODY_SECTION_HEADER_RE = /^SECTION\s+(\d{2}\s\d{2}\s\d{2}|\d{5,6})\b/i

function normalizeSectionNumber(raw: string): string {
  const digits = raw.replace(/\s+/g, "")
  if (/^\d{6}$/.test(digits)) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`
  }
  return raw.trim()
}

function parseCsiDivision(sectionNumber: string): number | null {
  const m = sectionNumber.match(/^(\d{2})/)
  if (!m) return null
  const div = parseInt(m[1]!, 10)
  return div >= 0 && div <= 99 ? div : null
}

function parseLineAsFormatA(line: string): { sectionNumber: string; sectionTitle: string } | null {
  const trimmed = line.trim()
  const m = ANY_SECTION_RE.exec(trimmed)
  if (!m) return null

  const rawSection = m[0]
  const rest = trimmed.slice(rawSection.length).replace(/^[\s\u002D\u2013\u2014\u2015]+/, "").trim()

  if (!rest || rest.length < 3) return null
  if (/^\d+$/.test(rest)) return null

  return {
    sectionNumber: normalizeSectionNumber(rawSection),
    sectionTitle: rest,
  }
}

function parseLineAsFormatB(line: string): { sectionNumber: string; sectionTitle: string; documentPageRef: string } | null {
  const m = DOT_LEADER_RE.exec(line.trim())
  if (!m) return null

  const rawTitle = (m[1] ?? "").trim()
  const rawPageRef = (m[2] ?? "").trim()
  if (!rawTitle || rawTitle.length < 4) return null

  const sectionMatch = ANY_SECTION_RE.exec(rawTitle)
  const sectionNumber = sectionMatch
    ? normalizeSectionNumber(sectionMatch[0])
    : rawTitle.slice(0, 20).trim()
  const sectionTitle = sectionMatch
    ? rawTitle.slice(sectionMatch[0].length).replace(/^[\s\-–—]+/, "").trim()
    : rawTitle

  return { sectionNumber, sectionTitle: sectionTitle || rawTitle, documentPageRef: rawPageRef }
}

function extractEntriesFromLines(
  lines: string[],
  source: "front-end" | "technical"
): TocEntry[] {
  const entries: TocEntry[] = []

  for (const line of lines) {
    if (DIVISION_HEADER_RE.test(line.trim())) continue
    if (line.trim().length < 5) continue

    const a = parseLineAsFormatA(line)
    if (a) {
      const div = parseCsiDivision(a.sectionNumber)
      const isValidSection =
        /^\d{2}\s\d{2}\s\d{2}$/.test(a.sectionNumber) ||
        /^\d{2}\s\d{4}(\.\d{2})?$/.test(a.sectionNumber) ||
        /^\d{5}$/.test(a.sectionNumber) ||
        /^[A-Z]-\d{1,3}(-\d{1,2})?$/.test(a.sectionNumber)
      if (!isValidSection) continue
      entries.push({
        sectionNumber: a.sectionNumber,
        sectionTitle: a.sectionTitle,
        documentPageRef: null,
        pdfPageNumber: null,
        csiDivision: div,
        source,
      })
      continue
    }

    const b = parseLineAsFormatB(line)
    if (b) {
      const isValidSection =
        /^\d{2}\s\d{2}\s\d{2}$/.test(b.sectionNumber) ||
        /^\d{2}\s\d{4}(\.\d{2})?$/.test(b.sectionNumber) ||
        /^\d{5}$/.test(b.sectionNumber) ||
        /^[A-Z]-\d{1,3}(-\d{1,2})?$/.test(b.sectionNumber)
      if (!isValidSection) continue
      entries.push({
        sectionNumber: b.sectionNumber,
        sectionTitle: b.sectionTitle,
        documentPageRef: b.documentPageRef,
        pdfPageNumber: null,
        csiDivision: parseCsiDivision(b.sectionNumber),
        source,
      })
    }
  }

  return entries
}

function splitIntoLines(text: string): string[] {
  const newlineCount = (text.match(/\n/g) ?? []).length
  const spaceCount = (text.match(/ {2,}/g) ?? []).length

  if (newlineCount < 5 && spaceCount > 10) {
    return text.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
  }
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
}

function resolvePdfPageNumbers(
  entries: TocEntry[],
  pages: IntakeV2PageTextInput[]
): TocEntry[] {
  const sectionPageMap = new Map<string, number>()

  for (const page of pages) {
    const lines = splitIntoLines(page.fullText).slice(0, 8)
    for (const line of lines) {
      const m = BODY_SECTION_HEADER_RE.exec(line.trim())
      if (m && m[1]) {
        const normalized = normalizeSectionNumber(m[1])
        if (!sectionPageMap.has(normalized)) {
          sectionPageMap.set(normalized, page.pageNumber)
        }
        break
      }
    }
  }

  return entries.map((entry) => {
    const resolved = sectionPageMap.get(entry.sectionNumber)
    return resolved !== undefined ? { ...entry, pdfPageNumber: resolved } : entry
  })
}

function deduplicateEntries(entries: TocEntry[]): TocEntry[] {
  const seen = new Map<string, TocEntry>()
  for (const entry of entries) {
    const key = entry.sectionNumber
    if (!seen.has(key)) {
      seen.set(key, entry)
    } else {
      const existing = seen.get(key)!
      if (entry.pdfPageNumber !== null && existing.pdfPageNumber === null) {
        seen.set(key, entry)
      }
    }
  }
  return Array.from(seen.values())
}

export async function parseToc(pages: IntakeV2PageTextInput[]): Promise<TocParseResult> {
  const started = Date.now()

  try {
    const frontEndEntries: TocEntry[] = []
    const technicalEntries: TocEntry[] = []

    // Pass 1: pages 1–15, find TOC start then scan all consecutive TOC pages
    const frontPages = pages.filter(p => p.pageNumber <= 15)
    let tocStarted = false
    for (const page of frontPages) {
      if (!tocStarted && TOC_HEADER_RE.test(page.fullText)) {
        tocStarted = true
      }
      if (tocStarted) {
        const lines = splitIntoLines(page.fullText)
        const candidates = extractEntriesFromLines(lines, "front-end")
        // Stop scanning if we hit a page with zero entries and TOC has already
        // produced entries — means we've passed the end of the TOC
        if (candidates.length === 0 && frontEndEntries.length > 0) break
        frontEndEntries.push(...candidates)
      }
    }

    // If no TOC header found in first 15 pages, try parsing them anyway
    if (frontEndEntries.length === 0) {
      for (const page of frontPages) {
        const lines = splitIntoLines(page.fullText)
        const candidates = extractEntriesFromLines(lines, "front-end")
        if (candidates.length >= 3) {
          frontEndEntries.push(...candidates)
        }
      }
    }

    // Pass 2: pages beyond 15 with TOC header (technical specs TOC)
    for (const page of pages.filter(p => p.pageNumber > 15)) {
      if (TOC_HEADER_RE.test(page.fullText)) {
        const lines = splitIntoLines(page.fullText)
        technicalEntries.push(...extractEntriesFromLines(lines, "technical"))
      }
    }

    const merged = deduplicateEntries([...frontEndEntries, ...technicalEntries])
    const resolved = resolvePdfPageNumbers(merged, pages)
    const resolvedCount = resolved.filter(e => e.pdfPageNumber !== null).length

    return {
      ok: true,
      entries: resolved,
      frontEndEntriesFound: frontEndEntries.length,
      technicalEntriesFound: technicalEntries.length,
      resolvedCount,
      durationMs: Date.now() - started,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      entries: [],
      frontEndEntriesFound: 0,
      technicalEntriesFound: 0,
      resolvedCount: 0,
      durationMs: Date.now() - started,
    }
  }
}
