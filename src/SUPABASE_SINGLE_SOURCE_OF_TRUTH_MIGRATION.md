# SUPABASE SINGLE SOURCE OF TRUTH MIGRATION

## Constitutional Amendment — Article: Supabase Authority

**Supabase is the sole authoritative persistence layer for business and platform data in V.I.S.I.O.N.**

Base44 may render, collect, cache, and temporarily hold data, but may never independently own persistent business truth.

Every persistent write must terminate in Supabase.
Every authoritative persistent read must originate from Supabase or a certified service whose source is Supabase.

No future feature may introduce a Base44 Entity as an independent system of record.

---

## Phase B — Document Authority (CERTIFIED)

**Date:** 2026-08-12
**Status:** CERTIFIED

### Phase B Changes

1. **getMetricAutoPopulate** — Added `active_business_id` parameter, scoped all Supabase queries (extracted_fields, business_assessments, dashboard_metrics) by business_id for multi-business isolation.
2. **5 frontend callers updated** — OperationsGapAssessmentCore, TaxGapAssessmentCore, ValueGapAssessmentCore, RecastEbitdaAssessmentCore, useAssessmentPrefill all pass `active_business_id` from BusinessContext.
3. **Constitution Article XV** — Document Persistence Freeze added.
4. **Base44 Document Entity Audit** — `Document` entity has ZERO usage (SAFE_TO_DEPRECATE). `DocumentClassification` is LEGACY_MIRROR (audit metadata). `DocumentFolder` is TRANSIENT_UI (custom folder definitions).

### Phase B Finding

The document architecture was already substantially Supabase-backed prior to Phase B. Upload (`uploadDocumentToSupabase`), Data Room (`getDataRoomDocuments`), extraction (`runDocumentExtraction`), and readiness (`calculateReadiness`) all read/write Supabase exclusively. The only functional gap was `getMetricAutoPopulate` lacking business_id scoping, which is now fixed.

See: `src/SUPABASE_DOCUMENT_AUTHORITY_MIGRATION.md` for the full Phase B report.

---

## Current Dual-Source Architecture (BEING MIGRATED)

Persistent business data currently exists across BOTH:
1. **Base44 Entities** — application-layer storage
2. **Supabase** — system-of-record database

Different consumers select different sources, producing:
- Stale assessments overriding current assessments
- Base44 records disagreeing with Supabase
- BIE reading different values from Dashboard
- Executive Brief treating completed assessments as missing
- Stale dashboard_metrics overriding fresh assessment values
- Incorrect Tax Gap narratives
- Incorrect Potential Value
- Missing Journey-derived Dashboard metrics

---

## Target Architecture

```
Supabase (System of Record)
    ↓
Canonical Facts / Certified Services
    ↓
BIE / BIS
    ↓
Dashboard / Executive Brief / Galileo / Valuation / Growth Plan
```

Base44 is the APPLICATION EXPERIENCE layer only:
- Current Journey step
- Open/closed UI state
- Temporary unsaved form values
- Animation state
- Current drawer/modal
- Temporary browser session state
- Development-only UI state

If information must survive refresh, survive logout/login, appear on another page,
affect a calculation, affect BIE/BIS, affect Dashboard, affect Executive Brief,
affect Galileo, affect Valuation, affect Growth Plan, affect Living Intelligence,
affect Meeting Intelligence, belong to a business, be auditable, be versioned,
or be shared with another user — IT MUST LIVE IN SUPABASE.

---

## Domain Ownership Contract

| Domain | Supabase Table(s) | Status |
|--------|-------------------|--------|
| User Profile | `profiles` | ✅ Already Supabase |
| Business | `business_entities` | ✅ Already Supabase |
| Business Ownership | `business_owners` | ✅ Already Supabase |
| Assessment Session | `assessment_sessions` | ✅ Already Supabase |
| Assessment Answers | `assessment_answers` | ✅ Already Supabase |
| Assessment Calculation Result | `assessment_calculations` | ✅ Already Supabase |
| Business Assessment Summary | `business_assessments` | ✅ Already Supabase |
| Document | `documents` | ✅ Already Supabase |
| Extracted Document Metric | `extracted_fields` | ✅ Already Supabase |
| Document Analysis | `document_analysis` | ✅ Already Supabase |
| Dashboard Snapshot | `dashboard_metrics` / `business_metric_snapshots` | ✅ Already Supabase |
| Valuation | certified Supabase valuation schema | ✅ Already Supabase |
| Galileo Conversation | `galileo_conversations` | ✅ Already Supabase |
| Business Memory | certified Supabase Business Memory persistence | ✅ Already Supabase |
| Roadmap Items | `roadmap_items` | ✅ Already Supabase |
| Value Creation Events | `value_creation_events` | ✅ Already Supabase |
| Gap Analyses | `gap_analyses` | ✅ Already Supabase |
| Profile Financials | `profile_financials` | ✅ Already Supabase |
| Advisor Notes | `advisor_notes` | ✅ Already Supabase |

---

## Migration Sequence (Controlled Strangler Migration)

```
WRITE SUPABASE
    ↓
READ SUPABASE
    ↓
SHADOW COMPARE
    ↓
CERTIFY CONSUMERS
    ↓
REMOVE BASE44 AUTHORITY
    ↓
DEPRECATE LEGACY BASE44 STORAGE
```

Never reverse this order.

