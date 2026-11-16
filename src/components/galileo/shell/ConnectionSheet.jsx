/**
 * ConnectionSheet — the financial connection moment.
 *
 * Non-demanding language. Progressive reveal of options.
 * Explains the BENEFIT before asking for data.
 * Never implies connecting data is required.
 *
 * Primary: Connect accounting (QuickBooks, Wave, Xero)
 * Secondary: Upload financials (P&L, Balance Sheet, Tax Return)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, FileText, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

export default function ConnectionSheet({ onConnectAction, onDocumentUploaded, guestSessionId }) {
  const [showAccounting, setShowAccounting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 max-w-[560px] mx-auto"
    >
      {/* Benefit statement — explain before asking */}
      <p className="text-[13px] text-white/50 text-center leading-relaxed">
        Connecting your accounting lets Galileo verify profitability, cash flow,
        trends, and valuation assumptions.
      </p>

      {/* Primary: Connect accounting */}
      <div className="space-y-2">
        <button
          onClick={() => setShowAccounting((s) => !s)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-[#D4A853]/25 hover:bg-[#D4A853]/[0.03] transition-all text-left"
        >
          <Building2 className="w-4 h-4 text-white/40 shrink-0" />
          <div className="flex-1">
            <span className="block text-sm font-medium text-white/85">Connect accounting</span>
            <span className="block text-[11px] text-white/40 mt-0.5">QuickBooks, Wave, Xero</span>
          </div>
          {showAccounting ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
        </button>
        <AnimatePresence>
          {showAccounting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1.5 pl-2"
            >
              {['QuickBooks', 'Wave', 'Xero'].map((provider) => (
                <button
                  key={provider}
                  disabled
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01] text-left opacity-50 cursor-not-allowed"
                >
                  <span className="text-[13px] text-white/60">{provider}</span>
                  <span className="text-[10px] text-white/30">Coming soon</span>
                </button>
              ))}
              <p className="text-[10px] text-white/30 px-2 pt-1">
                Accounting connections are on the roadmap. For now, upload your financials below.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Secondary: Upload financials */}
      <div className="space-y-2">
        <button
          onClick={() => setShowUpload((s) => !s)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-[#D4A853]/25 hover:bg-[#D4A853]/[0.03] transition-all text-left"
        >
          <FileText className="w-4 h-4 text-white/40 shrink-0" />
          <div className="flex-1">
            <span className="block text-sm font-medium text-white/85">Upload financials</span>
            <span className="block text-[11px] text-white/40 mt-0.5">P&L, Balance Sheet, Tax Return</span>
          </div>
          {showUpload ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
        </button>
        <AnimatePresence>
          {showUpload && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <button
                onClick={() => onConnectAction?.('share_financials')}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-[#D4A853]/20 bg-[#D4A853]/[0.04] hover:bg-[#D4A853]/[0.08] transition-all text-left"
              >
                <span className="text-[13px] text-white/75">Choose a file to upload</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#D4A853]" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Keep Exploring — always available, never forced */}
      <div className="pt-2">
        <button
          onClick={() => onConnectAction?.('keep_exploring')}
          className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
        >
          Keep exploring with my estimates
        </button>
      </div>
    </motion.div>
  );
}