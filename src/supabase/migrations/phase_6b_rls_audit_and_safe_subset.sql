-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE 6B — RLS AUDIT + PREFLIGHT-CORRECTED SAFE MIGRATION SUBSET
--
-- STATUS: NOT EXECUTED.
--
-- Phase 6B ran read-only against project tfrbswfrhrtgfcgonimb and found that
-- most of the Phase 6A migration was either ALREADY APPLIED or would FAIL.
-- This file replaces src/supabase/migrations/phase_6a_tenant_integrity.sql as
-- the authoritative migration artifact.
--
-- WHY NOTHING WAS EXECUTED AUTOMATICALLY:
--   1. The build tools have READ-ONLY Supabase access (projects:read,
--      secrets:read, database:read — no database:write).
--   2. This branch (architecture-prep) cannot write records, and the Supabase
--      project is SHARED (only one project exists — no dev isolation).
--   Both conditions mean any write must be run by a human, deliberately, in the
--   Supabase SQL Editor. See §4 of the Phase 6B report.
-- ═════════════════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION A — RLS AUDIT (read-only; run this any time to re-verify)
-- ═════════════════════════════════════════════════════════════════════════════
-- Returns, per business-owned table: RLS enabled, policy name, command, roles,
-- USING expression and WITH CHECK expression. This is the authoritative answer
-- for §13 / §14 of the report.

/*

-- A1. RLS enabled per table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'business_entities','documents','extracted_fields','dashboard_metrics',
    'business_assessments','assessment_sessions','assessment_calculations',
    'business_opportunities','roadmap_items','value_creation_events',
    'strategy_outcomes','galileo_conversations','advisor_notes',
    'next_best_actions','saved_playbooks','freedom_projections','business_owners',
    'advisor_assignments','expert_advisor_access','profiles'
  )
order by tablename;

-- A2. Full policy detail
select p.tablename, p.policyname, p.cmd, p.roles::text as roles,
       coalesce(p.qual, '(none)')       as using_expr,
       coalesce(p.with_check, '(none)') as check_expr
from pg_policies p
where p.schemaname = 'public'
order by p.tablename, p.policyname;

-- A3. The authorization function every business policy depends on
select proname, pg_get_functiondef(oid) as def
from pg_proc
where proname in ('can_access_business', 'is_super_admin', 'current_app_role')
  and pronamespace = 'public'::regnamespace;

-- A4. Every FK that points at a business table (proves canonical vs legacy)
select conrelid::regclass::text as table_name, conname,
       pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f'
  and connamespace = 'public'::regnamespace
  and confrelid::regclass::text in ('businesses', 'business_entities')
order by 1;

*/


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION B — PREFLIGHT RESULT SUMMARY (what Phase 6A proposed vs reality)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 6A STEP                                          | PREFLIGHT VERDICT
-- -------------------------------------------------|---------------------------
-- 1  galileo_conversations ADD business_id          | ALREADY_APPLIED
-- 1b galileo_conversations ADD session_type         | NOT_NEEDED (redundant —
--                                                   |  conversation_type +
--                                                   |  conversation_mode exist)
-- 1c galileo_conversations index on business_id     | ALREADY_APPLIED
-- 2  assessment_calculations backfill               | SAFE_TO_EXECUTE  ← only real work
-- 2c assessment_calculations index                  | ALREADY_APPLIED
-- 3  freedom_projections SET business_id = NULL     | **BLOCKED** — column is
--                                                   |  NOT NULL; the statement
--                                                   |  would raise an error
-- 4  strategy_outcomes FK                           | NOT_APPLICABLE — business_id
--                                                   |  is TEXT, the guard never fires
-- 5  next_best_actions canonical_business_id        | NOT_NEEDED — FK ALREADY
--                                                   |  points to business_entities
-- 6  saved_playbooks canonical_business_id          | NOT_NEEDED — redundant
-- 7  value_creation_events FK on roadmap_item_id    | SAFE_TO_EXECUTE (0 rows)
-- 8  galileo_conversations RLS enable + policies    | NOT_NEEDED / REGRESSION —
--                                                   |  RLS already enabled with a
--                                                   |  correct can_access_business
--                                                   |  policy; 6A's profile_id=auth.uid()
--                                                   |  policies are WEAKER than existing
--
-- ROOT CAUSE: Phase 6A's audit was never reconciled against the live schema.
-- Its central premise — "next_best_actions and saved_playbooks have FKs to the
-- legacy `businesses` table" — is FALSE. No FK anywhere references `businesses`.
-- Every business FK already targets `business_entities`.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION C — SAFE SUBSET (run deliberately, after reviewing Section B)
-- ═════════════════════════════════════════════════════════════════════════════
-- Only statements that are additive AND deterministic against the live schema.
-- Both are idempotent.

