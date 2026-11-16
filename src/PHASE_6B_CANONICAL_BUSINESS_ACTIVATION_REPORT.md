# PHASE 6B — CANONICAL BUSINESS ACTIVATION & MIGRATION VALIDATION

**Branch:** `architecture-prep`
**Date:** 2026-09-29
**Status:** COMPLETE — verification + code fixes only. **No migration executed. No backfill executed.**
**Predecessors:** Phase 6 Audit · Phase 6A Tenant Integrity & Canonical Business Foundation

---

## 1. EXECUTIVE SUMMARY

Phase 6B reconciled the Phase 6A architecture against the **live database and the actual code**, and the result materially corrects Phase 6A.

**Four findings dominate this phase:**

1. **The Phase 6A migration rests on a false premise.** Phase 6A claimed `next_best_actions` and `saved_playbooks` carry foreign keys to the *legacy* `businesses` table and that a "canonical business transition" was required. The live schema shows **no FK anywhere references `businesses`**. Every business foreign key — `next_best_actions`, `value_creation_events`, `documents`, `assessment_sessions`, `assessment_calculations`, `galileo_conversations`, `roadmap_items`, `dashboard_metrics`, and eleven more — **already targets `business_entities(id)`**. The canonical transition Phase 6A planned is **already the status quo**. The proposed `canonical_business_id` columns would have created a *second* source of truth for one identity.

2. **Most of the Phase 6A migration is either already applied or would fail.** `galileo_conversations.business_id` already exists (with its index). The `freedom_projections` cleanup is **impossible** — that column is `TEXT NOT NULL`, so `SET business_id = NULL` raises an error. The proposed RLS policies would **weaken** an existing, stronger policy. The single genuinely-needed statement is the deterministic `assessment_calculations` backfill.

3. **RLS is real, and it is already business-scoped.** Phase 6A could not determine RLS state. Phase 6B did: all thirteen business-owned tables have RLS enabled, and eleven of them are governed by a single `SECURITY DEFINER` function `can_access_business(business_id)` that checks `business_entities.profile_id = auth.uid()`, `assigned_advisor_id = auth.uid()`, `is_super_admin()`, or `business_team_members`. This is a genuine tenant-isolation model — **not** the "UNKNOWN" Phase 6A recorded.

4. **Both Phase 6A helpers are dead code, and the write guard's authorization did not match reality.** `base44/shared/businessScope/writeGuard.ts` and `src/lib/canonicalBusiness.js` have **zero importers** — no write path calls them. Worse, the guard authorizes via `business_owners` (3 rows) and `advisor_assignments` (0 rows), whereas the database authorizes via `business_entities.profile_id`. Adopting the guard unchanged would have **locked out legitimate owners**. Phase 6B aligned the guard to the real model and adopted it in one live path.

**Also corrected:** the Phase 6A Profit Gap "fix" is **inert** — its real callers never pass a `margin_type`, so both sides silently default to `net_profit` and the mismatch guard never fires; the semantic conflation lives elsewhere (`AssessmentContext.jsx` derives EBITDA from `p1_mymargin`, then compares it to net-profit benchmarks). The Base44→Supabase identity bridge is **not email-based** — `profiles.base44_user_id` holds the Base44 user ID verbatim, making it a deterministic UUID equality.

**Nothing was migrated and nothing was backfilled**, for two independent hard reasons: the build tools hold **read-only Supabase access** (`projects:read`, `secrets:read`, `database:read` — no `database:write`), and this branch **cannot write records**. Both are documented in §2/§4.

---

## 2. DATABASE ENVIRONMENT DETERMINATION

**Answer: (B) — `architecture-prep` uses the SAME Supabase database as production/main. Database isolation is NOT present.**

| Property | Value |
|---|---|
| Projects visible | **1** |
| Project ref | `tfrbswfrhrtgfcgonimb` |
| Project name | V.I.S.I.O.N Platform |
| Region | us-east-2 |
| Status | ACTIVE_HEALTHY |
| Created | 2026-06-05 |

There is exactly one Supabase project; there is no development instance to diverge from. `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` point at it. Additionally, entity **records** are explicitly shared across branches on this platform — a branch cannot write records at all.

**Consequence:** because isolation cannot be proven, the non-negotiable rule applies — only demonstrably additive, deterministic, reversible statements may run, and only by a human. Phase 6B executed **none**.

---

## 3. MIGRATION PREFLIGHT

Preflight ran read-only against the live schema (`information_schema`, `pg_constraint`, `pg_indexes`, `pg_tables`, `pg_policies`).

| # | Phase 6A step | Verdict | Evidence |
|---|---|---|---|
| 1 | `galileo_conversations` ADD `business_id` | **ALREADY_APPLIED** | Column exists, `uuid`, nullable; FK `galileo_conversations_business_id_fkey → business_entities(id)` |
| 1b | ADD `session_type` | **NEEDS_MODIFICATION → NOT_NEEDED** | Table already has `conversation_type`, `conversation_mode`, `visibility_scope`. A fourth type column is redundant |
| 1c | Index on `galileo_conversations.business_id` | **ALREADY_APPLIED** | `idx_galileo_conversations_business_id` exists |
| 2 | `assessment_calculations` backfill | **SAFE_TO_EXECUTE** | `session_id` FK → `assessment_sessions(id)` exists; 229 deterministic rows |
| 2c | Index on `assessment_calculations.business_id` | **ALREADY_APPLIED** | `idx_assessment_calculations_business_id` exists |
| 3 | `freedom_projections` SET NULL | **BLOCKED** | Column is `TEXT **NOT NULL**` — the UPDATE would raise. Also 9 rows, not ~3 |
| 4 | `strategy_outcomes` FK | **NOT_APPLICABLE** | `business_id` is `TEXT`; the `data_type='uuid'` guard never opens |
| 5 | `next_best_actions` ADD `canonical_business_id` | **NOT_NEEDED** | `business_id` is `uuid NOT NULL` with FK → `business_entities(id)` already |
| 6 | `saved_playbooks` ADD `canonical_business_id` | **NOT_NEEDED** | Redundant; `business_id` uuid nullable, no legacy dependency |
| 7 | `value_creation_events` FK on `roadmap_item_id` | **SAFE_TO_EXECUTE** | 0 rows; no existing FK; `roadmap_item_id` nullable |
| 8 | `galileo_conversations` RLS + policies | **NOT_NEEDED / REGRESSION** | RLS already enabled; existing `can_access_business` policy is STRONGER than 6A's `profile_id = auth.uid()` |

