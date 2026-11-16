-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002 PRODUCTION CERTIFICATION
-- ============================================================================
-- READ-ONLY. Run AFTER phase_cb_002_vault_credential_wrappers.sql.
-- Inspects the LIVE deployed database and returns ONE report: 25 rows — A … Y.
--
-- VERDICT VOCABULARY — read this before reading the grid.
--   PASS     the deployed state matches the artifact.
--   FAIL     the deployed state deviates. A FAIL blocks.
--   BLOCKER  a MANUAL production gate that no amount of SQL can close. Row Y is
--            one. BLOCKER is deliberately NOT a FAIL: it is not a posture
--            deviation, it is an unconfirmed human responsibility. It must be read
--            every time, and it must stay visible until a human closes it.
--
-- WHAT THIS CERTIFIES
--   The wrapper surface exists EXACTLY as designed, is reachable ONLY by
--   service_role, cannot be reached by PUBLIC / anon / authenticated, runs with
--   pinned privilege and a pinned search_path, and changed NOTHING about CB-001,
--   CB-001.1 or CB-001.2.
--
-- WHAT THIS CANNOT CERTIFY
--   • That an actor was authorized before a wrapper was called. The RPC executes
--     as service_role and cannot see an actor; that is a call-site obligation.
--   • That Vault's ROOT KEY is correctly held. Row Y reports it as open.
--   • That any provider integration works. CB-002 connects nothing.
--
-- Expected posture (any deviation is a FAIL unless marked BLOCKER):
--   A-D    the four wrappers exist, with EXACT signatures
--   E      NO other credential/vault wrapper exists in public
--   F      all four are SECURITY DEFINER
--   G      all four are owned by postgres
--   H      all four pin search_path = pg_catalog, vault, public
--   I      PUBLIC holds no EXECUTE on any wrapper (explicit proacl, not defaults)
--   J      anon holds no EXECUTE on any wrapper
--   K      authenticated holds no EXECUTE on any wrapper
--   L      service_role holds EXECUTE on exactly the four wrappers
--   M      no plaintext credential column was added to provider_credentials
--   N      business_connections is empty (clean synthetic-testing baseline)
--   O      provider_credentials is empty (clean synthetic-testing baseline)
--   P      CB-001 ACL posture on service_role is UNCHANGED (select/insert/update)
--   Q      CB-001 ACL posture on anon/authenticated is UNCHANGED (no access)
--   R      CB-001.2 supersession FK intact, by exact ordered column mapping
--   S      CB-001.2 rotation-unit anchor intact, by exact ordered columns
--   T      business_facts freeze intact (0)
--   U      business_fact_evidence freeze intact (0)
--   V      business_fact_conflicts untouched (0 or absent)
--   W      Vault secret / credential coherence: no orphaned provider secret
--   X      the Vault surface the wrappers depend on is present
--   Y      ROOT KEY / PRODUCTION BLOCKER — MANUAL CONFIRMATION REQUIRED
-- ============================================================================

