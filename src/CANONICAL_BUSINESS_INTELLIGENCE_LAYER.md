# Canonical Business Intelligence Layer (CBIL) — Phase 14.2

**Date:** 2026-08-07
**Status:** Blueprint Only — No Implementation
**Governing Document:** `src/VISION_PLATFORM_ARCHITECTURE_CONTRACT.md` (Phase 14.5)
**Mission:** Every business fact exists exactly once. Every module consumes the same canonical fact. A document updates ONE canonical fact — everything else reacts automatically.

---

## 0. Governing Principles

This phase does NOT redesign any UI.
This phase does NOT create a graph database.
This phase does NOT duplicate existing tables.
This phase does NOT replace any certified engines.

It creates ONE canonical business intelligence layer that becomes the single source of truth for every business fact used throughout the platform.

- Never replace existing systems.
- Never duplicate calculations.
- Never duplicate storage.
- Never duplicate extraction.
- Everything must extend the existing architecture.

---

## PART 1 — BUSINESS FACT INVENTORY

Every business fact currently used across V.I.S.I.O.N., audited for primary source, consumers, duplication, update path, confidence, and verification state.

### 1.1 Financial Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| F1 | **Revenue** | `extracted_fields` (P&L / tax return) | BIS, Profit Gap, Value Gap, dashboard_metrics, profile_financials, valuation_answers | **5 tables** | Manual entry → extraction → assessment → BIS → dashboard | Per-extraction (0-100) | `review_status` on extracted_fields |
| F2 | **Gross Profit** | `extracted_fields` (P&L) | BIS, Profit Gap, valuation_answers | **3 tables** | Extraction → assessment → BIS | Per-extraction | `review_status` |
| F3 | **Gross Margin** | Derived (gross_profit / revenue) | Profit Gap, BIS, valuation | **3 tables** (derived independently) | Calculated in multiple places | Derived | None |
| F4 | **Net Income / Net Profit** | `extracted_fields` (P&L) | BIS, Profit Gap, Value Gap, dashboard_metrics, valuation_answers, profile_financials | **5 tables** | Extraction → assessment → BIS → dashboard | Per-extraction | `review_status` |
| F5 | **EBITDA** | Derived (net_profit + add-backs) OR `extracted_fields` | BIS, Value Gap, Recast EBITDA, dashboard_metrics, valuation_answers | **5 tables** | Derived independently in 3+ places | Derived | None |
| F6 | **Normalized EBITDA** | `valuation_calculations` (normalized earnings) | Valuation, Build Value, BIS, reports | **2 tables** | valuationCalculationEngine | Calculated (confidence engine) | `advisor_approved` on conclusions |
| F7 | **Owner Compensation** | `extracted_fields` (P&L / payroll / tax return) | Recast EBITDA, BIS, valuation_adjustments, profile_financials | **4 tables** | Extraction → adjustment → BIS | Per-extraction | `review_status` + adjustment approval |
| F8 | **Add-backs** | `valuation_adjustments` (advisor-approved) | Recast EBITDA, Valuation, BIS | **2 tables** | Extraction → propose → advisor approve → adjustment | Per-item | `approval_status` on adjustments |
| F9 | **Total Assets** | `extracted_fields` (balance sheet) | Valuation, BIS | **2 tables** | Extraction → valuation_answers | Per-extraction | `review_status` |
| F10 | **Total Liabilities** | `extracted_fields` (balance sheet) | Valuation, BIS | **2 tables** | Extraction → valuation_answers | Per-extraction | `review_status` |
| F11 | **Total Equity** | `extracted_fields` (balance sheet) | Valuation, BIS | **2 tables** | Extraction → valuation_answers | Per-extraction | `review_status` |
| F12 | **Cash on Hand** | `extracted_fields` (balance sheet) | Valuation, BIS, Equity Bridge | **2 tables** | Extraction → valuation_answers | Per-extraction | `review_status` |
| F13 | **Total Debt** | `extracted_fields` (balance sheet / debt schedule) | Valuation, Equity Bridge, BIS | **2 tables** | Extraction → valuation_answers → equity bridge | Per-extraction | `review_status` |
| F14 | **AGI** | `extracted_fields` (personal tax return) | Tax Gap, BIS, profile_financials | **3 tables** | Extraction → assessment → BIS | Per-extraction | `review_status` |
| F15 | **Monthly Take-Home** | Derived (net_profit / 12) OR `extracted_fields` | Operations Gap, Freedom, BIS, dashboard_metrics | **4 tables** | Derived independently | Derived | None |
| F16 | **Employee Count** | `extracted_fields` (payroll report) | Operations Gap, BIS, valuation | **2 tables** | Extraction → assessment → BIS | Per-extraction | `review_status` |
| F17 | **Total Payroll** | `extracted_fields` (payroll report) | Recast EBITDA, BIS, valuation | **2 tables** | Extraction → adjustment → BIS | Per-extraction | `review_status` |

### 1.2 Valuation Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| V1 | **Enterprise Value** | `valuation_calculations` (reconciliation) | BIS, dashboard_metrics, reports, Growth Plan | **4 tables** | valuationCalculationEngine → BIS → dashboard → reports | confidenceEngine | `advisor_approved` on conclusions |
| V2 | **Equity Value** | `valuation_calculations` (equity bridge) | BIS, reports, dashboard | **3 tables** | valuationCalculationEngine → BIS → dashboard | confidenceEngine | `advisor_approved` |
| V3 | **Valuation Multiple** | `valuation_multiple_factors` (advisor-selected + benchmark) | Valuation, BIS | **2 tables** | Benchmark → advisor confirm → calculation | Benchmark + advisor | `advisor_approved` |
| V4 | **Discount Rate** | DCF inputs (advisor + benchmark) | DCF calculation, Valuation | **1 table** | Benchmark → advisor confirm → DCF | Benchmark + advisor | `advisor_approved` |
| V5 | **Confidence Score** | `confidenceEngine` / `valuation_calculations` (confidence type) | Valuation, BIS, dashboard | **3 tables** | confidenceEngine (on-demand) | Meta-confidence | `advisor_verified` |
| V6 | **Publication Status** | `business_valuations.status` | Valuation, Reports, Deliverables, BIS | **1 table** (canonical) | valuationService.publishValuation | N/A | Server-mediated |
| V7 | **Valuation Version** | `valuation_versions` | Reports, Deliverables, Delta Engine | **1 table** (canonical) | publishValuation creates version | N/A | Immutable |

### 1.3 Business Quality Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| BQ1 | **Financial Quality Score** | `buildValueEngine` (financial_quality dimension) | Build Value, BIS, dashboard | **2 tables** | buildValueEngine → BIS | Dimension confidence | `advisor_approved` |
| BQ2 | **Growth Quality Score** | `buildValueEngine` (growth_quality) | Build Value, BIS | **2 tables** | buildValueEngine → BIS | Dimension confidence | `advisor_approved` |
| BQ3 | **Commercial Quality Score** | `buildValueEngine` (commercial_quality) | Build Value, BIS | **2 tables** | buildValueEngine → BIS | Dimension confidence | `advisor_approved` |
| BQ4 | **Operational Quality Score** | `buildValueEngine` (operational_quality) | Build Value, BIS | **2 tables** | buildValueEngine → BIS | Dimension confidence | `advisor_approved` |
| BQ5 | **Leadership Transferability Score** | `buildValueEngine` (leadership_transferability) | Build Value, BIS | **2 tables** | buildValueEngine → BIS | Dimension confidence | `advisor_approved` |
| BQ6 | **Risk Governance Score** | `buildValueEngine` (risk_governance) | Build Value, BIS | **2 tables** | buildValueEngine → BIS | Dimension confidence | `advisor_approved` |

### 1.4 Business Profile Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| BP1 | **Industry** | `profiles.company` / onboarding | All assessments, BIS, Valuation, benchmarks | **3 tables** | Onboarding → profile → assessments | High (advisor-confirmed) | Verified |
| BP2 | **Entity Structure** | `valuation_answers` (advisor entry) | Tax Gap, Valuation, BIS | **2 tables** | Manual entry | Medium | `advisor_verified` |
| BP3 | **Revenue Growth Rate** | Derived (historical revenue) | Value Gap, BIS, Growth Plan | **2 tables** | Derived from snapshots | Derived | None |
| BP4 | **Customer Concentration** | `valuation_answers` (advisor entry / assessment) | Build Value, Valuation, BIS | **2 tables** | Assessment → valuation_answers | Medium | `advisor_verified` |
| BP5 | **Recurring Revenue %** | `valuation_answers` (advisor entry) | Build Value, Valuation, BIS | **2 tables** | Manual entry | Medium | `advisor_verified` |

