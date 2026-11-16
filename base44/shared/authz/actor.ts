/**
 * Phase 6B.4 — AUTHENTICATION BOUNDARY (shared authorization module).
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE:
 *
 *   THE CALLER'S IDENTITY MUST NEVER COME FROM REQUEST BODY DATA.
 *
 * Request-body fields such as `_router_user_email`, `target_profile_id`,
 * `editorEmail`, `profile_id`, `user_email` or `business_id` may identify a
 * TARGET or a requested resource. They must never establish who the acting
 * authenticated user is.
 *
 * Phase 6B.3 found three sibling data functions that did the opposite: when
 * `_router_user_email` or `target_profile_id` was present, `auth.me()` was never
 * called at all, and `getProfile()` resolved whichever profile the body named.
 * `validateBusinessScope` was then applied against that attacker-chosen profile —
 * so the authorization check was correct and still useless. The worst case was
 * `supabaseProfileData.updateProfileRole`, where both the target AND the
 * "editor" whose permissions were checked came from the body: naming a real
 * super-admin's email was enough to be granted super_admin.
 *
 * THE MODEL HERE:
 *
 *   authenticateActor()      -> who is calling, from the trusted auth context ONLY
 *   resolveActingProfile()   -> which profile they may act for (actor or authorized target)
 *   authorizeBusinessAccess()-> which business they may touch
 *
 * Service role is database capability, NOT authorization. The sequence is always:
 *
 *   AUTHENTICATE -> IDENTIFY ACTOR -> AUTHORIZE ACTOR -> RESOLVE RESOURCE
 *     -> then, and only then, perform the service-role database operation
 *
 * Never: REQUEST BODY -> SERVICE ROLE -> DATABASE.
 *
 * There is deliberately NO fallback that accepts body identity when auth is
 * missing. If a legacy caller relied on forging identity, fix the caller.
 */

import { validateBusinessScope } from '../businessScope/writeGuard.ts';

/**
 * The ONE administrative role list for the whole platform. Exported (P3) so a
 * caller that must make its own canonical-role decision imports THIS list rather
 * than declaring a second one. Unchanged in value and meaning.
 */
