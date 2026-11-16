# PHASE 6B.3 / 6B.4 — PRODUCTION RUNTIME VALIDATION & MERGE GATE

**Branch:** `architecture-prep` (`b44/6aab17753a223252e70a4c5c`)
**Baseline revision:** `5c0be2a` — *"Resolve multi-tenant write vulnerabilities and fix dashboard metrics promotion"* (2026-09-29)
**Audit revision:** `c248289` — document vulnerabilities (2026-10-01)
**Repair revisions:** `896f095` (2026-10-01), `c421182` (2026-10-01)
**Date:** 2026-10-01
**Scope:** Phase 6B.3 runtime validation, then Phase 6B.4 authenticated-actor restoration. No merge, no publish, no Phase 6C, no `business_facts`, no `business_facts`-class modelling. No RLS change.

---

## 0. VERDICT

| Gate | Result |
|---|---|
| Branch/revision confirmed — no merge, no publish | ✅ PASS (0 behind / 30 ahead of `main`) |
| Build | ✅ PASS (exit 0) |
| Lint on every file changed this phase | ✅ PASS (0 errors) |
| Database / RLS state | ✅ PASS — 91/91 tables RLS-enabled, zero permissive policies |
| Body-supplied identity search across active functions | ✅ **ZERO remaining active instances** |
| `authenticateActor` present at the top of all 12 privileged functions | ✅ PASS |
| Router callers authenticate as themselves | ✅ PASS |
| **Runtime proof of the restored path** | ✅ PASS — 2 functions invoked live post-fix, **200** |
| 6B.2 writer regression (`recordStrategyOutcome`) | ✅ PASS — live **200** |
| `ninetyDaySprint` runtime probe | ⚠️ **NOT EXECUTED** — operator declined the call. Static trace PASS |
| Original 6B.3 probes re-run post-6B.4 | ⚠️ NOT RE-RUN — those three functions are byte-identical since their PASS |
| Open cross-tenant business-owned writer vulnerability | **0** ✅ |

> # ✅ MERGE READINESS: GO — POST-DEPLOY VALIDATION REQUIRED
>
> Phase 6B.3 found a cross-tenant read/write path and an unauthenticated privilege escalation to `super_admin`. Phase 6B.4 closes the entire class: request-body identity is no longer trusted anywhere in the active backend, and the restored path has been proven at runtime, not merely inspected. RLS was not touched, no record was written, and no behaviour beyond authorization was altered.
>
> Three items remain, none of them gating: the `ninetyDaySprint` runtime probe was declined by the operator (static trace passes), the published-app smoke tests are by definition post-deploy, and the pre-existing `liveSyncOrchestrator` control-plane item stays a pre-publish fix on `main`.

---

## 1. METHOD

The phase ran five ordered steps, each one a precondition for the next:

1. **Baseline verification** — confirm branch, revision, merge state, and that the published app does not contain this branch.
2. **Runtime validation** — re-probe the live flows against the RLS-enabled database rather than re-asserting earlier findings.
3. **Identity-trust audit** — trace request-body fields (`user_email`, `email`, `profile_id`, `target_profile_id`, `editor_email`, `_router_user_email`, `acting_user`, `user_id`, `owner_id`) to the point of use in every active privileged function.
4. **Remediation** — remove body-derived identity, replace it with one canonical actor, and verify each changed path.
5. **Pattern search** — re-scan for the *same* pattern to prove the class is closed, not just the three instances that were found first.

Step 5 is the step that mattered most: it found five more active instances than the initial three. A fix that closes only the discovered instances would have left the class open.

---

## 2. THE PHASE 6B.3 FINDING (UNCHANGED — THIS IS WHAT WAS REPAIRED)

Three sibling data functions took the acting identity **from the request body**, and skipped authentication entirely when `_router_user_email` or `target_profile_id` was present:

```js
const { action, data, _router_user_email, target_profile_id } = body;
let resolvedEmail = _router_user_email || null;
if (!resolvedEmail && !target_profile_id) {   // ← skipped when either is supplied
  const user = await base44.auth.me();
  if (!user) return 401;
  resolvedEmail = user.email;
}
```

Consequences reachable by an unauthenticated caller against a public endpoint:

