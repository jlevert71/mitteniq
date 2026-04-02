/**
 * Deterministic detection of drawing sheet index / list-of-sheets pages (first N pages).
 */

import type { IntakePreparedPage } from "./types"

const DEFAULT_MAX_SCAN_PAGES = 8

/** Strong index-table header phrases; absence + drawing signals triggers narrow continuation rejection. */
const INDEX_TABLE_HEADER_RES: RegExp[] = [
  /\bINDEX\s+OF\s+SHEETS\b/i,
  /\bSHEET\s+NO\.?\b/i,
  /\bDESCRIPTION\b/i,
]

const TITLE_BLOCK_SHEET_ID_RE = /\b[A-Z]{1,3}-\d{1,4}\b/

const NORMAL_DRAWING_TITLE_HINT_RES: RegExp[] = [
  /\bLEGEND\b/i,
  /\bPROCESS\s+FLOW\b/i,
  /\bPLAN\b/i,
]

function pageHasIndexTableHeaderSignals(text: string): boolean {
  const t = text.slice(0, 200_000)
  return INDEX_TABLE_HEADER_RES.some((re) => {
    re.lastIndex = 0
    return re.test(t)
  })
}

function pageHasNormalDrawingTitleHint(hints: IntakePreparedPage["drawingIdentityHints"]): boolean {
  const title = hints?.sheetTitleCandidate?.trim()
  if (!title) return false
  return NORMAL_DRAWING_TITLE_HINT_RES.some((re) => {
    re.lastIndex = 0
    return re.test(title)
  })
}

function pageHasTitleBlockSheetNumberHint(hints: IntakePreparedPage["drawingIdentityHints"]): boolean {
  const sn = hints?.sheetNumberCandidate?.trim()
  if (!sn) return false
  TITLE_BLOCK_SHEET_ID_RE.lastIndex = 0
  return TITLE_BLOCK_SHEET_ID_RE.test(sn)
}

/**
 * Narrow anti–false-positive: normal drawing title-block identity without index header cues
 * must not join the index continuation / multi-page index block.
 */
export function shouldRejectFalseIndexContinuation(
  page: IntakePreparedPage,
): { reject: boolean; reasons: string[] } {
  const text = pageCombinedText(page)
  const hints = page.drawingIdentityHints

  if (pageHasIndexTableHeaderSignals(text)) {
    return { reject: false, reasons: [] }
  }

  const reasons: string[] = []
  const hasSheetId = pageHasTitleBlockSheetNumberHint(hints)
  const hasDrawingTitle = pageHasNormalDrawingTitleHint(hints)

  if (hasSheetId) reasons.push("title_block_sheet_number_hint")
  if (hasDrawingTitle) reasons.push("normal_drawing_sheet_title_hint")

  if (!hasSheetId && !hasDrawingTitle) {
    return { reject: false, reasons: [] }
  }

  reasons.push("missing_index_table_header_signals")
  return { reject: true, reasons }
}

const INDEX_PHRASES: RegExp[] = [
  /\bINDEX\s+OF\s+SHEETS\b/i,
  /\bSHEET\s+INDEX\b/i,
  /\bDRAWING\s+INDEX\b/i,
  /\bSHEET\s+NO\.?\b/i,
  /\bSHEET\s+NUMBER\b/i,
  /\bDESCRIPTION\b/i,
  /\bLIST\s+OF\s+DRAWINGS\b/i,
  /\bDRAWING\s+LIST\b/i,
  /\bSHEET\s+LIST\b/i,
]

function pageCombinedText(page: IntakePreparedPage): string {
  const raw = page.rawText.normalizedText?.trim() ?? page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText ?? ""
  return [raw, ocr].filter(Boolean).join("\n")
}

function scorePageAsIndexCandidate(text: string, pageIndexInScan: number): number {
  const t = text.slice(0, 200_000)
  let s = 0
  for (const re of INDEX_PHRASES) {
    re.lastIndex = 0
    if (re.test(t)) s += 12
  }
  const idMatches = t.match(/\b[A-Z]-0*\d{1,4}\b/g) ?? []
  s += Math.min(idMatches.length * 2, 42)

  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const shortLines = lines.filter((l) => l.length > 0 && l.length < 96)
  const shortRatio = lines.length > 0 ? shortLines.length / lines.length : 0
  s += shortRatio * 18

  // Earlier pages in the scan window score higher.
  s += Math.max(0, DEFAULT_MAX_SCAN_PAGES - 1 - pageIndexInScan) * 2.5
  return s
}

function groupConsecutive(nums: number[]): number[][] {
  if (nums.length === 0) return []
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const blocks: number[][] = []
  let cur: number[] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!
    if (n === cur[cur.length - 1]! + 1) cur.push(n)
    else {
      blocks.push(cur)
      cur = [n]
    }
  }
  blocks.push(cur)
  return blocks
}

export type IndexCandidateDetectionResult = {
  candidatePages: number[]
  groupedBlocks: number[][]
  pageScores: Map<number, number>
}

/**
 * Scan the first `maxPages` prepared pages for index-like signals.
 */
export function detectIndexCandidates(
  preparedPages: IntakePreparedPage[],
  maxPages: number = DEFAULT_MAX_SCAN_PAGES,
): IndexCandidateDetectionResult {
  const capped = Math.min(maxPages, preparedPages.length)
  const pageScores = new Map<number, number>()
  const candidatePages: number[] = []
  const threshold = 26

  for (let i = 0; i < capped; i++) {
    const page = preparedPages[i]!
    const text = pageCombinedText(page)
    const score = scorePageAsIndexCandidate(text, i)
    pageScores.set(page.pageNumber, score)
    if (score >= threshold) {
      const fp = shouldRejectFalseIndexContinuation(page)
      if (fp.reject) {
        console.log("visibleIntake:indexContinuationRejection", {
          pageNumber: page.pageNumber,
          rejectedAsContinuation: true,
          reasons: fp.reasons,
        })
      } else {
        candidatePages.push(page.pageNumber)
      }
    }
  }

  candidatePages.sort((a, b) => a - b)
  const groupedBlocks = groupConsecutive(candidatePages)

  return { candidatePages, groupedBlocks, pageScores }
}

export type BestIndexBlockResult = {
  selectedPages: number[]
  confidence: number
}

/**
 * Prefer the longest consecutive candidate block; tie-break by average score.
 */
export function selectBestIndexBlock(
  groupedBlocks: number[][],
  pageScores: Map<number, number>,
): BestIndexBlockResult {
  if (groupedBlocks.length === 0) {
    return { selectedPages: [], confidence: 0 }
  }

  let best: number[] = groupedBlocks[0]!
  let bestScore = -1

  for (const block of groupedBlocks) {
    const avg =
      block.reduce((sum, pn) => sum + (pageScores.get(pn) ?? 0), 0) / block.length
    const combined = block.length * 100 + avg
    if (combined > bestScore) {
      bestScore = combined
      best = block
    }
  }

  const avgPage =
    best.reduce((sum, pn) => sum + (pageScores.get(pn) ?? 0), 0) / Math.max(best.length, 1)
  const confidence = Math.min(1, (avgPage / 95) * Math.min(1, best.length / 2.5))

  return { selectedPages: best, confidence }
}
