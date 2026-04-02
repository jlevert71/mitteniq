# docs/DECISIONS.md

# Architectural Decisions Log

Last updated: 2026-03-19

Purpose:  
Record durable product and engineering decisions that should not be casually reversed.

Only confirmed decisions belong here.

---

## 2026-03-02 — Intake Gates Downstream Features

Decision:  
Uploaded documents must pass intake processing before downstream workflows are available.

Status:  
ACTIVE

Reason:  
Prevents unreliable data from feeding later estimating workflows.

---

## 2026-03-02 — Incremental Build Strategy

Decision:  
MittenIQ will be built through small, verifiable steps instead of large speculative rewrites.

Status:  
ACTIVE

Reason:  
Reduces breakage and makes architectural pivots safer.

---

## 2026-03-02 — Documentation Is Project Memory

Decision:  
Repository documentation is the authoritative continuity layer rather than chat history.

Status:  
ACTIVE

Reason:  
The project will span many sessions and architectural changes.

---

## 2026-03-02 — Simplicity-First User Experience

Decision:  
MittenIQ must remain usable by non-technical estimators and office staff with minimal training.

Status:  
ACTIVE

Reason:  
Target users are construction people, not software people.

Impact:  
Workflow clarity beats feature density.

---

## 2026-03-03 — Agents Are Project Scoped

Decision:  
Agents exist inside projects, not as global tools.

Status:  
ACTIVE

Impact:  
Route pattern remains project-based.

---

## 2026-03-03 — Upload Pipeline Uses Presigned R2 Uploads

Decision:  
Files upload directly to Cloudflare R2 via presigned URLs.

Status:  
ACTIVE

---

## 2026-03-03 — Analyzer Persists Page-Level Results

Decision:  
Intake analysis persists page-level results to the `Sheet` table.

Status:  
ACTIVE

Reason:  
Downstream workflows need durable page-level intelligence.

Important note:  
`Sheet` is currently the active persistence layer even though it now stores broader page intelligence than drawing sheets alone.

---

## 2026-03-05 — Purchased Functions Panel Is the Current Report Hub

Decision:  
Project reports are currently accessed through the Purchased Functions area.

Status:  
ACTIVE

Important note:  
This is a current product/UI decision, not a reason to couple agent intelligence to localStorage forever.

---

## 2026-03-06 — Server-Side Extraction Uses `pdf-parse`

Decision:  
Server-side PDF extraction uses `pdf-parse` in the current build.

Status:  
ACTIVE

Reason:  
This proved more workable in the current server environment than the earlier approach.

Important note:  
This does not mean `pdf-parse` alone is considered sufficient for long-term document understanding.

---

## 2026-03-07 — Construction Document Understanding Must Not Depend on Strict Geometry

Decision:  
The system must continue functioning even when positional text extraction is incomplete or unreliable.

Status:  
ACTIVE

Reason:  
Real-world bid packages vary too much for positional extraction to serve as the main understanding engine.

Impact:  
Layout hints are supporting evidence, not the primary brain.

---

## 2026-03-08 — Intake Uses Chat Completions API

Decision:  
The intake LLM integration uses the Chat Completions API.

Status:  
ACTIVE

---

## 2026-03-08 — Intake Is AI-First for Document Understanding

Decision:  
MittenIQ intake is officially AI-first for document understanding.

Status:  
ACTIVE

Reason:  
Construction document variation is too broad for deterministic interpretation logic to remain the architectural center.

Impact:  
Code is limited to:
- evidence preparation
- validation
- persistence
- trust controls
- UI/plumbing
- permissions

AI owns document meaning.

---

## 2026-03-08 — Intake / Setup Is the First AI Project-Understanding Pass

Decision:  
Intake is not merely sheet detection. It is the first AI pass that builds reusable project intelligence for later agents.

Status:  
ACTIVE

Reason:  
The product is a platform of estimating agents, not a single-purpose parser.

---