-- ── C1. assessment_calculations.business_id deterministic backfill ───────────
-- Relationship: assessment_calculations.session_id → assessment_sessions.id
--               → assessment_sessions.business_id
-- Live counts BEFORE (verified Phase 6B):
--   total assessment_calculations ................ 242
--   business_id IS NULL .......................... 242
--   NULL calc, session HAS business_id ........... 229   ← rows this updates
--   NULL calc, session also NULL / no session .... 13    ← stay NULL by design
--   orphan session_id ............................ 0
-- Expect: 229 rows updated. Re-run is a no-op (WHERE business_id IS NULL).

UPDATE assessment_calculations ac
   SET business_id = s.business_id
  FROM assessment_sessions s
 WHERE s.id = ac.session_id
   AND ac.business_id IS NULL
   AND s.business_id IS NOT NULL;

-- Validate (must return 0):
-- select count(*) from assessment_calculations ac
--   join assessment_sessions s on s.id = ac.session_id
--  where ac.business_id is not null and ac.business_id is distinct from s.business_id;

-- ── C2. value_creation_events FK on roadmap_item_id ──────────────────────────
-- Live state: 0 rows in value_creation_events, no existing FK.
-- ON DELETE SET NULL (NOT RESTRICT/CASCADE): deleting a roadmap item must never
-- erase historical value evidence. NOTE — Phase 6A's header comment said
-- "RESTRICT" while its SQL said "SET NULL"; SET NULL is the correct one.

ALTER TABLE value_creation_events
  ADD CONSTRAINT value_creation_events_roadmap_item_id_fkey
  FOREIGN KEY (roadmap_item_id) REFERENCES roadmap_items(id) ON DELETE SET NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION D — DELIBERATELY NOT EXECUTED (documented, with reasons)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- D1. freedom_projections "test-biz" normalisation
--     BLOCKED. business_id is TEXT NOT NULL — NULL is impossible. All 9 rows are
--     Garrick's (profile 4b9daf4b) strategy-expansion test data created
--     2026-07-23, all holding the literal string 'test-biz'. Original value is
--     preserved here as the audit trail. Recommended fix (NOT run): either point
--     them at 42f42075 or delete the seeded rows — requires product approval.
--
-- D2. next_best_actions / saved_playbooks "canonical_business_id"
--     NOT_NEEDED. next_best_actions.business_id is uuid NOT NULL with
--     next_best_actions_business_id_fkey → business_entities(id). Adding a second
--     parallel column would create two sources of truth for one identity.
--
-- D3. galileo_conversations session_type
--     NOT_NEEDED. The table already carries conversation_type, conversation_mode
--     and visibility_scope.
--
-- D4. galileo_conversations RLS policies
--     NOT_NEEDED / REGRESSION. RLS is already enabled and the existing policy is
--     galileo_conversations_access_policy FOR ALL USING can_access_business(business_id)
--     — which is STRONGER than Phase 6A's proposed profile_id = auth.uid() rule.
--
-- D5. strategy_outcomes FK
--     NOT_APPLICABLE. strategy_outcomes.business_id is TEXT (0 rows). Type change
--     is out of scope for Phase 6B.
--
-- D6. Any historical backfill (Sprints, SprintTasks, conversations, documents,
--     roadmap_items, assessment_sessions)
--     NOT EXECUTED. This branch cannot write records, and no backfill is
--     permitted until ownership is proven. See §7–§18 of the Phase 6B report.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION E — ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════

-- ALTER TABLE value_creation_events
--   DROP CONSTRAINT IF EXISTS value_creation_events_roadmap_item_id_fkey;

-- assessment_calculations backfill rollback (only reverts C1's effect):
-- UPDATE assessment_calculations SET business_id = NULL WHERE business_id IS NOT NULL;