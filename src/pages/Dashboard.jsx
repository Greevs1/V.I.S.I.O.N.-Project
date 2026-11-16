import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import OnboardingProgress from '@/components/dashboard/OnboardingProgress';
import HistoricalChart from '@/components/dashboard/HistoricalChart';
import ValueCreatedCards from '@/components/dashboard/ValueCreatedCards';
import BusinessImpactScore from '@/components/dashboard/BusinessImpactScore';
import FinancialSnapshotCard from '@/components/dashboard/FinancialSnapshotCard';
import IQDashboard from '@/components/dashboard/IQDashboard';
import NextBestActionOwner from '@/components/dashboard/NextBestActionOwner';
import NextBestAction from '@/components/sprint/NextBestAction';
import SaveProgressModal from '@/components/auth/SaveProgressModal';
import MembershipUpgradeBanner from '@/components/membership/MembershipUpgradeBanner';
import { useMembership } from '@/lib/useMembership';
import { useOpenDocuments } from '@/lib/visionWorkspace/openDocument';
import { FileText, Upload, Plus, RefreshCw, PlayCircle } from 'lucide-react';
import { buildBusinessIntelligenceState } from '@/lib/businessIntelligenceState';
import { hydrateBieFromBackend } from '@/lib/bie';
import { fetchCanonicalFactsForDashboard, mergeCanonicalIntoDashboardSources } from '@/lib/canonicalFactClient';
import { Button } from '@/components/ui/button';
import BookingModal from '@/components/sprint/BookingModal';
import { hasAnonymousData, getGuestSessionId } from '@/lib/anonymousSession';
import { useBusinessContext, DASHBOARD_QUERY_KEYS } from '@/lib/BusinessContext';
import AddBusinessModal from '@/components/dashboard/AddBusinessModal';
import GalileoGuidanceCard from '@/components/galileo/GalileoGuidanceCard';
import { useEnterpriseDiscovery } from '@/lib/enterpriseDiscovery';
import IntelligenceGreeting from '@/components/dashboard/IntelligenceGreeting';
import HeroStoryCard from '@/components/dashboard/HeroStoryCard';
import WhereYouStand from '@/components/dashboard/WhereYouStand';
import EvaluateDecisionButton from '@/components/decision/EvaluateDecisionButton';
import WhatsNext from '@/components/dashboard/WhatsNext';
import ExecutiveBriefing, { useExecutiveBriefing } from '@/components/dashboard/ExecutiveBriefing';
import { useBusinessIntelligenceContract } from '@/hooks/useBusinessIntelligenceContract';
import ContractRuntimeInspector from '@/components/dashboard/ContractRuntimeInspector';
import MemberWelcomeBriefing, { useMemberWelcomeBriefing } from '@/components/dashboard/MemberWelcomeBriefing';
import GalileoEducationModal, { useGalileoEducation } from '@/components/dashboard/GalileoEducationModal';
import CinematicIQReveal, { useCinematicReveal } from '@/components/dashboard/CinematicIQReveal';
import FeatureAccessModal from '@/components/dashboard/FeatureAccessModal';
import { calculateBusinessImpactScore } from '@/lib/businessIntelligenceState';
// Reference-matched components
import IQHeroSection from '@/components/dashboard/IQHeroSection';
import CostOfInaction from '@/components/dashboard/CostOfInaction';
import PathToFreedom from '@/components/dashboard/PathToFreedom';
import DynamicScenarioBuilder from '@/components/dashboard/DynamicScenarioBuilder';
import ValueCreationTimeline from '@/components/dashboard/ValueCreationTimeline';
import VisionROIScore from '@/components/dashboard/VisionROIScore';
import FreedomAccelerationCard from '@/components/dashboard/FreedomAccelerationCard';
import OutcomeImpactSummary from '@/components/dashboard/OutcomeImpactSummary';
import WeeklyDigestCard from '@/components/digest/WeeklyDigestCard';
// BusinessStoryPanel and BusinessTimeline replaced by HeroStoryCard in above-the-fold redesign
import LivingDashboardUpdate from '@/components/dashboard/LivingDashboardUpdate';
import SprintBridge from '@/components/dashboard/SprintBridge';
import BIHealthCard from '@/components/dashboard/BIHealthCard';
import { useLiveSyncSubscription } from '@/hooks/useLiveSyncSubscription';
import { useLivingIntelligence } from '@/hooks/useLivingIntelligence';
import RuntimeDiagnosticPanel from '@/components/dashboard/RuntimeDiagnosticPanel';

