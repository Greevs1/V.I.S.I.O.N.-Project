# Phase 6.9B — Business-Context Remediation Report

**Scope:** removal of unsafe business-resolution fallbacks (`primary_business_id`) across all
production paths, plus certification of the canonical active-business contract.

**Verdict:** `BLOCKED — VERIFICATION INCOMPLETE`

The code-level condition is satisfied: **zero unsafe substitution expressions remain in live
code**. The gate is held open only by runtime verification of the paths remediated in the final
wave (exact list in §9). No readiness statement is emitted.

---

## 1. Final Contract Definition

Canonical module: `base44/shared/businessScope/activeBusiness.ts`

```
SESSION → ACTOR → ACTIVE/REQUESTED BUSINESS → AUTHORIZE ACTOR → READ/WRITE THAT BUSINESS
```

`ACTOR`, `BUSINESS` and `AUTHORIZATION` are three separate concepts. **BUSINESS is never inferred
from ACTOR.**

| Concern | Authoritative source |
| --- | --- |
| Actor identity | The authenticated session (`base44.auth.me()`). Never the request body. |
| Actor profile | `profiles` matched on the session user's **email**. Never `data.profile_id`. |
| Requested business | `body.active_business_id` / `data.business_id` (explicit context). |
| Default business | `profiles.primary_business_id` — a **preference**, used only when unambiguous. |
| Authorization | `validateBusinessScope` / `can_access_business()` — the same rule RLS enforces. |

Exported API:

| Export | Contract |
| --- | --- |
| `resolveActiveBusiness(sb, profile, requested, opts)` | Explicit context is authoritative and authorized; absent context resolves only when the actor owns ≤1 business, otherwise throws `BUSINESS_CONTEXT_REQUIRED` (400). |
| `requireBusinessContext(sb, profile, requested, action)` | Same, returning `{ businessId, denial }` so handlers stay one line. |
| `assertBusinessAccess(sb, businessId, profile, opts)` | Authorizes an actor against a business that came **from a record**. |
| `businessScopeMismatch(what)` | The canonical `403 BUSINESS_SCOPE_MISMATCH` for record-addressed operations. |
| `businessContextError(err)` | Single HTTP mapping: 400 required / 403 denied / 409 businessless record. |
| `resolveActorBusinessContext(sb, user, data, opts)` | Actor identity from session + canonical business + membership for the AI consumers. |

**Refusal semantics.** A multi-business account that supplies no explicit business is *refused*,
never silently answered with the primary. `primary_business_id` is never a substitute for context.

## 2. Certified Resolution Matrix

Proven against the live multi-business account (businesses `A = 42f42075…`, `B = e507bf87…`).

| # | `active_business_id` | Owns it? | Resolved business | Outcome |
| --- | --- | --- | --- | --- |
| 1 | absent | — | none | **400 `BUSINESS_CONTEXT_REQUIRED`** |
| 2 | `A` | yes | `A` | 200 — business-A data only |
| 3 | `B` | yes | `B` | 200 — business-B data only |
| 4 | `A` | no | none | **403 `BUSINESS_CONTEXT_DENIED`** |
| 5 | record id of another business | — | mismatch | **403 `BUSINESS_SCOPE_MISMATCH`** (static) |
| 6 | absent, actor owns exactly one business | — | that business | 200 (`primary_default`) |

## 3. Runtime Remediation Ledger

**31 backend entrypoints** carry the canonical guard. Each row records the *unsafe pattern that was
removed* and the *explicit-context contract now enforced*.

### Wave 1 — business-owned data surfaces

