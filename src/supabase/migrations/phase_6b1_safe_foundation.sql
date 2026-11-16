-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE 6B.1 — SAFE FOUNDATION MIGRATION (CONSOLIDATED)
--
-- STATUS: NOT EXECUTED. Prepared for deliberate manual execution.
-- SUPERSEDES: src/supabase/migrations/phase_6a_tenant_integrity.sql (obsolete)
--
-- WHY THIS FILE REPLACES PHASE 6A:
--   Phase 6B proved that most of the Phase 6A migration was either ALREADY
--   APPLIED or based on a premise that is FALSE. Its central assumption — that
--   `next_best_actions` and `saved_playbooks` carry foreign keys to the legacy
--   `businesses` table — is untrue. No FK anywhere references `businesses`;
--   every business FK already targets `business_entities(id)`.
--   See Section A for the full list of removed steps.
--
-- WHY NOTHING RUNS AUTOMATICALLY:
--   1. The build tooling holds READ-ONLY Supabase access (projects:read,
--      secrets:read, database:read — no database:write).
--   2. There is only ONE Supabase project (tfrbswfrhrtgfcgonimb). There is no
--      development database, so this migration would run against production.
--   3. This branch cannot write records.
--   A human must review and run each section in the Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION A — OBSOLETE PHASE 6A STEPS: REMOVED
-- ═════════════════════════════════════════════════════════════════════════════
-- These are NOT in this file. Do not reintroduce them.
--
-- A1  galileo_conversations ADD business_id ............ ALREADY EXISTS
--     (column present, uuid, nullable, FK → business_entities, index present)
-- A2  galileo_conversations ADD session_type .......... NOT NEEDED
--     (conversation_type + conversation_mode + visibility_scope already exist)
-- A3  galileo_conversations ADD INDEX ................. ALREADY EXISTS
--     (idx_galileo_conversations_business_id)
-- A4  assessment_calculations ADD INDEX .............. ALREADY EXISTS
--     (idx_assessment_calculations_business_id)
-- A5  freedom_projections SET business_id = NULL ..... IMPOSSIBLE
--     The column is TEXT **NOT NULL**. The statement would raise an error.
--     9 rows hold the literal string 'test-biz'. Requires a product decision.
-- A6  strategy_outcomes ADD FK ....................... NOT APPLICABLE
--     business_id is TEXT (0 rows). The uuid type-guard never opens.
-- A7  next_best_actions ADD canonical_business_id .... NOT NEEDED
--     business_id is uuid NOT NULL with an FK → business_entities(id) already.
--     A second identity column would create two sources of truth.
-- A8  saved_playbooks ADD canonical_business_id ...... NOT NEEDED (redundant)
-- A9  value_creation_events ADD FK ................... RETAINED → see Section C2
-- A10 galileo_conversations RLS policies ............. WOULD REGRESS
--     RLS is already enabled and the existing policy
--     (galileo_conversations_access_policy USING can_access_business(business_id))
--     is STRONGER than Phase 6A's proposed `profile_id = auth.uid()` rule.
--
-- NET EFFECT: of 8 Phase 6A steps, 5 were already applied or unnecessary,
-- 2 were impossible/inapplicable, and exactly 1 contained real work.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION B — RLS AUDIT (read-only; re-run any time to re-verify)
-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 6B established that RLS is real, enabled on all 13 business-owned
-- tables, and governed by one shared rule:
--
--   can_access_business(target_business_id)
--     → business_entities.profile_id = auth.uid()            (owner)
--     OR business_entities.assigned_advisor_id = auth.uid()   (advisor)
--     OR is_super_admin()
--     OR business_team_members(business_id, profile_id = auth.uid())
--
-- The application write guard (base44/shared/businessScope/writeGuard.ts) MIRRORS
-- this rule. It does not replace it. Re-verify with the queries below.

/*

-- B1. RLS enabled per business-owned table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'business_entities','documents','extracted_fields','document_analysis',
    'dashboard_metrics','business_assessments','assessment_sessions',
    'assessment_calculations','business_opportunities','roadmap_items',
    'value_creation_events','strategy_outcomes','galileo_conversations',
    'advisor_notes','next_best_actions','saved_playbooks','freedom_projections',
    'business_owners','advisor_assignments','expert_advisor_access','profiles'
  )
order by tablename;

-- B2. Full policy detail
select tablename, policyname, cmd, roles::text as roles,
       coalesce(qual, '(none)')       as using_expr,
       coalesce(with_check, '(none)') as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- B3. The shared authorization function
select pg_get_functiondef(oid)
from pg_proc
where proname = 'can_access_business' and pronamespace = 'public'::regnamespace;

-- B4. Prove that no FK points at the legacy `businesses` table
select conrelid::regclass::text as table_name, conname::text,
       pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f' and connamespace = 'public'::regnamespace
  and confrelid::regclass::text in ('businesses', 'business_entities')
order by 1;

*/

