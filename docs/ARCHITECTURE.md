# docs/ARCHITECTURE.md

# MittenIQ Architecture

Last updated: 2026-03-19

This document is the current architectural source of truth for MittenIQ.

If code and docs disagree, use this file together with `DECISIONS.md` to guide refactor work toward the intended architecture.

---

## What MittenIQ Is

MittenIQ is an internet-based estimating platform built around AI-driven agent workflows for construction document understanding and estimating preparation.

Its purpose is not to mimic a generic chatbot file-drop experience.

Its purpose is to:

- build reusable project intelligence from uploaded bid documents
- organize and prepare estimating information in one place
- support future estimating agents with structured, reusable evidence
- remain simple and trustworthy for estimators and office staff

Core principle:

**Intake is the first AI project-understanding pass.  
Later agents should reuse that intelligence instead of repeatedly re-reading the same files from scratch.**

---

## Core Product Direction

MittenIQ is being built as a platform of estimating agents.

The intended architecture pattern is:

**upload  
→ evidence preparation / structural extraction  
→ intelligent routing  
→ AI interpretation where needed  
→ trust enforcement  
→ persistence  
→ downstream agent workflows**

Normal workflow pattern:

**code prepares evidence and structural shortcuts  
→ AI is asked the right structured question on the right unit  
→ AI returns structured output  
→ code validates shape, enforces trust, stores, and presents it**

MittenIQ is not intended to become a brittle rule engine full of expanding document-specific parsing logic.

AI is still the reasoning layer.  
Code is the orchestration, routing, validation, persistence, permissions, trust, workflow state, and UI layer.

---

## Product Constraints

The current architecture is guided by these priorities:

1. **Accuracy first**
2. **Estimator trust second**
3. **Future-agent reuse third**
4. **Speed fourth, but speed-enabling routing and user-visible responsiveness are now explicitly in scope**
5. **UI polish after trustworthy intelligence exists**

MittenIQ should prefer review-required behavior over fake certainty.

However, review behavior must be calibrated to reduce false positives once output is already practically correct and estimator-usable.

---

## Technology Stack

### Runtime / Framework
- Node.js
- Next.js App Router
- React
- TypeScript

### Styling
- Tailwind CSS

### Database / ORM
- Postgres
- Prisma

### Storage
- Cloudflare R2

### PDF / Extraction
- `pdf-parse`
- `pdfjs-dist`
- `@napi-rs/canvas`

### OCR
- `tesseract.js`

### AI
- OpenAI SDK
- Chat Completions API
- current intake model: `gpt-4o-mini`

---

## Domain Model

Source of truth: `prisma/schema.prisma`

### Upload
Uploads currently store:

- file metadata
- intake status
- intake stage
- intake delay reason
- intake error
- intake report JSON
- basic file-fact outputs

Important current behavior:

The `Upload` row is now both:
- the durable file record
- the live intake-state record used by the project workspace UI

This is intentional for now.

### Sheet
The `Sheet` table is currently the page-level persistence layer for intake results.

It stores broader page intelligence, not just drawing-sheet data.

Current persisted fields include:

- page number
- sheet number
- sheet name
- discipline
- broad page class
- spec section number/title
- electrical relevance
- scale-related fields
- notes

Important note:

The name `Sheet` is legacy and acceptable for now.  
It currently functions as a page register / page intelligence table.

Important current limitation:

The current schema still overloads drawing-oriented fields (`sheetNumber`, `sheetName`) for broader page identity in project manuals and spec books. That is acceptable temporarily, but future schema evolution will likely need explicit page-identity fields.

---

## Architectural Rule: Intake Must Serve Future Agents

Intake is not just for the intake report.

It exists to produce reusable project intelligence that future agents can use without redoing core understanding work.

This includes support for later workflows such as:

- project organization
- spec intelligence
- drawing intelligence
- bid-risk review
- manufacturer extraction
- RFQ preparation
- downstream takeoff assistance
- budgetary estimate support
- review workflows

Permanent rule:

**Every expensive pass should create reusable project intelligence, not one-off answers.**

That includes:

- extracted file facts
- native text
- OCR text
- page images
- page-level AI understanding
- review outcomes
- grouped spec structure
- structural section maps when available
- future drawing relationships
- future TOC/index reconciliation results
- upload-level workflow state that later tools can rely on

---

## Intake Architecture Philosophy

