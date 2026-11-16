/**
 * valuationEngine/index.ts — Barrel export for the valuation engine.
 * Import from here: import { runValuationCalculationPipeline } from '../../shared/valuationEngine/index.ts';
 */

export { Decimal, money, percentage, multiple, sum } from './decimal.ts';
export { METHODOLOGY_REGISTRY, getMethodDefinition, getMethodsByCategory, getMethodKeys } from './methodologyRegistry.ts';
export { calculateNormalizedEarnings } from './normalizedEarnings.ts';
export { calculateHistoricalWeighting } from './historicalWeighting.ts';
export { calculateMultipleMethod } from './multipleEngine.ts';
export { calculateDCF } from './dcfEngine.ts';
export { calculateCapitalization } from './capitalizationEngine.ts';
export { calculateAssetApproach } from './assetEngine.ts';
export { calculateEquityBridge } from './equityBridge.ts';
export { calculateConfidence } from './confidenceEngine.ts';
export { processScenario, processScenarios } from './scenarioEngine.ts';
export { processValueDriver, processValueDrivers } from './valueDriverEngine.ts';
export { calculateReconciliation } from './reconciliationEngine.ts';
export { buildExplainabilityGraph, getClientSafeGraph } from './explainabilityEngine.ts';
export { runValuationCalculationPipeline, ENGINE_VERSION, METHODOLOGY_VERSION } from './calculationPipeline.ts';

// Type re-exports
export type {
  Money, Percentage, Multiple,
  FinancialPeriod, ApprovedAdjustment,
  NormalizedEarningsInput, NormalizedEarningsOutput, NormalizedEarningsLine,
  HistoricalWeightingInput, HistoricalWeightingOutput,
  BenchmarkInput,
  MultipleCalculationInput, MultipleCalculationOutput, MultipleAdjustment,
  DCFInput, DCFOutput, DCFProjectionYear,
  CapitalizationInput, CapitalizationOutput,
  AssetApproachInput, AssetApproachOutput, AssetItem,
  EquityBridgeInput, EquityBridgeOutput, EquityBridgeItem,
  ConfidenceInput, ConfidenceOutput, ConfidenceScoreInput,
  ScenarioInput, ScenarioOutput,
  ValueDriverInput, ValueDriverOutput,
  MethodReconciliationInput, MethodReconciliationOutput, MethodResult,
  ExplainabilityGraph, ExplainabilityNode,
  CalculationWarning, CalculationError,
  CalculationEnvelope, CalculationLineageItem,
  ValuationCalculationPipelineInput, ValuationCalculationPipelineOutput,
} from './types.ts';