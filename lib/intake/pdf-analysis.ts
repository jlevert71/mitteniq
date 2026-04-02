import type { BasicPdfChecks, PdfPageText, PrintSizesResult } from "./pdf-types"

export function basicPdfChecks(buf: Buffer): BasicPdfChecks {
  const head = buf.subarray(0, 1024).toString("latin1")
  const tail = buf.subarray(Math.max(0, buf.length - 4096)).toString("latin1")

  const isPdf = head.includes("%PDF-")
  const hasXref = tail.includes("startxref")

  const hasTextOps = buf.includes(Buffer.from("BT")) && buf.includes(Buffer.from("ET"))
  const hasImages = buf.includes(Buffer.from("/Image"))
  const hasFont = buf.includes(Buffer.from("/Font"))

  const pageMatches = buf.toString("latin1").match(/\/Type\s*\/Page\b/g)
  const pageCount = pageMatches ? pageMatches.length : null

  return {
    isPdf,
    hasXref,
    pageCount,
    likelySearchable: !!(hasTextOps || hasFont),
    likelyRasterHeavy: !!(hasImages && !hasFont && !hasTextOps),
  }
}

export function normalizeInchesLabel(width: number, height: number) {
  const a = Math.min(width, height)
  const b = Math.max(width, height)

  const known: Array<{ w: number; h: number; label: string }> = [
    { w: 8.5, h: 11, label: "8.5 × 11 (Letter)" },
    { w: 11, h: 17, label: "11 × 17 (Tabloid)" },
    { w: 12, h: 18, label: "12 × 18" },
    { w: 18, h: 24, label: "18 × 24" },
    { w: 22, h: 34, label: "22 × 34" },
    { w: 24, h: 36, label: "24 × 36" },
    { w: 30, h: 42, label: "30 × 42" },
    { w: 36, h: 48, label: "36 × 48" },
  ]

  const tol = 0.35
  const match = known.find((k) => Math.abs(k.w - a) <= tol && Math.abs(k.h - b) <= tol)
  if (match) return match.label

  const fmt = (n: number) => {
    const rounded = Math.round(n * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  }

  return `${fmt(a)} × ${fmt(b)}`
}

export function extractPrintSizes(buf: Buffer): PrintSizesResult {
  const text = buf.toString("latin1")

  const crop = [
    ...text.matchAll(
      /\/CropBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g,
    ),
  ]
  const media = [
    ...text.matchAll(
      /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g,
    ),
  ]

  const boxes = (crop.length > 0 ? crop : media).slice(0, 6000)
  const counts: Record<string, number> = {}

  for (const m of boxes) {
    const x0 = Number(m[1])
    const y0 = Number(m[2])
    const x1 = Number(m[3])
    const y1 = Number(m[4])

    if (![x0, y0, x1, y1].every((n) => Number.isFinite(n))) continue

    const wPts = Math.abs(x1 - x0)
    const hPts = Math.abs(y1 - y0)

    if (!(wPts > 0 && hPts > 0)) continue

    const wIn = wPts / 72
    const hIn = hPts / 72

    if (wIn < 4 || hIn < 4) continue

    const label = normalizeInchesLabel(wIn, hIn)
    counts[label] = (counts[label] ?? 0) + 1
  }

  const labels = Object.keys(counts)

  if (labels.length === 0) {
    return {
      printSizePrimary: null,
      printSizeCounts: null,
      printSizeNote: "No MediaBox/CropBox page-size data detected.",
      used: crop.length > 0 ? "CropBox" : "MediaBox",
      boxSamples: { cropCount: crop.length, mediaCount: media.length },
    }
  }

  labels.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
  const primary = labels[0]

  const note =
    labels.length > 1
      ? "Multiple page sizes detected. Print each page at its actual sheet size to preserve scale."
      : "Single page size detected. Print at the listed sheet size to preserve scale."

  return {
    printSizePrimary: primary,
    printSizeCounts: counts,
    printSizeNote: note,
    used: crop.length > 0 ? "CropBox" : "MediaBox",
    boxSamples: { cropCount: crop.length, mediaCount: media.length },
  }
}

export function getPagePrintSize(page: PdfPageText) {
  const widthPts = Number(page.width ?? 0)
  const heightPts = Number(page.height ?? 0)

  if (!(widthPts > 0) || !(heightPts > 0)) {
    return {
      pageWidthInches: null,
      pageHeightInches: null,
      printSizeLabel: null,
    }
  }

  const widthInches = Math.round((widthPts / 72) * 100) / 100
  const heightInches = Math.round((heightPts / 72) * 100) / 100

  return {
    pageWidthInches: widthInches,
    pageHeightInches: heightInches,
    printSizeLabel: normalizeInchesLabel(widthInches, heightInches),
  }
}