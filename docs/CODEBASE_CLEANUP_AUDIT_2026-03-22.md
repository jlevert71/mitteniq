# MittenIQ codebase cleanup audit — 2026-03-22

This document is a **read-only** repository audit of the safe snapshot. No code was modified to produce it. Claims below cite concrete paths and import/call evidence from this tree unless marked **unclear**.

---

## 1. Executive Summary

### What appears healthy

- **Next.js app shell and routing** are conventional: `app/layout.tsx`, `app/page.tsx`, protected segments via `middleware.ts`, and project-scoped pages under `app/projects/`.
- **Auth** is wired end-to-end: cookie `mitten-auth`, `app/login/page.tsx`, `app/api/login/route.ts`, `app/api/logout/route.ts`, and `requireUserId` from `lib/auth.ts` on sensitive APIs.
- **Upload → R2 → DB → analyze** is a clear spine: `app/projects/[projectId]/page.tsx` calls `/api/uploads/presign`, PUT to R2, `/api/uploads/complete`, then **`/api/uploads/analyze`** (see `handleFiles` in that file). Analyze delegates to `runIntakeAnalysis` in `lib/intake/run-intake-analysis.ts`.
- **Persistence** is explicit in `prisma/schema.prisma` (`User`, `Project`, `Upload`, `Sheet`) and matches the upload/intake fields used in API routes.

### What appears bloated or risky

- **Intake is orchestrated as one very large pipeline** in `lib/intake/run-intake-analysis.ts` (**936 lines** in this snapshot) that sequences PDF I/O, routing, OCR, images, multiple structure/index detectors, AI passes, registry validation, reporting, and **raw SQL** sheet writes.
- **Several large modules** concentrate overlapping concerns (structure detection, registry logic, AI merge, reporting). Approximate physical line counts (newline-split, verified in this snapshot): `lib/intake/run-ai-intake.ts` **3669**, `lib/intake/registry-validation.ts` **1467**, `lib/intake/report-mappers.ts` **737**, `lib/intake/visible-intake-selection.ts` **900**, `lib/intake/front-structure-scan.ts` **713**, `lib/intake/drawing-set-registry.ts` **363**, `app/intake/page.tsx` **992**.
- **Two PDF engines**: text extraction uses `pdf-parse` (`lib/intake/pdf-text-extraction.ts` imports `PDFParse` from `pdf-parse`); rasterization uses `pdfjs-dist` (`lib/intake/page-images.ts` imports from `pdfjs-dist/legacy/build/pdf.mjs`). Both operate on the same upload buffer in sequence.
- **Client bundle coupling**: `app/intake/page.tsx` is `"use client"` and imports `stripRedundantSheetPrefix` from `@/lib/intake/report-mappers`, whose top-level imports pull in `registry-validation`, `drawing-set-registry`, and `front-structure-scan` types — far more than the single helper suggests.

### Top 5 cleanup opportunities

1. **Split or quarantine the monolithic intake orchestrator** (`run-intake-analysis.ts`) into documented stages with narrow interfaces; highest leverage for reasoning about a V1 reset.
2. **Collapse or sequence duplicate “index / TOC / structure” detectors** — `front-structure-scan.ts` and `index-page-detection.ts` both reason about drawing index / spec-like front matter with overlapping regex vocabulary; they feed different branches but increase cognitive load and failure modes.
3. **Extract `stripRedundantSheetPrefix` (or a tiny shared string util)** out of `report-mappers.ts` so the client page does not depend on the full report/registry graph.
4. **Retire or gate legacy endpoints** with no in-app callers: `app/api/intake/route.ts` (stub JSON; no `fetch("/api/intake")` under `app/`), `app/api/debug/project/route.ts` (no references in `app/` outside its own file).
5. **Reconcile duplicate intake UIs**: `app/intake/page.tsx` is linked from `app/projects/[projectId]/page.tsx` as `/intake?uploadId=…`, while `app/projects/[projectId]/intake/` + `IntakeClient.tsx` implement a second flow (JSON report, auto-analyze on visit) **with no `Link` targets found** under `app/` — likely orphan or manual-URL-only.

