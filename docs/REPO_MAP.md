# Repo Map (Verified)

Repo root: C:\Users\mitte\mitteniq

## Root files (observed)
- package.json
- package-lock.json
- next.config.ts
- tailwind.config.js
- tsconfig.json
- prisma.config.ts
- .env
- .env.local

## Root folders (observed)

- app/           → Next.js App Router application
- docs/          → Project documentation and system memory
- lib/           → Shared utilities (auth, prisma, storage helpers)
- prisma/        → Database schema and migrations
- public/        → Static assets
- node_modules/  → Installed dependencies (generated)
- .next/         → Next.js build output (generated — do not edit)

## Docs folder (observed)
- docs/build state/    → existing folder from prior work (leave as-is)
- docs/*.md            → new documentation files (added 2026-03-02)

## App Router Structure (verified)

Located under: app/

Top-level routes and folders:

- agents/      → agent-related UI (present, functionality not audited yet)
- api/         → server API routes
- dashboard/   → dashboard UI area
- intake/      → intake interface pages
- login/       → authentication UI (real credential login as of 2026-03-03)
- projects/    → project list and project detail pages
- savings/     → savings-related UI pages
- setup/       → first-time user account setup (added 2026-03-03)

Global app files:
- layout.tsx   → root application layout
- page.tsx     → root landing page
- globals.css  → global styles
- favicon.ico  → site icon

## API routes (observed from git status + dev logs)
- app/api/projects/route.ts
- app/api/projects/[projectId]/route.ts
- app/api/projects/[projectId]/uploads/route.ts
- app/api/uploads/presign/route.ts
- app/api/uploads/complete/route.ts
- app/api/uploads/analyze/route.ts
- app/api/uploads/get/route.ts
- app/api/uploads/[uploadId]/route.ts
- app/api/uploads/[uploadId]/sheets/route.ts
- app/api/debug/project/route.ts
- app/api/login/route.ts        → validates email + bcrypt password, sets session cookie
- app/api/logout/route.ts
- app/api/setup/route.ts        → allows pre-approved emails to set their own password (added 2026-03-03)

## Prisma / Database
- prisma/schema.prisma          → database schema
- prisma/migrations/            → migration history
- prisma/seed.ts                → admin user seeding + new user provisioning script

## Utility scripts (observed)
- checkSheets.js
- checkUpload.js
- describeSheet.js
- enumLabels.js