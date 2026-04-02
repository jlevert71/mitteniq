/**
 * intake_v2 — minimal per-page text extraction (no v1 stack).
 */

/** One page of text from PDF text extraction. */
export type IntakeV2PageTextInput = {
  pageNumber: number
  fullText: string
  normalizedText: string
  pageDimensions: { widthIn: number; heightIn: number } | null
}

/** One row per PDF page: best-guess sheet id + title from lines only. */
export type IntakeV2SimplePageRow = {
  pageNumber: number
  sheetNumber: string | null
  title: string | null
  debugLines: string[]
}

export type IntakeV2PagePreview = {
  pageNumber: number
  charCount: number
  preview: string
}

export type IntakeV2PageSizeSummary = {
  widthIn: number
  heightIn: number
  label: "Specifications" | "Drawings"
  count: number
}

export type IntakeV2RunResult = {
  ok: boolean
  error?: string
  pageCount: number
  rows: IntakeV2SimplePageRow[]
  pagePreviews: IntakeV2PagePreview[]
  pageSizes: IntakeV2PageSizeSummary[]
  toc: TocParseResult
  meta: {
    durationMs: number
  }
}

/** One entry from a spec book table of contents. */
export type TocEntry = {
  sectionNumber: string        // e.g. "26 05 00" or "16060"
  sectionTitle: string         // e.g. "Common Work Results for Electrical"
  documentPageRef: string | null // as printed in TOC, e.g. "26050-1"
  pdfPageNumber: number | null // resolved PDF page number, null if not found
  csiDivision: number | null   // e.g. 26, null if not a CSI section number
  source: "front-end" | "technical" // which TOC it came from
}

export type TocParseResult = {
  ok: boolean
  error?: string
  entries: TocEntry[]
  frontEndEntriesFound: number
  technicalEntriesFound: number
  resolvedCount: number        // how many pdfPageNumbers are non-null
  durationMs: number
}