MittenIQ intake is explicitly AI-first.

The system is designed so that AI performs document reasoning and interpretation work, while deterministic code handles orchestration and support responsibilities.

### AI responsibilities

AI is responsible for:

- page understanding
- page classification
- semantic page subtype interpretation
- packet identity recognition
- title interpretation
- section start / continuation / end reasoning
- document continuity reasoning
- page relationship reasoning
- spec section identity
- drawing identity when supportable
- discipline inference
- electrical relevance inference
- confidence estimation
- structured evidence explanation
- downstream estimating reasoning later

### Deterministic responsibilities

Deterministic code is responsible for:

- file ingestion
- metadata extraction
- page preparation
- native text extraction
- OCR fallback
- page image generation
- chunk packaging
- schema validation
- persistence
- review queue mechanics
- trust thresholds
- workflow state transitions
- UI rendering
- permission and workflow controls
- simple normalization for storage/display
- impossible-state prevention
- extraction of cheap trustworthy structure
- routing decisions based on evidence quality

### Hard architecture rule

Deterministic code must not pre-interpret meaning in ways that constrain the AI.

The system should prefer:

**evidence preparation / structural extraction  
→ routing  
→ AI interpretation  
→ AI continuity reasoning  
→ trust enforcement**

and should avoid:

**deterministic meaning first → AI constrained to brittle assumptions**

---

## Non-Obstructive Deterministic Layer Rule

Deterministic layers may support AI, but they must not impede, constrain, override, or materially narrow AI interpretation unless required for:

- basic system validity
- trust enforcement
- persistence integrity
- workflow/UI needs
- using trustworthy existing document structure to avoid unnecessary work

This means deterministic code must not:

- pre-classify page meaning in a brittle way
- suppress useful ambiguity before AI sees it
- strip evidence because it “usually isn’t needed”
- replace uncertainty with fake certainty
- become the main engine for meaning, requirements, or conflict interpretation

The deterministic layer is infrastructure plus structural shortcuts, not the core intelligence.

---

## Intake / Setup Architecture

### Purpose

Intake / Setup is the first AI pass over project documents.

It should answer, at minimum:

- what files and pages exist
- what kind of content each page contains
- what semantic subtype each page appears to be
- whether it is likely electrical-relevant
- what identity fields are supportable
- what evidence is weak
- what requires human review
- what later agents should be able to query
- how pages or sections relate to surrounding content

### Deterministic code responsibilities

Code should own:

- file upload and storage plumbing
- PDF structural checks
- page count / print size / page-size distribution
- native text extraction
- page preparation
- page image generation
- OCR orchestration
- layout hints / extraction hints
- bookmark / outline extraction where useful
- chunking and request shaping
- schema validation
- trust checks
- persistence
- review plumbing
- workflow-state plumbing
- UI plumbing
- permissions / ownership / approvals
- routing into the cheapest reliable path

### AI responsibilities

AI should own:

- page understanding
- broad page class
- semantic subtype
- drawing identity when supportable
- spec section identity when supportable
- discipline inference
- electrical relevance
- visible document-page labels when supportable
- visible page titles when supportable
- content signals useful to later agents
- confidence and review recommendation
- packet continuity
- section continuity
- section boundary reasoning when structure is weak
- structured evidence explanation

### Post-AI responsibilities

Post-AI code should own:

- shape validation
- normalization for storage/display
- trust gating
- review-status calculation
- impossible-state prevention
- persistence formatting

Post-AI code should not become a substitute reasoning engine.

---

## Current Intake State

The current intake system is modular enough to reflect the intended architecture more closely.

### Already present in the current build

- native PDF text extraction
- PreparedPage structure
- formal router stage
- file default routing
- page override routing
- route-aware OCR candidate selection
- independent page image generation
- page image persistence to temp storage
- image delivery into the OpenAI intake request
- AI page understanding
- post-AI normalization / cleanup
- spec section grouping
- persistence of page-level results into `Sheet`
- persisted upload-level intake state
- background intake execution
- project-page polling during active intake

### New proof-of-concept still present

- isolated PDF bookmark extraction with `pdfjs-dist`
- bookmark destination resolution to page numbers
- CSI-style section-range derivation from bookmark structure
- real-world validation against consultant, MDOT, and ARTICLE/manual families

### Important current limitation

The fast-path work is still proof-of-concept and not yet wired into the live intake pipeline.

