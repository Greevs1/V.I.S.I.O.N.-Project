/**
 * SprintBridge — Phase 8
 *
 * Intelligently bridges dashboard opportunities to the 90-Day Sprint system.
 * Reads sprint-ready recommendations from the BIE engine and presents the
 * highest-leverage opportunity as the natural next chapter.
 *
 * - Paid users: links directly to the Sprint area
 * - Locked users: triggers the FeatureAccessModal
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export default function SprintBridge({ bis, isPaid, onOpenAccessModal }) {
  const topRec = useMemo(() => {
    const recs = bis?.engine?.recommendations || [];
    if (!recs.length) return null;
    // Priority sort: high → medium → low
    const order = { high: 0, medium: 1, low: 2 };
    return [...recs].sort((a, b) =>
      (order[a.priority] ?? 3) - (order[b.priority] ?? 3)
    )[0];
  }, [bis?.engine?.recommendations]);

  if (!topRec) return null;

  const impact = topRec.estimatedImpact != null ? fmt(topRec.estimatedImpact) : null;

  const handleCta = () => {
    if (!isPaid) {
      onOpenAccessModal?.('90-Day Sprint');
      return;
    }
    // Paid — navigate to sprint area
    window.location.href = '/advisory/command-center';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.06) 0%, rgba(0,0,0,0) 100%)',
        border: '1px solid rgba(212,168,83,0.18)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: 'rgba(212,168,83,0.7)', fontSize: 11 }}>✦</span>
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
          Highest-Leverage Next Move
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground mb-1">{topRec.label}</p>
          {impact && (
            <p className="text-sm text-primary font-medium">
              Estimated impact: {impact}
            </p>
          )}
          <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">
            {isPaid
              ? 'Your intelligence is verified and ready. Turn this finding into a focused 90-Day Sprint.'
              : 'Members transform findings like these into focused execution plans — a 90-Day Sprint.'}
          </p>
        </div>

        <button
          onClick={handleCta}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-opacity hover:opacity-85"
          style={{ background: '#D4A853', color: '#08080C' }}
        >
          {isPaid ? 'Build Sprint' : 'Unlock'}
          {isPaid
            ? <ArrowRight className="w-3.5 h-3.5" />
            : <Lock className="w-3 h-3" />}
        </button>
      </div>
    </motion.div>
  );
}