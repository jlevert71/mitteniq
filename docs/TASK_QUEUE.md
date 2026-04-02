# docs/TASK_QUEUE.md

# Task Queue

Last updated: 2026-03-17

Purpose:  
Single source of truth for what MittenIQ work is happening now and next.

Rules:
- Keep tasks specific.
- Reflect the current architecture direction.
- Move completed items to DONE.
- Do not let old discarded architecture linger as active work.

---

# CURRENT (Active Work)

## Phase 1 — Intake Stabilization + Speed-Enabling Spec Routing

Primary objective:

Make intake trustworthy enough and fast enough to serve as the foundation for later agents.

Current priority order:

1. add isolated spec fast-path eligibility assessment
2. extend outline normalization across recurring document families
3. preserve the heavy AI/OCR path as fallback coverage
4. wire eligible structured spec books into routing
5. keep improving blank/divider handling, packet identity, and review calibration
6. harden drawing-path understanding after spec routing is sane
7. improve speed, token budgeting, and throughput discipline more aggressively afterward

Important current product concerns:

- **structured spec books are still paying too much heavy-path cost**
- **review-needed output is still too noisy on some spec/manual runs**
- **blank/divider handling is still inconsistent**
- **packet and continuity behavior are still not estimator-clean enough**
- **speed is now a live concern again, but the next gains should come from better routing first**

A 1232-page specification manual completed successfully, but runtime was ~51 minutes.  
A 432-page project manual completed successfully in ~15 minutes.  
A 946-page Fishbeck manual proved a real bookmark-based CSI fast path is possible.  
MDOT and GFA-style tests proved additional profile families exist.

---

## 1. Build Spec Fast-Path Assessment

Goal:  
Decide cheaply whether a spec PDF is eligible for structure-first processing before invoking the heavy AI/OCR path.

Tasks:

- create isolated `spec-fast-path.ts` assessment helper
- measure outline presence
- measure normalized range count
- return clear reasons for eligibility / non-eligibility
- keep this proof-of-concept isolated before main-pipeline integration

---

## 2. Add Multi-Profile Outline Normalization

Goal:  
Support multiple recurring outline families instead of assuming CSI-only specs.

Current known families:

- CSI consultant manual
- MDOT proposal/spec
- ARTICLE/manual contract book
- GENERIC outlined document

Tasks:

- keep existing CSI normalization
- add MDOT normalization
- add ARTICLE/manual normalization
- add profile detection summary
- keep generic outlined-document fallback behavior available
- prefer useful segmentation units over noisy lower-level rows

---

## 3. Build a Small Benchmark Set of Real Files

Goal:  
Test fast-path logic against representative real-world document families before integrating it into intake.

Tasks:

- maintain at least one clean CSI consultant spec manual
- maintain at least one MDOT proposal/spec book
- maintain at least one ARTICLE/manual style contract/spec package
- maintain at least one weak/no-bookmark spec file
- record which profile each file fits
- record whether fast-path is strong, conditional, or weak

---

## 4. Route Structured Spec Books Away from Universal Heavy Processing

Goal:  
Stop forcing all spec books through the same heavy path.

Tasks:

- identify likely spec/manual files
- run fast-path assessment before deep page-level discovery
- use structural section mapping where trusted
- preserve fallback to current heavy path where structure is weak
- do not break mixed-content or ugly-book coverage

---

## 5. Preserve and Improve Heavy Fallback Coverage

Goal:  
Keep coverage for ugly, scan-heavy, no-bookmark, and mixed-content books.

Tasks:

- preserve current AI/OCR fallback path
- keep improving blank/divider handling
- improve packet continuity
- improve review calibration
- reduce false-positive review noise
- ensure fallback books remain usable even when slower

---

## 6. Improve Blank / Divider / Pagination Cleanup in Spec Manuals

Goal:  
Make blank pages, divider pages, and PDF pagination artifacts behave cleanly and consistently.

Tasks:

- harden blank-page finalization behavior
- eliminate inconsistent blank-page labeling
- strip residual PDF pagination artifacts from non-drawing page names
- prevent page markers from becoming junk titles when they are not meaningful
- preserve meaningful page-position labels only when attached to valid packet identity

---

## 7. Reduce False-Positive Review Noise

Goal:  
Make review-required output meaningful instead of overwhelming.

Tasks:

- improve trust calibration for spec/manual pages
- reduce obvious false positives in review-required output
- preserve review pressure where identity is truly weak
- improve continuity-aware confidence handling
- ensure practically correct packet/spec pages do not flood the review queue

---

## 8. Harden Drawing Pathway After Spec Routing Stabilizes

Goal:  
Move to drawing-path accuracy only after spec/manual routing and output are trustworthy enough.

