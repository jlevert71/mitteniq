import { clamp } from "./layout-evidence"
import type {
  IntakePreparedPage,
  IntakeRouteType,
  IntakeRoutingSource,
} from "./types"

function hasReasonPrefix(reasons: string[], prefix: string) {
  return reasons.some((reason) => reason.startsWith(prefix))
}

function getWeightedVote(page: IntakePreparedPage) {
  const route = page.routing.initialPageType
  const confidence = clamp(page.routing.confidence ?? 0.45, 0, 1)

  if (route === "UNKNOWN") {
    return { route, weight: 0 }
  }

  let weight = confidence

  if (route === "DRAWING") {
    weight += 0.15
    if (hasReasonPrefix(page.routing.reasons, "LARGE_FORMAT_PAGE")) weight += 0.2
    if (hasReasonPrefix(page.routing.reasons, "DRAWING_SIGNALS_")) weight += 0.15
  }

  if (route === "SPEC") {
    weight += 0.15
    if (hasReasonPrefix(page.routing.reasons, "LETTER_SIZE_PAGE")) weight += 0.2
    if (hasReasonPrefix(page.routing.reasons, "SPEC_SIGNALS_")) weight += 0.15
    if (hasReasonPrefix(page.routing.reasons, "BID_SIGNALS_")) weight += 0.1
  }

  if (route === "MIXED") {
    weight += 0.05
  }

  return {
    route,
    weight: clamp(weight, 0, 1.5),
  }
}

function determineFileDefaultRoute(pages: IntakePreparedPage[]): {
  fileDefaultType: IntakeRouteType
  confidence: number
  reasons: string[]
} {
  const totals: Record<IntakeRouteType, number> = {
    DRAWING: 0,
    SPEC: 0,
    MIXED: 0,
    UNKNOWN: 0,
  }

  for (const page of pages) {
    const vote = getWeightedVote(page)
    totals[vote.route] += vote.weight
  }

  const consideredTotal = totals.DRAWING + totals.SPEC + totals.MIXED

  if (consideredTotal <= 0) {
    return {
      fileDefaultType: "UNKNOWN",
      confidence: 0.35,
      reasons: ["NO_STRONG_PAGE_ROUTE_SIGNAL"],
    }
  }

  const ordered = (Object.entries(totals) as Array<[IntakeRouteType, number]>)
    .filter(([route]) => route !== "UNKNOWN")
    .sort((a, b) => b[1] - a[1])

  const [topRoute, topWeight] = ordered[0]
  const secondWeight = ordered[1]?.[1] ?? 0
  const share = topWeight / consideredTotal
  const margin = topWeight - secondWeight

  if (topRoute === "MIXED" && share >= 0.4) {
    return {
      fileDefaultType: "MIXED",
      confidence: clamp(0.55 + share * 0.25, 0, 1),
      reasons: ["FILE_DEFAULT_MIXED", `TOP_SHARE_${share.toFixed(2)}`],
    }
  }

  if (share >= 0.55 || margin >= 0.75) {
    return {
      fileDefaultType: topRoute,
      confidence: clamp(0.6 + share * 0.3, 0, 1),
      reasons: [
        `FILE_DEFAULT_${topRoute}`,
        `TOP_SHARE_${share.toFixed(2)}`,
        `TOP_MARGIN_${margin.toFixed(2)}`,
      ],
    }
  }

  return {
    fileDefaultType: "MIXED",
    confidence: clamp(0.5 + share * 0.2, 0, 1),
    reasons: [
      "FILE_DEFAULT_MIXED_FROM_CONFLICT",
      `TOP_ROUTE_${topRoute}`,
      `TOP_SHARE_${share.toFixed(2)}`,
      `TOP_MARGIN_${margin.toFixed(2)}`,
    ],
  }
}

function shouldApplyPageOverride(
  page: IntakePreparedPage,
  fileDefaultType: IntakeRouteType,
) {
  const initial = page.routing.initialPageType
  const confidence = page.routing.confidence ?? 0.45
  const reasons = page.routing.reasons

  if (fileDefaultType === "UNKNOWN") return false
  if (initial === "UNKNOWN") return false
  if (initial === fileDefaultType) return false

  if (confidence >= 0.9) return true

  if (
    initial === "DRAWING" &&
    hasReasonPrefix(reasons, "LARGE_FORMAT_PAGE") &&
    hasReasonPrefix(reasons, "DRAWING_SIGNALS_")
  ) {
    return true
  }

  if (
    initial === "SPEC" &&
    hasReasonPrefix(reasons, "LETTER_SIZE_PAGE") &&
    (hasReasonPrefix(reasons, "SPEC_SIGNALS_") || hasReasonPrefix(reasons, "BID_SIGNALS_"))
  ) {
    return true
  }

  if (initial === "MIXED" && confidence >= 0.8) return true

  return false
}

