/**
 * Follow-up Planner — Phase 13.4C.1
 *
 * Determines what should happen after capability execution.
 * Uses the capability graph. No hardcoded flows.
 *
 * Pure reasoning. No LLM.
 */
import type { ExecutiveState, FollowUpPlan, FollowUpStep, PriorityLevel } from './types.ts';

// Capability graph — derived from the 20 registered placeholder capabilities
const CAPABILITY_GRAPH: Record<string, { next: string[]; reason: string; priority: PriorityLevel; optional: boolean }[]> = {
  'explain.enterprise_value': [
    { next: ['explain.confidence'], reason: 'After understanding EV, review confidence in the conclusion', priority: 'medium', optional: true },
    { next: ['investigate.conflict'], reason: 'If confidence is low, investigate potential conflicts', priority: 'high', optional: true },
    { next: ['increase.enterprise_value'], reason: 'Once EV is understood, explore ways to increase it', priority: 'medium', optional: true },
  ],
  'explain.equity_value': [
    { next: ['explain.enterprise_value'], reason: 'Equity value builds on enterprise value', priority: 'medium', optional: true },
  ],
  'explain.confidence': [
    { next: ['review.missing_information'], reason: 'Low confidence often relates to missing information', priority: 'high', optional: true },
    { next: ['investigate.conflict'], reason: 'Confidence issues may stem from data conflicts', priority: 'high', optional: true },
  ],
  'explain.build_value': [
    { next: ['build.90_day_plan'], reason: 'After understanding build value, create an execution plan', priority: 'medium', optional: true },
  ],
  'review.publication_readiness': [
    { next: ['draft.client_explanation'], reason: 'Once ready for publication, draft the client explanation', priority: 'medium', optional: true },
  ],
  'investigate.conflict': [
    { next: ['review.evidence'], reason: 'After investigating, review supporting evidence', priority: 'high', optional: false },
    { next: ['review.missing_information'], reason: 'Conflicts may require additional information', priority: 'medium', optional: true },
  ],
  'review.evidence': [
    { next: ['review.confidence'], reason: 'Evidence review informs confidence assessment', priority: 'medium', optional: true },
  ],
  'increase.enterprise_value': [
    { next: ['build.90_day_plan'], reason: 'EV increase strategies should be captured in a 90-day plan', priority: 'high', optional: false },
    { next: ['prepare.client_meeting'], reason: 'Prepare to discuss EV strategies with the client', priority: 'medium', optional: true },
  ],
  'build.90_day_plan': [
    { next: ['prepare.client_meeting'], reason: 'Review the plan with the client', priority: 'medium', optional: true },
    { next: ['review.publication_readiness'], reason: 'Check if the plan affects publication readiness', priority: 'low', optional: true },
  ],
  'prepare.client_meeting': [
    { next: ['review.publication_readiness'], reason: 'After meeting prep, verify publication readiness', priority: 'medium', optional: true },
  ],
  'prepare.buyer_meeting': [
    { next: ['review.risks'], reason: 'Before a buyer meeting, review risk factors', priority: 'high', optional: false },
  ],
  'compare.valuation_versions': [
    { next: ['explain.enterprise_value'], reason: 'After comparing versions, explain the current EV', priority: 'medium', optional: true },
  ],
  'review.missing_information': [
    { next: ['review.uploaded_documents'], reason: 'Check if uploaded documents fill information gaps', priority: 'medium', optional: true },
  ],
  'review.risks': [
    { next: ['increase.enterprise_value'], reason: 'After identifying risks, explore EV mitigation', priority: 'medium', optional: true },
  ],
  'review.opportunities': [
    { next: ['increase.enterprise_value'], reason: 'Opportunities feed into EV increase strategies', priority: 'medium', optional: true },
  ],
  'analyze.assessments': [
    { next: ['review.opportunities'], reason: 'Assessment analysis surfaces opportunities', priority: 'medium', optional: true },
  ],
  'review.financial_story': [
    { next: ['prepare.client_meeting'], reason: 'Financial story supports client meeting prep', priority: 'medium', optional: true },
  ],
  'review.uploaded_documents': [
    { next: ['review.evidence'], reason: 'Documents provide evidence for valuation', priority: 'medium', optional: true },
  ],
  'draft.client_explanation': [
    { next: ['review.publication_readiness'], reason: 'After drafting, verify publication readiness', priority: 'low', optional: true },
  ],
};

export function planFollowUp(
  executedCapabilityId: string,
  _state: ExecutiveState
): FollowUpPlan {
  const graphEntries = CAPABILITY_GRAPH[executedCapabilityId] || [];
  const nextSteps: FollowUpStep[] = graphEntries.map((entry) => ({
    capabilityId: entry.next[0],
    capabilityName: formatName(entry.next[0]),
    reason: entry.reason,
    priority: entry.priority,
    optional: entry.optional,
  }));

  return {
    currentCapabilityId: executedCapabilityId,
    nextSteps,
  };
}

export function getFollowUpCapabilities(capabilityId: string): string[] {
  const entries = CAPABILITY_GRAPH[capabilityId] || [];
  return entries.flatMap((e) => e.next);
}

export function hasFollowUp(capabilityId: string): boolean {
  return (CAPABILITY_GRAPH[capabilityId] || []).length > 0;
}

function formatName(capId: string): string {
  return capId.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}