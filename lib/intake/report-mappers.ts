import { registryLogicalKeyForSheetId } from "./drawing-set-registry"
import { stripRedundantSheetPrefix } from "./shared-string-utils"
import type { FrontStructureScanResult } from "./front-structure-scan"
import {
  buildDrawingIndexMap,
  DRAWING_IDENTITY_REASON_CONFLICTS_INDEX,
  DRAWING_IDENTITY_REASON_PRIMARY_OWNER,
  DRAWING_IDENTITY_REASON_REPEATED_SHEET,
  DRAWING_IDENTITY_REASON_REVIEW,
  DRAWING_IDENTITY_REASON_SECONDARY,
  DRAWING_IDENTITY_REASON_WEAK_HINT,
  finalRegistryTitleFromEntry,
  orderedDrawingEntryIndexForPage,
  type RegistryValidationResult,
} from "./registry-validation"
import type { IntakePreparedPage, IntakeRunResult } from "./types"

export type ReportRegistryDisplayContext = {
  intake: IntakeRunResult
  registryValidation?: RegistryValidationResult
  frontStructureScan?: FrontStructureScanResult
}

function pairFromDrawingEntryAtIndex(
  entries: { sheetNumber: string; title: string }[],
  idx: number | null,
  displaySource: string,
): { sheetNumber: string; sheetTitle: string; displaySource: string } | null {
  if (idx == null || idx < 0 || idx >= entries.length) return null
  const e = entries[idx]
  const sn = e.sheetNumber.trim()
  return {
    sheetNumber: sn,
    sheetTitle: finalRegistryTitleFromEntry(e.sheetNumber, e.title),
    displaySource,
  }
}

/** Canonical drawing index row for estimator display when registry authority is trusted. */
export function resolveTrustedRegistryDrawingDisplay(
  page: IntakeRunResult["pages"][number],
  ctx: ReportRegistryDisplayContext,
): { sheetNumber: string; sheetTitle: string; displaySource: string } | null {
  const { registryValidation, frontStructureScan, intake } = ctx
  if (!registryValidation?.authorityActive || registryValidation.authorityKind !== "DRAWING_INDEX") {
    return null
  }
  if (!frontStructureScan || frontStructureScan.structureFound !== "DRAWING_INDEX") return null

  if (page.final.pageClass !== "DRAWING") return null

  const entries = frontStructureScan.drawingEntries ?? []
  if (entries.length === 0) return null

  const drawingMap = buildDrawingIndexMap(frontStructureScan)
  const totalPages = intake.pages.length
  const per = registryValidation.perPage.find((p) => p.pageNumber === page.pageNumber)

  const fromRegistryKey = (registryKey: string | null, source: string) => {
    if (!registryKey) return null
    const entry = drawingMap.get(registryKey)
    if (!entry) return null
    return {
      sheetNumber: entry.sheetNumber.trim(),
      sheetTitle: finalRegistryTitleFromEntry(entry.sheetNumber, entry.title),
      displaySource: source,
    }
  }

  const ord = orderedDrawingEntryIndexForPage({
    pageNumber: page.pageNumber,
    totalPages,
    entryCount: entries.length,
  })
  if (ord !== null) {
    const byOrder = pairFromDrawingEntryAtIndex(entries, ord, "REGISTRY_CANONICAL_BY_PAGE_ORDER")
    if (byOrder) return byOrder
  }

  if (per?.status === "MATCHED_TO_REGISTRY") {
    const byIdx = pairFromDrawingEntryAtIndex(entries, per.matchedEntryIndex, "REGISTRY_CANONICAL_ASSIGNED")
    if (byIdx) return byIdx
    return fromRegistryKey(per.registryKey, "REGISTRY_CANONICAL_ASSIGNED")
  }
  if (per?.status === "DUPLICATE_REGISTRY_MATCH") {
    const byIdx = pairFromDrawingEntryAtIndex(entries, per.matchedEntryIndex, "REGISTRY_CANONICAL_DUPLICATE_ROW")
    if (byIdx) return byIdx
    return fromRegistryKey(per.registryKey, "REGISTRY_CANONICAL_DUPLICATE_ROW")
  }

  return null
}

