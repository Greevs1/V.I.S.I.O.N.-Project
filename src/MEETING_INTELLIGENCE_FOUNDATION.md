# Meeting Intelligence Foundation — Phase 15.3

**Date:** 2026-08-10
**Status:** Foundation Complete — Ready for Review

## Constitution Check

| # | Question | Answer |
|---|----------|--------|
| 1 | Does Meeting Intelligence already exist? | ❌ No — `generateAdvisorCommandCenter` is a per-client list aggregator, not meeting-specific preparation |
| 2 | Which certified systems already provide meeting data? | Executive Context, Business Timeline, Canonical Facts, Growth Plan, Valuation, Assessments, Executive Brief, Documents, Verification Queue, Sprint, Calendar, Galileo |
| 3 | Can this be implemented by extending Living Intelligence? | ✅ Yes — Meeting Intelligence is a composition layer that reads from Executive Context and other certified outputs |
| 4 | Does this duplicate Executive Brief? | ❌ No — Executive Brief is dashboard-oriented; Meeting Intelligence is meeting-specific with intent-based prioritization |
| 5 | Does this duplicate Galileo? | ❌ No — Meeting Intelligence works WITH Galileo, providing context for deeper conversation |
| 6 | Does this duplicate Business Timeline? | ❌ No — Meeting Intelligence reuses Business Timeline |
| 7 | Does this duplicate Valuation? | ❌ No — Meeting Intelligence references valuation status |
| 8 | Does this duplicate Growth Plan? | ❌ No — Meeting Intelligence references growth initiatives |
| 9 | Does this violate the Ownership Matrix? | ❌ No — Meeting Intelligence owns nothing; it is a composition layer |
| 10 | Does this create another recommendation engine? | ❌ No — Meeting Intelligence synthesizes existing recommendations |

**Verdict: PASS — No duplication. Meeting Intelligence is a composition layer.**

---

## Mission

Meeting Intelligence exists for one purpose:

> Allow an advisor to walk into any meeting feeling fully prepared in approximately two minutes.

It is NOT another report. It is NOT another Executive Brief. It is NOT another dashboard.

It is a meeting preparation layer that synthesizes certified intelligence.

---

## The Two-Minute Rule

Meeting Intelligence succeeds only if an advisor can answer:

- What changed?
- What deserves discussion?
- What decisions must be made?
- What should I celebrate?
- What should I ask?

within two minutes.

Every feature supports this rule.

---

## Architecture

```
Certified Engines (existing)
    │
    ├── Executive Context (Living Intelligence)
    ├── Business Timeline (CBSS)
    ├── Canonical Facts (Canonical Fact Resolver)
    ├── Growth Plan (Growth Plan Engine)
    ├── Business Valuation (Valuation Service)
    ├── Assessments (Assessment Engine)
    ├── Executive Brief (Executive Narrative Engine)
    ├── Documents (Document Service)
    ├── Verification Queue (Verification Queue Service)
    ├── Sprint (Sprint Aggregation)
    ├── Advisor Assignments
    └── Client Requests
         │
         ▼
Meeting Intelligence Coordinator (synthesis layer — no calculations)
    │
    ├── Meeting Context (reusable state object)
    ├── Meeting Intent (framework — determines priority focus)
    ├── Meeting Brief (two-minute reading model)
    │   ├── Meeting Summary
    │   ├── Since Last Meeting
    │   ├── Celebrate
    │   ├── Discuss
    │   ├── Decisions Required
    │   ├── Suggested Questions
    │   ├── Open Risks
    │   ├── Owner Wins
    │   ├── Advisor Notes (internal only)
    │   └── Client-Safe Brief
    ├── Suggested Questions (prompts, not conclusions)
    ├── Decision Moments (metadata only)
    ├── Meeting Timeline (reuses Business Timeline)
    ├── Advisor Mode (presentation priorities)
    ├── Post-Meeting Contract (framework only)
    └── Client-Safe Filtering
         │
         ▼
Existing UI (future integration — NOT built in this phase)
```

---

## Meeting Coordinator

**File:** `base44/shared/meetingIntelligence/coordinator.ts`

The Meeting Intelligence Coordinator is NOT an engine. It is a SYNTHESIS LAYER.