## 2026-03-08 — Review-Required Is Preferred Over Fake Certainty

Decision:  
When the system cannot support a confident answer, it should escalate rather than force a guess.

Status:  
ACTIVE

Reason:  
Transparency is more important than pretending the system knows more than it does.

---

## 2026-03-08 — Intake Must Capture Signals Useful to Later Agents

Decision:  
Intake must produce reusable project intelligence that later agents can query instead of repeatedly re-reading the same files.

Status:  
ACTIVE

Reason:  
Future value depends on reusable intelligence, not repeated one-off prompting.

Impact:  
Expensive work should produce reusable outputs.

---

## 2026-03-09 — Hybrid Page Evidence Pipeline Is Required

Decision:  
MittenIQ intake will use a hybrid evidence pipeline combining native text, OCR, images, layout hints, and file facts before AI interpretation.

Status:  
ACTIVE

Reason:  
No single evidence source is reliable enough across real bid packages.

---

## 2026-03-09 — Routing Will Direct Pages Toward Spec-Oriented vs Drawing-Oriented Analysis

Decision:  
MittenIQ will use routing to direct likely text/spec pages and likely drawing pages toward different preparation and analysis behavior.

Status:  
ACTIVE

Reason:  
Different page types need different evidence strategies for both speed and accuracy.

---

## 2026-03-09 — 8.5 x 11 Is a Strong Hint Toward Spec/Text Paths

Decision:  
8.5 x 11 pages should generally be treated as spec/text-document candidates unless evidence suggests otherwise.

Status:  
ACTIVE

Important note:  
This is a strong hint, not an absolute rule.

---

## 2026-03-09 — 11 x 17 and Larger Is a Strong Hint Toward Drawing/Vision Paths

Decision:  
11 x 17 and larger pages should generally be treated as drawing candidates unless evidence suggests otherwise.

Status:  
ACTIVE

Important note:  
This is a strong hint, not an absolute rule.

---

## 2026-03-09 — Drawing Pages Should Lean on Vision + OCR + Native Text Together

Decision:  
Drawing understanding should rely on combined evidence rather than title-block regex logic.

Status:  
ACTIVE

Reason:  
Drawing identity depends heavily on visual structure and title-block evidence.

---

## 2026-03-09 — Suspicious Spec Pages Should Get Deeper Inspection Before Human Escalation

Decision:  
Ambiguous or abnormal spec/document pages should receive deeper AI inspection before immediately defaulting to human review.

Status:  
ACTIVE

Reason:  
Some pages that look weak to extraction can still be understood when image evidence is used.

---

## 2026-03-09 — Drawing-Like Pages Missing Reliable Identity Should Favor Review

Decision:  
If a page appears drawing-like but reliable identity cannot be supported, trust should be reduced and review should be favored.

Status:  
ACTIVE

Reason:  
Drawing pages usually carry stronger identity evidence than ordinary text pages.

---

## 2026-03-13 — Page Image Generation Must Be Decoupled from OCR

Decision:  
Page image generation is now officially considered its own pipeline responsibility and must be separated from OCR ownership.

Status:  
ACTIVE

---

## 2026-03-13 — Router Must Become a First-Class Pipeline Stage

Decision:  
Routing logic must be promoted from embedded heuristics into a formal pipeline stage.

Status:  
ACTIVE

---

## 2026-03-13 — OCR Is a Supporting Evidence Layer, Not the Main Understanding Engine

Decision:  
OCR must remain a selective supporting evidence layer.

Status:  
ACTIVE

---

## 2026-03-13 — Rate-Limit Resilience Is an Architecture Requirement

Decision:  
TPM-aware retry/backoff, payload control, and chunking discipline are required architecture.

Status:  
ACTIVE

---

## 2026-03-14 — Analyze Route Must Be a Thin Entrypoint

Decision:  
Analyze route should be an API entrypoint, not the intake implementation.

Status:  
ACTIVE

---

