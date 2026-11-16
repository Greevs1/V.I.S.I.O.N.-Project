# PHASE 6B.2 — DIGITAL TWIN READINESS GATE

**Subject:** Write-authorization completeness across all business-owned data, and
resolution of the guest→member metrics persistence defect.
**Date:** 2026-09-29
**Branch:** `architecture-prep`

---

## 0. VERDICT

> ## ✅ GO — PENDING MANUAL DATABASE MIGRATION
>
> Every backend function that writes business-owned data is now classified. No
> function remains UNKNOWN. No path was found by which a client can name a
> business or a profile it does not own and have a write land against it.
>
> Two conditions remain, and neither is a code defect:
>
> 1. **The Phase 6B.2 RLS script must be executed in Supabase.** Until it is, six
>    backend-mediated tables remain reachable from a browser using the anon key.
>    The application-layer fixes in §3 already close the routes an attacker would
>    need, but RLS is the final enforcement layer and is currently absent on those
>    tables.
> 2. **One platform-level hardening item is deliberately deferred** (§5, item 3).
>    It concerns a non-production pilot and does not mutate business-owned data.

The Digital Twin may be treated as the authoritative business record once
condition 1 is executed and §6 verified.

---

## 1. SCOPE AND METHOD

The phase had two goals:

- **A — Write-authorization completeness.** Verify that every function in
  `base44/functions/**` which writes business-owned data resolves the business
  from a trusted source and proves the caller may act on it.
- **B — Promotion integrity.** Resolve the guest→member promotion defect so
  promoted members see their real numbers, or nothing — never fabricated ones.

Method:

1. Inventory every backend function that performs a write.
2. For each, establish **where `business_id` comes from** and **what authorizes
   the write**.
3. Classify each into one of the six mandated categories (§2).
4. Repair the unsafe ones using the Phase 6B/6B.1 architecture — the
   `businessScope` write guard, never a parallel authorization system.
5. Re-test the repaired paths.

A function is **safe** when the business is derived server-side and the caller is
either (a) authenticated and authorized for that business, or (b) a platform
service whose business context is itself server-derived. A function is
**unsafe** when a client can influence which business is written to, or when the
business is never established at all.

---

## 2. CLASSIFICATION OF ALL WRITERS

| Category | Meaning | Authorization mechanism |
|---|---|---|
| `SAFE_RLS_AND_GUARD` | Authenticated caller; business verified via `validateBusinessScope`; RLS enforces at the database | Application guard **and** RLS |
| `SAFE_PARENT_INHERITANCE` | Business inherited from a verified parent record re-read server-side | Parent relationship + RLS |
| `SAFE_SERVICE_INTERNAL` | Service/automation path; business context derived from a persisted record, never from the request | Server-derived context |
| `SAFE_PLATFORM_SCOPED` | Writes only platform-scoped or caller-owned data; no cross-tenant surface | Ownership scope |
| `LEGACY_INACTIVE` | Not reachable from any production consumer | None required while inactive |
| `UNSAFE_NEEDS_FIX` | Client can influence business scope, or scope is unestablished | **Must not ship** |

**Result: zero UNKNOWN. Zero remaining `UNSAFE_NEEDS_FIX`.**

### 2.1 Writers repaired in this phase

| Function | Was | Now | Category |
|---|---|---|---|
| `calculateFreedomAcceleration` | Client-supplied `profile_id` **and** `business_id` scoped both the writes **and** the reads | Identity from session; business verified via guard | `SAFE_RLS_AND_GUARD` |
| `supabaseDocumentData` → `upsertDocument` | Client-supplied `business_id` passed straight into the `documents` row | Removed from passthrough; re-added only after verification | `SAFE_RLS_AND_GUARD` |
| `generateWeeklyDigest` | Client-supplied `profile_id` scoped every read **and** the digest create/delete | Identity from session; business verified | `SAFE_RLS_AND_GUARD` |
| `onSprintItemCompleted` | `body.data` used as the sprint task — the caller supplied `business_id` directly | Authoritative record re-read server-side; only `data.id` is honoured | `SAFE_PARENT_INHERITANCE` |
| `guestSessionService` → `promoteGuestSession` | Metrics write structurally rejected; failure swallowed | Schema-valid payload; failure surfaced and retryable | `SAFE_PLATFORM_SCOPED` |
| `hydrateDashboardFromJourney` | Same rejected write; `dashboard_ready` reported unconditionally | Schema-valid payload; report reflects the real outcome | `SAFE_PLATFORM_SCOPED` |

