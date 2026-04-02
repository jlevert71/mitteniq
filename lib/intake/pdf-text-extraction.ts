import "pdf-parse/worker"
import { PDFParse } from "pdf-parse"
import { buildApproximatePdfTextItemsFromFullText } from "./approximate-positional-tokens"
import type { PdfPageText, PdfTextItem } from "./pdf-types"
import { POSITIONAL_EVIDENCE_CONFIDENCE } from "./types"

const DEBUG_PDF_TEXT_ITEMS =
  typeof process !== "undefined" && process.env.DEBUG_PDF_TEXT_ITEMS === "1"

function probePdfJsItemArray(pageObj: unknown): { count: number; sample: unknown[] } {
  if (!pageObj || typeof pageObj !== "object") return { count: 0, sample: [] }
  const o = pageObj as Record<string, unknown>
  const candidates = [o.items, o.textItems, o.content, o.tokens]
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      return { count: arr.length, sample: arr.slice(0, 10) }
    }
  }
  return { count: 0, sample: [] }
}

function summarizeGetTextResultForDebug(result: unknown, pageNumber: number) {
  if (!result || typeof result !== "object") {
    return {
      topKeys: [] as string[],
      pagesArrayLength: 0,
      pageKeys: [] as string[],
      rawItemsOnPageObject: 0,
      firstTenRawItems: [] as unknown[],
      topLevelItemsArrayLength: 0,
    }
  }
  const r = result as Record<string, unknown>
  const pages = Array.isArray(r.pages) ? r.pages : []
  const exact =
    pages.find(
      (p: unknown) =>
        typeof p === "object" &&
        p !== null &&
        Number((p as Record<string, unknown>).num ?? (p as Record<string, unknown>).page ?? 0) ===
          pageNumber,
    ) ??
    (pages[pageNumber - 1] as unknown) ??
    null
  const pageKeys =
    exact && typeof exact === "object" && exact !== null
      ? Object.keys(exact as object)
      : []
  const probe = probePdfJsItemArray(exact)
  const topLevelItems = Array.isArray(r.items) ? r.items.length : 0
  return {
    topKeys: Object.keys(r),
    pagesArrayLength: pages.length,
    pageKeys,
    rawItemsOnPageObject: probe.count,
    firstTenRawItems: probe.sample,
    topLevelItemsArrayLength: topLevelItems,
  }
}

