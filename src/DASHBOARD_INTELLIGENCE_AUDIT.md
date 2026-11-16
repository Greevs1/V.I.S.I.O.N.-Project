# IQ™ Dashboard Intelligence Audit & Data Validation Report

**Audit Date:** 2026-07-23  
**Scope:** Every number displayed on `src/pages/Dashboard.jsx` and its child components  
**Source of Truth:** Business Intelligence Engine (BIE) → `src/lib/bie/engine.js` → `buildBusinessIntelligenceState()`  

---

## Executive Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Verified | 18 | Traceable to BIS, deterministic, single calculation path |
| ⚠ Needs Review | 9 | Bypasses BIS, uses hardcoded fallbacks, or duplicates logic |
| ❌ Incorrect | 6 | Hardcoded values, duplicate calculations, or frontend business logic |

**Critical Finding:** The BIE engine itself is well-architected and canonical. The violations occur in **dashboard components that bypass BIS** by reading raw `metricsData` (dashboardMetrics) or `assessmentSummary` directly, and in **two components that perform full business calculations in React** (PathToFreedom, DynamicScenarioBuilder).

---

## Metric-by-Metric Audit

### 1. Business IQ / Impact Quotient (iq_score)

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.iq_score` |
| **Backend Function** | `supabaseUserData.getDashboardMetrics` → `dashboard_metrics.ciq_score` or `overall_impact_score` |
| **Calculation** | Fallback chain: `ciq_score` → `overall_impact_score` → `latestSnapshot.overall_impact_score` → `assessmentSummary.derived_iq_score` |
| **Confidence** | `dashboard_metrics` (high) or `assessment_summary` (medium) |
| **Displayed In** | WhereYouStand, CinematicIQReveal, ExecutiveBriefing, GapValidationBreakdown |
| **Correct** | Yes — single path through BIE engine |

---

### 2. Business Impact Score

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `calculateBusinessImpactScore(bis)` in `businessIntelligenceState.js` |
| **Calculation** | Weighted sum of 10 dimensions (Profit 15%, Value 15%, Tax 15%, Operations 15%, Recast 10%, Freedom 10%, Documents 10%, Assessment 5%, Sprint 3%, Scenario 2%) |
| **Confidence** | Derived from `completion_percent` (≥60% = high, ≥30% = medium, else low) |
| **Displayed In** | BusinessImpactScore, CinematicIQReveal, ExecutiveBriefing |
| **Correct** | Yes — single canonical function, documented weights |

---

### 3. Business Intelligence Confidence (BI Health)

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis.engine.health` → `calculateBusinessIntelligenceHealth()` in `src/lib/bie/health.js` |
| **Calculation** | Weighted: Assessment Completion 25%, Document Coverage 15%, Document Confidence 10%, Business Profile 15%, Extraction 10%, Scenario 10%, Validation 15% |
| **Confidence** | Inherent (this IS the confidence metric) |
| **Displayed In** | BIHealthCard |
| **Correct** | Yes — canonical, uses `getAssessmentCompletion()` for assessment portion |

---

### 4. Profit Gap

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.profit_gap_amount` |
| **Backend Function** | `supabaseUserData.getAssessmentSummary` → `assessment_summary.profit_gap_amount` |
| **Calculation** | BIE fallback: `assessmentSummary.profit_gap_amount` → `dashboardMetrics.profit_gap.gap_to_best` → `assessmentSummary.profit_gap.gap_to_best` |
| **Confidence** | `assessment_summary` (high) |
| **Displayed In** | IQDashboard, WhereYouStand, GapValidationBreakdown, ExecutiveBriefing, HeroStoryCard |
| **Correct** | Yes |

---

### 5. Value Gap / Current Business Value / Potential Business Value

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.value_gap_amount`, `bis._raw.current_value`, `bis._raw.potential_value` |
| **Backend Function** | `supabaseUserData.getAssessmentSummary` → `assessment_summary.value_gap_amount`, `current_business_value`, `value_gap_details.potential_value` |
| **Calculation** | BIE fallback chain, no frontend derivation |
| **Confidence** | `assessment_summary` (high) |
| **Displayed In** | IQDashboard, WhereYouStand, GapValidationBreakdown, ExecutiveBriefing, HeroStoryCard |
| **Correct** | Yes |

