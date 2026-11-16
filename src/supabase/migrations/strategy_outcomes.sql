-- ============================================================
-- PHASE 1: Strategy Outcomes Table
-- Outcome Tracking Layer — Additive Only
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_outcomes (
  id                              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id                      TEXT,
  business_id                     TEXT,

  -- Source tracking
  source_type                     TEXT CHECK (source_type IN ('strategy', 'strategy_expansion', 'roadmap_item', 'sprint', 'manual_outcome')),
  source_id                       TEXT,
  source_name                     TEXT,
  strategy_id                     TEXT,
  strategy_score_id               TEXT,
  strategy_expansion_id           TEXT,
  roadmap_item_id                 TEXT,
  sprint_id                       TEXT,

  -- Projected impact
  projected_profit_impact         NUMERIC,
  projected_tax_impact            NUMERIC,
  projected_value_impact          NUMERIC,
  projected_cash_flow_impact      NUMERIC,
  projected_wealth_impact         NUMERIC,
  projected_protection_impact     NUMERIC,
  projected_freedom_acceleration_months  NUMERIC,

  -- Actual impact (entered after completion)
  actual_profit_impact            NUMERIC,
  actual_tax_impact               NUMERIC,
  actual_value_impact             NUMERIC,
  actual_cash_flow_impact         NUMERIC,
  actual_wealth_impact            NUMERIC,
  actual_protection_impact        NUMERIC,
  actual_freedom_acceleration_months     NUMERIC,

  -- Variance (calculated: actual - projected)
  profit_variance                 NUMERIC,
  tax_variance                    NUMERIC,
  value_variance                  NUMERIC,
  cash_flow_variance              NUMERIC,
  wealth_variance                 NUMERIC,
  protection_variance             NUMERIC,
  freedom_variance                NUMERIC,
  total_projected_impact          NUMERIC,
  total_actual_impact             NUMERIC,
  total_variance                  NUMERIC,
  accuracy_percentage             NUMERIC,

  -- Implementation tracking
  status                          TEXT DEFAULT 'projected' CHECK (status IN ('projected', 'in_progress', 'completed', 'completed_pending_actuals', 'verified', 'rejected', 'archived')),
  completion_status               TEXT,
  implementation_start_date       DATE,
  implementation_completed_date   DATE,
  implementation_days             INTEGER,
  expected_implementation_days    INTEGER,
  time_variance_days              INTEGER,

  -- Evidence
  evidence_source                 TEXT,
  evidence_notes                  TEXT,
  supporting_documents            JSONB,
  verified_by                     TEXT,
  verified_at                     TIMESTAMPTZ,
  confidence_score                NUMERIC,
  advisor_review_required         BOOLEAN DEFAULT FALSE,

  -- Learning context
  client_industry                 TEXT,
  client_revenue_range            TEXT,
  client_employee_range           TEXT,
  client_profit_margin_range      TEXT,
  strategy_family                 TEXT,
  category                        TEXT,
  outcome_quality_score           NUMERIC,
  should_include_in_learning      BOOLEAN DEFAULT TRUE,

  -- System
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one outcome per source per client (prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_outcomes_source_unique
  ON strategy_outcomes (source_type, source_id, profile_id, business_id)
  WHERE status != 'archived';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_business ON strategy_outcomes (business_id);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_profile ON strategy_outcomes (profile_id);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_status ON strategy_outcomes (status);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_category ON strategy_outcomes (category);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_roadmap ON strategy_outcomes (roadmap_item_id);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_sprint ON strategy_outcomes (sprint_id);

-- ============================================================
-- PHASE 7: Strategy Learning Summary Table
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_learning_summary (
  id                              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id                     TEXT,
  strategy_family                 TEXT,
  category                        TEXT,
  industry                        TEXT,
  revenue_range                   TEXT,
  employee_range                  TEXT,
  sample_size                     INTEGER DEFAULT 0,
  average_projected_impact        NUMERIC,
  average_actual_impact           NUMERIC,
  average_variance                NUMERIC,
  average_accuracy_percentage     NUMERIC,
  average_implementation_days     NUMERIC,
  success_rate                    NUMERIC,
  average_freedom_acceleration    NUMERIC,
  confidence_score                NUMERIC,
  last_calculated_at              TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_learning_unique
  ON strategy_learning_summary (strategy_id, industry, revenue_range)
  WHERE strategy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_strategy_learning_category ON strategy_learning_summary (category);
CREATE INDEX IF NOT EXISTS idx_strategy_learning_family ON strategy_learning_summary (strategy_family);