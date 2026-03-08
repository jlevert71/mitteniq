# Intake Report Redesign

Goal:

Transform intake output into an **estimator-facing readiness report** rather than a technical diagnostic.

Primary estimator concerns:

1. Print size
2. Total sheet count
3. PDF stability / trust
4. Correct sheet names and numbers

---

# Final Layout

Section 1 — PDF Confidence

Displays readiness level:

- High confidence
- Review recommended
- Low confidence

Plain-English explanation shown when confidence is not high.

---

Section 2 — Sheet Count / Print Size

Displays:

- Total sheet count
- Primary print size
- Size breakdown
- Mixed-size warnings

---

Section 3 — PDF Name

Displays:

- filename
- upload timestamp

---

Section 4 — PDF Trust

Displays:

- searchability detection
- raster-heavy detection
- structural readability

---

Section 5 — Sheet Types

Displays counts for:

- Drawings
- Specifications
- Addenda
- Bidding / Front-End
- General Project Information
- Review Needed

---

Section 6 — Sheet List

Displays:

- page number
- detected type
- sheet name
- open page control

Each row includes:

Open Page → opens the PDF to that page.

---

# Controls

Open Full File  
Refresh report  
Back to project

---

# Design Principles

- Minimal clutter
- Estimator-focused information
- Clear trust signals
- Direct access to source document

## Confidence and Review Visibility

The intake report now surfaces detection quality.

New elements:

- page confidence score
- review flags
- detection provenance

Purpose:

Allow estimators to identify weak detections quickly.

Design principle:

Confidence should guide review, not block workflow.