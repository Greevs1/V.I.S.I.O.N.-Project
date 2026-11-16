# Phase 5: Galileo Home — Verification & Audit Report

**Branch:** `architecture-prep`
**Date:** 2026-09-17
**Status:** AUDIT COMPLETE — NOT MERGED, NOT PUBLISHED

---

## 1. Files Created

### Logic (`src/lib/galileo/`)
| File | Purpose |
|------|---------|
| `homeContextResolver.js` | Determines Magic Loop vs Galileo Home mode |
| `nextBestMoveResolver.js` | Prioritizes the single hero focus + alternatives |
| `domainFocus.js` | Builds domain-specific canvas content (Cash/Tax/Profit/Operations/Value/Freedom) |
| `goalIntelligence.js` | localStorage-based goal parsing, storage, badge formatting |
| `playbookStore.js` | Maps existing entities to Discovered/Exploring/Active/Completed stages |
| `galileoActivity.js` | Derives "Galileo did this" activities from real system events |
| `homeCommandBar.js` | Contextual suggested commands for home/domain/sprint/playbook |

### Hook
| File | Purpose |
|------|---------|
| `src/hooks/useGalileoHome.js` | Main home hook — loads entities, resolves mode/NBM/pulse/playbook/NOW |

### Components (`src/components/galileo/home/`)
| File | Purpose |
|------|---------|
| `GalileoHome.jsx` | Orchestrates the home canvas (NOW → NBM → Pulse → Active Work → views) |
| `NextBestMove.jsx` | Hero focus with Why/Show-alternative controls |
| `HomeBusinessPulse.jsx` | 6-signal grid |
| `DomainFocus.jsx` | Domain canvas with indicator, trend, observation, related objects |
| `PlaybookSurface.jsx` | Stage-filtered playbook view |
| `ActiveWorkCard.jsx` | Compact active Sprint summary |
| `GalileoActivityCard.jsx` | "Galileo completed N things" summary |
| `HomeGoalBadge.jsx` | Subtle goal badge |
| `HomeConnectionsSheet.jsx` | Source/connection list |
| `HomeSavedSheet.jsx` | Saved items retrieval |
| `HomeExpertSheet.jsx` | Expert collaboration surface |
| `HomeCommandBar.jsx` | Contextual command pills |
| `BusinessSelector.jsx` | Business context dropdown |

## 2. Files Modified

| File | Change |
|------|--------|
| `src/pages/galileo/GalileoReimagined.jsx` | Integrated Galileo Home routing; removed dead `useAuth`/`isMagicLoop` |
| `src/components/galileo/shell/GalileoShell.jsx` | Added `pulseBar` and `utilityDock` props for independent rendering |

## 3. Galileo Home Architecture

```
GalileoReimagined
├── useGalileoConversation()  ← runs UNCONDITIONALLY (Magic Loop)
├── useGalileoHome()          ← runs UNCONDITIONALLY (Galileo Home)
├── homeMode = resolveHomeMode({ isAuthenticated, businessModel, ... })
│
├── if GALILEO_HOME → GalileoHome
│   ├── NOW (selectNowItem)
│   ├── NextBestMove (resolveNextBestMove)
│   ├── HomeBusinessPulse (computeSignalStates)
│   ├── ActiveWorkCard (if sprints.length > 0)
│   ├── DomainFocus | PlaybookSurface | HomeConnectionsSheet | HomeSavedSheet | HomeExpertSheet
│   └── Galileo input + HomeCommandBar + UtilityDock
│
└── if MAGIC_LOOP → ConversationStream + IntelligenceDrawer (unchanged)
```

## 4. Exact Returning-User Routing Logic

`resolveHomeMode()` in `homeContextResolver.js`:

```
if (!isAuthenticated) → MAGIC_LOOP (reason: anonymous_guest)
if (!hasBusinessModel) → MAGIC_LOOP (reason: no_business_model)
if (modelCompleteness < 25 && !hasFinancials && !hasOpportunities) → MAGIC_LOOP (reason: low_intelligence)
else → GALILEO_HOME (reason: returning_user, bias: hasActiveSprints ? produce : create)
```

**What qualifies as a new business?**
Not authenticated, OR no business model, OR model completeness < 25% with no financials and no opportunities.

**What qualifies as a returning business?**
Authenticated + business model exists + (completeness ≥ 25% OR has financials OR has opportunities).

