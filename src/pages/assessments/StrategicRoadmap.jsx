import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Zap, Target, TrendingUp, Lock } from 'lucide-react';
import RoadmapLockedItem from '@/components/roadmap/RoadmapLockedItem';
import BookingModal from '@/components/sprint/BookingModal';
import { useMembership } from '@/lib/useMembership';
import { useAuth } from '@/lib/AuthContext';

const priorityColors = {
  Critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  High: 'bg-primary/10 text-primary border-primary/20',
  Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Low: 'bg-muted text-muted-foreground border-border',
};

const phaseConfig = {
  quick_win:    { icon: Zap,        label: 'Quick Wins',              timeline: '30 Days',    color: 'text-emerald-400' },
  strategic:    { icon: Target,     label: 'Strategic Improvements',  timeline: '90 Days',    color: 'text-primary' },
  long_term:    { icon: TrendingUp, label: 'Long-Term Value Creation', timeline: '12+ Months', color: 'text-accent' },
};

// ── V2: group value_creation_events into phase buckets ───────────────────────
function groupEventsByPhase(events) {
  const phases = { quick_win: [], strategic: [], long_term: [] };
  for (const e of events) {
    const bucket = e.phase || (e.priority_rank <= 3 ? 'quick_win' : e.priority_rank <= 6 ? 'strategic' : 'long_term');
    if (phases[bucket]) phases[bucket].push(e);
  }
  return phases;
}

export default function StrategicRoadmap() {
  const { isPaid } = useMembership();
  // Phase 6.9 — value creation is business-owned: key + payload both carry the
  // active business. This page previously read a single global cache entry that
  // resolved to the primary business (or a profile-wide union) regardless of the
  // business selected in the UI.
  const { activeContext } = useAuth();
  const activeBusinessId = activeContext?.businessId || null;
  const [bookingOpen, setBookingOpen] = useState(false);

  // V2: fetch value_creation_events — non-blocking, existing UI shown while loading
  const { data: events = [] } = useQuery({
    queryKey: ['valueCreationEvents', activeBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getValueCreationEvents',
        data: { businessId: activeBusinessId },
      });
      return res.data?.events || [];
    },
    initialData: [],
  });

  const hasV2Data = events.length > 0;
  const groupedEvents = hasV2Data ? groupEventsByPhase(events) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Strategic Sprint CTA */}
      {!isPaid && (
        <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(168,85,247,0.06) 100%)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <div className="flex items-center gap-3 mb-2">
            <Lock className="w-5 h-5" style={{ color: '#3b82f6' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#F5F5F5' }}>Unlock Your Complete Strategic Sprint</h3>
          </div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(245,245,245,0.5)' }}>
            See your full implementation schedule, prioritized opportunities, and custom sprint execution plan.
          </p>
          <button
            onClick={() => setBookingOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all"
            style={{ background: '#3b82f6', color: '#fff' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#2563eb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6'; }}
          >
            Schedule Discovery Call
          </button>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Strategic Sprint</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your personalized action plan to close gaps and unlock hidden value.
          </p>
        </div>
        {hasV2Data && (
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 mt-1">
            Personalized
          </Badge>
        )}
      </div>

      {hasV2Data ? (
        // ── V2: render from value_creation_events ─────────────────────────────
        Object.entries(phaseConfig).map(([phaseKey, config]) => {
          const phaseItems = groupedEvents[phaseKey];
          if (!phaseItems || phaseItems.length === 0) return null;
          const PhaseIcon = config.icon;

          // Free users: see first 1 item per phase, rest blurred
          const visibleItems = isPaid ? phaseItems : phaseItems.slice(0, 1);
          const lockedItems = isPaid ? [] : phaseItems.slice(1);

          return (
            <div key={phaseKey} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <PhaseIcon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div>
                  <h2 className={`text-lg font-semibold ${config.color}`}>{config.label}</h2>
                  <p className="text-xs text-muted-foreground">{config.timeline}</p>
                </div>
              </div>
              <div className="space-y-3 ml-5 border-l border-border pl-8">
                {visibleItems.map((item, i) => (
                  <div key={item.id || i} className="glass rounded-xl p-5">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-semibold">{item.title || item.event_name}</h3>
                      <Badge variant="outline" className={`text-[10px] ${priorityColors[item.priority] || priorityColors['Medium']}`}>
                        {item.priority || 'Medium'}
                      </Badge>
                    </div>
                    {/* Free users see title only, description gated */}
                    {isPaid ? (
                      <p className="text-xs text-muted-foreground mb-3">{item.description || item.explanation}</p>
                    ) : i > 0 ? (
                      <div className="relative mb-3">
                        <p className="text-xs text-muted-foreground blur-sm select-none">Implementation details available for members.</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-3">{item.description || item.explanation}</p>
                    )}
                    <div className="flex gap-4 text-[10px] text-muted-foreground">
                      {item.estimated_value_impact && (
                        <span>Est. Impact: <strong className="text-foreground">${(item.estimated_value_impact / 1000).toFixed(0)}K</strong></span>
                      )}
                      {item.gap_type && (
                        <span>Gap: <strong className="text-foreground">{item.gap_type}</strong></span>
                      )}
                      {item.status && (
                        <span>Status: <strong className="text-foreground capitalize">{item.status.replace(/_/g, ' ')}</strong></span>
                      )}
                    </div>
                  </div>
                ))}
                {lockedItems.length > 0 && (
                  <RoadmapLockedItem count={lockedItems.length} />
                )}
              </div>
            </div>
          );
        })
      ) : (
        // ── Empty state — no demo data shown to new users ─────────────────────
        <div className="glass rounded-xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <TrendingUp className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Your Sprint Is Being Built</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Complete one or more assessments to generate your personalized strategic sprint plan.
            Each assessment adds specific, prioritized action items tailored to your business.
          </p>
          <a
            href="/assessments/profit-gap"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Start Your First Assessment
          </a>
        </div>
      )}

      {/* Booking Modal */}
      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  );
}