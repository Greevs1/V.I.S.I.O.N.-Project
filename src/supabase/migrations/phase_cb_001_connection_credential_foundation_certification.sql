-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-001 PRODUCTION CERTIFICATION
-- ============================================================================
-- READ-ONLY. Run AFTER phase_cb_001_connection_credential_foundation.sql.
-- Inspects the LIVE deployed database and returns ONE report: 30 rows —
-- checks A … V, plus the full-matrix privilege rows L2 / L3 / L4.
--
-- FULL-PRIVILEGE-MATRIX COVERAGE (L2 / L3 / L4): L and N prove the intended
-- grants and the absence of DELETE. They do NOT prove the absence of TRUNCATE,
-- REFERENCES, TRIGGER or MAINTAIN — the other four privileges pg_default_acl
-- ALSO materialized into relacl at CREATE TABLE time as `arwdDxtm`. CB-001's
-- GRANT could not narrow those, and only CB-001.1's explicit REVOKE removed
-- them. Checking DELETE alone was therefore never sufficient, and this report
-- no longer relies on it: L2 / L3 / L4 assert the COMPLETE effective privilege
-- set. All three rows use has_table_privilege, so they prove EFFECTIVE
-- privilege — including anything reachable through role membership — not merely
-- the ACL item. MAINTAIN is valid in this environment: the live ACL displayed
-- `arwdDxtm` (PostgreSQL 17+).
--
-- CREDENTIAL-NAME CLASSIFICATION (C3/C4/C5): the deny-list is EXACT-NAME, never a
-- substring pattern, because provider_credentials legitimately contains
-- vault_secret_id — an approved opaque reference to a Vault secret, not a secret.
-- A `token|secret|password|authorization_code` regex misclassified it. C5 then
-- self-tests the classification in-database, so the proof is not an inspection.
--
-- CB-001.2 — ROTATION-UNIT SUPERSESSION INTEGRITY (added with
-- phase_cb_001_2_supersession_rotation_unit_integrity.sql). provider_credentials
-- gains one UNIQUE anchor and one FOREIGN KEY, so a successor credential must
-- share its predecessor's business_connection_id AND credential_type — not merely
-- its business. Consequences for THIS report, and no others:
--   · D now expects SEVEN foreign keys, and verifies the new FK by its EXACT
--     ordered column mapping rather than by name alone.
--   · E now expects FOUR unique constraints, and verifies the new anchor by its
--     exact ordered columns (id, business_connection_id, credential_type).
--   · G is UNCHANGED: its verdict counts a fixed five-name index list, so the
--     anchor's backing index does not enter it. Its OBSERVED index list does grow
--     by that one auto-named index — expected, not a failure.
--   · Every other row is unchanged, and the report is still exactly 30 rows.
--
-- Expected posture (any deviation is a FAIL):
--   anon          = NO ACCESS on both tables — none of the eight (J, L3)
--   authenticated = NO ACCESS on both tables — none of the eight (K, L4)
--   PUBLIC        = NO ACCESS on both tables
--   service_role  = EXACTLY SELECT / INSERT / UPDATE, and DELETE, TRUNCATE,
--                   REFERENCES, TRIGGER, MAINTAIN all FALSE (L, N, L2)
--   RLS           = ENABLED on both tables
--   policies      = NONE
--   fact freeze   = 0 / 0
--   SECURITY DEFINER functions created by this migration = NONE
-- ============================================================================