**What happens when an authenticated user has almost no business data?**
→ MAGIC_LOOP. `buildHomeModel()` returns `null` when sprints, opportunities, AND goals are all empty. This routes the user back to discovery/onboarding.

**What happens when a guest becomes authenticated?**
The home hook's `isAuthenticated` state updates → `resolveHomeMode` re-evaluates → if business model now exists, switches to GALILEO_HOME. However, the model is built from entity data loaded in the same effect, so there's a timing dependency.

**What happens when a returning user's Business Model is incomplete?**
If `modelCompleteness < 25 && !hasFinancials && !hasOpportunities` → MAGIC_LOOP (onboarding restarts).

**What happens when persistence fails?**
Entity loads are wrapped in try/catch (non-fatal). If all fail, `buildHomeModel` returns null → MAGIC_LOOP.

### ⚠️ CRITICAL ROUTING GAP

**`buildHomeModel()` does NOT consume the Business Intelligence Contract (BIS).** It builds a lightweight model from only three sources: `NinetyDaySprint`, `galileo_opportunities`, and localStorage goals. `hasFinancials` is hardcoded to `false`. `completeness` is a rough heuristic (50 if opps/sprints exist, 20 otherwise).

A returning user who has **financial data and a valuation in Supabase but no opportunities or sprints** will have `businessModel = null` → **MAGIC_LOOP restarts onboarding**. The BIS contract — which holds the real financial data, real model completeness, and real signals — is never consulted by the home hook.

## 5. Next Best Move Resolver Logic

`resolveNextBestMove()` collects candidates from 10 sources, scores them, and returns the top candidate + up to 3 alternatives.

| Source | Passed by `useGalileoHome`? | Default Urgency |
|--------|------|------|
| `sprintBlockers` | ✅ Yes (from `extractSprintBlockers`) | 95 |
| `financialChanges` | ❌ Never passed | 85 |
| `newDocuments` | ❌ Never passed | 80 |
| `expertResponses` | ❌ Never passed | 78 |
| `signalDeterioration` | ❌ Never passed | 72 |
| `evidenceGaps` | ❌ Never passed | 65 |
| `pendingScenarios` | ❌ Never passed | 60 |
| `opportunities` | ✅ Yes | 55 |
| `goals` (goal-aligned) | ✅ Yes | 50 |
| `galileoQuestions` | ❌ Never passed | 40 |

Scoring adds: goal alignment boost (+15), impact boost (log-scaled, max +20), maturity bias (+15-20).

**Returns ONE primary focus?** ✅ Yes.
**"Why this?" works?** ✅ Yes — `explainWhyThis()` returns type-specific reasoning.
**"Show me something else" works?** ✅ Yes — cycles to next alternative.
**Does not imply certainty?** ✅ Language uses "modeled impact", "highest-value focus right now."

### ⚠️ NBM GAP

Only 3 of 10 candidate sources are ever populated. Financial changes, new documents, expert responses, signal deterioration, evidence gaps, pending scenarios, and Galileo questions are **always empty**. NBM can only ever be: a sprint blocker, a supported opportunity, or a goal-aligned opportunity. It cannot detect or respond to new financial data.

## 6. Goal Integration

- Goals stored in `localStorage` (`vision_galileo_goals`)
- Parsed from conversational text via `parseGoalFromText()` (regex-based)
- Displayed as a subtle badge via `formatGoalBadge()`
- Goal alignment boosts NBM scoring by +15
- `goalAffectsPriority()` exported but **never imported** anywhere — dead code

## 7. Business Pulse Behavior

`HomeBusinessPulse` renders 6 signals using `computeSignalStates()`.

| Signal | Data Source | State on Galileo Home |
|--------|------------|----------------------|
| Cash | None (always returns UNKNOWN) | "Learning…" — always |
| Tax | `extractedFacts?.success` (null in home) | "Learning…" — always |
| Profit | `answers.revenue` + `answers.ebitda` (empty in home) + `signal.benchmark` | "Learning…" — always |
| Operations | `answers.involvement` (empty) + `signal.score` | "Learning…" — always |
| Value | `answers.revenue` + `answers.ebitda` (empty) + `signal.current` | "Learning…" — always |
| Freedom | `answers.involvement` (empty) + `signal.score` | "Learning…" — always |

