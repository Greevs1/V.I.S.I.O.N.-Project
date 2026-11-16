/**
 * ValuationWorkspace — Phase 13.3F.1
 *
 * Apple-style progressive disclosure valuation command center.
 * All 10 major sections collapse by default. One section opens at a time
 * (accordion). Users can pin, expand all, or collapse all. Technical
 * detail moves into detail drawers. Session state persists per valuation.
 *
 * All calculation, approval, publication, readiness, and staleness logic
 * remains in the certified Valuation Engine. This workspace only presents
 * the engine's outputs and embeds certified components for detail editing.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Sparkles, ArrowRight, AlertTriangle, Settings, TrendingUp, BarChart3, Layers, GitMerge, Building2, Coins, ShieldCheck, FileCheck2, Upload, Maximize2, Minimize2 } from 'lucide-react';
import { publishValuation } from '@/lib/valuationService';
import EngagementSetup from '@/components/valuation/EngagementSetup';
import NormalizedEarningsEngine from '@/components/valuation/NormalizedEarningsEngine';
import MethodologySelection from '@/components/valuation/MethodologySelection';
import MethodReconciliation from '@/components/valuation/MethodReconciliation';
import EquityValueBridge from '@/components/valuation/EquityValueBridge';
import ConfidenceScoring from '@/components/valuation/ConfidenceScoring';
import AdvisorConclusion from '@/components/valuation/AdvisorConclusion';
import ExplainabilityPanel from '@/components/valuation/ExplainabilityPanel';
import ValuationCommandHeader from './valuation/ValuationCommandHeader';
import ValuationJourneyNav from './valuation/ValuationJourneyNav';
import ValuationActionBar from './valuation/ValuationActionBar';
import WeightingSection from './valuation/WeightingSection';
import CollapsibleSection from './shared/CollapsibleSection';
import { useAccordionState } from '@/hooks/useAccordionState';
import {
  computeJourney, computeNextAction, fmtCurrency, fmtRange,
  getBlendedRecon, getEquityBridge, getApprovedConclusion, getOverallConfidence,
  getNormalizedEarnings, getHistoricalWeighting, getMethodSelections,
  getSetupStatus, getEarningsStatus, getWeightingStatus, getMethodsStatus,
  getReconciliationStatus, getEnterpriseValueStatus, getEquityValueStatus,
  getConfidenceStatus, getConclusionStatus, getPublishStatus,
} from '@/lib/valuation/valuationState';

const SECTION_IDS = ['setup', 'earnings', 'weighting', 'methods', 'reconciliation', 'enterprise_value', 'equity_value', 'confidence', 'conclusion', 'publish'];

const SECTION_META = {
  setup: { icon: Settings, title: 'Valuation Setup', subtitle: 'Purpose, standard of value, premise, and date' },
  earnings: { icon: TrendingUp, title: 'Maintainable Earnings', subtitle: 'Normalized EBITDA and SDE bridge' },
  weighting: { icon: BarChart3, title: 'Historical Weighting', subtitle: 'Weight periods to derive maintainable earnings' },
  methods: { icon: Layers, title: 'Valuation Methods', subtitle: 'Select and approve primary, secondary, and supporting methods' },
  reconciliation: { icon: GitMerge, title: 'Method Reconciliation', subtitle: 'Weight methods to determine Enterprise Value' },
  enterprise_value: { icon: Building2, title: 'Enterprise Value', subtitle: 'The indicated value of the business enterprise' },
  equity_value: { icon: Coins, title: 'Equity Value', subtitle: 'Enterprise Value bridged to equity holders' },
  confidence: { icon: ShieldCheck, title: 'Confidence and Defensibility', subtitle: 'Evidence coverage across five categories' },
  conclusion: { icon: FileCheck2, title: 'Advisor Conclusion', subtitle: 'Defensible opinion of value' },
  publish: { icon: Upload, title: 'Publication Readiness', subtitle: 'Publish an immutable version' },
};

export default function ValuationWorkspace({
  valuationId, summary, calcSummary, readiness, intelligence,
  canEdit, canPublish, onOpenAdvanced, onNavigateToValidate, density = 'summary',
}) {
  const [activeSection, setActiveSection] = useState('setup');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  const journey = useMemo(
    () => computeJourney({ summary, calcSummary, readiness }),
    [summary, calcSummary, readiness]
  );
  const nextAction = useMemo(
    () => computeNextAction({ summary, calcSummary, readiness, canPublish }),
    [summary, calcSummary, readiness, canPublish]
  );

  // Accordion state — per valuation + business, persisted in sessionStorage
  const businessId = summary?.valuation?.business_id || summary?.business?.id || 'unknown';
  const accordionKey = `valuation_accordion_${valuationId}_${businessId}`;
  const initialSection = nextAction?.section || 'setup';
  const accordion = useAccordionState(accordionKey, initialSection);

  const scrollToSection = useCallback((sectionId) => {
    setActiveSection(sectionId);
    accordion.toggle(sectionId);
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [accordion]);

  const handleNextAction = () => {
    if (nextAction.linkToValidate) {
      onNavigateToValidate?.();
    } else {
      scrollToSection(nextAction.section);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await publishValuation(valuationId);
      window.location.reload();
    } catch (err) {
      setPublishError(err.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  // ── Data for summaries ──────────────────────────────────────────────────
  const recon = getBlendedRecon(calcSummary);
  const bridge = getEquityBridge(calcSummary);
  const conclusion = getApprovedConclusion(calcSummary);
  const overallConf = getOverallConfidence(calcSummary);
  const ne = getNormalizedEarnings(calcSummary);
  const hw = getHistoricalWeighting(calcSummary);
  const selections = getMethodSelections(calcSummary);
  const valuation = summary?.valuation;
  const blockers = readiness?.critical_blockers || [];
  const selectedMethods = selections.filter((s) => s.is_selected);

  // ── Section configs ─────────────────────────────────────────────────────
  const sectionConfigs = useMemo(() => ({
    setup: {
      status: getSetupStatus(summary),
      primaryMetric: { label: 'Purpose', value: valuation?.valuation_purpose?.replace(/_/g, ' ') || null },
    },
    earnings: {
      status: getEarningsStatus(calcSummary),
      stale: ne?.is_stale,
      primaryMetric: ne ? { label: 'Normalized EBITDA', value: fmtCurrency(ne.normalized_ebitda || ne.ebitda) } : null,
      primaryAction: ne ? { label: 'Review adjustments', onClick: () => onNavigateToValidate?.() } : null,
      secondaryAction: { label: 'Advanced', onClick: () => onOpenAdvanced?.() },
    },
    weighting: {
      status: getWeightingStatus(calcSummary),
      stale: hw?.is_stale,
      primaryMetric: hw ? { label: 'Maintainable', value: fmtCurrency(hw.maintainable_earnings) } : null,
    },
    methods: {
      status: getMethodsStatus(calcSummary),
      primaryMetric: selectedMethods.length > 0 ? { label: 'Selected', value: `${selectedMethods.length} method${selectedMethods.length !== 1 ? 's' : ''}` } : null,
      secondaryAction: { label: 'Advanced', onClick: () => onOpenAdvanced?.() },
    },
    reconciliation: {
      status: getReconciliationStatus(calcSummary),
      stale: recon?.is_stale,
      primaryMetric: recon ? { label: 'EV Midpoint', value: fmtCurrency(recon.enterprise_value_mid) } : null,
      primaryAction: blockers.length > 0 ? { label: 'Resolve blockers', onClick: () => onNavigateToValidate?.() } : null,
    },
    enterprise_value: {
      status: getEnterpriseValueStatus(calcSummary),
      stale: recon?.is_stale,
      primaryMetric: recon ? { label: 'Midpoint', value: fmtCurrency(recon.enterprise_value_mid) } : null,
      confidence: overallConf?.score,
      secondaryAction: { label: 'Advanced', onClick: () => onOpenAdvanced?.() },
    },
    equity_value: {
      status: getEquityValueStatus(calcSummary),
      stale: bridge?.is_stale,
      primaryMetric: bridge ? { label: 'Midpoint', value: fmtCurrency(bridge.equity_value_mid) } : null,
    },
    confidence: {
      status: getConfidenceStatus(calcSummary),
      primaryMetric: overallConf ? { label: 'Overall', value: `${overallConf.score}%` } : null,
      confidence: overallConf?.score,
    },
    conclusion: {
      status: getConclusionStatus(calcSummary),
      primaryMetric: { label: 'Status', value: conclusion ? 'Approved' : 'Draft' },
      confidence: conclusion?.confidence_score,
    },
    publish: {
      status: getPublishStatus(readiness),
      blockerCount: blockers.length,
      primaryMetric: { label: 'Status', value: readiness?.ready ? 'Ready' : blockers.length > 0 ? `${blockers.length} blocker${blockers.length !== 1 ? 's' : ''}` : 'In progress' },
      primaryAction: readiness?.ready && canPublish ? { label: 'Publish', onClick: handlePublish } : blockers.length > 0 ? { label: 'Resolve blockers', onClick: () => onNavigateToValidate?.() } : null,
    },
  }), [summary, calcSummary, readiness, ne, hw, recon, bridge, conclusion, overallConf, selectedMethods, blockers, canEdit, canPublish, onOpenAdvanced, onNavigateToValidate]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderSectionContent = (sectionId) => {
    switch (sectionId) {
      case 'setup':
        return <EngagementSetup valuation={summary?.valuation} />;
      case 'earnings':
        return <NormalizedEarningsEngine valuationId={valuationId} />;
      case 'weighting':
        return <WeightingSection valuationId={valuationId} canEdit={canEdit} />;
      case 'methods':
        return <MethodologySelection valuationId={valuationId} answers={{}} />;
      case 'reconciliation':
        return <MethodReconciliation valuationId={valuationId} />;
      case 'enterprise_value':
        return (
          <div className="space-y-3">
            <div className="rounded-lg p-4" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}>
              <p className="text-[10px] uppercase tracking-wider text-primary/80">Why this is the indicated value</p>
              <p className="text-xs text-foreground mt-1">
                {recon
                  ? `Derived from the approved blended reconciliation of ${selectedMethods.length} method${selectedMethods.length !== 1 ? 's' : ''}, using ${ne?.earnings_basis || 'EBITDA'} as the earnings basis and maintainable earnings of ${fmtCurrency(hw?.maintainable_earnings || ne?.normalized_ebitda)}.`
                  : 'Enterprise Value requires an approved blended reconciliation.'}
              </p>
            </div>
            <ExplainabilityPanel valuationId={valuationId} />
          </div>
        );
      case 'equity_value':
        return (
          <EquityValueBridge
            valuationId={valuationId}
            enterpriseValue={recon ? { low: recon.enterprise_value_low, mid: recon.enterprise_value_mid, high: recon.enterprise_value_high } : { low: 0, mid: 0, high: 0 }}
          />
        );
      case 'confidence':
        return <ConfidenceScoring valuationId={valuationId} />;
      case 'conclusion':
        return <AdvisorConclusion valuationId={valuationId} />;
      case 'publish':
        return <PublishReadinessContent readiness={readiness} summary={summary} canPublish={canPublish} onOpenValidate={onNavigateToValidate} onPublish={handlePublish} publishing={publishing} publishError={publishError} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Valuation</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Determine the indicated Enterprise Value and Equity Value using verified evidence and approved methodologies.
        </p>
      </div>

      {/* Command header — reduced */}
      <ValuationCommandHeader summary={summary} calcSummary={calcSummary} readiness={readiness} />

      {/* Next action callout */}
      {nextAction && (
        <div className="rounded-xl p-3.5 flex items-start gap-3" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-primary/80">Recommended Next Action</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{nextAction.label}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{nextAction.why}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Unlocks: {nextAction.unlocks}</p>
          </div>
          <button
            onClick={handleNextAction}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-primary-foreground"
            style={{ background: 'hsl(var(--primary))' }}
          >
            {nextAction.isPublish ? 'Publish' : nextAction.linkToValidate ? 'Resolve' : 'Go'}
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Body — journey nav (left) + sections (right) */}
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
        {/* Journey navigation */}
        <div className="sm:sticky sm:top-4 sm:self-start">
          <ValuationJourneyNav steps={journey} activeStep={activeSection} onSelect={scrollToSection} />
        </div>

        {/* Sections with accordion + expand/collapse controls */}
        <div className="space-y-2.5">
          {/* Expand/Collapse controls */}
          <div className="flex items-center justify-end gap-2 pb-1">
            <button
              onClick={() => accordion.expandAll(SECTION_IDS)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              Expand All
            </button>
            <span className="text-muted-foreground/30">·</span>
            <button
              onClick={accordion.collapseAll}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Minimize2 className="w-3 h-3" />
              Collapse All
            </button>
          </div>

          {/* Collapsible sections */}
          {SECTION_IDS.map((sectionId) => {
            const meta = SECTION_META[sectionId];
            const config = sectionConfigs[sectionId] || {};
            const Icon = meta.icon;
            return (
              <CollapsibleSection
                key={sectionId}
                id={sectionId}
                icon={Icon}
                title={meta.title}
                subtitle={meta.subtitle}
                status={config.status}
                stale={config.stale}
                confidence={config.confidence}
                blockerCount={config.blockerCount || 0}
                primaryMetric={config.primaryMetric}
                primaryAction={config.primaryAction}
                secondaryAction={config.secondaryAction}
                isOpen={accordion.isOpen(sectionId)}
                onToggle={() => {
                  setActiveSection(sectionId);
                  accordion.toggle(sectionId);
                }}
                onPin={density === 'expert' ? () => accordion.pin(sectionId) : undefined}
                pinned={accordion.pinnedSections.has(sectionId)}
                density={density}
              >
                {renderSectionContent(sectionId)}
              </CollapsibleSection>
            );
          })}
        </div>
      </div>

      {/* Sticky action bar */}
      <ValuationActionBar
        nextAction={nextAction}
        canEdit={canEdit}
        canPublish={canPublish}
        isReady={readiness?.ready}
        onAction={handleNextAction}
        onPublish={handlePublish}
      />
    </div>
  );
}

