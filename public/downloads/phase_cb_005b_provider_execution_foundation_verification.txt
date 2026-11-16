-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VISION — CONNECTED BUSINESS                                              ║
-- ║  CB-005B — DEPLOYED-POSTURE VERIFICATION (READ-ONLY)                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- WHAT THIS FILE IS
--   A single read-only report. It changes nothing, creates nothing, drops nothing
--   and writes no row. It answers one question per requirement: "is the deployed
--   database actually in the posture the CB-005B migration claims to create?"
--
-- WHAT IT CANNOT DO
--   It cannot prove runtime behaviour. Fencing under concurrency, lease recovery,
--   deduplication, checkpoint atomicity and authorization are certified by the
--   executable harness (scripts/cb005bProviderExecutionChecks.cjs), which runs the
--   real shipped modules against a model of these exact contracts. This report
--   certifies the DEPLOYED OBJECTS; the harness certifies the LOGIC. Neither alone
--   is a certification, and CB-005B is not production-certified by either.
--
-- RUN AFTER applying phase_cb_005b_provider_execution_foundation.sql.
-- EXPECT 61 rows, all PASS, except rows AD/AE/AF and BH which are informational
-- posture gates. Every row carries a `class` (CATALOG · EXECUTABLE · STATIC · NOTE),
-- and the four EXECUTABLE rows are functions actually CALLED — read-only, with
-- identifiers that cannot exist and, for the queue probes, only while the queue is
-- empty, so each probe fails closed before touching anything. Rows BA..BD are STATIC
-- and exist for one reason: the ORDER of statements inside a function body (that the
-- renewal locks before it reads the clock, that the completion reads the clock only
-- after its lock, that the claim and the sweep take rows with SKIP LOCKED) is not
-- expressible in the catalogue. The residual ordering facts that a report CANNOT
-- establish read-only — a renewal genuinely blocked on a row lock, an authorization
-- outlived by its lease — are established only by
-- scripts/cb005bConcurrency.pg.test.cjs against a real server. Rows AQ..AT certify the corrected DELETION behavior on the DEPLOYED
-- constraints: the two observation keys into provider_sync_jobs are RESTRICT, the key
-- into business_connections is RESTRICT, the key into provider_credentials is SET
-- NULL, no key on provider_observations cascades at all, and the orchestration
-- cascades that are intentional (the job's keys, the checkpoint's keys) are still
-- cascades — so the fix cannot pass by having flattened the design. Each of those
-- rows asserts an FK COUNT beside the rule, because a rule check over an empty set
-- is vacuously true. Rows AG..AJ certify the corrected invariants on the DEPLOYED objects: the
-- schedule column and its shape constraint, the ingest's conflict refusal, and the
-- renewal budget in renew_lease. Rows AK/AL/AM certify the ingest's own accounting:
-- that a batch which contradicts itself is detected and refused through exactly ONE
-- guard, that the duplicate/conflict classification completes BEFORE the insert and
-- reads only committed rows, and that the receipt exposes the arithmetic. Rows
-- AN/AO/AP certify the cross-job concurrency correction: every writer of a dedup_key
-- is serialized by a per-key transaction lock before it classifies, the observation
-- insert carries no on-conflict clause (a bypassed serialization raises, it never
-- discards), and the receipt counts deliveries and reconciles before any cursor
-- moves. These are STRUCTURAL assertions; the concurrent BEHAVIOUR is exercised only
-- by scripts/cb005bConcurrency.pg.test.cjs against a disposable database.
--
-- Rows AU..AZ certify the ATTEMPT'S ABSOLUTE DEADLINE on the DEPLOYED objects. Row AU
-- is the one to read first, because it is the only row a plausible wrong implementation
-- of this correction would fail: a lease bounded by a DURATION — claimed_at + n
-- seconds, or the requested lease seconds — is satisfied by every late start and leaks
-- exactly the deadline it claims to enforce, so the constraint definition itself is
-- required to name attempt_started_at and max_attempt_seconds and to name neither the
-- claim instant nor the requested interval. AV asserts the clock doctrine: no lifecycle
-- function body reads now(), which is TRANSACTION START time and would answer every
-- deadline question with the instant the transaction began. AW/AX assert the cap at
-- both ends of a lease's life (the grant, and every renewal). AY asserts that an
-- expired attempt is refused under its OWN verdict, independently of and before the
-- lease, so an operator can tell "the attempt ran out of time" from "someone took my
-- claim". AZ asserts the ingest re-reads the deadline at the mutation boundary, after
-- every lock wait — read from def_code, so the assertion is on the CONDITION, not on a
-- refusal message a disabled guard would still leave behind. BI asserts the companion
-- fact the same correction requires: that the LEASE is re-read there too, against a clock
-- read at that instant and the row's own lease expiry, with the identity re-read from the
-- row rather than assumed from the entry fence. The row lock taken at step 2 freezes the
-- row for the whole unit — nobody can extend the lease behind this worker's back — but it
-- cannot freeze TIME, and lease_expires_at names an instant that passes on its own. Both
-- rows are positional: each condition must sit AFTER the per-key advisory lock and BEFORE
-- the one statement that writes evidence.
--
-- EVERY TEXTUAL ASSERTION RUNS AGAINST COMMENT-STRIPPED CODE.
--   pg_get_functiondef returns a function's source INCLUDING its comments, so a
--   sentence written for a human — an explanation naming a frozen table, a note
--   about the insert — reads exactly like code and could turn a correct deployment
--   red. Assertions therefore run against `def_code`: block comments removed, line
--   comments removed, whitespace collapsed. Prose can no longer fail a check, and
--   wrapping can no longer hide a statement.
-- ============================================================================

