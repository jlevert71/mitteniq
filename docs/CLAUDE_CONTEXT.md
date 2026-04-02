# MittenIQ — Claude Resume Context
Last Updated: 2026-04-01 (session 4 — page dimensions, intake report UI, inline PDF viewer, collapsible divisions, page jump fix)

## Who I Am
Jim — electrical estimator/PM with 31 years in the trade, 22 as estimator.
Currently estimator/PM at a small/mid-sized electrical contractor in Mid Michigan.
Founder and sole builder of MittenIQ.
Primary tools: Claude (architecture/guidance), Cursor (code generation), ChatGPT (second opinion).
Important: Jim is not a software developer. All instructions must be step-by-step and plain English.
Claude is the technical partner. Jim is the domain expert.
Cursor prompt format: always deliver as a single fenced code block — one tile, one copy button.

## What MittenIQ Is
AI-assisted estimating platform for electrical contractors specifically.
Long-term vision: estimating, project management, payroll, AP/AR, fleet management.
Current focus: estimating only.

Agent architecture models real estimating department roles:
- Estimating Assistant
- Junior Estimator
- Senior Estimator
- Chief Estimator

Domain framing uses CSI divisions — primarily 26, 27, 28.

## Tech Stack
- Next.js 16, React 19, TypeScript, Tailwind
- Prisma 7 + pg adapter
- Supabase (Postgres)
- Cloudflare R2 (file storage)
- Vercel (hosting)
- OpenAI gpt-4o-mini via Chat Completions
- pdf-parse, pdfjs-dist 5.4.296, @napi-rs/canvas 0.1.65
- tesseract.js (present but avoid using)

## Codebase Structure (top level)
- `lib/intake/` — V1 intake, 29 modules, frozen. DO NOT modify anything here.
- `lib/intake_v2/` — V2 intake, now 5 modules including TOC parser.
- `lib/agents/` — Agent layer, actively being built.
- `app/api/` — API routes (intake, uploads, projects, agents)
- `app/projects/[projectId]/` — Project pages including intake UI
- `app/projects/[projectId]/intake/IntakeClient.tsx` — Main intake page (this is the active one)
- `app/intake/` — OLD V1 intake page, still exists but being phased out
- `prisma/schema.prisma` — DB schema (User, Project, Upload, Sheet, PreBidChecklist, PreBidChecklistAllowanceItem models)
- `components/agents/` — Agent UI components
- `public/pdf.worker.min.js` — pdfjs worker (copied from node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs)

## Core Architectural Decisions Made
1. V1 intake is frozen. Do not touch it.
2. V1 intake is gated behind MITTENIQ_V1_INTAKE_ENABLED=false in .env.local.
   Uploads now complete in ~1 second regardless of file size.
3. V2 philosophy: deterministic scorer first, AI only for fallback, fail loud not smart.
4. Intake job is: PDF health check + page count + print sizes + rough classification.
   Page-by-page sheet number/title extraction is deferred — not blocking agent work.
5. Speed is critical. Target: under 90 seconds even for 900+ page documents.
6. No registry systems, no reconciliation layers, no multi-layer confidence scoring in V2.
7. AI tier = text-based for digital PDFs. Vision only for scanned pages, async, never blocking.
8. Pre-bid checklist agent uses progressive scan — starts at 60 pages, doubles each pass.
   Beyond page 60: keyword scan only, matched pages appended to base 60 — never bulk text.
   Per-page character limit is dynamic based on document size to balance speed vs completeness.
9. The product vision: upload a spec book, get your J. Ranck bid summary sheet filled out
   automatically in seconds. Estimator reviews and corrects. That's the core value.
10. Active intake page is app/projects/[projectId]/intake/ — NOT app/intake/ (old V1 page)
11. Warranty requirements belong in the Division 26 scope review agent, not the pre-bid checklist.
12. MittenIQ is built specifically for electrical contractors — domain knowledge is baked in,
    not generic. Every feature should reflect how an electrical estimator actually works.
13. preBidMandatory uses a deterministic fallback: if preBidHeld=true and no mandatory language
    found in first 60 pages, default to false. "Encouraged" always means discretionary.
