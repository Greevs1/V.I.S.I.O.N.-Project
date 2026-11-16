/**
 * valuationEngine/confidenceEngine.ts — Confidence Scoring Engine.
 * Calculates data, earnings, market, operational, and forecast confidence.
 * Distinguishes calculation correctness from valuation confidence and defensibility.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal } from './decimal.ts';
import type { ConfidenceInput, ConfidenceOutput, ConfidenceScoreInput, CalculationWarning } from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

export function calculateConfidence(input: ConfidenceInput): ConfidenceOutput {
  const warnings: CalculationWarning[] = [];
  const missingEvidence: string[] = [];
  const conflictingData: string[] = [];
  const unsupportedAssumptions: string[] = [];
  const defensibilityConstraints: string[] = [];
  const recommendedEvidence: string[] = [];

  // ── Group scores by category ──────────────────────────────────────
  const categories = ['data', 'earnings', 'market', 'operational', 'forecast'] as const;
  const categoryScores: { category: string; score: number; weight: Decimal; weighted_score: number }[] = [];

  for (const cat of categories) {
    const catScores = input.scores.filter(s => s.category === cat);
    if (catScores.length === 0) {
      warnings.push({
        code: `NO_${cat.toUpperCase()}_SCORES`,
        message: `No confidence scores provided for ${cat} category`,
        severity: 'warning',
      });
      categoryScores.push({
        category: cat,
        score: 0,
        weight: input.weights[cat],
        weighted_score: 0,
      });
      continue;
    }

    const avgScore = catScores.reduce((sum, s) => sum + s.score, 0) / catScores.length;
    const weight = input.weights[cat];
    const weightedScore = avgScore * weight.toNumber();

    categoryScores.push({
      category: cat,
      score: Math.round(avgScore),
      weight,
      weighted_score: weightedScore,
    });

    // Collect missing evidence
    catScores.forEach(s => {
      s.missing_evidence.forEach(e => {
        if (!missingEvidence.includes(e)) missingEvidence.push(e);
      });
    });
  }

  // ── Overall confidence ────────────────────────────────────────────
  const overallConfidence = Math.round(
    categoryScores.reduce((sum, cs) => sum + cs.weighted_score, 0)
  );

  // ── Defensibility constraints ─────────────────────────────────────
  if (categoryScores.find(cs => cs.category === 'data')?.score < 50) {
    defensibilityConstraints.push('Data confidence below 50% — full indicated value may not be defensible without additional documentation');
  }
  if (categoryScores.find(cs => cs.category === 'market')?.score < 40) {
    defensibilityConstraints.push('Market confidence below 40% — multiple-based methods may not be defensible without better benchmark data');
  }
  if (categoryScores.find(cs => cs.category === 'forecast')?.score < 50) {
    defensibilityConstraints.push('Forecast confidence below 50% — DCF results may not be defensible');
  }

  // ── Recommended evidence ──────────────────────────────────────────
  if (missingEvidence.includes('Tax-return reconciliation')) {
    recommendedEvidence.push('Obtain tax returns to reconcile with financial statements');
  }
  if (missingEvidence.includes('Benchmark data')) {
    recommendedEvidence.push('Obtain approved industry benchmark data for multiple-based methods');
  }
  if (missingEvidence.includes('Forecast documentation')) {
    recommendedEvidence.push('Document forecast assumptions with historical support');
  }

  // ── Warnings ──────────────────────────────────────────────────────
  if (overallConfidence < 40) {
    warnings.push({
      code: 'LOW_OVERALL_CONFIDENCE',
      message: `Overall confidence is ${overallConfidence}%. Valuation may not be defensible.`,
      severity: 'warning',
    });
  }

  return {
    category_scores: categoryScores,
    overall_confidence: overallConfidence,
    missing_evidence: missingEvidence,
    conflicting_data: conflictingData,
    unsupported_assumptions: unsupportedAssumptions,
    defensibility_constraints: defensibilityConstraints,
    recommended_evidence: recommendedEvidence,
    warnings,
  };
}