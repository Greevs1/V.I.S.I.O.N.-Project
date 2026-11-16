-- WORKSHEET ASSIGNMENTS - CRITICAL MIGRATION
-- Run this in Supabase SQL Editor to fix the empty table schema

-- Drop existing table if it has wrong schema
DROP TABLE IF EXISTS worksheet_assignments CASCADE;

-- Recreate with correct schema
CREATE TABLE worksheet_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id TEXT NOT NULL,
  assigned_to_profile_id UUID NOT NULL REFERENCES profiles(id),
  assigned_to_business_id UUID REFERENCES businesses(id),
  assigned_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  due_date TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  reminder_settings JSONB DEFAULT '{"type": "none", "method": "in_app", "enabled": false}',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance indexes
CREATE INDEX idx_wa_profile ON worksheet_assignments(assigned_to_profile_id);
CREATE INDEX idx_wa_business ON worksheet_assignments(assigned_to_business_id);
CREATE INDEX idx_wa_worksheet ON worksheet_assignments(worksheet_id);
CREATE INDEX idx_wa_status ON worksheet_assignments(status);
CREATE INDEX idx_wa_scheduled ON worksheet_assignments(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_wa_profile_status ON worksheet_assignments(assigned_to_profile_id, status);
CREATE INDEX idx_wa_profile_created ON worksheet_assignments(assigned_to_profile_id, created_at DESC);

-- Add comments
COMMENT ON TABLE worksheet_assignments IS 'Tracks worksheet assignments to users with scheduling and status';
COMMENT ON COLUMN worksheet_assignments.worksheet_id IS 'Base44 Worksheet entity ID';
COMMENT ON COLUMN worksheet_assignments.assigned_to_profile_id IS 'Supabase profile UUID of assignee';
COMMENT ON COLUMN worksheet_assignments.assigned_by_profile_id IS 'Supabase profile UUID of admin who assigned';
COMMENT ON COLUMN worksheet_assignments.status IS 'assigned, scheduled, in_progress, completed, cancelled';
COMMENT ON COLUMN worksheet_assignments.scheduled_for IS 'When scheduled worksheet becomes active';
COMMENT ON COLUMN worksheet_assignments.reminder_settings IS 'JSON: {type, method, enabled}';

-- Verify table created correctly
SELECT COUNT(*) as column_count FROM information_schema.columns WHERE table_name = 'worksheet_assignments';