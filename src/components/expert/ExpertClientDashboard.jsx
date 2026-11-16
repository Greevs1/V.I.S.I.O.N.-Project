/**
 * ExpertClientDashboard
 * Renders the client IQ Dashboard in read-only mode for the Expert Advisor Portal.
 * Mirrors Dashboard.jsx exactly — uses supabaseUserData with _router_user_email,
 * the same function and actions the client's own dashboard uses.
 */
import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { buildBusinessIntelligenceState } from '@/lib/businessIntelligenceState';
import IQHeroSection from '@/components/dashboard/IQHeroSection';
import IQDashboard from '@/components/dashboard/IQDashboard';
import HistoricalChart from '@/components/dashboard/HistoricalChart';
import BusinessImpactScore from '@/components/dashboard/BusinessImpactScore';
import CostOfInaction from '@/components/dashboard/CostOfInaction';
import PathToFreedom from '@/components/dashboard/PathToFreedom';
import DynamicScenarioBuilder from '@/components/dashboard/DynamicScenarioBuilder';
import FinancialSnapshotCard from '@/components/dashboard/FinancialSnapshotCard';
import ValueCreatedCards from '@/components/dashboard/ValueCreatedCards';
import VisionROIScore from '@/components/dashboard/VisionROIScore';
import ValueCreationTimeline from '@/components/dashboard/ValueCreationTimeline';
import FreedomAccelerationCard from '@/components/dashboard/FreedomAccelerationCard';
import OutcomeImpactSummary from '@/components/dashboard/OutcomeImpactSummary';