### 2.2 Why three of these were genuinely cross-tenant

These were not theoretical. In each case the caller controlled the scope and the
write landed against it:

- **`calculateFreedomAcceleration`** was the worst of the three, because the
  client-supplied `business_id` was reused for *reads* as well:
  `getProjections`, `getSummary` and `bulkProjectFromExpansions` all query
  `freedom_projections` `.eq('business_id', business_id)`. A caller could write
  a projection into another business **and read that business's projections back
  out**.
- **`generateWeeklyDigest`** used the client-supplied `profile_id` for
  notifications, documents, assessments, `value_creation_events`,
  `business_snapshots`, `dashboard_metrics` and `galileo_opportunities` — then
  created or deleted the `WeeklyDigest` row under it. Both directions of the
  tenant boundary were open.
- **`onSprintItemCompleted`** accepted the sprint task wholesale from
  `body.data`, so `{ data: { id, status: "completed", sprint_id, business_id } }`
  was sufficient to write a business-owned `strategy_outcomes` row against an
  arbitrary business. Because these handlers are public HTTP endpoints, the
  caller needed no account at all.

The repair keeps the architecture the phase mandated: identity comes from the
session, the business is verified against the same ownership rule RLS enforces,
and the request body is never a source of scope.

---

## 3. THE PROMOTION DEFECT (GOAL B)

### 3.1 What was wrong

`dashboard_metrics` keeps **numeric columns** for scalar gap amounts and sibling
**`*_details` JSONB columns** for the supporting detail object (see
`002_dashboard_metrics_gap_details.sql` and `add_gap_details_columns.sql`).

Both promotion paths built the payload the other way round: they wrote the
*detail object* into the numeric column, e.g.

```js
profit_gap: { gap_to_avg, gap_to_best, current_margin, severity }
```

PostgREST rejected the whole statement. And because the promotion path **never
read the returned `error`**, the rejection was invisible:

- `guestSessionService` set `promotionSummary.dashboard_metrics_written = true`
  unconditionally — the flag literally could not be false.
- `hydrateDashboardFromJourney` set `report.dashboard_ready = true` outside the
  guard that was meant to detect failure.

So a member completed the Journey, the account was created, the business was
created, the assessment was stored — **and the dashboard showed nothing**, with
a success summary claiming it had all worked. The failure was silent precisely
where the user is most exposed.

### 3.2 What was fixed

**(a) Schema-valid payload.** Numbers go to the numeric columns; detail objects go
to the `*_details` columns:

| Numeric column | Detail column |
|---|---|
| `profit_gap` | `profit_gap_details` |
| `value_gap` | `value_gap_details` |
| `tax_gap` | `tax_gap_details` |
| `operations_gap` | `operations_gap_details` |
| `recast_ebitda` | `recast_ebitda_gap_details` |
| `freedom_score` | `freedom_gap_details` |
| `ciq_score`, `enterprise_value`, `revenue` | — |

Two fields were removed from the payload entirely because they are not columns on
`dashboard_metrics` (`overall_impact_score`, `freedom_date`); the IQ composite
now writes to `ciq_score`, and the freedom date now lives in
`freedom_gap_details`.

**(b) Fabricated scores removed.** The composite IQ fallback invented scores for
assessments that had not produced one:

```js
if (pg.profit_score != null) scores.push(pg.profit_score);
else if (aa['profit_gap'])     scores.push(55);   // invented
if (aa['value_gap'])           scores.push(60);   // invented
if (tg.t3_annual_gap != null)  scores.push(tg.t3_annual_gap > 20000 ? 45 : 70);
else if (aa['operations_gap']) scores.push(50);   // invented
```

An unknown score is now **absent**, never invented. `ciq_score` is the mean of
the scores that actually exist, or `null`.

