/**
 * WhatIfAdjust — change a scenario's own inputs and re-run it.
 *
 * The fields are the lever's declared inputs from the engine catalog, so only
 * figures the model actually uses can be changed. Blank fields keep whatever
 * the scenario used last.
 */

import React, { useState } from 'react';

export default function WhatIfAdjust({ scenario, asks, collectedInputs, onSubmit }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(asks.map((a) => [a.key, collectedInputs[a.key] ?? '']))
  );

  const current = (key) =>
    (scenario?.assumed || []).find((a) => a.key === key)?.value || null;

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    for (const a of asks) {
      const parsed = parseFloat(String(values[a.key]).replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(parsed)) next[a.key] = parsed;
    }
    if (Object.keys(next).length > 0) onSubmit(next);
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/[0.07] pt-4">
      {asks.map((a) => (
        <label key={a.key} className="block space-y-1">
          <span className="block text-[11.5px] text-white/60">{a.label}</span>
          <span className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={values[a.key]}
              onChange={(e) => setValues((v) => ({ ...v, [a.key]: e.target.value }))}
              placeholder={current(a.key) || ''}
              className="w-[180px] rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[13px] text-white/85 outline-none placeholder:text-white/25 focus:border-vision-gold/45"
            />
            {a.unit && <span className="text-[11px] text-white/35">{a.unit}</span>}
          </span>
        </label>
      ))}
      <button
        type="submit"
        className="rounded-full bg-vision-gold px-4 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
      >
        Re-run the model
      </button>
    </form>
  );
}