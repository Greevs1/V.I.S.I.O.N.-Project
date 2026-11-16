/**
 * Executive Intelligence Engine — Type System
 * Phase 13.4C.1
 *
 * Pure type definitions for the EIE. No logic, no imports.
 * Every other module imports from here.
 */

// ─── Executive State Model ───────────────────────────────────────────

export interface ExecutiveState {
  userId: string;
  userEmail: string;
  userRole: string;
  resolvedRole: 'super_admin' | 'admin' | 'advisor' | 'team_member' | 'owner' | 'viewer';
  businessId: string | null;
  businessName: string | null;
  industry: string | null;
  valuationId: string | null;
  valuationStatus: string | null;
  currentWorkspace: string | null;
  currentRoute: string | null;
  currentPage: string | null;
  focusedRecordType: string | null;
  focusedRecordId: string | null;
  isAssignedAdvisor: boolean;
  assignedBusinessIds: string[];
  conversationScope: ConversationScope | null;
  membershipTier: string;
  sessionsRemaining: number;
  sessionsUsed: number;
  activeWorkflow: string | null;
  pendingTasks: PendingTask[];
  publicationState: PublicationState | null;
  growthPlanState: GrowthPlanState | null;
  verificationState: VerificationState | null;
  meetingContext: MeetingContext | null;
  recentChanges: RecentChange[];
  currentPriorities: Priority[];
  builtAt: string;
}

export interface ConversationScope {
  profileId: string;
  businessId: string | null;
  valuationId: string | null;
  mode: string;
  visibility: string;
}

export interface PendingTask {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface PublicationState {
  status: string;
  blockers: string[];
  readyForPublication: boolean;
  lastPublishedAt: string | null;
}

export interface GrowthPlanState {
  totalInitiatives: number;
  approvedInitiatives: number;
  clientVisibleInitiatives: number;
  readyInitiatives: number;
  progress: number;
}

export interface VerificationState {
  pendingVerifications: number;
  unresolvedConflicts: number;
  completedVerifications: number;
}

export interface MeetingContext {
  upcomingMeeting: boolean;
  meetingType: string | null;
  meetingDate: string | null;
  daysUntilMeeting: number | null;
}

export interface RecentChange {
  type: string;
  description: string;
  timestamp: string;
  impact: 'low' | 'medium' | 'high';
}

// ─── Priority ─────────────────────────────────────────────────────────

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface Priority {
  level: PriorityLevel;
  title: string;
  description: string;
  category: string;
  explainable: string;
  relatedCapabilityId?: string;
}

// ─── Intent ───────────────────────────────────────────────────────────

export type IntentType =
  | 'understand' | 'review' | 'investigate' | 'prepare' | 'compare'
  | 'plan' | 'publish' | 'explain' | 'navigate' | 'learn' | 'execute';

export interface Intent {
  type: IntentType;
  confidence: number;
  rawMessage: string;
  detectedKeywords: string[];
  fallbackUsed: boolean;
  fallbackReason?: string;
}

// ─── Capability Selection ─────────────────────────────────────────────

export interface CapabilitySelection {
  selectedCapabilityId: string;
  selectedCapabilityName: string;
  confidence: number;
  whySelected: string;
  alternativeCapabilityIds: string[];
  blockedCapabilityIds: string[];
  missingContext: string[];
}

// ─── Execution Strategy ──────────────────────────────────────────────

export type ExecutionStrategyType =
  | 'quick' | 'advisor' | 'executive' | 'preview'
  | 'read' | 'draft' | 'review' | 'recommend' | 'confirm';

export interface ExecutionStrategy {
  type: ExecutionStrategyType;
  requiresSession: boolean;
  requiresConfirmation: boolean;
  reasoning: string;
}

// ─── Executive Memory (working memory) ───────────────────────────────

export interface ExecutiveMemory {
  id: string;
  scope: string;
  facts: MemoryFact[];
  createdAt: string;
  expiresAt: string;
}

export interface MemoryFact {
  key: string;
  value: string;
  category: string;
  recordedAt: string;
}

// ─── Recommendation ──────────────────────────────────────────────────

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  reason: string;
  priority: PriorityLevel;
  estimatedImpact: string;
  confidence: number;
  nextCapabilityId: string;
  nextCapabilityName: string;
  intent: IntentType;
  executionStrategy: ExecutionStrategyType;
  missingEvidence: string[];
}

