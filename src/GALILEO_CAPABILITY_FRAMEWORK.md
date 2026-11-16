# Galileo Capability Framework — Phase 13.4B.1

**Date:** 2026-08-06
**Status:** Framework complete. Placeholder capabilities registered. No AI features implemented.
**Certification:** READY FOR GALILEO CAPABILITY FRAMEWORK REVIEW

---

## 1. Architecture

The Galileo Capability Framework is the invisible execution engine that every future Galileo workflow will use. It is completely independent from valuation logic. No capability-specific business logic belongs in the framework.

### Design Philosophy

Galileo should never feel like ChatGPT inside an app. Galileo should feel like the firm's Chief Strategy Officer. Instead of asking "How can I help?", Galileo understands where the user is, what they're trying to accomplish, what information exists, what's missing, and what should happen next.

Every capability operates through the same pipeline:

```
User Intent → Context → Evidence → Reasoning → Recommendation → Navigation → Draft → Confirmation → Execution
```

### Core Principles

1. **Galileo remains the ONE intelligence layer.** No separate AI assistants, conversation systems, context engines, memory systems, or prompt frameworks.
2. **Capabilities never call the LLM directly.** The Galileo orchestration layer does. Capabilities return structured instructions.
3. **Capabilities never navigate directly.** They emit structured navigation actions. The UI decides routing.
4. **The framework is platform-agnostic.** No valuation-specific or domain-specific assumptions.
5. **One registry, one execution contract, one permission model, one evidence model, one navigation contract, one follow-up graph, one analytics path.** No duplicate orchestration.

### File Structure

```
base44/shared/galileo/capabilities/
├── types.ts          — All TypeScript types, interfaces, enums
├── registry.ts       — Singleton registry + 15 category definitions
├── pipeline.ts       — 11-stage execution pipeline + executeCapability contract
├── permissions.ts    — Permission model + validation
├── contextModel.ts   — Context requirements + validation
├── evidenceModel.ts  — Evidence model + request/resolution contract
├── followUpGraph.ts  — Directed graph of capability follow-ups
├── analytics.ts      — Metadata-only usage tracking
├── placeholders.ts   — 20 placeholder capability registrations
└── index.ts          — Public API + initialization
```

---

## 2. Execution Pipeline

Every capability follows the exact same 11-stage pipeline. No capability may bypass this pipeline.

| Stage | Name | Description |
|-------|------|-------------|
| 1 | Intent Resolution | Resolve what the user is asking for and match to a capability |
| 2 | Context Validation | Validate that required context resources exist |
| 3 | Permission Validation | Validate user role and permission level |
| 4 | Evidence Retrieval | Gather evidence from the certified Galileo context service |
| 5 | Reasoning Preparation | Prepare structured data for the LLM orchestration layer |
| 6 | Reasoning | LLM processes reasoning instructions (orchestration layer, not capability) |
| 7 | Recommendation Building | Build structured recommendations from reasoning output |
| 8 | Navigation Targets | Emit structured navigation actions for the UI to route |
| 9 | Draft Outputs | Generate draft outputs for user review |
| 10 | Confirmation Actions | Emit confirmation actions for any write operations |
| 11 | Completion Metadata | Return completion status and analytics metadata |

### Execution Contract

```typescript
executeCapability(capabilityId, input): Promise<CapabilityExecutionResult>
```

**Input (CapabilityExecutionContext):**
- `conversation` — Galileo conversation state
- `context` — Galileo context (from buildGalileoContext)
- `currentPage` — Current page route
- `focusedObject` — Currently focused entity/object
- `userIntent` — Resolved user intent
- `requestedOutput` — User-requested output type
- `executionMode` — One of: read, draft, review, recommend, confirm, execute
- `userRole`, `userProfileId`, `businessId`, `valuationId`

