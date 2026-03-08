# MittenIQ Roadmap

Last updated: 2026-03-05

---

## Core Purpose (Confirmed)

MittenIQ exists to reduce the time and cost required to prepare construction estimates by removing the minutiae involved in setting up an estimate.

The system is intended to:
- Serve as an accurate and trustworthy resource for examining project specifications
- Save estimator time so effort can focus on higher-value work
- Reduce operational cost compared to traditional estimating workflows
- Remain simple, reliable, and visually clean with a modern contractor-focused design

Primary problem addressed:

Time inefficiency and cost overhead in estimate preparation.

---

## Product Direction (Confirmed)

MittenIQ is being shaped around a small number of meaningful purchased functions rather than a large number of tiny chargeable buttons.

Confirmed UX direction:
- Users work inside a **project-scoped workspace**
- Agents are accessed from the top of the project page
- Purchased work products are accessed from a **Purchased Functions** report hub
- Uploads remain visible, but report access is intentionally centered in the Purchased Functions area
- Savings/efficiency telemetry should remain compact and supportive, not dominant

Confirmed monetization/UI principle:
- Avoid nickel-and-dime function design
- Combine related capabilities into meaningful purchases
- HITL checkpoints are embedded in workflow logic, not sold as separate review functions
- Low-confidence handling belongs inside the relevant function, not as a separate purchased tile

---

## Phase 1 — Project Intake & Setup (Confirmed Active Direction)

### Goal
Provide a complete, trustworthy project setup workflow that removes manual effort required before estimating begins.

### Current Primary Workflow
1. User creates a project
2. User uploads construction documents
3. System performs intake analysis
4. System generates initial sheet setup/classification output
5. Reports are accessed through the Purchased Functions hub
6. Project becomes progressively more ready for downstream estimating work

## Intake Engine Roadmap added 3-7-2026

Phase 1
Upload pipeline
PDF extraction

Phase 2
Page evidence extraction

Phase 3
Document structure inference

Phase 4
Cross-sheet reasoning

Phase 5
Specification intelligence (NEXT)

Phase 6
Layout-aware extraction improvements

### Current Meaningful Purchased Function
**Intake + Sheet Setup**

This combined function currently represents:
- File intake analysis
- PDF usability checks
- Searchability / raster-heavy checks
- Page count heuristics
- Print-size detection and mixed-size warnings
- Initial sheet record generation
- Initial sheet classification / scale-status seed data
- Intake report + sheet setup summary combined on the Intake page

### Value Delivered
- Prevents bad files from contaminating downstream work
- Gives the user immediate visibility into file trustworthiness
- Creates per-sheet structure for future review and measurement workflows
- Establishes a report hub pattern for all later functions

### Success Criteria
A user uploads files, purchases Intake + Sheet Setup, and receives:
- a usable intake report
- print-size information
- initial sheet setup output
- a clear path back to the project report hub

---

## Phase 1.1 — Project Report Hub (Confirmed Active Direction)

### Goal
Make the Purchased Functions panel the main place where users retrieve outputs from paid work.

### Current Behavior
- Agent strip appears across the top of the project workspace
- Purchased Functions panel is the primary focus area
- Upload panel is secondary
- Upload list is minimal/status-only
- Report access is centered in Purchased Functions rather than scattered through upload rows

### Why this matters
The project workspace should feel like:
- upload inputs go in one place
- completed paid outputs come back to one place

This keeps workflow understandable and prevents the page from turning into a cluttered file browser.

### Success Criteria
A user can:
- identify purchased functions quickly
- open resulting reports from one obvious location
- avoid confusion about where output lives

---

## Phase 1.2 — Drawing Organization (Confirmed Direction, Not Yet Complete)

### Goal
Automatically organize uploaded files into a clean project structure and reduce document chaos before estimating begins.

### Current intended function scope
- Detect drawing sets
- Detect spec manuals
- Detect addenda
- Detect revisions
- Detect duplicate files
- Detect version indicators
- Organize project files into a clear structure

### Design intent
This should be sold as a meaningful standalone outcome, not broken into small sub-buttons.

### Value Delivered
- Eliminates manual sorting work
- Reduces estimator setup friction
- Creates a trustworthy project organization baseline

### Current status
Direction confirmed. Implementation not yet complete.

---

## Phase 1.3 — Specification Intelligence (Confirmed Direction, Not Yet Complete)

### Goal
Turn specification manuals into structured, searchable project intelligence.

### Current intended function scope
- Identify specification sections
- Extract division structure
- Identify electrical and electrical-related sections
- Extract approved manufacturers
- Extract product requirements
- Extract installation requirements
- Detect substitution clauses
- Produce summary findings

### Design intent
This should also be a meaningful standalone purchase, not a collection of tiny separate buttons.

### Value Delivered
- Makes specs easier to trust and navigate
- Supports downstream workflows like RFQ and scope verification
- Reduces time wasted searching manually through long manuals

### Current status
Direction confirmed. Implementation not yet complete.

---

## Phase 2 — Trust Layer & Guided Review (Planned Direction)

### Goal
Improve trust in sheet-level and document-level outputs before heavy estimating workflows begin.

### Planned areas
- Better sheet classification
- Better confidence scoring
- Better scale-readiness logic
- Better plain-English explanations for uncertainty
- More meaningful HITL checkpoints embedded at critical workflow points

### Important design rule
Human verification should be embedded where needed. It should not feel like the user is paying simply to “look at things.”

### Current known gap
Current sheet confidence logic is still v0/simple and needs a more real foundation.

---

## Phase 3 — Estimating Assistance (Planned Direction)

### Goal
Begin supporting actual estimating preparation and estimating-adjacent work after trustworthy inputs are established.

### Planned direction
This phase is expected to include larger, meaningful functions rather than many tiny transactions.

Likely characteristics:
- project-aware guidance
- organized spec support
- trustworthy drawing context
- downstream scope assistance
- future estimating workflows tied to validated project setup

### Current status
Direction only. No final function breakdown should be treated as locked yet.

---

## Phase 4 — RFQ / Vendor Workflow (Planned Direction)

### Goal
Support vendor-facing workflow once spec intelligence and project structure are trustworthy.

### Current intended direction
- Read specs
- Extract approved manufacturers
- Match to saved vendor contacts
- Prompt user to verify mappings
- Generate RFQ drafts
- Attach relevant drawings/specs
- Require approval before send
- Track responses

### Important note
This is still a later workflow and should be built on top of strong intake, organization, and spec intelligence.

---

## Project Workspace Design Principles (Confirmed)

### 1. Report hub first
Users should feel that paid outputs return to one obvious place.

### 2. Uploads stay simple
The upload area should be easy to use, but not the center of the product experience.

### 3. Telemetry stays compact
Savings/efficiency metrics should be visible but never overpower the workflow.

### 4. Simplicity over feature sprawl
Do not explode meaningful functions into too many tiny paid interactions.

### 5. Trust before automation
MittenIQ should explain itself clearly, especially when confidence is below 100.

---

## Guiding Principle

MittenIQ builds trust before automation.

Upload → Intake/Setup → Organized understanding → Assistance → Automation