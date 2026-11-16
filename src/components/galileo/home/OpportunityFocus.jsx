/**
 * OpportunityFocus — the real detail surface for a discovered opportunity.
 *
 * Everything shown is a REAL field from the opportunity record. Home carries a
 * compact normalized copy, so this surface reads the full record (`raw`) that
 * the normalizer now keeps alongside it. Previously it read fields the compact
 * copy did not have, and rendered little more than a title.
 *
 * Actions, all real:
 *   Explore with Galileo / suggested questions → canonical Galileo, with this
 *     opportunity's own context in the question, so it is never restated
 *   See what this could look like → the implementation preview
 *   What if … → only when the opportunity maps to a lever the engine models
 *   implementation choice → shown for paths the owner already has; locked
 *     paths appear after the preview, never before it
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Target, ArrowRight, Sparkles, Diamond } from 'lucide-react';
import ImplementationChoice from './ImplementationChoice';
import { opportunityRecord, opportunityValueRows, buildOpportunityQuestion } from '@/lib/galileo/opportunityContext';
import ExplainableText from '@/components/galileo/explain/ExplainableText';

const SCORE_LABELS = [
  { key: 'impact_score', label: 'Impact' },
  { key: 'ease_score', label: 'Ease' },
  { key: 'urgency_score', label: 'Urgency' },
  { key: 'time_to_value_score', label: 'Time to value' },
];

const SUGGESTIONS = [
  'Why is this important?',
  'What should I do first?',
  'What assumptions are driving this?',
  "What happens if I don't address it?",
];

export default function OpportunityFocus({
  opportunity,
  access = null,
  scenario = null,
  onBack,
  onAskGalileo,
  onSeePlan,
  onWhatIf,
  onGalileo,
  onTeam,
}) {
  if (!opportunity) return null;

  const o = opportunityRecord(opportunity);
  const why = o.expected_outcome || o.description || null;
  const value = opportunityValueRows(opportunity);
  const scores = SCORE_LABELS.filter(({ key }) => num(o[key]) != null);
  const confidence = num(o.confidence_score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="mx-auto w-full max-w-[720px] space-y-5"
    >
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/35 transition-colors hover:text-white/60 vision-focus"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Target className="h-3.5 w-3.5 text-vision-gold/70" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">Opportunity</span>
          {o.category && (
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
              {String(o.category).replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <h2 className="font-display text-[23px] leading-snug text-white/90 md:text-[26px]">
          <ExplainableText text={o.title} surface="opportunity_focus" />
        </h2>
      </div>

      {why && (
        <div className="space-y-1.5 rounded-2xl vision-glass-raised p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Why it matters</p>
          <p className="text-[13px] leading-relaxed text-white/70">
            <ExplainableText text={why} surface="opportunity_focus" />
          </p>
        </div>
      )}

      {(value.length > 0 || confidence != null || scores.length > 0) && (
        <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          {value.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {value.map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">{row.label}</p>
                  <p className="text-[14px] font-medium text-vision-champagne">{row.value}</p>
                </div>
              ))}
            </div>
          )}
          {confidence != null && (
            <p className="text-[12px] text-white/55">
              Confidence <span className="font-medium text-white/80">{Math.round(confidence)}%</span>
            </p>
          )}
          {scores.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {scores.map(({ key, label }) => (
                <span key={key} className="text-[11.5px] text-white/50">
                  {label} <span className="font-medium text-white/75">{Math.round(num(o[key]))}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onSeePlan}
          className="inline-flex items-center gap-1.5 rounded-full bg-vision-gold px-4 py-2 text-[12px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
        >
          See what this could look like
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onAskGalileo(buildOpportunityQuestion(opportunity))}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-4 py-2 text-[12px] text-white/60 transition-colors hover:border-vision-gold/30 hover:text-white/85 vision-focus"
        >
          <Sparkles className="h-3 w-3" />
          Explore with Galileo
        </button>
        {scenario && onWhatIf && (
          <button
            type="button"
            onClick={() => onWhatIf(scenario)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-4 py-2 text-[12px] text-white/60 transition-colors hover:border-vision-gold/30 hover:text-white/85 vision-focus"
          >
            <Diamond className="h-3 w-3" />
            {scenario.prompt}
          </button>
        )}
      </div>

      {/* Questions Galileo can genuinely answer about THIS opportunity. */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-white/30">Ask Galileo</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAskGalileo(buildOpportunityQuestion(opportunity, s))}
              className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3.5 py-1.5 text-[11.5px] text-white/55 transition-colors hover:border-vision-gold/25 hover:text-white/85 vision-focus"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {access && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <ImplementationChoice
            access={access}
            onGalileo={onGalileo}
            onTeam={onTeam}
            hideLocked
            heading="How do you want to take this forward?"
          />
        </div>
      )}
    </motion.div>
  );
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}