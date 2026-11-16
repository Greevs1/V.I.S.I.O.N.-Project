-- Add missing columns to worksheet_assignments table
-- DO NOT recreate the table - only add missing columns

-- Add scheduled_for column (timestamptz)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worksheet_assignments' AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN scheduled_for timestamptz;
  END IF;
END $$;

-- Add reminder_settings column (jsonb)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worksheet_assignments' AND column_name = 'reminder_settings'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN reminder_settings jsonb DEFAULT '{"type": "none", "method": "in_app", "enabled": false}';
  END IF;
END $$;

-- Add assigned_at column (timestamptz)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worksheet_assignments' AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN assigned_at timestamptz DEFAULT NOW();
  END IF;
END $$;

-- Add completed_at column (timestamptz)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worksheet_assignments' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- Add cancelled_at column (timestamptz)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worksheet_assignments' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE worksheet_assignments ADD COLUMN cancelled_at timestamptz;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_profile ON worksheet_assignments(assigned_to_profile_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_business ON worksheet_assignments(assigned_to_business_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_worksheet ON worksheet_assignments(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_status ON worksheet_assignments(status);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_scheduled ON worksheet_assignments(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_due_date ON worksheet_assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_profile_status ON worksheet_assignments(assigned_to_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_profile_created ON worksheet_assignments(assigned_to_profile_id, created_at DESC);