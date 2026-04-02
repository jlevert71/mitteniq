# MittenIQ Spec Intake V2 Architecture Plan

## Purpose

This document defines the new **Spec Intake V2** direction for MittenIQ.

The goal is to make specification intake **commercially viable in speed** while preserving trust and setting up downstream agent workflows.

This architecture replaces the idea of treating spec books as documents that must be deeply AI-read page by page before useful output can be shown.

Instead, the new model is:

**fast structural indexing first, selective AI second, deep intelligence in the background**

---

## Primary Product Goal

Spec intake should return a **usable, organized intake report quickly**.

Target experience:

* ~400-page spec book: ideally ~2–4 minutes
* ~1000-page spec book: ideally ~5–8 minutes
* deeper intelligence can continue after the intake report is already visible

The estimator should not have to sit idle waiting for full semantic analysis of an entire book before seeing useful structure.

---

## Core Product Shift

### Old model

Upload PDF
→ extract text / OCR / images
→ AI reads large portions of the book
→ intake report appears

### New model

Upload PDF
→ extract structural document map fast
→ show section-based intake report quickly
→ continue deep scan in background for later agents

This changes intake from a **full-document interpretation pass** into a **fast structural indexing pass plus delayed enrichment**.

---

## Key Design Principles

### 1. Specs are hierarchical documents

Most specification books already contain structure such as:

* PDF bookmarks / outline
* table of contents
* section numbers
* repeated headers
* repeated formatting conventions
* blank/divider pages
* appendices / attachments / reports

The system should exploit this hierarchy before escalating to AI interpretation.

### 2. AI should be used for uncertainty, not for everything

AI should handle:

* mismatches
* missing section starts
* mixed-content pages
* weird attachments
* poor extraction cases
* nonstandard books

AI should not be the default parser for every page in a normal spec book.

### 3. Intake output for specs should be section-first, not page-first

The primary user-facing intake report for specifications should organize pages under sections rather than showing a flat page list.

### 4. Background intelligence is part of the product model

The system should separate:

* **fast structural readiness**
* **deeper downstream intelligence**

This allows the estimator to begin working while deeper scanning continues for later agent functions.

---

## V2 Pipeline Overview

### Phase 0 — File facts and quick PDF signals

Purpose:
collect deterministic file facts quickly and prepare the spec pathway decision.

Outputs:

* page count
* page size distribution
* searchable vs raster-heavy likelihood
* outline/bookmark existence
* text density summary
* likely document family: spec-heavy / mixed / drawing-heavy

Notes:

* This phase remains deterministic.
* This phase should be very fast.

---

### Phase 1 — Fast structural indexing

This becomes the new core of spec intake.

#### Lane A — PDF outline / bookmark extraction

If the PDF contains bookmarks, extract:

* title
* target page
* hierarchy level
* normalized section candidates

Possible outcomes:

* strong structural map available immediately
* partial outline available
* outline exists but is weak / noisy / generic
* no outline present

If strong enough, outline becomes a primary evidence source.

#### Lane B — Table of contents detection and parsing

Detect likely TOC pages using signals such as:

* "table of contents"
* dotted leaders
* section number patterns
* repeated title + page number lines
* division / section formatting

Parse TOC into entries:

* section number
* section title
* reported page label or target page
* source confidence

#### Lane C — Lightweight body-page header scan

Perform a fast scan across all pages using lightweight extraction only.

Extract candidate signals such as:

* section number near page top
* section title near page top
* page labels
* repeated header/footer text
* blank-page markers
* document class hints
* obvious attachment classes such as geotechnical / boring logs / wage determination / appendices

Important:
This is not a full AI semantic pass.
It is a lightweight structural header scan.

#### Lane D — Reconciliation engine

Build a first section map by reconciling:

* outline evidence
* TOC evidence
* body-header evidence

For each candidate section, determine:

* section number
* section title
* start page
* estimated end page
* confidence
* source used
* review status

This produces the first useful spec structure for the intake report.

---

## Phase 2 — Section-first intake report

The intake report should return as soon as the structural index is ready.

### New report model

Instead of a flat page-by-page spec list, show:

* collapsible section tiles
* grouped by division or document family where appropriate
* page ranges inside each section
* confidence and source tags

Example:

* Division 00 – Procurement / Contracting

  * 00100 Summary of Work
  * 00200 Instructions to Bidders
* Division 26 – Electrical

  * 260500 Common Work Results for Electrical
  * 260519 Low-Voltage Conductors
  * 260526 Grounding and Bonding
* Other / Attachments

  * Wage Determination
  * Geotechnical Report
  * Soil Boring Logs

### Tile contents

Each tile should be able to show:

* section number
* section title
* start page
* end page
* page count
* confidence
* source used (OUTLINE / TOC / BODY / MIXED)
* review flag if needed

### Why this UI is better

It:

* gives the estimator useful organization quickly
* aligns directly with downstream agent workflows
* reduces the importance of showing every spec page individually up front
* allows uncertain areas to be surfaced without overwhelming the user

---

## Phase 3 — Exception routing

After the quick structural map is built, route only uncertain areas to AI.

AI review targets may include:

