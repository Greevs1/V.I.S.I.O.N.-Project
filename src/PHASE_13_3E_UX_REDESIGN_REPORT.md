# Phase 13.3E — Intelligent Valuation Experience Redesign

## Current Status: Phase 13.3E.4A COMPLETE — Awaiting UX Review

---

## Purpose

Transform the certified 26-tab valuation workspace into a dramatically simpler,
advisor-friendly experience without modifying the certified Valuation Engine.
This phase is a user-experience and intelligent-data-orchestration layer only.

---

## Implementation Phases

### Phase 13.3E.1 — Six-Workspace Shell ✅ COMPLETE

**Delivered:**

- New primary shell: `src/components/valuation/experience/ValuationExperienceShell.jsx`
- Persistent progress strip: `src/components/valuation/experience/ValuationProgress.jsx`
- Workspace placeholder surface: `src/components/valuation/experience/WorkspacePlaceholder.jsx`
- Advanced workspace (all 26 existing views preserved): `src/components/valuation/experience/AdvancedWorkspaceContent.jsx`
- Route rewired in `src/App.jsx` (`/advisory/valuation/:valuationId` → `ValuationExperienceShell`)
- Old `ValuationWorkspaceShell.jsx` removed (content moved to `AdvancedWorkspaceContent`)

**What changed:**

- The 26-tab horizontal navigation is no longer the primary experience.
- Six advisor-oriented workspaces now form the primary navigation:
  Intelligence · Verify · Valuation · Insights · Action Plan · Reports
- A seventh entry, **Advanced**, opens the full specialist workspace.
- Advanced uses a two-level group selector (Setup · Questionnaire · Calculation ·
  Analysis · Output) instead of a single 26-item scrolling bar.
- A persistent progress strip shows the six stages with completion %, status,
  blockers, responsible person, and recommended next action — all derived from
  real loaded data (summary, calculation summary, publication readiness).
  No fabricated percentages.

**What did NOT change:**

- The certified Valuation Engine — untouched.
- All 26 detailed valuation components — preserved, reachable via Advanced.
- All calculation, permission, audit, versioning, publication, and sharing
  workflows — unchanged.
- All database tables, backend functions, immutable versions, delta
  intelligence, value attribution, waterfall, and valuation story — unchanged.
- No new backend calls were introduced.

**Stage progress computation (E.1, honest approximations from real data):**

| Stage | Signal Source | Status |
|-------|--------------|--------|
| Intelligence | (E.2) | Not Started |
| Verify | (E.3) | Not Started |
| Valuation | `calcSummary` + `readiness` | Ready / In Progress / Not Started |
| Insights | `summary.latestVersion` | Complete / Not Started |
| Action Plan | (E.5) | Not Started |
| Reports | `summary.versionCount` | Ready / Not Started |

Stages whose implementation lands in a later phase honestly report "Not Started"
rather than guessing.

---

### Phase 13.3E.2 — Intelligence Workspace & Unified Prefill Service ✅ COMPLETE

**Delivered:**

- Unified prefill service: two backend actions on `valuationService` —
  `getValuationIntelligence` (read-only) and `runIntelligenceScan` (prefill).
- Pure intelligence engine: `base44/shared/valuationEngine/intelligenceEngine.ts`
  (candidates, conflicts, add-backs, document/assessment intelligence,
  questionnaire reduction, summary, recommended action, prefill decision).
- Extraction-to-valuation mapping registry:
  `base44/shared/valuationEngine/intelligenceMapping.ts` (field registry,
  source-priority resolvers, add-back rules, document/assessment definitions).
- Frontend service wrapper: `src/lib/valuationIntelligenceService.js`.
- Intelligence workspace: `src/components/valuation/experience/IntelligenceWorkspace.jsx`
  with seven panel components:
  - `IntelligenceSummary` — aggregate metrics + completion %
  - `RecommendedAction` — sticky single primary next action
  - `BusinessSnapshot` — 6-category grouped candidates with provenance
  - `DocumentIntelligence` — per-category document readiness
  - `AssessmentIntelligence` — per-assessment reuse summary
  - `AddBackCandidates` — proposed adjustments (advisor-approve only)
  - `MissingInformation` — guided empty states
- Persistent progress strip Intelligence stage now reflects real intelligence
  completion %, conflicts, and recommended action (lifted via callback).

**Architecture:**

- The system gathers the evidence, proposes the answers; the advisor verifies
  the exceptions. Intelligence is not a questionnaire.
- All access backend-mediated. No direct frontend Supabase queries.
- Identity resolution, authorization helpers, and audit logging reuse the
  existing `valuationService` infrastructure.
- The intelligence engine is pure and deterministic — no I/O — so it is
  testable independently of the backend.

**Backend actions:**

- `getValuationIntelligence` — loads business, owners, documents,
  extracted_fields, document_analysis, dashboard_metrics, gap_analyses,
  profile_financials, business_assessments, Base44 Assessment entity,
  valuation questions/answers/financials/adjustments/versions; calls
  `buildIntelligence`; returns the unified intelligence record. Read-only.
- `runIntelligenceScan` — calls `buildIntelligence`, then prefills
  `valuation_answers` for high-confidence candidates only, respecting:
  advisor-approved locks (never overwritten), material conflicts (never
  prefilled), published versions (never modified), answer-type validation,
  business scoping. Returns counts: records reviewed, candidates added,
  conflicts found, questions answered, fields preserved.

**Source systems used (allowlisted):**

business_record, profile_record, ownership_record, document, extracted_field,
document_analysis, assessment_answer, assessment_calculation, dashboard_metric,
gap_analysis, financial_normalization, prior_valuation_answer,
prior_published_version, advisor_entry, client_confirmation, system_derived.

**Source-priority rules (field-specific, not universal):**

Each field defines an ordered list of resolvers. Examples:
- Revenue: approved valuation financial → extracted P&L/tax return → dashboard
  metric → profile financials → assessment answer.
- Owner compensation: approved valuation financial → extracted payroll/tax →
  recast assessment.
- EBITDA: approved valuation financial → recast dashboard metric → current
  dashboard metric → extracted field → assessment result.
- Entity type: business record.
- Employee count: extracted payroll → operations assessment.

**Mapping registry:**

~30 fields mapped across 6 Business Snapshot categories with resolvers,
materiality thresholds, and missing-data guidance. Add-back detection rules
cover 10 categories (personal vehicle, family payroll, excess owner comp,
one-time legal/consulting, related-party rent, charitable, relocation,
extraordinary repairs, personal travel). Document categories cover 19 types.
Assessment definitions cover 6 assessment types.

**Confidence logic:**

Score 0-100 per candidate from source authority, extraction confidence,
advisor verification, and duplicate agreement. Levels: Verified (advisor
approved), High (≥85), Medium (≥65), Low (≥40), Missing, Conflicting.
AI estimates are never labeled verified.

**Conflict detection:**

Material conflict when two sources differ by more than the field's
materiality threshold (default 10%). Each conflict records both sources,
values, absolute/percentage difference, confidence by source, recommended
authoritative source, materiality, and recommended action. Material
conflicts are never silently resolved — they route to the Verification Queue.

**Prefill behavior:**

- High confidence → prefill, mark needs confirmation.
- Medium confidence → suggest only, add to Verification Queue.
- Low confidence → show as possible evidence, do not prefill.
- Conflicting → never prefill as authoritative, create reconciliation item.
- Advisor-approved values → never overwrite.
- Published versions → never modify.

**Questionnaire reduction:**

Every active valuation question is classified: auto_verified,
auto_advisor_review, auto_client_review, conflicting, missing,
advisor_judgment, not_applicable. Verified questions are hidden from the
default questionnaire experience but preserved (never deleted). Counts are
surfaced in the Intelligence Summary.

**Advisor and client visibility:**

The Intelligence workspace is advisor-facing. It shows full provenance,
confidence, conflicts, add-back candidates, and internal evidence. Client
visibility is not exposed here — clients see only assigned requests and
selected confirmations in later phases.

**Performance:**

- Summary-first loading: the intelligence record is built server-side in one
  call and streamed to the workspace; panels render from the single response.
- Document and extracted-field queries are capped (200 docs / 500 fields) and
  scoped by business_id.
- No synchronous per-document loading on first render; document detail is
  expandable in-place from the already-loaded intelligence record.
- Refresh actions re-run the scan and update state in place.

**Tests:**

- Backend action routing verified: `getValuationIntelligence` returns
  `VALUATION_NOT_FOUND` for an unknown valuation (confirms action is
  reachable and authorization runs).
- Prefill lock-respect, conflict routing, and published-version immutability
  are enforced in `runIntelligenceScan` via `decidePrefill` and explicit
  advisor-entry checks.
- Multi-business isolation: all source queries are scoped by `business_id`
  derived from the valuation; no cross-business sources, documents, or
  answers are loaded.
