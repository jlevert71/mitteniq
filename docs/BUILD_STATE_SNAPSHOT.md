# docs/BUILD_STATE_SNAPSHOT.md

# Build State Snapshot

Last updated: 2026-03-19

This file records the current verified build state and the immediate development reality.

If memory, chat history, and older docs disagree, use this file as the current-state reference.

---

## Current Big Picture

MittenIQ is operating on a working AI-first intake pipeline.

The live direction remains:

**deterministic code for evidence preparation, structural shortcuts, validation, persistence, routing, and trust  
AI for document meaning, section understanding, continuity reasoning, and downstream estimating intelligence  
persistent project intelligence for future agents**

The current build can process real project manuals, specifications, and drawing-related content locally, persist intake outputs, rewrite `Sheet` rows from those outputs, and now surface live intake state in the project workspace while processing continues in the background.

However, the active reality has become clearer:

**the system is now far enough along that the main work is no longer just “make intake run”  
it is now “make intake trustworthy, responsive, and easier to iterate on”**

This includes:

- continued intake stabilization
- faster user-visible behavior during intake
- better drawing-page understanding
- better sheet identity extraction
- cleaner upload lifecycle behavior
- preserving the AI-first direction while reducing unnecessary user friction

---

## Current Active Priority

The active development priority is still the intake pipeline.

Current practical sequence is now:

1. continue stabilizing intake accuracy and trust
2. improve drawing-path page understanding and sheet identity extraction
3. continue specification-path speed work and structure-aware routing
4. improve throughput and token discipline more aggressively
5. reduce testing friction in the upload/intake workflow
6. continue customer-facing UI cleanup and polish

Important clarification:

- speed is still an active concern
- but not through brute-force concurrency or abandoning the AI-first design
- user-visible responsiveness has improved meaningfully through background intake + live polling
- deeper performance gains still need better routing, lighter payloads, and better token discipline
- the heavy AI/OCR path remains required as fallback coverage

---

## Current Architecture Direction

MittenIQ remains explicitly AI-first.

Current enforced direction:

- deterministic code must not become the main interpreter of document meaning
- deterministic code may use trustworthy document structure to avoid unnecessary AI work
- AI should drive meaning, requirements, continuity, page identity, and downstream estimating intelligence
- code should prepare evidence, extract cheap structural signals, route intelligently, validate output shape, persist results, and enforce trust

The system should increasingly think in this order:

**prepare evidence / structure  
→ route intelligently  
→ AI interpret meaning where needed  
→ enforce trust  
→ persist reusable intelligence  
→ expose live intake state clearly to the user**

Not:

**AI brute-force every page first**  
and not:

**deterministic meaning first → AI constrained afterward**

---

## Verified Working Core

### Local Development

Verified locally:

- app runs
- project list works
- project workspace loads
- upload workflow runs
- analyze route runs
- intake report JSON is produced
- `Sheet` rows are rewritten from intake results
- intake report page renders current persisted results correctly
- project workspace now reflects live intake progress during processing

### Upload / Storage

Verified:

- uploads use Cloudflare R2
- upload completion + analyze flow works locally
- secure file viewing route exists
- upload deletion now works from the project workspace
- deleting an upload removes the `Upload` row and cascades related `Sheet` rows
- R2 object deletion is attempted after successful DB delete
- uploads in `PROCESSING` cannot be deleted

### Intake Processing

Verified in the current codebase:

- file is read from R2
- basic PDF checks run
- print size extraction runs
- page text extraction runs
- PreparedPage objects are built
- router stage runs
- file-level default route is computed
- page-level route overrides are supported
- page images are generated independently of OCR
- OCR can run on selected pages
- OCR is route-aware
- page images can be sent to the OpenAI request
- AI returns structured per-page results
- post-AI normalization runs
- spec sections are grouped
- intake report JSON is assembled
- `Sheet` rows are persisted from AI output

### Intake Execution Model

Verified:

- analyze route no longer waits for the entire intake pipeline before responding
- intake now starts and returns control to the UI immediately
- deeper intake continues in detached/background execution
- project workspace polls for updated upload state while any upload is `PROCESSING`
- uploads automatically flip to `READY` when persisted completion state is written
- live stage transitions are now visible in the uploads list

This is a major behavior improvement from the prior blocking intake model.

---

## Current Upload / Intake Lifecycle Reality

The current live intake flow is now:

upload  
→ R2 write  
→ upload complete  
→ analyze request  
→ persisted `PROCESSING` state set immediately  
→ detached/background intake execution  
→ stage updates persisted during execution  
→ project page polls while processing  
→ final upload update written  
→ `Sheet` rewrite  
→ upload flips to `READY`

