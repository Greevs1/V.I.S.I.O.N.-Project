/**
 * ScenarioShell — Phase 13.2
 *
 * Renders the scenario structure for advisor entry. Does not calculate
 * scenario values yet. Advisors can enter titles, descriptions, assumptions,
 * and approval status.
 */
import React, { useState } from 'react';
import { Layers, Plus, Trash2, CheckCircle2 } from 'lucide-react';

const SCENARIO_TYPES = [
  { value: 'current', label: 'Current', desc: 'Value as-is with no improvements' },
  { value: 'indicated', label: 'Indicated', desc: 'Value including identified but unexecuted improvements' },
  { value: 'defensible', label: 'Defensible', desc: 'Conservative value a buyer would likely accept' },
  { value: 'potential', label: 'Potential', desc: 'Value if all value drivers are realized' },
  { value: 'conservative', label: 'Conservative', desc: 'Lower-bound estimate' },
  { value: 'base', label: 'Base', desc: 'Most likely estimate' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Upper-bound estimate' },
  { value: 'strategic', label: 'Strategic', desc: 'Value to a strategic buyer including synergies' },
];

export default function ScenarioShell({ valuationId, scenarios = [], onSave }) {
  const [localScenarios, setLocalScenarios] = useState(scenarios);
  const [showAdd, setShowAdd] = useState(false);
  const [newScenario, setNewScenario] = useState({ scenario_type: 'current', scenario_name: '', description: '' });

  const addScenario = () => {
    if (!newScenario.scenario_name) return;
    const scenario = {
      id: `temp-${Date.now()}`,
      valuation_id: valuationId,
      ...newScenario,
      key_assumptions: '',
      included_improvements: '',
      excluded_improvements: '',
      advisor_notes: '',
      approval_status: 'pending',
      is_recommended: false,
    };
    setLocalScenarios(prev => [...prev, scenario]);
    setNewScenario({ scenario_type: 'current', scenario_name: '', description: '' });
    setShowAdd(false);
  };

  const updateScenario = (id, field, value) => {
    setLocalScenarios(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeScenario = (id) => {
    setLocalScenarios(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Value Scenarios</h3>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Scenario
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Scenario values are not calculated yet. Advisors can enter scenario structure, assumptions, and approval status.
      </p>

      {/* Add Form */}
      {showAdd && (
        <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Scenario Type</label>
              <select
                value={newScenario.scenario_type}
                onChange={e => setNewScenario(p => ({ ...p, scenario_type: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border"
              >
                {SCENARIO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Scenario Name</label>
              <input
                type="text"
                value={newScenario.scenario_name}
                onChange={e => setNewScenario(p => ({ ...p, scenario_name: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border"
                placeholder="e.g., Current State, Defensible Value"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea
              value={newScenario.description}
              onChange={e => setNewScenario(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addScenario} className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground">Create</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded text-sm text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      {/* Scenario Cards */}
      {localScenarios.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No scenarios yet. Add a scenario to define the value structure.</p>
        </div>
      )}

      {localScenarios.map(scenario => {
        const typeConfig = SCENARIO_TYPES.find(t => t.value === scenario.scenario_type) || {};
        return (
          <div key={scenario.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div>
                <p className="text-sm font-semibold text-foreground">{scenario.scenario_name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{typeConfig.label} — {typeConfig.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                {scenario.approval_status === 'approved' && (
                  <span className="flex items-center gap-1 text-[10px] text-accent"><CheckCircle2 className="w-3 h-3" /> Approved</span>
                )}
                <button onClick={() => removeScenario(scenario.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Description</label>
                <textarea
                  value={scenario.description || ''}
                  onChange={e => updateScenario(scenario.id, 'description', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Key Assumptions</label>
                <textarea
                  value={scenario.key_assumptions || ''}
                  onChange={e => updateScenario(scenario.id, 'key_assumptions', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border resize-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Included Improvements</label>
                  <textarea
                    value={scenario.included_improvements || ''}
                    onChange={e => updateScenario(scenario.id, 'included_improvements', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Excluded Improvements</label>
                  <textarea
                    value={scenario.excluded_improvements || ''}
                    onChange={e => updateScenario(scenario.id, 'excluded_improvements', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border resize-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Advisor Notes</label>
                <textarea
                  value={scenario.advisor_notes || ''}
                  onChange={e => updateScenario(scenario.id, 'advisor_notes', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Approval Status</label>
                <select
                  value={scenario.approval_status || 'pending'}
                  onChange={e => updateScenario(scenario.id, 'approval_status', e.target.value)}
                  className="px-2 py-1 rounded bg-secondary text-xs text-foreground border border-border"
                >
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scenario.is_recommended || false}
                    onChange={e => updateScenario(scenario.id, 'is_recommended', e.target.checked)}
                  />
                  Recommended scenario
                </label>
              </div>
              {/* Value Placeholder */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Enterprise Value</p>
                <p className="text-sm text-muted-foreground/50">Pending calculation engine</p>
              </div>
            </div>
          </div>
        );
      })}

      {localScenarios.length > 0 && (
        <button onClick={() => onSave?.(localScenarios)} className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground">
          Save Scenarios
        </button>
      )}
    </div>
  );
}