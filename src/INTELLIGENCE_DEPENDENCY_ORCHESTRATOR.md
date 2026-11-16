# Intelligence Dependency Orchestrator (IDO) — Phase 14.4B

**Date:** 2026-08-10
**Status:** Blueprint Only — No Implementation
**Governing Document:** `src/VISION_PLATFORM_ARCHITECTURE_CONTRACT.md` (Phase 14.5)
**Mission:** Define the coordination layer that determines what must happen when canonical business facts or derived facts change. IDO coordinates existing certified engines. It never calculates. It never owns truth.

---

## 0. Governing Principles

IDO is NOT a calculation engine.
IDO is NOT a synchronization engine.
IDO is NOT a propagation engine.
IDO does NOT own business facts.
IDO does NOT own formulas.

**IDO coordinates existing certified engines.**

- Never duplicate calculations.
- Never replace certified engines.
- Never redesign UI.
- Never migrate Valuation.
- Never execute orchestration (this phase is blueprint only).

---

## PART 1 — DEPENDENCY EXECUTION PLAN

### 1.1 Execution Plan Structure

When a canonical or derived fact changes, IDO produces a **Dependency Execution Plan** — an ordered list of actions that must happen, routed to the correct certified owner engine.

```typescript
interface DependencyExecutionPlan {
  plan_id: string;
  trigger_fact_key: string;          // The fact that changed
  trigger_change_type: 'source_updated' | 'derived_recalculated' | 'advisor_override' | 'conflict_detected';
  business_id: string;

  // ── Ordered execution steps ──
  steps: ExecutionStep[];

  // ── Plan metadata ──
  total_steps: number;
  automatic_steps: number;
  advisor_review_steps: number;
  blocked_steps: number;
  estimated_review_time_minutes: number;
  confidence: number;                // 0-100 confidence in the plan itself
}

interface ExecutionStep {
  step_number: number;               // Execution order (dependency-aware)
  fact_key: string;                  // Derived fact to act on
  owner_engine: EngineId;            // The ONE certified engine that owns this fact
  action: OrchestrationAction;       // What must happen
  inputs: string[];                  // Facts this step depends on
  outputs: string[];                 // Facts this step produces
  stale_rule: StaleRule;             // When this step becomes stale
  review_required: boolean;          // Does this require advisor review?
  blocking_conditions: string[];    // What blocks this step
  propagation_eligibility: PropagationEligibility;
}
```

### 1.2 Execution Plan Example: Revenue Changes

**Trigger:** Revenue updated from $1.2M → $1.25M (verified, confidence 95)