Important current architecture note:

- intake is no longer user-blocking at the API response layer
- UI responsiveness is now materially better even though deep processing is still expensive
- the user sees live status updates instead of a stale one-shot state

---

## Current Persisted Intake State

### Upload-level state

Verified persisted upload-level intake fields now include:

- `intakeStatus`
- `intakeStage`
- `intakeDelayReason`
- `intakeError`
- `intakeReport`

Current `intakeStatus` lifecycle:

- `PENDING`
- `PROCESSING`
- `READY`
- `FAILED`

This is now the real source of truth for the project workspace upload list.

### Stage behavior

Verified current live stage model includes coarse stages such as:

- `STARTING`
- `READING_PDF`
- `PREPARING_PAGES`
- `RUNNING_AI`
- `ASSEMBLING_REPORT`
- `COMPLETE`
- `FAILED`

The exact stage values are machine-oriented, but the UI now presents readable stage text during processing.

### Delay reason behavior

Verified:

- uploads can now show a plain-English intake delay reason during `PROCESSING`
- delay reason is derived deterministically from already-computed signals
- no extra AI call is used for this
- examples include:
  - large document
  - large specification book
  - limited searchable text detected
  - OCR required on some pages
  - mixed drawings and specs detected
  - image-heavy drawings

Current limitation:

- delay reason is intentionally simple and single-string
- it is guidance, not a full explanatory system
- it is currently most useful during active processing, not final analysis review

---

## Current Project Workspace Behavior

### Uploads panel

Verified:

- upload rows now show:
  - filename
  - intake status
  - live stage while processing
  - optional delay reason while processing
- long filenames and status layout are stable again
- processing uploads update live without manual refresh
- rows flip to `READY` automatically when background intake finishes
- delete action exists per upload row
- delete is disabled while processing

### Polling behavior

Verified:

- project workspace polls while at least one upload is `PROCESSING`
- polling reuses the existing project/uploads read path
- polling stops when no uploads remain in `PROCESSING`
- this solved the earlier stale-state problem where completed uploads could appear stuck in `PROCESSING`

Current limitation:

- there is still no re-run intake action
- prompt/intake changes still require reupload or a future explicit reprocess action

---

## New Verified UX / Workflow Improvements

The following changes are now verified in the live local build:

### 1. Non-blocking analyze route
- analyze returns immediately after validation/start
- deep intake continues in detached execution
- no longer forces the user to wait on one long request

### 2. Persisted processing state
- `PROCESSING` is now a real persisted intake state
- no longer falls back to misleading `PENDING` after navigation/reload

### 3. Persisted intake stage
- upload rows now track coarse pipeline stage
- stage can be shown in the UI during processing

### 4. Live upload polling
- project workspace keeps upload state fresh during active intake
- rows update from `PROCESSING` to `READY` without manual refresh

### 5. Delay reason
- processing rows can explain, at a high level, why a file may take longer

### 6. Delete upload
- incorrect/test/duplicate uploads can now be removed from the uploads list
- delete is blocked during active processing

These are real workflow improvements, not just code cleanup.

---

## New Verified Fast-Path Proof of Concept

A bookmark-based spec fast-path experiment still exists in proof-of-concept form.

### Verified proof-of-concept modules

- `lib/intake/spec-outline.ts`
- `scripts/test-outline.ts`

### Verified working behavior

For bookmarked PDFs, the system can now:

- load the PDF with `pdfjs-dist`
- call `getOutline()`
- flatten bookmark trees into ordered outline entries
- resolve bookmark destinations to real 1-based PDF page numbers
- derive normalized section/page-range outputs from qualifying bookmark entries

### Verified real-world results

#### Fishbeck large consultant spec manual
Validated on a 946-page project manual/spec book.

Observed result:

- outline entries found: 157
- CSI-style qualifying section ranges found: 154
- electrical sections resolved cleanly
- page ranges inferred cleanly from bookmark order

Example proven output pattern:

- `26 05 00 Common Work Results for Electrical` → pages 651–655
- `26 05 13 Medium-Voltage Cables` → pages 656–659
- `26 50 00 Lighting` → pages 751–755

This proves a real bookmark-based fast spec path exists for at least one major consultant format.

#### MDOT proposal/spec package
Validated on an MDOT proposal/spec PDF.

Observed result:

- outline entries found: 91
- strong structured bookmark tree exists
- CSI-style qualifying section ranges found: 0

