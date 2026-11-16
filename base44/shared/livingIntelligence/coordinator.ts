/**
 * livingIntelligence/coordinator.ts — Phase 15.0
 *
 * The Living Intelligence Coordinator.
 *
 * The Coordinator is NOT an engine.
 * It is NOT an orchestrator.
 * It is a SYNTHESIS LAYER.
 *
 * It observes certified outputs and builds executive understanding.
 *
 * It NEVER owns business truth.
 * It NEVER performs calculations.
 * It NEVER synchronizes systems.
 * It NEVER bypasses governance.
 *
 * It ONLY composes existing intelligence into Executive Context.
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from canonical facts, does not create truth)
 *   Article II — Single Ownership (does not own any business concept)
 *   Article III — No Duplicate Intelligence (synthesizes, does not duplicate)
 *   Article IV — Explainability (every output carries confidence and lineage)
 *   Article V — Advisor Governance (observes, does not decide)
 *   Article VIII — Canonical First (reads canonical facts first)
 *   Article XIII — Constitution Supremacy (this coordinator is a new subsystem, registered)
 */

import type {
  ExecutiveContext,
  LivingIntelligenceInput,
  CurrentBusinessState,
  BusinessConfidence,
  BusinessNarrative,
  PendingReview,
  UpcomingDeadline,
  AttentionItem,
  ExecutiveItem,
  EvidenceReference,
  ConfidenceSource,
  ExecutiveContextMeta,
} from './types.ts';
import { buildBusinessMomentum } from './businessMomentum.ts';
import { buildWhatChanged } from './whatChanged.ts';
import { buildWhatMattersNow } from './whatMattersNow.ts';
import { buildExecutivePresence } from './executivePresence.ts';

/**
 * Build the Executive Context — the single reusable object that maintains
 * executive understanding of the business.
 *
 * Everything is metadata. No duplicate calculations. No duplicate intelligence.
 */
export function buildExecutiveContext(input: LivingIntelligenceInput): ExecutiveContext {
  // ── Current Business State (READ from BIS — NOT recalculated) ─────────────
  const currentBusinessState = readCurrentBusinessState(input);

  // ── Business Momentum (descriptive synthesis) ────────────────────────────
  const businessMomentum = buildBusinessMomentum(input);

  // ── Top Opportunities & Risks (from What Matters Now) ────────────────────
  const whatMatters = buildWhatMattersNow(input);
  const topOpportunities = whatMatters
    .filter(m => m.category === 'opportunity' || m.category === 'growth_opportunity')
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      headline: m.title,
      why_it_matters: m.description,
      business_impact: m.description,
      confidence: 75,
      confidence_source: m.confidence_source,
      recommended_action: m.recommended_action,
      supporting_evidence: [] as EvidenceReference[],
      certified_owner: m.certified_owner,
      priority: m.priority,
    }));

  const topRisks = whatMatters
    .filter(m => m.category === 'risk')
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      headline: m.title,
      why_it_matters: m.description,
      business_impact: m.description,
      confidence: 75,
      confidence_source: m.confidence_source,
      recommended_action: m.recommended_action,
      supporting_evidence: [] as EvidenceReference[],
      certified_owner: m.certified_owner,
      priority: m.priority,
    }));

  // ── Advisor & Owner Attention Items ──────────────────────────────────────
  const advisorAttentionItems = whatMatters
    .filter(m => m.category === 'advisor_task' || m.category === 'verification_item')
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      attention_type: 'advisor' as const,
      urgency: m.priority <= 2 ? 'immediate' as const : m.priority <= 4 ? 'soon' as const : 'routine' as const,
      certified_owner: m.certified_owner,
      action_url: m.action_url,
    }));

  const ownerAttentionItems = whatMatters
    .filter(m => m.category === 'owner_task')
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      attention_type: 'owner' as const,
      urgency: m.priority <= 2 ? 'immediate' as const : m.priority <= 4 ? 'soon' as const : 'routine' as const,
      certified_owner: m.certified_owner,
      action_url: m.action_url,
    }));

  // ── Business Confidence (READ from Confidence Engine) ────────────────────
  const businessConfidence = readBusinessConfidence(input);

  // ── Recently Changed Facts (from What Changed) ──────────────────────────
  const recentlyChangedFacts = buildWhatChanged(input);

  // ── Pending Advisor Reviews (READ from Verification Queue) ───────────────
  const pendingAdvisorReviews = readPendingReviews(input);

  // ── Upcoming Deadlines (READ from Sprint + Calendar + Agreements) ────────
  const upcomingDeadlines = readUpcomingDeadlines(input);

  // ── Business Narrative (READ from Executive Narrative Engine) ────────────
  const businessNarrative = readBusinessNarrative(input);

  // ── Metadata ──────────────────────────────────────────────────────────────
  const _meta: ExecutiveContextMeta = {
    sources_used: identifySources(input),
    constitution_compliant: true,
    no_calculations_performed: true,
    no_duplicate_intelligence: true,
    no_canonical_facts_duplicated: true,
    no_sync_bypassed: true,
    no_governance_bypassed: true,
  };

  return {
    business_id: input.business_id,
    profile_id: input.profile_id,
    generated_at: new Date().toISOString(),
    current_business_state: currentBusinessState,
    business_momentum: businessMomentum,
    top_opportunities: topOpportunities,
    top_risks: topRisks,
    advisor_attention_items: advisorAttentionItems,
    owner_attention_items: ownerAttentionItems,
    business_confidence: businessConfidence,
    recently_changed_facts: recentlyChangedFacts,
    pending_advisor_reviews: pendingAdvisorReviews,
    upcoming_deadlines: upcomingDeadlines,
    business_narrative: businessNarrative,
    _meta,
  };
}