### Phase Order

| Phase | Domain | Status |
|-------|--------|--------|
| **Phase A** | Assessment persistence + reads | ✅ IMPLEMENTED |
| Phase B | Document metric integration | Pending |
| Phase C | Dashboard / Executive Brief consumers | Pending |
| Phase D | Galileo / Living Intelligence | Pending |
| Phase E | Growth Plan / Roadmap / Sprint audit | Pending |
| Phase F | Remaining Base44 persistent entities | Pending |

---

## Phase A — Assessment Migration (IMPLEMENTED)

### Changes Made

#### 1. `getAssessmentSummary` — Supabase-Only Reads

**File:** `base44/functions/supabaseUserData/entry.ts`

**Before:** Read Base44 Assessment entities for computed results (`gapToBest`, `valueGap`, `t3_annual_gap`, `operations_score`, etc.), preferring Base44 over Supabase.

**After:** Reads ONLY from Supabase tables:
1. `assessment_calculations.result_json` — full computed results (via `assessment_sessions` business-scoped join) — PRIMARY
2. `dashboard_metrics` JSONB detail columns (`profit_gap_details`, `value_gap_details`, `tax_gap_details`, `operations_gap_details`, `recast_ebitda_gap_details`, `freedom_gap_details`) — SECONDARY
3. `business_assessments` columns (scores, opportunity levels, summaries) — TERTIARY

No Base44 Assessment entity reads. Summary includes `_source: 'supabase_only'` marker.

#### 2. `saveAssessmentToDB` — Supabase Authoritative

**File:** `src/lib/AssessmentContext.jsx`

**Before:** Base44 Assessment write was REQUIRED. Recalculation only fired when Base44 succeeded. Supabase was secondary.

**After:** Supabase write is AUTHORITATIVE. Recalculation fires when Supabase succeeds. Base44 write is a LEGACY MIRROR — best-effort, non-blocking, failure does not affect any consumer.

Persistence states simplified:
- `FULL_SUCCESS` — Supabase succeeded (Base44 may or may not have succeeded)
- `FAILURE` — Supabase failed (authoritative store unavailable)

No silent fallback to Base44. If Supabase fails, show controlled error state.

### Consumers Affected

All assessment consumers now read from Supabase-derived data:
- **BIE/BIS** — reads `assessmentSummary` (now Supabase-only) → builds `_raw` metrics
- **Dashboard** — reads BIS `_raw` → displays WhereYouStand, GapCards, HeroStoryCard
- **Executive Brief** — reads BIS → generates narrative via ExecutiveNarrativeEngine
- **Galileo** — reads BIS/BIE → builds context for assessment conversations
- **Journey** — `GuidedAssessmentScene.handleAssessmentComplete` calls `saveAssessmentToDB` (now Supabase-authoritative)

### Base44 Assessment Entity Classification

| Entity | Classification | Notes |
|--------|---------------|-------|
| `Assessment` | `LEGACY_MIRROR` | Write is best-effort, non-authoritative. Reads removed. Will be deprecated after certification. |

---

## Base44 Persistence Freeze Guard

**Base44 MUST NOT create a new persistent Entity for business data if an appropriate Supabase domain exists.**

Base44 MUST NOT make a Base44 Entity authoritative for:
- Business facts
- Financials
- Assessments
- Documents
- Valuation
- Recommendations
- Planning
- Business memory
- Advisor notes
- Reports
- Conversations
- Workflow state that must survive across users/sessions

Any proposal to add persistent Base44 storage must:
1. Perform Constitution Check
2. Prove no Supabase owner exists
3. Explain why Supabase cannot own it
4. Obtain explicit platform-owner approval

Without explicit approval: USE SUPABASE.

---

## No Silent Fallback to Base44

Once a domain is Supabase-certified, Base44 fallback is PROHIBITED.

If Supabase is unavailable: show controlled temporary unavailable state.
Stale data is more dangerous than explicit unavailable data.

---

## Testing — Assessment Acceptance Test

For one clean business:
1. Complete all active Journey assessments
2. Verify Supabase contains: sessions, answers, calculations, business assessments
3. Verify Dashboard correct
4. Verify Executive Brief correct
5. Verify Galileo correct
6. Disable/bypass Base44 Assessment entity access
7. Repeat — everything must still work
8. Refresh — everything persists
9. Switch businesses — isolation passes

---

## Rollback Plan

If Supabase-only assessment reads fail in production:
1. The `getAssessmentSummary` function includes `_source: 'supabase_only'` marker
2. Base44 Assessment records remain untouched (non-authoritative, not deleted)
3. Revert `supabaseUserData/entry.ts` `getAssessmentSummary` to previous version
4. Revert `AssessmentContext.jsx` `saveAssessmentToDB` to previous version
5. Base44 Assessment reads resume (legacy data still exists)

No data loss — Base44 records are preserved during migration.

---

## Deprecation Plan

### Current State (Phase A Complete)
- Base44 Assessment write: LEGACY MIRROR (best-effort, non-blocking)
- Base44 Assessment read: REMOVED (Supabase-only)
- Base44 Assessment records: PRESERVED (non-authoritative)

### Future Phases
- Phase B-F: Migrate remaining domains
- Final cleanup: Delete Base44 Assessment entity records (after all consumers certified)
- Entity deprecation: Mark Base44 Assessment entity as deprecated in schema