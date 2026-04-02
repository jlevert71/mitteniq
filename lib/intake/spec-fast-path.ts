import {
  extractSpecOutlineWithSectionRanges,
  parseCsiOutlineTitle,
  type SpecOutlineEntry,
  type SpecSectionRange,
} from "./spec-outline"

export type SpecFastPathProfile = "CSI" | "MDOT" | "ARTICLE" | "GENERIC" | "NONE"

export type SpecFastPathReasonCode =
  | "NO_OUTLINE"
  | "OUTLINE_TOO_SMALL"
  | "CSI_SECTION_RANGES_FOUND"
  | "MDOT_STYLE_OUTLINE_DETECTED"
  | "ARTICLE_STYLE_OUTLINE_DETECTED"
  | "GENERIC_STRUCTURED_OUTLINE"
  | "STRUCTURE_TOO_WEAK"
  | "INSUFFICIENT_SECTION_SIGNALS"

export type SpecFastPathEligibility = {
  eligible: boolean
  profile: SpecFastPathProfile
  confidence: number
  reasonCodes: SpecFastPathReasonCode[]
  reasoning: string[]
  metrics: {
    numPages: number
    outlineEntries: number
    sectionRanges: number
    csiLikeEntries: number
    articleLikeEntries: number
    mdotLikeEntries: number
    deepestDepth: number
    uniqueOutlinePages: number
    outlineCoverageRatio: number
    // Debug / instrumentation (optional): helps diagnose profile selection.
    deepManualEntries?: number
    deepManualPages?: number
    deepManualDepth?: number
    deepManualDensity?: number
    articleStrength?: number
    mdotStrength?: number
    articleSubtreeOverride?: boolean
    mdotOverwhelmingOverrideBlock?: boolean
  }
}

export type AnalyzeSpecFastPathParams = {
  pdfBuffer: Buffer
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0
  }
  return clamp01(numerator / denominator)
}

function normalizeTitleForMatch(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .replace(/[\u00a0]/g, " ")
    .trim()
    .toLowerCase()
}

function computeDeepestDepth(entries: SpecOutlineEntry[]): number {
  let maxDepth = 0
  for (const e of entries) {
    if (typeof e.depth !== "number") continue
    if (e.depth > maxDepth) maxDepth = e.depth
  }
  return maxDepth
}

function computeUniqueOutlinePageCount(entries: SpecOutlineEntry[]): number {
  const pages = new Set<number>()
  for (const e of entries) {
    if (typeof e.page === "number" && Number.isFinite(e.page) && e.page >= 1) pages.add(e.page)
  }
  return pages.size
}

function isCsiLikeTitle(title: string): boolean {
  return parseCsiOutlineTitle(title) !== null
}

const ARTICLE_WORD_RE = /\barticle\b/i
const PART_PREFIX_RE = /^part\s+((?:\d+|[ivxlcdm]+))\b/i

function getArticlePartKey(title: string): string | null {
  const norm = normalizeTitleForMatch(title)
  const m = norm.match(PART_PREFIX_RE)
  if (!m) return null
  // Keep roman numerals as-is; normalizeTitleForMatch lowercases them.
  const part = m[1]
  return `part-${part}`
}

function isArticleLikeTitle(title: string): boolean {
  const norm = normalizeTitleForMatch(title)
  return ARTICLE_WORD_RE.test(norm) || PART_PREFIX_RE.test(norm)
}

const MANUAL_HIERARCHY_KEYWORDS: Array<{ tag: string; re: RegExp }> = [
  { tag: "division", re: /\bdivision\b/i },
  { tag: "section", re: /\bsection\b/i },
  { tag: "general", re: /\bgeneral\b/i },
  { tag: "products", re: /\bproducts?\b/i },
  { tag: "execution", re: /\bexecution\b/i },
  { tag: "references", re: /\breferences?\b/i },
  { tag: "submittals", re: /\bsubmittals?\b/i },
  { tag: "quality_assurance", re: /\bquality\s+assurance\b/i },
]

