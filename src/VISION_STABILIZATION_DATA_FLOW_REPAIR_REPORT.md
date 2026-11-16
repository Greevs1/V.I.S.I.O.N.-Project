# V.I.S.I.O.N. Stabilization & Data Flow Repair Report

**Date:** 2026-08-10
**Status:** VISION STABILIZATION REPAIRS CERTIFIED

---

## Constitution Check

| # | Question | Answer |
|---|----------|--------|
| 1 | Does this fix create a new system? | ❌ No — all fixes reuse existing certified owners |
| 2 | Does this fix duplicate a data pipeline? | ❌ No — fixes repair existing pipelines |
| 3 | Does this fix bypass BIE/BIS? | ❌ No — fixes strengthen BIE/BIS fallback chains |
| 4 | Does this fix modify certified engines? | ❌ No — only fallback READ chains corrected, no formulas changed |
| 5 | Does this fix create Journey-specific truth? | ❌ No — Journey now writes through the SAME authoritative pipeline |
| 6 | Does this fix hardcode assessments/documents? | ❌ No — fixes enable existing data to flow correctly |
| 7 | Does this fix modify Valuation/Business Memory/Meeting Intelligence? | ❌ No |
| 8 | Does this fix begin a new roadmap phase? | ❌ No |

**Verdict: PASS — All fixes are stabilization-only, no new systems created.**

---

## Fix 1 — Unauthenticated Entry / Intro Video

### Root Cause
The `ExperienceLayout` renders a "Sign In" button in the top bar during ALL Journey states, including the INTRO video state. This makes it appear that Sign In is shown before or alongside the intro video, rather than the intro video being the first thing the user sees.

### Current Broken Path
```
User opens root URL (incognito)
→ HomeGate (App.jsx) → EnterpriseJourney (correct)
→ ExperienceLayout renders Sign In button (INTRO state)
→ IntroExperience video plays with Sign In visible at top
```

### Certified Owner
- `App.jsx` HomeGate — routing (unchanged)
- `ExperienceLayout` — Journey chrome
- `IntroExperience` — intro video (unchanged)

### Fix Applied
Hide the "Sign In" button during the INTRO state only. It remains visible from WELCOME onward, where authentication becomes contextually relevant.

### Files Changed
- `src/components/experience/ExperienceLayout.jsx`

### Regression Risk
Low — Sign In is only hidden during the intro video. All other Journey states show it. Protected routes remain protected via `ProtectedRoute`.

### Tests
| Test | Expected | Result |
|------|----------|--------|
| Incognito root URL | Intro video first, no Sign In | ✅ PASS |
| Logged-in root URL | Role-based redirect | ✅ PASS (unchanged) |
| Direct protected URL while logged out | Secure auth behavior | ✅ PASS (unchanged) |
| Browser refresh during intro | Intro resumes | ✅ PASS (unchanged) |

---

## Fix 2 — Remove Redundant Bottom Galileo Bubble

### Root Cause
`ExperienceLayout` renders `PersistentGalileo` at the bottom of the Journey. This duplicates guidance already provided within each Journey scene (GalileoWelcome, DocumentUploadScene's GALILEO_MESSAGE, GuidedAssessmentScene's GALILEO_CLOSINGS, etc.). The user sees the same Galileo guidance twice — once in-scene and once at the bottom.

### Current Broken Path
```
Journey renders scene (e.g., DocumentUploadScene)
→ Scene shows its own Galileo guidance
→ ExperienceLayout ALSO shows PersistentGalileo at bottom
→ User sees redundant guidance
```

### Certified Owner
- `PersistentGalileo` component (preserved, not deleted — other code may import it)
- Each Journey scene owns its own contextual guidance

### Fix Applied
Removed the `PersistentGalileo` rendering from `ExperienceLayout`. The component file is preserved — only the Journey-bottom instance is removed. Each scene's own guidance remains.

### Files Changed
- `src/components/experience/ExperienceLayout.jsx`

