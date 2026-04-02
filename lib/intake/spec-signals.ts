import type { PdfPageText } from "./pdf-types"

function normalizeLooseSectionNumber(value: string) {
  const cleaned = value
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) return null

  const digitsOnly = cleaned.replace(/\D/g, "")
  if (digitsOnly.length === 6) {
    return `${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 4)} ${digitsOnly.slice(4, 6)}`
  }

  const spacedMatch = cleaned.match(/\b(\d{2})\s+(\d{2})\s+(\d{2})\b/)
  if (spacedMatch) {
    return `${spacedMatch[1]} ${spacedMatch[2]} ${spacedMatch[3]}`
  }

  const dashedMatch = cleaned.match(/\b(\d{2})-(\d{2})-(\d{2})\b/)
  if (dashedMatch) {
    return `${dashedMatch[1]} ${dashedMatch[2]} ${dashedMatch[3]}`
  }

  return null
}

function looksMostlyDividerText(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 80) return false
  if (/^[-_.\s]{3,}$/.test(trimmed)) return true
  if (/^page\s+\d+\s+of\s+\d+$/i.test(trimmed)) return true
  if (/^this page intentionally left blank$/i.test(trimmed)) return true
  return false
}

function pickHeaderHint(lines: string[]) {
  const top = lines.slice(0, 3).map((line) => line.trim()).filter(Boolean)
  if (!top.length) return null

  const candidate = top.find((line) => line.length >= 4 && line.length <= 120)
  return candidate ?? null
}

function pickFooterHint(lines: string[]) {
  const bottom = lines.slice(-3).map((line) => line.trim()).filter(Boolean)
  if (!bottom.length) return null

  const candidate = bottom.find((line) => line.length >= 4 && line.length <= 120)
  return candidate ?? null
}

export function detectSpecSignals(page: PdfPageText, normalizedText: string) {
  const lines = page.fullText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const reasons: string[] = []
  const firstLines = lines.slice(0, 8)
  const firstBlock = firstLines.join(" ").replace(/\s+/g, " ").trim()
  const lowerText = normalizedText.toLowerCase()

  const headerHint = pickHeaderHint(lines)
  const footerHint = pickFooterHint(lines)

  const explicitSectionPatterns = [
    /\bsection\s+(\d{2}\s+\d{2}\s+\d{2})\b/i,
    /\bsection\s+(\d{6})\b/i,
    /^\s*(\d{2}\s+\d{2}\s+\d{2})\b/i,
    /^\s*(\d{6})\b/i,
  ]

  let detectedSectionNumber: string | null = null

  for (const pattern of explicitSectionPatterns) {
    const match = firstBlock.match(pattern)
    if (match?.[1]) {
      detectedSectionNumber = normalizeLooseSectionNumber(match[1])
      if (detectedSectionNumber) {
        reasons.push("SECTION_NUMBER_DETECTED")
        break
      }
    }
  }

  let detectedSectionTitle: string | null = null

  for (let i = 0; i < Math.min(firstLines.length, 6); i += 1) {
    const line = firstLines[i]
    if (!line) continue

    const cleaned = line.replace(/\s+/g, " ").trim()

    if (/^section\b/i.test(cleaned)) continue
    if (/^\d{2}\s+\d{2}\s+\d{2}\b/.test(cleaned)) continue
    if (/^\d{6}\b/.test(cleaned)) continue
    if (/^(part|article)\s+\d+/i.test(cleaned)) continue
    if (/^(page|section)\b/i.test(cleaned)) continue
    if (looksMostlyDividerText(cleaned)) continue

    const alphaCount = (cleaned.match(/[a-z]/gi) ?? []).length
    if (alphaCount < 4) continue
    if (cleaned.length < 6 || cleaned.length > 140) continue

    detectedSectionTitle = cleaned
    reasons.push("SECTION_TITLE_CANDIDATE_DETECTED")
    break
  }

  const tocSignals = [
    /\btable of contents\b/i.test(lowerText),
    /\bcontents\b/i.test(firstBlock),
    /\bindex\b/i.test(firstBlock),
    /\bsection title\b/i.test(lowerText),
    /\bsection number\b/i.test(lowerText),
  ].filter(Boolean).length

  const frontEndSignals = [
    /\binstructions to bidders\b/i.test(lowerText),
    /\bnotice to bidders\b/i.test(lowerText),
    /\bbid form\b/i.test(lowerText),
    /\binvitation to bid\b/i.test(lowerText),
    /\bagreement\b/i.test(lowerText),
    /\bgeneral conditions\b/i.test(lowerText),
    /\bsupplementary conditions\b/i.test(lowerText),
    /\bproject manual\b/i.test(lowerText),
  ].filter(Boolean).length

  const specBodySignals = [
    /\bpart\s+1\b/i.test(lowerText),
    /\bpart\s+2\b/i.test(lowerText),
    /\bpart\s+3\b/i.test(lowerText),
    /\bsummary\b/i.test(lowerText),
    /\bsubmittals\b/i.test(lowerText),
    /\breferences\b/i.test(lowerText),
    /\bquality assurance\b/i.test(lowerText),
    /\bproducts\b/i.test(lowerText),
    /\bexecution\b/i.test(lowerText),
  ].filter(Boolean).length

  const blankSignals = [
    normalizedText.length === 0,
    /^this page intentionally left blank$/i.test(firstBlock),
    lines.length <= 2 && lines.every(looksMostlyDividerText),
  ].filter(Boolean).length

  const likelyIndexOrTocPage = tocSignals >= 1
  const likelyFrontEndPage = frontEndSignals >= 1
  const likelyBlankOrDividerPage = blankSignals >= 1

  const likelySpecSectionStart =
    Boolean(detectedSectionNumber) ||
    (Boolean(detectedSectionTitle) && specBodySignals >= 1) ||
    (Boolean(detectedSectionTitle) && /section/i.test(firstBlock))

  const likelySpecContinuation =
    !likelySpecSectionStart &&
    !likelyFrontEndPage &&
    !likelyIndexOrTocPage &&
    !likelyBlankOrDividerPage &&
    specBodySignals >= 2

  if (likelyIndexOrTocPage) reasons.push("TOC_OR_INDEX_SIGNALS")
  if (likelyFrontEndPage) reasons.push("FRONT_END_SIGNALS")
  if (likelyBlankOrDividerPage) reasons.push("BLANK_OR_DIVIDER_SIGNALS")
  if (likelySpecSectionStart) reasons.push("LIKELY_SPEC_SECTION_START")
  if (likelySpecContinuation) reasons.push("LIKELY_SPEC_CONTINUATION")
  if (headerHint) reasons.push("HEADER_HINT_PRESENT")
  if (footerHint) reasons.push("FOOTER_HINT_PRESENT")

  return {
    likelySpecSectionStart,
    likelySpecContinuation,
    likelyFrontEndPage,
    likelyIndexOrTocPage,
    likelyBlankOrDividerPage,
    detectedSectionNumber,
    detectedSectionTitle,
    headerHint,
    footerHint,
    signalReasons: Array.from(new Set(reasons)),
  }
}