### ⚠️ CRITICAL PULSE GAP

`computeSignalStates()` is designed for the Magic Loop (where `answers` and `extractedFacts` are populated during conversation). On Galileo Home, `answers` is `{}` and `extractedFacts` is `null`, and `model.signals` is `{}`. **All 6 signals will always show "Learning…" on Galileo Home**, even for a returning user with complete financials in Supabase. The BIS contract — which has the real financial data — is not consumed.

## 8. Domain-Focus Behavior

`buildDomainFocus()` constructs domain content from `model.signals` (empty on Home).

- Clicking a signal sets `activeDomain` + `homeView = 'domain'` → ✅ No route change
- Domain commands change per domain → ✅ via `getDomainCommands()`
- Indicator shows "Learning" when no signal data → ✅ graceful empty state
- Conversation starters render → ✅ but clicking them calls `handleCommand()` which is mostly a no-op (`what_changed`, `domain_why`, etc. have empty function bodies)
- The Galileo input bar is always available → ✅ but `handleSubmit` only parses goals; it does not route to a Galileo conversation

## 9. Playbook Lifecycle

`loadPlaybook()` maps existing entities to 4 stages:

| Stage | Source Entity | Mapping Logic |
|-------|-------------|---------------|
| Discovered | `galileo_opportunities` (status: hypothesis) + saved items | `resolveOpportunityStage()` checks `qualificationState` \|\| `status` |
| Exploring | `galileo_opportunities` (status: supported/validated/under_review) | Same |
| Active | `NinetyDaySprint` (status: active) | Direct |
| Completed | `NinetyDaySprint` (status: completed/archived) | Direct |

### ⚠️ PLAYBOOK STAGE MAPPING BUG

`resolveOpportunityStage()` checks for `qualificationState` (which does **not exist** on the `galileo_opportunities` entity schema) then falls back to `status`. But the entity's `status` enum is `available/active/completed/archived/superseded` — none of these match `hypothesis/supported/validated/under_review`. **All opportunities will be classified as DISCOVERED** (the default fallback).

### ⚠️ DISCONNECTED LIFECYCLE

`progressItem()` is a **pure function** that returns a new object with an updated stage. It does **not** write to any entity. There is no mechanism to actually move an opportunity through Discovered → Exploring → Active → Completed. The `galileo_opportunities` entity has `converted_to_path` and `path_id` fields that could link to a Sprint, but the playbook does not use them.

**Duplicate/disconnected records:** An opportunity that becomes a sprint is represented as two separate playbook items (one in Discovered/Exploring, one in Active) with no link between them. The lifecycle is conceptual only.

## 10. 90-Day Sprint Integration Status

- `ActiveWorkCard` shows compact sprint info (title, goal, progress%, next action) → ✅
- Prioritizes sprint needing expert review → ✅
- "Continue" navigates to Playbook surface, **not** the full Sprint detail view → PARTIAL
- Full Sprint is not dumped onto Home → ✅
- Sprint blockers feed into NBM → ✅ (via `extractSprintBlockers`)

## 11. NOW Behavior

`selectNowItem()` evaluates 5 priorities:
1. Document analysis complete (requires `extractedFacts?.success` + `flowState === 'revealing'` — never true on Home)
2. New opportunity detected (requires `flowState === 'opportunity'` — never true on Home)
3. Margin observation (requires `answers.revenue` + `answers.ebitda` — empty on Home)
4. Active plays (requires `isReturningUser && isAuthenticated && activeSprints > 0` — **can fire** on Home)
5. Saved items (requires `flowState === 'saving'` — never true on Home)

**On Galileo Home, NOW can only fire for priority 4** (active plays count). It cannot detect financial changes, new documents, or margin observations because those require Magic Loop flow states.

## 12. Connections Experience

`HomeConnectionsSheet` renders a static list built by `buildConnectionsList()`:
- QuickBooks: always "not connected" (hardcoded)
- P&L / Tax Return: shown as "Analyzed" only if `businessModel.hasFinancials` (always false)
- Financial Statements: shown if no financials
- Payroll: always "not connected" (hardcoded)

**This is preview-only.** No real connection logic. The `onConnect` callback is passed to the sheet but **never wired** in `GalileoHome.jsx`.

## 13. Saved Experience

