/**
 * GuestHomePreview — the personalized, LIMITED business home for a guest or free
 * user. It is the destination of the Model This transition, so discovery ends in
 * a place that is about THEIR business instead of a terminal card.
 *
 * WHAT IT IS
 *   · the same six-domain Business Pulse the member home renders
 *     (HomeBusinessPulse is reused unchanged), fed by the guest's own resolved
 *     model and signal states;
 *   · what Galileo found — the opportunity that was being explored;
 *   · what it is worth — the value signal WITH its own source and period;
 *   · the provenance of the two financial inputs (known / estimated / unknown);
 *   · clicking a domain opens the EXISTING intelligence drawer.
 *
 * WHAT IT IS NOT
 *   · it calls no member endpoint, reads no other business, and invents no
 *     number: a fact that is not known renders as unknown, never as zero;
 *   · it does not offer Ask Galileo as a live control. Anonymous AI inquiries are
 *     not enabled, so there is no non-functional input here — one quiet line says
 *     what an account opens. Nothing is disabled-looking-and-clickable.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock, Sparkles } from 'lucide-react';
import HomeBusinessPulse from './HomeBusinessPulse';
import { approxMoney } from '@/lib/galileo/moneyFormat';
import { Knowledge } from '@/lib/galileo/factKnowledge';

const EASE = [0.22, 0.61, 0.36, 1];

const STATE_LABEL = {
  [Knowledge.KNOWN]: 'Known',
  [Knowledge.ESTIMATED]: 'Estimated',
  [Knowledge.UNKNOWN]: 'Unknown',
  [Knowledge.NEEDS_VERIFICATION]: 'Needs review',
};

const SOURCE_LABEL = {
  document: 'from your document',
  verified: 'from your financials',
  you: 'you told me',
  modeled_estimate: 'my estimate',
};

/** A modelled figure is a direction; a REAL zero is still a real zero. */
const money = (v) => (v == null ? null : approxMoney(v) ?? '$0');

function FactLine({ label, fact }) {
  const state = fact?.state || Knowledge.UNKNOWN;
  const source = SOURCE_LABEL[fact?.source];
  const formatted = money(fact?.value);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.05] py-2.5 last:border-0">
      <span className="text-[12.5px] text-white/45">{label}</span>
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="text-[14px] text-white/85">{formatted || 'Not known yet'}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
          {STATE_LABEL[state] || 'Unknown'}
          {source ? ` · ${source}` : ''}
        </span>
      </span>
    </div>
  );
}

export default function GuestHomePreview({
  answers = {},
  model = null,
  facts = null,
  signalStates = null,
  activeDomain = null,
  onSignalClick,
  opportunity = null,
  strategy = null,
  onBack,
}) {
  const industry = answers?.industry || null;
  const valueSignal = model?.signals?.value || null;
  const profitSignal = model?.signals?.profit || null;
  const evidence = Array.isArray(opportunity?.evidence) ? opportunity.evidence.slice(0, 3) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="w-full max-w-[840px] mx-auto px-4 md:px-8 pt-7 md:pt-12 pb-28"
      data-vision-screen="guest-home-preview"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-vision-champagne/70">
        Your Business{industry ? ` · ${industry}` : ''}
      </p>
      <h1 className="mt-3 font-display text-[26px] md:text-[34px] leading-tight text-white tracking-tight">
        Here is what I can see so far
      </h1>
      <p className="mt-3 max-w-[600px] text-[14.5px] md:text-[15.5px] leading-relaxed text-white/60">
        Built only from what you have shared with me. Domains still learning stay quiet rather than
        guessing — and you can open any one of them.
      </p>

      {/* ── THE BUSINESS PULSE — the member component, guest data ───────────── */}
      <div className="mt-8">
        <HomeBusinessPulse
          model={model}
          signalStates={signalStates}
          activeDomain={activeDomain}
          onSignalClick={onSignalClick}
        />
      </div>

      {/* ── WHAT IT IS WORTH, WITH ITS SOURCE ───────────────────────────────── */}
      <section className="mt-6 vision-glass vision-sheen rounded-2xl px-5 py-5 md:px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-vision-champagne/70" />
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">
            What It Is Worth
          </p>
        </div>
        {valueSignal ? (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="text-[13px] text-white/50">
                Today <span className="ml-1.5 text-[17px] text-white/90">{money(valueSignal.current) || '—'}</span>
              </span>
              <span className="text-[13px] text-white/50">
                At a typical multiple{' '}
                <span className="ml-1.5 text-[17px] text-white/90">{money(valueSignal.potential) || '—'}</span>
              </span>
              {valueSignal.gap != null && (
                <span className="text-[13px] text-[#D4A853]/85">{money(valueSignal.gap)} of value at stake</span>
              )}
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-white/40">
              {valueSignal.label}
              {valueSignal.source ? ` · ${valueSignal.source}` : ''}
              {valueSignal.period ? ` · ${valueSignal.period}` : ''}
            </p>
          </>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-white/55">
            Business value is unknown until I know your profit. I do not estimate it from nothing.
          </p>
        )}
        {profitSignal?.margin != null && (
          <p className="mt-2 text-[12px] text-white/40">
            Profit margin {profitSignal.margin}%
            {profitSignal.source ? ` · ${profitSignal.source}` : ''}
          </p>
        )}
      </section>

      {/* ── PROVENANCE — what is known, estimated, or still unknown ─────────── */}
      <section className="mt-4 rounded-2xl border border-white/[0.07] px-5 py-4 md:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
          What This Is Based On
        </p>
        <div className="mt-2">
          <FactLine label="Revenue" fact={facts?.revenue} />
          <FactLine label="Profit (EBITDA)" fact={facts?.ebitda} />
        </div>
      </section>

      {/* ── WHAT GALILEO FOUND — the explored opportunity, in its own words ─── */}
      {opportunity && (
        <section className="mt-4 rounded-2xl border border-white/[0.07] px-5 py-5 md:px-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
            What Galileo Found
          </p>
          <h2 className="mt-2 text-[16.5px] leading-snug text-white/90">{opportunity.title}</h2>
          {opportunity.summary && (
            <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{opportunity.summary}</p>
          )}
          {evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {evidence.map((item) => (
                <li key={item} className="flex gap-2 text-[12.5px] leading-relaxed text-white/45">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {opportunity.confidence && (
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-white/30">
              Confidence · {opportunity.confidence}
            </p>
          )}
          {strategy && (
            <p className="mt-3 text-[12.5px] text-white/45">
              You were exploring: <span className="text-white/75">{strategy}</span>
            </p>
          )}
        </section>
      )}

      {/* ── WHAT AN ACCOUNT OPENS — quiet, factual, not a dead control ──────── */}
      <p className="mt-6 flex items-start gap-2 text-[12px] leading-relaxed text-white/35">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        Asking Galileo questions is not open for a preview without an account yet. Everything above
        comes from what you have shared — nothing here is from another business.
      </p>

      <button
        type="button"
        onClick={onBack}
        className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-4 py-2.5 text-[13px] text-white/70 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A853]/40"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Continue in the conversation
      </button>
    </motion.div>
  );
}