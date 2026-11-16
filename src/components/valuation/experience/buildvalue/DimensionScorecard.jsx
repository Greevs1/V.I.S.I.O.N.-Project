/**
 * DimensionScorecard — Phase 13.3E.4A
 *
 * A single institutional dimension scorecard. Shows current score (actual
 * value or "Insufficient verified information"), confidence, evidence
 * completeness, strengths, risks, missing evidence, relevance labels, and
 * the recommended next validation step. No fabricated scores.
 */
import React, { useState } from 'react';
import { ChevronDown, CheckCircle2, AlertTriangle, Circle, ShieldCheck } from 'lucide-react';
import { useFieldEvidence } from '@/components/valuation/governance/FieldEvidenceContext';

const RELEVANCE_BADGE = {
  Primary: { color: '#D4A853', bg: 'rgba(212,168,83,0.1)' },
  High: { color: '#00D4FF', bg: 'rgba(0,212,255,0.1)' },
  Moderate: { color: '#A855F7', bg: 'rgba(168,85,247,0.1)' },
};

function RelevanceBadge({ label, value }) {
  const style = RELEVANCE_BADGE[value] || { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
  return (
    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: style.color, background: style.bg }}>
      {label}: {value}
    </span>
  );
}

export default function DimensionScorecard({ scorecard }) {
  const [expanded, setExpanded] = useState(false);
  const { openEvidence } = useFieldEvidence();
  if (!scorecard) return null;

  const hasScore = !!scorecard.current_score;
  const sufficient = scorecard.evidence_completeness >= 60 && scorecard.confidence >= 70;
  const openDimEvidence = (e) => {
    e.stopPropagation();
    openEvidence(scorecard.key, scorecard.label, 'driver', hasScore ? `${scorecard.current_score.value}/100` : 'Insufficient data');
  };
  const strengths = Array.isArray(scorecard.strengths) ? scorecard.strengths : [];
  const risks = Array.isArray(scorecard.risks) ? scorecard.risks : [];
  const missingEvidence = Array.isArray(scorecard.missing_evidence) ? scorecard.missing_evidence : [];

  const headerTone = sufficient
    ? { color: '#22c55e', bg: 'rgba(34,197,94,0.04)', border: 'rgba(34,197,94,0.15)' }
    : scorecard.evidence_completeness > 0
    ? { color: '#F59E0B', bg: 'rgba(245,158,11,0.04)', border: 'rgba(245,158,11,0.15)' }
    : { color: '#6B7280', bg: 'rgba(107,114,128,0.04)', border: 'rgba(107,114,128,0.15)' };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: headerTone.bg, border: `1px solid ${headerTone.border}` }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-white/[0.01] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0">
            {sufficient ? (
              <ShieldCheck className="w-4 h-4" style={{ color: headerTone.color }} />
            ) : scorecard.evidence_completeness > 0 ? (
              <AlertTriangle className="w-4 h-4" style={{ color: headerTone.color }} />
            ) : (
              <Circle className="w-4 h-4" style={{ color: headerTone.color }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{scorecard.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {hasScore
                ? `${scorecard.current_score.label}: ${scorecard.current_score.value}${scorecard.current_score.verified ? ' · Verified' : ' · Provisional'}`
                : 'Insufficient verified information'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Evidence</p>
            <p className="text-sm font-semibold" style={{ color: headerTone.color }}>{scorecard.evidence_completeness}%</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
          {/* Relevance badges */}
          <div className="flex flex-wrap gap-1.5 pt-3">
            <RelevanceBadge label="EBITDA" value={scorecard.ebitda_relevance} />
            <RelevanceBadge label="Multiple" value={scorecard.multiple_relevance} />
            <RelevanceBadge label="Transferability" value={scorecard.transferability_relevance} />
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-2">
            <div
              className="rounded-lg p-2.5 bg-background/40 cursor-pointer hover:bg-background/60 transition-colors"
              onClick={openDimEvidence}
              title="View evidence"
            >
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Current Score</p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {hasScore ? scorecard.current_score.value : 'Insufficient'}
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-background/40">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {scorecard.confidence > 0 ? `${scorecard.confidence}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-background/40">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Evidence</p>
              <p className="text-sm font-medium text-foreground mt-0.5">{scorecard.evidence_completeness}%</p>
            </div>
          </div>

          {/* Strengths */}
          {strengths.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1.5">Strengths</p>
              <div className="space-y-1">
                {strengths.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:opacity-70 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); openEvidence(scorecard.key, `${scorecard.label} — Strength: ${s.label}`, 'driver', s.value); }}
                    title="View evidence"
                  >
                    <CheckCircle2 className="w-3 h-3 text-accent shrink-0" />
                    <span className="text-foreground">{s.label}: {s.value}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{s.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {risks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-1.5">Risks</p>
              <div className="space-y-1">
                {risks.map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:opacity-70 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); openEvidence(scorecard.key, `${scorecard.label} — Risk: ${r.label}`, 'driver', r.value); }}
                    title="View evidence"
                  >
                    <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                    <span className="text-foreground">{r.label}: {r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing evidence */}
          {missingEvidence.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Missing Evidence</p>
              <div className="flex flex-wrap gap-1.5">
                {missingEvidence.map((m) => (
                  <span key={m} className="text-[10px] px-2 py-0.5 rounded bg-muted/40 text-muted-foreground">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended next step */}
          <div className="rounded-lg p-2.5" style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.15)' }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-primary/80">Next validation step</p>
            <p className="text-xs text-foreground mt-0.5">{scorecard.recommended_next_step}</p>
          </div>
        </div>
      )}
    </div>
  );
}