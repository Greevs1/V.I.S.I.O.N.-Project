/**
 * NextBestMove — the hero of Vision Home.
 *
 * Presentation only. The move itself (selection, scoring, alternatives,
 * reasoning) is resolved upstream and arrives here unchanged.
 *
 * One premium glass surface:
 *   left  — recommendation, explanation, impact, real actions
 *   right — the real contextual object behind the move (when one exists)
 *
 * The user keeps control: "Why this?" reveals the reasoning in place, and
 * "Show me something else" cycles to the next real alternative.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, HelpCircle, RefreshCw, Sparkles } from 'lucide-react';
import MoveContextObject from './MoveContextObject';
import ExplainableText from '@/components/galileo/explain/ExplainableText';
// The SAME living orb the conversation uses — bound to the real state of this
// move, never to a timer (§14).
import GalileoOrb from '@/components/galileo/identity/GalileoOrb';

const LABELS = {
  sprint_blocker: 'Your Next Best Move',
  new_document: 'Galileo Found Something',
  new_opportunity: 'Your Next Best Move',
  goal_aligned: 'Aligned With Your Goal',
  expert_response: 'Your Next Best Move',
  document_assignment: 'Your Next Best Move',
  continue_play: 'Your Next Best Move',
  continue_opportunity: 'Continue Where You Left Off',
  // The preserved discovery: what VISION already found, said again — because it is
  // still true, and now it has canonical backing (§8).
  value_gap_discovery: 'What Galileo Found',
  knowledge_gap: 'One Answer Would Sharpen This',
  connect_source: 'One Thing Would Sharpen This',
  explore_galileo: 'Ask Galileo',
};

export default function NextBestMove({
  move,
  showWhy,
  onAction,
  onWhyThis,
  onShowAlternative,
  onDismiss,
  whyExplanation,
  // The alternatives the resolver actually produced. The "more areas" line is
  // built from THIS count and nothing else — a made-up number would be a lie (§F13).
  alternatives = [],
  // The orb's state for this move, from reality (§14). Defaults to the calm state.
  orbState = 'idle',
  intelligence = 0,
  sprints = [],
  opportunities = [],
  documents = [],
}) {
  // The fallback move is always available, so this branch is a safety net rather
  // than a state the owner should see. It asks instead of apologising.
  if (!move) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl vision-glass px-6 py-10 text-center md:py-14"
      >
        <GalileoOrb state="idle" size="presence" intelligence={intelligence} decorative />
        <p className="mx-auto mt-4 max-w-[440px] text-[14px] leading-relaxed text-white/50">
          Ask me anything about the business, and I will tell you what I actually know.
        </p>
        <button
          type="button"
          onClick={() => onAction?.({ type: 'explore' })}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-vision-gold px-5 py-2.5 text-[13px] font-semibold text-black transition-colors hover:bg-vision-bright vision-focus"
        >
          Ask Galileo
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    );
  }

  // What else is genuinely there. The fallback ("ask me anything") is not an
  // "area worth investigating", so it is never counted (§F13).
  const moreCount = alternatives.filter((a) => a.type !== 'explore_galileo').length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="rounded-3xl vision-glass-raised vision-sheen p-5 md:p-8"
    >
      {/* ── Galileos orb + label row ──
          The orb anchors the move: it is the same living presence the owner spoke
          to during discovery, in the state this move actually corresponds to. */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <GalileoOrb state={orbState} size="presence" intelligence={intelligence} decorative />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-vision-champagne/70">
            {LABELS[move.type] || 'Your Next Best Move'}
          </span>
        </div>
        <button
          type="button"
          onClick={onWhyThis}
          aria-expanded={!!showWhy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-white/40 transition-colors hover:text-vision-champagne vision-focus"
        >
          <HelpCircle className="h-3 w-3" />
          Why this?
        </button>
      </div>

      {/* ── Body: recommendation + real contextual object ── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="font-display text-[24px] leading-tight text-white/95 md:text-[32px]">
            <ExplainableText text={move.title} surface="vision_home" />
          </h2>

          {move.subtitle && (
            <p className="max-w-[560px] text-[13.5px] leading-relaxed text-white/50">
              {move.subtitle}
            </p>
          )}

          {move.impact != null && (
            <p className="text-[13px] font-medium text-vision-champagne">
              {formatImpact(move.impact, move.impactKind)}
            </p>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button
              type="button"
              onClick={() => onAction?.(move.actionValue)}
              className="inline-flex items-center gap-2 rounded-full bg-vision-gold px-5 py-2.5 text-[13px] font-semibold text-black transition-colors hover:bg-vision-bright vision-focus"
            >
              {move.actionLabel || 'Investigate'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onShowAlternative}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-4 py-2.5 text-[12.5px] text-white/55 transition-colors hover:border-white/20 hover:text-white/85 vision-focus"
            >
              <RefreshCw className="h-3 w-3" />
              Show me something else
            </button>

            {/* Saying no is a real answer: it is recorded, and it is not asked
                again. Kept quiet — it is not one of the choices. */}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-[12.5px] text-white/35 transition-colors hover:text-white/60 vision-focus"
              >
                Not now
              </button>
            )}
          </div>

          {/* ── What else is there, only if there really is more ── */}
          {moreCount > 0 && (
            <p className="pt-1 text-[12px] text-white/40">
              {moreCount} more {moreCount === 1 ? 'area is' : 'areas are'} worth investigating.
            </p>
          )}
        </div>

        <MoveContextObject
          move={move}
          sprints={sprints}
          opportunities={opportunities}
          documents={documents}
        />
      </div>

      {/* ── Reasoning (in place, restrained) ── */}
      <AnimatePresence initial={false}>
        {showWhy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="mt-5 max-w-[680px] border-l border-vision-gold/25 pl-4 text-[12.5px] leading-relaxed text-white/50">
              <ExplainableText text={whyExplanation || move.reason} surface="vision_home_why" />
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function formatImpact(impact, kind = null) {
  if (impact == null) return null;
  // A value GAP is not a modeled improvement, and calling it one would overstate
  // what is known. It says what it actually is.
  const suffix = kind === 'value_gap' ? 'potential value gap' : 'modeled impact';
  if (Math.abs(impact) >= 1e6) return `$${(impact / 1e6).toFixed(1)}M ${suffix}`;
  if (Math.abs(impact) >= 1e3) return `$${Math.round(impact / 1e3)}K ${suffix}`;
  return `$${Math.round(impact).toLocaleString('en-US')} ${suffix}`;
}