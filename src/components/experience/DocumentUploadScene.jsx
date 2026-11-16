/**
 * DocumentUploadScene
 *
 * Real protected file upload step in Enterprise Journey™.
 * Files upload to guest/{guest_session_id}/ via signed URL before login.
 * No production document rows created — only document_queue metadata stored.
 * Files are promoted to production documents during promoteGuestSession.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Upload, FileText, X, CheckCircle2, AlertCircle, Lock, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg',
  'text/csv', 'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const DOC_TYPES = [
  { value: 'business_tax_return',  label: 'Business Tax Return' },
  { value: 'personal_tax_return',  label: 'Personal Tax Return' },
  { value: 'profit_and_loss',      label: 'Profit & Loss Statement' },
  { value: 'balance_sheet',        label: 'Balance Sheet' },
  { value: 'debt_schedule',        label: 'Debt Schedule' },
  { value: 'payroll_report',       label: 'Payroll Report' },
  { value: 'entity_document',      label: 'Entity Document' },
  { value: 'other',                label: 'Other Document' },
];

const GALILEO_MESSAGE = "Documents help me reduce the number of questions I need to ask. Upload what you have, and I'll protect it while we build your Blueprint.";

function getExtension(name) {
  return (name || '').split('.').pop()?.toLowerCase() || '';
}

function validateFile(file) {
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `"${file.name}" — .${ext} is not accepted.`;
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith('image/')) return `"${file.name}" — file type not allowed.`;
  if (file.size > MAX_FILE_SIZE) return `"${file.name}" — exceeds 25 MB limit.`;
  return null;
}

// Upload a file to Supabase storage via signed URL
async function uploadViaSignedUrl(signedUrl, file) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${res.statusText}`);
}

export default function DocumentUploadScene({ onNext, onSkip }) {
  const [isDragging, setIsDragging]     = useState(false);
  const [files, setFiles]               = useState([]); // { id, file, docType, status, error, progress, temp_document_id, file_path }
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isContinuing, setIsContinuing] = useState(false);
  const [globalError, setGlobalError]   = useState(null);
  const fileInputRef = useRef(null);
  const guestSessionId = getGuestSessionId();

  // Load existing document_queue on mount (resume after refresh)
  useEffect(() => {
    const loadExisting = async () => {
      try {
        const res = await base44.functions.invoke('guestSessionService', {
          action: 'getGuestSession',
          data: { guest_session_id: guestSessionId },
        });
        const queue = res.data?.session?.document_queue || [];
        const existingFiles = queue
          .filter(d => d.status === 'uploaded_guest' && d.file_path)
          .map(d => ({
            id: d.temp_document_id,
            file: { name: d.original_filename, size: d.file_size || 0, type: d.mime_type || '' },
            docType: d.document_type || 'other',
            status: 'completed',
            error: null,
            progress: 100,
            temp_document_id: d.temp_document_id,
            file_path: d.file_path,
          }));
        if (existingFiles.length > 0) setFiles(existingFiles);
      } catch (e) {
        // Non-fatal — start fresh
      } finally {
        setIsLoadingSession(false);
      }
    };
    loadExisting();
  }, []);

  const ensureSessionExists = async () => {
    const res = await base44.functions.invoke('guestSessionService', {
      action: 'getGuestSession',
      data: { guest_session_id: guestSessionId },
    });
    if (!res.data?.exists) {
      await base44.functions.invoke('guestSessionService', {
        action: 'createGuestSession',
        data: { guest_session_id: guestSessionId },
      });
    }
  };

  const uploadFile = useCallback(async (entry) => {
    const { id, file, docType } = entry;

    const setStatus = (patch) =>
      setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

    setStatus({ status: 'uploading', progress: 10, error: null });

    try {
      await ensureSessionExists();

      // Step 1 — request signed upload URL
      setStatus({ progress: 20 });
      const urlRes = await base44.functions.invoke('guestSessionService', {
        action: 'createGuestUploadUrl',
        data: {
          guest_session_id: guestSessionId,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          document_type: docType,
          document_scope: 'business',
          temp_business_id: 'first',
        },
      });

      if (!urlRes.data?.success) throw new Error(urlRes.data?.error || 'Failed to get upload URL');
      const { temp_document_id, file_path, signed_upload_url } = urlRes.data;

      setStatus({ progress: 40 });

      // Step 2 — PUT file directly to Supabase storage
      await uploadViaSignedUrl(signed_upload_url, file);

      setStatus({ progress: 80 });

      // Step 3 — confirm upload, append to document_queue
      const confirmRes = await base44.functions.invoke('guestSessionService', {
        action: 'confirmGuestUpload',
        data: {
          guest_session_id: guestSessionId,
          temp_document_id,
          file_path,
          original_filename: file.name,
          document_type: docType,
          document_scope: 'business',
          temp_business_id: 'first',
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
        },
      });

      if (!confirmRes.data?.success) throw new Error(confirmRes.data?.error || 'Failed to confirm upload');

      setStatus({ status: 'completed', progress: 100, temp_document_id, file_path });

    } catch (err) {
      setStatus({ status: 'failed', progress: 0, error: err.message });
    }
  }, [guestSessionId]);

  const addFiles = useCallback((rawFiles) => {
    setGlobalError(null);
    const arr = Array.from(rawFiles);
    const errors = arr.map(validateFile).filter(Boolean);
    errors.forEach(e => setGlobalError(e));
    const valid = arr.filter(f => !validateFile(f));

    setFiles(prev => {
      const activeCount = prev.filter(f => f.status !== 'removed').length;
      const allowed = valid.slice(0, MAX_FILES - activeCount);
      if (allowed.length < valid.length) setGlobalError(`Maximum ${MAX_FILES} files per session.`);
      const newEntries = allowed.map((file, i) => ({
        id: `file-${Date.now()}-${i}`,
        file,
        docType: 'other',
        status: 'pending',
        error: null,
        progress: 0,
        temp_document_id: null,
        file_path: null,
      }));
      // Start uploads for new entries
      setTimeout(() => newEntries.forEach(e => uploadFile(e)), 0);
      return [...prev, ...newEntries];
    });
  }, [uploadFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer?.files || []);
  }, [addFiles]);

  const handleRemove = useCallback(async (id) => {
    const entry = files.find(f => f.id === id);
    if (!entry) return;

    setFiles(prev => prev.filter(f => f.id !== id));

    // Remove from document_queue and storage if already confirmed
    if (entry.temp_document_id && entry.status === 'completed') {
      try {
        await base44.functions.invoke('guestSessionService', {
          action: 'removeGuestUpload',
          data: { guest_session_id: guestSessionId, temp_document_id: entry.temp_document_id },
        });
      } catch (e) {
        // Non-fatal
      }
    }
  }, [files, guestSessionId]);

  const handleDocTypeChange = (id, docType) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, docType } : f));
  };

  const handleRetry = useCallback((id) => {
    const entry = files.find(f => f.id === id);
    if (entry) uploadFile(entry);
  }, [files, uploadFile]);

  const handleContinue = async () => {
    setIsContinuing(true);
    // All uploads handled in real-time; just advance
    onNext?.();
    setIsContinuing(false);
  };

  const uploadedCount = files.filter(f => f.status === 'completed').length;
  const uploadingCount = files.filter(f => f.status === 'uploading' || f.status === 'pending').length;
  const anyFailed = files.some(f => f.status === 'failed');

  if (isLoadingSession) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-xl flex flex-col gap-6"
      >
        {/* Galileo Quote */}
        <p className="text-base text-white/60 font-light italic text-center">
          "{GALILEO_MESSAGE}"
        </p>

        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-3xl font-display font-bold text-white tracking-tight">
            Upload your documents.
          </h2>
          <p className="text-white/50 font-light text-sm leading-relaxed">
            PDF, PNG, JPG, CSV, or Excel. Up to 10 files, 25 MB each.
          </p>
        </div>

        {/* Security note */}
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Lock className="w-3.5 h-3.5 shrink-0 text-[#D4A853]/60" />
          <span>Files are stored in a private, session-scoped path. No public access.</span>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
            isDragging ? 'border-[#D4A853]/70 bg-[#D4A853]/5' : 'border-white/10 hover:border-white/25'
          }`}
        >
          <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${isDragging ? 'text-[#D4A853]' : 'text-white/30'}`} />
          <p className="text-sm font-medium text-white/70">Drop files here or <span className="text-[#D4A853]">click to browse</span></p>
          <p className="text-xs text-white/30 mt-1">PDF, PNG, JPG, CSV, Excel</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx"
            className="hidden"
            onChange={e => addFiles(e.target.files)}
            onClick={e => e.stopPropagation()}
          />
        </div>

        {/* Global error */}
        {globalError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {globalError}
          </p>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            <AnimatePresence>
              {files.map(entry => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-white/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{entry.file.name}</p>
                      <p className="text-xs text-white/40">
                        {entry.file.size ? `${(entry.file.size / 1024 / 1024).toFixed(2)} MB` : ''}
                        {entry.status === 'uploading' && ' · Uploading…'}
                        {entry.status === 'pending'   && ' · Queued'}
                        {entry.status === 'completed' && ' · Saved securely'}
                        {entry.status === 'failed'    && ' · Failed'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {(entry.status === 'uploading' || entry.status === 'pending') && <Loader2 className="w-4 h-4 text-[#D4A853]/70 animate-spin" />}
                      {entry.status === 'failed' && (
                        <button onClick={() => handleRetry(entry.id)} className="text-xs text-[#D4A853] hover:underline">Retry</button>
                      )}
                      <button onClick={() => handleRemove(entry.id)} className="text-white/30 hover:text-white/70">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(entry.status === 'uploading' || entry.status === 'pending') && (
                    <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#D4A853]/60 rounded-full transition-all duration-300"
                        style={{ width: `${entry.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Error */}
                  {entry.error && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {entry.error}
                    </p>
                  )}

                  {/* Doc type selector — only show when completed */}
                  {entry.status === 'completed' && (
                    <select
                      value={entry.docType}
                      onChange={e => handleDocTypeChange(entry.id, e.target.value)}
                      className="w-full text-xs bg-white/5 border border-white/10 text-white/70 rounded px-2 py-1.5 outline-none focus:border-[#D4A853]/40"
                    >
                      {DOC_TYPES.map(dt => (
                        <option key={dt.value} value={dt.value} className="bg-black">{dt.label}</option>
                      ))}
                    </select>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Upload summary */}
        {uploadedCount > 0 && (
          <p className="text-xs text-white/40 text-center">
            {uploadedCount} file{uploadedCount > 1 ? 's' : ''} secured
            {uploadingCount > 0 && ` · ${uploadingCount} uploading`}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2">
          <Button
            onClick={handleContinue}
            disabled={isContinuing || uploadingCount > 0}
            className="flex-1 h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90 transition-colors"
          >
            {uploadingCount > 0 ? 'Uploading…' : isContinuing ? 'Continuing…' : uploadedCount > 0 ? 'Continue →' : 'Continue →'}
          </Button>
          <Button
            onClick={onSkip}
            variant="ghost"
            disabled={isContinuing || uploadingCount > 0}
            className="h-12 text-white/50 hover:text-white text-sm"
          >
            Skip for now
          </Button>
        </div>
      </motion.div>
    </div>
  );
}