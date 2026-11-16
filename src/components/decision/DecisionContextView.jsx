import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, AlertCircle, CheckCircle2, Info } from 'lucide-react';

/**
 * Shows the composed Decision Context — certified intelligence from the
 * Shared Business Intelligence Contract, Business Memory, Timeline, etc.
 */
export default function DecisionContextView({ context, readiness }) {
  if (!context) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="text-center">
          <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Build context to see certified intelligence</p>
        </div>
      </div>
    );
  }

  const readinessColors = {
    insufficient_information: '#EF4444',
    partially_informed: '#F59E0B',
    decision_ready: '#10B981',
    needs_advisor_review: '#D4A853',
    blocked: '#EF4444',
  };
  const readinessColor = readinessColors[readiness?.readiness] || '#9CA3AF';

  return (
    <div className="space-y-4">
      {/* Readiness */}
      {readiness && (
        <div className="glass rounded-lg p-3 flex items-start gap-3" style={{ borderLeft: `3px solid ${readinessColor}` }}>
          {readiness.readiness === 'decision_ready' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: readinessColor }} />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: readinessColor }} />
          )}
          <div className="flex-1">
            <p className="text-xs font-semibold capitalize" style={{ color: readinessColor }}>
              {readiness.readiness.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{readiness.reason}</p>
          </div>
        </div>
      )}

      {/* Financial Metrics */}
      {context.relevant_financial_metrics?.length > 0 && (
        <ContextSection title="Financial Metrics" source="Shared Intelligence Contract">
          {context.relevant_financial_metrics.map((m) => (
            <MetricRow key={m.key} label={m.label} value={m.value} material={m.material} />
          ))}
        </ContextSection>
      )}

      {/* Valuation Metrics */}
      {context.relevant_valuation_metrics?.length > 0 && (
        <ContextSection title="Valuation Metrics" source="Shared Intelligence Contract">
          {context.relevant_valuation_metrics.map((m) => (
            <MetricRow key={m.key} label={m.label} value={m.value} material={m.material} />
          ))}
        </ContextSection>
      )}

      {/* Relevant Memories */}
      {context.relevant_memories?.length > 0 && (
        <ContextSection title="Historical Context" source="Business Memory">
          {context.relevant_memories.slice(0, 5).map((m) => (
            <div key={m.memory_id} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
              <p className="font-medium text-foreground">{m.title}</p>
              <p className="text-muted-foreground mt-0.5">{m.summary}</p>
              {m.effective_date && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{m.effective_date}</p>
              )}
            </div>
          ))}
        </ContextSection>
      )}

      {/* Missing Information */}
      {context.missing_information?.length > 0 && (
        <ContextSection title="Missing Information" source="Decision Analysis">
          {context.missing_information.map((u) => (
            <div key={u.unknown_id} className="text-xs flex items-start gap-2 py-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="font-medium text-foreground">{u.what_is_missing}</p>
                <p className="text-muted-foreground">{u.why_it_matters}</p>
                {u.blocks_decision && (
                  <span className="text-[10px] text-red-400 font-medium">Blocks decision</span>
                )}
              </div>
            </div>
          ))}
        </ContextSection>
      )}

      {/* Sources */}
      {context._meta?.sources_used?.length > 0 && (
        <div className="text-[10px] text-muted-foreground/50 pt-2 border-t border-border">
          Sources: {context._meta.sources_used.join(', ')}
        </div>
      )}
    </div>
  );
}

function ContextSection({ title, source, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
        <span className="text-[9px] text-muted-foreground/50">{source}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MetricRow({ label, value, material }) {
  const fmtValue = (v) => {
    if (v == null) return '—';
    if (typeof v === 'number') {
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}K`;
      return `$${v}`;
    }
    return String(v);
  };
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{fmtValue(value)}</span>
    </div>
  );
}