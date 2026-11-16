import React from 'react';
import { motion } from 'framer-motion';
import { calculateBusinessImpactScore } from '@/lib/businessIntelligenceState';

/**
 * Business Impact Score — always visible, always BIS-driven.
 * Execution readiness score: how complete is the intelligence profile?
 * NOT the IQ Score.
 */
export default function BusinessImpactScore({ bis }) {
  const result = calculateBusinessImpactScore(bis);

  // Even with zero data, render with a 0 score so it's never blank
  const impact_score = result?.impact_score ?? 0;
  const impact_label = result?.impact_label ?? 'Getting Started';
  const impact_description = result?.impact_description ?? 'Complete your first assessment to begin building your intelligence profile.';
  const completion_percent = result?.completion_percent ?? 0;
  const confidence = result?.confidence ?? 'low';
  const remaining_unknowns = result?.remaining_unknowns ?? [];
  const identified_opportunity = result?.identified_opportunity ?? 0;
  const dims = result?.dimensions ?? {};

  const fmtMoney = (n) => {
    if (!n || n === 0) return null;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(n / 1000)}K`;
  };

  const confidenceColor = { high: '#10B981', medium: '#D4A853', low: '#9CA3AF' };
  const scoreColor = impact_score >= 80 ? '#10B981' : impact_score >= 50 ? '#D4A853' : impact_score >= 25 ? '#3B82F6' : '#9CA3AF';

  const DIM_ORDER = ['profit', 'value', 'tax', 'operations', 'recast', 'freedom', 'documents', 'assessment', 'sprint', 'scenario'];

  return (
    <div className="glass rounded-xl p-6">
      <div className="mb-4">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-1">
          Business Impact Score
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Intelligence profile completeness — measures how much of your measurable opportunity has been identified.
        </p>
      </div>

      <div className="flex items-center gap-6 mb-5">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="text-center shrink-0"
        >
          <span className="text-5xl font-display font-bold" style={{ color: scoreColor }}>{impact_score}</span>
          <span className="text-xl text-muted-foreground">/100</span>
        </motion.div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: scoreColor }}>{impact_label}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: `${confidenceColor[confidence]}15`, color: confidenceColor[confidence], border: `1px solid ${confidenceColor[confidence]}30` }}>
              {confidence} confidence
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <motion.div
              className="h-1.5 rounded-full"
              style={{ background: scoreColor }}
              initial={{ width: 0 }}
              animate={{ width: `${impact_score}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{impact_description}</p>
          {identified_opportunity > 0 && (
            <p className="text-xs font-medium" style={{ color: '#D4A853' }}>
              {fmtMoney(identified_opportunity)} in identified opportunity
            </p>
          )}
        </div>
      </div>

      {/* Dimension grid */}
      {Object.keys(dims).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {DIM_ORDER.filter(k => dims[k]).map(key => {
            const d = dims[key];
            return (
              <div key={key}
                className="rounded-lg px-2 py-1.5 text-center"
                style={{ background: d.present ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${d.present ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                <p className="text-[10px] font-medium" style={{ color: d.present ? '#10B981' : '#6B7280' }}>
                  {d.present ? '✓' : '—'}
                </p>
                <p className="text-[9px] text-muted-foreground truncate">{d.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Remaining unknowns */}
      {remaining_unknowns.length > 0 && impact_score < 80 && (
        <p className="text-[10px] text-muted-foreground/60 mt-3">
          Still needed: {remaining_unknowns.slice(0, 4).join(', ')}{remaining_unknowns.length > 4 ? ` +${remaining_unknowns.length - 4} more` : ''}
        </p>
      )}
    </div>
  );
}