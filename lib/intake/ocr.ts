import fs from "fs/promises"
import path from "path"
import { createWorker } from "tesseract.js"
import { buildApproximatePdfTextItemsFromFullText } from "./approximate-positional-tokens"
import { buildLayoutEvidence } from "./layout-evidence"
import type { PdfPageText, PdfTextItem } from "./pdf-types"
import {
  POSITIONAL_EVIDENCE_CONFIDENCE,
  type IntakePreparedPage,
  type IntakeRouteType,
  type PositionalTextToken,
} from "./types"

type OcrWorkItem = {
  pageNumber: number
  score: number
  route: IntakeRouteType
  tier: "PRIMARY" | "ESCALATION"
}

export type OcrPopulationSummary = {
  enabled: true
  attemptedPages: number
  appliedPages: number
  maxPages: number
  renderScale: number
}

type OcrPopulationResult = {
  pages: IntakePreparedPage[]
  summary: OcrPopulationSummary
}

const DEFAULT_OCR_MAX_PAGES = 24
const OCR_CONCURRENCY = 2
const OCR_WORKER_INIT_TIMEOUT_MS = 90_000
const OCR_RECOGNIZE_TIMEOUT_MS = 75_000

const DEBUG_PDF_TEXT_ITEMS =
  typeof process !== "undefined" && process.env.DEBUG_PDF_TEXT_ITEMS === "1"

