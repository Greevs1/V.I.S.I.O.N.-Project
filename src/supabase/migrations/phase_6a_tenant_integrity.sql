-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  ⚠  OBSOLETE — SUPERSEDED BY phase_6b1_safe_foundation.sql  ⚠             ║
-- ║                                                                           ║
-- ║  MARKED OBSOLETE IN PHASE 6B.1.  DO NOT EXECUTE THIS FILE.                ║
-- ║                                                                           ║
-- ║  Phase 6B verified this migration against the live database and found it   ║
-- ║  rests on a FALSE premise. Of its 11 statements:                          ║
-- ║    • 4 are ALREADY APPLIED  (business_id, session_type, and both indexes)  ║
-- ║    • 4 are UNNECESSARY      (canonical_business_id columns, strategy FK)   ║
-- ║    • 1 is IMPOSSIBLE        (§3 — freedom_projections.business_id is       ║
-- ║                              TEXT NOT NULL, so SET NULL raises an error)   ║
-- ║    • 1 WOULD REGRESS ACCESS (§8 — adding profile_id = auth.uid() policies  ║
-- ║                              is PERMISSIVE in Postgres and ORs with the    ║
-- ║                              existing can_access_business policy, which    ║
-- ║                              would BROADEN access, not restrict it)        ║
-- ║    • 1 contained real work  (the assessment_calculations backfill)         ║
-- ║                                                                           ║
-- ║  Root cause: no FK anywhere references the legacy `businesses` table.      ║
-- ║  Every business FK already targets business_entities(id), so the           ║
-- ║  "canonical business transition" this file plans is already the status quo.║
-- ║                                                                           ║
-- ║  Retained for audit trail only. See:                                      ║
-- ║    src/PHASE_6B1_DIGITAL_TWIN_READINESS_CLOSURE_REPORT.md §18             ║
-- ║    src/supabase/migrations/phase_6b1_safe_foundation.sql                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 6A — TENANT INTEGRITY & CANONICAL BUSINESS FOUNDATION
--
-- PREPARED MIGRATION — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
--
-- This migration is ADDITIVE and NON-DESTRUCTIVE. It:
--   1. Adds business_id to galileo_conversations (nullable for legacy)
--   2. Adds session_type to galileo_conversations
--   3. Backfills assessment_calculations.business_id from assessment_sessions
--   4. Adds FK constraints where data is verified safe
--   5. Does NOT drop any tables, columns, or constraints
--   6. Does NOT change any existing column types
--
-- SAFETY RULES:
--   - All new columns are nullable (existing records unaffected)
--   - All FK constraints are added only where existing data is valid
--   - All backfills use deterministic joins (no assumptions)
--   - Legacy `businesses` table is NOT touched
--
-- Manually execute in Supabase SQL Editor after reviewing the report.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. galileo_conversations: add business_id + session_type ─────────────────
ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES business_entities(id) ON DELETE SET NULL;

ALTER TABLE galileo_conversations
  ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'home_conversation';

-- Index for business-scoped conversation queries
CREATE INDEX IF NOT EXISTS idx_galileo_conversations_business_id
  ON galileo_conversations(business_id)
  WHERE business_id IS NOT NULL;

-- ── 2. assessment_calculations: backfill business_id from assessment_sessions ─
-- This is SAFE because the relationship is deterministic:
--   assessment_calculations.session_id → assessment_sessions.id → assessment_sessions.business_id
UPDATE assessment_calculations ac
  SET business_id = (
    SELECT s.business_id
    FROM assessment_sessions s
    WHERE s.id = ac.session_id
  )
  WHERE ac.business_id IS NULL
  AND ac.session_id IS NOT NULL;

-- Index for business-scoped calculation queries
CREATE INDEX IF NOT EXISTS idx_assessment_calculations_business_id
  ON assessment_calculations(business_id)
  WHERE business_id IS NOT NULL;

-- ── 3. freedom_projections: clean up invalid business_id values ───────────────
-- The audit found business_id = "test-biz" (not a UUID) in freedom_projections.
-- This is INVALID data. Set to NULL so it can be re-resolved.
-- Do NOT add FK constraint until all values are valid UUIDs.
UPDATE freedom_projections
  SET business_id = NULL
  WHERE business_id IS NOT NULL
  AND business_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── 4. strategy_outcomes: add FK if data exists and is valid ──────────────────
-- strategy_outcomes is currently empty (0 records), so FK is safe to add.
-- If the table has TEXT business_id, this migration does NOT change the type.
-- A type change requires a separate migration with explicit approval.
DO $$
BEGIN
  -- Only attempt if the column exists and is UUID-compatible
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategy_outcomes'
    AND column_name = 'business_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE strategy_outcomes
      ADD CONSTRAINT IF NOT EXISTS strategy_outcomes_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES business_entities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 5. next_best_actions: transition FK from businesses to business_entities ─
