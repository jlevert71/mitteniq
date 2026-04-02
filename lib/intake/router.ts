import { clamp } from "./layout-evidence"
import type { BasicPdfChecks } from "./pdf-types"
import type { IntakeRouteType } from "./types"

/** Sheet-style numbers often seen in drawing title blocks (E-101, A1.2, S1.01, …). */
const SHEET_NUMBER_LIKE_RE = /\b[A-Z]{1,3}[- ]?\d{1,4}(\.\d{1,3})?\b/

const TITLE_BLOCK_HINT_RES = [
  /\bscale\b/i,
  /\bdrawn\b/i,
  /\bchecked\b/i,
  /\bsheet\b/i,
  /\bproject\b/i,
] as const

function countDrawingIdentitySignals(
  lowYRightCornerText: string | null | undefined,
  highYRightCornerText: string | null | undefined,
): number {
  let signals = 0
  for (const corner of [lowYRightCornerText, highYRightCornerText]) {
    if (!corner) continue
    const t = corner.trim()
    if (!t) continue
    if (SHEET_NUMBER_LIKE_RE.test(t)) {
      signals += 1
      continue
    }
    if (TITLE_BLOCK_HINT_RES.some((re) => re.test(t))) {
      signals += 1
    }
  }
  return signals
}

export function inferPageRoute(args: {
  width: number | null
  height: number | null
  printSizeLabel: string | null
  normalizedText: string
  tokenCount: number
  textDensity: number
  isRasterLikely: boolean
  /** Title-block regions from layout evidence (optional). */
  lowYRightCornerText?: string | null
  highYRightCornerText?: string | null
}) {
  const {
    width,
    height,
    normalizedText,
    tokenCount,
    textDensity,
    isRasterLikely,
    lowYRightCornerText,
    highYRightCornerText,
  } = args

  const reasons: string[] = []
  const lowerText = normalizedText.toLowerCase()

  const shortSideInches =
    width && height ? Math.round((Math.min(width, height) / 72) * 100) / 100 : null
  const longSideInches =
    width && height ? Math.round((Math.max(width, height) / 72) * 100) / 100 : null

  const isLetterLike =
    shortSideInches !== null &&
    longSideInches !== null &&
    Math.abs(shortSideInches - 8.5) <= 0.5 &&
    Math.abs(longSideInches - 11) <= 0.75

  const isLargeFormat =
    shortSideInches !== null &&
    longSideInches !== null &&
    (shortSideInches >= 10.5 || longSideInches >= 16.5)

  const specSignals = [
    /\bsection\s+\d{2}\s*\d{2}\s*\d{2}\b/i.test(lowerText),
    /\btable of contents\b/i.test(lowerText),
    /\bend of section\b/i.test(lowerText),
    /\bpart 1\s*[-–—]?\s*general\b/i.test(lowerText),
    /\bpart 2\s*[-–—]?\s*products\b/i.test(lowerText),
    /\bpart 3\s*[-–—]?\s*execution\b/i.test(lowerText),
    /\brelated documents\b/i.test(lowerText),
    /\bsubmittals\b/i.test(lowerText),
    /\bquality assurance\b/i.test(lowerText),
  ].filter(Boolean).length

  const bidSignals = [
    /\binstructions to bidders\b/i.test(lowerText),
    /\bnotice to bidders\b/i.test(lowerText),
    /\bbid form\b/i.test(lowerText),
    /\binvitation to bid\b/i.test(lowerText),
    /\bgeneral conditions\b/i.test(lowerText),
    /\bsupplementary conditions\b/i.test(lowerText),
  ].filter(Boolean).length

  const drawingSignals = [
    /\bpanel schedule\b/i.test(lowerText),
    /\bone[- ]line\b/i.test(lowerText),
    /\briser\b/i.test(lowerText),
    /\blegend\b/i.test(lowerText),
    /\bdetail\b/i.test(lowerText),
    /\belectrical\b/i.test(lowerText),
    /\blighting\b/i.test(lowerText),
    /\bpower\b/i.test(lowerText),
    /\bsite plan\b/i.test(lowerText),
    /\bfloor plan\b/i.test(lowerText),
    /\breflected ceiling plan\b/i.test(lowerText),
    /\b[A-Z]{1,4}-\d{1,4}(?:\.\d{1,3})?\b/.test(normalizedText),
  ].filter(Boolean).length

  const drawingIdentitySignals = countDrawingIdentitySignals(
    lowYRightCornerText,
    highYRightCornerText,
  )

  if (isLetterLike) reasons.push("LETTER_SIZE_PAGE")
  if (isLargeFormat) reasons.push("LARGE_FORMAT_PAGE")
  if (specSignals > 0) reasons.push(`SPEC_SIGNALS_${specSignals}`)
  if (bidSignals > 0) reasons.push(`BID_SIGNALS_${bidSignals}`)
  if (drawingSignals > 0) reasons.push(`DRAWING_SIGNALS_${drawingSignals}`)
  if (drawingIdentitySignals > 0) {
    reasons.push(`DRAWING_IDENTITY_SIGNALS_${drawingIdentitySignals}`)
  }
  if (textDensity > 0.002) reasons.push("HIGH_TEXT_DENSITY")
  if (textDensity < 0.0005) reasons.push("LOW_TEXT_DENSITY")
  if (tokenCount === 0) reasons.push("NO_POSITIONAL_TOKENS")
  if (isRasterLikely) reasons.push("RASTER_LIKELY")

  if ((specSignals >= 2 || bidSignals >= 2) && isLetterLike) {
    return {
      likelyType: "SPEC" as IntakeRouteType,
      confidence: clamp(0.92, 0, 1),
      reasons,
    }
  }

  if (drawingIdentitySignals >= 1 && (isLargeFormat || drawingSignals >= 1)) {
    reasons.push("DRAWING_IDENTITY_SIGNAL")
    return {
      likelyType: "DRAWING" as IntakeRouteType,
      confidence: clamp(0.88, 0, 1),
      reasons,
    }
  }

  if (drawingSignals >= 2 && isLargeFormat) {
    return {
      likelyType: "DRAWING" as IntakeRouteType,
      confidence: clamp(0.92, 0, 1),
      reasons,
    }
  }

  if ((drawingSignals >= 1 && specSignals >= 1) || (isLetterLike && drawingSignals >= 2)) {
    return {
      likelyType: "MIXED" as IntakeRouteType,
      confidence: clamp(0.72, 0, 1),
      reasons,
    }
  }

  if (isLetterLike && textDensity > 0.0015) {
    return {
      likelyType: "SPEC" as IntakeRouteType,
      confidence: clamp(0.78, 0, 1),
      reasons,
    }
  }

  if (isLargeFormat && textDensity < 0.001) {
    return {
      likelyType: "DRAWING" as IntakeRouteType,
      confidence: clamp(0.78, 0, 1),
      reasons,
    }
  }

  return {
    likelyType: "UNKNOWN" as IntakeRouteType,
    confidence: clamp(0.45, 0, 1),
    reasons,
  }
}

export function shouldFlagOcrCandidate(
  normalizedText: string,
  itemsLength: number,
  textDensity: number,
  checks: BasicPdfChecks,
  routeType: IntakeRouteType,
) {
  if (!normalizedText) return true
  if (itemsLength === 0) return true
  if (textDensity < 0.00015) return true
  if (checks.likelyRasterHeavy) return true
  if (routeType === "SPEC" && normalizedText.length < 120) return true
  if (routeType === "DRAWING" && normalizedText.length < 40) return true
  return false
}