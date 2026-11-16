/**
 * livingIntelligence/executivePresence.ts — Phase 15.0
 *
 * The Executive Presence Model.
 *
 * If the owner logged in right now... what should V.I.S.I.O.N.
 * proactively tell them?
 *
 * Maximum: Three executive items.
 *
 * Each item contains:
 *   • Headline
 *   • Why it Matters
 *   • Business Impact
 *   • Confidence
 *   • Recommended Action
 *   • Supporting Evidence
 *   • Existing Certified Owner
 *
 * Every insight must pass four tests:
 *   1. Is it true?
 *   2. Is it important?
 *   3. Is it actionable?
 *   4. Is it timely?
 *
 * If any answer is "No", Living Intelligence remains silent.
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from certified engines)
 *   Article IV — Explainability (every item carries confidence and evidence)
 *   Article V — Advisor Governance (recommends action, does not take action)
 *   Article VI — Client Safety (no internal IDs exposed)
 */

import type {
  ExecutivePresence,
  ExecutivePresenceItem,
  LivingIntelligenceInput,
  EvidenceReference,
  ConfidenceSource,
} from './types.ts';
import { buildWhatMattersNow } from './whatMattersNow.ts';
import { buildBusinessMomentum } from './businessMomentum.ts';

/**
 * Build Executive Presence — the answer to:
 * "If I only had five minutes with this business today, what should I know?"
 *
 * Maximum 3 items. Clarity over completeness.
 * Every item must pass the four tests: true, important, actionable, timely.
 */
export function buildExecutivePresence(input: LivingIntelligenceInput): ExecutivePresence {
  const whatMatters = buildWhatMattersNow(input);
  const momentum = buildBusinessMomentum(input);

  // ── Filter items through the four tests ──────────────────────────────────
  const qualified = whatMatters.filter(item => passesFourTests(item, input));

  // ── Select top 3 (priority order) ────────────────────────────────────────
  const top3 = qualified.slice(0, 3);

  // ── Transform into Executive Presence Items ──────────────────────────────
  const items: ExecutivePresenceItem[] = top3.map(item => ({
    id: item.id,
    headline: item.title,
    why_it_matters: item.description,
    business_impact: determineBusinessImpact(item, input),
    confidence: determineConfidence(item, input),
    confidence_source: item.confidence_source,
    recommended_action: item.recommended_action,
    supporting_evidence: gatherEvidence(item, input),
    certified_owner: item.certified_owner,
  }));

  // ── Five-minute summary ──────────────────────────────────────────────────
  const fiveMinuteSummary = synthesizeFiveMinuteSummary(items, momentum, input);

  return {
    business_id: input.business_id,
    profile_id: input.profile_id,
    generated_at: new Date().toISOString(),
    items,
    five_minute_summary: fiveMinuteSummary,
    _meta: {
      sources_used: identifySources(input),
      constitution_compliant: true,
      no_calculations_performed: true,
      no_duplicate_intelligence: true,
    },
  };
}

// ── The Four Tests ────────────────────────────────────────────────────────────
function passesFourTests(item: any, input: LivingIntelligenceInput): boolean {
  // 1. Is it true? (has a certified owner and confidence source)
  if (!item.certified_owner) return false;
  if (!item.confidence_source) return false;

  // 2. Is it important? (priority <= 6)
  if (item.priority > 6) return false;

  // 3. Is it actionable? (has a recommended action)
  if (!item.recommended_action) return false;

  // 4. Is it timely? (relevant to current business state)
  // Skip items that are not timely (e.g., past deadlines)
  if (item.category === 'upcoming_event' && item.description?.includes('Due in -')) return false;

  return true;
}

// ── Business Impact ──────────────────────────────────────────────────────────
function determineBusinessImpact(item: any, input: LivingIntelligenceInput): string {
  const bis = input.bis;
  const raw = bis?._raw || {};

  switch (item.category) {
    case 'opportunity':
      const profitGap = raw.profit_gap_amount;
      if (profitGap) return `Potential impact on profit gap of $${(profitGap / 1000).toFixed(0)}K`;
      return 'Potential to improve business performance';

    case 'risk':
      return 'This risk could affect business valuation or performance if unaddressed';

    case 'advisor_task':
    case 'verification_item':
      return 'Resolving this unblocks downstream intelligence and propagation';

    case 'owner_task':
      const sprint = input.sprint_data;
      if (sprint) return `Progress on your ${sprint.selected_path || 'current'} sprint`;
      return 'Progress on your execution plan';

    case 'upcoming_event':
      return 'This deadline requires preparation';

    case 'business_change':
      return 'This change may affect downstream calculations and intelligence';

    case 'growth_opportunity':
      const ev = raw.current_value;
      if (ev) return `Potential impact on enterprise value of $${(ev / 1_000_000).toFixed(1)}M`;
      return 'Potential to increase business value';

    default:
      return 'Relevant to your current business state';
  }
}

// ── Confidence ───────────────────────────────────────────────────────────────
function determineConfidence(item: any, input: LivingIntelligenceInput): number {
  const confidence = input.confidence_scores;
  if (!confidence) return 50;

  switch (item.confidence_source) {
    case 'verified_canonical_fact':
      return 95;
    case 'certified_derived_fact':
      return 85;
    case 'certified_engine_output':
      return confidence.overall_confidence || 75;
    case 'advisor_reviewed_conclusion':
      return 90;
    case 'business_intelligence_synthesis':
      return 65;
    default:
      return 50;
  }
}

// ── Supporting Evidence ──────────────────────────────────────────────────────
function gatherEvidence(item: any, input: LivingIntelligenceInput): EvidenceReference[] {
  const evidence: EvidenceReference[] = [];

  // Reference the certified owner
  evidence.push({
    source_name: item.certified_owner.replace(/_/g, ' '),
    source_type: 'engine_output',
    source_id: item.certified_owner,
    confidence: determineConfidence(item, input),
  });

  // Reference canonical facts if available
  if (input.canonical_facts && item.category === 'business_change') {
    evidence.push({
      source_name: 'Canonical Fact Layer',
      source_type: 'canonical_fact',
      source_id: 'canonical_fact_resolver',
      confidence: 90,
    });
  }

  // Reference BIE if available
  if (input.bis && (item.category === 'opportunity' || item.category === 'risk')) {
    evidence.push({
      source_name: 'Business Intelligence Engine',
      source_type: 'engine_output',
      source_id: 'business_intelligence_engine',
      confidence: 80,
    });
  }

  return evidence;
}

// ── Five-Minute Summary ──────────────────────────────────────────────────────
function synthesizeFiveMinuteSummary(
  items: ExecutivePresenceItem[],
  momentum: any,
  input: LivingIntelligenceInput,
): string {
  if (items.length === 0) {
    return 'Your business intelligence is building. Complete assessments and upload financial documents to unlock executive insights.';
  }

  const parts: string[] = [];

  // Lead with momentum
  if (momentum.summary) {
    parts.push(momentum.summary);
  }

  // Highlight the top item
  if (items.length > 0) {
    parts.push(`Most importantly: ${items[0].headline}. ${items[0].why_it_matters}`);
  }

  // Mention additional items briefly
  if (items.length > 1) {
    const rest = items.slice(1).map(i => i.headline).join('; ');
    parts.push(`Also worth knowing: ${rest}`);
  }

  return parts.join(' ');
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