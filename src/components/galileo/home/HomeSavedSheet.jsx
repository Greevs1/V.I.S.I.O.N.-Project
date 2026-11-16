/**
 * HomeSavedSheet — simple saved items retrieval.
 *
 * Users can retrieve insights, Galileo responses, opportunities,
 * scenarios, reports, and important evidence.
 *
 * Do not turn Saved into another complex information architecture.
 * Search/filter can come later.
 *
 * Galileo should also understand:
 *   "Show me that tax idea I saved."
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Bookmark, Target, Diamond, FileText } from 'lucide-react';

const TYPE_ICONS = {
  opportunity: Target,
  scenario: Diamond,
  strategies: FileText,
  insight: Bookmark,
};

export default function HomeSavedSheet({ savedItems = [], onBack, onItemClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5 max-w-[640px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </button>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">
          Saved
        </p>
      </div>

      {/* Saved items */}
      {savedItems.length > 0 ? (
        <div className="space-y-2">
          {savedItems.map((item) => {
            const Icon = TYPE_ICONS[item.type] || Bookmark;
            return (
              <button
                key={item.id}
                onClick={() => onItemClick?.(item)}
                className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-white/[0.05] bg-white/[0.015] hover:border-[#D4A853]/15 hover:bg-[#D4A853]/[0.02] transition-all text-left"
              >
                <Icon className="w-4 h-4 text-white/35 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="block text-[13px] text-white/75 truncate">
                    {item.title}
                  </span>
                  {item.savedAt && (
                    <span className="block text-[10px] text-white/30 mt-0.5">
                      {new Date(item.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-[14px] text-white/40 leading-relaxed max-w-[400px] mx-auto">
            You haven't saved anything yet. Save insights, opportunities, and
            scenarios to revisit them here.
          </p>
        </div>
      )}
    </motion.div>
  );
}