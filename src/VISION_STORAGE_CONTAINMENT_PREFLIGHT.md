# VISION STORAGE CONTAINMENT — S2.0 PRE-FLIGHT

**Status:** READ-ONLY AUDIT COMPLETE. Nothing modified, dropped, migrated, or published.
**Purpose:** Prove the blast radius before removing client access to sensitive Storage.
**Method:** Full-repository static trace. Every Storage call site located by grep across `src/` and `base44/`, then read in place to determine the *actual client* used (never inferred from filename).

---

## 1. STORAGE CALL-SITE INVENTORY

18 call sites total. 17 are backend; 1 is browser but **dead code**.

| # | File:line | Bucket | Operation | Client |
|---|---|---|---|---|
| 1 | `base44/functions/uploadDocumentToSupabase/entry.ts:237` | `documents` | `upload` | service_role |
| 2 | `base44/functions/uploadDocumentToSupabase/entry.ts:250` | `documents` | `createSignedUrl(86400)` | service_role |
| 3 | `base44/functions/adminUploadDocument/entry.ts:136` | `documents` | `upload` | service_role |
| 4 | `base44/functions/adminUploadDocument/entry.ts:157` | `documents` | `createSignedUrl(86400)` | service_role |
| 5 | `base44/functions/adminUploadLibraryFile/entry.ts:57,59` | `consulting_library_files` | `getBucket` / `createBucket` | service_role |
| 6 | `base44/functions/adminUploadLibraryFile/entry.ts:81` | `consulting_library_files` | `upload` | service_role |
| 7 | `base44/functions/adminUploadLibraryFile/entry.ts:94` | `consulting_library_files` | `createSignedUrl(86400)` | service_role |
| 8 | `base44/functions/getUploadSignedUrl/entry.ts:100` | `documents` | `createSignedUploadUrl` | service_role |
| 9 | `base44/functions/getDocumentsAdmin/entry.ts:58` | `doc.storage_bucket \|\| consulting_library_files` | `createSignedUrl(900)` | service_role |
| 10 | `base44/functions/supabaseUserData/entry.ts:1350` | `doc.storage_bucket \|\| documents` | `createSignedUrl(900)` | service_role |
| 11 | `base44/functions/worksheetResponses/entry.ts:371` | `doc.storage_bucket \|\| consulting_library_files` | `createSignedUrl(900)` | service_role |
| 12 | `base44/functions/guestSessionService/entry.ts:214` | `documents` | `createSignedUploadUrl` | service_role |
| 13 | `base44/functions/guestSessionService/entry.ts:313` | `documents` | `remove` | service_role |
| 14 | `base44/functions/guestSessionService/entry.ts:359` | `documents` | `createSignedUrl(60)` | service_role |
| 15 | `base44/functions/googleDriveImport/entry.ts:91` | `documents` | `upload` | service_role |
| 16 | `base44/functions/googleDriveImport/entry.ts:103` | `documents` | `createSignedUrl(3600)` | service_role |
| 17 | `base44/shared/documentExtraction/extractEngine.ts:391` | `documents` | `createSignedUrl(300)` | service_role |
| 18 | `src/lib/supabaseClient.js:168` | — (`/storage/v1/bucket`) | bucket list probe (health) | **anon — DEAD CODE** |

Health/diagnostic metadata only: `lib/supabaseClient/entry.ts:124` and `supabaseHealthCheck/entry.ts:70` (`listBuckets`).

