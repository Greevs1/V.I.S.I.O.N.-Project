# Galileo Executive Intelligence Engine (EIE) — Phase 13.4C.1

**Date:** 2026-08-07
**Status:** Decision-making brain complete. No UI. No LLM. No capability execution.
**Certification:** READY FOR EXECUTIVE INTELLIGENCE REVIEW

---

## 1. Philosophy

Galileo is not a chatbot. Galileo is not an assistant.

Galileo is the **Executive Intelligence layer** for V.I.S.I.O.N.

Its first responsibility is NOT answering questions.

Its first responsibility is **understanding**:

- Where am I?
- What is happening?
- What matters?
- What should happen next?

Only then should it invoke a capability.

---

## 2. Architecture

There is ONE Galileo. The EIE extends the certified architecture:

- One Capability Framework
- One Context Builder
- One Conversation System
- **One Executive Intelligence Engine**

The EIE is the **only decision layer**. Nothing invokes capabilities directly. Every request flows through the EIE.

```
User Message + Context
       │
       ▼
┌─────────────────────────────┐
│    Executive Intelligence   │
│         Engine (EIE)        │
│                             │
│  1. Build Executive State   │
│  2. Assess Situation        │
│  3. Determine Priorities    │
│  4. Resolve Intent          │
│  5. Select Capability       │
│  6. Determine Strategy       │
│  7. Generate Recommendations│
│  8. Plan Follow-up          │
│  9. Determine Interruption  │
│ 10. Build Executive Brief   │
│ 11. Assess Confidence       │
│ 12. Validate Safety         │
└─────────────────────────────┘
       │
       ▼
   EIE Decision
       │
       ▼
   (Future) Capability Pipeline
```

---

## 3. File Structure

```
base44/shared/galileo/executive/
├── types.ts                  — All type definitions (ExecutiveState, Intent, Priority, etc.)
├── stateModel.ts             — Executive State Model builder
├── situationAssessment.ts    — Situation assessment (where, what, what changed, incomplete, blocked, urgent)
├── priorityEngine.ts         — Priority determination (Critical/High/Medium/Low)
├── intentResolution.ts       — Intent resolution (11 intent types + fallback)
├── capabilitySelection.ts    — Capability selection (engine chooses, not user)
├── executionStrategy.ts      — Execution strategy (Quick/Advisor/Executive/Preview/Read/Draft/Review/Recommend/Confirm)
├── workingMemory.ts           — Engagement-scoped working memory (expires with workflow)
├── recommendationEngine.ts   — Recommendation generation (reason, priority, impact, confidence, next capability)
├── followUpPlanner.ts         — Follow-up planning using capability graph
├── interruptionPolicy.ts     — Interruption rules (silent/surface/recommend/urgent/blocking)
├── executiveBrief.ts         — Executive Brief model for Galileo Home
├── confidenceModel.ts        — Confidence assessment (never fabricates certainty)
├── safety.ts                 — Safety constraints (read-only, cannot write/publish/assign/approve/modify/delete)
├── analytics.ts              — Analytics tracking (no conversation storage)
├── engine.ts                 — Main EIE orchestrator (process function)
└── index.ts                  — Public API
```

---

## 4. Executive State Model

A unified state object summarizing everything the EIE needs to know:

| Field | Description |
|-------|-------------|
| Current User | userId, userEmail, userRole |
| Current Role | resolvedRole (super_admin/admin/advisor/team_member/owner/viewer) |
| Current Business | businessId, businessName, industry |
| Current Valuation | valuationId, valuationStatus |
| Current Workspace | currentWorkspace, currentRoute, currentPage |
| Focused Record | focusedRecordType, focusedRecordId |
| Assignment State | isAssignedAdvisor, assignedBusinessIds |
| Conversation Scope | profileId, businessId, valuationId, mode, visibility |
| Membership Tier | membershipTier |
| Executive Sessions | sessionsRemaining, sessionsUsed |
| Active Workflow | activeWorkflow |
| Pending Tasks | pendingTasks[] |
| Publication State | status, blockers, readyForPublication |
| Growth Plan State | totalInitiatives, approvedInitiatives, clientVisibleInitiatives, readyInitiatives, progress |
| Verification State | pendingVerifications, unresolvedConflicts, completedVerifications |
| Meeting Context | upcomingMeeting, meetingType, meetingDate, daysUntilMeeting |
| Recent Changes | recentChanges[] (type, description, timestamp, impact) |
| Current Priorities | currentPriorities[] |

**No UI. No persistence. Pure state model.**

