/**
 * LivingDashboardUpdate — Phase 8 / Phase 15.1
 *
 * Intelligence change alert — surfaces what has changed in the BIE since the
 * last executive briefing. Draws from the BIE journal and the engine's
 * changedSinceLastBriefing list.
 *
 * Phase 15.1: Enriched with Living Intelligence "What Changed" model.
 * When LI changes are available, they provide richer context:
 *   what changed, why, what depends on it, what should happen next.
 * LI changes are merged with existing BIE journal changes — no duplication.
 *
 * Only renders when there are actual changes — otherwise stays invisible.
 */
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { loadJournal } from '@/lib/bie';

const TRIGGER_LABELS = {
  assessment: 'Assessment updated',
  document: 'Documents accepted',
  scenario: 'Scenario saved',
  sprint: 'Sprint progress',
  advisor: 'Advisor review',
  system: 'Intelligence recalculated',
};

export default function LivingDashboardUpdate({ bis, businessId, intelligenceChanges }) {
  const [expanded, setExpanded] = useState(false);

  // ── Existing BIE journal changes (unchanged) ────────────────────────────
  const bieChanges = useMemo(() => {
    if (!businessId) return [];
    const changedIds = bis?.engine?.changedSinceLastBriefing || [];
    if (!changedIds.length) return [];

    const journal = loadJournal(businessId);
    return changedIds.map(id => {
      const entry = [...journal].reverse().find(e =>
        e.metricId === id || (e.affectedMetrics || []).includes(id)
      );
      return {
        type: 'bie',
        metricId: id,
        summary: entry?.galileoSummary || null,
        triggeredBy: entry?.triggeredBy || 'system',
        timestamp: entry?.timestamp || null,
      };
    }).filter(c => c.summary);
  }, [businessId, bis?.engine?.changedSinceLastBriefing]);

  // ── Phase 15.1: Living Intelligence "What Changed" items ──────────────────
  // LI provides richer context: what_changed, why_it_changed,
  // what_depends_on_it, what_should_happen_next, who_should_care, can_it_wait
  const liChanges = useMemo(() => {
    if (!intelligenceChanges || !intelligenceChanges.length) return [];
    return intelligenceChanges.slice(0, 5).map(c => ({
      type: 'li',
      summary: c.what_changed,
      detail: c.why_it_changed,
      dependsOn: c.what_depends_on_it || [],
      nextAction: c.what_should_happen_next,
      whoShouldCare: c.who_should_care,
      canItWait: c.can_it_wait,
      triggeredBy: c.certified_owner === 'cbss' ? 'system' : 'advisor',
      timestamp: c.timestamp,
    }));
  }, [intelligenceChanges]);

  // Merge: LI changes first (richer context), then BIE changes not already covered
  const allChanges = useMemo(() => {
    const merged = [...liChanges];
    const liSummaries = new Set(liChanges.map(c => c.summary?.toLowerCase()));
    for (const bie of bieChanges) {
      if (!liSummaries.has(bie.summary?.toLowerCase())) {
        merged.push(bie);
      }
    }
    return merged;
  }, [liChanges, bieChanges]);

  // ── Quiet state: render nothing if no changes ────────────────────────────
  if (!allChanges.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="rounded-xl p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,0,0,0) 100%)',
        border: '1px solid rgba(212,168,83,0.22)',
      }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 w-full mb-0"
      >
        <RefreshCw className="w-3.5 h-3.5 text-primary" />
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
          Intelligence Updated
        </p>
        <span className="text-[11px] text-muted-foreground">
          {allChanges.length} change{allChanges.length !== 1 ? 's' : ''} since your last briefing
        </span>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground ml-auto transition-transform"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-3">
              {allChanges.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg p-2.5"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-relaxed text-foreground/75">{c.summary}</p>
                    {c.nextAction && c.nextAction !== c.summary && (
                      <p className="text-[11px] text-primary/70 mt-1 leading-relaxed">
                        <span className="font-medium">Next: </span>{c.nextAction}
                      </p>
                    )}
                    {c.triggeredBy && TRIGGER_LABELS[c.triggeredBy] && (
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
                        {TRIGGER_LABELS[c.triggeredBy]}
                      </p>
                    )}
                  </div>
                  {c.canItWait === 'immediate' && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-400/80 font-medium shrink-0 mt-1">Urgent</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}