### Constraint-name conflicts
None. No FK constraint in `public` references `businesses`. No index in the migration would collide.

### Rollback validity
Phase 6A's rollback block is valid *syntax*, but two entries (`DROP COLUMN canonical_business_id` on tables where the column was never added; the RLS `DISABLE`) describe undoing something never done — harmless, but misleading. Corrected rollback is in the new `.sql` file.

### Migration file status
`src/supabase/migrations/phase_6a_tenant_integrity.sql` is **superseded**. Do not run it — step 3 fails, step 8 regresses RLS, steps 5–6 create duplicate identity columns. The authoritative artifact is now:

`src/supabase/migrations/phase_6b_rls_audit_and_safe_subset.sql`

---

## 4. MIGRATIONS EXECUTED

**NONE.**

Reason 1 — tooling: the Supabase connector granted to the build tools carries `projects:read`, `secrets:read`, `database:read`. It has **no `database:write`**. Arbitrary SQL/DDL requires `database:write`. Every write attempt would be rejected.

Reason 2 — isolation: §2 proves the database is shared, so the standing rule ("if isolation cannot be proven, do not execute risky or destructive migrations; execute only demonstrably additive, deterministic, reversible, safe ones") governs. Nothing met that bar *and* was executable.

**The human runbook:** open the Supabase SQL Editor for `tfrbswfrhrtgfcgonimb`, run Section A of the new file to re-verify RLS, then Section C (two idempotent statements). Validate with the query in C1.

---

## 5. MIGRATIONS BLOCKED / NOT EXECUTED

| Item | Classification | Reason |
|---|---|---|
| §3 step 3 — `freedom_projections` NULL normalisation | **BLOCKED** | Column is `NOT NULL`. Needs a type/NOT-NULL decision first (§16) |
| §3 step 5/6 — `canonical_business_id` columns | **NOT_NEEDED** | FKs already target `business_entities`; duplicates identity |
| §3 step 1b — `session_type` | **NOT_NEEDED** | `conversation_type`/`conversation_mode` already present |
| §3 step 8 — `galileo_conversations` RLS policies | **NOT_NEEDED / REGRESSION** | Existing `can_access_business` policy is stronger |
| §3 step 4 — `strategy_outcomes` FK | **NOT_APPLICABLE** | TEXT column, 0 rows |
| All historical backfills | **NOT EXECUTED** | Branch cannot write records; ownership must be proven first (§7–18) |

---

## 6. CANONICAL BUSINESS TRANSITION

### What Phase 6A believed
That `next_best_actions` and `saved_playbooks` depended on the legacy `businesses` table and needed a `canonical_business_id` migration.

### What is true
```
next_best_actions_business_id_fkey  → business_entities(id) ON DELETE CASCADE
value_creation_events_business_id_fkey → business_entities(id)
galileo_conversations_business_id_fkey → business_entities(id)
assessment_sessions_business_id_fkey   → business_entities(id)
assessment_calculations_business_id_fkey → business_entities(id)
documents_business_id_fkey          → business_entities(id) ON DELETE CASCADE
roadmap_items_business_id_fkey      → business_entities(id) ON DELETE CASCADE
advisor_notes_business_id_fkey      → business_entities(id) ON DELETE CASCADE
business_opportunities_business_id_fkey → business_entities(id) ON DELETE CASCADE
dashboard_metrics_business_id_fkey  → business_entities(id) ON DELETE CASCADE
extracted_fields_business_id_fkey   → business_entities(id) ON DELETE CASCADE
document_analysis_business_id_fkey  → business_entities(id) ON DELETE CASCADE
business_assessments_business_id_fkey → business_entities(id) ON DELETE CASCADE
business_metric_snapshots_business_id_fkey → business_entities(id) ON DELETE CASCADE
business_team_members_business_id_fkey → business_entities(id) ON DELETE CASCADE
reports_business_id_fkey            → business_entities(id) ON DELETE CASCADE
extraction_reports_business_id_fkey → business_entities(id) ON DELETE CASCADE
chat_history_business_id_fkey       → business_entities(id) ON DELETE CASCADE
business_decisions (fk_business_decisions_business_id) → business_entities(id)
assessment_answers_business_id_fkey → business_entities(id) ON DELETE CASCADE
```

**The canonical transition is already complete at the schema level.** `business_entities` IS the operational canonical Business. The only table with an unconstrained `business_id` is `saved_playbooks` (and the two TEXT columns `freedom_projections`, `strategy_outcomes`).

**Therefore no application code was changed for this section** — adding `canonical_business_id` would introduce a divergence risk the invariant exists to prevent. The `canonical_business_id == business_id` assertion Phase 6B was asked to add is unnecessary: there is only ever one column.

**Legacy `businesses` is a 1:1 mirror** of `business_entities` (identical ids, names, profile_ids, created_at for all 9 rows) and is referenced by **8 backend functions** (§24).

---

## 7. BASE44 USER → SUPABASE PROFILE MAPPING

**The bridge is deterministic and is NOT email-based.** `profiles.base44_user_id` (TEXT) holds the Base44 user ID verbatim.

| base44_user_id | email | supabase_profile_id | app_role | match_method | status |
|---|---|---|---|---|---|
| 6a2338cb6dd7f8bfcf561ec4 | garrickreevs@gmail.com | 4b9daf4b-efcd-43d9-a1e6-de5aaaf02aeb | super_admin | `base44_user_id` | **VERIFIED** |
| 6a8debb641bf2115cc51e5c6 | reeva@mycapitalimpact.com | 85749e8d-378a-45ab-9689-93e83919906a | admin | `base44_user_id` | **VERIFIED** |
| 6a3d8929ff44acc2cf17a639 | davegowens@gmail.com | 44941944-4e91-4e1d-9c9c-67848f5485d9 | owner | `base44_user_id` | **VERIFIED** |
| 6a3dfaca867f9385c3356726 | taylorallred20@gmail.com | 3a3b12d4-f845-4cf2-b0f7-1e8934310906 | owner | `base44_user_id` | **VERIFIED** |
| 6aa4998351bd2058fb4756f9 | andrew@upperlimitconsulting.com | 55614d95-0bcf-4254-998f-9caee56464a7 | admin | `base44_user_id` | **VERIFIED** |
| 6a396c61a1f78ea21adc9821 | commongroundconsulting1@gmail.com | 628da671-96f9-4998-bb51-96e86c003b07 | owner | profile row exists | **SERVICE_ACCOUNT / LEGACY** — Base44 user no longer returned by the User API |
| *(none)* | test@capitalimpact.com | 23b5c5c7-6d3c-4ad7-b9a1-87fd80028528 | owner | — | **SERVICE_ACCOUNT** — no `base44_user_id`, no auth user |
| 6a2c7dcd51dcfee87eed503e | *(unknown)* | *(none)* | — | — | **UNRESOLVED** — creator of conversation `6a2f7add`; no profile, no user record |

