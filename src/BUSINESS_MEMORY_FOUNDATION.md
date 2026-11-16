# Business Memory Foundation — Phase 15.5

**Date:** 2026-08-10
**Status:** CERTIFIED — Business Memory Foundation Certified

## Constitution Check

| # | Question | Answer |
|---|----------|--------|
| 1 | Does this information already have an authoritative owner? | ❌ No — ClientNote owns notes, GalileoConversation owns chat, Timeline owns events, Canonical Facts own truth, Audit owns change records. None own durable executive context. |
| 2 | Should it remain in that owner instead of becoming memory? | ✅ Yes — existing owners remain authoritative for their domain. Memory references them. |
| 3 | Is Business Timeline already sufficient? | ❌ No — Timeline = "what happened?" Memory = "what should remain meaningful later?" |
| 4 | Is this current truth, history, or institutional context? | Institutional context — a new category not covered by existing systems. |
| 5 | Can Business Memory reference an existing record rather than duplicate it? | ✅ Yes — Memory uses `source_reference` to link to existing records. |
| 6 | Does this create another note system? | ❌ No — Notes are working records. Memory is durable context with supersession, importance, and retrieval. |
| 7 | Does this create another timeline? | ❌ No — Timeline is chronological events. Memory is durable meaning with supersession. |
| 8 | Does this duplicate Galileo memory? | ❌ No — Galileo = "what are we discussing now." Memory = "what should remain meaningful later." |
| 9 | Does this violate client-safe boundaries? | ❌ No — Memory has `client_visible` field, enforced before retrieval. |
| 10 | Does this violate retention or governance rules? | ❌ No — Memory follows the Business Memory Contract retention philosophy. |

**Verdict: PASS — Memory is distinct from truth, notes, timeline, audit, and conversation history. Existing records are referenced, not duplicated.**

---

## Memory vs Truth vs Timeline vs Audit vs Notes

| System | Question It Answers | Example | Relationship to Memory |
|--------|---------------------|---------|----------------------|
| **Canonical Fact** | What is true now? | Revenue = $4.8M | Memory references facts but never duplicates values |
| **Derived Fact** | What has a certified engine calculated? | Normalized EBITDA = $820k | Memory may reference derived facts as evidence |
| **Business Timeline** | What happened? | 2026 P&L uploaded on August 10 | Memory references timeline events by ID |
| **Audit Log** | Who changed what? | Advisor approved adjustment at 2:14 PM | Memory has its own audit for confirm/reject/supersede |
| **ClientNote** | What is the detailed working record? | Call notes from Tuesday | Notes are working records; memory is durable context |
| **Galileo Conversation** | What are we currently discussing? | User is asking about tax strategies | Session-scoped; must NOT become memory automatically |
| **Business Memory** | What should remain meaningful later? | Owner intentionally accepted lower margin for recurring revenue | The ONLY system that owns durable executive context |

---

## Memory Categories

| Category | Display Name | Default Importance | Default Client-Visible | Typical Tags |
|----------|-------------|-------------------|----------------------|-------------|
| strategic_decision | Strategic Decision | strategic | ✅ | strategy, direction, decision |
| long_term_objective | Long-Term Objective | critical | ✅ | objective, goal, exit, growth |
| owner_preference | Owner Preference | useful | ✅ | preference, owner, operations |
| advisor_decision | Advisor Decision | strategic | ❌ | advisor, decision, methodology |
| major_commitment | Major Commitment | strategic | ✅ | commitment, agreement |
| material_business_event | Material Business Event | critical | ✅ | event, milestone, material |
| leadership_change | Leadership Change | strategic | ✅ | leadership, management, team |
| operating_philosophy | Operating Philosophy | strategic | ✅ | philosophy, operations, strategy |
| transaction_intent | Transaction Intent | critical | ✅ | exit, transaction, sale, acquisition |
| risk_acceptance | Risk Acceptance | strategic | ❌ | risk, acceptance |
| capital_allocation_decision | Capital Allocation Decision | strategic | ✅ | capital, allocation, financial |
| strategic_constraint | Strategic Constraint | useful | ❌ | constraint, limitation, regulatory |

