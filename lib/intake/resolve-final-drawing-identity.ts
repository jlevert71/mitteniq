/**
 * Single deterministic chooser for final DRAWING sheet identity after hint/AI merge.
 * No new extraction; ranking + plausibility + cleanup only.
 */

import {
  lookupRegistryEntry,
  parseSheetCell,
  type DrawingSetRegistry,
} from "./drawing-set-registry"
import type { IntakeDrawingIdentityHints, IntakePageClass, IntakePreparedPage } from "./types"

const MAX_TITLE_LEN = 100
const MAX_TITLE_WORDS = 14

function collapseHyphens(s: string): string {
  return s.replace(/[–—]/g, "-")
}

function clean(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.replace(/\s+/g, " ").trim()
  return t.length ? t : null
}

function isParagraphLikeTitleText(t: string): boolean {
  const s = t.trim()
  if (s.length > MAX_TITLE_LEN) return true
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length > MAX_TITLE_WORDS) return true
  if ((s.match(/[.!?]/g) ?? []).length >= 2) return true
  return false
}

/** Drawing sheet IDs only: D/E/I + 1–3 digit number (leading zeros OK). */
export function isPlausibleDrawingSheetNumber(value: string | null | undefined): boolean {
  const raw = clean(value)
  if (!raw) return false
  const v = collapseHyphens(raw)
  if (v.length > 22) return false
  if (/[\n\r]/.test(v)) return false
  if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(v)) return false
  if (/^\s*page\s+/i.test(v)) return false
  if (/\bC-\d{4,}\b/i.test(v)) return false
  if (/\bC-\d{4,}\b/i.test(v) && /[a-z]{10,}/i.test(v)) return false
  if (/^C-\d{1,2}$/i.test(v)) return false
  if (!/^([DEI])-0*\d{1,3}$/i.test(v)) return false
  return true
}

export function isPlausibleDrawingSheetTitle(
  title: string | null | undefined,
  opts?: { sheetNumberForEchoCheck?: string | null; allowNumberEchoLastResort?: boolean },
): boolean {
  const raw = clean(title)
  if (!raw) return false
  if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(raw)) return false
  let t = stripPageOfLabels(raw)
  t = stripProjectPrefixFromTitle(t)
  if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(t)) return false
  if (isParagraphLikeTitleText(t)) return false
  if (/\b(refer to|see note|notes?:|not to scale|contractor shall|shall be responsible|for information only)\b/i.test(t)) {
    return false
  }
  if (t.length > MAX_TITLE_LEN) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > 16) return false

  const sn = opts?.sheetNumberForEchoCheck
  if (sn && !opts?.allowNumberEchoLastResort) {
    const normTitle = collapseHyphens(t).replace(/\s/g, "").toUpperCase()
    const normSn = collapseHyphens(sn).replace(/\s/g, "").toUpperCase()
    if (normTitle === normSn || normTitle === normSn.replace(/^([DEI])-0+/, "$1-")) return false
  }
  return true
}

function stripPageOfLabels(s: string): string {
  return s.replace(/\bpage\s+\d+\s+of\s+\d+\b/gi, " ").replace(/\s+/g, " ").trim()
}

function stripProjectPrefixFromTitle(s: string): string {
  return s.replace(/^\s*C-\d{4,}\s*[-–—:/.]?\s*/i, "").trim()
}

export function cleanupFinalDrawingIdentityStrings(
  sheetNumber: string | null,
  sheetTitle: string | null,
): { sheetNumber: string | null; sheetTitle: string | null } {
  let sn = clean(sheetNumber)
  let st = clean(sheetTitle)

  if (sn) {
    sn = collapseHyphens(sn).toUpperCase().replace(/^([DEI])-0+(\d)/, (_, a, b) => `${a}-${b}`)
    const m = sn.match(/^([DEI])-(\d{1,3})$/i)
    if (m) sn = `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`
  }

  if (st) {
    st = stripPageOfLabels(st)
    st = stripProjectPrefixFromTitle(st)
    st = st.replace(/([.,;:!?])\1+/g, "$1")
    st = st.replace(/\s+/g, " ").replace(/^[,;:.]+|[,;:.]+$/g, "").trim()
    if (st.length > MAX_TITLE_LEN) st = st.slice(0, MAX_TITLE_LEN).trim()
  }

  return { sheetNumber: sn, sheetTitle: st || null }
}

function preparedPrimaryText(prepared: IntakePreparedPage | undefined): string {
  if (!prepared) return ""
  const raw = prepared.rawText.normalizedText?.trim() ?? ""
  const ocr = prepared.ocrText.normalizedText?.trim() ?? ""
  return raw.length >= ocr.length ? raw : ocr
}

