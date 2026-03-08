# MittenIQ Architecture (Verified Source of Truth)

Last updated: 2026-03-05

This document contains **verified facts only**.  
If something is planned but not implemented/verified, it must be explicitly labeled **Planned** and dated.

---

## What MittenIQ is (Verified)

MittenIQ is a web application being built to support construction estimating workflows centered around Projects and document Uploads, with an Intake analysis step that produces Sheets and intake metadata.

The current workflow direction emphasizes:
- project-scoped agents
- upload → intake/setup processing
- purchased-function report access from a project report hub

---

## Technology Stack (Verified)

### Runtime / Framework
- Node.js (local dev via npm scripts)
- Next.js 16.1.6 (Turbopack) with App Router
- React 19.2.3
- TypeScript 5.x

### Styling
- Tailwind CSS 3.4.17
- PostCSS 8.5.6
- Autoprefixer 10.4.24

### Linting
- ESLint 9.x
- eslint-config-next 16.1.6

### Database / ORM
- Postgres (Prisma datasource provider: postgresql)
- Prisma 7.4.2
- @prisma/client 7.4.2
- @prisma/adapter-pg 7.4.2
- pg 8.19.0

### Storage / Upload tooling
- AWS SDK S3 client + presigner packages are present:
  - @aws-sdk/client-s3 ^3.1000.0
  - @aws-sdk/s3-request-presigner ^3.1000.0

### Email
- resend ^6.9.2

---

## Repo Structure (Verified)

Top-level folders:
- app/ (Next.js App Router)
- lib/ (shared utilities)
- prisma/ (schema + migrations)
- public/ (static assets)
- docs/ (project documentation)

Documentation files are maintained under:
- docs/ARCHITECTURE.md
- docs/BUILD_STATE_SNAPSHOT.md
- docs/CONVENTIONS.md
- docs/DECISIONS.md
- docs/REPO_MAP.md
- docs/CHANGELOG.md
- docs/TASK_QUEUE.md
- docs/KNOWN_ISSUES.md
- docs/ROADMAP.md
- docs/RESUME_PROMPT.md

---

## Domain Model (Verified from prisma/schema.prisma)

### Enums
- UploadKind: DRAWING | SPEC
- UploadStatus: PENDING | UPLOADED | FAILED
- IntakeStatus: PENDING | READY | FAILED
- SheetType: PLAN | DETAIL | NO_SCALE_NEEDED | UNKNOWN
- ScaleStatus: UNVERIFIED | VERIFIED | NO_SCALE_NEEDED

### User
- User has many Projects

### Project
- Project has required ownerId (User)
- Project has many Uploads

### Upload
Upload belongs to a Project and includes:
- kind (DRAWING or SPEC)
- filename
- r2Key
- sizeBytes
- mimeType
- status (PENDING/UPLOADED/FAILED)

Intake v1 fields on Upload:
- pageCount (optional)
- isSearchable (optional)
- isRasterOnly (optional)
- intakeReport (Json, optional)
- intakeStatus (PENDING/READY/FAILED)
- intakeError (optional)

Upload has many Sheets.

### Sheet
Sheet belongs to an Upload and includes:
- id (Text)
- uploadId
- pageNumber
- sheetType
- scaleStatus
- scaleConfidence (Int)
- notes (optional)
- createdAt / updatedAt (timestamptz)

Constraints:
- unique(uploadId, pageNumber)
- index(uploadId)

---

## API Surface (Verified from repo and local dev logs)

Observed API routes include:
- /api/projects (GET)
- /api/projects/[projectId] (GET)
- /api/projects/[projectId]/uploads (GET)
- /api/uploads/presign (POST)
- /api/uploads/complete (POST)
- /api/uploads/analyze (POST)
- /api/uploads/get (GET)
- /api/uploads/[uploadId] (route exists)
- /api/uploads/[uploadId]/sheets (route exists)
- /api/login (route exists)
- /api/logout (route exists)
- /api/debug/project (route exists)

Verified working sequence locally:
1) POST /api/uploads/presign
2) POST /api/uploads/complete
3) POST /api/uploads/analyze
4) GET /api/projects/{projectId}/uploads

Verified file/report reads locally:
- GET /api/uploads/[uploadId]
- GET /api/uploads/[uploadId]/sheets
- GET /api/uploads/[uploadId]/file

---

## Local Development (Verified)

