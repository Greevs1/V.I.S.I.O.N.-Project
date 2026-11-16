# VISION — Phase B1.1: Business Scoping Integrity (Implementation Report)

**Status:** COMPLETE — implemented, verified offline, awaiting deployment approval.
**Authorization:** Read-only source changes confined to `galileoBieConsumer/entry.ts`, `askGalileo/entry.ts`, `buildGalileoContext/entry.ts`, plus new offline regression suites. No auth, S4, Codex, DDL, or migration changes. Nothing outside the three authorized files was modified except: (a) two new test scripts, and (b) one superseded assertion (G21) in the P-S3 actor-binding suite, updated to the approved B1.1 contract (see §6).

---

## 1. What changed (11 query sites, 3 files)

Business data reads that were **profile-scoped** now read for the **resolved authorized active business**. The business filter **replaces** the profile filter — it is not appended:

| File | Sites | Change |
|---|---|---|
| `base44/shared/galileoBieConsumer/entry.ts` — `fetchCanonicalRecommendations` | `dashboard_metrics`, `business_assessments`, `business_metric_snapshots` | `.eq('business_id', businessId)`; fail-closed guard added |
| `base44/shared/galileoBieConsumer/entry.ts` — `buildSupportingEvidence` | `documents`, `business_assessments`, `extracted_fields` | `.eq('business_id', businessId)`; fail-closed guard added |
| `base44/functions/askGalileo/entry.ts` — supporting context | `business_assessments`, `ninety_day_sprint_paths`, `advisor_notes` | `.eq('business_id', businessId)` |
| `base44/functions/buildGalileoContext/entry.ts` — parallel fetch | `advisor_notes`, `ninety_day_sprint_paths` | `.eq('business_id', business_id)` |

**Fail-closed guard** (`requireAuthorizedBusinessId`): both shared-module entry points refuse a missing/empty/`"null"` business id by throwing, so a future caller can never silently regress to profile-wide data. Safe for all six current callers: each guarantees a non-null business before the call (explicit 400s, or `assertRecordInBusiness` runs first in `galileoOpportunityEngine.getExplainWhy`).

