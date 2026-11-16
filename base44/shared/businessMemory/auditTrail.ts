/**
 * businessMemory/auditTrail.ts — Phase 15.5
 *
 * Memory Audit Trail.
 *
 * Every confirmed memory should explain:
 *   - What is remembered?
 *   - Why?
 *   - Where did it come from?
 *   - Who confirmed it?
 *   - When?
 *   - Is it still current?
 *   - Has it been superseded?
 *
 * Reuses existing audit patterns. No second audit architecture.
 */

import type { MemoryAuditEntry, BusinessMemoryRecord, MemoryCandidate } from './types.ts';

export function createProposalAuditEntry(
  candidate: MemoryCandidate,
  actorSystem: string
): MemoryAuditEntry {
  return {
    audit_id: `audit-${candidate.candidate_id}-proposed-${Date.now()}`,
    memory_id: candidate.candidate_id,
    action: 'proposed',
    actor_profile_id: null,
    actor_system: actorSystem,
    timestamp: new Date().toISOString(),
    details: `Memory candidate proposed: ${candidate.title} (${candidate.category})`,
    source_evidence: candidate.source_evidence.map((e) => `${e.source_type}:${e.source_id}`),
  };
}

export function createConfirmationAuditEntry(
  memory: BusinessMemoryRecord,
  advisorProfileId: string
): MemoryAuditEntry {
  return {
    audit_id: `audit-${memory.memory_id}-confirmed-${Date.now()}`,
    memory_id: memory.memory_id,
    action: 'confirmed',
    actor_profile_id: advisorProfileId,
    actor_system: 'business_memory_service',
    timestamp: new Date().toISOString(),
    details: `Memory confirmed: ${memory.title} (importance: ${memory.importance}, client_visible: ${memory.client_visible})`,
    source_evidence: memory.source_evidence?.map((e) => `${e.source_type}:${e.source_id}`) || [],
  };
}

export function createRejectionAuditEntry(
  candidate: MemoryCandidate,
  advisorProfileId: string,
  reason: string
): MemoryAuditEntry {
  return {
    audit_id: `audit-${candidate.candidate_id}-rejected-${Date.now()}`,
    memory_id: candidate.candidate_id,
    action: 'rejected',
    actor_profile_id: advisorProfileId,
    actor_system: 'business_memory_service',
    timestamp: new Date().toISOString(),
    details: `Memory candidate rejected: ${candidate.title} — reason: ${reason}`,
    source_evidence: candidate.source_evidence.map((e) => `${e.source_type}:${e.source_id}`),
  };
}

export function createSupersessionAuditEntry(
  oldMemory: BusinessMemoryRecord,
  newMemory: BusinessMemoryRecord,
  advisorProfileId: string
): MemoryAuditEntry {
  return {
    audit_id: `audit-${oldMemory.memory_id}-superseded-${Date.now()}`,
    memory_id: oldMemory.memory_id,
    action: 'superseded',
    actor_profile_id: advisorProfileId,
    actor_system: 'business_memory_service',
    timestamp: new Date().toISOString(),
    details: `Memory superseded by ${newMemory.memory_id}: "${oldMemory.title}" → "${newMemory.title}"`,
    source_evidence: newMemory.source_evidence?.map((e) => `${e.source_type}:${e.source_id}`) || [],
  };
}

export function createRetrievalAuditEntry(
  memoryIds: string[],
  actorSystem: string,
  query: Record<string, any>
): MemoryAuditEntry {
  return {
    audit_id: `audit-retrieval-${Date.now()}`,
    memory_id: 'batch',
    action: 'retrieved',
    actor_profile_id: null,
    actor_system: actorSystem,
    timestamp: new Date().toISOString(),
    details: `Retrieved ${memoryIds.length} memories for ${actorSystem}`,
    source_evidence: memoryIds,
  };
}

export function createExpirationAuditEntry(
  memory: BusinessMemoryRecord
): MemoryAuditEntry {
  return {
    audit_id: `audit-${memory.memory_id}-expired-${Date.now()}`,
    memory_id: memory.memory_id,
    action: 'expired',
    actor_profile_id: null,
    actor_system: 'business_memory_service',
    timestamp: new Date().toISOString(),
    details: `Memory expired: ${memory.title} (expiration_behavior: ${memory.expiration_behavior})`,
    source_evidence: [],
  };
}