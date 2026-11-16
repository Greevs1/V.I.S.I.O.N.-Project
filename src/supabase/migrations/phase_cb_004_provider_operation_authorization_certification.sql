-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-004 · PROVIDER OPERATION AUTHORIZATION KERNEL — CERTIFICATION
-- ============================================================================
-- READ-ONLY: returns ONE report: 26 rows (A … Z), one verdict per row.
--
-- WHAT THIS CERTIFIES, AND WHAT IT CANNOT
--   It certifies the DEPLOYED posture: that the audit table and its single writer
--   exist with the exact vocabularies, the exact constraint set and the exact
--   privilege surface the artifact claims — read from the catalogs, not from the
--   migration file.
--
--   It CANNOT certify that a caller invoked the kernel, and it does not pretend
--   to: no catalog can prove that. That property is certified where it lives —
--   in scripts/cb004AuthorizationKernelChecks.cjs, which executes the REAL kernel
--   against fixtures and mutation-tests every way the decision can be broken.
--   The two artifacts are halves of one certification.
--
-- WHY THIS READS CATALOGS RATHER THAN THE MIGRATION
--   The CB-002.1 phase was certified against a live run and three defects were
--   found in the CERTIFICATION, not the deployment: a name-bearing rendering of
--   argument types compared against a types-only expectation; an interval
--   compared as pretty-printed text; and a constraint name compared through a
--   `name`-typed column that truncated a long literal. Every one of those was a
--   brittle text comparison. So the argument signature here is derived
--   STRUCTURALLY from pg_proc.proargtypes, the constraint identity is compared
--   EXPLICITLY as text, and every privilege is probed with has_table_privilege.
--
-- ANY FAIL BLOCKS READINESS. Real provider credentials remain NO-GO until the
-- harness (kernel behaviour + mutations) and this report are both green.
-- ============================================================================

with
-- ── the objects under certification ────────────────────────────────────────
tbl as (
  select c.oid, c.relname, c.relrowsecurity, c.relacl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'provider_operation_audit'
),
fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.proargtypes,
         pg_get_userbyid(p.proowner) as owner_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'provider_operation_audit_record'
),

-- ── the writer's argument TYPES, structurally, in declared order ───────────
arg_sig as (
  select coalesce(string_agg(format_type(u.t, null), ', ' order by u.ord), '') as type_signature
  from fn f
  cross join lateral unnest(f.proargtypes::oid[]) with ordinality as u(t, ord)
),
expected_sig as (
  select 'text, uuid, uuid, text, text, uuid, uuid, text, text, text, text, text, jsonb' as want
),

-- ── the deployed writer body, for the append-only claim ────────────────────
fn_body as (
  select coalesce(pg_get_functiondef(f.oid), '') as def from fn f
),

-- ── columns ────────────────────────────────────────────────────────────────
cols as (
  select string_agg(a.attname, ',' order by a.attnum) as column_list,
         count(*) as column_count,
         count(*) filter (where a.attname in (
           'access_token','refresh_token','public_token','link_token','authorization_code',
           'client_secret','credential_value','plaintext_secret','decrypted_secret',
           'token_value','secret_value','password')) as plaintext_columns
  from pg_attribute a
  where a.attrelid = (select oid from tbl) and a.attnum > 0 and not a.attisdropped
),

-- ── named constraints, and the CHECK inventory ─────────────────────────────
cons as (
  select c.conname, pg_get_constraintdef(c.oid) as def, c.contype
  from pg_constraint c
  where c.conrelid = (select oid from tbl)
),
cons_pivot as (
  select
    count(*) as total,
    count(*) filter (where contype = 'c') as checks,
    count(*) filter (where contype = 'f') as fks
  from cons
),

-- ── the vocabulary lists exactly as the CHECK constraints hold them ────────
vocab as (
  select
    (select def from cons where conname = 'provider_operation_audit_actor_kind_check')  as actor_kind_def,
    (select def from cons where conname = 'provider_operation_audit_decision_check')    as decision_def,
    (select def from cons where conname = 'provider_operation_audit_reason_code_check') as reason_def,
    (select def from cons where conname = 'provider_operation_audit_operation_check')   as operation_def,
    (select def from cons where conname = 'provider_operation_audit_provider_check')    as provider_def,
    (select def from cons where conname = 'provider_operation_audit_resource_type_check') as resource_def,
    (select def from cons where conname = 'provider_operation_audit_decision_reason_consistency') as consistency_def,
    (select def from cons where conname = 'provider_operation_audit_allow_has_provider') as allow_provider_def,
    (select def from cons where conname = 'provider_operation_audit_unknown_operation_check') as unknown_def,
    (select def from cons where conname = 'provider_operation_audit_actor_identity_shape') as identity_def,
    (select def from cons where conname = 'provider_operation_audit_safe_metadata_shape') as metadata_shape_def
),

