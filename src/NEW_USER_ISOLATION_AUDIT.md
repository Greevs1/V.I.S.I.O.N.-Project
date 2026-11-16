# New User Isolation Audit — 2026-06-14

## Summary
All backend data queries are correctly scoped by `profile.id` / `primary_business_id`.
The isolation failures were entirely in **frontend localStorage** — not in Supabase.

---

## Issues Found & Fixed

### 🔴 CRITICAL — Fixed

#### 1. `lib/AssessmentContext.jsx` — Unnamespaced localStorage Key
- **Problem**: `cii_assessment_state_v2` is a global key. Any user on the same browser
  inherits the previous user's entire assessment state (revenue, margins, scores, etc.).
- **Fix**: Key is now `cii_assessment_state_v2_{userId}`. On mount, resolves the user ID
  from `base44.auth.me()` (cached in `sessionStorage`). On userId change, reloads from the
  correct namespaced key or resets to `INITIAL_STATE` if no data exists.

#### 2. `lib/anonymousSession.js` — Unnamespaced Anonymous Keys
- **Problem**: `ciq_anonymous_assessments`, `ciq_anonymous_documents`, `ciq_anonymous_profile`
  are global. A new anonymous user sees previous visitor's assessment data.
- **Fix**: All keys are now namespaced by the session ID: `ciq_anon_assessments_{sessionId}`.
  Added `clearAnonymousSession()` which wipes all namespaced keys AND rotates the session ID
  so the next visitor gets a clean slate.

#### 3. `lib/AuthContext.jsx` — Logout Does Not Clear localStorage
- **Problem**: `logout()` did not clear the cached user ID or rotate the anonymous session.
  The next user loading the app on the same browser would pick up stale assessment state.
- **Fix**: `logout()` now calls `sessionStorage.removeItem('cii_current_user_id')` and
  `clearAnonymousSession()` before redirecting.

### 🟡 HIGH — Fixed

#### 4. `pages/assessments/StrategicRoadmap` — Static Demo Data Shown to New Users
- **Problem**: When no `value_creation_events` exist (every new user), the roadmap shows
  hardcoded demo items: "Set up HSA contributions", "Document top 5 SOPs", etc.
  These are generic and misleading — they look like real personalized recommendations.
- **Fix**: Replaced static fallback with an empty-state card pointing users to start
  their first assessment. The `roadmapPhases` constant was removed entirely.

---

## Backend Data Isolation — Verified Clean ✅

All backend functions scope queries correctly:

| Table | Scoping | Status |
|---|---|---|
| `profiles` | `email = user.email` | ✅ |
| `businesses` / `business_entities` | `profile_id = profile.id` | ✅ |
| `business_assessments` | `profile_id = profile.id` | ✅ |
| `dashboard_metrics` | `profile_id = profile.id` | ✅ |
| `business_metric_snapshots` | `profile_id = profile.id` | ✅ |
| `documents` | `profile_id = profile.id` | ✅ |
| `document_analysis` | `profile_id / business_id` | ✅ |
| `extracted_fields` | `profile_id / business_id` | ✅ |
| `business_opportunities` | `business_id = primary_business_id` | ✅ |
| `next_best_actions` | `business_id = primary_business_id` | ✅ |
| `roadmap_items` | `profile_id = profile.id` | ✅ |
| `value_creation_events` | `business_id = primary_business_id` | ✅ |
| `advisor_notes` | `profile_id = profile.id` | ✅ |
| `gap_analyses` | `profile_id = profile.id` | ✅ |

---

## Galileo Conversations
- `GalileoPanel.jsx`: messages are component state only (no persistence) — resets on mount ✅
- `GalileoConversation` Base44 entity: scoped by `created_by_id` (Base44 user) ✅
- `buildGalileoContext` / `askGalileo` backend: uses authenticated user's profile ✅

---

## localStorage Namespacing Status

| Key Pattern | Before | After |
|---|---|---|
| `cii_assessment_state_v2` | Global (shared) | `cii_assessment_state_v2_{userId}` |
| `ciq_anonymous_assessments` | Global (shared) | `ciq_anon_assessments_{sessionId}` |
| `ciq_anonymous_documents` | Global (shared) | `ciq_anon_documents_{sessionId}` |
| `ciq_anonymous_profile` | Global (shared) | `ciq_anon_profile_{sessionId}` |
| `ciq_session_id` | Persisted forever | Cleared on logout / after migration |

---

## RLS / Security Notes
- All data access goes through backend functions using the service role key — no frontend
  direct Supabase queries bypass backend role checks.
- Owner users can only reach their own `primary_business_id` data.
- Advisor users are scoped to `advisor_assignments`.
- Admin users have full access (by design).

---

## Remaining Considerations
- **Legacy localStorage keys**: Existing users may have data under the old global key
  `cii_assessment_state_v2`. On first login after this deploy, their state will load from
  the new namespaced key (empty). Their data is not deleted — it stays under the old key
  but is simply no longer read. This is the correct behavior for isolation.
- **Supabase RLS**: Row Level Security policies in Supabase are an additional layer beyond
  the backend function scoping. RLS status should be verified directly in the Supabase
  dashboard for the listed tables.
- **Profile auto-creation**: The comment in `AuthContext.jsx` states "Supabase trigger
  automatically created the profile + business on first signup" — this trigger should be
  audited to confirm it does NOT copy any default/demo data into new rows.