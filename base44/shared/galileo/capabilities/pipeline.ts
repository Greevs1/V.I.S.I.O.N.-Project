/**
 * Galileo Capability Framework — Execution Pipeline
 * Phase 13.4B.1
 *
 * The single execution contract for all Galileo capabilities.
 * Every capability passes through the same 11-stage pipeline.
 *
 * Capabilities NEVER call the LLM directly. They return structured
 * instructions. The Galileo orchestration layer (future phase) interprets
 * these instructions and invokes the LLM.
 *
 * Placeholder capabilities return NOT_IMPLEMENTED at the reasoning stage
 * but still validate through intent, context, and permission stages.
 */
import type {
  CapabilityExecutionContext,
  CapabilityExecutionResult,
  CapabilityInstruction,
  PipelineStage,
  PipelineStageId,
  EvidenceItem,
  ContextRequirement,
  NavigationAction,
  CompletionMetadata,
} from './types.ts';
import { capabilityRegistry } from './registry.ts';
import { validatePermissions } from './permissions.ts';
import { validateContext, describeMissingContext } from './contextModel.ts';
import { resolveEvidence, buildEvidenceRequest } from './evidenceModel.ts';
import { getFollowUps } from './followUpGraph.ts';
import { trackExecution, trackCompletion } from './analytics.ts';

/**
 * The 11 standard pipeline stages. No capability may bypass this pipeline.
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'intent_resolution', name: 'Intent Resolution', description: 'Resolve what the user is asking for and match to a capability.' },
  { id: 'context_validation', name: 'Context Validation', description: 'Validate that required context resources exist.' },
  { id: 'permission_validation', name: 'Permission Validation', description: 'Validate user role and permission level.' },
  { id: 'evidence_retrieval', name: 'Evidence Retrieval', description: 'Gather evidence from the certified Galileo context service.' },
  { id: 'reasoning_preparation', name: 'Reasoning Preparation', description: 'Prepare structured data for the LLM orchestration layer.' },
  { id: 'reasoning', name: 'Reasoning', description: 'LLM processes reasoning instructions (orchestration layer, not capability).' },
  { id: 'recommendation_building', name: 'Recommendation Building', description: 'Build structured recommendations from reasoning output.' },
  { id: 'navigation_targets', name: 'Navigation Targets', description: 'Emit structured navigation actions for the UI to route.' },
  { id: 'draft_outputs', name: 'Draft Outputs', description: 'Generate draft outputs for user review.' },
  { id: 'confirmation_actions', name: 'Confirmation Actions', description: 'Emit confirmation actions for any write operations.' },
  { id: 'completion_metadata', name: 'Completion Metadata', description: 'Return completion status and analytics metadata.' },
];

export const PIPELINE_STAGE_IDS: PipelineStageId[] = PIPELINE_STAGES.map((s) => s.id);

/**
 * executeCapability — the single entry point for capability execution.
 *
 * This is the ONE execution contract. All capabilities pass through here.
 * Capabilities never call the LLM. They return structured instructions.
 *
 * For placeholder capabilities, stages 6-10 return NOT_IMPLEMENTED.
 * Stages 1-5 still validate (intent, context, permissions, evidence).
 */
