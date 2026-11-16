/**
 * Galileo Capability Governance — Preview Model
 * Phase 13.4B.1.5
 *
 * Every advanced capability supports Preview Mode.
 *
 * Preview returns:
 *   - High-level finding
 *   - Estimated impact
 *   - Why it matters
 *   - What Galileo could analyze
 *
 * No strategic reasoning. No hidden calculations. No premium leakage.
 *
 * Example: "I've identified three opportunities that may increase Enterprise Value.
 *           A full Executive Session will quantify them."
 */
import type { CapabilityMetadata } from '../types.ts';
import type { CapabilityPreview } from './types.ts';
import { capabilityRegistry } from '../registry.ts';

function buildHighLevelFinding(capability: CapabilityMetadata): string {
  const title = capability.title.toLowerCase();
  const category = capability.category;

  switch (category) {
    case 'valuation':
      return `I've identified opportunities related to ${title} that may impact your enterprise value.`;
    case 'growth':
      return `I've identified initiatives related to ${title} that may increase your enterprise value.`;
    case 'meetings':
      return `I can prepare a ${title.replace('prepare ', '').toLowerCase()} with strategic insights from your data.`;
    case 'analysis':
      return `I've identified patterns in your data relevant to ${title}.`;
    case 'reports':
      return `I can draft a ${title.replace('draft ', '').toLowerCase()} from your valuation data.`;
    case 'business_intelligence':
      return `I've identified opportunities related to ${title}.`;
    default:
      return `I can help with ${title}.`;
  }
}

function buildWhatGalileoCouldAnalyze(capability: CapabilityMetadata): string {
  const resources = capability.requiredContext
    .filter((c) => c.required)
    .map((c) => c.description);
  if (resources.length === 0) {
    return 'Galileo can analyze your current business context and valuation data.';
  }
  return `Galileo can analyze: ${resources.join('; ')}.`;
}

export function buildPreview(capabilityId: string): CapabilityPreview {
  const capability = capabilityRegistry.get(capabilityId);
  if (!capability) {
    return {
      capabilityId,
      previewAvailable: false,
      requiresExecutiveSession: false,
      highLevelFinding: 'Capability not found.',
      estimatedImpact: '',
      whyItMatters: '',
      whatGalileoCouldAnalyze: '',
    };
  }

  const governance = capability.governance;
  if (!governance?.supportsPreview) {
    return {
      capabilityId,
      previewAvailable: false,
      requiresExecutiveSession: governance?.requiresExecutiveSession ?? false,
      highLevelFinding: 'Preview not available for this capability.',
      estimatedImpact: '',
      whyItMatters: '',
      whatGalileoCouldAnalyze: '',
    };
  }

  return {
    capabilityId,
    previewAvailable: true,
    requiresExecutiveSession: governance.requiresExecutiveSession,
    highLevelFinding: buildHighLevelFinding(capability),
    estimatedImpact: governance.requiresExecutiveSession
      ? 'A full Executive Session will quantify the potential impact.'
      : 'This capability is available without an Executive Session.',
    whyItMatters: capability.description,
    whatGalileoCouldAnalyze: buildWhatGalileoCouldAnalyze(capability),
  };
}

export function isPreviewAvailable(capabilityId: string): boolean {
  const capability = capabilityRegistry.get(capabilityId);
  return capability?.governance?.supportsPreview ?? false;
}

export function supportsTeaser(capabilityId: string): boolean {
  const capability = capabilityRegistry.get(capabilityId);
  return capability?.governance?.supportsTeaser ?? false;
}