Scripts (package.json):
- npm run dev -> next dev
- npm run build -> next build
- npm run start -> next start
- npm run lint -> eslint

Local URLs:
- http://localhost:3000
- http://localhost:3000/projects

---

## Project Workspace Architecture (Verified)

Route:

/projects/[projectId]

Current layout:
- top agent strip
- primary Purchased Functions panel
- secondary upload panel

### Agent Strip
Top-of-page row containing:
- Estimating Assistant
- Junior Estimator
- Senior Estimator
- Chief Estimator

### Purchased Functions Panel
Acts as the project report hub.

Current behavior:
- displays purchased functions for the current project
- includes refresh action
- exposes report access from purchased tasks
- currently uses localStorage-backed purchase state

### Upload Panel
Secondary panel used for:
- drag/drop upload
- upload processing trigger flow
- compact status-only upload list

Current behavior:
- upload rows intentionally do not expose intake/report links on the project page
- report access is meant to happen through Purchased Functions

### Project Efficiency Display
A compact inline strip appears near the project title showing placeholder savings values:
- Time saved
- Manual cost
- MittenIQ cost
- Savings

This is currently UI-only placeholder telemetry.

---

## Purchased Function Architecture (Verified)

Current persistence method:
- browser localStorage only

Current key format:
- `miq:purchasedFunctions:{projectId}`

Current limitations:
- local browser only
- no billing
- no shared persistence
- no server-side ownership record yet

This is a temporary implementation for UI/workflow development.

---

## Estimating Assistant Architecture (Verified)

Route:

/projects/[projectId]/agents/estimating-assistant

Current page sections:
- AI interface area (stub)
- function selection area
- pricing methodology area (reserved)

Current visible functions:
- Intake + Sheet Setup
- Drawing Organization
- Specification Intelligence

Current purchasable function:
- Intake + Sheet Setup

### Combined Intake + Sheet Setup
This combined function represents:
- file intake analysis
- initial sheet generation / setup
- initial classification output shown on Intake page

Back-compat behavior:
- older local purchase id `file-intake-analysis` is treated as equivalent to `intake-sheet-setup`

Current purchase UX:
- already purchased functions display a Purchased tag
- already purchased functions cannot be selected again

---

## Intake / Sheet Setup Architecture (Verified)

Route:

/intake?uploadId={uploadId}

The Intake page is now a combined output page for:
- file intake checks
- print-size reporting
- initial sheet setup output

Current page sections:
- upload summary
- intake confidence banner
- file stats
- required print size
- flags
- sheet setup summary
- collapsible sheet preview
- plain-English “Why not 100%?” explanation for sheets below full confidence
- raw JSON debug

### Print Size Reporting
The analyzer now stores print-size-related data inside `intakeReport`, including:
- primary detected print size
- counts by detected size
- note about mixed sizes if applicable

The Intake page:
- shows a single print-size summary when only one size is detected
- shows a mixed-size warning when multiple sizes are detected

### Sheet Preview
The sheet preview is collapsible by default and scrollable when expanded.

### Sheet Confidence Explanation
Sheets with confidence below 100 expose a plain-English explanation via “Why not 100%?”

Important limitation:
- current confidence logic is still v0/simple and should not be treated as final intelligence

---

## Analyzer Architecture (Verified)

File:

app/api/uploads/analyze/route.ts

Current analyzer responsibilities:
- read uploaded PDF from R2
- perform lightweight structural checks
- compute page count heuristically
- compute searchability/raster heuristics
- extract print-size data heuristically from CropBox or MediaBox
- store intake report JSON on Upload
- regenerate Sheet rows

Current analyzer output includes:
- file readiness signals
- notes
- print-size summary data
- page-count data

## Three-Layer Document Intelligence Architecture

MittenIQ intake now uses a multi-stage reasoning system.

### Layer 1 — Page Evidence Extraction

Purpose:

Generate structured candidate signals from each page.

Outputs:

- sheet number candidates
- sheet title candidates
- page class candidates
- discipline candidates
- sheet subtype candidates
- title block zone candidates

Evidence sources:

- regex extraction
- text pattern analysis
- layout region scanning
- deterministic baseline detection

### Layer 2 — Document Structure Inference

Purpose:

Infer document-wide structure.

Functions:

- numbering schema detection
- cross-page sequence validation
- index page detection
- duplicate sheet detection
- sheet conflict grouping

Supports multiple numbering families.

