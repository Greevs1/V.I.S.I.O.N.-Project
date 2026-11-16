/**
 * ContinuationStatus — the two non-content states of the Model This transition.
 *
 *   resolving — the transition is being prepared
 *   error     — it could not be prepared, and the person's answers are intact
 *
 * Failure offers the retry that re-runs the SAME inputs, plus the way back to the
 * conversation. It never silently drops back into the stream as if the click had
 * done something else.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';

const EASE = [0.22, 0.61, 0.36, 1];

export default function ContinuationStatus({ phase, error, onRetry, onContinue }) {
  if (phase === 'resolving') {
    return (
      <div
        className="w-full max-w-[760px] mx-auto px-4 md:px-8 pt-10 md:pt-16 pb-28"
        data-vision-screen="scenario-resolving"
        aria-busy="true"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-vision-champagne/70">
          Modelling
        </p>
        <div className="mt-4 h-[26px] w-[62%] rounded-md bg-white/[0.055] animate-pulse" />
        <div className="mt-3 h-[15px] w-[86%] rounded-md bg-white/[0.035] animate-pulse" />
        <div className="mt-2 h-[15px] w-[72%] rounded-md bg-white/[0.035] animate-pulse" />
        <div className="mt-8 vision-glass rounded-2xl px-5 py-6">
          <div className="h-[13px] w-[30%] rounded bg-white/[0.05] animate-pulse" />
          <div className="mt-3 h-[15px] w-[92%] rounded bg-white/[0.035] animate-pulse" />
          <div className="mt-2 h-[15px] w-[78%] rounded bg-white/[0.035] animate-pulse" />
        </div>
        <p className="mt-6 text-[12.5px] text-white/35">Using what you have already told me.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="w-full max-w-[640px] mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-28"
      data-vision-screen="scenario-error"
      role="alert"
    >
      <div className="flex items-center gap-2 text-[#D4A853]">
        <AlertCircle className="h-4 w-4" />
        <p className="text-[11px] font-medium uppercase tracking-[0.22em]">This Did Not Complete</p>
      </div>
      <h1 className="mt-3 font-display text-[24px] md:text-[28px] leading-tight text-white">
        I could not model that scenario
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-white/60">
        {error || 'Something interrupted the model.'} Everything you have already told me is kept —
        nothing was lost, and nothing needs to be answered again.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full bg-[#D4A853] px-5 py-2.5 text-[13.5px] font-medium text-black transition-colors hover:bg-[#D4A853]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853]/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try Again
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-4 py-2.5 text-[13px] text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to the conversation
        </button>
      </div>
    </motion.div>
  );
}