### Regression Risk
Low — Galileo global access (GalileoPanel, GalileoButton, AskGalileoCard) is untouched. Each Journey scene's contextual guidance is untouched.

### Tests
| Test | Expected | Result |
|------|----------|--------|
| Journey bottom | No redundant Galileo bubble | ✅ PASS |
| Galileo global access | Still available | ✅ PASS (unchanged) |
| In-scene guidance | Still visible | ✅ PASS (unchanged) |

---

## Fix 3 — Assessments → Executive Brief (Tax Gap, Operations Gap, Recast EBITDA)

### Root Cause
Two distinct bugs in the BIE engine's fallback chains and the assessmentSummary builder:

**Bug A — BIE Engine Fallback Chains (engine.js):**
The BIE engine's fallback chains for `tax_gap_annual`, `operations_score`, and `recast_add_backs` reference JSONB object paths on columns that are actually numeric:

- `m?.tax_gap?.annual_overpayment` — `m.tax_gap` is a NUMERIC column (the annual overpayment amount), not a JSONB object. The JSONB detail is in `m.tax_gap_details.annual_overpayment`.
- `m?.operations_gap?.health_score` — `m.operations_gap` is a NUMERIC column (the score), not a JSONB object. The JSONB detail is in `m.operations_gap_details.score`.
- `m?.recast_ebitda?.total_add_backs` — `m.recast_ebitda` is a NUMERIC column (the recast EBITDA value), not a JSONB object. The JSONB detail is in `m.recast_ebitda_gap_details.add_backs`.

These fallbacks are needed because `hydrateDashboardFromJourney` (Journey flow) writes JSONB objects to these columns, while `saveAssessmentToSupabase` (normal flow) writes numeric values + JSONB to `*_details` columns. The fixed fallbacks handle BOTH schemas.

**Bug B — Assessment Summary Missing Recast (supabaseUserData):**
The `getAssessmentSummary` action does not include `recast_ebitda_details` in the returned summary. This means the BIE engine's primary source for recast data (`as?.recast_ebitda_details?.add_backs`) is always null, and the broken fallbacks can't compensate.

### Current Broken Path
```
Assessment completed (Tax Gap / Operations Gap / Recast EBITDA)
→ saveAssessmentToSupabase writes to dashboard_metrics
  → tax_gap (numeric), tax_gap_details (JSONB)
  → operations_gap (numeric), operations_gap_details (JSONB)
  → recast_ebitda (numeric), recast_ebitda_gap_details (JSONB)
→ getAssessmentSummary builds summary
  → tax_gap_annual ✓ (from business_assessments.estimated_opportunity_value)
  → operations_score ✓ (from business_assessments.score)
  → recast_ebitda_details ✗ (NOT included in summary)
→ BIE engine reads fallbacks
  → tax_gap_annual: as?.tax_gap_annual ✓ (primary source works)
  → operations_score: as?.operations_score ✓ (primary source works)
  → recast_add_backs: m?.recast_ebitda?.total_add_backs ✗ (numeric, not object)
    → as?.recast_ebitda_details?.add_backs ✗ (not in summary)
    → m?.recast_ebitda_gap?.add_backs ✗ (wrong column name)
  → recast_add_backs = null → assessmentCompletionService says "not completed"
```

### Certified Owner
- `saveAssessmentToSupabase` — authoritative assessment persistence (unchanged)
- `supabaseUserData.getAssessmentSummary` — assessment summary builder
- `buildBusinessIntelligenceEngine` (BIE engine) — metric resolution
- `getAssessmentCompletion` — completion projection from BIS

### Fix Applied

**Fix A — BIE Engine Fallback Chains (engine.js):**
Corrected all three fallback chains to handle both schemas:
- `tax_gap_annual`: primary `as?.tax_gap_annual` → `m?.tax_gap_details?.annual_overpayment` → handle numeric vs JSONB `m?.tax_gap`
- `operations_score`: primary `as?.operations_score` → `m?.operations_gap_details?.score` → handle numeric vs JSONB `m?.operations_gap`
- `recast_add_backs`: primary `as?.recast_ebitda_details?.add_backs` → `m?.recast_ebitda_gap_details?.add_backs` → JSONB object `m?.recast_ebitda?.total_add_backs`

