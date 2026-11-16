/**
 * ExpertPrepChecklist — "what should I have ready", for EVERYONE.
 *
 * It shows value without exposing the paid Expert ecosystem (Part 19), so it is
 * rendered for entitled and non-entitled owners alike.
 *
 * A ✓ means Vision can VERIFY the underlying fact in the canonical contract. It
 * is never an assumption. Items Vision cannot verify stay ○ Needed, which is the
 * bridge into the Data Room and into Galileo.
 */

import React from 'react';
import { Check, Circle } from 'lucide-react';

export default function ExpertPrepChecklist({ items = [], roleLabel }) {
  if (!items.length) return null;
  const readyCount = items.filter((i) => i.ready).length;

  return (
    <section className="rounded-2xl vision-glass px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {roleLabel ? `Before working with a ${roleLabel}` : 'Before you start'}
        </h3>
        <span className="text-[11px] text-white/30">{readyCount} of {items.length} ready</span>
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            {item.ready ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-[12.5px] text-white/75">
                {item.label}
                <span className="ml-1.5 text-[10px] uppercase tracking-wider text-white/30">
                  {item.ready ? 'ready' : 'needed'}
                </span>
              </p>
              {item.ready && item.evidence && (
                <p className="text-[11px] text-white/35">{item.evidence}</p>
              )}
              {!item.ready && item.needed && (
                <p className="text-[11px] text-white/35">{item.needed}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-white/30">
        Anything that lives outside Vision, such as contracts or customer-level detail, stays
        marked needed so you know to bring it with you.
      </p>
    </section>
  );
}