function positionalTokensFromApproximateItems(items: PdfTextItem[]): PositionalTextToken[] {
  return items.map((item) => ({
    text: item.str,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  }))
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function getOcrMaxPages() {
  const raw = Number(process.env.MITTENIQ_OCR_MAX_PAGES ?? DEFAULT_OCR_MAX_PAGES)
  if (!Number.isFinite(raw)) return DEFAULT_OCR_MAX_PAGES
  return Math.max(0, Math.min(Math.round(raw), 100))
}

function getRoute(page: IntakePreparedPage): IntakeRouteType {
  return page.routing.likelyType
}

function getRawTextLength(page: IntakePreparedPage) {
  return page.rawText.normalizedText?.length ?? 0
}

function getTokenCount(page: IntakePreparedPage) {
  return page.rawText.tokens?.length ?? 0
}

function getTextDensity(page: IntakePreparedPage) {
  return page.pdfFacts.textDensity ?? 1
}

function hasNoExtractedText(page: IntakePreparedPage) {
  return page.extractionWarnings.includes("NO_EXTRACTED_TEXT") || !page.rawText.normalizedText
}

function hasNoPositionalTokens(page: IntakePreparedPage) {
  return page.extractionWarnings.includes("NO_POSITIONAL_TOKENS") || getTokenCount(page) === 0
}

function isOcrRecommended(page: IntakePreparedPage) {
  return page.extractionWarnings.includes("OCR_RECOMMENDED")
}

function hasImage(page: IntakePreparedPage) {
  return Boolean(page.pageImage.imagePath)
}

function isSpecWeakTextCandidate(page: IntakePreparedPage) {
  const rawTextLength = getRawTextLength(page)
  const textDensity = getTextDensity(page)
  const noExtractedText = hasNoExtractedText(page)
  const noTokens = hasNoPositionalTokens(page)
  const ocrRecommended = isOcrRecommended(page)

  if (noExtractedText || noTokens) return true
  if (ocrRecommended && rawTextLength < 260) return true
  if (ocrRecommended && textDensity < 0.00025) return true
  if (textDensity < 0.00012 && rawTextLength < 360) return true
  if (
    page.specSignals.likelySpecSectionStart &&
    (rawTextLength < 220 || textDensity < 0.0002)
  ) {
    return true
  }
  if (
    page.specSignals.likelySpecContinuation &&
    ocrRecommended &&
    rawTextLength < 180
  ) {
    return true
  }

  return false
}

function classifyOcrTier(
  page: IntakePreparedPage,
): "PRIMARY" | "ESCALATION" | null {
  const route = getRoute(page)
  const rawTextLength = getRawTextLength(page)
  const textDensity = getTextDensity(page)
  const noExtractedText = hasNoExtractedText(page)
  const noTokens = hasNoPositionalTokens(page)
  const ocrRecommended = isOcrRecommended(page)

  if (!hasImage(page)) return null
  if (page.ocrText.normalizedText) return null

  if (route === "SPEC") {
    if (noExtractedText || noTokens) return "PRIMARY"
    if (ocrRecommended && rawTextLength < 120) return "PRIMARY"
    if (ocrRecommended && textDensity < 0.00015) return "PRIMARY"

    if (
      page.specSignals.likelySpecSectionStart &&
      (rawTextLength < 180 || textDensity < 0.0002)
    ) {
      return "PRIMARY"
    }

    if (
      page.specSignals.likelySpecContinuation &&
      ocrRecommended &&
      rawTextLength < 140
    ) {
      return "PRIMARY"
    }

    if (ocrRecommended && rawTextLength < 260) return "ESCALATION"
    if (ocrRecommended && textDensity < 0.00025) return "ESCALATION"
    if (textDensity < 0.0005 && rawTextLength < 360) return "ESCALATION"
    if (
      page.specSignals.likelySpecSectionStart &&
      (rawTextLength < 260 || textDensity < 0.0003)
    ) {
      return "ESCALATION"
    }

    return null
  }

  if (route === "DRAWING") {
    if (ocrRecommended && (noExtractedText || noTokens)) return "PRIMARY"
    if (ocrRecommended && rawTextLength < 40) return "PRIMARY"
    if (ocrRecommended && textDensity < 0.0005) return "PRIMARY"
    if (rawTextLength < 25 && noTokens) return "PRIMARY"
    if (ocrRecommended && rawTextLength < 160) return "ESCALATION"
    return null
  }

  if (route === "MIXED") {
    if (noExtractedText || noTokens) return "PRIMARY"
    if (ocrRecommended && rawTextLength < 80) return "PRIMARY"
    if (ocrRecommended && textDensity < 0.0003) return "PRIMARY"
    if (ocrRecommended && rawTextLength < 220) return "ESCALATION"
    return null
  }

  if (route === "UNKNOWN") {
    if (noExtractedText || noTokens) return "PRIMARY"
    if (ocrRecommended) return "PRIMARY"
    if (textDensity < 0.0005) return "ESCALATION"
    return null
  }

  return null
}

function scoreOcrCandidate(page: IntakePreparedPage, tier: "PRIMARY" | "ESCALATION") {
  const route = getRoute(page)
  const rawTextLength = getRawTextLength(page)
  const tokenCount = getTokenCount(page)
  const textDensity = getTextDensity(page)

  let score = 0

  if (tier === "PRIMARY") score += 200
  if (tier === "ESCALATION") score += 100

  if (hasNoExtractedText(page)) score += 160
  if (hasNoPositionalTokens(page)) score += 90
  if (page.pdfFacts.isRasterLikely) score += 55
  if (isOcrRecommended(page)) score += 45

  if (rawTextLength < 40) score += 60
  else if (rawTextLength < 120) score += 35
  else if (rawTextLength < 240) score += 15

  if (tokenCount === 0) score += 35

  if (textDensity < 0.00015) score += 45
  else if (textDensity < 0.0005) score += 20

  if (route === "SPEC") {
    score += 30
    if (page.specSignals.likelySpecSectionStart) score += 25
    if (page.specSignals.likelySpecContinuation && rawTextLength < 160) score += 15
    if (isSpecWeakTextCandidate(page)) score += 35
    if (rawTextLength < 180) score += 20
    if (textDensity < 0.00025) score += 20
  }

  if (route === "DRAWING") {
    score += 20
    if (rawTextLength < 80) score += 20
  }

  if (route === "MIXED") {
    score += 15
  }

  if (route === "UNKNOWN") {
    score += 25
  }

  return score
}

function chooseOcrPages(pages: IntakePreparedPage[], maxPages: number) {
  const primary: OcrWorkItem[] = []
  const escalation: OcrWorkItem[] = []

  for (const page of pages) {
    const tier = classifyOcrTier(page)
    if (!tier) continue

    const item: OcrWorkItem = {
      pageNumber: page.pageNumber,
      score: scoreOcrCandidate(page, tier),
      route: getRoute(page),
      tier,
    }

    if (tier === "PRIMARY") {
      primary.push(item)
    } else {
      escalation.push(item)
    }
  }

  primary.sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
  escalation.sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)

  const selected = [...primary.slice(0, maxPages)]

  if (selected.length < maxPages) {
    const remaining = maxPages - selected.length
    selected.push(...escalation.slice(0, remaining))
  }

  return selected
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runner() {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) return
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const runnerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: runnerCount }, () => runner()))
  return results
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`OCR timeout: ${label} did not complete within ${ms}ms`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function resolveTesseractWorkerPath() {
  return path.join(
    process.cwd(),
    "node_modules",
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js",
  )
}

