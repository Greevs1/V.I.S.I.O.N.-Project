-- ============================================================================
-- Phase 13.3 — Enterprise Value Calculation Engine Migration
-- ============================================================================
-- ADDITIVE migration. Creates 10 new tables in the `valuation` schema for
-- the calculation engine: benchmarks, method selections, DCF, cap earnings,
-- asset items, equity bridge, confidence scores, conclusions, calculation
-- lines, and historical weighting.
--
-- All tables follow the same RLS pattern as Phase 13.2:
--   - service_role bypasses RLS (backend-mediated access)
--   - authenticated uses valuation.can_view_valuation / can_edit_valuation
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. EXPAND CHECK CONSTRAINT on valuation_questions.valuation_relevance
-- ============================================================================
-- Phase 13.2 allowed: enterprise_value, multiple, profitability, risk,
--   transferability, growth, owner_readiness, context
-- Phase 13.3 adds: business_readiness, market_readiness
ALTER TABLE valuation.valuation_questions
  DROP CONSTRAINT IF EXISTS valuation_questions_valuation_relevance_check;
ALTER TABLE valuation.valuation_questions
  ADD CONSTRAINT valuation_questions_valuation_relevance_check
  CHECK (valuation_relevance IN (
    'enterprise_value', 'multiple', 'profitability', 'risk',
    'transferability', 'growth', 'owner_readiness', 'context',
    'business_readiness', 'market_readiness'
  ));

-- ============================================================================
-- 1. TABLE: valuation_benchmarks
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.business_entities(id) ON DELETE CASCADE,

  -- Classification
  industry TEXT,
  naics_code TEXT,
  business_model TEXT,
  revenue_range_low NUMERIC(19,4),
  revenue_range_high NUMERIC(19,4),
  ebitda_range_low NUMERIC(19,4),
  ebitda_range_high NUMERIC(19,4),
  geography TEXT,

  -- Transaction context
  transaction_date DATE,
  buyer_type TEXT CHECK (buyer_type IN ('strategic', 'financial', 'search_fund', 'family_office', 'individual', 'unknown')),

  -- Source
  source TEXT NOT NULL,
  source_date DATE,
  sample_size INTEGER DEFAULT 0,

  -- Multiple data
  multiple_type TEXT NOT NULL CHECK (multiple_type IN ('ebitda', 'sde', 'revenue', 'ebit', 'net_income')),
  multiple_low NUMERIC(10,4),
  multiple_median NUMERIC(10,4),
  multiple_high NUMERIC(10,4),

  -- Quality
  reliability_score NUMERIC(5,2) DEFAULT 50,
  advisor_notes TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  benchmark_data_version TEXT NOT NULL DEFAULT '1.0.0',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_industry ON valuation.valuation_benchmarks(industry);
CREATE INDEX IF NOT EXISTS idx_benchmarks_multiple_type ON valuation.valuation_benchmarks(multiple_type);
CREATE INDEX IF NOT EXISTS idx_benchmarks_active ON valuation.valuation_benchmarks(is_active);

-- ============================================================================
-- 2. TABLE: valuation_method_selections
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_method_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  method_key TEXT NOT NULL,
  method_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('market', 'income', 'asset')),

  selection_role TEXT NOT NULL CHECK (selection_role IN ('primary', 'secondary', 'supporting', 'excluded')),
  selection_rationale TEXT,
  exclusion_rationale TEXT,

  is_selected BOOLEAN NOT NULL DEFAULT TRUE,
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Method weighting (for reconciliation)
  method_weight NUMERIC(5,2) DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id, method_key)
);

CREATE INDEX IF NOT EXISTS idx_method_sel_valuation_id ON valuation.valuation_method_selections(valuation_id);
CREATE INDEX IF NOT EXISTS idx_method_sel_role ON valuation.valuation_method_selections(valuation_id, selection_role);

