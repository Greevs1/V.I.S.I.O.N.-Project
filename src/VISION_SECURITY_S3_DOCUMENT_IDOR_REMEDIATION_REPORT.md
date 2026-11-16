# PHASE S3 — DOCUMENT IDOR/BOLA REMEDIATION REPORT

**Scope:** `base44/functions/getDocumentsAdmin/entry.ts` (+ one shared pure decision module)
**Status:** IMPLEMENTED · VERIFIED OFFLINE · PUBLISHED BY OWNER (2026-10-03) · **DEPLOYMENT IDENTITY NOT INDEPENDENTLY VERIFIED** · POST-PUBLISH SMOKE TESTS NOT EXECUTED
**Live testing of getDocumentsAdmin:** **intentionally not performed** — destructive production permission was denied, and that denial is the correct security outcome.

---

## RELEASE STATUS (FINAL — 2026-10-03)

| Gate | Status |
|---|---|
| S3 IMPLEMENTATION | **COMPLETE** |
| OFFLINE SECURITY VERIFICATION | **PASS** — 44/44 handler · 45/45 decision · 4/4 mutation |
| DIFF REVIEW | **PASS** — 2 runtime files + 2 test files + 1 report; nothing unrelated |
| SECURITY INVARIANTS (A–M) | **PASS** — 13/13 re-verified from final source |
| BUILD | **PASS** — `vite build` exit 0 |
| PRODUCTION REGRESSION | **NOT TESTED** — post-publish smoke tests were not executed (§15) |
| DEPLOYED REVISION VERIFIED | **NO — UNABLE TO VERIFY** — no deployed artifact or revision stamp is inspectable from this session (§15) |
| PUBLISH | **REPORTED PUBLISHED BY OWNER** — performed out of band 2026-10-03; deployment identity unverified |

**S3 is not to be called fully production-verified.** Two gates remain unmet: (1) the deployed revision has not been independently confirmed to be `5c245e9`, and (2) the legitimate post-publish smoke tests in §13 have not been executed. Neither gate may be reported as PASS.

---

## 0. EVIDENCE CLASSES

Each result below has exactly one label.

| Label | Meaning |
|---|---|
| **UNIT/MOCK TESTED** | The real source was executed with mocked inputs or an in-memory mock database. No network, no Supabase, no Base44 records. |
| **CONTROL-FLOW VERIFIED** | Ordering and reachability proven from the shipped source (and confirmed by mutation testing). |
| **SOURCE VERIFIED** | A direct assertion about the final source text (grep / inspection). |
| **BUILD VERIFIED** | The normal application build. |
| **LIVE READ-ONLY TESTED** | Executed live with read-only effect. |
| **NOT LIVE-TESTED** | Not executed against the deployed function. |

### Headline counts

| Class | Result |
|---|---|
| LIVE READ-ONLY TESTED | **0** — none performed (see §7) |
| UNIT/MOCK TESTED — full handler, in-memory DB | **44 / 44 passed** |
| UNIT/MOCK TESTED — decision module | **45 / 45 passed** |
| UNIT/MOCK TESTED — mutation (harness sensitivity) | **4 / 4 injected regressions caught** |
| CONTROL-FLOW VERIFIED | all gates proven (§4) |
| SOURCE VERIFIED | 7 / 7 required assertions hold (§5) |
| BUILD VERIFIED | `npx vite build` → exit 0, no errors |

**No production or customer record was read, created, modified or deleted by any step in this report. getDocumentsAdmin was never invoked through the live test harness.**

---

## 1. WHAT CHANGED

| File | Change |
|---|---|
| `base44/functions/getDocumentsAdmin/entry.ts` | Patched — authorization on all three actions |
| `base44/shared/authz/documentAccess.ts` | New — pure authorization decision (no I/O) |
| `src/scripts/getDocumentsAdmin.s3.mock.test.cjs` | New — offline full-handler harness (44 cases) |
| `scripts/documentAccessAuthorization.test.cjs` | New — decision-module + static guard (45 assertions) |

**Not changed:** Supabase schema, Storage policies, Storage buckets, Supabase Auth, entity schemas, frontend, signed-URL lifetime (900 s), and how deletion works. **The delete action was kept.** Authorization was not weakened, and no implementation change was made just to make the test harness pass.

---

## 2. OLD VULNERABILITIES (FIXED)

