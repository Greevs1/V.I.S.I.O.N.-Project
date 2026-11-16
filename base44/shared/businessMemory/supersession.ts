/**
 * businessMemory/supersession.ts — Phase 15.5
 *
 * Memory Supersession.
 *
 * Business strategies change. When a new memory contradicts or replaces
 * an existing one, we do NOT overwrite the old memory.
 *
 * Instead:
 *   - Mark the old memory as superseded
 *   - Link the new memory as superseding the old
 *   - The historical decision remains explainable
 *
 * Example:
 *   Memory A: "Owner plans to sell in 2028."
 *   Later:
 *   Memory B: "Owner decided to retain the business and pursue acquisition growth."
 *   → A is superseded by B. A remains historically explainable.
 */

import type { BusinessMemoryRecord, SupersessionResult } from './types.ts';

export function supersedeMemory(
  oldMemory: BusinessMemoryRecord,
  newMemory: BusinessMemoryRecord
): { updatedOld: BusinessMemoryRecord; updatedNew: BusinessMemoryRecord } {
  const timestamp = new Date().toISOString();

  const updatedOld: BusinessMemoryRecord = {
    ...oldMemory,
    memory_status: 'superseded',
    confirmation_status: 'superseded',
    current_relevance: 'historical',
    superseded_by: newMemory.memory_id,
    superseded_at: timestamp,
  };

  const updatedNew: BusinessMemoryRecord = {
    ...newMemory,
    supersedes: oldMemory.memory_id,
  };

  return { updatedOld, updatedNew };
}

export function isSuperseded(memory: BusinessMemoryRecord): boolean {
  return memory.memory_status === 'superseded' || !!memory.superseded_by;
}

export function isCurrent(memory: BusinessMemoryRecord): boolean {
  return (
    memory.memory_status === 'confirmed' &&
    !memory.superseded_by &&
    memory.current_relevance === 'current'
  );
}

export function getSupersessionChain(
  memory: BusinessMemoryRecord,
  allMemories: BusinessMemoryRecord[]
): BusinessMemoryRecord[] {
  const chain: BusinessMemoryRecord[] = [memory];
  let current = memory;

  // Walk forward (follow superseded_by)
  while (current.superseded_by) {
    const next = allMemories.find((m) => m.memory_id === current.superseded_by);
    if (!next || chain.find((m) => m.memory_id === next.memory_id)) break;
    chain.push(next);
    current = next;
  }

  // Walk backward (follow supersedes)
  current = memory;
  while (current.supersedes) {
    const prev = allMemories.find((m) => m.memory_id === current.supersedes);
    if (!prev || chain.find((m) => m.memory_id === prev.memory_id)) break;
    chain.unshift(prev);
    current = prev;
  }

  return chain;
}

export function shouldExpire(memory: BusinessMemoryRecord): boolean {
  if (memory.memory_status === 'superseded' || memory.memory_status === 'rejected') {
    return false; // already handled
  }

  if (memory.expiration_behavior === 'expire_when_superseded') {
    return false; // only expires when explicitly superseded
  }

  if (memory.expiration_behavior === 'expire_when_removed') {
    return false; // only expires when explicitly removed
  }

  if (memory.expiration_behavior === 'review_periodically' && memory.review_date) {
    const reviewDate = new Date(memory.review_date);
    const now = new Date();
    if (reviewDate < now) {
      return true; // review date has passed — mark for review
    }
  }

  return false;
}

export function markAsStale(memory: BusinessMemoryRecord): BusinessMemoryRecord {
  return {
    ...memory,
    current_relevance: 'stale',
  };
}