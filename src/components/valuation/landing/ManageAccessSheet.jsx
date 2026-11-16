/**
 * ManageAccessSheet — Phase 13.3G.3
 *
 * One right-side sheet with all assignment controls:
 *   1. Business Owners — current owners, primary, add/change
 *   2. Valuation Team — lead advisor, advisors, specialists
 *   3. Review and Publication — reviewer, publisher
 *   4. Permissions — role template, custom permissions
 *   5. Client Access — shared / revoked / not shared
 *
 * Reuses the existing AssignmentPermissionEditor for advisor permission
 * management and the existing valuationService backend actions.
 * Does NOT create a second assignment system.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { UserPlus, Search, Loader2, Crown, ShieldCheck, Upload, Building2, User, Star, X } from 'lucide-react';
import {
  getValuationAccessSummary, getEligibleBusinessOwners, assignBusinessOwner,
  updateBusinessOwner, setPrimaryBusinessOwner, setLeadAdvisor,
  getEligibleAdvisors, assignValuationAdvisor, getValuationSummary,
} from '@/lib/valuationService';
import { ROLE_TEMPLATES, TEMPLATE_KEYS, applyTemplate } from '@/lib/valuation/roleTemplates';
import AssignmentPermissionEditor from './AssignmentPermissionEditor';

function Avatar({ name, size = 'sm' }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
  return (
    <div className={`${dim} rounded-full flex items-center justify-center font-bold shrink-0`} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}>
      {initials}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 pb-1">
      <Icon className="w-3.5 h-3.5 text-primary/70" />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{children}</p>
    </div>
  );
}

function EmptyHint({ children }) {
  return <p className="text-[11px] text-muted-foreground/60 italic">{children}</p>;
}

export default function ManageAccessSheet({ open, onOpenChange, valuationId, canManage, onUpdated }) {
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);

  // Owner assignment state
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerResults, setOwnerResults] = useState([]);
  const [searchingOwners, setSearchingOwners] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [ownerForm, setOwnerForm] = useState({ ownership_percentage: '', is_primary_owner: false, is_control_person: false, owner_role: 'owner', confirm_client_access: true });
  const [assigningOwner, setAssigningOwner] = useState(false);

  // Advisor assignment state
  const [advisorSearch, setAdvisorSearch] = useState('');
  const [advisorResults, setAdvisorResults] = useState([]);
  const [searchingAdvisors, setSearchingAdvisors] = useState(false);
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('viewer');
  const [assigningAdvisor, setAssigningAdvisor] = useState(false);

  const reload = useCallback(async () => {
    if (!valuationId) return;
    setLoading(true);
    try {
      const acc = await getValuationAccessSummary(valuationId);
      setAccess(acc);
      const summ = await getValuationSummary(valuationId);
      setAssignments(summ?.assignments || []);
    } catch (e) {
      setError(e.message || 'Failed to load access data');
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => {
    if (open) reload();
    else {
      setOwnerSearch(''); setSelectedOwner(null); setAdvisorSearch(''); setSelectedAdvisor(null); setError(null);
    }
  }, [open, reload]);

  const businessId = access?.business?.id;

  // ── Owner search ──────────────────────────────────────────────────────
  const runOwnerSearch = async (term) => {
    setOwnerSearch(term);
    if (!businessId) return;
    setSearchingOwners(true);
    try {
      const res = await getEligibleBusinessOwners(businessId, term);
      setOwnerResults(res || []);
    } catch { setOwnerResults([]); }
    finally { setSearchingOwners(false); }
  };

  const handleAssignOwner = async () => {
    if (!selectedOwner || !valuationId) return;
    setAssigningOwner(true);
    setError(null);
    try {
      await assignBusinessOwner(valuationId, selectedOwner.profile_id, {
        ownership_percentage: ownerForm.ownership_percentage ? parseFloat(ownerForm.ownership_percentage) : null,
        is_primary_owner: ownerForm.is_primary_owner,
        is_control_person: ownerForm.is_control_person,
        owner_role: ownerForm.owner_role,
        confirm_client_access: ownerForm.confirm_client_access,
      });
      setSelectedOwner(null);
      setOwnerSearch('');
      setOwnerResults([]);
      setOwnerForm({ ownership_percentage: '', is_primary_owner: false, is_control_person: false, owner_role: 'owner', confirm_client_access: true });
      await reload();
      onUpdated?.();
    } catch (e) {
      setError(e.message || 'Failed to assign owner');
    } finally {
      setAssigningOwner(false);
    }
  };

  const handleSetPrimary = async (profileId) => {
    if (!valuationId) return;
    try {
      await setPrimaryBusinessOwner(valuationId, profileId);
      await reload();
      onUpdated?.();
    } catch (e) { setError(e.message); }
  };

  // ── Advisor search ────────────────────────────────────────────────────
  const runAdvisorSearch = async (term) => {
    setAdvisorSearch(term);
    if (!valuationId) return;
    setSearchingAdvisors(true);
    try {
      const res = await getEligibleAdvisors(valuationId, term);
      setAdvisorResults(res || []);
    } catch { setAdvisorResults([]); }
    finally { setSearchingAdvisors(false); }
  };

  const handleAssignAdvisor = async () => {
    if (!selectedAdvisor || !valuationId) return;
    setAssigningAdvisor(true);
    setError(null);
    try {
      const tpl = ROLE_TEMPLATES[selectedTemplate];
      const role = selectedTemplate === 'lead' ? 'lead' : (selectedTemplate === 'viewer' ? 'observer' : 'contributor');
      if (selectedTemplate === 'lead') {
        await setLeadAdvisor(valuationId, selectedAdvisor.profile_id);
      } else {
        await assignValuationAdvisor(valuationId, selectedAdvisor.profile_id, role, tpl.permissions);
      }
      setSelectedAdvisor(null);
      setAdvisorSearch('');
      setAdvisorResults([]);
      setSelectedTemplate('viewer');
      await reload();
      onUpdated?.();
    } catch (e) {
      setError(e.message || 'Failed to assign advisor');
    } finally {
      setAssigningAdvisor(false);
    }
  };

  const handleAssignmentUpdated = (id, newPerms) => {
    setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, ...newPerms } : a));
  };

  const handleAssignmentRemoved = (id) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const leadAsg = assignments.find((a) => a.assignment_role === 'lead');
  const otherAsgs = assignments.filter((a) => a.assignment_role !== 'lead' && a.assignment_role !== 'owner');
  const reviewerAsg = otherAsgs.find((a) => a.can_review && !a.can_publish);
  const publisherAsg = otherAsgs.find((a) => a.can_publish);
  const owners = access?.owners || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Manage Access</SheetTitle>
          <SheetDescription>Manage business owners, advisors, reviewers, publishers, and client access.</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="space-y-5 mt-4">
            {error && (
              <div className="rounded-lg p-2.5 text-[11px] text-destructive" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            {/* ── Business Owners ──────────────────────────────────────── */}
            <div className="space-y-2">
              <SectionTitle icon={Building2}>Business Owners</SectionTitle>
              {owners.length === 0 ? (
                <EmptyHint>No business owner linked</EmptyHint>
              ) : (
                owners.map((o) => (
                  <div key={o.profile_id} className="rounded-lg p-2.5 flex items-center gap-2.5" style={{ background: o.is_primary_owner ? 'rgba(212,168,83,0.04)' : 'rgba(255,255,255,0.01)', border: `1px solid ${o.is_primary_owner ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.05)'}` }}>
                    <Avatar name={o.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-foreground truncate">{o.name}</p>
                        {o.is_primary_owner && <Crown className="w-3 h-3 text-primary shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {o.email} · {o.role || 'Owner'}{o.ownership_percentage ? ` · ${o.ownership_percentage}%` : ''}{o.is_control_person ? ' · Control Person' : ''}
                      </p>
                    </div>
                    {canManage && !o.is_primary_owner && (
                      <button onClick={() => handleSetPrimary(o.profile_id)} className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-0.5">
                        <Star className="w-3 h-3" /> Set Primary
                      </button>
                    )}
                  </div>
                ))
              )}

              {/* Assign owner */}
              {canManage && (
                <div className="rounded-lg p-2.5 space-y-2" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assign Business Owner</p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={ownerSearch}
                      onChange={(e) => runOwnerSearch(e.target.value)}
                      placeholder="Search linked profiles…"
                      className="w-full rounded-lg pl-8 pr-3 py-2 text-xs bg-background border border-border focus:border-primary outline-none"
                    />
                  </div>
                  {searchingOwners && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</p>}
                  {!searchingOwners && ownerResults.length > 0 && !selectedOwner && (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {ownerResults.slice(0, 8).map((o) => (
                        <button key={o.profile_id} onClick={() => setSelectedOwner(o)} className="w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-secondary transition-colors">
                          <span className="text-foreground font-medium">{o.full_name || o.email}</span>
                          {o.is_current_owner && <span className="text-[10px] text-primary/60 ml-2">Current Owner</span>}
                          <span className="text-muted-foreground ml-2">{o.app_role}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedOwner && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-md px-2 py-1.5" style={{ background: 'rgba(212,168,83,0.06)' }}>
                        <span className="text-xs text-foreground font-medium">{selectedOwner.full_name || selectedOwner.email}</span>
                        <button onClick={() => setSelectedOwner(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-muted-foreground">
                          Ownership %
                          <input type="number" value={ownerForm.ownership_percentage} onChange={(e) => setOwnerForm({ ...ownerForm, ownership_percentage: e.target.value })} className="w-full rounded-md px-2 py-1 text-xs bg-background border border-border focus:border-primary outline-none mt-0.5" placeholder="e.g. 50" />
                        </label>
                        <label className="text-[10px] text-muted-foreground">
                          Role
                          <select value={ownerForm.owner_role} onChange={(e) => setOwnerForm({ ...ownerForm, owner_role: e.target.value })} className="w-full rounded-md px-2 py-1 text-xs bg-background border border-border focus:border-primary outline-none mt-0.5">
                            <option value="owner">Owner</option>
                            <option value="co_owner">Co-Owner</option>
                            <option value="partner">Partner</option>
                            <option value="shareholder">Shareholder</option>
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-[10px] text-foreground cursor-pointer">
                          <input type="checkbox" checked={ownerForm.is_primary_owner} onChange={(e) => setOwnerForm({ ...ownerForm, is_primary_owner: e.target.checked })} className="rounded border-border" />
                          Primary Owner
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-foreground cursor-pointer">
                          <input type="checkbox" checked={ownerForm.is_control_person} onChange={(e) => setOwnerForm({ ...ownerForm, is_control_person: e.target.checked })} className="rounded border-border" />
                          Control Person
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-foreground cursor-pointer">
                          <input type="checkbox" checked={ownerForm.confirm_client_access} onChange={(e) => setOwnerForm({ ...ownerForm, confirm_client_access: e.target.checked })} className="rounded border-border" />
                          Grant View Access
                        </label>
                      </div>
                      <button onClick={handleAssignOwner} disabled={assigningOwner} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-40" style={{ background: '#D4A853', color: '#08080C' }}>
                        {assigningOwner ? <><Loader2 className="w-3 h-3 animate-spin" /> Assigning…</> : <><UserPlus className="w-3 h-3" /> Assign Owner</>}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Valuation Team ──────────────────────────────────────── */}
            <div className="space-y-2">
              <SectionTitle icon={Crown}>Valuation Team</SectionTitle>

              {/* Lead advisor */}
              {leadAsg ? (
                <AssignmentPermissionEditor assignment={leadAsg} canManage={canManage} onUpdated={handleAssignmentUpdated} onRemoved={handleAssignmentRemoved} />
              ) : (
                <EmptyHint>No lead advisor assigned</EmptyHint>
              )}

              {/* Other advisors */}
              {otherAsgs.filter((a) => a.assignment_role !== 'owner').map((a) => (
                <AssignmentPermissionEditor key={a.id || a.assigned_profile_id} assignment={a} canManage={canManage} onUpdated={handleAssignmentUpdated} onRemoved={handleAssignmentRemoved} />
              ))}

              {/* Assign advisor */}
              {canManage && (
                <div className="rounded-lg p-2.5 space-y-2" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assign Advisor</p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={advisorSearch}
                      onChange={(e) => runAdvisorSearch(e.target.value)}
                      placeholder="Search advisors by name or email…"
                      className="w-full rounded-lg pl-8 pr-3 py-2 text-xs bg-background border border-border focus:border-primary outline-none"
                    />
                  </div>
                  {searchingAdvisors && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching…</p>}
                  {!searchingAdvisors && advisorResults.length > 0 && !selectedAdvisor && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {advisorResults.slice(0, 8).map((a) => (
                        <button key={a.profile_id} onClick={() => setSelectedAdvisor(a)} className="w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-secondary transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-foreground font-medium">{a.full_name || a.email}</span>
                            {a.current_assignment_role && <span className="text-[10px] text-primary/60">{a.current_assignment_role}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{a.app_role}</span>
                            {a.current_workload > 0 && <span>· {a.current_workload} active</span>}
                            {a.expert_metadata?.title && <span>· {a.expert_metadata.title}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedAdvisor && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-md px-2 py-1.5" style={{ background: 'rgba(212,168,83,0.06)' }}>
                        <span className="text-xs text-foreground font-medium">{selectedAdvisor.full_name || selectedAdvisor.email}</span>
                        <button onClick={() => setSelectedAdvisor(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Role:</span>
                        {TEMPLATE_KEYS.map((key) => (
                          <button key={key} onClick={() => setSelectedTemplate(key)} className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${selectedTemplate === key ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                            {ROLE_TEMPLATES[key].label}
                          </button>
                        ))}
                      </div>
                      <button onClick={handleAssignAdvisor} disabled={assigningAdvisor} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-40" style={{ background: '#D4A853', color: '#08080C' }}>
                        {assigningAdvisor ? <><Loader2 className="w-3 h-3 animate-spin" /> Assigning…</> : <><UserPlus className="w-3 h-3" /> Assign Advisor</>}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Review and Publication ──────────────────────────────── */}
            <div className="space-y-2">
              <SectionTitle icon={ShieldCheck}>Review and Publication</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Reviewer</p>
                  {reviewerAsg ? (
                    <p className="text-xs font-medium text-foreground mt-0.5">{reviewerAsg.advisor ? `${reviewerAsg.advisor.first_name || ''} ${reviewerAsg.advisor.last_name || ''}`.trim() || reviewerAsg.advisor.email : 'Assigned'}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">Not assigned</p>
                  )}
                </div>
                <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1"><Upload className="w-3 h-3" /> Publisher</p>
                  {publisherAsg ? (
                    <p className="text-xs font-medium text-foreground mt-0.5">{publisherAsg.advisor ? `${publisherAsg.advisor.first_name || ''} ${publisherAsg.advisor.last_name || ''}`.trim() || publisherAsg.advisor.email : 'Assigned'}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">Not assigned</p>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60">Assign advisors with Review or Publish permissions in the Valuation Team section above.</p>
            </div>

            {/* ── Client Access ──────────────────────────────────────── */}
            <div className="space-y-2">
              <SectionTitle icon={User}>Client Access</SectionTitle>
              <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs text-foreground">
                  Status: <span className="font-medium" style={{ color: access?.client_access?.status === 'shared' ? '#22c55e' : access?.client_access?.status === 'revoked' ? '#EF4444' : '#6B7280' }}>
                    {access?.client_access?.status === 'shared' ? 'Shared' : access?.client_access?.status === 'revoked' ? 'Revoked' : 'Not Shared'}
                  </span>
                </p>
                {access?.client_access?.shared_at && <p className="text-[10px] text-muted-foreground mt-0.5">Shared at: {new Date(access.client_access.shared_at).toLocaleDateString()}</p>}
                {access?.client_access?.revoked_at && <p className="text-[10px] text-muted-foreground mt-0.5">Revoked at: {new Date(access.client_access.revoked_at).toLocaleDateString()}</p>}
              </div>
              <p className="text-[10px] text-muted-foreground/60">Client access is managed from the Valuation workspace's Deliverables section.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}