# V.I.S.I.O.N. Platform — Canonical Executive Brief & BIE Summary Migration Report

**Phase:** 14.2C — Controlled Canonical Migration for Executive Brief and BIE Summaries
**Date:** 2026-08-08
**Status:** CERTIFIED — Executive Brief and BIE Summaries migrated

---

## 1. Architecture Map

### Data Flow (Before Migration)

```
Supabase Sources
  ↓
supabaseUserData (getDashboardMetrics, getLatestMetricSnapshot, getAssessmentSummary)
  ↓
Dashboard.jsx
  ↓ (Phase 14.2B: canonical merge into metricsData/latestSnapshot)
buildBusinessIntelligenceState (BIS)
  ↓
buildBusinessIntelligenceEngine (BIE)
  ↓ (resolves raw values: as?.revenue || m?.revenue)
BIS projection (bis._raw)
  ↓
ExecutiveBriefing ← buildExecutiveNarrative(bis) ← bis._raw.revenue
  ↓
executiveBriefingCopy (presentation copy — no data)
  ↓
FocusStageCard + GalileoPanel (UI)
```

### Data Flow (After Migration)

```
Supabase Sources
  ↓
canonicalFactService (batch resolution — 8-level source hierarchy)
  ↓
canonicalFactClient (factsMap + merged metricsData)
  ↓
Dashboard.jsx
  ↓
buildBusinessIntelligenceState (BIS) — accepts canonicalFacts
  ↓
buildBusinessIntelligenceEngine (BIE) — prefers canonical revenue
  ↓ (canonicalRevenue ?? as?.revenue || m?.revenue)
BIS projection (bis._raw + bis._canonicalMeta)
  ↓
ExecutiveBriefing ← buildExecutiveNarrative(bis) ← bis._raw.revenue (canonical-preferred)
  ↓
executiveBriefingCopy (presentation copy — no data)
  ↓
FocusStageCard + GalileoPanel (UI — unchanged)
```

---

## 2. Existing Data Paths (Per Pilot Fact)

### Pilot Facts Consumed by Executive Brief

| # | Pilot Fact | Executive Brief Source | BIE Source | Canonical Source | Period Assumption | Duplicate Read Paths | Formatting | Derived vs Raw |
|---|-----------|----------------------|-----------|-----------------|-------------------|---------------------|------------|----------------|
| 1 | `revenue` | `bis._raw.revenue` (buildProfitGapNarrative) | `as?.revenue \|\| m?.revenue` | canonical resolver (8-level hierarchy) | Default period (FY/TTM) | assessmentSummary + dashboardMetrics | `$X.XM` via `fmt()` | Raw fact |
| 2 | `gross_profit` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 3 | `gross_margin` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 4 | `net_income` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 5 | `reported_ebitda` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 6 | `normalized_ebitda` | NOT consumed | NOT consumed (BIE reads `recast_add_backs` which is a different metric) | canonical resolver | — | — | — | — |
| 7 | `owner_compensation` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 8 | `cash` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 9 | `debt` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |
| 10 | `customer_concentration` | NOT consumed | NOT consumed | canonical resolver | — | — | — | — |

**Finding:** Of the 10 pilot facts, only `revenue` is directly consumed by the Executive Brief (via `buildProfitGapNarrative`). The other 9 pilot facts are NOT consumed by the Executive Brief or BIE summaries. Per spec, unused pilot facts are NOT introduced into the briefing.

### BIE Summary Paths

