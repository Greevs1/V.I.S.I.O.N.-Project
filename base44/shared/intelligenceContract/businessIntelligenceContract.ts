/**
 * Business Intelligence Contract — Shared Supabase Intelligence Contract
 *
 * THE SINGLE CERTIFIED AUTHORITATIVE OWNER for current-business intelligence.
 *
 * This module is consumed by:
 *   - Dashboard (via getBusinessIntelligenceContract backend function)
 *   - Galileo (via buildGalileoContext, which delegates to this contract)
 *   - Executive Brief (via BIS, which reads contract fields)
 *   - Living Intelligence (via BIS, which reads contract fields)
 *
 * Consumers MUST NOT independently resolve persistent facts.
 * If a metric is missing, extend the contract here — do not bypass it.
 *
 * Null Semantics (PERMANENT RULE):
 *   null  = unknown / unavailable
 *   0     = measured zero
 *   undefined = treated as null (never as 0)
 *   false ≠ missing
 *
 * Source Authority:
 *   assessment_calculations > dashboard_metrics  (for assessment-owned results)
 *   extracted_fields = raw extraction output
 *   canonical facts = governed business fact resolution
 *   dashboard_metrics = derived/cache/read model
 *   business_metric_snapshots = historical state (never outranks current)
 *
 * Contract Versioning:
 *   contract_version — schema version (breaking changes bump this)
 *   generated_at — when this contract instance was built
 *   Consumers can verify they are using the same current state by comparing
 *   generated_at timestamps.
 */

import { resolveBaselineBusinessValue } from './baselineResolver.ts';
import { CONTRACT_VERSION } from './metricRegistry.ts';
import { buildObservationLayer } from '../documentObservation/semantics.ts';
import type { ObservationLayer, SemanticObservation } from '../documentObservation/semantics.ts';

export interface BusinessIntelligenceContract {
  // ── Identity ──────────────────────────────────────────────────────────
  business_id: string;
  profile_id: string | null;
  contract_version: string;
  generated_at: string;

  // ── Business Identity (Phase 5.1 — for Galileo Home) ───────────────────
  business_identity: {
    name: string | null;
    industry: string | null;
    entity_type: string | null;
  };

  // ── Business State ─────────────────────────────────────────────────────
  business_iq: number | null;
  business_iq_source: string | null;
  business_confidence: number | null;

  // ── Valuation ──────────────────────────────────────────────────────────
  valuation: {
    baseline_value: number | null;
    baseline_date: string | null;
    baseline_status: 'ESTABLISHED' | 'NOT_ESTABLISHED' | 'NEEDS_REVIEW';
    baseline_source: string | null;
    current_value: number | null;
    current_value_source: string | null;
    potential_value: number | null;
    potential_value_source: string | null;
    value_gap: number | null;
    value_gap_source: string | null;
    verified_value_created: number | null;
    prior_review_value: number | null;
    prior_review_date: string | null;
    change_since_last_review: number | null;
    comparison_available: boolean;
  };

  // ── Profitability ──────────────────────────────────────────────────────
  // 6D.0a: document-derived values resolve through the Semantic Observation
  // Bridge. Each carries the PERIOD and PROVENANCE it was reviewed with — a
  // value on its own must never be read as "current".
  profitability: {
    revenue: number | null;
    revenue_source: string | null;
    revenue_period_label: string | null;
    revenue_period_type: string | null;
    revenue_provenance: string | null;
    revenue_lifecycle_state: string | null;
    gross_profit: number | null;
    gross_profit_source: string | null;
    gross_profit_period_label: string | null;
    gross_margin: number | null;
    net_profit: number | null;
    net_profit_source: string | null;
    net_profit_period_label: string | null;
    net_profit_provenance: string | null;
    reported_ebitda: number | null;
    reported_ebitda_source: string | null;
    reported_ebitda_period_label: string | null;
    owner_compensation: number | null;
    owner_compensation_source: string | null;
    owner_compensation_period_label: string | null;
    owner_compensation_provenance: string | null;
    recast_ebitda: number | null;
    recast_ebitda_source: string | null;
    total_addbacks: number | null;
    recast_value_impact: number | null;
    profit_gap: number | null;
    profit_gap_source: string | null;
    profit_score: number | null;
  };