export async function executeCapability(
  capabilityId: string,
  input: CapabilityExecutionContext
): Promise<CapabilityExecutionResult> {
  const startTime = Date.now();

  // ── Stage 1: Intent Resolution ──────────────────────────────────
  const capability = capabilityRegistry.get(capabilityId);
  if (!capability) {
    return notFoundResult(capabilityId, input.userIntent);
  }

  trackExecution(capabilityId, input.executionMode);

  // ── Stage 2: Context Validation ─────────────────────────────────
  const contextResult = validateContext(capability, input);
  if (!contextResult.valid && contextResult.shouldBlock) {
    return blockedResult(
      capabilityId,
      input.userIntent,
      'missing_context',
      contextResult.missing,
      describeMissingContext(contextResult.missing)
    );
  }

  // ── Stage 3: Permission Validation ──────────────────────────────
  const permissionResult = validatePermissions(capability, input);
  if (!permissionResult.valid) {
    return blockedResult(
      capabilityId,
      input.userIntent,
      'missing_permissions',
      undefined,
      permissionResult.reason
    );
  }

  // ── Stage 4: Evidence Retrieval ─────────────────────────────────
  const evidence: EvidenceItem[] = capability.supportsEvidence
    ? await resolveEvidence(capability, input)
    : [];

  // ── Stage 5: Reasoning Preparation ──────────────────────────────
  const evidenceRequest = buildEvidenceRequest(capability, input);
  const reasoningContext = {
    capabilityId,
    capabilityTitle: capability.title,
    userIntent: input.userIntent,
    requestedOutput: input.requestedOutput,
    executionMode: input.executionMode,
    currentPage: input.currentPage,
    evidenceRequest,
    evidenceSummary: evidence.length,
    contextGaps: contextResult.missing.map((m) => m.resource),
    contextWarnings: contextResult.warnings.map((w) => w.resource),
  };

  // ── Stage 6: Reasoning ──────────────────────────────────────────
  // NOT IMPLEMENTED — the orchestration layer (future phase) will
  // process reasoningContext and return LLM output.
  // For now, all capabilities return NOT_IMPLEMENTED.

  // ── Stage 7: Recommendation Building ────────────────────────────
  // NOT IMPLEMENTED — will build recommendations from reasoning output.

  // ── Stage 8: Navigation Targets ─────────────────────────────────
  const navigationActions: NavigationAction[] = [];
  // Navigation targets are emitted by the capability implementation
  // (future phase). Placeholder capabilities emit no navigation.

  // ── Stage 9: Draft Outputs ──────────────────────────────────────
  // NOT IMPLEMENTED — will generate draft outputs.

  // ── Stage 10: Confirmation Actions ──────────────────────────────
  // NOT IMPLEMENTED — will emit confirmation actions for writes.

  // ── Stage 11: Completion Metadata ───────────────────────────────
  const duration = Date.now() - startTime;
  const completionMetadata: CompletionMetadata = {
    capabilityId,
    executionMode: input.executionMode,
    duration,
    evidenceCount: evidence.length,
    recommendationCount: 0,
    navigationCount: navigationActions.length,
    draftCount: 0,
    confirmationCount: 0,
  };

  trackCompletion(capabilityId, 'not_implemented', duration);

  const instruction: CapabilityInstruction = {
    intent: input.userIntent,
    contextValid: contextResult.valid,
    permissionsValid: permissionResult.valid,
    missingContext: contextResult.missing,
    evidence,
    reasoningContext,
    recommendations: [],
    navigationActions,
    drafts: [],
    confirmations: [],
    status: 'not_implemented',
    completionMetadata,
    recommendedFollowUps: getFollowUps(capabilityId),
  };

  return instruction;
}

// ── Helper: not found result ─────────────────────────────────────────
function notFoundResult(capabilityId: string, intent: string): CapabilityExecutionResult {
  return {
    intent,
    contextValid: false,
    permissionsValid: false,
    missingContext: [],
    evidence: [],
    recommendations: [],
    navigationActions: [],
    drafts: [],
    confirmations: [],
    status: 'error',
    errorMessage: `Capability not found: ${capabilityId}`,
    recommendedFollowUps: [],
  };
}

// ── Helper: blocked result ──────────────────────────────────────────
function blockedResult(
  capabilityId: string,
  intent: string,
  blockReason: 'missing_context' | 'missing_permissions',
  missing: ContextRequirement[] = [],
  errorMessage?: string
): CapabilityExecutionResult {
  return {
    intent,
    contextValid: blockReason !== 'missing_context',
    permissionsValid: blockReason !== 'missing_permissions',
    missingContext: missing,
    evidence: [],
    recommendations: [],
    navigationActions: [],
    drafts: [],
    confirmations: [],
    status: 'blocked',
    errorMessage: errorMessage || `Capability blocked: ${blockReason}`,
    recommendedFollowUps: getFollowUps(capabilityId),
  };
}

/**
 * Validate a capability without executing it. Runs stages 1-3 only.
 * Useful for the UI to determine which capabilities are available.
 */
export function validateCapability(
  capabilityId: string,
  input: Pick<CapabilityExecutionContext, 'userRole' | 'executionMode' | 'context'>
): { valid: boolean; reason?: string } {
  const capability = capabilityRegistry.get(capabilityId);
  if (!capability) {
    return { valid: false, reason: 'Capability not found' };
  }

  const contextResult = validateContext(capability, input as CapabilityExecutionContext);
  if (!contextResult.valid) {
    return { valid: false, reason: describeMissingContext(contextResult.missing) };
  }

  const permissionResult = validatePermissions(capability, input as CapabilityExecutionContext);
  if (!permissionResult.valid) {
    return { valid: false, reason: permissionResult.reason };
  }

  return { valid: true };
}