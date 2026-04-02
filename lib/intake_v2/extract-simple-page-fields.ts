/**
 * Best-guess sheet number + title per page from text lines only.
 * No validation, registry, AI, or document-level logic.
 */
import type { IntakeV2PageTextInput, IntakeV2SimplePageRow } from "./types"

const TITLE_WORDS = [
  "PLAN",
  "PLANS",
  "DETAIL",
  "DETAILS",
  "NOTE",
  "NOTES",
  "SCHEDULE",
  "SCHEDULES",
  "SPECIFICATION",
] as const

/** Sheet-ish token: A101, E-101, D-0, M-12.3 (hyphen optional between letters and digits). */
const SHEET_TOKEN_RE =
  /\b([A-Z]{1,3})-(\d{1,4}(?:\.\d{1,3})?)\b|\b([A-Z]{1,3})(\d{2,4}(?:\.\d{1,3})?)\b/g

function sheetLineScore(norm: string): number {
  let s = 0
  const len = norm.length
  if (len > 36) return -100
  if (len <= 18) s += 2
  if (len <= 10) s += 2

  const hasLetter = /[A-Z]/.test(norm)
  const hasDigit = /\d/.test(norm)
  if (!hasLetter || !hasDigit) return s - 80

  SHEET_TOKEN_RE.lastIndex = 0
  const hit = SHEET_TOKEN_RE.exec(norm)
  if (!hit) return s

  // Whole line is basically just the id
  const compact = norm.replace(/\s+/g, "")
  if (/^[A-Z]{1,3}-?\d/.test(compact) && len <= 14) s += 14
  else s += 8

  if (/\b(INDEX|SHEET\s+LIST|CONTENTS)\b/.test(norm)) s -= 6

  return s
}

function titleLineScore(norm: string): number {
  let s = 0
  const len = norm.length
  if (len < 8) return -100
  if (/^\s*[\d.\s\-–—/]+\s*$/.test(norm)) return -100

  for (const w of TITLE_WORDS) {
    if (norm.includes(w)) s += 7
  }
  if (len >= 10 && len <= 140) s += 2
  if (len > 200) s -= 4

  return s
}

function firstSheetToken(norm: string): string | null {
  SHEET_TOKEN_RE.lastIndex = 0
  const m = SHEET_TOKEN_RE.exec(norm)
  if (!m) return null
  if (m[1] && m[2]) return `${m[1]}-${m[2]}`
  if (m[3] && m[4]) return `${m[3]}-${m[4]}`
  return null
}

function extractOnePage(page: IntakeV2PageTextInput): IntakeV2SimplePageRow {
  const rawLines = page.fullText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const normLines = rawLines.map((l) => l.toUpperCase())

  let bestSheet = { score: -1_000, norm: "", raw: "", token: null as string | null }
  let bestTitle = { score: -1_000, raw: "" }

  for (let i = 0; i < normLines.length; i++) {
    const norm = normLines[i]!
    const raw = rawLines[i]!

    const ss = sheetLineScore(norm)
    if (ss > bestSheet.score) {
      bestSheet = {
        score: ss,
        norm,
        raw,
        token: firstSheetToken(norm),
      }
    }

    const ts = titleLineScore(norm)
    if (ts > bestTitle.score) {
      bestTitle = { score: ts, raw }
    }
  }

  const SHEET_MIN = 5
  const TITLE_MIN = 6

  const sheetNumber = bestSheet.score >= SHEET_MIN ? bestSheet.token ?? bestSheet.raw.slice(0, 24) : null

  const title = bestTitle.score >= TITLE_MIN ? bestTitle.raw : null

  const debugLines: string[] = []
  const scored = normLines.map((nl, i) => ({
    nl: nl.slice(0, 120),
    ms: Math.max(sheetLineScore(nl), titleLineScore(nl)),
  }))
  scored.sort((a, b) => b.ms - a.ms)
  for (const x of scored) {
    if (x.ms > 0 && debugLines.length < 10) debugLines.push(x.nl)
  }
  for (let i = 0; i < normLines.length && debugLines.length < 14; i++) {
    const line = normLines[i]!.slice(0, 120)
    if (!debugLines.includes(line)) debugLines.push(line)
  }

  return {
    pageNumber: page.pageNumber,
    sheetNumber,
    title,
    debugLines,
  }
}

export function extractSimplePageFieldsFromPages(pages: IntakeV2PageTextInput[]): IntakeV2SimplePageRow[] {
  return pages.map(extractOnePage)
}