14. Special insurance only triggers for non-standard coverages — standard GL/Auto/WC never trigger it.
15. DBE only triggers when explicit participation goals or Good Faith Effort documentation required.
    Diversity disclosure forms and certification tables do NOT trigger it.
16. MDOT 2020 Standard Specifications reference triggers buyAmerican=true — FHWA Buy America
    is incorporated by reference into all MDOT standard spec projects. The deterministic rule
    matches on full governing phrases only (e.g. "2020 standard specifications for construction
    shall govern") — never on incidental MDOT material spec references or the word "American"
    appearing in organization names like NSPE, ACEC, ASCE.
17. breakDownsRequired=true when the bid form requires pricing broken into separate named
    divisions or sections each with their own subtotal. This is an estimator setup flag —
    it tells the estimator to mirror the bid form structure before starting takeoff.
    Deterministic post-processing rule fires on "total division i/ii" language in addition
    to AI extraction.
18. TOC parser is deterministic — no AI. Finds section numbers, resolves PDF page numbers via
    body text scan. Null for any unresolved page — never guesses.
19. MDOT proposals have no TOC — TOC parser correctly returns zero entries for these docs.
    When zero Division 26 entries + MDOT 2020 governing phrase detected, display static note
    directing estimator to Section 812 of MDOT Standard Specs.
20. /api/uploads/[uploadId]/file returns JSON { ok, url, page } when ?page= param is present.
    Returns redirect (no #page) when no param — existing file-open links unaffected.
    PDF page jumping is handled client-side via the inline pdfjs canvas viewer.
    Browser native PDF viewers ignore #page= fragments on redirected/presigned URLs —
    the inline viewer is the only reliable solution.

## Full App Status (as of 2026-04-01)

### Public Marketing Site — mitteniq.com
- Landing page live with tagline, feature overview, and waitlist signup form
- Waitlist form fully wired: captures name, email, company, notes
  Sends confirmation email to the person who signed up + notification email to Jim
- Pricing section: $149/month standard, $49 lifetime founding member (limited spots)
- Projected annual savings table across small/medium/large contractor tiers
- How it works section (3 steps), FAQ section, footer nav
- Menu, Log in, and Join Waitlist buttons in top nav

### Auth
- Login page at /login — email + password, session cookie (mitten-auth)
- "First time? Set up your account" link on login page
- requireUserId() auth guard used across all API routes

### Projects Dashboard — /projects
- Lists all projects with upload count per project
- Create Project modal — name it or leave blank for auto-name
- Delete Project with confirmation modal (shows project name, warns it can't be undone)
- Projects Dashboard button available in nav from all project pages

### Project Page — /projects/[projectId]
- Project name + "Project workspace" subheader
- Project efficiency bar: Time saved / Manual cost / MittenIQ cost / Savings
  (tracking starts after first purchase — all show $0/0h until then)
- Four agent tiles: Estimating Assistant, Junior Estimator, Senior Estimator, Chief Estimator
  Each has an Open → button. Junior/Senior/Chief pages exist but are empty stubs.
- Purchased functions panel (left side): shows purchased tasks with report links
  "Intake + Sheet Setup" shows "View intake reports" button when purchased
- Upload drawings/specs panel (right side): drag and drop PDF upload zone
  Upload list shows each file with READY badge and Delete button

### Estimating Assistant Page — /projects/[projectId]/agents/estimating-assistant
- Header: "Estimating Assistant", "Project: [project name]"
- AI interface section (stub — chat input + Send button, not yet functional)
- Functions section with purchase/status badges:
  - Intake + Sheet Setup — Purchased (working)
  - Drawing Organization — In development
  - Specification Intelligence — In development
- Select all / Purchase selected buttons
- Pricing methodology placeholder section
- Back to Project button in top right

### Intake Page — /projects/[projectId]/intake?uploadId=[id]
- Reached via "Open intake →" link next to each file in the purchased functions panel
- Current navigation path: project page → purchased functions → View intake reports → select file
  This is clunky — surfacing intake links more directly is on the to-do list
- File status bar: filename, Upload status, Intake status, Stage, Page count badges
- Intake Report section — fully wired with V2 data (see below)
- Inline PDF Viewer panel — renders between intake report and pre-bid checklist on demand
- Pre-Bid Checklist section (full agent UI embedded below PDF viewer)
- Back to Project link and Refresh button in header

### Intake Report (embedded in intake page) — COMPLETE
Three sub-sections, fetched from GET /api/intake-v2/test?uploadId=:

**File Health**
- Green checkmark + "File validated — PDF is readable and can be trusted." when ok
- Red X + error message when not ok

**Page Summary**
- Total page count
- Table: Size | Type | Pages, sorted by count descending
- Label rule: 8.5×11 or 11×8.5 = Specifications, all other sizes = Drawings
- "Page size data not available." if pageSizes is empty

**Specification Section Index**
- Grouped by CSI division, sorted numerically (null/other at end)
- All divisions start collapsed by default
- Division headers are collapsible toggle buttons with ▶/▼ chevron
- Expand All / Collapse All button — label reflects current state
- Section links (blue) open inline PDF viewer at correct page when pdfPageNumber resolved
- Plain text (no link) when pdfPageNumber is null — honest, never guesses
- Pre-printed EJCDC forms (e.g. C-700 General Conditions) correctly show as plain text —
  body text doesn't start with a standard section header, so page resolution returns null
- "No table of contents found in this document." when toc.entries is empty
- "Section index unavailable — [error]" in amber when toc.ok is false

### Inline PDF Viewer (embedded in intake page) — COMPLETE
- Renders between Intake Report card and PreBidChecklist when a section link is clicked
- Uses pdfjs-dist only — no new packages
- Worker: public/pdf.worker.min.js (copied from node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs)
- Dynamic import: import("pdfjs-dist/legacy/build/pdf.mjs") — .mjs so TypeScript resolves it
- RenderParameters: { canvasContext, canvas, viewport } — canvas param required in pdfjs 5.4
- Page jump flow: click section link → fetch /api/uploads/[id]/file?page=N →
  returns { ok, url, page } JSON → setPdfViewer → useEffect renders canvas at correct page
- Prev/Next page navigation, total page count display, Close button
- Scrollable canvas container (max-h-[70vh])
- app/intake/page.tsx also updated to use fetch → window.open flow (not href) to avoid
  dumping JSON in the tab now that the file route returns JSON when ?page= is present

### Pre-Bid Checklist (embedded in intake page) — COMPLETE
- Run Pre-Bid Checklist button triggers full agent scan
- Progress log shows pass-by-pass messages with personality
- ✓ Saved indicator after successful scan
- Loads saved checklist automatically on page open — no re-run needed on return visit
- Full checklist output in 6 labeled sections with editable fields

## What's Built and Working

### Infrastructure
- Auth (session cookie, requireUserId)
- Projects CRUD
- PDF upload to R2 (presign → browser PUT → complete → analyze)
  Upload completes in ~1 second (V1 intake disabled)
- Intake V1 pipeline (frozen, disabled by env var)
- Intake V2 pipeline: buffer → text extraction → page dimensions → simple line scorer → TOC parse → result
- V2 route: GET /api/intake-v2/test?uploadId= and POST with file upload
- Project page UI with agent workspace, file uploads, intake links

### Critical Fix — pdf-text-extraction.ts
`cleanText()` was collapsing ALL whitespace including newlines into a single space.
Fixed to preserve newlines: `.replace(/[^\S\n]+/g, " ")` — collapses spaces/tabs only.
This was blocking the TOC parser from seeing line structure in extracted text.

### Page Dimension Extraction — BUILT, WORKING
- pdfjs-dist extracts viewport dimensions for each page alongside text extraction
- Each page: view array [x, y, w, h] in points ÷ 72 = inches, rounded to 1 decimal
- Stored as pageDimensions: { widthIn, heightIn } | null on IntakeV2PageTextInput
- pageSizes summary on IntakeV2RunResult: grouped by unique size, labeled, sorted by count desc
- Label rule: 8.5×11 or 11×8.5 = "Specifications", all other sizes = "Drawings"
- Dimension extraction failure on any page → null, never throws

### TOC Parser — BUILT, TESTED, WORKING
Located in: lib/intake_v2/parse-toc.ts
Called from: lib/intake_v2/run-intake-v2.ts
Result shape: TocParseResult in lib/intake_v2/types.ts

Supports all real-world spec book TOC formats found in Michigan construction docs:
- Format A: section number + spaces/dash + title, no page refs (Fishbeck, C2AE/Tawas, ITB)
- Format B: title + dot leaders + page ref (Wade Trim/Lake Mitchell)
- Multi-page TOC: follows TOC across consecutive pages once header is detected
- No TOC: MDOT proposals correctly return zero entries

Section number formats supported:
- CSI 8-digit: `26 05 00`
- 2+4 digit: `26 0500`, `26 0533.13`, `26 2913.03` (decimal subdivisions)
- Legacy 5-digit: `16060`, `02240`
- GFA alphanumeric: `C-111`, `C-200`, `C-941-2`

Validation: only real section number patterns accepted — article/clause numbers filtered out

PDF page resolution: scans body text for "SECTION XX XX XX" headers near top of each page.
Stores null for any unresolved page — never guesses.

Performance benchmarks (tested):
- Fishbeck 946 pages: 154 entries, 153 resolved, 18ms
- Tawas/C2AE: 171 entries, 3 resolved (body headers don't use SECTION keyword), 16ms
- MDOT proposals: 0 entries (correct — no TOC in these docs)

Known gap: PDF page resolution only works when body section headers start with "SECTION".
Docs that use bare section numbers as headers (C2AE format) get zero resolved pages.
Pre-printed EJCDC forms (e.g. C-700 General Conditions) also return null — correct behavior.
Acceptable for now (null is honest). Resolution improvement is on the roadmap.

### Pre-Bid Checklist Agent — COMPLETE, BATTLE-TESTED, PRODUCTION-READY
Files:
- lib/agents/pre-bid-checklist/types.ts
- lib/agents/pre-bid-checklist/extract-checklist-fields.ts
- lib/agents/pre-bid-checklist/run-pre-bid-checklist.ts
- lib/agents/pre-bid-checklist/save-checklist.ts
- app/api/agents/pre-bid-checklist/route.ts (GET + POST)
- components/agents/PreBidChecklist.tsx
- Visible at: /projects/[projectId]/intake?uploadId=[id]

#### Features:
- Progressive scan engine: pages 1–60 base, doubles each pass (60→120→240→480→full)
  Beyond page 60: keyword scan only, matched pages appended to base 60 — never bulk text
- Dynamic per-page character limit based on document size:
  ≤100 pages: 10,000 chars | ≤300 pages: 8,000 chars | ≤600 pages: 8,000 chars | 600+: 5,000 chars
- Total payload cap: 350,000 chars — well under gpt-4o-mini 512k context window
- Pass messaging with personality: "Wow, this is a big document…", "hang tight…"
- Parent/child alert system: fires ⚠ when parent is true and child detail is null
- Obligee smart default: if bid bond required and obligee null, shows "Likely: [biddingTo]"
- Auto-save after every successful scan (upsert — overwrites previous save)
- Load saved checklist on page open — no re-run needed on return visit
- "Not found in document" on every null field — no blank fields ever
- Manual review warning lists exact unresolved fields after full document scan
- ✓ Saved indicator after successful scan
- # of copies defaults to 1 if not stated — minimum is always 1
- Deterministic pre-bid mandatory fallback — text search of front 60 pages for mandatory language
- Deterministic MDOT 2020 buyAmerican rule — full-document text search for governing phrase
- Deterministic breakDownsRequired rule — text search for division subtotal patterns
- proposedStartDate defaults to "Upon Award" if not found anywhere in document
- proposedCompletionDate captures both Substantial Completion and Final Completion dates
  on separate lines when both are found: "Substantial Completion: [date]\nFinal Completion: [date]"

#### Domain knowledge baked in:
- Federal funding (EDA, SRF, CWSRF, DWSRF, FHWA, EPA, BABAA, AIS) triggers
  buyAmerican=true and certifiedPayroll=true automatically
- MDOT 2020 Standard Specifications governing reference triggers buyAmerican=true
- preBidMandatoryScope defaults to "primes_only" when mandatory but subs not mentioned
- "Encouraged to attend" always means preBidMandatory=false (31-year domain rule)
- Static note: pre-bid attendance always recommended even when not mandatory
- Static note: PLM bonds — "if prime requires sub bonds, add 3% to proposal"
- Static note: Davis-Bacon — certified payroll records required throughout project
- Static note: AIS — all iron and steel must be domestically produced
- Static note: DBE/SBE — be prepared to provide certification status, factor in sub selection
- DBE only true when participation goals or Good Faith Effort docs explicitly required
- Special insurance only true for non-standard coverages (pollution, railroad, OCIP, etc.)
- "Bid guaranty" recognized as equivalent to bid bond (MDOT terminology)
- "Bids received at [address]" recognized as in-person delivery method
- Relative RFI deadlines captured as stated ("less than 7 days prior to bid opening")
- Tiered LD schedules summarized concisely ("$100–$400/day based on contract value")
- Allowances extracted even when embedded in lump sum bid form (Fishbeck format)
- breakDownsRequired captures yes/no only — bid form structure interpretation is the
  estimator's job. Future bid form agent is on the roadmap but low priority.

#### Fields extracted (6 sections):
**Section 1 — Project & Bid Identity:**
projectName, bidDueDate, bidDueTime, bidOpeningType, biddingTo, deliverBidTo,
deliveryMethod, numberOfCopies, documentsAvailableAt, lastRfiDate

**Section 2 — Pre-Bid Meeting:**
preBidHeld, preBidMandatory, preBidMandatoryScope, preBidDate, preBidTime, preBidLocation

**Section 3 — Schedule:**
proposedStartDate, proposedCompletionDate

**Section 4 — Bid Pricing Format:**
unitPricing, alternates, alternatesCount, alternatesDescription,
allowances, allowanceItems (array: description + amount), breakDownsRequired

**Section 5 — Bonds & Insurance:**
bidBondRequired, bidBondAmount, plmBonds, liquidatedDamages,
liquidatedDamagesAmount, obligee, specialInsuranceRequired, specialInsuranceType

**Section 6 — Compliance & Labor:**
certifiedPayroll, buyAmerican, dbeSbeRequired, dbeSbeGoalPercent

#### Tested against 9 real spec books across different owners, engineers, and formats:
1. MDOT 211075_Proposal.pdf — state highway, MDOT format, FHWA funding
2. MDOT 210154_Proposal.pdf — state highway, DBE required at 5%, unit price schedule
3. FISHBECK-SPEC.pdf (946 pages) — municipal water treatment, City of Mt Pleasant
4. 00000.pdf (288 pages) — township pump station, Charter Township of Union / GFA, EJCDC format
5. Specifications.pdf (177 pages) — City of Saginaw water plant, Tetra Tech
6. lake Mitchell Contract #2 Specs.pdf (432 pages) — municipal wastewater, Wade Trim, EJCDC
7. ITB 4266 - Saginaw Road Streetscape.pdf — City of Midland streetscape, local ITB format
8. 241875 (DWSRF 7880-01) Bids and Construction SPEC.pdf (307 pages) — City of Owosso
   water treatment electrical improvements, Fishbeck, DWSRF funded, pollution liability caught
9. 2025 Parking Lots 4 & 5 Reconstruction Bid.pdf — City of Mt Pleasant, DPW self-prepared,
   MDOT 2020 Standard Specs governing, two-division unit price bid form, division subtotals

### DB Schema
- PreBidChecklist model — one per upload, all scalar fields including projectName
- PreBidChecklistAllowanceItem model — child table for allowance line items
- Migrations applied:
  - 20260323170406_add_pre_bid_checklist
  - 20260324212755_add_project_name_to_pre_bid_checklist

## Known Issues / Open Problems
- Progress messages show all at once after scan completes — streaming is deferred
- Old app/intake/ page still exists — needs to be retired or redirected
- V2 scorer misses pure numeric sheet numbers (MDOT format: 1, 2, 3...) — deferred
- V2 scorer picks up page stamp prefix on spec titles — deferred
- Project page navigation is clunky — multiple steps to reach intake page, needs cleanup
  Intake links should be surfaced directly on the project page
- Background job architecture needed — scan currently abandoned if user leaves page mid-run
- qualificationsRequired field added to types/extract but not yet added to DB schema or save logic
- dbeSbeGoalPercent field added to types/extract/UI but not yet added to DB schema or save logic
- buyAmerican false positive on EJCDC format docs — AI matches "American" in NSPE/ACEC/ASCE
  copyright notices that appear on every page. Deterministic rule is tightened to full governing
  phrases but AI prompt still needs explicit exclusion of organization name false positives.
- TOC PDF page resolution only works for docs where body section headers start with "SECTION"
  keyword. C2AE/Tawas format uses bare section numbers — zero pages resolved for these docs.
  Acceptable for now (null is honest), improvement on roadmap.

## Next Session Priorities (in order)
1. Fix buyAmerican AI false positive — add explicit exclusion of NSPE/ACEC/ASCE organization
   name matches to the buyAmerican prompt instruction in extract-checklist-fields.ts
2. Add qualificationsRequired and dbeSbeGoalPercent to DB schema and save logic
3. Improve TOC PDF page resolution for docs that use bare section numbers (no SECTION keyword)
4. Print view — clean bid summary sheet, printable/PDF export
5. Streaming progress — real-time pass messages instead of post-scan display
6. Clean up project page navigation — surface Open intake links directly, remove extra steps
7. Retire old app/intake/ page
8. Background job architecture — scan survives page navigation
9. Division 26 scope review agent — second agent
   - Warranty extraction by spec section is first target
   - Extended warranty (>1 year) flags dollar impact warning
   - Scope items, exclusions, furnished-by-owner equipment
   - RFQ language generation (e.g. "Section 26 22 13 requires 2-year unconditional warranty")
   - Uses TOC parser output to navigate directly to Division 26 sections

## Decisions Still Pending
- [ ] Prime vs. sub role path — biddingAs field per project, UI filters requirements by role
- [ ] Retire or redirect old app/intake/ page
- [ ] V2 scorer fixes (deferred)
- [ ] AI fallback tier for V2 (deferred)
- [ ] Real-time streaming progress via SSE
- [ ] TOC PDF page resolution improvement — scan for bare section number headers
      (e.g. "26 05 00" or "26 0500" near top of page, not just "SECTION XX XX XX")
- [ ] MDOT Electrical Agent (roadmap) — detects MDOT standard spec projects,
      parses Schedule of Items for electrical pay items (8100-8199 range),
      cross-references each pay item to governing spec section in MDOT 2020 Standard Specs,
      fetches relevant requirements from MDOT website or R2 cache.
      This is post-Division 26 agent in priority.
- [ ] Bid form agent (low priority, far roadmap) — deeper bid form structure interpretation
      to help estimator mirror the bid form in their estimate setup

## Rules Claude Must Always Follow For This Project
1. Do not modify lib/intake/ — it is frozen V1
2. Do not add registry, reconciliation, or multi-layer confidence systems
3. Do not use vision API for digital PDFs — text extraction only
4. Speed over completeness — flag unknowns, never block on them
5. Fail loud (explicit nulls) not smart (bad guesses)
6. One file, one responsibility
7. No `any` types
8. Surgical fixes only — never refactor working code while fixing something else
9. Always give Jim Cursor prompts for code changes, never raw code to edit manually
10. Cursor prompts must always be a single fenced code block — one tile, one copy button.
    Never split instructions and code across multiple blocks.
11. Always explain what we are doing and why in plain English before giving Cursor prompts
12. MittenIQ is for electrical contractors specifically — all domain decisions must reflect
    how an electrical estimator/subcontractor actually works in the field

## How To Use This File
Paste this file + V2_ARCHITECTURE.md at the start of each new Claude conversation.
Then say "here's where we left off" in one sentence.
Claude will have everything needed to pick up mid-stride.

Update this file at the end of every work session:
- Move completed items to "Built and Working"
- Update "Next Session Priorities"
- Add new known issues
- Add new decisions made