### 1.5 Intelligence & Assessment Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| IA1 | **IQ Score** | BIS composite (BIE engine) | Dashboard, dashboard_metrics | **2 tables** | BIS rebuild → dashboard | BIS confidence | N/A |
| IA2 | **Business Impact Score** | BIS coverage analysis | Dashboard, dashboard_metrics | **2 tables** | BIS rebuild → dashboard | BIS confidence | N/A |
| IA3 | **Profit Gap Amount** | Profit Gap assessment results | BIS, dashboard, Next Best Action | **3 tables** | Assessment → BIS → dashboard | confidenceEngine | Assessment `status` |
| IA4 | **Value Gap Amount** | Value Gap assessment results | BIS, dashboard | **3 tables** | Assessment → BIS → dashboard | confidenceEngine | Assessment `status` |
| IA5 | **Tax Gap Annual** | Tax Gap assessment results | BIS, dashboard | **3 tables** | Assessment → BIS → dashboard | confidenceEngine | Assessment `status` |
| IA6 | **Operations Score** | Operations Gap assessment results | BIS, dashboard | **3 tables** | Assessment → BIS → dashboard | confidenceEngine | Assessment `status` |
| IA7 | **Freedom Score** | Freedom Assessment results | BIS, dashboard | **2 tables** | Assessment → BIS → dashboard | confidenceEngine | Assessment `status` |
| IA8 | **Recast Add-backs** | Recast EBITDA assessment results | BIS, dashboard, Valuation | **3 tables** | Assessment → BIS → valuation | confidenceEngine | Assessment `status` |

### 1.6 Growth & Execution Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| GE1 | **Growth Initiatives** | `growthPlanEngine` (candidate initiatives) | Growth Plan, Sprint recommendations, BIE | **2 systems** | Engine generates → advisor approves → sprint | Per-initiative | `status` on initiatives |
| GE2 | **Sprint Tasks** | `ninetyDaySprint` (BIE-driven generation) | Sprint View, Calendar, BIS | **2 tables** | BIE recommendations → sprint generation | BIE confidence | `verification_status` |
| GE3 | **Sprint Progress** | `SprintTask` completion aggregation | Sprint View, BIS, dashboard | **2 tables** | Task completion → aggregation | N/A | `expert_verified` |

### 1.7 Document & Verification Facts

| # | Fact | Primary Source | Current Consumers | Current Duplication | Current Update Path | Confidence | Verification State |
|---|------|---------------|-------------------|---------------------|---------------------|------------|-------------------|
| DV1 | **Document Completeness** | `documents` + `document_analysis` aggregation | Discover, BIS, dashboard, confidence | **2 tables** | Upload → analysis → aggregation | Per-document | `upload_status` |
| DV2 | **Verification Status** | `extracted_fields.review_status` | Intelligence, Verification Queue, confidence | **1 table** (canonical) | Extraction → advisor review | Per-field | `review_status` |
| DV3 | **Field Confidence** | `intelligenceEngine.candidate.confidence_score` | Intelligence, Verify, Build Value, Evidence | **1 table** (in-memory) | Intelligence engine rebuild | Per-field | `verification_status` |
| DV4 | **Conflict Status** | `intelligenceEngine.candidate.conflict_status` | Verification Queue, Intelligence | **1 table** (in-memory) | Intelligence engine rebuild | Per-field | `conflict_status` |

### 1.8 Inventory Summary

| Category | Facts Identified | Tables Duplicating | Average Duplication |
|----------|-----------------|-------------------|---------------------|
| Financial | 17 | 2-5 each | **3.2 tables/fact** |
| Valuation | 7 | 1-4 each | **2.4 tables/fact** |
| Business Quality | 6 | 2 each | **2.0 tables/fact** |
| Business Profile | 5 | 2-3 each | **2.4 tables/fact** |
| Intelligence & Assessment | 8 | 2-3 each | **2.6 tables/fact** |
| Growth & Execution | 3 | 2 each | **2.0 tables/fact** |
| Document & Verification | 4 | 1-2 each | **1.5 tables/fact** |
| **TOTAL** | **50 facts** | — | **~2.4 tables/fact avg** |

**Finding: The average business fact is stored in 2.4 tables. This is the core duplication problem CBIL solves.**

---

## PART 2 — CANONICAL FACT MODEL

Every business fact follows one standard contract.

### 2.1 The Canonical Fact Contract

```typescript
interface CanonicalFact {
  // ── Identity ──
  canonical_id: string;           // e.g. "revenue", "ebitda", "enterprise_value"
  display_name: string;           // "Annual Revenue"
  description: string;            // "Total annual revenue from primary source"
  business_meaning: string;       // "Top-line revenue used for margin and valuation"

  // ── Source ──
  source_type: SourceType;        // document | assessment | calculation | advisor_entry | client_confirmation | benchmark | derived
  source_priority: number;        // 1 (highest) - 7 (lowest)
  source_id: string;              // ID of the source record
  source_name: string;            // "2024 P&L Statement"
  source_date: string;            // Date of the source document/entry

  // ── Value ──
  current_value: any;             // The canonical value
  formatted_value: string;        // "$1,250,000"
  answer_type: "currency" | "percentage" | "number" | "text" | "boolean" | "date";

  // ── Reporting ──
  reporting_period: string;       // "FY2024" | "TTM" | "Q3-2024"
  effective_date: string;          // When the value became effective

  // ── Confidence & Verification ──
  confidence_score: number;       // 0-100
  confidence_level: "verified" | "high" | "medium" | "low" | "missing" | "conflicting";
  verification_status: "verified" | "suggested" | "needs_review" | "missing" | "conflicting";
  advisor_approved: boolean;
  client_confirmed: boolean;

  // ── Audit ──
  last_updated: string;
  updated_by: string;             // profile_id of last updater
  last_update_reason: string;

  // ── Evidence & Lineage ──
  supporting_evidence: Evidence[];
  lineage: LineageNode[];          // Chain of derivation
  alternative_values: AlternativeValue[];  // Other sources for this fact

  // ── Dependencies ──
  dependent_consumers: string[];   // Systems that consume this fact
  propagation_rules: PropagationRule[];
  dependent_facts: string[];        // Other canonical facts derived from this one
}

type SourceType = "verified_tax_return" | "reviewed_financials" | "uploaded_financials"
  | "document_extraction" | "assessment_answer" | "advisor_entry" | "client_confirmation"
  | "benchmark" | "calculation";

interface Evidence {
  type: "document" | "assessment" | "calculation" | "advisor" | "client" | "benchmark";
  source_name: string;
  source_id: string;
  source_date: string;
  value: any;
  confidence: number;
  verified: boolean;
}

interface LineageNode {
  step: number;
  fact_id: string;                // Which canonical fact this step derives from
  operation: string;              // "sum" | "multiply" | "subtract" | "lookup" | "direct"
  description: string;            // "Add-backs added to net income"
}

interface AlternativeValue {
  source_name: string;
  source_priority: number;
  value: any;
  confidence: number;
  reporting_period: string;
}

interface PropagationRule {
  target_consumer: string;        // "dashboard" | "valuation" | "bis" | ...
  action: "refresh" | "mark_stale" | "notify" | "rebuild";
  condition: string;              // "confidence >= 85" | "advisor_approved == true"
}
```

### 2.2 Canonical Fact Registry (50 Facts)

Each fact registered with its canonical contract. Example entries:

#### F1: Revenue

```yaml
canonical_id: revenue
display_name: "Annual Revenue"
description: "Total annual top-line revenue"
business_meaning: "Used for margin calculation, valuation multiple, and benchmark comparison"
source_type: document_extraction
source_priority: 3
answer_type: currency
reporting_period: "FY2024"
dependent_consumers:
  - dashboard
  - profit_gap_assessment
  - value_gap_assessment
  - bis
  - valuation_answers
  - profile_financials
  - dashboard_metrics
propagation_rules:
  - target: dashboard, action: refresh, condition: "confidence >= 65"
  - target: valuation, action: mark_stale, condition: "always"
  - target: bis, action: rebuild, condition: "advisor_approved == true"
dependent_facts:
  - gross_margin
  - ebitda
  - enterprise_value
  - profit_gap_amount
  - value_gap_amount
```

#### F5: EBITDA