export function isCoverOrSheetIndexDrawingPage(
  pageNumber: number,
  pageSubtype: string,
  prepared: IntakePreparedPage | undefined,
): boolean {
  if (pageNumber === 1) return true
  const st = pageSubtype.toUpperCase()
  if (
    st.includes("COVER") ||
    (st.includes("INDEX") && (st.includes("SHEET") || st.includes("DRAWING"))) ||
    (st.includes("TITLE") && st.includes("SHEET"))
  ) {
    return true
  }
  const text = preparedPrimaryText(prepared).slice(0, 6000).toLowerCase()
  if (
    /\b(sheet\s+index|drawing\s+index|index\s+of\s+sheets|cover\s+sheet|project\s+directory|drawing\s+list)\b/.test(
      text,
    )
  ) {
    return true
  }
  return false
}

export type ResolveFinalDrawingIdentityArgs = {
  pageNumber: number
  pageClass: IntakePageClass
  pageSubtype: string
  mergedSheetNumber: string | null
  mergedSheetTitle: string | null
  aiSheetNumber: string | null
  aiSheetTitle: string | null
  hints: IntakeDrawingIdentityHints | undefined
  registry: DrawingSetRegistry
  prepared: IntakePreparedPage | undefined
}

export type ResolveFinalDrawingIdentityResult = {
  sheetNumber: string | null
  sheetTitle: string | null
  reason: string
  /** When true, downstream must not replace sheet number with weaker sources. */
  registryValidatedLocked: boolean
}

function tierA_registryValidatedHint(
  hints: IntakeDrawingIdentityHints | undefined,
  registry: DrawingSetRegistry,
): ResolveFinalDrawingIdentityResult | null {
  if (!hints?.registryValidated) return null
  const hintNum = clean(hints.sheetNumberCandidate)
  if (!hintNum || !isPlausibleDrawingSheetNumber(hintNum)) return null
  const entry = lookupRegistryEntry(registry, hintNum)
  if (!entry) return null

  const cleaned = cleanupFinalDrawingIdentityStrings(entry.canonicalSheetNumber, entry.canonicalTitle)
  if (!cleaned.sheetNumber) return null

  return {
    sheetNumber: cleaned.sheetNumber,
    sheetTitle: cleaned.sheetTitle,
    reason: "A_registry_validated_hint",
    registryValidatedLocked: true,
  }
}

function tierB_strongTitleBlockHint(
  hints: IntakeDrawingIdentityHints | undefined,
): ResolveFinalDrawingIdentityResult | null {
  if (!hints || hints.registryValidated) return null
  const hintNum = clean(hints.sheetNumberCandidate)
  const hintTitle = clean(hints.sheetTitleCandidate)
  if (!hintNum || !isPlausibleDrawingSheetNumber(hintNum)) return null

  const evidence = (hints.titleBlockEvidence ?? []).join(" ")
  const nearDrawingNo = /\+drawingNo|drawingNo/i.test(evidence)

  const strong =
    hints.confidence >= 0.88 &&
    (hints.sheetTitleTitleBlockPreferred === true || hints.confidence >= 0.9 || nearDrawingNo)

  if (!strong && hints.confidence < 0.85) return null

  const titleOk =
    hintTitle &&
    isPlausibleDrawingSheetTitle(hintTitle, { sheetNumberForEchoCheck: hintNum })

  const cleaned = cleanupFinalDrawingIdentityStrings(hintNum, titleOk ? hintTitle : null)
  return {
    sheetNumber: cleaned.sheetNumber,
    sheetTitle: cleaned.sheetTitle,
    reason: titleOk ? "B_strong_title_block_hint" : "B_strong_hint_sheet_only",
    registryValidatedLocked: false,
  }
}

function tierC_aiPlausible(
  aiSheet: string | null,
  aiTitle: string | null,
): ResolveFinalDrawingIdentityResult | null {
  const sn = clean(aiSheet)
  const st = clean(aiTitle)
  if (!sn || !isPlausibleDrawingSheetNumber(sn)) return null

  if (st && isPlausibleDrawingSheetTitle(st, { sheetNumberForEchoCheck: sn })) {
    const cleaned = cleanupFinalDrawingIdentityStrings(sn, st)
    return {
      sheetNumber: cleaned.sheetNumber,
      sheetTitle: cleaned.sheetTitle,
      reason: "C_ai_plausible",
      registryValidatedLocked: false,
    }
  }

  const cleaned = cleanupFinalDrawingIdentityStrings(sn, null)
  return {
    sheetNumber: cleaned.sheetNumber,
    sheetTitle: null,
    reason: "C_ai_sheet_only",
    registryValidatedLocked: false,
  }
}

