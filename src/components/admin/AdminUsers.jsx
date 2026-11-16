import React, { useState } from 'react';
import {
  Search, Download, Upload, UserPlus, MoreHorizontal,
  Eye, UserCog, Trash2, Ban, X, Loader2, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const ROLE_COLORS = {
  owner: 'border-primary/40 bg-primary/15 text-primary',
  admin: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  super_admin: 'border-red-500/30 bg-red-500/15 text-red-400',
  advisor: 'border-purple-500/30 bg-purple-500/15 text-purple-400',
  expert: 'border-purple-500/30 bg-purple-500/15 text-purple-400',
  expert_advisor: 'border-purple-500/30 bg-purple-500/15 text-purple-400',
  team_member: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-400',
  user: 'border-border bg-secondary text-muted-foreground',
};
const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  super_admin: 'Super Admin',
  advisor: 'Expert / Advisor',
  expert: 'Expert / Advisor',
  expert_advisor: 'Expert Advisor',
  team_member: 'Team Member',
  user: 'User',
};
const typeColors = {
  Client:   'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  Prospect: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Expert:   'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Admin:    'bg-primary/15 text-primary border-primary/30',
};
const statusColors = {
  Active:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Pending:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Inactive: 'bg-red-500/15 text-red-400 border-red-500/30',
  Suspended:'bg-red-500/15 text-red-400 border-red-500/30',
};
const scoreColor = (s) => s >= 70 ? '#22c55e' : s >= 40 ? '#eab308' : '#ef4444';
const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
const relativeTime = (iso) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── Action Menu ─────────────────────────────────────────────────────────────
function ActionMenu({ user, onEdit, onDelete, onSuspend }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-48 bg-popover border border-border rounded-xl shadow-xl py-1 overflow-hidden">
            <MenuItem icon={Eye} label="View Details" onClick={() => { onEdit(user); setOpen(false); }} />
            <MenuItem icon={UserCog} label="Edit Profile & Role" onClick={() => { onEdit(user); setOpen(false); }} />
            <div className="my-1 border-t border-border" />
            <MenuItem icon={Ban} label="Suspend Account" className="text-amber-400" onClick={() => { onSuspend(user); setOpen(false); }} />
            <MenuItem icon={Trash2} label="Delete User" className="text-destructive" onClick={() => { onDelete(user); setOpen(false); }} />
          </div>
        </>
      )}
    </div>
  );
}
function MenuItem({ icon: IconComp, label, onClick, className = '' }) {
  const Icon = IconComp;
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary transition-colors ${className || 'text-foreground'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

// ─── Add / Edit User Modal ────────────────────────────────────────────────────
function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?.id;
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    role: user?.role || 'user',
    company: user?.company || '',
    client_type: user?.client_type || 'Client',
    status: user?.status || 'Active',
    lead_score: user?.lead_score ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    if (isEdit) {
      await base44.entities.User.update(user.id, form);
    } else {
      await base44.users.inviteUser(form.email, form.role);
    }
    onSaved();
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">{isEdit ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          {!isEdit && (
            <Field label="Email Address *">
              <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@company.com"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
            </Field>
          )}
          <Field label="Full Name">
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="John Doe"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </Field>
          <Field label="Company">
            <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Acme Corp"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform Role">
             <select value={form.role} onChange={e => set('role', e.target.value)}
               className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50">
               <option value="user">User</option>
               <option value="owner">Owner</option>
               <option value="team_member">Team Member</option>
               <option value="expert_advisor">Expert Advisor</option>
               <option value="admin">Admin</option>
               <option value="super_admin">Super Admin</option>
             </select>
            </Field>
            <Field label="Client Type">
              <select value={form.client_type} onChange={e => set('client_type', e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50">
                <option>Client</option>
                <option>Prospect</option>
                <option>Expert</option>
                <option>Admin</option>
              </select>
            </Field>
          </div>
          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select value={form.status} onChange={e => set('status', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50">
                  <option>Active</option>
                  <option>Pending</option>
                  <option>Inactive</option>
                  <option>Suspended</option>
                </select>
              </Field>
              <Field label="Lead Score (0–100)">
                <input type="number" min={0} max={100} value={form.lead_score} onChange={e => set('lead_score', Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
              </Field>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" onClick={handleSave} disabled={saving || (!isEdit && !form.email)}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            {isEdit ? 'Save Changes' : 'Send Invite'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminUsers({ onViewUser }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', user }
  const [selected, setSelected] = useState(new Set());

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => base44.entities.User.list('-created_date', 200),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const handleDelete = async (user) => {
    if (!confirm(`Delete ${user.full_name || user.email}? This cannot be undone.`)) return;
    await base44.entities.User.delete(user.id);
    refresh();
  };

  const handleSuspend = async (user) => {
    await base44.entities.User.update(user.id, { status: 'Suspended' });
    refresh();
  };

  const handleExport = () => {
    const rows = [['Name', 'Email', 'Company', 'Role', 'Type', 'Status', 'Lead Score']];
    filtered.forEach(u => rows.push([u.full_name, u.email, u.company || '', u.role, u.client_type || '', u.status || '', u.lead_score || 0]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'users.csv'; a.click();
  };

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(u => u.id)));

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.company || '').toLowerCase().includes(q);
    const matchType = filterType === 'All' || u.client_type === filterType;
    const matchStatus = filterStatus === 'All' || u.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-border flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users, companies, or roles..."
            className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50" />
        </div>

        {/* Filters */}
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/50 text-muted-foreground">
          {['All', 'Client', 'Prospect', 'Expert', 'Admin'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/50 text-muted-foreground">
          {['All', 'Active', 'Pending', 'Inactive', 'Suspended'].map(s => <option key={s}>{s}</option>)}
        </select>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setModal({ mode: 'add' })}>
            <UserPlus className="w-3.5 h-3.5" /> Add User
          </Button>
        </div>
      </div>

      {/* Table - scrollable */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll} className="w-3.5 h-3.5 rounded" />
              </th>
              {['Name', 'Company', 'Role', 'Type', 'Status', 'Lead Score', 'Last Active', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">No users found</td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.id} onDoubleClick={() => onViewUser && onViewUser(u)} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer ${selected.has(u.id) ? 'bg-primary/5' : ''}`}>
                <td className="px-4 py-3.5">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} className="w-3.5 h-3.5 rounded" />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                      {initials(u.full_name || u.email)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-xs">{u.full_name || '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-foreground">{u.company || '—'}</td>
                <td className="px-4 py-3.5">
                  <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${ROLE_COLORS[u.role] || 'bg-secondary text-foreground border-border'}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${typeColors[u.client_type] || 'bg-secondary text-foreground border-border'}`}>
                    {u.client_type || 'Client'}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${statusColors[u.status] || 'bg-secondary text-foreground border-border'}`}>
                    {u.status || 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${u.lead_score || 0}%`, background: scoreColor(u.lead_score || 0) }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-5">{u.lead_score || 0}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{relativeTime(u.updated_date)}</td>
                <td className="px-4 py-3.5">
                  <ActionMenu user={u} onEdit={u => onViewUser ? onViewUser(u) : setModal({ mode: 'edit', user: u })} onDelete={handleDelete} onSuspend={handleSuspend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-secondary/20">
        <p className="text-xs text-muted-foreground">{filtered.length} user{filtered.length !== 1 ? 's' : ''}{selected.size > 0 ? ` · ${selected.size} selected` : ''}</p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Bulk actions:</span>
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={async () => { for (const id of selected) await base44.entities.User.delete(id); refresh(); setSelected(new Set()); }}>
              Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <UserModal
          user={modal.mode === 'edit' ? modal.user : null}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}