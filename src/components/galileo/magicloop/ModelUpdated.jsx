/**
 * ModelUpdated — "That changed the picture."
 *
 * Shows meaningful before/after intelligence inside the Galileo workspace.
 * The transformation happens in-place — no separate results page. This is
 * the emotional moment where estimates become verified.
 */

import React from 'react';
import { motion } from 'framer-motion';
import BusinessPulse, { IntelligenceBadge } from './BusinessPulse';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { buildPreliminaryModel } from '@/lib/galileo/preliminaryModel';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export default function ModelUpdated({ answers, verified, model, onContinue }) {
  // Build the "before" model (estimates only) for comparison
  const before = buildPreliminaryModel(answers, {});
  const after = model;

  const valueBefore = before.signals.value;
  const valueAfter = after?.signals.value;
  const profitBefore = before.signals.profit;
  const profitAfter = after?.signals.profit;

  const isDocSupported = (status) => status === 'document_supported' || status === 'verified';

  const Row = ({ label, beforeText, afterText, upgraded }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-sm text-white/55">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-white/35 line-through">{beforeText}</span>
        <span className="text-white/20">→</span>
        <span className={`text-sm font-medium ${upgraded ? 'text-[#D4A853]' : 'text-white/85'}`}>
          {afterText}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-base text-white/55 font-light italic mb-6 text-center">
          "That changed the picture. Here's what I see now."
        </p>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">
              Your Business — Updated
            </span>
            <IntelligenceBadge completeness={after?.completeness} />
          </div>

          {/* Before/After comparison */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-2">
            <Row
              label="Revenue"
              beforeText={valueBefore ? 'Estimated' : '—'}
              afterText={isDocSupported(valueAfter?.status) ? 'Document Supported' : 'Estimated'}
              upgraded={isDocSupported(valueAfter?.status)}
            />
            <Row
              label="Profit Margin"
              beforeText={profitBefore ? `${profitBefore.margin}%` : '—'}
              afterText={profitAfter ? `${profitAfter.margin}%` : '—'}
              upgraded={isDocSupported(profitAfter?.status)}
            />
            <Row
              label="Business Value"
              beforeText={valueBefore ? fmt(valueBefore.current) : '—'}
              afterText={valueAfter ? fmt(valueAfter.current) : '—'}
              upgraded={isDocSupported(valueAfter?.status)}
            />
          </div>

          {/* Updated Business Pulse */}
          <BusinessPulse model={after} />
        </div>

        <div className="flex justify-center mt-8">
          <Button onClick={onContinue} className="h-12 px-6 bg-[#D4A853] text-black hover:bg-[#D4A853]/90">
            Show me what you found <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}