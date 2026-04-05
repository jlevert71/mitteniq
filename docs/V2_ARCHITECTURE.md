# MittenIQ V2 Architecture
Last Updated: 2026-04-01 (session 4 — page dimensions, intake report UI, inline PDF viewer, collapsible divisions, page jump fix)

## The Philosophy (Why V2 Exists)
V1 tried to be too smart. It built registries, reconciliation layers,
multi-layer AI passes, and confidence scoring systems. It took an hour
to process a file and still got things wrong. V2 starts over with a
simpler approach: do less, do it fast, be honest about what you don't know.

## The Three Layers

### Layer 1 — Upload
- User uploads PDF to Cloudflare R2
- Completes in ~1 second regardless of file size
- No processing at upload time
- V1 intake is disabled (MITTENIQ_V1_INTAKE_ENABLED=false)

### Layer 2 — Intake (V2)
Located in: lib/intake_v2/
- PDF health check: is it readable, searchable, or scanned?
- Page count and print sizes
- Rough page classification (drawing vs spec vs front-end)
- Simple line scorer for sheet numbers and titles
- TOC parser — section index with PDF page resolution
- Page dimension extraction — size and type classification per page
- No AI, no registry, no reconciliation
- Target: under 5 seconds

#### Critical Fix — lib/intake/pdf-text-extraction.ts
`cleanText()` was collapsing ALL whitespace including newlines into a single space,
destroying line structure before the TOC parser could see it.
Fixed: `.replace(/[^\S\n]+/g, " ")` — collapses spaces/tabs only, preserves newlines.
This fix is in lib/intake/pdf-text-extraction.ts (shared by V1 and V2).

#### Page Dimension Extraction — BUILT, WORKING
pdfjs-dist extracts viewport dimensions for each page alongside text extraction.
Each page: view array [x, y, w, h] in points ÷ 72 = inches, rounded to 1 decimal.
Stored as pageDimensions: { widthIn, heightIn } | null on IntakeV2PageTextInput.
pageSizes summary on IntakeV2RunResult: grouped by unique size, labeled, sorted by count desc.
Label rule: 8.5×11 or 11×8.5 → "Specifications", all other sizes → "Drawings".
Dimension extraction failure on any page stores null — never throws.

#### TOC Parser — BUILT, TESTED, WORKING
Located in: lib/intake_v2/parse-toc.ts
Called from: lib/intake_v2/run-intake-v2.ts
Types in: lib/intake_v2/types.ts (TocEntry, TocParseResult)

Purpose: Parse the table of contents from spec books to build a structured section
index with correct PDF page jump targets. Foundation for the Division 26 agent.

Supports all real-world TOC formats found in Michigan construction docs:
- Format A: section number + spaces/dash + title, no page refs
  (Fishbeck 8-digit CSI, C2AE/Tawas decimal subdivisions, ITB mixed)
- Format B: title + dot leaders + page ref (Wade Trim/Lake Mitchell)
- Multi-page TOC: follows TOC across consecutive pages once header detected
- No TOC: MDOT proposals correctly return zero entries

Section number formats supported:
- CSI 8-digit: `26 05 00`
- 2+4 digit: `26 0500`
- 2+4+decimal: `26 0533.13`, `26 2913.03`
- Legacy 5-digit: `16060`, `02240`
- GFA alphanumeric: `C-111`, `C-200`, `C-941-2`

Validation: only real section number patterns accepted — contract article/clause
numbers (e.g. "3.05", "Article 5") are filtered out.

PDF page resolution: scans body text for "SECTION XX XX XX" headers near top of
each page. Stores null for any unresolved page — never guesses.

Known gaps:
- Resolution only works when body headers use "SECTION" keyword.
  C2AE/Tawas format uses bare section numbers — zero pages resolved for these docs.
  Acceptable (null is honest). Improvement on roadmap: scan for bare section number
  patterns near top of page as fallback.
- Pre-printed EJCDC forms (e.g. C-700 General Conditions) also return null — body
  text doesn't start with a standard section header. Correct behavior.

Performance (tested):
- Fishbeck 946 pages: 154 entries, 153 resolved, 18ms
- Tawas/C2AE: 171 entries, 3 resolved, 16ms
- MDOT proposals: 0 entries (correct)

Output shape (TocEntry):
- sectionNumber: string (e.g. "26 05 00")
- sectionTitle: string (e.g. "Common Work Results for Electrical")
- documentPageRef: string | null — as printed in TOC, null if Format A
- pdfPageNumber: number | null — resolved PDF page, null if not found
- csiDivision: number | null — e.g. 26
- source: "front-end" | "technical"

