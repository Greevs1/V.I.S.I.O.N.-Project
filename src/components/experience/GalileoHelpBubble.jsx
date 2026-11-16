/**
 * GalileoHelpBubble
 *
 * Small, collapsible help bubble shown in Journey mode beside key assessment inputs.
 * Shows what the field means, why it matters, how to estimate, and whether Galileo
 * can prefill it from uploaded documents.
 *
 * Props:
 *   fieldKey  - key from GALILEO_HELP map
 *   help      - { title, body, estimate, prefill_note } — pass directly or derive from fieldKey
 */

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { GALILEO_HELP } from '@/lib/assessmentPrefillMap';

export default function GalileoHelpBubble({ fieldKey, help: helpOverride }) {
  const [open, setOpen] = useState(false);

  const help = helpOverride || (fieldKey ? GALILEO_HELP[fieldKey] : null);
  if (!help) return null;

  return (
    <div className="relative inline-flex items-center">
      {/* Trigger icon */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[#D4A853]/50 hover:text-[#D4A853] transition-colors group"
        aria-label="Galileo help"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="text-[10px] tracking-wide text-[#D4A853]/40 group-hover:text-[#D4A853]/70 transition-colors hidden sm:inline">
          How to estimate
        </span>
      </button>

      {/* Popover panel — fixed position to avoid clipping on mobile */}
      {open && (
        <div
          className="fixed z-50 bottom-4 left-4 right-4 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-2 w-auto sm:w-72 rounded-xl border border-[#D4A853]/20 shadow-xl shadow-black/50 p-4 space-y-2.5"
          style={{ background: 'rgba(13,13,13,0.97)', backdropFilter: 'blur(12px)' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#D4A853]/60 shrink-0" />
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#D4A853]/50">Galileo</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/20 hover:text-white/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Title */}
          <p className="text-white/90 text-xs font-semibold">{help.title}</p>

          {/* Body */}
          <p className="text-white/55 text-xs leading-relaxed">{help.body}</p>

          {/* Estimate tip */}
          {help.estimate && (
            <div className="rounded-md bg-white/4 border border-white/6 px-3 py-2">
              <p className="text-white/45 text-[11px] leading-relaxed">
                <span className="text-white/25 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">If unsure</span>
                {help.estimate}
              </p>
            </div>
          )}

          {/* Prefill note */}
          {help.prefill_note && (
            <p className="text-[#D4A853]/45 text-[10px] flex items-start gap-1.5 leading-relaxed">
              <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
              {help.prefill_note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}