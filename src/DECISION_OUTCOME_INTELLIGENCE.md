# Decision Outcome Intelligence — Phase D.1

**Date:** 2026-08-14
**Status:** CERTIFIED
**Authority:** Article XVI of the V.I.S.I.O.N. Constitution (Outcome Authority)

---

## Overview

Phase D.1 closes the decision-learning loop. Phase D structured decisions and routed them to existing execution systems. Phase D.1 answers:

- **What did we expect?**
- **What actually happened?**
- **Why?**
- **What did we learn?**
- **What should we do next?**

The outcome lifecycle:

```
BUSINESS STATE → DECISION → EXPECTED OUTCOMES → EXECUTION →
REVIEW DATE → CURRENT EVIDENCE → OUTCOME ANALYSIS →
HUMAN CONFIRMATION → ACTUAL OUTCOME → BUSINESS MEMORY / TIMELINE / NEXT ACTION
```

---

## Constitution Check

### 1. Which outcome fields already exist?

The `business_decisions` table already had all outcome fields (unused in Phase D):
- `expected_outcomes` (JSONB) — formalized in Phase D.1 with optional metric_key, baseline_value, target_value, target_direction, target_date, source, confidence, verification_method, importance
- `actual_outcomes` (JSONB) — formalized with expected_outcome_id, actual_result, metric_key, actual_value, evidence, confidence
- `outcome_status` (text, CHECK-constrained: pending, ongoing, succeeded, partially_succeeded, failed, inconclusive)
- `outcome_review_date` (date)
- `outcome_reviewed_at` (timestamptz)
- `outcome_notes` (text)

**No new table was created. No new columns were added.** Only one additive index was added for "reviews due" queries.

### 2. Which execution systems already track progress?

- Growth Plan (`growth_plan_initiatives`) — active/completed initiatives
- 90-Day Sprint (`ninety_day_sprints`) — progress_percent, status
- Roadmap (roadmap items) — implementation status
- Valuation (`business_valuations`) — current/baseline value
- Verification Queue — conflict resolution status

Outcome Intelligence **consumes** their execution evidence. It does not duplicate task completion.

### 3. Which Timeline event architecture should be reused?

`business_state_events` (event_id, title, timestamp). Outcome Intelligence queries timeline events since the decision date. No new timeline was created.

### 4. Which Business Memory contract should receive lessons?

Business Memory's existing candidate governance: AI proposes → Advisor confirms → Memory persisted. The `generateOutcomeMemoryCandidates` function produces candidates that go through the existing workflow. No new categories were created — existing categories (`strategic_decision`, `operating_philosophy`, `capital_allocation_decision`, `risk_acceptance`, `leadership_change`, `transaction_intent`) cover all outcome lesson types.

### 5. Which existing scheduling/reminder capability can surface reviews?

The `listReviewsDue` backend action returns decisions with DUE/OVERDUE review states. Meeting Intelligence and Living Intelligence can call this to surface reviews in their existing prioritization/brief frameworks. No new scheduler was built.

### 6. Is any outcome-review logic already present?

No. The outcome fields existed but were never populated or read. Phase D.1 is the first implementation.

### 7. Would any proposed feature duplicate an existing owner?

No:
- Current truth → Shared Intelligence Contract (consumed, not recalculated)
- Durable context → Business Memory (candidates through existing governance)
- Events → Business Timeline (existing `business_state_events`)
- Execution → Growth Plan, Sprint, Roadmap (consumed, not duplicated)
- Value creation → existing `value_creation_events` process (not auto-created)

---

## Outcome Lifecycle

### Expected Outcome Contract

Each expected outcome (stored in `expected_outcomes` JSONB):

| Field | Type | Description |
|-------|------|-------------|
| outcome_id | string | Unique identifier |
| description | string | What should be different |
| success_indicator | string | How to know it worked |
| time_horizon | string | e.g. "90 days", "6 months" |
| metric_key | string (optional) | Certified metric from the Shared Contract |
| baseline_value | number (optional) | Value at decision time |
| target_value | number (optional) | Target value |
| target_direction | enum (optional) | increase, decrease, maintain, achieve |
| target_date | date (optional) | When target should be reached |
| source | string (optional) | Where the expectation came from |
| confidence | number (optional) | 0-100 |
| verification_method | string (optional) | How to verify |
| importance | enum (optional) | critical, strategic, significant, routine |

