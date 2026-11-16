/**
 * OpportunityFound — one strong, supported opportunity.
 *
 * Uses existing opportunity/gap logic from the preliminary model. Only values
 * that existing calculations support are shown. Provides Show Me Why, What
 * Could We Do, and Save For Later.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, Bookmark } from 'lucide-react';
import { getOpportunityStateLabel, getOpportunityStateColor } from '@/lib/galileo/opportunityQualification';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export default function OpportunityFound({ opportunity, onShowWhy, onExplore, onSaveLater }) {
  if (!opportunity) {
    return (
      <div className="flex flex-col items-center max-w-lg mx-auto px-6 pt-8 text-center">
        <p className="text-base text-white/55">
          I don't have enough verified intelligence yet to point at a specific opportunity. Connect
          your financials or complete a deeper assessment and I'll find one.
        </p>
        <Button onClick={onSaveLater} className="mt-6 h-12 px-6 bg-[#D4A853] text-black hover:bg-[#D4A853]/90">
          Save my business
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4A853]/70 font-semibold mb-2 text-center">
          I found something
        </p>
        <h2 className="text-2xl md:text-3xl font-display font-bold text-white text-center mb-6">
          {opportunity.title}
        </h2>

        <div className="rounded-2xl border border-[#D4A853]/20 bg-[#D4A853]/[0.03] p-6 space-y-5">
          {/* Intelligence state — Hypothesis vs Validated Opportunity */}
          {opportunity.intelligenceState && (
            <div>
              <span className={`text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 py-1 rounded-full border ${getOpportunityStateColor(opportunity.intelligenceState)}`}>
                {getOpportunityStateLabel(opportunity.intelligenceState)}
              </span>
            </div>
          )}

          <p className="text-sm text-white/65 leading-relaxed">{opportunity.summary}</p>

          {opportunity.potentialValueImpact > 0 && (
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Potential Enterprise Value Impact</p>
                <p className="text-xl font-display font-bold text-[#D4A853] mt-0.5">
                  ~{fmt(opportunity.potentialValueImpact)}
                  <span className="text-xs text-white/40 font-normal ml-1">
                    ({opportunity.intelligenceState === 'hypothesis' ? 'modeled' : 'modeled from your financials'})
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/40">Confidence:</span>
            <span className="text-white/70 font-medium">{opportunity.confidence}</span>
          </div>

          <div className="text-xs text-white/45">
            <span className="text-white/40">Evidence:</span>{' '}
            {opportunity.evidence?.join(' · ')}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 mt-6 justify-center">
          <Button
            onClick={onShowWhy}
            variant="outline"
            className="h-11 px-5 border-white/15 text-white/80 hover:text-white"
          >
            Show me why
          </Button>
          <Button
            onClick={onExplore}
            className="h-11 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
          >
            What could we do? <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
        <div className="flex justify-center mt-3">
          <button onClick={onSaveLater} className="text-xs text-white/40 hover:text-white/70 inline-flex items-center gap-1">
            <Bookmark className="w-3 h-3" /> Save for later
          </button>
        </div>
      </motion.div>
    </div>
  );
}