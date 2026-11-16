# V.I.S.I.O.N. Platform — Business Valuation Connection Gaps

**Audit Date:** 2026-08-05
**Scope:** Identified gaps between expected and actual behavior, grouped by category.

---

## 0. RESOLVED — Build Value Crash (P0 FIXED)

### GAP-RESOLVED-001: Build Value Workspace Crash — valueDrivers.filter is not a function

- **Root cause:** `ExecutiveInsights.jsx` set `valueDrivers` state to the raw backend response object `{ valueDrivers: [...] }` instead of extracting the array. `insightsEngine.js` then called `.filter()` on the object, causing `TypeError: valueDrivers.filter is not a function`.
- **Same bug also present in:** `GrowthPlanWorkspace.jsx` (same pattern).
- **User impact:** Clicking Business Valuation → Build Value crashed the workspace after `getValueDrivers` resolved.
- **Security impact:** None
- **Financial impact:** High — Build Value workspace was unusable
- **Exact fix applied:**
  1. `src/components/valuation/experience/insights/ExecutiveInsights.jsx` — extract `valueDrivers` array from response: `Array.isArray(drivers?.valueDrivers) ? drivers.valueDrivers : (Array.isArray(drivers) ? drivers : [])`
  2. `src/components/valuation/experience/GrowthPlanWorkspace.jsx` — same extraction fix
  3. `src/lib/valuation/insightsEngine.js` — added `Array.isArray()` guards on all external array inputs (`valueDrivers`, `intelligence.conflicts`, `intelligence.candidates`, `intelligence.addBackCandidates`, `readiness.critical_blockers`, `versionDeltas`)
  4. `src/lib/valuation/buildValueEngine.js` — added `Array.isArray()` guards on `candidates` and `conflicts` in `buildValueAssessment`, `findCandidate`, and `buildScorecard`
  5. `src/components/valuation/experience/buildvalue/DimensionScorecard.jsx` — added null guard and normalized `strengths`, `risks`, `missing_evidence` to arrays
  6. `src/components/valuation/experience/BuildValueWorkspace.jsx` — replaced blank `return null` with guided empty state (retry button + link to Discover)
- **Regression tests:** Build Value renders with null intelligence, sparse intelligence, full intelligence, malformed intelligence (non-array candidates), archived valuation, no published version, no approved value drivers, multi-business switching, browser refresh, mobile, desktop. No crash, no console error, no undefined/NaN.
- **Status:** FIXED — Build Value changed from FAIL to PASS.

---

## 1. Data Not Flowing

### GAP-001: Advanced Workspace Questionnaire Tabs Don't Load Saved Answers

- **Root cause:** `AdvancedWorkspaceContent.jsx` initializes `answers`, `financials`, and `adjustments` as empty local state (`useState({})`, `useState([])`, `useState([])`) and never loads them from the backend on mount. The Questionnaire tabs (business_profile, revenue_quality, growth_market, owner_dependency, operational_maturity, risk_transferability) and Financial History tab use this local state instead of fetching saved data.
- **User impact:** An advisor who saved answers via the simplified workflow or intelligence scan sees empty questionnaire tabs in Advanced. Data appears lost even though it exists in the database.
- **Security impact:** None (data is not leaked, just not displayed)
- **Financial impact:** Medium — advisor may re-enter data, causing confusion
- **Recommended correction:** Load `valuation_answers`, `valuation_financials`, and `valuation_adjustments` on mount via `getValuationSummary` or dedicated fetch calls, and initialize state from loaded data.
- **Files affected:** `src/components/valuation/experience/AdvancedWorkspaceContent.jsx`
- **Tables affected:** `valuation_answers`, `valuation_financials`, `valuation_adjustments`
- **Actions affected:** None (frontend-only fix)
- **Safe fix order:** P1 — after Growth Plan persistence

### GAP-002: Advanced Recast Earnings Tab Always Shows Empty Reconciliation

- **Root cause:** `AdvancedWorkspaceContent.jsx` line 160 passes `reconciliationItems={[]}` to `ReconciliationWorkflow` — a hardcoded empty array.
- **User impact:** The Recast Earnings tab in Advanced always shows an empty reconciliation workflow, even when reconciliation data exists.
- **Security impact:** None
- **Financial impact:** Low — advisor uses the simplified Valuation workspace instead
- **Recommended correction:** Load reconciliation items from `getMethodReconciliation(valuationId)` and pass them to the component, or remove the ReconciliationWorkflow from this tab and rely on the Methods → Reconciliation tab.
- **Files affected:** `src/components/valuation/experience/AdvancedWorkspaceContent.jsx`
- **Tables affected:** `valuation_calculations` (reconciliation type)
- **Actions affected:** `getMethodReconciliation`
- **Safe fix order:** P2

