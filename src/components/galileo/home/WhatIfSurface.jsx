/**
 * WhatIfSurface — the possibility engine.
 *
 * Deliberately NOT a calculator. The owner asks a question about their own
 * business in their own words; Vision answers with what changes, what it cost,
 * what it assumed, and what it still cannot know.
 *
 * The states are all real:
 *   idle         — ask, or pick a scenario Vision can actually model
 *   loading      — the model is running
 *   needs_input  — Vision needs ONE figure; it asks for that one and offers its
 *                  own declared estimate instead of guessing silently
 *   unsupported  — Vision declines, and says exactly what it would need
 *   computed     — the result
 *
 * Scenario chips come from the backend catalog, so a scenario is never offered
 * that the engine cannot model.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Diamond, Loader2, RotateCw, Send } from 'lucide-react';
import WhatIfResult from './WhatIfResult';
import WhatIfNeedsInput from './WhatIfNeedsInput';

const KNOWN_STATUSES = ['needs_input', 'unsupported', 'computed'];

export default function WhatIfSurface({ whatIf, onBack, onOpenWorkspace, onAskGalileo }) {
  const [value, setValue] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [recheckNote, setRecheckNote] = useState(null);

  const {
    supportedScenarios,
    scenario,
    loading,
    error,
    ask,
    start,
    provideInput,
    provideBaselineInput,
    resumeWithGovernedData,
    probeBaseline,
    applyEstimate,
    retry,
    reset,
  } = whatIf;

  const submit = (e) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setValue('');
    ask(trimmed);
  };

  const pickScenario = (key) => {
    if (loading) return;
    reset();
    start(key);
  };

  /**
   * The answer goes back into the slot it belongs to. A missing GOVERNED
   * baseline is not a lever parameter, so it is returned as a scenario-local
   * baseline input — otherwise the engine would simply ask again.
   */
  const submitInput = (key, parsed) => {
    if (scenario?.recovery) provideBaselineInput(key, parsed);
    else provideInput(key, parsed);
  };

  /** Leave for the capability that can supply the figure properly. */
  const leaveForSource = (source) => {
    setRecheckNote(null);
    // A document gap opens the Galileo document overlay IN UPLOAD MODE, carrying
    // the figure Vision is missing so the request is stated in words ("I need a
    // financial statement that can help me confirm annual revenue"). The need is
    // the scenario's own, never invented here.
    if (source?.path === 'data-room') {
      onOpenWorkspace?.('data-room', null, {
        mode: 'upload',
        needs: source.label || scenario?.recovery?.field || null,
      });
      return;
    }
    onOpenWorkspace?.(source.path);
  };

  /** Back from the Data Room: did the governed figure actually arrive? */
  const recheck = async () => {
    const field = scenario?.recovery?.field;
    if (!field || rechecking) return;
    setRechecking(true);
    setRecheckNote(null);
    const probe = await probeBaseline([field]);
    setRechecking(false);

    if (probe?.[field]?.available) {
      resumeWithGovernedData(field);
      return;
    }
    setRecheckNote(
      'Still not on file. Vision reads it from your financial statements once they are processed.',
    );
  };

  const status = scenario?.status || null;

  // A payload whose status this surface does not recognise would otherwise
  // render nothing at all. Log the technical detail for diagnosis, and render
  // a recoverable state below rather than an empty canvas.
  useEffect(() => {
    if (scenario && !KNOWN_STATUSES.includes(scenario.status)) {
      console.error('[WhatIfSurface] unrecognised scenario payload:', scenario);
    }
  }, [scenario]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26 }}
      className="mx-auto w-full max-w-[760px] space-y-6"
    >
      {/* ── Header ── */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/35 transition-colors hover:text-white/60 vision-focus"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Vision
        </button>

        <div className="flex items-center gap-2">
          <Diamond className="h-3.5 w-3.5 text-vision-gold" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
            What if?
          </span>
        </div>

        <h2 className="font-display text-[24px] leading-snug text-white/90 md:text-[27px]">
          What do you want to explore?
        </h2>
        <p className="max-w-[560px] text-[12.5px] leading-relaxed text-white/45">
          Ask a what-if question about your business. Vision models it against your own
          figures and tells you what is known, what it had to assume, and what it cannot
          know yet.
        </p>
      </div>

      {/* ── Ask ── */}
      <form
        onSubmit={submit}
        className="flex w-full items-center gap-2 rounded-full vision-glass-raised vision-sheen py-2 pl-4 pr-2 transition-colors focus-within:border-vision-gold/45"
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What if I hired a general manager?"
          aria-label="Ask a what-if question about your business"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white/85 outline-none placeholder:text-white/30"
        />
        <button
          type="submit"
          disabled={!value.trim() || loading}
          aria-label="Model this scenario"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vision-gold text-black transition-colors hover:bg-vision-bright disabled:opacity-25 disabled:hover:bg-vision-gold vision-focus"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>

      {/* ── Scenarios Vision can actually model ── */}
      {!scenario && supportedScenarios.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Or start with one of these
          </p>
          <div className="flex flex-wrap gap-2">
            {supportedScenarios.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => pickScenario(s.key)}
                disabled={loading}
                className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3.5 py-1.5 text-[11.5px] text-white/55 transition-all duration-200 hover:border-vision-gold/25 hover:text-white/85 disabled:opacity-40 vision-focus"
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-vision-gold/70" />
          <span className="text-[12.5px] text-white/50">
            Modelling this against your business…
          </span>
        </div>
      )}

      {/* ── Error — never a raw status code ── */}
      {error && !loading && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
          <p className="text-[12.5px] text-white/60">{error}</p>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
          >
            <RotateCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      )}

      {/* ── One question, when one figure is genuinely needed ── */}
      {status === 'needs_input' && (
        <WhatIfNeedsInput
          scenario={scenario}
          loading={loading}
          onSubmit={submitInput}
          onApplyEstimate={applyEstimate}
          onOpenSource={leaveForSource}
          onRecheck={scenario.recovery ? recheck : null}
          rechecking={rechecking}
          recheckNote={recheckNote}
        />
      )}

      {/* ── Declined, with the reason ── */}
      {status === 'unsupported' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 rounded-2xl vision-glass-raised p-5"
        >
          <p className="text-[13.5px] leading-relaxed text-white/75">{scenario.reason}</p>
          {scenario.would_require?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                What would make this modellable
              </p>
              {scenario.would_require.map((item) => (
                <p key={item} className="text-[11.5px] text-white/50">
                  {item}
                </p>
              ))}
            </div>
          )}
          <p className="text-[11.5px] leading-relaxed text-white/35">
            Vision will not estimate this from a generic benchmark and present it as your business.
          </p>
          {/* Declining is not the end: offer what Vision CAN do instead. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
            >
              Try a scenario Vision can model
            </button>
            {onAskGalileo && (
              <button
                type="button"
                onClick={() => onAskGalileo(scenario.question || null)}
                className="text-[11.5px] font-medium text-white/50 transition-colors hover:text-white/85 vision-focus"
              >
                Ask Galileo instead
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Guaranteed render: no recognised state is ever a blank canvas. ── */}
      {scenario && !KNOWN_STATUSES.includes(scenario.status) && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 rounded-2xl vision-glass-raised p-5"
        >
          <p className="text-[13.5px] leading-relaxed text-white/75">
            Vision couldn't complete this model.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne transition-colors hover:text-vision-bright vision-focus"
            >
              <RotateCw className="h-3 w-3" />
              Try again
            </button>
            {onAskGalileo && (
              <button
                type="button"
                onClick={onAskGalileo}
                className="text-[11.5px] text-white/50 transition-colors hover:text-white/80 vision-focus"
              >
                Ask Galileo
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* ── The result ── */}
      <AnimatePresence mode="wait">
        {status === 'computed' && (
          <div key={scenario.scenario_key} className="space-y-5">
            <WhatIfResult scenario={scenario} />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}