---

## 2. Keep / Likely Core

These paths appear **essential** to preserving boot, routing, auth, projects, upload, persistence, and the current intake shell.

| Area | Paths |
|------|--------|
| App shell | `app/layout.tsx`, `app/page.tsx`, `next.config.ts` |
| Routing / protection | `middleware.ts` (public: `/`, `/login`, `/setup`; API unguarded at edge; matcher includes `/projects/:path*`, `/intake/:path*`, etc.) |
| Auth UI + API | `app/login/page.tsx`, `app/api/login/route.ts`, `app/api/logout/route.ts`, `lib/auth.ts` |
| Setup (if used in your env) | `app/setup/page.tsx` |
| Projects | `app/projects/page.tsx`, `app/projects/[projectId]/page.tsx`, `app/api/projects/route.ts`, `app/api/projects/[projectId]/route.ts`, `app/api/projects/[projectId]/uploads/route.ts` |
| Upload pipeline | `app/api/uploads/presign/route.ts`, `app/api/uploads/complete/route.ts`, `app/api/uploads/get/route.ts`, `app/api/uploads/[uploadId]/route.ts`, `app/api/uploads/[uploadId]/file/route.ts`, `app/api/uploads/[uploadId]/sheets/route.ts` |
| Intake execution | `app/api/uploads/analyze/route.ts` → `lib/intake/run-intake-analysis.ts` and **the entire `lib/intake/*` graph it imports** (currently all intake modules are reachable from that chain or from `run-ai-intake.ts`). |
| R2 / DB | `lib/r2.ts`, `lib/intake/r2-read.ts`, `lib/prisma.ts`, `prisma/schema.prisma`, migrations under `prisma/migrations/` |
| Primary intake UI (linked) | `app/intake/page.tsx` (linked from project page as `/intake?uploadId=…`) |

**Note:** Agent placeholder pages (`app/projects/[projectId]/agents/*/page.tsx`, `app/agents/page.tsx`) are thin shells but part of the product surface area; not intake-critical.

---

## 3. High-Risk Complexity Areas

For each cluster: **files**, **responsibility**, **why it is broad / overlapping / brittle**.

### A. End-to-end intake orchestration

- **Files:** `lib/intake/run-intake-analysis.ts`, `app/api/uploads/analyze/route.ts`
- **Responsibility:** Single async pipeline: R2 read → PDF checks → text extraction → prepared pages → router → page images → OCR → front structure scan → drawing registry → optional visual identity → AI gating (index-first vs full vs deterministic) → registry validation → spec section grouping → large JSON `intakeReport` → **`prisma.$executeRawUnsafe` bulk insert** into `Sheet`.
- **Why risky:** Any stage failure or schema drift affects persistence, user-visible status, and downstream sheets together; hard to test or replace one concern without understanding the whole DAG.

### B. AI intake and chunk orchestration

- **Files:** `lib/intake/run-ai-intake.ts` (**3669 lines** in this snapshot)
- **Responsibility:** OpenAI client, chunking, retries, spec fast-path hooks (`spec-fast-path.ts`), merging LLM output with deterministic hints (`drawing-identity.ts`, `resolve-final-drawing-identity.ts`), normalization, and review/confidence thresholds.
- **Why risky:** Large surface mixing transport, prompting, domain normalization, and policy; small env changes (`OPENAI_API_KEY`, `MITTENIQ_LLM_INTAKE_ENABLED`) flip behavior between full-document and gated paths (`run-intake-analysis.ts` branches on `canRunAiIntake()`).

### C. Registry and post-hoc validation overlay

- **Files:** `lib/intake/registry-validation.ts` (**1467 lines**), `lib/intake/report-mappers.ts` (**737 lines**), parts of `lib/intake/drawing-set-registry.ts` (**363 lines**)
- **Responsibility:** Authority maps from front structure, reconciliation of per-page AI output vs registry, display-oriented resolution for reports and sheet rows, `buildSqlSheetRows` consumed by orchestrator.
- **Why risky:** Second “truth” layer after AI; overlaps with drawing registry build and front scan; high line count increases inconsistent edge-case handling.

