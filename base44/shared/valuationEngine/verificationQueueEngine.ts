/**
 * verificationQueueEngine.ts — Phase 13.3E.3
 *
 * Pure, deterministic engine that transforms an IntelligenceResult (plus
 * publication blockers) into a unified, deduplicated, prioritized set of
 * verification queue items.
 *
 * No I/O. The backend action loads source data, calls buildIntelligence(),
 * then buildVerificationQueue(). Persisted overlay (status, assignment,
 * resolution) is merged by the backend after generation.
 *
 * Item types (controlled allowlist):
 *   conflicting_value, low_confidence_value, missing_required_field,
 *   missing_document, proposed_add_back, proposed_deduction,
 *   advisor_judgment, client_confirmation, methodology_decision,
 *   unsupported_assumption, stale_value, reconciliation_required,
 *   document_mapping_review, assessment_conflict, publication_blocker
 */

import type { IntelligenceResult, Candidate, Conflict, AddBackCandidate, QuestionReduction } from './intelligenceEngine.ts';

export type ItemType =
  | 'conflicting_value'
  | 'low_confidence_value'
  | 'missing_required_field'
  | 'missing_document'
  | 'proposed_add_back'
  | 'proposed_deduction'
  | 'advisor_judgment'
  | 'client_confirmation'
  | 'methodology_decision'
  | 'unsupported_assumption'
  | 'stale_value'
  | 'reconciliation_required'
  | 'document_mapping_review'
  | 'assessment_conflict'
  | 'publication_blocker';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface VerificationItem {
  dedup_key: string;
  item_type: ItemType;
  field_key?: string;
  question_key?: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  severity?: string;
  suggested_value?: any;
  formatted_value?: string;
  alternative_values?: any[];
  source_type?: string;
  source_id?: string;
  source_name?: string;
  reporting_period?: string;
  confidence_score?: number;
  conflict_status?: string;
  financial_impact?: string;
  valuation_impact?: string;
  profitability_relevance?: boolean;
  multiple_relevance?: boolean;
  risk_relevance?: boolean;
  responsible_party?: string;
  due_date?: string;
  advisor_action_required: boolean;
  client_action_required: boolean;
  evidence_available: boolean;
  evidence_count: number;
  recommended_action: string;
  // Default computed status — backend overlays persisted state
  default_status: string;
}

export interface PublicationBlocker {
  key: string;
  title: string;
  detail: string;
}

export interface QueueSummary {
  total_open: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  waiting_on_client: number;
  waiting_on_advisor: number;
  deferred: number;
  resolved_today: number;
  publication_blockers: number;
}

export interface RecommendedQueueAction {
  title: string;
  detail: string;
  priority: Priority;
  action_type: string;
}

export interface VerificationQueueResult {
  items: VerificationItem[];
  summary: QueueSummary;
  recommendedAction: RecommendedQueueAction;
}

const CRITICAL_RELEVANCE = new Set(['enterprise_value', 'profitability']);

function relevanceFlags(c: Candidate) {
  return {
    profitability_relevance: c.valuation_relevance === 'profitability' || c.valuation_relevance === 'enterprise_value',
    multiple_relevance: c.valuation_relevance === 'market_multiple' || c.valuation_relevance === 'growth',
    risk_relevance: c.valuation_relevance === 'risk' || c.valuation_relevance === 'transferability',
  };
}

function priorityForConflict(c: Candidate): Priority {
  if (CRITICAL_RELEVANCE.has(c.valuation_relevance || '')) return 'critical';
  if (c.valuation_relevance === 'market_multiple' || c.valuation_relevance === 'growth') return 'high';
  return 'medium';
}

function priorityForMissing(c: Candidate): Priority {
  if (CRITICAL_RELEVANCE.has(c.valuation_relevance || '')) return 'critical';
  if (c.valuation_relevance === 'market_multiple' || c.valuation_relevance === 'growth') return 'high';
  return 'medium';
}

function priorityForLowConfidence(c: Candidate): Priority {
  if (CRITICAL_RELEVANCE.has(c.valuation_relevance || '')) return 'high';
  return 'medium';
}

function priorityForAddBack(amount: number | null): Priority {
  if (amount != null && Math.abs(amount) >= 50000) return 'high';
  return 'medium';
}

function priorityForStale(c: Candidate): Priority {
  if (CRITICAL_RELEVANCE.has(c.valuation_relevance || '')) return 'high';
  return 'low';
}

