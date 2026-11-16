-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PHASE 6B.2 — DIGITAL TWIN READINESS GATE — MANUAL RLS DEPLOYMENT         ║
-- ║                                                                           ║
-- ║  STATUS: NOT EXECUTED.                                                    ║
-- ║                                                                           ║
-- ║  WHY NOT AUTOMATIC:                                                       ║
-- ║   1. The build tools hold READ-ONLY Supabase access (projects:read,        ║
-- ║      secrets:read, database:read — no database:write).                     ║
-- ║   2. This branch (architecture-prep) cannot write records, and the         ║
-- ║      Supabase project is SHARED — there is only one project, so there is   ║
-- ║      no dev isolation to rehearse against.                                 ║
-- ║                                                                           ║
-- ║  Any write must be run by a human, deliberately, in the Supabase SQL       ║
-- ║  Editor. Read Section A's output before running Section B.                 ║
-- ║                                                                           ║
-- ║  THIS FILE IS ADDITIVE AND IDEMPOTENT. It enables RLS on tables that       ║
-- ║  currently have none, and adds no policy that grants client access.        ║
-- ║  It drops nothing, alters no column, and changes no existing policy.       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION A — AUDIT (READ-ONLY). Run this first, every time, before Section B.
-- ═════════════════════════════════════════════════════════════════════════════
-- A1. Which tables have RLS enabled at all? Tables absent from this list have
--     NO row-level security, regardless of what their schema files suggest.
select
  n.nspname                              as schema_name,
  c.relname                              as table_name,
  c.relrowsecurity                       as rls_enabled,
  c.relforcerowsecurity                  as rls_forced,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public', 'valuation')
  and c.relname in (
    'freedom_projections',
    'guest_sessions',
    'strategy_outcomes',
    'saved_playbooks',
    'client_strategy_expansions',
    'strategy_learning_summary',
    'live_sync_actions',
    'dashboard_metrics',
    'business_metric_snapshots'
  )
order by c.relrowsecurity asc, n.nspname, c.relname;

-- A2. Full policy detail for those same tables — proves what each policy grants.
--     Empty for a table means: RLS on with NO policy (deny-all for client roles),
--     or RLS off entirely (client roles may read/write freely).
select
  schemaname,
  tablename,
  policyname,
  cmd        as applies_to,
  roles,
  qual       as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname in ('public', 'valuation')
  and tablename in (
    'freedom_projections',
    'guest_sessions',
    'strategy_outcomes',
    'saved_playbooks',
    'client_strategy_expansions',
    'strategy_learning_summary',
    'live_sync_actions',
    'dashboard_metrics',
    'business_metric_snapshots'
  )
order by tablename, policyname;

-- A3. The authorization function every business policy depends on.
--     If this is missing, EVERY can_access_business policy silently denies.
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('can_access_business', 'is_business_member', 'has_business_access')
order by p.proname;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION B — SAFE SUBSET. Run only after reviewing Section A.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- WHAT THESE SIX TABLES HAVE IN COMMON (verified against the codebase, not
-- assumed): every one of them is accessed EXCLUSIVELY through a backend
-- function holding the service-role key, and NO file under src/ queries any of
-- them from the browser. Verified 2026-09-29:
--
--   freedom_projections        -> calculateFreedomAcceleration
--   guest_sessions             -> guestSessionService, hydrateDashboardFromJourney
--   strategy_outcomes          -> onSprintItemCompleted, onRoadmapItemCompleted,
--                                 recordStrategyOutcome, buildGalileoContext,
--                                 recalculateStrategyLearningSummary
--   saved_playbooks            -> savedPlaybookData
--   client_strategy_expansions -> expandStrategyOpportunities,
--                                 recordStrategyOutcome, onSprintItemCompleted,
--                                 calculateFreedomAcceleration
--   strategy_learning_summary  -> aiLearningGovernance,
--                                 recalculateStrategyLearningSummary,
--                                 galileoBieConsumer
--
--   Browser references found: 0 for all six.
--
-- THEREFORE the correct policy is DENY-BY-DEFAULT FOR CLIENT ROLES: enable RLS
-- and add NO permissive policy. The service role bypasses RLS entirely, so every
-- existing backend path keeps working unchanged, while anon and authenticated
-- browser clients lose the ability to read or write these tables directly.
--
-- This is the deliberate inverse of the Phase 6A mistake: 6A proposed ADDING
-- permissive `profile_id = auth.uid()` policies to a table that already had a
-- correct can_access_business policy. Postgres policies are PERMISSIVE and OR
-- together, so adding one BROADENS access rather than restricting it. Here we
-- add no policy at all — enabling RLS alone is the restriction.
--
-- Idempotency: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is safe to re-run.
-- Tables absent from the database are skipped by the DO block, so this file does
-- not fail on a partially-migrated environment.

