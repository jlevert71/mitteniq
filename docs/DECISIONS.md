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
MittenIQ uses a custom credential-based auth system with bcrypt password hashing and httpOnly session cookies. No third-party auth provider (NextAuth, Clerk, Auth0, etc.) is used.

Status:
ACTIVE

Reason:
Keeps the auth implementation simple, transparent, and fully under project control without adding external service dependencies.

Impact:
- Passwords stored as bcrypt hashes (cost 12) in User.passwordHash
- Session cookie named `mitten-auth` stores user ID (httpOnly, 30-day expiry)
- Admin creates user accounts by running `prisma/seed.ts` locally
- First-time users set their own password at /setup
- Unapproved emails cannot create accounts

---

## 2026-03-03 — Admin-Controlled User Provisioning

Decision:
New user accounts are created by the administrator running a local seed script. Users then set their own passwords via the /setup page.

Status:
ACTIVE

Reason:
Keeps access control simple and fully administrator-controlled without requiring a self-registration flow or email sending service.

Impact:
- No public registration exists
- Admin runs `prisma/seed.ts` to pre-approve an email
- User visits /setup, enters their approved email, and chooses a password
- Unapproved emails are rejected at /setup with a clear message

---

## 2026-03-03 — Agents Are Project Scoped

Decision:
Agents exist inside projects rather than as global tools.

Status:
ACTIVE

Reason:
Estimating workflows are tied to a specific project’s drawings, specifications, and intake results.

Impact:
Agent routes use structure:

/projects/[projectId]/agents/{agent}

There will be no global agent hub.

---

## 2026-03-03 — Upload Pipeline Uses Presigned R2 Uploads

Decision:
Files are uploaded directly to Cloudflare R2 using presigned URLs rather than passing through the application server.

Status:
ACTIVE

Reason:
Prevents server bottlenecks and allows large PDF uploads.

Impact:
Upload workflow:

presign → upload → complete → analyze

Application server never handles file body during upload.

---

## 2026-03-03 — Analyzer Generates Sheet Records Automatically

Decision:
Sheet records are created automatically during intake analysis.

Status:
ACTIVE

Reason:
Allows downstream systems to work immediately with sheet-level data.

Impact:
Upload analyze step populates Sheet table using generate_series().