**Output (CapabilityInstruction):**
- `intent` — Resolved intent
- `contextValid` — Whether context validation passed
- `permissionsValid` — Whether permission validation passed
- `missingContext` — List of missing required context resources
- `evidence` — Gathered evidence items
- `reasoningContext` — Structured data for the LLM orchestration layer
- `recommendations` — Structured recommendations
- `navigationActions` — Navigation actions for the UI
- `drafts` — Draft outputs
- `confirmations` — Confirmation actions for writes
- `status` — not_implemented | ready | blocked | completed | error
- `completionMetadata` — Analytics metadata
- `recommendedFollowUps` — Next capability IDs from the follow-up graph

### Placeholder Behavior

For placeholder capabilities, stages 6-10 return NOT_IMPLEMENTED. Stages 1-5 still validate (intent, context, permissions, evidence request). This ensures every placeholder validates through the framework without implementing any capability logic.

---

## 3. Registry

The registry is the single source of truth for what capabilities exist. Metadata only — no execution logic.

### API

```typescript
capabilityRegistry.register(metadata)     // Register a capability
capabilityRegistry.get(id)                 // Get by ID
capabilityRegistry.has(id)                  // Check existence
capabilityRegistry.list()                  // List all
capabilityRegistry.listByCategory(cat)      // List by category
capabilityRegistry.listByRole(role)        // List by supported role
capabilityRegistry.listByVisibility(vis)    // List by visibility
capabilityRegistry.listAvailable(ctx)       // List available for context
capabilityRegistry.count()                  // Total count
```

### 15 Categories

| Category | Description |
|----------|-------------|
| valuation | Business valuation analysis, explanation, and reporting |
| business_intelligence | Canonical BIE recommendations and intelligence surfacing |
| growth | Growth plan initiatives, 90-day plans, and value creation |
| meetings | Meeting preparation, agendas, and client/advisor/board interactions |
| reports | Report generation, deliverable preparation, and publication readiness |
| operations | Operational analysis, readiness, and process improvement |
| tax | Tax strategy, gap analysis, and optimization |
| cash_flow | Cash flow analysis, projections, and optimization |
| wealth | Wealth building, preservation, and transfer |
| protection | Risk protection, insurance, and liability management |
| owner_experience | Owner journey, freedom, and personal objectives |
| administration | Administrative workflows, team management, and system operations |
| education | Educational content, explanations, and learning pathways |
| navigation | Navigation assistance, page routing, and wayfinding |
| analysis | Cross-domain analytical capabilities and comparative analysis |

---

## 4. Permission Model

Capabilities declare permission requirements. The framework enforces permissions — never the LLM.

### Permission Levels

| Level | Description |
|-------|-------------|
| `read` | Read-only, no writes |
| `draft` | Can create drafts (not published) |
| `confirmed_write` | Requires explicit confirmation before writing |
| `prohibited` | Not allowed for this context/role |

### Role → Permission Mapping

| Role | Allowed Permissions |
|------|-------------------|
| super_admin | read, draft, confirmed_write |
| admin | read, draft, confirmed_write |
| advisor | read, draft, confirmed_write |
| team_member | read, draft |
| owner | read |
| viewer | read |
| guest | read |

### Execution Mode → Required Permission

| Mode | Required Permission |
|------|-------------------|
| read | read |
| draft | draft |
| review | read |
| recommend | read |
| confirm | confirmed_write |
| execute | confirmed_write |

### Validation

The framework checks:
1. Is the capability prohibited for this role?
2. Does the user's role support the capability?
3. Does the user have the required permission level for the execution mode?
4. Does the capability allow this execution mode's permission?

---

## 5. Evidence Model

Capabilities request evidence through the certified Galileo context service — never raw database tables.

### Evidence Item

Every evidence item carries:
- `type` — document, extracted_field, assessment, financial, adjustment, verification_item, published_version, growth_plan_item, deliverable, advisor_conclusion, benchmark
- `reference` — Source identifier
- `label` — Human-readable label
- `confidence` — 0-100
- `verificationStatus` — verified | pending | conflicted | unverified
- `clientVisible` — Boolean (client-safe filtering)
- `sourceReference` — Document ID, assessment ID, etc.

