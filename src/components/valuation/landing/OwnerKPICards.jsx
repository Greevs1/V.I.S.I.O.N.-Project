/**
 * OwnerKPICards — Phase 13.3F.2
 *
 * Four compact KPI cards below the main value panel.
 * Each shows: metric, value (or workflow state), status, change,
 * plain-language explanation, and a link to the relevant workspace.
 */
import React from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const STATUS_COLOR = {
  complete: '#22c55e',
  in_progress: '#00D4FF',
  not_started: '#6B7280',
  stale: '#F59E0B',
  blocked: '#EF4444',
};

function ChangeBadge({ change }) {
  if (!change) return null;
  const isPositive = change.startsWith('+');
  const isNegative = change.startsWith('−') || change.startsWith('-');
  const color = isPositive ? '#22c55e' : isNegative ? '#EF4444' : '#6B7280';
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium" style={{ color }}>
      <Icon className="w-2.5 h-2.5" />
      {change}
    </span>
  );
}

function KPICard({ card, onNavigate }) {
  const color = STATUS_COLOR[card.status] || '#6B7280';
  return (
    <button
      onClick={() => onNavigate?.(card.link)}
      className="text-left rounded-xl p-4 transition-all hover:bg-white/[0.02] w-full"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{card.metric}</p>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      </div>
      {card.value ? (
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-display font-semibold text-foreground">{card.value}</p>
          {card.change && <ChangeBadge change={card.change} />}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/70 italic">{card.workflowState || 'Not available'}</p>
      )}
      <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">{card.explanation}</p>
      {card.value && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-primary/70">
          <span>Open</span>
          <ArrowRight className="w-2.5 h-2.5" />
        </div>
      )}
    </button>
  );
}

export default function OwnerKPICards({ cards, onNavigate }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <KPICard key={card.key} card={card} onNavigate={onNavigate} />
      ))}
    </div>
  );
}