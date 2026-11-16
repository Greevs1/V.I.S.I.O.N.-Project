/**
 * metricScopeResolver — Phase 2B Engine
 *
 * Classifies any metric name into: business | profile | portfolio | hybrid
 * Returns which engines are required to calculate each metric.
 * Can also orchestrate running all Phase 2B engines in one call.
 *
 * Input:  { metrics: ['enterprise_value', 'freedom_number', ...], run_engines: boolean }
 * Output: { scope_map, engine_requirements, [engine_results if run_engines=true] }
 *
 * SAFETY: Read-only. Purely classification logic + optional engine orchestration.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Canonical scope and engine dependency registry
const METRIC_REGISTRY = {
  enterprise_value:              { scope: 'business',   engines: ['ownershipAdjustmentEngine', 'confidenceEngine', 'reportingQualityEngine'], business: true, profile: false, portfolio: true },
  recast_ebitda:                 { scope: 'business',   engines: ['confidenceEngine', 'reportingQualityEngine'], business: true, profile: false, portfolio: true },
  revenue:                       { scope: 'business',   engines: ['confidenceEngine', 'reportingQualityEngine'], business: true, profile: false, portfolio: true },
  net_profit:                    { scope: 'business',   engines: ['confidenceEngine', 'reportingQualityEngine'], business: true, profile: false, portfolio: false },
  profit_iq_score:               { scope: 'business',   engines: ['profitIqEngine', 'confidenceEngine'], business: true, profile: false, portfolio: true },
  profit_gap:                    { scope: 'business',   engines: ['profitIqEngine', 'confidenceEngine'], business: true, profile: false, portfolio: false },
  value_gap:                     { scope: 'business',   engines: ['confidenceEngine', 'reportingQualityEngine'], business: true, profile: false, portfolio: true },
  tax_gap:                       { scope: 'hybrid',     engines: ['confidenceEngine'], business: true, profile: true, portfolio: true },
  operations_gap:                { scope: 'business',   engines: ['confidenceEngine'], business: true, profile: false, portfolio: false },
  sprint_progress:               { scope: 'business',   engines: [], business: true, profile: false, portfolio: false },
  data_room_readiness:           { scope: 'business',   engines: ['reportingQualityEngine'], business: true, profile: false, portfolio: true },
  reporting_quality_score:       { scope: 'business',   engines: ['reportingQualityEngine', 'confidenceEngine'], business: true, profile: false, portfolio: true },
  business_protection_gap:       { scope: 'business',   engines: ['protectionGapEngine'], business: true, profile: false, portfolio: true },
  iq_score:                      { scope: 'hybrid',     engines: ['confidenceEngine', 'profitIqEngine', 'protectionGapEngine'], business: true, profile: false, portfolio: true },
  freedom_number:                { scope: 'profile',    engines: ['freedomEngine', 'ownershipAdjustmentEngine'], business: false, profile: true, portfolio: false },
  freedom_gap:                   { scope: 'profile',    engines: ['freedomEngine', 'ownershipAdjustmentEngine'], business: false, profile: true, portfolio: false },
  freedom_score:                 { scope: 'profile',    engines: ['freedomEngine'], business: false, profile: true, portfolio: false },
  net_worth:                     { scope: 'profile',    engines: ['ownershipAdjustmentEngine'], business: false, profile: true, portfolio: false },
  personal_tax_gap:              { scope: 'profile',    engines: ['confidenceEngine'], business: false, profile: true, portfolio: false },
  personal_protection_gap:       { scope: 'profile',    engines: ['protectionGapEngine'], business: false, profile: true, portfolio: false },
  household_cash_flow:           { scope: 'profile',    engines: ['freedomEngine'], business: false, profile: true, portfolio: false },
  retirement_readiness:          { scope: 'profile',    engines: ['freedomEngine'], business: false, profile: true, portfolio: false },
  ownership_adjusted_ev:         { scope: 'portfolio',  engines: ['ownershipAdjustmentEngine', 'confidenceEngine'], business: false, profile: false, portfolio: true },
  ownership_adjusted_ebitda:     { scope: 'portfolio',  engines: ['ownershipAdjustmentEngine'], business: false, profile: false, portfolio: true },
  portfolio_iq:                  { scope: 'portfolio',  engines: ['ownershipAdjustmentEngine', 'confidenceEngine', 'reportingQualityEngine', 'profitIqEngine'], business: false, profile: false, portfolio: true },
  ownership_concentration_risk:  { scope: 'portfolio',  engines: ['ownershipConcentrationEngine', 'ownershipAdjustmentEngine'], business: false, profile: false, portfolio: true },
  portfolio_protection_gap:      { scope: 'portfolio',  engines: ['protectionGapEngine'], business: false, profile: false, portfolio: true },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { metrics: requestedMetrics, run_engines = false, business_id } = body;

    const targetMetrics = requestedMetrics || Object.keys(METRIC_REGISTRY);

    // Build scope map for requested metrics
    const scope_map = {};
    const engine_requirements = {};

    for (const metricName of targetMetrics) {
      const reg = METRIC_REGISTRY[metricName];
      if (reg) {
        scope_map[metricName] = {
          scope: reg.scope,
          views: {
            business_view: reg.business,
            profile_view: reg.profile,
            portfolio_view: reg.portfolio,
          },
        };
        for (const engine of reg.engines) {
          if (!engine_requirements[engine]) engine_requirements[engine] = [];
          if (!engine_requirements[engine].includes(metricName)) {
            engine_requirements[engine].push(metricName);
          }
        }
      } else {
        scope_map[metricName] = { scope: 'unknown', views: { business_view: null, profile_view: null, portfolio_view: null } };
      }
    }

    const result = {
      scope_map,
      engine_requirements,
      registry_version: '2B.0',
      total_metrics_classified: Object.keys(scope_map).length,
      scope_summary: {
        business: Object.values(scope_map).filter(m => m.scope === 'business').length,
        profile: Object.values(scope_map).filter(m => m.scope === 'profile').length,
        portfolio: Object.values(scope_map).filter(m => m.scope === 'portfolio').length,
        hybrid: Object.values(scope_map).filter(m => m.scope === 'hybrid').length,
      },
      available_engines: [
        'ownershipAdjustmentEngine',
        'confidenceEngine',
        'reportingQualityEngine',
        'protectionGapEngine',
        'profitIqEngine',
        'freedomEngine',
        'ownershipConcentrationEngine',
        'metricScopeResolver',
      ],
    };

    // If run_engines=true, call all engines and return consolidated output
    if (run_engines) {
      const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
      const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

      const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
      if (!profile) return Response.json({ error: 'Profile not found', ...result }, { status: 404 });

      const payload = JSON.stringify({ business_id: business_id || profile.primary_business_id });
      const headers = req.headers;
      const authHeader = headers.get('authorization');

      // Invoke engines in parallel via base44.functions
      const [ownAdj, conf, rq, prot, profIq, freedom, concRisk] = await Promise.allSettled([
        base44.functions.invoke('ownershipAdjustmentEngine', {}),
        base44.functions.invoke('confidenceEngine', { business_id: business_id || profile.primary_business_id }),
        base44.functions.invoke('reportingQualityEngine', { business_id: business_id || profile.primary_business_id }),
        base44.functions.invoke('protectionGapEngine', { business_id: business_id || profile.primary_business_id }),
        base44.functions.invoke('profitIqEngine', { business_id: business_id || profile.primary_business_id }),
        base44.functions.invoke('freedomEngine', {}),
        base44.functions.invoke('ownershipConcentrationEngine', {}),
      ]);

      result.engine_results = {
        ownership_adjustment: ownAdj.status === 'fulfilled' ? ownAdj.value?.data : { error: ownAdj.reason?.message },
        confidence: conf.status === 'fulfilled' ? conf.value?.data : { error: conf.reason?.message },
        reporting_quality: rq.status === 'fulfilled' ? rq.value?.data : { error: rq.reason?.message },
        protection_gap: prot.status === 'fulfilled' ? prot.value?.data : { error: prot.reason?.message },
        profit_iq: profIq.status === 'fulfilled' ? profIq.value?.data : { error: profIq.reason?.message },
        freedom: freedom.status === 'fulfilled' ? freedom.value?.data : { error: freedom.reason?.message },
        ownership_concentration: concRisk.status === 'fulfilled' ? concRisk.value?.data : { error: concRisk.reason?.message },
      };
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});