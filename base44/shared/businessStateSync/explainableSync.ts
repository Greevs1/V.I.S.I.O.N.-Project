/**
 * businessStateSync/explainableSync.ts — Phase 14.3
 *
 * Explainable Synchronization — every synchronization event must explain
 * itself.
 *
 * Example:
 *   "Revenue changed. Dashboard refreshed. Executive Brief refreshed.
 *    Growth Plan reprioritized. Galileo context rebuilt. Nothing changed
 *    inside Valuation because advisor review is required."
 *
 * Pure text generation. No side effects.
 */

import type {
  BusinessStateEvent,
  ExplainableSyncEntry,
  ExplainableSyncReport,
  PropagationDecision,
} from './types.ts';

// ── Consumer display names ───────────────────────────────────────────────────
const CONSUMER_DISPLAY: Record<string, string> = {
  dashboard: 'Dashboard',
  galileo: 'Galileo',
  executive_brief: 'Executive Brief',
  growth_plan: 'Growth Plan',
  reports: 'Reports',
  meeting_prep: 'Meeting Prep',
  business_intelligence: 'Business Intelligence',
  assessments: 'Assessments',
  valuation: 'Valuation',
  documents: 'Documents',
  roadmap: 'Roadmap',
  sprints: '90-Day Sprints',
};

// ── Action verbs per classification ──────────────────────────────────────────
function actionForDecision(decision: PropagationDecision): string {
  switch (decision.classification) {
    case 'automatic':
      if (decision.refresh_mode === 'immediate') return 'refreshed';
      if (decision.refresh_mode === 'background') return 'refreshed in background';
      if (decision.refresh_mode === 'next_open') return 'will refresh on next open';
      return 'refreshed';
    case 'advisor_review':
      return 'flagged for advisor review';
    case 'verification_required':
      return 'blocked pending verification';
    case 'blocked':
      return 'blocked by governance';
  }
}

// ── Format a single sync entry ───────────────────────────────────────────────
export function formatSyncEntry(decision: PropagationDecision): ExplainableSyncEntry {
  const consumerName = CONSUMER_DISPLAY[decision.consumer_id] || decision.consumer_id;
  const action = actionForDecision(decision);
  const explanation = `${consumerName} ${action}. ${decision.reason}`;

  return {
    event_id: decision.event.event_id,
    consumer_id: decision.consumer_id,
    action,
    explanation,
    classification: decision.classification,
    timestamp: decision.event.timestamp,
  };
}

// ── Generate the full explainable report ─────────────────────────────────────
export function generateExplanation(
  event: BusinessStateEvent,
  decisions: PropagationDecision[],
): ExplainableSyncReport {
  const entries = decisions.map(formatSyncEntry);

  // Build summary
  const factDisplay = event.fact_key.replace(/_/g, ' ');
  const refreshed = decisions.filter(d => d.classification === 'automatic');
  const reviewRequired = decisions.filter(d => d.classification === 'advisor_review');
  const verificationRequired = decisions.filter(d => d.classification === 'verification_required');
  const blocked = decisions.filter(d => d.classification === 'blocked');

  const parts: string[] = [`${factDisplay} changed.`];

  if (refreshed.length > 0) {
    const names = refreshed.map(d => CONSUMER_DISPLAY[d.consumer_id] || d.consumer_id).join(', ');
    parts.push(`${names} refreshed.`);
  }

  if (reviewRequired.length > 0) {
    const names = reviewRequired.map(d => CONSUMER_DISPLAY[d.consumer_id] || d.consumer_id).join(', ');
    parts.push(`${names} flagged for advisor review.`);
  }

  if (verificationRequired.length > 0) {
    const names = verificationRequired.map(d => CONSUMER_DISPLAY[d.consumer_id] || d.consumer_id).join(', ');
    parts.push(`${names} blocked pending verification.`);
  }

  if (blocked.length > 0) {
    const names = blocked.map(d => CONSUMER_DISPLAY[d.consumer_id] || d.consumer_id).join(', ');
    parts.push(`${names} blocked by governance.`);
  }

  // Special: if nothing changed in valuation, explain why
  const valuationDecision = decisions.find(d => d.consumer_id === 'valuation');
  if (valuationDecision && valuationDecision.classification !== 'automatic') {
    parts.push(`Nothing changed inside Valuation because ${valuationDecision.reason.toLowerCase()}`);
  }

  return {
    event_id: event.event_id,
    event_type: event.event_type,
    fact_key: event.fact_key,
    business_id: event.business_id,
    summary: parts.join(' '),
    entries,
    timestamp: event.timestamp,
  };
}