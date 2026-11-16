/**
 * AdminWorkspaceHost — VISION's workspace adapter for the EXISTING Admin surface.
 *
 * WHAT IT IS
 *   A shell, not an application. It mounts `AdminView` — the very file the legacy
 *   /admin route renders — inside the one Vision workspace layer, and it carries
 *   the administrative SUBJECT (the user/client the admin is inspecting) in the
 *   workspace URL and trail, so Back walks one level out instead of closing the
 *   room the admin is working in.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   · No Admin tabs, data fetching, backend calls, authorization or document
 *     viewer is reimplemented here. AdminView brings all of it, unchanged.
 *   · It NEVER touches the owner-facing business context. `activeBusinessId`
 *     (Dashboard, Business Pulse, Valuation, Data Room, Opportunities, Galileo's
 *     active business) is a different concept from the administrative subject:
 *     selecting a client here must not switch it. This file imports no
 *     BusinessContext and calls no business setter — that is the guarantee, not
 *     a convention.
 *   · It renders no chrome of its own: VisionHeader, the account menu, the
 *     Global Galileo bar and the notification layer belong to the shell that
 *     hosts this layer, so Admin simply appears inside them.
 *   · It does not define Galileo's business context either: Galileo keeps the
 *     normal VISION active business. No Admin→Galileo context contract exists in
 *     this slice, deliberately.
 *
 * AUTHORIZATION (fail closed — the gate cannot live only on /admin)
 *   `?workspace=admin` can be typed by anyone and never visits the route, so this
 *   host reads the ONE canonical role decision (`resolveAdminRouteAccess` — the
 *   same predicate RequireAdminRole and the account menu use) BEFORE AdminView is
 *   rendered or even loaded:
 *     wait  → skeleton: AdminView is neither loaded nor mounted, nothing fetched
 *     deny  → refusal surface: AdminView is never loaded, no Admin data is read
 *     allow → the existing AdminView, lazily loaded
 *   Surface control only. Every Admin backend operation independently authorizes
 *   its own actor and resource.
 *
 * NAVIGATION (the established workspace trail — no parallel mechanism)
 *   root   ?workspace=admin                    → AdminView (its own default tab)
 *   level  ?workspace=admin&id=<subject email> → that client's Admin context
 *   Choosing a client PUSHES a level; changing client within the level REPLACES
 *   it; clearing it (Admin's own Back) pops the level. Back at the root is Close,
 *   and Vision is exactly where it was.
 */

import React, { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { resolveAdminRouteAccess } from '@/lib/authz/adminAccess';
import WorkspaceSkeleton from '@/components/vision/workspace/WorkspaceSkeleton';

// The EXISTING Admin surface. Lazy so a denied actor never even downloads it.
const AdminView = lazy(() => import('@/pages/admin/AdminView'));

const ADMIN = 'admin';

/**
 * Denied — the fail-closed surface for a non-admin who hand-builds the URL.
 * It renders no Admin content and fetches nothing; leaving is the only action,
 * and it goes through the layer's own navigation.
 */
function Denied({ onLeave }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <ShieldAlert className="mx-auto h-6 w-6 text-white/30" />
        <p className="mt-4 font-display text-[18px] text-white/85">Not available</p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/45">
          Platform administration is limited to administrators on this account.
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.06] vision-focus"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function AdminWorkspaceHost({ payload, onOpen, onReplace, onBack }) {
  const { isAuthenticated, authChecked, isLoadingAuth, isLoadingProfile, supabaseProfile } = useAuth();

  const access = resolveAdminRouteAccess({
    isAuthenticated,
    authChecked,
    isLoadingAuth,
    isLoadingProfile,
    appRole: supabaseProfile?.app_role ?? null,
  });

  // The administrative subject travels as the workspace payload — the same
  // `id` slot the document overlay uses (`openDocument.js`). It is a TARGET
  // identifier: it selects who is being inspected and authorizes nothing.
  const subjectEmail = payload || null;
  const subjectRef = useRef(subjectEmail);
  useEffect(() => {
    subjectRef.current = subjectEmail;
  }, [subjectEmail]);

  /**
   * AdminView reports its subject selection here. The LAYER owns navigation, so
   * this only tells it which level the admin is now standing in.
   */
  const handleSubjectChange = useCallback(
    (next) => {
      const nextEmail = next?.email || null;
      const current = subjectRef.current;
      if (nextEmail === current) return;
      // Admin's own Back cleared the subject → step out of the subject level.
      if (!nextEmail) {
        onBack?.();
        return;
      }
      // Same level, different client → swap in place. First client → new level.
      if (current) onReplace?.(ADMIN, nextEmail);
      else onOpen?.(ADMIN, nextEmail);
    },
    [onBack, onOpen, onReplace]
  );

  // Never authorize or load early: the profile must have resolved first.
  if (access === 'wait') return <WorkspaceSkeleton label="Opening Admin" />;

  // Fail closed for everyone else — AdminView is not mounted and not loaded.
  if (access !== 'allow') return <Denied onLeave={onBack} />;

  return (
    <Suspense fallback={<WorkspaceSkeleton label="Opening Admin" />}>
      {/* Keyed on the subject so the URL is the single source of truth for which
          level is showing: a deep link, Back and a fresh selection all reconcile
          by mounting AdminView with the subject the URL names. AdminView's own
          logic, tabs and role filtering are untouched. */}
      <AdminView
        key={subjectEmail || 'root'}
        initialSubject={subjectEmail ? { email: subjectEmail } : null}
        onSubjectChange={handleSubjectChange}
      />
    </Suspense>
  );
}