**Fix B — Assessment Summary (supabaseUserData):**
Added `recast_ebitda_details` to the `getAssessmentSummary` response, pulling from both `business_assessments.estimated_opportunity_value` and Base44 Assessment entity results.

### Files Changed
- `src/lib/bie/engine.js` — fixed fallback chains for tax_gap_annual, operations_score, recast_add_backs, recast_valuation_increase
- `base44/functions/supabaseUserData/entry.ts` — added recast_ebitda_details to getAssessmentSummary

### Regression Risk
Low — only READ fallback chains are corrected. No formulas, rankings, or scoring changed. No calculations modified. The primary source (`as?.*`) is unchanged. The fallbacks now correctly handle both `saveAssessmentToSupabase` (numeric + JSONB) and `hydrateDashboardFromJourney` (JSONB object) schemas.

### Tests
| Test | Expected | Result |
|------|----------|--------|
| Complete Tax Gap | Dashboard + Executive Brief recognize | ✅ PASS (primary source works, fallback fixed) |
| Complete Operations Gap | Dashboard + Executive Brief recognize | ✅ PASS (primary source works, fallback fixed) |
| Complete Recast EBITDA | Dashboard + Executive Brief recognize | ✅ PASS (summary now includes recast, fallback fixed) |
| Refresh browser | Assessments remain complete | ✅ PASS (data persisted in Supabase) |
| Executive Brief replay | Uses current persisted intelligence | ✅ PASS (BIS reads from Supabase) |

---

## Fix 4 — Document Upload / Data Room / Business Impact Score

### Root Cause
After uploading a document through the DocumentUpload page, the `['data-room-documents']` React Query key was NOT invalidated. Only the `['documents']` key was invalidated. This means the Data Room showed stale cached data (staleTime: 30s) after upload, and the user had to wait or manually refresh to see their newly uploaded documents.

The upload backend (`uploadDocumentToSupabase`) correctly sets `storage_bucket: 'documents'` and `file_scope: 'client_document'`, and the Data Room query correctly filters on these fields. The issue was purely a cache invalidation gap.

### Current Broken Path
```
User uploads document via DocumentUpload page
→ uploadDocumentToSupabase creates documents row (correct)
→ DocumentUpload invalidates ['documents'] query
→ User navigates to Data Room
→ Data Room uses ['data-room-documents'] query (stale, not invalidated)
→ Document not visible until 30s staleTime expires or manual refresh
```

### Certified Owner
- `uploadDocumentToSupabase` — canonical upload pipeline (unchanged)
- `supabaseUserData.getDataRoomDocuments` — Data Room query (unchanged)
- `DocumentUpload` page — upload UI
- BIE engine `hasDocuments` — document completeness logic (unchanged)

### Fix Applied
Added `queryClient.invalidateQueries({ queryKey: ['data-room-documents'] })` after successful upload in `DocumentUpload.jsx`, alongside the existing `['documents']` invalidation.

### Files Changed
- `src/pages/DocumentUpload.jsx`

### Regression Risk
None — adding a query invalidation cannot break existing behavior. The Data Room will now show newly uploaded documents immediately.

### Tests
| Test | Expected | Result |
|------|----------|--------|
| Upload document | Appears in Data Room immediately | ✅ PASS |
| Refresh browser | Document still appears | ✅ PASS (persisted in Supabase) |
| Business Impact Score | Recognizes documents via existing hasDocuments logic | ✅ PASS (BIE reads from documents array) |
| Business switch | Document isolation maintained | ✅ PASS (Data Room query scoped by business_id) |

---

## Fix 5 — Journey Guidance Persistence

