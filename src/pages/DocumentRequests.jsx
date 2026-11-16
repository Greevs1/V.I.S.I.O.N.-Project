import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { FileText, Plus, Search, Upload, Trash2, Loader2, Filter, X, Eye } from 'lucide-react';
import UploadDropdown from '@/components/documents/UploadDropdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format, isPast, parseISO } from 'date-fns';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  uploaded: { label: 'Uploaded', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  under_review: { label: 'Under Review', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  complete: { label: 'Complete', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

export default function DocumentRequests({ embedded = false }) {
  const { user } = useAuth();
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [saving, setSaving] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: '', description: '', request_type: 'document',
    requested_for_profile_id: '', requested_for_email: '',
    due_date: '',
  });

  // ── Client list for admin selector ────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdown, setClientDropdown] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    base44.entities.User.list('-created_date', 200).then(users => {
      setClients(users.filter(u => ['user', 'team_member', 'owner'].includes(u.role)));
    }).catch(() => {});
  }, [isAdmin]);

  // ── Fetch requests from Base44 entity ─────────────────────────────────────
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['document-requests'],
    queryFn: async () => {
      if (isAdmin) {
        return await base44.entities.DocumentRequest.list('-created_date', 200);
      }
      // Client: only their requests
      const all = await base44.entities.DocumentRequest.list('-created_date', 200);
      return all.filter(r =>
        r.requested_for_profile_id === user?.id ||
        r.requested_for_email === user?.email
      );
    },
    initialData: [],
  });

  // ── Create request ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.title.trim()) return;
    if (isAdmin && !form.requested_for_profile_id && !form.requested_for_email) {
      toast.error('Please select a client');
      return;
    }
    setSaving(true);
    try {
      const newReq = await base44.entities.DocumentRequest.create({
        title: form.title.trim(),
        description: form.description || '',
        request_type: form.request_type,
        requested_by: user?.email || 'Admin',
        requested_for_profile_id: form.requested_for_profile_id || null,
        requested_for_email: form.requested_for_email || null,
        due_date: form.due_date || null,
        status: 'pending',
      });
      queryClient.invalidateQueries({ queryKey: ['document-requests'] });
      setShowNew(false);
      setForm({ title: '', description: '', request_type: 'document', requested_for_profile_id: '', requested_for_email: '', due_date: '' });
      toast.success('Request created');

      // Notify assigned user
      if (form.requested_for_profile_id) {
        base44.functions.invoke('notificationService', {
          action: 'createNotification',
          data: {
            recipient_id: form.requested_for_profile_id,
            sender_id: user.id,
            notification_type: 'document_request_assigned',
            title: 'Document Requested',
            message: `Your advisory team has requested: "${form.title.trim()}"${form.due_date ? `. Due: ${form.due_date}` : ''}.`,
            related_entity_type: 'DocumentRequest',
            related_entity_id: newReq?.id,
            action_url: '/document-requests',
            priority: 'medium',
            recipient_email: form.requested_for_email || null,
          },
        }).catch(() => {});
      }
    } catch (e) {
      toast.error('Failed to create request');
    }
    setSaving(false);
  };

  // ── Update status ─────────────────────────────────────────────────────────
  const updateStatus = async (reqId, status) => {
    await base44.entities.DocumentRequest.update(reqId, { status });
    queryClient.invalidateQueries({ queryKey: ['document-requests'] });
  };

  const handleDelete = async (req) => {
    if (!confirm(`Delete "${req.title}"?`)) return;
    await base44.entities.DocumentRequest.delete(req.id);
    queryClient.invalidateQueries({ queryKey: ['document-requests'] });
  };

  // ── Link upload to request ───────────────────────────────────────────────
  const handleUploadLink = async (req) => {
    // Open Data Room upload then link back — simplified for now
    toast.info('Upload a document in Data Room, then paste its ID here to link it.');
    const docId = prompt('Paste document ID from Data Room:');
    if (!docId) return;
    await base44.entities.DocumentRequest.update(req.id, {
      fulfilled_document_id: docId,
      status: 'uploaded',
    });
    queryClient.invalidateQueries({ queryKey: ['document-requests'] });
    toast.success('Document linked to request');
  };

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || (r.title || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'All' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Client selector for admin ─────────────────────────────────────────────
  const filteredClients = clients.filter(c =>
    !clientSearch || (c.email || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.full_name || '').toLowerCase().includes(clientSearch.toLowerCase())
  );

  const resetForm = () => {
    setForm({ title: '', description: '', request_type: 'document', requested_for_profile_id: '', requested_for_email: '', due_date: '' });
    setClientSearch('');
  };

  return (
    <div className={embedded ? 'space-y-6 pb-12' : 'max-w-4xl mx-auto space-y-6 pb-12'}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Document Requests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin ? 'Create and manage document requests for your clients.' : 'Respond to document requests from your team.'}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" onClick={() => { resetForm(); setShowNew(true); }}>
              <Plus className="w-4 h-4" /> New Request
            </Button>
          )}
        </div>
      )}
      {embedded && isAdmin && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Create and manage document requests for your clients.
          </p>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" onClick={() => { resetForm(); setShowNew(true); }}>
            <Plus className="w-4 h-4" /> New Request
          </Button>
        </div>
      )}
      {embedded && !isAdmin && (
        <p className="text-sm text-muted-foreground">Respond to document requests from your team.</p>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search requests..."
            className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
          {['All', 'pending', 'uploaded', 'under_review', 'complete'].map(s => (
            <option key={s} value={s}>{s === 'All' ? 'All Status' : STATUS_CONFIG[s]?.label || s}</option>
          ))}
        </select>
      </div>

      {/* Request list */}
      <div className="space-y-3">
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading requests...</p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No document requests found.</p>
          </div>
        )}

        {filtered.map(req => {
          const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
          const isOverdue = req.due_date && isPast(parseISO(req.due_date)) && req.status === 'pending';

          return (
            <div key={req.id} className="rounded-xl border border-border bg-card p-4 hover:border-border/80 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">{req.title}</h3>
                    <Badge variant="outline" className={`text-[10px] ${isOverdue ? 'bg-red-500/10 text-red-400 border-red-500/20' : cfg.color}`}>
                      {isOverdue ? 'Overdue' : cfg.label}
                    </Badge>
                  </div>
                  {req.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>From: <strong className="text-foreground">{req.requested_by || '—'}</strong></span>
                    {req.requested_for_email && (
                      <span>For: <strong className="text-foreground">{req.requested_for_email}</strong></span>
                    )}
                    {req.due_date && (
                      <span className={isOverdue ? 'text-red-400' : ''}>
                        Due: <strong>{format(parseISO(req.due_date), 'MMM d, yyyy')}</strong>
                      </span>
                    )}
                    <span className="ml-auto text-[10px]">{req.created_date ? format(new Date(req.created_date), 'MMM d') : ''}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!isAdmin && req.status === 'pending' && (
                    <UploadDropdown
                      onFilesSelected={(_files) => handleUploadLink(req)}
                      onDriveImport={() => queryClient.invalidateQueries({ queryKey: ['document-requests'] })}
                      multiple={false}
                    >
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Upload className="w-3 h-3" /> Upload
                      </Button>
                    </UploadDropdown>
                  )}
                  {isAdmin && req.status === 'uploaded' && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-purple-400" onClick={() => updateStatus(req.id, 'under_review')}>
                        Review
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400" onClick={() => updateStatus(req.id, 'complete')}>
                        Complete
                      </Button>
                    </>
                  )}
                  {isAdmin && req.status === 'under_review' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400" onClick={() => updateStatus(req.id, 'complete')}>
                      Complete
                    </Button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDelete(req)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Request Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">New Document Request</h3>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {/* Title */}
              <Field label="Title *">
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. 2025 Tax Return"
                  className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50" />
              </Field>

              {/* Description */}
              <Field label="Description">
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="What documents are needed..."
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none" />
              </Field>

              {/* Client selector (admin only) */}
              {isAdmin && (
                <Field label="Assign To Client *">
                  <div className="relative">
                    {form.requested_for_email ? (
                      <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2">
                        <span className="text-sm flex-1">{form.requested_for_email}</span>
                        <button onClick={() => { setForm(f => ({ ...f, requested_for_profile_id: '', requested_for_email: '' })); setClientSearch(''); }}
                          className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setClientDropdown(true); }}
                          onFocus={() => setClientDropdown(true)}
                          placeholder="Search clients by email or name..."
                          className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50"
                        />
                      </div>
                    )}
                    {clientDropdown && !form.requested_for_email && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setClientDropdown(false)} />
                        <div className="absolute z-20 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
                          {filteredClients.slice(0, 20).map(c => (
                            <button key={c.id}
                              onClick={() => {
                                setForm(f => ({ ...f, requested_for_profile_id: c.id, requested_for_email: c.email }));
                                setClientSearch('');
                                setClientDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2">
                              <span className="text-foreground">{c.full_name || c.email}</span>
                              <span className="text-xs text-muted-foreground">{c.email}</span>
                            </button>
                          ))}
                          {filteredClients.length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No clients found</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </Field>
              )}

              {/* Request type */}
              <Field label="Request Type">
                <select value={form.request_type} onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}
                  className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50">
                  {['document', 'financial', 'tax', 'legal', 'other'].map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </Field>

              {/* Due date */}
              <Field label="Due Date">
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50" />
              </Field>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" className="bg-primary text-primary-foreground" onClick={handleCreate} disabled={saving || !form.title.trim() || (isAdmin && !form.requested_for_email)}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Request'}
              </Button>
            </div>
          </div>
        </div>
      )}
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