/**
 * ReconciliationWorkflow — Phase 13.2
 *
 * When two sources disagree, creates a reconciliation item. The advisor
 * must select the authoritative source — the system never silently chooses.
 */
import React, { useState, useMemo } from 'react';
import { GitCompare, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

export default function ReconciliationWorkflow({ reconciliationItems = [], onResolve }) {
  const [items, setItems] = useState(reconciliationItems);

  const resolve = (id, selectedValue, reason) => {
    setItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, resolution_status: 'resolved', advisor_selected_value: selectedValue, advisor_reason: reason, resolved_at: new Date().toISOString() }
        : item
    ));
    onResolve?.(id, selectedValue, reason);
  };

  const pending = items.filter(i => i.resolution_status !== 'resolved');
  const resolved = items.filter(i => i.resolution_status === 'resolved');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Data Reconciliation</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        When two sources disagree, the advisor must select the authoritative value. The system never silently chooses.
      </p>

      {items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-accent/40" />
          <p className="text-sm">No conflicting data sources detected.</p>
        </div>
      )}

      {/* Pending Reconciliations */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pending ({pending.length})</p>
          <div className="space-y-3">
            {pending.map(item => (
              <ReconciliationCard key={item.id} item={item} onResolve={resolve} />
            ))}
          </div>
        </div>
      )}

      {/* Resolved Reconciliations */}
      {resolved.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resolved ({resolved.length})</p>
          <div className="space-y-2">
            {resolved.map(item => (
              <div key={item.id} className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.field_label}</p>
                  <p className="text-xs text-muted-foreground">
                    Selected: {item.advisor_selected_value} — {item.advisor_reason}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground/60">{new Date(item.resolved_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReconciliationCard({ item, onResolve }) {
  const [selectedValue, setSelectedValue] = useState('');
  const [reason, setReason] = useState('');

  const diff = Math.abs((item.source_a_value || 0) - (item.source_b_value || 0));
  const pctDiff = item.source_a_value ? (diff / Math.abs(item.source_a_value)) * 100 : 0;

  const handleResolve = () => {
    if (selectedValue && reason) {
      onResolve(item.id, selectedValue, reason);
    }
  };

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)' }}>
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-semibold text-foreground">{item.field_label}</p>
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{item.reporting_period}</span>
      </div>

      {/* Source Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <SourceBox label="Source A" name={item.source_a_name} value={item.source_a_value} confidence={item.source_a_confidence} type={item.source_a_type} />
        <SourceBox label="Source B" name={item.source_b_name} value={item.source_b_value} confidence={item.source_b_confidence} type={item.source_b_type} />
      </div>

      {/* Difference */}
      <div className="rounded-lg p-3 mb-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <span className="text-xs text-muted-foreground">Difference</span>
        <span className="text-sm font-semibold text-amber-500">
          ${diff.toLocaleString()} ({pctDiff.toFixed(1)}%)
        </span>
      </div>

      {/* Resolution */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Select Authoritative Value</p>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedValue(String(item.source_a_value))}
            className={`flex-1 px-3 py-2 rounded text-sm ${selectedValue === String(item.source_a_value) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            Source A: ${item.source_a_value?.toLocaleString()}
          </button>
          <button
            onClick={() => setSelectedValue(String(item.source_b_value))}
            className={`flex-1 px-3 py-2 rounded text-sm ${selectedValue === String(item.source_b_value) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            Source B: ${item.source_b_value?.toLocaleString()}
          </button>
        </div>
        <input
          type="text"
          placeholder="Reason for selection"
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border"
        />
        <button
          onClick={handleResolve}
          disabled={!selectedValue || !reason}
          className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground disabled:opacity-40 flex items-center gap-1.5"
        >
          Resolve <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SourceBox({ label, name, value, confidence, type }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-semibold text-foreground">${value?.toLocaleString() || '—'}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{name}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] text-muted-foreground/60">{type?.replace(/_/g, ' ')}</span>
        {confidence != null && <span className="text-[10px] text-muted-foreground/60">· {confidence}% confidence</span>}
      </div>
    </div>
  );
}