### D. Visible intake selection (deterministic vs AI)

- **Files:** `lib/intake/visible-intake-selection.ts` (**900 lines**)
- **Responsibility:** Decides which pages need heavy AI vs stubs, weak-index assist, merge of AI partial pages with registry skips (`mergeVisibleIntakeWithStubs`), interacts with `registry-validation` exports.
- **Why risky:** Tightly couples page selection policy to registry maps and front-structure credibility — another overlapping “routing” layer distinct from `router-stage.ts`.

### E. Front-of-document structure scan

- **Files:** `lib/intake/front-structure-scan.ts` (**713 lines**), uses `spec-outline.ts`, `drawing-set-registry.ts`
- **Responsibility:** Detects drawing index / weak index / spec TOC from early pages; produces `FrontStructureScanResult` driving authority and downstream selection.
- **Why risky:** Parallel vocabulary and goals to `index-page-detection.ts` (see section 4).

### F. PDF-specific / dual-engine I/O

- **Files:** `lib/intake/pdf-text-extraction.ts` (`pdf-parse`), `lib/intake/page-images.ts` (`pdfjs-dist` + `@napi-rs/canvas`), `lib/intake/ocr.ts` (Tesseract + layout rebuild), `lib/intake/pdf-analysis.ts`
- **Responsibility:** Text items, approximate positional tokens (`approximate-positional-tokens.ts` shared by OCR path and pdf text path), rendered previews for AI/OCR.
- **Why brittle:** Two render/parse stacks must agree well enough for heuristics; OCR and native text both feed `layout-evidence` / routing — multiple sources of “truth” for the same page.

### G. Client intake report surface

- **Files:** `app/intake/page.tsx`
- **Responsibility:** Rich UI over `intakeReport` JSON and `/api/uploads/:id/sheets`; uses `stripRedundantSheetPrefix` from server-oriented `report-mappers.ts`.
- **Why risky:** Large client component + deep type surface; comment in UI notes PDF page links depend on file route behavior (`app/api/uploads/[uploadId]/file/route.ts` appends `#page=` to signed URL — viewer-dependent).

---

## 4. Redundant / Overlapping Logic

| Topic | Where it appears | Evidence |
|-------|------------------|----------|
| **Spec / CSI / TOC-ish signals** | `lib/intake/router.ts` (`inferPageRoute`: inline `specSignals`, `bidSignals`, `drawingSignals` regex counts) **and** `lib/intake/spec-signals.ts` (`detectSpecSignals` used in `prepare-pages.ts` for `page.specSignals` + extraction warnings) | Same conceptual concern split across router scoring vs structured page flags. |
| **Drawing index / sheet list detection** | `lib/intake/front-structure-scan.ts` (phrases, parsing via `drawing-set-registry` helpers) **and** `lib/intake/index-page-detection.ts` (first-N pages, `INDEX_PHRASES`, continuation logic) | Both classify index-like pages; orchestrator uses **both** (`runFrontStructureScan` then `detectIndexCandidates` / `selectBestIndexBlock`). |
| **Sheet / drawing identity** | `lib/intake/drawing-identity.ts` (text/title-block hints), `lib/intake/drawing-identity-from-image.ts` (visual enrichment), `lib/intake/resolve-final-drawing-identity.ts` (final merge rules used inside `run-ai-intake.ts`) | Three layers from hints → optional vision → post-LLM resolution. |
| **Positional / approximate text** | `lib/intake/approximate-positional-tokens.ts` imported by **`pdf-text-extraction.ts` and `ocr.ts`** | Shared approximation when native positions missing or OCR replaces text. |
| **Confidence / trust** | `router-stage.ts` (file-level route confidence), `front-structure-scan.ts` (`confidence` on scan), `index-page-detection.ts` (block confidence), per-page AI `confidence` in `run-ai-intake.ts`, `registry-validation` authority flags, `report-mappers` / `sheetDetectionPreview` | Many independent scores; `run-intake-analysis.ts` even adds `reportSummaryConsistency` comparing review counts vs confidence presence. |
| **Spec section grouping** | `lib/intake/spec-section-grouping.ts` invoked in orchestrator when SPEC TOC authority active **and** imported inside `run-ai-intake.ts` as well | Grouping reachable from more than one lifecycle point. |
| **PDF validation** | `lib/intake/pdf-analysis.ts` (`basicPdfChecks`, etc.) **and** `app/api/intake/route.ts` (header `%PDF` check) | Duplicate “is this a PDF” logic in different layers; the API route is separate from the main pipeline. |