### GAP-003: Advanced Client Summary Tab Renders Empty

- **Root cause:** `AdvancedWorkspaceContent.jsx` line 206 renders `<ClientSummaryShell />` with no props. The component likely expects a `valuationId` or `summary` prop to load data.
- **User impact:** The Client Summary tab in Advanced shows nothing useful.
- **Security impact:** None (no data leaked)
- **Financial impact:** Low
- **Recommended correction:** Pass `valuationId` and/or `summary` to `ClientSummaryShell`, or verify the component loads its own data from route context.
- **Files affected:** `src/components/valuation/experience/AdvancedWorkspaceContent.jsx`, `src/components/valuation/ClientSummaryShell.jsx`
- **Tables affected:** `valuation_versions` (client-safe snapshot)
- **Actions affected:** `getSharedClientSummary`
- **Safe fix order:** P2

### GAP-004: Build Value Findings Not Integrated into Valuation Sections

- **Root cause:** The `intelligence` prop is passed to `ValuationWorkspace` but not consumed in section summaries. Build Value findings (customer concentration, owner dependency, etc.) are not shown in context within the Valuation workspace.
- **User impact:** The advisor sees Build Value findings only in the Build Value workspace, not in the Valuation workspace where they're most relevant to methodology and confidence.
- **Security impact:** None
- **Financial impact:** Medium — advisor may miss context when selecting methods or assessing confidence
- **Recommended correction:** Consume the `intelligence` prop in ValuationSection summaries to show relevant Build Value findings (e.g., customer concentration in the Methods section, owner dependency in the Confidence section).
- **Files affected:** `src/components/valuation/experience/ValuationWorkspace.jsx`, `src/components/valuation/experience/valuation/ValuationSection.jsx`
- **Tables affected:** None (frontend-only)
- **Actions affected:** None
- **Safe fix order:** P3

---

## 2. Missing Persistence

### GAP-005: Growth Plan Initiatives Not Persisted

- **Root cause:** `GrowthPlanWorkspace.jsx` stores initiatives in `useState` (local state). Candidate initiatives are derived fresh on each load. Advisor-created initiatives and status changes are lost on refresh.
- **User impact:** All advisor work on Growth Plan (creation, review, approval, client visibility, KPI setting) is lost when the page refreshes or the business switches.
- **Security impact:** None
- **Financial impact:** High — advisor loses significant work
- **Recommended correction:** Create a `valuation_initiatives` table and backend actions for CRUD + status transitions. Wire the workspace to load/save via a new service wrapper.
- **Files affected:** `src/components/valuation/experience/GrowthPlanWorkspace.jsx`, new backend function, new frontend service
- **Tables affected:** New `valuation_initiatives` table (to be created)
- **Actions affected:** New CRUD actions
- **Safe fix order:** P1 — Phase 13.4 or dedicated follow-up

### GAP-006: Deliverable Report Generation Produces No File

- **Root cause:** `DeliverablesWorkspace.jsx` `handleGenerate` only opens the preview drawer (`setPreviewDeliverable`). No backend call produces a downloadable file.
- **User impact:** The "Generate" and "Regenerate" buttons open a preview but don't produce a PDF, HTML, or any downloadable artifact.
- **Security impact:** None
- **Financial impact:** High — deliverables cannot be shared as files
- **Recommended correction:** Implement a backend report generation action that constructs a report from the approved snapshot and returns a file URL. Wire the Generate button to call it and provide a download link.
- **Files affected:** `src/components/valuation/experience/DeliverablesWorkspace.jsx`, `src/components/valuation/experience/deliverables/DeliverableCard.jsx`, new backend action
- **Tables affected:** New `valuation_generated_reports` table (to track generated files)
- **Actions affected:** New `generateReport` action
- **Safe fix order:** P1 — dedicated follow-up

---

## 3. Missing Staleness

### GAP-007: Deliverables Stale Detection Hardcoded False

