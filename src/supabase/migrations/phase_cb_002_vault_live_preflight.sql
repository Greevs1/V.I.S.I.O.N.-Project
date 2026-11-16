-- ============================================================================
-- VISION — CONNECTED BUSINESS
-- CB-002 LIVE VAULT PREFLIGHT — READ-ONLY
-- ============================================================================
-- Run MANUALLY in the Supabase SQL Editor, BEFORE CB-002 is deployed.
--
-- ONE QUESTION
--   Can the CB-002 wrapper surface be deployed against THIS Vault, as it
--   actually is? This measures the deployed extension, the deployed privilege
--   posture, and the two compatibility facts CB-002 depends on.
--
-- READ-ONLY BY CONSTRUCTION
--   A single SELECT over system catalogs. No INSERT, UPDATE, DELETE, CREATE,
--   ALTER, DROP, GRANT, REVOKE, TRUNCATE, CALL, no DO block, no temporary
--   object, and no Vault function is invoked. No relation in schema vault is
--   read directly either: every fact comes from pg_class / pg_proc /
--   pg_namespace / pg_extension, so this works even for a session that could
--   not see Vault contents at all.
--
--   The words INSERT / UPDATE / DELETE / GRANT / REVOKE appear below ONLY as
--   privilege NAMES inside string literals, and inside one function-name
--   pattern. They are never statements. Nothing in this file changes anything.
--
-- VERDICTS
--   PASS   measured, and matches the required expectation
--   FAIL   measured, and contradicts it — a real finding
--   INFO   a measurement with no pass/fail expectation
--   MANUAL the catalogs cannot settle it; a human must
--   An unknown is NEVER reported as PASS.
--
-- SECTIONS
--   01 extension           02 create_secret        03 update_secret
--   04 deletion capability 05 vault.secrets        06 vault.decrypted_secrets
--   07 schema privileges   08 PostgREST exposure
--   09A two-argument call  09B destroy capability
--
-- SEND BACK
--   The whole grid. Every FAIL is a finding; every MANUAL is a question this
--   database cannot answer on its own.
-- ============================================================================

with

-- ── 01 · the extension, as deployed ─────────────────────────────────────────
-- The Supabase Vault extension is installed under the EXTENSION NAME
-- `supabase_vault` — confirmed live as supabase_vault 0.3.1, schema vault.
--
-- The extension NAME and the SCHEMA are two different things. CB-002 addresses
-- every object by SCHEMA: vault.create_secret, vault.secrets,
-- vault.decrypted_secrets. They all stay qualified through `vault`.
--
-- The first release of this preflight filtered on extname = 'vault', which was
-- wrong: it reported a correct production installation as ABSENT. Presence is
-- now anchored on the EXACT deployed name below — an exact match, never a
-- pattern, because a pattern would silently accept an unverified extension.
vault_ext as (
  select
    e.extname::text as extension_name,
    e.extversion    as installed_version,
    n.nspname       as extension_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'supabase_vault'
),

-- Any OTHER extension whose name mentions vault, or that owns schema vault.
-- DIAGNOSTIC ONLY: this never decides a verdict. It exists so that a
-- differently-named Vault installation is VISIBLE in the report instead of
-- silently accepted — the presence verdict above is anchored on the exact name,
-- and nothing here can satisfy it.
vault_other_ext as (
  select
    e.extname::text as extension_name,
    e.extversion    as installed_version,
    n.nspname       as extension_schema
  from pg_extension e
  left join pg_namespace n on n.oid = e.extnamespace
  where (e.extname ilike '%vault%' or n.nspname = 'vault')
    and e.extname <> 'supabase_vault'
),

-- ── schema vault itself ─────────────────────────────────────────────────────
vault_ns as (
  select
    n.oid,
    n.nspname,
    n.nspowner,
    n.nspacl
  from pg_namespace n
  where n.nspname = 'vault'
),

