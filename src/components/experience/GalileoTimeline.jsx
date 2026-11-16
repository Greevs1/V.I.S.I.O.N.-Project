/**
 * GalileoTimeline
 *
 * Messages.app-style chronological history of all Galileo coaching messages.
 * Replaces the JourneyTranscriptDrawer.
 *
 * Features:
 *   - Chronological, newest at bottom
 *   - Search
 *   - Replay (re-fires GalileoCoach for that message)
 *   - Jump label (which assessment it came from)
 *   - Floating trigger button (✦ Galileo)
 *   - Never blocks inputs — fixed bottom-right
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Search, RotateCcw } from 'lucide-react';
import { getTranscript } from '@/lib/journeyTranscript';

const FIELD_KEY_LABELS = {
  profit_gap_industry:        'Profit · Industry',
  profit_gap_revenue_confirm: 'Profit · Revenue',
  profit_gap_revenue:         'Profit · Revenue',
  profit_gap_margin:          'Profit · Margin',
  profit_gap_results:         'Profit · Results',
  value_gap_ebitda:           'Value · EBITDA',
  value_gap_ebitda_confirm:   'Value · EBITDA',
  value_gap_potential:        'Value · Potential',
  recast_intro:               'Earnings · Intro',
  recast_owner_comp:          'Earnings · Owner Comp',
  recast_personal_expenses:   'Earnings · Personal Expenses',
  recast_vehicle:             'Earnings · Vehicle',
  recast_family_payroll:      'Earnings · Family Payroll',
  recast_nonrecurring:        'Earnings · Non-Recurring',
  recast_rent_norm:           'Earnings · Rent',
  recast_results:             'Earnings · Results',
};

function getLabel(fieldKey) {
  return FIELD_KEY_LABELS[fieldKey] || fieldKey.replace(/_/g, ' ');
}

export default function GalileoTimeline({ onReplayMessage }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState([]);
  const [hasEntries, setHasEntries] = useState(false);
  const [replayingKey, setReplayingKey] = useState(null);
  const bottomRef = useRef(null);

  // Poll for new entries every 2s so button appears as soon as first coach fires
  useEffect(() => {
    const check = () => {
      const t = getTranscript();
      setHasEntries(t.length > 0);
      if (open) setEntries(t);
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [open]);

  // Scroll to bottom when new entries arrive
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, open]);

  const filtered = query.trim()
    ? entries.filter(e =>
        e.message.toLowerCase().includes(query.toLowerCase()) ||
        getLabel(e.fieldKey).toLowerCase().includes(query.toLowerCase())
      )
    : entries;

  const handleReplay = (entry) => {
    setReplayingKey(entry.fieldKey);
    onReplayMessage?.(entry);
    setTimeout(() => setReplayingKey(null), 2000);
  };

  if (!hasEntries && !open) return null;

  return (
    <>
      {/* Floating trigger */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium shadow-lg transition-all hover:scale-105"
        style={{
          background: 'rgba(10,10,10,0.92)',
          border: '1px solid rgba(212,168,83,0.22)',
          color: 'rgba(212,168,83,0.75)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>✦ Galileo</span>
        <span className="ml-0.5 text-[#D4A853]/40 text-[9px]">{entries.length || getTranscript().length}</span>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70"
              onClick={() => setOpen(false)}
            />

            {/* Slide-up panel */}
            <motion.div
              key="panel"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden flex flex-col"
              style={{
                background: '#080808',
                border: '1px solid rgba(212,168,83,0.12)',
                maxHeight: '72vh',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-8 h-1 rounded-full bg-white/10" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/6 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4A853]/50" />
                  <p className="text-sm font-semibold text-white/75">Galileo · Timeline</p>
                  <span className="text-[10px] text-white/20 bg-white/5 px-2 py-0.5 rounded-full">
                    {entries.length} insights
                  </span>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/25 hover:text-white/55 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="px-5 py-3 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2 bg-white/4 rounded-lg px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-white/20" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Galileo's insights..."
                    className="bg-transparent flex-1 outline-none text-sm text-white/65 placeholder:text-white/18"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="text-white/20 hover:text-white/50">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Messages — chronological, newest at bottom */}
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                {filtered.length === 0 ? (
                  <p className="text-white/25 text-sm text-center py-10">No insights found.</p>
                ) : (
                  filtered.map((entry, i) => (
                    <div key={i} className="flex gap-3 group">
                      {/* Icon column */}
                      <div className="shrink-0 mt-1">
                        <div className="w-6 h-6 rounded-full border border-[#D4A853]/20 flex items-center justify-center">
                          <Sparkles className="w-3 h-3 text-[#D4A853]/50" />
                        </div>
                      </div>

                      {/* Bubble */}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] tracking-[0.15em] uppercase text-[#D4A853]/35">
                            {getLabel(entry.fieldKey)}
                          </span>
                          {/* Replay button */}
                          <button
                            onClick={() => handleReplay(entry)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[9px] text-white/30 hover:text-white/55"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            {replayingKey === entry.fieldKey ? 'Replaying...' : 'Replay'}
                          </button>
                        </div>
                        <div
                          className="rounded-2xl rounded-tl-sm px-4 py-3"
                          style={{
                            background: 'rgba(212,168,83,0.055)',
                            border: '1px solid rgba(212,168,83,0.1)',
                          }}
                        >
                          <p className="text-sm text-white/70 leading-relaxed font-light">{entry.message}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}