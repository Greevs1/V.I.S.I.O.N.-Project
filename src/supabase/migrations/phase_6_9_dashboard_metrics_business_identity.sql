-- ============================================================================
-- Phase 6.9 — dashboard_metrics business-scoped identity
--
-- DEFECT
--   `upsertDashboardMetrics` keyed its lookup on profile_id alone, and the table
--   carried a single metrics row per PROFILE. For an owner of several
--   businesses that means one row serves them all: saving Business B's metrics
--   OVERWRITES Business A's numbers.
--
-- OBSERVED SHAPE (probed before writing this migration, read-only):
--   dashboard_metrics — 5 rows, 5 distinct profiles,
--                       0 profiles holding more than one business row,
--                       0 rows with a null business_id.
--   ⇒ No row currently holds a second business's data, so nothing has to be
--     split and NO existing row is collapsed or deleted by this migration.
--
-- SAFETY
--   * Idempotent — safe to re-run.
--   * Destructive action limited to dropping a UNIQUE constraint/index that
--     covers profile_id WITHOUT business_id (that is the constraint that forces
--     the single-row-per-profile shape).
--   * No data is inserted, updated, or deleted.
--   * If duplicate business_id rows exist, the CREATE UNIQUE INDEX fails loudly
--     and nothing else in the transaction is committed.
--
-- HOW TO RUN
--   Step 1 — PREFLIGHT (read-only, run it and read the output)
--   Step 2 — MIGRATION (everything between BEGIN and COMMIT)
--   Step 3 — VERIFICATION (read-only, run it and read the output)
-- Then re-run the interactive business-switch test.
-- ============================================================================


-- ############################################################################
-- STEP 1 — PREFLIGHT  (read-only; modifies nothing)
-- ############################################################################

-- P1. The "before" picture: every unique constraint / primary key currently on
--     dashboard_metrics, with its real definition. EXPECT to see a constraint
--     covering profile_id WITHOUT business_id — that is the defect this
--     migration removes, and the one that forced one row per profile.
SELECT c.conname                   AS constraint_name,
       c.contype                   AS kind,          -- 'u' = unique, 'p' = primary key
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t     ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = 'dashboard_metrics'
  AND n.nspname = 'public'
  AND c.contype IN ('u', 'p')
ORDER BY c.conname;

-- P2. The "before" picture: every index on dashboard_metrics, unique or not.
SELECT i.indexrelid::regclass::text AS index_name,
       i.indisunique                AS is_unique,
       i.indisprimary               AS is_primary,
       EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
                                    AS backs_constraint,
       pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class t     ON t.oid = i.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = 'dashboard_metrics'
  AND n.nspname = 'public'
ORDER BY index_name;

-- P3. Row shape, and the two numbers that decide whether the migration is safe.
--     duplicate_business_ids MUST be 0 — the CREATE UNIQUE INDEX cannot succeed
--     otherwise. EXPECT: zero. (No such row is merged, moved, or deleted here.)
SELECT count(*)                                    AS total_rows,
       count(DISTINCT profile_id)                  AS distinct_profiles,
       count(DISTINCT business_id)                 AS distinct_businesses,
       count(*) FILTER (WHERE business_id IS NULL) AS null_business_rows,
       (SELECT count(*) FROM (
          SELECT business_id FROM public.dashboard_metrics
           WHERE business_id IS NOT NULL
           GROUP BY business_id HAVING count(*) > 1
        ) d)                                       AS duplicate_business_ids
FROM public.dashboard_metrics;

-- P4. Confirm the scoping column exists, is a uuid, and is nullable (legacy rows
--     without a business must remain valid, not be deleted).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'dashboard_metrics'
  AND column_name IN ('id', 'profile_id', 'business_id')
ORDER BY column_name;

-- P5. Hard stop. Anything other than 0 duplicates raises here, so the migration
--     never proceeds on ambiguous data. Same check as P3, but fatal.
DO $$
DECLARE dup_business integer;
BEGIN
  SELECT count(*) INTO dup_business FROM (
    SELECT business_id FROM public.dashboard_metrics
     WHERE business_id IS NOT NULL
     GROUP BY business_id HAVING count(*) > 1
  ) d;

  IF dup_business > 0 THEN
    RAISE EXCEPTION '[phase_6_9] STOP — % business_id value(s) appear more than once. Resolve them before applying; nothing was changed.', dup_business;
  END IF;

  RAISE NOTICE '[phase_6_9] preflight OK — no duplicate business_id values. Safe to apply.';
END $$;


-- ############################################################################
-- STEP 2 — MIGRATION
-- ############################################################################

BEGIN;

-- ── 1. Pre-flight report (informational only — no writes) ───────────────────
DO $$
DECLARE
  total_rows        integer;
  distinct_profiles integer;
  distinct_business integer;
  null_business     integer;
  dup_business      integer;
BEGIN
  SELECT count(*), count(DISTINCT profile_id), count(DISTINCT business_id),
         count(*) FILTER (WHERE business_id IS NULL)
    INTO total_rows, distinct_profiles, distinct_business, null_business
  FROM public.dashboard_metrics;

  SELECT count(*) INTO dup_business FROM (
    SELECT business_id FROM public.dashboard_metrics
    WHERE business_id IS NOT NULL
    GROUP BY business_id HAVING count(*) > 1
  ) d;

  RAISE NOTICE '[phase_6_9] dashboard_metrics: rows=%, profiles=%, businesses=%, null_business=%, duplicate_business_ids=%',
    total_rows, distinct_profiles, distinct_business, null_business, dup_business;

  IF dup_business > 0 THEN
    RAISE EXCEPTION '[phase_6_9] % business_id value(s) appear more than once — resolve duplicates before applying', dup_business;
  END IF;
