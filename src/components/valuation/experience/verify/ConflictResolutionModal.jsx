/**
 * ConflictResolutionModal — Phase 13.3E.3
 * Side-by-side conflict resolution. Requires a reason for material conflicts.
 */
import React, { useState } from 'react';
import { X, Scale } from 'lucide-react';

export default function ConflictResolutionModal({ item, onClose, onResolve }) {
  const [choice, setChoice] = useState('a'); // 'a' | 'b' | 'reconciled'
  const [reconciledValue, setReconciledValue] = useState('');
  const [reason, setReason] = useState('');
  const alt = item?.alternative_values?.[0];

  const handleSubmit = () => {
    if (!reason.trim()) return;
    const payload = { resolution_reason: reason };
    if (choice === 'a') payload.chosen_source = 'primary';
    else if (choice === 'b') payload.chosen_source = 'alternative';
    else { payload.chosen_source = 'reconciled'; payload.reconciled_value = reconciledValue; }
    onResolve(payload);
  };

  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Resolve Conflict</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">{item.title}</p>
          {/* Living Intelligence: conflict explanation (on-demand, no calculation) */}
          <div className="rounded-lg p-2.5" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.12)' }}>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {synthesizeConflictExplanation(item)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SourceChoice
              selected={choice === 'a'}
              onSelect={() => setChoice('a')}
              label={item.source_name || 'Source A'}
              value={item.formatted_value || String(item.suggested_value ?? '—')}
              confidence={item.confidence_score}
            />
            <SourceChoice
              selected={choice === 'b'}
              onSelect={() => setChoice('b')}
              label={alt?.source_name || 'Source B'}
              value={String(alt?.value ?? '—')}
              confidence={alt?.confidence}
            />
          </div>
          <button
            onClick={() => setChoice('reconciled')}
            className={`w-full text-left rounded-lg p-2.5 border transition-all ${choice === 'reconciled' ? 'border-primary bg-primary/5' : 'border-border bg-background/40'}`}
          >
            <span className="text-xs font-semibold text-foreground">Enter reconciled value</span>
            {choice === 'reconciled' && (
              <input
                value={reconciledValue}
                onChange={(e) => setReconciledValue(e.target.value)}
                placeholder="Reconciled value..."
                className="w-full mt-2 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
              />
            )}
          </button>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Resolution reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Explain why this source/value is authoritative..."
              className="w-full mt-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={!reason.trim() || (choice === 'reconciled' && !reconciledValue.trim())}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceChoice({ selected, onSelect, label, value, confidence }) {
  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-lg p-3 border transition-all ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-background/40'}`}
    >
      <p className="text-[10px] font-semibold text-muted-foreground mb-1 truncate">{label}</p>
      <p className="text-base font-bold text-foreground">{value}</p>
      {confidence != null && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{Math.round(confidence)}% confidence</p>}
    </button>
  );
}

// ── Living Intelligence: synthesize conflict explanation from existing fields ──
// No calculation. No backend call. Explains why sources may disagree.
function synthesizeConflictExplanation(item) {
  const sourceA = item.source_name || 'Source A';
  const alt = item.alternative_values?.[0];
  const sourceB = alt?.source_name || 'Source B';
  const confA = item.confidence_score;
  const confB = alt?.confidence;

  if (item.reporting_period) {
    return `${sourceA} and ${sourceB} may reflect different reporting periods. Compare the periods and choose the one that matches your valuation date.`;
  }

  if (confA != null && confB != null && Math.abs(confA - confB) < 10) {
    return `${sourceA} and ${sourceB} have similar confidence. Review both values and choose the one that best reflects the current business state.`;
  }

  if (confA != null && confB != null && confA > confB) {
    return `${sourceA} has higher confidence than ${sourceB}. The higher-confidence source is generally more reliable, but review both before deciding.`;
  }

  return `${sourceA} and ${sourceB} show different values. Review the evidence for each and choose the more authoritative source.`;
}