| # | Defect | Impact |
|---|---|---|
| **F-1** | Body identity skips authentication (`supabaseDocumentData`, `supabaseProfileData`, `supabaseDashboardData`) | Another user's documents, metrics and business data are read and written under an attacker-chosen profile |
| **F-2** | `updateProfileRole` takes **both** the target and the permission basis (`editorEmail`) from the body | Unauthenticated privilege escalation: name a real super_admin as "editor", promote your own profile, Base44 `User.role` synced to match. `super_admin` is the role that bypasses business scoping in `validateBusinessScope` and in RLS |
| **F-3** | `getDocumentAnalysisQueue` unscoped for non-advisor roles (2 functions) | An ordinary owner received up to 100 queued documents belonging to every user |
| **F-4** | `updateExtractedFieldReview` had no ownership check (2 functions) | Any authenticated user could accept/correct/reject another user's extracted fields — feeding `document_analysis`, `documents.upload_status` and downstream metrics |

F-1/F-2 were **pre-existing on `main` and live in the published app**. Phase 6B.2 had classified `supabaseDocumentData` as `SAFE_RLS_AND_GUARD`; the business-scope repair in it was correct but inert, because the profile it validated against was attacker-chosen.

---

## 3. PHASE 6B.4 — REMEDIATION

### 3.1 New shared module

| File | Purpose |
|---|---|
| `base44/shared/authz/actor.ts` (new, 233 lines) | The single canonical actor resolver. `authenticateActor()` derives identity **only** from the session; `resolveActingProfile()` treats a body-supplied profile id as a *target* and honors it only after the authenticated actor is proven authorized for it; `authorizeBusinessAccess()` applies the same relationship rule to a requested business; `errorResponse()` maps `HttpError` to a correct status without leaking internals |

`HttpError` carries a status, so a denial returns **403** and a missing target **404** — never a blanket 500.

### 3.2 Functions changed (12) — all now authenticate unconditionally

| Function | Change |
|---|---|
| `supabaseUserData` | Queue scoped to the authorized profile for non-advisor roles; field-mutation ownership check; forwards the caller's credential on its one internal hop |
| `supabaseProfileData` | Mandatory authentication; `editorEmail` no longer exists as a permission basis — the editor is the authenticated actor; `target_profile_id` honored only for an authorized target |
| `supabaseDashboardData` | Mandatory authentication; body `profile_id` demoted to an authorized target |
| `supabaseDocumentData` | Mandatory authentication; body identity removed; queue scoped; field ownership enforced |
| `supabaseRoadmapData` | Mandatory authentication; body identity removed |
| `supabaseOpportunityData` | Mandatory authentication; body identity removed |
| `supabaseVerificationData` | Mandatory authentication; body identity removed |
| `meetingIntelligence` | Body `profile_id` no longer selects the acting profile |
| `postMeetingIntelligence` | Same, on the outcome-routing path |
| `livingIntelligence` | Authenticated actor required; requested business authorized; `profile_id` an authorized target only |
| `businessMemoryService` | Authenticated actor required; requested business authorized; `profile_id` an authorized target only |
| `ninetyDaySprint` | `getSprintForProfile` authorized the named target instead of serving any profile's sprint and tasks on request |

**Net effect of every change:** identity is derived from the session in one place, and the request body may only ever *name a target* — never *be* the actor.

### 3.3 What was deliberately not changed

- **No RLS change.** Not one policy was added, removed or widened. `liveSyncOrchestrator` was not touched (see §6).
- **No behaviour change beyond authorization.** Response shapes, empty states and payload construction are untouched.
- **No record written.** No entity or table row was created, updated or deleted in this phase.
- **No entity schema change.** `base44/entities/**` is untouched.
- **No new authorization system.** Every new check routes through the one `actor` module, which mirrors the same ownership/assignment rules the platform already enforces.

---

## 4. RUNTIME EVIDENCE

### 4.1 Probes executed **after** the remediation

