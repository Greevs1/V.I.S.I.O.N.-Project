# PHASE 6.9 — BUSINESS SWITCHING DATA ISOLATION FAILURE

**Original status:** TEST 1 **FAIL** — confirmed real runtime failure
**Current status:** **REMEDIATED — code complete, database migration APPLIED AND VERIFIED 2026-10-01, interactive A → B → A re-run PENDING**
**Remediation record:** `src/PHASE_6_9_BUSINESS_CONTEXT_REMEDIATION_REPORT.md`
**Reported by:** manual UI switch between `Apex Roofing LLC` and `Apex Roofing Test 2` in the published app
**Reproduction:** observed live, not inferred
**Method this document:** full code trace — UI state → React Query cache → localStorage → backend function → database filter
**Phase 6.9 scope discipline:** no data modified by the diagnosis, no Phase 6C started, no architectural change beyond the fix

> **Sections 1–5 are the original diagnosis and are unchanged** — they remain the record of what was
> found. Section 6 now carries the outcome of each proposed step, and Section 7 the verification status.
> The fix is implemented and the `dashboard_metrics` migration is applied and verified in production.
> The A → B → A interactive validation has **not** been run, so Phase 6.9 is not yet certified complete.

---

## 1. CLASSIFICATION

This is **not** a Phase 6 authorization defect. The guards are working — they correctly reject a *foreign* `business_id`.

This is a **business-context propagation defect**: the active business is not threaded through the read paths, so **one owner's own businesses bleed into each other**. RLS and the authorization guards cannot catch it, because every request is legitimately authorized for that profile — the caller genuinely owns all three businesses.

**Consequence:** it is a data-correctness failure, not a tenant-isolation breach. It also has a **write-path component** that can persistently file records under the wrong business.

---

## 2. ROOT CAUSE

The system carries **two competing definitions of "active business"**:

| Definition | Source | Correct? |
|---|---|---|
| Explicit **active context** | `activeContext.businessId` (sessionStorage `vision_active_context`) | ✅ authoritative |
| Implicit **primary / profile-wide** | `profile.primary_business_id`, or a query filtered by `profile_id` only | ❌ legacy single-business assumption |

Only the surfaces migrated to pass `businessId` respect the first. **Everything still on the legacy path resolves to the second.** Phase 1C added business-aware filtering to `ninetyDaySprint.getSprint`, but left `businessId = profile.primary_business_id` as the *write-time* value and never propagated the active context to the other Dashboard actions.

Three distinct wrong resolutions follow from this, and all three are live.

---

## 3. LEAK INVENTORY

### 3A — Frontend: switching business invalidates nothing

`src/lib/AuthContext.jsx:214-220`

```js
const setActiveContext = (newContext) => {
  const updated = { ...newContext, initialized: true };
  setActiveContextState(updated);
  // sessionStorage write
};
```

No `queryClient.invalidateQueries`, no `removeQueries`. The only invalidation path is `BusinessContext.invalidateDashboard`, called from `triggerRecalculation` / `reloadBusinessContext` — **not on business switch**.

**Any cache entry whose key omits `businessId` therefore keeps serving the previous business's payload**, and `staleTime` prevents a refetch.

| Cache key | BusinessId in key? | Effect |
|---|---|---|
| `['activeSprint', bisVersion]` — `Dashboard.jsx:217` | ❌ **no** | Sprint from the previous business stays rendered after switching |
| `['sprint-timeline-data']` — `StrategicTimeline.jsx:24` | ❌ **no** | Timeline is a single global cache entry for all businesses |
| all other dashboard keys | ✅ yes | key is correct — see 3B for why that is not enough |

`ActiveSprint` is the clearest single cause of "Business A's Sprint shown under Business B": the key does not change, so React Query never refetches, and the switch triggers no invalidation.

### 3B — Frontend: the Dashboard passes `businessId` to only 2 of 9 actions

`src/pages/Dashboard.jsx` — keys include `activeBusinessId` (so a switch **does** refetch), but the **function payload** usually omits it:

| Line | Action invoked | Passes `businessId`? |
|---|---|---|
| 137 | `getDashboardMetrics` | ✅ `data: { businessId }` |
| 173 | `getAssessmentSummary` | ✅ `data: { businessId }` |
| 146 | `getGapAnalyses` | ❌ **absent** |
| 155 | `getBusinessAssessments` | ❌ **absent** |
| 164 | `getLatestMetricSnapshot` | ❌ **absent** |
| 183 | `getValueCreationSummary` | ❌ **absent** |
| 192 | `getMetricSnapshotsAll` | ❌ **absent** |
| 201 | `getValueCreationEvents` | ❌ **absent** |
| 210 | `getRoadmapItems` (Sprint items) | ❌ **absent** |

This is the most damaging pattern: **the refetch is correct, the data returned is wrong.** The backend has no way to know which business is active.

### 3C — Backend `supabaseUserData`: three wrong resolutions

**(A) Hardcoded `profile.primary_business_id` — ignores the selection entirely**

- `getValueCreationEvents` → `const businessId = profile.primary_business_id;`
- `getValueCreationSummary` → `profile.primary_business_id` *(and, when absent, **writes** `profiles.primary_business_id`)*
- `getBusinessOpportunities` → `profile.primary_business_id`
- `getNextBestActions` (owner branch) → `.eq('business_id', profile.primary_business_id)`

→ With **Apex Roofing LLC** active, Value Creation Events, Value Creation Summary and Opportunities all render **"My Business"** — the primary. **This directly produces the reported symptom.**

Related: `acceptNextBestAction` / `dismissNextBestAction` reject when `nba.business_id !== profile.primary_business_id` → for any non-primary business these return **403**, so the feature is broken rather than leaking.

**(B) Profile-wide query with no business filter — returns a union of all owned businesses**

- `getGapAnalyses` → `.eq('profile_id', profile.id)`
- `getBusinessAssessments` → `.eq('profile_id', profile.id)`
- `getMetricSnapshots` / `getMetricSnapshotsAll` → `.eq('profile_id', profile.id)`
- `getLatestMetricSnapshot` → `.eq('profile_id', profile.id).eq('is_latest', true)`
- `getRoadmapItems` → `.eq('profile_id', profile.id)`
- `getBusinessAssessment` → `.eq('profile_id').eq('assessment_type')` then `.maybeSingle()` → arbitrary row when the profile has several businesses

These are exactly the inputs to BIS (`Dashboard.jsx:277-292`):

```js
const bis = buildBusinessIntelligenceState({
  activeBusinessId,
  assessmentSummary,       // ✅ business-scoped
  dashboardMetrics: ...,   // ✅ business-scoped
  assessmentsData,         // ❌ union of all businesses
  roadmapItems: sprintItems, // ❌ union of all businesses
  ...
});
```

**So BIS itself is constructed from mixed-business inputs**, and every downstream consumer inherits the mix.

**(C) Write-path mis-association — records filed under the wrong business**

`ninetyDaySprint/entry.ts:106`

```js
const businessId = profile?.primary_business_id;   // ← the ACTIVE business is never consulted
```

That value is stamped on every write: `selectPath` (:225), `generateSprint` (:447), `generateFromRecommendations` (:582, :616, :634), `addSubtask` (:1025).

→ A Sprint created while **Apex Roofing Test 2** is active is persisted with `business_id = primary`. It is filed under the wrong business permanently, and `getSprint`'s `business_id.eq.<activeBiz>` filter can then never find it — so it vanishes from the business that created it.

Two further write hazards in the same family:

- `getSprint` (:759-763) **writes** `progress_percent` onto whichever sprint it selected — a cross-business write driven by the displayed context.
- `upsertDashboardMetrics` upserts on `profile_id` alone — a metrics write can land on another business's row.

### 3D — localStorage

Correctly business-scoped (no action needed): `vision_bie_snapshots_<businessId>`, `vision_bie_journal_<businessId>`, `vision_bie_last_briefing_version_<businessId>`, Galileo goals (`getStorageKey(businessId)`).

**Leaks:**

