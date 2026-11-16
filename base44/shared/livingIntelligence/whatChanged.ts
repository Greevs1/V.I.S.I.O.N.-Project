/**
 * livingIntelligence/whatChanged.ts — Phase 15.0
 *
 * The "What Changed?" Model.
 *
 * Every meaningful business change answers:
 *   • What changed?
 *   • Why did it change?
 *   • What caused it?
 *   • What depends on it?
 *   • What should happen next?
 *   • Who should care?
 *   • Can it wait?
 *
 * Reuses:
 *   • Business Timeline (base44/shared/businessStateSync/timeline.ts)
 *   • CBSS (base44/shared/businessStateSync/)
 *   • IDO (base44/shared/livingIntelligence/ — blueprint)
 *   • Canonical Facts (base44/shared/canonicalFact/)
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from canonical facts, does not create truth)
 *   Article III — No Duplicate Intelligence (reads from timeline, does not duplicate)
 *   Article IV — Explainability (every change is explainable)
 *   Article VIII — Canonical First (reads canonical facts)
 */

import type { WhatChangedItem, LivingIntelligenceInput, ConfidenceSource } from './types.ts';

/**
 * Build "What Changed" items from recent business state events.
 *
 * This function SYNTHESIZES from CBSS events and timeline — it does NOT
 * create new events or duplicate timeline data.
 */
export function buildWhatChanged(input: LivingIntelligenceInput): WhatChangedItem[] {
  const items: WhatChangedItem[] = [];

  // ── From CBSS / Timeline events ──────────────────────────────────────────
  const events = input.recent_events || [];
  const timeline = input.timeline || [];

  // Process recent canonical fact changes from CBSS events
  for (const event of events) {
    const item = synthesizeWhatChangedFromEvent(event, input);
    if (item) items.push(item);
  }

  // Process timeline entries (if not already covered by events)
  for (const entry of timeline) {
    const item = synthesizeWhatChangedFromTimeline(entry, input);
    if (item && !items.some(i => i.source_timeline_id === entry.id)) {
      items.push(item);
    }
  }

  // Sort by timestamp (most recent first)
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Limit to most meaningful 10 changes
  return items.slice(0, 10);
}

// ── Synthesize from CBSS Event ────────────────────────────────────────────────
function synthesizeWhatChangedFromEvent(
  event: any,
  input: LivingIntelligenceInput,
): WhatChangedItem | null {
  if (!event) return null;

  const factKey = event.fact_key || event.canonical_fact_id || 'unknown';
  const previousValue = event.previous_value;
  const newValue = event.new_value;
  const reason = event.reason || 'Business state update';
  const timestamp = event.timestamp || new Date().toISOString();

  // Determine what depends on this fact (from canonical fact registry)
  const dependents = getDependentFacts(factKey);

  // Determine who should care
  const whoShouldCare = determineWhoShouldCare(factKey, event);

  // Determine urgency
  const canItWait = determineUrgency(factKey, event, dependents);

  // Determine confidence source
  const confidenceSource = determineConfidenceSource(event);

  return {
    id: `changed_${event.id || factKey}_${timestamp}`,
    what_changed: formatWhatChanged(factKey, previousValue, newValue),
    why_it_changed: reason,
    what_caused_it: determineCause(event, input),
    what_depends_on_it: dependents,
    what_should_happen_next: determineNextAction(factKey, event, dependents),
    who_should_care: whoShouldCare,
    can_it_wait: canItWait,
    confidence_source: confidenceSource,
    timestamp,
    source_event_id: event.id || null,
    source_timeline_id: null,
    certified_owner: 'cbss',
  };
}

// ── Synthesize from Timeline Entry ────────────────────────────────────────────
function synthesizeWhatChangedFromTimeline(
  entry: any,
  _input: LivingIntelligenceInput,
): WhatChangedItem | null {
  if (!entry) return null;

  const factKey = entry.fact_key || 'business_state';
  const timestamp = entry.timestamp || entry.created_date || new Date().toISOString();

  return {
    id: `changed_timeline_${entry.id || timestamp}`,
    what_changed: entry.description || entry.title || `${factKey} updated`,
    why_it_changed: entry.reason || entry.trigger || 'Business state change',
    what_caused_it: entry.source || entry.triggered_by || 'System update',
    what_depends_on_it: getDependentFacts(factKey),
    what_should_happen_next: 'Review the change and assess impact',
    who_should_care: 'both',
    can_it_wait: 'routine',
    confidence_source: 'business_intelligence_synthesis' as ConfidenceSource,
    timestamp,
    source_event_id: null,
    source_timeline_id: entry.id || null,
    certified_owner: 'timeline',
  };
}

