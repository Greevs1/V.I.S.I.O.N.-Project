/**
 * GalileoLearning — Automatic document extraction + ambiguity-only confirmation.
 *
 * Phase 1.1: Galileo does the reading. The user only resolves ambiguity.
 *
 * Flow:
 *   1. createGuestReadUrl → signed URL + extraction schema (backend validates ownership)
 *   2. ExtractDataFromUploadedFile → raw extraction output (AI reads the document)
 *   3. storeGuestExtraction → normalized facts stored in guest session (shared engine)
 *   4. Show real extraction stages (only stages that actually occurred — never faked)
 *   5. If successful: show found values, ask for confirmation only on ambiguity
 *   6. If failed: offer "Try another document" or "Help Galileo confirm a few numbers"
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, FileText, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const FIELD_LABELS = {
  annual_revenue: 'Revenue',
  cogs: 'Cost of goods sold',
  gross_profit: 'Gross profit',
  operating_expenses: 'Operating expenses',
  operating_income: 'Operating income',
  reported_ebitda: 'EBITDA',
  net_profit: 'Net profit',
  total_expenses: 'Total expenses',
  owner_compensation: 'Owner compensation',
  depreciation: 'Depreciation',
  amortization: 'Amortization',
  interest_expense: 'Interest expense',
  taxes: 'Taxes',
};

const DOC_TYPE_LABELS = {
  profit_and_loss: 'Profit & Loss',
  balance_sheet: 'Balance Sheet',
  business_tax_return: 'Tax Return',
  other: 'Document',
};

export default function GalileoLearning({ uploadedDocs, guestSessionId, onComplete, onSkip }) {
  const [phase, setPhase] = useState('extracting'); // extracting | results | failed | manual
  const [extractionResult, setExtractionResult] = useState(null);
  const [stages, setStages] = useState([]);
  const [visibleStageCount, setVisibleStageCount] = useState(0);
  const [error, setError] = useState(null);
  const [manualRevenue, setManualRevenue] = useState('');
  const [manualEbitda, setManualEbitda] = useState('');
  const [ebitdaChoice, setEbitdaChoice] = useState(null);
  const timersRef = useRef([]);

  const extract = useCallback(async () => {
    if (!uploadedDocs || uploadedDocs.length === 0) {
      setPhase('failed');
      setError('No document available');
      return;
    }

    const doc = uploadedDocs[0];
    setPhase('extracting');
    setStages([]);
    setVisibleStageCount(0);
    setError(null);

    try {
      // Step 1 — get signed read URL + extraction schema (backend validates ownership)
      const urlRes = await base44.functions.invoke('guestSessionService', {
        action: 'createGuestReadUrl',
        data: {
          guest_session_id: guestSessionId,
          temp_document_id: doc.temp_document_id,
        },
      });
      if (!urlRes.data?.success) throw new Error(urlRes.data?.error || 'Could not access document');
      const { signed_url, schema, document_type } = urlRes.data;

      // Step 2 — extract via AI (Galileo reads the document)
      const extractRes = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: signed_url,
        json_schema: schema,
      });

      // Step 3 — normalize + store via shared engine
      const storeRes = await base44.functions.invoke('guestSessionService', {
        action: 'storeGuestExtraction',
        data: {
          guest_session_id: guestSessionId,
          temp_document_id: doc.temp_document_id,
          raw_output: extractRes,
          document_type,
        },
      });

      if (!storeRes.data?.success) {
        throw new Error(storeRes.data?.error || 'Could not read the document');
      }

      const result = storeRes.data;
      setExtractionResult(result);

      // Build real stages from what was actually found — never faked
      const completedStages = [];
      completedStages.push({
        label: `Document classified as ${DOC_TYPE_LABELS[result.document_type] || result.document_type}`,
      });
      if (result.period) {
        completedStages.push({ label: `Reporting period identified: ${result.period}` });
      }
      const facts = result.facts || {};
      const fieldOrder = ['annual_revenue', 'cogs', 'gross_profit', 'operating_expenses', 'operating_income', 'reported_ebitda', 'net_profit'];
      for (const key of fieldOrder) {
        if (facts[key] && facts[key].normalized != null) {
          const label = FIELD_LABELS[key] || key;
          const val = facts[key].normalized;
          const formatted = typeof val === 'number' ? fmt(val) : val;
          completedStages.push({ label: `${label} found: ${formatted}` });
        }
      }
      completedStages.push({ label: 'Business Model updated' });
      setStages(completedStages);

      // Check if we have enough to proceed
      const hasRevenue = facts.annual_revenue?.normalized != null;
      const hasEbitda = facts.reported_ebitda?.normalized != null || facts.operating_income?.normalized != null;
      if (hasRevenue || hasEbitda) {
        setPhase('results');
        // Default EBITDA choice
        if (facts.reported_ebitda?.normalized != null) {
          setEbitdaChoice('reported_ebitda');
        } else if (facts.operating_income?.normalized != null) {
          setEbitdaChoice('operating_income');
        }
      } else {
        setPhase('failed');
        setError('I couldn\'t identify enough key figures from this document.');
      }
    } catch (err) {
      console.error('[GalileoLearning] Extraction failed:', err);
      setPhase('failed');
      setError(err.message || 'Extraction failed');
    }
  }, [uploadedDocs, guestSessionId]);

  useEffect(() => {
    extract();
  }, [extract]);

  // Progressive stage reveal — each stage appears with a slight delay
  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (phase !== 'results' || stages.length === 0) {
      setVisibleStageCount(0);
      return;
    }
    for (let i = 0; i < stages.length; i++) {
      const t = setTimeout(() => setVisibleStageCount(i + 1), i * 350);
      timersRef.current.push(t);
    }
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [phase, stages]);

  const handleConfirm = () => {
    if (!extractionResult) return;
    // If user chose a different EBITDA source, adjust the facts
    if (ebitdaChoice && extractionResult.facts[ebitdaChoice]) {
      const adjusted = {
        ...extractionResult,
        facts: {
          ...extractionResult.facts,
          // Ensure the chosen EBITDA source is the one used by preliminaryModel
          reported_ebitda: ebitdaChoice === 'reported_ebitda'
            ? extractionResult.facts.reported_ebitda
            : extractionResult.facts.operating_income,
        },
      };
      onComplete(adjusted);
    } else {
      onComplete(extractionResult);
    }
  };

  const handleManualConfirm = () => {
    // Fallback: user manually enters values
    const revenue = manualRevenue ? Number(manualRevenue) : null;
    const ebitda = manualEbitda ? Number(manualEbitda) : null;
    onComplete({
      success: true,
      facts: {
        annual_revenue: revenue != null ? { value: String(revenue), normalized: revenue, field_type: 'currency' } : undefined,
        reported_ebitda: ebitda != null ? { value: String(ebitda), normalized: ebitda, field_type: 'currency' } : undefined,
      },
      period: null,
      fields_found: (revenue != null ? 1 : 0) + (ebitda != null ? 1 : 0),
      document_type: 'profit_and_loss',
      original_filename: uploadedDocs?.[0]?.file_name || 'manual',
    });
  };

  // ── EXTRACTING phase ──────────────────────────────────────────────────────
  if (phase === 'extracting') {
    return (
      <div className="flex flex-col items-center max-w-md mx-auto px-6 pt-10 text-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-12 h-12 rounded-full bg-[#D4A853]/10 flex items-center justify-center mx-auto"
          >
            <FileText className="w-6 h-6 text-[#D4A853]" />
          </motion.div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4A853]/70 font-semibold">
            Galileo is reading…
          </p>
          <div className="flex items-center gap-2 justify-center">
            <Loader2 className="w-4 h-4 text-[#D4A853]/70 animate-spin" />
            <span className="text-sm text-white/50">
              Reading your financial statement
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── FAILED phase ──────────────────────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <div className="flex flex-col items-center max-w-md mx-auto px-6 pt-8 text-center">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5 text-red-400/80" />
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            I couldn't reliably identify enough information from that file yet.
          </p>
          <div className="flex flex-col gap-2.5 items-center">
            <Button
              onClick={extract}
              className="h-11 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" /> Try another document
            </Button>
            <button
              onClick={() => setPhase('manual')}
              className="text-xs text-white/40 hover:text-white/70"
            >
              Help Galileo confirm a few numbers
            </button>
            <button onClick={onSkip} className="text-xs text-white/30 hover:text-white/50">
              Skip — keep my estimates
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── MANUAL fallback phase ─────────────────────────────────────────────────
  if (phase === 'manual') {
    return (
      <div className="flex flex-col max-w-lg mx-auto px-6 pt-6 w-full">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-4 justify-center">
            <FileText className="w-4 h-4 text-[#D4A853]" />
            <span className="text-sm text-white/70">Help me confirm a few numbers</span>
          </div>
          <p className="text-sm text-white/55 text-center mb-6 leading-relaxed">
            Tell me the key figures you see in your document. I'll mark them as verified from your
            financials.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5 block">
                Annual Revenue (from your P&L)
              </label>
              <Input
                type="number"
                value={manualRevenue}
                onChange={(e) => setManualRevenue(e.target.value)}
                placeholder="e.g. 2500000"
                className="h-11 bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5 block">
                EBITDA (from your P&L)
              </label>
              <Input
                type="number"
                value={manualEbitda}
                onChange={(e) => setManualEbitda(e.target.value)}
                placeholder="e.g. 400000"
                className="h-11 bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="flex justify-center mt-6 gap-3">
            <Button
              onClick={handleManualConfirm}
              className="h-11 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
            >
              Update my model
            </Button>
            <button onClick={onSkip} className="text-xs text-white/40 hover:text-white/70 self-center">
              Skip — keep estimates
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── RESULTS phase — show what Galileo found ───────────────────────────────
  const facts = extractionResult?.facts || {};
  const period = extractionResult?.period;
  const revenue = facts.annual_revenue?.normalized;
  const hasReportedEbitda = facts.reported_ebitda?.normalized != null;
  const hasOperatingIncome = facts.operating_income?.normalized != null;
  const showEbitdaChoice = hasReportedEbitda && hasOperatingIncome;

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Extraction stages — only stages that actually occurred */}
        <div className="space-y-2 mb-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#D4A853]/70 font-semibold mb-3 text-center">
            Galileo learned from your document
          </p>
          <AnimatePresence>
            {stages.slice(0, visibleStageCount).map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 justify-center"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-white/70">{s.label}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Show found values + confirmation only on ambiguity */}
        {visibleStageCount >= stages.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4"
          >
            {revenue != null && (
              <p className="text-sm text-white/75 text-center leading-relaxed">
                I found revenue of <span className="text-[#D4A853] font-semibold">{fmt(revenue)}</span>
                {period && <> for <span className="text-white/85">{period}</span></>}.
                {period
                  ? ' Is that the period you want me to analyze?'
                  : ' Is that the right figure?'}
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

            <div className="flex justify-center pt-2 gap-3">
              <Button
                onClick={handleConfirm}
                className="h-11 px-6 bg-[#D4A853] text-black hover:bg-[#D4A853]/90"
              >
                Update my model
              </Button>
              <button onClick={onSkip} className="text-xs text-white/40 hover:text-white/70 self-center">
                Skip — keep estimates
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}