- Permission roles: `requireValuationView` (read) and `requireValuationEdit`
  (scan) enforce assignment-based access; super_admin bypasses.

**Bugs found:**

- None during E.2. The `valuationService` file grew to ~1640 lines after
  adding the two actions; it remains editable but should be split in a future
  refactor (extract intelligence actions into a dedicated function or shared
  module) once E.3–E.5 stabilize.

**Known limitations:**

- The Business Snapshot covers ~30 high-value fields with real resolvers;
  fields without a resolver display as "missing" with guidance rather than
  fabricated values.
- Add-back candidate detection is pattern-based on extracted field names;
  general-ledger line-item detection will improve as extraction expands.
- Questionnaire reduction classification is computed but the simplified
  questionnaire UI (hiding verified questions) lands in E.3.
- The `valuation_questions` table is read live; if it is empty for a
  valuation, questionnaire reduction returns an empty list (by design).

### Phase 13.3E.3 — Verification Queue (PENDING)

- Unified Verification Queue with categories and filters
- Questionnaire reduction (auto-answer from existing data)
- Conflict workflow
- Client information requests

### Phase 13.3E.4 — Simplified Valuation Workspace (PENDING)

- One vertically organized page with 13 collapsible sections
- Collapsed summary + expandable detail
- Advisor approval flow

### Phase 13.3E.5 — Insights, Action Plan, Reports (PENDING)

- Executive insight dashboard
- Action Plan shell (future-ready, no roadmap records created)
- Reports workspace
- Version Intelligence integration

---

## Components

### Reused (unchanged, moved beneath Advanced)

ValuationOverview, DataReadiness, QuestionnaireSection, FinancialNormalization,
NormalizedEarningsEngine, AdjustmentBridge, ReconciliationWorkflow,
MethodologySelection, MultipleAnalysisEngine, DCFWorkspace,
CapitalizationOfEarnings, AssetApproach, MethodReconciliation,
EquityValueBridge, ConfidenceScoring, ScenarioModeling, ValueDriverAnalysis,
EnterpriseValueTimeline, CalculationReadinessPanel, AdvisorReviewDashboard,
ExplainabilityPanel, AdvisorConclusion, ClientSummaryShell, VersionTimeline.

### Created (E.1)

- `ValuationExperienceShell.jsx` — primary shell, header, progress, nav, switch
- `ValuationProgress.jsx` — persistent six-stage progress strip
- `WorkspacePlaceholder.jsx` — premium "arriving in Phase X" surface
- `AdvancedWorkspaceContent.jsx` — grouped selector + all 26 existing views

---

## Navigation Comparison

### Old

- Single horizontal bar with 26 tabs + inline group labels.
- Horizontally scrolling; visually overloaded.
- Power-user structure exposed as the default experience.

### New

- Primary: six workspace chips + Advanced, fits available width, no scroll.
- Persistent progress strip directly beneath the header.
- Advanced: two-level group selector (category → section), no 26-item scroll.
- Each new workspace shows its purpose, planned sections, and a one-click path
  to the Advanced workspace for immediate access to existing tools.

---

## Regression Notes

- Existing valuation calculations: unchanged (engine not touched).
- Existing published versions: unchanged (immutable, still served by `valuationService`).
- Existing permissions: unchanged (shell loads the same `getValuationSummary`,
  which enforces `requireValuationView` server-side).
- Advanced workspace exposes every previous detailed tool.
- No cross-business leakage introduced (no new data access).
- The route param `:valuationId` is unchanged.

---

## Known Limitations (E.1)

- The five new workspaces (Intelligence, Verify, Valuation, Insights, Action
  Plan, Reports) display purpose and planned sections only — their full
  content arrives in E.2–E.5.
- Stage progress for Intelligence, Verify, and Action Plan is "Not Started"
  because their data sources are not yet wired (by design).
- Advisors must currently use the Advanced workspace for all detailed work;
  this is intentional for E.1 and will be progressively reduced.

---

## Remaining Manual Processes

- All advisor judgment, approval, publication, and sharing actions remain
  manual and advisor-driven.
- No automation approves, selects, publishes, or shares on the advisor's behalf.

---

## Recommendations for Future Improvement

- Build `buildValuationIntelligence` (E.2) to populate the Intelligence
  workspace and drive real stage-1 progress.
- Introduce a command palette (⌘K) across the workspace for power users.
- Add a "recommended next action" sticky action bar per workspace.

---

## Status

Phase 13.3E.1 is complete and ready for UX review of the new navigation
architecture before proceeding to Phase 13.3E.2.

### Phase 13.3E.3 — Unified Verification Queue & Human Review Workflow ✅ COMPLETE

**Delivered:**

- Unified Verification Queue workspace replacing the Verify placeholder.
- One normalized verification-item model with stable deduplication keys.
- Pure queue builder: `base44/shared/valuationEngine/verificationQueueEngine.ts`.
- Shared auth module: `base44/shared/valuationEngine/valuationAuth.ts` (identity
  + permission helpers, reused by the new function; valuationService untouched).
- Backend service: `base44/functions/verificationQueueService/entry.ts` with
  10 actions.
- Frontend service: `src/lib/verificationQueueService.js`.
- UI components: VerifyWorkspace, QueueSummary, QueueCard (expandable +
  evidence), ConflictResolutionModal (side-by-side), AddBackReviewModal,
  ClientRequestModal.
- Persistent progress strip Verify stage now reflects real open counts,
  critical items, and publication blockers.

**Verification architecture:**

- AI gathers → AI proposes → System prioritizes → Advisor verifies → Client
  supplies only what is necessary → Approved information flows into the
  valuation.
- The queue is generated server-side from the intelligence engine +
  publication-blocker detection, then overlaid with persisted state
  (status, assignment, resolution). Advisors never hunt through documents,
  questionnaire sections, financial tabs, or conflict screens.
- One queue, one model. No per-subsystem queues.

**Queue item model:**

Each item carries: dedup_key, item_type, field_key, question_key, title,
description, category, priority, severity, status, suggested_value,
formatted_value, alternative_values, source_type/id/name, reporting_period,
confidence_score, conflict_status, financial_impact, valuation_impact,
profitability/multiple/risk relevance, responsible_party, due_date,
advisor/client action required, evidence_available/count,
recommended_action, resolution_value/reason/action, resolved_by/at,
deferred_until, advisor_note. Internal IDs are not exposed to clients.

**Item types (controlled allowlist):**

conflicting_value, low_confidence_value, missing_required_field,
missing_document, proposed_add_back, proposed_deduction, advisor_judgment,
client_confirmation, methodology_decision, unsupported_assumption,
stale_value, reconciliation_required, document_mapping_review,
assessment_conflict, publication_blocker.

**Queue generation:**

`getVerificationQueue` loads business-scoped sources, calls
`buildIntelligence`, computes publication blockers (mirrors the publish gate:
stale calcs, missing approved blended reconciliation, missing approved
conclusion), calls `buildVerificationQueue`, upserts items by dedup key
(preserving persisted status/resolution/assignment), merges, and returns
filtered/sorted/paginated items + summary + recommended action.

**Deduplication:**

Stable keys per item type, e.g. `conflicting_value:{field_key}`,
`proposed_add_back:{category}:{period}`, `advisor_judgment:{question_key}`,
`publication_blocker:{blocker_key}`. Upsert on
`(valuation_id, dedup_key)` — no duplicate items for the same unresolved
issue. Resolved items whose underlying data disappeared are retained so
resolved counts stay accurate.

**Priority model:**

critical / high / medium / low, scored from valuation impact, financial
materiality, publication dependency, confidence, and data freshness.
Critical examples: missing normalized-earnings input (missing
enterprise_value/profitability field), unresolved material revenue
conflict, publication blocker. Cosmetic/non-material issues are never
critical.

**Status model:**

open, in_review, waiting_on_client, waiting_on_advisor, needs_support,
deferred, resolved, rejected, not_applicable, closed. Every transition
records previous status, new status, actor, timestamp, reason, and an audit
event (action='reviewed' in valuation_audit_log, reusing the existing
CHECK constraint).

**Conflict workflow:**

Side-by-side comparison (Source A vs Source B with values, confidence,
reporting period). Resolution actions: Use Source A, Use Source B, Enter
Reconciled Value, Request Supporting Document, Ask Client, Defer, Mark N/A.
A resolution reason is required for material conflicts. Both values and the
final decision are preserved — neither source is silently overwritten.

**Add-back workflow:**

Specialized review: description, amount, period, source, category,
confidence, why it qualifies, buyer defensibility. Actions: Approve,
Approve with Changed Amount (reason required), Reject, Needs Support,
Request Documentation. Only approved values flow into normalized earnings
via write-through to `valuation_adjustments` (advisor_approval_status=
'approved', reviewer, review_date). Rejected add-backs insert no
adjustment — they are simply not included.

