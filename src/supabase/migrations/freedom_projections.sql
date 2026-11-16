-- freedom_projections table
-- Stores per-recommendation and scenario freedom acceleration projections.
-- ADDITIVE — does not modify any existing tables.

CREATE TABLE IF NOT EXISTS freedom_projections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id                  TEXT NOT NULL,
  business_id                 TEXT NOT NULL,

  -- Source reference
  source_type                 TEXT NOT NULL CHECK (source_type IN ('strategy','strategy_expansion','roadmap_item','sprint','scenario')),
  source_id                   TEXT,
  source_name                 TEXT NOT NULL,

  -- Freedom score delta
  current_freedom_score       NUMERIC,
  projected_freedom_score     NUMERIC,
  freedom_score_change        NUMERIC,

  -- Freedom date delta
  current_freedom_date        TEXT,
  projected_freedom_date      TEXT,
  freedom_acceleration_months NUMERIC,

  -- Financial impact components
  projected_profit_impact     NUMERIC,
  projected_tax_impact        NUMERIC,
  projected_value_impact      NUMERIC,
  projected_cash_flow_impact  NUMERIC,
  projected_wealth_impact     NUMERIC,

  -- Quality
  confidence_score            NUMERIC,
  assumptions                 JSONB DEFAULT '[]',
  supporting_evidence         JSONB DEFAULT '[]',

  -- Narrative (Galileo explainability)
  why_this_moves_freedom      TEXT,

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freedom_projections_business   ON freedom_projections (business_id);
CREATE INDEX IF NOT EXISTS idx_freedom_projections_profile    ON freedom_projections (profile_id);
CREATE INDEX IF NOT EXISTS idx_freedom_projections_source     ON freedom_projections (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_freedom_projections_accel      ON freedom_projections (business_id, freedom_acceleration_months DESC);