#### Intake Report UI — BUILT, WORKING
Rendered in: app/projects/[projectId]/intake/IntakeClient.tsx
Data source: GET /api/intake-v2/test?uploadId=

Three sub-sections:
1. File Health — ok/error status
2. Page Summary — total pages + size table (Size | Type | Pages)
3. Specification Section Index — collapsible by CSI division, starts fully collapsed,
   Expand All / Collapse All button, section links open inline PDF viewer

#### Inline PDF Viewer — BUILT, WORKING
Rendered in: app/projects/[projectId]/intake/IntakeClient.tsx
Sits between Intake Report card and PreBidChecklist, renders on demand.

- pdfjs-dist only — no new packages
- Worker: public/pdf.worker.min.js
  (copied from node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs)
- Dynamic import: import("pdfjs-dist/legacy/build/pdf.mjs") — .mjs for TS resolution
- RenderParameters: { canvasContext, canvas, viewport } — canvas required in pdfjs 5.4
- Page jump flow:
  1. User clicks section link (blue button)
  2. Fetch /api/uploads/[id]/file?page=N → returns { ok, url, page }
  3. setPdfViewer({ url, page, totalPages: 0 })
  4. useEffect fires → dynamic import pdfjs → getDocument(url) → getPage(n) → render canvas
- Prev/Next navigation, page counter, Close button
- /api/uploads/[uploadId]/file behavior:
  - ?page= present → JSON { ok, url, page } (page jump)
  - no ?page= → redirect to signed R2 URL (existing behavior, unaffected)
- app/intake/page.tsx updated to use fetch → window.open flow to avoid JSON-in-tab

### Layer 3 — Agents
Located in: lib/agents/
Each agent is a focused tool that does one job well.
Agents are stateless — one document in, one result out.
AI handles exceptions, not the primary path.
Human review is a feature, not a failure.

#### Pre-Bid Checklist Agent (BUILT, TESTED, PRODUCTION-READY)
Located in: lib/agents/pre-bid-checklist/

Purpose: Extract all critical bid requirements from a spec book's
front-end documents automatically. Replaces manual review of bidding
documents that typically takes 30-60 minutes per spec book.

Architecture:
- Progressive scan engine starting at pages 1–60, doubling each pass
- Beyond page 60: keyword scan only — matched pages appended to base
  60-page text. Never sends bulk pages past page 60.
- Dynamic per-page character limit based on document size:
  ≤100 pages: 10,000 chars | ≤300 pages: 8,000 chars |
  ≤600 pages: 8,000 chars | 600+: 5,000 chars
- Total payload cap: 350,000 chars (well under gpt-4o-mini 512k limit)
- Up to 5 passes maximum — exhausts full document if needed
- Merge logic: only overwrites null fields — never replaces found values
- Deterministic post-processing rules (run after every pass merge):
  1. preBidMandatory defaults to false if preBidHeld=true and no
     mandatory language found in first 60 pages (text search, no AI)
  2. buyAmerican=true if full document contains MDOT 2020 governing
     phrase — matches full phrases only, never incidental references
     or the word "American" in organization names (NSPE, ACEC, ASCE)
  3. breakDownsRequired=true if bid form contains named division
     subtotal patterns (e.g. "total division i", "total division ii")
  4. proposedStartDate defaults to "Upon Award" if not found anywhere
- Auto-save after every successful scan (upsert)
- Load saved checklist on page open — no re-run needed on return visit
- proposedCompletionDate captures both Substantial Completion and Final
  Completion dates on separate lines when both are found

Fields extracted (Section 1 — Project & Bid Identity):
projectName, bidDueDate, bidDueTime, bidOpeningType, biddingTo,
deliverBidTo, deliveryMethod, numberOfCopies, documentsAvailableAt, lastRfiDate

Deep scan keyword list covers:
- Compliance/labor: AIS, Davis-Bacon, SRF, CWSRF, DWSRF, federal funding,
  Buy America, BABAA, good faith effort, prevailing wage
- Bonds: bid bond, performance bond, labor and material, surety bond
- Schedule: substantial completion, contract times, notice to proceed,
  calendar days, working days
- Pre-bid: mandatory prebid, pre-bid conference, prebid conference
- Pricing: allowance, alternate, unit price, additive/deductive alternate
- Insurance: pollution liability, supplementary conditions, railroad
  protective, OCIP, wrap-up, professional liability, additional insured
- DBE: good faith effort, GFE worksheet, debarment certification

