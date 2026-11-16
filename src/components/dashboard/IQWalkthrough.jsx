/**
 * IQWalkthrough — Galileo-guided private tour of the IQ Dashboard.
 * Auto-starts on first visit, stores completion in localStorage.
 * Each step spotlights a section with a soft overlay + message bubble.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'vision_iq_walkthrough_v1';

function buildSteps(assessmentSummary, metricsData, bis) {
  const as = assessmentSummary || {};
  const m = metricsData || {};
  const r = bis?._raw || {};

  const fmtK = (n) => {
    if (!n || n === 0) return null;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(n / 1000)}K`;
  };
  const fmtDollars = (n) => n ? `$${Math.round(n).toLocaleString('en-US')}` : null;

  // Use BIS as primary source
  const iqScore = r.iq_score || as.derived_iq_score || m.ciq_score || m.overall_impact_score || null;
  const profitGap = fmtK(r.profit_gap_amount || m.profit_gap?.gap_to_best || as.profit_gap_amount);
  const taxGap = fmtK(r.tax_gap_annual || m.tax_gap?.annual_overpayment || as.tax_gap_annual);
  const valueGap = fmtK(r.value_gap_amount || m.value_gap?.gap_amount || as.value_gap_amount);
  const opsScore = r.operations_score != null ? Math.round(r.operations_score) : null;
  const hoursWorked = r.hours_worked_per_week || as.hours_worked_per_week || null;
  const hourlyValue = r.hourly_value_of_time_freed || null;
  const hoursFreed = r.hours_freed_per_week || 10;
  const monthlyFreed = r.monthly_value_of_time_freed || (hourlyValue ? Math.round(hourlyValue * hoursFreed * 4) : null);
  const totalImprovements = bis?.targetedImprovements?.length || 0;
  const currentValue = fmtK(r.current_value);
  const potentialValue = fmtK(r.potential_value);

  return [
    {
      id: 'hero',
      selector: '[data-walkthrough="iq-hero"]',
      title: "I've finished building your first business intelligence profile.",
      message: `${iqScore ? `Your Impact Quotient is ${Math.round(iqScore)}.` : 'Your business profile is ready.'} I've connected what you told me across profit, value, tax, operations, and freedom. Every number is calculated from your own data — nothing is estimated or assumed.`,
    },
    {
      id: 'gaps',
      selector: '[data-walkthrough="iq-gaps"]',
      title: `I found ${totalImprovements > 0 ? totalImprovements : 'measurable'} opportunities we can start closing.`,
      message: 'These are real, closable gaps in your business — each one calculated against actual industry benchmarks. The goal is to work through them one at a time, highest-impact first.',
    },
    {
      id: 'profit',
      selector: '[data-walkthrough="gap-profit"]',
      title: 'Your profit is the lever that moves everything.',
      message: `${profitGap ? `There's ${profitGap} in uncaptured annual profit between you and the top operators in your industry.` : 'This shows the profit difference between your current margins and what strong operators in your industry are achieving.'} Closing this gap doesn't just add cash — it multiplies your business value at exit.`,
    },
    {
      id: 'tax',
      selector: '[data-walkthrough="gap-tax"]',
      title: "You may be overpaying in taxes every year.",
      message: `${taxGap ? `The analysis found at least ${taxGap}/year in tax strategies that aren't being used.` : 'The tax gap identifies legal strategies most business owners never use.'} Every dollar recovered here goes directly to your bottom line and compounds every year you keep it.`,
    },
    {
      id: 'freedom',
      selector: '[data-walkthrough="path-to-freedom"]',
      title: 'This connects your business to your personal freedom.',
      message: `${hourlyValue && hoursWorked ? `You currently work about ${hoursWorked} hours a week. Each hour you recover is worth about ${fmtDollars(hourlyValue)}. Recovering ${hoursFreed} hours per week creates roughly ${fmtDollars(monthlyFreed)}/month of time value.` : 'Your Path to Freedom shows exactly how improving the business accelerates the date you reach financial independence.'} ${currentValue && potentialValue ? `Your business is currently valued around ${currentValue} — and could reach ${potentialValue} with the right moves.` : ''}`,
    },
    {
      id: 'coi',
      selector: '[data-walkthrough="cost-of-inaction"]',
      title: 'Waiting costs more than most people realize.',
      message: "Every year these gaps stay open, compounding works against you. This section shows the exact cost of delay at 1, 5, and 10 years. The most expensive decision is usually no decision at all.",
    },
    {
      id: 'add-business',
      selector: '[data-walkthrough="add-business-btn"]',
      title: "Here's your next best move.",
      message: `Start with your highest-impact gap — usually ${profitGap ? 'profit' : taxGap ? 'tax' : 'operations'}. Each improvement you implement feeds back into your score and accelerates your freedom timeline. I'll guide you through each one.`,
    },
  ];
}

export function useIQWalkthrough() {
  const [isComplete, setIsComplete] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      setIsComplete(!!done);
    } catch {}
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

  return { shouldAutoStart: hasChecked && !isComplete, markComplete, replay };
}

export default function IQWalkthrough({ onClose, assessmentSummary, metricsData, bis }) {
  const STEPS = buildSteps(assessmentSummary, metricsData, bis);
  const [step, setStep] = useState(0);
  const [bubblePos, setBubblePos] = useState({ top: '50%', left: '50%' });
  const [highlightRect, setHighlightRect] = useState(null);
  const positionTimer = useRef(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const positionBubble = () => {
    const sel = currentStep?.selector;
    if (!sel) return;
    const el = document.querySelector(sel);
    if (!el) {
      // Element not in DOM — skip this step silently
      setBubblePos({ top: window.innerHeight / 2, left: window.innerWidth / 2 - 160 });
      setHighlightRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setHighlightRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });

    // Position bubble: prefer below, fall back to above, then center
    const bubbleH = 230;
    const bubbleW = 340;
    const margin = 16;
    let top, left;
    if (rect.bottom + margin + bubbleH < window.innerHeight) {
      top = rect.bottom + margin;
    } else if (rect.top - margin - bubbleH > 0) {
      top = rect.top - bubbleH - margin;
    } else {
      top = Math.max(margin, Math.min(rect.top, window.innerHeight - bubbleH - margin));
    }
    left = Math.min(Math.max(rect.left, margin), Math.max(margin, window.innerWidth - bubbleW - margin));
    setBubblePos({ top, left });

    // Scroll element into view with offset for any fixed header
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    clearTimeout(positionTimer.current);
    positionTimer.current = setTimeout(positionBubble, 300);
    window.addEventListener('resize', positionBubble);
    return () => {
      clearTimeout(positionTimer.current);
      window.removeEventListener('resize', positionBubble);
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => {
    if (isLast) {
      onClose();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Soft overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-auto"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(1px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Highlight cutout */}
      {highlightRect && (
        <motion.div
          className="absolute rounded-xl pointer-events-none"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            border: '2px solid rgba(212,168,83,0.6)',
          }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Bubble */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="absolute pointer-events-auto w-80 rounded-2xl p-5 shadow-2xl"
          style={{
            top: bubblePos.top,
            left: bubblePos.left,
            background: 'rgba(13,13,16,0.97)',
            border: '1px solid rgba(212,168,83,0.25)',
            backdropFilter: 'blur(16px)',
          }}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#D4A853' }} />
              <span className="text-[10px] tracking-[0.18em] uppercase font-medium" style={{ color: '#D4A853' }}>
                Galileo · {step + 1} of {STEPS.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1 mb-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-0.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= step ? '#D4A853' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>

          {/* Content */}
          <h3 className="text-sm font-semibold text-white mb-2">{currentStep.title}</h3>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {currentStep.message}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors py-1"
                >
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Skip tour
                </button>
              )}
            </div>
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-all hover:opacity-90"
              style={{ background: '#D4A853', color: '#0D0D10' }}
            >
              {isLast ? 'Got it' : 'Next'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}