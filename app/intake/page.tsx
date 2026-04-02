"use client"

import React, { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { stripRedundantSheetPrefix } from "@/lib/intake/shared-string-utils"

type UploadPayload = {
  id: string
  projectId: string
  filename: string
  sizeBytes: number
  mimeType: string
  createdAt: string
  pageCount: number | null
  isSearchable: boolean | null
  isRasterOnly: boolean | null
  intakeReport: any
  intakeStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED"
  intakeStage?: string | null
  intakeDelayReason?: string | null
  intakeError: string | null
}

type SheetPayload = {
  id: string
  uploadId: string
  pageNumber: number
  sheetNumber?: string | null
  sheetName?: string | null
  discipline?: string | null
  pageClass?: string | null
  sectionNumber?: string | null
  sectionTitle?: string | null
  isElectricalRelated?: boolean | null
  sheetType?: string | null
  scaleStatus?: string | null
  scaleConfidence?: number | null
  notes?: string | null
  printSizeLabel?: string | null
  pageWidthInches?: number | null
  pageHeightInches?: number | null
  createdAt?: string
  updatedAt?: string
}

type PreviewSheetRow = {
  pageNumber: number
  pageClass?: string | null
  sheetNumber?: string | null
  sheetName?: string | null
  discipline?: string | null
  sectionNumber?: string | null
  sectionTitle?: string | null
  isElectricalRelated?: boolean | null
  sheetType?: string | null
  scaleStatus?: string | null
  scaleConfidence?: number | null
  printSizeLabel?: string | null
  pageWidthInches?: number | null
  pageHeightInches?: number | null
  reviewFlags?: string[]
  estimatorReviewFlags?: string[]
  confidence?: {
    overall?: number | null
    sheetNumber?: number | null
    sheetName?: number | null
    pageClass?: number | null
    sheetType?: number | null
    discipline?: number | null
  } | null
  provenance?: {
    sheetNumber?: string | null
    sheetName?: string | null
    pageClass?: string | null
    sheetType?: string | null
    discipline?: string | null
  } | null
}

type LowConfidencePage = {
  pageNumber: number
  sheetNumber?: string | null
  sheetName?: string | null
  overallConfidence?: number | null
  reviewFlags?: string[]
}

type MergedSheetRow = {
  id: string
  pageNumber: number
  pageClass?: string | null
  sheetNumber?: string | null
  sheetName?: string | null
  discipline?: string | null
  sectionNumber?: string | null
  sectionTitle?: string | null
  isElectricalRelated?: boolean | null
  sheetType?: string | null
  scaleStatus?: string | null
  scaleConfidence?: number | null
  printSizeLabel?: string | null
  pageWidthInches?: number | null
  pageHeightInches?: number | null
  reviewFlags?: string[]
  confidence?: {
    overall?: number | null
    sheetNumber?: number | null
    sheetName?: number | null
    pageClass?: number | null
    sheetType?: number | null
    discipline?: number | null
  } | null
}

function formatDate(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString()
}

async function openUploadPdfAtPage(uploadId: string, pageNumber: number) {
  const res = await fetch(`/api/uploads/${uploadId}/file?page=${pageNumber}`)
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean
    url?: string
    page?: number
  } | null
  if (data?.ok && data.url) {
    window.open(`${data.url}#page=${data.page ?? pageNumber}`, "_blank")
  }
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${Math.round(value * 100)}%`
}

/** Sheet-row confidence: avoid a bare em dash when we are not surfacing a numeric score. */
function formatSheetRowConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not scored"
  return `${Math.round(value * 100)}%`
}

function Badge({
  label,
  tone,
}: {
  label: string
  tone: "good" | "warn" | "bad" | "neutral"
}) {
  const cls =
    tone === "good"
      ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
      : tone === "warn"
        ? "border-amber-800 bg-amber-950/40 text-amber-200"
        : tone === "bad"
          ? "border-rose-800 bg-rose-950/40 text-rose-200"
          : "border-zinc-700 bg-zinc-950/40 text-zinc-200"

  return <span className={`rounded-full border px-2 py-1 text-xs ${cls}`}>{label}</span>
}

function Tile({
  title,
  children,
  className = "",
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 ${className}`}>
      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">{title}</div>
      {children}
    </div>
  )
}

function clean(value: string | null | undefined) {
  if (!value) return null
  const next = value.replace(/\s+/g, " ").trim()
  return next.length ? next : null
}