- **Root cause:** `deliverablesEngine.js` line 98 sets `const isStale = false; // Would compare version date to last calculation date`. The stale check is never actually computed.
- **User impact:** Deliverables never show as stale, even when the source valuation has been recalculated since the report was generated. An advisor could share an outdated report.
- **Security impact:** Medium — stale data could be shared with clients as if current
- **Financial impact:** Medium — client may make decisions based on outdated information
- **Recommended correction:** Compare the published version's `published_at` date to the latest calculation's `updated_at` date. If calculations are newer, mark the deliverable as stale.
- **Files affected:** `src/lib/valuation/deliverablesEngine.js`
- **Tables affected:** `valuation_versions`, `valuation_calculations`
- **Actions affected:** None (frontend engine fix, but needs version/calculation timestamps)
- **Safe fix order:** P2

### GAP-008: Document Refresh May Not Trigger Staleness

- **Root cause:** The staleness map defines `financial_period_changed` and `adjustment_changed` as triggers, but document extraction updates `extracted_fields` which then updates `valuation_answers` via intelligence scan. The scan updates answers with `source_type` from the document, but it's unclear if this triggers `answer_changed` staleness.
- **User impact:** Recalculated document data may not mark dependent calculations as stale.
- **Security impact:** None
- **Financial impact:** Medium — calculations may use stale document data
- **Recommended correction:** Verify that `runIntelligenceScan` triggers `answer_changed` staleness for updated answers, or explicitly mark staleness after scan.
- **Files affected:** `base44/functions/valuationService/entry.ts` (runIntelligenceScan action)
- **Tables affected:** `valuation_answers`, `valuation_calculations`
- **Actions affected:** `runIntelligenceScan`
- **Safe fix order:** P2 — requires verification

### GAP-009: Assessment Refresh May Not Trigger Staleness

- **Root cause:** Similar to GAP-008. Assessment answers feed into intelligence candidates, but it's unclear if updating an assessment triggers staleness for valuations that consumed the assessment data.
- **User impact:** Stale assessment data may persist in valuation calculations.
- **Security impact:** None
- **Financial impact:** Medium
- **Recommended correction:** Verify the assessment save flow triggers intelligence invalidation and staleness propagation for affected valuations.
- **Files affected:** `base44/functions/saveAssessmentToSupabase/entry.ts`
- **Tables affected:** `assessment_answers`, `valuation_answers`, `valuation_calculations`
- **Actions affected:** `saveAssessmentToSupabase`
- **Safe fix order:** P2 — requires verification

---

## 4. Missing Audit

### GAP-010: No Audit for Deliverable Report Generation

- **Root cause:** When a report is "generated" (preview opened), no audit event is recorded. There's no backend call, so no audit trail.
- **User impact:** No record of when reports were generated, by whom, or what content was included.
- **Security impact:** Low — no traceability for deliverable actions
- **Financial impact:** Low
- **Recommended correction:** When report generation is implemented (GAP-006), include an audit event for each generation action.
- **Files affected:** Future backend report generation action
- **Tables affected:** `valuation_audit_log`
- **Actions affected:** Future `generateReport` action
- **Safe fix order:** P1 — with GAP-006

### GAP-011: No Audit for Growth Plan Initiative Changes

- **Root cause:** Initiative creation, review, approval, deferral, and client visibility changes are all local state. No backend call, no audit event.
- **User impact:** No record of advisor decisions on initiatives.
- **Security impact:** Low
- **Financial impact:** Low
- **Recommended correction:** When initiative persistence is implemented (GAP-005), include audit events for each status transition.
- **Files affected:** Future backend initiative actions
- **Tables affected:** `valuation_audit_log`, future `valuation_initiatives` table
- **Actions affected:** Future initiative CRUD actions
- **Safe fix order:** P1 — with GAP-005

---

## 5. Placeholder UI (Defined But Not Generated)

### GAP-012: Eight Verification Queue Item Types Never Generated

- **Root cause:** The verification queue engine defines 15 item types, but only 7 are actually generated by `buildVerificationQueue`. The following 8 are defined in the model and allowlist but not wired in the builder:
  - `missing_document`
  - `proposed_deduction`
  - `methodology_decision`
  - `unsupported_assumption`
  - `stale_value`
  - `reconciliation_required`
  - `document_mapping_review`
  - `assessment_conflict`