function extractArticleKeywordTags(title: string): Set<string> {
  const norm = normalizeTitleForMatch(title)
  const tags = new Set<string>()
  for (const { tag, re } of MANUAL_HIERARCHY_KEYWORDS) {
    if (re.test(norm)) tags.add(tag)
  }
  return tags
}

function isManualHierarchyLikeTitle(title: string): boolean {
  return extractArticleKeywordTags(title).size > 0
}

function hasManualSemanticAnchor(title: string): boolean {
  const norm = normalizeTitleForMatch(title)

  return (
    isArticleLikeTitle(title) ||
    isManualHierarchyLikeTitle(title) ||
    /\b(article|part|division|section|general|products?|execution|references?|submittals?|quality assurance|summary|definitions|materials|equipment|installation)\b/i.test(
      norm,
    )
  )
}

function isStructuralHeadingLike(title: string): boolean {
  const norm = normalizeTitleForMatch(title)

  return (
    /^\d+\.\d+\b/.test(norm) ||
    /^[a-z]\./i.test(norm) ||
    /^\d+\)/.test(norm) ||
    /^[a-z]\)/i.test(norm) ||
    /^section\s+\d+\b/i.test(norm)
  )
}

function isDeepManualSubtreeEntry(title: string, depth: number): boolean {
  if (depth < 3) return false

  if (isArticleLikeTitle(title)) return true
  if (isManualHierarchyLikeTitle(title)) return true

  return isStructuralHeadingLike(title) && hasManualSemanticAnchor(title)
}

const MDOT_TITLE_PATTERNS: Array<{ tag: string; re: RegExp }> = [
  { tag: "proposal_bid", re: /\b(proposal|bid|bidding|bids)\b/i },
  { tag: "contract", re: /\b(contract|special\s+provisions?|special\s+provision)\b/i },
  { tag: "wage_rates", re: /\b(wage\s+rates?|prevailing\s+wage)\b/i },
  { tag: "instructions_to_bidders", re: /\binstructions?\s+to\s+bidders?\b/i },
  { tag: "notice", re: /\bnotice\b/i },
  { tag: "index", re: /\bindex\b/i },
  { tag: "addendum", re: /(?:\baddendum\b|\baddenda?\b)/i },
]

function extractMdotKeywordTags(title: string): Set<string> {
  const norm = normalizeTitleForMatch(title)
  const tags = new Set<string>()
  for (const { tag, re } of MDOT_TITLE_PATTERNS) {
    if (re.test(norm)) tags.add(tag)
  }
  return tags
}

function isMdotLikeTitle(title: string): boolean {
  const tags = extractMdotKeywordTags(title)
  return tags.size > 0
}

function scoreForCount(count: number, ideal: number): number {
  if (ideal <= 0) return 0
  return clamp01(count / ideal)
}

function scoreForRatio(ratio: number, idealRatio: number): number {
  if (idealRatio <= 0) return 0
  return clamp01(ratio / idealRatio)
}

function scoreForDepth(depth: number, idealDepth: number): number {
  if (idealDepth <= 0) return 0
  if (depth <= 0) return 0
  return clamp01(depth / idealDepth)
}

function computeArticleStrengthScore(args: {
  outlineEntries: number
  manualHierarchyLikeEntriesCount: number
  manualHierarchyTagCount: number
  manualHierarchyUniquePagesCount: number
  deepestDepth: number
  outlineCoverageRatio: number
  articlePartCount: number
  articleLikeEntries: number
}): number {
  const {
    outlineEntries,
    manualHierarchyLikeEntriesCount,
    manualHierarchyTagCount,
    manualHierarchyUniquePagesCount,
    deepestDepth,
    outlineCoverageRatio,
    articlePartCount,
    articleLikeEntries,
  } = args

  const manualPropScore = safeRatio(manualHierarchyLikeEntriesCount, outlineEntries)
  const manualTagScore = scoreForCount(manualHierarchyTagCount, 4)
  const manualUniquePagesScore = scoreForCount(manualHierarchyUniquePagesCount, 4)
  const depthScore = scoreForDepth(deepestDepth, 4)
  const coverageScore = scoreForRatio(outlineCoverageRatio, 0.06)
  const partScore = scoreForCount(articlePartCount, 3)
  const articleWordProp = safeRatio(articleLikeEntries, outlineEntries)

  // Manual hierarchy cues should dominate the ARTICLE score, since MDOT keywords can overlap.
  const score =
    0.38 * manualPropScore +
    0.08 * manualTagScore +
    0.16 * manualUniquePagesScore +
    0.22 * depthScore +
    0.06 * coverageScore +
    0.08 * partScore +
    0.02 * articleWordProp

  return clamp01(score)
}

