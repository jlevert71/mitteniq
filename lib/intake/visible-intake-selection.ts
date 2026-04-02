/**
 * Select which prepared pages require heavy (chunked) AI intake vs deterministic stubs.
 */

import { parseSheetCell, registryLogicalKeyForSheetId } from "./drawing-set-registry"
import { shouldSkipHeavyAiForFastBlank } from "./fast-blank-pass"
import type { FrontStructureScanResult } from "./front-structure-scan"
import {
  buildDrawingIndexMap,
  buildSpecTocMap,
  finalRegistryTitleFromEntry,
  isFrontStructureAuthorityCredible,
  normalizeCsiSection,
  orderedDrawingEntryIndexForPage,
} from "./registry-validation"
import type { IntakeNormalizedPage, IntakePreparedPage } from "./types"

/** Index-like row start (sheet id + title); digits allow D-000 / I-008 style. */
const DRAWING_INDEX_ROW_RE = /^\s*((?:D|E|I)-\d{1,4})\s+(.+)\s*$/i

const SPEC_LEADING_CSI_RE =
  /^\s*((?:\d{2}\s+\d{2}\s+\d{2})|(?:\d{6}))\b/

/** Attached to deterministic skip stubs (review.reasons + evidence). */
export type VisibleIntakeResolutionCode = "DETERMINISTIC_STRONG" | "DETERMINISTIC_PROBABLE"

export type RegistrySkipEntry =
  | {
      kind: "drawing"
      sheetNumber: string
      title: string
      resolutionCode: VisibleIntakeResolutionCode
      /** Set when skip was driven by page-order alignment with front drawing index. */
      orderedResolutionLabel?: string
    }
  | {
      kind: "spec"
      sectionNumber: string | null
      title: string
      resolutionCode: VisibleIntakeResolutionCode
    }

export type VisibleIntakeSelectionStats = {
  skippedTrueBlank: number
  skippedIntentionalBlank: number
  deterministicStrongResolved: number
  deterministicProbableResolved: number
  duplicateEscalations: number
  conflictEscalations: number
  unresolvedEscalations: number
  noAuthorityBroadAiCandidates: number
  weakIndexPagesHelped: number
  weakIndexPagesEscalated: number
}

export type VisibleIntakeSelectionSummary = {
  totalPages: number
  skippedTrueBlank: number
  skippedIntentionalBlank: number
  deterministicStrongResolved: number
  deterministicProbableResolved: number
  duplicateEscalations: number
  conflictEscalations: number
  unresolvedEscalations: number
  noAuthorityBroadAiCandidates: number
  aiCandidatePages: number
  aiCandidatePercent: number
  frontStructureFound: FrontStructureScanResult["structureFound"]
  frontAuthorityCredible: boolean
  /** Why pages still go to heavy AI (when credible, sub-counts are mutually exclusive per page). */
  escalationToAi: {
    duplicateSheet: number
    conflictRouteOrEvidence: number
    unresolvedOrAmbiguous: number
    noAuthorityBroad: number
  }
}

const RESOLUTION_REASON_PREFIX = "VISIBLE_INTAKE_RESOLUTION:"

function resolutionReason(code: VisibleIntakeResolutionCode): string {
  return `${RESOLUTION_REASON_PREFIX}${code}`
}

/** Distinct registry sheet keys found in page text that exist in the front drawing index map. */
function collectDrawingKeysInMapFromText(
  page: IntakePreparedPage,
  drawingMap: Map<string, { sheetNumber: string; title: string; index: number }>,
): string[] {
  const keys = new Set<string>()
  const raw = page.rawText.normalizedText?.trim() ?? page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText ?? ""
  const text = [raw, ocr].filter(Boolean).join("\n")
  const lines = text.split(/\n+/).slice(0, 50)

  for (const line of lines) {
    const trimmed = line.trim()
    const row = trimmed.match(DRAWING_INDEX_ROW_RE)
    if (row) {
      const p = parseSheetCell(row[1])
      if (p) {
        const k = `${p.letter.toUpperCase()}-${p.num}`
        if (drawingMap.has(k)) keys.add(k)
      }
    }
    for (const token of trimmed.split(/\s+/)) {
      const t = token.replace(/[,.;:]$/, "")
      const p = parseSheetCell(t)
      if (p) {
        const k = `${p.letter.toUpperCase()}-${p.num}`
        if (drawingMap.has(k)) keys.add(k)
      }
    }
  }
  return [...keys]
}