It observes certified outputs and builds meeting-specific preparation.

- It NEVER owns business truth.
- It NEVER performs calculations.
- It NEVER creates another recommendation engine.
- It NEVER synchronizes systems.
- It NEVER bypasses governance.

It ONLY composes existing intelligence into a Meeting Brief.

**Single entry point:** `buildMeetingIntelligence(input: MeetingIntelligenceInput): MeetingBrief`

---

## Meeting Intent

**File:** `base44/shared/meetingIntelligence/meetingIntent.ts`

Framework only — no AI reasoning.

### Supported Intents (17)

| Intent | Display Name | Cadence | Internal? |
|--------|-------------|---------|-----------|
| quarterly_review | Quarterly Review | Quarterly | No |
| monthly_review | Monthly Review | Monthly | No |
| tax_planning | Tax Planning | Annual | No |
| valuation_review | Valuation Review | Ad hoc | No |
| exit_planning | Exit Planning | Quarterly | No |
| annual_planning | Annual Planning | Annual | No |
| growth_planning | Growth Planning | Quarterly | No |
| cash_flow_review | Cash Flow Review | Monthly | No |
| operations_review | Operations Review | Monthly | No |
| acquisition | Acquisition Discussion | Ad hoc | No |
| due_diligence | Due Diligence | Ad hoc | No |
| board_meeting | Board Meeting | Quarterly | No |
| succession_planning | Succession Planning | Annual | No |
| discovery_call | Discovery Call | Ad hoc | No |
| strategy_session | Strategy Session | Ad hoc | No |
| internal_advisor_review | Internal Advisor Review | Weekly | Yes |
| custom | Custom Meeting | Ad hoc | No |

### Meeting Intent Determines

- **Priority Focus** — which business dimensions to emphasize
- **Context Emphasis** — which certified systems to highlight
- **Decision Focus** — default decision areas for this meeting type
- **Typical Cadence** — for time-since-last-meeting context
- **Internal Flag** — whether this intent is advisor-internal only

---

## Meeting Context

**File:** `base44/shared/meetingIntelligence/meetingContext.ts`

A reusable object that holds everything the coordinator needs to synthesize a brief.

### Includes

| Field | Source (Certified Owner) |
|-------|------------------------|
| Business | Business Profile |
| Participants | Advisor Assignments |
| Advisor | Advisor Assignments |
| Meeting Intent | Meeting Intent Framework |
| Time since previous meeting | Computed from previous meeting date |
| Major business changes | Executive Context / CBSS |
| Completed initiatives | Sprint Aggregation |
| Outstanding requests | Client Request Service |
| Pending reviews | Verification Queue |
| Pending approvals | Verification Queue / Valuation Service |
| Publication status | Valuation Service |
| Current priorities | Executive Context |
| Risks | Executive Context |
| Opportunities | Executive Context / Growth Plan |
| Business confidence | Confidence Engine |
| Business momentum | Living Intelligence |
| Recent milestones | Business Timeline |

Everything references existing certified owners — nothing is recalculated.

---

## Meeting Brief Model

**File:** `base44/shared/meetingIntelligence/meetingBrief.ts`

Maximum reading time: two minutes.

### Sections

| Section | Purpose | Max Items |
|---------|---------|-----------|
| Meeting Summary | Headline + one-line context + intent label | 1 |
| Since Last Meeting | Completed, changed, new, blocked | 10 each |
| Celebrate | Wins since last meeting | 5 |
| Discuss | Topics that deserve discussion | 5 |
| Decisions Required | Decision moments for this meeting | 8 |
| Suggested Questions | Discussion prompts with evidence | 7 |
| Open Risks | Current risks | 3 |
| Owner Wins | Owner-facing celebration | 5 |
| Advisor Notes | Internal only — excluded from client brief | 5 |
| Client-Safe Brief | Filtered version for client sharing | All above minus advisor notes |
| Meeting Timeline | Reuses Business Timeline | 10 per status |

This is the CONTRACT — no UI, no text generation beyond synthesis.

---

## Suggested Questions

**File:** `base44/shared/meetingIntelligence/suggestedQuestions.ts`

Meeting Intelligence generates structured discussion prompts — NOT conclusions.