  // ── Tax ───────────────────────────────────────────────────────────────
  tax: {
    annual_tax_gap: number | null;
    annual_tax_gap_source: string | null;
    ten_year_tax_gap: number | null;
  };

  // ── Operations ────────────────────────────────────────────────────────
  operations: {
    operations_score: number | null;
    operations_score_source: string | null;
    monthly_value_of_time_freed: number | null;
    hours_freed_per_week: number | null;
    hourly_value_of_time_freed: number | null;
  };

  // ── Freedom ───────────────────────────────────────────────────────────
  freedom: {
    freedom_score: number | null;
    freedom_score_source: string | null;
  };

  // ── Assessments (certified completion state) ───────────────────────────
  assessments: {
    [type: string]: {
      completed: boolean;
      completed_at: string | null;
      score: number | null;
      estimated_opportunity_value: number | null;
      opportunity_level: string | null;
      result: Record<string, any> | null;
      source: string;
    };
  };
  assessment_completion_count: number;
  assessment_total_count: number;

  // ── Document Readiness ────────────────────────────────────────────────
  document_readiness: {
    total_documents: number;
    completed_count: number;
    pending_review_count: number;
    years_covered: number[];
    latest_financial_period: string | null;
    financial_data_confidence: number | null;
  };

  // ── Recent Documents (Phase 5.1 — for activity/change detection) ───────
  recent_documents: Array<{
    id: string;
    name: string;
    document_type: string | null;
    status: string;
    year: number | null;
    created_at: string;
  }>;

  // ── Intelligence ──────────────────────────────────────────────────────
  top_priority: any | null;
  risks: any[];
  opportunities: any[];

  // ── Semantic observations (6D.0a) ─────────────────────────────────────
  // Reviewed document observations, mapped to canonical meanings with period,
  // provenance and review state attached. Read-only; no persistence.
  semantic_observations: Record<string, SemanticObservation>;
  unmapped_observations: ObservationLayer['unmapped_observations'];
  observation_period_availability: Record<string, string[]>;

  // ── Provenance ────────────────────────────────────────────────────────
  _provenance: {
    source: 'supabase';
    updated_at: string;
    schema_notes: string[];
  };
}

const ASSESSMENT_TYPES = [
  'profit_gap', 'value_gap', 'tax_gap', 'operations_gap',
  'recast_ebitda', 'freedom_assessment',
];

/**
 * Build the Business Intelligence Contract — the single certified current-business state.
 *
 * @param sb Supabase client (service role)
 * @param business_id Business ID (mandatory — contract is business-scoped)
 * @param profile_id Profile ID (optional — for authorization context)
 * @returns Normalized BusinessIntelligenceContract
 */
