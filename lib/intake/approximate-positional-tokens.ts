/**
 * When pdf-parse (or similar) returns plain page text without pdf.js text items,
 * synthesize coarse x/y tokens so layout-evidence and downstream heuristics can run.
 * Coordinates follow a simple top-to-bottom, left-to-right model in PDF user units.
 */

import type { PdfTextItem } from "./pdf-types"

const DEFAULT_W = 612
const DEFAULT_H = 792

export function buildApproximatePdfTextItemsFromFullText(
  fullText: string,
  pageWidth: number,
  pageHeight: number,
): PdfTextItem[] {
  const w = pageWidth > 0 && Number.isFinite(pageWidth) ? pageWidth : DEFAULT_W
  const h = pageHeight > 0 && Number.isFinite(pageHeight) ? pageHeight : DEFAULT_H
  const trimmed = fullText.trim()
  if (!trimmed) return []

  let lines = fullText.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  if (lines.length === 1 && trimmed.length > 160) {
    const tabOrGapSplit = trimmed.split(/\t+|\s{2,}/).filter(Boolean)
    if (tabOrGapSplit.length >= 2) {
      lines = tabOrGapSplit
    }
  }

  const n = lines.length
  const verticalSlice = h / Math.max(n + 1, 2)
  const out: PdfTextItem[] = []

  for (let i = 0; i < n; i++) {
    const y = h - verticalSlice * (i + 1)
    const words = lines[i].split(/\s+/).filter(Boolean)
    let x = w * 0.05
    const charW = Math.max(w * 0.0075, 3)

    for (const word of words) {
      if (word.length > 96) continue
      const tw = Math.min(word.length * charW, w * 0.5)
      out.push({
        str: word,
        x,
        y,
        width: tw,
        height: Math.max(verticalSlice * 0.72, 5),
      })
      x += tw + charW * 1.15
      if (x > w * 0.94) break
    }
  }

  return out
}
