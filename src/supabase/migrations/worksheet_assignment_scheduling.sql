-- Worksheet Assignment Schema Updates
-- DO NOT run if worksheet_assignments table doesn't exist yet
-- This adds missing columns for scheduling and reminders

-- Add scheduling columns
ALTER TABLE worksheet_assignments 
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reminder_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add indexes for performance (critical for <1s load times)
CREATE INDEX IF NOT EXISTS idx_wa_profile_status 
ON worksheet_assignments(assigned_to_profile_id, status);

CREATE INDEX IF NOT EXISTS idx_wa_profile_created 
ON worksheet_assignments(assigned_to_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_scheduled 
ON worksheet_assignments(scheduled_for) 
WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_wa_worksheet 
ON worksheet_assignments(worksheet_id);

-- Add comment for documentation
COMMENT ON COLUMN worksheet_assignments.scheduled_for IS 'When scheduled worksheet becomes active (status changes to assigned)';
COMMENT ON COLUMN worksheet_assignments.reminder_settings IS 'JSON: {type: "none"|"1_day"|"3_days"|"1_week", method: "in_app"|"email"|"both", enabled: boolean}';