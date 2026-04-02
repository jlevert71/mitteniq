# MittenIQ Documentation Index

Last updated: 2026-03-13

This file explains what each document is for and the order they should be read in.

The point of this doc set is continuity, not ceremony.

Someone resuming the project should be able to understand:
- what the build currently does
- what the intended architecture is
- what decisions are locked
- what issues are active
- what should happen next

---

# Recommended Reading Order

## 1. `BUILD_STATE_SNAPSHOT.md`
Read first.

Use it to understand:
- what is actually verified in the current build
- what is partially implemented
- what major limitations are active right now
- what the immediate development direction is

This is the best “where the hell are we right now?” document.

---

## 2. `ARCHITECTURE.md`
Read second.

Use it to understand:
- the intended system architecture
- the intake pipeline model
- responsibility boundaries between code and AI
- future-agent reuse requirements
- the current architectural build order

This is the best “what are we building toward?” document.

---

## 3. `DECISIONS.md`
Read third.

Use it to understand:
- what decisions are locked
- what constraints should not be casually reversed
- what architecture changes were intentional
- what current priority order is now official

This is the best “what must not get accidentally undone?” document.

---

## 4. `TASK_QUEUE.md`
Read fourth.

Use it to understand:
- what the active work is right now
- what the next implementation steps are
- what is parked for later
- what order current work should happen in

This is the best “what should we do next?” document.

---

## 5. `KNOWN_ISSUES.md`
Read fifth.

Use it to understand:
- current recurring failures
- active technical risks
- architecture pain points
- issues that should be recognized immediately if they show up again

This is the best “what is still broken or fragile?” document.

---

## 6. `CONVENTIONS.md`
Read sixth.

Use it to understand:
- how changes should be made safely
- how to avoid sloppy multi-system breakage
- how docs and structural edits should be handled
- how to work without making the repo a mess

This is the best “how do we work safely?” document.

---

## 7. `ROADMAP.md`
Read seventh.

Use it to understand:
- the product direction beyond the current intake cleanup
- how future agent work fits on top of intake
- how current work supports the long-term product

This is the best “where is this product going?” document.

---

# Supporting / Operational Docs

## `REPO_MAP.md`
Use when you need a directory/file orientation guide.

## `CHANGELOG.md`
Use for historical changes if it is still being actively maintained.

## `GUARDRAILS.md`
Use for protections and “don’t casually touch this” areas if it still reflects current truth.

## `RESUME_PROMPT.md`
Use when starting or resuming an AI-assisted build session.

## `SESSION_PROTOCOL.md`
Use if present and still current.

---

# Intake-Specific Docs

## `INTAKE_ARCHITECTURE_V2.md`
Use when working specifically on intake boundaries, evidence preparation, AI understanding, trust verification, and future-agent reuse.

## `INTAKE_PAGE_SCHEMA_V2.md`
Use when working specifically on the AI page output contract and intake result shape.

These docs matter most when editing:
- analyzer flow
- PreparedPage structures
- OCR/image pipeline behavior
- AI page output handling
- review/trust logic

---

# Documentation Rules

## 1. Keep active docs current
Do not let active docs fill up with stale discarded architecture.

## 2. Distinguish current reality from target direction
A good doc set makes it clear what exists now versus what is planned.

## 3. Prefer fewer cleaner docs over contradictory ones
If a doc is obsolete, replace or clean it rather than piling new contradictions on top.

## 4. Docs are there to help the next restart
They should reduce confusion, not archive every thought ever had.

---