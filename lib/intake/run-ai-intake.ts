import fs from "fs/promises"
import OpenAI from "openai"
import {
  shouldPreferHintSheetNumber,
  shouldPreferHintSheetTitle,
} from "./drawing-identity"
import {
  lookupRegistryEntry,
  registryLogicalKeyForSheetId,
  type DrawingSetRegistry,
} from "./drawing-set-registry"
import {
  resolveFinalDrawingIdentity,
  shouldLogDrawingIdentityResolution,
} from "./resolve-final-drawing-identity"
import type { ExtractedIndexSheetRow } from "./index-canonical-registry"
import { analyzeSpecFastPathEligibility } from "./spec-fast-path"
import { groupSpecSections } from "./spec-section-grouping"
import type {
  IntakeAiPageResult,
  IntakeDocumentSummary,
  IntakeNormalizedPage,
  IntakePageClass,
  IntakePreparedPage,
  IntakeRunResult,
  IntakeSignalStrength,
  IntakeStructuralRole,
  ScaleStatus,
} from "./types"

export const AI_INTAKE_MODEL = "gpt-4o-mini"
const LLM_MODEL = AI_INTAKE_MODEL
const REVIEW_CONFIDENCE_THRESHOLD = 0.9

const AI_MAX_RETRIES = 4
const AI_BASE_BACKOFF_MS = 4_000
const AI_MAX_BACKOFF_MS = 90_000

const DEFAULT_MAX_CONCURRENT_CHUNKS = 3
const DEFAULT_MAX_ESTIMATED_TOKENS_IN_FLIGHT = 14_000

const MAX_CHUNK_SPLIT_DEPTH = 2

type ChunkRoute = "DRAWING" | "SPEC" | "MIXED" | "GENERAL"

type ChunkPlan = {
  index: number
  route: ChunkRoute
  pages: IntakePreparedPage[]
  estimatedTokens: number
  includedImagePages: number[]
}

type RunAiIntakeParams = {
  uploadId: string
  filename: string | null
  pages: IntakePreparedPage[]
  /** Original PDF bytes for spec fast-path eligibility (optional). */
  pdfBuffer?: Buffer
  /** Sheet index registry from prepared pages (optional). */
  drawingSetRegistry?: DrawingSetRegistry
  /**
   * When `pages` is a subset, pass full-document page count so normalization uses correct totals
   * (e.g. title suppression / blank heuristics).
   */
  documentPageCount?: number
  /**
   * When set, only these page numbers are sent through the LLM (extras are dropped with a warning).
   * Used for index-first escalations so full-document AI cannot run accidentally.
   */
  llmPageAllowlist?: number[]
}

const EMPTY_DRAWING_REGISTRY: DrawingSetRegistry = {
  byLogicalKey: new Map(),
  entries: [],
}

type AiChunkResponse = {
  pages: Array<{
    pageNumber: number
    pageClass: string
    pageSubtype: string
    sheetNumber: string | null
    sheetTitle: string | null
    discipline: string | null
    sectionNumber: string | null
    sectionTitle: string | null
    electricalRelevance: boolean | null
    structuralRole: string | null
    sectionSignalStrength: string
    packetSignalStrength: string
    isLikelySectionStart: boolean
    isLikelySectionContinuation: boolean
    isLikelySectionEnd: boolean
    isLikelyPacketStart: boolean
    isLikelyPacketContinuation: boolean
    isLikelyPacketEnd: boolean
    confidence: number
    reviewRequired: boolean
    evidence: string | null
  }>
}

type SparseNonDrawingClassification =
  | "TRUE_BLANK"
  | "DIVIDER_LIKE"
  | "LOW_CONTENT_MEANINGFUL"
  | "NOT_BLANK"

let cachedClient: OpenAI | null | undefined = undefined

function getApiKeyRaw() {
  const raw = process.env.OPENAI_API_KEY
  return typeof raw === "string" ? raw.trim() : ""
}

function llmEnabled() {
  const raw = process.env.MITTENIQ_LLM_INTAKE_ENABLED
  return String(raw ?? "").trim().toLowerCase() === "true"
}

/** True when visible intake may call the OpenAI client (env + API key). */
export function canRunAiIntake(): boolean {
  return llmEnabled() && Boolean(getApiKeyRaw())
}

/**
 * Reconcile, anchors, spec sections, and summary for a full merged page list.
 * Caller supplies `ai` metadata (e.g. partial heavy-AI run).
 */
export function finalizeIntakeRunResultPages(
  pages: IntakeNormalizedPage[],
  preparedPages: IntakePreparedPage[],
): Omit<IntakeRunResult, "ai"> {
  let normalized = reconcileAdjacentNonDrawingPages(pages, preparedPages)
  const anchorBuild = buildAnchors(normalized)
  normalized = anchorBuild.pages
  const specSections = groupSpecSections(normalized)
  const summary = buildDocumentSummary(normalized)
  return {
    pages: normalized,
    summary,
    specSections,
    anchors: anchorBuild.anchors,
  }
}

function getClient() {
  if (cachedClient !== undefined) return cachedClient

  const apiKey = getApiKeyRaw()
  if (!apiKey) {
    cachedClient = null
    return cachedClient
  }

  cachedClient = new OpenAI({ apiKey })
  return cachedClient
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getPositiveIntEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(min, Math.min(Math.round(raw), max))
}

function getMaxConcurrentChunks() {
  return getPositiveIntEnv(
    "MITTENIQ_AI_MAX_CONCURRENT_CHUNKS",
    DEFAULT_MAX_CONCURRENT_CHUNKS,
    1,
    6,
  )
}

function getMaxEstimatedTokensInFlight() {
  return getPositiveIntEnv(
    "MITTENIQ_AI_MAX_ESTIMATED_TOKENS_IN_FLIGHT",
    DEFAULT_MAX_ESTIMATED_TOKENS_IN_FLIGHT,
    2_000,
    40_000,
  )
}

function normalizeNullableString(value: unknown, maxLen = 240): string | null {
  if (typeof value !== "string") return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (!cleaned) return null

  const lower = cleaned.toLowerCase()
  if (lower === "null" || lower === "undefined" || lower === "n/a") {
    return null
  }

  return cleaned.slice(0, maxLen)
}

function compactText(value: string, maxLen: number) {
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (cleaned.length <= maxLen) return cleaned
  return cleaned.slice(0, maxLen).trim()
}

function normalizePageClass(value: unknown): IntakePageClass {
  const upper = String(value ?? "").trim().toUpperCase()

  if (upper === "DRAWING") return "DRAWING"
  if (upper === "SPECIFICATION") return "SPECIFICATION"
  if (upper === "BID_DOCUMENT") return "BID_DOCUMENT"
  if (upper === "GENERAL_DOCUMENT") return "GENERAL_DOCUMENT"
  if (upper === "BLANK_PAGE") return "BLANK_PAGE"

  return "GENERAL_DOCUMENT"
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  return clamp(n, 0, 1)
}

function normalizeBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  return null
}

function normalizeSheetNumber(value: unknown): string | null {
  const raw = normalizeNullableString(value, 64)
  if (!raw) return null

  const normalized = raw
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return null
  return normalized
}

function normalizeDiscipline(value: unknown): string | null {
  const raw = normalizeNullableString(value, 80)
  if (!raw) return null
  return raw.toUpperCase().replace(/\s+/g, "_")
}

function normalizeSignalStrength(value: unknown): IntakeSignalStrength {
  const upper = String(value ?? "").trim().toUpperCase()
  if (upper === "STRONG") return "STRONG"
  if (upper === "MEDIUM") return "MEDIUM"
  if (upper === "WEAK") return "WEAK"
  return "NONE"
}

function normalizeStructuralRole(value: unknown): IntakeStructuralRole | null {
  const upper = String(value ?? "").trim().toUpperCase()

  if (
    upper === "SECTION_START" ||
    upper === "SECTION_CONTINUATION" ||
    upper === "SECTION_END" ||
    upper === "PART_HEADER" ||
    upper === "TABLE_OF_CONTENTS" ||
    upper === "DIVISION_HEADER" ||
    upper === "INDEX_PAGE" ||
    upper === "TITLE_PAGE" ||
    upper === "FORM_PAGE" ||
    upper === "APPENDIX_PAGE" ||
    upper === "BLANK_PAGE" ||
    upper === "DRAWING_PAGE" ||
    upper === "OTHER"
  ) {
    return upper
  }

  return null
}

function deriveScaleStatus(pageClass: IntakePageClass, pageSubtype: string): ScaleStatus {
  const subtype = pageSubtype.trim().toUpperCase()

  if (pageClass !== "DRAWING") return "NO_SCALE_NEEDED"

  if (
    subtype.includes("INDEX") ||
    subtype.includes("TITLE") ||
    subtype.includes("COVER") ||
    subtype.includes("SCHEDULE") ||
    subtype.includes("DETAIL") ||
    subtype.includes("RISER") ||
    subtype.includes("DIAGRAM") ||
    subtype.includes("LEGEND") ||
    subtype.includes("NOTES")
  ) {
    return "NO_SCALE_NEEDED"
  }

  return "UNVERIFIED"
}

function deriveScaleConfidence(
  pageClass: IntakePageClass,
  pageSubtype: string,
  overallConfidence: number,
): number {
  if (pageClass !== "DRAWING") {
    return Math.round(clamp(overallConfidence * 100, 70, 100))
  }

  const scaleStatus = deriveScaleStatus(pageClass, pageSubtype)

  if (scaleStatus === "NO_SCALE_NEEDED") {
    return Math.round(clamp(overallConfidence * 100, 70, 99))
  }

  return Math.round(clamp(overallConfidence * 100, 40, 95))
}

function approximateTokenCountFromText(value: string | null | undefined) {
  if (!value) return 0
  return Math.ceil(value.length / 4)
}

function classifyChunkRoute(pages: IntakePreparedPage[]): ChunkRoute {
  const counts = {
    DRAWING: 0,
    SPEC: 0,
    MIXED: 0,
    UNKNOWN: 0,
  }

  for (const page of pages) {
    counts[page.routing.likelyType] += 1
  }

  const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const dominant = ordered[0]?.[0] ?? "UNKNOWN"

  if (dominant === "DRAWING") return "DRAWING"
  if (dominant === "SPEC") return "SPEC"
  if (dominant === "MIXED") return "MIXED"
  return "GENERAL"
}

function getChunkRouteConfig(route: ChunkRoute) {
  if (route === "SPEC") {
    return {
      targetEstimatedTokens: 3_600,
      hardEstimatedTokens: 4_500,
      maxPages: 6,
      minPagesAfterSplit: 2,
    }
  }

  if (route === "DRAWING") {
    return {
      targetEstimatedTokens: 3_200,
      hardEstimatedTokens: 4_200,
      maxPages: 8,
      minPagesAfterSplit: 2,
    }
  }

  if (route === "MIXED") {
    return {
      targetEstimatedTokens: 2_600,
      hardEstimatedTokens: 3_400,
      maxPages: 6,
      minPagesAfterSplit: 2,
    }
  }

  return {
    targetEstimatedTokens: 2_300,
    hardEstimatedTokens: 3_000,
    maxPages: 6,
    minPagesAfterSplit: 2,
  }
}

function choosePrimaryAndSecondaryText(page: IntakePreparedPage) {
  const raw = page.rawText.normalizedText?.trim() ?? ""
  const ocr = page.ocrText.normalizedText?.trim() ?? ""

  if (raw && ocr) {
    const primary = raw.length >= ocr.length ? raw : ocr
    const secondary = primary === raw ? ocr : raw
    const normalizedPrimary = primary.toLowerCase()
    const normalizedSecondary = secondary.toLowerCase()

    const secondaryIsRedundant =
      !normalizedSecondary ||
      normalizedPrimary.includes(normalizedSecondary) ||
      normalizedSecondary.includes(normalizedPrimary)

    return {
      sourceUsed: "mixed" as const,
      primaryText: primary,
      secondaryText: secondaryIsRedundant ? null : secondary,
    }
  }

  if (ocr) {
    return {
      sourceUsed: "ocr" as const,
      primaryText: ocr,
      secondaryText: null,
    }
  }

  return {
    sourceUsed: "raw" as const,
    primaryText: raw,
    secondaryText: null,
  }
}

function shouldIncludePageImageInPrompt(page: IntakePreparedPage, chunkRoute: ChunkRoute) {
  if (!page.pageImage.imagePath) return false

  const noExtractedText =
    page.extractionWarnings.includes("NO_EXTRACTED_TEXT") ||
    !page.rawText.normalizedText
  const routingUncertain = page.extractionWarnings.includes("ROUTING_UNCERTAIN")
  const ocrRecommended = page.extractionWarnings.includes("OCR_RECOMMENDED")
  const veryLowTextDensity = (page.pdfFacts.textDensity ?? 1) < 0.0005

  if (chunkRoute === "DRAWING") return true

  if (chunkRoute === "MIXED") {
    return (
      page.routing.likelyType === "DRAWING" ||
      noExtractedText ||
      routingUncertain ||
      ocrRecommended
    )
  }

  if (chunkRoute === "SPEC") {
    return (
      noExtractedText ||
      routingUncertain ||
      (ocrRecommended && veryLowTextDensity) ||
      page.specSignals.likelyBlankOrDividerPage
    )
  }

  return noExtractedText || routingUncertain
}

function buildPromptTextForPage(page: IntakePreparedPage, chunkRoute: ChunkRoute) {
  const bestText = choosePrimaryAndSecondaryText(page)

  if (chunkRoute === "SPEC") {
    return {
      sourceUsed: bestText.sourceUsed,
      primaryTextExcerpt: compactText(bestText.primaryText, 550),
      secondaryTextExcerpt: bestText.secondaryText
        ? compactText(bestText.secondaryText, 200)
        : null,
      firstLines: page.rawText.lines.slice(0, 4),
    }
  }

  if (chunkRoute === "DRAWING") {
    return {
      sourceUsed: bestText.sourceUsed,
      primaryTextExcerpt: compactText(bestText.primaryText, 380),
      secondaryTextExcerpt: bestText.secondaryText
        ? compactText(bestText.secondaryText, 140)
        : null,
      firstLines: page.rawText.lines.slice(0, 6),
    }
  }

  return {
    sourceUsed: bestText.sourceUsed,
    primaryTextExcerpt: compactText(bestText.primaryText, 520),
    secondaryTextExcerpt: bestText.secondaryText
      ? compactText(bestText.secondaryText, 180)
      : null,
    firstLines: page.rawText.lines.slice(0, 5),
  }
}

