/**
 * ExecutiveInsights — Phase 13.3E.5
 *
 * The executive Insights area. Answers:
 *   - What is creating value?
 *   - What is suppressing value?
 *   - What is limiting EBITDA / multiple / transferability?
 *   - What evidence is missing?
 *   - What changed since the previous valuation?
 *   - What deserves attention first?
 *
 * Uses only approved valuation calculations, verified intelligence, Build
 * Value dimensions, approved value drivers, approved confidence results,
 * Version Intelligence, and advisor-approved findings.
 *
 * This component is embedded in the Build Value workspace and also accessible
 * from the Valuation workspace. It does not recalculate anything.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles, TrendingUp, AlertTriangle, Target, Zap, GitCompare, ArrowRight } from 'lucide-react';
import { getValueDrivers } from '@/lib/valuationCalculationService';
import { getVersionDeltas } from '@/lib/valuationService';
import { buildExecutiveInsights } from '@/lib/valuation/insightsEngine';
import CurrentValueSummary from './CurrentValueSummary';
import ValueDriverCard from './ValueDriverCard';
import ValueDetractorCard from './ValueDetractorCard';
import ConstraintSummary from './ConstraintSummary';
import FastestWins from './FastestWins';
import VersionIntelligencePanel from './VersionIntelligencePanel';

function SectionHeader({ icon: Icon, title, subtitle, count }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {count != null && <span className="text-[10px] text-muted-foreground">({count})</span>}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

export default function ExecutiveInsights({
  valuationId,
  intelligence,
  calcSummary,
  readiness,
  summary,
  onNavigateToValidate,
  onNavigateToBuildValue,
  onOpenAdvanced,
}) {
  const [valueDrivers, setValueDrivers] = useState(null);
  const [versionDeltas, setVersionDeltas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!valuationId) return;
    setLoading(true);
    setError(null);
    try {
      const [drivers, deltas] = await Promise.all([
        getValueDrivers(valuationId).catch(() => []),
        getVersionDeltas(valuationId).catch(() => ({ deltas: [] })),
      ]);
      // Extract arrays from response objects — backend returns { valueDrivers: [...] }
      // and { deltas: [...] }. Without extraction, .filter() crashes on the object.
      setValueDrivers(Array.isArray(drivers?.valueDrivers) ? drivers.valueDrivers : (Array.isArray(drivers) ? drivers : []));
      setVersionDeltas(Array.isArray(deltas?.deltas) ? deltas.deltas : (Array.isArray(deltas) ? deltas : []));
    } catch (err) {
      setError(err.message || 'Failed to load insights data');
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading executive insights…</span>
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

  const insights = buildExecutiveInsights({
    intelligence,
    calcSummary,
    readiness,
    summary,
    valueDrivers,
    versionDeltas,
  });

  const { currentValue, topDrivers, topDetractors, constraintSummary, fastestWins, versionIntelligence, nextAction } = insights;

  return (
    <div className="space-y-6">
      {/* Insights header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-display font-bold text-foreground">Executive Insights</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Evidence-based insights from approved valuation results, Build Value dimensions, and version intelligence.
        </p>
      </div>

      {/* Next action */}
      {nextAction && (
        <div
          className="rounded-xl p-3.5 flex items-center gap-3"
          style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.2)' }}
        >
          <Target className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended Next Action</p>
            <p className="text-xs text-foreground mt-0.5">{nextAction.label}</p>
          </div>
          {nextAction.link && (
            <button
              onClick={() => {
                if (nextAction.link === 'validate') onNavigateToValidate?.();
                else if (nextAction.link === 'build_value') onNavigateToBuildValue?.();
              }}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
            >
              Go <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Current Value Summary */}
      <div>
        <SectionHeader icon={Target} title="Current Value Summary" subtitle="Indicated Enterprise Value, Equity Value, Defensible Value, and Potential Value" />
        <CurrentValueSummary currentValue={currentValue} />
      </div>

      {/* Top Value Drivers */}
      <div>
        <SectionHeader icon={TrendingUp} title="Top Value Drivers" subtitle="Evidence-supported value enhancers" count={topDrivers.length} />
        {topDrivers.length === 0 ? (
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs text-muted-foreground">No approved value drivers yet. Complete Build Value and Valuation to surface evidence-supported enhancers.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {topDrivers.slice(0, 6).map((driver) => (
              <ValueDriverCard key={driver.id} driver={driver} onExplain={() => onOpenAdvanced?.()} />
            ))}
          </div>
        )}
      </div>

      {/* Top Value Detractors */}
      <div>
        <SectionHeader icon={AlertTriangle} title="Top Value Detractors" subtitle="Evidence-supported value suppressors" count={topDetractors.length} />
        {topDetractors.length === 0 ? (
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <p className="text-xs text-muted-foreground">No material detractors identified. Evidence is sufficient.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {topDetractors.slice(0, 6).map((d) => (
              <ValueDetractorCard key={d.id} detractor={d} onNavigateToValidate={onNavigateToValidate} />
            ))}
          </div>
        )}
      </div>

      {/* Constraint Summary */}
      <div>
        <SectionHeader icon={AlertTriangle} title="Constraint Summary" subtitle="Largest constraints limiting value, confidence, and publication" />
        <ConstraintSummary
          constraints={constraintSummary}
          onNavigateToValidate={onNavigateToValidate}
          onNavigateToBuildValue={onNavigateToBuildValue}
        />
      </div>

      {/* Fastest Wins */}
      <div>
        <SectionHeader icon={Zap} title="Fastest Wins" subtitle="Candidate opportunities supported by current evidence" count={fastestWins.length} />
        <FastestWins wins={fastestWins} onNavigateToValidate={onNavigateToValidate} />
      </div>

      {/* Version Intelligence */}
      <div>
        <SectionHeader icon={GitCompare} title="Version Intelligence" subtitle="What changed since the previous valuation" />
        <VersionIntelligencePanel versionIntelligence={versionIntelligence} onOpenAdvanced={onOpenAdvanced} />
      </div>
    </div>
  );
}