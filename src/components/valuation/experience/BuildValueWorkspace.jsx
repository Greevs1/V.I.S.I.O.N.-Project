/**
 * BuildValueWorkspace — Phase 13.3F.1
 *
 * Apple-style progressive disclosure for Build Value. Shows a calm top-level
 * summary (strongest/weakest dimension, largest constraints, next action)
 * and collapses the six institutional dimensions into an accordion. Each
 * dimension collapses to: score, confidence, one strength, one risk, one
 * missing evidence item, EBITDA relevance, multiple relevance. Expanded
 * detail shows the full DimensionScorecard.
 *
 * No calculation, permission, audit, versioning, or publication logic changed.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, RefreshCw, Sparkles, Database, ArrowRight, DollarSign, TrendingUp, Users, Settings, UserCheck, Shield, BarChart3, Maximize2, Minimize2 } from 'lucide-react';
import { getValuationIntelligence } from '@/lib/valuationIntelligenceService';
import { buildValueAssessment, BUILD_VALUE_DIMENSION_KEYS } from '@/lib/valuation/buildValueEngine';
import BusinessQualitySummary from './buildvalue/BusinessQualitySummary';
import DimensionScorecard from './buildvalue/DimensionScorecard';
import ExecutiveInsights from './insights/ExecutiveInsights';
import CollapsibleSection from './shared/CollapsibleSection';
import { useAccordionState } from '@/hooks/useAccordionState';

const DIMENSION_ICONS = {
  financial_quality: DollarSign,
  growth_quality: TrendingUp,
  commercial_quality: Users,
  operational_quality: Settings,
  leadership_transferability: UserCheck,
  risk_governance: Shield,
};

function dimStatus(scorecard) {
  if (scorecard.current_score == null) {
    return scorecard.evidence_completeness > 0 ? 'in_progress' : 'not_started';
  }
  if (scorecard.current_score >= 70) return 'complete';
  if (scorecard.current_score >= 50) return 'in_progress';
  return 'needs_review';
}

export default function BuildValueWorkspace({ valuationId, intelligence, onIntelligenceLoaded, canEdit, calcSummary, readiness, summary, onNavigateToValidate, onOpenAdvanced, density = 'summary' }) {
  const [localIntel, setLocalIntel] = useState(null);
  const [loading, setLoading] = useState(!intelligence);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!valuationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getValuationIntelligence(valuationId);
      setLocalIntel(res.intelligence);
      if (onIntelligenceLoaded) onIntelligenceLoaded(res.intelligence);
    } catch (err) {
      setError(err.message || 'Failed to load business intelligence');
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => {
    if (!intelligence) load();
  }, [load, intelligence]);

  const activeIntelligence = intelligence || localIntel;

  // Accordion for dimensions
  const businessId = summary?.valuation?.business_id || summary?.business?.id || 'unknown';
  const accordionKey = `buildvalue_accordion_${valuationId}_${businessId}`;
  const accordion = useAccordionState(accordionKey, null);

  // Compute scorecards and summary — hooks must be before any early return
  const { scorecards, summary: bvSummary } = useMemo(
    () => activeIntelligence ? buildValueAssessment(activeIntelligence) : { scorecards: [], summary: null },
    [activeIntelligence]
  );

  // Initial open dimension — first one needing attention
  const initialOpenDim = useMemo(() => {
    const needsAttention = scorecards.find((sc) => sc.current_score == null || sc.evidence_completeness < 60);
    return needsAttention?.key || scorecards[0]?.key || null;
  }, [scorecards]);

  // Open initial dimension on first load if nothing is open
  useEffect(() => {
    if (initialOpenDim && !accordion.openSection && accordion.pinnedSections.size === 0) {
      accordion.setOpenSection(initialOpenDim);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenDim]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Organizing business quality evidence…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <button onClick={load} className="text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (!activeIntelligence) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Build Value</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Understand the strengths, weaknesses, risks, and capabilities that influence profitability, transferability, and valuation multiple.
          </p>
        </div>
        <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <Database className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No intelligence data available yet.</p>
          <p className="text-[10px] text-muted-foreground/70 mt-2">
            Run the Intelligence Scan in Discover to gather and organize business evidence, then return here to review business quality.
          </p>
          <button
            onClick={load}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#D4A853', color: '#08080C' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Build Value</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Understand the strengths, weaknesses, risks, and capabilities that influence profitability, transferability, and valuation multiple.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs hover:text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* Top-level summary — calm, spacious, Apple-style */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Strongest / Weakest */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryItem
            label="Strongest Dimension"
            value={bvSummary?.strongest_dimension?.label || 'Insufficient data'}
            hint={bvSummary?.strongest_dimension ? `${bvSummary.strongest_dimension.completeness}% evidence` : ''}
            tone="positive"
          />
          <SummaryItem
            label="Weakest Dimension"
            value={bvSummary?.weakest_dimension?.label || 'Insufficient data'}
            hint={bvSummary?.weakest_dimension ? `${bvSummary.weakest_dimension.completeness}% evidence` : ''}
            tone="warning"
          />
        </div>

        {/* Constraints */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-white/[0.04]">
          <SummaryItem
            label="Largest EBITDA Constraint"
            value={bvSummary?.largest_ebitda_constraint?.label || 'Not identified'}
            hint={bvSummary?.largest_ebitda_constraint ? `${bvSummary.largest_ebitda_constraint.count} gap${bvSummary.largest_ebitda_constraint.count !== 1 ? 's' : ''}` : ''}
          />
          <SummaryItem
            label="Largest Multiple Constraint"
            value={bvSummary?.largest_multiple_constraint?.label || 'Not identified'}
            hint={bvSummary?.largest_multiple_constraint ? `${bvSummary.largest_multiple_constraint.count} gap${bvSummary.largest_multiple_constraint.count !== 1 ? 's' : ''}` : ''}
          />
          <SummaryItem
            label="Largest Transferability Risk"
            value={bvSummary?.largest_transferability_risk?.label || 'Not identified'}
            hint={bvSummary?.largest_transferability_risk ? `${bvSummary.largest_transferability_risk.count} gap${bvSummary.largest_transferability_risk.count !== 1 ? 's' : ''}` : ''}
          />
        </div>

        {/* Recommended next action */}
        {bvSummary?.recommended_next_action && (
          <div className="flex items-start gap-3 pt-3 border-t border-white/[0.04]">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended Next Action</p>
              <p className="text-sm text-foreground mt-0.5">
                {bvSummary.recommended_next_action.dimension
                  ? `${bvSummary.recommended_next_action.dimension}: `
                  : ''
                }
                {bvSummary.recommended_next_action.action}
              </p>
            </div>
            {onNavigateToValidate && (
              <button
                onClick={onNavigateToValidate}
                className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Resolve
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Executive Insights — collapsible, collapsed by default */}
      <CollapsibleSection
        id="executive_insights"
        icon={Sparkles}
        title="Executive Insights"
        subtitle="Value drivers, detractors, constraints, and opportunities"
        status="in_progress"
        isOpen={accordion.isOpen('executive_insights')}
        onToggle={() => accordion.toggle('executive_insights')}
        density={density}
      >
        <ExecutiveInsights
          valuationId={valuationId}
          intelligence={activeIntelligence}
          calcSummary={calcSummary}
          readiness={readiness}
          summary={summary}
          onNavigateToValidate={onNavigateToValidate}
          onNavigateToBuildValue={() => {}}
          onOpenAdvanced={onOpenAdvanced}
        />
      </CollapsibleSection>

      {/* Business Quality Summary — collapsible */}
      <CollapsibleSection
        id="quality_summary"
        icon={BarChart3}
        title="Business Quality Summary"
        subtitle="Evidence-based diagnosis of business performance"
        status="complete"
        isOpen={accordion.isOpen('quality_summary')}
        onToggle={() => accordion.toggle('quality_summary')}
        density={density}
      >
        <BusinessQualitySummary summary={bvSummary} />
      </CollapsibleSection>

      {/* Six Institutional Dimensions — accordion */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-sm font-semibold text-foreground">Six Institutional Dimensions</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => accordion.expandAll([...BUILD_VALUE_DIMENSION_KEYS, 'executive_insights', 'quality_summary'])}
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
        </div>

        {scorecards.map((sc) => {
          const Icon = DIMENSION_ICONS[sc.key] || BarChart3;
          const oneStrength = Array.isArray(sc.strengths) && sc.strengths.length > 0 ? sc.strengths[0] : null;
          const oneRisk = Array.isArray(sc.risks) && sc.risks.length > 0 ? sc.risks[0] : null;
          const oneMissing = Array.isArray(sc.missing_evidence) && sc.missing_evidence.length > 0 ? sc.missing_evidence[0] : null;

          return (
            <CollapsibleSection
              key={sc.key}
              id={`dim_${sc.key}`}
              icon={Icon}
              title={sc.label}
              subtitle={`EBITDA: ${sc.ebitda_relevance || '—'} · Multiple: ${sc.multiple_relevance || '—'}`}
              status={dimStatus(sc)}
              confidence={sc.confidence}
              primaryMetric={{
                label: 'Score',
                value: sc.current_score != null ? `${sc.current_score}/100` : 'Insufficient data',
              }}
              summary={
                <div className="space-y-1">
                  {oneStrength && <p className="text-[11px] text-muted-foreground"><span className="text-accent/80">Strength:</span> {oneStrength.label}</p>}
                  {oneRisk && <p className="text-[11px] text-muted-foreground"><span className="text-amber-400/80">Risk:</span> {oneRisk.label}</p>}
                  {oneMissing && <p className="text-[11px] text-muted-foreground"><span className="text-destructive/70">Missing:</span> {oneMissing.label || oneMissing}</p>}
                </div>
              }
              isOpen={accordion.isOpen(`dim_${sc.key}`)}
              onToggle={() => accordion.toggle(`dim_${sc.key}`)}
              onPin={density === 'expert' ? () => accordion.pin(`dim_${sc.key}`) : undefined}
              pinned={accordion.pinnedSections.has(`dim_${sc.key}`)}
              density={density}
            >
              <DimensionScorecard scorecard={sc} />
            </CollapsibleSection>
          );
        })}
      </div>

      {/* Footnote */}
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Scorecards reflect actual applicable questions, assessment results, verified intelligence, and valuation drivers.
        When information is insufficient, "Insufficient verified information" is shown. No scores are fabricated.
        This workspace does not calculate Enterprise Value — it diagnoses business quality before the valuation.
      </p>
    </div>
  );
}

function SummaryItem({ label, value, hint, tone }) {
  const toneColor = tone === 'positive' ? '#22c55e' : tone === 'warning' ? '#F59E0B' : '#6B7280';
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-1">{value}</p>
      {hint && <p className="text-[11px] mt-0.5" style={{ color: toneColor }}>{hint}</p>}
    </div>
  );
}