`HomeSavedSheet` reads from `saveManager.getSavedItems()` (sessionStorage). Items saved during the Magic Loop are accessible here. Empty state is handled gracefully. `onItemClick` is passed but **never wired** — clicking a saved item does nothing.

## 14. Expert Experience

`HomeExpertSheet` is rendered with **no props** in `GalileoHome.jsx`:
```jsx
<HomeExpertSheet onBack={() => home.setHomeView('home')} />
```
- `experts` and `collaborations` default to `[]`
- Always shows the empty state
- No existing expert/advisory infrastructure is wired up
- No opportunity/evidence/strategy context is passed
- `onInvite` is not passed → the "Bring an expert into this" button does nothing

**This is explicitly PREVIEW-ONLY.**

## 15. CREATE / PRODUCE Inference

`inferMode()` from `experienceStateMachine.js`:
- Returns `produce` if state is PRODUCE/MEASURE, or `implementationChoice === 'guide_me'`, or `activeSprints > 0`
- Returns `create` otherwise

In `useGalileoHome`, the inferred mode is computed as:
```js
inferMode({
  state: sprints.length > 0 ? 'produce' : 'create',
  implementationChoice: sprints.length > 0 ? 'guide_me' : null,
  activeSprints: sprints.length,
})
```
This correctly infers PRODUCE when sprints exist and CREATE otherwise. ✅

## 16. Data Source Audit

| Displayed Number | Source | Classification |
|-----------------|--------|---------------|
| Business Pulse: Cash | None | PLACEHOLDER (always "Learning") |
| Business Pulse: Tax | None | PLACEHOLDER (always "Learning") |
| Business Pulse: Profit | None on Home (would need `answers` from Magic Loop) | PLACEHOLDER (always "Learning") |
| Business Pulse: Operations | None | PLACEHOLDER (always "Learning") |
| Business Pulse: Value | None | PLACEHOLDER (always "Learning") |
| Business Pulse: Freedom | None | PLACEHOLDER (always "Learning") |
| NBM impact | `opp.potentialValueImpact` \|\| `opp.impact` from `galileo_opportunities` | DERIVED (from entity) |
| NBM sprint blocker | `sprint.needs_expert_review` from `NinetyDaySprint` | DOCUMENT SUPPORTED (entity) |
| Opportunity impact (Playbook) | `opp.potentialValueImpact` \|\| `opp.modeledImpact` | DERIVED |
| Play progress | `sprint.progress_percent` from `NinetyDaySprint` | CONNECTED DATA |
| Sprint projected outcome | Not displayed on Home | N/A |
| NOW changes | None detectable on Home | PLACEHOLDER |
| Goal badge | localStorage | USER REPORTED |
| Activity summary | Derived from entity timestamps | DERIVED |
| Connections list | Hardcoded static list | PLACEHOLDER |

**There are ZERO production-facing financial numbers displayed on Galileo Home** because all Business Pulse signals show "Learning" and the NBM impact values come from `galileo_opportunities.estimated_value_created` (which is a DERIVED/MODELED number from the opportunity engine, not a document-supported financial).

No fake/sample numbers are injected. Missing data shows "Learning" / empty states. ✅

## 17. Validation Results A–J

### TEST A — Returning Owner, No Active Play
**Result: FAIL**

| Check | Status | Detail |
|-------|--------|--------|
| Goes directly to Galileo Home | ❌ FAIL | `buildHomeModel` returns null if no sprints/opportunities/goals → MAGIC_LOOP restarts |
| Onboarding does NOT restart | ❌ FAIL | Restarts for users with financials but no sprints/opps |
| Next Best Move resolves | ⚠️ PARTIAL | Returns null ("still building understanding") if no opportunities |
| Business Pulse loads from real intelligence | ❌ FAIL | All signals show "Learning" — BIS not consumed |
| NOW appears only if meaningful change | ✅ PASS | Returns null (nothing fires) |
| No unnecessary Active Work | ✅ PASS | Hidden when no sprints |
| Galileo input available | ✅ PASS | Always rendered |
| Utility Dock works | ✅ PASS | Renders and routes |

### TEST B — Returning Owner With Active Sprint
**Result: PARTIAL**