### Question Sources

| Source | Question Type |
|--------|-------------|
| Business Changes | "What drove this change, and is it expected to continue?" |
| Risks | "What's your perspective on mitigation?" |
| Opportunities | "Should we prioritize this in the next cycle?" |
| Pending Reviews | "What's your recommendation?" |
| Outstanding Requests | "Can you provide an update?" |
| Momentum (declining/mixed) | "What factors are driving this?" |

### Every Question References Certified Evidence

```typescript
interface SuggestedQuestion {
  prompt: string;          // The discussion prompt
  why_ask: string;         // Why this question matters
  evidence_references: QuestionEvidence[];  // Certified sources
  intent_relevance: MeetingIntentType[];     // Which intents this question fits
  confidence_source: MeetingConfidenceSource;
}
```

### Examples

- "Revenue increased 15% while labor costs also increased. What changed operationally?"
- "Customer concentration increased. Was this intentional?"
- "Your recurring revenue accelerated. How sustainable is that trend?"

These are prompts. Not conclusions.

---

## Decision Moments

**File:** `base44/shared/meetingIntelligence/decisionMoments.ts`

Decision Moments are METADATA ONLY — no workflow changes.

### Decision Moment Types (12)

| Type | Description |
|------|-------------|
| approve_valuation_assumption | Review and approve valuation inputs |
| request_documents | Follow up on outstanding document requests |
| finalize_add_back | Review and finalize proposed add-backs |
| review_tax_strategy | Assess tax gap and finalize strategy |
| prioritize_growth_plan | Review and prioritize growth initiatives |
| approve_publication | Approve valuation for publication |
| complete_verification | Resolve items blocking publication |
| assign_advisor | Review and adjust advisor assignments |
| resolve_conflict | Resolve conflicting values from sources |
| approve_initiative | Approve new growth initiative |
| review_assessment | Review recently completed assessments |
| schedule_follow_up | Schedule next meeting |

Decision Moments are identified from the Meeting Context — they do NOT create new workflows.

---

## Meeting Timeline

**File:** `base44/shared/meetingIntelligence/meetingBrief.ts` (buildMeetingTimeline)

Reuses Business Timeline — does NOT create another timeline.

### Timeline Categories

| Category | Source |
|----------|--------|
| Completed since last meeting | Timeline entries with status 'completed' after previous meeting date |
| Started | Timeline entries with status 'started' |
| Blocked | Timeline entries with status 'blocked' |
| Waiting on owner | Timeline entries with waiting_on = 'owner' |
| Waiting on advisor | Timeline entries with waiting_on = 'advisor' |
| Waiting on documents | Timeline entries with waiting_on = 'documents' |
| Waiting on verification | Timeline entries with waiting_on = 'verification' |
| Waiting on publication | Timeline entries with waiting_on = 'publication' |

---

## Advisor Mode

**File:** `base44/shared/meetingIntelligence/advisorMode.ts`

Advisor Mode changes PRESENTATION priorities. It does NOT change business truth.

### Emphasis Areas

| Emphasis | What It Does |
|----------|-------------|
| Decision support | Prioritize decision moments in presentation |
| Discussion prompts | Prioritize suggested questions |
| Risks | Prioritize open risks |
| Evidence | Prioritize evidence references |
| Preparation | Prioritize advisor notes |

Advisor Mode NEVER changes calculations. It only signals to the UI which sections to emphasize.

---

## Post-Meeting Contract

**File:** `base44/shared/meetingIntelligence/postMeetingContract.ts`

FRAMEWORK ONLY — no implementation.

### Defines

| Area | Content |
|------|---------|
| What should be remembered | Meeting Decisions, Action Items, Follow-Up Commitments, Discussion Highlights, Open Questions |
| Meeting outcomes | Decisions, action items, commitments, open questions, next meeting |
| Follow-up items | Advisor, owner, system follow-ups |
| Advisor commitments | Review tasks, valuation updates, client follow-up, growth plan updates |
| Owner commitments | Documents, confirmations, action items, preparation |
| Business Memory relationship | Post-meeting feeds Business Memory (one-way) |
| Timeline relationship | Post-meeting triggers existing systems, does NOT create timeline entries directly |