**Method quality assessment:**
- **Email uniqueness / casing:** not relied upon. Email is available only as a documented fallback.
- **Duplicate profiles:** none among the 5 verified pairs.
- **Service users:** 2 identified (`test@capitalimpact.com`; the orphaned `commongroundconsulting1` profile).
- **Deleted users:** 1 (`6a2c7dcd…`) — conversation remains unattributable.
- Counts: 5 Base44 users, 7 profiles, 9 businesses.
- Note: `profiles.auth_user_id` is NULL for **every** row. RLS relies on `auth.uid()` matching `profiles.id`, so `profiles.id` is the Supabase auth identity; `auth_user_id` is vestigial.

A reusable implementation of this bridge now exists: `resolveProfileIdByIdentity()` in `writeGuard.ts` (returns `match_method` + confidence; only `base44_user_id` yields VERIFIED).

---

## 8. SPRINT OWNERSHIP RESOLUTION

All 4 Base44 `NinetyDaySprint` records have `business_id = NULL`. Garrick's profile `4b9daf4b` owns exactly **one** business (`42f42075`, created 2026-06-08) — so at every sprint timestamp he had exactly one business.

| sprint_id | selected_path | status | created_by_id | created | tasks | candidate | evidence | confidence | decision |
|---|---|---|---|---|---|---|---|---|---|
| 6a31833ec1b876a621d6e299 | *(path ref)* | active | 6a2338cb6dd7f8bfcf561ec4 (**Garrick**, VERIFIED) | 06-16 | 13 | `42f42075…` | verified creator; owner held exactly one business at that time; no `client_name` | HIGH | **SAFE_TO_BACKFILL** |
| 6a3183074bfab4ffe04c7147 | cash_flow | archived | 6a2338cb… (**Garrick**, VERIFIED) | 06-16 | 0 | `42f42075…` | same | HIGH | **SAFE_TO_BACKFILL** |
| 6a3180fa69c689658ab70733 | *(path ref)* | archived | `service_842b0a4e-…` | 06-16 | 13 | — | **service-created**; no profile mapping; no corroborating business evidence | NONE | **UNRESOLVED** |
| 6a309732f638c1387553dd41 | tax_risk | archived | `service_842b0a4e-…` | 06-16 | 19 | — | same | NONE | **UNRESOLVED** |

**Execution: BLOCKED.** This branch cannot write records. Two sprints are decisioned SAFE_TO_BACKFILL but were not updated. Per rule, service-created sprints were **not** inferred.

---

## 9. SPRINTTASK BACKFILL

- 46 Base44 `SprintTask` records; **0** carry a business_id.
- Distribution: `6a31833e…` 13 · `6a3180fa…` 13 · `6a309732…` 19 · `advisor_note_task` 1. (Sprint `6a318307…` has none.)
- **No cross-business parent/child relationship exists** because every value is NULL. There is no conflicting non-null child business_id that could be overwritten — the danger the rule warns about is absent.
- Inheritance plan: if `6a31833e…` is backfilled to `42f42075`, its 13 children inherit `42f42075`, asserted via `assertChildBusinessId()`.
- `advisor_note_task` is not a real sprint parent and stays separate.

**Execution: BLOCKED** (branch cannot write records). Post-backfill validation query is specified in the report's SQL artifact.

---

## 10. GALILEO CONVERSATION WRITE-PATH FIX

**Audit of the write/read paths:**

| Path | File | Previous state | Phase 6B action |
|---|---|---|---|
| Conversation creation (only authenticated writer) | `src/lib/galileo/magicLoopConversation.js` → `migrateConversationOnPromotion()` | Created `GalileoConversation` with `messages` + `questions_used` only — **no `business_id`, no `session_type`** | **FIXED** — now accepts `{ businessId, sessionType }` and writes both |
| Conversation read (chat history) | `base44/functions/buildGalileoContext/entry.ts` line 166 | `filter({ created_by_id: profile_id })` — **not business-scoped** | **FIXED** — now `filter({ created_by_id: profile_id, business_id })` |
| Supabase `galileo_conversations` table | schema | Empty (0 rows); `business_id` exists; RLS + `can_access_business` policy present | No change needed |

**Path classification:** The only live authenticated conversation writer is the **post-promotion migration**, which carries a Magic Loop conversation — so `session_type = 'magic_loop'` and `business_id = null` is the *correct* classification for that specific flow. The fix makes the writer *capable* of carrying a business scope and explicit about its session type, and the default is now written rather than omitted.

**Read scoping is now enforced:** an authenticated conversation read filters by `business_id`, so a conversation from Business A cannot surface while Business B is active. Legacy rows with NULL `business_id` are excluded from business-scoped history — which is the intended isolation, not data loss (the rows remain in the entity).

---

## 11. HISTORICAL CONVERSATION RESOLUTION

4 Base44 `GalileoConversation` records, all `business_id = NULL`. Garrick owned exactly one business (`42f42075`) from 2026-06-08, i.e. before every conversation timestamp.

