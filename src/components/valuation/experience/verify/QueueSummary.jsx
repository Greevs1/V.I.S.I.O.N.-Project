/**
 * QueueSummary — Phase 13.3E.3
 * Compact summary header for the Verification Queue.
 */
import React from 'react';
import { AlertTriangle, Clock, UserCog, Pause, CheckCircle2, FileWarning, ShieldAlert } from 'lucide-react';

export default function QueueSummary({ summary }) {
  const s = summary || {};
  const stats = [
    { label: 'Open', value: s.total_open || 0, color: '#00D4FF' },
    { label: 'Critical', value: s.critical || 0, color: '#EF4444', icon: AlertTriangle },
    { label: 'High', value: s.high || 0, color: '#F59E0B' },
    { label: 'Waiting Client', value: s.waiting_on_client || 0, color: '#A855F7', icon: Clock },
    { label: 'Waiting Advisor', value: s.waiting_on_advisor || 0, color: '#00D4FF', icon: UserCog },
    { label: 'Deferred', value: s.deferred || 0, color: '#6B7280', icon: Pause },
    { label: 'Resolved Today', value: s.resolved_today || 0, color: '#22c55e', icon: CheckCircle2 },
    { label: 'Pub Blockers', value: s.publication_blockers || 0, color: '#EF4444', icon: ShieldAlert },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {stats.map((st) => {
        const Icon = st.icon;
        return (
          <div
            key={st.label}
            className="rounded-lg p-2.5"
            style={{ background: `${st.color}0d`, border: `1px solid ${st.color}26` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {Icon && <Icon className="w-3 h-3" style={{ color: st.color }} />}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{st.label}</span>
            </div>
            <p className="text-lg font-bold" style={{ color: st.color }}>{st.value}</p>
          </div>
        );
      })}
    </div>
  );
}