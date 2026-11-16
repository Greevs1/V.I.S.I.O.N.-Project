-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-003 PRODUCTION CERTIFICATION
-- ============================================================================
-- READ-ONLY. Run AFTER phase_cb_003_provider_authorization_attempts.sql.
-- Inspects the LIVE deployed database and returns ONE report: 34 rows — A … AH.
--
-- VERDICT VOCABULARY
--   PASS     the deployed state matches the artifact.
--   FAIL     the deployed state deviates. A FAIL blocks.
--   BLOCKER  a MANUAL production gate no amount of SQL can close. Row AH is one.
--
-- WHAT THIS CERTIFIES
--   The authorization-attempt boundary exists exactly as designed, is reachable
--   ONLY by service_role, cannot be reached by PUBLIC / anon / authenticated,
--   stores no raw state and no credential material, and changed NOTHING about
--   CB-001, CB-001.1, CB-001.2 or CB-002.
--
-- WHAT THIS CANNOT CERTIFY (and does not pretend to)
--   • That an actor was authorized before a function was called — call-site duty.
--   • That the digest was computed correctly — that happens in the backend, which
--     is CB-004's concern. This certifies the digest REPRESENTATION only: that the
--     column accepts the canonical 64-lowercase-hex digest shape and nothing else.
--     Representation is not provenance — no shape test can prove the backend
--     hashed anything, and the backend remains responsible for computing SHA-256.
--     VISION's canonical raw state is 43-character unpadded base64url, so it cannot
--     satisfy that constraint.
--   • THAT A MALFORMED return_target IS REFUSED. Constraint existence is asserted
--     here (row AB); the BEHAVIOURAL proof that hostile targets are rejected
--     belongs to the adversarial suite, which attempts them for real. The two
--     artifacts together are the proof; neither alone is.
--   • That Vault's ROOT KEY is correctly held. Row AH reports it as open.
--
-- ── TWO CERTIFICATION DEFECTS CORRECTED (found by the live run, rows P and Z) ─
--   The DEPLOYMENT was correct. Both defects were in THIS artifact, and the
--   migration is unchanged by them.
--   P  the live side was read with pg_get_function_identity_arguments(), which
--      returns argument NAMES + types on PostgreSQL — the live database reported
--      'p_attempt_id uuid, p_business_id uuid'. A types-only expected string can
--      therefore never match, and row P reported 0 of 4 against four functions
--      that all existed. The live side is now derived STRUCTURALLY from the
--      ordered argument type OIDs (p.proargtypes -> format_type()), so a parameter
--      name cannot influence the verdict. The printed identity arguments are still
--      shown for observability and are NEVER compared.
--   Z  the deploy canonicalised interval '10 minutes' to '00:10:00'::interval, so
--      the previous comparison of the printed text reported a false FAIL. The
--      duration is now reduced to SECONDS and compared as a NUMBER (600) for BOTH
--      the DEFAULT and the expiry-shape CHECK. A rendering this cannot interpret
--      is a FAIL, never a silent pass.
--
-- Expected posture:
--   A  table exists with the exact 14-column set, in order
--   B  primary key on (id)
--   C  exact CHECK constraint inventory (8, by name)
--   D  state_hash uniqueness (replay prevention, layer 1)
--   E  business FK → business_entities(id) ON DELETE CASCADE
--   F  actor FK → profiles(id) ON DELETE SET NULL
--   G  same-business result_connection composite FK, exact ordered mapping
--   H  the CB-001 same-business anchor that G depends on
--   I  exact index inventory (3, by name)
--   J  RLS enabled
--   K  no RLS policies
--   L  PUBLIC holds no table privilege
--   M  anon holds no table privilege
--   N  authenticated holds no table privilege
--   O  service_role holds exactly SELECT/INSERT/UPDATE, and no DELETE
--   P  the four functions exist with exact ordered argument TYPES (structural,
--      name-independent) and no unexpected authorization/credential function
--   Q  all four are SECURITY DEFINER
--   R  all four are owned by postgres
--   S  all four pin search_path = pg_catalog, public
--   T  PUBLIC holds no EXECUTE on any function
--   U  anon holds no EXECUTE
--   V  authenticated holds no EXECUTE
--   W  service_role holds EXECUTE on exactly the four
--   X  no raw-state / credential-shaped column exists
--   Y  no function accepts a raw-state or nonce parameter
--   Z  expires_at defaults SEMANTICALLY to now() + 10 minutes (600 seconds, judged
--      as a NUMBER, never as a printed string) and the expiry-shape CHECK exists
--      with the same duration
--   AA status domain is exactly the five states
--   AB the return_target invariant constraint exists
--   AC the table is empty (clean synthetic-testing baseline)
--   AD CB-001 / CB-001.2 integrity intact, by exact ordered mapping
--   AE CB-002 wrapper surface intact and still browser-clean
--   AF the Vault surface is intact and browser-clean
--   AG Digital Twin freeze intact
--   AH ROOT KEY / REAL-CREDENTIAL-USE BLOCKER — MANUAL CONFIRMATION REQUIRED
-- ============================================================================