function buildSystemPromptForChunkRoute(chunkRoute: ChunkRoute) {
  const shared =
    "You are MittenIQ intake AI. Return strict JSON only. Be conservative. Use null instead of guessing. Confidence must reflect real certainty."

  if (chunkRoute === "DRAWING") {
    return `${shared} These pages are mostly drawing-like. Prioritize pageClass, pageSubtype, sheetNumber, sheetTitle, discipline, electricalRelevance, and confidence. Use page images heavily when available. Prefer title-block evidence over body notes. Sheet-system membership overrides body layout: if a title block, sheet number, or strong continuity with neighboring drawing sheets indicates the page belongs to the construction drawing set, classify as DRAWING even when the page is mostly text or tables (e.g. schedules, quantity summaries, legends, notes, standard details). Use pageSubtype for the role. A cover sheet or drawing index in the set is still DRAWING. For drawing pages, sheetNumber should be the visible drawing identifier when present, and sheetTitle the visible drawing title. pageSubtype examples: COVER_SHEET, INDEX_SHEET, PLAN, DETAIL, SCHEDULE, RISER, DIAGRAM, LEGEND, NOTES, BODY_PAGE. structuralRole should usually be DRAWING_PAGE. If the page belongs to the drawing set but sheet number/title evidence is weak or uncertain, keep DRAWING when appropriate, use null for unsure fields, lower confidence, and set reviewRequired=true. Every DRAWING page MUST attempt to extract a sheetNumber if any alphanumeric identifier resembling a sheet ID exists anywhere on the page, especially near corners or title blocks. If a sheet identifier is visually present but uncertain, return the best candidate and lower confidence instead of returning null. If a page visually belongs to a drawing set but lacks a clear sheet number, explicitly state that in evidence and set reviewRequired=true.`
  }

  if (chunkRoute === "SPEC") {
    return `${shared} These pages are mostly specification or project-manual pages. Prioritize pageClass, pageSubtype, sectionNumber, sectionTitle, electricalRelevance, and front-end/bid distinctions. For non-drawing pages, sheetNumber is the visible page label only when the document itself prints a page label, such as Page 2 of 9 or a section-local page identifier. sheetTitle is the best visible page title or heading for the page. pageSubtype should describe the page role with broad values such as TITLE_PAGE, TABLE_OF_CONTENTS, SECTION_DIVIDER, FORM_PAGE, BODY_PAGE, INDEX_PAGE, APPENDIX_PAGE, or BLANK_PAGE. Also return continuity signals. Use structuralRole to describe the page's role in document continuity. Return sectionSignalStrength and packetSignalStrength using NONE, WEAK, MEDIUM, or STRONG. Return booleans for whether the page likely starts, continues, or ends a section and whether it likely starts, continues, or ends a packet/form/document run. Neighboring pages in the chunk are consecutive pages. Use that context. Preserve meaningful page-position labels like Page 2 of 9 when visible. Do not use the PDF page number as the page label unless it is actually printed on the page itself.`
  }

  if (chunkRoute === "MIXED") {
    return `${shared} These pages are mixed or ambiguous. Use routing hints carefully. Prefer broad cautious classifications when evidence conflicts. For non-drawing pages, sheetNumber is the visible page label if one appears on the page and sheetTitle is the visible page title or heading. pageSubtype should capture the broad page role, not a narrow literal phrase. Also return continuity signals using structuralRole, sectionSignalStrength, packetSignalStrength, and the start/continuation/end booleans. Neighboring pages in the chunk are consecutive pages. Preserve meaningful page-position labels when visible. Do not use the PDF page number as the page label unless it is visibly printed on the page as part of the document itself.`
  }

  return `${shared} These pages are general or uncertain. Use broad cautious classifications unless the evidence is strong. For non-drawing pages, sheetNumber is the visible page label if one exists and sheetTitle is the visible page title or heading. pageSubtype should capture the broad page role, such as TITLE_PAGE, TABLE_OF_CONTENTS, SECTION_DIVIDER, FORM_PAGE, BODY_PAGE, or BLANK_PAGE. Also return continuity signals using structuralRole, sectionSignalStrength, packetSignalStrength, and the start/continuation/end booleans. Do not use the PDF page number as the page label unless it is actually printed on the page as the document page label.`
}

function buildPromptPayload(
  uploadId: string,
  filename: string | null,
  pages: IntakePreparedPage[],
  chunkRoute: ChunkRoute,
) {
  const drawingIdentityHintRules =
    chunkRoute === "DRAWING"
      ? [
          "When drawingIdentityHints are provided for a page, treat them as strong deterministic title-block evidence from layout bands and corners. Prefer those sheetNumber/sheetTitle values unless the page image or quoted visible text clearly contradicts them.",
        ]
      : []

  return {
    uploadId,
    filename,
    chunkRoute,
    instructions: {
      mission:
        "Interpret each construction PDF page and return structured page intelligence for downstream estimating workflows.",
      hardRules: [
        "Return valid JSON only.",
        "Do not invent unsupported values.",
        "Use null when evidence is weak.",
        "Confidence below 0.90 should usually imply reviewRequired=true for drawing pages, but non-drawing pages should only be marked reviewRequired when uncertainty is materially important.",
        "Sheet-system membership overrides general-looking text or tables: if a title block, sheet number, or strong continuity with neighboring drawing sheets indicates the drawing set, use DRAWING, not GENERAL_DOCUMENT.",
        "If a page belongs to the drawing sheet system but sheet number or title extraction is weak or uncertain, keep pageClass as DRAWING when appropriate, use null for uncertain fields, lower confidence to reflect that uncertainty, and set reviewRequired=true.",
        "Use BLANK_PAGE only for truly blank or intentionally blank pages.",
        "For drawing pages, prefer title-block-like evidence over body-note text.",
        "If a page image is available, use it when helpful.",
        "PDF page order is not the same as document-internal page labels.",
        "For non-drawing pages, sheetNumber is the visible page label when one is printed on the page, and sheetTitle is the visible page title or heading.",
        "Preserve meaningful packet-position labels like Page 2 of 9 when printed.",
        "Return continuity signals honestly. Do not force section starts or packet continuity without evidence.",
        "Examples are illustrative only. Do not assume documents must follow one naming convention.",
        ...drawingIdentityHintRules,
      ],
      pageClassDefinitions: {
        DRAWING:
          "Engineering or construction drawing sheet within the sheet numbering/title-block system: plans, details, schedules, quantity sheets and quantity summaries, legends, notes sheets, standard details, cover/index sheets in the set, and other pages that belong to the drawing set—even when mostly text or tables.",
        SPECIFICATION: "Specification manual or spec-style content.",
        BID_DOCUMENT: "Bid forms, bidder instructions, procurement, legal, contract-front-end, or similar project-manual content.",
        GENERAL_DOCUMENT:
          "Content clearly outside the construction drawing sheet system (e.g. narrative front matter, project-info narrative without drawing-sheet identity, admin packet). Do not use for schedules, quantity sheets, legends, notes, standard details, or other text/table-heavy pages that share a drawing title block, sheet number, or clear continuity with drawing sheets.",
        BLANK_PAGE: "Intentionally blank or effectively blank page.",
      },
      structuralRoleDefinitions: {
        SECTION_START: "A page that likely begins a new specification section.",
        SECTION_CONTINUATION: "A page that likely continues the current specification section.",
        SECTION_END: "A page that likely ends the current specification section.",
        PART_HEADER: "A page that likely represents PART 1 / PART 2 / PART 3 within a section.",
        TABLE_OF_CONTENTS: "A table of contents page.",
        DIVISION_HEADER: "A divider or division header page.",
        INDEX_PAGE: "An index-style page.",
        TITLE_PAGE: "A title or cover page.",
        FORM_PAGE: "A form, legal packet page, or contract packet page.",
        APPENDIX_PAGE: "An appendix or attachment page.",
        BLANK_PAGE: "A truly blank or intentionally blank page.",
        DRAWING_PAGE: "A drawing page.",
        OTHER: "None of the above fit confidently.",
      },
    },
    pages: pages.map((page) => {
      const promptText = buildPromptTextForPage(page, chunkRoute)

      return {
        pageNumber: page.pageNumber,
        pdfFacts: {
          printSize: page.pdfFacts.printSize,
          isRasterLikely: page.pdfFacts.isRasterLikely,
          isSearchable: page.pdfFacts.isSearchable,
          textDensity: page.pdfFacts.textDensity,
        },
        routing: {
          likelyType: page.routing.likelyType,
          confidence: page.routing.confidence,
        },
        specSignals: {
          likelySpecSectionStart: page.specSignals.likelySpecSectionStart,
          likelySpecContinuation: page.specSignals.likelySpecContinuation,
          likelyFrontEndPage: page.specSignals.likelyFrontEndPage,
          likelyIndexOrTocPage: page.specSignals.likelyIndexOrTocPage,
          likelyBlankOrDividerPage: page.specSignals.likelyBlankOrDividerPage,
          detectedSectionNumber: page.specSignals.detectedSectionNumber,
          detectedSectionTitle: page.specSignals.detectedSectionTitle,
          headerHint: page.specSignals.headerHint,
          footerHint: page.specSignals.footerHint,
        },
        layoutEvidence: {
          lowYRightCornerText: page.layoutEvidence.lowYRightCornerText,
          highYRightCornerText: page.layoutEvidence.highYRightCornerText,
          lowYBandText: page.layoutEvidence.lowYBandText,
          highYBandText: page.layoutEvidence.highYBandText,
        },
        ...(page.drawingIdentityHints
          ? { drawingIdentityHints: page.drawingIdentityHints }
          : {}),
        extractionWarnings: page.extractionWarnings.slice(0, 6),
        pageImage: {
          available: shouldIncludePageImageInPrompt(page, chunkRoute),
        },
        text: promptText,
      }
    }),
  }
}

function estimatePagePayloadTokens(page: IntakePreparedPage, chunkRoute: ChunkRoute) {
  const text = buildPromptTextForPage(page, chunkRoute)
  const imageIncluded = shouldIncludePageImageInPrompt(page, chunkRoute)

  let estimated =
    160 +
    approximateTokenCountFromText(text.primaryTextExcerpt) +
    approximateTokenCountFromText(text.secondaryTextExcerpt) +
    approximateTokenCountFromText(text.firstLines.join(" ")) +
    approximateTokenCountFromText(page.layoutEvidence.lowYRightCornerText) +
    approximateTokenCountFromText(page.layoutEvidence.highYRightCornerText) +
    approximateTokenCountFromText(page.specSignals.detectedSectionTitle) +
    approximateTokenCountFromText(page.specSignals.headerHint) +
    approximateTokenCountFromText(page.specSignals.footerHint)

  if (page.specSignals.likelySpecSectionStart) estimated += 35
  if (page.specSignals.likelySpecContinuation) estimated += 25
  if (page.routing.likelyType === "UNKNOWN") estimated += 25
  if (imageIncluded) estimated += 450
  if (page.drawingIdentityHints) {
    const h = page.drawingIdentityHints
    estimated +=
      approximateTokenCountFromText(h.sheetNumberCandidate ?? "") +
      approximateTokenCountFromText(h.sheetTitleCandidate ?? "") +
      approximateTokenCountFromText(h.titleBlockEvidence.join(" "))
  }

  return estimated
}

function estimateChunkPayloadTokens(pages: IntakePreparedPage[], chunkRoute: ChunkRoute) {
  const pageTokens = pages.reduce(
    (sum, page) => sum + estimatePagePayloadTokens(page, chunkRoute),
    0,
  )

  const fixedPromptOverhead =
    chunkRoute === "DRAWING"
      ? 760
      : chunkRoute === "SPEC"
        ? 740
        : chunkRoute === "MIXED"
          ? 680
          : 620

  return fixedPromptOverhead + pageTokens
}

function planChunks(
  pages: IntakePreparedPage[],
  options?: { specFastPathActive?: boolean },
): ChunkPlan[] {
  const specFastPathActive = Boolean(options?.specFastPathActive)
  const chunks: ChunkPlan[] = []
  let current: IntakePreparedPage[] = []

  function pushCurrentChunk() {
    if (!current.length) return
    const route = classifyChunkRoute(current)
    chunks.push({
      index: chunks.length,
      route,
      pages: current,
      estimatedTokens: estimateChunkPayloadTokens(current, route),
      includedImagePages: current
        .filter((page) => shouldIncludePageImageInPrompt(page, route))
        .map((page) => page.pageNumber),
    })
    current = []
  }

  for (const page of pages) {
    if (!current.length) {
      current = [page]
      continue
    }

    const tentative = [...current, page]
    const route = classifyChunkRoute(tentative)
    const config = getChunkRouteConfig(route)
    const maxPagesForRoute =
      specFastPathActive && route === "SPEC" ? 12 : config.maxPages
    const estimatedTokens = estimateChunkPayloadTokens(tentative, route)

    const routeChangedMeaningfully =
      classifyChunkRoute(current) !== route &&
      current.length >= 2 &&
      current[current.length - 1]?.routing.likelyType !== page.routing.likelyType

    const exceedsPageLimit = tentative.length > maxPagesForRoute
    const exceedsTokenTarget =
      tentative.length > 1 && estimatedTokens > config.targetEstimatedTokens
    const exceedsTokenHardCap = estimatedTokens > config.hardEstimatedTokens

    if (
      routeChangedMeaningfully ||
      exceedsPageLimit ||
      exceedsTokenTarget ||
      exceedsTokenHardCap
    ) {
      pushCurrentChunk()
      current = [page]
    } else {
      current = tentative
    }
  }

  pushCurrentChunk()

  return chunks
}

const aiChunkSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pageNumber: { type: "integer" },
          pageClass: {
            type: "string",
            enum: [
              "DRAWING",
              "SPECIFICATION",
              "BID_DOCUMENT",
              "GENERAL_DOCUMENT",
              "BLANK_PAGE",
            ],
          },
          pageSubtype: { type: "string" },
          sheetNumber: { type: ["string", "null"] },
          sheetTitle: { type: ["string", "null"] },
          discipline: { type: ["string", "null"] },
          sectionNumber: { type: ["string", "null"] },
          sectionTitle: { type: ["string", "null"] },
          electricalRelevance: { type: ["boolean", "null"] },
          structuralRole: {
            type: ["string", "null"],
            enum: [
              "SECTION_START",
              "SECTION_CONTINUATION",
              "SECTION_END",
              "PART_HEADER",
              "TABLE_OF_CONTENTS",
              "DIVISION_HEADER",
              "INDEX_PAGE",
              "TITLE_PAGE",
              "FORM_PAGE",
              "APPENDIX_PAGE",
              "BLANK_PAGE",
              "DRAWING_PAGE",
              "OTHER",
              null,
            ],
          },
          sectionSignalStrength: {
            type: "string",
            enum: ["NONE", "WEAK", "MEDIUM", "STRONG"],
          },
          packetSignalStrength: {
            type: "string",
            enum: ["NONE", "WEAK", "MEDIUM", "STRONG"],
          },
          isLikelySectionStart: { type: "boolean" },
          isLikelySectionContinuation: { type: "boolean" },
          isLikelySectionEnd: { type: "boolean" },
          isLikelyPacketStart: { type: "boolean" },
          isLikelyPacketContinuation: { type: "boolean" },
          isLikelyPacketEnd: { type: "boolean" },
          confidence: { type: "number" },
          reviewRequired: { type: "boolean" },
          evidence: { type: ["string", "null"] },
        },
        required: [
          "pageNumber",
          "pageClass",
          "pageSubtype",
          "sheetNumber",
          "sheetTitle",
          "discipline",
          "sectionNumber",
          "sectionTitle",
          "electricalRelevance",
          "structuralRole",
          "sectionSignalStrength",
          "packetSignalStrength",
          "isLikelySectionStart",
          "isLikelySectionContinuation",
          "isLikelySectionEnd",
          "isLikelyPacketStart",
          "isLikelyPacketContinuation",
          "isLikelyPacketEnd",
          "confidence",
          "reviewRequired",
          "evidence",
        ],
      },
    },
  },
  required: ["pages"],
} as const