| ID | Action | Defect |
|---|---|---|
| V-1 | `delete` | Role gate only (`admin\|super_admin\|advisor`), then `delete().eq('id', <client UUID>)`. The row was **never loaded or authorized**, so any advisor could delete any document. |
| V-2 | query | A free-string `bucket`. Any value other than the two known ones **fell through to a branch with optional filters only**, so up to 200 rows came back across every business. |
| V-3 | `getSignedUrl` | The row was loaded but **not authorized**, so a 900 s URL could be issued for any document. |

---

## 3. HOW THE OFFLINE HARNESS WORKS — UNIT/MOCK TESTED

`src/scripts/getDocumentsAdmin.s3.mock.test.cjs` loads the **real TypeScript source**, transpiled at run time with the repo's own `typescript`. This covers the entry handler, `loadAuthorizedDocument`, `authenticateActor`, `authorizeBusinessAccess`, `assertBusinessAccess`, **`validateBusinessScope` (the canonical revocation rule)** and the decision module. It then sends requests to the captured `Deno.serve` handler.

**The only substitutions:**
- `createClientFromRequest` returns a fixed session user.
- `createClient` returns an **in-memory mock database**.
- `Deno.env` is a fake env.

The mock logs every operation in order, including every `delete` and every `createSignedUrl`. So "denied requests never reach delete" is **observed in execution**, not just inferred.

**Fixtures (in memory only):**
- Owner of `b-1`.
- Foreign owner of `b-2`.
- Assigned advisor of `b-2` (`business_entities.assigned_advisor_id`).
- **Revoked** advisor (`advisor_assignments.status = 'revoked'` on `b-2`).
- Unrelated advisor.
- Team member of `b-2`.
- Document assignee with an assignment row but no business access.
- Unrelated user, admin (Base44 role), and super_admin (`profiles.app_role`).
- Documents: own, foreign, null-business, and consulting library.

### Mutation proof — the harness can fail

Each regression was injected **in memory only** (the file on disk was untouched). The clean source was then re-run and passed 44/44.

| Injected regression | Harness failures | Caught |
|---|---|---|
| M1 remove the authorization guard (`if (!verdict.authorized) throw`) | 15 | ✅ |
| M2 remove the bucket-allowlist refusal | 4 | ✅ |
| M3 drop the non-admin `business_id` constraint | 3 | ✅ |
| M4 delete by raw request id before authorization | 13 | ✅ |

---

## 4. TEST RESULTS

All rows below are **UNIT/MOCK TESTED** (real handler, in-memory DB) and **NOT LIVE-TESTED**.

"Delete / URL executed" is taken from the operation log.

### VIEW (`getSignedUrl`)

| Case | Status | URL minted |
|---|---|---|
| owner + own document → allow | 200 | yes (ttl 900) |
| owner + foreign document → deny | 404 | **no** |
| active assigned advisor → allow (existing semantics) | 200 | yes |
| team member, authorized business → allow (existing semantics) | 200 | yes |
| unrelated advisor → deny | 404 | **no** |
| **revoked advisor → deny** (log shows `advisor_assignments` was consulted) | 404 | **no** |
| unrelated user → deny | 404 | **no** |
| document assignee without business access → deny | 404 | **no** |
| null `business_id`, non-owner → deny | 404 | **no** |
| nonexistent document → deny | 404 | **no** |
| invalid identifier → 400 | 400 | **no** |
| **mismatched caller `business_id` cannot grant** (stranger sends `b-1`, admin `profile_id`/`user_id`/`_router_user_email`) | 404 | **no** |
| **mismatched caller `business_id` cannot revoke** (advisor sends `b-1`; tenant stays `b-2`) | 200 | yes, path taken from the row |
| caller-supplied `file_path` / bucket ignored | 200 | path and bucket taken from the row |
| unauthenticated → 401 | 401 | **no** |

### DELETE

| Case | Status | Delete executed | Mock rows after |
|---|---|---|---|
| owner-of-record → allow | 200 | 1, scoped to `id = d-own` only | 3 (only the target was removed) |
| admin → allow | 200 | 1, scoped to the authorized row | 3 |
| super_admin (`app_role`) → allow | 200 | 1, scoped to the authorized row | 3 |
| active assigned advisor → deny | 404 | **0** | 4 |
| **revoked advisor → deny** | 404 | **0** | 4 |
| unrelated advisor → deny | 404 | **0** | 4 |
| team member (not owner/admin) → deny | 404 | **0** | 4 |
| document assignee → deny | 404 | **0** | 4 |
| unrelated user → deny | 404 | **0** | 4 |
| owner + foreign document → deny | 404 | **0** | 4 |
| nonexistent UUID → deny | 404 | **0** | 4 |
| forged admin identity in body → deny | 404 | **0** | 4 |
| unauthenticated → 401 | 401 | **0** | 4 |
| missing `document_id` → 400 | 400 | **0** | 4 |

