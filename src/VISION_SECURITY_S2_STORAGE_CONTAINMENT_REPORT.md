# VISION SECURITY — PHASE S2 STORAGE CONTAINMENT REPORT

**Phase:** S2 — Storage Containment, Implementation Slice 1
**Preflight:** `src/VISION_STORAGE_CONTAINMENT_PREFLIGHT.md` (complete)
**Status:** ⏳ **PREPARED — NOT EXECUTED.** Awaiting manual execution in the Supabase SQL Editor.

---

## 0. WHY THIS WAS NOT EXECUTED BY BASE44

The workspace's Supabase connection is scoped **`projects:read`, `secrets:read`, `database:read`** — read-only. It exposes no DDL path, and no migration-execution capability is available through it.

Per instruction, **no broader or persistent access was requested.** The migration is provided as exact SQL for manual execution. There is no partial or background application of this change.

---

## 1. MIGRATION NAME

`src/supabase/migrations/phase_s2_storage_containment.sql`

Companion verification: `src/supabase/migrations/phase_s2_storage_containment_verification.sql`

---

## 2. EXACT CHANGES

One transaction. One effective security change.

```sql
drop policy if exists authenticated_read_documents   on storage.objects;
drop policy if exists authenticated_update_documents on storage.objects;
drop policy if exists authenticated_upload_documents on storage.objects;
```

That is the complete set of mutations. Nothing else is created, altered, or dropped.

**Deliberately NOT in this slice** (all preserved exactly as-is):

| Not touched | Reason |
|---|---|
| `documents` bucket itself | out of scope |
| `file_size_limit`, `allowed_mime_types` | different risk class — enforced for `service_role` too |
| `client-documents`, `consulting_library_files` | already 0 policies → already deny-all |
| Any application code, function, table, schema | out of scope |
| `getDocumentsAdmin` | S3, not S2 |
| Signed URLs, `file_url`, object paths | separate controlled slices |
| `service_role` behaviour | unchanged and unchangeable by RLS |
| Replacement `authenticated` policies | none added — deliberately |
| Supabase Auth | not introduced |

---

## 3. PRECONDITION GUARD — DESIGN

Runs **inside the transaction, before the first DROP.**

For each of the three policies it verifies:

1. the policy **exists** on `storage.objects`;
2. `cmd` matches (SELECT / UPDATE / INSERT);
3. `roles` is **exactly** `{authenticated}` (rejects any broadened grant);
4. `qual` (USING) matches the audited shape;
5. `with_check` matches the audited shape.

**Drift handling.** Any mismatch raises an exception and aborts the whole transaction. An unexpected or altered policy definition is **never** silently deleted. The guard is deliberately shape-normalising — it lower-cases and strips `::text` casts, whitespace and parentheses — so an equivalent form such as `(bucket_id = 'documents'::text)` matches the audited `bucket_id = 'documents'` without being brittle about formatting, while still catching a genuine semantic change.

### Expected audited state

| Policy | Role | Command | USING | WITH CHECK |
|---|---|---|---|---|
| `authenticated_read_documents` | authenticated | SELECT | `bucket_id = 'documents'` | — |
| `authenticated_update_documents` | authenticated | UPDATE | `bucket_id = 'documents'` | `bucket_id = 'documents'` |
| `authenticated_upload_documents` | authenticated | INSERT | — | `bucket_id = 'documents'` |

### Precondition result

> **PENDING EXECUTION.** Record the `RAISE NOTICE` output here after running.

---

## 4. POSTCONDITION GUARD — DESIGN

Runs **inside the same transaction, after the DROPs.** Any failure rolls back everything.

| Check | Assertion |
|---|---|
| **A** | Zero policies named `authenticated_read_documents`, `authenticated_update_documents`, `authenticated_upload_documents` remain on `storage.objects` |
| **B** | Policy-count delta is **exactly 3** — no unrelated policy was disturbed |
| **C** | All three buckets still exist |
| **D** | All three buckets remain `public = false` |
| **E** | Bucket configuration recorded (read-only select) and `public` asserted false |
| **F** | No application object referenced — structural: the migration contains no statement outside `storage.objects` / `storage.buckets` |

