/**
 * Assessment Loader — Shared Supabase read helper for assessment results.
 *
 * Phase C.1: Base44 Assessment entity is retired as a persistence authority.
 * All backend functions that previously read `base44.entities.Assessment` now
 * read from Supabase via this helper.
 *
 * Two read modes:
 *   1. loadAssessmentResults — computed result_json (full calculation output)
 *      via assessment_sessions → assessment_calculations join. Business-scoped.
 *   2. loadBusinessAssessmentSummaries — business_assessments rows
 *      (score, estimated_opportunity_value, key_findings, summary, etc.).
 *
 * Both are business-scoped. Callers MUST pass a valid business_id.
 */

export interface AssessmentCalc {
  session_id: string;
  assessment_type: string;
  result_json: Record<string, any> | null;
  input_json?: Record<string, any> | null;
  created_at?: string;
  id?: string;
}

export interface BusinessAssessmentSummary {
  id: string;
  business_id: string;
  assessment_type: string;
  score: number | null;
  estimated_opportunity_value: number | null;
  risk_level: string | null;
  opportunity_level: string | null;
  summary: string | null;
  key_findings: string | null;
  recommendations: string | null;
  completed_at: string | null;
  updated_at: string | null;
  status: string | null;
}

/**
 * Load computed assessment results (result_json) for a business.
 * Returns a map keyed by assessment_type (latest calculation per type).
 *
 * @param sb Supabase client (service role)
 * @param business_id Business ID (mandatory)
 */
export async function loadAssessmentResults(
  sb: any,
  business_id: string,
): Promise<{ byType: Record<string, AssessmentCalc>; list: AssessmentCalc[] }> {
  if (!business_id) return { byType: {}, list: [] };

  const { data: sessions } = await sb.from('assessment_sessions')
    .select('id, assessment_type')
    .eq('business_id', business_id)
    .order('completed_at', { ascending: false });

  if (!sessions || sessions.length === 0) return { byType: {}, list: [] };

  const sessionIds = sessions.map((s: any) => s.id);
  // Deterministic ordering: created_at DESC with id DESC as tiebreaker.
  // Without the id tiebreaker, rows with identical (or NULL) created_at
  // have non-deterministic order — meaning a stale RUN A calculation
  // could be selected over the newer RUN B calculation.
  const { data: calcs } = await sb.from('assessment_calculations')
    .select('id, session_id, assessment_type, result_json, input_json, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  const byType: Record<string, AssessmentCalc> = {};
  const list: AssessmentCalc[] = [];
  for (const calc of (calcs || [])) {
    if (!byType[calc.assessment_type]) byType[calc.assessment_type] = calc;
    list.push(calc);
  }
  return { byType, list };
}

/**
 * Load business_assessments summary rows for a business.
 * Completion is inferred from score != null or estimated_opportunity_value != null.
 *
 * @param sb Supabase client (service role)
 * @param business_id Business ID (mandatory)
 */
export async function loadBusinessAssessmentSummaries(
  sb: any,
  business_id: string,
): Promise<BusinessAssessmentSummary[]> {
  if (!business_id) return [];
  const { data } = await sb.from('business_assessments')
    .select('id, business_id, assessment_type, score, estimated_opportunity_value, risk_level, opportunity_level, summary, key_findings, recommendations, completed_at, updated_at, status')
    .eq('business_id', business_id)
    .order('updated_at', { ascending: false });
  return (data || []) as BusinessAssessmentSummary[];
}

/**
 * Check if an assessment type is completed (has a score or opportunity value).
 */
export function isAssessmentCompleted(summary: BusinessAssessmentSummary | null): boolean {
  if (!summary) return false;
  // Canonical: explicit status or completed_at — NOT inferred from score/opportunity value.
  // A completed assessment with a zero result is still COMPLETED (P6).
  return summary.status === 'completed' || summary.completed_at != null;
}