/**
 * AdvisorConclusion — Phase 13.3
 * Final advisor-approved valuation conclusion with all required approvals.
 * Blocks publication if any critical approval is missing.
 */
import React, { useState, useEffect } from 'react';
import { getAdvisorConclusion, saveAdvisorConclusion, getCalculationSummary } from '@/lib/valuationCalculationService';
import { Loader2, Check, AlertTriangle, Lock } from 'lucide-react';

const CONCLUSION_TYPES = [
  { value: 'indicated', label: 'Indicated Value', desc: 'Value suggested by selected methods and current facts' },
  { value: 'defensible', label: 'Defensible Value', desc: 'Value supported by verified evidence and documentation' },
  { value: 'potential', label: 'Potential Value', desc: 'Future value after approved improvements (separate from current)' },
  { value: 'strategic', label: 'Strategic Value', desc: 'Buyer-specific scenario with modeled synergies (separate from FMV)' },
];

export default function AdvisorConclusion({ valuationId }) {
  const [conclusions, setConclusions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState('indicated');
  const [form, setForm] = useState({
    maintainable_earnings: 0,
    primary_method: '',
    secondary_method: '',
    enterprise_value_low: 0,
    enterprise_value_mid: 0,
    enterprise_value_high: 0,
    equity_value_low: 0,
    equity_value_mid: 0,
    equity_value_high: 0,
    defensible_value_low: 0,
    defensible_value_mid: 0,
    defensible_value_high: 0,
    confidence_score: 0,
    key_assumptions: [],
    key_limitations: [],
    client_visible_drivers: [],
    client_visible_risks: [],
    client_visible_opportunities: [],
    disclosures: '',
    advisor_approved: false,
    override_rationale: '',
  });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const [concRes, sumRes] = await Promise.all([
        getAdvisorConclusion(valuationId),
        getCalculationSummary(valuationId),
      ]);
      setConclusions(concRes.conclusions || []);
      setSummary(sumRes);

      // Pre-fill from reconciliation calculation
      const recon = (sumRes.calculations || []).find(c => c.calculation_type === 'reconciliation' && c.methodology === 'blended');
      if (recon) {
        setForm(prev => ({
          ...prev,
          enterprise_value_low: recon.enterprise_value_low || 0,
          enterprise_value_mid: recon.enterprise_value_mid || 0,
          enterprise_value_high: recon.enterprise_value_high || 0,
          equity_value_low: recon.equity_value_low || 0,
          equity_value_mid: recon.equity_value_mid || 0,
          equity_value_high: recon.equity_value_high || 0,
        }));
      }

      // Load existing conclusion for active type
      const existing = (concRes.conclusions || []).find(c => c.conclusion_type === activeType);
      if (existing) {
        setForm({
          maintainable_earnings: existing.maintainable_earnings || 0,
          primary_method: existing.primary_method || '',
          secondary_method: existing.secondary_method || '',
          enterprise_value_low: existing.enterprise_value_low || 0,
          enterprise_value_mid: existing.enterprise_value_mid || 0,
          enterprise_value_high: existing.enterprise_value_high || 0,
          equity_value_low: existing.equity_value_low || 0,
          equity_value_mid: existing.equity_value_mid || 0,
          equity_value_high: existing.equity_value_high || 0,
          defensible_value_low: existing.defensible_value_low || 0,
          defensible_value_mid: existing.defensible_value_mid || 0,
          defensible_value_high: existing.defensible_value_high || 0,
          confidence_score: existing.confidence_score || 0,
          key_assumptions: existing.key_assumptions || [],
          key_limitations: existing.key_limitations || [],
          client_visible_drivers: existing.client_visible_drivers || [],
          client_visible_risks: existing.client_visible_risks || [],
          client_visible_opportunities: existing.client_visible_opportunities || [],
          disclosures: existing.disclosures || '',
          advisor_approved: existing.advisor_approved || false,
          override_rationale: existing.override_rationale || '',
        });
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [activeType]);

  const handleSave = async (approved = false) => {
    setSaving(true);
    setError(null);
    try {
      await saveAdvisorConclusion(valuationId, {
        ...form,
        conclusion_type: activeType,
        advisor_approved: approved,
        override_rationale: approved && form.override_rationale ? form.override_rationale : null,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  // Check readiness
  const hasReconciliation = (summary?.calculations || []).some(c => c.calculation_type === 'reconciliation' && c.methodology === 'blended');
  const hasMethodSelections = (summary?.method_selections || []).length > 0;
  const hasConfidence = (summary?.confidence_scores || []).some(c => c.is_overall);
  const readyForApproval = hasReconciliation && hasMethodSelections && hasConfidence;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Advisor Conclusion</h3>
        <p className="text-xs text-muted-foreground">
          The advisor approves the final valuation conclusion. Publication is blocked until all critical approvals are complete.
        </p>
      </div>

      {/* Readiness warning */}
      {!readyForApproval && (
        <div className="rounded-lg p-3 bg-amber-500/5 border border-amber-500/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-400">
            <p className="font-medium mb-1">Blocking readiness warning — the following are required before approval:</p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              {!hasMethodSelections && <li>Method selection (select at least one method)</li>}
              {!hasReconciliation && <li>Method reconciliation (calculate weighted enterprise value)</li>}
              {!hasConfidence && <li>Confidence scoring (calculate overall confidence)</li>}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Conclusion type selector */}
      <div className="flex gap-1.5 flex-wrap">
        {CONCLUSION_TYPES.map((ct) => (
          <button key={ct.value} onClick={() => setActiveType(ct.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium ${activeType === ct.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {ct.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Maintainable Earnings</label>
            <input type="number" value={form.maintainable_earnings}
              onChange={(e) => setForm({ ...form, maintainable_earnings: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Primary Method</label>
            <input type="text" value={form.primary_method}
              onChange={(e) => setForm({ ...form, primary_method: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Secondary Method</label>
            <input type="text" value={form.secondary_method}
              onChange={(e) => setForm({ ...form, secondary_method: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
        </div>

        {/* Enterprise Value */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2 font-medium">Enterprise Value Range</p>
          <div className="grid grid-cols-3 gap-3">
            <div><input type="number" value={form.enterprise_value_low} onChange={(e) => setForm({ ...form, enterprise_value_low: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="Low" /></div>
            <div><input type="number" value={form.enterprise_value_mid} onChange={(e) => setForm({ ...form, enterprise_value_mid: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="Mid" /></div>
            <div><input type="number" value={form.enterprise_value_high} onChange={(e) => setForm({ ...form, enterprise_value_high: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="High" /></div>
          </div>
        </div>

        {/* Equity Value */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2 font-medium">Equity Value Range</p>
          <div className="grid grid-cols-3 gap-3">
            <div><input type="number" value={form.equity_value_low} onChange={(e) => setForm({ ...form, equity_value_low: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="Low" /></div>
            <div><input type="number" value={form.equity_value_mid} onChange={(e) => setForm({ ...form, equity_value_mid: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="Mid" /></div>
            <div><input type="number" value={form.equity_value_high} onChange={(e) => setForm({ ...form, equity_value_high: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="High" /></div>
          </div>
        </div>

        {/* Defensible Value (only for defensible type) */}
        {activeType === 'defensible' && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-2 font-medium">Defensible Value Range</p>
            <div className="grid grid-cols-3 gap-3">
              <div><input type="number" value={form.defensible_value_low} onChange={(e) => setForm({ ...form, defensible_value_low: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="Low" /></div>
              <div><input type="number" value={form.defensible_value_mid} onChange={(e) => setForm({ ...form, defensible_value_mid: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="Mid" /></div>
              <div><input type="number" value={form.defensible_value_high} onChange={(e) => setForm({ ...form, defensible_value_high: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" placeholder="High" /></div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Confidence Score (0-100)</label>
            <input type="number" min="0" max="100" value={form.confidence_score}
              onChange={(e) => setForm({ ...form, confidence_score: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Disclosures</label>
            <input type="text" value={form.disclosures}
              onChange={(e) => setForm({ ...form, disclosures: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
        </div>

        {/* Override rationale */}
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Override Rationale (if applicable)</label>
          <input type="text" value={form.override_rationale}
            onChange={(e) => setForm({ ...form, override_rationale: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" placeholder="Required if overriding calculated values" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => handleSave(false)} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary border border-border hover:bg-secondary/80">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Save Draft
        </button>
        <button onClick={() => handleSave(true)} disabled={saving || !readyForApproval}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Approve Conclusion
        </button>
        {!readyForApproval && (
          <span className="flex items-center gap-1 text-[11px] text-amber-500">
            <Lock className="w-3 h-3" /> Complete required steps to unlock approval
          </span>
        )}
      </div>

      {/* Existing conclusions */}
      {conclusions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Saved Conclusions</h4>
          {conclusions.map((c) => (
            <div key={c.id} className="rounded-lg p-3 bg-secondary/30 border border-border flex items-center justify-between">
              <div>
                <span className="text-xs font-medium capitalize">{c.conclusion_type}</span>
                <span className="text-[11px] text-muted-foreground ml-2">
                  EV: {formatCurrency(c.enterprise_value_mid)} · Equity: {formatCurrency(c.equity_value_mid)}
                </span>
              </div>
              {c.advisor_approved ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">Approved</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">Draft</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}