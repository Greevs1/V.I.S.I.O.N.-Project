/**
 * EstimateDialog — inline "Help me estimate" flow.
 *
 * When the user doesn't know their EBITDA, Galileo asks easier questions
 * and derives a modeled estimate. Never dead-ends.
 *
 * All estimates are labeled "MODELED ESTIMATE" — never presented as
 * document-supported fact.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getEstimateQuestions } from '@/lib/galileo/estimateHelper';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export default function EstimateDialog({ revenue, benchmark, onComplete, onCancel }) {
  const questions = getEstimateQuestions(revenue, benchmark);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [textValue, setTextValue] = useState('');

  const currentQ = questions[step];
  if (!currentQ) {
    onComplete({});
    return null;
  }

  const submit = (field, value) => {
    const updated = { ...answers, [field]: value };
    setAnswers(updated);
    if (step < questions.length - 1) {
      setStep(step + 1);
      setTextValue('');
    } else {
      onComplete(updated);
    }
  };

  const handleTextSubmit = () => {
    const raw = textValue.trim();
    if (currentQ.inputType === 'number') {
      submit(currentQ.id, raw === '' ? null : Number(raw));
    } else {
      submit(currentQ.id, raw || null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <p className="text-sm text-white/65 text-center leading-relaxed">
        No problem — let me help you estimate.
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.25 }}
          className="space-y-3"
        >
          {currentQ.prompt && (
            <>
              <h3 className="text-lg md:text-xl font-display font-semibold text-white text-center tracking-tight">
                {currentQ.prompt}
              </h3>
              {currentQ.sub && (
                <p className="text-sm text-white/45 text-center leading-relaxed">{currentQ.sub}</p>
              )}
            </>
          )}

          {/* Choice input */}
          {currentQ.inputType === 'choice' && (
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {currentQ.options?.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => submit(currentQ.id, opt.value)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/30 hover:bg-[#D4A853]/[0.03] transition-all"
                >
                  <span className="text-sm font-medium text-white/85">{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Number input */}
          {currentQ.inputType === 'number' && (
            <div className="flex gap-2 max-w-md mx-auto">
              {currentQ.prefix && (
                <span className="flex items-center px-3 rounded-lg bg-white/5 border border-white/10 text-white/50 text-sm">
                  {currentQ.prefix}
                </span>
              )}
              <Input
                autoFocus
                type="number"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && textValue.trim() && handleTextSubmit()}
                placeholder={currentQ.placeholder}
                className="flex-1 h-11 bg-white/5 border-white/10 text-white text-base"
              />
              <Button
                onClick={handleTextSubmit}
                className="h-11 px-4 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {currentQ.allowSkip && (
            <button
              onClick={() => submit(currentQ.id, null)}
              className="text-xs text-white/35 hover:text-white/60 self-center block mx-auto"
            >
              Skip this one
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      <button
        onClick={onCancel}
        className="text-xs text-white/35 hover:text-white/60 block mx-auto"
      >
        Go back
      </button>
    </motion.div>
  );
}