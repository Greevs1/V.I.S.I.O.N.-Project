/**
 * DensitySelector — Phase 13.3F.1
 *
 * Compact pill selector for three information density levels.
 * Summary (default) shows only key values and next action.
 * Standard adds supporting metrics. Expert adds full technical detail.
 * Persisted per user via useDensityMode hook.
 */
import React from 'react';

const MODES = [
  { key: 'summary', label: 'Summary' },
  { key: 'standard', label: 'Standard' },
  { key: 'expert', label: 'Expert' },
];

export default function DensitySelector({ density, onChange }) {
  return (
    <div className="inline-flex items-center rounded-lg bg-secondary/60 p-0.5" role="radiogroup" aria-label="Information density">
      {MODES.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          role="radio"
          aria-checked={density === m.key}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            density === m.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}