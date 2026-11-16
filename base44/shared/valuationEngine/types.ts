/**
 * valuationEngine/types.ts — Core typed models for the institutional valuation engine.
 * No React, no browser, no Supabase, no Base44 SDK dependencies.
 * All financial types use exact decimal representation via Decimal.
 */

import { Decimal } from './decimal.ts';

// ════════════════════════════════════════════════════════════════════════
// PRIMITIVE FINANCIAL TYPES
// ════════════════════════════════════════════════════════════════════════

export type Money = Decimal;
export type Percentage = Decimal; // Stored as decimal (0.15 = 15%)
export type Multiple = Decimal; // e.g., 4.5x

// ════════════════════════════════════════════════════════════════════════
// FINANCIAL PERIOD & ADJUSTMENT
// ════════════════════════════════════════════════════════════════════════

export interface FinancialPeriod {
  id: string;
  period_label: string;
  period_type: 'historical' | 'trailing_twelve_months' | 'year_to_date' | 'budget' | 'forecast' | 'projected';
  period_start_date: string;
  period_end_date: string;
  fiscal_year: number | null;
  revenue: Money;
  cogs: Money;
  gross_profit: Money;
  operating_expenses: Money;
  net_income: Money;
  reported_ebitda: Money;
  normalized_ebitda: Money;
  reported_sde: Money;
  normalized_sde: Money;
  owner_compensation: Money;
  depreciation: Money;
  amortization: Money;
  interest_expense: Money;
  taxes: Money;
  cash: Money;
  funded_debt: Money;
  accounts_receivable: Money;
  accounts_payable: Money;
  inventory: Money;
  working_capital: Money;
  capital_expenditures: Money;
  add_backs_total: Money;
  deductions_total: Money;
  recast_ebitda: Money;
  advisor_approval_status: 'pending' | 'approved' | 'rejected';
}

export interface ApprovedAdjustment {
  id: string;
  financial_id: string | null;
  adjustment_type: string;
  adjustment_direction: 'add_back' | 'deduction';
  is_recurring: boolean;
  proposed_amount: Money;
  approved_amount: Money;
  advisor_approval_status: 'pending' | 'approved' | 'rejected' | 'needs_review';
  explanation: string;
  evidence_document_id: string | null;
}

// ════════════════════════════════════════════════════════════════════════
// NORMALIZED EARNINGS
// ════════════════════════════════════════════════════════════════════════

export interface NormalizedEarningsInput {
  period: FinancialPeriod;
  adjustments: ApprovedAdjustment[];
  earnings_basis: 'ebitda' | 'sde';
  market_replacement_compensation: Money | null;
  eligible_owner_benefits: Money | null;
  other_owner_adjustments: Money | null;
}

export interface NormalizedEarningsLine {
  line_label: string;
  line_type: 'reported' | 'adjustment' | 'normalized';
  amount: Money;
  adjustment_id?: string;
  source?: string;
}