Tasks:

- improve reliable drawing identity extraction
- improve drawing discipline support
- improve drawing review calibration
- preserve page-image-driven evidence for later use
- prepare for schedule/note/scope workflows later

---

## 9. Speed / Throughput Work After Routing Improves

Goal:  
Reduce runtime and cost without damaging accuracy or future-agent reuse.

Tasks:

- add adaptive chunk sizing by route and payload weight
- reduce spec/manual payload bloat
- add token/payload budgeting helper
- reduce unnecessary prompt duplication
- improve throughput on very large spec books
- keep retry/backoff behavior reliable under TPM pressure
- implement persistent OCR worker pool
- tune image policy for throughput

---

# NEXT (Immediate Follow-Up After Current Work)

## Intelligence Layer Reuse for Future Agents

Goal:  
Ensure intake outputs can be reused cleanly by later agents.

Tasks:

- define which intake artifacts become durable reusable project intelligence
- identify what later agents should query directly
- avoid repeated re-reading of the same document evidence
- preserve continuity outputs for later agents
- preserve fast-path structural outputs for later agents
- prepare for project organization, spec intelligence, and drawing intelligence workflows

---

## Specification Intelligence Foundation

Goal:  
Build on the hardened intake pipeline to support specification workflows.

Tasks:

- improve section grouping quality
- preserve section evidence for later agent use
- preserve section continuity outputs for later agent use
- identify bid-critical signals for future extraction
- prepare for approved manufacturer and requirements workflows later

---

## Drawing Intelligence Foundation

Goal:  
Build on the hardened intake pipeline to support drawing workflows.

Tasks:

- improve reliable drawing identity extraction
- improve discipline support
- preserve page-image-driven evidence for later use
- prepare for schedule/note/scope workflows later

---

# UPCOMING (After Current Intake Work)

### CURRENT
- build spec fast-path eligibility helper
- add multi-profile outline normalization
- test against a small benchmark set
- preserve heavy fallback path
- route eligible structured spec books to a cheaper path
- improve blank / divider handling in project manuals
- strip PDF pagination artifacts more cleanly
- reduce false-positive review noise in spec/manual runs
- preserve useful page-position labels where valid

### NEXT
Priority — Spec Routing + Intake Stabilization

1. Build fast-path assessment
2. Add CSI / MDOT / ARTICLE / GENERIC profile detection
3. Integrate eligible fast paths into spec routing
4. Improve blank page detection
5. Reduce packet/continuity noise
6. Reduce review noise
7. Tighten token/payload discipline

## Project Organization Agent Foundation

Tasks:

- identify drawing groups
- identify spec/manual groups
- identify bid/front-end groups
- prepare future foldering/organization workflow
- prepare future mixed-file separation support

---

## Review Queue / Human Verification Interface

Tasks:

- present review-required pages clearly
- support accept/correct behavior
- preserve human-corrected truth
- make low-confidence review practical for estimators

---

## Persistence Improvements

Tasks:

- replace localStorage purchased-functions stub later
- evolve page/persistence structures for richer reusable intelligence
- support future agent outputs more cleanly
- consider explicit page-identity fields beyond legacy sheet-oriented naming
- persist fast-path structural outputs where useful

---

# PARKED / LATER

These are valid future directions but not current build focus.

- bid summary automation
- RFQ automation
- vendor contact management
- market intelligence
- material pricing intelligence
- copper / steel trend workflows
- automated addendum comparison
- budgetary estimate workflows
- expanded chief-agent reporting

---

# DONE

- authentication implemented
- project/workspace basics implemented
- upload pipeline implemented
- R2 storage integrated
- analyzer route implemented
- intake report generation implemented
- page-level persistence into `Sheet` implemented
- native text extraction implemented
- PreparedPage structure implemented
- OCR integrated
- page rendering to PNG implemented
- page image delivery into AI request implemented
- AI page understanding integrated
- spec section grouping implemented
- documentation system established
- analyze route decomposed into reusable intake modules
- page image generation separated from OCR ownership
- router formalized as a pipeline stage
- file default routing added
- page override routing added
- route-aware OCR fallback / escalation behavior implemented
- review-needed count bug in report summary fixed
- project-manual/spec-book naming improved materially
- non-drawing page-label cleanup added
- blank-page forcing / cleanup added
- project-manual review noise reduced versus earlier runs
- isolated bookmark extraction proof-of-concept implemented with `pdfjs-dist`
- outline destination resolution to real pages implemented
- CSI-style section-range derivation from bookmarks implemented
- real Fishbeck consultant-manual fast-path proof completed
- real MDOT outline-family test completed
- real ARTICLE/manual outline-family test completed