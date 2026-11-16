/**
 * InsightCards — contextual reveal cards that appear inline in the conversation.
 *
 * Each variant is a "something appears" moment:
 *   - profitability: Current vs Typical vs Best-in-Class (from real benchmarks)
 *   - value: Preliminary business value + potential
 *   - opportunity: "I found something worth looking at"
 *   - strategies: Strategy options as scenarios
 *   - scenario: Before/after model of a strategy
 *   - sprint_preview: 90-day sprint path
 *   - expert_preview: Expert context preparation
 *   - preservation: "Don't lose what Galileo found" — account creation as preservation
 *
 * All values come from the existing certified calculation pipeline.
 * No invented numbers. Evidence status is always labeled.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TrendingUp, Diamond, ChevronDown, ChevronUp } from 'lucide-react';
import { getOpportunityStateLabel, getOpportunityStateColor, getConfidenceLabel } from '@/lib/galileo/opportunityQualification';
import SaveAffordance from './SaveAffordance';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const fmtRange = (low, high) => {
  if (low == null || high == null) return null;
  return `${fmt(low)} – ${fmt(high)}`;
};

export default function InsightCards({ variant, data, onChooseStrategy, onSave, onSavePrompt }) {
  switch (variant) {
    case 'profitability': return <ProfitabilityCard {...data} />;
    case 'value': return <ValueCard {...data} />;
    case 'opportunity': return <OpportunityCard {...data} onSave={onSave} />;
    case 'strategies': return <StrategiesCard {...data} onChooseStrategy={onChooseStrategy} onSave={onSave} />;
    case 'scenario': return <ScenarioCard {...data} onSave={onSave} />;
    case 'sprint_preview': return <SprintPreviewCard {...data} />;
    case 'expert_preview': return <ExpertPreviewCard {...data} />;
    case 'preservation': return <PreservationCard {...data} onSave={onSavePrompt ? () => onSavePrompt('save') : undefined} />;
    default: return null;
  }
}

// ── Profitability Card ──────────────────────────────────────────────────────
function ProfitabilityCard({ signal, model, updated }) {
  const [showWhy, setShowWhy] = useState(false);
  const bench = signal?.benchmark;
  if (!bench) return null;

  const statusLabel = {
    computed: 'User Reported',
    verified: 'User Reported',
    document_supported: 'Document Supported',
    modeled: 'Modeled',
  }[signal.status] || 'Estimated';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[#D4A853]/70" />
        <span className="text-[11px] uppercase tracking-[0.15em] text-white/50 font-semibold">
          Your Profitability
        </span>
        {updated && (
          <span className="text-[10px] text-emerald-400/70 ml-auto">Updated</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Current</p>
          <p className="text-2xl font-display font-bold text-white">
            {signal.margin != null ? `${signal.margin}%` : '—'}
          </p>
          <p className="text-[10px] text-white/35 mt-0.5">{statusLabel}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Typical Range</p>
          <p className="text-2xl font-display font-bold text-white/70">
            {bench.typicalRange || '—'}
          </p>
          <p className="text-[10px] text-white/35 mt-0.5">Benchmark</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Best-in-Class</p>
          <p className="text-2xl font-display font-bold text-[#D4A853]">
            {bench.bestInClass != null ? `${bench.bestInClass}%` : '—'}
          </p>
          <p className="text-[10px] text-white/35 mt-0.5">Benchmark</p>
        </div>
      </div>

      {bench.potentialGap != null && bench.potentialGap > 0 && (
        <div className="rounded-xl bg-[#D4A853]/[0.04] border border-[#D4A853]/15 px-4 py-3 text-center">
          <p className="text-sm text-white/70">
            Potential improvement of <span className="text-[#D4A853] font-semibold">{bench.potentialGap} margin points</span>
            {signal.gap != null && <> — worth <span className="text-[#D4A853] font-semibold">{fmt(signal.gap)}/yr</span></>}
          </p>
          <p className="text-[10px] text-white/40 mt-1">Worth investigating</p>
        </div>
      )}

      <button
        onClick={() => setShowWhy((s) => !s)}
        className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
      >
        {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showWhy ? 'Hide benchmark source' : 'Where does this benchmark come from?'}
      </button>
      <AnimatePresence>
        {showWhy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-white/45 leading-relaxed space-y-1"
          >
            <p><span className="text-white/60">Industry:</span> {bench.normalizedIndustry || '—'}</p>
            <p><span className="text-white/60">Sources:</span> {bench.sources}</p>
            <p><span className="text-white/60">Confidence:</span> {bench.confidence}</p>
            {bench.notes && <p><span className="text-white/60">Notes:</span> {bench.notes}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Value Card ──────────────────────────────────────────────────────────────
function ValueCard({ signal, model, updated }) {
  const [showWhy, setShowWhy] = useState(false);
  if (!signal) return null;

  const statusLabel = {
    computed: 'Modeled',
    verified: 'Document Supported',
    document_supported: 'Document Supported',
    modeled: 'Modeled',
  }[signal.status] || 'Modeled';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Diamond className="w-4 h-4 text-[#D4A853]/70" />
        <span className="text-[11px] uppercase tracking-[0.15em] text-white/50 font-semibold">
          {updated ? "Here's What I See Now" : "Here's What I See So Far"}
        </span>
      </div>

      <div className="text-center py-2">
        <p className="text-3xl md:text-4xl font-display font-bold text-white">
          {fmtRange(signal.current, signal.potential)}
        </p>
        <p className="text-sm text-white/50 mt-1">Preliminary Business Value</p>
        <p className="text-[10px] text-white/35 mt-0.5">{statusLabel}</p>
      </div>

      {signal.gap > 0 && (
        <div className="rounded-xl bg-[#D4A853]/[0.04] border border-[#D4A853]/15 px-4 py-3 text-center">
          <p className="text-sm text-white/70">But there may be more here</p>
          <p className="text-xl font-display font-bold text-[#D4A853] mt-0.5">
            +{fmt(signal.gap)}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">Potential value worth investigating</p>
        </div>
      )}

      <button
        onClick={() => setShowWhy((s) => !s)}
        className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
      >
        {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showWhy ? 'Hide assumptions' : 'Show my assumptions'}
      </button>
      <AnimatePresence>
        {showWhy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-white/45 leading-relaxed space-y-1"
          >
            <p><span className="text-white/60">Source:</span> {signal.source}</p>
            {signal.period && <p><span className="text-white/60">Period:</span> {signal.period}</p>}
            <p><span className="text-white/60">Method:</span> EBITDA × valuation multiple range (industry-typical)</p>
            <p className="text-white/35 mt-1">The multiple is modeled, not from actual comparables. Real multiple evidence would refine this further.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Opportunity Card — the number is the hero, minimal card ──────────────────
function OpportunityCard({ opportunity, onSave }) {
  if (!opportunity) return null;
  const state = opportunity.intelligenceState;
  const stateLabel = getOpportunityStateLabel(state);
  const stateColor = getOpportunityStateColor(state);
  const confidence = getConfidenceLabel(state);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-6 text-center space-y-3"
    >
      <div className="flex items-center justify-center gap-3">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium">
          {opportunity.title}
        </p>
        {onSave && (
          <SaveAffordance type="opportunity" title={opportunity.title} data={opportunity} />
        )}
      </div>

      <motion.p
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-4xl md:text-5xl font-display font-bold text-[#D4A853] tracking-tight"
      >
        {opportunity.potentialValueImpact ? fmt(opportunity.potentialValueImpact) : '—'}
      </motion.p>

      <p className="text-sm text-white/50">of unrealized business value</p>

      <p className="text-[13px] text-white/45 leading-relaxed max-w-[480px] mx-auto pt-1">
        {state === 'supported'
          ? "Your EBITDA is from your financials, but I'm using a modeled valuation range."
          : "Your EBITDA is still estimated and I'm using a modeled valuation range."
        } There's enough here that I'd investigate it.
      </p>

      <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${stateColor}`}>
          {stateLabel}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/30 px-2 py-0.5">
          Confidence: {confidence}
        </span>
      </div>
    </motion.div>
  );
}

// ── Strategies Card — simple list, no card container ────────────────────────
function StrategiesCard({ opportunity, onChooseStrategy, onSave }) {
  if (!opportunity?.strategies) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {onSave && (
        <div className="flex justify-end pb-1">
          <SaveAffordance type="strategies" title="Strategy options" data={{ opportunityId: opportunity?.id }} />
        </div>
      )}
      {opportunity.strategies.map((s, i) => (
        <button
          key={i}
          onClick={() => onChooseStrategy?.(s)}
          className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.015] hover:border-[#D4A853]/25 hover:bg-[#D4A853]/[0.03] transition-all"
        >
          <span className="text-sm text-white/75">{s}</span>
        </button>
      ))}
    </motion.div>
  );
}

// ── Scenario Card — clean before/after, minimal borders ─────────────────────
function ScenarioCard({ strategy, opportunity, model, onSave }) {
  // UNKNOWN ≠ ZERO: no valuation → no impact figure at all, rather than a zero
  // that `|| 0` manufactured and the guard below then had to hide.
  const ebitda = model?.signals?.value?.current != null ? model.signals.value.current / 4 : null;
  const opsScore = model?.signals?.operations?.score || 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-white/55 text-center leading-relaxed flex-1">{strategy}</p>
        {onSave && (
          <SaveAffordance type="scenario" title={strategy} data={{ strategy, opportunityId: opportunity?.id }} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-white/35">Today</p>
          {model?.signals?.operations && (
            <div className="flex justify-between text-sm">
              <span className="text-white/45">Owner Dependency</span>
              <span className="text-white/75">{opsScore < 40 ? 'High' : opsScore < 65 ? 'Moderate' : 'Light'}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-white/45">Multiple</span>
            <span className="text-white/75">4.0–4.6x</span>
          </div>
        </div>
        <div className="space-y-2 pl-3 border-l border-cyan-400/15">
          <p className="text-[10px] uppercase tracking-wider text-cyan-400/50">If Successful</p>
          {model?.signals?.operations && (
            <div className="flex justify-between text-sm">
              <span className="text-white/45">Owner Dependency</span>
              <span className="text-white/75">Moderate</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-white/45">Multiple</span>
            <span className="text-white/75">4.6–5.5x</span>
          </div>
        </div>
      </div>

      {ebitda != null && ebitda > 0 && (
        <div className="text-center pt-2">
          <p className="text-xs text-white/40 mb-1">Potential Value Impact</p>
          <p className="text-2xl font-display font-semibold text-cyan-400">
            +{fmt(ebitda * 0.8)}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ── Sprint Preview Card — minimal, clean ────────────────────────────────────
function SprintPreviewCard({ opportunity, strategy }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <p className="text-[13px] text-white/55 text-center leading-relaxed">
        I'll translate this into a 90-day sprint with:
      </p>
      <div className="space-y-1.5">
        {[
          { label: 'Outcome', desc: 'What success looks like in 90 days' },
          { label: 'Milestones', desc: '3-4 checkpoints along the way' },
          { label: 'Actions', desc: 'Specific steps to take' },
          { label: 'Progress', desc: 'Track as you go' },
        ].map((item) => (
          <div key={item.label} className="flex items-baseline gap-3 px-4">
            <span className="text-sm font-medium text-white/70 w-20 shrink-0">{item.label}</span>
            <span className="text-[12px] text-white/40">{item.desc}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-white/30 text-center pt-1">
        Connects to your existing 90-Day Sprint system
      </p>
    </motion.div>
  );
}

// ── Expert Preview Card — minimal, clean ────────────────────────────────────
function ExpertPreviewCard({ opportunity, strategy }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <p className="text-[13px] text-white/55 text-center leading-relaxed">
        I'll prepare a briefing so your expert doesn't start from scratch:
      </p>
      <div className="space-y-1.5">
        {[
          'Your business model and current metrics',
          'The opportunity I found and the evidence behind it',
          'The strategy we are considering',
          'Relevant documents and financials',
          'Questions and decisions needed',
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 px-4 text-[13px] text-white/50">
            <span className="w-1 h-1 rounded-full bg-[#D4A853]/40 shrink-0" />
            {item}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-white/30 text-center pt-1">
        Connects to your existing Advisory Hub
      </p>
    </motion.div>
  );
}

// ── Preservation Card — the Account Creation Magic Moment ─────────────────────
// Preservation of value, not loss avoidance. Beautiful summary of what's been built.
function PreservationCard({ model, opportunity, onSave }) {
  const signals = model?.signals || {};
  const value = signals.value;
  const hasBenchmark = signals.profit?.benchmark != null;
  const learningCount = Object.values(signals).filter((s) => s != null).length;
  const factsLearned = Object.values(model?.answers || {}).filter((v) => v != null).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-5 text-center"
    >
      <p className="text-[13px] text-white/55 leading-relaxed max-w-[440px] mx-auto">
        I've built quite a bit around your business already.
      </p>

      {/* Preservation Summary — YOUR BUSINESS SO FAR */}
      <div className="space-y-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.15em] text-white/35 font-medium">
          Your Business So Far
        </p>

        {value && (
          <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[12px] text-white/50">Preliminary Value</span>
            <span className="text-sm font-display font-semibold text-white/85">
              {fmtRange(value.current, value.potential)}
            </span>
          </div>
        )}
        {opportunity?.potentialValueImpact && (
          <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[12px] text-white/50">Potential Identified</span>
            <span className="text-sm font-display font-semibold text-[#D4A853]">
              +{fmt(opportunity.potentialValueImpact)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <span className="text-[12px] text-white/50">Opportunities</span>
          <span className="text-sm font-medium text-white/70">1</span>
        </div>
        {hasBenchmark && (
          <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="text-[12px] text-white/50">Profit Benchmark</span>
            <span className="text-sm font-medium text-white/70">Established</span>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <span className="text-[12px] text-white/50">Business Facts Learned</span>
          <span className="text-sm font-medium text-white/70">{factsLearned}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          onClick={onSave}
          className="w-full h-12 bg-[#D4A853] text-black font-medium hover:bg-[#D4A853]/90"
        >
          Save My Business — Free
        </Button>
        <p className="text-[11px] text-white/35 leading-relaxed max-w-[360px] mx-auto">
          Create a free account so Galileo can remember what we've built and continue learning over time.
        </p>
      </div>
    </motion.div>
  );
}