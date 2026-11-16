/**
 * ConnectBusiness — "Connect My Business"
 *
 * Explains the VALUE before asking for data. Accounting connections are shown
 * as "Coming Soon" (visual only — no fake integrations). The working Phase 1
 * connection is the existing document-upload pipeline (guest signed URLs).
 * Never dead-ends — "Continue With Estimates" is always available.
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Upload, FileText, X, Lock, Loader2, CheckCircle2, AlertCircle, Link2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';

const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx'];
const MAX_SIZE = 25 * 1024 * 1024;

const DOC_TYPES = [
  { value: 'profit_and_loss', label: 'P&L Statement' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'business_tax_return', label: 'Tax Return' },
  { value: 'other', label: 'Other' },
];

function ext(name) {
  return (name || '').split('.').pop()?.toLowerCase() || '';
}

export default function ConnectBusiness({ guestSessionId, onUploaded, onContinueEstimates, trackUploadStarted }) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const sid = guestSessionId || getGuestSessionId();

  const uploadFile = useCallback(async (entry) => {
    const { id, file, docType } = entry;
    const patch = (p) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...p } : f)));
    patch({ status: 'uploading', progress: 15, error: null });
    try {
      // Step 1 — signed upload URL
      const urlRes = await base44.functions.invoke('guestSessionService', {
        action: 'createGuestUploadUrl',
        data: {
          guest_session_id: sid,
          original_filename: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          document_type: docType,
          document_scope: 'business',
          temp_business_id: 'first',
        },
      });
      if (!urlRes.data?.success) throw new Error(urlRes.data?.error || 'Upload failed');
      const { temp_document_id, file_path, signed_upload_url } = urlRes.data;
      patch({ progress: 45 });

      // Step 2 — PUT to storage
      const res = await fetch(signed_upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) throw new Error('Storage upload failed');

      // Step 3 — confirm
      patch({ progress: 85 });
      const confirmRes = await base44.functions.invoke('guestSessionService', {
        action: 'confirmGuestUpload',
        data: {
          guest_session_id: sid,
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
      if (!confirmRes.data?.success) throw new Error(confirmRes.data?.error || 'Confirm failed');
      patch({ status: 'completed', progress: 100, temp_document_id, file_path });
      onUploaded?.({ document_type: docType, file_name: file.name, file_path, temp_document_id });
    } catch (err) {
      patch({ status: 'failed', error: err.message });
    }
  }, [sid, onUploaded]);

  const addFiles = useCallback((rawFiles) => {
    const arr = Array.from(rawFiles).filter((f) => ALLOWED_EXT.includes(ext(f.name)) && f.size <= MAX_SIZE);
    trackUploadStarted?.();
    const entries = arr.map((file, i) => ({
      id: `f-${Date.now()}-${i}`,
      file,
      docType: 'profit_and_loss',
      status: 'pending',
      progress: 0,
      error: null,
    }));
    setFiles((prev) => [...prev, ...entries]);
    setTimeout(() => entries.forEach((e) => uploadFile(e)), 0);
  }, [uploadFile, trackUploadStarted]);

  const completedCount = files.filter((f) => f.status === 'completed').length;

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-base text-white/55 font-light italic mb-6 text-center">
          "I can estimate from what you've told me, or I can stop guessing and learn from how your
          business actually operates."
        </p>

        {/* Connect Accounting — Coming Soon */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 mb-4 opacity-70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-white/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">Connect Accounting</p>
                <p className="text-[11px] text-white/40">QuickBooks · Wave · Xero · FreshBooks</p>
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/5 text-white/40 border border-white/10">
              Coming Soon
            </span>
          </div>
        </div>

        {/* Upload Financials — working now */}
        <div className="rounded-2xl border border-[#D4A853]/20 bg-[#D4A853]/[0.03] p-5">
          <p className="text-sm font-medium text-white/85 mb-1">Upload Financials</p>
          <p className="text-[11px] text-white/45 mb-4">P&L, Balance Sheet, Tax Return — available now</p>

          <div
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer?.files || []); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
              isDragging ? 'border-[#D4A853]/60 bg-[#D4A853]/5' : 'border-white/10 hover:border-white/25'
            }`}
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-white/30" />
            <p className="text-xs text-white/60">Drop files or <span className="text-[#D4A853]">browse</span></p>
            <p className="text-[10px] text-white/30 mt-1">PDF, PNG, JPG, CSV, Excel · 25 MB max</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-white/35">
            <Lock className="w-3 h-3 text-[#D4A853]/50" />
            Files stored in a private, session-scoped path. No public access.
          </div>

          {/* File list */}
          <AnimatePresence>
            {files.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 rounded-lg bg-white/5 border border-white/10 p-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-white/40 shrink-0" />
                  <span className="text-xs text-white/80 truncate flex-1">{f.file.name}</span>
                  {f.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {f.status === 'uploading' && <Loader2 className="w-4 h-4 text-[#D4A853]/70 animate-spin" />}
                  {f.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-400" />}
                  <button onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} className="text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {f.status === 'uploading' && (
                  <div className="h-0.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-[#D4A853]/60 transition-all" style={{ width: `${f.progress}%` }} />
                  </div>
                )}
                {f.status === 'completed' && (
                  <select
                    value={f.docType}
                    onChange={(e) => setFiles((p) => p.map((x) => (x.id === f.id ? { ...x, docType: e.target.value } : x)))}
                    className="mt-1.5 w-full text-[10px] bg-white/5 border border-white/10 text-white/60 rounded px-1.5 py-1"
                  >
                    {DOC_TYPES.map((d) => <option key={d.value} value={d.value} className="bg-black">{d.label}</option>)}
                  </select>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Continue with estimates */}
        <div className="flex flex-col items-center mt-6 gap-2">
          {completedCount > 0 && (
            <Button
              onClick={onContinueEstimates}
              className="h-12 px-6 bg-[#D4A853] text-black font-medium hover:bg-[#D4A853]/90"
            >
              Continue with {completedCount} file{completedCount > 1 ? 's' : ''} →
            </Button>
          )}
          <button onClick={onContinueEstimates} className="text-xs text-white/40 hover:text-white/70">
            Continue with my estimates
          </button>
        </div>
      </motion.div>
    </div>
  );
}