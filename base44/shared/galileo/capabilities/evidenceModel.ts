/**
 * Galileo Capability Framework — Evidence Model
 * Phase 13.4B.1
 *
 * Capabilities request evidence through the certified Galileo context
 * service — never raw database tables.
 *
 * Evidence always carries:
 *   - confidence (0-100)
 *   - verification status (verified | pending | conflicted | unverified)
 *   - client visibility (boolean)
 *   - source reference (document ID, assessment ID, etc.)
 *
 * The evidence model is a contract: the orchestration layer (future phase)
 * will populate evidence from the Galileo context service. For now, this
 * module defines the request/resolution contract and returns empty evidence
 * for placeholder capabilities.
 */
import type {
  CapabilityMetadata,
  CapabilityExecutionContext,
  EvidenceItem,
  EvidenceRequest,
  EvidenceType,
} from './types.ts';

/**
 * Build an evidence request from a capability's metadata and the
 * execution context. The orchestration layer uses this to fetch evidence
 * from the certified Galileo context service.
 */
export function buildEvidenceRequest(
  capability: CapabilityMetadata,
  input: CapabilityExecutionContext
): EvidenceRequest {
  const types: EvidenceType[] = [];

  // Derive evidence types from required context resources
  for (const req of capability.requiredContext) {
    switch (req.resource) {
      case 'documents':
        types.push('document');
        break;
      case 'financials':
        types.push('financial');
        break;
      case 'adjustments':
        types.push('adjustment');
        break;
      case 'assessments':
        types.push('assessment');
        break;
      case 'verification_queue':
        types.push('verification_item');
        break;
      case 'published_version':
        types.push('published_version');
        break;
      case 'growth_plan':
      case 'initiatives':
        types.push('growth_plan_item');
        break;
      case 'deliverables':
        types.push('deliverable');
        break;
      case 'advisor_conclusion':
        types.push('advisor_conclusion');
        break;
      case 'build_value':
        types.push('benchmark');
        break;
    }
  }

  const scope: EvidenceRequest['scope'] = input.valuationId
    ? 'valuation'
    : input.businessId
      ? 'business'
      : 'profile';

  return {
    types: [...new Set(types)],
    scope,
    filters: {
      businessId: input.businessId,
      valuationId: input.valuationId,
    },
  };
}

/**
 * Resolve evidence for a capability. For placeholder capabilities, this
 * returns an empty array — the orchestration layer (future phase) will
 * populate evidence from the certified Galileo context service.
 *
 * This function is the contract: when the orchestration layer is built,
 * it will call the Galileo context service with the evidence request
 * and return populated EvidenceItem[].
 */
export async function resolveEvidence(
  _capability: CapabilityMetadata,
  _input: CapabilityExecutionContext
): Promise<EvidenceItem[]> {
  // Placeholder: no evidence resolution yet.
  // The orchestration layer (future phase) will implement this
  // by calling the certified Galileo context service.
  return [];
}

/**
 * Filter evidence by client visibility. Client-safe capabilities
 * only receive evidence where clientVisible is true.
 */
export function filterClientSafeEvidence(
  evidence: EvidenceItem[]
): EvidenceItem[] {
  return evidence.filter((e) => e.clientVisible);
}

/**
 * Sort evidence by confidence (highest first).
 */
export function sortEvidenceByConfidence(
  evidence: EvidenceItem[]
): EvidenceItem[] {
  return [...evidence].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get evidence summary for analytics (metadata only, no content).
 */
export function getEvidenceSummary(
  evidence: EvidenceItem[]
): { count: number; verified: number; pending: number; conflicted: number } {
  return {
    count: evidence.length,
    verified: evidence.filter((e) => e.verificationStatus === 'verified').length,
    pending: evidence.filter((e) => e.verificationStatus === 'pending').length,
    conflicted: evidence.filter((e) => e.verificationStatus === 'conflicted').length,
  };
}