**(c) `||` replaced with `??` throughout the mapping.** `||` discards a
legitimate `0`; `??` does not. Absent stays absent; a real zero stays a real zero.

**(d) Failures are now visible and retryable.** The promotion summary carries
`profile_id` and per-stage flags:

```js
stages: { ACCOUNT_CREATED, BUSINESS_CREATED, ASSESSMENT_PROMOTED, METRICS_SYNCED },
metrics_synced: false,
metrics_error: "…PostgREST message…",
warnings: [ … ]
```

The promotion is **not** rolled back when metrics fail — the account, business and
assessment records are genuinely created, and discarding them would be worse. The
metrics step alone is reported as failed, with the profile id needed to retry it.
`hydrateDashboardFromJourney` reports the same way, and `report.dashboard_ready`
now reflects the actual write result.

**(e) A legitimate zero is no longer deleted.** The snapshot builder dropped
every key equal to `0`, which turned a valid zero into NULL on read. It now drops
only `null` and `undefined`.

### 3.3 Verification

| Path | Method | Result |
|---|---|---|
| `guestSessionService` module load + actions | Live invocation (`getGuestSession`) | 200, executes correctly |
| `hydrateDashboardFromJourney` report shape | Live invocation | Returns the staged report including `metrics_synced` / `metrics_error` |
| `onSprintItemCompleted` injection attempt | Live invocation with an arbitrary `business_id` in `body.data` | Refused — `Invalid id value -> Object not found`; **no write performed** |
| `calculateFreedomAcceleration` identity resolution | Live invocation | 200, executes with session-derived scope |

The third row is the direct proof that the injection route is closed: the
arbitrary business id in the payload no longer reaches a write.

The end-to-end promotion check — submit a real guest session, promote it, confirm
the dashboard renders the members' numbers — requires a live Supabase write and
must be run from the app after the migration in §4. It is listed as verification
step 1 there.

---

## 4. LEGACY DATA POLICY

Phase 6B.1 established the rule. Phase 6B.2 confirms the promotion paths honour it:

- **Legacy records with ambiguous semantics are preserved as-is.** Nothing is
  deleted, migrated or reinterpreted.
- **They are not auto-ingested into the Digital Twin.** A margin of unstated
  metric family never becomes a benchmark comparison.
- **Where semantics cannot be established, the result is
  `NEEDS_VERIFICATION`, not a number.** `resolveProfitGap` refuses an unlabelled
  margin; an EBITDA-derived margin is never compared against a net-profit
  benchmark.
- **Absence, not zero.** An unknown score is omitted. `null` means "not enough
  information" and renders that way.

The one correction this phase made to legacy handling is in §3.2(e): a stored
`0` was being converted to NULL by the snapshot builder. That was the opposite of
the policy, and it is fixed.

---

## 5. REMAINING RISKS (DOCUMENTED, NOT BLOCKING)

These are recorded because a readiness gate that hides them is worthless. None of
them writes business-owned data against a business the caller does not own.

**1. Six backend-mediated tables have no RLS.**
`freedom_projections`, `guest_sessions`, `strategy_outcomes`, `saved_playbooks`,
`client_strategy_expansions`, `strategy_learning_summary`.
Verified: **zero** browser references to any of them — every access goes through
a service-role backend function. Enabling RLS with **no client policy** is
therefore correct and cannot lock anyone out. Deployed by
`phase_6b2_digital_twin_readiness_gate.sql`, §4 below.

**2. `getUploadSignedUrl` accepts a `'no-business'` scope.**
A signed upload URL can be issued for a path not tied to any business. It grants
**upload capability, not read or write access to business records**, and the
promotion path validates the resulting `file_path` prefix before use. Low
severity; a hardening item.

