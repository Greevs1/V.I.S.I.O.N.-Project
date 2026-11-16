/**
 * useGalileoHome — the Phase 5.1 home experience hook.
 *
 * CONSUMES THE BUSINESS INTELLIGENCE CONTRACT as the authoritative read layer.
 *
 * Architecture:
 *   DATA SOURCES → BIS Contract → HomeContext → Resolvers → Galileo Home UI
 *
 * This hook:
 *   - Reads the active business_id from BusinessContext
 *   - Fetches the BIS contract via useBusinessIntelligenceContract
 *   - Loads scoped entities (sprints, galileo_opportunities) by business_id
 *   - Builds a unified HomeContext from all sources
 *   - Resolves Home mode (magic_loop vs galileo_home) from BIS intelligence
 *   - Resolves Next Best Move, signals, NOW, playbook from HomeContext
 *
 * Loading state: isResolving (while BIS loads) — does NOT flash Magic Loop.
 * Error state: bisError — shows retry, does NOT restart onboarding.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useBusinessContext } from '@/lib/BusinessContext';
import { useBusinessIntelligenceContract } from '@/hooks/useBusinessIntelligenceContract';
import { resolveHomeMode, resolveHomeMaturity, HomeMode } from '@/lib/galileo/homeContextResolver';
import { resolveNextBestMove, explainWhyThis, actionKey, orbStateForMove } from '@/lib/galileo/nextBestMoveResolver';
// The discovery the owner already saw, RE-DERIVED from canonical records — the
// canonical value gap the promotion wrote plus the constraint the canonical score
// supports. Never a copy of a guest tab's memory (§8, §15).
import { deriveDiscoveryContext } from '@/lib/galileo/valueContinuity';
// The anti-loop ledger: what the owner has already acted on (§12).
import { getHandledMoves, markMoveEngaged, dismissMove } from '@/lib/galileo/handledMoves';
import { getPrimaryGoal, formatGoalBadge, getGoals, saveGoal, parseGoalFromText } from '@/lib/galileo/goalIntelligence';
import { loadPlaybook, getPlaybookSummary } from '@/lib/galileo/playbookStore';
import { buildDomainFocus, Domain } from '@/lib/galileo/domainFocus';
import { resolvePulseLens } from '@/lib/galileo/pulseLens';
import { getRecentActivities, summarizeActivities } from '@/lib/galileo/galileoActivity';
import { getSavedItems } from '@/lib/galileo/saveManager';
import { selectNowItem } from '@/lib/galileo/nowSurface';
import { computeHomeSignalStates } from '@/lib/galileo/homeSignals';
import { buildHomeContext } from '@/lib/galileo/homeContext';
import { inferMode } from '@/lib/galileo/experienceStateMachine';
import { callDocumentAssignments } from '@/lib/documentAssignments';

export function useGalileoHome() {
  // ── Business context (active business, BIS version) ──────────────────
  const { context: bizContext, bisVersion } = useBusinessContext();
  const activeBusinessId = bizContext?.active_business_id || null;

  // ── BIS contract (authoritative intelligence) ────────────────────────
  const {
    data: contract,
    isLoading: bisLoading,
    isError: bisIsError,
    error: bisErrorDetail,
    refetch: refetchBis,
  } = useBusinessIntelligenceContract(activeBusinessId, bisVersion);

  // ── Auth state ────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // ── Entity state (scoped by business_id) ─────────────────────────────
  const [sprints, setSprints] = useState([]);
  const [galileoOpportunities, setGalileoOpportunities] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [savedPlaybooks, setSavedPlaybooks] = useState([]);
  // Document assignments waiting on ME in the active business — one more real
  // candidate source for the Next Best Move (§22), read from the assignment
  // contract rather than assembled here.
  const [documentAssignments, setDocumentAssignments] = useState([]);
  const [workVersion, setWorkVersion] = useState(0);
  const [goals, setGoals] = useState([]);
  const [lastVisitDate, setLastVisitDate] = useState(null);
  // The handled-move ledger for THIS business (focus state, not business truth).
  const [handledMoves, setHandledMoves] = useState([]);

  // ── UI state ──────────────────────────────────────────────────────────
  const [activeDomain, setActiveDomain] = useState(null);
  const [domainFocus, setDomainFocus] = useState(null);
  /**
   * The active Pulse LENS. Selecting a signal expresses "look at Value" — it
   * never carries a figure — so the lens is resolved here from the canonical
   * signal layer already on screen and unfolds INLINE on Home, with the Pulse
   * still visible as navigation. The deeper DomainFocus surface stays one
   * explicit step away rather than being the default.
   */
  const [lens, setLens] = useState(null);
  const [playbook, setPlaybook] = useState(null);
  const [showWhyThis, setShowWhyThis] = useState(false);
  const [homeView, setHomeView] = useState('home');

  // ── Auth check (runs once) ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authed = await base44.auth.isAuthenticated();
        if (cancelled) return;
        setIsAuthenticated(authed);
        if (authed) {
          const lastVisit = localStorage.getItem('vision_galileo_last_visit');
          if (lastVisit) setLastVisitDate(lastVisit);
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Business-scoped local state, re-read on every business change ──────
  // These were previously read inside the mount-only auth effect above, which
  // captured activeBusinessId at mount. After a switch the hook kept serving
  // Business A's goals and saved items under Business B. This hook also runs
  // outside AppLayout (the /galileo route), so it cannot rely on the remount
  // boundary and must depend on the business itself.
  useEffect(() => {
    if (!isAuthenticated || !activeBusinessId) {
      setGoals([]);
      setSavedItems([]);
      setHandledMoves([]);
      return;
    }
    // Phase 6A: Business-scoped storage prevents cross-business goal/saved leakage
    setGoals(getGoals(activeBusinessId));
    setSavedItems(getSavedItems(activeBusinessId));
    setHandledMoves(getHandledMoves(activeBusinessId));
  }, [isAuthenticated, activeBusinessId]);

  // ── Load scoped entities when authenticated + business_id exists ──────
  useEffect(() => {
    if (!isAuthenticated || !activeBusinessId) {
      setSprints([]);
      setGalileoOpportunities([]);
      setSavedPlaybooks([]);
      setDocumentAssignments([]);
      return;
    }

    // Clear stale entities from previous business BEFORE fetching new ones.
    // Without this, switching from Business A → B briefly renders B's BIS
    // contract with A's opportunities (cross-business data leakage).
    setSprints([]);
    setGalileoOpportunities([]);
    setSavedPlaybooks([]);
    setDocumentAssignments([]);

    let cancelled = false;
    (async () => {
      try {
        // ── The REAL 90-Day Sprint ─────────────────────────────────────────
        // The execution system of record is Supabase `ninety_day_sprint_paths`,
        // served by the ninetyDaySprint function — the same read the Sprint
        // workspace itself uses. This previously read the legacy Base44
        // NinetyDaySprint entity, whose records carry no business_id, so a
        // business-scoped filter on it always came back empty: Home, Playbook
        // and Next Best Move never saw the Sprint the owner was actually running.
        let sprintData = [];
        try {
          const res = await base44.functions.invoke('ninetyDaySprint', {
            action: 'getSprint',
            active_business_id: activeBusinessId,
          });
          const row = res?.data?.sprint;
          if (row) sprintData = [{ ...row, status: row.status || 'active' }];
        } catch { /* non-fatal */ }
        if (!cancelled) setSprints(sprintData);

        // ── Saved strategies and scenarios (persisted, business-scoped) ───
        let playbookRows = [];
        try {
          const res = await base44.functions.invoke('savedPlaybookData', {
            action: 'getSavedPlaybooks',
            data: { active_business_id: activeBusinessId },
          });
          playbookRows = res?.data?.playbooks || [];
        } catch { /* non-fatal */ }
        if (!cancelled) setSavedPlaybooks(playbookRows);

        // galileo_opportunities scoped by business_id
        let oppData = [];
        try {
          oppData = await base44.entities.galileo_opportunities.filter(
            { business_id: activeBusinessId },
            '-created_date',
            20
          );
        } catch { /* non-fatal — entity may not have data */ }
        if (!cancelled) setGalileoOpportunities(oppData || []);

        // ── What is waiting on ME, in this business ─────────────────────────
        // The same authoritative contract the Data Room and Galileo use: the
        // backend resolves the active business, proves the actor, and returns
        // only this business's assignments, decorated with the real document and
        // the real assigner. Nothing is joined or filtered on the client, so an
        // assignment can never leak across businesses (§30).
        let assignmentRows = [];
        try {
          const res = await callDocumentAssignments('listMine', {
            active_business_id: activeBusinessId,
          });
          assignmentRows = res?.assignments || [];
        } catch { /* non-fatal — one candidate source, never a gate */ }
        if (!cancelled) setDocumentAssignments(assignmentRows);
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, activeBusinessId, workVersion]);

  // Re-read the Sprint and saved playbooks after Vision changes them (a Sprint
  // was built, a scenario was saved), so the surfaces reflect it immediately.
  const reloadWork = useCallback(() => setWorkVersion((v) => v + 1), []);

  // ── Build HomeContext from BIS + entities ─────────────────────────────
  const homeContext = useMemo(() => {
    return buildHomeContext({
      contract,
      sprints,
      galileoOpportunities,
      goals,
      savedItems,
      lastVisitDate,
    });
  }, [contract, sprints, galileoOpportunities, goals, savedItems, lastVisitDate]);

  // ── Resolve home mode from BIS intelligence ──────────────────────────
  const homeMode = useMemo(() => {
    // Not authenticated → Magic Loop immediately (no BIS needed)
    if (!isAuthenticated) {
      return { mode: HomeMode.MAGIC_LOOP, reason: 'anonymous_guest' };
    }

    // Authenticated but BIS still loading → resolving (not Magic Loop, not Home)
    if (bisLoading && !contract) {
      return { mode: null, reason: 'resolving' };
    }

    // BIS error → error state (not Magic Loop, not Home)
    if (bisIsError) {
      return { mode: null, reason: 'bis_error' };
    }

    // BIS loaded — check intelligence
    return resolveHomeMode({
      isAuthenticated,
      hasIntelligence: homeContext.hasIntelligence,
      hasFinancials: homeContext.hasFinancials,
      hasOpportunities: homeContext.opportunities.length > 0,
      hasActiveSprints: homeContext.plays.length > 0,
    });
  }, [isAuthenticated, bisLoading, contract, bisIsError, homeContext]);

  // ── Loading state (for UI) ───────────────────────────────────────────
  const isResolving = isAuthenticated && !authChecked
    ? true
    : (isAuthenticated && bisLoading && !contract)
    ? true
    : false;

  // ── Error state ──────────────────────────────────────────────────────
  const bisError = isAuthenticated && bisIsError ? bisErrorDetail : null;

  // ── Resolve maturity ─────────────────────────────────────────────────
  const maturity = useMemo(() => {
    return resolveHomeMaturity({
      modelCompleteness: homeContext.modelCompleteness,
      hasFinancials: homeContext.hasFinancials,
      hasActiveSprints: homeContext.plays.length > 0,
      hasGoals: goals.length > 0,
      hasValuation: homeContext.valuation?.currentValue != null,
    });
  }, [homeContext, goals]);

  // ── Resolve inferred mode (create/produce) ──────────────────────────
  const inferredMode = useMemo(() => {
    return inferMode({
      state: homeContext.plays.length > 0 ? 'produce' : 'create',
      implementationChoice: homeContext.plays.length > 0 ? 'guide_me' : null,
      activeSprints: homeContext.plays.length,
    });
  }, [homeContext]);

  // ── Signal states (from BIS) ─────────────────────────────────────────
  const signalStates = useMemo(() => {
    return computeHomeSignalStates(homeContext.signals, activeDomain);
  }, [homeContext, activeDomain]);

  // ── Next Best Move (with real candidate sources) ─────────────────────
  // ── The discovery already found, re-derived from canonical state ────────
  // This is what stops authenticated Home from announcing that it is "still
  // building an understanding of your business" to an owner who just watched it
  // find a value gap. It reads ONLY canonical values, and returns null when there
  // is nothing canonical to stand on (§8, §15).
  const discoveries = useMemo(() => deriveDiscoveryContext(homeContext), [homeContext]);

  // ── Next Best Move (with real candidate sources) ─────────────────────
  // businessId         so a candidate from another business can never be offered
  // discoveries        the preserved value gap + constraint (derived, never copied)
  // hasFinancials      real state — decides whether a financials gap is worth raising
  // handledMoves       the anti-loop ledger (§12, §N8, §N9)
  // knowledgeGaps      deliberately empty: the Knowledge Gap Engine owns questions,
  //                    and Home does not load conversation answers, so no question
  //                    is invented here (an honest gap in coverage, not a fake one).
  const computedNbm = useMemo(() => {
    if (homeMode?.mode !== HomeMode.GALILEO_HOME) return null;

    return resolveNextBestMove({
      businessId: activeBusinessId,
      activeSprints: homeContext.plays,
      sprintBlockers: extractSprintBlockers(homeContext.plays),
      opportunities: homeContext.opportunities,
      goals,
      maturity: maturity.stage,
      recentChanges: homeContext.recentChanges,
      hasFinancials: homeContext.hasFinancials,
      documentAssignments,
      discoveries,
      handledMoves,
      knowledgeGaps: [],
    });
  }, [homeMode, homeContext, goals, maturity, documentAssignments, discoveries, handledMoves, activeBusinessId]);

  // ── NBM override (for "Show me something else") ──────────────────────
  const [nbmOverride, setNbmOverride] = useState(null);

  // Reset override when computed NBM changes
  useEffect(() => {
    setNbmOverride(null);
  }, [computedNbm]);

  const nextBestMove = nbmOverride || computedNbm;

  // ── NOW item (with BIS-based change detection) ───────────────────────
  const nowItem = useMemo(() => {
    if (homeMode?.mode !== HomeMode.GALILEO_HOME) return null;

    return selectNowItem({
      model: { opportunities: homeContext.opportunities, signals: homeContext.signals },
      flowState: 'home',
      savedCount: savedItems.length,
      isAuthenticated: true,
      isReturningUser: true,
      activeSprints: homeContext.plays.length,
      recentChanges: homeContext.recentChanges,
    });
  }, [homeMode, homeContext, savedItems]);

  // ── Playbook ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (homeMode?.mode !== HomeMode.GALILEO_HOME) {
      setPlaybook(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const pb = await loadPlaybook({
        opportunities: homeContext.opportunities,
        sprints: homeContext.plays,
        savedItems,
        savedPlaybooks,
      });
      if (!cancelled) setPlaybook(pb);
    })();
    return () => { cancelled = true; };
  }, [homeMode, homeContext, savedItems, savedPlaybooks]);

  // ── Activity summary ─────────────────────────────────────────────────
  const recentActivities = useMemo(() => {
    if (homeMode?.mode !== HomeMode.GALILEO_HOME) return [];
    return getRecentActivities({
      recentDocuments: homeContext.evidence.documents,
      recentValuations: [],
      recentOpportunities: homeContext.opportunities,
      recentSprintProgress: homeContext.plays,
      lastVisitDate,
    });
  }, [homeMode, homeContext, lastVisitDate]);

  const activitySummary = useMemo(() => summarizeActivities(recentActivities), [recentActivities]);

  // ── Update last visit on Home render ─────────────────────────────────
  useEffect(() => {
    if (homeMode?.mode === HomeMode.GALILEO_HOME) {
      localStorage.setItem('vision_galileo_last_visit', new Date().toISOString());
    }
  }, [homeMode]);

  // ── Pulse lens (the Pulse as Galileo's six lenses) ───────────────────
  // One click, one intent: "LOOK AT VALUE". The lens is derived from the
  // canonical signal layer that Home already resolved — the browser contributes
  // the domain and nothing else. `homeView` deliberately stays 'home', so the
  // intelligence unfolds where the owner already is and the Pulse stays visible.
  const handleDomainClick = useCallback((domain) => {
    setActiveDomain(domain);
    setHomeView('home');
    setLens(resolvePulseLens({
      domain,
      signals: homeContext.signals,
      // With the domain passed in, the selected signal resolves to ACTIVE —
      // the same state contract the tiles use, not a second signal model.
      signalStates: computeHomeSignalStates(homeContext.signals, domain),
      opportunities: homeContext.opportunities,
      implementationExists: homeContext.plays.length > 0,
      // Relationship truth only. Entitlement is resolved in the action layer
      // (resolveImplementationAccess), never here.
      advisorConnected: false,
    }));
    // The deeper surface stays available — it is the explicit "everything in
    // this area" step, not the destination of a Pulse click.
    const focus = buildDomainFocus(domain, homeContext, {
      opportunities: homeContext.opportunities,
      sprints: homeContext.plays,
    });
    setDomainFocus(focus);
  }, [homeContext]);

  const handleLensClose = useCallback(() => {
    setLens(null);
    setActiveDomain(null);
  }, []);

  const handleDomainClose = useCallback(() => {
    setActiveDomain(null);
    setDomainFocus(null);
    setLens(null);
    setHomeView('home');
  }, []);

  /**
   * The explicit deeper step: everything Galileo currently holds on the focused
   * area. A Pulse click no longer lands here by default — it is the deliberate
   * "show me more" step, so the domain surface is deepened rather than bypassed.
   */
  const openDomainDetail = useCallback(() => {
    if (!activeDomain) return;
    setHomeView('domain');
  }, [activeDomain]);

  // ── Goal management ──────────────────────────────────────────────────
  const handleGoalInput = useCallback((text) => {
    const parsed = parseGoalFromText(text);
    if (parsed) {
      // Phase 6A: Business-scoped goal storage
      const updated = saveGoal(parsed, activeBusinessId);
      setGoals(updated);
      return true;
    }
    return false;
  }, [activeBusinessId]);

  // ── Next Best Move actions ────────────────────────────────────────────
  // ACTING ON SOMETHING MOVES THE FOCUS (§12). The move the owner just acted on is
  // recorded as ENGAGED — it stays reachable among the alternatives, but it can no
  // longer keep being the hero, which is how "Investigate owner dependency" stops
  // being handed back after the owner has already opened it. A move that is
  // genuinely FINISHED disappears on its own, because the object behind it moves on.
  const recordEngagement = useCallback((actionValue) => {
    const key = actionKey(actionValue);
    markMoveEngaged(key, activeBusinessId);
    setHandledMoves(getHandledMoves(activeBusinessId));
  }, [activeBusinessId]);

  const handleMoveAction = useCallback((actionValue) => {
    recordEngagement(actionValue);
    if (actionValue?.type === 'opportunity' || actionValue?.type === 'goal_aligned') {
      setHomeView('playbook');
    } else if (actionValue?.type === 'sprint_blocker' || actionValue?.type === 'sprint') {
      setHomeView('playbook');
    } else if (actionValue?.type === 'financial_change' || actionValue?.type === 'new_document') {
      handleDomainClick(Domain.PROFIT);
    } else if (actionValue?.type === 'value_gap') {
      // The preserved discovery opens the value domain — an existing destination.
      handleDomainClick(actionValue.domain || Domain.VALUE);
    } else if (actionValue?.type === 'connect_source') {
      setHomeView('connections');
    }
  }, [handleDomainClick, recordEngagement]);

  // Dismissal is the owner saying no. It is recorded, so it is not asked again.
  const dismissNextAction = useCallback(() => {
    const key = computedNbm?.primary?.key;
    if (!key) return;
    dismissMove(key, activeBusinessId);
    setHandledMoves(getHandledMoves(activeBusinessId));
  }, [computedNbm, activeBusinessId]);

  const handleWhyThis = useCallback(() => {
    setShowWhyThis((s) => !s);
  }, []);

  const handleShowAlternative = useCallback(() => {
    if (!computedNbm?.alternatives?.length) return;
    const alts = computedNbm.alternatives;
    const newPrimary = alts[0];
    const remaining = alts.slice(1);
    const oldPrimary = computedNbm.primary;
    setNbmOverride({
      primary: newPrimary,
      alternatives: [...remaining, oldPrimary].slice(0, 3),
      reasoning: newPrimary.reason,
    });
    setShowWhyThis(false);
  }, [computedNbm]);

  // ── Utility dock actions ─────────────────────────────────────────────
  const handleUtilityAction = useCallback((utility) => {
    setHomeView(utility);
  }, []);

  // ── Reset domain/view state when active business changes ──────────────
  // Prevents stale domain focus from Business A appearing under Business B.
  //
  // Fires only on a move from ONE REAL BUSINESS to A DIFFERENT ONE. The id is
  // transiently null while the profile re-resolves, and resetting the view on
  // that blip evicted the owner from the surface they were working in: an
  // in-flight What If scenario was destroyed when the view snapped back to
  // Home. A to B isolation is unchanged.
  const prevHomeBusinessRef = useRef(null);
  useEffect(() => {
    const nextId = activeBusinessId || null;
    const prevId = prevHomeBusinessRef.current;
    prevHomeBusinessRef.current = nextId;
    if (!nextId || !prevId || prevId === nextId) return;

    setActiveDomain(null);
    setDomainFocus(null);
    // A lens belongs to the business it was opened on. Switching business must
    // never leave the previous business's area focused (S10).
    setLens(null);
    setHomeView('home');
  }, [activeBusinessId]);

  // ── BIS retry ─────────────────────────────────────────────────────────
  const handleRetryBis = useCallback(() => {
    refetchBis();
  }, [refetchBis]);

  // ── Playbook summary ─────────────────────────────────────────────────
  const playbookSummary = useMemo(() => getPlaybookSummary(playbook), [playbook]);

  // ── Goal badge ──────────────────────────────────────────────────────
  const goalBadge = useMemo(() => formatGoalBadge(getPrimaryGoal(activeBusinessId)), [goals, activeBusinessId]);

  return {
    // Mode
    homeMode,
    maturity,
    inferredMode,
    isResolving,
    isAuthenticated,
    bisError,
    handleRetryBis,

    // Business intelligence (from HomeContext)
    businessModel: homeContext, // keep name for component compatibility
    business: homeContext.business,
    opportunities: homeContext.opportunities,
    sprints: homeContext.plays,
    savedItems,
    savedPlaybooks,
    reloadWork,
    goals,
    goalBadge,
    contract: homeContext.contract,

    // Next Best Move
    nextBestMove,
    showWhyThis,
    handleMoveAction,
    handleWhyThis,
    handleShowAlternative,
    // The orb's state for the current move, from reality (§14). 'discovery' is
    // deliberately NOT reachable here: a discovery is an event, and re-playing it
    // every time Home loads would be a fabrication.
    nextActionOrbState: orbStateForMove(nextBestMove?.primary),
    // The discovery already found, re-derived from canonical records (§8).
    discoveries,
    dismissNextAction,
    // Exposed so the shared action router can record engagement for the action it
    // is about to route.
    markMoveHandled: recordEngagement,
    explainWhyThis: () => nextBestMove?.primary ? explainWhyThis(nextBestMove.primary) : null,

    // Pulse lens + domain focus
    activeDomain,
    lens,
    domainFocus,
    handleDomainClick,
    handleLensClose,
    openDomainDetail,
    handleDomainClose,

    // Signal states
    signalStates,

    // Playbook
    playbook,
    playbookSummary,

    // Activity
    activitySummary,
    recentActivities,

    // NOW
    nowItem,

    // Home view
    homeView,
    setHomeView,
    handleUtilityAction,

    // Goal input
    handleGoalInput,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function extractSprintBlockers(plays) {
  return plays
    .filter((p) => p.needsExpertReview || p.verificationStatus === 'expert_changes_requested')
    .map((p) => ({
      id: p.id,
      title: `${p.title} needs review`,
      subtitle: 'A decision is blocking progress',
      actionLabel: 'Review decision',
      reason: 'This blocks an active Play from progressing',
      impact: null,
    }));
}