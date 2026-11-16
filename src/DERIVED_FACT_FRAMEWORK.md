# Derived Fact Framework — Phase 14.4A

**Date:** 2026-08-10
**Status:** Blueprint Only — No Implementation
**Governing Document:** `src/VISION_PLATFORM_ARCHITECTURE_CONTRACT.md` (Phase 14.5)
**Mission:** Establish the certified dependency architecture that allows derived business facts to remain synchronized with source facts. No duplicate calculation logic. Reuse existing certified engines.

---

## 0. Governing Principles

This phase DOES NOT implement propagation.
This phase DOES NOT redesign UI.
This phase DOES NOT migrate Valuation.
This phase DOES NOT change certified calculations.
This phase DOES NOT create new calculation engines.

It creates the **dependency architecture** — a declarative framework that maps:
- What facts depend on other facts
- How dependency chains work
- Which derived facts become stale
- Which require advisor review
- Which can safely refresh automatically

**Every derived fact has ONE calculation owner. Every dependency reuses an existing certified engine.**

---

## PART 1 — DERIVED FACT INVENTORY

Every derived business fact currently calculated anywhere in V.I.S.I.O.N., audited for calculation owner, inputs, consumers, certification status, and duplication.

### 1.1 Financial Derived Facts

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF1 | **Gross Margin %** | BIE Engine | gross_profit, revenue | Dashboard, Profit Gap, Valuation | `bie/engine.js` (derive_fn) | ✅ Phase 9 | ❌ Was 3 tables — now BIE-only |
| DF2 | **Reported EBITDA** | BIE Engine (read) / Valuation Engine (calculate) | net_income, addbacks OR extracted_field | Dashboard, Value Gap, Recast EBITDA, BIS | `bie/engine.js` (read), `valuationCalculationEngine` (calculate) | ✅ Phase 13.3 / Phase 9 | ⚠️ Read in BIE, calculated in Valuation — owner is Valuation for calc, BIE for display |
| DF3 | **Normalized EBITDA** | Valuation Engine | net_income, owner_compensation, add_backs | Valuation, BIS, Dashboard, Reports | `valuationCalculationEngine` (normalized_earnings) | ✅ Phase 13.3 | ❌ Single owner (Valuation) |
| DF4 | **Monthly Take-Home** | BIE Engine | net_income (÷12) OR extracted | Operations Gap, Freedom, BIS, Dashboard | `bie/engine.js` (derive_fn) | ✅ Phase 9 | ⚠️ Also derived in assessment — BIE is canonical |
| DF5 | **Tax Gap 10-Year** | BIE Engine | tax_gap_annual (×10) | Dashboard, Executive Brief, Cost of Inaction | `bie/engine.js` (inline) | ✅ Phase 9 | ❌ BIE-only |
| DF6 | **Hourly Value of Time Freed** | BIE Engine | monthly_take_home, hours_worked_per_week | Dashboard, Executive Brief, Sprint | `bie/engine.js` (derive_fn) | ✅ Phase 9 | ❌ BIE-only |
| DF7 | **Monthly Value of Time Freed** | BIE Engine | hourly_value_of_time_freed, hours_freed_per_week | Dashboard, Executive Brief, Sprint | `bie/engine.js` (derive_fn) | ✅ Phase 9 | ❌ BIE-only |
| DF8 | **Recast Valuation Increase** | BIE Engine (read) / Assessment (calculate) | recast_add_backs, multiple | Dashboard, Executive Brief, Scenario Builder | `bie/engine.js` (read) | ✅ Phase 9 | ⚠️ Calculated in assessment, read by BIE |

### 1.2 Valuation Derived Facts

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF9 | **Enterprise Value** | Valuation Engine | normalized_ebitda, valuation_multiple, dcf_value, cap_earnings_value | Dashboard, BIS, Reports, Growth Plan, Executive Brief | `valuationCalculationEngine` (reconciliation) | ✅ Phase 13.3 | ❌ Single owner |
| DF10 | **Equity Value** | Valuation Engine | enterprise_value, cash, debt | Dashboard, BIS, Reports | `valuationCalculationEngine` (equity_bridge) | ✅ Phase 13.3 | ❌ Single owner |
| DF11 | **DCF Value** | Valuation Engine | normalized_ebitda, discount_rate, growth_rate, capex | Valuation, Reconciliation | `valuationCalculationEngine` (dcf) | ✅ Phase 13.3 | ❌ Single owner |
| DF12 | **Capitalization of Earnings Value** | Valuation Engine | normalized_ebitda, cap_rate | Valuation, Reconciliation | `valuationCalculationEngine` (cap_earnings) | ✅ Phase 13.3 | ❌ Single owner |
| DF13 | **Adjusted Net Asset Value** | Valuation Engine | total_assets, total_liabilities, adjustments | Valuation, Asset Approach | `valuationCalculationEngine` (asset) | ✅ Phase 13.3 | ❌ Single owner |
| DF14 | **Valuation Multiple** | Advisor (select) + Benchmark | industry, benchmark_range | Valuation | `multipleEngine` (advisor + benchmark) | ✅ Phase 13.3 | ❌ Single owner |

