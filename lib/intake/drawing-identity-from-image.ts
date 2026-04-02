/**
 * Optional vision pass: read sheet number / title from the rendered drawing page image.
 * Runs after deterministic text extraction; does not replace routing or main AI chunking.
 */

import fs from "fs/promises"
import OpenAI from "openai"
import {
  extractDrawingIdentityHintsForDrawingPage,
} from "./drawing-identity"
import {
  lookupRegistryEntry,
  type DrawingSetRegistry,
} from "./drawing-set-registry"
import {
  cleanupFinalDrawingIdentityStrings,
  isPlausibleDrawingSheetNumber,
  isPlausibleDrawingSheetTitle,
} from "./resolve-final-drawing-identity"
import type { IntakeDrawingIdentityHints, IntakePreparedPage } from "./types"

const VISION_MODEL = "gpt-4o-mini"

const DEBUG_VISUAL_DRAWING_IDENTITY =
  typeof process !== "undefined" && process.env.DEBUG_VISUAL_DRAWING_IDENTITY === "1"

function getApiKeyRaw() {
  const raw = process.env.OPENAI_API_KEY
  return typeof raw === "string" ? raw.trim() : ""
}

function visualPassEnabled() {
  const raw = String(process.env.MITTENIQ_VISUAL_DRAWING_IDENTITY_ENABLED ?? "").trim().toLowerCase()
  if (raw === "false") return false
  if (raw === "true") return true
  return getApiKeyRaw().length > 0
}

function maxVisualPages() {
  const raw = Number(process.env.MITTENIQ_VISUAL_DRAWING_IDENTITY_MAX_PAGES ?? 48)
  if (!Number.isFinite(raw)) return 48
  return Math.max(0, Math.min(Math.round(raw), 200))
}

let cachedClient: OpenAI | null | undefined = undefined

function getClient(): OpenAI | null {
  if (cachedClient !== undefined) return cachedClient
  const apiKey = getApiKeyRaw()
  if (!apiKey) {
    cachedClient = null
    return cachedClient
  }
  cachedClient = new OpenAI({ apiKey })
  return cachedClient
}

