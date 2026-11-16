import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

export default function IQScoreCard({ score = 0, confidence = null, priorScore = null, snapshotDate = null }) {
  const getLabel = (s) => {
    if (s >= 80) return 'Exceptional — minimal gaps.';
    if (s >= 60) return 'Strong — some optimization available.';
    if (s >= 40) return 'Moderate — meaningful gaps exist.';
    if (s >= 20) return 'Well positioned — optimization still available.';
    return 'Early stage — significant opportunities ahead.';
  };

  const hasImproved = priorScore != null && score > priorScore;
  const scoreDelta = priorScore != null ? score - priorScore : null;
  const isLowConfidence = confidence != null && confidence < 60;

  return (
    <div className="glass-gold rounded-2xl p-8 text-center">
      <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase mb-6">
        IQ™ — Impact Quotient Score
      </p>
      <motion.div 
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="mb-4"
      >
        <span className="text-7xl font-display font-bold text-cyan-gradient">{score}</span>
      </motion.div>
      <p className="text-sm text-muted-foreground">{getLabel(score)}</p>

      {/* V2 enhancements: delta, confidence, freshness — only rendered when data exists */}
      {(scoreDelta != null || isLowConfidence || snapshotDate) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-[11px]">
          {scoreDelta != null && (
            <span className={scoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {scoreDelta >= 0 ? '+' : ''}{scoreDelta} pts since start
            </span>
          )}
          {isLowConfidence && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertCircle className="w-3 h-3" />
              Low confidence ({confidence}%)
            </span>
          )}
          {snapshotDate && (
            <span className="text-muted-foreground">
              As of {new Date(snapshotDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}