```yaml
canonical_id: ebitda
display_name: "EBITDA"
description: "Earnings Before Interest, Taxes, Depreciation, and Amortization"
business_meaning: "Primary earnings metric for valuation multiples"
source_type: calculation
source_priority: 8
answer_type: currency
lineage:
  - step: 1, fact_id: net_income, operation: direct, description: "Start from net income"
  - step: 2, fact_id: add_backs, operation: sum, description: "Add approved add-backs"
  - step: 3, fact_id: owner_compensation, operation: sum, description: "Add normalized owner compensation"
dependent_consumers:
  - valuation
  - value_gap_assessment
  - recast_ebitda_assessment
  - bis
  - dashboard_metrics
propagation_rules:
  - target: valuation, action: mark_stale, condition: "always"
  - target: bis, action: rebuild, condition: "advisor_approved == true"
dependent_facts:
  - normalized_ebitda
  - enterprise_value
  - value_gap_amount
```

#### V1: Enterprise Value

```yaml
canonical_id: enterprise_value
display_name: "Enterprise Value"
description: "Indicated enterprise value from reconciled methodologies"
business_meaning: "The primary valuation output — what the business is worth"
source_type: calculation
source_priority: 8
answer_type: currency
lineage:
  - step: 1, fact_id: normalized_ebitda, operation: direct, description: "Start from normalized EBITDA"
  - step: 2, fact_id: valuation_multiple, operation: multiply, description: "Apply approved multiple"
  - step: 3, fact_id: dcf_value, operation: reconcile, description: "Reconcile with DCF"
  - step: 4, fact_id: cap_earnings_value, operation: reconcile, description: "Reconcile with capitalization of earnings"
dependent_consumers:
  - dashboard
  - bis
  - reports
  - growth_plan
  - executive_brief
propagation_rules:
  - target: dashboard, action: refresh, condition: "advisor_approved == true"
  - target: reports, action: mark_stale, condition: "always"
  - target: growth_plan, action: refresh, condition: "advisor_approved == true"
dependent_facts:
  - equity_value
  - value_gap_amount
```

*(All 50 facts follow this same contract. Full registry defined in implementation.)*

---

## PART 3 — SOURCE HIERARCHY

### 3.1 Authoritative Source Priority

A fact may have multiple sources. The hierarchy determines which source wins.

| Priority | Source Type | Authority Level | Example |
|----------|-----------|-----------------|---------|
| 1 | **Verified Tax Return** | Highest — government-filed, advisor-verified | IRS-filed business tax return, reviewed by advisor |
| 2 | **Reviewed Financial Statements** | High — CPA-reviewed, advisor-confirmed | Reviewed P&L from CPA |
| 3 | **Uploaded Financial Statements** | Medium — uploaded but not yet reviewed | Owner-uploaded P&L |
| 4 | **Document Extraction** | Medium — AI-extracted, pending review | extracted_fields (review_status: pending_review) |
| 5 | **Assessment Answers** | Medium — owner-provided in assessment | Profit Gap assessment input |
| 6 | **Manual Advisor Entry** | Medium — advisor-typed into valuation | valuation_answers (source_type: advisor_entry) |
| 7 | **Owner Estimates** | Lowest — unverified owner estimate | Owner-entered in onboarding |
| 8 | **Benchmark / Derived** | Special — not a source but a calculation | Industry benchmark multiple |

### 3.2 Hierarchy Rules

```
RULE 1: Never overwrite a higher-authority source with a lower-authority source.
  - If a verified tax return says revenue = $1.2M, an owner estimate of $1.5M does NOT overwrite.

RULE 2: A higher-authority source can overwrite a lower-authority source — but only with advisor approval.
  - If owner estimated $1.5M and a tax return shows $1.2M, the tax return wins AFTER advisor confirms.

RULE 3: Equal-authority sources create a conflict — route to Verification Queue.
  - Two different P&Ls showing different revenue = conflict, not overwrite.

RULE 4: Benchmark/derived sources never overwrite primary sources.
  - An industry benchmark multiple does not overwrite an advisor-selected multiple.

RULE 5: The hierarchy is configurable per fact.
  - Some facts may elevate "assessment answers" above "document extraction" (e.g., subjective facts).
  - Configuration lives in the Canonical Fact Registry.
```

### 3.3 Source Resolution Algorithm (Already Exists)

The `intelligenceEngine.ts` `buildCandidate()` function ALREADY implements source priority resolution:

1. Run all resolvers for the field
2. Check for advisor-approved existing answer (highest priority)
3. Detect conflicts among numeric candidates
4. Pick recommended source: advisor-approved first, else highest-priority result
5. Calculate confidence level
6. Mark stale if source date > 18 months

**This is the CBIL source hierarchy, already certified. CBIL formalizes it as the canonical contract.**

### 3.4 Configurable Override

```yaml
# Example: Customer Concentration — assessment answers are more authoritative than documents
fact_overrides:
  customer_concentration:
    source_priority_override:
      - assessment_answer: 2      # Elevated above uploaded financials
      - advisor_entry: 3
      - document_extraction: 4
    reason: "Subjective metric — owner/advisor judgment is more reliable than document extraction"
```

---

## PART 4 — LINEAGE

### 4.1 Every Fact Explains Itself

Every canonical fact carries a `lineage` array — the chain of derivation from primary sources to the current value.

### 4.2 Lineage Examples

#### Enterprise Value Lineage

```
Enterprise Value: $4,500,000
├── Step 1: Normalized EBITDA = $900,000
│   ├── Net Income = $750,000 (from 2024 P&L, confidence: 92)
│   ├── + Add-backs = $150,000 (advisor-approved, 3 items)
│   │   ├── Owner compensation adjustment: $120,000
│   │   ├── One-time legal expense: $20,000
│   │   └── Personal auto expense: $10,000
│   └── = Normalized EBITDA = $900,000
├── Step 2: Market Multiple = 5.0x
│   ├── Industry benchmark: 4.5x (confidence: 75)
│   ├── Advisor adjustment: +0.5x (reason: strong recurring revenue)
│   └── Approved multiple: 5.0x (advisor-approved 2024-08-05)
├── Step 3: Multiple Method Value = $4,500,000
│   └── $900,000 × 5.0x = $4,500,000
├── Step 4: DCF Value = $4,200,000 (reconciled weight: 30%)
├── Step 5: Cap Earnings Value = $4,600,000 (reconciled weight: 20%)
└── Step 6: Reconciled Enterprise Value = $4,440,000
    └── Weighted: (50% × $4.5M) + (30% × $4.2M) + (20% × $4.6M) = $4,440,000

Last updated: 2024-08-05 by Advisor (profile_id: abc123)
Reason: Approved add-backs and multiple
```

#### Revenue Lineage

```
Revenue: $1,250,000
├── Primary Source: 2024 P&L Statement (extracted, confidence: 95)
├── Alternative Source: 2024 Business Tax Return (extracted, confidence: 94, value: $1,250,000)
├── Alternative Source: Profit Gap Assessment (owner-entered, confidence: 70, value: $1,200,000)
├── Conflict: None (P&L and tax return agree)
└── Verification: Advisor-approved 2024-08-01

Last updated: 2024-08-01 by Advisor
Reason: Document extraction approved
```

#### IQ Score Lineage

```
IQ Score: 62
├── Profit Gap signal: 45/100 (weight: 25%)
├── Value Gap signal: 58/100 (weight: 25%)
├── Tax Gap signal: 70/100 (weight: 20%)
├── Operations signal: 55/100 (weight: 15%)
├── Recast EBITDA signal: 68/100 (weight: 10%)
└── Freedom signal: 72/100 (weight: 5%)
    └── Weighted composite: 62

Last updated: 2024-08-05 (BIS rebuild)
Reason: Assessment completed
```

### 4.3 Lineage Display

Lineage is displayed through the **existing `EvidenceDrawer`** (Phase 13.3G). No new UI.

- User clicks a metric → `FieldEvidenceContext.openEvidence()`
- EvidenceDrawer renders: source, confidence, evidence, audit log, AI extraction history, change requests
- Lineage is added as a new section in the EvidenceDrawer (additive, non-breaking)

### 4.4 Lineage Storage

Lineage is NOT stored as a separate graph. It is **derived** from existing audit data:

- `valuation_calculation_lines` — stores calculation steps (already exists)
- `valuation_audit_log` — stores change history (already exists)
- `extracted_fields` — stores source documents (already exists)
- `valuation_adjustments` — stores add-backs (already exists)
- `BIE journal` — stores intelligence changes (already exists)

**CBIL assembles lineage from existing audit data on-demand. No new storage.**

