# Conventions (How We Build Safely)

Last updated: 2026-03-02

## Golden Rule
No “clever” changes. Small, testable changes only.

If a change is not required for the current goal, do not do it.

---

## Daily Start Routine (every session)

1) Open repo in VS Code (repo root contains `package.json`)
2) Start dev server:
   - `npm run dev`
3) Open browser:
   - http://localhost:3000/projects
4) Confirm baseline health:
   - Projects page loads
   - No red errors in terminal

If baseline fails, do NOT change code until the error is understood.

---

## Daily End Routine (every session)

1) Update docs:
   - `docs/BUILD_STATE_SNAPSHOT.md` (what works / what broke / next goal)
   - `docs/CHANGELOG.md` (what changed today)
   - `docs/TASK_QUEUE.md` (what’s next)
2) Save all files
3) Optional but recommended: commit work when stable

---

## Rules for Code Changes

### 1) One change at a time
- Change one file (or one small set) per step.
- Test after each change (reload page + verify expected behavior).

### 2) Always capture “before” state
Before modifying a major file:
- Copy the current file into the chat (or save a local backup commit).

### 3) Prefer minimal diffs
- Avoid refactors unless explicitly requested.
- Keep functions/routes stable.

### 4) Full-file replacement preference
When editing a page like `app/**/page.tsx`, prefer full replacement files so you can copy/paste safely.

### 5) No guessing in docs
- Docs contain only verified facts or explicitly confirmed decisions.
- Planned features must be labeled as “Planned” and dated.

---

## Testing Checklist (quick)

After any API or upload change, verify these locally:
- GET /projects -> 200
- GET /api/projects -> 200
- Upload a PDF:
  - POST /api/uploads/presign -> 200
  - POST /api/uploads/complete -> 200
  - POST /api/uploads/analyze -> 200
- Project uploads list updates:
  - GET /api/projects/{projectId}/uploads -> 200

If any endpoint fails, stop and capture:
- terminal error lines
- browser console error (if any)

---

## Git Discipline (keeps us safe)

### When to commit
Commit when:
- baseline works
- new behavior verified
- docs updated

### Commit message format
- Short and specific, e.g.:
  - "Fix intake hydration on project detail"
  - "Add upload analyze step after complete"
  - "Document current repo map and build state"

---

## AI Session Rules (critical)

When starting a new chat or switching models:
1) Paste `docs/RESUME_PROMPT.md`
2) Paste `docs/BUILD_STATE_SNAPSHOT.md`
3) Paste only the relevant file(s) for today’s task

The AI must:
- not invent routes/models/env vars
- ask for file contents if unsure
- keep changes small and sequential

---

## MittenIQ Development Constraints (Project-Specific)

These rules exist because the project is being built incrementally with guided assistance.

### Beginner-Safe Development Rule
Changes must always be:
- step-by-step
- explicitly instructed
- reversible

Never assume prior programming knowledge when proposing steps.

---

### No Multi-System Changes
Do NOT modify multiple subsystems at once.

Subsystem examples:
- database schema
- API routes
- UI pages
- intake pipeline
- authentication

Only one subsystem may change per development step unless explicitly approved.

---

### Architecture Stability Rule
The following areas are considered **structural** and must not be refactored without explicit approval:

- Upload lifecycle
- Intake pipeline
- Prisma models
- Project → Upload → Sheet relationships
- API route structure under `app/api`

If improvement ideas arise, record them instead of implementing immediately.

---

### Documentation First Rule
If a change alters behavior or workflow:

1. Update BUILD_STATE_SNAPSHOT.md
2. Update CHANGELOG.md
3. Add decision to DECISIONS.md (if architectural)

Documentation is updated BEFORE moving to the next feature.

---

### Safe Instruction Requirement (for AI sessions)
Instructions must:
- specify exact files
- specify exact clicks or commands
- avoid ambiguous phrases like “update logic” or “refactor this”

If instructions are unclear, clarification must be requested before proceeding.