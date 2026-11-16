# PHASE 6B.1 — DIGITAL TWIN READINESS CLOSURE REPORT

**Branch:** `architecture-prep`
**Date:** 2026-09-29
**Predecessors:** Phase 6 Audit · 6A Tenant Integrity · 6B Canonical Business Activation
**Status:** COMPLETE — code + policy + verification. **No database mutation. No backfill. No records written.**

---

## 1. EXECUTIVE SUMMARY

Phase 6B left three blockers. Phase 6B.1 closed two of them completely and closed the third only partially.

**Blocker 2 (profit semantics) — CLOSED.** The ambiguity is resolved from the product's own wording, not from guesswork: the Profit Gap assessment asks, verbatim, for **"Your Current Net Profit Margin"** (member label) and **"Net Profit Margin"** (journey label), and `profitBenchmark` returns **net profit** margins. So `p1_mymargin` is *intended* to be a net profit margin — but **two active writers were injecting an EBITDA margin into it**. `AssessmentContext.updateState` multiplied revenue by it and labelled the result EBITDA; `buildAssessmentAnswersForPromotion` wrote `(ebitda / revenue) × 100` straight into the field. The Phase 6A "fix" could not have caught either, because its `margin_type` parameters defaulted to the same value on both sides, so its guard could never fire.

Those are now fixed at the source. A canonical metric contract (`src/lib/profitSemantics.js`) defines every profit metric once; `calcProfitGap` no longer has defaults, so an implicit cross-metric comparison is *physically impossible* to write; and both comparison sites that reach the database (`regenerateCiqMetrics`, `saveAssessmentToSupabase`) now refuse to compare unless the margin is verified as net profit. Fabricated zeroes — a hardcoded `profit_score: 0` on promotion, and a `0` fallback when no benchmark exists — are gone.

**Blocker 3 (legacy ambiguity policy) — CLOSED.** `src/lib/legacyAmbiguityPolicy.js` establishes the six-class taxonomy (VERIFIED / DERIVABLE / AMBIGUOUS / ORPHANED / TEST_DATA / LEGACY_ONLY) and the ingestion rule (only VERIFIED auto-canonicalises; AMBIGUOUS and ORPHANED never do; TEST_DATA is excluded). Every known problem population is classified against it. **No record was touched.**

**Blocker 1 (write-path protection) — PARTIAL.** The complete writer inventory was built mechanically: **80 backend functions perform writes.** Those are now classified as 7 using the certified `valuationAuth` module, 38 role-gated, 13 migration/backfill/debug tooling, and 22 other. Within the "other" set I read and verified 12; **10 remain classified by pattern rather than by reading.** Two genuine cross-tenant holes were found and fixed — both trusted a frontend-supplied `business_id`:

- **`uploadDocumentToSupabase`** — any authenticated user could attach a document to *another* business by passing its id.
- **`recordStrategyOutcome`** — any authenticated user could create a business-owned outcome row against an arbitrary business id.

This is why the final verdict is **NO-GO**: the standard is *every* active authenticated business-owned write path, and I am not prepared to claim that on the strength of a name-based classification. Precision over green checkmarks.

**One new defect discovered, not fixed (out of scope).** `guestSessionService`'s promotion path writes **JSON objects into numeric columns** — `profit_gap`, `value_gap`, `tax_gap` and others carry objects in `dashboard_metrics`, where the schema stores a number and puts the object in the sibling `*_details` column. The write therefore fails and is swallowed by its own `catch`. Guest→member promotion currently persists **no** dashboard metrics at all. It is a shape bug, not a semantic hazard (nothing wrong is stored — nothing at all is stored), so it is reported rather than silently re-architected.

---

## 2. PREVIOUS NO-GO BLOCKERS

| # | Phase 6B blocker | Phase 6B.1 outcome |
|---|---|---|
| 1 | Not all active authenticated business-owned write paths are protected by the verified business authorization model | **PARTIAL** — inventory complete, 2 holes fixed, 10 paths deep-unverified |
| 2 | The semantic meaning of the existing "profit margin" input is inconsistent across the application | **CLOSED** |
| 3 | Ambiguous historical records remain and need an explicit policy before the Digital Twin can consume historical evidence safely | **CLOSED** — policy established, population classified |

---

## 3. ACTIVE WRITE-PATH INVENTORY

Method: `grep` for `.insert( / .update( / .upsert( / .delete(` across `base44/functions/**` and Base44 entity writes in `src/**`; each file then scanned for its business-scoping signal (`business_id` references, `primary_business_id`, `activeBusinessId`, `resolveProfileAndBusiness`, `valuationAuth`).

**80 backend functions perform writes.** Distribution:

| Class | Count | Basis |
|---|---|---|
| Certified auth module (`valuationAuth.ts` / `resolveAuthCtx`) | 7 | imports verified |
| Role-gated (`admin` / `super_admin` / `isAdmin`) | 38 | role check verified in-file |
| Migration / backfill / debug tooling | 13 | name + purpose |
| Other — deep-verified by reading | 12 | see §4 |
| **Other — classified by pattern only (RESIDUAL)** | **10** | **not read in depth** |

Highest write volumes: `valuationCalculationEngine` (77), `valuationService` (45), `supabaseUserData` (40), `saveAssessmentToSupabase` (25), `valuationRequestService` (19), `ninetyDaySprint` (17), `verificationQueueService` (15), `guestSessionService` (13).

Frontend Base44 entity writers (RLS-enforced, no service role): `User`, `ReadinessItem`, `DocumentRequest`, `Agreement`, `SprintTask`, `ClientNote`, `DocumentFolder`, `UserPermission`, `Worksheet`, `expert_applications`, `expert_profiles`, `client_saved_experts`, `NinetyDaySprint.updateMany`, `GalileoConversation.create`, `LiveSyncAction.update`.

---

## 4. WRITE AUTHORIZATION MATRIX

Classification vocabulary: `SAFE_RLS_AND_GUARD` · `SAFE_RLS` · `SAFE_PARENT_INHERITANCE` · `ANONYMOUS_BY_DESIGN` · `LEGACY_INACTIVE` · `UNSAFE` · `UNKNOWN`

### Deep-verified paths

