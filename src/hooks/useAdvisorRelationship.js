/**
 * useAdvisorRelationship — resolves the REAL advisor/expert relationship for
 * the active business, so the team path can name the person the owner actually
 * has instead of pretending everyone is a new prospect.
 *
 * AUTHORITY
 * The relationship is resolved server-side by the existing expertAdvisorAccess
 * function (action `getMyAdvisor`), which derives its subject from the
 * AUTHENTICATED session and never from the request body. A client therefore
 * cannot ask about anyone else's advisor.
 *
 * SCOPE
 * Keyed on the active business_id, so switching business re-resolves and the
 * previous business's advisor can never render under the incoming one.
 */

import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const NONE = { loading: false, connected: false, advisor: null, source: null };

export function useAdvisorRelationship(businessId) {
  const [state, setState] = useState(NONE);

  useEffect(() => {
    if (!businessId) {
      setState(NONE);
      return;
    }

    let cancelled = false;
    setState({ loading: true, connected: false, advisor: null, source: null });

    (async () => {
      try {
        const res = await base44.functions.invoke('expertAdvisorAccess', {
          action: 'getMyAdvisor',
          business_id: businessId,
        });
        if (cancelled) return;
        const advisor = res?.data?.advisor || null;
        setState({
          loading: false,
          connected: !!advisor,
          advisor,
          source: res?.data?.source || null,
        });
      } catch {
        // A resolver failure must never block the surface. It degrades to
        // "no relationship known", which renders the honest non-connected state.
        if (!cancelled) setState(NONE);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  return state;
}