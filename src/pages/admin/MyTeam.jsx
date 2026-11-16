import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Search, MoreHorizontal, Loader2, Shield, X, Pencil, Trash2, Ban, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import TeamPermissions from '@/components/admin/TeamPermissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const TABS = [
  { id: 'members', label: 'Members' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'activity', label: 'Activity Feed' },
];

const ROLE_COLORS = {
  owner: 'border-primary/40 bg-primary/15 text-primary',
  admin: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  super_admin: 'border-red-500/30 bg-red-500/15 text-red-400',
  advisor: 'border-purple-500/30 bg-purple-500/15 text-purple-400',
  team_member: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-400',
  user: 'border-border bg-secondary text-muted-foreground',
};

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  super_admin: 'Super Admin',
  advisor: 'Expert / Advisor',
  team_member: 'Team Member',
  user: 'User',
};

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
const avatarColor = (name) => {
  const colors = ['#D4A853', '#00D4FF', '#a855f7', '#22c55e', '#ef4444'];
  return colors[(name || '?').charCodeAt(0) % colors.length];
};
const relativeTime = (iso) => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return `${Math.floor(h / 24)}d ago`;
};

// ─── Invite Modal ────────────────────────────────────────────────────────────
function InviteModal({ onClose, onSaved }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('teamInvites', {
        action: 'createInvite',
        data: { email: email.trim(), role },
      });
      if (res.data?.error) {
        setError(res.data.error);
        setSaving(false);
        return;
      }
      await base44.users.inviteUser(email.trim(), role);
      onSaved();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to send invite');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Add Team Member</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email Address</label>
            <input
              value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com"
              className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Platform Role</label>
            <select
              value={role} onChange={e => setRole(e.target.value)}
              className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
            >
              <option value="user">Team Member</option>
              <option value="admin">Admin</option>
              <option value="advisor">Expert / Advisor</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" onClick={handleInvite} disabled={saving || !email.trim()}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Send Invite
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Role Edit Modal ─────────────────────────────────────────────────────────
function RoleEditModal({ member, onClose, onSaved }) {
  const [role, setRole] = useState(member.role || 'user');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.User.update(member.id, { role });
      onSaved();
      onClose();
    } catch (e) {
      console.error('Role update failed:', e);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Change Role — {member.full_name || member.email}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Platform Role</label>
            <select
              value={role} onChange={e => setRole(e.target.value)}
              className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
            >
              <option value="user">Team Member</option>
              <option value="admin">Admin</option>
              <option value="advisor">Expert / Advisor</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Action Menu ─────────────────────────────────────────────────────────────
function ActionMenu({ member, currentUser, onEditRole, onRemove }) {
  const [open, setOpen] = useState(false);
  const isSelf = member.id === currentUser?.id;
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canEdit = isSuperAdmin || (currentUser?.role === 'admin' && member.role !== 'super_admin' && member.role !== 'admin');

  if (isSelf) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-40 bg-popover border border-border rounded-xl shadow-xl py-1 overflow-hidden">
            {canEdit && (
              <button onClick={() => { onEditRole(member); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors text-foreground">
                <Pencil className="w-3.5 h-3.5" /> Change Role
              </button>
            )}
            {!isSelf && (
              <button onClick={() => { onRemove(member); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary transition-colors text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MyTeam() {
  const { user, role } = useAuth();
  const isSuperAdmin = role === 'super_admin' || user?.role === 'super_admin';
  const isAdmin = isSuperAdmin || role === 'admin' || user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('members');
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      let allUsers = await base44.entities.User.list('-created_date', 200);

      if (isSuperAdmin) {
        // Super admin sees all users across all orgs
        setMembers(allUsers);
      } else if (isAdmin) {
        // Admin sees non-super_admin users in their org
        setMembers(allUsers.filter(u => u.role !== 'super_admin'));
      } else {
        // Regular owner/team_member sees only themselves (permission inheritance)
        setMembers(allUsers.filter(u => u.id === user?.id));
      }
    } catch (e) {
      console.error('Failed to load team:', e);
    }
    setLoading(false);
  }, [isSuperAdmin, isAdmin, user?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRemove = async (member) => {
    if (!confirm(`Remove ${member.full_name || member.email} from the platform?`)) return;
    try {
      await base44.entities.User.delete(member.id);
      loadMembers();
    } catch (e) {
      console.error('Failed to remove user:', e);
    }
  };

  // ── Invites ──────────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { data: invites = [], refetch: refetchInvites } = useQuery({
    queryKey: ['team-invites'],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('teamInvites', { action: 'listInvites' });
        return res.data?.invites || [];
      } catch { return []; }
    },
    initialData: [],
    enabled: isAdmin,
  });

  const handleResendInvite = async (invite) => {
    const res = await base44.functions.invoke('teamInvites', { action: 'resendInvite', data: { invite_id: invite.id } });
    if (res.data?.success) {
      toast.success(`Invite resent to ${invite.invited_email}`);
      refetchInvites();
    } else {
      toast.error(res.data?.error || 'Failed to resend');
    }
  };

  const handleCancelInvite = async (invite) => {
    if (!confirm(`Cancel invite for ${invite.invited_email}?`)) return;
    const res = await base44.functions.invoke('teamInvites', { action: 'cancelInvite', data: { invite_id: invite.id } });
    if (res.data?.success) {
      toast.success('Invite cancelled');
      refetchInvites();
    } else {
      toast.error(res.data?.error || 'Failed to cancel');
    }
  };

  const pendingInvites = (invites || []).filter(i => i.status === 'pending');
  const expiredInvites = (invites || []).filter(i => i.status === 'expired' || i.status === 'cancelled');

  const filtered = members.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const currentUser = members.find(m => m.id === user?.id);
  const others = filtered.filter(m => m.id !== user?.id);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">My Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperAdmin
              ? 'Full platform access — manage all users and organizations.'
              : isAdmin
              ? 'Manage your organization members and their access levels.'
              : 'View your team membership and assigned permissions.'}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowInvite(true)}>
            <UserPlus className="w-4 h-4" /> Add Team Member
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'members' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members..."
              className="w-full h-10 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50"
            />
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading team...</p>
            </div>
          ) : (
            <>
              {/* Current User Row */}
              {currentUser && (
                <div className="rounded-xl border border-primary/20 bg-card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-background shrink-0"
                    style={{ background: '#D4A853' }}>
                    {initials(user?.full_name || user?.email || 'U')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{user?.full_name || 'Current User'}</p>
                      <span className="text-xs bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground">You</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{user?.email || 'user@example.com'}</p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-xs font-medium">{ROLE_LABELS[currentUser.role] || currentUser.role}</p>
                    <p className="text-[10px] text-muted-foreground">Role</p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-xs font-medium">{relativeTime(currentUser.updated_date)}</p>
                    <p className="text-[10px] text-muted-foreground">Last Active</p>
                  </div>
                  <span className="text-xs font-medium border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 rounded-full px-2.5 py-0.5">
                    Active
                  </span>
                </div>
              )}

              {/* Other Members */}
              {others.map(m => {
                const color = avatarColor(m.full_name || m.email);
                return (
                  <div key={m.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 hover:border-border/80 transition-colors">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-background shrink-0"
                      style={{ background: color }}>
                      {initials(m.full_name || m.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{m.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <div className="mr-4">
                      <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${ROLE_COLORS[m.role] || ROLE_COLORS.user}`}>
                        {ROLE_LABELS[m.role] || m.role}
                      </span>
                    </div>
                    <div className="text-right mr-4">
                      <p className="text-xs font-medium">{relativeTime(m.updated_date)}</p>
                      <p className="text-[10px] text-muted-foreground">Last Active</p>
                    </div>
                    <ActionMenu
                      member={m}
                      currentUser={user}
                      onEditRole={setEditingRole}
                      onRemove={handleRemove}
                    />
                  </div>
                );
              })}

              {!loading && others.length === 0 && !search && (
                <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
                  <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">No team members yet</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin ? 'Add team members to collaborate on assessments and action plans.' : 'An admin can add members to your team.'}
                  </p>
                </div>
              )}

              {/* ── Pending Invites ────────────────────────────────────────── */}
              {isAdmin && pendingInvites.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" /> Pending Invites
                    <span className="text-[11px] font-normal text-muted-foreground">({pendingInvites.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {pendingInvites.map(inv => (
                      <div key={inv.id} className="rounded-xl border border-amber-500/20 bg-card p-4 flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                          {initials(inv.invited_email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{inv.invited_email}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Role: {(ROLE_LABELS[inv.invited_role] || inv.invited_role)}</span>
                            <span>·</span>
                            <span>Invited by: {inv.invited_by || '—'}</span>
                            <span>·</span>
                            <span>{relativeTime(inv.created_at)}</span>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium border border-amber-500/30 bg-amber-500/15 text-amber-400 rounded-full px-2.5 py-0.5">
                          Pending
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleResendInvite(inv)}>
                            <RefreshCw className="w-3 h-3" /> Resend
                          </Button>
                          <button onClick={() => handleCancelInvite(inv)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded" title="Cancel invite">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Expired / Cancelled Invites ─────────────────────────────── */}
              {isAdmin && expiredInvites.length > 0 && (
                <div className="mt-4">
                  <details className="group">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none">
                      Expired / Cancelled ({expiredInvites.length}) ▸
                    </summary>
                    <div className="space-y-1.5 mt-2">
                      {expiredInvites.map(inv => (
                        <div key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 text-xs">
                          <span className="text-muted-foreground">{inv.invited_email}</span>
                          <span className="text-[10px] font-medium border border-border rounded-full px-1.5 py-0.5 text-muted-foreground">
                            {inv.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'permissions' && <TeamPermissions />}

      {activeTab === 'activity' && (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
          <p className="text-lg font-semibold">Activity Feed</p>
          <p className="text-sm text-muted-foreground">Coming soon — full event history for your team.</p>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onSaved={loadMembers} />
      )}

      {/* Role Edit Modal */}
      {editingRole && (
        <RoleEditModal
          member={editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={loadMembers}
        />
      )}
    </div>
  );
}