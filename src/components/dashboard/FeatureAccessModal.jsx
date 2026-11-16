/**
 * FeatureAccessModal — Phase 5.5
 *
 * Shown when a user clicks a locked member feature.
 * Philosophy: Introduce the feature. Explain the outcome. Never redirect.
 * Three actions only: Sign In · Schedule Strategy Session · Cancel.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Calendar, LogIn } from 'lucide-react';

// Feature metadata — what each locked feature does and why it matters
const FEATURE_META = {
  '90-Day Sprints': {
    icon: '⚡',
    tagline: 'Turn intelligence into measurable progress.',
    description: 'Every Sprint focuses on the highest-impact opportunities identified during your analysis. Each task is Galileo-verified, sequenced for maximum ROI, and tracked to a measurable outcome.',
    outcome: 'Business owners using 90-Day Sprints close their highest-priority gap within the first quarter.',
  },
  'Advisor Workspace': {
    icon: '🧭',
    tagline: 'Your advisory team, fully coordinated.',
    description: 'The Advisor Workspace gives your Capital Impact team a real-time view of your business intelligence, your sprint progress, and your open gaps — so every conversation is already in context.',
    outcome: 'No re-explaining. No recap calls. Just execution.',
  },
  'Playbooks': {
    icon: '📋',
    tagline: 'Step-by-step execution for every strategy.',
    description: 'Each identified gap has a matching playbook — a sequenced set of actions, tools, and templates proven to close that specific gap. No guesswork on where to start.',
    outcome: 'The exact steps to close your highest-value gap.',
  },
  'Weekly Reviews': {
    icon: '📊',
    tagline: 'Accountability built into the system.',
    description: 'Galileo reviews your sprint progress each week, identifies drift, and surfaces the highest-leverage correction. Your advisor is alerted to anything that needs human judgment.',
    outcome: 'Consistent progress without constant effort.',
  },
  'Meeting Center': {
    icon: '🎯',
    tagline: 'Every session starts where you left off.',
    description: 'The Meeting Center syncs your sprint status, open questions, and advisor notes so every strategy call is focused on what matters — not on catching up.',
    outcome: 'More execution per hour of advisory time.',
  },
  'Advanced AI': {
    icon: '✦',
    tagline: 'Deeper intelligence. Faster answers.',
    description: 'Advanced AI unlocks expanded Galileo context — deeper analysis, multi-year projections, scenario modeling, and the ability to ask complex questions about your specific business.',
    outcome: 'Answers that account for your full business picture.',
  },
  'Implementation Tracking': {
    icon: '✓',
    tagline: 'Know exactly what has been done and what hasn\'t.',
    description: 'Implementation Tracking connects your Sprint tasks to measurable business outcomes — so you always know the real-world impact of what your team has completed.',
    outcome: 'From task completion to verified business impact.',
  },
};

const DEFAULT_META = {
  icon: '🔒',
  tagline: 'This workspace is part of the advisory experience.',
  description: 'This feature is available when you begin working with the Capital Impact advisory team. It is designed to make every engagement more focused, more measurable, and more impactful.',
  outcome: 'Everything inside is built around your specific business intelligence.',
};

export default function FeatureAccessModal({ open, onClose, featureName }) {
  const meta = FEATURE_META[featureName] || DEFAULT_META;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(10,10,14,0.99)',
              border: '1px solid rgba(212,168,83,0.18)',
              backdropFilter: 'blur(24px)',
            }}
            initial={{ opacity: 0, y: 18, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4A853' }} />
                <span className="text-[10px] tracking-[0.2em] uppercase font-semibold" style={{ color: '#D4A853' }}>
                  Galileo · Member Feature
                </span>
              </div>
              <button onClick={onClose} className="text-white/25 hover:text-white/55 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              {/* Feature icon + name */}
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">{meta.icon}</span>
                <div>
                  <h2 className="text-base font-semibold text-white leading-snug">
                    {featureName || 'This workspace'}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: '#D4A853' }}>{meta.tagline}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {meta.description}
              </p>

              {/* Outcome pill */}
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.12)' }}>
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(212,168,83,0.5)' }}>What you get</p>
                <p className="text-xs font-medium leading-snug" style={{ color: 'rgba(255,255,255,0.8)' }}>{meta.outcome}</p>
              </div>

              {/* Access copy */}
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                This workspace becomes available when you begin working with our advisory team.
              </p>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 space-y-2">
              <a
                href="/login"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: '#D4A853', color: '#0D0D10' }}
                onClick={onClose}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </a>
              <a
                href="/strategy-call"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
                onClick={onClose}
              >
                <Calendar className="w-3.5 h-3.5" />
                Schedule Strategy Session
              </a>
              <button
                onClick={onClose}
                className="w-full text-center py-2 text-[11px] transition-colors"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}