function tryResolveWeakDrawingIndexPage(params: {
  page: IntakePreparedPage
  drawingMap: Map<string, { sheetNumber: string; title: string; index: number }>
  drawingEntries: { sheetNumber: string; title: string }[]
  totalPrep: number
  assignedDrawingKeys: Set<string>
}): RegistrySkipEntry | null {
  const { page, drawingMap, drawingEntries, totalPrep, assignedDrawingKeys } = params
  if (page.routing.likelyType !== "DRAWING") return null

  const textKeys = collectDrawingKeysInMapFromText(page, drawingMap)
  const uniqueTextKeys = [...new Set(textKeys)]
  const hintTrim = page.drawingIdentityHints?.sheetNumberCandidate?.trim() ?? ""
  const hintLk = hintTrim ? registryLogicalKeyForSheetId(hintTrim) : null

  const ord = orderedDrawingEntryIndexForPage({
    pageNumber: page.pageNumber,
    totalPages: totalPrep,
    entryCount: drawingEntries.length,
  })
  if (
    ord !== null &&
    hintLk &&
    page.drawingIdentityHints?.registryValidated === true &&
    uniqueTextKeys.length <= 1
  ) {
    const ordEntry = drawingEntries[ord]
    const lkOrdered = registryLogicalKeyForSheetId(ordEntry.sheetNumber)
    if (
      lkOrdered &&
      lkOrdered === hintLk &&
      drawingMap.has(lkOrdered) &&
      !assignedDrawingKeys.has(lkOrdered)
    ) {
      assignedDrawingKeys.add(lkOrdered)
      const mapE = drawingMap.get(lkOrdered)!
      return {
        kind: "drawing",
        sheetNumber: mapE.sheetNumber,
        title: finalRegistryTitleFromEntry(mapE.sheetNumber, mapE.title),
        resolutionCode: "DETERMINISTIC_PROBABLE",
        orderedResolutionLabel: "WEAK_INDEX_ORDERED_HINT_ALIGN",
      }
    }
  }

  if (!hintLk || !drawingMap.has(hintLk)) return null

  const strongSheetHint =
    page.drawingIdentityHints?.registryValidated === true || indexRowExistsForDrawingKey(page, hintLk)
  if (!strongSheetHint) return null

  if (uniqueTextKeys.length > 1) return null
  if (uniqueTextKeys.length === 1 && uniqueTextKeys[0] !== hintLk) return null

  if (assignedDrawingKeys.has(hintLk)) return null

  assignedDrawingKeys.add(hintLk)
  const mapE = drawingMap.get(hintLk)!
  return {
    kind: "drawing",
    sheetNumber: mapE.sheetNumber,
    title: finalRegistryTitleFromEntry(mapE.sheetNumber, mapE.title),
    resolutionCode: "DETERMINISTIC_PROBABLE",
    orderedResolutionLabel: "WEAK_INDEX_ASSIST",
  }
}

function indexRowExistsForDrawingKey(page: IntakePreparedPage, key: string): boolean {
  const raw = page.rawText.normalizedText?.trim() ?? page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText ?? ""
  const text = [raw, ocr].filter(Boolean).join("\n")
  for (const line of text.split(/\n+/).slice(0, 50)) {
    const m = line.trim().match(DRAWING_INDEX_ROW_RE)
    if (!m) continue
    const p = parseSheetCell(m[1])
    if (!p) continue
    const k = `${p.letter.toUpperCase()}-${p.num}`
    if (k === key) return true
  }
  return false
}

/** Distinct TOC section norms found in page text that exist in the front spec map. */
function collectSpecNormsInMapFromText(
  page: IntakePreparedPage,
  specMap: Map<
    string,
    { sectionNumber: string | null; title: string; page: number | null; index: number }
  >,
): string[] {
  const norms = new Set<string>()
  const raw = page.rawText.normalizedText?.trim() ?? page.rawText.fullText ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText ?? ""
  const text = [raw, ocr].filter(Boolean).join("\n")
  for (const line of text.split(/\n+/).slice(0, 30)) {
    const m = line.match(SPEC_LEADING_CSI_RE)
    if (!m?.[1]) continue
    const norm = normalizeCsiSection(m[1])
    if (norm && specMap.has(norm)) norms.add(norm)
  }
  return [...norms]
}