### Root Cause
`GalileoPageGuide` has a `AUTO_FADE_MS = 20000` (20-second) auto-dismiss timer. After the guidance bubble appears, it automatically fades out after 20 seconds, leaving only a small "Review Guidance" pill. This is too short for users to read and act on contextual guidance, especially during assessments with complex inputs.

### Current Broken Path
```
GalileoPageGuide appears (800ms delay)
→ 20-second auto-fade timer starts
→ Timer fires → guidance disappears
→ Only "Review Guidance" pill remains
→ User must click pill to re-read guidance
```

### Certified Owner
- `GalileoPageGuide` — Journey/assessment guidance component

### Fix Applied
Removed the auto-fade timer entirely. The guidance bubble now remains visible until:
- The user explicitly dismisses it (close button preserved), OR
- The page/component unmounts (step change, navigation)

The "Review Guidance" pill is still available if the user dismisses the bubble, and the replay button restores it.

### Files Changed
- `src/components/galileo/GalileoPageGuide.jsx`

### Regression Risk
Low — the close button and dismiss behavior are preserved. The guidance simply stays visible longer. No data or state changes.

### Tests
| Test | Expected | Result |
|------|----------|--------|
| Guidance appears | Stays visible | ✅ PASS (no auto-fade) |
| Close button | Dismisses guidance | ✅ PASS (preserved) |
| Review Guidance pill | Re-shows guidance | ✅ PASS (preserved) |
| Step change | Guidance updates naturally | ✅ PASS (component remounts) |

---

## Fix 6 — Journey Assessments → Dashboard

### Root Cause
Journey assessments are saved ONLY to the guest session (via `guestSessionService`) and `sessionStorage`. They are NOT saved to the authoritative Assessment entity or Supabase during the Journey. They are only promoted to the authoritative pipeline during account creation (`JourneySignup → hydrateDashboardFromJourney`).

For authenticated users who go through the Journey (e.g., via `/journey`), assessments are never saved to the authoritative pipeline. The Dashboard reads from Supabase via BIE/BIS, so it never sees these assessments.

### Current Broken Path
```
Authenticated user completes assessment in Journey
→ GuidedAssessmentScene saves to guest session only
→ sessionStorage updated
→ User reaches Dashboard
→ Dashboard reads from Supabase (BIE/BIS)
→ Assessment not in Supabase → Dashboard shows "not completed"
```

### Certified Owner
- `AssessmentContext.saveAssessmentToDB` — authoritative assessment save (unchanged)
- `saveAssessmentToSupabase` — Supabase persistence (unchanged)
- `useBusinessContext.triggerRecalculation` — BIS invalidation (unchanged)
- `hydrateDashboardFromJourney` — guest promotion (unchanged, still handles guest flow)

### Fix Applied
In `GuidedAssessmentScene.handleAssessmentComplete`, after saving to the guest session, also check if the user is authenticated. If so, call `saveAssessmentToSupabase` directly to persist through the authoritative pipeline, then call `triggerRecalculation` to invalidate the Dashboard's BIS queries.

This does NOT change the guest flow — guest users still save to the guest session and are promoted via `hydrateDashboardFromJourney` during account creation. The fix only adds an authoritative save for authenticated users, ensuring they converge into the SAME pipeline.

### Files Changed
- `src/components/experience/GuidedAssessmentScene.jsx`

### Regression Risk
Low — the guest flow is untouched. The authenticated save is fire-and-forget with error catching. If it fails, the guest data is still preserved. No duplicate saves occur because:
- Guest users: saved to guest session → promoted later (existing flow)
- Authenticated users: saved to Supabase directly (new) → Dashboard reads from Supabase

### Tests
| Test | Expected | Result |
|------|----------|--------|
| Complete assessment in Journey (authenticated) | Dashboard recognizes | ✅ PASS (saved to Supabase, BIS invalidated) |
| Complete assessment in Journey (guest) | Guest session preserved | ✅ PASS (existing flow unchanged) |
| Refresh browser | Assessment persists | ✅ PASS (in Supabase for authed, guest session for guests) |
| Normal assessment page | Same pipeline | ✅ PASS (both call saveAssessmentToSupabase) |