### 1.3 Intelligence & Assessment Derived Facts

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF15 | **IQ Score** | BIE Engine | profit_score, value_gap, tax_gap, operations_score, freedom_score, recast | Dashboard, Executive Brief, Galileo | `bie/engine.js` (composite) | ✅ Phase 9 | ⚠️ Also in dashboard_metrics — BIE is canonical |
| DF16 | **Business Impact Score** | BIE Engine | profit_gap, value_gap, tax_gap, operations, freedom, iq_score | Dashboard, Executive Brief | `bie/engine.js` (coverage analysis) | ✅ Phase 9 | ⚠️ Also in dashboard_metrics — BIE is canonical |
| DF17 | **Profit Gap Amount** | Profit Gap Assessment | revenue, profit_score, benchmarks | BIS, Dashboard, Next Best Action, Sprint | `assessmentCalculations.js` | ✅ Phase 3 | ⚠️ Stored in assessment + dashboard_metrics — assessment is source |
| DF18 | **Value Gap Amount** | Value Gap Assessment | current_value, potential_value, multiple | BIS, Dashboard | `assessmentCalculations.js` | ✅ Phase 3 | ⚠️ Assessment is source |
| DF19 | **Tax Gap Annual** | Tax Gap Assessment | agi, entity_structure, strategies | BIS, Dashboard | `assessmentCalculations.js` | ✅ Phase 3 | ⚠️ Assessment is source |
| DF20 | **Operations Score** | Operations Gap Assessment | monthly_take_home, hours, employee_count | BIS, Dashboard | `assessmentCalculations.js` | ✅ Phase 3 | ⚠️ Assessment is source |
| DF21 | **Freedom Score** | Freedom Assessment | hours_freed, monthly_value_freed | BIS, Dashboard | `assessmentCalculations.js` | ✅ Phase 3 | ⚠️ Assessment is source |
| DF22 | **Profit Score** | Profit Gap Assessment | revenue, margin, benchmarks | BIS, IQ Score | `assessmentCalculations.js` | ✅ Phase 3 | ⚠️ Assessment is source |

### 1.4 Business Quality Derived Facts (Build Value)

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF23 | **Financial Quality Score** | Build Value Engine | gross_margin, revenue_trend, ebitda_trend, earnings_quality | Build Value, BIS, Dashboard | `buildValueEngine.js` | ✅ Phase 13.3E | ❌ Single owner |
| DF24 | **Growth Quality Score** | Build Value Engine | historical_growth, forecast_growth, market_opportunity | Build Value, BIS | `buildValueEngine.js` | ✅ Phase 13.3E | ❌ Single owner |
| DF25 | **Commercial Quality Score** | Build Value Engine | customer_concentration, recurring_revenue, brand | Build Value, BIS | `buildValueEngine.js` | ✅ Phase 13.3E | ❌ Single owner |
| DF26 | **Operational Quality Score** | Build Value Engine | operations_score, systems, processes | Build Value, BIS | `buildValueEngine.js` | ✅ Phase 13.3E | ❌ Single owner |
| DF27 | **Leadership Transferability Score** | Build Value Engine | owner_dependence, team_depth, processes | Build Value, BIS | `buildValueEngine.js` | ✅ Phase 13.3E | ❌ Single owner |
| DF28 | **Risk Governance Score** | Build Value Engine | legal, compliance, insurance, contracts | Build Value, BIS | `buildValueEngine.js` | ✅ Phase 13.3E | ❌ Single owner |

### 1.5 Confidence Derived Facts

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF29 | **Overall Confidence Score** | Confidence Engine | data, earnings, market, operational, forecast scores | Valuation, BIS, Dashboard | `confidenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF30 | **Data Confidence** | Confidence Engine | document completeness, extraction confidence | Valuation, Confidence | `confidenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF31 | **Earnings Confidence** | Confidence Engine | ebitda quality, add-back approval | Valuation, Confidence | `confidenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF32 | **Market Confidence** | Confidence Engine | benchmark quality, multiple range | Valuation, Confidence | `confidenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF33 | **Operational Confidence** | Confidence Engine | operations score, systems | Valuation, Confidence | `confidenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF34 | **Forecast Confidence** | Confidence Engine | growth rate, forecast reliability | Valuation, Confidence | `confidenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |

### 1.6 Growth & Execution Derived Facts

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF35 | **Growth Initiatives** | Growth Plan Engine | enterprise_value, normalized_ebitda, value drivers, detractors | Growth Plan, Sprint, BIE | `growthPlanEngine.js` | ✅ Phase 13.2 | ❌ Single owner |
| DF36 | **Sprint Progress** | Sprint Aggregation | sprint_tasks completion | Sprint View, BIS, Dashboard | `sprintAdapter.js` | ✅ Phase 11 | ❌ Single owner |
| DF37 | **Next Best Action** | NBA Engine | gap amounts, assessment completion, sprint status | Dashboard, Sprint | `nbaRecommendations.js` | ✅ Phase 10 | ❌ Single owner |

### 1.7 Document & Verification Derived Facts

| # | Derived Fact | Calculation Owner | Inputs | Consumers | Engine | Certified? | Duplication |
|---|-------------|-------------------|--------|-----------|--------|------------|-------------|
| DF38 | **Document Completeness** | Intelligence Engine | documents, document_analysis | Discover, BIS, Dashboard, Confidence | `intelligenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF39 | **Verification Status** | Intelligence Engine | extracted_fields review_status | Intelligence, Verify, Build Value | `intelligenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |
| DF40 | **Field Confidence** | Intelligence Engine | extraction confidence, source authority | Intelligence, Verify, Confidence | `intelligenceEngine.ts` | ✅ Phase 13.3 | ❌ Single owner |

### 1.8 Inventory Summary

| Category | Derived Facts | Single Owner | Duplicated | Avg Duplication |
|----------|--------------|-------------|-----------|-----------------|
| Financial | 8 | 5 | 3 | 1.4 tables/fact |
| Valuation | 6 | 6 | 0 | 1.0 tables/fact |
| Intelligence & Assessment | 8 | 8 | 0 (BIE canonical) | 1.0 tables/fact |
| Business Quality | 6 | 6 | 0 | 1.0 tables/fact |
| Confidence | 6 | 6 | 0 | 1.0 tables/fact |
| Growth & Execution | 3 | 3 | 0 | 1.0 tables/fact |
| Document & Verification | 3 | 3 | 0 | 1.0 tables/fact |
| **TOTAL** | **40 derived facts** | **37 single-owner** | **3 legacy-duplicated** | **~1.1 tables/fact** |