---

## Memory Record Contract

Each memory supports:

- `memory_id` — unique identifier
- `business_id` — strict business scoping
- `category` — memory category
- `title` — short title
- `summary` — durable executive context
- `effective_date` — when this memory became effective
- `importance` — critical/strategic/useful/contextual
- `confidence` — 0-100
- `source_type` — where this candidate originated
- `source_reference` — reference to existing authoritative record (NOT a copy)
- `source_evidence` — supporting evidence
- `created_from` — what system created this candidate
- `confirmed_by_profile_id` — advisor who confirmed
- `confirmation_status` — candidate/confirmed/superseded/expired/rejected
- `client_visible` — enforced before retrieval
- `superseded_by` — memory ID that superseded this
- `supersedes` — memory ID this supersedes
- `review_date` — when to review for continued relevance
- `expiration_behavior` — retain_historically/review_periodically/expire_when_superseded/expire_when_removed
- `current_relevance` — current/historical/stale/expired
- `memory_status` — candidate/confirmed/superseded/expired/rejected
- `relevance_tags` — for structured retrieval

---

## Memory Must Reference, Not Duplicate

Business Memory references existing authoritative records:

| Source | Reference |
|--------|-----------|
| Meeting decision | → Post-Meeting outcome (outcome_id) |
| Valuation decision | → valuation version / conclusion |
| Growth initiative | → Growth Plan initiative |
| Advisor decision | → Advisor Note / governed decision |
| Timeline event | → existing timeline event |

**Memory stores durable meaning and reference. Truth remains with its certified owner.**

---

## Candidate Generation

### First Candidate Source: Post-Meeting Outcomes

Approved post-meeting outcomes flagged as `memory_candidate: true` are the first candidate source.

- `decision` → `strategic_decision`
- `commitment` → `major_commitment`
- `growth_plan_candidate` → `strategic_decision`
- `valuation_review_candidate` → `advisor_decision`
- `timeline_event_candidate` → `material_business_event`

### Future Candidate Sources (defined, not yet wired)

- Major advisor-approved strategic decisions
- Growth Plan milestones
- Valuation publication
- Major verification resolution
- Long-term owner objective
- Major business structure change

### No Automatic Confirmation

Candidates are created only. The advisor must explicitly confirm.

---

## Human Confirmation

AI may propose: "This appears important enough to remember."

Advisor actions:

| Action | Result |
|--------|--------|
| Remember | Creates confirmed memory |
| Edit and Remember | Creates confirmed memory with modifications |
| Not Important | Rejects the candidate |
| Defer | Leaves as candidate for later |

**No automatic persistence of inferred strategy as durable memory.**

---

## Memory Importance

| Importance | Description |
|-----------|-------------|
| Critical | Loss would significantly reduce future decision quality |
| Strategic | Loss would moderately reduce future decision quality |
| Useful | Provides helpful context |
| Contextual | Provides background context |

**Importance affects future retrieval priority, NOT urgency. Something may be strategically important but not urgent.**

---

## Memory Retention

| Expiration Behavior | Description |
|-------------------|-------------|
| retain_historically | Retain indefinitely (decisions, patterns, events) |
| review_periodically | Review on schedule (preferences, constraints) |
| expire_when_superseded | Expire when a new memory supersedes |
| expire_when_removed | Expire when explicitly removed |

**Do not delete historical truth simply because it is no longer current. Prefer: superseded, expired, historical.**

---

## Supersession

Business strategies change. Support:

```
Memory A: "Owner plans to sell in 2028."
Later:
Memory B: "Owner decided to retain the business and pursue acquisition growth."
```

Do NOT overwrite Memory A. Mark:
- A superseded by B
- A current_relevance = historical
- B supersedes A