-- ============================================================================
-- 3. TABLE: valuation_dcf_projections
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_dcf_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  -- DCF header metadata
  forecast_period_years INTEGER NOT NULL DEFAULT 5,
  forecast_source TEXT,
  forecast_approved BOOLEAN NOT NULL DEFAULT FALSE,
  forecast_approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  forecast_approved_at TIMESTAMPTZ,
  forecast_reliability_score NUMERIC(5,2) DEFAULT 50,

  -- Revenue assumptions
  revenue_assumptions TEXT,
  margin_assumptions TEXT,
  capex_assumptions TEXT,
  working_capital_assumptions TEXT,
  tax_assumptions TEXT,

  -- Discount rate
  discount_rate NUMERIC(10,6),
  discount_rate_rationale TEXT,

  -- Terminal value
  terminal_value_method TEXT CHECK (terminal_value_method IN ('gordon_growth', 'exit_multiple')),
  terminal_growth_rate NUMERIC(10,6),
  terminal_exit_multiple NUMERIC(10,4),
  terminal_value NUMERIC(19,4),
  pv_terminal_value NUMERIC(19,4),
  terminal_value_rationale TEXT,

  -- Total
  total_present_value NUMERIC(19,4),
  enterprise_value NUMERIC(19,4),

  -- Year-by-year projections stored as JSONB array
  projections JSONB NOT NULL DEFAULT '[]',

  -- Sensitivity
  sensitivity_analysis JSONB DEFAULT '{}',

  -- Approval
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Versioning
  calculation_engine_version TEXT NOT NULL DEFAULT '13.3.0',
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  stale_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dcf_valuation_id ON valuation.valuation_dcf_projections(valuation_id);

-- ============================================================================
-- 4. TABLE: valuation_cap_earnings
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_cap_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  -- Inputs
  maintainable_earnings NUMERIC(19,4) NOT NULL DEFAULT 0,
  earnings_basis TEXT NOT NULL CHECK (earnings_basis IN ('ebitda', 'sde', 'net_income', 'free_cash_flow', 'normalized_ebitda', 'normalized_sde')),
  long_term_growth_rate NUMERIC(10,6) DEFAULT 0,
  required_return NUMERIC(10,6) DEFAULT 0,

  -- Calculated
  capitalization_rate NUMERIC(10,6),
  indicated_value NUMERIC(19,4),

  -- Rationale
  growth_rate_rationale TEXT,
  required_return_rationale TEXT,
  normalization_assumptions TEXT,

  -- Sensitivity
  sensitivity_analysis JSONB DEFAULT '{}',

  -- Approval
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Versioning
  calculation_engine_version TEXT NOT NULL DEFAULT '13.3.0',
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  stale_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id)
);

CREATE INDEX IF NOT EXISTS idx_cap_earnings_valuation_id ON valuation.valuation_cap_earnings(valuation_id);

-- ============================================================================
-- 5. TABLE: valuation_asset_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_asset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  asset_category TEXT NOT NULL CHECK (asset_category IN ('cash', 'accounts_receivable', 'inventory', 'equipment_machinery', 'real_estate', 'intangible_assets', 'goodwill', 'contingent_liabilities', 'debt', 'other_liabilities', 'other_assets')),
  asset_name TEXT NOT NULL,

  book_value NUMERIC(19,4) DEFAULT 0,
  fair_market_value NUMERIC(19,4) DEFAULT 0,
  adjustment_amount NUMERIC(19,4) DEFAULT 0,
  adjustment_reason TEXT,

  is_intangible BOOLEAN NOT NULL DEFAULT FALSE,
  is_goodwill BOOLEAN NOT NULL DEFAULT FALSE,
  is_liability BOOLEAN NOT NULL DEFAULT FALSE,

  source_documentation TEXT,

  -- Approval
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_items_valuation_id ON valuation.valuation_asset_items(valuation_id);
CREATE INDEX IF NOT EXISTS idx_asset_items_category ON valuation.valuation_asset_items(valuation_id, asset_category);

