# Build State Snapshot (Current Reality)

Last updated: 2026-03-03

---

## What works (verified)

### Application Runtime
- ✅ Next.js dev server runs (`npm run dev`)
- ✅ App loads locally at http://localhost:3000
- ✅ App Router confirmed (`app/layout.tsx`, `app/page.tsx`)

### Core Navigation
- ✅ Projects page loads: GET /projects (200)
- ✅ Project detail page loads: GET /projects/{projectId} (200)

### API Layer
- ✅ Projects API responding:
  - GET /api/projects (200)
  - GET /api/projects/{projectId} (200)

### Upload Pipeline (End-to-End Verified)
- ✅ Upload presign:
  - POST /api/uploads/presign (200)
- ✅ Upload completion:
  - POST /api/uploads/complete (200)
- ✅ Intake analysis trigger:
  - POST /api/uploads/analyze (200)
- ✅ Upload list refresh:
  - GET /api/projects/{projectId}/uploads (200)

### Authentication (Verified 2026-03-03)
- ✅ Real credential-based login working
- ✅ Passwords stored as bcrypt hashes (cost 12)
- ✅ Login: POST /api/login (200 on valid credentials, 401 on invalid)
- ✅ Setup: POST /api/setup (200 for approved emails, 403 for unapproved)
- ✅ Session cookie: `mitten-auth` (httpOnly, 30-day expiry)
- ✅ Admin user seeded via `prisma/seed.ts`
- ✅ First-time user flow: admin pre-approves email, user sets own password at /setup

### Database / ORM
- ✅ Prisma schema present and generating client
- ✅ Postgres datasource configured
- ✅ Models verified:
  - User (email, passwordHash, role added 2026-03-03)
  - Project
  - Upload
  - Sheet

### Sheet System
- ✅ Sheet model fields verified:
  - pageNumber
  - sheetType
  - scaleStatus
  - scaleConfidence

### Repo Structure
- ✅ App Router folders verified:
  - agents
  - api
  - dashboard
  - intake
  - login
  - projects
  - savings
  - setup (added 2026-03-03)

---

## Partially Implemented / Not Yet Verified

- 🟡 Public deployed environment status
- 🟡 Cloudflare R2 production storage behavior
- 🟡 Dashboard and other routes not yet protected by auth middleware

---

## Known Broken Items
- None currently observed

---

## Current Objective
Stabilize project memory and documentation so development continuity survives across sessions and months.

---

## Immediate Next Steps
1) Add auth middleware to protect dashboard and other private routes
2) Build admin UI or refine seed script workflow for managing users
3) Continue incremental feature development under documented conventions