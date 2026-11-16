/**
 * valuationEngine/calculationPipeline.ts — Calculation Pipeline Orchestrator.
 * Runs the full valuation calculation sequence.
 * Does NOT persist data. valuationService persists after pipeline succeeds.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal, money } from './decimal.ts';
import type {
  ValuationCalculationPipelineInput,
  ValuationCalculationPipelineOutput,
  CalculationEnvelope,
  CalculationLineageItem,
  CalculationWarning,
  CalculationError,
  MultipleCalculationOutput,
  DCFOutput,
  CapitalizationOutput,
  AssetApproachOutput,
  MethodResult,
} from './types.ts';
import { calculateNormalizedEarnings } from './normalizedEarnings.ts';
import { calculateHistoricalWeighting } from './historicalWeighting.ts';
import { calculateMultipleMethod } from './multipleEngine.ts';
import { calculateDCF } from './dcfEngine.ts';
import { calculateCapitalization } from './capitalizationEngine.ts';
import { calculateAssetApproach } from './assetEngine.ts';
import { calculateEquityBridge } from './equityBridge.ts';
import { calculateConfidence } from './confidenceEngine.ts';
import { processScenarios } from './scenarioEngine.ts';
import { processValueDrivers } from './valueDriverEngine.ts';
import { calculateReconciliation } from './reconciliationEngine.ts';
import { buildExplainabilityGraph } from './explainabilityEngine.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

function hashInput(input: unknown): string {
  const str = JSON.stringify(input, Object.keys(input as object || {}).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function hashOutput(output: unknown): string {
  return hashInput(output);
}

export function runValuationCalculationPipeline(
  input: ValuationCalculationPipelineInput
): ValuationCalculationPipelineOutput {
  const warnings: CalculationWarning[] = [];
  const errors: CalculationError[] = [];
  const lineage: CalculationLineageItem[] = [];
  const startTime = Date.now();

  // ── Step 1: Validate engagement setup ─────────────────────────────
  if (!input.valuation_id) {
    errors.push({ code: 'NO_VALUATION_ID', message: 'Valuation ID is required' });
  }
  if (!input.business_id) {
    errors.push({ code: 'NO_BUSINESS_ID', message: 'Business ID is required' });
  }

  // ── Step 2: Validate approved financials ──────────────────────────
  const approvedPeriods = input.financial_periods.filter(p => p.advisor_approval_status === 'approved');
  if (approvedPeriods.length === 0) {
    warnings.push({
      code: 'NO_APPROVED_PERIODS',
      message: 'No approved financial periods. Using all available periods.',
      severity: 'warning',
    });
  }
  const periodsToUse = approvedPeriods.length > 0 ? approvedPeriods : input.financial_periods;

  const approvedAdjustments = input.adjustments.filter(a => a.advisor_approval_status === 'approved');

  // ── Step 3: Normalize earnings ────────────────────────────────────
  let normalizedEarnings = null;
  if (periodsToUse.length > 0) {
    const normStart = Date.now();
    normalizedEarnings = calculateNormalizedEarnings({
      period: periodsToUse[periodsToUse.length - 1], // Latest period
      adjustments: approvedAdjustments,
      earnings_basis: input.earnings_basis,
      market_replacement_compensation: input.market_replacement_compensation,
      eligible_owner_benefits: input.eligible_owner_benefits,
      other_owner_adjustments: input.other_owner_adjustments,
    });
    warnings.push(...normalizedEarnings.warnings);
    lineage.push({
      step: 'normalize_earnings',
      engine_module: 'normalizedEarnings',
      input_hash: hashInput({ period: periodsToUse[periodsToUse.length - 1].id, adjustments: approvedAdjustments.length }),
      output_hash: hashOutput(normalizedEarnings.normalized_ebitda),
      duration_ms: Date.now() - normStart,
      warnings_count: normalizedEarnings.warnings.length,
      errors_count: 0,
    });
  }

  // ── Step 4: Apply historical weighting ───────────────────────────
  let historicalWeighting = null;
  if (input.historical_weighting && periodsToUse.length > 0) {
    const hwStart = Date.now();
    historicalWeighting = calculateHistoricalWeighting(input.historical_weighting);
    warnings.push(...historicalWeighting.warnings);
    lineage.push({
      step: 'historical_weighting',
      engine_module: 'historicalWeighting',
      input_hash: hashInput(input.historical_weighting),
      output_hash: hashOutput(historicalWeighting.final_maintainable_earnings),
      duration_ms: Date.now() - hwStart,
      warnings_count: historicalWeighting.warnings.length,
      errors_count: 0,
    });
  }

  // ── Step 5: Validate selected methods ────────────────────────────
  const activeMethods = input.method_selections.filter(m => m.selection_role !== 'excluded' && m.advisor_approved);
  if (activeMethods.length === 0) {
    warnings.push({
      code: 'NO_ACTIVE_METHODS',
      message: 'No approved methods selected. Cannot calculate valuation.',
      severity: 'error',
    });
  }

  // ── Step 6: Run each selected method ──────────────────────────────
  const methodResults: { method_key: string; method_name: string; result: MultipleCalculationOutput | DCFOutput | CapitalizationOutput | AssetApproachOutput | null }[] = [];
  const reconMethodResults: MethodResult[] = [];

  const earningsForMethods = historicalWeighting?.final_maintainable_earnings || normalizedEarnings?.normalized_ebitda || Decimal.zero();

  for (const method of activeMethods) {
    const mStart = Date.now();
    let result: MultipleCalculationOutput | DCFOutput | CapitalizationOutput | AssetApproachOutput | null = null;

    switch (method.method_key) {
      case 'ebitda_multiple':
      case 'sde_multiple':
      case 'revenue_multiple':
      case 'guideline_transaction':
      case 'comparable_company': {
        const benchmark = input.benchmarks.find(b => b.earnings_basis === input.earnings_basis && b.is_approved) || null;
        result = calculateMultipleMethod({
          normalized_earnings: earningsForMethods,
          earnings_basis: input.earnings_basis,
          benchmark,
          baseline_multiple: benchmark?.multiple_mid || Decimal.zero(),
          adjustments: [],
        });
        if (result && 'enterprise_value_mid' in result) {
          reconMethodResults.push({
            method_key: method.method_key,
            method_name: method.method_name,
            enterprise_value_low: (result as MultipleCalculationOutput).enterprise_value_low,
            enterprise_value_mid: (result as MultipleCalculationOutput).enterprise_value_mid,
            enterprise_value_high: (result as MultipleCalculationOutput).enterprise_value_high,
            reliability_score: 70,
            applicability_score: 80,
            data_quality_score: benchmark ? 75 : 30,
          });
        }
        break;
      }
      case 'dcf': {
        if (input.dcf_inputs) {
          result = calculateDCF(input.dcf_inputs);
          if (result && 'enterprise_value' in result) {
            reconMethodResults.push({
              method_key: method.method_key,
              method_name: method.method_name,
              enterprise_value_low: (result as DCFOutput).enterprise_value,
              enterprise_value_mid: (result as DCFOutput).enterprise_value,
              enterprise_value_high: (result as DCFOutput).enterprise_value,
              reliability_score: 50,
              applicability_score: 60,
              data_quality_score: 50,
            });
          }
        }
        break;
      }
      case 'capitalization_of_earnings': {
        if (input.cap_inputs) {
          result = calculateCapitalization(input.cap_inputs);
          if (result && 'indicated_value' in result) {
            reconMethodResults.push({
              method_key: method.method_key,
              method_name: method.method_name,
              enterprise_value_low: (result as CapitalizationOutput).indicated_value,
              enterprise_value_mid: (result as CapitalizationOutput).indicated_value,
              enterprise_value_high: (result as CapitalizationOutput).indicated_value,
              reliability_score: 65,
              applicability_score: 70,
              data_quality_score: 60,
            });
          }
        }
        break;
      }
      case 'adjusted_net_asset':
      case 'asset_floor':
      case 'orderly_liquidation':
      case 'liquidation': {
        result = calculateAssetApproach({
          asset_items: input.asset_items,
          earnings_method_used: activeMethods.some(m => ['ebitda_multiple', 'sde_multiple', 'dcf', 'capitalization_of_earnings'].includes(m.method_key)),
        });
        if (result && 'adjusted_net_asset_value' in result) {
          const ar = result as AssetApproachOutput;
          reconMethodResults.push({
            method_key: method.method_key,
            method_name: method.method_name,
            enterprise_value_low: ar.asset_floor_value,
            enterprise_value_mid: ar.adjusted_net_asset_value,
            enterprise_value_high: ar.adjusted_net_asset_value,
            reliability_score: 60,
            applicability_score: 50,
            data_quality_score: 70,
          });
        }
        break;
      }
    }

    if (result) {
      warnings.push(...result.warnings);
      methodResults.push({ method_key: method.method_key, method_name: method.method_name, result });
    }

    lineage.push({
      step: `method_${method.method_key}`,
      engine_module: method.method_key,
      input_hash: hashInput({ method: method.method_key, earnings: earningsForMethods.toNumber() }),
      output_hash: hashOutput(result),
      duration_ms: Date.now() - mStart,
      warnings_count: result?.warnings.length || 0,
      errors_count: 0,
    });
  }

  // ── Step 7: Run method reconciliation ─────────────────────────────
  let reconciliation = null;
  if (reconMethodResults.length > 0) {
    const reconStart = Date.now();
    const weights = activeMethods.map(m => ({
      method_key: m.method_key,
      weight: Decimal.fromNumber(1).divide(Decimal.fromNumber(activeMethods.length)), // Equal weights default
    }));
    reconciliation = calculateReconciliation({
      method_results: reconMethodResults,
      weights,
      excluded_methods: input.method_selections.filter(m => m.selection_role === 'excluded').map(m => ({
        method_key: m.method_key,
        method_name: m.method_name,
        exclusion_reason: 'Advisor excluded',
      })),
    });
    warnings.push(...reconciliation.warnings);
    lineage.push({
      step: 'reconciliation',
      engine_module: 'reconciliationEngine',
      input_hash: hashInput(reconMethodResults),
      output_hash: hashOutput(reconciliation.weighted_ev_mid),
      duration_ms: Date.now() - reconStart,
      warnings_count: reconciliation.warnings.length,
      errors_count: 0,
    });
  }

  // ── Step 8: Run equity bridge ─────────────────────────────────────
  let equityBridge = null;
  if (reconciliation) {
    const ebStart = Date.now();
    equityBridge = calculateEquityBridge({
      enterprise_value_low: reconciliation.weighted_ev_low,
      enterprise_value_mid: reconciliation.weighted_ev_mid,
      enterprise_value_high: reconciliation.weighted_ev_high,
      bridge_items: input.equity_bridge_items,
    });
    warnings.push(...equityBridge.warnings);
    lineage.push({
      step: 'equity_bridge',
      engine_module: 'equityBridge',
      input_hash: hashInput({ ev_mid: reconciliation.weighted_ev_mid.toNumber() }),
      output_hash: hashOutput(equityBridge.equity_value_mid),
      duration_ms: Date.now() - ebStart,
      warnings_count: equityBridge.warnings.length,
      errors_count: 0,
    });
  }

  // ── Step 9: Run confidence engine ────────────────────────────────
  let confidence = null;
  if (input.confidence_scores.length > 0) {
    const confStart = Date.now();
    confidence = calculateConfidence({
      scores: input.confidence_scores,
      weights: input.confidence_weights,
    });
    warnings.push(...confidence.warnings);
    lineage.push({
      step: 'confidence',
      engine_module: 'confidenceEngine',
      input_hash: hashInput(input.confidence_scores),
      output_hash: hashOutput(confidence.overall_confidence),
      duration_ms: Date.now() - confStart,
      warnings_count: confidence.warnings.length,
      errors_count: 0,
    });
  }

  // ── Step 10: Run scenario engine ──────────────────────────────────
  const scenarios = processScenarios(input.scenario_inputs);
  scenarios.forEach(s => warnings.push(...s.warnings));

  // ── Step 11: Run value-driver engine ──────────────────────────────
  const valueDrivers = processValueDrivers(input.value_driver_inputs);
  valueDrivers.forEach(vd => warnings.push(...vd.warnings));

  // ── Step 12: Build explainability graph ───────────────────────────
  const explainability = buildExplainabilityGraph({
    reconciliation,
    equityBridge,
    normalizedEarnings,
    methodResults,
    confidence,
    scenarios,
    valueDrivers,
  });

  // ── Step 13: Return calculation envelope ──────────────────────────
  const inputHash = hashInput({
    valuation_id: input.valuation_id,
    periods: input.financial_periods.length,
    adjustments: input.adjustments.length,
    methods: activeMethods.length,
  });

  const outputs: Record<string, unknown> = {
    normalized_ebitda: normalizedEarnings?.normalized_ebitda.toNumber() || 0,
    maintainable_earnings: historicalWeighting?.final_maintainable_earnings.toNumber() || 0,
    method_count: methodResults.length,
    reconciled_ev_low: reconciliation?.weighted_ev_low.toNumber() || 0,
    reconciled_ev_mid: reconciliation?.weighted_ev_mid.toNumber() || 0,
    reconciled_ev_high: reconciliation?.weighted_ev_high.toNumber() || 0,
    equity_value_mid: equityBridge?.equity_value_mid.toNumber() || 0,
    overall_confidence: confidence?.overall_confidence || 0,
    scenario_count: scenarios.length,
    value_driver_count: valueDrivers.length,
  };

  const outputHash = hashOutput(outputs);

  const envelope: CalculationEnvelope = {
    success: errors.length === 0,
    engine_version: ENGINE_VERSION,
    methodology_version: METHODOLOGY_VERSION,
    calculation_type: 'full_pipeline',
    calculated_at: new Date().toISOString(),
    input_hash: inputHash,
    output_hash: outputHash,
    inputs_summary: {
      valuation_id: input.valuation_id,
      business_id: input.business_id,
      period_count: input.financial_periods.length,
      adjustment_count: input.adjustments.length,
      method_count: activeMethods.length,
    },
    outputs,
    calculation_lines: lineage.map(l => ({ ...l })),
    warnings,
    errors,
    confidence_inputs: {
      scores: input.confidence_scores.length,
      weights: input.confidence_weights,
    },
    lineage,
  };

  return {
    envelope,
    normalized_earnings: normalizedEarnings,
    historical_weighting: historicalWeighting,
    method_results: methodResults,
    reconciliation,
    equity_bridge: equityBridge,
    confidence,
    scenarios,
    value_drivers: valueDrivers,
    explainability,
  };
}