-- ── every function deployed in schema vault, with its privilege posture ─────
-- proargtypes holds ONLY input arguments, so pronargs is the number of input
-- arguments and pronargdefaults the number of them carrying a DEFAULT. Their
-- difference is the number of arguments a caller MUST supply — which is what
-- decides whether a two-argument call can resolve.
vf as (
  select
    p.oid,
    p.proname,
    p.pronargs,
    p.pronargdefaults,
    p.pronargs - p.pronargdefaults                            as required_args,
    coalesce(p.proargtypes[0], 0)                             as arg1_oid,
    coalesce(p.proargtypes[1], 0)                             as arg2_oid,
    pg_get_function_identity_arguments(p.oid)                 as identity_args,
    pg_get_function_arguments(p.oid)                          as full_args,
    pg_get_function_result(p.oid)                             as result_type,
    pg_get_userbyid(p.proowner)::text                         as owner_name,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ', '), '<none>')    as proconfig,
    coalesce((select t.typname::text from pg_type t where t.oid = p.proargtypes[0]), '<none>') as arg1_type,
    coalesce((select t.typname::text from pg_type t where t.oid = p.proargtypes[1]), '<none>') as arg2_type,
    -- PUBLIC is a pseudo-role and is not in pg_roles, so it is read from the ACL
    -- itself. coalesce(... acldefault(...)) is deliberate: a NULL ACL is not
    -- "no privileges" — for a function the default IS EXECUTE to PUBLIC.
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) as public_execute,
    case when exists (select 1 from pg_roles r where r.rolname = 'anon')
         then has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
    case when exists (select 1 from pg_roles r where r.rolname = 'authenticated')
         then has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute,
    case when exists (select 1 from pg_roles r where r.rolname = 'service_role')
         then has_function_privilege('service_role', p.oid, 'EXECUTE') end as service_role_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'vault'
),

-- ── the same functions, unpacked one attribute per row ──────────────────────
-- One generator, used by sections 02, 03 and 04, so every deployed overload is
-- described identically no matter which section it appears in.
vf_attr as (
  select
    f.proname,
    'vault.' || f.proname || '(' || f.identity_args || ') · ' || a.attr as check_name,
    a.observed                                                          as observed_value,
    a.verdict,
    a.detail
  from vf f
  cross join lateral (
    values
      ('full arguments (pg_get_function_arguments)',
       f.full_args, 'INFO',
       'the deployed signature as a caller sees it, defaults included'),
      ('result (pg_get_function_result)',
       f.result_type, 'INFO',
       'the declared return type'),
      ('owner',
       f.owner_name, 'INFO',
       'the role this function executes as when SECURITY DEFINER'),
      ('SECURITY DEFINER',
       f.prosecdef::text, 'INFO',
       'prosecdef — a fact about the deployed Vault, not a CB-002 requirement'),
      ('proconfig (SET clauses)',
       f.proconfig, 'INFO',
       'proconfig — any session settings pinned by the function, e.g. search_path'),
      ('PUBLIC EXECUTE',
       f.public_execute::text,
       case when f.public_execute then 'FAIL' else 'PASS' end,
       'PUBLIC EXECUTE means every role, including a browser role, could call this directly'),
      ('anon EXECUTE',
       coalesce(f.anon_execute::text, 'unknown'),
       case when f.anon_execute is null then 'MANUAL'
            when f.anon_execute then 'FAIL'
            else 'PASS' end,
       'effective privilege, resolved through role membership'),
      ('authenticated EXECUTE',
       coalesce(f.authenticated_execute::text, 'unknown'),
       case when f.authenticated_execute is null then 'MANUAL'
            when f.authenticated_execute then 'FAIL'
            else 'PASS' end,
       'effective privilege, resolved through role membership'),
      ('service_role EXECUTE',
       coalesce(f.service_role_execute::text, 'unknown'), 'INFO',
       'INFO only: service_role is a server-side role, and CB-002 calls Vault as postgres from inside a wrapper, so this fact does not gate CB-002')
  ) as a(attr, observed, verdict, detail)
),

-- ── 05 / 09B · vault.secrets, read from catalogs only ───────────────────────
sec_rel as (
  select
    c.oid,
    c.relkind,
    c.relname,
    pg_get_userbyid(c.relowner)::text            as owner_name,
    c.relacl,
    c.relowner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    (pg_get_userbyid(c.relowner)::text = 'postgres') as owner_is_postgres,
    case when exists (select 1 from pg_roles r where r.rolname = 'postgres')
         then has_table_privilege('postgres', c.oid, 'DELETE') end as postgres_has_delete,
    coalesce((select r.rolsuper     from pg_roles r where r.rolname = 'postgres'), false) as postgres_super,
    coalesce((select r.rolbypassrls from pg_roles r where r.rolname = 'postgres'), false) as postgres_bypassrls,
    -- INSTEAD OF DELETE = tgtype bit 8 (DELETE) + bit 64 (INSTEAD). Only a view
    -- can accept a row delete this way.
    exists (
      select 1
      from pg_trigger t
      where t.tgrelid = c.oid
        and not t.tgisinternal
        and (t.tgtype & 8) = 8
        and (t.tgtype & 64) = 64
    ) as instead_delete_trigger
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'vault'
    and c.relname = 'secrets'
),