Domain rules baked in (not AI-dependent):
- Federal funding always triggers buyAmerican=true and certifiedPayroll=true
- MDOT 2020 Standard Specifications governing reference triggers buyAmerican=true
- "Encouraged to attend" always means preBidMandatory=false
- preBidMandatoryScope defaults to "primes_only" when not stated
- "Bid guaranty" = bid bond (MDOT terminology)
- "Bids received at [address]" = in-person delivery
- DBE only true when participation goals or GFE docs explicitly required
- Special insurance only true for non-standard coverages
- numberOfCopies defaults to 1 if not stated
- Obligee smart default: shows likely owner name when not explicitly stated
- breakDownsRequired=yes/no only — bid form structure interpretation
  is the estimator's job, not MittenIQ's at this stage

Target performance:
- Clean front-loaded spec (≤300 pages): under 30 seconds, 1-2 passes
- Large municipal spec (300-600 pages): under 60 seconds, 2-3 passes
- Very large spec (600-1000 pages): under 90 seconds, 3-5 passes

Tested against 9 real Michigan spec books across MDOT, Fishbeck,
Wade Trim, Tetra Tech, GFA, local municipality, and EJCDC formats.

Known AI accuracy issue:
- buyAmerican false positive on EJCDC format documents — the NSPE/ACEC/ASCE
  copyright notice appears on every page and contains the word "American".
  Deterministic rule is tightened to full governing phrases only.
  AI prompt still needs explicit exclusion of org name false positives.
  Fix is next session priority #1.

#### Division 26 Scope Review Agent (PLANNED — NEXT MAJOR FEATURE)
Located in: lib/agents/division-26-scope-review/ (not yet created)

Purpose: Read Division 26 electrical spec sections and extract
everything that affects an electrical subcontractor's bid price.
Uses TOC parser output to navigate directly to Division 26 sections.

Planned features:
- Warranty extraction by spec section — flag anything over 1 year
- Scope items and inclusions
- Exclusions and furnished-by-owner equipment
- Special testing and commissioning requirements
- RFQ language generation for vendors and suppliers
- Dollar impact warnings on extended warranties and special requirements

This agent speaks directly to the electrical estimator's scope —
not the general contractor's. That's what makes it unique.

#### MDOT Electrical Agent (PLANNED — ROADMAP)
Located in: lib/agents/mdot-electrical/ (not yet created)

Purpose: Handle MDOT standard spec projects where the spec book contains
no Division 26 sections — everything is governed by reference to the
MDOT 2020 Standard Specifications for Construction.

Trigger: zero Division 26 TOC entries + MDOT 2020 governing phrase detected.

Planned approach:
- Parse Schedule of Items from proposal for electrical pay items (8100-8199 range)
- Cross-reference each pay item to its governing spec section in MDOT 2020 Standard Specs
- Fetch relevant requirements from MDOT website or R2 cache
- Present combined result: pay items + governing spec requirements + special provisions

This is post-Division 26 agent in priority.

## Key Architectural Rules
1. Agents are stateless — one document in, one result out
2. No document-wide intelligence in intake — that belongs in agents
3. Speed over completeness — null is better than a wrong answer
4. AI handles exceptions, not the primary path
5. Human review is a feature, not a failure
6. Fail loud (explicit nulls) not smart (bad guesses)
7. Keyword scan controls deep page access — never bulk-send full documents
8. Deterministic rules take precedence over AI interpretation where possible
9. Deterministic rules must match on specific governing phrases — never on
   common words that appear incidentally throughout construction documents

## File Naming Convention
- lib/intake_v2/ — intake pipeline files
- lib/agents/[agent-name]/ — one folder per agent
  - types.ts — TypeScript types for that agent
  - extract-[thing].ts — extraction logic
  - run-[agent-name].ts — orchestrator
  - save-[thing].ts — DB persistence logic
- app/api/agents/[agent-name]/route.ts — API endpoint (GET + POST)
- components/agents/[ComponentName].tsx — UI component

## What's Deferred
- Real-time streaming progress via SSE — progress shows post-scan for now
- Background job architecture — scan abandoned if use# MittenIQ V2 Architecture
Last Updated: 2026-04-01 (session 5 — production deployment, R2 CORS, DB pooler fix, division names, intake caching)

## The Philosophy (Why V2 Exists)
V1 tried to be too smart. It built registries, reconciliation layers,
multi-layer AI passes, and confidence scoring systems. It took an hour
to process a file and still got things wrong. V2 starts over with a
simpler approach: do less, do it fast, be honest about what you don't know.