---

## 5. Likely Dead Code / Unused Files

**Do not delete based on this list alone** — verify consumers outside this repo (mobile, scripts, Postman, etc.).

| Item | Why it appears unused / stale |
|------|-------------------------------|
| `app/api/intake/route.ts` | No matches for `"/api/intake"` or `api/intake` under `app/` (client code). Returns hard-coded style `report` fields (`textSearchable: true`, `scaleConfidence: 0.72`) — looks like an early stub parallel to the real analyze path. |
| `app/api/debug/project/route.ts` | No references to `debug/project` under `app/` except this file. Creates a `Project` for the authenticated user — likely manual/dev tooling. |
| `app/projects/[projectId]/intake/page.tsx` + `IntakeClient.tsx` | No `Link` or `href` to `/projects/.../intake` found under `app/`. Project page links to **`/intake?uploadId=`** instead. **Unclear** if used via bookmark or external docs. |
| `scripts/test-outline.ts` | Only referenced from `package.json` script `test:outline`. Not part of runtime app. |

**Not dead:** All `lib/intake/*.ts` modules are imported by other intake modules or `run-intake-analysis.ts` / `run-ai-intake.ts` (verified via grep import graph; `spec-outline.ts` and `spec-fast-path.ts` are used from `front-structure-scan.ts`, `run-ai-intake.ts`, and the script above).

---

## 6. Quarantine Candidates

Safe **first** moves (conceptually — not done in this pass) to reduce active-path noise without deleting intake internals:

1. **`app/api/intake/route.ts`** — Move behind explicit dev flag or document as legacy; confirm no external clients.
2. **`app/api/debug/project/route.ts`** — Restrict to dev environment or remove from production builds after confirmation.
3. **`app/projects/[projectId]/intake/*`** — If product standard is global `/intake`, consider deprecating this route or adding a single redirect to reduce dual maintenance.
4. **Optional intake toggles already present** — e.g. `MITTENIQ_VISIBLE_INTAKE_VISUAL_DRAWING_IDENTITY`, `MITTENIQ_LLM_INTAKE_ENABLED`, `MITTENIQ_OCR_MAX_PAGES` (see `run-intake-analysis.ts`, `run-ai-intake.ts`, `ocr.ts`) — good levers to **disable subsystems** before code removal.

---

## 7. Proposed Cleanup Batches

### Batch A — “Legacy API & debug isolation”

- **Files:** `app/api/intake/route.ts`, `app/api/debug/project/route.ts`
- **Risk:** **Low** (if confirmed no external callers).
- **Together:** Both are standalone route handlers with no imports from `lib/intake`.
- **Test:** `next build`; smoke POST routes if kept; grep monorepo / API clients.

### Batch B — “Client import hygiene for intake UI”

- **Files:** `app/intake/page.tsx`, new small util module (future) split from `lib/intake/report-mappers.ts`
- **Risk:** **Low / medium** — behavior change only if helper diverges.
- **Together:** Decouples UI from registry-validation import graph.
- **Test:** Load `/intake?uploadId=…` with READY upload; verify sheet table rendering and prefix stripping.

### Batch C — “Intake UI consolidation”

- **Files:** `app/intake/page.tsx`, `app/projects/[projectId]/intake/*`, `app/projects/[projectId]/page.tsx` (link target)
- **Risk:** **Medium** — routing and analyze-on-visit behavior differ today (`IntakeClient` triggers `/api/uploads/analyze`; global intake does not — analyze is triggered from project upload handler).
- **Together:** One coherent UX reduces duplicate maintenance.
- **Test:** Full upload flow; PENDING → PROCESSING → READY; ensure analyze still runs once.

