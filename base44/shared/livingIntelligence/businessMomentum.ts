/**
 * livingIntelligence/businessMomentum.ts — Phase 15.0
 *
 * Business Momentum — descriptive, not a score.
 *
 * Momentum summarizes:
 *   • Direction
 *   • Consistency
 *   • Acceleration
 *   • Execution
 *   • Confidence
 *
 * This is a FRAMEWORK. No scoring algorithm.
 * Momentum is derived from observations of certified engine outputs,
 * not from a calculation.
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from BIS, does not create truth)
 *   Article II — Single Ownership (BIE owns IQ Score, not Momentum)
 *   Article III — No Duplicate Intelligence (Momentum is descriptive, not calculated)
 *   Article IV — Explainability (every dimension is explainable)
 */

import type {
  BusinessMomentum,
  MomentumDirection,
  MomentumConsistency,
  MomentumAcceleration,
  MomentumExecution,
  MomentumConfidence,
  MomentumObservation,
  LivingIntelligenceInput,
} from './types.ts';

/**
 * Build Business Momentum from certified engine outputs.
 *
 * This function SYNTHESIZES observations — it does NOT calculate a score.
 * Each dimension is derived from observable patterns in the input data.
 */
export function buildBusinessMomentum(input: LivingIntelligenceInput): BusinessMomentum {
  const observations: MomentumObservation[] = [];

  // ── Direction: improving, stable, declining, mixed, unknown ──────────────
  // Derived from BIE journal changes (are metrics improving or declining?)
  const direction = deriveDirection(input, observations);

  // ── Consistency: consistent, variable, emerging, unknown ────────────────
  // Derived from the regularity of changes and updates
  const consistency = deriveConsistency(input, observations);

  // ── Acceleration: accelerating, steady, decelerating, unknown ────────────
  // Derived from the rate of change (are improvements speeding up or slowing?)
  const acceleration = deriveAcceleration(input, observations);

  // ── Execution: on_track, at_risk, behind, not_started, unknown ───────────
  // Derived from sprint progress and task completion
  const execution = deriveExecution(input, observations);

  // ── Confidence: high, medium, low, unknown ──────────────────────────────
  // Derived from the confidence scores of underlying data
  const confidence = deriveConfidence(input, observations);

  // ── Summary: human-readable, synthesized from observations ──────────────
  const summary = synthesizeMomentumSummary(direction, consistency, acceleration, execution, confidence);

  return {
    direction,
    consistency,
    acceleration,
    execution,
    confidence,
    summary,
    observations,
  };
}

