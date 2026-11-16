/**
 * GuideSession — GUIDE ME WITH GALILEO.
 *
 * The do-it-yourself path. It is deliberately NOT a 47-step project plan: it
 * shows ONE step at a time and only ever offers an action that is real.
 *
 * Every step's action resolves to something that exists:
 *   ask          → the canonical intelligence service
 *   destination  → a Vision workspace or domain surface
 *   playbook     → the existing Playbook (and from there the 90-Day Sprint)
 *
 * EXECUTION IS NOT REIMPLEMENTED. The final step hands off to the Playbook and
 * the 90-Day Sprint that already exist, so there is exactly one execution
 * architecture in the product.
 *
 * The carried context is shown at the top for the whole session, so the owner
 * never restates their question (Part 29).
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Sparkles, ArrowRight } from 'lucide-react';

export default function GuideSession({
  context,
  destination = null,
  onAsk,
  onOpenDestination,
  onOpenPlaybook,
  onBack,
}) {
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => {
    const list = [];

    // Step 1 — the move itself. Its text is the backend's own next step (or the
    // scenario the owner just modelled); nothing is invented here.
    const firstTitle =
      context?.nextStep || context?.scenarioTitle || context?.question || 'Decide the first move';
    list.push({
      title: firstTitle,
      detail:
        'This is the next move. Start here, and let Galileo work out the specifics before you act on it.',
      action: context?.question
        ? {
            label: 'Ask Galileo the specifics',
            kind: 'ask',
            question: buildSpecificsQuestion(context, firstTitle),
          }
        : null,
    });

    // Step 2 — the numbers, in the surface where they actually live.
    if (destination) {
      list.push({
        title: 'Get the numbers behind it',
        detail: destination.detail || 'Open the surface where this is measured and worked on.',
        action: { label: destination.label, kind: 'destination' },
      });
    }

    // Step 3 — hand off to the ONE execution architecture.
    list.push({
      title: 'Commit it to your execution',
      detail:
        'Turn it into a play, then into your 90-Day Sprint. That is where Vision tracks it to an outcome.',
      action: { label: 'Open your Playbook', kind: 'playbook' },
    });

    return list;
  }, [context, destination]);

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  const runAction = () => {
    if (!step?.action) return;
    if (step.action.kind === 'ask') onAsk?.(step.action.question);
    else if (step.action.kind === 'destination') onOpenDestination?.();
    else if (step.action.kind === 'playbook') onOpenPlaybook?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="mx-auto w-full max-w-[680px] space-y-6"
    >
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
          <Sparkles className="h-3.5 w-3.5 text-vision-gold" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
            Guide me with Galileo
          </span>
        </div>
      </div>

      {/* ── What this session is about — carried, never restated ── */}
      {context?.question && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30">You asked</p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/70">{context.question}</p>
          {context.scenarioTitle && (
            <p className="mt-1.5 text-[11.5px] text-vision-champagne/70">
              Scenario: {context.scenarioTitle}
            </p>
          )}
        </div>
      )}

      {/* ── Where you are ── */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < stepIndex
                ? 'bg-vision-gold/60'
                : i === stepIndex
                  ? 'bg-vision-gold/30'
                  : 'bg-white/[0.07]'
            }`}
          />
        ))}
      </div>

      {/* ── Completed steps, quietly ── */}
      {stepIndex > 0 && (
        <div className="space-y-1.5">
          {steps.slice(0, stepIndex).map((s) => (
            <p key={s.title} className="flex items-start gap-2 text-[11.5px] text-white/35">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-vision-gold/50" />
              <span className="line-through decoration-white/20">{s.title}</span>
            </p>
          ))}
        </div>
      )}

      {/* ── The current step ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="space-y-4 rounded-2xl vision-glass-raised vision-sheen p-5 md:p-6"
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
            Step {stepIndex + 1} of {steps.length}
          </p>

          <h3 className="font-display text-[19px] leading-snug text-white/90 md:text-[21px]">
            {step.title}
          </h3>

          <p className="text-[12.5px] leading-relaxed text-white/50">{step.detail}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {step.action && (
              <button
                type="button"
                onClick={runAction}
                className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
              >
                {step.action.label}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}

            {!isLast && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i + 1)}
                className="text-[11.5px] font-medium text-white/45 transition-colors hover:text-white/80 vision-focus"
              >
                I've done this
              </button>
            )}

            {isLast && stepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="text-[11.5px] font-medium text-white/45 transition-colors hover:text-white/80 vision-focus"
              >
                That's enough for now
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <p className="text-[11px] leading-relaxed text-white/30">
        Galileo walks you through it one step at a time. Execution stays in your Playbook and
        your 90-Day Sprint, where Vision already tracks progress.
      </p>
    </motion.div>
  );
}

/**
 * A real follow-up question for the current step. It asks the canonical
 * service to work out the specifics of a step it already recommended, which is
 * something the service can genuinely answer from the same business context.
 */
function buildSpecificsQuestion(context, stepTitle) {
  const base = context?.question ? `Regarding "${context.question}": ` : '';
  return `${base}how would I actually do this, step by step? Focus on: ${stepTitle}`;
}