### Batch D — “Structure/index detection merge (design + code)”

- **Files:** `lib/intake/front-structure-scan.ts`, `lib/intake/index-page-detection.ts`, call sites in `run-intake-analysis.ts`
- **Risk:** **High** — changes which pages go to index-first AI vs full AI.
- **Together:** Single module boundary for “front matter” interpretation.
- **Test:** Golden PDFs covering drawing set with index, spec TOC, weak index, mixed sets; compare `intakeReport` and `Sheet` rows.

### Batch E — “Registry + report mapper decomposition”

- **Files:** `lib/intake/registry-validation.ts`, `lib/intake/report-mappers.ts`, `lib/intake/drawing-set-registry.ts`
- **Risk:** **High** — affects SQL sheet mapping and review flags.
- **Together:** Same data contract (`IntakeRunResult`, Prisma `Sheet`); should not split without stable types.
- **Test:** Analyze several uploads; diff `Sheet` table; verify `layer2Summary` / `sheetDetectionPreview` in JSON.

### Batch F — “Replace raw SQL sheet insert”

- **Files:** `lib/intake/run-intake-analysis.ts` (tail: `prisma.$executeRawUnsafe`), possibly `lib/intake/report-mappers.ts` (`buildSqlSheetRows`)
- **Risk:** **High** — data integrity and injection safety (today values are escaped via `escapeSqlString` in-file).
- **Together:** Prisma `createMany` or transaction belongs with schema migration review.
- **Test:** Large page counts; failure mid-run; verify rollback expectations.

---

## 8. Intake Reset Notes (V1 narrowing)

For a **V1 rebuild**, intake today appears to do at least all of the following in one product pass:

- PDF structural heuristics + print-size box statistics (`pdf-analysis.ts`)
- Per-page routing + file-level routing (`router.ts`, `router-stage.ts`)
- Raster page rendering for AI/OCR caps (`page-images.ts`)
- OCR with Tesseract for low-text pages (`ocr.ts`)
- Front structure discovery + spec outline parsing (`front-structure-scan.ts`, `spec-outline.ts`)
- Drawing set registry from text + multiple validation passes (`drawing-set-registry.ts`, `registry-validation.ts`)
- Pre-AI page selection and weak-index assistance (`visible-intake-selection.ts`)
- Multiple AI paths: forced single-page index extraction, index-first sheet list extraction, partial escalation, full chunk intake (`run-ai-intake.ts`, `index-canonical-registry.ts`)
- Optional visual drawing identity (`drawing-identity-from-image.ts`, env-gated)
- Spec section grouping for TOC authority (`spec-section-grouping.ts`)
- Large estimator-facing report assembly + legacy summaries (`report-mappers.ts`)

**Reasonable V1 cuts or deferrals** (product-dependent — not prescriptions):

- **Defer** visual drawing identity and “index-first” optimization paths; keep one deterministic structure pass + one AI pass (or none with explicit feature flag).
- **Defer** separate `index-page-detection` vs `front-structure-scan` — pick one authority model.
- **Keep** minimal: upload storage, page count, searchable vs raster hint, optional single text extract path, persist `intakeReport` versioned schema, and **simple** `Sheet` rows (even placeholders) until estimators need more.

---

## Safest first cleanup batch

**Batch A — Legacy API & debug isolation** (`app/api/intake/route.ts`, `app/api/debug/project/route.ts`), after confirming no external HTTP clients depend on them.

---

## Most dangerous area to touch carelessly

**The sheet persistence and registry/AI merge seam:** `buildSqlSheetRows` + `prisma.$executeRawUnsafe` at the end of `lib/intake/run-intake-analysis.ts`, coupled with `registry-validation.ts` and `visible-intake-selection.ts`. Changes here alter **database truth** and estimator-facing tables without obvious compile-time failures.

---

*End of audit — awaiting review before any code changes.*