### Evidence Request

The framework builds an evidence request from the capability's required context resources. The orchestration layer (future phase) will resolve evidence from the certified Galileo context service.

### Client-Safe Filtering

Client-safe capabilities only receive evidence where `clientVisible` is true. The framework provides `filterClientSafeEvidence()` for this purpose.

---

## 6. Context Requirements

Capabilities declare context requirements. If required context is missing, the framework returns a structured explanation — never fabricates.

### Context Resources

`approved_valuation`, `draft_valuation`, `confidence`, `advisor_conclusion`, `reconciliation`, `build_value`, `roadmap`, `initiatives`, `documents`, `financials`, `adjustments`, `verification_queue`, `published_version`, `growth_plan`, `deliverables`, `assessments`, `business_profile`, `expert_profiles`, `sprint`, `readiness`

### Fallback Behavior

| Fallback | Behavior |
|----------|----------|
| `block` | Execution returns blocked status with missing context |
| `warn` | Execution proceeds, missing context reported as warning |
| `proceed_with_gap` | Execution proceeds silently |

### Context Extraction

The framework extracts available resources from the Galileo context object (from `buildGalileoContext`). Valuation resources are nested under `context.valuation`; business, growth, and other resources are at the top level.

---

## 7. Output Types

13 standardized output types:

| Type | Description |
|------|-------------|
| conversation | Chat-style response |
| checklist | List of items to verify |
| investigation | Structured investigation findings |
| recommendation | Ranked recommendation with evidence |
| comparison | Side-by-side comparison |
| summary | Executive summary |
| meeting_agenda | Meeting agenda and briefing |
| client_letter | Client-facing letter |
| advisor_memo | Internal advisor memo |
| report | Formal report |
| timeline | Chronological timeline |
| action_plan | Actionable plan with steps |
| navigation | Navigation directive |

Capabilities declare `supportedOutputs` in their metadata.

---

## 8. Navigation Contract

Capabilities never navigate directly. They emit structured navigation actions. The UI decides routing.

### Navigation Targets

`open_verification_item`, `open_document`, `open_adjustment`, `open_build_value`, `open_deliverable`, `open_version`, `open_initiative`, `open_evidence`, `open_assessment`, `open_valuation`, `open_growth_plan`, `open_financial`

### Navigation Action

```typescript
{
  target: NavigationTarget,
  entityId?: string,
  label: string,
  context?: Record<string, unknown>
}
```

---

## 9. Follow-up Graph

A directed graph of capability follow-ups. Every capability may recommend another capability. The graph enables intelligent chaining without hardcoding sequential workflows.

### Example Chain

```
explain.enterprise_value
  → review.confidence
    → investigate.conflict
      → review.evidence
```

### API

```typescript
followUpGraph.addEdge(from, to, priority, condition)
followUpGraph.getFollowUps(capabilityId)    // Returns sorted capability IDs
followUpGraph.getChain(startId, maxDepth)   // Follows highest-priority edges
getFollowUps(capabilityId)                   // Convenience export
```

### Initialized Edges

The follow-up graph is initialized with 25 edges connecting the 20 placeholder capabilities. Edges are prioritized (high, medium, low) and the graph supports cycle detection.

---

## 10. Execution Modes

6 execution modes prepare future automation without changing the framework:

| Mode | Description | Required Permission |
|------|-------------|-------------------|
| read | Read-only retrieval and explanation | read |
| draft | Create draft outputs (not published) | draft |
| review | Review existing work products | read |
| recommend | Generate recommendations without writing | read |
| confirm | Require explicit confirmation before writing | confirmed_write |
| execute | Execute confirmed actions | confirmed_write |

---

## 11. Analytics

Tracks capability usage metadata only. No conversation content is stored.

### Captured Metadata