* unmatched TOC entries
* conflicting section starts
* duplicate or missing section numbers
* strange content near end of book
* mixed pages with charts/images/photos
* low-text or bad-extraction pages
* unlabeled appendices or attachments
* unexpected content clusters not represented in TOC/outline

This means AI volume becomes proportional to document weirdness, not total page count.

---

## Phase 4 — Background deep scan

After the intake report is visible, background jobs continue building project intelligence.

### Background jobs may include

#### Structural refinement

* verify section boundaries more deeply
* refine end-page accuracy
* identify subsection patterns
* classify attachment regions more precisely

#### Bid intelligence

* bid dates
* prebid meetings
* bonding requirements
* insurance requirements
* procurement rules
* compliance language
* AIS / BABA / domestic content constraints

#### Electrical intelligence

* approved manufacturers
* wire and conduit requirements
* grounding requirements
* special installation requirements
* controls / systems references

#### Cross-document preparation

* section tagging for downstream agents
* project intelligence storage
* future linking to drawings and scope review

### User experience model

The intake report can show statuses such as:

* Structure Ready
* Deep Scan Running
* Bid Review Signals Ready
* Manufacturer Extraction Ready

That gives the user immediate usability while allowing the platform to continue working.

---

## Proposed Spec Data Model

The current page-first model should remain internally available, but the spec-facing report and downstream workflows should become section-first.

### New primary entity: SpecSection

Suggested fields:

* id
* uploadId
* sectionNumber
* sectionTitle
* normalizedSectionNumber
* startPage
* endPage
* pageCount
* confidence
* sourceUsed
* status (`VERIFIED`, `LIKELY`, `REVIEW_REQUIRED`)
* documentFamily (`SPEC`, `ATTACHMENT`, `GEOTECH`, `WAGE`, `APPENDIX`, etc.)
* notes

### SpecSectionSourceEvidence

Suggested fields:

* specSectionId
* sourceType (`OUTLINE`, `TOC`, `BODY_HEADER`, `AI`, `MIXED`)
* sourceValue
* matchedPage
* confidence
* details

### SpecException

Suggested fields:

* uploadId
* exceptionType
* startPage
* endPage
* reason
* severity
* resolutionStatus
* aiReviewRequired

### AttachmentRegion / DocumentRegion

Suggested fields:

* uploadId
* regionType
* startPage
* endPage
* title
* confidence
* notes

---

## Fast-Path Decision Tree

### Case 1 — Strong outline present

Use outline as primary structural map.
Then verify starts lightly using body-header scan.
Escalate only mismatches.

### Case 2 — No outline, strong TOC present

Use TOC as primary structural map.
Verify starts using body-header scan.
Escalate only missing/conflicting entries.

### Case 3 — Weak TOC, strong body formatting

Infer sections from repeated section headers.
Use AI only for unclear transitions.

### Case 4 — Weird/nonstandard spec book

Escalate more of the book to AI exception review.

This makes AI effort scale with weirdness, not just page count.

---

## Treatment of Blank Pages and Divider Pages

Blank pages should be detected cheaply.
They should usually:

* not appear as first-class report entries
* not consume AI budget unless they affect continuity
* be stored internally for completeness if needed

Divider pages may be useful for structure but should still be treated as lightweight signals, not high-cost AI targets by default.

---

## Why This Architecture Can Hit Speed Targets

The current bottleneck exists because too many pages are being semantically packaged for AI.

This architecture avoids that by:

* using outline data if available
* using TOC as a structural hypothesis
* using lightweight body-header scanning
* delaying deep interpretation
* routing only exceptions to AI

That should dramatically reduce:

* request count
* repeated prompt overhead
* token volume
* wall-clock time for initial intake readiness

---

## Recommended Build Order

### Step 1 — Add outline/bookmark extraction

Add explicit extraction and storage of PDF outline/bookmark data.

### Step 2 — Add TOC detection and TOC parser

Build a lightweight parser for TOC pages and normalized entries.

### Step 3 — Add lightweight body-header scan

Scan all pages for structural section signals without full AI interpretation.

### Step 4 — Build reconciliation engine

Merge outline + TOC + body evidence into a section map.

### Step 5 — Add SpecSection persistence model

Persist section-first outputs for specs.

### Step 6 — Redesign intake report UI for collapsible section tiles

Show structure-first report instead of flat page list.

### Step 7 — Add exception routing to AI

Only unclear areas go to AI review.

### Step 8 — Add background deep-scan job model

Allow later intelligence extraction to continue after the intake report appears.

---

## Success Criteria

Spec Intake V2 is successful when:

* the intake report becomes usable quickly
* spec books are organized by section rather than flat pages
* the user can begin work before all deep scanning is complete
* AI usage is reserved for uncertainty and enrichment
* later agents can consume section-based project intelligence directly
* runtime becomes commercially viable

---

## Final Product Positioning

MittenIQ should not treat specs like generic unstructured documents.

It should treat them as:

* hierarchical technical books
* with known structure
* with predictable verification opportunities
* and with selective need for AI interpretation

That is the path most likely to deliver both:

* speed
* trust
* and downstream usefulness for later agents.