// ── Publish readiness content (inline — thin display of backend result) ────
function PublishReadinessContent({ readiness, summary, canPublish, onOpenValidate, onPublish, publishing, publishError }) {
  const blockers = readiness?.critical_blockers || [];
  const warnings = readiness?.warnings || [];
  const isReady = readiness?.ready;

  return (
    <div className="space-y-3">
      {isReady && (
        <div className="rounded-lg p-4 flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <span className="text-2xl">✓</span>
          <div>
            <p className="text-sm font-semibold text-accent">Ready to Publish</p>
            <p className="text-xs text-muted-foreground mt-0.5">All critical checks pass. An immutable version can be created.</p>
          </div>
        </div>
      )}

      {blockers.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-2">Critical Blockers</p>
          <div className="space-y-1.5">
            {blockers.map((b, idx) => (
              <div key={idx} className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{b.message || b.blocker || b.title || 'Blocker'}</p>
                    {b.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{b.detail}</p>}
                    {b.recommended_resolution && <p className="text-[10px] text-primary mt-1">→ {b.recommended_resolution}</p>}
                  </div>
                  {onOpenValidate && (
                    <button onClick={onOpenValidate} className="text-[10px] text-primary hover:underline shrink-0">Resolve →</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-2">Warnings</p>
          <div className="space-y-1">
            {warnings.map((w, idx) => (
              <div key={idx} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-400" /> {w.message || w.warning || w}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
        <span>Published versions: {summary?.versionCount || 0}</span>
        {isReady && canPublish && (
          <button
            onClick={onPublish}
            disabled={publishing}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-primary-foreground disabled:opacity-50"
            style={{ background: 'hsl(var(--primary))' }}
          >
            {publishing ? 'Publishing…' : 'Publish Version'}
          </button>
        )}
      </div>

      {publishError && <p className="text-xs text-destructive">{publishError}</p>}
    </div>
  );
}