END $$;

-- ── 2. Drop a profile-only UNIQUE CONSTRAINT on dashboard_metrics ───────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'dashboard_metrics'
      AND n.nspname = 'public'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) ILIKE '%profile_id%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%business_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.dashboard_metrics DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE '[phase_6_9] dropped profile-only unique constraint: %', r.conname;
  END LOOP;
END $$;

-- ── 3. Drop a profile-only UNIQUE INDEX not backed by a constraint ──────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT i.indexrelid::regclass::text AS idx
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'dashboard_metrics'
      AND n.nspname = 'public'
      AND i.indisunique
      AND pg_get_indexdef(i.indexrelid) ILIKE '%profile_id%'
      AND pg_get_indexdef(i.indexrelid) NOT ILIKE '%business_id%'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', r.idx);
    RAISE NOTICE '[phase_6_9] dropped profile-only unique index: %', r.idx;
  END LOOP;
END $$;

-- ── 4. One metrics row per BUSINESS ────────────────────────────────────────
-- Partial index: legacy rows with no business_id are left unconstrained rather
-- than deleted, and are classified as PROFILE_WIDE_AMBIGUOUS in the report.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dashboard_metrics_business_id
  ON public.dashboard_metrics (business_id)
  WHERE business_id IS NOT NULL;

COMMENT ON COLUMN public.dashboard_metrics.business_id IS
  'Phase 6.9: dashboard_metrics identity is business-scoped (one row per business). profile_id alone must never be used as the upsert key.';

COMMIT;


-- ############################################################################
-- STEP 3 — VERIFICATION  (read-only; modifies nothing)
-- ############################################################################

-- V1. The single assertion that matters. All three columns must read
--     profile_only_constraints = 0, profile_only_indexes = 0, business_index = 1.
--       profile_only_constraints — a UNIQUE/PRIMARY constraint over profile_id
--                                  WITHOUT business_id still present  → must be 0
--       profile_only_indexes     — a standalone UNIQUE index over profile_id
--                                  WITHOUT business_id still present  → must be 0
--       business_index           — the new per-business unique index      → must be 1
SELECT
  (SELECT count(*)
     FROM pg_constraint c
     JOIN pg_class t     ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'dashboard_metrics' AND n.nspname = 'public'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) ILIKE '%profile_id%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%business_id%'
  ) AS profile_only_constraints,                    -- EXPECT 0

  (SELECT count(*)
     FROM pg_index i
     JOIN pg_class t     ON t.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'dashboard_metrics' AND n.nspname = 'public'
      AND i.indisunique
      AND pg_get_indexdef(i.indexrelid) ILIKE '%profile_id%'
      AND pg_get_indexdef(i.indexrelid) NOT ILIKE '%business_id%'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
  ) AS profile_only_indexes,                        -- EXPECT 0

  (SELECT count(*)
     FROM pg_index i
     JOIN pg_class t     ON t.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'dashboard_metrics' AND n.nspname = 'public'
      AND i.indexrelid::regclass::text = 'ux_dashboard_metrics_business_id'
  ) AS business_index;                              -- EXPECT 1

-- V2. The new index in full: it must be UNIQUE, VALID, READY, on exactly
--     (business_id), and PARTIAL with a WHERE business_id IS NOT NULL clause.
--     A valid+ready unique index IS the enforcement proof — Postgres would have
--     refused to build it if duplicate business_id values existed.
SELECT i.indexrelid::regclass::text AS index_name,
       i.indisunique                 AS is_unique,      -- EXPECT true
       i.indisvalid                  AS is_valid,       -- EXPECT true
       i.indisready                  AS is_ready,       -- EXPECT true
       pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class t     ON t.oid = i.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = 'dashboard_metrics'
  AND n.nspname = 'public'
  AND i.indexrelid::regclass::text = 'ux_dashboard_metrics_business_id';

-- V3. The definitive "the old profile-only uniqueness is gone" check: list every
--     remaining constraint touching profile_id, so you can see for yourself that
--     none of them is unique-without-business.
SELECT c.conname                   AS constraint_name,
       c.contype                   AS kind,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t     ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = 'dashboard_metrics'
  AND n.nspname = 'public'
  AND pg_get_constraintdef(c.oid) ILIKE '%profile_id%'
ORDER BY c.conname;                                  -- EXPECT no unique row lacking business_id

-- V4. Data untouched. Every number must equal its PREFLIGHT counterpart from P3.
--     No row was inserted, updated, merged, or deleted.
SELECT count(*)                                    AS total_rows,
       count(DISTINCT profile_id)                  AS distinct_profiles,
       count(DISTINCT business_id)                 AS distinct_businesses,
       count(*) FILTER (WHERE business_id IS NULL) AS null_business_rows
FROM public.dashboard_metrics;

-- V5. The column comment landed (confirms the migration actually committed,
--     rather than a step silently no-op'ing).
SELECT col_description('public.dashboard_metrics'::regclass,
                       (SELECT ordinal_position
                          FROM information_schema.columns
                         WHERE table_schema = 'public'
                           AND table_name   = 'dashboard_metrics'
                           AND column_name  = 'business_id')) AS business_id_comment;