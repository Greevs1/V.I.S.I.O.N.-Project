/**
 * generateGalileoInsights — Phase 12C: BIE-Consumer
 *
 * Formats verified intelligence from canonical BIE recommendations.
 * Does NOT create new opportunity scores, priorities, estimated impacts,
 * recommendations, or strategy selections outside resolved mappings.
 *
 * Galileo may produce: headline, observation, why it matters, consequence
 * of inaction, potential upside, confidence language, next decision, and
 * useful follow-up question — all derived from canonical BIE recommendations.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  fetchCanonicalRecommendations,
  resolveStrategyContext,
  checkAdvisorOverride,
  buildSupportingEvidence,
  fetchLearningPatterns,
} from '../../shared/galileoBieConsumer/entry.ts';
import {
  resolveActorBusinessContext,
  businessContextError,
} from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    // ── PHASE 6.9 — BUSINESS SCOPE CONTRACT ───────────────────────────────────
    // Single business-scoped path (no action router): every read below belongs to
    // ONE business. Actor identity and the business are resolved through the
    // canonical contract, which REFUSES an ambiguous request with
    // 400 BUSINESS_CONTEXT_REQUIRED rather than falling back to primary_business_id.
    let profileId: string | null = null;
    let businessId: string | null = null;
    let membershipStatus = 'free';
    try {
      ({ profileId, businessId, membershipStatus } = await resolveActorBusinessContext(sb, user, body, { action: 'generateGalileoInsights' }));
    } catch (bizErr) {
      return businessContextError(bizErr);
    }
    if (!businessId) return Response.json({ error: 'business_id required' }, { status: 400 });

    const isPaid = membershipStatus === 'paid';
    const userRole = user.role || 'owner';
    const isAdvisor = ['super_admin', 'advisor', 'admin'].includes(userRole);

    // ── 1. Fetch canonical BIE recommendations ────────────────────────────────
    const { recommendations, raw } = await fetchCanonicalRecommendations(sb, profileId, businessId);

    // ── 2. Load supporting context ────────────────────────────────────────────
    const [assessRes, nbaRes, sprintRes, vceRes] = await Promise.allSettled([
      sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, summary, key_findings').eq('profile_id', profileId),
      sb.from('next_best_actions').select('id, title, action_type, priority_score, estimated_impact, status, reason').eq('business_id', businessId).in('status', ['recommended', 'accepted', 'in_progress']).order('priority_score', { ascending: false }).limit(10),
      sb.from('ninety_day_sprint_paths').select('id, path_title, path_goal, status, progress_percent, is_active').eq('profile_id', profileId).eq('is_active', true).limit(1),
      sb.from('value_creation_events').select('id, title, category, status, confidence_level, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(20),
    ]);

    const safeVal = (s: any, fb: any = null) => s.status === 'fulfilled' ? (s.value?.data ?? fb) : fb;
    const assessments = safeVal(assessRes, []);
    const nba_rows = safeVal(nbaRes, []);
    const active_sprint = safeVal(sprintRes, [])?.[0] || null;
    const vce_rows = safeVal(vceRes, []);

    // ── 3. Resolve strategy context for each recommendation ────────────────────
    const recommendationsWithContext = [];
    for (const rec of recommendations) {
      const strategyContext = await resolveStrategyContext(sb, rec.recommendation_key, businessId, profileId, userRole, membershipStatus);
      const override = await checkAdvisorOverride(sb, rec.recommendation_key, businessId);
      const evidence = await buildSupportingEvidence(sb, profileId, businessId, rec.recommendation_key, raw);
      recommendationsWithContext.push({ recommendation: rec, strategyContext, override, evidence });
    }

    // ── 3b. Fetch strategic hypotheses and learning patterns ───────────────────
    const [hypothesesRes, learningRes] = await Promise.allSettled([
      sb.from('strategic_hypotheses').select('*').eq('business_id', businessId).in('status', ['hypothesis', 'under_review', 'confirmed']).order('created_date', { ascending: false }).limit(10),
      recommendations.length > 0 ? fetchLearningPatterns(sb, recommendations[0].recommendation_key, businessId) : Promise.resolve([]),
    ]);
    const hypotheses = hypothesesRes.status === 'fulfilled' ? hypothesesRes.value?.data || [] : [];
    const learningPatterns = learningRes.status === 'fulfilled' ? learningRes.value || [] : [];

    // ── 4. Build verified context summary ─────────────────────────────────────
    const byType = (assessments || []).reduce((acc: any, a: any) => { acc[a.assessment_type] = a; return acc; }, {});
    const verifiedVCEs = (vce_rows || []).filter(e => e.status === 'verified');
    const totalVerifiedValue = verifiedVCEs.reduce((s: number, e: any) => s + (e.verified_tax_savings || 0) + (e.verified_profit_improvement || 0) + (e.verified_cash_flow_improvement || 0), 0);
    const totalEstimatedOpportunity = recommendations.reduce((s: number, r: any) => s + (r.estimatedImpact || 0), 0);
    const ciq_score = raw?.iq_score || null;

    const canonicalRecsForLLM = recommendationsWithContext.map((rwc: any) => ({
      recommendation_key: rwc.recommendation.recommendation_key,
      title: rwc.recommendation.title,
      category: rwc.recommendation.category,
      priority: rwc.recommendation.priority,
      estimated_impact: rwc.recommendation.estimatedImpact,
      formatted: rwc.recommendation.formatted,
      confidence: rwc.recommendation.confidence,
      strategy_options: rwc.strategyContext.strategy_options?.map((s: any) => ({ name: s.strategy_name, difficulty: s.implementation_difficulty, confirmed: s.match_status === 'confirmed' })) || [],
      override: rwc.override?.override_type || null,
      missing_info: rwc.evidence.missingInformation,
    }));

    // ── 5. LLM: Format verified intelligence (NOT generate new recommendations) ─
    const systemPrompt = `You are Galileo, a strategic business advisor AI. You FORMAT verified intelligence from canonical BIE recommendations. You do NOT generate new recommendations, scores, priorities, or estimated impacts.

RULES:
- Only use the canonical BIE recommendations provided. Do NOT invent new ones.
- Every priority must reference a canonical recommendation_key.
- Use verified values first, assessment estimates second.
- Cite the source for each major number.
- Return confidence: "high" (verified data), "medium" (assessment data), "low" (missing data).
- If no canonical recommendations exist, say so explicitly.
- The platform uses 90-Day Sprints. Reference sprint items for progress.
- Only call outcomes "verified" when status=verified.
- source = "bie" on all responses.

INTELLIGENCE LABELS (distinguish in your output):
- VERIFIED: facts from BIE metrics, assessments, documents
- PROJECTED: projections from canonical recommendations
- HYPOTHESIS: AI-generated strategic hypotheses (provided below — surface in strategic_hypotheses field)
- ADVISOR-CONFIRMED: advisor overrides or confirmed strategies

AI STRATEGIC REASONING (encouraged):
- Analyze relationships among verified metrics
- Detect patterns across assessments, documents, and outcomes
- Compare approved strategies for suitability
- Identify second-order and third-order effects
- Surface strategic hypotheses (clearly labeled as HYPOTHESIS)
- Identify missing data that would materially improve confidence
- Surface anomalies and contradictions in the business data`;

    const userPrompt = `Format strategic insights from these canonical BIE recommendations.

CANONICAL BIE RECOMMENDATIONS (ranked by priority — use these, do NOT create new ones):
${JSON.stringify(canonicalRecsForLLM, null, 2)}

BUSINESS CONTEXT:
${JSON.stringify({
  ciq_score,
  assessments_completed: Object.keys(byType),
  active_sprint: active_sprint ? { title: active_sprint.path_title, goal: active_sprint.path_goal, progress: active_sprint.progress_percent } : null,
  next_best_actions: nba_rows.slice(0, 5).map(a => ({ title: a.title, impact: a.estimated_impact, reason: a.reason })),
  verified_value: totalVerifiedValue > 0 ? { amount: totalVerifiedValue, count: verifiedVCEs.length } : null,
  estimated_opportunity_total: totalEstimatedOpportunity || null,
}, null, 2)}

${recommendations.length === 0 ? 'NO CANONICAL RECOMMENDATIONS: State that there is not enough verified intelligence yet. Do NOT generate priorities.' : ''}

${hypotheses.length > 0 ? `AI STRATEGIC HYPOTHESES (surface in strategic_hypotheses field — clearly labeled as HYPOTHESIS):
${JSON.stringify(hypotheses.map(h => ({
  hypothesis_id: h.hypothesis_id,
  title: h.title,
  thesis: h.strategic_thesis,
  related_recommendation: h.related_recommendation_key,
  confidence: h.confidence,
  assumptions: h.assumptions,
  missing_info: h.missing_information,
  validation_step: h.suggested_validation_step,
  status: h.status,
})), null, 2)}` : ''}

${learningPatterns.length > 0 ? `LEARNING PATTERNS (from verified outcomes — use for context):
${JSON.stringify(learningPatterns.map(p => ({
  strategy: p.strategy_name,
  learning: p.learning_summary,
  confidence: p.confidence,
  sample_size: p.sample_size,
  validation: p.advisor_validation_status,
})), null, 2)}` : ''}

Generate a JSON response with exactly this structure:
{
  "executive_summary": "2-3 sentence summary based on canonical BIE recommendations",
  "confidence_level": "high|medium|low",
  "top_3_priorities": [
    {
      "rank": 1,
      "recommendation_key": "the canonical BIE recommendation key",
      "title": "Priority title from canonical recommendation",
      "rationale": "Why this is priority based on canonical data",
      "estimated_impact": number or null,
      "impact_source": "bie",
      "action": "Specific next step",
      "timeframe": "e.g. 30 days"
    }
  ],
  "strategic_hypotheses": [
    {
      "hypothesis_id": "from provided hypotheses",
      "title": "Hypothesis title",
      "thesis": "Strategic thesis",
      "related_recommendation_key": "canonical key",
      "confidence": number,
      "assumptions": ["key assumptions"],
      "possible_upside": "upside description",
      "possible_risk": "risk description",
      "validation_step": "suggested validation step",
      "status": "hypothesis",
      "intelligence_label": "hypothesis"
    }
  ],
  "biggest_risks": [
    { "risk": "Risk description", "severity": "high|medium|low", "area": "tax|profit|operations|data_quality|planning|execution", "mitigation": "Specific step" }
  ],
  "estimated_value_available": {
    "total": number or null,
    "verified_to_date": number or null,
    "in_pipeline": number or null,
    "source": "bie",
    "confidence": "high|medium|low"
  },
  "next_90_day_plan": [
    { "week_range": "Week 1-2", "focus": "What to focus on", "recommendation_key": "canonical key if applicable", "action": "Specific action", "owner": "Business Owner|Advisor|Both", "milestone": "Success indicator" }
  ],
  "recommended_focus": {
    "primary_area": "Area name",
    "recommendation_key": "canonical key",
    "reason": "Why this area first",
    "estimated_return": number or null,
    "source": "bie"
  },
  "hidden_opportunities_count": number,
  "data_gaps": ["List critical missing data"],
  "intelligence_labels": {
    "verified": ["statements backed by verified data"],
    "projected": ["statements based on projections"],
    "hypothesis": ["hypotheses surfaced"],
    "advisor_confirmed": ["advisor-confirmed statements"]
  },
  "source": "bie"
}

Return ONLY valid JSON. No markdown.`;

    let insights: any = null;
    let llm_error: string | null = null;

    if (OPENROUTER_KEY) {
      try {
        const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.2,
            response_format: { type: 'json_object' },
          }),
        });
        const llmData = await llmRes.json();
        const rawResp = llmData.choices?.[0]?.message?.content;
        if (rawResp) insights = JSON.parse(rawResp);
      } catch (e: any) {
        llm_error = e.message;
        console.error('[generateGalileoInsights] LLM failed:', e.message);
      }
    }

    // ── 6. Fallback: rule-based insights from canonical recommendations ──────
    if (!insights) {
      const topRecs = recommendations.slice(0, 3);
      insights = {
        executive_summary: recommendations.length > 0
          ? `Business has ${recommendations.length} canonical BIE recommendations. ${topRecs[0] ? `Top priority: "${topRecs[0].title}" (${topRecs[0].formatted}).` : ''} ${totalVerifiedValue > 0 ? `$${Math.round(totalVerifiedValue / 1000)}K in value creation verified to date.` : 'No verified value creation events recorded yet.'}`
          : 'Insufficient data to generate executive summary. Complete assessments to unlock canonical recommendations.',
        confidence_level: recommendations.length > 0 ? 'medium' : 'low',
        top_3_priorities: topRecs.map((r: any, i: number) => ({
          rank: i + 1,
          recommendation_key: r.recommendation_key,
          title: r.title,
          rationale: `Canonical BIE recommendation with ${r.confidence}% confidence. ${r.formatted} estimated impact.`,
          estimated_impact: r.estimatedImpact,
          impact_source: 'bie',
          action: r.relatedSprint?.label || r.title,
          timeframe: '30-90 days',
        })),
        biggest_risks: [
          !raw?.revenue && { risk: 'No verified revenue data available', severity: 'high', area: 'data_quality', mitigation: 'Upload financial documents for advisor review' },
          !active_sprint && { risk: 'No active 90-Day Sprint — no execution plan in place', severity: 'high', area: 'planning', mitigation: 'Start a 90-Day Sprint focused on top-ranked recommendation' },
          recommendations.length === 0 && { risk: 'No canonical recommendations — assessments incomplete', severity: 'high', area: 'data_quality', mitigation: 'Complete remaining assessments' },
        ].filter(Boolean),
        estimated_value_available: {
          total: totalEstimatedOpportunity || null,
          verified_to_date: totalVerifiedValue || null,
          in_pipeline: null,
          source: 'bie',
          confidence: totalVerifiedValue > 0 ? 'high' : totalEstimatedOpportunity > 0 ? 'medium' : 'low',
        },
        next_90_day_plan: [
          { week_range: 'Week 1-2', focus: 'Data foundation', recommendation_key: null, action: 'Complete remaining assessments', owner: 'Business Owner', milestone: 'All assessments completed' },
          { week_range: 'Week 3-4', focus: 'Sprint kickoff', recommendation_key: topRecs[0]?.recommendation_key || null, action: topRecs[0] ? `Start sprint focused on ${topRecs[0].title}` : 'Start a 90-Day Sprint', owner: 'Both', milestone: 'First sprint item in progress' },
          { week_range: 'Month 2', focus: 'Sprint execution', recommendation_key: topRecs[1]?.recommendation_key || null, action: 'Complete sprint tasks weekly', owner: 'Both', milestone: '2+ sprint tasks completed' },
          { week_range: 'Month 3', focus: 'Outcome verification', recommendation_key: null, action: 'Enter actual results for completed sprint items', owner: 'Advisor', milestone: 'First verified outcome recorded' },
        ],
        recommended_focus: topRecs[0] ? {
          primary_area: topRecs[0].category,
          recommendation_key: topRecs[0].recommendation_key,
          reason: `Canonical BIE recommendation with highest priority`,
          estimated_return: topRecs[0].estimatedImpact,
          source: 'bie',
        } : { primary_area: 'Data Quality', recommendation_key: null, reason: 'Insufficient data — prioritize assessments', estimated_return: null, source: 'bie' },
        hidden_opportunities_count: Math.max(0, recommendations.length - 3),
        data_gaps: [
          !raw?.revenue && 'Revenue data not verified',
          recommendations.length < 3 && 'Not all assessments completed',
        ].filter(Boolean),
        source: 'bie',
        _fallback: true,
        _llm_error: llm_error,
      };
    }

    // Ensure source = "bie"
    if (!insights.source) insights.source = 'bie';

    // ── 7. Apply membership gating ────────────────────────────────────────────
    const gatedInsights = { ...insights };
    if (!isPaid) {
      if (gatedInsights.top_3_priorities?.length > 2) {
        gatedInsights.top_3_priorities = gatedInsights.top_3_priorities.slice(0, 2);
        gatedInsights._gated_priorities_count = insights.top_3_priorities.length - 2;
      }
      if (gatedInsights.next_90_day_plan?.length > 2) {
        gatedInsights.next_90_day_plan = gatedInsights.next_90_day_plan.slice(0, 2);
        gatedInsights._gated_plan_count = insights.next_90_day_plan.length - 2;
      }
      gatedInsights._recommended_focus_gated = true;
    }

    return Response.json({
      insights: gatedInsights,
      membership_status: membershipStatus,
      is_gated: !isPaid,
      canonical_recommendations_count: recommendations.length,
      context_sources: {
        assessments_count: assessments.length,
        nba_count: nba_rows.length,
        verified_vce_count: verifiedVCEs.length,
        active_sprint: !!active_sprint,
      },
      source: 'bie',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});