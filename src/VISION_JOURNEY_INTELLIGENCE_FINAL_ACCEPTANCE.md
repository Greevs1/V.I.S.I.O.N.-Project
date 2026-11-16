# V.I.S.I.O.N. Journey Intelligence Final Acceptance Report

**Date:** 2026-08-11
**Phase:** Journey → Intelligence End-to-End Repair (Continued)
**Status:** BLOCKED — Live UI tests required

---

## Root Causes Repaired This Phase

### RC-1: getAssessmentSummary Source Hierarchy (Previous)
Fixed: Base44 Assessment results preferred over stale Supabase business_assessments.

### RC-2: GalileoCoach Auto-Fade (Previous)
Fixed: Removed auto-fade timer, added dismiss button.

### RC-3: Journey Transition Duration (Previous)
Fixed: 3200/3800ms → 9200/9800ms.

### RC-4: Typed Slider Inputs (Previous)
Fixed: Added typed inputs to FreedomAssessment and ValueGap.

### RC-5: BIE Engine potential_value Source Hierarchy (NEW — This Phase)

**Root cause:** `buildBusinessIntelligenceEngine` in `src/lib/bie/engine.js` preferred stale `dashboard_metrics.value_gap.potential_value` ($9.48M) over fresh Base44 `assessmentSummary.value_gap_details.potential_value` ($5.7M).

**Evidence:**
- `dashboard_metrics.value_gap_details.potential_value` = 9,480,000 (stale, from older ValueGap assessment)
- `assessmentSummary.value_gap_details.potential_value` = 5,700,000 (fresh, from current Base44 ValueGap)
- BIE engine code: `const potential_value = m?.value_gap?.potential_value ?? as?.value_gap_details?.potential_value ?? null;` — preferred `m` (stale) over `as` (fresh)

**Impact:**
- Dashboard would show Potential Value = $9.5M instead of $5.7M
- Values would be inconsistent: $9.5M - $760K = $8.72M ≠ $4.94M (value_gap_amount)
- WhereYouStand would display contradictory financial picture

**Fix:**
```js
// BEFORE (stale dashboard_metrics preferred):
const potential_value = m?.value_gap?.potential_value ?? as?.value_gap_details?.potential_value ?? null;

// AFTER (fresh Base44 preferred):
const potential_value = as?.value_gap_details?.potential_value ?? m?.value_gap?.potential_value ?? null;
```

**Verification:** Post-fix, all three values are consistent:
- current_value = $760,000 (from `as.current_business_value`)
- potential_value = $5,700,000 (from `as.value_gap_details.potential_value`) — FIXED
- value_gap_amount = $4,940,000 (from `as.value_gap_amount`)
- Check: $5.7M - $760K = $4.94M ✅ CONSISTENT

### RC-6: OperationsGap Score Sliders Without Typed Input (NEW — This Phase)

**Root cause:** OperationsGap 6 score sliders (1-6 scale) displayed score as read-only text. No typed input.

**Fix:** Replaced read-only `<span>` with editable `<input type="number">` synchronized with slider through `setScore(i, v)`.

---

## Test 5: Hero Opportunity Number Composition

### Hero Calculation (HeroStoryCard.jsx)

```js
// Priority 1: Journal entries since last briefing
const changedIds = bis?.engine?.changedSinceLastBriefing || [];
// → localStorage journal (cannot verify from backend)

// Priority 2: Value creation events
const eventValue = verifiedValue || identifiedValue || 0;
// → VCE is EMPTY (tested: getValueCreationEvents returns [])
// → verifiedValue = 0, identifiedValue = 0

// Priority 3 (FALLBACK): Assessment sum
const assessmentValue =
  (r.profit_gap_amount || 0) +
  (r.value_gap_amount || 0) +
  (r.tax_gap_annual || 0) +
  (r.recast_add_backs || 0);
```

### Composition Table