The current live deep path is still the heavy AI/OCR path.

---

## Current Live Upload / Intake Architecture

The current live architecture is now intentionally split between:

### 1. Start request
The analyze route performs:

- auth / ownership validation
- upload validation
- persisted intake start-state update
- detached/background intake kickoff
- immediate response to the UI

### 2. Background intake execution
The heavy orchestration continues in the background and handles:

- R2 read
- PDF checks
- extraction and preparation
- routing
- OCR and images
- AI page understanding
- report assembly
- `Sheet` rewrite
- final upload-state update

### 3. Live UI refresh
While any upload in a project is `PROCESSING`, the project workspace polls the existing project/uploads read path and updates:

- intake status
- intake stage
- delay reason
- final readiness state

This means the system is now architected to feel responsive even when deep intake is still expensive.

---

## Current Upload Lifecycle

The current upload lifecycle is:

### Upload creation
- upload row created
- presigned R2 upload issued
- file PUT to R2
- upload marked complete

### Intake start
- analyze route validates request and ownership
- upload moves into persisted `PROCESSING`
- initial `intakeStage` is written
- `intakeError` and `intakeDelayReason` are cleared
- route returns immediately

### Intake execution
Background intake persists coarse stage updates such as:

- `STARTING`
- `READING_PDF`
- `PREPARING_PAGES`
- `RUNNING_AI`
- `ASSEMBLING_REPORT`

### Intake success
- upload is updated to `READY`
- final `intakeReport` is persisted
- `Sheet` rows are rewritten from results
- stage becomes `COMPLETE`

### Intake failure
- upload is updated to `FAILED`
- error is persisted
- UI reflects failed state

### Upload delete
An upload can now be deleted if it is not currently `PROCESSING`.

Delete flow:

- ownership verified
- processing uploads rejected with `409`
- `Upload` row deleted
- related `Sheet` rows removed by cascade
- R2 object delete attempted after DB delete

This is now part of the intended upload lifecycle, not an afterthought.

---

## Current Persisted Workflow State Design

The current upload-level workflow state on `Upload` includes:

- `intakeStatus`
- `intakeStage`
- `intakeDelayReason`
- `intakeError`
- `intakeReport`

### Why this matters architecturally

This means the `Upload` row currently serves both:

- durable file/intake persistence
- live UI state for project workflow visibility

That is acceptable for the current stage of the product.

It gives the system:

- restart-safe status
- reload-safe stage visibility
- user-facing progress visibility without new infrastructure

### Current limitation

This is still a pragmatic v1 state model.

Future architecture may separate:
- durable intelligence
- review queue state
- workflow event/state history

But that split is not required yet.

---

## Target Intake Pipeline

The target intake pipeline remains:

### Stage 1 — File Facts
Deterministic extraction of objective file properties.

Examples:

- file name
- upload time
- page count
- print size
- page-size distribution
- PDF trust indicators
- searchable/raster likelihood

### Stage 2 — Structural Signal Extraction
Cheap structural signals should be extracted when available.

Examples:

- bookmark/outline tree
- TOC signals
- repeated section headers
- document family/profile hints
- file-level structure quality indicators

This stage exists to decide whether the document already exposes trustworthy organization.

### Stage 3 — Routing / Eligibility Assessment
The system should decide which lane is cheapest and trustworthy enough.

Examples:

- likely drawing path
- likely text/spec path
- likely structured spec fast path
- heavy fallback path

Routing should be evidence-based, not filename fantasy.

### Stage 4 — Page Preparation
Each page should be prepared with the strongest available evidence package.

Prepared evidence may include:

- page number
- dimensions / print size
- native extracted text
- OCR text
- page image
- layout / region hints
- extraction quality indicators
- route hints / confidence

### Stage 5 — AI Page / Section Understanding
AI should inspect the right unit using the prepared evidence bundle.

Depending on routing, this may be:

- page-level understanding
- section-level understanding
- mixed page/section understanding for harder files

Expected outputs include:

- broad page class
- semantic subtype
- drawing/spec/bid/general meaning
- visible page label when supportable
- visible page title when supportable
- section identity when supportable
- packet identity when supportable
- discipline
- electrical relevance
- continuity signals
- confidence
- review recommendation
- concise evidence note

### Stage 6 — AI Continuity / Relationship Reasoning
AI-driven continuity modeling should reason across neighboring pages, sections, and document runs.

