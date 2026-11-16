/**
 * ValuationStatusBadge — reusable status display for workspace sections.
 * Uses the shared statusModel for labels and colors (single mapping layer).
 */
import React from 'react';
import { STATUS_LABELS, STATUS_COLORS, normalizeStatus } from '@/lib/valuation/statusModel';

export default function ValuationStatusBadge({ status = 'not_started', size = 'sm' }) {
  const normalized = normalizeStatus(status);
  const label = STATUS_LABELS[normalized] || STATUS_LABELS.not_started;
  const { color, bg } = STATUS_COLORS[normalized] || STATUS_COLORS.not_started;
  const padding = size === 'lg' ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-[11px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding}`}
      style={{ color, background: bg, border: `1px solid ${color}22` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export { STATUS_LABELS, STATUS_COLORS };