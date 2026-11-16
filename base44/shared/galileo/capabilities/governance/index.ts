/**
 * Galileo Capability Governance — Public API
 * Phase 13.4B.1.5 — Executive Sessions
 *
 * Single entry point for the Galileo Capability Governance module.
 *
 * Usage:
 *   import {
 *     sessionEngine,
 *     earnedSessionEngine,
 *     orchestratorInterface,
 *     TIER_DEFINITIONS,
 *   } from '@/shared/galileo/capabilities/governance';
 *
 * No payment integration. No billing. No Stripe. Framework only.
 */

// ── Types ───────────────────────────────────────────────────────────
export type {
  TierDefinition,
  TierExecutiveSessions,
  TierCapabilities,
  TierAutomation,
  TierExports,
  SessionTransactionType,
  SessionTransaction,
  SessionAccount,
  CapabilityPreview,
  EarnedSessionCategory,
  EarnedSessionAction,
  EarnedSessionRecord,
  SoftLimitOptionKey,
  SoftLimitOption,
  SoftLimitResponse,
  OrchestratorContext,
  OrchestratorDecision,
  UsageOutcome,
  CapabilityUsageRecord,
  GovernanceAnalytics,
} from './types.ts';

// ── Tiers ────────────────────────────────────────────────────────────
export {
  TIER_DEFINITIONS,
  getTierDefinition,
  isUnlimitedTier,
  getTierMonthlySessions,
  tierSupportsCategory,
  tierSupportsCapability,
  tierSupportsPreview,
  tierSupportsCrossDomain,
  tierSupportsMeetingPrep,
  resolveTierFromRole,
} from './tiers.ts';

// ── Accounting ─────────────────────────────────────────────────────
export { sessionAccounting, generateTxnId } from './accounting.ts';

// ── Earned Sessions ──────────────────────────────────────────────────
export {
  EARNED_SESSION_ACTIONS,
  earnedSessionEngine,
} from './earnedSessions.ts';

// ── Preview ─────────────────────────────────────────────────────────
export {
  buildPreview,
  isPreviewAvailable,
  supportsTeaser,
} from './preview.ts';

// ── Session Engine ───────────────────────────────────────────────────
export {
  sessionEngine,
  type SessionExecutionContext,
  type ConsumeResult,
} from './sessionEngine.ts';

// ── Orchestrator ────────────────────────────────────────────────────
export { orchestratorInterface } from './orchestrator.ts';

// ── Analytics ───────────────────────────────────────────────────────
export { governanceAnalytics } from './analytics.ts';