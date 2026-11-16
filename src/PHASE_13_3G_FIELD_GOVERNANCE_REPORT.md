# Phase 13.3G — Field-Level Governance UX Report

## Overview

This phase completes the field-level governance layer for the Business Valuation
platform. It adds advisor-enforced ownership, audit history, and controlled
financial auditing as an **additive** layer over the certified Valuation Engine.
No calculation, publication, versioning, staleness, sharing, audit, or business
scoping logic was modified.

---

## 1. Governance Architecture

### Entities (additive, RLS-protected)

- **ValuationFieldGovernance** — per-field ownership metadata: owner, lock
  state, last modified, source of truth, confidence, change reason, AI
  recommendation status.
- **ValuationChangeRequest** — change requests from read-only users (business
  owners, viewers) reviewed by authorized advisors.

### Backend Function

`fieldGovernanceService` (base44/functions/fieldGovernanceService/entry.ts) is
the **sole enforcement point**. All entity CRUD uses `base44.asServiceRole`
(bypasses entity RLS); the function enforces permissions via the shared
`valuationAuth` module.

Actions:
- `getFieldGovernance` — list governance records (view)
- `upsertFieldGovernance` — create/update field ownership (edit)
- `lockField` / `unlockField` — toggle field lock (edit)
- `requestChange` — create a change request (view)
- `getChangeRequests` — list change requests (view)
- `reviewChangeRequest` — approve/reject a change request (edit)

### Frontend Service

`src/lib/fieldGovernanceService.js` — thin pass-through wrapper. The backend
function enforces all permissions; the wrapper is advisory only.

### Hook

`src/hooks/useFieldGovernance.js` — loads governance records and change
requests for a valuation, provides advisory helpers (`getField`, `isLocked`,
`canEditField`, `pendingRequestsForField`), and action handlers (`lockField`,
`unlockField`, `requestChange`, `reload`).

---

## 2. Assignment Rules

| Role | View | Edit | Review | Publish | Manage Assignments |
|---|---|---|---|---|---|
| Super Admin | ✅ All | ✅ All mutable | ✅ | ✅ | ✅ |
| Lead Advisor | ✅ Assigned | ✅ Assigned | ✅ | ✅ | ✅ (lead scope) |
| Assigned Advisor (can_edit) | ✅ Assigned | ✅ Assigned | per perms | per perms | ❌ |
| Assigned Advisor (can_view) | ✅ Assigned | ❌ | ❌ | ❌ | ❌ |
| Unassigned Advisor | ❌ / read-only per assignment | ❌ | ❌ | ❌ | ❌ |
| Business Owner | ✅ Own business | ❌ | ❌ | ❌ | ❌ |
| Client Team Member | ✅ Assigned requests only | ❌ | ❌ | ❌ | ❌ |

### Enforcement

- **Backend** (`requireEdit`): rejects if valuation is archived, if no
  assignment exists, or if `can_edit` is false. Super admins bypass.
- **Backend** (`requireView`): rejects if no assignment with `can_view`. Super
  admins and business owners bypass (owners get read-only access).
- **Frontend**: `canEdit` flag is advisory only — used to show/hide UI controls.
  The backend is authoritative; the frontend never trusts its own state for
  authorization.

---

## 3. Field Ownership

Each governed field has:
- `current_owner_id` / `current_owner_name` — the advisor who owns this field
- `is_locked` — true if locked; only owner/lead/super_admin may unlock
- `locked_by_id` / `locked_at` — who locked and when
- `last_modified_by_id` / `last_modified_at` — audit trail
- `change_reason` — reason for the last change
- `source_of_truth` — document, assessment, advisor_judgment, ai_extraction,
  client_confirmation, or benchmark
- `confidence_score` — 0-100 confidence in the current value
- `ai_recommendation_status` — pending, approved, rejected, modified

---

## 4. Central Metric-to-Evidence Map

`src/lib/valuation/metricEvidenceRegistry.js` provides a single source of truth
for important valuation metrics. Each entry maps a canonical `field_key` to:

- `display_name`, `category`, `source_type`
- `destination` — workspace route for source-edit routing
- `editable` — can an assigned advisor edit this directly?
- `governance_required` — should a FieldLockBadge appear?
- `evidence_types` — what evidence supports this value
- `calculation_type` — direct, derived, or approved (for source-edit routing)
- `explainability_node` — links to ExplainabilityPanel where available
- `default_owner_role` — who typically owns this field
- `change_request_allowed` — can read-only users request changes?

