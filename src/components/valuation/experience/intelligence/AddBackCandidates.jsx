/**
 * AddBackCandidates — proposed adjustments detected from extracted data.
 * Advisor must approve. Never auto-included in normalized earnings.
 */
import React from 'react';
import { ShieldAlert, FileWarning } from 'lucide-react';

export default function AddBackCandidates({ addBackCandidates }) {
  const candidates = addBackCandidates || [];
  if (candidates.length === 0) {
    return (
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Add-Back Candidates</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Potential adjustments detected from extracted documents.</p>
        </div>
        <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs text-muted-foreground">No add-back candidates detected yet. Upload a general ledger or P&L to enable detection.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Add-Back Candidates</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{candidates.length} proposed. Advisor approval required — never auto-included.</p>
      </div>
      <div className="space-y-2">
        {candidates.map((c, i) => (
          <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-foreground">{c.label}</p>
              {c.amount != null && <span className="text-xs font-semibold text-foreground/80">{c.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">{c.description}</p>
            <div className="space-y-1 text-[10px]">
              <p className="text-muted-foreground"><span className="text-foreground/60">Why qualifies:</span> {c.why_qualifies}</p>
              <p className="text-muted-foreground flex items-start gap-1"><ShieldAlert className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" /><span><span className="text-foreground/60">Buyer defensibility:</span> {c.buyer_defensibility_warning}</span></p>
              <p className="text-muted-foreground"><span className="text-foreground/60">Replacement cost:</span> {c.replacement_cost_consideration}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-amber-500/10">
              <FileWarning className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">{c.advisor_action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}