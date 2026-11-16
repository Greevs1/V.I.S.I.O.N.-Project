import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Star, Users, Trash2, Loader2 } from 'lucide-react';
import ExpertCard from './ExpertCard';
import { Button } from '@/components/ui/button';

export default function MyExperts() {
  const { supabaseProfile } = useAuth();
  const queryClient = useQueryClient();
  const clientProfileId = supabaseProfile?.id;
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: savedExperts = [], isLoading } = useQuery({
    queryKey: ['saved-experts', clientProfileId],
    queryFn: () => base44.entities.client_saved_experts.filter({ client_profile_id: clientProfileId }, '-updated_date', 200),
    enabled: !!clientProfileId,
  });

  // Load full expert profiles for saved experts that are on platform
  const platformIds = savedExperts.filter(s => s.expert_profile_id).map(s => s.expert_profile_id);
  const { data: expertProfiles = [] } = useQuery({
    queryKey: ['expert-profiles-saved', platformIds.join(',')],
    queryFn: () => base44.entities.expert_profiles.filter({ expert_status: 'active' }, '-updated_date', 200),
    enabled: platformIds.length > 0,
  });
  const profileMap = Object.fromEntries(expertProfiles.map(e => [e.id, e]));

  const removeMutation = useMutation({
    mutationFn: (id) => base44.entities.client_saved_experts.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-experts', clientProfileId] }),
  });

  const favorited = savedExperts.filter(s => s.relationship_type === 'favorited');
  const saved     = savedExperts.filter(s => s.relationship_type === 'saved');
  const myExperts = savedExperts.filter(s => s.relationship_type === 'my_expert');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{savedExperts.length} expert{savedExperts.length !== 1 ? 's' : ''} in your network</p>
        <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Expert
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && savedExperts.length === 0 && (
        <div className="glass rounded-xl p-12 text-center space-y-3">
          <Users className="w-8 h-8 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Your advisory bench is empty.</p>
          <p className="text-xs text-muted-foreground/60">Save experts from the directory or add your own CPA, attorney, or advisor.</p>
        </div>
      )}

      {myExperts.length > 0 && (
        <ExpertGroup label="My Advisory Team" items={myExperts} profileMap={profileMap} onRemove={id => removeMutation.mutate(id)} />
      )}
      {favorited.length > 0 && (
        <ExpertGroup label="Favorited" icon={Star} items={favorited} profileMap={profileMap} onRemove={id => removeMutation.mutate(id)} />
      )}
      {saved.length > 0 && (
        <ExpertGroup label="Saved Experts" items={saved} profileMap={profileMap} onRemove={id => removeMutation.mutate(id)} />
      )}

      {showAddModal && (
        <AddClientExpertModal
          clientProfileId={clientProfileId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['saved-experts', clientProfileId] });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function ExpertGroup({ label, icon: Icon, items, profileMap, onRemove }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-primary" />}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label} ({items.length})</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(item => {
          const profile = profileMap[item.expert_profile_id];
          if (profile) {
            return (
              <div key={item.id} className="relative">
                <ExpertCard expert={profile} />
                <button onClick={() => onRemove(item.id)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }
          // Client-added (not on platform)
          return (
            <div key={item.id} className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-muted-foreground">{(item.name || '?')[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{item.name || '—'}</p>
                <p className="text-xs text-muted-foreground">{item.specialty || item.company || '—'}</p>
                {item.email && <p className="text-[10px] text-muted-foreground/60">{item.email}</p>}
              </div>
              <button onClick={() => onRemove(item.id)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddClientExpertModal({ clientProfileId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', company: '', specialty: '', relationship_type: 'my_expert' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    await base44.entities.client_saved_experts.create({
      client_profile_id: clientProfileId,
      name: form.name,
      email: form.email,
      company: form.company,
      specialty: form.specialty,
      relationship_type: form.relationship_type,
      source: 'client_added',
    });
    setSaving(false);
    onSaved();
  };

  const field = (label, key, placeholder, type = 'text') => (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full mt-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/40" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <p className="text-sm font-semibold">Add Expert to My Network</p>
        {field('Name *', 'name', 'Full name')}
        {field('Email', 'email', 'email@example.com', 'email')}
        {field('Company', 'company', 'Firm or company name')}
        {field('Specialty', 'specialty', 'e.g. CPA, Tax Strategist')}
        <div>
          <label className="text-xs text-muted-foreground">Relationship</label>
          <select value={form.relationship_type} onChange={e => setForm(f => ({ ...f, relationship_type: e.target.value }))}
            className="w-full mt-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none">
            <option value="my_expert">My Expert</option>
            <option value="favorited">Favorited</option>
            <option value="saved">Saved</option>
          </select>
        </div>
        <div className="flex items-center gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add Expert'}
          </Button>
        </div>
      </div>
    </div>
  );
}