For the allowed cases, the log also shows the `documents` row was **loaded before** the delete was issued.

### QUERY

| Case | Status | Document list query executed | Result |
|---|---|---|---|
| admin, default bucket → scoped | 200 | yes, `file_scope = consulting_library` | `d-lib` only |
| admin, `documents` + `b-2` → scoped | 200 | yes | `d-foreign` only |
| `bucket = 'x'` → reject | 400 | **no** | — |
| `bucket = ''` → reject (empty is not valid) | 400 | **no** | — |
| `bucket = null` → reject | 400 | **no** | — |
| unknown bucket, non-admin → reject | 400 | **no** | — |
| authorized advisor + assigned business → scoped | 200 | yes, `business_id = b-2` | `d-foreign` only |
| advisor with no business → 403 (no global listing) | 403 | **no** | — |
| advisor → unrelated business → 403 | 403 | **no** | — |
| **revoked advisor → former business → 403** | 403 | **no** | — |
| unrelated user → 403 | 403 | **no** | — |
| filters cannot broaden (foreign `target_profile_id`) | 200 | yes, `business_id = b-2` kept | empty (narrowed, not broadened) |
| `limit: 999999` → clamped | 200 | yes, `limit = 200` | `d-foreign` only |
| forged admin identity in body does not elevate | 403 | **no** | — |
| unauthenticated → 401 | 401 | **no** | — |

### Decision module — UNIT/MOCK TESTED (45 / 45)

The real `documentAccess.ts`, run in a sandbox:
- The full VIEW/DELETE table passed.
- An advisor or team member who **has** business access is still denied DELETE, and the injected business check is called **0 times**.
- Purity holds: no imports, no `sb.from(`, no `createSignedUrl`, no `.delete(`, no request `body`.

---

## 5. CONTROL-FLOW VERIFIED

Line numbers refer to the final `entry.ts`.

```
DELETE
  100  authenticateActor(base44, sb)                       401 if no session
  107  loadAuthorizedDocument(sb, actor, id, 'delete')
         52–59  load row server-side; 404 if absent
         64–74  authorizeDocumentAccess(...)  (delete: owner-of-record | admin)
         77     if (!verdict.authorized) throw HttpError(404)
  110  sb.from('documents').delete().eq('id', doc.id)       ← ONLY THEN

GETSIGNEDURL
  100  authenticateActor
  119  loadAuthorizedDocument(..., 'view')   → line 77 guard
  124  createSignedUrl(doc.file_path, 900)                 ← ONLY THEN

QUERY
  100  authenticateActor
  140  ALLOWED_BUCKETS.includes(bucket)  else 400 return
  151  non-admin: authorizeBusinessAccess(sb, actor, target_business_id)  else 403
  180/183  business_id constraint (non-admin: unconditional)
         execute the scoped query
```

**No alternate branch bypasses these gates:**
- There is **exactly one** `.delete(` (line 110) and **exactly one** `createSignedUrl` (line 124).
- Each is reachable only after `loadAuthorizedDocument` returns.
- `loadAuthorizedDocument` contains **no `try/catch`** that could swallow the line-77 throw.
- The query has no `else` fallback for unknown buckets.

Mutation tests M1 and M4 confirm that breaking this ordering is detected.

---

## 6. SOURCE VERIFIED

| Required assertion | Evidence |
|---|---|
| No delete occurs before authorization | single `.delete(` at line 110, after the guard at 77 via line 107 |
| No `createSignedUrl` occurs before authorization | single call at line 124, after line 119 |
| No unrestricted query fallback exists | the bucket check returns 400 at line 140; scoping has explicit branches only |
| No client `profile_id` determines the actor | the actor comes only from `authenticateActor(base44, sb)`; there are no `body.profile_id` / `body.user_id` / `_router_user_email` reads |
| No client `business_id` determines the document tenant | the decision uses `doc.business_id`; there is no `body.business_id` read |
| No arbitrary bucket value reaches the broad query | `ALLOWED_BUCKETS.includes` gate; the signed-URL bucket comes from the row (`doc.storage_bucket`) |
| Revoked relationships are rejected through canonical business access | `writeGuard.ts:149` `advisorRow.status !== 'revoked'`, reached via `assertBusinessAccess` / `authorizeBusinessAccess`; behavior exercised in §4 |

