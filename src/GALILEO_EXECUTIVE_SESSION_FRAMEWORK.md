# Galileo Executive Session Framework — Phase 13.4B.1.5

**Date:** 2026-08-07
**Status:** Governance framework complete. No AI features implemented. No payment integration.
**Certification:** READY FOR EXECUTIVE SESSION REVIEW

---

## 1. Progressive Intelligence Philosophy

V.I.S.I.O.N. does NOT sell AI.

V.I.S.I.O.N. sells better business decisions.

Galileo should allow every user to experience its highest level of intelligence before asking them to upgrade.

We are NOT building a feature paywall.

We are building Progressive Intelligence.

Users should always feel like Galileo is helping them.

Paid members simply remove limits.

### Core Principles

1. **Simple conversations never consume sessions.** Educational questions, terminology, navigation help, dashboard explanations — all unlimited, always free.
2. **Executive Sessions are consumed ONLY when advanced reasoning occurs.** Strategic analysis, meeting preparation, conflict investigation, growth planning.
3. **Galileo NEVER says "You cannot continue."** When sessions are exhausted, Galileo identifies the opportunity and offers graceful options.
4. **Every advanced capability supports Preview Mode.** Users see the high-level finding, estimated impact, and what Galileo could analyze — without consuming a session.
5. **Users can earn additional Executive Sessions.** Completing assessments, uploading documents, verifying data, inviting team members.
6. **Advisors servicing assigned clients are unlimited.** No limits while servicing assigned clients.
7. **No payment integration. No Stripe. No billing.** Framework only.

---

## 2. Executive Sessions

An Executive Session represents one strategic reasoning engagement.

Executive Sessions are consumed ONLY when advanced reasoning occurs:

- Explain Enterprise Value
- Analyze uploaded financials
- Prepare Client Meeting
- Prepare Buyer Meeting
- Investigate Conflict
- Increase Enterprise Value
- Compare Versions
- Publication Readiness
- Growth Plan
- Strategic Review

Simple conversations never consume sessions:

- Explain terminology
- Explain dashboard metrics
- Explain charts
- Explain calculations
- Navigation help
- Workflow guidance
- Educational questions
- Platform help
- Assessment definitions
- Document upload guidance

### Internal Naming

All internal references use "Executive Sessions" — never "credits," "tokens," or "usage."

---

## 3. Capability Governance

Every registered capability now declares its own governance metadata. Nothing is hardcoded.

### Governance Fields

| Field | Description |
|-------|-------------|
| `minimumTier` | Minimum membership tier required to execute |
| `requiresExecutiveSession` | Whether this capability consumes an Executive Session |
| `estimatedSessionCost` | Session cost (0 = free, 1 = standard, 2 = complex) |
| `previewAvailable` | Whether a preview is available without consuming a session |
| `supportsPreview` | Whether this capability supports preview mode |
| `supportsTeaser` | Whether this capability supports teaser content |
| `supportsEarnedAccess` | Whether sessions can be earned to unlock this capability |
| `supportsUnlimitedAccess` | Whether unlimited access is available for paid tiers |
| `executionLevels` | Execution levels supported (quick, advisor, executive) |
| `defaultExecutionLevel` | Default execution level when none is specified |

### Governance in the 20 Placeholder Capabilities

| Capability | Requires Session | Cost | Default Level |
|------------|-----------------|------|---------------|
| explain.enterprise_value | Yes | 1 | advisor |
| explain.equity_value | Yes | 1 | advisor |
| explain.confidence | Yes | 1 | advisor |
| explain.build_value | Yes | 1 | advisor |
| review.publication_readiness | Yes | 1 | advisor |
| investigate.conflict | Yes | 1 | advisor |
| review.evidence | Yes | 1 | advisor |
| increase.enterprise_value | Yes | 1 | advisor |
| build.90_day_plan | Yes | 1 | advisor |
| prepare.client_meeting | Yes | 1 | advisor |
| prepare.buyer_meeting | Yes | 1 | advisor |
| prepare.board_meeting | Yes | 1 | advisor |
| compare.valuation_versions | Yes | 1 | advisor |
| review.missing_information | Yes | 1 | advisor |
| review.risks | Yes | 1 | advisor |
| review.opportunities | Yes | 1 | advisor |
| analyze.assessments | Yes | 1 | advisor |
| review.financial_story | Yes | 1 | advisor |
| review.uploaded_documents | **No** | 0 | **quick** |
| draft.client_explanation | Yes | 1 | advisor |

19 capabilities require Executive Sessions. 1 capability (`review.uploaded_documents`) is always free — it provides document upload guidance, which is educational.

