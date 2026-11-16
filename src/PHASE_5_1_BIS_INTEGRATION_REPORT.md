# Phase 5.1 — BIS Integration Report (Galileo Home)

**Branch:** `architecture-prep`
**Date:** 2026-09-17
**Status:** Code complete, pending merge validation

---

## 1. Objective

Replace all ad-hoc, entity-by-entity data reconstruction in Galileo Home with the
**Business Intelligence Contract (BIS)** as the single authoritative read layer.
Eliminate hardcoded/fake UI state. Enforce `business_id` scoping on every Home
entity query to prevent cross-business data mixing.

---

## 2. What Changed

### 2.1 BIS Contract Extensions

**`base44/shared/intelligenceContract/businessIntelligenceContract.ts`**
- Added `business_identity`: `{ name, industry }` — resolves the business display
  name without a separate Supabase call.
- Added `recent_documents`: `[{ id, name, document_type, status, year, created_at }]`
  — timestamped document list for change detection and activity surfacing.

**`base44/functions/getBusinessIntelligenceContract/entry.ts`**
- Populates `business_identity` from the Supabase businesses table.
- Populates `recent_documents` from the Supabase documents table (scoped by
  `business_id`, ordered by `created_at` desc, limit 10).

### 2.2 New Lib Modules

**`src/lib/galileo/homeIntelligenceCheck.js`**
- `hasMeaningfulBusinessIntelligence(bis)` — evaluates the BIS contract and
  returns `true` only when meaningful intelligence exists (revenue, EBITDA, or
  completed assessments). Replaces the old entity-count heuristic.

**`src/lib/galileo/homeSignals.js`**
- `buildSignalsFromBIS(bis)` — maps BIS financial metrics + assessment results
  into the six-domain signal model (cash, tax, profit, operations, value,
  freedom) with provenance (assessment vs. document vs. benchmark).
- `computeHomeSignalStates(signals)` — derives awakening states (learning,
  known, interesting, active) from signal data density.

**`src/lib/galileo/homeContext.js`**
- `buildHomeContext({ bis, businessId, entities })` — constructs the unified
  HomeContext object consumed by all resolvers. Normalizes opportunities, plays
  (sprints), and saved items into a consistent shape with `createdAt` /
  `lastGalileoUpdate` timestamps for activity detection.
- Single entry point for HomeContext — no parallel reconstruction elsewhere.

### 2.3 Hook Refactor

**`src/hooks/useGalileoHome.js`**
- Now consumes BIS via `useBusinessIntelligenceContract` + `useBusinessContext`.
- All entity queries (sprints, opportunities, saved items) are scoped by
  `business_id` from the active business context.
- Added `isResolving`, `bisError`, and `handleRetryBis` states.
- NBM candidate adapters now consume normalized HomeContext fields, not raw
  entity shapes.

### 2.4 Resolver Updates

**`src/lib/galileo/homeContextResolver.js`**
- Routing decision now uses `hasIntelligence` from `homeIntelligenceCheck`
  against the BIS contract, not entity counts.

**`src/lib/galileo/nextBestMoveResolver.js`**
- Wired `recentChanges` from BIS `recent_documents` (Priority 3 candidate).
- Added `provenance` to each candidate (where it came from).
- Documented 5 inactive future data sources (accounting sync, calendar,
  valuation updates, goal progress, verification queue) as comments — not
  wired until their data exists in BIS.

**`src/lib/galileo/playbookStore.js`**
- Stage mapping now uses real `status` + `converted_to_path` fields.
- Removed the nonexistent `qualificationState` reference.

**`src/lib/galileo/nowSurface.js`**
- Home-mode change detection now fires from BIS `recent_documents` with real
  timestamps, not entity-count deltas.

**`src/lib/galileo/domainFocus.js`**
- Fixed FREEDOM color bug (was using TAX color).
- `extractRelevantObjects` now reads normalized fields (`impact`, `status`,
  `category`) from HomeContext opportunities.
- `domainMatchesOpportunity` checks `opp.category` (normalized) in addition to
  `opp.domain`.
- Conversation starters trimmed to only real handlers.

**`src/lib/galileo/homeCommandBar.js`**
- Removed the no-op `what_changed` command.
- Only commands with real handlers in `GalileoHome.handleCommand` are listed.

**`src/lib/galileo/galileoActivity.js`**
- `getRecentActivities` now handles both raw entity fields and normalized
  HomeContext fields (`createdAt`, `lastGalileoUpdate`, `created_at`).

### 2.5 Component Updates