- Execution count
- Completion outcome (completed, dismissed, accepted, error, not_implemented)
- Duration
- Accepted recommendations
- Dismissed recommendations
- Manual vs automatic launches

### API

```typescript
capabilityAnalytics.trackExecution(capabilityId, mode)
capabilityAnalytics.trackCompletion(capabilityId, outcome, duration)
capabilityAnalytics.trackRecommendationAccepted(capabilityId)
capabilityAnalytics.trackRecommendationDismissed(capabilityId)
capabilityAnalytics.getStats(capabilityId)
```

---

## 12. Placeholder Capabilities (20)

All 20 placeholder capabilities are registered with full metadata (context requirements, permissions, outputs, follow-ups). Each returns NOT_IMPLEMENTED when executed but validates through the framework.

| # | ID | Category | Title |
|---|-----|----------|-------|
| 1 | explain.enterprise_value | valuation | Explain Enterprise Value |
| 2 | explain.equity_value | valuation | Explain Equity Value |
| 3 | explain.confidence | valuation | Explain Confidence |
| 4 | review.publication_readiness | valuation | Review Publication Readiness |
| 5 | investigate.conflict | valuation | Investigate Conflict |
| 6 | review.evidence | valuation | Review Evidence |
| 7 | increase.enterprise_value | growth | Increase Enterprise Value |
| 8 | build.90_day_plan | growth | Build 90-Day Plan |
| 9 | prepare.client_meeting | meetings | Prepare Client Meeting |
| 10 | prepare.buyer_meeting | meetings | Prepare Buyer Meeting |
| 11 | prepare.board_meeting | meetings | Prepare Board Meeting |
| 12 | compare.valuation_versions | analysis | Compare Valuation Versions |
| 13 | draft.client_explanation | reports | Draft Client Explanation |
| 14 | review.missing_information | analysis | Review Missing Information |
| 15 | explain.build_value | valuation | Explain Build Value |
| 16 | review.risks | analysis | Review Risks |
| 17 | review.opportunities | business_intelligence | Review Opportunities |
| 18 | review.uploaded_documents | valuation | Review Uploaded Documents |
| 19 | analyze.assessments | analysis | Analyze Assessments |
| 20 | review.financial_story | valuation | Review Financial Story |

### Category Distribution

| Category | Count |
|----------|-------|
| valuation | 9 |
| growth | 2 |
| meetings | 3 |
| analysis | 4 |
| business_intelligence | 1 |
| reports | 1 |

---

## 13. Platform Readiness

Every future V.I.S.I.O.N. domain can plug into this framework:

- Business Valuation ✅ (placeholder capabilities registered)
- Assessments ✅ (context resource `assessments` defined)
- Documents ✅ (context resource `documents` defined)
- Growth Plans ✅ (context resources `growth_plan`, `initiatives` defined)
- Reports ✅ (context resource `deliverables` defined)
- Roadmaps ✅ (context resource `roadmap` defined)
- Tax ✅ (category `tax` defined)
- Cash Flow ✅ (category `cash_flow` defined)
- Estate Planning ✅ (category `wealth` defined)
- Protection ✅ (category `protection` defined)
- Buyer Readiness ✅ (context resource `readiness` defined)
- Business Intelligence ✅ (category `business_intelligence` defined)

No valuation-specific assumptions in the framework. All domain logic lives in capability implementations (future phases).

---

## 14. Architecture Validation

| Check | Result |
|-------|--------|
| Single registry | ✅ `capabilityRegistry` singleton |
| Single execution contract | ✅ `executeCapability()` |
| Single permission model | ✅ `validatePermissions()` |
| Single evidence model | ✅ `resolveEvidence()` + `buildEvidenceRequest()` |
| Single navigation contract | ✅ `NavigationAction` type |
| Single follow-up graph | ✅ `followUpGraph` singleton |
| Single analytics path | ✅ `capabilityAnalytics` singleton |
| No duplicate orchestration | ✅ One pipeline, one contract |
| No valuation-specific assumptions | ✅ Framework is domain-agnostic |

