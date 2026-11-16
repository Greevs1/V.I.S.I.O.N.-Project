import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { loadAssessmentResults } from '../../shared/intelligenceContract/assessmentLoader.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Explicit business context from the caller — required by the canonical
    // active-business contract for any account owning more than one business.
    const body = await req.json().catch(() => ({}));

    // Get user profile
    const { data: profile } = await sb
      .from('profiles')
      .select('id, app_role, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    // Allow admin/advisor/owner to generate opportunities for their own business
    // Owner role can generate for their own business, admin/advisor can generate for assigned businesses
    const role = profile.app_role || user.role;
    if (!['admin', 'super_admin', 'advisor', 'owner', 'user'].includes(role)) {
      return Response.json({ error: 'Admin, advisor, or owner access required' }, { status: 403 });
    }

    // Phase 6.9B — canonical resolution. Was `profile.primary_business_id`, which
    // silently generated against the primary business for a multi-business account.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, body?.active_business_id || body?.business_id || null, 'generateOpportunities'
    );
    if (bizDenial) return bizDenial;
    if (!businessId) {
      return Response.json({ error: 'No business linked to profile' }, { status: 400 });
    }

    // Fetch all input data — Supabase only (Phase C.1: Base44 Assessment retired)
    const [snapshots, extractedFields, valueEvents, roadmapItems] = await Promise.all([
      sb.from('business_metric_snapshots').select('*').eq('business_id', businessId).order('snapshot_date', { ascending: false }).limit(10),
      sb.from('extracted_fields').select('*').eq('business_id', businessId).in('review_status', ['accepted', 'corrected']),
      sb.from('value_creation_events').select('*').eq('business_id', businessId),
      sb.from('roadmap_items').select('*').eq('business_id', businessId),
    ]);

    // dashboard_metrics: try business_id first, fallback to profile_id
    // (saveAssessmentToSupabase may have written only profile_id on older rows)
    let metrics = await sb.from('dashboard_metrics').select('*').eq('business_id', businessId).limit(1);
    if (!metrics.data || metrics.data.length === 0) {
      metrics = await sb.from('dashboard_metrics').select('*').eq('profile_id', profile.id).limit(1);
      if (metrics.data?.length > 0) {
        console.log('[generateOpportunities] dashboard_metrics found via profile_id fallback — business_id may not have been written yet');
      }
    }

    // ── Assessment results from Supabase (business-scoped via session join) ──
    // Base44 Assessment entity is retired; computed results live in assessment_calculations.
    const { byType: calcByType } = await loadAssessmentResults(sb, businessId);

    const opportunities = [];
    const seenKeys = new Set();

    // Helper to add opportunity with duplicate prevention
    const addOpportunity = (opp) => {
      const key = `${businessId}|${opp.opportunity_type}|${opp.title}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      opportunities.push(opp);
      return true;
    };

    // Calculate priority score: Impact 50%, Confidence 20%, Ease 20%, Urgency 10%
    const calculatePriority = (impact, confidence, difficulty, urgency = 5) => {
      const impactWeight = 0.5;
      const confidenceWeight = 0.2;
      const easeWeight = 0.2;
      const urgencyWeight = 0.1;
      
      const impactScore = Math.min(100, (impact / 100000) * 100);
      const confidenceScore = Math.min(100, confidence);
      const easeScore = Math.max(0, 100 - difficulty);
      const urgencyScore = Math.min(100, urgency * 10);
      
      return Math.round(
        (impactScore * impactWeight) +
        (confidenceScore * confidenceWeight) +
        (easeScore * easeWeight) +
        (urgencyScore * urgencyWeight)
      );
    };

    // 1. Tax Gap Opportunities — read from result_json.t3_annual_gap
    const taxCalc = calcByType['tax_gap'];
    const taxImpact = taxCalc?.result_json?.t3_annual_gap || 0;
    if (taxCalc && taxImpact > 0) {
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Reduce Tax Overpayment',
        description: `Implement ${taxCalc.result_json?.t3_strategies?.length || 0} tax strategies to reduce annual overpayment by $${taxImpact.toLocaleString()}`,
        category: 'tax',
        opportunity_type: 'tax_optimization',
        estimated_impact: taxImpact,
        estimated_monthly_impact: Math.round(taxImpact / 12),
        estimated_value_creation: null,
        estimated_tax_savings: taxImpact,
        estimated_profit_improvement: null,
        estimated_cash_flow_improvement: null,
        confidence_score: 75,
        difficulty_score: 60,
        priority_score: calculatePriority(taxImpact, 75, 60),
        implementation_time_days: 90,
        source: 'assessment',
        source_record_id: null,
        status: 'identified',
      });
    }

    // 2. Profit Gap Opportunities — read from result_json.gapToBest (annual $)
    const profitCalc = calcByType['profit_gap'];
    const profitImpact = profitCalc?.result_json?.gapToBest || profitCalc?.result_json?.gapToAvg || 0;
    if (profitCalc && profitImpact > 0) {
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Close Profit Gap to Industry Best',
        description: 'Implement margin improvement strategies to reach top quartile profitability',
        category: 'profit',
        opportunity_type: 'margin_improvement',
        estimated_impact: profitImpact,
        estimated_monthly_impact: Math.round(profitImpact / 12),
        estimated_value_creation: null,
        estimated_tax_savings: null,
        estimated_profit_improvement: profitImpact,
        estimated_cash_flow_improvement: null,
        confidence_score: 80,
        difficulty_score: 70,
        priority_score: calculatePriority(profitImpact, 80, 70),
        implementation_time_days: 180,
        source: 'assessment',
        source_record_id: null,
        status: 'identified',
      });
    }

    // 3. Value Gap Opportunities — read from result_json.valueGap
    const valueCalc = calcByType['value_gap'];
    const valueImpact = valueCalc?.result_json?.valueGap || 0;
    if (valueCalc && valueImpact > 0) {
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Increase Business Valuation',
        description: 'Execute value creation initiatives to close valuation gap',
        category: 'value',
        opportunity_type: 'value_creation',
        estimated_impact: valueImpact,
        estimated_monthly_impact: null,
        estimated_value_creation: valueImpact,
        estimated_tax_savings: null,
        estimated_profit_improvement: null,
        estimated_cash_flow_improvement: null,
        confidence_score: 70,
        difficulty_score: 80,
        priority_score: calculatePriority(valueImpact, 70, 80),
        implementation_time_days: 365,
        source: 'assessment',
        source_record_id: null,
        status: 'identified',
      });
    }

    // 4. Operations Gap Opportunities — read from result_json.operations_score
    const opsCalc = calcByType['operations_gap'];
    const opsScore = opsCalc?.result_json?.operations_score;
    if (opsCalc && opsScore != null && opsScore < 80) {
      const impact = (80 - opsScore) * 1000;
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Improve Operations Health Score',
        description: `Operations score is ${opsScore}/100. Streamline processes to reduce owner dependency and free up time.`,
        category: 'operations',
        opportunity_type: 'operations_improvement',
        estimated_impact: impact,
        estimated_monthly_impact: Math.round(impact / 12),
        estimated_value_creation: null,
        estimated_tax_savings: null,
        estimated_profit_improvement: impact * 0.3,
        estimated_cash_flow_improvement: null,
        confidence_score: 85,
        difficulty_score: 50,
        priority_score: calculatePriority(impact, 85, 50),
        implementation_time_days: 120,
        source: 'assessment',
        source_record_id: null,
        status: 'identified',
      });
    }

    // 5. Recast EBITDA Opportunities — read from result_json.total_addbacks
    const ebitdaCalc = calcByType['recast_ebitda'];
    const addbacks = ebitdaCalc?.result_json?.total_addbacks || 0;
    if (ebitdaCalc && addbacks > 0) {
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Recast EBITDA Through Add-Backs',
        description: `$${addbacks.toLocaleString()} in add-backs identified. Document these to increase valuation.`,
        category: 'value',
        opportunity_type: 'ebitda_optimization',
        estimated_impact: addbacks * 4,
        estimated_monthly_impact: null,
        estimated_value_creation: addbacks * 4,
        estimated_tax_savings: null,
        estimated_profit_improvement: null,
        estimated_cash_flow_improvement: null,
        confidence_score: 90,
        difficulty_score: 40,
        priority_score: calculatePriority(addbacks * 4, 90, 40),
        implementation_time_days: 60,
        source: 'assessment',
        source_record_id: null,
        status: 'identified',
      });
    }

    // 6. Document Analysis Opportunities (low confidence fields)
    const lowConfidenceFields = extractedFields.data?.filter(f => 
      f.confidence_score < 70 && ['accepted', 'corrected'].includes(f.review_status)
    ) || [];
    
    if (lowConfidenceFields.length > 0) {
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Review Low-Confidence Financial Data',
        description: `${lowConfidenceFields.length} financial data points have confidence scores below 70%. Manual review recommended.`,
        category: 'protection',
        opportunity_type: 'data_quality',
        estimated_impact: 50000,
        estimated_monthly_impact: null,
        estimated_value_creation: null,
        estimated_tax_savings: null,
        estimated_profit_improvement: null,
        estimated_cash_flow_improvement: null,
        confidence_score: 60,
        difficulty_score: 20,
        priority_score: calculatePriority(50000, 60, 20),
        implementation_time_days: 14,
        source: 'document_analysis',
        source_record_id: lowConfidenceFields[0]?.document_id,
        status: 'identified',
      });
    }

    // 7. Unverified Value Events
    const unverifiedEvents = valueEvents.data?.filter(e => 
      e.status === 'implemented' && !e.verified_value
    ) || [];
    
    if (unverifiedEvents.length > 0) {
      const totalImpact = unverifiedEvents.reduce((sum, e) => sum + (e.estimated_impact || 0), 0);
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Verify Implemented Value Events',
        description: `${unverifiedEvents.length} implemented initiatives awaiting verification with estimated impact of $${(totalImpact / 1000).toFixed(0)}K`,
        category: 'wealth',
        opportunity_type: 'verification',
        estimated_impact: totalImpact * 0.1,
        estimated_monthly_impact: null,
        estimated_value_creation: totalImpact,
        estimated_tax_savings: null,
        estimated_profit_improvement: null,
        estimated_cash_flow_improvement: null,
        confidence_score: 95,
        difficulty_score: 10,
        priority_score: calculatePriority(totalImpact * 0.1, 95, 10),
        implementation_time_days: 30,
        source: 'value_creation_event',
        source_record_id: unverifiedEvents[0]?.id,
        status: 'identified',
      });
    }

    // 8. Stalled Roadmap Items
    const stalledItems = roadmapItems.data?.filter(r => 
      ['In Progress', 'Gathering Information'].includes(r.status) &&
      new Date(r.updated_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ) || [];
    
    if (stalledItems.length > 0) {
      const totalValue = stalledItems.reduce((sum, r) => sum + (r.estimated_value_created || 0), 0);
      addOpportunity({
        business_id: businessId,
        profile_id: profile.id,
        title: 'Unblock Stalled Roadmap Initiatives',
        description: `${stalledItems.length} roadmap items haven't been updated in 30+ days. Review and re-engage.`,
        category: 'operations',
        opportunity_type: 'momentum_recovery',
        estimated_impact: totalValue * 0.2,
        estimated_monthly_impact: null,
        estimated_value_creation: totalValue,
        estimated_tax_savings: null,
        estimated_profit_improvement: null,
        estimated_cash_flow_improvement: null,
        confidence_score: 75,
        difficulty_score: 40,
        priority_score: calculatePriority(totalValue * 0.2, 75, 40),
        implementation_time_days: 21,
        source: 'roadmap',
        source_record_id: stalledItems[0]?.id,
        status: 'identified',
      });
    }

    // 9. Cash Flow Gap (low cash-to-debt ratio)
    const latestSnapshot = snapshots.data?.[0];
    if (latestSnapshot && latestSnapshot.cash_on_hand && latestSnapshot.total_debt) {
      const cashRatio = latestSnapshot.cash_on_hand / latestSnapshot.total_debt;
      if (cashRatio < 0.5) {
        const impact = (0.5 - cashRatio) * latestSnapshot.total_debt * 0.1;
        addOpportunity({
          business_id: businessId,
          profile_id: profile.id,
          title: 'Improve Cash-to-Debt Ratio',
          description: `Current cash-to-debt ratio is ${(cashRatio * 100).toFixed(0)}%. Target 50%+ for financial resilience.`,
          category: 'cash_flow',
          opportunity_type: 'liquidity_improvement',
          estimated_impact: impact,
          estimated_monthly_impact: Math.round(impact / 12),
          estimated_value_creation: null,
          estimated_tax_savings: null,
          estimated_profit_improvement: null,
          estimated_cash_flow_improvement: impact,
          confidence_score: 80,
          difficulty_score: 70,
          priority_score: calculatePriority(impact, 80, 70),
          implementation_time_days: 180,
          source: 'snapshot_analysis',
          source_record_id: latestSnapshot.id,
          status: 'identified',
        });
      }
    }

    // Insert opportunities (upsert to prevent duplicates)
    for (const opp of opportunities) {
      const { error } = await sb
        .from('business_opportunities')
        .upsert(opp, {
          onConflict: 'business_id,opportunity_type,title',
        });
      
      if (error) {
        console.error('Failed to insert opportunity:', error);
      }
    }

    return Response.json({
      success: true,
      opportunities_generated: opportunities.length,
      opportunities: opportunities.map(o => ({
        id: o.source_record_id,
        title: o.title,
        category: o.category,
        opportunity_type: o.opportunity_type,
        estimated_impact: o.estimated_impact,
        priority_score: o.priority_score,
        source: o.source,
      })),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});