This stage should support:

- multi-page packet continuity
- spec section start / continuation / end reasoning
- boundary-page reasoning
- section run modeling
- continuation naming support
- later TOC-aware and index-aware reconciliation

This stage is especially important for:

- specification books without strong structure
- front-end bid packets
- repeated legal/contract forms
- mixed-content project manuals

### Stage 7 — Trust Verification
Deterministic checks verify trust after AI output.

Examples:

- low confidence
- malformed output
- impossible field combinations
- missing required identity where trust depends on it
- suspicious weakness requiring review

These checks should reduce trust or send items to review.  
They should not become the main document-understanding engine.

### Stage 8 — Persistence
Results are stored in durable structures that later agents can reuse.

### Stage 9 — Estimator Output
Outputs should include:

- intake report
- page register
- review-required items
- trust messaging
- future project intelligence views

### Stage 10 — Live Workflow Visibility
The user should be able to see that work is actively progressing.

This includes:

- processing state
- stage updates
- limited plain-English delay context
- final state change without manual reload

This is now part of the architecture, not just UI decoration.

---

## Multi-Lane Spec Direction

MittenIQ should not treat every spec book the same.

### Structured spec fast path
Use when trustworthy structure exists.

Likely signals:

- bookmarks / outline
- usable TOC
- stable section headers
- consistent digital text

Goal:

- derive section maps cheaply
- let AI reason on sections instead of brute-forcing every page
- reduce cost and runtime on large structured books

### Heavy fallback spec path
Use when structure is weak.

Likely cases:

- no bookmarks
- broken or absent TOC
- messy scans
- weak native text
- mixed or ugly industrial books

Goal:

- preserve coverage
- use OCR, images, and AI page-level discovery
- remain slower but trustworthy

### Important rule
The heavy path is not obsolete.  
It remains required fallback coverage.

---

## Outline / Profile Direction

Real testing has now shown recurring outline families.

### CSI consultant manuals
Examples:

- `26 05 00 Common Work Results for Electrical`
- `00 11 13 Advertisement for Bids`

### MDOT proposal/spec books
Examples:

- `20SP-104D-01 PREVAILING WAGE AND LABOR COMPLIANCE`
- `20NB01 BID RIGGING`
- `20SS-001A-04 ERRATA TO THE 2020 STANDARD SPECIFICATIONS`

### ARTICLE/manual contract books
Examples:

- `ARTICLE 6 – Bonds and Insurance`
- `6.01 Performance, Payment, and Other Bonds`
- `SC- 6.03 Contractor’s Insurance`

### Architectural implication
Fast-path eligibility should be:

**structure-first, profile-aware**

not:

**CSI-or-nothing**

---

## Dual Analysis Path Direction

MittenIQ should use different evidence strategies for different page and document types when that improves both speed and accuracy.

### Spec-oriented path
Usually preferred for:

- 8.5 x 11 pages
- text-heavy pages
- spec books
- front-end documents
- bid forms
- project manual content

This path should emphasize:

- structure extraction
- meaning extraction
- section structure
- packet continuity
- page titles
- visible page labels
- TOC/header/footer signals
- bid-critical information
- lower image cost unless needed

### Drawing-oriented path
Usually preferred for:

- 11 x 17 and larger pages
- linework-heavy pages
- title-block-driven sheets
- plans, details, risers, schedules, one-lines

This path should emphasize:

- page image evidence
- OCR + native text together
- title block / identity evidence
- discipline clues
- visual structure

Important current learning:

Drawing-path quality now clearly separates into at least two problems:

1. **page classification**
2. **page identity extraction**

Recent prompt work improved some drawing-vs-general classification behavior.

However, drawing identity extraction is still too weak on some pages, especially where:
- job number / project number
- detail/reference number
- and true sheet identity
appear close together in the title block.

### Override rule
Print size is a strong hint, not a hard law.

The system must support:

- file-level default routing
- page-level override routing
- mixed-content PDFs
- abnormal pages inside otherwise normal documents

Routing must guide evidence strategy, not hardcode meaning.

---

## Current Prompt / Classification Direction

The current architecture intentionally allows prompt-level improvement before bigger system redesign when the failure mode is clearly instruction-driven.

This is now a practical rule, not just a philosophy.

### Recent example
When drawing-set pages were drifting into `GENERAL_DOCUMENT`, the correct first move was to tighten instructions so that:

