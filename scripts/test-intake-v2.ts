/**
 * Local intake_v2 harness — no HTTP, no DB writes, no v1 orchestrator.
 *
 * Usage:
 *   npm run test:intake-v2 -- ./path/to/file.pdf
 *   npm run test:intake-v2 -- --uploadId <cuid>   (needs DIRECT_DATABASE_URL + R2_* env)
 *
 * Or: PDF_PATH=./x.pdf npm run test:intake-v2
 */

import fs from "node:fs/promises"
import path from "node:path"
import { runIntakeV2 } from "../lib/intake_v2/run-intake-v2"
import type { IntakeV2RunResult } from "../lib/intake_v2/types"

function parseArgs(argv: string[]) {
  let uploadId: string | null = null
  const rest: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--uploadId" && argv[i + 1]) {
      uploadId = argv[++i]!.trim()
      continue
    }
    if (a.startsWith("--uploadId=")) {
      uploadId = a.slice("--uploadId=".length).trim()
      continue
    }
    rest.push(a)
  }

  const pdfPath =
    rest.find((x) => !x.startsWith("-") && x.length > 0) ?? process.env.PDF_PATH ?? null

  return { uploadId, pdfPath }
}

async function loadPdfBufferFromPath(resolvedPath: string): Promise<Buffer> {
  return fs.readFile(resolvedPath)
}

async function loadBufferFromUploadId(uploadId: string): Promise<{ buffer: Buffer; sourceLabel: string }> {
  const { prisma } = await import("../lib/prisma")
  const { readUploadBufferFromR2 } = await import("../lib/intake/r2-read")

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { r2Key: true, filename: true },
  })

  if (!upload?.r2Key) {
    throw new Error(`Upload not found or missing r2Key: ${uploadId}`)
  }

  const { buffer } = await readUploadBufferFromR2(upload.r2Key)
  return { buffer, sourceLabel: upload.filename ?? uploadId }
}

function slimJsonResult(result: IntakeV2RunResult) {
  return {
    ok: result.ok,
    error: result.error,
    pageCount: result.pageCount,
    meta: result.meta,
    rows: result.rows,
    pagePreviews: result.pagePreviews,
  }
}

function printHumanSummary(result: IntakeV2RunResult) {
  const { pageCount, rows } = result
  const withSheet = rows.filter((r) => r.sheetNumber)
  const withTitle = rows.filter((r) => r.title)

  console.log("\n--- intake_v2 summary ---")
  console.log(`ok:          ${result.ok}${result.error ? ` (${result.error})` : ""}`)
  console.log(`pageCount:   ${pageCount}`)
  console.log(`durationMs:  ${result.meta.durationMs}`)
  console.log(`rows w/ sheet# guess: ${withSheet.length}, w/ title guess: ${withTitle.length}`)

  console.log("\n--- per-page (page | sheet | title) ---")
  for (const row of rows) {
    const sn = row.sheetNumber ?? "—"
    const ti = (row.title ?? "—").replace(/\s+/g, " ").slice(0, 64)
    console.log(`  ${String(row.pageNumber).padStart(3)} | ${String(sn).padEnd(14)} | ${ti}`)
  }
  console.log("\n--- full JSON ---\n")
}

async function main() {
  const argv = process.argv.slice(2)
  const { uploadId, pdfPath } = parseArgs(argv)

  if (!uploadId && !pdfPath) {
    console.error("Usage:")
    console.error("  npm run test:intake-v2 -- <path-to.pdf>")
    console.error("  npm run test:intake-v2 -- --uploadId <uploadCuid>")
    console.error("  PDF_PATH=./file.pdf npm run test:intake-v2")
    console.error("")
    console.error("--uploadId requires DIRECT_DATABASE_URL and R2_* env (same as the app).")
    process.exit(1)
  }

  let buffer: Buffer
  let sourceLabel: string

  if (uploadId) {
    if (pdfPath) {
      console.warn("Warning: both --uploadId and file path given; using --uploadId only.\n")
    }
    const loaded = await loadBufferFromUploadId(uploadId)
    buffer = loaded.buffer
    sourceLabel = `uploadId:${uploadId} (${loaded.sourceLabel})`
  } else {
    const resolved = path.resolve(process.cwd(), pdfPath!)
    buffer = await loadPdfBufferFromPath(resolved)
    sourceLabel = resolved
  }

  console.log(`Source: ${sourceLabel}`)
  console.log(`Bytes:  ${buffer.length}`)

  const result = await runIntakeV2(buffer)
  printHumanSummary(result)
  console.log(JSON.stringify({ source: sourceLabel, ...slimJsonResult(result) }, null, 2))

  if (!result.ok) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
