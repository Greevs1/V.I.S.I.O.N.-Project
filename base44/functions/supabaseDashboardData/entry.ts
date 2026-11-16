/**
 * supabaseDashboardData — metrics, snapshots, value creation summaries, assessment summaries.
 *
 * Actions:
 *   getDashboardMetrics, upsertDashboardMetrics,
 *   getMetricSnapshots, getMetricSnapshotsAll, getLatestMetricSnapshot,
 *   getValueCreationEvents, getValueCreationSummary, getAssessmentSummary
 *
 * Can be called directly (user token) or via supabaseUserData router (service role).
 * Phase 6B.4 — authentication is MANDATORY and unconditional. `_router_user_email`
 * and `target_profile_id` are TARGET identifiers only, honoured solely after the
 * authenticated actor is proven authorized for them. Identity never comes from
 * the request body.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data, _router_user_email } = body;

    // Support direct profile_id lookup (for expert advisor portal bypassing email routing)
    const { target_profile_id } = body;

    // ── Phase 6B.4 — AUTHENTICATION BOUNDARY ─────────────────────────────────
    // Authentication is mandatory and unconditional. The caller's identity is
    // NEVER taken from the request body. `_router_user_email` and
    // `target_profile_id` are TARGET identifiers only: they are honoured solely
    // after the authenticated actor is proven authorized for that target.
    const actor = await authenticateActor(base44, sb);
    const acting = await resolveActingProfile(sb, actor, {
      targetProfileId: target_profile_id,
      targetEmail: _router_user_email,
    });

    const getProfile = async () => acting.profile;

    if (action === 'getDashboardMetrics') {
      const profile = await getProfile();
      if (!profile) return Response.json({ metrics: null });
      const { data: metrics, error } = await sb
        .from('dashboard_metrics')
        .select('*')
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // Normalize: the CIQ engine writes ciq_score; alias it as overall_impact_score for frontend compatibility
      if (metrics && metrics.ciq_score != null && !metrics.overall_impact_score) {
        metrics.overall_impact_score = metrics.ciq_score;
      }
      return Response.json({ metrics });
    }

    if (action === 'upsertDashboardMetrics') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const metricsData = { ...data, profile_id: profile.id, updated_at: new Date().toISOString() };
      const { data: existing } = await sb
        .from('dashboard_metrics')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();
      const { data: result, error } = existing
        ? await sb.from('dashboard_metrics').update(metricsData).eq('id', existing.id).select().single()
        : await sb.from('dashboard_metrics').insert({ ...metricsData, created_at: new Date().toISOString() }).select().single();
      if (error) throw new Error(error.message);
      return Response.json({ metrics: result });
    }

    if (action === 'getMetricSnapshots') {
      const profile = await getProfile();
      if (!profile) return Response.json({ snapshots: [] });
      const { data: snapshots, error } = await sb
        .from('business_metric_snapshots')
        .select('snapshot_date, overall_impact_score')
        .eq('profile_id', profile.id)
        .order('snapshot_date', { ascending: true })
        .limit(20);
      if (error) throw new Error(error.message);
      const mapped = (snapshots || []).filter(s => s.overall_impact_score != null).map(s => ({
        snapshot_date: s.snapshot_date,
        metric_value: s.overall_impact_score,
      }));
      return Response.json({ snapshots: mapped });
    }

    if (action === 'getMetricSnapshotsAll') {
      const profile = await getProfile();
      if (!profile) return Response.json({ snapshots: [] });
      const { data: snapshots, error } = await sb
        .from('business_metric_snapshots')
        .select('snapshot_date, overall_impact_score, data_confidence_score, annual_revenue, net_profit, ebitda, current_business_value, value_gap, profit_opportunity, tax_opportunity, cash_flow_opportunity')
        .eq('profile_id', profile.id)
        .order('snapshot_date', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return Response.json({ snapshots: snapshots || [] });
    }

    if (action === 'getLatestMetricSnapshot') {
      const profile = await getProfile();
      if (!profile) return Response.json({ snapshot: null });
      const { data: snapshot, error } = await sb
        .from('business_metric_snapshots')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('is_latest', true)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ snapshot: snapshot || null });
    }

    if (action === 'getValueCreationEvents') {
      const profile = await getProfile();
      if (!profile) return Response.json({ events: [] });
      // Phase 6.9B — business-owned read. Was hardcoded to primary_business_id, so
      // a non-primary selection returned the PRIMARY business's events.
      const { businessId, denial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseDashboardData.getValueCreationEvents'
      );
      if (denial) return denial;
      if (!businessId) return Response.json({ events: [] });
      const { data: events, error } = await sb
        .from('value_creation_events')
        .select('*')
        .eq('business_id', businessId)
        .order('priority_rank', { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      return Response.json({ events: events || [] });
    }

    if (action === 'getValueCreationSummary') {
      const profile = await getProfile();
      if (!profile) return Response.json({ summary: null });
      // Phase 6.9B — canonical resolution. Was hardcoded to primary_business_id AND
      // silently WROTE the profile's primary from a read path.
      const { businessId: activeBusinessId, denial: vcsDenial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseDashboardData.getValueCreationSummary'
      );
      if (vcsDenial) return vcsDenial;
      if (!activeBusinessId) return Response.json({ summary: null });
      const { data: raw, error } = await sb
        .from('v_value_creation_summary')
        .select('*')
        .eq('business_id', activeBusinessId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!raw) return Response.json({ summary: null });

      const summary = {
        ...raw,
        total_value_created:        raw.total_estimated_value_created ?? null,
        value_created:              raw.total_estimated_value_created ?? null,
        total_tax_savings:          raw.total_estimated_tax_savings ?? null,
        profit_savings:             raw.total_estimated_profit_improvement ?? null,
        total_cash_flow_unlocked:   raw.total_estimated_cash_flow_improvement ?? null,
        total_profit_improvement:   raw.total_estimated_profit_improvement ?? null,
        total_debt_reduction:       raw.total_estimated_debt_reduction ?? null,
        strategy_wins_count:        raw.verified_events ?? null,
        total_identified_wins:      raw.total_value_events ?? null,
      };
      return Response.json({ summary });
    }

    if (action === 'getAssessmentSummary') {
      const profile = await getProfile();
      if (!profile) return Response.json({ summary: null });

      // Phase 6.9B — canonical resolution. This business context feeds the
      // assessment summary AND the Shared Intelligence Contract, so the explicit
      // active business is authoritative; primary_business_id is only the
      // unambiguous default for a single-business account.
      const { businessId: summaryBusinessId, denial: summaryDenial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseDashboardData.getAssessmentSummary'
      );
      if (summaryDenial) return summaryDenial;
      const { data: viewRow } = summaryBusinessId ? await sb
        .from('v_business_assessment_summary')
        .select('*')
        .eq('business_id', summaryBusinessId)
        .maybeSingle() : { data: null };

      const { data: baRows } = await sb
        .from('business_assessments')
        .select('assessment_type, score, estimated_opportunity_value, risk_level, opportunity_level, summary, key_findings, recommendations')
        .eq('profile_id', profile.id)
        .in('assessment_type', ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'recast_ebitda', 'freedom_assessment']);

      const { data: dmRow } = await sb
        .from('dashboard_metrics')
        .select('profit_gap_details, value_gap_details, tax_gap_details, operations_gap_details, freedom_gap_details, cash_flow_gap_details, protections_gap_details, wealth_gap_details, recast_ebitda_gap_details')
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const byType = (baRows || []).reduce((acc, r) => { acc[r.assessment_type] = r; return acc; }, {});
      const pg = byType['profit_gap'];
      const vg = byType['value_gap'];
      const tg = byType['tax_gap'];
      const og = byType['operations_gap'];

      // Use *_details columns for detail objects, numeric columns for amounts
      const pgd = dmRow?.profit_gap_details || {};
      const vgd = dmRow?.value_gap_details || {};
      const tgd = dmRow?.tax_gap_details || {};
      const ogd = dmRow?.operations_gap_details || {};

      const summary = viewRow ? {
        ...viewRow,
        // Numeric amounts from business_assessments
        profit_gap_amount:       pg?.estimated_opportunity_value ?? null,
        value_gap_amount:        vg?.estimated_opportunity_value ?? null,
        tax_gap_annual:          tg?.estimated_opportunity_value ?? null,
        tax_gap_ten_year:        tg?.estimated_opportunity_value != null ? Math.round(tg.estimated_opportunity_value * 12) : null,
        operations_score:        viewRow.operations_gap_score ?? og?.score ?? null,
        // Detail objects from dashboard_metrics *_details columns
        profit_gap_severity:     pgd.severity ?? pg?.opportunity_level ?? null,
        profit_gap_summary:      pgd.summary ?? pg?.summary ?? null,
        profit_gap_details:      pgd,
        value_gap_severity:      vgd.severity ?? vg?.opportunity_level ?? null,
        value_gap_summary:       vgd.summary ?? vg?.summary ?? null,
        value_gap_details:       vgd,
        current_business_value:  vgd.current_value ?? null,
        tax_gap_severity:        tgd.severity ?? tg?.opportunity_level ?? null,
        tax_gap_summary:         tgd.summary ?? tg?.summary ?? null,
        tax_gap_details:         tgd,
        operations_gap_severity: ogd.severity ?? og?.opportunity_level ?? null,
        operations_gap_summary:  ogd.summary ?? og?.summary ?? null,
        operations_gap_details:  ogd,
        monthly_value_freed:     ogd.monthly_value_freed ?? null,
      } : null;

      return Response.json({ summary });
    }

    // ── PHASE 2B: ENGINE OUTPUTS (additive — never modifies existing dashboard values) ──
    if (action === 'getPhase2BEngines') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      // Phase 6.9B — canonical resolution (never primary for a multi-business account).
      const { businessId: bizId, denial: engineDenial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseDashboardData.getPhase2BEngines'
      );
      if (engineDenial) return engineDenial;
      const profileId = profile.id;

      // All engine logic runs inline using the already-authenticated sb client.
      // This avoids cross-function HTTP calls which require separate auth tokens.

      const engineOut = (value, scope, confidence_score, confidence_source, data_sources, calculation_method, warnings = [], requires_verification = false) =>
        ({ value, scope, confidence_score, confidence_source, data_sources, calculation_method, warnings, requires_verification });

      // Parallel fetch all data needed across engines
      const [
        ownershipResult, assessResult, docResult, extractedResult,
        dmResult, snapResult, bizResult, pfResult, vceResult,
      ] = await Promise.allSettled([
        sb.from('business_owners').select('business_id, ownership_percentage, ownership_type, is_primary_owner').eq('profile_id', profileId),
        sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, updated_at').eq('profile_id', profileId),
        sb.from('documents').select('document_type, upload_status, year, created_at').eq('profile_id', profileId).eq('upload_status', 'completed'),
        sb.from('extracted_fields').select('field_name, review_status, field_category').eq('profile_id', profileId).in('review_status', ['accepted', 'corrected']),
        sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('business_metric_snapshots').select('annual_revenue, net_profit, ebitda, current_business_value').eq('profile_id', profileId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
        bizId ? sb.from('business_entities').select('id, business_name, industry').eq('id', bizId).maybeSingle() : Promise.resolve({ data: null }),
        sb.from('profile_financials').select('*').eq('profile_id', profileId).maybeSingle(),
        bizId ? sb.from('value_creation_events').select('id, status').eq('business_id', bizId).eq('status', 'verified') : Promise.resolve({ data: [] }),
      ]);

      const safe = (r, fb = null) => r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;
      const ownershipRows = safe(ownershipResult, []);
      const assessments   = safe(assessResult, []);
      const documents     = safe(docResult, []);
      const extracted     = safe(extractedResult, []);
      const dmRow         = safe(dmResult, null);
      const snapRow       = safe(snapResult, null);
      const bizEntity     = safe(bizResult, null);
      const profileFin    = safe(pfResult, null);
      const verifiedEvents= safe(vceResult, []);

      const assessMap  = (assessments || []).reduce((a, r) => { a[r.assessment_type] = r; return a; }, {});
      const docTypes   = new Set((documents || []).map(d => d.document_type));
      const hasExtracted = extracted.length > 0;
      const hasVerified  = verifiedEvents.length > 0;

      // ── Ownership Adjustment Engine ─────────────────────────────────────────
      const ownerMap = (ownershipRows || []).reduce((a, r) => { a[r.business_id] = r.ownership_percentage ?? 100; return a; }, {});
      const revenue = snapRow?.annual_revenue || dmRow?.revenue || null;
      const netProfit = snapRow?.net_profit || dmRow?.net_profit || null;
      const ebitda = snapRow?.ebitda || dmRow?.recast_ebitda || null;
      const ev = dmRow?.enterprise_value || (netProfit ? netProfit * 4 : null);
      const ownPct = bizId && ownerMap[bizId] != null ? ownerMap[bizId] / 100 : 1.0;
      const ownership_adjustment = {
        adjusted_metrics: [{
          business_id: bizId, ownership_pct: ownPct * 100,
          raw: { enterprise_value: ev, ebitda, cash_flow: netProfit },
          adjusted: { enterprise_value: ev != null ? ev * ownPct : null, ebitda: ebitda != null ? ebitda * ownPct : null, cash_flow: netProfit != null ? netProfit * ownPct : null },
        }],
        portfolio_totals: {
          enterprise_value: engineOut(ev != null ? ev * ownPct : null, 'portfolio', 50, 'assessment_plus_documents', ['business_owners','dashboard_metrics'], 'Σ(EV × ownership_pct)', [], ev == null),
          ebitda: engineOut(ebitda != null ? ebitda * ownPct : null, 'portfolio', 50, 'assessment_plus_documents', ['business_owners','dashboard_metrics'], 'Σ(EBITDA × ownership_pct)', [], ebitda == null),
        },
      };

      // ── Confidence Engine ───────────────────────────────────────────────────
      const DOC_REQS = { profit_gap: ['profit_and_loss'], value_gap: ['profit_and_loss','balance_sheet'], tax_gap: ['business_tax_return','personal_tax_return'], recast_ebitda: ['profit_and_loss','payroll_report'], enterprise_value: ['profit_and_loss','balance_sheet'] };
      const confFor = (metric) => {
        const hasA = !!assessMap[metric]; const reqDocs = DOC_REQS[metric] || []; const hasDocs = reqDocs.length === 0 || reqDocs.some(d => docTypes.has(d));
        if (!hasA) return engineOut(15, 'business', 15, 'assessment_only', [], `no_assessment`, [`No ${metric} assessment`], true);
        if (!hasDocs) return engineOut(30, 'business', 30, 'assessment_only', ['assessment'], `assessment_only`, [`Missing: ${reqDocs.filter(d=>!docTypes.has(d)).join(', ')}`], true);
        if (hasDocs && hasExtracted && hasVerified) return engineOut(95, 'business', 95, 'verified_financial_analysis', ['assessment','documents','extracted_fields'], 'full_verification', [], false);
        if (hasDocs && hasExtracted) return engineOut(75, 'business', 75, 'assessment_plus_documents', ['assessment','documents','extracted_fields'], 'docs_and_extraction', [], false);
        return engineOut(60, 'business', 60, 'assessment_plus_documents', ['assessment','documents'], 'docs_only', [], false);
      };
      const confidence = { confidence_scores: { profit_gap: confFor('profit_gap'), value_gap: confFor('value_gap'), tax_gap: confFor('tax_gap'), enterprise_value: confFor('enterprise_value') } };

      // ── Reporting Quality Engine ────────────────────────────────────────────
      const eighteenAgo = new Date(); eighteenAgo.setMonth(eighteenAgo.getMonth() - 18);
      const recentDocs = (documents || []).filter(d => new Date(d.created_at) > eighteenAgo);
      const acceptedExtracted = (extracted || []).filter(f => ['accepted','corrected'].includes(f.review_status));
      const reconRatio = extracted.length > 0 ? acceptedExtracted.length / extracted.length : 0;
      const taxDocs2 = (documents || []).filter(d => ['business_tax_return','personal_tax_return'].includes(d.document_type));
      const balanceDocs = (documents || []).filter(d => d.document_type === 'balance_sheet');
      const rqScore = Math.min(20, recentDocs.length * 4) + Math.round(reconRatio * 20) + Math.min(15, taxDocs2.length * 5) + Math.min(15, balanceDocs.length * 7) + (assessMap['recast_ebitda'] ? 8 : 0) + Math.round(((['profit_and_loss','balance_sheet','business_tax_return'].filter(t=>docTypes.has(t)).length)/3)*15);
      const rqConf = rqScore >= 75 ? 95 : rqScore >= 50 ? 70 : rqScore >= 25 ? 50 : 30;
      const reporting_quality = { reporting_quality_score: engineOut(rqScore, 'business', rqConf, rqScore >= 75 ? 'verified_financial_analysis' : 'assessment_plus_documents', ['documents','extracted_fields','business_assessments'], 'weighted_composite', [], rqScore < 50) };

      // ── Profit IQ Engine ────────────────────────────────────────────────────
      const IND_BENCH = { manufacturing: 0.07, technology: 0.18, software: 0.20, retail: 0.05, construction: 0.05, healthcare: 0.08, consulting: 0.20, professional_services: 0.15, default: 0.10 };
      const indKey = Object.keys(IND_BENCH).find(k => (bizEntity?.industry || dmRow?.industry || '').toLowerCase().includes(k)) || 'default';
      const benchMarg = IND_BENCH[indKey];
      const actualMarg = revenue && netProfit && revenue > 0 ? netProfit / revenue : (assessMap['profit_gap']?.score ? (assessMap['profit_gap'].score / 100) * benchMarg * 1.5 : null);
      const iqRaw = actualMarg != null ? Math.min(1.5, Math.max(0, actualMarg / benchMarg)) : null;
      const profit_iq = { profit_iq: engineOut(iqRaw != null ? Math.round((iqRaw/1.5)*100) : null, 'business', revenue && netProfit ? 65 : 30, revenue && netProfit ? 'assessment_plus_documents' : 'assessment_only', ['dashboard_metrics','industry_benchmark'], 'actual_margin/benchmark_margin', revenue && netProfit ? [] : ['Upload P&L for accurate margin'], !revenue || !netProfit) };

      // ── Protection Gap Engine ───────────────────────────────────────────────
      // Weighted exposure deficit per layer — not max coverage
      const protConf = assessments.length > 0 ? 50 : 30;
      const profProtScore = assessMap['freedom_assessment']?.score;
      const bizProtScore  = assessMap['operations_gap']?.score;
      const profCoverage  = profProtScore != null ? profProtScore / 100 : 0;
      const bizCoverage   = bizProtScore  != null ? bizProtScore  / 100 : 0;
      const protection_gap = {
        profile_protection:   engineOut(Math.round((1 - profCoverage) * 100), 'profile',    protConf, 'assessment_only', ['business_assessments'], 'Σ(exposure) - Σ(coverage×weight)', profProtScore == null ? ['No freedom assessment'] : [], true),
        business_protection:  engineOut(Math.round((1 - bizCoverage)  * 100), 'business',   protConf, 'assessment_only', ['business_assessments'], 'Σ(exposure) - Σ(coverage×weight)', bizProtScore  == null ? ['No operations assessment'] : [], true),
        portfolio_protection: engineOut(null, 'portfolio', 30, 'assessment_only', ['business_assessments'], 'Σ(exposure_deficits_across_entities)', ['Requires multi-business data and advisor verification'], true),
        methodology: 'weighted_exposure_deficit — not max_coverage',
      };

      // ── Freedom Engine Integration ──────────────────────────────────────────
      // Call freedomEngine backend function to get full path comparison
      let freedom = null;
      let current_path = null;
      let committed_optimized_path = null;
      let potential_optimized_path = null;
      let freedom_assumptions = null;
      let freedom_warnings = [];

      try {
        const base44 = createClientFromRequest(req);
        const feRes = await base44.functions.invoke('freedomEngine', {});
        if (feRes?.data) {
          freedom = feRes.data;
          current_path = feRes.data.current_path;
          committed_optimized_path = feRes.data.committed_optimized_path;
          potential_optimized_path = feRes.data.potential_optimized_path;
          freedom_assumptions = feRes.data.assumptions;
          freedom_warnings = feRes.data.warnings || [];
        }
      } catch (_) {
        // Freedom engine unavailable — continue with other engines
        freedom_warnings.push('Freedom Engine temporarily unavailable');
      }

      // ── Ownership Concentration Engine ──────────────────────────────────────
      let ownership_concentration = null;
      try {
        const base44 = createClientFromRequest(req);
        const ocRes = await base44.functions.invoke('ownershipConcentrationEngine', {});
        if (ocRes?.data) {
          ownership_concentration = ocRes.data;
        }
      } catch (_) {
        // Ownership concentration unavailable — continue
      }

      return Response.json({
        ownership_adjustment,
        confidence,
        reporting_quality,
        profit_iq,
        protection_gap,
        freedom,
        current_path,
        committed_optimized_path,
        potential_optimized_path,
        assumptions: freedom_assumptions,
        warnings: freedom_warnings,
        ownership_concentration,
        meta: {
          profile_id: profileId,
          business_id: bizId,
          generated_at: new Date().toISOString(),
          note: 'Engine outputs are for internal validation only. Do not modify live dashboard metrics.',
        },
      });
    }

    if (action === 'debugResolveClientIqScore') {
      const debug = { input: { target_profile_id, _router_user_email: acting.profile?.email || null }, errors: [] };
      try {
        const profile = await getProfile();
        debug.profile_found = !!profile;
        debug.profile_id = profile?.id || null;
        debug.profile_email = profile?.email || null;
        debug.primary_business_id = profile?.primary_business_id || null;

        if (profile) {
          // Source 1: dashboard_metrics.ciq_score (written by regenerateCiqMetrics) and overall_impact_score
          const { data: dm, error: dmErr } = await sb.from('dashboard_metrics').select('overall_impact_score, ciq_score, updated_at').eq('profile_id', profile.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
          debug.dashboard_metrics = dm || null;
          if (dmErr) debug.errors.push('dashboard_metrics: ' + dmErr.message);

          // Source 2: business_metric_snapshots latest overall_impact_score
          const { data: snaps, error: snapErr } = await sb.from('business_metric_snapshots').select('snapshot_date, overall_impact_score').eq('profile_id', profile.id).order('snapshot_date', { ascending: false }).limit(5);
          debug.latest_snapshots = snaps || [];
          if (snapErr) debug.errors.push('snapshots: ' + snapErr.message);

          // Source 3: v_business_assessment_summary
          // Phase 6.9B — diagnostic action: resolves the EXPLICIT business only and
          // never guesses the profile's primary business.
          const bizId = data?.active_business_id || data?.business_id || null;
          debug.resolved_business_id = bizId;
          if (bizId) {
            const { data: asum, error: asumErr } = await sb.from('v_business_assessment_summary').select('overall_iq_score, ciq_score, impact_score').eq('business_id', bizId).maybeSingle();
            debug.assessment_summary_scores = asum || null;
            if (asumErr) debug.errors.push('assessment_summary: ' + asumErr.message);
          }
        }

        // Determine final score — ciq_score is the primary written field
        const s1 = debug.dashboard_metrics?.ciq_score || debug.dashboard_metrics?.overall_impact_score || 0;
        const s2 = debug.latest_snapshots?.[0]?.overall_impact_score || 0;
        const s3 = debug.assessment_summary_scores?.overall_iq_score || debug.assessment_summary_scores?.ciq_score || debug.assessment_summary_scores?.impact_score || 0;
        debug.score_from_dashboard_metrics = s1;
        debug.score_from_latest_snapshot = s2;
        debug.score_from_assessment_summary = s3;
        debug.selected_final_score = s1 || s2 || s3;
      } catch (e) {
        debug.errors.push('fatal: ' + e.message);
      }
      return Response.json({ debug });
    }

    // ── PHASE 2B: ENGINE OUTPUTS (additive — never modifies existing dashboard values) ──
    if (action === 'getPhase2BEngines') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      // Phase 6.9B — canonical resolution (never primary for a multi-business account).
      const { businessId: bizId, denial: engineDenial } = await requireBusinessContext(
        sb, profile, data?.active_business_id || data?.business_id,
        'supabaseDashboardData.getPhase2BEngines'
      );
      if (engineDenial) return engineDenial;
      const profileId = profile.id;

      // All engine logic runs inline using the already-authenticated sb client.
      // This avoids cross-function HTTP calls which require separate auth tokens.

      const engineOut = (value, scope, confidence_score, confidence_source, data_sources, calculation_method, warnings = [], requires_verification = false) =>
        ({ value, scope, confidence_score, confidence_source, data_sources, calculation_method, warnings, requires_verification });

      // Parallel fetch all data needed across engines
      const [
        ownershipResult, assessResult, docResult, extractedResult,
        dmResult, snapResult, bizResult, pfResult, vceResult,
      ] = await Promise.allSettled([
        sb.from('business_owners').select('business_id, ownership_percentage, ownership_type, is_primary_owner').eq('profile_id', profileId),
        sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, updated_at').eq('profile_id', profileId),
        sb.from('documents').select('document_type, upload_status, year, created_at').eq('profile_id', profileId).eq('upload_status', 'completed'),
        sb.from('extracted_fields').select('field_name, review_status, field_category').eq('profile_id', profileId).in('review_status', ['accepted', 'corrected']),
        sb.from('dashboard_metrics').select('*').eq('profile_id', profileId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('business_metric_snapshots').select('annual_revenue, net_profit, ebitda, current_business_value').eq('profile_id', profileId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
        bizId ? sb.from('business_entities').select('id, business_name, industry').eq('id', bizId).maybeSingle() : Promise.resolve({ data: null }),
        sb.from('profile_financials').select('*').eq('profile_id', profileId).maybeSingle(),
        bizId ? sb.from('value_creation_events').select('id, status').eq('business_id', bizId).eq('status', 'verified') : Promise.resolve({ data: [] }),
      ]);

      const safe = (r, fb = null) => r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;
      const ownershipRows = safe(ownershipResult, []);
      const assessments   = safe(assessResult, []);
      const documents     = safe(docResult, []);
      const extracted     = safe(extractedResult, []);
      const dmRow         = safe(dmResult, null);
      const snapRow       = safe(snapResult, null);
      const bizEntity     = safe(bizResult, null);
      const profileFin    = safe(pfResult, null);
      const verifiedEvents= safe(vceResult, []);

      const assessMap  = (assessments || []).reduce((a, r) => { a[r.assessment_type] = r; return a; }, {});
      const docTypes   = new Set((documents || []).map(d => d.document_type));
      const hasExtracted = extracted.length > 0;
      const hasVerified  = verifiedEvents.length > 0;

      // ── Ownership Adjustment Engine ─────────────────────────────────────────
      const ownerMap = (ownershipRows || []).reduce((a, r) => { a[r.business_id] = r.ownership_percentage ?? 100; return a; }, {});
      const revenue = snapRow?.annual_revenue || dmRow?.revenue || null;
      const netProfit = snapRow?.net_profit || dmRow?.net_profit || null;
      const ebitda = snapRow?.ebitda || dmRow?.recast_ebitda || null;
      const ev = dmRow?.enterprise_value || (netProfit ? netProfit * 4 : null);
      const ownPct = bizId && ownerMap[bizId] != null ? ownerMap[bizId] / 100 : 1.0;
      const ownership_adjustment = {
        adjusted_metrics: [{
          business_id: bizId, ownership_pct: ownPct * 100,
          raw: { enterprise_value: ev, ebitda, cash_flow: netProfit },
          adjusted: { enterprise_value: ev != null ? ev * ownPct : null, ebitda: ebitda != null ? ebitda * ownPct : null, cash_flow: netProfit != null ? netProfit * ownPct : null },
        }],
        portfolio_totals: {
          enterprise_value: engineOut(ev != null ? ev * ownPct : null, 'portfolio', 50, 'assessment_plus_documents', ['business_owners','dashboard_metrics'], 'Σ(EV × ownership_pct)', [], ev == null),
          ebitda: engineOut(ebitda != null ? ebitda * ownPct : null, 'portfolio', 50, 'assessment_plus_documents', ['business_owners','dashboard_metrics'], 'Σ(EBITDA × ownership_pct)', [], ebitda == null),
        },
      };

      // ── Confidence Engine ───────────────────────────────────────────────────
      const DOC_REQS = { profit_gap: ['profit_and_loss'], value_gap: ['profit_and_loss','balance_sheet'], tax_gap: ['business_tax_return','personal_tax_return'], recast_ebitda: ['profit_and_loss','payroll_report'], enterprise_value: ['profit_and_loss','balance_sheet'] };
      const confFor = (metric) => {
        const hasA = !!assessMap[metric]; const reqDocs = DOC_REQS[metric] || []; const hasDocs = reqDocs.length === 0 || reqDocs.some(d => docTypes.has(d));
        if (!hasA) return engineOut(15, 'business', 15, 'assessment_only', [], `no_assessment`, [`No ${metric} assessment`], true);
        if (!hasDocs) return engineOut(30, 'business', 30, 'assessment_only', ['assessment'], `assessment_only`, [`Missing: ${reqDocs.filter(d=>!docTypes.has(d)).join(', ')}`], true);
        if (hasDocs && hasExtracted && hasVerified) return engineOut(95, 'business', 95, 'verified_financial_analysis', ['assessment','documents','extracted_fields'], 'full_verification', [], false);
        if (hasDocs && hasExtracted) return engineOut(75, 'business', 75, 'assessment_plus_documents', ['assessment','documents','extracted_fields'], 'docs_and_extraction', [], false);
        return engineOut(60, 'business', 60, 'assessment_plus_documents', ['assessment','documents'], 'docs_only', [], false);
      };
      const confidence = { confidence_scores: { profit_gap: confFor('profit_gap'), value_gap: confFor('value_gap'), tax_gap: confFor('tax_gap'), enterprise_value: confFor('enterprise_value') } };

      // ── Reporting Quality Engine ────────────────────────────────────────────
      const eighteenAgo = new Date(); eighteenAgo.setMonth(eighteenAgo.getMonth() - 18);
      const recentDocs = (documents || []).filter(d => new Date(d.created_at) > eighteenAgo);
      const acceptedExtracted = (extracted || []).filter(f => ['accepted','corrected'].includes(f.review_status));
      const reconRatio = extracted.length > 0 ? acceptedExtracted.length / extracted.length : 0;
      const taxDocs2 = (documents || []).filter(d => ['business_tax_return','personal_tax_return'].includes(d.document_type));
      const balanceDocs = (documents || []).filter(d => d.document_type === 'balance_sheet');
      const rqScore = Math.min(20, recentDocs.length * 4) + Math.round(reconRatio * 20) + Math.min(15, taxDocs2.length * 5) + Math.min(15, balanceDocs.length * 7) + (assessMap['recast_ebitda'] ? 8 : 0) + Math.round(((['profit_and_loss','balance_sheet','business_tax_return'].filter(t=>docTypes.has(t)).length)/3)*15);
      const rqConf = rqScore >= 75 ? 95 : rqScore >= 50 ? 70 : rqScore >= 25 ? 50 : 30;
      const reporting_quality = { reporting_quality_score: engineOut(rqScore, 'business', rqConf, rqScore >= 75 ? 'verified_financial_analysis' : 'assessment_plus_documents', ['documents','extracted_fields','business_assessments'], 'weighted_composite', [], rqScore < 50) };

      // ── Profit IQ Engine ────────────────────────────────────────────────────
      const IND_BENCH = { manufacturing: 0.07, technology: 0.18, software: 0.20, retail: 0.05, construction: 0.05, healthcare: 0.08, consulting: 0.20, professional_services: 0.15, default: 0.10 };
      const indKey = Object.keys(IND_BENCH).find(k => (bizEntity?.industry || dmRow?.industry || '').toLowerCase().includes(k)) || 'default';
      const benchMarg = IND_BENCH[indKey];
      const actualMarg = revenue && netProfit && revenue > 0 ? netProfit / revenue : (assessMap['profit_gap']?.score ? (assessMap['profit_gap'].score / 100) * benchMarg * 1.5 : null);
      const iqRaw = actualMarg != null ? Math.min(1.5, Math.max(0, actualMarg / benchMarg)) : null;
      const profit_iq = { profit_iq: engineOut(iqRaw != null ? Math.round((iqRaw/1.5)*100) : null, 'business', revenue && netProfit ? 65 : 30, revenue && netProfit ? 'assessment_plus_documents' : 'assessment_only', ['dashboard_metrics','industry_benchmark'], 'actual_margin/benchmark_margin', revenue && netProfit ? [] : ['Upload P&L for accurate margin'], !revenue || !netProfit) };

      // ── Protection Gap Engine ───────────────────────────────────────────────
      // Weighted exposure deficit per layer — not max coverage
      const protConf = assessments.length > 0 ? 50 : 30;
      const profProtScore = assessMap['freedom_assessment']?.score;
      const bizProtScore  = assessMap['operations_gap']?.score;
      const profCoverage  = profProtScore != null ? profProtScore / 100 : 0;
      const bizCoverage   = bizProtScore  != null ? bizProtScore  / 100 : 0;
      const protection_gap = {
        profile_protection:   engineOut(Math.round((1 - profCoverage) * 100), 'profile',    protConf, 'assessment_only', ['business_assessments'], 'Σ(exposure) - Σ(coverage×weight)', profProtScore == null ? ['No freedom assessment'] : [], true),
        business_protection:  engineOut(Math.round((1 - bizCoverage)  * 100), 'business',   protConf, 'assessment_only', ['business_assessments'], 'Σ(exposure) - Σ(coverage×weight)', bizProtScore  == null ? ['No operations assessment'] : [], true),
        portfolio_protection: engineOut(null, 'portfolio', 30, 'assessment_only', ['business_assessments'], 'Σ(exposure_deficits_across_entities)', ['Requires multi-business data and advisor verification'], true),
        methodology: 'weighted_exposure_deficit — not max_coverage',
      };

      // ── Freedom Engine ──────────────────────────────────────────────────────
      const SWR = 0.04; const INFLATION = 0.03; const TAX_DRAG = 0.25;
      const annExp = profileFin?.annual_personal_expenses || null;
      const lifestyleNeed = annExp ? (annExp / (1 - TAX_DRAG)) * (1 + INFLATION) : null;
      const freedomNumber = lifestyleNeed != null ? Math.round(lifestyleNeed / SWR) : null;
      const bizEquity = netProfit ? netProfit * 4 * ownPct : 0;
      const personalAssets = profileFin?.investable_assets || null;
      const netWorth = personalAssets != null || bizEquity > 0 ? (personalAssets || 0) + bizEquity - (profileFin?.total_personal_debt || 0) : null;
      const freedomGap = freedomNumber != null && netWorth != null ? Math.max(0, freedomNumber - netWorth) : null;
      const assessFreeScore = assessMap['freedom_assessment']?.score || null;
      const gapProb = freedomGap != null && freedomNumber > 0 ? Math.max(20, Math.round((1 - freedomGap/freedomNumber)*100)) : null;
      const freedomScoreVal = gapProb != null && assessFreeScore != null ? Math.round(gapProb*0.6 + assessFreeScore*0.4) : gapProb || assessFreeScore;
      const freqConf = annExp != null ? 55 : assessFreeScore != null ? 30 : 15;
      const freedom = {
        freedom_number: engineOut(freedomNumber, 'profile', freqConf, freqConf >= 55 ? 'assessment_plus_documents' : 'assessment_only', ['profile_financials','freedom_assessment'], 'annual_lifestyle_need/(1-tax_drag)×(1+inflation)/SWR', annExp == null ? ['Annual expenses not found in profile_financials'] : [], freqConf < 55),
        freedom_gap:    engineOut(freedomGap,    'profile', freqConf, freqConf >= 55 ? 'assessment_plus_documents' : 'assessment_only', ['profile_financials','business_owners','dashboard_metrics'], 'Freedom Number - Current Investable Net Worth', [], freqConf < 55),
        freedom_score:  engineOut(freedomScoreVal,'profile',freqConf, freqConf >= 55 ? 'assessment_plus_documents' : 'assessment_only', ['freedom_assessment','profile_financials'], 'gap_probability×0.6 + assessment_score×0.4', [], freqConf < 55),
        scope_declaration: { scope: 'profile', business_id_filter: 'PROHIBITED' },
      };

      // ── Ownership Concentration Risk™ ───────────────────────────────────────
      // Single-business = HHI of 1.0 (Critical) by definition — not a penalty, just a fact
      const numBiz = (ownershipRows || []).length || 1;
      const hhiIndex = numBiz <= 1 ? 1.0 : 1 / numBiz; // simplified; full calc requires per-biz EV
      const riskBand = hhiIndex < 0.20 ? 'low' : hhiIndex < 0.40 ? 'moderate' : hhiIndex < 0.60 ? 'high' : 'critical';
      const ownership_concentration = {
        concentration_index: engineOut(Math.round(hhiIndex*100)/100, 'portfolio', numBiz > 1 ? 55 : 30, 'assessment_only', ['business_owners','dashboard_metrics'], 'HHI=Σ(ev_contribution_pct²)', numBiz <= 1 ? ['Single business — 100% concentration is expected'] : [], false),
        risk_rating: { band: riskBand, hhi_index: hhiIndex },
        methodology: 'herfindahl_hirschman_index',
      };

      return Response.json({
        ownership_adjustment,
        confidence,
        reporting_quality,
        profit_iq,
        protection_gap,
        freedom,
        ownership_concentration,
        _meta: {
          phase: '2B',
          profile_id: profileId,
          business_id: bizId,
          generated_at: new Date().toISOString(),
          safety_note: 'All engine outputs are additive. Existing dashboard_metrics fields are unchanged.',
        }
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});