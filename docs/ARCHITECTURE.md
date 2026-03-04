# MittenIQ Architecture (Verified Source of Truth)

Last updated: 2026-03-02

This document contains **verified facts only**.  
If something is planned but not implemented/verified, it must be explicitly labeled **Planned** and dated.

---

## What MittenIQ is (Verified)

MittenIQ is a web application being built to support construction estimating workflows centered around Projects and document Uploads, with an Intake analysis step that produces Sheets and intake metadata.

---

## Technology Stack (Verified)

### Runtime / Framework
- Node.js (local dev via npm scripts)
- Next.js 16.1.6 (Turbopack) with App Router
- React 19.2.3
- TypeScript 5.x

### Styling
- Tailwind CSS 3.4.17
- PostCSS 8.5.6
- Autoprefixer 10.4.24

### Linting
- ESLint 9.x
- eslint-config-next 16.1.6

### Database / ORM
- Postgres (Prisma datasource provider: postgresql)
- Prisma 7.4.2
- @prisma/client 7.4.2
- @prisma/adapter-pg 7.4.2
- pg 8.19.0

### Storage / Upload tooling
- AWS SDK S3 client + presigner packages are present:
  - @aws-sdk/client-s3 ^3.1000.0
  - @aws-sdk/s3-request-presigner ^3.1000.0

### Email
- resend ^6.9.2

---

## Repo Structure (Verified)

Top-level folders:
- app/ (Next.js App Router)
- lib/ (shared utilities)
- prisma/ (schema + migrations)
- public/ (static assets)
- docs/ (project documentation)

Documentation files are maintained under:
- docs/ARCHITECTURE.md
- docs/BUILD_STATE_SNAPSHOT.md
- docs/CONVENTIONS.md
- docs/DECISIONS.md
- docs/REPO_MAP.md
- docs/CHANGELOG.md
- docs/TASK_QUEUE.md
- docs/KNOWN_ISSUES.md
- docs/ROADMAP.md
- docs/RESUME_PROMPT.md

---

## Domain Model (Verified from prisma/schema.prisma)

### Enums
- UploadKind: DRAWING | SPEC
- UploadStatus: PENDING | UPLOADED | FAILED
- IntakeStatus: PENDING | READY | FAILED
- SheetType: PLAN | DETAIL | NO_SCALE_NEEDED | UNKNOWN
- ScaleStatus: UNVERIFIED | VERIFIED | NO_SCALE_NEEDED

### User
- User has many Projects

### Project
- Project has required ownerId (User)
- Project has many Uploads

### Upload
Upload belongs to a Project and includes:
- kind (DRAWING or SPEC)
- filename
- r2Key
- sizeBytes
- mimeType
- status (PENDING/UPLOADED/FAILED)

Intake v1 fields on Upload:
- pageCount (optional)
- isSearchable (optional)
- isRasterOnly (optional)
- intakeReport (Json, optional)
- intakeStatus (PENDING/READY/FAILED)
- intakeError (optional)

Upload has many Sheets.

### Sheet
Sheet belongs to an Upload and includes:
- id (Text)
- uploadId
- pageNumber
- sheetType
- scaleStatus
- scaleConfidence (Int)
- notes (optional)
- createdAt / updatedAt (timestamptz)

Constraints:
- unique(uploadId, pageNumber)
- index(uploadId)

---

## API Surface (Verified from repo and local dev logs)

Observed API routes include:
- /api/projects (GET)
- /api/projects/[projectId] (GET)
- /api/projects/[projectId]/uploads (GET)
- /api/uploads/presign (POST)
- /api/uploads/complete (POST)
- /api/uploads/analyze (POST)
- /api/uploads/get (GET)
- /api/uploads/[uploadId] (route exists)
- /api/uploads/[uploadId]/sheets (route exists)
- /api/login (route exists)
- /api/logout (route exists)
- /api/debug/project (route exists)

Verified working sequence locally (HTTP 200 responses observed):
1) POST /api/uploads/presign
2) POST /api/uploads/complete
3) POST /api/uploads/analyze
and upload list refresh via:
- GET /api/projects/{projectId}/uploads

---

## Local Development (Verified)

Scripts (package.json):
- npm run dev -> next dev
- npm run build -> next build
- npm run start -> next start
- npm run lint -> eslint

Local URLs:
- http://localhost:3000
- http://localhost:3000/projects

---

## Planned (Not Yet Verified)

Nothing in this section should be treated as implemented unless later verified and moved out of Planned.