async function runOcrOnImage(
  image: Buffer,
  pageNumber: number,
): Promise<{ fullText: string | null; normalizedText: string | null }> {
  const workerPath = resolveTesseractWorkerPath()

  console.log("OCR: worker init start", { pageNumber, workerPath })

  const worker = await withTimeout(
    createWorker("eng", 1, {
      workerPath,
      logger: (message: { status?: string; progress?: number | string }) => {
        if (message?.status) {
          console.log("OCR: tesseract progress", {
            pageNumber,
            status: message.status,
            progress:
              typeof message.progress === "number"
                ? `${Math.round(message.progress * 100)}%`
                : message.progress,
          })
        }
      },
    }),
    OCR_WORKER_INIT_TIMEOUT_MS,
    `worker init for page ${pageNumber}`,
  )

  console.log("OCR: worker ready, starting recognize", { pageNumber })

  try {
    const result = await withTimeout(
      worker.recognize(image),
      OCR_RECOGNIZE_TIMEOUT_MS,
      `recognize for page ${pageNumber}`,
    )

    const text = normalizeText(String(result?.data?.text ?? ""))
    console.log("OCR: recognize done", { pageNumber, textLength: text.length })

    return {
      fullText: text || null,
      normalizedText: text || null,
    }
  } finally {
    await worker.terminate().catch((error) =>
      console.warn("OCR: worker terminate error", { pageNumber, error }),
    )
    console.log("OCR: worker terminated", { pageNumber })
  }
}

