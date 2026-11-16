/**
 * IntelligencePanel
 *
 * "I already found X of Y values I need."
 * Shown before each assessment begins, based on prefill suggestions.
 *
 * Props:
 *   assessmentKey  - e.g. 'profit_gap'
 *   suggestions    - object from useAssessmentPrefill
 *   loading        - bool
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { PREFILL_MAP } from '@/lib/assessmentPrefillMap';

// Human-readable labels for each field_key
const FIELD_LABELS = {
  p1_rev:             'Revenue',
  p1_mymargin:        'Profit Margin',
  v2_ebitda:          'EBITDA',
  rc_ebitda:          'Reported EBITDA',
  'rc_addbacks.owner_comp':   'Officer Compensation',
  'rc_addbacks.da':           'Depreciation & Amortization',
  'rc_addbacks.interest':     'Interest Expense',
  t3_agi:             'Adjusted Gross Income',
  t3_entity:          'Entity Type',
  o4_hrs:             'Owner Hours',
  o4_takehome:        'Monthly Take-Home',
  f_household_expenses: 'Household Expenses',
  f_net_worth:        'Net Worth',
};

// Fields always required but never extractable (must be asked)
const ALWAYS_MANUAL = {
  profit_gap:         ['Industry Benchmark'],
  value_gap:          [],
  recast_ebitda:      [],
  tax_gap:            ['Owner Hours', 'Desired Freedom Income'],
  operations_gap:     ['Owner Hours'],
  freedom_assessment: ['Desired Freedom Income'],
};

export default function IntelligencePanel({ assessmentKey, suggestions, loading }) {
  const relevantFields = PREFILL_MAP.filter(f => f.assessment_key === assessmentKey);

  // Deduplicate field_keys
  const seen = new Set();
  const uniqueFields = relevantFields.filter(f => {
    if (seen.has(f.field_key)) return false;
    seen.add(f.field_key);
    return true;
  });

  const foundCount = uniqueFields.filter(f => suggestions[f.field_key] != null).length;
  const totalKnowable = uniqueFields.length;
  const manualFields = ALWAYS_MANUAL[assessmentKey] || [];
  const totalNeeded = totalKnowable + manualFields.length;

  if (totalKnowable === 0 && manualFields.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="rounded-xl p-5 space-y-4"
      style={{
        background: 'rgba(212,168,83,0.04)',
        border: '1px solid rgba(212,168,83,0.14)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 text-[#D4A853]/60 shrink-0" />
        <p className="text-sm text-white/80 font-light">
          {foundCount > 0 ? (
            <>
              I already found{' '}
              <span className="text-[#D4A853] font-semibold">{foundCount}</span>
              {' '}of{' '}
              <span className="text-white/60">{totalNeeded}</span>
              {' '}values I need.
            </>
          ) : (
            "Let's learn a little more about your business."
          )}
        </p>
      </div>

      {/* Field list */}
      <div className="space-y-1.5">
        {/* Found fields */}
        {uniqueFields.map((f) => {
          const found = suggestions[f.field_key] != null;
          const label = FIELD_LABELS[f.field_key] || f.label;
          return (
            <div key={f.field_key} className="flex items-center gap-2.5">
              <span className={`text-xs font-medium w-3 ${found ? 'text-emerald-400' : 'text-white/20'}`}>
                {found ? '✓' : '·'}
              </span>
              <span className={`text-xs ${found ? 'text-white/65' : 'text-white/25'}`}>
                {label}
                {found && suggestions[f.field_key]?.source_label && (
                  <span className="text-[#D4A853]/40 ml-1.5 text-[10px]">
                    — {suggestions[f.field_key].source_label}
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {/* Always-manual fields that need asking */}
        {manualFields.length > 0 && (
          <div className="pt-1">
            {manualFields.map((label) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="text-xs font-medium w-3 text-white/20">·</span>
                <span className="text-xs text-white/25">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}