| Check | Status | Detail |
|-------|--------|--------|
| Goes directly to Galileo Home | ✅ PASS | Sprint exists → model non-null → GALILEO_HOME |
| PRODUCE behavior inferred | ✅ PASS | `activeSprints > 0` → produce |
| NBM prioritizes blocker/action | ✅ PASS | `extractSprintBlockers` checks `needs_expert_review` |
| Active Play appears | ✅ PASS | `ActiveWorkCard` renders |
| Only important Sprint info shown | ✅ PASS | Compact card with title/goal/progress/next |
| Full Sprint accessible without dumping | ⚠️ PARTIAL | "Continue" goes to Playbook, not full Sprint detail |

### TEST C — New Financial Data
**Result: FAIL**

| Check | Status | Detail |
|-------|--------|--------|
| NOW identifies meaningful change | ❌ FAIL | `financialChanges`/`newDocuments` never passed to NBM or NOW |
| Affected Pulse signals update | ❌ FAIL | Signals computed from empty model |
| NBM changes because of new info | ❌ FAIL | No change-detection mechanism |
| Galileo explains why number changed | ❌ FAIL | No mechanism |
| No fake data used | ✅ PASS | No fake data injected |

### TEST D — Domain Exploration
**Result: PARTIAL**

| Check | Status | Detail |
|-------|--------|--------|
| Each domain focuses canvas | ✅ PASS | `handleDomainClick` → `homeView = 'domain'` |
| No legacy dashboard navigation | ✅ PASS | No route changes |
| Active domain context understood | ❌ FAIL | `buildDomainFocus` gets empty model → "Learning" |
| Contextual suggested actions change | ✅ PASS | `getDomainCommands(domain)` returns domain-specific commands |
| Ask Galileo questions within domain | ⚠️ PARTIAL | Input bar present but only parses goals, doesn't route to conversation |
| Missing intelligence handled gracefully | ✅ PASS | "Learning" empty states |

### TEST E — Playbook Lifecycle
**Result: FAIL**

| Check | Status | Detail |
|-------|--------|--------|
| Discovered → Investigating → Strategy → Scenario → Active → Sprint connected | ❌ FAIL | `progressItem` is pure, no persistence; stages not linked |
| Connected representations of same initiative | ❌ FAIL | Opportunities and Sprints are disconnected items |
| Duplicate/disconnected records identified | ⚠️ IDENTIFIED | Opp + Sprint are separate entities with no playbook-level link; `converted_to_path`/`path_id` fields exist but unused |

### TEST F — Expert
**Result: FAIL (Preview-Only)**

| Check | Status | Detail |
|-------|--------|--------|
| Expert surface opens | ✅ PASS | `homeView = 'expert'` renders sheet |
| Existing expert/advisory infrastructure reused | ❌ FAIL | No props passed; no data loaded |
| Opportunity/Evidence/Strategy context available | ❌ FAIL | Not passed |
| User not asked to explain business again | ❌ FAIL | Nothing wired |
| Active collaboration on Galileo Home | ❌ FAIL | Not implemented |

**Explicitly identified as PREVIEW-ONLY.**

### TEST G — Returning After Several Days
**Result: PARTIAL**

| Check | Status | Detail |
|-------|--------|--------|
| What changed? | ❌ FAIL | `handleCommand('what_changed')` is a no-op |
| What needs my attention? | ⚠️ PARTIAL | NBM provides this for sprint blockers/opportunities only |
| What am I currently working on? | ✅ PASS | `ActiveWorkCard` shows active sprint |
| Onboarding does not restart | ⚠️ PARTIAL | Only if sprints/opportunities exist |

### TEST H — New User Regression
**Result: PASS**

| Check | Status | Detail |
|-------|--------|--------|
| New anonymous user enters Magic Loop | ✅ PASS | `!isAuthenticated` → MAGIC_LOOP |
| Phase 1–4 experience not broken | ✅ PASS | `useGalileoConversation` runs unchanged |
| Home hook doesn't interfere | ⚠️ MINOR | `useGalileoHome` runs its effect (auth check + entity load) even for guests — minor overhead, no break |

### TEST I — Multiple Businesses / Client Safety
**Result: FAIL**

| Check | Status | Detail |
|-------|--------|--------|
| Business selection architecture exists | ❌ FAIL | `BusinessSelector` hardcoded with empty businesses array |
| Changing business changes Galileo context | ❌ FAIL | Not implemented |
| No data leak between businesses | ❌ FAIL | `useGalileoHome` does NOT filter by `business_id`: `NinetyDaySprint.filter({ status: 'active' })` and `galileo_opportunities.list()` have no business_id filter |

