/**
 * Galileo Capability Governance — Type Definitions
 * Phase 13.4B.1.5 — Executive Sessions
 *
 * Type system for Progressive Intelligence governance.
 * No payment integration. No billing. No Stripe. Framework only.
 *
 * V.I.S.I.O.N. does NOT sell AI.
 * V.I.S.I.O.N. sells better business decisions.
 */
import type {
  CapabilityCategory,
  ExecutionLevel,
  MembershipTier,
} from '../types.ts';

// ============================================================================
// TIER DEFINITIONS (6)
// ============================================================================

export interface TierExecutiveSessions {
  monthly: number; // -1 = unlimited
  earned: boolean;
  rollover: boolean;
}

export interface TierCapabilities {
  allowedCategories: CapabilityCategory[] | 'all';
  blockedCapabilities: string[];
}

export interface TierAutomation {
  scheduled: boolean;
  proactive: boolean;
}

export interface TierExports {
  reports: boolean;
  deliverables: boolean;
  advancedReports: boolean;
}

export interface TierDefinition {
  key: MembershipTier;
  label: string;
  description: string;
  executiveSessions: TierExecutiveSessions;
  capabilities: TierCapabilities;
  automation: TierAutomation;
  exports: TierExports;
  meetingPreparation: boolean;
  crossDomainReasoning: boolean;
  previewAccess: 'none' | 'teaser' | 'full';
}

// ============================================================================
// SESSION ACCOUNTING
// ============================================================================

export type SessionTransactionType =
  | 'earned'
  | 'consumed'
  | 'refunded'
  | 'granted'
  | 'expired'
  | 'adjusted';

export interface SessionTransaction {
  id: string;
  profileId: string;
  type: SessionTransactionType;
  amount: number;
  capabilityId?: string;
  executionLevel?: ExecutionLevel;
  reason: string;
  timestamp: string;
}

export interface SessionAccount {
  profileId: string;
  tier: MembershipTier;
  earned: number;
  used: number;
  remaining: number; // -1 = unlimited
  expired: number;
  granted: number;
  refunded: number;
  manualAdjustments: number;
  lastResetDate: string;
  expiresAt?: string;
}

// ============================================================================
// PREVIEW MODEL
// ============================================================================

export interface CapabilityPreview {
  capabilityId: string;
  previewAvailable: boolean;
  requiresExecutiveSession: boolean;
  highLevelFinding: string;
  estimatedImpact: string;
  whyItMatters: string;
  whatGalileoCouldAnalyze: string;
}

// ============================================================================
// EARNED SESSIONS
// ============================================================================

export type EarnedSessionCategory =
  | 'assessment'
  | 'document'
  | 'verification'
  | 'growth'
  | 'team'
  | 'referral';

export interface EarnedSessionAction {
  key: string;
  label: string;
  description: string;
  sessionsAwarded: number;
  category: EarnedSessionCategory;
  repeatable: boolean;
  maxPerMonth?: number;
}

export interface EarnedSessionRecord {
  id: string;
  profileId: string;
  actionKey: string;
  sessionsAwarded: number;
  timestamp: string;
}

// ============================================================================
// SOFT LIMIT EXPERIENCE
// ============================================================================

export type SoftLimitOptionKey =
  | 'save_for_later'
  | 'upgrade'
  | 'notify_advisor'
  | 'continue_quick';

export interface SoftLimitOption {
  key: SoftLimitOptionKey;
  label: string;
  description: string;
}

export interface SoftLimitResponse {
  capabilityId: string;
  executionLevel: ExecutionLevel;
  message: string;
  finding: string;
  options: SoftLimitOption[];
}

// ============================================================================
// ORCHESTRATOR INTERFACE
// ============================================================================

export interface OrchestratorContext {
  profileId: string;
  capabilityId: string;
  executionLevel: ExecutionLevel;
  userRole: string;
  tier: MembershipTier;
  isAssignedAdvisor: boolean;
  businessId?: string;
  valuationId?: string;
}

export interface OrchestratorDecision {
  canExecute: boolean;
  shouldPreview: boolean;
  shouldQuick: boolean;
  shouldAdvisor: boolean;
  shouldExecutive: boolean;
  suggestedAlternative?: string;
  reason: string;
  softLimit?: SoftLimitResponse;
}

// ============================================================================
// GOVERNANCE ANALYTICS
// ============================================================================

export type UsageOutcome =
  | 'completed'
  | 'dismissed'
  | 'accepted'
  | 'error'
  | 'not_implemented'
  | 'previewed'
  | 'upgraded'
  | 'saved_for_later';

export interface CapabilityUsageRecord {
  capabilityId: string;
  executionLevel: ExecutionLevel;
  outcome: UsageOutcome;
  duration: number;
  timestamp: string;
}

export interface GovernanceAnalytics {
  profileId: string;
  totalRequests: number;
  previewConversions: number;
  exhaustionConversions: number;
  sessionsEarned: number;
  sessionsConsumed: number;
  capabilityRequests: Record<string, number>;
  usageRecords: CapabilityUsageRecord[];
  mostValuableCapability?: string;
  averageReasoningDuration: number;
}