export interface NormalizedEarningsOutput {
  reported_ebitda: Money;
  total_add_backs: Money;
  total_deductions: Money;
  normalized_ebitda: Money;
  normalized_sde: Money | null;
  ebitda_bridge: { lines: NormalizedEarningsLine[] };
  sde_bridge: { lines: NormalizedEarningsLine[] } | null;
  pending_adjustments_excluded: number;
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// HISTORICAL WEIGHTING
// ════════════════════════════════════════════════════════════════════════

export interface HistoricalWeightingInput {
  periods: { period_id: string; period_label: string; earnings: Money; period_type: string }[];
  weighting_method: 'latest_period' | 'trailing_twelve_months' | 'simple_average' | 'weighted_average' | 'trend_adjusted' | 'advisor_selected' | 'forecast_supported';
  custom_weights?: { period_id: string; weight: Percentage }[];
  trend_adjustment_rate?: Percentage;
  advisor_selected_value?: Money;
  forecast_supported_value?: Money;
}

export interface HistoricalWeightingOutput {
  method: string;
  period_values: { period_id: string; period_label: string; earnings: Money; weight: Percentage; weighted_contribution: Money }[];
  final_maintainable_earnings: Money;
  total_weight: Percentage;
  rationale: string;
  confidence_impact: number;
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// BENCHMARK
// ════════════════════════════════════════════════════════════════════════

export interface BenchmarkInput {
  id: string;
  benchmark_type: 'industry_multiple' | 'transaction' | 'public_company' | 'rule_of_thumb';
  industry: string;
  earnings_basis: 'ebitda' | 'sde' | 'revenue';
  multiple_low: Multiple;
  multiple_mid: Multiple;
  multiple_high: Multiple;
  sample_size: number;
  benchmark_date: string;
  source: string;
  confidence_score: number;
  is_approved: boolean;
}

// ════════════════════════════════════════════════════════════════════════
// MULTIPLE CALCULATION
// ════════════════════════════════════════════════════════════════════════

export interface MultipleAdjustment {
  adjustment_key: string;
  adjustment_label: string;
  adjustment_value: Multiple; // Can be positive or negative
  rationale: string;
  is_strategic_premium: boolean;
}

export interface MultipleCalculationInput {
  normalized_earnings: Money;
  earnings_basis: 'ebitda' | 'sde' | 'revenue';
  benchmark: BenchmarkInput | null;
  baseline_multiple: Multiple;
  adjustments: MultipleAdjustment[];
  advisor_override_low?: Multiple | null;
  advisor_override_mid?: Multiple | null;
  advisor_override_high?: Multiple | null;
  override_rationale?: string;
}

export interface MultipleCalculationOutput {
  baseline_multiple: Multiple;
  total_adjustment: Multiple;
  final_multiple_low: Multiple;
  final_multiple_mid: Multiple;
  final_multiple_high: Multiple;
  enterprise_value_low: Money;
  enterprise_value_mid: Money;
  enterprise_value_high: Money;
  multiple_bridge: MultipleAdjustment[];
  strategic_premium: Multiple | null;
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// DCF
// ════════════════════════════════════════════════════════════════════════

export interface DCFProjectionYear {
  year: number;
  revenue: Money;
  ebitda: Money;
  taxes: Money;
  capex: Money;
  working_capital_change: Money;
  unlevered_fcf: Money;
  discount_factor: Money;
  present_value: Money;
}

export interface DCFInput {
  forecast_period_years: number;
  projections: { year: number; revenue: Money; ebitda: Money; taxes: Money; capex: Money; working_capital_change: Money }[];
  discount_rate: Percentage;
  terminal_value_method: 'gordon_growth' | 'exit_multiple';
  terminal_growth_rate: Percentage;
  terminal_exit_multiple: Multiple;
  forecast_reliability_score: number;
}

export interface DCFOutput {
  projection_years: DCFProjectionYear[];
  total_present_value: Money;
  terminal_value: Money;
  pv_terminal_value: Money;
  enterprise_value: Money;
  sensitivity: { discount_rate: Percentage; growth_rate: Percentage; enterprise_value: Money }[];
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// CAPITALIZATION
// ════════════════════════════════════════════════════════════════════════

export interface CapitalizationInput {
  maintainable_earnings: Money;
  earnings_basis: 'ebitda' | 'sde' | 'net_income' | 'free_cash_flow';
  required_return: Percentage;
  long_term_growth_rate: Percentage;
  rationale: { required_return: string; growth_rate: string; normalization: string };
}

export interface CapitalizationOutput {
  capitalization_rate: Percentage;
  indicated_value: Money;
  sensitivity: { required_return: Percentage; growth_rate: Percentage; cap_rate: Percentage; value: Money }[];
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// ASSET APPROACH
// ════════════════════════════════════════════════════════════════════════

export interface AssetItem {
  id: string;
  asset_category: string;
  asset_name: string;
  book_value: Money;
  fair_market_value: Money;
  adjustment_reason: string;
  is_intangible: boolean;
  is_goodwill: boolean;
  is_liability: boolean;
  source_documentation: string;
}

export interface AssetApproachInput {
  asset_items: AssetItem[];
  earnings_method_used: boolean; // To check for goodwill double-counting
}

export interface AssetApproachOutput {
  total_assets: Money;
  total_liabilities: Money;
  adjusted_net_asset_value: Money;
  asset_floor_value: Money;
  liquidation_value: Money | null;
  asset_lines: { asset_name: string; category: string; book_value: Money; fair_market_value: Money; is_liability: boolean }[];
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// EQUITY BRIDGE
// ════════════════════════════════════════════════════════════════════════

export interface EquityBridgeItem {
  id: string;
  bridge_item_type: string;
  label: string;
  amount: Money;
  direction: 'add' | 'subtract';
  classification_rationale: string;
  advisor_approved: boolean;
}

export interface EquityBridgeInput {
  enterprise_value_low: Money;
  enterprise_value_mid: Money;
  enterprise_value_high: Money;
  bridge_items: EquityBridgeItem[];
}

export interface EquityBridgeOutput {
  total_additions: Money;
  total_subtractions: Money;
  equity_value_low: Money;
  equity_value_mid: Money;
  equity_value_high: Money;
  bridge_lines: { label: string; amount: Money; direction: 'add' | 'subtract' }[];
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// CONFIDENCE
// ════════════════════════════════════════════════════════════════════════

export interface ConfidenceScoreInput {
  category: 'data' | 'earnings' | 'market' | 'operational' | 'forecast';
  sub_category: string;
  score: number; // 0-100
  max_score: number;
  rationale: string;
  missing_evidence: string[];
}

export interface ConfidenceInput {
  scores: ConfidenceScoreInput[];
  weights: { data: Percentage; earnings: Percentage; market: Percentage; operational: Percentage; forecast: Percentage };
}

export interface ConfidenceOutput {
  category_scores: { category: string; score: number; weight: Percentage; weighted_score: number }[];
  overall_confidence: number;
  missing_evidence: string[];
  conflicting_data: string[];
  unsupported_assumptions: string[];
  defensibility_constraints: string[];
  recommended_evidence: string[];
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// SCENARIO
// ════════════════════════════════════════════════════════════════════════

export interface ScenarioInput {
  scenario_type: 'current' | 'indicated' | 'defensible' | 'potential' | 'conservative' | 'base' | 'aggressive' | 'strategic';
  scenario_name: string;
  normalized_earnings: Money;
  applied_multiple: Multiple;
  cash_adjustment: Money;
  debt_adjustment: Money;
  working_capital_adjustment: Money;
  enterprise_value: Money;
  equity_value: Money;
  confidence_score: number;
  assumptions: string[];
  included_improvements: string[];
  excluded_improvements: string[];
  description: string;
  is_recommended: boolean;
}

export interface ScenarioOutput {
  scenario_type: string;
  scenario_name: string;
  enterprise_value: Money;
  equity_value: Money;
  confidence_score: number;
  assumptions: string[];
  is_recommended: boolean;
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// VALUE DRIVER
// ════════════════════════════════════════════════════════════════════════

export interface ValueDriverInput {
  driver_key: string;
  driver_name: string;
  category: 'profitability' | 'valuation_multiple' | 'exit_readiness' | 'family_office' | 'human_capital' | 'customer_capital' | 'structural_capital' | 'social_capital' | 'financial_performance' | 'growth_potential' | 'risk' | 'transferability' | 'owner_readiness' | 'business_readiness' | 'market_readiness';
  current_state: string;
  target_state: string;
  impact_type: 'value_enhancer' | 'value_detractor' | 'risk_factor' | 'opportunity' | 'neutral';
  estimated_ebitda_impact: Money | null;
  estimated_multiple_impact: Multiple | null;
  confidence_score: number;
  evidence_references: { source: string; detail: string }[];
  client_visible: boolean;
}

export interface ValueDriverOutput {
  driver_key: string;
  driver_name: string;
  category: string;
  current_state: string;
  target_state: string;
  impact_type: string;
  estimated_ebitda_impact: string; // Formatted or "Impact not yet quantifiable"
  estimated_multiple_impact: string;
  estimated_ev_impact_low: string;
  estimated_ev_impact_high: string;
  confidence_score: number;
  evidence_references: { source: string; detail: string }[];
  client_visible_explanation: string;
  advisor_review_required: boolean;
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// METHOD RECONCILIATION
// ════════════════════════════════════════════════════════════════════════

export interface MethodResult {
  method_key: string;
  method_name: string;
  enterprise_value_low: Money;
  enterprise_value_mid: Money;
  enterprise_value_high: Money;
  reliability_score: number;
  applicability_score: number;
  data_quality_score: number;
}

export interface MethodReconciliationInput {
  method_results: MethodResult[];
  weights: { method_key: string; weight: Percentage }[];
  excluded_methods: { method_key: string; method_name: string; exclusion_reason: string }[];
}

export interface MethodReconciliationOutput {
  included_methods: { method_key: string; method_name: string; weight: Percentage; weighted_ev_low: Money; weighted_ev_mid: Money; weighted_ev_high: Money }[];
  excluded_methods: { method_key: string; method_name: string; exclusion_reason: string }[];
  total_weight: Percentage;
  weighted_ev_low: Money;
  weighted_ev_mid: Money;
  weighted_ev_high: Money;
  warnings: CalculationWarning[];
}

// ════════════════════════════════════════════════════════════════════════
// EXPLAINABILITY
// ════════════════════════════════════════════════════════════════════════

export interface ExplainabilityNode {
  node_id: string;
  node_type: 'enterprise_value' | 'equity_value' | 'method_reconciliation' | 'method_result' | 'normalized_earnings' | 'financial_period' | 'adjustment' | 'multiple' | 'multiple_adjustment' | 'benchmark' | 'confidence' | 'scenario' | 'value_driver' | 'evidence';
  label: string;
  value: string;
  parent_node_id: string | null;
  source_type: string;
  source_id: string | null;
  confidence: number | null;
  advisor_approval: boolean;
  client_visible: boolean;
  explanation: string;
}

export interface ExplainabilityGraph {
  nodes: ExplainabilityNode[];
  root_node_id: string;
}

// ════════════════════════════════════════════════════════════════════════
// WARNINGS & ERRORS
// ════════════════════════════════════════════════════════════════════════

export interface CalculationWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  field?: string;
}

export interface CalculationError {
  code: string;
  message: string;
  field?: string;
}

// ════════════════════════════════════════════════════════════════════════
// CALCULATION ENVELOPE
// ════════════════════════════════════════════════════════════════════════

export interface CalculationLineageItem {
  step: string;
  engine_module: string;
  input_hash: string;
  output_hash: string;
  duration_ms: number;
  warnings_count: number;
  errors_count: number;
}

export interface CalculationEnvelope {
  success: boolean;
  engine_version: string;
  methodology_version: string;
  calculation_type: string;
  calculated_at: string;
  input_hash: string;
  output_hash: string;
  inputs_summary: Record<string, unknown>;
  outputs: Record<string, unknown>;
  calculation_lines: Record<string, unknown>[];
  warnings: CalculationWarning[];
  errors: CalculationError[];
  confidence_inputs: Record<string, unknown>;
  lineage: CalculationLineageItem[];
}

// ════════════════════════════════════════════════════════════════════════
// PIPELINE INPUT
// ════════════════════════════════════════════════════════════════════════

export interface ValuationCalculationPipelineInput {
  valuation_id: string;
  business_id: string;
  financial_periods: FinancialPeriod[];
  adjustments: ApprovedAdjustment[];
  method_selections: { method_key: string; method_name: string; selection_role: 'primary' | 'secondary' | 'supporting' | 'excluded'; advisor_approved: boolean }[];
  benchmarks: BenchmarkInput[];
  dcf_inputs: DCFInput | null;
  cap_inputs: CapitalizationInput | null;
  asset_items: AssetItem[];
  equity_bridge_items: EquityBridgeItem[];
  confidence_scores: ConfidenceScoreInput[];
  confidence_weights: { data: Percentage; earnings: Percentage; market: Percentage; operational: Percentage; forecast: Percentage };
  scenario_inputs: ScenarioInput[];
  value_driver_inputs: ValueDriverInput[];
  historical_weighting: HistoricalWeightingInput | null;
  earnings_basis: 'ebitda' | 'sde';
  market_replacement_compensation: Money | null;
  eligible_owner_benefits: Money | null;
  other_owner_adjustments: Money | null;
}

export interface ValuationCalculationPipelineOutput {
  envelope: CalculationEnvelope;
  normalized_earnings: NormalizedEarningsOutput | null;
  historical_weighting: HistoricalWeightingOutput | null;
  method_results: { method_key: string; method_name: string; result: MultipleCalculationOutput | DCFOutput | CapitalizationOutput | AssetApproachOutput | null }[];
  reconciliation: MethodReconciliationOutput | null;
  equity_bridge: EquityBridgeOutput | null;
  confidence: ConfidenceOutput | null;
  scenarios: ScenarioOutput[];
  value_drivers: ValueDriverOutput[];
  explainability: ExplainabilityGraph | null;
}