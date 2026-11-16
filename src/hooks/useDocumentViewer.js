import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Centralized document viewer hook
 * Manages document preview state, signed URL resolution, and viewer actions
 */
export function useDocumentViewer() {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentSignedUrl, setDocumentSignedUrl] = useState(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  // Phase 6D.0-F — SOURCE MISSING. A document whose original file is gone is a
  // SOURCE state, not a load failure: the viewer states it in human language
  // instead of showing a raw error, and says whether retained extraction exists.
  const [sourceMissing, setSourceMissing] = useState(null);
  // How many figures VISION has actually READ from the opened document. It comes
  // back on the SAME authorized call that mints the view URL, so opening a
  // document never costs a second request or a second authorization decision.
  const [documentEvidence, setDocumentEvidence] = useState(null);

  /**
   * Generate signed URL for a document
   * Handles multiple document sources and buckets
   */
  const getDocumentSignedUrl = useCallback(async (document, onSourceState) => {
    if (!document) return null;

    // If already has a signed URL or direct file_url, use it
    if (document.signedUrl) return document.signedUrl;
    if (document.file_url && !document.file_path) return document.file_url;

    try {
      // Determine which backend function to call based on document source
      let signedUrl = null;

      if (document.resource_document_id || document.assignment_id) {
        // Assigned resource - use worksheetResponses action
        const res = await base44.functions.invoke('worksheetResponses', {
          action: 'getResourceSignedUrl',
          data: { resourceId: document.resource_document_id || document.id },
        });
        signedUrl = res.data?.signedUrl;
      } else if (document.id && document.file_path) {
        // Data room or admin document - use supabaseUserData
        const res = await base44.functions.invoke('supabaseUserData', {
          action: 'getDocumentSignedUrl',
          data: { documentId: document.id },
        });
        signedUrl = res.data?.signedUrl;
        // Phase 6D.0 — the SAME authorized response may also state that the source
        // object is gone. That state is carried back to the caller (never re-fetched
        // and never probed a second time).
        if (onSourceState) {
          onSourceState(
            res.data?.source_unavailable
              ? { sourceMissing: true, hasExtraction: Boolean(res.data.has_extraction) }
              : null,
            // Reported by the same call, from the same authorized document
            // context: whether the source object is present and whether VISION
            // has read anything from it are two independent facts.
            Number.isFinite(res.data?.evidence_total) ? res.data.evidence_total : null,
          );
        }
      } else if (document.file_url) {
        // Fallback to direct URL
        signedUrl = document.file_url;
      }

      return signedUrl;
    } catch (error) {
      console.error('[useDocumentViewer] Failed to get signed URL:', error);
      return document.file_url || null;
    }
  }, []);

  /**
   * Open document viewer with a document
   * Automatically resolves signed URL
   */
  const openDocumentViewer = useCallback(async (document) => {
    if (!document) return;

    setIsLoadingPreview(true);
    setPreviewError(null);
    setSourceMissing(null);
    setDocumentEvidence(null);

    try {
      // The ONE authorized resolution call also reports whether the source object
      // is gone — carried out through this collector, so no second request is ever
      // made and the single-call viewer contract is preserved.
      let sourceState = null;
      let evidenceTotal = null;
      const signedUrl = await getDocumentSignedUrl(document, (s, total) => {
        sourceState = s;
        if (total != null) evidenceTotal = total;
      });

      // No link, and that same authorized call said the source object is missing:
      // a state the owner can act on (re-upload), not a failure. Nothing is
      // fabricated, no stored URL is used, and no other endpoint is contacted.
      if (!signedUrl && sourceState?.sourceMissing) {
        setSelectedDocument({
          id: document.id,
          name: document.name || document.title || 'Document',
          document_type: document.document_type,
          file_size: document.file_size,
          file_url: null,
          file_path: null,
          storage_bucket: document.storage_bucket,
          created_at: document.created_at || document.assigned_at,
        });
        setDocumentSignedUrl(null);
        setSourceMissing({ hasExtraction: sourceState.hasExtraction });
        setDocumentEvidence(evidenceTotal);
        setIsDocumentViewerOpen(true);
        setIsLoadingPreview(false);
        return;
      }

      if (!signedUrl && !document.file_url) {
        setPreviewError('Could not generate preview link');
        toast.error('Could not generate preview link');
        setIsLoadingPreview(false);
        return;
      }

      setSelectedDocument({
        id: document.id,
        name: document.name || document.title || 'Document',
        document_type: document.document_type,
        file_size: document.file_size,
        file_url: document.file_url,
        file_path: document.file_path,
        storage_bucket: document.storage_bucket,
        created_at: document.created_at || document.assigned_at,
      });
      
      setDocumentSignedUrl(signedUrl);
      setDocumentEvidence(evidenceTotal);
      setIsDocumentViewerOpen(true);
    } catch (error) {
      console.error('[useDocumentViewer] Failed to open viewer:', error);
      setPreviewError('Failed to load document');
      toast.error('Failed to load document');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getDocumentSignedUrl]);

  /**
   * Close the document viewer
   */
  const closeDocumentViewer = useCallback(() => {
    setIsDocumentViewerOpen(false);
    setSelectedDocument(null);
    setDocumentSignedUrl(null);
    setPreviewError(null);
    setSourceMissing(null);
    setDocumentEvidence(null);
  }, []);

  /**
   * Download a document
   * Forces download by opening in new tab with download attribute
   */
  const downloadDocument = useCallback(async (document, url) => {
    const downloadUrl = url || documentSignedUrl;
    if (!downloadUrl) {
      toast.error('Download link not available');
      return;
    }

    try {
      // Create anchor with download attribute
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = document?.name || 'document';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      
      toast.success('Download started');
    } catch (error) {
      console.error('[useDocumentViewer] Download failed:', error);
      toast.error('Download failed');
    }
  }, [documentSignedUrl]);

  /**
   * Open document in new browser tab
   */
  const openDocumentInNewTab = useCallback((url) => {
    const openUrl = url || documentSignedUrl;
    if (!openUrl) {
      toast.error('Document link not available');
      return;
    }
    window.open(openUrl, '_blank', 'noopener,noreferrer');
  }, [documentSignedUrl]);

  return {
    // State
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    isLoadingPreview,
    previewError,
    sourceMissing,
    documentEvidence,

    // Actions
    openDocumentViewer,
    closeDocumentViewer,
    downloadDocument,
    openDocumentInNewTab,
    getDocumentSignedUrl,
  };
}

export default useDocumentViewer;