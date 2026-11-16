/**
 * ExecutiveBriefing — Focus Mode (Phase 5.2 Evolution)
 *
 * Presentation layer only. All data from ExecutiveNarrativeEngine (untouched).
 * All presentation copy from executiveBriefingCopy.js.
 *
 * Story structure per chapter:
 *   1. What you're seeing
 *   2. Why it matters
 *   3. What we found (engine observation — BIS data only)
 *   4. Opportunity
 *   5. Highest-Leverage Next Move
 *   6. Potential Upside (engine impact)
 *   7. Evidence Strength (engine confidence → Very High/High/Moderate/Emerging)
 *   8. Executive Insight (one memorable sentence)
 *
 * Ending: Executive Summary → 3 choices (Explore / Sprint / Advisor)
 */

import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateBusinessImpactScore } from '@/lib/businessIntelligenceState';
import { buildExecutiveNarrative } from '@/lib/executiveNarrativeEngine';
import { BRIEFING_COPY, EVIDENCE_LABEL, EVIDENCE_COLOR } from '@/lib/executiveBriefingCopy';
import { markBriefingShown as engineMarkBriefingShown } from '@/lib/bie';
import FocusStageCard from '@/components/dashboard/FocusStageCard';

/**
 * buildEffectiveBis — merges the shared contract into bis.
 *
 * The contract (from useBusinessIntelligenceContract) is the SINGLE certified
 * source for assessment completion + primary values. We override the
 * corresponding bis._raw fields and embed the contract into
 * bis._sources.assessmentSummary.intelligence_contract so the narrative
 * engine reads from the same shared instance.
 */
function buildEffectiveBis(bis, contract) {
  if (!contract) return bis;
  return {
    ...bis,
    _raw: {
      ...bis._raw,
      tax_gap_annual: contract.tax?.annual_tax_gap ?? bis._raw.tax_gap_annual,
      tax_gap_ten_year: contract.tax?.ten_year_tax_gap ?? bis._raw.tax_gap_ten_year,
      recast_ebitda: contract.profitability?.recast_ebitda ?? bis._raw.recast_ebitda,
      recast_add_backs: contract.profitability?.total_addbacks ?? bis._raw.recast_add_backs,
      recast_valuation_increase: contract.profitability?.recast_value_impact ?? bis._raw.recast_valuation_increase,
      profit_gap_amount: contract.profitability?.profit_gap ?? bis._raw.profit_gap_amount,
      value_gap_amount: contract.valuation?.value_gap ?? bis._raw.value_gap_amount,
      current_value: contract.valuation?.current_value ?? bis._raw.current_value,
      potential_value: contract.valuation?.potential_value ?? bis._raw.potential_value,
      operations_score: contract.operations?.operations_score ?? bis._raw.operations_score,
      freedom_score: contract.freedom?.freedom_score ?? bis._raw.freedom_score,
      iq_score: contract.business_iq ?? bis._raw.iq_score,
    },
    _sources: {
      ...bis._sources,
      assessmentSummary: {
        ...bis._sources?.assessmentSummary,
        intelligence_contract: contract,
      },
    },
  };
}

const STORAGE_KEY = 'vision_executive_briefing_v1';

// ── Mapping: engine metric IDs → narrative topic IDs ─────────────────────────
const METRIC_TO_NARRATIVE = {
  profit_gap_amount: 'profit_gap',
  value_gap_amount: 'value_gap',
  tax_gap_annual: 'tax_gap',
  operations_score: 'operations_gap',
  freedom_score: 'freedom_score',
  iq_score: 'iq_score',
  recast_add_backs: 'recast_ebitda',
  recast_valuation_increase: 'recast_ebitda',
  business_impact_score: 'business_impact_score',
};

// ── Hook (API unchanged + markBriefingShown) ──────────────────────────────────
export function useExecutiveBriefing() {
  const [isComplete, setIsComplete] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    try { setIsComplete(!!localStorage.getItem(STORAGE_KEY)); } catch {}
    setHasChecked(true);
  }, []);

  const markComplete = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setIsComplete(true);
  };

  const replay = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setIsComplete(false);
  };

  // Records the current BIE snapshot version as "last briefed"
  const markBriefingShown = (businessId) => {
    engineMarkBriefingShown(businessId);
  };

  return { shouldAutoStart: hasChecked && !isComplete, markComplete, replay, markBriefingShown };
}

