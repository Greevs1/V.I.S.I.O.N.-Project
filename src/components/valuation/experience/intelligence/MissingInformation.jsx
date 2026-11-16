/**
 * MissingInformation — fields with no source, grouped with guidance.
 * Shows what's missing, why it matters, and best source to provide.
 */
import React from 'react';
import { FileQuestion } from 'lucide-react';

export default function MissingInformation({ candidates }) {
  const missing = (candidates || []).filter((c) => c.suggested_value == null);
  if (missing.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Missing Information</h3>
        <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <p className="text-xs text-accent">All tracked data points have at least one source.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Missing Information</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{missing.length} data point(s) need a source. Each shows why it matters and the best way to provide it.</p>
      </div>
      <div className="space-y-2">
        {missing.map((c) => (
          <div key={c.field_key} className="rounded-lg p-3 flex items-start gap-2.5" style={{ background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.12)' }}>
            <FileQuestion className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">{c.display_name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.recommended_action}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}