### Coverage

- **Business Identity**: legal_name, dba, entity_type, industry, naics,
  years_in_business, ownership
- **Financial**: revenue, gross_profit, gross_margin, net_income, reported_ebitda,
  normalized_ebitda, reported_sde, normalized_sde, owner_compensation, cash,
  debt, working_capital, capex
- **Commercial**: recurring_revenue, customer_concentration, retention, churn,
  backlog, pricing_power
- **Operational**: headcount, owner_dependency, management_depth, sop_coverage,
  kpi_maturity, forecast_reliability
- **Valuation**: maintainable_earnings, selected_multiple, enterprise_value,
  defensible_value, potential_value, equity_value, confidence,
  overall_confidence, method_weights, advisor_conclusion
- **Build Value Dimensions**: financial_quality, growth_quality,
  commercial_quality, operational_quality, leadership_transferability,
  risk_governance

---

## 5. Evidence Coverage (Workspaces Wired)

### Discover (IntelligenceWorkspace → BusinessSnapshot)
- Business Snapshot field values are clickable to open the EvidenceDrawer
- Each click passes `field_key`, `display_name`, `category`, `formatted_value`
- Hover affordance (opacity shift) without edit icons

### Build Value (DimensionScorecard)
- Dimension scores are clickable
- Strengths and risks are clickable
- Each opens evidence for the dimension's `field_key`

### Valuation (ValuationCommandHeader)
- Enterprise Value, Equity Value, and Overall Confidence are clickable
- Wired in Phase 13.3G initial pass; preserved in this phase

### Growth Plan (InitiativeCard)
- Estimated EBITDA Impact, Multiple Impact, and Enterprise Value Impact
  are clickable
- Each opens evidence with the initiative name in the display label

### Deliverables
- Report values use the same EvidenceDrawer via the FieldEvidenceProvider
- Client-safe preview never exposes internal IDs, notes, audit records,
  override reasons, internal confidence formulas, or raw calculation lineage

---

## 6. Source-Edit Routes

Derived values (`calculation_type: 'derived'` or `'approved'`) show
**"Edit Source Inputs"** instead of a direct edit action. They cannot be
edited directly — the user is routed to the source workspace:

| Field | Destination |
|---|---|
| Revenue | Discover (Financial period or approved source record) |
| Normalized EBITDA | Valuation (Earnings normalization and adjustments) |
| Debt | Valuation (Equity bridge or verified debt source) |
| Customer concentration | Validate (Commercial evidence or conflict) |
| Selected multiple | Valuation (Multiple Analysis) |
| Method weights | Valuation (Reconciliation) |
| Confidence | Valuation (Confidence scoring) |
| Advisor conclusion | Valuation (Conclusion editor) |
| Enterprise Value | Valuation (Reconciliation — derived, read-only) |
| Equity Value | Valuation (Equity bridge — derived, read-only) |

---

## 7. Change Request Workflow

For users without edit permission, **Edit** is replaced with **Request Change**.

The request captures:
- Field, current value, requested value, reason, supporting explanation
- Requested by, assigned advisor, status, created date
- Resolution, resolved by, resolution date

Statuses: `pending` → `approved` / `rejected`

When approved:
- Authorized advisor applies or confirms the change at the source
- Existing staleness rules run
- Audit event is written
- Change history is preserved
- Published versions remain unchanged (approval never mutates a published version)

---

## 8. AI Recommendation Governance

AI-generated field suggestions are **proposals only**. They are stored as
governance records with `ai_recommendation_status = 'pending'`.

For every AI suggestion, the EvidenceDrawer shows:
- Current value, suggested value, confidence, evidence, reporting period
- Conflict status, expected downstream impact
- Approve / Modify / Reject actions

Only an authorized assigned advisor, lead advisor, or super admin may accept
or modify the suggestion. AI must never:
- approve an adjustment
- change methodology
- change a multiple
- approve confidence
- approve the conclusion
- publish
- share
- overwrite a locked value

---

## 9. Published and Archived Behavior

### Published Versions
- Read-only forever — lock/unlock controls hidden
- Evidence drawer available
- Change history available
- "Request Change" may create a request for the working valuation
- No direct editing, no unlocking
- Banner: "This value belongs to an immutable published version."

