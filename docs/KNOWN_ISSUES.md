# docs/KNOWN_ISSUES.md

# Known Issues

Last updated: 2026-03-19

Purpose:  
Record real, observed problems that should be recognized quickly when they recur.

Only actual issues belong here.

---

## Prisma Client Stale After Schema Changes

Symptoms:
- queries fail unexpectedly after schema edits
- errors reference stale or missing Prisma models

Fix:
1. stop dev server
2. run `npx prisma generate`
3. restart dev server

Status:  
KNOWN

---

## Dev Server Running But Changes Not Reflected

Symptoms:
- code changes do not appear in the running app

Fix:
1. stop dev server
2. delete `.next`
3. restart `npm run dev`

Status:  
KNOWN

---

## Environment Variable Changes Not Picked Up

Symptoms:
- env-dependent behavior still reflects old values

Fix:  
Restart dev server after env changes.

Status:  
KNOWN

---

## Prisma CLI Can Use Different Env Source Than Next Runtime

Symptoms:
- app appears able to talk to the database
- `npx prisma migrate dev` fails with auth error such as `P1000`
- Prisma CLI and the running app behave like they are pointed at different DB credentials

Current understanding:
- local Next runtime may use `.env.local` precedence while Prisma CLI may default differently if config/env loading is not aligned
- this already caused a real migration/application mismatch during recent intake-state changes

Fix:
- ensure Prisma config loads env sources in the intended local precedence order
- if DB credentials change, restart dev server and rerun Prisma commands

Status:  
KNOWN

---

## Production Login Fails Due to TLS / Prisma / Supabase Issue

Symptoms:
- production login returns 500
- login page loads but authentication fails
- Prisma throws TLS-related error

Status:  
ACTIVE

Important note:  
This is tracked separately from intake architecture work. Local development remains the authoritative build environment.

---

## Purchased Functions Are Still Local-Browser Only

Symptoms:
- purchased functions are not durable across environments/browsers
- behavior depends on current browser storage

Cause:  
Current persistence is a temporary localStorage stub.

Status:  
ACTIVE

---

## Large Spec Books Are Still Far Too Slow on the Heavy Path

Symptoms:
- large spec books can complete successfully but still take far too long
- current real-world example: 1232-page specification book took roughly 51 minutes

Impact:
- this is not practical for real contractor workflows
- long intake times threaten overall MittenIQ usability

Current understanding:
- architecture is cleaner than before
- TPM failure behavior improved
- throughput is still weak
- some structured books are still going through more heavy AI/OCR work than they should

Status:  
ACTIVE

---

## Project Manual / Spec-Book Throughput Is Still Too Slow

Symptoms:
- a 432-page project manual/spec book took about 15 minutes
- output quality is improving, but runtime is still longer than ideal for practical contractor workflows

Impact:
- the intake result is becoming usable
- but speed still limits real-world adoption and user patience

Current understanding:
- the system is no longer collapsing under rate limits on this test case
- quality improvements are now outpacing speed improvements
- chunk count is still too high for text-heavy documents

Status:  
ACTIVE

---

## Rate-Limit Failure Is Better, but Throughput Is Still Weak

Symptoms:
- large spec books used to fail with 429 TPM errors
- retry/backoff improvements now allow those runs to complete
- runtime is still too long even when the run succeeds

Impact:
- stability improved
- real-world practicality is still not acceptable

Planned fix:
- improve adaptive chunking
- reduce prompt payload size
- add token/payload budgeting helper
- tune route-aware batching discipline
- reduce unnecessary heavy-path usage on structured spec books

Status:  
ACTIVE

---

## 429 Backoff Delays Are Now More Visible During Live Processing

Symptoms:
- project page continues updating while intake is running
- a chunk hits 429 TPM pressure
- stage appears to pause for an extended period while retry/backoff waits
- intake eventually resumes and completes

Impact:
- the system is behaving correctly
- but the user now feels the pause more directly because live processing is visible

Current understanding:
- this is not the same as “intake is stuck”
- this is an actual rate-limit delay surfacing in UX
- better throughput discipline and later delay messaging are still needed

Status:  
ACTIVE

---

## No Token Budgeting Helper Exists Yet

Symptoms:
- chunk payload size is not preflight-budgeted in a disciplined way
- large spec requests can still be wasteful or overly heavy

Impact:
- harder to control cost, speed, and reliability
- long documents remain slower and riskier than they should be

Planned fix:
- add request-size / token-budget estimation before AI calls

Status:  
ACTIVE

---

## Searchable / Vector PDF Can Still Produce Weak Usable Page Text

Symptoms:
- PDF appears searchable or vector-based at file level
- page-level extracted text is still weak or low-value
- AI may miss page identity even when it is visually obvious to a human

Cause:
File-level trust indicators do not guarantee strong page-level evidence.