---

## 4. Membership Tiers

Six platform-wide tier definitions. No UI yet. Framework only.

| Tier | Monthly Sessions | Earned | Rollover | Preview | Meeting Prep | Cross-Domain |
|------|-----------------|--------|----------|---------|--------------|--------------|
| Explorer | 3 | Yes | No | Teaser | No | No |
| Builder | 10 | Yes | Yes | Full | No | No |
| Operator | 25 | Yes | Yes | Full | Yes | No |
| Exit Ready | 50 | Yes | Yes | Full | Yes | No |
| Enterprise | Unlimited | Yes | No | Full | Yes | Yes |
| Advisor | Unlimited | No | No | Full | Yes | Yes |

### Tier Resolution

| Role | Tier | Assigned Advisor |
|------|------|-----------------|
| super_admin | Enterprise | — |
| admin | Enterprise | — |
| advisor | Advisor | — |
| team_member | Operator | — |
| owner | Builder | — |
| viewer | Explorer | — |
| Any role | Advisor | If assigned to a business |

### Tier Capabilities

- **Explorer**: Limited categories (valuation, BI, analysis, education, navigation)
- **Builder**: All categories
- **Operator**: All categories + meeting preparation
- **Exit Ready**: All categories + meeting preparation + advanced reports
- **Enterprise**: All categories + cross-domain reasoning
- **Advisor**: All categories + cross-domain reasoning (unlimited)

---

## 5. Executive Session Engine

The reusable Executive Session service. No payment integration. No Stripe. No billing. Framework only.

### API

```typescript
sessionEngine.canExecuteCapability(profileId, capabilityId, executionLevel, context)
sessionEngine.consumeExecutiveSession(profileId, capabilityId, executionLevel, context)
sessionEngine.refundExecutiveSession(profileId, transactionId, reason)
sessionEngine.grantExecutiveSession(profileId, amount, reason)
sessionEngine.previewCapability(profileId, capabilityId)
sessionEngine.trackCapabilityUsage(profileId, capabilityId, executionLevel, outcome, duration)
sessionEngine.getAccount(profileId, tier)
```

### Execution Rules

| Condition | Can Execute? | Consumes Session? |
|-----------|-------------|-------------------|
| Free capability | Yes | No |
| Quick mode | Yes | No |
| Unlimited tier (advisor, enterprise) | Yes | No (tracked, not consumed) |
| Assigned advisor | Yes | No (tracked, not consumed) |
| Limited tier with remaining sessions | Yes | Yes |
| Limited tier with no remaining sessions | No | — (soft limit) |

### Consume Result

```typescript
{
  consumed: boolean,          // Whether a session was consumed
  transaction?: SessionTransaction,  // The recorded transaction
  softLimit?: SoftLimitResponse,     // If exhausted, the graceful response
}
```

---

## 6. Preview Experience

Every advanced capability supports Preview Mode.

Preview returns:
- **High-level finding** — What Galileo has identified
- **Estimated impact** — What a full Executive Session would quantify
- **Why it matters** — The significance of the finding
- **What Galileo could analyze** — The scope of a full session

No strategic reasoning. No hidden calculations. No premium leakage.

### Example Preview

> "I've identified opportunities related to explain enterprise value that may impact your enterprise value.
>
> A full Executive Session will quantify the potential impact.
>
> Galileo can analyze: An approved valuation with enterprise value conclusion; Confidence scoring for the valuation."

### Preview API

```typescript
buildPreview(capabilityId)           // Returns CapabilityPreview
isPreviewAvailable(capabilityId)     // Returns boolean
supportsTeaser(capabilityId)         // Returns boolean
sessionEngine.previewCapability(profileId, capabilityId)  // Tracks + returns preview
```

---

## 7. Earned Sessions

Users may earn additional Executive Sessions by completing valuable actions. No gamification. No UI. Framework only.

### Earnable Actions (9)

| Action | Sessions Awarded | Category | Repeatable | Max/Month |
|--------|-----------------|----------|------------|-----------|
| Complete Assessment | 1 | assessment | Yes | 6 |
| Upload Financials | 1 | document | Yes | 3 |
| Upload Tax Return | 1 | document | Yes | 3 |
| Verify Extracted Information | 1 | verification | Yes | 5 |
| Complete Build Value | 2 | growth | No | — |
| Complete Growth Plan | 2 | growth | No | — |
| Invite Team Member | 1 | team | Yes | 3 |
| Advisor Invitation | 1 | team | No | — |
| Referral | 3 | referral | Yes | 5 |

