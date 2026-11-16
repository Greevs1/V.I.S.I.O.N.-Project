/**
 * NormalizedEarningsEngine — Phase 13.3
 * Calculates the EBITDA and SDE bridges from approved financials and adjustments.
 * Facts → Normalized Earnings.
 */
import React, { useState, useEffect } from 'react';
import { calculateNormalizedEarnings, getNormalizedEarnings } from '@/lib/valuationCalculationService';
import { Loader2, Calculator, TrendingUp } from 'lucide-react';

export default function NormalizedEarningsEngine({ valuationId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [earningsBasis, setEarningsBasis] = useState('ebitda');

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getNormalizedEarnings(valuationId);
      if (res.calculation) setResult(res);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const res = await calculateNormalizedEarnings(valuationId, null, earningsBasis);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (n) => {
    if (n == null || n === 0) return '$0';
    return '$' + Math.round(n).toLocaleString();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold mb-1">Normalized Earnings Engine</h3>
          <p className="text-xs text-muted-foreground">
            Builds the EBITDA and SDE bridges from approved financials and adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={earningsBasis}
            onChange={(e) => setEarningsBasis(e.target.value)}
            className="px-2 py-1 rounded text-xs bg-secondary border border-border"
          >
            <option value="ebitda">EBITDA</option>
            <option value="sde">SDE</option>
          </select>
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
          >
            {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
            Calculate
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {result?.ebitda_bridge && (
        <div className="space-y-4">
          {/* EBITDA Bridge */}
          <div className="rounded-lg p-4" style={{ background: 'rgba(212,168,83,0.03)', border: '1px solid rgba(212,168,83,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-medium">EBITDA Bridge</h4>
              {result.financial_period && (
                <span className="text-[11px] text-muted-foreground">· {result.financial_period}</span>
              )}
            </div>
            <div className="space-y-1.5">
              {result.ebitda_bridge.lines.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between py-1 ${line.line_type === 'normalized' && line.line_label.startsWith('=') ? 'border-t border-primary/20 pt-2 mt-1' : ''}`}
                >
                  <span className={`text-xs ${line.line_type === 'normalized' && line.line_label.startsWith('=') ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                    {line.line_label}
                  </span>
                  <span className={`text-xs font-mono ${line.line_type === 'normalized' && line.line_label.startsWith('=') ? 'font-semibold text-primary' : ''}`}>
                    {formatCurrency(line.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* SDE Bridge */}
          {result.sde_bridge && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.15)' }}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-accent" />
                <h4 className="text-sm font-medium">SDE Bridge</h4>
              </div>
              <div className="space-y-1.5">
                {result.sde_bridge.lines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between py-1 ${line.line_type === 'normalized' && line.line_label.startsWith('=') ? 'border-t border-accent/20 pt-2 mt-1' : ''}`}
                  >
                    <span className={`text-xs ${line.line_type === 'normalized' && line.line_label.startsWith('=') ? 'font-semibold text-accent' : 'text-muted-foreground'}`}>
                      {line.line_label}
                    </span>
                    <span className={`text-xs font-mono ${line.line_type === 'normalized' && line.line_label.startsWith('=') ? 'font-semibold text-accent' : ''}`}>
                      {formatCurrency(line.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result?.ebitda_bridge && !error && (
        <div className="text-center py-8 text-xs text-muted-foreground">
          No calculation yet. Click Calculate to build the normalized earnings bridge.
        </div>
      )}
    </div>
  );
}