export default function ExpertClientDashboard({ clientProfileId, clientBusinessId, clientName, clientEmail, onIqScoreResolved }) {
  const opts = { staleTime: 60000, enabled: !!clientEmail };
  const ep = { _router_user_email: clientEmail, data: { businessId: clientBusinessId } };

  const { data: metricsData, isLoading: loadingMetrics } = useQuery({
    queryKey: ['expert-client-metrics-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      // Phase 6.9 — the client's business must be explicit so the backend never has
      // to fall back to the client profile's primary business.
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getDashboardMetrics', data: { businessId: clientBusinessId } });
      return res.data?.metrics || null;
    },
    ...opts,
  });

  const { data: assessmentSummary, isLoading: loadingAssessment } = useQuery({
    queryKey: ['expert-client-assessment-summary-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getAssessmentSummary', data: { businessId: clientBusinessId } });
      return res.data?.summary || null;
    },
    ...opts,
  });

  const { data: allSnapshotsData } = useQuery({
    queryKey: ['expert-client-snapshots-all-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getMetricSnapshotsAll' });
      return res.data?.snapshots || [];
    },
    ...opts,
    initialData: [],
  });

  const { data: latestSnapshot } = useQuery({
    queryKey: ['expert-client-latest-snapshot-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getLatestMetricSnapshot' });
      return res.data?.snapshot || null;
    },
    ...opts,
    initialData: null,
  });

  const { data: valueCreationSummary } = useQuery({
    queryKey: ['expert-client-value-summary-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getValueCreationSummary' });
      return res.data?.summary || null;
    },
    ...opts,
    initialData: null,
  });

  const { data: valueCreationEvents } = useQuery({
    queryKey: ['expert-client-vce-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getValueCreationEvents' });
      return res.data?.events || [];
    },
    ...opts,
    initialData: [],
  });

  const { data: roadmapItems } = useQuery({
    queryKey: ['expert-client-roadmap-v2', clientEmail, clientBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { ...ep, action: 'getRoadmapItems' });
      return res.data?.items || [];
    },
    ...opts,
    initialData: [],
  });

  const isLoading = loadingMetrics || loadingAssessment;

  // ── Derived values — identical to Dashboard.jsx ──────────────────────────
  const m = metricsData || {};
  const ls = latestSnapshot || {};
  const as = assessmentSummary || {};
  const vce = valueCreationEvents || [];
  const ri = roadmapItems || [];

  // ── Build BIS from the same data the client dashboard uses ──────────────
  // This aligns the expert portal with the canonical intelligence layer.
  // engineOpts.triggeredBy='advisor' so journal entries record advisor-scope provenance.
  const bis = useMemo(() => buildBusinessIntelligenceState({
    profile: { id: clientProfileId },
    activeBusinessId: clientBusinessId,
    assessmentSummary: as,
    dashboardMetrics: m,
    latestSnapshot: ls,
    assessmentsData: [],
    documents: [],
    roadmapItems: ri,
    businessEntity: null,
    guestSession: null,
  }, { triggeredBy: 'advisor' }), [clientProfileId, clientBusinessId, as, m, ls, ri]);

  const identifiedValue = vce
    .filter(e => e.status !== 'dismissed' && e.status !== 'deferred')
    .reduce((sum, e) => sum + (e.estimated_impact || 0), 0);

  const verifiedValue = vce
    .filter(e => e.status === 'verified')
    .reduce((sum, e) => sum + (e.verified_value || 0), 0);

  const hasData = !!(m.overall_impact_score || m.ciq_score || m.profit_gap || m.value_gap || assessmentSummary);

  // IQ Score — same logic as Dashboard.jsx
  const iqSnapshots = (allSnapshotsData || []).filter(s => s.overall_impact_score != null);
  const latestIqSnapshot = iqSnapshots.length > 0 ? Math.round(iqSnapshots[iqSnapshots.length - 1].overall_impact_score) : null;
  const enhancedIq = (() => {
    if (m.ciq_score != null && m.ciq_score > 0) return m.ciq_score;
    if (m.overall_impact_score != null && m.overall_impact_score > 0) return m.overall_impact_score;
    if (ls.overall_impact_score != null && ls.overall_impact_score > 0) return ls.overall_impact_score;
    if (latestIqSnapshot != null && latestIqSnapshot > 0) return latestIqSnapshot;
    return 0;
  })();

  // Bubble score up to ExpertClientHeader
  useEffect(() => {
    if (onIqScoreResolved && enhancedIq) onIqScoreResolved(enhancedIq);
  }, [enhancedIq]);

  const enhancedHistoricalIq = allSnapshotsData && allSnapshotsData.length > 0
    ? allSnapshotsData
        .filter(s => s.overall_impact_score != null)
        .map(s => ({
          date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          score: Math.round(s.overall_impact_score),
        }))
    : null;

  const totalAnnualGap = (m.profit_gap?.gap_to_best || 0) + (m.tax_gap?.annual_overpayment || 0);

  const verifiedEventsCount = vce.filter(e => e.status === 'verified').length;
  const financialSnapshotsCount = (allSnapshotsData || []).filter(s => s.annual_revenue != null || s.net_profit != null || s.ebitda != null).length;

  const taxMultiplier = m.enterprise_value && m.tax_gap?.annual_overpayment
    ? (m.enterprise_value / (m.revenue || 1) || 4.5).toFixed(1) : '4.5';

  const fmtCOI = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(n / 1000)}K`;
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-2">
        <p className="text-sm text-muted-foreground">No dashboard data available for {clientName || 'this client'} yet.</p>
        <p className="text-xs text-muted-foreground">The client needs to complete assessments and upload documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pointer-events-none select-none">
      {/* Read-only badge */}
      <div className="flex items-center justify-between -mb-4">
        <p className="text-sm font-semibold text-muted-foreground">{clientName || 'Client'} — IQ Dashboard</p>
        <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">Read-Only</span>
      </div>

      {/* 1. IQ Hero */}
      <IQHeroSection iqScore={enhancedIq} metricsData={m} assessmentSummary={as} bis={bis} />

      {/* 2. Historical IQ Chart — same threshold as Dashboard (>0 snapshots) */}
      {enhancedHistoricalIq && enhancedHistoricalIq.length > 0 && (
        <HistoricalChart snapshots={allSnapshotsData} data={enhancedHistoricalIq} />
      )}

      {/* 3. Business Impact Score */}
      <BusinessImpactScore assessmentSummary={assessmentSummary} valueCreationSummary={valueCreationSummary} />

      {/* 4. Value Created — only when verified value exists */}
      {verifiedValue > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Value Created</h2>
          <ValueCreatedCards valueCreationSummary={valueCreationSummary} valueCreationEvents={vce} />
        </section>
      )}

      {/* 5. V.I.S.I.O.N. ROI Score — only when enough verified events */}
      {verifiedEventsCount >= 3 && (
        <VisionROIScore totalInvestment={0} totalVerifiedValue={verifiedValue} />
      )}

      {/* 6. Value Creation Timeline */}
      {vce.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Value Creation Timeline</h2>
          <ValueCreationTimeline events={vce} />
        </section>
      )}

      {/* 7. Financial Snapshot */}
      {financialSnapshotsCount >= 3 && latestSnapshot && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Financial Snapshot</h2>
          <FinancialSnapshotCard snapshot={latestSnapshot} />
        </section>
      )}

      {/* 8. Gap Analysis */}
      <IQDashboard bis={bis} assessmentSummary={as} latestSnapshot={ls} metricsData={m} />

      {/* 9. Strategic Observations */}
      {(() => {
        const taxOverpay = m.tax_gap?.annual_overpayment || as?.tax_gap_annual;
        const profitGap = m.profit_gap?.gap_to_best || as?.profit_gap_amount;
        const observations = [
          taxOverpay
            ? `Your Tax Gap compounds your Value Gap. Every dollar overpaid in taxes reduces EBITDA — which reduces your exit valuation by **${taxMultiplier}x** that amount. Estimated annual overpayment: **${fmtCOI(taxOverpay)}**.`
            : null,
          profitGap
            ? `Margin improvement multiplies at exit. Closing your profit gap of **${fmtCOI(profitGap)}** adds **${taxMultiplier}x** to your enterprise value.`
            : null,
          as?.operations_score != null
            ? `Your Operations Health Score is **${Math.round(as.operations_score)}/100**. ${as.operations_score < 60 ? 'Owner-dependency is your largest hidden risk.' : 'Strong operational systems protect your multiple.'}`
            : null,
        ].filter(Boolean);
        if (!observations.length) return null;
        return (
          <div className="glass rounded-xl p-6">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-4">Strategic Observations</p>
            <div className="space-y-3">
              {observations.map((obs, i) => (
                <div key={i} className="glass rounded-lg p-4 text-sm text-foreground/80 leading-relaxed">
                  {obs.split('**').map((part, j) =>
                    j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 10. Cost of Inaction */}
      {totalAnnualGap > 0 && (
        <CostOfInaction annualGap={totalAnnualGap} opportunityValue={identifiedValue} />
      )}

      {/* 11. Path to Freedom */}
      <PathToFreedom metricsData={m} assessmentSummary={as} bis={bis} />

      {/* 12. Freedom Acceleration */}
      <FreedomAccelerationCard />

      {/* 13. Outcome Impact Summary */}
      <OutcomeImpactSummary businessId={clientBusinessId} profileId={clientProfileId} />

      {/* 14. Dynamic Scenario Builder */}
      <DynamicScenarioBuilder metricsData={m} bis={bis} />
    </div>
  );
}