-- Phase 6 Final Validation — align ninety_day_sprint_paths with the declared sprint schema.
--
-- DO NOT auto-apply. Review, then run in the Supabase SQL Editor.
--
-- ROOT CAUSE
--   Production received the outdated 13-column snippet printed in the admin console
--   (src/pages/admin/AdminView.jsx), NOT the full migration in
--   src/supabase/migrations/sprint_verification_columns.sql.
--   The 5 columns absent from production are exactly the 5 that snippet omits.
--
--   Three are actively written by the current 90-Day Sprint path:
--     galileo_verified       — ninetyDaySprint INSERT          (the reported error)
--     last_galileo_update_at — ninetyDaySprint INSERT          (masked by the one above)
--     assigned_verifier_by   — assignSprintVerifier UPDATE     (next failure after those)
--
--   Two are read with fallbacks and therefore currently always degrade to the fallback:
--     client_name, business_name
--
-- SAFETY
--   ADD COLUMN IF NOT EXISTS only — no data is modified, no column is dropped or renamed.
--   On PostgreSQL 11+ a constant DEFAULT is applied to existing rows without a table rewrite,
--   so the 22 existing sprint rows receive galileo_verified = TRUE, which is semantically
--   correct: every existing path was produced by the Galileo generator.
--   The other four columns are nullable with no default and become NULL — truthful, since
--   no value was ever captured for them.

ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS galileo_verified BOOLEAN DEFAULT TRUE;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS last_galileo_update_at TIMESTAMPTZ;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_by TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS business_name TEXT;

-- PostgREST serves from a cached copy of the table schema. Without this reload the API
-- keeps returning "Could not find the '<column>' column of 'ninety_day_sprint_paths'
-- in the schema cache" even though the columns now exist.
NOTIFY pgrst, 'reload schema';

-- Verification (read-only, safe to run before and after):
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'ninety_day_sprint_paths'
--   ORDER BY ordinal_position;