**Client request workflow:**

Backend-mediated. Advisor actions: Request Confirmation, Request Document,
Request Explanation, Request Missing Value. Each request stores title,
plain-language explanation, why it matters, requested value, due date,
advisor note, status, and links to the verification item. The linked item
moves to `waiting_on_client`. Client statuses: requested, viewed,
submitted, needs_clarification, accepted, rejected, closed. The
client-facing guided page (short, plain-language, no questionnaire library,
no internal confidence/evidence) lands in a later phase — the advisor-side
creation and tracking is live now.

**Resolution behavior:**

On resolution: persist final value, preserve original candidates +
provenance + resolution reason, update verification status, write through
to the underlying table (valuation_answers for question-keyed items,
valuation_adjustments for add-backs), mark affected calculations stale,
reset advisor conclusions, append audit event. Published versions are
never modified. Approved advisor values are never overwritten without
explicit authorization (write-through sets source_type='advisor_entry',
is_confirmed=true).

**Staleness integration:**

Resolutions reuse the existing staleness dependency map
(`stalenessMap.ts`). Answer resolutions → `answer_changed` (confidence,
scenario, advisor_conclusion, client_safe_summary). Financial-field
conflicts → `financial_period_changed` (all earnings-based calcs +
equity bridge cascade). Add-back approvals → `adjustment_changed`
(normalized_earnings, ebitda/sde/revenue multiple, cap_earnings,
reconciliation + equity bridge cascade). DCF/cap side tables marked stale
where applicable. Advisor conclusions reset on every resolution.

**Questionnaire integration:**

The queue is the primary human-review interface for the 90-question
system. Questions surface only when missing, conflicting, low-confidence,
or requiring advisor judgment / client input. Verified auto-answered
questions remain hidden (classification from the intelligence engine's
questionnaire reduction). The simplified questionnaire UI that hides
verified questions by default lands in E.4; the classification is already
computed and surfaced as advisor_judgment / client_confirmation items.

**Publication readiness integration:**

Publication blockers appear directly in the queue as `publication_blocker`
items (critical priority). Examples: missing approved reconciliation, stale
equity bridge, missing advisor conclusion. Resolving a blocker refreshes
readiness on the next queue load. The advisor does not visit another page
to discover the next blocker.

**Recommended next action:**

The Verify workspace always displays one recommended next action, ranked:
critical publication blocker → material financial conflict → missing
high-impact evidence → advisor judgment affecting methodology → client
dependency → low-confidence high-impact item → cleanup. Includes a concise
explanation of downstream impact.

**Assignment & notifications:**

Items can be assigned (assigned_profile_id, due_date, responsible_party)
via `assignVerificationItem`. The existing platform Notification system is
reused for completion/client-response events (wiring lands with the client
page). No separate notification system was built.

**Performance:**

- Queue is generated server-side in one call; the workspace renders from
  the single response (items + summary + recommended action).
- Filter/sort/search execute server-side via the pure
  `filterAndSortItems` engine; pagination via limit/offset.
- Refreshing one item re-runs the lightweight load (no full recompute on
  every small interaction — upsert is idempotent by dedup key).
- Evidence is loaded inline in each expandable card (no per-item network
  round trips).
- The workspace degrades gracefully if the migration has not been run yet
  (empty state, no crash).

**Mobile and responsive:**

- Desktop: expandable cards with inline evidence. Mobile: one-item focus
  via the expandable card pattern; primary actions remain visible; no
  horizontal scrolling; evidence in stacked rows, not dense grids.

**Migration:**

`src/supabase/migrations/business_valuation_phase13_3e3_verification_queue.sql`
creates `valuation.valuation_verification_items` and
`valuation.valuation_client_requests`. Manual SQL Editor execution
required (the Supabase connector lacks database:write scope). Until run,
the queue loads as an empty state.

**Tests:**

- Backend action routing verified: `getVerificationQueue` returns
  `VALUATION_NOT_FOUND` for an unknown valuation (confirms action is
  reachable, identity resolution + authorization run).
- Conflict resolution requires a reason for material conflicts
  (enforced server-side: `RESOLUTION_REASON_REQUIRED_FOR_MATERIAL_CONFLICT`).
- Add-back approvals write through to `valuation_adjustments` with
  approved status; rejections insert no adjustment.
- Staleness propagation reuses the existing dependency map — no new
  staleness logic.
- Multi-business isolation: all source queries are scoped by business_id
  derived from the valuation; no cross-business items, requests, or
  evidence.
- Permission roles: `requireValuationView` (read queue), `requireValuationEdit`
  (resolve/approve/request); super_admin bypasses. Client isolation:
  client-facing page (deferred) will filter by assigned_client_profile_id.
- Existing Valuation Engine, publication, versioning, and audit are
  untouched — resolutions write through to existing tables only.

**Bugs found:**

- None during E.3. The `verificationQueueService` function is ~600 lines;
  it remains within limits but the source-loading section duplicates the
  intelligence source queries from `valuationService`. A future refactor
  should extract `loadIntelligenceSources` into a shared module both
  functions import (not done now to avoid altering the certified E.2
  implementation).

**Known limitations:**

- The migration must be run manually before the queue persists state.
  Until then, generation runs but upserts error gracefully (empty state).
- Batch and Section review modes are not yet built; the core supports
  per-item resolution (the highest-value path). Bulk actions and
  focus/section modes land in a follow-up.
- The client-facing guided request page is deferred — advisor-side request
  creation and tracking is live; the client experience lands in a later
  phase.
- The questionnaire "Show All Questions" advanced toggle lands with the
  simplified questionnaire UI in E.4.
- Once an item is resolved, it stays resolved even if underlying data
  changes and a new conflict with the same dedup key appears. Advisors
  can re-open by editing in the Advanced workspace. Re-detection of
  re-emerging conflicts is a future enhancement.
- `methodology_decision`, `unsupported_assumption`, `reconciliation_required`,
  `document_mapping_review`, `assessment_conflict`, and
  `proposed_deduction` item types are defined in the model and allowlist
  but not yet generated by the builder; they will be wired as their
  source subsystems (methodology selection, reconciliation queue,
  document classification review) are integrated in follow-ups.

**READY FOR PHASE 13.3E.4**

---

### Phase 13.3E.4A — Advisor Workflow Navigation Refinement ✅ COMPLETE

**Previous workspace model:**

Intelligence → Verify → Valuation → Insights → Action Plan → Reports → Advanced

This was technically correct but reflected software modules more than the
way institutional advisors naturally work.

**New workspace model:**

Discover → Validate → Build Value → Valuation → Growth Plan → Deliverables → Advanced

The workflow now communicates a guided institutional advisory process:

- Discover what the system already knows
- Validate what requires human judgment
- Understand what creates or suppresses value
- Determine what the company is worth
- Prioritize how to increase that value
- Deliver the conclusion and plan

**Mental-model rationale:**

The previous labels (Intelligence, Verification Queue, Method Reconciliation,
Equity Bridge, Calculation Engine) are technical and software-centric. The
new labels use plain-language primary navigation. Technical terminology
remains available inside expanded detail and the Advanced workspace. The
advisor experience now feels like a guided institutional advisory process,
not a collection of software tools.

**Route mapping (non-breaking):**

Old identifiers map to new identifiers via a centralized `ROUTE_MAP`:

| Old | New |
|-----|-----|
| intelligence | discover |
| verify | validate |
| action_plan | growth_plan |
| reports | deliverables |

New identifiers pass through. Saved links using old identifiers continue
working. Direct routes to Advanced detailed sections are preserved. The
workspace is selected via a `?ws=` query parameter, so the route path
`/advisory/valuation/:valuationId` is unchanged.

**Build Value architecture:**

A pure, deterministic frontend engine
(`src/lib/valuation/buildValueEngine.js`) maps intelligence candidates to
six institutional dimensions: Financial Quality, Growth Quality, Commercial
Quality, Operational Quality, Leadership and Transferability, Risk and
Governance. No calculations. No fabrication. No I/O.

For each dimension the engine produces a scorecard with: current score
(actual primary metric value or "Insufficient verified information"),
confidence, evidence completeness, strengths, risks, missing evidence,
EBITDA/multiple/transferability relevance, and a recommended next
validation step.

The Business Quality Summary shows strongest/weakest dimension, largest
EBITDA/multiple/transferability constraints, largest evidence gap,
highest-confidence strength, and recommended next action. This is an
evidence-based diagnosis — not the Growth Plan. No unapproved initiatives
are generated. No AI estimate is substituted without labeling.

**Role-aware experience:**

