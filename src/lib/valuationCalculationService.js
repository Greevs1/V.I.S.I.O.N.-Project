/**
 * valuationCalculationService — frontend wrapper for the Phase 13.3
 * Enterprise Value Calculation Engine backend function.
 */

import { base44 } from '@/api/base44Client';

// ── Method Selection ────────────────────────────────────────────────────
export async function saveMethodSelection(valuationId, methodKey, methodName, category, selectionRole, rationale, isSelected = true) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveMethodSelection',
    data: {
      valuation_id: valuationId,
      method_key: methodKey,
      method_name: methodName,
      category,
      selection_role: selectionRole,
      selection_rationale: rationale,
      is_selected: isSelected,
    },
  });
  return res.data;
}

export async function getMethodSelections(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getMethodSelections',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function approveMethodSelection(valuationId, methodKey, approved = true) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'approveMethodSelection',
    data: { valuation_id: valuationId, method_key: methodKey, approved },
  });
  return res.data;
}

// ── Normalized Earnings ──────────────────────────────────────────────────
export async function calculateNormalizedEarnings(valuationId, financialId = null, earningsBasis = 'ebitda') {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateNormalizedEarnings',
    data: { valuation_id: valuationId, financial_id: financialId, earnings_basis: earningsBasis },
  });
  return res.data;
}

export async function getNormalizedEarnings(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getNormalizedEarnings',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Historical Weighting ──────────────────────────────────────────────────
export async function saveHistoricalWeighting(valuationId, weightings) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveHistoricalWeighting',
    data: { valuation_id: valuationId, weightings },
  });
  return res.data;
}

export async function getHistoricalWeighting(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getHistoricalWeighting',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Benchmarks ────────────────────────────────────────────────────────────
export async function saveBenchmark(benchData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveBenchmark',
    data: benchData,
  });
  return res.data;
}

export async function getBenchmarks(filters = {}) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getBenchmarks',
    data: filters,
  });
  return res.data;
}

export async function deleteBenchmark(benchmarkId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'deleteBenchmark',
    data: { benchmark_id: benchmarkId },
  });
  return res.data;
}

// ── Multiple Method ──────────────────────────────────────────────────────
export async function calculateMultipleMethod(valuationId, earningsBasis, normalizedEarnings, multipleLow, multipleMid, multipleHigh) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateMultipleMethod',
    data: {
      valuation_id: valuationId,
      earnings_basis: earningsBasis,
      normalized_earnings: normalizedEarnings,
      final_multiple_low: multipleLow,
      final_multiple_mid: multipleMid,
      final_multiple_high: multipleHigh,
    },
  });
  return res.data;
}

export async function getMultipleCalculation(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getMultipleCalculation',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── DCF ───────────────────────────────────────────────────────────────────
export async function saveDCFProjection(valuationId, dcfData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveDCFProjection',
    data: { valuation_id: valuationId, ...dcfData },
  });
  return res.data;
}

export async function calculateDCF(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateDCF',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getDCF(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getDCF',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Capitalization of Earnings ───────────────────────────────────────────
export async function saveCapEarningsInputs(valuationId, capData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveCapEarningsInputs',
    data: { valuation_id: valuationId, ...capData },
  });
  return res.data;
}

export async function calculateCapEarnings(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateCapEarnings',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getCapEarnings(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getCapEarnings',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Asset Approach ───────────────────────────────────────────────────────
export async function saveAssetItem(valuationId, itemData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveAssetItem',
    data: { valuation_id: valuationId, ...itemData },
  });
  return res.data;
}

export async function getAssetItems(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getAssetItems',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function deleteAssetItem(assetItemId, valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'deleteAssetItem',
    data: { asset_item_id: assetItemId, valuation_id: valuationId },
  });
  return res.data;
}

export async function calculateAssetApproach(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateAssetApproach',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Method Reconciliation ────────────────────────────────────────────────
export async function saveMethodReconciliation(valuationId, methodWeights) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveMethodReconciliation',
    data: { valuation_id: valuationId, method_weights: methodWeights },
  });
  return res.data;
}

