/**
 * Early deterministic blank heuristic (runs before router).
 * Upstream signal only — does not replace final AI blank normalization.
 */

import type { IntakePreparedPage } from "./types"

export type FastBlankClassification =
  | "TRUE_BLANK"
  | "INTENTIONAL_BLANK"
  | "LOW_CONTENT_NONBLANK"
  | "NOT_BLANK"

export type FastBlankPageMetadata = {
  classification: FastBlankClassification
  reasons: string[]
  meaningfulCharCount: number
}

const INTENTIONAL_PHRASES = [
  /\bthis\s+page\s+intentionally\s+left\s+blank\b/i,
  /\bintentionally\s+left\s+blank\b/i,
  /\bintentionally\s+blank\b/i,
]

function combinedText(page: IntakePreparedPage): string {
  const raw = page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText ?? page.ocrText.fullText ?? ""
  return [raw, ocr].filter(Boolean).join("\n")
}

/** Non-whitespace characters (deterministic proxy for “visible” content). */
export function meaningfulCharCountFromText(text: string): number {
  return text.replace(/\s+/g, "").length
}

/** Heavy AI chunking may skip obvious blank pages when this is true. */
export function shouldSkipHeavyAiForFastBlank(page: IntakePreparedPage): boolean {
  const c = page.fastBlank?.classification
  return c === "TRUE_BLANK" || c === "INTENTIONAL_BLANK"
}

function hasMeaningfulStructuralHints(page: IntakePreparedPage): boolean {
  const s = page.specSignals
  if (s.likelyIndexOrTocPage) return true
  if (s.likelyFrontEndPage) return true
  if (s.likelySpecSectionStart) return true
  if (s.detectedSectionNumber) return true
  if (s.detectedSectionTitle && s.detectedSectionTitle.trim().length >= 6) return true
  if (s.headerHint && s.headerHint.trim().length > 4) return true
  if (s.footerHint && s.footerHint.trim().length > 4) return true
  if (s.likelySpecContinuation) return true
  const le = page.layoutEvidence
  const bandSum =
    (le.lowYBandText?.length ?? 0) +
    (le.highYBandText?.length ?? 0) +
    (le.lowYRightCornerText?.length ?? 0) +
    (le.highYRightCornerText?.length ?? 0)
  if (bandSum > 120) return true
  return false
}

function isIntentionalBlankPhrase(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return INTENTIONAL_PHRASES.some((re) => re.test(t))
}

/**
 * Classify a page using only deterministic inputs available right after `buildPreparedPages`.
 */
export function classifyFastBlankPage(page: IntakePreparedPage): FastBlankPageMetadata {
  const text = combinedText(page)
  const meaningfulCharCount = meaningfulCharCountFromText(text)
  const density = page.pdfFacts.textDensity ?? 0
  const reasons: string[] = []
  const structural = hasMeaningfulStructuralHints(page)

  if (isIntentionalBlankPhrase(text)) {
    reasons.push("INTENTIONAL_BLANK_PHRASE")
    return {
      classification: "INTENTIONAL_BLANK",
      reasons,
      meaningfulCharCount,
    }
  }

  if (structural && meaningfulCharCount < 100) {
    reasons.push("SPARSE_TEXT_WITH_STRUCTURAL_HINTS")
    if (page.specSignals.likelyIndexOrTocPage) reasons.push("TOC_OR_INDEX_SIGNAL")
    if (page.specSignals.likelyFrontEndPage) reasons.push("FRONT_END_SIGNAL")
    if (page.specSignals.likelySpecSectionStart) reasons.push("SPEC_SECTION_START")
    if (page.specSignals.detectedSectionNumber) reasons.push("SECTION_NUMBER")
    if (page.specSignals.detectedSectionTitle) reasons.push("SECTION_TITLE")
    if (page.specSignals.likelySpecContinuation) reasons.push("SPEC_CONTINUATION")
    return {
      classification: "LOW_CONTENT_NONBLANK",
      reasons,
      meaningfulCharCount,
    }
  }

  const veryLowChars = meaningfulCharCount <= 18
  const veryLowDensity = density < 0.00045
  const noExtracted = page.extractionWarnings.includes("NO_EXTRACTED_TEXT")

  if (veryLowChars && veryLowDensity && !structural) {
    reasons.push("VERY_LOW_CHARS_AND_DENSITY")
    if (noExtracted) reasons.push("NO_EXTRACTED_TEXT")
    return {
      classification: "TRUE_BLANK",
      reasons,
      meaningfulCharCount,
    }
  }

  if (veryLowChars && !structural && meaningfulCharCount <= 8 && density < 0.0008) {
    reasons.push("MINIMAL_CHARS_NO_STRUCTURE")
    return {
      classification: "TRUE_BLANK",
      reasons,
      meaningfulCharCount,
    }
  }

  if (meaningfulCharCount < 55 && density < 0.0009 && !structural && page.specSignals.likelyBlankOrDividerPage) {
    reasons.push("SPARSE_LIKELY_BLANK_DIVIDER_NO_STRONG_STRUCTURE")
    return {
      classification: "TRUE_BLANK",
      reasons,
      meaningfulCharCount,
    }
  }

  reasons.push("SUBSTANTIAL_TEXT_OR_DENSITY")
  return {
    classification: "NOT_BLANK",
    reasons,
    meaningfulCharCount,
  }
}

export function attachFastBlankMetadataToPages(
  pages: IntakePreparedPage[],
): IntakePreparedPage[] {
  return pages.map((page) => ({
    ...page,
    fastBlank: classifyFastBlankPage(page),
  }))
}

export function summarizeFastBlankPass(pages: IntakePreparedPage[]): {
  totalPages: number
  trueBlankPages: number
  intentionalBlankPages: number
  lowContentNonBlankPages: number
} {
  let trueBlankPages = 0
  let intentionalBlankPages = 0
  let lowContentNonBlankPages = 0

  for (const p of pages) {
    const c = p.fastBlank?.classification
    if (c === "TRUE_BLANK") trueBlankPages += 1
    else if (c === "INTENTIONAL_BLANK") intentionalBlankPages += 1
    else if (c === "LOW_CONTENT_NONBLANK") lowContentNonBlankPages += 1
  }

  return {
    totalPages: pages.length,
    trueBlankPages,
    intentionalBlankPages,
    lowContentNonBlankPages,
  }
}