```
PLAN: revenue_updated_biz_123

Step 1: gross_margin
  Owner: BIE Engine
  Action: Recalculate
  Inputs: [revenue, gross_profit]
  Outputs: [gross_margin]
  Stale: When revenue OR gross_profit changes
  Review: No
  Blocking: None
  Eligibility: automatic

Step 2: reported_ebitda
  Owner: Valuation Engine
  Action: Mark stale (advisor review)
  Inputs: [net_income, add_backs]
  Outputs: [reported_ebitda]
  Stale: When net_income OR add_backs changes
  Review: Yes (advisor approves add-backs)
  Blocking: Unverified add-backs
  Eligibility: advisor_review

Step 3: normalized_ebitda
  Owner: Valuation Engine
  Action: Mark stale (advisor review)
  Inputs: [net_income, owner_compensation, add_backs]
  Outputs: [normalized_ebitda]
  Stale: When inputs change
  Review: Yes
  Blocking: Unverified inputs, governance lock
  Eligibility: advisor_review

Step 4: enterprise_value
  Owner: Valuation Engine
  Action: Mark stale (advisor review)
  Inputs: [normalized_ebitda, valuation_multiple, dcf_value, cap_earnings_value]
  Outputs: [enterprise_value]
  Stale: When inputs change
  Review: Yes (advisor publishes)
  Blocking: Unpublished prior version, governance lock
  Eligibility: advisor_review

Step 5: equity_value
  Owner: Valuation Engine
  Action: Mark stale (advisor review)
  Inputs: [enterprise_value, cash, debt]
  Outputs: [equity_value]
  Stale: When inputs change
  Review: Yes
  Blocking: Enterprise value not recalculated
  Eligibility: advisor_review

Step 6: profit_gap_amount
  Owner: Profit Gap Assessment
  Action: Recalculate (if assessment inputs changed)
  Inputs: [revenue, profit_score, benchmarks]
  Outputs: [profit_gap_amount]
  Stale: When revenue OR profit_score changes
  Review: No (deterministic from inputs)
  Blocking: None
  Eligibility: automatic

Step 7: iq_score
  Owner: BIE Engine
  Action: Recalculate
  Inputs: [profit_score, value_gap_amount, tax_gap_annual, operations_score, freedom_score, recast_add_backs]
  Outputs: [iq_score]
  Stale: When any input changes
  Review: No
  Blocking: None
  Eligibility: automatic

Step 8: business_impact_score
  Owner: BIE Engine
  Action: Recalculate
  Inputs: [profit_gap_amount, value_gap_amount, tax_gap_annual, operations_score, freedom_score, iq_score]
  Outputs: [business_impact_score]
  Stale: When any input changes
  Review: No
  Blocking: None
  Eligibility: automatic

Step 9: growth_initiatives
  Owner: Growth Plan Engine
  Action: Mark stale (advisor review)
  Inputs: [enterprise_value, normalized_ebitda, value_drivers, detractors]
  Outputs: [growth_initiatives]
  Stale: When enterprise_value OR normalized_ebitda changes
  Review: Yes (advisor approves initiatives)
  Blocking: Enterprise value not recalculated
  Eligibility: advisor_review

Step 10: next_best_action
  Owner: NBA Engine
  Action: Recalculate
  Inputs: [gap_amounts, assessment_completion, sprint_status]
  Outputs: [next_best_action]
  Stale: When inputs change
  Review: No
  Blocking: None
  Eligibility: automatic
```

### 1.3 Execution Order Rules

```
RULE 1: Dependency-aware ordering
  - Steps execute in topological order (dependencies first)
  - Reuses existing eventOrdering module (Phase 14.3A)

RULE 2: Owner-only execution
  - Each step is routed to its ONE certified owner engine
  - No other engine may execute the step

RULE 3: Parallel where independent
  - Steps with no dependency relationship execute in parallel
  - Example: gross_margin (BIE) and profit_gap_amount (Assessment) are independent

RULE 4: Valuation always sequential + advisor review
  - Valuation chain (normalized_ebitda → enterprise_value → equity_value) is sequential
  - Each step requires advisor review before the next

RULE 5: Blocked steps halt the chain
  - If a step is blocked, downstream steps in its chain are also blocked
  - Independent chains continue
```

### 1.4 Stale Rules Catalog

| Fact | Stale When | Reuse |
|------|-----------|-------|
| gross_margin | revenue OR gross_profit changes | IntelligenceGraph |
| reported_ebitda | net_income OR add_backs changes | stalenessMap |
| normalized_ebitda | net_income, owner_compensation, OR add_backs changes | stalenessMap |
| enterprise_value | normalized_ebitda, multiple, dcf, OR cap_earnings changes | stalenessMap |
| equity_value | enterprise_value, cash, OR debt changes | stalenessMap |
| iq_score | any of 6 inputs change | IntelligenceGraph |
| business_impact_score | any of 6 inputs change | IntelligenceGraph |
| profit_gap_amount | revenue OR profit_score changes | IntelligenceGraph |
| growth_initiatives | enterprise_value OR normalized_ebitda changes | stalenessMap |
| confidence scores | source data changes | stalenessMap |

---

## PART 2 — ORCHESTRATION STATES

### 2.1 State Definitions

Every dependency transition classifies itself into exactly one state:

| State | Meaning | Action Taken | Owner | Example |
|-------|---------|-------------|-------|---------|
| **no_action** | No change detected — fact is current | None | N/A | Revenue unchanged → no downstream action |
| **refresh** | Re-read canonical value (no recalculation) | Invalidate + re-read | Consumer (Dashboard/Galileo) | Canonical revenue updated → Dashboard re-reads |
| **recalculate** | Recalculate using certified engine | Engine recalculates | Calculation owner | IQ Score inputs changed → BIE recalculates |
| **advisor_review** | Requires advisor approval before propagation | Mark stale + notify | Valuation/Growth Plan | Normalized EBITDA changed → advisor reviews |
| **verification_required** | Route to Verification Queue | Queue item created | Verification Queue | Conflict detected → route to Verify |
| **blocked** | Cannot proceed — blocker exists | Surface blocker + halt | Governance | Governance lock active → blocked |
| **deferred** | Waiting for upstream step to complete | Wait | Orchestrator | Equity Value waiting for Enterprise Value |
| **shadow** | Recorded for observation, no action | Record only | Shadow Sync | Non-pilot fact in shadow mode |

### 2.2 State Transition Rules

```
SOURCE FACT CHANGE
    │
    ▼
[no_action] ── if no change detected ──→ DONE
    │
    ▼ (change detected)
    │
    ├── Is this a pilot live fact+consumer? (Phase 14.3D)
    │   ├── YES → [refresh] ── consumer re-reads canonical ──→ DONE
    │   └── NO → continue
    │
    ▼
    │
    ├── Is there a conflict?
    │   ├── YES → [verification_required] ── route to Verify Queue ──→ DONE
    │   └── NO → continue
    │
    ▼
    │
    ├── Is there a governance lock or blocker?
    │   ├── YES → [blocked] ── surface blocker ──→ DONE
    │   └── NO → continue
    │
    ▼
    │
    ├── Is this a derived fact?
    │   ├── YES → classify derived fact:
    │   │   ├── BIE composite (iq_score, etc.) → [recalculate] ── BIE recalculates ──→ DONE
    │   │   ├── Assessment output → [recalculate] ── Assessment recalculates ──→ DONE
    │   │   ├── Valuation output → [advisor_review] ── mark stale + notify ──→ DONE
    │   │   ├── Growth Plan → [advisor_review] ── mark stale + notify ──→ DONE
    │   │   └── Confidence → [recalculate] ── Confidence Engine recalculates ──→ DONE
    │   └── NO → [shadow] ── record only ──→ DONE
    │
    ▼
    │
    └── Is upstream step incomplete?
        ├── YES → [deferred] ── wait ──→ re-evaluate when upstream completes
        └── NO → execute action
```

### 2.3 State Classification per Derived Fact

| Derived Fact | Default State | Reuse |
|-------------|---------------|-------|
| gross_margin | recalculate (automatic) | BIE Engine |
| monthly_take_home | recalculate (automatic) | BIE Engine |
| tax_gap_ten_year | recalculate (automatic) | BIE Engine |
| hourly_value_of_time_freed | recalculate (automatic) | BIE Engine |
| monthly_value_of_time_freed | recalculate (automatic) | BIE Engine |
| iq_score | recalculate (automatic) | BIE Engine |
| business_impact_score | recalculate (automatic) | BIE Engine |
| profit_gap_amount | recalculate (automatic) | Assessment Engine |
| value_gap_amount | recalculate (automatic) | Assessment Engine |
| tax_gap_annual | recalculate (automatic) | Assessment Engine |
| operations_score | recalculate (automatic) | Assessment Engine |
| freedom_score | recalculate (automatic) | Assessment Engine |
| profit_score | recalculate (automatic) | Assessment Engine |
| recast_valuation_increase | recalculate (automatic) | Assessment Engine |
| financial_quality_score | recalculate (automatic) | Build Value Engine |
| growth_quality_score | recalculate (automatic) | Build Value Engine |
| commercial_quality_score | recalculate (automatic) | Build Value Engine |
| operational_quality_score | recalculate (automatic) | Build Value Engine |
| leadership_transferability_score | recalculate (automatic) | Build Value Engine |
| risk_governance_score | recalculate (automatic) | Build Value Engine |
| overall_confidence_score | recalculate (automatic) | Confidence Engine |
| data_confidence | recalculate (automatic) | Confidence Engine |
| earnings_confidence | recalculate (automatic) | Confidence Engine |
| market_confidence | recalculate (automatic) | Confidence Engine |
| operational_confidence | recalculate (automatic) | Confidence Engine |
| forecast_confidence | recalculate (automatic) | Confidence Engine |
| sprint_progress | recalculate (automatic) | Sprint Aggregation |
| next_best_action | recalculate (automatic) | NBA Engine |
| document_completeness | recalculate (automatic) | Intelligence Engine |
| verification_status | recalculate (automatic) | Intelligence Engine |
| field_confidence | recalculate (automatic) | Intelligence Engine |
| reported_ebitda | advisor_review | Valuation Engine |
| normalized_ebitda | advisor_review | Valuation Engine |
| enterprise_value | advisor_review | Valuation Engine |
| equity_value | advisor_review | Valuation Engine |
| dcf_value | advisor_review | Valuation Engine |
| cap_earnings_value | advisor_review | Valuation Engine |
| adjusted_net_asset_value | advisor_review | Valuation Engine |
| growth_initiatives | advisor_review | Growth Plan Engine |