export async function calculateReconciledValue(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateReconciledValue',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getMethodReconciliation(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getMethodReconciliation',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Equity Bridge ────────────────────────────────────────────────────────
export async function saveEquityBridgeItem(valuationId, itemData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveEquityBridgeItem',
    data: { valuation_id: valuationId, ...itemData },
  });
  return res.data;
}

export async function getEquityBridge(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getEquityBridge',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function calculateEquityValue(valuationId, evLow, evMid, evHigh) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateEquityValue',
    data: {
      valuation_id: valuationId,
      enterprise_value_low: evLow,
      enterprise_value_mid: evMid,
      enterprise_value_high: evHigh,
    },
  });
  return res.data;
}

// ── Confidence Scoring ───────────────────────────────────────────────────
export async function saveConfidenceScore(valuationId, category, subCategory, score, maxScore, evidenceSummary, advisorAssessment) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveConfidenceScore',
    data: {
      valuation_id: valuationId,
      category,
      sub_category: subCategory,
      score,
      max_score: maxScore,
      evidence_summary: evidenceSummary,
      advisor_assessment: advisorAssessment,
    },
  });
  return res.data;
}

export async function calculateOverallConfidence(valuationId, categoryWeights) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'calculateOverallConfidence',
    data: { valuation_id: valuationId, category_weights: categoryWeights },
  });
  return res.data;
}

export async function getConfidenceScores(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getConfidenceScores',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Scenarios ────────────────────────────────────────────────────────────
export async function saveScenarioCalculation(valuationId, scenarioData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveScenarioCalculation',
    data: { valuation_id: valuationId, ...scenarioData },
  });
  return res.data;
}

export async function getScenarioCalculations(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getScenarioCalculations',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Value Drivers ────────────────────────────────────────────────────────
export async function saveValueDriver(valuationId, driverData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveValueDriver',
    data: { valuation_id: valuationId, ...driverData },
  });
  return res.data;
}

export async function getValueDrivers(valuationId, category = null) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getValueDrivers',
    data: { valuation_id: valuationId, category },
  });
  return res.data;
}

export async function updateValueDriver(driverId, updates) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'updateValueDriver',
    data: { driver_id: driverId, ...updates },
  });
  return res.data;
}

// ── Advisor Conclusion ──────────────────────────────────────────────────
export async function saveAdvisorConclusion(valuationId, conclusionData) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'saveAdvisorConclusion',
    data: { valuation_id: valuationId, ...conclusionData },
  });
  return res.data;
}

export async function getAdvisorConclusion(valuationId, conclusionType = null) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getAdvisorConclusion',
    data: { valuation_id: valuationId, conclusion_type: conclusionType },
  });
  return res.data;
}

// ── Summary & Staleness ──────────────────────────────────────────────────
export async function getCalculationSummary(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getCalculationSummary',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function markCalculationsStale(valuationId, sourceChange, sourceId = null, sourceType = null) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'markCalculationsStale',
    data: { valuation_id: valuationId, source_change: sourceChange, source_id: sourceId, source_type: sourceType },
  });
  return res.data;
}

export async function getStaleCalculations(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getStaleCalculations',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

// ── Phase 13.3C: Publication Readiness & Calculation Management ──────────
export async function validatePublicationReadiness(valuationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'validatePublicationReadiness',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getCalculationLines(valuationId, calculationId = null) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'getCalculationLines',
    data: { valuation_id: valuationId, calculation_id: calculationId },
  });
  return res.data;
}

export async function approveCalculation(valuationId, calculationId, approved = true) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'approveCalculation',
    data: { valuation_id: valuationId, calculation_id: calculationId, approved },
  });
  return res.data;
}

export async function supersedeCalculation(valuationId, oldCalculationId, newCalculationId) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'supersedeCalculation',
    data: { valuation_id: valuationId, old_calculation_id: oldCalculationId, new_calculation_id: newCalculationId },
  });
  return res.data;
}

export async function persistCalculationEnvelope(valuationId, calculationId, envelope) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'persistCalculationEnvelope',
    data: { valuation_id: valuationId, calculation_id: calculationId, envelope },
  });
  return res.data;
}

export async function recalculateValuation(valuationId, calculationTypes = null) {
  const res = await base44.functions.invoke('valuationCalculationEngine', {
    action: 'recalculateValuation',
    data: { valuation_id: valuationId, calculation_types: calculationTypes },
  });
  return res.data;
}