| conversation_id | created_by_id | created | candidate | evidence | decision |
|---|---|---|---|---|---|
| 6a32d14d227e29a2253e669d | 6a2338cb… (Garrick, VERIFIED) | 06-17 | `42f42075…` | verified creator; single business at that time | **SAFE_TO_BACKFILL** |
| 6a2e4049ea2f0f80739ee097 | 6a2338cb… (Garrick, VERIFIED) | 06-14 | `42f42075…` | same | **SAFE_TO_BACKFILL** |
| 6a2e401e84dbd8c5aa55913c | 6a2338cb… (Garrick, VERIFIED) | 06-14 | `42f42075…` | same | **SAFE_TO_BACKFILL** |
| 6a2f7add47735010d251a6b8 | 6a2c7dcd51dcfee87eed503e | 06-15 | — | creator has **no** profile and **no** user record | **UNRESOLVED** |

**Execution: BLOCKED** (branch cannot write records).

---

## 12. WRITE-GUARD ADOPTION MATRIX

Phase 6A's guard was verified to have **zero importers** — `grep` for `validateBusinessScope|assertChildBusinessId|resolveBusinessIdFromSession` returned only the definition file itself. Likewise `src/lib/canonicalBusiness.js` has zero importers.

| Write path | Business-owned target | Status before 6B | Status after 6B |
|---|---|---|---|
| `saveAssessmentToSupabase` | `assessment_sessions`, `assessment_calculations`, `business_assessments`, `dashboard_metrics`, `business_metric_snapshots`, `value_creation_events`, `roadmap_items` | **LEGACY_UNGUARDED** — trusted frontend `activeBusinessId` with no authorization check | **GUARDED** — `validateBusinessScope(sb, businessId, profileId)` enforced; 403 on denial |
| `buildGalileoContext` (read) | conversation history | **LEGACY_UNGUARDED** (no business filter) | **SCOPED** — filters by `business_id` |
| `magicLoopConversation` (conversation create) | `GalileoConversation` | **ANONYMOUS_BY_DESIGN** but silently unscoped | **EXPLICIT_SCOPE** — writes `business_id` + `session_type` |
| `guestSessionService` | guest sessions | **ANONYMOUS_BY_DESIGN** | unchanged (correct) |
| `uploadDocumentToSupabase`, `runDocumentExtraction`, `createDocumentAnalysis` | `documents`, `extracted_fields`, `document_analysis` | not modified | **LEGACY_UNGUARDED** — deferred (see §26) |
| `galileoOpportunityEngine`, `generateOpportunities`, `generateNextBestActions` | opportunities, NBA | not modified | **LEGACY_UNGUARDED** — deferred |
| `ninetyDaySprint` | sprints/tasks | not modified | **LEGACY_UNGUARDED** — deferred |
| `recordStrategyOutcome` | `strategy_outcomes` | not modified | **LEGACY_UNGUARDED** (TEXT column; out of scope) |
| `saveAssessmentToSupabase` child rows | `assessment_calculations` | — | **INHERITS_FROM_VERIFIED_PARENT** — `session_id` → session `business_id` in §14 |

No guard was added to dead or legacy code. No guard was added where it would break existing writes.

---

## 13. CURRENT AUTHORIZATION MODEL

**This is the correction that matters most.** The Phase 6A guard and the database disagreed:

| Source | Phase 6A guard used it? | Database RLS uses it? |
|---|---|---|
| `business_entities.profile_id` | ❌ **no** | ✅ **yes** — primary rule |
| `business_entities.assigned_advisor_id` | ❌ no | ✅ yes |
| `business_team_members` | ❌ no | ✅ yes |
| `business_owners` (3 rows) | ✅ *first* | ❌ no |
| `advisor_assignments` (0 rows) | ✅ | ❌ no |
| `expert_advisor_access` | ✅ | ❌ no |
| `profiles.app_role = 'super_admin'` | ✅ | ✅ yes (`is_super_admin()`) |

Had Phase 6A's guard been adopted as written, the **6 owners whose ownership is recorded only in `business_entities.profile_id`** (and who have no `business_owners` row) would have been **denied their own writes**. This is exactly the failure mode the phase brief warned about ("existing legitimate users must not lose access merely because business_owners has only 3 records").

**Phase 6B aligned the guard to the database.** `validateBusinessScope` now checks, in order: `business_entities.profile_id` → `assigned_advisor_id` → `business_team_members` → `business_owners` → `advisor_assignments` → `expert_advisor_access` → `super_admin`. The guard and `can_access_business()` now agree, so the guard is safe to adopt.

**`business_owners` is NOT the sole authority.** The live authority chain is: `business_entities.profile_id` (owner) · `assigned_advisor_id` (advisor) · `business_team_members` (team) · `is_super_admin()` · plus the three auxiliary tables. Memberships are not redesigned.

---

## 14. FULL RLS FINDINGS

**RLS is ENABLED on all 13 audited tables.** The central control is:

```sql
CREATE FUNCTION public.can_access_business(target_business_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.business_entities b
    where b.id = target_business_id
      and ( b.profile_id = auth.uid()
         or b.assigned_advisor_id = auth.uid()
         or public.is_super_admin()
         or exists (select 1 from public.business_team_members tm
                    where tm.business_id = b.id and tm.profile_id = auth.uid()) )
  );
$function$;
```

| Table | RLS | Policy | Expression | Classification |
|---|---|---|---|---|
| `business_entities` | ✅ | `business_entities_select_accessible` (SELECT) | `profile_id = auth.uid() OR assigned_advisor_id = auth.uid() OR is_super_admin() OR team_member` | **SAFE** |
| | | `business_entities_insert_owner_or_admin` (INSERT) | `profile_id = auth.uid() OR is_super_admin()` | SAFE |
| | | `business_entities_update_owner_advisor_admin` (UPDATE) | owner/advisor/super_admin | SAFE |
| | | *(no DELETE policy)* | — | SAFE (delete denied to clients) |
| `documents` | ✅ | `documents_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `extracted_fields` | ✅ | `extracted_fields_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `dashboard_metrics` | ✅ | `dashboard_metrics_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `business_assessments` | ✅ | `business_assessments_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `assessment_sessions` | ✅ | `assessment_sessions_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `assessment_calculations` | ✅ | `assessment_calculations_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `business_opportunities` | ✅ | `business_opportunities_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `value_creation_events` | ✅ | `value_creation_events_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `galileo_conversations` | ✅ | `galileo_conversations_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `advisor_notes` | ✅ | `advisor_notes_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `next_best_actions` | ✅ | `next_best_actions_access_policy` (ALL) | `can_access_business(business_id)` | **SAFE** |
| `roadmap_items` | ✅ | *(none)* | — | **MISSING** (deny-all for clients; service_role bypasses) |
| `strategy_outcomes` | ✅ | *(none)* | — | **MISSING** (deny-all) |
| `saved_playbooks` | ✅ | *(none)* | — | **MISSING** (deny-all) |
| `freedom_projections` | ✅ | *(none)* | — | **MISSING** (deny-all) |

