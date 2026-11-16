import React from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CATEGORIES = [
  { key: 'financial',  label: 'Financial',  color: '#D4A853' },
  { key: 'legal',      label: 'Legal',      color: '#60A5FA' },
  { key: 'hr',         label: 'HR',         color: '#A78BFA' },
  { key: 'operations', label: 'Operations', color: '#FBBF24' },
];

export default function ReadinessMetrics({ items, onAiSync, syncing }) {
  const total = items.length;
  const completed = items.filter(i => i.status === 'completed').length;
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className="rounded-xl p-6 space-y-5"
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80 mb-0.5">Overall Readiness</p>
          <p className="text-xs text-muted-foreground">
            {completed} of {total} items completed · {total - completed} remaining
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-border/60 text-muted-foreground hover:text-foreground h-8"
            onClick={onAiSync}
            disabled={syncing}
          >
            {syncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {syncing ? 'Syncing…' : 'Sync Readiness'}
          </Button>
          <span
            className="text-4xl font-bold tabular-nums"
            style={{ fontFamily: 'var(--font-display)', color: '#D4A853' }}
          >
            {overallPct}%
          </span>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${overallPct}%`, background: 'linear-gradient(90deg, #D4A853 0%, #F5D89A 100%)' }}
        />
      </div>

      {/* Per-category bars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 pt-1">
        {CATEGORIES.map(cat => {
          const catItems = items.filter(i => i.category === cat.key);
          const catDone = catItems.filter(i => i.status === 'completed').length;
          const pct = catItems.length > 0 ? Math.round((catDone / catItems.length) * 100) : 0;
          return (
            <div key={cat.key} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{cat.label}</span>
                <span className="text-[10px] text-muted-foreground">{catDone}/{catItems.length}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: cat.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}