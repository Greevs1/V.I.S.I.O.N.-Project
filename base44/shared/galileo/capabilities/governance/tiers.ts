/**
 * Galileo Capability Governance — Membership Tiers
 * Phase 13.4B.1.5
 *
 * Six platform-wide tier definitions. Each tier defines:
 *   - Executive Sessions (monthly allocation)
 *   - Capabilities (allowed categories, blocked capabilities)
 *   - Automation (scheduled, proactive)
 *   - Exports (reports, deliverables, advanced reports)
 *   - Meeting preparation
 *   - Cross-domain reasoning
 *
 * No UI yet. Framework only.
 */
import type { CapabilityCategory, MembershipTier } from '../types.ts';
import type { TierDefinition } from './types.ts';

export const TIER_DEFINITIONS: TierDefinition[] = [
  {
    key: 'explorer',
    label: 'Explorer',
    description:
      "Discovery tier — experience Galileo's highest intelligence before upgrading.",
    executiveSessions: { monthly: 3, earned: true, rollover: false },
    capabilities: {
      allowedCategories: [
        'valuation',
        'business_intelligence',
        'analysis',
        'education',
        'navigation',
      ],
      blockedCapabilities: [],
    },
    automation: { scheduled: false, proactive: false },
    exports: { reports: false, deliverables: false, advancedReports: false },
    meetingPreparation: false,
    crossDomainReasoning: false,
    previewAccess: 'teaser',
  },
  {
    key: 'builder',
    label: 'Builder',
    description: 'Growth tier — strategic reasoning for building enterprise value.',
    executiveSessions: { monthly: 10, earned: true, rollover: true },
    capabilities: { allowedCategories: 'all', blockedCapabilities: [] },
    automation: { scheduled: false, proactive: false },
    exports: { reports: true, deliverables: false, advancedReports: false },
    meetingPreparation: false,
    crossDomainReasoning: false,
    previewAccess: 'full',
  },
  {
    key: 'operator',
    label: 'Operator',
    description: 'Operations tier — meeting preparation and growth planning.',
    executiveSessions: { monthly: 25, earned: true, rollover: true },
    capabilities: { allowedCategories: 'all', blockedCapabilities: [] },
    automation: { scheduled: true, proactive: false },
    exports: { reports: true, deliverables: true, advancedReports: false },
    meetingPreparation: true,
    crossDomainReasoning: false,
    previewAccess: 'full',
  },
  {
    key: 'exit_ready',
    label: 'Exit Ready',
    description:
      'Exit preparation tier — full strategic reasoning and deliverables.',
    executiveSessions: { monthly: 50, earned: true, rollover: true },
    capabilities: { allowedCategories: 'all', blockedCapabilities: [] },
    automation: { scheduled: true, proactive: true },
    exports: { reports: true, deliverables: true, advancedReports: true },
    meetingPreparation: true,
    crossDomainReasoning: false,
    previewAccess: 'full',
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    description:
      'Enterprise tier — unlimited strategic reasoning and cross-domain analysis.',
    executiveSessions: { monthly: -1, earned: true, rollover: false },
    capabilities: { allowedCategories: 'all', blockedCapabilities: [] },
    automation: { scheduled: true, proactive: true },
    exports: { reports: true, deliverables: true, advancedReports: true },
    meetingPreparation: true,
    crossDomainReasoning: true,
    previewAccess: 'full',
  },
  {
    key: 'advisor',
    label: 'Advisor',
    description:
      'Advisor tier — unlimited sessions while servicing assigned clients.',
    executiveSessions: { monthly: -1, earned: false, rollover: false },
    capabilities: { allowedCategories: 'all', blockedCapabilities: [] },
    automation: { scheduled: true, proactive: true },
    exports: { reports: true, deliverables: true, advancedReports: true },
    meetingPreparation: true,
    crossDomainReasoning: true,
    previewAccess: 'full',
  },
];

export function getTierDefinition(tier: MembershipTier): TierDefinition | undefined {
  return TIER_DEFINITIONS.find((t) => t.key === tier);
}

export function isUnlimitedTier(tier: MembershipTier): boolean {
  return tier === 'advisor' || tier === 'enterprise';
}

export function getTierMonthlySessions(tier: MembershipTier): number {
  const def = getTierDefinition(tier);
  return def?.executiveSessions.monthly ?? 0;
}

export function tierSupportsCategory(
  tier: MembershipTier,
  category: CapabilityCategory
): boolean {
  const def = getTierDefinition(tier);
  if (!def) return false;
  if (def.capabilities.allowedCategories === 'all') return true;
  return def.capabilities.allowedCategories.includes(category);
}

export function tierSupportsCapability(
  tier: MembershipTier,
  capabilityId: string,
  category: CapabilityCategory
): boolean {
  const def = getTierDefinition(tier);
  if (!def) return false;
  if (def.capabilities.blockedCapabilities.includes(capabilityId)) return false;
  return tierSupportsCategory(tier, category);
}

export function tierSupportsPreview(tier: MembershipTier): boolean {
  const def = getTierDefinition(tier);
  return def?.previewAccess !== 'none';
}

export function tierSupportsCrossDomain(tier: MembershipTier): boolean {
  const def = getTierDefinition(tier);
  return def?.crossDomainReasoning ?? false;
}

export function tierSupportsMeetingPrep(tier: MembershipTier): boolean {
  const def = getTierDefinition(tier);
  return def?.meetingPreparation ?? false;
}

/**
 * Resolve a membership tier from a user role.
 * Advisors assigned to businesses get the 'advisor' tier (unlimited sessions).
 */
export function resolveTierFromRole(
  role: string,
  isAssignedAdvisor: boolean = false
): MembershipTier {
  if (isAssignedAdvisor) return 'advisor';
  switch (role) {
    case 'super_admin':
    case 'admin':
      return 'enterprise';
    case 'advisor':
      return 'advisor';
    case 'team_member':
      return 'operator';
    case 'owner':
      return 'builder';
    case 'viewer':
      return 'explorer';
    default:
      return 'explorer';
  }
}