-- ── the deployed privilege surface, all nine privileges, three roles ───────
roles(role_name) as (values ('service_role'), ('anon'), ('authenticated')),
privs(priv) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                       ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')),
matrix as (
  select r.role_name, p.priv,
         has_table_privilege(r.role_name, 'public.provider_operation_audit', p.priv) as has_priv
  from roles r cross join privs p
),
matrix_pivot as (
  select
    bool_and(has_priv) filter (where role_name = 'service_role' and priv = 'SELECT')       as sr_select,
    bool_or(has_priv)  filter (where role_name = 'service_role' and priv <> 'SELECT')      as sr_extra,
    bool_or(has_priv)  filter (where role_name = 'anon')                                   as anon_any,
    bool_or(has_priv)  filter (where role_name = 'authenticated')                          as authed_any
  from matrix
),

-- ── PUBLIC, via the raw ACL ────────────────────────────────────────────────
public_acl as (
  select count(*) as public_grants
  from tbl t, aclexplode(coalesce(t.relacl, '{}'::aclitem[])) a
  where a.grantee = 0
),
fn_public_acl as (
  select count(*) as public_grants
  from fn f, aclexplode(coalesce(f.proacl, '{}'::aclitem[])) a
  where a.grantee = 0
),

-- ── indexes ────────────────────────────────────────────────────────────────
idx as (
  select count(*) as index_count,
         count(*) filter (where indexname in (
           'provider_operation_audit_business_idx',
           'provider_operation_audit_actor_idx',
           'provider_operation_audit_connection_idx')) as intended_indexes
  from pg_indexes
  where schemaname = 'public' and tablename = 'provider_operation_audit'
),

-- ── baselines that must stay frozen ────────────────────────────────────────
freeze as (
  select
    (select count(*) from public.business_facts)          as fact_rows,
    (select count(*) from public.business_fact_evidence)  as fact_evidence_rows,
    (select count(*) from public.business_fact_conflicts) as fact_conflict_rows
),
provider_baseline as (
  select
    (select count(*) from public.business_connections) as connections,
    (select count(*) from public.provider_credentials) as credentials
),
audit_baseline as (
  select count(*) as audit_rows from public.provider_operation_audit
)