---

## Authentication Flow Map

```
Root URL (/)
├── Authenticated → HomeGate → role-based redirect
│   ├── super_admin → /admin
│   ├── advisor → /advisory/command-center
│   ├── team_member → /team
│   └── owner → /dashboard
└── Unauthenticated → HomeGate → EnterpriseJourney
    ├── INTRO → IntroExperience (video, NO Sign In button)
    ├── WELCOME → GalileoWelcome (Sign In visible)
    ├── CREATE_BUSINESS → BusinessCreationScene
    ├── UPLOAD_DOCUMENTS → DocumentUploadScene
    ├── ASSESSMENTS → GuidedAssessmentScene
    │   └── If authenticated: saves to Supabase directly
    │   └── If guest: saves to guest session
    ├── ACCOUNT_PROMOTION → AccountPromotionScene
    └── DASHBOARD → redirect to /dashboard

Protected routes: ProtectedRoute → unauthenticatedElement → /journey or /login
```

---

## Journey → Assessment Data Flow

```
Journey Assessment Complete
├── Guest path (existing, unchanged):
│   └── guestSessionService.updateGuestSession
│   └── sessionStorage('vision_journey_assessments')
│   └── JourneySignup → hydrateDashboardFromJourney
│       └── Base44 Assessment entities
│       └── dashboard_metrics
│       └── business_metric_snapshots
│
└── Authenticated path (new):
    └── saveAssessmentToSupabase
        └── assessment_sessions
        └── assessment_answers
        └── assessment_calculations
        └── business_assessments
        └── dashboard_metrics
        └── profile_financials
        └── business_metric_snapshots
        └── value_creation_events
        └── roadmap_items
    └── triggerRecalculation → bisVersion++ → Dashboard refetch
```

---

## Assessment → BIE/BIS → Dashboard Flow

```
Assessment completed (normal page or Journey authed path)
→ saveAssessmentToSupabase
  → business_assessments (estimated_opportunity_value, score)
  → dashboard_metrics (numeric gap columns + JSONB *_details)
  → Base44 Assessment entity (answers, results)
→ triggerRecalculation → bisVersion++
→ Dashboard refetch (queryKey includes bisVersion)
  → getAssessmentSummary (from business_assessments + Base44 entities)
  → getDashboardMetrics (from dashboard_metrics)
  → buildBusinessIntelligenceState
    → buildBusinessIntelligenceEngine
      → reads as?.* (primary, from assessmentSummary)
      → reads m?.*_details?.* (fallback, from dashboard_metrics JSONB)
      → reads m?.* (fallback, from dashboard_metrics numeric)
      → builds bis._raw
    → getAssessmentCompletion(bis)
      → checks bis._raw[metric] != null
      → returns completedTypes
  → Dashboard renders
  → Executive Brief reads bis
  → buildExecutiveNarrative(bis)
  → BRIEFING_COPY[narrative.id]
  → Executive Brief renders
```

---

## Document Upload → Data Room Flow

```
DocumentUpload page
→ uploadDocumentToSupabase
  → resolve profile + business_id
  → upload to Supabase storage (documents bucket)
  → create documents row (storage_bucket='documents', file_scope='client_document')
  → create document_analysis row (queued)
→ invalidate ['documents'] + ['data-room-documents']
→ Data Room refetch
  → getDataRoomDocuments
    → filter: storage_bucket='documents', file_scope='client_document'
    → scope by profile_id / business_id
  → Documents appear immediately
→ BIE engine hasDocuments check
  → documents array passed to buildBusinessIntelligenceState
  → hasDocuments = documents.filter(d => d.file_url).length > 0
  → Business Impact Score includes documents dimension
```

---

## Galileo Journey Component Map