-- ============================================================================
-- 6. TABLE: valuation_equity_bridge_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_equity_bridge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  bridge_item_type TEXT NOT NULL CHECK (bridge_item_type IN ('excess_cash', 'non_operating_asset', 'funded_debt', 'debt_like_liability', 'working_capital_adjustment', 'other_adjustment')),
  label TEXT NOT NULL,

  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  direction TEXT NOT NULL CHECK (direction IN ('add', 'subtract')),

  classification_rationale TEXT,
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equity_bridge_valuation_id ON valuation.valuation_equity_bridge_items(valuation_id);

-- ============================================================================
-- 7. TABLE: valuation_confidence_scores
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  category TEXT NOT NULL CHECK (category IN ('data', 'earnings', 'market', 'operational')),
  sub_category TEXT NOT NULL,

  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  evidence_summary TEXT,
  advisor_assessment TEXT,

  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Overall confidence (stored in a single row with category='overall')
  is_overall BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id, category, sub_category)
);

CREATE INDEX IF NOT EXISTS idx_confidence_valuation_id ON valuation.valuation_confidence_scores(valuation_id);
CREATE INDEX IF NOT EXISTS idx_confidence_category ON valuation.valuation_confidence_scores(valuation_id, category);

-- ============================================================================
-- 8. TABLE: valuation_conclusions
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_conclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,

  conclusion_type TEXT NOT NULL CHECK (conclusion_type IN ('indicated', 'defensible', 'potential', 'strategic', 'conservative', 'base', 'aggressive')),

  -- Approved inputs
  maintainable_earnings NUMERIC(19,4),
  primary_method TEXT,
  secondary_method TEXT,
  method_weights JSONB DEFAULT '{}',

  -- Enterprise value
  enterprise_value_low NUMERIC(19,4),
  enterprise_value_mid NUMERIC(19,4),
  enterprise_value_high NUMERIC(19,4),

  -- Equity value
  equity_value_low NUMERIC(19,4),
  equity_value_mid NUMERIC(19,4),
  equity_value_high NUMERIC(19,4),

  -- Defensible value
  defensible_value_low NUMERIC(19,4),
  defensible_value_mid NUMERIC(19,4),
  defensible_value_high NUMERIC(19,4),

  -- Confidence
  confidence_score NUMERIC(5,2),

  -- Narrative
  key_assumptions JSONB DEFAULT '[]',
  key_limitations JSONB DEFAULT '[]',
  client_visible_drivers JSONB DEFAULT '[]',
  client_visible_risks JSONB DEFAULT '[]',
  client_visible_opportunities JSONB DEFAULT '[]',
  disclosures TEXT,

  -- Approval
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  override_rationale TEXT,

  -- Versioning
  calculation_engine_version TEXT NOT NULL DEFAULT '13.3.0',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(valuation_id, conclusion_type)
);

CREATE INDEX IF NOT EXISTS idx_conclusions_valuation_id ON valuation.valuation_conclusions(valuation_id);
CREATE INDEX IF NOT EXISTS idx_conclusions_type ON valuation.valuation_conclusions(valuation_id, conclusion_type);

-- ============================================================================
-- 9. TABLE: valuation_calculation_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_calculation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  calculation_id UUID REFERENCES valuation.valuation_calculations(id) ON DELETE SET NULL,

  line_type TEXT NOT NULL CHECK (line_type IN ('reported', 'adjustment', 'normalized', 'multiple_factor', 'enterprise_value', 'equity_bridge', 'confidence', 'scenario', 'other')),
  line_label TEXT NOT NULL,

  -- Provenance
  source_period TEXT,
  source_field TEXT,
  adjustment_id UUID,
  evidence_ref TEXT,
  approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected', 'not_applicable')),

  -- Actor
  advisor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Value
  amount NUMERIC(19,4) DEFAULT 0,

  -- Metadata
  calculation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculation_engine_version TEXT NOT NULL DEFAULT '13.3.0',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calc_lines_valuation_id ON valuation.valuation_calculation_lines(valuation_id);
