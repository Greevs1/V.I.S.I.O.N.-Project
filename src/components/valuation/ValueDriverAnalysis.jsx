/**
 * ValueDriverAnalysis — Phase 13.3
 * Evidence-based factors affecting profitability, risk, transferability, and multiple.
 * Does NOT convert findings into roadmap recommendations.
 */
import React, { useState, useEffect } from 'react';
import { getValueDrivers, saveValueDriver, updateValueDriver } from '@/lib/valuationCalculationService';
import { Loader2, Plus, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

const CATEGORIES = [
  { value: 'profitability', label: 'Profitability' },
  { value: 'valuation_multiple', label: 'Multiple' },
  { value: 'exit_readiness', label: 'Exit Readiness' },
  { value: 'family_office', label: 'Family Office' },
];

const IMPACT_TYPES = {
  value_enhancer: { label: 'Enhancer', color: '#10B981', icon: TrendingUp },
  value_detractor: { label: 'Detractor', color: '#EF4444', icon: TrendingDown },
  risk_factor: { label: 'Risk', color: '#F59E0B', icon: AlertCircle },
  opportunity: { label: 'Opportunity', color: '#00D4FF', icon: TrendingUp },
  neutral: { label: 'Neutral', color: '#6B7280', icon: null },
};

export default function ValueDriverAnalysis({ valuationId }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newDriver, setNewDriver] = useState({
    driver_key: '', driver_name: '', category: 'profitability',
    current_state: '', impact_type: 'value_enhancer',
    estimated_ebitda_impact: 0, estimated_multiple_impact: 0,
    confidence_score: 50, priority: 'medium', advisor_status: 'identified',
    client_visible: false, evidence_summary: '',
  });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getValueDrivers(valuationId);
      setDrivers(res.valueDrivers || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!newDriver.driver_name) return;
    try {
      await saveValueDriver(valuationId, { ...newDriver, driver_key: newDriver.driver_key || newDriver.driver_name.toLowerCase().replace(/\s+/g, '_') });
      setNewDriver({ ...newDriver, driver_name: '', current_state: '', evidence_summary: '' });
      setShowForm(false);
      await load();
    } catch (err) { setError(err.message); }
  };

  const handleToggleClientVisible = async (driver) => {
    try {
      await updateValueDriver(driver.id, { client_visible: !driver.client_visible });
      await load();
    } catch (err) { setError(err.message); }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold mb-1">Value Driver Analysis</h3>
          <p className="text-xs text-muted-foreground">
            Evidence-based factors affecting value. These findings do NOT become roadmap recommendations.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-3.5 h-3.5" /> Add Driver
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg p-4 bg-secondary/50 border border-border">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Driver Name</label>
              <input type="text" value={newDriver.driver_name}
                onChange={(e) => setNewDriver({ ...newDriver, driver_name: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Category</label>
              <select value={newDriver.category}
                onChange={(e) => setNewDriver({ ...newDriver, category: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Impact Type</label>
              <select value={newDriver.impact_type}
                onChange={(e) => setNewDriver({ ...newDriver, impact_type: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
                {Object.entries(IMPACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Est. EBITDA Impact</label>
              <input type="number" value={newDriver.estimated_ebitda_impact}
                onChange={(e) => setNewDriver({ ...newDriver, estimated_ebitda_impact: Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Est. Multiple Impact (x)</label>
              <input type="number" step="0.1" value={newDriver.estimated_multiple_impact}
                onChange={(e) => setNewDriver({ ...newDriver, estimated_multiple_impact: Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Confidence (0-100)</label>
              <input type="number" min="0" max="100" value={newDriver.confidence_score}
                onChange={(e) => setNewDriver({ ...newDriver, confidence_score: Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground mb-1 block">Current State</label>
              <input type="text" value={newDriver.current_state}
                onChange={(e) => setNewDriver({ ...newDriver, current_state: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Priority</label>
              <select value={newDriver.priority}
                onChange={(e) => setNewDriver({ ...newDriver, priority: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="text-[11px] text-muted-foreground mb-1 block">Evidence Summary</label>
              <input type="text" value={newDriver.evidence_summary}
                onChange={(e) => setNewDriver({ ...newDriver, evidence_summary: e.target.value })}
                className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={handleAdd}
              className="px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
              Save Driver
            </button>
          </div>
        </div>
      )}

      {/* Drivers by category */}
      {CATEGORIES.map((cat) => {
        const catDrivers = drivers.filter(d => d.category === cat.value);
        if (catDrivers.length === 0) return null;
        return (
          <div key={cat.value}>
            <h4 className="text-xs font-medium mb-2 text-muted-foreground">{cat.label}</h4>
            <div className="grid gap-2">
              {catDrivers.map((driver) => {
                const impact = IMPACT_TYPES[driver.impact_type] || IMPACT_TYPES.neutral;
                const Icon = impact.icon;
                return (
                  <div key={driver.id} className="rounded-lg p-3" style={{ background: `${impact.color}08`, border: `1px solid ${impact.color}25` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {Icon && <Icon className="w-3.5 h-3.5" style={{ color: impact.color }} />}
                          <span className="text-xs font-medium">{driver.driver_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: impact.color, background: `${impact.color}15` }}>
                            {impact.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize">· {driver.priority} priority</span>
                        </div>
                        {driver.current_state && <p className="text-[11px] text-muted-foreground mb-1">{driver.current_state}</p>}
                        {driver.evidence_summary && <p className="text-[11px] text-muted-foreground/70">{driver.evidence_summary}</p>}
                        <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                          {driver.estimated_ebitda_impact != 0 && <span>EBITDA: {formatCurrency(driver.estimated_ebitda_impact)}</span>}
                          {driver.estimated_multiple_impact != 0 && <span>Multiple: {driver.estimated_multiple_impact > 0 ? '+' : ''}{driver.estimated_multiple_impact}x</span>}
                          <span>Confidence: {driver.confidence_score}%</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleClientVisible(driver)}
                        className={`text-[10px] px-2 py-1 rounded ${driver.client_visible ? 'bg-green-500/10 text-green-500' : 'bg-secondary text-muted-foreground'}`}
                      >
                        {driver.client_visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {drivers.length === 0 && !showForm && (
        <div className="text-center py-8 text-xs text-muted-foreground">
          No value drivers identified yet. Click "Add Driver" to identify factors affecting value.
        </div>
      )}
    </div>
  );
}