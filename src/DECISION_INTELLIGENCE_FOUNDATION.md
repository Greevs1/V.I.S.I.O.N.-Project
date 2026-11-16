# Decision Intelligence Foundation — Phase D

> **Status: CERTIFIED ✅** — Decision Intelligence is a governed human decision support layer.
> AI proposes reasoning. Humans decide. Existing certified systems execute.

## Constitution Check

Before building, the following certified systems were inspected:

| System | Inspected | Duplication? |
|--------|-----------|-------------|
| Shared Business Intelligence Contract | ✅ | No — Decision Intelligence **consumes** the contract |
| Galileo Capability Framework | ✅ | No — Decision Intelligence **extends** via new capabilities |
| Living Intelligence | ✅ | No — separate domain (decisions vs. momentum) |
| Business Memory | ✅ | No — confirmed decisions **feed** memory candidates |
| Business Timeline | ✅ | No — confirmed decisions **trigger** timeline events via CBSS |
| Meeting Intelligence | ✅ | No — Decision Moments **link** to Decision records |
| Post-Meeting Intelligence | ✅ | No — post-meeting outcomes **propose** decision candidates |
| Growth Plan / Sprint / Roadmap | ✅ | No — confirmed decisions **route** to these for execution |
| Valuation | ✅ | No — valuation decisions route to valuation workflow |
| Verification Queue | ✅ | No — verification decisions route to verification queue |
| Advisor Notes / Client Notes | ✅ | No — decision evidence references notes |
| value_creation_events | ✅ | No — decisions do not create VCEs directly |
| Executive Session Governance | ✅ | No — deep decision analysis consumes Executive Sessions |
| StrategicHypothesis entity | ✅ | No — hypotheses are AI-generated; decisions are human-confirmed |

**Result:** No existing Decision entity exists. No duplication. Decision Intelligence is a new domain that **composes** existing certified outputs.

## The Decision Object

```typescript
BusinessDecision {
  decision_id: string
  business_id: string

  title: string
  decision_type: DecisionType  // 14-type taxonomy
  decision_status: DecisionStatus  // 8-state lifecycle

  question: string
  context_summary: string

  created_by_profile_id: string
  decision_owner_profile_id: string

  created_at: string
  target_decision_date: string
  decided_at: string

  importance: DecisionImportance  // critical | strategic | significant | routine
  risk_level: DecisionRiskLevel   // low | medium | high | critical

  meeting_context_id: string  // if scoped to a meeting

  options: DecisionOption[]       // 2+ options per decision
  assumptions: DecisionAssumption[]
  evidence: DecisionEvidence[]     // references, not copies
  risks: DecisionRisk[]
  unknowns: DecisionUnknown[]

  recommendation: DecisionRecommendation  // advisory only
  selected_option_id: string       // human-selected
  decision_reason: string          // human-provided

  expected_outcomes: ExpectedOutcome[]
  actual_outcomes: ActualOutcome[]
  outcome_status: OutcomeStatus

  source_contract_version: string  // immutability
  source_context_snapshot: object  // decision-time evidence preserved

  visibility: DecisionVisibility   // advisor_internal | client_safe
  client_visible: boolean

  supersedes_decision_id: string
  superseded_by_decision_id: string

  execution_routes: ExecutionRoute[]  // routes to existing systems
}
```

## Taxonomy (14 Types)

`strategic` | `financial` | `operating` | `talent` | `capital_allocation` |
`acquisition` | `exit` | `pricing` | `growth` | `risk` | `ownership` |
`tax` | `technology` | `other`

## Lifecycle (8 States)

`draft` → `analyzing` → `needs_information` → `ready_for_decision` → `decided`
↘ `deferred` | `cancelled` | `superseded`

Decision status is separate from execution status. A decision may be DECIDED
while execution happens elsewhere.

## Decision Context

The Decision Intelligence Coordinator composes certified outputs into a
Decision Context:

- **Shared Business Intelligence Contract** — financial metrics, valuation metrics, risks
- **Business Memory** — relevant confirmed memories
- **Business Timeline** — recent timeline events
- **Valuation** — current/baseline value summary
- **Growth Plan** — active initiatives
- **Meeting Intelligence** — meeting context (if scoped)

The coordinator performs **synthesis only** — no calculations, no truth resolution.

## Options Model

Each decision has 2+ options. Each option includes:
- summary, advantages, disadvantages
- financial/operational implications
- risk level, time horizon, confidence
- required resources, dependencies
- evidence references, assumption references

## Assumptions

Every material assumption is explicit:
- statement, source, confidence
- verification status (unverified → pending → verified | challenged)
- impact if wrong

## Evidence