with required_columns(table_name, column_name) as (
  values
    ('provider_sync_jobs', 'id'),
    ('provider_sync_jobs', 'business_id'),
    ('provider_sync_jobs', 'business_connection_id'),
    ('provider_sync_jobs', 'credential_id'),
    ('provider_sync_jobs', 'credential_type'),
    ('provider_sync_jobs', 'provider'),
    ('provider_sync_jobs', 'provider_operation'),
    ('provider_sync_jobs', 'status'),
    ('provider_sync_jobs', 'priority'),
    ('provider_sync_jobs', 'attempt_count'),
    ('provider_sync_jobs', 'max_attempts'),
    ('provider_sync_jobs', 'max_attempt_seconds'),
    ('provider_sync_jobs', 'attempt_id'),
    ('provider_sync_jobs', 'attempt_started_at'),
    ('provider_sync_jobs', 'claimed_by'),
    ('provider_sync_jobs', 'claimed_at'),
    ('provider_sync_jobs', 'lease_id'),
    ('provider_sync_jobs', 'lease_expires_at'),
    ('provider_sync_jobs', 'lease_renewal_count'),
    ('provider_sync_jobs', 'next_attempt_at'),
    ('provider_sync_jobs', 'last_error_class'),
    ('provider_sync_jobs', 'last_error_code'),
    ('provider_sync_jobs', 'last_error_message'),
    ('provider_sync_jobs', 'completed_at'),
    ('provider_sync_jobs', 'created_at'),
    ('provider_sync_jobs', 'updated_at'),
    ('provider_sync_checkpoints', 'id'),
    ('provider_sync_checkpoints', 'business_id'),
    ('provider_sync_checkpoints', 'business_connection_id'),
    ('provider_sync_checkpoints', 'job_id'),
    ('provider_sync_checkpoints', 'checkpoint_scope'),
    ('provider_sync_checkpoints', 'cursor_kind'),
    ('provider_sync_checkpoints', 'cursor_ordinal'),
    ('provider_sync_checkpoints', 'cursor_token'),
    ('provider_sync_checkpoints', 'cursor_version'),
    ('provider_sync_checkpoints', 'last_batch_id'),
    ('provider_sync_checkpoints', 'last_observation_id'),
    ('provider_sync_checkpoints', 'last_attempt_id'),
    ('provider_sync_checkpoints', 'last_lease_id'),
    ('provider_sync_checkpoints', 'last_advanced_at'),
    ('provider_sync_checkpoints', 'created_at'),
    ('provider_sync_checkpoints', 'updated_at'),
    ('provider_observations', 'id'),
    ('provider_observations', 'business_id'),
    ('provider_observations', 'business_connection_id'),
    ('provider_observations', 'credential_id'),
    ('provider_observations', 'job_id'),
    ('provider_observations', 'attempt_id'),
    ('provider_observations', 'lease_id'),
    ('provider_observations', 'provider'),
    ('provider_observations', 'provider_operation'),
    ('provider_observations', 'object_type'),
    ('provider_observations', 'provider_object_id'),
    ('provider_observations', 'value_kind'),
    ('provider_observations', 'source_version'),
    ('provider_observations', 'source_updated_at'),
    ('provider_observations', 'payload'),
    ('provider_observations', 'payload_hash'),
    ('provider_observations', 'dedup_key'),
    ('provider_observations', 'observed_at'),
    ('provider_observations', 'created_at')
),
required_constraints(table_name, constraint_name) as (
  values
    ('provider_sync_jobs', 'provider_sync_jobs_connection_same_business_fkey'),
    ('provider_sync_jobs', 'provider_sync_jobs_credential_same_business_fkey'),
    ('provider_sync_jobs', 'provider_sync_jobs_id_business_unique'),
    ('provider_sync_jobs', 'provider_sync_jobs_id_connection_unique'),
    ('provider_sync_jobs', 'provider_sync_jobs_provider_check'),
    ('provider_sync_jobs', 'provider_sync_jobs_operation_check'),
    ('provider_sync_jobs', 'provider_sync_jobs_credential_type_check'),
    ('provider_sync_jobs', 'provider_sync_jobs_status_check'),
    ('provider_sync_jobs', 'provider_sync_jobs_error_class_check'),
    ('provider_sync_jobs', 'provider_sync_jobs_lease_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_attempt_bounds'),
    ('provider_sync_jobs', 'provider_sync_jobs_terminal_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_failure_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_retry_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_schedule_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_claimed_by_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_error_code_shape'),
    ('provider_sync_jobs', 'provider_sync_jobs_error_message_shape'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_job_same_business_fkey'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_job_same_connection_fkey'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_job_scope_unique'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_kind_check'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_scope_shape'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_cursor_shape'),
    ('provider_sync_checkpoints', 'provider_sync_checkpoints_kind_payload'),
    ('provider_observations', 'provider_observations_job_same_business_fkey'),
    ('provider_observations', 'provider_observations_job_same_connection_fkey'),
    ('provider_observations', 'provider_observations_connection_same_business_fkey'),
    ('provider_observations', 'provider_observations_credential_same_business_fkey'),
    ('provider_observations', 'provider_observations_dedup_unique'),
    ('provider_observations', 'provider_observations_provider_check'),
    ('provider_observations', 'provider_observations_operation_check'),
    ('provider_observations', 'provider_observations_object_type_check'),
    ('provider_observations', 'provider_observations_value_kind_check'),
    ('provider_observations', 'provider_observations_identity_shape'),
    ('provider_observations', 'provider_observations_payload_shape')
),
fns as (
  select p.oid, p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
         coalesce(p.proconfig::text, '') as proconfig,
         pg_get_functiondef(p.oid) as def,
         -- THE DEPLOYED BODY AS CODE, NOT AS PROSE: block comments removed, line
         -- comments removed, every run of whitespace collapsed to one space. An
         -- assertion can therefore be neither satisfied nor defeated by what a
         -- reviewer wrote beside the code, nor by how the source happens to be
         -- wrapped. These bodies carry no `--` inside a string literal, so the
         -- line-comment strip cannot eat a statement.
         regexp_replace(
           regexp_replace(
             regexp_replace(pg_get_functiondef(p.oid), '/\*([^*]|\*[^/])*\*/', ' ', 'g'),
             '(^|[^-])--[^\n]*', '\1', 'gn'),
           '\s+', ' ', 'g') as def_code
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'provider_sync_job_enqueue', 'provider_sync_job_claim', 'provider_sync_job_renew_lease',
       'provider_sync_job_complete', 'provider_sync_job_sweep', 'provider_sync_job_authorize',
       'provider_sync_observation_ingest'
     )
),
priv_matrix as (
  select r.role_name, t.table_name, p.priv,
         has_table_privilege(r.role_name, 'public.' || t.table_name, p.priv) as granted
    from (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
    cross join (values ('provider_sync_jobs'), ('provider_sync_checkpoints'), ('provider_observations')) t(table_name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
  union all
  -- MAINTAIN exists only from PostgreSQL 17; asking an older server for it raises
  -- and would abort the whole report. These rows are generated only where the
  -- privilege exists — the CB-001 audit exposed an arwdDxtm default, so this
  -- deployment has it, but the report must not depend on that to run at all.
  select r.role_name, t.table_name, 'MAINTAIN',
         has_table_privilege(r.role_name, 'public.' || t.table_name, 'MAINTAIN')
    from (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
    cross join (values ('provider_sync_jobs'), ('provider_sync_checkpoints'), ('provider_observations')) t(table_name)
   where current_setting('server_version_num')::int >= 170000
),
fn_privs as (
  select f.proname,
         has_function_privilege('service_role', f.oid, 'EXECUTE') as service_role_exec,
         has_function_privilege('anon', f.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', f.oid, 'EXECUTE') as authenticated_exec
    from fns f
),
facts as (
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public'
        and table_name in ('provider_sync_jobs', 'provider_sync_checkpoints', 'provider_observations')) as tables_present,
    (select count(*) from required_columns c
      where c.table_name = 'provider_sync_jobs'
        and not exists (select 1 from information_schema.columns ic
                         where ic.table_schema = 'public' and ic.table_name = c.table_name
                           and ic.column_name = c.column_name)) as jobs_missing_cols,
    (select count(*) from required_columns c
      where c.table_name = 'provider_sync_checkpoints'
        and not exists (select 1 from information_schema.columns ic
                         where ic.table_schema = 'public' and ic.table_name = c.table_name
                           and ic.column_name = c.column_name)) as checkpoints_missing_cols,
    (select count(*) from required_columns c
      where c.table_name = 'provider_observations'
        and not exists (select 1 from information_schema.columns ic
                         where ic.table_schema = 'public' and ic.table_name = c.table_name
                           and ic.column_name = c.column_name)) as observations_missing_cols,
    (select count(*) from required_constraints rc
      where not exists (select 1 from pg_constraint con
                         join pg_class cl on cl.oid = con.conrelid
                         join pg_namespace n on n.oid = cl.relnamespace
                        where n.nspname = 'public' and cl.relname = rc.table_name
                          and con.conname = rc.constraint_name)) as missing_constraints,
    (select count(*) from (values
        ('provider_sync_jobs_claimable_idx'), ('provider_sync_jobs_expired_lease_idx'),
        ('provider_sync_jobs_business_idx'), ('provider_sync_jobs_connection_idx'),
        ('provider_sync_jobs_one_active_per_scope_idx'),
        ('provider_sync_checkpoints_job_idx'), ('provider_sync_checkpoints_business_idx'),
        ('provider_observations_object_idx'), ('provider_observations_job_idx'),
        ('provider_observations_attempt_idx'), ('provider_observations_connection_idx')
      ) i(name)
      where not exists (select 1 from pg_indexes ix
                         where ix.schemaname = 'public' and ix.indexname = i.name)) as missing_indexes,
    -- Asked of the CATALOGUE, not of the rendered text: PostgreSQL canonicalises an
    -- `in (...)` predicate into `= ANY (ARRAY[...])` when it prints an index
    -- definition, so matching the source spelling could fail a correct deployment.
    coalesce((select bool_and(i.indisunique and i.indpred is not null
                              and pg_get_expr(i.indpred, i.indrelid) ~* 'queued'
                              and pg_get_expr(i.indpred, i.indrelid) ~* 'claimed'
                              and pg_get_expr(i.indpred, i.indrelid) ~* 'retry_wait')
                from pg_index i
                join pg_class c on c.oid = i.indexrelid
               where c.relname = 'provider_sync_jobs_one_active_per_scope_idx'), false) as active_scope_index_is_partial,
    (select count(*) from fns) as fn_count,
    (select bool_and(f.prosecdef) from fns f) as all_security_definer,
    (select bool_and(f.owner = 'postgres') from fns f) as all_owned_by_postgres,
    (select bool_and(f.proconfig like '%search_path%') from fns f) as all_search_path_pinned,
    (select bool_and(f.service_role_exec and not f.anon_exec and not f.authenticated_exec) from fn_privs f) as fn_exec_service_role_only,
    (select bool_and(granted) from priv_matrix where role_name = 'service_role' and priv = 'SELECT') as service_role_select_all,
    (select bool_or(granted) from priv_matrix
      where role_name = 'service_role'
        and priv in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')) as service_role_has_write,
    (select bool_or(granted) from priv_matrix where role_name = 'anon') as anon_has_any,
    (select bool_or(granted) from priv_matrix where role_name = 'authenticated') as authenticated_has_any,
    (select bool_and(c.relrowsecurity) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('provider_sync_jobs', 'provider_sync_checkpoints', 'provider_observations')) as rls_enabled_all,
    (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in ('provider_sync_jobs', 'provider_sync_checkpoints', 'provider_observations')) as policy_count,
    (select bool_and(polroles = '{service_role}'::name[] and polcmd = 'r')
       from pg_policies
      where schemaname = 'public'
        and tablename in ('provider_sync_jobs', 'provider_sync_checkpoints', 'provider_observations')) as policies_service_role_select_only,
    (select count(*) from public.provider_sync_jobs) as jobs_rows,
    (select count(*) from public.provider_sync_checkpoints) as checkpoint_rows,
    (select count(*) from public.provider_observations) as observation_rows,
    (select count(*) from public.business_facts) as fact_rows,
    (select count(*) from public.business_fact_evidence) as evidence_rows,
    (select count(*) from public.business_fact_conflicts) as conflict_rows,
    -- The Digital Twin freeze, asserted on CODE: a comment that NAMES a frozen table
    -- is prose about the rule, not a write to it, so the search runs on def_code.
    -- The pattern covers the whole evidence family plus the metric object the freeze
    -- also names.
    (select bool_and(f.def_code !~* '(business_fact|dashboard_metric)')
        from fns f) as fns_free_of_fact_tables,
    -- Vault and the network, named as the CALLS that would appear: the pg_net HTTP
    -- surface is reached as `net.http_post(...)`, which does not contain the string
    -- "pg_net" at all, so the pattern covers the schema-qualified call too.
    (select bool_and(f.def_code !~* '\m(vault|create_secret|decrypted_secrets|dblink|pg_net|net|http)')
        from fns f) as fns_free_of_vault_and_network,
    (select (select count(*) from fns f where f.proname = 'provider_sync_observation_ingest'
                and (length(f.def_code) - length(replace(f.def_code, 'insert into public.provider_observations', '')))
                    / length('insert into public.provider_observations') = 1
                and f.def_code not like '%update public.provider_observations%'
                and f.def_code not like '%delete from public.provider_observations%')) as ingest_single_insert,
    (select exists (select 1 from pg_constraint con
                      join pg_class cl on cl.oid = con.conrelid
                     where cl.relname = 'provider_operation_audit'
                       and con.conname = 'provider_operation_audit_operation_check'
                       and pg_get_constraintdef(con.oid) like '%sync.execute%')) as audit_has_sync_execute,
    -- ── the two corrected invariants, on the deployed objects ──────────────
    -- next_attempt_at MUST be nullable: the claim clears it, and a NOT NULL column
    -- that a lifecycle writer assigns NULL to is a contradiction the first claim
    -- would discover at runtime.
    (select bool_and(ic.is_nullable = 'YES') from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = 'provider_sync_jobs'
        and ic.column_name = 'next_attempt_at') as schedule_column_nullable,
    -- No STORED row may break the schedule invariant. A queued/retry_wait job
    -- without a schedule is unclaimable in silence, and a claimed/terminal one
    -- carrying a schedule is a lifecycle writer that forgot to clear it.
    (select not exists (
        select 1 from public.provider_sync_jobs j
         where (j.status in ('queued', 'retry_wait')) <> (j.next_attempt_at is not null))) as schedule_invariant_holds,
    -- The conflict refusal must sit BEFORE the cursor advance in the deployed body,
    -- so a contradiction can never be absorbed by moving the cursor past it.
    -- The refusal must sit BEFORE the insert as well as before the cursor advance, so
    -- a contradiction can never be absorbed by storing a surviving row or by moving
    -- the cursor past the page. Judged on def_code, so no comment can shift it.
    (select strpos(f.def_code, 'OBSERVATION_CONFLICT') > 0
        and strpos(f.def_code, 'insert into public.provider_observations') > 0
        and strpos(f.def_code, 'set cursor_version = c.cursor_version + 1') > 0
        and strpos(f.def_code, 'OBSERVATION_CONFLICT')
            < strpos(f.def_code, 'insert into public.provider_observations')
        and strpos(f.def_code, 'OBSERVATION_CONFLICT')
            < strpos(f.def_code, 'set cursor_version = c.cursor_version + 1')
       from fns f where f.proname = 'provider_sync_observation_ingest') as conflict_refused_before_advance,
    -- The renewal budget must be refused, not tripped: attempt_bounds caps
    -- lease_renewal_count at 100, so an unguarded +1 raises a CHECK violation.
    (select f.def_code like '%lease_renewal_count < 100%'
       from fns f where f.proname = 'provider_sync_job_renew_lease') as renewal_budget_guard,
    -- ── the ingest's own accounting, on the deployed objects ────────────────
    -- A batch that contradicts ITSELF — one dedup_key delivered with more than one
    -- payload_hash — must be detected explicitly and refused through exactly ONE
    -- guard, so no second path can absorb it.
    (select f.def_code like '%(count(distinct payload_hash) > 1) as contradicts_itself%'
        and f.def_code like '%filter (where contradicts_itself)%'
        and (length(f.def_code) - length(replace(f.def_code, 'if v_conflicts > 0 then', '')))
            / length('if v_conflicts > 0 then') = 1
       from fns f where f.proname = 'provider_sync_observation_ingest') as batch_contradiction_detected,
    -- The classification reads COMMITTED rows and completes BEFORE the insert: no
    -- count is derived from a statement seeing the rows it has just written, which
    -- is what made a contradiction between two deliveries of one page invisible.
    (select strpos(f.def_code, 'left join public.provider_observations') > 0
        and strpos(f.def_code, 'left join public.provider_observations')
            < strpos(f.def_code, 'insert into public.provider_observations')
        and strpos(f.def_code, 'stored_hash = first_hash') > 0
        and strpos(f.def_code, 'stored_hash = first_hash')
            < strpos(f.def_code, 'insert into public.provider_observations')
        and strpos(f.def_code, 'into v_conflicts, v_duplicates')
            < strpos(f.def_code, 'insert into public.provider_observations')
       from fns f where f.proname = 'provider_sync_observation_ingest') as classified_before_insert,
    -- The receipt carries what was DELIVERED beside what was written, so
    -- delivered = inserted + duplicates can be reconciled rather than trusted.
    (select f.def_code like '%''delivered'', v_delivered_count%'
        and f.def_code like '%''inserted'', v_inserted%'
        and f.def_code like '%''duplicates'', v_duplicates%'
       from fns f where f.proname = 'provider_sync_observation_ingest') as receipt_accounting_exposed,
    -- ── cross-job serialization, on the deployed objects ────────────────────
    -- Every writer of a dedup_key takes a transaction-scoped advisory lock on it, in
    -- lock-id order, BEFORE it classifies, so two jobs delivering one key are
    -- serialized and the second classifies against the first's committed row.
    (select strpos(f.def_code, 'perform pg_advisory_xact_lock(v_lock_key);') > 0
        and strpos(f.def_code, 'hashtextextended(') > 0
        and strpos(f.def_code, 'order by 1 loop perform pg_advisory_xact_lock(v_lock_key);') > 0
        and strpos(f.def_code, 'perform pg_advisory_xact_lock(v_lock_key);')
            < strpos(f.def_code, 'left join public.provider_observations')
       from fns f where f.proname = 'provider_sync_observation_ingest') as observation_keys_serialized,
    -- The observation insert carries NO on-conflict clause: a unique violation raises
    -- and rolls the unit back; it can never discard a payload.
    (select strpos(f.def_code, 'returning id, dedup_key') > strpos(f.def_code, 'insert into public.provider_observations')
        and strpos(f.def_code, 'insert into public.provider_observations') > 0
        and position('on conflict' in substr(f.def_code,
              strpos(f.def_code, 'insert into public.provider_observations'),
              strpos(f.def_code, 'returning id, dedup_key')
                - strpos(f.def_code, 'insert into public.provider_observations'))) = 0
       from fns f where f.proname = 'provider_sync_observation_ingest') as observation_insert_never_discards,
    -- The receipt counts DELIVERIES and must reconcile with the store before any
    -- cursor can move; otherwise the unit is refused as OBSERVATION_RACE.
    (select f.def_code like '%coalesce(sum(delivered_count), 0)::int into v_conflicts, v_duplicates, v_absent_keys, v_delivered_count%'
        and f.def_code like '%v_inserted + v_duplicates + v_conflicts <> v_delivered_count%'
        and strpos(f.def_code, 'OBSERVATION_RACE') > strpos(f.def_code, 'insert into public.provider_observations')
        and strpos(f.def_code, 'OBSERVATION_RACE') < strpos(f.def_code, 'set cursor_version = c.cursor_version + 1')
       from fns f where f.proname = 'provider_sync_observation_ingest') as receipt_reconciled_before_advance,
    -- ── evidence retention: the DELETION RULES, read from the catalogue ──────
    -- confdeltype is the deleting action the DEPLOYED constraint carries:
    --   'r' RESTRICT · 'c' CASCADE · 'n' SET NULL · 'a' NO ACTION · 'd' SET DEFAULT
    -- Read from pg_constraint because the rule is a property of the constraint as the
    -- server stored it, not of the text that asked for it.
    --
    -- SET NULL is impossible for a tenant column and RESTRICT is impossible for a
    -- childless one, so the FK COUNT is asserted beside every rule: bool_and over an
    -- empty set is TRUE, and a report that passes because it found nothing to check
    -- is exactly the false green this file exists to prevent.
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_observations' and c.contype = 'f'
        and c.confrelid = 'public.provider_sync_jobs'::regclass) as observation_job_fk_count,
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_observations' and c.contype = 'f'
        and c.confrelid = 'public.provider_sync_jobs'::regclass
        and c.confdeltype = 'r') as observation_job_fk_restrict_count,
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_observations' and c.contype = 'f'
        and c.confrelid = 'public.business_connections'::regclass
        and c.confdeltype = 'r') as observation_connection_fk_restrict,
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_observations' and c.contype = 'f'
        and c.confrelid = 'public.provider_credentials'::regclass
        and c.confdeltype = 'n') as observation_credential_fk_set_null,
    -- A cascade into EVIDENCE would be the original defect: assert its absence
    -- directly, over every FK the evidence table carries.
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_observations' and c.contype = 'f' and c.confdeltype = 'c') as observation_cascading_fks,
    -- The checkpoint keys are the ONE intentional cascade, and they still must be.
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_sync_checkpoints' and c.contype = 'f'
        and c.confrelid = 'public.provider_sync_jobs'::regclass) as checkpoint_job_fk_count,
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_sync_checkpoints' and c.contype = 'f'
        and c.confrelid = 'public.provider_sync_jobs'::regclass
        and c.confdeltype = 'c') as checkpoint_job_fk_cascade_count,
    -- The orchestration cascade upstream of the job is ALSO intentional, and is what
    -- the evidence boundary has to stop: assert it is still a cascade, so a report of
    -- "no cascade anywhere" cannot pass by having flattened the whole design.
    (select count(*) from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid
      where cl.relname = 'provider_sync_jobs' and c.contype = 'f'
        and c.confrelid in ('public.business_connections'::regclass, 'public.provider_credentials'::regclass)
        and c.confdeltype = 'c') as job_orchestration_cascade_count,
    -- ── THE ATTEMPT'S ABSOLUTE DEADLINE ────────────────────────────────────
    -- Read from pg_get_constraintdef: the constraint AS THE SERVER STORED IT. The
    -- distinction is the whole point of the row. A lease bounded by a DURATION —
    -- claimed_at + n seconds, or a literal — is satisfied by every late start and
    -- therefore leaks exactly the deadline it claims to enforce. Only a bound stated
    -- against attempt_started_at + max_attempt_seconds — the attempt's ABSOLUTE
    -- deadline, the instant the grant is capped at and authorize, ingest and complete
    -- each refuse at — closes it. Hence both the positive assertions on the three
    -- column names and the negative ones on the two duration-relative spellings.
    (select pg_get_constraintdef(con.oid) from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid
      where cl.relname = 'provider_sync_jobs'
        and con.conname = 'provider_sync_jobs_lease_within_attempt') as lease_within_attempt_def,
    -- A deadline answered by now() is answered with TRANSACTION START time: one long
    -- transaction — a lock wait, a slow statement — would keep reporting itself inside
    -- its budget after it had left it. Judged on def_code, so a comment that names
    -- now() is prose about the rule, not a call to it.
    (select count(*) from fns f where f.def_code ~ '\mnow\(\)') as functions_reading_now,
    -- The claim must CAP its grant at the attempt's own budget, not merely honour the
    -- requested lease seconds.
    (select f.def_code like '%least(%'
        and f.def_code like '%v_now + make_interval(secs => j.max_attempt_seconds)%'
        and f.def_code not like '%lease_expires_at = v_now + make_interval(secs => p_lease_seconds)%'
      from fns f where f.proname = 'provider_sync_job_claim') as claim_caps_grant_at_deadline,
    -- renew must state the deadline TWICE: once to refuse AT or after it, once to cap
    -- what it extends. One occurrence is a renewal that can outlive the budget.
    (select (length(f.def_code)
             - length(replace(f.def_code, 'j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)', '')))
              / length('j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)') = 2
        and f.def_code like '%and v_now < j.attempt_started_at%'
      from fns f where f.proname = 'provider_sync_job_renew_lease') as renew_refuses_and_caps_at_deadline,
    -- authorize AND complete must each refuse an expired attempt under their OWN
    -- verdict, and that refusal must sit BEFORE the lease refusal: otherwise "my attempt
    -- ran out of time" reaches the operator as "someone took my claim".
    ((select f.def_code ~ 'attempt_expired'
         and f.def_code like '%clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds)%'
         and strpos(f.def_code, 'attempt_expired') < strpos(f.def_code, 'lease_expired')
       from fns f where f.proname = 'provider_sync_job_authorize')
     and (select strpos(f.def_code, 'ATTEMPT_EXPIRED') > 0
         and strpos(f.def_code, 'ATTEMPT_EXPIRED') < strpos(f.def_code, 'v_job.lease_expires_at <=')
       from fns f where f.proname = 'provider_sync_job_complete')) as expired_attempt_refused_independently,
    -- The ingest must re-read the deadline AT the mutation boundary: a live wall-clock
    -- condition (not a message, and not a disabled guard), read after the row lock and
    -- ahead of the one statement that writes evidence.
    (select f.def_code like '%if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then%'
        and f.def_code like '%while the unit waited for its keys%'
        and strpos(f.def_code, 'v_now := clock_timestamp()') > strpos(f.def_code, 'for update;')
        and strpos(f.def_code, 'clock_timestamp() >= v_job.attempt_started_at')
            < strpos(f.def_code, 'insert into public.provider_observations')
      from fns f where f.proname = 'provider_sync_observation_ingest') as ingest_rereads_deadline_before_write,
    -- THE LEASE IS RE-READ AT THAT SAME BOUNDARY, and this is the row that separates the
    -- correction from the defect it removes. The job-row lock has been held since step 2,
    -- so the identity and the row itself cannot have changed while the unit waited for its
    -- keys — but the CLOCK has, and lease_expires_at names an instant that passes on its
    -- own. A lease that was live when the unit arrived can therefore be lapsed by the time
    -- it is ready to write, and only a reading taken at that instant refuses it. Asserted
    -- on def_code: a live CONDITION (the fresh v_now against the row's own lease instant),
    -- taken after the per-key lock and ahead of the one statement that writes evidence,
    -- with the identity re-read from the row rather than assumed from the entry fence.
    (select f.def_code like '%v_now := clock_timestamp();%'
        and f.def_code like '%if v_now >= v_job.lease_expires_at then%'
        and f.def_code like '%lease_expired while the unit waited for its keys%'
        and f.def_code like '%where j.id = p_job_id;%'
        and strpos(f.def_code, 'v_now >= v_job.lease_expires_at')
            > strpos(f.def_code, 'perform pg_advisory_xact_lock(v_lock_key);')
        and strpos(f.def_code, 'where j.id = p_job_id;')
            > strpos(f.def_code, 'perform pg_advisory_xact_lock(v_lock_key);')
        and strpos(f.def_code, 'v_now >= v_job.lease_expires_at')
            < strpos(f.def_code, 'insert into public.provider_observations')
      from fns f where f.proname = 'provider_sync_observation_ingest') as ingest_rechecks_lease_after_locks
),
-- HOW EACH ROW IS ESTABLISHED. Every row is labelled, because the three kinds of
-- evidence are not interchangeable:
--   CATALOG     the deployed objects, read from the system catalogue: columns,
--               constraints, index predicates, RLS, policies, grants, function
--               attributes, and the constraint AS THE SERVER STORED IT.
--   EXECUTABLE  the deployed FUNCTIONS actually CALLED (read-only) with identifiers
--               that cannot exist and, for the queue probes, only while the queue is
--               empty. Each probe is chosen so it fails CLOSED before touching
--               anything, so running this report cannot write.
--   STATIC      the deployed function BODY as code (comments stripped, whitespace
--               collapsed). Used only where the catalogue cannot express the fact:
--               the ORDER of statements inside one function, which no catalogue view
--               exposes. The harness (scripts/cb005bProviderExecutionChecks.cjs)
--               carries the remaining static assertions about the migration FILE, and
--               scripts/cb005bConcurrency.pg.test.cjs carries the behavioural ones.
row_class(id, class) as (
  values
    ('A','CATALOG'), ('B','CATALOG'), ('C','CATALOG'), ('D','CATALOG'), ('E','CATALOG'), ('F','CATALOG'),
    ('G','CATALOG'), ('H','CATALOG'), ('I','CATALOG'), ('J','CATALOG'), ('K','CATALOG'), ('L','CATALOG'),
    ('M','CATALOG'), ('N','CATALOG'), ('O','CATALOG'), ('P','CATALOG'), ('Q','CATALOG'), ('R','CATALOG'),
    ('S','CATALOG'), ('T','CATALOG'), ('W','CATALOG'), ('X','CATALOG'), ('Y','CATALOG'), ('Z','CATALOG'),
    ('AA','CATALOG'), ('AB','CATALOG'), ('AC','CATALOG'), ('AG','CATALOG'), ('AH','CATALOG'), ('AU','CATALOG'),
    ('AD','NOTE'), ('AE','NOTE'), ('AF','NOTE'),
    ('BE','EXECUTABLE'), ('BF','EXECUTABLE'), ('BG','EXECUTABLE'), ('BH','EXECUTABLE'),
    ('BI','STATIC')
)
select report.*, coalesce(rc.class, 'STATIC') as class
  from (
  select 'A' as id, 'three CB-005B tables exist' as requirement,
         case when f.tables_present = 3 then 'PASS' else 'FAIL' end as verdict from facts f
  union all select 'B', 'provider_sync_jobs has every required column',
               case when f.jobs_missing_cols = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'C', 'provider_sync_checkpoints has every required column',
               case when f.checkpoints_missing_cols = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'D', 'provider_observations has every required column',
               case when f.observations_missing_cols = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'E', 'every required constraint exists (FKs, vocabularies, shape, uniqueness)',
               case when f.missing_constraints = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'F', 'every required index exists',
               case when f.missing_indexes = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'G', 'the one-active-job-per-scope index is PARTIAL on the live statuses',
               case when f.active_scope_index_is_partial then 'PASS' else 'FAIL' end from facts f
  union all select 'H', 'seven functions deployed',
               case when f.fn_count = 7 then 'PASS' else 'FAIL' end from facts f
  union all select 'I', 'every function is SECURITY DEFINER',
               case when f.all_security_definer then 'PASS' else 'FAIL' end from facts f
  union all select 'J', 'every function is owned by postgres',
               case when f.all_owned_by_postgres then 'PASS' else 'FAIL' end from facts f
  union all select 'K', 'every function has a pinned search_path',
               case when f.all_search_path_pinned then 'PASS' else 'FAIL' end from facts f
  union all select 'L', 'function EXECUTE is granted to service_role ONLY',
               case when f.fn_exec_service_role_only then 'PASS' else 'FAIL' end from facts f
  union all select 'M', 'service_role holds SELECT on all three tables',
               case when f.service_role_select_all then 'PASS' else 'FAIL' end from facts f
  union all select 'N', 'service_role holds NO write privilege on any of the three tables',
               case when not f.service_role_has_write then 'PASS' else 'FAIL' end from facts f
  union all select 'O', 'anon holds NO privilege on any of the three tables',
               case when not f.anon_has_any then 'PASS' else 'FAIL' end from facts f
  union all select 'P', 'authenticated holds NO privilege on any of the three tables',
               case when not f.authenticated_has_any then 'PASS' else 'FAIL' end from facts f
  union all select 'Q', 'RLS is enabled explicitly on all three tables',
               case when f.rls_enabled_all then 'PASS' else 'FAIL' end from facts f
  union all select 'R', 'exactly three policies exist (one per table)',
               case when f.policy_count = 3 then 'PASS' else 'FAIL' end from facts f
  union all select 'S', 'every policy targets service_role and SELECT only',
               case when f.policies_service_role_select_only then 'PASS' else 'FAIL' end from facts f
  union all select 'T', 'the ingest writer contains exactly one INSERT into provider_observations and no UPDATE/DELETE',
               case when f.ingest_single_insert then 'PASS' else 'FAIL' end from facts f
  union all select 'U', 'no CB-005B function references a business-fact table (Digital Twin freeze)',
               case when f.fns_free_of_fact_tables then 'PASS' else 'FAIL' end from facts f
  union all select 'V', 'no CB-005B function touches Vault or the network',
               case when f.fns_free_of_vault_and_network then 'PASS' else 'FAIL' end from facts f
  union all select 'W', 'provider_sync_jobs is empty',
               case when f.jobs_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'X', 'provider_sync_checkpoints is empty',
               case when f.checkpoint_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'Y', 'provider_observations is empty',
               case when f.observation_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'Z', 'business_facts = 0 (freeze intact)',
               case when f.fact_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AA', 'business_fact_evidence = 0 (freeze intact)',
               case when f.evidence_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AB', 'business_fact_conflicts = 0 (freeze intact)',
               case when f.conflict_rows = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AC', 'audit vocabulary still contains sync.execute (CB-004.2 applied)',
               case when f.audit_has_sync_execute then 'PASS' else 'FAIL' end from facts f
  union all select 'AD', 'NOTE: counts of zero assert THIS deployment, not upstream truth (UNKNOWN != ZERO)',
               'INFO' from facts f
  union all select 'AE', 'NOTE: runtime fencing/lease/dedup behaviour is certified by the executable harness, not here',
               'INFO' from facts f
  union all select 'AF', 'NOTE: CB-005B is NOT production certified by this report',
               'INFO' from facts f
  union all select 'AG', 'provider_sync_jobs.next_attempt_at is NULLABLE (its nullability is load-bearing)',
               case when f.schedule_column_nullable then 'PASS' else 'FAIL' end from facts f
  union all select 'AH', 'every stored job satisfies the schedule invariant (claimable jobs carry a schedule; claimed and terminal jobs do not)',
               case when f.schedule_invariant_holds then 'PASS' else 'FAIL' end from facts f
  union all select 'AI', 'the ingest refuses a conflicting payload BEFORE it can advance any cursor',
               case when f.conflict_refused_before_advance then 'PASS' else 'FAIL' end from facts f
  union all select 'AJ', 'renew_lease refuses past the renewal budget instead of tripping attempt_bounds',
               case when f.renewal_budget_guard then 'PASS' else 'FAIL' end from facts f
  union all select 'AK', 'the ingest detects a batch that contradicts itself, through exactly one refusal guard',
               case when f.batch_contradiction_detected then 'PASS' else 'FAIL' end from facts f
  union all select 'AL', 'duplicate/conflict classification completes BEFORE the insert, from committed rows only',
               case when f.classified_before_insert then 'PASS' else 'FAIL' end from facts f
  union all select 'AM', 'the ingest receipt exposes delivered / inserted / duplicates for reconciliation',
               case when f.receipt_accounting_exposed then 'PASS' else 'FAIL' end from facts f
  union all select 'AN', 'every writer of a dedup_key is serialized across jobs by a per-key transaction lock taken BEFORE classification',
               case when f.observation_keys_serialized then 'PASS' else 'FAIL' end from facts f
  union all select 'AO', 'the observation insert has no on-conflict clause, so no payload can be silently discarded',
               case when f.observation_insert_never_discards then 'PASS' else 'FAIL' end from facts f
  union all select 'AP', 'the receipt counts deliveries and must reconcile with the store before any cursor moves',
               case when f.receipt_reconciled_before_advance then 'PASS' else 'FAIL' end from facts f
  union all select 'AQ', 'both observation keys into provider_sync_jobs are ON DELETE RESTRICT (deleting a job cannot remove evidence)',
               case when f.observation_job_fk_count = 2 and f.observation_job_fk_restrict_count = 2 then 'PASS' else 'FAIL' end from facts f
  union all select 'AR', 'the observation key into business_connections is ON DELETE RESTRICT (disconnecting cannot remove evidence)',
               case when f.observation_connection_fk_restrict = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'AS', 'the observation key into provider_credentials is ON DELETE SET NULL (evidence survives credential deletion)',
               case when f.observation_credential_fk_set_null = 1 then 'PASS' else 'FAIL' end from facts f
  union all select 'AT', 'no FK on provider_observations cascades, and the ORCHESTRATION cascades are still in place (job, checkpoint)',
               case when f.observation_cascading_fks = 0
                          and f.checkpoint_job_fk_count = 2 and f.checkpoint_job_fk_cascade_count = 2
                          and f.job_orchestration_cascade_count = 2
                    then 'PASS' else 'FAIL' end from facts f
  union all select 'AU', 'the lease can never outlive the attempt''s ABSOLUTE deadline (attempt_started_at + max_attempt_seconds) — not a duration cap relative to the claim instant or the requested lease seconds',
               case when f.lease_within_attempt_def is not null
                          and f.lease_within_attempt_def like '%lease_expires_at%'
                          and f.lease_within_attempt_def like '%attempt_started_at%'
                          and f.lease_within_attempt_def like '%max_attempt_seconds%'
                          and f.lease_within_attempt_def not like '%claimed_at%'
                          and f.lease_within_attempt_def not like '%p_lease_seconds%'
                    then 'PASS' else 'FAIL' end from facts f
  union all select 'AV', 'no lifecycle function reads now(): every scheduling and deadline instant is read from clock_timestamp()',
               case when f.functions_reading_now = 0 then 'PASS' else 'FAIL' end from facts f
  union all select 'AW', 'the claim CAPS the lease it grants at the attempt deadline',
               case when f.claim_caps_grant_at_deadline then 'PASS' else 'FAIL' end from facts f
  union all select 'AX', 'renew_lease refuses AT or after the deadline AND caps what it extends at that same instant',
               case when f.renew_refuses_and_caps_at_deadline then 'PASS' else 'FAIL' end from facts f
  union all select 'AY', 'authorize and complete each refuse an expired attempt under their OWN verdict, before the lease test',
               case when f.expired_attempt_refused_independently then 'PASS' else 'FAIL' end from facts f
  union all select 'AZ', 'the ingest re-reads the deadline AT the mutation boundary, as a live condition ahead of the observation insert',
               case when f.ingest_rereads_deadline_before_write then 'PASS' else 'FAIL' end from facts f
  union all select 'BI', 'the ingest re-reads the LEASE at that same boundary — the row lock freezes the row, never the clock — so a lease that lapsed while the unit waited for its keys is refused before any observation is written',
               case when f.ingest_rechecks_lease_after_locks then 'PASS' else 'FAIL' end from facts f
  union all select 'BA', 'the RENEWAL takes the row lock BEFORE it reads the clock, so a renewal served after a wait is judged against the instant it holds the row — not the instant it arrived',
               case when (select strpos(f.def_code, 'for update;') > 0
                            and strpos(f.def_code, 'v_now := clock_timestamp();') > 0
                            and strpos(f.def_code, 'for update;') < strpos(f.def_code, 'v_now := clock_timestamp();')
                            and f.def_code like '%v_now timestamptz;%'
                            and f.def_code not like '%v_now timestamptz := clock_timestamp();%'
                            and f.def_code not like '%now()%'
                     from fns f where f.proname = 'provider_sync_job_renew_lease')
                    then 'PASS' else 'FAIL' end
  union all select 'BB', 'the renewal keeps EVERY fence and the 100-renewal budget as a REFUSAL (zero rows matched) rather than a CHECK violation, and still caps what it grants at the deadline',
               case when (select f.def_code like '%j.status = ''claimed''%'
                            and f.def_code like '%j.attempt_id = p_attempt_id%'
                            and f.def_code like '%j.lease_id = p_lease_id%'
                            and f.def_code like '%j.claimed_by = p_worker_id%'
                            and f.def_code like '%j.lease_expires_at > v_now%'
                            and f.def_code like '%v_now < j.attempt_started_at + make_interval(secs => j.max_attempt_seconds)%'
                            and f.def_code like '%j.lease_renewal_count < 100%'
                            and f.def_code like '%lease_expires_at = least(%'
                     from fns f where f.proname = 'provider_sync_job_renew_lease')
                    then 'PASS' else 'FAIL' end
  union all select 'BC', 'the completion reads the clock only AFTER its row lock and declares no pre-lock instant, so its deadline verdict cannot be paid for with stale time',
               case when (select strpos(f.def_code, 'for update;') > 0
                            and strpos(f.def_code, 'clock_timestamp() >= v_job.attempt_started_at') > strpos(f.def_code, 'for update;')
                            and f.def_code not like '%v_now timestamptz%'
                     from fns f where f.proname = 'provider_sync_job_complete')
                    then 'PASS' else 'FAIL' end
  union all select 'BD', 'the claim and the sweep take their rows with FOR UPDATE SKIP LOCKED, so neither pays a lock wait that could age the instant it decides with',
               case when (select f.def_code like '%for update skip locked%' and f.def_code not like '%now()%'
                     from fns f where f.proname = 'provider_sync_job_claim')
                    and (select f.def_code like '%for update skip locked%' and f.def_code not like '%now()%'
                     from fns f where f.proname = 'provider_sync_job_sweep')
                    then 'PASS' else 'FAIL' end
  union all select 'BE', 'EXECUTABLE — authorization refuses an UNKNOWN attempt read-only (verified=false, job_not_found) without locking and without writing',
               case when (select z.r->>'verified' = 'false' and z.r->>'claim_state' = 'job_not_found'
                     from (select public.provider_sync_job_authorize(
                             '00000000-0000-0000-0000-00000000a001'::uuid,
                             '00000000-0000-0000-0000-00000000a002'::uuid,
                             '00000000-0000-0000-0000-00000000a003'::uuid,
                             'cb005b-verification-probe') as r) z)
                    then 'PASS' else 'FAIL' end
  union all select 'BF', 'EXECUTABLE — the renewal refuses an UNKNOWN job (false) and writes nothing',
               case when (select not z.ok
                     from (select public.provider_sync_job_renew_lease(
                             '00000000-0000-0000-0000-00000000a001'::uuid,
                             '00000000-0000-0000-0000-00000000a002'::uuid,
                             '00000000-0000-0000-0000-00000000a003'::uuid,
                             'cb005b-verification-probe', 180) as ok) z)
                    then 'PASS' else 'FAIL' end
  union all select 'BG', 'EXECUTABLE — the completion answers NOT_FOUND for an UNKNOWN job, writing nothing',
               case when (select z.v = 'NOT_FOUND'
                     from (select public.provider_sync_job_complete(
                             '00000000-0000-0000-0000-00000000a001'::uuid,
                             '00000000-0000-0000-0000-00000000a002'::uuid,
                             '00000000-0000-0000-0000-00000000a003'::uuid,
                             'cb005b-verification-probe', 'completed') as v) z)
                    then 'PASS' else 'FAIL' end
  union all select 'BH', 'EXECUTABLE — on an EMPTY queue the claim grants nothing and the sweep retires nothing (the probe runs only while nothing exists; INFO otherwise)',
               case when (select count(*) from public.provider_sync_jobs) > 0 then 'INFO'
                    when (select count(*) from public.provider_sync_job_claim('cb005b-verification-probe', 1, 30)) = 0
                     and (select public.provider_sync_job_sweep(1)) = 0 then 'PASS'
                    else 'FAIL' end
) report
  left join row_class rc on rc.id = report.id
 order by report.id;