function parseChunkResponse(raw: string): AiChunkResponse | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AiChunkResponse>
    if (!parsed || !Array.isArray(parsed.pages)) return null

    return {
      pages: parsed.pages
        .map((page) => ({
          pageNumber: Number(page?.pageNumber ?? 0),
          pageClass: normalizePageClass(page?.pageClass),
          pageSubtype: normalizeNullableString(page?.pageSubtype, 120) ?? "BODY_PAGE",
          sheetNumber: normalizeSheetNumber(page?.sheetNumber),
          sheetTitle: normalizeNullableString(page?.sheetTitle, 180),
          discipline: normalizeDiscipline(page?.discipline),
          sectionNumber: normalizeNullableString(page?.sectionNumber, 60),
          sectionTitle: normalizeNullableString(page?.sectionTitle, 180),
          electricalRelevance: normalizeBooleanOrNull(page?.electricalRelevance),
          structuralRole: normalizeStructuralRole(page?.structuralRole),
          sectionSignalStrength: normalizeSignalStrength(page?.sectionSignalStrength),
          packetSignalStrength: normalizeSignalStrength(page?.packetSignalStrength),
          isLikelySectionStart: Boolean(page?.isLikelySectionStart),
          isLikelySectionContinuation: Boolean(page?.isLikelySectionContinuation),
          isLikelySectionEnd: Boolean(page?.isLikelySectionEnd),
          isLikelyPacketStart: Boolean(page?.isLikelyPacketStart),
          isLikelyPacketContinuation: Boolean(page?.isLikelyPacketContinuation),
          isLikelyPacketEnd: Boolean(page?.isLikelyPacketEnd),
          confidence: normalizeConfidence(page?.confidence),
          reviewRequired: Boolean(page?.reviewRequired),
          evidence: normalizeNullableString(page?.evidence, 240),
        }))
        .filter((page) => Number.isFinite(page.pageNumber) && page.pageNumber > 0),
    }
  } catch {
    return null
  }
}

function isMeaningfulEvidence(value: string | null) {
  if (!value) return false
  const lower = value.trim().toLowerCase()

  if (!lower) return false
  if (lower === "n/a") return false
  if (lower === "unknown") return false
  if (lower === "uncertain") return false
  if (lower.includes("did not return a usable result")) return false

  return true
}

function cleanIdentityValue(value: string | null | undefined) {
  if (!value) return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  return cleaned.length ? cleaned : null
}

function mergeDeterministicEvidence(existing: string | null | undefined, note: string): string {
  const e = existing?.trim()
  if (!e) return note
  return e.includes("Deterministic title-block assist") ? e : `${e} ${note}`
}

function mergeRegistryAssistEvidence(existing: string | null | undefined, note: string): string {
  const e = existing?.trim()
  if (!e) return note
  return e.includes("Drawing registry assist used") ? e : `${e} ${note}`
}

function drawingExemptFromLowAiConfidenceThreshold(
  row: IntakeAiPageResult,
  prepared: IntakePreparedPage | undefined,
): boolean {
  if (row.pageClass !== "DRAWING") return false
  if (row.confidence < 0.88 || row.confidence >= REVIEW_CONFIDENCE_THRESHOLD) return false
  if (!cleanIdentityValue(row.sheetNumber)) return false

  const hint = prepared?.drawingIdentityHints
  if (!hint) return false

  const titleOk =
    hint.titleRegistryValidated === true || hint.sheetTitleTitleBlockPreferred === true

  if (hint.registryValidated === true && titleOk) {
    return true
  }

  return hint.confidence >= 0.9
}

function getPreparedPrimaryText(prepared: IntakePreparedPage | undefined) {
  if (!prepared) return ""
  const raw = prepared.rawText.normalizedText?.trim() ?? ""
  const ocr = prepared.ocrText.normalizedText?.trim() ?? ""
  return raw.length >= ocr.length ? raw : ocr
}

function getPreparedLeadingText(prepared: IntakePreparedPage | undefined, maxLines = 6) {
  if (!prepared) return ""
  return prepared.rawText.lines
    .slice(0, maxLines)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasSubstantiveText(prepared: IntakePreparedPage | undefined) {
  const text = getPreparedPrimaryText(prepared)
  if (text.length >= 40) return true
  if ((prepared?.pdfFacts.textDensity ?? 0) > 0.001) return true
  return false
}

function isPdfOrdinalLikeLabel(
  label: string | null,
  pageNumber: number,
  totalPages: number,
) {
  if (!label) return false
  const normalized = label.replace(/\s+/g, " ").trim().toLowerCase()

  if (!normalized) return false
  if (normalized === String(pageNumber)) return true
  if (normalized === `pdf page ${pageNumber}`) return true
  if (normalized === `${pageNumber} of ${totalPages}`) return true
  if (normalized === `${pageNumber}/${totalPages}`) return true
  if (normalized === `page ${pageNumber} of ${totalPages}`) return true
  if (normalized === `page ${pageNumber}/${totalPages}`) return true

  return false
}

function isMeaningfulPagePositionLabel(label: string | null) {
  if (!label) return false
  const normalized = label.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normalized) return false

  return (
    /^page\s+\d+\s*(?:of|\/)\s*\d+$/i.test(normalized) ||
    /^\d+\s*(?:of|\/)\s*\d+$/i.test(normalized)
  )
}

function suppressNonDrawingPageLabel(
  label: string | null,
  pageNumber: number,
  totalPages: number,
) {
  if (!label) return null
  if (isPdfOrdinalLikeLabel(label, pageNumber, totalPages)) return null
  return label
}

function stripFakePdfPrefixFromTitle(
  title: string | null,
  pageNumber: number,
  totalPages: number,
) {
  if (!title) return null

  let next = title.trim()

  const exactPrefixes = [
    new RegExp(`^${pageNumber}\\s*[—-]\\s*`, "i"),
    new RegExp(`^page\\s+${pageNumber}\\s*[—-]\\s*`, "i"),
    new RegExp(`^${pageNumber}\\s*(?:of|/)\\s*${totalPages}\\s*[—-]\\s*`, "i"),
    new RegExp(`^page\\s+${pageNumber}\\s*(?:of|/)\\s*${totalPages}\\s*[—-]\\s*`, "i"),
  ]

  for (const pattern of exactPrefixes) {
    next = next.replace(pattern, "").trim()
  }

  if (isPdfOrdinalLikeLabel(next, pageNumber, totalPages)) {
    return null
  }

  if (!next) return null
  return next
}

function titleImpliesBlank(title: string | null) {
  const lower = title?.trim().toLowerCase() ?? ""
  if (!lower) return false
  return (
    lower.includes("intentionally left blank") ||
    lower === "blank page" ||
    lower === "blank"
  )
}

function hasMeaningfulStructureSignals(prepared: IntakePreparedPage | undefined) {
  if (!prepared) return false

  return Boolean(
    prepared.specSignals.detectedSectionNumber ||
      prepared.specSignals.detectedSectionTitle ||
      prepared.specSignals.headerHint ||
      prepared.specSignals.footerHint ||
      prepared.specSignals.likelySpecSectionStart ||
      prepared.specSignals.likelySpecContinuation ||
      prepared.specSignals.likelyIndexOrTocPage ||
      prepared.specSignals.likelyFrontEndPage,
  )
}

function isOrdinalMarkerOnly(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

  if (!normalized) return false

  return (
    /^-*\s*\d+\s*(?:of|\/)\s*\d+\s*-*$/i.test(normalized) ||
    /^page\s+\d+\s*(?:of|\/)\s*\d+$/i.test(normalized) ||
    /^pdf page \d+$/i.test(normalized)
  )
}