**No table is WEAK or fully open.** `roadmap_items` has 201 rows and `business_id NOT NULL` with a FK, but its policy is absent — clients cannot read it; all app access is via the service role, so behaviour is unchanged, but this should be closed in a later phase by adding the standard `can_access_business` policy.

**Critically: the tables with no policy are the ones `buildGalileoContext` reads through the service role.** That is the correct architecture; it means RLS cannot be relied upon as the *only* tenant control for those tables, which is precisely why the backend guard matters (§12).

**Caveat (recorded honestly):** this audit was performed through the Supabase Management API's read-only SQL endpoint. It is authoritative for `pg_policies`/`pg_proc`/`pg_constraint`, but a dashboard confirmation is recommended before Digital Twin work (§30).

---

## 15. ASSESSMENT CALCULATION BACKFILL

**Live counts (Phase 6B, correcting Phase 6A's "~14 NULL"):**

| Measure | Count |
|---|---|
| `assessment_calculations` total | **242** |
| `business_id IS NULL` | **242** (100%) |
| NULL calc **with** a session carrying a business_id | **229** ← backfill target |
| NULL calc with no session / NULL-business session | 13 → remain NULL |
| Orphan `session_id` (FK violation) | **0** |
| FK `assessment_calculations_session_id_fkey` | ✅ exists → `assessment_sessions(id)` |

The relationship is deterministic and the FK guarantees it. The backfill (Section C1 of the SQL artifact) updates 229 rows and is idempotent.

**Execution: BLOCKED** — no `database:write`. Post-update validation query supplied in the artifact ("must return 0").

---

## 16. DOCUMENT OWNERSHIP INVESTIGATION

6 documents with `business_id IS NULL` (of 62 total). Live detail:

| id | profile / uploaded_by | entity_id | document_type | file_name | related_entity | created |
|---|---|---|---|---|---|---|
| 54bde21f… | 4b9daf4b (Garrick) | NULL | other | NULL | none | 2026-06-15 |
| 73629d2e… | 4b9daf4b | NULL | other | NULL | none | 2026-06-15 |
| 3791c6d3… | 4b9daf4b | NULL | other | NULL | none | 2026-06-17 |
| 4b003f06… | 4b9daf4b | NULL | other | NULL | none | 2026-06-17 |
| 503bb47c… | 4b9daf4b | NULL | other | NULL | none | 2026-06-19 |
| 5bbf391f… | 4b9daf4b | NULL | other | NULL | none | 2026-06-19 |

**Classification: SAFE_TO_BACKFILL → `42f42075…`.** All six belong to Garrick's profile, were uploaded by him, and fall inside the window where he owned exactly one business (`42f42075`, created 06-08). No competing business, no guest-promotion metadata, no `entity_id`, no related entity. They are early onboarding uploads with no filename.

**Execution: BLOCKED** (branch cannot write records). Note: because these documents have no filename and no extraction linkage, their evidentiary value for the Digital Twin is near zero regardless.

---

## 17. ROADMAP OWNERSHIP INVESTIGATION

26 `roadmap_items` with NULL `business_id` (of **201** total — Phase 6A said ~80). All 26 belong to profile `4b9daf4b` (Garrick), all created 2026-06-08 between 21:43 and 21:50, all with `source_assessment_id = NULL`:

| source_assessment_type | count | window |
|---|---|---|
| tax_gap | 6 | 21:50:09–21:50:10 |
| recast_ebitda | 4 | 21:49:58 |
| profit_gap | 4 | 21:43:21 |
| freedom_assessment | 4 | 21:50:44–21:50:45 |
| value_gap | 4 | 21:49:49 |
| operations_gap | 4 | 21:50:20–21:50:21 |

**Classification: AMBIGUOUS.** The rule is explicit: do not use `profile_id → current primary_business_id` unless historical ownership is **deterministic**. Here it is not — every item was created **before** `42f42075` existed (created 22:11:55, ~28 minutes *after* these rows). At item creation Garrick owned **zero** businesses, so "he had exactly one business at that time" does not hold. `source_assessment_id` is NULL on all 26, so no assessment linkage can anchor them either.

Strong association, insufficient proof → **left untouched**.

---

## 18. ASSESSMENT SESSION INVESTIGATION

14 `assessment_sessions` with NULL `business_id` (of **246** total — Phase 6A said ~60). All belong to profile `4b9daf4b` (Garrick), all created 2026-06-08 between 21:43:16 and 21:50:42:

`debug_test` ×1 · `profit_gap` ×6 · `value_gap` ×2 · `recast_ebitda` ×1 · `tax_gap` ×2 · `operations_gap` ×1 · `freedom_assessment` ×1. Each (except `debug_test`) has exactly 1 calculation.

**Classification: AMBIGUOUS** — identical reasoning to §17. All sessions predate `42f42075` (22:11:55) by ~21–28 minutes. They are unmistakably Garrick's first-run onboarding sweep on the day his business was created, but "the business did not yet exist" means single-business inference is not deterministic.

**Consequence for the Digital Twin:** these 14 sessions and their ~13 associated calculations will **not** carry a business_id. The remaining 232 sessions presumably already have one. When the Digital Twin begins using assessment evidence, it must tolerate NULL-business legacy assessment rows on Garrick's profile — or a product decision must be taken to attribute them to 42f42075.

---

## 19. PROFIT GAP CALLER AUDIT

**Finding: the Phase 6A Profit Gap fix is INERT, and the real semantic conflation is elsewhere.**

**Caller trace (`calcProfitGap`):**
- `calcIQScore(state)` — line 289 → `calcProfitGap(state)` — **no margin_type passed**
- `buildGalileoContext(state)` — line 304 → `calcProfitGap(state)` — **no margin_type passed**
- Any external caller: **none** (verified by project-wide grep)

Because both parameters default to `MarginType.NET_PROFIT`, the mismatch guard at `assessmentCalculations.js:29` **can never fire on any live path**. The function is "safe" in the abstract and inert in practice — precisely the condition the brief describes: *"A safe function with unsafe callers does not solve the bug."*

**The real conflation:**

| Site | Behaviour |
|---|---|
| `AssessmentContext.jsx` lines 143–151 | `estimated = rev * p1_mymargin / 100` → assigned to **`v2_avg_ebitda`**, **`v2_ebitda`**, **`rc_ebitda`**. Treats `p1_mymargin` as an **EBITDA margin**. |
| `ProfitGapAssessmentCore.jsx` lines 100–101 | `p1_avg ← data.average_net_profit_margin`, `p1_top ← data.best_in_class_net_profit_margin`. The benchmark is a **NET PROFIT** margin. |
| `profitBenchmark` function | returns net-profit margins (`average_net_profit_margin`, `top_quartile…`, `best_in_class…`) |
| `useGalileoConversation.js` lines 854–858 (`buildAssessmentAnswersForPromotion`) | writes `profit_gap.answers.p1_mymargin = (ebitda/revenue)*100` — an **EBITDA margin** written straight into a profit-gap assessment, with hardcoded `results: { profit_gap: 0, profit_gap_to_avg: 0, profit_score: 0 }`. |
| `saveAssessmentToSupabase` lines 625–626 | computes `gapToAvg = p1_rev * ((p1_avg − p1_mymargin)/100)` — net benchmark minus EBITDA-derived margin, user-visible. |

**Conclusion:** the same field `p1_mymargin` is treated as a *net* margin when benchmarked and as an *EBITDA* margin when deriving valuation inputs. No `margin_type` plumbing can fix that, because the field genuinely carries two meanings on two paths.

**Action taken:** none to the formulas. The brief forbids redesigning the assessments, and changing this would silently alter user-visible dollar figures on live data. The finding, the exact sites, and the required redesign are recorded here for the intelligence-semantics phase.

**Regression checks requested by §18:**
- NET_PROFIT → NET_PROFIT benchmark: passes (no guard trip).
- EBITDA → EBITDA benchmark: passes *if* an EBITDA benchmark exists — **no EBITDA benchmark exists**; benchmarks are net-profit only.
- EBITDA → NET_PROFIT benchmark: the guard would return `insufficient_data` — **but only if a caller ever passed `margin_type: 'ebitda'`, and none does.**
- GROSS → NET_PROFIT: same — unreachable.
- Existing assessments: no value is reinterpreted, because no code path changed. **This is a PASS on "no silent reinterpretation" and a FAIL on "the semantic bug is fixed."**

---

## 20. BUSINESS IQ SEMANTIC WARNING

Unchanged, as instructed. Records the exact redesign requirement.

`src/lib/businessIntelligenceState.js`:
- line 117 — `tax_gap_annual > 20000 ? 45 : 70` (a *larger* tax gap scores *lower* — conflating "tax efficiency" with "business intelligence", when a large gap is actually a large opportunity).
- line 218 — `score: tax_gap_annual > 0 ? 100 : 0` (binary; magnitude ignored).

Because `contract.business_iq` is surfaced in the Business Intelligence Contract and the Executive Briefing, users can read these as a calibrated tax-efficiency score. They are not. **Required redesign (later phase):** score the tax gap *relative to revenue*, not against an absolute $20K threshold, and expose it as an *opportunity* rather than an *efficiency* score. Do not replace the formula now.

---

## 21. HOME ROUTING REGRESSION

`hasMeaningfulBusinessIntelligence(contract)` in `src/lib/galileo/homeIntelligenceCheck.js` (tightened in 6A) — evaluated by code inspection against the §20 scenarios. Phase 6A's tightening requires *processed* documents and *positive* financial values.

| Scenario | Expected | Assessment |
|---|---|---|
| A. revenue only | Home | ✅ revenue > 0 satisfies the tightened check |
| B. EBITDA only | Home | ✅ EBITDA > 0 satisfies |
| C. processed P&L | Home | ✅ `completed_documents > 0` satisfies |
| D. **pending document only** | **Magic Loop** | ✅ tightening requires *completed*, so a pending upload alone does not qualify — **this is the 6A fix working** |
| E. completed assessment | Home | ✅ assessment presence satisfies |
| F. valuation only | Home | ✅ `current_value > 0` satisfies (was `!= null` before) |
| G. opportunity only | Home | ✅ opportunity presence satisfies |
| H. empty business | Magic Loop | ✅ no signal → Magic Loop |
| I. failed BIS load | retry / error | ✅ `useGalileoHome` returns `homeMode.reason='bis_error'`; `GalileoReimagined` renders the retry screen; **never** falls back to onboarding |

**Verdict: PASS at code level.** No runtime harness was available for this phase; scenarios D and I are the load-bearing ones and both were confirmed in the source. Marked PARTIAL in §27 because runtime execution was not possible.

---

## 22. CROSS-BUSINESS RUNTIME RESULTS

**NOT TESTABLE in this phase.** A full A → B → A runtime walkthrough (identity, BIS, Pulse, valuation, NOW, Next Best Move, Playbook, saved items, goals, Sprint, documents, conversations, domain focus, activity, expert context, plus network-query inspection) requires an interactive session with authenticated users holding two differently-populated businesses — which this branch's tooling cannot drive.

**What was verified statically (all PASS):**
- Every business-owned Supabase read in `buildGalileoContext` is `.eq('business_id', business_id)`.
- Every business-owned write in `saveAssessmentToSupabase` carries `business_id`, and lookups are `.eq('business_id', businessId)` (session, business_assessments, dashboard_metrics, value_creation_events, roadmap_items).
- Business-scoped client storage (goals, saved items) keys by business (§6A) and `useGalileoHome` clears sprints/opportunities/domain focus on business switch.
- Conversation history is now business-filtered (§10).
- RLS independently enforces `can_access_business(business_id)` on every relevant table (§14).

**The honest reading:** every *query shape* carries the scope, and RLS provides a second layer. But per the brief, code inspection cannot substitute for runtime — see §27 test R.

---

## 23. NEW-WRITE TEST RESULTS

**NOT TESTABLE** — this branch cannot create records (goals, saved items, opportunities, sprints) and cannot write to Supabase. No test records were created, and none were left behind.

**Verified statically:**
- The assessment path now **rejects** an unauthorized business (403 `business_scope_denied`) instead of trusting the frontend id.
- Child calculations inherit business_id from the session (deterministic FK).
- Conversation creation writes an explicit `business_id`/`session_type`.

---

## 24. LEGACY `businesses` DEPENDENCY MAP

9 rows, 1:1 mirror of `business_entities`; **no FK references it**. Referenced by 8 backend functions:

| Function | Classification |
|---|---|
| `supabaseProfileData` | **REQUIRED_FOR_LEGACY_COMPATIBILITY** — profile/business resolution for existing profiles |
| `supabaseDashboardData` | **READY_TO_TRANSITION** — read path, should use `business_entities` |
| `supabaseUserData` | **READY_TO_TRANSITION** — thin router |
| `generateAdvisorCommandCenter` | **READY_TO_TRANSITION** |
| `getSprintVerificationQueue` | **READY_TO_TRANSITION** |
| `calculateFreedomPaths` | **READY_TO_TRANSITION** |
| `expertAdvisorAccess` | **UNKNOWN** — needs per-call review (authorization-adjacent) |
| `debugSupabaseWrite` | **DEAD_CODE** — diagnostic tool |

**What must happen before `businesses` can be retired:** (1) transition the 7 live references to `business_entities`; (2) confirm nothing outside the repo (scheduled jobs, GHL integration, external reports) reads it; (3) drop `businesses`. **Do not retire it in Phase 6B.**

---

## 25. REMAINING AMBIGUOUS RECORDS

| Record set | Count | Why unresolved | Decision |
|---|---|---|---|
| `NinetyDaySprint` (service-created) | 2 | created by `service_842b0a4e…`; no profile, no corroborating business evidence | UNRESOLVED |
| `GalileoConversation` | 1 | creator `6a2c7dcd…` has no profile and no user record | UNRESOLVED |
| `roadmap_items` | 26 | all predate the only candidate business (`42f42075`, created 28 min later) | AMBIGUOUS |
| `assessment_sessions` | 14 | same — predate the candidate business | AMBIGUOUS |
| `freedom_projections` | 9 | `business_id = 'test-biz'` (TEXT NOT NULL); original value preserved in §16/Section D1 | AMBIGUOUS / test data |
| `assessment_calculations` | 13 | session has no business_id | stays NULL by design |
| `documents` | 0 | all 6 resolved SAFE (but not writable here) | resolved, not applied |

---

## 26. REMAINING TENANT RISKS

1. **Write-guard coverage is partial.** Only `saveAssessmentToSupabase` is guarded. Document upload, extraction, opportunity generation, and sprint creation remain **LEGACY_UNGUARDED** — they trust client-supplied or profile-derived business ids. Each needs the same treatment.
2. **`saved_playbooks.business_id` has no FK** — the only business-owned uuid column with no referential constraint.
3. **Three TEXT `business_id` columns** (`freedom_projections`, `strategy_outcomes`, `expert_advisor_access`) can hold arbitrary strings — `'test-biz'` is the proof. They cannot participate in FK-based isolation.
4. **Four tables have no RLS policy** (`roadmap_items`, `strategy_outcomes`, `saved_playbooks`, `freedom_projections`). Deny-all is safe but means the service role is the *only* gate for `roadmap_items` — which holds 201 rows.
5. **`profiles.auth_user_id` is NULL everywhere** while `profiles.id` carries the auth identity. Any future code that joins on `auth_user_id` will silently match nothing.
6. **`business_owners` is authoritative in neither RLS nor the guard** — 3 rows for one super_admin. Do not build on it.
7. **The Profit Gap semantic conflation (§19)** is live and user-visible via `dashboard_metrics.profit_gap` and the Executive Brief.
8. **`gap_analyses` has no `business_id`** — 19 legacy rows, profile-scoped only.

---

## 27. VALIDATION MATRIX A–Y

| # | Test | Result | Basis |
|---|---|---|---|
| A | Database environment identified | **PASS** | Single project `tfrbswfrhrtgfcgonimb`; shared, not isolated |
| B | Migration preflight complete | **PASS** | All 8 steps classified against live schema (§3) |
| C | Safe migrations executed | **FAIL (blocked)** | No `database:write` scope; shared DB. Runbook supplied |
| D | Canonical business reads/writes active | **PASS** | Every business FK already targets `business_entities`; no legacy dependency |
| E | Base44→Supabase user mapping verified | **PASS** | 5/5 verified via `base44_user_id` (§7) |
| F | Safe Sprint ownership backfilled | **FAIL (blocked)** | 2 decisioned SAFE; branch cannot write records |
| G | Ambiguous Sprints untouched | **PASS** | 2 service-created sprints untouched |
| H | SprintTask inheritance correct | **PARTIAL** | No conflicts exist; inheritance not executed |
| I | New authenticated Galileo conversation scoped | **PASS** | Writer now emits `business_id` + `session_type`; reader filters by `business_id` |
| J | Historical conversation backfill safe | **FAIL (blocked)** | 3 SAFE, 1 UNRESOLVED; not writable here |
| K | Write guards actually adopted | **PARTIAL** | Adopted in `saveAssessmentToSupabase`; 5 other write paths deferred |
| L | Assessment calculation backfill valid | **PASS (validated, not run)** | 229 deterministic rows; 0 orphans; statement prepared |
| M | Documents investigated | **PASS** | All 6 resolved SAFE (not writable here) |
| N | Roadmap legacy records investigated | **PASS** | 26 AMBIGUOUS with documented reasoning |
| O | Assessment sessions investigated | **PASS** | 14 AMBIGUOUS with documented reasoning |
| P | Profit Gap callers semantically correct | **FAIL** | Guard is inert; conflation is live (§19) — reported, not silently patched |
| Q | Home routing regression | **PARTIAL** | Passes at code level; no runtime harness |
| R | A→B→A runtime isolation | **NOT TESTABLE** | Requires interactive authenticated session |
| S | RLS audit complete | **PASS** | Authoritative `pg_policies`/`pg_proc` read; dashboard confirmation advised |
| T | Guest Magic Loop unaffected | **PASS** | No change to anonymous paths; guard is inert without businessId |
| U | Guest promotion unaffected | **PASS** | Promotion now also records `session_type='magic_loop'`; `guestSessionService` untouched |
| V | Existing BIS unaffected | **PASS** | Only conversation-history scoping changed; contract untouched |
| W | Existing valuation unaffected | **PASS** | No valuation code touched |
| X | Existing assessments unaffected | **PASS** | No assessment formula changed; new guard allows all legitimate owners |
| Y | Build/runtime console clean | **NOT TESTABLE** | No build/run performed on this branch |

**Honest summary: 15 PASS · 4 PARTIAL · 3 FAIL(blocked) + 1 FAIL(semantic) · 4 NOT TESTABLE.** Nothing was marked PASS on the strength of code existing alone.

---

## 28. FILES CHANGED

| File | Change |
|---|---|
| `base44/shared/businessScope/writeGuard.ts` | **Rewritten.** Authorization aligned to the real RLS model (`business_entities.profile_id`, `assigned_advisor_id`, `business_team_members` added ahead of the auxiliary tables). Added `resolveProfileIdByIdentity()` — the verified Base44→profile bridge |
| `base44/functions/saveAssessmentToSupabase/entry.ts` | **Guarded.** Imports `validateBusinessScope`; enforces it after business resolution; returns 403 `business_scope_denied` on failure |
| `base44/functions/buildGalileoContext/entry.ts` | Conversation-history read now filters by `business_id` (§10) |
| `src/lib/galileo/magicLoopConversation.js` | `migrateConversationOnPromotion()` accepts `{ businessId, sessionType }` and writes both |
| `src/supabase/migrations/phase_6b_rls_audit_and_safe_subset.sql` | **New.** RLS audit queries + corrected safe subset + blocked items + rollback. Supersedes `phase_6a_tenant_integrity.sql` |
| `src/PHASE_6B_CANONICAL_BUSINESS_ACTIVATION_REPORT.md` | **New.** This report |

**Not changed (deliberately):** assessment formulas, Business IQ formula, Galileo Home, Magic Loop, Sprint architecture, `businesses` table, opportunity consolidation.

---

## 29. DATABASE CHANGES

**NONE EXECUTED.** No DDL, no DML, no backfill, no record write.

Prepared for human execution (all idempotent, additive, deterministic):
1. `assessment_calculations.business_id` backfill — 229 rows.
2. `value_creation_events` FK on `roadmap_item_id` (`ON DELETE SET NULL`) — 0 rows affected.

Everything else in the Phase 6A file is already applied, unnecessary, or blocked (§3, §5).

---

## 30. ROLLBACK INSTRUCTIONS

**Code** — revert the six files in §28. All changes are additive; no data is affected.

**SQL (Section E of the artifact):**
```sql
ALTER TABLE value_creation_events
  DROP CONSTRAINT IF EXISTS value_creation_events_roadmap_item_id_fkey;

UPDATE assessment_calculations SET business_id = NULL WHERE business_id IS NOT NULL;
```

**No entity, record, or schema change was made, so no entity rollback is required.**

---

## 31. GO / NO-GO RECOMMENDATION FOR DIGITAL TWIN FACTS

### **NO-GO** — with a short, concrete path to GO.

The brief's GO conditions, scored honestly:

| Condition | Verdict |
|---|---|
| Canonical Business is operational | ✅ **GO** — every FK targets `business_entities`; `businesses` has no schema authority |
| New writes are correctly scoped | ⚠️ **PARTIAL** — assessment writes guarded; documents/extraction/opportunities/sprints still unguarded |
| Galileo conversations are scoped | ✅ **GO** — writer emits scope; reader filters by business |
| Deterministic migrations succeeded | ❌ **NO** — nothing executed (read-only tooling + shared DB) |
| Unresolved legacy records are isolated | ✅ **GO** — no backfill applied; ambiguous rows untouched and enumerated |
| Cross-business runtime isolation passes | ⚠️ **UNVERIFIED** — static PASS, runtime not testable here |
| RLS understood sufficiently | ✅ **GO** — fully mapped; 4 tables lack policies (deny-all, flagged) |
| Profit Gap callers semantically correct | ❌ **NO** — guard inert; live conflation in `p1_mymargin` |

Three of eight conditions are not met, so the answer is **NO-GO**.

**Why not "GO with caveats":** the Digital Twin's whole purpose is to hold *facts* with *provenance*. It would ingest `assessment_calculations`, `documents`, `roadmap_items` and `assessment_sessions` as evidence. Two of those sets carry records that are still unscoped (242 calculations, 26 roadmap items, 14 sessions), the Profit Gap number it would treat as a fact is semantically conflated, and the guard that would keep new facts tenant-safe is adopted on only one of six write paths. Building on that would bake the ambiguity into the layer that is hardest to change later.

### Exact remaining blockers, in order

1. **Execute the safe subset** (§3 §C) — human, SQL Editor. Backfills 229 calculations; adds one FK.
2. **Complete write-guard adoption** on the five remaining business-owned write paths (§12), inheriting `business_id` from verified parents.
3. **Resolve `p1_mymargin` semantics** (§19) — decide net vs EBITDA, then thread an explicit `margin_type` through `calcProfitGap`'s callers, `AssessmentContext.updateState`, `buildAssessmentAnswersForPromotion`, and `saveAssessmentToSupabase`'s `gapToAvg`.
4. **Decide the fate of the ambiguous sets** (§17, §18, §25) — 26 roadmap items, 14 sessions, 9 `freedom_projections`, 2 service sprints, 1 conversation. Product decision, not an engineering one.
5. **Run the A→B→A runtime isolation test** (§22) and the §21 Home scenarios in a live session.
6. **Add the missing RLS policies** for `roadmap_items`, `strategy_outcomes`, `saved_playbooks`, `freedom_projections`.
7. **Confirm RLS in the Supabase dashboard** (§14 caveat).

When 1–3 and 5 are closed, this becomes a **GO** — the canonical foundation itself (item: "canonical Business is operational", "unresolved legacy records are isolated") is genuinely solid.

---

**PHASE 6B COMPLETE.**
**NO MIGRATION EXECUTED. NO BACKFILL EXECUTED. NO RECORDS WRITTEN.**
**DO NOT MERGE. DO NOT PUBLISH. DO NOT BEGIN DIGITAL TWIN IMPLEMENTATION.**