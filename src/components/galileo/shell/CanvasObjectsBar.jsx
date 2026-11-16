/**
 * CanvasObjectsBar — persistent intelligence on the Galileo canvas.
 *
 * When Galileo discovers an Opportunity, creates a Scenario, or builds a Play,
 * these become persistent objects on the canvas — they don't disappear when
 * the conversation scrolls.
 *
 * Conversation is the control mechanism. The Business Model is the product.
 * This bar shows the product objects that have been created.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Diamond, TrendingUp, Target, ClipboardList } from 'lucide-react';
import { CanvasObjectType, getCanvasObjectLabel } from '@/lib/galileo/canvasObjects';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const TYPE_ICONS = {
  [CanvasObjectType.OPPORTUNITY]: Target,
  [CanvasObjectType.SCENARIO]: Diamond,
  [CanvasObjectType.PLAY]: ClipboardList,
  [CanvasObjectType.BENCHMARK]: TrendingUp,
  [CanvasObjectType.VALUE_ESTIMATE]: Diamond,
};

const TYPE_LABELS = {
  [CanvasObjectType.OPPORTUNITY]: 'Opportunity',
  [CanvasObjectType.SCENARIO]: 'Scenario',
  [CanvasObjectType.PLAY]: 'Play',
  [CanvasObjectType.BENCHMARK]: 'Benchmark',
  [CanvasObjectType.VALUE_ESTIMATE]: 'Value',
};

export default function CanvasObjectsBar({ objects = [], onObjectClick }) {
  if (objects.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-2"
    >
      {objects.map((obj, i) => {
        const Icon = TYPE_ICONS[obj.type] || Diamond;
        const label = TYPE_LABELS[obj.type] || '';
        const value = getCanvasObjectValue(obj);

        return (
          <motion.button
            key={obj.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onObjectClick?.(obj)}
            className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-[#D4A853]/20 hover:bg-[#D4A853]/[0.03] transition-all"
          >
            <Icon className="w-3 h-3 text-white/40 shrink-0" />
            <span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span>
            {value && (
              <span className="text-[11px] font-medium text-white/70">{value}</span>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

function getCanvasObjectValue(obj) {
  switch (obj.type) {
    case CanvasObjectType.OPPORTUNITY:
      return obj.data?.potentialValueImpact ? fmt(obj.data.potentialValueImpact) : null;
    case CanvasObjectType.VALUE_ESTIMATE:
      return obj.data?.signal?.current ? fmt(obj.data.signal.current) : null;
    case CanvasObjectType.BENCHMARK:
      return obj.data?.signal?.margin != null ? `${obj.data.signal.margin.toFixed(1)}%` : null;
    case CanvasObjectType.SCENARIO:
      return null; // Scenarios don't have a single value to show
    case CanvasObjectType.PLAY:
      return '90 days';
    default:
      return null;
  }
}