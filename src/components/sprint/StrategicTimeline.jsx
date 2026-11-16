import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, Calendar, Target, Flag } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const MONTHS = [
  { num: 1, label: 'Month 1 — Foundation', weeks: [1, 2, 3, 4] },
  { num: 2, label: 'Month 2 — Acceleration', weeks: [5, 6, 7, 8] },
  { num: 3, label: 'Month 3 — Optimization', weeks: [9, 10, 11, 12] },
];

const STATUS_STYLES = {
  completed:   { bar: 'bg-emerald-400/80', badge: 'text-emerald-400 bg-emerald-500/10' },
  in_progress: { bar: 'bg-amber-400/80', badge: 'text-amber-400 bg-amber-500/10' },
  blocked:     { bar: 'bg-red-400/80', badge: 'text-red-400 bg-red-500/10' },
  not_started: { bar: 'bg-muted-foreground/40', badge: 'text-muted-foreground bg-secondary' },
};

const WEEK_WIDTH = 48; // px per week column

export default function StrategicTimeline() {
  // Phase 6.9 — the Sprint shown here must belong to the ACTIVE business. The key
  // previously had no business identity, making this one global cache entry for
  // every business on the account.
  const { activeContext } = useAuth();
  const activeBusinessId = activeContext?.businessId || null;

  const { data: sprintRes, isLoading: sprintLoading } = useQuery({
    queryKey: ['sprint-timeline-data', activeBusinessId],
    queryFn: () => base44.functions.invoke('ninetyDaySprint', {
      action: 'getSprint',
      active_business_id: activeBusinessId,
    }),
    staleTime: 30000,
  });

  const { data: timelineRes, isLoading: timelineLoading } = useQuery({
    queryKey: ['galileo-strategic-timeline', activeBusinessId],
    queryFn: () => base44.functions.invoke('galileoOpportunityEngine', {
      action: 'getStrategicTimeline',
      data: { active_business_id: activeBusinessId },
    }),
    staleTime: 60000,
  });

  const isLoading = sprintLoading || timelineLoading;

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Loading timeline...</p>
      </div>
    );
  }

  const tasks = (sprintRes?.data?.tasks || []).filter(t => !t.is_deleted && t.task_type === 'main_task');
  const timeline = timelineRes?.data?.timeline || [];

  if (tasks.length === 0 && timeline.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No strategic activity yet.</p>
        <p className="text-xs mt-1">Generate opportunities to start your transformation timeline.</p>
      </div>
    );
  }

  const allWeeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Strategic Timeline</h3>
        <p className="text-xs text-muted-foreground">Your 90-day execution plan</p>
      </div>

      {/* Gantt Chart */}
      <div className="rounded-xl border border-border overflow-hidden" style={{ backgroundColor: '#141418' }}>
        <div className="flex">
          {/* Fixed left column */}
          <div className="w-52 shrink-0 border-r border-border bg-card z-10">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-border bg-secondary/40">
              <span className="text-[11px] font-semibold text-muted-foreground">Task / Milestone</span>
            </div>
            {/* Week header placeholder */}
            <div className="px-4 py-1.5 border-b border-border bg-secondary/20" />
            {/* Task labels */}
            <div>
              {tasks.map(task => {
                const styles = STATUS_STYLES[task.status] || STATUS_STYLES.not_started;
                return (
                  <div key={task.id} className="px-3 py-2 border-b border-border/30 flex items-center gap-2 h-[36px]">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.bar}`} />
                    <p className={`text-[11px] font-medium truncate ${task.status === 'completed' ? 'line-through opacity-60' : ''}`}>
                      {task.title}
                    </p>
                  </div>
                );
              })}
              {timeline.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-secondary/30 border-y border-border h-[32px] flex items-center">
                    <div className="flex items-center gap-2">
                      <Flag className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-semibold text-primary uppercase">Milestones</span>
                    </div>
                  </div>
                  {timeline.map(entry => (
                    <div key={entry.id} className="px-3 py-2 border-b border-border/30 flex items-center gap-2 h-[36px]">
                      <Target className="w-3 h-3 text-accent shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate">{entry.title}</p>
                        <p className="text-[9px] text-muted-foreground">{entry.event}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Scrollable chart area */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ minWidth: allWeeks.length * WEEK_WIDTH }}>
              {/* Header — Months */}
              <div className="flex border-b border-border">
                {MONTHS.map(m => (
                  <div
                    key={m.num}
                    className="border-r border-border last:border-r-0 flex flex-col items-center justify-center py-2.5"
                    style={{ width: m.weeks.length * WEEK_WIDTH }}
                  >
                    <span className="text-[11px] font-semibold text-foreground">{m.label}</span>
                  </div>
                ))}
              </div>

              {/* Week sub-header */}
              <div className="flex border-b border-border">
                {allWeeks.map(w => (
                  <div
                    key={w}
                    className="border-r border-border/30 last:border-r-0 text-center py-1.5"
                    style={{ width: WEEK_WIDTH }}
                  >
                    <span className="text-[9px] font-medium text-muted-foreground">W{w}</span>
                  </div>
                ))}
              </div>

              {/* Timeline rows */}
              <div>
                {tasks.map(task => {
                  const week = task.week_number || 1;
                  const styles = STATUS_STYLES[task.status] || STATUS_STYLES.not_started;

                  return (
                    <div key={task.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors h-[36px] relative">
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex">
                        {allWeeks.map(w => (
                          <div
                            key={w}
                            className="border-r border-border/10 last:border-r-0"
                            style={{ width: WEEK_WIDTH }}
                          />
                        ))}
                      </div>
                      {/* The bar */}
                      <div
                        className={`absolute top-1.5 h-5 rounded-full ${styles.bar} border border-white/10 flex items-center px-2`}
                        style={{
                          left: (week - 1) * WEEK_WIDTH + 4,
                          width: Math.max(WEEK_WIDTH - 8, 60),
                          maxWidth: `calc(100% - ${(week - 1) * WEEK_WIDTH + 8}px)`,
                        }}
                      >
                        <span className="text-[9px] font-medium text-white truncate">
                          {task.title}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Milestone rows */}
                {timeline.length > 0 && (
                  <>
                    {timeline.map(entry => {
                      const eventDate = entry.date ? new Date(entry.date) : null;
                      let week = 1;
                      if (eventDate) {
                        const sprintStart = tasks.length > 0
                          ? new Date(sprintRes?.data?.sprint?.start_date || sprintRes?.data?.sprint?.created_at || Date.now())
                          : new Date();
                        const diffDays = Math.floor((eventDate - sprintStart) / (1000 * 60 * 60 * 24));
                        week = Math.max(1, Math.min(12, Math.ceil(diffDays / 7)));
                      }

                      return (
                        <div key={entry.id} className="border-b border-border/30 h-[36px] relative">
                          <div className="absolute inset-0 flex">
                            {allWeeks.map(w => (
                              <div
                                key={w}
                                className="border-r border-border/10 last:border-r-0"
                                style={{ width: WEEK_WIDTH }}
                              />
                            ))}
                          </div>
                          <div
                            className="absolute top-1.5 flex items-center justify-center"
                            style={{ left: (week - 1) * WEEK_WIDTH + WEEK_WIDTH / 2 - 8 }}
                          >
                            <div className="w-4 h-4 rotate-45 bg-accent/80 border border-accent rounded-sm" />
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}