function computeConfidence(report: any, upload: UploadPayload | null) {
  if (!upload) {
    return {
      label: "Unknown",
      tone: "warn" as const,
      message: "The file has not been loaded yet.",
    }
  }

  if (upload.intakeStatus === "FAILED") {
    return {
      label: "Low confidence",
      tone: "bad" as const,
      message:
        upload.intakeError ||
        "The file could not be analyzed reliably. Review the PDF before using it for estimating.",
    }
  }

  const corrupted = Boolean(report?.pdfSafety?.likelyCorrupted)
  const safeForReview = Boolean(report?.pdfSafety?.safeForReview)
  const searchable = upload.isSearchable === true
  const raster = upload.isRasterOnly === true

  if (corrupted) {
    return {
      label: "Low confidence",
      tone: "bad" as const,
      message:
        "This PDF may be damaged, incomplete, or structurally unreliable. Review it before using it for estimating.",
    }
  }

  if (!searchable || raster) {
    return {
      label: "Review recommended",
      tone: "warn" as const,
      message:
        "This file appears scan-heavy or image-based. Searches and interpretation may be less reliable until reviewed.",
    }
  }

  if (safeForReview || upload.intakeStatus === "READY") {
    return {
      label: "High confidence",
      tone: "good" as const,
      message: null,
    }
  }

  return {
    label: "Review recommended",
    tone: "warn" as const,
    message: "Some conditions were detected that may affect reliability.",
  }
}

function getSheetTypeRows(report: any) {
  const counts = report?.contentCounts || {}

  const preferred = [
    {
      key: "drawingPages",
      label: "Drawings / Charts",
      value: Number(counts.drawingPages || 0),
    },
    {
      key: "specificationPages",
      label: "Specifications",
      value: Number(counts.specificationPages || 0),
    },
    {
      key: "biddingFrontEndRequirementPages",
      label: "Bidding / Front-End Requirements",
      value: Number(counts.biddingFrontEndRequirementPages || 0),
    },
    {
      key: "contractingRequirementPages",
      label: "Contracting Requirements",
      value: Number(counts.contractingRequirementPages || 0),
    },
    {
      key: "generalPages",
      label: "General Project Information",
      value: Number(counts.generalPages || 0),
    },
    {
      key: "blankPages",
      label: "Blank Pages",
      value: Number(counts.blankPages || 0),
    },
    {
      key: "reviewNeededPages",
      label: "Review Needed",
      value: Number(counts.reviewNeededPages || 0),
    },
  ]

  return preferred.filter((r) => r.value > 0)
}

function ConfidenceTile({
  report,
  upload,
}: {
  report: any
  upload: UploadPayload | null
}) {
  const confidence = computeConfidence(report, upload)

  return (
    <Tile title="PDF Confidence">
      <div className="mb-3">
        <Badge label={confidence.label} tone={confidence.tone} />
      </div>

      {confidence.message ? (
        <div className="text-sm text-zinc-300">{confidence.message}</div>
      ) : (
        <div className="text-sm text-zinc-400">
          No obvious structural or scan-related reliability issue was detected.
        </div>
      )}
    </Tile>
  )
}

