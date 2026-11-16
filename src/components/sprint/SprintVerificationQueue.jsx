/**
 * SprintVerificationQueue — Admin/Super Admin only.
 * Shows all sprints where needs_expert_review=true or status is pending/changes_requested.
 * Supports assigning a verifier from searchable user list.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  Shield, ShieldCheck, AlertTriangle, RefreshCw, Loader2,
  UserPlus, ExternalLink, X, Search, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';

const VERIFICATION_CONFIG = {
  galileo_verified_pending_expert: {
    label: 'Pending Expert Review',
    color: '#D4A853',
    bg: 'rgba(212,168,83,0.1)',
    border: 'rgba(212,168,83,0.25)',
    icon: Shield,
  },
  expert_changes_requested: {
    label: 'Changes Requested',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.25)',
    icon: AlertTriangle,
  },
  galileo_and_expert_verified: {
    label: 'Verified',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.1)',
    border: 'rgba(34,197,94,0.25)',
    icon: ShieldCheck,
  },
};

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return '—'; }
}

// ── Assign Verifier Modal ─────────────────────────────────────────────────────
function AssignVerifierModal({ sprint, onClose, onAssigned }) {
  const { supabaseProfile } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['all-users-for-verifier-assign'],
    queryFn: async () => {
      const users = await base44.asServiceRole.entities.User.list('-created_date', 200);
      const results = [];
      for (const u of users || []) {
        try {
          const res = await base44.functions.invoke('supabaseUserData', {
            action: 'getProfile',
            data: { _router_user_email: u.email },
          });
          const profile = res.data?.profile;
          const role = profile?.app_role || u.role;
          if (['expert_advisor', 'admin', 'super_admin'].includes(role)) {
            results.push({
              ...u,
              profile_id: profile?.id || null,
              app_role: role,
              specialties: profile?.specialties || [],
            });
          }
        } catch {
          // skip
        }
      }
      return results;
    },
    staleTime: 2 * 60 * 1000,
  });

  const filtered = allUsers.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  const handleAssign = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const clientName = sprint.business_name || sprint.client_name || sprint.path_title || 'a client';
      await base44.functions.invoke('assignSprintVerifier', {
        sprint_id: sprint.id,
        verifier_profile_id: selected.profile_id,
        verifier_name: selected.full_name || selected.email,
        verifier_email: selected.email,
        verifier_role: selected.app_role,
        verifier_base44_id: selected.id,
        assigned_by_profile_id: supabaseProfile?.id || null,
        client_name: clientName,
      });

      toast.success(`Assigned to ${selected.full_name || selected.email}`);
      onAssigned();
      onClose();
    } catch (err) {
      toast.error('Failed to assign verifier');
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Assign Verifier</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{sprint.path_title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50"
              autoFocus
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Showing expert_advisor, admin, and super_admin roles only</p>
        </div>

        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              {search ? 'No users match your search.' : 'No eligible users found.'}
            </p>
          )}
          {!isLoading && filtered.map(u => {
            const isSelected = selected?.id === u.id;
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-secondary/50'
                }`}
                onClick={() => setSelected(u)}
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <span className="text-[10px] text-muted-foreground capitalize">{u.app_role}</span>
                  {u.specialties?.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/70 truncate">{u.specialties.slice(0, 2).join(', ')}</p>
                  )}
                </div>
                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{selected ? `${selected.full_name || selected.email} selected` : 'No user selected'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleAssign} disabled={!selected || saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {saving ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sprint Queue Row ──────────────────────────────────────────────────────────
function SprintQueueRow({ sprint, onAssign, onReview }) {
  const status = sprint.verification_status || 'galileo_verified_pending_expert';
  const cfg = VERIFICATION_CONFIG[status] || VERIFICATION_CONFIG.galileo_verified_pending_expert;
  const Icon = cfg.icon;

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{sprint.path_title || '90-Day Sprint'}</p>
            <span
              className="text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0"
              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <Icon className="w-2.5 h-2.5 inline mr-1" />
              {cfg.label}
            </span>
          </div>
          {sprint.business_name && (
            <p className="text-xs text-muted-foreground mt-0.5">{sprint.business_name}</p>
          )}
          {sprint.path_goal && (
            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{sprint.path_goal}</p>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {sprint.galileo_confidence && (
          <span>Galileo confidence: <span className="text-primary font-medium">{sprint.galileo_confidence}%</span></span>
        )}
        {sprint.review_requested_at && (
          <span>Requested: <span className="text-foreground">{fmtDate(sprint.review_requested_at)}</span></span>
        )}
        {sprint.last_galileo_update_at && (
          <span>Last AI update: <span className="text-foreground">{fmtDate(sprint.last_galileo_update_at)}</span></span>
        )}
        {sprint.assigned_verifier_name ? (
          <span>Verifier: <span className="text-emerald-400 font-medium">{sprint.assigned_verifier_name}</span></span>
        ) : (
          <span className="text-amber-400">No verifier assigned</span>
        )}
      </div>

      {/* Verification notes */}
      {sprint.verification_notes && (
        <div className="rounded-lg px-3 py-2 text-xs bg-amber-500/5 border border-amber-500/20 text-amber-300">
          <strong>Notes:</strong> {sprint.verification_notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => onReview(sprint)}>
          <ExternalLink className="w-3 h-3" />
          Review Sprint
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => onAssign(sprint)}>
          <UserPlus className="w-3 h-3" />
          {sprint.assigned_verifier_name ? 'Reassign' : 'Assign Verifier'}
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SprintVerificationQueue({ onReviewSprint }) {
  const queryClient = useQueryClient();
  const [assignTarget, setAssignTarget] = useState(null);
  const [showVerified, setShowVerified] = useState(false);

  const { data: sprints = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sprint-verification-queue'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSprintVerificationQueue', { mode: 'admin' });
      return res.data?.sprints || [];
    },
    staleTime: 30_000,
  });

  const needsReview = sprints.filter(s =>
    s.needs_expert_review === true ||
    s.verification_status === 'galileo_verified_pending_expert' ||
    s.verification_status === 'expert_changes_requested'
  );

  const verified = sprints.filter(s =>
    s.verification_status === 'galileo_and_expert_verified'
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-display font-bold">Sprint Verification Queue</h3>
            {needsReview.length > 0 && (
              <span className="text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
                {needsReview.length} pending
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Galileo-generated sprints awaiting expert human review</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading verification queue…</span>
        </div>
      ) : needsReview.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center space-y-2">
          <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400" />
          <p className="text-sm font-medium">All sprints reviewed</p>
          <p className="text-xs text-muted-foreground">No sprints currently need expert verification.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {needsReview.map(sprint => (
            <SprintQueueRow
              key={sprint.id}
              sprint={sprint}
              onAssign={setAssignTarget}
              onReview={onReviewSprint}
            />
          ))}
        </div>
      )}

      {/* Recently Verified (collapsible) */}
      {verified.length > 0 && (
        <div>
          <button
            onClick={() => setShowVerified(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {showVerified ? 'Hide' : 'Show'} recently verified ({verified.length})
          </button>
          {showVerified && (
            <div className="space-y-3 mt-3">
              {verified.slice(0, 5).map(sprint => (
                <SprintQueueRow
                  key={sprint.id}
                  sprint={sprint}
                  onAssign={setAssignTarget}
                  onReview={onReviewSprint}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assign Verifier Modal */}
      {assignTarget && (
        <AssignVerifierModal
          sprint={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            queryClient.invalidateQueries({ queryKey: ['sprint-verification-queue'] });
          }}
        />
      )}
    </div>
  );
}