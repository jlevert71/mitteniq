# Known Issues

Purpose:  
Record problems that have already occurred so they are recognized and solved immediately if they reappear.

Only real, previously observed issues belong here.

---

## Prisma Client Stale After Schema Changes

Symptoms:
- Upload or sheet queries fail unexpectedly.
- Error references missing model or stale Prisma client.

Cause:
Prisma Client not regenerated after schema updates.

Fix:
1. Stop dev server.
2. Run:
   npx prisma generate
3. Restart dev server:
   npm run dev

Status:
KNOWN + RESOLVED

---

## Upload Appears Successful But Intake Page Empty

Symptoms:
- Upload completes.
- Intake page shows no data.

Cause:
Upload and intake views querying different identifiers or stale state.

Fix:
- Refresh project data
- Confirm uploadId used consistently across routes
- Confirm intake page is opened with `?uploadId=...`

Status:
KNOWN

---

## Dev Server Running But Changes Not Reflected

Symptoms:
- UI changes do not appear after edits.

Cause:
Next.js cache or stale dev compilation.

Fix:
1. Stop dev server.
2. Delete `.next` folder.
3. Restart:
   npm run dev

Status:
KNOWN

---

## Environment Variable Not Loaded

Symptoms:
- Database connection or storage fails unexpectedly.
- Errors referencing missing env values.

Cause:
`.env.local` not loaded or server not restarted.

Fix:
Restart dev server after environment variable changes.

Status:
KNOWN

---

## Production Login Fails (Supabase TLS / Prisma)

Symptoms:
- Production site loads normally.
- Login form submits.
- User remains on login page.
- Network request:
  - POST /api/login → 500 Internal Server Error

Frontend console error:
- Failed to execute 'json' on 'Response': Unexpected end of JSON input

Server Logs:

Prisma error:
- P1011

Error message:
- Error opening a TLS connection: self-signed certificate in certificate chain

Occurs during:
- prisma.user.findUnique()

Environment:
- Hosting: Vercel
- Database: Supabase Postgres
- Connection type: PgBouncer pooler

Connection string format used:
- postgresql://user:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require

Cause (Suspected):
- TLS certificate verification failure between the Vercel runtime and Supabase pooler
- Prisma rejects the connection because the certificate chain cannot be verified
- Local development does not exhibit this issue

Current Status:
- Production authentication blocked
- Local development environment remains fully functional
- Development work continuing locally while TLS configuration is resolved

Status:
ACTIVE

---

## Purchased Functions Are Local-Browser Only

Symptoms:
- Purchased functions appear on one browser/session but are not truly persisted across environments or browsers
- Refreshing local purchase state works only for the current browser storage

Cause:
- purchased functions are currently stored in browser localStorage as a temporary UI stub
- no database persistence or billing system exists yet

Fix (future):
- replace localStorage purchase stub with real persistence and billing-aware ownership records

Current Status:
- expected temporary limitation during UI/workflow development

Status:
ACTIVE

---

## Sheet Confidence Logic Is Still v0 / Simplistic

Symptoms:
- Sheet preview shows confidence values and plain-English reasons
- Explanations may still feel generic or shallow
- Confidence is not yet based on rich classification or true scale-validation logic

Cause:
- current sheet-generation and scoring rules are placeholder/simple logic
- sheet type and confidence are still seeded from very basic defaults during analysis

Fix (future):
- upgrade sheet classification logic
- upgrade confidence scoring rules
- tie reasons to richer detected conditions

Current Status:
- UI explanation has improved
- underlying scoring still needs real refinement

Status:
ACTIVE

---

## Large Sheet Sets Can Be Noisy If Preview Is Not Collapsed

Symptoms:
- Very large upload sets can overwhelm the page if full sheet previews are expanded by default

Cause:
- long per-sheet output creates excessive vertical UI noise

Fix:
- sheet preview is now collapsed by default
- expanded state uses scrollable container

Current Status:
- mitigated in current Intake page

Status:
KNOWN + MITIGATED

## Positional Text Extraction Limitations

Current PDF extraction using pdf-parse does not consistently provide text coordinates.

Impact:

Region-based detection cannot reliably locate:

- title blocks
- diagram captions
- specification headers

Future solution options:

- alternate PDF extraction engine
- layout-aware OCR
- hybrid detection approach

## LLM Intake Token Limit Failures on Large PDFs

Symptoms:

- Intake report shows:

"skippedReason": "maximum context length exceeded"

Typical message:

"This model's maximum context length is 128000 tokens."

Cause:

Large document payloads exceed model context window when too many pages or excessive text are sent.

Mitigation:

- candidate pages limited to 12
- evidence text excerpts truncated

Future improvement:

- dynamic token budgeting
- adaptive candidate selection
- summarization layer before LLM refinement

Status:

MITIGATED