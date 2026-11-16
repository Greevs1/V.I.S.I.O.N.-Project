/**
 * galileoBieConsumer — Shared module for Phase 12C
 *
 * Canonical BIE recommendation builder + Strategy Library resolver + 
 * advisor override handler + supporting evidence builder.
 *
 * All Galileo backend functions import from this module to ensure they
 * consume canonical BIE recommendations — never independently generate,
 * score, rank, or invent business recommendations.
 *
 * BIE decides. Strategy Library enriches. Galileo explains.
 */

// ── BIE Recommendation Templates (mirrors src/lib/bie/engine.js SPRINT_RECOMMENDATIONS) ──
const SPRINT_RECOMMENDATIONS: Record<string, {
  label: string;
  target: string;
  priority: string;
  estimatedImpact: (v: any) => number;
  requiredMetrics: string[];
  requiredConfidence: string;
  category: string;
}> = {
  profit_gap_amount: {
    label: 'Close Profit Gap',
    target: '/assessments/profit-gap',
    priority: 'high',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['profit_gap_amount'],
    requiredConfidence: 'assessment_summary',
    category: 'profit',
  },
  value_gap_amount: {
    label: 'Close Value Gap',
    target: '/assessments/value-gap',
    priority: 'high',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['value_gap_amount'],
    requiredConfidence: 'assessment_summary',
    category: 'value',
  },
  tax_gap_annual: {
    label: 'Implement Tax Strategies',
    target: '/assessments/tax-gap',
    priority: 'high',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['tax_gap_annual'],
    requiredConfidence: 'assessment_summary',
    category: 'tax',
  },
  operations_score: {
    label: 'Improve Operations Health',
    target: '/assessments/operations-gap',
    priority: 'medium',
    estimatedImpact: () => 100000,
    requiredMetrics: ['operations_score'],
    requiredConfidence: 'assessment_summary',
    category: 'operations',
  },
  freedom_score: {
    label: 'Accelerate Freedom',
    target: '/assessments/freedom',
    priority: 'medium',
    estimatedImpact: () => 50000,
    requiredMetrics: ['freedom_score'],
    requiredConfidence: 'assessment_summary',
    category: 'freedom',
  },
  recast_valuation_increase: {
    label: 'Recast EBITDA',
    target: '/assessments/recast-ebitda',
    priority: 'medium',
    estimatedImpact: (v) => v || 0,
    requiredMetrics: ['recast_valuation_increase'],
    requiredConfidence: 'dashboard_metrics',
    category: 'value',
  },
};

const CONFIDENCE_SCORE: Record<string, number> = {
  user_entered: 90,
  assessment_summary: 80,
  dashboard_metrics: 60,
  snapshot: 50,
  derived: 40,
  none: 30,
};

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

// ── B1.1 — FAIL-CLOSED BUSINESS SCOPE ─────────────────────────────────────────
// Every read in this module is scoped to the ONE business the caller already
// resolved and authorized through the canonical contract (resolveActorBusinessContext
// / requireBusinessContext / resolveActiveBusiness). The business filter only
// narrows the read; it grants nothing — a client-supplied business_id reaches
// here only after that authorization has approved it. Advisor, team and expert
// access flow through that business authorization, and these records carry the
// business's own profile_id, so REPLACING the profile filter with the business
// filter preserves them (appending both would wrongly exclude them). Refusing a
// missing business keeps a future caller from silently regressing to
// profile-wide data.
function requireAuthorizedBusinessId(businessId: any, caller: string): void {
  if (typeof businessId !== 'string' || !businessId.trim() || businessId.trim() === 'null') {
    throw new Error(`${caller}: an authorized business_id is required — refusing to read profile-wide business data`);
  }
}

