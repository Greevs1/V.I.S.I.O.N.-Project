/**
 * BusinessTimeline — Phase 8 (Redesigned)
 *
 * Chronological event history drawn from the BIE journal.
 * Simplified: one sentence per event, small icon, timestamp, category badge.
 * NOTE: UI never uses the word "Journal" — presented as "Business Timeline".
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Plus, CheckCircle,
  Flag, BadgeCheck, Save, FileCheck, Circle, ArrowRight
} from 'lucide-react';
import { loadJournal, JOURNAL_EVENT_TYPES } from '@/lib/bie';

const EVENT_CONFIG = {
  [JOURNAL_EVENT_TYPES.VALUE_INCREASED]:      { icon: TrendingUp,   color: '#10B981', label: 'Value Up' },
  [JOURNAL_EVENT_TYPES.VALUE_DECREASED]:      { icon: TrendingDown, color: '#FF4D57', label: 'Value Down' },
  [JOURNAL_EVENT_TYPES.METRIC_APPEARED]:      { icon: Plus,         color: '#00D9FF', label: 'New Metric' },
  [JOURNAL_EVENT_TYPES.ASSESSMENT_COMPLETED]: { icon: CheckCircle,  color: '#D4A853', label: 'Assessment' },
  [JOURNAL_EVENT_TYPES.SPRINT_COMPLETED]:     { icon: Flag,         color: '#10B981', label: 'Sprint' },
  [JOURNAL_EVENT_TYPES.ADVISOR_VALIDATED]:    { icon: BadgeCheck,   color: '#D4A853', label: 'Advisor' },
  [JOURNAL_EVENT_TYPES.SCENARIO_SAVED]:       { icon: Save,         color: '#00D9FF', label: 'Scenario' },
  [JOURNAL_EVENT_TYPES.DOCUMENTS_ACCEPTED]:   { icon: FileCheck,    color: '#D4A853', label: 'Document' },
};

function formatEventDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BusinessTimeline({ businessId, limit = 5 }) {
  const entries = useMemo(() => {
    if (!businessId) return [];
    const all = loadJournal(businessId);
    return [...all].reverse().slice(0, limit);
  }, [businessId, limit]);

  if (!entries.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl p-6 h-full flex flex-col"
      style={{
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <p className="text-[12px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          Business Timeline
        </p>
        <button className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          View all
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="relative flex-1">
        <div className="space-y-4">
          {entries.map((e, i) => {
            const config = EVENT_CONFIG[e.eventType] || { icon: Circle, color: 'rgba(255,255,255,0.4)', label: 'Update' };
            const Icon = config.icon;
            return (
              <motion.div
                key={e.id || i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.22 }}
                className="flex items-start gap-3"
              >
                <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${config.color}15` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-medium text-muted-foreground">{formatEventDate(e.timestamp)}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: `${config.color}12`, color: config.color }}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-[14px] leading-relaxed text-foreground/80 truncate">
                    {e.galileoSummary}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}