export const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * Typed error carrying an HTTP status so callers can respond precisely:
 * 401 unauthenticated, 403 authenticated-but-unauthorized, 404 not disclosable.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface Actor {
  user: any;
  profile: any | null;
  profile_id: string | null;
  role: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * authenticateActor — establish who is calling, from the trusted server-side
 * authentication context. Throws HttpError(401) when there is no session.
 *
 * The profile is resolved by the VERIFIED Base44 -> Supabase bridge
 * (`profiles.base44_user_id`, an ID equality) and only falls back to email when
 * that column is not populated.
 *
 * S3.0 — SUSPENSION GATE: once resolved, a canonical profile whose
 * `profile_status` is `suspended` is denied here, centrally, so every consumer
 * inherits the rule instead of restating it.
 *
 * S3.0.1 — CANONICAL ADMIN AUTHORITY: Base44 authentication establishes WHO the
 * caller is. It never grants VISION administrative standing. Standing is derived
 * from `profiles.app_role` ALONE — the same invariant P3 already applies to the
 * administrative target override. A Base44 `user.role` of admin/super_admin no
 * longer elevates anything, and an actor with no canonical profile fails closed
 * (role 'user', no administrative standing). Because the rule lives here, every
 * consumer of `actor.isAdmin` inherits it.
 */
export async function authenticateActor(base44: any, sb: any): Promise<Actor> {
  const user = await base44.auth.me();
  if (!user) throw new HttpError(401, 'Unauthorized');

  let profile: any = null;

  if (user.id) {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .eq('base44_user_id', user.id)
      .maybeSingle();
    profile = data || null;
  }

  if (!profile && user.email) {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .ilike('email', String(user.email).trim())
      .maybeSingle();
    profile = data || null;
  }

  // S3.0 — CANONICAL SUSPENSION GATE.
  // A canonical profile marked `suspended` is denied application authorization
  // outright: its own role, the Base44 record's role, a target override and any
  // request-body value are all irrelevant to this decision.
  //
  // This is deliberately NOT a "must be active" requirement. `incomplete` is the
  // onboarding default that production legitimately uses for owners and admins;
  // only an explicit suspension revokes standing.
  if (profile?.profile_status === 'suspended') {
    throw new HttpError(403, 'Forbidden: account not authorized');
  }

  const appRole = profile?.app_role || null;

  // S3.0.1 — canonical standing. `appRole` (the canonical profiles row) is the
  // ONLY authority input; the authenticated Base44 role is deliberately not
  // consulted, so no Base44 standing can elevate a VISION authorization. A
  // missing canonical profile resolves to 'user' with no standing (fail closed).
  return {
    user,
    profile,
    profile_id: profile?.id || null,
    role: appRole || 'user',
    isAdmin: ADMIN_ROLES.includes(appRole),
    isSuperAdmin: appRole === 'super_admin',
  };
}

/**
 * resolveTargetBusinessId — the business a target profile belongs to, resolved
 * from persisted ownership records only.
 */
async function resolveTargetBusinessId(sb: any, targetProfile: any): Promise<string | null> {
  if (!targetProfile?.id) return null;
  if (targetProfile.primary_business_id) return targetProfile.primary_business_id;

  const { data: owned } = await sb
    .from('business_entities')
    .select('id')
    .eq('profile_id', targetProfile.id)
    .limit(1)
    .maybeSingle();
  if (owned?.id) return owned.id;

  const { data: ownerRow } = await sb
    .from('business_owners')
    .select('business_id')
    .eq('profile_id', targetProfile.id)
    .limit(1)
    .maybeSingle();
  return ownerRow?.business_id || null;
}

/**
 * resolveActingProfile — separate ACTOR from TARGET.
 *
 *   No target supplied  -> the authenticated actor's own profile.
 *   Target supplied     -> honoured ONLY when the authenticated actor is
 *                          (a) acting on themselves, or
 *                          (b) an admin/super_admin, or
 *                          (c) provably authorized for the target's business
 *                              (owner / assigned advisor / team member / expert),
 *                              verified with the same rule RLS enforces.
 *
 * A target the actor cannot be proven to reach is 403 — never silently accepted.
 */
export async function resolveActingProfile(
  sb: any,
  actor: Actor,
  { targetProfileId = null, targetEmail = null }: { targetProfileId?: string | null; targetEmail?: string | null } = {}
): Promise<{ profile: any; isTarget: boolean }> {
  const wantsTarget = Boolean(targetProfileId || targetEmail);

  if (!wantsTarget) {
    if (!actor.profile) throw new HttpError(404, 'Profile not found');
    return { profile: actor.profile, isTarget: false };
  }

  let targetProfile: any = null;
  if (targetProfileId) {
    const { data } = await sb.from('profiles').select('*').eq('id', targetProfileId).maybeSingle();
    targetProfile = data || null;
  } else {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .ilike('email', String(targetEmail).trim())
      .maybeSingle();
    targetProfile = data || null;
  }

  // Never disclose whether an arbitrary identifier exists.
  if (!targetProfile) throw new HttpError(404, 'Not found');

  // Acting for yourself is always permitted.
  if (actor.profile && targetProfile.id === actor.profile.id) {
    return { profile: targetProfile, isTarget: false };
  }

  // Platform administrators may act for any target.
  if (actor.isAdmin) return { profile: targetProfile, isTarget: true };

  // Otherwise the actor must be provably authorized for the target's business —
  // the identical ownership/assignment rule `can_access_business()` enforces.
  if (actor.profile_id) {
    const businessId = await resolveTargetBusinessId(sb, targetProfile);
    if (businessId) {
      try {
        await validateBusinessScope(sb, businessId, actor.profile_id);
        return { profile: targetProfile, isTarget: true };
      } catch {
        // fall through to 403 — never disclose which check failed
      }
    }
  }

  throw new HttpError(403, 'Forbidden: no access to that profile');
}

/**
 * authorizeBusinessAccess — may this authenticated actor touch this business?
 *
 * Platform admins are permitted; everyone else is held to the same rule RLS
 * enforces. Throws 403 when not.
 */
export async function authorizeBusinessAccess(sb: any, actor: Actor, businessId: string): Promise<true> {
  if (!businessId) throw new HttpError(400, 'business_id is required');
  if (actor.isAdmin) return true;
  if (!actor.profile_id) throw new HttpError(403, 'Forbidden: no access to that business');
  try {
    await validateBusinessScope(sb, businessId, actor.profile_id);
  } catch {
    throw new HttpError(403, 'Forbidden: no access to that business');
  }
  return true;
}

/**
 * errorResponse — turn a thrown error into a response without leaking
 * database internals, and without masking the real status.
 */
export function errorResponse(error: any): Response {
  const status = typeof error?.status === 'number' ? error.status : 500;
  if (status >= 500) {
    console.error('[authz] unhandled error:', error?.message || error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
  return Response.json({ error: error?.message || 'Request rejected' }, { status });
}