// ── Resolve raw metric values (mirrors BIE engine fallback chain) ────────────
function resolveRawValues(as: any, m: any, ls: any) {
  const revenue = as?.revenue || m?.revenue || null;
  const profit_gap_amount = as?.profit_gap_amount ?? m?.profit_gap?.gap_to_best ?? as?.profit_gap?.gap_to_best ?? null;
  const value_gap_amount = as?.value_gap_amount ?? m?.value_gap?.gap_amount ?? as?.value_gap?.gap_amount ?? null;
  const current_value = as?.current_business_value ?? m?.value_gap?.current_value ?? as?.value_gap_details?.current_value ?? null;
  const tax_gap_annual = as?.tax_gap_annual ?? m?.tax_gap?.annual_overpayment ?? null;
  const operations_score = as?.operations_score ?? m?.operations_gap?.health_score ?? as?.operations_gap_details?.score ?? null;
  const recast_add_backs = m?.recast_ebitda?.total_add_backs ?? as?.recast_ebitda_details?.add_backs ?? m?.recast_ebitda_gap?.add_backs ?? null;
  const recast_valuation_increase = m?.recast_ebitda?.valuation_increase ?? as?.recast_ebitda_details?.valuation_increase ?? m?.recast_ebitda_gap?.valuation_increase ?? null;
  const freedom_score = as?.freedom_score ?? m?.freedom_score ?? null;
  const iq_score = m?.ciq_score > 0 ? m.ciq_score : m?.overall_impact_score > 0 ? m.overall_impact_score : ls?.overall_impact_score > 0 ? Math.round(ls.overall_impact_score) : as?.derived_iq_score > 0 ? as.derived_iq_score : null;

  return {
    revenue, profit_gap_amount, value_gap_amount, current_value,
    tax_gap_annual, operations_score, recast_add_backs,
    recast_valuation_increase, freedom_score, iq_score,
  };
}

// ── Build canonical BIE recommendations from Supabase data ───────────────────
export async function fetchCanonicalRecommendations(sb: any, profileId: string, businessId: string) {
  // B1.1 — recommendations are computed from the authorized active business's
  // own metrics, assessments and snapshots only. Previously these reads were
  // profile-scoped, so a multi-business account's recommendations could be
  // computed from whichever sibling business's row was latest.
  requireAuthorizedBusinessId(businessId, 'fetchCanonicalRecommendations');
  const [dashRes, assessRes, snapRes] = await Promise.allSettled([
    sb.from('dashboard_metrics').select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('business_assessments').select('*').eq('business_id', businessId),
    sb.from('business_metric_snapshots').select('*').eq('business_id', businessId).order('snapshot_date', { ascending: false }).limit(10),
  ]);

  const m = dashRes.status === 'fulfilled' ? dashRes.value?.data : null;
  const assessments = assessRes.status === 'fulfilled' ? assessRes.value?.data || [] : [];
  const snapshots = snapRes.status === 'fulfilled' ? snapRes.value?.data || [] : [];
  const ls = snapshots?.[0] || null;

  // Build assessment summary by type
  const byType = assessments.reduce((acc: any, a: any) => { acc[a.assessment_type] = a; return acc; }, {});
  const as: any = {
    revenue: m?.revenue || byType.profit_gap?.estimated_opportunity_value ? null : null,
    profit_gap_amount: byType.profit_gap?.estimated_opportunity_value ?? null,
    value_gap_amount: byType.value_gap?.estimated_opportunity_value ?? null,
    tax_gap_annual: byType.tax_gap?.estimated_opportunity_value ?? null,
    operations_score: byType.operations_gap?.score ?? null,
    freedom_score: byType.freedom_assessment?.score ?? null,
    current_business_value: byType.value_gap?.current_business_value ?? null,
  };

  const raw = resolveRawValues(as, m, ls);
  const recommendations: any[] = [];

  for (const [key, template] of Object.entries(SPRINT_RECOMMENDATIONS)) {
    const value = (raw as any)[key];
    if (value == null || (typeof value === 'number' && value === 0 && key !== 'operations_score' && key !== 'freedom_score')) continue;

    const confidence = template.requiredConfidence;
    const confidenceNum = CONFIDENCE_SCORE[confidence] || 50;
    const estimatedImpact = template.estimatedImpact(value);

    recommendations.push({
      id: key,
      metricId: key,
      recommendation_key: key,
      title: template.label,
      summary: formatValue(key, value),
      category: template.category,
      priority: template.priority,
      estimatedImpact,
      confidence: confidenceNum,
      confidenceLevel: confidence,
      requiredMetrics: template.requiredMetrics,
      requiredConfidence: template.requiredConfidence,
      relatedAssessment: template.target,
      relatedSprint: { label: template.label, target: template.target },
      status: 'active',
      value,
      formatted: formatValue(key, value),
      businessId: businessId,
      profileId,
      canonicalVersion: 1,
    });
  }

  // Sort by priority (high > medium > low)
  recommendations.sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

  return { recommendations, raw, assessmentSummary: as, dashboardMetrics: m, latestSnapshot: ls };
}