function classifySparseNonDrawingPage(
  pageClass: IntakePageClass,
  pageSubtype: string,
  sheetTitle: string | null,
  sectionTitle: string | null,
  prepared: IntakePreparedPage | undefined,
): SparseNonDrawingClassification {
  if (pageClass === "DRAWING") return "NOT_BLANK"
  if (pageClass === "BLANK_PAGE") return "TRUE_BLANK"

  const primaryText = getPreparedPrimaryText(prepared)
  const leadingText = getPreparedLeadingText(prepared)
  const combinedIdentity = [
    sheetTitle,
    sectionTitle,
    prepared?.specSignals.detectedSectionTitle ?? null,
    prepared?.specSignals.headerHint ?? null,
    prepared?.specSignals.footerHint ?? null,
    leadingText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const lowDensity = (prepared?.pdfFacts.textDensity ?? 0) < 0.0005
  const noExtractedText = prepared?.extractionWarnings.includes("NO_EXTRACTED_TEXT") === true
  const veryLowText = primaryText.length < 20
  const lowText = primaryText.length < 60
  const noUsableText =
    primaryText.replace(/\s+/g, "").length === 0 &&
    leadingText.replace(/\s+/g, "").length === 0
  const sparseSignal = prepared?.specSignals.likelyBlankOrDividerPage === true
  const structureSignals = hasMeaningfulStructureSignals(prepared)

  const explicitBlank =
    titleImpliesBlank(sheetTitle) ||
    combinedIdentity.includes("intentionally left blank") ||
    combinedIdentity.includes("this page intentionally left blank")

  const ordinalMarkerOnly =
    isOrdinalMarkerOnly(sheetTitle) ||
    isOrdinalMarkerOnly(leadingText) ||
    (combinedIdentity.length > 0 && isOrdinalMarkerOnly(combinedIdentity))

  const dividerLikeSignal =
    prepared?.specSignals.likelySpecSectionStart === true ||
    Boolean(prepared?.specSignals.detectedSectionNumber) ||
    Boolean(prepared?.specSignals.detectedSectionTitle) ||
    prepared?.specSignals.likelyIndexOrTocPage === true ||
    pageSubtype.toUpperCase().includes("SECTION_DIVIDER") ||
    pageSubtype.toUpperCase().includes("TITLE_PAGE") ||
    pageSubtype.toUpperCase().includes("TABLE_OF_CONTENTS") ||
    pageSubtype.toUpperCase().includes("INDEX_PAGE") ||
    combinedIdentity.includes("table of contents") ||
    combinedIdentity.includes("contents") ||
    combinedIdentity.includes("index") ||
    combinedIdentity.includes("division ") ||
    combinedIdentity.includes("section ") ||
    combinedIdentity.includes("procurement requirements") ||
    combinedIdentity.includes("contracting requirements")

  if (explicitBlank) {
    return "TRUE_BLANK"
  }

  if ((noUsableText || ordinalMarkerOnly) && !structureSignals) {
    return "TRUE_BLANK"
  }

  if (dividerLikeSignal) {
    return "DIVIDER_LIKE"
  }

  if (sparseSignal && (veryLowText || lowDensity || noExtractedText)) {
    if (structureSignals) {
      return "LOW_CONTENT_MEANINGFUL"
    }

    if (veryLowText && (lowDensity || noExtractedText)) {
      return "TRUE_BLANK"
    }
  }

  if ((lowText || lowDensity) && structureSignals) {
    return "LOW_CONTENT_MEANINGFUL"
  }

  return "NOT_BLANK"
}

function inferNonDrawingClass(
  currentClass: IntakePageClass,
  pageSubtype: string,
  sheetTitle: string | null,
  sectionTitle: string | null,
  prepared: IntakePreparedPage | undefined,
) {
  if (currentClass === "DRAWING" || currentClass === "BLANK_PAGE") {
    return currentClass
  }

  const parts = [
    pageSubtype,
    sheetTitle,
    sectionTitle,
    prepared?.specSignals.detectedSectionTitle ?? null,
    prepared?.specSignals.headerHint ?? null,
    prepared?.specSignals.footerHint ?? null,
    ...((prepared?.rawText.lines ?? []).slice(0, 4)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const bidKeywords = [
    "advertisement for bids",
    "instructions to bidders",
    "supplementary instructions to bidders",
    "compliance statement",
    "bid form",
    "bid bond",
    "legal status of bidder",
    "qualifications statement",
    "certification regarding debarment",
    "certification for contracts grants and loans",
    "notice of award",
    "agreement between owner and contractor",
    "notice to proceed",
    "performance bond",
    "payment bond",
    "application for payment",
    "certificate of substantial completion",
    "notice of acceptability of work",
    "general conditions",
    "supplementary conditions",
    "procurement requirements",
    "contracting requirements",
  ]

  if (bidKeywords.some((keyword) => parts.includes(keyword))) {
    return "BID_DOCUMENT" as const
  }

  const likelySpec =
    prepared?.specSignals.likelySpecSectionStart ||
    prepared?.specSignals.likelySpecContinuation ||
    Boolean(prepared?.specSignals.detectedSectionNumber) ||
    (Boolean(prepared?.specSignals.detectedSectionTitle) &&
      !prepared?.specSignals.likelyFrontEndPage)

  if (likelySpec) {
    return "SPECIFICATION" as const
  }

  return currentClass
}

function hasStrongNonDrawingIdentity(
  pageClass: IntakePageClass,
  sheetTitle: string | null,
  sectionTitle: string | null,
  prepared: IntakePreparedPage | undefined,
) {
  if (pageClass === "DRAWING" || pageClass === "BLANK_PAGE") return false

  const title = cleanIdentityValue(sheetTitle) ?? cleanIdentityValue(sectionTitle)
  if (!title) return false

  if (title.toLowerCase() === "body page") return false

  return hasSubstantiveText(prepared) || Boolean(prepared?.specSignals.headerHint)
}

function pageNeedsIdentityButLacksIt(
  pageClass: IntakePageClass,
  sheetNumber: string | null,
  sheetTitle: string | null,
) {
  if (pageClass !== "DRAWING") return false
  return !sheetNumber && !sheetTitle
}

function normalizeNonDrawingSubtype(
  currentSubtype: string,
  pageClass: IntakePageClass,
  sheetTitle: string | null,
  sectionNumber: string | null,
  sectionTitle: string | null,
  prepared: IntakePreparedPage | undefined,
  structuralRole: IntakeStructuralRole | null,
): string {
  if (pageClass === "DRAWING") return currentSubtype
  if (pageClass === "BLANK_PAGE") return "BLANK_PAGE"

  const upperSubtype = currentSubtype.trim().toUpperCase() || "BODY_PAGE"
  const combined = [
    sheetTitle,
    sectionTitle,
    prepared?.specSignals.detectedSectionTitle ?? null,
    prepared?.specSignals.headerHint ?? null,
    prepared?.specSignals.footerHint ?? null,
    getPreparedLeadingText(prepared),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (
    structuralRole === "TABLE_OF_CONTENTS" ||
    prepared?.specSignals.likelyIndexOrTocPage ||
    upperSubtype.includes("TABLE_OF_CONTENTS") ||
    combined.includes("table of contents")
  ) {
    return "TABLE_OF_CONTENTS"
  }

  if (
    structuralRole === "INDEX_PAGE" ||
    upperSubtype.includes("INDEX") ||
    (combined.includes("index") && !combined.includes("index of drawings"))
  ) {
    return "INDEX_PAGE"
  }

  if (
    structuralRole === "SECTION_START" ||
    structuralRole === "SECTION_CONTINUATION" ||
    structuralRole === "PART_HEADER" ||
    prepared?.specSignals.likelySpecSectionStart ||
    Boolean(sectionNumber) ||
    Boolean(sectionTitle) ||
    upperSubtype.includes("SECTION_DIVIDER")
  ) {
    return hasSubstantiveText(prepared) ? "BODY_PAGE" : "SECTION_DIVIDER"
  }

  if (
    structuralRole === "TITLE_PAGE" ||
    upperSubtype.includes("TITLE_PAGE") ||
    upperSubtype.includes("COVER") ||
    combined.includes("project manual") ||
    combined.includes("specifications") ||
    combined.includes("volume ") ||
    combined.includes("division ")
  ) {
    return "TITLE_PAGE"
  }

  if (
    structuralRole === "FORM_PAGE" ||
    (prepared?.specSignals.likelyFrontEndPage && !hasSubstantiveText(prepared))
  ) {
    return "FORM_PAGE"
  }

  return upperSubtype
}

function normalizeComparableNonDrawingTitle(title: string | null) {
  const cleaned = cleanIdentityValue(title)
  if (!cleaned) return null

  return cleaned
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/^\d+\s*[—-]\s*/i, "")
    .replace(/^page\s+\d+\s*[—-]\s*/i, "")
    .trim()
    .toLowerCase()
}

function isWeakNonDrawingTitle(title: string | null) {
  const lower = title?.trim().toLowerCase() ?? ""
  if (!lower) return true

  if (lower === "body page") return true
  if (lower === "section divider") return true
  if (lower === "title page") return true
  if (lower === "form page") return true
  if (lower === "null") return true
  if (lower.startsWith("pdf page ")) return true
  if (/^page\s+\d+$/i.test(lower)) return true
  if (/^page\s+\d+\s*(?:of|\/)\s*\d+$/i.test(lower)) return true
  if (/^-*\s*\d+\s*(?:of|\/)\s*\d+\s*-*$/i.test(lower)) return true
  if (/^[\d\W]+$/.test(lower)) return true

  return false
}

function normalizeTitleCandidate(
  value: string | null | undefined,
  pageNumber: number,
  totalPages: number,
) {
  const cleaned = cleanIdentityValue(value)
  if (!cleaned) return null

  const stripped = stripFakePdfPrefixFromTitle(cleaned, pageNumber, totalPages)
  if (!stripped) return null
  if (isWeakNonDrawingTitle(stripped)) return null
  if (titleImpliesBlank(stripped)) return null

  return compactText(stripped, 180)
}

function inferSpecificNonDrawingTitle(
  page: IntakeNormalizedPage,
  prepared: IntakePreparedPage | undefined,
  totalPages: number,
) {
  if (page.final.pageClass === "DRAWING" || page.final.pageClass === "BLANK_PAGE") {
    return cleanIdentityValue(page.final.sheetTitle)
  }

  const sectionTitleCandidate = normalizeTitleCandidate(
    cleanIdentityValue(page.final.sectionTitle) ??
      cleanIdentityValue(prepared?.specSignals.detectedSectionTitle),
    page.pageNumber,
    totalPages,
  )

  if (sectionTitleCandidate && page.final.pageClass === "SPECIFICATION") {
    return sectionTitleCandidate
  }

  const lines = [
    prepared?.specSignals.headerHint ?? null,
    prepared?.specSignals.detectedSectionTitle ?? null,
    ...((prepared?.rawText.lines ?? []).slice(0, 10)),
    prepared?.specSignals.footerHint ?? null,
  ]

  const strongKeywords = [
    "application for payment",
    "stored materials summary",
    "unit price work",
    "lump sum work",
    "schedule of values",
    "advertisement for bids",
    "instructions to bidders",
    "bid bond",
    "procurement requirements",
    "contracting requirements",
    "general conditions",
    "supplementary conditions",
    "table of contents",
    "specifications",
    "notice of award",
    "notice to proceed",
    "certificate of substantial completion",
    "qualifications statement",
  ]

  let fallback: string | null = null

  for (const rawCandidate of lines) {
    const candidate = normalizeTitleCandidate(rawCandidate, page.pageNumber, totalPages)
    if (!candidate) continue

    const lower = candidate.toLowerCase()
    if (strongKeywords.some((keyword) => lower.includes(keyword))) {
      return candidate
    }

    if (!fallback) {
      fallback = candidate
    }
  }

  return fallback
}

function getBasePacketTitle(page: IntakeNormalizedPage | null) {
  if (!page) return null
  if (page.final.pageClass === "DRAWING" || page.final.pageClass === "BLANK_PAGE") return null

  const title =
    cleanIdentityValue(page.final.sheetTitle) ?? cleanIdentityValue(page.final.sectionTitle)
  if (!title || isWeakNonDrawingTitle(title)) return null

  return title
}

function stripTrailingDateNoise(value: string | null | undefined) {
  const cleaned = cleanIdentityValue(value)
  if (!cleaned) return null

  let next = cleaned

  next = next.replace(
    /\s*[—–-]?\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},\s+\d{4}$/i,
    "",
  )
  next = next.replace(/\s*[—–-]?\s*\d{1,2}\/\d{1,2}\/\d{2,4}$/i, "")
  next = next.replace(/\s*[—–-]?\s*\d{4}-\d{2}-\d{2}$/i, "")
  next = next.trim()

  return next || null
}

function stripPagePositionSuffix(value: string | null | undefined) {
  const cleaned = cleanIdentityValue(value)
  if (!cleaned) return null

  const next = cleaned
    .replace(/\s*[—–-]\s*page\s+\d+\s*(?:of|\/)\s*\d+$/i, "")
    .replace(/\s*[—–-]\s*\d+\s*(?:of|\/)\s*\d+$/i, "")
    .trim()

  return next || cleaned
}

function buildSectionDisplayTitle(
  sectionNumber: string | null,
  sectionTitle: string | null,
) {
  const cleanedNumber = cleanIdentityValue(sectionNumber)
  const cleanedTitle = stripTrailingDateNoise(sectionTitle)

  if (cleanedNumber && cleanedTitle) {
    return `${cleanedNumber} — ${cleanedTitle}`
  }

  if (cleanedTitle) return cleanedTitle
  if (cleanedNumber) return cleanedNumber
  return null
}

function mergeBaseTitleWithPageLabel(
  baseTitle: string | null,
  pageLabel: string | null,
) {
  const cleanedBase = cleanIdentityValue(baseTitle)
  const cleanedLabel = cleanIdentityValue(pageLabel)

  if (!cleanedBase) return cleanedLabel
  if (!cleanedLabel) return cleanedBase

  const lowerBase = cleanedBase.toLowerCase()
  const lowerLabel = cleanedLabel.toLowerCase()

  if (lowerBase.includes(lowerLabel)) {
    return cleanedBase
  }

  return `${cleanedBase} — ${cleanedLabel}`
}

function hasStrongAiContinuitySignals(row: IntakeAiPageResult) {
  return (
    row.sectionSignalStrength === "STRONG" ||
    row.sectionSignalStrength === "MEDIUM" ||
    row.packetSignalStrength === "STRONG" ||
    row.packetSignalStrength === "MEDIUM" ||
    row.isLikelySectionStart ||
    row.isLikelySectionContinuation ||
    row.isLikelyPacketStart ||
    row.isLikelyPacketContinuation
  )
}

function hasStrongNormalizedContinuity(page: IntakeNormalizedPage) {
  return (
    page.aiSignals.sectionSignalStrength === "STRONG" ||
    page.aiSignals.sectionSignalStrength === "MEDIUM" ||
    page.aiSignals.packetSignalStrength === "STRONG" ||
    page.aiSignals.packetSignalStrength === "MEDIUM" ||
    page.aiSignals.isLikelySectionStart ||
    page.aiSignals.isLikelySectionContinuation ||
    page.aiSignals.isLikelyPacketStart ||
    page.aiSignals.isLikelyPacketContinuation
  )
}

function removeResolvedNonDrawingReviewNoise(
  page: IntakeNormalizedPage,
  prepared: IntakePreparedPage | undefined,
) {
  if (page.final.pageClass === "DRAWING") return page

  if (page.final.pageClass === "BLANK_PAGE") {
    return {
      ...page,
      confidence: {
        overall: 1,
      },
      review: {
        status: "NOT_REQUIRED" as const,
        reasons: [],
      },
    }
  }

  const strongIdentity = hasStrongNonDrawingIdentity(
    page.final.pageClass,
    page.final.sheetTitle,
    page.final.sectionTitle,
    prepared,
  )
  const strongContinuity = hasStrongNormalizedContinuity(page)

  if (!strongIdentity && !strongContinuity) return page

  const filteredReasons = page.review.reasons.filter(
    (reason) =>
      ![
        "ROUTE_CLASS_MISMATCH",
        "WEAK_CLASSIFICATION_EVIDENCE",
        "VERY_LOW_TEXT_SUPPORT",
        "AI_CONFIDENCE_BELOW_THRESHOLD",
      ].includes(reason),
  )

  const nextStatus: IntakeNormalizedPage["review"]["status"] =
    filteredReasons.length > 0 ? "REVIEW_REQUIRED" : "NOT_REQUIRED"

  return {
    ...page,
    review: {
      status: nextStatus,
      reasons: filteredReasons,
    },
  }
}

function shouldCarryForwardPacketIdentity(
  previousPage: IntakeNormalizedPage | null,
  currentPage: IntakeNormalizedPage,
  preparedCurrent: IntakePreparedPage | undefined,
) {
  if (!previousPage) return false
  if (previousPage.final.pageClass !== currentPage.final.pageClass) return false
  if (currentPage.final.pageClass === "DRAWING") return false
  if (currentPage.final.pageClass === "BLANK_PAGE") return false

  const previousTitle = getBasePacketTitle(previousPage)
  const currentTitle = cleanIdentityValue(currentPage.final.sheetTitle)

  if (!previousTitle) return false
  if (currentTitle && !isWeakNonDrawingTitle(currentTitle)) return false

  if (
    currentPage.final.pageClass === "SPECIFICATION" &&
    (currentPage.aiSignals.isLikelySectionStart || preparedCurrent?.specSignals.likelySpecSectionStart)
  ) {
    return false
  }

  if (
    previousPage.final.sectionNumber &&
    currentPage.final.sectionNumber &&
    previousPage.final.sectionNumber !== currentPage.final.sectionNumber
  ) {
    return false
  }

  if (currentPage.aiSignals.isLikelyPacketContinuation) return true
  if (isMeaningfulPagePositionLabel(currentPage.final.sheetNumber)) return true

  return Boolean(
    preparedCurrent?.specSignals.likelyFrontEndPage ||
      preparedCurrent?.specSignals.likelySpecContinuation,
  )
}

function finalizeBlankPage(page: IntakeNormalizedPage): IntakeNormalizedPage {
  return {
    ...page,
    final: {
      ...page.final,
      pageClass: "BLANK_PAGE",
      pageSubtype: "BLANK_PAGE",
      sheetNumber: null,
      sheetTitle: "Blank Page",
      discipline: null,
      sectionNumber: null,
      sectionTitle: null,
      electricalRelevance: null,
      scaleStatus: "NO_SCALE_NEEDED",
      scaleConfidence: 100,
    },
    aiSignals: {
      ...page.aiSignals,
      structuralRole: "BLANK_PAGE" as const,
      sectionSignalStrength: "NONE",
      packetSignalStrength: "NONE",
      isLikelySectionStart: false,
      isLikelySectionContinuation: false,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    confidence: {
      overall: 1,
    },
    review: {
      status: "NOT_REQUIRED",
      reasons: [],
    },
    anchor: null,
  }
}

function reconcileAdjacentNonDrawingPages(
  pages: IntakeNormalizedPage[],
  preparedPages: IntakePreparedPage[],
): IntakeNormalizedPage[] {
  const preparedByPage = new Map<number, IntakePreparedPage>()
  for (const page of preparedPages) {
    preparedByPage.set(page.pageNumber, page)
  }

  const totalPages = preparedPages.length

  const reconciled: IntakeNormalizedPage[] = pages.map((page) => ({
    ...page,
    final: { ...page.final },
    aiSignals: { ...page.aiSignals },
    confidence: { ...page.confidence },
    review: {
      status: page.review.status,
      reasons: [...page.review.reasons],
    },
    anchor: page.anchor
      ? {
          ...page.anchor,
        }
      : null,
  }))

  let activeSpecSectionNumber: string | null = null
  let activeSpecSectionTitle: string | null = null

  for (let index = 0; index < reconciled.length; index += 1) {
    const current = reconciled[index]
    const previous = index > 0 ? reconciled[index - 1] : null
    const preparedCurrent = preparedByPage.get(current.pageNumber)

    const sparseClassification = classifySparseNonDrawingPage(
      current.final.pageClass,
      current.final.pageSubtype,
      current.final.sheetTitle,
      current.final.sectionTitle,
      preparedCurrent,
    )

    if (current.final.pageClass === "BLANK_PAGE" || sparseClassification === "TRUE_BLANK") {
      reconciled[index] = finalizeBlankPage(current)
      continue
    }

    if (current.final.pageClass === "DRAWING") {
      activeSpecSectionNumber = null
      activeSpecSectionTitle = null
      continue
    }

    const inferredTitle = inferSpecificNonDrawingTitle(current, preparedCurrent, totalPages)

    if ((!current.final.sheetTitle || isWeakNonDrawingTitle(current.final.sheetTitle)) && inferredTitle) {
      current.final.sheetTitle = inferredTitle
    }

    const previousBaseTitle = getBasePacketTitle(previous)

    if (shouldCarryForwardPacketIdentity(previous, current, preparedCurrent) && previousBaseTitle) {
      current.final.sheetTitle = previousBaseTitle
    } else if (previous) {
      const previousComparable = normalizeComparableNonDrawingTitle(previous.final.sheetTitle)
      const currentComparable = normalizeComparableNonDrawingTitle(current.final.sheetTitle)

      if (
        previousComparable &&
        currentComparable &&
        previousComparable === currentComparable &&
        !cleanIdentityValue(current.final.sheetTitle)
      ) {
        current.final.sheetTitle = getBasePacketTitle(previous)
      }
    }

    current.final.sheetTitle =
      stripFakePdfPrefixFromTitle(
        cleanIdentityValue(current.final.sheetTitle),
        current.pageNumber,
        totalPages,
      ) ?? current.final.sheetTitle

    current.final.sectionTitle = stripTrailingDateNoise(current.final.sectionTitle)

    if (current.final.pageClass === "SPECIFICATION") {
      const sectionStart =
        current.aiSignals.isLikelySectionStart ||
        current.aiSignals.structuralRole === "SECTION_START" ||
        current.aiSignals.structuralRole === "DIVISION_HEADER"

      const sectionContinuation =
        current.aiSignals.isLikelySectionContinuation ||
        current.aiSignals.structuralRole === "SECTION_CONTINUATION" ||
        current.aiSignals.structuralRole === "PART_HEADER"

      if (sectionStart) {
        activeSpecSectionNumber = current.final.sectionNumber ?? activeSpecSectionNumber
        activeSpecSectionTitle = current.final.sectionTitle ?? activeSpecSectionTitle
      }

      if (!current.final.sectionNumber && activeSpecSectionNumber && sectionContinuation) {
        current.final.sectionNumber = activeSpecSectionNumber
      }

      if (!current.final.sectionTitle && activeSpecSectionTitle && sectionContinuation) {
        current.final.sectionTitle = activeSpecSectionTitle
      }

      if (
        !current.final.sectionNumber &&
        !current.final.sectionTitle &&
        (sectionContinuation ||
          current.aiSignals.sectionSignalStrength === "MEDIUM" ||
          current.aiSignals.sectionSignalStrength === "STRONG")
      ) {
        current.final.sectionNumber = activeSpecSectionNumber
        current.final.sectionTitle = activeSpecSectionTitle
      }

      if (current.final.sectionNumber) {
        activeSpecSectionNumber = current.final.sectionNumber
      }
      if (current.final.sectionTitle) {
        activeSpecSectionTitle = current.final.sectionTitle
      }

      if (
        current.aiSignals.isLikelySectionEnd ||
        current.aiSignals.structuralRole === "SECTION_END"
      ) {
        activeSpecSectionNumber = null
        activeSpecSectionTitle = null
      }

      const sectionDisplayTitle = buildSectionDisplayTitle(
        current.final.sectionNumber,
        current.final.sectionTitle,
      )

      const pagePositionLabel = isMeaningfulPagePositionLabel(current.final.sheetNumber)
        ? current.final.sheetNumber
        : null

      if (sectionDisplayTitle) {
        current.final.sheetTitle = mergeBaseTitleWithPageLabel(
          sectionDisplayTitle,
          pagePositionLabel,
        )
      }
    } else {
      activeSpecSectionNumber = null
      activeSpecSectionTitle = null

      if (
        current.final.pageClass === "BID_DOCUMENT" ||
        current.final.pageClass === "GENERAL_DOCUMENT"
      ) {
        const packetBaseTitle = stripPagePositionSuffix(getBasePacketTitle(current))
        const pagePositionLabel = isMeaningfulPagePositionLabel(current.final.sheetNumber)
          ? current.final.sheetNumber
          : null

        if (packetBaseTitle) {
          current.final.sheetTitle = mergeBaseTitleWithPageLabel(
            packetBaseTitle,
            pagePositionLabel,
          )
        }
      }
    }

    const cleanedPage = removeResolvedNonDrawingReviewNoise(current, preparedCurrent)
    reconciled[index] = cleanedPage
  }

  return reconciled
}

function buildReviewReasons(
  row: IntakeAiPageResult,
  prepared: IntakePreparedPage | undefined,
): string[] {
  const reasons: string[] = []

  const strongAiContinuity = hasStrongAiContinuitySignals(row)
  const strongTextSupport = hasSubstantiveText(prepared)

  if (row.pageClass === "DRAWING") {
    if (
      row.confidence < REVIEW_CONFIDENCE_THRESHOLD &&
      !drawingExemptFromLowAiConfidenceThreshold(row, prepared)
    ) {
      reasons.push("AI_CONFIDENCE_BELOW_THRESHOLD")
    }
  } else {
    if (row.confidence < 0.6 && !strongAiContinuity && !strongTextSupport) {
      reasons.push("AI_CONFIDENCE_BELOW_THRESHOLD")
    }
  }

  if (pageNeedsIdentityButLacksIt(row.pageClass, row.sheetNumber, row.sheetTitle)) {
    reasons.push("DRAWING_IDENTITY_MISSING")
  }

  const drawingSheetNumberEmpty = !row.sheetNumber?.trim()
  const drawingSheetTitleEmpty = !row.sheetTitle?.trim()

  if (
    row.pageClass === "DRAWING" &&
    (drawingSheetNumberEmpty || drawingSheetTitleEmpty) &&
    row.confidence < 0.95
  ) {
    reasons.push("DRAWING_IDENTITY_INCOMPLETE")
  }

  if (
    row.pageClass === "DRAWING" &&
    prepared?.routing.likelyType === "DRAWING" &&
    drawingSheetNumberEmpty
  ) {
    reasons.push("DRAWING_SHEET_NUMBER_MISSING")
  }

  if (row.pageClass === "DRAWING" && !row.discipline && row.confidence < 0.95) {
    reasons.push("DRAWING_DISCIPLINE_UNCLEAR")
  }

  if (!isMeaningfulEvidence(row.evidence) && row.confidence < 0.95 && row.pageClass === "DRAWING") {
    reasons.push("WEAK_CLASSIFICATION_EVIDENCE")
  }

  const veryLowTextSupport =
    ((prepared?.pdfFacts.textDensity ?? 1) < 0.0005 && row.confidence < 0.7) ||
    (prepared?.extractionWarnings?.includes("NO_EXTRACTED_TEXT") === true &&
      row.confidence < 0.7)

  if (
    row.pageClass === "DRAWING" ||
    (!strongAiContinuity && !strongTextSupport && veryLowTextSupport)
  ) {
    if ((prepared?.pdfFacts.textDensity ?? 1) < 0.0005 && row.confidence < 0.7) {
      reasons.push("VERY_LOW_TEXT_SUPPORT")
    }

    if (prepared?.extractionWarnings?.includes("NO_EXTRACTED_TEXT") && row.confidence < 0.7) {
      reasons.push("NO_EXTRACTED_TEXT")
    }
  }

  if (
    prepared?.extractionWarnings?.includes("OCR_RECOMMENDED") &&
    row.confidence < 0.65 &&
    (veryLowTextSupport || !isMeaningfulEvidence(row.evidence))
  ) {
    reasons.push("OCR_RECOMMENDED")
  }

  if (prepared?.routing.likelyType === "UNKNOWN" && row.confidence < 0.75) {
    reasons.push("ROUTING_UNCERTAIN")
  }

  if (
    prepared?.routing.likelyType === "DRAWING" &&
    row.pageClass !== "DRAWING" &&
    row.confidence < 0.7 &&
    !strongAiContinuity
  ) {
    reasons.push("ROUTE_CLASS_MISMATCH")
  }

  if (
    prepared?.specSignals.likelySpecSectionStart &&
    row.pageClass !== "SPECIFICATION" &&
    row.pageClass !== "BID_DOCUMENT" &&
    row.pageClass !== "GENERAL_DOCUMENT" &&
    row.confidence < 0.8
  ) {
    reasons.push("SPEC_SIGNAL_CLASS_MISMATCH")
  }

  if (prepared?.extractionWarnings?.includes("SPEC_SECTION_START_SIGNAL")) {
    reasons.push("SPEC_SECTION_START_SIGNAL")
  }

  return Array.from(new Set(reasons))
}

function shouldRequireReview(
  row: IntakeAiPageResult,
  reviewReasons: string[],
  prepared: IntakePreparedPage | undefined,
): boolean {
  const materialReasons = reviewReasons.filter(
    (reason) => reason !== "SPEC_SECTION_START_SIGNAL",
  )

  if (row.pageClass === "BLANK_PAGE") {
    return false
  }

  if (row.pageClass === "DRAWING") {
    const confidenceBlocksReview =
      row.confidence < REVIEW_CONFIDENCE_THRESHOLD &&
      !drawingExemptFromLowAiConfidenceThreshold(row, prepared)
    return materialReasons.length > 0 || confidenceBlocksReview
  }

  if (!materialReasons.length) {
    return false
  }

  const strongIdentity = hasStrongNonDrawingIdentity(
    row.pageClass,
    row.sheetTitle,
    row.sectionTitle,
    prepared,
  )
  const strongContinuity = hasStrongAiContinuitySignals(row)

  const seriousReasons = materialReasons.filter((reason) =>
    [
      "NO_EXTRACTED_TEXT",
      "OCR_RECOMMENDED",
      "ROUTING_UNCERTAIN",
      "ROUTE_CLASS_MISMATCH",
      "SPEC_SIGNAL_CLASS_MISMATCH",
    ].includes(reason),
  )

  if ((strongIdentity || strongContinuity) && seriousReasons.length === 0 && row.confidence >= 0.58) {
    return false
  }

  if (row.pageClass === "SPECIFICATION") {
    if (strongIdentity || strongContinuity) {
      return row.confidence < 0.45 || seriousReasons.length > 0
    }
    return row.confidence < 0.55 || seriousReasons.length > 0 || row.reviewRequired
  }

  if (row.pageClass === "BID_DOCUMENT" || row.pageClass === "GENERAL_DOCUMENT") {
    if (strongIdentity || strongContinuity) {
      return row.confidence < 0.42 || seriousReasons.length > 0
    }
    return row.confidence < 0.5 || seriousReasons.length > 0 || row.reviewRequired
  }

  return true
}

function readHeaderValue(headers: unknown, key: string): string | null {
  if (!headers) {
    return null
  }

  const lowerKey = key.toLowerCase()

  if (typeof (headers as any).get === "function") {
    const value = (headers as any).get(key) ?? (headers as any).get(lowerKey)
    if (value != null) return String(value)
  }

  const asRecord = headers as Record<string, unknown>
  const direct = asRecord[key] ?? asRecord[lowerKey]
  if (direct != null) return String(direct)

  for (const [k, value] of Object.entries(asRecord)) {
    if (k.toLowerCase() === lowerKey && value != null) {
      return String(value)
    }
  }

  return null
}

function parseRetryAfterToMs(raw: string | null): number | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric * 1000)
  }

  const parsedDate = Date.parse(trimmed)
  if (Number.isFinite(parsedDate)) {
    const delta = parsedDate - Date.now()
    if (delta > 0) return delta
  }

  return null
}

