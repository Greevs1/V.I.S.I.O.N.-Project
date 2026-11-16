/**
 * ValuationHistory — Phase 13.3F.2
 *
 * Expandable section for archived/historical valuations.
 * Keeps archived valuations out of the main owner experience.
 * Shows name, date, EV, version, archive date, shared status, and
 * a view-history action for each entry.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Archive, Eye } from 'lucide-react';
import { fmtCurrency } from '@/lib/valuation/valuationState';

export default function ValuationHistory({ archivedValuations = [], currentArchived = null, onViewHistory, canEdit }) {
  const [expanded, setExpanded] = useState(false);
  const entries = [...archivedValuations];
  if (currentArchived && !entries.find((e) => e.id === currentArchived.id)) {
    entries.unshift(currentArchived);
  }

  if (entries.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Archive className="w-4 h-4" />
        <span className="font-medium">Valuation History</span>
        <span className="text-[11px] text-muted-foreground/60">· {entries.length} archived</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-lg p-3 text-xs"
              style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">
                  {entry.business_name || 'Business Valuation'} · {entry.valuation_date ? new Date(entry.valuation_date).toLocaleDateString() : '—'}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70 mt-0.5">
                  <span>EV: {entry.enterprise_value != null ? fmtCurrency(entry.enterprise_value) : '—'}</span>
                  {entry.version_number && <span>v{entry.version_number}</span>}
                  {entry.archived_at && <span>Archived {new Date(entry.archived_at).toLocaleDateString()}</span>}
                  <span className="capitalize">{(entry.client_sharing_status || 'not_shared').replace(/_/g, ' ')}</span>
                </div>
              </div>
              <button
                onClick={() => onViewHistory?.(entry)}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0"
              >
                <Eye className="w-3 h-3" />
                View
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}