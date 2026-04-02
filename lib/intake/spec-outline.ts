/**
 * SPEC FAST PATH – proof-of-concept: extract outline (bookmarks) from a PDF
 * using pdfjs-dist. Isolated module; does not touch the existing AI intake pipeline.
 *
 * Returns a flattened list of outline entries with title, 1-based page number, and depth.
 * Also supports normalized CSI-style section ranges derived from qualifying bookmark titles.
 */

import { pathToFileURL } from "node:url"
import path from "node:path"
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs"

export type SpecOutlineEntry = {
  title: string
  page: number
  depth: number
}

/** One spec section span inferred from CSI-style outline bookmarks */
export type SpecSectionRange = {
  rawTitle: string
  /** Present when a CSI-style leading number was parsed */
  sectionNumber: string | null
  sectionTitle: string
  startPage: number
  endPage: number
  depth: number
}

/** Outline node as returned by pdfjs getOutline() – may have nested items */
type OutlineNode = {
  title: string
  dest?: string | unknown[] | null
  items?: OutlineNode[]
  [key: string]: unknown
}

type PDFDocumentProxy = {
  getOutline: () => Promise<OutlineNode[] | null>
  getDestination: (id: string) => Promise<unknown[] | null>
  getPageIndex: (ref: { num: number; gen: number }) => Promise<number>
  numPages: number
  destroy: () => Promise<void>
}

let workerConfigured = false

function ensurePdfWorker() {
  if (workerConfigured) return
  try {
    const fromCwd = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    )
    GlobalWorkerOptions.workerSrc = pathToFileURL(fromCwd).href
  } catch {
    const fromImportMeta = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString()
    GlobalWorkerOptions.workerSrc = fromImportMeta
  }
  workerConfigured = true
}

function isPageRef(value: unknown): value is { num: number; gen: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "num" in value &&
    "gen" in value &&
    typeof (value as { num: unknown }).num === "number" &&
    typeof (value as { gen: unknown }).gen === "number"
  )
}