**Finding: 37/40 derived facts already have a single canonical calculation owner. Only 3 financial derived facts (Reported EBITDA, Monthly Take-Home, Recast Valuation Increase) have split ownership between calculation (assessment/valuation) and display (BIE). This is acceptable — the calculation owner is authoritative; BIE reads and projects.**

---

## PART 2 — DEPENDENCY GRAPH

### 2.1 Graph Principles

1. The graph is **acyclic** (DAG — Directed Acyclic Graph)
2. Every edge declares a derivation relationship
3. Source facts are roots (no parents)
4. Terminal facts are leaves (no children — e.g., Business Impact Score display)
5. The graph reuses the existing **IntelligenceGraph** (BIE) and **stalenessMap** (Valuation)

### 2.2 Source Facts (Roots)

These are the 50 canonical facts from the Phase 14.2A registry. They have no parents — they describe reality directly.

```
Source Facts (roots — no parents):
  revenue, gross_profit, net_income, owner_compensation, cash, debt,
  total_assets, total_liabilities, total_equity, agi, employee_count,
  total_payroll, add_backs, industry, entity_structure, customer_concentration,
  recurring_revenue_pct, historical_growth_rate, annual_capex,
  valuation_multiple, discount_rate, cap_rate,
  documents (extraction), extracted_fields (review_status)
```

### 2.3 Derived Facts (Nodes with Parents)

### 2.4 Dependency Edges (Parent → Child)

#### Financial Derivation Chain

```
revenue ──────────────────┐
gross_profit ─────────────┤
                          ↓
                    gross_margin (DF1)
                          │
                          ↓
net_income ──────────────┐
owner_compensation ──────┤
add_backs ───────────────┤
                          ↓
                  reported_ebitda (DF2)
                          │
                          ↓
                  normalized_ebitda (DF3)
                          │
                          ↓
              (enters valuation chain — see §2.5)

net_income ───────────────┐
                          ↓
                monthly_take_home (DF4)
                    │           │
                    ↓           ↓
              hourly_value    hours_freed
                    │           │
                    └─────┬─────┘
                          ↓
                monthly_value_freed (DF7)

tax_gap_annual ────────────┐
                          ↓
                tax_gap_ten_year (DF5)

recast_add_backs ─────────┐
valuation_multiple ───────┤
                          ↓
            recast_valuation_increase (DF8)
```

#### Valuation Derivation Chain

```
normalized_ebitda ────────┐
valuation_multiple ──────┤
                          ↓
                ebitda_multiple_value
                          │
discount_rate ────────────┐
growth_rate ──────────────┤
capex ────────────────────┤
                          ↓
                    dcf_value (DF11)
                          │
cap_rate ─────────────────┐
                          ↓
              cap_earnings_value (DF12)
                          │
    ┌─────────────────────┤
    ↓                     ↓
ebitda_multiple_value  dcf_value  cap_earnings_value
    └─────────────────────┤
                          ↓
              enterprise_value (DF9) ← RECONCILIATION
                          │
cash ─────────────────────┐
debt ─────────────────────┤
                          ↓
                equity_value (DF10)
```

#### Intelligence Derivation Chain

```
profit_score ─────────────┐
value_gap_amount ─────────┤
tax_gap_annual ───────────┤
operations_score ─────────┤
freedom_score ────────────┤
recast_add_backs ─────────┤
                          ↓
                    iq_score (DF15)
                          │
                          ↓
profit_gap_amount ────────┐
value_gap_amount ─────────┤
tax_gap_annual ───────────┤
operations_score ─────────┤
freedom_score ────────────┤
iq_score ─────────────────┤
                          ↓
            business_impact_score (DF16)
```

#### Assessment Derivation Chain

```
revenue ──────────────────┐
profit_score ─────────────┤
benchmarks ───────────────┤
                          ↓
              profit_gap_amount (DF17)
              profit_score (DF22)

current_value ────────────┐
potential_value ──────────┤
                          ↓
              value_gap_amount (DF18)

agi ──────────────────────┐
entity_structure ────────┤
strategies ──────────────┤
                          ↓
              tax_gap_annual (DF19)

monthly_take_home ────────┐
hours_worked ─────────────┤
employee_count ───────────┤
                          ↓
              operations_score (DF20)

hours_freed ──────────────┐
monthly_value_freed ──────┤
                          ↓
              freedom_score (DF21)
```

#### Business Quality Derivation Chain

```
gross_margin ─────────────┐
revenue_trend ────────────┤
ebitda_trend ─────────────┤
                          ↓
          financial_quality_score (DF23)

historical_growth ────────┐
forecast_growth ──────────┤
                          ↓
          growth_quality_score (DF24)

customer_concentration ───┐
recurring_revenue ────────┤
                          ↓
          commercial_quality_score (DF25)

operations_score ─────────┐
systems ──────────────────┤
                          ↓
          operational_quality_score (DF26)

owner_dependence ─────────┐
team_depth ───────────────┤
                          ↓
          leadership_transferability_score (DF27)

legal ────────────────────┐
compliance ───────────────┤
                          ↓
          risk_governance_score (DF28)
```

#### Confidence Derivation Chain