## 2026-03-14 — Page Image Generation Is an Independent Pipeline Stage

Decision:  
Page image generation is its own stage.

Status:  
ACTIVE

---

## 2026-03-14 — Router Computes File Default + Page Overrides

Decision:  
Routing includes file default and per-page override behavior.

Status:  
ACTIVE

---

## 2026-03-14 — OCR Fallback Must Be Route-Aware

Decision:  
OCR selection is route-aware with PRIMARY and ESCALATION tiers.

Status:  
ACTIVE

---

## 2026-03-15 — Deterministic Layers Must Be Non-Obstructive to AI

Decision:  
Deterministic code must not constrain AI interpretation.

Status:  
ACTIVE

---

## 2026-03-15 — AI Owns Continuity and Relationship Reasoning

Decision:  
Continuity reasoning remains AI-driven.

Status:  
ACTIVE

---

## 2026-03-17 — Heavy AI/OCR Intake Path Remains Required Fallback

Decision:  
Heavy path remains necessary fallback coverage.

Status:  
ACTIVE

---

## 2026-03-17 — Spec Fast Paths Are Additive, Not Replacements

Decision:  
Fast paths augment but do not replace fallback.

Status:  
ACTIVE

---

## 2026-03-17 — Fast-Path Eligibility Is Structure-First

Decision:  
Eligibility is based on structure, not CSI-only.

Status:  
ACTIVE

---

## 2026-03-17 — Bookmark-Based Outline Extraction Is Approved

Decision:  
pdfjs outline extraction is a valid fast-path foundation.

Status:  
ACTIVE

---

## 2026-03-17 — Multi-Profile Outline Normalization Is Required

Decision:  
Support CSI, MDOT, ARTICLE, GENERIC profiles.

Status:  
ACTIVE

---

## 2026-03-17 — Intake Work Comes Before New Features

Decision:  
Focus remains on intake stabilization and routing.

Status:  
ACTIVE

---

## 2026-03-19 — Upload Deletion Uses RESTful DELETE Route

Decision:  
Uploads are deleted via `DELETE /api/uploads/[uploadId]`.

Status:  
ACTIVE

Reason:
- aligns with REST patterns
- reuses ownership pattern from GET
- avoids duplicate logic routes

---

## 2026-03-19 — Upload Deletion Order Is DB First, Then R2

Decision:  
Delete DB record first, then delete R2 object.

Status:  
ACTIVE

Reason:
- prevents broken DB references
- orphaned storage is safer than orphaned DB rows

---

## 2026-03-19 — Upload Deletion Is Blocked While Processing

Decision:  
Uploads in `PROCESSING` state cannot be deleted.

Status:  
ACTIVE

Reason:
- avoids race conditions with detached intake execution
- avoids introducing job cancellation complexity prematurely

---

## 2026-03-19 — No Intake Re-Run Yet

Decision:  
Re-run intake is intentionally not implemented yet.

Status:  
ACTIVE

Reason:
- avoid expanding scope during intake stabilization phase
- focus remains on correctness and architecture first

---

## 2026-03-19 — Drawing Classification and Drawing Identity Are Separate Problems

Decision:  
Drawing page classification and drawing identity extraction are treated as separate improvement areas.

Status:  
ACTIVE

Reason:
- classification is mostly working
- identity extraction still fails independently
- combining fixes leads to unstable behavior

---

## 2026-03-19 — Title Block Interpretation Remains AI-Driven

Decision:  
Do not introduce deterministic title-block parsing logic.

Status:  
ACTIVE

Reason:
- title blocks vary too widely across real drawings
- brittle parsing would regress long-term reliability
- fixes should come from better prompts and evidence weighting

---

## 2026-03-19 — Upload List Refresh Uses Existing Load Pattern

Decision:  
UI refresh after delete uses existing `loadProject()`.

Status:  
ACTIVE

Reason:
- avoids introducing new state or polling systems
- keeps UI behavior simple and consistent