-- Known gap (documented, NOT fixed here): roadmap_items, strategy_outcomes,
-- saved_playbooks and freedom_projections have RLS enabled but NO policy.
-- Deny-all is safe for clients; the service role is the only gate for
-- roadmap_items (201 rows). Adding the standard policy is a later phase.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION C — SAFE SUBSET (the ONLY statements approved for manual execution)
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- C1. assessment_calculations.business_id deterministic backfill
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY
--   242 of 242 assessment_calculations rows have business_id NULL, so no
--   calculation can be attributed to a business. The relationship is fully
--   determined by an existing foreign key, so this is derivation — not guessing.
--
-- RELATIONSHIP
--   assessment_calculations.session_id → assessment_sessions.id
--                                     → assessment_sessions.business_id
--
-- EXPECTED ROW IMPACT
--   total assessment_calculations .................. 242
--   business_id IS NULL ........................... 242
--   NULL calc + session HAS business_id ........... 229  ← updated by this statement
--   NULL calc + session also NULL (or no session) .. 13  ← intentionally left NULL
--   orphan session_id ............................. 0
--   net: 229 rows updated
--
-- PRECONDITION
--   FK assessment_calculations_session_id_fkey exists (verified Phase 6B).
--   No conflicting non-null business_id: 0 rows would be overwritten.
--
-- ROLLBACK
--   UPDATE assessment_calculations SET business_id = NULL WHERE business_id IS NOT NULL;

UPDATE assessment_calculations ac
   SET business_id = s.business_id
  FROM assessment_sessions s
 WHERE s.id = ac.session_id
   AND ac.business_id IS NULL
   AND s.business_id IS NOT NULL;

-- VALIDATION QUERY (must return 0 rows)
--   select count(*) from assessment_calculations ac
--     join assessment_sessions s on s.id = ac.session_id
--    where ac.business_id is not null
--      and ac.business_id is distinct from s.business_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- C2. value_creation_events.roadmap_item_id foreign key
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY
--   The column links a value-creation event to the roadmap item that realises
--   it, but nothing enforces that the referenced item exists.
--
-- EXPECTED ROW IMPACT
--   value_creation_events is EMPTY (0 rows) → 0 rows affected.
--
-- PRECONDITION
--   No existing FK on roadmap_item_id (verified). roadmap_item_id is nullable.
--
-- ON DELETE CHOICE
--   SET NULL — deleting a roadmap item must not erase historical value
--   evidence. (Phase 6A's header comment said RESTRICT while its SQL said
--   SET NULL; SET NULL is the correct one and is used here.)
--
-- ROLLBACK
--   ALTER TABLE value_creation_events
--     DROP CONSTRAINT IF EXISTS value_creation_events_roadmap_item_id_fkey;

ALTER TABLE value_creation_events
  ADD CONSTRAINT value_creation_events_roadmap_item_id_fkey
  FOREIGN KEY (roadmap_item_id) REFERENCES roadmap_items(id) ON DELETE SET NULL;

-- VALIDATION QUERY (must return 1 row)
--   select conname from pg_constraint
--    where conname = 'value_creation_events_roadmap_item_id_fkey';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION D — DELIBERATELY NOT INCLUDED
-- ═════════════════════════════════════════════════════════════════════════════
-- NO business_id backfill for:
--   NinetyDaySprint (4)            — 2 VERIFIED, 2 ORPHANED (service-created).
--                                     Record writes are refused on a branch;
--                                     run on the main branch instead.
--   SprintTask (46)                — DERIVABLE from parent sprints.
--   GalileoConversation (4)        — 3 VERIFIED, 1 ORPHANED.
--   roadmap_items (26)             — AMBIGUOUS: all predate the only candidate
--                                     business by ~28 minutes.
--   assessment_sessions (14)       — AMBIGUOUS: same reason.
--   documents (6)                  — VERIFIED, but a record write.
--   gap_analyses (19)              — table has no business_id column.
--   freedom_projections (9)        — TEST_DATA ('test-biz'); column is NOT NULL.
--
-- Policy governing all of the above: src/lib/legacyAmbiguityPolicy.js
-- Rule: VERIFIED → eligible; DERIVABLE → eligible after derivation;
--       AMBIGUOUS / ORPHANED → never automatically canonicalised;
--       TEST_DATA → excluded; LEGACY_ONLY → preserved, not canonicalised.
--
-- NO Digital Twin tables are created by this migration.
-- NO business_facts table. NO ingestion pipeline. Phase 6C comes later.