- **User impact:** These issue types never appear in the queue, even when the underlying conditions exist. Advisors may miss methodology decisions, stale values, and document mapping issues.
- **Security impact:** None
- **Financial impact:** Medium — some issues that should require advisor attention are not surfaced
- **Recommended correction:** Wire each item type in `verificationQueueEngine.ts` with appropriate detection logic from the intelligence record, calculation summary, or reconciliation data.
- **Files affected:** `base44/shared/valuationEngine/verificationQueueEngine.ts`
- **Tables affected:** `valuation_verification_items`
- **Actions affected:** `getVerificationQueue`
- **Safe fix order:** P2 — each item type can be wired independently

### GAP-013: Client-Facing Guided Request Page Not Implemented

- **Root cause:** The advisor can create client requests (via `ClientRequestModal`), but the client-facing page that shows these requests in plain language is deferred.
- **User impact:** Clients have no way to see and respond to information requests from the advisor.
- **Security impact:** None
- **Financial impact:** Medium — client collaboration is blocked
- **Recommended correction:** Create a client-facing route and component that loads `valuation_client_requests` filtered by the client's profile, displays them in plain language, and allows submission of requested values/documents.
- **Files affected:** New page component, new route in App.jsx
- **Tables affected:** `valuation_client_requests`
- **Actions affected:** New client-facing action
- **Safe fix order:** P2

### GAP-014: Send to Roadmap / Send to 90-Day Sprint Gated

- **Root cause:** These actions are intentionally disabled pending Phase 13.4 or explicit approval.
- **User impact:** Advisor cannot send approved initiatives to execution systems.
- **Security impact:** None
- **Financial impact:** Low — by design
- **Recommended correction:** Implement when Phase 13.4 is approved.
- **Files affected:** `src/components/valuation/experience/growthplan/InitiativeCard.jsx`
- **Tables affected:** Future roadmap/sprint tables
- **Actions affected:** Future actions
- **Safe fix order:** P3 — Phase 13.4

---

## 6. Missing Permission Check

### GAP-015: Advanced Workspace Doesn't Enforce canEdit per Tab

- **Root cause:** `AdvancedWorkspaceContent` receives `summary` (which contains `assignment`) but doesn't derive or pass `canEdit`/`canPublish` to the certified components. Each certified component enforces its own permissions via backend calls, but the frontend doesn't pre-filter actions.
- **User impact:** A viewer may see edit controls in Advanced that fail on backend submission. Not a security issue (backend rejects), but a UX issue.
- **Security impact:** None (backend is authoritative)
- **Financial impact:** Low
- **Recommended correction:** Derive `canEdit`/`canPublish` from `summary.assignment` and pass to certified components, or hide edit controls when not permitted.
- **Files affected:** `src/components/valuation/experience/AdvancedWorkspaceContent.jsx`
- **Tables affected:** None
- **Actions affected:** None
- **Safe fix order:** P3

---

## 7. Performance Issues

### GAP-016: Duplicate Intelligence Loading (Discover + Build Value)

- **Root cause:** `IntelligenceWorkspace` loads intelligence via `getValuationIntelligence` and lifts it to shell state via `onIntelligenceLoaded`. `BuildValueWorkspace` receives `intelligence` as a prop, but if null, loads its own copy via `getValuationIntelligence` again. When navigating from Discover to Build Value, the intelligence is already in shell state, but if the user navigates directly to Build Value, a second load occurs.
- **User impact:** Potential duplicate API call when navigating directly to Build Value.
- **Security impact:** None
- **Financial impact:** Low — minor performance overhead
- **Recommended correction:** The current behavior is correct (loads only if prop is null), but the shell could pre-load intelligence on mount if the user is likely to need it.
- **Files affected:** `src/components/valuation/experience/BuildValueWorkspace.jsx`
- **Tables affected:** None
- **Actions affected:** `getValuationIntelligence`
- **Safe fix order:** P3

### GAP-017: Source Query Duplication Between valuationService and verificationQueueService

- **Root cause:** Both `valuationService` (in `getValuationIntelligence` and `runIntelligenceScan`) and `verificationQueueService` (in `getVerificationQueue`) load the same source data (documents, extracted_fields, assessments, etc.) independently. The source-loading code is duplicated.
- **User impact:** When both Discover and Validate are visited, the same source data is loaded twice.
- **Security impact:** None
- **Financial impact:** Low — performance overhead
- **Recommended correction:** Extract `loadIntelligenceSources` into a shared module that both functions import.
- **Files affected:** `base44/functions/valuationService/entry.ts`, `base44/functions/verificationQueueService/entry.ts`, new shared module
- **Tables affected:** None
- **Actions affected:** `getValuationIntelligence`, `runIntelligenceScan`, `getVerificationQueue`
- **Safe fix order:** P3 — tech debt cleanup

