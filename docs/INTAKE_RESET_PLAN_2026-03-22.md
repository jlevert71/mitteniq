# Intake reset plan — 2026-03-22

This document describes how MittenIQ will move from the current **intake v1** pipeline (`lib/intake/*`, `/api/uploads/analyze`) toward a **simpler intake_v2**, without losing localhost health or core product flows during the transition.

Related audit: [CODEBASE_CLEANUP_AUDIT_2026-03-22.md](./CODEBASE_CLEANUP_AUDIT_2026-03-22.md).

---

## Why intake is being reset

- The current pipeline chains many subsystems (PDF text + pdfjs render + OCR + multiple structure/index detectors + registry validation + chunked LLM + raw SQL sheet writes) in one orchestration path, which is hard to reason about, test, and evolve.
- Overlapping responsibilities (routing, confidence, index/TOC detection, identity resolution) increase the cost of safe changes.
- Product direction favors a **narrow V1** for intake: reliable upload, persistence, and a small set of well-defined outputs—then intentional expansion.

This reset is **architectural and incremental**: new code will live alongside v1 until v2 is ready to become primary; this plan does not require a big-bang delete.

---

## What must remain working

Until intake_v2 explicitly replaces v1 as the default:

| Area | Requirement |
|------|-------------|
| App boot | `next dev` / `next build` / `next start` succeed. |
| Auth | Login, logout, cookie session, `requireUserId` on protected APIs. |
| Projects | List/create/load projects; project detail page behavior unchanged. |
| Uploads | Presign → PUT to R2 → complete → status on project; **no regression** in `app/api/uploads/*` or project upload UI. |
| Current intake | `/api/uploads/analyze` and `runIntakeAnalysis` continue to run for existing flows until a deliberate switch. |
| Database | Prisma schema, migrations, and Sheet/Upload writes remain consistent with existing clients. |

---

## What intake_v2 is intended to do

**intake_v2** (future implementation) should:

- Own a **small, documented contract**: inputs (e.g. `uploadId`, R2 key, filename), outputs (e.g. normalized `intakeReport` shape v2, `Sheet` rows or equivalent), and explicit failure modes.
- Prefer **fewer stages** and **one obvious path** for “happy path” PDFs before adding optimizations (index-first, visual identity, etc.).
- Be **callable from a dedicated API route** (e.g. under `/api/intake-v2/` or similar) so v1 and v2 can coexist during migration.
- Log stages and persist status fields in a way operators can debug without reading 3k-line modules.
- Be covered by a **short manual or automated checklist** on each meaningful change (see below).

Exact folder names and APIs will be decided when implementation starts; this plan only fixes direction and safety boundaries.

---

## What intake_v2 explicitly will NOT do

- **Will not** (initially) replicate every v1 behavior: weak-index assist, multiple parallel confidence layers, index-first LLM branches, visual drawing identity, spec fast-path, etc., unless explicitly pulled in as scoped milestones.
- **Will not** replace upload/R2/project wiring—those stay in existing modules and routes.
- **Will not** remove or rewrite `lib/intake/*` in the first migration steps; v2 grows **next to** v1 until cutover is chosen.
- **Will not** change Prisma models in breaking ways without a migration plan and UI updates.

---

## Existing areas to quarantine later

These are **candidates** for deprecation, feature flags, or removal **after** v2 is validated—not targets for immediate deletion:

| Area | Notes |
|------|--------|
| `lib/intake/*` (monolith graph) | Quarantine by **not importing** from v2; eventual deletion only after traffic and data prove v2. |
| `app/api/intake/route.ts` | Legacy stub; not used by in-app `fetch`. Marked legacy in source; may retire after external callers confirmed absent. |
| `app/api/debug/project/route.ts` | Dev helper; gated to development only in code. |
| Duplicate intake UIs | `app/intake/page.tsx` vs `app/projects/[projectId]/intake/*`—consolidate when UX is decided. |
| Raw SQL sheet insert in `run-intake-analysis.ts` | High-risk seam; revisit when v2 owns persistence strategy. |

---

## Immediate implementation sequence

1. **Planning-only (this snapshot)**  
   - Add this reset plan.  
   - Label legacy/dev routes; guard debug in non-development.  
   - No changes to upload pipeline, project page, or `lib/intake/*`.

2. **Scaffold intake_v2 (next pass, when approved)**  
   - Add `lib/intake-v2/` (or agreed name) with types + one entry function stub.  
   - Add `app/api/...` route that authenticates and calls stub; returns structured “not implemented” or minimal PDF metadata only.

3. **Implement minimal v2 pipeline**  
   - R2 read → page count / basic PDF sanity → persist report v2 → optional simple `Sheet` rows behind a flag.

4. **UI / product switch**  
   - Point analyze (or a duplicate button) to v2 behind env flag; compare outputs; then default to v2.

5. **Retire v1**  
   - Remove or archive `lib/intake` only when v2 is default and stable; keep migrations reversible where possible.

---

## Risk controls / testing checklist

Run after any change that touches auth, uploads, analyze, or Prisma:

- [ ] `npm run build` completes without TypeScript errors.
- [ ] Login → redirect to protected area works.
- [ ] Create or open a project; list loads.
- [ ] Upload a PDF: presign, complete, upload row shows expected status; analyze still triggers as today (v1 path).
- [ ] Open intake report UI (e.g. `/intake?uploadId=…`) for a READY upload; data loads.
- [ ] **Production build** (`NODE_ENV=production`): `POST /api/debug/project` returns non-success (endpoint disabled outside dev).
- [ ] **Development** (`next dev`): optional smoke—debug route still creates a project when authenticated (if you rely on it).

For intake_v2-specific work (when added):

- [ ] Golden PDF set: small drawing set, spec TOC, raster-heavy, corrupt header (error path).
- [ ] Compare v1 vs v2 `intakeReport` / sheet counts in a spreadsheet or snapshot test **before** switching default.

---

*End of plan — execute implementation steps only when explicitly scheduled.*
