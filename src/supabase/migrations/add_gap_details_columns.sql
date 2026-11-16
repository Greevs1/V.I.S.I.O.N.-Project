-- Additive migration: add JSONB detail columns for gap assessments
-- Numeric gap columns remain numeric-only; detail data goes into new *_details columns
-- Safe to run on existing tables — all new columns are nullable JSONB

-- Profit Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS profit_gap_details JSONB;

-- Value Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS value_gap_details JSONB;

-- Tax Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS tax_gap_details JSONB;

-- Operations Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS operations_gap_details JSONB;

-- Freedom Gap details (freedom_score stays as numeric column)
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS freedom_gap_details JSONB;

-- Cash Flow Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS cash_flow_gap_details JSONB;

-- Protections Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS protections_gap_details JSONB;

-- Wealth Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS wealth_gap_details JSONB;

-- Recast EBITDA Gap details
ALTER TABLE dashboard_metrics 
ADD COLUMN IF NOT EXISTS recast_ebitda_gap_details JSONB;

COMMENT ON COLUMN dashboard_metrics.profit_gap_details IS 'JSONB detail object for profit gap analysis (score, gaps, severity, summary)';
COMMENT ON COLUMN dashboard_metrics.value_gap_details IS 'JSONB detail object for value gap analysis (current_value, potential_value, gap_amount, severity)';
COMMENT ON COLUMN dashboard_metrics.tax_gap_details IS 'JSONB detail object for tax gap analysis (annual_overpayment, ten_year_cost, opportunities)';
COMMENT ON COLUMN dashboard_metrics.operations_gap_details IS 'JSONB detail object for operations gap (score, monthly_value_freed, severity)';
COMMENT ON COLUMN dashboard_metrics.freedom_gap_details IS 'JSONB detail object for freedom gap (score, freedom_date, time_recoverable)';
COMMENT ON COLUMN dashboard_metrics.cash_flow_gap_details IS 'JSONB detail object for cash flow gap (score, cash_flow_opportunity, severity)';
COMMENT ON COLUMN dashboard_metrics.protections_gap_details IS 'JSONB detail object for protections gap (score, protection_risk_score, severity)';
COMMENT ON COLUMN dashboard_metrics.wealth_gap_details IS 'JSONB detail object for wealth gap (score, wealth_readiness_score, severity)';
COMMENT ON COLUMN dashboard_metrics.recast_ebitda_gap_details IS 'JSONB detail object for recast EBITDA gap (add_backs, valuation_increase)';