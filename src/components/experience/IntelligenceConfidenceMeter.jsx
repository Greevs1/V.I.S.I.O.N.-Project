/**
 * IntelligenceConfidenceMeter
 *
 * Persistent header shown during the assessment phase.
 * Shows overall Business Intelligence confidence %.
 * Each confirmed field raises the score.
 *
 * Props:
 *   confirmedCount  - number of user-confirmed values
 *   totalCount      - total possible values across all assessments
 *   categories      - array of { label, status: 'confirmed'|'estimated'|'needs_validation' }
 */

import React from 'react';
import { motion } from 'framer-motion';

const STATUS_STYLES = {
  confirmed:        { label: 'Confirmed',         color: 'text-emerald-400',    dot: 'bg-emerald-400' },
  estimated:        { label: 'Estimated',          color: 'text-[#D4A853]/80',   dot: 'bg-[#D4A853]/70' },
  needs_validation: { label: 'Needs Validation',   color: 'text-white/35',       dot: 'bg-white/20' },
};

export default function IntelligenceConfidenceMeter({ score = 0, categories = [] }) {
  const level = score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Building';
  const levelColor = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-[#D4A853]' : 'text-white/40';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full px-5 py-2.5 flex items-center gap-5 rounded-xl mb-1"
      style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Score */}
      <div className="flex items-baseline gap-1.5 shrink-0">
        <span className="text-2xl font-display font-bold text-white/85">{score}%</span>
        <div className="flex flex-col">
          <span className="text-[9px] text-white/30 tracking-widest uppercase leading-none">Business</span>
          <span className="text-[9px] text-white/30 tracking-widest uppercase leading-none">Intelligence</span>
        </div>
        <span className={`text-[10px] font-semibold ml-1 ${levelColor}`}>{level}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/8 shrink-0" />

      {/* Category pills */}
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide flex-1 min-w-0">
        {categories.map((cat) => {
          const style = STATUS_STYLES[cat.status] || STATUS_STYLES.needs_validation;
          return (
            <div key={cat.label} className="flex items-center gap-1.5 shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              <span className="text-[10px] text-white/40">{cat.label}</span>
              <span className={`text-[10px] font-medium ${style.color}`}>{style.label}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}