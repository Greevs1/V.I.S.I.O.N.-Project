-- Strategic Opportunity Expansion Engine
-- New tables ONLY — no existing tables modified
-- Run in Supabase SQL editor

-- ── strategy_expansion_map ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_expansion_map (
  id                                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_strategy_id                      TEXT,           -- references strategy_library.id (TEXT, non-FK to allow flexibility)
  expansion_name                        TEXT NOT NULL,
  expansion_description                 TEXT,
  expansion_sequence                    JSONB,          -- ordered array of strategy steps
  primary_gap                           TEXT,           -- tax|profit|value|cash_flow|operations|protection|wealth|freedom
  secondary_gaps                        TEXT[],
  first_order_effects                   TEXT[],
  second_order_effects                  TEXT[],
  third_order_effects                   TEXT[],
  required_conditions                   JSONB,          -- array of {condition, field, operator, value}
  required_documents                    TEXT[],
  contraindications                     TEXT[],
  expert_review_required                TEXT[],
  estimated_profit_impact               NUMERIC(12,2),
  estimated_tax_impact                  NUMERIC(12,2),
  estimated_value_impact                NUMERIC(12,2),
  estimated_cash_flow_impact            NUMERIC(12,2),
  estimated_wealth_impact               NUMERIC(12,2),
  estimated_protection_impact           NUMERIC(12,2),
  estimated_freedom_acceleration_months INTEGER,
  confidence_score                      INTEGER DEFAULT 70,
  active                                BOOLEAN DEFAULT true,
  created_at                            TIMESTAMPTZ DEFAULT now(),
  updated_at                            TIMESTAMPTZ DEFAULT now()
);

-- ── client_strategy_expansions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_strategy_expansions (
  id                                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id                            TEXT NOT NULL,
  business_id                           TEXT NOT NULL,
  base_strategy_id                      TEXT,
  strategy_score_id                     TEXT,
  expansion_map_id                      UUID REFERENCES strategy_expansion_map(id),
  expansion_name                        TEXT NOT NULL,
  recommendation_type                   TEXT DEFAULT 'strategy_expansion',
  opportunity_stack                     JSONB,          -- ordered array of action steps
  first_order_outcomes                  TEXT[],
  second_order_outcomes                 TEXT[],
  third_order_outcomes                  TEXT[],
  affected_gaps                         TEXT[],
  projected_profit_impact               NUMERIC(12,2),
  projected_tax_impact                  NUMERIC(12,2),
  projected_value_impact                NUMERIC(12,2),
  projected_cash_flow_impact            NUMERIC(12,2),
  projected_wealth_impact               NUMERIC(12,2),
  projected_protection_impact           NUMERIC(12,2),
  projected_freedom_acceleration_months INTEGER,
  required_conditions_met               JSONB,          -- {condition: bool}
  missing_data                          TEXT[],
  supporting_evidence                   JSONB,          -- [{source, field, value}]
  compliance_notes                      TEXT,
  expert_review_required                TEXT[],
  confidence_score                      INTEGER DEFAULT 70,
  priority_rank                         INTEGER,
  status                                TEXT DEFAULT 'recommended',
  created_at                            TIMESTAMPTZ DEFAULT now(),
  updated_at                            TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_strategy_expansion_map_base_strategy ON strategy_expansion_map(base_strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_expansion_map_active ON strategy_expansion_map(active);
CREATE INDEX IF NOT EXISTS idx_strategy_expansion_map_primary_gap ON strategy_expansion_map(primary_gap);
CREATE INDEX IF NOT EXISTS idx_client_strategy_expansions_profile ON client_strategy_expansions(profile_id);
CREATE INDEX IF NOT EXISTS idx_client_strategy_expansions_business ON client_strategy_expansions(business_id);
CREATE INDEX IF NOT EXISTS idx_client_strategy_expansions_status ON client_strategy_expansions(status);
CREATE INDEX IF NOT EXISTS idx_client_strategy_expansions_rank ON client_strategy_expansions(business_id, priority_rank);