---

## 7. LIVE TESTING — NOT LIVE-TESTED

| Item | Status |
|---|---|
| Every getDocumentsAdmin case above | **NOT LIVE-TESTED — destructive production permission intentionally denied.** |
| Live read-only probes of getDocumentsAdmin | **NOT LIVE-TESTED** — the invocations were rejected, and per instruction the live harness is no longer used for this endpoint |
| `validateBusinessScope` against real relationship rows | **NOT LIVE-TESTED** — verified only against the in-memory fixtures |
| Admin Files view (`AdminFiles.jsx`) list and delete in the deployed app | **NOT LIVE-TESTED** — admin paths pass in the mock (§4) |

This is an acceptable and correct security result. If live confirmation is wanted later, it belongs in a disposable or staging environment with controlled test records, never production.

---

## 8. SAFE REGRESSION CHECKS

| Item | Class | Status |
|---|---|---|
| Application build | BUILD VERIFIED | ✅ exit 0, no errors |
| Admin list (`AdminFiles` sends `{}`) | UNIT/MOCK TESTED | ✅ 200, library-scoped |
| Admin delete | UNIT/MOCK TESTED | ✅ 200, only the target row removed |
| Data Room open, document assignment, notification deep links | SOURCE VERIFIED | untouched — separate functions and components, no file changed |
| Storage policies / schema / migrations | SOURCE VERIFIED | unchanged |

**Intended behavior change:** advisors can no longer delete from the admin Files view. This matches the canonical owner delete path.

---

## 9. DEFERRED SIBLING VULNERABILITIES (NOT FIXED IN S3)

| # | Finding | Severity |
|---|---|---|
| 1 | `getDocumentSignedUrl` (`supabaseUserData`): its advisor branch bypasses `validateBusinessScope`, so **revoked advisors still get signed URLs**. **Recommended next slice.** | HIGH |
| 2 | `checkDocumentAnalysisById`: the only check is "authenticated"; any analysis UUID returns `select('*')` | HIGH |
| 3 | `createDocumentAnalysis`: authorizes on a body `profile_id`, and a body `business_id` can override the tenant | HIGH |
| 4 | `/admin` route / `AdminView` has no role guard (the backend now enforces documents independently) | MEDIUM |
| 5 | Signed-URL lifetime (900 s) | LOW |
| 6 | Storage object / analysis-row orphans left on delete | LOW |

---

## 10. CONFIRMATION

- ✅ getDocumentsAdmin was **not** invoked through the live test harness, and no destructive permission was requested.
- ✅ No production or customer record was created, read, modified or deleted.
- ✅ The delete action was kept, authorization was not weakened, and nothing was changed to suit the harness.
- ✅ No schema, Storage policy, bucket, Auth or entity change.
- ✅ No code, schema, Storage, RLS or auth change was made after the reviewed revision.
- ⚠️ Published by the owner on 2026-10-03. The deployed revision was **not** independently inspected, and no post-publish smoke test was executed from this session (§15).

---

## 11. FINAL DIFF REVIEW

Reviewed the complete S3 change window: `e924822..HEAD` (five commits). Working tree clean; no untracked files.

**Net change set — exactly 5 files:**

| File | Class |
|---|---|
| `base44/functions/getDocumentsAdmin/entry.ts` (M, +151/‑28) | **RUNTIME SECURITY CHANGE** |
| `base44/shared/authz/documentAccess.ts` (A, +71) | **RUNTIME SECURITY CHANGE** — the new shared document permission helper |
| `src/scripts/getDocumentsAdmin.s3.mock.test.cjs` (A, +285) | **TEST ONLY** |
| `scripts/documentAccessAuthorization.test.cjs` (A, +292) | **TEST ONLY** |
| `src/VISION_SECURITY_S3_DOCUMENT_IDOR_REMEDIATION_REPORT.md` (A) | **REPORT/DOCUMENTATION ONLY** |

**Runtime changes are limited to the two intended files.** Inspecting the `entry.ts` diff confirms every change is the S3 authorization remediation: header note, the three authorization imports, `loadAuthorizedDocument`, the actor resolved from `authenticateActor`, DELETE authorized before delete, `getSignedUrl` authorized before URL minting, the bucket allowlist, the business-scoped query, limit clamping, and status-preserving error handling. No unrelated logic, no refactor beyond authorization.

