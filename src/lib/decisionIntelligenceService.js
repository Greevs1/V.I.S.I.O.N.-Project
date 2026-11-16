/**
 * Decision Intelligence Service — Frontend API Client
 * Phase D
 *
 * Thin client that calls the decisionIntelligenceService backend function.
 * All business logic lives in the backend + shared modules.
 */

import { base44 } from '@/api/base44Client';

const FUNCTION_NAME = 'decisionIntelligenceService';

async function callAction(action, data = {}) {
  const res = await base44.functions.invoke(FUNCTION_NAME, { action, data });
  return res;
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function createDecision(params) {
  const { business_id, title, decision_type, question, importance, risk_level, target_decision_date, meeting_context_id, visibility } = params;
  return callAction('createDecision', { business_id, title, decision_type, question, importance, risk_level, target_decision_date, meeting_context_id, visibility });
}

export async function getDecision(decision_id, client_safe = false) {
  return callAction('getDecision', { decision_id, client_safe });
}

export async function listDecisions(business_id, filters = {}) {
  const { status, decision_type, client_safe } = filters;
  return callAction('listDecisions', { business_id, status, decision_type, client_safe });
}

export async function updateDecision(decision_id, updates) {
  return callAction('updateDecision', { decision_id, updates });
}

// ── Finalize (Human Decision) ─────────────────────────────────────────────

export async function finalizeDecision(decision_id, selected_option_id, decision_reason) {
  return callAction('finalizeDecision', { decision_id, selected_option_id, decision_reason });
}

export async function supersedeDecision(original_decision_id, new_decision_id, reason) {
  return callAction('supersedeDecision', { original_decision_id, new_decision_id, reason });
}

// ── Intelligence ───────────────────────────────────────────────────────────

export async function buildDecisionContext(decision_id) {
  return callAction('buildDecisionContext', { decision_id });
}

// ── Outcome Intelligence (Phase D.1) ───────────────────────────────────────

export async function setExpectedOutcomes(decision_id, expected_outcomes, outcome_review_date) {
  return callAction('setExpectedOutcomes', { decision_id, expected_outcomes, outcome_review_date });
}

export async function buildOutcomeContext(decision_id) {
  return callAction('buildOutcomeContext', { decision_id });
}

export async function analyzeOutcome(decision_id) {
  return callAction('analyzeOutcome', { decision_id });
}

export async function confirmOutcome(decision_id, outcome_status, outcome_notes, actual_outcomes) {
  return callAction('confirmOutcome', { decision_id, outcome_status, outcome_notes, actual_outcomes });
}

export async function getOutcomeReviewState(decision_id) {
  return callAction('getOutcomeReviewState', { decision_id });
}

export async function listReviewsDue(business_id, states) {
  return callAction('listReviewsDue', { business_id, states });
}

export async function createFollowUpDecision(original_decision_id, params) {
  const { title, decision_type, question, importance, risk_level } = params;
  return callAction('createFollowUpDecision', { original_decision_id, title, decision_type, question, importance, risk_level });
}

export async function challengeDecision(decision_id) {
  return callAction('challengeDecision', { decision_id });
}

export async function generateMemoryCandidate(decision_id) {
  return callAction('generateMemoryCandidate', { decision_id });
}

export async function getDecisionLedger(business_id) {
  return callAction('getDecisionLedger', { business_id });
}

// ── Decision Type Labels ──────────────────────────────────────────────────

export const DECISION_TYPE_LABELS = {
  strategic: 'Strategic',
  financial: 'Financial',
  operating: 'Operating',
  talent: 'Talent / Hiring',
  capital_allocation: 'Capital Allocation',
  acquisition: 'Acquisition',
  exit: 'Exit / Sale',
  pricing: 'Pricing',
  growth: 'Growth',
  risk: 'Risk Management',
  ownership: 'Ownership / Entity',
  tax: 'Tax',
  technology: 'Technology',
  other: 'Other',
};

export const DECISION_STATUS_LABELS = {
  draft: 'Draft',
  analyzing: 'Analyzing',
  needs_information: 'Needs Information',
  ready_for_decision: 'Ready for Decision',
  decided: 'Decided',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
};

export const DECISION_IMPORTANCE_LABELS = {
  critical: 'Critical',
  strategic: 'Strategic',
  significant: 'Significant',
  routine: 'Routine',
};

export const DECISION_RISK_LABELS = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};