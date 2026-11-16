/**
 * Canonical relationship-authorization predicate — Phase S3.0.2
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE:
 *
 *   RELATIONSHIP EXISTENCE IS NOT AUTHORIZATION.
 *
 * A persisted `expert_advisor_access` row may grant the existing business scope
 * ONLY while the relationship is currently valid. A revoked relationship grants
 * ZERO business authorization.
 *
 * WHAT "VALID" MEANS — taken from the existing writers, never invented here:
 *
 *   grant   → access_status: 'active',  revoked_at: null      (expertAdvisorAccess · grant)
 *   revoke  → access_status: 'revoked', revoked_at: <instant> (expertAdvisorAccess · revoke)
 *
 * Every existing AUTHORIZATION consumer of this table already applies the same
 * rule (`access_status = 'active'`): listMyClients, checkPermission,
 * recommendationOverrides, selectStrategiesForClient, resolveStrategyMappings and
 * generateAdvisorCommandCenter. The display readers (getMyAdvisor,
 * listAllAssignments, listForClient) are deliberately more tolerant
 * (`access_status != 'revoked'`) because they name a relationship rather than
 * grant access. `writeGuard` step 6 was the ONE authorization path that asked
 * only whether a row EXISTED — which is the defect this module closes.
 *
 *   ACTIVE                      → may grant the existing business scope
 *   revoked                     → DENY
 *   pending / unknown / missing → DENY
 *   active + revoked_at set     → DENY (a partial revoke is still a revoke)
 *   no row                      → DENY
 *
 * DATABASE FILTER + APPLICATION PREDICATE (S3.0.2 refinement):
 *
 *   1. The QUERY asks the database only for a relationship that can satisfy the
 *      predicate — expert, business, access_status = 'active', revoked_at IS NULL —
 *      bounded to one row. Authorization therefore never depends on an arbitrary
 *      candidate window: any number of revoked historical rows cannot push a live
 *      relationship out of view, and no uniqueness is required, so duplicate active
 *      rows are not an error condition.
 *   2. The row that comes back is THEN judged by the predicate below, so a row that
 *      slips through the filter (drifted or re-stated status, a stale read, a
 *      tampered row) is still refused. A read error is a DENY.
 *
 * The decision reads only persisted row fields. No request-supplied status,
 * role, profile, expert id or business id ever reaches it.
 */

/** The one status value the existing `grant` writer establishes. */
export const ACTIVE_RELATIONSHIP_STATUS = 'active';

/** The only columns the decision reads. */
export const RELATIONSHIP_DECISION_COLUMNS = 'id, access_status, revoked_at';

const isUsableId = (value: any): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * isActiveRelationship — the ONE active predicate.
 *
 * Unknown or missing status is NOT active; a populated `revoked_at` is NOT active
 * even when the status still reads 'active'. Fail closed on anything unproven.
 */
export function isActiveRelationship(row: any): boolean {
  if (!row || typeof row !== 'object') return false;
  if (row.access_status !== ACTIVE_RELATIONSHIP_STATUS) return false;
  if (row.revoked_at) return false;
  return true;
}

/**
 * resolveActiveExpertRelationship — the expert↔business relationship as it
 * exists RIGHT NOW, or null.
 *
 * IDENTITY: `expert_advisor_access.expert_profile_id` holds the canonical
 * `profiles.id` as text — the identity `authenticateActor` resolves and the one
 * every reader of this table uses (verified against the `grant` writer, which
 * validates the value with `.from('profiles').eq('id', expert_profile_id)`, and
 * against production rows). The caller passes the ACTOR'S OWN profile id.
 *
 * The database does the FILTERING; this function still does the DECIDING. The row
 * the query returns is passed through `isActiveRelationship` before it is ever
 * returned to a caller, so the query is an optimization and a robustness measure,
 * never the authority.
 *
 * @returns the active row, or null when the relationship is absent, revoked,
 * non-active, or cannot be proven.
 */
export async function resolveActiveExpertRelationship(
  sb: any,
  expertProfileId: any,
  businessId: any
): Promise<any | null> {
  if (!isUsableId(expertProfileId) || !isUsableId(businessId)) return null;

  // Only a relationship that can satisfy the predicate is requested. `limit(1)`
  // (never `maybeSingle`) so duplicate active rows cannot turn a valid
  // relationship into a query error, and no candidate window is needed.
  const { data: rows, error } = await sb
    .from('expert_advisor_access')
    .select(RELATIONSHIP_DECISION_COLUMNS)
    .eq('expert_profile_id', String(expertProfileId))
    .eq('business_id', String(businessId))
    .eq('access_status', ACTIVE_RELATIONSHIP_STATUS)
    .is('revoked_at', null)
    .limit(1);

  if (error) return null;

  const row = Array.isArray(rows) ? rows[0] : rows ?? null;
  return isActiveRelationship(row) ? row : null;
}