Impact:
- native extraction alone is not reliable enough
- drawing identity and spec/manual understanding both suffer

Status:  
ACTIVE

---

## Blank / Divider Pages Are Still Under-Detected In Project Manuals

Symptoms:
- some intentionally blank or low-content divider pages still appear as named pages or spec/general pages
- examples observed on real project-manual test cases

Impact:
- page register quality drops
- review noise is higher than it should be
- users can still see junk entries like `PDF Page X`

Status:  
ACTIVE

---

## PDF Pagination Artifacts Still Leak Into Non-Drawing Page Names

Symptoms:
- labels such as `PDF Page 2`, `PDF Page 6`, `PDF Page 8`, or `-- 14 of 432 --` can still appear
- some repeated forms still show numeric PDF-page prefixes in names

Impact:
- page register feels less trustworthy
- output is less estimator-friendly
- users may confuse PDF order with actual document-local page identity

Status:  
ACTIVE

---

## Continuation Handling For Multi-Page Forms/Documents Is Still Incomplete

Symptoms:
- adjacent pages of the same multi-page form/document are not always reconciled cleanly
- examples include repeated front-end forms such as Application for Payment or Bid Bond pages

Impact:
- page register names still contain avoidable noise
- document navigation is improved but not yet clean enough

Status:  
ACTIVE

---

## TOC / Document-Structure Reconciliation Is Still Missing In The Live Intake Path

Symptoms:
- current output can identify many pages well
- but it does not yet use TOC pages or document structure to reconcile downstream page naming/classification consistently in the main pipeline

Impact:
- naming continuity is weaker than it could be
- section grouping and document continuity remain less reliable than target

Status:  
ACTIVE

---

## Structured Spec Fast Path Exists In Proof Of Concept Only

Symptoms:
- real tests proved bookmark-based section mapping works on some files
- the live intake pipeline does not use that fast path yet

Impact:
- structured consultant manuals still go through too much heavy AI/OCR work
- known available speed gains are not yet captured in production intake behavior

Current understanding:
- Fishbeck-style CSI manuals are proven fast-path candidates
- MDOT and ARTICLE/manual families also expose strong structure but need different normalization

Status:  
ACTIVE

---

## Fast-Path Normalization Is Currently CSI-Only

Symptoms:
- CSI consultant manuals can produce normalized section ranges from bookmarks
- MDOT books and ARTICLE/manual books show zero CSI-style qualifying sections despite strong outline structure

Impact:
- non-CSI structured documents are currently underutilized
- fast-path assessment would undercount real eligibility if based on CSI alone

Planned fix:
- add MDOT normalization
- add ARTICLE/manual normalization
- support GENERIC structured outlines

Status:  
ACTIVE

---

## Mixed Compound PDFs Need Better Structural Boundary Handling

Symptoms:
- one PDF may contain front-end docs, contract conditions, supplementary conditions, geotech, technical specs, vendor documents, attachments, and blank divider pages
- strong bookmarks may still span multiple structural grammars within the same file

Impact:
- one-size-fits-all normalization underperforms
- future project intelligence needs better subdocument awareness

Status:  
ACTIVE

---

## Drawing-Set Pages Can Still Drift Into The Wrong Role

Symptoms:
- pages that belong to the drawing sheet system can still be misunderstood
- especially text-heavy or tabular drawing-set pages such as quantity/schedule-style sheets

Current understanding:
- prompt tightening improved this behavior on at least one recent test
- but drawing-page role classification is not fully stable yet

Impact:
- page register quality drops
- trust can be misleading if the page is confidently put in the wrong bucket

Status:  
ACTIVE

---

## Drawing Sheet Identity Extraction Is Still Weak On Some Pages

Symptoms:
- the system classifies a page as a drawing but still extracts weak or incorrect identity fields
- sheet number and/or sheet title can still be wrong even when humans can see them clearly

Impact:
- page register quality degrades
- review burden stays higher than it should
- downstream drawing intelligence becomes less trustworthy

Current understanding:
- this is now clearly a distinct problem from broad page classification
- drawing page classification and drawing page identity extraction should be treated as separate improvement areas

Status:  
ACTIVE

---

## Job Number / Project Number Can Be Mistaken For Sheet Identity

Symptoms:
- a job number, project number, or reference code is treated as sheet identity
- the actual human-readable sheet title exists nearby in the same title block but is not prioritized correctly

Observed example:
- a recent drawing test file showed `211075A` being treated as if it were the primary page identity when it was actually a job/reference number

Impact:
- sheet title extraction becomes misleading
- page identity quality drops even when page class is correct

Current understanding:
- this is a title-block parsing hierarchy problem
- it is not the same as the earlier drawing-vs-general classification problem

Status:  
ACTIVE

---

## Drawing Title Extraction Can Still Grab The Wrong Text