### Postcondition result

> **PENDING EXECUTION.** Record the `RAISE NOTICE` output here after running.

---

## 5. VERIFICATION — DESIGN

`phase_s2_storage_containment_verification.sql` — read-only, idempotent, returns **one row**:

`documents_bucket_exists` · `documents_bucket_public` · `client_documents_bucket_exists` · `client_documents_bucket_public` · `consulting_library_bucket_exists` · `consulting_library_bucket_public` · `target_policies_remaining` · `total_storage_object_policies` · `unexpected_documents_authenticated_policies`

Two design points worth noting:

- **Bucket privacy uses `coalesce(..., true)`.** A missing bucket reads as *not private*, never as private-by-accident.
- **`total_storage_object_policies` is informational and must not be asserted as 0.** Unrelated, legitimate policies may exist now or later. The meaningful assertion is `target_policies_remaining = 0` plus `unexpected_documents_authenticated_policies = 0` — the latter counts *any* policy, whatever its name, still granting `authenticated` access referencing the documents bucket.

### Expected result

| Field | Expected |
|---|---|
| `documents_bucket_exists` | `true` |
| `documents_bucket_public` | `false` |
| `client_documents_bucket_exists` | `true` |
| `client_documents_bucket_public` | `false` |
| `consulting_library_bucket_exists` | `true` |
| `consulting_library_bucket_public` | `false` |
| `target_policies_remaining` | `0` |
| `unexpected_documents_authenticated_policies` | `0` |
| `total_storage_object_policies` | informational |

### Verification result

> **PENDING EXECUTION.**

---

## 6. REGRESSION TEST PLAN

To be run after execution. **No workflow is modified to make a test pass** — the point is to prove nothing broke.

| # | Workflow | Expected |
|---|---|---|
| 1 | Data Room upload | succeeds |
| 2 | Exact document open / view | succeeds |
| 3 | Document extraction | succeeds |
| 4 | Extraction review | succeeds |
| 5 | Document assignment | succeeds |
| 6 | Assignment notification | delivers |
| 7 | Notification deep link | resolves to the correct document |
| 8 | Galileo document retrieval | succeeds, business-scoped |
| 9 | Tax-return upload | succeeds |
| 10 | Financial-statement upload | succeeds |
| 11 | Guest upload + cleanup | succeeds |

**Negative assertions**

| # | Assertion | Expected |
|---|---|---|
| 12 | Browser authenticated Storage dependency appears | none |
| 13 | Direct authenticated Storage read required | none |
| 14 | Direct authenticated Storage upload required | none |
| 15 | Direct authenticated Storage update required | none |

### Regression results

> **PENDING EXECUTION.**

---

## 7. SECURITY TEST

**Conceptual:** after the DROPs, no policy on `storage.objects` grants `role = authenticated` bucket-wide SELECT, INSERT, or UPDATE for `documents`. With RLS enabled and zero applicable policies, the role is denied by default.

