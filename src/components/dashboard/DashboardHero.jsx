import React, { useMemo } from 'react';
import { PlayCircle, Plus } from 'lucide-react';
import { loadJournal } from '@/lib/bie';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatLastUpdated(timestamp) {
  if (!timestamp) return null;
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DashboardHero({ businessName, businessId, isRecalculating, onReplayBriefing, onAddBusiness, personName = 'Guest' }) {
  const greeting = getGreeting();

  const lastUpdated = useMemo(() => {
    if (!businessId) return null;
    const journal = loadJournal(businessId);
    if (journal.length) return journal[journal.length - 1].timestamp;
    return null;
  }, [businessId]);

  const updatedText = formatLastUpdated(lastUpdated);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          {greeting}, {personName}.
        </h1>
        <div className="flex items-center gap-2 mt-2">
          {isRecalculating ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <p className="text-[14px] text-muted-foreground">Galileo is updating your intelligence…</p>
            </>
          ) : (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <p className="text-[14px] text-muted-foreground">
                {updatedText ? `Last updated ${updatedText}` : 'Galileo has updated your intelligence'}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onAddBusiness}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] font-medium border border-white/10 text-foreground hover:bg-white/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Business
        </button>
        <button
          onClick={onReplayBriefing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-semibold border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
        >
          <PlayCircle className="w-4 h-4" />
          Executive Briefing
        </button>
      </div>
    </div>
  );
}