async function resolvePageFromDest(
  doc: PDFDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<number> {
  if (dest == null) return 1

  let explicit: unknown[] | null = null

  if (typeof dest === "string") {
    explicit = await doc.getDestination(dest)
  } else if (Array.isArray(dest) && dest.length > 0) {
    const first = dest[0]
    if (isPageRef(first)) {
      const index = await doc.getPageIndex(first)
      return index >= 0 ? index + 1 : 1
    }
    explicit = dest
  }

  if (explicit && explicit.length > 0 && isPageRef(explicit[0])) {
    const index = await doc.getPageIndex(explicit[0])
    return index >= 0 ? index + 1 : 1
  }

  return 1
}

function flattenOutline(
  nodes: OutlineNode[] | null | undefined,
  depth: number,
  doc: PDFDocumentProxy,
  acc: SpecOutlineEntry[],
): Promise<void> {
  if (!nodes || nodes.length === 0) return Promise.resolve()

  async function visit(node: OutlineNode, d: number) {
    const title =
      typeof node.title === "string" ? node.title.trim() : String(node.title ?? "")
    const page = await resolvePageFromDest(doc, node.dest)
    acc.push({ title, page, depth: d })
    const children = node.items
    if (Array.isArray(children) && children.length > 0) {
      for (const child of children) {
        await visit(child as OutlineNode, d + 1)
      }
    }
  }

  return (async () => {
    for (const node of nodes) {
      await visit(node, depth)
    }
  })()
}

type OutlineLoadResult = {
  entries: SpecOutlineEntry[]
  numPages: number
}

async function loadSpecOutlineFromBuffer(
  pdfBuffer: Buffer,
): Promise<OutlineLoadResult> {
  ensurePdfWorker()

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const doc = (await loadingTask.promise) as unknown as PDFDocumentProxy
  const numPages = Math.max(1, doc.numPages | 0)

  try {
    const outline = await doc.getOutline()
    if (!outline || !Array.isArray(outline) || outline.length === 0) {
      return { entries: [], numPages }
    }

    const entries: SpecOutlineEntry[] = []
    await flattenOutline(outline, 1, doc, entries)
    return { entries, numPages }
  } finally {
    await doc.destroy()
  }
}

/**
 * Load a PDF from a buffer, get its outline (bookmarks), flatten the tree,
 * resolve each destination to a 1-based page number, and return a list of entries.
 * If the PDF has no outline or getOutline returns null, returns an empty array.
 */
export async function extractSpecOutline(pdfBuffer: Buffer): Promise<SpecOutlineEntry[]> {
  const { entries } = await loadSpecOutlineFromBuffer(pdfBuffer)
  return entries
}

/**
 * Leading CSI / MasterFormat-style number: three groups of two digits
 * (e.g. "26 05 00", "00 11 13"), optionally separated by spaces or hyphens.
 */
const CSI_LEADING_TITLE =
  /^(\d{2})[\s\u00a0\-]+(\d{2})[\s\u00a0\-]+(\d{2})(?:[\s\u00a0]+|$)(.*)$/u

export type ParsedCsiTitle = {
  sectionNumber: string
  sectionTitle: string
}

/**
 * If the title starts with a CSI-style section number, returns normalized number and remainder.
 * Otherwise returns null (not a section-level outline item for range building).
 */
export function parseCsiOutlineTitle(rawTitle: string): ParsedCsiTitle | null {
  const title = rawTitle.trim()
  const m = title.match(CSI_LEADING_TITLE)
  if (!m) return null
  const sectionNumber = `${m[1]} ${m[2]} ${m[3]}`
  const sectionTitle = (m[4] ?? "").trim()
  return { sectionNumber, sectionTitle }
}

function buildSpecSectionRanges(
  entries: SpecOutlineEntry[],
  numPages: number,
): SpecSectionRange[] {
  if (entries.length === 0) return []

  type Qualifying = SpecOutlineEntry & ParsedCsiTitle

  const qualifying: Qualifying[] = []
  for (const e of entries) {
    const parsed = parseCsiOutlineTitle(e.title)
    if (!parsed) continue
    qualifying.push({ ...e, ...parsed })
  }

  if (qualifying.length === 0) return []

  const ranges: SpecSectionRange[] = []
  for (let i = 0; i < qualifying.length; i++) {
    const q = qualifying[i]
    const startPage = Math.min(numPages, Math.max(1, q.page))
    let endPage: number
    if (i < qualifying.length - 1) {
      const nextStart = Math.min(numPages, Math.max(1, qualifying[i + 1].page))
      endPage = Math.min(numPages, nextStart - 1)
      if (endPage < startPage) endPage = startPage
    } else {
      endPage = numPages
    }

    ranges.push({
      rawTitle: q.title,
      sectionNumber: q.sectionNumber ?? null,
      sectionTitle: q.sectionTitle,
      startPage,
      endPage,
      depth: q.depth,
    })
  }

  return ranges
}

/**
 * Build normalized section ranges from CSI-style bookmark titles.
 * Reuses outline extraction (single PDF load). Non-CSI bookmarks are skipped.
 * endPage is the page before the next qualifying section starts, or the last PDF page.
 */
export async function extractSpecSectionRanges(
  pdfBuffer: Buffer,
): Promise<SpecSectionRange[]> {
  const { entries, numPages } = await loadSpecOutlineFromBuffer(pdfBuffer)
  return buildSpecSectionRanges(entries, numPages)
}

/**
 * Single PDF load: flattened outline plus CSI section ranges (for callers that need both).
 */
export async function extractSpecOutlineWithSectionRanges(pdfBuffer: Buffer): Promise<{
  outline: SpecOutlineEntry[]
  sectionRanges: SpecSectionRange[]
  numPages: number
}> {
  const { entries, numPages } = await loadSpecOutlineFromBuffer(pdfBuffer)
  return {
    outline: entries,
    sectionRanges: buildSpecSectionRanges(entries, numPages),
    numPages,
  }
}