Symptoms:
- a body note, instruction phrase, job number, or other visible block is used as the drawing title
- title-block evidence was not weighted correctly enough

Impact:
- page register quality degrades
- confidence can feel misleading to the estimator

Status:  
ACTIVE

---

## Spec PDFs Remain Harder Than Drawing Sets

Symptoms:
- section understanding is inconsistent
- classification and meaning extraction vary across spec books
- long spec books are both slower and more failure-prone

Cause:
- spec path is not yet optimized enough
- batching/payload control is still rough
- section understanding remains transitional
- reconciliation layers are still incomplete
- fast-path routing is not yet live

Status:  
ACTIVE

---

## Mixed-Content PDFs Still Need Cleaner Handling

Symptoms:
- one file may contain drawings, specs, bid docs, and mixed pages
- simple one-size-fits-all assumptions underperform

Impact:
- routing quality drops
- evidence preparation may be suboptimal page to page

Status:  
ACTIVE

---

## Current Review / Trust Logic Is Embedded, Not Modular

Symptoms:
- review flagging exists but still largely lives inside `run-ai-intake.ts`
- there is no first-class persistent review queue yet

Impact:
- review logic is harder to evolve cleanly
- future human verification flow is not fully built

Status:  
ACTIVE

---

## Sheet / Page Relationship Understanding Is Still Missing

Symptoms:
- no formal TOC reconciliation yet
- no broader drawing-sequence / duplicate / missing-sheet relationship layer yet
- only limited spec grouping exists today

Impact:
- trust verification is weaker than it should be
- downstream organization intelligence is incomplete

Status:  
ACTIVE

---

## OCR Worker Initialization Overhead

Observation:
OCR workers appear to reinitialize language data multiple times during large runs.

Impact:
- slower OCR execution
- increased runtime on large documents

Planned fix:
Introduce persistent OCR worker pool so initialized workers are reused across pages.

Status:  
ACTIVE

---

## Page Image Policy Still Needs Better Throughput Tuning

Symptoms:
- page image generation is structurally correct
- image generation policy is still not aggressively optimized for speed/cost balance

Impact:
- image generation may still do more work than ideal on long documents
- throughput tuning remains incomplete

Status:  
ACTIVE

---

## Large Chunk / Payload Pressure Still Hurts Large Spec Runs

Symptoms:
- long spec-book runs complete but remain too slow
- payloads are still heavier than they should be
- route-aware chunking exists but is not yet disciplined enough

Impact:
- lower practical throughput
- slower time-to-report
- increased cost pressure

Planned fix:
- adaptive chunk sizing by route and payload weight
- payload slimming
- token budgeting helper
- less prompt duplication
- better routing into structural fast paths where available

Status:  
ACTIVE

---

## Re-Run Intake Does Not Exist Yet

Symptoms:
- after prompt or intake logic changes, the same file must be reuploaded to test fresh behavior
- refresh alone only shows previously persisted results

Impact:
- testing and iteration are slower than they should be
- repeated uploads clutter the project uploads list
- developer tuning friction is higher than necessary

Status:  
ACTIVE

---

## Upload Delete Is Intentionally Blocked While Processing

Symptoms:
- user cannot delete an upload whose `intakeStatus` is `PROCESSING`
- API returns `409` and UI disables delete for processing rows

Current understanding:
- this is intentional to avoid race-condition mess while detached intake is still running
- later “force delete” or job-cancel logic may exist, but does not exist now

Status:  
KNOWN

---

## Detached Intake May Still Log Errors If A Row Disappears Mid-Run

Symptoms:
- background intake can attempt to update an upload that no longer exists or is no longer in the expected state
- this can produce noisy logs in edge cases

Current understanding:
- the normal delete path blocks `PROCESSING`, so this should be uncommon
- still possible in edge cases, crashes, or future workflow changes
- currently acceptable compared to adding bigger job-control complexity too early

Status:  
KNOWN

---

## Intake Logs Sometimes Appear Duplicated In The Terminal

Symptoms:
- some successful analyze runs show repeated post-chunk / completion log blocks with the same upload id and same counts
- the request still appears to complete normally with a single final POST

Current understanding:
- likely duplicated log output or dev-environment noise rather than true repeated full analysis work
- not yet confirmed as a pipeline bug

Impact:
- makes run diagnostics noisier
- can create false impression that work reran multiple times

Status:  
ACTIVE

---

## 432-Page Project-Manual Spec Run Still Shows Structural Noise

Observed metrics:
- anchors: 242
- specSections: 119
- blankPages: 0
- reviewNeededPages: 6

Observed issues:
- section anchor fragmentation
- blank page detection failure
- packet continuation naming inconsistent
- TOC / ordinal text leaking into page names
- form pages incorrectly flagged as drawing review
- section start pages generating avoidable review noise

Status:  
ACTIVE