### Archived Valuations
- Read-only — lock/unlock controls hidden
- Evidence available, history available
- Restore action is permission-aware
- No editing until restored
- Banner: "This valuation is archived."

### Implementation
`ValuationExperienceShell` computes `isImmutable` from `summary.valuation.status`
and passes it to `FieldEvidenceProvider`. The `EvidenceDrawer` uses this to:
- Show a published/archived banner at the top
- Hide lock/unlock controls
- Show "Published — Read Only" or "Archived — Read Only" instead of edit actions

---

## 10. Field Lock Display

`FieldLockBadge` displays beside governed editable fields. States:
- Unlocked / Locked
- Advisor Owned / Lead Advisor Owned
- AI Pending (Sparkles icon)

Lock badges appear only where `governance_required` is true in the metric
registry — not on every metric. The interface is not covered in lock badges.

---

## 11. Governance Empty States

The EvidenceDrawer and AssignmentConsole handle:
- **No assigned advisor**: "Assign an advisor before editing valuation assumptions."
- **Field has no owner**: "No governance record yet. This field is not individually tracked."
- **Published field**: "This value belongs to an immutable published version."
- **Archived valuation**: "This valuation is archived."
- **Business owner (no edit)**: "You can request a correction, but only the assigned valuation team may change the valuation record."
- **No history**: "No change history for this field."
- **No AI extraction**: "No AI extraction history for this field."

---

## 12. UI Discipline

- No edit icon beside every metric
- Metric hover reveals clickability (opacity shift, cursor pointer)
- Drawer contains all allowed actions
- Lock badge appears only when relevant (`governance_required`)
- Request Change appears only for unauthorized users
- Edit appears only for authorized mutable fields
- The dashboard remains primarily for reading and understanding
- Editing happens at the source

---

## 13. Performance

- Governance summary (ownership, lock state, request count) loaded once per
  valuation via `useFieldGovernance`
- EvidenceDrawer content (audit log, AI history, conflicts) lazy-loaded on
  drawer open — not on page render
- No all-evidence-histories-for-every-metric loading pattern

---

## 14. Permission Enforcement Summary

The frontend `canEdit` flag is **advisory only**. The backend
`fieldGovernanceService` is authoritative:

- `requireEdit` checks: super_admin OR (assignment exists AND can_edit AND
  valuation not archived)
- `requireView` checks: super_admin OR business_owner OR (assignment exists
  AND can_view)
- No actor spoofing: actor IDs derived server-side from auth context
- No business spoofing: valuation context loaded and business_id verified
  server-side
- No cross-business editing: assignment must match the valuation's business

---

## 15. Hook Stability (Rules of Hooks)

`useFieldGovernance` is called in `ValuationExperienceShell` **before** all
early returns (loading, error). Hook order is stable across every render.
No conditional hook invocation exists. No duplicate governance hook remains.

---

## 16. Tests (Logical Validation)

### Super Admin
- ✅ Can edit mutable working data (canEdit = true, isImmutable = false)
- ✅ Can unlock and reassign (lock/unlock actions available)
- ✅ Cannot mutate published versions (isImmutable hides controls)

### Assigned Advisor
- ✅ Can edit assigned valuation (canEdit = true)
- ✅ Cannot edit unassigned business (backend rejects)
- ✅ Can approve AI suggestion where permitted (review actions available)
- ✅ Can resolve change requests (approve/reject in EvidenceDrawer)

### Lead Advisor
- ✅ Can manage ownership (canPublish = true)
- ✅ Can approve and reassign
- ✅ Can review team work

### Business Owner
- ✅ Can view approved content (requireView allows owners)
- ✅ Can request change (Request Change form available)
- ✅ Cannot edit valuation (canEdit = false)
- ✅ Cannot approve AI suggestions (review actions hidden)

### Published Version
- ✅ Read-only (isImmutable = 'published')
- ✅ Evidence available
- ✅ History available
- ✅ No direct editing

### Archived Valuation
- ✅ Read-only (isImmutable = 'archived')
- ✅ Evidence available
- ✅ No editing until restored

---

## 17. Known Limitations

- Full field-level history is not persisted for all fields; the EvidenceDrawer
  shows only verified history (from audit log) and labels unavailable history
  clearly. No history is fabricated from current records.
