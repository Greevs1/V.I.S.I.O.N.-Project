-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002.1 CERTIFICATION — CREDENTIAL ROTATION LIFECYCLE HARDENING
-- ============================================================================
-- READ-ONLY. Returns ONE deterministic PASS / FAIL / BLOCKER grid (rows A–AD).
--
-- WHAT THIS CERTIFIES
--   That the DEPLOYED provider_credential_rotate enforces the active-only
--   predecessor rule, that its privilege/hardening posture is intact, and that
--   nothing it was certified against in CB-001, CB-001.1, CB-001.2, CB-002 and
--   CB-003 was disturbed by this phase.
--
-- STRUCTURE FIRST, NAMES SECOND
--   Every constraint is identified by its STRUCTURE — the ordered column arrays
--   of its key — and only then reported by name. PostgreSQL truncates every
--   identifier to 63 bytes, so a name is a display value here, never the proof.
--   (The CB-001.2 names in this phase are 55 and 44 bytes and are not truncated;
--   the discipline is applied regardless, because it is the discipline that made
--   the CB-003 identity defect visible.)
--
-- WHAT THIS CANNOT PROVE
--   A read-only artifact cannot prove BEHAVIOUR. The gate's behaviour — that a
--   pending, rotating, expired, error, revoked or superseded predecessor is
--   refused with 42501 and that nothing else changed — is proved by
--   phase_cb_002_1_rotation_lifecycle_hardening_adversarial.sql. What is proved
--   HERE is the predicate's form, its ORDER relative to Vault, and the complete
--   classification of the deployed status vocabulary.
--
-- WHY THE STATUS VOCABULARY IS CLASSIFIED, NOT JUST COUNTED
--   Row L reads the deployed CHECK constraint's values from the catalog and
--   requires every one of them to be classified by this artifact's own table,
--   with exactly one — `active` — marked rotatable. A future vocabulary change
--   therefore cannot silently widen the gate: an unclassified value fails row L,
--   and a second rotatable value fails it too.
--
-- EXPECTED RESULT ON A CORRECT DEPLOYMENT WITH AN EMPTY CREDENTIAL LEDGER
--   29 PASS, 0 FAIL, 1 BLOCKER (row AD — a real-credential/provider gate that
--   SQL cannot close). A non-empty baseline turns row AB into a second BLOCKER.
-- ============================================================================

