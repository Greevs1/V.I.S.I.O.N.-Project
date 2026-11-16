/**
 * ExpertClientSprint — read-only 90-Day Sprint view for expert advisor portal.
 * Fetches sprint scoped to the selected client's profile_id.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, Target, ChevronDown, ChevronUp, CheckCircle, Circle, Clock } from 'lucide-react';
import SprintVerificationBadge from '@/components/sprint/SprintVerificationBadge';
import SprintVerificationControls from '@/components/sprint/SprintVerificationControls';

const PRIORITY_COLORS = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-amber-400',
  low: 'text-muted-foreground',
};

const STATUS_ICONS = {
  completed: CheckCircle,
  in_progress: Clock,
  not_started: Circle,
  blocked: Circle,
};

export default function ExpertClientSprint({ clientProfileId }) {
  const [expandedMonth, setExpandedMonth] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['expert-client-sprint', clientProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getSprintForProfile',
        data: { profile_id: clientProfileId },
      });
      return res.data || {};
    },
    enabled: !!clientProfileId,
    staleTime: 60000,
  });

  const sprint = data?.sprint || null;
  const tasks = data?.tasks || [];

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!sprint) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-2">
        <Target className="w-7 h-7 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No active 90-Day Sprint for this client.</p>
      </div>
    );
  }

  const mainTasks = tasks.filter(t => t.task_type === 'main_task');
  const completed = mainTasks.filter(t => t.status === 'completed').length;
  const progress = sprint.progress_percent ?? (mainTasks.length > 0 ? Math.round((completed / mainTasks.length) * 100) : 0);

  const months = [1, 2, 3].map(m => ({
    month: m,
    tasks: mainTasks.filter(t => t.month_number === m),
    label: m === 1 ? 'Foundation' : m === 2 ? 'Execution' : 'Optimization',
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">90-Day Sprint</p>
        <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">Read-Only</span>
      </div>

      {/* Verification Badge */}
      <SprintVerificationBadge sprint={sprint} />

      {/* Verification Controls — only shown to assigned verifier / admin */}
      <SprintVerificationControls
        sprint={sprint}
        fetchSprint={refetch}
        onVerified={refetch}
      />

      {/* Sprint header */}
      <div className="glass rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">{sprint.path_title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sprint.path_goal}</p>
          </div>
          <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 shrink-0">
            {sprint.status}
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-primary">{progress}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{completed} of {mainTasks.length} tasks completed</p>
        </div>
      </div>

      {/* Monthly task groups */}
      {months.map(({ month, tasks: mTasks, label }) => {
        const mCompleted = mTasks.filter(t => t.status === 'completed').length;
        const isExpanded = expandedMonth === month;
        return (
          <div key={month} className="glass rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20"
              onClick={() => setExpandedMonth(isExpanded ? null : month)}
            >
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{month}</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Month {month} — {label}</p>
                <p className="text-xs text-muted-foreground">{mCompleted}/{mTasks.length} tasks</p>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {isExpanded && mTasks.length > 0 && (
              <div className="border-t border-border divide-y divide-border">
                {mTasks.map(task => {
                  const Icon = STATUS_ICONS[task.status] || Circle;
                  const priorityClass = PRIORITY_COLORS[task.priority] || 'text-muted-foreground';
                  return (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${task.status === 'completed' ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                          {task.title}
                        </p>
                        {task.expected_outcome && (
                          <p className="text-xs text-muted-foreground mt-0.5">{task.expected_outcome}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-medium ${priorityClass}`}>{task.priority}</span>
                          {task.due_date && <span className="text-[10px] text-muted-foreground">Due {task.due_date}</span>}
                          {task.week_number && <span className="text-[10px] text-muted-foreground">Wk {task.week_number}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}