## The Three Layers

### Layer 1 — Upload
- User uploads PDF to Cloudflare R2
- Completes in ~1 second regardless of file size
- No processing at upload time
- V1 intake is disabled (MITTENIQ_V1_INTAKE_ENABLED=false)

### Layer 2 — Intake (V2)
Located in: lib/intake_v2/
- PDF health check: is it readable, searchable, or scanned?
- Page count and print sizes
- Rough page classification (drawing vs spec vs front-end)
- Simple line scorer for sheet numbers and titles
- TOC parser — section index with PDF page resolution
- Page dimension extraction — size and type classification per page
- No AI, no registry, no reconciliation
- Target: under 5 seconds

#### Critical Fix — lib/intake/pdf-text-extraction.ts
`cleanText()` was collapsing ALL whitespace including newlines into a single space.
Fixed: `.replace(/[^\S\n]+/g, " ")` — collapses spaces/tabs only, preserves newlines.

#### Page Dimension Extraction — BUILT, WORKING
pdfjs-dist extracts viewport dimensions for each page alongside text extraction.
Each page: view array [x, y, w, h] in points ÷ 72 = inches, rounded to 1 decimal.
Stored as pageDimensions: { widthIn, heightIn } | null on IntakeV2PageTextInput.
pageSizes summary on IntakeV2RunResult: grouped by unique size, labeled, sorted by count desc.
Label rule: 8.5×11 or 11×8.5 → "Specifications", all other sizes → "Drawings".

#### TOC Parser — BUILT, TESTED, WORKING
Located in: lib/intake_v2/parse-toc.ts
Called from: lib/intake_v2/run-intake-v2.ts
Types in: lib/intake_v2/types.ts (TocEntry, TocParseResult)

Supports all real-world TOC formats found in Michigan construction docs:
- Format A: section number + spaces/dash + title, no page refs (Fishbeck, C2AE/Tawas, ITB)
- Format B: title + dot leaders + page ref (Wade Trim/Lake Mitchell)
- Multi-page TOC: follows TOC across consecutive pages once header detected
- No TOC: MDOT proposals correctly return zero entries

Section number formats: CSI 8-digit, 2+4, decimal subdivisions, legacy 5-digit, GFA alphanumeric.

PDF page resolution: scans body text for "SECTION XX XX XX" headers near top of each page.
Stores null for any unresolved page — never guesses.

Known gaps:
- Resolution only works when body headers use "SECTION" keyword.
- Pre-printed EJCDC forms also return null — correct behavior.

Performance: Fishbeck 946pp → 154 entries, 153 resolved, 18ms.

#### Intake Report UI — BUILT, WORKING
Rendered in: app/projects/[projectId]/intake/IntakeClient.tsx
Data source: GET /api/intake-v2/test?uploadId= (first run) or Upload.intakeReport.v2 (cached)

Three sub-sections:
1. File Health — ok/error status
2. Page Summary — total pages + size table (Size | Type | Pages)
3. Specification Section Index — collapsible by CSI division, starts fully collapsed,
   Expand All / Collapse All button, section links open inline PDF viewer

CSI Division names map includes Divisions 0, 1-28, 31, 32, 33, 40, 43, 44, 46.

