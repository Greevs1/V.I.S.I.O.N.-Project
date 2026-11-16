/**
 * DataReadiness — Phase 13.1 first working feature.
 * Inspects existing platform data (read-only, never overwrites).
 * Shows Available / Partial / Missing / Needs Review per category with confidence + source.
 */
import React, { useEffect, useState } from 'react';
import { getDataReadiness } from '@/lib/valuationService';
import { CheckCircle2, AlertCircle, XCircle, FileSearch, RefreshCw } from 'lucide-react';

const STATUS_CONFIG = {
  available: { icon: CheckCircle2, color: '#10B981', label: 'Available' },
  partial: { icon: AlertCircle, color: '#F59E0B', label: 'Partial' },
  missing: { icon: XCircle, color: '#EF4444', label: 'Missing' },
  needs_review: { icon: FileSearch, color: '#D4A853', label: 'Needs Review' },
};

export default function DataReadiness({ businessId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getDataReadiness(businessId);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load data readiness');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [businessId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button onClick={load} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { categories, overall } = data;

  return (
    <div className="space-y-6">
      {/* Overall readiness score */}
      <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.06) 0%, transparent 100%)', border: '1px solid rgba(212,168,83,0.15)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-1">Data Readiness</p>
            <h3 className="text-lg font-semibold">Platform Intelligence Inventory</h3>
            <p className="text-xs text-muted-foreground mt-1">Read-only inspection of existing business data available for valuation.</p>
          </div>
          <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-display font-bold text-primary">{overall.readiness_score}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Readiness</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-display font-bold">{overall.confidence}%</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-display font-bold">{overall.available_count}/{overall.total_count}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Categories</p>
          </div>
        </div>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat) => {
          const cfg = STATUS_CONFIG[cat.status] || STATUS_CONFIG.missing;
          const Icon = cfg.icon;
          return (
            <div key={cat.key} className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  <p className="text-sm font-medium">{cat.label}</p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: `${cfg.color}15` }}>
                  {cfg.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${cat.confidence}%`, background: cfg.color }} />
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">{cat.confidence}%</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mb-2">Source: <span className="font-mono">{cat.source}</span></p>
              {cat.missing_requirements?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Missing</p>
                  {cat.missing_requirements.map((req, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-red-400/60" />
                      {req}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}