/**
 * useNotificationNavigation — where a notification click actually goes.
 *
 * ONE entry point for the whole notification system (see
 * @/lib/notifications/notificationDestination for the decision itself). It
 * reuses the canonical pieces rather than introducing new ones:
 *   · the canonical active business (AuthContext.activeContext / setActiveContext)
 *   · the document contract's own deep-link grammar (workspace=data-room&id=…)
 *   · react-router's navigate, exactly as the bell already did
 *
 * THE ORDER MATTERS (Part 8). A notice may belong to a business other than the
 * active one. The business is switched FIRST and allowed to resolve, and only
 * then is the document requested — so the document is never opened under the
 * outgoing business and no stale Business A data is briefly shown. `await` on
 * resolution, never primary_business_id, never a guess.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { resolveNotificationDestination, destinationUrl } from '@/lib/notifications/notificationDestination';

/**
 * Wait for the canonical context to actually report the target business.
 * The switch is a state update, so the resolution is observable — this is that
 * observation, with a ceiling so a click can never hang.
 */
function waitForBusiness(ref, targetId, { timeoutMs = 3000, intervalMs = 60 } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (ref.current === targetId) return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export function useNotificationNavigation() {
  const navigate = useNavigate();
  const { activeContext, setActiveContext, allBusinesses } = useAuth();

  const activeBusinessId = activeContext?.businessId || null;
  const activeRef = useRef(activeBusinessId);
  useEffect(() => { activeRef.current = activeBusinessId; }, [activeBusinessId]);

  const businessIds = activeContext?.businessIds || null;

  return useCallback(
    async (notification) => {
      const destination = resolveNotificationDestination(notification);

      if (destination.kind === 'document') {
        // A notice for another business: switch, resolve, THEN open. If the
        // business is not one this account holds, nothing is opened — the id is
        // never tried against the wrong business.
        if (destination.businessId && destination.businessId !== activeRef.current) {
          const known = (allBusinesses || []).some((b) => b.id === destination.businessId);
          if (!known) return { navigated: false, reason: 'business_unavailable' };

          setActiveContext({
            type: 'business',
            businessId: destination.businessId,
            businessIds,
          });
          const resolved = await waitForBusiness(activeRef, destination.businessId);
          if (!resolved) return { navigated: false, reason: 'switch_timeout' };
        }

        navigate(destinationUrl(destination));
        return { navigated: true, kind: 'document' };
      }

      if (destination.kind === 'path') {
        navigate(destination.path);
        return { navigated: true, kind: 'path' };
      }

      return { navigated: false, reason: 'no_destination' };
    },
    [navigate, setActiveContext, allBusinesses, businessIds]
  );
}