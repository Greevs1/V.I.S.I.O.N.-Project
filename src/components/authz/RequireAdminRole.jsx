/**
 * RequireAdminRole — the route gate for the EXISTING Admin surface.
 *
 * WHY IT EXISTS
 * /admin was authentication-gated but not role-gated, so any authenticated user
 * could reach the Admin UI by typing the URL even though the Vision Admin menu
 * was correctly hidden. This closes that gap.
 *
 * WHAT IT DOES
 * Reads the canonical role (`supabaseProfile.app_role`, via AuthContext) through
 * the shared `resolveAdminRouteAccess` decision and:
 *   wait  → renders a loading state: the Admin surface is NOT mounted, nothing is
 *           authorized, and no premature redirect is issued
 *   deny  → renders a <Navigate replace> to `/`: the Admin surface is NEVER
 *           mounted for a denied actor, so no Admin content can flash first
 *   allow → renders the route's element
 *
 * WHY THE DENY TARGET IS `/`
 * `/` is the app's existing canonical entry resolver (HomeGate): it already sends
 * each role to its own home. Reusing it means no second role→destination map and
 * no redirect loop — only admin/super_admin are sent to /admin, and both are
 * allowed here.
 *
 * SECURITY BOUNDARY
 * This protects the UI surface only. It does NOT replace backend resource
 * authorization: every sensitive Admin operation must independently authorize the
 * actor and the resource. Do not treat this gate as protection for Admin data.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { resolveAdminRouteAccess } from '@/lib/authz/adminAccess';

const WaitingForProfile = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
);

export default function RequireAdminRole({ children }) {
  const { isAuthenticated, authChecked, isLoadingAuth, isLoadingProfile, supabaseProfile } = useAuth();

  const access = resolveAdminRouteAccess({
    isAuthenticated,
    authChecked,
    isLoadingAuth,
    isLoadingProfile,
    appRole: supabaseProfile?.app_role ?? null,
  });

  if (access === 'wait') return <WaitingForProfile />;
  if (access === 'deny') return <Navigate to="/" replace />;

  return children || <Outlet />;
}