// ── Step builder ──────────────────────────────────────────────────────────────
function buildSteps(bis, changedMetricIds = []) {
  const impactResult = calculateBusinessImpactScore(bis);
  const narratives = buildExecutiveNarrative(bis, impactResult);

  // Determine if we're in "what's changed" mode
  const changesMode = changedMetricIds.length > 0;
  const changedNarrativeIds = new Set(
    changedMetricIds.map(id => METRIC_TO_NARRATIVE[id]).filter(Boolean)
  );

  const INTRO = changesMode
    ? [{
        id: 'open_1',
        type: 'intro',
        title: 'What Has Changed',
        headline: "Here's what's changed since our last review.",
        body: `${changedMetricIds.length} metric${changedMetricIds.length !== 1 ? 's' : ''} updated since your last briefing. Let me walk you through what's new, then you can explore the full picture if you'd like.`,
      }]
    : [{
        id: 'open_1',
        type: 'intro',
        title: 'Executive Briefing',
        headline: "I've analyzed everything you've shared.",
        body: (() => {
          const imp = bis?.targetedImprovements || [];
          return imp.length > 0
            ? `The analysis identified ${imp.length} measurable gap${imp.length !== 1 ? 's' : ''} across your business. Let me walk you through what matters most.`
            : "I've assembled your business intelligence profile. Let me walk you through what matters most.";
        })(),
      }];

  const METRIC_STEPS = narratives
    .filter(n => !['next_best_move'].includes(n.id))
    .filter(n => !changesMode || changedNarrativeIds.has(n.id))
    .map(n => {
      const copy = BRIEFING_COPY[n.id] || {};
      return {
        id: n.id,
        type: 'metric',
        title: n.title,
        headline: n.headline,
        // Engine data (untouched)
        finding: n.observation,
        impact: n.impact || null,
        confidence: n.confidence,
        hasData: n.hasData,
        // Presentation copy
        whatYouSee: copy.whatYouSee || '',
        whyItMatters: copy.whyItMatters || '',
        opportunity: copy.opportunity || '',
        nextMove: copy.nextMove || '',
        executiveInsight: copy.executiveInsight || '',
        // Change tracking
        isChanged: changesMode && changedNarrativeIds.has(n.id),
      };
    });

  const OUTRO = [{
    id: 'outro',
    type: 'outro',
    title: 'Executive Summary',
    headline: changesMode
      ? "That's what's changed since we last met."
      : "You now have a clear picture of where your business stands today.",
    body: changesMode
      ? "Your intelligence profile has been updated. Explore the full briefing or continue to your dashboard."
      : "Your opportunities have been measured. Your priorities have been identified. The next step is turning intelligence into measurable progress.",
    choices: changesMode
      ? [
          { id: 'full_briefing', label: 'View Full Briefing',  desc: 'Review the complete executive briefing with all metrics, not just the changes.', action: 'full_briefing' },
          { id: 'dashboard',     label: 'Continue to Dashboard', desc: 'Return to your dashboard with the updated intelligence.', path: '/dashboard' },
          { id: 'advisor',       label: 'Meet With an Advisor',  desc: 'Review these changes together and determine next steps.', action: 'meet_advisor' },
        ]
      : [
          { id: 'dashboard',  label: 'Continue Exploring',         desc: 'Review the dashboard and understand each opportunity in greater detail.', path: '/dashboard' },
          { id: 'sprints',   label: 'Build My First 90-Day Sprint', desc: "Transform today's findings into a focused execution plan. This is the natural next chapter.", locked: true },
          { id: 'advisor',   label: 'Meet With an Advisor',        desc: 'Review these findings together and determine which opportunities deserve immediate attention.', action: 'meet_advisor' },
        ],
  }];

  return [...INTRO, ...METRIC_STEPS, ...OUTRO];
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExecutiveBriefing({ onClose, bis, contract, onOpenAccessModal, onMeetAdvisor }) {
  // Extract changed metrics from the BIE (if available)
  const changedMetricIds = bis?.engine?.changedSinceLastBriefing || [];
  const [showFullBriefing, setShowFullBriefing] = useState(false);

  // Merge the shared contract into bis — single certified source for
  // assessment completion + primary values. The narrative engine reads
  // from this effectiveBis, so it sees the same contract as IQDashboard.
  const effectiveBis = useMemo(() => buildEffectiveBis(bis, contract), [bis, contract]);

  // In changes mode, only show changed metrics. If user requests full briefing, show all.
  const STEPS = buildSteps(effectiveBis, showFullBriefing ? [] : changedMetricIds);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const currentStep = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Phase 9.5: reset scroll position to top BEFORE paint on every step change ──
  // No visible scroll animation — the next chapter starts at its natural top.
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    // Reset focus state so the previous chapter's button doesn't retain focus
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }, [stepIndex]);

  // Mark the briefing as shown (records current BIE snapshot version) on unmount
  useEffect(() => {
    return () => {
      const bid = bis?.business?.business_id;
      if (bid && bis?.engine) {
        try { engineMarkBriefingShown(bid); } catch { /* non-fatal */ }
      }
    };
  }, []);

  const goNext = () => {
    if (isLast) { onClose(); return; }
    setDirection(1);
    setStepIndex(s => s + 1);
  };

  const goBack = () => {
    if (isFirst) return;
    setDirection(-1);
    setStepIndex(s => s - 1);
  };

  const handleChoice = (choice) => {
    if (choice.locked) {
      onClose();
      if (onOpenAccessModal) onOpenAccessModal('90-Day Sprint');
      return;
    }
    if (choice.action === 'meet_advisor') {
      onClose();
      if (onMeetAdvisor) onMeetAdvisor();
      return;
    }
    if (choice.action === 'full_briefing') {
      setShowFullBriefing(true);
      setStepIndex(0);
      setDirection(1);
      return;
    }
    onClose();
  };

  // Cinematic transition variants
  const stageVariants = {
    enter: (d) => ({ opacity: 0, y: d > 0 ? 24 : -24, scale: 0.98 }),
    center: { opacity: 1, y: 0, scale: 1 },
    exit:   (d) => ({ opacity: 0, y: d > 0 ? -16 : 16, scale: 0.98 }),
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 60 }}>
      {/* ── Backdrop ── */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        onClick={onClose}
      />

      {/* ── Focus Stage ── */}
      <div className="relative flex flex-col w-full h-full pointer-events-none">
        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: 'rgba(212,168,83,0.85)' }}>
              Galileo Executive Briefing
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
            <span className="text-[12px] tracking-wider" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {stepIndex + 1} / {STEPS.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] uppercase tracking-wider transition-opacity hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            End Briefing ×
          </button>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 h-px mx-6 pointer-events-none" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            className="h-full"
            style={{ background: '#D4A853', transformOrigin: 'left' }}
            animate={{ scaleX: (stepIndex + 1) / STEPS.length }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pointer-events-auto" style={{ paddingBottom: 120 }}>
          <div className="max-w-2xl mx-auto px-4 pt-6">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={stepIndex}
                custom={direction}
                variants={stageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* ── INTRO ── */}
                {currentStep.type === 'intro' && (
                  <div className="flex flex-col items-center text-center py-12 gap-5">
                    <motion.div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2"
                      style={{ background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.2)' }}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, duration: 0.4 }}
                    >
                      <span style={{ fontSize: 28 }}>✦</span>
                    </motion.div>
                    <motion.h1
                      className="text-3xl font-display font-bold"
                      style={{ color: '#F5F5F5' }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.35 }}
                    >
                      {currentStep.headline}
                    </motion.h1>
                    <motion.p
                      className="text-base leading-relaxed max-w-md"
                      style={{ color: 'rgba(255,255,255,0.7)' }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.22, duration: 0.35 }}
                    >
                      {currentStep.body}
                    </motion.p>
                  </div>
                )}

                {/* ── METRIC ── */}
                {currentStep.type === 'metric' && (
                  <div className="space-y-4">
                    {/* Hero: Focus Stage Card */}
                    <FocusStageCard step={currentStep} bis={effectiveBis} />

                    {/* Supporting: Galileo explanation */}
                    <GalileoPanel step={currentStep} bis={effectiveBis} />
                  </div>
                )}

                {/* ── OUTRO: Executive Summary ── */}
                {currentStep.type === 'outro' && (
                  <div className="flex flex-col items-center text-center py-8 gap-6 max-w-lg mx-auto">
                    <motion.div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.2)' }}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                    >
                      <span style={{ fontSize: 24 }}>✦</span>
                    </motion.div>
                    <motion.p
                      className="text-[11px] uppercase tracking-[0.2em] font-semibold"
                      style={{ color: 'rgba(212,168,83,0.85)' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                    >
                      {currentStep.title}
                    </motion.p>
                    <motion.p
                      className="text-2xl font-display font-bold leading-snug"
                      style={{ color: '#F5F5F5' }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      {currentStep.headline}
                    </motion.p>
                    <motion.p
                      className="text-sm leading-relaxed"
                      style={{ color: 'rgba(255,255,255,0.68)' }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.28 }}
                    >
                      {currentStep.body}
                    </motion.p>

                    {/* Three choices */}
                    <motion.div
                      className="w-full space-y-2.5 mt-2"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.36 }}
                    >
                      {currentStep.choices.map((choice) => (
                        <button
                          key={choice.id}
                          onClick={() => handleChoice(choice)}
                          className="block w-full text-left px-4 py-3.5 rounded-xl transition-opacity hover:opacity-80"
                          style={{
                            background: choice.locked ? 'rgba(212,168,83,0.08)' : 'rgba(255,255,255,0.04)',
                            border: choice.locked ? '1px solid rgba(212,168,83,0.2)' : '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold"
                              style={{ color: choice.locked ? '#D4A853' : 'rgba(255,255,255,0.85)' }}>
                              {choice.label}
                            </span>
                            {choice.locked && (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(212,168,83,0.15)', color: 'rgba(212,168,83,0.8)' }}>
                                Members
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                            {choice.desc}
                          </p>
                        </button>
                      ))}
                    </motion.div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div
          className="absolute bottom-0 left-0 right-0 shrink-0 pointer-events-auto"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 60%, transparent)',
            paddingTop: 32,
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          }}
        >
          <div className="max-w-2xl mx-auto px-4 flex items-center justify-between gap-4">
            <button
              onClick={goBack}
              disabled={isFirst}
              className="text-[12px] uppercase tracking-wider transition-opacity disabled:opacity-0"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              ← Back
            </button>

            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === stepIndex ? 16 : 4,
                    height: 3,
                    background: i < stepIndex ? 'rgba(212,168,83,0.4)' : i === stepIndex ? '#D4A853' : 'rgba(255,255,255,0.08)',
                  }}
                />
              ))}
            </div>

            {currentStep.type !== 'outro' ? (
              <button
                onClick={goNext}
                className="flex items-center gap-2 text-[12px] font-semibold px-5 py-2.5 rounded-xl transition-opacity hover:opacity-85 active:scale-95"
                style={{ background: '#D4A853', color: '#08080C' }}
              >
                Continue
                <span style={{ fontSize: 13 }}>→</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="text-[12px] uppercase tracking-wider transition-opacity hover:opacity-60"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                Close ×
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Galileo explanation panel (supporting, not dominating) ────────────────────
function GalileoPanel({ step, bis }) {
  const conf = step.confidence || 'none';
  const evidenceLabel = EVIDENCE_LABEL[conf] || 'Emerging';
  const evidenceColor = EVIDENCE_COLOR[conf] || EVIDENCE_COLOR.none;
  // Distinguish LOADING from NOT_ASSESSED
  const contractLoaded = !!(bis?._sources?.assessmentSummary?.intelligence_contract?.assessment_completion_count != null);
  const isLoading = !step.hasData && !contractLoaded;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(8,8,12,0.88)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.32 }}
    >
      {/* Galileo label — subdued */}
      <div className="flex items-center gap-1.5 px-5 pt-3.5 pb-2.5">
        <span style={{ color: 'rgba(212,168,83,0.6)', fontSize: 10 }}>✦</span>
        <span className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: 'rgba(212,168,83,0.7)' }}>
          Galileo
        </span>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* 1. What you're seeing */}
        <Section label="What you're seeing" delay={0.24}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>
            {step.whatYouSee}
          </p>
        </Section>

        {/* 2. Why it matters */}
        <Section label="Why it matters" delay={0.3}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>
            {step.whyItMatters}
          </p>
        </Section>

        {/* 3. What we found — engine observation */}
        <Section label="What we found" delay={0.36}>
          <p className="text-[14px] leading-relaxed font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {step.finding}
          </p>
        </Section>

        {/* 4. Opportunity */}
        <Section label="Opportunity" delay={0.42}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>
            {step.opportunity}
          </p>
        </Section>

        {/* 5. Highest-Leverage Next Move */}
        <Section label="Highest-Leverage Next Move" delay={0.48}>
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(212,168,83,0.9)' }}>
            {step.nextMove}
          </p>
        </Section>

        {/* 6 + 7. Potential Upside + Evidence Strength */}
        <motion.div
          className="flex gap-2 pt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.54 }}
        >
          {step.impact && (
            <div className="flex-1 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.1)' }}>
              <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(212,168,83,0.6)' }}>Potential Upside</p>
              <p className="text-[14px] font-semibold" style={{ color: '#D4A853' }}>{step.impact}</p>
            </div>
          )}
          <div className="flex-1 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Evidence Strength</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: evidenceColor }} />
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.65)' }}>{evidenceLabel}</p>
            </div>
          </div>
        </motion.div>

        {/* 8. Executive Insight — the signature line */}
        {step.executiveInsight && (
          <motion.div
            className="pt-3"
            style={{ borderTop: '1px solid rgba(212,168,83,0.12)' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.62, duration: 0.3 }}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-2"
              style={{ color: 'rgba(212,168,83,0.6)' }}>
              Executive Insight
            </p>
            <p className="text-[15px] font-display italic leading-relaxed text-center px-2"
              style={{ color: 'rgba(245,245,245,0.88)' }}>
              "{step.executiveInsight}"
            </p>
          </motion.div>
        )}

        {!step.hasData && (
          <motion.p
            className="text-[11px] pt-1"
            style={{ color: 'rgba(255,255,255,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.68 }}
          >
            {isLoading
              ? 'Loading your intelligence profile…'
              : 'Assessment not yet completed — showing context only.'}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

// ── Staggered section ─────────────────────────────────────────────────────────
function Section({ label, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-1.5"
        style={{ color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </p>
      {children}
    </motion.div>
  );
}