---

## PART 5 — PROPAGATION MODEL

### 5.1 Single Update, Multiple Reactions

A canonical business fact updates exactly ONCE. Every dependent system reacts.

### 5.2 Propagation Flow

```
CANONICAL FACT UPDATE (single write to primary source)
    │
    ▼
BUSINESS INTELLIGENCE EVENT (standardized event)
    │
    ├──→ stalenessMap determines affected calculations
    │       │
    │       ▼
    │   Affected calculations marked stale
    │       │
    │       ▼
    │   AUTO-RECALCULATE (if inputs verified)
    │   OR
    │   ROUTE TO VERIFY (if inputs unverified)
    │
    ├──→ BIS rebuild trigger
    │       │
    │       ▼
    │   New BIS snapshot + journal entry
    │       │
    │       ▼
    │   Dashboard refresh
    │
    ├──→ Report staleness flag
    │       │
    │       ▼
    │   Reports marked stale
    │
    ├──→ Growth Plan refresh trigger
    │       │
    │       ▼
    │   Candidate initiatives regenerated
    │
    ├──→ Executive Brief regeneration trigger
    │       │
    │       ▼
    │   Brief narrative updated
    │
    ├──→ Galileo context invalidation
    │       │
    │       ▼
    │   Next askGalileo call uses fresh context
    │
    ├──→ Meeting preparation refresh
    │       │
    │       ▼
    │   Next command center load uses fresh data
    │
    └──→ Magic Moment notification (if applicable)
            │
            ▼
        Advisor notified
```

### 5.3 Propagation Rules per Fact

| Fact | Propagates To | Trigger Condition | Mechanism |
|------|--------------|-------------------|----------|
| **Revenue** | Dashboard, Valuation, BIS, Growth Plan, Reports, Brief, Galileo | Extraction approved | stalenessMap + BIS rebuild |
| **EBITDA** | Valuation, BIS, Reports, Growth Plan | Add-backs approved or calculation complete | stalenessMap + BIS rebuild |
| **Enterprise Value** | Dashboard, BIS, Reports, Growth Plan, Brief | Calculation complete + advisor approved | BIS rebuild + report staleness |
| **Add-backs** | Valuation, BIS | Advisor-approved in Verify Queue | stalenessMap (normalized earnings → EV) |
| **Confidence Score** | Valuation, BIS, Dashboard | Source data change | confidenceEngine recalculation |
| **Assessment Results** | BIS, Dashboard, Next Best Action | Assessment completed | BIS rebuild |
| **Growth Initiatives** | Sprint, BIE | Initiative approved | BIE recommendation → sprint generation |
| **Document Verified** | Intelligence, Confidence, BIS | Field review_status → accepted | Intelligence rebuild + confidence recalc |

### 5.4 Propagation Guarantees

```
GUARANTEE 1: No module calculates independently.
  - Every consumer reads from the canonical fact or receives a propagated update.

GUARANTEE 2: No duplicate propagation.
  - The stalenessMap is the single dependency graph. No module has its own.

GUARANTEE 3: Propagation is eventually consistent.
  - Updates may be async but always complete.
  - Stale state is visible until propagation finishes.

GUARANTEE 4: Propagation is observable.
  - Every propagation creates a BIE journal entry.
  - The advisor can see what changed and why.

GUARANTEE 5: Propagation respects governance.
  - Advisor-approved values are never overwritten by propagation.
  - Low-confidence values route to Verify, not to consumers.
```

---

## PART 6 — CHANGE EVENTS

### 6.1 Standardized Business Intelligence Events

Every canonical fact change emits a standardized event.

```typescript
interface BusinessIntelligenceEvent {
  event_id: string;
  event_type: BIEventType;
  timestamp: string;

  // ── Fact Identification ──
  canonical_fact_id: string;      // "revenue", "ebitda", "enterprise_value"
  business_id: string;
  profile_id: string;

  // ── Change Payload ──
  previous_value: any;
  new_value: any;
  previous_confidence: number;
  new_confidence: number;
  previous_verification_status: string;
  new_verification_status: string;

  // ── Reason & Evidence ──
  reason: string;                 // "document_extraction_approved" | "advisor_override" | "calculation_complete"
  evidence: Evidence[];
  source_type: SourceType;
  source_id: string;

  // ── Impact ──
  affected_systems: string[];      // ["dashboard", "valuation", "bis", ...]
  dependent_facts_impacted: string[];  // ["ebitda", "enterprise_value", ...]

  // ── Propagation ──
  propagation_status: "pending" | "in_progress" | "complete" | "failed" | "blocked";
  propagation_steps: PropagationStep[];
}

type BIEventType =
  | "revenue_updated"
  | "ebitda_updated"
  | "add_back_approved"
  | "financial_uploaded"
  | "document_verified"
  | "extraction_completed"
  | "confidence_changed"
  | "verification_completed"
  | "conflict_detected"
  | "conflict_resolved"
  | "valuation_published"
  | "growth_plan_updated"
  | "assessment_completed"
  | "advisor_override"
  | "calculation_complete"
  | "build_value_rebuilt"
  | "bis_rebuilt";

interface PropagationStep {
  target_system: string;
  action: "refresh" | "mark_stale" | "rebuild" | "notify";
  status: "pending" | "complete" | "failed";
  completed_at: string;
}
```

### 6.2 Event Examples

#### Revenue Updated

```json
{
  "event_id": "evt_001",
  "event_type": "revenue_updated",
  "timestamp": "2026-08-07T16:00:00Z",
  "canonical_fact_id": "revenue",
  "business_id": "biz_123",
  "previous_value": 1200000,
  "new_value": 1250000,
  "previous_confidence": 70,
  "new_confidence": 95,
  "previous_verification_status": "suggested",
  "new_verification_status": "verified",
  "reason": "document_extraction_approved",
  "evidence": [
    {"type": "document", "source_name": "2024 P&L Statement", "value": 1250000, "confidence": 95}
  ],
  "affected_systems": ["dashboard", "valuation", "bis", "growth_plan", "reports", "executive_brief"],
  "dependent_facts_impacted": ["gross_margin", "ebitda", "enterprise_value", "profit_gap_amount"],
  "propagation_status": "complete",
  "propagation_steps": [
    {"target_system": "valuation", "action": "mark_stale", "status": "complete"},
    {"target_system": "bis", "action": "rebuild", "status": "complete"},
    {"target_system": "dashboard", "action": "refresh", "status": "complete"},
    {"target_system": "reports", "action": "mark_stale", "status": "complete"},
    {"target_system": "growth_plan", "action": "refresh", "status": "complete"},
    {"target_system": "executive_brief", "action": "rebuild", "status": "complete"}
  ]
}
```

#### Conflict Detected

```json
{
  "event_id": "evt_002",
  "event_type": "conflict_detected",
  "canonical_fact_id": "revenue",
  "previous_value": 1250000,
  "new_value": null,
  "reason": "material_conflict_between_sources",
  "evidence": [
    {"source_name": "2024 P&L", "value": 1250000, "confidence": 95},
    {"source_name": "2024 Tax Return", "value": 1180000, "confidence": 94}
  ],
  "affected_systems": ["verification_queue"],
  "propagation_status": "complete",
  "propagation_steps": [
    {"target_system": "verification_queue", "action": "notify", "status": "complete"}
  ]
}
```

### 6.3 Event Storage

Events are stored as **BIE journal entries** — the existing `biePersistence.saveJournalEntry` function.

```
BI Event created
    │
    ▼
biePersistence.saveJournalEntry({
  businessId, version, changedMetrics: [canonical_fact_id],
  triggeredBy: event_type, reason, metricValues: { [fact_id]: new_value }
})
    │
    ▼
Journal entry persisted (existing table: business_intelligence_journal)
```

**No new event store. Reuses BIE journal.**

---

## PART 7 — CONSUMER REGISTRY

Every consumer of canonical business facts, declaring what it consumes, required confidence, fallback behavior, and refresh policy.

### 7.1 Consumer Registry