- The `reviewChangeRequest` backend action supports `approved` and `rejected`
  decisions. Additional statuses (`under_review`, `needs_support`, `withdrawn`,
  `closed`) are not yet implemented in the backend; the frontend treats all
  non-pending requests as resolved.
- Assignment management actions (Assign, Reassign, Remove, Change role) in
  the AssignmentConsole are display-only in this phase; full CRUD is handled
  via the existing `valuationService.assignValuationAdvisor` action.
- Source-edit routing (`destination` in the metric registry) is metadata only;
  actual workspace navigation is not yet wired (the drawer shows the
  destination label as guidance).

---

## 18. Files Created / Modified

### Created
- `src/lib/valuation/metricEvidenceRegistry.js` — central metric-to-evidence map
- `src/components/valuation/governance/EvidenceMetric.jsx` — reusable clickable
  metric wrapper

### Modified
- `src/components/valuation/experience/ValuationExperienceShell.jsx` —
  `useFieldGovernance` moved before early returns; `isImmutable` computed and
  passed to `FieldEvidenceProvider`
- `src/components/valuation/governance/FieldEvidenceContext.jsx` —
  `isImmutable` prop added and passed to EvidenceDrawer
- `src/components/valuation/governance/EvidenceDrawer.jsx` — published/archived
  banner, derived-value "Edit Source Inputs", improved empty states, metric
  registry integration
- `src/components/valuation/experience/intelligence/BusinessSnapshot.jsx` —
  field values clickable to open evidence
- `src/components/valuation/experience/buildvalue/DimensionScorecard.jsx` —
  scores, strengths, and risks clickable to open evidence
- `src/components/valuation/experience/growthplan/InitiativeCard.jsx` —
  estimated impacts clickable to open evidence

### Not Modified (Preserved)
- Certified Valuation Engine (all calculation, publication, versioning,
  staleness, sharing, audit, business scoping logic)
- `fieldGovernanceService` backend function (permissions already enforced)
- `AssignmentConsole` (already functional with governance summary)
- `FieldLockBadge` (already functional)

---

## Phase 13.3G.3 — Valuation Access Management (Additive)

### Overview

Implemented centralized valuation access management with explicit Business
Owner and Advisor assignment flows. All access state is backend-mediated;
no parallel assignment systems were created.

### Backend Actions (valuationService)

Eight new actions added to `valuationService`:

1. `getValuationAccessSummary` — consolidated access snapshot (business,
   owners, lead advisor, advisors, reviewer, publisher, client access)
2. `getBusinessOwners` — current business owners for a valuation
3. `getEligibleBusinessOwners` — linked profiles eligible for owner assignment
4. `assignBusinessOwner` — link a profile as business owner with ownership %,
   control person flag, primary owner flag
5. `updateBusinessOwner` — modify owner metadata
6. `setPrimaryBusinessOwner` — promote an owner to primary
7. `setLeadAdvisor` — assign or reassign the lead advisor
8. `getEligibleAdvisors` — advisor profiles eligible for assignment

All actions enforce:
- Server-side identity resolution (actor derived from auth, never from frontend)
- Business-scope validation (valuation.business_id must match)
- `can_manage_assignments` permission check for write operations
- Cross-business rejection (business_id mismatch returns 403)
- Audit events written to `valuation_audit_log`

### Frontend Components

- **ValuationAccessCard** (`src/components/valuation/landing/`) — compact
  landing-page card showing Business, Business Owner, Lead Advisor, Additional
  Advisors, Reviewer, Publisher, and Client Access state. Accepts preloaded
  access summary to avoid duplicate fetches.
- **ValuationAccessHeader** (`src/components/valuation/experience/`) —
  compact inline access summary for the active valuation shell header.
  Shows Owner, Lead, advisor count, Reviewer, Publisher with "Manage" button.
- **ManageAccessSheet** (`src/components/valuation/landing/`) — right-side
  sheet with Business Owners, Valuation Team, Review and Publication,
  Permissions, and Client Access sections. Reuses `AssignmentPermissionEditor`.
- **AssignmentConsole** (`src/components/valuation/governance/`) — updated
  with lifecycle permission groups: Access (View, Edit), Review (Review),
  Publication (Publish), Lifecycle (Create, Restore, Archive), Administration
  (Manage Team). Shows only granted permissions by default.

### Role Templates (verified)