### Earned Session API

```typescript
earnedSessionEngine.awardEarnedSession(profileId, actionKey, tier)
earnedSessionEngine.canEarn(profileId, actionKey)
earnedSessionEngine.getAvailableActions(profileId)
earnedSessionEngine.getEarnedHistory(profileId)
```

### Rules

- Non-repeatable actions can only be earned once
- Repeatable actions have a monthly cap
- Advisors (unlimited tier) don't earn — they're already unlimited

---

## 8. Session Accounting

Tracks Executive Session accounting: earned, used, remaining, expired, granted, refunded, and manual adjustments.

In-memory ledger only. No persistence yet. No conversation storage. Only metadata.

### Account Fields

| Field | Description |
|-------|-------------|
| `earned` | Total sessions earned |
| `used` | Total sessions consumed |
| `remaining` | Current remaining (-1 = unlimited) |
| `expired` | Total sessions expired |
| `granted` | Total sessions granted |
| `refunded` | Total sessions refunded |
| `manualAdjustments` | Total manual adjustments |

### Transaction Types

| Type | Description |
|------|-------------|
| `earned` | Session earned through an action |
| `consumed` | Session consumed by executing a capability |
| `refunded` | Session refunded (reverses a consumption) |
| `granted` | Session granted manually |
| `expired` | Session expired |
| `adjusted` | Manual adjustment |

### Accounting API

```typescript
sessionAccounting.getOrCreateAccount(profileId, tier)
sessionAccounting.recordTransaction(transaction)
sessionAccounting.getBalance(profileId)
sessionAccounting.getAccount(profileId)
sessionAccounting.getTransactions(profileId)
sessionAccounting.getAccountSummary(profileId)
sessionAccounting.adjustAccount(profileId, amount, reason)
```

---

## 9. Execution Levels

Every capability supports three execution levels:

### Quick
- **Unlimited** — no session consumed
- Educational explanations, terminology, navigation
- Always available to all users

### Advisor
- **Consumes Executive Session**
- Standard strategic reasoning
- Available when the user has sessions remaining (or unlimited tier)

### Executive
- **Unlimited for paid tiers**
- Cross-domain reasoning
- Available for Enterprise and Advisor tiers

### Level as Capability Metadata

Each capability declares:
- `executionLevels: ExecutionLevel[]` — which levels it supports
- `defaultExecutionLevel: ExecutionLevel` — the default when none specified

---

## 10. Soft Limit Experience

When sessions are exhausted, Galileo NEVER says "You cannot continue."

Instead:

> "I've identified another opportunity. A full Executive Session is required to continue this analysis."

### Soft Limit Options (4)

| Option | Description |
|--------|-------------|
| Save for Later | Save this analysis for when you have sessions available |
| Upgrade | Upgrade your tier for more Executive Sessions |
| Notify Advisor | Ask your advisor to run this analysis |
| Continue with Quick Explanation | Get a quick explanation without strategic reasoning |

### Soft Limit API

```typescript
// Returned when consumeExecutiveSession fails due to exhaustion
{
  softLimit: {
    capabilityId: string,
    executionLevel: ExecutionLevel,
    message: string,         // "I've identified another opportunity..."
    finding: string,         // High-level finding
    options: SoftLimitOption[],
  }
}
```

---

## 11. Advisor Experience

Advisors assigned to businesses receive:
- **Unlimited Executive Sessions**
- Unlimited strategic reasoning
- Unlimited meeting preparation
- Unlimited valuation reasoning
- No limits while servicing assigned clients

### How It Works

When `isAssignedAdvisor` is true in the session context:
- `canExecuteCapability` always returns true
- `consumeExecutiveSession` tracks the usage but doesn't consume a session
- The advisor's tier resolves to 'advisor' (unlimited)

### Assignment Check

The actual advisor assignment check is performed by the future Galileo Orchestrator, which passes `isAssignedAdvisor` to the session engine. The framework doesn't duplicate assignment logic — it receives the flag as input.

---

## 12. Business Owner Experience

Business owners receive:
- **Limited Executive Sessions** (based on tier)
- Unlimited educational conversations
- Unlimited explanations
- Unlimited navigation
- Strategic reasoning consumes sessions

### Tier Mapping

Business owners resolve to the 'builder' tier (10 sessions/month) by default. They can earn additional sessions through actions.

---

## 13. Client Team Experience

Client team members:
- Same policy as business owner (limited sessions)
- Unless overridden by advisor

### Override Mechanism