| Function | Unsafe pattern removed | Contract now enforced |
| --- | --- | --- |
| `getBusinessIntelligenceContract` | primary fallback on missing context | explicit context, else 400 |
| `supabaseOpportunityData` | primary fallback + **4 mutations with no business check at all** | record-scope verified on promote/complete/archive/dismiss |
| `savedPlaybookData` | primary fallback; dedup scanned all rows regardless of business | all four actions business-scoped; dedup business-scoped |
| `supabaseDashboardData` | primary fallback across documents/resources reads | explicit context, else 400 |
| `knowledgeBaseEngine` | primary fallback; `getContext`/`search` had no denial path | denial enforced before every business-scoped branch |
| `achievementNotifications` | primary fallback | explicit context, else 400 |
| `weeklyDigest` | primary fallback | explicit context, else 400 |
| `googleDriveImport` | primary fallback **+ malformed Supabase URL** | URL normalized; explicit context, else 400 |
| `ownershipConcentrationEngine` | `|| profile.primary_business_id` | row's own business preferred first; primary is a documented, read-only last resort |

### Wave 2 — engines, assessments, strategy, discovery

| Function | Unsafe pattern removed |
| --- | --- |
| `confidenceEngine` | `business_id \|\| profile.primary_business_id` |
| `profitIqEngine` | `business_id \|\| profile.primary_business_id` |
| `reportingQualityEngine` | `business_id \|\| profile.primary_business_id` |
| `calculateFreedomPaths` | `body.businessId \|\| profile.primary_business_id` |
| `worksheetResponses` | `profile.primary_business_id` (scoped every response write) |
| `calendarService` | `profile?.primary_business_id` |
| `generateWeeklyDigest` | `requestedBusinessId \|\| ownProfile.primary_business_id` |
| `getMetricAutoPopulate` | `body.business_id \|\| body.active_business_id \|\| profile.primary_business_id` |
| `saveAssessmentToSupabase` | `activeBusinessId \|\| profile.primary_business_id \|\| null` |
| `regenerateCiqMetrics` | `requestedBusinessId \|\| profile.primary_business_id` |
| `buildGalileoContext` | `active_business_id \|\| prof.primary_business_id` |
| `calculateFreedomAcceleration` | `data.business_id \|\| ownProfile.primary_business_id` |
| `selectStrategiesForClient` | `prof.primary_business_id` |
| `resolveStrategyMappings` | `prof?.primary_business_id` |
| `expandStrategyOpportunities` | `prof.primary_business_id` |
| `recordStrategyOutcome` | `bodyBizId \|\| callerProfile?.primary_business_id` |
| `expertAdvisorAccess` | `business_id \|\| clientProfile.primary_business_id \|\| null` |
| `protectionGapEngine` | `business_id \|\| profile.primary_business_id` (engine metadata) |
| `enterpriseDiscoveryOrchestrator` | `business_id \|\| profile.primary_business_id` ×3 |
| `generateOpportunities` | `profile.primary_business_id` |

### Wave 2 — admin / diagnostic surfaces

| Function | Unsafe pattern removed |
| --- | --- |
| `forceUpdateDashboardMetrics` | `profile.primary_business_id` |
| `createSampleExtractedFields` | `profile.primary_business_id` |
| `createDiagnosticNextBestAction` | `result.activeBusinessId = profile.primary_business_id` |

**Contract module extended:** `requireBusinessContext` and `businessScopeMismatch` added to
`activeBusiness.ts` so each handler is one guard line and no function carries its own error mapping.

**Frontend:** every caller of a remediated path now sends the business it already has from
`activeContext` / `useAuth`. The playbook and knowledge-base callbacks re-run when the active
business changes, so switching businesses refreshes rather than serving the previous business's data.

## 4. Canonical Runtime Verification Results

Live multi-business account. Only observed results are recorded; nothing is inferred.

### Verified

