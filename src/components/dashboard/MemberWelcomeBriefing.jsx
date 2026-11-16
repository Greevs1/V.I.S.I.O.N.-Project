/**
 * MemberWelcomeBriefing — Phase 5.5
 *
 * Shown once after a user unlocks their account (member login).
 * Galileo introduces execution features: Sprints, Advisor Workspace,
 * Playbooks, Weekly Reviews, Meeting Center, Advanced Intelligence.
 *
 * Never shown to guests. Never replays the Executive Briefing.
 * Separate localStorage key — does not collide with the briefing flow.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ChevronRight, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'vision_member_welcome_v1';

export function useMemberWelcomeBriefing(isMember) {
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isMember) { setChecked(true); return; }
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      setShouldShow(!done);
    } catch {}
    setChecked(true);
  }, [isMember]);

  const markComplete = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setShouldShow(false);
  };

  const replay = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setShouldShow(true);
  };

  return { shouldShow: checked && shouldShow, markComplete, replay };
}

const STEPS = [
  {
    id: 'welcome_back',
    type: 'intro',
    title: null,
    message: "Welcome back.",
    sub: "Everything we've done together so far has been diagnosis.",
    body: "Now let's walk through how we turn these insights into measurable progress.",
  },
  {
    id: 'sprints',
    type: 'feature',
    icon: '⚡',
    title: '90-Day Sprints',
    tagline: 'Intelligence becomes action.',
    description: 'Every Sprint is built from your highest-priority gaps — sequenced by dollar impact, verified by Galileo, and tracked to a measurable outcome. Each 90-day cycle is a focused execution chapter.',
    why: 'Knowing where your gaps are is only valuable if you do something about them. Sprints are how knowing becomes doing.',
    selector: null,
  },
  {
    id: 'advisor',
    type: 'feature',
    icon: '🧭',
    title: 'Advisor Workspace',
    tagline: 'Your advisory team, always in context.',
    description: 'Your Capital Impact team has a real-time view of your business intelligence, your sprint progress, and your current gaps. Every session starts exactly where you left off.',
    why: 'No recap calls. No re-explaining. Just execution with the right people already aligned to your situation.',
    selector: null,
  },
  {
    id: 'playbooks',
    type: 'feature',
    icon: '📋',
    title: 'Playbooks',
    tagline: 'The exact steps to close each gap.',
    description: 'Every gap identified in your assessment has a matching playbook — proven, sequenced actions with templates and tools. You never have to figure out where to start.',
    why: 'Most business owners know what problems they have. Playbooks tell you exactly how to fix them.',
    selector: null,
  },
  {
    id: 'weekly',
    type: 'feature',
    icon: '📊',
    title: 'Weekly Priorities',
    tagline: 'Accountability without micromanagement.',
    description: 'Galileo reviews your sprint progress each week and surfaces the three highest-leverage moves for the coming week. Your advisor is notified about anything that needs human judgment.',
    why: 'Progress compounds when it is consistent. Weekly priorities keep the highest-value work visible.',
    selector: null,
  },
  {
    id: 'meeting',
    type: 'feature',
    icon: '🎯',
    title: 'Meeting Center',
    tagline: 'Every session focused on what matters.',
    description: 'The Meeting Center syncs your sprint status, open questions, and advisor notes before every call — so every minute is spent on execution, not recap.',
    why: 'Advisory time is your most valuable resource. The Meeting Center makes sure none of it is wasted.',
    selector: null,
  },
  {
    id: 'advanced_ai',
    type: 'feature',
    icon: '✦',
    title: 'Advanced Intelligence',
    tagline: 'Deeper answers. Multi-year projections.',
    description: 'Advanced Intelligence expands Galileo\'s context — deeper analysis of your full business profile, multi-year scenario modeling, and the ability to ask complex questions about your specific situation.',
    why: 'The more Galileo knows about your business, the more precise and powerful the guidance becomes.',
    selector: null,
  },
  {
    id: 'ready',
    type: 'outro',
    message: "Your execution environment is ready.",
    choices: [
      { id: 'sprints',  label: 'Start my 90-Day Sprint',           path: '/dashboard' },
      { id: 'roadmap',  label: 'Review my strategic sprint',         path: '/assessments/roadmap' },
      { id: 'advisor',  label: 'Go to Advisor Workspace',           path: '/advisory/command-center' },
    ],
  },
];

export default function MemberWelcomeBriefing({ onClose }) {
  const [step, setStep] = useState(0);
  const [bubblePos, setBubblePos] = useState({ top: 160, left: 40 });
  const positionTimer = useRef(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isIntro = currentStep?.type === 'intro';
  const isFeature = currentStep?.type === 'feature';
  const isOutro = currentStep?.type === 'outro';

  useEffect(() => {
    clearTimeout(positionTimer.current);
    positionTimer.current = setTimeout(() => {
      const margin = 16;
      const bubbleW = 364;
      const bubbleH = isOutro ? 300 : isFeature ? 380 : 240;
      setBubblePos({
        top: Math.max(margin, window.innerHeight / 2 - bubbleH / 2),
        left: Math.max(margin, Math.min(window.innerWidth / 2 - bubbleW / 2, window.innerWidth - bubbleW - margin)),
      });
    }, 200);
    return () => clearTimeout(positionTimer.current);
  }, [step]); // eslint-disable-line

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleNext = () => {
    if (isLast) onClose();
    else setStep(s => s + 1);
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <motion.div
        className="absolute inset-0 pointer-events-auto"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(1.5px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="absolute pointer-events-auto rounded-2xl shadow-2xl overflow-hidden"
          style={{
            top: bubblePos.top,
            left: bubblePos.left,
            width: 364,
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            background: 'rgba(10,10,14,0.98)',
            border: '1px solid rgba(212,168,83,0.2)',
            backdropFilter: 'blur(20px)',
          }}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5 sticky top-0 z-10"
            style={{ background: 'rgba(10,10,14,0.98)' }}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4A853' }} />
              <span className="text-[10px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#D4A853' }}>
                Galileo · Member Briefing
              </span>
            </div>
            <button onClick={onClose} className="text-white/25 hover:text-white/55 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex gap-0.5 px-5 pt-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-0.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= step ? '#D4A853' : 'rgba(255,255,255,0.08)' }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-3">

            {/* INTRO */}
            {isIntro && (
              <div className="space-y-2">
                <p className="text-lg font-display font-semibold" style={{ color: '#F5F5F5' }}>
                  {currentStep.message}
                </p>
                <p className="text-sm" style={{ color: '#D4A853' }}>{currentStep.sub}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {currentStep.body}
                </p>
              </div>
            )}

            {/* FEATURE */}
            {isFeature && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{currentStep.icon}</span>
                  <div>
                    <p className="text-[9px] tracking-[0.2em] uppercase font-semibold mb-0.5" style={{ color: '#D4A853' }}>
                      Member Feature
                    </p>
                    <p className="text-base font-semibold text-white">{currentStep.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(212,168,83,0.7)' }}>{currentStep.tagline}</p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">What it is</p>
                    <p className="text-xs leading-relaxed text-white/65">{currentStep.description}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Why it matters</p>
                    <p className="text-xs leading-relaxed text-white/85 font-medium">{currentStep.why}</p>
                  </div>
                </div>
              </div>
            )}

            {/* OUTRO */}
            {isOutro && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">{currentStep.message}</p>
                <div className="space-y-2 pt-1">
                  {currentStep.choices.map((choice) => (
                    <a
                      key={choice.id}
                      href={choice.path}
                      className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                      style={{
                        background: choice.id === 'sprints' ? 'rgba(212,168,83,0.08)' : 'rgba(255,255,255,0.04)',
                        border: choice.id === 'sprints' ? '1px solid rgba(212,168,83,0.2)' : '1px solid rgba(255,255,255,0.07)',
                        color: choice.id === 'sprints' ? '#D4A853' : '#F5F5F5',
                      }}
                      onClick={onClose}
                    >
                      <span>{choice.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-50" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!isOutro && (
            <div className="flex items-center justify-between px-5 pb-4 pt-1">
              <button onClick={onClose} className="text-[10px] text-white/25 hover:text-white/45 transition-colors">
                Skip tour
              </button>
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-all hover:opacity-90"
                style={{ background: '#D4A853', color: '#0D0D10' }}
              >
                {isLast ? 'Done' : 'Next'}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {isOutro && (
            <div className="px-5 pb-4">
              <button onClick={onClose} className="text-[10px] text-white/25 hover:text-white/45 transition-colors">
                Close
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}