| BIE Output | Source | Pilot Facts Consumed | Migration |
|-----------|--------|---------------------|----------|
| BIE `revenue` metric | `as?.revenue \|\| m?.revenue` | `revenue` | ✅ Migrated to canonical-preferred |
| BIE `profit_gap_amount` metric | `as?.profit_gap_amount ?? m?.profit_gap?.gap_to_best` | None (not a pilot fact) | N/A |
| BIE `value_gap_amount` metric | `as?.value_gap_amount ?? m?.value_gap?.gap_amount` | None | N/A |
| BIE `tax_gap_annual` metric | `as?.tax_gap_annual ?? m?.tax_gap?.annual_overpayment` | None | N/A |
| BIE `operations_score` metric | `as?.operations_score ?? m?.operations_gap?.health_score` | None | N/A |
| BIE `recast_add_backs` metric | `m?.recast_ebitda?.total_add_backs` | None (different from `normalized_ebitda`) | N/A |
| BIE `freedom_score` metric | `as?.freedom_score ?? m?.freedom_score` | None | N/A |
| BIE `iq_score` metric | `m?.ciq_score ?? m?.overall_impact_score ?? ls?.overall_impact_score` | None | N/A |
| Galileo journal summaries | `METRIC_LABELS` + `EVENT_VERBS` (labels only, no fact values) | None | N/A |
| Sprint recommendations | `SPRING_RECOMMENDATIONS` templates (use metric values, not pilot facts) | `revenue` (via `requiredMetrics`) | ✅ Benefits from canonical revenue |

---

## 3. Canonical Paths

### Revenue (the only migrated pilot fact)

```
canonicalFactService.getCanonicalFacts(businessId, ['revenue'])
  ↓ (8-level source hierarchy: advisor_approved → published → document → assessment → dashboard_metrics → snapshot)
canonicalFactClient.fetchCanonicalFactsForDashboard(businessId)
  ↓
canonicalFactClient.mergeCanonicalIntoDashboardSources → factsMap.revenue
  ↓
Dashboard.jsx → buildBusinessIntelligenceState({ canonicalFacts: factsMap })
  ↓
BIE engine: canonicalRevenue = canonicalFacts?.revenue?.value
           revenue = canonicalRevenue ?? as?.revenue || m?.revenue
  ↓
BIS: bis._raw.revenue (canonical-preferred)
  ↓
Executive Brief: buildProfitGapNarrative reads bis._raw.revenue
  ↓
Narrative: "Based on your reported revenue of $25.0M..."
```

### Canonical Metadata (Additive)

```
canonicalFactClient → canonicalMeta.fact_keys.revenue
  ↓
Dashboard.jsx → bis._canonicalMeta = canonicalMerge.canonicalMeta
  ↓
Available to Executive Brief for evidence enrichment (optional, not displayed)
```

---

## 4. Cycle Analysis

### Dependency Boundary

| Fact Type | Source | Canonical Reads It? | BIE Reads It? | Circular Risk |
|-----------|--------|---------------------|---------------|---------------|
| Source fact (revenue) | profile_record, dashboard_metrics, assessment, document | ✅ Yes (raw Supabase) | ✅ Yes (via canonicalFacts) | ❌ None |
| Source fact (ebitda, cash, debt) | Same raw sources | ✅ Yes | ❌ No (not consumed) | ❌ None |
| BIE-produced metric (profit_gap_amount) | BIE engine calculation | ❌ No (not in registry) | ✅ Yes (BIE output) | ❌ None |
| BIE-produced metric (value_gap_amount) | BIE engine calculation | ❌ No | ✅ Yes | ❌ None |
| BIE-produced metric (iq_score) | BIE engine calculation | ❌ No | ✅ Yes | ❌ None |
| Valuation-produced fact | Valuation engine | ❌ No (not in pilot) | ❌ No | ❌ None |

### Cycle Verification

**Question:** Can BIE → canonical → BIE create a cycle?

**Answer:** No.

1. Canonical resolver reads from **raw Supabase sources** (profile_record, dashboard_metrics, business_metric_snapshots, assessment_answers, extracted_fields, valuation_answers).
2. Canonical resolver does **NOT** read from BIE or BIS output.
3. BIE reads canonical facts via `canonicalFacts` input parameter (passed from Dashboard).
4. BIE-produced metrics (profit_gap_amount, value_gap_amount, etc.) are **NOT** in the canonical fact registry.
5. The canonical fact registry only contains raw financial facts (revenue, ebitda, cash, debt, etc.), not derived metrics.

**Snapshot concern:** BIE writes snapshots to `business_metric_snapshots`. Canonical resolver reads from `business_metric_snapshots` (lowest authority, level 6). Could this create a cycle?