function formatValue(key: string, value: any): string | null {
  if (value == null) return null;
  if (key === 'operations_score' || key === 'freedom_score') return `${Math.round(value)}/100`;
  if (key === 'tax_gap_annual') return `$${Math.round(value).toLocaleString('en-US')}/yr`;
  if (typeof value === 'number' && value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (typeof value === 'number') return `$${Math.round(value).toLocaleString('en-US')}`;
  return String(value);
}

// ── Resolve Strategy Library context for a recommendation ───────────────────
export async function resolveStrategyContext(
  sb: any,
  recommendationKey: string,
  businessId: string,
  profileId: string,
  userRole: string,
  membershipStatus: string,
) {
  const isAdvisor = ['super_admin', 'advisor', 'admin'].includes(userRole);
  const isPaid = membershipStatus === 'paid' || isAdvisor;

  try {
    // Query recommendation_strategy_mappings (may not exist yet — Phase 12B.2)
    const { data: mappings, error } = await sb.from('recommendation_strategy_mappings')
      .select(`
        recommendation_key, strategy_id, mapping_scope, match_status, applicability_notes,
        strategy_library:strategy_id (
          id, strategy_name, category, description, implementation_difficulty,
          implementation_days, confidence_score, active,
          desired_business_outcome, advisor_review_required, proprietary_implementation_steps
        )
      `)
      .eq('recommendation_key', recommendationKey)
      .eq('active', true)
      .order('mapping_scope', { ascending: true });

    if (error || !mappings || mappings.length === 0) {
      return { recommendation_key: recommendationKey, strategy_options: [], confirmed_strategy: null, user_access_level: isPaid ? 'paid' : 'free' };
    }

    // Filter by scope priority: advisor_override > business > metric > category > global
    const scopePriority: Record<string, number> = { advisor_override: 5, business: 4, metric: 3, category: 2, global: 1 };
    const sorted = [...mappings].sort((a, b) => (scopePriority[b.mapping_scope] || 0) - (scopePriority[a.mapping_scope] || 0));

    // Apply access-level filtering
    const strategyOptions = sorted.map((m: any) => {
      const strat = m.strategy_library;
      if (!strat) return null;

      const base: any = {
        strategy_id: strat.id,
        strategy_name: strat.strategy_name,
        category: strat.category,
        desired_business_outcome: strat.desired_business_outcome || null,
        implementation_difficulty: strat.implementation_difficulty,
        implementation_days: strat.implementation_days,
        advisor_review_required: strat.advisor_review_required || false,
        match_status: m.match_status,
        mapping_scope: m.mapping_scope,
        applicability_notes: m.applicability_notes,
      };

      // Free users: title, category, high-level outcome, complexity, advisor review flag
      // Paid/advisor: + description, confidence_score
      // Advisor only: + proprietary_implementation_steps
      if (isPaid) {
        base.description = strat.description;
        base.confidence_score = strat.confidence_score;
      }
      if (isAdvisor) {
        base.proprietary_implementation_steps = strat.proprietary_implementation_steps;
        base.implementation_details_hidden = false;
      } else {
        base.implementation_details_hidden = true;
      }

      return base;
    }).filter(Boolean);

    const confirmed = strategyOptions.find((s: any) => s.match_status === 'confirmed') || null;

    return {
      recommendation_key: recommendationKey,
      strategy_options: strategyOptions,
      confirmed_strategy: confirmed,
      user_access_level: isPaid ? (isAdvisor ? 'advisor' : 'paid') : 'free',
    };
  } catch (_err) {
    // Table doesn't exist yet (Phase 12B.2 migration pending)
    return { recommendation_key: recommendationKey, strategy_options: [], confirmed_strategy: null, user_access_level: isPaid ? 'paid' : 'free' };
  }
}

// ── Check for active advisor overrides ───────────────────────────────────────
export async function checkAdvisorOverride(sb: any, recommendationKey: string, businessId: string) {
  try {
    const { data: overrides } = await sb.from('recommendation_overrides')
      .select('id, override_type, previous_value, new_value, strategy_id, advisor_id, reason, active, revoked_at')
      .eq('recommendation_key', recommendationKey)
      .eq('business_id', businessId)
      .eq('active', true)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!overrides || overrides.length === 0) return null;
    return overrides[0];
  } catch (_err) {
    return null; // Table doesn't exist yet
  }
}

