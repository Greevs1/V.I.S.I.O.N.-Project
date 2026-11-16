import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Search, FileText, RefreshCw, Flag, Trash2, X, Loader2, Upload, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, isAfter } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { useDocumentViewer } from '@/hooks/useDocumentViewer';
import { useOpenDocuments } from '@/lib/visionWorkspace/openDocument';
import DocumentRequests from '@/pages/DocumentRequests';
import DocumentReadinessPanel from '@/components/dataroom/DocumentReadinessPanel';
import SystemFolderPanel from '@/components/dataroom/SystemFolderPanel';
import ClassificationReviewQueue from '@/components/dataroom/ClassificationReviewQueue';
import ExtractedFieldsReviewQueue from '@/components/admin/ExtractedFieldsReviewQueue';
import { suggestFolder, SYSTEM_FOLDERS } from '@/lib/documentReadiness';
import DataRoomTabs from '@/components/documents/DataRoomTabs';
import AssignedToMe from '@/components/dataroom/AssignedToMe';
import DocumentAssignments from '@/components/dataroom/DocumentAssignments';
import AssignDocumentSheet from '@/components/dataroom/AssignDocumentSheet';
import DocumentUnavailableNotice from '@/components/dataroom/DocumentUnavailableNotice';
import { callDocumentAssignments, assignmentIndicator } from '@/lib/documentAssignments';
import { resolveDocumentStates } from '@/lib/documents/documentTypes';
import { useDocumentPipelinePolling } from '@/hooks/useDocumentPipelinePolling';

// ── Constants ────────────────────────────────────────────────────────────────
const DOC_TYPE_LABELS = {
  business_tax_return: 'Business Tax Return',
  personal_tax_return: 'Personal Tax Return',
  profit_and_loss:     'Profit & Loss',
  balance_sheet:       'Balance Sheet',
  debt_schedule:       'Debt Schedule',
  payroll_report:      'Payroll Report',
  insurance_document:  'Insurance',
  entity_document:     'Entity Document',
  buy_sell_agreement:  'Buy-Sell Agreement',
  estate_document:     'Estate Document',
  agreement:           'Agreement',
  client_agreement:    'Client Agreement',
  engagement_letter:   'Engagement Letter',
  exit_readiness:      'Exit Readiness',
  other:               'Other',
};

const SOURCE_LABELS = {
  user_upload:     'User Upload',
  admin_upload:    'Admin Upload',
  exit_readiness:  'Exit Readiness',
  agreement:       'Agreement',
  roadmap:         'Sprint Plan',
  verification:    'Verification',
  assessment:      'Assessment',
};