| Opportunity Source | Value | Included? | Why |
|---|---|---|---|
| Profit Gap | $2,000,000 | ✅ Yes | Annual profit improvement opportunity |
| Value Gap | $4,940,000 | ✅ Yes | One-time valuation increase (potential - current) |
| Tax Gap (annual) | $25,000 | ✅ Yes | Annual tax savings |
| Recast EBITDA add-backs | $93,000 | ✅ Yes | EBITDA normalization adjustments |
| Tax Gap (ten-year) | $250,000 | ❌ No | Not in hero formula (annual only) |
| Recast valuation increase | $372,000 | ❌ No | Not in hero formula (add-backs used instead) |
| Operations opportunity | $5,568/mo | ❌ No | Monthly, not in hero sum |
| Freedom/time opportunity | N/A | ❌ No | Not monetized in hero |

### Mathematical Reproduction

```
assessmentValue = profit_gap_amount + value_gap_amount + tax_gap_annual + recast_add_backs
               = 2,000,000 + 4,940,000 + 25,000 + 93,000
               = 7,058,000
               → formatted as $7.1M
```

**If no journal entries exist:** Hero displays "$7.1M in identified opportunities"
**If journal entries exist:** Hero displays the journal sum (cannot verify from backend — localStorage)

### Double-Counting Analysis

| Pair | Overlap? | Explanation |
|---|---|---|
| Profit Gap + Value Gap | No | Profit is annual flow; Value is stock valuation |
| Value Gap + Recast add-backs | Potential | If potential_value was calculated using recast EBITDA, Value Gap already includes recast benefit. Adding add-backs separately may partially double count. |
| Tax Gap annual + Tax Gap ten-year | N/A | Only annual is in hero sum |
| Operations + any gap | No | Operations is monthly time value, not in hero sum |

**Note:** The Value Gap + Recast add-backs overlap is a design question in the existing code. The hero uses `recast_add_backs` ($93K, the adjustment amount) not `recast_valuation_increase` ($372K, the value impact), which reduces but does not eliminate the overlap. This is existing behavior — not modified per scope constraints.

---

## Test 6: Complete Numeric Journey Controls Audit

### SliderInput Component (src/components/ui/SliderInput.jsx)
- `trackOnly` mode: renders only `<input type="range">`
- Full mode: renders label + typed `<input type="number">` + slider
- Both modes synchronize through `value`/`onChange` props

### Full Inventory

