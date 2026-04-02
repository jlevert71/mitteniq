export type IntakePageClass =
  | "DRAWING"
  | "SPECIFICATION"
  | "BID_DOCUMENT"
  | "GENERAL_DOCUMENT"
  | "BLANK_PAGE"

export type IntakeReviewStatus =
  | "NOT_REQUIRED"
  | "REVIEW_REQUIRED"
  | "HUMAN_CONFIRMED"

export type ScaleStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "NO_SCALE_NEEDED"

export type IntakeRouteType =
  | "DRAWING"
  | "SPEC"
  | "MIXED"
  | "UNKNOWN"

export type IntakeRoutingSource =
  | "PAGE_ONLY"
  | "FILE_DEFAULT"
  | "PAGE_OVERRIDE"

export type IntakeStructuralRole =
  | "SECTION_START"
  | "SECTION_CONTINUATION"
  | "SECTION_END"
  | "PART_HEADER"
  | "TABLE_OF_CONTENTS"
  | "DIVISION_HEADER"
  | "INDEX_PAGE"
  | "TITLE_PAGE"
  | "FORM_PAGE"
  | "APPENDIX_PAGE"
  | "BLANK_PAGE"
  | "DRAWING_PAGE"
  | "OTHER"

export type IntakeSignalStrength =
  | "NONE"
  | "WEAK"
  | "MEDIUM"
  | "STRONG"

export type IntakeAnchorKind =
  | "SPEC_SECTION"
  | "DOCUMENT_PACKET"

export type PositionalTextToken = {
  text: string
  x: number
  y: number
  width?: number
  height?: number
}

/** How x/y on tokens was obtained; drives layout trust for hints and review. */
export type IntakePositionalEvidenceSource =
  | "NATIVE_PDF_POSITIONS"
  | "APPROXIMATED_FROM_TEXT"
  | "APPROXIMATED_FROM_OCR"

export type IntakePositionalEvidence = {
  source: IntakePositionalEvidenceSource
  /** 0–1 trust in geometric layout (title block / bands); not overall page quality */
  confidence: number
}

/** Default positional confidence by source (page-level). */
export const POSITIONAL_EVIDENCE_CONFIDENCE: Record<IntakePositionalEvidenceSource, number> = {
  NATIVE_PDF_POSITIONS: 0.95,
  APPROXIMATED_FROM_TEXT: 0.55,
  APPROXIMATED_FROM_OCR: 0.45,
}

export type IntakePdfFacts = {
  width: number | null
  height: number | null
  printSize: string | null
  rotation: number | null
  isRasterLikely: boolean
  isSearchable: boolean
  textDensity: number
}

export type IntakeSpecSignals = {
  likelySpecSectionStart: boolean
  likelySpecContinuation: boolean
  likelyFrontEndPage: boolean
  likelyIndexOrTocPage: boolean
  likelyBlankOrDividerPage: boolean
  detectedSectionNumber: string | null
  detectedSectionTitle: string | null
  headerHint: string | null
  footerHint: string | null
  signalReasons: string[]
}

export type DrawingSheetIdCandidateKind =
  | "DRAWING_NUMBER"
  | "PROJECT_NUMBER"
  | "PAGE_LABEL"
  | "INTERNAL_TAG"
  | "UNKNOWN"

export type IntakeDrawingIdentityHints = {
  sheetNumberCandidate: string | null
  sheetTitleCandidate: string | null
  titleBlockEvidence: string[]
  confidence: number
  selectedCandidateKind?: DrawingSheetIdCandidateKind
  registryValidated?: boolean
  titleRegistryValidated?: boolean
  sheetTitleTitleBlockPreferred?: boolean
  registryAssistMessage?: string | null
  /** When image-based pass ran after text extraction, preserves the prior deterministic hint for audit/merge. */
  textBasedHintBackup?: {
    sheetNumberCandidate: string | null
    sheetTitleCandidate: string | null
    confidence: number
  } | null
  /** Lightweight vision pass over the rendered page image (DRAWING pages only). */
  visualExtraction?: {
    used: boolean
    confidence: number | null
    titleBlockLocation?: string | null
    conflictWithTextHint?: boolean
  }
}