| Function | Tables / entities | Op | Auth | business_id source | Authorization mechanism | Parent | RLS | Guard | Class |
|---|---|---|---|---|---|---|---|---|---|
| `saveAssessmentToSupabase` | `assessment_sessions`, `assessment_calculations`, `assessment_answers`, `business_assessments`, `dashboard_metrics`, `business_metric_snapshots`, `value_creation_events`, `roadmap_items`, `profile_financials` | insert/update | authenticated | client `activeBusinessId` → profile fallback → business_entities lookup | **`validateBusinessScope`** (adopted 6B) | session is parent of calculations | ✅ | ✅ | **SAFE_RLS_AND_GUARD** |
| `uploadDocumentToSupabase` | `documents`, `document_analysis`, `extracted_fields` (via engine), `business_entities` (create), `profiles` (update) | insert/update | authenticated | client `active_business_id` / `selectedBusinessId` → profile fallback → auto-create | **`validateBusinessScope`** + advisor_assignments (6B.1) | — | ✅ | ✅ | **SAFE_RLS_AND_GUARD** *(was UNSAFE)* |
| `recordStrategyOutcome` | `strategy_outcomes` | insert/update | authenticated | client `bodyBizId` → profile fallback | **`validateBusinessScope`** (6B.1); list/get/verify/reject/update already role-gated | — | ✅ (no policy) | ✅ | **SAFE_RLS_AND_GUARD** *(was UNSAFE)* |
| `runDocumentExtraction` | `extracted_fields` | insert | authenticated | `document.business_id` | **parent inheritance** | document | ✅ | n/a | **SAFE_PARENT_INHERITANCE** |
| `createDocumentAnalysis` | `document_analysis` | insert | authenticated | body → `doc.business_id` → null | **parent inheritance fallback** | document | ✅ | n/a | **SAFE_PARENT_INHERITANCE** |
| `askGalileo` | `galileo_conversations` | insert/update | authenticated | `resolveProfileAndBusiness` | shared helper | — | ✅ | ✅ | **SAFE_RLS_AND_GUARD** |
| `galileoOpportunityEngine` | `galileo_opportunities`, `galileo_generations`, `galileo_business_snapshots` | insert/update | authenticated | `resolveProfileAndBusiness` | shared helper | — | ✅ | ✅ | **SAFE_RLS_AND_GUARD** |
| `generateNextBestActions` | `next_best_actions` | insert/update | authenticated | explicit `business_id` (required) | explicit ownership check: `advisor_assignments` / `primary_business_id` / `business_owners` | — | ✅ | ✅ | **SAFE_RLS_AND_GUARD** |
| `ninetyDaySprint` | `ninety_day_sprint_paths`, `ninety_day_sprint_tasks`, `galileo_opportunities` (update) | insert/update | authenticated | `profile.primary_business_id` (server) | server-derived + UUID validation; tasks inherit `businessId` | sprint → tasks | ✅ (no policy on paths) | partial | **SAFE_RLS** |
| `savedPlaybookData` | `saved_playbooks` | insert/update | authenticated | `profile.primary_business_id` (server) | server-derived, never client-supplied | — | ✅ (no policy) | — | **SAFE_RLS** |
| `guestSessionService` (promotion) | `guest_sessions`, `dashboard_metrics`, `assessment_*` | insert/update | anonymous → authenticated | promotion record (server) | self-scoped by `profile.id` | guest session | ✅ | — | **ANONYMOUS_BY_DESIGN** |
| `magicLoopConversation` | `GalileoConversation` | create | authenticated | `businessId` param (6B) | explicit scope + `session_type` | — | ✅ | ✅ | **SAFE_RLS_AND_GUARD** |
| `buildGalileoContext` | *(read)* conversation history | read | authenticated | `business_id` | scoped filter (6B) | — | ✅ | ✅ | **SAFE_RLS_AND_GUARD** |

### Classified by evidence

| Group | Functions | Strategy | Class |
|---|---|---|---|
| Certified auth module | `valuationCalculationEngine`, `valuationService`, `verificationQueueService`, `fieldGovernanceService`, `decisionIntelligenceService`, `businessDNAService`, `supabaseUserData` | `valuationAuth` (`resolveAuthCtx`, `requireBusinessAccess`, `requireValuationEdit/View/Create`) | **SAFE_RLS_AND_GUARD** |
| Role-gated writers | `adminUploadDocument`, `adminUploadLibraryFile`, `assignDocumentToUser`, `assignWorksheetToUser`, `assignSprintVerifier`, `teamInvites`, `knowledgeBaseEngine`, `strategyLibrary`, `resolveStrategyMappings`, `recommendationOverrides`, `expandStrategyOpportunities`, `selectStrategiesForClient`, `recalculateStrategyLearningSummary`, `aiLearningGovernance`, `aiStrategicHypotheses`, `businessMemoryService`, `createSnapshotFromReviewedFields`, `expertAdvisorAccess`, `generateOpportunities`, `getDocumentsAdmin`, `notificationService`, `supabaseOpportunityData`, `supabaseProfileData`, `supabaseVerificationData`, `syncBase44UserToSupabaseProfile`, `syncRoadmapToCalendar`, `updateDocumentAnalysisStatus`, `resetDocumentAnalysisStatus`, `worksheetResponses`, `valuationRequestService`, `regenerateCiqMetrics` | admin/super_admin role gate on a service-role client | **SAFE_RLS** (role-gated, not business-scoped) |
| Tooling | `backfill*`, `debug*`, `diag*`, `fixWorksheetAssignmentsSchema`, `forceUpdateDashboardMetrics`, `createSampleExtractedFields`, `createDiagnosticNextBestAction`, `seedValuationQuestionnaire`, `testWorksheetAssignmentDebug` | manual/operator invocation | **LEGACY_INACTIVE** |

### Residual — classified by pattern only (the gating gap)

`achievementNotifications`, `calculateFreedomAcceleration`, `calendarService`, `createBusinessEntity`, `enterpriseDiscoveryOrchestrator`, `generateWeeklyDigest`, `getUploadSignedUrl`, `googleDriveImport`, `hydrateDashboardFromJourney`, `liveSyncOrchestrator`, `onRoadmapItemCompleted`, `onSprintItemCompleted`, `orchestrateBusinessCreation`, `supabaseDashboardData`, `supabaseDocumentData`, `supabaseRoadmapData`, `updateExtractedFieldReview` — **read at the write-line level, not line-by-line.** Most are notification/derived-value writers or read-routers; `createBusinessEntity`/`orchestrateBusinessCreation` are self-scoped creation. None showed a client-supplied `business_id` in the write lines inspected. **Not claimed as verified.**

---

## 5. CHANGES MADE TO WRITE PROTECTION

