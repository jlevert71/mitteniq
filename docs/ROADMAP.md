# MittenIQ Roadmap

Last updated: 2026-03-19

---

# Core Purpose

MittenIQ exists to reduce the time, friction, confusion, and mental drag required to prepare construction estimates.

It does that by using AI-driven workflows to handle the tedious setup, document understanding, organization, and review work that estimators currently do manually, inconsistently, or too late.

Primary problem addressed:

**Estimators lose time and accuracy before estimating even really starts.**

MittenIQ is being built to remove that setup burden and turn project documents into usable estimating intelligence.

---

# Product Direction

MittenIQ is a platform of estimating agents.

The platform model is:

Upload Documents  
→ Intake / Setup  
→ Project Intelligence Layer  
→ Agent Workflows  
→ Estimator Decisions

Agents do the reasoning.  
Code handles:

- orchestration
- evidence preparation
- persistence
- trust controls
- review controls
- UI
- workflow plumbing

The goal is not to give users a thousand tiny buttons.

The goal is to give them a small number of meaningful workflows that feel like having capable estimating support staff already in the office.

---

# Product Principles

## 1 — Trust Before Automation

MittenIQ must earn trust before it tries to impress anybody.

It should clearly communicate:

- what it knows
- what it thinks
- what needs review
- where confidence is weak

The system should prefer transparent review-required behavior over fake certainty.

At the same time, review behavior must be calibrated to avoid burying estimators in false-positive noise when the output is already practically useful.

---

## 2 — AI Does the Interpretation

Construction documents vary too much for deterministic parsing logic to be the main reasoning layer.

AI is responsible for:

- page understanding
- document interpretation
- meaning extraction
- packet identity
- section continuity
- document relationship reasoning

Code is responsible for:

- gathering evidence
- orchestrating the flow
- validating output shape
- storing results
- controlling trust and permissions
- supporting UI/workflow behavior

Deterministic code must not materially impede or narrow AI interpretation.

---

## 3 — Intake Must Create Reusable Intelligence

The first pass over the file should not be wasted on a one-off report.

Expensive work done during intake should create reusable project intelligence for later workflows.

That includes reusing:

- file facts
- extracted text
- OCR text
- page images
- routing results
- page-level understanding
- continuity outputs
- grouped structure
- human review outcomes
- future relationship analysis

---

## 4 — Simplicity for Contractors

MittenIQ must remain:

- clean
- obvious
- easy to operate
- not overloaded with technical clutter

Complexity belongs behind the scenes.

---

## 5 — Meaningful Agent Workflows

Users should buy and run meaningful workflows, not a pile of tiny fragmented utilities.

---

# Current Phase — Intake Stabilization & Spec Path First

This is the current active roadmap phase.

## Goal

Make intake trustworthy, predictable, and fast enough to support real contractor workflows.

## Current Reality

- intake runs end-to-end on real files
- system is stable under load (with retry/backoff)
- drawing classification is improving
- drawing identity extraction is still weak
- spec pathway still produces noise and is too slow
- fast-path routing exists conceptually but is not live
- no intake re-run capability yet

## Core Focus Areas

### 1. Specification Pathway (PRIMARY FOCUS)

- section continuity accuracy
- packet identity clarity
- blank/divider detection
- TOC/structure reconciliation (future step)
- reduce review noise
- prepare for fast-path routing

### 2. Drawing Pathway (SECONDARY, BUT ACTIVE)

Now explicitly split into two independent problems:

- **classification (mostly working)**
- **identity extraction (still weak)**

Focus:
- reliable sheet number detection
- reliable sheet title extraction
- correct title-block prioritization
- avoid job number / reference confusion

### 3. Speed (STRUCTURE-DRIVEN, NOT HACKED)

Speed improvements will come from:

- spec fast-path routing (top priority for speed)
- reduced heavy-path usage
- better chunk discipline
- token budgeting (future)
- selective OCR/image usage

**Do not optimize brute-force path prematurely.**

---

# Immediate Development Order

1. harden specification pathway
2. introduce spec fast-path routing (structure-based)
3. fix drawing identity extraction (not classification)
4. improve throughput using routing, not brute force
5. polish UI/customer experience

---

# Phase 1 — Intake / Setup

## Goal

Produce a reliable first AI pass over project documents that makes the project ready for later agent workflows.

## Intake Should Produce

- deterministic file-fact trust report
- page register
- page-level understanding
- continuity-aware document intelligence
- review-required signals
- reusable project intelligence

## Current Intake Pipeline

upload  
→ R2 read  
→ PDF analysis  
→ native text extraction  
→ PreparedPage construction  
→ router stage  
→ page image generation  
→ route-aware OCR  
→ AI page understanding  
→ post-AI cleanup / normalization  
→ spec section grouping  
→ persistence

## Near-Term Additions

- spec fast-path routing (bookmark/structure driven)
- token/payload budgeting
- improved chunking discipline
- better drawing identity extraction
- intake re-run capability

---

# Phase 1.5 — Upload & Workflow Control (NEW)

## Goal

Improve usability and iteration speed during intake development and early user testing.

## Recently Completed

- upload deletion (DB + R2)
- safe delete guard while processing

## Next Additions

- re-run intake without re-upload
- optional “force delete / cancel” (later, not immediate)
- better processing/delay visibility in UI (later)

---

# Phase 2 — Project Organization

## Goal

Automatically organize project documents into a cleaner structure.

Depends on strong intake.

---

# Phase 3 — Specification Intelligence

## Goal

Turn spec books into structured, estimator-usable intelligence.

Depends heavily on spec pathway quality.

---

# Phase 4 — Drawing Intelligence

## Goal

Use intake foundation to support drawing-based workflows.

Now explicitly depends on:

- correct classification (mostly solved)
- correct identity extraction (not solved yet)

---

# Phase 5 — Estimating Assistant

## Goal

Provide real estimating preparation workflows.

Examples:

- scope summaries
- risk surfacing
- bid preparation support

---

# Phase 6 — Higher-Level Estimating Agents

## Goal

Cross-document reasoning and higher-level estimating intelligence.

---

# RFQ / Vendor Workflow Direction

Future phase after reliable spec intelligence:

- manufacturer extraction
- vendor matching
- RFQ drafting
- response tracking

---

# Workspace Direction

## Report Hub First
Outputs remain centralized.

## Upload Simplicity
Uploading must stay easy.

## Clean UI
No cluttered file-manager feel.

## Subtle Telemetry
Helpful, not intrusive.

---

# Long-Term Vision

MittenIQ becomes a system where contractors can:

- drop in project documents
- get organized, trustworthy intelligence
- run estimating workflows without re-reading everything

It should feel:

- organized
- trustworthy
- fast enough
- practical
- useful for real work

---

# Product Model Summary

Upload  
→ Intake / Setup  
→ Project Intelligence  
→ Agent Workflows  
→ Estimator Decisions