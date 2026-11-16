/**
 * IntelligenceDrawer — expandable "Show Me Why" layer.
 *
 * Opens as a side sheet without leaving the Galileo workspace.
 * Three modes:
 *   - evidence: "Why Galileo thinks this" — opportunity evidence breakdown
 *   - scenario: Strategy scenario detail
 *   - pulse_domain: Business Pulse signal zoom-in (PROFIT, VALUE, etc.)
 *
 * The user remains inside the Galileo workspace at all times.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Diamond, Wrench, Clock, DollarSign, Sparkles } from 'lucide-react';
import { formatSignalValue } from '@/lib/galileo/preliminaryModel';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const DOMAIN_ICONS = {
  cash: DollarSign, tax: Clock, profit: TrendingUp,
  operations: Wrench, value: Diamond, freedom: Sparkles,
};

const DOMAIN_LABELS = {
  cash: 'Cash', tax: 'Tax', profit: 'Profit',
  operations: 'Operations', value: 'Value', freedom: 'Freedom',
};

export default function IntelligenceDrawer({ drawerState, onClose, onPulseAction }) {
  const { open, type, data } = drawerState;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#0A0A0F] border-l border-white/10 z-50 overflow-y-auto"
          >
            <div className="sticky top-0 flex items-center justify-between px-5 h-14 border-b border-white/[0.06] bg-[#0A0A0F]/95 backdrop-blur-sm z-10">
              <span className="text-sm font-medium text-white/80">
                {type === 'evidence' && 'Why Galileo Thinks This'}
                {type === 'scenario' && 'Scenario Detail'}
                {type === 'pulse_domain' && data?.domain ? DOMAIN_LABELS[data.domain] : ''}
              </span>
              <button onClick={onClose} className="text-white/40 hover:text-white/80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {type === 'evidence' && <EvidenceView data={data} />}
              {type === 'scenario' && <ScenarioView data={data} />}
              {type === 'pulse_domain' && <PulseDomainView data={data} onPulseAction={onPulseAction} />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Evidence View ───────────────────────────────────────────────────────────
function EvidenceView({ data }) {
  const { opportunity, extractedFacts } = data || {};
  if (!opportunity) return <p className="text-sm text-white/40">No opportunity data available.</p>;

  const evidence = opportunity.evidence || [];
  const facts = extractedFacts?.facts || {};

  return (
    <div className="space-y-5">
      <Section title="What I Noticed">
        <p className="text-sm text-white/65 leading-relaxed">{opportunity.summary}</p>
      </Section>

      <Section title="What I Used">
        <div className="space-y-2">
          {evidence.map((ev, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-[#D4A853]/60 mt-2 shrink-0" />
              <span className="text-sm text-white/60 leading-relaxed">{ev}</span>
            </div>
          ))}
          {Object.keys(facts).length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">From your document:</p>
              {facts.annual_revenue?.normalized != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Revenue</span>
                  <span className="text-white/80">{fmt(facts.annual_revenue.normalized)}</span>
                </div>
              )}
              {facts.reported_ebitda?.normalized != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">EBITDA</span>
                  <span className="text-white/80">{fmt(facts.reported_ebitda.normalized)}</span>
                </div>
              )}
              {facts.gross_profit?.normalized != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Gross Profit</span>
                  <span className="text-white/80">{fmt(facts.gross_profit.normalized)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="The Assumption I'm Making">
        <p className="text-sm text-white/60 leading-relaxed">
          I{"'"}m using a modeled valuation multiple range (industry-typical low to high).
          {opportunity.intelligenceState === 'supported'
            ? " Your EBITDA is from your financials, but the multiple is still modeled — not from actual comparable transactions."
            : " Both your EBITDA and the multiple are estimated. Real financials and comparable transaction data would refine this significantly."
          }
        </p>
      </Section>

      <Section title="How I Calculated It">
        <div className="space-y-2 text-sm text-white/60">
          <p>1. Started with your EBITDA (earnings before interest, taxes, and owner add-backs)</p>
          <p>2. Applied a modeled valuation multiple range (low end = current, high end = potential)</p>
          <p>3. The gap between current and potential value = your opportunity</p>
          {opportunity.potentialValueImpact && (
            <div className="mt-3 p-3 rounded-lg bg-[#D4A853]/[0.04] border border-[#D4A853]/15">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Potential Value Impact</p>
              <p className="text-xl font-display font-bold text-[#D4A853]">{fmt(opportunity.potentialValueImpact)}</p>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Scenario View ──────────────────────────────────────────────────────────
function ScenarioView({ data }) {
  const { strategy, opportunity, model } = data || {};
  if (!strategy) return null;

  return (
    <div className="space-y-5">
      <Section title="Strategy">
        <p className="text-sm text-white/70">{strategy}</p>
      </Section>
      <Section title="What Could Change">
        <p className="text-sm text-white/60 leading-relaxed">
          If this strategy succeeds, it could improve your business in ways that
          affect valuation, operations, and freedom simultaneously.
        </p>
      </Section>
    </div>
  );
}

// ── Pulse Domain View — contextual Galileo response with next actions ───────
function PulseDomainView({ data, onPulseAction }) {
  const { domain, model } = data || {};
  if (!domain || !model) return null;

  const signal = model.signals?.[domain];
  const Icon = DOMAIN_ICONS[domain] || Sparkles;
  const label = DOMAIN_LABELS[domain] || domain;
  const answers = model.answers || {};

  // Contextual Galileo response based on what it knows
  const contextualIntro = signal
    ? `Here's what I understand about your ${label.toLowerCase()} picture so far.`
    : `I know your ${answers.industry ? 'industry' : 'business'}${answers.revenue ? ' and revenue' : ''}, but I don't know enough about your ${label.toLowerCase()} yet.`;

  const investigateText = {
    profit: "Whether your margin gap is real and available to you. I'd look at your cost structure, pricing power, and industry benchmarks before assuming the gap is achievable.",
    value: "What's driving the gap between your current and potential value. Usually it comes down to a few things: EBITDA, multiple, or both.",
    operations: "How much of the business runs on you versus systems and people. This affects both freedom and what a buyer would pay.",
    freedom: "How many hours the business requires from you personally, and what it would take to reduce that.",
    cash: "Your cash flow cycle — how money moves through the business. A cash flow statement or bank statement would help.",
    tax: "Your tax structure and whether there are opportunities to reduce what you're paying. A tax return would help.",
  };

  // Next actions for learning domains
  const nextActions = signal ? [] : [
    { value: 'share_financials', label: 'Share financials', desc: 'Upload a document' },
    { value: 'keep_exploring', label: 'Keep exploring', desc: 'Close and continue' },
  ];

  return (
    <div className="space-y-5">
      {/* Contextual intro — Galileo responds naturally */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#D4A853]/10 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-[#D4A853]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white">{label}</h2>
          <p className="text-sm text-white/55 leading-relaxed">{contextualIntro}</p>
        </div>
      </div>

      {signal ? (
        <>
          {/* Current understanding — minimal, clean */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4 space-y-2">
            {domain === 'value' && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-white/50">Current</span>
                  <span className="text-sm font-medium text-white/85">{fmt(signal.current)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-white/50">Potential</span>
                  <span className="text-sm font-medium text-[#D4A853]">{fmt(signal.potential)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-white/50">Gap</span>
                  <span className="text-sm font-medium text-[#D4A853]">+{fmt(signal.gap)}</span>
                </div>
              </>
            )}
            {domain === 'profit' && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-white/50">Margin</span>
                  <span className="text-sm font-medium text-white/85">{signal.margin}%</span>
                </div>
                {signal.benchmark && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-white/50">Typical</span>
                      <span className="text-sm text-white/70">{signal.benchmark.typicalRange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-white/50">Best-in-class</span>
                      <span className="text-sm text-[#D4A853]">{signal.benchmark.bestInClass}%+</span>
                    </div>
                  </>
                )}
              </>
            )}
            {domain === 'operations' && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-white/50">Health</span>
                  <span className="text-sm font-medium text-white/85">{signal.score}/100</span>
                </div>
                <p className="text-sm text-white/60">{signal.label}</p>
              </>
            )}
            {domain === 'freedom' && (
              <>
                <p className="text-sm text-white/70">{signal.label}</p>
                <div className="flex justify-between">
                  <span className="text-sm text-white/50">Owner-required hours</span>
                  <span className="text-sm font-medium text-white/85">{signal.hours}/wk</span>
                </div>
              </>
            )}
            <p className="text-[11px] text-white/30 pt-1">Source: {signal.source}</p>
          </div>

          <Section title="What I'd Investigate">
            <p className="text-sm text-white/55 leading-relaxed">{investigateText[domain] || ''}</p>
          </Section>

          {model.opportunities?.filter((o) =>
            (domain === 'value' && o.id === 'value_gap') ||
            (domain === 'operations' && o.id === 'owner_dependency') ||
            (domain === 'freedom' && o.id === 'owner_dependency')
          ).map((opp) => (
            <Section key={opp.id} title="Related Opportunity">
              <p className="text-sm text-white/65">{opp.title}</p>
              {opp.potentialValueImpact && (
                <p className="text-sm text-[#D4A853] mt-1">Potential: +{fmt(opp.potentialValueImpact)}</p>
              )}
            </Section>
          ))}
        </>
      ) : (
        <>
          <Section title="What I'd Need">
            <p className="text-sm text-white/50 leading-relaxed">{investigateText[domain] || ''}</p>
          </Section>

          {/* Next actions — highest-value next step */}
          {nextActions.length > 0 && (
            <div className="space-y-2">
              {nextActions.map((action) => (
                <button
                  key={action.value}
                  onClick={() => onPulseAction?.(action.value)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/30 hover:bg-[#D4A853]/[0.03] transition-all"
                >
                  <span className="block text-sm font-medium text-white/85">{action.label}</span>
                  {action.desc && <span className="block text-xs text-white/40 mt-0.5">{action.desc}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Section helper ──────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-[0.15em] text-white/40 font-semibold">{title}</h3>
      {children}
    </div>
  );
}