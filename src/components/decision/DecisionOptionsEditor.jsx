import React, { useState } from 'react';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * Editor for decision options — add, edit, remove, and compare options.
 * Each option has: label, summary, advantages, disadvantages, risk, time horizon.
 */
export default function DecisionOptionsEditor({ options = [], onChange, readOnly = false }) {
  const [expanded, setExpanded] = useState(null);

  const addOption = () => {
    const newOption = {
      option_id: `opt-${Date.now()}`,
      label: `Option ${String.fromCharCode(65 + options.length)}`,
      summary: '',
      advantages: [],
      disadvantages: [],
      financial_implications: null,
      operational_implications: null,
      risk_level: null,
      time_horizon: null,
      confidence: null,
      required_resources: [],
      dependencies: [],
      evidence_refs: [],
      assumption_refs: [],
    };
    onChange([...options, newOption]);
    setExpanded(newOption.option_id);
  };

  const updateOption = (id, updates) => {
    onChange(options.map((o) => (o.option_id === id ? { ...o, ...updates } : o)));
  };

  const removeOption = (id) => {
    onChange(options.filter((o) => o.option_id !== id));
  };

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={opt.option_id} className="glass rounded-lg border border-border overflow-hidden">
          <div
            className="flex items-center gap-2 p-3 cursor-pointer hover:bg-secondary/30"
            onClick={() => setExpanded(expanded === opt.option_id ? null : opt.option_id)}
          >
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
              {String.fromCharCode(65 + i)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{opt.label || `Option ${String.fromCharCode(65 + i)}`}</p>
              {opt.summary && <p className="text-xs text-muted-foreground truncate">{opt.summary}</p>}
            </div>
            {expanded === opt.option_id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>

          {expanded === opt.option_id && !readOnly && (
            <div className="px-3 pb-3 space-y-2 border-t border-border">
              <input
                type="text"
                value={opt.label}
                onChange={(e) => updateOption(opt.option_id, { label: e.target.value })}
                placeholder="Option label"
                className="w-full bg-secondary/50 rounded px-2 py-1.5 text-sm text-foreground border border-border focus:border-primary outline-none"
              />
              <textarea
                value={opt.summary}
                onChange={(e) => updateOption(opt.option_id, { summary: e.target.value })}
                placeholder="Summary of this option..."
                rows={2}
                className="w-full bg-secondary/50 rounded px-2 py-1.5 text-sm text-foreground border border-border focus:border-primary outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk</label>
                  <select
                    value={opt.risk_level || ''}
                    onChange={(e) => updateOption(opt.option_id, { risk_level: e.target.value || null })}
                    className="w-full bg-secondary/50 rounded px-2 py-1 text-xs text-foreground border border-border focus:border-primary outline-none"
                  >
                    <option value="">—</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Time Horizon</label>
                  <input
                    type="text"
                    value={opt.time_horizon || ''}
                    onChange={(e) => updateOption(opt.option_id, { time_horizon: e.target.value })}
                    placeholder="e.g. 6 months"
                    className="w-full bg-secondary/50 rounded px-2 py-1 text-xs text-foreground border border-border focus:border-primary outline-none"
                  />
                </div>
              </div>
              <button
                onClick={() => removeOption(opt.option_id)}
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove option
              </button>
            </div>
          )}

          {expanded === opt.option_id && readOnly && (
            <div className="px-3 pb-3 space-y-1 border-t border-border">
              {opt.summary && <p className="text-xs text-muted-foreground">{opt.summary}</p>}
              {opt.risk_level && <p className="text-xs"><span className="text-muted-foreground">Risk:</span> <span className="text-foreground capitalize">{opt.risk_level}</span></p>}
              {opt.time_horizon && <p className="text-xs"><span className="text-muted-foreground">Horizon:</span> <span className="text-foreground">{opt.time_horizon}</span></p>}
            </div>
          )}
        </div>
      ))}

      {!readOnly && (
        <button
          onClick={addOption}
          className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 flex items-center justify-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add option
        </button>
      )}
    </div>
  );
}