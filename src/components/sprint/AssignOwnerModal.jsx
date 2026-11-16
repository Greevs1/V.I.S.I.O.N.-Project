import React, { useState, useEffect } from 'react';
import { Search, X, Loader2, User, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AssignOwnerModal({ onClose, onAssign }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', { action: 'getTeamMembers' });
      setMembers(res.data?.members || []);
    } catch (e) {
      console.error('getTeamMembers error:', e);
    }
    setLoading(false);
  };

  const filtered = members.filter(m =>
    (m.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-xl w-full max-w-sm p-0 border border-border shadow-2xl" style={{ backgroundColor: '#141418' }}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Assign Owner</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search team members..."
              className="w-full h-8 bg-secondary border border-border rounded-lg pl-8 pr-3 text-xs outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No team members found</p>
          ) : (
            filtered.map(m => (
              <button
                key={m.id}
                onClick={() => {
                  onAssign({ id: m.id, name: m.full_name, email: m.email });
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{m.full_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{m.email}{m.role ? ` · ${m.role}` : ''}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}