Not every expected outcome needs to be numeric. Non-numeric outcomes ("Hire COO within 120 days") use evidence from timeline, growth plan, and advisor confirmation.

### Actual Outcome Contract

Each actual outcome (stored in `actual_outcomes` JSONB):

| Field | Type | Description |
|-------|------|-------------|
| outcome_id | string | Unique identifier |
| status | OutcomeStatus | Human-confirmed status |
| description | string | What actually happened |
| reviewed_at | timestamptz | When this was reviewed |
| reviewed_by | string | Profile ID of reviewer (stamped by backend) |
| notes | string | Review notes |
| expected_outcome_id | string (optional) | Links to the expected outcome |
| actual_result | string (optional) | What actually resulted |
| metric_key | string (optional) | Metric that was tracked |
| actual_value | number (optional) | Actual value observed |
| evidence | string[] (optional) | Supporting evidence |
| confidence | number (optional) | 0-100 |

### Review Due State (Deterministic, Derived)

The review state is **derived** from existing fields, not persisted:

| State | Derivation |
|-------|-----------|
| NOT_SCHEDULED | No `outcome_review_date` and not reviewed |
| SCHEDULED | `outcome_review_date` > today + 7 days |
| DUE | `outcome_review_date` ≤ today + 7 days and ≥ today |
| OVERDUE | `outcome_review_date` < today |
| IN_REVIEW | Frontend state — user is actively reviewing |
| REVIEWED | `outcome_reviewed_at` is set |

### DecisionOutcomeContext

The `buildDecisionOutcomeContext` function composes:

- **Original decision** (immutable): title, selected option, reason, decided_at
- **Expected outcomes** (decision-time): from `expected_outcomes` JSONB
- **Decision-time evidence** (immutable): from `source_context_snapshot`
- **Decision-time assumptions** (immutable): from `source_context_snapshot`
- **Current Shared Intelligence Contract** (read-only): profitability, valuation, tax, operations
- **Execution evidence** (read-only): Growth Plan summary, Sprint summary
- **Timeline events** since decision: from `business_state_events`
- **Relevant memories**: from `business_memories`
- **Elapsed days**: computed from `decided_at`
- **Missing evidence**: derived from context gaps
- **Conflicts**: derived from contract vs expected
- **Confidence**: reflects evidence quality

### Expected vs Actual Comparison

The `compareExpectedVsActual` function produces analytical statuses (NOT human-confirmed):

| Status | Meaning |
|--------|---------|
| ACHIEVED | Current evidence meets or exceeds target |
| PARTIALLY_ACHIEVED | Progress toward target but not fully reached |
| NOT_ACHIEVED | Current evidence at or below baseline |
| TOO_EARLY | Less than 50% of time horizon has elapsed |
| UNKNOWN | Current evidence not available |
| NOT_MEASURABLE | No metric_key defined and no evidence found |

For numeric outcomes: looks up `metric_key` in the Shared Contract, compares to `target_value` and `baseline_value` using `target_direction`.

For non-numeric outcomes: uses evidence from timeline events, growth plan completion, and advisor confirmation.

### AI Outcome Analysis (Advisory Only)

The `analyzeOutcome` action calls the LLM with:
- Original decision (immutable)
- Expected outcomes
- Current evidence from the Shared Contract
- Timeline events
- Execution state

The AI returns:
- summary, what_improved, what_did_not
- expected_vs_actual comparisons
- assumptions_that_held, assumptions_that_failed
- unexpected_developments
- confidence (evidence quality, not outcome prediction)
- missing_information
- possible_lessons (Business Memory candidates)
- recommended_follow_up
- **suggested_outcome_status** (advisory — human must confirm)

**AI may NOT set the final outcome_status.**

### Human Outcome Confirmation

The `confirmOutcome` action (HUMAN ONLY):
- Requires `isAdvisorOrAdmin` (OUTCOME AUTHORITY gate)
- Sets `outcome_status` (human-confirmed)
- Sets `outcome_notes` (human notes)
- Stamps `actual_outcomes` with `reviewed_at` and `reviewed_by` (reviewer identity)
- Sets `outcome_reviewed_at` timestamp
- Generates Business Memory candidates (returned, NOT auto-persisted)

---

## Business Memory Integration

