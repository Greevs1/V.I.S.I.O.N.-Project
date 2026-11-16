/**
 * Canonical Business — the single source of truth for business identity.
 *
 * ARCHITECTURAL DECISION (Phase 6A):
 *   business_entities is the canonical Business object.
 *   The legacy `businesses` table must NOT remain an alternative identity.
 *
 * This module provides helpers so future development never accidentally
 * uses `businesses.id` instead of `business_entities.id`.
 *
 * INVARIANT:
 *   EVERY business-owned record should resolve to exactly one valid
 *   business_entities.id.
 */

/**
 * getCanonicalBusinessId — resolves the canonical business ID from context.
 *
 * Accepts either a business_entities.id directly or a context object with
 * active_business_id / primary_business_id. Always returns the canonical
 * business_entities.id or null.
 *
 * @param {string|object} source — business_id string or context object
 * @returns {string|null} — canonical business_entities.id
 */
export function getCanonicalBusinessId(source) {
  if (!source) return null;
  if (typeof source === 'string') return source || null;
  if (typeof source === 'object') {
    return source.active_business_id || source.business_id || source.primary_business_id || null;
  }
  return null;
}

/**
 * resolveBusinessContext — resolves the full business context for a user.
 *
 * Returns { businessId, profileId, isGuest } from the BusinessContextEngine.
 * This is the canonical way to get business scope in frontend code.
 *
 * @param {object} businessContext — from useBusinessContext()
 * @returns {{ businessId: string|null, profileId: string|null, isGuest: boolean }}
 */
export function resolveBusinessContext(businessContext) {
  if (!businessContext) return { businessId: null, profileId: null, isGuest: true };
  return {
    businessId: businessContext.active_business_id || null,
    profileId: businessContext.profile_id || null,
    isGuest: businessContext.is_guest !== false ? !businessContext.profile_id : false,
  };
}

/**
 * assertBusinessScope — throws if business scope is missing or invalid.
 *
 * Use at the entry point of any authenticated business-owned operation
 * to enforce that a valid business context exists before proceeding.
 *
 * @param {string|null} businessId — the business_id to validate
 * @param {object} [opts] — { allowNull: false, label: 'Operation' }
 * @throws {Error} if businessId is null/empty when allowNull is false
 * @returns {string} — the validated business_id
 */
export function assertBusinessScope(businessId, opts = {}) {
  const { allowNull = false, label = 'Operation' } = opts;
  if (!businessId) {
    if (allowNull) return null;
    throw new Error(`${label} requires a valid business context (business_id is null).`);
  }
  if (typeof businessId !== 'string' || businessId.length < 10) {
    throw new Error(`${label} requires a valid business_entities.id (got "${businessId}").`);
  }
  return businessId;
}

/**
 * isCanonicalBusinessId — checks whether a value looks like a valid
 * business_entities.id (UUID format). This is a FORMAT check only,
 * not an existence check.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isCanonicalBusinessId(id) {
  if (!id || typeof id !== 'string') return false;
  // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * CANONICAL_BUSINESS_TABLE — the canonical Supabase table name.
 * Future code should reference this constant, not a hardcoded string.
 */
export const CANONICAL_BUSINESS_TABLE = 'business_entities';

/**
 * LEGACY_BUSINESS_TABLE — the legacy table being deprecated.
 * Do NOT use for new writes. Exists for migration reference only.
 */
export const LEGACY_BUSINESS_TABLE = 'businesses';