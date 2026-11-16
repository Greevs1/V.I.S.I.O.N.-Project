/**
 * ClientSummaryShell — tab 15. Shell only, no populated data.
 * All sections display "Pending Advisor Completion" until later phases.
 * Client-facing title: Enterprise Value Analysis™
 */
import React from 'react';
import { Lock } from 'lucide-react';

const SECTIONS = [
  { key: 'current_value', label: 'Current Enterprise Value' },
  { key: 'defensible_value', label: 'Defensible Enterprise Value' },
  { key: 'potential_value', label: 'Potential Enterprise Value' },
  { key: 'value_gap', label: 'Enterprise Value Gap' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'value_drivers', label: 'Value Drivers' },
  { key: 'risks', label: 'Risks' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'advisor_commentary', label: 'Advisor Commentary' },
  { key: 'roadmap', label: 'Roadmap' },
  { key: 'disclosures', label: 'Disclosures' },
];

export default function ClientSummaryShell() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary mb-1">Enterprise Value Analysis™</p>
        <h3 className="text-lg font-semibold">Client Summary</h3>
        <p className="text-xs text-muted-foreground mt-1">
          This section will be populated with client-safe valuation insights once the advisor completes the analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((section) => (
          <div
            key={section.key}
            className="rounded-xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">{section.label}</p>
            </div>
            <div className="py-4 text-center">
              <p className="text-xs text-muted-foreground/50 italic">Pending Advisor Completion</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}