- drawing-set membership is weighted more strongly
- text-heavy/tabular pages can still remain `DRAWING`
- `GENERAL_DOCUMENT` is reserved for pages outside the drawing sheet system
- weak drawing identity should lower confidence and increase review likelihood

This was a prompt-quality problem first, not an architecture-rewrite problem first.

### Architectural implication
When a failure is primarily about:
- classification wording
- field extraction hierarchy
- confidence wording
- page-role definitions

the first fix should usually be:
- prompt tightening
- not deterministic override logic
- not a broad new rule engine

---

## Current Development Order

The current build order is effectively:

1. stabilize intake behavior and user-visible workflow
2. continue tightening intake accuracy
3. improve drawing identity extraction
4. add re-run intake capability for existing uploads
5. add speed-enabling spec routing
6. preserve and refine fallback coverage
7. optimize speed and cost more aggressively
8. polish UI/customer presentation

Important current learning:

- the system can now process real manuals/spec books and drawings end to end
- intake state is now visible and live during processing
- some books expose enough structure to bypass a lot of heavy discovery work
- the next highest-value gains are now split between:
  - prompt/accuracy refinement
  - retest workflow improvements
  - fast-path assessment and routing
- ugly/no-structure books still require the fallback path

---

## Vision Architecture Direction

Vision is no longer just piggybacking on OCR ownership.

### Current state
- page images are rendered independently
- page images are persisted locally
- page images are sent to the OpenAI model
- image generation is its own stage

### Target state
Page image generation should become increasingly route-driven and reusable.

That allows:

- consistent image availability by routing policy
- drawing pages to get vision even when OCR is skipped
- future agents to reuse page images
- cleaner separation between image generation and OCR

---

## OCR Architecture Direction

OCR remains a supporting evidence source, not the central understanding engine.

Current OCR behavior:

- route-aware candidate selection
- PRIMARY and ESCALATION tiers
- selective OCR based on native extraction weakness
- OCR results fed back into PreparedPage evidence

Target OCR behavior:

- persistent OCR worker reuse
- cleaner throughput tuning
- improved cost/speed discipline
- escalation policies that remain selective and trustworthy

---

## Performance Architecture Direction

The current system is functional but not yet optimized.

Performance work must preserve accuracy and future-agent reuse.

The current speed rule is:

**Do not optimize the wrong stage at the wrong time.**

Immediate next speed gains should still come from:

- using trustworthy document structure when present
- reducing unnecessary heavy-path work
- token budgeting
- route-aware chunk sizing
- TPM-aware retry/backoff
- reduced payload bloat for long spec/manual runs
- selective image/OCR usage
- adaptive batching

Important current addition:

User-visible responsiveness is now part of performance architecture.

That means:
- immediate start response
- persisted processing state
- stage visibility
- live refresh during intake

are valid architecture improvements even when deep runtime is still high.

---

## Relationship / Continuity Direction

Broader page-relationship understanding is now a first-class architecture area.

Future relationship understanding should support:

- multi-page packet continuity
- spec section continuity
- section boundaries
- TOC reconciliation
- drawing index reconciliation
- duplicate sheet detection
- sequence anomalies
- likely missing sheets
- grouped discipline views
- future addendum/version comparisons

This should remain AI-driven, with deterministic code used only to validate shape, preserve consistency, enforce trust, and exploit clear structural shortcuts.

---

## Estimator Experience Requirements

MittenIQ must remain:

- simple
- obvious
- low-friction
- trustworthy

The system should not force estimators to understand internals.

The UI should clearly answer:

- Is this file trustworthy enough?
- What kind of pages or sections are here?
- What is each page or section actually called?
- What needs review?
- What later tools can use this intelligence?
- Why is this taking so long if the file is large?
- Is intake still actively moving?

The user’s real-world expectation is that:

- large structured spec books should eventually move faster than ugly unstructured books
- uploads should show live progress
- wrong or duplicate uploads should be removable
- reprocessing should not eventually require repeated reupload forever

Those expectations are reasonable and architecturally supported.

---

## Architectural Non-Goals

MittenIQ intake is not intended to:

- fully estimate the project
- replace later agent workflows
- behave like a giant hardcoded parser
- fake certainty when evidence is weak
- become deterministic-first document intelligence
- force all spec books through one universal lane forever
- keep users blind during long-running intake

Its job is to build reliable project intelligence for later estimating work.