/**
 * Enterprise Blueprint Bar
 * 
 * Replaces "Step X of Y" with an elegant node-based progress indicator.
 * Completed nodes illuminate in warm gold. Future nodes are subtle outlines.
 * No percentages. No step counts. Just a quiet sense of assembly.
 */

import React from 'react';
import { motion } from 'framer-motion';

const BLUEPRINT_NODES = [
  { id: 'business',     label: 'Business' },
  { id: 'documents',    label: 'Documents' },
  { id: 'profit',       label: 'Profit' },
  { id: 'value',        label: 'Value' },
  { id: 'earnings',     label: 'Earnings' },
  { id: 'tax',          label: 'Tax' },
  { id: 'operations',   label: 'Operations' },
  { id: 'freedom',      label: 'Freedom' },
  { id: 'intelligence', label: 'Intelligence' },
];

// Maps journey states / assessment types to blueprint node IDs
export const JOURNEY_STATE_TO_NODE = {
  INTRO:             null,
  WELCOME:           null,
  CREATE_BUSINESS:   'business',
  UPLOAD_DOCUMENTS:  'documents',
  ASSESSMENTS:       null, // handled by assessment type
  ACCOUNT_PROMOTION: 'intelligence',
  DASHBOARD:         'intelligence',
  // assessment type keys
  profit_gap:         'profit',
  value_gap:          'value',
  recast_ebitda:      'earnings',
  tax_gap:            'tax',
  operations_gap:     'operations',
  freedom_assessment: 'freedom',
};

export default function EnterpriseBlueprintBar({ currentNode, completedNodes = [], onNodeClick }) {
  if (!currentNode && completedNodes.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.3 }}
      className="w-full flex flex-col items-center gap-3 pt-6 pb-2"
    >
      {/* Label */}
      <p className="text-[10px] tracking-[0.35em] uppercase text-white/25">
        Enterprise Blueprint
      </p>

      {/* Nodes */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {BLUEPRINT_NODES.map((node, idx) => {
          const isCompleted = completedNodes.includes(node.id);
          const isCurrent   = currentNode === node.id;

          return (
            <React.Fragment key={node.id}>
              {/* Node */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`relative flex items-center justify-center w-4 h-4 ${isCompleted && onNodeClick ? 'cursor-pointer hover:scale-125 transition-transform' : ''}`}
                  onClick={isCompleted && onNodeClick ? () => onNodeClick(node.id) : undefined}
                >
                  {/* Outer ring for current */}
                  {isCurrent && (
                    <motion.div
                      className="absolute inset-0 rounded-full border border-[#D4A853]/60"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  {/* Dot */}
                  <div
                    className={`w-2 h-2 rounded-full transition-all duration-700 ${
                      isCompleted
                        ? 'bg-[#D4A853] shadow-[0_0_6px_rgba(212,168,83,0.5)]'
                        : isCurrent
                        ? 'bg-white'
                        : 'bg-transparent border border-white/20'
                    }`}
                  />
                </div>
                {/* Label */}
                <span
                  className={`text-[9px] tracking-wide transition-all duration-700 ${
                    isCompleted
                      ? 'text-[#D4A853]/70'
                      : isCurrent
                      ? 'text-white/70'
                      : 'text-white/20'
                  }`}
                >
                  {node.label}
                </span>
              </div>

              {/* Connector line */}
              {idx < BLUEPRINT_NODES.length - 1 && (
                <div
                  className={`w-4 h-px mb-4 transition-all duration-700 ${
                    isCompleted ? 'bg-[#D4A853]/30' : 'bg-white/10'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
}