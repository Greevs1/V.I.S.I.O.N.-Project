/**
 * Handled Moves — the anti-loop ledger for the Next Best Action.
 *
 * THE RULE THIS ENFORCES
 *   An action the owner has already acted on must not be handed back to them. If
 *   "Investigate owner dependency" is completed, the hero cannot keep insisting on
 *   it — that is the same defect as the onboarding loop, one surface over. This is
 *   the same philosophy as the Knowledge Gap Engine's `answered_question_ids`: a
 *   dealt-with thing is recorded, and the next decision reads that record.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *   It is UI focus state, not business truth. Nothing here is a fact about the
 *   business, and nothing here survives as a claim about the world — the objects
 *   themselves (opportunities, sprints, assignments) remain the single source of
 *   truth, and a candidate disappears from the resolver when ITS OWN record moves
 *   on. This ledger only answers "which of these has the owner already looked at?"
 *
 *   It is business-scoped and tab-scoped, exactly like the existing goal store and
 *   saved-item store, so one business's history can never influence another's. A
 *   server-side, cross-device ledger is NOT introduced here; that would be a
 *   second source of truth beside the objects themselves.
 *
 * DISPOSITIONS
 *   engaged    the owner opened it — the focus moves on, but it stays available
 *              among the alternatives, because opening something is not finishing it
 *   completed  the work is done — it is not offered again
 *   dismissed  the owner said no — it is not offered again
 */

const STORAGE_KEY_PREFIX = 'vision_galileo_handled_moves';

function storageKey(businessId) {
  // Business-scoped: one business's handled moves can never affect another's.
  return businessId ? `${STORAGE_KEY_PREFIX}:${businessId}` : STORAGE_KEY_PREFIX;
}

/**
 * getHandledMoves — the ledger for this business.
 * @returns {Array<{key: string, disposition: string, at: string}>}
 */
export function getHandledMoves(businessId = null) {
  try {
    const raw = sessionStorage.getItem(storageKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(moves, businessId) {
  try {
    sessionStorage.setItem(storageKey(businessId), JSON.stringify(moves.slice(-80)));
  } catch { /* best-effort — focus state must never block the surface */ }
  return moves;
}

function record(key, disposition, businessId) {
  if (!key) return getHandledMoves(businessId);
  const moves = getHandledMoves(businessId).filter((m) => m.key !== key);
  moves.push({ key, disposition, at: new Date().toISOString() });
  return write(moves, businessId);
}

/** The owner opened it. The focus advances; the item stays reachable. */
export function markMoveEngaged(key, businessId = null) {
  return record(key, 'engaged', businessId);
}

/** The work is done. It is never offered again. */
export function markMoveCompleted(key, businessId = null) {
  return record(key, 'completed', businessId);
}

/** The owner declined it. It is never offered again. */
export function dismissMove(key, businessId = null) {
  return record(key, 'dismissed', businessId);
}

/**
 * keysWithDisposition — the keys in one disposition, for the resolver.
 * The resolver decides what each disposition MEANS; this only reports the record.
 */
export function keysWithDisposition(disposition, businessId = null) {
  return getHandledMoves(businessId)
    .filter((m) => m.disposition === disposition)
    .map((m) => m.key);
}

/** Forgets everything for this business (used when the business changes). */
export function clearHandledMoves(businessId = null) {
  try {
    sessionStorage.removeItem(storageKey(businessId));
  } catch { /* best-effort */ }
  return [];
}