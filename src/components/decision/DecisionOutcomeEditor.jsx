import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save } from 'lucide-react';
import { setExpectedOutcomes } from '@/lib/decisionIntelligenceService';

export default function DecisionOutcomeEditor({ decision, onSaved }) {
  const [outcomes, setOutcomes] = useState([]);
  const [reviewDate, setReviewDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOutcomes(decision?.expected_outcomes || []);
    setReviewDate(decision?.outcome_review_date || '');
  }, [decision]);

  const addOutcome = () => {
    setOutcomes([...outcomes, {
      outcome_id: `eo-${Date.now()}`,
      description: '', success_indicator: '', time_horizon: '90 days',
      metric_key: null, baseline_value: null, target_value: null,
      target_direction: 'increase', target_date: null, importance: 'strategic',
    }]);
  };

  const updateOutcome = (id, field, value) => {
    setOutcomes(outcomes.map((o) => o.outcome_id === id ? { ...o, [field]: value } : o));
  };

  const removeOutcome = (id) => {
    setOutcomes(outcomes.filter((o) => o.outcome_id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await setExpectedOutcomes(decision.decision_id, outcomes, reviewDate);
      if (onSaved) onSaved(res.decision);
    } catch (e) {
      console.error('Failed to save expected outcomes:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Expected Outcomes</p>
        <Button onClick={addOutcome} variant="outline" size="sm">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Outcome
        </Button>
      </div>

      {outcomes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Define what success looks like. What should be different after this decision?
        </p>
      )}

      {outcomes.map((o, i) => (
        <div key={o.outcome_id} className="glass rounded-lg p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground">OUTCOME {i + 1}</span>
            <button onClick={() => removeOutcome(o.outcome_id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            type="text" value={o.description} onChange={(e) => updateOutcome(o.outcome_id, 'description', e.target.value)}
            placeholder="e.g. Increase gross margin from 31% to 34%"
            className="w-full bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
          />
          <input
            type="text" value={o.success_indicator} onChange={(e) => updateOutcome(o.outcome_id, 'success_indicator', e.target.value)}
            placeholder="Success indicator (e.g. Gross margin reaches 34%)"
            className="w-full bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" value={o.time_horizon} onChange={(e) => updateOutcome(o.outcome_id, 'time_horizon', e.target.value)}
              placeholder="Time horizon (e.g. 90 days)"
              className="bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
            />
            <select
              value={o.target_direction || 'increase'} onChange={(e) => updateOutcome(o.outcome_id, 'target_direction', e.target.value)}
              className="bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
            >
              <option value="increase">Increase</option>
              <option value="decrease">Decrease</option>
              <option value="maintain">Maintain</option>
              <option value="achieve">Achieve</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text" value={o.metric_key || ''} onChange={(e) => updateOutcome(o.outcome_id, 'metric_key', e.target.value || null)}
              placeholder="Metric key (optional)"
              className="bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
            />
            <input
              type="number" value={o.baseline_value ?? ''} onChange={(e) => updateOutcome(o.outcome_id, 'baseline_value', e.target.value ? Number(e.target.value) : null)}
              placeholder="Baseline" className="bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
            />
            <input
              type="number" value={o.target_value ?? ''} onChange={(e) => updateOutcome(o.outcome_id, 'target_value', e.target.value ? Number(e.target.value) : null)}
              placeholder="Target" className="bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
            />
          </div>
        </div>
      ))}

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Review Date</label>
        <input
          type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)}
          className="bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
        />
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
        <Save className="w-3.5 h-3.5 mr-1.5" />
        {saving ? 'Saving...' : 'Save Expected Outcomes'}
      </Button>
    </div>
  );
}