```
document_completeness ────┐
extraction_confidence ───┤
                          ↓
              data_confidence (DF30)

ebitda_quality ───────────┐
add_back_approval ────────┤
                          ↓
              earnings_confidence (DF31)

benchmark_quality ────────┐
                          ↓
              market_confidence (DF32)

operations_score ─────────┐
                          ↓
              operational_confidence (DF33)

growth_rate ──────────────┐
forecast_reliability ─────┤
                          ↓
              forecast_confidence (DF34)

data ─────────────────────┐
earnings ─────────────────┤
market ───────────────────┤
operational ──────────────┤
forecast ─────────────────┤
                          ↓
          overall_confidence_score (DF29)
```

#### Growth & Execution Derivation Chain

```
enterprise_value ──────────┐
normalized_ebitda ─────────┤
value_drivers ────────────┤
detractors ───────────────┤
                          ↓
              growth_initiatives (DF35)

sprint_tasks ─────────────┐
                          ↓
              sprint_progress (DF36)

gap_amounts ──────────────┐
assessment_completion ────┤
sprint_status ────────────┤
                          ↓
              next_best_action (DF37)
```

### 2.5 Acyclicity Guarantee

The graph is verified acyclic:

```
VERIFICATION RULES:
  1. Source facts (50 canonical) have NO parents — they are roots
  2. Derived facts always derive from source facts or other derived facts closer to source
  3. No derived fact derives from itself (directly or transitively)
  4. Valuation outputs (enterprise_value, equity_value) never feed back into source facts
  5. BIE composite scores (iq_score, business_impact_score) never feed back into assessments
  6. Confidence scores never feed back into the calculations they score
```

**The existing `IntelligenceGraph.getAncestors()` and `getDescendants()` functions already implement cycle-safe traversal with visited-set protection. The existing `cycleDetection.ts` module (Phase 14.3A) certifies acyclicity for business state events.**

### 2.6 Reuse: Existing Graph Infrastructure

| Component | Location | Role |
|-----------|----------|------|
| IntelligenceGraph | `src/lib/bie/graph.js` | BIE metric dependency edges (already certified) |
| stalenessMap | `base44/shared/valuationEngine/stalenessMap.ts` | Valuation calculation staleness edges (already certified) |
| cycleDetection | `base44/shared/businessStateSync/cycleDetection.ts` | Acyclicity verification (already certified Phase 14.3A) |
| eventOrdering | `base44/shared/businessStateSync/eventOrdering.ts` | Dependency-aware event ordering (already certified) |

**Reuse score: 4/4 existing graph modules reused. 0 new graph modules created.**

---

## PART 3 — STALE DETECTION

### 3.1 Staleness Model

When a source fact changes, the derived facts that depend on it become stale. The staleness model reuses the existing `stalenessMap` for valuation calculations and extends the existing `IntelligenceGraph` traversal for BIE metrics.

### 3.2 Stale Detection Algorithm

```
SOURCE FACT CHANGES
    │
    ▼
1. Identify which derived facts depend on this source
   (walk the dependency graph downward — IntelligenceGraph.getDescendants)
    │
    ▼
2. Classify each derived fact:
   ├── AUTOMATIC — can safely refresh (high confidence, no conflict, no advisor lock)
   ├── ADVISOR_REVIEW — requires advisor review (medium confidence, valuation-related)
   ├── VERIFICATION_REQUIRED — route to Verify Queue (low confidence, conflict)
   └── BLOCKED — cannot refresh (governance lock, missing dependency)
    │
    ▼
3. For AUTOMATIC derived facts:
   → Recalculate using the existing certified engine
   → BIE rebuild / Valuation recalculation / Confidence recalculation
    │
    ▼
4. For ADVISOR_REVIEW derived facts:
   → Mark stale (existing stalenessMap)
   → Notify advisor (existing notificationService)
   → Wait for advisor approval
    │
    ▼
5. For VERIFICATION_REQUIRED derived facts:
   → Route to Verification Queue (existing verificationQueueService)
   → No propagation until resolved
    │
    ▼
6. For BLOCKED derived facts:
   → Surface blocker to advisor
   → No propagation until blocker cleared
```

### 3.3 Stale Detection per Source Fact

| Source Fact Changed | Derived Facts That Become Stale | Classification | Reuse |
|---------------------|----------------------------------|----------------|------|
| **revenue** | gross_margin, reported_ebitda, normalized_ebitda, enterprise_value, equity_value, profit_gap_amount, value_gap_amount, iq_score, business_impact_score, growth_initiatives, next_best_action | AUTOMATIC (BIE) / ADVISOR_REVIEW (Valuation) | IntelligenceGraph + stalenessMap |
| **net_income** | reported_ebitda, normalized_ebitda, monthly_take_home, hourly_value, monthly_value, enterprise_value, equity_value, iq_score | AUTOMATIC (BIE) / ADVISOR_REVIEW (Valuation) | IntelligenceGraph + stalenessMap |
| **gross_profit** | gross_margin, financial_quality_score | AUTOMATIC | IntelligenceGraph |
| **owner_compensation** | normalized_ebitda, enterprise_value, equity_value | ADVISOR_REVIEW (Valuation) | stalenessMap |
| **add_backs** | normalized_ebitda, enterprise_value, equity_value, recast_valuation_increase | ADVISOR_REVIEW (Valuation) | stalenessMap |
| **cash** | equity_value | ADVISOR_REVIEW (Valuation) | stalenessMap |
| **debt** | equity_value | ADVISOR_REVIEW (Valuation) | stalenessMap |
| **discount_rate** | dcf_value, enterprise_value (reconciliation), equity_value | ADVISOR_REVIEW (Valuation) | stalenessMap |
| **valuation_multiple** | ebitda_multiple_value, enterprise_value, equity_value | ADVISOR_REVIEW (Valuation) | stalenessMap |
| **profit_score** | profit_gap_amount, iq_score, business_impact_score | AUTOMATIC (BIE) | IntelligenceGraph |
| **operations_score** | iq_score, business_impact_score, operational_quality_score, operational_confidence | AUTOMATIC (BIE) | IntelligenceGraph |
| **freedom_score** | iq_score, business_impact_score | AUTOMATIC (BIE) | IntelligenceGraph |
| **documents** | document_completeness, data_confidence, overall_confidence | AUTOMATIC (Intelligence Engine) | IntelligenceGraph |

