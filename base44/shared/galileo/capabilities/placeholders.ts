/**
 * Galileo Capability Framework — Placeholder Capabilities
 * Phase 13.4B.1
 *
 * Registers 20 placeholder capabilities. Each returns NOT_IMPLEMENTED
 * when executed but validates through the framework (intent, context,
 * permissions, evidence request).
 *
 * No capability-specific business logic is implemented here.
 * No LLM calls. No reasoning. No recommendations.
 *
 * These are metadata declarations only.
 */
import type { CapabilityMetadata } from './types.ts';
import { capabilityRegistry } from './registry.ts';
import { initializeFollowUpGraph } from './followUpGraph.ts';

/**
 * Shared role sets for common capability patterns.
 */
const ALL_ROLES = ['super_admin', 'admin', 'advisor', 'team_member', 'owner', 'viewer'];
const ADVISOR_ONLY = ['super_admin', 'admin', 'advisor'];
const ADVISOR_AND_TEAM = ['super_admin', 'admin', 'advisor', 'team_member'];

/**
 * Helper to build standard capability metadata.
 */
function makeCapability(partial: Partial<CapabilityMetadata> & Pick<CapabilityMetadata, 'id' | 'title' | 'category' | 'description'>): CapabilityMetadata {
  return {
    icon: 'sparkles',
    version: '1.0.0',
    status: 'experimental',
    requiredContext: [],
    requiredPermissions: ['read'],
    visibility: 'both',
    supportedRoles: ALL_ROLES,
    supportedOutputs: ['conversation'],
    allowedActions: [],
    recommendedFollowUps: [],
    estimatedDuration: '30s',
    priority: 'medium',
    supportsStreaming: false,
    supportsEvidence: true,
    supportsNavigation: true,
    supportsDrafts: false,
    supportsConfirmations: false,
    supportsClientSafe: true,
    ...partial,
    governance: {
      minimumTier: 'explorer',
      requiresExecutiveSession: true,
      estimatedSessionCost: 1,
      previewAvailable: true,
      supportsPreview: true,
      supportsTeaser: true,
      supportsEarnedAccess: true,
      supportsUnlimitedAccess: true,
      executionLevels: ['quick', 'advisor', 'executive'],
      defaultExecutionLevel: 'advisor',
      ...partial.governance,
    },
  };
}

/**
 * The 20 placeholder capability definitions.
 */
