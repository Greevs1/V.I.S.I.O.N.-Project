/**
 * Phase S4 Gate B — CANONICAL ACTOR RESOLUTION (strict).
 *
 * WHY THIS IS NOT authenticateActor():
 *
 *   `shared/authz/actor.ts` resolves the caller by `profiles.base44_user_id`
 *   equality and then FALLS BACK to an `ilike('email')` match when that column is
 *   empty. Two consequences follow, both deliberate there and unacceptable here:
 *
 *     1. An email address is mutable and non-unique, so that fallback binds a
 *        session to a profile by an attribute the user can change and that a second
 *        account can share. For an ordinary read that is a defensible trade-off. For
 *        a financial write it is not the binding the S4 requirement states.
 *     2. The id branch uses `.maybeSingle()`. Given TWO rows carrying the same
 *        `base44_user_id`, PostgREST answers "multiple rows" as an ERROR with a null
 *        body, so the id branch yields nothing and the EMAIL branch then decides — a
 *        duplicate binding is not merely unhandled, it is MASKED, and which profile
 *        wins depends on which row the email pattern happens to match.
 *
 *   This resolver therefore performs its OWN read, as a LIST, and never consults
 *   email at all. That is also why it is a separate module rather than an option on
 *   the shared one: authenticateActor has 20 call sites across 20 files, and
 *   changing its behaviour for one endpoint would move the identity rule under every
 *   one of them. This file changes nothing for anybody else.
 *
 * THE RULE:
 *
 *   An authenticated session is the ONLY source of identity.
 *   Exactly ONE profile may be bound to it, by `profiles.base44_user_id` equality.
 *   No email match. No body field. No fallback of any kind.
 *
 * Service role is database capability, NOT identity: this runs before any write, and
 * a failure here aborts the request without one.
 */
import { ADMIN_ROLES, HttpError } from './actor.ts';

/**
 * The statuses that may hold snapshot authority. Mirrors the RPC's
 * `v_active_statuses` constant exactly (D2 §3), so the two layers cannot disagree.
 *
 * `incomplete` is admitted deliberately: it is the column DEFAULT and the state the
 * production rows are actually in (7 of 8 profiles). It means "never advanced", not
 * "revoked" — the RELATIONSHIP is the grant and status only removes eligibility.
 * `invited`, `suspended` and any unobserved value are refused.
 */
export const CANONICAL_ACTIVE_STATUSES = ['active', 'incomplete'];

export interface CanonicalActor {
  user: { id: string; email: string | null };
  profile: any;
  profile_id: string;
  role: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export async function resolveCanonicalActor(base44: any, sb: any): Promise<CanonicalActor> {
  // ── 1. SESSION — CLASSIFIED, not merely caught (Revision 6, finding 5) ─────
  // The SDK converts EVERY rejection into a Base44Error whose `.status` is
  // `error.response?.status` — so `.status` is the HTTP status when a response
  // arrived and `undefined` when none did (DNS, timeout, socket). `me()` is a GET on
  // User/me with a catch that re-throws; there is no local "no token" throw, so a
  // 401 is a SERVER verdict about the session, not a client guess.
  //
  // Three outcomes, all fail-closed, none continuing:
  //   401                    → confirmed unauthenticated            → 401
  //   any other delivered 4xx → refused; session not confirmed and
  //                             not an infrastructure verdict       → 403
  //   no status, 5xx, other   → infrastructure fault                → 500
  //
  // Reporting every rejection as 401 would state an authentication fact on the
  // strength of a transport failure. Nothing below this line runs on any branch.
  let user: any = null;
  try {
    user = await base44.auth.me();
  } catch (err: any) {
    const status = Number(err?.status);
    if (status === 401) {
      console.error('[authz] no authenticated session');
      throw new HttpError(401, 'Unauthorized');
    }
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      console.error('[authz] session could not be confirmed (' + status + ')');
      throw new HttpError(403, 'Forbidden');
    }
    console.error('[authz] session resolution failed (infrastructure)');
    throw new HttpError(500, 'Internal server error');
  }
  // A resolved response still has to carry an id; a 200 with an empty body is not a
  // session. Non-string ids are stringified rather than refused, so this check cannot
  // reject a legitimate caller over a type the platform may change.
  if (!user || user.id === null || user.id === undefined || String(user.id).length === 0) {
    console.error('[authz] session resolved without an identity');
    throw new HttpError(401, 'Unauthorized');
  }