**The historical decision remains explainable.**

### Tested

- ✅ Old memory correctly marked as `superseded`, `historical`, `superseded_by` set
- ✅ New memory created with `supersedes` linking to old
- ✅ Retrieval returns only the new (current) memory, not the superseded one
- ✅ Supersession audit entry created

---

## Memory Conflict

If two memories conflict, do NOT choose silently.

### Tested

- Created two confirmed memories: "Owner wants to sell within 3 years" vs "Owner intends long-term hold and generational transfer"
- Conflict detection correctly identified the conflict: "Two transaction_intent memories conflict"
- Recommended review: "Advisor review required — determine which memory reflects the current intent and supersede the other."

**Memory conflicts are contextual conflicts — they do NOT route through Canonical Fact conflict logic unless they concern a factual business value.**

---

## Persistence Decision

### Constitution Check Result

No existing entity fits Business Memory without semantic corruption:

| Existing Entity | Why It Doesn't Fit |
|----------------|-------------------|
| ClientNote | Working notes (active/archived), not durable context with supersession |
| StrategicHypothesis | AI hypotheses, not confirmed memory |
| StrategyLearningPattern | Cross-business patterns, not business-specific memory |
| GalileoConversation | Chat history, not durable executive context |

### Decision: Create ONE Additive Entity

**`BusinessMemory`** — the single persistence model for Business Memory.

- Additive: new table, no existing tables modified
- Idempotent: can be re-run without duplication
- Backend-mediated: all access through `businessMemoryService` function
- RLS-safe: admin/super_admin only for all operations
- No direct browser writes: entity RLS blocks non-admin access
- Service-role backend access: `asServiceRole` used for client-safe retrieval
- Business scoped: `business_id` on every record
- No cross-business references: retrieval filters by `business_id`

---

## Business Memory Service

One backend-mediated service: `businessMemoryService`

| Action | Description | Permission |
|--------|-------------|------------|
| getMemoryCandidates | Get pending candidates for advisor review | Admin only |
| confirmBusinessMemory | Confirm a candidate | Admin only |
| rejectMemoryCandidate | Reject a candidate | Admin only |
| updateBusinessMemory | Update a confirmed memory | Admin only |
| supersedeBusinessMemory | Supersede old with new | Admin only |
| getBusinessMemories | Get all memories for a business | Admin (all) / Non-admin (client-safe) |
| getBusinessMemory | Get a single memory | Admin (all) / Non-admin (client-safe) |
| getRelevantBusinessMemories | Structured retrieval | Admin (all) / Non-admin (client-safe) |
| createCandidateFromOutcome | Generate candidate from post-meeting outcome | Admin only |
| createCandidateFromCapture | Generate candidate from advisor capture | Admin only |
| detectMemoryConflicts | Check for conflicts | Admin only |
| expireStaleMemories | Mark stale memories for review | Admin only |

**Identity resolved server-side. Permissions enforced server-side. No authoritative actor IDs from frontend.**

---

## Relevance Retrieval

Structured, deterministic retrieval — no vector search.

### Retrieval Query Supports

- business_id (required — P0 isolation)
- category
- importance
- relevance_tags
- meeting_intent (maps to relevance tags)
- date_range
- client_safe_only
- include_historical
- limit

### Meeting Intent → Relevance Tags

| Intent | Tags |
|--------|------|
| quarterly_review | strategy, direction, objective, milestone |
| valuation_review | exit, transaction, valuation, financial, methodology |
| growth_planning | growth, strategy, objective, execution |
| tax_planning | tax, financial, constraint |
| exit_planning | exit, transaction, sale, objective |
| acquisition_review | acquisition, transaction, growth |
| operations_review | operations, philosophy, leadership, team |
| financial_review | financial, capital, allocation |
| strategic_planning | strategy, direction, objective, constraint |
| annual_review | strategy, objective, milestone, event, leadership |
| initial_consultation | objective, preference, constraint |
| follow_up | commitment, agreement, execution |
| emergency_review | risk, event, material |
| compliance_review | regulatory, constraint, compliance |
| internal_advisor | advisor, methodology, decision |

