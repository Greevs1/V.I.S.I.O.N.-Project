/**
 * Baseline Business Value Resolver — Shared Supabase Intelligence Contract
 *
 * THE SINGLE CERTIFIED AUTHORITATIVE OWNER for Baseline Business Value.
 *
 * Definition:
 *   "The first legitimate, business-scoped Current Business Value measurement
 *    that established the historical starting point for future comparison."
 *
 * Properties:
 *   - Historical  (assessment records are immutable once created)
 *   - Immutable    (we query the FIRST/oldest, ordered by created_at ascending)
 *   - Business-scoped (via assessment_sessions.business_id — mandatory)
 *   - Supabase-backed (persistence authority)
 *   - Distinct from Current Value, Potential Value, Value Gap, Verified Value Created
 *
 * Source Priority (semantic ownership, NOT earliest timestamp):
 *   1. Primary: First legitimate Value Gap assessment_calculations.result_json.current_value
 *      (via assessment_sessions, ordered oldest first) — IMMUTABLE, certified.
 *      The Value Gap assessment is the ONLY assessment that establishes Current
 *      Business Value.
 *   2. Secondary: dashboard_metrics.value_gap_details.current_value + business_assessments.updated_at
 *      Used ONLY when assessment_sessions is not populated (existing data from before
 *      the session-tracking migration). The baseline_date comes from business_assessments
 *      (immutable). The baseline_value comes from dashboard_metrics (mutable, but the
 *      baseline_date anchors it historically). Once assessment_sessions is populated
 *      (via future saves), the primary source takes over and the baseline becomes
 *      fully immutable.
 *
 * Historical Test Filtering:
 *   - business_id is mandatory (all queries are business-scoped)
 *   - Excludes incomplete assessment sessions (no calculation record)
 *   - Excludes null/zero current_value (invalid records)
 *   - Excludes another business (business_id filter enforced)
 *   - Business switching: each business has its own independent baseline
 *
 * Baseline Status:
 *   - ESTABLISHED     — legitimate baseline exists (primary or secondary source)
 *   - NOT_ESTABLISHED  — no value_gap assessment data at all
 *   - NEEDS_REVIEW     — multiple candidates with conflicting values (primary only)
 *
 * Immutability:
 *   Once established via the primary source (assessment_calculations), the baseline
 *   does NOT move when Current Value later changes. The secondary source (dashboard_metrics)
 *   is a transition path for existing data — future saves populate assessment_sessions,
 *   upgrading the baseline to the immutable primary source.
 *
 * Consumers (Dashboard, Galileo, Executive Brief, Living Intelligence) MUST NOT
 * resolve baseline independently. They read from this resolver via the shared contract.
 */

export interface BaselineBusinessValue {
  baseline_value: number | null;
  baseline_date: string | null;
  baseline_status: 'ESTABLISHED' | 'NOT_ESTABLISHED' | 'NEEDS_REVIEW';
  baseline_source: string | null;
  baseline_session_id: string | null;
}

const NOT_ESTABLISHED: BaselineBusinessValue = {
  baseline_value: null,
  baseline_date: null,
  baseline_status: 'NOT_ESTABLISHED',
  baseline_source: null,
  baseline_session_id: null,
};

/**
 * Resolve Baseline Business Value — the single certified baseline owner.
 *
 * Resolution path:
 *   1. Primary: assessment_sessions (by business_id) → assessment_calculations
 *   2. Fallback: assessment_sessions (by owner profile_id) → assessment_calculations
 *      (handles existing data where sessions lack business_id)
 *   3. Secondary: dashboard_metrics + business_assessments
 *      (handles existing data where assessment_sessions is not populated)
 */
export async function resolveBaselineBusinessValue(
  sb: any,
  business_id: string
): Promise<BaselineBusinessValue> {
  if (!business_id) return NOT_ESTABLISHED;

  // ── Primary path: assessment_sessions by business_id ──
  let sessions = await getSessions(sb, 'business_id', business_id);

  // ── Fallback path: assessment_sessions by owner profile_id ──
  if (!sessions || sessions.length === 0) {
    const ownerProfileId = await getOwnerProfileId(sb, business_id);
    if (ownerProfileId) {
      sessions = await getSessions(sb, 'profile_id', ownerProfileId);
    }
  }

  // ── Primary resolution: assessment_calculations ──
  if (sessions && sessions.length > 0) {
    const result = await resolveFromCalculations(sb, sessions);
    if (result) return result;
  }

  // ── Secondary path: dashboard_metrics + business_assessments ──
  // Used when assessment_sessions is not populated (existing data).
  return await resolveFromDashboardMetrics(sb, business_id);
}