const PLACEHOLDER_CAPABILITIES: CapabilityMetadata[] = [
  // ── Valuation: Explain ──────────────────────────────────────────
  makeCapability({
    id: 'explain.enterprise_value',
    title: 'Explain Enterprise Value',
    category: 'valuation',
    description: 'Explain how the enterprise value was determined, including methodology, multiples, and key drivers.',
    icon: 'trending-up',
    supportedOutputs: ['conversation', 'summary', 'navigation'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'An approved valuation with enterprise value conclusion', fallback: 'block' },
      { resource: 'confidence', required: true, description: 'Confidence scoring for the valuation', fallback: 'warn' },
      { resource: 'advisor_conclusion', required: false, description: 'Advisor conclusion narrative', fallback: 'warn' },
      { resource: 'reconciliation', required: false, description: 'Method reconciliation', fallback: 'proceed_with_gap' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ALL_ROLES,
    estimatedDuration: '45s',
    priority: 'high',
    recommendedFollowUps: ['review.confidence', 'explain.equity_value', 'explain.build_value'],
  }),

  makeCapability({
    id: 'explain.equity_value',
    title: 'Explain Equity Value',
    category: 'valuation',
    description: 'Explain the bridge from enterprise value to equity value, including adjustments and net debt.',
    icon: 'scale',
    supportedOutputs: ['conversation', 'summary', 'navigation'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'An approved valuation with equity value', fallback: 'block' },
      { resource: 'reconciliation', required: false, description: 'Equity bridge reconciliation', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ALL_ROLES,
    estimatedDuration: '30s',
    priority: 'high',
    recommendedFollowUps: ['explain.enterprise_value'],
  }),

  makeCapability({
    id: 'explain.confidence',
    title: 'Explain Confidence',
    category: 'valuation',
    description: 'Explain the confidence score, including data quality, methodology coverage, and key risk factors.',
    icon: 'shield-check',
    supportedOutputs: ['conversation', 'summary'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'An approved valuation', fallback: 'block' },
      { resource: 'confidence', required: true, description: 'Confidence scoring data', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ALL_ROLES,
    estimatedDuration: '30s',
    priority: 'high',
    recommendedFollowUps: ['investigate.conflict', 'review.evidence'],
  }),

  makeCapability({
    id: 'explain.build_value',
    title: 'Explain Build Value',
    category: 'valuation',
    description: 'Explain the Build Value dimension scores, including strengths, risks, and missing evidence.',
    icon: 'bar-chart-3',
    supportedOutputs: ['conversation', 'summary', 'navigation'],
    requiredContext: [
      { resource: 'build_value', required: true, description: 'Build Value dimension scores', fallback: 'block' },
      { resource: 'confidence', required: false, description: 'Confidence data', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ALL_ROLES,
    estimatedDuration: '45s',
    priority: 'medium',
    recommendedFollowUps: ['review.opportunities', 'review.risks'],
  }),

  // ── Valuation: Review ───────────────────────────────────────────
  makeCapability({
    id: 'review.publication_readiness',
    title: 'Review Publication Readiness',
    category: 'valuation',
    description: 'Review whether the valuation is ready for publication, including all required sections and approvals.',
    icon: 'check-circle',
    supportedOutputs: ['checklist', 'recommendation', 'navigation'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'An approved valuation', fallback: 'block' },
      { resource: 'advisor_conclusion', required: true, description: 'Advisor conclusion', fallback: 'block' },
      { resource: 'deliverables', required: false, description: 'Generated deliverables', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '60s',
    priority: 'critical',
    supportsDrafts: true,
    recommendedFollowUps: ['compare.valuation_versions'],
  }),

  makeCapability({
    id: 'investigate.conflict',
    title: 'Investigate Conflict',
    category: 'valuation',
    description: 'Investigate conflicts between valuation methods, adjustments, or evidence sources.',
    icon: 'alert-triangle',
    supportedOutputs: ['investigation', 'recommendation', 'navigation'],
    requiredContext: [
      { resource: 'verification_queue', required: true, description: 'Verification queue with conflicts', fallback: 'block' },
      { resource: 'reconciliation', required: false, description: 'Method reconciliation', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '90s',
    priority: 'high',
    recommendedFollowUps: ['review.evidence', 'review.missing_information'],
  }),

  makeCapability({
    id: 'review.evidence',
    title: 'Review Evidence',
    category: 'valuation',
    description: 'Review the evidence supporting valuation conclusions, including documents and extracted data.',
    icon: 'file-search',
    supportedOutputs: ['investigation', 'summary', 'navigation'],
    requiredContext: [
      { resource: 'documents', required: true, description: 'Uploaded documents', fallback: 'block' },
      { resource: 'adjustments', required: false, description: 'Valuation adjustments', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    recommendedFollowUps: [],
  }),

  // ── Growth ──────────────────────────────────────────────────────
  makeCapability({
    id: 'increase.enterprise_value',
    title: 'Increase Enterprise Value',
    category: 'growth',
    description: 'Recommend initiatives to increase enterprise value through EBITDA improvement and multiple expansion.',
    icon: 'trending-up',
    supportedOutputs: ['recommendation', 'action_plan', 'navigation'],
    requiredContext: [
      { resource: 'build_value', required: true, description: 'Build Value scores', fallback: 'block' },
      { resource: 'initiatives', required: false, description: 'Existing growth initiatives', fallback: 'warn' },
      { resource: 'financials', required: false, description: 'Financial history', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '90s',
    priority: 'high',
    recommendedFollowUps: ['build.90_day_plan', 'review.opportunities', 'review.risks'],
  }),

  makeCapability({
    id: 'build.90_day_plan',
    title: 'Build 90-Day Plan',
    category: 'growth',
    description: 'Draft a 90-day sprint plan from growth initiatives and value drivers.',
    icon: 'calendar',
    supportedOutputs: ['action_plan', 'timeline'],
    requiredContext: [
      { resource: 'build_value', required: true, description: 'Build Value scores', fallback: 'block' },
      { resource: 'roadmap', required: false, description: 'Existing roadmap', fallback: 'warn' },
      { resource: 'initiatives', required: true, description: 'Growth initiatives', fallback: 'block' },
      { resource: 'documents', required: false, description: 'Supporting documents', fallback: 'warn' },
      { resource: 'financials', required: false, description: 'Financial history', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '120s',
    priority: 'high',
    supportsDrafts: true,
    supportsConfirmations: true,
    recommendedFollowUps: ['prepare.client_meeting', 'review.missing_information'],
  }),

  // ── Meetings ────────────────────────────────────────────────────
  makeCapability({
    id: 'prepare.client_meeting',
    title: 'Prepare Client Meeting',
    category: 'meetings',
    description: 'Prepare a client meeting agenda and briefing materials from valuation and growth plan data.',
    icon: 'users',
    supportedOutputs: ['meeting_agenda', 'advisor_memo', 'navigation'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'Approved valuation', fallback: 'block' },
      { resource: 'growth_plan', required: false, description: 'Growth plan', fallback: 'warn' },
      { resource: 'deliverables', required: false, description: 'Generated deliverables', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '90s',
    priority: 'high',
    supportsDrafts: true,
    recommendedFollowUps: ['draft.client_explanation', 'review.publication_readiness'],
  }),

  makeCapability({
    id: 'prepare.buyer_meeting',
    title: 'Prepare Buyer Meeting',
    category: 'meetings',
    description: 'Prepare a buyer meeting briefing from valuation, readiness, and deliverables.',
    icon: 'briefcase',
    supportedOutputs: ['meeting_agenda', 'advisor_memo'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'Approved valuation', fallback: 'block' },
      { resource: 'readiness', required: true, description: 'Exit readiness assessment', fallback: 'block' },
      { resource: 'deliverables', required: false, description: 'Generated deliverables', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '90s',
    priority: 'high',
    supportsDrafts: true,
    recommendedFollowUps: ['review.publication_readiness'],
  }),

  makeCapability({
    id: 'prepare.board_meeting',
    title: 'Prepare Board Meeting',
    category: 'meetings',
    description: 'Prepare a board meeting briefing from valuation, financials, and growth plan.',
    icon: 'presentation',
    supportedOutputs: ['meeting_agenda', 'report'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'Approved valuation', fallback: 'block' },
      { resource: 'financials', required: true, description: 'Financial history', fallback: 'block' },
      { resource: 'growth_plan', required: false, description: 'Growth plan', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '90s',
    priority: 'medium',
    supportsDrafts: true,
    recommendedFollowUps: ['review.financial_story'],
  }),

  // ── Analysis ────────────────────────────────────────────────────
  makeCapability({
    id: 'compare.valuation_versions',
    title: 'Compare Valuation Versions',
    category: 'analysis',
    description: 'Compare two or more valuation versions to show changes in methodology, adjustments, and conclusions.',
    icon: 'git-compare',
    supportedOutputs: ['comparison', 'summary', 'navigation'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'Current approved valuation', fallback: 'block' },
      { resource: 'published_version', required: true, description: 'Previously published version', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    recommendedFollowUps: ['review.publication_readiness', 'explain.enterprise_value'],
  }),

  makeCapability({
    id: 'review.missing_information',
    title: 'Review Missing Information',
    category: 'analysis',
    description: 'Review what information is missing for a complete valuation, including documents and assessments.',
    icon: 'help-circle',
    supportedOutputs: ['checklist', 'recommendation', 'navigation'],
    requiredContext: [
      { resource: 'verification_queue', required: false, description: 'Verification queue', fallback: 'warn' },
      { resource: 'documents', required: false, description: 'Uploaded documents', fallback: 'warn' },
      { resource: 'assessments', required: false, description: 'Completed assessments', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '45s',
    priority: 'medium',
    recommendedFollowUps: ['review.uploaded_documents', 'analyze.assessments'],
  }),

  makeCapability({
    id: 'review.risks',
    title: 'Review Risks',
    category: 'analysis',
    description: 'Review identified risks from Build Value and verification queue.',
    icon: 'alert-octagon',
    supportedOutputs: ['summary', 'recommendation', 'navigation'],
    requiredContext: [
      { resource: 'build_value', required: true, description: 'Build Value scores', fallback: 'block' },
      { resource: 'verification_queue', required: false, description: 'Verification queue', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '45s',
    priority: 'medium',
    recommendedFollowUps: ['investigate.conflict'],
  }),

  makeCapability({
    id: 'review.opportunities',
    title: 'Review Opportunities',
    category: 'business_intelligence',
    description: 'Review identified opportunities from Build Value and assessments.',
    icon: 'lightbulb',
    supportedOutputs: ['summary', 'recommendation', 'navigation'],
    requiredContext: [
      { resource: 'build_value', required: true, description: 'Build Value scores', fallback: 'block' },
      { resource: 'assessments', required: false, description: 'Completed assessments', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '45s',
    priority: 'medium',
    recommendedFollowUps: ['increase.enterprise_value'],
  }),

  makeCapability({
    id: 'analyze.assessments',
    title: 'Analyze Assessments',
    category: 'analysis',
    description: 'Analyze completed assessments to surface insights and gaps.',
    icon: 'clipboard-list',
    supportedOutputs: ['summary', 'recommendation'],
    requiredContext: [
      { resource: 'assessments', required: true, description: 'Completed assessments', fallback: 'block' },
      { resource: 'financials', required: false, description: 'Financial history', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    recommendedFollowUps: ['review.financial_story'],
  }),

  makeCapability({
    id: 'review.financial_story',
    title: 'Review Financial Story',
    category: 'valuation',
    description: 'Review the financial story from historical financials, adjustments, and normalized earnings.',
    icon: 'book-open',
    supportedOutputs: ['summary', 'timeline'],
    requiredContext: [
      { resource: 'financials', required: true, description: 'Financial history', fallback: 'block' },
      { resource: 'adjustments', required: false, description: 'Valuation adjustments', fallback: 'warn' },
      { resource: 'approved_valuation', required: false, description: 'Approved valuation', fallback: 'warn' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    recommendedFollowUps: ['explain.enterprise_value'],
  }),

  // ── Documents ───────────────────────────────────────────────────
  makeCapability({
    id: 'review.uploaded_documents',
    title: 'Review Uploaded Documents',
    category: 'valuation',
    description: 'Review uploaded documents for completeness, classification, and extraction status.',
    icon: 'folder',
    supportedOutputs: ['checklist', 'summary', 'navigation'],
    requiredContext: [
      { resource: 'documents', required: true, description: 'Uploaded documents', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '45s',
    priority: 'low',
    recommendedFollowUps: ['review.evidence'],
    governance: {
      requiresExecutiveSession: false,
      estimatedSessionCost: 0,
      defaultExecutionLevel: 'quick',
    },
  }),

  // ── Reports ─────────────────────────────────────────────────────
  makeCapability({
    id: 'draft.client_explanation',
    title: 'Draft Client Explanation',
    category: 'reports',
    description: 'Draft a client-facing explanation of the valuation results in plain language.',
    icon: 'file-text',
    supportedOutputs: ['client_letter', 'advisor_memo'],
    requiredContext: [
      { resource: 'approved_valuation', required: true, description: 'Approved valuation', fallback: 'block' },
      { resource: 'advisor_conclusion', required: true, description: 'Advisor conclusion', fallback: 'block' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_ONLY,
    estimatedDuration: '90s',
    priority: 'high',
    supportsDrafts: true,
    supportsClientSafe: true,
    recommendedFollowUps: ['prepare.client_meeting'],
  }),

  // ── Decision Intelligence (Phase D) ────────────────────────────────
  makeCapability({
    id: 'analyze.decision',
    title: 'Analyze Decision',
    category: 'analysis',
    description: 'Frame and analyze a major business decision — structure the question, collect evidence from the Shared Intelligence Contract, identify options, assumptions, risks, and unknowns.',
    icon: 'git-branch',
    supportedOutputs: ['investigation', 'comparison', 'summary', 'recommendation'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
      { resource: 'assessments', required: false, description: 'Completed assessments for intelligence contract', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '120s',
    priority: 'high',
    supportsDrafts: true,
    supportsConfirmations: true,
    supportsClientSafe: true,
    recommendedFollowUps: ['challenge.decision', 'compare.options'],
  }),

  makeCapability({
    id: 'challenge.decision',
    title: 'Challenge Decision (Devil\'s Advocate)',
    category: 'analysis',
    description: 'Challenge a decision\'s assumptions, identify confirmation bias, find missing evidence, articulate the strongest opposing case, and identify failure modes.',
    icon: 'shield-alert',
    supportedOutputs: ['investigation', 'summary'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '90s',
    priority: 'high',
    supportsClientSafe: false,
    recommendedFollowUps: ['analyze.decision', 'review.missing_information'],
  }),

  makeCapability({
    id: 'compare.options',
    title: 'Compare Decision Options',
    category: 'analysis',
    description: 'Compare two or more decision options side-by-side — tradeoffs, financial implications, operational implications, risks, and confidence.',
    icon: 'git-compare',
    supportedOutputs: ['comparison', 'summary', 'recommendation'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    supportsClientSafe: true,
    recommendedFollowUps: ['analyze.decision', 'challenge.decision'],
  }),

  // ── Decision Outcome Intelligence (Phase D.1) ───────────────────────
  makeCapability({
    id: 'review.decision_outcome',
    title: 'Review Decision Outcome',
    category: 'analysis',
    description: 'Analyze how a finalized decision turned out — compare expected vs actual outcomes, identify what worked and what did not, and surface lessons. AI is advisory; humans confirm the final outcome.',
    icon: 'trending-up',
    supportedOutputs: ['investigation', 'summary', 'recommendation'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
      { resource: 'assessments', required: false, description: 'Current business intelligence for outcome comparison', fallback: 'warn' },
    ],
    requiredPermissions: ['read', 'draft'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '120s',
    priority: 'high',
    supportsDrafts: true,
    supportsConfirmations: true,
    supportsClientSafe: true,
    recommendedFollowUps: ['compare.expected_actual', 'extract.decision_lessons'],
  }),

  makeCapability({
    id: 'compare.expected_actual',
    title: 'Compare Expected vs Actual',
    category: 'analysis',
    description: 'Compare the expected outcomes defined at decision time against current business evidence from the Shared Intelligence Contract. Surface deltas, analytical statuses, and confidence.',
    icon: 'git-compare',
    supportedOutputs: ['comparison', 'summary'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    supportsClientSafe: true,
    recommendedFollowUps: ['review.decision_outcome', 'extract.decision_lessons'],
  }),

  makeCapability({
    id: 'extract.decision_lessons',
    title: 'Extract Decision Lessons',
    category: 'analysis',
    description: 'Identify durable lessons from a decision outcome — what was learned about customers, operations, capital allocation, or strategy. Lessons are Business Memory candidates, not permanent truth.',
    icon: 'lightbulb',
    supportedOutputs: ['summary', 'recommendation'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '45s',
    priority: 'medium',
    supportsClientSafe: false,
    recommendedFollowUps: ['review.decision_outcome'],
  }),

  // ── Business DNA: Analyze ───────────────────────────────────────
  makeCapability({
    id: 'analyze.business_dna',
    title: 'Analyze Business DNA',
    category: 'analysis',
    description: 'Synthesize durable business patterns across certified evidence. Identifies recurring behaviors in economic value, operations, decisions, owner dependency, and risk. Patterns are derived intelligence — never authoritative source truth.',
    icon: 'dna',
    supportedOutputs: ['summary', 'recommendation'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '60s',
    priority: 'medium',
    supportsClientSafe: true,
    recommendedFollowUps: ['explain.business_pattern', 'challenge.business_pattern'],
  }),

  // ── Business DNA: Explain Pattern ───────────────────────────────
  makeCapability({
    id: 'explain.business_pattern',
    title: 'Explain Business Pattern',
    category: 'analysis',
    description: 'Explain why V.I.S.I.O.N. believes a specific Business DNA pattern exists. Shows supporting evidence, contradicting evidence, lineage, confidence, and evolution history. Every pattern must be explainable.',
    icon: 'search',
    supportedOutputs: ['summary', 'evidence'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
      { resource: 'dna_pattern', required: true, description: 'Pattern to explain', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ALL_ROLES,
    estimatedDuration: '30s',
    priority: 'medium',
    supportsClientSafe: true,
    supportsEvidence: true,
    recommendedFollowUps: ['challenge.business_pattern'],
  }),

  // ── Business DNA: Challenge Pattern ─────────────────────────────
  makeCapability({
    id: 'challenge.business_pattern',
    title: 'Challenge Business Pattern',
    category: 'analysis',
    description: 'Run devil\'s advocate analysis on a Business DNA pattern. Identifies confirmation bias risks, missing evidence, and alternative explanations. Patterns may be contested — contradictions do not silently overwrite.',
    icon: 'shield-alert',
    supportedOutputs: ['summary', 'recommendation'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
      { resource: 'dna_pattern', required: true, description: 'Pattern to challenge', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ADVISOR_AND_TEAM,
    estimatedDuration: '45s',
    priority: 'medium',
    supportsClientSafe: false,
    recommendedFollowUps: ['compare.business_evolution'],
  }),

  // ── Business DNA: Compare Evolution ─────────────────────────────
  makeCapability({
    id: 'compare.business_evolution',
    title: 'Compare Business Evolution',
    category: 'analysis',
    description: 'Compare how Business DNA patterns have evolved over time. Shows THEN vs NOW vs DIRECTION for each pattern, with evidence of what changed. Historical patterns are preserved — not mutated.',
    icon: 'git-compare',
    supportedOutputs: ['summary', 'timeline'],
    requiredContext: [
      { resource: 'business_profile', required: true, description: 'Business context', fallback: 'block' },
    ],
    requiredPermissions: ['read'],
    supportedRoles: ALL_ROLES,
    estimatedDuration: '40s',
    priority: 'low',
    supportsClientSafe: true,
    recommendedFollowUps: ['analyze.business_dna'],
  }),
];

/**
 * Register all placeholder capabilities and initialize the follow-up graph.
 * Called once during framework initialization.
 */
export function registerPlaceholderCapabilities(): void {
  for (const capability of PLACEHOLDER_CAPABILITIES) {
    capabilityRegistry.register(capability);
  }
  initializeFollowUpGraph();
}

/**
 * Check if all 20 placeholder capabilities are registered.
 */
export function validatePlaceholderRegistration(): { registered: number; expected: number; valid: boolean } {
  const registered = PLACEHOLDER_CAPABILITIES.filter((c) => capabilityRegistry.has(c.id)).length;
  return {
    registered,
    expected: PLACEHOLDER_CAPABILITIES.length,
    valid: registered === PLACEHOLDER_CAPABILITIES.length,
  };
}

export { PLACEHOLDER_CAPABILITIES };