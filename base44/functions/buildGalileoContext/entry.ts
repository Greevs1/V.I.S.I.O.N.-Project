/**
 * buildGalileoContext — aggregates all relevant business intelligence
 * into a single structured context object for Galileo AI.
 *
 * Inputs: { business_id | active_business_id, question (optional), current_route,
 *           page_context, selected_entity_id, valuation_id, workspace_key,
 *           section_key, focused_record_type, focused_record_id, conversation_mode }
 *
 * IDENTITY (P-S3, closes SEC-001): the ACTOR comes from the authenticated Base44
 * session through the shared Security Kernel — never from the request body. A body
 * `profile_id` is UNTRUSTED: it may name a TARGET (the actor, or a subject a
 * canonical administrator is allowed to act for) and can never establish identity,
 * a role, or business authority. The business is authorized for the acting profile
 * BEFORE any business-scoped read.
 *
 * Rules:
 *  - Use business_id as primary filter
 *  - Prefer verified values over estimated
 *  - Prefer advisor-reviewed document data over raw extraction
 *  - Include missing data explicitly (null / [])
 *  - Do NOT invent values
 *  - Include source labels for each major number
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';
import { fetchCanonicalRecommendations } from '../../shared/galileoBieConsumer/entry.ts';
import { buildBusinessIntelligenceContract } from '../../shared/intelligenceContract/businessIntelligenceContract.ts';
import { buildGalileoValuationContext } from '../../shared/galileo/valuationContext.ts';
import { loadCanonicalFactsForConsumer, getPreferredValue } from '../../shared/canonicalFact/consumerAdapter.ts';
import { PILOT_FACT_KEYS } from '../../shared/canonicalFact/registry.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
    const { business_id: requested_business_id, active_business_id, question, current_route, page_context, selected_entity_id,
          valuation_id, workspace_key, section_key, focused_record_type, focused_record_id, conversation_mode } = body;

    // ── P-S3 — CANONICAL ACTOR BINDING (closes SEC-001) ───────────────────────
    // WHAT WAS WRONG: `profile_id` used to arrive from the request body and, when
    // present, SKIPPED canonical actor resolution entirely. The authorization
    // profile AND the `primary_business_id` it was judged against both came from
    // the caller — so naming another owner's profile id was enough to read their
    // business context through this service-role client, and the Base44
    // `user.role` was a second, independent way to be treated as an administrator.
    //
    // THE RULE NOW: the ACTOR comes from the authenticated Base44 session through
    // the shared kernel; the BUSINESS is authorized for that canonical actor (or
    // for a subject the actor is canonically allowed to act for) BEFORE any
    // business-scoped read. A body `profile_id` is untrusted input: it may only
    // name a TARGET, it can never establish identity or authority, and only a
    // canonical administrator may name a target other than themselves — the same
    // rule the reviewed routers already apply.
    const requestedBusinessId = active_business_id || requested_business_id;

    let profile: any = null;
    let profile_id: string | null = null;
    let resolved_business_id: string | null = null;

    try {
      const actor = await authenticateActor(base44, sb);

      const wantsProfileId =
        typeof body.profile_id === 'string' && body.profile_id.trim() ? body.profile_id.trim() : null;
      const idIsSelf = Boolean(wantsProfileId) && wantsProfileId === actor.profile_id;

      // Refused HERE, before any lookup, so a non-administrator can never learn
      // whether an arbitrary profile id exists (a nonexistent and a foreign id
      // produce the identical refusal).
      if (wantsProfileId && !idIsSelf && !actor.isAdmin) {
        return Response.json({ error: 'Forbidden: admin access required for user override' }, { status: 403 });
      }

      // ACTOR → SUBJECT. No target: the actor's own profile. Target named:
      // honoured only when the actor is acting on themselves, is a canonical
      // administrator, or is provably authorized for the target's business
      // (owner / assigned advisor / team member / active expert relationship).
      // The shared resolver decides that — never the request body.
      const resolved = await resolveActingProfile(sb, actor, {
        targetProfileId: idIsSelf ? null : wantsProfileId,
      });
      profile = resolved.profile;
      profile_id = profile.id;

      // SUBJECT + REQUESTED BUSINESS → AUTHORITY. The canonical business contract
      // authorizes the acting profile against the requested business (an explicit
      // business wins; an ambiguous multi-business account is refused rather than
      // silently answered with the wrong one). NO business-scoped data is read
      // before this returns.
      const { businessId, denial } = await requireBusinessContext(
        sb, profile, requestedBusinessId, 'buildGalileoContext'
      );
      if (denial) {
        // Canonical refusals pass through when they carry caller-actionable
        // context (400 BUSINESS_CONTEXT_REQUIRED). A 403 is normalized to this
        // function's own existing refusal so a foreign business and a nonexistent
        // business are indistinguishable — no tenant-existence oracle.
        if (denial.status === 403) return Response.json({ error: 'Forbidden' }, { status: 403 });
        return denial;
      }
      resolved_business_id = businessId;
    } catch (err) {
      return errorResponse(err);
    }

    if (!resolved_business_id) {
      return Response.json({ error: 'business_id required (or profile must have primary_business_id)' }, { status: 400 });
    }

    const business_id = resolved_business_id;
    // Canonical application role of the acting subject — deliberately NO Base44
    // `user.role` fallback, so Base44 standing can never elevate anything here.
    const role = profile?.app_role || null;

    // ── Shared Supabase Intelligence Contract ─────────────────────────────────
    // The single certified current-business intelligence state. Galileo no longer
    // independently resolves persistent facts — it reads from the same contract as
    // Dashboard, Executive Brief, and Living Intelligence.
    const contract = await buildBusinessIntelligenceContract(sb, business_id, profile_id);

    const missing_data = [];
    const schema_notes = [];

    // ── Parallel fetch all data sources ──────────────────────────────────────
    const [
      bizResult,
      dashResult,
      snapshotResult,
      assessResult,
      oppResult,
      nbaResult,
      roadmapResult,
      vceResult,
      docResult,
      notesResult,
      kbResult,
      sprintResult,
      outcomeResult,
    ] = await Promise.allSettled([
      sb.from('business_entities').select('*').eq('id', business_id).maybeSingle(),
      sb.from('dashboard_metrics').select('*').eq('business_id', business_id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('business_metric_snapshots').select('snapshot_date, overall_impact_score, annual_revenue, net_profit, ebitda, current_business_value, value_gap, profit_opportunity, tax_opportunity, cash_flow_opportunity, data_confidence_score').eq('business_id', business_id).order('snapshot_date', { ascending: false }).limit(10),
      sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, risk_level, opportunity_level, summary, key_findings, recommendations, updated_at').eq('business_id', business_id),
      sb.from('business_opportunities').select('id, title, category, priority_score, estimated_impact, confidence_score, status, source').eq('business_id', business_id).order('priority_score', { ascending: false }).limit(20),
      sb.from('next_best_actions').select('id, title, action_type, priority_score, estimated_impact, status, reason, difficulty_level, expected_time_days').eq('business_id', business_id).in('status', ['recommended', 'accepted', 'in_progress']).order('priority_score', { ascending: false }).limit(10),
      sb.from('roadmap_items').select('id, title, category, status, priority, estimated_value_created, due_date, completed_at, verified_at, source_assessment_type, impact_score').eq('business_id', business_id).order('impact_score', { ascending: false }).limit(50),
      sb.from('value_creation_events').select('id, title, category, status, confidence_level, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement, estimated_tax_savings, estimated_profit_improvement, estimated_cash_flow_improvement, reviewed_at').eq('business_id', business_id).order('updated_at', { ascending: false }).limit(50),
      sb.from('documents').select('id, name, document_type, upload_status, year, created_at').eq('business_id', business_id).order('created_at', { ascending: false }).limit(20),
      // B1.1 — advisor notes and the active sprint belong to the authorized
      // active business, never the whole profile: the records carry the
      // business's own profile_id, so business scoping preserves advisor, team
      // and expert access while excluding sibling businesses.
      sb.from('advisor_notes').select('id, note, created_at, visibility').eq('business_id', business_id).neq('visibility', 'advisor_only').order('created_at', { ascending: false }).limit(20),
      base44.asServiceRole.entities.KnowledgeBaseEntry.filter({ status: 'published' }, '-created_date', 50),
      sb.from('ninety_day_sprint_paths').select('id, path_title, path_goal, status, progress_percent, is_active, created_at').eq('business_id', business_id).eq('is_active', true).limit(1),
      sb.from('strategy_outcomes').select('status, source_type, source_name, category, total_projected_impact, total_actual_impact, total_variance, accuracy_percentage, actual_freedom_acceleration_months, projected_freedom_acceleration_months, should_include_in_learning, confidence_score').eq('business_id', business_id).order('created_at', { ascending: false }).limit(50),
    ]);

    // ── Fetch ReadinessItems from Base44 entity (scoped by business_id if set) ─
    let readiness_rows = [];
    try {
      const allReadiness = await base44.asServiceRole.entities.ReadinessItem.filter({ created_by_id: profile_id }, '-created_date', 100);
      readiness_rows = (allReadiness || []).filter(i => !i.business_id || i.business_id === business_id);
    } catch (rErr) {
      schema_notes.push(`readiness_items: ${rErr.message} (non-fatal)`);
    }

    // Safely extract results
    const safeVal = (settled, fallback = null) => settled.status === 'fulfilled' ? (settled.value?.data ?? fallback) : fallback;
    const safeList = (settled, fallback = []) => settled.status === 'fulfilled' ? (settled.value || fallback) : fallback;
    const safeErr = (settled, name) => {
      if (settled.status === 'rejected' || settled.value?.error) {
        schema_notes.push(`${name}: ${settled.value?.error?.message || settled.reason?.message || 'fetch error'}`);
        return true;
      }
      return false;
    };

    const business_entity = safeVal(bizResult);
    const dashboard_metrics = safeVal(dashResult);
    const snapshots = safeVal(snapshotResult, []);
    const assessments = safeVal(assessResult, []);
    const opportunities = safeVal(oppResult, []);
    const nba_rows = safeVal(nbaResult, []);
    const roadmap_rows = safeVal(roadmapResult, []);
    const vce_rows = safeVal(vceResult, []);
    const doc_rows = safeVal(docResult, []);
    const advisor_note_rows = safeVal(notesResult, []);
    const all_kb_entries = safeList(kbResult, []);
    const active_sprint_rows = safeVal(sprintResult, []);
    const outcome_rows = safeVal(outcomeResult, []);

    safeErr(bizResult, 'business_entities');
    safeErr(dashResult, 'dashboard_metrics');
    safeErr(snapshotResult, 'business_metric_snapshots');
    safeErr(assessResult, 'business_assessments');
    safeErr(oppResult, 'business_opportunities');
    safeErr(nbaResult, 'next_best_actions');
    safeErr(roadmapResult, 'roadmap_items');
    safeErr(vceResult, 'value_creation_events');
    safeErr(docResult, 'documents');
    safeErr(notesResult, 'advisor_notes');
    safeErr(kbResult, 'knowledge_base_entries');

    // ── Reviewed document observations ───────────────────────────────────────
    // 6D.0a: Galileo no longer reads extracted_fields itself. Reviewed
    // observations arrive through the Shared Intelligence Contract's semantic
    // layer, which preserves business scope, period, provenance and review state.

    // ── Fetch chat/conversation history ──────────────────────────────────────
    let chat_history = [];
    try {
      // Phase 6B — conversation history is business-scoped.
      // A conversation from Business A must never appear while Business B is active.
      const convs = await base44.asServiceRole.entities.GalileoConversation.filter({ created_by_id: profile_id, business_id });
      // Get last 5 messages from most recent conversation
      if (convs && convs.length > 0) {
        const latest = convs[0];
        chat_history = (latest.messages || []).slice(-5).map(m => ({
          role: m.role, content: m.content?.slice(0, 300), timestamp: m.timestamp
        }));
      }
    } catch (chatErr) {
      schema_notes.push(`chat_history: ${chatErr.message} (non-fatal)`);
    }

    // ── BUILD business_profile ────────────────────────────────────────────────
    if (!business_entity) missing_data.push('business_entity');

    const business_profile = business_entity ? {
      id: business_entity.id,
      name: business_entity.business_name || business_entity.name || null,
      industry: business_entity.industry || business_entity.industry_type || null,
      entity_type: business_entity.entity_type || null,
      annual_revenue_range: business_entity.annual_revenue_range || null,
      state: business_entity.state || business_entity.business_state || null,
      years_in_business: business_entity.years_in_business || null,
      employees: business_entity.employee_count || business_entity.num_employees || null,
    } : null;

    // ── BUILD current_metrics ─────────────────────────────────────────────────
    if (!dashboard_metrics) missing_data.push('dashboard_metrics');

    const latest_snap = snapshots?.[0] || null;

    const resolveWithSource = (verifiedVal, estimatedVal, docVal, verifiedSrc, estimatedSrc, docSrc) => {
      if (verifiedVal != null) return { value: verifiedVal, source: verifiedSrc };
      if (docVal != null) return { value: docVal, source: docSrc };
      if (estimatedVal != null) return { value: estimatedVal, source: estimatedSrc };
      return { value: null, source: null };
    };

    // ── 6D.0a — Galileo reads the SEMANTIC layer, not field names ────────────
    // Reviewed observations are mapped to canonical meanings (gross_receipts →
    // revenue, officer_compensation → owner_compensation, …) with period and
    // provenance by the ONE shared bridge, and reach Galileo through the
    // contract below — the single authorized read path. Galileo keeps no
    // private field-name matcher and issues no field query of its own.
    const semantic_observations = contract.semantic_observations || {};
    const observation_availability = contract.observation_period_availability || {};
    const semValue = (key) => (semantic_observations[key] ? semantic_observations[key].value : null);
    const semPeriod = (key) => (semantic_observations[key] ? semantic_observations[key].period.label : null);
    const semProvenance = (key) => (semantic_observations[key] ? semantic_observations[key].provenance.source_label : null);
    const semLifecycle = (key) => (semantic_observations[key] ? semantic_observations[key].lifecycle_state : null);

    // ── current_metrics — from the Shared Intelligence Contract ────────────
    // Galileo no longer independently resolves current-business financial truth.
    // The contract is the single certified owner. Legacy snapshot/dashboard_metrics
    // values are used ONLY for historical trend context (financial_snapshots),
    // not for current truth. See intelligenceContract/businessIntelligenceContract.ts.
    const contractRev = contract.profitability.revenue;
    const contractNet = contract.profitability.net_profit;
    const contractEbitda = contract.profitability.reported_ebitda;
    const contractBizValue = contract.valuation.current_value;
    const contractIq = contract.business_iq;

    // Every document-derived metric now carries the PERIOD and PROVENANCE it was
    // reviewed with, so "your reviewed FY2025 tax return" can never be read as
    // "current revenue". Null still means unknown — never zero.
    const current_metrics = {
      revenue: {
        value: contractRev ?? semValue('revenue') ?? null,
        source: contractRev != null ? 'contract' : (semValue('revenue') != null ? 'reviewed_observation' : null),
        period: contract.profitability.revenue_period_label ?? semPeriod('revenue'),
        period_type: contract.profitability.revenue_period_type ?? null,
        provenance: contract.profitability.revenue_provenance ?? semProvenance('revenue'),
        lifecycle: contract.profitability.revenue_lifecycle_state ?? semLifecycle('revenue'),
      },
      net_profit: {
        value: contractNet ?? semValue('net_income') ?? null,
        source: contractNet != null ? 'contract' : (semValue('net_income') != null ? 'reviewed_observation' : null),
        period: contract.profitability.net_profit_period_label ?? semPeriod('net_income'),
        period_type: null,
        provenance: contract.profitability.net_profit_provenance ?? semProvenance('net_income'),
        lifecycle: semLifecycle('net_income'),
      },
      ebitda: {
        value: contractEbitda ?? semValue('reported_ebitda') ?? null,
        source: contractEbitda != null ? 'contract' : (semValue('reported_ebitda') != null ? 'reviewed_observation' : null),
        period: contract.profitability.reported_ebitda_period_label ?? semPeriod('reported_ebitda'),
        period_type: null,
        provenance: semProvenance('reported_ebitda'),
        lifecycle: semLifecycle('reported_ebitda'),
      },
      owner_compensation: {
        value: contract.profitability.owner_compensation ?? semValue('owner_compensation') ?? null,
        source: semValue('owner_compensation') != null ? 'reviewed_observation' : null,
        period: contract.profitability.owner_compensation_period_label ?? semPeriod('owner_compensation'),
        period_type: null,
        provenance: contract.profitability.owner_compensation_provenance ?? semProvenance('owner_compensation'),
        lifecycle: semLifecycle('owner_compensation'),
      },
      gross_profit: {
        value: contract.profitability.gross_profit ?? semValue('gross_profit') ?? null,
        source: semValue('gross_profit') != null ? 'reviewed_observation' : null,
        period: contract.profitability.gross_profit_period_label ?? semPeriod('gross_profit'),
        period_type: null,
        provenance: semProvenance('gross_profit'),
        lifecycle: semLifecycle('gross_profit'),
      },
      business_value: {
        value: contractBizValue ?? null,
        source: contractBizValue != null ? 'contract' : null,
      },
      ciq_score: {
        value: contractIq ?? null,
        source: contractIq != null ? 'contract' : null,
      },
      data_confidence: {
        value: contract.business_confidence ?? null,
        source: 'contract',
      },
    };

    // A missing CURRENT value is stated precisely: when reviewed observations
    // exist for another period, Galileo must say which period it holds instead
    // of asking the owner for revenue it already has.
    if (!current_metrics.revenue.value && !current_metrics.net_profit.value) {
      const knownPeriods = [...new Set([
        ...(observation_availability.revenue || []),
        ...(observation_availability.net_income || []),
      ].filter(Boolean))];
      if (knownPeriods.length > 0) {
        missing_data.push(`current-period revenue/net income (reviewed observations exist for: ${knownPeriods.join(', ')})`);
      } else {
        missing_data.push('financial_metrics (revenue, net_profit)');
      }
    }

    // ── Phase 14.2B: Canonical Fact Consumer Migration (Galileo) ─────────────
    // Prefer canonical facts for pilot metrics. Legacy values are fallback only.
    // Shadow comparison is computed internally; conflict state is exposed, not
    // silently substituted. Existing response shape is preserved.
    let canonical_facts: any = null;
    let canonical_shadow: any[] = [];
    let canonical_telemetry: any[] = [];
    let canonical_conflicts: any[] = [];

    try {
      // Build a minimal AuthCtx-like object for the adapter
      const galileoCtx = {
        sb,
        vsb: sb.schema('valuation'),
        profile,
        profileId: profile_id,
        isSuperAdmin: role === 'super_admin',
        user,
      };

      // Legacy values for shadow comparison
      const legacyValues: Record<string, any> = {
        revenue: current_metrics.revenue.value,
        net_income: current_metrics.net_profit.value,
        reported_ebitda: current_metrics.ebitda.value,
        normalized_ebitda: current_metrics.ebitda.value, // Legacy used recast_ebitda for ebitda
      };

      const adapterResult = await loadCanonicalFactsForConsumer(galileoCtx, business_id, {
        factKeys: PILOT_FACT_KEYS,
        consumer: 'galileo',
        legacyValues,
      });

      canonical_shadow = adapterResult.shadow;
      canonical_telemetry = adapterResult.telemetry;
      canonical_conflicts = Object.entries(adapterResult.conflicts)
        .filter(([, c]) => c != null)
        .map(([k, c]) => c);

      // Apply canonical values to current_metrics (preferred over legacy)
      const applyCanonical = (metricKey: string, factKey: string) => {
        const preferred = getPreferredValue(adapterResult, factKey, current_metrics[metricKey].value);
        if (preferred.source === 'canonical' && preferred.canonical_fact) {
          current_metrics[metricKey] = {
            value: preferred.canonical_fact.value,
            source: `canonical:${preferred.canonical_fact.source_type}`,
            canonical_fact_key: factKey,
            canonical_source_authority: preferred.canonical_fact.source_name,
            canonical_confidence: preferred.canonical_fact.confidence_score,
            canonical_verification_status: preferred.canonical_fact.verification_status,
            canonical_reporting_period: preferred.canonical_fact.reporting_period?.label || null,
            canonical_resolution_status: preferred.canonical_fact.resolution_status,
            canonical_evidence_available: (preferred.canonical_fact.evidence || []).length > 0,
          };
        } else if (preferred.conflict) {
          // Expose conflict state — do NOT silently substitute legacy
          current_metrics[metricKey] = {
            ...current_metrics[metricKey],
            canonical_fact_key: factKey,
            canonical_resolution_status: 'conflict',
            canonical_conflict_reason: preferred.conflict.reason,
          };
        }
      };

      applyCanonical('revenue', 'revenue');
      applyCanonical('net_profit', 'net_income');
      applyCanonical('ebitda', 'reported_ebitda');

      // Build canonical_facts domain (additive — does not change existing fields)
      canonical_facts = {
        available: adapterResult.resolvedCount > 0 || canonical_conflicts.length > 0,
        resolved_count: adapterResult.resolvedCount,
        conflict_count: canonical_conflicts.length,
        missing_count: adapterResult.missingCount,
        facts: Object.fromEntries(
          Object.entries(adapterResult.facts)
            .filter(([, f]) => f != null)
            .map(([k, f]: [string, any]) => [k, {
              fact_key: f.fact_key,
              display_name: f.display_name,
              value: f.value,
              formatted_value: f.formatted_value,
              value_type: f.value_type,
              source_type: f.source_type,
              source_name: f.source_name,
              confidence_score: f.confidence_score,
              verification_status: f.verification_status,
              resolution_status: f.resolution_status,
              reporting_period: f.reporting_period?.label || null,
              is_stale: f.is_stale,
              advisor_approved: f.advisor_approved,
            }]),
        ),
        conflicts: canonical_conflicts.map((c: any) => ({
          fact_key: c.fact_key,
          display_name: c.display_name,
          reason: c.reason,
          max_variance_percentage: c.max_variance_percentage,
          recommended_source: c.recommended_source,
        })),
      };
    } catch (_canonicalErr) {
      // Canonical resolution failure is non-fatal — legacy values remain
      canonical_facts = { available: false, reason: 'resolver_error' };
    }

    // ── BUILD financial_snapshots ─────────────────────────────────────────────
    const financial_snapshots = (snapshots || []).map(s => ({
      date: s.snapshot_date,
      ciq_score: s.overall_impact_score,
      revenue: s.annual_revenue,
      net_profit: s.net_profit,
      ebitda: s.ebitda,
      business_value: s.current_business_value,
      confidence: s.data_confidence_score,
    }));

    if (financial_snapshots.length === 0) missing_data.push('historical_snapshots');

    // ── BUILD ciq_summary ─────────────────────────────────────────────────────
    const ciq_summary = {
      current_score: current_metrics.ciq_score.value,
      trend: financial_snapshots.length >= 2
        ? (financial_snapshots[0].ciq_score > financial_snapshots[financial_snapshots.length - 1].ciq_score ? 'improving' : 'declining')
        : null,
      snapshot_count: financial_snapshots.length,
    };

    // ── BUILD gap_summary ─────────────────────────────────────────────────────
    // Assessment completion comes from the Shared Intelligence Contract's explicit
    // `completed` flag — NOT inferred from the presence of a business_assessments row.
    // A completed assessment with a zero result is still ASSESSED.
    const byType = (assessments || []).reduce((acc, a) => { acc[a.assessment_type] = a; return acc; }, {});
    const assessmentTypes = ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'recast_ebitda', 'freedom_assessment'];
    const completedAssessments = assessmentTypes.filter(t => contract.assessments[t]?.completed === true);
    const missingAssessments = assessmentTypes.filter(t => !completedAssessments.includes(t));
    if (missingAssessments.length > 0) missing_data.push(`assessments: ${missingAssessments.join(', ')}`);

    const mapGap = (type) => {
      const a = byType[type];
      if (!a) return null;
      return {
        amount: a.estimated_opportunity_value ?? null,
        severity: a.opportunity_level ?? null,
        risk: a.risk_level ?? null,
        summary: a.summary ?? null,
        key_findings: a.key_findings ?? null,
        recommendations: a.recommendations ?? null,
        source: 'assessment',
        last_updated: a.updated_at,
      };
    };

    const gap_summary = {
      profit_gap:       mapGap('profit_gap'),
      value_gap:        mapGap('value_gap'),
      tax_gap:          mapGap('tax_gap'),
      operations_gap:   mapGap('operations_gap'),
      recast_ebitda:    mapGap('recast_ebitda'),
      freedom:          mapGap('freedom_assessment'),
      total_opportunity: (assessments || []).reduce((sum, a) => sum + (a.estimated_opportunity_value || 0), 0) || null,
    };

    // ── BUILD top_opportunities ───────────────────────────────────────────────
    const top_opportunities = (opportunities || []).slice(0, 10).map(o => ({
      id: o.id,
      title: o.title,
      category: o.category,
      priority_score: o.priority_score,
      estimated_impact: o.estimated_impact,
      confidence_score: o.confidence_score,
      difficulty: o.difficulty || null,
      status: o.status,
      source: o.source || 'assessment',
    }));

    if (top_opportunities.length === 0) missing_data.push('business_opportunities');

    // ── BUILD next_best_actions ───────────────────────────────────────────────
    const next_best_actions = (nba_rows || []).map(a => ({
      id: a.id,
      title: a.title,
      type: a.action_type,
      priority_score: a.priority_score,
      estimated_impact: a.estimated_impact,
      status: a.status,
      reason: a.reason,
      difficulty: a.difficulty_level,
      expected_days: a.expected_time_days,
    }));

    if (next_best_actions.length === 0) missing_data.push('next_best_actions');

    // ── BUILD roadmap_status ──────────────────────────────────────────────────
    const statusGroups = (roadmap_rows || []).reduce((acc, item) => {
      const s = item.status || 'Unknown';
      acc[s] = acc[s] || [];
      acc[s].push({
        id: item.id,
        title: item.title,
        category: item.category,
        priority: item.priority,
        due_date: item.due_date,
        estimated_value: item.estimated_value_created,
        verified_value: null,
        value_source: 'estimated',
      });
      return acc;
    }, {});

    const roadmap_status = {
      total: roadmap_rows.length,
      by_status: statusGroups,
      completed_count: (statusGroups['Implemented'] || []).length + (statusGroups['Verified'] || []).length,
      in_progress_count: (statusGroups['In Progress'] || []).length,
      total_estimated_value: roadmap_rows.reduce((s, i) => s + (i.estimated_value_created || 0), 0),
      total_verified_value: 0,
    };

    if (roadmap_rows.length === 0) missing_data.push('roadmap_items');

    // ── BUILD baseline_business_value — from the Shared Intelligence Contract ──
    // Galileo reads baseline from the contract — same values as Dashboard.
    // The contract already called resolveBaselineBusinessValue; no independent call.
    const baseline_business_value = {
      baseline_value: contract.valuation.baseline_value,
      baseline_date: contract.valuation.baseline_date,
      baseline_status: contract.valuation.baseline_status,
      baseline_source: contract.valuation.baseline_source,
    };

    // ── BUILD verified_value_created — from the Shared Intelligence Contract ───
    // The certified total comes from the contract (same value as Dashboard's
    // HeroStoryCard). Event-level breakdown is kept for AI reasoning context,
    // but the headline total is contract-governed to prevent divergence.
    const verifiedVCEs = (vce_rows || []).filter(e => e.status === 'verified' && e.confidence_level === 'verified');
    const pendingVCEs = (vce_rows || []).filter(e => ['pending_verification', 'implemented'].includes(e.status));

    const sumField = (arr, field) => arr.reduce((s, e) => s + (e[field] || 0), 0);
    const contractVerifiedTotal = contract.valuation.verified_value_created;
    const eventSumTotal = sumField(verifiedVCEs, 'verified_tax_savings') + sumField(verifiedVCEs, 'verified_profit_improvement') + sumField(verifiedVCEs, 'verified_cash_flow_improvement');

    const verified_value_created = {
      total_verified_value: contractVerifiedTotal ?? eventSumTotal,
      total_tax_savings: sumField(verifiedVCEs, 'verified_tax_savings'),
      total_profit_improvement: sumField(verifiedVCEs, 'verified_profit_improvement'),
      total_cash_flow_improvement: sumField(verifiedVCEs, 'verified_cash_flow_improvement'),
      verified_event_count: verifiedVCEs.length,
      pending_verification_count: pendingVCEs.length,
      total_estimated_pipeline: sumField(vce_rows, 'estimated_tax_savings') + sumField(vce_rows, 'estimated_profit_improvement') + sumField(vce_rows, 'estimated_cash_flow_improvement'),
      source: contractVerifiedTotal != null ? 'contract' : 'verified',
      events: verifiedVCEs.slice(0, 10).map(e => ({
        title: e.title,
        category: e.category,
        verified_value: (e.verified_tax_savings || 0) + (e.verified_profit_improvement || 0) + (e.verified_cash_flow_improvement || 0) || null,
        verified_tax_savings: e.verified_tax_savings,
        verified_profit_improvement: e.verified_profit_improvement,
        reviewed_at: e.reviewed_at,
        source: 'verified',
      })),
    };

    // ── valuation contract section — from the Shared Intelligence Contract ──────
    // Galileo reads valuation from the shared contract — same values as Dashboard.
    const valuation = {
      current_value: contract.valuation.current_value,
      potential_value: contract.valuation.potential_value,
      value_gap: contract.valuation.value_gap,
      baseline_value: contract.valuation.baseline_value,
      baseline_date: contract.valuation.baseline_date,
      baseline_status: contract.valuation.baseline_status,
      baseline_source: contract.valuation.baseline_source,
      verified_value_created: contract.valuation.verified_value_created,
      prior_review_value: contract.valuation.prior_review_value,
      prior_review_date: contract.valuation.prior_review_date,
      change_since_last_review: contract.valuation.change_since_last_review,
      comparison_available: contract.valuation.comparison_available,
    };

    // ── BUILD document_summary ────────────────────────────────────────────────
    const docsByType = (doc_rows || []).reduce((acc, d) => {
      acc[d.document_type] = acc[d.document_type] || [];
      acc[d.document_type].push({ name: d.name, status: d.upload_status, year: d.year });
      return acc;
    }, {});

    const document_summary = {
      total_documents: doc_rows.length,
      by_type: docsByType,
      completed_count: doc_rows.filter(d => d.upload_status === 'completed').length,
      pending_review_count: doc_rows.filter(d => ['needs_review', 'pending_analysis', 'analyzing'].includes(d.upload_status)).length,
      years_covered: [...new Set(doc_rows.map(d => d.year).filter(Boolean))].sort(),
    };

    if (doc_rows.length === 0) missing_data.push('documents');

    // ── BUILD accepted_financial_fields ───────────────────────────────────────
    // Reviewed observations, semantically normalized. `lifecycle_state` is
    // CONFIRMED (owner-accepted) and never VERIFIED — Phase 6C verification is a
    // separate, independent step that has not happened for these values.
    const accepted_financial_fields = Object.values(semantic_observations).map(o => ({
      field: o.provenance.source_field,
      canonical_key: o.canonical_key,
      semantic: o.display_name,
      value: o.value,
      normalized_value: o.value,
      value_type: o.value_type,
      period: o.period.label,
      period_type: o.period.period_type,
      period_origin: o.period.period_origin,
      period_ambiguous: o.period.ambiguous,
      document_type: o.provenance.source_document_type,
      document_id: o.provenance.source_document_id,
      source_page: o.provenance.source_page,
      source_available: o.provenance.source_available,
      review_state: o.review_state,
      lifecycle_state: o.lifecycle_state,
      verification_status: o.verification_status,
      reviewed_at: o.reviewed_at,
      source: 'reviewed_document_observation',
    }));

    if (accepted_financial_fields.length === 0) missing_data.push('accepted_financial_fields (no reviewed document data)');

    // ── BUILD advisor_notes_summary ───────────────────────────────────────────
    const advisor_notes_summary = {
      count: advisor_note_rows.length,
      notes: advisor_note_rows.slice(0, 5).map(n => ({
        content: (n.note || n.note_text || n.content || '')?.slice(0, 500),
        created_at: n.created_at,
      })),
    };

    if (advisor_note_rows.length === 0) missing_data.push('advisor_notes');

    // ── BUILD risks ───────────────────────────────────────────────────────────
    const risks = [];

    if (!current_metrics.revenue.value) risks.push({ risk: 'No verified revenue data', severity: 'high', area: 'data_quality' });
    if (ciq_summary.trend === 'declining') risks.push({ risk: 'IQ score declining over time', severity: 'medium', area: 'performance' });
    if (gap_summary.tax_gap?.severity === 'significant') risks.push({ risk: 'Significant tax overpayment identified', severity: 'high', area: 'tax' });
    if (roadmap_status.total === 0) risks.push({ risk: 'No roadmap items — no actionable plan in place', severity: 'high', area: 'planning' });
    if (doc_rows.length === 0) risks.push({ risk: 'No financial documents uploaded', severity: 'medium', area: 'data_quality' });
    const highOpps = top_opportunities.filter(o => o.priority_score >= 80);
    if (highOpps.length > 0 && roadmap_status.in_progress_count === 0) {
      risks.push({ risk: `${highOpps.length} high-priority opportunities identified but none in progress`, severity: 'medium', area: 'execution' });
    }

    // ── BUILD recommended_focus ───────────────────────────────────────────────
    const recommended_focus = [];

    if (next_best_actions.length > 0) {
      recommended_focus.push({
        area: 'immediate_action',
        action: next_best_actions[0].title,
        reason: next_best_actions[0].reason,
        estimated_impact: next_best_actions[0].estimated_impact,
        source: 'next_best_actions',
      });
    }

    if (gap_summary.profit_gap?.amount > 0) {
      recommended_focus.push({
        area: 'profit_optimization',
        action: 'Address profit gap opportunities',
        estimated_impact: gap_summary.profit_gap.amount,
        source: 'assessment',
      });
    }

    if (gap_summary.tax_gap?.amount > 0) {
      recommended_focus.push({
        area: 'tax_strategy',
        action: 'Implement tax optimization strategies',
        estimated_impact: gap_summary.tax_gap.amount,
        source: 'assessment',
      });
    }

    if (accepted_financial_fields.length === 0) {
      recommended_focus.push({
        area: 'data_quality',
        action: 'Upload and review financial documents for higher confidence analysis',
        source: 'system',
      });
    }

    // ── BUILD source_quality ──────────────────────────────────────────────────
    const source_quality = {
      has_verified_financials: accepted_financial_fields.length > 0,
      has_advisor_review: advisor_note_rows.length > 0,
      has_completed_assessments: completedAssessments.length,
      total_assessments_possible: assessmentTypes.length,
      has_verified_wins: verifiedVCEs.length > 0,
      data_confidence_score: latest_snap?.data_confidence_score ?? null,
      overall_quality: (() => {
        let score = 0;
        if (accepted_financial_fields.length > 0) score += 30;
        if (completedAssessments.length >= 3) score += 25;
        if (advisor_note_rows.length > 0) score += 20;
        if (verifiedVCEs.length > 0) score += 15;
        if (financial_snapshots.length >= 3) score += 10;
        return score;
      })(),
    };

    // ── BUILD exit_readiness_summary ─────────────────────────────────────────
    const readinessByStatus = readiness_rows.reduce((acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    }, {});
    const readinessTotal = readiness_rows.length;
    const readinessDone = readiness_rows.filter(i => i.status === 'completed').length;
    const criticalPending = readiness_rows.filter(i => i.is_critical && i.status !== 'completed');

    const exit_readiness_summary = readinessTotal > 0 ? {
      total_items: readinessTotal,
      completed: readinessDone,
      completion_pct: readinessTotal > 0 ? Math.round((readinessDone / readinessTotal) * 100) : 0,
      by_status: readinessByStatus,
      critical_pending: criticalPending.slice(0, 5).map(i => ({ title: i.title, category: i.category, priority: i.priority })),
      stalled_items: readiness_rows.filter(i => i.status === 'not_started' && i.is_critical).slice(0, 5).map(i => ({ title: i.title, category: i.category })),
    } : null;

    if (readinessTotal === 0) missing_data.push('exit_readiness_items');

    // ── BUILD active_sprint ───────────────────────────────────────────────────
    const active_sprint_row = active_sprint_rows?.[0] || null;
    let active_sprint = null;
    if (active_sprint_row) {
      // Fetch tasks for the active sprint
      let sprint_tasks = [];
      try {
        const { data: taskRows } = await sb.from('ninety_day_sprint_tasks')
          .select('title, month_number, week_number, status, priority, ease, impact, due_date, recommended_expert_type, expert_needed')
          .eq('path_id', active_sprint_row.id)
          .eq('task_type', 'main_task')
          .neq('is_deleted', true)
          .order('sort_order', { ascending: true });
        sprint_tasks = taskRows || [];
      } catch (_) {}
      const completedTasks = sprint_tasks.filter(t => t.status === 'completed').length;
      active_sprint = {
        id: active_sprint_row.id,
        path_title: active_sprint_row.path_title,
        path_goal: active_sprint_row.path_goal,
        progress_percent: active_sprint_row.progress_percent || 0,
        total_tasks: sprint_tasks.length,
        completed_tasks: completedTasks,
        next_tasks: sprint_tasks.filter(t => t.status !== 'completed').slice(0, 3).map(t => ({ title: t.title, week: t.week_number, due_date: t.due_date, priority: t.priority })),
      };
    }

    // ── BUILD knowledge_base (industry + page scoped) ─────────────────────────
    const industry = business_entity?.industry || dashboard_metrics?.industry || '';
    const routeLower = (current_route || '').toLowerCase();
    const pageContextLower = JSON.stringify(page_context || {}).toLowerCase();

    // Relevance scoring for KB entries
    const scoreKbEntry = (e) => {
      let score = 0;
      const tags = (e.tags || []).map(t => t.toLowerCase());
      const content = (e.content || '').toLowerCase();
      const title = (e.title || '').toLowerCase();
      if (industry && (tags.some(t => industry.toLowerCase().includes(t) || t.includes(industry.toLowerCase())) || content.includes(industry.toLowerCase()))) score += 3;
      if (routeLower && (tags.some(t => routeLower.includes(t)) || title.includes(routeLower.split('/').pop()))) score += 2;
      if (question && (title.includes(question.slice(0, 20).toLowerCase()) || content.includes(question.slice(0, 20).toLowerCase()))) score += 2;
      if (e.category && pageContextLower.includes(e.category)) score += 1;
      return score;
    };

    const sortedKb = [...all_kb_entries].sort((a, b) => scoreKbEntry(b) - scoreKbEntry(a));
    const kb_entries = sortedKb.slice(0, 15);

    const kbByCategory = {};
    for (const e of kb_entries) {
      const cat = e.category || 'general';
      if (!kbByCategory[cat]) kbByCategory[cat] = [];
      kbByCategory[cat].push({
        title: e.title,
        content: e.content?.slice(0, 400),
        source: e.source_name,
        source_type: e.source_type,
        confidence: e.confidence_score,
        tags: e.tags,
      });
    }

    const knowledge_base = {
      total_entries: kb_entries.length,
      by_category: kbByCategory,
      top_insights: kb_entries.slice(0, 5).map(e => ({
        title: e.title,
        snippet: e.content?.slice(0, 300),
        source: e.source_name,
      })),
    };

    if (kb_entries.length === 0) missing_data.push('knowledge_base_entries');

    // ── Build page_context_summary ────────────────────────────────────────────
    const page_context_summary = {
      current_route: current_route || null,
      page_name: page_context?.page_name || null,
      selected_tab: page_context?.selected_tab || null,
      visible_section: page_context?.visible_section || null,
      selected_assessment: page_context?.selected_assessment || null,
      selected_sprint_path: page_context?.selected_sprint_path || null,
      selected_document: page_context?.selected_document || null,
      selected_entity_id: selected_entity_id || null,
      inferred_intent: (() => {
        if (routeLower.includes('tax')) return 'tax_strategy';
        if (routeLower.includes('profit')) return 'profit_optimization';
        if (routeLower.includes('value')) return 'valuation';
        if (routeLower.includes('operations')) return 'operations_improvement';
        if (routeLower.includes('freedom')) return 'owner_independence';
        if (routeLower.includes('sprint') || routeLower.includes('command')) return 'sprint_execution';
        if (routeLower.includes('data-room') || routeLower.includes('document')) return 'document_review';
        if (routeLower.includes('dashboard')) return 'overall_health';
        return 'general';
      })(),
    };

    // ── BUILD outcome_tracking_summary (Phase 6 — sprint-primary) ────────────
    let outcome_tracking_summary = null;
    try {
      const outs = outcome_rows || [];
      const verifiedOuts = outs.filter(o => o.status === 'verified');
      const pendingActuals = outs.filter(o => o.status === 'completed_pending_actuals');
      const completedOuts = outs.filter(o => ['completed', 'verified'].includes(o.status));

      // Sprint-linked outcome breakdown
      const sprintOuts = outs.filter(o => ['sprint', 'sprint_item'].includes(o.source_type));
      const verifiedSprintOuts = sprintOuts.filter(o => o.status === 'verified');
      const pendingSprintOuts = sprintOuts.filter(o => o.status === 'completed_pending_actuals');

      const totalProjected = outs.reduce((s, o) => s + (o.total_projected_impact || 0), 0);
      const totalActual = verifiedOuts.reduce((s, o) => s + (o.total_actual_impact || 0), 0);
      const avgAccuracy = verifiedOuts.filter(o => o.accuracy_percentage).length > 0
        ? Math.round(verifiedOuts.filter(o => o.accuracy_percentage)
            .reduce((s, o) => s + o.accuracy_percentage, 0) /
            verifiedOuts.filter(o => o.accuracy_percentage).length)
        : null;

      // Category performance
      const catPerf = {};
      for (const o of verifiedOuts) {
        if (!o.category) continue;
        if (!catPerf[o.category]) catPerf[o.category] = { count: 0, totalActual: 0, totalProjected: 0 };
        catPerf[o.category].count++;
        catPerf[o.category].totalActual += o.total_actual_impact || 0;
        catPerf[o.category].totalProjected += o.total_projected_impact || 0;
      }
      const bestCategories = Object.entries(catPerf)
        .filter(([, v]) => v.totalProjected > 0)
        .map(([cat, v]) => ({ category: cat, accuracy: Math.round((v.totalActual / v.totalProjected) * 100) }))
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 3)
        .map(c => c.category);
      const underCategories = Object.entries(catPerf)
        .filter(([, v]) => v.totalProjected > 0)
        .map(([cat, v]) => ({ category: cat, accuracy: Math.round((v.totalActual / v.totalProjected) * 100) }))
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 2)
        .filter(c => c.accuracy < 80)
        .map(c => c.category);

      const learningReady = outs.filter(o => o.status === 'verified' && o.should_include_in_learning).length;

      outcome_tracking_summary = {
        total_outcomes: outs.length,
        completed_outcomes_count: completedOuts.length,
        verified_outcomes_count: verifiedOuts.length,
        pending_actuals_count: pendingActuals.length,
        total_projected_impact: totalProjected || null,
        total_actual_impact: totalActual || null,
        total_variance: totalActual - totalProjected || null,
        average_accuracy_percentage: avgAccuracy,
        best_performing_categories: bestCategories,
        underperforming_categories: underCategories,
        strategies_pending_actual_impact: pendingActuals.map(o => o.source_name).filter(Boolean).slice(0, 5),
        learning_ready_outcomes: learningReady,
        // Sprint-specific breakdown (primary execution source)
        sprint_outcomes: {
          total: sprintOuts.length,
          verified: verifiedSprintOuts.length,
          pending_actuals: pendingSprintOuts.length,
          total_actual: verifiedSprintOuts.reduce((s, o) => s + (o.total_actual_impact || 0), 0) || null,
        },
      };
    } catch (_outcomeErr) {
      // Non-fatal — table may not exist yet
    }

    // ── Fetch canonical BIE recommendations (Phase 12C) ───────────────────────
    let canonical_recommendations: any[] = [];
    try {
      const bieResult = await fetchCanonicalRecommendations(sb, profile_id, business_id);
      canonical_recommendations = bieResult.recommendations || [];
    } catch (_bieErr) {
      // Non-fatal — BIE recommendations not available
    }

    // ── Phase 13.4A.2: Valuation context (additive domain) ────────────────────
    // When valuation_id is present, assemble a permission-filtered valuation
    // context and merge it as a named domain. Preserves all existing context.
    let valuation_context: any = null;
    if (valuation_id && profile) {
      try {
        valuation_context = await buildGalileoValuationContext({
          sb,
          profile,
          profile_id,
          businessId: business_id,
          valuationId: valuation_id,
          workspaceKey: workspace_key,
          sectionKey: section_key,
          focusedRecordType: focused_record_type,
          focusedRecordId: focused_record_id,
          conversationMode: conversation_mode,
        });
      } catch (_valErr) {
        valuation_context = { available: false, reason: 'context_error' };
      }
    }

    // ── Final context object ──────────────────────────────────────────────────
    const context = {
      // ── Shared Supabase Intelligence Contract ──────────────────────────────
      // The single certified current-business intelligence state.
      // All consumers (Dashboard, Galileo, Executive Brief, Living Intelligence)
      // read from this contract. See intelligenceContract/businessIntelligenceContract.ts.
      contract,
      contract_version: contract.contract_version,
      contract_generated_at: contract.generated_at,
      canonical_recommendations,
      valuation: valuation_context,
      valuation_contract: valuation,
      canonical_facts,
      _meta: {
        business_id,
        profile_id,
        generated_at: new Date().toISOString(),
        question: question || null,
        current_route: current_route || null,
        schema_notes: schema_notes.length > 0 ? schema_notes : [],
        canonical_shadow: canonical_shadow.length > 0 ? canonical_shadow : undefined,
        canonical_telemetry: canonical_telemetry.length > 0 ? canonical_telemetry : undefined,
      },
      business_profile,
      current_metrics,
      financial_snapshots,
      ciq_summary,
      gap_summary,
      top_opportunities,
      next_best_actions,
      roadmap_status,
      verified_value_created,
      baseline_business_value,
      valuation,
      document_summary,
      accepted_financial_fields,
      semantic_observations,
      observation_period_availability: observation_availability,
      unmapped_observations: contract.unmapped_observations || [],
      advisor_notes_summary,
      chat_history,
      missing_data,
      risks,
      recommended_focus,
      source_quality,
      exit_readiness_summary,
      knowledge_base,
      active_sprint,
      page_context_summary,
      outcome_tracking_summary,
    };

    return Response.json({ context });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});