export default function Dashboard() {
  // The Dashboard renders INSIDE Vision as a workspace. Uploading financials from
  // here must open the Galileo document overlay in upload mode, not eject the
  // owner onto the standalone uploader (Global Rule #1). Off Vision the same
  // call falls back to the existing standalone route.
  const openDocs = useOpenDocuments();
  const { user, supabaseProfile, allBusinesses, activeContext } = useAuth();
  const { context: bizCtx, isRecalculating, bisVersion, lastTriggeredBy } = useBusinessContext();
  const [showDiag] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('diag') === '1' || localStorage.getItem('vision_diag') === '1';
    } catch { return false; }
  });
  const { isPaid, isAdvisorOrAdmin } = useMembership();
  const { currentMessage, showGuidance, hideGuidance } = useEnterpriseDiscovery();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  // showDataOverlay removed — no longer used
  const [bookingOpen, setBookingOpen] = useState(false);
  const [showAddBusinessModal, setShowAddBusinessModal] = useState(false);
  const [showGuidanceCard, setShowGuidanceCard] = useState(false);
  const { shouldAutoStart, markComplete, replay } = useExecutiveBriefing();
  const { shouldShow: showMemberWelcome, markComplete: markMemberWelcomeDone, replay: replayMemberWelcome } = useMemberWelcomeBriefing(isPaid);
  const galileoEdu = useGalileoEducation();
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [accessModal, setAccessModal] = useState({ open: false, featureName: '' });
  const { shouldShow: showCinematic, markSeen: markCinematicSeen, resetReveal } = useCinematicReveal();

  const [guestSession, setGuestSession] = useState(null);

  useEffect(() => {
    const checkAnonymous = async () => {
      const authed = await base44.auth.isAuthenticated();
      if (!authed && hasAnonymousData()) {
        setIsAnonymous(true);
        // Load guest session data for dashboard population — do NOT auto-open save modal
        const guestSessionId = getGuestSessionId();
        if (guestSessionId) {
          try {
            const res = await base44.functions.invoke('guestSessionService', {
              action: 'getGuestSession',
              data: { guest_session_id: guestSessionId },
            });
            if (res.data?.session) {
              setGuestSession(res.data.session);
            }
          } catch { /* non-fatal */ }
        }
      }
    };
    checkAnonymous();
  }, []);

  // ── Hydrate BIE snapshots & journal from Supabase on business switch ──────
  // Pulls persisted snapshots/journal into localStorage so the engine reads
  // the latest cross-device state. Fire-and-forget — non-blocking.
  useEffect(() => {
    const bid = bizCtx.active_business_id;
    const pid = bizCtx.profile_id;
    if (bid && pid) {
      hydrateBieFromBackend(bid, pid).catch(() => {});
    }
  }, [bizCtx.active_business_id, bizCtx.profile_id]);

  // Active business ID — explicit context, never guesses
  const activeBusinessId = bizCtx.active_business_id;
  const queryClient = useQueryClient();

  // ── Phase 14.3B: Live Revenue Sync Pilot ──────────────────────────────────
  // When a qualified canonical Revenue change occurs for this business,
  // invalidate the canonical facts query so Dashboard re-reads from the
  // canonical resolver. The existing BIS/Dashboard pipeline then continues
  // with fresh canonical values. No direct value pushing.
  useLiveSyncSubscription('dashboard', activeBusinessId, async () => {
    queryClient.invalidateQueries({ queryKey: ['canonicalFacts', activeBusinessId] });
  });

  // Data fetching — all queries scoped to active business + bisVersion
  // bisVersion changes after every assessment save, triggering automatic refetch
  const { data: metricsData } = useQuery({
    queryKey: ['dashboardMetrics', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getDashboardMetrics', data: { businessId: activeBusinessId } });
      return res.data?.metrics || null;
    },
    staleTime: 0,
  });

  const { data: gapsData } = useQuery({
    queryKey: ['gapAnalyses', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getGapAnalyses', data: { businessId: activeBusinessId } });
      return res.data?.gaps || [];
    },
    initialData: []
  });

  const { data: assessmentsData } = useQuery({
    queryKey: ['businessAssessments', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getBusinessAssessments', data: { businessId: activeBusinessId } });
      return res.data?.assessments || [];
    },
    initialData: []
  });

  const { data: latestSnapshot } = useQuery({
    queryKey: ['latestMetricSnapshot', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getLatestMetricSnapshot', data: { businessId: activeBusinessId } });
      return res.data?.snapshot || null;
    },
    initialData: null
  });

  const { data: assessmentSummary } = useQuery({
    queryKey: ['assessmentSummary', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getAssessmentSummary', data: { businessId: activeBusinessId } });
      return res.data?.summary || null;
    },
    initialData: null,
    staleTime: 0,
  });

  const { data: valueCreationSummary } = useQuery({
    queryKey: ['valueCreationSummary', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getValueCreationSummary', data: { businessId: activeBusinessId } });
      return res.data?.summary || null;
    },
    initialData: null
  });

  const { data: allSnapshotsData } = useQuery({
    queryKey: ['metricSnapshotsAll', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getMetricSnapshotsAll', data: { businessId: activeBusinessId } });
      return res.data?.snapshots || [];
    },
    initialData: []
  });

  const { data: valueCreationEvents } = useQuery({
    queryKey: ['valueCreationEvents', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getValueCreationEvents', data: { businessId: activeBusinessId } });
      return res.data?.events || [];
    },
    initialData: []
  });

  const { data: sprintItems } = useQuery({
    queryKey: ['sprintItems', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getRoadmapItems', data: { businessId: activeBusinessId } });
      return res.data?.items || [];
    },
    initialData: []
  });

  const { data: activeSprint } = useQuery({
    // Phase 6.9 — business identity is part of the cache key. Without it this
    // entry never changed on a business switch, so Business A's Sprint stayed on
    // screen under Business B and no refetch was triggered at all.
    queryKey: ['activeSprint', activeBusinessId, bisVersion],
    queryFn: async () => {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getSprint',
        active_business_id: activeBusinessId,
      });
      return res.data?.sprint || null;
    },
    enabled: true,
    initialData: null
  });

  // ── Phase 14.2B: Canonical Fact Consumer Migration (Dashboard) ────────────
  // Fetch canonical facts (batch) and merge into raw data sources BEFORE BIS
  // is built. Canonical values are preferred; legacy values are fallback.
  // No UI changes. No calculation changes. Shadow diagnostics are dev-only.
  const { data: canonicalFactsData } = useQuery({
    queryKey: ['canonicalFacts', activeBusinessId, bisVersion],
    queryFn: async () => fetchCanonicalFactsForDashboard(activeBusinessId),
    enabled: !!activeBusinessId,
    initialData: null,
    staleTime: 0,
  });

  const { data: sprintNextAction } = useQuery({
    queryKey: ['sprintNextAction', activeSprint?.id, bisVersion],
    queryFn: async () => {
      if (!activeSprint?.id) return null;
      // Phase 6.9 — getNextBestAction resolves the ACTIVE business on the server and
      // refuses without it, so the explicit selection must be sent.
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getNextBestAction',
        active_business_id: activeBusinessId,
      });
      return res.data?.action || null;
    },
    enabled: !!activeSprint?.id,
    initialData: null
  });

  // ── Phase 14.2B: Merge canonical facts into raw sources BEFORE BIS ────────
  // Canonical values are preferred for pilot facts currently used by the
  // dashboard (revenue, net_income, reported_ebitda, normalized_ebitda).
  // Legacy values remain as fallback. No calculation changes. No UI changes.
  const canonicalMerge = useMemo(
    () => mergeCanonicalIntoDashboardSources(canonicalFactsData, metricsData, latestSnapshot),
    [canonicalFactsData, metricsData, latestSnapshot]
  );

  // ── Phase 14.2B: Dev-only shadow diagnostics (no UI output) ──────────────
  // Must run AFTER canonicalMerge is defined (temporal dead zone safety).
  useEffect(() => {
    if (canonicalMerge.shadowDiagnostics?.length > 0 && import.meta.env?.DEV) {
      console.debug('[CanonicalFacts] Dashboard shadow diagnostics:', canonicalMerge.shadowDiagnostics);
    }
  }, [canonicalMerge.shadowDiagnostics]);

  // ── SHARED BUSINESS INTELLIGENCE CONTRACT — single frontend source ──────────
  // One React Query cache entry per business. Dashboard, Executive Brief, and
  // all frontend consumers read from this same hook. Query key includes
  // bisVersion so it auto-refetches after assessment saves.
  const { data: contract, isLoading: contractLoading, error: contractError } = useBusinessIntelligenceContract(activeBusinessId, bisVersion);

  // ── BusinessIntelligenceState — single canonical source of truth ────────────
  // engineOpts.triggeredBy is passed from BusinessContext so the BIE journal
  // records accurate provenance (assessment, document, scenario, sprint, advisor).
  // Phase 14.2B: metricsData and latestSnapshot now contain canonical-preferred
  // values for pilot facts. The BIS engine consumes them unchanged.
  const bis = buildBusinessIntelligenceState({
    profile: supabaseProfile,
    activeBusinessId,
    assessmentSummary,
    dashboardMetrics: canonicalMerge.metricsData,
    latestSnapshot: canonicalMerge.latestSnapshot,
    assessmentsData,
    documents: [],
    roadmapItems: sprintItems,
    businessEntity: null,
    guestSession,
    // Phase 14.2C: Pass canonical facts map to BIE for canonical-preferred reads.
    // BIE prefers canonical values for pilot facts (revenue) when available,
    // falling back to legacy resolution (assessmentSummary → dashboardMetrics).
    canonicalFacts: canonicalMerge.factsMap,
  }, { triggeredBy: lastTriggeredBy });

  // Phase 14.2C: Attach canonical evidence metadata to BIS (additive — no formula changes).
  // This allows the Executive Brief and BIE summaries to access canonical source
  // authority, confidence, and verification status for evidence enrichment.
  // The narrative engine reads this optionally — no structural changes to BIS or BIE.
  if (bis && canonicalMerge.canonicalMeta?.available) {
    bis._canonicalMeta = canonicalMerge.canonicalMeta;
  }

  // ── Phase 15.1: Living Intelligence Integration ────────────────────────────
  // Non-blocking enrichment — Dashboard renders without waiting for LI.
  // Results enrich existing components (WhatsNext, LivingDashboardUpdate,
  // IntelligenceGreeting) when they arrive. No new components. No new UI.
  const { executivePresence, businessMomentum, whatChanged } = useLivingIntelligence({
    businessId: activeBusinessId,
    bis,
    bisVersion,
    userRole: user?.role,
  });

  // Phase 14.2B: m and ls now contain canonical-preferred values for pilot facts
  const m = canonicalMerge.metricsData;
  const ls = canonicalMerge.latestSnapshot;
  const as = assessmentSummary || {};
  const vce = valueCreationEvents || [];
  const ri = sprintItems || [];

  // Verified Value calculations
  const identifiedValue = vce.
  filter((e) => e.status !== 'dismissed' && e.status !== 'deferred').
  reduce((sum, e) => sum + (e.estimated_impact || 0), 0);

  const implementedValue = ri.
  filter((item) => item.status === 'Implemented' || item.status === 'Verified').
  reduce((sum, item) => sum + (item.estimated_value_created || 0), 0);

  const verifiedValue = vce.
  filter((e) => e.status === 'verified').
  reduce((sum, e) => sum + (e.verified_value || 0), 0);

  const hasData = bis.hasData || !!(m.overall_impact_score || m.profit_gap || m.value_gap || gapsData?.length) || !!contract;

  // ── Business-switch loading transition ─────────────────────────────────────
  // `hasData` is false BOTH for a genuinely empty business and for the moment a
  // switched-in business is still resolving. Counting the in-flight
  // business-scoped queries tells the two apart, so the dashboard shows its
  // loading state instead of a false "no data" state. The latch only ever turns
  // on, never off, so a background refetch cannot re-trigger it, and the routed
  // surface remounts on a business switch, which resets it per business.
  const businessFetchingCount = useIsFetching({
    predicate: (q) => DASHBOARD_QUERY_KEYS.includes(q.queryKey[0]),
  });
  const [businessQueriesSettled, setBusinessQueriesSettled] = useState(false);
  const observedBusinessFetchRef = useRef(false);
  useEffect(() => {
    if (businessQueriesSettled) return;
    if (businessFetchingCount > 0) { observedBusinessFetchRef.current = true; return; }
    if (hasData || observedBusinessFetchRef.current) setBusinessQueriesSettled(true);
  }, [businessQueriesSettled, businessFetchingCount, hasData]);
  // Guests have no business, so they are never put behind this loading state.
  const isBusinessLoading = !!activeBusinessId && !businessQueriesSettled;

  // Auto-start cinematic reveal on first visit (when data is ready)
  const bisImpact = calculateBusinessImpactScore(bis);
  // cinematicDone starts as false so the reveal can fire on first data load
  const [cinematicDone, setCinematicDone] = useState(false);

  // Auto-start walkthrough once cinematic is done and data is available
  useEffect(() => {
    if (shouldAutoStart && hasData && cinematicDone) {
      const t = setTimeout(() => setShowWalkthrough(true), 1200);
      return () => clearTimeout(t);
    }
  }, [shouldAutoStart, hasData, cinematicDone]);

  // No overlay — users see inline empty state instead

  // IQ Score — canonical from BIS
  const enhancedIq = bis._raw.iq_score ?? 0;

  // Historical IQ from snapshots (still uses raw data for chart)

  const enhancedHistoricalIq = (() => {
    if (allSnapshotsData && allSnapshotsData.length > 0) {
      return allSnapshotsData.
      filter((s) => s.overall_impact_score != null).
      map((s) => ({
        date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        score: Math.round(s.overall_impact_score)
      }));
    }
    return null;
  })();

  // ── Baseline Business Value — from the Shared Supabase Intelligence Contract ─
  // Dashboard no longer resolves baseline independently (no BIE journal scanning).
  // The baseline comes from supabaseUserData.getAssessmentSummary, which calls the
  // shared baselineResolver. This is the SAME contract Galileo, Executive Brief,
  // and Living Intelligence use — one certified resolver, zero divergence.
  // Baseline is immutable: it does NOT move when Current Value later changes.
  // Each business has its own independent baseline (business_id scoped).
  const baselineValue = assessmentSummary?.baseline_business_value ?? null;
  const baselineDate = assessmentSummary?.baseline_business_value_date ?? null;
  const baselineStatus = assessmentSummary?.baseline_business_value_status ?? 'NOT_ESTABLISHED';

  // Cost of Inaction — CANONICAL from BIS (not raw dashboardMetrics)
  const totalAnnualGap = (bis._raw.profit_gap_amount || 0) + (bis._raw.tax_gap_annual || 0);

  // Exit multiple — derived from BIS value gap data, not hardcoded
  const exitMultiple = (() => {
    const cv = bis._raw.current_value;
    const rev = bis._raw.revenue;
    if (cv > 0 && rev > 0) return (cv / rev).toFixed(1);
    return null; // No hardcoded fallback — display will say "your exit multiple"
  })();

  const fmtCOI = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(n / 1000)}K`;
  };

  // Conditional rendering helpers - only show when data exists
  const iqDataPoints = enhancedHistoricalIq ? enhancedHistoricalIq.length : 0;
  const verifiedEventsCount = vce ? vce.filter((e) => e.status === 'verified').length : 0;
  const financialSnapshotsCount = allSnapshotsData ? allSnapshotsData.filter((s) => s.annual_revenue != null || s.net_profit != null || s.ebitda != null).length : 0;

  const showHistoricalIQ = isPaid && iqDataPoints >= 3;
  const showValueCreated = isPaid && verifiedValue > 0;
  const showROIScore = isPaid && verifiedEventsCount >= 3;
  const showValueTimeline = isPaid && vce && vce.length > 0;
  const showFinancialSnapshot = financialSnapshotsCount >= 3;

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-16 relative" style={{ background: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(212,168,83,0.035) 0%, transparent 55%)' }}>
      {/* Phase 4C — Cinematic IQ Reveal (first visit only) */}
      {showCinematic && hasData && !cinematicDone && (
        <CinematicIQReveal
          iqScore={enhancedIq}
          impactScore={bisImpact?.impact_score ?? 0}
          bis={bis}
          onComplete={() => { markCinematicSeen(); setCinematicDone(true); }}
        />
      )}

      {/* Recalculation indicator — appears only while engine runs */}
      {isRecalculating && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)' }}>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Updating your Business Intelligence…
        </div>
      )}

      {/* Guest save-progress banner — shown at top when guest has data */}
      {isAnonymous && hasData &&
      <div className="rounded-xl px-5 py-3 flex items-center justify-between gap-4"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm text-foreground/80 truncate">
              Your Blueprint is <span className="text-primary font-semibold">temporary</span> — create an account to save it permanently.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowSaveModal(true)} className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 text-xs">
            Save Progress
          </Button>
        </div>
      }

      {/* ── Above-the-Fold: Executive Briefing Experience ── */}
      {hasData && (
        <IntelligenceGreeting
          personName={user?.full_name || 'Guest'}
          isRecalculating={isRecalculating}
          businessId={activeBusinessId}
          momentum={businessMomentum}
        />
      )}

      {hasData && (
        <HeroStoryCard
          bis={bis}
          businessId={activeBusinessId}
          verifiedValue={verifiedValue}
          baselineValue={baselineValue}
          baselineDate={baselineDate}
          baselineStatus={baselineStatus}
          contract={assessmentSummary?.intelligence_contract}
          onContinueBriefing={() => { replay(); setShowWalkthrough(true); }}
          onAskGalileo={() => window.dispatchEvent(new CustomEvent('open-galileo'))}
        />
      )}

      {hasData && (
        <WhereYouStand bis={bis} businessId={activeBusinessId} />
      )}

      {hasData && (
        <WhatsNext
          onReviewIntelligence={() => { replay(); setShowWalkthrough(true); }}
          onBuildSprint={() => document.getElementById('sprint-bridge-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onAskGalileo={() => window.dispatchEvent(new CustomEvent('open-galileo'))}
          intelligenceItems={executivePresence?.items}
        />
      )}

      {/* Loading transition — a switched-in business whose queries have not
          settled yet. Never a semantic "no data" state, and never the previous
          business's data. */}
      {!hasData && isBusinessLoading &&
      <div className="space-y-6" aria-busy="true" aria-live="polite">
          <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-28 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
            <div className="h-28 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
            <div className="h-28 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
          </div>
          <p className="text-center text-xs text-muted-foreground">Loading this business…</p>
        </div>
      }

      {/* Empty state — only once the incoming business's queries have completed */}
      {!hasData && !isBusinessLoading &&
      <div className="relative rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,212,255,0.06) 100%)', border: '1px solid rgba(212,168,83,0.25)' }}>
          <div className="flex flex-col items-center justify-center text-center px-8 py-12 space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-2">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-display font-bold">See the business you built through a different lens.</h3>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              Upload your financials and go through the assessments to uncover hidden value, unnecessary taxes, cash flow inefficiencies, and untapped potential.
            </p>
            <button
              type="button"
              onClick={() => openDocs({ mode: 'upload', needs: 'Financial statements' })}
              className="inline-flex items-center gap-1.5 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload Financials
            </button>
          </div>
        </div>
      }

      {/* Row 3 removed — replaced by HeroStoryCard in the new above-the-fold redesign */}

      {/* Row 4: Business At A Glance — gap cards + recast EBITDA */}
      {hasData && (
        <IQDashboard bis={bis} contract={contract} contractLoading={contractLoading} assessmentSummary={as} latestSnapshot={ls} metricsData={m} />
      )}

      {/* Row 5: Business Intelligence Confidence */}
      {hasData && <BIHealthCard bis={bis} />}

      {/* ── Executive Intelligence — below the fold ── */}
      <div className="pt-10 mt-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)' }} />
          <p className="text-[12px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            Executive Intelligence
          </p>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)' }} />
        </div>
      </div>

      {/* History — what changed & progression */}
      <div className="flex items-center gap-3 pt-2">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground/70">History</span>
        <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* Living Dashboard Update — intelligence changes since last briefing */}
      {hasData && <LivingDashboardUpdate bis={bis} businessId={activeBusinessId} intelligenceChanges={whatChanged} />}

      {/* Weekly Digest — paying members only */}
      {isPaid && user && supabaseProfile?.id &&
      <WeeklyDigestCard
        profileId={supabaseProfile.id}
        businessId={activeBusinessId || m?.business_id || null}
        userEmail={user.email}
        isSuperAdmin={isAdvisorOrAdmin} />
      }

      {/* Historical IQ™ Progression - Paid only, hide if < 3 snapshots */}
      {showHistoricalIQ &&
      <section className="space-y-2">
        <HistoricalChart snapshots={allSnapshotsData} data={enhancedHistoricalIq} />
      </section>
      }

      {/* Financial Intelligence — the numbers & value */}
      <div className="flex items-center gap-3 pt-4">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground/70">Financial Intelligence</span>
        <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* Business Impact Score — detailed breakdown, always visible */}
      <BusinessImpactScore bis={bis} />

      {/* 5. Value Created - Paid only, hide if no verified value */}
      {showValueCreated &&
      <section className="space-y-2">
          <h2 className="text-lg font-semibold">Value Created</h2>
          <ValueCreatedCards
          valueCreationSummary={valueCreationSummary}
          valueCreationEvents={vce} />
        
        </section>
      }

      {/* 6. V.I.S.I.O.N. ROI Score™ - Paid only, hide if no verified value */}
      {showROIScore &&
      <VisionROIScore
        totalInvestment={null}
        totalVerifiedValue={verifiedValue} />

      }

      {/* 7. Value Creation Timeline - Paid only */}
      {showValueTimeline &&
      <section className="space-y-2">
          <h2 className="text-lg font-semibold">Value Creation Timeline</h2>
          <ValueCreationTimeline events={vce} />
        </section>
      }

      {/* 8. Financial Snapshot - Show if >= 3 snapshots with data */}
      {showFinancialSnapshot &&
      <section className="space-y-2">
          <h2 className="text-lg font-semibold">Financial Snapshot</h2>
          <FinancialSnapshotCard snapshot={latestSnapshot} />
        </section>
      }

      {/* Execution — sprint & decisions */}
      <div className="flex items-center gap-3 pt-4">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground/70">Execution</span>
        <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* 8b. Sprint Bridge — highest-leverage opportunity → 90-Day Sprint */}
      {hasData &&
      <div id="sprint-bridge-section">
        <SprintBridge
          bis={bis}
          isPaid={isPaid}
          onOpenAccessModal={(featureName) => setAccessModal({ open: true, featureName })} />
      </div>
      }

      {/* 8c. Decision Intelligence — frame, analyze, and finalize major decisions */}
      {hasData && isAdvisorOrAdmin && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Decision Intelligence</span>
            <span className="text-muted-foreground/60 ml-1.5">— structure major executive decisions before executing</span>
          </div>
          <EvaluateDecisionButton businessId={activeBusinessId} variant="outline" />
        </div>
      )}

      {/* Onboarding Journey — preserved in supporting intelligence */}
      <div data-walkthrough="onboarding-progress">
        <OnboardingProgress bis={bis} />
      </div>

      {/* 10. Strategic Observations - Top 3 (non-paid) / Top 5 (paid) */}
      {hasData && (() => {
        // CANONICAL: Read from BIS, not raw dashboardMetrics
        const taxOverpay = bis._raw.tax_gap_annual;
        const profitGap = bis._raw.profit_gap_amount;
        const evMultiple = exitMultiple;
        const multipleLabel = evMultiple ? `${evMultiple}x` : 'your exit multiple';
        const observations = [
        taxOverpay ?
        `Your Tax Gap compounds your Value Gap. Every dollar overpaid in taxes reduces EBITDA — which reduces your exit valuation by **${multipleLabel}** that amount. Estimated annual overpayment: **${fmtCOI(taxOverpay)}**.` :
        null,
        profitGap ?
        `Margin improvement multiplies at exit. Closing your profit gap of **${fmtCOI(profitGap)}** adds **${multipleLabel}** to your enterprise value — margin optimization is your highest-leverage investment.` :
        null,
        bis._raw.operations_score != null ?
        `Your Operations Health Score is **${Math.round(bis._raw.operations_score)}/100**. ${bis._raw.operations_score < 60 ? 'Owner-dependency is your largest hidden risk — each bottleneck reduces buyer confidence and lowers your multiple.' : 'Strong operational systems protect your multiple and reduce buyer risk.'}` :
        null].
        filter(Boolean);
        if (!observations.length) return null;
        const displayCount = isPaid ? 5 : 3;
        return (
          <div className="glass rounded-xl p-6">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-4">
              Strategic Observations
            </p>
            <div className="space-y-3">
              {observations.slice(0, displayCount).map((obs, i) =>
              <div key={i} className="glass rounded-lg p-4 text-sm text-foreground/80 leading-relaxed">
                  {obs.split('**').map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part
                )}
                </div>
              )}
            </div>
          </div>);

      })()}

      {/* 11. Cost of Inaction - Reference-matched */}
      {hasData &&
      <div data-walkthrough="cost-of-inaction"><CostOfInaction
        annualGap={totalAnnualGap}
        opportunityValue={identifiedValue} /></div>

      }

      {/* Growth — freedom, outcomes & scenarios */}
      <div className="flex items-center gap-3 pt-4">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground/70">Growth</span>
        <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>

      {/* 12. Path to Freedom Comparison - Reference-matched */}
      {hasData &&
      <div data-walkthrough="path-to-freedom"><PathToFreedom
        metricsData={m}
        assessmentSummary={as}
        bis={bis} /></div>

      }

      {/* 12b. Freedom Acceleration Engine™ — additive, renders only when projections exist */}
      {hasData && <FreedomAccelerationCard />}

      {/* 12c. Verified Outcome Impact Summary — additive, renders only when verified outcomes exist */}
      {hasData && <OutcomeImpactSummary businessId={m?.business_id} profileId={user?.id} />}

      {/* 13. Dynamic Scenario Builder - Reference-matched */}
      {hasData &&
      <DynamicScenarioBuilder
        metricsData={m}
        assessmentSummary={as}
        bis={bis} />

      }

      {/* 14. Investment Comparison */}
      {hasData &&
      <div className="glass rounded-xl p-6">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-2">
            Investment Comparison
          </p>
          <p className="text-sm text-muted-foreground mb-6">What does it cost to close these gaps?</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass rounded-xl p-5 border border-[#EF4345]/30 bg-[#EF4345]/5">
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: '#EF4345' }}>Hire Separately</p>
              <p className="text-2xl font-display font-bold mb-1" style={{ color: '#EF4345' }}>$600K+</p>
              <p className="text-sm font-normal text-muted-foreground mb-4">In-House</p>
              <p className="text-lg font-display font-bold mb-4" style={{ color: '#EF4345' }}>$204K/yr</p>
              <p className="text-xs font-normal text-muted-foreground mb-3">Fractional</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>CFO</span><span>$250K FT / $60K Frac</span></div>
                <div className="flex justify-between"><span>COO</span><span>$350K FT / $84K Frac</span></div>
                <div className="flex justify-between"><span>CEPA</span><span>$100K FT / $60K Frac</span></div>
              </div>
              <p className="text-xs mt-3" style={{ color: '#EF4345' }}>Coordination and execution burden remains on you.</p>
            </div>
            <div className="glass rounded-xl p-5 flex flex-col">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">DIY</p>
              <p className="text-2xl font-display font-bold mb-2">$15K</p>
              <p className="text-sm font-semibold mb-2 leading-snug">
                Unlock the exact playbook to close your highest-value gaps — step by step.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Every strategy, every lever, sequenced for your business. You own execution. No hand-holding — just the roadmap most advisors charge $200K/year to build.
              </p>
              <button onClick={() => setBookingOpen(true)} className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                Get the Playbook →
              </button>
            </div>
            <div className="glass-gold rounded-xl p-5 border-primary/30">
              <p className="text-[10px] text-primary uppercase tracking-wider mb-1">Recommended</p>
              <p className="text-xs font-medium text-primary mb-3">V.I.S.I.O.N Platform</p>
              <p className="text-2xl font-display font-bold text-primary">$5K-25K/quarter</p>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Full advisory infrastructure. CFO + COO + CEPA + tax strategy + AI systems — integrated and accountable.
              </p>
              <button onClick={() => setBookingOpen(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Book a Strategy Call →
              </button>
            </div>
          </div>
        </div>
      }

      {/* Modals */}
      <SaveProgressModal
        open={showSaveModal}
        onOpenChange={setShowSaveModal}
        triggerType="dashboard"
        onComplete={() => {
          setIsAnonymous(false);
          setShowSaveModal(false);
        }} />
      

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
      <AddBusinessModal open={showAddBusinessModal} onClose={() => setShowAddBusinessModal(false)} />

      {/* Executive Briefing — Focus Mode */}
      {showWalkthrough && !showMemberWelcome && (
        <ExecutiveBriefing
          onClose={() => { setShowWalkthrough(false); markComplete(); galileoEdu.reveal(); }}
          bis={bis}
          contract={contract}
          onOpenAccessModal={(featureName) => setAccessModal({ open: true, featureName })}
          onMeetAdvisor={() => setBookingOpen(true)}
        />
      )}

      {/* Galileo Education — shown once after the first Executive Briefing */}
      <GalileoEducationModal
        open={galileoEdu.shouldShow}
        onGotIt={galileoEdu.dismiss}
        onDontShowAgain={galileoEdu.dontShowAgain}
      />

      {/* Member Welcome Briefing — fires once after account unlock, introduces execution features */}
      <AnimatePresence>
        {showMemberWelcome && !showWalkthrough && (
          <MemberWelcomeBriefing
            onClose={() => markMemberWelcomeDone()}
          />
        )}
      </AnimatePresence>

      {/* Feature Access Modal — for locked features */}
      <FeatureAccessModal
        open={accessModal.open}
        onClose={() => setAccessModal({ open: false, featureName: '' })}
        featureName={accessModal.featureName}
      />

      {/* Anonymous User — no data at all */}
      {isAnonymous && !hasData && !isBusinessLoading &&
      <div className="relative rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,212,255,0.06) 100%)', border: '1px solid rgba(212,168,83,0.25)' }}>
          <div className="flex flex-col items-center justify-center text-center px-8 py-12 space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-2">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-display font-bold">Your progress is saved locally</h3>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              Create an account to securely store your assessments, documents, and dashboard across devices.
            </p>
            <Button onClick={() => setShowSaveModal(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Save My Progress
            </Button>
          </div>
        </div>
      }

      {/* Upgrade Banner for free users */}
      {!isPaid && hasData &&
      <MembershipUpgradeBanner
        hiddenOpportunities={Math.max(0, (vce.length || 0) - 2)}
        hiddenValue={Math.max(0, identifiedValue - vce.slice(0, 2).reduce((s, e) => s + (e.estimated_impact || 0), 0))} />

      }

      {/* Galileo Guidance Card */}
      {showGuidance && currentMessage &&
      <div className="fixed bottom-8 right-8 z-40 max-w-md">
         <GalileoGuidanceCard
         title={currentMessage.title}
         message={currentMessage.message}
         onNext={() => hideGuidance()}
         nextLabel="Continue"
         hideGuidance={hideGuidance} />

       </div>
      }

      {/* TEMPORARY: Runtime Diagnostic Panel — remove before production */}
      {showDiag && (
       <RuntimeDiagnosticPanel
          activeBusinessId={activeBusinessId}
          isAuthenticated={!!user}
          assessmentSummary={assessmentSummary}
          dashboardMetrics={metricsData}
          guestSession={guestSession}
          bis={bis}
          bisVersion={bisVersion}
        />
       )}

      {/* TEMPORARY: Contract Runtime Inspector — remove after live verification */}
      {showDiag && (
        <ContractRuntimeInspector
          activeBusinessId={activeBusinessId}
          contract={contract}
          contractLoading={contractLoading}
          contractError={contractError}
        />
      )}
      </div>);

}