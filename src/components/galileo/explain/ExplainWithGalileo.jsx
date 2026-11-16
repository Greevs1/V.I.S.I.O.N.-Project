/**
 * ExplainWithGalileo — the ONE explanation pattern (Part 15).
 *
 *   EBITDA ⓘ   ·   Customer Concentration ⓘ   ·   Working Capital ⓘ
 *
 * Progressive disclosure, three levels (Part 20):
 *   1. the canonical one-sentence meaning (deterministic, from the glossary);
 *   2. what it means for THIS business — only ever shown with a figure the
 *      surface actually holds, plus the action that asks Galileo to explain it
 *      against the real numbers;
 *   3. ask Galileo for the deeper version.
 *
 * Rules it enforces by construction:
 *   · A term that is not in the glossary renders as PLAIN TEXT. Vision never
 *     invents an affordance or a definition (Parts 31, 32).
 *   · The professional term is kept and taught, never replaced (Part 14).
 *   · The same term is not re-taught every time it appears in a session (Part 24).
 *   · Education never hides evidence — a source/value line can be rendered right
 *     beside the term by the caller (Part 29).
 */

import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowRight, HelpCircle, Sparkles } from 'lucide-react';
import { hasTermBeenExplained, markTermExplained, resolveTerm } from '@/lib/galileo/glossary';
import { deeperExplanationQuestion, explainForMyBusinessQuestion, useExplainGalileo } from '@/lib/galileo/explainGalileo';

export default function ExplainWithGalileo({
  term,
  children,
  businessValue = null,
  businessLabel = null,
  surface = null,
  className = '',
  align = 'start',
}) {
  const entry = resolveTerm(term);
  const explain = useExplainGalileo();
  const [open, setOpen] = useState(false);

  // Unknown term → no affordance, no invented definition.
  if (!entry) return children ?? null;

  const alreadyExplained = hasTermBeenExplained(entry.id);
  const label = children ?? entry.term;

  const ask = (question) => {
    markTermExplained(entry.id);
    setOpen(false);
    explain({ question, term: entry.term, surface });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-baseline gap-1 text-left ${className}`}
          aria-label={`What does ${entry.term} mean?`}
        >
          {label}
          <HelpCircle className="h-3 w-3 shrink-0 translate-y-[-1px] text-white/30 transition-colors group-hover:text-vision-gold/70" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={8}
        className="w-[320px] rounded-xl border-white/[0.09] bg-[rgba(10,10,14,0.98)] p-0 backdrop-blur-xl"
      >
        <div className="space-y-3 px-4 py-3.5">
          <p className="text-[12.5px] font-medium tracking-wide text-vision-champagne/90">{entry.term}</p>

          {/* The acronym rule (Part 10): where space permits — and the popover is
              exactly that space — the full term appears once, before the simple
              meaning. The interface keeps the acronym the owner meets in the wild. */}
          {entry.full && entry.full !== entry.term && (
            <p className="-mt-1.5 text-[11px] leading-snug text-white/40">{entry.full}</p>
          )}

          {/* Level 1 — the canonical meaning. Skipped once this session has seen it,
              so the second encounter leads with what it means for the business. */}
          {!alreadyExplained && (
            <p className="text-[12.5px] leading-relaxed text-white/70">{entry.plain}</p>
          )}
          {!alreadyExplained && entry.analogy && (
            <p className="border-l border-white/[0.09] pl-3 text-[12px] leading-relaxed text-white/50">
              {entry.analogy}
            </p>
          )}

          {/* Level 2 — this business's own number, when the surface truly has one.
              A figure the caller did not pass is never guessed at (Part 19). */}
          {businessValue && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">For your business</p>
              <p className="mt-1 text-[12.5px] text-white/75">
                {businessLabel ? `${businessLabel}: ` : ''}
                {businessValue}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-0.5">
            <button
              type="button"
              onClick={() =>
                ask(explainForMyBusinessQuestion(entry.term, { businessLabel, relatedValue: businessValue }))
              }
              className="inline-flex items-center justify-between gap-2 rounded-lg border border-vision-gold/25 bg-vision-gold/[0.05] px-3 py-2 text-[12px] text-vision-champagne/90 transition-colors hover:bg-vision-gold/[0.1] vision-focus"
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-vision-gold/70" />
                Explain this for my business
              </span>
              <ArrowRight className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={() => ask(deeperExplanationQuestion(entry.term, { businessLabel }))}
              className="inline-flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[12px] text-white/45 transition-colors hover:text-white/75 vision-focus"
            >
              Go deeper with Galileo
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}