export type IntakePreparedPage = {
  pageNumber: number
  pdfFacts: IntakePdfFacts
  rawText: {
    fullText: string
    normalizedText: string
    lines: string[]
    tokens: PositionalTextToken[]
  }
  ocrText: {
    fullText: string | null
    normalizedText: string | null
  }
  pageImage: {
    imagePath: string | null
    width: number | null
    height: number | null
  }
  layoutEvidence: {
    lowYBandText: string | null
    highYBandText: string | null
    lowYRightCornerText: string | null
    highYRightCornerText: string | null
    tailText: string | null
    /** Set when band/corner strings used approximated coordinates vs native pdf.js geometry */
    positionalLayoutNote?: string | null
  }
  /** Provenance for rawText.tokens x/y; omitted when no usable tokens. */
  positionalEvidence?: IntakePositionalEvidence | null
  specSignals: IntakeSpecSignals
  routing: {
    initialPageType: IntakeRouteType
    fileDefaultType: IntakeRouteType | null
    likelyType: IntakeRouteType
    confidence: number
    reasons: string[]
    source: IntakeRoutingSource
    pageOverrideApplied: boolean
  }
  /** Deterministic title-block sheet hints; set after OCR for DRAWING-routed pages when found. */
  drawingIdentityHints?: IntakeDrawingIdentityHints
  extractionWarnings: string[]
  /** Early deterministic blank heuristic (before router); additive signal only. */
  fastBlank?: import("./fast-blank-pass").FastBlankPageMetadata
}

export type IntakeAiPageResult = {
  pageNumber: number
  pageClass: IntakePageClass
  pageSubtype: string
  sheetNumber: string | null
  sheetTitle: string | null
  discipline: string | null
  sectionNumber: string | null
  sectionTitle: string | null
  electricalRelevance: boolean | null
  structuralRole: IntakeStructuralRole | null
  sectionSignalStrength: IntakeSignalStrength
  packetSignalStrength: IntakeSignalStrength
  isLikelySectionStart: boolean
  isLikelySectionContinuation: boolean
  isLikelySectionEnd: boolean
  isLikelyPacketStart: boolean
  isLikelyPacketContinuation: boolean
  isLikelyPacketEnd: boolean
  confidence: number
  reviewRequired: boolean
  evidence: string | null
}

export type IntakeAiSignals = {
  structuralRole: IntakeStructuralRole | null
  sectionSignalStrength: IntakeSignalStrength
  packetSignalStrength: IntakeSignalStrength
  isLikelySectionStart: boolean
  isLikelySectionContinuation: boolean
  isLikelySectionEnd: boolean
  isLikelyPacketStart: boolean
  isLikelyPacketContinuation: boolean
  isLikelyPacketEnd: boolean
}

export type IntakeAnchorSummary = {
  kind: IntakeAnchorKind
  anchorPage: number
  startPage: number
  endPage: number
  displayTitle: string
  sectionNumber: string | null
  sectionTitle: string | null
  packetTitle: string | null
  pageNumbers: number[]
}

export type IntakeNormalizedPage = {
  pageNumber: number
  final: {
    pageClass: IntakePageClass
    pageSubtype: string
    sheetNumber: string | null
    sheetTitle: string | null
    discipline: string | null
    sectionNumber: string | null
    sectionTitle: string | null
    electricalRelevance: boolean | null
    scaleStatus: ScaleStatus
    scaleConfidence: number
    printSize: string | null
  }
  aiSignals: IntakeAiSignals
  anchor: {
    kind: IntakeAnchorKind
    anchorPage: number
    displayTitle: string
  } | null
  confidence: {
    overall: number
  }
  review: {
    status: IntakeReviewStatus
    reasons: string[]
  }
  evidence: string | null
}

export type IntakeDocumentSummary = {
  mixedContent: boolean
  counts: {
    drawingPages: number
    specPages: number
    bidPages: number
    generalPages: number
    blankPages: number
    reviewNeededPages: number
  }
  drawingSummary: {
    totalDrawingPages: number
    byDiscipline: Record<string, number>
    namedDrawingPages: number
    unnamedDrawingPages: number
  }
  specSummary: {
    totalSpecPages: number
    electricalRelatedPages: number
    sectionsDetected: Array<{
      sectionNumber: string | null
      sectionTitle: string | null
      isElectricalRelated: boolean
    }>
  }
}

export type IntakeAiFastPath =
  | { used: false }
  | { used: true; profile: "CSI" | "ARTICLE"; confidence: number }

export type IntakeRunResult = {
  pages: IntakeNormalizedPage[]
  summary: IntakeDocumentSummary
  ai: {
    enabled: boolean
    used: boolean
    model: string | null
    reviewedPages: number
    skippedReason: string | null
    fastPath: IntakeAiFastPath
  }
  specSections: Array<{
    sectionNumber: string | null
    sectionTitle: string | null
    startPage: number
    endPage: number
    pages: number[]
  }>
  anchors: IntakeAnchorSummary[]
}