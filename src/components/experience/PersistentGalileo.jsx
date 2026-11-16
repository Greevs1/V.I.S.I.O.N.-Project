/**
 * PersistentGalileo
 *
 * A always-visible Galileo presence that accompanies the user throughout
 * the Enterprise Journey. The Galileo avatar/icon never disappears —
 * only the guidance content crossfades between journey states.
 *
 * This creates the feeling of an executive advisor sitting beside the user
 * from beginning to end, rather than popups appearing and disappearing.
 *
 * Props:
 *   currentState  — current JOURNEY_STATES value
 *   assessmentKey — current assessment type (when in ASSESSMENTS state)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const GUIDANCE = {
  INTRO: {
    title: 'Galileo',
    message: 'Welcome. I\'ll be your guide throughout this journey.',
  },
  WELCOME: {
    title: 'Galileo',
    message: 'I\'m here to help you understand what your business is worth, where it can go, and how to get there.',
  },
  CREATE_BUSINESS: {
    title: 'Galileo',
    message: 'Let\'s start by understanding your business. This gives me the context I need.',
  },
  UPLOAD_DOCUMENTS: {
    title: 'Galileo',
    message: 'Your documents help me see the financial picture behind your business. I\'ll extract what matters.',
  },
  ASSESSMENTS: {
    title: 'Galileo',
    message: 'These questions help me identify where value is being lost — and where it can be recovered.',
  },
  ACCOUNT_PROMOTION: {
    title: 'Galileo',
    message: 'Let\'s save your progress so I can continue building your intelligence profile.',
  },
  GENERATING: {
    title: 'Galileo',
    message: 'I\'m assembling your Business Intelligence Model now.',
  },
  DASHBOARD: {
    title: 'Galileo',
    message: 'Your intelligence profile is ready. Let me walk you through what I found.',
  },
};

const ASSESSMENT_GUIDANCE = {
  profit_gap: 'Profit measures how efficiently your business converts revenue into earnings.',
  value_gap: 'Business Value reflects what an outside buyer would likely pay today.',
  recast_ebitda: 'Recast EBITDA reveals the true earning power of your business.',
  tax_gap: 'The Tax Gap identifies estimated overpayment that could remain in your business.',
  operations_gap: 'Operations Health measures how systematized your business is.',
  freedom_assessment: 'Your Freedom Score connects business performance to personal independence.',
};

export default function PersistentGalileo({ currentState, assessmentKey }) {
  const guidanceKey = (currentState === 'ASSESSMENTS' && assessmentKey)
    ? assessmentKey
    : currentState;
  const guidance = GUIDANCE[currentState] || GUIDANCE.WELCOME;
  const message = (currentState === 'ASSESSMENTS' && assessmentKey)
    ? ASSESSMENT_GUIDANCE[assessmentKey] || guidance.message
    : guidance.message;

  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-xl shrink-0"
      style={{
        background: 'rgba(212,168,83,0.04)',
        border: '1px solid rgba(212,168,83,0.1)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Galileo avatar — always visible, never fades */}
      <div className="shrink-0 mt-0.5">
        <div className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(212,168,83,0.12)' }}>
          <Sparkles className="w-3 h-3" style={{ color: '#D4A853' }} />
        </div>
      </div>

      {/* Guidance content — crossfades between states */}
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={guidanceKey}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <span className="text-[9px] tracking-[0.18em] uppercase font-semibold mr-2"
              style={{ color: 'rgba(212,168,83,0.6)' }}>
              Galileo
            </span>
            <span className="text-[11px] leading-relaxed font-light"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              {message}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}