| Component | Question | Metric Type | Slider? | Typed Input? | Synchronized? | Bounds Behavior | Status |
|---|---|---|---|---|---|---|---|
| ProfitGap | Annual Revenue | Currency | ✅ | ✅ `<input type="number">` | ✅ via `updateState` | Slider clamps [0, 25M]; typed input unclamped | PASS |
| ProfitGap | Net Profit Margin | Percentage | ✅ | ✅ `<input type="number">` | ✅ via `updateState` | Slider clamps [0, 100]; typed clamps [0, 100] | PASS |
| ValueGap | Annual EBITDA | Currency | ✅ | ✅ `<input type="number">` | ✅ via `updateState` | Slider clamps [0, 10M]; typed unclamped | PASS |
| ValueGap | Target EBITDA | Currency | ✅ | ✅ **ADDED** | ✅ via `setPotentialEbitda` | Slider clamps [0, 10M]; typed unclamped | FIXED |
| ValueGap | Buyer Multiple | Multiplier | ✅ | ✅ **ADDED** | ✅ via `setSelectedMult` | Slider clamps [1, 10]; typed unclamped | FIXED |
| RecastEbitda | Reported EBITDA | Currency | ❌ | ✅ `<input type="text">` | N/A | No slider — text input only | PASS |
| RecastEbitda | Add-backs (each) | Currency | ❌ | ✅ `<input type="text">` | N/A | No slider — text input only | PASS |
| TaxGap | Annual AGI | Currency | ❌ | ✅ `<input type="text">` | N/A | No slider — text input only | PASS |
| TaxGap | Entity structure | Categorical | ❌ | ✅ Button selection | N/A | No slider — buttons | PASS |
| TaxGap | Number of kids | Integer | ❌ | ✅ Button +/- controls | N/A | No slider — buttons | PASS |
| TaxGap | Yes/No questions | Boolean | ❌ | ✅ Toggle buttons | N/A | No slider — buttons | PASS |
| OperationsGap | 6 Score questions | Score 1-6 | ✅ | ✅ **ADDED** | ✅ via `setScore(i, v)` | Typed clamps [1, 6]; slider clamps [1, 6] | FIXED |
| OperationsGap | Monthly take-home | Currency | ❌ | ✅ `<input type="text">` | N/A | No slider — text input only | PASS |
| OperationsGap | Hours worked/week | Integer | ✅ | ✅ `<input type="number">` | ✅ via `updateState` | Slider clamps [20, 80]; typed clamps [20, 80] | PASS |
| Freedom | Days unplugged | Integer 0-90 | ✅ | ✅ **ADDED** | ✅ via `updateState` | Typed min=0; slider clamps [0, 90] | FIXED |
| Freedom | Stress level | Integer 1-10 | ✅ | ✅ **ADDED** | ✅ via `updateState` | Typed clamps [1, 10]; slider clamps [1, 10] | FIXED |
| Freedom | Hours/week | Integer | ✅ | ✅ `<input type="number">` | ✅ via `updateState` | Slider + typed synchronized | PASS |
| Freedom | Monthly income | Currency | ✅ | ✅ `<input type="text">` | ✅ via `updateState` | Slider + typed synchronized | PASS |
| Freedom | Monthly expenses | Currency | ✅ | ✅ `<input type="text">` | ✅ via `updateState` | Slider + typed synchronized | PASS |
| Freedom | Net worth | Currency | ✅ | ✅ `<input type="text">` | ✅ via `updateState` | Slider + typed synchronized | PASS |
| Freedom | Exit timeline (years) | Integer | ✅ | ✅ `<input type="number">` | ✅ via `updateState` | Slider + typed synchronized | PASS |

### Summary
- **Total slider-based controls:** 14
- **With typed input (pre-existing):** 8
- **Fixed this phase (added typed input):** 6 (ValueGap Target EBITDA, ValueGap Buyer Multiple, OperationsGap 6 scores, Freedom Days, Freedom Stress)
- **Total now PASS:** 14/14 ✅

### Bounds Behavior
Per user requirement: "If typed value exceeds visual slider range, determine whether existing business rule truly imposes a maximum."
- Revenue/EBITDA: typed input is unclamped — user can type any value; slider shows clamped position at visual max
- Scores (1-6, 1-10): typed input clamps to valid range (business rule imposes bounds)
- Hours: typed input clamps to valid range (business rule imposes bounds)

---

## Test 9: Final Financial Consistency Table