// ── Build supporting evidence from BIE metrics, documents, assessments ──────
export async function buildSupportingEvidence(sb: any, profileId: string, businessId: string, recommendationKey: string, raw: any) {
  // B1.1 — evidence (documents, assessments, accepted fields) must come from
  // the authorized active business only, so evidence can never cite a sibling
  // business's records for this business's recommendation.
  requireAuthorizedBusinessId(businessId, 'buildSupportingEvidence');
  const [docRes, assessRes, extractedRes] = await Promise.allSettled([
    sb.from('documents').select('name, document_type, upload_status, year').eq('business_id', businessId).limit(20),
    sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, summary, key_findings').eq('business_id', businessId),
    sb.from('extracted_fields').select('field_name, accepted_value, accepted_normalized_value, source_document_type').eq('business_id', businessId).in('review_status', ['accepted', 'corrected']).limit(20),
  ]);

  const docs = docRes.status === 'fulfilled' ? docRes.value?.data || [] : [];
  const assessments = assessRes.status === 'fulfilled' ? assessRes.value?.data || [] : [];
  const extracted = extractedRes.status === 'fulfilled' ? extractedRes.value?.data || [] : [];

  // Map recommendation key to assessment type
  const keyToAssessment: Record<string, string> = {
    profit_gap_amount: 'profit_gap',
    value_gap_amount: 'value_gap',
    tax_gap_annual: 'tax_gap',
    operations_score: 'operations_gap',
    freedom_score: 'freedom_assessment',
    recast_valuation_increase: 'recast_ebitda',
  };

  const assessmentType = keyToAssessment[recommendationKey];
  const relatedAssessment = assessments.find((a: any) => a.assessment_type === assessmentType);

  const metrics: any[] = [];
  if (raw?.revenue) metrics.push({ field: 'revenue', value: raw.revenue, source: 'dashboard_metrics' });
  if (raw?.profit_gap_amount) metrics.push({ field: 'profit_gap_amount', value: raw.profit_gap_amount, source: 'assessment' });
  if (raw?.tax_gap_annual) metrics.push({ field: 'tax_gap_annual', value: raw.tax_gap_annual, source: 'assessment' });
  if (raw?.operations_score != null) metrics.push({ field: 'operations_score', value: raw.operations_score, source: 'assessment' });
  if (raw?.freedom_score != null) metrics.push({ field: 'freedom_score', value: raw.freedom_score, source: 'assessment' });

  return {
    metrics,
    documents: docs.map((d: any) => ({ name: d.name, type: d.document_type, status: d.upload_status })),
    assessmentSources: relatedAssessment ? [{
      type: relatedAssessment.assessment_type,
      score: relatedAssessment.score,
      opportunity_value: relatedAssessment.estimated_opportunity_value,
      summary: relatedAssessment.summary,
      key_findings: relatedAssessment.key_findings,
    }] : [],
    assumptions: [],
    missingInformation: identifyMissingInformation(raw, recommendationKey),
    provenance: 'bie',
  };
}

function identifyMissingInformation(raw: any, recommendationKey: string): string[] {
  const missing: string[] = [];
  if (!raw?.revenue) missing.push('Revenue data not available');
  if (recommendationKey === 'profit_gap_amount' && !raw?.profit_gap_amount) missing.push('Profit Gap assessment not completed');
  if (recommendationKey === 'value_gap_amount' && !raw?.value_gap_amount) missing.push('Value Gap assessment not completed');
  if (recommendationKey === 'tax_gap_annual' && !raw?.tax_gap_annual) missing.push('Tax Gap assessment not completed');
  if (recommendationKey === 'operations_score' && raw?.operations_score == null) missing.push('Operations Gap assessment not completed');
  if (recommendationKey === 'freedom_score' && raw?.freedom_score == null) missing.push('Freedom Assessment not completed');
  if (recommendationKey === 'recast_valuation_increase' && !raw?.recast_valuation_increase) missing.push('Recast EBITDA not calculated');
  return missing;
}

