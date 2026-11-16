/**
 * VisionAccountMenu — the account control inside the Vision header.
 *
 * WHY IT EXISTS
 * The Vision header reduced the account area to ONE action (open Settings), so
 * there was no way into the EXISTING Admin surface from Vision. Admin is
 * account-level, not a business operating surface, so it does not belong in
 * Destinations — it belongs here.
 *
 * AUTHORIZATION — READ BEFORE RELYING ON THIS
 * The Admin item is rendered only when the AUTHENTICATED PROFILE says so:
 * `supabaseProfile.app_role ∈ {admin, super_admin}` — the canonical role column,
 * resolved from the session by the existing AuthContext. There is no email check,
 * no hardcoded id, no stored/query-string role, and no second role system. If the
 * profile has not resolved, the item is simply absent (the safe direction).
 *
 * This is UX, NOT a boundary. Showing or hiding the item grants nothing: the
 * Admin route and every backend function behind it keep their own enforcement,
 * and a client-supplied role is never trusted anywhere.
 *
 * NOTHING IS REIMPLEMENTED HERE. Settings opens the same Settings that the
 * account control always opened; Admin navigates to the existing `/admin` route
 * and its existing pages.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Shield } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useVisionIdentity } from '@/hooks/useVisionIdentity';
// ONE admin-role decision for the whole UI, shared with the /admin route gate
// (RequireAdminRole) so menu visibility and route authorization cannot drift.
import { isAdminRole } from '@/lib/authz/adminAccess';

export default function VisionAccountMenu({ onOpenWorkspace }) {
  const { supabaseProfile, logout } = useAuth();
  const { fullName, initials } = useVisionIdentity();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Authorization is READ, never granted: the canonical role off the
  // authenticated profile row.
  const canAdmin = isAdminRole(supabaseProfile?.app_role);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSettings = () => {
    setOpen(false);
    // Exactly what the account control always did: open Settings inside Vision
    // when a workspace layer is available, otherwise fall back to the route.
    if (onOpenWorkspace) onOpenWorkspace('settings');
    else navigate('/settings');
  };

  const handleAdmin = () => {
    setOpen(false);
    // Admin is a NATIVE VISION WORKSPACE: the workspace layer opens the existing
    // AdminView inside Vision (see AdminWorkspaceHost), so the shell, the Galileo
    // bar and the notification layer all stay. The /admin route remains as the
    // fallback for a caller that holds no workspace layer, and as a deep link.
    if (onOpenWorkspace) onOpenWorkspace('admin');
    else navigate('/admin');
  };

  const handleSignOut = () => {
    setOpen(false);
    logout();
  };

  const itemClass =
    'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] text-white/80 transition-colors hover:bg-white/[0.05] vision-focus';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account and preferences"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.045] text-[10.5px] font-semibold text-vision-champagne/90 transition-colors duration-200 hover:bg-white/[0.1] vision-focus"
      >
        {initials || '·'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/[0.08] bg-[hsl(var(--vision-raised))]/95 shadow-2xl backdrop-blur-xl"
        >
          {/* Identity — the profile area itself, not a destination. */}
          <div className="border-b border-white/[0.06] px-3.5 py-2.5">
            <p className="truncate text-[12px] text-white/80">{fullName || 'Your account'}</p>
            {supabaseProfile?.email && (
              <p className="truncate text-[10.5px] text-white/35">{supabaseProfile.email}</p>
            )}
          </div>

          <button type="button" role="menuitem" onClick={handleSettings} className={itemClass}>
            <Settings className="h-3.5 w-3.5 shrink-0 text-vision-champagne/55" />
            Settings
          </button>

          {/* Admin — canonical admin / super_admin only. */}
          {canAdmin && (
            <button type="button" role="menuitem" onClick={handleAdmin} className={itemClass}>
              <Shield className="h-3.5 w-3.5 shrink-0 text-vision-champagne/55" />
              Admin
            </button>
          )}

          <div className="border-t border-white/[0.06]">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] text-red-300/80 transition-colors hover:bg-red-400/[0.08] vision-focus"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}