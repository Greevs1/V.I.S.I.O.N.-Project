/**
 * VisitSummary — ONE quiet line replacing the two separate update banners.
 *
 * Previously the surface showed both "N new things since your last visit"
 * (the NOW item) and "Galileo completed N things since your last visit"
 * (the activity card): the same idea twice, in premium space.
 *
 * This consolidates both REAL counts into a single sentence. If a count is
 * unavailable the sentence adapts; if neither is available it renders nothing.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function VisitSummary({ insightCount = 0, actionCount = 0, onReview }) {
  const parts = [];
  if (insightCount > 0) {
    parts.push(`${insightCount} ${insightCount === 1 ? 'insight' : 'insights'}`);
  }
  if (actionCount > 0) {
    parts.push(`${actionCount} ${actionCount === 1 ? 'action completed' : 'actions completed'}`);
  }

  if (parts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-2.5 px-3.5 py-2 rounded-full vision-glass w-fit max-w-full"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-vision-gold shrink-0" />
      <span className="text-[11.5px] text-white/55 truncate">
        Since your last visit · {parts.join(' · ')}
      </span>
      {onReview && (
        <button
          type="button"
          onClick={onReview}
          className="inline-flex items-center gap-1 text-[11.5px] text-vision-gold/85 hover:text-vision-bright font-medium transition-colors shrink-0 vision-focus rounded-full"
        >
          Review
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}