// ── Build the Galileo response contract ──────────────────────────────────────
export function buildGalileoResponseContract(
  recommendation: any,
  strategyContext: any,
  evidence: any,
  override: any,
  userQuestion?: string,
): any {
  // Honor advisor overrides
  let effectiveRecommendation = { ...recommendation };
  let overrideNote = null;

  if (override) {
    switch (override.override_type) {
      case 'suppress_recommendation':
        return {
          recommendation_key: recommendation.recommendation_key,
          recommendation_title: recommendation.title,
          explanation: 'This recommendation has been deferred by your advisor.',
          source: 'bie',
          override_status: 'suppressed',
          followUpPrompt: 'Would you like to discuss alternative priorities with your advisor?',
        };
      case 'defer':
        overrideNote = 'Your advisor has deferred this recommendation. It remains available but is not the current priority.';
        effectiveRecommendation.priority = 'low';
        break;
      case 'change_priority':
        if (override.new_value?.priority) {
          effectiveRecommendation.priority = override.new_value.priority;
          overrideNote = `Your advisor has adjusted the priority of this recommendation to ${override.new_value.priority}.`;
        }
        break;
      case 'replace_strategy':
        if (override.new_value?.strategy_id) {
          overrideNote = 'Your advisor has selected an alternative strategy for this recommendation.';
        }
        break;
      case 'confirm_strategy':
        overrideNote = 'Your advisor has confirmed the recommended strategy for this recommendation.';
        break;
    }
  }

  return {
    recommendation_key: effectiveRecommendation.recommendation_key || effectiveRecommendation.id,
    recommendation_title: effectiveRecommendation.title,
    explanation: null, // Filled by LLM or rule-based
    whatWeFound: effectiveRecommendation.formatted || effectiveRecommendation.summary,
    whyItMatters: null, // Filled by LLM
    businessReality: null, // Filled by LLM
    consequenceOfInaction: null, // Filled by LLM
    potentialUpside: null, // Filled by LLM
    nextDecision: null, // Filled by LLM
    evidenceSummary: {
      metrics: evidence.metrics,
      assessmentSources: evidence.assessmentSources,
      missingInformation: evidence.missingInformation,
      provenance: 'bie',
    },
    confidenceLanguage: effectiveRecommendation.confidenceLevel,
    missingInformation: evidence.missingInformation,
    approvedStrategySummary: strategyContext.strategy_options.length > 0
      ? strategyContext.strategy_options.map((s: any) => ({
          name: s.strategy_name,
          category: s.category,
          difficulty: s.implementation_difficulty,
          confirmed: s.match_status === 'confirmed',
        }))
      : [],
    followUpPrompt: null,
    source: 'bie',
    override_note: overrideNote,
    override_status: override ? override.override_type : null,
    canonical_recommendation: {
      id: effectiveRecommendation.id,
      priority: effectiveRecommendation.priority,
      estimatedImpact: effectiveRecommendation.estimatedImpact,
      confidence: effectiveRecommendation.confidence,
      category: effectiveRecommendation.category,
    },
  };
}

