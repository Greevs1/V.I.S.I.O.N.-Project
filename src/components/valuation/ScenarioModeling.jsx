/**
 * ScenarioModeling — Phase 13.3
 * Replaces the Phase 13.2 placeholder with real scenario calculations.
 * Current, Indicated, Defensible, Potential, Conservative, Base, Aggressive, Strategic.
 */
import React, { useState, useEffect } from 'react';
import { getScenarioCalculations, saveScenarioCalculation } from '@/lib/valuationCalculationService';
import { Loader2, Save } from 'lucide-react';

const SCENARIO_TYPES = [
  { value: 'current', label: 'Current', desc: 'Current company performance and risk profile' },
  { value: 'indicated', label: 'Indicated', desc: 'Advisor-reconciled valuation conclusion' },
  { value: 'defensible', label: 'Defensible', desc: 'Value supported by current verified evidence' },
  { value: 'potential', label: 'Potential', desc: 'Future value after approved improvements (not guaranteed)' },
  { value: 'conservative', label: 'Conservative', desc: 'Lower-case assumptions' },
  { value: 'base', label: 'Base', desc: 'Most likely assumptions' },
  { value: 'aggressive', label: 'Aggressive', desc: 'High-performance assumptions with stated risk' },
  { value: 'strategic', label: 'Strategic', desc: 'Buyer-specific value with modeled synergies (not FMV)' },
];

export default function ScenarioModeling({ valuationId }) {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getScenarioCalculations(valuationId);
      setScenarios(res.scenarios || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleSave = async (type, data) => {
    setSaving(type);
    setError(null);
    try {
      await saveScenarioCalculation(valuationId, {
        scenario_type: type,
        scenario_name: SCENARIO_TYPES.find(s => s.value === type)?.label || type,
        ...data,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const getScenario = (type) => scenarios.find(s => s.scenario_type === type);
  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Scenario Modeling</h3>
        <p className="text-xs text-muted-foreground">
          Each scenario shows earnings basis, multiple, EV, equity value, assumptions, and confidence.
          Potential and strategic values are never presented as guaranteed outcomes.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Scenario cards */}
      <div className="grid gap-3">
        {SCENARIO_TYPES.map((st) => {
          const sc = getScenario(st.value);
          return (
            <ScenarioCard
              key={st.value}
              type={st}
              scenario={sc}
              saving={saving === st.value}
              onSave={(data) => handleSave(st.value, data)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ScenarioCard({ type, scenario, saving, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    normalized_earnings: scenario?.normalized_earnings || 0,
    applied_multiple: scenario?.applied_multiple || 0,
    enterprise_value: scenario?.enterprise_value || 0,
    equity_value: scenario?.equity_value || 0,
    confidence_score: scenario?.confidence_score || 0,
    description: scenario?.description || '',
    assumptions: scenario?.assumptions || [],
    is_recommended: scenario?.is_recommended || false,
  });

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  const handleSave = () => {
    onSave(form);
    setEditing(false);
  };

  return (
    <div className="rounded-lg p-4" style={{
      background: scenario ? 'rgba(212,168,83,0.03)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${scenario ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium">{type.label}</h4>
          <p className="text-[11px] text-muted-foreground">{type.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          {scenario?.is_recommended && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Recommended</span>}
          <button onClick={() => setEditing(!editing)} className="text-[11px] text-primary hover:underline">
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block">Normalized Earnings</label>
              <input type="number" value={form.normalized_earnings} onChange={(e) => setForm({ ...form, normalized_earnings: Number(e.target.value) })} className="w-full px-2 py-1 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block">Multiple (x)</label>
              <input type="number" step="0.1" value={form.applied_multiple} onChange={(e) => setForm({ ...form, applied_multiple: Number(e.target.value) })} className="w-full px-2 py-1 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block">Enterprise Value</label>
              <input type="number" value={form.enterprise_value} onChange={(e) => setForm({ ...form, enterprise_value: Number(e.target.value) })} className="w-full px-2 py-1 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block">Equity Value</label>
              <input type="number" value={form.equity_value} onChange={(e) => setForm({ ...form, equity_value: Number(e.target.value) })} className="w-full px-2 py-1 rounded text-xs bg-background border border-border font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block">Confidence (0-100)</label>
              <input type="number" min="0" max="100" value={form.confidence_score} onChange={(e) => setForm({ ...form, confidence_score: Number(e.target.value) })} className="w-full px-2 py-1 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-2 py-1 rounded text-xs bg-background border border-border" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.is_recommended} onChange={(e) => setForm({ ...form, is_recommended: e.target.checked })} />
            Mark as recommended scenario
          </label>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Scenario
          </button>
        </div>
      ) : scenario ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <p className="text-[10px] text-muted-foreground">Earnings</p>
            <p className="text-xs font-mono">{formatCurrency(scenario.normalized_earnings)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Multiple</p>
            <p className="text-xs font-mono">{scenario.applied_multiple}x</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Enterprise Value</p>
            <p className="text-xs font-mono font-semibold text-primary">{formatCurrency(scenario.enterprise_value)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Equity Value</p>
            <p className="text-xs font-mono font-semibold">{formatCurrency(scenario.equity_value)}</p>
          </div>
          {scenario.confidence_score > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground">Confidence</p>
              <p className="text-xs font-mono">{scenario.confidence_score}%</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2">Not yet calculated. Click Edit to enter values.</p>
      )}
    </div>
  );
}