| Key | Scope | Impact |
|---|---|---|
| `AssessmentContext` storage key — `AssessmentContext.jsx:105` | **userId only** | In-progress assessment answers (`p1_rev`, `p1_mymargin`, `v2_ebitda`, `t3_agi`, `o4_*`, `f_*`) are shared across all of one user's businesses. Answers entered under A prefill B — and `saveAssessmentToDB` writes with `bizCtx.active_business_id`, so a value cached from A can be **saved under B**. |
| `vision_galileo_last_visit` — `useGalileoHome.js:78` | session only | "What changed since your last visit" is not per-business. Cosmetic. |

Also, `Dashboard.jsx:533` passes the weekly digest `businessId={supabaseProfile.business_id || m?.business_id || null}` — it prefers the **profile-level** id over the business-scoped metrics row, so the digest can render the primary business while another is active.

---

## 4. SURFACES THAT CROSS — user-visible

With **Apex Roofing LLC** or **Apex Roofing Test 2** active:

**Shows "My Business" (primary) instead of the active business** — cause 3C(A):

- Value Creation Events → Value Creation Timeline, Value Created cards, ROI Score, "hidden opportunities" count
- Value Creation Summary
- Opportunities
- Next Best Actions
- Weekly Digest card — cause 3D (profile-level id)

**Shows a blend of all three businesses** — cause 3C(B):

- Assessments (`businessAssessments`)
- Gap analyses (`gapAnalyses`)
- Sprint items / Roadmap (`sprintItems` → `roadmapItems`)
- Historical IQ snapshots (`metricSnapshotsAll`) → HistoricalChart, Financial Snapshot
- Latest metric snapshot → FinancialSnapshotCard

**Shows the previous business's Sprint** — cause 3A:

- Dashboard `activeSprint` cache entry
- Strategic Timeline

**Because BIS is built from those mixed inputs**, the mix propagates to: Executive Brief, IQ hero, Where You Stand, Business Impact Score, Cost of Inaction, Path to Freedom, Strategic Observations and Galileo summaries — **even though the Shared Intelligence Contract itself is correctly business-scoped**. The Dashboard therefore renders a correct contract *beside* mixed-business BIS data, which is the visible inconsistency.

---

## 5. WHY THE PHASE 6 GUARDS DID NOT CATCH THIS

The six repaired functions verify `businessId` **when one is supplied**, and reject a business the caller does not own. Here:

- the caller genuinely owns all three businesses → every check legitimately passes;
- in the 3B cases **no `businessId` is supplied at all** → the guard's `businessId !== profile.primary_business_id` comparison never fires, because the fallback silently substitutes the primary;
- in the 3A case the wrong data is served from **client cache**, never reaching the backend.

So this sits entirely **outside the authorization surface**. Phase 6's conclusions remain valid; this is a separate, pre-existing correctness defect that the interactive test was designed to expose — and did.

---

## 6. FIX SHAPE — IMPLEMENTED (outcome per step)

The plan below was carried out in full. Each step is annotated with what actually landed.
Implementation detail: `src/PHASE_6_9_BUSINESS_CONTEXT_REMEDIATION_REPORT.md` §3.

Ordered by dependency, smallest blast radius first:

1. **`setActiveContext` must invalidate on switch** — ✅ **DONE.** `BusinessContext.jsx` now calls
   `queryClient.removeQueries()` on every business change (skipping the initial resolution), so no stale
   entry can survive a switch. `['activeSprint']` and `['sprint-timeline-data']` additionally gained
   `businessId` in their keys. Business-aware keys are the primary fix; the blanket drop is the backstop.
2. **Thread `active_business_id` through every Dashboard action** — ✅ **DONE.** All business-scoped
   payloads now carry `businessId`, and the backend **requires** it: `resolveActiveBusiness` refuses with
   `400 BUSINESS_CONTEXT_REQUIRED` when a multi-business account supplies no context, instead of falling
   back to the primary.
3. **Replace primary-hardcoding with the supplied business** — ✅ **DONE**, and two additional
   hardcoding sites were found and closed: `getBusinessOpportunities`, `getNextBestActions`, and the
   `getDocumentSignedUrl` / `updateDocumentFolder` ownership checks (which denied access to any business
   other than the primary). `getValueCreationSummary` also **no longer writes** `profiles.primary_business_id`
   from a read path.
