# MittenIQ Intake Page Schema v2

Last updated: 2026-03-13

Purpose:
Define the structured output contract for AI page understanding during intake.

This schema is intended to support:
- predictable validation
- consistent storage
- review-required behavior
- future agent reuse

This document reflects current architecture direction and removes older transitional framing that no longer matches the plan.

---

## Architectural Principle

MittenIQ intake follows this pattern:

upload  
→ deterministic evidence preparation  
→ AI page understanding  
→ deterministic trust verification  
→ persistence  
→ estimator-facing output and future agent reuse

Code does not own page meaning.  
AI owns page meaning.

Code owns:
- preparation
- validation
- persistence
- trust controls
- UI/plumbing
- permissions

---

## AI Execution Model

During intake, AI reviews every page.

For each page, the system provides a prepared evidence bundle that may include:
- file facts
- route hints
- native text
- OCR text
- page image
- layout hints
- extraction warnings

For each page, AI must return a structured object matching this schema.

---

## Page Object

Example:

```json
{
  "pageNumber": 12,
  "pageClass": "DRAWING",
  "pageSubtype": "ELECTRICAL_PLAN",
  "sheetNumber": "E101",
  "sheetTitle": "FIRST FLOOR LIGHTING PLAN",
  "discipline": "ELECTRICAL",
  "sectionNumber": null,
  "sectionTitle": null,
  "electricalRelevance": true,
  "confidence": 0.94,
  "reviewRequired": false,
  "evidence": "Sheet number E101 is visible in the title block."
}

## Required Fields
pageNumber

Type: integer

The PDF page number.

pageClass

Type: string

Allowed values:

DRAWING

SPECIFICATION

BID_DOCUMENT

GENERAL_DOCUMENT

BLANK_PAGE

Meaning:

DRAWING = engineering/construction drawing page

SPECIFICATION = spec/manual/spec-style page

BID_DOCUMENT = procurement/front-end/legal/bid page

GENERAL_DOCUMENT = non-blank page not better classified elsewhere

BLANK_PAGE = intentionally blank or effectively blank page

pageSubtype

Type: string

Flexible semantic subtype.

Examples:

TITLE_SHEET

DRAWING_INDEX

ELECTRICAL_PLAN

LIGHTING_PLAN

POWER_PLAN

DETAIL_SHEET

RISER_DIAGRAM

SCHEDULE_SHEET

SPEC_SECTION

SPEC_SECTION_START

SPEC_SECTION_CONTINUATION

PROJECT_MANUAL_INDEX

BID_FORM

INSTRUCTIONS_TO_BIDDERS

GENERAL_CONDITIONS

This field should remain flexible rather than locked to a tiny enum.

confidence

Type: number
Range: 0.0 to 1.0

Confidence must reflect actual evidence quality.

Rule of thumb:

0.90 to 1.00 = stronger confidence

below 0.90 = generally review-required

low confidence is acceptable

inflated confidence is not acceptable

reviewRequired

Type: boolean

Indicates whether this page should go to human review.

General rule:

if confidence is below roughly 0.90, this should usually be true

drawing-like pages missing reliable identity should usually be true

evidence

Type: string or null

Short factual explanation tied to the strongest supporting clue.

Examples:

"Sheet number E101 is visible in the title block."

"Section 26 05 19 appears in the header."

"Page reads Instructions to Bidders near the top."

Keep this concise.

## Optional / Contextual Fields
sheetNumber

Type: string or null

Used when the page is drawing-like and sheet identity is supportable.

sheetTitle

Type: string or null

Used when the page is drawing-like and title is supportable.

Important rule:
Do not force a title when evidence looks like a body note, keyed note, or instruction phrase instead of a real drawing title.

discipline

Type: string or null

Examples:

ELECTRICAL

ARCHITECTURAL

MECHANICAL

PLUMBING

CIVIL

STRUCTURAL

Only return when supported.

sectionNumber

Type: string or null

Used for spec-style pages when supported.

Example:

26 05 19

sectionTitle

Type: string or null

Used for spec-style pages when supported.

Example:

LOW-VOLTAGE ELECTRICAL POWER CONDUCTORS AND CABLES

electricalRelevance

Type: boolean or null

Meaning:

true = clearly relevant to electrical estimating/scope

false = clearly not relevant

null = uncertain

This is important for later agent workflows.

## Output Behavior Rules

AI should:

prefer null over guessing

avoid inventing drawing identity

avoid generic titles unless clearly correct

keep evidence concise

stay conservative when signals conflict

use image evidence when available

use OCR and native text together when helpful

## Review / Trust Rules

MittenIQ should generally treat:

confidence below roughly 0.90

drawing pages missing reliable identity

weak evidence pages

route/output mismatch pages

as review-worthy conditions.

Human verification should raise trust where needed.

## Storage Intent

Current direct mappings include:

pageNumber → Sheet.pageNumber

sheetNumber → Sheet.sheetNumber

sheetTitle → Sheet.sheetName

discipline → Sheet.discipline

sectionNumber → Sheet.sectionNumber

sectionTitle → Sheet.sectionTitle

Other information may remain in report JSON and later richer storage layers as the architecture evolves.

## Future-Agent Design Requirement

This schema is not just for intake display.

It exists so later agents can query reliable page intelligence and avoid repeated blind document rereads.

Future additions may later include richer content signals, but the system should avoid bloating the schema prematurely before the architecture around reuse is nailed down.