**Nothing unrelated found. Deferred findings confirmed untouched (0 changed files each):** `supabaseUserData` (`getDocumentSignedUrl`), `checkDocumentAnalysisById`, `createDocumentAnalysis`, `shared/authz/actor.ts`, `shared/businessScope/writeGuard.ts`, `shared/businessScope/activeBusiness.ts`, `src/supabase/migrations/*`, `src/lib/supabaseClient.js`.

---

## 12. SECURITY INVARIANTS — RE-VERIFIED FROM FINAL SOURCE (13/13 PASS)

| # | Invariant | Evidence |
|---|---|---|
| A | Actor comes from `authenticateActor` | line 100; no other actor source |
| B | Client profile/user identity cannot establish actor identity | no `body.profile_id` / `body.user_id` / `_router_user_email` reads; `auth.me()` not called in the handler |
| C | Specific-document operations load the document first | both actions call `loadAuthorizedDocument`, which selects the row |
| D | `business_id` derived from the loaded document | decision uses `doc.business_id`; no `body.business_id` |
| E | VIEW authorization before `createSignedUrl` | guard at 119 precedes mint at 124 |
| F | DELETE authorization before delete | guard at 107 precedes the single `.delete()` at 110 |
| G | DELETE is owner/admin only under S3 semantics | delete branch returns owner-allow else flat deny; no `require_business` |
| H | Advisor role alone grants no delete | `advisor` appears nowhere in the delete decision or delete block |
| I | Revoked advisor grants no view via the new S3 path | `assertBusinessAccess` → `validateBusinessScope` (`advisorRow.status !== 'revoked'`) |
| J | Unknown bucket cannot reach a document query | allowlist returns 400 before the query; no broadening fallback |
| K | Collection queries constrained to authorized business | non-admin: `authorizeBusinessAccess` then unconditional `business_id` constraint |
| L | Filters narrow but cannot broaden | `target_profile_id` narrows inside the business constraint; limit clamped |
| M | Knowing a UUID grants no access | unauthorized and nonexistent both return 404 after load-and-authorize |

Invariants G–I, K and M are also proven behaviorally in §4 (real handler, in-memory DB), including the case where an advisor has full business access and is still denied DELETE with the business check never consulted.

**Note on scope:** for non-admins the business constraint is unconditional. The admin path retains the platform library listing for the `consulting_library_files` bucket; that is the pre-existing admin surface, gated by the authenticated admin role from `authenticateActor`. No change was made to it in S3.

---

## 13. POST-PUBLISH SMOKE TEST PLAN (PREPARED — NOT EXECUTED)

**Execution status after the 2026-10-03 publish: NOT TESTED.** None of Tests 1–4 was executed: this session cannot drive an authenticated browser session against the live app, so no legitimate owner / admin / advisor workflow could be performed. The plan is handed off for manual or Testing-Agent execution (§15.2). Per instruction, an unexecuted test is never recorded as PASS.

Run only after publishing, with legitimate accounts, in the order below. **No destructive step is included.**

| Test | Account | Steps | Pass criterion |
|---|---|---|---|
| **1 — Owner document view** | Legitimate owner | Open Data Room → open one document belonging to that owner's business | Document loads normally |
| **2 — Owner document workflow** | Same owner | Return to Data Room → confirm listing → open and close a document | Listing works; open/close normal; no authorization error |
| **3 — Admin Files list** | Account legitimately authorized for the admin Files surface | Open Files | Expected authorized documents list. **Do not delete anything.** |
| **4 — Advisor normal view** | Only if a safe legitimate advisor relationship exists | Open a document belonging to a currently authorized business | View still works |

**Prohibited during smoke testing:** probing foreign UUIDs against production, deleting production documents, modifying customer documents, or creating destructive test records.

**Stop conditions:** any owner listed in Tests 1–2 receives a 403/404, or Test 3 returns an empty or incorrect list, means a rollback decision is required before proceeding.

---

## 14. APPROVAL GATE — SATISFIED, PUBLISH PERFORMED BY OWNER

**APPROVED.** All pre-publish release conditions were met:

- ✅ diff contains no unrelated runtime changes
- ✅ 44/44 handler cases pass
- ✅ 45/45 authorization decision cases pass
- ✅ mutation/security guard passes (4/4 injected regressions caught)
- ✅ build passes