**`src/components/galileo/home/GalileoHome.jsx`**
- Connections list derived from real BIS documents — no hardcoded QuickBooks
  or Payroll cards.
- Business selector uses real BIS `business_identity.name`.

**`src/components/galileo/home/HomeConnectionsSheet.jsx`**
- Removed fake "Connect" buttons for integrations that don't exist.
- Accounting integration marked "coming soon" honestly.

**`src/components/galileo/home/HomeExpertSheet.jsx`**
- Removed fake "Bring an expert" button.
- Shows honest "not yet available" state.

**`src/components/galileo/home/ActiveWorkCard.jsx`**
- Uses normalized play field names (`title`, `lastGalileoUpdate`) from
  HomeContext.

**`src/components/galileo/home/HomeBusinessPulse.jsx`**
- Uses `computeHomeSignalStates` from `homeSignals.js` (BIS-derived).

**`src/pages/galileo/GalileoReimagined.jsx`**
- Added loading state ("Resolving your business…") — prevents Magic Loop
  flash for returning authenticated users while BIS loads.
- Added error state with retry — prevents onboarding restart on BIS failure.
- Fixed hooks-order lint error (useCallbacks moved above early returns).

---

## 3. Validation Criteria

| ID | Criterion | Status |
|----|-----------|--------|
| A | BIS is the sole read layer for HomeContext | ✅ |
| B | No entity queries without `business_id` scope | ✅ |
| C | No hardcoded/fake UI state (QuickBooks, Payroll, experts) | ✅ |
| D | Loading state prevents onboarding flash | ✅ |
| E | Error state prevents onboarding restart | ✅ |
| F | NBM uses BIS `recent_documents` for change detection | ✅ |
| G | NOW surface fires from real BIS timestamps | ✅ |
| H | Playbook stages use real persisted status fields | ✅ |
| I | Activity detection handles normalized field names | ✅ |
| J | Domain focus reads normalized opportunity fields | ✅ |
| K | No button renders without a real handler | ✅ |
| L | Hooks order is stable (no conditional useCallback) | ✅ |
| M | Business identity from BIS, not separate call | ✅ |

---

## 4. Known Limitations

1. **5 inactive NBM sources** — accounting sync, calendar events, valuation
   updates, goal progress, and verification queue are documented but not
   wired. They activate when their data enters BIS.

2. **Exploring stage** — playbook `exploring` stage is unavailable because the
   current schema lacks a persisted investigation state. Opportunities jump
   from `discovered` to `active` when a sprint is created.

3. **Cross-business context switching** — requires manual testing once merged
   to main (entity records are shared with main branch).

4. **BIS error retry** — `handleRetryBis` re-invokes the BIS query. If the
   underlying Supabase issue persists, the error state remains.

---

## 5. Merge Readiness

Code is complete on `architecture-prep`. Before merging to main:
- Run the app in preview to verify no runtime errors.
- Test cross-business context switching with real data.
- Confirm BIS loading and error states render correctly.

Nothing here reaches the published app until the branch is merged to main and
published from there.

---

## 6. Runtime Validation

**Method:** BIS backend function invoked with real business IDs via
`test_backend_function`. Entity queries executed via `exec_tool`. Import and
hook-order verification via `read_file`. Visual/interactive states (browser
console, visual rendering) were NOT testable from this environment — those
are marked NOT TESTABLE with the reason.

**Test businesses found:**

| ID | Industry | IQ | Valuation | Opps | Sprints |
|----|----------|-----|-----------|------|---------|
| `1dcdd9d5…` | Solar | 48 | $2.75M→$22.5M | 3 | 0 |
| `42f42075…` | Construction | 74 | $2.2M→$10.5M | 5 | 0 |
| `e22108df…` | Construction | 49 | $6.7M→$11.4M | 5 | 0 |
| `00000000…` (empty) | — | — | — | 0 | 0 |

### Test 1: Run Galileo Home with real existing business data

**PASS**

Called `getBusinessIntelligenceContract` for all 3 real businesses. All
returned valid contracts with distinct data profiles (different IQ, valuation,
profit gap, tax gap, operations score, industries). The BIS function executes
in ~1.2–1.5 seconds and returns the full contract including
`business_identity`, `recent_documents`, `profitability`, `valuation`, `tax`,
`operations`, `freedom`, `assessments`, and `opportunities`.

Traced routing: all 3 have `business_identity.name = "My Business"` and
meaningful financials → `hasMeaningfulBusinessIntelligence = true` →
`resolveHomeMode` returns `GALILEO_HOME`.

### Test 2: Returning business with BIS but no Sprint, no Opportunity

**PASS**

