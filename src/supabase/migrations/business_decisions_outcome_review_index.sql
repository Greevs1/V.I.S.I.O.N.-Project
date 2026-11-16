-- ============================================================================
-- Phase D.1 — Decision Outcome Review Index (ADDITIVE)
-- ============================================================================
-- Single additive index on EXISTING columns for efficient "reviews due"
-- queries. No new table. No new columns. No schema changes.
--
-- This index supports:
--   - listReviewsDue (DUE + OVERDUE decisions)
--   - Meeting Intelligence "Decision Reviews Due" surfacing
--   - Living Intelligence prioritization
--
-- Index predicate: decided decisions that have NOT been reviewed yet
-- and HAVE a review date set.
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_business_decisions_outcome_review_due
  ON business_decisions(business_id, outcome_review_date)
  WHERE decision_status = 'decided' AND outcome_reviewed_at IS NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VALIDATION:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'business_decisions'
--   AND indexname = 'idx_business_decisions_outcome_review_due';
-- ============================================================================