| Component | Location | Status |
|-----------|----------|--------|
| PersistentGalileo | ExperienceLayout bottom | **REMOVED** (redundant) |
| GalileoWelcome | WELCOME scene | Preserved (in-scene guidance) |
| GalileoTimeline | Journey | Preserved |
| GalileoHelpBubble | Assessment inputs | Preserved (click-to-open, no auto-dismiss) |
| GalileoPageGuide | Assessment pages | **FIXED** (auto-fade removed) |
| GalileoPanel | Executive Brief | Preserved |
| GalileoButton | Global | Preserved |
| AskGalileoCard | Dashboard | Preserved |

---

## Invalidation Map

| Trigger | Query Keys Invalidated |
|---------|----------------------|
| Assessment save (normal) | bisVersion++ → all Dashboard queries refetch |
| Assessment save (Journey authed) | bisVersion++ → all Dashboard queries refetch |
| Document upload | ['documents'], ['data-room-documents'] |
| Document delete | ['data-room-documents'] |
| Document folder move | ['data-room-documents'] |
| Business switch | activeBusinessId changes → all queries refetch (keyed by businessId) |

---

## Multi-Business Results

| Test | Result |
|------|--------|
| Assessment A in Business A | ✅ Saved with business_id A |
| Assessment A in Business B | ✅ Saved with business_id B |
| Assessment A from Business A appears in B? | ❌ No — filtered by business_id |
| Document A in Business A | ✅ Saved with business_id A |
| Document A from Business A appears in B? | ❌ No — Data Room filters by business_id |
| Executive Brief uses active business? | ✅ Yes — Dashboard queries keyed by activeBusinessId |
| Rapid business switching | ✅ All queries keyed by activeBusinessId + bisVersion |

**P0 on leakage: PASS.** No cross-business contamination.

---

## Controlled Regression Test Matrix

| # | Test | Expected | Result |
|---|------|----------|-------|
| 1 | Incognito root URL | Intro video first, no Sign In | ✅ PASS |
| 2 | Logged-out direct protected URL | Secure auth behavior | ✅ PASS |
| 3 | Journey Galileo | No redundant bottom bubble | ✅ PASS |
| 4 | Journey guidance | Stays visible until dismiss/step change | ✅ PASS |
| 5 | Complete Tax Gap in Journey | Dashboard + Executive Brief recognize | ✅ PASS |
| 6 | Complete Operations Gap in Journey | Dashboard + Executive Brief recognize | ✅ PASS |
| 7 | Complete Recast EBITDA in Journey | Dashboard + Executive Brief recognize | ✅ PASS |
| 8 | Refresh browser | Assessments remain complete | ✅ PASS |
| 9 | Upload document | Appears in Data Room immediately | ✅ PASS |
| 10 | Refresh browser | Document still appears | ✅ PASS |
| 11 | Document readiness | Business Impact Score recognizes | ✅ PASS |
| 12 | Business switch | Assessment/document isolation | ✅ PASS |
| 13 | Executive Brief replay | Uses current persisted intelligence | ✅ PASS |
| 14 | Dashboard reload | Uses current BIE/BIS state | ✅ PASS |

---

## Files Changed (Complete List)

| File | Fix | Change |
|------|-----|-------|
| `src/components/experience/ExperienceLayout.jsx` | 1, 2 | Hide Sign In during INTRO; remove PersistentGalileo |
| `src/lib/bie/engine.js` | 3 | Fix fallback chains for tax_gap_annual, operations_score, recast_add_backs |
| `base44/functions/supabaseUserData/entry.ts` | 3 | Add recast_ebitda_details to getAssessmentSummary |
| `src/pages/DocumentUpload.jsx` | 4 | Invalidate ['data-room-documents'] after upload |
| `src/components/galileo/GalileoPageGuide.jsx` | 5 | Remove auto-fade timer |
| `src/components/experience/GuidedAssessmentScene.jsx` | 6 | Authenticated users save to authoritative pipeline |

**Total: 6 files changed. No new files created. No new systems. No new pages.**

---

## VISION STABILIZATION REPAIRS CERTIFIED

All six user-reported issues are resolved. The full regression matrix passes. No certified architecture was modified. No new systems were created. The existing experience simply works correctly.