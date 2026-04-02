import { prisma } from "@/lib/prisma"
import { populateOcrTextForPreparedPages } from "@/lib/intake/ocr"
import { populatePageImagesForPreparedPages } from "@/lib/intake/page-images"
import { basicPdfChecks, extractPrintSizes } from "@/lib/intake/pdf-analysis"
import { summarizePositionalEvidencePages } from "@/lib/intake/layout-evidence"
import { extractPdfPages } from "@/lib/intake/pdf-text-extraction"
import { enrichPreparedPagesWithVisualDrawingIdentity } from "@/lib/intake/drawing-identity-from-image"
import { attachDrawingIdentityHintsToPreparedPages } from "@/lib/intake/drawing-identity"
import {
  buildDrawingSetRegistryFromPreparedPagesWithLog,
  buildPage1RegistryDebug,
} from "@/lib/intake/drawing-set-registry"
import { buildPreparedPages } from "@/lib/intake/prepare-pages"
import {
  attachFastBlankMetadataToPages,
  shouldSkipHeavyAiForFastBlank,
  summarizeFastBlankPass,
} from "@/lib/intake/fast-blank-pass"
import {
  buildVisibleIntakeFrontStructureDebug,
  deriveIntakeStructureMode,
  runFrontStructureScan,
  summarizeFrontStructureScan,
  type FrontStructureScanResult,
} from "@/lib/intake/front-structure-scan"
import {
  applyRegistryLedValidationAndLabels,
  isFrontStructureAuthorityCredible,
  summarizeRegistryValidation,
  type RegistryValidationResult,
} from "@/lib/intake/registry-validation"
import { groupSpecSections } from "@/lib/intake/spec-section-grouping"
import type { PdfPageText } from "@/lib/intake/pdf-types"
import {
  buildAiReviewSummary,
  buildLegacyContentCounts,
  buildLegacyDrawingSummary,
  buildLegacySpecSummary,
  buildPreparedPagePreview,
  buildSheetDetectionPreview,
  buildSqlSheetRows,
} from "@/lib/intake/report-mappers"
import { readUploadBufferFromR2 } from "@/lib/intake/r2-read"
import {
  AI_INTAKE_MODEL,
  canRunAiIntake,
  finalizeIntakeRunResultPages,
  runAiIntake,
  runDrawingIndexSheetListExtraction,
  runForcedSingleIndexPageExtraction,
} from "@/lib/intake/run-ai-intake"
import {
  buildCanonicalSheetRegistryFromRows,
  buildIndexExtractionPageStub,
  verifyDrawingPagesAgainstCanonicalRegistry,
} from "@/lib/intake/index-canonical-registry"
import { detectIndexCandidates, selectBestIndexBlock } from "@/lib/intake/index-page-detection"
import type { IntakeNormalizedPage } from "@/lib/intake/types"
import {
  buildAllDeterministicNormalizedPages,
  buildVisibleIntakeSelectionSummary,
  mergeVisibleIntakeWithStubs,
  runPreAiPageSelection,
  summarizeVisibleIntakeAiMerge,
} from "@/lib/intake/visible-intake-selection"
import { applyRouterStage } from "@/lib/intake/router-stage"
import type { IntakeRouteType } from "@/lib/intake/types"

/** Page count at or above this is treated as "large" for processing-time copy. */
const INTAKE_LARGE_PAGE_THRESHOLD = 150

/** Set to `"true"` to run image-based drawing identity during visible intake even when front sheet index is credible. */
const ENV_VISIBLE_INTAKE_VISUAL_DRAWING_IDENTITY = "MITTENIQ_VISIBLE_INTAKE_VISUAL_DRAWING_IDENTITY"

function shouldRunVisualDrawingIdentityEnrichmentForVisibleIntake(
  frontStructureScan: FrontStructureScanResult,
): boolean {
  if (
    String(process.env[ENV_VISIBLE_INTAKE_VISUAL_DRAWING_IDENTITY] ?? "")
      .trim()
      .toLowerCase() === "true"
  ) {
    return true
  }
  return !isFrontStructureAuthorityCredible(frontStructureScan)
}

type RunIntakeAnalysisParams = {
  uploadId: string
  filename: string | null
  r2Key: string
}

type RunIntakeAnalysisResult = {
  upload: unknown
  report: Record<string, unknown>
  pageCount: number
  counts: ReturnType<typeof buildLegacyContentCounts>
  llmAssist: Record<string, unknown>
  frontStructureScan: FrontStructureScanResult
  registryValidation: RegistryValidationResult
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''")
}

