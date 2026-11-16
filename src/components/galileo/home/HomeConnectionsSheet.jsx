/**
 * HomeConnectionsSheet — the contextual source surface.
 *
 * Do not send users into Settings first. Show what Galileo knows from
 * each source, and what connecting would improve.
 *
 *   WHAT GALILEO KNOWS FROM
 *   QuickBooks      Connected
 *   2025 Tax Return Analyzed
 *   August P&L      Analyzed
 *   Payroll         Not connected
 *
 *   WHAT CONNECTING THIS WOULD IMPROVE
 *   Payroll
 *   Would improve: Operations, Tax, Profit
 *   [Connect]
 *
 * This makes Connections about intelligence, not integrations.
 * Only show providers actually supported.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Link2, FileText, Building2, Upload, ArrowRight } from 'lucide-react';

export default function HomeConnectionsSheet({ connections = [], onBack, onAddFinancials }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5 max-w-[640px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </button>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">
          Sources
        </p>
      </div>

      {/* What Galileo knows from */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-white/30">
          What Galileo Knows From
        </p>
        {connections.length > 0 ? (
          connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.05] bg-white/[0.015]"
            >
              {conn.icon === 'building' && <Building2 className="w-4 h-4 text-white/35 shrink-0" />}
              {conn.icon === 'file' && <FileText className="w-4 h-4 text-white/35 shrink-0" />}
              {conn.icon === 'link' && <Link2 className="w-4 h-4 text-white/35 shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="block text-[13px] text-white/75">
                  {conn.name}
                </span>
                {conn.improves && !conn.connected && (
                  <span className="block text-[11px] text-white/40 mt-0.5">
                    Would improve: {conn.improves.join(', ')}
                  </span>
                )}
              </div>
              {conn.connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#D4A853] shrink-0">
                  <Check className="w-3 h-3" />
                  Connected
                </span>
              ) : conn.analyzed ? (
                <span className="text-[11px] text-white/40 shrink-0">Analyzed</span>
              ) : (
                <span className="text-[11px] text-white/30 shrink-0">Not connected</span>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-[13px] text-white/40 leading-relaxed max-w-[400px] mx-auto">
              Galileo doesn't have any financial documents yet. Upload a P&L,
              tax return, or balance sheet to unlock real business intelligence.
            </p>
          </div>
        )}

        {/* Accounting integration — not yet available */}
        {/* The ONE connection action that actually works today: the real
            document upload path in the Data Room. Everything else on this
            surface is a status read, and the accounting providers below are
            honestly marked as not yet available rather than given a Connect
            button that cannot connect. */}
        {onAddFinancials && (
          <button
            type="button"
            onClick={onAddFinancials}
            className="group flex w-full items-center gap-3 rounded-xl border border-vision-gold/20 bg-vision-gold/[0.035] px-4 py-3 text-left transition-all duration-200 hover:border-vision-gold/40 hover:bg-vision-gold/[0.06] vision-focus"
          >
            <Upload className="h-4 w-4 shrink-0 text-vision-champagne/80" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-white/85">Add a financial document</span>
              <span className="block text-[11px] text-white/40 mt-0.5">
                Upload a P&amp;L, tax return, or balance sheet in your Data Room
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-vision-champagne/70 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        )}

        <div className="pt-3 mt-2 border-t border-white/[0.04]">
          <p className="text-[10px] uppercase tracking-wider text-white/25 mb-2">
            Accounting Integration
          </p>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.03] bg-white/[0.005] opacity-60">
            <Building2 className="w-4 h-4 text-white/25 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="block text-[13px] text-white/50">
                QuickBooks / Xero / Wave
              </span>
              <span className="block text-[11px] text-white/30 mt-0.5">
                Not yet available — coming soon
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}