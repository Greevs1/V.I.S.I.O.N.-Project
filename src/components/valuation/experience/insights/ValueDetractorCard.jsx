/**
 * ValueDetractorCard — Phase 13.3E.5
 *
 * Displays an evidence-supported value suppressor with full provenance:
 * current issue, why it matters, EBITDA/multiple/risk/transferability effects,
 * estimated impact (when supported), confidence, evidence, missing evidence,
 * recommended validation step, advisor status, and client visibility.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Eye, EyeOff, ArrowRight } from 'lucide-react';

const EFFECT_COLORS = {
  Primary: '#EF4444',
  High: '#F59E0B',
  Moderate: '#A855F7',
  Low: '#6B7280',
  Critical: '#EF4444',
  '—': '#6B7280',
};

function EffectBadge({ label, value }) {
  const color = EFFECT_COLORS[value] || EFFECT_COLORS['—'];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>
        {value}
      </span>
    </div>
  );
}

export default function ValueDetractorCard({ detractor, onNavigateToValidate }) {
  const [expanded, setExpanded] = useState(false);

  const isBlocker = detractor.source === 'blocker';
  const isConflict = detractor.source === 'conflict';

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: isBlocker ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.015)',
        border: `1px solid ${isBlocker ? 'rgba(239,68,68,0.2)' : isConflict ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isBlocker && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
              <p className="text-sm font-semibold text-foreground">{detractor.name}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{detractor.current_issue}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: detractor.ev_impact_label !== 'Impact not yet quantifiable' ? '#EF4444' : '#6B7280',
                background: detractor.ev_impact_label !== 'Impact not yet quantifiable' ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)',
              }}
            >
              {detractor.ev_impact_label}
            </span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
        {!expanded && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{detractor.why_it_matters}</p>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/30">
          {/* Why it matters */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Why It Matters</p>
            <p className="text-xs text-foreground">{detractor.why_it_matters || '—'}</p>
          </div>

          {/* Effect badges */}
          <div className="grid grid-cols-2 gap-2">
            <EffectBadge label="EBITDA" value={detractor.ebitda_effect || detractor.ebitda_relevance} />
            <EffectBadge label="Multiple" value={detractor.multiple_effect || detractor.multiple_relevance} />
            <EffectBadge label="Risk" value={detractor.risk_effect || detractor.risk_relevance} />
            <EffectBadge label="Transferability" value={detractor.transferability_effect || detractor.transferability_relevance} />
          </div>

          {/* Estimated impact */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Estimated Impact</p>
            <p className="text-xs text-foreground">{detractor.ev_impact_label}</p>
          </div>

          {/* Confidence + Evidence */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Confidence</p>
              <p className="text-xs text-foreground">{detractor.confidence != null ? `${detractor.confidence}%` : '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
              <p className="text-xs text-foreground">{detractor.evidence || '—'}</p>
            </div>
          </div>

          {/* Missing evidence */}
          {detractor.missing_evidence && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Missing Evidence</p>
              <p className="text-xs text-muted-foreground">{detractor.missing_evidence}</p>
            </div>
          )}

          {/* Recommended validation */}
          {detractor.recommended_validation && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Recommended Validation Step</p>
              <p className="text-xs text-foreground">{detractor.recommended_validation}</p>
            </div>
          )}

          {/* Status + Visibility */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              Advisor Status: <span className="text-foreground font-medium">{detractor.advisor_status}</span>
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {detractor.client_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {detractor.client_visible ? 'Client Visible' : 'Internal Only'}
            </span>
          </div>

          {/* Validate link */}
          {detractor.link_to_validate && onNavigateToValidate && (
            <button
              onClick={() => onNavigateToValidate()}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              Open in Validate
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}