---

## 8. UX Confusion

### GAP-018: Advanced Questionnaire Tabs Show Empty Data

- **Root cause:** See GAP-001. The questionnaire tabs in Advanced use local state initialized as empty, so they always show empty forms even if data exists.
- **User impact:** Advisor sees empty questionnaire in Advanced, thinks data is missing, may re-enter.
- **Security impact:** None
- **Financial impact:** Medium — confusion and potential data conflicts
- **Recommended correction:** See GAP-001.
- **Safe fix order:** P1

### GAP-019: Deliverable "Generate" Opens Preview Instead of Generating

- **Root cause:** See GAP-006. The Generate button label implies file creation but only opens a preview.
- **User impact:** Advisor clicks "Generate" expecting a file, gets a preview instead.
- **Security impact:** None
- **Financial impact:** Medium — confusion
- **Recommended correction:** Rename the button to "Preview" until file generation is implemented, or implement file generation.
- **Files affected:** `src/components/valuation/experience/deliverables/DeliverableCard.jsx`
- **Tables affected:** None
- **Actions affected:** None
- **Safe fix order:** P2 — quick label fix

---

## 9. Missing Migration

### GAP-020: Verification Queue Tables Require Manual SQL Migration

- **Root cause:** The migration file `business_valuation_phase13_3e3_verification_queue.sql` creates `valuation_verification_items` and `valuation_client_requests` tables. The Supabase connector lacks `database:write` scope, so this migration must be run manually in the Supabase SQL Editor.
- **User impact:** If the migration hasn't been run, the Verification Queue loads as an empty state. Queue generation runs but upserts fail gracefully.
- **Security impact:** None (graceful degradation)
- **Financial impact:** Medium — Validate workspace is non-functional without migration
- **Recommended correction:** Run the migration in the Supabase SQL Editor. Verify tables exist by checking for `valuation.valuation_verification_items` and `valuation.valuation_client_requests`.
- **Files affected:** `src/supabase/migrations/business_valuation_phase13_3e3_verification_queue.sql`
- **Tables affected:** `valuation_verification_items`, `valuation_client_requests`
- **Actions affected:** All verificationQueueService actions
- **Safe fix order:** P0 — manual action required

---

## Summary

| Gap Category | Count | Highest Severity |
|-------------|-------|-----------------|
| Data Not Flowing | 4 | High (GAP-001) |
| Missing Persistence | 2 | High (GAP-005, GAP-006) |
| Missing Staleness | 3 | Medium (GAP-007) |
| Missing Audit | 2 | Low |
| Placeholder UI | 3 | Medium (GAP-012) |
| Missing Permission Check | 1 | Low |
| Performance | 2 | Low |
| UX Confusion | 2 | Medium |
| Missing Migration | 1 | High (GAP-020) |
| **TOTAL** | **20** | — |

---

## Phase 13.3G.3 Update — Access Management Gaps Resolved

### GAP-RESOLVED-021: No visible Business Owner assignment flow

- **Previous state:** Business owners could only be assigned via raw backend
  calls; no UI existed on the landing page or shell.
- **Fix:** `ValuationAccessCard` (landing) and `ValuationAccessHeader` (shell)
  now show current owner with "Assign" action for authorized users.
  `ManageAccessSheet` provides the full assignment flow.
- **Status:** RESOLVED

### GAP-RESOLVED-022: No visible Lead Advisor assignment flow

- **Previous state:** Lead advisor assignment required backend calls; the
  `ValuationTeamCard` showed team but had no assignment UI.
- **Fix:** `ManageAccessSheet` provides lead advisor assignment via
  `setLeadAdvisor` backend action. `ValuationAccessHeader` shows current lead.
- **Status:** RESOLVED

### GAP-RESOLVED-023: Lifecycle permissions not displayed

- **Previous state:** `AssignmentConsole` only showed View/Edit/Review/Publish
  badges; lifecycle permissions (Create, Restore, Archive) and administration
  (Manage Team) were invisible.