export async function extractPdfPages(buf: Buffer): Promise<PdfPageText[]> {
  const parser = new PDFParse({ data: buf as Uint8Array })

  function cleanText(value: unknown) {
    return String(value ?? "")
      .replace(/[^\S\n]+/g, " ")  // collapse spaces/tabs but preserve newlines
      .replace(/\n{3,}/g, "\n\n") // collapse 3+ consecutive newlines to 2
      .trim()
  }

  function toNumber(value: unknown): number | null {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function normalizeItem(raw: any): PdfTextItem | null {
    const str = cleanText(raw?.str ?? raw?.text ?? raw?.value ?? "")
    if (!str) return null

    const x =
      toNumber(raw?.x) ??
      toNumber(raw?.transform?.[4]) ??
      toNumber(raw?.matrix?.[4]) ??
      0

    const y =
      toNumber(raw?.y) ??
      toNumber(raw?.transform?.[5]) ??
      toNumber(raw?.matrix?.[5]) ??
      0

    const width =
      toNumber(raw?.width) ??
      toNumber(raw?.w) ??
      toNumber(raw?.transform?.[0]) ??
      0

    const height =
      toNumber(raw?.height) ??
      toNumber(raw?.h) ??
      toNumber(raw?.transform?.[3]) ??
      0

    return {
      str,
      x,
      y,
      width: Number.isFinite(width) && width > 0 ? width : Math.max(str.length * 4, 4),
      height: Number.isFinite(height) && height > 0 ? height : 10,
    }
  }

  function extractItemsFromPageObject(pageObj: any): PdfTextItem[] {
    if (!pageObj) return []

    const possibleArrays = [
      pageObj.items,
      pageObj.textItems,
      pageObj.content,
      pageObj.tokens,
    ]

    for (const arr of possibleArrays) {
      if (Array.isArray(arr) && arr.length > 0) {
        const normalized = arr
          .map((item: any) => normalizeItem(item))
          .filter(Boolean) as PdfTextItem[]

        if (normalized.length > 0) {
          return normalized
        }
      }
    }

    return []
  }

  function extractTextFromItems(items: PdfTextItem[]) {
    return cleanText(items.map((item) => item.str).join(" "))
  }

  function extractTextFromResult(result: any, pageNumber: number) {
    if (!result) return ""

    if (typeof result.text === "string" && result.text.trim()) {
      return cleanText(result.text)
    }

    if (Array.isArray(result.pages) && result.pages.length > 0) {
      const exact =
        result.pages.find((p: any) => Number(p?.page ?? p?.pageNumber ?? 0) === pageNumber) ??
        result.pages[pageNumber - 1] ??
        result.pages[0]

      if (exact) {
        if (typeof exact.text === "string" && exact.text.trim()) {
          return cleanText(exact.text)
        }

        const exactItems = extractItemsFromPageObject(exact)
        if (exactItems.length > 0) {
          return extractTextFromItems(exactItems)
        }
      }
    }

    if (Array.isArray(result.items) && result.items.length > 0) {
      const normalized = result.items
        .map((item: any) => normalizeItem(item))
        .filter(Boolean) as PdfTextItem[]

      if (normalized.length > 0) {
        return extractTextFromItems(normalized)
      }

      return cleanText(
        result.items
          .map((item: any) => String(item?.str ?? item?.text ?? ""))
          .join(" "),
      )
    }

    if (typeof result.content === "string" && result.content.trim()) {
      return cleanText(result.content)
    }

    return ""
  }

  /**
   * pdf-parse v2 `getText()` returns `TextResult` whose `pages[]` entries are `{ num, text }` only.
   * Per-item geometry lives inside pdf.js but is not exposed on that shape, so this often returns [].
   */
  function extractItemsFromResult(result: any, pageNumber: number): PdfTextItem[] {
    if (!result) return []

    if (Array.isArray(result.pages) && result.pages.length > 0) {
      const exact =
        result.pages.find((p: any) => Number(p?.page ?? p?.pageNumber ?? 0) === pageNumber) ??
        result.pages[pageNumber - 1] ??
        result.pages[0]

      const exactItems = extractItemsFromPageObject(exact)
      if (exactItems.length > 0) {
        return exactItems
      }
    }

    if (Array.isArray(result.items) && result.items.length > 0) {
      const normalized = result.items
        .map((item: any) => normalizeItem(item))
        .filter(Boolean) as PdfTextItem[]

      if (normalized.length > 0) {
        return normalized
      }
    }

    return []
  }

  try {
    const info = await parser.getInfo({ parsePageInfo: true })

    const totalPages =
      Number((info as any)?.total ?? 0) > 0
        ? Number((info as any)?.total ?? 0)
        : Number((info as any)?.numPages ?? 0) > 0
          ? Number((info as any)?.numPages ?? 0)
          : Array.isArray((info as any)?.pages)
            ? (info as any).pages.length
            : 0

    const pages: PdfPageText[] = []
    let pagesFilledByLayoutApproximation = 0
    let nativePositionPages = 0
    let approximatedTextPages = 0

    console.log("extractPdfPages:getInfo", {
      totalPages,
      infoKeys: info && typeof info === "object" ? Object.keys(info as any) : [],
      pagesArrayLength: Array.isArray((info as any)?.pages) ? (info as any).pages.length : 0,
    })

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      let textResult: any = null
      let extractedText = ""
      let extractedItems: PdfTextItem[] = []

      try {
        textResult = await parser.getText({ partial: [pageNumber] })
        extractedText = extractTextFromResult(textResult, pageNumber)
        extractedItems = extractItemsFromResult(textResult, pageNumber)
      } catch (err) {
        console.error(
          `extractPdfPages:getText failed for page ${pageNumber} using 1-based partial`,
          err,
        )
      }

      if (!extractedText && extractedItems.length === 0) {
        try {
          textResult = await parser.getText({ partial: [pageNumber - 1] })
          extractedText = extractTextFromResult(textResult, pageNumber)
          extractedItems = extractItemsFromResult(textResult, pageNumber)
        } catch (err) {
          console.error(
            `extractPdfPages:getText failed for page ${pageNumber} using 0-based partial`,
            err,
          )
        }
      }

      const pageInfo =
        Array.isArray((info as any)?.pages) && (info as any).pages[pageNumber - 1]
          ? (info as any).pages[pageNumber - 1]
          : null

      const width = Number(
        pageInfo?.width ?? pageInfo?.view?.[2] ?? pageInfo?.viewport?.width ?? 0,
      )
      const height = Number(
        pageInfo?.height ?? pageInfo?.view?.[3] ?? pageInfo?.viewport?.height ?? 0,
      )

      let finalItems = extractedItems
      let usedLayoutApproximation = false
      const fullTextForPage = extractedText || extractTextFromItems(extractedItems)

      if (finalItems.length === 0 && fullTextForPage.trim()) {
        finalItems = buildApproximatePdfTextItemsFromFullText(
          fullTextForPage,
          Number.isFinite(width) ? width : 0,
          Number.isFinite(height) ? height : 0,
        )
        usedLayoutApproximation = finalItems.length > 0
        if (usedLayoutApproximation) pagesFilledByLayoutApproximation += 1
      }

      let positionalEvidence: PdfPageText["positionalEvidence"] = null
      if (extractedItems.length > 0) {
        positionalEvidence = {
          source: "NATIVE_PDF_POSITIONS",
          confidence: POSITIONAL_EVIDENCE_CONFIDENCE.NATIVE_PDF_POSITIONS,
        }
        nativePositionPages += 1
      } else if (usedLayoutApproximation) {
        positionalEvidence = {
          source: "APPROXIMATED_FROM_TEXT",
          confidence: POSITIONAL_EVIDENCE_CONFIDENCE.APPROXIMATED_FROM_TEXT,
        }
        approximatedTextPages += 1
      }

      if (DEBUG_PDF_TEXT_ITEMS && pageNumber <= 3) {
        const normalizedCount = extractedItems.length
        const probe = summarizeGetTextResultForDebug(textResult, pageNumber)
        let discardReasons: string[] = []
        if (probe.rawItemsOnPageObject === 0 && probe.topLevelItemsArrayLength === 0) {
          discardReasons.push(
            "pdf-parse_TextResult_pages_have_no_items_array_typically_only_num_and_text",
          )
        }
        if (probe.rawItemsOnPageObject > 0 && normalizedCount === 0) {
          discardReasons.push("normalizer_returned_null_for_all_raw_items_empty_or_unmapped_fields")
        }
        console.log("extractPdfPages:debug:page", {
          pageNumber,
          rawPdfJsLikeItemCount: probe.rawItemsOnPageObject,
          topLevelItemsLength: probe.topLevelItemsArrayLength,
          normalizedTokenCount: normalizedCount,
          tokenCountAfterApproximation: finalItems.length,
          usedLayoutApproximation,
          topCandidateStr: finalItems[0]?.str ?? null,
          fullTextLength: fullTextForPage.length,
          pageObjectKeys: probe.pageKeys,
          firstTenRawItems: probe.firstTenRawItems,
          discardReasons,
        })
      }

      pages.push({
        pageNumber,
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
        items: finalItems,
        fullText: fullTextForPage,
        positionalEvidence,
      })
    }

    const pagesWithText = pages.filter((p) => p.fullText.length > 0).length
    const pagesWithItems = pages.filter((p) => p.items.length > 0).length

    console.log("extractPdfPages:summary", {
      totalPages: pages.length,
      pagesWithText,
      pagesWithItems,
      pagesFilledByLayoutApproximation,
      nativePositionPages,
      approximatedTextPages,
      approximatedOcrPages: 0,
      note:
        pagesFilledByLayoutApproximation > 0
          ? "native_pdf.js_items_missing_used_plain_text_token_grid_see_extractPdfPages_docstring"
          : undefined,
    })

    if (pages.length > 0 && pagesWithText === 0) {
      try {
        const wholeDocTextResult = await parser.getText()
        const fallbackText = extractTextFromResult(wholeDocTextResult, 1)

        console.log("extractPdfPages:fallbackWholeDoc", {
          pages: pages.length,
          fallbackTextLength: fallbackText.length,
          wholeDocKeys:
            wholeDocTextResult && typeof wholeDocTextResult === "object"
              ? Object.keys(wholeDocTextResult)
              : [],
        })

        if (fallbackText) {
          return pages.map((page, index) => ({
            ...page,
            fullText: index === 0 ? fallbackText : page.fullText,
          }))
        }
      } catch (err) {
        console.error("extractPdfPages:fallback whole-document getText failed", err)
      }
    }

    return pages
  } finally {
    await parser.destroy()
  }
}