After human-confirmed outcome review, `generateOutcomeMemoryCandidates` produces:

1. **Primary outcome candidate** — maps to existing categories:
   - Failed decisions → `strategic_decision` (extremely valuable memory)
   - Financial decisions → `capital_allocation_decision`
   - Operating decisions → `operating_philosophy`
   - Talent decisions → `leadership_change`
   - Acquisition/exit decisions → `transaction_intent`
   - Risk decisions → `risk_acceptance`

2. **Lesson-specific candidates** (up to 3) — from AI analysis `possible_lessons`:
   - Category: `operating_philosophy`
   - Importance: `useful`
   - Tagged with `lesson` and `decision_outcome`

All candidates are **returned to the caller** — they are NOT automatically persisted. The advisor must confirm them through the existing Business Memory governance workflow.

---

## Timeline Integration

Outcome Intelligence **reuses** the existing Business Timeline (`business_state_events`). Potential events:
- "Decision made" (at finalization)
- "Decision review due" (when review date approaches)
- "Decision outcome confirmed" (at confirmation)

No Decision Outcome Timeline was created.

---

## Execution System Integration

Outcome Intelligence **consumes** execution evidence from existing owners:
- Growth Plan: active initiatives count
- Sprint: status, progress_percent, path_title
- Timeline: events since decision date

It does not duplicate task completion or execution tracking.

---

## Next Actions

A reviewed decision may produce a recommended next action:
- **Succeeded** → standardize the strategy
- **Partially succeeded** → adjust implementation
- **Failed** → reconsider assumptions
- **Ongoing** → schedule later review

Approved actions route into existing systems (Growth Plan, Sprint, Roadmap, Decision Intelligence). No Outcome Action Engine was created.

---

## Follow-Up Decisions

The `createFollowUpDecision` action creates a NEW linked decision:
- Sets `supersedes_decision_id` on the new decision
- Sets `superseded_by_decision_id` on the original
- Does NOT rewrite the original decision
- The original's outcome may be "inconclusive" or "superseded context"

---

## Decision Learning Loop

```
Decision A → Outcome A → Lesson A → Future Decision B
```

Future Decision Intelligence may retrieve relevant confirmed lessons through Business Memory. This is the first foundation for future Business DNA. **Business DNA is NOT implemented in this phase.**

---

## Galileo Outcome Capabilities

Three new capabilities registered in the Galileo Capability Framework:

| Capability | Description | Client-Safe |
|-----------|-------------|-------------|
| `review.decision_outcome` | Analyze how a decision turned out | Yes |
| `compare.expected_actual` | Compare expected vs actual outcomes | Yes |
| `extract.decision_lessons` | Extract durable lessons | No (advisor-only) |

All use `business_profile` context from the Shared Intelligence Contract. AI remains advisory.

---

## Meeting Intelligence Integration

Meeting Brief may surface "Decision Reviews Due" when material decisions have reached their review date. The `listReviewsDue` backend action provides the data. Meeting Intelligence links into the DecisionDrawer outcome review. No separate meeting workflow was created.

---

## Living Intelligence Integration

Living Intelligence may surface due reviews in its existing prioritization:
- "This pricing decision is ready for review."
- "The COO hiring decision has reached its 120-day outcome window."

Uses its existing intelligence budget. Does not flood the Dashboard with review reminders.

---

## Client Safety

| Layer | Advisor Internal | Client Safe |
|-------|-----------------|-------------|
| Original decision | Full record | Filtered (toClientSafeDecision) |
| Expected outcomes | All | All (agreed at decision time) |
| AI analysis | Full analysis | Filtered (toClientSafeOutcomeReview) |
| Outcome confirmation | Full | Confirmed status + notes |
| Memory candidates | Full | Filtered by client_visible |

`toClientSafeOutcomeReview` strips internal analysis, assumptions_that_failed, unexpected_developments, and internal confidence assessments. Filtering occurs before retrieval/output.

---

## Multi-Business Isolation

Outcome reviews are strictly business-scoped. `authorizeBusiness()` is called before every outcome action. A review for Business A cannot pull:
- Business B current metrics (Shared Contract is business-scoped)
- Business B Memory (query filtered by business_id)
- Business B execution data (Growth Plan, Sprint queries filtered by business_id)
- Business B Timeline (query filtered by business_id)

A→B→A isolation tested and verified.

---