-- ── THE COMPLETE EFFECTIVE PRIVILEGE MATRIX ─────────────────────────────────
-- All EIGHT PostgreSQL table privileges, for all three roles, on both tables.
-- has_table_privilege resolves role membership, so a privilege inherited through
-- a granted role is caught here even when the ACL item itself reads clean.
--
-- Why all eight and not just DELETE: the production defect was `arwdDxtm` —
-- a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER
-- m=MAINTAIN. The GRANT in CB-001 could only ADD (select, insert, update); it
-- could not remove the other five, and only CB-001.1's REVOKE did. Proving
-- `not del` alone left D, x, t and m unproven. m (MAINTAIN) exists only on
-- PostgreSQL 17+, which is exactly what this server runs.
with privs as (
  select
    r.role_name,
    t.table_name,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'SELECT')     as sel,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'INSERT')     as ins,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'UPDATE')     as upd,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'DELETE')     as del,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'TRUNCATE')   as trunc,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'REFERENCES') as refs,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'TRIGGER')    as trig,
    has_table_privilege(r.role_name, 'public.' || t.table_name, 'MAINTAIN')   as maint
  from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
  cross join (values ('business_connections'), ('provider_credentials')) as t(table_name)
),
-- The observed matrix in readable form, so a FAIL says WHICH privilege appeared.
priv_display as (
  select
    role_name,
    table_name,
    coalesce(nullif(concat_ws(', ',
      case when sel   then 'SELECT'     end,
      case when ins   then 'INSERT'     end,
      case when upd   then 'UPDATE'     end,
      case when del   then 'DELETE'     end,
      case when trunc then 'TRUNCATE'   end,
      case when refs  then 'REFERENCES' end,
      case when trig  then 'TRIGGER'    end,
      case when maint then 'MAINTAIN'   end), ''), 'none') as privilege_list
  from privs
),
priv_facts as (
  select
    bool_and(not sel and not ins and not upd and not del) filter (where role_name = 'anon')            as anon_clean,
    bool_and(not sel and not ins and not upd and not del) filter (where role_name = 'authenticated')   as authed_clean,
    bool_and(sel and ins and upd and not del)             filter (where role_name = 'service_role')    as service_role_exact,
    bool_or(del)                                          filter (where role_name = 'service_role')    as service_role_delete,
    -- THE STRONG INVARIANT: exactly the three intended privileges and NONE of the
    -- other five, on BOTH tables, at effective-privilege level.
    bool_and(not sel and not ins and not upd and not del
             and not trunc and not refs and not trig and not maint)
      filter (where role_name = 'anon')          as anon_clean_8,
    bool_and(not sel and not ins and not upd and not del
             and not trunc and not refs and not trig and not maint)
      filter (where role_name = 'authenticated') as authed_clean_8,
    bool_and(sel and ins and upd and not del
             and not trunc and not refs and not trig and not maint)
      filter (where role_name = 'service_role')  as service_role_exact_8
  from privs
),
-- ── THE CREDENTIAL-NAME DENY-LIST — ONE DEFINITION, USED TWICE ──────────────
-- The deployed-column check and the self-test below share THIS list, so the test
-- that proves the classification can never drift from the classification applied.
--
-- vault_secret_id is deliberately NOT on it: it is APPROVED REFERENCE METADATA —
-- an opaque pointer to a Vault secret, never the secret itself. The previous
-- substring pattern (token|secret|password|authorization_code) classified it as a
-- plaintext column, which was a false positive. This is exact-name, never
-- substring: "semantic" means the guard knows what the column IS.
prohibited_credential_columns(name) as (
  values ('access_token'), ('refresh_token'), ('public_token'), ('authorization_code'),
         ('client_secret'), ('client_secret_value'), ('password'), ('credential_value'),
         ('plaintext_secret'), ('decrypted_secret'), ('token_value'), ('secret_value')
),
approved_reference_columns(name) as (
  values ('vault_secret_id')
),
-- Explicit expectations, so the probe cannot pass by agreeing with itself.
credential_column_probe(name, should_flag) as (
  values
    ('vault_secret_id', false),
    ('access_token', true), ('refresh_token', true), ('public_token', true),
    ('authorization_code', true), ('client_secret', true), ('client_secret_value', true),
    ('password', true), ('credential_value', true), ('plaintext_secret', true),
    ('decrypted_secret', true), ('token_value', true), ('secret_value', true)
),
facts as (
  select
    -- existence
    (select count(*) from information_schema.tables
       where table_schema = 'public' and table_name = 'business_connections') as bc_exists,
    (select count(*) from information_schema.tables
       where table_schema = 'public' and table_name = 'provider_credentials') as pc_exists,

    -- exact columns, in ordinal order
    (select string_agg(column_name, ',' order by ordinal_position)
       from information_schema.columns
       where table_schema = 'public' and table_name = 'business_connections') as bc_columns,
    (select string_agg(column_name, ',' order by ordinal_position)
       from information_schema.columns
       where table_schema = 'public' and table_name = 'provider_credentials') as pc_columns,

    -- §7 no PROHIBITED plaintext credential column may exist. Exact names, never a
    -- substring: vault_secret_id legitimately contains the word "secret".
    (select count(*) from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'provider_credentials'
         and exists (select 1 from prohibited_credential_columns p where p.name = c.column_name)) as pc_prohibited_count,
    (select coalesce(string_agg(c.column_name, ', ' order by c.column_name), 'none')
       from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'provider_credentials'
         and exists (select 1 from prohibited_credential_columns p where p.name = c.column_name)) as pc_prohibited_list,
    -- the approved reference column must actually BE there.
    (select count(*) from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'provider_credentials'
         and exists (select 1 from approved_reference_columns a where a.name = c.column_name)) as pc_approved_count,

    -- Self-test of the classification itself, evaluated in-database so the proof
    -- travels with the certification instead of resting on inspection.
    (select bool_and(
              exists (select 1 from prohibited_credential_columns p where p.name = pr.name) = pr.should_flag)
       from credential_column_probe pr) as predicate_correct,
    (select string_agg(pr.name || ' → ' ||
              case when exists (select 1 from prohibited_credential_columns p where p.name = pr.name)
                   then 'REJECTED' else 'ALLOWED' end, ', ' order by pr.name)
       from credential_column_probe pr) as predicate_map,

    -- The metadata credential-key CHECKs must be present AND armed: a constraint
    -- whose definition lost its key list would otherwise count as present.
    (select count(*) from pg_constraint
       where contype = 'c'
         and conname in ('business_connections_metadata_no_credential_keys',
                         'provider_credentials_rotation_metadata_no_credential_keys')) as metadata_key_checks,
    (select count(*) from pg_constraint
       where contype = 'c'
         and conname in ('business_connections_metadata_no_credential_keys',
                         'provider_credentials_rotation_metadata_no_credential_keys')
         and pg_get_constraintdef(oid) ~ '(access_token|refresh_token|secret)') as metadata_key_checks_armed,

    -- foreign keys
    (select count(*) from pg_constraint where contype = 'f'
       and conrelid::regclass::text in ('business_connections', 'provider_credentials')) as fk_count,
    (select string_agg(conname, ', ' order by conname) from pg_constraint where contype = 'f'
       and conrelid::regclass::text in ('business_connections', 'provider_credentials')) as fk_list,
    (select count(*) from pg_constraint
       where contype = 'f'
         and conname = 'provider_credentials_connection_same_business_fkey'
         and conrelid::regclass::text = 'provider_credentials') as composite_fk_exists,

    -- CB-001.2 — the rotation-unit supersession FK, verified by its EXACT ordered
    -- column mapping. conkey/confkey are compared against the real attribute names
    -- of source and target, in order, so a same-NAMED constraint built over the
    -- wrong columns cannot pass.
    (select count(*) from pg_constraint c
       where c.contype = 'f'
         and c.conname = 'provider_credentials_superseded_same_rotation_unit_fkey'
         and c.conrelid = 'public.provider_credentials'::regclass
         and c.confrelid = 'public.provider_credentials'::regclass
         and (select array_agg(a.attname::text order by k.ord)
                from unnest(c.conkey) with ordinality k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             = array['superseded_by_credential_id', 'business_connection_id', 'credential_type']
         and (select array_agg(a.attname::text order by k.ord)
                from unnest(c.confkey) with ordinality k(attnum, ord)
                join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
             = array['id', 'business_connection_id', 'credential_type']) as rotation_unit_fk_exact,

    -- CB-001.2 — the same-rotation-unit UNIQUE anchor, also verified by exact
    -- ordered mapping, not by presence.
    (select count(*) from pg_constraint c
       where c.contype = 'u'
         and c.conname = 'provider_credentials_id_rotation_unit_unique'
         and c.conrelid = 'public.provider_credentials'::regclass
         and (select array_agg(a.attname::text order by k.ord)
                from unnest(c.conkey) with ordinality k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             = array['id', 'business_connection_id', 'credential_type']) as rotation_unit_unique_exact,

    -- unique constraints
    (select count(*) from pg_constraint where contype = 'u'
       and conrelid::regclass::text in ('business_connections', 'provider_credentials')) as unique_count,
    (select string_agg(conname, ', ' order by conname) from pg_constraint where contype = 'u'
       and conrelid::regclass::text in ('business_connections', 'provider_credentials')) as unique_list,

    -- check constraints
    (select count(*) from pg_constraint where contype = 'c'
       and conrelid::regclass::text in ('business_connections', 'provider_credentials')) as check_count,

    -- indexes
    (select count(*) from pg_indexes where schemaname = 'public'
       and tablename in ('business_connections', 'provider_credentials')
       and indexname in ('business_connections_business_status_idx',
                         'business_connections_provider_org_idx',
                         'business_connections_provider_status_idx',
                         'provider_credentials_one_active_idx',
                         'provider_credentials_connection_idx')) as named_indexes,
    (select string_agg(indexname, ', ' order by indexname) from pg_indexes where schemaname = 'public'
       and tablename in ('business_connections', 'provider_credentials')) as index_list,

    -- RLS + ACLs
    (select bool_and(c.relrowsecurity) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('business_connections', 'provider_credentials')) as rls_enabled,
    (select bool_and(c.relacl is not null) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('business_connections', 'provider_credentials')) as acl_explicit,
    (select string_agg(c.relname || ' → ' || coalesce(c.relacl::text, '<default>'), E'\n' order by c.relname)
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('business_connections', 'provider_credentials')) as acl_list,
    (select count(*) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace,
       aclexplode(c.relacl) a
       where n.nspname = 'public' and c.relname in ('business_connections', 'provider_credentials')
         and a.grantee = 0) as public_grants,

    -- policies + triggers + functions
    (select count(*) from pg_policies where schemaname = 'public'
       and tablename in ('business_connections', 'provider_credentials')) as policy_count,
    (select count(*) from pg_trigger where not tgisinternal
       and tgrelid::regclass::text in ('business_connections', 'provider_credentials')) as trigger_count,
    (select count(*) from pg_trigger where not tgisinternal
       and tgrelid::regclass::text in ('business_connections', 'provider_credentials')
       and tgname in ('business_connections_touch_updated_at', 'provider_credentials_touch_updated_at')) as expected_triggers,
    (select count(*) from pg_trigger where not tgisinternal
       and tgrelid::regclass::text in ('business_connections', 'provider_credentials')
       and tgname not in ('business_connections_touch_updated_at', 'provider_credentials_touch_updated_at')) as unexpected_triggers,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'touch_connected_business_updated_at') as touch_fn_exists,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'touch_connected_business_updated_at'
         and p.prosecdef) as touch_fn_security_definer,

    -- fact freeze (absent table reports -1, which is also a FAIL)
    (select case when to_regclass('public.business_facts') is null then -1
                 else (select count(*) from public.business_facts) end) as facts_count,
    (select case when to_regclass('public.business_fact_evidence') is null then -1
                 else (select count(*) from public.business_fact_evidence) end) as evidence_count,
    (select case when to_regclass('public.business_fact_conflicts') is null then 'absent'
                 else (select count(*)::text from public.business_fact_conflicts) end) as conflicts_observed,

    -- no credentials yet (no Vault wrappers, no secrets in CB-001)
    (select count(*) from public.provider_credentials) as credential_rows,

    -- the readable 8-privilege matrix per role (the L2/L3/L4 observed columns),
    -- plus diagnostics that name what is wrong instead of only that it is.
    (select string_agg(d.table_name || ' → ' || d.privilege_list, ' | ' order by d.table_name)
       from priv_display d where d.role_name = 'service_role') as service_role_matrix,
    (select string_agg(d.table_name || ' → ' || d.privilege_list, ' | ' order by d.table_name)
       from priv_display d where d.role_name = 'anon') as anon_matrix,
    (select string_agg(d.table_name || ' → ' || d.privilege_list, ' | ' order by d.table_name)
       from priv_display d where d.role_name = 'authenticated') as authed_matrix,
    (select coalesce(string_agg(distinct x.priv, ', '), 'none')
       from privs p
       cross join lateral (values
         (case when not p.sel then 'SELECT' end),
         (case when not p.ins then 'INSERT' end),
         (case when not p.upd then 'UPDATE' end)
       ) as x(priv)
      where p.role_name = 'service_role' and x.priv is not null) as service_role_missing_list,
    (select coalesce(string_agg(distinct x.priv, ', '), 'none')
       from privs p
       cross join lateral (values
         (case when p.del   then 'DELETE'     end),
         (case when p.trunc then 'TRUNCATE'   end),
         (case when p.refs  then 'REFERENCES' end),
         (case when p.trig  then 'TRIGGER'    end),
         (case when p.maint then 'MAINTAIN'   end)
       ) as x(priv)
      where p.role_name = 'service_role' and x.priv is not null) as service_role_extra_list,

    pf.anon_clean, pf.authed_clean, pf.service_role_exact, pf.service_role_delete,
    pf.anon_clean_8, pf.authed_clean_8, pf.service_role_exact_8
  from priv_facts pf
)
select * from (
  select 'A' id, 'business_connections exists' requirement,
         f.bc_exists::text observed, '1' expected,
         case when f.bc_exists = 1 then 'PASS' else 'FAIL' end verdict from facts f
  union all select 'B', 'provider_credentials exists',
         f.pc_exists::text, '1',
         case when f.pc_exists = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'C1', 'business_connections exact columns (ordinal order)',
         coalesce(f.bc_columns, '<none>'),
         'id,business_id,provider,connection_category,provider_organization_id,provider_organization_name,display_name,status,capabilities,connected_by_profile_id,initiated_by_profile_id,connected_at,disconnected_at,disconnected_by_profile_id,last_sync_started_at,last_sync_completed_at,last_successful_sync_at,sync_status,last_error_class,reauthorization_required,metadata_safe,created_at,updated_at',
         case when f.bc_columns = 'id,business_id,provider,connection_category,provider_organization_id,provider_organization_name,display_name,status,capabilities,connected_by_profile_id,initiated_by_profile_id,connected_at,disconnected_at,disconnected_by_profile_id,last_sync_started_at,last_sync_completed_at,last_successful_sync_at,sync_status,last_error_class,reauthorization_required,metadata_safe,created_at,updated_at'
              then 'PASS' else 'FAIL' end from facts f
  union all select 'C2', 'provider_credentials exact columns (ordinal order)',
         coalesce(f.pc_columns, '<none>'),
         'id,business_connection_id,business_id,credential_type,vault_secret_id,status,expires_at,rotation_metadata_safe,created_at,updated_at,revoked_at,superseded_by_credential_id',
         case when f.pc_columns = 'id,business_connection_id,business_id,credential_type,vault_secret_id,status,expires_at,rotation_metadata_safe,created_at,updated_at,revoked_at,superseded_by_credential_id'
              then 'PASS' else 'FAIL' end from facts f
  union all select 'C3', 'no PROHIBITED plaintext credential column exists (exact-name deny-list, not a substring match)',
         f.pc_prohibited_count::text || ' (' || f.pc_prohibited_list || ')', '0 (none)',
         case when f.pc_prohibited_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'C4', 'vault_secret_id exists as APPROVED REFERENCE METADATA',
         'approved reference columns found: ' || f.pc_approved_count::text, '1',
         case when f.pc_approved_count = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'C5', 'deny-list self-test: vault_secret_id ALLOWED, all 12 credential names REJECTED',
         coalesce(f.predicate_map, '<none>'),
         'vault_secret_id → ALLOWED, and every credential name → REJECTED',
         case when f.predicate_correct then 'PASS' else 'FAIL' end from facts f
  union all select 'D', 'exact foreign keys (7)',
         coalesce(f.fk_list, '<none>') || '  [rotation-unit FK exact mapping: '
           || case when f.rotation_unit_fk_exact = 1 then 'verified' else 'NOT VERIFIED' end || ']',
         '7 FKs incl. provider_credentials_connection_same_business_fkey and provider_credentials_superseded_same_rotation_unit_fkey',
         case when f.fk_count = 7 and f.composite_fk_exists = 1 and f.rotation_unit_fk_exact = 1
              then 'PASS' else 'FAIL' end from facts f
  union all select 'E', 'exact unique constraints (4)',
         coalesce(f.unique_list, '<none>') || '  [rotation-unit anchor exact mapping: '
           || case when f.rotation_unit_unique_exact = 1 then 'verified' else 'NOT VERIFIED' end || ']',
         'business_connections_id_business_unique, business_connections_identity_unique, provider_credentials_id_business_unique, provider_credentials_id_rotation_unit_unique',
         case when f.unique_count = 4 and f.rotation_unit_unique_exact = 1
              then 'PASS' else 'FAIL' end from facts f
  union all select 'F', 'exact CHECK constraints (16)',
         f.check_count::text, '16',
         case when f.check_count = 16 then 'PASS' else 'FAIL' end from facts f
  union all select 'F2', 'credential-key CHECKs present on BOTH metadata columns and armed',
         'present: ' || f.metadata_key_checks::text || ', armed: ' || f.metadata_key_checks_armed::text,
         'present: 2, armed: 2',
         case when f.metadata_key_checks = 2 and f.metadata_key_checks_armed = 2 then 'PASS' else 'FAIL' end from facts f
  union all select 'G', 'the five declared indexes exist',
         coalesce(f.index_list, '<none>'), '5 named indexes present',
         case when f.named_indexes = 5 then 'PASS' else 'FAIL' end from facts f
  union all select 'H', 'RLS ENABLED on both tables',
         coalesce(f.rls_enabled::text, 'null'), 'true',
         case when f.rls_enabled then 'PASS' else 'FAIL' end from facts f
  union all select 'I', 'both tables carry an EXPLICIT acl (no reliance on defaults)',
         coalesce(f.acl_list, '<none>'), 'relacl is not null on both',
         case when f.acl_explicit then 'PASS' else 'FAIL' end from facts f
  union all select 'J', 'anon has NO access',
         case when f.anon_clean then 'no privileges' else 'privileges present' end,
         'no privileges on either table',
         case when f.anon_clean then 'PASS' else 'FAIL' end from facts f
  union all select 'K', 'authenticated has NO access',
         case when f.authed_clean then 'no privileges' else 'privileges present' end,
         'no privileges on either table',
         case when f.authed_clean then 'PASS' else 'FAIL' end from facts f
  union all select 'L', 'service_role = SELECT/INSERT/UPDATE exactly',
         case when f.service_role_exact then 'select+insert+update, no delete' else 'unexpected privilege set' end,
         'select+insert+update, no delete',
         case when f.service_role_exact then 'PASS' else 'FAIL' end from facts f
  union all select 'L2', 'service_role has EXACTLY SELECT/INSERT/UPDATE and NONE of DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (8-privilege effective matrix, both tables)',
         coalesce(f.service_role_matrix, '<none>') || '  [missing: ' || f.service_role_missing_list || ' | extra: ' || f.service_role_extra_list || ']',
         'business_connections → SELECT, INSERT, UPDATE | provider_credentials → SELECT, INSERT, UPDATE  [missing: none | extra: none]',
         case when f.service_role_exact_8 then 'PASS' else 'FAIL' end from facts f
  union all select 'L3', 'anon has NONE of the eight privileges (8-privilege effective matrix, both tables)',
         coalesce(f.anon_matrix, '<none>'),
         'business_connections → none | provider_credentials → none',
         case when f.anon_clean_8 then 'PASS' else 'FAIL' end from facts f
  union all select 'L4', 'authenticated has NONE of the eight privileges (8-privilege effective matrix, both tables)',
         coalesce(f.authed_matrix, '<none>'),
         'business_connections → none | provider_credentials → none',
         case when f.authed_clean_8 then 'PASS' else 'FAIL' end from facts f
  union all select 'M', 'PUBLIC has NO privileges',
         f.public_grants::text, '0 grants to grantee 0',
         case when f.public_grants = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'N', 'service_role DELETE = FALSE',
         coalesce(f.service_role_delete::text, 'null'), 'false',
         case when f.service_role_delete is not true then 'PASS' else 'FAIL' end from facts f
  union all select 'O', 'same-business composite FK exists',
         coalesce(f.composite_fk_exists::text, 'null'), '1',
         case when f.composite_fk_exists = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'P', 'business_facts count (freeze)',
         f.facts_count::text, '0',
         case when f.facts_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'Q', 'business_fact_evidence count (freeze)',
         f.evidence_count::text, '0',
         case when f.evidence_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'R', 'unexpected policies on the new tables',
         f.policy_count::text, '0',
         case when f.policy_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'S', 'unexpected triggers on the new tables',
         f.trigger_count::text || ' total, ' || f.expected_triggers::text || ' expected, ' || f.unexpected_triggers::text || ' unexpected',
         '2 total, 2 expected, 0 unexpected',
         case when f.trigger_count = 2 and f.expected_triggers = 2 and f.unexpected_triggers = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'T', 'SECURITY DEFINER functions created by this migration',
         'touch fn exists: ' || f.touch_fn_exists::text || ', security definer: ' || f.touch_fn_security_definer::text,
         'exists: 1, security definer: 0',
         case when f.touch_fn_exists = 1 and f.touch_fn_security_definer = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'U', 'provider_credentials rows (no Vault wrappers / no secrets yet)',
         f.credential_rows::text, '0',
         case when f.credential_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'V', 'business_fact_conflicts untouched',
         f.conflicts_observed, '0 (or absent)',
         case when f.conflicts_observed in ('0', 'absent') then 'PASS' else 'FAIL' end from facts f
) report
order by id;

-- Any FAIL above means the deployed ACL/RLS posture does NOT match the artifact.
-- Do not proceed to CB-002 until every row reads PASS.