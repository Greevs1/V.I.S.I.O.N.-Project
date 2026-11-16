/**
 * ChainOfCustodyDrawer — Phase 13.3E.5
 *
 * Visual lineage drawer showing the beginning of the approved chain of custody:
 *   Initiative → Value Driver → Build Value Dimension → Business Capability →
 *   Operational Lever → Financial Impact → Valuation Method Impact →
 *   Expected EV Relevance → KPI → Verification Method
 *
 * Does not create the later execution and realized-value links until Phase 13.4
 * and the Operating System integration.
 */
import React from 'react';
import { X, Network, ArrowDown } from 'lucide-react';

export default function ChainOfCustodyDrawer({ initiative, chain, onClose }) {
  if (!initiative || !chain) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div
        className="relative w-full max-w-md h-full overflow-y-auto p-5"
        style={{ background: 'hsl(var(--card))', borderLeft: '1px solid hsl(var(--border))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">Value Creation Chain of Custody</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Initiative name */}
        <p className="text-xs text-muted-foreground mb-1">Initiative</p>
        <p className="text-sm font-semibold text-foreground mb-4">{initiative.name}</p>

        {/* Chain */}
        <div className="space-y-0">
          {chain.map((link, i) => (
            <div key={i}>
              <div
                className="rounded-lg p-3"
                style={{
                  background: i === 0 ? 'rgba(212,168,83,0.06)' : 'rgba(255,255,255,0.015)',
                  border: `1px solid ${i === 0 ? 'rgba(212,168,83,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{link.label}</p>
                    <p className="text-xs text-foreground mt-0.5">{link.value || '—'}</p>
                  </div>
                </div>
              </div>
              {i < chain.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="w-3 h-3 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Phase 13.4 note */}
        <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Execution and realized-value links (Roadmap, 90-Day Sprint, KPI tracking, realized impact)
            will be added with the Phase 13.4 Institutional Decision Engine and Operating System integration.
          </p>
        </div>
      </div>
    </div>
  );
}