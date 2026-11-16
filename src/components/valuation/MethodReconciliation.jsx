/**
 * MethodReconciliation — Phase 13.3
 * Advisor weights each method; weights must total 100%.
 * Weighted EV = Σ (Method EV × Method Weight)
 */
import React, { useState, useEffect } from 'react';
import { getMethodReconciliation, saveMethodReconciliation, calculateReconciledValue } from '@/lib/valuationCalculationService';
import { Loader2, Calculator, AlertTriangle } from 'lucide-react';

export default function MethodReconciliation({ valuationId }) {
  const [data, setData] = useState({ method_selections: [], reconciliation_calculation: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [weights, setWeights] = useState({});

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMethodReconciliation(valuationId);
      setData(res);
      const w = {};
      (res.method_selections || []).forEach(s => { w[s.method_key] = s.method_weight || 0; });
      setWeights(w);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + (Number(w) || 0), 0);
  const weightsValid = Math.abs(totalWeight - 100) < 0.01;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const methodWeights = Object.entries(weights).map(([method_key, weight]) => ({ method_key, weight }));
      await saveMethodReconciliation(valuationId, methodWeights);
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const methodWeights = Object.entries(weights).map(([method_key, weight]) => ({ method_key, weight }));
      await saveMethodReconciliation(valuationId, methodWeights);
      await calculateReconciledValue(valuationId);
      await load();
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally { setCalculating(false); }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  const selections = data.method_selections || [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Method Reconciliation</h3>
        <p className="text-xs text-muted-foreground">
          Weight each included method based on applicability and reliability. Weights must total 100%.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {selections.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          No methods selected. Go to Methodology Selection to choose methods first.
        </div>
      ) : (
        <>
          {/* Weight table */}
          <div className="rounded-lg p-4 bg-secondary/50 border border-border">
            <div className="space-y-3">
              {selections.map((sel) => (
                <div key={sel.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-xs font-medium">{sel.method_name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 capitalize">({sel.selection_role})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={weights[sel.method_key] || 0}
                      onChange={(e) => setWeights({ ...weights, [sel.method_key]: Number(e.target.value) })}
                      className="w-16 px-2 py-1 rounded text-xs bg-background border border-border text-right font-mono"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Total weight indicator */}
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs font-medium">Total Weight</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-semibold ${weightsValid ? 'text-green-500' : 'text-red-400'}`}>
                  {totalWeight.toFixed(1)}%
                </span>
                {!weightsValid && (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>
            {!weightsValid && (
              <p className="text-[11px] text-red-400 mt-1">
                Weights must total 100%. Current total: {totalWeight.toFixed(1)}%
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary border border-border hover:bg-secondary/80">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Weights
            </button>
            <button onClick={handleCalculate} disabled={calculating || !weightsValid}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
              Calculate Reconciled Value
            </button>
          </div>

          {/* Results */}
          {data.reconciliation_calculation && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(212,168,83,0.03)', border: '1px solid rgba(212,168,83,0.15)' }}>
              <h4 className="text-xs font-medium mb-3">Reconciled Enterprise Value</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Weighted EV Low</p>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(data.reconciliation_calculation.enterprise_value_low)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Weighted EV Mid</p>
                  <p className="text-sm font-mono font-semibold text-primary">{formatCurrency(data.reconciliation_calculation.enterprise_value_mid)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Weighted EV High</p>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(data.reconciliation_calculation.enterprise_value_high)}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}