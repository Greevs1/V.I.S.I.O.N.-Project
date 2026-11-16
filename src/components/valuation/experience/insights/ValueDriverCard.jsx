/**
 * ValueDriverCard — Phase 13.3E.5
 *
 * Displays an evidence-supported value enhancer with full provenance:
 * driver name, category, current state, why it matters, relevance across
 * EBITDA/multiple/transferability/risk, estimated EV impact range (when
 * supported), confidence, evidence, advisor status, client visibility,
 * and explainability link.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const RELEVANCE_COLORS = {
  Primary: '#D4A853',
  High: '#00D4FF',
  Moderate: '#A855F7',
  Low: '#6B7280',
  '—': '#6B7280',
};

function RelevanceBadge({ label, value }) {
  const color = RELEVANCE_COLORS[value] || RELEVANCE_COLORS['—'];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>
        {value}
      </span>
    </div>
  );
}

export default function ValueDriverCard({ driver, onExplain }) {
  const [expanded, setExpanded] = useState(false);
  const [showClientView, setShowClientView] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.15)' }}
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{driver.name}</p>
              {driver.advisor_status === 'Approved' && (
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{driver.category}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: driver.ev_impact_label !== 'Impact not yet quantifiable' ? '#22c55e' : '#6B7280',
                background: driver.ev_impact_label !== 'Impact not yet quantifiable' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
              }}
            >
              {driver.ev_impact_label}
            </span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
        {!expanded && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{driver.why_it_matters || driver.current_state}</p>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/30">
          {/* Current state */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Current State</p>
            <p className="text-xs text-foreground">{driver.current_state || '—'}</p>
          </div>

          {/* Why it matters */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Why It Matters</p>
            <p className="text-xs text-foreground">{driver.why_it_matters || '—'}</p>
          </div>

          {/* Relevance badges */}
          <div className="grid grid-cols-2 gap-2">
            <RelevanceBadge label="EBITDA" value={driver.ebitda_relevance} />
            <RelevanceBadge label="Multiple" value={driver.multiple_relevance} />
            <RelevanceBadge label="Transferability" value={driver.transferability_relevance} />
            <RelevanceBadge label="Risk" value={driver.risk_relevance} />
          </div>

          {/* EV Impact */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Estimated Enterprise Value Impact</p>
            <p className="text-xs text-foreground">{driver.ev_impact_label}</p>
          </div>

          {/* Confidence + Evidence */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Confidence</p>
              <p className="text-xs text-foreground">{driver.confidence != null ? `${driver.confidence}%` : '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
              <p className="text-xs text-foreground">{driver.evidence || '—'}</p>
            </div>
          </div>

          {/* Status + Visibility */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              Advisor Status: <span className="text-foreground font-medium">{driver.advisor_status}</span>
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {driver.client_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {driver.client_visible ? 'Client Visible' : 'Internal Only'}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {driver.has_explainability && (
              <button
                onClick={() => onExplain?.(driver)}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Explainability
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}