async function filePathToDataUrl(imagePath: string): Promise<string | null> {
  try {
    const imageBytes = await fs.readFile(imagePath)
    const base64 = imageBytes.toString("base64")
    return `data:image/png;base64,${base64}`
  } catch (error: unknown) {
    console.warn("drawingIdentityFromImage:image:readFailed", {
      imagePath,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function collapseHyphens(s: string): string {
  return s.replace(/[–—]/g, "-")
}

function normalizeSheetCompare(s: string | null | undefined): string {
  if (!s?.trim()) return ""
  return collapseHyphens(s).replace(/\s/g, "").toUpperCase()
}

export type VisionDrawingIdentityRaw = {
  sheetNumber: string | null
  sheetTitle: string | null
  confidence: number
  titleBlockLocation: string | null
  reliableTitleBlockFound: boolean
}

export type ExtractDrawingIdentityFromImageParams = {
  pageImagePath: string
  pageNumber: number
  ocrText?: string | null
  hintText?: string | null
}

/**
 * Single-page vision call: title block in lower-right, ignore body clutter.
 */
export async function extractDrawingIdentityFromImage(
  params: ExtractDrawingIdentityFromImageParams,
): Promise<VisionDrawingIdentityRaw | null> {
  const client = getClient()
  if (!client) return null

  const dataUrl = await filePathToDataUrl(params.pageImagePath)
  if (!dataUrl) return null

  const ocrSnippet = (params.ocrText ?? "").trim().slice(0, 2500)
  const hintSnippet = (params.hintText ?? "").trim().slice(0, 2500)

  const system = `You are an expert at reading engineering/construction drawing title blocks from raster images.
Rules:
- Focus on the TITLE BLOCK, usually in the LOWER-RIGHT of the sheet (sometimes lower band).
- Extract the drawing SHEET NUMBER (e.g. D-1, D-100, E-6, I-2) and the SHEET TITLE (drawing name).
- Ignore repeated project codes, notes, specs, and text in the drawing body (not the title block).
- Prefer structured title block fields over random annotations.
- If the title block is unreadable, illegible, or missing, set reliableTitleBlockFound to false and use nulls.
- Respond with JSON only, no markdown.`

  const userText = `Page ${params.pageNumber}.
Optional OCR (may be noisy; use only to disambiguate): ${ocrSnippet ? `\n${ocrSnippet}` : "\n(none)"}
Optional layout hints (may be approximate): ${hintSnippet ? `\n${hintSnippet}` : "\n(none)"}

Return a single JSON object with exactly these keys:
{
  "sheetNumber": string | null,
  "sheetTitle": string | null,
  "confidence": number between 0 and 1,
  "titleBlockLocation": string | null (e.g. "lower right title block"),
  "reliableTitleBlockFound": boolean
}`

  try {
    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.1,
      max_tokens: 450,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return null

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sheetNumber =
      typeof parsed.sheetNumber === "string" ? parsed.sheetNumber.trim() || null : null
    const sheetTitle =
      typeof parsed.sheetTitle === "string" ? parsed.sheetTitle.trim() || null : null
    let confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : 0.5
    confidence = Math.max(0, Math.min(1, confidence))
    const titleBlockLocation =
      typeof parsed.titleBlockLocation === "string"
        ? parsed.titleBlockLocation.trim() || null
        : null
    const reliableTitleBlockFound = parsed.reliableTitleBlockFound === true

    return {
      sheetNumber,
      sheetTitle,
      confidence,
      titleBlockLocation,
      reliableTitleBlockFound,
    }
  } catch (error: unknown) {
    console.warn("drawingIdentityFromImage:requestFailed", {
      pageNumber: params.pageNumber,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function buildHintContextText(page: IntakePreparedPage): string {
  const le = page.layoutEvidence
  const parts = [
    le.lowYRightCornerText,
    le.lowYBandText,
    le.highYRightCornerText,
    page.rawText.normalizedText?.slice(0, 1200),
  ].filter(Boolean)
  return parts.join("\n---\n")
}

function mergeVisionIntoHints(
  page: IntakePreparedPage,
  textHints: IntakeDrawingIdentityHints,
  vision: VisionDrawingIdentityRaw | null,
  registry: DrawingSetRegistry,
): IntakeDrawingIdentityHints {
  if (!vision) {
    return {
      ...textHints,
      visualExtraction: {
        used: false,
        confidence: null,
        titleBlockLocation: null,
        conflictWithTextHint: false,
      },
    }
  }

  const textBackup = {
    sheetNumberCandidate: textHints.sheetNumberCandidate,
    sheetTitleCandidate: textHints.sheetTitleCandidate,
    confidence: textHints.confidence,
  }

  const cleaned = cleanupFinalDrawingIdentityStrings(vision.sheetNumber, vision.sheetTitle)
  let sheetNum = cleaned.sheetNumber
  let sheetTitle = cleaned.sheetTitle

  if (sheetNum && !isPlausibleDrawingSheetNumber(sheetNum)) {
    sheetNum = null
  }
  if (sheetTitle && isParagraphLikeTitle(sheetTitle)) {
    sheetTitle = null
  }
  if (sheetTitle && sheetNum && !isPlausibleDrawingSheetTitle(sheetTitle, { sheetNumberForEchoCheck: sheetNum })) {
    sheetTitle = null
  }

  const regEntry = sheetNum ? lookupRegistryEntry(registry, sheetNum) : null
  const canonicalNumber = regEntry?.canonicalSheetNumber ?? sheetNum
  const canonicalTitle =
    regEntry?.canonicalTitle.slice(0, 100) ?? sheetTitle ?? null

  const conflictWithTextHint =
    Boolean(textHints.sheetNumberCandidate?.trim()) &&
    Boolean(sheetNum?.trim()) &&
    normalizeSheetCompare(textHints.sheetNumberCandidate) !== normalizeSheetCompare(sheetNum)

  const reliableVision =
    vision.reliableTitleBlockFound &&
    vision.confidence >= 0.7 &&
    Boolean(sheetNum && isPlausibleDrawingSheetNumber(sheetNum))

  if (!reliableVision) {
    let confidence = textHints.confidence
    if (page.positionalEvidence?.source === "APPROXIMATED_FROM_TEXT") {
      confidence = Math.min(confidence, 0.72)
    } else if (page.positionalEvidence?.source === "APPROXIMATED_FROM_OCR") {
      confidence = Math.min(confidence, 0.65)
    }

    return {
      ...textHints,
      confidence,
      visualExtraction: {
        used: true,
        confidence: vision.confidence,
        titleBlockLocation: vision.titleBlockLocation,
        conflictWithTextHint,
      },
      titleBlockEvidence: textHints.titleBlockEvidence.some((e) =>
        e.includes("no reliable title block found"),
      )
        ? textHints.titleBlockEvidence
        : [...textHints.titleBlockEvidence, "no reliable title block found"],
    }
  }

  let confidence = Math.min(0.94, Math.max(0.72, vision.confidence))
  if (vision.confidence >= 0.92 && vision.reliableTitleBlockFound) {
    confidence = Math.min(0.96, Math.max(0.9, vision.confidence))
  }

  const evidence = [
    ...textHints.titleBlockEvidence.filter(
      (e) =>
        e !== "identified from title block (image analysis)" &&
        e !== "no reliable title block found",
    ),
    "identified from title block (image analysis)",
  ]
  if (vision.titleBlockLocation) {
    evidence.push(`location:${vision.titleBlockLocation.slice(0, 120)}`)
  }

  return {
    sheetNumberCandidate: canonicalNumber,
    sheetTitleCandidate: canonicalTitle,
    titleBlockEvidence: evidence,
    confidence: Math.round(Math.min(0.99, confidence) * 100) / 100,
    selectedCandidateKind: "DRAWING_NUMBER",
    registryValidated: Boolean(regEntry),
    titleRegistryValidated: Boolean(regEntry),
    sheetTitleTitleBlockPreferred: true,
    registryAssistMessage: regEntry
      ? `canonicalized to ${canonicalNumber}${canonicalTitle ? ` — ${canonicalTitle}` : ""}`
      : null,
    textBasedHintBackup: textBackup,
    visualExtraction: {
      used: true,
      confidence: vision.confidence,
      titleBlockLocation: vision.titleBlockLocation,
      conflictWithTextHint,
    },
  }
}

function isParagraphLikeTitle(s: string): boolean {
  const t = s.trim()
  if (t.length > 100) return true
  if ((t.match(/[.!?]/g) ?? []).length >= 2) return true
  return false
}

/**
 * For DRAWING pages with a rendered image, run the vision pass and merge into drawingIdentityHints.
 * Text-based hints remain in textBasedHintBackup when vision is used as primary.
 */
export async function enrichPreparedPagesWithVisualDrawingIdentity(
  pages: IntakePreparedPage[],
  registry: DrawingSetRegistry,
  opts?: { onlyPageNumbers?: Set<number> },
): Promise<IntakePreparedPage[]> {
  if (!visualPassEnabled()) {
    return pages
  }

  const client = getClient()
  if (!client) {
    return pages
  }

  const maxPages = maxVisualPages()
  const allow = opts?.onlyPageNumbers
  const candidates = pages
    .filter(
      (p) =>
        p.routing.likelyType === "DRAWING" &&
        Boolean(p.pageImage.imagePath) &&
        p.pageImage.imagePath &&
        (!allow || allow.has(p.pageNumber)),
    )
    .slice(0, maxPages)

  const out = new Map(pages.map((p) => [p.pageNumber, p]))

  const concurrency = 2
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency)
    await Promise.all(
      batch.map(async (page) => {
        const textHints =
          page.drawingIdentityHints ?? extractDrawingIdentityHintsForDrawingPage(page, registry)

        const ocr =
          page.ocrText.normalizedText?.trim() ?? page.ocrText.fullText?.trim() ?? ""
        const hintText = buildHintContextText(page)

        const vision = await extractDrawingIdentityFromImage({
          pageImagePath: page.pageImage.imagePath!,
          pageNumber: page.pageNumber,
          ocrText: ocr || null,
          hintText: hintText || null,
        })

        const merged = mergeVisionIntoHints(page, textHints, vision, registry)

        if (
          DEBUG_VISUAL_DRAWING_IDENTITY ||
          process.env.MITTENIQ_VISUAL_DRAWING_IDENTITY_LOG === "1"
        ) {
          console.log("drawingIdentity:visualPass", {
            pageNumber: page.pageNumber,
            visualExtractionUsed: merged.visualExtraction?.used ?? false,
            visualConfidence: merged.visualExtraction?.confidence ?? null,
            conflictWithTextHint: merged.visualExtraction?.conflictWithTextHint ?? false,
          })
        }

        const prev = out.get(page.pageNumber)
        if (prev) {
          out.set(page.pageNumber, { ...prev, drawingIdentityHints: merged })
        }
      }),
    )
  }

  if (candidates.length > 0) {
    const primaryVisual = [...out.values()].filter(
      (p) =>
        p.drawingIdentityHints?.titleBlockEvidence?.some((e) =>
          e.includes("identified from title block (image analysis)"),
        ),
    ).length

    console.log("drawingIdentity:visualPass:summary", {
      candidateDrawingPages: candidates.length,
      pagesWithPrimaryVisualHint: primaryVisual,
    })
  }

  return pages.map((p) => out.get(p.pageNumber) ?? p)
}
