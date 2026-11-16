/**
 * Business Context Engine
 *
 * Single authoritative source for:
 *  - active_business_id (from AuthContext activeContext)
 *  - profile_id (from Supabase profile)
 *  - guest_session_id (from anonymousSession)
 *
 * Every assessment save, dashboard query, document upload,
 * and engine invocation reads from here — never guesses.
 *
 * Internal architecture only. Zero user-facing complexity.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { getGuestSessionId } from '@/lib/anonymousSession';
import { base44 } from '@/api/base44Client';

// HMR-safe context: persist on globalThis so the context object survives
// Vite hot-module reloads. Without this, HMR recreates the context object
// while the old Provider still holds the previous reference, causing
// "useBusinessContext must be used within BusinessContextEngineProvider".
const BusinessContextEngineCtx = globalThis.__BusinessContextEngineCtx ??= createContext(null);

// All dashboard-related React Query keys — invalidated after any engine event
export const DASHBOARD_QUERY_KEYS = [
  'dashboardMetrics',
  'gapAnalyses',
  'businessAssessments',
  'latestMetricSnapshot',
  'assessmentSummary',
  'valueCreationSummary',
  'metricSnapshotsAll',
  'valueCreationEvents',
  'roadmapItems',
  'activeSprint',
  'business-intelligence-contract',
];

export function BusinessContextEngineProvider({ children }) {
  const { supabaseProfile, activeContext, allBusinesses, fetchSupabaseProfile } = useAuth();
  const queryClient = useQueryClient();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [lastRecalcAt, setLastRecalcAt] = useState(null);
  // bisVersion increments on every recalculation cycle — BIS consumers depend on this
  // to know when to rebuild. Included in React Query keys for automatic refetch.
  const [bisVersion, setBisVersion] = useState(0);
  // lastTriggeredBy records what triggered the most recent recalculation
  // (assessment, document, scenario, sprint, advisor, system). Passed to the
  // BIE engine via engineOpts so journal entries get accurate provenance.
  const [lastTriggeredBy, setLastTriggeredBy] = useState('system');

  // ── Canonical context object ───────────────────────────────────────────────
  const context = {
    profile_id:          supabaseProfile?.id || null,
    active_business_id:  activeContext?.businessId || supabaseProfile?.primary_business_id || null,
    guest_session_id:    getGuestSessionId(),
    is_guest:            !supabaseProfile,
  };

  // Keep a ref so triggerRecalculation always reads the latest context without stale closure
  const contextRef = useRef(context);
  useEffect(() => { contextRef.current = context; });

  // ── Invalidate all dashboard queries (triggers background refetch) ─────────
  const invalidateDashboard = useCallback(() => {
    DASHBOARD_QUERY_KEYS.forEach(key => {
      queryClient.invalidateQueries({ queryKey: [key], exact: false });
    });
  }, [queryClient]);

  // ── Event-driven recalculation ─────────────────────────────────────────────
  // Called after: assessment saved, document accepted, manual override, promotion
  // Architecture: Assessment Saved → Recalculate → Invalidate → BIS Version bump → Dashboard Refreshed
  // The `triggeredBy` parameter is mapped from the reason and passed to the BIE
  // engine so journal entries record accurate provenance.
  const TRIGGER_MAP = {
    assessment_completed: 'assessment',
    assessment_completed_base44_only: 'assessment',
    document_accepted: 'document',
    documents_accepted: 'document',
    scenario_saved: 'scenario',
    sprint_completed: 'sprint',
    sprint_task_completed: 'sprint',
    advisor_validated: 'advisor',
    advisor_review: 'advisor',
  };

  const triggerRecalculation = useCallback(async (reason = 'unknown', triggeredBy = null) => {
    const { profile_id, active_business_id } = contextRef.current;
    if (!profile_id && !active_business_id) return;
    // Resolve triggeredBy from explicit param or reason mapping
    const resolvedTrigger = triggeredBy || TRIGGER_MAP[reason] || 'system';
    setLastTriggeredBy(resolvedTrigger);
    setIsRecalculating(true);
    // Immediately bump version so consumers know a refresh is in flight
    setBisVersion(v => v + 1);
    try {
      // Fire CIQ regeneration (non-blocking)
      base44.functions.invoke('regenerateCiqMetrics', {
        businessId: active_business_id,
      }).catch(() => {}); // non-fatal

      // First invalidation wave — triggers background refetch of all dashboard queries
      invalidateDashboard();
      setLastRecalcAt(new Date().toISOString());

      // Wait for Supabase write + CIQ aggregation to settle, then refetch again
      // to catch any lagging writes. Shorter than before — the first wave already
      // starts the refetch; this second wave ensures consistency.
      await new Promise(r => setTimeout(r, 2500));
      invalidateDashboard();
      // Final version bump — signals all BIS consumers that fresh data is ready
      setBisVersion(v => v + 1);
    } finally {
      setIsRecalculating(false);
    }
  }, [invalidateDashboard]);

  // ── Business switch = full business-data reset (Phase 6.9) ─────────────────
  // `setActiveContext` updates the context and sessionStorage but invalidated
  // NOTHING, so any cache entry whose key omitted businessId kept serving the
  // previous business's payload after a switch. Keys are now business-aware;
  // this guarantees the invariant even for a key we might miss: every cached
  // query is dropped on switch, so no surface can render Business A's data
  // while Business B is active.
  const prevBusinessIdRef = useRef(undefined);
  useEffect(() => {
    const nextId = activeContext?.businessId || null;
    const prevId = prevBusinessIdRef.current;
    prevBusinessIdRef.current = nextId;
    // Skip the first run (initial resolution) — nothing business-scoped is cached yet.
    if (prevId === undefined || prevId === nextId) return;
    // Only INACTIVE queries are purged. By the time this effect runs the routed
    // surface has already remounted against the new business, so the outgoing
    // business's entries have no observers and are removed, while the incoming
    // business's in-flight fetches stay intact. An unfiltered removeQueries()
    // also destroyed the NEW business's queries mid-flight, leaving the page on
    // the previous render until a manual refresh reset the whole tree.
    queryClient.removeQueries({ type: 'inactive' });
  }, [activeContext?.businessId, queryClient]);

  // ── Reload businesses after Add Business ─────────────────────────────────
  const reloadBusinessContext = useCallback(async () => {
    await fetchSupabaseProfile();
    invalidateDashboard();
  }, [fetchSupabaseProfile, invalidateDashboard]);

  return (
    <BusinessContextEngineCtx.Provider value={{
      context,
      invalidateDashboard,
      triggerRecalculation,
      reloadBusinessContext,
      isRecalculating,
      lastRecalcAt,
      bisVersion,
      lastTriggeredBy,
    }}>
      {children}
    </BusinessContextEngineCtx.Provider>
  );
}

export function useBusinessContext() {
  const ctx = useContext(BusinessContextEngineCtx);
  if (!ctx) throw new Error('useBusinessContext must be used within BusinessContextEngineProvider');
  return ctx;
}