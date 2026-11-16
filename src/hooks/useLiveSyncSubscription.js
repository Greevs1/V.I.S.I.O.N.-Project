/**
 * useLiveSyncSubscription — Phase 14.3B
 *
 * React hook that subscribes to LiveSyncAction events for a specific
 * consumer + business. When a LIVE invalidate action arrives, the callback
 * is invoked so the consumer can invalidate its cache and re-read from
 * the canonical resolver.
 *
 * Pattern: Event → Invalidation → Consumer re-reads canonical fact
 * NOT: Event → push new value into consumer state
 *
 * The canonical resolver remains authoritative. This prevents duplicate truth.
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export function useLiveSyncSubscription(consumerId, businessId, onInvalidate) {
  const callbackRef = useRef(onInvalidate);
  useEffect(() => { callbackRef.current = onInvalidate; }, [onInvalidate]);

  useEffect(() => {
    if (!businessId || !consumerId) return;

    let active = true;

    // Subscribe to LiveSyncAction realtime events
    const unsubscribe = base44.entities.LiveSyncAction.subscribe(async (event) => {
      if (!active) return;
      const action = event.data;
      if (!action) return;

      // Filter: only process actions for this consumer + business
      if (action.consumer_id !== consumerId) return;
      if (action.business_id !== businessId) return;

      // Only process LIVE invalidate actions
      if (action.mode !== 'live') return;
      if (action.action_type !== 'invalidate') return;
      if (action.status !== 'pending') return;

      const startTime = Date.now();
      try {
        // Invoke the invalidation callback
        if (callbackRef.current) {
          await callbackRef.current(action);
        }

        // Mark action as completed
        await base44.entities.LiveSyncAction.update(action.id, {
          status: 'completed',
          refresh_duration_ms: Date.now() - startTime,
        });
      } catch (err) {
        // Mark action as failed — circuit breaker will record the failure
        await base44.entities.LiveSyncAction.update(action.id, {
          status: 'failed',
          error_class: err?.name || 'refresh_error',
          refresh_duration_ms: Date.now() - startTime,
        }).catch(() => {});
      }
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [consumerId, businessId]);
}