export function buildVisibleIntakeSelectionSummary(params: {
  totalPages: number
  stats: VisibleIntakeSelectionStats
  aiCandidatePages: number
  frontStructureScan: FrontStructureScanResult
  frontAuthorityCredible: boolean
}): VisibleIntakeSelectionSummary {
  const { totalPages, stats, aiCandidatePages, frontStructureScan, frontAuthorityCredible } =
    params
  const pct =
    totalPages > 0 ? Math.round((aiCandidatePages / totalPages) * 1000) / 10 : 0
  return {
    totalPages,
    skippedTrueBlank: stats.skippedTrueBlank,
    skippedIntentionalBlank: stats.skippedIntentionalBlank,
    deterministicStrongResolved: stats.deterministicStrongResolved,
    deterministicProbableResolved: stats.deterministicProbableResolved,
    duplicateEscalations: stats.duplicateEscalations,
    conflictEscalations: stats.conflictEscalations,
    unresolvedEscalations: stats.unresolvedEscalations,
    noAuthorityBroadAiCandidates: stats.noAuthorityBroadAiCandidates,
    aiCandidatePages,
    aiCandidatePercent: pct,
    frontStructureFound: frontStructureScan.structureFound,
    frontAuthorityCredible,
    escalationToAi: {
      duplicateSheet: stats.duplicateEscalations,
      conflictRouteOrEvidence: stats.conflictEscalations,
      unresolvedOrAmbiguous: stats.unresolvedEscalations,
      noAuthorityBroad: stats.noAuthorityBroadAiCandidates,
    },
  }
}

export type WeakIndexAssistSummary = {
  partialRegistryEntries: number
  pagesHelpedByWeakIndex: number
  pagesStillEscalatedToAI: number
  pagesSkippedFromHeavyFallback: number
  weakIndexReasonSummary: Record<string, number>
}

export type PreAiPageSelectionResult = {
  aiCandidatePages: IntakePreparedPage[]
  skippedBlankPageNumbers: number[]
  skippedRegistrySkips: Array<{ pageNumber: number; entry: RegistrySkipEntry }>
  frontAuthorityCredible: boolean
  stats: VisibleIntakeSelectionStats
  orderedModeActive: boolean
  weakIndexAssistSummary: WeakIndexAssistSummary | null
}