function computeMdotStrengthScore(args: {
  outlineEntries: number
  mdotLikeEntries: number
  mdotKeywordTagCount: number
  deepestDepth: number
  outlineCoverageRatio: number
  uniqueOutlinePages: number
}): number {
  const {
    outlineEntries,
    mdotLikeEntries,
    mdotKeywordTagCount,
    deepestDepth,
    outlineCoverageRatio,
    uniqueOutlinePages,
  } = args

  const mdotPropScore = safeRatio(mdotLikeEntries, outlineEntries)
  const mdotTagScore = scoreForCount(mdotKeywordTagCount, 4)
  const depthScore = scoreForDepth(deepestDepth, 4)
  const coverageScore = scoreForRatio(outlineCoverageRatio, 0.06)
  const spreadScore = scoreForCount(uniqueOutlinePages, 6)

  // MDOT score emphasizes keyword-family hits plus overall outline spread.
  // Damp raw keyword-volume influence (mdotPropScore) via sqrt so repeated
  // public/manual vocabulary doesn't dominate classification.
  const mdotPropDamped = Math.sqrt(mdotPropScore)

  const score =
    0.2 * mdotPropDamped +
    0.28 * mdotTagScore +
    0.22 * depthScore +
    0.12 * coverageScore +
    0.18 * spreadScore

  return clamp01(score)
}

