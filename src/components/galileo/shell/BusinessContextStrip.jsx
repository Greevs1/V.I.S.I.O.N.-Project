/**
 * BusinessContextStrip — collapsed discovery history.
 *
 * As Galileo learns information, completed discovery answers consolidate
 * into a subtle contextual strip near the top of the active workspace.
 *
 * Example: Construction · $5.0M Revenue · $400K EBITDA · 4 People
 *
 * Expandable to review/edit answers. The conversation still exists in state
 * but the UI doesn't force the user to scroll through every interaction.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const INVOLVEMENT_LABELS = { light: 'Light involvement', moderate: 'Moderate involvement', heavy: 'Heavy involvement' };

export default function BusinessContextStrip({ answers, onEdit }) {
  const [expanded, setExpanded] = useState(false);

  const parts = [];
  if (answers.industry) parts.push({ field: 'industry', label: answers.industry });
  if (answers.revenue != null) parts.push({ field: 'revenue', label: `${fmt(answers.revenue)} Revenue` });
  if (answers.ebitda != null) parts.push({ field: 'ebitda', label: `${fmt(answers.ebitda)} EBITDA` });
  if (answers.employees != null) parts.push({ field: 'employees', label: `${answers.employees} ${answers.employees === 1 ? 'Person' : 'People'}` });
  if (answers.involvement) parts.push({ field: 'involvement', label: INVOLVEMENT_LABELS[answers.involvement] });

  if (parts.length < 2) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/10 transition-colors group"
      >
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {parts.map((p, i) => (
            <span key={p.field} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-white/20 text-xs">·</span>}
              <span className="text-xs text-white/55 truncate">{p.label}</span>
            </span>
          ))}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 px-3 py-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04] space-y-1.5">
              {parts.map((p) => (
                <div key={p.field} className="flex items-center justify-between">
                  <span className="text-xs text-white/45">{p.field.charAt(0).toUpperCase() + p.field.slice(1)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/70">{p.label}</span>
                    {onEdit && (
                      <button onClick={() => onEdit(p.field)} className="text-white/25 hover:text-white/50">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}