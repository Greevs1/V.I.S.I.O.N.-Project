/**
 * SliderInput — reusable slider + manual number entry (Phase 9, item 7)
 *
 * One component replaces every duplicated slider implementation across assessments.
 * Requirements met:
 *   - dragging the slider updates the input
 *   - typing in the input updates the slider
 *   - value is clamped to [min, max] (validation preserved)
 *   - currency / percentage formatting preserved via `format` / `isPercent`
 *   - step preserved
 *
 * Uses a native range input (accentColor) for reliable, purge-safe colored
 * thumbs — avoiding the broken dynamic-Tailwind-class approach.
 */
import React from 'react';

export default function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  color = '#D4A853',
  format = null,       // (n) => string  — custom display formatter (e.g. currency)
  isPercent = false,
  prefix = '$',        // shown when !isPercent
  label = null,
  showBounds = true,
  trackOnly = false,   // pure drop-in for radix <Slider> — renders only the range track
  className = '',
}) {
  if (typeof value !== 'number' || isNaN(value)) value = min;
  const clamp = (v) => {
    if (isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  };
  const handle = (v) => onChange(clamp(v));

  // trackOnly: minimal drop-in replacement for radix Slider — no input box,
  // no label, no bounds. Preserves surrounding bespoke label/value rows.
  if (trackOnly) {
    return (
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => handle(Number(e.target.value))}
        className={`w-full h-1.5 cursor-pointer ${className}`}
        style={{ accentColor: color }}
      />
    );
  }

  const display = format
    ? format(value)
    : isPercent
      ? `${value}%`
      : `${prefix}${Math.round(value).toLocaleString('en-US')}`;

  const boundLabel = (n) =>
    isPercent ? `${n}%` : (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">{label}</p>
          <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
            {!isPercent && <span className="text-xs text-muted-foreground">{prefix}</span>}
            <input
              type="number"
              value={value}
              min={min}
              max={max}
              step={step}
              onChange={(e) => handle(Number(e.target.value))}
              onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
              className="w-24 bg-transparent text-sm text-right outline-none"
            />
            {isPercent && <span className="text-xs text-muted-foreground">%</span>}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!label && (
          <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-2 w-40 shrink-0">
            {!isPercent && <span className="text-xs text-muted-foreground">{prefix}</span>}
            <input
              type="number"
              value={value}
              min={min}
              max={max}
              step={step}
              onChange={(e) => handle(Number(e.target.value))}
              onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
              className="flex-1 bg-transparent text-sm text-right outline-none"
            />
            {isPercent && <span className="text-xs text-muted-foreground">%</span>}
          </div>
        )}

        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => handle(Number(e.target.value))}
          className="flex-1 h-1.5 cursor-pointer"
          style={{ accentColor: color }}
        />
      </div>

      {showBounds && (
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">{boundLabel(min)}</span>
          <span className="text-xs font-semibold" style={{ color }}>{display}</span>
          <span className="text-[10px] text-muted-foreground">{boundLabel(max)}</span>
        </div>
      )}
    </div>
  );
}