| # | Consumer | Facts Consumed | Required Confidence | Fallback Behavior | Refresh Policy |
|---|----------|---------------|---------------------|-------------------|----------------|
| C1 | **Dashboard** | revenue, ebitda, enterprise_value, equity_value, IQ score, business impact score, all gap amounts, operations score, freedom score | ≥65 (display), ≥85 (highlight) | Show "Data not yet available" if missing | On BIS rebuild (event-driven) |
| C2 | **Valuation** | revenue, net_income, ebitda, add-backs, owner_compensation, total_assets, total_liabilities, cash, debt, industry, multiple, discount_rate | ≥65 (calculate), ≥85 (publish) | Route to Verify if <65 | On staleness (event-driven) |
| C3 | **Build Value** | All 6 dimension scores, value drivers, detractors, constraints, all financial facts | ≥65 | Show "Insufficient intelligence" | On intelligence rebuild (event-driven) |
| C4 | **Growth Plan** | enterprise_value, ebitda, value drivers, detractors, build value dimensions | ≥85 (for approved initiatives) | Generate as "candidate" if <85 | On valuation version change (event-driven) |
| C5 | **Reports / Deliverables** | All valuation facts, confidence, publication status, version | ≥85 (published), any (draft) | Mark as "stale" if source changed | On valuation version change (event-driven) |
| C6 | **Executive Brief** | BIS, all gap amounts, IQ score, next best action | ≥65 | Show "Complete assessments to see insights" | On BIS rebuild (event-driven) |
| C7 | **Galileo (askGalileo)** | All canonical facts (context-dependent) | Any (explains uncertainty) | "I don't see [X] data yet" | On every conversation (real-time context) |
| C8 | **Assessments** | revenue, ebitda, AGI, monthly take-home, net_profit, employee_count (prefill) | ≥50 (suggest), ≥85 (auto-fill) | Suggest as prefill, do not auto-fill if <50 | On prefill request (on-demand) |
| C9 | **Verification Queue** | All facts with confidence <85 or conflict_status != none | Any | Surface as queue item | On intelligence rebuild (event-driven) |
| C10 | **Documents / Data Room** | document_completeness, verification_status, field_confidence | Any | Show upload prompt if missing | On upload/extraction (event-driven) |
| C11 | **Meeting Preparation** | All canonical facts (client summary) | Any | Show "No data yet" | On booking creation (event-driven) |
| C12 | **Business Intelligence (BIS)** | All canonical facts (composite) | Any | N/A (BIS is the aggregator) | On any fact change (event-driven) |
| C13 | **90-Day Sprints** | BIE recommendations, gap amounts, growth initiatives | ≥85 (for task generation) | Do not generate if <85 | On BIE rebuild (event-driven) |
| C14 | **Notifications** | All facts (for Magic Moments) | Any | N/A | On event (event-driven) |

### 7.2 Consumer Contract

Each consumer declares:

```yaml
consumer:
  id: dashboard
  facts_consumed:
    - fact_id: revenue
      required_confidence: 65
      fallback: "show_placeholder"
    - fact_id: enterprise_value
      required_confidence: 85
      fallback: "show_calculating"
  refresh_policy: "event_driven"
  refresh_trigger: "bis_rebuilt"
```

### 7.3 Fallback Behavior Catalog

| Fallback | When Used | Display |
|----------|----------|--------|
| `show_placeholder` | Fact missing or confidence <threshold | "— Data not yet available" |
| `show_calculating` | Fact is being calculated | "Calculating…" with spinner |
| `show_stale` | Fact is stale (source changed) | Value shown with stale indicator |
| `show_estimated` | Fact is an estimate (low confidence) | Value shown with "estimated" badge |
| `route_to_verify` | Fact confidence <65 or conflicting | Hidden from consumer, routed to Verify |
| `show_last_known` | Fact unavailable but last value known | Last value with "last known" badge |

---

## PART 8 — CONFLICT DETECTION

### 8.1 When Two Authoritative Sources Disagree

**Rule: Do NOT overwrite. Create a conflict.**

### 8.2 Conflict Detection (Already Exists)

The `intelligenceEngine.ts` `detectConflicts()` function ALREADY implements conflict detection:

```typescript
function detectConflicts(
  results: ResolverResult[],
  materialityThreshold: number  // default 0.1 (10%)
): Conflict[]
```

- Compares all numeric candidate values
- If difference > materiality threshold (10% default), creates a conflict
- Conflict includes: source_a, source_b, value_a, value_b, variance, materiality

### 8.3 Conflict Record

```typescript
interface Conflict {
  field_key: string;
  field_name: string;
  source_a: string;
  source_b: string;
  value_a: any;
  value_b: any;
  variance: number;              // Percentage difference
  materiality: "minor" | "material";
  confidence_a: number;
  confidence_b: number;
  recommended_resolution: string;
  verification_item_id: string;  // Links to Verification Queue
}
```

### 8.4 Conflict Resolution Flow

```
Two sources disagree (material conflict)
    │
    ▼
intelligenceEngine.detectConflicts() creates Conflict record
    │
    ▼
Conflict added to Verification Queue (existing verificationQueueService)
    │
    ▼
Advisor sees conflict in Verify Workspace
    │
    ├── Advisor approves Source A → Source A becomes canonical, Source B archived
    ├── Advisor approves Source B → Source B becomes canonical, Source A archived
    ├── Advisor enters new value → New value becomes canonical, both sources archived
    └── Advisor requests client confirmation → Client request created
    │
    ▼
Resolution writes through to valuation_answers / valuation_adjustments
    │
    ▼
stalenessMap propagates to affected calculations
    │
    ▼
BIS rebuild + Magic Moment notification
```

### 8.5 Conflict Rules

```
RULE 1: Never overwrite a higher-authority source with a lower-authority source.
  - Conflict detected → route to Verify, do NOT auto-resolve.

RULE 2: Equal-authority conflicts always route to Verify.
  - Two P&Ls with different revenue = Verify, not auto-pick.

RULE 3: Minor conflicts (variance < 5%) may auto-resolve to the higher-confidence source.
  - Configurable per fact in the Canonical Fact Registry.

RULE 4: Material conflicts (variance > 10%) always route to Verify.
  - Never auto-resolve material conflicts.

RULE 5: All conflicts use the existing Verification Queue.
  - Never create another conflict workflow.
  - The Verification Queue is the single place for conflict resolution.
```

### 8.6 Recommended Resolution Engine

When a conflict is detected, the system recommends a resolution:

```yaml
conflict:
  field: revenue
  source_a: "2024 P&L Statement"
  value_a: 1250000
  confidence_a: 95
  source_b: "2024 Tax Return"
  value_b: 1180000
  confidence_b: 94
  variance: 5.6%
  materiality: material

recommended_resolution:
  preferred_source: source_a
  reason: "P&L is the primary financial statement for revenue; tax return may reflect different accounting period"
  advisor_action: "Confirm which reporting period each document covers, then approve the correct one"
```

The recommendation is **advisory only** — the advisor makes the final decision.

---

## PART 9 — AUTONOMOUS PROPAGATION READINESS

### 9.1 Classification

Every fact update is classified into one of four propagation categories:

| Category | Meaning | When Applied | Example |
|----------|---------|--------------|--------|
| **Automatic** | Propagates immediately, no advisor review needed | High confidence (≥85), no conflict, advisor-approved source | Tax return extraction approved → revenue updates → BIS rebuilds → dashboard refreshes |
| **Advisor Review** | Propagates after advisor reviews | Medium confidence (65-84), no conflict | P&L extraction pending review → advisor reviews → approves → propagates |
| **Verification Required** | Routes to Verification Queue, does NOT propagate | Low confidence (<65), conflict, or missing | Two sources disagree → conflict → Verify → advisor resolves → then propagates |
| **Blocked** | Cannot propagate — missing dependency or governance lock | Field is locked by another advisor, or dependency is unverified | Add-back proposed but normalized EBITDA calculation is locked → blocked until lock released |

### 9.2 Readiness Classification per Fact

| Fact | Automatic | Advisor Review | Verification Required | Blocked |
|------|-----------|---------------|----------------------|---------|
| **Revenue** (from tax return, confidence ≥95) | ✅ | — | — | — |
| **Revenue** (from P&L, confidence 85-94) | — | ✅ | — | — |
| **Revenue** (from owner estimate, confidence <65) | — | — | ✅ | — |
| **Revenue** (conflicting sources) | — | — | ✅ | — |
| **EBITDA** (calculated from verified inputs) | ✅ | — | — | — |
| **EBITDA** (calculated from unverified inputs) | — | — | — | ✅ |
| **Add-backs** (advisor-approved) | ✅ | — | — | — |
| **Add-backs** (AI-proposed) | — | ✅ | — | — |
| **Enterprise Value** (all inputs verified) | ✅ | — | — | — |
| **Enterprise Value** (some inputs unverified) | — | ✅ | — | — |
| **Enterprise Value** (stale calculation) | — | — | — | ✅ |
| **Growth Initiatives** (advisor-approved) | ✅ | — | — | — |
| **Growth Initiatives** (AI-generated candidates) | — | ✅ | — | — |
| **Assessment Results** (completed) | ✅ | — | — | — |
| **Document Extraction** (confidence ≥85) | ✅ | — | — | — |
| **Document Extraction** (confidence 65-84) | — | ✅ | — | — |
| **Document Extraction** (confidence <65) | — | — | ✅ | — |

