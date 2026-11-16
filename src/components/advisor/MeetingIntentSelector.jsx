import React from 'react';

const INTENT_OPTIONS = [
  { value: 'quarterly_review', label: 'Quarterly Review' },
  { value: 'monthly_review', label: 'Monthly Review' },
  { value: 'tax_planning', label: 'Tax Planning' },
  { value: 'valuation_review', label: 'Valuation Review' },
  { value: 'exit_planning', label: 'Exit Planning' },
  { value: 'annual_planning', label: 'Annual Planning' },
  { value: 'growth_planning', label: 'Growth Planning' },
  { value: 'cash_flow_review', label: 'Cash Flow Review' },
  { value: 'operations_review', label: 'Operations Review' },
  { value: 'acquisition', label: 'Acquisition Discussion' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'board_meeting', label: 'Board Meeting' },
  { value: 'succession_planning', label: 'Succession Planning' },
  { value: 'discovery_call', label: 'Discovery Call' },
  { value: 'strategy_session', label: 'Strategy Session' },
  { value: 'internal_advisor_review', label: 'Internal Advisor Review' },
  { value: 'custom', label: 'Custom Meeting' },
];

export default function MeetingIntentSelector({ intent, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Meeting Focus:</label>
      <select
        value={intent}
        onChange={e => onChange(e.target.value)}
        className="h-8 bg-secondary border border-border rounded-lg px-2.5 text-xs outline-none focus:border-primary/50 cursor-pointer"
      >
        {INTENT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}