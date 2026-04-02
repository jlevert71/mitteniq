# Intake Validation Log

Purpose:
Track how accurately the MittenIQ intake engine interprets real bid document packages.

This document is used to prevent overfitting the intake system to a single drawing set and to ensure improvements generalize across different projects.

The goal is to identify patterns of failure and improve the inference engine systematically.

---

# Validation Method

For each project:

1. Select representative pages (not necessarily every page).
2. Record the expected interpretation.
3. Compare against MittenIQ's detected output.
4. Mark pass/fail and record failure reason.

Failures should be categorized so the intake system can be improved by pattern rather than by tuning against a single file.

---

# Failure Categories

Use these standardized tags when recording issues.

| Category | Meaning |
|--------|--------|
| SHEET_NUMBER | Sheet number extraction failed |
| SHEET_NAME | Sheet title extraction incorrect |
| PAGE_CLASS | Drawing/spec/bid/general classification incorrect |
| SHEET_TYPE | Plan vs Detail vs No-scale classification incorrect |
| DISCIPLINE | Discipline inference incorrect |
| INDEX_MISS | Cover-sheet index existed but was not used |
| TITLEBLOCK_MISS | Title block data present but not detected |
| TEXT_ORDER | PDF text ordering prevented correct interpretation |
| OCR_LIMIT | Scanned/raster text caused interpretation problems |
| LLM_REFINE | LLM refinement failed to improve deterministic result |

Multiple categories may be applied to a single failure.

---

# Project A — Owosso (DWSRF 7880-01)

Status: Baseline reference set

Characteristics:

- Digital vector drawings
- Clean title blocks
- Clear sheet numbering
- Contains cover/index sheet
- Strong text extraction quality

This project is useful for validating core parsing logic.

---

## Validation Sample

| PDF Page | Expected Sheet | Expected Name | Expected Type | Detected Result | Pass | Failure Category | Notes |
|---------|---------------|---------------|--------------|----------------|------|-----------------|------|
| 1 | G101 | Cover Sheet | DRAWING | G101 — Cover Sheet | PASS | — | |
| 2 | C101 | Site Plan | DRAWING | C101 — Plan | PARTIAL | SHEET_NAME | Title too generic |
| 3 | E001 | Sections, Details, and General Notes | DRAWING | E001 — Sections, Details, And General Notes | PASS | — | |
| 4 | E002 | Electrical Site Plan | DRAWING | E002 — Site Plan | PARTIAL | SHEET_NAME | Missing "Electrical" qualifier |
| 5 | E003 | Photos | DRAWING | E003 — Photos | PASS | — | |
| 6 | E401 | One Line Diagram, Elevations, and Enclosure Plan | DRAWING | E401 — One Line Diagram, Elevations, And Enclosure Plan | PASS | — | |
| 7 | E402 | One Line Diagram | DRAWING | E402 — One Line Diagram | PASS | — | |
| 8 | E601 | Grounding Details | DRAWING | E601 | FAIL | SHEET_NAME, INDEX_MISS | Title missing |

---

# Project B — Secondary Drawing Set

Status: Stress-test set

Characteristics:

- Different sheet naming conventions
- Less consistent title block layout
- Possibly mixed drawing/spec formatting
- Lower accuracy observed in initial testing

This project is used to ensure the intake engine generalizes across different consultants and drawing standards.

---

## Validation Sample

| PDF Page | Expected Sheet | Expected Name | Expected Type | Detected Result | Pass | Failure Category | Notes |
|---------|---------------|---------------|--------------|----------------|------|-----------------|------|
| TBD | | | | | | | |

(Add rows as testing continues)

---

# Observed Patterns (Running Notes)

Use this section to record patterns discovered during validation.

Examples:

- Some drawing sets place sheet numbers in the bottom-left instead of bottom-right.
- Some engineers abbreviate sheet titles heavily.
- Some PDFs reorder text tokens in ways that break naive extraction.
- Some cover-sheet indexes list titles that differ slightly from the actual sheet title.

These patterns should guide improvements to the deterministic detection pipeline.

---

# Improvement Targets

Based on current testing, the following areas are most important to improve:

1. Cover-sheet index extraction and reconciliation
2. Generic title cleanup (Plan, Notes, Diagram, etc.)
3. Drawing subtype inference (Plan vs Detail vs No-scale)
4. Cross-sheet sequence validation
5. Handling of alternate title block locations

Future improvements should be validated against **both Project A and Project B** before being accepted.

---

# Rule for Future Intake Changes

Any modification to the intake analyzer must be tested against the validation projects.

A change should only be accepted if it:

- improves at least one failure
- does not introduce new failures in previously correct pages

This prevents regressions and keeps the intake engine stable as it evolves.

## 2026-03-07 Validation Pass

Test Sets:

1. Owosso project drawings
2. Alternate drawing set

Results:

Drawing sheets:

PASS
Sheet numbers remain highly reliable.

Title detection:

PARTIAL PASS
Caption-style sheets still difficult.

Example:

E601 — grounding detail sheet

Specification documents:

FAIL
Current extraction insufficient.

Notes:

Future improvements required for:

- specification heading extraction
- front-end document classification

## Addendum packet test

Document type:
municipal water treatment plant electrical upgrades addendum

Pages included:
bid letter
clarifications
legacy electrical drawings

Results:
drawings correctly detected
front-end pages detected
print sizes correctly identified

Issues:
title extraction occasionally incorrect
sheet numbers missed on some drawings

### Test Run — 166 Page Spec Book
Date: 2026-03-13

Result:
Intake completed successfully.

Runtime:
~8.9 minutes

Observations:
- Retry/backoff prevented TPM failure
- 102 pages flagged for review
- OCR applied to 24 pages

## Validation Run — Spec Book

Date: 2026-03-13

Document Type: Specification Manual

Pages: 1232

Results:

Spec Pages: 1124  
Bid / Front-End Pages: 66  
General Pages: 42  

OCR Applied Pages: 24

Runtime: ~51 minutes

Notes:

Retry/backoff handled multiple TPM limit events during processing.  
Pipeline completed successfully.

---

## Validation Run — Drawing Set

Date: 2026-03-13

Document Type: Construction Drawings

Sheets: 116

Results:

Drawings: 116  
Low Confidence Pages: 1

OCR Applied Pages: 24

Runtime: ~11 minutes

Notes:

Sheet detection and naming accuracy were high.  
Only one sheet flagged for review (schedule sheet).

Test file:
Lake Mitchell Contract #2 Specs

Pages: 432

Processing time: ~21 minutes

Results:
anchors: 242
specSections: 119
blankPages: 0
reviewNeededPages: 6

Assessment:
Pipeline stable
Spec interpretation quality insufficient
Further refinement required