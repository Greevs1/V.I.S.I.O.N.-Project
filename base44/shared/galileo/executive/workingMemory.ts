/**
 * Executive Memory — Phase 13.4C.1
 *
 * Engagement-scoped working memory. NOT user memory.
 * Expires with workflow. Never replaces platform memory.
 *
 * In-memory only. No persistence.
 */
import type { ExecutiveMemory, MemoryFact } from './types.ts';

const memories: Map<string, ExecutiveMemory> = new Map();

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createMemory(scope: string, ttlMs: number = 3600000): ExecutiveMemory {
  const id = generateId();
  const now = new Date();
  const memory: ExecutiveMemory = {
    id,
    scope,
    facts: [],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  memories.set(id, memory);
  return memory;
}

export function getMemory(id: string): ExecutiveMemory | null {
  const memory = memories.get(id);
  if (!memory) return null;
  if (new Date(memory.expiresAt) < new Date()) {
    memories.delete(id);
    return null;
  }
  return memory;
}

export function recordFact(
  memoryId: string,
  key: string,
  value: string,
  category: string
): MemoryFact | null {
  const memory = getMemory(memoryId);
  if (!memory) return null;
  const fact: MemoryFact = {
    key,
    value,
    category,
    recordedAt: new Date().toISOString(),
  };
  // Replace existing fact with same key
  memory.facts = memory.facts.filter((f) => f.key !== key);
  memory.facts.push(fact);
  return fact;
}

export function getFact(memoryId: string, key: string): string | null {
  const memory = getMemory(memoryId);
  if (!memory) return null;
  const fact = memory.facts.find((f) => f.key === key);
  return fact ? fact.value : null;
}

export function getFactsByCategory(memoryId: string, category: string): MemoryFact[] {
  const memory = getMemory(memoryId);
  if (!memory) return [];
  return memory.facts.filter((f) => f.category === category);
}

export function clearMemory(id: string): void {
  memories.delete(id);
}

export function clearExpiredMemories(): number {
  const now = new Date();
  let cleared = 0;
  for (const [id, memory] of memories.entries()) {
    if (new Date(memory.expiresAt) < now) {
      memories.delete(id);
      cleared++;
    }
  }
  return cleared;
}

export function getAllMemoryIds(): string[] {
  return Array.from(memories.keys());
}

export function getMemorySummary(memoryId: string): string {
  const memory = getMemory(memoryId);
  if (!memory) return 'No active memory';
  return `${memory.facts.length} fact(s) in scope: ${memory.scope}`;
}