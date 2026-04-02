/**
 * Test runner for spec-outline extraction.
 * Run from project root: npx tsx scripts/test-outline.ts <path-to-pdf> [--ranges]
 * Example: npx tsx scripts/test-outline.ts ./specs/sample.pdf
 *          npx tsx scripts/test-outline.ts ./specs/sample.pdf --ranges
 */

import fs from "node:fs/promises"
import path from "node:path"
import {
  extractSpecOutline,
  extractSpecOutlineWithSectionRanges,
} from "../lib/intake/spec-outline"
import { analyzeSpecFastPathEligibility } from "../lib/intake/spec-fast-path"

function parseArgs(argv: string[]) {
  const showRanges =
    argv.includes("--ranges") || argv.includes("-r") || process.env.OUTLINE_RANGES === "1"
  const showEligibility = argv.includes("--eligibility") || argv.includes("-e")
  const pdfPath =
    argv.find((a) => !a.startsWith("-")) ?? process.env.PDF_PATH
  return { showRanges, showEligibility, pdfPath }
}

async function main() {
  const argv = process.argv.slice(2)
  const { showRanges, showEligibility, pdfPath } = parseArgs(argv)

  if (!pdfPath) {
    console.error("Usage: npx tsx scripts/test-outline.ts <path-to-pdf> [--ranges]")
    console.error("   or: PDF_PATH=/path/to/file.pdf npx tsx scripts/test-outline.ts")
    console.error("       OUTLINE_RANGES=1 …  also prints CSI section ranges table")
    console.error("       --eligibility / -e … prints fast-path eligibility summary")
    process.exit(1)
  }

  const resolved = path.resolve(process.cwd(), pdfPath)
  let buffer: Buffer
  try {
    buffer = await fs.readFile(resolved)
  } catch (err) {
    console.error("Failed to read PDF:", err instanceof Error ? err.message : err)
    process.exit(1)
  }

  console.log("PDF:", resolved)
  console.log("Size:", buffer.length, "bytes")
  console.log("")

  let entries: Awaited<ReturnType<typeof extractSpecOutline>>
  let sectionRanges: Awaited<
    ReturnType<typeof extractSpecOutlineWithSectionRanges>
  >["sectionRanges"] | null = null

  if (showRanges) {
    const loaded = await extractSpecOutlineWithSectionRanges(buffer)
    entries = loaded.outline
    sectionRanges = loaded.sectionRanges
  } else {
    entries = await extractSpecOutline(buffer)
  }

  console.log("Outline entries:", entries.length)
  if (entries.length === 0) {
    console.log("(No bookmarks found in this PDF)")
    if (!showEligibility) return
  }
  console.log("")
  console.log("Title                                                    | Page | Depth")
  console.log("-".repeat(60))
  for (const e of entries) {
    const title = e.title.slice(0, 50).padEnd(50)
    console.log(`${title} | ${String(e.page).padStart(4)} | ${e.depth}`)
  }

  if (showRanges) {
    console.log("")
    console.log("=".repeat(72))
    console.log("CSI-style section ranges (from qualifying bookmarks only)")
    console.log("=".repeat(72))

    const ranges = sectionRanges ?? []
    console.log("Qualifying sections:", ranges.length)
    if (ranges.length === 0) {
      console.log("(No CSI-style numbered titles found in outline)")
      if (!showEligibility) return
    }
    console.log("")
    const colNum = 12
    const colTitle = 36
    const hdr =
      "Section #".padEnd(colNum) +
      "Title".padEnd(colTitle) +
      "Start".padStart(6) +
      "  " +
      "End".padStart(6) +
      "  " +
      "Depth"
    console.log(hdr)
    console.log("-".repeat(Math.min(100, hdr.length + 10)))
    for (const r of ranges) {
      const num = (r.sectionNumber ?? "—").slice(0, colNum - 1).padEnd(colNum)
      const tit = r.sectionTitle.slice(0, colTitle - 1).padEnd(colTitle)
      console.log(
        `${num}${tit}${String(r.startPage).padStart(6)}  ${String(r.endPage).padStart(6)}  ${r.depth}`,
      )
    }
  }

  if (showEligibility) {
    console.log("")
    console.log("========================================================================")
    console.log("Fast-path eligibility")
    console.log("========================================================================")

    const eligibility = await analyzeSpecFastPathEligibility({ pdfBuffer: buffer })

    console.log("Eligible:", eligibility.eligible)
    console.log("Profile:", eligibility.profile)
    console.log("Confidence:", eligibility.confidence.toFixed(2))
    console.log("")

    console.log("Reason codes:")
    for (const rc of eligibility.reasonCodes) {
      console.log(`- ${rc}`)
    }
    if (eligibility.reasonCodes.length === 0) console.log("- (none)")
    console.log("")

    console.log("Reasoning:")
    for (const line of eligibility.reasoning) {
      console.log(`- ${line}`)
    }
    console.log("")

    console.log("Metrics:")
    console.log(`- numPages: ${eligibility.metrics.numPages}`)
    console.log(`- outlineEntries: ${eligibility.metrics.outlineEntries}`)
    console.log(`- sectionRanges: ${eligibility.metrics.sectionRanges}`)
    console.log(`- csiLikeEntries: ${eligibility.metrics.csiLikeEntries}`)
    console.log(`- articleLikeEntries: ${eligibility.metrics.articleLikeEntries}`)
    console.log(`- mdotLikeEntries: ${eligibility.metrics.mdotLikeEntries}`)
    console.log(`- deepestDepth: ${eligibility.metrics.deepestDepth}`)
    console.log(`- uniqueOutlinePages: ${eligibility.metrics.uniqueOutlinePages}`)
    console.log(`- outlineCoverageRatio: ${eligibility.metrics.outlineCoverageRatio.toFixed(4)}`)
    if (eligibility.metrics.deepManualEntries !== undefined) {
      console.log(`- deepManualEntries: ${eligibility.metrics.deepManualEntries}`)
    }
    if (eligibility.metrics.deepManualPages !== undefined) {
      console.log(`- deepManualPages: ${eligibility.metrics.deepManualPages}`)
    }
    if (eligibility.metrics.deepManualDepth !== undefined) {
      console.log(`- deepManualDepth: ${eligibility.metrics.deepManualDepth}`)
    }
    if (eligibility.metrics.deepManualDensity !== undefined) {
      console.log(`- deepManualDensity: ${eligibility.metrics.deepManualDensity.toFixed(4)}`)
    }
    if (eligibility.metrics.articleStrength !== undefined) {
      console.log(`- articleStrength: ${eligibility.metrics.articleStrength.toFixed(4)}`)
    }
    if (eligibility.metrics.mdotStrength !== undefined) {
      console.log(`- mdotStrength: ${eligibility.metrics.mdotStrength.toFixed(4)}`)
    }
    if (eligibility.metrics.articleSubtreeOverride !== undefined) {
      console.log(`- articleSubtreeOverride: ${eligibility.metrics.articleSubtreeOverride}`)
    }
    if (eligibility.metrics.mdotOverwhelmingOverrideBlock !== undefined) {
      console.log(
        `- mdotOverwhelmingOverrideBlock: ${eligibility.metrics.mdotOverwhelmingOverrideBlock}`,
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
