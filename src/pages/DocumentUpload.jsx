import React, { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, CheckCircle2, AlertCircle, Clock, Trash2, RotateCcw } from 'lucide-react';
import UploadDropdown from '@/components/documents/UploadDropdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import SaveProgressModal from '@/components/auth/SaveProgressModal';
import { saveAnonymousDocumentMeta } from '@/lib/anonymousSession';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import {
  DOCUMENT_TYPES as DOC_TYPES,
  AUTO_DETECT_DOCUMENT_TYPE,
  documentTypeLabel,
  resolveDocumentStates,
  analysisLabel,
} from '@/lib/documents/documentTypes';
import { useDocumentPipelinePolling } from '@/hooks/useDocumentPipelinePolling';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 25 * 1024 * 1024;   // 25 MB per file
const MAX_FILES_PER_BATCH = 10;
const MAX_BATCH_SIZE = 150 * 1024 * 1024; // 150 MB total
const MAX_CONCURRENT = 2;

const ALLOWED_EXTENSIONS = ['pdf', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'];
const BLOCKED_EXTENSIONS = ['exe', 'js', 'html', 'php', 'zip', 'sh', 'bat', 'cmd', 'msi', 'dmg'];

// Document types come from the shared vocabulary (@/lib/documents/documentTypes):
// one list, whose `readable` flag is derived from the extraction engine's real
// readers, so this page can never present a type as analyzable that has no reader.

// Upload-queue status → visual config
const STATUS_CONFIG = {
  queued:     { icon: Clock,         color: 'text-slate-400',   bg: 'bg-slate-500/10',   label: 'Queued' },
  preparing:  { icon: Clock,         color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  label: 'Preparing' },
  uploading:  { icon: Clock,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    label: 'Uploading' },
  saving:     { icon: Clock,         color: 'text-purple-400',  bg: 'bg-purple-500/10',  label: 'Saving Metadata' },
  analysis:   { icon: Clock,         color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    label: 'Understanding document…' },
  completed:  { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Complete' },
  // The document is stored and VISION has no reader for its type: a stored
  // document, not a failed upload.
  stored:     { icon: CheckCircle2,  color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: 'Stored — no analysis yet' },
  uploaded:   { icon: CheckCircle2,  color: 'text-slate-400',   bg: 'bg-slate-500/10',   label: 'Uploaded' },
  failed:     { icon: AlertCircle,   color: 'text-red-400',     bg: 'bg-red-500/10',     label: 'Failed' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getExtension(fileName) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function validateFile(file) {
  const ext = getExtension(file.name);
  if (BLOCKED_EXTENSIONS.includes(ext)) return `"${file.name}" — file type .${ext} is not allowed.`;
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `"${file.name}" — unsupported extension .${ext}.`;
  if (file.size > MAX_FILE_SIZE) return `"${file.name}" — ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds 25 MB limit.`;
  return null;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result); // includes data:mime;base64, prefix
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function extractBackendError(err) {
  const d = err?.response?.data;
  if (!d) return err.message;
  const parts = [
    d.error,
    d.step   && `[step: ${d.step}]`,
    d.code   && `code=${d.code}`,
    d.hint,
    d.details && (typeof d.details === 'string' ? d.details : JSON.stringify(d.details)),
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : JSON.stringify(d).slice(0, 200);
}

// ── FileQueue sub-component ──────────────────────────────────────────────────
function FileQueue({ selectedFiles, fileStates, isUploading, batchProgress, onRemoveFile, onRetryFile }) {
  return (
    <div className="space-y-3">
      {batchProgress.total > 0 && (
        <div className="glass rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Batch Progress</p>
            <p className="text-xs text-muted-foreground">
              {batchProgress.completed} / {batchProgress.total} complete
              {batchProgress.failed > 0 && ` • ${batchProgress.failed} failed`}
            </p>
          </div>
          <Progress value={batchProgress.percentage} className="h-2" />
        </div>
      )}

      <AnimatePresence>
        {selectedFiles.map(({ file, id }) => {
          const state  = fileStates[id] || { progress: 0, status: 'queued', error: null };
          const config = STATUS_CONFIG[state.status] || STATUS_CONFIG.queued;
          const Icon   = config.icon;

          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="glass rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                      {file.docType && ` • ${DOC_TYPES.find(d => d.value === file.docType)?.label || file.docType}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground w-10 text-right">{state.progress}%</span>
                  <Badge variant="outline" className={`${config.bg} ${config.color} border-transparent text-xs gap-1`}>
                    <Icon className="w-3 h-3" />
                    {config.label}
                  </Badge>
                  {!isUploading && state.status !== 'completed' && (
                    <Button variant="ghost" size="icon" onClick={() => onRemoveFile(id)} className="h-8 w-8">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  {state.status === 'failed' && (
                    <Button variant="ghost" size="icon" onClick={() => onRetryFile(id)} className="h-8 w-8 text-primary">
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <Progress value={state.progress} className="h-1" />

              {state.error && (
                <p className="text-xs text-destructive flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  {state.error}
                </p>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DocumentUpload() {
  const { activeContext } = useAuth();
  const [docType, setDocType]             = useState(AUTO_DETECT_DOCUMENT_TYPE);
  const [isDragging, setIsDragging]       = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [hasUploaded, setHasUploaded]     = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileStates, setFileStates]       = useState({});
  const [isUploading, setIsUploading]     = useState(false);
  const queryClient   = useQueryClient();
  const queueRef      = useRef([]);
  const activeRef     = useRef(0);

  // ── Fetch uploaded documents ─────────────────────────────────────────────
  const { data: documents = [] } = useQuery({
    // Phase 6.9 — business identity belongs in BOTH the cache key and the payload.
    queryKey: ['documents', activeContext?.businessId || null],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getDocuments',
        data: { selectedBusinessId: activeContext?.businessId || null },
      });
      return (res.data?.documents || []).map(d => ({
        ...d,
        name:       d.name || (d.file_path ? d.file_path.split('/').pop().replace(/^\d+_/, '') : null) || '—',
        created_date: d.created_at || d.uploaded_at,
        file_url:   d.file_url || null,
        file_size:  d.file_size || null,
      }));
    },
    initialData: [],
  });

  // The pipeline continues after the upload response, so the list is re-read
  // until every document has reached a state.
  useDocumentPipelinePolling(documents, () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
  });

  // ── setFileState helper ──────────────────────────────────────────────────
  const setFileState = useCallback((fileId, patch) => {
    setFileStates(prev => ({ ...prev, [fileId]: { ...(prev[fileId] || {}), ...patch } }));
  }, []);

  // ── Upload single file via uploadDocumentToSupabase (base64 flow) ─────────
  const uploadSingleFile = useCallback(async (file, fileId) => {
    const docTypeUsed = file.docType || docType;

    try {
      // Step 1 – Preparing (read as base64)
      setFileState(fileId, { progress: 5, status: 'preparing', error: null });
      const base64File = await readFileAsBase64(file);

      // Step 2 – Uploading (send to backend)
      setFileState(fileId, { progress: 20, status: 'uploading' });

      let res;
      try {
        res = await base44.functions.invoke('uploadDocumentToSupabase', {
          fileName:     file.name,
          fileType:     file.type || 'application/octet-stream',
          fileSize:     file.size,
          documentType: docTypeUsed,
          year:         null,
          base64File,
          ...(activeContext?.businessId ? { active_business_id: activeContext.businessId } : {}),
        });
      } catch (axiosErr) {
        throw new Error(extractBackendError(axiosErr));
      }

      // Step 3 – Validate backend response
      setFileState(fileId, { progress: 80, status: 'saving' });

      if (!res.data?.success) {
        const d = res.data || {};
        const msg = [d.error, d.step && `[step: ${d.step}]`, d.code && `code=${d.code}`, d.hint, d.details]
          .filter(Boolean).join(' | ');
        throw new Error(msg || 'Upload failed — unknown error');
      }

      // Step 4 – Stored. The pipeline that reads the document's own content
      // continues AFTER this response (an external read cannot be awaited inside
      // an upload), so the analysis outcome is NOT known here and is not claimed:
      // the queue says the document is being understood, and every surface reads
      // the canonical state once the pipeline has landed it.
      // The durable ingestion job is the trigger. If the file was stored but the
      // job could not be persisted, the queue says so rather than implying an
      // analysis is on its way.
      const queued = res.data.pipeline_status === 'queued' && !!res.data.ingestion_job_id;
      setFileState(fileId, {
        progress: 100,
        status: queued ? 'analysis' : 'stored',
        error: queued ? null : 'Stored safely — VISION could not start the analysis automatically. Re-run analysis from the Data Room.',
        document: res.data.document,
      });
      return { document: res.data.document, analysisStatus: 'pending_analysis' };

    } catch (err) {
      setFileState(fileId, { progress: 0, status: 'failed', error: err.message });
      throw err;
    }
  }, [docType, setFileState]);

  // ── Queue processor ──────────────────────────────────────────────────────
  const processQueue = useCallback(() => {
    while (queueRef.current.length > 0 && activeRef.current < MAX_CONCURRENT) {
      const { fileId, file } = queueRef.current.shift();
      activeRef.current++;

      uploadSingleFile(file, fileId)
        .then(({ document: doc }) => {
          queryClient.invalidateQueries({ queryKey: ['documents'] });
          queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
          // Extraction runs inside the upload, so the business's intelligence is
          // already different by the time this resolves. The BIS contract is the
          // read layer behind Pulse, Galileo's context and the completeness
          // figure, so it is invalidated here — otherwise the owner would have to
          // reload the app before seeing what the document taught Vision.
          queryClient.invalidateQueries({ queryKey: ['business-intelligence-contract'] });
          if (doc) saveAnonymousDocumentMeta({ name: doc.name, type: doc.document_type, size: doc.file_size });
          if (!hasUploaded) { setHasUploaded(true); setShowSaveModal(true); }
          toast.success(`${file.name} uploaded — VISION is reading it`);
        })
        .catch(err => {
          toast.error(`${file.name}: ${err.message}`);
        })
        .finally(() => {
          activeRef.current--;
          // Check if all done
          const allDone = queueRef.current.length === 0 && activeRef.current === 0;
          if (allDone) setIsUploading(false);
          else processQueue();
        });
    }
  }, [uploadSingleFile, queryClient, hasUploaded]);

  // ── Start batch ──────────────────────────────────────────────────────────
  const startBatchUpload = useCallback(() => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    queueRef.current = [];
    activeRef.current = 0;

    const initial = {};
    selectedFiles.forEach(({ file, id }) => {
      initial[id] = { progress: 0, status: 'queued', error: null };
      queueRef.current.push({ fileId: id, file });
    });
    setFileStates(initial);
    processQueue();
  }, [selectedFiles, processQueue]);

  // ── File selection & validation ──────────────────────────────────────────
  const handleFileSelect = useCallback((rawFiles) => {
    const files = Array.from(rawFiles);

    // Per-file validation
    const perFileErrors = files.map(validateFile).filter(Boolean);
    perFileErrors.forEach(e => toast.error(e));
    const validFiles = files.filter(f => !validateFile(f));

    // Batch limits
    const totalSize = validFiles.reduce((s, f) => s + f.size, 0);
    if (validFiles.length + selectedFiles.length > MAX_FILES_PER_BATCH) {
      toast.error(`Maximum ${MAX_FILES_PER_BATCH} files per batch.`);
      return;
    }
    if (totalSize > MAX_BATCH_SIZE) {
      toast.error(`Total size ${(totalSize / 1024 / 1024).toFixed(1)} MB exceeds 150 MB limit.`);
      return;
    }

    const newEntries = validFiles.map((f, i) => {
      f.docType = docType;
      return { id: `file-${Date.now()}-${i}`, file: f };
    });

    // Auto-start upload immediately after selection
    const allEntries = [...selectedFiles, ...newEntries];
    setSelectedFiles(allEntries);

    // Kick off upload for new files right away
    setIsUploading(true);
    newEntries.forEach(({ file, id }) => {
      setFileStates(prev => ({ ...prev, [id]: { progress: 0, status: 'queued', error: null } }));
      queueRef.current.push({ fileId: id, file });
    });
    // processQueue will be called via the effect below
    setTimeout(() => processQueue(), 0);
  }, [docType, selectedFiles, processQueue]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer?.files || []);
  }, [handleFileSelect]);

  const removeFile  = useCallback((id) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
    setFileStates(prev => { const s = { ...prev }; delete s[id]; return s; });
  }, []);

  const retryFile   = useCallback((id) => {
    const entry = selectedFiles.find(f => f.id === id);
    if (!entry) return;
    setFileState(id, { progress: 0, status: 'queued', error: null });
    queueRef.current.push({ fileId: id, file: entry.file });
    processQueue();
  }, [selectedFiles, setFileState, processQueue]);

  // ── Batch progress summary ────────────────────────────────────────────────
  const batchProgress = (() => {
    const ids = Object.keys(fileStates);
    if (!ids.length) return { total: 0, completed: 0, failed: 0, uploading: 0, percentage: 0 };
    const completed = ids.filter(id => fileStates[id]?.status === 'completed').length;
    const failed    = ids.filter(id => fileStates[id]?.status === 'failed').length;
    const uploading = ids.filter(id => ['uploading','preparing','saving'].includes(fileStates[id]?.status)).length;
    return { total: ids.length, completed, failed, uploading, percentage: Math.round(((completed + failed) / ids.length) * 100) };
  })();

  const uploadedTypes = documents.map(d => d.document_type);
  const requiredDocs  = ['profit_and_loss', 'balance_sheet', 'business_tax_return', 'payroll_report'];
  const missingDocs   = requiredDocs.filter(t => !uploadedTypes.includes(t));

  return (
    <div className="min-h-0 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8">
      {/* Header */}
      <div className="shrink-0">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">Financial Intelligence</p>
        <h1 className="text-3xl font-display font-bold">Document Upload</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload up to {MAX_FILES_PER_BATCH} files at once (max 25 MB each, 150 MB total batch).
          Accepted: PDF, CSV, Excel, Word, PNG, JPG, WEBP.
        </p>
      </div>

      {/* Document type — the temporary manual seam.
          Automatic classification (6D.0b) will determine this instead. Until then
          the choice is what lets VISION read the document, and leaving it unset is
          an honest "not classified yet" rather than a silent guess. */}
      <div className="shrink-0 space-y-2">
        <div className="glass rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <label htmlFor="document-type" className="text-xs font-medium text-muted-foreground shrink-0">
            Document type
          </label>
          <select
            id="document-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-9 flex-1 bg-secondary border border-border rounded-lg px-3 text-xs outline-none focus:border-primary/50 vision-focus"
          >
            <option value={AUTO_DETECT_DOCUMENT_TYPE}>Not sure</option>
            <optgroup label="VISION can analyze these">
              {DOC_TYPES.filter(t => t.readable).map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Stored safely for your records">
              {DOC_TYPES.filter(t => !t.readable && t.value !== AUTO_DETECT_DOCUMENT_TYPE).map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <p className="text-xs text-muted-foreground px-1">
          VISION reads profit &amp; loss, balance sheet, business and personal tax returns, debt schedules and payroll reports today. Not sure of the type? You can still upload it: VISION will store it, and you can classify it later.
        </p>
      </div>

      {/* Drop zone */}
      <div className="shrink-0">
        <UploadDropdown
          onFilesSelected={handleFileSelect}
          onDriveImport={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}
        >
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer
              ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
          >
            <Upload className={`w-10 h-10 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm font-medium mb-1">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, CSV, Excel, Word, PNG, JPG, WEBP</p>
            <p className="text-xs text-emerald-500 mt-2">
              Max {MAX_FILES_PER_BATCH} files • 25 MB each • 150 MB total
            </p>
          </div>
        </UploadDropdown>
      </div>

      {/* Active queue */}
      {selectedFiles.length > 0 && (
        <div className="shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {isUploading
                ? `Uploading… (${batchProgress.completed}/${batchProgress.total})`
                : `${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''} — ${batchProgress.completed === batchProgress.total && batchProgress.total > 0 ? 'All done!' : 'Ready'}`}
            </p>
            <Button
              variant="outline" size="sm"
              onClick={() => { setSelectedFiles([]); setFileStates({}); queueRef.current = []; }}
              disabled={isUploading}
            >
              Clear All
            </Button>
          </div>
          <div className="overflow-y-auto max-h-72">
            <FileQueue
              selectedFiles={selectedFiles}
              fileStates={fileStates}
              isUploading={isUploading}
              batchProgress={batchProgress}
              onRemoveFile={removeFile}
              onRetryFile={retryFile}
            />
          </div>
        </div>
      )}

      {/* Missing documents reminder */}
      {missingDocs.length > 0 && (
        <div className="shrink-0 glass-gold rounded-xl p-5">
          <p className="text-xs font-medium text-primary mb-3">Recommended Documents</p>
          <div className="flex flex-wrap gap-2">
            {missingDocs.map(t => (
              <Badge key={t} variant="outline" className="text-xs border-primary/30 text-primary/80">
                {DOC_TYPES.find(d => d.value === t)?.label || t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded documents list */}
      {documents.length > 0 && (
        <div className="min-h-0 flex flex-col gap-3">
          <p className="text-sm font-medium shrink-0">Uploaded Documents ({documents.length})</p>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            <AnimatePresence>
              {documents.map(doc => {
                const states = resolveDocumentStates(doc);
                const cfg    = STATUS_CONFIG[states.upload] || STATUS_CONFIG.uploaded;
                const Icon   = cfg.icon;
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-lg p-4 flex items-center gap-4 min-w-0"
                  >
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {documentTypeLabel(doc.document_type)}
                        {doc.file_size ? ` • ${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
                      </p>
                      {states.note && (
                        <p className="text-[10px] text-amber-400/80 truncate">{states.note}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${cfg.bg} ${cfg.color} border-transparent text-xs gap-1`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </Badge>
                    {/* The document's identity and its analysis are two separate
                        facts; the list states both rather than letting one stand
                        for the other. */}
                    <Badge variant="outline" className="shrink-0 border-transparent bg-secondary text-[11px] text-muted-foreground">
                      {analysisLabel(states.analysis)}
                    </Badge>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline shrink-0">
                        Open
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      <SaveProgressModal open={showSaveModal} onOpenChange={setShowSaveModal} triggerType="document" />
    </div>
  );
}