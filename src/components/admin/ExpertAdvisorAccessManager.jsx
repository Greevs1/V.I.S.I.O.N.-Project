/**
 * ExpertAdvisorAccessManager
 * Shown inside Admin → Users & Clients → Selected User → Expert Advisors tab.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { UserPlus, Trash2, Edit2, Check, X, Loader2, ChevronDown, ChevronUp, Shield, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PERMISSION_KEYS = [
  { key: 'galileo_summary',     label: 'Galileo Summary' },
  { key: 'sprints',             label: '90-Day Sprints' },
  { key: 'resources',           label: 'Resources' },
  { key: 'assessments',         label: 'Assessments' },
  { key: 'documents',           label: 'Documents' },
  { key: 'outcome_tracking',    label: 'Outcome Tracking' },
  { key: 'opportunities',       label: 'Opportunities' },
  { key: 'strategy_expansions', label: 'Strategy Expansions' },
  { key: 'freedom_projections', label: 'Freedom Projections' },
  { key: 'notes',               label: 'Notes' },
];

// Baseline — always on, not editable
const BASELINE_KEYS = [
  { key: 'iq_dashboard',  label: 'IQ Dashboard (always on)' },
  { key: 'activity_feed', label: 'Activity Feed (always on)' },
];

const DEFAULT_PERMISSIONS = {
  galileo_summary: true,
  sprints: true,
  resources: true,
  assessments: false,
  documents: false,
  outcome_tracking: false,
  opportunities: true,
  strategy_expansions: false,
  freedom_projections: false,
  notes: false,
};

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  expert_advisor: 'Expert Advisor',
  advisor: 'Advisor',
};

const initials = (name, email) => {
  const str = name || email || '?';
  return str.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
};

// ── Advisor Picker Modal ─────────────────────────────────────────────────────

function AdvisorPickerModal({ open, onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: result = {}, isLoading, error: queryError } = useQuery({
    queryKey: ['assignable-advisors-search', search],
    queryFn: async () => {
      const res = await base44.functions.invoke('searchAssignableUsers', {
        action: 'searchAdvisoryAssignableUsers',
        searchTerm: search,
        limit: 50,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data || {};
    },
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  const users = result.users || [];

  const handleConfirm = () => {
    if (!selected) return;
    onSelect(selected);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Assign Expert Advisor</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Select an advisor, admin, or super admin</p>
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
        </div>

        {queryError && (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[10px] text-red-400">
            <b>Search error:</b> {queryError.message}
          </div>
        )}

        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && !queryError && users.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              {search ? `No advisors matching "${search}".` : 'No eligible advisors found.'}
            </p>
          )}
          {!isLoading && users.map(u => {
            const isSelected = selected?.profile_id === u.profile_id;
            return (
              <label
                key={u.profile_id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-secondary/50'
                }`}
              >
                <input type="radio" checked={isSelected} onChange={() => setSelected(u)} className="hidden" />
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {initials(u.full_name, u.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[u.app_role] || u.app_role}</span>
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

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{selected ? `Selected: ${selected.full_name || selected.email}` : 'No user selected'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={handleConfirm}
              disabled={!selected}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ExpertAdvisorAccessManager({ clientProfileId, clientBusinessId }) {
  const queryClient = useQueryClient();

  const [showPicker, setShowPicker] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [pendingPerms, setPendingPerms] = useState({ ...DEFAULT_PERMISSIONS });
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editPerms, setEditPerms] = useState({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Guard: need clientProfileId to do anything
  const hasClientProfile = !!clientProfileId;

  const { data: queryResult = {}, isLoading, refetch } = useQuery({
    queryKey: ['expert-advisor-access', clientProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('expertAdvisorAccess', {
        action: 'listForClient',
        client_profile_id: clientProfileId,
      });
      return res.data || {};
    },
    enabled: hasClientProfile,
  });

  const accessRecords = queryResult.access_records || [];
  const tableMissing = queryResult.table_missing === true;

  const handlePickerSelect = (expert) => {
    setSelectedExpert(expert);
    setPendingPerms({ ...DEFAULT_PERMISSIONS });
    setAssignError(null);
  };

  const handleAssign = async () => {
    if (!selectedExpert || !clientProfileId) return;
    setAssigning(true);
    setAssignError(null);

    console.log('[ExpertAdvisorAccessManager] Assigning:', {
      expert_profile_id: selectedExpert.profile_id,
      expert_email: selectedExpert.email,
      expert_app_role: selectedExpert.app_role,
      client_profile_id: clientProfileId,
      business_id: clientBusinessId || null,
    });

    try {
      const res = await base44.functions.invoke('expertAdvisorAccess', {
        action: 'grant',
        expert_profile_id: selectedExpert.profile_id,
        client_profile_id: clientProfileId,
        business_id: clientBusinessId || null,
        permissions: pendingPerms,
      });

      console.log('[ExpertAdvisorAccessManager] Grant response:', res.data);

      if (res.data?.error) throw new Error(res.data.error);
      if (!res.data?.success) throw new Error('Assignment did not confirm success');

      toast.success(`✓ Assigned ${selectedExpert.full_name || selectedExpert.email} — record ID: ${res.data?.record?.id || 'saved'}`);
      setSelectedExpert(null);
      // Force immediate refetch so the new record appears
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['expert-advisor-access', clientProfileId] });
    } catch (err) {
      console.error('[ExpertAdvisorAccessManager] Assignment failed:', err.message);
      setAssignError(err.message || 'Assignment failed');
      toast.error(`Assignment failed: ${err.message}`);
    }
    setAssigning(false);
  };

  const handleRevoke = async (record) => {
    if (!confirm(`Revoke access for ${record.expert_name || record.expert_email}?`)) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke('expertAdvisorAccess', {
        action: 'revoke',
        access_id: record.id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Access revoked');
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Failed to revoke');
    }
    setSaving(false);
  };

  const startEdit = (record) => {
    setEditingId(record.id);
    setEditPerms({ ...record.permissions });
    setExpandedId(record.id);
  };

  const handleSavePerms = async (recordId) => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke('expertAdvisorAccess', {
        action: 'updatePermissions',
        access_id: recordId,
        permissions: editPerms,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Permissions updated');
      setEditingId(null);
      await refetch();
    } catch (err) {
      toast.error(err.message || 'Save failed');
    }
    setSaving(false);
  };

  if (!hasClientProfile) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
        <p className="font-semibold">Client profile ID not available.</p>
        <p>The Supabase profile for this user may not be loaded yet. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Expert Advisor Access</h3>
        </div>
        {!selectedExpert && (
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground" onClick={() => setShowPicker(true)}>
            <UserPlus className="w-3.5 h-3.5" /> Assign Advisor
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Assign advisors, admins, or super admins to this client. IQ Dashboard and Activity Feed access are always granted.
      </p>

      <AdvisorPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(expert) => { setShowPicker(false); handlePickerSelect(expert); }}
      />

      {/* ── Step 2: Permission configuration after selection ── */}
      {selectedExpert && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/20">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{initials(selectedExpert.full_name, selectedExpert.email)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{selectedExpert.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{selectedExpert.email}</p>
            </div>
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
              {ROLE_LABELS[selectedExpert.app_role] || selectedExpert.app_role}
            </span>
            <button onClick={() => { setSelectedExpert(null); setAssignError(null); }} className="p-1.5 text-muted-foreground hover:text-foreground rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3">
            {/* Baseline — always on */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Baseline Access (always included)</p>
              <div className="flex gap-2 flex-wrap">
                {BASELINE_KEYS.map(pk => (
                  <div key={pk.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-xs font-medium text-emerald-400">{pk.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional permissions */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Optional Section Access</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {PERMISSION_KEYS.map(pk => {
                  const enabled = pendingPerms[pk.key] === true;
                  return (
                    <label key={pk.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      enabled ? 'bg-primary/10 border border-primary/25' : 'bg-secondary/40 border border-border'
                    }`}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => setPendingPerms(p => ({ ...p, [pk.key]: e.target.checked }))}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      <span className="text-xs font-medium">{pk.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Assignment error */}
            {assignError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{assignError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
                onClick={handleAssign}
                disabled={assigning}
              >
                {assigning
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Assigning…</>
                  : <><UserPlus className="w-3.5 h-3.5" /> Assign Expert Advisor</>
                }
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setSelectedExpert(null); setAssignError(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table missing notice */}
      {tableMissing && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400 space-y-1">
          <p className="font-semibold">Database table not yet created.</p>
          <p>Run the SQL migration in <code className="font-mono">supabase/migrations/expert_advisor_access.sql</code> in your Supabase SQL editor.</p>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {!isLoading && accessRecords.length === 0 && !selectedExpert && (
        <div className="text-center py-8 text-sm text-muted-foreground glass rounded-xl">
          No expert advisors assigned to this client yet.
        </div>
      )}

      {accessRecords.map(record => {
        const isExpanded = expandedId === record.id;
        const isEditing = editingId === record.id;
        return (
          <div key={record.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/20"
              onClick={() => setExpandedId(isExpanded ? null : record.id)}
            >
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">
                  {(record.expert_name || record.expert_email || '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{record.expert_name || '—'}</p>
                <p className="text-xs text-muted-foreground">{record.expert_email || '—'}</p>
              </div>
              <span className={`text-[10px] border rounded-full px-2 py-0.5 shrink-0 ${
                record.access_status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-secondary text-muted-foreground border-border'
              }`}>{record.access_status}</span>
              <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => startEdit(record)} className="p-1.5 text-muted-foreground hover:text-primary rounded" title="Edit permissions">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleRevoke(record)} disabled={saving} className="p-1.5 text-muted-foreground hover:text-destructive rounded" title="Revoke access">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-border px-4 py-4 space-y-3">
                {/* Baseline — always on, not editable */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Baseline (always on)</p>
                  <div className="flex gap-2 flex-wrap">
                    {BASELINE_KEYS.map(pk => (
                      <div key={pk.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-xs font-medium text-emerald-400">{pk.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Optional Permissions</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {PERMISSION_KEYS.map(pk => {
                    const perms = isEditing ? editPerms : (record.permissions || {});
                    const enabled = perms[pk.key] === true;
                    return (
                      <label key={pk.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        enabled ? 'bg-primary/10 border border-primary/25' : 'bg-secondary/40 border border-border'
                      }`}>
                        <input
                          type="checkbox"
                          checked={!!enabled}
                          disabled={!isEditing}
                          onChange={e => isEditing && setEditPerms(p => ({ ...p, [pk.key]: e.target.checked }))}
                          className="w-3.5 h-3.5 accent-primary"
                        />
                        <span className="text-xs font-medium">{pk.label}</span>
                      </label>
                    );
                  })}
                </div>
                {isEditing && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-8 text-xs bg-primary text-primary-foreground" onClick={() => handleSavePerms(record.id)} disabled={saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3 h-3" /> Save</>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditingId(null)}>
                      <X className="w-3 h-3" /> Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}