**No `download`, `move`, or `copy` operations exist anywhere in the codebase.** `remove` exists exactly once (#13, guest cleanup).

---

## 2. EXECUTION-CONTEXT CLASSIFICATION

Classified by the client actually constructed at each site, not by file location.

| Context | Count | Sites |
|---|---|---|
| **A — browser / frontend** | **0 live** | #18 only, and it is unreachable |
| **B — backend, normal (user) client** | **0** | no backend function uses a user-scoped Supabase client for Storage |
| **C — backend, service_role** | **17** | #1–#17 — every single one |
| **D — unknown** | **0** | — |

**Decisive detail:** `src/lib/supabaseClient.js` is never imported anywhere.

```
grep -rn "supabaseClient" src --include=*.js --include=*.jsx   →  NONE
```

Its exported helpers (`checkAnonStorageConnection`, `checkAnonAuthConnection`, `checkAnonDbConnection`, `saveAssessmentSession`, `saveAssessmentAnswers`, `saveAssessmentCalculation`, `saveGapAnalysis`, `saveProfileFinancials`, `signInWithEmail`, `signUpWithEmail`, `signOut`, `TEST_PROFILE_ID`) have **zero callers**. The file is a leftover scaffold.

Two consequences for S2:

1. **The browser never touches Storage.** The only browser-side Storage reference is an unimported health probe.
2. **That dead file also contains Supabase Auth endpoints** (`/auth/v1/token?grant_type=password`, `/auth/v1/signup`). It is the *only* mechanism in the repository by which `role = authenticated` could be created. It is unreachable today — which is precisely why the three policies are latent. **This file should be deleted in a later phase, and the fact that it exists is itself a finding: a dead scaffold containing a live path to the dangerous role.**

---

## 3. LIVE WORKFLOW MAP

All frontend entry points invoke Base44 functions. None call Supabase Storage directly.

| Workflow | Frontend call | Backend function | Bucket | Op | Authorization check | Policy required? |
|---|---|---|---|---|---|---|
| Data Room upload | `DocumentUpload.jsx:217` | `uploadDocumentToSupabase` | `documents` | upload + signed 86400 | profile by email → `validateBusinessScope`; advisor assignment | **NO** |
| Sprint attach document | `AttachDocumentModal.jsx:72` | `uploadDocumentToSupabase` | `documents` | upload | same | **NO** |
| Exit-readiness upload | `ReadinessModal.jsx:83` | `uploadDocumentToSupabase` | `documents` | upload | same | **NO** |
| Agreement attach | `AgreementEditor.jsx:135` | `uploadDocumentToSupabase` | `documents` | upload | same | **NO** |
| Admin file upload | `AdminFileUpload.jsx:51` | `adminUploadDocument` | `documents` | upload + signed 86400 | admin role; **target business not validated** | **NO** |
| Admin profile upload | `AdminUserProfileContext.jsx:416` | `adminUploadDocument` | `documents` | upload | same | **NO** |
| Admin library upload | `AdminFiles.jsx:77` | `adminUploadLibraryFile` | `consulting_library_files` | upload + signed 86400 | admin role | **NO** |
| Admin library list | `AdminFiles.jsx:54` | `getDocumentsAdmin` | — | DB query | admin/super/advisor | **NO** |
| Admin library delete | `AdminFiles.jsx:91` | `getDocumentsAdmin` | — | DB delete only | admin/super/advisor | **NO** |
| Admin doc signed URL | `AdminFiles` | `getDocumentsAdmin` | doc-derived | signed 900 | admin/super/**advisor** — **no document or business check** | **NO** (but IDOR) |
| Document viewer (canonical) | `useDocumentViewer.js:20` | `supabaseUserData` | `documents` | signed 900 | role + advisor assignment + owner/business via `assertBusinessAccess` | **NO** |
| Agreement viewer | `Agreements.jsx:46` | `supabaseUserData` | `documents` | signed 900 | same | **NO** |
| Sprint task open | `SprintTaskItem.jsx:185` | `supabaseUserData` | `documents` | signed 900 | same | **NO** |
| Readiness open by file_url | `ReadinessModal.jsx:112` | `supabaseUserData` | doc-derived | signed | same family | **NO** |
| Extraction pipeline | `runDocumentExtraction` | `extractEngine` | `documents` (hardcoded) | signed 300 | server-side, system path | **NO** |
| Guest upload | magic-loop flow | `guestSessionService` | `documents` | signed upload | guest-session scoped | **NO** |
| Guest extraction | — | `guestSessionService` | `documents` | signed 60 | prefix must equal `guest/{session}/` | **NO** |
| Guest cleanup | — | `guestSessionService:313` | `documents` | `remove` | session scoped | **NO** |
| Google Drive import | `GoogleDrivePicker` / `UploadDropdown` / `GoogleDriveImport` | `googleDriveImport` | `documents` | upload + signed 3600 | Base44 user; path `${user.id}/` | **NO** |
| Resource download | worksheet/valuation surfaces | `worksheetResponses` | doc-derived | signed 900 | `ownsDoc` / `isAssigned` / `isAdvisorAssigned` | **NO** |
| Health / status | `SupabaseStatus.jsx` | `getSignedUploadUrl` (410), `testSupabaseConnection`, `supabaseHealthCheck` | — | listBuckets | n/a | **NO** |

**Result: not one live workflow requires any of the three policies.**

---

## 4. CURRENT POLICY DEPENDENCY — THE DECISIVE ANALYSIS

### 4.1 Why the policies cannot be load-bearing

Three independent facts, any one of which is sufficient:

**Fact 1 — Role mismatch.** The policies are granted `TO authenticated`. A Supabase request is only `authenticated` when it carries a valid Supabase user JWT. No code in VISION ever presents one.

**Fact 2 — The browser is `anon`.** `src/lib/supabaseClient.js` sends `apikey` = `VITE_SUPABASE_PUBLISHABLE_KEY` and `Authorization: Bearer <anon key>`. That resolves to role **`anon`**, never `authenticated`. The anon role has **no** policy on `storage.objects` — it is already denied. And the file is unimported anyway.

**Fact 3 — The backend bypasses RLS entirely.** All 17 live Storage operations use `SUPABASE_SERVICE_ROLE_KEY`. `service_role` **bypasses RLS unconditionally**. The policies are not consulted. This is the single most important fact in this audit: even if `role = authenticated` became reachable tomorrow, VISION's own read/write paths would still not depend on these policies.

### 4.2 Per-policy verdict

| Policy | Dependent workflow? | Verdict |
|---|---|---|
| `authenticated_read_documents` (SELECT) | none | **NO** |
| `authenticated_update_documents` (UPDATE) | none | **NO** |
| `authenticated_upload_documents` (INSERT) | none | **NO** |

### 4.3 Why removal cannot break the current flow

Removing a policy only removes a *grant*. The three policies grant access to `role = authenticated`:
- no live request resolves to `authenticated`;
- the browser resolves to `anon` (already ungranted on `storage.objects`);
- every backend operation uses `service_role`, which does not consult policies at all.

Removal therefore changes the outcome of **zero** requests. It converts "denied by absence of an anon policy, granted to a role nobody holds" into "denied to everyone." That is the definition of a no-op for live traffic.

**Contrast with the bucket-level settings — do NOT bundle:** `file_size_limit` and `allowed_mime_types` are enforced by the Storage API for **all** callers, including `service_role`. RLS policies are bypassed by service_role; bucket limits are not. Setting a MIME allowlist could therefore break real uploads, whereas dropping these policies cannot. **They are different risk classes and must be separate slices.**

---

## 5. SIGNED URL AUDIT

| # | Source | Requester | Doc authorization first? | TTL | To browser | Persisted | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `uploadDocumentToSupabase:250` | any uploader | n/a (own upload) | **86 400 s** | via `file_url` | **YES → `documents.file_url`** | 24 h URL stored in DB and returned in list payloads |
| 2 | `adminUploadDocument:157` | admin | role only | **86 400 s** | via `file_url` | **YES** | target business not validated |
| 3 | `adminUploadLibraryFile:94` | admin | role only | **86 400 s** | via `file_url` | **YES** | library bucket |
| 4 | `getDocumentsAdmin:58` | admin/super/**advisor** | **NO — none** | 900 s | yes | no | **IDOR — see §7** |
| 5 | `supabaseUserData:1350` | owner/advisor/admin | **YES** (role + assignment + business) | 900 s | yes | no | correct pattern |
| 6 | `worksheetResponses:371` | owner/assignee/advisor | **YES** | 900 s | yes | no | correct pattern |
| 7 | `extractEngine:391` | system | n/a | 300 s | no (internal) | no | hardcodes `documents` |
| 8 | `guestSessionService:359` | guest session | **YES** (prefix must match session) | 60 s | internal | no | best practice in repo |
| 9 | `googleDriveImport:103` | importing user | n/a (own import) | 3600 s | via `file_url` | yes | path lacks business segment |

**Findings**

- **All signed URLs are minted with service_role.** Confirmed at every site.
- **No caller can supply an arbitrary object path.** Every path is derived server-side from a `documents` row or constructed by the function. The single exception is `getDocumentsAdmin`, where `document_id` selects the row — and that row is loaded without authorization.
- **`file_url` stores signed URLs** in all three upload paths, at 86 400 s. This is the largest leak surface: any list read, export, or `select('*')` redistributes a working 24-hour URL for a CONFIDENTIAL/HIGHLY_CONFIDENTIAL object.
- **`getDocumentSignedUrl` (row 5) is the correct reference implementation** — it resolves role, then advisor assignment, then owner-vs-business via `assertBusinessAccess`, then mints.

---

## 6. OBJECT PATH ARCHITECTURE

| Writer | Path convention | profile | business | opaque | filename |
|---|---|---|---|---|---|
| `uploadDocumentToSupabase` | `${profileId}/${businessId\|household\|hybrid\|profile}/${Date.now()}_${safeName}` | ✅ | ✅ (or scope token) | ❌ | ✅ |
| `adminUploadDocument` | `admin/${adminId}/${targetProfileId}/${targetBusinessId}/…` | ✅ | ✅ | ❌ | ✅ |
| `adminUploadLibraryFile` | `library/${adminId}/${Date.now()}_${safeName}` | ✅ | ❌ | ❌ | ✅ |
| `guestSessionService` | `guest/${guestSessionId}/${Date.now()}_${safeName}` | ❌ | ❌ | ✅ session | ✅ |
| `googleDriveImport` | `${user.id}/${Date.now()}_${safeName}` | ⚠️ **Base44 user id** | ❌ | ❌ | ✅ |

**Can client code construct or manipulate paths?** No. Every path is built inside a backend function and never accepted from the request. `guestSessionService` is the only place a path is echoed back to a client, and it is re-validated by prefix on the way in (`entry.file_path.startsWith('guest/{session}/')`).

**Anomalies**

1. **`googleDriveImport` uses `${user.id}` (the Base44 user id) as the leading segment**, while every other writer uses `${profileId}`. These are different identifier spaces. Files imported from Drive therefore land under a path segment that does not correspond to the owning profile. It is not an access vulnerability today (service_role only), but it breaks any future path-based reasoning and should be normalised.
2. Paths embed `profileId` and `businessId`, so a leaked path discloses tenant structure.

> **PATH STRUCTURE IS NOT AUTHORIZATION.** Even where `business_id` appears in a path, the backend must independently validate the resource from persisted data. No path may ever be treated as evidence of entitlement. This audit found no code that treats a path as authorization — which is correct — but the path design should still move to `{businessId}/{opaque_uuid}` in a later phase to reduce disclosure.

---

## 7. IDOR / BOLA FINDINGS

### F-1 — `getDocumentsAdmin.getSignedUrl` — cross-business signed URL (**P0, live**)

```
getDocumentsAdmin/entry.ts:44  — role gate: admin | super_admin | advisor
getDocumentsAdmin/entry.ts:52  — documents row loaded by id, NO business check
getDocumentsAdmin/entry.ts:57  — bucket taken from the row
getDocumentsAdmin/entry.ts:58  — createSignedUrl(doc.file_path, 900)
```

An **advisor** — a role that is correctly scoped to assigned businesses everywhere else — can supply any `document_id` and receive a working 15-minute download URL for **any business's document**. No assignment check, no business check, no profile check.

**This is a live cross-business signed-URL vulnerability that exists independently of the Storage policies.** It survives S2 entirely and must be closed in S3.

**Correct reference:** `supabaseUserData.getDocumentSignedUrl` (`:1338`) performs exactly the missing check via `assertBusinessAccess`.

### F-2 — `getDocumentsAdmin.delete` — cross-business deletion (**P0, live**)

```
getDocumentsAdmin/entry.ts:44-48 — deletes documents row by id, no business check
```
Same role gate, same omission. Deletes the DB row (leaving the storage object orphaned — see F-4).

### F-3 — `adminUploadDocument` — unvalidated target business (**P1, live**)

Admin-scoped, but `target_business_id` is never validated against anything. Admin-only, so lower severity, but it should still be recorded and audited.

### F-4 — Deletion orphans storage objects (**P1**)

`supabaseUserData.deleteDocument` (`:1370`) deletes `document_analysis` rows then the `documents` row. `getDocumentsAdmin.delete` deletes only the row. Neither removes the storage object. The **only** `storage.remove()` in the entire codebase is guest cleanup (`guestSessionService:313`). Every deleted document leaves a readable object behind at a known path.

### F-5 — 24-hour signed URLs persisted in the database (**P1**)

Three upload paths write `file_url` = a 86 400 s signed URL. Any row read that includes `*`, any export, any list payload carrying `file_url` redistributes a working URL. `documents.file_url` is read in the viewer fallback (`useDocumentViewer.js:79-81`).

### F-6 — Extraction hardcodes the `documents` bucket (**P2**)

`extractEngine.ts:392` uses `.from('documents')` rather than the row's `storage_bucket`. If extraction is ever run against a library or guest document, the signed URL is minted against the wrong bucket. Latent correctness bug with a security-adjacent failure mode.

### F-7 — Dead browser client containing Supabase Auth endpoints (**P2, latent**)

`src/lib/supabaseClient.js` — unimported, but contains `signInWithEmail`/`signUpWithEmail`. It is the only path in the repo by which `role = authenticated` could be created, which is exactly the condition that would activate the three policies. Delete it in a later slice.

---

## 8. RECOMMENDED S2 CONTAINMENT CHANGE

**Does removing the three `documents` policies achieve the target safely TODAY? YES.**

Target state after the change:

| Control | After S2 |
|---|---|
| Private bucket | ✅ already true |
| Direct client SELECT | ❌ denied (`anon` ungranted; `authenticated` ungranted) |
| Direct client INSERT | ❌ denied |
| Direct client UPDATE | ❌ denied |
| Direct client DELETE | ❌ denied (no policy existed) |
| Authorized backend broker | ✅ already the only path |
| Just-in-time short-lived signed URL | ✅ already the pattern (except `file_url` persistence → S6) |

**Smallest safe slice: drop the three policies on `storage.objects`. Nothing else.**

Not in this slice:
- bucket-level `file_size_limit` / `allowed_mime_types` (**different risk class — enforced for service_role too**);
- the `documents` bucket itself (leave untouched);
- `client-documents` and `consulting_library_files` (already **0 policies** → already deny-all);
- any code change;
- any broker change.

Dropping all three together is correct rather than splitting: they form one logical unit ("client access to the documents bucket"), the rollback is exact and identical in effort, and splitting would mean three production changes and three verification cycles for zero additional safety. If the team prefers one-at-a-time, **start with UPDATE** — it is the most dangerous (an unscoped UPDATE policy permits overwriting any object).

---

## 9. MIME / FILE-SIZE RECOMMENDATION

**Actually accepted today** (verified, not guessed):

- Server-side extension allowlist — `uploadDocumentToSupabase/entry.ts:33`:
  `pdf, csv, xls, xlsx, doc, docx, png, jpg, jpeg, webp`
- Client-side mirror — `DocumentUpload.jsx:21`, same set.
- Client-side limits — `uploadConfig.jsx`: **25 MB/file, 10 files/batch, 150 MB/batch**.
- Drive import MIME set — `GoogleDrivePicker.jsx:68`: pdf, png, jpeg, webp, xlsx, xls, docx, doc, csv.
- Document types in use — `uploadConfig.jsx:8-20`: business & personal tax returns, P&L, balance sheet, debt schedule, payroll report, insurance, entity documents, buy-sell agreement, estate documents, other.

**Gaps found**

- **Only extension is validated.** `content_type` is taken from the client (`fileType || 'application/octet-stream'`) and passed straight to Storage. The browser-reported MIME is attacker-controlled.
- **No server-side size ceiling is evidenced.** The 25 MB limit lives in frontend config; `uploadDocumentToSupabase` validates extension (`:114`) but no maximum size was found in the path.
- Buckets currently have `file_size_limit = NULL` and `allowed_mime_types = NULL`.

**Recommendation (do not set yet)**

- **Maximum upload size: 50 MB.** Above the current 25 MB client limit to allow headroom for scanned tax returns and multi-page financials, while bounding memory in the base64 pipeline. Keep the UI at 25 MB initially.
- **MIME allowlist** — mirror the verified extension set exactly:
  `application/pdf`, `text/csv`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`, `image/webp`
- **Validate from content, not the header.** Sniff magic bytes server-side; treat the client MIME as a hint only.
- **Caution:** bucket-level limits apply to `service_role` too. Roll out to a non-production project first, exercise every upload path in §3, then apply. This is its own slice (S2.1), not part of S2.

---

## 10. EXACT ROLLBACK SQL

**Step 0 — capture before dropping** (run first, archive the output):

```sql
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname in ('authenticated_read_documents',
                      'authenticated_update_documents',
                      'authenticated_upload_documents');
```

**The change (S2):**

```sql
drop policy if exists authenticated_read_documents   on storage.objects;
drop policy if exists authenticated_update_documents on storage.objects;
drop policy if exists authenticated_upload_documents on storage.objects;
```

**Exact rollback** — restores byte-equivalent behaviour from the verified definitions:

```sql
create policy authenticated_read_documents
  on storage.objects for select to authenticated
  using (bucket_id = 'documents');

create policy authenticated_update_documents
  on storage.objects for update to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

create policy authenticated_upload_documents
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');
```

Rollback is three statements, restores the prior posture exactly, and requires no deployment. Store the Step 0 output verbatim alongside the migration so fidelity is provable even if the definitions above drift from production text.

---

## 11. REGRESSION TEST MATRIX

| # | Scenario | Expected after S2 |
|---|---|---|
| 1 | `anon` key → SELECT any object in `documents` | **denied** |
| 2 | `anon` key → INSERT into `documents` | **denied** |
| 3 | `anon` key → UPDATE any object in `documents` | **denied** |
| 4 | `anon` key → DELETE any object in `documents` | **denied** |
| 5 | `authenticated`-role probe → SELECT/INSERT/UPDATE | **denied** (no policy) |
| 6 | Data Room upload end-to-end | **succeeds** |
| 7 | Sprint attach upload | **succeeds** |
| 8 | Exit-readiness upload | **succeeds** |
| 9 | Agreement attach upload | **succeeds** |
| 10 | Admin upload (document + library) | **succeeds** |
| 11 | Admin library list + delete | **succeeds** |
| 12 | Document viewer open (canonical path) | **succeeds** |
| 13 | Sprint task document open | **succeeds** |
| 14 | Extraction pipeline end-to-end | **succeeds** |
| 15 | Guest upload → extract → cleanup | **succeeds** |
| 16 | Google Drive import | **succeeds** |
| 17 | Worksheet/resource download | **succeeds** |
| 18 | Health/status surfaces | **succeeds** |
| 19 | `client-documents` direct client read | **denied** (unchanged — 0 policies) |
| 20 | `consulting_library_files` direct client read | **denied** (unchanged — 0 policies) |
| 21 | Rollback applied → all of 1–20 return to pre-S2 behaviour | **restored** |

Tests 1–5 are adversarial and must be run with the **anon** key only, never service_role (service_role would pass and prove nothing). Tests 6–18 are the blast-radius proof that nothing legitimate broke.

---

## 12. GO / NO-GO

**GO.**

The three policies are provably unreferenced by every live workflow, and `service_role` bypasses RLS entirely, so removal cannot alter the outcome of any current request. The change is a single reversible migration with an exact three-statement rollback and a complete regression matrix. It closes the latent cross-tenant hole before any identity work could activate it.

**Proceed with S2 only** — drop the three policies. Then S2.1 (bucket MIME/size, tested separately). S3 (the `getDocumentsAdmin` IDOR) remains the next live-severity item.

---

## FINAL DECISION

**A. Can `authenticated_read_documents` be safely removed today?**
**YES.** Zero dependent workflows. Policies are granted `TO authenticated`; no request resolves to that role; the browser is `anon`; all backend Storage uses `service_role`, which bypasses RLS.

**B. Can `authenticated_update_documents` be safely removed today?**
**YES.** Same reason. This is the most dangerous of the three (unscoped UPDATE permits overwriting any object), so it is the right one to drop first if the team prefers incremental rollout.

**C. Can `authenticated_upload_documents` be safely removed today?**
**YES.** Same reason. All uploads run through `uploadDocumentToSupabase`, `adminUploadDocument`, `adminUploadLibraryFile`, `guestSessionService`, and `googleDriveImport` — all service_role.

**D. Does any frontend currently require direct Supabase Storage access?**
**NO.** No frontend file imports the Supabase Storage client. `src/lib/supabaseClient.js` is unimported, and its only Storage reference is a bucket-list health probe that does not touch `storage.objects` policies.

**E. Does any document viewer require the authenticated Storage policy?**
**NO.** Every viewer path requests a short-lived signed URL from a backend function (`supabaseUserData.getDocumentSignedUrl` and siblings). Signed URLs are minted with service_role and are unaffected by RLS.

**F. Are all sensitive Storage operations already backend-brokered?**
**YES.** 17 of 18 call sites are backend service_role; the single frontend reference is dead code and not a Storage operation on `storage.objects`. There is **no live client-side Storage path**. (Reads are brokered; content is delivered by just-in-time signed URL.)

**G. What exact workflow would break if the policies disappeared?**
**None.** No workflow resolves to `role = authenticated`, and service_role does not consult policies. The only observable change is that a role nobody holds loses a grant it could never exercise.

**H. Is there any current cross-business signed-URL vulnerability?**
**YES — one, and it is not caused by the Storage policies.** `getDocumentsAdmin` (`entry.ts:44-59`) admits the **advisor** role, loads a `documents` row by id with **no business or assignment check**, and returns a 900 s signed URL. Any advisor can download any business's document by UUID. Its sibling `delete` action has the identical omission. Correct reference: `supabaseUserData.getDocumentSignedUrl:1338`. **This is S3, not S2** — S2 does not fix it and is not blocked by it.

**I. What is the smallest safe S2 implementation slice?**
Drop the three policies on `storage.objects` in one migration, having first captured the `pg_policies` definitions for verbatim rollback. Nothing else: no bucket-config change (MIME/size are enforced for service_role too and carry different risk), no code change, no broker change, no touch to the two already-empty buckets.

**J. GO or NO-GO for that slice?**
**GO.**

---

*Audit complete. Nothing was modified, dropped, migrated, published, or reconfigured. No credentials or tokens were accessed or reproduced.*