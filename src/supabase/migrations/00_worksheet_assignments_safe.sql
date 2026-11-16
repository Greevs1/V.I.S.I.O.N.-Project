-- WORKSHEET ASSIGNMENTS - SAFE MIGRATION (NON-DESTRUCTIVE)
-- This migration safely adds missing columns and indexes
-- Does NOT drop table or delete data

-- ── ADD MISSING COLUMNS ─────────────────────────────────────────────────────

-- worksheet_id (TEXT, not UUID as initially planned - stores Base44 entity ID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'worksheet_id'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN worksheet_id TEXT NOT NULL DEFAULT 'temp';
    ALTER TABLE worksheet_assignments ALTER COLUMN worksheet_id DROP DEFAULT;
    RAISE NOTICE 'Added column: worksheet_id';
  ELSE
    RAISE NOTICE 'Column worksheet_id already exists';
  END IF;
END $$;

-- assigned_to_profile_id (UUID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'assigned_to_profile_id'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN assigned_to_profile_id UUID;
    RAISE NOTICE 'Added column: assigned_to_profile_id';
  ELSE
    RAISE NOTICE 'Column assigned_to_profile_id already exists';
  END IF;
END $$;

-- assigned_to_business_id (UUID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'assigned_to_business_id'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN assigned_to_business_id UUID;
    RAISE NOTICE 'Added column: assigned_to_business_id';
  ELSE
    RAISE NOTICE 'Column assigned_to_business_id already exists';
  END IF;
END $$;

-- assigned_by_profile_id (UUID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'assigned_by_profile_id'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN assigned_by_profile_id UUID;
    RAISE NOTICE 'Added column: assigned_by_profile_id';
  ELSE
    RAISE NOTICE 'Column assigned_by_profile_id already exists';
  END IF;
END $$;

-- status (TEXT with default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'assigned';
    RAISE NOTICE 'Added column: status';
  ELSE
    RAISE NOTICE 'Column status already exists';
  END IF;
END $$;

-- due_date (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'due_date'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN due_date TIMESTAMPTZ;
    RAISE NOTICE 'Added column: due_date';
  ELSE
    RAISE NOTICE 'Column due_date already exists';
  END IF;
END $$;

-- scheduled_for (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN scheduled_for TIMESTAMPTZ;
    RAISE NOTICE 'Added column: scheduled_for';
  ELSE
    RAISE NOTICE 'Column scheduled_for already exists';
  END IF;
END $$;

-- reminder_settings (JSONB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'reminder_settings'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN reminder_settings JSONB DEFAULT '{"type": "none", "method": "in_app", "enabled": false}';
    RAISE NOTICE 'Added column: reminder_settings';
  ELSE
    RAISE NOTICE 'Column reminder_settings already exists';
  END IF;
END $$;

-- assigned_at (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN assigned_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added column: assigned_at';
  ELSE
    RAISE NOTICE 'Column assigned_at already exists';
  END IF;
END $$;

-- completed_at (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN completed_at TIMESTAMPTZ;
    RAISE NOTICE 'Added column: completed_at';
  ELSE
    RAISE NOTICE 'Column completed_at already exists';
  END IF;
END $$;

-- cancelled_at (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN cancelled_at TIMESTAMPTZ;
    RAISE NOTICE 'Added column: cancelled_at';
  ELSE
    RAISE NOTICE 'Column cancelled_at already exists';
  END IF;
END $$;

-- created_at (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added column: created_at';
  ELSE
    RAISE NOTICE 'Column created_at already exists';
  END IF;
END $$;

-- updated_at (TIMESTAMPTZ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'worksheet_assignments' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added column: updated_at';
  ELSE
    RAISE NOTICE 'Column updated_at already exists';
  END IF;
END $$;

-- ── ADD PERFORMANCE INDEXES ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wa_profile ON worksheet_assignments(assigned_to_profile_id);
CREATE INDEX IF NOT EXISTS idx_wa_business ON worksheet_assignments(assigned_to_business_id);
CREATE INDEX IF NOT EXISTS idx_wa_worksheet ON worksheet_assignments(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_wa_status ON worksheet_assignments(status);
CREATE INDEX IF NOT EXISTS idx_wa_scheduled ON worksheet_assignments(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_wa_profile_status ON worksheet_assignments(assigned_to_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_profile_created ON worksheet_assignments(assigned_to_profile_id, created_at DESC);

-- ── ADD COMMENTS ────────────────────────────────────────────────────────────

COMMENT ON TABLE worksheet_assignments IS 'Tracks worksheet assignments to users with scheduling and status';
COMMENT ON COLUMN worksheet_assignments.worksheet_id IS 'Base44 Worksheet entity ID';
COMMENT ON COLUMN worksheet_assignments.assigned_to_profile_id IS 'Supabase profile UUID of assignee';
COMMENT ON COLUMN worksheet_assignments.assigned_by_profile_id IS 'Supabase profile UUID of admin who assigned';
COMMENT ON COLUMN worksheet_assignments.status IS 'assigned, scheduled, in_progress, completed, cancelled';
COMMENT ON COLUMN worksheet_assignments.scheduled_for IS 'When scheduled worksheet becomes active';
COMMENT ON COLUMN worksheet_assignments.reminder_settings IS 'JSON: {type, method, enabled}';

-- ── VERIFICATION QUERY ─────────────────────────────────────────────────────

SELECT 
  'worksheet_assignments' as table_name,
  COUNT(*) as column_count,
  array_agg(column_name ORDER BY ordinal_position) as columns
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'worksheet_assignments';

-- Expected: column_count = 13