---

## 5. Situation Assessment

The first reasoning stage. Determines:

| Question | How |
|----------|-----|
| Where is the user? | Workspace → Route → Business → Dashboard |
| What are they working on? | Active workflow → Valuation → Growth Plan → Focused record |
| What changed? | Most recent change from recentChanges[] |
| What is incomplete? | Pending tasks, publication readiness, verifications, growth plan approvals |
| What is blocked? | Publication blockers, unresolved conflicts |
| What is urgent? | Meetings within 2 days, critical/high priority tasks |

Returns a structured `SituationAssessment` with a summary string.

**No LLM. Pure reasoning.**

---

## 6. Priority Engine

Determines priority levels with explainable reasoning:

| Priority | Trigger | Example |
|----------|---------|---------|
| **Critical** | Publication blocked | "Publication cannot proceed until blockers are resolved." |
| **Critical** | Unresolved conflicts | "Data conflicts undermine valuation confidence." |
| **High** | Meeting soon (≤7 days) | "Meeting preparation should be completed before the meeting." |
| **High** | Pending verifications | "Verifications are required before valuation can be finalized." |
| **Medium** | Document uploaded | "New documents may contain data relevant to the valuation." |
| **Medium** | Growth plan incomplete | "Growth plan initiatives should be reviewed and approved." |
| **Low** | Growth plan complete | "Growth plan is complete; consider next strategic steps." |

Every priority includes an `explainable` field — the reasoning behind the priority level.

---

## 7. Intent Resolution

Determines user intent from their message. 11 intent types:

| Intent | Keywords |
|--------|----------|
| Understand | what, why, how, explain, mean, understand |
| Review | review, check, verify, validate, assess |
| Investigate | investigate, conflict, discrepancy, mismatch |
| Prepare | prepare, meeting, client meeting, buyer meeting |
| Compare | compare, difference, versus, vs, delta |
| Plan | plan, growth, initiative, 90 day, sprint, roadmap |
| Publish | publish, share, deliver, report |
| Explain | explain, break down, walk me through |
| Navigate | where, go to, find, navigate, open |
| Learn | learn, education, tutorial, guide |
| Execute | execute, run, do, start, begin, generate |

### Fallback

When intent is ambiguous, the engine uses:
1. Top priority category → intent mapping
2. Current workspace → intent mapping
3. Default: `understand`

The fallback is transparent — `fallbackUsed: true` with a reason.

---

## 8. Capability Selection

**The EIE chooses which capability should execute. Not the user.**

The user simply asks. The engine selects.

Returns:
- `selectedCapabilityId` — The chosen capability
- `confidence` — How confident the engine is in the selection
- `whySelected` — The reasoning behind the selection
- `alternativeCapabilityIds` — Other capabilities that could match
- `blockedCapabilityIds` — Capabilities that can't execute due to missing context
- `missingContext` — What's needed to unblock

### Selection Logic

1. Map intent → candidate capabilities
2. Check context requirements for each candidate
3. Block candidates with missing context
4. Prefer capability related to top priority
5. Fall back to first available candidate
6. If all blocked, report why

---

## 9. Execution Strategy

Determines how the capability should execute. Never executes automatically.

| Strategy | When | Session? | Confirm? |
|----------|------|----------|----------|
| Quick | Free capabilities (document review) | No | No |
| Preview | Sessions exhausted | No | No |
| Read | Educational/navigate intent | No | No |
| Review | Compare intent | Yes | No |
| Advisor | Strategic capabilities (default) | Yes | No |
| Draft | Drafting content | Yes | No |
| Recommend | Blocked capability | No | No |
| Confirm | Publication intent | Yes | Yes |

---

## 10. Executive Memory

Engagement-scoped working memory. **NOT user memory.**

- Expires with workflow (TTL-based)
- Never replaces platform memory
- In-memory only, no persistence

### API

```typescript
createMemory(scope, ttlMs)     — Create a new memory scope
recordFact(memoryId, key, value, category) — Record a fact
getFact(memoryId, key)         — Retrieve a fact
getFactsByCategory(memoryId, category) — Retrieve facts by category
clearMemory(memoryId)          — Clear a memory
clearExpiredMemories()         — Clean up expired memories
```

### Example Facts

- `meeting_tomorrow` → "Client meeting at 2pm" (category: meeting)
- `owner_preparing_exit` → "Owner is preparing for exit within 2 years" (category: context)
- `unresolved_conflicts` → "3 unresolved conflicts in financial data" (category: verification)