| Call | Condition | Observed |
| --- | --- | --- |
| `getBusinessIntelligenceContract` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `getBusinessIntelligenceContract` | foreign business | `403` |
| `supabaseOpportunityData` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `savedPlaybookData` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `savedPlaybookData` | owned business | `200`, business-scoped rows |
| `supabaseDashboardData` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `knowledgeBaseEngine` | no business | **returned `200` — defect found by testing, not inspection.** Fixed this phase; denial now enforced. |
| `aiLearningGovernance` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `knowledgeBaseEngine` / `savedPlaybookData` | owned business `A` and `B` | `200` with distinct, business-scoped payloads |
| `generateOpportunities` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `generateOpportunities` | owned business `A` | `200`, 3 opportunities generated against `A` |
| `calculateFreedomPaths` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `calculateFreedomPaths` | owned business `A` | `200`, paths computed from `A`'s assessments |
| `buildGalileoContext` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `getMetricAutoPopulate` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |
| `calculateFreedomAcceleration` | no business | `400 BUSINESS_CONTEXT_REQUIRED` |

Every refusal reports the account's real owned-business count
(`this account owns 3 businesses, so primary_business_id is ambiguous and must not be substituted
for an explicit selection`) — the guard is measuring the account, not assuming it.

**Defect found by this round trip:** `generateOpportunities` had no payload parse at all, so it could
never receive explicit context. With the guard in place it would have refused every multi-business
account. A payload parse was added and the path now returns `200` for an owned business. All other
remediated paths already accepted explicit context.

### Static verification (this phase, reproducible)

- Contract regression guard: **PASS** — 31 remediated entrypoints checked; **0** missing guard
  imports, **0** residual forbidden substitution shapes.
- Production build: **exit 0**.
- Repository audit: 15 remaining `primary_business_id` occurrences, all classified in §9.

## 5. Request Payload Authority Audit

| Payload field | Verdict | Evidence |
| --- | --- | --- |
| `profile_id` in `galileoBieConsumer.resolveProfileAndBusiness` | **Removed** | Actor identity now derives from the session email; `data.profile_id` is no longer read. |
| `profile_id` / `_router_user_email` in `meetingIntelligence`, `livingIntelligence`, `postMeetingIntelligence`, `businessMemoryService`, `ninetyDaySprint` | **Retained as TARGET identifiers** | Each feeds `resolveActingProfile(sb, actor, { targetProfileId })`, which honours the target **only after** the actor is proven authorized. The body never selects the actor. |
| `business_id` / `active_business_id` | **Retained as CONTEXT** | Authorized through `resolveActiveBusiness` against the actor before any read or write. Never authoritative on its own. |
| `membership_status` | **Retained** | Membership signal only; carries neither identity nor business authority. |

No request-body field remains an authority input for actor identity. The one genuinely unsafe case
(`data.profile_id` in the shared Galileo helper) is removed.

## 6. Cross-Business Behavioral Proof

- Businesses `A` and `B` were loaded through the remediated paths with their own explicit context;
  each returned only its own rows. No overlap was observed.
- Absent context on a multi-business account returns **400**, never the primary business's data —
  this is the specific failure that produced the original cross-business leak, and it can no longer
  occur on any remediated path.
- Record-addressed mutations (`galileoOpportunityEngine`) now call `assertBusinessAccess` against
  the record's own business before writing.
- **Not yet proven at runtime:** cross-business isolation for the 20 paths in §9. Static analysis
  shows each resolves through the same guard, but a round trip has not been executed for them.

## 7. Shared Helper Deprecation Proof

`base44/shared/galileoBieConsumer/entry.ts` → `resolveProfileAndBusiness`

- No longer queries `primary_business_id` — the column is absent from its `select`.
- Returns `{ profileId, businessId: null, membershipStatus, profile }`; **business resolution is
  delegated entirely** to `requireBusinessContext` at each call site.
- No longer reads payload identity (`data?.profile_id` removed).
- Its one approved consumer (`aiLearningGovernance`) consumes only `profileId` and
  `membershipStatus`, so **its behaviour is unchanged** — verified by inspection of that caller and
  by its `400 BUSINESS_CONTEXT_REQUIRED` runtime result.
- Enforced mechanically by the regression guard (§4).

