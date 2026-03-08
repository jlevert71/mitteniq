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

---

## 2026-03-03 — Credential-Based Authentication

Decision:  
MittenIQ uses a custom credential-based auth system with bcrypt password hashing and httpOnly session cookies.

Status:  
ACTIVE

Reason:  
Keeps authentication simple and fully under project control.

Impact:
- bcrypt password hashes (cost 12)
- session cookie `mitten-auth`
- 30-day expiry
- admin seed-based user creation

---

## 2026-03-03 — Admin-Controlled User Provisioning

Decision:  
New user accounts are created by the administrator running a local seed script.

Status:  
ACTIVE

Impact:
- No public registration
- Admin pre-approves users
- Users create password via `/setup`

---

## 2026-03-03 — Agents Are Project Scoped

Decision:  
Agents exist inside projects rather than as global tools.

Status:  
ACTIVE

Impact:

Route pattern:

/projects/[projectId]/agents/{agent}

---

## 2026-03-03 — Upload Pipeline Uses Presigned R2 Uploads

Decision:  
Files upload directly to Cloudflare R2 via presigned URLs.

Status:  
ACTIVE

Impact:

presign → upload → complete → analyze

---

## 2026-03-03 — Analyzer Generates Sheet Records Automatically

Decision:  
Sheet records are generated automatically during intake analysis.

Status:  
ACTIVE

Impact:

Analyzer populates Sheet table.

---

## 2026-03-04 — Supabase Pooler Required for Serverless Runtime

Decision:  
Production must use Supabase PgBouncer pooler.

Status:  
ACTIVE

Impact:

Connection format must use port **6543** with PgBouncer parameters.

---

## 2026-03-04 — Production Development May Continue Despite Hosting Issues

Decision:  
Feature development may continue locally even if production deployment is degraded.

Status:  
ACTIVE

Impact:
- Local development is authoritative environment
- Infrastructure tracked separately

---

## 2026-03-05 — Purchased Functions Hub Is the Primary Report Access Point

Decision:  
Project reports are accessed through the Purchased Functions panel.

Status:  
ACTIVE

---

## 2026-03-05 — Project Workspace Prioritizes Report Hub Over Upload Panel

Decision:  
Workspace layout prioritizes the Purchased Functions panel.

Status:  
ACTIVE

---

## 2026-03-05 — Purchased Functions Use Temporary Local Storage Stub

Decision:  
Purchased functions temporarily stored in localStorage.

Status:  
ACTIVE

Key format:

miq:purchasedFunctions:{projectId}

---

## 2026-03-05 — Estimating Assistant Functions Must Be Meaningful Purchases

Decision:  
Purchases must represent meaningful workflows rather than small fragmented tools.

Status:  
ACTIVE

---

## 2026-03-05 — File Intake Analysis and Sheet Extraction Are Combined

Decision:  
File Intake Analysis and Sheet Extraction are delivered as a single function.

Status:  
ACTIVE

Function ID:

intake-sheet-setup

---

## 2026-03-05 — Intake Page Must Explain Confidence in Plain English

Decision:  
Confidence values must include plain-English explanation when below 100%.

Status:  
ACTIVE

---

## 2026-03-06 — Replace pdfjs-dist with pdf-parse for Server Extraction

Decision:

Server-side extraction uses **pdf-parse** instead of pdfjs-dist.

Status:

ACTIVE

Reason:

pdfjs-dist worker failures inside Next.js server runtime.

Impact:

- extraction layer replaced
- classification unchanged
- intake report schema unchanged

---

## 2026-03-07 — Hybrid Deterministic + LLM Intake Architecture

Decision:

The intake system uses a **deterministic extraction pipeline with optional LLM refinement**.

Status:

ACTIVE

Architecture:

PDF Upload  
→ Deterministic Text Extraction  
→ Deterministic Sheet Detection  
→ Classification  
→ Optional LLM refinement

LLM location:

lib/llm-intake.ts

Model:

gpt-4o-mini

Environment flag:

MITTENIQ_LLM_INTAKE_ENABLED

Reason:

Deterministic extraction provides stability and reproducibility.  
LLM assistance improves recognition of ambiguous or irregular documents.

Safety Rule:

Deterministic results remain authoritative unless confidence is low.

Impact:

- Hybrid architecture improves reliability
- Prevents hallucinated sheet detection
- Enables future document intelligence capabilities

## 2026-03-07 — Adopt Three-Layer Intake Intelligence Model

Decision:

MittenIQ intake system will use a layered inference architecture.

Reason:

Construction documents vary widely across firms and formats.  
A deterministic-only system cannot generalize reliably.

Impact:

Improved extensibility and reasoning capability.

Tradeoff:

Requires additional compute and more complex pipeline.

---

## 2026-03-07 — Accept Multiple Sheet Number Families

Decision:

Sheet numbering detection must support multiple discipline prefixes.

Examples:

E-, I-, T-, C-, A-, M-

Reason:

Large drawing sets frequently contain mixed disciplines.

---

## 2026-03-07 — Do Not Depend on Strict Layout Geometry

Decision:

System must function without reliable positional text extraction.

Reason:

pdf-parse often does not provide reliable text coordinates.

Mitigation:

Fallback text-region inference.

## 2026-03-08 — Use Chat Completions API for Intake LLM

Decision:

The intake LLM integration will use the **Chat Completions API** rather than the Responses API.

Status:

ACTIVE

Reason:

Responses API caused model compatibility issues and local SDK validation failures.

Chat Completions API provides stable support for:

- gpt-4o-mini
- structured JSON responses
- predictable token usage

Impact:

OpenAI calls must use:

client.chat.completions.create()

Responses API should not be used in MittenIQ intake logic unless specifically required for reasoning models.

Safety:

Requests must remain below model token limits using candidate page caps and truncated evidence text.