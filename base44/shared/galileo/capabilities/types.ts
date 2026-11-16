/**
 * Galileo Capability Framework — Type Definitions
 * Phase 13.4B.1
 *
 * Foundation type system for the Galileo Capability Framework.
 * Platform-agnostic: no valuation-specific or domain-specific assumptions.
 *
 * Galileo remains the ONE intelligence layer. Capabilities are structured
 * workflows that operate through Galileo's orchestration — they never call
 * the LLM directly and never navigate directly.
 */

// ============================================================================
// CATEGORIES (15)
// ============================================================================

export type CapabilityCategory =
  | 'valuation'
  | 'business_intelligence'
  | 'growth'
  | 'meetings'
  | 'reports'
  | 'operations'
  | 'tax'
  | 'cash_flow'
  | 'wealth'
  | 'protection'
  | 'owner_experience'
  | 'administration'
  | 'education'
  | 'navigation'
  | 'analysis';

// ============================================================================
// STATUS
// ============================================================================

export type CapabilityStatus = 'active' | 'deprecated' | 'experimental';

// ============================================================================
// EXECUTION MODES (6)
// ============================================================================

export type ExecutionMode =
  | 'read'
  | 'draft'
  | 'review'
  | 'recommend'
  | 'confirm'
  | 'execute';

// ============================================================================
// PERMISSION LEVELS (4)
// ============================================================================

export type PermissionLevel =
  | 'read'
  | 'draft'
  | 'confirmed_write'
  | 'prohibited';

// ============================================================================
// EXECUTION LEVELS (3) — Phase 13.4B.1.5
// ============================================================================

/**
 * Every capability supports three execution levels:
 *
 * Quick     — Unlimited. No session consumed. Educational explanations.
 * Advisor   — Consumes Executive Session. Standard strategic reasoning.
 * Executive — Unlimited for paid tiers. Cross-domain reasoning.
 */
export type ExecutionLevel = 'quick' | 'advisor' | 'executive';

// ============================================================================
// MEMBERSHIP TIERS (6) — Phase 13.4B.1.5
// ============================================================================

/**
 * Platform-wide membership tiers. Each tier defines:
 *   - Executive Sessions (monthly allocation)
 *   - Capabilities (allowed categories)
 *   - Automation (scheduled, proactive)
 *   - Exports (reports, deliverables, advanced reports)
 *   - Meeting preparation
 *   - Cross-domain reasoning
 */
export type MembershipTier =
  | 'explorer'
  | 'builder'
  | 'operator'
  | 'exit_ready'
  | 'enterprise'
  | 'advisor';

// ============================================================================
// CAPABILITY GOVERNANCE — Phase 13.4B.1.5
// ============================================================================

/**
 * Governance metadata for every capability.
 *
 * Capabilities declare their own governance — nothing is hardcoded.
 * The framework enforces governance; the LLM never does.
 */
export interface CapabilityGovernance {
  /** Minimum tier required to execute this capability */
  minimumTier: MembershipTier;
  /** Whether this capability consumes an Executive Session */
  requiresExecutiveSession: boolean;
  /** Session cost (0 = free, 1 = standard, 2 = complex) */
  estimatedSessionCost: number;
  /** Whether a preview is available without consuming a session */
  previewAvailable: boolean;
  /** Whether this capability supports preview mode */
  supportsPreview: boolean;
  /** Whether this capability supports teaser content */
  supportsTeaser: boolean;
  /** Whether sessions can be earned to unlock this capability */
  supportsEarnedAccess: boolean;
  /** Whether unlimited access is available for paid tiers */
  supportsUnlimitedAccess: boolean;
  /** Execution levels supported by this capability */
  executionLevels: ExecutionLevel[];
  /** Default execution level when none is specified */
  defaultExecutionLevel: ExecutionLevel;
}

// ============================================================================
// OUTPUT TYPES (13)
// ============================================================================

export type OutputType =
  | 'conversation'
  | 'checklist'
  | 'investigation'
  | 'recommendation'
  | 'comparison'
  | 'summary'
  | 'meeting_agenda'
  | 'client_letter'
  | 'advisor_memo'
  | 'report'
  | 'timeline'
  | 'action_plan'
  | 'navigation';

// ============================================================================
// NAVIGATION CONTRACT
// ============================================================================

export type NavigationTarget =
  | 'open_verification_item'
  | 'open_document'
  | 'open_adjustment'
  | 'open_build_value'
  | 'open_deliverable'
  | 'open_version'
  | 'open_initiative'
  | 'open_evidence'
  | 'open_assessment'
  | 'open_valuation'
  | 'open_growth_plan'
  | 'open_financial';

