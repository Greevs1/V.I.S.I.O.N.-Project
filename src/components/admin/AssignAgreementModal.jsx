import React, { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const initials = (name) => name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

export default function AssignAgreementModal({ agreement, onClose, onAssigned }) {
  const [selected, setSelected] = useState(new Set(agreement?.assigned_to || []));
  const [saving, setSaving] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users-for-assignment'],
    queryFn: () => base44.entities.User.list('-created_date', 100),
  });

  const toggle = (id) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleAssign = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    await base44.entities.Agreement.update(agreement.id, {
      assigned_to: [...selected],
      status: selected.size > 0 ? 'assigned' : (agreement.status === 'assigned' ? 'draft' : agreement.status),
    });
    onAssigned([...selected]);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Assign Agreement</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{agreement?.title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {users.length === 0 && (
            <p className="text-sm text-center text-muted-foreground py-4">No users found.</p>
          )}
          {users.map(u => (
            <label key={u.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selected.has(u.id) ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-secondary/50'
            }`}>
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} className="hidden" />
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {initials(u.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              {selected.has(u.id) && (
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                </div>
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{selected.size} user{selected.size !== 1 ? 's' : ''} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" onClick={handleAssign} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Save & Assign
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}