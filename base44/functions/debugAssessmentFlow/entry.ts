/**
 * debugAssessmentFlow - Diagnostic tool to trace assessment data across Supabase sources.
 *
 * Phase C.1: Base44 Assessment entity retired. This diagnostic now compares the
 * three Supabase layers that participate in the Shared Intelligence Contract:
 *   1. assessment_calculations.result_json  (primary computed results)
 *   2. business_assessments                  (summary scores / opportunity levels)
 *   3. dashboard_metrics                     (derived / cache read model)
 *
 * Call this function to get a complete report of where assessment data exists
 * and where it's missing in the pipeline.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadAssessmentResults, loadBusinessAssessmentSummaries } from '../../shared/intelligenceContract/assessmentLoader.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: profile } = await sb
      .from('profiles')
      .select('id, primary_business_id, email')
      .eq('email', user.email)
      .maybeSingle();

    if (!profile) {
      return Response.json({ error: 'Profile not found', email: user.email }, { status: 404 });
    }

    const profileId = profile.id;
    const businessId = profile.primary_business_id;

    if (!businessId) {
      return Response.json({ error: 'No primary_business_id on profile', profile: { id: profileId, email: profile.email } }, { status: 400 });
    }

    // 1. assessment_calculations (primary computed results — via session join)
    const { byType: calcByType } = await loadAssessmentResults(sb, businessId);

    // 2. business_assessments (summary scores / opportunity levels)
    const baRows = await loadBusinessAssessmentSummaries(sb, businessId);
    const baByType = baRows.reduce((acc, r) => { acc[r.assessment_type] = r; return acc; }, {});

    // 3. dashboard_metrics (derived / cache read model)
    let dm = null;
    {
      const { data: dmByBiz } = await sb.from('dashboard_metrics').select('*').eq('business_id', businessId).maybeSingle();
      dm = dmByBiz;
      if (!dm) {
        const { data: dmByProfile } = await sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).maybeSingle();
        dm = dmByProfile;
      }
    }

    // 4. Compile report — compare the three Supabase layers
    const report = {
      profile: { id: profileId, businessId, email: profile.email },
      assessment_calculations: {
        profit_gap: calcByType['profit_gap']?.result_json || null,
        value_gap: calcByType['value_gap']?.result_json || null,
        tax_gap: calcByType['tax_gap']?.result_json || null,
        operations_gap: calcByType['operations_gap']?.result_json || null,
        recast_ebitda: calcByType['recast_ebitda']?.result_json || null,
        freedom_assessment: calcByType['freedom_assessment']?.result_json || null,
      },
      business_assessments: baByType,
      dashboard_metrics: dm ? {
        profit_gap: dm.profit_gap,
        value_gap: dm.value_gap,
        tax_gap: dm.tax_gap,
        operations_gap: dm.operations_gap,
        ciq_score: dm.ciq_score,
      } : null,
      analysis: {
        profit_gap: {
          calc_gapToBest: calcByType['profit_gap']?.result_json?.gapToBest ?? null,
          supabase_opp_value: baByType['profit_gap']?.estimated_opportunity_value ?? null,
          dashboard_gap_to_best: dm?.profit_gap?.gap_to_best ?? dm?.profit_gap_details?.gap_to_best ?? null,
          data_flow: calcByType['profit_gap']?.result_json?.gapToBest != null
            ? '✓ assessment_calculations has data'
            : '✗ assessment_calculations missing data',
        },
        value_gap: {
          calc_valueGap: calcByType['value_gap']?.result_json?.valueGap ?? null,
          calc_potentialValue: calcByType['value_gap']?.result_json?.potentialValue ?? null,
          supabase_opp_value: baByType['value_gap']?.estimated_opportunity_value ?? null,
          dashboard_gap_amount: dm?.value_gap?.gap_amount ?? dm?.value_gap_details?.gap_amount ?? null,
          data_flow: calcByType['value_gap']?.result_json?.valueGap != null
            ? '✓ assessment_calculations has data'
            : '✗ assessment_calculations missing data',
        },
        tax_gap: {
          calc_t3_annual_gap: calcByType['tax_gap']?.result_json?.t3_annual_gap ?? null,
          supabase_opp_value: baByType['tax_gap']?.estimated_opportunity_value ?? null,
          dashboard_tax_gap: dm?.tax_gap ?? dm?.tax_gap_details?.annual_overpayment ?? null,
          data_flow: calcByType['tax_gap']?.result_json?.t3_annual_gap != null
            ? '✓ assessment_calculations has data'
            : '✗ assessment_calculations missing data',
        },
        operations_gap: {
          calc_operations_score: calcByType['operations_gap']?.result_json?.operations_score ?? null,
          supabase_score: baByType['operations_gap']?.score ?? null,
          dashboard_ops_score: dm?.operations_gap ?? dm?.operations_gap_details?.score ?? null,
          data_flow: calcByType['operations_gap']?.result_json?.operations_score != null
            ? '✓ assessment_calculations has data'
            : '✗ assessment_calculations missing data',
        },
      },
      _architecture_note: 'Phase C.1: Base44 Assessment entity retired. Supabase is the sole source of truth. assessment_calculations is primary; business_assessments and dashboard_metrics are derived.',
    };

    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});