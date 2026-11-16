/**
 * WeightingSection — Phase 13.3E.4
 *
 * Lightweight UI for the certified historical-weighting engine. Calls
 * getHistoricalWeighting / saveHistoricalWeighting backend actions. Does
 * not calculate anything in the browser — the backend engine is the
 * source of truth.
 */
import React, { useState, useEffect } from 'react';
import { getHistoricalWeighting, saveHistoricalWeighting } from '@/lib/valuationCalculationService';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { fmtCurrency } from '@/lib/valuation/valuationState';

const METHODS = [
  { value: 'latest_period', label: 'Latest Period' },
  { value: 'ttm', label: 'TTM' },
  { value: 'simple_average', label: 'Simple Average' },
  { value: 'weighted_average', label: 'Weighted Average' },
  { value: 'trend_adjusted', label: 'Trend-Adjusted' },
  { value: 'advisor_selected', label: 'Advisor-Selected' },
  { value: 'forecast_supported', label: 'Forecast-Supported' },
];

export default function WeightingSection({ valuationId, canEdit }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!valuationId) return;
    setLoading(true);
    getHistoricalWeighting(valuationId)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [valuationId]);

  const handleSave = async () => {
    if (!data?.weightings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveHistoricalWeighting(valuationId, data.weightings);
      setData(res);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>;
  }

  const weightings = data?.weightings || [];
  const method = data?.weighting_method || data?.method || '';
  const maintainable = data?.maintainable_earnings ?? data?.result?.maintainable_earnings;
  const isApproved = data?.is_approved;
  const isStale = data?.is_stale;
  const totalWeight = weightings.reduce((s, w) => s + (w.weight || 0), 0);

  return (
    <div className="space-y-3">
      {/* Method selector */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Weighting Method</label>
        <select
          value={method}
          disabled={!canEdit}
          onChange={(e) => setData((prev) => ({ ...prev, weighting_method: e.target.value, method: e.target.value }))}
          className="w-full mt-1 rounded-lg bg-background border border-border text-sm px-3 py-2 text-foreground disabled:opacity-50"
        >
          <option value="">Select method…</option>
          {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Period weights */}
      {weightings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Period Weights</p>
            <span className={`text-xs font-semibold ${Math.abs(totalWeight - 100) < 0.1 ? 'text-accent' : 'text-destructive'}`}>
              Total: {totalWeight.toFixed(0)}%
            </span>
          </div>
          {weightings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1 truncate">{w.period_label || w.period || `Period ${idx + 1}`}</span>
              <span className="text-xs text-muted-foreground w-20 text-right">{fmtCurrency(w.value)}</span>
              <input
                type="number"
                value={w.weight || 0}
                disabled={!canEdit}
                onChange={(e) => {
                  const updated = [...weightings];
                  updated[idx] = { ...w, weight: parseFloat(e.target.value) || 0 };
                  setData((prev) => ({ ...prev, weightings: updated }));
                }}
                className="w-16 rounded bg-background border border-border text-xs px-2 py-1 text-foreground disabled:opacity-50"
              />
              <span className="text-xs text-muted-foreground w-12">%</span>
            </div>
          ))}
        </div>
      )}

      {/* Maintainable earnings result */}
      {maintainable != null && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <p className="text-[10px] uppercase tracking-wider text-primary/80">Maintainable Earnings</p>
          <p className="text-lg font-display font-bold text-foreground mt-0.5">{fmtCurrency(maintainable)}</p>
        </div>
      )}

      {/* Status + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isApproved && <span className="flex items-center gap-1 text-xs text-accent"><Check className="w-3 h-3" /> Approved</span>}
        {isStale && <span className="flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="w-3 h-3" /> Stale</span>}
        {canEdit && !isApproved && (
          <button
            onClick={handleSave}
            disabled={saving || Math.abs(totalWeight - 100) >= 0.1}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Weights'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {weightings.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground italic">No historical weighting configured. Calculate normalized earnings first.</p>
      )}
    </div>
  );
}