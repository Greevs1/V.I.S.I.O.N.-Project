/**
 * businessMemory/clientSafe.ts — Phase 15.5
 *
 * Client-Safe Memory Filtering.
 *
 * Some memories may be client-visible:
 *   - agreed strategic objective
 *   - agreed initiative
 *   - owner-stated goal
 *   - published milestone
 *
 * Others must remain internal:
 *   - advisor concern
 *   - internal risk interpretation
 *   - hidden negotiation strategy
 *   - internal valuation debate
 *
 * Visibility is enforced BEFORE retrieval — not by Galileo prompts later.
 */

import type { BusinessMemoryRecord, ClientSafeMemory } from './types.ts';

export function filterMemoriesForClient(
  memories: BusinessMemoryRecord[]
): ClientSafeMemory[] {
  return memories
    .filter((m) => m.client_visible === true)
    .filter((m) => m.memory_status === 'confirmed')
    .filter((m) => !m.superseded_by)
    .filter((m) => m.current_relevance === 'current' || m.current_relevance === 'historical')
    .map((m) => toClientSafeMemory(m));
}

export function isMemoryClientSafe(memory: BusinessMemoryRecord): boolean {
  return memory.client_visible === true;
}

export function toClientSafeMemory(memory: BusinessMemoryRecord): ClientSafeMemory {
  return {
    memory_id: memory.memory_id,
    category: memory.category,
    title: memory.title,
    summary: memory.summary,
    effective_date: memory.effective_date,
    importance: memory.importance,
    relevance_tags: memory.relevance_tags || [],
    source_summary: memory.source_reference?.record_summary || 'Advisor-confirmed context',
  };
}

export function getExcludedInternalCategories(): string[] {
  return [
    'advisor_decision',
    'risk_acceptance',
    'strategic_constraint',
  ];
}

export function shouldEnforceClientSafe(role: string): boolean {
  // Owners and viewers always get client-safe filtering
  // Advisors and admins see everything
  return role === 'owner' || role === 'team_member' || role === 'viewer' || role === 'user';
}