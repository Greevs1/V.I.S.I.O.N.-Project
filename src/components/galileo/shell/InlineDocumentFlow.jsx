/**
 * InlineDocumentFlow — document upload + extraction inside the conversation.
 *
 * Replaces the separate ConnectBusiness + GalileoLearning screens.
 * Galileo visibly learns inline:
 *   1. Upload area appears in the conversation
 *   2. Once uploaded, extraction starts automatically
 *   3. Extraction stages appear one by one ("Revenue found ✓")
 *   4. Ambiguity resolution appears inline (not a separate screen)
 *   5. onCompleteLearning is called with the result
 *
 * Reuses the existing guestSessionService pipeline:
 *   - createGuestUploadUrl → signed upload
 *   - confirmGuestUpload → register in session
 *   - createGuestReadUrl → signed read URL + schema
 *   - ExtractDataFromUploadedFile → AI extraction
 *   - storeGuestExtraction → normalize + store
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileText, X, Lock, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx'];
const MAX_SIZE = 25 * 1024 * 1024;
const DOC_TYPES = [
  { value: 'profit_and_loss', label: 'P&L Statement' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'business_tax_return', label: 'Tax Return' },
  { value: 'other', label: 'Other' },
];

const FIELD_LABELS = {
  annual_revenue: 'Revenue', cogs: 'Cost of goods sold', gross_profit: 'Gross profit',
  operating_expenses: 'Operating expenses', operating_income: 'Operating income',
  reported_ebitda: 'EBITDA', net_profit: 'Net profit', total_expenses: 'Total expenses',
};

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

function ext(name) { return (name || '').split('.').pop()?.toLowerCase() || ''; }

export default function InlineDocumentFlow({
  guestSessionId, uploadedDocs, onDocumentUploaded, onStartExtraction, onCompleteLearning, answers,
}) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState('uploading'); // uploading | extracting | results | failed | manual
  const [extractionResult, setExtractionResult] = useState(null);
  const [stages, setStages] = useState([]);
  const [visibleStageCount, setVisibleStageCount] = useState(0);
  const [error, setError] = useState(null);
  const [manualRevenue, setManualRevenue] = useState('');
  const [manualEbitda, setManualEbitda] = useState('');
  const [ebitdaChoice, setEbitdaChoice] = useState(null);
  const fileInputRef = useRef(null);
  const timersRef = useRef([]);
  const extractionStarted = useRef(false);

  const sid = guestSessionId;

  // ── Upload a file ──────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (entry) => {
    const { id, file, docType } = entry;
    const patch = (p) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...p } : f)));
    patch({ status: 'uploading', progress: 15, error: null });
    try {
      const urlRes = await base44.functions.invoke('guestSessionService', {
        action: 'createGuestUploadUrl',
        data: {
          guest_session_id: sid, original_filename: file.name, file_size: file.size,
          mime_type: file.type || 'application/octet-stream', document_type: docType,
          document_scope: 'business', temp_business_id: 'first',
        },
      });
      if (!urlRes.data?.success) throw new Error(urlRes.data?.error || 'Upload failed');
      const { temp_document_id, file_path, signed_upload_url } = urlRes.data;
      patch({ progress: 45 });

      const res = await fetch(signed_upload_url, {
        method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
      });
      if (!res.ok) throw new Error('Storage upload failed');

      patch({ progress: 85 });
      const confirmRes = await base44.functions.invoke('guestSessionService', {
        action: 'confirmGuestUpload',
        data: {
          guest_session_id: sid, temp_document_id, file_path, original_filename: file.name,
          document_type: docType, document_scope: 'business', temp_business_id: 'first',
          file_size: file.size, mime_type: file.type || 'application/octet-stream',
        },
      });
      if (!confirmRes.data?.success) throw new Error(confirmRes.data?.error || 'Confirm failed');
      patch({ status: 'completed', progress: 100, temp_document_id, file_path });
      onDocumentUploaded?.({ document_type: docType, file_name: file.name, file_path, temp_document_id });
    } catch (err) {
      patch({ status: 'failed', error: err.message });
    }
  }, [sid, onDocumentUploaded]);

  const addFiles = useCallback((rawFiles) => {
    const arr = Array.from(rawFiles).filter((f) => ALLOWED_EXT.includes(ext(f.name)) && f.size <= MAX_SIZE);
    const entries = arr.map((file, i) => ({
      id: `f-${Date.now()}-${i}`, file, docType: 'profit_and_loss', status: 'pending', progress: 0, error: null,
    }));
    setFiles((prev) => [...prev, ...entries]);
    setTimeout(() => entries.forEach((e) => uploadFile(e)), 0);
  }, [uploadFile]);

  // ── Start extraction when a file is completed ──────────────────────────────
  const startExtractionFlow = useCallback(async () => {
    if (extractionStarted.current) return;
    const completedFile = files.find((f) => f.status === 'completed');
    if (!completedFile || !completedFile.temp_document_id) return;

    extractionStarted.current = true;
    onStartExtraction?.();
    setPhase('extracting');
    setStages([]);
    setVisibleStageCount(0);
    setError(null);

    try {
      const urlRes = await base44.functions.invoke('guestSessionService', {
        action: 'createGuestReadUrl',
        data: { guest_session_id: sid, temp_document_id: completedFile.temp_document_id },
      });
      if (!urlRes.data?.success) throw new Error(urlRes.data?.error || 'Could not access document');
      const { signed_url, schema, document_type } = urlRes.data;

      const extractRes = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: signed_url, json_schema: schema,
      });

      const storeRes = await base44.functions.invoke('guestSessionService', {
        action: 'storeGuestExtraction',
        data: {
          guest_session_id: sid, temp_document_id: completedFile.temp_document_id,
          raw_output: extractRes, document_type,
        },
      });

      if (!storeRes.data?.success) throw new Error(storeRes.data?.error || 'Could not read the document');

      const result = storeRes.data;
      setExtractionResult(result);

      // Build real stages from what was actually found
      const completedStages = [];
      completedStages.push({ label: `Reading your ${document_type === 'profit_and_loss' ? 'P&L' : 'financial statement'}...` });
      const facts = result.facts || {};
      const fieldOrder = ['annual_revenue', 'cogs', 'gross_profit', 'operating_expenses', 'operating_income', 'reported_ebitda', 'net_profit'];
      for (const key of fieldOrder) {
        if (facts[key] && facts[key].normalized != null) {
          const label = FIELD_LABELS[key] || key;
          const val = facts[key].normalized;
          completedStages.push({ label: `${label} found`, value: typeof val === 'number' ? fmt(val) : val });
        }
      }
      if (result.period) {
        completedStages.push({ label: `Reporting period: ${result.period}` });
      }
      completedStages.push({ label: 'Business Model updated' });
      setStages(completedStages);

      const hasRevenue = facts.annual_revenue?.normalized != null;
      const hasEbitda = facts.reported_ebitda?.normalized != null || facts.operating_income?.normalized != null;
      if (hasRevenue || hasEbitda) {
        setPhase('results');
        if (facts.reported_ebitda?.normalized != null) setEbitdaChoice('reported_ebitda');
        else if (facts.operating_income?.normalized != null) setEbitdaChoice('operating_income');
      } else {
        setPhase('failed');
        setError('I couldn\'t identify enough key figures from this document.');
      }
    } catch (err) {
      setPhase('failed');
      setError(err.message || 'Extraction failed');
    }
  }, [files, sid, onStartExtraction]);

  // Auto-start extraction when a file completes
  useEffect(() => {
    const hasCompleted = files.some((f) => f.status === 'completed');
    if (hasCompleted && phase === 'uploading' && !extractionStarted.current) {
      const timer = setTimeout(() => startExtractionFlow(), 500);
      return () => clearTimeout(timer);
    }
  }, [files, phase, startExtractionFlow]);

  // Progressive stage reveal
  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (phase !== 'results' || stages.length === 0) {
      setVisibleStageCount(0);
      return;
    }
    for (let i = 0; i < stages.length; i++) {
      const t = setTimeout(() => setVisibleStageCount(i + 1), i * 400);
      timersRef.current.push(t);
    }
    return () => { timersRef.current.forEach(clearTimeout); };
  }, [phase, stages]);

  const handleConfirm = () => {
    if (!extractionResult) return;
    if (ebitdaChoice && extractionResult.facts[ebitdaChoice]) {
      const adjusted = {
        ...extractionResult,
        facts: {
          ...extractionResult.facts,
          reported_ebitda: ebitdaChoice === 'reported_ebitda'
            ? extractionResult.facts.reported_ebitda
            : extractionResult.facts.operating_income,
        },
      };
      onCompleteLearning(adjusted);
    } else {
      onCompleteLearning(extractionResult);
    }
  };

  const handleManualConfirm = () => {
    const revenue = manualRevenue ? Number(manualRevenue) : null;
    const ebitda = manualEbitda ? Number(manualEbitda) : null;
    onCompleteLearning({
      success: true,
      facts: {
        annual_revenue: revenue != null ? { value: String(revenue), normalized: revenue, field_type: 'currency' } : undefined,
        reported_ebitda: ebitda != null ? { value: String(ebitda), normalized: ebitda, field_type: 'currency' } : undefined,
      },
      period: null,
      fields_found: (revenue != null ? 1 : 0) + (ebitda != null ? 1 : 0),
      document_type: 'profit_and_loss',
      original_filename: files?.[0]?.file?.name || 'manual',
    });
  };

  // ── UPLOADING phase ────────────────────────────────────────────────────────
  if (phase === 'uploading') {
    const completedCount = files.filter((f) => f.status === 'completed').length;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="text-center">
          <p className="text-sm font-medium text-white/85">Share Financials</p>
          <p className="text-[11px] text-white/45 mt-0.5">P&L, Balance Sheet, Tax Return — available now</p>
        </div>

        <div
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer?.files || []); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
            isDragging ? 'border-[#D4A853]/60 bg-[#D4A853]/5' : 'border-white/10 hover:border-white/25'
          }`}
        >
          <Upload className="w-5 h-5 mx-auto mb-1.5 text-white/30" />
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

        <div className="flex items-center gap-1.5 text-[10px] text-white/35 justify-center">
          <Lock className="w-3 h-3 text-[#D4A853]/50" />
          Files stored privately. No public access.
        </div>

        <AnimatePresence>
          {files.map((f) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg bg-white/5 border border-white/10 p-2.5"
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
            </motion.div>
          ))}
        </AnimatePresence>

        {completedCount > 0 && (
          <p className="text-[11px] text-[#D4A853]/70 text-center animate-pulse">
            Galileo is starting to read...
          </p>
        )}
      </motion.div>
    );
  }

  // ── EXTRACTING phase ───────────────────────────────────────────────────────
  if (phase === 'extracting') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3 py-2"
      >
        <div className="flex items-center gap-2 justify-center">
          <FileText className="w-4 h-4 text-[#D4A853]" />
          <span className="text-sm text-white/60">Galileo is reading your financial statement</span>
        </div>
        <div className="flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 text-[#D4A853]/70 animate-spin" />
          <span className="text-xs text-white/40">Extracting key figures...</span>
        </div>
      </motion.div>
    );
  }

  // ── FAILED phase ───────────────────────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 text-center py-2"
      >
        <AlertCircle className="w-5 h-5 text-red-400/70 mx-auto" />
        <p className="text-sm text-white/65">{error || 'I couldn\'t identify enough key figures.'}</p>
        <div className="flex flex-col gap-2 items-center">
          <Button onClick={() => { extractionStarted.current = false; setPhase('uploading'); }} className="h-10 px-4 bg-[#D4A853] text-black hover:bg-[#D4A853]/90 text-sm">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try another document
          </Button>
          <button onClick={() => setPhase('manual')} className="text-xs text-white/40 hover:text-white/70">
            Help Galileo confirm a few numbers
          </button>
        </div>
      </motion.div>
    );
  }

  // ── MANUAL fallback ────────────────────────────────────────────────────────
  if (phase === 'manual') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 py-2"
      >
        <p className="text-sm text-white/65 text-center">Tell me the key figures you see in your document.</p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">Annual Revenue</label>
            <Input type="number" value={manualRevenue} onChange={(e) => setManualRevenue(e.target.value)} placeholder="e.g. 2500000" className="h-10 bg-white/5 border-white/10 text-white" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">EBITDA</label>
            <Input type="number" value={manualEbitda} onChange={(e) => setManualEbitda(e.target.value)} placeholder="e.g. 400000" className="h-10 bg-white/5 border-white/10 text-white" />
          </div>
        </div>
        <Button onClick={handleManualConfirm} className="w-full h-10 bg-[#D4A853] text-black hover:bg-[#D4A853]/90">
          Update my model
        </Button>
      </motion.div>
    );
  }

  // ── RESULTS phase — show what Galileo found ────────────────────────────────
  const facts = extractionResult?.facts || {};
  const period = extractionResult?.period;
  const revenue = facts.annual_revenue?.normalized;
  const hasReportedEbitda = facts.reported_ebitda?.normalized != null;
  const hasOperatingIncome = facts.operating_income?.normalized != null;
  const showEbitdaChoice = hasReportedEbitda && hasOperatingIncome;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 py-2"
    >
      {/* Extraction stages — only stages that actually occurred */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4A853]/70 font-semibold text-center mb-2">
          Galileo learned from your document
        </p>
        <AnimatePresence>
          {stages.slice(0, visibleStageCount).map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 justify-center"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/70">{s.label}</span>
              {s.value && <span className="text-sm text-[#D4A853] font-medium">{s.value}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Show found values + ambiguity resolution */}
      {visibleStageCount >= stages.length && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          {revenue != null && (
            <p className="text-sm text-white/75 text-center leading-relaxed">
              I found revenue of <span className="text-[#D4A853] font-semibold">{fmt(revenue)}</span>
              {period && <> for <span className="text-white/85">{period}</span></>}.
            </p>
          )}

          {/* EBITDA ambiguity — only shown when both figures exist */}
          {showEbitdaChoice && (
            <div className="space-y-2">
              <p className="text-sm text-white/70 text-center">
                I found two possible operating-income figures. Which should I use?
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEbitdaChoice('reported_ebitda')}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    ebitdaChoice === 'reported_ebitda'
                      ? 'border-[#D4A853]/50 bg-[#D4A853]/10 text-[#D4A853]'
                      : 'border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20'
                  }`}
                >
                  EBITDA: {fmt(facts.reported_ebitda.normalized)}
                </button>
                <button
                  onClick={() => setEbitdaChoice('operating_income')}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    ebitdaChoice === 'operating_income'
                      ? 'border-[#D4A853]/50 bg-[#D4A853]/10 text-[#D4A853]'
                      : 'border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20'
                  }`}
                >
                  Operating Income: {fmt(facts.operating_income.normalized)}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-center pt-1">
            <Button onClick={handleConfirm} className="h-11 px-6 bg-[#D4A853] text-black hover:bg-[#D4A853]/90">
              Update my model
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}