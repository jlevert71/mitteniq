import { buildLayoutEvidence, normalizeTextForAi } from "./layout-evidence"
import { getPagePrintSize } from "./pdf-analysis"
import type { BasicPdfChecks, PdfPageText } from "./pdf-types"
import { inferPageRoute, shouldFlagOcrCandidate } from "./router"
import { detectSpecSignals } from "./spec-signals"
import {
  POSITIONAL_EVIDENCE_CONFIDENCE,
  type IntakePreparedPage,
  type IntakePositionalEvidence,
} from "./types"

export function buildPreparedPages(
  pages: PdfPageText[],
  checks: BasicPdfChecks,
): IntakePreparedPage[] {
  return pages.map((page) => {
    const pagePrintSize = getPagePrintSize(page)
    const normalizedText = normalizeTextForAi(page.fullText)

    const textDensity =
      Math.max(normalizedText.length, page.items.length) /
      Math.max((page.width || 1) * (page.height || 1), 1)

    const specSignals = detectSpecSignals(page, normalizedText)

    const layoutEvidence = buildLayoutEvidence(page)

    const initialRouting = inferPageRoute({
      width: page.width || null,
      height: page.height || null,
      printSizeLabel: pagePrintSize.printSizeLabel,
      normalizedText,
      tokenCount: page.items.length,
      textDensity,
      isRasterLikely: checks.likelyRasterHeavy,
      lowYRightCornerText: layoutEvidence.lowYRightCornerText,
      highYRightCornerText: layoutEvidence.highYRightCornerText,
    })

    const needsOcr = shouldFlagOcrCandidate(
      normalizedText,
      page.items.length,
      textDensity,
      checks,
      initialRouting.likelyType,
    )

    let positionalEvidence: IntakePositionalEvidence | null | undefined = page.positionalEvidence
    if (positionalEvidence == null && page.items.length > 0) {
      positionalEvidence = {
        source: "NATIVE_PDF_POSITIONS",
        confidence: POSITIONAL_EVIDENCE_CONFIDENCE.NATIVE_PDF_POSITIONS,
      }
    }

    return {
      pageNumber: page.pageNumber,
      pdfFacts: {
        width: page.width || null,
        height: page.height || null,
        printSize: pagePrintSize.printSizeLabel,
        rotation: null,
        isRasterLikely: checks.likelyRasterHeavy,
        isSearchable: checks.likelySearchable,
        textDensity,
      },
      rawText: {
        fullText: page.fullText,
        normalizedText,
        lines: page.fullText
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean),
        tokens: page.items.map((item) => ({
          text: item.str,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        })),
      },
      ocrText: {
        fullText: null,
        normalizedText: null,
      },
      pageImage: {
        imagePath: null,
        width: page.width || null,
        height: page.height || null,
      },
      layoutEvidence,
      positionalEvidence: positionalEvidence ?? null,
      specSignals,
      routing: {
        initialPageType: initialRouting.likelyType,
        fileDefaultType: null,
        likelyType: initialRouting.likelyType,
        confidence: initialRouting.confidence,
        reasons: initialRouting.reasons,
        source: "PAGE_ONLY",
        pageOverrideApplied: false,
      },
      extractionWarnings: [
        normalizedText.length === 0 ? "NO_EXTRACTED_TEXT" : null,
        page.items.length === 0 ? "NO_POSITIONAL_TOKENS" : null,
        checks.likelyRasterHeavy ? "LIKELY_RASTER_HEAVY_PDF" : null,
        !checks.likelySearchable ? "LOW_SEARCHABLE_CONFIDENCE" : null,
        needsOcr ? "OCR_RECOMMENDED" : null,
        initialRouting.likelyType === "UNKNOWN" ? "ROUTING_UNCERTAIN" : null,
        specSignals.likelySpecSectionStart ? "SPEC_SECTION_START_SIGNAL" : null,
        specSignals.likelyIndexOrTocPage ? "SPEC_TOC_SIGNAL" : null,
        specSignals.likelyFrontEndPage ? "FRONT_END_SIGNAL" : null,
      ].filter(Boolean) as string[],
    }
  })
}