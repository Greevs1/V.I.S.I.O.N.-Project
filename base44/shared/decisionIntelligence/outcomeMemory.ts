/**
 * decisionIntelligence/outcomeMemory.ts — Phase D.1
 *
 * Outcome → Business Memory candidate generation.
 *
 * When a human confirms a decision outcome review, durable lessons may
 * become Business Memory candidates. This reuses the existing Business
 * Memory candidate governance pattern:
 *   AI proposes → Advisor confirms → Memory persisted
 *
 * NOT every outcome generates a memory. Only reviewed decisions with
 * confirmed outcomes that pass the durability test.
 *
 * These are CANDIDATES — they are NOT automatically persisted.
 * The advisor must confirm them through the existing Business Memory
 * governance workflow.
 */

import type { BusinessDecision, OutcomeStatus } from './types.ts';
import type { OutcomeAnalysis, OutcomeMemoryCandidate } from './outcomeTypes.ts';

/**
 * Determine if a reviewed decision outcome should generate memory candidates.
 * Only decisions with a confirmed outcome (not pending/inconclusive) and
 * strategic+ importance qualify.
 */
export function shouldGenerateOutcomeMemoryCandidate(decision: BusinessDecision): boolean {
  if (!decision.outcome_reviewed_at) return false;
  if (!decision.outcome_status) return false;
  if (decision.outcome_status === 'pending' || decision.outcome_status === 'inconclusive') return false;
  if (!['critical', 'strategic'].includes(decision.importance)) return false;
  return true;
}

/**
 * Generate memory candidates from a confirmed outcome review.
 *
 * Uses the AI analysis's possible_lessons to create one or more candidates.
 * Each candidate must still go through the existing Business Memory
 * confirmation workflow — it is NOT automatically persisted.
 */
export function generateOutcomeMemoryCandidates(
  decision: BusinessDecision,
  analysis: OutcomeAnalysis | null,
): OutcomeMemoryCandidate[] {
  if (!shouldGenerateOutcomeMemoryCandidate(decision)) return [];

  const candidates: OutcomeMemoryCandidate[] = [];
  const now = new Date().toISOString().split('T')[0];

  // Generate a primary outcome memory candidate
  const primaryCategory = mapOutcomeToMemoryCategory(decision.outcome_status!, decision.decision_type);
  const primarySummary = buildOutcomeMemorySummary(decision, analysis);

  candidates.push({
    decision_id: decision.decision_id,
    business_id: decision.business_id,
    category: primaryCategory,
    title: `Outcome: ${decision.title}`,
    summary: primarySummary,
    effective_date: decision.outcome_reviewed_at
      ? decision.outcome_reviewed_at.split('T')[0]
      : now,
    importance: decision.importance === 'critical' ? 'critical' : 'strategic',
    source_reference: {
      record_type: 'business_decision_outcome',
      record_id: decision.decision_id,
      record_summary: decision.title,
    },
    client_visible: decision.client_visible,
    relevance_tags: buildOutcomeRelevanceTags(decision),
  });

  // Generate lesson-specific candidates from AI analysis
  if (analysis && analysis.possible_lessons.length > 0) {
    for (const lesson of analysis.possible_lessons.slice(0, 3)) {
      candidates.push({
        decision_id: decision.decision_id,
        business_id: decision.business_id,
        category: 'operating_philosophy',
        title: `Lesson: ${lesson.slice(0, 80)}`,
        summary: `From decision "${decision.title}" (outcome: ${decision.outcome_status}): ${lesson}`,
        effective_date: now,
        importance: 'useful',
        source_reference: {
          record_type: 'business_decision_outcome',
          record_id: decision.decision_id,
          record_summary: decision.title,
        },
        client_visible: decision.client_visible,
        relevance_tags: [...buildOutcomeRelevanceTags(decision), 'lesson'],
      });
    }
  }

  return candidates;
}

function buildOutcomeMemorySummary(
  decision: BusinessDecision,
  analysis: OutcomeAnalysis | null,
): string {
  const parts: string[] = [];
  parts.push(`Decision: ${decision.title}`);
  parts.push(`Outcome: ${decision.outcome_status}`);

  if (decision.outcome_notes) {
    parts.push(`Notes: ${decision.outcome_notes}`);
  }

  if (analysis && analysis.summary) {
    parts.push(`Analysis: ${analysis.summary}`);
  }

  if (analysis && analysis.possible_lessons.length > 0) {
    parts.push(`Lessons: ${analysis.possible_lessons.join('; ')}`);
  }

  return parts.join('. ');
}

function mapOutcomeToMemoryCategory(
  outcomeStatus: OutcomeStatus,
  decisionType: string,
): string {
  // Failed decisions create extremely valuable memory — preserve them
  if (outcomeStatus === 'failed') return 'strategic_decision';

  // Map by decision type
  const mapping: Record<string, string> = {
    strategic: 'strategic_decision',
    financial: 'capital_allocation_decision',
    operating: 'operating_philosophy',
    talent: 'leadership_change',
    capital_allocation: 'capital_allocation_decision',
    acquisition: 'transaction_intent',
    exit: 'transaction_intent',
    pricing: 'operating_philosophy',
    growth: 'strategic_decision',
    risk: 'risk_acceptance',
    ownership: 'strategic_decision',
    tax: 'strategic_decision',
    technology: 'operating_philosophy',
    other: 'strategic_decision',
  };
  return mapping[decisionType] || 'strategic_decision';
}

function buildOutcomeRelevanceTags(decision: BusinessDecision): string[] {
  const tags = [decision.decision_type, 'decision_outcome'];
  if (decision.outcome_status === 'failed') tags.push('failed_decision_lesson');
  if (decision.outcome_status === 'succeeded') tags.push('successful_decision');
  if (decision.importance === 'critical') tags.push('critical');
  return tags;
}