/**
 * Canonical Active-Business Resolution — Phase 6.9
 *
 * THE CONTRACT (see src/PHASE_6_9_BUSINESS_CONTEXT_REMEDIATION_REPORT.md):
 *
 *   SESSION → ACTOR → ACTIVE/REQUESTED BUSINESS → AUTHORIZE ACTOR → READ/WRITE THAT BUSINESS
 *
 * ACTOR, BUSINESS and AUTHORIZATION are three separate concepts.
 * BUSINESS is never inferred from ACTOR.
 *
 * `profiles.primary_business_id` is a PREFERENCE used only to choose the INITIAL
 * business on first resolution. It MUST NOT override an explicitly selected
 * business, and it is NOT a substitute for one. When an account owns more than
 * one business and no explicit context was supplied, the request is ambiguous
 * and is REFUSED rather than silently answered with the wrong business.
 *
 * Authorization mirrors validateBusinessScope / `can_access_business()`, the same
 * rule every business-scoped RLS policy uses.
 */

import { validateBusinessScope } from './writeGuard.ts';

export const BUSINESS_CONTEXT_REQUIRED = 'BUSINESS_CONTEXT_REQUIRED';

export interface ResolvedActiveBusiness {
  business_id: string | null;
  resolution: 'explicit' | 'primary_default' | 'none';
}

const isUsableId = (v: any): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim() !== 'null' && v.trim() !== 'undefined';

function contextRequiredError(action: string, ownedCount: number): Error {
  const err: any = new Error(
    `active business_id is required for ${action}: this account owns ${ownedCount} businesses, ` +
    `so primary_business_id is ambiguous and must not be substituted for an explicit selection`
  );
  err.code = BUSINESS_CONTEXT_REQUIRED;
  err.status = 400;
  return err;
}

/**
 * countOwnedBusinesses — how many distinct businesses this actor can access.
 * Used only to decide whether a missing explicit context is unambiguous.
 */
export async function countOwnedBusinesses(sb: any, profile: any): Promise<number> {
  const ids = new Set<string>();
  const [owners, entities] = await Promise.all([
    sb.from('business_owners').select('business_id').eq('profile_id', profile.id),
    sb.from('business_entities').select('id').eq('profile_id', profile.id),
  ]);
  for (const r of (owners?.data || [])) if (isUsableId(r.business_id)) ids.add(r.business_id);
  for (const r of (entities?.data || [])) if (isUsableId(r.id)) ids.add(r.id);
  if (isUsableId(profile.primary_business_id)) ids.add(profile.primary_business_id);
  return ids.size;
}

/**
 * resolveActiveBusiness — the canonical business resolution for BACKEND functions.
 *
 * Precedence:
 *   1. explicit requested business_id → authorized against the actor, returned
 *   2. no explicit context:
 *        · actor owns exactly one business → that business (unambiguous default)
 *        · actor owns several + allowPrimaryDefault → profile default
 *          (ONLY for initial-selection resolvers — pass it deliberately)
 *        · actor owns several otherwise → BUSINESS_CONTEXT_REQUIRED (400)
 *
 * @throws Error with .status / .code on refusal (never returns the wrong business)
 */
export async function resolveActiveBusiness(
  sb: any,
  profile: any,
  requestedBusinessId: any,
  opts: { action?: string; allowPrimaryDefault?: boolean } = {}
): Promise<ResolvedActiveBusiness> {
  const { action = 'this operation', allowPrimaryDefault = false } = opts;

  if (!profile) return { business_id: null, resolution: 'none' };

  const requested = isUsableId(requestedBusinessId) ? requestedBusinessId.trim() : null;

  // ── 1. Explicit context is authoritative ──────────────────────────────────
  if (requested) {
    // The profile's own primary business is definitionally authorized (same
    // convention as getAssessmentSummary). Anything else must pass the guard.
    if (requested !== profile.primary_business_id) {
      await validateBusinessScope(sb, requested, profile.id);
    }
    return { business_id: requested, resolution: 'explicit' };
  }

  // ── 2. No explicit context — default only, never a substitute ─────────────
  const primary = isUsableId(profile.primary_business_id) ? profile.primary_business_id : null;
  if (!primary) return { business_id: null, resolution: 'none' };

  if (allowPrimaryDefault) return { business_id: primary, resolution: 'primary_default' };

  const ownedCount = await countOwnedBusinesses(sb, profile);
  if (ownedCount <= 1) return { business_id: primary, resolution: 'primary_default' };

  throw contextRequiredError(action, ownedCount);
}