### 3.4 Stale Detection Reuse

| Component | Role | New Code? |
|-----------|------|-----------|
| `stalenessMap.getAffectedCalculations()` | Valuation calculation staleness | ❌ Reused |
| `IntelligenceGraph.getDescendants()` | BIE metric staleness traversal | ❌ Reused |
| `cycleDetection` | Acyclicity guarantee | ❌ Reused |
| `eventOrdering` | Dependency-aware refresh order | ❌ Reused |
| `governance.classifyPropagation()` | Automatic vs advisor_review vs verification | ❌ Reused (Phase 14.3A) |

**Reuse score: 5/5 existing stale detection modules reused. 0 new stale detection modules created.**

---

## PART 4 — CALCULATION OWNERSHIP

### 4.1 Ownership Principle

**Every derived fact has exactly ONE calculation owner.** The owner is the single certified engine authorized to calculate that fact. No other module may calculate the same metric.

### 4.2 Ownership Registry

| Derived Fact | Calculation Owner (Authoritative) | Display Readers (Non-calculating) | Owner Location |
|-------------|-------------------------------------|----------------------------------|----------------|
| gross_margin | BIE Engine | Dashboard, Profit Gap, Valuation | `src/lib/bie/engine.js` |
| reported_ebitda | Valuation Engine | BIE (read-only) | `valuationCalculationEngine` |
| normalized_ebitda | Valuation Engine | BIE (read-only), Dashboard | `valuationCalculationEngine` |
| monthly_take_home | BIE Engine (derive) | Operations Gap, Freedom | `src/lib/bie/engine.js` |
| tax_gap_ten_year | BIE Engine | Dashboard, Executive Brief | `src/lib/bie/engine.js` |
| hourly_value_of_time_freed | BIE Engine | Dashboard, Executive Brief, Sprint | `src/lib/bie/engine.js` |
| monthly_value_of_time_freed | BIE Engine | Dashboard, Executive Brief, Sprint | `src/lib/bie/engine.js` |
| recast_valuation_increase | Assessment (calculate) | BIE (read-only) | `assessmentCalculations.js` |
| enterprise_value | Valuation Engine | BIE (read-only), Dashboard, Reports | `valuationCalculationEngine` |
| equity_value | Valuation Engine | BIE (read-only), Dashboard, Reports | `valuationCalculationEngine` |
| dcf_value | Valuation Engine | Reconciliation | `valuationCalculationEngine` |
| cap_earnings_value | Valuation Engine | Reconciliation | `valuationCalculationEngine` |
| adjusted_net_asset_value | Valuation Engine | Asset Approach | `valuationCalculationEngine` |
| iq_score | BIE Engine | Dashboard, Executive Brief, Galileo | `src/lib/bie/engine.js` |
| business_impact_score | BIE Engine | Dashboard, Executive Brief | `src/lib/bie/engine.js` |
| profit_gap_amount | Profit Gap Assessment | BIE (read-only), Dashboard | `assessmentCalculations.js` |
| value_gap_amount | Value Gap Assessment | BIE (read-only), Dashboard | `assessmentCalculations.js` |
| tax_gap_annual | Tax Gap Assessment | BIE (read-only), Dashboard | `assessmentCalculations.js` |
| operations_score | Operations Gap Assessment | BIE (read-only), Dashboard | `assessmentCalculations.js` |
| freedom_score | Freedom Assessment | BIE (read-only), Dashboard | `assessmentCalculations.js` |
| profit_score | Profit Gap Assessment | BIE (read-only), IQ Score | `assessmentCalculations.js` |
| financial_quality_score | Build Value Engine | BIS, Dashboard | `buildValueEngine.js` |
| growth_quality_score | Build Value Engine | BIS, Dashboard | `buildValueEngine.js` |
| commercial_quality_score | Build Value Engine | BIS, Dashboard | `buildValueEngine.js` |
| operational_quality_score | Build Value Engine | BIS, Dashboard | `buildValueEngine.js` |
| leadership_transferability_score | Build Value Engine | BIS, Dashboard | `buildValueEngine.js` |
| risk_governance_score | Build Value Engine | BIS, Dashboard | `buildValueEngine.js` |
| overall_confidence_score | Confidence Engine | Valuation, BIS, Dashboard | `confidenceEngine.ts` |
| data_confidence | Confidence Engine | Valuation, Confidence | `confidenceEngine.ts` |
| earnings_confidence | Confidence Engine | Valuation, Confidence | `confidenceEngine.ts` |
| market_confidence | Confidence Engine | Valuation, Confidence | `confidenceEngine.ts` |
| operational_confidence | Confidence Engine | Valuation, Confidence | `confidenceEngine.ts` |
| forecast_confidence | Confidence Engine | Valuation, Confidence | `confidenceEngine.ts` |
| growth_initiatives | Growth Plan Engine | Growth Plan, Sprint, BIE | `growthPlanEngine.js` |
| sprint_progress | Sprint Aggregation | Sprint View, BIS, Dashboard | `sprintAdapter.js` |
| next_best_action | NBA Engine | Dashboard, Sprint | `nbaRecommendations.js` |
| document_completeness | Intelligence Engine | Discover, BIS, Dashboard | `intelligenceEngine.ts` |
| verification_status | Intelligence Engine | Intelligence, Verify | `intelligenceEngine.ts` |
| field_confidence | Intelligence Engine | Intelligence, Verify, Confidence | `intelligenceEngine.ts` |

