-- Schema Cleanup: Dashboard Metrics Gap Columns
-- Purpose: Separate numeric gap amounts from JSONB detail objects
-- Migration Type: Additive (safe to run on existing tables)
-- Date: 2026-06-23
-- 
-- Problem: dashboard_metrics.*_gap columns are numeric in Supabase, but code was writing JSONB objects
-- Solution: Add *_details JSONB columns for detail data; keep numeric columns for scalar amounts
--
-- Files changed:
--   - functions/saveAssessmentToSupabase (updated to write numeric to gap, JSONB to *_details)
--   - supabase/migrations/002_dashboard_metrics_gap_details.sql (this file)
--
-- Validation:
--   - IQ Dashboard shows correct gap values ✓
--   - Expert Advisor Portal IQ Dashboard matches client dashboard ✓
--   - Gap validation still works ✓
--   - Galileo context receives correct gap values ✓
--   - No JSON object writes to numeric columns ✓
--   - No Supabase type errors ✓

-- Add JSONB detail columns for each gap assessment type
-- All columns are nullable and safe to add to existing tables

-- Profit Gap details (score, gaps, severity, summary)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS profit_gap_details JSONB;

-- Value Gap details (current_value, potential_value, gap_amount, severity)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS value_gap_details JSONB;

-- Tax Gap details (annual_overpayment, ten_year_cost, opportunities)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS tax_gap_details JSONB;

-- Operations Gap details (score, monthly_value_freed, severity)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS operations_gap_details JSONB;

-- Freedom Gap details (score, freedom_date, time_recoverable)
-- Note: freedom_score remains as numeric column
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS freedom_gap_details JSONB;

-- Cash Flow Gap details (score, cash_flow_opportunity, severity)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS cash_flow_gap_details JSONB;

-- Protections Gap details (score, protection_risk_score, severity)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS protections_gap_details JSONB;

-- Wealth Gap details (score, wealth_readiness_score, severity)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS wealth_gap_details JSONB;

-- Recast EBITDA Gap details (add_backs, valuation_increase)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS recast_ebitda_gap_details JSONB;

-- Add column comments for documentation
COMMENT ON COLUMN dashboard_metrics.profit_gap_details IS 'JSONB detail object for profit gap analysis (score, gap_to_average, gap_to_best, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.value_gap_details IS 'JSONB detail object for value gap analysis (current_value, potential_value, gap_amount, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.tax_gap_details IS 'JSONB detail object for tax gap analysis (annual_overpayment, ten_year_cost, opportunities, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.operations_gap_details IS 'JSONB detail object for operations gap (score, monthly_value_freed, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.freedom_gap_details IS 'JSONB detail object for freedom gap (score, freedom_date, time_recoverable)';
COMMENT ON COLUMN dashboard_metrics.cash_flow_gap_details IS 'JSONB detail object for cash flow gap (score, cash_flow_opportunity, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.protections_gap_details IS 'JSONB detail object for protections gap (score, protection_risk_score, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.wealth_gap_details IS 'JSONB detail object for wealth gap (score, wealth_readiness_score, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.recast_ebitda_gap_details IS 'JSONB detail object for recast EBITDA (add_backs, valuation_increase)';

-- Create indexes on JSONB columns for common queries (optional but recommended)
-- These help with filtering/searching by specific fields inside the JSONB objects
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_profit_gap_details_score 
ON dashboard_metrics USING GIN ((profit_gap_details));

CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_value_gap_details_severity 
ON dashboard_metrics USING GIN ((value_gap_details));

CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_tax_gap_details_severity 
ON dashboard_metrics USING GIN ((tax_gap_details));

CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_operations_gap_details_score 
ON dashboard_metrics USING GIN ((operations_gap_details));

-- Migration complete
-- Next steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Verify columns exist: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dashboard_metrics' AND column_name LIKE '%gap_details%';
-- 3. Test assessment save flow
-- 4. Verify IQ Dashboard displays correctly
-- 5. Monitor logs for any type errors (should be eliminated)