- **Fix:** `AssignmentConsole` updated with five permission groups: Access,
  Review, Publication, Lifecycle, Administration. All granted permissions
  shown as badges.
- **Status:** RESOLVED

### GAP-RESOLVED-024: Next-action did not prioritize missing owner

- **Previous state:** `landingPageEngine` checked for missing lead advisor but
  not missing business owner.
- **Fix:** `deriveLandingNextAction` now checks `accessSummary.owners` before
  checking lead advisor. Priority: owner → advisor → stages.
- **Status:** RESOLVED

### Remaining Gap

- **GAP-025:** Shell `ValuationAccessHeader` does not auto-refresh when
  assignments change via `ManageAccessSheet`. Requires navigation to re-fetch.
  Severity: Low (UX). Data is correct on next load.

---

## Phase 13.3G.4 — Valuation Request Workflow Gaps (Addendum)

### GAP-RESOLVED-026: getRequest Null Destructuring Crash

- **Root cause:** `getRequest` action destructured `{ data: admin }` from a ternary that returned `null` when `assigned_admin_profile_id` was null. `const { data } = null` throws TypeError.
- **User impact:** Opening a freshly submitted request (before admin assignment) crashed with 500.
- **Fix:** Replaced ternary+destructure with optional chaining: `const adminRes = ... ? await ... : null; const admin = adminRes?.data || null;`
- **Status:** FIXED

### GAP-RESOLVED-027: Audit Log Action Constraint Violation

- **Root cause:** `convertToValuation` inserted `action: 'created_from_request'` into `valuation_audit_log`, but the CHECK constraint only allows: created, updated, status_changed, assigned, unassigned, published, shared, revoked, archived, restored, answer_saved, financial_saved, adjustment_saved, calculation_saved, value_driver_saved, reviewed.
- **User impact:** Converting an approved request to a valuation failed with 500.
- **Fix:** Changed to `action: 'created'` (allowed). Provenance preserved via `action_details: { source: 'valuation_request', request_id, ... }`.
- **Status:** FIXED

### GAP-RESOLVED-028: Assignment Role Constraint Violation

- **Root cause:** `convertToValuation` used `assignment_role: 'publisher'` for the publisher assignment, but the CHECK constraint only allows: lead, reviewer, financial_analyst, valuation_analyst, contributor, observer.
- **User impact:** Converting an approved request with a publisher assignment failed with 500 (rollback-safe — valuation and assignments were cleaned up).
- **Fix:** Changed to `assignment_role: 'contributor'` (allowed). Publisher authority conveyed via `can_publish: true` flag, matching the existing valuationService pattern.
- **Status:** FIXED

### GAP-RESOLVED-029: Duplicate Prevention Enforcement Gap

- **Root cause:** `createRequest` checked for an active valuation but only returned `has_active_valuation: true` as a flag — it did NOT block the request creation. A direct API call could create a duplicate request even when a valuation existed.
- **User impact:** Backend did not enforce duplicate prevention when an active valuation existed. Frontend masked this via UI state, but the backend was insecure.
- **Fix:** Added a 409 `ACTIVE_VALUATION_EXISTS` response when `request_type === 'new_valuation'` and an active (non-archived) valuation exists for the business.
- **Status:** FIXED

### Remaining Gap

- **GAP-030:** None. All Phase 13.3G.4 gaps resolved during live validation.

---

## Phase 13.4A.2 — Galileo Valuation Context Gaps

### GAP-031: Galileo-Valuation Disconnection — RESOLVED ✅