Example:

E-  
I-  
T-  
C-

### Layer 3 — Ambiguity Resolution

Purpose:

Resolve weak or conflicting detections.

Sources:

- neighboring sheet patterns
- document index references
- optional LLM refinement

Safety rules:

LLM cannot override deterministic fields such as:

- page count
- print size
- scale status
- scale confidence

### Specification Document Intelligence (Design Rules)

Date: 2026-03-07
Status: ACTIVE DESIGN CONSTRAINT

Purpose:
Specification books vary widely across engineering firms and must be parsed reliably despite inconsistent formatting. The system must infer structure and extract estimator-critical intelligence from highly variable documents.

Core Principle

Specification books are structured documents intended for human interpretation.
MittenIQ must emulate how experienced estimators read spec books rather than treating them as unstructured text.

Parsing must follow document structure first, text second.

Common Spec Book Structures

Two major structural styles have been observed.

Model A — Header Grouped Front End

Typical characteristics:

• Title page
• Notice to bidders
• Instructions to bidders
• Bid proposal / bid form
• General conditions
• Wage decisions
• Affidavits / insurance forms
• Federal or state requirement sections

Large section headers define scope.

Rule:

Everything following a major header belongs to that section until the next header appears.

Example:

GENERAL CONDITIONS
→ all pages belong to this section
until the next large header appears
Model B — Section-Numbered Project Manual

Typical characteristics:

Pages contain identifiers such as:

00 21 13 – 1
00 21 13 – 2
00 21 13 – 3

Meaning:

section number – page within section

Sections are usually listed in a table of contents.

Example sections:

00 11 13 Advertisement for Bids
00 21 13 Instructions to Bidders
00 41 13 Bid Form
00 43 13 Bid Security
00 52 00 Agreement
00 61 14 Performance Bond
00 61 15 Payment Bond

For these books:

The table of contents becomes the primary structural map.

Blank Page Detection

Pages containing phrases such as:

THIS PAGE INTENTIONALLY LEFT BLANK

should be classified as:

BLANK_PAGE

These pages should not influence document intelligence.

Page Numbering vs PDF Sheet Numbers

Specification books often contain two numbering systems:

Document page numbers (printed in the spec book)

PDF sheet numbers (viewer index)

Example:

Document page: 11
PDF sheet: 12

MittenIQ must preserve both when referencing pages in reports to avoid user confusion.

Preferred reporting format:

Section 00 21 13 – Instructions to Bidders
Pages 1–8 (PDF sheets 14–21)
Critical Bid Intelligence

Regardless of format, the system must attempt to extract the following estimator-critical information.

High priority signals:

• Bid date
• Bid time
• Bid location
• Pre-bid meeting information
• Addenda contact information
• Bid bond requirements
• Performance/payment bond requirements
• Alternates listed in bid forms
• Prevailing wage requirements
• Domestic material restrictions (AIS / Buy America)
• Insurance requirements

These signals often appear in:

• Notice to bidders
• Instructions to bidders
• Bid form
• Division 0 sections

Progressive Parsing Strategy

Spec parsing must degrade gracefully.

Reliability levels:

Level 1 — Structured Spec Manual

Detected signals:

• Table of contents
• Section numbers
• Page-in-section numbering

Result:

High-confidence section grouping.

Level 2 — Header Based Spec Book

Detected signals:

• Large section headers
• textual patterns

Result:

Header-based section grouping.

Level 3 — Weak Structure

Detected signals:

• keyword patterns only

Result:

Keyword-driven intelligence extraction.

Spec Intelligence Pipeline

Specification parsing operates after document intake.

Pipeline:

PDF
→ Text Extraction
→ Page Evidence (Layer 1)
→ Structure Inference (Layer 2)
→ Specification Intelligence Layer
→ Estimator Intelligence Report
Engineering Constraint

Spec parsing must function even when documents are poorly formatted.

The system should assume:

• inconsistent formatting
• missing page numbers
• rotated pages
• template noise (EJCDC headers etc.)
• OCR-generated PDFs

The architecture must rely on multiple inference signals rather than strict layout assumptions.

Design Goal

MittenIQ should extract meaningful bid intelligence even from extremely inconsistent specification documents.

The system must prefer human-like reasoning over rigid parsing rules.

---

## Planned (Not Yet Verified)

Nothing in this section should be treated as implemented unless later verified and moved out of Planned.