### Extension Points

- Meeting Replay™
- Meeting Transcripts™
- Action Item Intelligence™
- Automatic Follow-Up™
- Predictive Meeting Preparation™
- Business Memory™
- Business DNA™
- Business Twin™

---

## Galileo Integration

Meeting Intelligence works WITH Galileo — NOT separately.

### Reuse

| Galileo Element | How Meeting Intelligence Uses It |
|----------------|-------------------------------|
| Executive Context | Meeting Context reads from Executive Context |
| Business Context | Galileo context loading unchanged |
| Meeting Intent | Passed to Galileo for conversation focus |
| Evidence | Suggested Questions evidence feeds Galileo context |
| Permissions | Existing permission architecture reused |
| Conversation scope | Existing scope management unchanged |

**No new chat. No new AI interface. Galileo remains the single AI interface.**

Every Meeting Brief section supports deeper conversation through the existing Galileo experience.

---

## Executive Session Governance

Meeting preparation itself is FREE.

### Free Interactions

| Interaction | Cost |
|-------------|------|
| Meeting Brief | Free |
| Talking points | Free |
| Recent changes | Free |
| Open risks | Free |
| Suggested questions | Free |

### Executive Session Consumed

Deeper strategic planning may consume Executive Sessions:

| Interaction | Cost |
|-------------|------|
| "Create a negotiation strategy" | Executive Session |
| "Model three acquisition scenarios" | Executive Session |
| "Simulate buyer objections" | Executive Session |

**Existing Executive Session governance reused. No new metering.**

---

## Client Safe

**File:** `base44/shared/meetingIntelligence/clientSafe.ts`

Two contracts:

### Advisor Brief

May include:
- Internal review items
- Draft valuation observations
- Internal risks
- Pending advisor actions
- Advisor notes

### Client Brief

Excludes:
- Internal methodology
- Hidden notes (advisor_notes)
- Draft adjustments
- Internal discussions

**Reuses existing permission architecture — no new permission system.**

---

## Constitution Compliance

| Article | Compliance |
|---------|-----------|
| Article I — One Truth | ✅ Meeting Intelligence reads from canonical facts, does not create truth |
| Article II — Single Ownership | ✅ Meeting Intelligence owns "meeting preparation", not business facts |
| Article III — No Duplicate Intelligence | ✅ Meeting Intelligence synthesizes, does not duplicate |
| Article IV — Explainability | ✅ Every section cites certified owner and evidence |
| Article V — Advisor Governance | ✅ Meeting Intelligence prepares, does not decide |
| Article VI — Permission Respect | ✅ Client-safe follows existing permission architecture |
| Article VII — Extension First | ✅ Post-Meeting Contract is an extension point |
| Article VIII — Canonical First | ✅ Meeting Context reads canonical facts first |
| Article IX — Sync First | ✅ Meeting Intelligence reads synced state, does not bypass |
| Article X — No Hardcoded Fallbacks | ✅ No hardcoded values — all from certified inputs |
| Article XI — Business Isolation | ✅ Meeting Context is per-business, no leakage |
| Article XII — Valuation Immutability | ✅ Meeting Intelligence does not modify valuations |
| Article XIII — Constitution Supremacy | ✅ Meeting Intelligence is a new subsystem, registered |

---

## Reuse Summary

| Certified Engine | Meeting Intelligence Role | New Code Needed |
|-----------------|--------------------------|-----------------|
| Executive Context (Living Intelligence) | Primary source for business state, momentum, priorities | None (read-only) |
| Business Timeline (CBSS) | Source for meeting timeline | None (read-only) |
| Canonical Fact Resolver | Source for canonical facts | None (read-only) |
| Growth Plan Engine | Source for opportunities | None (read-only) |
| Valuation Service | Source for publication status | None (read-only) |
| Assessment Engine | Source for assessment results | None (read-only) |
| Executive Narrative Engine | Source for business narrative | None (read-only) |
| Document Service | Source for document status | None (read-only) |
| Verification Queue | Source for pending reviews | None (read-only) |
| Sprint Aggregation | Source for completed initiatives | None (read-only) |
| Client Request Service | Source for outstanding requests | None (read-only) |
| Confidence Engine | Source for business confidence | None (read-only) |
| Galileo | Deeper conversation interface | None (handoff only) |
| Executive Session Governance | Session metering | None (reused) |

