/**
 * WhatIfHoverCard — the explanatory preview for the What If chip.
 *
 * Deliberately small: what What If is, what it can model, and the promise that
 * the model uses THIS business rather than a generic one. It is rendered on
 * hover and on keyboard focus; on touch the chip opens the surface directly,
 * where the same copy is the header.
 */

import React from 'react';
import { Diamond } from 'lucide-react';

const EXAMPLES = [
  'What if I hired a manager?',
  'What if I raised prices 5%?',
  'What if I improved margins by 3 points?',
  'What if I reduced my involvement?',
];

export default function WhatIfHoverCard({ examples = EXAMPLES }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[300px] -translate-x-1/2 rounded-2xl vision-glass-raised vision-sheen p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <div className="flex items-center gap-2">
        <Diamond className="h-3 w-3 text-vision-gold" />
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-vision-champagne">
          What if?
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-white/70">
        Explore a decision before you make it.
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
        Vision uses what it knows about your business to model the change, and tells you
        what is known, what it had to assume, and what it cannot know yet.
      </p>

      <div className="mt-3 space-y-1 border-t border-white/[0.07] pt-2.5">
        {examples.slice(0, 3).map((example) => (
          <p key={example} className="text-[11px] text-white/35">
            {example}
          </p>
        ))}
      </div>
    </div>
  );
}