function resolveCoverOrIndexIdentity(
  args: ResolveFinalDrawingIdentityArgs,
): ResolveFinalDrawingIdentityResult | null {
  const { pageNumber, pageSubtype, prepared, registry, hints, mergedSheetTitle } = args
  if (!isCoverOrSheetIndexDrawingPage(pageNumber, pageSubtype, prepared)) return null

  const d0 =
    lookupRegistryEntry(registry, "D-0") ??
    lookupRegistryEntry(registry, "D-000") ??
    lookupRegistryEntry(registry, "D-00")

  if (d0) {
    const cleaned = cleanupFinalDrawingIdentityStrings(d0.canonicalSheetNumber, d0.canonicalTitle)
    return {
      sheetNumber: cleaned.sheetNumber,
      sheetTitle: cleaned.sheetTitle,
      reason: "cover_registry_D0",
      registryValidatedLocked: true,
    }
  }

  const hintNum = clean(hints?.sheetNumberCandidate)
  const hintParsed = hintNum ? parseSheetCell(hintNum) : null
  if (hintParsed && hintParsed.letter === "D" && hintParsed.num === 0) {
    const ht = clean(hints?.sheetTitleCandidate) ?? clean(mergedSheetTitle)
    const cleaned = cleanupFinalDrawingIdentityStrings("D-0", ht)
    return {
      sheetNumber: cleaned.sheetNumber,
      sheetTitle: cleaned.sheetTitle,
      reason: "cover_hint_D0",
      registryValidatedLocked: false,
    }
  }

  const mergedTitle = clean(mergedSheetTitle)
  const fallbackTitle =
    mergedTitle && isPlausibleDrawingSheetTitle(mergedTitle, { sheetNumberForEchoCheck: "D-0" })
      ? mergedTitle
      : "Cover / sheet index"

  const cleaned = cleanupFinalDrawingIdentityStrings("D-0", fallbackTitle)
  return {
    sheetNumber: cleaned.sheetNumber,
    sheetTitle: cleaned.sheetTitle,
    reason: "cover_default_D0",
    registryValidatedLocked: false,
  }
}

/**
 * Final DRAWING identity: cover/index first, then A registry hint > B strong hint > C AI > D null.
 */
export function resolveFinalDrawingIdentity(
  args: ResolveFinalDrawingIdentityArgs,
): ResolveFinalDrawingIdentityResult {
  if (args.pageClass !== "DRAWING") {
    return {
      sheetNumber: clean(args.mergedSheetNumber),
      sheetTitle: clean(args.mergedSheetTitle),
      reason: "non_drawing_unchanged",
      registryValidatedLocked: false,
    }
  }

  const cover = resolveCoverOrIndexIdentity(args)
  if (cover) {
    return cover
  }

  const a = tierA_registryValidatedHint(args.hints, args.registry)
  if (a) return a

  const b = tierB_strongTitleBlockHint(args.hints)
  if (b) return b

  const c = tierC_aiPlausible(args.aiSheetNumber, args.aiSheetTitle)
  if (c) return c

  const msn = clean(args.mergedSheetNumber)
  const mst = clean(args.mergedSheetTitle)
  if (msn && isPlausibleDrawingSheetNumber(msn)) {
    const titleOk =
      mst && isPlausibleDrawingSheetTitle(mst, { sheetNumberForEchoCheck: msn })
    const cleaned = cleanupFinalDrawingIdentityStrings(msn, titleOk ? mst : null)
    return {
      sheetNumber: cleaned.sheetNumber,
      sheetTitle: cleaned.sheetTitle,
      reason: "D_merged_plausible_fallback",
      registryValidatedLocked: false,
    }
  }

  return {
    sheetNumber: null,
    sheetTitle: null,
    reason: "D_no_plausible_identity",
    registryValidatedLocked: false,
  }
}

export function shouldLogDrawingIdentityResolution(
  aiSheet: string | null,
  aiTitle: string | null,
  hintSheet: string | null,
  hintTitle: string | null,
  registrySheet: string | null,
  registryTitle: string | null,
  mergedSheet: string | null,
  mergedTitle: string | null,
  finalSheet: string | null,
  finalTitle: string | null,
): boolean {
  const norm = (s: string | null | undefined) => (s ? collapseHyphens(s).replace(/\s/g, "").toUpperCase() : "")
  const changed =
    norm(aiSheet) !== norm(hintSheet) ||
    norm(aiTitle) !== norm(hintTitle) ||
    norm(hintSheet) !== norm(registrySheet) ||
    norm(mergedSheet) !== norm(finalSheet) ||
    norm(mergedTitle) !== norm(finalTitle) ||
    norm(aiSheet) !== norm(finalSheet) ||
    norm(hintSheet) !== norm(finalSheet)
  return changed
}
