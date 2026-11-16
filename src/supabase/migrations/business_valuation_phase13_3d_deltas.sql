-- ============================================================================
-- Phase 13.3D — Valuation Version Delta Intelligence
-- ============================================================================
-- ADDITIVE migration. Creates valuation_version_deltas table to store
-- immutable derived artifacts comparing consecutive published versions.
--
-- Deltas are NEVER computed against drafts or stale calculations.
-- Only immutable published versions are compared.
--
-- Structure:
--   delta_summary     — metric-by-metric previous/current/abs/pct
--   value_attribution — quantified EV change attribution
--   waterfall         — EV waterfall from V1 → V2
--   advisor_summary   — full advisor-facing Valuation Story
--   client_summary    — client-safe "What Changed" narrative
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE: valuation_version_deltas
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_version_deltas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  previous_version_id UUID NOT NULL REFERENCES valuation.valuation_versions(id) ON DELETE CASCADE,
  current_version_id UUID NOT NULL REFERENCES valuation.valuation_versions(id) ON DELETE CASCADE,

  -- Version numbers for quick reference
  previous_version_number INTEGER NOT NULL,
  current_version_number INTEGER NOT NULL,

  -- Engine provenance
  engine_version TEXT NOT NULL DEFAULT '13.3.0',
  delta_engine_version TEXT NOT NULL DEFAULT '13.3.0',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Delta content (immutable once created)
  delta_summary JSONB NOT NULL DEFAULT '{}',
  value_attribution JSONB NOT NULL DEFAULT '{}',
  waterfall JSONB NOT NULL DEFAULT '{}',
  advisor_summary JSONB NOT NULL DEFAULT '{}',
  client_summary JSONB NOT NULL DEFAULT '{}',

  -- Integrity
  is_immutable BOOLEAN NOT NULL DEFAULT TRUE,
  hash TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id, previous_version_id, current_version_id),
  UNIQUE(current_version_id) -- one delta per published version
);

CREATE INDEX IF NOT EXISTS idx_version_deltas_valuation_id ON valuation.valuation_version_deltas(valuation_id);
CREATE INDEX IF NOT EXISTS idx_version_deltas_current ON valuation.valuation_version_deltas(current_version_id);

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================
ALTER TABLE valuation.valuation_version_deltas ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_version_deltas FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================
-- Deltas inherit visibility from the valuation itself.
CREATE POLICY version_deltas_select ON valuation.valuation_version_deltas
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY version_deltas_insert ON valuation.valuation_version_deltas
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY version_deltas_delete ON valuation.valuation_version_deltas
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- No UPDATE policy — deltas are immutable once created.

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================
GRANT SELECT, INSERT, DELETE ON valuation.valuation_version_deltas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON valuation.valuation_version_deltas TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO authenticated;

-- ============================================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================================
CREATE TRIGGER trg_version_deltas_updated_at BEFORE UPDATE ON valuation.valuation_version_deltas
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();

COMMIT;

-- ============================================================================
-- END OF PHASE 13.3D DELTA INTELLIGENCE MIGRATION
-- ============================================================================
-- VALIDATION:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'valuation' AND table_name = 'valuation_version_deltas';
-- ============================================================================