do $$
declare
  t text;
  target_tables text[] := array[
    'freedom_projections',
    'guest_sessions',
    'strategy_outcomes',
    'saved_playbooks',
    'client_strategy_expansions',
    'strategy_learning_summary'
  ];
begin
  foreach t in array target_tables loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = 'public' and c.relname = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      raise notice 'RLS enabled (deny-by-default) on public.%', t;
    else
      raise notice 'SKIPPED — table public.% does not exist', t;
    end if;
  end loop;
end $$;

-- EXPLICIT NON-ACTION, stated so it is never "fixed" by mistake:
--   No CREATE POLICY statement follows. A table with RLS enabled and zero
--   policies denies all access to non-bypass roles. That is the intent.
--   Do NOT add `profile_id = auth.uid()` policies here.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION C — VERIFY (read-only). Both queries must return the stated result.
-- ═════════════════════════════════════════════════════════════════════════════
-- C1. Every target table must show rls_enabled = true.
--     Expected: 6 rows, all true.
select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
  and c.relname in (
    'freedom_projections',
    'guest_sessions',
    'strategy_outcomes',
    'saved_playbooks',
    'client_strategy_expansions',
    'strategy_learning_summary'
  )
order by c.relrowsecurity asc, c.relname;

-- C2. Client-role reachability on those tables must be ZERO.
--     Expected: 0 rows. Any row here is a permissive policy that re-opens access.
select schemaname, tablename, policyname, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'freedom_projections',
    'guest_sessions',
    'strategy_outcomes',
    'saved_playbooks',
    'client_strategy_expansions',
    'strategy_learning_summary'
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION D — LIVE FUNCTIONAL CHECK (run from the APP, not here)
-- ═════════════════════════════════════════════════════════════════════════════
-- RLS enabled with no policy is only safe if the backend truly uses the service
-- key. Confirm these paths still work AFTER Section B, in the running app:
--
--   1. Guest → member promotion:   journey-signup → dashboard shows metrics
--   2. Journey hydration:          hydrateDashboardFromJourney writes metrics
--   3. Freedom projections:        open a freedom/projection surface
--   4. Sprint completion:          complete a sprint task → strategy outcome row
--   5. Strategy learning summary:  open the advisor learning surface
--
-- If any of these breaks, the corresponding function is running with a
-- user-scoped client rather than the service role. That is the bug to fix —
-- do NOT re-open the table by adding a policy.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION E — ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
-- Rollback restores the previous (unprotected) state. It changes no data and
-- deletes no records: these tables had no policies before, so there are none to
-- drop.
--
-- alter table public.freedom_projections        disable row level security;
-- alter table public.guest_sessions             disable row level security;
-- alter table public.strategy_outcomes          disable row level security;
-- alter table public.saved_playbooks            disable row level security;
-- alter table public.client_strategy_expansions disable row level security;
-- alter table public.strategy_learning_summary  disable row level security;
--
-- Note: disabling RLS is itself non-destructive. Prefer fixing the offending
-- backend function over rolling this file back.