/**
 * resolveActorBusinessContext — actor identity + business resolution + membership
 * for the AI consumer functions (Phase 6.9 closure).
 *
 * ACTOR IDENTITY IS DERIVED EXCLUSIVELY FROM THE AUTHENTICATED SESSION. The
 * profile is looked up by the session user's email; `data.profile_id` is never
 * consulted. The business is then resolved through the canonical contract above,
 * so a multi-business account that supplies no explicit business is REFUSED
 * (400 BUSINESS_CONTEXT_REQUIRED) rather than answered with the primary business.
 *
 * Membership resolution is intentionally preserved as-is from the legacy
 * resolveProfileAndBusiness (including its `data.membership_status` override) so
 * this change alters business resolution ONLY and no gating behaviour.
 *
 * @throws Error with .status / .code on refusal — map with businessContextError()
 */
export async function resolveActorBusinessContext(
  sb: any,
  user: any,
  data: any = {},
  opts: { action?: string; allowPrimaryDefault?: boolean } = {}
): Promise<{ profileId: string | null; businessId: string | null; membershipStatus: string; profile: any }> {
  // Only columns PROVEN to exist on `profiles` are selected here. A single
  // non-existent column makes PostgREST return { data: null } — which silently
  // degraded every caller to "no profile". Identity + ownership live in this query.
  const { data: profile } = await sb
    .from('profiles')
    .select('id, primary_business_id, app_role')
    .eq('email', user?.email)
    .maybeSingle();

  const profileId = profile?.id || null;

  const requested = data?.active_business_id || data?.business_id || null;
  const { business_id: businessId } = await resolveActiveBusiness(sb, profile, requested, opts);

  let membershipStatus = data?.membership_status;
  if (!membershipStatus) {
    const role = profile?.app_role || user?.role;
    if (['super_admin', 'advisor', 'admin'].includes(role)) {
      membershipStatus = 'paid';
    } else {
      // Membership signals are read in a SEPARATE, tolerant query so a missing
      // optional column cannot break identity resolution above. Absent columns
      // simply yield null → 'free', which is the legacy behaviour.
      const { data: membership } = await sb
        .from('profiles')
        .select('membership_tier, subscription_status')
        .eq('id', profileId)
        .maybeSingle();
      membershipStatus =
        membership?.membership_tier === 'member' ||
        membership?.membership_tier === 'pro' ||
        membership?.subscription_status === 'active'
          ? 'paid'
          : 'free';
    }
  }

  return { profileId, businessId, membershipStatus, profile };
}

/**
 * assertBusinessAccess — authorize the actor against a business_id that came from
 * a RECORD (not from the request). Used by accept/dismiss-style mutations, where the
 * object itself establishes the business and the actor must be checked against it.
 */
export async function assertBusinessAccess(
  sb: any,
  businessId: any,
  profile: any,
  opts: { action?: string } = {}
): Promise<string> {
  const { action = 'this operation' } = opts;

  if (!isUsableId(businessId)) {
    const err: any = new Error(`${action}: record has no business_id — cannot authorize`);
    err.code = 'BUSINESSLESS_RECORD';
    err.status = 409;
    throw err;
  }
  if (businessId === profile.primary_business_id) return businessId;

  await validateBusinessScope(sb, businessId, profile.id);
  return businessId;
}

/**
 * requireBusinessContext — resolve the business for ONE business-scoped action.
 *
 * Returns EITHER the resolved business_id OR the refusal Response, so an action
 * handler stays one line and no function needs to carry its own error mapping:
 *
 *     const { businessId, denial } = await requireBusinessContext(sb, profile, data?.active_business_id || data?.business_id, 'thing.action');
 *     if (denial) return denial;
 *
 * Never substitutes primary_business_id for a multi-business account — an
 * ambiguous request is refused with 400 BUSINESS_CONTEXT_REQUIRED.
 */
export async function requireBusinessContext(
  sb: any,
  profile: any,
  requestedBusinessId: any,
  action: string
): Promise<{ businessId: string | null; denial: Response | null }> {
  try {
    const { business_id } = await resolveActiveBusiness(sb, profile, requestedBusinessId, { action });
    return { businessId: business_id, denial: null };
  } catch (err) {
    return { businessId: null, denial: businessContextError(err) };
  }
}

/**
 * businessScopeMismatch — the canonical 403 for a record addressed by id that
 * belongs to a different business than the resolved context.
 */
export function businessScopeMismatch(what: string): Response {
  return Response.json(
    { error: `${what} does not belong to the active business`, code: 'BUSINESS_SCOPE_MISMATCH' },
    { status: 403 }
  );
}

/**
 * businessContextError — the single HTTP mapping for business-context refusals.
 *   400 BUSINESS_CONTEXT_REQUIRED — caller must supply active context
 *   403                          — actor is not authorized for the business
 *   409 BUSINESSLESS_RECORD      — the record cannot establish a business
 */
export function businessContextError(err: any): Response {
  const code = err?.code || 'BUSINESS_CONTEXT_DENIED';
  const status = err?.status || (code === BUSINESS_CONTEXT_REQUIRED ? 400 : 403);
  console.error('[businessScope] denied:', code, err?.message || err);
  return Response.json({ error: err?.message || 'Business context denied', code }, { status });
}