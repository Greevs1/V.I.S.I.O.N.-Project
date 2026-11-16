/**
 * OutcomeImpactSummary — Phase 5: Client-facing verified impact summary.
 * Shows only verified outcomes. Additive — does not replace any existing section.
 * Only renders when there is meaningful verified data.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';

function fmt(val) {
  if (val == null || val === 0) return null;
  const abs = Math.abs(val);
  if (abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${Math.round(abs / 1000)}K`;
  return `$${Math.round(abs).toLocaleString()}`;
}

function VariancePill({ variance }) {
  if (variance == null) return null;
  const isPos = variance > 0;
  const isNeg = variance < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? 'text-emerald-400' : isNeg ? 'text-red-400' : 'text-muted-foreground';
  const formatted = isPos ? `+${fmt(variance)}` : fmt(variance);
  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {formatted}
    </span>
  );
}

export default function OutcomeImpactSummary({ businessId, profileId }) {
  const { data } = useQuery({
    queryKey: ['outcome-impact-summary', businessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('recalculateStrategyLearningSummary', {
        action: 'getForContext',
        business_id: businessId,
        profile_id: profileId,
      });
      return res.data || null;
    },
    enabled: !!(businessId || profileId),
    staleTime: 5 * 60 * 1000,
  });

  // Don't render if no verified outcomes
  if (!data?.outcome_summary?.verified_count || data.outcome_summary.verified_count === 0) return null;

  const { outcome_summary } = data;
  const hasActual = outcome_summary.total_actual_impact > 0;

  return (
    <div className="glass-gold rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-foreground">Verified Impact Results</h3>
        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">
          {outcome_summary.verified_count} Verified
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {hasActual && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Actual Impact</p>
            <p className="text-xl font-bold text-emerald-400">{fmt(outcome_summary.total_actual_impact)}</p>
            <p className="text-[10px] text-muted-foreground">verified results</p>
          </div>
        )}

        {outcome_summary.total_projected_impact > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projected Impact</p>
            <p className="text-xl font-bold">{fmt(outcome_summary.total_projected_impact)}</p>
            <p className="text-[10px] text-muted-foreground">across all strategies</p>
          </div>
        )}

        {outcome_summary.total_variance != null && hasActual && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Variance</p>
            <div className="flex items-center gap-1">
              <VariancePill variance={outcome_summary.total_variance} />
            </div>
            <p className="text-[10px] text-muted-foreground">vs projected</p>
          </div>
        )}

        {outcome_summary.average_accuracy_percentage != null && (
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Accuracy</p>
            <p className={`text-xl font-bold ${
              outcome_summary.average_accuracy_percentage >= 90 ? 'text-emerald-400'
                : outcome_summary.average_accuracy_percentage >= 70 ? 'text-amber-400'
                : 'text-red-400'
            }`}>{Math.round(outcome_summary.average_accuracy_percentage)}%</p>
            <p className="text-[10px] text-muted-foreground">actual / projected</p>
          </div>
        )}
      </div>

      {outcome_summary.pending_actuals_count > 0 && (
        <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-3">
          <span className="text-amber-400">{outcome_summary.pending_actuals_count}</span> completed {outcome_summary.pending_actuals_count === 1 ? 'strategy' : 'strategies'} awaiting actual results from your advisor.
        </p>
      )}
    </div>
  );
}