The shell derives the user's role from auth + valuation assignment:
advisor (can_edit), reviewer (can_review), publisher (can_publish),
viewer (can_view only), business_owner (auth owner), client_team (auth
team_member). Super_admin is treated as advisor. Edit and publish
permissions are enforced via canEdit / canPublish flags passed to each
workspace. Business owners and client team members see a simplified-role
banner in the header.

**Progress dependencies:**

Discover may proceed while documents process. Validate depends on
discovered exceptions. Build Value uses verified or labeled provisional
information. Valuation requires critical financial and methodology inputs.
Growth Plan requires an approved or mature valuation conclusion.
Deliverables require approved outputs and permission. No percentages
fabricated.

**Guided journey:**

A compact `GuidedJourney` component near the header answers: Where am I?
What is completed? What is blocking? What should I do next? Who owns it?
It shows ONE recommended next action — never several equal-priority calls.

**Analytics:**

`valuation_stage_entered` tracked via base44.analytics on each workspace
switch. No sensitive document values captured. Additional events land in
a follow-up.

**Components reused (unchanged):**

- IntelligenceWorkspace (Discover) — E.2 implementation, copy updated
- VerifyWorkspace (Validate) — E.3 implementation, copy updated
- AdvancedWorkspaceContent — all 26 tools preserved, reorganized into
  Setup, Questionnaire, Financials, Methods, Analysis, Output
- ValuationProgress — updated for six new stage labels
- All certified Engine, Intelligence, Verification Queue, staleness,
  publication, versioning, audit, permissions, isolation — untouched

**Components created:**

- `src/lib/valuation/buildValueEngine.js`
- `src/components/valuation/experience/buildvalue/BusinessQualitySummary.jsx`
- `src/components/valuation/experience/buildvalue/DimensionScorecard.jsx`
- `src/components/valuation/experience/BuildValueWorkspace.jsx`
- `src/components/valuation/experience/GuidedJourney.jsx`
- `src/components/valuation/experience/GrowthPlanWorkspace.jsx`
- `src/components/valuation/experience/DeliverablesWorkspace.jsx`

**Regression results:**

- Discover data intact, Validate queue intact
- Build Value does not recalculate (pure presentation)
- Valuation Engine unchanged (no backend changes)
- Growth Plan is a shell (no Sprint items created)
- Deliverables preserve client-safe boundaries
- Advanced retains all 26 tools
- Old links work (ROUTE_MAP)
- Progress accurate, permissions intact, isolation intact

**Known limitations:**

- Valuation workspace renders a placeholder to Advanced; simplified
  one-page workspace lands in main Phase 13.3E.4.
- Growth Plan is a structured shell; Phase 13.4 Engine not implemented.
- Deliverables shows output cards + version history; per-audience
  generators land in a follow-up.
- Role-awareness at shell level; per-workspace UI hiding refines later.
- Analytics tracks stage entry; additional events land in a follow-up.
- Many Build Value evidence items show "Insufficient verified
  information" because resolvers don't yet exist — honest by design.

**READY FOR PHASE 13.3E.4** (simplified Valuation workspace — not started automatically)

---

### Phase 13.3E.4A — Stabilization & Verification ✅ COMPLETE

**Import verification:**

- `ValuationExperienceShell`: removed unused `useMemo` import; confirmed
  `useState`, `useEffect`, `useParams`, `useNavigate`, `useSearchParams`,
  `useAuth`, all service imports, all component imports, `base44.analytics`,
  and all lucide icons resolve correctly.
- `IntelligenceWorkspace`: `Loader2`, `RefreshCw`, `Search` all imported and
  used; all seven intelligence panel imports resolve; `DiscoverHeader` renders
  below the shell header, above summary content, without duplicating the
  page title or shifting the progress strip.
- `BuildValueWorkspace`: `Loader2`, `RefreshCw`, `getValuationIntelligence`,
  `buildValueAssessment`, `BusinessQualitySummary`, `DimensionScorecard` all
  resolve.
- `GuidedJourney`: all lucide icons resolve; no duplicate imports.
- `GrowthPlanWorkspace`, `DeliverablesWorkspace`: all imports resolve.
- No unused imports remain in any Phase 13.3E.4A file.

**Route compatibility results:**

| Input (`?ws=`) | Resolves to |
|---------------|-------------|
| `intelligence` | `discover` |
| `verify` | `validate` |
| `action_plan` | `growth_plan` |
| `action-plan` | `growth_plan` |
| `reports` | `deliverables` |
| `discover` | `discover` |
| `validate` | `validate` |
| `build_value` | `build_value` |
| `build-value` | `build_value` |
| `valuation` | `valuation` |
| `growth_plan` | `growth_plan` |
| `growth-plan` | `growth_plan` |
| `deliverables` | `deliverables` |
| `advanced` | `advanced` |
| (invalid/missing) | `discover` (safe fallback) |

- No redirect loop: `selectWorkspace` writes the mapped key to the URL and
  sets state in one call; a sync effect reconciles state when the URL changes
  via browser back/forward without looping.
- Browser refresh preserves the active workspace (component remounts from
  `searchParams`).
- Direct links work (same remount path).
- Invalid keys safely fall back to Discover.
- Advanced deep links open the correct detailed tool group.

**Intelligence-to-Build-Value data flow:**

- `IntelligenceWorkspace` loads the intelligence record and calls
  `onIntelligenceLoaded(res.intelligence)`, which lifts it to shell state.
- `BuildValueWorkspace` receives `intelligence` as a prop; if null, it loads
  its own copy via `getValuationIntelligence` and calls
  `onIntelligenceLoaded` to sync the shell.
- `buildValueAssessment` consumes the intelligence record read-only:
  `candidates`, `conflicts`, `summary`, `recommendedAction`.
- No valuation recalculation occurs in Build Value.
- Business snapshot fields, document intelligence, assessment intelligence,
  confidence, conflicts, and missing information all flow through the
  intelligence record as read-only evidence.

**Six-dimension mapping validation:**

For each dimension, the engine uses actual available evidence only:

1. **Financial Quality** — maps `ttm_revenue`, `gross_margin_percentage`,
   `ttm_ebitda`, `working_capital_balance`, `annual_capex`; missing fields
   remain missing; no fabricated score.
2. **Growth Quality** — maps `historical_growth_rate`; remaining items show
   as missing.
3. **Commercial Quality** — maps `recurring_revenue_percentage`,
   `customer_retention_rate`, `revenue_concentration_top_customer`.
4. **Operational Quality** — maps `documented_sops`, `employee_count`.
5. **Leadership and Transferability** — maps `owner_hours_per_week`,
   `succession_plan_exists`, `ownership_structure`.
6. **Risk and Governance** — maps `pending_litigation`, `tax_filing_status`,
   `cybersecurity_measures`, `revenue_concentration_top_customer`.

- Confidence derives from available evidence only (average of available
  candidate confidence scores; 0 when none).
- No default score when evidence is insufficient — `current_score` is null
  and the UI displays "Insufficient verified information".
- Strengths come from available evidence with confidence ≥ 70.
- Risks come from risk-relevance evidence, low-confidence items, or
  conflicting items.
- Missing evidence is listed explicitly.
- EBITDA, Multiple, and Transferability relevance labels are preserved per
  dimension.

**BusinessQualitySummary validation:**

- Strongest dimension: highest evidence completeness.
- Weakest dimension: lowest evidence completeness.
- Largest EBITDA constraint: dimension with most missing ebitda-relevance
  items.
- Largest multiple constraint: dimension with most missing multiple-relevance
  items.
- Largest transferability risk: dimension with most missing
  transferability-relevance items.
- Largest evidence gap: lowest-completeness dimension.
- Highest-confidence strength: highest-confidence strength across all
  dimensions.
- Recommended next action: first incomplete dimension by order.
- No conclusions created from empty or low-confidence data without labeling
  them provisional (the DimensionScorecard labels provisional vs verified).

**GuidedJourney validation:**

- Displays current stage, completion count (N of 6), blocker count, single
  recommended next action, and responsible party.
- Next action priority: blocked → in_progress → not_started → active.
- Stage transitions (Discover → Validate → Build Value → Valuation →
  Growth Plan → Deliverables) all use real progress and blocker data from
  `computeStages`.

**Role-aware validation:**

| Role | Behavior confirmed |
|------|-------------------|
| Super admin | Treated as advisor; full access; canEdit + canPublish |
| Advisor | Full six-stage workflow; canEdit true |
| Reviewer | Validation and approval emphasis; canEdit from assignment |
| Publisher | Readiness and Deliverables emphasis; canPublish true |
| Viewer | Read-only; canEdit/canPublish false |
| Business owner | Simplified-role banner; no edit controls |
| Client team | Simplified-role banner; assigned requests only |

- Advanced is available to all authenticated users with view access (it
  preserves the existing permission model; per-workspace role hiding
  refines in later phases).

**Growth Plan and Deliverables shell validation:**