---

## PART 3 — ENGINE OWNERSHIP

### 3.1 Certified Owner Engines

| Engine ID | Engine Name | Location | Certified Phase | Owns |
|-----------|-------------|----------|-----------------|------|
| `bie_engine` | Business Intelligence Engine | `src/lib/bie/engine.js` | Phase 9 | BIE composite metrics |
| `valuation_engine` | Valuation Calculation Engine | `base44/functions/valuationCalculationEngine/entry.ts` | Phase 13.3 | Valuation derived facts |
| `assessment_engine` | Assessment Calculations | `src/lib/assessmentCalculations.js` | Phase 3 | Assessment outputs |
| `build_value_engine` | Build Value Engine | `src/lib/valuation/buildValueEngine.js` | Phase 13.3E | Business quality dimensions |
| `confidence_engine` | Confidence Engine | `base44/shared/valuationEngine/confidenceEngine.ts` | Phase 13.3 | Confidence scores |
| `growth_plan_engine` | Growth Plan Engine | `src/lib/valuation/growthPlanEngine.js` | Phase 13.2 | Growth initiatives |
| `intelligence_engine` | Intelligence Engine | `base44/shared/valuationEngine/intelligenceEngine.ts` | Phase 13.3 | Document/verification facts |
| `nba_engine` | Next Best Action Engine | `src/lib/nbaRecommendations.js` | Phase 10 | Next best action |
| `sprint_aggregation` | Sprint Aggregation | `src/lib/sprintAdapter.js` | Phase 11 | Sprint progress |
| `executive_brief_engine` | Executive Narrative Engine | `src/lib/executiveNarrativeEngine.js` | Phase 9 | Executive brief (display only) |
| `galileo_context_engine` | Galileo Context Builder | `base44/functions/buildGalileoContext/entry.ts` | Phase 13.4A | Galileo context (display only) |

### 3.2 Ownership Routing Rules

```
RULE 1: Every dependency routes to exactly ONE owner engine.
  - IDO never decides which engine to call — the ownership registry is declarative.

RULE 2: IDO never calls an engine directly during this phase.
  - This phase is blueprint only.
  - Future phases (14.4C+) will wire execution.

RULE 3: Display engines (Executive Brief, Galileo Context) are NOT calculation owners.
  - They consume derived facts produced by calculation owners.
  - They never recalculate.

RULE 4: Valuation Engine is always advisor_review.
  - IDO never triggers automatic Valuation recalculation.
  - Valuation always requires advisor approval.

RULE 5: BIE Engine is always automatic.
  - BIE composites are deterministic from certified inputs.
  - No advisor judgment in the calculation.

RULE 6: Assessment Engine is automatic (from inputs).
  - Assessment outputs are deterministic from answers + benchmarks.

RULE 7: Confidence Engine is automatic.
  - Confidence is deterministic from source data quality.

RULE 8: Build Value Engine is automatic.
  - Dimension scores are deterministic from evidence.
```

