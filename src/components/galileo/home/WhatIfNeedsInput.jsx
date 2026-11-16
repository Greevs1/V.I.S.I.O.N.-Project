/**
 * WhatIfNeedsInput — the ONE question the engine asks before it can model.
 *
 * There are two kinds, and they are not the same thing:
 *
 * 1. A LEVER parameter — a figure the model needs in order to run at all
 *    ("how much would you raise prices by?").
 *
 * 2. A MISSING GOVERNED BASELINE — a fact about the business Vision does not
 *    hold yet (annual revenue). Only this kind is RECOVERABLE, and the engine
 *    declares exactly two honest ways out of it:
 *      a. an existing Vision capability supplies it — financial statements read
 *         through the Data Room, which keep their verified status; or
 *      b. the owner types it for this scenario, which is OWNER REPORTED and
 *         UNVERIFIED, is never saved to business records, and is dropped the
 *         moment a governed figure exists.
 *
 * The capability is offered FIRST, because a governed figure is worth more than
 * a typed one. The classification is stated where the owner types, so nobody has
 * to infer whether what they entered became a business fact.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Loader2, RotateCw } from 'lucide-react';

export default function WhatIfNeedsInput({
  scenario,
  loading,
  onSubmit,
  onApplyEstimate,
  onOpenSource,
  onRecheck,
  rechecking,
  recheckNote,
}) {
  const [value, setValue] = useState('');
  const input = scenario.input;
  const recovery = scenario.recovery;

  const submit = (e) => {
    e?.preventDefault();
    const parsed = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(parsed) || loading) return;
    setValue('');
    onSubmit(input.key, parsed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-2xl vision-glass-raised vision-sheen p-5"
    >
      {recovery ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
            One thing missing
          </p>
          <p className="font-display text-[16.5px] leading-relaxed text-white/85">
            {recovery.reason}
          </p>
          <p className="text-[12px] leading-relaxed text-white/45">
            This is a scenario Vision can model. It only needs {input.label.toLowerCase()} to
            run it against your business.
          </p>
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-white/75">
          I can model this, but I need one thing first.
        </p>
      )}

      {/* ── The capability, offered before the typed shortcut ── */}
      {recovery?.source && (
        <button
          type="button"
          onClick={() => onOpenSource?.(recovery.source)}
          className="flex w-full items-center gap-3 rounded-xl border border-vision-gold/20 bg-vision-gold/[0.03] p-3.5 text-left transition-colors hover:border-vision-gold/40 vision-focus"
        >
          <FileText className="h-4 w-4 shrink-0 text-vision-champagne" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-white/85">
              {recovery.source.label}
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-white/45">
              {recovery.source.detail}
            </span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-vision-champagne/70" />
        </button>
      )}

      {/* ── Coming back from that capability ── */}
      {onRecheck && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={onRecheck}
            disabled={rechecking}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright disabled:opacity-50 vision-focus"
          >
            {rechecking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
            I've done that — check again
          </button>
          {recheckNote && (
            <span className="text-[11px] leading-relaxed text-white/40">{recheckNote}</span>
          )}
        </div>
      )}

      {recovery && <div className="h-px bg-white/[0.07]" />}

      <p className="font-display text-[15px] text-white/85">{input.question}</p>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={input.unit === '$' ? '150000' : '20'}
          aria-label={input.label}
          className="w-[180px] rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[13px] text-white/85 outline-none placeholder:text-white/25 focus:border-vision-gold/45"
        />
        <span className="text-[11.5px] text-white/35">{input.unit}</span>
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-full bg-vision-gold px-4 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright disabled:opacity-30 vision-focus"
        >
          Model it
        </button>
        {input.estimate_value != null && (
          <button
            type="button"
            onClick={() => onApplyEstimate?.(input.key, input.estimate_value)}
            className="rounded-full border border-white/[0.09] px-3.5 py-1.5 text-[11.5px] text-white/55 transition-colors hover:border-vision-gold/30 hover:text-white/85 vision-focus"
          >
            Use a reasonable estimate
          </button>
        )}
      </form>

      {/* ── What typing here actually means. Stated before, not after. ── */}
      {recovery && (
        <div className="space-y-1 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
          <p className="text-[10px] uppercase tracking-wider text-vision-champagne/75">
            {recovery.classification_label}
          </p>
          <p className="text-[11px] leading-relaxed text-white/45">
            {recovery.classification_note}
          </p>
        </div>
      )}

      {input.estimate_basis && (
        <p className="text-[11px] leading-relaxed text-white/35">
          If you use the estimate: {input.estimate_basis}
        </p>
      )}
    </motion.div>
  );
}