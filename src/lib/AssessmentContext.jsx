import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { buildGalileoContext } from './assessmentCalculations';
import { MARGIN_METRIC, MARGIN_PROVENANCE } from './profitSemantics';
// Business Context Engine — provides active_business_id for all saves
import { useBusinessContext } from '@/lib/BusinessContext';
import { useToast } from '@/components/ui/use-toast';

// Storage key is namespaced by user ID *and business ID*.
//
// Phase 6.9 — this was namespaced by user only, so answers entered under
// Business A were cached and then reused as the input state for Business B (and
// could be SAVED under B, because saveAssessmentToDB writes with the active
// business).
//
// Legacy user-only keys (`cii_assessment_state_v2_<userId>`) are treated as
// AMBIGUOUS and deliberately NOT read: their business provenance is unknown, so
// attaching them to whichever business happens to be selected would fabricate an
// association. They are left untouched for a bounded historical decision.
//
// Guests keep a single session key — they have exactly one in-progress model.
const getStorageKey = (userId, businessId) =>
  userId
    ? `cii_assessment_state_v2_${userId}_${businessId || 'no-business'}`
    : 'cii_assessment_state_v2_guest';

export const INITIAL_STATE = {
  // Meta
  industry: '',
  assessment_ids: {},
  _profit_benchmark: null,
  _value_benchmark: null,
  _selected_mult: null,

  // Profit Gap
  p1_rev: 2000000,
  p1_mymargin: 0,
  p1_avg: 18,
  p1_top: 28,

  // Value Gap
  v2_ebitda: 0,
  v2_mult: 4,
  v2_mult_top: 9.5,
  v2_strat: 40,
  v2_avg_ebitda: 0,

  // Recast EBITDA
  rc_ebitda: 0,
  rc_addbacks: {},

  // Tax Gap
  t3_agi: 0,
  t3_entity: 'sole_prop',
  t3_kids: 0,
  t3_prop: 'no',
  t3_rd: 'no',
  t3_hsa: 'no',
  t3_ret: 'no',
  t3_home_office: 'no',
  t3_vehicle: 'no',
  t3_ptet: 'no',
  t3_annual_gap: null,
  t3_strategies: [],

  // Operations Gap
  o4_scores: [3, 3, 3, 3, 3, 3],
  o4_hrs: 50,
  o4_takehome: 0,

  // Freedom Assessment
  f_unplugged_days: 14,
  f_run_without_you: 'no',
  f_household_expenses: 10000,
  f_net_worth: 500000,
  f_desired_income: 20000,
  f_desired_hours: 20,
  f_stress_level: 7,
  f_vacation_ability: '',
  f_priorities: '',
  f_desired_retirement_income: 15000,
  f_desired_date: '2030-01-01',
  f_exit_timeline: 5,
  f_exit_type: 'sell',
  f_risk_tolerance: 5,
};

// HMR-safe context: persist on globalThis so the context object survives
// Vite hot-module reloads. Without this, HMR recreates the context object
// while the old Provider still holds the previous reference, causing
// "useAssessment must be used within AssessmentProvider".
const AssessmentContext = globalThis.__AssessmentContext ??= createContext(undefined);