- Growth Plan: clearly marked as staged for Phase 13.4; no recommendations
  generated; no Sprint or roadmap items created; displays structured
  value-driver candidate sections and lifecycle stages only.
- Deliverables: preserves client-safe boundaries (client_safe flag per
  deliverable); does not expose internal evidence; shows report status and
  version; handles no-published-version state gracefully (status cards show
  "Not published" / "—").

**Build and runtime results:**

- No missing imports, undefined components, invalid hook calls, or stale
  references to old workspace names.
- No duplicate route keys.
- Null intelligence data handled: BuildValueWorkspace shows loading state,
  then "Insufficient verified information" scorecards.
- Build Value does not render before intelligence loads (loading gate).
- No infinite re-render loops (sync effect guards with `mappedWs !==
  activeWorkspace`; analytics effect depends on `activeWorkspace` only).
- Analytics fires once per workspace switch (not on every render).

**Bugs found and fixed:**

1. **Unused `useMemo` import** in ValuationExperienceShell — removed.
2. **Unused `latestVersion` variable** in `computeStages` — removed.
3. **Missing hyphenated route variants** (`action-plan`, `growth-plan`,
   `build-value`) — added to ROUTE_MAP for robustness.
4. **No URL sync on browser back/forward** — added a sync effect that
   reconciles `activeWorkspace` when `searchParams` change without looping.

**Regression testing:**

- Discover still loads completed Intelligence functionality (E.2 intact).
- Validate still loads Verification Queue (E.3 intact).
- Build Value is read-only and evidence-based (no calculation calls).
- Valuation remains connected to certified calculations (placeholder points
  to Advanced; engine untouched).
- Growth Plan remains a shell (no Sprint items created).
- Deliverables remains a shell (version history from existing service).
- Advanced retains all 26 detailed tools (reorganized groups).
- Progress strip uses new stage labels (Discover, Validate, Build Value,
  Valuation, Growth Plan, Deliverables).
- Multi-business switching works (valuationId from route params).
- Permissions remain intact (canEdit/canPublish from assignment).
- Existing published valuations remain unchanged (immutable versions
  untouched).
- Existing calculations remain unchanged (no backend changes).
- No database migration required for this stabilization step.

**Remaining known limitations:**

- Valuation workspace still renders a placeholder to Advanced; simplified
  one-page workspace lands in Phase 13.3E.4.
- Growth Plan is a structured shell; Phase 13.4 Engine not implemented.
- Deliverables shows output cards + version history; per-audience
  generators land in a follow-up.
- Role-awareness at shell level; per-workspace UI hiding refines later.
- Analytics tracks stage entry only; additional events land in a follow-up.
- Many Build Value evidence items show "Insufficient verified information"
  because field resolvers don't yet exist — honest by design.

**VERIFICATION COMPLETE — READY FOR PHASE 13.3E.4**

---

### Phase 13.3E.4 — Simplified Valuation Workspace ✅ COMPLETE

**Architecture:**

The Valuation workspace is now a single guided command center with
progressive disclosure, replacing the 14-tool tab bar. The certified
Valuation Engine remains the source of truth — this workspace only
presents the engine's outputs and embeds certified components for detail
editing. No calculation, approval, publication, readiness, or staleness
logic is duplicated in the frontend.

**Command-center design:**

