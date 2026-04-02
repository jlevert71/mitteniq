/**
 * Map PDF bytes → per-page text (pdf-parse) plus page dimensions (pdfjs-dist).
 */
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { extractPdfPages } from "@/lib/intake/pdf-text-extraction"
import type { IntakeV2PageTextInput } from "./types"

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

let pdfjsWorkerConfigured = false

function ensurePdfjsWorkerForV2() {
  if (pdfjsWorkerConfigured) return
  try {
    const fromCwd = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    )
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(fromCwd).href
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString()
  }
  pdfjsWorkerConfigured = true
}

async function loadPageDimensionsByPageNumber(buffer: Buffer): Promise<Map<number, { widthIn: number; heightIn: number }>> {
  const dims = new Map<number, { widthIn: number; heightIn: number }>()
  try {
    ensurePdfjsWorkerForV2()
    const pdfjsDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
    try {
      const n = pdfjsDoc.numPages
      for (let pageNumber = 1; pageNumber <= n; pageNumber++) {
        try {
          const page = await pdfjsDoc.getPage(pageNumber)
          const view = page.view
          if (!Array.isArray(view) || view.length < 4) continue
          const u =
            typeof page.userUnit === "number" && Number.isFinite(page.userUnit) && page.userUnit > 0
              ? page.userUnit
              : 1
          const wPt = (Number(view[2]) - Number(view[0])) * u
          const hPt = (Number(view[3]) - Number(view[1])) * u
          if (!Number.isFinite(wPt) || !Number.isFinite(hPt) || wPt <= 0 || hPt <= 0) continue
          dims.set(pageNumber, {
            widthIn: round1(wPt / 72),
            heightIn: round1(hPt / 72),
          })
        } catch {
          // per-page: omit from map
        }
      }
    } finally {
      await pdfjsDoc.destroy().catch(() => {})
    }
  } catch {
    // whole pass failed — return empty map (all pageDimensions null)
  }
  return dims
}

export async function extractIntakeV2PageTexts(buffer: Buffer): Promise<IntakeV2PageTextInput[]> {
  const [pdfPages, dimByPage] = await Promise.all([
    extractPdfPages(buffer),
    loadPageDimensionsByPageNumber(buffer),
  ])

  return pdfPages.map((p) => ({
    pageNumber: p.pageNumber,
    fullText: p.fullText,
    normalizedText: normalizeWhitespace(p.fullText),
    pageDimensions: dimByPage.get(p.pageNumber) ?? null,
  }))
}