### 3.3 Ownership Conflict Resolution

| Scenario | Resolution |
|----------|-----------|
| Two engines claim ownership of same derived fact | ❌ Not allowed — ownership registry is authoritative |
| IDO tries to calculate directly | ❌ Not allowed — IDO only coordinates |
| Owner engine unavailable | Defer step (state = deferred) — do NOT substitute |
| New derived fact added | Must declare exactly ONE owner before activation |

---

## PART 4 — IMPACT PREDICTION

### 4.1 Prediction Model

Given any business fact change, IDO predicts the downstream impact — **without performing any calculations**. Prediction is metadata only.

```typescript
interface ImpactPrediction {
  trigger_fact_key: string;
  trigger_change_summary: string;     // "Revenue: $1.2M → $1.25M"

  // ── Affected facts (derived facts that will become stale) ──
  affected_facts: AffectedFact[];

  // ── Affected engines (engines that must act) ──
  affected_engines: EngineId[];

  // ── Affected consumers (systems that display/use the facts) ──
  affected_consumers: ConsumerId[];

  // ── Prediction metadata ──
  estimated_review_time_minutes: number;
  confidence: number;                  // 0-100 confidence in prediction
  business_impact: 'low' | 'medium' | 'high' | 'critical';
}

interface AffectedFact {
  fact_key: string;
  owner_engine: EngineId;
  action: OrchestrationAction;
  state: OrchestrationState;
  review_required: boolean;
  estimated_refresh_ms: number;
}
```

### 4.2 Prediction Algorithm

```
INPUT: Fact X changed
    │
    ▼
1. Walk dependency graph downward from X
   (IntelligenceGraph.getDescendants — existing certified function)
    │
    ▼
2. For each descendant:
   ├── Classify state (Part 2)
   ├── Identify owner engine (Part 3)
   └── Estimate refresh time (from historical telemetry)
    │
    ▼
3. Collect affected engines (unique owner engine IDs)
    │
    ▼
4. Collect affected consumers (from consumer registry)
    │
    ▼
5. Estimate total review time:
   ├── Sum of advisor_review steps × average review time
   └── Automatic steps contribute 0 minutes
    │
    ▼
6. Classify business impact:
   ├── critical: Valuation outputs affected + advisor review required
   ├── high: IQ Score or Business Impact Score affected
   ├── medium: Multiple derived facts affected, no valuation
   └── low: Single derived fact, no downstream
    │
    ▼
7. Return prediction (metadata only — no calculations performed)
```

### 4.3 Prediction Examples

#### Example 1: Revenue Changes

```yaml
trigger: revenue
change: "$1.2M → $1.25M (verified, confidence 95)"

affected_facts:
  - fact_key: gross_margin
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false
    refresh_ms: 50

  - fact_key: reported_ebitda
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true
    refresh_ms: 0

  - fact_key: normalized_ebitda
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true
    refresh_ms: 0

  - fact_key: enterprise_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true
    refresh_ms: 0

  - fact_key: equity_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true
    refresh_ms: 0

  - fact_key: profit_gap_amount
    owner: assessment_engine
    action: recalculate
    state: recalculate
    review: false
    refresh_ms: 100

  - fact_key: iq_score
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false
    refresh_ms: 50

  - fact_key: business_impact_score
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false
    refresh_ms: 50

  - fact_key: growth_initiatives
    owner: growth_plan_engine
    action: mark_stale
    state: advisor_review
    review: true
    refresh_ms: 0

  - fact_key: next_best_action
    owner: nba_engine
    action: recalculate
    state: recalculate
    review: false
    refresh_ms: 100

affected_engines:
  - bie_engine
  - valuation_engine
  - assessment_engine
  - growth_plan_engine
  - nba_engine

affected_consumers:
  - dashboard
  - executive_brief
  - galileo
  - reports
  - growth_plan
  - sprint

estimated_review_time_minutes: 15
confidence: 95
business_impact: critical
```

#### Example 2: Operations Score Changes

