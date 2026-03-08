# MittenIQ Guardrails

This file defines **critical system rules that must not be violated** without explicit instruction.

These guardrails exist to prevent accidental architectural damage during incremental development.

---

## 1. Database Safety

Never modify database schema or migrations unless the task explicitly requires it.

Protected items:

* prisma/schema.prisma
* prisma.config.ts
* migration files in `/prisma/migrations`

If database changes are required:

1. Explain the reason.
2. Show the exact diff.
3. Wait for confirmation before generating migrations.

---

## 2. Upload Storage Integrity

The file upload pipeline is foundational to the system.

Protected flow:

Project → Upload → Storage → Intake Analysis → Sheet records

Do NOT alter:

* `/api/uploads/*`
* Cloudflare R2 upload logic
* Upload database fields

unless the task specifically involves storage or upload functionality.

---

## 3. Intake System Stability

The intake system is the **first stage of the MittenIQ pipeline**.

It determines:

* file type
* sheet count
* raster/vector properties
* text searchability
* scale confidence groundwork

Do NOT refactor or redesign intake without explicit approval.

Safe changes include:

* UI improvements
* additional metadata
* reporting enhancements

Unsafe changes include:

* changing intake data model
* changing intake trigger logic
* altering sheet classification flow

---

## 4. Verified Working Systems

The following components are considered **stable and working** unless explicitly reported broken:

* authentication
* project creation
* file upload
* intake analysis
* project detail pages

Avoid refactoring these areas.

---

## 5. Code Change Strategy

Always prefer:

small → verified → incremental updates.

Never propose:

* large rewrites
* framework swaps
* folder restructures

unless explicitly requested.

---

## 6. File Change Protocol

When modifying code:

1. Identify the file path.
2. Explain the purpose of the change.
3. Show the exact code modification.
4. Keep the change minimal.

---

## 7. AI Behavior Rules

If information is missing:

* ask for the file
* do not guess
* do not invent architecture

Repository documentation always overrides assumptions.

---

## 8. MittenIQ Design Philosophy

The system prioritizes:

* estimator workflow alignment
* extremely simple UX
* reliability over cleverness
* transparency in AI decision making

Any feature that increases complexity must justify its value.

Do not allow LLM refinement to override deterministic sheet numbering.

LLM may only modify:

- sheet titles
- page class
- sheet subtype

---

End of guardrails.