-- The audit confirmed businesses.id = business_entities.id (identical UUIDs).
-- The FK can be safely migrated because the IDs are the same.
-- However, we use an additive transition pattern: keep the existing FK,
-- add a new canonical_business_id column, and let application code migrate.
-- The FK swap requires dropping the old constraint, which needs approval.

-- Step 5a: Add canonical_business_id column (additive, nullable)
ALTER TABLE next_best_actions
  ADD COLUMN IF NOT EXISTS canonical_business_id UUID REFERENCES business_entities(id) ON DELETE SET NULL;

-- Step 5b: Backfill canonical_business_id from business_id (safe because IDs match)
UPDATE next_best_actions
  SET canonical_business_id = business_id
  WHERE canonical_business_id IS NULL
  AND business_id IS NOT NULL;

-- Step 5c: Index for canonical_business_id queries
CREATE INDEX IF NOT EXISTS idx_next_best_actions_canonical_business_id
  ON next_best_actions(canonical_business_id)
  WHERE canonical_business_id IS NOT NULL;

-- ── 6. saved_playbooks: same additive transition pattern ─────────────────────
ALTER TABLE saved_playbooks
  ADD COLUMN IF NOT EXISTS canonical_business_id UUID REFERENCES business_entities(id) ON DELETE SET NULL;

UPDATE saved_playbooks
  SET canonical_business_id = business_id
  WHERE canonical_business_id IS NULL
  AND business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_playbooks_canonical_business_id
  ON saved_playbooks(canonical_business_id)
  WHERE canonical_business_id IS NOT NULL;

-- ── 7. value_creation_events: add FK for roadmap_item_id (RESTRICT) ───────────
-- The audit found an orphan risk: value_creation_events.roadmap_item_id has no FK.
-- We recommend RESTRICT (not CASCADE) to avoid deleting historical value evidence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'value_creation_events_roadmap_item_id_fkey'
  ) THEN
    ALTER TABLE value_creation_events
      ADD CONSTRAINT value_creation_events_roadmap_item_id_fkey
      FOREIGN KEY (roadmap_item_id) REFERENCES roadmap_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 8. RLS: enable on galileo_conversations (business-scoped) ─────────────────
-- galileo_conversations currently has no RLS. Enable it with a policy that
-- restricts access to the profile_id or business_id scope.
ALTER TABLE galileo_conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'galileo_conversations_select_policy'
  ) THEN
    CREATE POLICY galileo_conversations_select_policy ON galileo_conversations
      FOR SELECT USING (
        auth.role() = 'service_role'
        OR profile_id = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'galileo_conversations_insert_policy'
  ) THEN
    CREATE POLICY galileo_conversations_insert_policy ON galileo_conversations
      FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
        OR profile_id = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'galileo_conversations_update_policy'
  ) THEN
    CREATE POLICY galileo_conversations_update_policy ON galileo_conversations
      FOR UPDATE USING (
        auth.role() = 'service_role'
        OR profile_id = auth.uid()
      );
  END IF;
END $$;

-- ── ROLLBACK INSTRUCTIONS ────────────────────────────────────────────────────
-- To rollback this migration:
--
-- ALTER TABLE galileo_conversations DROP COLUMN IF EXISTS business_id;
-- ALTER TABLE galileo_conversations DROP COLUMN IF EXISTS session_type;
-- DROP INDEX IF EXISTS idx_galileo_conversations_business_id;
-- DROP INDEX IF EXISTS idx_assessment_calculations_business_id;
-- DROP INDEX IF EXISTS idx_next_best_actions_canonical_business_id;
-- DROP INDEX IF EXISTS idx_saved_playbooks_canonical_business_id;
-- ALTER TABLE next_best_actions DROP COLUMN IF EXISTS canonical_business_id;
-- ALTER TABLE saved_playbooks DROP COLUMN IF EXISTS canonical_business_id;
-- ALTER TABLE value_creation_events DROP CONSTRAINT IF EXISTS value_creation_events_roadmap_item_id_fkey;
-- ALTER TABLE strategy_outcomes DROP CONSTRAINT IF EXISTS strategy_outcomes_business_id_fkey;
-- DROP POLICY IF EXISTS galileo_conversations_select_policy ON galileo_conversations;
-- DROP POLICY IF EXISTS galileo_conversations_insert_policy ON galileo_conversations;
-- DROP POLICY IF EXISTS galileo_conversations_update_policy ON galileo_conversations;
-- ALTER TABLE galileo_conversations DISABLE ROW LEVEL SECURITY;