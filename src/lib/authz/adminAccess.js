/**
 * adminAccess — ONE admin-role decision for the whole UI surface.
 *
 * The canonical role source is `profiles.app_role`, already resolved from the
 * authenticated session by AuthContext and exposed as `supabaseProfile.app_role`.
 * Nothing else grants admin: no email, no hardcoded id, no Base44 role string,
 * no localStorage, no URL or query parameter, no client-supplied value.
 *
 * Two consumers share this predicate so they can never drift apart:
 *   - the /admin route gate        (RequireAdminRole)
 *   - the Vision account menu      (VisionAccountMenu)
 *
 * THIS IS UI SURFACE CONTROL, NOT RESOURCE AUTHORIZATION. It decides whether the
 * Admin surface may be mounted. It does not, and cannot, protect Admin data:
 * every sensitive Admin backend operation must independently authorize the actor
 * and the resource it touches. Hiding or gating a page is never a boundary.
 */

export const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * Exact membership test on the canonical app_role.
 * Anything unresolved (null / undefined / unknown string) is NOT admin.
 */
export function isAdminRole(appRole) {
  return ADMIN_ROLES.includes(appRole);
}

/**
 * The route decision as a pure value, so it can be tested without a browser.
 *
 *   'wait'  — the profile has not resolved yet: never authorize early, and never
 *             deny early either (a premature deny would bounce a legitimate admin)
 *   'allow' — canonical admin / super_admin
 *   'deny'  — everyone else, and anything still unresolved once loading finished
 */
export function resolveAdminRouteAccess({
  isAuthenticated,
  authChecked,
  isLoadingAuth,
  isLoadingProfile,
  appRole,
}) {
  if (isLoadingAuth || !authChecked || isLoadingProfile) return 'wait';
  if (!isAuthenticated) return 'deny';
  return isAdminRole(appRole) ? 'allow' : 'deny';
}