with
  -- ── the function under certification, matched by exact identity ────────────
  fn_oid as (
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'provider_credential_rotate'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, text, timestamp with time zone, jsonb'
  ),

  -- ── its body, as the catalog stores it ────────────────────────────────────
  body as (
    select coalesce(
      (select p.prosrc from pg_proc p where p.oid = (select oid from fn_oid)),
      '') as src
  ),

  -- ── the EXECUTABLE body only: `--` comments are removed first, so a prose
  --    mention of a call can never be mistaken for the call (or for a rule). ──
  exec_body as (
    select regexp_replace(b.src, '--[^\n]*', '', 'g') as src from body b
  ),

  -- ── the deployed status vocabulary, read from the CHECK constraint ────────
  status_def as (
    select pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid = 'public.provider_credentials'::regclass
      and c.conname::text = 'provider_credentials_status_check'
  ),
  deployed_status as (
    select m[1] as status
    from status_def sd, regexp_matches(sd.def, '''([a-z_]+)''::text', 'g') m
  ),

  -- ── THIS ARTIFACT'S classification. Every deployed value must appear here;
  --    exactly one may be rotatable. ─────────────────────────────────────────
  classification(status, rotatable) as (
    values
      ('pending',    false),
      ('active',     true),
      ('rotating',   false),
      ('superseded', false),
      ('revoked',    false),
      ('expired',    false),
      ('error',      false)
  ),

  -- ── the sibling wrappers, which this phase must not have touched ──────────
  put_fn as (
    select p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provider_credential_put'
  ),
  resolve_fn as (
    select p.oid,
           p.prosrc,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           pg_get_function_arguments(p.oid)          as full_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provider_credential_resolve'
  ),

  -- ── CB-001.2 / CB-001 structures, identified by ORDERED COLUMN ARRAYS ─────
  fk_rotation_unit as (
    select c.conname::text as name
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.provider_credentials'::regclass
      and c.confrelid = 'public.provider_credentials'::regclass
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['superseded_by_credential_id','business_connection_id','credential_type']
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.confkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
          = array['id','business_connection_id','credential_type']
  ),
  fk_same_business as (
    select c.conname::text as name
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.provider_credentials'::regclass
      and c.confrelid = 'public.provider_credentials'::regclass
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['superseded_by_credential_id','business_id']
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.confkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
          = array['id','business_id']
  ),
  fk_conn_same_business as (
    select c.conname::text as name
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.provider_credentials'::regclass
      and c.confrelid = 'public.business_connections'::regclass
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['business_connection_id','business_id']
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.confkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
          = array['id','business_id']
  ),
  rotation_unit_anchor as (
    select c.conname::text as name
    from pg_constraint c
    where c.contype = 'u'
      and c.conrelid = 'public.provider_credentials'::regclass
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(c.conkey) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
          = array['id','business_connection_id','credential_type']
  ),
  one_active as (
    select i.indexrelid::regclass::text as name
    from pg_index i
    where i.indrelid = 'public.provider_credentials'::regclass
      and i.indisunique
      and i.indpred is not null
      and pg_get_expr(i.indpred, i.indrelid) ilike '%status%active%'
      and (select array_agg(a.attname::text order by k.ord)
             from unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)
          = array['business_connection_id','credential_type']
  ),

  -- ── every fact this grid reports, as one row ─────────────────────────────
  facts as (
    select
      -- A–D · identity, hardening, ownership, search_path
      (select count(*) from fn_oid)                                                     as fn_count,
      (select pg_get_function_identity_arguments(f.oid) from fn_oid f)                  as fn_args,
      coalesce((select p.prosecdef from pg_proc p where p.oid = (select oid from fn_oid)), false)                      as fn_security_definer,
      (select pg_get_userbyid(p.proowner) from pg_proc p where p.oid = (select oid from fn_oid))                       as fn_owner,
      coalesce((select p.proconfig::text like '%pg_catalog, vault, public%'
                  from pg_proc p where p.oid = (select oid from fn_oid)), false)                                     as fn_search_path_ok,

      -- E–H · executable capability
      (select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = (select oid from fn_oid)
          and a.grantee = 0 and a.privilege_type = 'EXECUTE')                            as public_exec_grants,
      coalesce((select has_function_privilege('anon', f.oid, 'EXECUTE') from fn_oid f), false)          as anon_can_execute,
      coalesce((select has_function_privilege('authenticated', f.oid, 'EXECUTE') from fn_oid f), false) as authenticated_can_execute,
      coalesce((select has_function_privilege('service_role', f.oid, 'EXECUTE') from fn_oid f), false)  as service_role_can_execute,

      -- I–K · the predicate: form, absence of a membership test, and ORDER
      (select count(*) from exec_body b,
              regexp_matches(b.src, 'v_pred_status\s*(?:<>|is\s+distinct\s+from)\s*''active''', 'gi') m) as gate_forms,
      (select position('v_pred_status in' in lower(b.src))     from exec_body b)        as blacklist_in_pos,
      (select position('v_pred_status not in' in lower(b.src)) from exec_body b)        as blacklist_notin_pos,
      (select greatest((select position('<> ''active''' in b.src) from exec_body b),
                       (select position('is distinct from ''active''' in b.src) from exec_body b))     as gate_pos,
      (select position('vault.create_secret' in lower(b.src))  from exec_body b)        as vault_pos,
      (select position('delete from vault.secrets' in lower(b.src)) from exec_body b)   as vault_delete_pos,

      -- L · the deployed vocabulary and its complete classification
      (select sd.def from status_def sd)                                                as status_check_def,
      (select count(*) from status_def sd,
              regexp_matches(sd.def, '''([a-z_]+)''::text', 'g') m)                     as status_count,
      coalesce((select (array(select m[1] from status_def sd,
                                regexp_matches(sd.def, '''([a-z_]+)''::text', 'g') m order by 1)
                         = array['active','error','expired','pending','revoked','rotating','superseded'])), false) as status_vocab_exact,
      (select count(*) from classification)                                             as class_total,
      (select count(*) from classification where rotatable)                             as class_rotatable_count,
      coalesce((select bool_and(rotatable = (status = 'active')) from classification), false) as class_active_only,
      (select count(*) from classification c
        where not exists (select 1 from deployed_status d where d.status = c.status))   as class_unmatched,
      (select count(*) from deployed_status d
        where not exists (select 1 from classification c where c.status = d.status))    as class_undeclared,

      -- M–R · each non-active state: present in the vocabulary AND not rotatable
      coalesce((select exists(select 1 from deployed_status d where d.status = 'pending')), false)                                      as has_pending,
      coalesce((select exists(select 1 from classification c where c.status = 'pending' and not c.rotatable)), false)                   as pending_not_rotatable,
      coalesce((select exists(select 1 from deployed_status d where d.status = 'error')), false)                                        as has_error,
      coalesce((select exists(select 1 from classification c where c.status = 'error' and not c.rotatable)), false)                     as error_not_rotatable,
      coalesce((select exists(select 1 from deployed_status d where d.status = 'revoked')), false)                                      as has_revoked,
      coalesce((select exists(select 1 from classification c where c.status = 'revoked' and not c.rotatable)), false)                   as revoked_not_rotatable,
      coalesce((select exists(select 1 from deployed_status d where d.status = 'superseded')), false)                                   as has_superseded,
      coalesce((select exists(select 1 from classification c where c.status = 'superseded' and not c.rotatable)), false)                as superseded_not_rotatable,
      coalesce((select exists(select 1 from deployed_status d where d.status = 'expired')), false)                                      as has_expired,
      coalesce((select exists(select 1 from classification c where c.status = 'expired' and not c.rotatable)), false)                   as expired_not_rotatable,
      coalesce((select exists(select 1 from deployed_status d where d.status = 'rotating')), false)                                     as has_rotating,
      coalesce((select exists(select 1 from classification c where c.status = 'rotating' and not c.rotatable)), false)                  as rotating_not_rotatable,

      -- S–V · the structural rotation-unit integrity this phase must not weaken
      (select name from fk_same_business limit 1)                                       as fk_same_business_name,
      (select name from fk_rotation_unit limit 1)                                       as fk_rotation_unit_name,
      (select count(*) from fk_rotation_unit)                                           as fk_rotation_unit_count,
      (select name from rotation_unit_anchor limit 1)                                   as anchor_name,
      (select name from one_active limit 1)                                             as one_active_name,

      -- W · provider bindings, read from put's own CASE
      (select count(*) from put_fn p,
              regexp_matches(p.prosrc, 'when\s+''([a-z_]+)''\s+then\s+''([a-z_]+)''', 'g') m) as put_pairs,
      coalesce((select exists(select 1 from put_fn p,
              regexp_matches(p.prosrc, 'when\s+''plaid_access''\s+then\s+''plaid''', 'g') m)), false)       as binding_plaid_access,
      coalesce((select exists(select 1 from put_fn p,
              regexp_matches(p.prosrc, 'when\s+''quickbooks_access''\s+then\s+''quickbooks''', 'g') m)), false)  as binding_quickbooks_access,
      coalesce((select exists(select 1 from put_fn p,
              regexp_matches(p.prosrc, 'when\s+''quickbooks_refresh''\s+then\s+''quickbooks''', 'g') m)), false) as binding_quickbooks_refresh,

      -- X · resolve, unchanged and still exact
      (select count(*) from resolve_fn)                                                 as resolve_fn_count,
      (select r.identity_args from resolve_fn r)                                        as resolve_args,
      coalesce((select (position('status = ''active''' in r.prosrc) > 0
                    and position('superseded_by_credential_id is null' in r.prosrc) > 0
                    and position('expires_at is null or c.expires_at > clock_timestamp()' in r.prosrc) > 0
                    and position('bc.status not in' in r.prosrc) > 0
                    and position('p_credential_id' in r.full_args) = 0
                    and r.identity_args = 'uuid, uuid, text')
                from resolve_fn r), false)                                              as resolve_ok,

      -- Y · CB-001 / CB-001.2 integrity
      (select name from fk_conn_same_business limit 1)                                  as fk_conn_business_name,
      (select count(*) from pg_constraint c,
              regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
        where c.conrelid = 'public.provider_credentials'::regclass
          and c.conname::text = 'provider_credentials_type_check')                       as type_vocab_count,
      (select count(*) from pg_class t, aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
        where t.oid = 'public.provider_credentials'::regclass
          and a.grantee <> t.relowner
          and a.privilege_type in ('DELETE','TRUNCATE'))                                as cred_destructive_nonowner,

      -- Z · sibling wrappers and the CB-003 boundary
      (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and ((p.proname = 'provider_credential_put'
                and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, text, text, timestamp with time zone, jsonb')
            or (p.proname = 'provider_credential_resolve'
                and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, text')
            or (p.proname = 'provider_credential_revoke'
                and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, uuid')))   as cb002_other_wrappers,
      (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('provider_authorization_attempt_create','provider_authorization_attempt_consume',
                            'provider_authorization_attempt_cancel','provider_authorization_attempt_fail')) as cb003_functions,
      (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('provider_authorization_attempt_create','provider_authorization_attempt_consume',
                            'provider_authorization_attempt_cancel','provider_authorization_attempt_fail')
          and has_function_privilege('service_role', p.oid, 'EXECUTE'))                 as cb003_service_grants,
      (select to_regclass('public.provider_authorization_attempts') is not null)        as attempts_table_exists,

      -- AA · the Vault/browser boundary
      (select count(*) from pg_class t, aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
        where t.oid = 'public.provider_credentials'::regclass
          and a.grantee = (select oid from pg_roles where rolname = 'anon'))            as cred_anon_privileges,
      (select count(*) from pg_class t, aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
        where t.oid = 'public.provider_credentials'::regclass
          and a.grantee = (select oid from pg_roles where rolname = 'authenticated'))   as cred_auth_privileges,
      coalesce((select t.relrowsecurity from pg_class t
                 where t.oid = 'public.provider_credentials'::regclass), false)         as cred_rls_enabled,
      (select count(*) from pg_policies pp
        where pp.schemaname = 'public' and pp.tablename = 'provider_credentials')       as cred_policies,

      -- AB · the baseline ledger
      (select count(*) from public.provider_credentials)                                as credential_rows,
      (select count(*) from vault.secrets s
        where s.name like 'vision-provider-credential:%')                               as vault_credential_secrets,

      -- AC · the Digital Twin freeze
      (select count(*) from public.business_facts)                                      as fact_rows,
      (select count(*) from public.business_fact_evidence)                              as fact_evidence_rows,
      (select count(*) from public.business_fact_conflicts)                             as fact_conflict_rows
  )

select * from (
  select 1 as ord, 'A' as id,
         'provider_credential_rotate exists with the exact approved signature' as requirement,
         coalesce(f.fn_args, '<function not found>') as observed,
         'uuid, text, timestamp with time zone, jsonb' as expected,
         case when f.fn_count = 1 and f.fn_args = 'uuid, text, timestamp with time zone, jsonb' then 'PASS' else 'FAIL' end as verdict
    from facts f

  union all select 2, 'B', 'the function is SECURITY DEFINER',
         case when f.fn_security_definer then 'SECURITY DEFINER' else 'not definer (or missing)' end,
         'SECURITY DEFINER',
         case when f.fn_security_definer then 'PASS' else 'FAIL' end from facts f

  union all select 3, 'C', 'the function owner is postgres',
         coalesce(f.fn_owner, '<none>'), 'postgres',
         case when f.fn_owner = 'postgres' then 'PASS' else 'FAIL' end from facts f

  union all select 4, 'D', 'search_path is pinned to pg_catalog, vault, public',
         case when f.fn_search_path_ok then 'pinned' else 'not pinned' end,
         'set search_path = pg_catalog, vault, public',
         case when f.fn_search_path_ok then 'PASS' else 'FAIL' end from facts f

  union all select 5, 'E', 'PUBLIC holds no EXECUTE (grantee 0)',
         f.public_exec_grants::text || ' grant(s) to grantee 0', '0 grants to grantee 0',
         case when f.public_exec_grants = 0 then 'PASS' else 'FAIL' end from facts f

  union all select 6, 'F', 'anon cannot execute',
         case when f.anon_can_execute then 'CAN EXECUTE' else 'denied' end, 'denied',
         case when f.anon_can_execute = false then 'PASS' else 'FAIL' end from facts f

  union all select 7, 'G', 'authenticated cannot execute',
         case when f.authenticated_can_execute then 'CAN EXECUTE' else 'denied' end, 'denied',
         case when f.authenticated_can_execute = false then 'PASS' else 'FAIL' end from facts f

  union all select 8, 'H', 'service_role CAN execute (a lockdown that cannot be used is a lockout)',
         case when f.service_role_can_execute then 'granted' else 'NOT granted' end, 'granted',
         case when f.service_role_can_execute = true then 'PASS' else 'FAIL' end from facts f

  union all select 9, 'I', 'the predecessor gate is the ACTIVE-ONLY allowlist',
         f.gate_forms::text || ' allowlist comparison(s) on v_pred_status', '1 comparison against ''active''',
         case when f.gate_forms = 1 then 'PASS' else 'FAIL' end from facts f

  union all select 10, 'J', 'no membership test decides the predecessor rule',
         'in@' || f.blacklist_in_pos::text || ', not-in@' || f.blacklist_notin_pos::text,
         'no membership test on v_pred_status',
         case when f.blacklist_in_pos = 0 and f.blacklist_notin_pos = 0 then 'PASS' else 'FAIL' end from facts f

  union all select 11, 'K', 'the status gate precedes vault.create_secret',
         'gate@' || f.gate_pos::text || ', vault@' || f.vault_pos::text,
         'gate position > 0 and < vault.create_secret position',
         case when f.gate_pos > 0 and f.vault_pos > 0 and f.gate_pos < f.vault_pos then 'PASS' else 'FAIL' end from facts f

  union all select 12, 'L', 'the deployed status vocabulary is exact and COMPLETELY classified',
         f.status_count::text || ' deployed value(s); classification rows=' || f.class_total::text
           || '; rotatable=' || f.class_rotatable_count::text
           || '; unclassified=' || f.class_undeclared::text || '; unclassified-not-in-vocab=' || f.class_unmatched::text,
         '7 deployed values; every value classified; exactly 1 rotatable (active)',
         case when f.status_vocab_exact and f.class_total = 7 and f.class_rotatable_count = 1
                   and f.class_active_only and f.class_undeclared = 0 and f.class_unmatched = 0
              then 'PASS' else 'FAIL' end from facts f

  union all select 13, 'M', 'pending is NOT rotatable',
         case when f.has_pending then 'deployed' else 'NOT deployed' end || '; '
           || case when f.pending_not_rotatable then 'not rotatable' else 'MISSING CLASSIFICATION' end,
         'deployed; classified not rotatable',
         case when f.has_pending and f.pending_not_rotatable then 'PASS' else 'FAIL' end from facts f

  union all select 14, 'N', 'error is NOT rotatable',
         case when f.has_error then 'deployed' else 'NOT deployed' end || '; '
           || case when f.error_not_rotatable then 'not rotatable' else 'MISSING CLASSIFICATION' end,
         'deployed; classified not rotatable',
         case when f.has_error and f.error_not_rotatable then 'PASS' else 'FAIL' end from facts f

  union all select 15, 'O', 'revoked is NOT rotatable',
         case when f.has_revoked then 'deployed' else 'NOT deployed' end || '; '
           || case when f.revoked_not_rotatable then 'not rotatable' else 'MISSING CLASSIFICATION' end,
         'deployed; classified not rotatable',
         case when f.has_revoked and f.revoked_not_rotatable then 'PASS' else 'FAIL' end from facts f

  union all select 16, 'P', 'superseded is NOT rotatable',
         case when f.has_superseded then 'deployed' else 'NOT deployed' end || '; '
           || case when f.superseded_not_rotatable then 'not rotatable' else 'MISSING CLASSIFICATION' end,
         'deployed; classified not rotatable',
         case when f.has_superseded and f.superseded_not_rotatable then 'PASS' else 'FAIL' end from facts f

  union all select 17, 'Q', 'expired is NOT rotatable',
         case when f.has_expired then 'deployed' else 'NOT deployed' end || '; '
           || case when f.expired_not_rotatable then 'not rotatable' else 'MISSING CLASSIFICATION' end,
         'deployed; classified not rotatable',
         case when f.has_expired and f.expired_not_rotatable then 'PASS' else 'FAIL' end from facts f

  union all select 18, 'R', 'rotating is NOT rotatable (no wrapper writes it)',
         case when f.has_rotating then 'deployed' else 'NOT deployed' end || '; '
           || case when f.rotating_not_rotatable then 'not rotatable' else 'MISSING CLASSIFICATION' end,
         'deployed; classified not rotatable',
         case when f.has_rotating and f.rotating_not_rotatable then 'PASS' else 'FAIL' end from facts f

  union all select 19, 'S', 'the same-business supersession FK is preserved',
         coalesce(f.fk_same_business_name, '<not found>'),
         'FK on (superseded_by_credential_id, business_id) -> provider_credentials (id, business_id)',
         case when f.fk_same_business_name is not null then 'PASS' else 'FAIL' end from facts f

  union all select 20, 'T', 'the same-connection + same-type rotation-unit FK is preserved',
         coalesce(f.fk_rotation_unit_name, '<not found>') || ' (matched structurally: '
           || f.fk_rotation_unit_count::text || ' constraint(s))',
         '1 FK on (superseded_by_credential_id, business_connection_id, credential_type)',
         case when f.fk_rotation_unit_name is not null and f.fk_rotation_unit_count = 1 then 'PASS' else 'FAIL' end from facts f

  union all select 21, 'U', 'the rotation-unit unique anchor is preserved',
         coalesce(f.anchor_name, '<not found>'),
         'UNIQUE (id, business_connection_id, credential_type)',
         case when f.anchor_name is not null then 'PASS' else 'FAIL' end from facts f

  union all select 22, 'V', 'the one-active-per-rotation-unit partial unique index is preserved',
         coalesce(f.one_active_name, '<not found>'),
         'unique (business_connection_id, credential_type) where status = active',
         case when f.one_active_name is not null then 'PASS' else 'FAIL' end from facts f

  union all select 23, 'W', 'the provider bindings are unchanged',
         f.put_pairs::text || ' binding pair(s); plaid_access=' || f.binding_plaid_access::text
           || ', quickbooks_access=' || f.binding_quickbooks_access::text
           || ', quickbooks_refresh=' || f.binding_quickbooks_refresh::text,
         '9 binding pairs; the three admitted bindings exact',
         case when f.put_pairs = 9 and f.binding_plaid_access and f.binding_quickbooks_access
                   and f.binding_quickbooks_refresh then 'PASS' else 'FAIL' end from facts f

  union all select 24, 'X', 'provider_credential_resolve is intact and still exact',
         coalesce(f.resolve_args, '<missing>') || '; contract predicates '
           || case when f.resolve_ok then 'all present' else 'INCOMPLETE' end,
         'addressed by business + connection + type; requires active, no successor pointer, not expired, connection live; never accepts a credential id',
         case when f.resolve_fn_count = 1 and f.resolve_ok then 'PASS' else 'FAIL' end from facts f

  union all select 25, 'Y', 'CB-001 / CB-001.2 integrity is intact',
         'conn-fk=' || coalesce(f.fk_conn_business_name, '<not found>')
           || '; type vocab=' || f.type_vocab_count::text
           || '; non-owner DELETE/TRUNCATE grants=' || f.cred_destructive_nonowner::text,
         'composite connection FK present; 9 credential types; no non-owner may delete or truncate',
         case when f.fk_conn_business_name is not null and f.type_vocab_count = 9
                   and f.cred_destructive_nonowner = 0 then 'PASS' else 'FAIL' end from facts f

  union all select 26, 'Z', 'the other CB-002 wrappers and the CB-003 boundary are intact',
         'wrapper(s)=' || f.cb002_other_wrappers::text || '; CB-003 function(s)=' || f.cb003_functions::text
           || '; service_role grants=' || f.cb003_service_grants::text
           || '; attempts table=' || case when f.attempts_table_exists then 'present' else 'MISSING' end,
         '3 wrappers with exact signatures; 4 CB-003 functions, all service_role-executable; attempts table present',
         case when f.cb002_other_wrappers = 3 and f.cb003_functions = 4
                   and f.cb003_service_grants = 4 and f.attempts_table_exists then 'PASS' else 'FAIL' end from facts f

  union all select 27, 'AA', 'the Vault / browser boundary is intact',
         'anon privileges=' || f.cred_anon_privileges::text
           || '; authenticated privileges=' || f.cred_auth_privileges::text
           || '; RLS=' || case when f.cred_rls_enabled then 'enabled' else 'DISABLED' end
           || '; policies=' || f.cred_policies::text,
         '0 anon privileges; 0 authenticated privileges; RLS enabled; 0 policies (service_role path only)',
         case when f.cred_anon_privileges = 0 and f.cred_auth_privileges = 0
                   and f.cred_rls_enabled and f.cred_policies = 0 then 'PASS' else 'FAIL' end from facts f

  union all select 28, 'AB', 'the credential ledger baseline is empty',
         'provider_credentials=' || f.credential_rows::text
           || '; VISION provider Vault secrets=' || f.vault_credential_secrets::text,
         '0 credentials; 0 VISION provider Vault secrets',
         case when f.credential_rows = 0 and f.vault_credential_secrets = 0 then 'PASS' else 'BLOCKER' end from facts f

  union all select 29, 'AC', 'the Digital Twin freeze is untouched',
         'business_facts=' || f.fact_rows::text
           || '; business_fact_evidence=' || f.fact_evidence_rows::text
           || '; business_fact_conflicts=' || f.fact_conflict_rows::text,
         '0 / 0 / 0',
         case when f.fact_rows = 0 and f.fact_evidence_rows = 0 and f.fact_conflict_rows = 0
              then 'PASS' else 'FAIL' end from facts f

  union all select 30, 'AD', 'REAL-CREDENTIAL USE remains gated by a later provider phase',
         'no provider credential may be stored or resolved before (a) CB-004 call-site authorization is deployed and certified, and (b) a real provider application and its secrets are provisioned',
         'BLOCKER — a genuine provider/real-credential gate that SQL cannot close',
         'BLOCKER' from facts f
) g
order by g.ord;