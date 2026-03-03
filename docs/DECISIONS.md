# Architectural Decisions Log

Purpose:
Record permanent product and engineering decisions so they are not accidentally reversed later.

Only confirmed decisions belong here.

---

## 2026-03-02 — Intake Gates Downstream Features

Decision:
Uploaded documents must pass Intake processing before downstream workflows are available.

Status:
ACTIVE

Reason:
Prevents unreliable data from entering estimating workflows.

Impact:
- Upload lifecycle includes analyze step.
- Dashboard behavior depends on intake readiness.

Evidence:
Verified working upload pipeline:
- POST /api/uploads/presign -> 200
- POST /api/uploads/complete -> 200
- POST /api/uploads/analyze -> 200

---

## 2026-03-02 — Incremental Build Strategy

Decision:
MittenIQ will be built through small, sequential, verifiable steps rather than large refactors.

Status:
ACTIVE

Reason:
Reduces breakage and allows continuous verification during development.

Impact:
- One change tested at a time.
- Documentation updated daily.
- No speculative refactors.

---

## 2026-03-02 — Documentation as System Memory

Decision:
Repository documentation is the authoritative memory of the project rather than chat history.

Status:
ACTIVE

Reason:
AI sessions reset context; repository docs preserve continuity across months.

Impact:
All sessions begin using:
- BUILD_STATE_SNAPSHOT.md
- CONVENTIONS.md
- RESUME_PROMPT.md


---

## 2026-03-02 — Simplicity-First User Experience

Decision:
The MittenIQ interface must remain usable by non-technical construction office staff with minimal training.

Status:
ACTIVE

Reason:
Target users are estimators and office personnel, not software specialists.

Impact:
- Interfaces prioritize clarity over feature density.
- Workflow steps must be obvious and linear.
- Automation must not hide critical decisions from users.

---

## 2026-03-02 — Intake as System Foundation

Decision:
File Intake is the first required system phase and establishes project readiness before additional capabilities are introduced.

Status:
ACTIVE

Reason:
Reliable estimating requires validated inputs before analysis or automation.

Impact:
- Intake stability prioritized before adding advanced features.
- Upload → Intake → Sheet creation is treated as core infrastructure.

---

## 2026-03-02 — Incremental Verification Over Speed

Decision:
Features are considered complete only after real local verification, not theoretical correctness.

Status:
ACTIVE

Reason:
The project is developed iteratively with continuous validation to avoid hidden failures.

Impact:
- Working behavior takes precedence over architectural elegance.
- Verified endpoints and observable results define completion.