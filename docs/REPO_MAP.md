# Repo Map (Verified)

Repo root: `C:\Users\mitte\mitteniq`

This file is a practical map of the repository as it exists today.

It is not intended to document every file in the repo.  
It is intended to show the important structure, active architecture, and where the main responsibilities currently live.

---

# Root Files (Observed)

- `package.json`
- `package-lock.json`
- `next.config.ts`
- `tailwind.config.js`
- `tsconfig.json`
- `prisma.config.ts`
- `.env`
- `.env.local`

---

# Root Folders (Observed)

- `app/` → Next.js App Router application
- `docs/` → project documentation and continuity layer
- `lib/` → shared utilities and intake pipeline modules
- `prisma/` → database schema and migrations
- `public/` → static assets
- `node_modules/` → installed dependencies (generated)
- `.next/` → Next.js build output (generated — do not edit)

---

# Docs Folder

- `docs/*.md` → active project documentation
- `docs/build state/` → existing folder from prior work (leave as-is)

Important active docs include:
- `ARCHITECTURE.md`
- `BUILD_STATE_SNAPSHOT.md`
- `DECISIONS.md`
- `ROADMAP.md`
- `TASK_QUEUE.md`
- `KNOWN_ISSUES.md`
- `REPO_MAP.md`
- `CONVENTIONS.md`
- `GUARDRAILS.md`
- `INTAKE_ARCHITECTURE_V2.md`
- `RESUME_PROMPT.md`

---

# App Router Structure

Located under: `app/`

Top-level routes and folders:

- `agents/` → agent-related UI
- `api/` → server API routes
- `dashboard/` → dashboard UI area
- `intake/` → intake interface pages
- `login/` → authentication UI
- `projects/` → project list and project detail pages
- `savings/` → savings-related UI pages
- `setup/` → first-time user account setup

Global app files:
- `layout.tsx` → root application layout
- `page.tsx` → root landing page
- `globals.css` → global styles
- `favicon.ico` → site icon

---

# API Routes

Observed active API routes:

- `app/api/debug/project/route.ts`
- `app/api/intake/route.ts`
- `app/api/lead/route.ts`
- `app/api/login/route.ts`
- `app/api/logout/route.ts`
- `app/api/projects/route.ts`
- `app/api/projects/[projectId]/route.ts`
- `app/api/projects/[projectId]/uploads/route.ts`
- `app/api/uploads/presign/route.ts`
- `app/api/uploads/complete/route.ts`
- `app/api/uploads/analyze/route.ts`
- `app/api/uploads/get/route.ts`
- `app/api/uploads/[uploadId]/route.ts`
- `app/api/uploads/[uploadId]/file/route.ts`
- `app/api/uploads/[uploadId]/sheets/route.ts`

Important current note:

`app/api/uploads/analyze/route.ts` is intentionally **thin**.  
Most intake logic lives in `lib/intake/`.

---

# Prisma / Database

- `prisma/schema.prisma` → database schema
- `prisma/migrations/` → migration history
- `prisma/seed.ts` → seeding / provisioning scripts

Important current entities:
- `Upload`
- `Sheet`

Current practical meaning:

`Sheet` functions as the page-level persistence layer for intake intelligence.

Important current limitation:

`Sheet` is still a legacy-shaped table that stores both drawing-style identity and broader page identity. It is good enough for current intake reporting, but likely needs future schema evolution.

---

# Utility Scripts

Observed utility scripts at repo root:

- `checkSheets.js`
- `checkUpload.js`
- `describeSheet.js`
- `enumLabels.js`

These are utility scripts, not part of the primary application runtime.

---

# `lib/` Overview

`lib/` contains shared utilities and active intake pipeline modules.

Examples outside intake:
- auth helpers
- Prisma client
- R2 storage helpers

The most important current architecture work lives in:

- `lib/intake/`

---

# `lib/intake/` (Current Active Intake Architecture)

This folder contains the active intake pipeline modules.

Current verified active files:

- `layout-evidence.ts`
- `ocr.ts`
- `page-images.ts`
- `pdf-analysis.ts`
- `pdf-text-extraction.ts`
- `pdf-types.ts`
- `prepare-pages.ts`
- `r2-read.ts`
- `report-mappers.ts`
- `router.ts`
- `router-stage.ts`
- `run-ai-intake.ts`
- `run-intake-analysis.ts`
- `spec-section-grouping.ts`
- `spec-signals.ts`
- `types.ts`

This folder is the active intake architecture as of 2026-03-14.

---

## Intake Module Responsibilities

### `pdf-types.ts`
Low-level PDF-related shared types.

Examples:
- `PdfTextItem`
- `PdfPageText`
- PDF analysis result types

---

### `pdf-analysis.ts`
Deterministic PDF-level facts.

Responsibilities:
- basic PDF structural checks
- print-size extraction
- page-size labeling helpers

---

### `pdf-text-extraction.ts`
Native PDF text extraction.

Responsibilities:
- per-page text extraction
- per-page item extraction
- fallback extraction behavior

---

### `layout-evidence.ts`
Builds layout-derived evidence from extracted text tokens.