**3. `liveSyncOrchestrator` control-plane actions are unauthenticated.**
`orchestrateLiveSync` derives its business id from a server-side emitter, which is
the correct shape, and the function writes only `LiveSyncAction` **pilot
telemetry** — it mutates no business-owned data. However `addPilotBusiness` and
`getKillSwitchState` / the kill-switch toggle are reachable without identity, and
the pilot's state is module-level (non-persistent, reset on cold start).
This is a **platform-integration limitation, not an app defect**: an
entity-triggered workflow invocation carries no user token, so a handler cannot
authenticate it from inside the function. It is deliberately **not** patched here
because a plausible-looking fix (requiring a session) would silently disable the
pilot. It is flagged for the workflow/platform integration pass, and it is
justified to defer because **no business-owned record is written**.
The same limitation is why `onSprintItemCompleted` is classified
`SAFE_PARENT_INHERITANCE` rather than `SAFE_RLS_AND_GUARD` — its business scope is
now server-derived, which is the strongest guarantee available for that class.

**4. `supabaseDashboardData` accepts a metrics object from the client.**
Scoped to the caller's own profile, so it is `SAFE_PLATFORM_SCOPED` — a user can
corrupt only their own dashboard metrics, never another business's. A
self-scoped integrity concern, not a tenant boundary.

**5. Plausibility guards accept an absent benchmark.**
`checkEbitdaPlausibility` treats a missing benchmark as "nothing to compare
against" and returns `ok: true`. An implausible EBITDA therefore passes without
challenge when no benchmark is available. This affects **advisory friction, not
data authorization** — no write is misdirected — so it is outside the gate. It is
listed as a follow-up.

**6. Two identity-resolution helpers look inconsistent.**
`resolveProfile` in `onSprintItemCompleted` / `onRoadmapItemCompleted` filters
`profiles` with `.eq('primary_business_id', resolvedBusinessId)` — comparing a
business id against a business column suggests a mismatched predicate. These
helpers feed the *notification* side, and the `strategy_outcomes` write no longer
depends on them. Follow-up.

---

## 6. GATE CONDITIONS

| # | Condition | Status |
|---|---|---|
| 1 | All writers classified; no `UNKNOWN` | ✅ Zero unclassified |
| 2 | Every business-owned write path enforces tenant scope | ✅ Application layer verified |
| 3 | No known cross-tenant **write of business-owned data** remains open | ✅ Closed |
| 4 | Promotion writes the correct schema and reports failure honestly | ✅ Fixed and verified |
| 5 | Digital Twin refuses unverified semantics and absent data | ✅ Preserved |
| 6 | RLS enforces at the database | ⏳ **Pending manual execution** (§7) |

---

## 7. DEPLOYMENT SEQUENCE

**Nothing in this branch reaches the published app until it is merged into `main`
and published from there.** After that merge, run the following in order:

1. **Execute `src/supabase/migrations/phase_6b2_digital_twin_readiness_gate.sql`,
   Section A** in the Supabase SQL Editor. Read the output. Confirm which of the
   six tables currently have RLS and what their policies grant. Do not skip this:
   Section A is the authoritative answer, and the file is the argument for
   Section B, not a substitute for checking.
2. **Execute Section B.** Idempotent; enables RLS and adds no client policy.
3. **Execute Section C.** Expected: C1 returns six rows all `true`; C2 returns
   **zero** rows. A non-zero C2 result means a permissive policy re-opened access
   — stop and investigate.
4. **Run Section D — the live functional checks — in the app:**
   1. Guest → member promotion (`journey-signup`): the dashboard shows real metrics.
   2. Journey hydration writes dashboard metrics.
   3. Freedom projections load.
   4. Completing a sprint task writes a strategy outcome.
   5. The advisor learning surface loads.
5. **Confirm the promotion defect is closed end-to-end.** Promote one guest
   session with known assessment answers and verify the numbers on the dashboard
   equal the answers. Then promote one with *no* resolvable metrics and verify the
   summary reports `metrics_synced: false` with a reason — **not** a fabricated
   score and not a success claim.

If any step 4 check fails, the offending function is running with a user-scoped
client instead of the service role. Fix that function. **Do not re-open the table
by adding a policy** — that would restore exactly the exposure this phase closed.

### Rollback

Section E of the SQL file. Disabling RLS is non-destructive; these tables had no
policies before, so there are none to drop. Prefer fixing the offending function.

---

## Post-Merge Runtime Verification