-- ── 06 · vault.decrypted_secrets ────────────────────────────────────────────
dec_rel as (
  select
    c.oid,
    c.relkind,
    c.relname,
    pg_get_userbyid(c.relowner)::text                        as owner_name,
    c.relacl,
    c.relowner,
    coalesce(array_to_string(c.reloptions, ', '), '<none>')  as reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'vault'
    and c.relname = 'decrypted_secrets'
),

-- ── 05 · the four-role × four-privilege matrix for vault.secrets ────────────
sec_priv as (
  select
    r.role_name,
    pr.priv_name,
    case
      when r.role_name = 'PUBLIC' then
        exists (
          select 1
          from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          where a.grantee = 0 and a.privilege_type = pr.priv_name
        )
      when not exists (select 1 from pg_roles x where x.rolname = r.role_name) then null
      else has_table_privilege(r.role_name, c.oid, pr.priv_name)
    end as granted
  from sec_rel c
  cross join (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) as r(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'))            as pr(priv_name)
),
sec_role as (
  select
    role_name,
    string_agg(
      priv_name || '=' ||
      case when granted then 'true'
           when granted is null then 'unknown'
           else 'false' end,
      ' ' order by priv_name) as observed_value,
    case
      when role_name = 'service_role' then 'INFO'
      when bool_or(granted) then 'FAIL'
      when count(*) filter (where granted is null) > 0 then 'MANUAL'
      else 'PASS'
    end as verdict
  from sec_priv
  group by role_name
),

-- ── 06 · SELECT only ────────────────────────────────────────────────────────
dec_priv as (
  select
    r.role_name,
    case
      when r.role_name = 'PUBLIC' then
        exists (
          select 1
          from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          where a.grantee = 0 and a.privilege_type = 'SELECT'
        )
      when not exists (select 1 from pg_roles x where x.rolname = r.role_name) then null
      else has_table_privilege(r.role_name, c.oid, 'SELECT')
    end as granted
  from dec_rel c
  cross join (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) as r(role_name)
),
dec_role as (
  select
    role_name,
    case when granted then 'SELECT=true'
         when granted is null then 'SELECT=unknown'
         else 'SELECT=false' end as observed_value,
    case when role_name = 'service_role' then 'INFO'
         when granted is null then 'MANUAL'
         when granted then 'FAIL'
         else 'PASS' end as verdict
  from dec_priv
),

-- ── 07 · USAGE on schema vault ──────────────────────────────────────────────
schema_priv as (
  select
    r.role_name,
    case
      when r.role_name = 'PUBLIC' then
        exists (
          select 1
          from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
          where a.grantee = 0 and a.privilege_type = 'USAGE'
        )
      when not exists (select 1 from pg_roles x where x.rolname = r.role_name) then null
      else has_schema_privilege(r.role_name, n.oid, 'USAGE')
    end as granted
  from vault_ns n
  cross join (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) as r(role_name)
),

-- ── 08 · everything PostgREST leaves in the database (circumstantial) ───────
postgrest as (
  select
    coalesce(current_setting('pgrst.db_schemas', true), '<not set>') as db_schemas,
    coalesce(current_setting('pgrst.db_schema',  true), '<not set>') as db_schema,
    coalesce((
      select string_agg(
               coalesce(r.rolname, '<all roles>') || '/' ||
               coalesce(d.datname, '<all databases>') || ': ' || u.item,
               ' | ' order by u.item)
      from pg_db_role_setting s
      cross join lateral unnest(s.setconfig) as u(item)
      left join pg_roles r    on r.oid = s.setrole
      left join pg_database d on d.oid = s.setdatabase
      where u.item like 'pgrst.%'
    ), '<none>') as role_db_settings,
    coalesce((
      select string_agg(ps.name || ' = ' || ps.setting, ' | ' order by ps.name)
      from pg_settings ps
      where ps.name like 'pgrst.%'
    ), '<none>') as loaded_settings
),

-- ── 09A · is create_secret callable with exactly two supplied arguments? ────
create_secret_cand as (
  select
    f.identity_args,
    f.pronargs,
    f.required_args,
    f.arg1_type,
    f.arg2_type,
    (f.required_args <= 2 and f.pronargs >= 2) as accepts_two,
    (
      (f.required_args <= 2 and f.pronargs >= 2)
      and (
        f.arg1_type in ('text', 'varchar', 'citext')
        or exists (select 1 from pg_cast c
                    where c.castsource = 'text'::regtype
                      and c.casttarget = f.arg1_oid
                      and (c.castcontext = 'i' or c.castmethod = 'b'))
      )
      and (
        f.arg2_type in ('text', 'varchar', 'citext')
        or exists (select 1 from pg_cast c
                    where c.castsource = 'text'::regtype
                      and c.casttarget = f.arg2_oid
                      and (c.castcontext = 'i' or c.castmethod = 'b'))
      )
    ) as text_compatible
  from vf f
  where f.proname = 'create_secret'
),

-- ── 09B · can the intended owner destroy a row from vault.secrets? ──────────
-- The mechanism CB-002 provider_credential_revoke implements is
--   DELETE FROM vault.secrets WHERE id = <vault_secret_id>
-- executed inside a SECURITY DEFINER function owned by postgres. What decides
-- whether that works is the relation KIND, the owner's DELETE capability, and
-- whether row level security could deny it for the owner.
sec_destroy as (
  select
    c.*,
    case
      when c.relkind in ('r', 'p') and not coalesce(c.postgres_has_delete, false) then 'FAIL'
      when c.relkind in ('r', 'p') and c.relrowsecurity and c.relforcerowsecurity
           and not (c.postgres_super or c.postgres_bypassrls) then 'MANUAL'
      when c.relkind in ('r', 'p') then 'PASS'
      when c.relkind = 'v' then case when c.instead_delete_trigger then 'MANUAL' else 'FAIL' end
      when c.relkind = 'm' then 'FAIL'
      else 'MANUAL'
    end as destroy_verdict
  from sec_rel c
)

select section, check_name, observed_value, verdict, detail
from (

  -- ══ 01 · SUPABASE VAULT EXTENSION ════════════════════════════════════════
  select
    '01. SUPABASE VAULT EXTENSION' as section,
    'supabase_vault extension present in pg_extension (exact name)' as check_name,
    case when (select count(*) from vault_ext) = 1 then 'present' else 'absent' end as observed_value,
    case when (select count(*) from vault_ext) = 1 then 'PASS' else 'FAIL' end as verdict,
    'anchored on the exact extension name supabase_vault. Absence means CB-002 cannot deploy: it calls vault.create_secret and reads vault.decrypted_secrets.' as detail
  union all
  select
    '01. SUPABASE VAULT EXTENSION',
    'installed version (pg_extension.extversion)',
    coalesce((select installed_version from vault_ext), '<not installed>'),
    'INFO',
    'record this: argument arity and behaviour differ between Vault releases'
  union all
  select
    '01. SUPABASE VAULT EXTENSION',
    'extension schema (pg_extension.extnamespace) must be vault',
    coalesce((select extension_schema from vault_ext), '<not installed>'),
    case when (select count(*) from vault_ext) = 0 then 'INFO'
         when (select extension_schema from vault_ext) = 'vault' then 'PASS'
         else 'FAIL' end,
    'the extension is installed INTO schema vault. CB-002 addresses objects by schema (vault.<object>), so this must stay vault — it is not the extension name.'
  union all
  select
    '01. SUPABASE VAULT EXTENSION',
    'other extensions whose name mentions vault, or that own schema vault (DIAGNOSTIC ONLY)',
    coalesce((
      select string_agg(extension_name || ' ' || installed_version || ' → ' ||
                        coalesce(extension_schema, '<no schema>'), ' | ' order by extension_name)
      from vault_other_ext), 'none'),
    'INFO',
    'DIAGNOSTIC ONLY — this row never decides a verdict. The presence verdict above is anchored on the exact name, so a differently-named extension can never satisfy it. It exists so an unexpected Vault installation is VISIBLE rather than silently accepted.'
  union all
  select
    '01. SUPABASE VAULT EXTENSION',
    'the extension NAME does not change how CB-002 reaches Vault',
    'schema-qualified through vault: vault.create_secret, vault.secrets, vault.decrypted_secrets',
    'INFO',
    'The extension is NAMED supabase_vault and lives IN schema vault. CB-002 addresses objects by schema, never by extension name, so no call site changes.'

  -- ══ 02 · VAULT.CREATE_SECRET ═════════════════════════════════════════════
  union all
  select
    '02. VAULT.CREATE_SECRET',
    'overloads deployed',
    (select count(*)::text from vf where proname = 'create_secret'),
    case when (select count(*) from vf where proname = 'create_secret') = 0 then 'FAIL' else 'PASS' end,
    'pg_proc, schema vault, proname = create_secret'
  union all
  select '02. VAULT.CREATE_SECRET', a.check_name, a.observed_value, a.verdict, a.detail
  from vf_attr a
  where a.proname = 'create_secret'

  -- ══ 03 · VAULT.UPDATE_SECRET ═════════════════════════════════════════════
  union all
  select
    '03. VAULT.UPDATE_SECRET',
    'overloads deployed',
    (select count(*)::text from vf where proname = 'update_secret'),
    'INFO',
    'INFO, not a gate: CB-002 never calls update_secret — rotation appends a new secret and never rewrites the old one in place'
  union all
  select '03. VAULT.UPDATE_SECRET', a.check_name, a.observed_value, a.verdict, a.detail
  from vf_attr a
  where a.proname = 'update_secret'

  -- ══ 04 · VAULT DELETION CAPABILITY ═══════════════════════════════════════
  union all
  select
    '04. VAULT DELETION CAPABILITY',
    'functions in schema vault whose name matches delete|remove|destroy|revoke',
    (select count(*)::text from vf where proname ~* '(delete|remove|destroy|revoke)'),
    'INFO',
    case when (select count(*) from vf where proname ~* '(delete|remove|destroy|revoke)') = 0
         then 'none found — do NOT assume a deletion function exists. CB-002 retires material by DELETE on vault.secrets; section 09B measures whether that mechanism works.'
         else 'each match is listed below with its exact signature and EXECUTE privileges' end
  union all
  select '04. VAULT DELETION CAPABILITY', a.check_name, a.observed_value, a.verdict, a.detail
  from vf_attr a
  where a.proname ~* '(delete|remove|destroy|revoke)'

  -- ══ 05 · VAULT.SECRETS ═══════════════════════════════════════════════════
  union all
  select
    '05. VAULT.SECRETS',
    'relation exists in schema vault',
    case when (select count(*) from sec_rel) = 1 then 'present' else 'absent' end,
    case when (select count(*) from sec_rel) = 1 then 'PASS' else 'FAIL' end,
    'pg_class + pg_namespace — never read directly, so this works without any Vault privilege. Absent means CB-002 cannot deploy.'
  union all
  select
    '05. VAULT.SECRETS', 'relkind',
    coalesce((select relkind::text from sec_rel), '<absent>'), 'INFO',
    'r = ordinary table, v = view, m = materialized view, f = foreign table'
  union all
  select
    '05. VAULT.SECRETS', 'owner',
    coalesce((select owner_name from sec_rel), '<absent>'), 'INFO',
    'pg_get_userbyid(relowner)'
  union all
  select
    '05. VAULT.SECRETS',
    sr.role_name || ' privileges (SELECT / INSERT / UPDATE / DELETE)',
    sr.observed_value,
    sr.verdict,
    case when sr.role_name = 'service_role'
         then 'INFO: a server-side role. Whether it can reach Vault through the API depends on PostgREST exposure — section 08.'
         else 'a browser role with any privilege here could read or alter stored provider credentials, so all four must be false' end
  from sec_role sr

  -- ══ 06 · VAULT.DECRYPTED_SECRETS ═════════════════════════════════════════
  union all
  select
    '06. VAULT.DECRYPTED_SECRETS',
    'relation exists in schema vault',
    case when (select count(*) from dec_rel) = 1 then 'present' else 'absent' end,
    case when (select count(*) from dec_rel) = 1 then 'PASS' else 'FAIL' end,
    'the view CB-002 resolve reads from. Absent means CB-002 cannot deploy.'
  union all
  select
    '06. VAULT.DECRYPTED_SECRETS', 'relkind',
    coalesce((select relkind::text from dec_rel), '<absent>'), 'INFO',
    'expected v (view). A view without security_invoker runs its query with the view OWNER rights, not the caller''s.'
  union all
  select
    '06. VAULT.DECRYPTED_SECRETS', 'owner',
    coalesce((select owner_name from dec_rel), '<absent>'), 'INFO',
    'pg_get_userbyid(relowner)'
  union all
  select
    '06. VAULT.DECRYPTED_SECRETS', 'reloptions (view options)',
    coalesce((select reloptions from dec_rel), '<absent>'), 'INFO',
    'security_invoker=true would make the view enforce the CALLER''s privileges instead of the owner''s — relevant to whether a SECURITY DEFINER wrapper can read it'
  union all
  select
    '06. VAULT.DECRYPTED_SECRETS',
    dr.role_name || ' SELECT',
    dr.observed_value,
    dr.verdict,
    case when dr.role_name = 'service_role'
         then 'INFO: if true, a backend function holding the service key could read decrypted material directly — but only if the schema is API-exposed (section 08).'
         else 'a browser role that can select here can read plaintext provider credentials' end
  from dec_role dr

  -- ══ 07 · SCHEMA VAULT PRIVILEGES ═════════════════════════════════════════
  union all
  select
    '07. SCHEMA VAULT PRIVILEGES',
    sp.role_name || ' USAGE on schema vault',
    coalesce(sp.granted::text, 'unknown'),
    case when sp.granted is null then 'MANUAL' else 'INFO' end,
    'USAGE alone grants no object access. It matters only in combination: USAGE plus a privilege from sections 05/06 plus API exposure (section 08).'
  from schema_priv sp

  -- ══ 08 · POSTGREST EXPOSURE ══════════════════════════════════════════════
  union all
  select
    '08. POSTGREST EXPOSURE',
    'PostgREST exposed schemas (authoritative)',
    'cannot be established from SQL',
    'MANUAL',
    'MANUAL — cannot establish PostgREST exposed schemas from database catalogs alone'
  union all
  select
    '08. POSTGREST EXPOSURE',
    'pgrst.db_schemas / pgrst.db_schema visible to this session (circumstantial)',
    'db_schemas=' || p.db_schemas || ' ; db_schema=' || p.db_schema,
    'INFO',
    'circumstantial only — PostgREST may be configured entirely outside the database. Do NOT read this as the exposed-schema list.'
  from postgrest p
  union all
  select
    '08. POSTGREST EXPOSURE',
    'pgrst.* settings stored in pg_db_role_setting (circumstantial)',
    p.role_db_settings,
    'INFO',
    'role- or database-level PostgREST settings, if any were stored in the database'
  from postgrest p
  union all
  select
    '08. POSTGREST EXPOSURE',
    'pgrst.* settings loaded in this session (circumstantial)',
    p.loaded_settings,
    'INFO',
    'configuration parameters visible to this backend, if any'
  from postgrest p

  -- ══ 09A · CREATE_SECRET(secret, name) COMPATIBILITY ══════════════════════
  union all
  select
    '09A. CREATE_SECRET COMPATIBILITY',
    'an overload is callable with exactly two supplied arguments, defaults included (verdict for CB-002)',
    coalesce((
      select string_agg('vault.create_secret(' || identity_args || ')', ' | ' order by identity_args)
      from create_secret_cand where accepts_two), 'none'),
    case
      when (select count(*) from create_secret_cand where accepts_two) = 0 then 'FAIL'
      when (select count(*) from create_secret_cand where accepts_two) > 1 then 'MANUAL'
      else 'PASS'
    end,
    'arity test: (input arguments - arguments carrying a default) <= 2 AND total input arguments >= 2'
  union all
  select
    '09A. CREATE_SECRET COMPATIBILITY',
    'candidates accepting two supplied arguments',
    (select count(*)::text from create_secret_cand where accepts_two),
    'INFO',
    '0 is a FAIL for CB-002; more than 1 means a two-argument call is ambiguous and must be disambiguated explicitly'
  union all
  select
    '09A. CREATE_SECRET COMPATIBILITY',
    'candidate vault.create_secret(' || identity_args || ')',
    'required=' || required_args::text ||
    ', total input=' || pronargs::text ||
    ', first two parameter types=' || arg1_type || ', ' || arg2_type ||
    ', accepts two supplied args=' || accepts_two::text,
    'INFO',
    'the parameter types a text-valued call would have to resolve against'
  from create_secret_cand
  union all
  select
    '09A. CREATE_SECRET COMPATIBILITY',
    'a text-valued two-argument call can resolve against a candidate (supporting check)',
    case
      when (select count(*) from create_secret_cand where accepts_two) = 0 then 'no candidate to test'
      else coalesce((
        select string_agg(
                 case when text_compatible then 'compatible' else 'NOT text-compatible' end,
                 ' | ' order by identity_args)
        from create_secret_cand where accepts_two), 'none')
    end,
    case
      when (select count(*) from create_secret_cand where accepts_two) = 0 then 'MANUAL'
      when (select bool_or(text_compatible) from create_secret_cand where accepts_two) then 'PASS'
      else 'FAIL'
    end,
    'CB-002 passes two text values: vault.create_secret(p_secret, v_secret_name). MANUAL here means there is no candidate to test.'
  union all
  select
    '09A. CREATE_SECRET COMPATIBILITY',
    'the exact call CB-002 makes',
    'vault.create_secret(p_secret, v_secret_name) — two text values',
    'INFO',
    'schema-qualified, so the extension must resolve in schema vault (section 01)'

  -- ══ 09B · DESTROY CAPABILITY ═════════════════════════════════════════════
  union all
  select
    '09B. DESTROY CAPABILITY',
    'vault.secrets relkind',
    coalesce((select relkind::text from sec_rel), '<absent>'),
    'INFO',
    'r/p = rows can be deleted; v = view, needs an INSTEAD OF DELETE trigger; m = materialized view, rows cannot be deleted'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'vault.secrets owner',
    coalesce((select owner_name from sec_rel), '<absent>'),
    'INFO',
    'the intended owner of the CB-002 wrappers is postgres'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'postgres is the owner of vault.secrets',
    coalesce((select owner_is_postgres::text from sec_rel), '<absent>'),
    'INFO',
    'ownership is not required — an explicit DELETE grant is equally sufficient'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'postgres has DELETE on vault.secrets (ownership included)',
    coalesce((select postgres_has_delete::text from sec_rel), '<absent>'),
    case when (select count(*) from sec_rel) = 0 then 'MANUAL'
         when (select postgres_has_delete from sec_rel) then 'PASS'
         when (select postgres_has_delete from sec_rel) is null then 'MANUAL'
         else 'FAIL' end,
    'has_table_privilege(''postgres'', vault.secrets, ''DELETE'') — a table owner holds this implicitly'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'row level security enabled on vault.secrets (relrowsecurity)',
    coalesce((select relrowsecurity::text from sec_rel), '<absent>'),
    'INFO',
    'RLS does not apply to a table OWNER unless row security is forced'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'row level security forced on vault.secrets (relforcerowsecurity)',
    coalesce((select relforcerowsecurity::text from sec_rel), '<absent>'),
    'INFO',
    'if this is true and postgres is neither superuser nor BYPASSRLS, a DELETE could be denied at execution time'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'postgres is superuser / has BYPASSRLS',
    coalesce((select 'superuser=' || postgres_super::text || ', bypassrls=' || postgres_bypassrls::text from sec_rel), '<absent>'),
    'INFO',
    'either one settles the forced-RLS caveat above'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'INSTEAD OF DELETE trigger present on vault.secrets',
    coalesce((select instead_delete_trigger::text from sec_rel), '<absent>'),
    'INFO',
    'only meaningful if vault.secrets is a view — and then the trigger body decides whether a row is actually removed'
  union all
  select
    '09B. DESTROY CAPABILITY',
    'the SECURITY DEFINER wrapper owned by postgres can destroy a row from vault.secrets (verdict for CB-002)',
    coalesce((select relkind::text from sec_rel), '<absent>') || ' relation; owner ' ||
    coalesce((select owner_name from sec_rel), '<absent>') || '; postgres DELETE=' ||
    coalesce((select postgres_has_delete::text from sec_rel), 'unknown'),
    coalesce((select destroy_verdict from sec_destroy), 'MANUAL'),
    'CB-002 retires material with DELETE on vault.secrets, inside a SECURITY DEFINER function owned by postgres. FAIL = that mechanism cannot work as implemented. MANUAL = a catalog fact (forced RLS, or an INSTEAD OF trigger whose body is unknowable here) means it cannot be settled from catalogs. This proves the CAPABILITY of the intended owner; the wrapper is not yet deployed, so it does not verify a deployed function.'
) r
order by section, check_name;