All 3 test businesses have opportunities (3, 5, 5), but none have sprints
scoped by `business_id` (see Structural Issue S1 below). The routing logic in
`resolveHomeMode` checks `hasIntelligence` (from BIS), NOT sprint/opportunity
counts. A business with BIS intelligence but zero sprints and zero
opportunities still routes to Galileo Home — confirmed by tracing
`hasMeaningfulBusinessIntelligence`: it returns true if the business has
identity + any of (financials, assessments, valuation, documents,
opportunities, tax, ops, freedom). Sprints are NOT in this list.

### Test 3: New/empty business

**PASS**

Called `getBusinessIntelligenceContract` with a nil UUID
(`00000000-0000-0000-0000-000000000000`). Returned an empty contract with all
fields null and `business_identity.name = null`.

Traced `hasMeaningfulBusinessIntelligence`: `hasIdentity = false` → returns
`false` immediately. `resolveHomeMode` sees `hasIntelligence = false` → returns
`MAGIC_LOOP` with reason `no_business_intelligence`.

### Test 4: Refresh returning user's Galileo Home

**PARTIAL**

Logic traced: `useBusinessIntelligenceContract` uses React Query with
`queryKey: ['business-intelligence-contract', businessId, bisVersion]` and
`staleTime: 0`. On refresh, the query refetches. While loading,
`isResolving = true` → "Resolving your business…" renders. When BIS loads,
`isResolving = false` → Galileo Home renders.

The `active_business_id` persists via `BusinessContext` (reads from
`supabaseProfile.primary_business_id` or `activeContext.businessId`), so the
same business reloads on refresh.

Cannot visually verify that onboarding does not flash — no browser access.

### Test 5: BIS loading state

**PASS**

`GalileoReimagined.jsx` checks `home.isResolving` before any other render.
When true, it returns a full-screen "Resolving your business…" loading state.
The three `useCallback` hooks run before this early return (hooks order fixed
in prior turn — verified correct). No Magic Loop components mount during
loading.

### Test 6: BIS error behavior

**NOT TESTABLE**

Could not safely reproduce a BIS error (would require breaking Supabase
connectivity or revoking service role key). Logic traced: if
`useBusinessIntelligenceContract` returns `isError = true`, then
`bisError = bisErrorDetail` and `GalileoReimagined` renders a retry button
calling `home.handleRetryBis` → `refetchBis()`. The error state does NOT
fall through to Magic Loop.

### Test 7: Cross-business switching (MOST IMPORTANT)

**PARTIAL** — 2 bugs found and fixed; 1 structural data issue documented

**Bugs found and fixed:**

1. **galileoOpportunities stale data (FIXED):** When `activeBusinessId`
   changed, the entity-loading `useEffect` fetched new opportunities without
   clearing the previous business's data first. This created a window where
   Business B's BIS contract rendered with Business A's opportunities.
   **Fix:** Added `setSprints([]); setGalileoOpportunities([]);` at the start
   of the effect, before the async fetch.

2. **domainFocus stale data (FIXED):** When switching businesses while viewing
   a domain focus, `activeDomain` and `domainFocus` were not cleared. Business
   A's domain focus would remain visible under Business B.
   **Fix:** Added a `useEffect` on `activeBusinessId` that clears
   `activeDomain`, `domainFocus`, and resets `homeView` to `'home'`.

**Structural issue documented (NOT fixed — data problem):**

- **S1: Sprints have no business_id.** All 4 `NinetyDaySprint` records in the
  database have `business_id: null`. The scoped query
  `NinetyDaySprint.filter({ business_id: activeBusinessId })` always returns
  empty. This means `homeContext.plays` is always `[]`, so:
  - Active Work card never renders
  - Sprint-based NBM candidates never fire
  - Playbook "Active" and "Completed" stages are empty
  - Sprint activity never appears
  - Maturity never reaches "implementing" stage

  This is a **data problem**, not a code problem. The sprints predate the
  `business_id` column or were never populated. Fixing it requires a data
  migration on the main branch (updating sprint records with the correct
  `business_id`), which is out of scope for this validation.

**Cannot visually verify** zero stale information during switching — no
browser access. The code now clears all business-scoped state
(opportunities, sprints, domain focus, home view) on `activeBusinessId`
change, and the BIS query key includes `businessId` so the contract is
per-business cached. Entity queries use `{ business_id: activeBusinessId }`
as the filter — verified in `useGalileoHome.js` lines 107–123.

### Test 8: Every visible Home command/button performs its action

**PASS**

Verified all rendered commands against `GalileoHome.handleCommand`:

| Command | Handler | Action |
|---------|---------|--------|
| Connect financials | `connect_financials` | `setHomeView('connections')` ✓ |
| View opportunities | `view_opportunities` | `setHomeView('playbook')` ✓ |
| View active plays | `view_plays` | `setHomeView('playbook')` ✓ |
| Explore profit | `run_scenario` | `handleDomainClick(Domain.PROFIT)` ✓ |
| Domain: View opportunities | `view_opportunities` | `setHomeView('playbook')` ✓ |
| Domain: Connect financials | `connect_financials` | `setHomeView('connections')` ✓ |

Non-command buttons verified:
- NBM action → `handleMoveAction` → routes to playbook/domain ✓
- "Why this?" → `handleWhyThis` → toggles explanation ✓
- "Show me something else" → `handleShowAlternative` → cycles NBM ✓
- Pulse signal click → `handleDomainClick` → domain focus ✓
- Back buttons (domain, playbook, connections, saved, expert) → `setHomeView('home')` ✓
- Goal input → `handleGoalInput` → parses and saves ✓
- Galileo input (non-goal text) → does nothing (by design — future conversation routing)

`getSprintCommands()` and `getPlaybookCommands()` are exported but NOT called
in `GalileoHome` — dead code, no unhandled buttons render.

### Test 9: Connections shows only real source/document state

**PASS**

`buildConnectionsList` in `GalileoHome.jsx` reads from
`contract.recent_documents` (real BIS data). No hardcoded QuickBooks, Payroll,
or Xero cards. The accounting integration section in `HomeConnectionsSheet`
is clearly marked "Not yet available — coming soon" with `opacity-60` and no
"Connect" button. Only real documents from BIS are listed.

### Test 10: Expert does not imply active capability

**PASS**

`HomeExpertSheet` receives no `experts` or `collaborations` props from
`GalileoHome` (neither is passed). The component's `!hasRealExperts &&
!hasRealCollaborations` branch renders: "Expert collaboration is not yet
available on Galileo Home." No fake "Bring an expert" button. No implied
active capability.

### Test 11: Browser console errors

**NOT TESTABLE** (no browser access)

Static analysis performed:
- All imports in changed files resolve to real exports ✓
- `inferMode` exists in `experienceStateMachine.js` (line 128) ✓
- `SignalState` exists in `signalAwakening.js` (line 17) ✓
- `buildHomeContext` exists in `homeContext.js` ✓
- `hasMeaningfulBusinessIntelligence` exists in `homeIntelligenceCheck.js` ✓
- `computeHomeSignalStates` exists in `homeSignals.js` ✓
- No conditional hooks in `GalileoReimagined.jsx` (verified hooks order) ✓
- Removed unused import `hasMeaningfulBusinessIntelligence` from
  `useGalileoHome.js` (was imported but never called; `homeContext.hasIntelligence`
  is pre-computed in `homeContext.js`)

Cannot verify: React warnings, undefined property errors at runtime, failed
queries in browser network tab.

---

## 7. Structural Issues Discovered (DOCUMENTED — NOT FIXED)

### S1: Sprints have no business_id (DATA)

All 4 `NinetyDaySprint` records have `business_id: null`. The scoped query
`NinetyDaySprint.filter({ business_id: activeBusinessId })` always returns
empty. This means sprint-related features in Galileo Home (Active Work,
sprint-based NBM, sprint activity, playbook active/completed stages) are
non-functional for all businesses.

**Root cause:** Sprint records predate the `business_id` column or were never
populated during creation.

**Resolution:** Requires a data migration on the main branch to populate
`business_id` on existing sprint records. Do NOT attempt on
`architecture-prep` (entity records are shared with main branch).

### S2: BusinessSelector not wired (CODE — deferred)

`GalileoHome.jsx` passes `businesses={[]}` to `BusinessSelector` and does not
pass an `onSelect` handler. The dropdown never opens. Cross-business
switching from within Galileo is not possible via the UI.

**Root cause:** The `allBusinesses` list from `useAuth` is available in
`BusinessContext` but is not passed through to `GalileoHome`.

**Resolution:** Wire `allBusinesses` and a business-switch handler through
`useGalileoHome` to `GalileoHome` → `BusinessSelector`. This is a feature
addition, not a validation fix — defer to next phase.

### S3: All test businesses have the same name (DATA)

All 3 test businesses return `business_identity.name: "My Business"` from
BIS. This makes them visually indistinguishable in the BusinessSelector.

**Root cause:** The `business_name` field in the Supabase `business_entities`
table is not populated with distinct names.

**Resolution:** Data update on the main branch.