export function selectPagesForAiIntake(params: {
  preparedPages: IntakePreparedPage[]
  frontStructureScan: FrontStructureScanResult
}): PreAiPageSelectionResult {
  const { preparedPages, frontStructureScan } = params
  const frontAuthorityCredible = isFrontStructureAuthorityCredible(frontStructureScan)
  const drawingMap = buildDrawingIndexMap(frontStructureScan)
  const specMap = buildSpecTocMap(frontStructureScan)
  const assignedDrawingKeys = new Set<string>()

  const stats: VisibleIntakeSelectionStats = {
    skippedTrueBlank: 0,
    skippedIntentionalBlank: 0,
    deterministicStrongResolved: 0,
    deterministicProbableResolved: 0,
    duplicateEscalations: 0,
    conflictEscalations: 0,
    unresolvedEscalations: 0,
    noAuthorityBroadAiCandidates: 0,
    weakIndexPagesHelped: 0,
    weakIndexPagesEscalated: 0,
  }

  const aiCandidatePages: IntakePreparedPage[] = []
  const skippedBlankPageNumbers: number[] = []
  const skippedRegistrySkips: Array<{ pageNumber: number; entry: RegistrySkipEntry }> = []

  const drawingEntries = frontStructureScan.drawingEntries ?? []
  const totalPrep = preparedPages.length
  const orderedModeActive =
    frontAuthorityCredible &&
    frontStructureScan.structureFound === "DRAWING_INDEX" &&
    preparedPages[0]?.routing.fileDefaultType === "DRAWING" &&
    drawingEntries.length > 0 &&
    (drawingEntries.length === totalPrep || drawingEntries.length === totalPrep - 1)

  /** Pages where ordered rule ran with a valid registry key (may still escalate). */
  let orderedResolutionEvaluated = 0
  let orderedAssignmentsAccepted = 0
  let orderedAssignmentsEscalated = 0
  let orderedOwnershipConflicts = 0
  let orderedContradictoryEscalations = 0
  let orderedAmbiguousTextEscalations = 0
  const perPageOrderedLabels: Array<{ pageNumber: number; label: string }> = []

  for (const page of preparedPages) {
    if (shouldSkipHeavyAiForFastBlank(page)) {
      skippedBlankPageNumbers.push(page.pageNumber)
      const c = page.fastBlank?.classification
      if (c === "TRUE_BLANK") stats.skippedTrueBlank += 1
      else if (c === "INTENTIONAL_BLANK") stats.skippedIntentionalBlank += 1
      continue
    }

    if (!frontAuthorityCredible) {
      if (
        frontStructureScan.structureFound === "WEAK_DRAWING_INDEX" &&
        drawingMap.size > 0
      ) {
        const weakEntry = tryResolveWeakDrawingIndexPage({
          page,
          drawingMap,
          drawingEntries,
          totalPrep,
          assignedDrawingKeys,
        })
        if (weakEntry) {
          stats.weakIndexPagesHelped += 1
          stats.deterministicProbableResolved += 1
          skippedRegistrySkips.push({
            pageNumber: page.pageNumber,
            entry: weakEntry,
          })
          continue
        }
        stats.weakIndexPagesEscalated += 1
      } else {
        stats.noAuthorityBroadAiCandidates += 1
      }
      aiCandidatePages.push(page)
      continue
    }

    if (frontStructureScan.structureFound === "DRAWING_INDEX") {
      if (page.routing.likelyType !== "DRAWING") {
        stats.conflictEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      const textKeys = collectDrawingKeysInMapFromText(page, drawingMap)
      const uniqueTextKeys = [...new Set(textKeys)]
      const hintTrim = page.drawingIdentityHints?.sheetNumberCandidate?.trim() ?? ""
      const hintLk = hintTrim ? registryLogicalKeyForSheetId(hintTrim) : null

      if (orderedModeActive) {
        const entryIdx = orderedDrawingEntryIndexForPage({
          pageNumber: page.pageNumber,
          totalPages: totalPrep,
          entryCount: drawingEntries.length,
        })
        if (entryIdx !== null) {
          const ordEntry = drawingEntries[entryIdx]
          const lkOrdered = registryLogicalKeyForSheetId(ordEntry.sheetNumber)
          if (lkOrdered && drawingMap.has(lkOrdered)) {
            orderedResolutionEvaluated += 1
            const parsedCover = parseSheetCell(ordEntry.sheetNumber)
            const lockPage1Cover =
              page.pageNumber === 1 &&
              entryIdx === 0 &&
              parsedCover &&
              parsedCover.letter === "D" &&
              parsedCover.num === 0

            if (uniqueTextKeys.length > 1 && !lockPage1Cover) {
              orderedAssignmentsEscalated += 1
              orderedAmbiguousTextEscalations += 1
              stats.unresolvedEscalations += 1
              perPageOrderedLabels.push({
                pageNumber: page.pageNumber,
                label: "ORDERED_REGISTRY_ESCALATED_AMBIGUOUS_TEXT",
              })
              aiCandidatePages.push(page)
              continue
            }
            if (
              uniqueTextKeys.length === 1 &&
              uniqueTextKeys[0] !== lkOrdered &&
              !lockPage1Cover
            ) {
              orderedAssignmentsEscalated += 1
              orderedContradictoryEscalations += 1
              stats.conflictEscalations += 1
              perPageOrderedLabels.push({
                pageNumber: page.pageNumber,
                label: "ORDERED_REGISTRY_ESCALATED_CONTRADICTION",
              })
              aiCandidatePages.push(page)
              continue
            }
            if (hintLk && hintLk !== lkOrdered && !lockPage1Cover) {
              orderedAssignmentsEscalated += 1
              orderedContradictoryEscalations += 1
              stats.conflictEscalations += 1
              perPageOrderedLabels.push({
                pageNumber: page.pageNumber,
                label: "ORDERED_REGISTRY_ESCALATED_CONTRADICTION",
              })
              aiCandidatePages.push(page)
              continue
            }
            if (assignedDrawingKeys.has(lkOrdered)) {
              orderedAssignmentsEscalated += 1
              orderedOwnershipConflicts += 1
              stats.duplicateEscalations += 1
              perPageOrderedLabels.push({
                pageNumber: page.pageNumber,
                label: "ORDERED_REGISTRY_ESCALATED_OWNERSHIP_CONFLICT",
              })
              aiCandidatePages.push(page)
              continue
            }

            orderedAssignmentsAccepted += 1
            assignedDrawingKeys.add(lkOrdered)
            const mapE = drawingMap.get(lkOrdered)!
            const withHintAgreement =
              hintLk === lkOrdered ||
              (uniqueTextKeys.length === 1 && uniqueTextKeys[0] === lkOrdered)
            const orderedLabel = withHintAgreement
              ? "ORDERED_REGISTRY_ASSIGNMENT_WITH_HINT_AGREEMENT"
              : "ORDERED_REGISTRY_ASSIGNMENT"
            perPageOrderedLabels.push({
              pageNumber: page.pageNumber,
              label: orderedLabel,
            })
            stats.deterministicStrongResolved += 1
            skippedRegistrySkips.push({
              pageNumber: page.pageNumber,
              entry: {
                kind: "drawing",
                sheetNumber: mapE.sheetNumber,
                title: finalRegistryTitleFromEntry(mapE.sheetNumber, mapE.title),
                resolutionCode: "DETERMINISTIC_STRONG",
                orderedResolutionLabel: orderedLabel,
              },
            })
            continue
          }
        }
      }

      if (textKeys.length > 1) {
        stats.unresolvedEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      let resolved: {
        key: string
        sheetNumber: string
        title: string
        resolutionCode: VisibleIntakeResolutionCode
      } | null = null

      if (hintLk && drawingMap.has(hintLk)) {
        if (textKeys.length === 1 && textKeys[0] !== hintLk) {
          stats.unresolvedEscalations += 1
          aiCandidatePages.push(page)
          continue
        }
        const entry = drawingMap.get(hintLk)!
        const strongEvidence =
          page.drawingIdentityHints?.registryValidated === true ||
          indexRowExistsForDrawingKey(page, hintLk)
        resolved = {
          key: hintLk,
          sheetNumber: entry.sheetNumber,
          title: entry.title,
          resolutionCode: strongEvidence ? "DETERMINISTIC_STRONG" : "DETERMINISTIC_PROBABLE",
        }
      } else if (hintLk && !drawingMap.has(hintLk)) {
        stats.unresolvedEscalations += 1
        aiCandidatePages.push(page)
        continue
      } else if (!hintLk) {
        if (textKeys.length === 1) {
          const k = textKeys[0]
          const entry = drawingMap.get(k)!
          resolved = {
            key: k,
            sheetNumber: entry.sheetNumber,
            title: entry.title,
            resolutionCode: "DETERMINISTIC_PROBABLE",
          }
        } else {
          stats.unresolvedEscalations += 1
          aiCandidatePages.push(page)
          continue
        }
      }

      if (!resolved) {
        stats.unresolvedEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      if (assignedDrawingKeys.has(resolved.key)) {
        stats.duplicateEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      assignedDrawingKeys.add(resolved.key)
      if (resolved.resolutionCode === "DETERMINISTIC_STRONG") {
        stats.deterministicStrongResolved += 1
      } else {
        stats.deterministicProbableResolved += 1
      }

      skippedRegistrySkips.push({
        pageNumber: page.pageNumber,
        entry: {
          kind: "drawing",
          sheetNumber: resolved.sheetNumber,
          title: resolved.title,
          resolutionCode: resolved.resolutionCode,
        },
      })
      continue
    }

    if (frontStructureScan.structureFound === "SPEC_TOC") {
      if (page.routing.likelyType !== "SPEC") {
        stats.conflictEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      const textNorms = collectSpecNormsInMapFromText(page, specMap)
      if (textNorms.length > 1) {
        stats.unresolvedEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      const detNorm = normalizeCsiSection(page.specSignals.detectedSectionNumber)
      let resolved: {
        sectionNumber: string | null
        title: string
        norm: string
        resolutionCode: VisibleIntakeResolutionCode
      } | null = null

      if (detNorm && specMap.has(detNorm)) {
        if (textNorms.length === 1 && textNorms[0] !== detNorm) {
          stats.unresolvedEscalations += 1
          aiCandidatePages.push(page)
          continue
        }
        const e = specMap.get(detNorm)!
        const titleLen = page.specSignals.detectedSectionTitle?.trim().length ?? 0
        const strongTitleEvidence =
          titleLen >= 4 || page.specSignals.likelySpecSectionStart === true
        resolved = {
          sectionNumber: e.sectionNumber,
          title: e.title,
          norm: detNorm,
          resolutionCode: strongTitleEvidence ? "DETERMINISTIC_STRONG" : "DETERMINISTIC_PROBABLE",
        }
      } else if (detNorm && !specMap.has(detNorm)) {
        stats.unresolvedEscalations += 1
        aiCandidatePages.push(page)
        continue
      } else if (!detNorm) {
        if (textNorms.length === 1) {
          const norm = textNorms[0]
          const e = specMap.get(norm)!
          resolved = {
            sectionNumber: e.sectionNumber,
            title: e.title,
            norm,
            resolutionCode: "DETERMINISTIC_PROBABLE",
          }
        } else {
          stats.unresolvedEscalations += 1
          aiCandidatePages.push(page)
          continue
        }
      }

      if (!resolved) {
        stats.unresolvedEscalations += 1
        aiCandidatePages.push(page)
        continue
      }

      if (resolved.resolutionCode === "DETERMINISTIC_STRONG") {
        stats.deterministicStrongResolved += 1
      } else {
        stats.deterministicProbableResolved += 1
      }

      skippedRegistrySkips.push({
        pageNumber: page.pageNumber,
        entry: {
          kind: "spec",
          sectionNumber: resolved.sectionNumber,
          title: resolved.title,
          resolutionCode: resolved.resolutionCode,
        },
      })
      continue
    }

    stats.unresolvedEscalations += 1
    aiCandidatePages.push(page)
  }

  console.log("visibleIntake:orderedRegistryResolutionSummary", {
    registryType: frontStructureScan.structureFound,
    registryEntryCount: drawingEntries.length,
    totalPages: totalPrep,
    orderedModeActive,
    orderedAssignmentsApplied: orderedResolutionEvaluated,
    orderedAssignmentsAccepted,
    orderedAssignmentsEscalated,
    ownershipConflicts: orderedOwnershipConflicts,
    contradictoryHintEscalations: orderedContradictoryEscalations,
    ambiguousTextKeyEscalations: orderedAmbiguousTextEscalations,
    aiCandidatePagesAfterOrdering: aiCandidatePages.length,
    perPageOrderedLabels: perPageOrderedLabels.slice(0, 22),
  })

  const weakIndexAssistSummary: WeakIndexAssistSummary | null =
    frontStructureScan.structureFound === "WEAK_DRAWING_INDEX"
      ? {
          partialRegistryEntries: drawingMap.size,
          pagesHelpedByWeakIndex: stats.weakIndexPagesHelped,
          pagesStillEscalatedToAI: stats.weakIndexPagesEscalated,
          pagesSkippedFromHeavyFallback: stats.weakIndexPagesHelped,
          weakIndexReasonSummary: frontStructureScan.weakIndexDiagnostics?.reasonSummary ?? {},
        }
      : null

  return {
    aiCandidatePages,
    skippedBlankPageNumbers,
    skippedRegistrySkips,
    frontAuthorityCredible,
    stats,
    orderedModeActive,
    weakIndexAssistSummary,
  }
}

/** Alias: pre-AI registry/page matching step (structure-first; before `runAiIntake`). */
export const runPreAiPageSelection = selectPagesForAiIntake

export function summarizeVisibleIntakeAiSelection(params: {
  totalPages: number
  skippedBlankPages: number
  skippedRegistryMatchedPages: number
  aiCandidatePages: number
  frontAuthorityCredible: boolean
}) {
  return {
    totalPages: params.totalPages,
    skippedBlankPages: params.skippedBlankPages,
    skippedRegistryMatchedPages: params.skippedRegistryMatchedPages,
    aiCandidatePages: params.aiCandidatePages,
    frontAuthorityCredible: params.frontAuthorityCredible,
  }
}

export function summarizeVisibleIntakeAiMerge(params: {
  aiProcessedPages: number
  aiSkippedPages: number
  finalPageCount: number
}) {
  return params
}

function buildBlankStubNormalizedPage(prepared: IntakePreparedPage): IntakeNormalizedPage {
  return {
    pageNumber: prepared.pageNumber,
    final: {
      pageClass: "BLANK_PAGE",
      pageSubtype: "BODY_PAGE",
      sheetNumber: null,
      sheetTitle: "Blank Page",
      discipline: null,
      sectionNumber: null,
      sectionTitle: null,
      electricalRelevance: null,
      scaleStatus: "NO_SCALE_NEEDED",
      scaleConfidence: 90,
      printSize: prepared.pdfFacts.printSize,
    },
    aiSignals: {
      structuralRole: "BLANK_PAGE",
      sectionSignalStrength: "NONE",
      packetSignalStrength: "NONE",
      isLikelySectionStart: false,
      isLikelySectionContinuation: false,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    anchor: null,
    confidence: { overall: 0.92 },
    review: { status: "NOT_REQUIRED", reasons: [] },
    evidence: "Heavy AI skipped: fast blank page (deterministic).",
  }
}

function buildRegistrySkipNormalizedPage(
  prepared: IntakePreparedPage,
  entry: RegistrySkipEntry,
): IntakeNormalizedPage {
  const isProbable = entry.resolutionCode === "DETERMINISTIC_PROBABLE"
  const reasonTag = resolutionReason(entry.resolutionCode)
  const weakAssist =
    entry.kind === "drawing" &&
    (entry.orderedResolutionLabel === "WEAK_INDEX_ASSIST" ||
      entry.orderedResolutionLabel === "WEAK_INDEX_ORDERED_HINT_ALIGN")
  const indexFirst =
    entry.kind === "drawing" && entry.orderedResolutionLabel === "INDEX_FIRST_CANONICAL_REGISTRY"
  const tierNote = weakAssist
    ? "weak partial index assist (conservative; verify sheet identity if unsure)"
    : indexFirst
      ? "index-first canonical registry match (targeted index AI + deterministic verify)"
      : isProbable
        ? "probable deterministic match (structure-first; sheet/section id aligned with front index)"
        : "strong deterministic match (structure-first)"

  if (entry.kind === "drawing") {
    return {
      pageNumber: prepared.pageNumber,
      final: {
        pageClass: "DRAWING",
        pageSubtype: "BODY_PAGE",
        sheetNumber: entry.sheetNumber,
        sheetTitle: entry.title,
        discipline: null,
        sectionNumber: null,
        sectionTitle: null,
        electricalRelevance: null,
        scaleStatus: "UNVERIFIED",
        scaleConfidence: weakAssist ? 45 : indexFirst ? 48 : isProbable ? 52 : 55,
        printSize: prepared.pdfFacts.printSize,
      },
      aiSignals: {
        structuralRole: "DRAWING_PAGE",
        sectionSignalStrength: "NONE",
        packetSignalStrength: "NONE",
        isLikelySectionStart: false,
        isLikelySectionContinuation: false,
        isLikelySectionEnd: false,
        isLikelyPacketStart: false,
        isLikelyPacketContinuation: false,
        isLikelyPacketEnd: false,
      },
      anchor: null,
      confidence: { overall: weakAssist ? 0.66 : indexFirst ? 0.72 : isProbable ? 0.78 : 0.85 },
      review: {
        status: "NOT_REQUIRED",
        reasons: [
          reasonTag,
          ...(entry.orderedResolutionLabel ? [entry.orderedResolutionLabel] : []),
        ],
      },
      evidence: `Heavy AI skipped: ${tierNote}. ${
        entry.orderedResolutionLabel ? `${entry.orderedResolutionLabel}. ` : ""
      }${reasonTag}`,
    }
  }

  const sectionStart = prepared.specSignals.likelySpecSectionStart
  return {
    pageNumber: prepared.pageNumber,
    final: {
      pageClass: "SPECIFICATION",
      pageSubtype: "BODY_PAGE",
      sheetNumber: null,
      sheetTitle: null,
      discipline: null,
      sectionNumber: entry.sectionNumber,
      sectionTitle: entry.title,
      electricalRelevance: null,
      scaleStatus: "NO_SCALE_NEEDED",
      scaleConfidence: isProbable ? 80 : 85,
      printSize: prepared.pdfFacts.printSize,
    },
    aiSignals: {
      structuralRole: sectionStart ? "SECTION_START" : "SECTION_CONTINUATION",
      sectionSignalStrength: sectionStart ? "STRONG" : "MEDIUM",
      packetSignalStrength: "NONE",
      isLikelySectionStart: Boolean(sectionStart),
      isLikelySectionContinuation: !sectionStart,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    anchor: null,
    confidence: { overall: isProbable ? 0.78 : 0.85 },
    review: { status: "NOT_REQUIRED", reasons: [reasonTag] },
    evidence: `Heavy AI skipped: ${tierNote}. ${reasonTag}`,
  }
}

export function mergeVisibleIntakeWithStubs(params: {
  aiPartialPages: IntakeNormalizedPage[]
  preparedPages: IntakePreparedPage[]
  blankSkips: number[]
  registrySkips: Array<{ pageNumber: number; entry: RegistrySkipEntry }>
  /** Applied after registry skips (index / non-drawing stubs from index-first pipeline). */
  extraNormalizedByPage?: Map<number, IntakeNormalizedPage>
}): IntakeNormalizedPage[] {
  const { aiPartialPages, preparedPages, blankSkips, registrySkips, extraNormalizedByPage } = params
  const preparedByPage = new Map<number, IntakePreparedPage>()
  for (const p of preparedPages) {
    preparedByPage.set(p.pageNumber, p)
  }

  const byPage = new Map<number, IntakeNormalizedPage>()
  for (const row of aiPartialPages) {
    byPage.set(row.pageNumber, row)
  }

  for (const n of blankSkips) {
    const prep = preparedByPage.get(n)
    if (prep) byPage.set(n, buildBlankStubNormalizedPage(prep))
  }

  for (const r of registrySkips) {
    const prep = preparedByPage.get(r.pageNumber)
    if (prep) byPage.set(r.pageNumber, buildRegistrySkipNormalizedPage(prep, r.entry))
  }

  if (extraNormalizedByPage) {
    for (const [pn, row] of extraNormalizedByPage) {
      byPage.set(pn, row)
    }
  }

  return preparedPages.map((p) => {
    const row = byPage.get(p.pageNumber)
    if (!row) {
      throw new Error(`mergeVisibleIntakeWithStubs: missing page ${p.pageNumber}`)
    }
    return row
  })
}

export function buildAllDeterministicNormalizedPages(params: {
  preparedPages: IntakePreparedPage[]
  selection: PreAiPageSelectionResult
}): IntakeNormalizedPage[] {
  const { preparedPages, selection } = params
  const preparedByPage = new Map<number, IntakePreparedPage>()
  for (const p of preparedPages) {
    preparedByPage.set(p.pageNumber, p)
  }

  const byPage = new Map<number, IntakeNormalizedPage>()
  for (const n of selection.skippedBlankPageNumbers) {
    const prep = preparedByPage.get(n)
    if (prep) byPage.set(n, buildBlankStubNormalizedPage(prep))
  }
  for (const r of selection.skippedRegistrySkips) {
    const prep = preparedByPage.get(r.pageNumber)
    if (prep) byPage.set(r.pageNumber, buildRegistrySkipNormalizedPage(prep, r.entry))
  }

  return preparedPages.map((p) => {
    const row = byPage.get(p.pageNumber)
    if (!row) {
      throw new Error(`buildAllDeterministic: missing page ${p.pageNumber}`)
    }
    return row
  })
}
