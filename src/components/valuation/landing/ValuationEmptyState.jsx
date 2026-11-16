/**
 * ValuationEmptyState — Phase 13.3F.2
 *
 * Guided starting state shown when a valuation exists but no approved
 * conclusion exists yet. Shows real readiness percentage, what has been
 * gathered, what is still needed, and primary/secondary actions.
 * No fabricated data — all counts come from intelligence and readiness.
 */
import React from 'react';
import { CheckCircle2, AlertCircle, ArrowRight, Upload, Database, FileText, ShieldCheck } from 'lucide-react';

export default function ValuationEmptyState({ emptyState, valuationId, onNavigate, onUpload, canEdit }) {
  if (!emptyState) return null;
  const { readinessPct, gathered, missing } = emptyState;

  return (
    <div
      className="rounded-2xl p-6 sm:p-8"
      style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(0,212,255,0.12)' }}
    >
      {/* Readiness headline */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-accent/80 mb-2">Valuation Readiness</p>
        <p className="text-3xl sm:text-4xl font-display font-bold text-foreground">
          {readinessPct > 0 ? `${readinessPct}% ready` : 'Getting started'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          The platform is gathering and organizing the information needed to determine your business value.
        </p>
      </div>

      {/* What's been gathered */}
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Already Gathered</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GatheredItem icon={FileText} label="Financial Documents" value={gathered.documents} />
          <GatheredItem icon={ShieldCheck} label="Completed Assessments" value={gathered.assessments} />
          <GatheredItem icon={Database} label="Verified Data Points" value={gathered.verifiedPoints} />
        </div>
      </div>

      {/* Still needed */}
      {missing.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Still Needed</p>
          <div className="space-y-1.5">
            {missing.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-3 h-3 text-amber-400/70 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/[0.06]">
        <button
          onClick={() => onNavigate?.('discover')}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
          style={{ background: '#D4A853', color: '#08080C' }}
        >
          Continue Discover
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onUpload}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload Documents
        </button>
      </div>
    </div>
  );
}

function GatheredItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <CheckCircle2 className="w-4 h-4 text-accent/70 shrink-0" />
      <div>
        <p className="text-lg font-display font-semibold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground/70">{label}</p>
      </div>
    </div>
  );
}