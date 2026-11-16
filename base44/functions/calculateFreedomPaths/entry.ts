/**
 * calculateFreedomPaths - Comprehensive freedom trajectory calculations
 * Uses actual user data from assessments, documents, metrics, and value creation events
 * Returns 3 paths: Current (A), Recommended V.I.S.I.O.N. (B), Fully Optimized (C)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL').replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));

    // Get user profile
    const { data: profile } = await sb.from('profiles').select('*').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    // Phase 6.9B — the explicit businessId from the Business Context Engine is
    // resolved through the canonical contract instead of silently falling back to
    // `profile.primary_business_id` for a multi-business account.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, body.businessId, 'calculateFreedomPaths'
    );
    if (bizDenial) return bizDenial;
    if (!businessId) return Response.json({ error: 'No business associated', requiresOnboarding: true }, { status: 400 });

    // ── Phase 6.6 — BUSINESS SCOPE GUARD ─────────────────────────────────────
    // Freedom paths aggregate business-scoped assessment, sprint and projection
    // data through the service-role client, and `body.businessId` previously
    // selected the business with no verification of the caller's relationship
    // to it. Same ownership rule as RLS: owner / assigned advisor / team member.
    if (businessId !== profile.primary_business_id) {
      try {
        await validateBusinessScope(sb, businessId, profile.id);
      } catch (scopeErr) {
        console.error('[calculateFreedomPaths] business scope denied:', scopeErr.message);
        return Response.json({ error: 'Forbidden: no access to that business' }, { status: 403 });
      }
    }

    // ── DATA AGGREGATION ──────────────────────────────────────────────────────
    
    // 1. Dashboard Metrics (latest)
    const { data: metrics } = await sb.from('dashboard_metrics').select('*').eq('profile_id', profile.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    
    // 2. Latest Metric Snapshot
    const { data: snapshot } = await sb.from('business_metric_snapshots').select('*').eq('profile_id', profile.id).eq('is_latest', true).maybeSingle();
    
    // 3. Business Assessments
    const { data: assessments } = await sb.from('business_assessments').select('*').eq('profile_id', profile.id).in('assessment_type', ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'freedom_assessment']);
    const assessmentsByType = (assessments || []).reduce((acc, a) => { acc[a.assessment_type] = a; return acc; }, {});
    
    // 4. Value Creation Events
    const { data: valueEvents } = await sb.from('value_creation_events').select('*').eq('business_id', businessId).in('status', ['verified', 'implemented']);
    
    // 5. Profile Financials
    const { data: profileFinancials } = await sb.from('profile_financials').select('*').eq('profile_id', profile.id).maybeSingle();
    
    // 6. Business Entity
    const { data: business } = await sb.from('businesses').select('*').eq('id', businessId).maybeSingle();

    // ── DATA EXTRACTION WITH CONFIDENCE TRACKING ─────────────────────────────
    
    const trackData = (value, source, assumption = null) => {
      const hasValue = value != null && value !== '';
      return {
        value: hasValue ? value : null,
        source: hasValue ? source : 'assumption',
        assumption,
        confidence: hasValue ? 'high' : (assumption ? 'low' : 'medium')
      };
    };

    // 1. Current Freedom Number (target net worth for freedom)
    const freedomNumberData = (() => {
      // From freedom assessment or assumption based on lifestyle
      const fromAssessment = assessmentsByType['freedom_assessment']?.data?.target_freedom_number;
      if (fromAssessment) return trackData(fromAssessment, 'freedom_assessment');
      
      // Assumption: 25x annual expenses (4% rule)
      const annualExpenses = (metrics?.annual_revenue || 500000) * 0.6; // Assume 60% expense ratio
      const assumed = annualExpenses * 25;
      return trackData(assumed, 'assumption', '25x annual expenses (4% safe withdrawal rate)');
    })();

    // 2. Current Investable Assets
    const investableAssetsData = (() => {
      const fromSnapshot = snapshot?.investable_assets || snapshot?.cash_on_hand;
      if (fromSnapshot) return trackData(fromSnapshot, 'business_metric_snapshot');
      
      const fromFinancials = profileFinancials?.investable_assets;
      if (fromFinancials) return trackData(fromFinancials, 'profile_financials');
      
      // Assumption: 10% of revenue as retained earnings
      const assumed = (metrics?.annual_revenue || 500000) * 0.1;
      return trackData(assumed, 'assumption', '10% of annual revenue as retained earnings');
    })();

    // 3. Current Savings Rate (annual)
    const savingsRateData = (() => {
      const fromFinancials = profileFinancials?.annual_savings_rate;
      if (fromFinancials) return trackData(fromFinancials, 'profile_financials', null, true);
      
      // Calculate from net profit margin
      const netProfit = metrics?.net_profit || metrics?.net_profit_margin;
      if (netProfit) {
        const rate = typeof netProfit === 'number' ? (netProfit > 100 ? netProfit / (metrics?.annual_revenue || 1) : netProfit) : 0.15;
        return trackData(rate, 'calculated_from_metrics');
      }
      
      // Assumption: 15% of net profit
      const assumed = 0.15;
      return trackData(assumed, 'assumption', '15% of net profit saved annually');
    })();

    // 4. Current Business Value
    const currentBusinessValueData = (() => {
      const fromSnapshot = snapshot?.current_business_value || snapshot?.enterprise_value;
      if (fromSnapshot) return trackData(fromSnapshot, 'business_metric_snapshot');
      
      const fromMetrics = metrics?.enterprise_value;
      if (fromMetrics) return trackData(fromMetrics, 'dashboard_metrics');
      
      const fromAssessment = assessmentsByType['value_gap']?.estimated_opportunity_value;
      if (fromAssessment) return trackData(fromAssessment, 'value_gap_assessment');
      
      // Assumption: 4x EBITDA
      const ebitda = metrics?.ebitda || metrics?.recast_ebitda || (metrics?.annual_revenue || 500000) * 0.15;
      const assumed = ebitda * 4;
      return trackData(assumed, 'assumption', '4x EBITDA multiple');
    })();

    // 5. Current Business Growth Rate
    const growthRateData = (() => {
      const fromBusiness = business?.yoy_growth_rate;
      if (fromBusiness) return trackData(fromBusiness, 'business_entity');
      
      const fromAssessment = assessmentsByType['profit_gap']?.data?.current_growth_rate;
      if (fromAssessment) return trackData(fromAssessment, 'profit_gap_assessment');
      
      // Assumption: 8% annual growth (SMB average)
      const assumed = 0.08;
      return trackData(assumed, 'assumption', '8% annual growth (SMB industry average)');
    })();

    // 6. Estimated Value Creation Opportunities (sum of verified + implemented events)
    const valueOpportunitiesData = (() => {
      const total = (valueEvents || []).reduce((sum, e) => {
        return sum + (e.verified_value || e.estimated_impact || 0);
      }, 0);
      
      if (total > 0) return trackData(total, 'value_creation_events');
      
      // From gap assessments
      const profitGap = assessmentsByType['profit_gap']?.estimated_opportunity_value || 0;
      const valueGap = assessmentsByType['value_gap']?.estimated_opportunity_value || 0;
      const taxGap = assessmentsByType['tax_gap']?.estimated_opportunity_value || 0;
      const opsGap = assessmentsByType['operations_gap']?.estimated_opportunity_value || 0;
      
      const fromGaps = profitGap + valueGap + taxGap + opsGap;
      if (fromGaps > 0) return trackData(fromGaps, 'gap_assessments_aggregate');
      
      // Assumption: 20% of current revenue as identifiable opportunities
      const assumed = (metrics?.annual_revenue || 500000) * 0.2;
      return trackData(assumed, 'assumption', '20% of revenue as identifiable value opportunities');
    })();

    // 7. Estimated Tax Savings (annual)
    const taxSavingsData = (() => {
      const fromTaxGap = assessmentsByType['tax_gap']?.estimated_opportunity_value;
      if (fromTaxGap) return trackData(fromTaxGap, 'tax_gap_assessment');
      
      // Assumption: 5-15% of revenue based on business structure
      const assumedRate = 0.08; // 8% average
      const assumed = (metrics?.annual_revenue || 500000) * assumedRate;
      return trackData(assumed, 'assumption', '8% of revenue in tax optimization opportunities');
    })();

    // 8. Estimated Profit Improvements (annual)
    const profitImprovementsData = (() => {
      const fromProfitGap = assessmentsByType['profit_gap']?.estimated_opportunity_value;
      if (fromProfitGap) return trackData(fromProfitGap, 'profit_gap_assessment');
      
      // From operations gap
      const fromOps = assessmentsByType['operations_gap']?.estimated_opportunity_value;
      if (fromOps) return trackData(fromOps, 'operations_gap_assessment');
      
      // Assumption: 10% margin improvement potential
      const assumed = (metrics?.annual_revenue || 500000) * 0.1;
      return trackData(assumed, 'assumption', '10% margin improvement through operational efficiency');
    })();

    // 9. Estimated Cash Flow Improvements (annual)
    const cashFlowImprovementsData = (() => {
      const fromSnapshot = snapshot?.cash_flow_opportunity;
      if (fromSnapshot) return trackData(fromSnapshot, 'business_metric_snapshot');
      
      const fromMetrics = metrics?.cash_flow_gap?.monthly_value_freed;
      if (fromMetrics) return trackData(fromMetrics * 12, 'dashboard_metrics');
      
      // Assumption: 12% of revenue through working capital optimization
      const assumed = (metrics?.annual_revenue || 500000) * 0.12;
      return trackData(assumed, 'assumption', '12% cash flow improvement through working capital optimization');
    })();

    // 10. Estimated Exit Value Improvements
    const exitValueImprovementsData = (() => {
      const fromValueGap = assessmentsByType['value_gap']?.estimated_opportunity_value;
      if (fromValueGap) return trackData(fromValueGap, 'value_gap_assessment');
      
      // Calculate from EBITDA improvement × multiple expansion
      const currentEbitda = metrics?.ebitda || metrics?.recast_ebitda || 0;
      const currentMultiple = metrics?.enterprise_value && currentEbitda ? metrics.enterprise_value / currentEbitda : 4;
      const targetMultiple = 6; // Industry average for optimized businesses
      
      const ebitdaImprovement = profitImprovementsData.value || 0;
      const multipleExpansion = (targetMultiple - currentMultiple) * currentEbitda;
      const assumed = (ebitdaImprovement * targetMultiple) + multipleExpansion;
      
      return trackData(assumed, 'calculated', 'EBITDA improvement × multiple expansion');
    })();

    // ── PATH CALCULATIONS ─────────────────────────────────────────────────────
    
    const calculatePath = (optimizationLevel) => {
      // optimizationLevel: 0 = Current (A), 0.5 = Recommended (B), 1.0 = Fully Optimized (C)
      
      const baseAssets = investableAssetsData.value || 0;
      const annualRevenue = metrics?.annual_revenue || 500000;
      const baseSavings = annualRevenue * (savingsRateData.value || 0.15);
      const baseGrowth = growthRateData.value || 0.08;
      
      // Cap improvements at realistic percentages of revenue
      const maxTaxSavings = annualRevenue * 0.15;
      const maxProfitImprovement = annualRevenue * 0.2;
      const maxCashFlowImprovement = annualRevenue * 0.15;
      
      const cappedTaxSavings = Math.min(taxSavingsData.value || 0, maxTaxSavings);
      const cappedProfitImprovement = Math.min(profitImprovementsData.value || 0, maxProfitImprovement);
      const cappedCashFlowImprovement = Math.min(cashFlowImprovementsData.value || 0, maxCashFlowImprovement);
      
      // Add improvement portion based on optimization level
      const improvementAddition = (cappedTaxSavings + cappedProfitImprovement + cappedCashFlowImprovement) * optimizationLevel;
      const optimizedSavings = baseSavings + improvementAddition;
      
      const optimizedGrowth = baseGrowth * (1 + 0.3 * optimizationLevel); // Max 30% growth improvement
      
      // Business value with capped exit improvement
      const baseBusinessValue = currentBusinessValueData.value || 0;
      const maxExitImprovement = baseBusinessValue * 0.5; // Cap at 50% improvement
      const cappedExitImprovement = Math.min(exitValueImprovementsData.value || 0, maxExitImprovement);
      const optimizedBusinessValue = baseBusinessValue + (cappedExitImprovement * optimizationLevel);
      
      // Calculate years to freedom
      const targetWealth = freedomNumberData.value || 5000000;
      const annualReturn = 0.07;
      
      const PV = baseAssets;
      const PMT = optimizedSavings;
      const r = annualReturn;
      
      let accumulated = PV;
      let yearsToFreedom = 30; // Default fallback
      let year = 0;
      while (accumulated < targetWealth && year < 50) {
        accumulated = accumulated * (1 + r) + PMT;
        // Business exit realization at year 10 for optimized paths
        if (year === 10 && optimizationLevel > 0) {
          accumulated += optimizedBusinessValue;
        }
        year++;
      }
      yearsToFreedom = year;
      
      // Value creation acceleration (capped at 15 years reduction)
      if (optimizationLevel > 0) {
        const valueAcceleration = Math.min((valueOpportunitiesData.value || 0) * optimizationLevel / 500000, 15);
        yearsToFreedom = Math.max(1, yearsToFreedom - valueAcceleration);
      }
      
      const freedomDate = new Date(Date.now() + yearsToFreedom * 365 * 24 * 60 * 60 * 1000);
      
      return {
        freedomDate: freedomDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        yearsToFreedom: Math.round(yearsToFreedom * 10) / 10,
        additionalNetWorth: Math.round(optimizedBusinessValue - baseBusinessValue),
        additionalAnnualCashFlow: Math.round(optimizedSavings - baseSavings),
        additionalBusinessValue: Math.round(optimizedBusinessValue),
        totalWealthAtFreedom: Math.round(baseAssets * Math.pow(1 + r, yearsToFreedom) + optimizedSavings * (Math.pow(1 + r, yearsToFreedom) - 1) / r + optimizedBusinessValue),
      };
    };

    const pathA = calculatePath(0); // Current trajectory
    const pathB = calculatePath(0.5); // Recommended V.I.S.I.O.N. (50% optimization)
    const pathC = calculatePath(1.0); // Fully Optimized (100% optimization)

    // Calculate years recovered
    const yearsRecoveredB = Math.round((pathA.yearsToFreedom - pathB.yearsToFreedom) * 10) / 10;
    const yearsRecoveredC = Math.round((pathA.yearsToFreedom - pathC.yearsToFreedom) * 10) / 10;

    // Build confidence summary
    const dataConfidence = {
      overall: [
        freedomNumberData, investableAssetsData, savingsRateData,
        currentBusinessValueData, growthRateData, valueOpportunitiesData,
        taxSavingsData, profitImprovementsData, cashFlowImprovementsData,
        exitValueImprovementsData
      ].filter(d => d.confidence === 'high').length / 10,
      
      assumptions: [
        freedomNumberData, investableAssetsData, savingsRateData,
        currentBusinessValueData, growthRateData, valueOpportunitiesData,
        taxSavingsData, profitImprovementsData, cashFlowImprovementsData,
        exitValueImprovementsData
      ].filter(d => d.confidence === 'low').map(d => d.assumption)
    };

    return Response.json({
      paths: {
        A: { ...pathA, label: 'Current Trajectory', yearsRecovered: 0 },
        B: { ...pathB, label: 'Recommended V.I.S.I.O.N.', yearsRecovered: yearsRecoveredB },
        C: { ...pathC, label: 'Fully Optimized', yearsRecovered: yearsRecoveredC },
      },
      inputData: {
        freedomNumber: freedomNumberData,
        investableAssets: investableAssetsData,
        savingsRate: savingsRateData,
        currentBusinessValue: currentBusinessValueData,
        growthRate: growthRateData,
        valueOpportunities: valueOpportunitiesData,
        taxSavings: taxSavingsData,
        profitImprovements: profitImprovementsData,
        cashFlowImprovements: cashFlowImprovementsData,
        exitValueImprovements: exitValueImprovementsData,
      },
      confidence: dataConfidence,
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[calculateFreedomPaths] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});