### Live Validation Results

| Test | Result |
|------|--------|
| Framework initializes | ✅ true |
| 20/20 placeholders registered | ✅ true |
| 15 categories defined | ✅ true |
| 11 pipeline stages | ✅ true |
| Missing context → blocked | ✅ true |
| Valid context → NOT_IMPLEMENTED | ✅ true |
| Context validation passes | ✅ true |
| Permission validation passes | ✅ true |
| Follow-up graph populated | ✅ 3 follow-ups, chain length 4 |
| Completion metadata returned | ✅ true |
| Not-found capability → error | ✅ true |
| validateCapability works | ✅ true |

---

## 15. Integration with Galileo

The framework extends the certified Galileo architecture (Phase 13.4A):

- **Context:** Capabilities use the same Galileo context from `buildGalileoContext` — no separate context engine.
- **Conversation:** Capabilities operate within existing Galileo conversations — no separate conversation system.
- **Persistence:** Capability analytics are metadata-only — no conversation content stored.
- **Scoping:** Capabilities respect the 5-field conversation scope (profile, business, valuation, mode, visibility).

### Future Integration Points

1. **Galileo orchestration layer** (Phase 13.4B.2+) — will interpret `CapabilityInstruction` and invoke the LLM
2. **Galileo intent resolver** (Phase 13.4B.2+) — will match user intent to capability ID
3. **Galileo evidence resolver** (Phase 13.4B.2+) — will populate evidence from the certified Galileo context service
4. **Galileo UI** (Phase 13.4B.3+) — will render capability outputs and handle navigation actions

---

## 16. Integration with Valuation

The framework is used by — but not coupled to — the valuation domain:

- Valuation capabilities declare `approved_valuation`, `confidence`, `advisor_conclusion`, `reconciliation` as context resources
- The framework validates these exist before execution
- The framework never accesses valuation tables directly — evidence comes through the Galileo context service
- Valuation-specific logic lives in capability implementations (future phases), not in the framework

---

## 17. Future Roadmap

| Phase | Description |
|-------|-------------|
| 13.4B.2 | Galileo orchestration layer — interpret instructions, invoke LLM, populate evidence |
| 13.4B.3 | Intent resolver — match user messages to capability IDs |
| 13.4B.4 | First capability implementations — explain.enterprise_value, explain.confidence |
| 13.4B.5 | Navigation handling — UI routing from navigation actions |
| 13.4B.6 | Draft outputs — client letters, advisor memos, meeting agendas |
| 13.4B.7 | Confirmation model — confirmed writes for adjustments, publications |
| 13.4B.8 | Analytics persistence — store capability usage metadata |
| 13.4C | Platform domain integration — tax, cash flow, wealth, protection capabilities |

---

## 18. What Was NOT Built

Per the phase requirements, the following were NOT implemented:

- ❌ No AI features
- ❌ No capability execution (beyond framework validation)
- ❌ No reasoning / LLM orchestration
- ❌ No Galileo redesign
- ❌ No chat redesign
- ❌ No valuation workspace redesign
- ❌ No Advisor Brief
- ❌ No Galileo Home
- ❌ No capability management UI
- ❌ No Playbook UI
- ❌ No Skill UI
- ❌ No prompt suggestions
- ❌ No individual capability implementations
- ❌ No duplicate intelligence layer
- ❌ No duplicate conversation system
- ❌ No duplicate context engine

---

## 19. Stop Condition

| Requirement | Status |
|-------------|--------|
| Framework exists | ✅ |
| Registry exists | ✅ |
| Contracts exist | ✅ |
| Permission model exists | ✅ |
| Evidence model exists | ✅ |
| Placeholder capabilities registered | ✅ (20/20) |
| Report completed | ✅ |

**READY FOR GALILEO CAPABILITY FRAMEWORK REVIEW**