/**
 * WhyButton — Phase 8
 *
 * A small "Why?" button that opens a popover explaining the logic, data
 * provenance, and decision relevance of a dashboard metric.
 *
 * Uses deterministic explanations from whyExplanations.js — no LLM, no network.
 */
import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getWhyExplanation } from '@/lib/whyExplanations';

const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (typeof n === 'number') return `$${n.toLocaleString('en-US')}`;
  return String(n);
};

export default function WhyButton({ metricId, bis, label = 'Why?' }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const explanation = getWhyExplanation(metricId, bis);
  if (!explanation) return null;

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider px-2 py-1 rounded-full transition-opacity hover:opacity-80"
        style={{
          background: 'rgba(212,168,83,0.08)',
          color: 'rgba(212,168,83,0.7)',
          border: '1px solid rgba(212,168,83,0.15)',
        }}
      >
        <HelpCircle className="w-3 h-3" />
        {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full mt-2 w-72 rounded-xl p-4 z-50 text-left"
            style={{
              background: 'rgba(8,8,12,0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-3 pb-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'rgba(212,168,83,0.7)', fontSize: 10 }}>✦</span>
              <span className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: 'rgba(212,168,83,0.7)' }}>
                Galileo
              </span>
            </div>

            {explanation.currentValue != null && (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Current Value</p>
                <p className="text-sm font-semibold" style={{ color: '#D4A853' }}>{fmt(explanation.currentValue)}</p>
              </div>
            )}

            <div className="space-y-2.5">
              <Field label="What it measures">
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{explanation.what}</p>
              </Field>
              <Field label="How it's calculated">
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{explanation.calculation}</p>
              </Field>
              <Field label="Data provenance">
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{explanation.provenance}</p>
              </Field>
              <Field label="Why it matters">
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(212,168,83,0.9)' }}>{explanation.relevance}</p>
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </p>
      {children}
    </div>
  );
}