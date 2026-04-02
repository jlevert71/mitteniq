/**
 * intake_v2 orchestrator: PDF buffer → page texts → simple per-page sheet/title guesses.
 */
import { extractSimplePageFieldsFromPages } from "./extract-simple-page-fields"
import { extractIntakeV2PageTexts } from "./extract-pages-text"
import { parseToc } from "./parse-toc"
import type {
  IntakeV2PageSizeSummary,
  IntakeV2PageTextInput,
  IntakeV2RunResult,
  TocParseResult,
} from "./types"

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pageSizeLabel(widthIn: number, heightIn: number): "Specifications" | "Drawings" {
  const w = round1(widthIn)
  const h = round1(heightIn)
  if ((w === 8.5 && h === 11) || (w === 11 && h === 8.5)) return "Specifications"
  return "Drawings"
}

function buildPageSizesSummary(pages: IntakeV2PageTextInput[]): IntakeV2PageSizeSummary[] {
  const groups = new Map<
    string,
    { widthIn: number; heightIn: number; label: "Specifications" | "Drawings"; count: number }
  >()
  for (const p of pages) {
    if (!p.pageDimensions) continue
    const { widthIn, heightIn } = p.pageDimensions
    const label = pageSizeLabel(widthIn, heightIn)
    const key = `${widthIn}\t${heightIn}`
    const prev = groups.get(key)
    if (prev) prev.count += 1
    else groups.set(key, { widthIn, heightIn, label, count: 1 })
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count)
}

export async function runIntakeV2(buffer: Buffer): Promise<IntakeV2RunResult> {
  const started = Date.now()

  try {
    const pages = await extractIntakeV2PageTexts(buffer)
    const rows = extractSimplePageFieldsFromPages(pages)
    const toc = await parseToc(pages)
    const pagePreviews = pages.map((p) => ({
      pageNumber: p.pageNumber,
      charCount: p.fullText.length,
      preview: p.fullText.slice(0, 240),
    }))
    const pageSizes = buildPageSizesSummary(pages)

    return {
      ok: true,
      pageCount: pages.length,
      rows,
      pagePreviews,
      pageSizes,
      toc,
      meta: { durationMs: Date.now() - started },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      pageCount: 0,
      rows: [],
      pagePreviews: [],
      pageSizes: [],
      toc: { ok: false, error: "Intake failed before TOC parse", entries: [], frontEndEntriesFound: 0, technicalEntriesFound: 0, resolvedCount: 0, durationMs: 0 },
      meta: { durationMs: Date.now() - started },
    }
  }
}