Important conclusion:

- the fast-path concept still works structurally
- current CSI parser is the wrong normalizer for MDOT
- MDOT should be treated as its own outline/profile family rather than as a failure case

#### GFA / contract-manual style package
Validated on a GFA-style contract/manual/spec package.

Observed result:

- rich outline tree exists
- hierarchy includes article/section/subsection style entries
- CSI-style qualifying section ranges found: 0

Important conclusion:

- this is also structurally fast-path-capable
- it needs an ARTICLE/manual-style profile, not CSI parsing

### Current conclusion from fast-path testing

The proof of concept still strongly suggests recurring outline families such as:

- CSI consultant manual
- MDOT proposal/spec
- ARTICLE/manual contract books
- later GENERIC outlined documents

The key lesson remains:

**fast-path eligibility should be based on strong trusted structure first, then profile-aware normalization second**

This proof-of-concept is still **not yet integrated into the main intake pipeline**.

---

## Important Current Reality

### Vision Is Structurally Present

This is verified in code.

What exists:

- page rendering to PNG
- image file persistence
- image delivery into `run-ai-intake.ts`
- image-aware prompts sent to OpenAI
- page image generation as its own pipeline stage

What this means:

- image generation is no longer owned by OCR
- future drawing/vision agents have a reusable image layer
- drawing pages can receive image evidence without OCR ownership being in the way

Current limitation:

- image policy is still transitional and should become more explicitly route-driven over time
- image generation is not yet tuned aggressively for runtime cost/speed

### AI Page Intelligence Is Better, But Still Not Stable Enough

This is verified by real test runs against project manuals/spec books and drawing sets.

Observed improvements:

- project manual pages often receive useful names instead of generic `Page X`
- bid/front-end pages are being recognized and named more effectively
- visible document-local labels such as `TOC-1` and `Page 1 of 3` are being surfaced more often
- project workspace now makes intake progress visible while AI is still running
- prompt tightening improved drawing-vs-general classification on at least one recent drawing test file

Important current limitations:

- blank-page handling is still inconsistent
- some PDF pagination artifacts still leak into names
- continuation handling across repeated multi-page forms/documents is still incomplete
- review-needed counts are still too high on some spec/manual runs
- current heavy spec path is still too slow to serve as the universal default
- drawing sheet identity extraction is still not reliable enough on some pages
- some detail/title-block pages still confuse job number/reference number vs true sheet identity

### Structure Can Sometimes Replace Heavy Discovery

This is still a verified architectural reality.

For some large digital spec books, the PDF already exposes enough trustworthy structure through bookmarks that AI does not need to rediscover section boundaries page by page.

This does **not** eliminate AI.

It means:

- AI should reason on sections when structure exists
- AI should fall back to deeper page-level interpretation when structure is weak

---

## Current Intake Pipeline Reality

The current live intake flow is still structurally:

upload  
→ R2 read  
→ PDF checks  
→ print size extraction  
→ page text extraction  
→ PreparedPage build  
→ router stage  
→ page image generation  
→ route-aware OCR  
→ AI page understanding  
→ post-AI normalization / cleanup  
→ spec section grouping  
→ intake report  
→ `Sheet` rewrite

But the user-visible behavior is now different:

analyze request  
→ immediate response  
→ persisted `PROCESSING` state  
→ detached intake continues  
→ stages update  
→ polling keeps UI current  
→ final persisted result surfaces automatically

Important current architecture note:

- the heavy AI/OCR pipeline remains the current live deep path
- the bookmark-based spec fast path is still isolated proof-of-concept code only
- the live product experience is materially better even before fast-path integration because the intake request no longer blocks the user

---

## Current Code Reality

### `app/api/uploads/analyze/route.ts`

Verified current responsibilities:

- auth / request handling
- upload lookup / validation
- processing-state start update
- detached orchestration start
- failure handling / response shaping

Current status:

- intentionally thin
- no longer blocks on full intake completion
- now acts as a start/orchestration trigger rather than a full synchronous intake request

### `lib/intake/run-intake-analysis.ts`

Verified current responsibilities:

- intake orchestration
- R2 read
- PDF checks
- page extraction
- PreparedPage build
- router stage execution
- page image generation stage
- OCR enrichment call
- AI intake call
- intake report assembly
- upload update
- `Sheet` rewrite
- coarse stage updates during processing
- delay-reason derivation and persistence during processing

This remains the primary intake orchestration layer.

### `lib/intake/run-ai-intake.ts`

Verified current responsibilities:

