/**
 * Capability Selection — Phase 13.4C.1
 *
 * The EIE chooses which capability should execute.
 * Not the user. The user simply asks. The engine selects.
 *
 * Uses the existing capability registry.
 * Pure reasoning. No LLM.
 */
import type {
  ExecutiveState, SituationAssessment, Intent, CapabilitySelection, Priority
} from './types.ts';

// Maps intent → preferred capability IDs (from the 20 registered placeholders)
const INTENT_CAPABILITY_MAP: Record<string, string[]> = {
  understand: ['explain.enterprise_value', 'explain.build_value', 'explain.confidence'],
  review: ['review.publication_readiness', 'review.evidence', 'review.risks', 'review.missing_information'],
  investigate: ['investigate.conflict', 'review.evidence'],
  prepare: ['prepare.client_meeting', 'prepare.buyer_meeting', 'prepare.board_meeting'],
  compare: ['compare.valuation_versions'],
  plan: ['build.90_day_plan', 'increase.enterprise_value'],
  publish: ['review.publication_readiness', 'draft.client_explanation'],
  explain: ['explain.enterprise_value', 'explain.equity_value', 'explain.build_value', 'explain.confidence'],
  navigate: ['review.missing_information'],
  learn: ['review.uploaded_documents'],
  execute: ['build.90_day_plan', 'increase.enterprise_value'],
};

export function selectCapability(
  intent: Intent,
  state: ExecutiveState,
  assessment: SituationAssessment,
  priorities: Priority[]
): CapabilitySelection {
  const candidateIds = INTENT_CAPABILITY_MAP[intent.type] || [];
  const blockedCapabilityIds: string[] = [];
  const missingContext: string[] = [];

  // Check context requirements
  for (const capId of candidateIds) {
    const missing = checkContextRequirements(capId, state);
    if (missing.length > 0) {
      blockedCapabilityIds.push(capId);
      missingContext.push(...missing);
    }
  }

  // Find first unblocked candidate
  const available = candidateIds.filter((id) => !blockedCapabilityIds.includes(id));

  let selectedId: string;
  let whySelected: string;

  if (available.length > 0) {
    // Prefer capability related to top priority
    const topPriority = priorities.length > 0 ? priorities[0] : null;
    if (topPriority && topPriority.relatedCapabilityId && available.includes(topPriority.relatedCapabilityId)) {
      selectedId = topPriority.relatedCapabilityId;
      whySelected = `Matches top priority: ${topPriority.title}`;
    } else {
      selectedId = available[0];
      whySelected = `Best match for intent: ${intent.type}`;
    }
  } else if (candidateIds.length > 0) {
    // All blocked — pick first to report why it's blocked
    selectedId = candidateIds[0];
    whySelected = 'Selected but blocked due to missing context.';
  } else {
    // No candidates — default to explanation
    selectedId = 'explain.enterprise_value';
    whySelected = 'No specific match; defaulting to enterprise value explanation.';
  }

  const alternativeCapabilityIds = available.filter((id) => id !== selectedId);

  const confidence = available.length > 0
    ? Math.min(100, 40 + (intent.confidence / 2))
    : 20;

  return {
    selectedCapabilityId: selectedId,
    selectedCapabilityName: formatCapabilityName(selectedId),
    confidence,
    whySelected,
    alternativeCapabilityIds,
    blockedCapabilityIds,
    missingContext: [...new Set(missingContext)],
  };
}

function checkContextRequirements(capId: string, state: ExecutiveState): string[] {
  const missing: string[] = [];
  if (capId.startsWith('explain.') || capId.startsWith('review.') || capId.startsWith('compare.')) {
    if (!state.valuationId) missing.push('Active valuation required');
  }
  if (capId.startsWith('prepare.')) {
    if (!state.meetingContext || !state.meetingContext.upcomingMeeting) {
      missing.push('Upcoming meeting required');
    }
  }
  if (capId === 'investigate.conflict') {
    if (!state.verificationState || state.verificationState.unresolvedConflicts === 0) {
      missing.push('Unresolved conflicts required');
    }
  }
  if (capId === 'build.90_day_plan' || capId === 'increase.enterprise_value') {
    if (!state.valuationId) missing.push('Approved valuation required');
  }
  return missing;
}

function formatCapabilityName(capId: string): string {
  return capId.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}