Publish was performed by the owner on 2026-10-03, outside this session. This session did not publish and made no code change.

---

## 15. POST-PUBLISH VERIFICATION ATTEMPT (2026-10-03)

### 15.1 DEPLOYED REVISION VERIFIED = UNABLE TO VERIFY

| Check | Result |
|---|---|
| Source revision in this workspace | `5c245e9f88736a2ab88aa62c0cb2ede2d7a20aff` (`5c245e9`) — this confirms what SHOULD be deployed, not what is |
| Working tree | CLEAN — every change committed; no drift since the reviewed revision |
| `base44/functions/getDocumentsAdmin/entry.ts` content hash | `319ba7947816e96412a685fabbba9f1a24f4f102` (`319ba79`) |
| `base44/shared/authz/documentAccess.ts` content hash | `d742e1d18ff3f374deefb58ef97fec793dbb4087` (`d742e1d`) |
| Reviewed change set re-confirmed | exactly 5 files across `e924822..HEAD`; 0 unrelated changes |
| Deployed artifact / revision stamp | **NOT INSPECTABLE** — no deploy artifact or revision stamp exists in the workspace (only an unrelated local `dist/`), and no facility available to this session can read the deployed revision |
| Published site liveness | The published URL responds. **This only shows hosting serves; it does not identify the deployed backend function revision and is not evidence for it.** |

**Statement of limitation.** The deployed runtime could not be independently inspected. Repo state matching the reviewed revision is **not** proof of what is deployed; the owner's explicit instruction was that deployment success must not be inferred from the source branch, and it is not inferred here. **DEPLOYED REVISION VERIFIED = UNABLE TO VERIFY.**

**Deliberate decision — no live probe.** The reviewed behavior "unauthenticated → 401" could in principle be probed with an unauthenticated request carrying no document identifier. **This was not done.** A live probe of this endpoint was previously and explicitly ruled out, both because the handler carries the delete capability and because any probe would have risked triggering a production listing had the earlier revision still been live. Reporting the limitation is the instructed and safer outcome.

### 15.2 SMOKE TESTS — ACTUAL RESULTS

| Test | Result | Note |
|---|---|---|
| TEST 1 — Owner Data Room: listing → open document → close → navigate | **NOT TESTED** | Not executable from this session. The Data Room is behind authentication and this session holds no authenticated browser session against the live app. |
| TEST 2 — Owner normal document workflow: open/close, assignment indicators, notification / deep-link behaviour | **NOT TESTED** | Same limitation. No assignment was created for the purpose of testing. |
| TEST 3 — Admin Files list (list only; no delete, no modify) | **NOT TESTED** | Same limitation. Nothing was deleted or modified. |
| TEST 4 — Legitimate advisor view | **NOT TESTED — no existing safe advisor relationship available** | No advisor relationship was manufactured for this test. |

**No unexecuted test was converted into a PASS.** No failure was observed, because no test executed — so the §13 stop condition was not triggered, and no repair was attempted.

### 15.3 PROHIBITIONS HONOURED

- ✅ No production document deleted, modified or probed.
- ✅ No foreign document UUID probed; no cross-business attempt made in production.
- ✅ No destructive or adversarial test run; the live harness was not invoked for `getDocumentsAdmin`.
- ✅ No code change. The only file touched after publish is this report (documentation only); the runtime and test files remain byte-identical to the reviewed revision (`319ba79`, `d742e1d`).
- ✅ No schema, migration, Storage, RLS, authentication or signed-URL-lifetime change.
- ✅ S3.1 not started.

### 15.4 STATUS AFTER PUBLISH

| Gate | Status |
|---|---|
| S3 IMPLEMENTATION | **COMPLETE** |
| OFFLINE SECURITY VERIFICATION | **PASS** |
| BUILD | **PASS** |
| DEPLOYED REVISION VERIFIED | **UNABLE TO VERIFY** |
| PRODUCTION REGRESSION | **NOT TESTED** |
| PUBLISH | **REPORTED PUBLISHED BY OWNER — IDENTITY UNVERIFIED** |

**S3 PRODUCTION VERIFIED — NOT ASSERTED.** It cannot be asserted while the deployed revision is unconfirmed and the legitimate smoke tests remain unexecuted. To close S3: run §13 Tests 1–4 with legitimate accounts against the live app on a confirmed `5c245e9` deployment; on a clean pass, set PRODUCTION REGRESSION = PASS and PUBLISH = COMPLETE.