// ── Helper: Dependent Facts ───────────────────────────────────────────────────
function getDependentFacts(factKey: string): string[] {
  // Known dependencies (from Canonical Fact Registry + Derived Fact Framework)
  const dependencies: Record<string, string[]> = {
    revenue: ['gross_margin', 'ebitda', 'enterprise_value', 'profit_gap_amount', 'value_gap_amount'],
    net_income: ['ebitda', 'normalized_ebitda', 'enterprise_value'],
    cash: ['equity_value', 'enterprise_value'],
    debt: ['equity_value', 'enterprise_value'],
    ebitda: ['normalized_ebitda', 'enterprise_value', 'value_gap_amount'],
    normalized_ebitda: ['enterprise_value', 'equity_value'],
    enterprise_value: ['equity_value', 'value_gap_amount'],
    add_backs: ['normalized_ebitda', 'enterprise_value'],
    owner_compensation: ['normalized_ebitda', 'enterprise_value'],
  };
  return dependencies[factKey] || [];
}

// ── Helper: Who Should Care ───────────────────────────────────────────────────
function determineWhoShouldCare(
  factKey: string,
  event: any,
): 'advisor' | 'owner' | 'both' {
  // Valuation-related changes → advisor
  if (['enterprise_value', 'equity_value', 'normalized_ebitda', 'valuation_multiple'].includes(factKey)) {
    return 'advisor';
  }
  // Assessment-related changes → both
  if (['profit_gap_amount', 'value_gap_amount', 'tax_gap_annual'].includes(factKey)) {
    return 'both';
  }
  // Cash/debt changes → both
  if (['cash', 'debt'].includes(factKey)) {
    return 'both';
  }
  // Default
  return 'both';
}

// ── Helper: Urgency ───────────────────────────────────────────────────────────
function determineUrgency(
  factKey: string,
  event: any,
  dependents: string[],
): 'immediate' | 'soon' | 'routine' {
  // Conflicts → immediate
  if (event.conflict_status === 'conflicting' || event.verification_status === 'conflicting') {
    return 'immediate';
  }
  // Low confidence → soon
  if (event.new_confidence != null && event.new_confidence < 65) {
    return 'soon';
  }
  // High-impact dependents → soon
  if (dependents.includes('enterprise_value')) {
    return 'soon';
  }
  return 'routine';
}

// ── Helper: Confidence Source ─────────────────────────────────────────────────
function determineConfidenceSource(event: any): ConfidenceSource {
  if (event.verification_status === 'verified' || event.advisor_approved === true) {
    return 'verified_canonical_fact' as ConfidenceSource;
  }
  if (event.confidence >= 85) {
    return 'certified_derived_fact' as ConfidenceSource;
  }
  if (event.confidence >= 65) {
    return 'certified_engine_output' as ConfidenceSource;
  }
  return 'business_intelligence_synthesis' as ConfidenceSource;
}

// ── Helper: Format What Changed ───────────────────────────────────────────────
function formatWhatChanged(factKey: string, previous: any, current: any): string {
  const display = factKey.replace(/_/g, ' ');
  if (previous != null && current != null) {
    return `${display} changed from ${formatValue(previous)} to ${formatValue(current)}`;
  }
  if (current != null) {
    return `${display} updated to ${formatValue(current)}`;
  }
  return `${display} changed`;
}

function formatValue(value: any): string {
  if (typeof value === 'number') {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `${value}`;
  }
  return String(value);
}

// ── Helper: Determine Cause ──────────────────────────────────────────────────
// User-friendly language — no technical terms
function determineCause(event: any, input: LivingIntelligenceInput): string {
  // Translate technical reason codes to user-friendly language
  const reasonMap: Record<string, string> = {
    document_extraction_approved: 'Your financial documents were reviewed',
    assessment_completed: 'An assessment was completed',
    advisor_override: 'Your advisor updated this value',
    advisor_entry: 'Your advisor entered this value',
    calculation_complete: 'A calculation was completed',
    conflict_resolved: 'A discrepancy was resolved',
    financial_uploaded: 'New financial documents were uploaded',
    extraction_completed: 'Document analysis was completed',
  };

  const reason = event.reason || event.trigger || '';
  if (reason && reasonMap[reason]) return reasonMap[reason];
  if (reason && !reason.includes('_')) return reason; // Already user-friendly

  if (event.source_type === 'document_extraction') return 'Your financial documents were reviewed';
  if (event.source_type === 'assessment_answer') return 'An assessment was completed';
  if (event.source_type === 'advisor_entry') return 'Your advisor updated this value';
  return 'Your business records were updated';
}

// ── Helper: Next Action ────────────────────────────────────────────────────────
// User-friendly language — no "Verification Queue", "recalculation", or technical terms
function determineNextAction(
  factKey: string,
  event: any,
  dependents: string[],
): string {
  if (event.conflict_status === 'conflicting') {
    return 'Your advisor may want to review this discrepancy';
  }
  if (event.verification_status === 'needs_review') {
    return 'Your advisor may want to confirm this update';
  }
  if (dependents.includes('enterprise_value')) {
    return 'Your advisor may want to review your valuation';
  }
  if (dependents.includes('profit_gap_amount')) {
    return 'Your profit assessment may benefit from a refresh';
  }
  return "We're tracking the impact on your other metrics";
}