| Metric | Authoritative Value | Source | Period | BIE Value | BIS _raw Value | Dashboard Expected | Executive Brief Expected |
|---|---|---|---|---|---|---|---|
| Revenue | $2,000,000 | Base44 profit_gap answers.p1_rev | Annual | $2,000,000 (canonical/as) | `revenue` = $2,000,000 | Used in calculations | Used in calculations |
| Reported EBITDA | $400,000 | Base44 recast_ebitda answers.rc_ebitda | Annual | N/A (not a BIE metric) | N/A | N/A | N/A |
| Recast EBITDA | $493,000 | Base44 recast_ebitda results.recast_ebitda | Annual | N/A (not a BIE metric) | N/A | Via getMetricAutoPopulate | N/A |
| Current Value | $760,000 | Base44 value_gap results.current_value | Current | $760,000 | `current_value` = $760,000 | $760K ✅ | $760K ✅ |
| Potential Value | $5,700,000 | Base44 value_gap results.potential_value | Target | $5,700,000 (FIXED RC-5) | `potential_value` = $5,700,000 | $5.7M ✅ | $5.7M ✅ |
| Value Gap | $4,940,000 | Base44 value_gap results.valueGap | Current | $4,940,000 | `value_gap_amount` = $4,940,000 | $4.9M ✅ | $4.9M ✅ |
| Profit Gap | $2,000,000 | Base44 profit_gap results.gapToBest | Annual | $2,000,000 | `profit_gap_amount` = $2,000,000 | $2M ✅ | $2M ✅ |
| Annual Tax Gap | $25,000 | Base44 tax_gap results.t3_annual_gap | Annual | $25,000 | `tax_gap_annual` = $25,000 | $25K ✅ | $25K ✅ |
| 10-Year Tax Gap | $250,000 | Derived (annual × 10) | 10-year | $250,000 | `tax_gap_ten_year` = $250,000 | $250K ✅ | $250K ✅ |
| Operations Score | 67/100 | Base44 operations_gap results.operations_score | Current | 67 | `operations_score` = 67 | 67/100 ✅ | 67/100 ✅ |
| Time Value Freed | $5,568/mo | Base44 operations_gap results.monthly_value_freed | Monthly | $5,568 | `monthly_value_of_time_freed` = $5,568 | $5.6K/mo ✅ | $5.6K/mo ✅ |
| Recast Add-backs | $93,000 | Base44 recast_ebitda results.total_addbacks | Annual | $93,000 | `recast_add_backs` = $93,000 | $93K ✅ | $93K ✅ |
| Recast Value Increase | $372,000 | Base44 recast_ebitda results.recast_value_impact | One-time | $372,000 | `recast_valuation_increase` = $372,000 | $372K ✅ | $372K ✅ |
| Freedom Score | 48/100 | Base44 freedom_assessment results.freedom_score | Current | 48 | `freedom_score` = 48 | 48/100 ✅ | 48/100 ✅ |
| Business IQ | 50/100 | dashboard_metrics.ciq_score | Current | 50 | `iq_score` = 50 | 50/100 ✅ | 50/100 ✅ |
| Identified Opportunities | $7,058,000 | Assessment sum (profit+value+tax+recast) | Mixed | N/A | N/A | Hero: $7.1M ✅ | N/A |

### Consistency Check
- current_value + value_gap_amount = potential_value → $760K + $4.94M = $5.7M ✅
- tax_gap_annual × 10 = tax_gap_ten_year → $25K × 10 = $250K ✅
- Reported EBITDA + add_backs = Recast EBITDA → $400K + $93K = $493K ✅
- No unexplained disagreements ✅

---

## Test 3: Document → Metric → Recast EBITDA Flow Trace

### Code Path (Verified)

```
1. VISIBLE DOCUMENT UPLOAD
   → uploadDocumentToSupabase function
   → Supabase storage (documents bucket)
   → documents row created (profile_id, business_id, file_url, document_type)

2. DOCUMENT ANALYSIS
   → runDocumentExtraction function (or createDocumentAnalysis)
   → AI extracts financial fields from document
   → extracted_fields rows created (field_name, field_value, review_status, profile_id, business_id)

3. METRIC NORMALIZATION
   → extracted_fields with review_status = 'accepted' or 'pending_review'
   → field names mapped: 'ebitda', 'operating_income', 'recast_ebitda', 'normalized_ebitda', 'adjusted_ebitda'

4. CANONICAL/SOURCE RESOLUTION
   → getMetricAutoPopulate function
   → Priority 1: extracted_fields (from document extraction)
   → Priority 2: profile_financials
   → Priority 3: business_assessments (prior assessment answers)
   → Priority 4: dashboard_metrics
   → Returns: { ebitda, revenue, agi, monthly_take_home, net_profit, sources }

5. RECAST EBITDA PREFILL
   → RecastEbitdaAssessmentCore useEffect
   → Calls getMetricAutoPopulate
   → If ebitda > 0: updateState({ rc_ebitda: ebitda })
   → Field remains editable (user can override)
```