NOTE: As of end of session 5, IntakeClient.tsx on main is missing the caching logic,
buildIntakeV2ClientPayload helper, and the updated division names. These need to be
re-added via Cursor at the start of next session (Priority #1).

#### V2 Intake Result Caching — BUILT, WORKING (dev only pending next session)
Save route: POST /api/intake-v2/save (app/api/intake-v2/save/route.ts) — ON MAIN, WORKING
- Sanitizes result with sanitizeForPostgres() before writing
- Merges into existing Upload.intakeReport JSON under .v2 key
- Uses Prisma.InputJsonValue cast for type safety

Client-side cache check (NEEDS TO BE RE-ADDED TO IntakeClient.tsx):
- Check meta.intakeReport?.v2 before fetching /api/intake-v2/test
- Use buildIntakeV2ClientPayload() to normalize both cached and fresh data
- POST to /api/intake-v2/save after fresh fetch (best-effort, errors ignored)

#### Inline PDF Viewer — BUILT, WORKING
Rendered in: app/projects/[projectId]/intake/IntakeClient.tsx

- pdfjs-dist only — no new packages
- Worker: public/pdf.worker.min.js (copied from node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs)
- Dynamic import: import("pdfjs-dist/legacy/build/pdf.mjs") — .mjs for TS resolution
- RenderParameters: { canvasContext, canvas, viewport } — canvas required in pdfjs 5.4
- Page jump flow: click section → fetch /api/uploads/[id]/file?page=N → JSON → render canvas
- Prev/Next navigation, page counter, Close button
- /api/uploads/[uploadId]/file: ?page= → JSON, no ?page= → redirect (unchanged)

### Layer 3 — Agents
Located in: lib/agents/
Each agent is a focused tool that does one job well.
Agents are stateless — one document in, one result out.
AI handles exceptions, not the primary path.
Human review is a feature, not a failure.

#### Pre-Bid Checklist Agent (BUILT, TESTED, PRODUCTION-READY)
Located in: lib/agents/pre-bid-checklist/

Purpose: Extract all critical bid requirements from spec book front-end documents.
Replaces 30-60 minutes of manual review per spec book.

Architecture:
- Progressive scan: pages 1-60 base, doubles each pass (60→120→240→480→full)
- Beyond page 60: keyword scan only — matched pages appended to base text
- Dynamic per-page char limit: ≤100pp: 10k | ≤300pp: 8k | ≤600pp: 8k | 600+: 5k
- Total payload cap: 350,000 chars
- Up to 5 passes — exhausts full document if needed
- Merge: only overwrites null fields
- Deterministic post-processing: preBidMandatory fallback, MDOT 2020 buyAmerican,
  breakDownsRequired division subtotal detection, proposedStartDate "Upon Award" default
- Auto-save (upsert), load on return

Tested against 9 real Michigan spec books. Production-ready.

Known AI accuracy issue:
- buyAmerican false positive on EJCDC docs — NSPE/ACEC/ASCE copyright notice
  contains "American". Deterministic rule tightened but AI prompt still needs fix.
  Next session priority #2.

#### Division 26 Scope Review Agent (PLANNED — NEXT MAJOR FEATURE)
Located in: lib/agents/division-26-scope-review/ (not yet created)

Uses TOC parser output to navigate directly to Division 26 sections.
Planned: warranty extraction, scope items, exclusions, RFQ language generation.

#### MDOT Electrical Agent (PLANNED — ROADMAP)
Located in: lib/agents/mdot-electrical/ (not yet created)

Trigger: zero Division 26 TOC entries + MDOT 2020 governing phrase.
Planned: parse Schedule of Items pay items, cross-reference MDOT 2020 Standard Specs.

## Production Infrastructure (Vercel)
- Production branch: main — auto-deploys on push
- Runtime DB: DATABASE_URL (Supabase transaction pooler, port 6543) via PrismaPg in lib/prisma.ts
- Migrations DB: DIRECT_DATABASE_URL (Supabase direct) via prisma.config.ts — CLI only
- Vercel serverless cannot reach direct Supabase connection — pooler required at runtime
- R2 CORS: mitteniq.com + localhost:3000, all methods
- All env vars synced to Vercel via .env.local import on 2026-04-01

## Key Architectural Rules
1. Agents are stateless — one document in, one result out
2. No document-wide intelligence in intake — that belongs in agents
3. Speed over completeness — null is better than a wrong answer
4. AI handles exceptions, not the primary path
5. Human review is a feature, not a failure
6. Fail loud (explicit nulls) not smart (bad guesses)
7. Keyword scan controls deep page access — never bulk-send full documents
8. Deterministic rules take precedence over AI interpretation where possible
9. Deterministic rules must match on specific governing phrases only

## File Naming Convention
- lib/intake_v2/ — intake pipeline files
- lib/agents/[agent-name]/ — one folder per agent
  - types.ts, extract-[thing].ts, run-[agent-name].ts, save-[thing].ts
- app/api/agents/[agent-name]/route.ts — API endpoint (GET + POST)
- components/agents/[ComponentName].tsx — UI component

## What's Deferred
- Real-time streaming progress via SSE
- Background job architecture
- Prime vs. sub role path
- Vision API for scanned pages
- Bid form agent (low priority)
- V2 scorer fixes (pure numeric sheet numbers, page stamp prefix)
- TOC PDF page resolution improvement (bare section number headers)
r leaves page
- Prime vs. sub role path — biddingAs field per project
- Vision API for scanned pages — deferred, text-only for now
- Bid form agent — deeper bid form structure interpretation (low priority, far roadmap)
- V2 scorer fixes — pure numeric sheet numbers and page stamp prefix issues known but deferred
- TOC PDF page resolution improvement — fallback scan for bare section number headers
  (no SECTION keyword) for C2AE/Tawas format docs