with wrapper_specs(name, signature) as (
  values
    ('provider_credential_put',     'uuid, uuid, text, text, timestamp with time zone, jsonb'),
    ('provider_credential_rotate',  'uuid, text, timestamp with time zone, jsonb'),
    ('provider_credential_resolve', 'uuid, uuid, text'),
    ('provider_credential_revoke',  'uuid, uuid, uuid')
),
-- Every wrapper that ACTUALLY exists in public, resolved to its live identity.
wrapper_live as (
  select
    p.oid,
    p.proname                                                            as name,
    pg_get_function_identity_arguments(p.oid)                            as signature,
    p.prosecdef                                                          as security_definer,
    (select r.rolname from pg_roles r where r.oid = p.proowner)          as owner_name,
    p.proconfig                                                          as config,
    p.proacl                                                             as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('provider_credential_put', 'provider_credential_rotate',
                      'provider_credential_resolve', 'provider_credential_revoke')
),
-- Anything credential- or vault-shaped in public that is NOT one of the four.
unexpected_wrappers as (
  select p.proname as name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname ~ '(credential|vault)' or p.proname ~ 'provider_')
    and p.proname not in ('provider_credential_put', 'provider_credential_rotate',
                          'provider_credential_resolve', 'provider_credential_revoke')
),
-- PUBLIC reachability, judged on the ACL itself: a NULL proacl means the DEFAULT
-- applies, which INCLUDES PUBLIC EXECUTE — so NULL must never read as clean.
public_grant as (
  select
    count(*) filter (where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute_items,
    count(*) filter (where w.acl is null)                                  as null_acl_functions
  from wrapper_live w
  left join lateral aclexplode(w.acl) a on true
),
-- Effective reachability for the roles that matter, resolved through membership.
effective_reach as (
  select
    (select count(*) from wrapper_live w where has_function_privilege('anon', w.oid, 'EXECUTE'))          as anon_executable,
    (select count(*) from wrapper_live w where has_function_privilege('authenticated', w.oid, 'EXECUTE')) as authed_executable,
    (select count(*) from wrapper_live w where has_function_privilege('service_role', w.oid, 'EXECUTE'))  as service_executable
),
-- CB-001 table ACLs, re-measured exactly as CB-001 certified them.
privs as (
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
-- The CB-001 credential-column deny-list, carried forward unchanged.
prohibited_credential_columns(name) as (
  values ('access_token'), ('refresh_token'), ('public_token'), ('authorization_code'),
         ('client_secret'), ('client_secret_value'), ('password'), ('credential_value'),
         ('plaintext_secret'), ('decrypted_secret'), ('token_value'), ('secret_value')
),
facts as (
  select
    -- ── A-D · existence with the EXACT signature ───────────────────────────
    (select count(*) from wrapper_live w join wrapper_specs s on s.name = w.name and s.signature = w.signature) as exact_wrappers,
    (select coalesce(string_agg(w.name || '(' || w.signature || ')', ' | ' order by w.name), '<none>')
       from wrapper_live w) as live_signatures,
    (select coalesce(string_agg(s.name, ', ' order by s.name), '<none>') from wrapper_specs s) as expected_names,

    (select count(*) from wrapper_live w where w.name = 'provider_credential_put'
       and w.signature = 'uuid, uuid, text, text, timestamp with time zone, jsonb') as put_exact,
    (select count(*) from wrapper_live w where w.name = 'provider_credential_rotate'
       and w.signature = 'uuid, text, timestamp with time zone, jsonb') as rotate_exact,
    (select count(*) from wrapper_live w where w.name = 'provider_credential_resolve'
       and w.signature = 'uuid, uuid, text') as resolve_exact,
    (select count(*) from wrapper_live w where w.name = 'provider_credential_revoke'
       and w.signature = 'uuid, uuid, uuid') as revoke_exact,

    -- ── E · nothing else credential-shaped exists ──────────────────────────
    (select coalesce(string_agg(u.name, ', ' order by u.name), 'none') from unexpected_wrappers u) as unexpected_list,

    -- ── F · SECURITY DEFINER on all four ───────────────────────────────────
    (select count(*) from wrapper_live w where w.security_definer) as definer_count,

    -- ── G · owner pinned to postgres ───────────────────────────────────────
    (select count(*) from wrapper_live w where w.owner_name = 'postgres') as owned_by_postgres,
    (select coalesce(string_agg(distinct w.owner_name, ', '), '<none>') from wrapper_live w) as owner_names,

    -- ── H · pinned search_path ─────────────────────────────────────────────
    (select count(*) from wrapper_live w
       where w.config::text like '%search_path=pg_catalog, vault, public%') as pinned_search_path,
    (select coalesce(string_agg(w.name || ' → ' || coalesce(w.config::text, '<unset>'), ' | ' order by w.name), '<none>')
       from wrapper_live w) as search_paths,

    -- ── I · PUBLIC cannot execute ──────────────────────────────────────────
    pg.public_execute_items,
    pg.null_acl_functions,

    -- ── J/K/L · role reachability ──────────────────────────────────────────
    er.anon_executable,
    er.authed_executable,
    er.service_executable,

    -- ── M · no plaintext credential column was added ───────────────────────
    (select count(*) from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'provider_credentials'
         and exists (select 1 from prohibited_credential_columns p where p.name = c.column_name)) as prohibited_columns,

    -- ── N/O · clean synthetic-testing baseline ─────────────────────────────
    (select count(*) from public.business_connections)  as connection_rows,
    (select count(*) from public.provider_credentials)  as credential_rows,

    -- ── P · CB-001 service_role posture unchanged (8 privileges, both tables) ─
    (select bool_and(sel and ins and upd and not del
                     and not trunc and not refs and not trig and not maint)
       from privs where role_name = 'service_role') as service_role_unchanged,

    -- ── Q · CB-001 anon / authenticated posture unchanged ──────────────────
    (select bool_and(not sel and not ins and not upd and not del
                     and not trunc and not refs and not trig and not maint)
       from privs where role_name = 'anon') as anon_unchanged,
    (select bool_and(not sel and not ins and not upd and not del
                     and not trunc and not refs and not trig and not maint)
       from privs where role_name = 'authenticated') as authed_unchanged,

    -- ── R · CB-001.2 supersession FK, by EXACT ordered mapping ─────────────
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
             = array['id', 'business_connection_id', 'credential_type']) as rotation_fk_intact,

    -- ── S · CB-001.2 rotation-unit anchor, by exact ordered columns ────────
    (select count(*) from pg_constraint c
       where c.contype = 'u'
         and c.conname = 'provider_credentials_id_rotation_unit_unique'
         and c.conrelid = 'public.provider_credentials'::regclass
         and (select array_agg(a.attname::text order by k.ord)
                from unnest(c.conkey) with ordinality k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             = array['id', 'business_connection_id', 'credential_type']) as rotation_anchor_intact,

    -- ── T/U/V · Digital Twin fact freeze ───────────────────────────────────
    (select case when to_regclass('public.business_facts') is null then -1
                 else (select count(*) from public.business_facts) end) as facts_count,
    (select case when to_regclass('public.business_fact_evidence') is null then -1
                 else (select count(*) from public.business_fact_evidence) end) as evidence_count,
    (select case when to_regclass('public.business_fact_conflicts') is null then 'absent'
                 else (select count(*)::text from public.business_fact_conflicts) end) as conflicts_observed,

    -- ── W · Vault secret / credential coherence ────────────────────────────
    -- Two independent defects, both measured:
    --   · a secret named for a credential that does not exist (orphan)
    --   · a row holding a reference to a secret that does not exist (dangling)
    (select count(*) from vault.secrets s
       where s.name like 'vision-provider-credential:%'
         and not exists (
               select 1 from public.provider_credentials c
                where 'vision-provider-credential:' || c.id::text = s.name)) as orphan_provider_secrets,
    (select count(*) from public.provider_credentials c
       where c.vault_secret_id is not null
         and not exists (select 1 from vault.secrets s where s.id = c.vault_secret_id)) as dangling_references,
    (select count(*) from vault.secrets s where s.name like 'vision-provider-credential:%') as provider_secrets_total,

    -- ── X · the Vault surface the wrappers depend on ───────────────────────
    (select case when to_regclass('vault.secrets') is not null
                  and to_regclass('vault.decrypted_secrets') is not null then 1 else 0 end) as vault_surface_present
  from public_grant pg
  cross join effective_reach er
)
select * from (
  select 'A' id, 'provider_credential_put exists with the exact signature' requirement,
         case when f.put_exact = 1 then 'exact' else 'missing or mismatched' end observed,
         'provider_credential_put(uuid, uuid, text, text, timestamp with time zone, jsonb)' expected,
         case when f.put_exact = 1 then 'PASS' else 'FAIL' end verdict from facts f
  union all select 'B', 'provider_credential_rotate exists with the exact signature',
         case when f.rotate_exact = 1 then 'exact' else 'missing or mismatched' end,
         'provider_credential_rotate(uuid, text, timestamp with time zone, jsonb)',
         case when f.rotate_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'C', 'provider_credential_resolve exists with the exact signature',
         case when f.resolve_exact = 1 then 'exact' else 'missing or mismatched' end,
         'provider_credential_resolve(uuid, uuid, text)',
         case when f.resolve_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'D', 'provider_credential_revoke exists with the exact signature',
         case when f.revoke_exact = 1 then 'exact' else 'missing or mismatched' end,
         'provider_credential_revoke(uuid, uuid, uuid)',
         case when f.revoke_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'E', 'no unexpected credential / vault function exists in public',
         'unexpected: ' || f.unexpected_list || ' | live: ' || f.live_signatures,
         'unexpected: none | the four wrappers only (' || f.expected_names || ')',
         case when f.unexpected_list = 'none' and f.exact_wrappers = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'F', 'all four wrappers are SECURITY DEFINER',
         f.definer_count::text || ' of 4', '4 of 4',
         case when f.definer_count = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'G', 'all four wrappers are owned by postgres',
         f.owned_by_postgres::text || ' of 4 (owners: ' || f.owner_names || ')', '4 of 4 (postgres)',
         case when f.owned_by_postgres = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'H', 'all four wrappers pin search_path = pg_catalog, vault, public',
         f.pinned_search_path::text || ' of 4  [' || f.search_paths || ']', '4 of 4',
         case when f.pinned_search_path = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'I', 'PUBLIC holds no EXECUTE on any wrapper (explicit proacl, not defaults)',
         'PUBLIC EXECUTE items: ' || f.public_execute_items::text || ', functions relying on default acl: ' || f.null_acl_functions::text,
         'PUBLIC EXECUTE items: 0, functions relying on default acl: 0',
         case when f.public_execute_items = 0 and f.null_acl_functions = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'J', 'anon cannot execute any wrapper (effective, via has_function_privilege)',
         f.anon_executable::text || ' of 4 executable', '0 of 4',
         case when f.anon_executable = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'K', 'authenticated cannot execute any wrapper (effective, via has_function_privilege)',
         f.authed_executable::text || ' of 4 executable', '0 of 4',
         case when f.authed_executable = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'L', 'service_role can execute exactly the four wrappers',
         f.service_executable::text || ' of 4 executable', '4 of 4',
         case when f.service_executable = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'M', 'no plaintext credential column was added to provider_credentials',
         f.prohibited_columns::text || ' prohibited column(s)', '0',
         case when f.prohibited_columns = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'N', 'business_connections empty (clean synthetic-testing baseline)',
         f.connection_rows::text, '0',
         case when f.connection_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'O', 'provider_credentials empty (clean synthetic-testing baseline)',
         f.credential_rows::text, '0',
         case when f.credential_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'P', 'CB-001 ACL posture on service_role UNCHANGED (select/insert/update only, both tables)',
         case when f.service_role_unchanged then 'select+insert+update, no delete/truncate/references/trigger/maintain'
              else 'deviated from the certified posture' end,
         'select+insert+update, no delete/truncate/references/trigger/maintain',
         case when f.service_role_unchanged then 'PASS' else 'FAIL' end from facts f
  union all select 'Q', 'CB-001 ACL posture on anon and authenticated UNCHANGED (no access)',
         case when f.anon_unchanged and f.authed_unchanged then 'both hold no privilege'
              else 'deviated from the certified posture' end,
         'both hold no privilege',
         case when f.anon_unchanged and f.authed_unchanged then 'PASS' else 'FAIL' end from facts f
  union all select 'R', 'CB-001.2 supersession FK intact (exact ordered mapping)',
         case when f.rotation_fk_intact = 1 then 'verified' else 'NOT VERIFIED' end,
         'provider_credentials_superseded_same_rotation_unit_fkey (superseded_by_credential_id, business_connection_id, credential_type) -> (id, business_connection_id, credential_type)',
         case when f.rotation_fk_intact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'S', 'CB-001.2 rotation-unit anchor intact (exact ordered columns)',
         case when f.rotation_anchor_intact = 1 then 'verified' else 'NOT VERIFIED' end,
         'provider_credentials_id_rotation_unit_unique (id, business_connection_id, credential_type)',
         case when f.rotation_anchor_intact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'T', 'Digital Twin freeze — business_facts count',
         f.facts_count::text, '0',
         case when f.facts_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'U', 'Digital Twin freeze — business_fact_evidence count',
         f.evidence_count::text, '0',
         case when f.evidence_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'V', 'business_fact_conflicts untouched',
         f.conflicts_observed, '0 (or absent)',
         case when f.conflicts_observed in ('0', 'absent') then 'PASS' else 'FAIL' end from facts f
  union all select 'W', 'Vault secret / credential coherence (no orphan, no dangling reference)',
         'orphan secrets: ' || f.orphan_provider_secrets::text
           || ', dangling references: ' || f.dangling_references::text
           || ', provider secrets live: ' || f.provider_secrets_total::text,
         'orphan secrets: 0, dangling references: 0',
         case when f.orphan_provider_secrets = 0 and f.dangling_references = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'X', 'the Vault surface the wrappers depend on is present',
         case when f.vault_surface_present = 1 then 'vault.secrets and vault.decrypted_secrets present'
              else 'MISSING' end,
         'vault.secrets and vault.decrypted_secrets present',
         case when f.vault_surface_present = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'Y', 'ROOT KEY / PRODUCTION BLOCKER — Supabase Vault root-key custody manually confirmed',
         'NOT CONFIRMED — deployment gate open',
         'MANUAL CONFIRMATION REQUIRED (cannot be closed by SQL)',
         'BLOCKER' from facts f
) report
order by id;

-- READING THE RESULT
--   Any FAIL blocks. Row Y is a BLOCKER, not a FAIL: Vault must not be declared
--   production-ready, no real provider credential may be stored, and the synthetic
--   adversarial suite is the only permitted exercise until a human closes it.
--   Do not proceed to CB-003, connect Plaid or QuickBooks, or start 6D.1C.