**Reuse Score: 14/14 existing engines reused, 0 new engines created, 0 new recommendation engines**

---

## Future Compatibility

### Extension Points Prepared

| Future Capability | Extension Point |
|-------------------|----------------|
| Business Memory™ | Post-Meeting Contract defines memory relationship |
| Business DNA™ | Post-Meeting Contract extension points |
| Business Twin™ | Post-Meeting Contract extension points |
| Meeting Replay™ | Post-Meeting Contract extension points |
| Meeting Transcripts™ | Post-Meeting Contract extension points |
| Action Item Intelligence™ | Post-Meeting Contract extension points |
| Automatic Follow-Up™ | Post-Meeting Contract extension points |
| Predictive Meeting Preparation™ | Post-Meeting Contract extension points |

**Do NOT implement. Architecture prepared only.**

---

## Files Created

| File | Purpose |
|------|---------|
| `base44/shared/meetingIntelligence/types.ts` | All type definitions |
| `base44/shared/meetingIntelligence/meetingIntent.ts` | Meeting Intent framework (17 intents) |
| `base44/shared/meetingIntelligence/meetingContext.ts` | Meeting Context builder |
| `base44/shared/meetingIntelligence/meetingBrief.ts` | Meeting Brief model builder |
| `base44/shared/meetingIntelligence/suggestedQuestions.ts` | Suggested Questions synthesis |
| `base44/shared/meetingIntelligence/decisionMoments.ts` | Decision Moments identification |
| `base44/shared/meetingIntelligence/advisorMode.ts` | Advisor Mode (presentation priorities) |
| `base44/shared/meetingIntelligence/postMeetingContract.ts` | Post-Meeting Contract (framework only) |
| `base44/shared/meetingIntelligence/clientSafe.ts` | Client-safe filtering |
| `base44/shared/meetingIntelligence/coordinator.ts` | Meeting Intelligence Coordinator |
| `base44/shared/meetingIntelligence/index.ts` | Public API |

---

## Stop Condition Verification

| Requirement | Status |
|-------------|--------|
| Do NOT redesign Meeting UI | ✅ No UI built |
| Do NOT build scheduling | ✅ No scheduling built |
| Do NOT build transcripts | ✅ No transcripts built |
| Do NOT build Business Memory | ✅ Framework only (Post-Meeting Contract) |
| Do NOT build Meeting Replay | ✅ Extension point only |
| Do NOT build Action Items | ✅ Extension point only |
| Do NOT build Business Twin | ✅ Extension point only |
| Do NOT change Galileo | ✅ Galileo unchanged |
| Do NOT change Executive Brief | ✅ Executive Brief unchanged |
| Do NOT change Living Intelligence | ✅ Living Intelligence unchanged (read-only) |
| Report created | ✅ This document |

---

## The Golden Rule

> Meeting Intelligence exists to answer one question:
> "If I walked into this meeting in two minutes, what do I absolutely need to know?"
>
> Everything else is secondary.

---

## Phase 15.3A — Meeting Intelligence Integration Pilot

**Date:** 2026-08-10
**Status:** CERTIFIED — Meeting Intelligence Experience Certified

The Meeting Intelligence Foundation has been integrated into the existing Advisory Hub. The `AdminUserProfileContext` Overview section is enriched with a Two-Minute Meeting Brief — no new page, no new dashboard, no new AI interface.

### Implemented Components

- `base44/functions/meetingIntelligence/entry.ts` — Backend synthesis function (getMeetingBrief action)
- `src/hooks/useMeetingIntelligence.js` — Non-blocking, keyed by businessId + intent
- `src/components/advisor/MeetingBriefPanel.jsx` — Two-Minute Brief with progressive disclosure
- `src/components/advisor/MeetingIntentSelector.jsx` — 17-intent selector
- `src/components/admin/AdminUserProfileContext.jsx` — Overview section enriched

### Architecture