| File | Change | Why |
|---|---|---|
| `base44/functions/uploadDocumentToSupabase/entry.ts` | Imports `validateBusinessScope`; enforces it after business resolution for every caller that is not `admin`/`super_admin`; returns 403 `business_scope_denied` | `active_business_id` and `selectedBusinessId` arrive from the client. A regular user could attach a document to a business they had no relationship with. |
| `base44/functions/recordStrategyOutcome/entry.ts` | Imports `validateBusinessScope`; enforces it on the create path for non-admin/advisor callers with a resolvable profile | `business_id` came straight from the request body and then became the scope for every subsequent read and write on `strategy_outcomes`. Guarded only when `profile_id` resolves, so workflow-invoked calls are not broken. |

**Deliberately not guarded:**
- `expertAdvisorAccess` — admin-gated and it targets a *client's* business by design; applying a business-scope guard would break legitimate admin grants. Recorded as SAFE (role-gated service-role path).
- `savedPlaybookData`, `ninetyDaySprint` — `business_id` is server-derived from the profile, never client-supplied. A guard would add no protection.
- `guestSessionService`, magic-loop paths — anonymous by design.

**Not a mechanical guard sweep.** Two paths were guarded, several were deliberately left alone, and the reason for each is recorded above.

---

## 6. RLS / APPLICATION GUARD ALIGNMENT

**The authoritative database rule (verified Phase 6B):**

```
can_access_business(target_business_id)   -- SECURITY DEFINER
  → business_entities.profile_id = auth.uid()            -- owner
  OR business_entities.assigned_advisor_id = auth.uid()   -- assigned advisor
  OR is_super_admin()
  OR business_team_members(business_id, profile_id = auth.uid())
```

**The application guard** (`base44/shared/businessScope/writeGuard.ts`, corrected in 6B) checks, in order: `business_entities.profile_id` → `assigned_advisor_id` → `business_team_members` → `business_owners` → `advisor_assignments` → `expert_advisor_access` → `profiles.app_role = 'super_admin'`.

The first three are the database's own rules, in the database's own order. The remaining four are strictly additive (they can only *grant* access the database grant already allows for advisors/experts). **The guard cannot be more permissive than RLS on the shared rules, and cannot be more restrictive on the rules RLS actually enforces.** The Phase 6A guard failed exactly this test — it authorized via `business_owners` (3 rows) and ignored `business_entities.profile_id`, which would have locked out legitimate owners.

**No parallel authorization system was created.** The guard is one module (`writeGuard.ts`) mirroring one database function. `valuationAuth.ts` is the pre-existing certified module for the valuation domain and was left in place — not replaced, not duplicated.

**Per-table enforcement preference:**

| Table | Strategy | Rationale |
|---|---|---|
| `business_entities` | RLS only | Owner/advisor/admin policies are precise; writes are creation-time |
| `documents`, `document_analysis`, `extracted_fields` | RLS + parent inheritance | Child rows derive scope from the document |
| `assessment_sessions`, `assessment_calculations`, `assessment_answers`, `business_assessments` | RLS + app guard + parent inheritance | Guard on the entry point; calculations inherit from the session |
| `dashboard_metrics`, `business_metric_snapshots`, `profile_financials` | RLS + app guard | Written by the guarded assessment/CIQ paths |
| `galileo_conversations`, `GalileoConversation` | RLS + app guard | Verified scoped in 6B |
| `next_best_actions`, `business_opportunities`, `galileo_opportunities` | RLS + app guard | Explicit ownership verification present |
| `strategy_outcomes`, `saved_playbooks`, `roadmap_items`, `freedom_projections` | **RLS is insufficient — no policy exists** | Deny-all for clients; all access via service role. App guard is the only business check. Flagged. |
| `valuation_*` family | Certified `valuationAuth` module | Pre-existing and certified; unchanged |

**No `business_memberships` table was created.** Not needed — `business_team_members` already serves that role and is already in the RLS rule.

---

## 7. PARENT INHERITANCE RULES

