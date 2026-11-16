/**
 * DiscoveryQuestions — 3–5 conversational, high-information questions.
 *
 * Not a traditional assessment. No "Question 1 of 90." One question at a time,
 * feeling like a short intelligent conversation. Answers feed the existing
 * certified calculation pipeline via the hook.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight } from 'lucide-react';

const QUESTIONS = [
  {
    field: 'industry',
    prompt: "What does your company do?",
    sub: "A short phrase is fine — I just need the shape of it.",
    type: 'text',
    placeholder: 'e.g. Commercial HVAC services',
  },
  {
    field: 'revenue',
    prompt: "Roughly, what's your annual revenue?",
    sub: "An estimate is fine — I'll refine it later if you connect your financials.",
    type: 'number',
    placeholder: 'e.g. 2500000',
    prefix: '$',
    allowSkip: true,
  },
  {
    field: 'ebitda',
    prompt: "And your approximate EBITDA?",
    sub: "What the business earns before interest, taxes, and owner add-backs. If you're not sure, skip — I'll estimate.",
    type: 'number',
    placeholder: 'e.g. 400000',
    prefix: '$',
    allowSkip: true,
  },
  {
    field: 'employees',
    prompt: "How many people work in the business?",
    sub: "Including yourself.",
    type: 'number',
    placeholder: 'e.g. 12',
    allowSkip: true,
  },
  {
    field: 'involvement',
    prompt: "How involved are you in the day-to-day?",
    sub: "This tells me a lot about operations and freedom.",
    type: 'choice',
    options: [
      { value: 'light', label: 'Light', desc: 'I mostly steer; others run it' },
      { value: 'moderate', label: 'Moderate', desc: "I'm in it most days" },
      { value: 'heavy', label: 'Heavy', desc: 'It runs on me' },
    ],
  },
];

export default function DiscoveryQuestions({ answers, onAnswer, onComplete }) {
  const [idx, setIdx] = useState(0);
  const [textValue, setTextValue] = useState('');
  const q = QUESTIONS[idx];
  const isLast = idx === QUESTIONS.length - 1;

  const fmtDisplay = (field, raw) => {
    if (field === 'revenue' || field === 'ebitda') {
      if (raw == null || raw === '') return 'Not sure yet';
      const n = Number(raw);
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
      return `$${n}`;
    }
    if (field === 'employees') return raw ? `${raw} people` : 'Skipped';
    return raw;
  };

  const submit = (value, displayValue) => {
    onAnswer(q.field, value, displayValue);
    if (isLast) {
      onComplete();
    } else {
      setIdx((i) => i + 1);
      setTextValue('');
    }
  };

  const handleTextSubmit = () => {
    const raw = textValue.trim();
    if (q.type === 'number') {
      const n = raw === '' ? null : Number(raw);
      submit(n, fmtDisplay(q.field, n));
    } else {
      submit(raw || null, raw || 'Skipped');
    }
  };

  return (
    <div className="flex flex-col items-center max-w-xl mx-auto px-6 pt-6 w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-8 justify-center">
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === idx ? 20 : 4,
                  height: 3,
                  background:
                    i < idx ? 'rgba(212,168,83,0.4)' : i === idx ? '#D4A853' : 'rgba(255,255,255,0.1)',
                }}
              />
            ))}
          </div>

          <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-2 text-center">
            Question {idx + 1} of {QUESTIONS.length}
          </p>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight text-center">
            {q.prompt}
          </h2>
          <p className="text-sm text-white/45 mt-2 mb-8 text-center leading-relaxed">{q.sub}</p>

          {/* Input */}
          {q.type === 'text' && (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                placeholder={q.placeholder}
                className="flex-1 h-12 bg-white/5 border-white/10 text-white text-base"
              />
              <Button
                onClick={handleTextSubmit}
                disabled={!textValue.trim()}
                className="h-12 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {q.type === 'number' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                {q.prefix && (
                  <span className="flex items-center px-3 rounded-lg bg-white/5 border border-white/10 text-white/50 text-sm">
                    {q.prefix}
                  </span>
                )}
                <Input
                  autoFocus
                  type="number"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                  placeholder={q.placeholder}
                  className="flex-1 h-12 bg-white/5 border-white/10 text-white text-base"
                />
                <Button
                  onClick={handleTextSubmit}
                  className="h-12 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              {q.allowSkip && (
                <button
                  onClick={handleTextSubmit}
                  className="text-xs text-white/40 hover:text-white/70 self-center"
                >
                  I'm not sure — skip for now
                </button>
              )}
            </div>
          )}

          {q.type === 'choice' && (
            <div className="flex flex-col gap-2">
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => submit(opt.value, opt.label)}
                  className="w-full text-left px-5 py-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/40 hover:bg-[#D4A853]/[0.04] transition-all"
                >
                  <span className="block text-sm font-medium text-white/85">{opt.label}</span>
                  <span className="block text-xs text-white/40 mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}