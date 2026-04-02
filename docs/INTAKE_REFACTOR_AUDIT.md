# Intake Refactor Audit

Purpose:
Track how each intake-related file fits the new AI-first intake direction.

Rules:
- Keep only code that handles deterministic file facts, extraction, orchestration, schema validation, persistence, and trust checks.
- Remove deterministic code that attempts to interpret document meaning.
- AI must be the primary page-understanding layer.

---

## File
[path]

### Current Role
[what it does now]

### Decision
KEEP | REFACTOR | REPLACE | DELETE

### Reason
[why]

### New Responsibility
[what it should do after refactor]

### Notes
[dependencies, risks, downstream impact]