export async function buildBusinessIntelligenceContract(
  sb: any,
  business_id: string,
  profile_id: string | null = null,
): Promise<BusinessIntelligenceContract> {
  const generated_at = new Date().toISOString();
  const schema_notes: string[] = [];

  if (!business_id) {
    return emptyContract('', null, generated_at, ['no_business_id']);
  }

  // ── Parallel fetch all data sources ────────────────────────────────────
  const [
    bizResult, dmResult, sessionsResult, baResult, vceResult,
    docResult, snapResult, extractedResult,
  ] = await Promise.allSettled([
    sb.from('business_entities').select('*').eq('id', business_id).maybeSingle(),
    sb.from('dashboard_metrics').select('*').eq('business_id', business_id).maybeSingle(),
    sb.from('assessment_sessions').select('id, assessment_type, completed_at, started_at, business_id')
      .eq('business_id', business_id).order('completed_at', { ascending: false }).limit(50),
    sb.from('business_assessments').select('*').eq('business_id', business_id)
      .in('assessment_type', ASSESSMENT_TYPES),
    sb.from('value_creation_events').select('*').eq('business_id', business_id)
      .order('created_at', { ascending: false }).limit(50),
    sb.from('documents').select('id, name, document_type, upload_status, year, created_at')
      .eq('business_id', business_id).order('created_at', { ascending: false }).limit(50),
    sb.from('business_metric_snapshots').select('snapshot_date, overall_impact_score, data_confidence_score, annual_revenue, net_profit, ebitda, current_business_value')
      .eq('business_id', business_id).order('snapshot_date', { ascending: false }).limit(10),
    sb.from('extracted_fields').select('field_name, accepted_value, accepted_normalized_value, field_category, source_document_type, reviewed_at')
      .eq('business_id', business_id).in('review_status', ['accepted', 'corrected']).order('reviewed_at', { ascending: false }).limit(40),
  ]);

  const safeVal = (s: any, fallback = null) => s.status === 'fulfilled' ? (s.value?.data ?? fallback) : fallback;

  const business_entity = safeVal(bizResult);
  const dashboard_metrics = safeVal(dmResult);
  const sessions = safeVal(sessionsResult, []);
  const business_assessments = safeVal(baResult, []);
  const vce_rows = safeVal(vceResult, []);
  const doc_rows = safeVal(docResult, []);
  const snapshots = safeVal(snapResult, []);
  const accepted_fields = safeVal(extractedResult, []);

  // ── Resolve assessment_calculations (primary source for assessment results) ─
  const calcByType: Record<string, any> = {};
  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((s: any) => s.id);
    try {
      // Deterministic ordering: created_at DESC with id DESC as tiebreaker.
      // Without the id tiebreaker, rows with identical (or NULL) created_at
      // have non-deterministic order — meaning a stale RUN A calculation
      // could be selected over the newer RUN B calculation.
      const { data: calcs } = await sb.from('assessment_calculations')
        .select('id, session_id, assessment_type, result_json, input_json, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      for (const calc of (calcs || [])) {
        if (!calcByType[calc.assessment_type]) {
          calcByType[calc.assessment_type] = calc;
        }
      }
    } catch (e: any) {
      schema_notes.push(`assessment_calculations: ${e.message}`);
    }
  }

  // ── Build assessment completion + results ──────────────────────────────
  const baByType = (business_assessments || []).reduce((acc: any, a: any) => {
    acc[a.assessment_type] = a; return acc;
  }, {});

  const assessments: BusinessIntelligenceContract['assessments'] = {};
  let assessment_completion_count = 0;

  for (const type of ASSESSMENT_TYPES) {
    const calc = calcByType[type];
    const ba = baByType[type];
    const resultJson = calc?.result_json || null;
    const hasResult = resultJson != null && Object.keys(resultJson).length > 0;
    // Canonical completion: explicit status/completed_at from business_assessments.
    // A completed assessment with a zero result is still COMPLETED (P6).
    // Never infer completion from score/opportunity value existence.
    const baCompleted = ba?.status === 'completed' || ba?.completed_at != null;
    const completed = baCompleted || hasResult;
    if (completed) assessment_completion_count++;

    assessments[type] = {
      completed,
      completed_at: ba?.completed_at || ba?.updated_at || calc?.created_at || null,
      score: ba?.score ?? null,
      estimated_opportunity_value: ba?.estimated_opportunity_value ?? null,
      opportunity_level: ba?.opportunity_level ?? null,
      result: resultJson,
      source: calc ? 'assessment_calculations' : (ba ? 'business_assessments' : 'none'),
    };
  }

  // ── Resolve profitability metrics (strict null semantics) ──────────────
  // Source hierarchy: assessment_calculations > dashboard_metrics > extracted_fields
  const calcPg = calcByType['profit_gap']?.result_json || {};
  const calcVg = calcByType['value_gap']?.result_json || {};
  const calcTg = calcByType['tax_gap']?.result_json || {};
  const calcOg = calcByType['operations_gap']?.result_json || {};
  const calcRe = calcByType['recast_ebitda']?.result_json || {};
  const calcFa = calcByType['freedom_assessment']?.result_json || {};
  const calcOgInput = calcByType['operations_gap']?.input_json || {};

  // ── 6D.0a — SEMANTIC OBSERVATION BRIDGE ──────────────────────────────────
  // Document-derived values no longer come from a private field-name matcher.
  // The ONE shared bridge maps reviewed observations to canonical meanings
  // (gross_receipts → revenue, officer_compensation → owner_compensation, …)
  // with period, provenance, review state and business scope preserved — the
  // same vocabulary 6D.1 publishes into business_facts. It writes nothing.
  const observationLayer = buildObservationLayer(accepted_fields, business_id);
  const obs = observationLayer.by_key;
  const obsValue = (key: string): number | null => (obs[key] ? obs[key].value : null);
  const obsPeriodLabel = (key: string): string | null => (obs[key] ? obs[key].period.label : null);
  const obsPeriodType = (key: string): string | null => (obs[key] ? obs[key].period.period_type : null);
  const obsProvenance = (key: string): string | null => (obs[key] ? obs[key].provenance.source_label : null);
  const obsLifecycle = (key: string): string | null => (obs[key] ? obs[key].lifecycle_state : null);

  // Revenue: reviewed document observation first, then the legacy read model.
  // A tax-year observation is NOT relabelled as current — its period travels
  // with it, and a current/TTM question is answered by period_availability.
  const revenue = obsValue('revenue') ?? dashboard_metrics?.revenue ?? snapshots?.[0]?.annual_revenue ?? null;
  const revenue_source = obsValue('revenue') != null ? 'extracted_fields' : (dashboard_metrics?.revenue != null ? 'dashboard_metrics' : (snapshots?.[0]?.annual_revenue != null ? 'snapshot' : null));

  const net_profit = obsValue('net_income') ?? dashboard_metrics?.net_profit ?? snapshots?.[0]?.net_profit ?? null;
  const net_profit_source = obsValue('net_income') != null ? 'extracted_fields' : (dashboard_metrics?.net_profit != null ? 'dashboard_metrics' : (snapshots?.[0]?.net_profit != null ? 'snapshot' : null));

  // Gross profit: available ONLY because the canonical definition admits it
  // (registry fact `gross_profit`), the observation is business-scoped, its
  // review state is accepted/corrected, and its period is recorded. Otherwise null.
  const gross_profit = obsValue('gross_profit') ?? null;
  const gross_profit_source = obsValue('gross_profit') != null ? 'extracted_fields' : null;

  const reported_ebitda = obsValue('reported_ebitda') ?? dashboard_metrics?.recast_ebitda ?? snapshots?.[0]?.ebitda ?? null;
  const reported_ebitda_source = obsValue('reported_ebitda') != null ? 'extracted_fields' : (dashboard_metrics?.recast_ebitda != null ? 'dashboard_metrics' : (snapshots?.[0]?.ebitda != null ? 'snapshot' : null));

  const owner_compensation = obsValue('owner_compensation') ?? null;
  const owner_compensation_source = obsValue('owner_compensation') != null ? 'extracted_fields' : null;

  // Profit Gap — assessment_calculations primary
  const profit_gap = calcPg.gapToBest ?? calcPg.gap_to_best ?? calcPg.profit_gap
    ?? dashboard_metrics?.profit_gap_details?.gap_to_best ?? dashboard_metrics?.profit_gap
    ?? baByType['profit_gap']?.estimated_opportunity_value ?? null;
  const profit_gap_source = calcPg.gapToBest != null || calcPg.gap_to_best != null || calcPg.profit_gap != null
    ? 'assessment_calculations' : (dashboard_metrics?.profit_gap_details?.gap_to_best != null ? 'dashboard_metrics' : (baByType['profit_gap']?.estimated_opportunity_value != null ? 'business_assessments' : null));
  const profit_score = calcPg.profit_score ?? dashboard_metrics?.profit_gap_details?.score ?? baByType['profit_gap']?.score ?? null;

  // Recast EBITDA — assessment_calculations primary
  // recast_ebitda = the actual recast/normalized EBITDA value (NOT add-backs)
  // total_addbacks = the sum of add-back adjustments
  // recast_value_impact = the valuation impact from recasting
  const recast_ebitda = calcRe.recast_ebitda ?? calcRe.recastEbitda
    ?? dashboard_metrics?.recast_ebitda_gap_details?.recast_ebitda ?? null;
  const recast_ebitda_source = calcRe.recast_ebitda != null || calcRe.recastEbitda != null
    ? 'assessment_calculations' : (dashboard_metrics?.recast_ebitda_gap_details?.recast_ebitda != null ? 'dashboard_metrics' : null);
  const total_addbacks = calcRe.total_addbacks ?? calcRe.totalAddBacks ?? calcRe.total_add_backs
    ?? dashboard_metrics?.recast_ebitda_gap_details?.add_backs ?? null;
  const recast_value_impact = calcRe.recast_value_impact ?? calcRe.valuationIncrease ?? calcRe.valuation_increase
    ?? dashboard_metrics?.recast_ebitda_gap_details?.valuation_increase ?? null;

  // ── Valuation (Value Gap assessment is the certified owner) ────────────
  const current_value = calcVg.current_value ?? calcVg.currentValue
    ?? dashboard_metrics?.value_gap_details?.current_value ?? dashboard_metrics?.enterprise_value
    ?? baByType['value_gap']?.estimated_opportunity_value ?? null;
  const current_value_source = calcVg.current_value != null || calcVg.currentValue != null
    ? 'assessment_calculations' : (dashboard_metrics?.value_gap_details?.current_value != null || dashboard_metrics?.enterprise_value != null ? 'dashboard_metrics' : (baByType['value_gap']?.estimated_opportunity_value != null ? 'business_assessments' : null));

  const potential_value = calcVg.potential_value ?? calcVg.potentialValue
    ?? dashboard_metrics?.value_gap_details?.potential_value ?? null;
  const potential_value_source = calcVg.potential_value != null || calcVg.potentialValue != null
    ? 'assessment_calculations' : (dashboard_metrics?.value_gap_details?.potential_value != null ? 'dashboard_metrics' : null);

  // Value Gap — certified formula: potential - current (when both available), else direct
  const value_gap = calcVg.valueGap ?? calcVg.value_gap
    ?? dashboard_metrics?.value_gap_details?.gap_amount ?? dashboard_metrics?.value_gap
    ?? ((current_value != null && potential_value != null) ? potential_value - current_value : null);
  const value_gap_source = calcVg.valueGap != null || calcVg.value_gap != null
    ? 'assessment_calculations' : (dashboard_metrics?.value_gap_details?.gap_amount != null || dashboard_metrics?.value_gap != null ? 'dashboard_metrics' : ((current_value != null && potential_value != null) ? 'derived_formula' : null));

  // ── Baseline — from the shared baselineResolver (single certified owner) ─
  const baseline = await resolveBaselineBusinessValue(sb, business_id);

  // ── Verified Value Created — ONLY verified historical events ────────────
  const verifiedVCEs = (vce_rows || []).filter((e: any) => e.status === 'verified' && e.confidence_level === 'verified');
  const verified_value_created = verifiedVCEs.length > 0
    ? verifiedVCEs.reduce((s: number, e: any) =>
        s + (e.verified_tax_savings || 0) + (e.verified_profit_improvement || 0) + (e.verified_cash_flow_improvement || 0), 0)
    : null; // null = no verified events (NOT 0)

  // ── Tax ─────────────────────────────────────────────────────────────────
  const annual_tax_gap = calcTg.t3_annual_gap ?? calcTg.totalAnnualSavings
    ?? dashboard_metrics?.tax_gap_details?.annual_overpayment ?? dashboard_metrics?.tax_gap
    ?? baByType['tax_gap']?.estimated_opportunity_value ?? null;
  const annual_tax_gap_source = calcTg.t3_annual_gap != null || calcTg.totalAnnualSavings != null
    ? 'assessment_calculations' : (dashboard_metrics?.tax_gap_details?.annual_overpayment != null || dashboard_metrics?.tax_gap != null ? 'dashboard_metrics' : (baByType['tax_gap']?.estimated_opportunity_value != null ? 'business_assessments' : null));
  const ten_year_tax_gap = annual_tax_gap != null ? Math.round(annual_tax_gap * 10) : null;

  // ── Operations ───────────────────────────────────────────────────────────
  const operations_score = calcOg.operations_score ?? calcOg.operationsScore
    ?? dashboard_metrics?.operations_gap_details?.score ?? dashboard_metrics?.operations_gap
    ?? baByType['operations_gap']?.score ?? null;
  const operations_score_source = calcOg.operations_score != null || calcOg.operationsScore != null
    ? 'assessment_calculations' : (dashboard_metrics?.operations_gap_details?.score != null || dashboard_metrics?.operations_gap != null ? 'dashboard_metrics' : (baByType['operations_gap']?.score != null ? 'business_assessments' : null));

  const monthly_value_of_time_freed = calcOg.monthly_value_of_time_freed ?? calcOg.monthly_value_freed ?? calcOg.monthlyValueFreed
    ?? dashboard_metrics?.operations_gap_details?.monthly_value_of_time_freed ?? null;
  const hours_freed_per_week = calcOg.hours_freed_per_week ?? calcOg.freed_hours_per_week
    ?? dashboard_metrics?.operations_gap_details?.hours_freed_per_week ?? null;
  const hourly_value_of_time_freed = calcOg.hourly_value_of_time_freed ?? calcOg.hourly_value ?? calcOg.hourly_value_freed
    ?? dashboard_metrics?.operations_gap_details?.hourly_value_of_time_freed ?? null;

  // ── Freedom ───────────────────────────────────────────────────────────────
  const freedom_score = calcFa.freedom_score ?? dashboard_metrics?.freedom_score ?? baByType['freedom_assessment']?.score ?? null;
  const freedom_score_source = calcFa.freedom_score != null
    ? 'assessment_calculations' : (dashboard_metrics?.freedom_score != null ? 'dashboard_metrics' : (baByType['freedom_assessment']?.score != null ? 'business_assessments' : null));

  // ── Business IQ — derived from assessment components ──────────────────────
  // Certified formula: average of available component scores (profit, operations, freedom, tax)
  const profitScoreForIq = calcPg.profit_score ?? dashboard_metrics?.profit_gap_details?.score ?? null;
  const opsScoreForIq = typeof operations_score === 'number' ? operations_score : null;
  const taxScoreForIq = annual_tax_gap != null
    ? Math.max(0, Math.min(100, Math.round((1 - annual_tax_gap / Math.max(annual_tax_gap, 50000)) * 100)))
    : null;
  const iqComponents = [profitScoreForIq, opsScoreForIq, freedom_score, taxScoreForIq].filter((v): v is number => v != null);
  const business_iq = iqComponents.length >= 2
    ? Math.round(iqComponents.reduce((s, v) => s + v, 0) / iqComponents.length)
    : (dashboard_metrics?.ciq_score ?? snapshots?.[0]?.overall_impact_score ?? null);
  const business_iq_source = iqComponents.length >= 2
    ? 'derived_from_assessments' : (dashboard_metrics?.ciq_score != null ? 'dashboard_metrics' : (snapshots?.[0]?.overall_impact_score != null ? 'snapshot' : null));

  const business_confidence = snapshots?.[0]?.data_confidence_score ?? dashboard_metrics?.data_confidence_score ?? null;

  // ── Document Readiness ────────────────────────────────────────────────────
  const completed_docs = (doc_rows || []).filter((d: any) => d.upload_status === 'completed').length;
  const pending_review_docs = (doc_rows || []).filter((d: any) => ['needs_review', 'pending_analysis', 'analyzing'].includes(d.upload_status)).length;
  const years_covered = [...new Set((doc_rows || []).map((d: any) => d.year).filter(Boolean))].sort() as number[];
  const latest_financial_period = years_covered.length > 0 ? String(years_covered[0]) : null;

  // ── Opportunities & Risks (from business_opportunities + gap analysis) ───
  let opportunities: any[] = [];
  try {
    const { data: oppRows } = await sb.from('business_opportunities')
      .select('id, title, category, priority_score, estimated_impact, confidence_score, status, source')
      .eq('business_id', business_id).order('priority_score', { ascending: false }).limit(10);
    opportunities = (oppRows || []).map((o: any) => ({
      id: o.id, title: o.title, category: o.category,
      priority_score: o.priority_score, estimated_impact: o.estimated_impact,
      confidence_score: o.confidence_score, status: o.status, source: o.source || 'assessment',
    }));
  } catch (e: any) {
    schema_notes.push(`business_opportunities: ${e.message}`);
  }

  // Top priority = highest-impact gap
  const gaps = [
    { id: 'value_gap', label: 'Value Gap', value: value_gap, current: current_value, potential: potential_value },
    { id: 'profit_gap', label: 'Profit Gap', value: profit_gap },
    { id: 'tax_gap', label: 'Tax Gap', value: annual_tax_gap },
  ].filter((g) => g.value != null && g.value > 0) as any[];
  gaps.sort((a, b) => (b.value || 0) - (a.value || 0));
  const top_priority = gaps[0] || (opportunities[0] ? { id: opportunities[0].id, label: opportunities[0].title, value: opportunities[0].estimated_impact } : null);

  // Risks
  const risks: any[] = [];
  if (revenue == null) risks.push({ risk: 'No verified revenue data', severity: 'high', area: 'data_quality' });
  if (assessment_completion_count < 3) risks.push({ risk: `Only ${assessment_completion_count} of 6 assessments completed`, severity: 'medium', area: 'assessment_coverage' });
  if (doc_rows?.length === 0) risks.push({ risk: 'No financial documents uploaded', severity: 'medium', area: 'data_quality' });

  // ── Business Identity (Phase 5.1) ──────────────────────────────────────
  const business_identity = {
    name: business_entity?.business_name ?? null,
    industry: business_entity?.industry ?? null,
    entity_type: business_entity?.entity_type ?? null,
  };

  // ── Recent Documents (Phase 5.1 — for activity/change detection) ──────
  const recent_documents = (doc_rows || []).slice(0, 10).map((d: any) => ({
    id: d.id,
    name: d.name,
    document_type: d.document_type ?? null,
    status: d.upload_status ?? 'unknown',
    year: d.year ?? null,
    created_at: d.created_at,
  }));

  return {
    business_id,
    profile_id,
    contract_version: CONTRACT_VERSION,
    generated_at,
    business_identity,
    business_iq,
    business_iq_source,
    business_confidence,
    valuation: {
      baseline_value: baseline.baseline_value,
      baseline_date: baseline.baseline_date,
      baseline_status: baseline.baseline_status,
      baseline_source: baseline.baseline_source,
      current_value,
      current_value_source,
      potential_value,
      potential_value_source,
      value_gap,
      value_gap_source,
      verified_value_created,
      prior_review_value: null,
      prior_review_date: null,
      change_since_last_review: null,
      comparison_available: false,
    },
    profitability: {
      revenue,
      revenue_source,
      revenue_period_label: obsPeriodLabel('revenue'),
      revenue_period_type: obsPeriodType('revenue'),
      revenue_provenance: obsProvenance('revenue'),
      revenue_lifecycle_state: obsLifecycle('revenue'),
      gross_profit,
      gross_profit_source,
      gross_profit_period_label: obsPeriodLabel('gross_profit'),
      gross_margin: null,
      net_profit,
      net_profit_source,
      net_profit_period_label: obsPeriodLabel('net_income'),
      net_profit_provenance: obsProvenance('net_income'),
      reported_ebitda,
      reported_ebitda_source,
      reported_ebitda_period_label: obsPeriodLabel('reported_ebitda'),
      owner_compensation,
      owner_compensation_source,
      owner_compensation_period_label: obsPeriodLabel('owner_compensation'),
      owner_compensation_provenance: obsProvenance('owner_compensation'),
      recast_ebitda,
      recast_ebitda_source,
      total_addbacks,
      recast_value_impact,
      profit_gap,
      profit_gap_source,
      profit_score,
    },
    tax: {
      annual_tax_gap,
      annual_tax_gap_source,
      ten_year_tax_gap,
    },
    operations: {
      operations_score,
      operations_score_source,
      monthly_value_of_time_freed,
      hours_freed_per_week,
      hourly_value_of_time_freed,
    },
    freedom: {
      freedom_score,
      freedom_score_source,
    },
    assessments,
    assessment_completion_count,
    assessment_total_count: ASSESSMENT_TYPES.length,
    document_readiness: {
      total_documents: doc_rows?.length || 0,
      completed_count: completed_docs,
      pending_review_count: pending_review_docs,
      years_covered,
      latest_financial_period,
      financial_data_confidence: business_confidence,
    },
    recent_documents,
    // 6D.0a — reviewed document observations, semantics resolved (read-only).
    semantic_observations: observationLayer.by_key,
    unmapped_observations: observationLayer.unmapped_observations,
    observation_period_availability: observationLayer.availability,
    top_priority,
    risks,
    opportunities,
    _provenance: {
      source: 'supabase',
      updated_at: generated_at,
      schema_notes,
    },
  };
}

