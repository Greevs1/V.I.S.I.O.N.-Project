/**
 * UserAssignmentModal — reusable searchable user picker for admin assignment flows.
 *
 * Visually matches AssignWorksheetModal but is completely independent of it.
 * Used for: document assignment, resource assignment, expansion engine, future admin objects.
 *
 * Props:
 *   open        — boolean
 *   onClose     — () => void
 *   title       — string, e.g. "Assign Document"
 *   subtitle    — string, e.g. document name
 *   onConfirm   — (selectedUser: UserProfile) => Promise<void>  (single-select)
 *   multiSelect — boolean (default false) — if true, onConfirm receives array
 *   confirmLabel — string (default "Assign")
 */
import React, { useState, useEffect } from 'react';
import { X, UserPlus, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

// Exact same user fetch + enrichment as AssignWorksheetModal
async function fetchAllUsersEnriched() {
  const allUsers = await base44.entities.User.list('-created_date', 200);
  const enriched = [];
  for (const u of (allUsers || [])) {
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getProfile',
        data: { _router_user_email: u.email },
      });
      enriched.push({
        ...u,
        profile_id: res.data?.profile?.id || null,
        supabaseProfileId: res.data?.profile?.id || null,
        app_role: res.data?.profile?.app_role || null,
      });
    } catch {
      enriched.push({ ...u, profile_id: null, supabaseProfileId: null, app_role: null });
    }
  }
  return enriched;
}

export default function UserAssignmentModal({
  open,
  onClose,
  title = 'Assign to User',
  subtitle = '',
  onConfirm,
  multiSelect = false,
  confirmLabel = 'Assign',
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  // Reset selection when modal opens
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch('');
    }
  }, [open]);

  // Same cached query as AssignWorksheetModal
  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['all-users-for-assign'],
    queryFn: fetchAllUsersEnriched,
    enabled: open,
    staleTime: 2 * 60 * 1000, // 2 min cache — same session reuse
  });

  // Client-side filter — same logic as worksheet modal
  const users = allUsers.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  const toggle = (userId) => {
    if (multiSelect) {
      setSelected(s => {
        const next = new Set(s);
        next.has(userId) ? next.delete(userId) : next.add(userId);
        return next;
      });
    } else {
      setSelected(new Set([userId]));
    }
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const selectedUsers = allUsers.filter(u => selected.has(u.id));
    await onConfirm(multiSelect ? selectedUsers : selectedUsers[0]);
    setSaving(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
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
        </div>

        {/* User List */}
        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && users.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              {search ? 'No users match your search.' : 'No users found.'}
            </p>
          )}
          {!isLoading && users.map(u => {
            const isSelected = selected.has(u.id);
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-secondary/50'
                }`}
              >
                <input
                  type={multiSelect ? 'checkbox' : 'radio'}
                  checked={isSelected}
                  onChange={() => toggle(u.id)}
                  className="hidden"
                />
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {initials(u.full_name || u.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  {u.app_role && u.app_role !== 'owner' && (
                    <span className="text-[10px] text-muted-foreground capitalize">{u.app_role}</span>
                  )}
                </div>
                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                  </div>
                )}
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {selected.size} user{selected.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={handleConfirm}
              disabled={saving || selected.size === 0}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {saving ? 'Assigning…' : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}