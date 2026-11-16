/**
 * ValuationCommandHeader — Phase 13.3F.1
 *
 * Reduced valuation header. Shows only:
 *   Enterprise Value, Equity Value, Confidence, Advisor Conclusion status,
 *   Publication Readiness.
 *
 * Secondary items (engine version, methodology version, last calculated,
 * detailed lifecycle state, defensible/potential value, engagement metadata)
 * move into a compact "Valuation Details" drawer.
 *
 * Never shows $0 unless zero is an actual approved result.
 */
import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, Clock, Lock, CheckCircle2, FileWarning, Info } from 'lucide-react';
import { fmtCurrency, fmtRange, getBlendedRecon, getEquityBridge, getApprovedConclusion, getOverallConfidence, getLatestCalcVersion, getLatestCalcDate, getWorkflowStateLabel } from '@/lib/valuation/valuationState';
import DetailDrawer from '../shared/DetailDrawer';
import { useFieldEvidence } from '@/components/valuation/governance/FieldEvidenceContext';

export default function ValuationCommandHeader({ summary, calcSummary, readiness }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { openEvidence } = useFieldEvidence();

  const recon = getBlendedRecon(calcSummary);
  const bridge = getEquityBridge(calcSummary);
  const conclusion = getApprovedConclusion(calcSummary);
  const overallConf = getOverallConfidence(calcSummary);
  const engineVersion = getLatestCalcVersion(calcSummary);
  const calcDate = getLatestCalcDate(calcSummary);
  const workflowLabel = getWorkflowStateLabel({ summary, calcSummary, readiness });
  const hasConclusion = !!conclusion;
  const isReady = readiness?.ready || false;
  const hasBlockers = (readiness?.critical_blockers?.length || 0) > 0;

  const evMid = recon?.enterprise_value_mid ?? conclusion?.enterprise_value_mid ?? null;
  const evLow = recon?.enterprise_value_low ?? conclusion?.enterprise_value_low ?? null;
  const evHigh = recon?.enterprise_value_high ?? conclusion?.enterprise_value_high ?? null;
  const eqMid = bridge?.equity_value_mid ?? conclusion?.equity_value_mid ?? null;
  const eqLow = bridge?.equity_value_low ?? conclusion?.equity_value_low ?? null;
  const eqHigh = bridge?.equity_value_high ?? conclusion?.equity_value_high ?? null;
  const defMid = conclusion?.defensible_value_mid ?? null;
  const defLow = conclusion?.defensible_value_low ?? null;
  const defHigh = conclusion?.defensible_value_high ?? null;
  const potentialConclusion = (calcSummary?.conclusions || []).find((c) => c.conclusion_type === 'potential');
  const potMid = potentialConclusion?.enterprise_value_mid ?? null;
  const confScore = overallConf?.score ?? conclusion?.confidence_score ?? null;
  const valuation = summary?.valuation;

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Status row — conclusion + publication + details button */}
      <div className="flex flex-wrap items-center gap-2">
        {hasConclusion ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <ShieldCheck className="w-3.5 h-3.5" /> Advisor-Approved
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> {workflowLabel}
          </span>
        )}
        <span className="text-muted-foreground/30">·</span>
        {isReady ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <CheckCircle2 className="w-3 h-3" /> Ready to Publish
          </span>
        ) : hasBlockers ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <FileWarning className="w-3 h-3" /> {readiness.critical_blockers.length} Blocker{readiness.critical_blockers.length !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" /> Not Ready
          </span>
        )}
        <button
          onClick={() => setDetailsOpen(true)}
          className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="w-3 h-3" />
          Details
        </button>
      </div>

      {/* Value panels — only EV and Equity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ValuePanel
          label="Enterprise Value"
          mid={hasConclusion ? evMid : null}
          low={hasConclusion ? evLow : null}
          high={hasConclusion ? evHigh : null}
          accent="#D4A853"
          primary
          stale={recon?.is_stale}
          onClick={() => openEvidence('enterprise_value', 'Enterprise Value', 'conclusion', evMid != null ? `${fmtCurrency(evMid)} (${fmtRange(evLow, evHigh)})` : null)}
        />
        <ValuePanel
          label="Equity Value"
          mid={hasConclusion ? eqMid : null}
          low={hasConclusion ? eqLow : null}
          high={hasConclusion ? eqHigh : null}
          accent="#00D4FF"
          primary
          stale={bridge?.is_stale}
          onClick={() => openEvidence('equity_value', 'Equity Value', 'conclusion', eqMid != null ? `${fmtCurrency(eqMid)} (${fmtRange(eqLow, eqHigh)})` : null)}
        />
      </div>

      {/* Confidence */}
      {confScore != null && (
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => openEvidence('overall_confidence', 'Overall Confidence', 'confidence', `${confScore}%`)}
        >
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</span>
          <span
            className="text-sm font-semibold"
            style={{ color: confScore >= 70 ? '#22c55e' : confScore >= 50 ? '#F59E0B' : '#EF4444' }}
          >
            {confScore}%
          </span>
        </div>
      )}

      {/* Details drawer */}
      <DetailDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Valuation Details"
        subtitle="Engine metadata, lifecycle state, and supporting value figures"
      >
        <div className="space-y-5">
          {/* Supporting values */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supporting Values</p>
            <DetailRow label="Defensible Value" value={defMid != null ? `${fmtCurrency(defMid)} (${fmtRange(defLow, defHigh)})` : 'Not determined'} />
            <DetailRow label="Potential Value" value={potMid != null ? fmtCurrency(potMid) : 'Not modeled'} hint="Future modeled value — not current value" />
          </div>

          {/* Engine metadata */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Engine Metadata</p>
            <DetailRow label="Engine Version" value={engineVersion ? `v${engineVersion}` : '—'} />
            <DetailRow label="Last Calculated" value={calcDate || '—'} />
            <DetailRow label="Lifecycle State" value={workflowLabel} />
          </div>

          {/* Engagement metadata */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Engagement</p>
            <DetailRow label="Purpose" value={valuation?.valuation_purpose?.replace(/_/g, ' ') || 'Not set'} />
            <DetailRow label="Standard of Value" value={valuation?.standard_of_value?.replace(/_/g, ' ') || 'Not set'} />
            <DetailRow label="Premise" value={valuation?.valuation_premise?.replace(/_/g, ' ') || 'Not set'} />
            <DetailRow label="Valuation Date" value={valuation?.valuation_date || 'Not set'} />
            <DetailRow label="Published Versions" value={String(summary?.versionCount || 0)} />
          </div>
        </div>
      </DetailDrawer>
    </div>
  );
}

function ValuePanel({ label, mid, low, high, accent, primary, stale, onClick }) {
  const hasValue = mid != null || low != null || high != null;
  return (
    <div
      className={`rounded-lg p-4 transition-all ${onClick ? 'cursor-pointer hover:brightness-110' : ''}`}
      style={{ background: `${accent}08`, border: `1px solid ${accent}22` }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{label}</p>
        {stale && (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-amber-400">
            <AlertTriangle className="w-2.5 h-2.5" /> Stale
          </span>
        )}
      </div>
      {hasValue ? (
        <>
          <p className="font-display font-bold text-foreground text-2xl">
            {fmtCurrency(mid)}
          </p>
          {(low != null || high != null) && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{fmtRange(low, high)}</p>
          )}
        </>
      ) : (
        <p className="font-display text-lg text-muted-foreground/50">Not yet determined</p>
      )}
    </div>
  );
}

function DetailRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">
        <span className="text-xs text-foreground font-medium">{value}</span>
        {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}