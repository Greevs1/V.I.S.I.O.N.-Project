-- ============================================================
-- Strategy Intelligence Layer Migration
-- V.I.S.I.O.N. Platform™ — Galileo Enhancement
-- Additive only — no existing tables modified
-- ============================================================

-- strategy_library: Stores vetted V.I.S.I.O.N. strategies
CREATE TABLE IF NOT EXISTS strategy_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL,
  category TEXT NOT NULL, -- tax, profit, operations, value, cash_flow, protection, wealth, freedom
  strategy_family TEXT,
  description TEXT,
  ideal_client_profile TEXT,
  ideal_industries JSONB DEFAULT '[]',
  minimum_revenue NUMERIC,
  maximum_revenue NUMERIC,
  implementation_difficulty TEXT DEFAULT 'medium', -- easy, medium, advanced
  implementation_days INTEGER DEFAULT 90,
  expected_profit_impact_type TEXT, -- percentage, fixed, range_low
  expected_profit_impact_value NUMERIC,
  expected_tax_impact_type TEXT,
  expected_tax_impact_value NUMERIC,
  expected_value_impact_type TEXT,
  expected_value_impact_value NUMERIC,
  expected_cash_flow_impact_type TEXT,
  expected_cash_flow_impact_value NUMERIC,
  expected_freedom_acceleration_months NUMERIC DEFAULT 0,
  required_data_points JSONB DEFAULT '[]',
  required_documents JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  contraindications TEXT,
  confidence_score NUMERIC DEFAULT 75,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- client_strategy_scores: Ranked strategy selections per client
CREATE TABLE IF NOT EXISTS client_strategy_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  business_id UUID NOT NULL,
  strategy_id UUID REFERENCES strategy_library(id) ON DELETE CASCADE,
  opportunity_score NUMERIC,
  impact_score NUMERIC,
  confidence_score NUMERIC,
  ease_score NUMERIC,
  urgency_score NUMERIC,
  time_to_value_score NUMERIC,
  freedom_score NUMERIC,
  projected_profit_impact NUMERIC,
  projected_tax_impact NUMERIC,
  projected_value_impact NUMERIC,
  projected_cash_flow_impact NUMERIC,
  projected_freedom_acceleration_months NUMERIC,
  recommendation_reason TEXT,
  evidence_used JSONB DEFAULT '[]',
  missing_data JSONB DEFAULT '[]',
  priority_rank INTEGER,
  status TEXT DEFAULT 'recommended', -- recommended, in_progress, completed, dismissed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategy_library_category ON strategy_library(category);
CREATE INDEX IF NOT EXISTS idx_strategy_library_active ON strategy_library(active);
CREATE INDEX IF NOT EXISTS idx_client_strategy_scores_business ON client_strategy_scores(business_id);
CREATE INDEX IF NOT EXISTS idx_client_strategy_scores_profile ON client_strategy_scores(profile_id);
CREATE INDEX IF NOT EXISTS idx_client_strategy_scores_rank ON client_strategy_scores(business_id, priority_rank);