CREATE INDEX IF NOT EXISTS idx_calc_lines_calculation_id ON valuation.valuation_calculation_lines(calculation_id);

-- ============================================================================
-- 10. TABLE: valuation_historical_weighting
-- ============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_historical_weighting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuation.business_valuations(id) ON DELETE CASCADE,
  financial_id UUID REFERENCES valuation.valuation_financials(id) ON DELETE SET NULL,

  period_label TEXT NOT NULL,
  period_end_date DATE,
  fiscal_year INTEGER,

  -- Weighting
  weighting_method TEXT NOT NULL CHECK (weighting_method IN ('latest_year', 'ttm', 'simple_average', 'weighted_average', 'trend_adjusted', 'advisor_selected', 'forecast_supported')),
  weight_percentage NUMERIC(5,2) DEFAULT 0,
  weighted_earnings NUMERIC(19,4) DEFAULT 0,

  -- Selection
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  is_maintainable BOOLEAN NOT NULL DEFAULT FALSE,

  -- Approval
  advisor_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_weight_valuation_id ON valuation.valuation_historical_weighting(valuation_id);

-- ============================================================================
-- 11. ENABLE RLS ON ALL NEW TABLES
-- ============================================================================
ALTER TABLE valuation.valuation_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_method_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_dcf_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_cap_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_asset_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_equity_bridge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_confidence_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_conclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_calculation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_historical_weighting ENABLE ROW LEVEL SECURITY;

ALTER TABLE valuation.valuation_benchmarks FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_method_selections FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_dcf_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_cap_earnings FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_asset_items FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_equity_bridge_items FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_confidence_scores FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_conclusions FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_calculation_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE valuation.valuation_historical_weighting FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 12. RLS POLICIES — valuation_benchmarks
-- ============================================================================
CREATE POLICY benchmarks_select ON valuation.valuation_benchmarks
  FOR SELECT TO authenticated
  USING (valuation.is_super_admin() OR valuation.is_advisor_or_admin());

CREATE POLICY benchmarks_insert ON valuation.valuation_benchmarks
  FOR INSERT TO authenticated
  WITH CHECK (valuation.is_super_admin() OR valuation.is_advisor_or_admin());

CREATE POLICY benchmarks_update ON valuation.valuation_benchmarks
  FOR UPDATE TO authenticated
  USING (valuation.is_super_admin() OR valuation.is_advisor_or_admin())
  WITH CHECK (valuation.is_super_admin() OR valuation.is_advisor_or_admin());

