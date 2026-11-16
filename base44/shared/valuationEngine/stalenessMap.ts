/**
 * stalenessMap.ts — Staleness Dependency Map for Valuation Calculations.
 *
 * Defines which calculation types become stale when specific source records change.
 * Used by the backend to mark calculations stale after source input changes.
 *
 * Pure data module: no DB, no React, no SDK. Deterministic.
 */

export type SourceChangeType =
  | 'financial_period_changed'
  | 'adjustment_changed'
  | 'benchmark_changed'
  | 'method_selection_changed'
  | 'dcf_assumption_changed'
  | 'asset_item_changed'
  | 'equity_bridge_item_changed'
  | 'confidence_input_changed'
  | 'scenario_assumption_changed'
  | 'historical_weighting_changed'
  | 'answer_changed';

export type CalculationType =
  | 'normalized_earnings'
  | 'historical_weighting'
  | 'ebitda_multiple'
  | 'sde_multiple'
  | 'revenue_multiple'
  | 'guideline_transaction'
  | 'comparable_company'
  | 'dcf'
  | 'capitalization_of_earnings'
  | 'adjusted_net_asset'
  | 'asset_floor'
  | 'orderly_liquidation'
  | 'liquidation'
  | 'reconciliation'
  | 'equity_bridge'
  | 'confidence'
  | 'scenario'
  | 'value_driver'
  | 'advisor_conclusion'
  | 'client_safe_summary';

interface StalenessRule {
  source_change: SourceChangeType;
  affected_calculations: CalculationType[];
  description: string;
}

export const STALENESS_MAP: StalenessRule[] = [
  {
    source_change: 'financial_period_changed',
    affected_calculations: [
      'normalized_earnings',
      'historical_weighting',
      'ebitda_multiple',
      'sde_multiple',
      'revenue_multiple',
      'capitalization_of_earnings',
      'dcf',
      'reconciliation',
      'equity_bridge',
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Financial period change affects all earnings-based calculations and downstream',
  },
  {
    source_change: 'adjustment_changed',
    affected_calculations: [
      'normalized_earnings',
      'historical_weighting',
      'ebitda_multiple',
      'sde_multiple',
      'capitalization_of_earnings',
      'reconciliation',
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Adjustment change affects normalized earnings and all downstream',
  },
  {
    source_change: 'benchmark_changed',
    affected_calculations: [
      'ebitda_multiple',
      'sde_multiple',
      'revenue_multiple',
      'reconciliation',
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Benchmark change affects multiple-based methods and downstream',
  },
  {
    source_change: 'method_selection_changed',
    affected_calculations: [
      'reconciliation',
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Method selection change affects reconciliation and downstream',
  },
  {
    source_change: 'dcf_assumption_changed',
    affected_calculations: [
      'dcf',
      'reconciliation',
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'DCF assumption change affects DCF calculation and downstream',
  },
  {
    source_change: 'asset_item_changed',
    affected_calculations: [
      'adjusted_net_asset',
      'asset_floor',
      'orderly_liquidation',
      'liquidation',
      'reconciliation',
      'equity_bridge',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Asset item change affects asset approach and downstream',
  },
  {
    source_change: 'equity_bridge_item_changed',
    affected_calculations: [
      'equity_bridge',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Equity bridge item change affects equity value and downstream',
  },
  {
    source_change: 'confidence_input_changed',
    affected_calculations: [
      'confidence',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Confidence input change affects confidence score and downstream',
  },
  {
    source_change: 'scenario_assumption_changed',
    affected_calculations: [
      'scenario',
      'client_safe_summary',
    ],
    description: 'Scenario assumption change affects the specific scenario and client summary',
  },
  {
    source_change: 'historical_weighting_changed',
    affected_calculations: [
      'historical_weighting',
      'ebitda_multiple',
      'sde_multiple',
      'capitalization_of_earnings',
      'reconciliation',
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Historical weighting change affects maintainable earnings and downstream',
  },
  {
    source_change: 'answer_changed',
    affected_calculations: [
      'confidence',
      'scenario',
      'advisor_conclusion',
      'client_safe_summary',
    ],
    description: 'Questionnaire answer change affects confidence and conclusions (relevance-dependent)',
  },
];

export function getAffectedCalculations(sourceChange: SourceChangeType): CalculationType[] {
  const rule = STALENESS_MAP.find(r => r.source_change === sourceChange);
  return rule?.affected_calculations || [];
}

export function getStaleReason(sourceChange: SourceChangeType): string {
  const rule = STALENESS_MAP.find(r => r.source_change === sourceChange);
  return rule?.description || sourceChange;
}

/**
 * Map calculation types to the calculation_type values stored in valuation_calculations.
 */
export const CALC_TYPE_TO_DB_TYPE: Record<string, string> = {
  normalized_earnings: 'normalized_earnings',
  ebitda_multiple: 'ebitda_multiple',
  sde_multiple: 'sde_multiple',
  revenue_multiple: 'revenue_multiple',
  dcf: 'dcf',
  capitalization_of_earnings: 'capitalization_of_earnings',
  adjusted_net_asset: 'adjusted_net_asset',
  asset_floor: 'asset_floor',
  reconciliation: 'reconciliation',
  equity_bridge: 'equity_bridge',
};

/**
 * Map calculation types to their respective tables that also need staleness marking.
 */
export const CALC_TYPE_TO_TABLE: Record<string, string> = {
  dcf: 'valuation_dcf_projections',
  capitalization_of_earnings: 'valuation_cap_earnings',
};