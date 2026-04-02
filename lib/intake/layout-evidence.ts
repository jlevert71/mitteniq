import type { IntakePreparedPage } from "./types"
import type { PdfPageText, PdfTextItem } from "./pdf-types"

function positionalLayoutNoteFor(page: PdfPageText): string | null {
  const src = page.positionalEvidence?.source
  if (src === "APPROXIMATED_FROM_TEXT") return "layout approximated from page text"
  if (src === "APPROXIMATED_FROM_OCR") return "layout approximated from OCR text"
  return null
}

export function normalizeTextForAi(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max))
}

function compactRegionText(value: string, maxLen: number) {
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (!cleaned) return null
  if (cleaned.length <= maxLen) return cleaned
  return cleaned.slice(0, maxLen).trim()
}

function sortTokensForReading(tokens: PdfTextItem[]) {
  return [...tokens].sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y)
    if (yDiff > 2) return b.y - a.y
    return a.x - b.x
  })
}

function joinTokensForReading(tokens: PdfTextItem[], maxLen: number) {
  if (!tokens.length) return null

  const text = sortTokensForReading(tokens)
    .map((token) => token.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return compactRegionText(text, maxLen)
}

function sliceFallbackText(
  fullText: string,
  region: "LOW_BAND" | "HIGH_BAND" | "LOW_RIGHT" | "HIGH_RIGHT" | "TAIL",
) {
  const cleaned = normalizeTextForAi(fullText)
  if (!cleaned) return null

  if (region === "TAIL") {
    return compactRegionText(cleaned.slice(Math.floor(cleaned.length * 0.65)), 500)
  }

  if (region === "LOW_BAND" || region === "LOW_RIGHT") {
    return compactRegionText(cleaned.slice(Math.floor(cleaned.length * 0.55)), 500)
  }

  return compactRegionText(cleaned.slice(0, Math.max(1, Math.floor(cleaned.length * 0.45))), 500)
}

export function buildLayoutEvidence(page: PdfPageText) {
  const validTokens = page.items.filter(
    (item) =>
      item &&
      Number.isFinite(item.x) &&
      Number.isFinite(item.y) &&
      typeof item.str === "string" &&
      item.str.trim().length > 0,
  )

  if (!validTokens.length) {
    return {
      lowYBandText: sliceFallbackText(page.fullText, "LOW_BAND"),
      highYBandText: sliceFallbackText(page.fullText, "HIGH_BAND"),
      lowYRightCornerText: sliceFallbackText(page.fullText, "LOW_RIGHT"),
      highYRightCornerText: sliceFallbackText(page.fullText, "HIGH_RIGHT"),
      tailText: sliceFallbackText(page.fullText, "TAIL"),
      positionalLayoutNote: positionalLayoutNoteFor(page),
    }
  }

  const xs = validTokens.map((item) => item.x)
  const ys = validTokens.map((item) => item.y)

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const xSpan = Math.max(maxX - minX, 1)
  const ySpan = Math.max(maxY - minY, 1)

  const lowYLimit = minY + ySpan * 0.24
  const highYLimit = maxY - ySpan * 0.24
  const rightXThreshold = minX + xSpan * 0.6

  const lowYBandTokens = validTokens.filter((item) => item.y <= lowYLimit)
  const highYBandTokens = validTokens.filter((item) => item.y >= highYLimit)

  const lowYRightCornerTokens = validTokens.filter(
    (item) => item.y <= lowYLimit && item.x >= rightXThreshold,
  )

  const highYRightCornerTokens = validTokens.filter(
    (item) => item.y >= highYLimit && item.x >= rightXThreshold,
  )

  return {
    lowYBandText:
      joinTokensForReading(lowYBandTokens, 500) ??
      sliceFallbackText(page.fullText, "LOW_BAND"),
    highYBandText:
      joinTokensForReading(highYBandTokens, 500) ??
      sliceFallbackText(page.fullText, "HIGH_BAND"),
    lowYRightCornerText:
      joinTokensForReading(lowYRightCornerTokens, 350) ??
      sliceFallbackText(page.fullText, "LOW_RIGHT"),
    highYRightCornerText:
      joinTokensForReading(highYRightCornerTokens, 350) ??
      sliceFallbackText(page.fullText, "HIGH_RIGHT"),
    tailText: sliceFallbackText(page.fullText, "TAIL"),
    positionalLayoutNote: positionalLayoutNoteFor(page),
  }
}

/** Count pages by positional token provenance (post PDF + optional OCR refresh). */
export function summarizePositionalEvidencePages(pages: IntakePreparedPage[]): {
  nativePositionPages: number
  approximatedTextPages: number
  approximatedOcrPages: number
} {
  let nativePositionPages = 0
  let approximatedTextPages = 0
  let approximatedOcrPages = 0
  for (const p of pages) {
    const src = p.positionalEvidence?.source
    if (src === "NATIVE_PDF_POSITIONS") nativePositionPages += 1
    else if (src === "APPROXIMATED_FROM_TEXT") approximatedTextPages += 1
    else if (src === "APPROXIMATED_FROM_OCR") approximatedOcrPages += 1
  }
  return { nativePositionPages, approximatedTextPages, approximatedOcrPages }
}