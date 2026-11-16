/**
 * IntelligenceGreeting — minimal personalized greeting for the IQ Dashboard.
 *
 * "Good Afternoon, Garrick." + "Last intelligence update: 2 minutes ago"
 * No buttons, no actions — purely informational. The briefing CTA lives
 * in the HeroStoryCard below.
 *
 * Phase 15.1: Enriched with Business Momentum. When momentum has a meaningful
 * description (not "unknown"), a subtle momentum line appears below the greeting.
 * Momentum is descriptive only — no score, no gauge, no badge.
 */
import React, { useMemo } from 'react';
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
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// Only show momentum when there's meaningful evidence (not "unknown")
function shouldShowMomentum(momentum) {
  if (!momentum) return false;
  if (momentum.direction === 'unknown' && momentum.consistency === 'unknown') return false;
  return true;
}

export default function IntelligenceGreeting({ personName = 'Guest', isRecalculating, businessId, momentum }) {
  const greeting = getGreeting();

  const lastUpdated = useMemo(() => {
    if (!businessId) return null;
    const journal = loadJournal(businessId);
    if (journal.length) return journal[journal.length - 1].timestamp;
    return null;
  }, [businessId]);

  const updatedText = formatLastUpdated(lastUpdated);
  const showMomentum = shouldShowMomentum(momentum);

  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">
        {greeting}, {personName}.
      </h1>
      <div className="flex items-center gap-2">
        {isRecalculating ? (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-[13px] text-muted-foreground">Galileo is updating your intelligence…</p>
          </>
        ) : (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
            <p className="text-[13px] text-muted-foreground">
              {updatedText ? `Last intelligence update: ${updatedText}` : 'Intelligence initialized'}
            </p>
          </>
        )}
      </div>
      {/* Phase 15.1: Business Momentum — descriptive only, subtle */}
      {showMomentum && momentum.summary && (
        <p className="text-[13px] text-muted-foreground/60 italic mt-0.5">
          {momentum.summary}
        </p>
      )}
    </div>
  );
}