function pickReasonCodesAndConfidence(args: {
  profile: SpecFastPathProfile
  eligible: boolean
  metrics: SpecFastPathEligibility["metrics"]
  csiLikeEntries: number
  outlineEntries: number
  articleLikeEntries: number
  mdotLikeEntries: number
}): { reasonCodes: SpecFastPathReasonCode[]; confidence: number; reasoning: string[] } {
  const { profile, eligible, metrics } = args
  const reasonCodes: SpecFastPathReasonCode[] = []
  const reasoning: string[] = []

  const coveragePct = (metrics.outlineCoverageRatio * 100).toFixed(1)

  reasoning.push(
    `${metrics.outlineEntries} outline entries were found across ${metrics.numPages} pages; deepest outline depth is ${metrics.deepestDepth}.`,
  )
  reasoning.push(
    `${metrics.uniqueOutlinePages} unique outline pages were referenced; coverage ratio is ${coveragePct}%.`,
  )

  if (profile === "NONE") {
    if (metrics.outlineEntries === 0) reasonCodes.push("NO_OUTLINE")
    else reasonCodes.push("OUTLINE_TOO_SMALL")
    reasonCodes.push("STRUCTURE_TOO_WEAK")
    return { reasonCodes, confidence: 0, reasoning }
  }

  if (profile === "CSI") {
    reasonCodes.push("CSI_SECTION_RANGES_FOUND")

    reasoning.push(
      `${metrics.sectionRanges} CSI-style section ranges were derived from bookmarks.`,
    )
    reasoning.push(
      `${metrics.csiLikeEntries} CSI-like outline titles matched the MasterFormat/CSI-style leading-number pattern.`,
    )

    // Conservative scoring based on how many distinct sections/ranges we can see.
    const rangeCountScore = scoreForCount(metrics.sectionRanges, 20)
    const coverageScore = scoreForRatio(metrics.outlineCoverageRatio, 0.1)
    const depthScore = scoreForDepth(metrics.deepestDepth, 3)
    const csiProp = safeRatio(metrics.csiLikeEntries, metrics.outlineEntries)

    let confidence = 0.25 + 0.25 * rangeCountScore + 0.25 * coverageScore + 0.15 * depthScore + 0.1 * csiProp
    confidence = clamp01(confidence)

    if (!eligible) {
      reasonCodes.push("STRUCTURE_TOO_WEAK")
      reasoning.push("CSI structure exists, but section-level coverage is not strong enough to recommend a safe fast-path.")
      confidence = confidence * 0.85
    }

    // Ensure a strong CSI PDF can reach ~0.9+ when metrics are strong.
    if (eligible && metrics.sectionRanges >= 30 && metrics.outlineCoverageRatio >= 0.1 && metrics.deepestDepth >= 3) {
      confidence = Math.max(confidence, 0.92)
    }

    return { reasonCodes, confidence: clamp01(confidence), reasoning }
  }

  if (profile === "ARTICLE") {
    reasonCodes.push("ARTICLE_STYLE_OUTLINE_DETECTED")
    reasoning.push(
      `${metrics.articleLikeEntries} ARTICLE/PART-style outline titles were detected (e.g., "Article …", "Part 1/2/…").`,
    )

    const articleProp = safeRatio(metrics.articleLikeEntries, metrics.outlineEntries)
    const countScore = scoreForCount(metrics.articleLikeEntries, 15)
    const coverageScore = scoreForRatio(metrics.outlineCoverageRatio, 0.06)
    const depthScore = scoreForDepth(metrics.deepestDepth, 3)

    let confidence = 0.18 + 0.25 * countScore + 0.25 * coverageScore + 0.2 * depthScore + 0.12 * articleProp
    confidence = clamp01(confidence)

    if (!eligible) {
      reasonCodes.push("STRUCTURE_TOO_WEAK")
      reasoning.push("Manual/article hierarchy appears, but it is not rich enough (or not distributed enough) for a safe structure-first fast-path.")
      confidence = confidence * 0.8
    }

    return { reasonCodes, confidence: clamp01(confidence), reasoning }
  }

  if (profile === "MDOT") {
    reasonCodes.push("MDOT_STYLE_OUTLINE_DETECTED")
    reasoning.push(
      `${metrics.mdotLikeEntries} proposal/spec-package-like outline titles were detected (e.g., bid/contract/special provisions, instructions, index).`,
    )

    const mdotProp = safeRatio(metrics.mdotLikeEntries, metrics.outlineEntries)
    const countScore = scoreForCount(metrics.mdotLikeEntries, 15)
    const coverageScore = scoreForRatio(metrics.outlineCoverageRatio, 0.06)
    const depthScore = scoreForDepth(metrics.deepestDepth, 3)

    let confidence = 0.16 + 0.25 * countScore + 0.22 * coverageScore + 0.25 * depthScore + 0.12 * mdotProp
    confidence = clamp01(confidence)

    if (!eligible) {
      reasonCodes.push("STRUCTURE_TOO_WEAK")
      reasoning.push("MDOT/package-style hierarchy cues exist, but evidence is not strong enough to guarantee structure-first safety.")
      confidence = confidence * 0.82
    }

    return { reasonCodes, confidence: clamp01(confidence), reasoning }
  }

  // GENERIC
  reasonCodes.push("GENERIC_STRUCTURED_OUTLINE")
  if (!eligible) {
    reasonCodes.push("STRUCTURE_TOO_WEAK")
  }

  // If there are no strong section signals, keep confidence low.
  const sectionSignals = args.csiLikeEntries + args.articleLikeEntries + args.mdotLikeEntries
  const hasFewSignals = sectionSignals <= Math.max(3, Math.floor(args.outlineEntries * 0.05))

  reasoning.push(
    "Outline appears structured, but it does not clearly fit CSI, ARTICLE, or MDOT enough for a robust fast-path.",
  )
  if (hasFewSignals) reasonCodes.push("INSUFFICIENT_SECTION_SIGNALS")

  const countScore = scoreForCount(metrics.outlineEntries, 25)
  const coverageScore = scoreForRatio(metrics.outlineCoverageRatio, 0.05)
  const depthScore = scoreForDepth(metrics.deepestDepth, 3)

  // Keep generic conservative.
  let confidence = 0.05 + 0.2 * countScore + 0.25 * coverageScore + 0.25 * depthScore
  confidence = clamp01(confidence)
  if (!eligible) confidence = confidence * 0.6

  return { reasonCodes, confidence, reasoning }
}

