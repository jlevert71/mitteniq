import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas"
import fs from "fs/promises"
import os from "os"
import path from "path"
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs"
import type { IntakePreparedPage } from "./types"

export type PageImagePopulationSummary = {
  enabled: true
  attemptedPages: number
  appliedPages: number
  maxPages: number
  renderScale: number
}

type PageImagePopulationResult = {
  pages: IntakePreparedPage[]
  summary: PageImagePopulationSummary
}

type PageImageWorkItem = {
  pageNumber: number
  score: number
}

type RenderablePdfPage = {
  getViewport: (args: { scale: number }) => { width: number; height: number }
  render: (args: unknown) => { promise: Promise<void> }
  cleanup: () => void
}

type RenderablePdfDocument = {
  getPage: (pageNumber: number) => Promise<RenderablePdfPage>
  destroy: () => Promise<void>
}

const DEFAULT_PAGE_IMAGE_MAX_PAGES = 48
const DEFAULT_PAGE_IMAGE_RENDER_SCALE = 2
const PAGE_IMAGE_CONCURRENCY = 2

let workerConfigured = false

function getPageImageMaxPages() {
  const raw = Number(
    process.env.MITTENIQ_PAGE_IMAGE_MAX_PAGES ?? DEFAULT_PAGE_IMAGE_MAX_PAGES,
  )
  if (!Number.isFinite(raw)) return DEFAULT_PAGE_IMAGE_MAX_PAGES
  return Math.max(0, Math.min(Math.round(raw), 250))
}

function getPageImageRenderScale() {
  const raw = Number(
    process.env.MITTENIQ_PAGE_IMAGE_RENDER_SCALE ?? DEFAULT_PAGE_IMAGE_RENDER_SCALE,
  )
  if (!Number.isFinite(raw)) return DEFAULT_PAGE_IMAGE_RENDER_SCALE
  return Math.max(1, Math.min(raw, 4))
}

function ensurePdfJsNodeGlobals() {
  const g = globalThis as Record<string, unknown>
  if (!g.DOMMatrix) g.DOMMatrix = DOMMatrix
  if (!g.ImageData) g.ImageData = ImageData
  if (!g.Path2D) g.Path2D = Path2D
}

function ensureMatchingPdfWorker() {
  if (workerConfigured) return

  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()

  workerConfigured = true
}

function scorePageImageCandidate(page: IntakePreparedPage) {
  if (page.pageImage.imagePath) return -1

  let score = 0

  if (page.routing.likelyType === "DRAWING") score += 220
  if (page.routing.likelyType === "MIXED") score += 140
  if (page.routing.likelyType === "UNKNOWN") score += 60
  if (page.routing.likelyType === "SPEC") score += 20

  if (page.extractionWarnings.includes("OCR_RECOMMENDED")) score += 80
  if (page.extractionWarnings.includes("NO_EXTRACTED_TEXT")) score += 50
  if (page.extractionWarnings.includes("ROUTING_UNCERTAIN")) score += 25

  if ((page.rawText.normalizedText?.length ?? 0) < 40) score += 30
  if ((page.rawText.tokens?.length ?? 0) === 0) score += 20
  if (page.pdfFacts.isRasterLikely) score += 20
  if ((page.pdfFacts.textDensity ?? 1) < 0.0005) score += 20

  return score
}

function choosePageImagePages(pages: IntakePreparedPage[], maxPages: number) {
  const ranked: PageImageWorkItem[] = pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      score: scorePageImageCandidate(page),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)

  return ranked.slice(0, maxPages)
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

async function renderPdfPageToPng(
  pdfDocument: RenderablePdfDocument,
  pageNumber: number,
  scale: number,
): Promise<{
  png: Buffer
  width: number
  height: number
}> {
  console.log("PAGE_IMAGES: renderPage start", { pageNumber, scale })
  const pdfPage = await pdfDocument.getPage(pageNumber)
  const viewport = pdfPage.getViewport({ scale })

  const width = Math.max(1, Math.ceil(viewport.width))
  const height = Math.max(1, Math.ceil(viewport.height))

  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")

  const canvasFactory = {
    create(widthArg: number, heightArg: number) {
      const c = createCanvas(Math.max(1, widthArg), Math.max(1, heightArg))
      return { canvas: c, context: c.getContext("2d") }
    },
    reset(
      target: { canvas: { width: number; height: number } },
      widthArg: number,
      heightArg: number,
    ) {
      target.canvas.width = Math.max(1, widthArg)
      target.canvas.height = Math.max(1, heightArg)
    },
    destroy(
      target: {
        canvas: { width: number; height: number } | null
        context: unknown
      },
    ) {
      if (target.canvas) {
        target.canvas.width = 0
        target.canvas.height = 0
      }
      target.canvas = null
      target.context = null
    },
  }

  await pdfPage.render({
    canvasContext: context,
    viewport,
    canvasFactory,
    background: "rgb(255,255,255)",
  } as unknown).promise

  const png = canvas.toBuffer("image/png")
  pdfPage.cleanup()

  console.log("PAGE_IMAGES: renderPage done", {
    pageNumber,
    pngBytes: png.length,
    width,
    height,
  })

  return { png, width, height }
}

