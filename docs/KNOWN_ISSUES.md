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
Refresh project data and confirm uploadId used consistently across routes.

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