The top of the workspace shows a concise ValuationCommandHeader with:
- Enterprise Value range + midpoint (gold, primary)
- Equity Value range + midpoint (cyan, primary)
- Defensible Value (green)
- Potential Value (purple, visually secondary, labeled "Future modeled
  value — not current value")
- Overall confidence score
- Advisor conclusion status (approved vs workflow state label)
- Publication readiness (ready / blockers / not ready)
- Engine version + latest calculation date

When no approved conclusion exists, the command header shows the current
workflow state (e.g., "Earnings require calculation", "Reconciliation
awaiting approval") instead of a misleading $0. Zero is never shown
unless it is an actual approved result.

**Journey model:**

A compact vertical ValuationJourneyNav shows 10 steps with status icons:
1. Setup → 2. Earnings → 3. Weighting → 4. Methods → 5. Reconciliation →
6. Value → 7. Equity → 8. Confidence → 9. Conclusion → 10. Publish

Each step shows: complete, in_progress, needs_review, stale, blocked,
not_started. Clicking a step scrolls to the corresponding section. On
mobile, the journey converts to a compact current-step selector (no
horizontal overflow).

**Contextual next action:**

A prominent callout near the top shows ONE recommended next action with:
- What to do (derived from actual workflow state)
- Why it matters
- What it unlocks
- A direct action button

The priority chain: setup → earnings → weighting → methods →
reconciliation → equity bridge → confidence → conclusion → publication
blockers → publish. Never several equal-priority buttons.

**Sections implemented (10 collapsible sections):**

| # | Section | Certified component embedded |
|---|---------|------------------------------|
| 1 | Valuation Setup | EngagementSetup |
| 2 | Maintainable Earnings | NormalizedEarningsEngine |
| 3 | Historical Weighting | WeightingSection (calls backend engine) |
| 4 | Valuation Methods | MethodologySelection |
| 5 | Method Reconciliation | MethodReconciliation |
| 6 | Enterprise Value | ExplainabilityPanel + EV explanation |
| 7 | Equity Value | EquityValueBridge |
| 8 | Confidence and Defensibility | ConfidenceScoring |
| 9 | Advisor Conclusion | AdvisorConclusion |
| 10 | Publication Readiness | Backend readiness result (validatePublicationReadiness) |

Each section uses the reusable ValuationSection wrapper:
- Collapsed: title, status badge, stale badge, concise summary
- Expanded: certified component + contextual links to Validate/Advanced
- Stale sections show a stale badge with animate-pulse

**Certified components reused (unchanged):**

EngagementSetup, NormalizedEarningsEngine, MethodologySelection,
MethodReconciliation, EquityValueBridge, ConfidenceScoring,
AdvisorConclusion, ExplainabilityPanel. All load their own data via
`valuationId` and call the certified backend engine. No calculation
logic is duplicated in the browser.

**State derivation module:**

`src/lib/valuation/valuationState.js` — pure, deterministic functions
that derive journey state, section statuses, and the recommended next
action from real loaded data (calcSummary, readiness, summary). No I/O.
No calculations. No fabrication. Matches the certified patterns from
CalculationReadinessPanel (blended reconciliation selection, equity
bridge selection, overall confidence, approved conclusion).

**Verify integration:**

The Valuation workspace summarizes unresolved issues via contextual
links to the Validate workspace. Each section that may have unresolved
items shows an "Open in Validate →" link. The link calls
`onNavigateToValidate` which switches to the Validate workspace. No
parallel queue is created.

**Build Value integration:**

The `intelligence` prop is passed from the shell to the Valuation
workspace for future Build Value findings integration (e.g., showing
customer concentration or owner dependency findings in the relevant
method or confidence sections). This is a planned follow-up — Build
Value findings are explanatory only and never recalculate valuation.

**Explainability integration:**

The ExplainabilityPanel is embedded in the Enterprise Value section,
allowing the advisor to trace: Value → Reconciliation → Method →
Earnings basis → Financial period → Adjustment → Evidence. The panel
is advisor-facing only (clientView=false by default).

**Stale state experience:**

Stale sections show:
- A stale badge with animate-pulse icon
- The section status reflects 'stale'
- The command header shows stale badges on EV and Equity panels
- The journey nav shows stale icons

Stale values never appear current without a clear warning. Approved
calculations are never automatically overwritten.

**Permission-aware actions:**

| Role | Behavior |
|------|----------|
| Viewer | View summaries and detail; no edit, calculate, approve, or publish |
| Editor (canEdit) | Edit inputs, recalculate; cannot approve or publish |
| Reviewer | Review and approve permitted records |
| Publisher (canPublish) | Publish when readiness passes |
| Super admin | Full authority |
| Client | No access to this internal workspace (shell hides for client roles) |

canEdit and canPublish flags are passed from the shell's assignment
check. The sticky action bar shows/hides actions based on these flags.
Backend permissions remain authoritative.

**Sticky advisor action bar:**

A compact ValuationActionBar at the bottom shows:
- Current next action
- Resolve Blocker (when blockers exist)
- Recalculate (when canEdit and not ready)
- Approve (when canEdit and not ready)
- Publish Version (when canPublish and ready)
- On mobile: one primary action + overflow menu

**Performance:**

- Initial load uses only data already loaded by the shell (summary,
  calcSummary, readiness). No additional fetch on first render.
- Certified components load their own detail on demand when sections
  are expanded.
- The journey nav and command header render from the single
  calcSummary response.
- Explainability, DCF projections, asset-item details, benchmark
  detail, version comparison, and full evidence load only when their
  section is expanded.

**Responsive design:**

- Desktop: command header + journey rail (180px left) + sections
  (right) + sticky action bar
- Tablet: single-column sections, compact journey selector
- Mobile: one section at a time (collapsible), full-width values,
  fixed primary action, no horizontal overflow

**Empty, loading, and error states:**

- No approved earnings: "No earnings calculated. Complete Financial
  Normalization first."
- No benchmark: handled by certified MultipleAnalysisEngine
- No reconciliation: "Select and calculate at least one applicable
  method."
- Stale equity bridge: stale badge + "Equity bridge not yet
  calculated" or stale indicator
- No conclusion: "Advisor conclusion has not been prepared."
- Loading: certified components show their own loaders

**Advanced workspace preservation:**

All 26 detailed tools remain accessible under Advanced. The simplified
Valuation workspace reuses or calls certified components. No formulas,
readiness rules, staleness logic, conclusion system, or publication
system are duplicated.

**Shell integration:**

- ValuationWorkspace replaces the WorkspacePlaceholder for the
  'valuation' case
- Shell passes: valuationId, summary, calcSummary, readiness,
  intelligence, canEdit, canPublish, onOpenAdvanced,
  onNavigateToValidate
- Shell's computeStages updated to use valuationState functions for
  accurate Valuation stage status (approved conclusion → ready,
  publication blockers → blocked)
- Unused WorkspacePlaceholder import removed from shell

**Components created:**

- `src/lib/valuation/valuationState.js` — pure state derivation
- `src/components/valuation/experience/valuation/ValuationSection.jsx`
- `src/components/valuation/experience/valuation/ValuationCommandHeader.jsx`
- `src/components/valuation/experience/valuation/ValuationJourneyNav.jsx`
- `src/components/valuation/experience/valuation/ValuationActionBar.jsx`
- `src/components/valuation/experience/valuation/WeightingSection.jsx`
- `src/components/valuation/experience/ValuationWorkspace.jsx`

**Components reused (unchanged):**

EngagementSetup, NormalizedEarningsEngine, MethodologySelection,
MethodReconciliation, EquityValueBridge, ConfidenceScoring,
AdvisorConclusion, ExplainabilityPanel — all certified components
preserved.

**Regression results:**

- Discover, Validate, Build Value unchanged
- Valuation Engine unchanged (no backend changes)
- Growth Plan remains a shell
- Deliverables remains a shell
- Advanced retains all 26 tools
- Old routes work (ROUTE_MAP unchanged)
- Progress strip Valuation stage now reflects approved conclusion +
  publication blockers
- Permissions intact (canEdit/canPublish from assignment)
- Multi-business isolation intact
- Existing published valuations unchanged (immutable)
- Existing calculations unchanged (no backend changes)
- No database migration required

**Bugs found and fixed:**

1. EngagementSetup accepts `{ valuation, onUpdate }`, not `{ summary }`
   — fixed prop pass to `valuation={summary?.valuation}`.
2. MethodologySelection `answers` prop expects an object, not the
   intelligence candidates array — fixed to pass `{}`.
3. Unused WorkspacePlaceholder import in shell after replacing the
   valuation placeholder — removed.
4. Shell computeStages Valuation stage didn't check for approved
   conclusion — updated to use `getApprovedConclusion` and
   `getConclusionStatus` from valuationState.

**Known limitations:**

- Build Value findings integration (showing customer concentration,
  owner dependency, etc. in context) is planned for a follow-up — the
  `intelligence` prop is wired but not yet consumed in section
  summaries.
- The WeightingSection is a lightweight UI that calls the certified
  backend engine; a richer weighting visualization (chart/bridge) can
  be added in a follow-up.
- Method detail drawers (Multiple, DCF, Cap Earnings, Asset) open the
  certified components inline; dedicated drawer/sheet containers can
  be added in a follow-up for a more polished progressive-disclosure
  experience.
- The sticky action bar's recalculate and approve actions are wired to
  the next action's section but do not yet call specific calculation
  endpoints (they scroll to the section where the certified component
  provides those actions).
- Potential Value is sourced from conclusion_type='potential'; if no
  potential conclusion exists, it shows "Not yet determined" (by
  design).

**READY FOR PHASE 13.3E.5**

---

### Phase 13.3E.5 — Insights, Growth Plan, and Deliverables Experience ✅ COMPLETE

**Architecture:**

Three coordinated experiences that translate technical valuation findings
into clear business strengths, risks, value opportunities, next actions, and
client-facing outputs. All three use only approved valuation calculations,
verified intelligence, Build Value dimensions, approved value drivers,
approved confidence results, Version Intelligence, and advisor-approved
findings. No unsupported impact is fabricated — "Impact not yet quantifiable"
is shown wherever evidence is insufficient.

**1. Executive Insights Experience:**

Embedded at the top of the Build Value workspace (and accessible from
Valuation). Answers: What is creating value? What is suppressing value?
What is limiting EBITDA / multiple / transferability? What evidence is
missing? What changed since the previous valuation? What deserves
attention first?

- `insightsEngine.js` — pure, deterministic engine that derives:
  - Current Value Summary (EV, Equity, Defensible, Potential, EV Gap,
    Confidence, date, version, working status, publication readiness)
  - Top Value Drivers (from approved value drivers + Build Value strengths)
  - Top Value Detractors (from detractors + Build Value risks + conflicts +
    publication blockers)
  - Constraint Summary (largest EBITDA/multiple/transferability/confidence/
    evidence/publication constraints, highest-confidence strength and risk)
  - Fastest Wins (candidate opportunities from unresolved add-backs, conflicts,
    missing evidence, publication blockers)
  - Version Intelligence (EV/Equity/EBITDA/Multiple/Confidence/Defensible/
    Potential deltas, Value Attribution, Waterfall, Advisor and Client stories)

- Each driver card shows: name, category, current state, why it matters,
  EBITDA/multiple/transferability/risk relevance, estimated EV impact range
  (when supported), confidence, evidence, advisor status, client visibility,
  explainability link.

- Each detractor card shows: current issue, why it matters, EBITDA/multiple/
  risk/transferability effect, estimated impact (when supported), confidence,
  evidence, missing evidence, recommended validation step, advisor status,
  client visibility, and a link to Validate.

- Constraint summary items link to Build Value dimension, Valuation
  calculation, Validate issue, or Advanced detail where applicable.

- Fast wins are labeled "Candidate Opportunity" until advisor-reviewed.

- Version Intelligence integrates certified `getVersionDeltas` — shows
  deltas, attribution, waterfall, advisor story, client-safe story, and
  all version comparisons. Does not alter immutable version records.

**2. Current Value Summary:**

Clearly distinguishes Current Value (Enterprise Value), Defensible Value,
Potential Value, and Equity Value — never combining them into one headline
number. Shows EV range, EV Gap, Overall Confidence, Valuation Date, Current
Published Version, and Latest Working Valuation Status.

When no approved conclusion exists, the summary shows an empty state:
"Complete the Valuation stage to unlock approved value insights."

**3. Growth Plan Workspace:**

Complete advisor preparation environment. Organizes approved value drivers,
detractors, risks, opportunities, missing evidence, and candidate initiatives.

- `growthPlanEngine.js` — pure, deterministic engine that:
  - Derives candidate initiatives from valuation findings (detractors +
    fastest wins mapped to initiative groups)
  - Supports advisor-created initiatives (full initiative model)
  - Provides Advisor Prioritization Preview (advisor-controlled sorting
    and filtering by 10 criteria)
  - Preserves Value Creation Chain of Custody (10-level lineage drawer)
  - Filters client-safe content

- Initiative groups: EBITDA Growth, Multiple Expansion, Risk Reduction,
  Transferability, Financial Quality, Operational Quality, Commercial
  Quality, Leadership, Governance, Confidence and Documentation.

- Initiative card model: name, summary, business problem, supporting value
  driver, Build Value dimension, source finding, evidence, EBITDA/multiple/
  transferability/risk/confidence relevance, estimated EBITDA/multiple/EV
  impact, estimated cost, expected ROI, timeline, difficulty, confidence,
  dependencies, responsible role, KPI, baseline, target, verification
  method, advisor status, client visibility, execution readiness, notes.

- Status model: Candidate → Needs Evidence → Advisor Review → Approved →
  Client Visible → Deferred → Ready for Execution → Sent to Roadmap →
  Sent to Sprint → Completed → Rejected.

  For this phase: candidate creation, advisor review, approval, client
  visibility, and readiness recording are allowed. "Send to Roadmap" and
  "Send to 90-Day Sprint" are future-ready but not activated (Phase 13.4).

- Advisor Prioritization Preview: sorting by EV relevance, EBITDA relevance,
  multiple relevance, risk reduction, time to value, difficulty, confidence,
  estimated cost, dependency count, execution readiness. Labeled "Advisor
  Prioritization Preview" — not the final Institutional Decision Engine.

- Chain of Custody drawer: Initiative → Value Driver → Build Value Dimension
  → Business Capability → Operational Lever → Financial Impact → Valuation
  Method Impact → Expected EV Relevance → KPI → Verification Method.
  Execution and realized-value links deferred to Phase 13.4.

- Client Growth Plan Preview: shows only advisor-approved, client-visible
  initiatives. Displays initiative, why it matters, expected outcome,
  timeline, responsible party, KPI, status, next milestone. Does NOT show
  internal impact formulas, confidence calculations, evidence IDs, or notes.

- Three tabs: Initiatives (grouped by category), Prioritization Preview,
  Client Preview.

**4. Deliverables Workspace:**

Complete deliverables workspace organized by audience.

- `deliverablesEngine.js` — pure, deterministic engine that:
  - Defines 18 deliverables across 3 audiences (Client, Advisor,
    Transaction and Capital Partners)
  - Derives deliverable status from version + sharing + freshness data
  - Enforces client-safe boundaries
  - Groups by audience

- Client deliverables: Enterprise Value Analysis, Valuation Summary, Growth
  Plan, What Changed Since Last Valuation, Valuation Story, Quarterly Value
  Review.

- Advisor deliverables: Internal Valuation Analysis, Evidence and
  Explainability Report, Verification Summary, Advisor Conclusion,
  Publication Readiness Report, Version Comparison.

- Transaction/Capital Partner deliverables: Buyer Preparation Summary, Lender
  Summary, CPA Summary, Family Office Summary, Board Summary, Quality of
  Earnings Preparation.

- Deliverable card model: report name, audience, purpose, status, current
  version, source valuation version, last generated, generated by, review
  status, client-safe status, shared status, shared/revoked dates, data
  freshness, stale warning, missing sections, and permission-aware action
  buttons (Preview, Generate, Regenerate, Share, Revoke).

- Report status model: Not Started → Draft → Needs Data → Needs Review →
  Advisor Approved → Ready to Generate → Generated → Shared → Revoked →
  Stale → Archived.

  A report becomes stale when its source valuation version or approved
  visible content changes. Shared outputs remain historical and unchanged.
  Regeneration creates a new report version or replaces only an unshared
  draft.

- Report Preview Drawer: full-screen preview showing report sections,
  current version, data sources, missing content, stale warnings, internal
  or client-safe badge, advisor approval status. Advisor controls:
  commentary, visible drivers/risks/opportunities toggles, disclosures,
  hide optional sections, save draft, approve, generate. Clients cannot
  edit advisor conclusions.

- Report generation rules: internal reports may use internal snapshot,
  calculation lines, evidence, advisor notes, verification history, version
  deltas, value attribution. Client-safe reports use only client-safe
  snapshot, approved client-visible drivers/risks/opportunities, advisor
  commentary, disclosures, and client-safe Valuation Story. No client
  report is generated from mutable working records without clear draft
  labeling.

- Share and Revoke actions use the certified `shareValuation` and
  `revokeClientAccess` backend functions.

**5. Build Value, Valuation, and Growth Plan Linkage:**

Direct navigation supported: Build Value finding → Valuation impact → Growth
Plan initiative. Detractors link to Validate for evidence resolution.
Growth Plan does not modify historical valuation outputs (one-way flow).

**6. Validate Integration:**

Unresolved evidence issues (impact estimate lacks evidence, driver is low
confidence, client confirmation missing, document required, baseline KPI
missing) link back to Validate. No second issue-resolution queue is built.

**7. Permission-Aware Experience:**

- Viewer: read-only Insights, Growth Plan, Deliverables previews
- Editor (canEdit): edit candidate initiatives, prepare report drafts
- Reviewer: approve findings and deliverable content
- Publisher (canPublish): publish valuation, generate and share approved
  deliverables
- Client: view approved client-safe Insights, Growth Plan, shared Deliverables

Backend authorization remains authoritative.

**8. Empty States:**

- Insights without approved valuation: "Complete the Valuation stage to
  unlock approved value insights."
- Growth Plan without approved findings: "Review Build Value and Valuation
  findings before preparing initiatives."
- Deliverables without published version: "Publish a valuation version
  before generating final client deliverables."

No empty grids or misleading zero values.

**9. Progress Strip Integration:**

- Growth Plan stage: derived from valuation readiness + intelligence
  completeness. In progress when findings exist; ready when valuation is
  approved and candidate initiatives are available for review.
- Deliverables stage: in progress when versions exist; ready when
  deliverables are generated and shared. No fabricated percentages.

**10. Components Created:**

Engines:
- `src/lib/valuation/insightsEngine.js`
- `src/lib/valuation/growthPlanEngine.js`
- `src/lib/valuation/deliverablesEngine.js`

Insights:
- `src/components/valuation/experience/insights/CurrentValueSummary.jsx`
- `src/components/valuation/experience/insights/ValueDriverCard.jsx`
- `src/components/valuation/experience/insights/ValueDetractorCard.jsx`
- `src/components/valuation/experience/insights/ConstraintSummary.jsx`
- `src/components/valuation/experience/insights/FastestWins.jsx`
- `src/components/valuation/experience/insights/VersionIntelligencePanel.jsx`
- `src/components/valuation/experience/insights/ExecutiveInsights.jsx`

Growth Plan:
- `src/components/valuation/experience/growthplan/InitiativeCard.jsx`
- `src/components/valuation/experience/growthplan/InitiativeFormModal.jsx`
- `src/components/valuation/experience/growthplan/ChainOfCustodyDrawer.jsx`
- `src/components/valuation/experience/growthplan/AdvisorPrioritizationPreview.jsx`
- `src/components/valuation/experience/growthplan/ClientGrowthPlanPreview.jsx`

Deliverables:
- `src/components/valuation/experience/deliverables/DeliverableCard.jsx`
- `src/components/valuation/experience/deliverables/ReportPreviewDrawer.jsx`

**11. Components Updated:**

- `src/components/valuation/experience/BuildValueWorkspace.jsx` — embedded
  ExecutiveInsights at the top
- `src/components/valuation/experience/GrowthPlanWorkspace.jsx` — complete
  rewrite from shell to full workspace
- `src/components/valuation/experience/DeliverablesWorkspace.jsx` — complete
  rewrite from shell to full workspace
- `src/components/valuation/experience/ValuationExperienceShell.jsx` —
  updated computeStages for Growth Plan and Deliverables; updated
  renderWorkspace to pass new props (calcSummary, readiness, summary,
  intelligence, onNavigateToValidate, onOpenAdvanced)

**12. Components Reused (unchanged):**

- All certified Valuation Engine components — untouched
- `buildValueEngine.js` — reused by insightsEngine
- `valuationState.js` — reused by insightsEngine for selectors and formatters
- `getValuationVersions`, `shareValuation`, `revokeClientAccess` — certified
  backend functions reused for Deliverables
- `getValueDrivers`, `getVersionDeltas` — certified backend functions reused
  for Insights and Growth Plan

**13. Regression Results:**

- Discover, Validate unchanged
- Build Value enhanced (insights embedded, dimensions preserved)
- Valuation unchanged (no backend changes)
- Growth Plan upgraded from shell to full workspace
- Deliverables upgraded from shell to full workspace
- Advanced retains all 26 tools
- Old routes work (ROUTE_MAP unchanged)
- Progress strip Growth Plan and Deliverables stages now reflect real data
- Permissions intact (canEdit/canPublish from assignment)
- Multi-business isolation intact (all data scoped by valuationId)
- Existing published valuations unchanged (immutable)
- Existing calculations unchanged (no backend changes)
- No database migration required

**14. Performance:**

- Insights: summary-first loading. Value drivers and version deltas loaded
  in parallel on mount. All insight panels render from the single response.
- Growth Plan: value drivers loaded on mount. Candidate initiatives derived
  in-memory from already-loaded intelligence. No per-initiative network
  round trips. Prioritization and filtering execute in-memory.
- Deliverables: versions loaded on mount. Deliverable status derived
  in-memory. Preview drawer loads on demand. No auto-regeneration on render.
- All three workspaces degrade gracefully when data is missing (empty
  states, no crashes).

**15. Responsive Design:**

- Desktop: executive Insights dashboard, filterable Growth Plan, grouped
  Deliverables
- Tablet: single-column cards, compact filters
- Mobile: one card at a time, full-screen preview drawer, no horizontal
  overflow

**16. Known Limitations:**

- Growth Plan initiatives are stored in local state for this phase.
  Persistence (saving initiatives to the backend) will be added with Phase
  13.4 or a follow-up. Candidate initiatives are derived fresh on each
  load; advisor-created initiatives and status changes are lost on refresh.
- "Send to Roadmap" and "Send to 90-Day Sprint" actions are not yet
  activated — they require Phase 13.4 or explicit approval.
- Deliverable report generation opens the preview drawer but does not yet
  produce a downloadable file. Full PDF/HTML generation lands in a
  follow-up.
- Stale detection for deliverables is structural (version comparison);
  real-time staleness from calculation changes will be wired with the
  staleness integration follow-up.
- The Report Preview Drawer builds sections from the in-memory insights
  record; a richer per-report template engine can be added in a follow-up.
- Version Intelligence panel shows deltas from `getVersionDeltas`; the
  full Value Attribution and Waterfall visualizations are available in
  the Advanced workspace.
- Build Value findings integration into Valuation workspace sections
  (showing customer concentration, owner dependency, etc. in context)
  remains a planned follow-up.

**17. Phase 13.4 Readiness:**

- Growth Plan initiative model is complete and ready for persistence
- Chain of Custody is defined (first 10 levels); execution and realized-
  value links will be added with Phase 13.4
- Advisor Prioritization Preview is the foundation for the Institutional
  Decision Engine
- Client-safe boundaries are established and tested
- Deliverable report templates are structured and ready for generation

**VERIFICATION COMPLETE — READY FOR FINAL UX REVIEW**

---

### Phase 13.3E.5 — Stabilization and Visual QA ✅ COMPLETE

**Shell syntax validation:**

- `renderWorkspace` switch audited: all 7 cases (discover, validate, build_value,
  valuation, growth_plan, deliverables, advanced) return valid JSX with correct
  props. No missing commas, broken parentheses, invalid fragments, duplicate
  props, or undefined variables.
- Default case returns null (safe).
- No fallthrough behavior — every case has a return.
- No old workspace identifiers in the switch.
- `selectWorkspace` maps via ROUTE_MAP before setting state and URL.

**Import validation:**

All E.5 files audited for missing, duplicate, unused, or mismatched imports.

Fixes applied:
- `BuildValueWorkspace.jsx`: renamed destructured `summary` to `bvSummary` to
  resolve collision with the `summary` prop (build-breaking fix).
- `GrowthPlanWorkspace.jsx`: removed unused `ArrowRight`, `INITIATIVE_STATUSES`,
  `ACTIVE_STATUSES` imports.
- `DeliverablesWorkspace.jsx`: removed unused `Share2`, `RotateCcw` imports.
- `ValueDriverCard.jsx`: removed unused `fmtCurrency` import.
- `ValueDetractorCard.jsx`: removed unused `ExternalLink` import.
- `DeliverableCard.jsx`: removed unused `Download` import.

All remaining imports resolve to real files/packages. No circular dependency
risk (engines import only from sibling engine files; components import from
engines and sibling components). No default/named import mismatches.

**Engine contract validation:**

`insightsEngine.js`:
- `buildCurrentValueSummary` — returns stable object with hasApprovedValuation,
  enterprise_value, equity_value, defensible_value, potential_value, ev_gap,
  overall_confidence, confidence_max, valuation_date, current_version,
  working_status, publication_ready. Handles null calcSummary/summary/readiness.
- `buildTopDrivers` — returns array; handles null valueDrivers and intelligence.
- `buildTopDetractors` — returns array; handles null inputs; sorts by status.
- `buildConstraintSummary` — returns object; handles null buildValue.
- `buildFastestWins` — returns array; handles null intelligence/readiness.
- `buildVersionIntelligence` — returns object with has_multiple_versions,
  latest_delta, deltas; handles null/empty versionDeltas.
- `buildExecutiveInsights` — returns object with currentValue, topDrivers,
  topDetractors, constraintSummary, fastestWins, versionIntelligence,
  buildValue, nextAction.
- No fabricated values. `IMPACT_NOT_QUANTIFIABLE` used for unsupported impact.
- Enterprise Value and Equity Value preserved as distinct values.

`growthPlanEngine.js`:
- `deriveCandidateInitiatives` — returns array of initiative objects with
  stable initiative_id, all fields populated, status='candidate'.
- `buildChainOfCustody` — returns 10-level chain array.
- `sortInitiatives` / `filterInitiatives` — pure array operations.
- `toClientSafeInitiatives` — filters by CLIENT_VISIBLE_STATUSES.
- `computeGrowthPlanProgress` — returns percent (clamped 0–100), status,
  reviewed, approved, client_visible, with_kpi, ready, next_action. Handles
  empty array. No NaN or negative values.
- No fabricated impact estimates.

`deliverablesEngine.js`:
- `buildDeliverables` — returns 18 deliverable objects with stable keys, status,
  metadata, permission flags. Handles null summary/versions/readiness.
- `groupByAudience` — returns 3 audience groups.
- `computeDeliverablesProgress` — returns percent, status, next_action,
  generated, shared, needs_attention, ready. Handles no published version.
  No NaN or negative values.
- `toClientSafeDeliverables` — filters by client_safe and shared status.
- No fabricated values.

**Data-flow validation:**

Intelligence → Build Value → Insights → Growth Plan → Deliverables is one-way.
- Growth Plan does not mutate intelligence, Build Value findings, approved
  valuation outputs, or published versions.
- Deliverables does not mutate valuation calculations, Growth Plan records, or
  published snapshots.
- No render-time function performs writes. All engines are pure (no I/O).
- All state mutations are in event handlers (status changes, form saves).

**Progress validation:**

`computeStages` audited for all 6 stages:
- Discover: from intelligence completion % and conflicts.
- Validate: from queue open/blocker/critical counts.
- Build Value: from intelligence completeness.
- Valuation: from approved conclusion + publication blockers.
- Growth Plan: from valuation readiness + intelligence completeness.
- Deliverables: from version count + publication blockers.
No fabricated percentages. No NaN or negative values. All clamped 0–100.

**Permission validation:**

- canEdit: derived from assignment.can_edit (or super_admin).
- canPublish: derived from assignment.can_publish (or super_admin).
- Growth Plan: "New Initiative" button hidden when !canEdit; status transitions
  hidden when !canEdit.
- Deliverables: Generate/Share/Revoke hidden when !canPublish; Preview available
  to all with view access.
- Client-safe boundaries: ClientGrowthPlanPreview filters by client-visible
  statuses; ReportPreviewDrawer hides advisor controls for client-safe reports.
- Backend authorization remains authoritative (all actions route through
  certified backend functions).

**Responsive QA:**

- Desktop wide: 6-stage progress grid, 2-column card grids, full preview drawer.
- Desktop narrow: cards reflow to fewer columns, no horizontal overflow.
- Tablet: single-column cards, compact filters, full-screen drawers.
- Mobile: one card at a time, full-width values, fixed primary action, no
  horizontal overflow. Progress strip uses 2-col grid on mobile.
- No sticky panels covering content. No overlapping elements.

**Visual issues found:**

- None requiring structural changes. Premium dark design system preserved
  (gold primary, cyan accent, dark backgrounds with glass-style cards).

**Fixes applied:**

1. Build-breaking: `summary` identifier collision in BuildValueWorkspace —
   renamed destructured value to `bvSummary`.
2. Cleanup: 6 unused imports removed across 5 files.

**Build result:**

- Production build succeeds after fixes.
- No syntax errors, no unresolved imports, no type errors.

**Console result:**

- No React key warnings (all lists use stable keys).
- No hook-order errors (all hooks at top level).
- No state-update-during-render (all mutations in handlers).
- No infinite loops (useMemo/useEffect dependencies correct).
- No undefined property access (all optional chaining on nullable data).
- Analytics fires once per workspace switch (effect depends on activeWorkspace).

**Regression result:**

- Certified Valuation Engine unchanged (no backend changes).
- Published snapshots unchanged (immutable).
- Version Intelligence unchanged (read-only consumption).
- Discover still works (E.2 intact).
- Validate still works (E.3 intact).
- Build Value still works (dimensions preserved, insights added).
- Simplified Valuation still works (E.4 intact).
- Advanced still works (all 26 tools preserved).
- Progress remains accurate (real data only).
- Old routes remain compatible (ROUTE_MAP unchanged).
- Browser back/forward works (sync effect guards against loops).
- Multi-business isolation works (all data scoped by valuationId).
- No database migration required for this stabilization step.

**Remaining UX limitations:**

- Growth Plan initiatives are in local state (lost on refresh); persistence
  lands with Phase 13.4.
- Deliverable report generation opens preview but does not produce a
  downloadable file; full PDF/HTML generation lands in a follow-up.
- Stale detection for deliverables is structural; real-time staleness from
  calculation changes will be wired with the staleness integration follow-up.
- Build Value findings integration into Valuation workspace sections remains
  a planned follow-up.
- "Send to Roadmap" and "Send to 90-Day Sprint" actions are gated until
  Phase 13.4 or explicit approval.

**READY FOR FINAL UX REVIEW**