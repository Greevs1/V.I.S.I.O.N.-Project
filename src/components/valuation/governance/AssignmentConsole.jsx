/**
 * AssignmentConsole — Phase 13.3G
 *
 * Displays the valuation team at the top of each valuation. All permissions,
 * edit rights, and workflow ownership derive from these assignments.
 *
 * Shows: Lead Advisor, Assigned Advisors, and their responsibilities
 * (view, edit, review, publish). Includes a governance summary showing
 * locked fields and pending change requests.
 *
 * Data source: summary.assignments + summary.leadAdvisor (from getValuationSummary).
 * No new backend calls; uses data already loaded by the shell.
 */
import React, { useMemo } from 'react';
import { Crown, Eye, Pencil, CheckCircle, Upload, Lock, MessageSquareWarning, Users, Shield, Plus, RotateCcw, Archive } from 'lucide-react';

const PERM_GROUPS = [
  {
    label: 'Access',
    perms: [
      { key: 'can_view', icon: Eye, label: 'View' },
      { key: 'can_edit', icon: Pencil, label: 'Edit' },
    ],
  },
  {
    label: 'Review',
    perms: [
      { key: 'can_review', icon: CheckCircle, label: 'Review' },
    ],
  },
  {
    label: 'Publication',
    perms: [
      { key: 'can_publish', icon: Upload, label: 'Publish' },
    ],
  },
  {
    label: 'Lifecycle',
    perms: [
      { key: 'can_create_valuation', icon: Plus, label: 'Create' },
      { key: 'can_restore_valuation', icon: RotateCcw, label: 'Restore' },
      { key: 'can_archive_valuation', icon: Archive, label: 'Archive' },
    ],
  },
  {
    label: 'Administration',
    perms: [
      { key: 'can_manage_assignments', icon: Users, label: 'Manage Team' },
    ],
  },
];

function PermBadge({ permKey, enabled }) {
  const group = PERM_GROUPS.find((g) => g.perms.some((p) => p.key === permKey));
  const perm = group?.perms.find((p) => p.key === permKey);
  if (!perm) return null;
  const Icon = perm.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        enabled ? 'text-primary/90' : 'text-muted-foreground/40 line-through'
      }`}
      style={enabled ? { background: 'rgba(212,168,83,0.08)' } : { background: 'rgba(255,255,255,0.02)' }}
    >
      <Icon className="w-2.5 h-2.5" />
      {perm.label}
    </span>
  );
}

function TeamMemberCard({ member, isLead, governanceSummary }) {
  const name = member.advisor
    ? `${member.advisor.first_name || ''} ${member.advisor.last_name || ''}`.trim() || member.advisor.email
    : member.requestor_name || 'Unknown';
  const email = member.advisor?.email || '';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div
      className="rounded-lg p-3 flex items-start gap-3"
      style={{
        background: isLead ? 'rgba(212,168,83,0.04)' : 'rgba(255,255,255,0.015)',
        border: `1px solid ${isLead ? 'rgba(212,168,83,0.2)' : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: isLead ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.05)', color: isLead ? '#D4A853' : '#fff' }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate">{name}</p>
          {isLead && <Crown className="w-3.5 h-3.5 text-primary shrink-0" />}
        </div>
        {email && <p className="text-[11px] text-muted-foreground truncate">{email}</p>}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {PERM_GROUPS.flatMap((g) => g.perms).map((perm) => (
            <PermBadge key={perm.key} permKey={perm.key} enabled={!!member[perm.key]} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AssignmentConsole({ summary, governanceSummary, canManage }) {
  const assignments = summary?.assignments || [];
  const leadAdvisor = summary?.leadAdvisor;

  const { lead, advisors } = useMemo(() => {
    const leadAsg = assignments.find((a) => a.assignment_role === 'lead');
    const leadMember = leadAsg || (leadAdvisor ? {
      advisor: leadAdvisor,
      assignment_role: 'lead',
      can_view: true, can_edit: true, can_review: true, can_publish: true,
    } : null);
    const rest = assignments.filter((a) => a.assignment_role !== 'lead' && a.assignment_role !== 'owner');
    return { lead: leadMember, advisors: rest };
  }, [assignments, leadAdvisor]);

  if (!lead && advisors.length === 0) {
    return (
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <Users className="w-4 h-4 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No advisor assignments yet. Assign a lead advisor to begin.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary/70" />
          <h3 className="text-sm font-semibold text-foreground">Valuation Team</h3>
        </div>
        {governanceSummary && (governanceSummary.locked > 0 || governanceSummary.pendingRequests > 0) && (
          <div className="flex items-center gap-3 text-[11px]">
            {governanceSummary.locked > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Lock className="w-3 h-3" />
                {governanceSummary.locked} locked
              </span>
            )}
            {governanceSummary.pendingRequests > 0 && (
              <span className="flex items-center gap-1 text-amber-400/80">
                <MessageSquareWarning className="w-3 h-3" />
                {governanceSummary.pendingRequests} change request{governanceSummary.pendingRequests !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {lead && <TeamMemberCard member={lead} isLead={true} />}
        {advisors.map((a) => (
          <TeamMemberCard key={a.id || a.assigned_profile_id} member={a} isLead={false} />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
        All permissions, edit rights, and workflow ownership derive from these assignments.
        Business owners have read-only access and may request changes to locked fields.
      </p>
    </div>
  );
}