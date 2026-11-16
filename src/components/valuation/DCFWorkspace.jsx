/**
 * DCFWorkspace — Phase 13.3
 * Full DCF workspace: projections, discount rate, terminal value, PV calculation.
 */
import React, { useState, useEffect } from 'react';
import { saveDCFProjection, calculateDCF, getDCF } from '@/lib/valuationCalculationService';
import { Loader2, Calculator, TrendingUp } from 'lucide-react';

export default function DCFWorkspace({ valuationId }) {
  const [dcf, setDcf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);

  const [inputs, setInputs] = useState({
    forecast_period_years: 5,
    discount_rate: 0.12,
    terminal_value_method: 'gordon_growth',
    terminal_growth_rate: 0.03,
    terminal_exit_multiple: 5,
    forecast_source: '',
    forecast_reliability_score: 50,
    revenue_assumptions: '',
    margin_assumptions: '',
    capex_assumptions: '',
    working_capital_assumptions: '',
    tax_assumptions: '',
    discount_rate_rationale: '',
    terminal_value_rationale: '',
    projections: [],
  });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getDCF(valuationId);
      if (res.dcf) {
        setDcf(res.dcf);
        setInputs({
          ...inputs,
          forecast_period_years: res.dcf.forecast_period_years || 5,
          discount_rate: res.dcf.discount_rate || 0.12,
          terminal_value_method: res.dcf.terminal_value_method || 'gordon_growth',
          terminal_growth_rate: res.dcf.terminal_growth_rate || 0.03,
          terminal_exit_multiple: res.dcf.terminal_exit_multiple || 5,
          forecast_source: res.dcf.forecast_source || '',
          forecast_reliability_score: res.dcf.forecast_reliability_score || 50,
          revenue_assumptions: res.dcf.revenue_assumptions || '',
          margin_assumptions: res.dcf.margin_assumptions || '',
          capex_assumptions: res.dcf.capex_assumptions || '',
          working_capital_assumptions: res.dcf.working_capital_assumptions || '',
          tax_assumptions: res.dcf.tax_assumptions || '',
          discount_rate_rationale: res.dcf.discount_rate_rationale || '',
          terminal_value_rationale: res.dcf.terminal_value_rationale || '',
          projections: res.dcf.projections || [],
        });
      } else {
        // Initialize default projections
        const defaultProjs = Array.from({ length: 5 }, (_, i) => ({
          year: i + 1,
          revenue: 0, gross_profit: 0, operating_expenses: 0, ebitda: 0,
          taxes: 0, capex: 0, working_capital_change: 0, unlevered_fcf: 0,
        }));
        setInputs(prev => ({ ...prev, projections: defaultProjs }));
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveDCFProjection(valuationId, inputs);
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      await saveDCFProjection(valuationId, inputs);
      const res = await calculateDCF(valuationId);
      await load();
      return res;
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const updateProjection = (idx, field, value) => {
    const projs = [...inputs.projections];
    projs[idx] = { ...projs[idx], [field]: Number(value) || 0 };
    // Auto-calculate unlevered FCF
    const p = projs[idx];
    p.unlevered_fcf = (p.ebitda || 0) - (p.taxes || 0) - (p.capex || 0) - (p.working_capital_change || 0);
    setInputs({ ...inputs, projections: projs });
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Discounted Cash Flow</h3>
        <p className="text-xs text-muted-foreground">
          Projects future cash flows and discounts to present value. DCF is typically a secondary or supporting method.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* DCF Parameters */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border">
        <h4 className="text-xs font-medium mb-3">DCF Parameters</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Forecast Period (years)</label>
            <input type="number" min="3" max="10" value={inputs.forecast_period_years}
              onChange={(e) => setInputs({ ...inputs, forecast_period_years: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Discount Rate (%)</label>
            <input type="number" step="0.1" value={(inputs.discount_rate * 100).toFixed(1)}
              onChange={(e) => setInputs({ ...inputs, discount_rate: Number(e.target.value) / 100 })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Terminal Value Method</label>
            <select value={inputs.terminal_value_method}
              onChange={(e) => setInputs({ ...inputs, terminal_value_method: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
              <option value="gordon_growth">Gordon Growth</option>
              <option value="exit_multiple">Exit Multiple</option>
            </select>
          </div>
          {inputs.terminal_value_method === 'gordon_growth' ? (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Terminal Growth Rate (%)</label>
              <input type="number" step="0.1" value={(inputs.terminal_growth_rate * 100).toFixed(1)}
                onChange={(e) => setInputs({ ...inputs, terminal_growth_rate: Number(e.target.value) / 100 })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Exit Multiple (x)</label>
              <input type="number" step="0.1" value={inputs.terminal_exit_multiple}
                onChange={(e) => setInputs({ ...inputs, terminal_exit_multiple: Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
            </div>
          )}
        </div>

        {/* Assumptions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Forecast Source</label>
            <input type="text" value={inputs.forecast_source}
              onChange={(e) => setInputs({ ...inputs, forecast_source: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Forecast Reliability Score (0-100)</label>
            <input type="number" min="0" max="100" value={inputs.forecast_reliability_score}
              onChange={(e) => setInputs({ ...inputs, forecast_reliability_score: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Revenue Assumptions</label>
            <input type="text" value={inputs.revenue_assumptions}
              onChange={(e) => setInputs({ ...inputs, revenue_assumptions: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Margin Assumptions</label>
            <input type="text" value={inputs.margin_assumptions}
              onChange={(e) => setInputs({ ...inputs, margin_assumptions: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Discount Rate Rationale</label>
            <input type="text" value={inputs.discount_rate_rationale}
              onChange={(e) => setInputs({ ...inputs, discount_rate_rationale: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Terminal Value Rationale</label>
            <input type="text" value={inputs.terminal_value_rationale}
              onChange={(e) => setInputs({ ...inputs, terminal_value_rationale: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
        </div>
      </div>

      {/* Projections Table */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border overflow-x-auto">
        <h4 className="text-xs font-medium mb-3">Year-by-Year Projections</h4>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-1.5 px-2">Year</th>
              <th className="text-right py-1.5 px-2">Revenue</th>
              <th className="text-right py-1.5 px-2">EBITDA</th>
              <th className="text-right py-1.5 px-2">Taxes</th>
              <th className="text-right py-1.5 px-2">CapEx</th>
              <th className="text-right py-1.5 px-2">WC Change</th>
              <th className="text-right py-1.5 px-2">UFCF</th>
            </tr>
          </thead>
          <tbody>
            {inputs.projections.map((proj, idx) => (
              <tr key={idx} className="border-t border-border/30">
                <td className="py-1.5 px-2 font-medium">{proj.year || idx + 1}</td>
                <td className="py-1.5 px-2"><input type="number" value={proj.revenue || 0} onChange={(e) => updateProjection(idx, 'revenue', e.target.value)} className="w-24 px-1.5 py-1 rounded bg-background border border-border text-right font-mono text-[11px]" /></td>
                <td className="py-1.5 px-2"><input type="number" value={proj.ebitda || 0} onChange={(e) => updateProjection(idx, 'ebitda', e.target.value)} className="w-24 px-1.5 py-1 rounded bg-background border border-border text-right font-mono text-[11px]" /></td>
                <td className="py-1.5 px-2"><input type="number" value={proj.taxes || 0} onChange={(e) => updateProjection(idx, 'taxes', e.target.value)} className="w-20 px-1.5 py-1 rounded bg-background border border-border text-right font-mono text-[11px]" /></td>
                <td className="py-1.5 px-2"><input type="number" value={proj.capex || 0} onChange={(e) => updateProjection(idx, 'capex', e.target.value)} className="w-20 px-1.5 py-1 rounded bg-background border border-border text-right font-mono text-[11px]" /></td>
                <td className="py-1.5 px-2"><input type="number" value={proj.working_capital_change || 0} onChange={(e) => updateProjection(idx, 'working_capital_change', e.target.value)} className="w-20 px-1.5 py-1 rounded bg-background border border-border text-right font-mono text-[11px]" /></td>
                <td className="py-1.5 px-2 text-right font-mono font-semibold text-primary">{formatCurrency(proj.unlevered_fcf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary border border-border hover:bg-secondary/80">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Save Projections
        </button>
        <button onClick={handleCalculate} disabled={calculating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
          {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
          Calculate DCF
        </button>
      </div>

      {/* Results */}
      {dcf?.enterprise_value != null && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.15)' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-accent" />
            <h4 className="text-sm font-medium">DCF Results</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">PV of Cash Flows</p>
              <p className="text-sm font-mono font-semibold">{formatCurrency(dcf.total_present_value)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Terminal Value</p>
              <p className="text-sm font-mono">{formatCurrency(dcf.terminal_value)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">PV of Terminal Value</p>
              <p className="text-sm font-mono">{formatCurrency(dcf.pv_terminal_value)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Enterprise Value</p>
              <p className="text-sm font-mono font-semibold text-accent">{formatCurrency(dcf.enterprise_value)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}