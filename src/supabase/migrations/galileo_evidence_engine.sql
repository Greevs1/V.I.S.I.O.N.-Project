-- Galileo Evidence Engine: Add evidence fields to sprint tables
-- Run this migration in your Supabase SQL editor

-- Sprint tasks: evidence fields
ALTER TABLE ninety_day_sprint_tasks ADD COLUMN IF NOT EXISTS task_reason TEXT;
ALTER TABLE ninety_day_sprint_tasks ADD COLUMN IF NOT EXISTS task_evidence JSONB;
ALTER TABLE ninety_day_sprint_tasks ADD COLUMN IF NOT EXISTS confidence_score INTEGER;

-- Sprint paths: evidence fields
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS recommendation_reason TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS evidence_sources JSONB;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expected_impact TEXT;