/**
 * Resolve baseline from assessment_calculations (primary source — immutable).
 */
async function resolveFromCalculations(sb: any, sessions: any[]): Promise<BaselineBusinessValue | null> {
  const sessionIds = sessions.map((s: any) => s.id);
  const { data: calcs, error: calcErr } = await sb
    .from('assessment_calculations')
    .select('session_id, result_json, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });

  if (calcErr || !calcs || calcs.length === 0) return null;

  const sessionMap = new Map(sessions.map((s: any) => [s.id, s]));
  const candidates: Array<{ value: number; date: string; session_id: string }> = [];

  for (const calc of calcs) {
    const session = sessionMap.get(calc.session_id);
    if (!session) continue;
    const resultJson = calc.result_json || {};
    const currentValue = resultJson.current_value ?? resultJson.currentValue;
    if (typeof currentValue === 'number' && currentValue > 0) {
      candidates.push({
        value: currentValue,
        date: session.created_at,
        session_id: session.id,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by session created_at (oldest first) — ensures immutability
  candidates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Conflict detection
  if (candidates.length > 1) {
    const firstValue = candidates[0].value;
    const hasConflict = candidates.some(c => c.value !== firstValue);
    if (hasConflict) {
      return {
        baseline_value: candidates[0].value,
        baseline_date: candidates[0].date,
        baseline_status: 'NEEDS_REVIEW',
        baseline_source: 'assessment_calculations',
        baseline_session_id: candidates[0].session_id,
      };
    }
  }

  const first = candidates[0];
  return {
    baseline_value: first.value,
    baseline_date: first.date,
    baseline_status: 'ESTABLISHED',
    baseline_source: 'assessment_calculations',
    baseline_session_id: first.session_id,
  };
}

/**
 * Resolve baseline from dashboard_metrics + business_assessments (secondary source).
 * Used when assessment_sessions is not populated (existing data from before
 * the session-tracking migration). The baseline_date comes from business_assessments
 * (immutable). The baseline_value comes from dashboard_metrics.value_gap_details.
 */
async function resolveFromDashboardMetrics(sb: any, business_id: string): Promise<BaselineBusinessValue> {
  // Get the value_gap assessment record (for the date)
  const { data: baRow } = await sb
    .from('business_assessments')
    .select('updated_at, completed_at')
    .eq('business_id', business_id)
    .eq('assessment_type', 'value_gap')
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!baRow) return NOT_ESTABLISHED;

  // Get the current_value from dashboard_metrics
  const { data: dm } = await sb
    .from('dashboard_metrics')
    .select('value_gap_details')
    .eq('business_id', business_id)
    .maybeSingle();

  const currentValue = dm?.value_gap_details?.current_value ?? null;
  const baselineDate = baRow.completed_at || baRow.updated_at || null;

  if (typeof currentValue !== 'number' || currentValue <= 0) return NOT_ESTABLISHED;

  return {
    baseline_value: currentValue,
    baseline_date: baselineDate,
    baseline_status: 'ESTABLISHED',
    baseline_source: 'dashboard_metrics',
    baseline_session_id: null,
  };
}

/**
 * Get value_gap assessment sessions scoped by a column (business_id or profile_id).
 */
async function getSessions(sb: any, column: string, value: string) {
  // assessment_sessions uses started_at/completed_at, NOT created_at
  const { data, error } = await sb
    .from('assessment_sessions')
    .select('id, started_at, completed_at')
    .eq(column, value)
    .eq('assessment_type', 'value_gap')
    .order('completed_at', { ascending: true })
    .limit(20);
  if (error) {
    console.warn(`[resolveBaselineBusinessValue] sessions query (${column}) error:`, error.message);
    return [];
  }
  // Normalize to a created_at-like field for downstream use
  return (data || []).map((s: any) => ({ id: s.id, created_at: s.completed_at || s.started_at }));
}

/**
 * Resolve the owner profile_id for a business (via business_owners).
 */
async function getOwnerProfileId(sb: any, business_id: string): Promise<string | null> {
  const { data: primaryOwner } = await sb
    .from('business_owners')
    .select('profile_id')
    .eq('business_id', business_id)
    .eq('is_primary_owner', true)
    .maybeSingle();
  if (primaryOwner?.profile_id) return primaryOwner.profile_id;

  const { data: anyOwner } = await sb
    .from('business_owners')
    .select('profile_id')
    .eq('business_id', business_id)
    .limit(1)
    .maybeSingle();
  if (anyOwner?.profile_id) return anyOwner.profile_id;

  const { data: biz } = await sb
    .from('business_entities')
    .select('assigned_advisor_id')
    .eq('id', business_id)
    .maybeSingle();
  return biz?.assigned_advisor_id || null;
}