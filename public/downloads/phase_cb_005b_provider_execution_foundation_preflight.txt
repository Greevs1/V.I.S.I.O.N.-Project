-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VISION — CONNECTED BUSINESS                                              ║
-- ║  CB-005B — INSTALL PREFLIGHT (READ-ONLY)                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- WHAT THIS FILE IS
--   A single read-only report answering ONE question before installation: "is this
--   schema in a state where phase_cb_005b_provider_execution_foundation.sql may be
--   applied?" Run it FIRST. It changes nothing: no DDL, no DML, no policy, no grant,
--   no function call at all. It reads pg_class, pg_proc, pg_policies, pg_constraint and
--   pg_attribute only — never one of the three tables, because reading a table that
--   does not exist would abort the report it exists to produce.
--
-- WHY A PREFLIGHT EXISTS AT ALL
--   The migration is SINGLE-USE and FAIL-CLOSED (its §0 guard). It refuses to run
--   against a schema that already holds any of its objects, because the alternative —
--   CREATE TABLE IF NOT EXISTS meeting a table whose shape has drifted, or a policy
--   re-created on top of one that was re-pointed — would accept an incompatible schema
--   in silence. Repairing a partly installed schema is an operator's deliberate
--   decision, taken with this report in hand; it is never something the migration does
--   to a database that may already hold evidence.
--
-- WHAT IT REPORTS
--   one row per object class, plus a summary that names the posture:
--     PRISTINE            nothing of CB-005B exists — the migration may be applied
--     PARTIALLY_INSTALLED some objects exist — DO NOT install; reset deliberately
--     ALREADY_INSTALLED   every object exists — run the verification report instead
--   When tables exist, their load-bearing columns and constraints are checked too, so
--   an INCOMPATIBLE shape is named here rather than discovered mid-migration.
--
-- ORDER OF OPERATIONS
--   1. this file            → expect PRISTINE
--   2. the migration        → applies once, or refuses and says what it found
--   3. the verification     → expect 60 rows, AD/AE/AF/BH informational
--
-- RUN: this file, on the target database, BEFORE the migration.
-- ============================================================================

with expected_tables(name) as (
  values ('provider_sync_jobs'), ('provider_sync_checkpoints'), ('provider_observations')
),
expected_functions(name) as (
  values ('provider_sync_job_enqueue'), ('provider_sync_job_claim'), ('provider_sync_job_renew_lease'),
         ('provider_sync_job_complete'), ('provider_sync_job_sweep'), ('provider_sync_job_authorize'),
         ('provider_sync_observation_ingest')
),
expected_policies(name) as (
  values ('provider_sync_jobs_service_role_select'),
         ('provider_sync_checkpoints_service_role_select'),
         ('provider_observations_service_role_select')
),
expected_constraints(name) as (
  values ('provider_sync_jobs_lease_shape'), ('provider_sync_jobs_attempt_bounds'),
         ('provider_sync_jobs_lease_within_attempt'), ('provider_sync_jobs_schedule_shape'),
         ('provider_sync_checkpoints_job_scope_unique'), ('provider_observations_dedup_unique')
),
load_bearing(table_name, column_name) as (
  values ('provider_sync_jobs', 'attempt_id'), ('provider_sync_jobs', 'attempt_started_at'),
         ('provider_sync_jobs', 'max_attempt_seconds'), ('provider_sync_jobs', 'lease_id'),
         ('provider_sync_jobs', 'lease_expires_at'), ('provider_sync_jobs', 'lease_renewal_count'),
         ('provider_sync_jobs', 'next_attempt_at'),
         ('provider_sync_checkpoints', 'cursor_version'), ('provider_sync_checkpoints', 'cursor_ordinal'),
         ('provider_sync_checkpoints', 'checkpoint_scope'),
         ('provider_observations', 'dedup_key'), ('provider_observations', 'payload_hash')
),
facts as (
  select
    (select count(*) from expected_tables e
      where exists (select 1 from pg_class c
                      join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = e.name)) as tables_present,
    (select count(*) from expected_functions e
      where exists (select 1 from pg_proc p
                      join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = e.name)) as functions_present,
    (select count(*) from expected_policies e
      where exists (select 1 from pg_policies pp
                     where pp.schemaname = 'public' and pp.policyname = e.name)) as policies_present,
    (select count(*) from expected_constraints e
      where exists (select 1 from pg_constraint c where c.conname = e.name)) as constraints_present,
    -- Privilege-free: pg_attribute, not information_schema, so a low-privilege run
    -- cannot report a column as missing merely because it may not see it.
    (select count(*) from load_bearing lb
      where exists (select 1 from pg_class c
                      join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = lb.table_name)
        and not exists (select 1 from pg_attribute a
                          join pg_class c on c.oid = a.attrelid
                          join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relname = lb.table_name
                           and a.attname = lb.column_name and a.attnum > 0 and not a.attisdropped)) as load_bearing_missing
)
select * from (
  select 1 as ord, 'SUMMARY' as check_name, 'CB-005B install posture' as object,
         'nothing present' as expected,
         'tables ' || f.tables_present || '/3 · functions ' || f.functions_present || '/7'
           || ' · policies ' || f.policies_present || '/3 · constraints ' || f.constraints_present || '/6' as observed,
         case when f.tables_present = 0 and f.functions_present = 0 and f.policies_present = 0
                then 'PRISTINE — phase_cb_005b_provider_execution_foundation.sql may be applied'
              when f.tables_present = 3 and f.functions_present = 7
                then 'ALREADY_INSTALLED — do not install again; run phase_cb_005b_provider_execution_foundation_verification.sql'
              else 'PARTIALLY_INSTALLED — do not install; reset this database deliberately first'
         end as verdict
    from facts f
  union all select 2, 'tables', 'provider_sync_jobs · provider_sync_checkpoints · provider_observations',
         '3', f.tables_present || '/3',
         case when f.tables_present = 0 then 'ABSENT'
              when f.tables_present = 3 then 'PRESENT'
              else 'PARTIAL' end
    from facts f
  union all select 3, 'functions', 'enqueue · claim · renew_lease · complete · sweep · authorize · ingest',
         '7', f.functions_present || '/7',
         case when f.functions_present = 0 then 'ABSENT'
              when f.functions_present = 7 then 'PRESENT'
              else 'PARTIAL' end
    from facts f
  union all select 4, 'policies', 'one service_role SELECT policy per table',
         '3', f.policies_present || '/3',
         case when f.policies_present = 0 then 'ABSENT'
              when f.policies_present = 3 then 'PRESENT'
              else 'PARTIAL' end
    from facts f
  union all select 5, 'constraints', 'lease_shape · attempt_bounds · lease_within_attempt · schedule_shape · job_scope_unique · dedup_unique',
         '6', f.constraints_present || '/6',
         case when f.tables_present = 0 then 'NOT APPLICABLE (no tables)'
              when f.constraints_present = 6 then 'PRESENT'
              else 'INCOMPATIBLE SHAPE — constraints are missing on an existing table' end
    from facts f
  union all select 6, 'columns', 'the load-bearing columns of each table (attempt deadline, lease, renewal budget, schedule, cursor, dedup)',
         'all present',
         case when f.tables_present = 0 then 'NOT APPLICABLE (no tables)'
              else (12 - f.load_bearing_missing) || '/12 present' end,
         case when f.tables_present = 0 then 'NOT APPLICABLE (no tables)'
              when f.load_bearing_missing = 0 then 'PRESENT'
              else 'INCOMPATIBLE SHAPE — ' || f.load_bearing_missing || ' load-bearing column(s) missing' end
    from facts f
) preflight
order by preflight.ord;