---

### 6. Tax Gap (Annual + 10-Year)

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.tax_gap_annual`, `bis._raw.tax_gap_ten_year` |
| **Calculation** | Annual: BIE fallback from assessmentSummary or dashboardMetrics. 10-year: `assessmentSummary.tax_gap_ten_year` → `dashboardMetrics.tax_gap.ten_year_cost` → `tax_gap_annual * 10` (canonical derived) |
| **Confidence** | `assessment_summary` (high) |
| **Displayed In** | IQDashboard, GapValidationBreakdown, ExecutiveBriefing |
| **Correct** | Yes — 10-year is a simple canonical projection in the BIE engine |

---

### 7. Operations Score

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.operations_score` |
| **Backend Function** | `supabaseUserData.getAssessmentSummary` → `assessment_summary.operations_score` |
| **Confidence** | `assessment_summary` (high) |
| **Displayed In** | IQDashboard, WhereYouStand, GapValidationBreakdown, ExecutiveBriefing |
| **Correct** | Yes |

---

### 8. Time Value Freed (Hourly + Monthly)

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.hourly_value_of_time_freed`, `bis._raw.monthly_value_of_time_freed` |
| **Calculation** | BIE canonical: hourly = `monthly_take_home / (hours_worked_per_week * 4)` when not directly available. Monthly = `hours_freed_per_week * 4 * hourly_value` when not directly available. |
| **Confidence** | `assessment_summary` (high) or `derived` (medium) |
| **Displayed In** | IQDashboard, WhereYouStand |
| **Correct** | Yes — derived calculations live in the BIE engine, not in components |

---

### 9. Freedom Score

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.freedom_score` |
| **Backend Function** | `supabaseUserData.getAssessmentSummary` → `assessment_summary.freedom_score` |
| **Displayed In** | GapValidationBreakdown, ExecutiveBriefing |
| **Correct** | Yes |

---

### 10. Recast EBITDA (Add-backs + Valuation Increase)

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw.recast_add_backs`, `bis._raw.recast_valuation_increase` |
| **Backend Function** | `supabaseUserData.getDashboardMetrics` → `dashboard_metrics.recast_ebitda` |
| **Displayed In** | IQDashboard, GapValidationBreakdown, ExecutiveBriefing |
| **Correct** | Yes |

---

### 11. Sprint Bridge — Estimated Impact

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis.engine.recommendations[0].estimatedImpact` |
| **Calculation** | BIE engine `SPRINT_RECOMMENDATIONS` templates map metric values to estimated impact |
| **Displayed In** | SprintBridge |
| **Correct** | Yes — canonical from BIE engine |

---

