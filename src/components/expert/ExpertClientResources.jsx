/**
 * ExpertClientResources — read-only assigned resources for expert advisor portal.
 * Uses the same supabaseUserData → getAssignedResources source the client's Resource Library uses.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, BookOpen } from 'lucide-react';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { useDocumentViewer } from '@/hooks/useDocumentViewer';
import AssignedResourceCard from '@/components/resources/AssignedResourceCard';

export default function ExpertClientResources({ clientProfileId, clientBusinessId, clientEmail }) {
  const {
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    openDocumentViewer,
    closeDocumentViewer,
    openDocumentInNewTab,
  } = useDocumentViewer();

  // Use same source as Admin → Users & Clients → Resources tab
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['expert-client-resources', clientEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getAssignedResources',
        _router_user_email: clientEmail,
        data: { selectedProfileId: clientProfileId, selectedBusinessId: clientBusinessId },
      });
      return res.data?.resources || [];
    },
    enabled: !!clientEmail,
    staleTime: 60000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!resources.length) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-2">
        <BookOpen className="w-7 h-7 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No resources assigned to this client yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Assigned Resources — {resources.length} item{resources.length !== 1 ? 's' : ''}</p>
          <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">Read-Only</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map(resource => (
            <AssignedResourceCard
              key={resource.id}
              resource={resource}
              onPreviewRequest={openDocumentViewer}
              onDownload={null}
            />
          ))}
        </div>
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