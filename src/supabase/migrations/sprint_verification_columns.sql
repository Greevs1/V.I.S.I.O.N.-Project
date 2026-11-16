-- Sprint Verification Layer: Add verification and verifier assignment columns
-- Run this in the Supabase SQL Editor or via migrations

ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'galileo_verified_pending_expert';
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS galileo_verified BOOLEAN DEFAULT TRUE;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified_by TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified_at TIMESTAMPTZ;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS needs_expert_review BOOLEAN DEFAULT TRUE;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS last_galileo_update_at TIMESTAMPTZ;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_profile_id TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_name TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_email TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_role TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_at TIMESTAMPTZ;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_by TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_assignment_status TEXT DEFAULT 'unassigned';
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS business_name TEXT;