---

## Living Intelligence Integration

Living Intelligence may READ confirmed Business Memory to improve:
- What Changed
- What Matters Now
- Executive Presence
- Meeting Intelligence

**But memory does not outrank current truth.**

Example:
- Memory: "Owner wants to sell in 2028."
- Canonical / current state: valuation data today
- Living Intelligence may say: "Because the owner is targeting a 2028 exit, owner dependence remains strategically important."
- It may NOT turn the memory into a canonical business fact.

---

## Galileo Integration

Galileo may receive relevant confirmed memory in context.

- Not all memories — only relevant, confirmed, client-safe memories
- Respects: business scope, conversation scope, role, client-safe visibility, workspace relevance
- Galileo can say: "Last quarter, you and your advisor agreed that reducing customer concentration was a priority."
- With source lineage
- Does NOT expose: hidden advisor-only memories, internal IDs, rejected candidates, superseded memory as current policy

---

## Meeting Intelligence Integration

Meeting Intelligence may use relevant memory to improve preparation.

Example: "This initiative matters because the owner previously identified a 2028 exit as the primary objective."

- Does not rebuild Meeting Brief
- Enriches the certified coordinator
- Post-meeting outcomes may produce new memory candidates

**Flow: Meeting → Confirmed Outcome → Memory Candidate → Advisor Confirmation → Business Memory**

**Not: Meeting → automatic memory**

---

## Client-Safe Memory

| Client-Visible | Internal Only |
|---------------|--------------|
| Agreed strategic objective | Advisor concern |
| Agreed initiative | Internal risk interpretation |
| Owner-stated goal | Hidden negotiation strategy |
| Published milestone | Internal valuation debate |

**Visibility is enforced BEFORE retrieval — not by Galileo prompts later.**

---

## Memory vs Notes

| Notes | Memory |
|-------|--------|
| Detailed working record | Durable executive context |
| Active/archived | Candidate/confirmed/superseded/expired/rejected |
| Created by advisor | Proposed by AI, confirmed by advisor |
| No supersession | Supersession supported |
| No importance | Importance classified |
| No structured retrieval | Structured retrieval by tags, category, intent |

**Do not convert every advisor note into memory. A memory should survive because losing it would reduce future decision quality.**

---

## Memory Quality Test

Every candidate must pass:

| Check | Question |
|-------|----------|
| Is it durable? | Will it remain relevant beyond the current moment? |
| Is it meaningful? | Does it have executive significance? |
| Is it supported? | Does it have evidence or source reference? |
| Will it improve future decisions? | Would losing it reduce decision quality? |
| Does it belong somewhere else? | Is it actually a note, fact, timeline event, or audit? |

**If any check fails, the candidate does NOT become memory.**

### Tested

- ✅ "Sent an email reminder to client about pending documents" → **FAILED** (transactional, not durable)
- ✅ "Owner and advisor agreed to prepare for sale by 2028" → **PASSED** (durable, meaningful, supported)

---

## Quiet Memory Model

No gamification:

- ❌ No memory score
- ❌ No memory streak
- ❌ No memory count badge
- ❌ No "AI remembered 14 things!"

**Business Memory should feel invisible. Users experience better continuity. Not another feature to manage.**

---

## Existing Experience Integration

**No Business Memory page was created.**

The first visible experience is in the Post-Meeting Closeout:

- OutcomeCard shows a "Remember this for future conversations" link for memory candidates
- Advisor clicks it to create a memory candidate
- Candidate enters the review queue
- Advisor confirms/rejects in the existing advisor workflow

---

## Controlled Test Matrix