| Template | View | Edit | Review | Publish | Create | Restore | Archive | Manage |
|----------|------|------|--------|---------|--------|----------|---------|-------|
| Viewer | ✓ | | | | | | | |
| Editor | ✓ | ✓ | | | | | | |
| Reviewer | ✓ | ✓ | ✓ | | | | | |
| Publisher | ✓ | ✓ | ✓ | ✓ | | | | |
| Lead Advisor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Permission flags remain authoritative; role names are never used as authority
by the backend.

### Next-Action Logic (landingPageEngine)

Priority order for the single primary action on the landing page:

1. No business owner + can manage → **Assign Business Owner**
2. No lead advisor + can manage → **Assign Advisor**
3. No active valuation + can create → **Start New Valuation**
4. Archived + can restore → **Restore Valuation**
5. Active valuation → **Continue Valuation** (stage-based)
6. Shared client result → **View Results**
7. Read-only archived → **View Historical Valuation**

### Deprecated Components (removed)

- `ValuationTeamCard.jsx` — replaced by `ValuationAccessCard`
- `ManageTeamSheet.jsx` — replaced by `ManageAccessSheet`

Confirmed no remaining imports or references before deletion.

### Build Fix

- Added missing `RotateCcw` import to `BusinessValuation.jsx` (P0 lint fix)

### Not Modified (Preserved)

- Certified Valuation Engine (all calculation, publication, versioning,
  staleness, sharing, audit, business scoping logic)
- `fieldGovernanceService` backend function
- `FieldLockBadge`, `EvidenceDrawer`, `EvidenceMetric`
- `roleTemplates.js` (already correct from Phase 13.3G.2)

### Remaining Limitations

- ValuationAccessHeader in the shell does not auto-refresh when assignments
  change via ManageAccessSheet (requires navigation to re-fetch). Minor UX
  issue; data is correct on next load.
- Database migration `business_valuation_phase13_3g2_assignment_permissions.sql`
  must be executed in the SQL Editor for lifecycle permission columns to persist.

---

## Status

**READY FOR VALUATION ACCESS REVIEW**

---

## Phase 13.3G.4 — Valuation Request Workflow (Addendum)

### Overview

Phase 13.3G.4 adds an owner-submitted valuation request workflow with admin
review, information requests, approval, and conversion into a certified
valuation. This is an **additive** layer — no existing valuation engine,
calculation, publication, versioning, or assignment logic was modified.

### New Components

- **Backend:** `valuationRequestService` (base44/functions/valuationRequestService/entry.ts) — 15 actions covering the full request lifecycle.
- **Migration:** `business_valuation_phase13_3g4_valuation_requests.sql` — creates `valuation.valuation_requests` + `valuation.valuation_request_events` tables, RLS-enabled, service-role-only grants.
- **Frontend:** `RequestValuationSheet`, `OwnerRequestCard`, `AdminRequestReviewSheet`, `CreateValuationSheet`, `AdminBusinessValuations` page.
- **Navigation:** Admin → Business Valuations route (`/admin/business-valuations`) added to App.jsx and ProfileDropdown.
- **Owner CTA:** BusinessValuation.jsx shows "Request a Valuation" for owners with no active valuation/request; duplicate prevention via `hasOwnerRequest` and active valuation checks.

### Notification Types Added

8 new notification types added to the Notification entity enum:
`valuation_request_received`, `valuation_request_update`, `valuation_information_requested`,
`valuation_owner_responded`, `valuation_request_approved`, `valuation_request_declined`,
`valuation_created`, `valuation_assigned`.

### Bugs Fixed During Live Validation

1. **getRequest null destructuring** — `const { data: admin } = null` crashed when no admin/lead assigned. Fixed with optional chaining.
2. **Audit action constraint violation** — `created_from_request` not in the `valuation_audit_log` CHECK constraint. Changed to `created` (provenance preserved in `action_details.source`).
3. **Assignment role constraint violation** — `publisher` not in the `valuation_assignments.assignment_role` CHECK constraint. Changed to `contributor` (publisher authority conveyed via `can_publish` flag).
4. **Duplicate prevention gap** — `createRequest` returned `has_active_valuation: true` but still created the request. Fixed: now returns 409 `ACTIVE_VALUATION_EXISTS` when an active valuation exists for `new_valuation` type.

### Live Validation Result

**VALUATION REQUEST FLOW LIVE AND VERIFIED** — All 20 validation points passed.