/**
 * BusinessQualitySummary — Phase 13.3E.4A
 *
 * Evidence-based diagnosis at the top of the Build Value workspace.
 * Shows the strongest and weakest dimensions, largest constraints, gaps,
 * and the single recommended next action. No fabricated scores.
 */
import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Target, Sparkles } from 'lucide-react';

export default function BusinessQualitySummary({ summary }) {
  if (!summary) return null;

  const items = [
    {
      icon: TrendingUp,
      label: 'Strongest Dimension',
      value: summary.strongest_dimension?.label || 'Insufficient evidence',
      detail: summary.strongest_dimension ? `${summary.strongest_dimension.completeness}% evidence` : null,
      tone: 'positive',
    },
    {
      icon: TrendingDown,
      label: 'Weakest Dimension',
      value: summary.weakest_dimension?.label || 'Insufficient evidence',
      detail: summary.weakest_dimension ? `${summary.weakest_dimension.completeness}% evidence` : null,
      tone: 'negative',
    },
    {
      icon: AlertTriangle,
      label: 'Largest EBITDA Constraint',
      value: summary.largest_ebitda_constraint?.label || 'None identified',
      detail: summary.largest_ebitda_constraint ? `${summary.largest_ebitda_constraint.count} missing input${summary.largest_ebitda_constraint.count !== 1 ? 's' : ''}` : null,
      tone: 'warning',
    },
    {
      icon: AlertTriangle,
      label: 'Largest Multiple Constraint',
      value: summary.largest_multiple_constraint?.label || 'None identified',
      detail: summary.largest_multiple_constraint ? `${summary.largest_multiple_constraint.count} missing input${summary.largest_multiple_constraint.count !== 1 ? 's' : ''}` : null,
      tone: 'warning',
    },
    {
      icon: AlertTriangle,
      label: 'Largest Transferability Risk',
      value: summary.largest_transferability_risk?.label || 'None identified',
      detail: summary.largest_transferability_risk ? `${summary.largest_transferability_risk.count} missing input${summary.largest_transferability_risk.count !== 1 ? 's' : ''}` : null,
      tone: 'warning',
    },
    {
      icon: Target,
      label: 'Largest Evidence Gap',
      value: summary.largest_evidence_gap?.label || 'No gaps',
      detail: summary.largest_evidence_gap ? `${summary.largest_evidence_gap.completeness}% complete` : null,
      tone: 'neutral',
    },
    {
      icon: Sparkles,
      label: 'Highest-Confidence Strength',
      value: summary.highest_confidence_strength
        ? `${summary.highest_confidence_strength.dimension}: ${summary.highest_confidence_strength.label}`
        : 'No verified strengths yet',
      detail: summary.highest_confidence_strength ? `${summary.highest_confidence_strength.confidence}% confidence` : null,
      tone: 'positive',
    },
  ];

  const toneColors = {
    positive: { color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)' },
    negative: { color: '#EF4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
    warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
    neutral: { color: '#00D4FF', bg: 'rgba(0,212,255,0.06)', border: 'rgba(0,212,255,0.2)' },
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-display font-bold text-foreground">Business Quality Summary</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          An evidence-based diagnosis of the business. This is not the Growth Plan — it describes what the evidence says today.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {items.map((item) => {
          const tone = toneColors[item.tone];
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-lg p-3"
              style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="w-3 h-3" style={{ color: tone.color }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tone.color }}>
                  {item.label}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground leading-tight">{item.value}</p>
              {item.detail && <p className="text-[10px] text-muted-foreground mt-1">{item.detail}</p>}
            </div>
          );
        })}
      </div>

      {/* Recommended next action */}
      {summary.recommended_next_action && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.2)' }}
        >
          <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Recommended next action</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {summary.recommended_next_action.dimension
                ? `${summary.recommended_next_action.dimension}: ${summary.recommended_next_action.action}`
                : summary.recommended_next_action.action}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}