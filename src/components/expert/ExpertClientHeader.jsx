/**
 * ExpertClientHeader — workspace header for Expert Advisor Portal client view.
 * iqScore is passed in from ClientDetailView (resolved by ExpertClientDashboard),
 * so the header always shows the exact same IQ score as the IQ Dashboard tab.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Building, Mail } from 'lucide-react';

const PERM_LABELS = {
  assessments: 'Assessments', documents: 'Documents', resources: 'Resources',
  sprints: '90-Day Sprints', outcome_tracking: 'Outcome Tracking',
  opportunities: 'Opportunities', strategy_expansions: 'Strategy',
  freedom_projections: 'Freedom', galileo_summary: 'Galileo', notes: 'Notes',
};

export default function ExpertClientHeader({ accessRecord, iqScore }) {
  const clientProfileId = accessRecord.client_profile_id;

  const { data: sprintData } = useQuery({
    queryKey: ['expert-header-sprint', clientProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getSprintForProfile',
        data: { profile_id: clientProfileId },
      });
      return res.data || {};
    },
    enabled: !!clientProfileId,
    staleTime: 120000,
  });

  const { data: profileData } = useQuery({
    queryKey: ['expert-header-profile', clientProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseProfileData', {
        action: 'getProfile',
        target_profile_id: clientProfileId,
      });
      return res.data?.profile || null;
    },
    enabled: !!clientProfileId,
    staleTime: 120000,
  });

  const sprint = sprintData?.sprint || null;
  const sprintProgress = sprint?.progress_percent ?? null;
  const freedomDate = profileData?.freedom_date || null;
  const industry = profileData?.industry || null;
  const lastActivity = accessRecord.updated_at || accessRecord.created_at;

  const perms = accessRecord.permissions || {};
  const activePerms = Object.entries(PERM_LABELS)
    .filter(([key]) => perms[key] === true)
    .map(([, label]) => label);

  const initials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div className="glass-gold rounded-2xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-start gap-4 p-5">
        <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-primary">{initials(accessRecord.client_name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-display font-bold">{accessRecord.client_name || '—'}</h2>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">
              Read-Only Access
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {accessRecord.client_email && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="w-3 h-3" /> {accessRecord.client_email}
              </span>
            )}
            {accessRecord.business_name && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Building className="w-3 h-3" /> {accessRecord.business_name}
              </span>
            )}
            {industry && <span className="text-xs text-muted-foreground">{industry}</span>}
          </div>
          {lastActivity && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Last updated {new Date(lastActivity).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border/50 divide-x divide-border/50">
        {/* IQ Score — same value as IQ Dashboard tab */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">IQ Score</p>
          {iqScore ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-primary">{Math.round(iqScore)}</span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>

        {/* Sprint Progress */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Sprint Progress</p>
          {sprint ? (
            <div className="space-y-1">
              <span className="text-xl font-bold text-foreground">{sprintProgress}%</span>
              <div className="w-full bg-secondary rounded-full h-1">
                <div className="bg-primary h-1 rounded-full" style={{ width: `${sprintProgress}%` }} />
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No active sprint</span>
          )}
        </div>

        {/* Freedom Date */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Freedom Date</p>
          {freedomDate ? (
            <span className="text-sm font-semibold text-emerald-400">{freedomDate}</span>
          ) : (
            <span className="text-sm text-muted-foreground">Not calculated</span>
          )}
        </div>

        {/* Permissions */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Your Access</p>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-1.5 py-0.5">IQ Dashboard</span>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-1.5 py-0.5">Activity</span>
            {activePerms.slice(0, 3).map(p => (
              <span key={p} className="text-[9px] bg-primary/10 text-primary border border-primary/20 rounded-full px-1.5 py-0.5">{p}</span>
            ))}
            {activePerms.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{activePerms.length - 3} more</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}