```
Existing Advisor Hub (AdminUserProfileContext)
    → Meeting Brief Panel (new component, existing UI patterns)
        → Meeting Intent Selector (17 intents)
        → Two-Minute Brief (6 visible sections)
        → Progressive Disclosure (risks, wins, notes)
        → Client-Safe Preview toggle
        → Galileo handoff (existing Galileo panel)
    → meetingIntelligence backend function
        → buildMeetingIntelligence (synthesis only)
        → Executive Context + Verification Queue + Last Meeting
```

### Reuse Score: 100% existing UI patterns, 0 new pages, 0 new dashboards

### Two-Minute Test: PASS (all 5 questions: Immediate)

### Intent Differentiation: PASS (same business, different emphasis)

### Multi-Business Isolation: PASS (P0 on leakage)

### No Post-Meeting Automation: PASS (extension points only)

See `src/MEETING_INTELLIGENCE_INTEGRATION_REPORT.md` for full certification.

---

## Phase 15.4 — Post-Meeting Intelligence Foundation

**Date:** 2026-08-10
**Status:** CERTIFIED — Post-Meeting Intelligence Foundation Certified

The Post-Meeting Contract has been implemented as a governed bridge between Meeting → Advisor Review → Existing Certified Systems.

### Implemented Components

- `base44/shared/meetingIntelligence/postMeetingTypes.ts` — Outcome contract types (13 certified types)
- `base44/shared/meetingIntelligence/outcomeOwnership.ts` — Destination ownership map + risk classification + validation
- `base44/shared/meetingIntelligence/outcomeSynthesis.ts` — Rule-based outcome synthesis (no LLM, no inference)
- `base44/shared/meetingIntelligence/duplicateDetection.ts` — Duplicate checking against existing items
- `base44/shared/meetingIntelligence/clientSafeCloseout.ts` — Client-safe filtering for follow-up preview
- `base44/shared/meetingIntelligence/auditTrail.ts` — Audit entries for every action
- `base44/shared/meetingIntelligence/closeoutBuilder.ts` — Closeout state assembly
- `base44/functions/postMeetingIntelligence/entry.ts` — Backend API (routes to existing services)
- `src/hooks/usePostMeetingIntelligence.js` — Non-blocking hook
- `src/components/advisor/OutcomeCard.jsx` — Outcome card with approve/edit/dismiss/defer
- `src/components/advisor/MeetingCloseoutDrawer.jsx` — Closeout drawer (existing pattern)
- `src/components/advisor/MeetingBriefPanel.jsx` — Extended with Closeout button

### Architecture: Governed Bridge

```
Meeting Brief Panel (existing)
    → Closeout button (new)
    → Meeting Closeout Drawer (new, existing pattern)
        → Advisor enters notes + explicit decisions
        → Synthesize proposed outcomes (rule-based)
        → Review outcomes (approve/edit/dismiss/defer)
        → Client-safe follow-up preview
    → postMeetingIntelligence backend
        → Routes approved outcomes to EXISTING write services
```

### Key Principles

- **No new tables created** — all outcomes route to existing owners (ClientNote, ninetyDaySprint, valuationService, verificationQueueService)
- **No transcript ingestion** — only structured sources (Meeting Brief, advisor notes, explicit decisions, Galileo context)
- **No Business Memory persistence** — memory candidates classified but not persisted
- **AI proposes, advisor confirms, existing systems execute**
- **High-risk outcomes require individual confirmation through existing owner workflow**
- **Duplicate prevention checks existing items before creating**
- **Quiet state valid** — no manufacturing of tasks or decisions

See `src/POST_MEETING_INTELLIGENCE_FOUNDATION.md` for full certification.

---

## Phase 15.5 — Business Memory Integration

**Date:** 2026-08-10
**Status:** CERTIFIED

Meeting Intelligence may now read relevant confirmed Business Memory to enrich meeting preparation. Memory provides durable executive context — "what should remain meaningful later" — without outranking current truth.

Example enrichment: "This initiative matters because the owner previously identified a 2028 exit as the primary objective."

Memory is retrieved via `getRelevantBusinessMemories` with meeting_intent mapping to relevance tags. Only confirmed, client-safe memories are returned for owner-facing contexts.

See `src/BUSINESS_MEMORY_FOUNDATION.md` for full certification.

---

## READY FOR MEETING INTELLIGENCE FOUNDATION REVIEW