function parseRateLimitDurationToMs(raw: string | null): number | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000)
  }

  const regex = /(\d+(?:\.\d+)?)(ms|s|m|h)/gi
  let totalMs = 0
  let matched = false

  for (const match of trimmed.matchAll(regex)) {
    matched = true
    const value = Number(match[1])
    const unit = String(match[2]).toLowerCase()

    if (!Number.isFinite(value)) continue

    if (unit === "ms") totalMs += value
    else if (unit === "s") totalMs += value * 1000
    else if (unit === "m") totalMs += value * 60_000
    else if (unit === "h") totalMs += value * 3_600_000
  }

  if (!matched || totalMs <= 0) return null
  return Math.round(totalMs)
}

function getRetryDelayMsFromError(error: any): number | null {
  const headers = error?.headers ?? error?.response?.headers ?? null

  const retryAfterMsHeader = readHeaderValue(headers, "retry-after-ms")
  const retryAfterHeader = readHeaderValue(headers, "retry-after")
  const remainingTokensHeader = readHeaderValue(headers, "x-ratelimit-remaining-tokens")
  const resetTokensHeader = readHeaderValue(headers, "x-ratelimit-reset-tokens")

  const remainingTokens = remainingTokensHeader == null ? NaN : Number(remainingTokensHeader)
  const resetTokensMs = parseRateLimitDurationToMs(resetTokensHeader)

  if (Number.isFinite(remainingTokens) && remainingTokens <= 0 && resetTokensMs != null) {
    return clamp(Math.round(resetTokensMs), 250, AI_MAX_BACKOFF_MS)
  }

  const retryAfterMs = retryAfterMsHeader ? Number(retryAfterMsHeader) : NaN
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return clamp(Math.round(retryAfterMs), 250, AI_MAX_BACKOFF_MS)
  }

  const retryAfter = parseRetryAfterToMs(retryAfterHeader)
  if (retryAfter != null) {
    return clamp(Math.round(retryAfter), 250, AI_MAX_BACKOFF_MS)
  }

  if (resetTokensMs != null) {
    return clamp(Math.round(resetTokensMs), 250, AI_MAX_BACKOFF_MS)
  }

  return null
}

function isRetryableAiError(error: any) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0)
  const code = String(error?.code ?? "").toLowerCase()
  const message = String(error?.message ?? "").toLowerCase()

  if (status === 429) return true
  if (status === 408) return true
  if (status >= 500 && status <= 599) return true

  if (code.includes("etimedout") || code.includes("timeout")) return true
  if (code.includes("econnreset") || code.includes("socket")) return true

  if (message.includes("rate limit")) return true
  if (message.includes("temporarily unavailable")) return true
  if (message.includes("timeout")) return true

  return false
}

function computeBackoffDelayMs(attemptIndex: number, error: any) {
  const fromHeader = getRetryDelayMsFromError(error)
  if (fromHeader != null) {
    return clamp(Math.round(fromHeader), 250, AI_MAX_BACKOFF_MS)
  }

  const base = Math.min(AI_BASE_BACKOFF_MS * 2 ** attemptIndex, AI_MAX_BACKOFF_MS)
  const jitter = Math.floor(Math.random() * 750)
  return Math.min(base + jitter, AI_MAX_BACKOFF_MS)
}