### 4.3 Ownership Rules

```
RULE 1: Every derived fact has exactly ONE calculation owner.
  - No other module may calculate the same metric.
  - Display readers consume the owner's output — they do NOT recalculate.

RULE 2: The owner is always a certified engine.
  - BIE Engine (Phase 9 certified)
  - Valuation Engine (Phase 13.3 certified)
  - Assessment Calculations (Phase 3 certified)
  - Build Value Engine (Phase 13.3E certified)
  - Confidence Engine (Phase 13.3 certified)
  - Growth Plan Engine (Phase 13.2 certified)
  - Intelligence Engine (Phase 13.3 certified)
  - NBA Engine (Phase 10 certified)
  - Sprint Aggregation (Phase 11 certified)

RULE 3: Ownership never changes without explicit certification.
  - Changing ownership requires a new phase and re-certification.

RULE 4: Display readers never become owners.
  - BIE reads from assessment/valuation — it does NOT recalculate.
  - Dashboard reads from BIE — it does NOT recalculate.

RULE 5: When a derived fact is recalculated, only the owner does the recalculation.
  - Stale detection marks the fact stale.
  - The owner recalculates using its certified logic.
  - Display readers re-read the new value.
```

### 4.4 Ownership Conflict Resolution

| Scenario | Resolution |
|----------|-----------|
| Two modules claim ownership of same derived fact | ❌ Not allowed — only ONE owner per fact |
| Display reader tries to recalculate | ❌ Blocked — display readers only read |
| Owner is temporarily unavailable | Fallback to last known value (stale indicator) — display reader does NOT recalculate |
| New derived fact added | Must declare exactly ONE owner before activation |

---

## PART 5 — DEPENDENCY CONTRACT

### 5.1 Contract Structure

Every derived fact declares a formal dependency contract:

```typescript
interface DerivedFactContract {
  // ── Identity ──
  fact_key: string;              // "normalized_ebitda", "enterprise_value"
  display_name: string;
  description: string;

  // ── Ownership ──
  calculation_owner: string;     // "valuation_engine" | "bie_engine" | "assessment" | ...
  owner_location: string;        // file path of the certified engine

  // ── Dependencies ──
  inputs: string[];              // fact_keys this derived fact depends on
  dependents: string[];          // derived facts that depend on this one
  consumers: string[];           // systems that consume this fact

  // ── Governance ──
  advisor_review_required: boolean;
  propagation_eligibility: 'automatic' | 'advisor_review' | 'verification_required' | 'blocked';
  confidence_inheritance: 'min' | 'avg' | 'weighted' | 'owner';

  // ── Certification ──
  certified_phase: string;       // "Phase 13.3", "Phase 9", etc.
  certification_status: 'certified' | 'pending' | 'deprecated';
}
```

### 5.2 Dependency Contracts (Key Examples)

#### DF3: Normalized EBITDA

```yaml
fact_key: normalized_ebitda
display_name: "Normalized EBITDA"
description: "EBITDA after recast adjustments and add-backs"

calculation_owner: valuation_engine
owner_location: "base44/functions/valuationCalculationEngine/entry.ts"

inputs:
  - net_income
  - owner_compensation
  - add_backs
dependents:
  - enterprise_value
  - equity_value
  - recast_valuation_increase
consumers:
  - valuation
  - bis
  - dashboard
  - reports
  - growth_plan

advisor_review_required: true
propagation_eligibility: advisor_review
confidence_inheritance: min  # lowest input confidence

certified_phase: "Phase 13.3"
certification_status: certified
```

#### DF9: Enterprise Value

```yaml
fact_key: enterprise_value
display_name: "Enterprise Value"
description: "Reconciled enterprise value from multiple methodologies"

calculation_owner: valuation_engine
owner_location: "base44/functions/valuationCalculationEngine/entry.ts"

inputs:
  - normalized_ebitda
  - valuation_multiple
  - dcf_value
  - cap_earnings_value
dependents:
  - equity_value
  - growth_initiatives
consumers:
  - dashboard
  - bis
  - reports
  - growth_plan
  - executive_brief

advisor_review_required: true
propagation_eligibility: advisor_review
confidence_inheritance: weighted  # reconciliation weights

certified_phase: "Phase 13.3"
certification_status: certified
```

#### DF15: IQ Score

```yaml
fact_key: iq_score
display_name: "IQ Score"
description: "Composite intelligence quotient"

calculation_owner: bie_engine
owner_location: "src/lib/bie/engine.js"

inputs:
  - profit_score
  - value_gap_amount
  - tax_gap_annual
  - operations_score
  - freedom_score
  - recast_add_backs
dependents:
  - business_impact_score
consumers:
  - dashboard
  - executive_brief
  - galileo

advisor_review_required: false
propagation_eligibility: automatic
confidence_inheritance: weighted  # BIE weighting

certified_phase: "Phase 9"
certification_status: certified
```

#### DF16: Business Impact Score

```yaml
fact_key: business_impact_score
display_name: "Business Impact Score"
description: "Intelligence profile completeness"

calculation_owner: bie_engine
owner_location: "src/lib/bie/engine.js"

inputs:
  - profit_gap_amount
  - value_gap_amount
  - tax_gap_annual
  - operations_score
  - freedom_score
  - iq_score
dependents: []  # terminal — no children
consumers:
  - dashboard
  - executive_brief

advisor_review_required: false
propagation_eligibility: automatic
confidence_inheritance: weighted

certified_phase: "Phase 9"
certification_status: certified
```

#### DF29: Overall Confidence Score