CREATE POLICY benchmarks_delete ON valuation.valuation_benchmarks
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 13. RLS POLICIES — valuation_method_selections
-- ============================================================================
CREATE POLICY method_sel_select ON valuation.valuation_method_selections
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY method_sel_insert ON valuation.valuation_method_selections
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY method_sel_update ON valuation.valuation_method_selections
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY method_sel_delete ON valuation.valuation_method_selections
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 14. RLS POLICIES — valuation_dcf_projections
-- ============================================================================
CREATE POLICY dcf_select ON valuation.valuation_dcf_projections
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY dcf_insert ON valuation.valuation_dcf_projections
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY dcf_update ON valuation.valuation_dcf_projections
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY dcf_delete ON valuation.valuation_dcf_projections
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 15. RLS POLICIES — valuation_cap_earnings
-- ============================================================================
CREATE POLICY cap_earnings_select ON valuation.valuation_cap_earnings
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY cap_earnings_insert ON valuation.valuation_cap_earnings
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY cap_earnings_update ON valuation.valuation_cap_earnings
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY cap_earnings_delete ON valuation.valuation_cap_earnings
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 16. RLS POLICIES — valuation_asset_items
-- ============================================================================
CREATE POLICY asset_items_select ON valuation.valuation_asset_items
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY asset_items_insert ON valuation.valuation_asset_items
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY asset_items_update ON valuation.valuation_asset_items
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY asset_items_delete ON valuation.valuation_asset_items
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 17. RLS POLICIES — valuation_equity_bridge_items
-- ============================================================================
CREATE POLICY equity_bridge_select ON valuation.valuation_equity_bridge_items
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY equity_bridge_insert ON valuation.valuation_equity_bridge_items
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY equity_bridge_update ON valuation.valuation_equity_bridge_items
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY equity_bridge_delete ON valuation.valuation_equity_bridge_items
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 18. RLS POLICIES — valuation_confidence_scores
-- ============================================================================
CREATE POLICY confidence_select ON valuation.valuation_confidence_scores
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY confidence_insert ON valuation.valuation_confidence_scores
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY confidence_update ON valuation.valuation_confidence_scores
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY confidence_delete ON valuation.valuation_confidence_scores
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 19. RLS POLICIES — valuation_conclusions
-- ============================================================================
CREATE POLICY conclusions_select ON valuation.valuation_conclusions
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY conclusions_insert ON valuation.valuation_conclusions
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY conclusions_update ON valuation.valuation_conclusions
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY conclusions_delete ON valuation.valuation_conclusions
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 20. RLS POLICIES — valuation_calculation_lines
-- ============================================================================
CREATE POLICY calc_lines_select ON valuation.valuation_calculation_lines
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY calc_lines_insert ON valuation.valuation_calculation_lines
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY calc_lines_delete ON valuation.valuation_calculation_lines
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 21. RLS POLICIES — valuation_historical_weighting
-- ============================================================================
CREATE POLICY hist_weight_select ON valuation.valuation_historical_weighting
  FOR SELECT TO authenticated
  USING (valuation.can_view_valuation(valuation_id));

CREATE POLICY hist_weight_insert ON valuation.valuation_historical_weighting
  FOR INSERT TO authenticated
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY hist_weight_update ON valuation.valuation_historical_weighting
  FOR UPDATE TO authenticated
  USING (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin())
  WITH CHECK (valuation.can_edit_valuation(valuation_id) OR valuation.is_super_admin());

CREATE POLICY hist_weight_delete ON valuation.valuation_historical_weighting
  FOR DELETE TO authenticated
  USING (valuation.is_super_admin());

-- ============================================================================
-- 22. GRANT TABLE PERMISSIONS
-- ============================================================================
GRANT USAGE ON SCHEMA valuation TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA valuation TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO service_role;

GRANT USAGE ON SCHEMA valuation TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA valuation TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA valuation TO authenticated;

-- ============================================================================
-- 23. UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================================================
CREATE TRIGGER trg_benchmarks_updated_at BEFORE UPDATE ON valuation.valuation_benchmarks
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_method_sel_updated_at BEFORE UPDATE ON valuation.valuation_method_selections
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_dcf_updated_at BEFORE UPDATE ON valuation.valuation_dcf_projections
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_cap_earnings_updated_at BEFORE UPDATE ON valuation.valuation_cap_earnings
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_asset_items_updated_at BEFORE UPDATE ON valuation.valuation_asset_items
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_equity_bridge_updated_at BEFORE UPDATE ON valuation.valuation_equity_bridge_items
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_confidence_updated_at BEFORE UPDATE ON valuation.valuation_confidence_scores
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_conclusions_updated_at BEFORE UPDATE ON valuation.valuation_conclusions
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();
CREATE TRIGGER trg_hist_weight_updated_at BEFORE UPDATE ON valuation.valuation_historical_weighting
  FOR EACH ROW EXECUTE FUNCTION valuation.update_updated_at();

COMMIT;

-- ============================================================================
-- END OF PHASE 13.3 MIGRATION
-- ============================================================================
-- VALIDATION QUERIES:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'valuation' ORDER BY table_name;
--   -- Expected: 24 tables (14 from Phase 13.2 + 10 from Phase 13.3)
-- ============================================================================