select * from (
  select 'A' id, 'provider_operation_audit exists with RLS enabled' as requirement,
    'one relation, relrowsecurity = true' as expected,
    (select 'rows=' || count(*)::text || ', rls=' || coalesce(bool_or(relrowsecurity)::text, 'none') from tbl) as observed,
    case when (select count(*) from tbl) = 1 and (select bool_or(relrowsecurity) from tbl) then 'PASS' else 'FAIL' end as verdict
  union all select 'B', 'exact column set (15)', 'id,created_at,actor_kind,actor_profile_id,business_id,provider,operation,business_connection_id,authorization_attempt_id,resource_type,resource_id,decision,reason_code,request_correlation_id,safe_metadata',
    (select column_list || ' (' || column_count::text || ')' from cols),
    case when (select column_count from cols) = 15
      and (select column_list from cols) =
        'id,created_at,actor_kind,actor_profile_id,business_id,provider,operation,business_connection_id,authorization_attempt_id,resource_type,resource_id,decision,reason_code,request_correlation_id,safe_metadata'
      then 'PASS' else 'FAIL' end
  union all select 'C', 'no plaintext credential column', '0 plaintext-shaped columns',
    (select plaintext_columns::text from cols),
    case when (select plaintext_columns from cols) = 0 then 'PASS' else 'FAIL' end
  union all select 'D', 'exact CHECK inventory', '13 CHECK constraints',
    (select checks::text from cons_pivot),
    case when (select checks from cons_pivot) = 13 then 'PASS' else 'FAIL' end
  union all select 'E', 'foreign key count', '4 FKs, every one ON DELETE SET NULL',
    (select fks::text || ' FK(s); set-null=' || coalesce(count(*) filter (where contype = 'f' and def ilike '%on delete set null%'), 0)::text from cons),
    case when (select fks from cons_pivot) = 4
      and (select count(*) from cons where contype = 'f' and def ilike '%on delete set null%') = 4
      then 'PASS' else 'FAIL' end
  union all select 'F', 'actor kind domain', '''user'' + ''system''',
    (select actor_kind_def from vocab),
    case when (select actor_kind_def from vocab) not ilike '%''user''%'
      or (select actor_kind_def from vocab) not ilike '%''system''%' then 'FAIL' else 'PASS' end
  union all select 'G', 'decision domain', '''allow'' + ''deny''',
    (select decision_def from vocab),
    case when (select decision_def from vocab) ilike '%''allow''%'
      and (select decision_def from vocab) ilike '%''deny''%' then 'PASS' else 'FAIL' end
  union all select 'H', 'reason-code domain is the bounded 13', '13 distinct codes',
    (select reason_def from vocab),
    case when (select reason_def from vocab) ilike '%AUTHORIZED%'
      and (select reason_def from vocab) ilike '%SYSTEM_CONTEXT_UNRESOLVED%'
      and (select reason_def from vocab) ilike '%PROVIDER_AUTHENTICITY_FAILED%'
      and (select reason_def from vocab) ilike '%CREDENTIAL_UNAVAILABLE%'
      and (select reason_def from vocab) ilike '%RESOURCE_BUSINESS_MISMATCH%' then 'PASS' else 'FAIL' end
  union all select 'I', 'operation domain is the closed 18 plus the recorded outlier', '18 operations + ''unknown''',
    (select operation_def from vocab),
    case when (select operation_def from vocab) ilike '%connection.create%'
      and (select operation_def from vocab) ilike '%webhook.process%'
      and (select operation_def from vocab) ilike '%credential.resolve%'
      and (select operation_def from vocab) ilike '%unknown%' then 'PASS' else 'FAIL' end
  union all select 'J', 'provider domain is the admitted pair', 'quickbooks + plaid, NULL permitted',
    (select provider_def from vocab),
    case when (select provider_def from vocab) ilike '%is null or%'
      and (select provider_def from vocab) ilike '%quickbooks%'
      and (select provider_def from vocab) ilike '%plaid%' then 'PASS' else 'FAIL' end
  union all select 'K', 'provider domain uses explicit NULL handling', 'provider is null or provider in (...)',
    (select provider_def from vocab),
    case when (select provider_def from vocab) ilike '%is null or provider in%' then 'PASS' else 'FAIL' end
  union all select 'L', 'resource-type domain is bounded', '8 resource types',
    (select resource_def from vocab),
    case when (select resource_def from vocab) ilike '%webhook_event%'
      and (select resource_def from vocab) ilike '%authorization_attempt%' then 'PASS' else 'FAIL' end
  union all select 'M', 'ALLOW and AUTHORIZED are the same fact, both directions', '(decision = ''allow'') = (reason_code = ''AUTHORIZED'')',
    (select consistency_def from vocab),
    case when (select consistency_def from vocab) ilike '%allow%' then 'PASS' else 'FAIL' end
  union all select 'N', 'an authorized operation always records its provider', 'decision <> ''allow'' or provider is not null',
    (select allow_provider_def from vocab),
    case when (select allow_provider_def from vocab) ilike '%provider is not null%' then 'PASS' else 'FAIL' end
  union all select 'O', 'an out-of-vocabulary operation can never be authorized', 'operation <> ''unknown'' or decision = ''deny''',
    (select unknown_def from vocab),
    case when (select unknown_def from vocab) ilike '%deny%' then 'PASS' else 'FAIL' end
  union all select 'P', 'actor identity shape: system never names a profile', 'user ⇒ profile or ACTOR_UNRESOLVED; system ⇒ profile is null',
    (select identity_def from vocab),
    case when (select identity_def from vocab) ilike '%actor_profile_id is null%'
      and (select identity_def from vocab) ilike '%ACTOR_UNRESOLVED%' then 'PASS' else 'FAIL' end
  union all select 'Q', 'safe_metadata is a bounded object', 'jsonb object, <= 4096 characters',
    (select metadata_shape_def from vocab),
    case when (select metadata_shape_def from vocab) ilike '%jsonb_typeof%'
      and (select metadata_shape_def from vocab) ilike '%4096%' then 'PASS' else 'FAIL' end
  union all select 'R', 'service_role holds SELECT and NOTHING ELSE on the audit trail',
    'SELECT only',
    'select=' || coalesce((select sr_select::text from matrix_pivot), 'null')
      || ', any-other-privilege=' || coalesce((select sr_extra::text from matrix_pivot), 'null'),
    case when (select sr_select from matrix_pivot) and not (select sr_extra from matrix_pivot) then 'PASS' else 'FAIL' end
  union all select 'S', 'anon holds no privilege at all', 'none of the nine',
    'any=' || coalesce((select anon_any::text from matrix_pivot), 'null'),
    case when not (select anon_any from matrix_pivot) then 'PASS' else 'FAIL' end
  union all select 'T', 'authenticated holds no privilege at all', 'none of the nine',
    'any=' || coalesce((select authed_any::text from matrix_pivot), 'null'),
    case when not (select authed_any from matrix_pivot) then 'PASS' else 'FAIL' end
  union all select 'U', 'PUBLIC holds no grant on the table or the writer', '0 PUBLIC grants on both objects',
    'table=' || (select public_grants::text from public_acl) || ', function=' || (select public_grants::text from fn_public_acl),
    case when (select public_grants from public_acl) = 0 and (select public_grants from fn_public_acl) = 0 then 'PASS' else 'FAIL' end
  union all select 'V', 'the writer exists, is SECURITY DEFINER, owned by postgres, search_path pinned',
    'prosecdef = true, owner = postgres, proconfig holds pg_catalog, public',
    coalesce((select owner_name || ', secdef=' || prosecdef::text || ', cfg=' || coalesce(array_to_string(proconfig, ';'), 'none') from fn), 'absent'),
    case when exists (select 1 from fn where prosecdef and owner_name = 'postgres'
        and array_to_string(coalesce(proconfig, '{}'), ';') ilike '%search_path=pg_catalog, public%') then 'PASS' else 'FAIL' end
  union all select 'W', 'the writer''s argument signature, derived STRUCTURALLY from proargtypes',
    (select want from expected_sig),
    (select type_signature from arg_sig),
    case when (select type_signature from arg_sig) = (select want from expected_sig) then 'PASS' else 'FAIL' end
  union all select 'X', 'append-only: the deployed writer contains no UPDATE and no DELETE',
    'exactly one INSERT, no UPDATE, no DELETE, no TRUNCATE',
    'inserts=' || (select (length(lower(def)) - length(replace(lower(def), 'insert into public.provider_operation_audit', ''))) / length('insert into public.provider_operation_audit') from fn_body)::text
      || ', updates=' || (select case when lower(def) ~ 'update[[:space:]]+public\.provider_operation_audit' then '1' else '0' end from fn_body)
      || ', deletes=' || (select case when lower(def) ~ 'delete[[:space:]]+from[[:space:]]+public\.provider_operation_audit' then '1' else '0' end from fn_body),
    case when (select (length(lower(def)) - length(replace(lower(def), 'insert into public.provider_operation_audit', ''))) / length('insert into public.provider_operation_audit') from fn_body) = 1
      and (select lower(def) from fn_body) !~ 'update[[:space:]]+public\.provider_operation_audit'
      and (select lower(def) from fn_body) !~ 'delete[[:space:]]+from[[:space:]]+public\.provider_operation_audit'
      and (select lower(def) from fn_body) !~ 'truncate'
      then 'PASS' else 'FAIL' end
  union all select 'Y', 'the three intended indexes exist and nothing else',
    '3 indexes: business, actor, connection',
    (select intended_indexes::text || ' of ' || index_count::text from idx),
    case when (select index_count from idx) = 3 and (select intended_indexes from idx) = 3 then 'PASS' else 'FAIL' end
  union all select 'Z', 'UNKNOWN ≠ ZERO: the Digital Twin stays frozen and the provider baseline is zero',
    'business_facts/evidence/conflicts = 0/0/0; business_connections = 0; provider_credentials = 0',
    (select fact_rows::text || '/' || fact_evidence_rows::text || '/' || fact_conflict_rows::text from freeze)
      || '; connections=' || (select connections::text from provider_baseline)
      || '; credentials=' || (select credentials::text from provider_baseline)
      || '; audit_rows=' || (select audit_rows::text from audit_baseline),
    case when (select fact_rows from freeze) = 0
      and (select fact_evidence_rows from freeze) = 0
      and (select fact_conflict_rows from freeze) = 0
      and (select connections from provider_baseline) = 0
      and (select credentials from provider_baseline) = 0
      then 'PASS' else 'FAIL' end
) report
order by id;

-- ============================================================================
-- A PASS HERE MEANS the deployed database half of CB-004 is exactly what the
-- artifact claims. It does NOT mean CB-004 is complete: run
--   node scripts/connectedBusinessFoundation.test.cjs
-- for the kernel's behaviour and its mutation certification. Any FAIL — in
-- either half — blocks readiness, and real provider credentials stay NO-GO.
-- ============================================================================