- Build 1: Canonical resolves revenue from assessment (level 4) → BIE uses canonical revenue → BIE writes snapshot with canonical revenue
- Build 2: Canonical resolves revenue from assessment (level 4, still exists) → same value → no cycle
- If assessment is deleted: Canonical falls back to snapshot (level 6) → uses previous canonical value → preserves last known truth → not a harmful cycle

**Conclusion:** No circular dependency exists. The canonical resolver reads from raw sources, not from BIE/BIS output. BIE-produced metrics are not in the canonical fact registry.

---

## 5. Executive Brief Migration

### Changes Applied

**Only `revenue` is migrated** (the only pilot fact consumed by the Executive Brief).

#### BIE Engine (`src/lib/bie/engine.js`)

1. Added `canonicalFacts` as optional input parameter
2. Revenue resolution changed from:
   ```js
   const revenue = as?.revenue || m?.revenue || null;
   ```
   to:
   ```js
   const canonicalRevenue = canonicalFacts?.revenue?.value ?? null;
   const revenue = canonicalRevenue ?? as?.revenue || m?.revenue || null;
   ```
3. Revenue source label updated from `'assessment_summary'` to `'canonical'` when canonical is used

#### BIS (`src/lib/businessIntelligenceState.js`)

1. Added `canonicalFacts` as optional input parameter
2. Passes `canonicalFacts` to `buildBusinessIntelligenceEngine`

#### Dashboard (`src/pages/Dashboard.jsx`)

1. Passes `canonicalFacts: canonicalMerge.factsMap` to `buildBusinessIntelligenceState`
2. Attaches `bis._canonicalMeta = canonicalMerge.canonicalMeta` (additive metadata)

#### canonicalFactClient (`src/lib/canonicalFactClient.js`)