  const sessionUserId = String(user.id);

  // ── 2. CANONICAL BINDING — a LIST read, so a duplicate is OBSERVED ──────────
  // Not `.maybeSingle()`: that collapses "two rows" into an error with a null body,
  // which is how a duplicate binding would become invisible (see the header).
  const { data: bindings, error } = await sb
    .from('profiles')
    .select('id, app_role, profile_status, base44_user_id')
    .eq('base44_user_id', sessionUserId);

  if (error) {
    console.error('[authz] canonical binding lookup failed');
    throw new HttpError(500, 'Internal server error');
  }

  // ── 2a. SHAPE — a malformed response is a FAULT, never "no binding" ────────
  // (Revision 6, finding 1.) A successful PostgREST read of a `select` returns an
  // ARRAY. A non-array body means this was not the read it claims to be, and
  // answering 403 would present an infrastructure fault as a policy verdict — the
  // caller could not tell a broken resolver from an unbound session. 500 instead.
  if (!Array.isArray(bindings)) {
    console.error('[authz] canonical binding response is not an array');
    throw new HttpError(500, 'Internal server error');
  }
  const rows = bindings;

  if (rows.length === 0) {
    // NO EMAIL FALLBACK. A profile reachable only by email is NOT this session's
    // identity. Counts are logged; no address is compared, stored or echoed, so the
    // file contains no email predicate a future reader could mistake for a fallback.
    console.error('[authz] no canonical profile bound to the session identity (bindings=0)');
    throw new HttpError(403, 'Forbidden');
  }
  if (rows.length > 1) {
    console.error('[authz] duplicate canonical profile binding (bindings=' + rows.length + ')');
    throw new HttpError(403, 'Forbidden');
  }

  const profile = rows[0];

  // ── 2b. STRUCTURE — the row must be USABLE, and must be THIS session's ─────
  // (Revision 6, finding 1.) The filter restricts to equality, which is not the same
  // as an assertion about the RESULT. Two checks, both faults rather than verdicts:
  //   · no usable id → `actor.profile_id` would be undefined, travel into
  //     `p_actor_profile_id` and return SNAPSHOT_ACTOR_UNKNOWN (403) — a data-shape
  //     fault misattributed to the caller;
  //   · `base44_user_id` not equal to the session id → unreachable through a correct
  //     `eq`, so its presence means the filter did not apply. Logged without echoing
  //     either value. Still fail-closed; 500 chosen because a 403 would assert a
  //     policy fact this read cannot establish. (403 here would be equally safe — a
  //     one-line change, recorded so the choice is visible.)
  if (typeof profile?.id !== 'string' || profile.id.length === 0) {
    console.error('[authz] canonical binding row carries no usable profile id');
    throw new HttpError(500, 'Internal server error');
  }
  if (String(profile.base44_user_id) !== sessionUserId) {
    console.error('[authz] canonical binding row does not carry the session identity');
    throw new HttpError(500, 'Internal server error');
  }

  // ── 3. STATUS — fail closed on anything not explicitly eligible ────────────
  if (!CANONICAL_ACTIVE_STATUSES.includes(String(profile?.profile_status))) {
    console.error('[authz] canonical profile status is not eligible');
    throw new HttpError(403, 'Forbidden');
  }

  // ── 4. STANDING — canonical `app_role` ONLY ────────────────────────────────
  // The Base44 `user.role` is deliberately never read, so no Base44 administrative
  // standing can elevate a VISION authorization.
  const appRole = profile?.app_role || null;

  return {
    user: { id: sessionUserId, email: user.email ?? null },
    profile,
    profile_id: profile.id,
    role: appRole || 'user',
    isAdmin: ADMIN_ROLES.includes(appRole),
    isSuperAdmin: appRole === 'super_admin',
  };
}