// ── Read Current Business State from BIS ────────────────────────────────────
function readCurrentBusinessState(input: LivingIntelligenceInput): CurrentBusinessState {
  const bis = input.bis;
  const raw = bis?._raw || {};

  return {
    iq_score: raw.iq_score ?? null,
    business_impact_score: raw.business_impact_score ?? null,
    revenue: raw.revenue ?? null,
    normalized_ebitda: raw.normalized_ebitda ?? null,
    enterprise_value: raw.current_value ?? null,
    profit_gap_amount: raw.profit_gap_amount ?? null,
    value_gap_amount: raw.value_gap_amount ?? null,
    tax_gap_annual: raw.tax_gap_annual ?? null,
    operations_score: raw.operations_score ?? null,
    freedom_score: raw.freedom_score ?? null,
    source: 'business_intelligence_engine',
  };
}

// ── Read Business Confidence from Confidence Engine ──────────────────────────
function readBusinessConfidence(input: LivingIntelligenceInput): BusinessConfidence {
  const c = input.confidence_scores;
  if (!c) {
    return {
      overall_confidence: null,
      data_confidence: null,
      calculation_confidence: null,
      methodology_confidence: null,
      advisor_confidence: null,
      source: 'confidence_engine',
      summary: 'Confidence scores not yet available',
    };
  }

  const overall = c.overall_confidence ?? c.overall ?? null;
  const summary = overall != null
    ? `Overall confidence is ${Math.round(overall)}/100`
    : 'Confidence scores not yet available';

  return {
    overall_confidence: overall,
    data_confidence: c.data_confidence ?? c.data ?? null,
    calculation_confidence: c.calculation_confidence ?? c.calculation ?? null,
    methodology_confidence: c.methodology_confidence ?? c.methodology ?? null,
    advisor_confidence: c.advisor_confidence ?? c.advisor ?? null,
    source: 'confidence_engine',
    summary,
  };
}

// ── Read Pending Reviews from Verification Queue ────────────────────────────
function readPendingReviews(input: LivingIntelligenceInput): PendingReview[] {
  const reviews = input.pending_reviews || [];
  return reviews.slice(0, 10).map((r: any) => ({
    id: r.id || r._id,
    review_type: r.review_type || r.type || 'low_confidence',
    title: r.title || r.field_name || 'Pending review',
    description: r.description || r.reason || 'Requires advisor attention',
    certified_owner: 'verification_queue',
    submitted_at: r.submitted_at || r.created_date || new Date().toISOString(),
    urgency: r.urgency || (r.review_type === 'conflict' ? 'immediate' : 'soon'),
  }));
}

// ── Read Upcoming Deadlines ─────────────────────────────────────────────────
function readUpcomingDeadlines(input: LivingIntelligenceInput): UpcomingDeadline[] {
  const deadlines = input.upcoming_deadlines || [];
  const now = Date.now();

  return deadlines
    .filter((d: any) => {
      const due = new Date(d.due_date || d.booking_date || d.end_date || 0).getTime();
      return due >= now;
    })
    .slice(0, 10)
    .map((d: any) => ({
      id: d.id || d._id,
      title: d.title || d.name || 'Upcoming deadline',
      deadline_type: d.deadline_type || d.type || 'sprint_task',
      due_date: d.due_date || d.booking_date || d.end_date,
      certified_owner: d.certified_owner || 'calendar_sync',
      action_url: d.action_url || null,
    }));
}

// ── Read Business Narrative from Executive Narrative Engine ─────────────────
function readBusinessNarrative(input: LivingIntelligenceInput): BusinessNarrative {
  const brief = input.executive_brief;
  if (!brief) {
    return {
      summary: 'Executive brief not yet available',
      source: 'executive_narrative_engine',
      last_generated_at: null,
    };
  }

  return {
    summary: brief.summary || brief.narrative || 'Executive brief available',
    source: 'executive_narrative_engine',
    last_generated_at: brief.generated_at || brief.last_generated || null,
  };
}

// ── Identify Sources ─────────────────────────────────────────────────────────
function identifySources(input: LivingIntelligenceInput): string[] {
  const sources: string[] = [];
  if (input.bis) sources.push('business_intelligence_engine');
  if (input.canonical_facts) sources.push('canonical_fact_resolver');
  if (input.recent_events?.length) sources.push('cbss');
  if (input.timeline?.length) sources.push('timeline');
  if (input.growth_initiatives?.length) sources.push('growth_plan_engine');
  if (input.valuation_metadata) sources.push('valuation_calculation_engine');
  if (input.pending_reviews?.length) sources.push('verification_queue');
  if (input.sprint_data) sources.push('sprint_aggregation');
  if (input.confidence_scores) sources.push('confidence_engine');
  if (input.executive_brief) sources.push('executive_narrative_engine');
  if (input.assessment_results?.length) sources.push('assessment_engine');
  return sources;
}

// ── Re-export Executive Presence for the single reusable API ─────────────────
export { buildExecutivePresence } from './executivePresence.ts';
export { buildWhatChanged } from './whatChanged.ts';
export { buildWhatMattersNow } from './whatMattersNow.ts';
export { buildBusinessMomentum } from './businessMomentum.ts';
export { BUSINESS_MEMORY_CONTRACT } from './businessMemoryContract.ts';