- **Root cause:** Galileo (the platform's AI interface) had zero awareness of the Business Valuation system. `buildGalileoContext` and `askGalileo` queried no valuation tables, had no valuation_id context, no valuation permissions, and no client-safe filtering.
- **User impact:** When a user opened Galileo from a Business Valuation page, Galileo had no context about which business, valuation, workspace, or section the user was viewing. It could not answer valuation-specific questions or respect valuation permissions.
- **Fix:** Created `base44/shared/galileo/valuationContext.ts` (read-only context assembler with 8 access modes). Extended `buildGalileoContext` to merge valuation context as `context.valuation`. Extended `askGalileo` to include valuation context in the LLM prompt and implement 5-field conversation scoping. Updated `GalileoPanel` and `AskGalileoCard` to pass valuation context from the route.
- **Status:** RESOLVED

### GAP-032: Conversation Cross-Contamination Risk — RESOLVED ✅

- **Root cause:** `askGalileo` persisted conversations with only `profile_id` + `business_id` scoping. Switching valuations or modes could reuse a mismatched conversation, allowing Business A facts to leak into Business B context.
- **User impact:** Valuation-specific conversations could be contaminated with facts from a different valuation or business.
- **Fix:** Implemented 5-field conversation scoping (profile_id + business_id + valuation_id + conversation_mode + visibility_scope). Scope is verified before reusing a conversation. Mismatched conversations trigger a new scoped conversation. Migration `galileo_valuation_conversation_scope.sql` adds the required columns.
- **Status:** RESOLVED (migration must be manually applied)

### GAP-033: Client-Safe Boundary Not Enforced for Galileo — RESOLVED ✅

- **Root cause:** Galileo had no client-safe filtering. If a business owner asked about valuation details, Galileo could potentially expose internal calculations, draft adjustments, or hidden risks.
- **User impact:** Business owners could see internal valuation details through Galileo that they should not see.
- **Fix:** The valuation context module resolves an access mode (`business_owner_client_safe` or `client_team_client_safe`) and only queries client-safe data (owner request + shared version). Internal details are never queried for client-safe users — they are excluded at the data source, not filtered by the LLM.
- **Status:** RESOLVED

### Remaining Gaps

- **GAP-034:** `discover_completion`, `build_value_completion`, and `growth_plan_summary` are null in Phase 13.4A.2 — these require intelligence engine, build value scores, and growth plan engine wiring (Phase 13.4A.3).
- **GAP-035:** Context invalidation events are not yet wired — the version mechanism is in place, but automatic invalidation on valuation state changes will be implemented in Phase 13.4A.3.
- **GAP-036:** `GalileoPanel` does not persist conversations (pre-existing) — Phase 13.4A.3+ may add persistence or unify with `AskGalileoCard`.

---

## Phase 13.4A.2 — Live Validation Gaps

### GAP-037: Missing `messages` column in galileo_conversations — PENDING MIGRATION

- **Root cause:** The `galileo_conversations` table was created without a `messages` JSONB column. The `askGalileo` function inserts `messages: [conversationMessage]` but the column doesn't exist (Postgres error 42703).
- **User impact:** All conversation persistence fails silently. `conversation_id` returns `null`. Conversations are never stored. This blocks full end-to-end validation of conversation scope persistence.
- **Pre-existing:** This bug existed before Phase 13.4A.2. The Phase 13.4A.2 migration added scope columns successfully but did not cause this issue.
- **Fix:** Created migration `src/supabase/migrations/galileo_conversations_messages_column.sql` — adds `messages JSONB DEFAULT '[]'` and `questions_used INTEGER DEFAULT 0`. Must be manually executed + `NOTIFY pgrst, 'reload schema'`.
- **Status:** MIGRATION FILE CREATED — pending manual execution.

### GAP-038: Defensive fallback bypassed five-field scoping — FIXED ✅

- **Root cause:** The `askGalileo` fallback (added for pre-migration state) retried conversation insert WITHOUT scope columns on any error, creating unscoped conversations that bypass the five-field scoping.
- **User impact:** If the scoped insert failed for any reason, an unscoped conversation would be created, potentially causing cross-business or cross-valuation context contamination.
- **Fix:** Removed the fallback. Scoped insert either succeeds or fails safely (no unscoped fallback). The migration is live, so scope columns exist.
- **Status:** FIXED

### Remaining Gaps (Phase 13.4A.3)

- **GAP-039:** `discover_completion`, `build_value_completion`, `growth_plan_summary` are null — require engine wiring (Phase 13.4A.3).
- **GAP-040:** Context invalidation events not yet wired — version mechanism in place, automatic invalidation in Phase 13.4A.3.
- **GAP-041:** Focused record validation for `initiative`, `deliverable`, `adjustment`, `methodology` returns `pending_validation` — Phase 13.4A.3+.

---

## Phase 13.4A.2 — Live Persistence Certification

### GAP-037 RESOLVED ✅

- **Missing `messages` column** — MIGRATION EXECUTED. `galileo_conversations_messages_column.sql` run successfully. `messages` (JSONB, DEFAULT '[]') and `questions_used` (INTEGER, DEFAULT 0) columns now exist. Schema cache reloaded.
- **Status:** RESOLVED ✅

### GAP-038 RESOLVED ✅

- **Defensive fallback bypassed scoping** — FIXED. Removed in Phase 13.4A.2 validation. No unscoped conversations created.

### New Gaps (Pre-existing, not Phase 13.4A.2)

- **GAP-042:** `questions_used` column exists but is never incremented by `askGalileo`. Pre-existing design choice. Not a blocker for persistence certification.
- **GAP-043:** `resolveProfileAndBusiness` email lookup failure causes `conversation_id: null` when user email doesn't match a profile. Pre-existing. AskGalileoCard works around this by passing `profile_id` from `activeContext`.
- **GAP-044:** GalileoPanel does not persist conversations (pre-existing). Uses local state only. Phase 13.4A.3+ may address.

### Certification Summary

All conversation persistence criteria pass. Five-field scoping isolates correctly across business, valuation, mode, and visibility. No cross-context leakage. No regression to existing Galileo. One persistence path, one context builder, one conversation architecture.

---

## Phase 14.2A — Canonical Fact Resolution Foundation

### GAP-045 RESOLVED ✅

- **No canonical source of truth for business facts** — RESOLVED. The Canonical Business Intelligence Layer (CBIL) READ layer is now certified. `canonicalFactService` provides deterministic resolution of 10 pilot facts across 8-level source hierarchy. No production consumers changed. No propagation. Read-only.

### New Gaps (Phase 14.2A)

- **GAP-046:** Shadow comparison tested only on sparse-data business. Rich-data business testing (multiple documents, assessments, valuations) deferred to Phase 14.2B.
- **GAP-047:** Conflict routing to Verification Queue not yet wired (Phase 14.2B scope).
- **GAP-048:** Consumer migration to read from canonical not yet started (Phase 14.2B scope).
- **GAP-049:** Non-pilot facts (40 remaining) registered but not yet resolvable — pending pilot certification.

### Certification Summary

Canonical Fact Resolution READ layer is certified. 10 pilot facts resolve deterministically. Source hierarchy enforces authority. Reporting periods are handled. Conflicts are explicit. Lineage is derived. Client-safe filtering works. No production consumer was changed. No propagation occurred. No duplicate storage was created. Business isolation passes.

---

## Phase 14.2B — Controlled Canonical Consumer Migration

### GAP-046 RESOLVED ✅

- **Shadow comparison tested only on sparse-data business** — RESOLVED. Galileo and Dashboard shadow comparison now runs for every pilot fact on every context build/dashboard load. Rich-data businesses are covered.

### GAP-047 PARTIALLY RESOLVED ⚠️

- **Conflict routing to Verification Queue not yet wired** — PARTIALLY RESOLVED. Galileo now exposes conflict state in `canonical_facts.conflicts` and annotates metrics with `canonical_resolution_status: 'conflict'`. Dashboard flags conflicts in `canonicalMeta.conflicts`. Full routing to Verification Queue deferred to Phase 14.2C.

### GAP-048 RESOLVED ✅

- **Consumer migration to read from canonical** — RESOLVED for Galileo and Dashboard. Valuation Engine migration deferred to Phase 14.2C.

### GAP-049 UNCHANGED

- **Non-pilot facts (40 remaining) registered but not yet resolvable** — UNCHANGED. Pending pilot certification in production.

### New Gaps (Phase 14.2B)

- **GAP-050:** Galileo context build time increased by ~1.1s due to `loadIntelligenceContext` loading valuation schema data. Acceptable for Phase 14.2B but should be optimized if it becomes a bottleneck.
- **GAP-051:** Dashboard canonical facts query adds ~1.3s to initial load. Runs in parallel with existing queries so no meaningful regression, but could be cached more aggressively.
- **GAP-052:** Valuation Engine not yet migrated to canonical facts (Phase 14.2C scope).
- **GAP-053:** Legacy read paths still present (marked as migration_fallback). Removal deferred to after sustained production equivalence.

### Certification Summary

Galileo and Dashboard are certified for canonical consumer migration. Both consumers now read canonical business facts as the preferred source. Existing response shapes are preserved. Shadow validation is complete. Every difference is classified. Reporting periods are correct. Client-safe boundaries pass. Multi-business isolation passes. Performance passes. No propagation exists. No calculation logic changed. Legacy fallback remains available.