Evidence **references** certified sources — never copies:
- shared_contract, document, assessment, valuation
- business_memory, advisor_note, meeting_outcome
- timeline_event, canonical_fact, benchmark

## Risks

Structured risks with:
- description, severity, likelihood
- evidence references, mitigation
- decision relevance

No fabricated probability percentages.

## Unknowns

Structured missing information:
- what is missing, why it matters
- how to resolve, destination (data_room, assessment, advisor_review)
- blocks_decision flag

## Decision Readiness

Descriptive states (not a score):
- `insufficient_information` — not enough evidence
- `partially_informed` — some unknowns remain
- `decision_ready` — sufficient evidence
- `needs_advisor_review` — requires advisor judgment
- `blocked` — blocking unknowns

## Recommendation Model

AI MAY recommend an option. The recommendation includes:
- recommended option, why, evidence, assumptions
- tradeoffs, confidence
- what would change the recommendation
- `is_no_recommendation` flag (valid result: NEEDS_INFORMATION)

Recommendation is advisory only. Never presented as certainty.

## Galileo Decision Mode

Three capabilities added to the Galileo Capability Framework:
- `analyze.decision` — frame and analyze a decision
- `challenge.decision` — devil's advocate challenge
- `compare.options` — compare decision options

Uses existing Executive Session governance for deep strategic reasoning.

## Devil's Advocate / Challenge Mode

The challenge engine:
1. Challenges assumptions (evidence-based, not personal)
2. Identifies confirmation bias risks
3. Finds missing evidence
4. Articulates the strongest opposing case
5. Identifies failure modes

Does NOT pretend to know the user's psychology. Challenges the evidence, not the person.

## Historical Decision Context

Business Memory provides relevant prior decisions/context. The coordinator
retrieves confirmed memories relevant to the decision type. Only confirmed
memories are used — no automatic conversion of old memories into decisions.

## Decision Ledger

The governed history of major decisions. For each finalized decision:
- what was decided, when, who decided, why
- what options existed, what assumptions existed
- what evidence existed, what outcome was expected
- what happened later (actual outcome)
- whether the final decision matched the recommendation

## Persistence

**Single additive Supabase table:** `business_decisions`

JSONB columns for options, assumptions, evidence, risks, unknowns, outcomes —
avoids over-normalization. The table is:
- Supabase (sole system of record)
- business-scoped (RLS-enforced)
- backend-mediated (no direct frontend access)
- auditable (updated_at trigger)
- additive (no existing tables modified)
- idempotent (decision_id is unique)

**No Base44 Decision entity as system of record.**

## Client / Advisor Boundaries

- `ADVISOR_INTERNAL` — advisor concerns, sensitive positioning, hidden risk framing, draft recommendations
- `CLIENT_SAFE` — decision question, approved evidence, options, agreed tradeoffs, final decision

Visibility is enforced before retrieval via `toClientSafeDecision()`.

## Human Decision Confirmation

Only authorized humans (advisors/admins) may finalize a decision.

Finalization requires:
- `selected_option_id` — the chosen option
- `decision_reason` — why this option was selected

The system captures: actor, timestamp, decision-time evidence (immutable).

AI may never silently mark DECIDED.

## Decision → Existing Workflows

After a decision is confirmed, execution routes to existing owners:

| Decision Type | Routes To |
|---------------|-----------|
| pricing, growth, financial | Growth Plan / Sprint |
| talent | Growth Plan / Roadmap |
| acquisition, exit, ownership | Exit Workflow / Valuation |
| tax | Tax Workflow |
| operating | Sprint / Roadmap |
| risk | Roadmap |
| technology | Growth Plan / Sprint |
| strategic | Growth Plan |

No separate execution engine is created.

## Business Memory Integration

Confirmed major decisions (critical/strategic importance) may become Business
Memory candidates. The candidate goes through the existing Business Memory
governance workflow — advisor must confirm before persistence.

NOT every decision becomes a memory. Only durable, strategic decisions.

## Business Timeline Integration

Confirmed major decisions may create Timeline events through the existing
CBSS event system. Decision Intelligence does NOT create timeline events directly.

## Meeting Intelligence Integration

Meeting Intelligence Decision Moments may link to Decision records. The
existing DecisionMoment type connects to the new Decision contract.

## Post-Meeting Intelligence Integration

Post-Meeting Intelligence may propose a `decision_candidate`. The advisor
confirms before creating a formal Decision. No automatic decision creation
from meeting notes.

## Outcome Review Contract

After a decision is made:
- `review_date` — when to review
- `expected_outcomes` — what was expected
- `success_indicators` — how to measure

At review time, the system may ask "Did this work?" — but does NOT
autonomously judge outcomes. Human/advisor confirmation is authoritative.