/**
 * Build the unified verification queue from intelligence + publication blockers.
 * Pure: no I/O, no persistence. The backend merges persisted overlay state.
 */
export function buildVerificationQueue(
  intelligence: IntelligenceResult,
  valuationId: string,
  businessId: string | undefined,
  publicationBlockers: PublicationBlocker[] = [],
): VerificationQueueResult {
  const items: VerificationItem[] = [];
  const seenKeys = new Set<string>();
  const add = (item: VerificationItem) => {
    if (seenKeys.has(item.dedup_key)) return;
    seenKeys.add(item.dedup_key);
    items.push(item);
  };

  // ── Conflicts → conflicting_value ──────────────────────────────────────
  for (const c of intelligence.candidates) {
    if (c.conflict_status !== 'material') continue;
    const rel = relevanceFlags(c);
    add({
      dedup_key: `conflicting_value:${c.field_key}`,
      item_type: 'conflicting_value',
      field_key: c.field_key,
      question_key: c.questionnaire_key,
      title: `Resolve conflict: ${c.display_name}`,
      description: `Material disagreement between ${c.source_name} and alternative source${c.alternative_values.length > 1 ? 's' : ''} for ${c.display_name}.`,
      category: c.category,
      priority: priorityForConflict(c),
      severity: 'material',
      suggested_value: c.suggested_value,
      formatted_value: c.formatted_value,
      alternative_values: c.alternative_values,
      source_type: c.source_type,
      source_id: c.source_id,
      source_name: c.source_name,
      reporting_period: c.reporting_period,
      confidence_score: c.confidence_score,
      conflict_status: 'material',
      valuation_impact: c.valuation_relevance,
      ...rel,
      advisor_action_required: true,
      client_action_required: false,
      evidence_available: c.alternative_values.length > 0,
      evidence_count: c.alternative_values.length,
      recommended_action: c.recommended_action,
      default_status: 'open',
    });
  }

  // ── Missing required fields → missing_required_field ──────────────────
  for (const c of intelligence.candidates) {
    if (c.suggested_value != null) continue;
    // Skip if already surfaced as conflict
    if (seenKeys.has(`conflicting_value:${c.field_key}`)) continue;
    const rel = relevanceFlags(c);
    add({
      dedup_key: `missing_required_field:${c.field_key}`,
      item_type: 'missing_required_field',
      field_key: c.field_key,
      question_key: c.questionnaire_key,
      title: `Missing: ${c.display_name}`,
      description: `No source provided ${c.display_name}. ${c.recommended_action}`,
      category: c.category,
      priority: priorityForMissing(c),
      valuation_impact: c.valuation_relevance,
      ...rel,
      advisor_action_required: true,
      client_action_required: false,
      evidence_available: false,
      evidence_count: 0,
      recommended_action: c.recommended_action,
      default_status: 'open',
    });
  }

  // ── Low confidence → low_confidence_value ────────────────────────────
  for (const c of intelligence.candidates) {
    if (c.confidence_level !== 'low' || c.suggested_value == null) continue;
    if (seenKeys.has(`conflicting_value:${c.field_key}`)) continue;
    const rel = relevanceFlags(c);
    add({
      dedup_key: `low_confidence_value:${c.field_key}`,
      item_type: 'low_confidence_value',
      field_key: c.field_key,
      question_key: c.questionnaire_key,
      title: `Verify: ${c.display_name}`,
      description: `Low confidence value from ${c.source_name}. Advisor verification recommended.`,
      category: c.category,
      priority: priorityForLowConfidence(c),
      suggested_value: c.suggested_value,
      formatted_value: c.formatted_value,
      source_type: c.source_type,
      source_id: c.source_id,
      source_name: c.source_name,
      reporting_period: c.reporting_period,
      confidence_score: c.confidence_score,
      valuation_impact: c.valuation_relevance,
      ...rel,
      advisor_action_required: true,
      client_action_required: false,
      evidence_available: true,
      evidence_count: 1,
      recommended_action: c.recommended_action,
      default_status: 'open',
    });
  }

  // ── Stale → stale_value ───────────────────────────────────────────────
  for (const c of intelligence.candidates) {
    if (!c.stale || c.suggested_value == null) continue;
    if (seenKeys.has(`conflicting_value:${c.field_key}`)) continue;
    const rel = relevanceFlags(c);
    add({
      dedup_key: `stale_value:${c.field_key}`,
      item_type: 'stale_value',
      field_key: c.field_key,
      question_key: c.questionnaire_key,
      title: `Stale: ${c.display_name}`,
      description: `Source data older than 18 months. May not reflect current conditions.`,
      category: c.category,
      priority: priorityForStale(c),
      suggested_value: c.suggested_value,
      formatted_value: c.formatted_value,
      source_type: c.source_type,
      source_name: c.source_name,
      reporting_period: c.reporting_period,
      confidence_score: c.confidence_score,
      valuation_impact: c.valuation_relevance,
      ...rel,
      advisor_action_required: true,
      client_action_required: false,
      evidence_available: true,
      evidence_count: 1,
      recommended_action: 'Refresh source data or confirm still current',
      default_status: 'open',
    });
  }

  // ── Add-back candidates → proposed_add_back ──────────────────────────
  for (const ab of intelligence.addBackCandidates) {
    add({
      dedup_key: `proposed_add_back:${ab.category}:${ab.period || ''}`,
      item_type: 'proposed_add_back',
      title: `Review add-back: ${ab.label}`,
      description: ab.description,
      category: ab.category,
      priority: priorityForAddBack(ab.amount),
      suggested_value: ab.amount,
      formatted_value: ab.amount != null ? ab.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—',
      source_name: ab.source,
      reporting_period: ab.period,
      confidence_score: ab.confidence,
      financial_impact: ab.amount != null ? `${ab.label} adjustment` : undefined,
      valuation_impact: 'profitability',
      profitability_relevance: true,
      multiple_relevance: true,
      advisor_action_required: true,
      client_action_required: false,
      evidence_available: true,
      evidence_count: 1,
      recommended_action: ab.advisor_action,
      default_status: 'open',
    });
  }

  // ── Questionnaire reduction → advisor_judgment / client_confirmation ─
  for (const q of intelligence.questionnaireReduction) {
    if (q.status === 'advisor_judgment') {
      add({
        dedup_key: `advisor_judgment:${q.question_key}`,
        item_type: 'advisor_judgment',
        question_key: q.question_key,
        title: `Advisor judgment: ${q.question_text?.slice(0, 80) || q.question_key}`,
        description: `Question requires advisor judgment — no high-confidence source available.`,
        category: q.section,
        priority: 'medium',
        confidence_score: q.confidence,
        advisor_action_required: true,
        client_action_required: false,
        evidence_available: q.confidence > 0,
        evidence_count: q.confidence > 0 ? 1 : 0,
        recommended_action: 'Provide advisor answer',
        default_status: 'open',
      });
    } else if (q.status === 'auto_client_review') {
      add({
        dedup_key: `client_confirmation:${q.question_key}`,
        item_type: 'client_confirmation',
        question_key: q.question_key,
        title: `Confirm with client: ${q.question_text?.slice(0, 80) || q.question_key}`,
        description: `High-confidence candidate available — client confirmation recommended.`,
        category: q.section,
        priority: 'medium',
        suggested_value: q.candidate_value,
        confidence_score: q.confidence,
        advisor_action_required: false,
        client_action_required: true,
        evidence_available: true,
        evidence_count: 1,
        recommended_action: 'Request client confirmation',
        default_status: 'open',
      });
    }
  }

  // ── Missing documents → missing_document ─────────────────────────────
  for (const doc of intelligence.documentIntelligence) {
    if (doc.present) continue;
    // Only surface missing documents for categories that matter for valuation
    const criticalDocs = ['profit_loss', 'balance_sheet', 'tax_return'];
    if (!criticalDocs.includes(doc.key)) continue;
    add({
      dedup_key: `missing_document:${doc.key}`,
      item_type: 'missing_document',
      title: `Missing document: ${doc.label}`,
      description: `No ${doc.label.toLowerCase()} on file. Required for financial normalization.`,
      category: 'Documents',
      priority: doc.key === 'profit_loss' ? 'high' : 'medium',
      advisor_action_required: true,
      client_action_required: true,
      evidence_available: false,
      evidence_count: 0,
      recommended_action: 'Request document from client',
      default_status: 'open',
    });
  }

  // ── Publication blockers → publication_blocker ────────────────────────
  for (const blocker of publicationBlockers) {
    add({
      dedup_key: `publication_blocker:${blocker.key}`,
      item_type: 'publication_blocker',
      title: blocker.title,
      description: blocker.detail,
      category: 'Publication',
      priority: 'critical',
      severity: 'blocker',
      advisor_action_required: true,
      client_action_required: false,
      evidence_available: false,
      evidence_count: 0,
      recommended_action: blocker.detail,
      default_status: 'open',
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const open = items.filter((i) => i.default_status === 'open');
  const summary: QueueSummary = {
    total_open: open.length,
    critical: open.filter((i) => i.priority === 'critical').length,
    high: open.filter((i) => i.priority === 'high').length,
    medium: open.filter((i) => i.priority === 'medium').length,
    low: open.filter((i) => i.priority === 'low').length,
    waiting_on_client: open.filter((i) => i.client_action_required && !i.advisor_action_required).length,
    waiting_on_advisor: open.filter((i) => i.advisor_action_required).length,
    deferred: 0,
    resolved_today: 0,
    publication_blockers: open.filter((i) => i.item_type === 'publication_blocker').length,
  };

  // ── Recommended next action ──────────────────────────────────────────
  const recommended = buildRecommendedAction(open);

  return { items, summary, recommendedAction: recommended };
}

function buildRecommendedAction(openItems: VerificationItem[]): RecommendedQueueAction {
  if (openItems.length === 0) {
    return {
      title: 'Verification complete',
      detail: 'No open items remaining. Proceed to the Valuation workspace.',
      priority: 'low',
      action_type: 'proceed',
    };
  }
  const ranked = [...openItems].sort((a, b) => rankPriority(b.priority) - rankPriority(a.priority));
  const top = ranked[0];
  const count = ranked.filter((i) => i.item_type === top.item_type && i.priority === top.priority).length;
  return {
    title: count > 1 ? `${top.title} (${count} items)` : top.title,
    detail: top.recommended_action,
    priority: top.priority,
    action_type: top.item_type,
  };
}

function rankPriority(p: Priority): number {
  return p === 'critical' ? 4 : p === 'high' ? 3 : p === 'medium' ? 2 : 1;
}

/**
 * Filter + sort items for display. Pure.
 */
export function filterAndSortItems(
  items: VerificationItem[],
  filter: string,
  sort: string,
  search: string,
): VerificationItem[] {
  let filtered = items;
  if (filter === 'critical') filtered = filtered.filter((i) => i.priority === 'critical');
  else if (filter === 'conflicts') filtered = filtered.filter((i) => i.item_type === 'conflicting_value' || i.item_type === 'assessment_conflict');
  else if (filter === 'low_confidence') filtered = filtered.filter((i) => i.item_type === 'low_confidence_value');
  else if (filter === 'documents') filtered = filtered.filter((i) => i.item_type === 'missing_document' || i.item_type === 'document_mapping_review');
  else if (filter === 'adjustments') filtered = filtered.filter((i) => i.item_type === 'proposed_add_back' || i.item_type === 'proposed_deduction');
  else if (filter === 'client_input') filtered = filtered.filter((i) => i.client_action_required);
  else if (filter === 'advisor_judgment') filtered = filtered.filter((i) => i.item_type === 'advisor_judgment' || i.item_type === 'methodology_decision');
  else if (filter === 'publication_blockers') filtered = filtered.filter((i) => i.item_type === 'publication_blocker');

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      (i.field_key || '').toLowerCase().includes(q),
    );
  }

  const sorted = [...filtered];
  switch (sort) {
    case 'priority':
      sorted.sort((a, b) => rankPriority(b.priority) - rankPriority(a.priority));
      break;
    case 'confidence':
      sorted.sort((a, b) => (a.confidence_score || 0) - (b.confidence_score || 0));
      break;
    case 'valuation_impact':
      sorted.sort((a, b) => impactRank(b.valuation_impact) - impactRank(a.valuation_impact));
      break;
    case 'newest':
      sorted.reverse();
      break;
    case 'oldest':
    default:
      break;
  }
  return sorted;
}

function impactRank(impact?: string): number {
  if (!impact) return 0;
  if (impact === 'enterprise_value') return 5;
  if (impact === 'profitability') return 4;
  if (impact === 'market_multiple') return 3;
  if (impact === 'growth') return 2;
  if (impact === 'risk' || impact === 'transferability') return 1;
  return 0;
}