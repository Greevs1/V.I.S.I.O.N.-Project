import React, { useState, useRef } from 'react';
import { FileText, Download, Trash2, Search, Upload, Loader2, RefreshCw, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { useDocumentViewer } from '@/hooks/useDocumentViewer';
import UserAssignmentModal from '@/components/shared/UserAssignmentModal';

const DOC_TYPES = ['profit_and_loss','balance_sheet','business_tax_return','personal_tax_return','payroll_report','agreement','other'];

const statusColors = {
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  processing: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  uploading: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  uploaded: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function AdminFiles() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('other');
  const fileInputRef = useRef(null);

  // Assign modal state
  const [assignDoc, setAssignDoc] = useState(null);

  // Use centralized document viewer hook
  const {
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    openDocumentViewer,
    closeDocumentViewer,
    downloadDocument,
    openDocumentInNewTab,
  } = useDocumentViewer();

  const { data: docs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-docs'],
    queryFn: async () => {
      console.log('[AdminFiles] Fetching consulting library files...');
      const res = await base44.functions.invoke('getDocumentsAdmin', {});
      console.log('[AdminFiles] Response:', {
        status: res.status,
        docCount: res.data?.documents?.length,
        error: res.data?.error,
        hasData: !!res.data,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data?.documents || [];
    },
    retry: 1,
  });

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const reader = new FileReader();
      const base64File = await new Promise(resolve => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const res = await base44.functions.invoke('adminUploadLibraryFile', {
        fileName: file.name, fileType: file.type, fileSize: file.size,
        documentType: docType, base64File,
      });
      if (res.data?.success) toast.success(`Uploaded ${file.name}`);
      else toast.error(`Failed: ${res.data?.error || file.name}`);
    }
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    const res = await base44.functions.invoke('getDocumentsAdmin', { action: 'delete', document_id: doc.id });
    if (res.data?.success) {
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
      toast.success('File deleted');
    } else {
      toast.error(res.data?.error || 'Delete failed');
    }
  };

  const handleOpenDocument = async (doc) => {
    await openDocumentViewer(doc);
  };

  const handleAssign = async (selectedUser) => {
    if (!assignDoc || !selectedUser?.email) return;
    const res = await base44.functions.invoke('assignDocumentToUser', {
      document_id: assignDoc.id,
      target_email: selectedUser.email,
    });
    if (res.data?.success) {
      toast.success(`Document assigned to ${selectedUser.full_name || selectedUser.email}`);
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
    } else {
      throw new Error(res.data?.error || 'Assignment failed');
    }
  };

  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || (d.name || '').toLowerCase().includes(q);
    const matchType = filterType === 'All' || d.document_type === filterType;
    return matchSearch && matchType;
  });

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-4 border-b border-border flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
              className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
            {['All', ...DOC_TYPES].map(t => (
              <option key={t} value={t}>{t === 'All' ? 'All Types' : t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select value={docType} onChange={e => setDocType(e.target.value)}
            className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
            {DOC_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input ref={fileInputRef} type="file" accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.doc,.docx" multiple className="hidden" onChange={handleUpload} />
          <Button size="sm" className="gap-1.5 text-xs h-9 bg-primary text-primary-foreground" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-docs'] })}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {['File', 'Type', 'Owner', 'Size', 'Status', 'Uploaded', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Loading files…</p>
                </td></tr>
              )}
              {isError && (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 max-w-md mx-auto text-left">
                    <p className="text-sm font-semibold text-red-400 mb-1">Query Error</p>
                    <p className="text-xs text-red-300/80 break-all">{error?.message || 'Unknown error'}</p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 gap-1.5 text-xs h-8">
                      <RefreshCw className="w-3 h-3" /> Retry
                    </Button>
                  </div>
                </td></tr>
              )}
              {!isLoading && !isError && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12">
                  {docs.length === 0 ? (
                    <div className="max-w-md mx-auto text-left space-y-2">
                      <p className="text-sm text-muted-foreground font-medium">No consulting library files found</p>
                      <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
                        <p><strong>Bucket filter:</strong> consulting_library_files</p>
                        <p><strong>Scope filter:</strong> consulting_library</p>
                        <p className="text-amber-400 mt-1">
                          Possible cause: existing files may be missing file_scope metadata. Run the backfill to fix.
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs h-8">
                        <RefreshCw className="w-3 h-3" /> Refresh
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No files match your filters.</p>
                  )}
                </td></tr>
              )}
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground capitalize whitespace-nowrap">{(d.document_type || 'other').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">
                    {d.uploaded_by === d.profile_id ? 'Self' : d.upload_source === 'admin' ? <span className="text-primary text-[10px]">Admin</span> : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatBytes(d.file_size)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 whitespace-nowrap ${statusColors[d.status] || 'bg-secondary text-foreground border-border'}`}>
                      {d.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {(d.created_at || d.uploaded_at) ? new Date(d.created_at || d.uploaded_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAssignDoc(d)}
                        className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded" title="Assign to user"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                      {(d.file_url || d.file_path) && (
                        <button
                          onClick={() => handleOpenDocument(d)}
                          className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded" title="Preview">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(d)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-border bg-secondary/20">
          <p className="text-xs text-muted-foreground">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Assign Modal — uses shared searchable UserAssignmentModal */}
      <UserAssignmentModal
        open={!!assignDoc}
        onClose={() => setAssignDoc(null)}
        title="Assign Document to User"
        subtitle={assignDoc?.name}
        onConfirm={handleAssign}
        confirmLabel="Assign Document"
      />

      {/* Document Viewer - rendered at page level */}
      {isDocumentViewerOpen && (
        <DocumentViewer
          isOpen={isDocumentViewerOpen}
          onClose={closeDocumentViewer}
          document={selectedDocument}
          signedUrl={documentSignedUrl}
          onDownload={() => downloadDocument(selectedDocument)}
          onOpenNewTab={() => openDocumentInNewTab()}
        />
      )}
    </>
  );
}