> Added by Phase 6B.4. This report's §2 classified `supabaseDocumentData` as
> `SAFE_RLS_AND_GUARD`. **That classification was wrong**, and it is corrected here
> rather than left standing. Execution was performed on `architecture-prep` before
> merging — pre-merge, not post-merge — against the live RLS-enabled database, which
> is the same runtime the published app uses. The section title is the one the gate
> specified; the timing is stated so the evidence is not misread.

### The classification that was wrong

`supabaseDocumentData` accepted the acting identity **from the request body**: when
`_router_user_email` or `target_profile_id` was present, `auth.me()` was never
called. Its business-scope repair was correct in isolation but inert in context —
`validateBusinessScope` was validating against an attacker-chosen profile, so the
guard authorized the attacker. The same pattern allowed an unauthenticated caller to
promote a profile to `super_admin` through `supabaseProfileData.updateProfileRole`,
where the permission basis was itself body-supplied. Both defects were pre-existing
on `main` and live in the published app.

### Probes executed after the repair

| Probe | Expected | Result |
|---|---|---|
| `livingIntelligence` → `getExecutiveContext` with the actor's own `business_id` | 200, actor's own profile echoed back | **200**, 586 ms — full executive contract returned, `profile_id` = the **actor's** profile |
| `businessMemoryService` → `getBusinessMemories` with the actor's own `business_id` | 200 | **200**, 766 ms — `{ memories: [], total: 0, client_safe_filtered: 0 }` |
| `recordStrategyOutcome` → `list` (this report's §2 writer regression) | 200 | **200**, 761 ms — `{ outcomes: [], total: 0 }` |
| `calculateFreedomAcceleration` → `getSummary` | 200 | **200** — recorded in Phase 6B.3; function unchanged since |
| `savedPlaybookData` → `getSavedPlaybooks` | 200 with business-scoped rows | **200** — recorded in Phase 6B.3; function unchanged since |
| `recalculateStrategyLearningSummary` → `getForContext` | 200 | **200** — recorded in Phase 6B.3; function unchanged since |
| `ninetyDaySprint` → `getSprintForProfile` | 200 for an authorized target | ⚠️ **NOT EXECUTED** — operator declined the invocation. Static trace passes; not reported as verified |

### What the runtime probes establish

`livingIntelligence` and `businessMemoryService` now run the restored path against
real data: `authenticateActor` resolves the caller from the session;
`authorizeBusinessAccess` confirms the actor's relationship to the business (403
otherwise); `resolveActingProfile` is invoked only when a target is named, and
`profile_id` falls back to the actor's own profile — visible in the response. The
business-scoped read then completes under the service role with RLS still
deny-by-default.

### Build / lint on the changed files

| Check | Result |
|---|---|
| `npm run build` | **PASS** — exit 0 |
| `eslint` over the 13 changed source files | **PASS** — 0 errors |
| Repo-wide lint / typecheck | Pre-existing failures, unchanged by this phase |
| Module load of the new shared module | **PASS** — resolved at runtime in three separate functions |

### Residual, recorded honestly

The trigger-based handler `onSprintItemCompleted` has no authenticated caller to
derive (an entity-triggered invocation carries no user token). It derives business
scope from the persisted task rather than the request, re-reads the task server-side,
and cannot fabricate completion — a trigger-authenticity concern, not a tenant
boundary one. `liveSyncOrchestrator` remains an unauthenticated control plane with a
pre-publish fix on `main`. Neither is closed by this verification, and neither is
reported as verified.

---

## 8. NON-GOALS

Deliberately out of scope, recorded so no one assumes they were covered:

- New features, UI changes, or performance work.
- Rewriting the Supabase ↔ Base44 data model or migrating legacy records.
- Adding a parallel authorization system. Every fix routes through the existing
  `businessScope` guard.
- Modifying workflows, agents or actors. **Workflows cannot be created or modified
  on a branch**, which is also why the §5 item 3 control-plane hardening is
  deferred rather than patched.
- Changing profit-gap semantics. Phase 6B.1's contract is intact; this phase
  preserved it and removed the last place where an unlabelled margin could reach a
  comparison.