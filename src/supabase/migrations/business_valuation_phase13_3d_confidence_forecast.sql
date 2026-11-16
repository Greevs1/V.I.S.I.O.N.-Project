-- ============================================================================
-- Phase 13.3D — Add 'forecast' to confidence_scores category CHECK constraint
-- ============================================================================
-- The approved confidence framework includes five categories:
--   data, earnings, market, operational, forecast
--
-- Phase 13.3 only allowed four: data, earnings, market, operational.
-- Phase 13.3D adds 'forecast' for DCF-based valuations.
--
-- If forecast is legitimately not applicable, the advisor stores
-- is_not_applicable=true with a reason. Weighting is redistributed
-- transparently to preserve total weighting = 100%.
-- ============================================================================

BEGIN;

-- 1. Expand CHECK constraint to include 'forecast'
ALTER TABLE valuation.valuation_confidence_scores
  DROP CONSTRAINT IF EXISTS valuation_confidence_scores_category_check;

ALTER TABLE valuation.valuation_confidence_scores
  ADD CONSTRAINT valuation_confidence_scores_category_check
  CHECK (category IN ('data', 'earnings', 'market', 'operational', 'forecast'));

-- 2. Add is_not_applicable flag for categories that don't apply
ALTER TABLE valuation.valuation_confidence_scores
  ADD COLUMN IF NOT EXISTS is_not_applicable BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add not_applicable_reason for transparency
ALTER TABLE valuation.valuation_confidence_scores
  ADD COLUMN IF NOT EXISTS not_applicable_reason TEXT;

COMMIT;

-- ============================================================================
-- VALIDATION:
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'valuation.valuation_confidence_scores'::regclass
--     AND conname = 'valuation_confidence_scores_category_check';
-- ============================================================================