export async function populateOcrTextForPreparedPages(
  _pdfBuffer: Buffer,
  pages: IntakePreparedPage[],
): Promise<OcrPopulationResult> {
  const maxPages = getOcrMaxPages()

  console.log("OCR: populateOcrText start", {
    totalPages: pages.length,
    maxPages,
  })

  if (!pages.length || maxPages <= 0) {
    console.log("OCR: skipped (no pages or maxPages=0)")
    return {
      pages,
      summary: { enabled: true, attemptedPages: 0, appliedPages: 0, maxPages, renderScale: 0 },
    }
  }

  const selectedWorkItems = chooseOcrPages(pages, maxPages)
  const pageByNumber = new Map<number, IntakePreparedPage>()
  for (const page of pages) {
    pageByNumber.set(page.pageNumber, page)
  }

  const missingImagePages: number[] = []
  const workItems = selectedWorkItems.filter((item) => {
    const page = pageByNumber.get(item.pageNumber)
    const imageAvailable = Boolean(page?.pageImage.imagePath)
    if (!imageAvailable) missingImagePages.push(item.pageNumber)
    return imageAvailable
  })

  const routeCounts: Record<IntakeRouteType, number> = {
    DRAWING: 0,
    SPEC: 0,
    MIXED: 0,
    UNKNOWN: 0,
  }

  const tierCounts = {
    PRIMARY: 0,
    ESCALATION: 0,
  }

  for (const item of workItems) {
    routeCounts[item.route] += 1
    tierCounts[item.tier] += 1
  }

  console.log("OCR: candidate pages selected", {
    candidateCount: workItems.length,
    pageNumbers: workItems.map((w) => w.pageNumber),
    routeCounts,
    tierCounts,
    missingImagePages,
  })

  if (!workItems.length) {
    console.log("OCR: no candidates qualified for OCR")
    return {
      pages,
      summary: { enabled: true, attemptedPages: 0, appliedPages: 0, maxPages, renderScale: 0 },
    }
  }

  const ocrResults = await mapWithConcurrency(
    workItems,
    OCR_CONCURRENCY,
    async (item, workerIndex) => {
      console.log("OCR: page work start", {
        pageNumber: item.pageNumber,
        workerIndex,
        route: item.route,
        tier: item.tier,
      })
      const startMs = Date.now()

      try {
        const page = pageByNumber.get(item.pageNumber)
        if (!page?.pageImage.imagePath) {
          throw new Error("Missing page image for OCR candidate.")
        }

        const imageBuffer = await fs.readFile(page.pageImage.imagePath)
        const ocrText = await runOcrOnImage(imageBuffer, item.pageNumber)

        console.log("OCR: page work done", {
          pageNumber: item.pageNumber,
          workerIndex,
          route: item.route,
          tier: item.tier,
          elapsedMs: Date.now() - startMs,
          textLength: ocrText.normalizedText?.length ?? 0,
          imagePath: page.pageImage.imagePath,
        })

        return {
          pageNumber: item.pageNumber,
          ocrText,
        }
      } catch (error) {
        console.error("OCR: page work failed", {
          pageNumber: item.pageNumber,
          workerIndex,
          route: item.route,
          tier: item.tier,
          elapsedMs: Date.now() - startMs,
          error: error instanceof Error ? error.message : String(error),
        })

        return {
          pageNumber: item.pageNumber,
          ocrText: { fullText: null, normalizedText: null },
        }
      }
    },
  )

  const ocrByPage = new Map<
    number,
    {
      fullText: string | null
      normalizedText: string | null
    }
  >()

  for (const result of ocrResults) {
    ocrByPage.set(result.pageNumber, {
      fullText: result.ocrText.fullText,
      normalizedText: result.ocrText.normalizedText,
    })
  }

  let appliedPages = 0

  const updatedPages = pages.map((page) => {
    const ocr = ocrByPage.get(page.pageNumber)
    if (!ocr) return page

    if (ocr.normalizedText) appliedPages += 1

    const w = page.pdfFacts.width ?? 0
    const h = page.pdfFacts.height ?? 0
    let rawText = page.rawText
    let layoutEvidence = page.layoutEvidence
    let positionalEvidence = page.positionalEvidence ?? null
    if (
      ocr.normalizedText &&
      (page.rawText.tokens?.length ?? 0) === 0 &&
      (page.routing.likelyType === "DRAWING" ||
        page.routing.likelyType === "MIXED" ||
        page.routing.likelyType === "UNKNOWN")
    ) {
      const approx = buildApproximatePdfTextItemsFromFullText(ocr.normalizedText, w, h)
      if (approx.length) {
        rawText = {
          ...page.rawText,
          tokens: positionalTokensFromApproximateItems(approx),
        }
        positionalEvidence = {
          source: "APPROXIMATED_FROM_OCR",
          confidence: POSITIONAL_EVIDENCE_CONFIDENCE.APPROXIMATED_FROM_OCR,
        }
        const pdfSlice: PdfPageText = {
          pageNumber: page.pageNumber,
          width: w,
          height: h,
          items: approx,
          fullText: ocr.normalizedText,
          positionalEvidence,
        }
        layoutEvidence = buildLayoutEvidence(pdfSlice)
        if (DEBUG_PDF_TEXT_ITEMS) {
          console.log("OCR:debug:approximateTokensFromOcr", {
            pageNumber: page.pageNumber,
            route: page.routing.likelyType,
            ocrTextLength: ocr.normalizedText.length,
            tokenCount: approx.length,
            topToken: approx[0]?.str ?? null,
          })
        }
      }
    }

    const extractionWarnings =
      rawText.tokens.length > 0
        ? page.extractionWarnings.filter((w) => w !== "NO_POSITIONAL_TOKENS")
        : page.extractionWarnings

    return {
      ...page,
      rawText,
      layoutEvidence,
      positionalEvidence,
      extractionWarnings,
      ocrText: {
        fullText: ocr.fullText,
        normalizedText: ocr.normalizedText,
      },
    }
  })

  console.log("OCR: populateOcrText complete", {
    attemptedPages: workItems.length,
    appliedPages,
    routeCounts,
    tierCounts,
  })

  return {
    pages: updatedPages,
    summary: {
      enabled: true,
      attemptedPages: workItems.length,
      appliedPages,
      maxPages,
      renderScale: 0,
    },
  }
}