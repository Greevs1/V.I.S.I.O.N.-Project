/**
 * Galileo Capability Framework — Public API
 * Phase 13.4B.1
 *
 * Single entry point for the Galileo Capability Framework.
 *
 * Usage:
 *   import { initializeFramework, executeCapability, capabilityRegistry } from
 *     '@/shared/galileo/capabilities';
 *
 * The framework is platform-agnostic. No valuation-specific or
 * domain-specific assumptions. Every future V.I.S.I.O.N. domain plugs
 * into this framework by registering capabilities.
 *
 * Galileo remains the ONE intelligence layer. Capabilities are structured
 * workflows that operate through Galileo's orchestration.
 */

// ── Types (re-export only, no local usage) ──────────────────────────
export type {
  CapabilityCategory,
  CapabilityStatus,
  ExecutionMode,
  PermissionLevel,
  OutputType,
  NavigationTarget,
  NavigationAction,
  ContextResource,
  ContextRequirement,
  ContextValidationResult,
  EvidenceType,
  EvidenceItem,
  EvidenceRequest,
  CapabilityMetadata,
  PipelineStageId,
  PipelineStage,
  CapabilityExecutionContext,
  CapabilityExecutionResult,
  CapabilityInstruction,
  CapabilityRecommendation,
  CapabilityDraft,
  ConfirmationAction,
  CompletionMetadata,
  CapabilityAnalyticsEvent,
} from './types.ts';

// ── Registry ────────────────────────────────────────────────────────
import { capabilityRegistry, CAPABILITY_CATEGORIES } from './registry.ts';
export { capabilityRegistry, CAPABILITY_CATEGORIES };
export type { CapabilityCategoryDefinition } from './registry.ts';

// ── Pipeline ─────────────────────────────────────────────────────────
import { executeCapability, validateCapability, PIPELINE_STAGES, PIPELINE_STAGE_IDS } from './pipeline.ts';
export { executeCapability, validateCapability, PIPELINE_STAGES, PIPELINE_STAGE_IDS };

// ── Permissions ──────────────────────────────────────────────────────
import { validatePermissions, canExecute, getUserPermissionLevels } from './permissions.ts';
export { validatePermissions, canExecute, getUserPermissionLevels };
export type { PermissionValidationResult } from './permissions.ts';

// ── Context Model ────────────────────────────────────────────────────
import { validateContext, getContextGaps, describeMissingContext } from './contextModel.ts';
export { validateContext, getContextGaps, describeMissingContext };

// ── Evidence Model ───────────────────────────────────────────────────
import { buildEvidenceRequest, resolveEvidence, filterClientSafeEvidence, sortEvidenceByConfidence, getEvidenceSummary } from './evidenceModel.ts';
export { buildEvidenceRequest, resolveEvidence, filterClientSafeEvidence, sortEvidenceByConfidence, getEvidenceSummary };

// ── Follow-up Graph ──────────────────────────────────────────────────
import { followUpGraph, initializeFollowUpGraph, getFollowUps } from './followUpGraph.ts';
export { followUpGraph, initializeFollowUpGraph, getFollowUps };

// ── Analytics ────────────────────────────────────────────────────────
import { capabilityAnalytics, trackExecution, trackCompletion } from './analytics.ts';
export { capabilityAnalytics, trackExecution, trackCompletion };

// ── Placeholders ─────────────────────────────────────────────────────
import { registerPlaceholderCapabilities, validatePlaceholderRegistration, PLACEHOLDER_CAPABILITIES } from './placeholders.ts';
export { registerPlaceholderCapabilities, validatePlaceholderRegistration, PLACEHOLDER_CAPABILITIES };

// ── Initialization ───────────────────────────────────────────────────

let initialized = false;

/**
 * Initialize the Galileo Capability Framework.
 * Registers all placeholder capabilities and builds the follow-up graph.
 * Safe to call multiple times — only initializes once.
 */
export function initializeFramework(): void {
  if (initialized) return;
  registerPlaceholderCapabilities();
  initialized = true;
}

/**
 * Check if the framework has been initialized.
 */
export function isFrameworkInitialized(): boolean {
  return initialized;
}

/**
 * Reset the framework (for testing only).
 */
export function resetFramework(): void {
  capabilityRegistry.clear();
  followUpGraph.clear();
  capabilityAnalytics.clear();
  initialized = false;
}

// ── Governance Types (Phase 13.4B.1.5) ───────────────────────────────
export type { MembershipTier, ExecutionLevel, CapabilityGovernance } from './types.ts';

// ── Governance API (Phase 13.4B.1.5) ────────────────────────────────
export * from './governance/index.ts';