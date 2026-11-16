-- ══════════════════════════════════════════════════════════════════════════════
-- VISION PHASE 6D.1A — GATE 1 VERIFICATION
-- Run AFTER phase_6d_1a_secure_fact_conflicts.sql
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Expected result (all three rows):
--
--   business_facts              rls=true   anon_select=true    authenticated_select=true
--   business_fact_evidence      rls=true   anon_select=true    authenticated_select=true
--   business_fact_conflicts     rls=n/a    anon_select=FALSE   authenticated_select=true
--                               reloptions = {security_invoker=true}
--
-- The base tables keep their SELECT grant on purpose: RLS, not the grant, is what
-- restricts them (one read policy each, `to authenticated`). Anonymous access to
-- them was never the hole — the VIEW was, because it ran as its owner.
-- ══════════════════════════════════════════════════════════════════════════════

select
  c.relname                                     as object,
  c.relkind::text                               as kind,
  pg_get_userbyid(c.relowner)                   as owner,
  c.reloptions                                 as reloptions,
  c.relrowsecurity                               as rls_enabled,
  has_table_privilege('anon', c.oid, 'select')           as anon_can_select,
  has_table_privilege('authenticated', c.oid, 'select')  as authenticated_can_select,
  has_table_privilege('anon', c.oid, 'insert')           as anon_can_insert,
  has_table_privilege('authenticated', c.oid, 'update')  as authenticated_can_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('business_facts', 'business_fact_evidence', 'business_fact_conflicts')
order by c.relname;

-- The read policies that make the view safe, and the confirmation that no write
-- policy exists on either fact table (the whole write posture of 6C/6D.1).
select tablename, policyname, cmd, roles::text, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('business_facts', 'business_fact_evidence')
order by tablename, cmd;

-- FACT FREEZE — every run of this verification must return 0 and 0.
select
  (select count(*) from public.business_facts)          as business_facts_rows,
  (select count(*) from public.business_fact_evidence)  as business_fact_evidence_rows;