function resolveFinalRoute(
  page: IntakePreparedPage,
  fileDefaultType: IntakeRouteType,
  fileDefaultConfidence: number,
): {
  likelyType: IntakeRouteType
  confidence: number
  source: IntakeRoutingSource
  pageOverrideApplied: boolean
  reasons: string[]
} {
  const initial = page.routing.initialPageType
  const initialConfidence = clamp(page.routing.confidence ?? 0.45, 0, 1)
  const reasons = [...page.routing.reasons]

  if (fileDefaultType === "UNKNOWN") {
    return {
      likelyType: initial,
      confidence: initialConfidence,
      source: "PAGE_ONLY",
      pageOverrideApplied: false,
      reasons: Array.from(new Set([...reasons, "FILE_DEFAULT_UNKNOWN"])),
    }
  }

  if (initial === "UNKNOWN") {
    return {
      likelyType: fileDefaultType,
      confidence: clamp(Math.max(0.58, fileDefaultConfidence * 0.9), 0, 1),
      source: "FILE_DEFAULT",
      pageOverrideApplied: false,
      reasons: Array.from(
        new Set([...reasons, `FILE_DEFAULT_APPLIED_${fileDefaultType}`]),
      ),
    }
  }

  if (initial === fileDefaultType) {
    return {
      likelyType: fileDefaultType,
      confidence: clamp(Math.max(initialConfidence, fileDefaultConfidence * 0.85), 0, 1),
      source: "FILE_DEFAULT",
      pageOverrideApplied: false,
      reasons: Array.from(
        new Set([...reasons, `PAGE_MATCHES_FILE_DEFAULT_${fileDefaultType}`]),
      ),
    }
  }

  if (shouldApplyPageOverride(page, fileDefaultType)) {
    return {
      likelyType: initial,
      confidence: clamp(Math.max(initialConfidence, 0.82), 0, 1),
      source: "PAGE_OVERRIDE",
      pageOverrideApplied: true,
      reasons: Array.from(
        new Set([...reasons, `PAGE_OVERRIDE_OVER_FILE_DEFAULT_${fileDefaultType}`]),
      ),
    }
  }

  return {
    likelyType: fileDefaultType,
    confidence: clamp(Math.max(initialConfidence * 0.8, fileDefaultConfidence * 0.85), 0, 1),
    source: "FILE_DEFAULT",
    pageOverrideApplied: false,
    reasons: Array.from(
      new Set([
        ...reasons,
        `FILE_DEFAULT_APPLIED_${fileDefaultType}`,
        `INITIAL_ROUTE_CONFLICT_${initial}`,
      ]),
    ),
  }
}

export function applyRouterStage(pages: IntakePreparedPage[]): {
  pages: IntakePreparedPage[]
  summary: {
    fileDefaultType: IntakeRouteType
    confidence: number
    reasons: string[]
    pageOverrideCount: number
    finalCounts: Record<IntakeRouteType, number>
  }
} {
  const fileDefault = determineFileDefaultRoute(pages)

  let pageOverrideCount = 0
  const finalCounts: Record<IntakeRouteType, number> = {
    DRAWING: 0,
    SPEC: 0,
    MIXED: 0,
    UNKNOWN: 0,
  }

  const updatedPages = pages.map((page) => {
    const resolved = resolveFinalRoute(
      page,
      fileDefault.fileDefaultType,
      fileDefault.confidence,
    )

    if (resolved.pageOverrideApplied) {
      pageOverrideCount += 1
    }

    finalCounts[resolved.likelyType] += 1

    return {
      ...page,
      routing: {
        ...page.routing,
        fileDefaultType: fileDefault.fileDefaultType,
        likelyType: resolved.likelyType,
        confidence: resolved.confidence,
        source: resolved.source,
        pageOverrideApplied: resolved.pageOverrideApplied,
        reasons: resolved.reasons,
      },
    }
  })

  return {
    pages: updatedPages,
    summary: {
      fileDefaultType: fileDefault.fileDefaultType,
      confidence: fileDefault.confidence,
      reasons: fileDefault.reasons,
      pageOverrideCount,
      finalCounts,
    },
  }
}