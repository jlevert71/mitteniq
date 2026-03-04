# Build State Snapshot (Current Reality)

Last updated: 2026-03-03

---

# Application Runtime

### Next.js Environment
- ✅ Next.js dev server runs (`npm run dev`)
- ✅ App loads locally at http://localhost:3000
- ✅ App Router confirmed (`app/layout.tsx`, `app/page.tsx`)
- ✅ Turbopack dev server functioning

---

# Core Navigation

### Landing + Login
- ✅ Landing page loads
- ✅ Login route works (`/login`)
- ✅ Setup route works (`/setup`)

### Projects Dashboard

Route:

/projects

Features verified:

- Project list loads
- Create project modal
- Delete project modal
- Upload counts displayed
- Links to project workspace

API calls verified:

GET /api/projects  
POST /api/projects  
DELETE /api/projects/[projectId]

---

# Project Workspace

Route:

/projects/[projectId]

Primary workspace UI.

Layout:

LEFT PANEL  
Agent tiles

RIGHT PANEL  
Upload system

Agent tiles present:

- Estimating Assistant
- Junior Estimator
- Senior Estimator
- Chief Estimator

Agents currently **UI placeholders only**.

Future routes defined:

/projects/[projectId]/agents/estimating-assistant  
/projects/[projectId]/agents/junior-estimator  
/projects/[projectId]/agents/senior-estimator  
/projects/[projectId]/agents/chief-estimator

---

# Authentication System (Working)

Credential-based authentication.

Login endpoint:

POST /api/login

Password hashing:

bcrypt cost 12

Session cookie:

mitten-auth

Properties:

- httpOnly
- 30-day expiry

User provisioning:

- Admin seeds approved email
- User sets password at `/setup`

---

# Upload Storage

Storage provider:

Cloudflare R2

Client:

lib/r2.ts

Uses AWS S3 SDK.

Environment variables:

R2_BUCKET  
R2_ENDPOINT  
R2_ACCESS_KEY_ID  
R2_SECRET_ACCESS_KEY

Uploads stored using path:

projects/{projectId}/uploads/{uploadId}/{filename}

---

# Upload Pipeline (Verified End-to-End)

Workflow:

1) Create upload record

POST /api/uploads/presign

2) Upload file to R2 via presigned URL

3) Complete upload

POST /api/uploads/complete

4) Trigger analysis

POST /api/uploads/analyze

5) Upload list refresh

GET /api/projects/[projectId]/uploads

Upload row fields confirmed:

filename  
pageCount  
intakeStatus

---

# Intake Analyzer

File:

app/api/uploads/analyze/route.ts

Analyzer:

- downloads file from R2
- runs lightweight PDF structural checks
- generates intake report
- updates Upload record

Checks include:

PDF header validation (%PDF-)  
xref detection  
text operator detection  
font detection  
image detection  
heuristic page count

Database fields populated:

pageCount  
isSearchable  
isRasterOnly  
intakeReport  
intakeStatus  
intakeError

---

# Sheet Generation

Sheets generated automatically during analyze step.

Existing sheets deleted:

DELETE Sheet WHERE uploadId

New sheets created via:

generate_series()

Example logic:

Page 1 → PLAN  
Page 2+ → DETAIL

Scale statuses:

PLAN → UNVERIFIED  
DETAIL → NO_SCALE_NEEDED

Scale confidence:

PLAN → 35  
DETAIL → 90

---

# Intake Status State Machine

Upload.status

PENDING  
UPLOADED  
FAILED

IntakeStatus

PENDING  
READY  
FAILED

Analyzer behavior:

- runs only when Upload.status = UPLOADED
- READY uploads not reprocessed
- FAILED uploads may retry

---

# File Viewing

Uploaded files can now be opened.

API route:

GET /api/uploads/[uploadId]/file

Security behavior:

- verifies logged-in user
- verifies project ownership
- generates temporary signed R2 URL
- redirects user to file

---

# Repo Structure (Relevant)

app/projects  
app/intake  
app/api/uploads  
app/api/projects  
app/api/login  
app/api/setup

lib/auth.ts  
lib/prisma.ts  
lib/r2.ts

---

# Known Issues

None currently reproducible.

One transient upload analyze failure observed but not reproducible.

---

# Current Objective

Stabilize intake system and prepare for estimator-facing features.

---

# Immediate Next Development Targets

1) Agent route implementation  
2) Sheet review UI  
3) Intake error display improvements  
4) Document classification  
5) Discipline detection