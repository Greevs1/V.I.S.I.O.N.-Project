-- ============================================================================
-- Phase 13.3C — Staleness Columns for valuation_calculations
-- ============================================================================
-- ADDITIVE migration. Adds staleness tracking columns to the existing
-- valuation_calculations table from Phase 13.2.
--
-- This migration must be run manually in the Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ── Add staleness columns to valuation_calculations ─────────────────────
ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS stale_reason TEXT;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS stale_source_type TEXT;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS stale_source_id TEXT;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS stale_marked_at TIMESTAMPTZ;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS stale_marked_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── Add envelope metadata columns ───────────────────────────────────────
ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS calculation_type_label TEXT;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS input_hash TEXT;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS output_hash TEXT;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS warnings JSONB DEFAULT '[]';

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]';

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB DEFAULT '{}';

ALTER TABLE valuation.valuation_calculations
  ADD COLUMN IF NOT EXISTS superseded_by_calculation_id UUID REFERENCES valuation.valuation_calculations(id) ON DELETE SET NULL;

-- ── Add calculation line enrichment columns ─────────────────────────────
ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS line_key TEXT;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS input_value NUMERIC(19,4);

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS output_value NUMERIC(19,4);

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS operator TEXT;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS benchmark_id UUID;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS parent_line_id UUID REFERENCES valuation.valuation_calculation_lines(id) ON DELETE SET NULL;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2);

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS advisor_approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE valuation.valuation_calculation_lines
  ADD COLUMN IF NOT EXISTS line_metadata JSONB DEFAULT '{}';

-- ── Index for stale calculations lookup ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calculations_stale
  ON valuation.valuation_calculations(valuation_id)
  WHERE is_stale = TRUE;

CREATE INDEX IF NOT EXISTS idx_calculations_approved
  ON valuation.valuation_calculations(valuation_id, calculation_type)
  WHERE is_approved = TRUE;

COMMIT;

-- ============================================================================
-- VALIDATION:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'valuation' AND table_name = 'valuation_calculations'
--   ORDER BY column_name;
-- ============================================================================