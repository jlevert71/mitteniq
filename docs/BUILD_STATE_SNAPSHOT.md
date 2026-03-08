# Build State Snapshot (Current Reality)

This file is the authoritative record of the current system state.  
If code, memory or other documentation disagree, this document takes precedence.

Last updated: 2026-03-07

---

# Application Runtime

### Next.js Environment

Local development environment:

- ✅ Next.js dev server runs (`npm run dev`)
- ✅ App loads locally at http://localhost:3000
- ✅ App Router confirmed (`app/layout.tsx`, `app/page.tsx`)
- ✅ Turbopack dev server functioning

Local development system is considered **stable and operational**.

---

# Deployment Environment

### Hosting Platform

Production hosting:

Vercel

Domain:

https://mitteniq.com

GitHub repository connected to Vercel.

Deployment model:

- `main` → Production deployment
- feature branches → Preview deployments

---

# Production Deployment Status

Current status:

⚠ Production site deploys successfully but **login fails due to database TLS connection issue**.

Symptoms:

- Login page loads
- Credentials submit
- `/api/login` returns **500 Internal Server Error**
- Frontend returns user to login screen

Error observed in Vercel logs:

Prisma error code:

P1011

Error message:

Error opening a TLS connection: self-signed certificate in certificate chain

Cause:

TLS verification failure between Vercel runtime and Supabase pooler.

---

# Database Configuration

Database provider:

Supabase Postgres

Connection method:

Supabase PgBouncer pooler

Connection string environment variable:

DIRECT_DATABASE_URL

Expected format:

postgresql://user:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require

Prisma configuration file:

prisma.config.ts

Datasource definition:

url: env("DIRECT_DATABASE_URL")

---

# Current Database Connectivity Status

Local development:

✅ Database connection working  
✅ Authentication working locally

Production (Vercel):

❌ Prisma connection fails due to TLS verification issue

Error observed:

PrismaClientKnownRequestError  
Code: P1011  
Message: self-signed certificate in certificate chain

Database host reachable.

TLS verification currently blocking connection.

---

# Core Navigation

### Landing + Login

Routes:

/  
/login  
/setup

Status:

- Landing page loads
- Login page loads
- Setup route functional
- Production login currently failing due to DB connection error

---

# Projects Dashboard

Route:

/projects

Features verified locally:

- Project list loads
- Create project modal
- Delete project modal
- Upload counts displayed
- Links to project workspace

API calls verified locally:

GET /api/projects  
POST /api/projects  
DELETE /api/projects/[projectId]

---

# Project Workspace

Route:

/projects/[projectId]

Primary workspace UI.

Current layout:

TOP STRIP  
Agent tiles

MAIN WORK AREA  
- Purchased Functions panel (primary focus / report hub)
- Upload drawings/specs panel (secondary)

Header additions:

- compact project efficiency strip shown near project name
- current values are placeholders only:
  - Time saved: 0.0h
  - Manual cost: $0
  - MittenIQ cost: $0
  - Savings: $0
- note shown:
  - tracking starts after first purchase

Agent tiles present:

- Estimating Assistant
- Junior Estimator
- Senior Estimator
- Chief Estimator

---

# Purchased Functions (Temporary Implementation)

Persistence method:

localStorage

Key format:

miq:purchasedFunctions:{projectId}

Status:

- temporary stub only
- no billing implementation yet
- no database persistence yet

---

# Upload Storage

Storage provider:

Cloudflare R2

Client implementation:

lib/r2.ts

Uses AWS S3 SDK.

Upload path:

projects/{projectId}/uploads/{uploadId}/{filename}

---

# Upload Pipeline (Verified Locally)

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

---

# Intake Analyzer

File:

app/api/uploads/analyze/route.ts

Analyzer responsibilities:

- Download file from R2
- Run PDF integrity checks
- Extract page text
- Detect sheet identifiers
- Classify pages
- Generate intake report
- Populate Sheet table

---

# PDF Extraction Engine

### Previous Implementation

Library:

pdfjs-dist

Problem encountered:

Next.js server runtime failed to resolve the PDF worker.

Error:

Setting up fake worker failed: Cannot find module 'pdf.worker.mjs'

Impact:

- text extraction failed
- sheet classification failed
- content counts returned as zero
- sheet list remained empty

Root cause:

pdfjs-dist is **browser-first** and not reliably compatible with the Next.js Node server runtime.

---

# Current Extraction Engine

Library:

pdf-parse

Purpose:

Server-safe PDF parsing layer replacing pdfjs-dist.

Worker configuration:

import "pdf-parse/worker"  
import { PDFParse } from "pdf-parse"

Next.js configuration includes:

serverExternalPackages:

- pdf-parse
- @napi-rs/canvas

Behavior:

- extracts page text server-side
- does not rely on browser workers
- supports multi-page extraction for drawing sets
- feeds deterministic sheet detection pipeline

Extraction validated on real drawing set.

Example detected sheets:

P-1 — Title / Index Sheet  
C101 — Plan  
E001 — Notes  
E002 — Notes  
E003 — Notes  
E401 — Notes  
E402 — Diagram  
E601

---

# Intake Processing Pipeline

Current pipeline:

Upload  
→ R2 Storage  
→ Intake Analyzer  
→ PDF Text Extraction (pdf-parse)  
→ Deterministic Sheet Detection  
→ Sheet Classification  
→ Sheet List Generation  
→ Optional LLM Refinement

Deterministic detection produces initial sheet list.

Optional LLM layer refines detection only when needed.

---

# Intake Engine Status updated 3-7-2026

Status: ACTIVE DEVELOPMENT

Pipeline:

Upload  
→ Cloudflare R2  
→ PDF Extraction  
→ Layer 1 Page Evidence  
→ Layer 2 Structure Inference  
→ Sheet Records  
→ Optional LLM Refinement

Layer 1 generates:

- sheet number candidates
- sheet title candidates
- discipline candidates
- page class candidates
- sheet subtype candidates
- title block zone candidates

Layer 2 performs:

- numbering schema detection
- document pattern detection
- sheet conflict detection
- duplicate detection
- cross-page reasoning

Known limitation:

pdf-parse currently provides limited positional text information.  
Region-based detection operates primarily on fallback text slices.

Impact:

- title block detection limited
- caption detection limited
- specification parsing remains weak

# LLM Intake Assistance

Location:

lib/llm-intake.ts

Model:

gpt-4o-mini

Environment flag:

MITTENIQ_LLM_INTAKE_ENABLED=true

Behavior:

- receives deterministic extraction output
- may refine sheet classification
- may correct ambiguous sheet names
- may assist with document understanding

Safety rule:

Deterministic extraction results remain authoritative unless confidence is low.

# LLM Intake Integration (Verified Working 2026-03-08)

LLM refinement layer is now operational.

Location:

lib/llm-intake.ts

Model currently used:

gpt-4o-mini

Environment requirements:

.env.local

OPENAI_API_KEY=sk-proj-xxxxx  
MITTENIQ_LLM_INTAKE_ENABLED=true

Verified behavior:

- OpenAI client loads successfully
- API requests reach OpenAI servers
- LLM refinement executes when ambiguous pages exist
- Intake report reflects LLM participation

Example report output:

"llmAssist": {
  "used": true,
  "model": "gpt-4o-mini",
  "enabled": true,
  "refinedPages": 1,
  "candidatePages": 12
}

LLM refinement scope:

- sheet name improvement
- page class correction
- sheet subtype inference

LLM **cannot override deterministic fields** such as:

- page count
- print size
- scale status
- scale confidence

---

## LLM Token Guardrails

To avoid exceeding model context limits:

Candidate pages sent to the LLM are limited.

Current cap:

12 pages

Evidence text limits per page were reduced to maintain token safety.

Typical evidence provided to the LLM:

- bottom-right text
- bottom-band text
- top-band text
- tail text
- small full-text excerpt

This ensures the request remains below the 128k token limit for gpt-4o-mini.

---

# Sheet Classification System

Pages are classified into:

DRAWING  
SPEC  
BID  
GENERAL  
UNKNOWN

Detected metadata stored:

sheetNumber  
sheetName  
discipline  
sectionNumber  
sectionTitle  
isElectricalRelated  
sheetType  
scaleStatus  
scaleConfidence  
notes

---

# Intake Page

Route:

/intake?uploadId={uploadId}

Status:

Working locally.

---

# Intake Report Layout (LOCKED)

The intake page now follows a simplified estimator-focused layout.

Tiles:

1️⃣ PDF Confidence  
2️⃣ Sheet Count / Print Size  
3️⃣ PDF Name  
4️⃣ PDF Trust  
5️⃣ Sheet Types  
6️⃣ Sheet List

Additional controls:

- Open Full File
- Per-row Open Page
- Refresh report
- Back to project

---

# Sheet List

Each row contains:

- PDF page number
- detected type
- sheet name
- open page button

Page opening route:

/api/uploads/{uploadId}/file?page={pageNumber}

---

# File Viewing

Route:

GET /api/uploads/[uploadId]/file

Behavior:

- verifies ownership
- generates temporary R2 signed URL
- optionally appends #page anchor

---

# Security Updates (2026-03-07)

Secrets rotated during development:

- Supabase database password
- Cloudflare R2 access keys
- OpenAI API key

Environment variables updated accordingly.

---

# Known Issues

### Production login failure

Environment:

Production (Vercel)

Symptoms:

- Login POST `/api/login` returns 500

Root cause:

Prisma TLS connection failure with Supabase pooler.

Status:

Unresolved.

---

# Current Development Strategy

Continue development in **local environment**.

Production infrastructure issues tracked separately.

---

# Immediate Development Targets

1. Verify pdf-parse extraction across multiple drawing sets
2. Validate deterministic sheet detection accuracy
3. Improve sheet confidence scoring logic
4. Expand document intelligence capabilities
5. Improve LLM-assisted classification reliability

---

# CURRENT CODE ANCHORS

Primary analyzer:

app/api/uploads/analyze/route.ts

Primary intake UI:

app/intake/page.tsx

LLM intake helper:

lib/llm-intake.ts

Important dependencies:

- pdf-parse
- @napi-rs/canvas
- @aws-sdk/client-s3
- @aws-sdk/s3-request-presigner
- @prisma/client
- pg