## 8. Global Regression Audit

Every backend `primary_business_id` occurrence was classified. **15 remain**, none an unsafe
substitution in reachable code:

| Classification | Count | Locations |
| --- | --- | --- |
| `VALID_INITIAL_DEFAULT` | 3 | `orchestrateBusinessCreation:192` (`!profile.primary_business_id` — is this the first business?), `supabaseProfileData:81`, `supabaseUserData:155` (both inside `completeOnboarding`, seeding the initial default at business creation) |
| `VALID_AUTHORIZATION_CHECK` | 2 | `supabaseUserData:457`, `valuationService:1987` (equality comparisons establishing ownership) |
| `REMEDIATED_LAST_RESORT` | 1 | `ownershipConcentrationEngine:93` (documented, portfolio-scoped, read-only) |
| `DEAD_UNREACHABLE` | 8 | `metricScopeResolver:118,125–128`, `valueCreationEngine:454`, `debugAssessmentFlow:48`, `debugDashboardMetricsSchema:28`, `diagnosticAssignments:49` — **0 live callers**, confirmed by repository search |
| **Unsafe in live code** | **0** | — |

## 9. Remaining Risk / Explicitly Deferred

Each remediated path needs a round trip on all three conditions — explicit owned → `200`, missing →
`400`, foreign → `403` — before the gate can close. **None of the 20 has a complete matrix.**

**Tier 1 — partially verified (2 of 3 conditions, 5 paths):**
`generateOpportunities`, `calculateFreedomPaths`, `buildGalileoContext`, `getMetricAutoPopulate`,
`calculateFreedomAcceleration`. All five prove missing → `400`; the first two also prove owned →
`200` and returned business-scoped payloads. **Foreign → `403` is untested for all five.** A
verified foreign business id was not available in this session, and guessing one would have made a
not-found indistinguishable from a not-authorized result.

**Tier 2 — unverified in runtime (15 paths):**
`confidenceEngine`, `profitIqEngine`, `reportingQualityEngine`, `worksheetResponses`,
`calendarService`, `generateWeeklyDigest`, `saveAssessmentToSupabase`, `regenerateCiqMetrics`,
`selectStrategiesForClient`, `resolveStrategyMappings`, `expandStrategyOpportunities`,
`recordStrategyOutcome`, `expertAdvisorAccess`, `protectionGapEngine`,
`enterpriseDiscoveryOrchestrator`.

Build and static checks pass for all 20; each accepts an explicit business from its caller.
**Runtime behaviour after the change is unproven.**

**Known technical debt carried forward:**

- The five `DEAD_UNREACHABLE` functions still contain unsafe-shaped expressions. They are
  unreachable, but should be deleted rather than left as landmines.
- A `BusinessContextEngine` frontend state defect can still collapse a multi-business account to
  its primary business before a request is made. The backend guard now converts that into a clean
  refusal instead of silent cross-business contamination; the frontend defect remains.
- `protectionGapEngine` reports `business_id: null` in `engine_meta` when no business was supplied.
  This is truthful (it reports the business actually used) but loses the previous fallback label.
- Wave-2 dormant functions (`calendarService`, `confidenceEngine`) still have no regression tests.

## 10. Certification State

```
CONTRACT:         CANONICAL — enforced end to end
CODE REMEDIATION: COMPLETE — zero unsafe substitution expressions in live code
RUNTIME PROOF:    PARTIAL — 5 paths at 2/3 conditions, 15 paths unverified
VERDICT:          BLOCKED — VERIFICATION INCOMPLETE
```

**Blocking list:** the 15 Tier-2 paths in §9, plus the missing foreign-business (`403`) condition on
the 5 Tier-1 paths.


No certification readiness statement, readiness score, or Phase 6.9 completion language is emitted,
because the "all consumers remain operational" and "no new data-scope errors" conditions cannot be
attested for those 20 paths without runtime evidence.