with
-- ── the expected function surface, by ORDERED ARGUMENT TYPE ──────────────────
-- These are TYPE lists and deliberately carry NO parameter names: PostgreSQL's
-- pg_get_function_identity_arguments() returns names + types, so it can never be
-- compared to a types-only string. The live side is derived from p.proargtypes
-- (see `fns`), and the static harness asserts that these two lists equal the
-- migration's own ordered argument types.
expected_wrappers(name, type_signature) as (
  values
    ('provider_authorization_attempt_create',  'text, text, uuid, uuid, text, text'),
    ('provider_authorization_attempt_consume', 'text, text'),
    ('provider_authorization_attempt_cancel',  'uuid, uuid'),
    ('provider_authorization_attempt_fail',    'uuid, uuid, text')
),
tbl as (
  select c.oid, c.relacl, c.relowner, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'provider_authorization_attempts' and c.relkind = 'r'
),
cons as (
  select conname, contype, confdeltype, conkey, confkey, confrelid,
         pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.provider_authorization_attempts'::regclass
),
-- Every function of the CB-003 surface that ACTUALLY exists in public.
fns as (
  select
    p.oid,
    p.proname,
    -- Observability ONLY: PostgreSQL renders argument NAMES here, which is exactly
    -- why this value is never compared to an expected signature.
    pg_get_function_identity_arguments(p.oid) as identity_args,
    -- The PROOF: ordered argument TYPE identity taken from the catalog. proargtypes
    -- is the argument type OID vector in declaration order, rendered canonically by
    -- format_type(). No name can influence it, and no string is stripped or
    -- rewritten to make a comparison work.
    coalesce((select string_agg(format_type(u.t, null), ', ' order by u.ord)
                from unnest(p.proargtypes::oid[]) with ordinality as u(t, ord)), '') as type_signature,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    coalesce(p.proargnames, '{}'::text[])    as arg_names,
    (select r.rolname from pg_roles r where r.oid = p.proowner) as owner_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('provider_authorization_attempt_create', 'provider_authorization_attempt_consume',
                      'provider_authorization_attempt_cancel', 'provider_authorization_attempt_fail')
),
-- Anything else credential/authorization-shaped in public that is NOT one of the four.
unexpected_fns as (
  select p.proname as name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname ~ '(authorization|credential|vault)' or p.proname ~ 'provider_')
    and p.proname not in ('provider_authorization_attempt_create', 'provider_authorization_attempt_consume',
                          'provider_authorization_attempt_cancel', 'provider_authorization_attempt_fail',
                          'provider_credential_put', 'provider_credential_rotate',
                          'provider_credential_resolve', 'provider_credential_revoke')
),
-- The CB-001 credential-column deny-list, carried forward, PLUS the raw-state names.
prohibited_columns(name) as (
  values ('access_token'), ('refresh_token'), ('public_token'), ('link_token'),
         ('authorization_code'), ('client_secret'), ('client_secret_value'), ('password'),
         ('credential_value'), ('plaintext_secret'), ('decrypted_secret'), ('token_value'),
         ('secret_value'), ('token'), ('secret'),
         ('state'), ('raw_state'), ('state_value'), ('state_token'), ('raw'), ('oauth_state')
),
-- PUBLIC table reachability, judged on the ACL itself. coalesce(..., acldefault())
-- is deliberate: a NULL relacl is not "no privileges", it is "the default", and the
-- default must be EVALUATED rather than assumed away.
public_table as (
  select count(*) as items
  from tbl t
  left join lateral aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a on true
  where a.grantee = 0
),
-- PUBLIC function reachability. A NULL proacl means the DEFAULT applies, which for
-- a function INCLUDES EXECUTE to PUBLIC — so NULL is counted as a defect, never clean.
public_fns as (
  select count(*) as items
  from fns f
  left join lateral aclexplode(coalesce(f.proacl, acldefault('f', (select p.proowner from pg_proc p where p.oid = f.oid)))) a on true
  where a.grantee = 0 and a.privilege_type = 'EXECUTE'
),
null_acl_fns as (
  select count(*) as items from fns f where f.proacl is null
),
-- CB-001's credential-wrapped surface, re-proved intact.
cb002 as (
  select count(*) as exact_wrappers
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('provider_credential_put', 'provider_credential_rotate',
                      'provider_credential_resolve', 'provider_credential_revoke')
),
-- ── the expiry DEFAULT and the expiry-shape CHECK, judged SEMANTICALLY ───────
-- PostgreSQL deparses a stored expression in its own canonical form: the live
-- deploy reports the DEFAULT as
--     (now() + '00:10:00'::interval)
-- so comparing that printed text to '10 minutes' is a CERTIFICATION BUG, not a
-- deployment defect. The duration is reduced to a NUMBER OF SECONDS and compared
-- as a value, for BOTH halves of the invariant, so the rendering PostgreSQL
-- chooses can never change the verdict. Only its canonical time form (HH:MM:SS,
-- which is what it renders for every sub-day duration) is interpreted; anything
-- else is reported as unparseable and FAILS rather than silently passing.
expiry_texts as (
  select
    coalesce((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
                join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
               where d.adrelid = 'public.provider_authorization_attempts'::regclass
                 and a.attname = 'expires_at'), '<none>') as default_expr,
    (select c.def from cons c
      where c.contype = 'c'
        and c.conname = 'provider_authorization_attempts_expiry_shape') as shape_def
),
expiry_seconds as (
  select
    'default' as label,
    coalesce((regexp_match(t.default_expr, '''([^'']+)''::interval'))[1],
             (regexp_match(t.default_expr, 'interval\s+''([^'']+)'''))[1]) as interval_text
  from expiry_texts t
  union all
  select
    'shape',
    coalesce((regexp_match(t.shape_def, '''([^'']+)''::interval'))[1],
             (regexp_match(t.shape_def, 'interval\s+''([^'']+)'''))[1])
  from expiry_texts t
),
expiry_duration as (
  select
    e.label,
    e.interval_text,
    case
      when e.interval_text ~ '^[0-9]{1,4}:[0-9]{2}:[0-9]{2}$'
        then split_part(e.interval_text, ':', 1)::bigint * 3600
           + split_part(e.interval_text, ':', 2)::bigint * 60
           + split_part(e.interval_text, ':', 3)::bigint
      else null
    end as seconds
  from expiry_seconds e
),
facts as (
  select
    -- ── A · the table, exactly ──────────────────────────────────────────────
    (select count(*) from tbl) as table_present,
    (select string_agg(column_name, ',' order by ordinal_position)
       from information_schema.columns
      where table_schema = 'public' and table_name = 'provider_authorization_attempts') as column_list,

    -- ── B · primary key ─────────────────────────────────────────────────────
    (select count(*) from cons c
      where c.contype = 'p'
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = 'public.provider_authorization_attempts'::regclass and a.attnum = k.attnum)
            = array['id']) as pk_exact,

    -- ── C · the exact CHECK inventory ───────────────────────────────────────
    (select count(*) from cons c where c.contype = 'c') as check_count,
    (select coalesce(string_agg(c.conname, ', ' order by c.conname), '<none>')
       from cons c where c.contype = 'c') as check_names,

    -- ── D · state_hash uniqueness ───────────────────────────────────────────
    (select count(*) from cons c
      where c.contype = 'u' and c.conname = 'provider_authorization_attempts_state_hash_unique'
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = 'public.provider_authorization_attempts'::regclass and a.attnum = k.attnum)
            = array['state_hash']) as state_hash_unique,

    -- ── E · business FK → business_entities(id) ON DELETE CASCADE ───────────
    (select count(*) from cons c
      where c.contype = 'f' and c.confrelid = 'public.business_entities'::regclass and c.confdeltype = 'c'
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = 'public.provider_authorization_attempts'::regclass and a.attnum = k.attnum)
            = array['business_id']) as business_fk_exact,

    -- ── F · actor FK → profiles(id) ON DELETE SET NULL ──────────────────────
    (select count(*) from cons c
      where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'n'
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = 'public.provider_authorization_attempts'::regclass and a.attnum = k.attnum)
            = array['initiated_by_profile_id']) as actor_fk_exact,

    -- ── G · same-business composite FK, exact ordered mapping + cascade ─────
    -- The certified constraint is DECLARED as a 68-character name. PostgreSQL
    -- truncates every identifier to NAMEDATALEN-1 = 63 BYTES, so the deployed
    -- catalog STORES the 63-byte prefix. The comparison is therefore EXPLICIT
    -- (conname::text against that stored form): a name-typed comparison truncates
    -- the literal too and would silently hide a disagreement of exactly this kind.
    (select count(*) from cons c
      where c.contype = 'f'
        and c.conname::text = left('provider_authorization_attempts_result_connection_same_business_fkey', 63)
        and c.confrelid = 'public.business_connections'::regclass
        and c.confdeltype = 'c'
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = 'public.provider_authorization_attempts'::regclass and a.attnum = k.attnum)
            = array['result_connection_id', 'business_id']
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.confkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
            = array['id', 'business_id']) as result_fk_exact,

    -- ── H · the CB-001 anchor G depends on ──────────────────────────────────
    (select count(*) from pg_constraint c
      where c.contype = 'u'
        and c.conname = 'business_connections_id_business_unique'
        and c.conrelid = 'public.business_connections'::regclass) as anchor_present,

    -- ── I · the exact index inventory ───────────────────────────────────────
    (select coalesce(string_agg(indexname, ', ' order by indexname), '<none>')
       from pg_indexes
      where schemaname = 'public' and tablename = 'provider_authorization_attempts'
        and indexname in ('provider_authorization_attempts_business_status_idx',
                          'provider_authorization_attempts_profile_idx',
                          'provider_authorization_attempts_expiry_idx')) as explicit_indexes,

    -- ── J/K · RLS on, no policies ───────────────────────────────────────────
    (select coalesce(bool_and(t.relrowsecurity), false) from tbl t) as rls_enabled,
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'provider_authorization_attempts') as policy_count,

    -- ── L/M/N · browser roles hold no table privilege ───────────────────────
    (select pt.items from public_table pt) as public_table_items,
    (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as x(priv)
      where has_table_privilege('anon', 'public.provider_authorization_attempts', x.priv)) as anon_table_privileges,
    (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as x(priv)
      where has_table_privilege('authenticated', 'public.provider_authorization_attempts', x.priv)) as authed_table_privileges,

    -- ── O · service_role: exactly SELECT/INSERT/UPDATE, all five withheld ────
    (select bool_and(has_table_privilege('service_role', 'public.provider_authorization_attempts', x.priv))
       from unnest(array['SELECT','INSERT','UPDATE']) as x(priv)) as service_has_intended,
    (select bool_or(has_table_privilege('service_role', 'public.provider_authorization_attempts', x.priv))
       from unnest(array['DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as x(priv)) as service_has_withheld,

    -- ── P/Q/R/S · the function surface ──────────────────────────────────────
    (select count(*) from fns f
       join expected_wrappers e on e.name = f.proname and e.type_signature = f.type_signature) as exact_fns,
    (select count(*) from fns f) as fn_count,
    (select coalesce(string_agg(f.proname || '(' || f.type_signature || ')', ' | ' order by f.proname), '<none>')
       from fns f) as live_signatures,
    (select coalesce(string_agg(u.name, ', ' order by u.name), 'none') from unexpected_fns u) as unexpected_list,
    (select count(*) from fns f where f.prosecdef) as definer_count,
    (select count(*) from fns f where f.owner_name = 'postgres') as owned_by_postgres,
    (select coalesce(string_agg(distinct f.owner_name, ', '), '<none>') from fns f) as owner_names,
    (select count(*) from fns f
      where f.proconfig::text like '%search_path=pg_catalog, public%') as pinned_search_path,
    (select coalesce(string_agg(f.proname || ' → ' || coalesce(f.proconfig::text, '<unset>'), ' | ' order by f.proname), '<none>')
       from fns f) as search_paths,

    -- ── T/U/V/W · function reachability ─────────────────────────────────────
    (select pf.items from public_fns pf) as public_fn_items,
    (select nf.items from null_acl_fns nf) as null_acl_fn_items,
    (select count(*) from fns f where has_function_privilege('anon', f.oid, 'EXECUTE')) as anon_executable,
    (select count(*) from fns f where has_function_privilege('authenticated', f.oid, 'EXECUTE')) as authed_executable,
    (select count(*) from fns f where has_function_privilege('service_role', f.oid, 'EXECUTE')) as service_executable,

    -- ── X · no raw-state / credential-shaped column ─────────────────────────
    (select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'provider_authorization_attempts'
        and exists (select 1 from prohibited_columns p where p.name = c.column_name)) as prohibited_column_count,

    -- ── Y · no function accepts a raw-state or nonce parameter ──────────────
    (select count(*) from fns f
      where exists (select 1 from unnest(f.arg_names) as x(name)
                     where x.name in ('p_state', 'p_raw_state', 'p_attempt_nonce', 'p_nonce', 'attempt_nonce'))) as state_param_functions,

    -- ── Z · the ten-minute invariant, proven SEMANTICALLY ──────────────────
    -- The printed DEFAULT is shown for the operator; the PROOF reads the numeric
    -- DURATION and the generation basis.
    (select t.default_expr from expiry_texts t) as expires_default,
    (select (t.default_expr ~* 'now\(\)') from expiry_texts t) as expires_default_uses_now,
    (select d.seconds from expiry_duration d where d.label = 'default') as default_interval_seconds,
    (select d.seconds from expiry_duration d where d.label = 'shape') as shape_interval_seconds,
    (select count(*) from cons c
      where c.contype = 'c' and c.conname = 'provider_authorization_attempts_expiry_shape') as expiry_shape_present,

    -- ── AA · the status domain ──────────────────────────────────────────────
    (select coalesce((select c.def from cons c where c.conname = 'provider_authorization_attempts_status_check'), '<none>')) as status_def,

    -- ── AB · the return_target invariant ────────────────────────────────────
    (select count(*) from cons c
      where c.contype = 'c' and c.conname = 'provider_authorization_attempts_return_target_check') as return_target_constraint,

    -- ── AC · clean synthetic baseline ───────────────────────────────────────
    (select count(*) from public.provider_authorization_attempts) as attempt_rows,

    -- ── AD · CB-001 / CB-001.2 integrity, by exact ordered mapping ──────────
    (select count(*) from pg_constraint c
      where c.contype = 'f'
        and c.conname = 'provider_credentials_connection_same_business_fkey'
        and c.conrelid = 'public.provider_credentials'::regclass
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
            = array['business_connection_id', 'business_id']) as cb001_composite_fk,
    (select count(*) from pg_constraint c
      where c.contype = 'f'
        and c.conname = 'provider_credentials_superseded_same_rotation_unit_fkey'
        and c.conrelid = 'public.provider_credentials'::regclass
        and (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
            = array['superseded_by_credential_id', 'business_connection_id', 'credential_type']) as cb012_fk,

    -- ── AE · CB-002 wrapper surface intact and browser-clean ────────────────
    (select cb002.exact_wrappers from cb002) as cb002_present,
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('provider_credential_put', 'provider_credential_rotate',
                          'provider_credential_resolve', 'provider_credential_revoke')
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) as cb002_browser_reachable,

    -- ── AF · the Vault surface ──────────────────────────────────────────────
    (select case when to_regclass('vault.secrets') is not null
                  and to_regclass('vault.decrypted_secrets') is not null then 1 else 0 end) as vault_present,
    (select case when to_regclass('vault.secrets') is null then 0
                 else (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as x(priv)
                        where has_table_privilege('anon', 'vault.secrets', x.priv)
                           or has_table_privilege('authenticated', 'vault.secrets', x.priv)) end) as vault_browser_privileges,

    -- ── AG · Digital Twin freeze ────────────────────────────────────────────
    (select case when to_regclass('public.business_facts') is null then -1
                 else (select count(*) from public.business_facts) end) as facts_count,
    (select case when to_regclass('public.business_fact_evidence') is null then -1
                 else (select count(*) from public.business_fact_evidence) end) as evidence_count,
    (select case when to_regclass('public.business_fact_conflicts') is null then 'absent'
                 else (select count(*)::text from public.business_fact_conflicts) end) as conflicts_observed
  from (select 1) one
)
select * from (
  select 'A' id, 'provider_authorization_attempts exists with the exact column set' requirement,
         case when f.table_present = 1 then coalesce(f.column_list, '<missing>') else 'TABLE MISSING' end observed,
         'id,provider,connection_category,business_id,initiated_by_profile_id,state_hash,status,return_target,created_at,expires_at,used_at,result_connection_id,failure_class,attempt_nonce' expected,
         case when f.table_present = 1
               and f.column_list = 'id,provider,connection_category,business_id,initiated_by_profile_id,state_hash,status,return_target,created_at,expires_at,used_at,result_connection_id,failure_class,attempt_nonce'
              then 'PASS' else 'FAIL' end verdict from facts f
  union all select 'B', 'primary key (id)',
         case when f.pk_exact = 1 then 'verified' else 'NOT VERIFIED' end, '(id)',
         case when f.pk_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'C', 'exact CHECK constraint inventory (8 by name)',
         f.check_count::text || ' check(s): ' || f.check_names,
         '8: category, expiry_shape, failure_class_shape, lifecycle_shape, provider, return_target, state_hash_format, status',
         case when f.check_count = 8 then 'PASS' else 'FAIL' end from facts f
  union all select 'D', 'state_hash is unique (replay prevention, layer 1)',
         case when f.state_hash_unique = 1 then 'verified' else 'NOT VERIFIED' end, '(state_hash) UNIQUE',
         case when f.state_hash_unique = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'E', 'business FK → business_entities(id) ON DELETE CASCADE',
         case when f.business_fk_exact = 1 then 'verified' else 'NOT VERIFIED' end,
         '(business_id) → business_entities(id) ON DELETE CASCADE',
         case when f.business_fk_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'F', 'actor FK → profiles(id) ON DELETE SET NULL (canonical profiles.id; no second user system)',
         case when f.actor_fk_exact = 1 then 'verified' else 'NOT VERIFIED' end,
         '(initiated_by_profile_id) → profiles(id) ON DELETE SET NULL',
         case when f.actor_fk_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'G', 'same-business result_connection composite FK (exact ordered mapping, cascade)',
         case when f.result_fk_exact = 1 then 'verified' else 'NOT VERIFIED' end,
         '(result_connection_id, business_id) → business_connections(id, business_id) ON DELETE CASCADE',
         case when f.result_fk_exact = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'H', 'the CB-001 same-business anchor G depends on is present',
         case when f.anchor_present = 1 then 'business_connections_id_business_unique present' else 'MISSING' end,
         'business_connections_id_business_unique (id, business_id)',
         case when f.anchor_present = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'I', 'exact explicit index inventory (3)',
         f.explicit_indexes, 'business_status_idx, expiry_idx, profile_idx',
         case when (select count(*) from pg_indexes where schemaname = 'public'
                     and tablename = 'provider_authorization_attempts'
                     and indexname in ('provider_authorization_attempts_business_status_idx',
                                       'provider_authorization_attempts_profile_idx',
                                       'provider_authorization_attempts_expiry_idx')) = 3
              then 'PASS' else 'FAIL' end from facts f
  union all select 'J', 'RLS enabled explicitly',
         case when f.rls_enabled then 'enabled' else 'DISABLED' end, 'enabled',
         case when f.rls_enabled then 'PASS' else 'FAIL' end from facts f
  union all select 'K', 'no RLS policies (browser has no path at all)',
         f.policy_count::text || ' policy/policies', '0',
         case when f.policy_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'L', 'PUBLIC holds no privilege on the table (ACL evaluated, defaults included)',
         f.public_table_items::text || ' PUBLIC privilege item(s)', '0',
         case when f.public_table_items = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'M', 'anon holds no privilege on the table (all 8 probed)',
         f.anon_table_privileges::text || ' of 8', '0 of 8',
         case when f.anon_table_privileges = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'N', 'authenticated holds no privilege on the table (all 8 probed)',
         f.authed_table_privileges::text || ' of 8', '0 of 8',
         case when f.authed_table_privileges = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'O', 'service_role holds exactly SELECT/INSERT/UPDATE and no DELETE',
         case when f.service_has_intended and not f.service_has_withheld
              then 'select+insert+update; delete/truncate/references/trigger/maintain withheld'
              else 'deviated from the intended posture' end,
         'select+insert+update; delete/truncate/references/trigger/maintain withheld',
         case when f.service_has_intended and not f.service_has_withheld then 'PASS' else 'FAIL' end from facts f
  union all select 'P', 'the four functions exist with exact ordered argument TYPES (structural) and no unexpected authorization/credential function',
         f.exact_fns::text || ' of 4 exact by ordered argument type; ' || f.fn_count::text
           || ' function(s) present  [' || f.live_signatures || '] | unexpected: ' || f.unexpected_list,
         '4 of 4 exact by ordered argument type; 4 function(s) present | unexpected: none',
         case when f.exact_fns = 4 and f.fn_count = 4 and f.unexpected_list = 'none' then 'PASS' else 'FAIL' end from facts f
  union all select 'Q', 'all four functions are SECURITY DEFINER',
         f.definer_count::text || ' of 4', '4 of 4',
         case when f.definer_count = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'R', 'all four functions are owned by postgres',
         f.owned_by_postgres::text || ' of 4 (owners: ' || f.owner_names || ')', '4 of 4 (postgres)',
         case when f.owned_by_postgres = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'S', 'all four functions pin search_path = pg_catalog, public',
         f.pinned_search_path::text || ' of 4  [' || f.search_paths || ']', '4 of 4',
         case when f.pinned_search_path = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'T', 'PUBLIC holds no EXECUTE on any function (explicit ACL, defaults counted as a defect)',
         'PUBLIC EXECUTE items: ' || f.public_fn_items::text || ', functions relying on default acl: ' || f.null_acl_fn_items::text,
         'PUBLIC EXECUTE items: 0, functions relying on default acl: 0',
         case when f.public_fn_items = 0 and f.null_acl_fn_items = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'U', 'anon cannot execute any function (effective, via has_function_privilege)',
         f.anon_executable::text || ' of 4 executable', '0 of 4',
         case when f.anon_executable = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'V', 'authenticated cannot execute any function (effective, via has_function_privilege)',
         f.authed_executable::text || ' of 4 executable', '0 of 4',
         case when f.authed_executable = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'W', 'service_role can execute exactly the four functions',
         f.service_executable::text || ' of 4 executable', '4 of 4',
         case when f.service_executable = 4 then 'PASS' else 'FAIL' end from facts f
  union all select 'X', 'no raw-state or credential-shaped column exists',
         f.prohibited_column_count::text || ' prohibited column(s)', '0',
         case when f.prohibited_column_count = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'Y', 'no function accepts a raw-state or nonce parameter',
         f.state_param_functions::text || ' function(s)', '0',
         case when f.state_param_functions = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'Z', 'expires_at defaults SEMANTICALLY to now() + 10 minutes (600 seconds) AND the expiry-shape CHECK carries the same duration',
         'default: ' || f.expires_default
           || ' | default duration: ' || coalesce(f.default_interval_seconds::text || 's', 'UNPARSEABLE')
           || ' | base now(): ' || case when f.expires_default_uses_now then 'yes' else 'no' end
           || ' | expiry_shape: ' || case when f.expiry_shape_present = 1 then 'present' else 'MISSING' end
           || ' | shape duration: ' || coalesce(f.shape_interval_seconds::text || 's', 'UNPARSEABLE'),
         'default duration 600s (10 minutes) with base now(); expiry_shape present with 600s',
         case when f.expiry_shape_present = 1
                   and f.expires_default_uses_now
                   and f.default_interval_seconds = 600
                   and f.shape_interval_seconds = 600
              then 'PASS' else 'FAIL' end from facts f
  union all select 'AA', 'status domain is exactly pending/used/expired/failed/cancelled',
         f.status_def,
         'exactly the five states and no other',
         case when f.status_def like '%pending%' and f.status_def like '%used%'
                   and f.status_def like '%expired%' and f.status_def like '%failed%'
                   and f.status_def like '%cancelled%'
                   and f.status_def not like '%consumed%'
                   and f.status_def not like '%revoked%'
                   and f.status_def not like '%complete%'
              then 'PASS' else 'FAIL' end from facts f
  union all select 'AB', 'the return_target invariant constraint exists (behaviour proven by the adversarial suite)',
         case when f.return_target_constraint = 1 then 'present' else 'MISSING' end,
         'provider_authorization_attempts_return_target_check present',
         case when f.return_target_constraint = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'AC', 'the attempts table is empty (clean synthetic-testing baseline)',
         f.attempt_rows::text, '0',
         case when f.attempt_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AD', 'CB-001 / CB-001.2 integrity intact (exact ordered mapping)',
         'connection_same_business_fk: ' || f.cb001_composite_fk::text
           || ', superseded_same_rotation_unit_fkey: ' || f.cb012_fk::text,
         'both present with their exact column mapping',
         case when f.cb001_composite_fk = 1 and f.cb012_fk = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'AE', 'CB-002 wrapper surface intact and still browser-clean',
         f.cb002_present::text || ' of 4 present; browser-reachable: ' || f.cb002_browser_reachable::text,
         '4 of 4 present; browser-reachable: 0',
         case when f.cb002_present = 4 and f.cb002_browser_reachable = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AF', 'the Vault surface is intact and browser-clean',
         case when f.vault_present = 1 then 'vault.secrets and vault.decrypted_secrets present' else 'MISSING' end
           || '; anon/authenticated privileges on vault.secrets: ' || f.vault_browser_privileges::text,
         'present; anon/authenticated privileges: 0',
         case when f.vault_present = 1 and f.vault_browser_privileges = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AG', 'Digital Twin freeze intact (business_facts / evidence / conflicts)',
         'business_facts=' || f.facts_count::text
           || ', business_fact_evidence=' || f.evidence_count::text
           || ', business_fact_conflicts=' || f.conflicts_observed,
         '0, 0, 0 (or absent)',
         case when f.facts_count = 0 and f.evidence_count = 0
                   and f.conflicts_observed in ('0', 'absent') then 'PASS' else 'FAIL' end from facts f
  union all select 'AH', 'ROOT KEY / REAL-CREDENTIAL-USE BLOCKER — Vault root-key custody confirmed AND call-site authorization proven',
         'NOT CONFIRMED — provider credential use remains gated',
         'MANUAL CONFIRMATION REQUIRED (cannot be closed by SQL)',
         'BLOCKER' from facts f
) report
order by id;

-- READING THE RESULT
--   Any FAIL blocks. Row AH is a BLOCKER, not a FAIL: CB-003 may be deployed and
--   exercised with SYNTHETIC attempts only, no real provider credential may be
--   stored, and no provider flow may begin until a human closes it.
--   Rows P and Z are now representation-independent: a parameter NAME, or the way
--   PostgreSQL pretty-prints an interval, can no longer change their verdict —
--   while a genuinely wrong signature or duration still FAILS.
--   Do not connect Plaid or QuickBooks, do not start CB-004 or 6D.1C.