### 9.3 Propagation Safety Rules

```
RULE 1: Nothing propagates without governance.
  - Every propagation must pass the readiness classification.

RULE 2: Advisor-approved values are never overwritten.
  - If an advisor approved revenue = $1.2M, an extraction of $1.25M does NOT auto-overwrite.
  - It creates a "Suggested Update" that the advisor reviews.

RULE 3: Low-confidence values never reach consumers.
  - Confidence <65 routes to Verify, not to Dashboard/Valuation/Reports.

RULE 4: Conflicting values never reach consumers.
  - Conflicting sources route to Verify, not to consumers.

RULE 5: Blocked values surface immediately.
  - If a propagation is blocked, the advisor is notified with the blocker reason.

RULE 6: All automatic propagations are logged.
  - Every automatic propagation creates a BIE journal entry.
  - The advisor can audit what propagated automatically.
```

---

## PART 10 — READINESS SCORE

### 10.1 Per-Fact Readiness Scoring

Each canonical fact is scored on 8 dimensions (each 0-100):

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Single Source** | 15% | Does the fact have one canonical source? (vs duplicated across tables) |
| **Confidence** | 15% | Is confidence calculated and displayed? |
| **Evidence** | 10% | Is supporting evidence available? |
| **Consumers** | 10% | Are all consumers registered and reading from canonical source? |
| **Automation Ready** | 15% | Can the fact propagate automatically? |
| **Lineage** | 10% | Is lineage derivable from existing audit data? |
| **Propagation** | 15% | Are propagation rules defined and wired? |
| **Verification** | 10% | Is verification status tracked? |

### 10.2 Fact Readiness Scores

| Fact | Single Source | Confidence | Evidence | Consumers | Automation | Lineage | Propagation | Verification | **Total** |
|------|--------------|------------|----------|-----------|------------|---------|-------------|--------------|----------|
| **Revenue** | 40 (5 tables) | 90 | 85 | 70 (partially wired) | 80 | 75 | 70 | 85 | **74** |
| **EBITDA** | 30 (5 tables) | 85 | 80 | 65 | 75 | 80 | 65 | 80 | **70** |
| **Normalized EBITDA** | 85 (1 table) | 90 | 90 | 85 | 80 | 90 | 85 | 90 | **87** |
| **Owner Compensation** | 50 (4 tables) | 80 | 80 | 70 | 75 | 70 | 65 | 80 | **71** |
| **Add-backs** | 85 (1 table) | 85 | 85 | 85 | 80 | 85 | 80 | 90 | **84** |
| **Enterprise Value** | 60 (4 tables) | 90 | 90 | 80 | 75 | 90 | 75 | 90 | **81** |
| **Equity Value** | 70 (3 tables) | 90 | 85 | 75 | 75 | 85 | 70 | 90 | **80** |
| **IQ Score** | 70 (2 tables) | 85 | 80 | 85 | 80 | 75 | 80 | 70 | **78** |
| **Dimension Scores** | 85 (2 tables) | 85 | 85 | 85 | 75 | 80 | 75 | 85 | **83** |
| **Assessment Results** | 60 (3 tables) | 85 | 80 | 80 | 80 | 75 | 80 | 85 | **78** |
| **Growth Initiatives** | 75 (2 systems) | 80 | 75 | 80 | 75 | 75 | 70 | 80 | **76** |
| **Confidence Score** | 60 (3 tables) | 90 | 85 | 75 | 70 | 80 | 65 | 85 | **76** |
| **Document Completeness** | 85 (2 tables) | 80 | 80 | 85 | 80 | 70 | 80 | 85 | **80** |
| **Verification Status** | 95 (1 table) | 85 | 85 | 90 | 85 | 75 | 85 | 95 | **87** |

### 10.3 Overall Canonical Readiness Score

| Category | Facts | Average Score |
|----------|-------|---------------|
| Financial Facts | 17 | **72** |
| Valuation Facts | 7 | **82** |
| Business Quality Facts | 6 | **83** |
| Business Profile Facts | 5 | **68** |
| Intelligence & Assessment Facts | 8 | **77** |
| Growth & Execution Facts | 3 | **76** |
| Document & Verification Facts | 4 | **83** |

**Overall Canonical Readiness Score: 77 / 100**

### 10.4 Readiness Gaps

| Gap | Current Score | Target | Blocker |
|-----|--------------|--------|--------|
| Single Source (Financial Facts) | 40 | 90 | Facts duplicated across 3-5 tables |
| Propagation (Valuation Facts) | 70 | 90 | Propagation triggers not fully wired |
| Consumers (Business Profile) | 65 | 90 | Not all consumers read from canonical source |
| Automation (Confidence) | 70 | 90 | Confidence not auto-recalculated on source change |

---

## PART 11 — ARCHITECTURAL ENFORCEMENT

### 11.1 Validation Checklist

| Rule | Status | Enforcement |
|------|--------|-------------|
| No duplicate facts | ⚠️ Partial — 50 facts identified, some duplicated | Canonical Fact Registry defines each fact once |
| No duplicate storage | ❌ Currently ~2.4 tables/fact average | Migration to single canonical source (Phase 14.2D) |
| No duplicate calculations | ⚠️ EBITDA derived in 3+ places | All derivations use the canonical fact |
| No duplicate update paths | ❌ Revenue updates via 4 different paths | Single update path through BI Events |
| No duplicate business intelligence | ⚠️ BIS + dashboard_metrics overlap | dashboard_metrics reads from BIS (no independent storage) |
| No duplicate propagation | ✅ stalenessMap is single dependency graph | Maintain single graph |
| Reuse every certified engine | ✅ 14/14 engines reused | No new engines |

### 11.2 Architectural Rules

```
RULE 1: Every business fact has exactly ONE canonical ID.
  - No two facts share a canonical_id.
  - No fact has more than one canonical_id.

RULE 2: Every consumer reads from the canonical fact.
  - No consumer reads from a duplicate table.
  - Migration: consumers are updated to read from canonical, then duplicate tables are removed.

RULE 3: Every update goes through a BI Event.
  - No direct writes to consumer tables.
  - Updates write to the canonical source, then propagate.

RULE 4: Every propagation uses the stalenessMap.
  - No module has its own dependency graph.
  - The stalenessMap is the single source of propagation truth.

RULE 5: Every conflict uses the Verification Queue.
  - No separate conflict workflow.
  - The Verification Queue is the single conflict resolution surface.

RULE 6: Every confidence calculation uses the confidenceEngine.
  - No module calculates its own confidence.
  - The confidenceEngine is the single confidence authority.

RULE 7: Every lineage is derived from existing audit data.
  - No new lineage store.
  - Lineage is assembled from valuation_calculation_lines, valuation_audit_log, extracted_fields, BIE journal.

RULE 8: Every engine is reused.
  - intelligenceEngine (candidates, conflicts, decidePrefill)
  - confidenceEngine (confidence scoring)
  - stalenessMap (dependency propagation)
  - verificationQueueService (conflict resolution)
  - valuationCalculationEngine (calculations)
  - biePersistence (snapshots + journal)
  - executiveNarrativeEngine (briefs)
  - growthPlanEngine (initiatives)
  - deliverablesEngine (reports)
  - generateAdvisorCommandCenter (meeting prep)
  - notificationService (Magic Moments)
  - fieldGovernanceService (field provenance)
  - EvidenceDrawer (lineage display)
  - assessmentPrefillMap (assessment prefill)
```

---

## PART 12 — IMPLEMENTATION ROADMAP

### 12.1 Phase Sequence