4. **Add `business_id` filtering** to the profile-wide queries — ✅ **DONE**, plus a profile-wide
   `dashboard_metrics` fallback in `getAssessmentSummary` that §3C(B) had not listed.
5. **Fix the write paths** — ✅ **DONE.** `ninetyDaySprint` resolves the active business per action (8
   resolution points) instead of stamping `profile.primary_business_id`; `upsertDashboardMetrics` keys on
   `business_id`. The required schema change shipped as
   `phase_6_9_dashboard_metrics_business_identity.sql` — **applied and verified in production 2026-10-01**:
   old profile-only uniqueness removed, primary key on `id` retained, `ux_dashboard_metrics_business_id`
   installed, all 5 rows and 5 profiles unchanged, 0 null business ids.
6. **Namespace `AssessmentContext` storage by business** — ✅ **DONE.** Key is now
   `cii_assessment_state_v2_<userId>_<businessId>`.

Steps beyond the original plan, added because the trace reached them: `getDocuments` and
`getDataRoomDocuments` used `profile_id.eq.<me>,business_id.eq.<primary>` and therefore listed **every**
document belonging to the profile, indistinguishable by business; `DataRoom.jsx` separately pinned itself
to `primary_business_id`, so it ignored the selection entirely. Both fixed — the active business's
documents plus profile-level household rows, which are ACCOUNT_GLOBAL by design.

**Open question resolved: `business_id NOT NULL` was NOT enforced.** Legacy rows with a null
`business_id` stay valid and unconstrained rather than being deleted or backfilled — the new index is
**partial** (`WHERE business_id IS NOT NULL`) for exactly this reason. Deleting a metrics row to satisfy a
constraint would destroy data; a backfill would have to guess which business each row belongs to.

---

## 7. VERIFICATION PLAN — STATUS

None of the following has been run. The code is complete and the migration is applied; the interactive
certification is the sole remaining gate. No PASS is inferred from source inspection.

1. **PENDING** — Re-run Test 1 interactively: A → B → A, asserting **zero** Business A data while B is active.
2. **PENDING** — Confirm each of the 3C(A) surfaces shows the active business's own data.
3. **PENDING** — Confirm `getSprint` returns the Sprint whose `business_id` equals the active business.
4. **PENDING** — Create a Sprint under the non-primary business and confirm it is **stamped with that business** and remains visible after a reload.
5. **PENDING** — Confirm no cache entry survives a switch (`['activeSprint']` included).
6. **PENDING** — Re-run the Phase 6 business-scope regression to confirm the guards still reject foreign businesses after the fallback is removed.

Two additions to the plan, both required by this remediation:

7. **PENDING** — Confirm the refusal semantics: a multi-business account calling a business-scoped action
   with **no** explicit business must receive `400 BUSINESS_CONTEXT_REQUIRED`, not another business's data.
   This is new behaviour — previously such a call silently returned the wrong business.
8. **PENDING** — Confirm **no legitimate surface regressed** into that 400 for lack of context. The
   removal of the silent fallback can only fail loudly, never wrongly, but a caller that never sends a
   business id will now surface that fact.

**Proven:** frontend production build passes; the `dashboard_metrics` migration is applied and verified.

**Not proven:** backend refusal behaviour at runtime — the backend test invocation was declined, so those
paths are code-reviewed but have not been observed returning their new status codes.

### Preconditions for the A → B → A re-run

- Re-publish the app so the published build serves `ca822d3`.
- No further code or schema change is required; the database is already migrated.
- Suggested pair: **A = `Apex Roofing LLC`**, **B = `Apex Roofing Test 2`**, leaving "My Business" undisturbed.

---

## 8. STANDING NOTE

Phase 6 security conclusion is unaffected: all seven repaired defects remain deployed and runtime-verified. This document records a **separate** defect that Test 1 correctly surfaced.

Phase 6.9 changed **no** authorization rule. It changed **which business** the already-correct rules are
applied to. Every repaired path still authorizes the actor against the business before any service-role
operation — it simply stops substituting the primary business when the caller explicitly selected another.

**Diagnosis modified no data and changed no code. The remediation and the applied schema migration are
recorded in `src/PHASE_6_9_BUSINESS_CONTEXT_REMEDIATION_REPORT.md`. Phase 6C not begun.**