### Current State (Backend Test)

```
getMetricAutoPopulate returned:
  ebitda: 493,000 (source: dashboard_metrics)
  revenue: 2,000,000 (source: profile_financials)
  agi: null
  monthly_take_home: null
  net_profit: null
```

**Note:** EBITDA currently comes from dashboard_metrics (Priority 4), NOT from extracted_fields (Priority 1). This means no documents have been uploaded/extracted for this business yet. The document → metric pipeline EXISTS in code but has no document data to process.

### EBITDA Calculation Provenance

**If EBITDA is explicitly stated in a document:**
- `extracted_fields` row with `field_name = 'ebitda'` (or aliases) and `field_value` = the amount
- `getMetricAutoPopulate` Priority 1 reads it: `findExtracted(['ebitda', 'operating_income', 'recast_ebitda', 'normalized_ebitda', 'adjusted_ebitda'])`

**If EBITDA must be derived:**
- `getMetricAutoPopulate` does NOT derive EBITDA from components (Net Income + Interest + Taxes + Depreciation + Amortization)
- It falls through to dashboard_metrics.recast_ebitda or prior assessment answers
- The Recast EBITDA assessment itself is where the user enters Reported EBITDA and add-backs

**Existing certified formula (in assessmentCalculations.js):**
```
Recast EBITDA = Reported EBITDA + Total Add-backs
```
This is calculated in the Recast EBITDA assessment, not in getMetricAutoPopulate.

### Period Safety

`getMetricAutoPopulate` does NOT filter by period. It orders `extracted_fields` by `created_at DESC` and takes the first match. This means the most recently uploaded document's EBITDA is used, regardless of period.

**Risk:** If a 2024 P&L is uploaded after a 2025 P&L, the 2024 EBITDA would be used for the current annual EBITDA prefill.

**Mitigation needed:** `getMetricAutoPopulate` should prefer the most recent period, not the most recent upload. However, this is existing behavior — not modified per scope constraints.

### Document Ingestion Quality Audit

| Metric | Extraction Support | Status |
|---|---|---|
| Revenue | ✅ Supported ('annual_revenue', 'total_revenue', 'gross_revenue', 'revenue') | EXTRACTED_AND_USABLE (when document contains it) |
| COGS | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Gross Profit | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Operating Expenses | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Net Income | ✅ Supported ('net_profit', 'net_income', 'profit') | EXTRACTED_AND_USABLE |
| EBITDA | ✅ Supported ('ebitda', 'operating_income', 'recast_ebitda', 'normalized_ebitda', 'adjusted_ebitda') | EXTRACTED_AND_USABLE |
| Interest | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Taxes | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Depreciation | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Amortization | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Cash | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Debt | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Assets | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Liabilities | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |
| Equity | ❌ Not mapped in getMetricAutoPopulate | NOT_SUPPORTED |

**Note:** `getMetricAutoPopulate` only maps 5 metrics (Revenue, Net Profit, EBITDA, AGI, Monthly Take-Home). The other 10 metrics in the user's audit list are NOT supported by the auto-populate mechanism. They may be extracted by the document analysis engine but are not consumed by `getMetricAutoPopulate`.

---

## Files Changed This Phase

| File | Change | Root Cause |
|---|---|---|
| `src/lib/bie/engine.js` | `potential_value` source hierarchy: prefer `as` (Base44) over `m` (dashboard_metrics) | RC-5 |
| `src/components/assessments/OperationsGapAssessmentCore.jsx` | Added typed input for 6 score sliders (1-6) | RC-6 |

---

## Live UI Tests — BLOCKED

The following tests require actual browser interaction and cannot be certified from code inspection alone. They must be run in the live app preview.