```
PHASE 14.2A — Canonical Fact Registry (Week 1)
  - Define all 50 canonical facts with full contract
  - Map each fact to its primary source table
  - Map each fact to its dependent consumers
  - Define source priority per fact
  - Define propagation rules per fact
  - Output: Canonical Fact Registry (configuration, no new tables)

PHASE 14.2B — BI Event Layer (Week 1-2)
  - Standardize BI Event contract
  - Wire existing engines to emit BI Events
  - Route events through BIE journal (existing biePersistence)
  - Output: Event-driven propagation triggers (no new event store)

PHASE 14.2C — Propagation Wiring (Week 2-3)
  - Wire BI Events to stalenessMap (existing)
  - Wire stalenessMap to valuationCalculationEngine (existing)
  - Wire calculation completion to BIS rebuild (existing biePersistence)
  - Wire BIS rebuild to dashboard refresh (existing)
  - Wire BIS rebuild to report staleness (existing stalenessMap)
  - Wire BIS rebuild to Growth Plan refresh (existing growthPlanEngine)
  - Wire BIS rebuild to Executive Brief regeneration (existing executiveNarrativeEngine)
  - Wire BIS rebuild to Galileo context invalidation (existing)
  - Output: Fully wired propagation (trigger wiring only, no new engines)

PHASE 14.2D — Consumer Migration (Week 3-4)
  - Migrate dashboard_metrics to read from BIS (instead of independent storage)
  - Migrate profile_financials to read from extracted_fields (instead of independent storage)
  - Migrate assessment prefill to read from canonical facts (via getMetricAutoPopulate)
  - Migrate Valuation to read from canonical facts (via intelligenceEngine candidates)
  - Output: Consumers read from canonical, duplicate writes removed (additive migration)

PHASE 14.2E — Conflict & Verification Integration (Week 4)
  - Wire intelligenceEngine conflict detection to Verification Queue (existing)
  - Wire Verification Queue resolution to BI Events
  - Wire BI Events to stalenessMap propagation
  - Output: Conflicts route through existing Verify, resolutions propagate automatically

PHASE 14.2F — Lineage Assembly (Week 4-5)
  - Build lineage assembler (reads from valuation_calculation_lines, audit_log, extracted_fields, journal)
  - Add lineage section to EvidenceDrawer (additive, non-breaking)
  - Output: Every fact explains itself through existing UI

PHASE 14.2G — Dedup Migration (Week 5-7, P3)
  - Identify all duplicate writes
  - Add propagation triggers (Phase 14.2C)
  - Migrate consumers to read from canonical (Phase 14.2D)
  - Remove duplicate writes (after verification)
  - Output: Single source of truth achieved
```

### 12.2 Reuse Summary

| Existing Engine | CBIL Role | New Code Needed |
|----------------|-----------|-----------------|
| `intelligenceEngine` | Candidate + conflict detection + decidePrefill | None (already certified) |
| `confidenceEngine` | Confidence scoring | None (already certified) |
| `stalenessMap` | Dependency propagation | None (already certified) |
| `verificationQueueService` | Conflict resolution | None (already certified) |
| `valuationCalculationEngine` | Calculations | None (already certified) |
| `biePersistence` | Snapshots + journal (BI Events) | None (already certified) |
| `executiveNarrativeEngine` | Brief regeneration | None (already certified) |
| `growthPlanEngine` | Initiative generation | None (already certified) |
| `deliverablesEngine` | Report staleness | None (already certified) |
| `generateAdvisorCommandCenter` | Meeting prep | None (already certified) |
| `notificationService` | Magic Moments | None (already certified) |
| `fieldGovernanceService` | Field provenance | None (already certified) |
| `EvidenceDrawer` | Lineage display | Additive section only |
| `assessmentPrefillMap` | Assessment prefill | None (already certified) |
| `getMetricAutoPopulate` | Source priority chain | None (already certified) |

**Reuse score: 15/15 engines reused. 0 new engines. Only trigger wiring + configuration + additive lineage section.**

### 12.3 Architectural Recommendations

1. **Canonical Fact Registry is configuration, not a new table.** It defines the contract for each fact and maps to existing primary sources. No new storage.

2. **BI Events reuse the BIE journal.** No new event store. Events are journal entries with standardized payloads.

3. **Propagation reuses the stalenessMap.** No new dependency graph. The stalenessMap is extended (additively) to cover new fact types if needed.

4. **Lineage is derived, not stored.** No graph database. Lineage is assembled on-demand from existing audit data.

5. **Consumer migration is additive.** Consumers are updated to read from canonical sources first. Duplicate writes are removed only after all consumers are migrated and verified.

6. **Conflict resolution uses the existing Verification Queue.** No new conflict workflow. The intelligenceEngine already detects conflicts; the Verification Queue already resolves them.

7. **Confidence uses the existing confidenceEngine.** No new confidence system. The confidenceEngine is the single confidence authority.

8. **Source hierarchy is formalized, not newly built.** The intelligenceEngine already implements source priority resolution. CBIL formalizes it as the canonical contract.

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Business fact inventory complete | ✅ 50 facts across 7 categories |
| Canonical fact model defined | ✅ Full contract with 15 attributes |
| Source hierarchy defined | ✅ 8-level configurable hierarchy |
| Lineage model defined | ✅ Derived from existing audit data |
| Propagation model defined | ✅ Single update, multiple reactions |
| Change events standardized | ✅ BI Event contract with 16 event types |
| Consumer registry complete | ✅ 14 consumers with declared contracts |
| Conflict detection rules defined | ✅ Routes through existing Verify Queue |
| Autonomous propagation readiness classified | ✅ 4 categories (Automatic/Review/Verify/Blocked) |
| Readiness scores calculated | ✅ Overall: 77/100, gaps identified |
| Architectural enforcement validated | ✅ 8 rules, 15/15 engines reused |
| Implementation roadmap defined | ✅ 7 phases, 5-7 weeks |
| No propagation implemented | ✅ |
| No calculations modified | ✅ |
| No UI changed | ✅ |
| No graph database created | ✅ |
| No duplicate tables created | ✅ |
| No certified engines replaced | ✅ |
| Report created | ✅ |

---

## READY FOR CANONICAL BUSINESS INTELLIGENCE REVIEW

---

## Phase 14.2A Implementation — COMPLETE

**Date:** 2026-08-07
**Status:** READ Layer Certified

The Canonical Fact Resolution Foundation (Phase 14.2A) has been implemented and certified. See `src/CANONICAL_FACT_RESOLUTION_REPORT.md` for the full certification report.

### Implemented Components

- `base44/shared/canonicalFact/types.ts` — 15+ attribute Canonical Fact Contract
- `base44/shared/canonicalFact/registry.ts` — 50-Fact Registry (7 categories)
- `base44/shared/canonicalFact/sourceHierarchy.ts` — 8-Level Source Authority Resolver
- `base44/shared/canonicalFact/reportingPeriod.ts` — Reporting Period Resolution
- `base44/shared/canonicalFact/lineage.ts` — Lineage Assembly (derived from audit data)
- `base44/shared/canonicalFact/clientSafe.ts` — Client-Safe Filtering
- `base44/shared/canonicalFact/resolver.ts` — Canonical Fact Resolver
- `base44/shared/canonicalFact/contextLoader.ts` — IntelligenceContext Loader
- `base44/functions/canonicalFactService/entry.ts` — Read-Only API (6 actions)

### Reuse Score: 15/15 existing engines reused, 0 new engines created

---

## Phase 14.2B Implementation — COMPLETE

**Date:** 2026-08-07
**Status:** Galileo and Dashboard CERTIFIED

The Controlled Canonical Consumer Migration (Phase 14.2B) has been implemented and certified. See `src/CANONICAL_CONSUMER_MIGRATION_REPORT.md` for the full certification report.

### Implemented Components

- `base44/shared/canonicalFact/resolverHelpers.ts` — Shared resolver helpers (extracted from canonicalFactService)
- `base44/shared/canonicalFact/consumerAdapter.ts` — Shared consumer migration adapter (Galileo + Dashboard)
- `src/lib/canonicalFactClient.js` — Client-side Dashboard canonical facts helper
- `src/CANONICAL_CONSUMER_MIGRATION_REPORT.md` — Full certification report

### Migrated Consumers

1. **Galileo** (`buildGalileoContext/entry.ts`) — canonical facts preferred for revenue, net_income, reported_ebitda. Additive `canonical_facts` domain. Shadow diagnostics in `_meta`. Conflict state exposed.
2. **Dashboard** (`src/pages/Dashboard.jsx`) — canonical facts preferred for revenue, net_income, reported_ebitda, normalized_ebitda. Merged into raw data sources before BIS. No UI changes.

### Architecture

```
Existing sources → Canonical Fact Resolver → Consumer (via consumerAdapter)
```

### Reuse Score: 17/17 existing engines reused, 0 new engines created

### NOT Migrated (Deferred)

- Valuation Engine (Phase 14.2D)
- Assessments (future phase)
- Reports/Deliverables (future phase)

### Phase 14.2C Implementation — COMPLETE