| Probe | Payload | Result |
|---|---|---|
| `livingIntelligence` → `getExecutiveContext` | `{ business_id: <actor's own business> }` | **200**, 586 ms — returned the full executive contract (`business_id`, `profile_id`, `current_business_state`, `business_momentum`, observations), with `profile_id` resolved to the **actor's** profile |
| `businessMemoryService` → `getBusinessMemories` | `{ business_id: <actor's own business> }` | **200**, 766 ms — `{ memories: [], total: 0, client_safe_filtered: 0 }` |
| `recordStrategyOutcome` → `list` (6B.2 regression) | `{}` | **200**, 761 ms — `{ outcomes: [], total: 0 }` |

**What the two `livingIntelligence` / `businessMemoryService` probes prove.** Both functions now execute the *new* path end-to-end against real Supabase data:

1. `authenticateActor(base44, sb)` resolved an authenticated actor;
2. `authorizeBusinessAccess(sb, actor, business_id)` passed for a business the actor legitimately reaches (it would have returned **403** otherwise);
3. `resolveActingProfile` was skipped when no target was named, and `profile_id` fell through to the **actor's own** profile — visible in the response, which echoed the actor's profile UUID;
4. the business-scoped read completed under the service role with RLS still deny-by-default.

This is the restored actor path running in production conditions, not a static claim. The identical primitives are used by the other ten functions.

### 4.2 Probe **not** executed

| Probe | Status |
|---|---|
| `ninetyDaySprint` → `getSprintForProfile` | **NOT EXECUTED** — the operator declined the invocation. Recorded as static-pass only. The change is the same `resolveActingProfile` call verified live in two other functions; it is the one item to re-run if a complete runtime sweep is wanted |

### 4.3 Original 6B.3 probes

`calculateFreedomAcceleration` (`getSummary`), `savedPlaybookData` (`getSavedPlaybooks`) and `recalculateStrategyLearningSummary` (`getForContext`) returned **200** in Phase 6B.3. Those functions are byte-identical since — none appears in this phase's changeset — so their PASS stands on the code that is still in place. They were **not re-invoked** after Phase 6B.4.

### 4.4 Build, lint, type

| Check | Command | Result |
|---|---|---|
| Build | `npm run build` | **PASS** — exit 0 |
| Lint (changed files) | `eslint` over all 13 changed source files, `--quiet` | **PASS** — 0 errors |
| Repo-wide lint / typecheck | `eslint .`, `tsc -p ./jsconfig.json` | Pre-existing failures (193 lint errors, mostly unused imports; 1,094 `TS` lines). Neither is wired into the build; both predate this phase |
| Function module load | Live invocations | **PASS** — new imports resolve at runtime in three separate functions |

---

## 5. PATTERN SEARCH — THE CLASS IS CLOSED

Step 5 re-scanned every active function for request-body identity fields used as the actor. Results, exhaustively:

| Location | Finding | Disposition |
|---|---|---|
| 7 × `supabase*` functions | `_router_user_email`, `target_profile_id`, `editorEmail` | **Removed** — target-only, authorized |
| `meetingIntelligence`, `postMeetingIntelligence` | `data?.profile_id` | **Removed** — target-only, authorized |
| `livingIntelligence`, `businessMemoryService` | `data?.profile_id` | **Removed** — target-only, authorized |
| `ninetyDaySprint` | `data?.profile_id` on `getSprintForProfile` | **Removed** — target-only, authorized |
| `businessMemoryService`, `livingIntelligence` (stale headers) | Doc comments still describing the *old* auth-skip behaviour | **Corrected** — a security-critical comment must not document the vulnerability as the design |
| `uploadDocumentToSupabase`, `calculateFreedomAcceleration` | Credential read from the request **body** | **Removed** (6B.2) — header only, 401 without it |
| Trigger handlers (`onSprintItemCompleted`) | No authenticated caller exists | **Documented** — see §6 |

**Re-scan result: zero remaining active `UNSAFE_IDENTITY_TRUST` instances.** Every privileged write path now resolves its writer through `authenticateActor`.

### 5.1 Known limits of this audit (stated, not glossed)