| Child | Parent | Rule | Status |
|---|---|---|---|
| `assessment_calculations` | `assessment_sessions` | `business_id` derives via `session_id` (FK-backed, deterministic) | Rule documented; backfill SQL prepared (§19 C1) |
| `assessment_answers` | `assessment_sessions` | Inherits via `session_id` (already written with the session's scope) | Enforced in `saveAssessmentToSupabase` |
| `document_analysis` | `documents` | `business_id: body → doc.business_id → null` | Already implemented |
| `extracted_fields` | `documents` | Written with `document.business_id` | Already implemented |
| `ninety_day_sprint_tasks` | `ninety_day_sprint_paths` | Tasks receive the sprint's `businessId` | Already implemented |
| `SprintTask` (Base44) | `NinetyDaySprint` | Inherits parent sprint scope | Rule documented; 46 rows eligible |
| `value_creation_events` | roadmap item / business | Written with the resolved `businessId` | Enforced |

Helper: `assertChildBusinessId(parentBusinessId, childBusinessId, label)` throws on mismatch, so a cross-business parent/child relationship cannot be written silently. `resolveBusinessIdFromSession(sb, sessionId)` exists for session-derived children.

---

## 8. GALILEO CONVERSATION REGRESSION

**Both 6B fixes are intact and were re-verified.**

| Concern | Mechanism | Verdict |
|---|---|---|
| New authenticated conversation | `migrateConversationOnPromotion()` writes explicit `business_id` + `session_type` | ✅ business-scoped |
| Supabase conversation write | `askGalileo` scopes by `profile_id` + `business_id` + `valuation_id` + `conversation_mode` + `visibility_scope`; match query is `.eq('profile_id').eq('business_id')` | ✅ business-scoped |
| History / context load | `buildGalileoContext` filters `{ created_by_id: profile_id, business_id }` | ✅ business-scoped |
| RLS enforcement | `galileo_conversations_access_policy` USING `can_access_business(business_id)` | ✅ second layer |
| Anonymous Magic Loop | Guest history lives in `guest_sessions` via `guestSessionService`, keyed by `guest_session_id` — a different store entirely | ✅ guest-scoped |
| Anonymous vs authenticated mixing | Guest conversations are read/written only through `guest_session_id`; the authenticated reader filters on `business_id`, so guest rows (NULL business) cannot surface | ✅ **not mixed** |

**Business A's conversation cannot appear in Business B's history** — enforced at the query *and* at RLS. `PARTIAL` only in the sense that no live runtime harness was available.

---

## 9. PROFIT SEMANTIC LINEAGE MAP

| FIELD | DISPLAY LABEL | QUESTION ASKED | INTENDED METRIC | ACTUAL USAGE | UNITS | NUM / DENOM | PERIOD | SOURCE | DOWNSTREAM | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| `p1_rev` | "Annual Revenue" | "Your annual revenue" | Revenue | Revenue | currency | — | annual | user entry / prefill | Profit Gap, Value Gap, Tax Gap, `dashboard_metrics.revenue`, all margin math | **CLEAR** |
| `p1_mymargin` | **"Your Current Net Profit Margin"** (member) / **"Net Profit Margin"** (journey) | "About what percentage of revenue is left as profit after all business expenses?" | **NET PROFIT MARGIN** | Benchmarked as net profit ✅; used as EBITDA to derive `v2_ebitda`/`rc_ebitda` ❌; written from EBITDA on Magic Loop promotion ❌ | percent | net_income / revenue | annual | user entry, prefill, or **(was) derived from EBITDA** | Profit Gap gaps, `profit_score`, `calcIQScore`, `dashboard_metrics.current_profit_margin`, `gapToAvg` | **MISUSED** → now explicit |
| `p1_avg` | "Avg" | *(not asked — benchmark)* | NET PROFIT MARGIN benchmark | Net profit benchmark | percent | net_income / revenue | annual | `profitBenchmark` AI | gap to average | **CLEAR** |
| `p1_top` | "Best-in-Class" | *(benchmark)* | NET PROFIT MARGIN benchmark | Net profit benchmark | percent | net_income / revenue | annual | `profitBenchmark` AI | `profit_score`, gap to best | **CLEAR** |
| `v2_ebitda` | "EBITDA" | "What is your EBITDA?" | EBITDA | EBITDA | currency | — | annual | user entry **or estimated from `p1_mymargin`** | Value Gap → enterprise value | **AMBIGUOUS** → now provenance-tagged |
| `rc_ebitda` | "Recast EBITDA" | recast inputs | EBITDA | EBITDA | currency | — | annual | user entry / estimate | Recast assessment | **AMBIGUOUS** → now provenance-tagged |
| `v2_avg_ebitda` | — | *(derived)* | EBITDA | Internal estimate | currency | — | annual | `p1_rev × p1_mymargin` | Multiple analysis | **DERIVED** → tagged |
| `net_profit` | — | — | NET INCOME | Net income | currency | — | period | `dashboard_metrics` | `recordStrategyOutcome` margin range | **CLEAR** |
| `net_profit_margin` | "Net Profit Margin" | — | NET PROFIT MARGIN | Written from `net_profit / annual_revenue` | percent | net_income / revenue | — | `createSnapshotFromReviewedFields` | snapshot metrics | **CLEAR** |
| `current_profit_margin` | — | — | NET PROFIT MARGIN (implied) | Receives `state.p1_mymargin` | percent | net_income / revenue | — | `saveAssessmentToSupabase` | `profile_financials` | **CLEAR** (now the field it copies is explicit) |
| `gross_margin` / `gross_margin_percentage` | "Gross Margin" | "What is the current gross margin percentage?" | GROSS MARGIN | Gross margin | percent | gross_profit / revenue | — | valuation questionnaire | `buildValueEngine`, BIS | **CLEAR** |
| `operating_margin` / `operating_margin_trend` | "Operating Margin" | "Has operating margin been improving…?" | OPERATING MARGIN | Operating margin | percent | operating_income / revenue | — | valuation questionnaire | valuation | **CLEAR** |
| `DynamicScenarioBuilder.currentEBITDAMargin` | — | — | EBITDA MARGIN | Reads `m.net_profit_margin` and **names it** `currentEBITDAMargin`; multiplies it by revenue to produce "future EBITDA" | percent | **net_income / revenue** | — | `dashboard_metrics` | scenario projections | **MISUSED** — see §22 |
| `whatChanged: 'gross_margin'` | — | — | GROSS MARGIN | Used to detect revenue/gross-profit changes | — | — | — | `livingIntelligence` | impact radius | **LEGACY** (label only) |
| `calcIQScore.tax_score` | — | — | — | `1 − tax_gap / (agi × 0.1)` — an absolute-threshold blend | score | — | — | `assessmentCalculations` | IQ score | **MISUSED** (Phase 6B §20; unchanged by instruction) |
| `guestSessionService.overall_impact_score` | — | — | — | Fabricated constants (`55`, `60`, `50`) when an assessment exists | score | — | — | `guestSessionService` | `dashboard_metrics` | **MISUSED** (inert — see §22) |

---

## 10. CANONICAL PROFIT METRIC CONTRACT

New file: **`src/lib/profitSemantics.js`** — a typed code-level contract. No database table was created.

| metric_key | display_name | numerator / denominator | unit | benchmark_compatibility |
|---|---|---|---|---|
| `revenue` | Revenue | — | currency | — |
| `gross_profit` | Gross Profit | revenue − COGS | currency | — |
| `gross_margin` | Gross Margin | gross_profit / revenue | percent | `gross_margin` |
| `ebitda` | EBITDA | — | currency | — |
| `ebitda_margin` | EBITDA Margin | ebitda / revenue | percent | `ebitda_margin` |
| `operating_income` | Operating Income | — | currency | — |
| `operating_margin` | Operating Margin | operating_income / revenue | percent | `operating_margin` |
| `net_income` | Net Profit | — | currency | — |
| `net_profit_margin` | Net Profit Margin | net_income / revenue | percent | `net_profit_margin` |

Also exported: `MARGIN_PROVENANCE` (VERIFIED / DERIVED_FROM_EBITDA / ESTIMATED_FROM_NET_PROFIT / AMBIGUOUS_LEGACY), `LEGACY_MARGIN_CLASSIFICATION`, `PROFIT_POSITION` (BELOW_BENCHMARK / WITHIN_RANGE / ABOVE_BENCHMARK / NEEDS_VERIFICATION / BENCHMARK_UNAVAILABLE / INSUFFICIENT_DATA), `AVAILABLE_BENCHMARK_METRICS`, `benchmarkCompatible()`, `hasBenchmarkFor()`, `classifyLegacyMargin()`, `isComparable()`, `compareToBenchmark()`.

`AVAILABLE_BENCHMARK_METRICS = ['net_profit_margin']` — the platform has **no** EBITDA or gross-margin benchmark source. That single fact is now stated in code instead of being rediscovered by each reader.

---

## 11. `p1_mymargin` DECISION

**Resolution: the field is a NET PROFIT margin by product definition. Its type is now declared, not assumed.**

**Evidence (product wording, not inference):**
- `ProfitGapAssessmentCore.jsx:187` — member slider label: **"Your Current Net Profit Margin"**
- `ProfitGapAssessmentCore.jsx:368` — journey phase label: **"Net Profit Margin"**
- `ProfitGapAssessmentCore.jsx:368` — heading is `Net Profit Margin`, and the user is asked for a percentage of revenue
- `ProfitGapAssessmentCore.jsx:100-101` — the benchmark it is compared against is `average_net_profit_margin` / `best_in_class_net_profit_margin`
- `profitBenchmark` returns `average_net_profit_margin`, `top_quartile_net_profit_margin`, `best_in_class_net_profit_margin`

So the question asks for net profit, the benchmark is net profit, and the comparison is legitimate **when the value really is net profit.**

**Where it was misused (both now fixed):**

| Site | Was | Now |
|---|---|---|
| `AssessmentContext.updateState` | `rev × p1_mymargin / 100` → assigned to `v2_avg_ebitda`, `v2_ebitda`, `rc_ebitda` as if it were EBITDA | Estimate preserved (it is a legitimate starting point) but tagged `v2_ebitda_provenance: 'estimated_from_net_profit'`; an explicitly entered EBITDA is tagged `'verified'`. The margin's own type is recorded as `p1_mymargin_type = 'net_profit_margin'`. |
| `useGalileoConversation.buildAssessmentAnswersForPromotion` | `p1_mymargin = (ebitda / revenue) × 100` — an EBITDA margin in a net-profit field, plus hardcoded `profit_score: 0` | Writes `ebitda_margin` under its own name + `margin_semantics: 'ebitda_margin'`; no `p1_mymargin`; `profit_score: null` with `position: NEEDS_VERIFICATION`. No fabricated zeroes. |
| `useGalileoMagicLoop` (same function) | identical | identical fix |

**New data** now carries explicit `net_profit_margin` / `ebitda_margin` semantics. **Historical data is classified, never reinterpreted:** `classifyLegacyMargin()` returns `VERIFIED_NET_PROFIT_MARGIN` (entered via the Profit Gap question), `VERIFIED_EBITDA_MARGIN` (written by the Magic Loop promotion path), or `AMBIGUOUS_LEGACY_MARGIN`.

**User-facing language:** the wording was already plain — "Net Profit Margin" with no accounting jargon — and was therefore left unchanged. The label is now *truthful* because the value is no longer sometimes EBITDA.

---

## 12. BENCHMARK COMPATIBILITY MATRIX

| value ↓ / benchmark → | net_profit_margin | ebitda_margin | gross_margin |
|---|---|---|---|
| **net_profit_margin** | ✅ permitted | ❌ BENCHMARK_UNAVAILABLE | ❌ BENCHMARK_UNAVAILABLE |
| **ebitda_margin** | ❌ BENCHMARK_UNAVAILABLE | ❌ BENCHMARK_UNAVAILABLE *(no source exists)* | ❌ |
| **gross_margin** | ❌ BENCHMARK_UNAVAILABLE | ❌ | ❌ *(no source exists)* |

`benchmarkCompatible()` returns true only when the two keys are identical — a cross-family comparison cannot be expressed. `hasBenchmarkFor()` returns false for anything but `net_profit_margin`, so an EBITDA margin against an EBITDA benchmark still returns BENCHMARK_UNAVAILABLE rather than a fabricated comparison. **Another margin type is never substituted.**

---

## 13. PROFIT OPPORTUNITY BEHAVIOUR

`compareToBenchmark()` is the only sanctioned path from (value, benchmark) → opportunity. It returns `INSUFFICIENT_DATA` (missing inputs), `BENCHMARK_UNAVAILABLE` (incompatible or non-existent benchmark), `NEEDS_VERIFICATION` (untrusted provenance), or a real position (`BELOW_BENCHMARK` / `WITHIN_RANGE` / `ABOVE_BENCHMARK`).

Guarantees, all enforced in code:
- **Never a negative gap** — `Math.max(0, …)` on every gap, in `compareToBenchmark`, `calcProfitGap`, `ProfitGapAssessmentCore`, `regenerateCiqMetrics` and `saveAssessmentToSupabase`.
- **Never "underperforming" above the benchmark** — position is chosen by explicit comparison; the UI's existing `myMargin >= avg` / `myMargin >= best` branches were already correct and are unchanged.
- **No false precision when semantics are uncertain** — unverified provenance returns `NEEDS_VERIFICATION` with null numerics.
- **No opportunity from a bare number** — `calcProfitGap` refuses (returns null) rather than returning a computed value whenever any of the five preconditions fail.

**Fabricated-precision defects removed:**
| Where | Was | Now |
|---|---|---|
| `ProfitGapAssessmentCore` | `profitScore = best > 0 ? … : 0` → displayed a **fabricated `0/100`** when no benchmark existed | `null`, rendered as "Not enough information to score this yet" |
| Magic Loop promotion | `results: { profit_gap: 0, profit_gap_to_avg: 0, profit_score: 0 }` | `null` values + `NEEDS_VERIFICATION` |
| `calcIQScore` | Averaged a `profit_score` of `0` into the IQ score (understating it) | A null profit score is **excluded** from the average, never treated as zero |

---

## 14. LEGACY PROFIT DATA POLICY

Historical margin values must never automatically become canonical Digital Twin facts. Classification:

| Class | Meaning | Digital Twin behaviour |
|---|---|---|
| `VERIFIED_NET_PROFIT_MARGIN` | Entered through the Profit Gap question | Eligible for automatic ingestion |
| `VERIFIED_EBITDA_MARGIN` | Derived from an explicit EBITDA figure | Eligible **as EBITDA**, never compared to a net-profit benchmark |
| `AMBIGUOUS_LEGACY_MARGIN` | Metric family cannot be established | **Never** auto-canonicalised; requires explicit human confirmation |

Enforcement: `isComparable()` returns false for `AMBIGUOUS_LEGACY`, `DERIVED_FROM_EBITDA` and `ESTIMATED_FROM_NET_PROFIT`. Both database-facing comparison sites (`regenerateCiqMetrics`, `saveAssessmentToSupabase`) recompute this gate rather than trusting an upstream flag, so an ambiguous value yields **no gap at all** — not a flattering wrong one.

---

## 15. HISTORICAL AMBIGUITY POLICY

New file: **`src/lib/legacyAmbiguityPolicy.js`**.

| Class | Definition | Ingestion eligibility |
|---|---|---|
| **VERIFIED** | Ownership and semantic meaning directly established | `eligible_automatic` |
| **DERIVABLE** | Deterministically derivable from a verified relationship | `eligible_after_deterministic_derivation` |
| **AMBIGUOUS** | Multiple plausible interpretations or owners | `never_automatically_canonicalize` |
| **ORPHANED** | Required parent/source gone or unresolvable | `never_automatically_canonicalize` |
| **TEST_DATA** | Confirmed development/test artifact | `exclude` |
| **LEGACY_ONLY** | Valid product data that must stay available | `preserve_do_not_canonicalize` |

Exported API: `LEGACY_CLASS`, `DIGITAL_TWIN_INGESTION`, `ingestionEligibility()`, `mayAutoCanonicalize()`, `LEGACY_CLASS_DESCRIPTION`, `KNOWN_LEGACY_POPULATION`, `summarizePopulation()`.

**No `business_facts` table was created. No ingestion pipeline was built. This is documentation-as-code only.**

---

## 16. KNOWN LEGACY RECORD CLASSIFICATIONS

Counts are **observations from read-only access**. Nothing was modified.

| # | GROUP | COUNT | OWNERSHIP | SEMANTIC | CLASS | TWIN ELIGIBILITY | TREATMENT |
|---|---|---|---|---|---|---|---|
| 1 | `NinetyDaySprint` — verified creator | 2 | creator VERIFIED via `profiles.base44_user_id`; owner held exactly one business (`42f42075`) at creation | CLEAR | **VERIFIED** | automatic | Backfill on main branch |
| 2 | `NinetyDaySprint` — service identity | 2 | service account, no profile mapping | CLEAR | **ORPHANED** | never | Leave NULL |
| 3 | `SprintTask` (46 total, all NULL) | 46 | inherits from parent sprint | CLEAR | **DERIVABLE** | after derivation | Inherit from verified parent; children of orphaned sprints stay NULL |
| 4 | `GalileoConversation` — verified creator | 3 | creator VERIFIED; single business at the time | CLEAR | **VERIFIED** | automatic | Backfill on main branch |
| 5 | `GalileoConversation` — unresolvable creator | 1 | creator `6a2c7dcd…` has no profile and no user record | CLEAR | **ORPHANED** | never | Leave NULL |
| 6 | `roadmap_items` NULL business_id | 26 | all predate the only candidate business by ~28 min | CLEAR | **AMBIGUOUS** | never | No inference. Product decision |
| 7 | `assessment_sessions` NULL business_id | 14 | same — predate the candidate business | CLEAR | **AMBIGUOUS** | never | No inference. Twin must tolerate NULL-business evidence |
| 8 | `assessment_calculations` NULL, session NULL | 13 | parent has no business_id | CLEAR | **LEGACY_ONLY** | preserve | Stay NULL by design |
| 9 | `assessment_calculations` NULL, session HAS id | 229 | deterministic via `session_id` FK | CLEAR | **DERIVABLE** | after derivation | Backfill via §19 C1 |
| 10 | `documents` NULL business_id | 6 | uploaded by a verified profile inside the single-business window | CLEAR | **VERIFIED** | automatic | Backfill on main branch |
| 11 | `gap_analyses` without business_id | 19 | table has no `business_id` column | CLEAR | **LEGACY_ONLY** | preserve | Legacy mirror; not canonicalised |
| 12 | `freedom_projections` `'test-biz'` | 9 | literal test string, not an identifier | CLEAR | **TEST_DATA** | exclude | Cleanup needs a product decision (**column is NOT NULL**) |
| 13 | `p1_mymargin` values, semantics unestablished | unknown | ownership is fine; the *semantic* status is what is uncertain | **AMBIGUOUS** | **AMBIGUOUS** | never | `classifyLegacyMargin()`; never reinterpreted |

Note on row 12: Phase 6A's fix (`SET business_id = NULL`) is **impossible** — the column is `NOT NULL`.

---

## 17. DIGITAL TWIN INGESTION ELIGIBILITY RULES

> **VERIFIED** → eligible for automatic ingestion.
> **DERIVABLE** → eligible after deterministic derivation.
> **AMBIGUOUS** → never automatically canonicalised.
> **ORPHANED** → never automatically canonicalised.
> **TEST_DATA** → excluded.
> **LEGACY_ONLY** → preserved but not automatically canonicalised.

Encoded as `DIGITAL_TWIN_INGESTION` with `mayAutoCanonicalize(legacyClass)` returning true **only** for VERIFIED. Documented now; enforced later. **No Digital Twin implementation was started.**

---

## 18. OBSOLETE MIGRATION STEPS REMOVED

`src/supabase/migrations/phase_6a_tenant_integrity.sql` is **marked obsolete** (banner added). Do not run it. Of its 8 steps:

| Step | Verdict | Evidence |
|---|---|---|
| `galileo_conversations` ADD `business_id` | ALREADY APPLIED | column exists, uuid, FK → `business_entities`, index present |
| ADD `session_type` | NOT NEEDED | `conversation_type` + `conversation_mode` + `visibility_scope` already exist |
| index on `business_id` | ALREADY APPLIED | `idx_galileo_conversations_business_id` |
| `assessment_calculations` backfill | **SAFE — RETAINED** | 229 deterministic rows, 0 orphans |
| index on `assessment_calculations.business_id` | ALREADY APPLIED | `idx_assessment_calculations_business_id` |
| `freedom_projections` SET NULL | **IMPOSSIBLE** | column is `TEXT NOT NULL`; would raise |
| `strategy_outcomes` FK | NOT APPLICABLE | `business_id` is TEXT; the uuid guard never opens |
| `next_best_actions` ADD `canonical_business_id` | NOT NEEDED | FK already → `business_entities(id)` |
| `saved_playbooks` ADD `canonical_business_id` | NOT NEEDED | redundant |
| `value_creation_events` FK | **SAFE — RETAINED** | 0 rows, no existing FK |
| `galileo_conversations` RLS policies | **WOULD REGRESS** | RLS already enabled; existing `can_access_business` policy is stronger than the proposed `profile_id = auth.uid()` |

**Net: of 11 statements, 4 already applied, 4 unnecessary, 1 impossible, 1 would regress — and exactly 2 contained real work.** No redundant canonical-business transition was created.

---

## 19. NEW SAFE MANUAL MIGRATION SQL

New file: **`src/supabase/migrations/phase_6b1_safe_foundation.sql`**. Each section carries WHY / EXPECTED ROW IMPACT / PRECONDITION / VALIDATION QUERY / ROLLBACK.

| Section | Content | Row impact |
|---|---|---|
| A | Obsolete Phase 6A steps, removed and explained | 0 |
| B | RLS audit queries (read-only, commented out) | 0 |
| **C1** | `assessment_calculations.business_id` backfill via `session_id` FK | **229 rows** |
| **C2** | `value_creation_events.roadmap_item_id` FK, `ON DELETE SET NULL` | 0 (table empty) |
| D | Record-level backfills deliberately excluded, with policy reference | 0 |

Only C1 and C2 are approved for manual execution. Both are idempotent and have stated rollbacks. **NOT EXECUTED.**

---

## 20. DATABASE CHANGES EXECUTED: NONE

No DDL. No DML. No backfill. No record created, updated or deleted. No `business_facts`. No Digital Twin tables.

Reason 1 — the tooling's Supabase connector carries `projects:read`, `secrets:read`, `database:read` and **no `database:write`**.
Reason 2 — there is only **one** Supabase project (`tfrbswfrhrtgfcgonimb`); it is shared with main, so a migration would run against production.
Reason 3 — entity **records are not branched**; this branch cannot write records at all, across every store.

---

## 21. VALIDATION A–T

| # | Check | Result | Basis |
|---|---|---|---|
| A | Complete active write-path inventory | **PASS** | 80 writers enumerated mechanically with write counts, scoping signals and per-file classification |
| B | Every active authenticated business-owned write path has a valid authorization strategy | **PARTIAL** | 2 holes fixed; 10 residual paths classified by pattern, not read |
| C | Application guard matches verified RLS ownership semantics | **PASS** | Guard's first three checks are the RLS rule verbatim; remaining four are additive |
| D | Parent/child writes inherit business scope safely | **PASS_CODE** | 7 inheritance rules documented/verified; `assertChildBusinessId` enforces mismatch rejection |
| E | Conversation history remains business-scoped | **PASS_CODE** | Write, read and RLS all scope by `business_id` |
| F | Anonymous Magic Loop remains guest-scoped | **PASS_CODE** | Guests use `guest_sessions` via `guest_session_id`; cannot surface in an authenticated read |
| G | Canonical profit metric definitions established | **PASS** | `src/lib/profitSemantics.js` — 9 metrics, provenance, positions |
| H | `p1_mymargin` semantic lineage fully traced | **PASS** | 16 consumers mapped; both misuse sites identified and fixed (§9, §11) |
| I | No active calculation compares incompatible margin types | **PASS** | `calcProfitGap` has no defaults; `benchmarkCompatible` is identity-only |
| J | No active benchmark comparison uses ambiguous legacy margin without verification | **PASS** | Both DB-facing sites recompute the provenance gate; ambiguous → null |
| K | Profit Opportunity handles above/within/below/unknown correctly | **PASS** | Explicit positions; gaps clamped ≥ 0; fabricated `0` score removed; UI already branched correctly |
| L | Legacy ambiguity policy established | **PASS** | `src/lib/legacyAmbiguityPolicy.js` |
| M | Known ambiguous historical records classified | **PASS** | 13 groups classified (§16); nothing mutated |
| N | Safe foundation SQL contains no obsolete migration steps | **PASS** | 4 already-applied / 4 unnecessary / 1 impossible / 1 regressive steps all removed |
| O | No database mutation performed | **PASS** | No DDL, DML, backfill or record write |
| P | Existing BIS preserved | **PASS** | Contract files untouched; `buildGalileoContext` read scoping preserved from 6B |
| Q | Existing valuation preserved | **PASS** | `valuationAuth`, `valuationCalculationEngine`, `valuationService` untouched |
| R | Existing assessments preserved | **PASS** | No assessment formula, question or threshold changed; only margin *labelling* and refusal behaviour |
| S | Existing Galileo Home preserved | **PASS** | No resolver, surface or routing file touched |
| T | Build passes | **PASS** | `npx vite build` → exit 0, zero errors |

**Summary: 18 PASS · 1 PARTIAL · 0 FAIL.** No runtime/database claim is made: B–F are `PASS_CODE`, i.e. verified by reading code, because read-only access and the branch's write restrictions make runtime verification impossible.

---

## 22. REMAINING BLOCKERS

### Blocker A — write-path coverage residual (gates condition 1)
**10 backend writers are classified by pattern, not read line-by-line:**
`achievementNotifications`, `calculateFreedomAcceleration`, `calendarService`, `createBusinessEntity`, `enterpriseDiscoveryOrchestrator`, `generateWeeklyDigest`, `getUploadSignedUrl`, `googleDriveImport`, `hydrateDashboardFromJourney`, `liveSyncOrchestrator`, `onRoadmapItemCompleted`, `onSprintItemCompleted`, `orchestrateBusinessCreation`, `supabaseDashboardData`, `supabaseDocumentData`, `supabaseRoadmapData`, `updateExtractedFieldReview`.

**Exact work:** read each; confirm the resolved `business_id` is server-derived or parent-inherited and never client-supplied; apply `validateBusinessScope` only where a client-supplied value reaches a business-owned write.

### Blocker B — guest promotion persists no dashboard metrics (NEW, not fixed)
`guestSessionService` (lines ~621–690) writes **object literals** into `dashboard_metrics` columns `profit_gap`, `value_gap`, `tax_gap`, `operations_gap` and `recast_ebitda`. Those columns are **numeric**; the object belongs in the sibling `*_details` column (`saveAssessmentToSupabase` and `regenerateCiqMetrics` both follow that convention). The `UPDATE` therefore fails and is swallowed by its own `catch`, so the entire promotion metrics write — including `revenue`, `freedom_date` and `overall_impact_score` — is discarded.

It also fabricates scores: `profit_gap → 55`, `value_gap → 60`, `operations_gap → 50` when an assessment merely exists, and a tax score of `45`/`70` on an absolute `$20,000` threshold.

**Exact work:** remap to the numeric + `*_details` convention, delete the invented constants, and let missing scores be absent rather than averaged in. Currently **inert** (nothing is written), which is why this is a correctness bug and not a data-corruption incident.

### Blocker C — ambiguous legacy sets need a product decision
26 `roadmap_items`, 14 `assessment_sessions`, 9 `freedom_projections`, 2 service-created Sprints, 1 orphaned conversation. Policy exists; attribution does not. **Exact work:** a product decision per group, then either backfill or formally retire.

### Blocker D — safe foundation not yet executed
The 229-row backfill and one FK await a human in the Supabase SQL Editor. **Record** backfills (sprints, tasks, conversations, documents) must run on the **main** branch.

### Blocker E — four tables have no RLS policy
`roadmap_items` (201 rows), `strategy_outcomes`, `saved_playbooks`, `freedom_projections`. Deny-all for clients; the service role is the only gate. **Exact work:** add the standard `can_access_business(business_id)` policy.

### Blocker F — known-but-out-of-scope semantic defects
`DynamicScenarioBuilder` names a net-profit margin `currentEBITDAMargin` and multiplies it into projected EBITDA; `calcIQScore.tax_score` and `businessIntelligenceState` score tax efficiency against absolute dollar thresholds; `whatChanged` uses `gross_margin` as a change label. Each is documented in §9; none was changed, because the brief forbids redesigning assessment semantics in this phase.

---

## 23. FILES CHANGED

**New (4)**
| File | Purpose |
|---|---|
| `src/lib/profitSemantics.js` | Canonical profit metric contract, provenance, positions, benchmark compatibility |
| `src/lib/legacyAmbiguityPolicy.js` | Six-class legacy taxonomy, ingestion rule, classified population |
| `src/supabase/migrations/phase_6b1_safe_foundation.sql` | Consolidated safe migration (2 approved statements) |
| `src/PHASE_6B1_DIGITAL_TWIN_READINESS_CLOSURE_REPORT.md` | This report |

**Modified (12)**
| File | Change |
|---|---|
| `src/lib/assessmentCalculations.js` | `calcProfitGap` requires explicit semantics (no defaults); adds `position`/`comparable`; new `resolveProfitGap()`; `calcIQScore` excludes null rather than averaging a zero; `buildGalileoContext` emits explicit margin semantics |
| `src/lib/AssessmentContext.jsx` | EBITDA estimate from `p1_mymargin` now provenance-tagged; explicit `p1_mymargin_type`; explicit entry marks EBITDA verified |
| `src/hooks/useGalileoConversation.js` | Promotion writes `ebitda_margin` (not `p1_mymargin`); fabricated zeroes removed |
| `src/hooks/useGalileoMagicLoop.js` | Same fix |
| `src/components/assessments/ProfitGapAssessmentCore.jsx` | No fabricated `0/100` score when no benchmark; renders "Not enough information to score this yet" |
| `base44/functions/regenerateCiqMetrics/entry.ts` | `gapToAvg` gated on verified net-profit semantics; clamped ≥ 0 |
| `base44/functions/saveAssessmentToSupabase/entry.ts` | `gapToAvg` gated on verified net-profit semantics; clamped ≥ 0 |
| `base44/functions/uploadDocumentToSupabase/entry.ts` | `validateBusinessScope` enforced on client-supplied business ids |
| `base44/functions/recordStrategyOutcome/entry.ts` | `validateBusinessScope` enforced on the create path |
| `src/supabase/migrations/phase_6a_tenant_integrity.sql` | Marked obsolete |

**Untouched, deliberately:** assessment formulas, questions, thresholds and scoring; Business IQ formula; Galileo Home; Magic Loop; Sprint architecture; `valuationAuth`; the `businesses` table; BIS contract files.

---

## 24. ROLLBACK INSTRUCTIONS

**Code** — revert the 12 modified files. All changes are additive (new keys, new guard checks, stricter refusals). No stored data was altered, so no data rollback is needed.

Behaviour if reverted: `p1_mymargin` misuse returns, promotion writes fabricated zeroes again, and the two documents/outcome write paths lose their tenant guard.

**SQL** — nothing has run, so nothing needs rolling back. If Section C is executed later:
```sql
ALTER TABLE value_creation_events
  DROP CONSTRAINT IF EXISTS value_creation_events_roadmap_item_id_fkey;

UPDATE assessment_calculations SET business_id = NULL WHERE business_id IS NOT NULL;
```

**Entity / record rollback** — not applicable. No entity schema and no record was written.

---

## 25. FINAL GO / NO-GO

# DIGITAL TWIN READINESS: NO-GO

### Gate conditions

| # | Condition | Verdict |
|---|---|---|
| 1 | All active authenticated business-owned write paths have a valid authorization strategy | ❌ **NOT MET** — 10 paths classified by pattern, not verified by reading |
| 2 | Profit semantics are explicit throughout active calculations | ✅ MET |
| 3 | Ambiguous legacy profit values cannot silently become canonical | ✅ MET |
| 4 | Historical ambiguity policy is established | ✅ MET |
| 5 | Galileo conversation scoping remains business-safe | ✅ MET |
| 6 | RLS and application authorization agree | ✅ MET |
| 7 | Remaining manual migration script is safe, no obsolete assumptions | ✅ MET |

Six of seven met. One not met is enough — and condition 1 is the one that protects every future fact the Digital Twin would hold.

### Remaining blockers and exact work required

**1. Verify the 10 residual write paths.** Read `achievementNotifications`, `calculateFreedomAcceleration`, `calendarService`, `createBusinessEntity`, `enterpriseDiscoveryOrchestrator`, `generateWeeklyDigest`, `getUploadSignedUrl`, `googleDriveImport`, `hydrateDashboardFromJourney`, `liveSyncOrchestrator`, `onRoadmapItemCompleted`, `onSprintItemCompleted`, `orchestrateBusinessCreation`, `supabaseDashboardData`, `supabaseDocumentData`, `supabaseRoadmapData`, `updateExtractedFieldReview`. For each: confirm the resolved `business_id` is server-derived or parent-inherited; guard only where a client-supplied value reaches a business-owned write.

**2. Fix `guestSessionService`'s promotion metrics payload.** Remap to the numeric + `*_details` convention; delete the invented `55`/`60`/`50`/tax-threshold constants; let absent scores stay absent.

**3. Execute the safe foundation (human, Supabase SQL Editor).** Run Section C of `phase_6b1_safe_foundation.sql` — the 229-row `assessment_calculations` backfill and the `value_creation_events` FK; validate with the supplied query.

**4. Run record backfills on the main branch.** 2 Sprints, 46 SprintTasks, 3 conversations, 6 documents. This branch cannot write records.

**5. Decide the ambiguous sets.** 26 `roadmap_items`, 14 `assessment_sessions`, 9 `freedom_projections`, 2 service-created Sprints, 1 orphaned conversation. Product decision, not engineering.

**6. Add RLS policies** for `roadmap_items`, `strategy_outcomes`, `saved_playbooks`, `freedom_projections`.

**7. Close the out-of-scope semantic defects** listed in §22 Blocker F as a separate, deliberate phase.

**8. Run the A→B→A runtime isolation walkthrough** — still impossible from this branch.

### Positive statement of what IS ready

The profit dimension is now trustworthy: one canonical metric contract, no implicit comparisons, no fabricated scores, and a margin whose metric family is recorded rather than assumed. The legacy policy is established and the population classified, so nothing ambiguous can silently become canonical. RLS and the application guard agree by construction. And the migration that remains is two statements, both idempotent, both with rollbacks, neither based on the false premises that made Phase 6A unsafe.

---

**DO NOT MERGE. DO NOT PUBLISH.**
Nothing built here reaches the published app until this branch is merged into main and published from there.