**IDENTIFIED GAP:** Sprints and opportunities from all the user's businesses are loaded together. RLS limits to the user's own records, but multiple businesses' data is mixed.

### TEST J — Refresh / Session Persistence
**Result: PARTIAL**

| Check | Status | Detail |
|-------|--------|--------|
| Correct business reloads | N/A | Only one business (hardcoded) |
| Home remains Home | ⚠️ PARTIAL | Only if sprints/opportunities exist in entities |
| Business Pulse reloads | ✅ PASS | From entity data (but shows "Learning") |
| Active Play reloads | ✅ PASS | From `NinetyDaySprint` entity |
| Saved intelligence remains | ✅ PASS | sessionStorage persists within session |
| Magic Loop does not restart | ⚠️ PARTIAL | Depends on entity data existing |
| Data from persistence | ✅ PASS | Entity reads, not temporary React state |

## 18. Build/Lint/Runtime Verification

| Check | Status | Detail |
|-------|--------|--------|
| Build errors | ✅ PASS | None found |
| Lint errors | ✅ FIXED | `useAuth` undefined in GalileoReimagined.jsx — removed; `isMagicLoop` unused — removed |
| Broken imports | ✅ PASS | All imports resolve to real exports |
| Unused imports | ✅ FIXED | `base44` in `playbookStore.js` — removed; `getActivityIcon` in `GalileoActivityCard.jsx` — removed |
| Unused variables | ✅ PASS | None remaining |
| Missing props | ✅ PASS | All component props are handled with defaults or optional chaining |
| Undefined handlers | ⚠️ NOTE | `handleCommand` has empty bodies for `what_changed`, `domain_*` actions — no-ops, not crashes |
| Circular dependencies | ✅ PASS | All logic modules are leaf nodes; no cycles |
| Runtime errors from new modules | ✅ PASS | All entity loads wrapped in try/catch; no crashes |
| Routing conflicts | ⚠️ NOTE | Both `useGalileoConversation` and `useGalileoHome` run unconditionally — both hooks execute effects on every mount regardless of mode. Not a crash, but wasteful (guest session initialized for returning users; entity loads for anonymous guests). |

## 19. Existing Functionality Reused

| Feature | Reused? | Detail |
|---------|---------|-------|
| `NinetyDaySprint` entity | ✅ | Active plays, blockers |
| `galileo_opportunities` entity | ✅ | Discovered/exploring items, NBM candidates |
| `saveManager` (sessionStorage) | ✅ | Saved items |
| `computeSignalStates` | ✅ | Business Pulse (but produces empty results on Home) |
| `inferMode` from experienceStateMachine | ✅ | CREATE/PRODUCE inference |
| `selectNowItem` | ✅ | NOW surface (but limited effectiveness on Home) |
| `useBusinessIntelligenceContract` | ❌ NOT REUSED | **Critical gap** — Home builds its own lightweight model instead of consuming BIS |
| Expert/Advisory infrastructure | ❌ NOT REUSED | `HomeExpertSheet` is a stub |
| Sprint detail view | ❌ NOT LINKED | "Continue" goes to Playbook, not Sprint detail |

## 20. Functionality Still Preview-Only or Mocked

| Feature | Status |
|---------|--------|
| Expert collaboration (`HomeExpertSheet`) | PREVIEW-ONLY — no props, no data, no wiring |
| Connections (`HomeConnectionsSheet`) | MOCKED — hardcoded static list, `onConnect` not wired |
| Business Pulse indicators | PLACEHOLDER — all "Learning" due to empty model |
| Domain conversation starters | PREVIEW — render but `handleCommand` is a no-op |
| Galileo input on Home | PARTIAL — only parses goals, doesn't route to conversation |
| Business Selector | MOCKED — hardcoded single business, empty list |
| Playbook stage transitions | CONCEPTUAL — `progressItem` is pure, no persistence |
| "What changed?" command | NO-OP — empty handler body |
| Saved item click | NO-OP — `onItemClick` not wired |

## 21. Known Architecture/Data Risks