```yaml
trigger: operations_score
change: "55 → 65 (assessment completed)"

affected_facts:
  - fact_key: iq_score
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false

  - fact_key: business_impact_score
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false

  - fact_key: operational_quality_score
    owner: build_value_engine
    action: recalculate
    state: recalculate
    review: false

  - fact_key: operational_confidence
    owner: confidence_engine
    action: recalculate
    state: recalculate
    review: false

  - fact_key: next_best_action
    owner: nba_engine
    action: recalculate
    state: recalculate
    review: false

affected_engines:
  - bie_engine
  - build_value_engine
  - confidence_engine
  - nba_engine

affected_consumers:
  - dashboard
  - executive_brief
  - galileo

estimated_review_time_minutes: 0
confidence: 90
business_impact: medium
```

#### Example 3: Discount Rate Changes

```yaml
trigger: discount_rate
change: "12% → 14% (advisor entry)"

affected_facts:
  - fact_key: dcf_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact_key: enterprise_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact_key: equity_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact_key: growth_initiatives
    owner: growth_plan_engine
    action: mark_stale
    state: advisor_review
    review: true

affected_engines:
  - valuation_engine
  - growth_plan_engine

affected_consumers:
  - dashboard
  - reports
  - growth_plan

estimated_review_time_minutes: 25
confidence: 95
business_impact: critical
```

### 4.4 Prediction Reuse

| Component | Role | New Code? |
|-----------|------|-----------|
| IntelligenceGraph.getDescendants | Walk dependency graph downward | ❌ Reused |
| stalenessMap.getAffectedCalculations | Valuation staleness | ❌ Reused |
| governance.classifyPropagation | State classification | ❌ Reused |
| Consumer registry | Affected consumers | ❌ Reused |

**Reuse score: 4/4 existing modules reused. 0 new prediction modules created.**

---

## PART 5 — ADVISOR PREVIEW

### 5.1 Preview Model

IDO supports a preview model that shows advisors what would happen if a fact changes — **before** any action is taken. No UI. No implementation. This is a data model only.

```typescript
interface AdvisorPreview {
  preview_id: string;
  scenario: string;                   // "If Revenue changes to $1.5M..."

  // ── Downstream effects ──
  downstream_effects: DownstreamEffect[];

  // ── Required advisor actions ──
  required_actions: AdvisorAction[];

  // ── Blocked items ──
  blocked_items: BlockedItem[];

  // ── Verification requirements ──
  verification_requirements: VerificationRequirement[];

  // ── Summary ──
  summary: {
    total_affected: number;
    automatic_updates: number;
    advisor_reviews_required: number;
    blocked_count: number;
    estimated_time_minutes: number;
  };
}

interface DownstreamEffect {
  fact_key: string;
  owner_engine: EngineId;
  action: OrchestrationAction;
  state: OrchestrationState;
  review_required: boolean;
}

interface AdvisorAction {
  fact_key: string;
  action_type: 'review' | 'approve' | 'publish' | 'resolve_conflict';
  description: string;
  estimated_time_minutes: number;
}

interface BlockedItem {
  fact_key: string;
  blocker: string;
  resolution: string;
}

interface VerificationRequirement {
  fact_key: string;
  reason: string;
  queue: string;
}
```

### 5.2 Preview Example

**Scenario:** "If Revenue changes to $1.5M..."