function normDisplay(s: string | null | undefined): string {
  return s?.replace(/\s+/g, " ").trim() ?? ""
}

function sameLogicalSheetNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const la = registryLogicalKeyForSheetId(a ?? "")
  const lb = registryLogicalKeyForSheetId(b ?? "")
  return !!(la && lb && la === lb)
}

export function buildEstimatorReviewFlags(reasons: string[]): string[] {
  const s = new Set(reasons)
  const out: string[] = []

  if (s.has(DRAWING_IDENTITY_REASON_SECONDARY) || s.has(DRAWING_IDENTITY_REASON_REPEATED_SHEET)) {
    out.push("Duplicate sheet number — verify")
  }
  if (s.has(DRAWING_IDENTITY_REASON_CONFLICTS_INDEX) || s.has(DRAWING_IDENTITY_REASON_WEAK_HINT)) {
    out.push("Conflicts with drawing index — verify")
  }

  for (const r of reasons) {
    if (r.startsWith("ORDERED_REGISTRY_ASSIGNMENT")) continue
    if (r.startsWith("VISIBLE_INTAKE_RESOLUTION:DETERMINISTIC")) continue
    if (r === DRAWING_IDENTITY_REASON_PRIMARY_OWNER) continue
    if (r.startsWith("DRAWING_IDENTITY_")) continue
    if (r === DRAWING_IDENTITY_REASON_REVIEW && out.length > 0) continue
    if (r.includes("Duplicate drawing registry match")) {
      if (!out.some((x) => x.includes("Duplicate"))) out.push("Duplicate registry match — verify")
      continue
    }
    if (out.length >= 4) break
    if (r.length > 140) continue
    if (r.startsWith("Registry authority:")) continue
    out.push(r)
  }

  return [...new Set(out)].slice(0, 4)
}

export function buildPreparedPagePreview(preparedPages: IntakePreparedPage[]) {
  return preparedPages.slice(0, 25).map((page) => ({
    pageNumber: page.pageNumber,
    pdfFacts: page.pdfFacts,
    extraction: {
      textLength: page.rawText.fullText.length,
      tokenCount: page.rawText.tokens.length,
      lineCount: page.rawText.lines.length,
      extractionWarnings: page.extractionWarnings,
      ocrTextLength: page.ocrText.normalizedText?.length ?? 0,
      hasOcrText: Boolean(page.ocrText.normalizedText),
    },
  }))
}