## Auditability

A completed outcome review can reconstruct:
- Original Decision (from `business_decisions` record)
- Original context (from `source_context_snapshot`)
- Expected outcomes (from `expected_outcomes` JSONB)
- Current evidence at review (from Shared Contract at review time)
- AI analysis (generated on-demand, not persisted — but context is reproducible)
- Human-confirmed outcome (from `outcome_status`, `outcome_reviewed_at`)
- Human notes (from `outcome_notes`)
- Actual outcomes (from `actual_outcomes` JSONB with `reviewed_by` stamps)
- Subsequent actions (from follow-up decisions, execution routes)
- Memory candidates (returned at confirmation — advisor confirms through Business Memory)

Reviewer identity is captured in `actual_outcomes[].reviewed_by` (stamped by backend from authenticated profile). No redundant actor column was added.

---

## Immutability

Once an outcome review is confirmed:
- `outcome_reviewed_at` timestamp is set (immutable)
- `actual_outcomes` are stamped with `reviewed_at` and `reviewed_by` (immutable)
- `source_context_snapshot` preserves decision-time evidence (never overwritten)
- `source_contract_version` preserves contract version at decision time

Later business changes do NOT rewrite what was known at outcome review time. The existing audit/snapshot capability is sufficient — no new immutability table was needed.

---

## TOO_EARLY State

If less than 50% of the time horizon has elapsed, the system returns `TOO_EARLY`:
- "It is too early to assess the primary outcome."
- AI suggests `ongoing` or `pending`
- No forced success/failure judgment

Example: Decision made 14 days ago, expected outcome horizon = 6 months → TOO_EARLY.

---

## INCONCLUSIVE State

If evidence is insufficient:
- The system says exactly what is missing
- AI suggests `inconclusive`
- Potential action: request/upload evidence, complete assessment, advisor review
- No forced conclusion

Example: No current customer churn data → UNKNOWN/INCONCLUSIVE.

---

## Failed Decisions

Failed decisions are NOT hidden. A failed decision creates extremely valuable Business Memory:
- What was believed
- Why it was chosen
- What failed
- What changed
- What was learned

No blame language. Historical context is preserved. The `failed` status generates memory candidates with `failed_decision_lesson` relevance tag.

---

## Supersession

If a follow-up decision supersedes the original before its review:
- The original is NOT automatically called "failed"
- The original's outcome may be "inconclusive" or "superseded context"
- The `supersedes_decision_id` and `superseded_by_decision_id` fields preserve the chain
- Existing decision history is used

---

## Value Creation

Decision outcomes must NOT automatically create Verified Business Value Created. If a decision outcome results in measurable value creation, that evidence must route through the existing governed `value_creation_events` process. Verification requirements are preserved.

Example: Decision succeeded ≠ automatically $500K Verified Value Created.

---

## Controlled Tests

### Test 1: Pricing (Partial Success)
- Decision: Raise Prices 8%
- Expected: Gross Margin 31% → 34%, Revenue above threshold, Customer retention acceptable
- Review Date: 90 days
- Current evidence: margin at 33.2% (partially achieved)
- AI suggests: `partially_succeeded`
- Human confirms: `partially_succeeded`
- Memory candidate: "Full pricing increase improved margin but retention sensitivity was higher than expected."
- Timeline updated
- Next action routed

### Test 2: Hire COO (Mixed Evidence)
- Decision: Hire COO
- Expected: hire within 120 days, owner hours decline, operations score improves
- Mixed evidence: COO hired (achieved), hours not yet declined (too early), operations score unchanged
- One successful sub-outcome does NOT automatically classify the whole decision as succeeded
- Human confirms appropriate status

### Test 3: Acquisition (Too Early)
- Decision: Acquire competitor
- Outcome horizon: 12 months
- Review at 60 days: TOO_EARLY
- No forced success/failure
- AI suggests: `ongoing`

### Test 4: Failed Decision
- Legitimately failed controlled decision
- AI analysis explains why evidence suggests failure
- Human confirms: `failed`
- Memory candidate preserves the lesson
- No destructive rewriting of the Decision

---

## Architecture Regression

All prior certification checks remain PASS:
- No Base44 persistence (Supabase remains sole authority)
- No Shared Contract bypass (current evidence from certified contract)
- No business isolation regression (authorizeBusiness on every action)
- No direct presentation truth reads (backend-mediated)
- No duplicate outcome engine/table (existing fields used)
- Architecture guards pass
- Intelligence contract certification passes