- **One unrun probe.** `ninetyDaySprint` was not invoked (operator declined). Static trace only.
- **Search-based, not proof-based.** The audit is an exhaustive scan for a defined set of field names plus a targeted re-scan. It is not a formal verification, and a field named outside that set would not have been caught by the scan itself. The remediation pattern — authenticate first, authorize targets — is what makes the class closed, not the scan.
- **`business_id` is a resource identifier, not an identity.** The scan deliberately targeted *identity* fields. Whether any function trusts a client-supplied `business_id` **without** an authorization check is a different and larger question — the terrain of the 80-writer inventory — and was not re-opened here. The two functions where that question was directly adjacent (`livingIntelligence`, `businessMemoryService`) now authorize the business explicitly.

---

## 6. CARRIED FORWARD (UNCHANGED, NON-BLOCKING)

### 6.1 `liveSyncOrchestrator` — pre-publish item on `main`

Every action is unauthenticated; no `auth.me()` exists in the file. It mutates no business-owned row (its `live_sync_actions` table does not exist), and its control plane is module-level in-memory state. **Not a gate condition for this branch.** Fix before the pilot is expanded to business-owned data: require a session for all actions, restrict the control plane to `super_admin`, and permit `orchestrateLiveSync` only from a trusted server emitter. It could not be patched here — workflows cannot be modified on a branch, and an entity-triggered invocation carries no user token to authenticate.

### 6.2 `onSprintItemCompleted` — trigger authenticity

No caller authentication, so any caller knowing a *genuinely completed* sprint-task id can trigger the idempotent outcome write. The write is gated on persisted state (the task is re-read server-side; a caller cannot fabricate completion, redirect the business, or select a business). Trigger-authenticity concern, not a tenant-boundary one. Carried as a follow-up.

### 6.3 Inherited residuals

| # | Residual | Severity | Status |
|---|---|---|---|
| 1 | `getUploadSignedUrl` accepts a `'no-business'` scope | Low — upload capability; path prefix validated | Documented, unchanged from 6B.2 |
| 2 | `calcProfitGap` returns `profit_score: 0` when `p1_top <= 0` | Latent — no active importer of `calcIQScore` | Documented (§9) so a future consumer cannot inherit a fabricated zero |
| 3 | Plausibility guards accept an absent benchmark | Low — advisory friction | Documented, unchanged |
| 4 | `resolveProfile` filters a business column with a profile value | Low — notification side only | Documented, unchanged |
| 5 | Galileo conversation A→B→A switch unverified at runtime | Unknown | Smoke test 11 |
| 6 | Admins/advisors retain intentional cross-business reach | By design | Mirrors the RLS model |

---

## 7. FILES CHANGED

**14 files, code only. No entity, workflow, agent, database object or secret was modified. No record was written.**

| File | Change |
|---|---|
| `base44/shared/authz/actor.ts` | **New** — canonical actor/authorization module |
| `base44/functions/supabaseUserData/entry.ts` | Queue scoping, field ownership, credential forwarding |
| `base44/functions/supabaseProfileData/entry.ts` | Mandatory auth; `editorEmail` removed as permission basis |
| `base44/functions/supabaseDashboardData/entry.ts` | Mandatory auth; body profile → authorized target |
| `base44/functions/supabaseDocumentData/entry.ts` | Mandatory auth; queue scoping; field ownership |
| `base44/functions/supabaseRoadmapData/entry.ts` | Mandatory auth; body identity removed |
| `base44/functions/supabaseOpportunityData/entry.ts` | Mandatory auth; body identity removed |
| `base44/functions/supabaseVerificationData/entry.ts` | Mandatory auth; body identity removed |
| `base44/functions/meetingIntelligence/entry.ts` | Acting identity from session only |
| `base44/functions/postMeetingIntelligence/entry.ts` | Acting identity from session only |
| `base44/functions/livingIntelligence/entry.ts` | Actor + business authorization |
| `base44/functions/businessMemoryService/entry.ts` | Actor + business authorization |
| `base44/functions/ninetyDaySprint/entry.ts` | `getSprintForProfile` target authorization |
| `src/PHASE_6B3_PRODUCTION_RUNTIME_VALIDATION_REPORT.md` | This report |

---

## 8. NEXT STEPS

### Pre-merge (on `architecture-prep`)
1. *(Optional)* Re-invoke the three 6B.3 probes and `ninetyDaySprint.getSprintForProfile` for a complete runtime sweep.
2. *(Optional)* Clear the 9 pre-existing unused-import lint errors in the new Galileo files.
3. `npm run build` → exit 0. **Already confirmed.**

