# Changelog

Tracks verified changes to the MittenIQ system.

---

## 2026-03-02

### Infrastructure / Organization
- Created persistent project documentation system under `/docs`
- Added architecture, conventions, decisions, and state tracking files
- Established daily start/end workflow for development sessions

### Verified Working Systems
- Next.js dev server running locally via `npm run dev`
- Projects page loads successfully
- Projects API responding (GET /api/projects -> 200)
- Project detail pages loading correctly

### Upload Pipeline (Verified End-to-End)
- Upload presign endpoint working
  - POST /api/uploads/presign -> 200
- Upload completion endpoint working
  - POST /api/uploads/complete -> 200
- Intake analysis automatically triggered
  - POST /api/uploads/analyze -> 200
- Upload list refresh confirmed
  - GET /api/projects/{projectId}/uploads -> 200

### Repository Structure
- Confirmed Next.js App Router structure
- Confirmed Prisma schema present
- Confirmed API route structure under `app/api`
- Confirmed Tailwind configuration

### Development Process
- Adopted incremental build strategy
- Documentation designated as system memory

---

## 2026-03-04

### Deployment
- Connected GitHub repository to Vercel for live hosting
- Production domain:
  - https://mitteniq.com
- Deployment model established:
  - `main` → Production
  - feature branches → Preview
- Vercel successfully builds and deploys the application

### Next.js Build Fix
- Production build initially failed during prerendering of the intake page
- Cause:
  - `useSearchParams()` used in a client component without a Suspense boundary
- Fix implemented:
  - wrapped intake component usage of `useSearchParams()` in a React Suspense boundary
- Build now completes successfully

### Prisma Configuration
- Project uses Prisma v7 configuration via `prisma.config.ts`
- Datasource configured using environment variable:
  - `DIRECT_DATABASE_URL`

---

## 2026-03-05

### Project Workspace UI
- Reworked project workspace layout
- Moved agent tiles into a top strip across the page
- Made Purchased Functions the primary focus panel
- Reduced Upload panel to a secondary role while keeping large drop zone
- Reduced upload list to minimal status-only display
- Removed intake/report access from upload rows on the project workspace
- Added compact project efficiency strip near the project name with placeholder values

### Purchased Functions Flow
- Added temporary purchased-functions persistence using browser localStorage
- Added Purchased Functions refresh action
- Centered report access in the Purchased Functions panel
- Added backward-compatible purchase handling for function id changes

### Estimating Assistant UI
- Built functional Estimating Assistant page structure
- Added AI interface placeholder at top
- Added function-selection area
- Added pricing methodology placeholder section at bottom
- Added Purchased tag to already-purchased functions
- Prevented repurchasing already-purchased functions

### Function Model Simplification
- Removed Low-Confidence Detection as a separate paid tile
- Removed Sheet Review Queue as a separate paid tile
- Removed Project Document Search as a separate paid tile
- Consolidated File Intake Analysis + Sheet Extraction & Classification into:
  - Intake + Sheet Setup

### Intake Page
- Added Back to Project Workspace button
- Added print-size summary panel
- Added mixed-size PDF warning behavior
- Added combined Intake + Sheet Setup framing
- Added sheet setup summary section
- Added collapsible sheet preview section
- Added plain-English “Why not 100%?” explanations for sheets below full confidence

### Analyzer
- Extended analyzer to store print-size-related data in `intakeReport`
- Added primary size detection
- Added counts by detected page size
- Added mixed-size note when applicable

### Current Limitation
- Sheet confidence logic and explanations are still based on v0/simple rules and require future refinement

## 2026-03-07 — Intake Intelligence Expansion

Major upgrades to the intake analysis system were implemented.

### Added

Three-layer document intelligence architecture:

Layer 1 — Page Evidence Extraction  
Layer 2 — Document Structure Inference  
Layer 3 — Ambiguity Resolution

New directory:

lib/intake/

Key modules added:

- layer1-page-evidence.ts
- layer2-structure-inference.ts
- types.ts

### Improvements

Drawing detection improvements:

- sheet number candidate extraction
- sheet title candidate extraction
- discipline inference
- sheet subtype inference
- multi-family sheet numbering support
- bottom-center caption detection region
- expanded region scanning (bottomRight, bottomBand, bottomCenter, tailText, topBand)

### Intake Report Enhancements

New backend metadata now generated:

- page-level confidence scoring
- review flags
- provenance tracking
- numbering schema detection
- likely index page detection
- duplicate sheet candidate detection
- conflict set detection
- low-confidence page summary

UI additions:

- confidence column in sheet list
- review flag column
- detection confidence tile
- document structure summary

### Extraction Pipeline Update

PDF extraction upgraded to attempt positional text extraction:

- text item normalization
- coordinate capture when available
- fallback text-only extraction

### Validation

System tested against two real projects:

Project A — Owosso drawings  
Project B — alternate drawing set

Results:

- moderate improvement on messy drawings
- minimal improvement on caption-style sheets
- specification PDFs remain weak

### Conclusion

Layer 1 intelligence successfully integrated, but positional text extraction from pdf-parse is limited.

Future improvements will prioritize:

- specification document intelligence
- cross-sheet inference
- index reconciliation
- selective LLM cleanup

### 2026-03-07

Added specification document intelligence architecture rules.
Defined multi-model spec parsing strategy and estimator intelligence extraction goals.

## 2026-03-08 — LLM Intake Activation

### LLM Integration Debugged and Enabled

Resolved persistent OpenAI API failures during intake refinement.

Symptoms previously observed:

- API returned HTTP 429 quota errors
- LLM refinement never executed
- intake report showed `"used": false`

Root cause:

OpenAI SDK call used the **Responses API** (`client.responses.create`) with a model incompatible with that endpoint.

Fix implemented:

Switched to Chat Completions API:

client.chat.completions.create

Impact:

- LLM requests now reach OpenAI successfully
- intake refinement executes correctly
- ambiguous page classifications can now be improved

---

### Token Limit Safeguards Added

Large document payloads exceeded the 128k token context window.

Mitigation implemented:

- Candidate pages reduced from 24 → 12
- Evidence text regions shortened significantly

Impact:

- prevents request failure on large PDFs
- keeps LLM usage predictable and stable

---

### LLM Refinement Successfully Verified

First successful run produced:

- `"used": true`
- `"refinedPages": 1`
- `"candidatePages": 12`

System now performs hybrid deterministic + LLM document interpretation as intended.