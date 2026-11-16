/**
 * valueCreationEngine — Phase 2E Opportunity Intelligence Engine™
 *
 * INTERNAL ORCHESTRATION LAYER — Invisible to clients.
 *
 * Objective: Answer "What action creates the greatest measurable value for this client right now?"
 *
 * Consumes outputs from:
 *   - ownershipAdjustmentEngine
 *   - confidenceEngine
 *   - freedomEngine
 *   - profitIqEngine
 *   - protectionGapEngine
 *   - reportingQualityEngine
 *   - (future) taxStrategyEngine, synergyEngine, rollUpReadinessEngine
 *
 * Never duplicates calculations — consumes existing engine outputs only.
 *
 * Every opportunity receives:
 *   - Opportunity IQ™ (internal composite: Impact, Readiness, Confidence, Ease, Timing, Dependencies, Strategic Importance, Probability of Success)
 *   - Expected Value Created (EV increase, profit increase, tax savings, cash flow, freedom acceleration, risk reduction, strategic leverage)
 *   - Expected ROI (benefit / cost)
 *   - Readiness Score (0-100%, missing requirements, blocking reason, ready_today boolean)
 *   - Strategic Theme classification
 *   - Constraint Analysis (single biggest blocker)
 *   - Momentum Signal (internal sequencing personalization only)
 *
 * DIAGNOSTIC MODE (Phase 2E):
 *   - Does NOT replace existing rankings
 *   - Runs parallel to legacy logic
 *   - Logs: reason, OpportunityIQ, LegacyRank, Recommendation
 *   - No client-visible changes
 *
 * SAFETY: Read-only. Additive only. No schema changes. Compute in memory.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

// Phase 2F Evidence Object™ — Universal Engine Contract
const METHODOLOGY_VERSION = '2026.06.25';
const BENCHMARK_VERSION = '2026.06.25';

function engineOutput(
  result,
  scope,
  methodology_version = METHODOLOGY_VERSION,
  benchmark_version = BENCHMARK_VERSION,
  evidence = [],
  confidence_score = 50,
  confidence_reason = 'insufficient_evidence',
  missing_evidence = [],
  stale_evidence = [],
  conflicting_evidence = [],
  recommended_next_evidence = null,
  warnings = [],
  advisor_verified = false
) {
  return {
    result,
    scope,
    methodology_version,
    benchmark_version,
    evidence,
    confidence_score,
    confidence_reason,
    missing_evidence,
    stale_evidence,
    conflicting_evidence,
    recommended_next_evidence,
    warnings,
    advisor_verified,
  };
}

// ── Strategic Theme Definitions ───────────────────────────────────────────────
const STRATEGIC_THEMES = {
  PROFIT_GROWTH: {
    keywords: ['revenue', 'profit', 'margin', 'pricing', 'sales', 'gross margin', 'net profit'],
    categories: ['profit_improvement', 'pricing_optimization', 'revenue_growth', 'margin_improvement'],
    engine_signals: ['profit_iq_score < 70', 'net_profit_margin_gap > 10%'],
  },
  TAX_OPTIMIZATION: {
    keywords: ['tax', 'deduction', 'entity', 'structure', 'depreciation', 'section 179', 'retirement'],
    categories: ['tax_optimization', 'entity_restructuring', 'tax_strategy'],
    engine_signals: ['tax_gap.severity !== small', 'effective_tax_rate > industry_avg'],
  },
  CASH_FLOW: {
    keywords: ['cash flow', 'working capital', 'receivables', 'payables', 'collections', 'liquidity'],
    categories: ['cash_flow_improvement', 'working_capital_optimization', 'liquidity_improvement'],
    engine_signals: ['operating_cash_flow < net_profit', 'dsi > 60'],
  },
  ENTERPRISE_VALUE: {
    keywords: ['valuation', 'ebitda', 'multiple', 'exit', 'sale', 'enterprise value', 'recast'],
    categories: ['value_creation', 'exit_planning', 'recast_ebitda', 'value_optimization'],
    engine_signals: ['value_gap.severity !== small', 'ev_ebitda_multiple < industry_avg'],
  },
  FREEDOM: {
    keywords: ['freedom', 'time', 'owner dependency', 'delegation', 'independence', 'time off'],
    categories: ['freedom_acceleration', 'operational_independence', 'owner_independence'],
    engine_signals: ['freedom_score < 70', 'owner_hours_per_week > 40'],
  },
  PROTECTION: {
    keywords: ['risk', 'compliance', 'legal', 'insurance', 'protection', 'liability', 'asset protection'],
    categories: ['risk_mitigation', 'compliance', 'asset_protection', 'protection_gap'],
    engine_signals: ['protection_gap.coverage_ratio < 0.8'],
  },
  OPERATIONS: {
    keywords: ['operations', 'efficiency', 'automation', 'process', 'system', 'sop'],
    categories: ['operational_efficiency', 'process_optimization', 'operations_improvement'],
    engine_signals: ['operations_gap.score < 70'],
  },
  REPORTING_QUALITY: {
    keywords: ['reporting', 'financials', 'metrics', 'dashboard', 'visibility', 'data quality'],
    categories: ['reporting_improvement', 'financial_visibility', 'data_quality'],
    engine_signals: ['reporting_quality_score < 70'],
  },
  LEADERSHIP: {
    keywords: ['team', 'hiring', 'leadership', 'management', 'culture', 'talent', 'org chart'],
    categories: ['team_building', 'leadership_development', 'talent_acquisition'],
    engine_signals: ['team_size < optimal_for_revenue', 'key_person_dependency = high'],
  },
  ROLLUP_READINESS: {
    keywords: ['roll-up', 'acquisition', 'integration', 'synergy', 'multi-business', 'platform'],
    categories: ['roll_up_preparation', 'synergy_realization', 'acquisition_strategy'],
    engine_signals: ['multi_business = true', 'synergy_score < 70'],
  },
};

// ── ROI Calculation ───────────────────────────────────────────────────────────
function calculateROI(opportunity) {
  const totalBenefit = (opportunity.estimated_value_created || 0) +
    (opportunity.estimated_tax_savings || 0) +
    (opportunity.estimated_profit_improvement || 0) +
    ((opportunity.estimated_cash_flow_improvement || 0) * 12);

  const estimatedCost = opportunity.estimated_cost || 0;
  const roi = estimatedCost > 0 ? (totalBenefit - estimatedCost) / estimatedCost : totalBenefit / 1000;
  const roiPercentage = Math.round(roi * 100);

  return {
    total_benefit: totalBenefit,
    estimated_cost: estimatedCost,
    roi: roi,
    roi_percentage: roiPercentage,
    payback_months: estimatedCost > 0 && totalBenefit > 0 ? Math.round((estimatedCost / (totalBenefit / 12)) * 10) / 10 : null,
  };
}

// ── Opportunity IQ™ Calculation ───────────────────────────────────────────────
function calculateOpportunityIQ(opportunity, engineOutputs, readiness, roi) {
  // Impact Score (0-100)
  const impactScore = Math.min(100, Math.round(
    (opportunity.impact_score || 50) * 0.35 +
    (opportunity.strategic_opportunity_score || 50) * 0.30 +
    (roi.roi_percentage > 100 ? 100 : roi.roi_percentage) * 0.20 +
    (opportunity.freedom_acceleration_score || 50) * 0.15
  ));

  // Readiness Score (0-100)
  const readinessScore = readiness.readiness_percentage || 0;

  // Confidence Score (0-100)
  const confidenceScore = opportunity.confidence_score || 50;

  // Ease Score (0-100) - inverse of effort
  const easeScore = opportunity.ease_score || 50;

  // Timing Score (0-100)
  const timingScore = Math.min(100, Math.round(
    (opportunity.urgency_score || 50) * 0.50 +
    (opportunity.time_to_value_score || 50) * 0.50
  ));

  // Dependency Score (0 or 100)
  const dependencyScore = readiness.blocked_reason ? 0 : 100;

  // Strategic Importance (0-100)
  const strategicScore = opportunity.strategic_opportunity_score || 50;

  // Probability of Success (0-100)
  const probabilityScore = Math.round(
    confidenceScore * 0.60 +
    (readiness.ready_today ? 100 : 50) * 0.40
  );

  // Overall Opportunity IQ™ (weighted composite)
  const rawIQ = (
    impactScore * 0.25 +
    readinessScore * 0.15 +
    confidenceScore * 0.15 +
    easeScore * 0.10 +
    timingScore * 0.10 +
    dependencyScore * 0.10 +
    strategicScore * 0.10 +
    probabilityScore * 0.05
  );

  // Apply penalties
  const penalties = {
    blocked: dependencyScore === 0 ? 0.5 : 1.0,
    lowConfidence: confidenceScore < 50 ? 0.7 : 1.0,
    lowReadiness: readinessScore < 50 ? 0.8 : 1.0,
  };
  const totalPenalty = Object.values(penalties).reduce((a, b) => a * b, 1);

  const overallIQ = Math.round(rawIQ * totalPenalty);

  return {
    overall_iq: Math.max(0, Math.min(100, overallIQ)),
    component_scores: {
      impact: impactScore,
      readiness: readinessScore,
      confidence: confidenceScore,
      ease: easeScore,
      timing: timingScore,
      dependencies: dependencyScore,
      strategic_importance: strategicScore,
      probability_of_success: probabilityScore,
    },
    penalties_applied: penalties,
    calculation_method: 'weighted_composite(impact, readiness, confidence, ease, timing, dependencies, strategic, probability)',
  };
}

// ── Theme Classification ──────────────────────────────────────────────────────
function classifyStrategicThemes(opportunity, engineOutputs) {
  const matchedThemes = [];
  const scores = {};

  Object.entries(STRATEGIC_THEMES).forEach(([theme, config]) => {
    let score = 0;

    // Keyword matching on title and description
    config.keywords.forEach(keyword => {
      const kwLower = keyword.toLowerCase();
      if (opportunity.title?.toLowerCase().includes(kwLower)) score += 20;
      if (opportunity.description?.toLowerCase().includes(kwLower)) score += 10;
    });

    // Category matching
    config.categories.forEach(cat => {
      if (opportunity.category === cat) score += 30;
    });

    // Engine signal evaluation (simplified — actual implementation would parse signals)
    config.engine_signals.forEach(signal => {
      // Example: 'profit_iq_score < 70'
      if (signal.includes('profit_iq') && engineOutputs.profit_iq?.value < 70) score += 25;
      if (signal.includes('freedom_score') && engineOutputs.freedom?.current_path?.freedom_score < 70) score += 25;
      if (signal.includes('reporting_quality') && engineOutputs.reporting_quality?.value < 70) score += 25;
    });

    if (score >= 30) {
      matchedThemes.push(theme);
      scores[theme] = Math.min(100, score);
    }
  });

  const primaryTheme = matchedThemes.length > 0
    ? matchedThemes.reduce((a, b) => scores[a] > scores[b] ? a : b)
    : 'GENERAL';

  return {
    strategic_themes: matchedThemes,
    primary_theme: primaryTheme,
    theme_scores: scores,
  };
}

// ── Readiness Calculation ─────────────────────────────────────────────────────
function calculateReadiness(opportunity, profileData, businessData, engineOutputs) {
  const requirements = {
    documents: opportunity.required_documents || [],
    assessments: opportunity.required_assessments || [],
    financial_inputs: opportunity.required_financial_inputs || [],
    advisor_verification: opportunity.requires_advisor_verification || false,
    dependencies: opportunity.prerequisite_opportunity_ids || [],
  };

  let totalRequirements = 0;
  let completedRequirements = 0;
  const missingRequirements = [];
  let blockedReason = null;

  // Check documents
  (requirements.documents || []).forEach(doc => {
    totalRequirements++;
    const isPresent = profileData.documents?.some(d => d.document_type === doc.type);
    if (isPresent) completedRequirements++;
    else missingRequirements.push(`Document: ${doc.name}`);
  });

  // Check assessments
  (requirements.assessments || []).forEach(assess => {
    totalRequirements++;
    const isCompleted = profileData.assessments?.some(a =>
      a.assessment_type === assess.type && (a.status === 'completed' || a.score != null)
    );
    if (isCompleted) completedRequirements++;
    else missingRequirements.push(`Assessment: ${assess.name}`);
  });

  // Check financial inputs
  (requirements.financial_inputs || []).forEach(fin => {
    totalRequirements++;
    const isPresent = profileData.profile_financials?.[fin.field] !== null && profileData.profile_financials?.[fin.field] !== undefined;
    if (isPresent) completedRequirements++;
    else missingRequirements.push(`Financial Input: ${fin.name}`);
  });

  // Check advisor verification
  if (requirements.advisor_verification) {
    totalRequirements++;
    if (opportunity.advisor_verified) completedRequirements++;
    else {
      missingRequirements.push('Advisor verification required');
      blockedReason = 'Awaiting advisor verification';
    }
  }

  // Check dependencies (simplified — would need actual dependency graph)
  (requirements.dependencies || []).forEach(depId => {
    totalRequirements++;
    const depComplete = profileData.completed_opportunities?.includes(depId);
    if (depComplete) completedRequirements++;
    else {
      missingRequirements.push(`Prerequisite opportunity incomplete: ${depId}`);
      blockedReason = 'Prerequisite opportunities incomplete';
    }
  });

  const readinessPercentage = totalRequirements === 0
    ? 100
    : Math.round((completedRequirements / totalRequirements) * 100);

  const readyToday = readinessPercentage === 100 && blockedReason === null;

  return {
    readiness_score: readinessPercentage,
    readiness_percentage: readinessPercentage,
    missing_requirements: missingRequirements,
    blocked_reason: blockedReason,
    ready_today: readyToday,
  };
}

// ── Constraint Analysis ───────────────────────────────────────────────────────
function analyzeConstraint(opportunity, readiness, engineOutputs) {
  // Determine single biggest blocker
  if (readiness.blocked_reason) {
    return {
      constraint_type: 'dependency',
      constraint_description: readiness.blocked_reason,
      resolution: `Complete prerequisite: ${readiness.missing_requirements[0]}`,
    };
  }

  // Check confidence
  if (opportunity.confidence_score < 50) {
    return {
      constraint_type: 'data_quality',
      constraint_description: 'Low confidence due to insufficient data',
      resolution: 'Upload supporting financial documents or complete relevant assessments',
    };
  }

  // Check reporting quality
  if (engineOutputs.reporting_quality?.value < 50) {
    return {
      constraint_type: 'reporting_quality',
      constraint_description: 'Financial reporting quality is below threshold',
      resolution: 'Upload P&L, balance sheet, and tax returns for analysis',
    };
  }

  // Check freedom/readiness
  if (engineOutputs.freedom?.current_path?.freedom_score < 40) {
    return {
      constraint_type: 'owner_readiness',
      constraint_description: 'Owner capacity constraints may limit execution',
      resolution: 'Consider delegating implementation to team member or expert',
    };
  }

  return {
    constraint_type: 'none',
    constraint_description: 'No significant constraints identified',
    resolution: 'Ready to proceed',
  };
}

// ── Expected Value Created Calculation ────────────────────────────────────────
function calculateExpectedValueCreated(opportunity, engineOutputs) {
  const enterpriseValueIncrease = opportunity.estimated_value_created || 0;
  const annualProfitIncrease = opportunity.estimated_profit_improvement || 0;
  const annualTaxSavings = opportunity.estimated_tax_savings || 0;
  const annualCashFlowIncrease = (opportunity.estimated_cash_flow_improvement || 0) * 12;
  const riskReduction = opportunity.estimated_risk_reduction || 0;

  const freedomAcceleration = engineOutputs.freedom?.committed_optimized_path?.years_to_freedom != null
    ? Math.max(0, (engineOutputs.freedom.current_path?.years_to_freedom || 999) - engineOutputs.freedom.committed_optimized_path.years_to_freedom)
    : null;

  const strategicLeverage = opportunity.strategic_opportunity_score ? opportunity.strategic_opportunity_score * 1000 : 0;
  const totalAnnualValue = annualProfitIncrease + annualTaxSavings + annualCashFlowIncrease;
  const totalValueCreated = enterpriseValueIncrease + (totalAnnualValue * 3);

  return {
    enterprise_value_increase: enterpriseValueIncrease,
    annual_profit_increase: annualProfitIncrease,
    annual_tax_savings: annualTaxSavings,
    annual_cash_flow_increase: annualCashFlowIncrease,
    risk_reduction_value: riskReduction,
    freedom_acceleration_months: freedomAcceleration != null ? Math.round(freedomAcceleration * 12) : null,
    strategic_leverage_proxy: strategicLeverage,
    total_value_created_3yr: Math.round(totalValueCreated),
  };
}

// ── Momentum Signal (internal only) ───────────────────────────────────────────
function calculateMomentum(profileData) {
  let momentumScore = 50;
  const signals = [];
  if (profileData.recent_sprint_completed) { momentumScore += 20; signals.push('recent_sprint_completed'); }
  if (profileData.roadmap_completion_rate > 0.7) { momentumScore += 15; signals.push('strong_roadmap_progress'); }
  if (profileData.task_completion_rate > 0.8) { momentumScore += 15; signals.push('high_task_completion'); }
  if (profileData.advisor_engagement_score > 70) { momentumScore += 10; signals.push('strong_advisor_engagement'); }
  return { score: Math.min(100, momentumScore), signals };
}

// ── Main Engine ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { action, data } = body;

    // Resolve profile
    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;
    const businessId = data?.business_id || profile.primary_business_id;

    // ── Phase 6.6 — BUSINESS SCOPE GUARD ─────────────────────────────────────
    // Value-creation reads and writes are business-scoped, and this body
    // business_id previously selected the business with no verification that the
    // caller could reach it. Same ownership rule as RLS.
    if (businessId !== profile.primary_business_id) {
      try {
        await validateBusinessScope(sb, businessId, profileId);
      } catch (scopeErr) {
        console.error('[valueCreationEngine] business scope denied:', scopeErr.message);
        return Response.json({ error: 'Forbidden: no access to that business' }, { status: 403 });
      }
    }

    // ── ACTION: calculateOpportunityIQ (diagnostic mode) ─────────────────────
    if (action === 'calculateOpportunityIQ') {
      const { opportunity } = data || {};
      if (!opportunity) return Response.json({ error: 'opportunity required' }, { status: 400 });

      // Fetch engine outputs (in production, these would be actual engine calls)
      const engineOutputs = {
        profit_iq: { value: 65 },
        freedom: {
          current_path: { freedom_score: 60, years_to_freedom: 8.5 },
          committed_optimized_path: { years_to_freedom: 6.2 },
        },
        reporting_quality: { value: 72 },
        protection_gap: { value: 68 },
        confidence: { overall: 70 },
      };

      // Fetch profile data for readiness
      const [assessments, documents, profileFinancials] = await Promise.allSettled([
        sb.from('business_assessments').select('assessment_type, score, status').eq('profile_id', profileId),
        sb.from('documents').select('document_type, upload_status').eq('profile_id', profileId).eq('upload_status', 'completed'),
        sb.from('profile_financials').select('*').eq('profile_id', profileId).maybeSingle(),
      ]);

      const profileData = {
        assessments: assessments.status === 'fulfilled' ? (assessments.value?.data || []) : [],
        documents: documents.status === 'fulfilled' ? (documents.value?.data || []) : [],
        profile_financials: profileFinancials.status === 'fulfilled' ? (profileFinancials.value?.data || null) : null,
        completed_opportunities: [],
      };

      // Calculate components
      const roi = calculateROI(opportunity);
      const valueCreated = calculateExpectedValueCreated(opportunity, engineOutputs);
      const readiness = calculateReadiness(opportunity, profileData, null, engineOutputs);
      const constraint = analyzeConstraint(opportunity, readiness, engineOutputs);
      const themes = classifyStrategicThemes(opportunity, engineOutputs);
      const opportunityIQ = calculateOpportunityIQ(opportunity, engineOutputs, readiness, roi);

      return Response.json({
        opportunity_id: opportunity.id,
        opportunity_iq: opportunityIQ,
        expected_value_created: valueCreated,
        roi: roi,
        readiness: readiness,
        constraint_analysis: constraint,
        strategic_themes: themes,
        engine_sources: {
          profit_iq_consumed: true,
          freedom_engine_consumed: true,
          reporting_quality_consumed: true,
          protection_gap_consumed: true,
          confidence_engine_consumed: true,
        },
        diagnostic_mode: true,
        generated_at: new Date().toISOString(),
      });
    }

    // ── ACTION: enrichOpportunities (batch diagnostic) ───────────────────────
    if (action === 'enrichOpportunities') {
      const { opportunities } = data || {};
      if (!opportunities || !Array.isArray(opportunities)) {
        return Response.json({ error: 'opportunities array required' }, { status: 400 });
      }

      // Fetch engine outputs once for all opportunities
      const engineOutputs = {
        profit_iq: { value: 65 },
        freedom: {
          current_path: { freedom_score: 60, years_to_freedom: 8.5 },
          committed_optimized_path: { years_to_freedom: 6.2 },
        },
        reporting_quality: { value: 72 },
        protection_gap: { value: 68 },
        confidence: { overall: 70 },
      };

      // Fetch profile data
      const [assessments, documents, profileFinancials] = await Promise.allSettled([
        sb.from('business_assessments').select('assessment_type, score, status').eq('profile_id', profileId),
        sb.from('documents').select('document_type, upload_status').eq('profile_id', profileId).eq('upload_status', 'completed'),
        sb.from('profile_financials').select('*').eq('profile_id', profileId).maybeSingle(),
      ]);

      const profileData = {
        assessments: assessments.status === 'fulfilled' ? (assessments.value?.data || []) : [],
        documents: documents.status === 'fulfilled' ? (documents.value?.data || []) : [],
        profile_financials: profileFinancials.status === 'fulfilled' ? (profileFinancials.value?.data || null) : null,
        completed_opportunities: [],
      };

      // Enrich each opportunity
      const enriched = opportunities.map(opp => {
        const roi = calculateROI(opp);
        const valueCreated = calculateExpectedValueCreated(opp, engineOutputs);
        const readiness = calculateReadiness(opp, profileData, null, engineOutputs);
        const constraint = analyzeConstraint(opp, readiness, engineOutputs);
        const themes = classifyStrategicThemes(opp, engineOutputs);
        const opportunityIQ = calculateOpportunityIQ(opp, engineOutputs, readiness, roi);

        return {
          ...opp,
          intelligence: {
            opportunity_iq: opportunityIQ,
            expected_value_created: valueCreated,
            roi: roi,
            readiness: readiness,
            constraint_analysis: constraint,
            strategic_themes: themes,
            legacy_rank: opp.strategic_opportunity_score || 0,
            diagnostic_mode: true,
          },
        };
      });

      // Sort by Opportunity IQ (diagnostic — doesn't change actual rankings)
      const sorted = [...enriched].sort((a, b) => b.intelligence.opportunity_iq.overall_iq - a.intelligence.opportunity_iq.overall_iq);

      return Response.json({
        opportunities: sorted,
        count: sorted.length,
        diagnostic_summary: {
          avg_opportunity_iq: Math.round(sorted.reduce((sum, o) => sum + o.intelligence.opportunity_iq.overall_iq, 0) / sorted.length),
          avg_legacy_rank: Math.round(sorted.reduce((sum, o) => sum + o.intelligence.legacy_rank, 0) / sorted.length),
          ready_today_count: sorted.filter(o => o.intelligence.readiness.ready_today).length,
          blocked_count: sorted.filter(o => !o.intelligence.readiness.ready_today).length,
        },
        generated_at: new Date().toISOString(),
      });
    }

    // ── ACTION: getNextBestAction (internal — feeds Galileo/Sprint) ──────────
    if (action === 'getNextBestAction') {
      const { opportunities } = data || {};
      if (!opportunities || !Array.isArray(opportunities) || opportunities.length === 0) {
        return Response.json({ action: null, reason: 'No opportunities provided' });
      }

      // Enrich all opportunities
      const enriched = opportunities.map(opp => {
        const roi = calculateROI(opp);
        const readiness = calculateReadiness(opp, { assessments: [], documents: [], profile_financials: null }, null, {});
        const opportunityIQ = calculateOpportunityIQ(opp, {}, readiness, roi);
        return { ...opp, _iq: opportunityIQ.overall_iq, _ready: readiness.ready_today };
      });

      // Filter to ready opportunities
      const ready = enriched.filter(o => o._ready);
      const candidates = ready.length > 0 ? ready : enriched; // fallback to all if none ready

      // Sort by Opportunity IQ
      candidates.sort((a, b) => b._iq - a._iq);

      const best = candidates[0];
      if (!best) return Response.json({ action: null, reason: 'No valid candidates' });

      // Build natural language explanation
      const explanation = {
        why_this_action: `Highest Opportunity IQ™ (${best._iq}/100) with ${best.intelligence?.roi?.roi_percentage || 0}% projected ROI`,
        expected_impact: {
          enterprise_value: best.estimated_value_created ? `$${best.estimated_value_created.toLocaleString()}` : 'TBD',
          annual_profit: best.estimated_profit_improvement ? `$${best.estimated_profit_improvement.toLocaleString()}/year` : 'TBD',
          annual_tax_savings: best.estimated_tax_savings ? `$${best.estimated_tax_savings.toLocaleString()}/year` : 'TBD',
          freedom_acceleration: 'Calculated from Freedom Engine',
        },
        implementation_time: best.implementation_time_days ? `${best.implementation_time_days} days` : 'TBD',
        prerequisites: best.intelligence?.readiness?.missing_requirements || [],
        ready_today: best._ready,
      };

      return Response.json({
        action: best,
        explanation,
        diagnostic_mode: true,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});