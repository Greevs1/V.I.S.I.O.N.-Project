/**
 * AddBackReviewModal — Phase 13.3E.3
 * Specialized add-back review: approve / approve with changed amount / reject /
 * needs support / request documentation. Only approved values flow into
 * normalized earnings. Advisor reason required for overrides.
 */
import React, { useState } from 'react';
import { X, Check, Edit3, FileQuestion, FileText } from 'lucide-react';

export default function AddBackReviewModal({ item, onClose, onApprove, onReject, onRequestClient }) {
  const [mode, setMode] = useState('approve'); // approve | change | reject | support
  const [amount, setAmount] = useState(item?.suggested_value ?? '');
  const [reason, setReason] = useState('');

  if (!item) return null;

  const handleSubmit = () => {
    if (mode === 'approve') onApprove({ approved_amount: item.suggested_value, resolution_reason: reason || undefined });
    else if (mode === 'change') onApprove({ approved_amount: Number(amount), resolution_reason: reason || 'Override amount' });
    else if (mode === 'reject') onReject({ resolution_reason: reason || undefined });
    else if (mode === 'support') onRequestClient(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h3 className="text-sm font-semibold text-foreground">Review Add-Back: {item.category}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Description" value={item.description} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Proposed amount" value={item.formatted_value || '—'} />
            <Field label="Period" value={item.reporting_period || '—'} />
            <Field label="Source" value={item.source_name || '—'} />
            <Field label="Confidence" value={item.confidence_score != null ? `${Math.round(item.confidence_score)}%` : '—'} />
          </div>
          <Field label="Why it may qualify" value={item.metadata?.why_qualifies || 'Pattern-based candidate from extracted document fields.'} />
          <Field label="Buyer defensibility" value={item.metadata?.buyer_defensibility || 'Review for one-time/non-recurring nature and buyer acceptance.'} />

          {/* Mode selector */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <ModeBtn active={mode === 'approve'} onClick={() => setMode('approve')} icon={Check} label="Approve" color="#22c55e" />
            <ModeBtn active={mode === 'change'} onClick={() => setMode('change')} icon={Edit3} label="Approve w/ Change" color="#00D4FF" />
            <ModeBtn active={mode === 'reject'} onClick={() => setMode('reject')} icon={X} label="Reject" color="#EF4444" />
            <ModeBtn active={mode === 'support'} onClick={() => setMode('support')} icon={FileQuestion} label="Needs Support" color="#F59E0B" />
          </div>

          {mode === 'change' && (
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Approved amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full mt-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          {(mode === 'change' || mode === 'reject') && (
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Advisor reason {mode === 'change' ? '(required for override)' : '(optional)'}</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Explain the adjustment..."
                className="w-full mt-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={mode === 'change' && !reason.trim()}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
            >
              {mode === 'approve' ? 'Approve' : mode === 'change' ? 'Approve w/ Change' : mode === 'reject' ? 'Reject' : 'Request Support'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className="text-xs text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function ModeBtn({ active, onClick, icon: Icon, label, color }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        color: active ? color : '#9ca3af',
        background: active ? `${color}14` : 'transparent',
        border: `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}