// ── Direction ─────────────────────────────────────────────────────────────────
function deriveDirection(
  input: LivingIntelligenceInput,
  observations: MomentumObservation[],
): MomentumDirection {
  const bis = input.bis;
  if (!bis) {
    observations.push({
      dimension: 'direction',
      observation: 'No business intelligence available to determine direction',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  // Observe IQ Score trend from BIE journal
  const journal = bis._journal || [];
  if (journal.length < 2) {
    observations.push({
      dimension: 'direction',
      observation: 'Insufficient history to determine direction',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  const recent = journal.slice(-5);
  const iqScores = recent
    .filter((e: any) => e.metricValues?.iq_score != null)
    .map((e: any) => e.metricValues.iq_score);

  if (iqScores.length < 2) {
    observations.push({
      dimension: 'direction',
      observation: 'Insufficient IQ Score history for direction',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  const first = iqScores[0];
  const last = iqScores[iqScores.length - 1];
  const delta = last - first;

  // Observe multiple signals for mixed direction
  const signals: string[] = [];
  if (delta > 3) signals.push('IQ Score improving');
  else if (delta < -3) signals.push('IQ Score declining');

  // Check sprint progress
  const sprint = input.sprint_data;
  if (sprint && sprint.progress_percent != null) {
    if (sprint.progress_percent > 50) signals.push('Sprint progressing');
    else if (sprint.progress_percent < 25 && sprint.status === 'active') signals.push('Sprint behind');
  }

  observations.push({
    dimension: 'direction',
    observation: signals.join('; ') || 'Direction signals inconclusive',
    source: 'business_intelligence_synthesis' as any,
  });

  if (signals.length === 0) return 'unknown';
  const improving = signals.some(s => s.includes('improving') || s.includes('progressing'));
  const declining = signals.some(s => s.includes('declining') || s.includes('behind'));
  if (improving && declining) return 'mixed';
  if (improving) return 'improving';
  if (declining) return 'declining';
  return 'stable';
}

// ── Consistency ───────────────────────────────────────────────────────────────
function deriveConsistency(
  input: LivingIntelligenceInput,
  observations: MomentumObservation[],
): MomentumConsistency {
  const timeline = input.timeline || [];
  if (timeline.length === 0) {
    observations.push({
      dimension: 'consistency',
      observation: 'No timeline events to assess consistency',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  // Observe the regularity of business state events
  const eventCount = timeline.length;
  if (eventCount < 3) {
    observations.push({
      dimension: 'consistency',
      observation: 'Emerging pattern — insufficient events for consistency assessment',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'emerging';
  }

  observations.push({
    dimension: 'consistency',
    observation: `${eventCount} business state events recorded`,
    source: 'business_intelligence_synthesis' as any,
  });

  return eventCount >= 10 ? 'consistent' : 'variable';
}

// ── Acceleration ──────────────────────────────────────────────────────────────
function deriveAcceleration(
  input: LivingIntelligenceInput,
  observations: MomentumObservation[],
): MomentumAcceleration {
  const bis = input.bis;
  if (!bis || !bis._journal || bis._journal.length < 3) {
    observations.push({
      dimension: 'acceleration',
      observation: 'Insufficient data for acceleration assessment',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  // Observe the rate of change in journal entries
  const journal = bis._journal;
  const recentCount = journal.slice(-5).length;
  const olderCount = journal.slice(-10, -5).length;

  if (recentCount > olderCount) {
    observations.push({
      dimension: 'acceleration',
      observation: 'Recent activity exceeding prior period',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'accelerating';
  } else if (recentCount < olderCount) {
    observations.push({
      dimension: 'acceleration',
      observation: 'Recent activity below prior period',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'decelerating';
  }

  observations.push({
    dimension: 'acceleration',
    observation: 'Activity rate stable',
    source: 'business_intelligence_synthesis' as any,
  });
  return 'steady';
}

// ── Execution ────────────────────────────────────────────────────────────────
function deriveExecution(
  input: LivingIntelligenceInput,
  observations: MomentumObservation[],
): MomentumExecution {
  const sprint = input.sprint_data;
  if (!sprint) {
    observations.push({
      dimension: 'execution',
      observation: 'No active sprint to assess execution',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'not_started';
  }

  const progress = sprint.progress_percent || 0;
  const status = sprint.status;

  if (status === 'completed') {
    observations.push({
      dimension: 'execution',
      observation: 'Sprint completed',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'on_track';
  }

  if (status === 'active' && progress >= 50) {
    observations.push({
      dimension: 'execution',
      observation: `Sprint ${progress}% complete — on track`,
      source: 'business_intelligence_synthesis' as any,
    });
    return 'on_track';
  }

  if (status === 'active' && progress < 25) {
    observations.push({
      dimension: 'execution',
      observation: `Sprint ${progress}% complete — at risk`,
      source: 'business_intelligence_synthesis' as any,
    });
    return 'at_risk';
  }

  if (status === 'active' && progress < 50) {
    observations.push({
      dimension: 'execution',
      observation: `Sprint ${progress}% complete — behind`,
      source: 'business_intelligence_synthesis' as any,
    });
    return 'behind';
  }

  observations.push({
    dimension: 'execution',
    observation: 'Sprint in draft status',
    source: 'business_intelligence_synthesis' as any,
  });
  return 'not_started';
}

// ── Confidence ────────────────────────────────────────────────────────────────
function deriveConfidence(
  input: LivingIntelligenceInput,
  observations: MomentumObservation[],
): MomentumConfidence {
  const confidence = input.confidence_scores;
  if (!confidence) {
    observations.push({
      dimension: 'confidence',
      observation: 'No confidence scores available',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  const overall = confidence.overall_confidence || confidence.overall;
  if (overall == null) {
    observations.push({
      dimension: 'confidence',
      observation: 'Overall confidence not available',
      source: 'business_intelligence_synthesis' as any,
    });
    return 'unknown';
  }

  observations.push({
    dimension: 'confidence',
    observation: `Overall confidence: ${Math.round(overall)}/100`,
    source: 'certified_engine_output' as any,
  });

  if (overall >= 80) return 'high';
  if (overall >= 60) return 'medium';
  return 'low';
}

// ── Summary Synthesis ─────────────────────────────────────────────────────────
// One short line. Concise. No stacked clauses.
function synthesizeMomentumSummary(
  direction: MomentumDirection,
  consistency: MomentumConsistency,
  acceleration: MomentumAcceleration,
  execution: MomentumExecution,
  confidence: MomentumConfidence,
): string {
  // Direction + acceleration in one concise phrase
  if (direction === 'improving' && acceleration === 'accelerating') {
    return 'The business is trending upward and gaining momentum.';
  }
  if (direction === 'improving') {
    return consistency === 'consistent'
      ? 'The business is trending upward with consistent improvement.'
      : 'The business is trending upward.';
  }
  if (direction === 'declining') {
    return 'The business is trending downward.';
  }
  if (direction === 'mixed') {
    return 'Progress is mixed, with some areas improving and others needing attention.';
  }
  if (direction === 'stable') {
    return 'The business is holding steady.';
  }
  // Unknown — should not be shown (filtered by shouldShowMomentum)
  return '';
}