function computeEligibilityAndProfile(args: {
  numPages: number
  outline: SpecOutlineEntry[]
  sectionRanges: SpecSectionRange[]
}): { profile: SpecFastPathProfile; eligible: boolean; metrics: SpecFastPathEligibility["metrics"]; articlePartKeys: Set<string>; mdotKeywordTags: Set<string> } {
  const { numPages, outline, sectionRanges } = args

  const outlineEntries = outline.length
  const sectionRangeCount = sectionRanges.length
  const deepestDepth = computeDeepestDepth(outline)
  const uniqueOutlinePages = computeUniqueOutlinePageCount(outline)
  const outlineCoverageRatio = numPages > 0 ? uniqueOutlinePages / numPages : 0

  const deepManualEntries = outline.filter((e) => isDeepManualSubtreeEntry(e.title, e.depth))

  const deepManualUniquePages = new Set(
    deepManualEntries
      .map((e) => e.page)
      .filter((p): p is number => Number.isFinite(p) && p >= 1),
  )

  const deepManualDeepestDepth = deepManualEntries.reduce(
    (max, e) => Math.max(max, e.depth ?? 0),
    0,
  )

  const deepManualDensity = safeRatio(deepManualEntries.length, outlineEntries)

  let csiLikeEntries = 0
  let articleLikeEntries = 0
  let mdotLikeEntries = 0
  const articlePartKeys = new Set<string>()
  const mdotKeywordTags = new Set<string>()
  let manualHierarchyLikeEntries = 0
  const manualHierarchyKeywordTags = new Set<string>()
  const manualHierarchyUniqueOutlinePages = new Set<number>()

  for (const e of outline) {
    if (isCsiLikeTitle(e.title)) csiLikeEntries++
    if (isArticleLikeTitle(e.title)) {
      articleLikeEntries++
      const partKey = getArticlePartKey(e.title)
      if (partKey) articlePartKeys.add(partKey)
    }
    {
      const manualTags = extractArticleKeywordTags(e.title)
      if (manualTags.size > 0) {
        manualHierarchyLikeEntries++
        for (const tag of manualTags) manualHierarchyKeywordTags.add(tag)
        if (typeof e.page === "number" && Number.isFinite(e.page) && e.page >= 1) {
          manualHierarchyUniqueOutlinePages.add(e.page)
        }
      }
    }
    if (isMdotLikeTitle(e.title)) {
      mdotLikeEntries++
      for (const tag of extractMdotKeywordTags(e.title)) mdotKeywordTags.add(tag)
    }
  }

  const articlePartCount = articlePartKeys.size
  const manualHierarchyLikeEntriesCount = manualHierarchyLikeEntries
  const manualHierarchyTagCount = manualHierarchyKeywordTags.size
  const manualHierarchyUniquePagesCount = manualHierarchyUniqueOutlinePages.size
  const mdotKeywordTagCount = mdotKeywordTags.size

  const articleStrength = computeArticleStrengthScore({
    outlineEntries,
    manualHierarchyLikeEntriesCount,
    manualHierarchyTagCount,
    manualHierarchyUniquePagesCount,
    deepestDepth,
    outlineCoverageRatio,
    articlePartCount,
    articleLikeEntries,
  })

  const mdotStrength = computeMdotStrengthScore({
    outlineEntries,
    mdotLikeEntries,
    mdotKeywordTagCount,
    deepestDepth,
    outlineCoverageRatio,
    uniqueOutlinePages,
  })

  let metrics: SpecFastPathEligibility["metrics"] = {
    numPages,
    outlineEntries,
    sectionRanges: sectionRangeCount,
    csiLikeEntries,
    articleLikeEntries,
    mdotLikeEntries,
    deepestDepth,
    uniqueOutlinePages,
    outlineCoverageRatio,
    deepManualEntries: deepManualEntries.length,
    deepManualPages: deepManualUniquePages.size,
    deepManualDepth: deepManualDeepestDepth,
    deepManualDensity,
    articleStrength,
    mdotStrength,
    articleSubtreeOverride: false,
    mdotOverwhelmingOverrideBlock: false,
  }

  // Conservative "trivial/useless outline" gate.
  const isNoOutline = outlineEntries === 0
  const isTriviallySmallOrUseless =
    !isNoOutline && (outlineEntries < 3 || uniqueOutlinePages < 2)

  if (isNoOutline || isTriviallySmallOrUseless) {
    return { profile: "NONE", eligible: false, metrics, articlePartKeys, mdotKeywordTags }
  }

  // Profile selection follows requested priority.
  if (sectionRangeCount > 0) {
    const csiBaseEligible =
      sectionRangeCount >= 5 &&
      deepestDepth >= 2 &&
      uniqueOutlinePages >= 3 &&
      outlineCoverageRatio >= 0.03

    // Fishbeck-like / flat CSI outlines can be eligible with depth=1 as long as
    // the derived section-range evidence is very strong.
    const csiStrongFlatEligible =
      sectionRangeCount >= 25 &&
      csiLikeEntries >= 20 &&
      uniqueOutlinePages >= 20 &&
      outlineCoverageRatio >= 0.08

    const eligible = csiBaseEligible || csiStrongFlatEligible
    return { profile: "CSI", eligible, metrics, articlePartKeys, mdotKeywordTags }
  }

  // No CSI ranges: allow ARTICLE / MDOT detection.
  const hasStrongManualHierarchySignals =
    manualHierarchyLikeEntriesCount >= Math.max(6, Math.floor(outlineEntries * 0.12)) &&
    manualHierarchyTagCount >= 3 &&
    manualHierarchyUniquePagesCount >= 3 &&
    deepestDepth >= 2 &&
    uniqueOutlinePages >= 3

  const hasStrongArticleSignals =
    (articleLikeEntries >= Math.max(3, Math.floor(outlineEntries * 0.1)) &&
      articlePartCount >= 2 &&
      deepestDepth >= 2 &&
      uniqueOutlinePages >= 3) ||
    (hasStrongManualHierarchySignals &&
      manualHierarchyLikeEntriesCount >= Math.max(12, Math.floor(outlineEntries * 0.18)) &&
      (outlineCoverageRatio >= 0.03 || deepestDepth >= 3) &&
      manualHierarchyUniquePagesCount >= 4)

  const hasStrongMdotSignals =
    mdotLikeEntries >= Math.max(3, Math.floor(outlineEntries * 0.1)) &&
    mdotKeywordTagCount >= 2 &&
    deepestDepth >= 2 &&
    uniqueOutlinePages >= 3

  // Use a meaningful dominance margin so broad MDOT keyword hits don't override
  // deep manual/article hierarchy evidence.
  const dominanceMargin = 0.1
  const articleClearlyDominant = articleStrength >= mdotStrength + dominanceMargin
  const mdotClearlyDominant = mdotStrength >= articleStrength + dominanceMargin

  const articleEligible =
    (articleLikeEntries >= 5 &&
      outlineEntries >= 10 &&
      deepestDepth >= 2 &&
      uniqueOutlinePages >= 3 &&
      outlineCoverageRatio >= 0.03) ||
    (manualHierarchyLikeEntriesCount >=
      Math.max(10, Math.floor(outlineEntries * 0.18)) &&
      outlineEntries >= 15 &&
      deepestDepth >= 2 &&
      uniqueOutlinePages >= 4 &&
      outlineCoverageRatio >= 0.05 &&
      manualHierarchyTagCount >= 3 &&
      manualHierarchyUniquePagesCount >= 4)

  const mdotEligible =
    mdotLikeEntries >= 5 &&
    outlineEntries >= 12 &&
    deepestDepth >= 2 &&
    uniqueOutlinePages >= 3 &&
    outlineCoverageRatio >= 0.03

  // Conservative ARTICLE override:
  // If the hierarchy is *structurally* dominant for manual/article-style organization
  // (deep nesting + repeated manual hierarchy cues across multiple pages),
  // prefer ARTICLE unless MDOT evidence is overwhelmingly stronger.
  const articleManualDominantForOverride =
    deepManualDeepestDepth >= 5 &&
    deepManualEntries.length >= Math.max(40, Math.floor(outlineEntries * 0.10)) &&
    deepManualUniquePages.size >= Math.max(8, Math.floor(uniqueOutlinePages * 0.20)) &&
    safeRatio(deepManualEntries.length, outlineEntries) >= 0.10 &&
    articleStrength >= 0.55

  if (articleManualDominantForOverride) {
    const mdotOverwhelming = mdotStrength >= articleStrength + 0.28
    if (!mdotOverwhelming) {
      return { profile: "ARTICLE", eligible: articleEligible, metrics, articlePartKeys, mdotKeywordTags }
    }
    // If MDOT is overwhelmingly stronger, keep MDOT behavior.
    if (mdotOverwhelming) {
      return { profile: "MDOT", eligible: mdotEligible, metrics, articlePartKeys, mdotKeywordTags }
    }
  }

  // Strength-driven pick in the no-CSI branch.
  if (articleClearlyDominant && articleEligible) {
    return { profile: "ARTICLE", eligible: true, metrics, articlePartKeys, mdotKeywordTags }
  }

  if (mdotClearlyDominant && mdotEligible) {
    return { profile: "MDOT", eligible: true, metrics, articlePartKeys, mdotKeywordTags }
  }

  // If no clear winner, preserve conservative bias using existing gates.
  if (hasStrongArticleSignals) {
    return { profile: "ARTICLE", eligible: articleEligible, metrics, articlePartKeys, mdotKeywordTags }
  }

  const articleSubtreeOverride =
    deepManualEntries.length >= 40 &&
    deepManualUniquePages.size >= 8 &&
    deepManualDeepestDepth >= 5 &&
    deepManualDensity >= 0.10

  if (articleSubtreeOverride) {
    metrics.articleSubtreeOverride = true
    const mdotOverwhelming =
      mdotStrength >= articleStrength + 0.18 &&
      mdotLikeEntries >= Math.max(20, Math.floor(outlineEntries * 0.15))

    if (mdotOverwhelming) {
      metrics.mdotOverwhelmingOverrideBlock = true
    }

    if (!mdotOverwhelming) {
      return {
        profile: "ARTICLE",
        eligible: articleEligible,
        metrics,
        articlePartKeys,
        mdotKeywordTags,
      }
    }
  }

  if (hasStrongMdotSignals) {
    return { profile: "MDOT", eligible: mdotEligible, metrics, articlePartKeys, mdotKeywordTags }
  }

  // GENERIC: exists but does not clearly fit.
  const eligible =
    (outlineEntries >= 45 &&
      deepestDepth >= 4 &&
      outlineCoverageRatio >= 0.08 &&
      uniqueOutlinePages >= 6) ||
    (outlineEntries >= 35 &&
      deepestDepth >= 3 &&
      outlineCoverageRatio >= 0.12 &&
      uniqueOutlinePages >= 5)

  return { profile: "GENERIC", eligible, metrics, articlePartKeys, mdotKeywordTags }
}

export async function analyzeSpecFastPathEligibility(
  params: AnalyzeSpecFastPathParams,
): Promise<SpecFastPathEligibility> {
  const { pdfBuffer } = params
  const { outline, sectionRanges, numPages } = await extractSpecOutlineWithSectionRanges(pdfBuffer)
  const numPagesSafe = Number.isFinite(numPages) && numPages > 0 ? numPages : 1

  const { profile, eligible, metrics } = computeEligibilityAndProfile({
    numPages: numPagesSafe,
    outline,
    sectionRanges,
  })

  const { reasonCodes, confidence, reasoning } = pickReasonCodesAndConfidence({
    profile,
    eligible,
    metrics,
    csiLikeEntries: metrics.csiLikeEntries,
    outlineEntries: metrics.outlineEntries,
    articleLikeEntries: metrics.articleLikeEntries,
    mdotLikeEntries: metrics.mdotLikeEntries,
  })

  return {
    eligible,
    profile,
    confidence: clamp01(confidence),
    reasonCodes,
    reasoning,
    metrics,
  }
}

