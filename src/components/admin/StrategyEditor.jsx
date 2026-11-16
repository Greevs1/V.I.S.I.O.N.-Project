import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save } from 'lucide-react';

const CATEGORIES = ['tax', 'profit', 'operations', 'value', 'cash_flow', 'protection', 'wealth', 'freedom'];
const DIFFICULTIES = ['easy', 'medium', 'advanced'];
const IMPACT_TYPES = ['percentage', 'fixed', 'range_low'];

export default function StrategyEditor({ strategy, onSave, onClose }) {
  const [form, setForm] = useState({
    strategy_name: strategy?.strategy_name || '',
    category: strategy?.category || 'tax',
    strategy_family: strategy?.strategy_family || '',
    description: strategy?.description || '',
    ideal_client_profile: strategy?.ideal_client_profile || '',
    minimum_revenue: strategy?.minimum_revenue || '',
    maximum_revenue: strategy?.maximum_revenue || '',
    implementation_difficulty: strategy?.implementation_difficulty || 'medium',
    implementation_days: strategy?.implementation_days || 90,
    expected_profit_impact_type: strategy?.expected_profit_impact_type || 'percentage',
    expected_profit_impact_value: strategy?.expected_profit_impact_value || '',
    expected_tax_impact_type: strategy?.expected_tax_impact_type || 'percentage',
    expected_tax_impact_value: strategy?.expected_tax_impact_value || '',
    expected_value_impact_type: strategy?.expected_value_impact_type || 'percentage',
    expected_value_impact_value: strategy?.expected_value_impact_value || '',
    expected_cash_flow_impact_type: strategy?.expected_cash_flow_impact_type || 'percentage',
    expected_cash_flow_impact_value: strategy?.expected_cash_flow_impact_value || '',
    expected_freedom_acceleration_months: strategy?.expected_freedom_acceleration_months || 0,
    confidence_score: strategy?.confidence_score || 75,
    active: strategy?.active !== false,
    ...(strategy?.id ? { id: strategy.id } : {}),
  });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = { ...form };
    if (cleaned.minimum_revenue === '') cleaned.minimum_revenue = null;
    if (cleaned.maximum_revenue === '') cleaned.maximum_revenue = null;
    if (cleaned.expected_profit_impact_value === '') cleaned.expected_profit_impact_value = null;
    if (cleaned.expected_tax_impact_value === '') cleaned.expected_tax_impact_value = null;
    if (cleaned.expected_value_impact_value === '') cleaned.expected_value_impact_value = null;
    if (cleaned.expected_cash_flow_impact_value === '') cleaned.expected_cash_flow_impact_value = null;
    onSave(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-semibold">{form.id ? 'Edit Strategy' : 'New Strategy'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Core Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Strategy Name *</label>
              <input required value={form.strategy_name} onChange={e => set('strategy_name', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Category *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Strategy Family</label>
              <input value={form.strategy_family} onChange={e => set('strategy_family', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none resize-none" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Ideal Client Profile</label>
            <textarea value={form.ideal_client_profile} onChange={e => set('ideal_client_profile', e.target.value)} rows={2} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none resize-none" />
          </div>

          {/* Revenue Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Min Revenue ($)</label>
              <input type="number" value={form.minimum_revenue} onChange={e => set('minimum_revenue', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Max Revenue ($)</label>
              <input type="number" value={form.maximum_revenue} onChange={e => set('maximum_revenue', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
            </div>
          </div>

          {/* Implementation */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Difficulty</label>
              <select value={form.implementation_difficulty} onChange={e => set('implementation_difficulty', e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none">
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Days to Implement</label>
              <input type="number" value={form.implementation_days} onChange={e => set('implementation_days', parseInt(e.target.value) || 90)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Confidence Score (0-100)</label>
              <input type="number" min="0" max="100" value={form.confidence_score} onChange={e => set('confidence_score', parseInt(e.target.value) || 75)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
            </div>
          </div>

          {/* Impact Values */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Expected Impacts</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Profit', typeKey: 'expected_profit_impact_type', valueKey: 'expected_profit_impact_value' },
                { label: 'Tax', typeKey: 'expected_tax_impact_type', valueKey: 'expected_tax_impact_value' },
                { label: 'Value', typeKey: 'expected_value_impact_type', valueKey: 'expected_value_impact_value' },
                { label: 'Cash Flow', typeKey: 'expected_cash_flow_impact_type', valueKey: 'expected_cash_flow_impact_value' },
              ].map(({ label, typeKey, valueKey }) => (
                <div key={label} className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">{label} Type</label>
                    <select value={form[typeKey]} onChange={e => set(typeKey, e.target.value)} className="w-full px-2 py-1.5 text-xs rounded bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none">
                      <option value="">None</option>
                      {IMPACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">{label} Value</label>
                    <input type="number" value={form[valueKey]} onChange={e => set(valueKey, e.target.value)} placeholder="e.g. 2 or 15000" className="w-full px-2 py-1.5 text-xs rounded bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Freedom Acceleration (months)</label>
            <input type="number" value={form.expected_freedom_acceleration_months} onChange={e => set('expected_freedom_acceleration_months', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-foreground focus:border-primary focus:outline-none" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-foreground">Active (visible in selection engine)</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-primary text-primary-foreground">
              <Save className="w-4 h-4 mr-2" />
              Save Strategy
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}