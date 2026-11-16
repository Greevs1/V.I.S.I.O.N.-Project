/**
 * meetingIntelligence/meetingIntent.ts — Phase 15.3
 *
 * The Meeting Intent framework.
 *
 * Framework only — no AI reasoning.
 * Meeting Intent determines: priority, context, talking points, questions, decision focus.
 *
 * Constitution Compliance:
 *   Article I — One Truth (intent does not create truth, only focuses attention)
 *   Article II — Single Ownership (intent owns "meeting focus", not business facts)
 *   Article III — No Duplicate Intelligence (intent configures, does not duplicate)
 */

import type { MeetingIntentType, MeetingIntentConfig } from './types.ts';

// ── Meeting Intent Registry ───────────────────────────────────────────────────
// Each intent declares its priority focus, context emphasis, and decision focus.
// This is configuration, not intelligence.
export const MEETING_INTENTS: Record<MeetingIntentType, MeetingIntentConfig> = {
  quarterly_review: {
    type: 'quarterly_review',
    display_name: 'Quarterly Review',
    priority_focus: ['financial_performance', 'execution_progress', 'valuation_progress', 'growth_initiatives'],
    context_emphasis: ['executive_context', 'business_timeline', 'canonical_facts', 'sprint_progress'],
    decision_focus: ['Prioritize next quarter initiatives', 'Review progress on valuation', 'Assess growth plan execution'],
    typical_cadence: 'quarterly',
    is_internal: false,
  },
  monthly_review: {
    type: 'monthly_review',
    display_name: 'Monthly Review',
    priority_focus: ['financial_performance', 'execution_progress', 'cash_management'],
    context_emphasis: ['executive_context', 'business_timeline', 'sprint_progress'],
    decision_focus: ['Review monthly metrics', 'Adjust sprint priorities', 'Address cash flow issues'],
    typical_cadence: 'monthly',
    is_internal: false,
  },
  tax_planning: {
    type: 'tax_planning',
    display_name: 'Tax Planning',
    priority_focus: ['tax_strategy', 'financial_performance', 'risk_mitigation'],
    context_emphasis: ['canonical_facts', 'assessments', 'executive_context'],
    decision_focus: ['Finalize tax strategy', 'Review tax gap assessment', 'Plan entity structure changes'],
    typical_cadence: 'annual',
    is_internal: false,
  },
  valuation_review: {
    type: 'valuation_review',
    display_name: 'Valuation Review',
    priority_focus: ['valuation_progress', 'financial_performance', 'document_readiness'],
    context_emphasis: ['business_valuation', 'canonical_facts', 'verification_queue', 'documents'],
    decision_focus: ['Approve valuation assumptions', 'Finalize add-backs', 'Approve publication'],
    typical_cadence: 'ad_hoc',
    is_internal: false,
  },
  exit_planning: {
    type: 'exit_planning',
    display_name: 'Exit Planning',
    priority_focus: ['exit_readiness', 'valuation_progress', 'operational_health', 'risk_mitigation'],
    context_emphasis: ['business_valuation', 'executive_context', 'verification_queue'],
    decision_focus: ['Assess exit readiness', 'Review valuation gap', 'Plan operational improvements'],
    typical_cadence: 'quarterly',
    is_internal: false,
  },
  annual_planning: {
    type: 'annual_planning',
    display_name: 'Annual Planning',
    priority_focus: ['financial_performance', 'growth_initiatives', 'operational_health', 'exit_readiness'],
    context_emphasis: ['executive_context', 'canonical_facts', 'growth_plan', 'business_timeline'],
    decision_focus: ['Set annual goals', 'Prioritize growth initiatives', 'Plan resource allocation'],
    typical_cadence: 'annual',
    is_internal: false,
  },
  growth_planning: {
    type: 'growth_planning',
    display_name: 'Growth Planning',
    priority_focus: ['growth_initiatives', 'financial_performance', 'operational_health'],
    context_emphasis: ['growth_plan', 'executive_context', 'canonical_facts'],
    decision_focus: ['Prioritize growth initiatives', 'Approve new initiatives', 'Review initiative progress'],
    typical_cadence: 'quarterly',
    is_internal: false,
  },
  cash_flow_review: {
    type: 'cash_flow_review',
    display_name: 'Cash Flow Review',
    priority_focus: ['cash_management', 'financial_performance', 'risk_mitigation'],
    context_emphasis: ['canonical_facts', 'executive_context', 'business_timeline'],
    decision_focus: ['Address cash flow gaps', 'Review working capital', 'Plan financing needs'],
    typical_cadence: 'monthly',
    is_internal: false,
  },
  operations_review: {
    type: 'operations_review',
    display_name: 'Operations Review',
    priority_focus: ['operational_health', 'execution_progress', 'risk_mitigation'],
    context_emphasis: ['executive_context', 'sprint_progress', 'assessments'],
    decision_focus: ['Address operational bottlenecks', 'Review process improvements', 'Plan team changes'],
    typical_cadence: 'monthly',
    is_internal: false,
  },
  acquisition: {
    type: 'acquisition',
    display_name: 'Acquisition Discussion',
    priority_focus: ['valuation_progress', 'financial_performance', 'risk_mitigation', 'document_readiness'],
    context_emphasis: ['business_valuation', 'canonical_facts', 'documents', 'verification_queue'],
    decision_focus: ['Review acquisition target', 'Assess valuation impact', 'Plan due diligence'],
    typical_cadence: 'ad_hoc',
    is_internal: false,
  },
  due_diligence: {
    type: 'due_diligence',
    display_name: 'Due Diligence',
    priority_focus: ['document_readiness', 'financial_performance', 'risk_mitigation', 'valuation_progress'],
    context_emphasis: ['documents', 'canonical_facts', 'business_valuation', 'verification_queue'],
    decision_focus: ['Complete document collection', 'Review findings', 'Assess risk'],
    typical_cadence: 'ad_hoc',
    is_internal: false,
  },
  board_meeting: {
    type: 'board_meeting',
    display_name: 'Board Meeting',
    priority_focus: ['financial_performance', 'execution_progress', 'growth_initiatives', 'risk_mitigation'],
    context_emphasis: ['executive_context', 'business_timeline', 'canonical_facts', 'sprint_progress'],
    decision_focus: ['Present quarterly results', 'Review strategic initiatives', 'Approve key decisions'],
    typical_cadence: 'quarterly',
    is_internal: false,
  },
  succession_planning: {
    type: 'succession_planning',
    display_name: 'Succession Planning',
    priority_focus: ['operational_health', 'exit_readiness', 'risk_mitigation'],
    context_emphasis: ['executive_context', 'business_valuation', 'assessments'],
    decision_focus: ['Plan leadership transition', 'Review operational dependencies', 'Assess readiness'],
    typical_cadence: 'annual',
    is_internal: false,
  },
  discovery_call: {
    type: 'discovery_call',
    display_name: 'Discovery Call',
    priority_focus: ['discovery', 'financial_performance', 'operational_health'],
    context_emphasis: ['executive_context', 'canonical_facts', 'assessments'],
    decision_focus: ['Understand business goals', 'Identify key gaps', 'Plan engagement'],
    typical_cadence: 'ad_hoc',
    is_internal: false,
  },
  strategy_session: {
    type: 'strategy_session',
    display_name: 'Strategy Session',
    priority_focus: ['growth_initiatives', 'financial_performance', 'exit_readiness', 'operational_health'],
    context_emphasis: ['executive_context', 'growth_plan', 'canonical_facts', 'business_valuation'],
    decision_focus: ['Refine strategic priorities', 'Model scenarios', 'Plan execution'],
    typical_cadence: 'ad_hoc',
    is_internal: false,
  },
  internal_advisor_review: {
    type: 'internal_advisor_review',
    display_name: 'Internal Advisor Review',
    priority_focus: ['advisor_collaboration', 'risk_mitigation', 'valuation_progress', 'document_readiness'],
    context_emphasis: ['verification_queue', 'advisor_assignments', 'business_valuation', 'documents'],
    decision_focus: ['Review queue status', 'Assign tasks', 'Resolve conflicts', 'Approve publication'],
    typical_cadence: 'weekly',
    is_internal: true,
  },
  custom: {
    type: 'custom',
    display_name: 'Custom Meeting',
    priority_focus: ['financial_performance', 'execution_progress', 'risk_mitigation'],
    context_emphasis: ['executive_context', 'business_timeline', 'canonical_facts'],
    decision_focus: ['Review business status', 'Address open items'],
    typical_cadence: 'ad_hoc',
    is_internal: false,
  },
};

/**
 * Get the configuration for a meeting intent.
 */
export function getMeetingIntentConfig(intent: MeetingIntentType): MeetingIntentConfig {
  return MEETING_INTENTS[intent] || MEETING_INTENTS.custom;
}

/**
 * Check if an intent is advisor-internal only.
 */
export function isInternalIntent(intent: MeetingIntentType): boolean {
  return getMeetingIntentConfig(intent).is_internal;
}

/**
 * Get the display name for an intent.
 */
export function getIntentDisplayName(intent: MeetingIntentType): string {
  return getMeetingIntentConfig(intent).display_name;
}