```yaml
preview_id: preview_revenue_1_5M
scenario: "If Revenue changes to $1.5M..."

downstream_effects:
  - fact: gross_margin
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false

  - fact: reported_ebitda
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact: normalized_ebitda
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact: enterprise_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact: equity_value
    owner: valuation_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact: profit_gap_amount
    owner: assessment_engine
    action: recalculate
    state: recalculate
    review: false

  - fact: iq_score
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false

  - fact: business_impact_score
    owner: bie_engine
    action: recalculate
    state: recalculate
    review: false

  - fact: growth_initiatives
    owner: growth_plan_engine
    action: mark_stale
    state: advisor_review
    review: true

  - fact: next_best_action
    owner: nba_engine
    action: recalculate
    state: recalculate
    review: false

required_actions:
  - fact: reported_ebitda
    action: review
    description: "Review reported EBITDA — add-backs may need re-evaluation"
    time: 5

  - fact: normalized_ebitda
    action: approve
    description: "Approve normalized EBITDA recalculation"
    time: 5

  - fact: enterprise_value
    action: publish
    description: "Review and publish new enterprise value"
    time: 10

  - fact: growth_initiatives
    action: review
    description: "Review growth initiatives — new value may change priorities"
    time: 5

blocked_items:
  - fact: enterprise_value
    blocker: "Prior published version exists"
    resolution: "Create new version (existing version remains immutable)"

  - fact: growth_initiatives
    blocker: "Enterprise value not yet recalculated"
    resolution: "Approve enterprise value first"

verification_requirements:
  - fact: revenue
    reason: "Material change from $1.2M to $1.5M (25% increase)"
    queue: "verification_queue"

summary:
  total_affected: 10
  automatic_updates: 5
  advisor_reviews_required: 5
  blocked_count: 2
  estimated_time_minutes: 25
```

### 5.3 Preview Rules

```
RULE 1: Preview is non-mutating.
  - No facts are changed.
  - No engines are called.
  - No state is persisted.

RULE 2: Preview is metadata only.
  - Returns affected facts, actions, blockers, verification.
  - Does NOT return calculated values.

RULE 3: Preview reuses the dependency graph.
  - IntelligenceGraph.getDescendants for traversal.
  - stalenessMap for valuation chain.
  - governance.classifyPropagation for state.

RULE 4: Preview is advisor-facing (future UI).
  - This phase defines the data model only.
  - No UI is built.

RULE 5: Preview respects governance.
  - Valuation always shows as advisor_review.
  - Conflicts show as verification_required.
  - Locks show as blocked.
```

---

## PART 6 — ROADMAP

### 6.1 Phase Sequence

```
PHASE 14.4A — Derived Fact Framework (COMPLETE)
  - Inventory derived facts
  - Dependency graph
  - Ownership registry
  - Dependency contracts

PHASE 14.4B — Intelligence Dependency Orchestrator (THIS PHASE)
  - Execution plan model
  - Orchestration states
  - Engine ownership routing
  - Impact prediction model
  - Advisor preview model
  - Output: This report (blueprint only — no implementation)

PHASE 14.4C — IDO Registry Implementation (FUTURE)
  - Implement the orchestration registry as configuration
  - Map each derived fact to its execution plan
  - Wire to existing IntelligenceGraph + stalenessMap + governance
  - Output: Declarative registry (no execution yet)

PHASE 14.4D — Controlled IDO Pilot (FUTURE)
  - Pilot: orchestrate BIE-only derived facts (shadow mode)
  - Observe execution plans without acting
  - Compare predicted vs actual stale marking
  - Output: Shadow orchestration for 2-3 BIE derived facts

PHASE 14.4E — IDO Live Pilot (FUTURE)
  - Enable live orchestration for BIE automatic derived facts
  - Valuation remains advisor_review (never automatic)
  - Growth Plan remains advisor_review
  - Output: Live orchestration for automatic derived facts only

PHASE 14.4F — Advisor Preview UI (FUTURE)
  - Build preview UI for advisors
  - "If X changes..." scenarios
  - No calculation — display only
  - Output: Advisor-facing preview component
```

### 6.2 What This Phase Does NOT Do

| Action | Status |
|--------|--------|
| Execute orchestration | ❌ NOT done |
| Call any engine | ❌ NOT done |
| Implement the registry | ❌ NOT done |
| Build preview UI | ❌ NOT done |
| Enable Valuation | ❌ NOT done |
| Modify formulas | ❌ NOT done |
| Migrate Valuation | ❌ NOT done |
| Redesign UI | ❌ NOT done |
| Create new engines | ❌ NOT done |
| Duplicate calculations | ❌ NOT done |

### 6.3 Reuse Summary

