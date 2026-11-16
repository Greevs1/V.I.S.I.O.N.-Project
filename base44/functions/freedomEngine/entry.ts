/**
 * freedomEngine — Phase 2C-A Step 3
 *
 * Calculates Profile-scoped Freedom metrics with Current vs Optimized Path comparison.
 * Freedom is NEVER calculated by business — businesses contribute inputs only.
 *
 * CORRECTIONS APPLIED:
 * 1. Annual Wealth Contribution — annualized formula only (no monthly mixing)
 * 2. Optimized Path Tiers — committed (verified) vs potential (estimated)
 * 3. Output Structure — three paths with improvement sources
 * 4. Business Valuation Priority — 5-tier hierarchy with warnings
 * 5. Freedom Score — gap ratio primary, assessment influences confidence only
 *
 * SAFETY: Read-only. Profile-scoped only. Additive.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

// Phase 2F Benchmark Library — Deterministic Assumptions (NOT Knowledge Base)
const DEFAULT_SWR = 0.04;
const DEFAULT_INFLATION = 0.03;
const DEFAULT_TAX_DRAG = 0.25;
const DEFAULT_VALUATION_MULTIPLE = 4;

const VALUATION_METHODS = {
  VERIFIED_EV: 'verified_enterprise_value',
  ESTIMATED_EV: 'estimated_enterprise_value',
  EBITDA_MULTIPLE: 'normalized_ebitda_x_industry_multiple',
  EBITDA_PROXY: 'ebitda_proxy_multiple',
  PROFIT_PROXY: 'net_profit_proxy_multiple'
};

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
    const { swr_override, inflation_override, tax_drag_override, lifestyle_adjustment_override } = body;

    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;

    const warnings = [];

    // Fetch freedom assessment
    const { data: freedomAssessment } = await sb
      .from('business_assessments')
      .select('assessment_type, score')
      .eq('profile_id', profileId)
      .eq('assessment_type', 'freedom_assessment')
      .maybeSingle();

    // Fetch dashboard metrics with expanded valuation fields
    const { data: dmRow } = await sb
      .from('dashboard_metrics')
      .select('verified_enterprise_value, estimated_enterprise_value, recast_ebitda, enterprise_value, net_profit, revenue, industry')
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch ownership data
    let ownershipRows = [];
    try {
      const { data: owRows } = await sb.from('business_owners').select('business_id, ownership_percentage').eq('profile_id', profileId);
      ownershipRows = owRows || [];
    } catch (_) { /* table may not exist */ }

    // Fetch profile financials
    let profileFinancials = null;
    try {
      const { data: pf } = await sb.from('profile_financials').select('*').eq('profile_id', profileId).maybeSingle();
      profileFinancials = pf || null;
    } catch (_) { /* table may not exist */ }

    // Fetch value creation events
    let valueCreationEvents = [];
    try {
      const { data: vce } = await sb.from('value_creation_events').select('category, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, status, advisor_verified').eq('profile_id', profileId);
      valueCreationEvents = vce || [];
    } catch (_) { /* table may not exist */ }

    // Fetch galileo opportunities
    let galileoOpps = [];
    try {
      const { data: go } = await sb.from('galileo_opportunities').select('id, category, estimated_value_created, estimated_tax_savings, estimated_cash_flow_improvement, estimated_profit_improvement, confidence_score, status, advisor_verified').eq('profile_id', profileId);
      galileoOpps = go || [];
    } catch (_) { /* table may not exist */ }

    // Resolve assumptions
    const swr = swr_override || DEFAULT_SWR;
    const inflation = inflation_override || DEFAULT_INFLATION;
    const taxDrag = tax_drag_override || DEFAULT_TAX_DRAG;

    // CORRECTION #1: Annual Lifestyle Need (annualized only)
    const annualExpenses = profileFinancials?.annual_personal_expenses || null;
    const lifestyleAdjustment = lifestyle_adjustment_override || profileFinancials?.desired_lifestyle_adjustment || 0;
    const passiveIncome = profileFinancials?.passive_income || 0;

    if (!annualExpenses) {
      warnings.push('Annual lifestyle expenses not found in profile_financials — Freedom Number cannot be calculated precisely');
    }

    const annualLifestyleNeed = annualExpenses
      ? Math.max(0, (annualExpenses + lifestyleAdjustment) / (1 - taxDrag))
      : null;

    const inflationAdjustedNeed = annualLifestyleNeed ? annualLifestyleNeed * (1 + inflation) : null;

    // CORRECTION #4: Business Valuation Priority
    let businessEquityContribution = 0;
    let businessCashFlowContribution = 0;
    let valuationMethodUsed = VALUATION_METHODS.PROFIT_PROXY;

    const hasOwnershipData = ownershipRows && ownershipRows.length > 0;

    if (hasOwnershipData) {
      for (const row of ownershipRows) {
        const ownershipPct = (row.ownership_percentage || 100) / 100;

        if (dmRow?.verified_enterprise_value) {
          businessEquityContribution += dmRow.verified_enterprise_value * ownershipPct;
          valuationMethodUsed = VALUATION_METHODS.VERIFIED_EV;
        } else if (dmRow?.estimated_enterprise_value) {
          businessEquityContribution += dmRow.estimated_enterprise_value * ownershipPct;
          valuationMethodUsed = VALUATION_METHODS.ESTIMATED_EV;
        } else if (dmRow?.recast_ebitda) {
          const bizEV = dmRow.recast_ebitda * DEFAULT_VALUATION_MULTIPLE;
          businessEquityContribution += bizEV * ownershipPct;
          valuationMethodUsed = VALUATION_METHODS.EBITDA_MULTIPLE;
        } else if (dmRow?.net_profit) {
          const bizEV = dmRow.net_profit * DEFAULT_VALUATION_MULTIPLE;
          businessEquityContribution += bizEV * ownershipPct;
          valuationMethodUsed = VALUATION_METHODS.EBITDA_PROXY;
          warnings.push('Business equity estimated using EBITDA proxy (net_profit × 4) — upload verified valuation for accuracy');
        }

        if (dmRow?.net_profit) {
          businessCashFlowContribution += dmRow.net_profit * ownershipPct;
        }
      }
    } else if (dmRow?.net_profit) {
      businessEquityContribution = dmRow.net_profit * DEFAULT_VALUATION_MULTIPLE;
      businessCashFlowContribution = dmRow.net_profit;
      valuationMethodUsed = VALUATION_METHODS.PROFIT_PROXY;
      warnings.push('Business equity estimated using net_profit × 4 fallback — no ownership data available');
    }

    // Current Investable Net Worth
    const personalAssets = profileFinancials?.investable_assets || null;
    const personalDebt = profileFinancials?.total_personal_debt || 0;

    let currentInvestableNetWorth = null;
    if (personalAssets !== null || businessEquityContribution > 0) {
      currentInvestableNetWorth = (personalAssets || 0) + businessEquityContribution - personalDebt;
    } else {
      warnings.push('Personal assets not found in profile_financials — Freedom Gap cannot be calculated');
    }

    // CORRECTION #1: Annual Wealth Contribution (annualized)
    let verifiedTaxSavings = 0;
    let verifiedProfitImprovement = 0;
    let verifiedDebtReductionImpact = 0;

    valueCreationEvents.forEach(event => {
      if (event.status === 'implemented' || event.advisor_verified) {
        if (event.category === 'tax_optimization' && event.estimated_tax_savings) {
          verifiedTaxSavings += event.estimated_tax_savings;
        }
        if (event.category === 'profit_improvement' && event.estimated_profit_improvement) {
          verifiedProfitImprovement += event.estimated_profit_improvement;
        }
        if (event.category === 'debt_reduction' && event.estimated_value_created) {
          verifiedDebtReductionImpact += event.estimated_value_created;
        }
      }
    });

    const currentAnnualWealthContribution = businessCashFlowContribution + passiveIncome + verifiedTaxSavings + verifiedProfitImprovement + verifiedDebtReductionImpact - (annualLifestyleNeed || 0);

    // CORRECTION #5: Freedom Score (gap ratio primary)
    const assessmentScore = freedomAssessment?.score || null;
    let freedomScore = null;

    if (annualLifestyleNeed !== null && currentInvestableNetWorth !== null && annualLifestyleNeed > 0) {
      const fundedRatio = Math.min(1, currentInvestableNetWorth / (annualLifestyleNeed / swr));
      freedomScore = Math.max(0, Math.min(100, Math.round(fundedRatio * 100)));
    } else if (assessmentScore) {
      freedomScore = assessmentScore;
      warnings.push('Freedom Score based on assessment only — provide financial data for gap-based calculation');
    }

    // Phase 2F Evidence Object
    const evidence = [];
    const missingEvidence = [];
    const staleEvidence = [];
    const conflictingEvidence = [];
    let confidenceReason = 'insufficient_evidence';

    // Track valuation evidence with authority levels
    if (dmRow?.verified_enterprise_value) {
      evidence.push({ type: 'valuation', source: 'verified_enterprise_value', authority_level: 'primary', value: dmRow.verified_enterprise_value, verified: true });
    } else if (dmRow?.estimated_enterprise_value) {
      evidence.push({ type: 'valuation', source: 'estimated_enterprise_value', authority_level: 'secondary', value: dmRow.estimated_enterprise_value, verified: false });
    } else if (dmRow?.recast_ebitda) {
      evidence.push({ type: 'valuation', source: 'ebitda_multiple', authority_level: 'derived', value: dmRow.recast_ebitda * DEFAULT_VALUATION_MULTIPLE, verified: false });
    } else if (dmRow?.net_profit) {
      evidence.push({ type: 'valuation', source: 'profit_proxy', authority_level: 'proxy', value: dmRow.net_profit * DEFAULT_VALUATION_MULTIPLE, verified: false });
    }

    // Track ownership evidence
    if (ownershipRows && ownershipRows.length > 0) {
      evidence.push({ type: 'ownership', source: 'business_owners', authority_level: 'primary', records: ownershipRows.length, verified: true });
    } else {
      missingEvidence.push({ type: 'ownership_data', name: 'Ownership percentages', priority: 'high' });
    }

    // Track profile financials evidence
    if (profileFinancials) {
      if (profileFinancials.annual_personal_expenses) {
        evidence.push({ type: 'financial_statement', source: 'profile_financials', field: 'annual_personal_expenses', authority_level: 'assessment', verified: true });
      } else {
        missingEvidence.push({ type: 'financial_input', name: 'Annual personal expenses', priority: 'critical' });
      }
      if (profileFinancials.investable_assets != null) {
        evidence.push({ type: 'financial_statement', source: 'profile_financials', field: 'investable_assets', authority_level: 'assessment', verified: true });
      }
    } else {
      missingEvidence.push({ type: 'financial_input', name: 'Profile financials', priority: 'critical' });
    }

    // Track verified improvements evidence
    if (valueCreationEvents && valueCreationEvents.length > 0) {
      const verified = valueCreationEvents.filter(e => e.advisor_verified || e.status === 'implemented');
      if (verified.length > 0) {
        evidence.push({ type: 'value_creation', source: 'verified_events', count: verified.length, authority_level: 'primary', verified: true });
      }
    }

    // Track galileo opportunities evidence
    if (galileoOpps && galileoOpps.length > 0) {
      const activeOpps = galileoOpps.filter(o => ['active', 'completed'].includes(o.status));
      if (activeOpps.length > 0) {
        evidence.push({ type: 'opportunity', source: 'galileo_opportunities', count: activeOpps.length, authority_level: 'estimated', verified: false });
      }
    }

    // Determine confidence reason
    if (!annualExpenses) {
      confidenceReason = 'no_lifestyle_expenses';
    } else if (!currentInvestableNetWorth) {
      confidenceReason = 'no_net_worth_data';
    } else if (valuationMethodUsed === VALUATION_METHODS.PROFIT_PROXY) {
      confidenceReason = 'proxy_valuation';
    } else if (valuationMethodUsed === VALUATION_METHODS.VERIFIED_EV) {
      confidenceReason = 'verified_financial_analysis';
    } else {
      confidenceReason = 'estimated_valuation';
    }

    const hasFinancials = annualExpenses !== null && currentInvestableNetWorth !== null;
    let confScore = hasFinancials ? 55 : 30;
    if (assessmentScore && hasFinancials) {
      confScore = Math.min(85, confScore + Math.round((assessmentScore - 50) * 0.3));
    }

    // CORRECTION #2: Optimized Path Tiers
    const calculateOptimisticImprovements = (includeEstimated) => {
      let taxSavings = verifiedTaxSavings;
      let profitImprovement = verifiedProfitImprovement;
      let valueCreation = 0;
      let cashFlowImprovement = 0;

      galileoOpps.forEach(opp => {
        if (opp.status === 'active' || opp.status === 'completed') {
          const weight = opp.advisor_verified ? 1.0 : 0.8;
          if (opp.category === 'tax_optimization' && opp.estimated_tax_savings) {
            taxSavings += opp.estimated_tax_savings * weight;
          }
          if (opp.category === 'profit_improvement' && opp.estimated_profit_improvement) {
            profitImprovement += opp.estimated_profit_improvement * weight;
          }
        }
      });

      if (includeEstimated) {
        galileoOpps.forEach(opp => {
          if (opp.confidence_score >= 70) {
            const weight = opp.confidence_score >= 90 ? 0.6 : 0.5;
            if (opp.category === 'cash_flow' && opp.estimated_cash_flow_improvement) {
              cashFlowImprovement += opp.estimated_cash_flow_improvement * weight;
            }
            if (opp.category === 'value_creation' && opp.estimated_value_created) {
              valueCreation += opp.estimated_value_created * weight;
            }
          }
        });
      }

      return { taxSavings, profitImprovement, valueCreation, cashFlowImprovement };
    };

    const committedImprovements = calculateOptimisticImprovements(false);
    const potentialImprovements = calculateOptimisticImprovements(true);

    // Build Path Objects
    const buildPath = (netWorth, wealthContribution, improvementSources = []) => {
      const pathFreedomNumber = inflationAdjustedNeed != null ? Math.round(inflationAdjustedNeed / swr) : null;
      const pathFreedomGap = (pathFreedomNumber !== null && netWorth !== null)
        ? Math.max(0, pathFreedomNumber - netWorth)
        : null;

      let yearsToFreedom = null;
      if (wealthContribution > 0 && pathFreedomGap !== null && pathFreedomGap > 0) {
        yearsToFreedom = Math.round(pathFreedomGap / wealthContribution * 10) / 10;
      } else if (pathFreedomGap === 0) {
        yearsToFreedom = 0;
      } else if (wealthContribution <= 0) {
        yearsToFreedom = null;
      }

      return {
        freedom_number: pathFreedomNumber,
        investable_net_worth: netWorth ? Math.round(netWorth) : null,
        freedom_gap: pathFreedomGap ? Math.round(pathFreedomGap) : null,
        annual_wealth_contribution: Math.round(wealthContribution),
        years_to_freedom: yearsToFreedom,
        improvement_sources: improvementSources
      };
    };

    // Current Path
    const currentPath = buildPath(currentInvestableNetWorth, currentAnnualWealthContribution, []);

    // Committed Optimized Path
    const committedNetWorth = (currentInvestableNetWorth || 0) + committedImprovements.valueCreation;
    const committedWealthContribution = businessCashFlowContribution + passiveIncome + committedImprovements.taxSavings + committedImprovements.profitImprovement - (annualLifestyleNeed || 0);
    const committedSources = [];
    if (committedImprovements.taxSavings > verifiedTaxSavings) {
      committedSources.push({ type: 'tax_savings', amount: Math.round(committedImprovements.taxSavings - verifiedTaxSavings), verified: true });
    }
    if (committedImprovements.profitImprovement > verifiedProfitImprovement) {
      committedSources.push({ type: 'profit_improvement', amount: Math.round(committedImprovements.profitImprovement - verifiedProfitImprovement), verified: true });
    }
    const committedOptimizedPath = buildPath(committedNetWorth, committedWealthContribution, committedSources);

    // Potential Optimized Path
    const potentialNetWorth = (currentInvestableNetWorth || 0) + potentialImprovements.valueCreation;
    const potentialWealthContribution = businessCashFlowContribution + passiveIncome + potentialImprovements.taxSavings + potentialImprovements.profitImprovement + potentialImprovements.cashFlowImprovement - (annualLifestyleNeed || 0);
    const potentialSources = [];
    if (potentialImprovements.taxSavings > committedImprovements.taxSavings) {
      potentialSources.push({ type: 'tax_savings', amount: Math.round(potentialImprovements.taxSavings - committedImprovements.taxSavings), verified: false });
    }
    if (potentialImprovements.profitImprovement > committedImprovements.profitImprovement) {
      potentialSources.push({ type: 'profit_improvement', amount: Math.round(potentialImprovements.profitImprovement - committedImprovements.profitImprovement), verified: false });
    }
    if (potentialImprovements.cashFlowImprovement > 0) {
      potentialSources.push({ type: 'cash_flow_improvement', amount: Math.round(potentialImprovements.cashFlowImprovement), verified: false });
    }
    if (potentialImprovements.valueCreation > committedImprovements.valueCreation) {
      potentialSources.push({ type: 'value_creation', amount: Math.round(potentialImprovements.valueCreation - committedImprovements.valueCreation), verified: false });
    }
    const potentialOptimizedPath = buildPath(potentialNetWorth, potentialWealthContribution, potentialSources);

    // Build freedom result object with Evidence Object
    const freedom_result = engineOutput(
      {
        current_path: currentPath,
        committed_optimized_path: committedOptimizedPath,
        potential_optimized_path: potentialOptimizedPath,
      },
      'profile',
      METHODOLOGY_VERSION,
      BENCHMARK_VERSION,
      evidence,
      confScore,
      confidenceReason,
      missingEvidence,
      staleEvidence,
      conflictingEvidence,
      missingEvidence.length > 0 ? missingEvidence[0] : null,
      warnings,
      confScore >= 85
    );

    return Response.json({
      freedom_result,
      current_path: currentPath,
      committed_optimized_path: committedOptimizedPath,
      potential_optimized_path: potentialOptimizedPath,
      improvement_sources: {
        committed: committedSources,
        potential: potentialSources
      },
      assumptions: {
        safe_withdrawal_rate: swr,
        tax_drag: taxDrag,
        inflation: inflation,
        valuation_method_used: valuationMethodUsed
      },
      warnings,
      scope_declaration: {
        scope: 'profile',
        rule: 'Freedom is ALWAYS profile-scoped. Businesses contribute cash flow and equity INPUTS only.',
        business_id_filter: 'PROHIBITED for Freedom calculations'
      },
      engine_meta: {
        profile_id: profileId,
        generated_at: new Date().toISOString(),
        data_gaps: warnings.filter(w => w.includes('not found')),
        calculation_method: 'annual_wealth_contribution = business_cash_flow + passive_income + verified_improvements - annual_lifestyle_need',
        methodology_version: METHODOLOGY_VERSION,
        benchmark_version: BENCHMARK_VERSION,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});