## Actual Outcome Contract

Future extension for recording actual outcomes:
- `succeeded` | `partially_succeeded` | `failed` | `inconclusive` | `ongoing`

AI does NOT determine this automatically. Human confirmation is authoritative.

## Decision Quality Learning (Future)

Decision Intelligence creates structured data that makes future systems possible:
- Decision Patterns
- Business DNA
- Business Twin
- Historical decision analysis

**NOT implemented in this phase.** Extension points only.

## Intelligence Contract Integration

Decision Intelligence **consumes** the Shared Business Intelligence Contract.
It does NOT independently resolve current business truth. If a needed metric
is absent, the contract is extended through the certified owner — never bypassed.

## Materiality

Reuses the existing materiality policy. Insignificant metric drift does not
appear as meaningful decision evidence.

## Confidence

Decision recommendation confidence reflects:
- evidence quality
- missing information
- conflicts
- uncertainty

Never fabricates certainty.

## Executive Session Governance

Basic decision framing: "What are my options?", "What evidence do we have?",
"What information is missing?"

Deep strategic analysis consumes an Executive Session: "Model three
acquisition strategies", "Build the negotiation strategy", "Stress-test
each option."

## Quiet / Honest State

Decision Intelligence supports "We do not have enough information yet."
A valid result is `NEEDS_INFORMATION` with specific next information required.
No forced recommendation.

## Auditability

Every finalized decision explains:
- what was decided, who decided, when, why
- what evidence existed, what assumptions existed
- what recommendation was shown
- whether the final decision differed from the recommendation

## No Silent Updates

Once a decision is finalized, its historical context is NOT silently rewritten
when current business facts change. The decision record preserves:
- `source_contract_version`
- `source_context_snapshot` (decision-time evidence)
- decision-time assumptions

Current information may be shown separately. Historical reasoning remains
reproducible.

## Decision Supersession

Decision A may be superseded by Decision B. A is NOT rewritten — it is marked
as `superseded` with `superseded_by_decision_id`. B references A via
`supersedes_decision_id`. Historical context remains.

## Multi-Business Isolation

Decision records are strictly business-scoped. A decision for Business A never
appears for Business B. RLS enforces this at the database level. The backend
function authorizes every query.

## Controlled Use Cases

The system supports:
- A. Raise Prices — 8% now vs phased increase
- B. Hire COO — now vs wait six months
- C. Geographic Expansion — enter new market vs remain focused
- D. Acquisition — proceed with LOI vs decline
- E. Exit Timing — sell now vs build value for 24 months

## Failure / Safety

Tested for:
- missing evidence → controlled review state
- conflicting evidence → challenge mode surfaces conflicts
- unauthorized user → 403 Forbidden
- wrong business → RLS blocks access
- stale decision context → source_contract_version preserved
- deleted source document → evidence reference remains (provenance preserved)

Expected: controlled review state, not fabricated reasoning.

## Permanent Architecture Rule

**DECISION AUTHORITY:**

> V.I.S.I.O.N. may structure, analyze, challenge, and recommend around business
> decisions, but final decision authority remains with an authorized human.
>
> Decision Intelligence may not independently execute high-impact decisions.
>
> Confirmed decisions route into existing certified execution systems.
>
> Decision-time evidence and reasoning are preserved historically.

## File Map

| File | Purpose |
|------|---------|
| `base44/shared/decisionIntelligence/types.ts` | Type contract |
| `base44/shared/decisionIntelligence/coordinator.ts` | Composes certified outputs |
| `base44/shared/decisionIntelligence/challengeEngine.ts` | Devil's advocate |
| `base44/shared/decisionIntelligence/clientSafe.ts` | Visibility filtering |
| `base44/shared/decisionIntelligence/memoryIntegration.ts` | Decision → memory candidate |
| `base44/shared/decisionIntelligence/executionRouting.ts` | Decision → existing workflows |
| `base44/shared/decisionIntelligence/index.ts` | Public API |
| `src/supabase/migrations/business_decisions.sql` | Additive Supabase table |
| `base44/functions/decisionIntelligenceService/entry.ts` | Backend CRUD + intelligence |
| `src/lib/decisionIntelligenceService.js` | Frontend API client |
| `src/components/decision/DecisionDrawer.jsx` | Main drawer UI |
| `src/components/decision/DecisionContextView.jsx` | Context display |
| `src/components/decision/DecisionOptionsEditor.jsx` | Options editor |
| `src/components/decision/DecisionChallengeView.jsx` | Challenge display |
| `src/components/decision/EvaluateDecisionButton.jsx` | Entry point button |
| `base44/shared/galileo/capabilities/placeholders.ts` | 3 decision capabilities added |