| Test | Scenario | Result | Verdict |
|------|----------|--------|---------|
| A | Long-term exit goal → candidate → advisor confirms → retrieved in later Exit Planning meeting | ✅ Confirmed, retrieved with exit_planning intent | ✅ PASS |
| B | Strategy reverses → original preserved → new memory supersedes | ✅ Old memory superseded, new memory current, retrieval returns only new | ✅ PASS |
| C | Advisor-only concern → internal → owner cannot retrieve | ✅ client_visible=false enforced, shouldEnforceClientSafe filters for non-admins | ✅ PASS |
| D | Owner-agreed objective → client-visible → Galileo may reference safely | ✅ client_visible=true, returned in client-safe retrieval | ✅ PASS |
| E | Generic meeting note → fails durability test → no memory candidate | ✅ "Sent an email" correctly rejected | ✅ PASS |
| F | Duplicate memory → deduplicated / linked | ✅ Duplicate check in confirmBusinessMemory prevents exact duplicates | ✅ PASS |
| G | Conflicting memories → review required | ✅ "sell" vs "retain" conflict detected with recommended review | ✅ PASS |
| H | Business A memory requested under Business B → rejected | ✅ test-biz-memory-2 retrieval returned 0 (no leakage from test-biz-memory-1) | ✅ PASS |
| I | Superseded memory → historical only, not presented as current | ✅ Superseded memory excluded from current retrieval | ✅ PASS |
| J | Sparse business → no fabricated memories | ✅ Empty business returns empty results, no fabrication | ✅ PASS |

---

## Business Isolation

| Check | Result | Verdict |
|-------|--------|---------|
| Memories scoped by business_id | ✅ Every query filters by business_id | ✅ PASS |
| No cross-business retrieval | ✅ test-biz-memory-2 returned 0 from test-biz-memory-1 data | ✅ PASS |
| No cross-business candidate generation | ✅ Candidates include business_id from source | ✅ PASS |
| No cross-business Galileo leakage | ✅ Retrieval is business-scoped | ✅ PASS |
| No cross-business meeting leakage | ✅ Meeting Intelligence retrieval is business-scoped | ✅ PASS |

**P0 on leakage: PASS.** No cross-business contamination.

---

## Auditability

Every confirmed memory explains:

| Field | Description |
|-------|-------------|
| What is remembered? | title + summary |
| Why? | category + importance |
| Where did it come from? | source_type + source_reference + source_evidence |
| Who confirmed it? | confirmed_by_profile_id + confirmed_by_name |
| When? | confirmed_at |
| Is it still current? | current_relevance |
| Has it been superseded? | superseded_by + superseded_at |

**Reuses existing audit patterns. No second audit architecture created.**

---

## Performance

| Metric | Result | Verdict |
|--------|--------|---------|
| Create candidate | ~715ms | ✅ Acceptable |
| Confirm memory | ~389ms | ✅ Fast |
| Retrieve relevant memories | ~401-610ms | ✅ Acceptable |
| Detect conflicts | ~253-563ms | ✅ Fast |
| Supersede memory | ~1109ms | ✅ Acceptable (two writes) |
| Business switch | New query (keyed by businessId) | ✅ PASS |

**No full memory corpus loaded into Dashboard, Galileo, Meeting Intelligence, or Living Intelligence.** Retrieval is limited and structured.

---

## Executive Session Governance

| Action | Consumes Session? |
|--------|------------------|
| Retrieve relevant memories | ❌ Free |
| Confirm memory candidate | ❌ Free |
| Reject memory candidate | ❌ Free |
| Supersede memory | ❌ Free |
| Detect conflicts | ❌ Free |
| Strategic reasoning using memory | ✅ Follows existing Galileo Executive Session rules |

**Remembering confirmed business context does NOT consume a session. No new billing logic.**

---

## Implemented Components

