/**
 * Phase S3 — DOCUMENT RESOURCE AUTHORIZATION (shared).
 *
 * ONE decision point for "may this actor perform this operation on this
 * document?". It is deliberately PURE: it performs no I/O and never touches a
 * database or storage client. The caller loads the resource and injects the
 * canonical business check, so this module decides and the caller only acts.
 *
 * THE RULE: the tenant comes from the DOCUMENT ROW. A client-supplied
 * business_id, profile_id, user_id or bucket never establishes authority.
 * Knowing an identifier grants zero authorization.
 *
 * DELETE is STRICTER than VIEW:
 *   VIEW   — admin, owner-of-record, or a LIVE canonical business relationship
 *   DELETE — admin or owner-of-record ONLY (never advisor/team/expert/assignee)
 *
 * Relationship LIFECYCLE (including a revoked advisor) is decided by the
 * injected check, which is the canonical assertBusinessAccess →
 * validateBusinessScope rule. It is never re-implemented here.
 *
 * NOTE — keep each type declaration on ONE LINE: the authorization test harness
 * (scripts/documentAccessAuthorization.test.cjs) executes this file's REAL
 * source in a sandbox by stripping TS-only declaration lines and `: any`
 * annotations. A multi-line declaration would break that strip.
 */

export type DocumentOperation = 'view' | 'delete';
export type DocumentActor = { profile_id: string | null; isAdmin: boolean; hasProfile: boolean };
export type DocumentRecordShape = { profile_id?: string | null; business_id?: string | null };
export type DocumentDecision = { outcome: 'allow'; reason: string } | { outcome: 'deny'; reason: string } | { outcome: 'require_business'; business_id: string };

export function isOwnerOfRecord(doc: any, actor: any) {
  // Boolean(actor.profile_id) guards a null actor profile matching a null column.
  return Boolean(actor && actor.profile_id) && Boolean(doc) && doc.profile_id === actor.profile_id;
}

export function resolveDocumentAuthorization(doc: any, actor: any, operation: any) {
  if (!doc) return { outcome: 'deny', reason: 'not_found' };
  if (actor && actor.isAdmin) return { outcome: 'allow', reason: 'platform_admin' };

  const owner = isOwnerOfRecord(doc, actor);

  if (operation === 'delete') {
    return owner
      ? { outcome: 'allow', reason: 'owner_of_record' }
      : { outcome: 'deny', reason: 'delete_requires_owner_or_admin' };
  }

  if (owner) return { outcome: 'allow', reason: 'owner_of_record' };

  // The business id is taken from the DOCUMENT — never from the caller.
  if (doc.business_id && actor && actor.hasProfile) {
    return { outcome: 'require_business', business_id: doc.business_id };
  }

  return { outcome: 'deny', reason: 'no_business_and_not_owner' };
}

export async function authorizeDocumentAccess({ doc, actor, operation, checkBusinessAccess }: any) {
  const decision = resolveDocumentAuthorization(doc, actor, operation);

  if (decision.outcome === 'allow') return { authorized: true, reason: decision.reason };
  if (decision.outcome === 'deny') return { authorized: false, reason: decision.reason };

  try {
    await checkBusinessAccess(decision.business_id);
    return { authorized: true, reason: 'business_access' };
  } catch {
    return { authorized: false, reason: 'business_access_denied' };
  }
}