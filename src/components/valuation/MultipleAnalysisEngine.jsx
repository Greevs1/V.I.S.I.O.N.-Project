/**
 * MultipleAnalysisEngine — Phase 13.3
 * Transparent multiple bridge: baseline → adjustments → final multiple → EV.
 * Replaces the Phase 13.2 placeholder.
 */
import React, { useState, useEffect } from 'react';
import { calculateMultipleMethod, getMultipleCalculation } from '@/lib/valuationCalculationService';
import { Loader2, Calculator } from 'lucide-react';

export default function MultipleAnalysisEngine({ valuationId }) {
  const [calcs, setCalcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState({
    earnings_basis: 'ebitda',
    normalized_earnings: 500000,
    final_multiple_low: 3.5,
    final_multiple_mid: 4.0,
    final_multiple_high: 4.5,
  });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMultipleCalculation(valuationId);
      setCalcs(res.calculations || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      await calculateMultipleMethod(
        valuationId,
        inputs.earnings_basis,
        inputs.normalized_earnings,
        inputs.final_multiple_low,
        inputs.final_multiple_mid,
        inputs.final_multiple_high
      );
      await load();
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Multiple Analysis Engine</h3>
        <p className="text-xs text-muted-foreground">
          Applies a market-derived multiple to normalized earnings. The multiple must be supported by approved benchmarks.
        </p>
      </div>

      {/* Input form */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border">
        <h4 className="text-xs font-medium mb-3">Calculation Inputs</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Earnings Basis</label>
            <select
              value={inputs.earnings_basis}
              onChange={(e) => setInputs({ ...inputs, earnings_basis: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border"
            >
              <option value="ebitda">EBITDA</option>
              <option value="sde">SDE</option>
              <option value="revenue">Revenue</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Normalized Earnings</label>
            <input
              type="number"
              value={inputs.normalized_earnings}
              onChange={(e) => setInputs({ ...inputs, normalized_earnings: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Multiple Low (x)</label>
            <input
              type="number"
              step="0.1"
              value={inputs.final_multiple_low}
              onChange={(e) => setInputs({ ...inputs, final_multiple_low: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Multiple Mid (x)</label>
            <input
              type="number"
              step="0.1"
              value={inputs.final_multiple_mid}
              onChange={(e) => setInputs({ ...inputs, final_multiple_mid: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Multiple High (x)</label>
            <input
              type="number"
              step="0.1"
              value={inputs.final_multiple_high}
              onChange={(e) => setInputs({ ...inputs, final_multiple_high: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 w-full justify-center"
            >
              {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
              Calculate EV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {calcs.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium">Calculation Results</h4>
          {calcs.slice(0, 3).map((calc, idx) => (
            <div key={calc.id} className="rounded-lg p-4" style={{ background: 'rgba(212,168,83,0.03)', border: '1px solid rgba(212,168,83,0.15)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium capitalize">
                  {calc.calculation_type.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(calc.calculated_at).toLocaleDateString()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">EV Low</p>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(calc.enterprise_value_low)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">EV Mid</p>
                  <p className="text-sm font-mono font-semibold text-primary">{formatCurrency(calc.enterprise_value_mid)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">EV High</p>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(calc.enterprise_value_high)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
                Basis: {calc.earnings_basis?.toUpperCase()} · Earnings: {formatCurrency(calc.normalized_earnings)} ·
                Multiple: {calc.final_multiple_low}x – {calc.final_multiple_high}x
              </div>
            </div>
          ))}
        </div>
      )}

      {calcs.length === 0 && !error && (
        <div className="text-center py-8 text-xs text-muted-foreground">
          No calculations yet. Enter inputs and click Calculate EV.
        </div>
      )}
    </div>
  );
}