### 12. Living Dashboard Update — Change Count

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis.engine.changedSinceLastBriefing` + BIE journal |
| **Displayed In** | LivingDashboardUpdate |
| **Correct** | Yes — canonical from BIE engine + journal |

---

### 13. Hero Story Card — Value Created

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | BIE journal entries since last briefing, falls back to `verifiedValue` or `identifiedValue` |
| **Calculation** | Sums `value_increased` and `metric_appeared` journal events for changed metrics |
| **Displayed In** | HeroStoryCard |
| **Correct** | Yes — reads from BIE journal, not independent calculation |

---

### 14. Where You Stand — KPI Trends

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | BIE journal entries for each metric ID |
| **Calculation** | `getTrend()` reads last journal entry for each metric, computes delta |
| **Displayed In** | WhereYouStand |
| **Correct** | Yes — journal-driven, not independently calculated |

---

### 15. Historical IQ Progression

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `allSnapshotsData` from `supabaseUserData.getMetricSnapshotsAll` |
| **Calculation** | Maps `overall_impact_score` from snapshot rows — no derivation |
| **Displayed In** | HistoricalChart |
| **Correct** | Yes — raw data display, no calculation |

---

### 16. Financial Snapshot

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `latestSnapshot` from `supabaseUserData.getLatestMetricSnapshot` |
| **Calculation** | None — displays raw snapshot columns (annual_revenue, net_profit, ebitda, etc.) |
| **Displayed In** | FinancialSnapshotCard |
| **Correct** | Yes — pure data display |

---

### 17. Executive Briefing — All Values

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `buildExecutiveNarrative(bis, impactResult)` — reads exclusively from `bis._raw` |
| **Calculation** | Presentation layer only; all data from BIS. Copy from `executiveBriefingCopy.js`. |
| **Displayed In** | ExecutiveBriefing |
| **Correct** | Yes — no independent calculations, no hardcoded numbers in displayed values |

---

### 18. Gap Validation Breakdown

| Field | Value |
|-------|-------|
| **Status** | ✅ Verified |
| **Source** | `bis._raw` for all 6 gap values |
| **Displayed In** | GapValidationBreakdown |
| **Correct** | Yes — reads exclusively from BIS |

---

## ⚠ NEEDS REVIEW

### 19. Cost of Inaction (COI) — DUPLICATE CALCULATION

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `Dashboard.jsx` lines 284-287: `(m.profit_gap?.gap_to_best || 0) + (m.tax_gap?.annual_overpayment || 0)` — bypasses BIS |
| **Duplicate** | `CostOfInaction.jsx` lines 17-19: recalculates `coi1`, `coi5`, `coi10` from `annualGap` prop |
| **Problem** | Dashboard.jsx reads raw `m.profit_gap?.gap_to_best` instead of `bis._raw.profit_gap_amount`. If data comes from `assessmentSummary` (not `dashboardMetrics`), COI shows null while gap cards show real values. |
| **Recommended Fix** | Use `bis._raw.profit_gap_amount` and `bis._raw.tax_gap_annual` in Dashboard.jsx. Remove recalculation from CostOfInaction.jsx (use passed values). |

---

### 20. Strategic Observations — BIS Bypass + Hardcoded Multiple

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `Dashboard.jsx` lines 510-511: `m.tax_gap?.annual_overpayment` and `m.profit_gap?.gap_to_best` — bypasses BIS |
| **Hardcoded Value** | `taxMultiplier = '4.5'` (line 296) — used to claim "reduces your exit valuation by **4.5x**" |
| **Problem** | Reads raw dashboardMetrics instead of BIS. The 4.5x multiple is hardcoded and presented as a calculated fact. |
| **Recommended Fix** | Use `bis._raw.tax_gap_annual` and `bis._raw.profit_gap_amount`. Derive multiple from BIS value gap data (`potential_value / current_value` relationship) or label as industry assumption. |

---

### 21. Value Created — Frontend Aggregation

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `ValueCreatedCards.jsx` lines 23-42: aggregates `verifiedTotal`, `estimatedTotal`, `verifiedTax`, `verifiedProfit`, `verifiedCashFlow` directly from events array |
| **Problem** | Frontend duplicates what `getValueCreationSummary` backend should provide. Two calculation paths exist (frontend aggregation + backend summary). |
| **Recommended Fix** | Use `valueCreationSummary` from backend as canonical source. Only fall back to event aggregation if summary is null. |

---

### 22. Identified Value / Verified Value (Dashboard.jsx)

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `Dashboard.jsx` lines 237-247: `vce.filter().reduce()` and `ri.filter().reduce()` |
| **Problem** | Raw data aggregation in the page component, not through BIS. These values feed HeroStoryCard and CostOfInaction. |
| **Recommended Fix** | These are simple sums of backend-provided event values, not business calculations. Acceptable but should be documented as "raw data aggregation, not BIE calculation." |

---

### 23. Membership Upgrade Banner — Hardcoded Threshold

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `Dashboard.jsx` lines 700-701: `Math.max(0, (vce.length || 0) - 2)` |
| **Problem** | The `2` is a hardcoded free-tier limit. |
| **Recommended Fix** | Should come from membership tier configuration. Low priority — this is access control, not BI. |

---

### 24. Assessment Completion — Estimated Value Fallbacks

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `assessmentCompletionService.js` lines 28-33: `estValue: (r) => r.profit_gap_amount || 50000` |
| **Problem** | Hardcoded fallback values (50000, 250000, 15000, 100000, 200000, 50000) used for "highest value missing" prioritization. |
| **Note** | These are NOT displayed as actual values — only used for ranking which missing assessment to recommend next. |
| **Recommended Fix** | Document as prioritization estimates, not intelligence values. Low priority. |

---

### 25. BIE Engine — hours_freed_per_week Default

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `engine.js` line ~106: falls back to `10` when no data |
| **Problem** | Hardcoded default of 10 hours/week. |
| **Recommended Fix** | Return `null` instead of 10 when no data exists. The display should show "—" not a fabricated number. |

---

### 26. Galileo Question Limits

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `GalileoPanel.jsx` lines 8-9: `ANON_LIMIT = 5`, `FREE_LIMIT = 7` |
| **Problem** | Hardcoded in component, not persisted across sessions. |
| **Recommended Fix** | Should come from membership configuration. Access control, not BI. |

---

### 27. DynamicScenarioBuilder — Confidence Calculation

| Field | Value |
|-------|-------|
| **Status** | ⚠ Needs Review |
| **Current Source** | `DynamicScenarioBuilder.jsx` lines 56-68: independent confidence scoring from `m` and `as` fields |
| **Problem** | Bypasses BIS health/confidence system. Uses arbitrary weights (20, 20, 15, 15, 15, 15). |
| **Recommended Fix** | Use `bis.engine.health.health_score` or `bisImpact.confidence` instead. |

---

## ❌ INCORRECT

### 28. Path to Freedom — Full Frontend Calculation Engine

| Field | Value |
|-------|-------|
| **Status** | ❌ Incorrect |
| **File** | `src/components/dashboard/PathToFreedom.jsx` lines 13-84 (`buildLocalPaths`) |
| **Problem** | Performs complete financial projections in React: |
| | - `revenue || 500000` — hardcoded fallback |
| | - `currentValue || revenue * 4` — assumes 4x multiple |
| | - `monthlyTakeHome || 10000` — hardcoded fallback |
| | - `hoursWorked || 50` — hardcoded fallback |
| | - `freedomNumber = targetMonthlyIncome * 12 * 25` — 4% rule calculation |
| | - `annualSavings = monthlyTakeHome * 12 * 0.15` — 15% savings rate assumption |
| | - `pathB_annualBoost = profitGap * 0.5 + taxGap * 0.6 + valueGap * 0.02` — arbitrary coefficients |
| | - `pathC_annualBoost = profitGap * 0.85 + taxGap * 0.9 + ...` — arbitrary coefficients |
| | - `additionalNetWorth = pathB_annualBoost * pathB_years * 1.3` — arbitrary multiplier |
| | - `additionalBusinessValue = valueGap * 0.5` — arbitrary 50% closure |
| **Root Cause** | The `calculateFreedomPaths` backend function exists but returns empty for many users, forcing the local fallback. |
| **Recommended Fix** | Remove hardcoded fallbacks (500000, 10000, 50). Return `null` when data is missing. The projection formulas should live in a backend function or BIE module, not in a React component. |

---

### 29. DynamicScenarioBuilder — Baseline Fallbacks + Hardcoded Engagement Cost

| Field | Value |
|-------|-------|
| **Status** | ❌ Incorrect |
| **File** | `src/components/dashboard/DynamicScenarioBuilder.jsx` lines 28-33, 118 |
| **Problem** | Hardcoded baseline fallbacks: |
| | - `currentRevenue || 500000` |
| | - `currentNetProfit || currentRevenue * 0.1` — assumes 10% margin |
| | - `currentEBITDAMargin || 10` — hardcoded |
| | - `currentBusinessValue || currentRevenue * 4` — assumes 4x multiple |
| | - `currentSavingsRate || 50000` — hardcoded |
| | - `engagementCost = 50000` — hardcoded ROI denominator |
| **Recommended Fix** | Remove all hardcoded fallbacks. Use `bis._raw` values. Return null/"—" when data is missing. The `engagementCost` should come from billing data or be removed. |

---

### 30. Vision ROI Score — Hardcoded totalInvestment = 0

| Field | Value |
|-------|-------|
| **Status** | ❌ Incorrect |
| **File** | `Dashboard.jsx` line 466: `totalInvestment={0}` |
| **Problem** | Investment amount is hardcoded to 0, making the ROI score permanently show "Insufficient billing history." The ROI multiple is never calculable. |
| **Recommended Fix** | Either source from billing/membership data, or remove the component until billing integration exists. Do not hardcode 0. |

---

### 31. Investment Comparison — All Hardcoded Values

| Field | Value |
|-------|-------|
| **Status** | ❌ Incorrect (but intentional marketing content) |
| **File** | `Dashboard.jsx` lines 583-629 |
| **Problem** | All values hardcoded: `$600K+`, `$204K/yr`, `$250K FT / $60K Frac`, `$350K FT / $84K Frac`, `$100K FT / $60K Frac`, `$15K`, `$5K-25K/quarter` |
| **Note** | This is marketing/pricing content, not business intelligence. It should not be audited as BI metrics. |
| **Recommended Fix** | No action needed — this is intentionally static marketing content, not intelligence. |

---

### 32. Executive Narrative Engine — Dead Hardcoded Multiple

| Field | Value |
|-------|-------|
| **Status** | ❌ Incorrect (dead code) |
| **File** | `src/lib/executiveNarrativeEngine.js` line 152: `const multipleImpact = gap ? Math.round(gap * 4.5) : null;` |
| **Problem** | Hardcoded 4.5x multiple. Variable is calculated but never used (not in returned object). |
| **Recommended Fix** | Remove dead code. |

---

### 33. Dashboard.jsx — taxMultiplier Hardcoded Fallback

| Field | Value |
|-------|-------|
| **Status** | ❌ Incorrect |
| **File** | `Dashboard.jsx` lines 295-296 |
| **Problem** | `(m.enterprise_value / (m.revenue || 1) || 4.5).toFixed(1)` — falls back to hardcoded '4.5' when no data. Used in Strategic Observations to present "4.5x" as a calculated fact. |
| **Recommended Fix** | Derive from BIS value gap data or remove the specific multiplier claim. |

---

## Summary of Fixes Applied

### Fix 1: COI — Use BIS values, remove duplicate calculation
- **Dashboard.jsx**: Changed `totalAnnualGap` to use `bis._raw.profit_gap_amount` and `bis._raw.tax_gap_annual`
- **CostOfInaction.jsx**: Removed duplicate `coi1/coi5/coi10` calculation, now uses passed values directly

### Fix 2: Strategic Observations — Use BIS values, remove hardcoded 4.5x
- **Dashboard.jsx**: Changed `taxOverpay` and `profitGap` to read from `bis._raw`
- **Dashboard.jsx**: Removed hardcoded `taxMultiplier` — now derives from BIS value gap data or shows "your exit multiple" generically

### Fix 3: PathToFreedom — Remove hardcoded fallbacks
- **PathToFreedom.jsx**: Removed `|| 500000`, `|| 10000`, `|| 50` fallbacks. Returns null when data missing.

### Fix 4: DynamicScenarioBuilder — Remove hardcoded fallbacks
- **DynamicScenarioBuilder.jsx**: Removed `|| 500000`, `|| 0.1`, `|| 10`, `|| 4`, `|| 50000` fallbacks. Uses BIS values.

### Fix 5: VisionROIScore — Remove hardcoded totalInvestment=0
- **Dashboard.jsx**: Removed `totalInvestment={0}` hardcode. Component now handles null gracefully.

### Fix 6: Executive Narrative Engine — Remove dead hardcoded code
- **executiveNarrativeEngine.js**: Removed unused `multipleImpact` variable with hardcoded 4.5x.

### Fix 7: BIE Engine — hours_freed_per_week default
- **engine.js**: Changed default from `10` to `null` when no data exists.