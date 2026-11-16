-- ══════════════════════════════════════════════════════════════════════════════
-- VISION PHASE 6D.1A — GATE 1
-- SECURE public.business_fact_conflicts
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHY THIS MIGRATION EXISTS (proven production finding, Phase 0 audit)
--
--   public.business_fact_conflicts  kind=view  owner=postgres
--     reloptions             = NULL            (no security_invoker)
--     authenticated SELECT   = true
--     anon SELECT            = true
--
--   A PostgreSQL view executes with the privileges of its OWNER unless it is
--   declared `security_invoker`. The view is owned by `postgres` and carries no
--   `security_invoker` option, so the read policies on the two base tables — which
--   are what keep one business's facts from another — were NOT being applied to it.
--   Any client holding the anon key could have read conflict aggregates spanning
--   EVERY business: candidate_fact_ids, candidate_source_types and
--   candidate_verification_states included.
--
--   The exposure was LATENT, not live: business_facts and business_fact_evidence
--   both held 0 rows, so the view returned nothing. This must be fixed BEFORE the
--   first fact is written, which is precisely why it is Gate 1 of 6D.1A.
--
-- WHAT THIS MIGRATION DOES — the smallest repair that is actually safe
--
--   1. `security_invoker = true` makes the view run with the QUERYING user's
--      privileges, so the base tables' row-level security is evaluated as that
--      user. The view stops being an RLS bypass because it stops being privileged.
--   2. `REVOKE ... FROM anon, PUBLIC` removes anonymous access outright. Anonymous
--      access to conflict aggregates is not a use case; it is only a risk.
--   3. `GRANT SELECT ... TO authenticated` (restated explicitly) keeps the
--      legitimate read path: an authenticated actor still sees exactly the conflict
--      rows `can_access_business(business_id)` admits — the same kernel every other
--      business-scoped read already uses. No second authorization model.
--
-- WHY CROSS-BUSINESS ACCESS BECOMES IMPOSSIBLE
--
--   After the change, reading the view requires SELECT on `business_fact_conflicts`
--   (anon no longer has it) AND SELECT on both base tables, evaluated under RLS as
--   the INVOKING role:
--
--     · anon            → no SELECT grant on the view at all → 0 rows, error-free refusal.
--     · authenticated   → the view executes as `authenticated`, so the base tables'
--                         single read policy applies:
--                              can_access_business(business_id)
--                         which is true only for the business's owner, its assigned
--                         advisor, a super admin, or a business team member. A
--                         Business A actor therefore cannot see Business B's
--                         conflict groups — not because the view filters, but
--                         because the underlying rows are never visible to them.
--     · service_role    → BYPASSRLS, so the backend's legitimate read is unchanged.
--
--   There is no remaining path that reaches conflict rows without passing
--   `can_access_business`. The view can no longer be a hole in the table's policy.
--
-- IDEMPOTENT: safe to re-run. Requires PostgreSQL 15+ (Supabase is 15+).
-- If `security_invoker` were unavailable, the equivalent fallback is to redefine
-- the view with an explicit `WHERE can_access_business(business_id)` predicate —
-- see VISION_PHASE_6D_1A_ACTIVATION_SAFETY.md §2.4.
--
-- THIS MIGRATION TOUCHES NO ROWS. It adds no policy, drops no column, and does not
-- alter business_facts or business_fact_evidence. Both remain empty (fact freeze).
-- ══════════════════════════════════════════════════════════════════════════════

begin;

-- 1. The view stops running as its owner, so base-table RLS applies to the reader.
alter view public.business_fact_conflicts set (security_invoker = true);

-- 2. Remove anonymous access entirely. `public` first: Supabase's default ACLs grant
--    new objects to PUBLIC, so the pseudo-role must be revoked as well as anon.
revoke all on public.business_fact_conflicts from public;
revoke all on public.business_fact_conflicts from anon;

-- 3. Restate the one legitimate read path, explicitly.
grant select on public.business_fact_conflicts to authenticated;

comment on view public.business_fact_conflicts is
  'Derived conflict groups over live business_facts. security_invoker: reads are evaluated under the invoking user''s privileges, so base-table RLS (can_access_business) governs visibility. Not readable by anon. See VISION_PHASE_6D_1A_ACTIVATION_SAFETY.md.';

commit;