async function createChatCompletionWithRetry(
  client: OpenAI,
  request: Parameters<typeof client.chat.completions.create>[0],
  context: {
    uploadId: string
    chunkRoute: ChunkRoute
    firstPage: number | null
    lastPage: number | null
    pageCount: number
    estimatedTokens: number
  },
) {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt += 1) {
    try {
      if (attempt > 0) {
        console.log("runAiIntake:chunk:retryAttempt", {
          uploadId: context.uploadId,
          chunkRoute: context.chunkRoute,
          firstPage: context.firstPage,
          lastPage: context.lastPage,
          pageCount: context.pageCount,
          estimatedTokens: context.estimatedTokens,
          attempt,
          maxRetries: AI_MAX_RETRIES,
        })
      }

      return await client.chat.completions.create(request as any)
    } catch (error: any) {
      lastError = error

      const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0)
      const retryable = isRetryableAiError(error)

      if (!retryable || attempt >= AI_MAX_RETRIES) {
        console.error("runAiIntake:chunk:requestFailed", {
          uploadId: context.uploadId,
          chunkRoute: context.chunkRoute,
          firstPage: context.firstPage,
          lastPage: context.lastPage,
          pageCount: context.pageCount,
          estimatedTokens: context.estimatedTokens,
          attempt,
          maxRetries: AI_MAX_RETRIES,
          status: Number.isFinite(status) ? status : null,
          retryable,
          error: error?.message ?? String(error),
        })
        throw error
      }

      const delayMs = computeBackoffDelayMs(attempt, error)

      console.warn("runAiIntake:chunk:requestRetrying", {
        uploadId: context.uploadId,
        chunkRoute: context.chunkRoute,
        firstPage: context.firstPage,
        lastPage: context.lastPage,
        pageCount: context.pageCount,
        estimatedTokens: context.estimatedTokens,
        attempt,
        maxRetries: AI_MAX_RETRIES,
        status: Number.isFinite(status) ? status : null,
        delayMs,
        error: error?.message ?? String(error),
      })

      await sleep(delayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function filePathToDataUrl(imagePath: string): Promise<string | null> {
  try {
    const imageBytes = await fs.readFile(imagePath)
    const base64 = imageBytes.toString("base64")
    return `data:image/png;base64,${base64}`
  } catch (error: any) {
    console.warn("runAiIntake:image:readFailed", {
      imagePath,
      error: error?.message ?? String(error),
    })
    return null
  }
}

async function buildUserMessageContent(
  payload: ReturnType<typeof buildPromptPayload>,
  pages: IntakePreparedPage[],
  chunkRoute: ChunkRoute,
) {
  const content: Array<any> = []

  content.push({
    type: "text",
    text: JSON.stringify(payload),
  })

  // DEBUG: payload serialization and text-field sanity (remove after fixing 400)
  try {
    const serialized = JSON.stringify(payload)
    const payloadShape = {
      uploadId: payload.uploadId,
      chunkRoute: payload.chunkRoute,
      pageCount: payload.pages?.length ?? 0,
      firstPage: payload.pages?.[0]?.pageNumber ?? null,
      lastPage: payload.pages?.[payload.pages.length - 1]?.pageNumber ?? null,
    }
    console.log("runAiIntake:debug:payloadSerialized", {
      ...payloadShape,
      serializedLength: serialized.length,
      serializedSuccess: true,
    })
    for (let i = 0; i < (payload.pages?.length ?? 0); i++) {
      const p = payload.pages[i]
      const t = p?.text
      if (!t) continue
      const primary = typeof t.primaryTextExcerpt === "string" ? t.primaryTextExcerpt : ""
      const secondary = typeof t.secondaryTextExcerpt === "string" ? t.secondaryTextExcerpt : ""
      const firstLines = Array.isArray(t.firstLines) ? t.firstLines : []
      const hasControl = (s: string) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s)
      const hasReplacement = (s: string) => /\uFFFD/.test(s)
      console.log("runAiIntake:debug:pageTextFields", {
        pageNumber: p?.pageNumber,
        primaryLen: primary.length,
        secondaryLen: secondary.length,
        firstLinesCount: firstLines.length,
        firstLinesJoinLen: firstLines.join(" ").length,
        primaryHasControlChars: hasControl(primary),
        secondaryHasControlChars: hasControl(secondary),
        primaryHasReplacementChar: hasReplacement(primary),
        secondaryHasReplacementChar: hasReplacement(secondary),
      })
    }
  } catch (e) {
    console.error("runAiIntake:debug:payloadSerializeFailed", {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    })
  }

  for (const page of pages) {
    if (!shouldIncludePageImageInPrompt(page, chunkRoute)) continue
    if (!page.pageImage.imagePath) continue

    const dataUrl = await filePathToDataUrl(page.pageImage.imagePath)
    if (!dataUrl) continue

    content.push({
      type: "text",
      text: `Page image for page ${page.pageNumber}. Inspect visually when useful.`,
    })

    content.push({
      type: "image_url",
      image_url: {
        url: dataUrl,
      },
    })
  }

  return content
}

async function runChunkThroughAi(
  client: OpenAI,
  uploadId: string,
  filename: string | null,
  pages: IntakePreparedPage[],
): Promise<IntakeAiPageResult[]> {
  const chunkRoute = classifyChunkRoute(pages)
  const payload = buildPromptPayload(uploadId, filename, pages, chunkRoute)
  const estimatedTokens = estimateChunkPayloadTokens(pages, chunkRoute)
  const userMessageContent = await buildUserMessageContent(payload, pages, chunkRoute)
  const firstPage = pages[0]?.pageNumber ?? null
  const lastPage = pages[pages.length - 1]?.pageNumber ?? null

  console.log("runAiIntake:chunk:payloadPrepared", {
    firstPage,
    lastPage,
    pageCount: pages.length,
    chunkRoute,
    estimatedTokens,
    imagePages: pages
      .filter(
        (p) => shouldIncludePageImageInPrompt(p, chunkRoute) && Boolean(p.pageImage.imagePath),
      )
      .map((p) => p.pageNumber),
  })

  const request = {
    model: LLM_MODEL,
    messages: [
      {
        role: "system",
        content: buildSystemPromptForChunkRoute(chunkRoute),
      },
      {
        role: "user",
        content: userMessageContent,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mitteniq_ai_intake_pages",
        strict: true,
        schema: aiChunkSchema,
      },
    },
  } as any

  // DEBUG: request shape and full-body serialization (remove after fixing 400)
  try {
    const bodyString = JSON.stringify(request)
    console.log("runAiIntake:debug:requestShape", {
      firstPage,
      lastPage,
      chunkRoute,
      model: request.model,
      messagesCount: request.messages.length,
      systemContentLength:
        typeof request.messages[0]?.content === "string"
          ? request.messages[0].content.length
          : "array",
      userContentParts: Array.isArray(request.messages[1]?.content)
        ? request.messages[1].content.length
        : 0,
      userFirstPartType: Array.isArray(request.messages[1]?.content)
        ? request.messages[1].content[0]?.type
        : undefined,
      userFirstPartTextLength: (() => {
        const c = request.messages[1]?.content
        return Array.isArray(c) ? (c[0] as { text?: string })?.text?.length : undefined
      })(),
      fullBodyLength: bodyString.length,
      fullBodySerializeSuccess: true,
    })
  } catch (e) {
    console.error("runAiIntake:debug:requestSerializeFailed", {
      firstPage,
      lastPage,
      chunkRoute,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    })
    throw e
  }

  const response = await createChatCompletionWithRetry(
    client,
    request,
    {
      uploadId,
      chunkRoute,
      firstPage,
      lastPage,
      pageCount: pages.length,
      estimatedTokens,
    },
  )

  const outputText = String(response?.choices?.[0]?.message?.content ?? "").trim()
  if (!outputText) {
    throw new Error("AI returned empty output.")
  }

  const parsed = parseChunkResponse(outputText)
  if (!parsed) {
    throw new Error("AI output could not be parsed into the expected schema.")
  }

  const byPageNumber = new Map<number, IntakeAiPageResult>()
  for (const row of parsed.pages) {
    const confidence = normalizeConfidence(row.confidence)
    const reviewRequired =
      row.pageClass === "DRAWING"
        ? confidence < REVIEW_CONFIDENCE_THRESHOLD
          ? true
          : Boolean(row.reviewRequired)
        : Boolean(row.reviewRequired)

    byPageNumber.set(row.pageNumber, {
      pageNumber: row.pageNumber,
      pageClass: normalizePageClass(row.pageClass),
      pageSubtype: normalizeNullableString(row.pageSubtype, 120) ?? "BODY_PAGE",
      sheetNumber: normalizeSheetNumber(row.sheetNumber),
      sheetTitle: normalizeNullableString(row.sheetTitle, 180),
      discipline: normalizeDiscipline(row.discipline),
      sectionNumber: normalizeNullableString(row.sectionNumber, 60),
      sectionTitle: normalizeNullableString(row.sectionTitle, 180),
      electricalRelevance: normalizeBooleanOrNull(row.electricalRelevance),
      structuralRole: normalizeStructuralRole(row.structuralRole),
      sectionSignalStrength: normalizeSignalStrength(row.sectionSignalStrength),
      packetSignalStrength: normalizeSignalStrength(row.packetSignalStrength),
      isLikelySectionStart: Boolean(row.isLikelySectionStart),
      isLikelySectionContinuation: Boolean(row.isLikelySectionContinuation),
      isLikelySectionEnd: Boolean(row.isLikelySectionEnd),
      isLikelyPacketStart: Boolean(row.isLikelyPacketStart),
      isLikelyPacketContinuation: Boolean(row.isLikelyPacketContinuation),
      isLikelyPacketEnd: Boolean(row.isLikelyPacketEnd),
      confidence,
      reviewRequired,
      evidence: normalizeNullableString(row.evidence, 240),
    })
  }

  return pages.map((page) => {
    const aiRow = byPageNumber.get(page.pageNumber)

    if (aiRow) return aiRow

    return {
      pageNumber: page.pageNumber,
      pageClass: "GENERAL_DOCUMENT",
      pageSubtype: "BODY_PAGE",
      sheetNumber: null,
      sheetTitle: null,
      discipline: null,
      sectionNumber: null,
      sectionTitle: null,
      electricalRelevance: null,
      structuralRole: "OTHER",
      sectionSignalStrength: "NONE",
      packetSignalStrength: "NONE",
      isLikelySectionStart: false,
      isLikelySectionContinuation: false,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
      confidence: 0.35,
      reviewRequired: true,
      evidence: "AI did not return a usable result for this page.",
    }
  })
}

async function runChunkWithAdaptiveSplit(
  client: OpenAI,
  uploadId: string,
  filename: string | null,
  pages: IntakePreparedPage[],
  splitDepth = 0,
): Promise<IntakeAiPageResult[]> {
  try {
    return await runChunkThroughAi(client, uploadId, filename, pages)
  } catch (error: any) {
    const route = classifyChunkRoute(pages)
    const config = getChunkRouteConfig(route)
    const retryable = isRetryableAiError(error)
    const canSplit =
      splitDepth < MAX_CHUNK_SPLIT_DEPTH && pages.length >= config.minPagesAfterSplit * 2

    if (!retryable || !canSplit) {
      throw error
    }

    const midpoint = Math.ceil(pages.length / 2)
    const left = pages.slice(0, midpoint)
    const right = pages.slice(midpoint)

    console.warn("runAiIntake:chunk:splittingAfterFailure", {
      uploadId,
      chunkRoute: route,
      splitDepth,
      originalPageCount: pages.length,
      leftPages: left.length,
      rightPages: right.length,
      error: error?.message ?? String(error),
    })

    const leftRows = await runChunkWithAdaptiveSplit(
      client,
      uploadId,
      filename,
      left,
      splitDepth + 1,
    )
    const rightRows = await runChunkWithAdaptiveSplit(
      client,
      uploadId,
      filename,
      right,
      splitDepth + 1,
    )

    return [...leftRows, ...rightRows]
  }
}

function normalizeAiResults(
  aiRows: IntakeAiPageResult[],
  preparedPages: IntakePreparedPage[],
  drawingSetRegistry: DrawingSetRegistry = EMPTY_DRAWING_REGISTRY,
  documentPageCount?: number,
): IntakeNormalizedPage[] {
  const preparedByPage = new Map<number, IntakePreparedPage>()
  for (const page of preparedPages) {
    preparedByPage.set(page.pageNumber, page)
  }

  const totalPages = documentPageCount ?? preparedPages.length

  return aiRows
    .map((row) => {
      const prepared = preparedByPage.get(row.pageNumber)
      let pageClass = normalizePageClass(row.pageClass)

      const aiSheetForIdentity = cleanIdentityValue(row.sheetNumber)
      const aiTitleForIdentity = cleanIdentityValue(row.sheetTitle)

      let sheetNumber = aiSheetForIdentity
      let sheetTitle = aiTitleForIdentity
      const sectionNumber = row.sectionNumber ?? prepared?.specSignals.detectedSectionNumber ?? null
      const sectionTitle = row.sectionTitle ?? prepared?.specSignals.detectedSectionTitle ?? null
      const structuralRole =
        row.structuralRole ?? (pageClass === "BLANK_PAGE" ? "BLANK_PAGE" : null)

      if (pageClass !== "DRAWING") {
        sheetNumber = suppressNonDrawingPageLabel(sheetNumber, row.pageNumber, totalPages)
        sheetTitle = stripFakePdfPrefixFromTitle(sheetTitle, row.pageNumber, totalPages)
      }

      pageClass = inferNonDrawingClass(
        pageClass,
        row.pageSubtype,
        sheetTitle,
        sectionTitle,
        prepared,
      )

      const sparseClassification = classifySparseNonDrawingPage(
        pageClass,
        row.pageSubtype,
        sheetTitle,
        sectionTitle,
        prepared,
      )

      if (sparseClassification === "TRUE_BLANK") {
        pageClass = "BLANK_PAGE"
        sheetNumber = null
        sheetTitle = "Blank Page"
      }

      const pageSubtype = normalizeNonDrawingSubtype(
        normalizeNullableString(row.pageSubtype, 120) ?? "BODY_PAGE",
        pageClass,
        sheetTitle,
        sectionNumber,
        sectionTitle,
        prepared,
        structuralRole,
      )

      if (
        pageClass !== "DRAWING" &&
        pageClass !== "BLANK_PAGE" &&
        !sheetTitle &&
        sparseClassification === "DIVIDER_LIKE"
      ) {
        sheetTitle =
          sectionTitle ??
          prepared?.specSignals.detectedSectionTitle ??
          prepared?.specSignals.headerHint ??
          "Section Divider"
      }

      let mergedEvidence = row.evidence

      if (pageClass === "DRAWING" && prepared?.drawingIdentityHints) {
        const h = prepared.drawingIdentityHints
        const hintNum = cleanIdentityValue(h.sheetNumberCandidate)
        const hintTitle = cleanIdentityValue(h.sheetTitleCandidate)
        const assist: string[] = []
        const reg = drawingSetRegistry

        if (h.registryValidated && hintNum) {
          const hk = registryLogicalKeyForSheetId(hintNum)
          const ak = registryLogicalKeyForSheetId(sheetNumber)
          const sameLogical = Boolean(hk && ak && hk === ak)
          const aiInReg = sheetNumber ? lookupRegistryEntry(reg, sheetNumber) : undefined
          const aiStrongEnough =
            row.confidence >= 0.92 && sameLogical && Boolean(aiInReg)

          if (sameLogical && sheetNumber && hintNum && sheetNumber.toUpperCase() !== hintNum.toUpperCase()) {
            sheetNumber = hintNum
            assist.push("canonical sheet")
          } else if (!sameLogical && !aiStrongEnough) {
            sheetNumber = hintNum
            assist.push("registry sheet")
          } else if (!sheetNumber && hintNum) {
            sheetNumber = hintNum
            assist.push("registry sheet")
          }

          if (h.titleRegistryValidated && hintTitle && !aiStrongEnough) {
            if (sheetTitle !== hintTitle) assist.push("registry title")
            sheetTitle = hintTitle
          } else if (!h.titleRegistryValidated) {
            if (shouldPreferHintSheetTitle(sheetTitle, hintTitle, h.confidence)) {
              sheetTitle = hintTitle ?? sheetTitle
              assist.push("sheetTitle from title-block hint")
            } else if (!sheetTitle && hintTitle) {
              sheetTitle = hintTitle
              assist.push("sheetTitle filled from title-block hint")
            }
          }

          if (assist.length && h.registryAssistMessage) {
            mergedEvidence = mergeRegistryAssistEvidence(
              mergedEvidence,
              `Drawing registry assist used: ${h.registryAssistMessage}.`,
            )
          } else if (assist.length) {
            mergedEvidence = mergeDeterministicEvidence(
              mergedEvidence,
              `Deterministic title-block assist: ${assist.join("; ")}.`,
            )
          }
        } else if (hintNum || hintTitle) {
          if (shouldPreferHintSheetNumber(sheetNumber, hintNum, h.confidence)) {
            sheetNumber = hintNum
            assist.push(`sheetNumber→${hintNum}`)
          } else if (!sheetNumber && hintNum) {
            sheetNumber = hintNum
            assist.push(`sheetNumber=${hintNum}`)
          }

          if (shouldPreferHintSheetTitle(sheetTitle, hintTitle, h.confidence)) {
            sheetTitle = hintTitle ?? sheetTitle
            assist.push("sheetTitle from title-block hint")
          } else if (!sheetTitle && hintTitle) {
            sheetTitle = hintTitle
            assist.push("sheetTitle filled from title-block hint")
          }

          if (assist.length) {
            mergedEvidence = mergeDeterministicEvidence(
              mergedEvidence,
              `Deterministic title-block assist: ${assist.join("; ")}.`,
            )
          }
        }
      }

      if (pageClass === "DRAWING") {
        const mergedBeforeResolveSn = sheetNumber
        const mergedBeforeResolveSt = sheetTitle
        const hintNumForReg = cleanIdentityValue(prepared?.drawingIdentityHints?.sheetNumberCandidate)
        const regFromHint = hintNumForReg
          ? lookupRegistryEntry(drawingSetRegistry, hintNumForReg)
          : undefined

        const resolved = resolveFinalDrawingIdentity({
          pageNumber: row.pageNumber,
          pageClass,
          pageSubtype,
          mergedSheetNumber: sheetNumber,
          mergedSheetTitle: sheetTitle,
          aiSheetNumber: aiSheetForIdentity,
          aiSheetTitle: aiTitleForIdentity,
          hints: prepared?.drawingIdentityHints,
          registry: drawingSetRegistry,
          prepared,
        })

        sheetNumber = resolved.sheetNumber
        sheetTitle = resolved.sheetTitle

        if (
          mergedBeforeResolveSn !== sheetNumber ||
          mergedBeforeResolveSt !== sheetTitle
        ) {
          mergedEvidence = mergeDeterministicEvidence(
            mergedEvidence,
            `Final drawing identity (${resolved.reason}).`,
          )
        }

        if (
          shouldLogDrawingIdentityResolution(
            aiSheetForIdentity,
            aiTitleForIdentity,
            hintNumForReg,
            cleanIdentityValue(prepared?.drawingIdentityHints?.sheetTitleCandidate),
            regFromHint?.canonicalSheetNumber ?? null,
            regFromHint?.canonicalTitle ?? null,
            mergedBeforeResolveSn,
            mergedBeforeResolveSt,
            sheetNumber,
            sheetTitle,
          )
        ) {
          console.log("runAiIntake:drawingIdentityResolution", {
            pageNumber: row.pageNumber,
            aiSheetNumber: aiSheetForIdentity,
            aiSheetTitle: aiTitleForIdentity,
            hintSheetNumber: hintNumForReg,
            hintSheetTitle: cleanIdentityValue(prepared?.drawingIdentityHints?.sheetTitleCandidate),
            registrySheetNumber: regFromHint?.canonicalSheetNumber ?? null,
            registrySheetTitle: regFromHint?.canonicalTitle ?? null,
            finalSheetNumber: sheetNumber,
            finalSheetTitle: sheetTitle,
            reason: resolved.reason,
          })
        }
      }

      const printSize = prepared?.pdfFacts.printSize ?? null
      const scaleStatus = deriveScaleStatus(pageClass, pageSubtype)
      const scaleConfidence = deriveScaleConfidence(pageClass, pageSubtype, row.confidence)

      const adjustedRow: IntakeAiPageResult = {
        ...row,
        pageClass,
        pageSubtype,
        sheetNumber,
        sheetTitle,
        sectionNumber,
        sectionTitle,
        evidence: mergedEvidence,
      }

      const reviewReasons = buildReviewReasons(adjustedRow, prepared)
      const reviewRequired = shouldRequireReview(adjustedRow, reviewReasons, prepared)

      return {
        pageNumber: row.pageNumber,
        final: {
          pageClass,
          pageSubtype,
          sheetNumber,
          sheetTitle,
          discipline: row.discipline,
          sectionNumber,
          sectionTitle,
          electricalRelevance: row.electricalRelevance,
          scaleStatus,
          scaleConfidence,
          printSize,
        },
        aiSignals: {
          structuralRole,
          sectionSignalStrength: row.sectionSignalStrength,
          packetSignalStrength: row.packetSignalStrength,
          isLikelySectionStart:
            row.isLikelySectionStart || Boolean(sectionNumber && row.sectionSignalStrength === "STRONG"),
          isLikelySectionContinuation: row.isLikelySectionContinuation,
          isLikelySectionEnd: row.isLikelySectionEnd,
          isLikelyPacketStart: row.isLikelyPacketStart,
          isLikelyPacketContinuation: row.isLikelyPacketContinuation,
          isLikelyPacketEnd: row.isLikelyPacketEnd,
        },
        anchor: null,
        confidence: {
          overall: row.confidence,
        },
        review: {
          status: reviewRequired ? "REVIEW_REQUIRED" : "NOT_REQUIRED",
          reasons: reviewReasons,
        },
        evidence: mergedEvidence,
      } satisfies IntakeNormalizedPage
    })
    .sort((a, b) => a.pageNumber - b.pageNumber)
}

function buildDocumentSummary(pages: IntakeNormalizedPage[]): IntakeDocumentSummary {
  const drawingPages = pages.filter((p) => p.final.pageClass === "DRAWING")
  const specPages = pages.filter((p) => p.final.pageClass === "SPECIFICATION")
  const bidPages = pages.filter((p) => p.final.pageClass === "BID_DOCUMENT")
  const generalPages = pages.filter((p) => p.final.pageClass === "GENERAL_DOCUMENT")
  const blankPages = pages.filter((p) => p.final.pageClass === "BLANK_PAGE")
  const reviewNeededPages = pages.filter((p) => p.review.status === "REVIEW_REQUIRED")

  const byDiscipline: Record<string, number> = {}
  for (const page of drawingPages) {
    const key = page.final.discipline ?? "UNKNOWN"
    byDiscipline[key] = (byDiscipline[key] ?? 0) + 1
  }

  const seenSectionRows = new Set<string>()
  const sectionsDetected: Array<{
    sectionNumber: string | null
    sectionTitle: string | null
    isElectricalRelated: boolean
  }> = []

  for (const page of pages) {
    if (page.final.pageClass !== "SPECIFICATION") continue
    if (!page.final.sectionNumber && !page.final.sectionTitle) continue

    const key = `${page.final.sectionNumber ?? "—"}||${page.final.sectionTitle ?? "—"}||${page.final.electricalRelevance ? "1" : "0"}`
    if (seenSectionRows.has(key)) continue
    seenSectionRows.add(key)

    sectionsDetected.push({
      sectionNumber: page.final.sectionNumber,
      sectionTitle: page.final.sectionTitle,
      isElectricalRelated: page.final.electricalRelevance === true,
    })
  }

  return {
    mixedContent:
      drawingPages.length > 0 &&
      (specPages.length > 0 || bidPages.length > 0 || generalPages.length > 0),
    counts: {
      drawingPages: drawingPages.length,
      specPages: specPages.length,
      bidPages: bidPages.length,
      generalPages: generalPages.length,
      blankPages: blankPages.length,
      reviewNeededPages: reviewNeededPages.length,
    },
    drawingSummary: {
      totalDrawingPages: drawingPages.length,
      byDiscipline,
      namedDrawingPages: drawingPages.filter((p) => p.final.sheetNumber || p.final.sheetTitle)
        .length,
      unnamedDrawingPages: drawingPages.filter(
        (p) => !p.final.sheetNumber && !p.final.sheetTitle,
      ).length,
    },
    specSummary: {
      totalSpecPages: specPages.length,
      electricalRelatedPages: specPages.filter((p) => p.final.electricalRelevance === true)
        .length,
      sectionsDetected,
    },
  }
}

function buildAnchors(
  pages: IntakeNormalizedPage[],
): {
  pages: IntakeNormalizedPage[]
  anchors: IntakeRunResult["anchors"]
} {
  const anchoredPages: IntakeNormalizedPage[] = pages.map((page) => ({
    ...page,
    anchor: null,
  }))

  const anchors: IntakeRunResult["anchors"] = []

  let currentSection:
    | {
        anchorPage: number
        startPage: number
        endPage: number
        displayTitle: string
        sectionNumber: string | null
        sectionTitle: string | null
        pageNumbers: number[]
      }
    | null = null

  function flushSectionAnchor() {
    if (!currentSection) return

    anchors.push({
      kind: "SPEC_SECTION",
      anchorPage: currentSection.anchorPage,
      startPage: currentSection.startPage,
      endPage: currentSection.endPage,
      displayTitle: currentSection.displayTitle,
      sectionNumber: currentSection.sectionNumber,
      sectionTitle: currentSection.sectionTitle,
      packetTitle: null,
      pageNumbers: [...currentSection.pageNumbers],
    })

    currentSection = null
  }

  for (const page of anchoredPages) {
    if (page.final.pageClass !== "SPECIFICATION") {
      flushSectionAnchor()
      continue
    }

    const displayTitle = buildSectionDisplayTitle(
      page.final.sectionNumber,
      page.final.sectionTitle,
    )

    const explicitStart =
      page.aiSignals.isLikelySectionStart ||
      page.aiSignals.structuralRole === "SECTION_START" ||
      page.aiSignals.structuralRole === "DIVISION_HEADER"

    const explicitEnd =
      page.aiSignals.isLikelySectionEnd ||
      page.aiSignals.structuralRole === "SECTION_END"

    const shouldStartNew =
      Boolean(displayTitle) &&
      (!currentSection ||
        explicitStart ||
        currentSection.displayTitle !== displayTitle)

    if (shouldStartNew) {
      flushSectionAnchor()

      currentSection = {
        anchorPage: page.pageNumber,
        startPage: page.pageNumber,
        endPage: page.pageNumber,
        displayTitle: displayTitle!,
        sectionNumber: page.final.sectionNumber,
        sectionTitle: page.final.sectionTitle,
        pageNumbers: [],
      }
    }

    if (currentSection) {
      currentSection.endPage = page.pageNumber
      currentSection.pageNumbers.push(page.pageNumber)

      page.anchor = {
        kind: "SPEC_SECTION",
        anchorPage: currentSection.anchorPage,
        displayTitle: currentSection.displayTitle,
      }
    }

    if (explicitEnd) {
      flushSectionAnchor()
    }
  }

  flushSectionAnchor()

  let currentPacket:
    | {
        anchorPage: number
        startPage: number
        endPage: number
        displayTitle: string
        normalizedTitle: string
        pageClass: IntakePageClass
        pageNumbers: number[]
      }
    | null = null

  function flushPacketAnchor() {
    if (!currentPacket) return

    anchors.push({
      kind: "DOCUMENT_PACKET",
      anchorPage: currentPacket.anchorPage,
      startPage: currentPacket.startPage,
      endPage: currentPacket.endPage,
      displayTitle: currentPacket.displayTitle,
      sectionNumber: null,
      sectionTitle: null,
      packetTitle: currentPacket.displayTitle,
      pageNumbers: [...currentPacket.pageNumbers],
    })

    currentPacket = null
  }

  for (const page of anchoredPages) {
    if (
      page.final.pageClass !== "BID_DOCUMENT" &&
      page.final.pageClass !== "GENERAL_DOCUMENT"
    ) {
      flushPacketAnchor()
      continue
    }

    const baseTitle = stripPagePositionSuffix(getBasePacketTitle(page))
    const normalizedTitle = normalizeComparableNonDrawingTitle(baseTitle)

    if (!baseTitle || !normalizedTitle) {
      flushPacketAnchor()
      continue
    }

    const weakTitles = [
      "title page",
      "table of contents",
      "section divider",
      "body page",
      "form page",
      "index page",
    ]

    if (weakTitles.includes(normalizedTitle)) {
      flushPacketAnchor()
      continue
    }

    const canContinue =
      currentPacket != null &&
      currentPacket.pageClass === page.final.pageClass &&
      currentPacket.normalizedTitle === normalizedTitle &&
      currentPacket.endPage + 1 === page.pageNumber

    if (!canContinue) {
      flushPacketAnchor()

      currentPacket = {
        anchorPage: page.pageNumber,
        startPage: page.pageNumber,
        endPage: page.pageNumber,
        displayTitle: baseTitle,
        normalizedTitle,
        pageClass: page.final.pageClass,
        pageNumbers: [],
      }
    }

    if (currentPacket) {
      currentPacket.endPage = page.pageNumber
      currentPacket.pageNumbers.push(page.pageNumber)
    }
  }

  flushPacketAnchor()

  return {
    pages: anchoredPages,
    anchors,
  }
}

async function mapChunksWithTokenBudget<T>(
  items: Array<T & { estimatedTokens: number }>,
  maxConcurrent: number,
  maxTokensInFlight: number,
  worker: (item: T & { estimatedTokens: number }, index: number) => Promise<IntakeAiPageResult[]>,
): Promise<IntakeAiPageResult[][]> {
  const results: IntakeAiPageResult[][] = new Array(items.length)
  let nextIndex = 0
  let activeCount = 0
  let tokensInFlight = 0
  let settled = false

  return await new Promise((resolve, reject) => {
    const safeReject = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error)
    }

    const safeResolve = () => {
      if (settled) return
      settled = true
      resolve(results)
    }

    const launchMore = () => {
      if (settled) return

      if (nextIndex >= items.length && activeCount === 0) {
        safeResolve()
        return
      }

      while (!settled && nextIndex < items.length && activeCount < maxConcurrent) {
        const candidate = items[nextIndex]
        const candidateTokens = Math.max(1, candidate.estimatedTokens)
        const canLaunch =
          activeCount === 0 || tokensInFlight + candidateTokens <= maxTokensInFlight

        if (!canLaunch) break

        const currentIndex = nextIndex
        nextIndex += 1
        activeCount += 1
        tokensInFlight += candidateTokens

        Promise.resolve(worker(candidate, currentIndex))
          .then((value) => {
            results[currentIndex] = Array.isArray(value) ? value : []
          })
          .catch((error) => {
            safeReject(error)
          })
          .finally(() => {
            activeCount -= 1
            tokensInFlight -= candidateTokens
            launchMore()
          })
      }
    }

    launchMore()
  })
}