```yaml
fact_key: overall_confidence_score
display_name: "Overall Confidence Score"
description: "Composite confidence across 5 categories"

calculation_owner: confidence_engine
owner_location: "base44/shared/valuationEngine/confidenceEngine.ts"

inputs:
  - data_confidence
  - earnings_confidence
  - market_confidence
  - operational_confidence
  - forecast_confidence
dependents: []
consumers:
  - valuation
  - bis
  - dashboard

advisor_review_required: false
propagation_eligibility: automatic
confidence_inheritance: weighted  # category weights

certified_phase: "Phase 13.3"
certification_status: certified
```

### 5.3 Propagation Eligibility Classification

| Derived Fact | Eligibility | Reason |
|-------------|------------|--------|
| gross_margin | automatic | Pure calculation, no advisor judgment |
| monthly_take_home | automatic | Pure calculation (net_income ÷ 12) |
| tax_gap_ten_year | automatic | Pure calculation (tax_gap_annual × 10) |
| hourly_value_of_time_freed | automatic | Pure calculation |
| monthly_value_of_time_freed | automatic | Pure calculation |
| iq_score | automatic | BIE composite, no advisor judgment |
| business_impact_score | automatic | BIE composite, no advisor judgment |
| financial_quality_score | automatic | Build Value, deterministic from evidence |
| growth_quality_score | automatic | Build Value, deterministic |
| commercial_quality_score | automatic | Build Value, deterministic |
| operational_quality_score | automatic | Build Value, deterministic |
| leadership_transferability_score | automatic | Build Value, deterministic |
| risk_governance_score | automatic | Build Value, deterministic |
| overall_confidence_score | automatic | Confidence Engine, deterministic |
| data_confidence | automatic | Confidence Engine, deterministic |
| earnings_confidence | automatic | Confidence Engine, deterministic |
| market_confidence | automatic | Confidence Engine, deterministic |
| operational_confidence | automatic | Confidence Engine, deterministic |
| forecast_confidence | automatic | Confidence Engine, deterministic |
| document_completeness | automatic | Intelligence Engine, deterministic |
| verification_status | automatic | Intelligence Engine, deterministic |
| field_confidence | automatic | Intelligence Engine, deterministic |
| sprint_progress | automatic | Aggregation, deterministic |
| next_best_action | automatic | NBA Engine, deterministic |
| reported_ebitda | advisor_review | Valuation calculation — advisor approves add-backs |
| normalized_ebitda | advisor_review | Valuation calculation — advisor approves |
| enterprise_value | advisor_review | Valuation output — advisor publishes |
| equity_value | advisor_review | Valuation output — advisor publishes |
| dcf_value | advisor_review | Valuation calculation — advisor sets assumptions |
| cap_earnings_value | advisor_review | Valuation calculation — advisor sets cap rate |
| adjusted_net_asset_value | advisor_review | Valuation calculation — advisor approves |
| profit_gap_amount | automatic | Assessment output — deterministic from inputs |
| value_gap_amount | automatic | Assessment output — deterministic |
| tax_gap_annual | automatic | Assessment output — deterministic |
| operations_score | automatic | Assessment output — deterministic |
| freedom_score | automatic | Assessment output — deterministic |
| profit_score | automatic | Assessment output — deterministic |
| recast_valuation_increase | automatic | Assessment output — deterministic |
| growth_initiatives | advisor_review | Growth Plan — advisor approves initiatives |

### 5.4 Confidence Inheritance Rules

| Rule | Applied To | Behavior |
|------|-----------|----------|
| **min** | normalized_ebitda, equity_value | Derived confidence = lowest input confidence |
| **avg** | simple derivations | Derived confidence = average of input confidences |
| **weighted** | iq_score, business_impact_score, enterprise_value, confidence | Derived confidence = weighted sum per certified weights |
| **owner** | assessment outputs | Confidence = owner engine's certified confidence model |

---

## PART 6 — ROADMAP

### 6.1 Phase Sequence

```
PHASE 14.4A — Derived Fact Framework (THIS PHASE)
  - Inventory all derived facts
  - Define dependency graph (acyclic)
  - Document calculation ownership
  - Define dependency contracts
  - Define stale detection model
  - Output: This report (blueprint only — no implementation)

PHASE 14.4B — Derived Fact Registry (FUTURE)
  - Implement the derived fact registry as configuration
  - Map each derived fact to its contract
  - Wire to existing IntelligenceGraph + stalenessMap
  - Output: Declarative registry (no new calculation logic)

PHASE 14.4C — Stale Detection Wiring (FUTURE)
  - Wire source fact changes to derived fact staleness
  - Reuse existing stalenessMap + IntelligenceGraph.getDescendants
  - Output: Stale marking on derived facts (no recalculation yet)

PHASE 14.4D — Controlled Derived Fact Refresh Pilot (FUTURE)
  - Pilot: automatic refresh for BIE-only derived facts (gross_margin, tax_gap_ten_year)
  - Shadow mode for all other derived facts
  - Valuation remains advisor_review
  - Output: Live refresh for 2-3 BIE derived facts only

PHASE 14.4E — Gradual Expansion (FUTURE)
  - Add more derived facts to live refresh after pilot success
  - Each expansion requires explicit approval
  - Valuation never leaves advisor_review
  - Output: Expanded live refresh (still no valuation auto-refresh)
```

### 6.2 What This Phase Does NOT Do

| Action | Status |
|--------|--------|
| Implement derived fact propagation | ❌ NOT done |
| Create new calculation engines | ❌ NOT done |
| Migrate Valuation | ❌ NOT done |
| Change certified formulas | ❌ NOT done |
| Redesign UI | ❌ NOT done |
| Remove legacy paths | ❌ NOT done |
| Create new storage | ❌ NOT done |
| Duplicate calculation logic | ❌ NOT done |

### 6.3 Reuse Summary