function SheetCountPrintSizeTile({
  report,
  pageCount,
}: {
  report: any
  pageCount: number | null
}) {
  const primary = report?.printSizePrimary || "—"
  const sizes = report?.printSizeCounts || {}
  const breakdown = Object.entries(sizes) as Array<[string, number]>
  const diag = report?.printSizeDiagnostics as
    | { totalBoxMatches?: number; pdfPageCount?: number; explanation?: string }
    | null
    | undefined

  return (
    <Tile title="Sheet Count / Print Size">
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-zinc-400">Total sheets:</span> {pageCount ?? "—"}
        </div>
        <div>
          <span className="text-zinc-400">Primary print size:</span> {primary}
        </div>
      </div>

      {breakdown.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <div className="mb-1 font-medium text-zinc-300">Size breakdown (PDF box matches)</div>
          {diag?.explanation ? <div className="mb-2 text-zinc-500">{diag.explanation}</div> : null}
          {typeof diag?.totalBoxMatches === "number" && typeof diag?.pdfPageCount === "number" ? (
            <div className="mb-2 text-zinc-500">
              Total box matches: {diag.totalBoxMatches} · PDF page count: {diag.pdfPageCount}
            </div>
          ) : null}
          <div className="space-y-1">
            {breakdown.map(([size, count]) => (
              <div key={size} className="flex justify-between gap-3">
                <span>{size}</span>
                <span>
                  {count} <span className="text-zinc-600">(boxes)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Tile>
  )
}

function PdfNameTile({ upload }: { upload: UploadPayload }) {
  return (
    <Tile title="PDF Name">
      <div className="break-all text-sm font-medium text-zinc-100">{upload.filename}</div>
      <div className="mt-1 text-xs text-zinc-400">Uploaded {formatDate(upload.createdAt)}</div>
    </Tile>
  )
}

function PdfTrustTile({ upload }: { upload: UploadPayload }) {
  return (
    <Tile title="PDF Trust">
      <div className="flex flex-wrap gap-2">
        <Badge
          label={upload.isSearchable ? "Searchable text detected" : "Text search limited"}
          tone={upload.isSearchable ? "good" : "warn"}
        />
        <Badge
          label={upload.isRasterOnly ? "Raster heavy / scanned" : "Vector / digital"}
          tone={upload.isRasterOnly ? "warn" : "good"}
        />
        <Badge
          label={upload.intakeStatus === "READY" ? "Structurally readable" : "Needs review"}
          tone={upload.intakeStatus === "READY" ? "good" : "warn"}
        />
      </div>
    </Tile>
  )
}

function SheetTypesTile({ report }: { report: any }) {
  const rows = getSheetTypeRows(report)

  return (
    <Tile title="Sheet Types">
      <div className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-3">
            <span>{row.label}</span>
            <span className="text-zinc-300">{row.value}</span>
          </div>
        ))}
      </div>
    </Tile>
  )
}

function DetectionConfidenceTile({ report }: { report: any }) {
  const numberingSchemas = Array.isArray(report?.documentPatterns?.numberingSchemas)
    ? report.documentPatterns.numberingSchemas
    : []

  const likelyIndexPages = Array.isArray(report?.documentPatterns?.likelyIndexPages)
    ? report.documentPatterns.likelyIndexPages
    : []

  const duplicateCandidates = Array.isArray(report?.layer2Summary?.duplicateCandidates)
    ? report.layer2Summary.duplicateCandidates
    : []

  const conflictSets = Array.isArray(report?.layer2Summary?.conflictSets)
    ? report.layer2Summary.conflictSets
    : []

  const lowConfidencePages = Array.isArray(report?.layer2Summary?.lowConfidencePages)
    ? report.layer2Summary.lowConfidencePages
    : []

  return (
    <Tile title="Detection Confidence">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-zinc-400">Detected numbering schemas</span>
          <span className="text-zinc-200">{numberingSchemas.length}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-400">Likely index pages</span>
          <span className="text-zinc-200">
            {likelyIndexPages.length > 0 ? likelyIndexPages.join(", ") : "—"}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-400">Duplicate sheet groups</span>
          <span className="text-zinc-200">{duplicateCandidates.length}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-400">Conflict pages</span>
          <span className="text-zinc-200">{conflictSets.length}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-zinc-400">Low-confidence pages</span>
          <span className="text-zinc-200">{lowConfidencePages.length}</span>
        </div>
      </div>
    </Tile>
  )
}

function buildDisplayParts(row: {
  pageClass?: string | null
  sheetNumber?: string | null
  sheetName?: string | null
  sectionNumber?: string | null
  sectionTitle?: string | null
}) {
  const primaryNumber = clean(row.sheetNumber) ?? clean(row.sectionNumber)
  const primaryTitle = clean(row.sheetName) ?? clean(row.sectionTitle)

  if (row.pageClass === "BLANK") {
    return {
      numberPart: null,
      titlePart: "Blank Page",
    }
  }

  return {
    numberPart: primaryNumber,
    titlePart: primaryTitle,
  }
}

function buildDisplayName(
  row: MergedSheetRow,
  previousRow: MergedSheetRow | null,
) {
  const { numberPart, titlePart } = buildDisplayParts(row)

  if (row.pageClass === "BLANK") {
    return "Blank Page"
  }

  if (numberPart && titlePart) {
    return `${numberPart} — ${titlePart}`
  }

  if (numberPart) {
    return numberPart
  }

  if (titlePart) {
    const previousTitle = clean(previousRow?.sheetName) ?? clean(previousRow?.sectionTitle)
    const previousNumber = clean(previousRow?.sheetNumber) ?? clean(previousRow?.sectionNumber)

    if (
      previousRow &&
      previousRow.pageClass === row.pageClass &&
      previousTitle &&
      previousTitle.toLowerCase() === titlePart.toLowerCase() &&
      !previousNumber
    ) {
      return `${titlePart} — CONT`
    }

    return titlePart
  }

  return `PDF Page ${row.pageNumber}`
}

function ReviewRecommendedTile({
  upload,
  report,
}: {
  upload: UploadPayload
  report: any
}) {
  const rows = (Array.isArray(report?.layer2Summary?.lowConfidencePages)
    ? report.layer2Summary.lowConfidencePages
    : []) as LowConfidencePage[]

  if (rows.length === 0) {
    return (
      <Tile title="Review Recommended Pages" className="md:col-span-3">
        <div className="text-sm text-zinc-400">No low-confidence pages were flagged in the current report.</div>
      </Tile>
    )
  }

  return (
    <Tile title="Review Recommended Pages" className="md:col-span-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">PDF Page</th>
              <th className="px-3 py-2 font-medium">Sheet</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Review Flags</th>
              <th className="px-3 py-2 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const currentLikeRow: MergedSheetRow = {
                id: `review-${row.pageNumber}`,
                pageNumber: row.pageNumber,
                pageClass: null,
                sheetNumber: row.sheetNumber ?? null,
                sheetName: row.sheetName ?? null,
                sectionNumber: null,
                sectionTitle: null,
                discipline: null,
                isElectricalRelated: null,
                sheetType: null,
                scaleStatus: null,
                scaleConfidence: null,
                printSizeLabel: null,
                pageWidthInches: null,
                pageHeightInches: null,
                reviewFlags: row.reviewFlags ?? [],
                confidence: row.overallConfidence == null ? null : { overall: row.overallConfidence },
              }
              const previousLikeRow =
                index > 0
                  ? ({
                      id: `review-${rows[index - 1].pageNumber}`,
                      pageNumber: rows[index - 1].pageNumber,
                      pageClass: null,
                      sheetNumber: rows[index - 1].sheetNumber ?? null,
                      sheetName: rows[index - 1].sheetName ?? null,
                      sectionNumber: null,
                      sectionTitle: null,
                      discipline: null,
                      isElectricalRelated: null,
                      sheetType: null,
                      scaleStatus: null,
                      scaleConfidence: null,
                      printSizeLabel: null,
                      pageWidthInches: null,
                      pageHeightInches: null,
                      reviewFlags: rows[index - 1].reviewFlags ?? [],
                      confidence:
                        rows[index - 1].overallConfidence == null
                          ? null
                          : { overall: rows[index - 1].overallConfidence },
                    } satisfies MergedSheetRow)
                  : null

              return (
                <tr key={`review-${row.pageNumber}`} className="border-b border-zinc-900/80">
                  <td className="px-3 py-3 text-zinc-200">{row.pageNumber}</td>
                  <td className="px-3 py-3 text-zinc-100">
                    {buildDisplayName(currentLikeRow, previousLikeRow)}
                  </td>
                  <td className="px-3 py-3 text-zinc-300">{formatPercent(row.overallConfidence)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {(row.reviewFlags ?? []).map((flag) => (
                        <Badge key={`${row.pageNumber}-${flag}`} label={flag} tone="warn" />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => void openUploadPdfAtPage(upload.id, row.pageNumber)}
                      className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                    >
                      Open Page
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Tile>
  )
}

function getConfidenceTone(confidence: number | null | undefined): "good" | "warn" | "bad" | "neutral" {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "neutral"
  if (confidence >= 0.85) return "good"
  if (confidence >= 0.65) return "warn"
  return "bad"
}

function buildPreviewMap(report: any) {
  const preview = Array.isArray(report?.sheetDetectionPreview)
    ? (report.sheetDetectionPreview as PreviewSheetRow[])
    : []

  const map = new Map<number, PreviewSheetRow>()
  for (const row of preview) {
    if (typeof row?.pageNumber === "number") {
      map.set(row.pageNumber, row)
    }
  }
  return map
}

function mergeRows(
  sheets: SheetPayload[],
  report: any,
  pageCount: number | null,
): MergedSheetRow[] {
  const previewMap = buildPreviewMap(report)
  const dbMap = new Map<number, SheetPayload>()

  for (const row of sheets) {
    dbMap.set(row.pageNumber, row)
  }

  const maxPage =
    typeof pageCount === "number" && pageCount > 0
      ? pageCount
      : Math.max(
          0,
          ...sheets.map((s) => s.pageNumber),
          ...Array.from(previewMap.keys()),
        )

  const rows: MergedSheetRow[] = []

  for (let pageNumber = 1; pageNumber <= maxPage; pageNumber += 1) {
    const db = dbMap.get(pageNumber)
    const preview = previewMap.get(pageNumber)

    rows.push({
      id: db?.id ?? `preview-${pageNumber}`,
      pageNumber,
      pageClass: preview?.pageClass ?? db?.pageClass ?? null,
      sheetNumber: clean(preview?.sheetNumber ?? db?.sheetNumber ?? null),
      sheetName: clean(preview?.sheetName ?? db?.sheetName ?? null),
      discipline: clean(preview?.discipline ?? db?.discipline ?? null),
      sectionNumber: clean(preview?.sectionNumber ?? db?.sectionNumber ?? null),
      sectionTitle: clean(preview?.sectionTitle ?? db?.sectionTitle ?? null),
      isElectricalRelated: preview?.isElectricalRelated ?? db?.isElectricalRelated ?? null,
      sheetType: preview?.sheetType ?? db?.sheetType ?? null,
      scaleStatus: preview?.scaleStatus ?? db?.scaleStatus ?? null,
      scaleConfidence: preview?.scaleConfidence ?? db?.scaleConfidence ?? null,
      printSizeLabel: clean(preview?.printSizeLabel ?? db?.printSizeLabel ?? null),
      pageWidthInches: preview?.pageWidthInches ?? db?.pageWidthInches ?? null,
      pageHeightInches: preview?.pageHeightInches ?? db?.pageHeightInches ?? null,
      reviewFlags:
        preview?.estimatorReviewFlags && preview.estimatorReviewFlags.length > 0
          ? preview.estimatorReviewFlags
          : preview?.reviewFlags ?? [],
      confidence: preview?.confidence ?? null,
    })
  }

  return rows
}

function getRowDisplayType(row: MergedSheetRow) {
  if (row.pageClass === "DRAWING") return "Drawing / Chart"
  if (row.pageClass === "SPECIFICATIONS") return "Specifications"
  if (row.pageClass === "BIDDING_FRONT_END_REQUIREMENTS") {
    return "Bidding / Front-End Requirements"
  }
  if (row.pageClass === "CONTRACTING_REQUIREMENTS") return "Contracting Requirements"
  if (row.pageClass === "GENERAL") return "General Project Info"
  if (row.pageClass === "BLANK") return "Blank Page"
  if (row.pageClass === "UNKNOWN") return "Review Needed"

  if (row.sheetType === "PLAN" || row.sheetType === "DETAIL") return "Drawing / Chart"
  return "Review Needed"
}

function SheetListTile({
  upload,
  report,
  sheets,
  sheetsLoading,
  sheetsError,
}: {
  upload: UploadPayload
  report: any
  sheets: SheetPayload[]
  sheetsLoading: boolean
  sheetsError: string | null
}) {
  const mergedRows = useMemo(
    () => mergeRows(sheets, report, upload.pageCount),
    [sheets, report, upload.pageCount],
  )

  return (
    <Tile title="Sheet List" className="md:col-span-3">
      {sheetsLoading && <div className="text-sm text-zinc-400">Loading sheet list...</div>}

      {sheetsError && !sheetsLoading && (
        <div className="text-sm text-rose-300">{sheetsError}</div>
      )}

      {!sheetsLoading && !sheetsError && mergedRows.length === 0 && (
        <div className="text-sm text-zinc-400">No sheet records available yet.</div>
      )}

      {!sheetsLoading && !sheetsError && mergedRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">PDF Page</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Print Size</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 font-medium">Review</th>
                <th className="px-3 py-2 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((row, index) => {
                const overallConfidence = row.confidence?.overall ?? null
                const reviewFlags = row.reviewFlags ?? []
                const printSize = row.printSizeLabel?.trim() || "—"

                return (
                  <tr key={row.id} className="border-b border-zinc-900/80">
                    <td className="px-3 py-3 text-zinc-200">{row.pageNumber}</td>
                    <td className="px-3 py-3 text-zinc-300">{getRowDisplayType(row)}</td>
                    <td className="px-3 py-3 text-zinc-100">
                      {buildDisplayName(row, index > 0 ? mergedRows[index - 1] : null)}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">{printSize}</td>
                    <td className="px-3 py-3">
                      <Badge
                        label={formatSheetRowConfidence(overallConfidence)}
                        tone={getConfidenceTone(overallConfidence)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {reviewFlags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {reviewFlags.slice(0, 2).map((flag) => (
                            <Badge key={`${row.id}-${flag}`} label={flag} tone="warn" />
                          ))}
                          {reviewFlags.length > 2 && (
                            <Badge label={`+${reviewFlags.length - 2} more`} tone="neutral" />
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => void openUploadPdfAtPage(upload.id, row.pageNumber)}
                        className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                      >
                        Open Page
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-xs text-zinc-500">
        Page-specific opening is wired into the layout now. Exact page jumping becomes fully active once the file route reads the page query.
      </div>
    </Tile>
  )
}

function IntakeInner() {
  const searchParams = useSearchParams()
  const uploadId = (searchParams?.get("uploadId") || "").trim()

  const [upload, setUpload] = useState<UploadPayload | null>(null)
  const [sheets, setSheets] = useState<SheetPayload[]>([])
  const [loading, setLoading] = useState(false)
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetsError, setSheetsError] = useState<string | null>(null)

  async function loadSheets(targetUploadId: string) {
    setSheetsLoading(true)
    setSheetsError(null)

    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(targetUploadId)}/sheets`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to fetch sheets (${res.status})`)
      }

      const rows = Array.isArray(data.sheets) ? data.sheets : []
      setSheets(rows as SheetPayload[])
    } catch (e: any) {
      setSheets([])
      setSheetsError(String(e?.message || e || "Failed to load sheets"))
    } finally {
      setSheetsLoading(false)
    }
  }

  async function load() {
    if (!uploadId) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(uploadId)}`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to fetch upload (${res.status})`)
      }

      const nextUpload = data.upload as UploadPayload
      setUpload(nextUpload)

      if (nextUpload.intakeStatus === "READY") {
        await loadSheets(nextUpload.id)
      } else {
        setSheets([])
        setSheetsError(null)
      }
    } catch (e: any) {
      setUpload(null)
      setSheets([])
      setError(String(e?.message || e || "Failed to load intake"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [uploadId])

  const report = useMemo(() => upload?.intakeReport || null, [upload])

  const backToProjectHref = upload?.projectId ? `/projects/${upload.projectId}` : "/projects"
  const openWholeFileHref = upload ? `/api/uploads/${upload.id}/file` : "#"

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Intake Report</h1>
          <div className="text-sm text-zinc-400">Estimator-facing file readiness summary</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={backToProjectHref}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
          >
            Back to Project
          </Link>

          {upload && (
            <a
              href={openWholeFileHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              Open Full File
            </a>
          )}

          <button
            onClick={load}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60"
            disabled={!uploadId || loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {!uploadId && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">
          Missing uploadId in the URL.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {!upload && loading && <div className="text-sm text-zinc-400">Loading...</div>}

      {upload && upload.intakeStatus !== "READY" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300">
          Intake status is <span className="font-medium">{upload.intakeStatus}</span>
          {upload.intakeStage ? (
            <>
              {" "}
              (stage: <span className="font-medium">{upload.intakeStage}</span>)
            </>
          ) : null}
          . The report will appear when the upload is ready.
          {upload.intakeStatus === "PROCESSING" && upload.intakeDelayReason && (
            <div className="mt-2 text-xs text-zinc-500">{upload.intakeDelayReason}</div>
          )}
        </div>
      )}

      {upload && upload.intakeStatus === "READY" && (
        <div className="grid gap-4 md:grid-cols-3">
          <ConfidenceTile report={report} upload={upload} />
          <SheetCountPrintSizeTile report={report} pageCount={upload.pageCount} />
          <PdfNameTile upload={upload} />
          <PdfTrustTile upload={upload} />
          <SheetTypesTile report={report} />
          <DetectionConfidenceTile report={report} />
          <ReviewRecommendedTile upload={upload} report={report} />
          <SheetListTile
            upload={upload}
            report={report}
            sheets={sheets}
            sheetsLoading={sheetsLoading}
            sheetsError={sheetsError}
          />
        </div>
      )}
    </div>
  )
}

export default function IntakePage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-400">Loading...</div>}>
      <IntakeInner />
    </Suspense>
  )
}