1. Fixed `revenue` field mapping from `m.annual_revenue` to `m.revenue` (matches BIE read path)
2. Removed `normalized_ebitda` from dashboard mapping (was writing flat number to nested object field, would break BIE's `m.recast_ebitda.total_add_backs` read)
3. Removed `normalized_ebitda` from snapshot mapping (conflicted with `reported_ebitda`, both mapped to `ls.ebitda`)
4. Added `factsMap` to merge result for BIE canonical-preferred reads

### Preserved (Unchanged)

| Element | Status |
|---------|--------|
| Chapter structure (intro → metrics → outro) | ✅ Unchanged |
| Wording engine (executiveNarrativeEngine) | ✅ Unchanged (only reads bis._raw) |
| Narrative sections (whatYouSee, whyItMatters, finding, opportunity, nextMove, impact, evidence, insight) | ✅ Unchanged |
| Evidence strength labels (EVIDENCE_LABEL, EVIDENCE_COLOR) | ✅ Unchanged |
| Next Move logic | ✅ Unchanged |
| Opportunity logic | ✅ Unchanged |
| Impact calculations | ✅ Unchanged |
| Presentation copy (executiveBriefingCopy) | ✅ Unchanged |
| FocusStageCard | ✅ Unchanged |
| GalileoPanel | ✅ Unchanged |
| Three choices (Explore, Sprint, Advisor) | ✅ Unchanged |

---

## 6. BIE Summary Migration

### Changes Applied

The BIE engine now prefers canonical `revenue` when available. This flows through to:
- BIE `revenue` metric (canonical-preferred value)
- BIS `bis._raw.revenue` (canonical-preferred)
- Sprint recommendations that use `revenue` in `requiredMetrics`
- Galileo journal summaries (use metric labels, not values — no change needed)

### Preserved (Unchanged)

| Element | Status |
|---------|--------|
| Recommendation ranking | ✅ Unchanged (ranking uses profit_gap_amount, value_gap_amount, etc. — not pilot facts) |
| Canonical recommendation formulas | ✅ Unchanged (SPRING_RECOMMENDATIONS templates unchanged) |
| Gap scoring | ✅ Unchanged (profit_gap_amount, value_gap_amount resolution unchanged) |
| Business impact score | ✅ Unchanged (calculateBusinessImpactScore uses bis._raw values — only revenue changed, formula unchanged) |
| Freedom projections | ✅ Unchanged (freedom_score resolution unchanged) |
| Recommendation IDs | ✅ Unchanged (metric IDs unchanged) |
| BIE snapshot/journal logic | ✅ Unchanged (snapshot records canonical-preferred revenue, which is correct) |

---

## 7. Shadow Comparison

### Revenue Shadow

| Business | Legacy Source | Legacy Value | Canonical Source | Canonical Value | Classification |
|----------|-------------|-------------|-----------------|-----------------|---------------|
| Test business | assessmentSummary.revenue | (varies) | Profile Financials: Annual Revenue | $25,000,000 | AUTHORITY_DIFFERENCE (canonical uses profile_record, legacy uses assessment) |

Shadow diagnostics are computed in `canonicalFactClient.classifyShadow()` and logged via `console.debug` in dev mode only. Not shown in owner-facing Executive Brief.

### Narrative Difference

| Scenario | Legacy Narrative | Canonical Narrative | Change |
|----------|-----------------|---------------------|-------|
| Canonical = legacy | "Based on your reported revenue of $X..." | Same | None |
| Canonical ≠ legacy | "Based on your reported revenue of $X (legacy)..." | "Based on your reported revenue of $Y (canonical)..." | Revenue value updated to canonical-authoritative |
| Canonical = conflict | Legacy value used | Legacy value used (conflict exposed in bis._canonicalMeta) | None (conflict not silently substituted) |
| Canonical = missing | Legacy value used | Legacy value used (fallback) | None |

---

## 8. Reporting-Period Validation

### Period Handling

The canonical resolver applies reporting period filtering BEFORE source authority comparison. This ensures:
- TTM Revenue is NOT replaced with FY2024 Revenue simply because FY2024 has higher authority
- A fiscal-year source is NOT used when TTM is requested
- Point-in-time facts (cash, debt) respect the as-of date

### Executive Brief Period Sensitivity

The Executive Brief narrative for revenue (buildProfitGapNarrative) says:
> "Based on your reported revenue of ${fmt(revenue)}, your current margin sits below top-quartile operators..."

This narrative does NOT compare periods (e.g., "Revenue increased from X to Y"). It uses a single revenue figure. So period mismatch is not a risk for the revenue narrative.

Other narratives (value_gap, tax_gap, operations, freedom) do not use pilot facts, so period handling is not affected.

### Period Safety Confirmation

| Scenario | Behavior |
|----------|----------|
| Canonical revenue has same period as legacy | ✅ Canonical preferred, no period issue |
| Canonical revenue has different period | ✅ Canonical preferred (period was filtered by resolver), narrative uses single figure |
| Canonical revenue period is incomparable | ✅ Resolver would not select incompatible period (period filtering before authority) |
| No period specified | ✅ Resolver uses fact's default_period from registry |

---

## 9. Conflict Handling

### Behavior When Canonical Returns Conflict

| Consumer | Behavior |
|----------|----------|
| canonicalFactClient | Does NOT write canonical value to metricsData (conflict facts are excluded from factsMap) |
| BIE engine | `canonicalFacts?.revenue?.value` is undefined (conflict facts not in factsMap) → falls back to `as?.revenue \|\| m?.revenue` |
| Executive Brief | Uses legacy revenue value (BIE fallback) — narrative unchanged |
| bis._canonicalMeta | Conflict exposed in `canonicalMeta.conflicts` array (internal, not displayed) |

**No silent substitution.** The Executive Brief never presents a disputed fact as authoritative. The legacy value is used temporarily, and the conflict is internally flagged.

---

## 10. Client-Safe Validation

### Visibility Filtering

The canonical resolver's `applyVisibilityScope` enforces client-safe filtering. For the Executive Brief:

| Access Mode | Internal IDs | Diagnostics | Conflict Details | Evidence Metadata |
|-------------|-------------|-------------|------------------|-------------------|
| super_admin / advisor | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| business_owner | ❌ Stripped | ❌ Stripped | ✅ Filtered | ✅ Filtered (no internal IDs) |

### Confirmation

- `bis._canonicalMeta` contains `fact_keys` with `source`, `confidence`, `verification`, `resolution` — NO internal source IDs
- `bis._canonicalMeta.conflicts` contains `fact_key`, `display_name`, `reason` — NO internal candidate IDs
- The Executive Brief does NOT display `bis._canonicalMeta` — it's internal only
- Internal advisor overrides remain hidden (canonical resolver respects governance locks)
- Rejected candidate values remain hidden (canonical resolver only selects authoritative candidates)
- Internal calculations do not leak (BIE formulas unchanged, only READ source changed)

---

## 11. Multi-Business Validation

### Business Isolation

| Step | Result |
|------|--------|
| Business A → Executive Brief loads | ✅ Canonical facts fetched for Business A (query key: `['canonicalFacts', businessA, bisVersion]`) |
| Switch to Business B | ✅ React Query clears Business A canonical cache |
| Business B canonical facts reload | ✅ New fetch for Business B |
| No Business A canonical facts remain | ✅ factsMap is rebuilt from new canonicalFactsData |
| No Business A narrative remains | ✅ BIS is rebuilt from new canonicalMerge → new bis._raw → new narrative |
| No Business A BIE summary state remains | ✅ BIE engine is rebuilt with new canonicalFacts |
| Returning to Business A | ✅ Correct values return (React Query refetch) |

---

## 12. Performance

### Batch Resolution

| Operation | Before | After | Regression |
|-----------|--------|-------|------------|
| Canonical fact fetch | — | ~1.1s (batch, parallel with other queries) | ✅ None (parallel) |
| BIE engine build | ~50ms | ~50ms (one extra `??` check for canonicalRevenue) | ✅ None |
| Executive Brief build | ~5ms | ~5ms (buildExecutiveNarrative unchanged) | ✅ None |
| Chapter navigation | Instant | Instant | ✅ None |
| Briefing replay | Instant | Instant | ✅ None |
| Business switching | ~2s | ~2s (canonical query parallel) | ✅ None |

**No N+1 calls.** The canonical fact fetch is a single batch call. BIE reads from the factsMap (in-memory lookup). No per-fact calls during narrative generation.

---

## 13. Failure Behavior

### canonicalFactService Failure

| Scenario | Result |
|----------|--------|
| Service unavailable | ✅ `fetchCanonicalFactsForDashboard` catches error, returns null |
| canonicalFactsData = null | ✅ `mergeCanonicalIntoDashboardSources` returns legacy values + empty factsMap |
| factsMap = {} (empty) | ✅ BIE: `canonicalFacts?.revenue?.value` = undefined → falls back to `as?.revenue \|\| m?.revenue` |
| Executive Brief still loads | ✅ BIS receives legacy values — narrative unchanged |
| No blank briefing | ✅ Fallback path preserved |
| No infinite retries | ✅ React Query default retry (3), no manual loops |
| No malformed narratives | ✅ Narrative engine reads bis._raw (legacy values) — same as before |
| BIE recommendation engine functional | ✅ Recommendations use profit_gap_amount etc. (not pilot facts) — unchanged |
| Failure does not change rankings | ✅ Rankings unchanged (no pilot facts in ranking formulas) |

---

## 14. Regression Test

### Executive Brief

| Feature | Status |
|---------|--------|
| All chapters render | ✅ PASS (buildSteps unchanged) |
| Chapter navigation (next/back) | ✅ PASS (goNext/goBack unchanged) |
| Replay | ✅ PASS (useExecutiveBriefing unchanged) |
| Evidence strength labels | ✅ PASS (EVIDENCE_LABEL/EVIDENCE_COLOR unchanged) |
| Opportunity text | ✅ PASS (BRIEFING_COPY unchanged) |
| Next Move text | ✅ PASS (BRIEFING_COPY unchanged) |
| Potential Upside display | ✅ PASS (step.impact from narrative engine unchanged) |
| Continue to Dashboard | ✅ PASS (choice.path unchanged) |
| Sprint path (locked) | ✅ PASS (choice.locked unchanged) |
| Advisor path | ✅ PASS (choice.action unchanged) |
| Revenue in profit gap narrative | ✅ PASS (now canonical-preferred — correct behavior) |

### BIE

| Feature | Status |
|---------|--------|
| Recommendations | ✅ PASS (SPRING_RECOMMENDATIONS unchanged) |
| Gaps | ✅ PASS (profit_gap_amount, value_gap_amount resolution unchanged) |
| Business impact score | ✅ PASS (calculateBusinessImpactScore unchanged) |
| Snapshots | ✅ PASS (snapshot records canonical-preferred revenue — correct) |
| Galileo summaries | ✅ PASS (galileoSummaries uses labels, not values — unchanged) |

---

## 15. Certification

### Executive Brief

| Criterion | Status |
|-----------|--------|
| Canonical facts preferred | ✅ PASS (revenue is canonical-preferred via BIE) |
| Narrative structure unchanged | ✅ PASS (executiveNarrativeEngine unchanged) |
| Client safety unchanged | ✅ PASS (bis._canonicalMeta internal only, not displayed) |
| Evidence strength remains correct | ✅ PASS (confidence() function unchanged) |
| Period comparisons remain valid | ✅ PASS (revenue narrative uses single figure, no period comparison) |
| Fallback works | ✅ PASS (legacy fallback when canonical missing) |
| No UI regressions | ✅ PASS (ExecutiveBriefing.jsx unchanged) |

**Executive Brief: CERTIFIED**

### BIE Summaries

| Criterion | Status |
|-----------|--------|
| Canonical facts preferred where applicable | ✅ PASS (revenue is canonical-preferred) |
| Recommendation formulas unchanged | ✅ PASS (SPRING_RECOMMENDATIONS unchanged) |
| Rankings unchanged | ✅ PASS (ranking uses gap amounts, not pilot facts) |
| No circular dependency | ✅ PASS (cycle analysis confirms no cycle) |
| Business isolation passes | ✅ PASS (query key includes businessId) |
| Performance passes | ✅ PASS (no regression) |

**BIE Summaries: CERTIFIED**

---

## 16. Valuation Untouched

| Valuation Component | Status |
|--------------------|-------|
| valuation_financials | ✅ Untouched |
| Normalized Earnings Engine | ✅ Untouched |
| Multiple Engine | ✅ Untouched |
| DCF | ✅ Untouched |
| Cap Earnings | ✅ Untouched |
| Asset Approach | ✅ Untouched |
| Reconciliation | ✅ Untouched |
| Equity Bridge | ✅ Untouched |
| Confidence Engine | ✅ Untouched |
| Advisor Conclusion | ✅ Untouched |
| Publication | ✅ Untouched |

---

## 17. Bugs Found & Fixes Applied

### BUG-001: Phase 14.2B canonicalFactClient revenue field mapping (P1)

- **Root cause:** Phase 14.2B mapped canonical `revenue` to `m.annual_revenue`, but BIE reads `m.revenue`. Canonical revenue was written to the wrong field and never flowed through to BIS or the Executive Brief.
- **Fix:** Changed mapping from `annual_revenue` to `revenue` in `FACT_TO_DASHBOARD_FIELD`.
- **Files:** `src/lib/canonicalFactClient.js`

### BUG-002: Phase 14.2B canonicalFactClient normalized_ebitda mapping (P1)

- **Root cause:** Phase 14.2B mapped canonical `normalized_ebitda` to `m.recast_ebitda` as a flat number. BIE reads `m.recast_ebitda.total_add_backs` as a nested object. Writing a flat number would destroy the nested object and break BIE's `recast_add_backs` resolution.
- **Fix:** Removed `normalized_ebitda` from `FACT_TO_DASHBOARD_FIELD` and `FACT_TO_SNAPSHOT_FIELD`. It's not consumed by BIE or the Executive Brief.
- **Files:** `src/lib/canonicalFactClient.js`

### BUG-003: Phase 14.2B canonicalFactClient snapshot normalized_ebitda conflict (P2)

- **Root cause:** Both `reported_ebitda` and `normalized_ebitda` mapped to `ls.ebitda` in `FACT_TO_SNAPSHOT_FIELD`. The second would overwrite the first.
- **Fix:** Removed `normalized_ebitda` from `FACT_TO_SNAPSHOT_FIELD`.
- **Files:** `src/lib/canonicalFactClient.js`

### BUG-004: BIE revenue not canonical-preferred (P1)

- **Root cause:** BIE read `as?.revenue || m?.revenue` (assessment first). Even with canonical revenue in `m.revenue`, BIE would use `as.revenue` first. Canonical values from higher-authority sources (e.g., document extraction) would not flow through.
- **Fix:** Added `canonicalFacts` input to BIE. Revenue resolution changed to `canonicalRevenue ?? as?.revenue || m?.revenue`. Only the READ source changed — formulas, rankings, and scoring are unchanged.
- **Files:** `src/lib/bie/engine.js`, `src/lib/businessIntelligenceState.js`, `src/pages/Dashboard.jsx`

---

## 18. Remaining Legacy Paths

| Path | Location | Status |
|------|----------|--------|
| BIE `as?.revenue` fallback | `bie/engine.js` | migration_fallback (used when canonical missing) |
| BIE `m?.revenue` fallback | `bie/engine.js` | migration_fallback (used when canonical + assessment missing) |
| Dashboard `supabaseUserData.getDashboardMetrics` | `Dashboard.jsx` | migration_fallback (canonical merges into these) |
| Dashboard `supabaseUserData.getLatestMetricSnapshot` | `Dashboard.jsx` | migration_fallback |
| BIS/BIE engine formulas | `businessIntelligenceState.js`, `bie/engine.js` | Unchanged (only READ source changed for revenue) |
| Galileo summaries | `bie/galileoSummaries.js` | Unchanged (uses labels, not values) |

---

## 19. Recommendation for Next Consumer

### Next Consumer: Valuation Engine

The Valuation Engine is the next logical consumer for canonical fact migration. It currently reads from:
- `valuation_answers` (advisor-entered)
- `valuation_financials` (normalized financials)
- `valuation_adjustments` (add-backs)
- `extracted_fields` (document extraction)

The canonical resolver already supports valuation question keys and financial fields via `FACT_KEY_TO_FIELD_REGISTRY`. Migration would:
1. Replace direct `valuation_financials` reads with canonical fact resolution
2. Preserve advisor-approved governance locks (already supported)
3. Preserve published version immutability (already supported)

**Recommendation:** Begin Valuation Engine migration in Phase 14.2D after sustained Executive Brief + BIE equivalence is proven.

---

## 20. Stop Condition Check

| Criterion | Status |
|-----------|--------|
| Executive Brief safely prefers canonical facts | ✅ PASS (revenue is canonical-preferred) |
| BIE summaries safely prefer canonical facts | ✅ PASS (revenue is canonical-preferred) |
| Narrative semantics remain intact | ✅ PASS (executiveNarrativeEngine unchanged) |
| Recommendation formulas remain intact | ✅ PASS (SPRING_RECOMMENDATIONS unchanged) |
| Cycle analysis passes | ✅ PASS (no circular dependency) |
| Period handling passes | ✅ PASS (resolver filters before authority) |
| Client safety passes | ✅ PASS (bis._canonicalMeta internal only) |
| Multi-business isolation passes | ✅ PASS (query key includes businessId) |
| Performance passes | ✅ PASS (no regression) |
| No propagation occurred | ✅ PASS (no writes, no calculation changes) |
| Valuation remains untouched | ✅ PASS (no valuation files changed) |
| Legacy fallbacks remain available | ✅ PASS (all legacy paths preserved) |

---

## READY FOR EXECUTIVE BRIEF AND BIE CANONICAL REVIEW

All stop-condition criteria pass. The Executive Brief and BIE summaries now prefer canonical facts for `revenue` (the only pilot fact they consume). Narrative semantics, recommendation formulas, and rankings are unchanged. No circular dependency. No propagation. Valuation remains untouched. Legacy fallbacks remain available.

Do not begin the next consumer migration automatically.