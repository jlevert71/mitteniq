# MittenIQ Guardrails

Last updated: 2026-03-15

This file defines critical system rules that must not be violated without explicit instruction.

These guardrails exist to prevent accidental architectural damage during incremental development.

---

## 1. Database Safety

Never modify database schema or migrations unless the task explicitly requires it.

Protected items:

- `prisma/schema.prisma`
- `prisma.config.ts`
- migration files in `/prisma/migrations`

If database changes are required:

1. Explain the reason.
2. Show the exact diff.
3. Wait for confirmation before generating migrations.

---

## 2. Upload Storage Integrity

The file upload pipeline is foundational to the system.

Protected flow:

Project → Upload → Storage → Intake Analysis → Sheet records

Do not alter:

- `/api/uploads/*`
- Cloudflare R2 upload logic
- upload database fields

unless the task specifically involves storage or upload functionality.

---

## 3. Intake System Stability

The intake system is the first stage of the MittenIQ intelligence pipeline.

It determines and prepares:

- file facts
- page evidence bundles
- page-level understanding
- review signals
- reusable project intelligence for later agents

Do not redesign intake casually.

Safe changes include:

- evidence quality improvements
- AI prompt/schema improvements
- reconciliation improvements
- reporting improvements
- trust/review improvements
- performance improvements that preserve accuracy

Unsafe changes include:

- changing intake ownership boundaries without documentation
- letting deterministic rules become the interpretation engine
- altering sheet/classification flow in ways that constrain AI before it sees evidence
- removing reusable evidence needed by later agents

---

## 4. Verified Working Systems

The following components are considered stable and working unless explicitly reported broken:

- authentication
- project creation
- file upload
- intake analysis
- project detail pages

Avoid unnecessary refactors in these areas.

---

## 5. Code Change Strategy

Always prefer:

small → verified → incremental updates

Never propose:

- large rewrites
- framework swaps
- folder restructures

unless explicitly requested.

Architectural changes are allowed when necessary, but they must be deliberate, documented, and tightly scoped.

---

## 6. File Change Protocol

When modifying code:

1. Identify the file path.
2. Explain the purpose of the change.
3. Show the exact code modification.
4. Keep the change as small as safely possible.

For structurally sensitive files, full-file replacement is preferred over fragile partial edits.

---

## 7. AI Behavior Rules

If information is missing:

- ask for the file
- do not guess
- do not invent architecture
- do not invent code surrounding the requested change

Repository documentation overrides assumptions.

Actual code overrides memory.

---

## 8. AI-First Interpretation Guardrail

MittenIQ is an AI-first document intelligence system.

Document meaning must be produced by AI whenever that interpretation can reasonably be performed by AI.

This includes, but is not limited to:

- page meaning
- page classification
- page subtype interpretation
- packet identity
- section continuity
- section boundaries
- title reconstruction
- document relationship inference
- spec section understanding
- drawing identity reasoning

Deterministic code is allowed only for:

- file transport and upload plumbing
- evidence extraction and preparation
- OCR/image/text collection
- chunking and request shaping
- schema validation
- persistence
- trust enforcement
- review gating
- permissions
- UI state and rendering
- simple normalization for storage/display

Deterministic code must never:

- pre-decide document meaning before AI sees the evidence
- hide, strip, or suppress useful evidence from AI
- force brittle assumptions that narrow AI interpretation
- replace ambiguity with false certainty
- override AI interpretation except for basic validity, trust, persistence, or system-integrity needs

MittenIQ must preserve ambiguity honestly and let AI reason over the richest available evidence bundle.

---

## 9. Non-Obstructive Deterministic Layer Rule

Deterministic layers may support AI, but they must not impede, constrain, or materially narrow AI interpretation.

The deterministic layer acts as infrastructure, not intelligence.

Its role is to:

- gather evidence
- preserve evidence
- validate structure
- store results
- enforce trust policy
- support UI/workflow plumbing

Its role is not to think on behalf of the AI.

---

## 10. Design Philosophy

The system prioritizes:

- estimator workflow alignment
- extremely simple UX
- reliability over flash
- transparency in AI decision making
- reusable intelligence for later agents

Any feature that increases user-facing complexity must justify its value.

The product should feel simple even when the internal pipeline is sophisticated.

---

## 11. Trust Rule

MittenIQ should prefer transparent review-required behavior over fake certainty.

However, review pressure must be intelligently calibrated.

The system must not flood estimators with false-positive review noise when the page identity is already practically correct and useful.

Trust enforcement should protect accuracy, not create unnecessary friction.

---

End of guardrails.