| Existing Module | IDO Role | New Code? |
|----------------|----------|-----------|
| IntelligenceGraph | Dependency traversal | ❌ Reused |
| stalenessMap | Valuation staleness | ❌ Reused |
| governance.classifyPropagation | State classification | ❌ Reused |
| cycleDetection | Acyclicity | ❌ Reused |
| eventOrdering | Execution order | ❌ Reused |
| Consumer registry | Affected consumers | ❌ Reused |
| Ownership registry (Phase 14.4A) | Engine routing | ❌ Reused |
| BIE Engine | Owner of BIE facts | ❌ Reused |
| Valuation Engine | Owner of valuation facts | ❌ Reused |
| Assessment Engine | Owner of assessment facts | ❌ Reused |
| Build Value Engine | Owner of quality facts | ❌ Reused |
| Confidence Engine | Owner of confidence facts | ❌ Reused |
| Growth Plan Engine | Owner of growth facts | ❌ Reused |
| Intelligence Engine | Owner of verification facts | ❌ Reused |
| NBA Engine | Owner of NBA | ❌ Reused |
| Sprint Aggregation | Owner of sprint progress | ❌ Reused |

**Reuse score: 16/16 existing modules/engines reused. 0 new engines created. 0 calculations performed.**

---

## PART 7 — ARCHITECTURAL ENFORCEMENT

### 7.1 Validation Checklist

| Rule | Status | Enforcement |
|------|--------|-------------|
| IDO never calculates | ✅ | Blueprint only — no calculation logic |
| IDO never owns truth | ✅ | Ownership stays with certified engines |
| Every dependency routes to ONE owner | ✅ | Ownership registry (Phase 14.4A §4.2) |
| No duplicate calculations | ✅ | Single-owner principle |
| No UI changes | ✅ | Blueprint only |
| No Valuation migration | ✅ | Valuation remains advisor_review |
| No formula changes | ✅ | No formulas touched |
| No new engines | ✅ | 16/16 reused |
| Execution not implemented | ✅ | Deferred to 14.4C+ |
| Acyclic dependency graph | ✅ | cycleDetection (existing) |

### 7.2 Architectural Rules

```
RULE 1: IDO is a coordinator, not a calculator.
  - IDO determines WHAT must happen and WHO must do it.
  - IDO never performs the calculation itself.

RULE 2: IDO routes to exactly ONE owner engine per dependency.
  - The ownership registry (Phase 14.4A) is authoritative.
  - IDO never decides ownership — it reads it.

RULE 3: IDO classifies state using existing governance.
  - governance.classifyPropagation (Phase 14.3A) is reused.
  - No new classification logic.

RULE 4: IDO predicts impact without calculating.
  - Prediction is metadata (affected facts, engines, consumers, time).
  - No values are computed.

RULE 5: IDO preview is non-mutating.
  - Preview never changes state, never calls engines, never persists.

RULE 6: Valuation is always advisor_review.
  - IDO never classifies valuation as automatic.
  - Valuation always requires advisor approval.

RULE 7: BIE composites are always automatic.
  - IDO classifies BIE composites as recalculate (automatic).
  - No advisor judgment in BIE calculations.

RULE 8: IDO respects blocking conditions.
  - Blocked steps halt their chain.
  - Independent chains continue.

RULE 9: IDO execution order is dependency-aware.
  - Topological order (dependencies first).
  - Parallel where independent.

RULE 10: IDO never replaces certified engines.
  - All 11 certified engines remain authoritative.
  - IDO coordinates — it does not replace.
```

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Dependency execution plan defined | ✅ Part 1 |
| Orchestration states defined (8 states) | ✅ Part 2 |
| Engine ownership documented (11 engines) | ✅ Part 3 |
| Impact prediction model defined | ✅ Part 4 |
| Advisor preview model defined | ✅ Part 5 |
| Roadmap defined (6 phases) | ✅ Part 6 |
| No orchestration executed | ✅ |
| No engines called | ✅ |
| No formulas modified | ✅ |
| No UI changed | ✅ |
| No Valuation migrated | ✅ |
| No new engines created | ✅ 16/16 reused |
| No duplicate calculations | ✅ |
| Report created | ✅ This document |

---

## READY FOR IDO REVIEW