function normalizeText(value: string | null | undefined) {
  if (!value) return ""
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

function isContractingRequirementsPage(page: IntakeRunResult["pages"][number]) {
  const subtype = normalizeText(page.final.pageSubtype)
  const title = normalizeText(page.final.sheetTitle)
  const sectionTitle = normalizeText(page.final.sectionTitle)
  const anchorTitle = normalizeText(page.anchor?.displayTitle)
  const combined = [subtype, title, sectionTitle, anchorTitle].filter(Boolean).join(" ")

  const contractingKeywords = [
    "application for payment",
    "stored materials",
    "schedule of values",
    "certificate of substantial completion",
    "notice of acceptability of work",
    "performance bond",
    "payment bond",
    "agreement between owner and contractor",
    "notice of award",
    "notice to proceed",
    "general conditions",
    "supplementary conditions",
    "contracting requirements",
    "closeout",
    "warranty",
    "change order",
    "contract modification",
    "progress estimate",
  ]

  return contractingKeywords.some((keyword) => combined.includes(keyword))
}

function mapAiPageToDisplayBucket(page: IntakeRunResult["pages"][number]) {
  if (page.final.pageClass === "DRAWING") return "DRAWING"
  if (page.final.pageClass === "BLANK_PAGE") return "BLANK"
  if (page.final.pageClass === "SPECIFICATION") return "SPECIFICATIONS"

  if (page.final.pageClass === "BID_DOCUMENT") {
    return isContractingRequirementsPage(page)
      ? "CONTRACTING_REQUIREMENTS"
      : "BIDDING_FRONT_END_REQUIREMENTS"
  }

  if (page.final.pageClass === "GENERAL_DOCUMENT") {
    if (isContractingRequirementsPage(page)) {
      return "CONTRACTING_REQUIREMENTS"
    }

    const title = normalizeText(page.final.sheetTitle)
    const sectionTitle = normalizeText(page.final.sectionTitle)
    const anchorTitle = normalizeText(page.anchor?.displayTitle)
    const combined = [title, sectionTitle, anchorTitle].filter(Boolean).join(" ")

    if (
      combined.includes("procurement requirements") ||
      combined.includes("instructions to bidders") ||
      combined.includes("bid form") ||
      combined.includes("bid bond") ||
      combined.includes("advertisement for bids")
    ) {
      return "BIDDING_FRONT_END_REQUIREMENTS"
    }

    if (
      combined.includes("general conditions") ||
      combined.includes("supplementary conditions") ||
      combined.includes("contracting requirements")
    ) {
      return "CONTRACTING_REQUIREMENTS"
    }

    return "GENERAL"
  }

  return "UNKNOWN"
}

type DrawingIdentityConflictKind = "duplicate" | "index_conflict"

function getDrawingIdentityConflictKind(
  page: IntakeRunResult["pages"][number],
): DrawingIdentityConflictKind | null {
  if (page.final.pageClass !== "DRAWING") return null
  const r = page.review.reasons
  if (
    r.includes(DRAWING_IDENTITY_REASON_PRIMARY_OWNER) &&
    !r.includes(DRAWING_IDENTITY_REASON_SECONDARY) &&
    !r.includes(DRAWING_IDENTITY_REASON_REPEATED_SHEET) &&
    !r.includes(DRAWING_IDENTITY_REASON_CONFLICTS_INDEX) &&
    !r.includes(DRAWING_IDENTITY_REASON_WEAK_HINT)
  ) {
    return null
  }
  if (r.includes(DRAWING_IDENTITY_REASON_SECONDARY) || r.includes(DRAWING_IDENTITY_REASON_REPEATED_SHEET)) {
    return "duplicate"
  }
  if (
    r.includes(DRAWING_IDENTITY_REASON_CONFLICTS_INDEX) ||
    r.includes(DRAWING_IDENTITY_REASON_WEAK_HINT)
  ) {
    return "index_conflict"
  }
  return null
}

function conflictTypeLabel(kind: DrawingIdentityConflictKind): string {
  return kind === "duplicate" ? "DUPLICATE_IDENTITY" : "INDEX_CONFLICT"
}

function isShortCleanTitleForDisplay(title: string | null | undefined): boolean {
  const t = title?.replace(/\s+/g, " ").trim() ?? ""
  if (!t || t.length > 72) return false
  if (/\bFOR ADDITIONAL INFORMATION\b/i.test(t)) return false
  if (t.length > 48 && t.split(/\s+/).length > 12) return false
  return true
}

/** Title fragment only (sheet number is shown in the separate column). */
function buildDrawingConflictDisplayTitleOnly(
  page: IntakeRunResult["pages"][number],
  prepared: IntakePreparedPage | undefined,
  kind: DrawingIdentityConflictKind,
): string {
  const hintTitle = prepared?.drawingIdentityHints?.sheetTitleCandidate
  if (isShortCleanTitleForDisplay(hintTitle)) {
    return hintTitle!.replace(/\s+/g, " ").trim()
  }
  return kind === "duplicate" ? "Duplicate sheet number" : "Conflicts with index"
}

function buildDrawingConflictDisplayName(
  page: IntakeRunResult["pages"][number],
  prepared: IntakePreparedPage | undefined,
  kind: DrawingIdentityConflictKind,
): string {
  const sn = page.final.sheetNumber?.trim() || null
  const core = buildDrawingConflictDisplayTitleOnly(page, prepared, kind)
  return sn ? `${sn} — ${core}` : core
}

/** Base display title without drawing identity conflict overrides (sheet list / SQL). */
export function getBasePreferredDisplayTitle(page: IntakeRunResult["pages"][number]): string | null {
  if (page.final.pageClass === "BLANK_PAGE") {
    return "Blank Page"
  }

  if (page.final.sheetTitle) {
    return page.final.sheetTitle
  }

  if (page.anchor?.displayTitle) {
    return page.anchor.displayTitle
  }

  if (page.final.sectionNumber && page.final.sectionTitle) {
    return `${page.final.sectionNumber} — ${page.final.sectionTitle}`
  }

  if (page.final.sectionTitle) {
    return page.final.sectionTitle
  }

  if (page.final.sheetNumber) {
    return page.final.sheetNumber
  }

  return null
}

export function getPreferredDisplayTitle(
  page: IntakeRunResult["pages"][number],
  prepared?: IntakePreparedPage | undefined,
): string | null {
  const kind = getDrawingIdentityConflictKind(page)
  if (kind) {
    return buildDrawingConflictDisplayName(page, prepared, kind)
  }
  return getBasePreferredDisplayTitle(page)
}

export function resolveEstimatorSheetRowDisplay(
  page: IntakeRunResult["pages"][number],
  prepared: IntakePreparedPage | undefined,
  ctx: ReportRegistryDisplayContext,
): {
  sheetNumber: string | null
  sheetName: string | null
  estimatorReviewFlags: string[]
  displaySource: string
} {
  const flags = buildEstimatorReviewFlags(page.review.reasons)

  if (page.final.pageClass !== "DRAWING") {
    return {
      sheetNumber: page.final.sheetNumber,
      sheetName: getBasePreferredDisplayTitle(page),
      estimatorReviewFlags: flags,
      displaySource: "NON_DRAWING_BASE",
    }
  }

  const canonical = resolveTrustedRegistryDrawingDisplay(page, ctx)

  if (canonical) {
    return {
      sheetNumber: canonical.sheetNumber,
      sheetName: canonical.sheetTitle,
      estimatorReviewFlags: flags,
      displaySource: canonical.displaySource,
    }
  }

  let sheetName = page.final.sheetTitle ?? null
  sheetName = stripRedundantSheetPrefix(page.final.sheetNumber, sheetName)

  return {
    sheetNumber: page.final.sheetNumber,
    sheetName,
    estimatorReviewFlags: flags,
    displaySource: "PAGE_FINAL",
  }
}

export function mapAiPageClassToLegacyReportClass(
  value: string,
  page?: IntakeRunResult["pages"][number],
) {
  if (page) {
    return mapAiPageToDisplayBucket(page)
  }

  if (value === "SPECIFICATION") return "SPECIFICATIONS"
  if (value === "BID_DOCUMENT") return "BIDDING_FRONT_END_REQUIREMENTS"
  if (value === "GENERAL_DOCUMENT") return "GENERAL"
  if (value === "BLANK_PAGE") return "BLANK"
  if (value === "DRAWING") return "DRAWING"
  return "UNKNOWN"
}

export function buildSheetDetectionPreview(
  intake: IntakeRunResult,
  preparedPages: IntakePreparedPage[],
  opts?: {
    registryValidation?: RegistryValidationResult
    frontStructureScan?: FrontStructureScanResult
  },
) {
  const preparedByPage = new Map<number, IntakePreparedPage>()
  for (const page of preparedPages) {
    preparedByPage.set(page.pageNumber, page)
  }

  const displayCtx: ReportRegistryDisplayContext = {
    intake,
    registryValidation: opts?.registryValidation,
    frontStructureScan: opts?.frontStructureScan,
  }

  let conflictPagesSeen = 0
  let displayNamesOverridden = 0
  let duplicateIdentityDisplayNames = 0
  let sequenceConflictDisplayNames = 0
  const conflictDisplayExamples: Array<{
    pageNumber: number
    originalDisplayName: string
    finalDisplayName: string
    conflictType: string
  }> = []

  let pagesUsingCanonicalRegistryPair = 0
  let pagesUsingRegistryNumberButNonRegistryTitle = 0
  let pagesUsingNonLiteralRegistryNumber = 0
  let pagesFallingBackToPageDerivedDisplay = 0
  let literalSheetCanonicalPages = 0
  let literalSheetPreservedPages = 0
  let literalSheetNormalizedDisplayPages = 0
  const literalSheetDisplayExamples: Array<{
    pageNumber: number
    canonicalRegistrySheetNumber: string | null
    finalDisplayedSheetNumber: string | null
  }> = []
  const pairingExamples: Array<{
    pageNumber: number
    canonicalRegistrySheetNumber: string | null
    canonicalRegistryTitle: string | null
    finalDisplaySheetNumber: string | null
    finalDisplayTitle: string | null
    finalDisplaySource: string
  }> = []

  const rows = intake.pages.map((page) => {
    const prepared = preparedByPage.get(page.pageNumber)
    const baseName = getBasePreferredDisplayTitle(page)
    const kind = getDrawingIdentityConflictKind(page)
    const est = resolveEstimatorSheetRowDisplay(page, prepared, displayCtx)
    const sheetNumber = est.sheetNumber
    const sheetName = est.sheetName

    const combinedDisplay = [sheetNumber, sheetName].filter(Boolean).join(" — ")
    const baseCombined = [page.final.sheetNumber, baseName].filter(Boolean).join(" — ")

    if (kind) {
      conflictPagesSeen += 1
      if (kind === "duplicate") duplicateIdentityDisplayNames += 1
      else sequenceConflictDisplayNames += 1
      const baseStr = baseName ?? ""
      const finalStr = combinedDisplay || sheetName || ""
      if (baseStr !== finalStr && baseCombined !== combinedDisplay) displayNamesOverridden += 1
      if (conflictDisplayExamples.length < 12) {
        conflictDisplayExamples.push({
          pageNumber: page.pageNumber,
          originalDisplayName: baseStr,
          finalDisplayName: finalStr,
          conflictType: conflictTypeLabel(kind),
        })
      }
    }

    if (page.final.pageClass === "DRAWING") {
      const ref = resolveTrustedRegistryDrawingDisplay(page, displayCtx)
      if (!ref) {
        pagesFallingBackToPageDerivedDisplay += 1
      } else {
        const snEx = normDisplay(est.sheetNumber) === normDisplay(ref.sheetNumber)
        const tiEx = normDisplay(est.sheetName) === normDisplay(ref.sheetTitle)
        const snNonLiteral =
          sameLogicalSheetNumber(est.sheetNumber, ref.sheetNumber) && !snEx
        if (snEx && tiEx) pagesUsingCanonicalRegistryPair += 1
        else if (snEx && !tiEx) pagesUsingRegistryNumberButNonRegistryTitle += 1
        else if (snNonLiteral) pagesUsingNonLiteralRegistryNumber += 1

        literalSheetCanonicalPages += 1
        if (snEx) literalSheetPreservedPages += 1
        else if (sameLogicalSheetNumber(est.sheetNumber, ref.sheetNumber)) {
          literalSheetNormalizedDisplayPages += 1
        }
        if (literalSheetDisplayExamples.length < 12) {
          literalSheetDisplayExamples.push({
            pageNumber: page.pageNumber,
            canonicalRegistrySheetNumber: ref.sheetNumber,
            finalDisplayedSheetNumber: est.sheetNumber,
          })
        }
      }
      if (pairingExamples.length < 16) {
        pairingExamples.push({
          pageNumber: page.pageNumber,
          canonicalRegistrySheetNumber: ref?.sheetNumber ?? null,
          canonicalRegistryTitle: ref?.sheetTitle ?? null,
          finalDisplaySheetNumber: est.sheetNumber,
          finalDisplayTitle: est.sheetName,
          finalDisplaySource: est.displaySource,
        })
      }
    }

    return {
      pageNumber: page.pageNumber,
      pageClass: mapAiPageClassToLegacyReportClass(page.final.pageClass, page),
      sheetNumber,
      sheetName,
      discipline: page.final.discipline,
      sectionNumber: page.final.sectionNumber,
      sectionTitle: page.final.sectionTitle,
      isElectricalRelated: page.final.electricalRelevance,
      sheetType:
        page.final.scaleStatus === "UNVERIFIED"
          ? "PLAN"
          : page.final.pageClass === "DRAWING"
            ? "DETAIL"
            : "NO_SCALE_NEEDED",
      scaleStatus: page.final.scaleStatus,
      scaleConfidence: page.final.scaleConfidence,
      pageWidthInches: prepared?.pdfFacts.width
        ? Math.round((prepared.pdfFacts.width / 72) * 100) / 100
        : null,
      pageHeightInches: prepared?.pdfFacts.height
        ? Math.round((prepared.pdfFacts.height / 72) * 100) / 100
        : null,
      printSizeLabel: page.final.printSize,
      reviewFlags: page.review.reasons,
      estimatorReviewFlags: est.estimatorReviewFlags,
      confidence: { overall: page.confidence.overall },
      provenance: {
        source: "AI_INTAKE",
        anchorKind: page.anchor?.kind ?? null,
        anchorPage: page.anchor?.anchorPage ?? null,
      },
      evidence: page.evidence,
    }
  })

  console.log("visibleIntake:conflictDisplayNameSummary", {
    conflictPagesSeen,
    displayNamesOverridden,
    duplicateIdentityDisplayNames,
    sequenceConflictDisplayNames,
    examples: conflictDisplayExamples,
  })

  console.log("visibleIntake:canonicalRegistryPairingSummary", {
    totalPages: intake.pages.length,
    pagesUsingCanonicalRegistryPair,
    pagesUsingRegistryNumberButNonRegistryTitle,
    pagesUsingNonLiteralRegistryNumber,
    pagesFallingBackToPageDerivedDisplay,
    examples: pairingExamples,
  })

  console.log("visibleIntake:literalSheetNumberDisplaySummary", {
    totalPages: intake.pages.length,
    canonicalPages: literalSheetCanonicalPages,
    literalPreservedPages: literalSheetPreservedPages,
    normalizedDisplayPages: literalSheetNormalizedDisplayPages,
    examples: literalSheetDisplayExamples,
  })

  return rows
}

export function buildLegacyContentCounts(intake: IntakeRunResult) {
  let drawingPages = 0
  let specificationPages = 0
  let biddingFrontEndRequirementPages = 0
  let contractingRequirementPages = 0
  let generalPages = 0
  let blankPages = 0

  for (const page of intake.pages) {
    const bucket = mapAiPageToDisplayBucket(page)

    if (bucket === "DRAWING") drawingPages += 1
    else if (bucket === "SPECIFICATIONS") specificationPages += 1
    else if (bucket === "BIDDING_FRONT_END_REQUIREMENTS") biddingFrontEndRequirementPages += 1
    else if (bucket === "CONTRACTING_REQUIREMENTS") contractingRequirementPages += 1
    else if (bucket === "GENERAL") generalPages += 1
    else if (bucket === "BLANK") blankPages += 1
  }

  return {
    drawingPages,
    specificationPages,
    biddingFrontEndRequirementPages,
    contractingRequirementPages,
    generalPages,
    blankPages,
    reviewNeededPages: intake.pages.filter((p) => p.review.status === "REVIEW_REQUIRED").length,
    unknownPages: 0,
  }
}

export function buildLegacyDrawingSummary(intake: IntakeRunResult) {
  return {
    totalDrawingPages: intake.summary.drawingSummary.totalDrawingPages,
    byDiscipline: intake.summary.drawingSummary.byDiscipline,
    namedDrawingPages: intake.summary.drawingSummary.namedDrawingPages,
    unnamedDrawingPages: intake.summary.drawingSummary.unnamedDrawingPages,
  }
}

export function buildLegacySpecSummary(intake: IntakeRunResult) {
  return {
    totalSpecPages: intake.pages.filter(
      (page) => mapAiPageToDisplayBucket(page) === "SPECIFICATIONS",
    ).length,
    electricalRelatedPages: intake.summary.specSummary.electricalRelatedPages,
    frontEndDocsDetected: intake.pages
      .filter(
        (page) =>
          mapAiPageToDisplayBucket(page) === "BIDDING_FRONT_END_REQUIREMENTS" ||
          mapAiPageToDisplayBucket(page) === "CONTRACTING_REQUIREMENTS",
      )
      .map((page) => getPreferredDisplayTitle(page) ?? page.final.pageSubtype)
      .filter(Boolean),
    sectionsDetected: intake.summary.specSummary.sectionsDetected,
  }
}

export function buildAiReviewSummary(
  intake: IntakeRunResult,
  preparedPages?: IntakePreparedPage[],
  opts?: {
    registryValidation?: RegistryValidationResult
    frontStructureScan?: FrontStructureScanResult
  },
) {
  const preparedByPage = new Map<number, IntakePreparedPage>()
  if (preparedPages) {
    for (const p of preparedPages) preparedByPage.set(p.pageNumber, p)
  }

  const displayCtx: ReportRegistryDisplayContext = {
    intake,
    registryValidation: opts?.registryValidation,
    frontStructureScan: opts?.frontStructureScan,
  }

  const reviewFlagCounts: Record<string, number> = {}

  for (const page of intake.pages) {
    for (const reason of page.review.reasons) {
      reviewFlagCounts[reason] = (reviewFlagCounts[reason] ?? 0) + 1
    }
  }

  const reviewRequiredPages = intake.pages.filter((page) => page.review.status === "REVIEW_REQUIRED").map((page) => {
      const est = resolveEstimatorSheetRowDisplay(page, preparedByPage.get(page.pageNumber), displayCtx)
      return {
        pageNumber: page.pageNumber,
        sheetNumber: est.sheetNumber,
        sheetName: est.sheetName,
        overallConfidence: page.confidence.overall,
        reviewFlags: est.estimatorReviewFlags,
        evidence: page.evidence,
      }
    })

  return {
    reviewFlagCounts,
    lowConfidencePages: reviewRequiredPages,
  }
}

export function buildSqlSheetRows(
  intake: IntakeRunResult,
  preparedPages?: IntakePreparedPage[],
  opts?: {
    registryValidation?: RegistryValidationResult
    frontStructureScan?: FrontStructureScanResult
  },
) {
  const preparedByPage = new Map<number, IntakePreparedPage>()
  if (preparedPages) {
    for (const p of preparedPages) preparedByPage.set(p.pageNumber, p)
  }

  const displayCtx: ReportRegistryDisplayContext = {
    intake,
    registryValidation: opts?.registryValidation,
    frontStructureScan: opts?.frontStructureScan,
  }

  return intake.pages.map((page) => {
    const pageClass = mapAiPageClassToLegacyReportClass(page.final.pageClass, page)
    const sheetType =
      page.final.scaleStatus === "UNVERIFIED"
        ? "PLAN"
        : page.final.pageClass === "DRAWING"
          ? "DETAIL"
          : "NO_SCALE_NEEDED"

    const est = resolveEstimatorSheetRowDisplay(page, preparedByPage.get(page.pageNumber), displayCtx)

    return {
      pageNumber: page.pageNumber,
      sheetNumber: est.sheetNumber,
      sheetName: est.sheetName,
      discipline: page.final.discipline,
      pageClass,
      sectionNumber: page.final.sectionNumber,
      sectionTitle: page.final.sectionTitle,
      isElectricalRelated: page.final.electricalRelevance,
      sheetType,
      scaleStatus: page.final.scaleStatus,
      scaleConfidence: page.final.scaleConfidence,
      notes: page.evidence ?? (page.review.reasons.length ? page.review.reasons.join(", ") : null),
    }
  })
}