const STATUS_CONFIG = {
  uploaded:         { label: 'Uploaded',     color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  pending_analysis: { label: 'Processing',    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  queued:           { label: 'Processing',    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  analyzing:        { label: 'Processing',    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  needs_review:     { label: 'Needs Review',  color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  completed:        { label: 'Ready',         color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  failed:           { label: 'Failed',        color: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

// The ANALYSIS column has its own words. An upload and an analysis are different
// facts: a document VISION stores but has no reader for is not a failed upload.
// The ANALYSIS column's words mirror @/lib/documents/documentTypes (the ONE
// vocabulary). A state that means "nothing has decided what this is yet" is never
// shown as a verdict about the document TYPE, and a recognized type that has no
// reader still reads as recognized.
const ANALYSIS_STATUS_CONFIG = {
  analyzed:             { label: 'Analyzed',                      color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  needs_review:         { label: 'Needs confirmation',            color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  processing:           { label: 'Understanding…',                color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  needs_classification: { label: 'Needs classification',          color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  pending:              { label: 'Not analyzed yet',              color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  unsupported:          { label: 'Not supported yet',               color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  // The owner decided the document stays personal — a decision, not a failure.
  failed:               { label: 'Analysis failed',               color: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

// Retry has exactly one meaning: enqueue the durable pipeline from the document's
// current state. The owner-facing scope decision is retired — a scope mismatch no
// longer pauses anything, so there is no decision to satisfy first, and the only
// refusal a Retry can meet is "there is nothing left to re-run".

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function StatusBadge({ status, config = STATUS_CONFIG, fallback = 'uploaded' }) {
  const cfg = config[status] || config[fallback] || {
    label: status || '—',
    color: 'bg-secondary text-muted-foreground border-border',
  };
  return (
    <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
// ── Drag permission helper ────────────────────────────────────────────────────
function canDragDrop(role, supabaseProfile) {
  if (['super_admin', 'admin'].includes(role)) return true;
  if (role === 'owner') return true;
  if (role === 'expert_advisor') return supabaseProfile?.document_management === true;
  return false;
}

export default function DataRoom({ onOpenLayer = null, onBackLayer = null } = {}) {
  const { role, supabaseProfile, isMultiBusiness, allBusinesses, activeContext } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = ['admin', 'super_admin'].includes(role);
  const dragAllowed = canDragDrop(role, supabaseProfile);

  // drag state
  const [draggingDoc, setDraggingDoc] = useState(null); // doc object being dragged
  // Uploading from inside the library stays inside the Galileo document overlay
  // (this page IS that overlay's library view); on the legacy route it falls
  // back to the standalone uploader exactly as before.
  const openDocs = useOpenDocuments();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── LEVELS inside the overlay's navigation stack ─────────────────────────
  // Mounted in the Galileo document overlay, this page owns a place in the
  // layer's stack: opening a SUB-VIEW — the uploader, a document, a tab — pushes
  // a level, so the header's Back means one room backward (Upload → Data Room)
  // and the overlay stays open. Standalone (/data-room) there is no layer, and
  // every control keeps exactly the behaviour it had.
  const handleUpload = useCallback(
    (intent = null) => {
      if (onOpenLayer) {
        onOpenLayer('data-room', null, { mode: 'upload', needs: intent || null });
        return;
      }
      openDocs({ mode: 'upload', needs: intent || null });
    },
    [onOpenLayer, openDocs]
  );

  const handleTabChange = useCallback(
    (nextTab) => {
      // Review / Classification / Requests are sub-rooms of the Data Room; the
      // room's root is the library, which carries no `tab` at all.
      if (onOpenLayer) {
        // Tapping the tab you are already on opens no level.
        if (nextTab === (searchParams.get('tab') || 'dataroom')) return;
        onOpenLayer('data-room', null, { tab: nextTab === 'dataroom' ? null : nextTab });
        return;
      }
      setActiveTab(nextTab);
    },
    [onOpenLayer, searchParams]
  );
  // ── The one document opening contract (@/lib/visionWorkspace/openDocument) ──
  // A caller may ask for an EXACT document, either as a route param
  // (/data-room?document=<id>) or through the Vision workspace layer
  // (?workspace=data-room&id=<id>). It is a request, not a grant — see below.
  const requestedDocumentId =
    searchParams.get('document') ||
    (searchParams.get('workspace') === 'data-room' ? searchParams.get('id') : null);
  // A plain-language statement of what Vision is missing, when the caller knew.
  const needsIntent = searchParams.get('needs');
  // A route-form deep link may carry the surface that sent the owner here (the
  // document contract's `from`). Only a same-origin absolute path is honoured —
  // it is a URL we navigate to, so it is never taken from input unchecked.
  const rawReturn = searchParams.get('from');
  const viewerReturnPath =
    rawReturn && rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : null;
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    ['requests', 'review', 'classification', 'assigned'].includes(initialTab) ? initialTab : 'dataroom'
  );

  // Phase 1D — business scope tab (multi-business users only)
  const [businessScopeTab, setBusinessScopeTab] = useState('all');

  const [search, setSearch]               = useState('');
  const [filterType, setFilterType]       = useState('all');
  const [filterSource, setFilterSource]   = useState('all');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterDate, setFilterDate]       = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null); // null = All Documents
  // A requested document this business's Data Room does not hold: nothing opens,
  // and the surface says so calmly (never which business it might belong to).
  const [unavailableDocument, setUnavailableDocument] = useState(false);
  // A drag ends with a click; this keeps that click from opening the document.
  const suppressRowClickRef = useRef(false);

  // Use centralized document viewer hook
  const {
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    openDocumentViewer,
    closeDocumentViewer,
    downloadDocument,
    openDocumentInNewTab,
    // What VISION has actually read from the opened document — reported by the
    // same authorized call that minted the view URL.
    documentEvidence,
  } = useDocumentViewer();

  // selected business context (admin only)
  // Phase 6.9 — this was pinned to the profile's PRIMARY business, so the Data Room
  // showed that business's documents no matter which business was selected, and the
  // cache key inherited the same wrong identity. The canonical active business is
  // authoritative; primary is only a fallback before a context has resolved.
  const selectedBusinessId = activeContext?.businessId || supabaseProfile?.primary_business_id || null;

  const { data: documents = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['data-room-documents', selectedBusinessId, role],
    queryFn: async () => {
      console.log('[DataRoom] Fetching documents...', {
        selectedBusinessId,
        role,
        profileId: supabaseProfile?.id,
        primaryBusinessId: supabaseProfile?.primary_business_id,
      });
      const payload = {
        action: 'getDataRoomDocuments',
        data: { selectedBusinessId },
      };
      console.log('[DataRoom] payload', JSON.stringify(payload));
      const res = await base44.functions.invoke('supabaseUserData', payload);
      console.log('[DataRoom] Response:', {
        status: res.status,
        docCount: res.data?.documents?.length,
        error: res.data?.error,
        hasData: !!res.data,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const docs = res.data?.documents || [];
      // Store debug info for empty state
      window.__dataRoomDebug = res.data?._debug || null;
      return docs.map(d => ({
        ...d,
        name: d.name || (d.file_path ? d.file_path.split('/').pop().replace(/^\d+_/, '') : null) || '—',
      }));
    },
    staleTime: 30_000,
    retry: 1,
  });

  // ── Extraction review counts (server-computed, real) ─────────────────────
  // One call, scoped to the same business the list above is showing, so the
  // banner and the row hints speak for THIS Data Room rather than the profile.
  const { data: reviewSummary } = useQuery({
    queryKey: ['extraction-review-summary', selectedBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getExtractionReviewSummary',
        data: { businessId: selectedBusinessId },
      });
      return res.data || null;
    },
    staleTime: 15_000,
  });
  const reviewTotals = reviewSummary?.totals || null;
  const documentReview = reviewSummary?.documents || {};

  // ── The pipeline continues after the upload response ──────────────────────
  // Understanding and extraction run as post-response work (a document's content
  // read cannot be awaited inside an upload), so a document may become classified
  // a few seconds after it appears here. The page re-reads the canonical rows
  // until they state an outcome — it never guesses at one.
  useDocumentPipelinePolling(documents, refetch);

  // ── Document assignments — the collaboration layer ────────────────────────
  // ONE business-scoped call feeds every surface: the row indicators, the
  // viewer's "Assigned to" block, the "Assigned to Me" view and the assign panel.
  // The BACKEND resolves the active business, proves the actor, and decides
  // `can_manage` from the existing role model — this page only reflects it.
  const assignmentsQuery = useQuery({
    queryKey: ['document-assignments', selectedBusinessId, role],
    queryFn: () => callDocumentAssignments('listForBusiness', { active_business_id: selectedBusinessId }),
    enabled: !!selectedBusinessId,
    staleTime: 20_000,
  });
  const assignments = assignmentsQuery.data?.assignments || [];
  const assignmentMe = assignmentsQuery.data?.me || null;
  const canAssignDocuments = !!assignmentMe?.can_manage;
  const myProfileId = assignmentMe?.profile_id || null;

  const assignmentsByDocument = useMemo(() => {
    const map = {};
    for (const a of assignments) {
      if (!map[a.document_id]) map[a.document_id] = [];
      map[a.document_id].push(a);
    }
    return map;
  }, [assignments]);

  const myAssignments = useMemo(
    () => assignments.filter((a) => a.assignee_profile_id === myProfileId),
    [assignments, myProfileId]
  );

  const [assignTarget, setAssignTarget] = useState(null); // document whose panel is open
  const [busyAssignmentId, setBusyAssignmentId] = useState(null);

  const refreshAssignments = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['document-assignments'] }),
    [queryClient]
  );

  // Complete / reopen. This writes assignment state ONLY — extraction review and
  // BIS are separate systems and are never touched by it (§11).
  const handleAssignmentStatus = useCallback(
    async (assignment) => {
      setBusyAssignmentId(assignment.id);
      try {
        await callDocumentAssignments('setStatus', {
          assignment_id: assignment.id,
          status: assignment.status === 'completed' ? 'open' : 'completed',
          active_business_id: selectedBusinessId,
        });
        refreshAssignments();
      } catch (e) {
        toast.error(e?.message || 'Could not update that assignment');
      } finally {
        setBusyAssignmentId(null);
      }
    },
    [selectedBusinessId, refreshAssignments]
  );

  // ── Open the requested EXACT document ────────────────────────────────────
  // The list above is already scoped to the active business by the backend, so
  // a document that is not in it does not belong to this business's Data Room.
  // We then fail closed: no viewer, and the request is cleared from the URL so
  // a refresh cannot retry a document the caller is not entitled to.
  const requestedRef = useRef(null);
  const clearRequestedDocument = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('document');
    if (params.get('workspace') === 'data-room') params.delete('id');
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!requestedDocumentId || requestedRef.current === requestedDocumentId) return;
    if (isLoading || isError) return;
    requestedRef.current = requestedDocumentId;
    const doc = documents.find((d) => d.id === requestedDocumentId);
    if (doc) {
      setUnavailableDocument(false);
      openDocumentViewer(doc);
    } else {
      // The id is not in THIS business's own list, so nothing is opened and the
      // request leaves the URL (a refresh cannot retry it). A deleted document
      // and a foreign one are therefore indistinguishable from the outside.
      setUnavailableDocument(true);
      clearRequestedDocument();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDocumentId, documents, isLoading, isError]);

  // Back out of the viewer LEVEL: the id leaves the URL, so the viewer closes and
  // the repository — which never left — is what the owner sees. Closing the
  // viewer by its own control takes the same step back (see onClose below).
  useEffect(() => {
    if (requestedDocumentId) return;
    if (requestedRef.current && isDocumentViewerOpen) {
      requestedRef.current = null;
      closeDocumentViewer();
    }
  }, [requestedDocumentId, isDocumentViewerOpen, closeDocumentViewer]);

  // ── Phase 1D: business scope filtering (client-side, multi-business only) ──
  const scopeFilteredDocs = useMemo(() => {
    if (!isMultiBusiness || businessScopeTab === 'all') return documents;
    if (businessScopeTab === 'household') {
      return documents.filter(d =>
        d.document_scope === 'household' ||
        (d.document_scope === 'profile' && !d.business_id) ||
        (!d.business_id && !d.document_scope)
      );
    }
    if (businessScopeTab === 'hybrid') {
      return documents.filter(d =>
        ['hybrid', 'shared', 'portfolio'].includes(d.document_scope) ||
        (!d.business_id && d.document_scope === 'hybrid')
      );
    }
    // Business-specific tab — tab id = business id
    return documents.filter(d => d.business_id === businessScopeTab);
  }, [documents, isMultiBusiness, businessScopeTab]);

  // Build tab definitions (only for multi-business users)
  const businessScopeTabs = useMemo(() => {
    if (!isMultiBusiness) return [];
    const householdCount = documents.filter(d =>
      d.document_scope === 'household' ||
      (d.document_scope === 'profile' && !d.business_id) ||
      (!d.business_id && !d.document_scope)
    ).length;
    const hybridCount = documents.filter(d =>
      ['hybrid', 'shared', 'portfolio'].includes(d.document_scope) ||
      (!d.business_id && d.document_scope === 'hybrid')
    ).length;
    const tabs = [{ id: 'all', label: 'All', count: documents.length }];
    if (householdCount > 0) tabs.push({ id: 'household', label: 'Household', count: householdCount });
    for (const biz of allBusinesses) {
      const count = documents.filter(d => d.business_id === biz.id).length;
      tabs.push({ id: biz.id, label: biz.name || biz.business_name || 'Business', count });
    }
    if (hybridCount > 0) tabs.push({ id: 'hybrid', label: 'Hybrid / Shared', count: hybridCount });
    return tabs;
  }, [isMultiBusiness, documents, allBusinesses]);

  // ── Filtered documents ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const cutoff = filterDate === 'all' ? null
      : filterDate === '7d'  ? subDays(new Date(), 7)
      : filterDate === '30d' ? subDays(new Date(), 30)
      : filterDate === '90d' ? subDays(new Date(), 90)
      : null;

    return scopeFilteredDocs.filter(d => {
      // Folder filter — use auto-suggested folder if doc has no explicit assignment
      if (selectedFolder !== null) {
        const docFolder = d.system_folder || suggestFolder(d);
        if (docFolder !== selectedFolder) return false;
      }
      if (filterType   !== 'all' && d.document_type !== filterType)              return false;
      if (filterSource !== 'all' && (d.upload_source || 'user_upload') !== filterSource) return false;
      if (filterStatus !== 'all' && (d.upload_status || 'uploaded') !== filterStatus) return false;
      if (cutoff && !isAfter(new Date(d.created_at), cutoff))         return false;
      if (!q) return true;
      return (
        (d.name || '').toLowerCase().includes(q) ||
        (DOC_TYPE_LABELS[d.document_type] || '').toLowerCase().includes(q) ||
        (d.business_name || '').toLowerCase().includes(q) ||
        (d.upload_source || '').toLowerCase().includes(q)
      );
    });
  }, [scopeFilteredDocs, search, filterType, filterSource, filterStatus, filterDate, selectedFolder]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleOpenDocument = async (doc) => {
    // In the overlay the viewer is a LEVEL of the stack: the document id goes
    // into the URL — the contract's own shape — so the header's Back returns to
    // the repository and the browser's Back does the same. The fail-closed
    // lookup below is untouched: the id is a REQUEST against this business's
    // document list, never a grant.
    if (onOpenLayer) {
      // Already on this document's level (a double tap): no second level.
      if (requestedDocumentId !== doc.id) onOpenLayer('data-room', doc.id);
      return;
    }
    await openDocumentViewer(doc);
  };

  /**
   * A click anywhere on a document row opens THAT document — by id, through the
   * one document contract. A control inside the row stops the click before it
   * reaches here, so opening a document is never a side effect of another action.
   */
  const handleRowOpen = (doc) => {
    if (suppressRowClickRef.current) return;
    handleOpenDocument(doc);
  };

  const handleRetryAnalysis = async (docId) => {
    // Retry re-enqueues the durable pipeline. It cannot skip a decision the owner
    // still owes VISION — so a refusal is surfaced as the decision it is, instead
    // of appearing to do nothing.
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'retryDocumentAnalysis',
        data: { documentId: docId },
      });
      // A refusal is a real answer, stated as one: 'not_resumable' means the durable
      // layer has nothing left to enqueue for this document (it was already read).
      if (res.data?.success === false) {
        toast.info(res.data?.error === 'not_resumable'
          ? 'There is nothing left to re-run for this document.'
          : 'VISION could not queue the analysis for this document.');
        return;
      }
      toast.success('Analysis queued');
    } catch (e) {
      const code = e?.response?.data?.error;
      toast.error(code || e?.message || 'Could not queue the analysis');
    } finally {
      queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
    }
  };

  const handleMarkReview = async (docId) => {
    await base44.functions.invoke('supabaseUserData', { action: 'markDocumentNeedsReview', data: { documentId: docId } });
    toast.success('Marked as needs review');
    queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
  };

  const handleDelete = async (docId) => {
    await base44.functions.invoke('supabaseUserData', { action: 'deleteDocument', data: { documentId: docId } });
    toast.success('Document removed');
    setConfirmDelete(null);
    queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
  };

  const activeFilters = [filterType, filterSource, filterStatus, filterDate].filter(f => f !== 'all').length;
  const clearFilters  = () => { setFilterType('all'); setFilterSource('all'); setFilterStatus('all'); setFilterDate('all'); };

  // ── Drag-and-drop move ────────────────────────────────────────────────────
  const handleMoveToFolder = useCallback(async (doc, targetFolderId) => {
    // No-op if same folder (compare against stored system_folder, not suggestFolder fallback)
    const currentFolder = doc.system_folder || null;
    if (!doc || targetFolderId === currentFolder) return;

    const folderLabel = SYSTEM_FOLDERS.find(f => f.id === targetFolderId)?.label || targetFolderId;
    const oldFolderLabel = SYSTEM_FOLDERS.find(f => f.id === (currentFolder || suggestFolder(doc)))?.label || 'Unknown';

    // super_admin debug log
    if (role === 'super_admin') {
      console.log('[DragDrop] Moving document:', {
        documentId: doc.id,
        documentName: doc.name,
        fromFolder: currentFolder || suggestFolder(doc),
        fromFolderLabel: oldFolderLabel,
        toFolder: targetFolderId,
        toFolderLabel: folderLabel,
      });
    }

    // Optimistic update — set system_folder immediately so folder filter reacts
    const queryKey = ['data-room-documents', selectedBusinessId, role];
    queryClient.setQueryData(queryKey, (old = []) =>
      old.map(d => d.id === doc.id ? { ...d, system_folder: targetFolderId } : d)
    );

    const toastId = `move-${doc.id}`;
    toast.loading(`Moving to ${folderLabel}…`, { id: toastId });

    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'updateDocumentFolder',
        data: { documentId: doc.id, folderId: targetFolderId },
      });

      if (role === 'super_admin') {
        console.log('[DragDrop] Backend response:', res.data);
      }

      if (res.data?.error) throw new Error(res.data.error);

      toast.success(`Moved to ${folderLabel}`, { id: toastId });
      // Hard-refresh from server to confirm the persisted value
      queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
    } catch (err) {
      console.error('[DragDrop] Move failed:', err?.message);
      // Rollback optimistic update
      queryClient.setQueryData(queryKey, (old = []) =>
        old.map(d => d.id === doc.id ? { ...d, system_folder: currentFolder } : d)
      );
      toast.error(`Failed to move: ${err?.message || 'Unknown error'}`, { id: toastId });
    }
  }, [queryClient, selectedBusinessId, role]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">Document Repository</p>
          <h1 className="text-3xl font-display font-bold">Data Room</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All documents across upload, admin, exit readiness, agreements, and more.
          </p>
        </div>
        {activeTab === 'dataroom' && (
          <div className="flex items-center gap-2">
            {/* The Data Room is the destination every Vision upload CTA points
                at, so it has to be able to add a document. It routes to the ONE
                existing uploader rather than growing a second one. */}
            <Button size="sm" onClick={() => handleUpload()} className="gap-2">
              <Upload className="w-3.5 h-3.5" />
              Upload documents
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary w-fit">
        {[
          { id: 'dataroom',        label: 'Data Room' },
          // Offered only where there is an authenticated member context for this
          // business — i.e. when the backend resolved a profile for the actor (§8).
          ...(myProfileId
            ? [{
                id: 'assigned',
                label: myAssignments.length ? `Assigned to Me (${myAssignments.length})` : 'Assigned to Me',
              }]
            : []),
          { id: 'review',          label: reviewTotals?.needs_review ? `Review (${reviewTotals.needs_review})` : 'Review' },
          { id: 'classification',  label: 'Classification' },
          { id: 'requests',        label: 'Document Requests' },
        ].map(tab => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Assigned to Me — what is waiting on ME in this business (§9).
          Rows open the EXACT existing document in the existing viewer. */}
      {activeTab === 'assigned' && (
        <AssignedToMe
          assignments={myAssignments}
          documents={documents}
          canManage={canAssignDocuments}
          busyId={busyAssignmentId}
          onOpenDocument={(doc) => handleOpenDocument(doc)}
          onComplete={handleAssignmentStatus}
          onManage={(doc) => setAssignTarget(doc)}
        />
      )}

      {/* Document Requests tab */}
      {activeTab === 'requests' && <DocumentRequests embedded />}

      {/* Classification tab */}
      {activeTab === 'classification' && (
        <ClassificationReviewQueue isAdmin={isAdmin} businessId={selectedBusinessId} />
      )}

      {/* Review tab — the owner's confirmation surface for extracted facts.
          It IS the existing extracted-fields review UI, mounted here rather than
          rebuilt, and scoped to the business this Data Room is showing. */}
      {activeTab === 'review' && (
        <ExtractedFieldsReviewQueue summary={reviewSummary} businessId={selectedBusinessId} />
      )}

      {/* Data Room tab content below */}
      {activeTab !== 'dataroom' && null}
      {activeTab === 'dataroom' && <>

      {/* Phase 1D — Business scope tabs (multi-business only) */}
      {isMultiBusiness && businessScopeTabs.length > 1 && (
        <DataRoomTabs
          tabs={businessScopeTabs}
          activeTab={businessScopeTab}
          onSelect={setBusinessScopeTab}
        />
      )}

      {/* A requested document this business does not hold — deleted, or never
          ours: stated plainly, with the library one step away. */}
      {unavailableDocument && (
        <DocumentUnavailableNotice onBack={() => setUnavailableDocument(false)} />
      )}

      {/* ── Contextual request ──────────────────────────────────────────────
          A lightweight header stating WHY a document is being asked for. It sits
          above the EXISTING upload flow and changes nothing about it. */}
      {needsIntent && (
        <div className="glass rounded-xl p-4 border border-primary/25">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">
                Vision needs more information
              </p>
              <p className="text-sm font-medium mt-1">{needsIntent}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a Profit &amp; Loss statement, a tax return, or another supported financial
                statement to improve this analysis.
              </p>
            </div>
            <Button size="sm" onClick={() => handleUpload(needsIntent)} className="gap-2 shrink-0">
              <Upload className="w-3.5 h-3.5" /> Upload
            </Button>
            <button
              type="button"
              aria-label="Dismiss request"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.delete('needs');
                setSearchParams(params, { replace: true });
              }}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* FINANCIALS ANALYZED — real counts, with the next step made obvious. */}
      {reviewTotals && reviewTotals.total > 0 && (
        <div className="glass rounded-xl p-4 border border-primary/20">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">
                Financials analyzed
              </p>
              {reviewTotals.needs_review > 0 ? (
                <>
                  <p className="text-sm mt-1">
                    Vision found <strong>{reviewTotals.total}</strong> financial {reviewTotals.total === 1 ? 'fact' : 'facts'}.{' '}
                    <span className="text-emerald-400">{reviewTotals.ready} ready</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-amber-400">{reviewTotals.needs_review} need your review</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {reviewTotals.ready > 0
                      ? 'The confirmed facts are already in use. The rest cannot be used throughout Business Intelligence until you confirm them.'
                      : 'They cannot be used throughout Business Intelligence until you confirm them.'}
                  </p>
                </>
              ) : (
                <p className="text-sm mt-1">
                  Vision found <strong>{reviewTotals.total}</strong> financial {reviewTotals.total === 1 ? 'fact' : 'facts'} — all confirmed and in use.
                </p>
              )}
            </div>
            {reviewTotals.needs_review > 0 && (
              <Button size="sm" onClick={() => handleTabChange('review')} className="gap-1.5 shrink-0">
                Review extracted information
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Readiness Panel */}
      <DocumentReadinessPanel documents={documents} />

      {/* Folder + Document layout */}
      <div className="flex gap-5 items-start">
        {/* Folder sidebar */}
        <SystemFolderPanel
          documents={documents}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          draggingDoc={draggingDoc}
          onDropToFolder={handleMoveToFolder}
        />

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">

      {/* Active folder label */}
      {selectedFolder && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Viewing:</span>
          <span className="font-medium text-primary">{SYSTEM_FOLDERS.find(f => f.id === selectedFolder)?.label || selectedFolder}</span>
          <button onClick={() => setSelectedFolder(null)} className="text-muted-foreground hover:text-foreground ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',        value: filtered.length },
          { label: 'Completed',    value: filtered.filter(d => d.upload_status === 'completed').length },
          { label: 'Needs Review', value: filtered.filter(d => d.upload_status === 'needs_review').length },
          { label: 'Pending',      value: filtered.filter(d => ['pending_analysis','queued','analyzing'].includes(d.upload_status)).length },
        ].map(s => (
          <div key={s.label} className="glass rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, type, business…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-secondary border-border"
            />
          </div>

          {/* Doc type */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-44 text-xs bg-secondary border-border">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Source */}
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-9 w-40 text-xs bg-secondary border-border">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-40 text-xs bg-secondary border-border">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([v, cfg]) => (
                <SelectItem key={v} value={v}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <Select value={filterDate} onValueChange={setFilterDate}>
            <SelectTrigger className="h-9 w-36 text-xs bg-secondary border-border">
              <SelectValue placeholder="Any Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Date</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs text-muted-foreground h-9">
              <X className="w-3.5 h-3.5" />
              Clear ({activeFilters})
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} of {documents.length} documents
        </p>
      </div>

      {/* Table.
          The list is wider than a narrow window, so the metadata scrolls and the
          Actions column stays put at the right edge — one pinned column, the way
          a spreadsheet freezes one. No extra chrome: a hairline and an opaque
          surface are all it takes to keep the column legible as rows pass under. */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="border-border bg-secondary/30">
              <TableHead className="text-[10px] uppercase tracking-wider">Document</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Type</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Uploaded</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Size</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Folder</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Analysis</TableHead>
              {isAdmin && <TableHead className="text-[10px] uppercase tracking-wider">Business</TableHead>}
              {/* Frozen to the right edge: it masks whatever scrolls beneath it. */}
              <TableHead className="text-[10px] uppercase tracking-wider sticky right-0 z-20 bg-card border-l border-border/40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Loading documents…</p>
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-12">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 max-w-md mx-auto text-left">
                    <p className="text-sm font-semibold text-red-400 mb-1">Query Error</p>
                    <p className="text-xs text-red-300/80 break-all">{error?.message || 'Unknown error'}</p>
                    {!supabaseProfile && (
                      <p className="text-xs text-amber-400 mt-2">Profile not loaded yet. Try refreshing.</p>
                    )}
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 gap-1.5 text-xs h-8">
                      <RefreshCw className="w-3 h-3" /> Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-12">
                  {documents.length === 0 ? (
                    <div className="max-w-md mx-auto text-left space-y-2">
                      <p className="text-sm text-muted-foreground font-medium">No documents found</p>
                      <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
                        <p><strong>Profile:</strong> {supabaseProfile?.id || 'Not loaded'}</p>
                        <p><strong>Business ID:</strong> {selectedBusinessId || 'None'}</p>
                        <p><strong>Role:</strong> {role || 'Unknown'}</p>
                        <p><strong>Bucket filter:</strong> documents</p>
                        <p><strong>Scope filter:</strong> client_document</p>
                        <p className="text-amber-400 mt-1">
                          Possible causes: no files uploaded yet, or existing files missing file_scope metadata.
                          If files were uploaded before the bucket/scope architecture, run the backfill.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleUpload()} className="gap-1.5 text-xs h-8">
                          <Upload className="w-3 h-3" /> Upload documents
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs h-8">
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No documents match your filters.</p>
                  )}
                </TableCell>
              </TableRow>
            )}
            {filtered.map(doc => {
              const states = resolveDocumentStates(doc);
              const assignmentBadge = assignmentIndicator(assignmentsByDocument[doc.id]);
              return (
                <TableRow
                  key={doc.id}
                  className={`border-border/50 hover:bg-secondary/20 transition-colors ${dragAllowed ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${draggingDoc?.id === doc.id ? 'opacity-40' : ''}`}
                  draggable={dragAllowed}
                  title={dragAllowed ? 'Open · drag to move to a folder' : 'Open document'}
                  onClick={() => handleRowOpen(doc)}
                  onDragStart={dragAllowed ? (e) => {
                    // A drag is not a click.
                    suppressRowClickRef.current = true;
                    setDraggingDoc(doc);
                    e.dataTransfer.effectAllowed = 'move';
                  } : undefined}
                  onDragEnd={() => {
                    setDraggingDoc(null);
                    setTimeout(() => { suppressRowClickRef.current = false; }, 0);
                  }}
                >
                  {/* Name — with the restrained collaboration indicator (§6) */}
                  <TableCell className="max-w-[220px]">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" title={doc.name}>{doc.name}</span>
                    </div>
                    {assignmentBadge && (
                      <button
                        type="button"
                        onClick={(e) => {
                          // Its own action — never the row's.
                          e.stopPropagation();
                          setAssignTarget(doc);
                        }}
                        title="Who has this document, and what they need to do"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-vision-gold/80 hover:text-vision-gold transition-colors"
                      >
                        <Users className="w-3 h-3" />
                        {assignmentBadge}
                      </button>
                    )}
                  </TableCell>

                  {/* Type */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {DOC_TYPE_LABELS[doc.document_type] || doc.document_type || '—'}
                  </TableCell>

                  {/* Source */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {SOURCE_LABELS[doc.upload_source] || doc.upload_source || '—'}
                  </TableCell>

                  {/* Date */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {doc.created_at ? format(new Date(doc.created_at), 'MMM d, yyyy') : '—'}
                  </TableCell>

                  {/* Size */}
                  <TableCell className="text-xs text-muted-foreground">
                    {formatBytes(doc.file_size)}
                  </TableCell>

                  {/* Upload status */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={states.upload} />
                      {/* "Ready" means extraction finished. Material facts that
                          still await confirmation are stated separately, so Ready
                          is never read as "nothing left to do". */}
                      {documentReview[doc.id]?.needs_review > 0 && (
                        <span className="text-[10px] text-amber-400">
                          {documentReview[doc.id].needs_review}{' '}
                          {documentReview[doc.id].needs_review === 1 ? 'fact needs review' : 'facts need review'}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Folder */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {(() => {
                      const folderId = doc.system_folder || suggestFolder(doc);
                      return SYSTEM_FOLDERS.find(f => f.id === folderId)?.label || '—';
                    })()}
                  </TableCell>

                  {/* Analysis status + confidence */}
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={states.analysis} config={ANALYSIS_STATUS_CONFIG} fallback="pending" />
                      {states.note && (
                        <span className="text-[10px] text-muted-foreground">{states.note}</span>
                      )}
                      {doc.confidence_score > 0 && (
                        <span className="text-[10px] text-emerald-400">{doc.confidence_score}% confidence</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Business (admin only) */}
                  {isAdmin && (
                    <TableCell className="text-xs text-muted-foreground">
                      {doc.business_name || '—'}
                    </TableCell>
                  )}

                  {/* Actions — frozen at the right edge, and a click inside it
                      belongs to the control, never to the row. */}
                  <TableCell
                    className="sticky right-0 z-10 bg-card border-l border-border/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      {(doc.file_url || doc.file_path) && (
                        <button
                          onClick={() => handleOpenDocument(doc)}
                          className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded"
                          title="Preview">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['failed', 'needs_review', 'processing'].includes(states.analysis) && (
                        <button
                          onClick={() => handleRetryAnalysis(doc.id)}
                          className="p-1.5 text-muted-foreground hover:text-blue-400 transition-colors rounded"
                          title="Retry Analysis">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleMarkReview(doc.id)}
                        className="p-1.5 text-muted-foreground hover:text-orange-400 transition-colors rounded"
                        title="Mark Needs Review">
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                      {confirmDelete === doc.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(doc.id)} className="text-[10px] text-red-400 hover:text-red-300 font-medium">
                            Confirm
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="text-[10px] text-muted-foreground hover:text-foreground">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(doc.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                          title="Delete Metadata">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Document Viewer - rendered at page level */}
      {isDocumentViewerOpen && (
        <DocumentViewer
          isOpen={isDocumentViewerOpen}
          onClose={() => {
            // Closing the viewer is one step BACK, not a way out. In the overlay
            // the viewer is a level of the stack, so stepping back leaves the
            // repository on screen. A route-form deep link returns to the surface
            // that sent the owner here (Assessment → source → Assessment), and
            // otherwise the deep link is cleared so a refresh cannot reopen a
            // document the owner has closed.
            if (onBackLayer && requestedDocumentId) {
              onBackLayer();
              return;
            }
            if (viewerReturnPath) {
              navigate(viewerReturnPath);
              return;
            }
            closeDocumentViewer();
            clearRequestedDocument();
          }}
          document={selectedDocument}
          signedUrl={documentSignedUrl}
          evidenceTotal={documentEvidence ?? 0}
          onDownload={() => downloadDocument(selectedDocument)}
          onOpenNewTab={() => openDocumentInNewTab()}
          collaboration={
            selectedDocument && (
              <DocumentAssignments
                assignments={assignmentsByDocument[selectedDocument.id] || []}
                canManage={canAssignDocuments}
                busyId={busyAssignmentId}
                onComplete={handleAssignmentStatus}
                onManage={() =>
                  setAssignTarget(
                    documents.find((d) => d.id === selectedDocument.id) || {
                      id: selectedDocument.id,
                      name: selectedDocument.name,
                    }
                  )
                }
              />
            )
          }
        />
      )}

      {/* The assign panel — a panel OVER the surface, never a navigation step, so
          the document behind it is exactly where the owner left it (§24/§25). */}
      {assignTarget && (
        <AssignDocumentSheet
          document={assignTarget}
          businessId={selectedBusinessId}
          assignments={assignmentsByDocument[assignTarget.id] || []}
          meProfileId={myProfileId}
          canManage={canAssignDocuments}
          onClose={() => setAssignTarget(null)}
          onChanged={refreshAssignments}
        />
      )}

        </div>{/* end main content */}
      </div>{/* end folder + content layout */}
      </>}
    </div>
  );
}