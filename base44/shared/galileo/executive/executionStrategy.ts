/**
 * Execution Strategy — Phase 13.4C.1
 *
 * Determines: Quick, Advisor, Executive, Preview, Read, Draft, Review, Recommend, Confirm.
 * Never executes automatically. Only determines strategy.
 *
 * Pure reasoning. No LLM.
 */
import type {
  ExecutionStrategy, ExecutionStrategyType, CapabilitySelection, ExecutiveState, Intent
} from './types.ts';

export function determineStrategy(
  selection: CapabilitySelection,
  state: ExecutiveState,
  intent: Intent
): ExecutionStrategy {
  const capId = selection.selectedCapabilityId;

  // Blocked → recommend gathering context
  if (selection.blockedCapabilityIds.includes(capId)) {
    return {
      type: 'recommend',
      requiresSession: false,
      requiresConfirmation: false,
      reasoning: 'Capability is blocked; recommend gathering missing context first.',
    };
  }

  // Free capabilities → quick
  if (capId === 'review.uploaded_documents') {
    return {
      type: 'quick',
      requiresSession: false,
      requiresConfirmation: false,
      reasoning: 'Document review is educational and always free.',
    };
  }

  // Preview if sessions exhausted
  if (state.sessionsRemaining === 0 && !state.isAssignedAdvisor) {
    return {
      type: 'preview',
      requiresSession: false,
      requiresConfirmation: false,
      reasoning: 'Sessions exhausted; show preview with high-level finding.',
    };
  }

  // Intent-based strategy
  if (intent.type === 'learn' || intent.type === 'navigate') {
    return {
      type: 'read',
      requiresSession: false,
      requiresConfirmation: false,
      reasoning: 'Educational intent; provide information without consuming a session.',
    };
  }

  if (intent.type === 'compare') {
    return {
      type: 'review',
      requiresSession: true,
      requiresConfirmation: false,
      reasoning: 'Comparison requires analyzing multiple valuation versions.',
    };
  }

  if (intent.type === 'publish') {
    return {
      type: 'confirm',
      requiresSession: true,
      requiresConfirmation: true,
      reasoning: 'Publication requires explicit confirmation before proceeding.',
    };
  }

  if (intent.type === 'plan' || intent.type === 'execute') {
    return {
      type: 'advisor',
      requiresSession: true,
      requiresConfirmation: false,
      reasoning: 'Planning requires strategic reasoning at advisor level.',
    };
  }

  // Default: advisor level for strategic capabilities
  return {
    type: 'advisor',
    requiresSession: true,
    requiresConfirmation: false,
    reasoning: 'Strategic reasoning required at advisor level.',
  };
}

export function isFreeStrategy(strategy: ExecutionStrategy): boolean {
  return !strategy.requiresSession;
}