Responsibilities:
- normalize extracted text for AI
- build region-based text slices
- support title-block-like evidence extraction

---

### `spec-signals.ts`
Spec-oriented deterministic signals.

Responsibilities:
- section number detection hints
- title hints
- spec/front-end/index/blank signals

---

### `router.ts`
Initial page-level routing inference helpers.

Responsibilities:
- likely route inference
- OCR recommendation heuristics used during page prep

---

### `prepare-pages.ts`
Builds `PreparedPage` objects.

Responsibilities:
- assemble page evidence bundle
- attach file facts
- attach raw text
- attach layout evidence
- attach spec signals
- attach initial routing hints
- attach extraction warnings

---

### `router-stage.ts`
Formal router stage.

Responsibilities:
- compute file-level default route
- apply page-level overrides
- produce final routing source metadata
- summarize routing outcomes

This is a true pipeline stage.

---

### `page-images.ts`
Independent page image generation stage.

Responsibilities:
- render PDF pages to PNG
- persist page images
- attach images to `PreparedPage`

Important architectural note:

Page image generation is independent from OCR ownership.

---

### `ocr.ts`
Route-aware OCR stage.

Responsibilities:
- OCR candidate selection
- PRIMARY vs ESCALATION OCR tiers
- OCR execution via Tesseract
- OCR text population into `PreparedPage`

Important architectural note:

OCR no longer owns image generation.

---

### `run-ai-intake.ts`
AI page understanding and normalization pipeline.

Responsibilities:
- chunking
- payload construction
- OpenAI requests
- retries/backoff
- output normalization
- review-flag generation
- non-drawing label cleanup
- blank-page forcing / cleanup
- broad page-class cleanup
- handoff to spec grouping

This file is now the main AI intake execution module.

Current major concerns here:
- chunking / token budgeting / throughput still need substantial improvement
- cleanup/reconciliation is better but still incomplete
- continuation and TOC-aware reconciliation are still missing

---

### `spec-section-grouping.ts`
Spec grouping helper.

Responsibilities:
- turn page-level spec results into grouped section ranges

---

### `report-mappers.ts`
Transforms intake results into report- and persistence-ready shapes.

Responsibilities:
- report preview shaping
- report summary shaping
- review-page shaping
- sheet row shaping
- legacy class mapping for UI/report output

---

### `r2-read.ts`
R2 file read helper.

Responsibilities:
- read files from R2
- retry read attempts when appropriate

---

### `run-intake-analysis.ts`
Main intake orchestrator.

Responsibilities:
- call all major intake stages in order
- manage intake pipeline flow
- assemble report
- persist upload results
- rewrite `Sheet` rows

This file is the main intake orchestration layer.

---

### `types.ts`
Shared intake domain types.

Responsibilities:
- PreparedPage types
- routing types
- normalized AI result types
- intake result types

---

# Current Intake Pipeline in Code

The live intake flow is now roughly:

`app/api/uploads/analyze/route.ts`  
→ `run-intake-analysis.ts`  
→ `r2-read.ts`  
→ `pdf-analysis.ts`  
→ `pdf-text-extraction.ts`  
→ `prepare-pages.ts`  
→ `router-stage.ts`  
→ `page-images.ts`  
→ `ocr.ts`  
→ `run-ai-intake.ts`  
→ `spec-section-grouping.ts`  
→ `report-mappers.ts`  
→ persistence into `Upload` + `Sheet`

This is the active architecture as of 2026-03-14.

---

# Important Current Architecture Notes

## Analyze Route
`app/api/uploads/analyze/route.ts` is intentionally thin.

It mainly handles:
- auth
- request parsing
- upload validation
- orchestrator call
- error handling

## Intake Is Modular
The previous architecture had too much logic concentrated in one route file.

That is no longer true.

## Future-Agent Alignment
The intake folder is now structured so future agents can reuse:
- file facts
- extracted text
- OCR text
- page images
- route decisions
- page intelligence results
- later relationship intelligence

That is one of the main reasons the refactor mattered.

---

# Current Main Risk Areas

The repo structure is much cleaner now, but the biggest current problem areas are:

1. **performance / throughput**, especially for very large spec books
2. **page reconciliation quality** for project manuals and spec books

Known examples:
- 1232-page specification manual completed successfully but took ~51 minutes
- 432-page project manual completed successfully in ~15 minutes with useful output, but still needs stronger cleanup/reconciliation

This means the next important engineering work is concentrated mainly in:
- `run-ai-intake.ts`
- cleanup / reconciliation quality
- route-aware chunk sizing
- token budgeting
- payload slimming
- throughput discipline

---

# Practical Rule for Future Sessions

If a future session needs to understand the current intake system quickly, start with these files in this order:

1. `docs/BUILD_STATE_SNAPSHOT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/TASK_QUEUE.md`
4. `docs/KNOWN_ISSUES.md`
5. `lib/intake/run-intake-analysis.ts`
6. `lib/intake/run-ai-intake.ts`
7. `lib/intake/report-mappers.ts`
8. `lib/intake/router-stage.ts`
9. `lib/intake/page-images.ts`
10. `lib/intake/ocr.ts`

That is the fastest path to current project reality.