1. **BIS Not Consumed** — `useGalileoHome` does not use `useBusinessIntelligenceContract`. The home model is built from sprints/opportunities/goals only. All financial signals, model completeness, and real intelligence from Supabase are invisible to Galileo Home. This is the single largest architectural gap.

2. **Routing Depends on Wrong Signal** — Mode resolution uses `buildHomeModel` (which ignores BIS) instead of the BIS contract. A user with rich financials but no sprints/opportunities is routed to MAGIC_LOOP, restarting onboarding. Routing should be based on BIS intelligence state, not just entity counts.

3. **No Business Scoping** — Entity queries in `useGalileoHome` don't filter by `business_id`. Multiple businesses' data is mixed. This is a data isolation risk.

4. **Both Hooks Run Unconditionally** — `useGalileoConversation` and `useGalileoHome` both execute on every mount. The conversation hook initializes a guest session even for returning users. This is wasteful and could cause subtle side effects.

5. **Playbook Stage Mapping Bug** — `resolveOpportunityStage` checks for `qualificationState` (doesn't exist on entity) and falls back to `status` values that don't match the stage vocabulary. All opportunities land in DISCOVERED.

6. **Disconnected Lifecycle** — No mechanism to move an opportunity through stages or link it to a Sprint. `progressItem` is pure. `converted_to_path`/`path_id` fields exist but are unused.

7. **NOW Cannot Detect Changes** — `selectNowItem` requires Magic Loop flow states (`revealing`, `opportunity`, `saving`) that never occur on Home. Financial changes and new documents are not detectable.

8. **Domain Commands Are No-Ops** — `handleCommand` has empty bodies for most actions. Clicking "Why did this change?" or "Build a plan" does nothing.

9. **Goals in localStorage** — Goals are stored in `localStorage`, not Supabase. They don't persist across devices or survive cache clears. `goalAffectsPriority` is exported but never imported.

10. **`domainFocus.js` Color Bug** — `DOMAIN_COLORS.FREEDOM` is set to `'262 83% 58%'` (HSL channels) instead of a hex color. This object is not currently consumed by any component, so it's a latent bug.

## 22. Anything Intentionally Deferred

- Full BIS integration into Galileo Home (the home hook has comments: "In a full implementation, this would use the BIS hook data")
- Expert infrastructure wiring (explicitly preview-only per design comments)
- Business selector with real multi-business support
- Playbook stage transition persistence
- Financial change detection / "What changed?" logic
- Domain command routing to real Galileo conversation
- Saved item click-through to detail
- Connection provider wiring (QuickBooks, Payroll, etc.)

## 23. Exact Screens/States to Visually Inspect

1. **`/galileo` as anonymous guest** — Should show Magic Loop (regression check)
2. **`/galileo` as authenticated user with active Sprint** — Should show Galileo Home with NBM, Pulse (all "Learning"), Active Work card
3. **`/galileo` as authenticated user with financials but no sprints/opps** — ⚠️ Will show Magic Loop (onboarding restarts) — this is the routing gap
4. **Click each Pulse signal** — Should focus domain canvas with "Learning" indicator
5. **Click "Why this?" on NBM** — Should expand reasoning
6. **Click "Show me something else"** — Should cycle to next alternative
7. **Utility Dock → Playbook** — Should show playbook with stage filters
8. **Utility Dock → Saved** — Should show saved items or empty state
9. **Utility Dock → Expert** — Should show empty expert state
10. **Type a goal in the input** — Should parse and update goal badge (e.g., "I want to sell for $10M in 3 years")
11. **Refresh the page** — Should reload from persistence, stay on Home (if sprints/opps exist)

---

## Summary

Phase 5 Galileo Home is **architecturally scaffolded but not wired to real intelligence**. The shell, components, and resolver logic exist and compile cleanly. However, the home hook does not consume the Business Intelligence Contract, causing:

- All Business Pulse signals to show "Learning" regardless of actual data
- Routing to restart onboarding for users with financials but no sprints/opportunities
- NBM to miss 7 of 10 candidate sources
- NOW to be unable to detect financial changes

**Do NOT merge or publish until the BIS integration gap is addressed.**

The two most critical decisions needed:
1. Should `useGalileoHome` consume `useBusinessIntelligenceContract` for its model, signals, and routing? (Recommended — this is the existing single source of truth)
2. Should entity queries be scoped by `business_id` from `BusinessContext`? (Required for multi-business safety)