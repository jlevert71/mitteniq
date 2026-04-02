export type PdfTextItem = {
  str: string
  x: number
  y: number
  width: number
  height: number
}

import type { IntakePositionalEvidence } from "./types"

export type PdfPageText = {
  pageNumber: number
  width: number
  height: number
  items: PdfTextItem[]
  fullText: string
  positionalEvidence?: IntakePositionalEvidence | null
}

export type BasicPdfChecks = {
  isPdf: boolean
  hasXref: boolean
  pageCount: number | null
  likelySearchable: boolean
  likelyRasterHeavy: boolean
}

export type PrintSizesResult = {
  printSizePrimary: string | null
  printSizeCounts: Record<string, number> | null
  printSizeNote: string
  used: "CropBox" | "MediaBox"
  boxSamples: { cropCount: number; mediaCount: number }
}