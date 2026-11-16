/**
 * ScenarioContinuation — THE MAIN SURFACE, ARRIVED AT BY MODEL THIS.
 *
 * Discovery found something and the owner said "I want to see what I could do
 * about this." That is not a detail to inspect in a side drawer: it is the moment
 * the conversation becomes work, so it lands here — inside the same Galileo shell,
 * with Galileo already knowing what was being explored.
 *
 * WHAT IT IS
 *   · WHAT GALILEO FOUND — the opportunity and the focus, in the model's own words
 *   · NEXT BEST MOVE — the lever's own next step (canonical scenario vocabulary)
 *   · NEXT STEPS — the opportunity's OWN candidate actions, at most three
 *   · the natural fork — do it with Galileo, or bring in an expert
 *
 * WHAT IT IS NOT
 *   A generic dashboard, a page load, a restarted conversation, an entitlements
 *   gate, or a giant implementation checklist. Nothing here invents a number: the
 *   copy is derived from the active-scenario record (see lib/galileo/activeScenario).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Compass, Sparkles, UserRound } from 'lucide-react';
import ContinuationStatus from './ContinuationStatus';

const EASE = [0.22, 0.61, 0.36, 1];

export default function ScenarioContinuation({
  continuation,
  phase = 'ready',
  error = null,
  onContinue,
  onGuide,
  onExpert,
  onHome,
  onRetry,
}) {
  // The transition is a STATE MACHINE, not a content swap: resolving, failed (and
  // retryable), or complete. A failure keeps the person's answers and offers the
  // retry that reuses them — it never drops back into the stream silently.
  if (phase !== 'ready') {
    return (
      <ContinuationStatus
        phase={phase}
        error={error}
        onRetry={onRetry}
        onContinue={onContinue}
      />
    );
  }
  if (!continuation) return null;
  const { focusTitle, focusSummary, nextMove, steps, fork } = continuation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="w-full max-w-[760px] mx-auto px-4 md:px-8 pt-8 md:pt-14 pb-28"
      data-vision-screen="scenario-continuation"
    >
      {/* ── WHAT GALILEO FOUND ───────────────────────────────────────────── */}
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-vision-champagne/70">
        What Galileo Found
      </p>
      {focusTitle && (
        <h1 className="mt-3 font-display text-[26px] md:text-[34px] leading-tight text-white tracking-tight">
          {focusTitle}
        </h1>
      )}
      {focusSummary && (
        <p className="mt-3 text-[15px] md:text-[16px] leading-relaxed text-white/65 max-w-[620px]">
          {focusSummary}
        </p>
      )}

      {/* ── THE DESTINATION — a home about THEIR business, not a dead end ── */}
      {onHome && (
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onHome}
            className="inline-flex items-center gap-2 rounded-full bg-[#D4A853] px-5 py-2.5 text-[13.5px] font-medium text-black transition-colors hover:bg-[#D4A853]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853]/40"
          >
            See My Business
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-4 py-2.5 text-[13px] text-white/65 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853]/40"
          >
            Continue in the conversation
          </button>
        </div>
      )}

      {/* ── NEXT BEST MOVE ───────────────────────────────────────────────── */}
      {nextMove && (
        <div className="mt-8 vision-glass vision-sheen rounded-2xl px-5 py-5 md:px-6">
          <div className="flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-vision-champagne/70" />
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">
              Next Best Move
            </p>
          </div>
          <p className="mt-3 text-[15px] md:text-[16.5px] leading-relaxed text-white/90">
            {nextMove.text}
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#D4A853]/85 transition-colors hover:text-[#D4A853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853]/40"
          >
            {nextMove.actionLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── NEXT STEPS — the opportunity's own candidate actions ─────────── */}
      {steps.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">Next Steps</p>
          <ol className="mt-3 space-y-2.5">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 text-[11px] text-white/50">
                  {i + 1}
                </span>
                <span className="text-[14.5px] leading-relaxed text-white/75">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── THE FORK — two real ways to carry this further ───────────────── */}
      <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onGuide}
          className="group text-left px-5 py-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.01] transition-all duration-300 hover:border-[#D4A853]/45 hover:from-[#D4A853]/[0.07]"
        >
          <span className="flex items-center gap-2 text-[15px] font-medium text-white">
            <Sparkles className="w-4 h-4 text-vision-champagne/80" />
            {fork.galileo.label}
          </span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-white/45">{fork.galileo.desc}</span>
        </button>
        <button
          type="button"
          onClick={onExpert}
          className="group text-left px-5 py-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] transition-all duration-300 hover:border-[#D4A853]/35"
        >
          <span className="flex items-center gap-2 text-[15px] font-medium text-white">
            <UserRound className="w-4 h-4 text-white/60" />
            {fork.expert.label}
          </span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-white/45">{fork.expert.desc}</span>
        </button>
      </div>

    </motion.div>
  );
}