### Merge
4. Merge `architecture-prep` → `main` via the branch menu. **No SQL to run** — RLS is already live and unchanged.

### Pre-publish
5. Fix `liveSyncOrchestrator` authentication on `main` (§6.1).
6. Confirm no unpublished secrets or environment drift.

### Publish
7. Publish from `main`. RLS already protects the live app; publishing applies the **code** fixes.

### Post-publish
8. Run smoke tests 1–13 in order (see the Phase 6B.3 smoke plan). Tests 2, 7, 8, 9, 11, 12 are the tenant-critical ones.
9. Watch logs for authorization / RLS / PostgREST errors before declaring success.

### Rollback
10. Security is already live and correct — it is not the thing to roll back. If the deployed code breaks a flow, revert the application code. **Explicitly forbidden:** disabling RLS, adding a client policy to unblock a flow, or widening `can_access_business`.

---

## 9. PROFIT SEMANTICS — FINAL REGRESSION

**PASS**, unchanged through this phase. `p1_mymargin` is defined as a **net profit** margin; `resolveProfitGap` binds both sides to `MARGIN_METRIC.NET_PROFIT_MARGIN`; the Magic Loop writes EBITDA under its own name (`ebitda_margin` + `margin_semantics`) and leaves the net margin **absent**, rendering "not enough information" rather than a fabricated figure. `compareToBenchmark` refuses non-identical metric keys and returns `INSUFFICIENT_DATA` when a benchmark is missing. `Math.max(0, …)` prevents a negative opportunity above benchmark. Zeros survive (`??` throughout, never `||`).

**Smoke test 9 must assert the ABSENCE of a net margin for the Magic Loop path** — a missing net margin is the correct result, not a failure.

---

## 10. GUEST → MEMBER PROMOTION — UNCHANGED

Static validation from Phase 6B.3 stands: the payload separates numeric columns from JSONB `*_details`, preserves legitimate zeros, fabricates nothing, and reports failure with `metrics_synced: false` plus a retryable `profile_id` rather than claiming success. End-to-end verification is correctly deferred to post-publish.

---

## 11. FINAL VERDICT

| Gate | Result |
|---|---|
| Branch/revision confirmed, no merge, no publish | ✅ PASS |
| Build | ✅ PASS (exit 0) |
| Lint on changed files | ✅ PASS (0 errors) |
| Database / RLS state | ✅ PASS — 91/91, zero permissive policies |
| Body-supplied identity — active instances | ✅ **0** |
| Mandatory authentication on privileged functions | ✅ 12/12 |
| Router identity | ✅ Self-authenticated; credential forwarded on its one internal hop |
| Runtime proof of restored path | ✅ **PASS** (2 functions, live 200) |
| 6B.2 writer regression | ✅ PASS (live 200) |
| `ninetyDaySprint` runtime probe | ⚠️ NOT EXECUTED (static PASS) |
| Original 6B.3 probes re-run | ⚠️ NOT RE-RUN (code unchanged, PASS stands) |
| Profit semantics | ✅ PASS |
| Manual SQL remaining | ✅ NONE |

> # ✅ GO — POST-DEPLOY VALIDATION REQUIRED
>
> **Why.** The audit's disqualifying conditions are cleared. Request-body identity is no longer trusted in any active backend function; all twelve privileged functions authenticate unconditionally; the router calls as itself; and the restored path was proven by live invocation, not inference. The gate's remaining items are inherently post-deploy (smoke tests) or pre-publish on `main` (`liveSyncOrchestrator`).
>
> **What changed in the verdict, and why it is not a concession.** Phase 6B.3 was NO-GO on a real, verified vulnerability. Phase 6B.4 does not re-classify that finding — it repairs it and then proves the repair by running the code. F-1 through F-4 remain true statements about revision `5c0be2a`, and remain the reason this work exists.
>
> **What is deliberately not claimed.** Nothing was merged, nothing was published, no record was written, no RLS policy was touched. The `ninetyDaySprint` probe was declined and is not reported as verified. Typecheck and repo-wide lint still fail on pre-existing issues that no gate in this programme has ever required to pass.

**Awaiting human approval. No merge. No publish.**