async function setIntakeStage(uploadId: string, stage: string) {
  try {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { intakeStage: stage },
    })
  } catch (error) {
    console.error("ANALYZE: failed to update intake stage", { uploadId, stage, error })
  }
}

function buildIntakeDelayReason(params: {
  fileDefaultType: IntakeRouteType
  pageCount: number
  likelySearchable: boolean
  likelyRasterHeavy: boolean
  ocrAppliedPages: number
}): string | null {
  const {
    fileDefaultType,
    pageCount,
    likelySearchable,
    likelyRasterHeavy,
    ocrAppliedPages,
  } = params
  const large = INTAKE_LARGE_PAGE_THRESHOLD

  if (fileDefaultType === "MIXED") return "Mixed drawings and specs detected"
  if (fileDefaultType === "SPEC" && pageCount >= large) return "Large specification book"
  if (pageCount >= large) return "Large document"
  if (likelySearchable === false) return "Limited searchable text detected"
  if (ocrAppliedPages > 0) return "OCR required on some pages"
  if (likelyRasterHeavy === true) return "Image-heavy drawings"
  return null
}

export async function runIntakeAnalysis({
  uploadId,
  filename,
  r2Key,
}: RunIntakeAnalysisParams): Promise<RunIntakeAnalysisResult> {
  await setIntakeStage(uploadId, "READING_PDF")
  console.log("ANALYZE: reading file from R2")
  const { head, buffer: buf } = await readUploadBufferFromR2(r2Key)

  console.log("ANALYZE: file buffer loaded", { bytes: buf.length })

  const checks = basicPdfChecks(buf)
  const sizes = extractPrintSizes(buf)

  console.log("ANALYZE: basic checks done", {
    isPdf: checks.isPdf,
    hasXref: checks.hasXref,
    pageCount: checks.pageCount,
    likelySearchable: checks.likelySearchable,
    likelyRasterHeavy: checks.likelyRasterHeavy,
  })

  let pdfPages: PdfPageText[] = []
  try {
    console.log("ANALYZE: starting PDF page extraction")
    pdfPages = await extractPdfPages(buf)
    console.log("ANALYZE: PDF page extraction done", { pages: pdfPages.length })
  } catch (error) {
    console.error("PDF text extraction error:", error)
    pdfPages = []
  }

  const pageCount = pdfPages.length > 0 ? pdfPages.length : checks.pageCount ?? 0
  await setIntakeStage(uploadId, "PREPARING_PAGES")

  // (a) Prepared pages
  let preparedPages = buildPreparedPages(pdfPages, checks)
  console.log("ANALYZE: prepared pages built", { pages: preparedPages.length })

  // (b) Fast blank pass
  preparedPages = attachFastBlankMetadataToPages(preparedPages)
  console.log("fastBlankPass:summary", summarizeFastBlankPass(preparedPages))

  // (c) Router
  const routerResult = applyRouterStage(preparedPages)
  preparedPages = routerResult.pages
  console.log("ANALYZE: router stage complete", {
    fileDefaultType: routerResult.summary.fileDefaultType,
    confidence: routerResult.summary.confidence,
    reasons: routerResult.summary.reasons,
    pageOverrideCount: routerResult.summary.pageOverrideCount,
    finalCounts: routerResult.summary.finalCounts,
  })

  // Page images + OCR (for chunks / hints; pre-AI selection runs after hints below)
  let pageImageSummary = {
    enabled: true,
    attemptedPages: 0,
    appliedPages: 0,
    maxPages: 0,
    renderScale: 0,
    failed: false,
    error: null as string | null,
  }

  try {
    const pageImageResult = await populatePageImagesForPreparedPages(buf, preparedPages)
    preparedPages = pageImageResult.pages
    pageImageSummary = {
      ...pageImageSummary,
      attemptedPages: pageImageResult.summary.attemptedPages,
      appliedPages: pageImageResult.summary.appliedPages,
      maxPages: pageImageResult.summary.maxPages,
      renderScale: pageImageResult.summary.renderScale,
    }

    console.log("ANALYZE: page image generation complete", pageImageSummary)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Page image generation failed."

    console.error("Page image generation error:", error)
    pageImageSummary = {
      ...pageImageSummary,
      failed: true,
      error: message,
    }
  }

  console.log("ANALYZE:positionalEvidenceSummary", {
    ...summarizePositionalEvidencePages(preparedPages),
    stage: "after_page_images_before_ocr",
  })

  let ocrSummary = {
    enabled: true,
    attemptedPages: 0,
    appliedPages: 0,
    maxPages: 0,
    renderScale: 0,
    failed: false,
    error: null as string | null,
  }

  try {
    const ocrResult = await populateOcrTextForPreparedPages(buf, preparedPages)
    preparedPages = ocrResult.pages
    ocrSummary = {
      ...ocrSummary,
      attemptedPages: ocrResult.summary.attemptedPages,
      appliedPages: ocrResult.summary.appliedPages,
      maxPages: ocrResult.summary.maxPages,
      renderScale: ocrResult.summary.renderScale,
    }

    console.log("ANALYZE: OCR enrichment complete", ocrSummary)
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR enrichment failed."

    console.error("OCR population error:", error)
    ocrSummary = {
      ...ocrSummary,
      failed: true,
      error: message,
    }
  }

  console.log("ANALYZE:positionalEvidenceSummary", {
    ...summarizePositionalEvidencePages(preparedPages),
    stage: "after_ocr_final",
  })

  // Front structure scan after OCR so cover / sheet-index text is available for extraction.
  const frontStructureScan = await runFrontStructureScan({
    preparedPages,
    pdfBuffer: buf,
    fileDefaultType: routerResult.summary.fileDefaultType,
  })
  console.log("frontStructureScan:summary", summarizeFrontStructureScan(frontStructureScan))

  const frontAuthorityCredible = isFrontStructureAuthorityCredible(frontStructureScan)
  console.log("visibleIntake:frontAuthority", {
    credible: frontAuthorityCredible,
    structureFound: frontStructureScan.structureFound,
    confidence: frontStructureScan.confidence,
  })
  console.log(
    "visibleIntake:frontStructureDebug",
    buildVisibleIntakeFrontStructureDebug({
      preparedPages,
      result: frontStructureScan,
      finalAuthorityCredible: frontAuthorityCredible,
    }),
  )

  // Drawing registry + text-based title-block hints (needed before pre-AI selection / runAiIntake)
  const { registry: drawingSetRegistry, buildLog: drawingRegistryBuildLog } =
    buildDrawingSetRegistryFromPreparedPagesWithLog(preparedPages)
  const page1RegistryDebug = buildPage1RegistryDebug(preparedPages)
  if (page1RegistryDebug) {
    console.log("visibleIntake:page1RegistryDebug", page1RegistryDebug)
  }
  console.log("visibleIntake:drawingRegistryBuild", drawingRegistryBuildLog)
  preparedPages = attachDrawingIdentityHintsToPreparedPages(preparedPages, drawingSetRegistry)

  if (canRunAiIntake()) {
    await runForcedSingleIndexPageExtraction({
      uploadId,
      filename,
      preparedPages,
    })
  }

  const indexDetection = detectIndexCandidates(preparedPages, 8)
  const indexBlockPick = selectBestIndexBlock(indexDetection.groupedBlocks, indexDetection.pageScores)
  console.log("visibleIntake:indexDetectionSummary", {
    candidatePages: indexDetection.candidatePages,
    selectedBlock: indexBlockPick.selectedPages,
    confidence: indexBlockPick.confidence,
  })

  const fileRouteForIndex = routerResult.summary.fileDefaultType
  const drawingishForIndexVisual =
    fileRouteForIndex === "DRAWING" ||
    fileRouteForIndex === "MIXED" ||
    fileRouteForIndex === "UNKNOWN"
  const indexFirstVisualAllow =
    drawingishForIndexVisual &&
    !frontAuthorityCredible &&
    indexBlockPick.selectedPages.length > 0 &&
    indexBlockPick.confidence >= 0.11

  // Optional visual drawing identity: off by default when front index/TOC is credible (visible speed)
  if (shouldRunVisualDrawingIdentityEnrichmentForVisibleIntake(frontStructureScan)) {
    preparedPages = await enrichPreparedPagesWithVisualDrawingIdentity(
      preparedPages,
      drawingSetRegistry,
      indexFirstVisualAllow ? { onlyPageNumbers: new Set(indexBlockPick.selectedPages) } : undefined,
    )
    console.log("ANALYZE: visual drawing identity enrichment complete")
  } else {
    console.log("ANALYZE: skipped visual drawing identity (visible intake; credible front structure)", {
      optInEnv: ENV_VISIBLE_INTAKE_VISUAL_DRAWING_IDENTITY,
    })
  }

  const intakeDelayReason = buildIntakeDelayReason({
    fileDefaultType: routerResult.summary.fileDefaultType,
    pageCount,
    likelySearchable: checks.likelySearchable,
    likelyRasterHeavy: checks.likelyRasterHeavy,
    ocrAppliedPages: ocrSummary.appliedPages,
  })

  try {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { intakeStage: "RUNNING_AI", intakeDelayReason },
    })
  } catch (error) {
    console.error("ANALYZE: failed to update intake stage / delay reason", { uploadId, error })
  }

  let aiIntake: Awaited<ReturnType<typeof runAiIntake>>

  // (f)(g) Pre-AI deterministic registry/page matching → only unresolved pages for heavy AI
  if (canRunAiIntake()) {
    const selection = runPreAiPageSelection({
      preparedPages,
      frontStructureScan,
    })

    const nonBlankPageCount = preparedPages.filter((p) => !shouldSkipHeavyAiForFastBlank(p)).length
    const weakUsable = frontStructureScan.structureFound === "WEAK_DRAWING_INDEX"
    console.log("visibleIntake:structureModeSummary", {
      structureMode: deriveIntakeStructureMode(frontStructureScan, frontAuthorityCredible),
      finalStructureFound: frontStructureScan.structureFound,
      finalDrawingEntryCount: frontStructureScan.drawingEntries?.length ?? 0,
      finalConfidence: frontStructureScan.confidence,
      strongAuthorityCredible:
        frontAuthorityCredible && frontStructureScan.structureFound === "DRAWING_INDEX",
      weakIndexUsable: weakUsable,
      aiCandidatePagesBeforeWeakAssist: weakUsable
        ? nonBlankPageCount
        : selection.aiCandidatePages.length,
      aiCandidatePagesAfterWeakAssist: selection.aiCandidatePages.length,
      orderedModeActive: selection.orderedModeActive,
    })
    console.log(
      "visibleIntake:weakIndexAssistSummary",
      selection.weakIndexAssistSummary ?? {
        partialRegistryEntries: 0,
        pagesHelpedByWeakIndex: 0,
        pagesStillEscalatedToAI: 0,
        pagesSkippedFromHeavyFallback: 0,
        weakIndexReasonSummary: {},
      },
    )

    console.log(
      "visibleIntake:selectionSummary",
      buildVisibleIntakeSelectionSummary({
        totalPages: preparedPages.length,
        stats: selection.stats,
        aiCandidatePages: selection.aiCandidatePages.length,
        frontStructureScan,
        frontAuthorityCredible: selection.frontAuthorityCredible,
      }),
    )

    let visibleIntakeAiMergeProcessed = 0
    let visibleIntakeAiMergeSkipped = preparedPages.length

    if (selection.aiCandidatePages.length === 0) {
      visibleIntakeAiMergeProcessed = 0
      visibleIntakeAiMergeSkipped = preparedPages.length
      const mergedPages = buildAllDeterministicNormalizedPages({
        preparedPages,
        selection,
      })
      const finalized = finalizeIntakeRunResultPages(mergedPages, preparedPages)
      aiIntake = {
        ...finalized,
        ai: {
          enabled: true,
          used: false,
          model: AI_INTAKE_MODEL,
          reviewedPages: 0,
          skippedReason: "Heavy AI skipped for all pages (deterministic fast path).",
          fastPath: { used: false },
        },
      }
    } else {
      visibleIntakeAiMergeProcessed = selection.aiCandidatePages.length
      visibleIntakeAiMergeSkipped = preparedPages.length - selection.aiCandidatePages.length

      const fileRoute = routerResult.summary.fileDefaultType
      const drawingish =
        fileRoute === "DRAWING" || fileRoute === "MIXED" || fileRoute === "UNKNOWN"
      const INDEX_FIRST_MIN_CONF = 0.11

      const wantIndexFirst =
        drawingish &&
        !selection.frontAuthorityCredible &&
        selection.aiCandidatePages.length > 0 &&
        indexBlockPick.selectedPages.length > 0 &&
        indexBlockPick.confidence >= INDEX_FIRST_MIN_CONF

      if (wantIndexFirst) {
        const indexPrepared = preparedPages.filter((p) =>
          indexBlockPick.selectedPages.includes(p.pageNumber),
        )
        const extraction = await runDrawingIndexSheetListExtraction({
          uploadId,
          filename,
          pages: indexPrepared,
        })
        const sourcePage = indexBlockPick.selectedPages[0]!
        const canonicalRegistry = buildCanonicalSheetRegistryFromRows(extraction.rows, sourcePage)
        const weakIndexMode = extraction.rows.length > 0 && extraction.rows.length < 8

        console.log("visibleIntake:indexExtractionSummary", {
          extractedRows: extraction.rows.length,
          success: extraction.success,
          registrySize: canonicalRegistry.byLiteral.size,
          weakIndexMode,
        })

        if (canonicalRegistry.byLiteral.size < 1) {
          const partial = await runAiIntake({
            uploadId,
            filename,
            pages: selection.aiCandidatePages,
            pdfBuffer: buf,
            drawingSetRegistry,
            documentPageCount: preparedPages.length,
          })
          const mergedPages = mergeVisibleIntakeWithStubs({
            aiPartialPages: partial.pages,
            preparedPages,
            blankSkips: selection.skippedBlankPageNumbers,
            registrySkips: selection.skippedRegistrySkips,
          })
          const finalized = finalizeIntakeRunResultPages(mergedPages, preparedPages)
          visibleIntakeAiMergeProcessed = selection.aiCandidatePages.length
          visibleIntakeAiMergeSkipped = preparedPages.length - selection.aiCandidatePages.length
          aiIntake = {
            ...finalized,
            ai: {
              ...partial.ai,
              reviewedPages: selection.aiCandidatePages.length,
            },
          }
        } else {
          const blankSet = new Set(selection.skippedBlankPageNumbers)
          const indexSet = new Set(indexBlockPick.selectedPages)
          const verify = verifyDrawingPagesAgainstCanonicalRegistry({
            preparedPages,
            indexPageNumbers: indexSet,
            registry: canonicalRegistry,
            blankSkipPageNumbers: blankSet,
          })

          console.log("visibleIntake:pageVerificationSummary", {
            totalPages: preparedPages.length,
            matchedViaRegistry: verify.matchedViaRegistry,
            escalatedToAI: verify.escalatedToAi,
            unmatchedPages: verify.unmatchedPages,
          })

          const preparedByPage = new Map(preparedPages.map((p) => [p.pageNumber, p]))
          const extraNormalized = new Map<number, IntakeNormalizedPage>()
          for (const pn of indexBlockPick.selectedPages) {
            const prep = preparedByPage.get(pn)
            if (prep) extraNormalized.set(pn, buildIndexExtractionPageStub(prep))
          }
          for (const [pn, stub] of verify.generalStubPages) {
            extraNormalized.set(pn, stub)
          }

          const escalatedPreps = verify.escalatedPageNumbers
            .map((pn) => preparedByPage.get(pn))
            .filter((x): x is NonNullable<typeof x> => Boolean(x))

          let aiEscalatedPages: IntakeNormalizedPage[] = []
          if (escalatedPreps.length > 0) {
            const escResult = await runAiIntake({
              uploadId,
              filename,
              pages: escalatedPreps,
              pdfBuffer: buf,
              drawingSetRegistry,
              documentPageCount: preparedPages.length,
              llmPageAllowlist: escalatedPreps.map((p) => p.pageNumber),
            })
            aiEscalatedPages = escResult.pages
          }

          const mergedPages = mergeVisibleIntakeWithStubs({
            aiPartialPages: aiEscalatedPages,
            preparedPages,
            blankSkips: selection.skippedBlankPageNumbers,
            registrySkips: verify.matchedSkips,
            extraNormalizedByPage: extraNormalized,
          })
          const finalized = finalizeIntakeRunResultPages(mergedPages, preparedPages)
          const idxAiPages = indexPrepared.length + escalatedPreps.length
          visibleIntakeAiMergeProcessed = idxAiPages
          visibleIntakeAiMergeSkipped = Math.max(0, preparedPages.length - idxAiPages)

          aiIntake = {
            ...finalized,
            ai: {
              enabled: true,
              used: extraction.success || escalatedPreps.length > 0,
              model: AI_INTAKE_MODEL,
              reviewedPages: idxAiPages,
              skippedReason:
                escalatedPreps.length === 0
                  ? "Index-first: targeted index extraction only (no full per-page AI)."
                  : null,
              fastPath: { used: false },
            },
          }
        }
      } else {
        const partial = await runAiIntake({
          uploadId,
          filename,
          pages: selection.aiCandidatePages,
          pdfBuffer: buf,
          drawingSetRegistry,
          documentPageCount: preparedPages.length,
        })
        const mergedPages = mergeVisibleIntakeWithStubs({
          aiPartialPages: partial.pages,
          preparedPages,
          blankSkips: selection.skippedBlankPageNumbers,
          registrySkips: selection.skippedRegistrySkips,
        })
        const finalized = finalizeIntakeRunResultPages(mergedPages, preparedPages)
        visibleIntakeAiMergeProcessed = selection.aiCandidatePages.length
        visibleIntakeAiMergeSkipped = preparedPages.length - selection.aiCandidatePages.length
        aiIntake = {
          ...finalized,
          ai: {
            ...partial.ai,
            reviewedPages: selection.aiCandidatePages.length,
          },
        }
      }
    }

    console.log(
      "visibleIntakeAiMerge:summary",
      summarizeVisibleIntakeAiMerge({
        aiProcessedPages: visibleIntakeAiMergeProcessed,
        aiSkippedPages: visibleIntakeAiMergeSkipped,
        finalPageCount: preparedPages.length,
      }),
    )
  } else {
    // LLM unavailable: full-document fallback (unchanged)
    aiIntake = await runAiIntake({
      uploadId,
      filename,
      pages: preparedPages,
      pdfBuffer: buf,
      drawingSetRegistry,
    })
    console.log(
      "visibleIntakeAiMerge:summary",
      summarizeVisibleIntakeAiMerge({
        aiProcessedPages: preparedPages.length,
        aiSkippedPages: 0,
        finalPageCount: preparedPages.length,
      }),
    )
  }

  // (i) Final registry-led labeling / validation overlay (partial AI + stubs OK)
  const registryOutcome = applyRegistryLedValidationAndLabels({
    intake: aiIntake,
    preparedPages,
    frontStructureScan,
  })
  aiIntake = registryOutcome.intake
  const registryValidation = registryOutcome.validation

  if (registryValidation.authorityActive && registryValidation.authorityKind === "SPEC_TOC") {
    aiIntake = {
      ...aiIntake,
      specSections: groupSpecSections(aiIntake.pages),
    }
  }

  const reviewNeededAfterRegistry = aiIntake.pages.filter((p) => p.review.status === "REVIEW_REQUIRED")
    .length
  aiIntake = {
    ...aiIntake,
    summary: {
      ...aiIntake.summary,
      counts: {
        ...aiIntake.summary.counts,
        reviewNeededPages: reviewNeededAfterRegistry,
      },
    },
  }

  console.log("registryValidation:summary", summarizeRegistryValidation(registryValidation))

  console.log("ANALYZE: AI intake complete", {
    aiEnabled: aiIntake.ai.enabled,
    aiUsed: aiIntake.ai.used,
    reviewedPages: aiIntake.ai.reviewedPages,
    skippedReason: aiIntake.ai.skippedReason,
  })

  await setIntakeStage(uploadId, "ASSEMBLING_REPORT")
  const contentCounts = buildLegacyContentCounts(aiIntake)
  const drawingSummary = buildLegacyDrawingSummary(aiIntake)
  const specSummary = buildLegacySpecSummary(aiIntake)
  const registryDisplayOpts = {
    registryValidation,
    frontStructureScan,
  }
  const aiReviewSummary = buildAiReviewSummary(aiIntake, preparedPages, registryDisplayOpts)
  const sheetDetectionPreview = buildSheetDetectionPreview(aiIntake, preparedPages, registryDisplayOpts)

  const report = {
    uploadId,
    bytesAnalyzed: buf.length,
    contentType: head?.ContentType ?? null,
    contentLength: head?.ContentLength ?? null,
    ...checks,
    pageCount,

    pdfSafety: {
      validPdfHeader: checks.isPdf,
      structuralXrefDetected: checks.hasXref,
      readablePageTextExtracted: pdfPages.length > 0,
      likelyCorrupted: !checks.isPdf || !checks.hasXref,
      safeForReview: checks.isPdf && pageCount > 0,
    },

    printSizePrimary: sizes.printSizePrimary,
    printSizeCounts: sizes.printSizeCounts,
    printSizeDiagnostics: sizes.printSizeCounts
      ? {
          totalBoxMatches: Object.values(sizes.printSizeCounts).reduce((a, b) => a + b, 0),
          pdfPageCount: pageCount,
          explanation:
            "Each count is how many PDF CropBox/MediaBox rectangles matched that size label (not always one per page).",
        }
      : null,
    printSizeNote: sizes.printSizeNote,
    printSizeBoxUsed: sizes.used,
    printSizeBoxSamples: sizes.boxSamples,

    intakeMode: "AI_FIRST",
    aiReadiness: {
      readyForAiPagePass: preparedPages.length > 0,
      preparedPages: preparedPages.length,
      skippedReason: preparedPages.length > 0 ? null : "No prepared pages were available.",
    },

    routerSummary: routerResult.summary,
    frontStructureScan,
    registryValidation,
    pageImageSummary,
    ocrSummary,

    mixedContent: aiIntake.summary.mixedContent,
    contentCounts,
    drawingSummary,
    specSummary,

    specSections: aiIntake.specSections,
    specSectionSummary: {
      totalSections: aiIntake.specSections.length,
      sectionsWithNumber: aiIntake.specSections.filter((section) => section.sectionNumber).length,
      sectionsWithTitle: aiIntake.specSections.filter((section) => section.sectionTitle).length,
      preview: aiIntake.specSections.slice(0, 25).map((section) => ({
        sectionNumber: section.sectionNumber,
        sectionTitle: section.sectionTitle,
        startPage: section.startPage,
        endPage: section.endPage,
        pageCount: section.pages.length,
      })),
    },

    preparedPagePreview: buildPreparedPagePreview(preparedPages),
    aiSummary: {
      enabled: aiIntake.ai.enabled,
      used: aiIntake.ai.used,
      model: aiIntake.ai.model,
      reviewedPages: aiIntake.ai.reviewedPages,
      skippedReason: aiIntake.ai.skippedReason,
    },
    layer2Summary: aiReviewSummary,
    sheetDetectionPreview,

    reportSummaryConsistency: (() => {
      let confidencePagesWithValue = 0
      let confidencePagesMissingValue = 0
      for (const r of sheetDetectionPreview) {
        const o = r.confidence && typeof r.confidence === "object" ? r.confidence.overall : undefined
        if (typeof o === "number" && Number.isFinite(o)) confidencePagesWithValue += 1
        else confidencePagesMissingValue += 1
      }
      return {
        reviewNeededCardCount: contentCounts.reviewNeededPages,
        reviewTableCount: aiReviewSummary.lowConfidencePages.length,
        sizeBreakdownEntries: sizes.printSizeCounts
          ? Object.entries(sizes.printSizeCounts).map(([label, pdfBoxMatches]) => ({ label, pdfBoxMatches }))
          : [],
        confidencePagesWithValue,
        confidencePagesMissingValue,
      }
    })(),

    llmAssist: {
      enabled: aiIntake.ai.enabled,
      used: aiIntake.ai.used,
      model: aiIntake.ai.model,
      candidatePages: preparedPages.length,
      refinedPages: aiIntake.ai.reviewedPages,
      skippedReason: aiIntake.ai.skippedReason,
      reportExplanation: aiIntake.ai.used
        ? "AI page understanding completed and populated page intelligence."
        : "AI page understanding did not run; review the skipped reason.",
    },

    notes: [
      checks.isPdf ? null : "File does not look like a valid PDF header.",
      pageCount <= 0 ? "Could not determine page count." : null,
      sizes.printSizeCounts == null ? "Could not detect print size from page boxes." : null,
      pdfPages.length === 0
        ? "Could not extract per-page text, so AI intake had limited or no usable page input."
        : null,
      pageImageSummary.appliedPages > 0
        ? `Page images generated for ${pageImageSummary.appliedPages} page(s) out of ${pageImageSummary.attemptedPages} attempted page(s).`
        : null,
      pageImageSummary.failed && pageImageSummary.error
        ? `Page image error: ${pageImageSummary.error}`
        : null,
      ocrSummary.appliedPages > 0
        ? `OCR populated ${ocrSummary.appliedPages} page(s) out of ${ocrSummary.attemptedPages} attempted page(s).`
        : null,
      ocrSummary.failed && ocrSummary.error ? `OCR error: ${ocrSummary.error}` : null,
      aiIntake.ai.used ? `AI reviewed ${aiIntake.ai.reviewedPages} page(s).` : null,
      aiIntake.ai.skippedReason ? `AI intake skipped reason: ${aiIntake.ai.skippedReason}` : null,
      contentCounts.reviewNeededPages > 0
        ? `${contentCounts.reviewNeededPages} page(s) require human review.`
        : null,
      aiIntake.specSections.length > 0
        ? `${aiIntake.specSections.length} spec section group(s) were detected.`
        : null,
    ].filter(Boolean),
  }

  console.log("visibleIntake:reportSummaryConsistency", report.reportSummaryConsistency)

  console.log("ANALYZE: starting upload update")
  const updated = await prisma.upload.update({
    where: { id: uploadId },
    data: {
      pageCount: pageCount > 0 ? pageCount : undefined,
      isSearchable: checks.likelySearchable,
      isRasterOnly: checks.likelyRasterHeavy,
      intakeReport: report as never,
      intakeStatus: "READY",
      intakeStage: "COMPLETE",
      intakeDelayReason: null,
      intakeError: null,
    },
  })
  console.log("ANALYZE: upload update done")

  if (pageCount > 0) {
    console.log("ANALYZE: starting sheet rewrite")

    await prisma.sheet.deleteMany({ where: { uploadId } })

    const sourceSheets =
      aiIntake.pages.length > 0
        ? buildSqlSheetRows(aiIntake, preparedPages, registryDisplayOpts)
        : Array.from({ length: pageCount }, (_, i) => ({
            pageNumber: i + 1,
            sheetNumber: null,
            sheetName: null,
            discipline: null,
            pageClass: "UNKNOWN",
            sectionNumber: null,
            sectionTitle: null,
            isElectricalRelated: null,
            sheetType: "UNKNOWN",
            scaleStatus: "NO_SCALE_NEEDED",
            scaleConfidence: 35,
            notes: "AI intake returned no page results.",
          }))

    const valuesSql = sourceSheets
      .map((sheet) => {
        const sheetNumberSql =
          sheet.sheetNumber == null ? "NULL" : `'${escapeSqlString(sheet.sheetNumber)}'`
        const sheetNameSql =
          sheet.sheetName == null ? "NULL" : `'${escapeSqlString(sheet.sheetName)}'`
        const disciplineSql =
          sheet.discipline == null ? "NULL" : `'${escapeSqlString(sheet.discipline)}'`
        const pageClassSql =
          sheet.pageClass == null ? "NULL" : `'${escapeSqlString(sheet.pageClass)}'`
        const sectionNumberSql =
          sheet.sectionNumber == null ? "NULL" : `'${escapeSqlString(sheet.sectionNumber)}'`
        const sectionTitleSql =
          sheet.sectionTitle == null ? "NULL" : `'${escapeSqlString(sheet.sectionTitle)}'`
        const isElectricalRelatedSql =
          sheet.isElectricalRelated == null
            ? "NULL"
            : sheet.isElectricalRelated
              ? "true"
              : "false"
        const notesSql = sheet.notes == null ? "NULL" : `'${escapeSqlString(sheet.notes)}'`

        return `(
          gen_random_uuid(),
          '${uploadId}',
          ${sheet.pageNumber},
          ${sheetNumberSql},
          ${sheetNameSql},
          ${disciplineSql},
          ${pageClassSql},
          ${sectionNumberSql},
          ${sectionTitleSql},
          ${isElectricalRelatedSql},
          '${sheet.sheetType}'::"SheetType",
          '${sheet.scaleStatus}'::"ScaleStatus",
          ${sheet.scaleConfidence},
          ${notesSql},
          now(),
          now()
        )`
      })
      .join(",\n")

    await prisma.$executeRawUnsafe(`
      INSERT INTO "Sheet"
        (
          "id",
          "uploadId",
          "pageNumber",
          "sheetNumber",
          "sheetName",
          "discipline",
          "pageClass",
          "sectionNumber",
          "sectionTitle",
          "isElectricalRelated",
          "sheetType",
          "scaleStatus",
          "scaleConfidence",
          "notes",
          "createdAt",
          "updatedAt"
        )
      VALUES
      ${valuesSql};
    `)

    console.log("ANALYZE: sheet rewrite done")
  }

  console.log("ANALYZE: complete", {
    uploadId,
    pageCount,
    preparedPages: preparedPages.length,
    aiUsed: aiIntake.ai.used,
    pageImagesApplied: pageImageSummary.appliedPages,
    ocrAppliedPages: ocrSummary.appliedPages,
    routerFileDefault: routerResult.summary.fileDefaultType,
    routerOverrides: routerResult.summary.pageOverrideCount,
  })

  return {
    upload: updated,
    report,
    pageCount,
    counts: contentCounts,
    llmAssist: report.llmAssist as Record<string, unknown>,
    frontStructureScan,
    registryValidation,
  }
}