function makePageImageDir() {
  return path.join(os.tmpdir(), "mitteniq-intake-page-images")
}

async function persistPageImage(
  png: Buffer,
  pageNumber: number,
): Promise<string> {
  const dir = makePageImageDir()
  await fs.mkdir(dir, { recursive: true })

  const filename =
    [
      "page",
      String(pageNumber),
      Date.now(),
      process.pid,
      Math.random().toString(36).slice(2, 8),
    ].join("-") + ".png"

  const imagePath = path.join(dir, filename)
  await fs.writeFile(imagePath, png)

  console.log("PAGE_IMAGES: image saved", {
    pageNumber,
    imagePath,
    pngBytes: png.length,
  })

  return imagePath
}

export async function populatePageImagesForPreparedPages(
  pdfBuffer: Buffer,
  pages: IntakePreparedPage[],
): Promise<PageImagePopulationResult> {
  const maxPages = getPageImageMaxPages()
  const renderScale = getPageImageRenderScale()

  console.log("PAGE_IMAGES: start", {
    totalPages: pages.length,
    maxPages,
    renderScale,
  })

  if (!pages.length || maxPages <= 0) {
    console.log("PAGE_IMAGES: skipped (no pages or maxPages=0)")
    return {
      pages,
      summary: {
        enabled: true,
        attemptedPages: 0,
        appliedPages: 0,
        maxPages,
        renderScale,
      },
    }
  }

  const workItems = choosePageImagePages(pages, maxPages)

  console.log("PAGE_IMAGES: candidate pages selected", {
    candidateCount: workItems.length,
    pageNumbers: workItems.map((w) => w.pageNumber),
  })

  if (!workItems.length) {
    console.log("PAGE_IMAGES: no candidates qualified for rendering")
    return {
      pages,
      summary: {
        enabled: true,
        attemptedPages: 0,
        appliedPages: 0,
        maxPages,
        renderScale,
      },
    }
  }

  ensurePdfJsNodeGlobals()
  ensureMatchingPdfWorker()

  console.log("PAGE_IMAGES: loading PDF document for rendering")
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const pdfDocument = (await loadingTask.promise) as unknown as RenderablePdfDocument
  console.log("PAGE_IMAGES: PDF document loaded")

  try {
    const results = await mapWithConcurrency(
      workItems,
      PAGE_IMAGE_CONCURRENCY,
      async (item, workerIndex) => {
        console.log("PAGE_IMAGES: page work start", {
          pageNumber: item.pageNumber,
          workerIndex,
        })

        const startMs = Date.now()

        try {
          const rendered = await renderPdfPageToPng(
            pdfDocument,
            item.pageNumber,
            renderScale,
          )

          const imagePath = await persistPageImage(rendered.png, item.pageNumber)

          console.log("PAGE_IMAGES: page work done", {
            pageNumber: item.pageNumber,
            workerIndex,
            elapsedMs: Date.now() - startMs,
            imagePath,
          })

          return {
            pageNumber: item.pageNumber,
            imagePath,
            imageWidth: rendered.width,
            imageHeight: rendered.height,
          }
        } catch (error) {
          console.error("PAGE_IMAGES: page work failed", {
            pageNumber: item.pageNumber,
            workerIndex,
            elapsedMs: Date.now() - startMs,
            error: error instanceof Error ? error.message : String(error),
          })

          return {
            pageNumber: item.pageNumber,
            imagePath: null,
            imageWidth: null,
            imageHeight: null,
          }
        }
      },
    )

    const imageByPage = new Map<
      number,
      {
        imagePath: string | null
        imageWidth: number | null
        imageHeight: number | null
      }
    >()

    for (const result of results) {
      imageByPage.set(result.pageNumber, {
        imagePath: result.imagePath,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
      })
    }

    let appliedPages = 0

    const updatedPages = pages.map((page) => {
      const image = imageByPage.get(page.pageNumber)
      if (!image) return page

      if (image.imagePath) appliedPages += 1

      return {
        ...page,
        pageImage: {
          imagePath: image.imagePath,
          width: image.imageWidth ?? page.pageImage.width,
          height: image.imageHeight ?? page.pageImage.height,
        },
      }
    })

    console.log("PAGE_IMAGES: complete", {
      attemptedPages: workItems.length,
      appliedPages,
    })

    return {
      pages: updatedPages,
      summary: {
        enabled: true,
        attemptedPages: workItems.length,
        appliedPages,
        maxPages,
        renderScale,
      },
    }
  } finally {
    await pdfDocument.destroy()
    console.log("PAGE_IMAGES: PDF document destroyed")
  }
}