function emptyContract(business_id: string, profile_id: string | null, generated_at: string, notes: string[]): BusinessIntelligenceContract {
  return {
    business_id, profile_id,
    contract_version: CONTRACT_VERSION, generated_at,
    business_identity: { name: null, industry: null, entity_type: null },
    business_iq: null, business_iq_source: null, business_confidence: null,
    valuation: {
      baseline_value: null, baseline_date: null, baseline_status: 'NOT_ESTABLISHED', baseline_source: null,
      current_value: null, current_value_source: null, potential_value: null, potential_value_source: null,
      value_gap: null, value_gap_source: null, verified_value_created: null,
      prior_review_value: null, prior_review_date: null, change_since_last_review: null,
      comparison_available: false,
    },
    profitability: {
      revenue: null, revenue_source: null,
      revenue_period_label: null, revenue_period_type: null, revenue_provenance: null, revenue_lifecycle_state: null,
      gross_profit: null, gross_profit_source: null, gross_profit_period_label: null, gross_margin: null,
      net_profit: null, net_profit_source: null, net_profit_period_label: null, net_profit_provenance: null,
      reported_ebitda: null, reported_ebitda_source: null, reported_ebitda_period_label: null,
      owner_compensation: null, owner_compensation_source: null, owner_compensation_period_label: null, owner_compensation_provenance: null,
      recast_ebitda: null, recast_ebitda_source: null, total_addbacks: null, recast_value_impact: null,
      profit_gap: null, profit_gap_source: null, profit_score: null,
    },
    tax: { annual_tax_gap: null, annual_tax_gap_source: null, ten_year_tax_gap: null },
    operations: { operations_score: null, operations_score_source: null, monthly_value_of_time_freed: null, hours_freed_per_week: null, hourly_value_of_time_freed: null },
    freedom: { freedom_score: null, freedom_score_source: null },
    assessments: {},
    assessment_completion_count: 0,
    assessment_total_count: ASSESSMENT_TYPES.length,
    document_readiness: { total_documents: 0, completed_count: 0, pending_review_count: 0, years_covered: [], latest_financial_period: null, financial_data_confidence: null },
    recent_documents: [],
    semantic_observations: {}, unmapped_observations: [], observation_period_availability: {},
    top_priority: null, risks: [], opportunities: [],
    _provenance: { source: 'supabase', updated_at: generated_at, schema_notes: notes },
  };
}