The future Galileo Orchestrator can pass a different tier or `isAssignedAdvisor` flag for team members when an advisor has granted them elevated access. The framework supports this through the `SessionExecutionContext`.

---

## 14. Analytics

Tracks governance analytics. No conversation storage. Only metadata.

### Tracked Metrics

| Metric | Description |
|--------|-------------|
| `totalRequests` | Total capability requests |
| `previewConversions` | Conversions after preview |
| `exhaustionConversions` | Conversions after session exhaustion |
| `sessionsEarned` | Total sessions earned |
| `sessionsConsumed` | Total sessions consumed |
| `capabilityRequests` | Per-capability request count |
| `usageRecords` | Detailed usage records |
| `mostValuableCapability` | Most accepted capability |
| `averageReasoningDuration` | Average reasoning duration |

### Analytics API

```typescript
governanceAnalytics.trackCapabilityRequest(profileId, capabilityId)
governanceAnalytics.trackPreviewConversion(profileId, capabilityId)
governanceAnalytics.trackExhaustionConversion(profileId, capabilityId)
governanceAnalytics.trackSessionEarned(profileId, sessions)
governanceAnalytics.trackSessionConsumed(profileId, capabilityId)
governanceAnalytics.trackCapabilityUsage(profileId, capabilityId, executionLevel, outcome, duration)
governanceAnalytics.getAnalytics(profileId)
governanceAnalytics.getMostValuableCapability()
governanceAnalytics.getAverageReasoningDuration()
```

---

## 15. Orchestrator Ready

The future Galileo Orchestrator must be able to ask:

- Can this capability execute?
- Should preview be shown?
- Should Quick mode run?
- Should Executive mode run?
- Should another capability be suggested?

### Orchestrator Interface

```typescript
orchestratorInterface.evaluate(ctx)           // Returns full OrchestratorDecision
orchestratorInterface.canExecute(ctx)         // Returns boolean
orchestratorInterface.shouldPreview(ctx)      // Returns boolean
orchestratorInterface.shouldQuick(ctx)        // Returns boolean
orchestratorInterface.shouldAdvisor(ctx)     // Returns boolean
orchestratorInterface.shouldExecutive(ctx)   // Returns boolean
orchestratorInterface.suggestAlternative(ctx) // Returns capabilityId or undefined
```

### Orchestrator Decision

```typescript
{
  canExecute: boolean,
  shouldPreview: boolean,
  shouldQuick: boolean,
  shouldAdvisor: boolean,
  shouldExecutive: boolean,
  suggestedAlternative?: string,
  reason: string,
  softLimit?: SoftLimitResponse,
}
```

### Alternative Suggestion Strategy

When a user cannot execute a capability:
1. If the capability supports quick mode, suggest quick mode
2. Find a related free capability in the same category

No orchestration is implemented yet. The interface is built and ready.

---

## 16. File Structure

```
base44/shared/galileo/capabilities/
├── types.ts                    — EXISTING (extended with governance types)
├── registry.ts                 — EXISTING
├── pipeline.ts                 — EXISTING
├── permissions.ts              — EXISTING
├── contextModel.ts             — EXISTING
├── evidenceModel.ts            — EXISTING
├── followUpGraph.ts            — EXISTING
├── analytics.ts                — EXISTING
├── placeholders.ts             — EXISTING (extended with governance metadata)
├── index.ts                    — EXISTING (extended with governance exports)
└── governance/                 — NEW
    ├── types.ts                — Governance type definitions
    ├── tiers.ts                — 6 tier definitions + resolution
    ├── accounting.ts           — Session accounting ledger
    ├── earnedSessions.ts       — Earned session engine (9 actions)
    ├── preview.ts              — Preview model
    ├── sessionEngine.ts        — Executive Session service (6 functions)
    ├── orchestrator.ts         — Orchestrator interface
    ├── analytics.ts            — Governance analytics
    └── index.ts                — Public API
```

---

## 17. Architecture Validation

| Check | Result |
|-------|--------|
| All 20 capabilities have governance | ✅ 20/20 |
| 6 tier definitions | ✅ |
| Tier resolution works | ✅ |
| Preview available for advanced capabilities | ✅ |
| Executive Session required for advanced capabilities | ✅ |
| Quick mode unlimited | ✅ |
| Advisor unlimited | ✅ |
| Explorer limited (3 sessions) | ✅ |
| Explorer exhausted after 3 sessions | ✅ |
| Soft limit response with 4 options | ✅ |
| Earned sessions work | ✅ |
| Can execute after earning | ✅ |
| 9 earned session actions | ✅ |
| Session accounting tracks correctly | ✅ |
| Refund works | ✅ |
| Grant works | ✅ |
| Orchestrator interface works | ✅ |
| Analytics track correctly | ✅ |
| No capability logic duplicated | ✅ |
| No Galileo architecture duplicated | ✅ |
| Extends existing framework | ✅ |