export function AssessmentProvider({ children }) {
  // Business Context Engine — active_business_id always explicit
  const { context: bizCtx, triggerRecalculation } = useBusinessContext();
  // Toast for user-facing persistence failure notifications
  const { toast } = useToast();

  // Load user ID synchronously from base44 token if available
  const [userId, setUserId] = useState(() => {
    try {
      // Read cached user id from sessionStorage to avoid async delay on first render
      return sessionStorage.getItem('cii_current_user_id') || null;
    } catch { return null; }
  });

  // Resolve actual user id after mount
  useEffect(() => {
    base44.auth.me().then(u => {
      if (u?.id) {
        sessionStorage.setItem('cii_current_user_id', u.id);
        setUserId(u.id);
      }
    }).catch(() => {});
  }, []);

  // ── Phase 6.9 — assessment state is BUSINESS-scoped ───────────────────────
  const activeBusinessId = bizCtx.active_business_id || null;
  const storageKey = getStorageKey(userId, activeBusinessId);

  const [state, setState] = useState(INITIAL_STATE);

  // Load — or reset — on ANY change of user or business. Switching business must
  // present that business's own state immediately; it must never carry the
  // previous business's answers across, not even briefly. Persistence is handled
  // in updateState below (writing only state we just derived), which is what
  // prevents a fresh mount from clobbering stored answers with defaults.
  useEffect(() => {
    if (!userId) return;
    try {
      const saved = localStorage.getItem(storageKey);
      setState(saved ? { ...INITIAL_STATE, ...JSON.parse(saved) } : INITIAL_STATE);
    } catch {
      setState(INITIAL_STATE);
    }
  }, [userId, storageKey]);

  const updateState = (updates) => {
    setState(prev => {
      const next = { ...prev, ...updates };

      // ── EBITDA ESTIMATE from the net profit margin (Phase 6B.1) ────────────
      //
      // p1_mymargin is a NET PROFIT margin — the Profit Gap question asks for
      // "Your Current Net Profit Margin". EBITDA is structurally HIGHER than net
      // income (it adds back interest, tax and depreciation), so multiplying
      // revenue by a net margin UNDERSTATES EBITDA. It is a usable starting
      // estimate, never a verified figure.
      //
      // The value is therefore tagged with its provenance so nothing downstream
      // — BIS, the Executive Brief, or a future Digital Twin — can mistake an
      // estimate for a measured fact.
      const rev = updates.p1_rev !== undefined ? updates.p1_rev : prev.p1_rev;
      const margin = updates.p1_mymargin !== undefined ? updates.p1_mymargin : prev.p1_mymargin;
      if (updates.p1_rev !== undefined || updates.p1_mymargin !== undefined) {
        const estimated = Math.round((rev * margin) / 100);
        next.v2_avg_ebitda = estimated;
        if (updates.v2_ebitda === undefined) {
          next.v2_ebitda = estimated;
          next.v2_ebitda_provenance = MARGIN_PROVENANCE.ESTIMATED_FROM_NET_PROFIT;
        }
        if (prev.rc_ebitda === 0 && updates.rc_ebitda === undefined) {
          next.rc_ebitda = estimated;
          next.rc_ebitda_provenance = MARGIN_PROVENANCE.ESTIMATED_FROM_NET_PROFIT;
        }
      }
      // An explicitly entered EBITDA is the real thing — record that too.
      if (updates.v2_ebitda !== undefined && updates.v2_ebitda > 0) {
        next.v2_ebitda_provenance = MARGIN_PROVENANCE.VERIFIED;
      }
      // The margin's own type is now explicit rather than assumed by the reader.
      next.p1_mymargin_type = MARGIN_METRIC.NET_PROFIT_MARGIN;
      next.p1_mymargin_provenance = MARGIN_PROVENANCE.VERIFIED;

      // Persist the exact state we just derived, under the current user+business
      // key. Writing here (rather than in a broad effect) means the stored value is
      // always state that belongs to THIS key — never a default left over from a
      // mount, and never the previous business's answers.
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch { /* non-fatal */ }

      return next;
    });
  };

  /**
   * Persist a completed assessment.
   *
   * SUPABASE SINGLE SOURCE OF TRUTH (Phase A Migration):
   *   Supabase is the AUTHORITATIVE persistence layer.
   *   Base44 Assessment entity is a LEGACY MIRROR — write is best-effort,
   *   failure does NOT block recalculation or affect Dashboard/BIE/BIS/Brief.
   *
   * Recalculation fires when SUPABASE succeeds (the authoritative store).
   * Base44 failure is logged but non-blocking.
   *
   * Persistence states:
   *   FULL_SUCCESS     — Supabase succeeded (Base44 may or may not have succeeded)
   *   FAILURE          — Supabase failed (authoritative store unavailable)
   */
  const saveAssessmentToDB = async (type, answers, results) => {
    const businessId = bizCtx.active_business_id || null;
    const now = new Date().toISOString();

    const logTag = `[AssessmentContext] ${type} biz=${businessId ? businessId.slice(0, 8) : 'null'}`;
    const log = (msg, data) => console.log(`${logTag}: ${msg}`, data || '');

    // ── 1. SUPABASE SAVE (AUTHORITATIVE) ────────────────────────────────────
    // This is the system of record. Recalculation depends on this succeeding.
    let supabaseSuccess = false;
    let supabaseError = null;
    try {
      await base44.functions.invoke('saveAssessmentToSupabase', {
        assessmentType: type,
        answers,
        results,
        activeBusinessId: businessId,
        state: {
          industry:       state.industry,
          p1_rev:         state.p1_rev,
          p1_mymargin:    state.p1_mymargin,
          p1_avg:         state.p1_avg,
          p1_top:         state.p1_top,
          v2_ebitda:      state.v2_ebitda,
          v2_mult:        state.v2_mult,
          v2_mult_top:    state.v2_mult_top,
          rc_ebitda:      state.rc_ebitda,
          rc_addbacks:    state.rc_addbacks,
          t3_agi:         state.t3_agi,
          t3_entity:      state.t3_entity,
          t3_kids:        state.t3_kids,
          t3_annual_gap:  state.t3_annual_gap,
          t3_strategies:  state.t3_strategies,
          o4_scores:      state.o4_scores,
          o4_hrs:         state.o4_hrs,
          o4_takehome:    state.o4_takehome,
          f_unplugged_days:         state.f_unplugged_days,
          f_run_without_you:        state.f_run_without_you,
          f_stress_level:           state.f_stress_level,
          f_household_expenses:     state.f_household_expenses,
          f_desired_income:         state.f_desired_income,
          f_net_worth:              state.f_net_worth,
          f_desired_hours:          state.f_desired_hours,
          f_exit_timeline:          state.f_exit_timeline,
          f_exit_type:              state.f_exit_type,
          f_risk_tolerance:         state.f_risk_tolerance,
          f_desired_retirement_income: state.f_desired_retirement_income,
        },
      });
      supabaseSuccess = true;
      log('Supabase save succeeded (AUTHORITATIVE)');
    } catch (sbErr) {
      supabaseError = sbErr;
      log(`Supabase save FAILED (authoritative): ${sbErr?.message || sbErr}`);
    }

    // ── 2. BASE44 ASSESSMENT — FROZEN (Phase C.1) ─────────────────────────────
    // Base44 Assessment entity is retired as a persistent authority.
    // Supabase is the sole authoritative store. No Base44 mirror write.
    // Historical records are preserved read-only.
    log('Base44 Assessment write skipped (frozen — Supabase is sole authority)');

    // ── 3. DETERMINE PERSISTENCE STATE ───────────────────────────────────────
    const persistenceState = supabaseSuccess ? 'FULL_SUCCESS' : 'FAILURE';

    log(`final state: ${persistenceState}`, {
      supabase: { success: supabaseSuccess },
      base44: { skipped: true, frozen: true },
    });

    // ── 4. RECALCULATION — fires when SUPABASE (authoritative) succeeds ──────
    if (supabaseSuccess) {
      triggerRecalculation('assessment_completed', 'assessment');
    }

    // ── 5. USER-FACING NOTIFICATION ──────────────────────────────────────────
    if (!supabaseSuccess) {
      toast({
        title: 'Assessment save failed',
        description: 'We could not save your assessment results. Please try again.',
        variant: 'destructive',
      });
    }

    return {
      state: persistenceState,
      supabaseResult: { success: supabaseSuccess, error: supabaseError },
      base44Result: { skipped: true, frozen: true },
      assessmentType: type,
      businessId,
    };
  };

  /** Returns the full structured context object for Galileo */
  const getGalileoContext = () => buildGalileoContext(state);

  return (
    <AssessmentContext.Provider value={{ state, updateState, saveAssessmentToDB, getGalileoContext }}>
      {children}
    </AssessmentContext.Provider>
  );
}

export function useAssessment() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) throw new Error('useAssessment must be used within AssessmentProvider');
  return ctx;
}