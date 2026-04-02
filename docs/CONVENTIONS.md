# Conventions (How We Build Safely)

Last updated: 2026-03-17

This document defines how MittenIQ work should be performed safely.

The project is still in a foundation-sensitive stage.  
Avoid multi-direction changes that introduce hidden architectural conflicts.

---

## Core Rule

No unnecessary cleverness.

Make the smallest change that moves the project forward without damaging working behavior or boxing the architecture into a bad long-term shape.

---

## Permanent Build Priorities

When tradeoffs appear, use this order:

1. accuracy
2. trustworthiness
3. preserving working behavior
4. future-agent reuse
5. speed
6. elegance

MittenIQ should not become fast at the wrong thing.

---

## Daily Start Routine

1. Open repo from root.
2. Start dev server:

npm run dev

3. Open:

http://localhost:3000/projects

4. Confirm baseline:
- project list loads
- no unexpected terminal errors
- relevant recent features still function

If baseline fails:

- stop
- identify cause before making changes

---

## Daily End Routine

1. Update docs:
- BUILD_STATE_SNAPSHOT.md
- TASK_QUEUE.md
- DECISIONS.md (if needed)
- KNOWN_ISSUES.md (if needed)
2. Save all files
3. Commit if stable

---

## Rules for Code Changes

### 1. One Architectural Move at a Time

Do not mix concerns.

Keep separate:

- intake pipeline changes
- spec fast-path work
- routing changes
- OCR changes
- AI prompt/output changes
- schema changes
- UI changes

---

### 2. Always Capture Current Files Before Structural Edits

Before modifying:

- run-ai-intake.ts
- run-intake-analysis.ts
- spec-outline.ts
- router
- OCR
- schema
- architecture docs

Capture current version first.

---

### 3. Prefer Minimal Diffs Unless Unsafe

- small logic change → targeted edit  
- messy file or structural shift → full replacement  
- anything fragile → full replacement

---

### 4. Full Replacement Preferred for Complex Files

Especially:

- app/**/page.tsx
- intake pipeline files
- large scripts

Avoid partial edits that risk breakage.

---

### 5. Do Not Hide Architectural Changes

If a change affects:

- data flow
- routing behavior
- structure extraction
- persistence meaning
- AI vs deterministic responsibility

It is architectural.

Document it.

---

### 6. No Guessing

Do not invent:

- helpers
- schema fields
- routes
- behavior

Always inspect real files first.

---

## Documentation Rules

### 1. Docs Must Reflect Current Reality

Remove outdated framing.

Do not stack new ideas on top of obsolete ones.

---

### 2. Separate:

- what is implemented
- what is proven (POC)
- what is planned

---

### 3. Remove Dead Directions

Do not preserve abandoned approaches unless archived.

---

### 4. Docs Must Enable Restart

A developer should quickly understand:

- current system state
- known problems
- next correct move

---

## Testing Discipline

After intake-related changes, verify:

- project list loads
- upload works
- analyze runs
- intake report renders
- Sheet rows persist

If failure occurs:

- capture exact error
- stop stacking guesses

---

## Intake-Specific Rules

### 1. Accuracy First

Never trade correctness for speed.

---

### 2. Structure-First When Available

If a document provides reliable structure (outline/bookmarks):

- use it
- do not force AI to rediscover it

Examples:

- spec section boundaries
- outline hierarchy
- explicit identifiers

---

### 3. AI Owns Meaning, Not Raw Structure

AI is responsible for:

- interpretation
- continuity
- relationships
- ambiguity resolution

Deterministic code may handle:

- structure extraction
- boundary detection
- normalization

---

### 4. Fast Path Must Be Safe

Spec fast-path rules:

- must be additive
- must not break existing pipeline
- must have fallback
- must not silently degrade output

---

### 5. Multi-Profile Reality

Do not assume all specs are CSI.

Profiles include:

- CSI
- DOT / MDOT
- manual / article
- generic

Code must not hardcode one format as universal.

---

### 6. OCR Is Supporting Evidence

OCR must not:

- own pipeline logic
- drive architecture

It is:

- selective
- route-aware
- optional

---

### 7. Vision Already Exists

Page images are already generated and usable.

Do not treat vision as future work—it is a refinement problem now.

---

### 8. Do Not Optimize the Wrong Stage

Order:

1. spec correctness
2. structure integration
3. continuity
4. then speed

---

### 9. Avoid Re-Solving Known Structure With AI

If structure is:

- explicit
- reliable

Do not:

- send it to AI unnecessarily
- duplicate work

---

## Schema Change Discipline

Before editing schema:

1. confirm necessity
2. confirm timing
3. document reason
4. regenerate Prisma client
5. verify reads/writes

Avoid speculative schema changes.

---

## AI Session Rules

When using AI help:

- provide real files
- provide current docs
- avoid summaries without code

AI should:

- ask for files before edits
- avoid assumptions
- keep changes small
- preserve working behavior

---

## Instruction Quality Rule

Good:

- “replace this file”
- “add eligibility check here”
- “split this function into X and Y”

Bad:

- “clean this up”
- “refactor everything”
- “make it smarter”

---

## Commit Discipline

Commit when:

- system still works
- change verified
- docs updated if meaning changed

Examples:

- `Add spec fast-path eligibility`
- `Introduce MDOT outline profile`
- `Integrate structure-first spec routing`
- `Reduce spec review noise`

---

## Safety Rule (Critical)

This project is still in a foundation phase.

Correct behavior is:

- one clean structural improvement
- verified
- documented
- stop

Not:

- stacking multiple risky changes
- mixing unrelated optimizations
- chasing speed before correctness