/**
 * JourneyTranscriptDrawer
 *
 * Floating button that opens a slide-up panel showing all Galileo coaching
 * messages from the current session. Users can replay any explanation.
 * Searchable by keyword.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Search } from 'lucide-react';
import { getTranscript } from '@/lib/journeyTranscript';

export default function JourneyTranscriptDrawer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState([]);

  // Refresh transcript whenever drawer opens, and check count on interval so button appears
  const [hasEntries, setHasEntries] = useState(false);
  useEffect(() => {
    const check = () => setHasEntries(getTranscript().length > 0);
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open) setEntries(getTranscript());
  }, [open]);

  const filtered = query.trim()
    ? entries.filter(e => e.message.toLowerCase().includes(query.toLowerCase()))
    : entries;

  if (!hasEntries && !open) return null;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium shadow-lg transition-all hover:scale-105"
        style={{ background: 'rgba(212,168,83,0.12)', border: '1px solid rgba(212,168,83,0.25)', color: 'rgba(212,168,83,0.8)' }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Journey Transcript
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60"
              onClick={() => setOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
              style={{ background: '#0A0A0A', border: '1px solid rgba(212,168,83,0.15)', maxHeight: '70vh' }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/10" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/6">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4A853]/60" />
                  <p className="text-sm font-semibold text-white/80">Galileo · Journey Transcript</p>
                  <span className="text-[10px] text-white/25 bg-white/5 px-2 py-0.5 rounded-full">{entries.length} explanations</span>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="px-5 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-white/25" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search explanations..."
                    className="bg-transparent flex-1 outline-none text-sm text-white/70 placeholder:text-white/20"
                  />
                </div>
              </div>

              {/* Entries */}
              <div className="overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: 'calc(70vh - 140px)' }}>
                {filtered.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-8">No explanations found.</p>
                ) : (
                  filtered.map((entry, i) => (
                    <div key={i} className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-[0.18em] text-[#D4A853]/30">
                        {entry.fieldKey.replace(/_/g, ' ')}
                      </p>
                      <div className="rounded-xl px-4 py-3"
                        style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.12)' }}>
                        <p className="text-sm text-white/65 leading-relaxed font-light">{entry.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}