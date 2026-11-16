/**
 * ImplementationPreview — "See what this could look like".
 *
 * Shows the owner what implementing a recommendation would actually involve,
 * BEFORE asking them to commit or to access anything. The plan comes from the
 * real 90-Day Sprint generator (preview mode), grouped into its own three
 * months. Nothing here is a second planning engine.
 *
 * VALUE FIRST, ACCESS SECOND
 * The preview renders for every owner. The implementation choice sits beneath
 * it, so an owner without implementation access sees the plan in full and only
 * then the access path.
 *
 * EXPECTED RESULT shows only figures the caller already holds from a governed
 * or modelled source (a scenario's comparison rows, an opportunity's modelled
 * value). When there are none, the section is omitted rather than invented.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, RotateCw, Sparkles } from 'lucide-react';
import ImplementationChoice from './ImplementationChoice';
import ExplainableText from '@/components/galileo/explain/ExplainableText';

const PHASES = [
  { month: 1, label: 'First 30 days' },
  { month: 2, label: 'Days 31–60' },
  { month: 3, label: 'Days 61–90' },
];

export default function ImplementationPreview({
  context,
  plan,
  access,
  onRetry,
  onBack,
  onGalileo,
  onTeam,
  building = false,
  buildError = null,
}) {
  if (!context) return null;
  const phases = groupByMonth(plan?.tasks || []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="mx-auto w-full max-w-[760px] space-y-5"
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-vision-gold" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">
            Your path forward
          </span>
        </div>
        <h2 className="font-display text-[23px] leading-snug text-white/90 md:text-[26px]">
          {context.title}
        </h2>
        {context.goal && context.goal !== context.title && (
          <p className="max-w-[600px] text-[12.5px] leading-relaxed text-white/50">{context.goal}</p>
        )}
      </div>

      {plan?.status === 'loading' && (
        <div className="flex items-center gap-2.5 rounded-2xl vision-glass-raised px-5 py-5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-vision-gold/70" />
          <span className="text-[12.5px] text-white/55">
            Building a 90-day picture from your business data…
          </span>
        </div>
      )}

      {plan?.status === 'error' && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
          <p className="text-[12.5px] text-white/60">Vision couldn't build the preview just now.</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-vision-champagne hover:text-vision-bright vision-focus"
          >
            <RotateCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      )}

      {plan?.status === 'ready' && (
        <div className="space-y-4 rounded-2xl vision-glass-raised vision-sheen p-5 md:p-6">
          {PHASES.map(({ month, label }) =>
            phases[month]?.length ? (
              <div key={month} className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-vision-champagne/70">{label}</p>
                {phases[month].slice(0, 5).map((task) => (
                  <p key={task.title} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/75">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-vision-gold/60" />
                    <ExplainableText text={task.title} surface="implementation_preview" />
                  </p>
                ))}
              </div>
            ) : null
          )}
          {!plan.contextUsed && (
            <p className="text-[11px] leading-relaxed text-white/35">
              Vision has limited data on this business, so this plan leans on general practice.
              Adding financial statements makes it specific to you.
            </p>
          )}
        </div>
      )}

      {context.expectedResult?.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Expected result</p>
          {context.expectedResult.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[12px] text-white/55">{row.label}</span>
              <span className="text-[13px] font-medium text-vision-champagne">{row.value}</span>
            </div>
          ))}
          <p className="pt-1 text-[10.5px] text-white/30">Modelled, not guaranteed.</p>
        </div>
      )}

      {plan?.status === 'ready' && access && (
        <div className="space-y-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <ImplementationChoice
            access={access}
            onGalileo={onGalileo}
            onTeam={onTeam}
            disabled={building}
            heading="Ready to put this into action?"
          />
          {building && (
            <p className="flex items-center gap-2 text-[11.5px] text-white/50">
              <Loader2 className="h-3 w-3 animate-spin" /> Building your 90-Day Sprint…
            </p>
          )}
          {buildError && <p className="text-[11.5px] text-white/55">{buildError}</p>}
        </div>
      )}
    </motion.div>
  );
}

function groupByMonth(tasks) {
  const out = { 1: [], 2: [], 3: [] };
  tasks.forEach((t, i) => {
    const week = Number(t.week_number) || i + 1;
    const month = Math.min(3, Math.max(1, Number(t.month_number) || Math.ceil(week / 4)));
    out[month].push(t);
  });
  return out;
}