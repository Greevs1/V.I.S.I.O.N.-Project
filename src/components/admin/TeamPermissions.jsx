import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Loader2, Save, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const PERMISSION_GROUPS = [
  {
    label: 'Intelligence Modules',
    items: [
      { id: 'view_iq', label: 'View IQ™ Dashboard', default: true },
      { id: 'iq_scorecard', label: 'IQ™ Score Card', default: true },
      { id: 'gap_analysis', label: 'Gap Analysis Cards (Profit, Value, Tax, Ops)', default: true },
      { id: 'cost_inaction', label: 'Cost of Inaction Over Time', default: true },
      { id: 'strategic_insights', label: 'Strategic Insights & Observations', default: true },
    ]
  },
  {
    label: 'Advisory Hub',
    items: [
      { id: 'command_center', label: 'Command Center', default: true },
      { id: 'advisory_hub', label: 'Advisory Hub', default: true },
      { id: 'exit_readiness', label: 'Exit Readiness', default: false },
      { id: 'ma_simulator', label: 'M&A Simulator', default: false },
      { id: 'resource_library', label: 'Resource Library', default: true },
    ]
  },
  {
    label: 'Business Owner GPS™',
    items: [
      { id: 'view_gps', label: 'View Business Owner GPS™', default: true },
      { id: 'freedom_score', label: 'Current Position (Freedom Score & Date)', default: true },
      { id: 'next_best_move', label: 'Next Best Move™ & 90-Day Plan', default: false },
      { id: 'wealth_trajectory', label: 'Wealth Trajectory Projections', default: false },
    ]
  },
  {
    label: 'Assessments',
    items: [
      { id: 'profit_gap', label: 'Profit Gap Assessment', default: true },
      { id: 'value_gap', label: 'Value Gap Assessment', default: true },
      { id: 'tax_gap', label: 'Tax Gap Engine', default: false },
      { id: 'ops_gap', label: 'Operations Gap Assessment', default: false },
      { id: 'freedom_assessment', label: 'Freedom Assessment', default: false },
      { id: 'recast_ebitda', label: 'Recast EBITDA Engine', default: false },
    ]
  },
  {
    label: 'Documents & Resources',
    items: [
      { id: 'data_room', label: 'Data Room', default: true },
      { id: 'agreements', label: 'Agreements', default: true },
      { id: 'document_requests', label: 'Document Requests', default: true },
      { id: 'worksheets', label: 'Worksheets', default: true },
    ]
  },
];

export default function TeamPermissions() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch all manageable users: super_admin sees all, admin sees non-super_admin, others see only themselves
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const allUsers = await base44.entities.User.list('-created_date', 200);
      const currentUser = await base44.auth.me();
      const currentRole = currentUser?.role || 'user';

      if (currentRole === 'super_admin') {
        // Super admin can manage all users' permissions
        setUsers(allUsers);
      } else if (currentRole === 'admin') {
        // Admin can manage non-super-admin users
        setUsers(allUsers.filter(u => u.role !== 'super_admin' && u.id !== currentUser?.id));
      } else {
        // Regular users can only see themselves
        setUsers(allUsers.filter(u => u.role === 'user' || u.role === 'team_member'));
      }
    } catch (e) {
      console.warn('Failed to load users:', e);
    }
    setLoadingUsers(false);
  };

  // Load permissions when user selected
  useEffect(() => {
    if (!selectedUserId) return;
    loadPermissions(selectedUserId);
  }, [selectedUserId]);

  const loadPermissions = async (userId) => {
    setLoadingPerms(true);
    setSaved(false);
    try {
      const existing = await base44.entities.UserPermission.filter({ user_id: userId });
      if (existing.length > 0) {
        setPermissions(existing[0].permissions || defaults());
      } else {
        setPermissions(defaults());
      }
    } catch {
      setPermissions(defaults());
    }
    setLoadingPerms(false);
  };

  const defaults = () => {
    const p = {};
    PERMISSION_GROUPS.forEach(g => g.items.forEach(i => { p[i.id] = i.default; }));
    return p;
  };

  const toggle = (id) => setPermissions(p => ({ ...p, [id]: !p[id] }));
  const toggleAllInGroup = (groupItems, on) => {
    setPermissions(p => {
      const next = { ...p };
      groupItems.forEach(item => { next[item.id] = on; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setSaved(false);
    try {
      const selectedUser = users.find(u => u.id === selectedUserId);
      const existing = await base44.entities.UserPermission.filter({ user_id: selectedUserId });
      if (existing.length > 0) {
        await base44.entities.UserPermission.update(existing[0].id, {
          permissions,
          user_email: selectedUser?.email || '',
        });
      } else {
        await base44.entities.UserPermission.create({
          user_id: selectedUserId,
          user_email: selectedUser?.email || '',
          permissions,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Failed to save permissions:', e);
    }
    setSaving(false);
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold">User-Specific Permissions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure exactly what modules each team member can access.
        </p>
      </div>

      {/* User Selector */}
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Select team member:</p>
        {loadingUsers ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <select
            value={selectedUserId || ''}
            onChange={e => setSelectedUserId(e.target.value || null)}
            className="h-9 bg-secondary border border-border rounded-lg px-3 text-sm text-foreground outline-none focus:border-primary/50 cursor-pointer min-w-[220px]"
          >
            <option value="">— Select a user —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        )}
      </div>

      {/* Permissions Grid */}
      {selectedUser && !loadingPerms ? (
        <div className="space-y-6">
          {PERMISSION_GROUPS.map(group => {
            const allOn = group.items.every(i => permissions[i.id]);
            const anyOn = group.items.some(i => permissions[i.id]);
            return (
              <div key={group.label} className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <button
                    onClick={() => toggleAllInGroup(group.items, !allOn)}
                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    {allOn ? 'Disable all' : 'Enable all'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.items.map(item => {
                    const on = permissions[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggle(item.id)}
                        className="flex items-center gap-2 text-sm text-left hover:text-foreground transition-colors py-1"
                      >
                        {on
                          ? <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
                          : <Circle className="w-4 h-4 shrink-0 text-muted-foreground" />
                        }
                        <span className={on ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Permissions for {selectedUser?.full_name || selectedUser?.email}
            </Button>
            {saved && (
              <span className="text-xs text-emerald-400">✓ Saved</span>
            )}
          </div>
        </div>
      ) : selectedUserId && loadingPerms ? (
        <div className="glass rounded-xl p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading permissions...</p>
        </div>
      ) : !selectedUserId ? (
        <div className="glass rounded-xl p-12 text-center">
          <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Select a team member above to configure their permissions.</p>
        </div>
      ) : null}
    </div>
  );
}