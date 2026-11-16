/**
 * ArrivalChoices — the first interaction, as two premium selection surfaces.
 *
 * These have to say "choose one" without becoming conventional bright buttons:
 * a graphite surface a shade above the background, a restrained champagne edge, a
 * whisper of internal light that answers the cursor, and an arrow that moves
 * forward. On selection the chosen card confirms — which is how the visitor sees
 * that Galileo heard them before the conversation takes over.
 *
 * Values are the canonical subject values, unchanged.
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function ArrivalChoices({ options = [], onChoose, disabled = false, selected = null }) {
  return (
    <div className="mt-6 grid w-full max-w-[520px] grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onChoose?.(option.value)}
            className={`group relative flex min-h-[64px] w-full items-center justify-between overflow-hidden rounded-[13px] border bg-gradient-to-b from-white/[0.035] to-white/[0.012] px-5 py-4 text-left transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:border-vision-champagne/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vision-champagne/25 active:translate-y-[1px] active:duration-100 disabled:opacity-60 ${
              isSelected
                ? 'border-vision-champagne/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_0_0_1px_rgba(212,168,83,0.22)]'
                : 'border-vision-champagne/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:-translate-y-[1.5px] hover:border-vision-champagne/50 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
            }`}
          >
            {/* A soft champagne illumination inside the card — a whisper on hover,
                a confirmation once chosen. Never a glow around it. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 bg-[radial-gradient(130%_120%_at_50%_0%,rgba(212,168,83,0.13),transparent_62%)] transition-opacity duration-200 ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'
              }`}
            />

            <span className="relative block">
              <span className="block text-[14.5px] font-medium tracking-[-0.005em] text-white/[0.95] transition-colors duration-200 group-hover:text-white">
                {option.label}
              </span>
              <span className="mt-0.5 block text-[12px] leading-[1.35] text-white/50 transition-colors duration-200 group-hover:text-white/60">
                {option.desc}
              </span>
            </span>

            <ArrowRight
              strokeWidth={1.5}
              aria-hidden="true"
              className={`relative h-4 w-4 shrink-0 transition-all duration-200 group-hover:translate-x-1 ${
                isSelected ? 'text-vision-champagne' : 'text-vision-champagne/50 group-hover:text-vision-champagne'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}