function buildDisabledResult(
  pages: IntakePreparedPage[],
  reasonCode: string,
  evidence: string,
  skippedReason: string,
  enabled: boolean,
  model: string | null,
): IntakeRunResult {
  const normalizedPages = pages.map((page) => ({
    pageNumber: page.pageNumber,
    final: {
      pageClass: "GENERAL_DOCUMENT" as const,
      pageSubtype: "BODY_PAGE",
      sheetNumber: null,
      sheetTitle: null,
      discipline: null,
      sectionNumber: null,
      sectionTitle: null,
      electricalRelevance: null,
      scaleStatus: "NO_SCALE_NEEDED" as const,
      scaleConfidence: 35,
      printSize: page.pdfFacts.printSize,
    },
    aiSignals: {
      structuralRole: "OTHER" as const,
      sectionSignalStrength: "NONE" as const,
      packetSignalStrength: "NONE" as const,
      isLikelySectionStart: false,
      isLikelySectionContinuation: false,
      isLikelySectionEnd: false,
      isLikelyPacketStart: false,
      isLikelyPacketContinuation: false,
      isLikelyPacketEnd: false,
    },
    anchor: null,
    confidence: {
      overall: 0.2,
    },
    review: {
      status: "REVIEW_REQUIRED" as const,
      reasons: [reasonCode],
    },
    evidence,
  }))

  return {
    pages: normalizedPages,
    summary: buildDocumentSummary(normalizedPages),
    specSections: [],
    anchors: [],
    ai: {
      enabled,
      used: false,
      model,
      reviewedPages: 0,
      skippedReason,
      fastPath: { used: false },
    },
  }
}