- AI enable/disable gating
- route-aware chunking
- prompt payload building
- page image inclusion in user message content
- OpenAI call execution
- retry/backoff handling for rate limits
- normalization of AI output
- review-flag generation
- non-drawing page-label cleanup
- blank-page forcing / cleanup
- broad non-drawing class cleanup
- spec section grouping trigger

Recent important prompt-level changes:

- DRAWING vs GENERAL classification rules were tightened
- drawing-set membership is now emphasized more strongly
- text-heavy/tabular pages within the drawing sheet system are now more clearly supposed to remain DRAWING
- weak drawing identity is now more explicitly tied to lower confidence and review

Current limitations:

- token budgeting is still not disciplined enough
- chunk shaping is still too blunt for ideal throughput
- spec/manual cleanup is improved but still incomplete
- continuity reasoning is still too weak in some runs
- review calibration is still too noisy
- drawing identity extraction still needs targeted refinement
- this heavy path is still doing too much work for structured spec books that could use a fast path

### `lib/intake/page-images.ts`

Verified current responsibilities:

- independent page rendering to PNG
- image persistence
- image population into PreparedPage
- reusable image artifact generation for downstream AI/agent workflows

Current limitation:

- image selection policy still needs stronger optimization and route-driven tuning

### `lib/intake/ocr.ts`

Verified current responsibilities:

- route-aware OCR candidate selection
- PRIMARY / ESCALATION OCR candidate tiers
- OCR execution via Tesseract
- OCR text population into PreparedPages

Current limitation:

- OCR is structurally cleaner, but still needs performance tuning
- persistent OCR worker reuse is not yet implemented

### `lib/intake/report-mappers.ts`

Verified current responsibilities:

- report preview shaping
- report summary shaping
- sheet-row shaping
- review-page summary shaping
- mapping AI page classes to UI/report-friendly values

Current limitation:

- summary/report shaping is only as good as upstream routing, continuity, page identity, and confidence quality

### `lib/intake/spec-outline.ts`

Verified proof-of-concept responsibilities:

- PDF outline extraction using `pdfjs-dist`
- bookmark flattening
- bookmark destination resolution
- CSI-style section title parsing
- derived section-range construction
- combined outline + section-range result generation for testing

Current limitation:

- not integrated into live intake
- profile handling is still incomplete
- currently proven only for CSI normalization
- needs fast-path assessment and multi-profile normalization next

### `app/api/uploads/[uploadId]/route.ts`

Verified current responsibilities now include:

- secure upload lookup by ownership
- upload JSON fetch
- upload delete action
- delete guard for `PROCESSING`
- post-DB-delete R2 object cleanup attempt

This is now the main upload-by-id API route for both read and delete behavior.

---

## Current Intake Accuracy State

Accuracy is improving and now practically useful on real project-manual/spec-book runs, but it is not yet good enough.

Verified real-world behavior:

- page naming is materially better than earlier runs
- front-end / contract pages are more navigable in the sheet list
- some blank pages are correctly identified
- some title pages, divider pages, and TOC pages are correctly surfaced
- some multi-page form packets still drift in naming
- some PDF page artifacts still leak into labels or titles
- some blank/divider pages still fall through incorrectly
- review-needed counts remain too high for estimator-friendly trust
- drawing-vs-general classification improved on a recent compact drawing test set after prompt tightening
- sheet identity extraction is still too weak on some drawing/detail pages

Current conclusion:

- native extraction alone is not enough
- OCR helps
- page images help
- routing is more deliberate than before
- spec and drawing paths are structurally cleaner than before
- large structured books may allow much cheaper structure-first section mapping
- ugly/no-structure books still require the deeper AI/OCR path
- drawing page classification and drawing page identity extraction are now clearly separate problem areas

---

## Current Performance State

The system is functional but still slower than target.

Observed pain points:

- large files can take significant time to analyze
- specification books remain the biggest performance problem
- OCR is still expensive even when used deliberately
- prompt payloads are still heavier than they should be
- throughput is more stable than before, but still too slow for ideal contractor workflows

### Large Document Capability Confirmed

The intake system has successfully processed large construction document sets.

Validation runs include:

Specification Manual  
- 1232 pages  
- runtime remained very high but completed  
- AI chunk processing completed without outright failure  
- retry/backoff handled TPM pressure

Project Manual / Spec Book  
- 432 pages  
- end-to-end completion successful  
- output improved over repeated same-file iterations  
- review-needed count still not estimator-friendly enough

