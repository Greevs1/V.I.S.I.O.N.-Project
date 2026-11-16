/**
 * businessMemory/conflictDetection.ts — Phase 15.5
 *
 * Memory Conflict Detection.
 *
 * If two memories conflict, we do NOT choose silently.
 *
 * Example:
 *   Owner says exit in 3 years.
 *   Advisor note says owner intends long-term hold.
 *
 * → Return: memory conflict, source references, dates, confidence,
 *   recommended review.
 *
 * Memory conflicts are contextual conflicts — they do NOT route through
 * Canonical Fact conflict logic unless they concern a factual business value.
 */

import type { BusinessMemoryRecord, MemoryConflictResult } from './types.ts';

export function detectConflicts(
  memories: BusinessMemoryRecord[]
): MemoryConflictResult[] {
  const conflicts: MemoryConflictResult[] = [];
  const confirmedMemories = memories.filter((m) => m.memory_status === 'confirmed' && !m.superseded_by);

  // Group by category — conflicts are most likely within the same category
  const byCategory = groupByCategory(confirmedMemories);

  for (const [category, categoryMemories] of Object.entries(byCategory)) {
    const categoryConflicts = findConflictsInCategory(categoryMemories);
    conflicts.push(...categoryConflicts);
  }

  // Also check cross-category conflicts for transaction_intent vs long_term_objective
  const transactionMemories = confirmedMemories.filter((m) => m.category === 'transaction_intent');
  const objectiveMemories = confirmedMemories.filter((m) => m.category === 'long_term_objective');
  const crossConflicts = findCrossCategoryConflicts(transactionMemories, objectiveMemories);
  conflicts.push(...crossConflicts);

  return conflicts;
}

function groupByCategory(memories: BusinessMemoryRecord[]): Record<string, BusinessMemoryRecord[]> {
  const groups: Record<string, BusinessMemoryRecord[]> = {};
  for (const m of memories) {
    if (!groups[m.category]) groups[m.category] = [];
    groups[m.category].push(m);
  }
  return groups;
}

function findConflictsInCategory(memories: BusinessMemoryRecord[]): MemoryConflictResult[] {
  const conflicts: MemoryConflictResult[] = [];

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const m1 = memories[i];
      const m2 = memories[j];
      if (isConflicting(m1, m2)) {
        conflicts.push({
          has_conflict: true,
          conflicting_memories: [m1, m2],
          conflict_description: `Two ${m1.category} memories conflict: "${m1.title}" vs "${m2.title}"`,
          recommended_review: 'Advisor review required — determine which memory reflects the current intent and supersede the other.',
        });
      }
    }
  }

  return conflicts;
}

function findCrossCategoryConflicts(
  transactionMemories: BusinessMemoryRecord[],
  objectiveMemories: BusinessMemoryRecord[]
): MemoryConflictResult[] {
  const conflicts: MemoryConflictResult[] = [];

  for (const t of transactionMemories) {
    for (const o of objectiveMemories) {
      // Check if a transaction intent conflicts with a long-term objective
      if (isTransactionObjectiveConflict(t, o)) {
        conflicts.push({
          has_conflict: true,
          conflicting_memories: [t, o],
          conflict_description: `Transaction intent "${t.title}" conflicts with long-term objective "${o.title}"`,
          recommended_review: 'Advisor review required — the stated transaction intent and long-term objective appear to be in different directions.',
        });
      }
    }
  }

  return conflicts;
}

function isConflicting(m1: BusinessMemoryRecord, m2: BusinessMemoryRecord): boolean {
  // Same category, different intent — check for opposing language
  const opposingPairs = [
    ['sell', 'retain'], ['exit', 'hold'], ['acquire', 'divest'],
    ['reduce', 'increase'], ['close', 'expand'], ['outsource', 'insource'],
    ['pause', 'resume'], ['cancel', 'proceed'], ['defer', 'accelerate'],
  ];

  const s1 = (m1.summary || '').toLowerCase();
  const s2 = (m2.summary || '').toLowerCase();

  for (const [word1, word2] of opposingPairs) {
    if ((s1.includes(word1) && s2.includes(word2)) || (s1.includes(word2) && s2.includes(word1))) {
      // Check if they're in the same category (not just same words)
      if (m1.category === m2.category) {
        return true;
      }
    }
  }

  return false;
}

function isTransactionObjectiveConflict(
  transaction: BusinessMemoryRecord,
  objective: BusinessMemoryRecord
): boolean {
  const tSummary = (transaction.summary || '').toLowerCase();
  const oSummary = (objective.summary || '').toLowerCase();

  // Transaction intent to sell conflicts with objective to build long-term
  if (tSummary.includes('sell') && oSummary.includes('long-term') && oSummary.includes('hold')) {
    return true;
  }
  // Transaction intent to retain conflicts with objective to prepare for exit
  if (tSummary.includes('retain') && oSummary.includes('exit')) {
    return true;
  }

  return false;
}

export function hasConflicts(memories: BusinessMemoryRecord[]): boolean {
  return detectConflicts(memories).some((c) => c.has_conflict);
}