export interface NavigationAction {
  target: NavigationTarget;
  entityId?: string;
  label: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// CONTEXT MODEL
// ============================================================================

export type ContextResource =
  | 'approved_valuation'
  | 'draft_valuation'
  | 'confidence'
  | 'advisor_conclusion'
  | 'reconciliation'
  | 'build_value'
  | 'roadmap'
  | 'initiatives'
  | 'documents'
  | 'financials'
  | 'adjustments'
  | 'verification_queue'
  | 'published_version'
  | 'growth_plan'
  | 'deliverables'
  | 'assessments'
  | 'business_profile'
  | 'expert_profiles'
  | 'sprint'
  | 'readiness';

export interface ContextRequirement {
  resource: ContextResource;
  required: boolean;
  description: string;
  fallback: 'block' | 'warn' | 'proceed_with_gap';
}

export interface ContextValidationResult {
  valid: boolean;
  shouldBlock: boolean;
  missing: ContextRequirement[];
  warnings: ContextRequirement[];
}

// ============================================================================
// EVIDENCE MODEL
// ============================================================================

export type EvidenceType =
  | 'document'
  | 'extracted_field'
  | 'assessment'
  | 'financial'
  | 'adjustment'
  | 'verification_item'
  | 'published_version'
  | 'growth_plan_item'
  | 'deliverable'
  | 'advisor_conclusion'
  | 'benchmark';

export interface EvidenceItem {
  type: EvidenceType;
  reference: string;
  label: string;
  confidence: number;
  verificationStatus: 'verified' | 'pending' | 'conflicted' | 'unverified';
  clientVisible: boolean;
  sourceReference?: string;
}

export interface EvidenceRequest {
  types: EvidenceType[];
  scope: 'business' | 'valuation' | 'profile';
  filters?: Record<string, unknown>;
}

// ============================================================================
// CAPABILITY METADATA
// ============================================================================

export interface CapabilityMetadata {
  id: string;
  title: string;
  category: CapabilityCategory;
  description: string;
  icon: string;
  version: string;
  status: CapabilityStatus;
  requiredContext: ContextRequirement[];
  requiredPermissions: PermissionLevel[];
  visibility: 'internal' | 'client_safe' | 'both';
  supportedRoles: string[];
  supportedOutputs: OutputType[];
  allowedActions: string[];
  recommendedFollowUps: string[];
  estimatedDuration: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  supportsStreaming: boolean;
  supportsEvidence: boolean;
  supportsNavigation: boolean;
  supportsDrafts: boolean;
  supportsConfirmations: boolean;
  supportsClientSafe: boolean;
  /** Governance metadata — Executive Session requirements, tiers, preview */
  governance?: CapabilityGovernance;
}

// ============================================================================
// PIPELINE STAGES (11)
// ============================================================================

export type PipelineStageId =
  | 'intent_resolution'
  | 'context_validation'
  | 'permission_validation'
  | 'evidence_retrieval'
  | 'reasoning_preparation'
  | 'reasoning'
  | 'recommendation_building'
  | 'navigation_targets'
  | 'draft_outputs'
  | 'confirmation_actions'
  | 'completion_metadata';

export interface PipelineStage {
  id: PipelineStageId;
  name: string;
  description: string;
}

// ============================================================================
// EXECUTION CONTRACT
// ============================================================================

export interface CapabilityExecutionContext {
  conversation: unknown;
  context: unknown;
  currentPage: string;
  focusedObject: unknown;
  userIntent: string;
  requestedOutput?: OutputType;
  executionMode: ExecutionMode;
  userRole: string;
  userProfileId?: string;
  businessId?: string;
  valuationId?: string;
}

export interface CapabilityRecommendation {
  key: string;
  title: string;
  summary: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidenceRefs: string[];
  navigationTarget?: NavigationAction;
}

export interface CapabilityDraft {
  type: OutputType;
  title: string;
  content: unknown;
  status: 'draft' | 'ready_for_review';
}

export interface ConfirmationAction {
  action: string;
  label: string;
  requiredPermission: PermissionLevel;
  payload: Record<string, unknown>;
}

export interface CompletionMetadata {
  capabilityId: string;
  executionMode: ExecutionMode;
  duration: number;
  evidenceCount: number;
  recommendationCount: number;
  navigationCount: number;
  draftCount: number;
  confirmationCount: number;
}

export interface CapabilityInstruction {
  intent: string;
  contextValid: boolean;
  permissionsValid: boolean;
  missingContext: ContextRequirement[];
  evidence: EvidenceItem[];
  reasoningPrompt?: string;
  reasoningContext?: Record<string, unknown>;
  recommendations: CapabilityRecommendation[];
  navigationActions: NavigationAction[];
  drafts: CapabilityDraft[];
  confirmations: ConfirmationAction[];
  status: 'not_implemented' | 'ready' | 'blocked' | 'completed' | 'error';
  errorMessage?: string;
  completionMetadata?: CompletionMetadata;
  recommendedFollowUps: string[];
}

export type CapabilityExecutionResult = CapabilityInstruction;

// ============================================================================
// ANALYTICS
// ============================================================================

export interface CapabilityAnalyticsEvent {
  capabilityId: string;
  executionMode: ExecutionMode;
  timestamp: string;
  triggerType: 'manual' | 'automatic';
  outcome: 'completed' | 'dismissed' | 'accepted' | 'error' | 'not_implemented';
  duration: number;
  userRole: string;
}