**Technical (safe methods only):** policy inspection via `pg_policies` (the verification script's `target_policies_remaining` and `unexpected_documents_authenticated_policies` both assert 0). This confirms the *absence of the grant* without touching any object.

**No unauthorized access is performed against real customer objects.** No controlled test object is required, because the assertion is about the policy surface, which is fully inspectable. If a live probe is ever added, it must use a disposable test object in a non-production project, never customer data.

### Security test result

> **PENDING EXECUTION.**

---

## 8. ROLLBACK SQL

Restores the exact prior state. **Not improved** — rollback means restoring, not fixing.

```sql
begin;
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
commit;
```

**Before executing the migration**, capture the production definitions verbatim so fidelity is provable even if formatting differs:

```sql
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname in ('authenticated_read_documents',
                      'authenticated_update_documents',
                      'authenticated_upload_documents');
```

Archive that output alongside the migration.

Rollback is three statements, requires no deployment, and restores the prior posture exactly. Note that restoring these policies re-opens a grant that **nothing currently uses** — they are latent either way.

---

## 9. UNEXPECTED BEHAVIOUR

> **NONE OBSERVED.** Nothing has been executed, so no deviation has occurred.

If the precondition guard aborts, that is a **finding, not a failure**: production has drifted from the audited state and must be re-audited before proceeding. Do not force the migration through.

---

## 10. FILES CHANGED

| File | Type | Effect on production |
|---|---|---|
| `src/supabase/migrations/phase_s2_storage_containment.sql` | new — prepared SQL | **none until manually executed** |
| `src/supabase/migrations/phase_s2_storage_containment_verification.sql` | new — read-only SQL | **none — reads only** |
| `src/VISION_SECURITY_S2_STORAGE_CONTAINMENT_REPORT.md` | new — this report | none |

---

## 11. CONFIRMATION — NOTHING ELSE WAS MODIFIED

- No application code changed.
- No authentication changed.
- No `service_role` behaviour changed.
- No bucket configuration changed.
- No `file_size_limit` or `allowed_mime_types` changed.
- No signed-URL logic changed.
- No `file_url` behaviour changed.
- No object paths changed.
- `getDocumentsAdmin` **not** touched.
- `client-documents` and `consulting_library_files` **not** touched.
- No replacement `authenticated` policies added.
- Supabase Auth **not** introduced.
- Storage **not** refactored.
- **Not published.**

---

## 12. DEFERRED ITEMS — RECORDED, NOT FIXED

Explicitly out of scope for S2, per instruction.

### 🔴 S3 PRIORITY — IMMEDIATE

**`getDocumentsAdmin` — advisor access to arbitrary document IDs.**
`getDocumentsAdmin/entry.ts:44-59` admits `admin | super_admin | advisor`, loads a `documents` row by `document_id` with **no business or assignment authorization**, and returns a **900-second signed URL**. Its `delete` action (`:44-48`) has the identical omission and deletes the row while orphaning the storage object.

**Impact:** any advisor can download — or delete — any business's document from a UUID.
**Correct reference:** `supabaseUserData.getDocumentSignedUrl:1338` performs the missing `assertBusinessAccess` check.
**Status:** live P0, **unaffected by S2.** S2 does not fix it and is not blocked by it.

### Other deferred items

| Item | Slice |
|---|---|
| Persisted 24-hour signed URLs in `documents.file_url` | S6 |
| Orphaned Storage objects on delete (only guest cleanup removes) | S6 |
| `googleDriveImport` path uses `${user.id}` while others use `${profileId}` | separate |
| MIME restrictions (`allowed_mime_types`) | S2.1 — tested separately; enforced for `service_role` |
| File-size restrictions (`file_size_limit`) | S2.1 — same caution |
| `src/lib/supabaseClient.js` — dead scaffold containing Supabase Auth endpoints | separate |
| Extraction hardcodes the `documents` bucket (`extractEngine:392`) | separate |

---

## 13. EXECUTION ORDER

1. Capture current policy definitions (§8 capture query) — archive the output.
2. Run `phase_s2_storage_containment.sql` in the Supabase SQL Editor.
   - If the precondition guard raises → **STOP.** Re-audit. Do not proceed.
   - Confirm `COMMIT` succeeded.
3. Run `phase_s2_storage_containment_verification.sql`.
   - Assert `target_policies_remaining = 0` and `unexpected_documents_authenticated_policies = 0`.
   - Assert all three buckets exist and are **not** public.
4. Run the regression plan (§6) against the live app.
5. Backfill the "PENDING EXECUTION" sections above with actual results.

**If anything fails at step 3 or 4:** run the rollback (§8). It restores the prior state exactly.

---

*Report prepared. No production system, policy, bucket, schema, code, or deployment was modified. No credentials or tokens were accessed or reproduced.*