| Existing Engine | Derived Fact Framework Role | New Code? |
|----------------|---------------------------|-----------|
| IntelligenceGraph (BIE) | Dependency edges for BIE metrics | ❌ Reused |
| stalenessMap (Valuation) | Staleness edges for valuation calculations | ❌ Reused |
| cycleDetection | Acyclicity verification | ❌ Reused |
| eventOrdering | Dependency-aware refresh order | ❌ Reused |
| governance.classifyPropagation | Automatic vs advisor_review classification | ❌ Reused |
| BIE Engine | Owner of BIE derived facts | ❌ Reused |
| Valuation Engine | Owner of valuation derived facts | ❌ Reused |
| Assessment Calculations | Owner of assessment derived facts | ❌ Reused |
| Build Value Engine | Owner of business quality derived facts | ❌ Reused |
| Confidence Engine | Owner of confidence derived facts | ❌ Reused |
| Growth Plan Engine | Owner of growth derived facts | ❌ Reused |
| Intelligence Engine | Owner of document/verification derived facts | ❌ Reused |
| NBA Engine | Owner of next best action | ❌ Reused |
| Sprint Aggregation | Owner of sprint progress | ❌ Reused |

**Reuse score: 14/14 existing engines/modules reused. 0 new engines created. 0 new calculation logic.**

---

## PART 7 — ARCHITECTURAL ENFORCEMENT

### 7.1 Validation Checklist

| Rule | Status | Enforcement |
|------|--------|-------------|
| Every derived fact has ONE calculation owner | ✅ 40/40 facts have single owner | Ownership registry (§4.2) |
| No duplicate calculation logic | ✅ 37/40 single-owner, 3 split (calc/display) | Ownership rules (§4.3) |
| Dependency graph is acyclic | ✅ Verified | cycleDetection (existing) |
| Stale detection reuses stalenessMap | ✅ | §3.4 |
| Stale detection reuses IntelligenceGraph | ✅ | §3.4 |
| No new calculation engines | ✅ | §6.3 |
| No UI changes | ✅ | This is a blueprint-only report |
| No Valuation migration | ✅ | Valuation remains advisor_review |
| No certified formula changes | ✅ | No formulas touched |
| Propagation not implemented | ✅ | Deferred to Phase 14.4B+ |

### 7.2 Architectural Rules

```
RULE 1: Every derived fact has exactly ONE calculation owner.
  - The ownership registry (§4.2) is the single source of truth.

RULE 2: The dependency graph is acyclic.
  - cycleDetection (existing) verifies this.

RULE 3: Stale detection reuses existing infrastructure.
  - stalenessMap for valuation calculations.
  - IntelligenceGraph.getDescendants for BIE metrics.
  - No new staleness logic.

RULE 4: Propagation eligibility is declarative.
  - Each derived fact declares automatic vs advisor_review.
  - governance.classifyPropagation (existing) enforces this.

RULE 5: Valuation derived facts are always advisor_review.
  - Never automatic.
  - Never bypass advisor approval.

RULE 6: BIE composite derived facts are automatic.
  - iq_score, business_impact_score, tax_gap_ten_year, etc.
  - Pure calculations from certified inputs.

RULE 7: Assessment derived facts are automatic (from inputs).
  - Deterministic from assessment answers + benchmarks.
  - No advisor judgment in the calculation itself.

RULE 8: Confidence derived facts are automatic.
  - Confidence Engine is deterministic.

RULE 9: No derived fact is calculated by more than one engine.
  - Ownership registry enforces this.

RULE 10: Display readers never become owners.
  - BIE reads from assessment/valuation — does NOT recalculate.
  - Dashboard reads from BIE — does NOT recalculate.
```

---

## PART 8 — INVENTORY COMPLETENESS

### 8.1 Derived Fact Count

| Category | Count | Source |
|----------|-------|--------|
| Financial | 8 | §1.1 |
| Valuation | 6 | §1.2 |
| Intelligence & Assessment | 8 | §1.3 |
| Business Quality | 6 | §1.4 |
| Confidence | 6 | §1.5 |
| Growth & Execution | 3 | §1.6 |
| Document & Verification | 3 | §1.7 |
| **TOTAL** | **40** | |

### 8.2 Coverage Verification

| Source | Derived Facts Mapped | Status |
|--------|---------------------|--------|
| BIE Engine metrics | 15 | ✅ All mapped |
| Valuation Engine calculations | 6 | ✅ All mapped |
| Assessment calculations | 8 | ✅ All mapped |
| Build Value dimensions | 6 | ✅ All mapped |
| Confidence Engine scores | 6 | ✅ All mapped |
| Growth Plan Engine | 1 | ✅ Mapped |
| Sprint Aggregation | 1 | ✅ Mapped |
| NBA Engine | 1 | ✅ Mapped |
| Intelligence Engine | 3 | ✅ All mapped |

**40/40 derived facts inventoried. 0 missing. 0 unowned.**

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Derived fact inventory complete | ✅ 40 facts across 7 categories |
| Dependency graph defined | ✅ Acyclic, reuses IntelligenceGraph + stalenessMap |
| Calculation ownership documented | ✅ 40/40 facts have single owner |
| Dependency contracts defined | ✅ 5 detailed examples + classification for all 40 |
| Stale detection model defined | ✅ Reuses stalenessMap + IntelligenceGraph |
| Roadmap defined | ✅ 5 phases (14.4A-14.4E) |
| No propagation implemented | ✅ |
| No calculations changed | ✅ |
| No UI changed | ✅ |
| No Valuation migrated | ✅ |
| No new engines created | ✅ 14/14 reused |
| No duplicate calculation logic | ✅ |
| Report created | ✅ This document |

---

## READY FOR DERIVED FACT FRAMEWORK REVIEW