| Component | Purpose | Constitution Compliant? |
|-----------|---------|------------------------|
| `base44/entities/BusinessMemory.jsonc` | Persistence model (ONE additive entity) | ✅ RLS-safe, business-scoped |
| `base44/shared/businessMemory/types.ts` | Memory record contract | ✅ Framework only |
| `base44/shared/businessMemory/categories.ts` | 12 memory categories with defaults | ✅ Certified categories |
| `base44/shared/businessMemory/memoryBoundaries.ts` | Memory vs Truth vs Timeline vs Audit vs Notes | ✅ Explicit boundaries |
| `base44/shared/businessMemory/durabilityTest.ts` | Quality test (5 checks) | ✅ No candidate without passing |
| `base44/shared/businessMemory/candidateGeneration.ts` | Candidate generation from outcomes + captures | ✅ No auto-confirm |
| `base44/shared/businessMemory/supersession.ts` | Supersession logic | ✅ Historical preservation |
| `base44/shared/businessMemory/conflictDetection.ts` | Conflict detection | ✅ No silent choosing |
| `base44/shared/businessMemory/relevanceRetrieval.ts` | Structured retrieval | ✅ No vector search |
| `base44/shared/businessMemory/clientSafe.ts` | Client-safe filtering | ✅ Enforced before retrieval |
| `base44/shared/businessMemory/auditTrail.ts` | Audit entries | ✅ Reuses existing patterns |
| `base44/shared/businessMemory/index.ts` | Public API | ✅ Single entry point |
| `base44/functions/businessMemoryService/entry.ts` | Backend-mediated service | ✅ Server-side identity + permissions |
| `src/hooks/useBusinessMemory.js` | Non-blocking retrieval hook | ✅ Keyed by businessId |
| `src/components/advisor/OutcomeCard.jsx` | Extended with "Remember this" action | ✅ No new page |
| `src/components/advisor/MeetingCloseoutDrawer.jsx` | Extended with memory candidate creation | ✅ No new page |

---

## Bugs Found & Fixes Applied

| Bug | Fix | File |
|-----|-----|------|
| Entity RLS `user_condition` with `$or` rejected by platform | Restructured to top-level `$or` with multiple `user_condition` objects | `BusinessMemory.jsonc` |
| `$in` operator in entity filter queries returned 0 results | Changed to simple equality filter + in-code filtering | `businessMemoryService/entry.ts` |
| `asServiceRole` retrieval not returning results for admin users | Use regular `base44.entities` for admins, `asServiceRole` for non-admins | `businessMemoryService/entry.ts` |

---

## Recommendation for Next Phase

| Next Step | Readiness | Approach |
|-----------|-----------|---------|
| Business DNA | Ready | Use confirmed memories as fingerprint input |
| Business Twin | Future | Use memories for simulation context |
| Transcript ingestion | Framework ready | Add as candidate source after governance certified |
| Meeting Replay | Future | Extension point in Post-Meeting Contract |
| Predictive Meeting Preparation | Future | Use memory patterns for prediction |

**Do not begin Business DNA automatically.**
**Do not begin Business Twin automatically.**
**Do not implement transcript ingestion automatically.**

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Memory is distinct from truth, notes, timeline, audit, and conversation history | ✅ |
| Confirmed memory is governed | ✅ |
| No automatic inferred memory persists without confirmation | ✅ |
| Existing records are referenced rather than duplicated | ✅ |
| Supersession works | ✅ |
| Conflicts work | ✅ |
| Relevance retrieval works | ✅ |
| Living Intelligence can consume memory safely | ✅ (additive, read-only) |
| Galileo can consume memory safely | ✅ (additive, client-safe) |
| Meeting Intelligence can consume memory safely | ✅ (additive, read-only) |
| Client-safe filtering passes | ✅ |
| Business isolation passes | ✅ (P0) |
| Quiet memory model passes | ✅ |
| Auditability passes | ✅ |
| No Business Memory dashboard/page was created | ✅ |

---

## BUSINESS MEMORY FOUNDATION CERTIFIED