---

## 11. Recommendation Engine

Generates recommendations, not responses.

Every recommendation includes:
- `reason` — Why this recommendation
- `priority` — Critical/High/Medium/Low
- `estimatedImpact` — What it achieves
- `confidence` — 0-100 confidence score
- `nextCapabilityId` — Which capability to execute
- `nextCapabilityName` — Human-readable name
- `intent` — The intent type
- `executionStrategy` — How to execute
- `missingEvidence` — What's needed for higher confidence

### Recommendation Sources

1. **Priorities** — Each priority becomes a recommendation
2. **Incomplete items** — "Review Incomplete Items"
3. **Opportunities** — "Increase Enterprise Value" when initiatives are ready

---

## 12. Follow-up Planner

Determines what should happen after capability execution.

**No hardcoded flows.** Uses the capability graph.

### Capability Graph

Each capability declares its follow-up capabilities with:
- `next` — The next capability ID
- `reason` — Why this follow-up
- `priority` — Priority of the follow-up
- `optional` — Whether it's optional

### Example Chain

```
explain.enterprise_value
  → explain.confidence (optional, medium)
  → investigate.conflict (optional, high)
  → increase.enterprise_value (optional, medium)
    → build.90_day_plan (required, high)
      → prepare.client_meeting (optional, medium)
```

---

## 13. Interruption Policy

Galileo should NOT interrupt users. Five levels:

| Level | When | Notify? | Galileo Home? |
|-------|------|---------|---------------|
| **Silent** | Low priority or not relevant | No | No |
| **Surface** | Medium priority + relevant workspace | No | No |
| **Recommend** | High priority | No | No |
| **Urgent** | Critical priority or meeting today | Yes | Yes |
| **Blocking** | Critical publication blocker + advisor/admin | Yes | Yes |

This controls future Galileo Home behavior.

---

## 14. Executive Brief Model

A structured object ready for Galileo Home. No UI.

| Section | Content |
|---------|---------|
| Today | Where the user is |
| What's Changed | Recent changes (up to 5) |
| Priorities | Top 5 priorities |
| Risks | Blocked items, conflicts, publication issues |
| Opportunities | Ready initiatives, execution recommendations |
| Meetings | Upcoming meetings |
| Recommendations | Top 5 recommendations |
| Progress | Growth plan, verifications, publication progress |
| Executive Sessions | Remaining, used, unlimited |

---

## 15. Confidence Model

Every executive recommendation returns:
- `confidence` — 0-100
- `reasoningCompleteness` — 0-100
- `evidenceCompleteness` — 0-100
- `missingEvidence` — List of missing items
- `neverFabricate` — Always true

### Confidence Calculation

```
confidence = ((reasoningCompleteness + evidenceCompleteness) / 2) - (missingEvidence.length * 10)
```

### Labels

| Score | Label |
|-------|-------|
| 80-100 | High |
| 60-79 | Moderate |
| 40-59 | Low |
| 0-39 | Very Low |

**Never fabricates certainty.**

---

## 16. Safety

The Executive Intelligence Engine **cannot**:
- write
- publish
- assign
- approve
- modify
- delete

Its only responsibility is **deciding**.

### Safety Check

```typescript
validateSafety(action)  → { isReadOnly, violations, allowedActions }
assertReadOnly(action)   → throws if violation
getSafetyPolicy()        → { canWrite: false, canPublish: false, ... }
```

### Forbidden Actions

`write`, `publish`, `assign`, `approve`, `modify`, `delete`, `create`, `update`, `remove`, `execute_write`, `grant_access`

### Allowed Actions

`decide`, `recommend`, `assess`, `analyze`, `select`, `plan`, `read`, `review`, `explain`, `summarize`, `prioritize`

---

## 17. Analytics

Tracks governance analytics. **No conversation storage.** Only metadata.

| Metric | Description |
|--------|-------------|
| `recommendationsGenerated` | Total recommendations generated |
| `recommendationsAccepted` | Total recommendations accepted |
| `recommendationsDismissed` | Total recommendations dismissed |
| `intentDetectionAccuracy` | Intent detection accuracy (%) |
| `capabilitySelections` | Per-capability selection count |
| `priorityDistribution` | Count per priority level |
| `totalDecisions` | Total EIE decisions processed |

---

## 18. Decision Pipeline

The `process(input)` function runs the full pipeline:

```
Input: { userMessage, context }
  │
  ├── 1. buildExecutiveState(context, []) → state
  ├── 2. assessSituation(state) → assessment
  ├── 3. determinePriorities(state, assessment) → priorities
  ├── 4. buildExecutiveState(context, priorities) → state (with priorities)
  ├── 5. resolveIntent(message, state, assessment, priorities) → intent
  ├── 6. selectCapability(intent, state, assessment, priorities) → selection
  ├── 7. determineStrategy(selection, state, intent) → strategy
  ├── 8. generateRecommendations(state, assessment, priorities) → recommendations
  ├── 9. planFollowUp(selection.selectedCapabilityId, state) → followUpPlan
  ├── 10. determineInterruption(recommendations[0], state) → interruption
  ├── 11. buildExecutiveBrief(state, assessment, priorities, recommendations) → brief
  ├── 12. assessConfidence(recommendations[0], state) → confidence
  ├── 13. validateSafety('decide') → safety
  │
  └── Track analytics
      │
      ▼
   EIEDecision { state, assessment, priorities, intent, selection, strategy,
                  recommendations, followUpPlan, interruption, brief, confidence, safety }
```

---

## 19. Validation Results

| Component | Status |
|----------|--------|
| State builder | ✅ Pass |
| Situation assessment | ✅ Pass (where, workflow, incomplete: 4, blocked: 3, urgent: 2) |
| Priority engine | ✅ Pass (6 priorities, critical detected, all explainable) |
| Intent engine | ✅ Pass (review, understand, prepare detected; ambiguous fallback works) |
| Capability selector | ✅ Pass (correct selection, blocked detection, missing context) |
| Execution strategy | ✅ Pass (advisor for strategic, preview when exhausted, quick for free) |
| Recommendation engine | ✅ Pass (5 recommendations, all have reason/impact/confidence/next capability) |
| Follow-up planner | ✅ Pass (3 steps, all have reasons, capability graph works) |
| Interruption policy | ✅ Pass (urgent level for critical, shouldNotify, showInHome) |
| Executive brief | ✅ Pass (all sections populated) |
| Confidence model | ✅ Pass (65% confidence, 80% reasoning, never fabricate) |
| Safety | ✅ Pass (read-only enforced, write/delete/publish blocked) |
| Working memory | ✅ Pass (create, record, get, filter by category, clear, expire) |
| Full pipeline | ✅ Pass (all 12 stages produce EIEDecision) |
| Advisor context | ✅ Pass (unlimited sessions, correct intent/selection) |
| Empty context | ✅ Pass (graceful handling, blocked capabilities, safety holds) |
| Analytics | ✅ Pass (tracking decisions, recommendations, selections, priorities) |

---

## 20. What Was NOT Built

Per the phase requirements:

- ❌ No Galileo redesign
- ❌ No chat redesign
- ❌ No AI capability implementation
- ❌ No Galileo Home
- ❌ No autonomous agents
- ❌ No proactive recommendations (surface layer)
- ❌ No capability execution
- ❌ No LLM calls
- ❌ No UI
- ❌ No persistence
- ❌ No conversation storage

---

## 21. Future Integration

### Galileo Orchestrator (Future Phase)

The future orchestrator will:
1. Receive user message + context
2. Call `process(input)` → `EIEDecision`
3. If `safety.isReadOnly` → proceed
4. If `executionStrategy.type` is `preview` → show preview
5. If `executionStrategy.type` is `quick` → run free capability
6. If `executionStrategy.requiresSession` → check governance → execute
7. After execution → use `followUpPlan` to suggest next steps
8. Use `interruptionDecision` to control Galileo Home visibility

### Galileo Home (Future Phase)

The `ExecutiveBrief` is the data model for Galileo Home:
- `today` → Header
- `whatsChanged` → Activity feed
- `priorities` → Priority cards
- `risks` → Risk alerts
- `opportunities` → Opportunity cards
- `meetings` → Meeting countdown
- `recommendations` → Recommended actions
- `progress` → Progress bars
- `executiveSessions` → Session indicator

### Autonomous Intelligence (Future Phase)

The EIE's `processWithoutMessage(context)` function enables autonomous intelligence:
- Runs the full pipeline without a user message
- Uses fallback intent based on context
- Generates proactive recommendations
- Determines interruption level for Galileo Home

---

## 22. Stop Condition

| Requirement | Status |
|-------------|--------|
| Executive Intelligence Engine complete | ✅ |
| State model complete | ✅ |
| Recommendation engine complete | ✅ |
| Working memory complete | ✅ |
| Report complete | ✅ |

**READY FOR EXECUTIVE INTELLIGENCE REVIEW**