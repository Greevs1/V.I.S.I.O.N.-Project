import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, BarChart2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SYSTEM_FOLDERS } from '@/lib/documentReadiness';
import { toast } from 'sonner';

/**
 * ClassificationReviewQueue — the Data Room's Classification view.
 *
 * Phase 6D.0c.3: this screen reads and writes the REAL canonical decision store
 * through supabaseUserData (getClassificationReview + updateDocumentFolder). It no
 * longer calls a backend function that does not exist, and it no longer offers a
 * "Reject" that had no server operation behind it.
 *
 * The two things it can actually do are the two things a person does with a filing
 * suggestion: accept the folder VISION suggested, or choose a different one.
 * Scope/type changes belong to the document's own classification override, which
 * lives on the document itself.
 */

const STATUS_STYLES = {
  auto_filed:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  approved:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  awaiting_review: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  pending:         'bg-secondary text-muted-foreground border-border',
  rejected:        'bg-red-500/15 text-red-400 border-red-500/30',
  overridden:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const STATUS_LABELS = {
  auto_filed: 'filed automatically',
  approved: 'confirmed',
  awaiting_review: 'awaiting your review',
  pending: 'not yet reviewed',
  rejected: 'set aside',
  overridden: 'changed by a person',
};

export default function ClassificationReviewQueue({ isAdmin, businessId = null }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideFolder, setOverrideFolder] = useState('');

  const callReview = async (mode) => {
    const res = await base44.functions.invoke('supabaseUserData', {
      action: 'getClassificationReview',
      data: { businessId, mode },
    });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ['classification-pending', businessId],
    queryFn: async () => (await callReview('pending'))?.records || [],
    enabled: !!businessId,
  });

  const { data: auditLog = [], isLoading: loadingAudit } = useQuery({
    queryKey: ['classification-history', businessId],
    queryFn: async () => (await callReview('history'))?.records || [],
    enabled: !!businessId && activeTab === 'history',
  });

  const { data: stats } = useQuery({
    queryKey: ['classification-stats', businessId],
    queryFn: () => callReview('stats'),
    enabled: !!businessId && activeTab === 'stats' && isAdmin,
  });

  // The one write this screen performs: where the document is filed. It is the
  // existing folder action (the same one drag-and-drop uses), not a second
  // classification system.
  const fileMutation = useMutation({
    mutationFn: ({ documentId, folderId }) => base44.functions.invoke('supabaseUserData', {
      action: 'updateDocumentFolder',
      data: { documentId, folderId },
    }),
    onSuccess: () => {
      toast.success('Folder updated');
      queryClient.invalidateQueries({ queryKey: ['classification-pending', businessId] });
      queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
      setOverrideTarget(null);
      setOverrideFolder('');
    },
    onError: (e) => toast.error(e?.response?.data?.error || e?.message || 'Could not update the folder'),
  });

  const folderLabel = (id) => SYSTEM_FOLDERS.find((f) => f.id === id)?.label || id || '—';

  const TABS = [
    { id: 'pending', label: `Awaiting your review (${pending.length})` },
    { id: 'history', label: 'Filing history' },
    ...(isAdmin ? [{ id: 'stats', label: 'Overview' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-secondary w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!businessId && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Select a business to see how its documents have been filed.
        </div>
      )}

      {businessId && activeTab === 'pending' && (
        loadingPending ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Nothing is waiting for you here</div>
        ) : (
          <div className="space-y-3">
            {pending.map((record) => (
              <div key={record.id} className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{record.document_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      VISION read this and suggests where it belongs. Nothing is filed until you agree.
                    </p>
                  </div>
                  <span className={`text-[11px] border rounded-full px-2.5 py-0.5 shrink-0 ${STATUS_STYLES[record.classification_status] || STATUS_STYLES.pending}`}>
                    {STATUS_LABELS[record.classification_status] || record.classification_status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-3.5 h-3.5" />
                    {folderLabel(record.suggested_folder)}
                    {record.suggested_subfolder ? ` / ${record.suggested_subfolder}` : ''}
                  </span>
                  {record.confidence_score !== null && (
                    <span className="flex items-center gap-1">
                      <BarChart2 className="w-3.5 h-3.5" />
                      recognition quality {record.confidence_score}%
                    </span>
                  )}
                </div>
                {overrideTarget === record.id ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={overrideFolder}
                      onChange={(e) => setOverrideFolder(e.target.value)}
                      className="flex-1 h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/50"
                    >
                      <option value="">Select folder…</option>
                      {SYSTEM_FOLDERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => fileMutation.mutate({ documentId: record.document_id, folderId: overrideFolder })}
                      disabled={!overrideFolder || fileMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOverrideTarget(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={!record.suggested_folder || fileMutation.isPending}
                      onClick={() => fileMutation.mutate({ documentId: record.document_id, folderId: record.suggested_folder })}
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> File it here
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => { setOverrideTarget(record.id); setOverrideFolder(record.suggested_folder || ''); }}
                    >
                      Choose a different folder
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {businessId && activeTab === 'history' && (
        loadingAudit ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : auditLog.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No filing history yet</div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  {['Document', 'Folder', 'Recognition', 'Status', 'Filed'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLog.map((record) => (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="px-4 py-3 text-xs font-medium truncate max-w-[200px]">{record.document_name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{folderLabel(record.applied_folder || record.suggested_folder)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{record.confidence_score !== null ? `${record.confidence_score}%` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] border rounded-full px-2.5 py-0.5 ${STATUS_STYLES[record.classification_status] || STATUS_STYLES.pending}`}>
                        {STATUS_LABELS[record.classification_status] || record.classification_status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {record.filed_at ? new Date(record.filed_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {businessId && activeTab === 'stats' && isAdmin && (
        <div className="grid grid-cols-3 gap-4">
          {stats ? [
            { label: 'Documents classified', value: stats.total },
            { label: 'Filed automatically', value: stats.auto_filed },
            { label: 'Reviewed by a person', value: stats.manual_reviews },
            { label: 'Awaiting review', value: stats.pending },
            { label: 'Confirmed rate', value: `${stats.approval_rate}%` },
            { label: 'Avg recognition quality', value: `${stats.avg_confidence}%` },
          ].map((s) => (
            <div key={s.label} className="glass rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-display font-bold mt-1 text-primary">{s.value}</p>
            </div>
          )) : <div className="col-span-3 flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        </div>
      )}
    </div>
  );
}