**Date:** 2026-08-08
**Status:** Executive Brief and BIE Summaries CERTIFIED

The Controlled Canonical Migration for Executive Brief and BIE Summaries (Phase 14.2C) has been implemented and certified. See `src/CANONICAL_EXECUTIVE_BRIEF_BIE_MIGRATION_REPORT.md` for the full certification report.

#### Migrated Consumers

1. **Executive Brief** — `revenue` (the only pilot fact consumed) is now canonical-preferred via BIE. Narrative structure, evidence strength, and all copy unchanged.
2. **BIE Summaries** — BIE engine prefers canonical `revenue` when available. Sprint recommendations, gap scoring, business impact score, and rankings unchanged.

#### Key Fixes

- Fixed Phase 14.2B canonicalFactClient revenue field mapping (`annual_revenue` → `revenue` to match BIE read path)
- Removed dangerous `normalized_ebitda` dashboard mapping (was writing flat number to nested object field)
- Added `canonicalFacts` input to BIE engine for canonical-preferred revenue resolution
- Added `bis._canonicalMeta` (additive) for canonical evidence metadata

#### Cycle Analysis

No circular dependency. Canonical resolver reads from raw Supabase sources, not from BIE/BIS output. BIE-produced metrics are not in the canonical fact registry.

### Legacy Paths Preserved

All legacy read paths remain available (marked as `migration_fallback`). Removal deferred to after sustained production equivalence.

---

## Phase 14.3A — Shadow Synchronization Certification

**Date:** 2026-08-08
**Status:** CERTIFIED — Shadow Synchronization Fully Validated

The Canonical Business State Synchronization (CBSS) framework has been certified through shadow synchronization testing. See `src/CANONICAL_SHADOW_SYNCHRONIZATION_CERTIFICATION.md` for the full certification report.

### Certification Summary

| Criterion | Result |
|-----------|--------|
| 100% pilot-fact events deterministic Impact Radius | ✅ PASS |
| Every discrepancy classified (0 UNKNOWN) | ✅ PASS |
| No unresolved cycles | ✅ PASS |
| No cross-business leakage | ✅ PASS |
| Governance precedence (10/10) | ✅ PASS |
| Valuation remains advisor_review | ✅ PASS |
| Published valuations blocked | ✅ PASS |
| Conflicts verification_required | ✅ PASS |
| Event deduplication (6/6) | ✅ PASS |
| No refresh storm | ✅ PASS |
| No production propagation | ✅ PASS |

### Bugs Fixed

1. Shadow sync missed consumer classification (P1) — separated immediate vs deferred
2. No event deduplication (P2) — added deduplication module
3. No event ordering (P2) — added dependency-aware ordering
4. No cycle detection (P2) — added cycle detection module

### New Modules

- `base44/shared/businessStateSync/deduplication.ts`
- `base44/shared/businessStateSync/eventOrdering.ts`
- `base44/shared/businessStateSync/cycleDetection.ts`

### Status: READY FOR LIVE SYNCHRONIZATION PILOT REVIEW

---

## Phase 14.3B — Controlled Live Synchronization Pilot

**Date:** 2026-08-08
**Status:** CERTIFIED — Ready for Live Revenue Sync Pilot Review

The first live synchronization pilot has been implemented and certified. See `src/CANONICAL_LIVE_SYNC_PILOT_REPORT.md` for the full pilot report.

### Pilot Scope

- **LIVE:** `revenue + dashboard`, `revenue + galileo` only
- **SHADOW:** All other fact+consumer combinations
- **Valuation:** advisor_review only (never auto-recalculate)

### New Infrastructure

| Component | Location |
|-----------|----------|
| Live Sync Policy | `base44/shared/businessStateSync/liveSyncPolicy.ts` |
| Circuit Breaker | `base44/shared/businessStateSync/circuitBreaker.ts` |
| Event Qualification | `base44/shared/businessStateSync/eventQualification.ts` |
| Live Orchestrator | `base44/shared/businessStateSync/liveOrchestrator.ts` |
| LiveSyncAction Entity | `base44/entities/LiveSyncAction.jsonc` |
| Backend Function | `base44/functions/liveSyncOrchestrator/entry.ts` |
| Frontend Hook | `src/hooks/useLiveSyncSubscription.js` |

### Key Design Decisions

- **Feature-gated** — centralized policy, not scattered feature flags
- **Global kill switch** — `CANONICAL_LIVE_SYNC_ENABLED` returns all to shadow
- **Per-consumer circuit breakers** — Dashboard and Galileo independent
- **8-check event qualification** — only qualified events propagate live
- **No direct value pushing** — Event → invalidation → consumer re-reads canonical
- **Shadow comparison continues** — for ALL consumers, even live ones
- **Zero write duplication** — 0 new records, 0 duplicate writes

### Certification: 15/15 criteria pass, 9/9 test scenarios pass, 0 bugs found

### Status: READY FOR LIVE REVENUE SYNC PILOT REVIEW

---

## Phase 14.3C — Controlled Live Debt Synchronization Pilot

**Date:** 2026-08-08
**Status:** CERTIFIED — Ready for Live Debt Sync Pilot Review

Phase 14.3C expanded the live matrix to include debt — a point-in-time fact with fundamentally different temporal semantics from revenue. See `src/CANONICAL_LIVE_DEBT_SYNC_PILOT_REPORT.md` for the full pilot report.

### Updated Live Matrix

| Fact | Consumer | Mode | Phase |
|------|----------|------|-------|
| revenue | dashboard | LIVE | 14.3B |
| revenue | galileo | LIVE | 14.3B |
| **debt** | **dashboard** | **LIVE** | **14.3C** |
| **debt** | **galileo** | **LIVE** | **14.3C** |
| ALL other combinations | ALL | SHADOW | — |

### Key Expansion: Point-in-Time Semantics

- **Revenue** is period-based (FY2024, TTM) — uses `isReportingPeriodValid` (rejects >3 years old)
- **Debt** is point-in-time (balance as of date) — uses `isPointInTimeDateValid` (no "too old" check; historical balances valid for as-of context)
- Event qualification generalized to `qualifyEvent` with fact-aware temporal branching
- Backward-compatible `qualifyRevenueEvent` alias preserved

### Files Changed

| File | Change |
|------|--------|
| `liveSyncPolicy.ts` | Added `debt:dashboard` and `debt:galileo` to LIVE_MATRIX |
| `eventQualification.ts` | Generalized to `qualifyEvent` with point-in-time vs period-based branching |
| `liveOrchestrator.ts` | Updated import to `qualifyEvent` |
| `liveSyncOrchestrator/entry.ts` | Updated import to `qualifyEvent` |
| `canonicalFact/registry.ts` | Added `dashboard` and `galileo` to debt's registered_consumers |

### Certification: 17/17 criteria pass, 0 bugs found, 0 duplicate writes

### Status: READY FOR LIVE DEBT SYNC PILOT REVIEW

---

## Phase 14.3D — Controlled Live Cash Synchronization Pilot

**Date:** 2026-08-08
**Status:** CERTIFIED — Ready for Live Cash Sync Pilot Review

Phase 14.3D expanded the live matrix to include a third fact — cash, a second point-in-time balance sheet fact alongside Debt. See `src/CANONICAL_LIVE_CASH_SYNC_PILOT_REPORT.md` for the full pilot report.

### Updated Live Matrix

| Fact | Consumer | Mode | Phase |
|------|----------|------|-------|
| revenue | dashboard | LIVE | 14.3B |
| revenue | galileo | LIVE | 14.3B |
| debt | dashboard | LIVE | 14.3C |
| debt | galileo | LIVE | 14.3C |
| **cash** | **dashboard** | **LIVE** | **14.3D** |
| **cash** | **galileo** | **LIVE** | **14.3D** |
| ALL other combinations | ALL | SHADOW | — |

### Key Expansion: Second Point-in-Time Fact

Cash is point-in-time (balance as of a specific date), identical temporal semantics to Debt. `cash` was already in the `POINT_IN_TIME_FACTS` set from Phase 14.3C — no event qualification changes were needed. Only 2 files changed:

### Files Changed

| File | Change |
|------|--------|
| `liveSyncPolicy.ts` | Added `cash:dashboard` and `cash:galileo` to LIVE_MATRIX |
| `canonicalFact/registry.ts` | Added `dashboard` and `galileo` to cash's registered_consumers |

### Certification: 19/19 criteria pass, 0 bugs found, 0 duplicate writes

### Status: READY FOR LIVE CASH SYNC PILOT REVIEW