**Advisor-access pattern (the authorization consideration):** the records carry the business's own `profile_id`, and advisor/team/expert access is granted *against the business* by the canonical contract (`validateBusinessScope`, mirroring `can_access_business()`). Replacing (not appending) the profile filter therefore preserves that access — an appended filter would wrongly exclude advisors, whose own profile id appears on none of the client's rows. Verified behaviorally: an assigned advisor asking about the client's business now receives the client's business recommendations (previously they received none — or worse, their own profile's data).

## 2. New offline regression suites (mock data, real bundled source)

- **`scripts/b11BusinessScopingChecks.cjs`** — 17 PASS / 0 FAIL. Static contract: all 11 sites business-scoped, no residual profile filters, guard defined and invoked, no writes added to the shared module, all six callers resolve the business canonically, Codex surfaces (canonicalActor, snapshot writer, snapshot suite) intact.
- **`scripts/b11CrossBusinessMixing.test.cjs`** — 21 PASS / 0 FAIL. Behavioral, esbuild-bundled real source against an in-memory PostgREST-shaped database: two-business isolation and switching, advisor access, fail-closed guard (null/empty/whitespace/`"null"`), empty-assessment honesty, legacy null-business exclusion, evidence/recommendation consistency, handler-level tests (missing business context → 400 `BUSINESS_CONTEXT_REQUIRED`; unauthorized business → 403; advisor → client's data through the assignment), and Galileo/BIE context parity. **Adversarial mutation sweep: 6/6 reverted filters were caught.**

## 3. Existing regression battery (exact counts)

**Green (unchanged by B1.1):**

| Suite | Result |
|---|---|
| `unknownNotZero.test.cjs` | 23/23 PASS |
| `snapshotCallerContract.test.cjs` (Codex S4) | 102 PASS / 0 FAIL |
| `evidenceFirstAnswerEngine.test.cjs` | 40/40 checks; 15/15 mutations caught |
| `modelThisHandoff.test.cjs` | 13/13 PASS; 6/6 mutations caught |
| `galileoDiscoveryPromotion.test.cjs` | 34 PASS; 5/5 mutations caught |
| `digitalTwinShadowPromotion.test.cjs` | 54 checks; 12/12 mutations caught |
| `galileoPulseLens.test.cjs` | 42 PASS (final verdict ALL CHECKS PASS) |

**Red — all pre-existing, none caused or touched by B1.1:**

| Suite | Failing | Classification |
|---|---|---|
| `galileoContextActorBinding.test.cjs` | F1, F2 | Stale slice-inventory assertions (the repo has grown far past the recorded P-S3 slice); pre-existing. G21 was B1.1-superseded and updated (§6), now passes. |
| `galileoNextAction.test.cjs` | S13, C7b, N8, N9, D1 | Frontend orb props / hero copy / next-action offer dedup; the suite references zero backend files. Its business-scope check (S4) passes. |
| `galileoOnboardingRecovery.test.cjs` | O7, O8, O13b, O20 | Onboarding journey question-flow and narrative voice; zero backend file references. |
| `semanticObservationBridge.test.cjs` | — | Base checks (P1–P15) pass; the harness itself throws in its mutation step (documented builder-environment limitation). |
| `certify-intelligence-contract.cjs` | — | `MODULE_NOT_FOUND`; documented baseline debt. |

## 4. Legacy null-business record visibility (read-only)

A live count was attempted read-only via the Supabase REST endpoint from the builder sandbox; the endpoint is not reachable from this environment (404 on every table and query shape, including a plain `business_entities` probe). **The current live counts are therefore UNKNOWN.** Repository evidence (Phase 6A tenant-integrity audit, historical as of that audit):

- `documents`: 6 rows, **all 6 with NULL business_id** at audit time — these become invisible in `buildSupportingEvidence` (they were already invisible in askGalileo's main context, which has been business-scoped since Phase 6A).
- `business_assessments`: 0 NULL — no exposure.
- `advisor_notes`: ~0 rows, 0 NULL — no practical exposure.
- `business_metric_snapshots`, `dashboard_metrics`: not in the 6A table; writers are business-scoped, but current NULL counts unverified.
- `ninety_day_sprint_paths`: not in the 6A table (its tasks table had 1 NULL row). The sprint-path writer inserts `business_id: businessId || null`, so NULL rows can exist; a NULL-business active sprint now honestly reads as "no active sprint" in Galileo context.
- Base44 `NinetyDaySprint` (4/4 NULL) and `SprintTask` (46/46 NULL) at audit are distinct entities, not read by these three files.

**Consequence:** strict filtering makes NULL-business rows invisible in recommendations, evidence and context — an honest-empty consistent with the business-scoped context reads already shipped since Phase 6A. **Pre-deployment recommendation:** one-time dashboard count of NULL `business_id` rows in the seven affected tables; a backfill is a separate, optional follow-up.

## 5. Adjacent finding AF-1 (out of scope, reported — do not treat as fixed)

The canonical-fact context loader, `base44/shared/canonicalFact/contextLoader.ts` (imported by `buildGalileoContext` via the `consumerAdapter` chain), still reads `dashboard_metrics`, `business_assessments`, `gap_analyses` and `profile_financials` **profile-wide** (`eq('profile_id', ownerProfileId)`). For a multi-business account this is the same class of exposure B1.1 removes elsewhere, and it can contaminate canonical-fact pilot metrics. It is Codex/Phase 14.2 territory and was **not touched**. The behavioral suite documents its exact query signatures (allowlisted, attributed, and asserted to change nothing else) so the finding is visible, not masked. A further inventory of profile-scoped readers outside the three files (calculateFreedomAcceleration, supabaseDashboardData, regenerateCiqMetrics, saveAssessmentToSupabase, generateOpportunities' fallback, others) is recorded here for a possible Phase B1.2.

## 6. Superseded test update (P-S3 actor binding, G21)

G21 previously asserted advisor_notes was profile-scoped to the *acting* profile — a stopgap from before business scoping, preventing profile-wide client data reaching an expert. B1.1 supersedes it: advisor_notes is business-scoped to the authorized business, and the same boundary is now enforced by the business authorization itself (an expert reads only the notes of the business their active relationship grants — verified green). The stale inventory assertions F1/F2 were left untouched.

## 7. Deployment gating

None. Zero schema changes, zero migrations, zero auth changes, zero frontend changes. The three files deploy as ordinary backend function updates upon approval.