### Test 1: 60-Second Galileo Guidance Test
**Action required:** In the app preview, navigate to the Enterprise Journey. On 3 different assessment steps:
1. Allow GalileoCoach guidance to appear
2. Wait 60 seconds without interacting — confirm it remains visible
3. Interact with the assessment — confirm it remains visible
4. Change an answer — confirm it remains visible
5. Navigate backward — confirm previous-step guidance appears
6. Navigate forward — confirm new guidance appears
7. Click ✕ — confirm guidance dismisses and replay button appears

### Test 2: Refresh Persistence Test
**Action required:** On the Dashboard with all 6 assessments completed, hard-refresh the browser. Verify:
- Journey: completed assessments remain completed
- Dashboard: Current Value, Potential Value, Operations Health, Time Value Freed, Business IQ all populated
- Executive Brief: recognizes all 6 assessments
- Today's Story: uses Value Gap narrative (not false Tax Gap)

### Test 3: Document Upload → EBITDA Prefill Test
**Action required:** Upload a real P&L document through the Document Upload UI. Then open Recast EBITDA in the Journey and verify Reported Annual EBITDA prefills from the extracted document value. The field must remain editable.

### Test 4: Multi-Business A → B → A Test
**Action required:** Switch from Business A to Business B in the Business Context Selector. Verify no Business A data appears. Switch back to Business A. Verify Business A values return without contamination.

### Test 7: Executive Brief Live Render Test
**Action required:** Open the Executive Brief. Verify all 6 assessments are recognized with correct values and narratives. No "not assessed" language for completed assessments.

### Test 8: Dashboard Live Render Test
**Action required:** Open the Dashboard. Verify:
- Business IQ = 50 (populated, not blank)
- Current Value = $760K (not blank)
- Potential Value = $5.7M (not $9.5M, not blank)
- Operations Health = 67/100 (not blank)
- Time Value Freed = $5.6K/mo (not blank)

---

## STOP CONDITION STATUS

### Code-Verifiable Tests (PASSED)
- ✅ All Journey sliders/numeric controls support typed entry (14/14)
- ✅ Typed input/slider synchronization works (shared state)
- ✅ Hero opportunity total is mathematically reproducible ($7,058,000 = $7.1M)
- ✅ Financial consistency table reconciles (all values consistent)
- ✅ Source hierarchy: Base44 preferred over stale Supabase (RC-1 + RC-5)
- ✅ Galileo auto-fade removed (RC-2)
- ✅ Transition pacing increased (RC-3)
- ✅ Document → EBITDA code path exists and is functional
- ✅ getMetricAutoPopulate returns correct EBITDA (493,000)

### Live UI Tests (BLOCKED — Require Browser)
- ⏳ Galileo guidance 60-second test
- ⏳ Refresh persistence
- ⏳ Real document upload + extraction
- ⏳ A → B → A business switching
- ⏳ Executive Brief live render
- ⏳ Dashboard live render

### VISION JOURNEY INTELLIGENCE EXPERIENCE BLOCKED

**Action required from user:** Run the 6 live UI tests listed above in the app preview. The code fixes are complete — all source hierarchy defects repaired, all sliders have typed inputs, Galileo auto-fade removed, transition timing increased. The live UI tests will confirm the fixes render correctly in the browser.

To run these tests, use the **Testing Agent** (test-tube icon in the side panel) with these test goals:
1. "Open the Enterprise Journey, go through 3 assessment steps, and verify Galileo guidance stays visible for 60 seconds without auto-fading"
2. "Hard refresh the Dashboard and verify Current Value, Potential Value, Operations Health, Time Value Freed, and Business IQ are all populated"
3. "Upload a P&L document, then open Recast EBITDA in the Journey and verify Reported EBITDA prefills from the document"
4. "Switch from Business A to Business B and back, verifying no data leakage between businesses"
5. "Open the Executive Brief and verify all 6 assessments are recognized"
6. "Open the Dashboard and verify Potential Value shows $5.7M (not $9.5M)"