### Live Validation Results

| Test | Result |
|------|--------|
| Framework initialized | ✅ true |
| Capabilities with governance | ✅ 20/20 |
| Tier count | ✅ 6 |
| Tier labels | ✅ Explorer, Builder, Operator, Exit Ready, Enterprise, Advisor |
| Tier resolution (viewer → explorer) | ✅ |
| Tier resolution (owner → builder) | ✅ |
| Tier resolution (advisor → advisor) | ✅ |
| Tier resolution (admin → enterprise) | ✅ |
| Tier resolution (owner + assigned → advisor) | ✅ |
| Advisor unlimited | ✅ true |
| Enterprise unlimited | ✅ true |
| Explorer unlimited | ✅ false |
| Explorer monthly sessions | ✅ 3 |
| Builder monthly sessions | ✅ 10 |
| Advisor monthly sessions | ✅ -1 (unlimited) |
| EV preview available | ✅ true |
| EV preview requires session | ✅ true |
| Doc preview available | ✅ true |
| Doc preview requires session | ✅ false |
| EV requires session | ✅ true |
| Doc requires session | ✅ false |
| Quick mode unlimited | ✅ true |
| Advisor unlimited | ✅ true |
| Explorer consumed 3 sessions | ✅ |
| Explorer exhausted | ✅ true |
| Soft limit returned | ✅ true |
| Soft limit has 4 options | ✅ 4 |
| Earned 1 session | ✅ |
| Earned awarded | ✅ true |
| Can execute after earn | ✅ true |
| 9 earned session actions | ✅ |
| Account earned | ✅ 1 |
| Account used | ✅ 3 |
| Account remaining | ✅ 7 |
| Account granted | ✅ 5 |
| Account refunded | ✅ 1 |
| Refund successful | ✅ true |
| Grant successful | ✅ true |
| Orchestrator can execute | ✅ true |
| Orchestrator reason | ✅ "Can execute at advisor level." |
| Analytics total requests | ✅ 4 |
| Analytics sessions consumed | ✅ 3 |
| Analytics sessions earned | ✅ 1 |
| Analytics average duration | ✅ 45000ms |
| Explorer can access valuation | ✅ true |
| Builder can access all | ✅ true |
| Advisor can access all | ✅ true |
| Extends existing framework | ✅ true |

---

## 18. What Was NOT Built

Per the phase requirements, the following were NOT implemented:

- ❌ No Galileo redesign
- ❌ No chat redesign
- ❌ No capability reasoning / execution
- ❌ No Galileo Home
- ❌ No conversation persistence changes
- ❌ No payment integration
- ❌ No Stripe
- ❌ No billing
- ❌ No UI (tiers, sessions, previews, earned sessions)
- ❌ No gamification
- ❌ No Galileo Orchestrator implementation
- ❌ No capability-specific business logic
- ❌ No duplicate intelligence layer
- ❌ No duplicate conversation system
- ❌ No duplicate context engine

---

## 19. Future Integration

### Galileo Orchestrator (Phase 13.4B.2+)

The future orchestrator will:
1. Resolve user intent to a capability ID
2. Call `orchestratorInterface.evaluate()` to get a decision
3. If `canExecute` → run the capability through the existing pipeline
4. If `shouldPreview` → show the preview from `sessionEngine.previewCapability()`
5. If `softLimit` → show the soft limit response with options
6. If `suggestedAlternative` → suggest the alternative capability

### Persistence (Future Phase)

The in-memory ledger will be replaced with database persistence:
- `session_accounts` table (per-profile accounting)
- `session_transactions` table (transaction ledger)
- `earned_session_records` table (earned session history)
- `governance_analytics` table (per-profile analytics)

No conversation content is stored. Only metadata.

### UI (Future Phase)

- Tier display in user profile
- Session balance indicator
- Preview cards
- Soft limit modals
- Earned session progress
- Upgrade prompts

---

## 20. Stop Condition

| Requirement | Status |
|-------------|--------|
| Governance framework complete | ✅ |
| Tier framework complete | ✅ |
| Executive Session engine complete | ✅ |
| Preview framework complete | ✅ |
| Earned session framework complete | ✅ |
| Report complete | ✅ |

**READY FOR EXECUTIVE SESSION REVIEW**