// ─── Follow-up Plan ───────────────────────────────────────────────────

export interface FollowUpPlan {
  currentCapabilityId: string;
  nextSteps: FollowUpStep[];
}

export interface FollowUpStep {
  capabilityId: string;
  capabilityName: string;
  reason: string;
  priority: PriorityLevel;
  optional: boolean;
}

// ─── Interruption Policy ──────────────────────────────────────────────

export type InterruptionLevel = 'silent' | 'surface' | 'recommend' | 'urgent' | 'blocking';

export interface InterruptionDecision {
  level: InterruptionLevel;
  reason: string;
  shouldNotify: boolean;
}

// ─── Executive Brief ──────────────────────────────────────────────────

export interface ExecutiveBrief {
  generatedAt: string;
  today: string;
  whatsChanged: string[];
  priorities: Priority[];
  risks: string[];
  opportunities: string[];
  meetings: string[];
  recommendations: Recommendation[];
  progress: { label: string; value: number }[];
  executiveSessions: {
    remaining: number;
    used: number;
    unlimited: boolean;
  };
}

// ─── Confidence ──────────────────────────────────────────────────────

export interface ConfidenceAssessment {
  confidence: number;
  reasoningCompleteness: number;
  evidenceCompleteness: number;
  missingEvidence: string[];
  neverFabricate: boolean;
}

// ─── Situation Assessment ─────────────────────────────────────────────

export interface SituationAssessment {
  whereIsUser: string;
  whatAreTheyWorkingOn: string;
  whatChanged: string | null;
  whatIsIncomplete: string[];
  whatIsBlocked: string[];
  whatIsUrgent: string[];
  summary: string;
}

// ─── Safety ───────────────────────────────────────────────────────────

export interface SafetyCheck {
  isReadOnly: boolean;
  violations: string[];
  allowedActions: string[];
}

// ─── EIE Decision (main output) ───────────────────────────────────────

export interface EIEDecision {
  state: ExecutiveState;
  assessment: SituationAssessment;
  priorities: Priority[];
  intent: Intent;
  capabilitySelection: CapabilitySelection;
  executionStrategy: ExecutionStrategy;
  recommendations: Recommendation[];
  followUpPlan: FollowUpPlan | null;
  interruptionDecision: InterruptionDecision;
  brief: ExecutiveBrief;
  confidence: ConfidenceAssessment;
  safety: SafetyCheck;
}

// ─── EIE Input ────────────────────────────────────────────────────────

export interface EIEInput {
  userMessage: string;
  context: EIEContext;
}

export interface EIEContext {
  userId: string;
  userEmail: string;
  userRole: string;
  resolvedRole: ExecutiveState['resolvedRole'];
  businessId: string | null;
  businessName: string | null;
  industry: string | null;
  valuationId: string | null;
  valuationStatus: string | null;
  currentWorkspace: string | null;
  currentRoute: string | null;
  currentPage: string | null;
  focusedRecordType: string | null;
  focusedRecordId: string | null;
  isAssignedAdvisor: boolean;
  assignedBusinessIds: string[];
  conversationScope: ConversationScope | null;
  membershipTier: string;
  sessionsRemaining: number;
  sessionsUsed: number;
  activeWorkflow: string | null;
  pendingTasks: PendingTask[];
  publicationState: PublicationState | null;
  growthPlanState: GrowthPlanState | null;
  verificationState: VerificationState | null;
  meetingContext: MeetingContext | null;
  recentChanges: RecentChange[];
}

// ─── Analytics ───────────────────────────────────────────────────────

export interface EIEAnalytics {
  recommendationsGenerated: number;
  recommendationsAccepted: number;
  recommendationsDismissed: number;
  intentDetectionAccuracy: number;
  capabilitySelections: Record<string, number>;
  priorityDistribution: Record<PriorityLevel, number>;
  totalDecisions: number;
}