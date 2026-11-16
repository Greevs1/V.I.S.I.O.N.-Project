/**
 * ExpertClientDocuments — read-only Data Room for expert advisor portal.
 * Uses the existing DocumentViewer + useDocumentViewer hook.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, FileText, Eye } from 'lucide-react';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { useDocumentViewer } from '@/hooks/useDocumentViewer';

const TYPE_LABELS = {
  financial: 'Financial', tax: 'Tax', legal: 'Legal',
  operating: 'Operating', other: 'Other', document: 'Document',
};

const STATUS_COLORS = {
  completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  uploaded: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  pending_analysis: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  needs_review: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
};

export default function ExpertClientDocuments({ clientProfileId, clientBusinessId, clientEmail }) {
  const {
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    openDocumentViewer,
    closeDocumentViewer,
    openDocumentInNewTab,
  } = useDocumentViewer();

  // Use same source as Admin → Users & Clients → Documents tab
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['expert-client-documents', clientEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getClientDocumentsForUser',
        _router_user_email: clientEmail,
        data: { selectedProfileId: clientProfileId, selectedBusinessId: clientBusinessId },
      });
      return res.data?.documents || [];
    },
    enabled: !!clientEmail,
    staleTime: 60000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!documents.length) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-2">
        <FileText className="w-7 h-7 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No documents uploaded by this client yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Data Room — {documents.length} document{documents.length !== 1 ? 's' : ''}</p>
          <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">Read-Only</span>
        </div>

        {documents.map(doc => {
          const statusClass = STATUS_COLORS[doc.upload_status] || 'text-muted-foreground bg-secondary border-border';
          return (
            <div key={doc.id} className="glass rounded-xl p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.name || 'Untitled'}</p>
                <p className="text-xs text-muted-foreground">
                  {TYPE_LABELS[doc.document_type] || doc.document_type || 'Document'}
                  {doc.created_at && ` · ${new Date(doc.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <span className={`text-[10px] border rounded-full px-2 py-0.5 shrink-0 ${statusClass}`}>
                {(doc.upload_status || 'uploaded').replace(/_/g, ' ')}
              </span>
              {(doc.file_url || doc.file_path) && (
                <button
                  onClick={() => openDocumentViewer(doc)}
                  className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors"
                  title="View document"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <DocumentViewer
        isOpen={isDocumentViewerOpen}
        onClose={closeDocumentViewer}
        document={selectedDocument}
        signedUrl={documentSignedUrl}
        onOpenNewTab={() => openDocumentInNewTab()}
      />
    </>
  );
}