// ── AI Strategic Hypothesis Generation ───────────────────────────────────────
// AI analyzes patterns, outcomes, and context to generate strategic hypotheses.
// Hypotheses are clearly labeled and require advisor review before becoming canonical.
export async function generateStrategicHypothesis(
  sb: any,
  b44: any,
  recommendation: any,
  profileId: string,
  businessId: string,
  raw: any,
  learningPatterns: any[],
): Promise<any> {
  const hypothesisId = `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Gather evidence from patterns and outcomes
  const evidence: any[] = [];
  for (const p of learningPatterns.slice(0, 5)) {
    evidence.push({
      source: `learning_pattern:${p.pattern_source}`,
      detail: p.learning_summary,
      confidence: p.confidence,
    });
  }

  // Use LLM to generate the strategic thesis
  let thesis = null;
  try {
    const prompt = `You are a strategic AI analyzing business intelligence to generate a strategic hypothesis.

CANONICAL RECOMMENDATION:
- Key: ${recommendation.recommendation_key}
- Title: ${recommendation.title}
- Category: ${recommendation.category}
- Priority: ${recommendation.priority}
- Estimated Impact: ${recommendation.formatted}

BUSINESS CONTEXT:
- Revenue: ${raw?.revenue || 'unknown'}
- Industry: ${raw?.industry || 'unknown'}

LEARNING PATTERNS (from verified outcomes):
${learningPatterns.map(p => `- ${p.learning_summary} (confidence: ${p.confidence}%, sample: ${p.sample_size})`).join('\n') || 'No learning patterns available yet.'}

Generate a strategic hypothesis that:
1. Identifies a pattern or opportunity NOT already captured in the canonical recommendation
2. Is clearly labeled as a hypothesis (not a verified recommendation)
3. Includes supporting evidence from the learning patterns
4. Lists assumptions that must hold true
5. Identifies missing information needed to confirm
6. Suggests a validation step

Return JSON with: title, strategic_thesis, assumptions (array), possible_upside, possible_risk, missing_information (array), suggested_validation_step, confidence (0-100)`;

    const result = await b44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          strategic_thesis: { type: 'string' },
          assumptions: { type: 'array', items: { type: 'string' } },
          possible_upside: { type: 'string' },
          possible_risk: { type: 'string' },
          missing_information: { type: 'array', items: { type: 'string' } },
          suggested_validation_step: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    });
    thesis = result;
  } catch (_e) {
    // Fallback: rule-based hypothesis from patterns
    thesis = {
      title: `Potential ${recommendation.category} optimization beyond canonical baseline`,
      strategic_thesis: `Based on ${learningPatterns.length} learning patterns, there may be additional ${recommendation.category} opportunities not yet captured in the verified assessment data.`,
      assumptions: ['Current assessment data is complete', 'No major business model changes occurred'],
      possible_upside: 'Additional value capture beyond current canonical estimate',
      possible_risk: 'Hypothesis may not hold if underlying assumptions are invalid',
      missing_information: ['More granular financial data', 'Industry benchmark comparison'],
      suggested_validation_step: 'Complete additional assessments or upload supporting documents to verify',
      confidence: Math.min(50, 20 + learningPatterns.length * 10),
    };
  }

  return {
    hypothesis_id: hypothesisId,
    related_recommendation_key: recommendation.recommendation_key,
    title: thesis.title,
    strategic_thesis: thesis.strategic_thesis,
    evidence,
    assumptions: thesis.assumptions || [],
    possible_upside: thesis.possible_upside,
    possible_risk: thesis.possible_risk,
    confidence: thesis.confidence || 40,
    missing_information: thesis.missing_information || [],
    suggested_validation_step: thesis.suggested_validation_step,
    status: 'hypothesis',
    requires_advisor_review: true,
    business_id: businessId,
    profile_id: profileId,
    generated_by_model: 'ai_strategic_reasoning_v1',
    pattern_sources: learningPatterns.map(p => p.pattern_id),
  };
}

// ── AI Strategy Comparison ───────────────────────────────────────────────────
// AI compares multiple approved Strategy Library options for a canonical recommendation.
// AI may evaluate fit, tradeoffs, second-order effects — but only among approved strategies.
export async function compareApprovedStrategies(
  sb: any,
  b44: any,
  recommendation: any,
  strategyOptions: any[],
  raw: any,
  userRole: string,
): Promise<any> {
  if (!strategyOptions || strategyOptions.length === 0) {
    return { comparison_available: false, reason: 'No approved strategies mapped to this recommendation' };
  }
  if (strategyOptions.length === 1) {
    return {
      comparison_available: false,
      reason: 'Only one approved strategy available — no comparison needed',
      sole_option: strategyOptions[0],
    };
  }

  // Build comparison context (respecting access controls)
  const comparisonInput = strategyOptions.map(s => ({
    strategy_id: s.strategy_id,
    strategy_name: s.strategy_name,
    category: s.category,
    difficulty: s.implementation_difficulty,
    days: s.implementation_days,
    outcome: s.desired_business_outcome,
    ...(s.description ? { description: s.description } : {}),
    ...(s.confidence_score != null ? { confidence_score: s.confidence_score } : {}),
  }));

  let comparison: any = null;
  try {
    const prompt = `You are a strategic AI comparing approved strategy options for a business recommendation.

CANONICAL RECOMMENDATION:
- Key: ${recommendation.recommendation_key}
- Title: ${recommendation.title}
- Priority: ${recommendation.priority}
- Estimated Impact: ${recommendation.formatted}

BUSINESS CONTEXT:
- Revenue: ${raw?.revenue || 'unknown'}

APPROVED STRATEGY OPTIONS (from Strategy Library):
${JSON.stringify(comparisonInput, null, 2)}

Compare these strategies on:
1. Fit with business size and revenue range
2. Implementation difficulty vs likely time to value
3. Risk profile and dependencies
4. Likely second-order effects
5. Compatibility with concurrent Sprint work
6. Historical success patterns (if available)

Return JSON with: comparative_analysis (array of {strategy_id, fit_score 0-100, reasoning, key_tradeoff}), recommended_order (array of strategy_ids in suggested priority), overall_reasoning, key_assumptions`;

    const result = await b44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          comparative_analysis: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                strategy_id: { type: 'string' },
                fit_score: { type: 'number' },
                reasoning: { type: 'string' },
                key_tradeoff: { type: 'string' },
              },
            },
          },
          recommended_order: { type: 'array', items: { type: 'string' } },
          overall_reasoning: { type: 'string' },
          key_assumptions: { type: 'array', items: { type: 'string' } },
        },
      },
    });
    comparison = result;
  } catch (_e) {
    // Fallback: deterministic comparison by difficulty + confidence
    const sorted = [...strategyOptions].sort((a, b) => {
      const diffRank: any = { easy: 3, medium: 2, advanced: 1 };
      const aScore = (diffRank[a.implementation_difficulty] || 0) + (a.confidence_score || 50) / 100;
      const bScore = (diffRank[b.implementation_difficulty] || 0) + (b.confidence_score || 50) / 100;
      return bScore - aScore;
    });
    comparison = {
      comparative_analysis: sorted.map(s => ({
        strategy_id: s.strategy_id,
        fit_score: Math.round((s.confidence_score || 50)),
        reasoning: `Ranked by implementation ease and confidence score`,
        key_tradeoff: `${s.implementation_difficulty} implementation, ${s.implementation_days} days`,
      })),
      recommended_order: sorted.map(s => s.strategy_id),
      overall_reasoning: 'Deterministic fallback ranking by difficulty and confidence',
      key_assumptions: ['Strategy Library data is accurate', 'No contraindications present'],
    };
  }

  return {
    comparison_available: true,
    recommendation_key: recommendation.recommendation_key,
    comparative_analysis: comparison.comparative_analysis,
    recommended_order: comparison.recommended_order,
    overall_reasoning: comparison.overall_reasoning,
    key_assumptions: comparison.key_assumptions || [],
    source: 'ai_strategy_comparison',
    note: 'AI ranked approved strategies only. No new strategies invented.',
  };
}

// ── Fetch Learning Patterns for a Recommendation ──────────────────────────────
export async function fetchLearningPatterns(sb: any, recommendationKey: string, businessId?: string) {
  try {
    // Fetch from strategy_learning_summary table (Phase 12B learning layer)
    const { data: patterns, error } = await sb.from('strategy_learning_summary')
      .select('*')
      .eq('recommendation_key', recommendationKey)
      .order('last_updated', { ascending: false })
      .limit(10);

    if (error || !patterns) return [];

    return patterns.map((p: any) => ({
      pattern_id: p.pattern_id || p.id,
      pattern_source: p.pattern_source || 'strategy_outcomes',
      recommendation_key: p.recommendation_key,
      strategy_id: p.strategy_id,
      strategy_name: p.strategy_name,
      businesses_included: p.businesses_included || [],
      sample_size: p.sample_size || 0,
      confidence: p.confidence || 50,
      outcome_quality: p.outcome_quality || 'medium',
      advisor_validation_status: p.advisor_validation_status || 'pending',
      model_version: p.model_version || 'unknown',
      is_experimental: p.is_experimental !== false,
      learning_summary: p.learning_summary || '',
      matching_criteria: p.matching_criteria || {},
      ranking_adjustment: p.ranking_adjustment || 0,
      last_updated: p.last_updated || p.updated_at,
    }));
  } catch (_err) {
    return [];
  }
}

// ── Record a Learning Pattern with Audit Trail ───────────────────────────────
export async function recordLearningPattern(
  sb: any,
  pattern: {
    pattern_source: string;
    recommendation_key: string;
    strategy_id?: string;
    strategy_name?: string;
    businesses_included?: string[];
    sample_size: number;
    confidence: number;
    outcome_quality: string;
    learning_summary: string;
    matching_criteria?: any;
    ranking_adjustment?: number;
    model_version: string;
  },
) {
  const patternId = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { data, error } = await sb.from('strategy_learning_summary').insert({
      pattern_id: patternId,
      pattern_source: pattern.pattern_source,
      recommendation_key: pattern.recommendation_key,
      strategy_id: pattern.strategy_id,
      strategy_name: pattern.strategy_name,
      businesses_included: pattern.businesses_included || [],
      sample_size: pattern.sample_size,
      confidence: pattern.confidence,
      outcome_quality: pattern.outcome_quality,
      advisor_validation_status: 'pending',
      model_version: pattern.model_version,
      is_experimental: true,
      learning_summary: pattern.learning_summary,
      matching_criteria: pattern.matching_criteria || {},
      ranking_adjustment: pattern.ranking_adjustment || 0,
      last_updated: new Date().toISOString(),
    }).select().single();

    if (error) return { pattern_id: patternId, recorded: false, error: error.message };
    return { pattern_id: patternId, recorded: true, data };
  } catch (err: any) {
    return { pattern_id: patternId, recorded: false, error: err.message };
  }
}

// ── Apply Learning Pattern Adjustments to Strategy Ranking ────────────────────
// After deterministic eligibility filtering, AI may adjust ranking using
// verified learning patterns. Only advisor-validated patterns influence production.
export function applyLearningAdjustments(
  strategyOptions: any[],
  learningPatterns: any[],
): any[] {
  if (!learningPatterns || learningPatterns.length === 0) return strategyOptions;

  // Only use advisor-validated or high-sample-size patterns for production adjustments
  const productionPatterns = learningPatterns.filter(p =>
    p.advisor_validation_status === 'validated' || (p.sample_size >= 5 && !p.is_experimental)
  );

  if (productionPatterns.length === 0) return strategyOptions;

  return strategyOptions.map(s => {
    const matchingPattern = productionPatterns.find(p => p.strategy_id === s.strategy_id);
    if (!matchingPattern) return s;

    return {
      ...s,
      learning_adjusted_score: (s.confidence_score || 50) + (matchingPattern.ranking_adjustment || 0),
      learning_pattern_applied: matchingPattern.pattern_id,
      learning_note: matchingPattern.learning_summary,
    };
  }).sort((a, b) => (b.learning_adjusted_score || b.confidence_score || 50) - (a.learning_adjusted_score || a.confidence_score || 50));
}

// ── Intelligence Label Types for Galileo Responses ────────────────────────────
// Galileo must distinguish: VERIFIED, PROJECTED, HYPOTHESIS, ADVISOR-CONFIRMED
export const INTELLIGENCE_LABELS = {
  VERIFIED: 'verified',
  PROJECTED: 'projected',
  HYPOTHESIS: 'hypothesis',
  ADVISOR_CONFIRMED: 'advisor_confirmed',
} as const;

export function labelIntelligence(statement: string, label: string, evidence?: string): string {
  const prefixes: Record<string, string> = {
    [INTELLIGENCE_LABELS.VERIFIED]: 'Based on your verified data',
    [INTELLIGENCE_LABELS.PROJECTED]: 'If this assumption holds',
    [INTELLIGENCE_LABELS.HYPOTHESIS]: 'One possibility worth validating is',
    [INTELLIGENCE_LABELS.ADVISOR_CONFIRMED]: 'Your advisor has confirmed',
  };
  const prefix = prefixes[label] || '';
  return evidence ? `${prefix} (${evidence}): ${statement}` : `${prefix}: ${statement}`;
}

// ── Resolve profile and membership (BUSINESS RESOLUTION REMOVED — Phase 6.9B) ─
/**
 * resolveProfileAndBusiness — DEPRECATED BUSINESS RESOLUTION.
 *
 * This helper NO LONGER resolves a business: `businessId` is always null.
 *
 * It used to fall back to `profile.primary_business_id` whenever the caller
 * omitted a business — the exact silent substitution Phase 6.9 exists to remove,
 * where a multi-business account was answered with whichever business happened to
 * be primary. It also accepted `data.profile_id` as actor identity, letting a
 * caller assert any profile id as their own. Because the helper stayed exported
 * and reusable, either hazard could be resurrected by a future caller, so the
 * business logic is REMOVED rather than corrected in place.
 *
 * Business-scoped callers MUST use `resolveActiveBusiness` /
 * `requireBusinessContext` from shared/businessScope/activeBusiness.ts, which
 * authorize the actor and REFUSE an ambiguous request instead of guessing.
 *
 * The one live caller (galileoOpportunityEngine) already consumes only `profileId`
 * and `membershipStatus` and discards `businessId`, so its behaviour is unchanged.
 */
export async function resolveProfileAndBusiness(sb: any, user: any, data?: any) {
  // Identity comes from the AUTHENTICATED SESSION only — never from the payload.
  // Only columns proven to exist are selected: one non-existent column makes
  // PostgREST return { data: null } and silently degrades every caller to
  // "no profile".
  const { data: profile } = await sb
    .from('profiles')
    .select('id, app_role')
    .eq('email', user?.email)
    .maybeSingle();

  const profileId = profile?.id || null;

  // Membership signals are read in a SEPARATE, tolerant query so a missing
  // optional column cannot break identity resolution above.
  let membershipStatus = data?.membership_status;
  if (!membershipStatus) {
    const role = profile?.app_role || user?.role;
    if (['super_admin', 'advisor', 'admin'].includes(role)) {
      membershipStatus = 'paid';
    } else {
      const { data: membership } = await sb
        .from('profiles')
        .select('membership_tier, subscription_status')
        .eq('id', profileId)
        .maybeSingle();
      membershipStatus =
        membership?.membership_tier === 'member' ||
        membership?.membership_tier === 'pro' ||
        membership?.subscription_status === 'active'
          ? 'paid'
          : 'free';
    }
  }

  return { profileId, businessId: null, membershipStatus };
}