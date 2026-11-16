/**
 * decisionIntelligence/memoryIntegration.ts — Phase D
 *
 * Decision → Business Memory candidate generation.
 *
 * When a major decision is confirmed (DECIDED), it may become a Business
 * Memory candidate. This reuses the existing Business Memory candidate
 * governance pattern:
 *   AI proposes → Advisor confirms → Memory persisted
 *
 * NOT every decision becomes a memory. Only confirmed major decisions
 * that pass the durability test.
 */

import type { BusinessDecision, DecisionMemoryCandidate } from './types.ts';

/**
 * Determine if a confirmed decision should generate a memory candidate.
 * Only confirmed (DECIDED) decisions with strategic+ importance qualify.
 */
export function shouldGenerateMemoryCandidate(decision: BusinessDecision): boolean {
  if (decision.decision_status !== 'decided') return false;
  if (!['critical', 'strategic'].includes(decision.importance)) return false;
  if (!decision.selected_option_id) return false;
  return true;
}

/**
 * Generate a memory candidate from a confirmed decision.
 *
 * The candidate must still go through the existing Business Memory
 * confirmation workflow — it is NOT automatically persisted.
 */
export function generateMemoryCandidateFromDecision(
  decision: BusinessDecision,
): DecisionMemoryCandidate | null {
  if (!shouldGenerateMemoryCandidate(decision)) return null;

  const selectedOption = decision.options.find(
    (o) => o.option_id === decision.selected_option_id,
  );

  const summary = buildDecisionMemorySummary(decision, selectedOption?.label || 'Unknown');

  // Map decision type to memory category
  const category = mapDecisionTypeToMemoryCategory(decision.decision_type);

  return {
    decision_id: decision.decision_id,
    business_id: decision.business_id,
    category,
    title: decision.title,
    summary,
    effective_date: decision.decided_at
      ? decision.decided_at.split('T')[0]
      : new Date().toISOString().split('T')[0],
    importance: decision.importance === 'critical' ? 'critical' : 'strategic',
    source_reference: {
      record_type: 'business_decision',
      record_id: decision.decision_id,
      record_summary: decision.title,
    },
    client_visible: decision.client_visible,
    relevance_tags: buildRelevanceTags(decision),
  };
}

function buildDecisionMemorySummary(
  decision: BusinessDecision,
  selectedLabel: string,
): string {
  const parts: string[] = [];
  parts.push(`Decision: ${decision.title}`);
  parts.push(`Selected: ${selectedLabel}`);
  if (decision.decision_reason) {
    parts.push(`Reason: ${decision.decision_reason}`);
  }
  if (decision.decided_at) {
    parts.push(`Decided: ${decision.decided_at.split('T')[0]}`);
  }
  return parts.join('. ');
}

function mapDecisionTypeToMemoryCategory(
  decisionType: string,
): string {
  const mapping: Record<string, string> = {
    strategic: 'strategic_decision',
    financial: 'capital_allocation_decision',
    operating: 'strategic_decision',
    talent: 'leadership_change',
    capital_allocation: 'capital_allocation_decision',
    acquisition: 'transaction_intent',
    exit: 'transaction_intent',
    pricing: 'strategic_decision',
    growth: 'strategic_decision',
    risk: 'risk_acceptance',
    ownership: 'business_structure_change',
    tax: 'strategic_decision',
    technology: 'strategic_decision',
    other: 'strategic_decision',
  };
  return mapping[decisionType] || 'strategic_decision';
}

function buildRelevanceTags(decision: BusinessDecision): string[] {
  const tags = [decision.decision_type, 'decision'];
  if (decision.importance === 'critical') tags.push('critical');
  if (decision.meeting_context_id) tags.push('meeting_context');
  return tags;
}