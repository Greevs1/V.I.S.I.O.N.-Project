/**
 * ImplementationChoice — "How do you want to move forward?"
 *
 * GUIDE ME: do it myself with Galileo (Creator → Producer transition).
 * WORK WITH AN EXPERT: bring in an appropriate professional.
 *
 * This choice belongs to THIS opportunity/strategy — the user is never
 * permanently classified as DIY or Expert.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Compass, Users } from 'lucide-react';

export default function ImplementationChoice({ opportunity, strategy, onChoose }) {
  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-2 text-center">
          {opportunity?.title} — {strategy}
        </p>
        <h2 className="text-xl md:text-2xl font-display font-bold text-white text-center mb-2">
          How do you want to move forward?
        </h2>
        <p className="text-sm text-white/50 text-center mb-8">
          You can change this per opportunity — you're never locked in.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onChoose('guide_me')}
            className="group flex flex-col gap-2 px-6 py-7 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/40 hover:bg-[#D4A853]/[0.04] transition-all text-left"
          >
            <Compass className="w-6 h-6 text-white/40 group-hover:text-[#D4A853] transition-colors" />
            <span className="text-sm font-semibold text-white/85">Guide Me</span>
            <span className="text-[12px] text-white/45 leading-relaxed">
              Do it myself with Galileo. I'll help you build the plan, explain the strategy, and track
              the steps.
            </span>
          </button>
          <button
            onClick={() => onChoose('work_with_expert')}
            className="group flex flex-col gap-2 px-6 py-7 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-[#D4A853]/40 hover:bg-[#D4A853]/[0.04] transition-all text-left"
          >
            <Users className="w-6 h-6 text-white/40 group-hover:text-[#D4A853] transition-colors" />
            <span className="text-sm font-semibold text-white/85">Work With an Expert</span>
            <span className="text-[12px] text-white/45 leading-relaxed">
              Bring in an appropriate professional. I'll prepare the context so they can move fast.
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}