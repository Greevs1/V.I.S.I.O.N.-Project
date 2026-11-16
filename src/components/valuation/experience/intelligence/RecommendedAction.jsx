/**
 * RecommendedAction — sticky single primary next action.
 */
import React from 'react';
import { ArrowRight, AlertTriangle, FileQuestion, ShieldCheck, Clock, Sparkles } from 'lucide-react';

const PRIORITY_CONFIG = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', icon: AlertTriangle },
  high: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: FileQuestion },
  medium: { color: '#00D4FF', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.25)', icon: ShieldCheck },
  low: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)', icon: Sparkles },
};

export default function RecommendedAction({ action }) {
  if (!action) return null;
  const cfg = PRIORITY_CONFIG[action.priority] || PRIORITY_CONFIG.medium;
  const Icon = cfg.icon;
  return (
    <div className="sticky top-2 rounded-xl p-4 flex items-center gap-3 z-10" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, backdropFilter: 'blur(8px)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cfg.color}20` }}>
        <Icon className="w-4 h-4" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{action.title}</p>
        <p className="text-xs text-muted-foreground">{action.detail}</p>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: cfg.color }}>{action.priority}</span>
      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}