const INDEX_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sheetNumber: { type: "string" },
          sheetTitle: { type: "string" },
        },
        required: ["sheetNumber", "sheetTitle"],
        additionalProperties: false,
      },
    },
  },
  required: ["rows"],
  additionalProperties: false,
} as const

async function buildIndexExtractionUserContent(
  pages: IntakePreparedPage[],
  opts?: { emphasizeSingleIndexPage?: boolean },
) {
  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = []
  if (opts?.emphasizeSingleIndexPage && pages.length === 1) {
    content.push({
      type: "text",
      text: [
        "Only this single PDF page is provided.",
        "Extract the sheet index / list-of-drawings table from THIS page only.",
        "Do not assume continuation on other pages; do not add rows that are not visible here.",
      ].join("\n"),
    })
  }
  content.push({
    type: "text",
    text: [
      "Extract every drawing sheet row from the sheet index / list of drawings on these pages.",
      "Return JSON only per schema. Include ALL rows visible (do not sample).",
      "Preserve sheet numbers exactly as printed (keep leading zeros, e.g. G-001 not G-1).",
      "sheetTitle is the drawing title/description column text for that row (trim, no line breaks).",
      `Pages in this request: ${pages.map((p) => p.pageNumber).join(", ")}.`,
    ].join("\n"),
  })

  for (const page of pages) {
    const norm = page.rawText.normalizedText?.trim() ?? ""
    const full = page.rawText.fullText?.trim() ?? ""
    const ocrN = page.ocrText.normalizedText?.trim() ?? ""
    const ocrF = page.ocrText.fullText?.trim() ?? ""
    const textPick = norm.length >= full.length ? norm : full || norm
    const ocrPick = ocrN.length >= ocrF.length ? ocrN : ocrF || ocrN
    const excerpt = compactText([textPick, ocrPick].filter(Boolean).join("\n\n"), 12_000)
    content.push({
      type: "text",
      text: `--- Page ${page.pageNumber} text (excerpt) ---\n${excerpt}`,
    })
    if (shouldIncludePageImageInPrompt(page, "DRAWING") && page.pageImage.imagePath) {
      const dataUrl = await filePathToDataUrl(page.pageImage.imagePath)
      if (dataUrl) {
        content.push({
          type: "text",
          text: `Page ${page.pageNumber} image (use if text is incomplete).`,
        })
        content.push({ type: "image_url", image_url: { url: dataUrl } })
      }
    }
  }
  return content
}

/**
 * Targeted LLM call: sheet list rows only. Does not run full per-page intake schema.
 */
export async function runDrawingIndexSheetListExtraction(params: {
  uploadId: string
  filename: string | null
  pages: IntakePreparedPage[]
  /** When true with a single page, prompt stresses no multi-page continuation. */
  emphasizeSingleIndexPage?: boolean
}): Promise<{ rows: ExtractedIndexSheetRow[]; success: boolean; rawError?: string }> {
  const { uploadId, filename, pages, emphasizeSingleIndexPage } = params
  if (!llmEnabled() || !getApiKeyRaw()) {
    return { rows: [], success: false, rawError: "LLM disabled or missing API key" }
  }
  const client = getClient()
  if (!client || pages.length === 0) {
    return { rows: [], success: false, rawError: "No OpenAI client or empty pages" }
  }

  const firstPage = pages[0]?.pageNumber ?? null
  const lastPage = pages[pages.length - 1]?.pageNumber ?? null
  const userContent = await buildIndexExtractionUserContent(pages, {
    emphasizeSingleIndexPage,
  })
  const estimatedTokens = 1800 + pages.length * 900

  const request = {
    model: LLM_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You extract structured rows from construction drawing sheet indexes. Output valid JSON only.",
      },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mitteniq_drawing_index_rows",
        strict: true,
        schema: INDEX_EXTRACTION_SCHEMA,
      },
    },
  } as const

  try {
    const response = await createChatCompletionWithRetry(client, request as any, {
      uploadId,
      chunkRoute: "DRAWING",
      firstPage,
      lastPage,
      pageCount: pages.length,
      estimatedTokens,
    })
    const outputText = String(response?.choices?.[0]?.message?.content ?? "").trim()
    if (!outputText) {
      return { rows: [], success: false, rawError: "Empty model output" }
    }
    const parsed = JSON.parse(outputText) as { rows?: unknown[] }
    const rows: ExtractedIndexSheetRow[] = []
    if (Array.isArray(parsed.rows)) {
      for (const r of parsed.rows) {
        if (!r || typeof r !== "object") continue
        const sn = normalizeSheetNumber((r as { sheetNumber?: unknown }).sheetNumber)
        const st = normalizeNullableString((r as { sheetTitle?: unknown }).sheetTitle, 240)
        if (sn && st) rows.push({ sheetNumber: sn, sheetTitle: st })
      }
    }
    return { rows, success: rows.length > 0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("runDrawingIndexSheetListExtraction:failed", { uploadId, msg })
    return { rows: [], success: false, rawError: msg }
  }
}

const FORCED_SINGLE_INDEX_PAGE_ENV = "MITTENIQ_FORCED_SINGLE_INDEX_PAGE"

/** Diagnostic: when set (non-empty, not 0/false/no), run single-page index LLM on PDF page 1 only. */
export function isForcedSingleIndexExtractionEnabled(): boolean {
  const raw = String(process.env[FORCED_SINGLE_INDEX_PAGE_ENV] ?? "").trim()
  if (!raw) return false
  const low = raw.toLowerCase()
  return low !== "0" && low !== "false" && low !== "no"
}

export async function runForcedSingleIndexPageExtraction(params: {
  uploadId: string
  filename: string | null
  preparedPages: IntakePreparedPage[]
}): Promise<void> {
  const { uploadId, filename, preparedPages } = params
  if (!isForcedSingleIndexExtractionEnabled()) return
  if (!llmEnabled() || !getApiKeyRaw()) return

  const pageNumber = 1
  const page = preparedPages.find((p) => p.pageNumber === pageNumber)
  console.log("visibleIntake:forcedSingleIndexInputs", {
    pageNumber,
    uploadId,
    filename: filename ?? null,
    preparedPageFound: Boolean(page),
  })
  if (!page) {
    console.log("visibleIntake:forcedSingleIndexExtraction", {
      pageNumber,
      extractedRowCount: 0,
      rows: [],
    })
    return
  }

  const result = await runDrawingIndexSheetListExtraction({
    uploadId,
    filename,
    pages: [page],
    emphasizeSingleIndexPage: true,
  })
  console.log("visibleIntake:forcedSingleIndexExtraction", {
    pageNumber,
    extractedRowCount: result.rows.length,
    rows: result.rows,
  })
}

export async function runAiIntake(params: RunAiIntakeParams): Promise<IntakeRunResult> {
  const {
    uploadId,
    filename,
    pdfBuffer,
    drawingSetRegistry,
    documentPageCount,
    llmPageAllowlist,
  } = params
  let pages = params.pages

  if (llmPageAllowlist?.length) {
    const allow = new Set(llmPageAllowlist)
    const removed = pages.filter((p) => !allow.has(p.pageNumber)).map((p) => p.pageNumber)
    if (removed.length) {
      console.warn("runAiIntake:llmPageAllowlistRemovedPages", { uploadId, removed })
    }
    pages = pages.filter((p) => allow.has(p.pageNumber))
  }


  if (!llmEnabled()) {
    return buildDisabledResult(
      pages,
      "AI_INTAKE_DISABLED",
      "AI intake is disabled.",
      "MITTENIQ_LLM_INTAKE_ENABLED is not true.",
      false,
      null,
    )
  }

  const client = getClient()
  if (!client) {
    return buildDisabledResult(
      pages,
      "OPENAI_API_KEY_MISSING",
      "AI intake could not run because the API key is missing.",
      "OPENAI_API_KEY is missing.",
      true,
      null,
    )
  }

  if (!pages.length) {
    return {
      pages: [],
      summary: buildDocumentSummary([]),
      specSections: [],
      anchors: [],
      ai: {
        enabled: true,
        used: false,
        model: LLM_MODEL,
        reviewedPages: 0,
        skippedReason: llmPageAllowlist?.length
          ? "No pages remained after llmPageAllowlist filter."
          : "No prepared pages were provided.",
        fastPath: { used: false },
      },
    }
  }

  let specFastPathActive = false
  let aiFastPath: IntakeRunResult["ai"]["fastPath"] = { used: false }

  if (pdfBuffer && pdfBuffer.length > 0) {
    try {
      const eligibility = await analyzeSpecFastPathEligibility({ pdfBuffer })
      console.log("runAiIntake:specFastPath:eligibility", {
        profile: eligibility.profile,
        eligible: eligibility.eligible,
        confidence: eligibility.confidence,
      })
      if (
        eligibility.eligible === true &&
        eligibility.confidence >= 0.85 &&
        (eligibility.profile === "CSI" || eligibility.profile === "ARTICLE")
      ) {
        specFastPathActive = true
        aiFastPath = {
          used: true,
          profile: eligibility.profile,
          confidence: eligibility.confidence,
        }
      }
    } catch (error: unknown) {
      console.error("runAiIntake:specFastPath:eligibilityFailed", {
        uploadId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const maxConcurrentChunks = getMaxConcurrentChunks()
  const maxEstimatedTokensInFlight = getMaxEstimatedTokensInFlight()
  const chunks = planChunks(pages, { specFastPathActive })

  console.log("runAiIntake:start", {
    totalPages: pages.length,
    totalChunks: chunks.length,
    maxConcurrentChunks,
    maxEstimatedTokensInFlight,
    model: LLM_MODEL,
    aiMaxRetries: AI_MAX_RETRIES,
    chunkPreview: chunks.slice(0, 12).map((chunk) => ({
      index: chunk.index,
      route: chunk.route,
      pageCount: chunk.pages.length,
      estimatedTokens: chunk.estimatedTokens,
      firstPage: chunk.pages[0]?.pageNumber ?? null,
      lastPage: chunk.pages[chunk.pages.length - 1]?.pageNumber ?? null,
      imagePages: chunk.includedImagePages,
    })),
  })

  const chunkResults = await mapChunksWithTokenBudget(
    chunks,
    maxConcurrentChunks,
    maxEstimatedTokensInFlight,
    async (chunk, index) => {
      const firstPage = chunk.pages[0]?.pageNumber ?? null
      const lastPage = chunk.pages[chunk.pages.length - 1]?.pageNumber ?? null

      console.log("runAiIntake:chunk:start", {
        chunkIndex: index,
        chunkSize: chunk.pages.length,
        firstPage,
        lastPage,
        chunkRoute: chunk.route,
        estimatedTokens: chunk.estimatedTokens,
        imagePages: chunk.includedImagePages,
      })

      const startedAt = Date.now()
      const rows = await runChunkWithAdaptiveSplit(
        client,
        uploadId,
        filename,
        chunk.pages,
      )
      const elapsedMs = Date.now() - startedAt

      console.log("runAiIntake:chunk:done", {
        chunkIndex: index,
        chunkSize: chunk.pages.length,
        firstPage,
        lastPage,
        chunkRoute: chunk.route,
        estimatedTokens: chunk.estimatedTokens,
        returnedRows: rows.length,
        elapsedMs,
      })

      return rows
    },
  )

  console.log("runAiIntake:postChunks:received", {
    chunkResultCount: chunkResults.length,
    expectedChunkCount: chunks.length,
  })

  let aiRows: IntakeAiPageResult[]
  let normalizedPages: IntakeNormalizedPage[]
  let specSections: ReturnType<typeof groupSpecSections>
  let summary: IntakeDocumentSummary
  let anchors: IntakeRunResult["anchors"]

  try {
    aiRows = chunkResults.reduce<IntakeAiPageResult[]>((acc, chunkRows, index) => {
      if (!Array.isArray(chunkRows)) {
        console.error("runAiIntake:postChunks:invalidChunkRows", {
          chunkIndex: index,
          receivedType: typeof chunkRows,
        })
        return acc
      }

      for (const row of chunkRows) {
        acc.push(row)
      }

      return acc
    }, [])

    console.log("runAiIntake:postChunks:flatDone", {
      aiRows: aiRows.length,
      expectedPages: pages.length,
    })

    normalizedPages = normalizeAiResults(
      aiRows,
      pages,
      drawingSetRegistry ?? EMPTY_DRAWING_REGISTRY,
      documentPageCount,
    )

    console.log("runAiIntake:postChunks:normalizeDone", {
      normalizedPages: normalizedPages.length,
    })

    normalizedPages = reconcileAdjacentNonDrawingPages(normalizedPages, pages)

    console.log("runAiIntake:postChunks:reconcileDone", {
      normalizedPages: normalizedPages.length,
    })

    const anchorBuild = buildAnchors(normalizedPages)
    normalizedPages = anchorBuild.pages
    anchors = anchorBuild.anchors

    console.log("runAiIntake:postChunks:anchorsDone", {
      anchors: anchors.length,
    })

    specSections = groupSpecSections(normalizedPages)

    console.log("runAiIntake:postChunks:specSectionsDone", {
      specSections: specSections.length,
    })

    summary = buildDocumentSummary(normalizedPages)

    console.log("runAiIntake:postChunks:summaryDone", {
      reviewNeededPages: summary.counts.reviewNeededPages,
      drawingPages: summary.counts.drawingPages,
      specPages: summary.counts.specPages,
      bidPages: summary.counts.bidPages,
      generalPages: summary.counts.generalPages,
      blankPages: summary.counts.blankPages,
    })
  } catch (error: any) {
    console.error("runAiIntake:postChunks:failed", {
      uploadId,
      error: error?.message ?? String(error),
      stack: error?.stack ?? null,
    })
    throw error
  }

  console.log("runAiIntake:complete", {
    totalPages: normalizedPages.length,
    reviewNeededPages: summary.counts.reviewNeededPages,
    drawingPages: summary.counts.drawingPages,
    specPages: summary.counts.specPages,
    bidPages: summary.counts.bidPages,
    generalPages: summary.counts.generalPages,
    blankPages: summary.counts.blankPages,
    specSections: specSections.length,
    anchors: anchors.length,
  })

  return {
    pages: normalizedPages,
    summary,
    specSections,
    anchors,
    ai: {
      enabled: true,
      used: true,
      model: LLM_MODEL,
      reviewedPages: normalizedPages.length,
      skippedReason: null,
      fastPath: aiFastPath,
    },
  }
}