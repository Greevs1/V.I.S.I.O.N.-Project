/**
 * businessMemory/memoryBoundaries.ts — Phase 15.5
 *
 * Explicit boundaries: Memory vs Truth vs Timeline vs Audit vs Notes vs
 * Galileo Conversation Memory.
 *
 * Business Memory answers:
 *   "What has happened in this business that remains important to
 *    understanding it today?"
 *
 * It preserves durable executive context across time.
 * It does NOT duplicate any other system.
 */

import type { MemoryBoundaryDefinition } from './types.ts';

export const MEMORY_BOUNDARIES: MemoryBoundaryDefinition[] = [
  {
    system: 'Canonical Fact',
    question_it_answers: 'What is true now?',
    example: 'Revenue = $4.8M',
    relationship_to_memory: 'Memory references canonical facts but never duplicates fact values. When memory needs a fact, it reads from the Canonical Fact Resolver at access time.',
  },
  {
    system: 'Derived Fact',
    question_it_answers: 'What has a certified engine calculated?',
    example: 'Normalized EBITDA = $820k',
    relationship_to_memory: 'Memory may reference derived facts as evidence but never stores derived values.',
  },
  {
    system: 'Business Timeline',
    question_it_answers: 'What happened?',
    example: '2026 P&L uploaded on August 10.',
    relationship_to_memory: 'Memory references timeline events by ID. Timeline is the immutable record; memory is the synthesized meaning.',
  },
  {
    system: 'Audit Log',
    question_it_answers: 'Who changed what?',
    example: 'Advisor approved adjustment at 2:14 PM.',
    relationship_to_memory: 'Memory has its own audit trail for confirmation/rejection/supersession. It does not duplicate the system audit log.',
  },
  {
    system: 'ClientNote / Advisor Notes',
    question_it_answers: 'What is the detailed working record?',
    example: 'Call notes from Tuesday — client mentioned concern about inventory.',
    relationship_to_memory: 'Notes are working records. Memory is durable executive context. Not every note becomes memory — only what would reduce future decision quality if lost.',
  },
  {
    system: 'Galileo Conversation Memory',
    question_it_answers: 'What are we currently discussing?',
    example: 'The user is asking about tax strategies for 2026.',
    relationship_to_memory: 'Galileo conversation memory is session-scoped. It must NOT become Business Memory automatically. Galileo may READ confirmed Business Memory for context.',
  },
  {
    system: 'Business Memory',
    question_it_answers: 'What should remain meaningful later?',
    example: 'Owner and advisor intentionally accepted lower short-term margin to build recurring revenue before exit.',
    relationship_to_memory: 'Memory is the ONLY system that owns durable executive context. It references all other systems but duplicates none.',
  },
];

export function getBoundaryDefinition(system: string): MemoryBoundaryDefinition | undefined {
  return MEMORY_BOUNDARIES.find((b) => b.system === system);
}

export function isMemoryDistinctFrom(system: string): boolean {
  return system !== 'Business Memory';
}