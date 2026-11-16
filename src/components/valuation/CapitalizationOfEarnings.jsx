/**
 * CapitalizationOfEarnings — Phase 13.3
 * Cap Rate = Required Return − Long-Term Growth Rate
 * Indicated Value = Maintainable Earnings ÷ Cap Rate
 */
import React, { useState, useEffect } from 'react';
import { saveCapEarningsInputs, calculateCapEarnings, getCapEarnings } from '@/lib/valuationCalculationService';
import { Loader2, Calculator } from 'lucide-react';

export default function CapitalizationOfEarnings({ valuationId }) {
  const [cap, setCap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState({
    maintainable_earnings: 500000,
    earnings_basis: 'ebitda',
    long_term_growth_rate: 0.03,
    required_return: 0.15,
    growth_rate_rationale: '',
    required_return_rationale: '',
    normalization_assumptions: '',
  });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCapEarnings(valuationId);
      if (res.capEarnings) {
        setCap(res.capEarnings);
        setInputs({
          maintainable_earnings: res.capEarnings.maintainable_earnings || 500000,
          earnings_basis: res.capEarnings.earnings_basis || 'ebitda',
          long_term_growth_rate: res.capEarnings.long_term_growth_rate || 0.03,
          required_return: res.capEarnings.required_return || 0.15,
          growth_rate_rationale: res.capEarnings.growth_rate_rationale || '',
          required_return_rationale: res.capEarnings.required_return_rationale || '',
          normalization_assumptions: res.capEarnings.normalization_assumptions || '',
        });
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCapEarningsInputs(valuationId, inputs);
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      await saveCapEarningsInputs(valuationId, inputs);
      await calculateCapEarnings(valuationId);
      await load();
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally { setCalculating(false); }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();
  const capRate = inputs.required_return - inputs.long_term_growth_rate;
  const indicatedValue = capRate > 0 ? inputs.maintainable_earnings / capRate : 0;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Capitalization of Earnings</h3>
        <p className="text-xs text-muted-foreground">
          Capitalizes maintainable earnings at a market-derived capitalization rate. Best for stable, mature businesses.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Inputs */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border">
        <h4 className="text-xs font-medium mb-3">Inputs</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Earnings Basis</label>
            <select value={inputs.earnings_basis} onChange={(e) => setInputs({ ...inputs, earnings_basis: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
              <option value="ebitda">EBITDA</option>
              <option value="sde">SDE</option>
              <option value="net_income">Net Income</option>
              <option value="free_cash_flow">Free Cash Flow</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Maintainable Earnings</label>
            <input type="number" value={inputs.maintainable_earnings}
              onChange={(e) => setInputs({ ...inputs, maintainable_earnings: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Required Return (%)</label>
            <input type="number" step="0.1" value={(inputs.required_return * 100).toFixed(1)}
              onChange={(e) => setInputs({ ...inputs, required_return: Number(e.target.value) / 100 })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Long-Term Growth Rate (%)</label>
            <input type="number" step="0.1" value={(inputs.long_term_growth_rate * 100).toFixed(1)}
              onChange={(e) => setInputs({ ...inputs, long_term_growth_rate: Number(e.target.value) / 100 })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-[11px] text-muted-foreground mb-1 block">Required Return Rationale</label>
            <input type="text" value={inputs.required_return_rationale}
              onChange={(e) => setInputs({ ...inputs, required_return_rationale: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-[11px] text-muted-foreground mb-1 block">Growth Rate Rationale</label>
            <input type="text" value={inputs.growth_rate_rationale}
              onChange={(e) => setInputs({ ...inputs, growth_rate_rationale: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg p-4" style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.15)' }}>
        <h4 className="text-xs font-medium mb-3">Calculation Preview</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Required Return</span>
            <span className="font-mono">{(inputs.required_return * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">− Long-Term Growth Rate</span>
            <span className="font-mono">{(inputs.long_term_growth_rate * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-xs border-t border-accent/20 pt-2">
            <span className="font-medium">= Capitalization Rate</span>
            <span className={`font-mono font-semibold ${capRate <= 0 ? 'text-red-400' : 'text-accent'}`}>
              {(capRate * 100).toFixed(2)}%
            </span>
          </div>
          {capRate <= 0 && (
            <p className="text-[11px] text-red-400 mt-2">
              ⚠ Capitalization rate must be positive. Adjust required return or growth rate.
            </p>
          )}
          {capRate > 0 && (
            <>
              <div className="flex justify-between text-xs pt-2">
                <span className="text-muted-foreground">Maintainable Earnings</span>
                <span className="font-mono">{formatCurrency(inputs.maintainable_earnings)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">÷ Capitalization Rate</span>
                <span className="font-mono">{(capRate * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-xs border-t border-accent/20 pt-2">
                <span className="font-medium">= Indicated Value</span>
                <span className="font-mono font-semibold text-accent">{formatCurrency(indicatedValue)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Saved result */}
      {cap?.indicated_value != null && (
        <div className="rounded-lg p-3 bg-green-500/5 border border-green-500/20">
          <p className="text-xs text-green-400">
            ✓ Saved: Cap Rate = {(cap.capitalization_rate * 100).toFixed(2)}%, Indicated Value = {formatCurrency(cap.indicated_value)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary border border-border hover:bg-secondary/80">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Save Inputs
        </button>
        <button onClick={handleCalculate} disabled={calculating || capRate <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
          Calculate
        </button>
      </div>
    </div>
  );
}