Compact Drawing Set  
- 13 pages  
- end-to-end completion successful  
- live stage behavior now visible during intake  
- drawing-vs-general classification behavior improved after prompt tightening  
- sheet identity extraction still showed real weaknesses on some pages

### Current Performance Concern

The system now feels more responsive because intake no longer blocks the user request, but deep runtime is still too slow for practical contractor workflows on many larger files.

Important updated conclusion:

The next major speed gains should still come from:

- fast-path eligibility checks
- bookmark/outline-based section mapping where structure exists
- better route selection
- reduced heavy-pass use on structured books
- adaptive chunk sizing
- token budgeting
- reduced payload duplication
- route-aware batching
- OCR worker reuse later
- image/OCR policy tuning later

Not from blindly turning concurrency up.

---

## Current Rate-Limit / TPM Reality

This is still an active architectural concern.

Verified issue:

- large spec books and some drawing runs can still trigger 429 TPM pressure during AI intake

Verified improvement:

- retry logic honors reset timing more correctly
- runs can survive TPM pressure instead of failing outright
- delayed chunks can recover and complete

Current limitation:

- there is still no true token-budgeting helper
- long spec/manual flows still use payloads that are too heavy
- throughput is still poor even though reliability improved
- chunk counts remain too high for text-heavy manuals
- rate-limit delay is now more visible in UX because the system is live-updating during processing

This remains a real blocker for future production-scale intake speed.

---

## Current Review / Trust State

Verified:

- AI confidence threshold logic exists
- review reasons are generated
- review-needed counts are reflected in the report
- route/AI mismatch can influence review behavior
- drawing pages with missing identity can be pushed toward review
- weaker identity confidence now has stronger prompt-level encouragement to lower confidence and require review

Current limitation:

- review/trust logic is still embedded inside `run-ai-intake.ts`
- confidence / review calibration is still too blunt for spec/manual output
- broader relationship-based trust checks are not yet implemented
- there is not yet a first-class persisted review queue system
- many practically correct spec/manual pages still carry review flags
- some drawing pages still miss correct identity extraction before review can help enough

This remains one of the most important cleanup areas.

---

## Current Persistence State

Verified:

- upload-level intake report JSON is persisted on `Upload`
- page-level results are persisted into `Sheet`
- upload-level live intake state now also persists:
  - status
  - stage
  - delay reason
  - errors

Current limitation:

- persistence is sufficient for the current intake report and live upload UX
- schema is still transitional for future agent-scale intelligence
- later structured fields and/or JSON evidence layers will likely be needed
- true page-identity fields beyond legacy `sheetNumber` / `sheetName` are not yet modeled explicitly enough in the database
- fast-path structural intelligence is not yet persisted as first-class project intelligence
- there is still no “re-run intake” capability on an existing upload

---

## Immediate Development Direction

The next architecture/product work should proceed in this general order:

1. continue tightening drawing-page identity extraction
2. continue prompt-level cleanup where classification/extraction errors are clearly instruction-driven
3. add a re-run intake workflow for existing uploads
4. continue fast-path assessment for spec PDFs
5. extend outline normalization beyond CSI to additional profile families
6. test against a small benchmark set of real files
7. wire eligible structured spec books into intake routing
8. preserve heavy AI/OCR fallback for weak/no-outline books
9. continue cleanup of blank/divider handling, packet identity, and review noise
10. then improve chunking, token budgeting, TPM resilience, and throughput discipline more aggressively

Important current change from earlier thinking:

- the product is now getting enough workflow polish that user-facing iteration friction matters
- intake no longer feels dead during long runs
- the next pain is not just runtime but calibration accuracy and developer retest friction

The biggest current problems are now:

- structured spec books are still going through too much heavy analysis
- profile-aware fast-path routing does not exist yet
- drawing sheet identity extraction is still not reliable enough
- re-run intake does not exist yet
- review noise is still too high
- token discipline is still too weak

---

## Future-Agent Readiness Direction

Current intake must support future agents, not just current reporting.

That means the system should increasingly preserve and reuse:

- file facts
- native text
- OCR text
- page images
- route decisions
- page understanding
- review outcomes
- spec grouping
- outline/section structure when available
- fast-path eligibility decisions
- later relationship results
- future TOC/index reconciliation results
- upload lifecycle state that is clear enough for user-facing automation flows

The architecture is better positioned for that than it was before the recent intake cleanup, background-processing changes, and upload lifecycle improvements.

---

## Production Status

Production infrastructure is not the current development focus.

Known separately:

- production login / DB TLS issue remains tracked outside intake architecture work

Local development remains the authoritative environment for ongoing build work.