---

## Permanent Rule: OUTCOME AUTHORITY

**V.I.S.I.O.N. may analyze evidence and recommend an outcome classification, but only an authorized human may confirm whether a business decision succeeded, partially succeeded, failed, remains ongoing, or is inconclusive.**

Decision-time and outcome-review-time context must remain historically reproducible.

Lessons may become governed Business Memory candidates but are never silently promoted to durable truth.

Base44 may not modify this rule without explicit platform-owner approval.

---

## Files Created/Modified

### New Files
- `base44/shared/decisionIntelligence/outcomeTypes.ts` — Outcome type definitions
- `base44/shared/decisionIntelligence/outcomeCoordinator.ts` — Review state, context builder, comparison
- `base44/shared/decisionIntelligence/outcomeAnalysis.ts` — AI analysis prompt/response
- `base44/shared/decisionIntelligence/outcomeMemory.ts` — Memory candidate generation
- `base44/shared/decisionIntelligence/outcomeClientSafe.ts` — Client-safe filtering
- `src/components/decision/DecisionOutcomeView.jsx` — Outcome review UI
- `src/components/decision/DecisionOutcomeEditor.jsx` — Expected outcomes editor
- `src/supabase/migrations/business_decisions_outcome_review_index.sql` — Additive index
- `src/DECISION_OUTCOME_INTELLIGENCE.md` — This report

### Modified Files
- `base44/shared/decisionIntelligence/types.ts` — Extended ExpectedOutcome/ActualOutcome (additive optional fields)
- `base44/shared/decisionIntelligence/index.ts` — Export outcome modules
- `base44/functions/decisionIntelligenceService/entry.ts` — 7 new outcome actions
- `src/lib/decisionIntelligenceService.js` — 7 new client functions
- `src/components/decision/DecisionDrawer.jsx` — Outcome tab
- `base44/shared/galileo/capabilities/placeholders.ts` — 3 new Galileo capabilities
- `src/VISION_CONSTITUTION.md` — Article XVI (Outcome Authority)
- `src/VISION_ARCHITECTURE_DECISION_RECORDS.md` — New ADR

---

## Certification

**DECISION OUTCOME INTELLIGENCE CERTIFIED**

All stop conditions met:
- ✅ Original Decision remains immutable (source_context_snapshot preserved)
- ✅ Expected outcomes are structured (formalized JSONB contract)
- ✅ Outcome review date works (existing field, deterministic state derivation)
- ✅ Review context uses Shared Contract (buildDecisionOutcomeContext)
- ✅ Expected vs actual comparison works (compareExpectedVsActual)
- ✅ Numeric + non-numeric outcomes work (metric_key + evidence-based)
- ✅ AI analysis is advisory (analyzeOutcome — cannot set outcome_status)
- ✅ AI cannot finalize outcome (confirmOutcome requires isAdvisorOrAdmin)
- ✅ Human confirmation is required (OUTCOME AUTHORITY gate)
- ✅ Actual outcomes persist (actual_outcomes JSONB with reviewer stamps)
- ✅ Outcome status persists (outcome_status field)
- ✅ TOO_EARLY works (50% of time horizon threshold)
- ✅ INCONCLUSIVE works (insufficient evidence detection)
- ✅ Failed decisions remain historically useful (memory candidates, no blame)
- ✅ Business Memory candidates are governed (returned, not auto-persisted)
- ✅ Timeline is reused (business_state_events)
- ✅ Execution systems are reused (Growth Plan, Sprint, Roadmap consumed)
- ✅ Follow-up decisions preserve history (supersedes, does not rewrite)
- ✅ Meeting Intelligence can surface due reviews (listReviewsDue)
- ✅ Living Intelligence can surface due reviews (listReviewsDue)
- ✅ Client-safe filtering passes (toClientSafeOutcomeReview)
- ✅ A→B→A isolation passes (authorizeBusiness on every action)
- ✅ Refresh passes (Supabase authoritative, no local-only state)
- ✅ Architecture guards pass (no Base44 persistence, no contract bypass)
- ✅ No duplicate outcome engine/table (existing fields used, one additive index)
- ✅ Permanent Outcome Authority rule documented (Article XVI)