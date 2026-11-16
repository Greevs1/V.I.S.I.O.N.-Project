-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001 — VERIFICATION / CERTIFICATION QUERIES
-- ============================================================================
-- Read-only. Run after phase_cb_001_connection_credential_foundation.sql.
-- Every certification claim in the CB-001 report is reproducible from this file.
--
-- Sections:
--   A  table schemas            E  indexes                H  RLS state
--   B  foreign keys             F  ACLs                   I  effective privilege matrix
--   C  unique constraints       G  trigger inventory      J  fact freeze
--   D  CHECK constraints
--   K  cross-business rejection test (transactional — ROLLBACK, leaves no rows)
--   L  safe-metadata negative test (documented; enforced by the app validator)
-- ============================================================================

-- ── A. Table schemas ────────────────────────────────────────────────────────
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('business_connections', 'provider_credentials')
order by table_name, ordinal_position;

-- ── B. Foreign keys ─────────────────────────────────────────────────────────
select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid::regclass::text in ('business_connections', 'provider_credentials')
order by 1, 2;

-- ── C. Unique constraints ───────────────────────────────────────────────────
select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'u'
  and conrelid::regclass::text in ('business_connections', 'provider_credentials')
order by 1, 2;

-- ── D. CHECK constraints ────────────────────────────────────────────────────
select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'c'
  and conrelid::regclass::text in ('business_connections', 'provider_credentials')
order by 1, 2;

-- ── E. Indexes ──────────────────────────────────────────────────────────────
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('business_connections', 'provider_credentials')
order by tablename, indexname;

-- ── F. ACLs ─────────────────────────────────────────────────────────────────
select c.relname, c.relacl::text as acl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('business_connections', 'provider_credentials')
order by 1;

-- ── G. Triggers ─────────────────────────────────────────────────────────────
select t.tgname, t.tgrelid::regclass::text as table_name, p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgrelid::regclass::text in ('business_connections', 'provider_credentials')
order by 1;

-- ── H. RLS state (must be ENABLED on both; zero policies is the intent) ─────
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('business_connections', 'provider_credentials')
order by 1;

select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('business_connections', 'provider_credentials');

-- ── I. Effective privilege matrix ───────────────────────────────────────────
-- Expected:
--   anon            → all false
--   authenticated   → all false
--   service_role    → SELECT/INSERT/UPDATE true, DELETE false
select
  r.role_name, t.table_name,
  has_table_privilege(r.role_name, 'public.' || t.table_name, 'SELECT') as can_select,
  has_table_privilege(r.role_name, 'public.' || t.table_name, 'INSERT') as can_insert,
  has_table_privilege(r.role_name, 'public.' || t.table_name, 'UPDATE') as can_update,
  has_table_privilege(r.role_name, 'public.' || t.table_name, 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
cross join (values ('business_connections'), ('provider_credentials')) as t(table_name)
order by r.role_name, t.table_name;

-- ── J. Fact freeze (must be 0 / 0 before AND after) ─────────────────────────
select
  (select count(*) from business_facts)         as business_facts_count,
  (select count(*) from business_fact_evidence) as business_fact_evidence_count;

-- ── K. Cross-business credential rejection test ─────────────────────────────
-- Proves the same-business composite FK is enforced BELOW the application layer,
-- as service_role (which bypasses RLS, so nothing but the FK can stop it).
-- ROLLBACK leaves no rows behind. Requires two real business ids to exist; if
-- none do, the test is performed once provider data exists.
--
-- begin;
--   set local role service_role;
--   -- insert a connection for business A, then attempt a credential that pairs
--   -- business A's connection with business B's id:
--   insert into business_connections (id, business_id, provider, connection_category, provider_organization_id)
--     values ('00000000-0000-0000-0000-0000000000a1', '<BUSINESS_A>', 'plaid', 'banking', 'item_sandbox_a');
--   insert into provider_credentials (business_connection_id, business_id, credential_type)
--     values ('00000000-0000-0000-0000-0000000000a1', '<BUSINESS_B>', 'plaid_access');
--   -- EXPECTED: ERROR — insert or update on table "provider_credentials" violates
--   --           foreign key constraint "provider_credentials_connection_same_business_fkey"
-- rollback;

-- ── L. Safe-metadata negative test ──────────────────────────────────────────
-- Enforced by base44/shared/providers/vocabulary.ts::assertSafeMetadata, not by a
-- SQL content scanner (deliberately: a fuzzy SQL scanner would be brittle). The
-- database supplies the complementary structural guard — both *_safe columns must
-- be JSON objects:
--
--   select jsonb_typeof(metadata_safe)           from business_connections   limit 1;  -- 'object'
--   select jsonb_typeof(rotation_metadata_safe)  from provider_credentials    limit 1;  -- 'object'
--
-- Application-level expectation:
--   assertSafeMetadata({ access_token: 'x' })                 → throws
--   assertSafeMetadata({ nested: { refresh_token: 'x' } })     → throws
--   assertSafeMetadata({ my_public_token: 'x' })               → throws
--   assertSafeMetadata({ sync_window_days: 90 })               → passes