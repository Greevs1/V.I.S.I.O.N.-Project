/**
 * InitiativeCard — Phase 13.3E.5
 *
 * Displays a Growth Plan initiative with full provenance: name, summary,
 * business problem, supporting value driver, Build Value dimension, evidence,
 * relevance across EBITDA/multiple/transferability/risk/confidence, estimated
 * impacts (when supported), cost, ROI, timeline, difficulty, confidence,
 * dependencies, responsible role, KPI, baseline, target, verification method,
 * advisor status, client visibility, execution readiness, and notes.
 *
 * Supports status transitions and chain-of-custody drawer trigger.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Network, Eye, EyeOff, Edit3, ArrowRight } from 'lucide-react';
import { INITIATIVE_STATUSES } from '@/lib/valuation/growthPlanEngine';
import { useFieldEvidence } from '@/components/valuation/governance/FieldEvidenceContext';

const RELEVANCE_COLORS = {
  Primary: '#D4A853',
  High: '#00D4FF',
  Moderate: '#A855F7',
  Low: '#6B7280',
  '—': '#6B7280',
};

const DIFFICULTY_COLORS = {
  Low: '#22c55e',
  Medium: '#F59E0B',
  High: '#EF4444',
  'Very High': '#EF4444',
};

function StatusBadge({ status }) {
  const meta = INITIATIVE_STATUSES.find((s) => s.key === status) || INITIATIVE_STATUSES[0];
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ color: meta.color, background: `${meta.color}15` }}
    >
      {meta.label}
    </span>
  );
}

function RelevanceChip({ label, value }) {
  const color = RELEVANCE_COLORS[value] || RELEVANCE_COLORS['—'];
  return (
    <span className="text-[10px] flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span style={{ color }}>{value}</span>
    </span>
  );
}

export default function InitiativeCard({ initiative, canEdit, onEdit, onStatusChange, onOpenChain, onNavigateToValidate }) {
  const [expanded, setExpanded] = useState(false);
  const { openEvidence } = useFieldEvidence();
  const statusMeta = INITIATIVE_STATUSES.find((s) => s.key === initiative.status) || INITIATIVE_STATUSES[0];

  const openInitEvidence = (fieldKey, label, value) => (e) => {
    e.stopPropagation();
    openEvidence(fieldKey, label, 'driver', value);
  };

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: `1px solid ${statusMeta.color}25`,
      }}
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{initiative.name}</p>
              {initiative.source === 'fast_win' && (
                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-accent bg-accent/10">
                  Fast Win
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{initiative.summary}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={initiative.status} />
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
        {!expanded && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Timeline: {initiative.timeline || '—'}</span>
            <span className="text-[10px]" style={{ color: DIFFICULTY_COLORS[initiative.difficulty] || '#6B7280' }}>
              {initiative.difficulty}
            </span>
            <span className="text-[10px] text-muted-foreground">Confidence: {initiative.confidence || 0}%</span>
            <span className="text-[10px] text-muted-foreground">EV: {initiative.estimated_ev_impact_label}</span>
          </div>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/30">
          {/* Business problem */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Business Problem</p>
            <p className="text-xs text-foreground">{initiative.business_problem || '—'}</p>
          </div>

          {/* Relevance chips */}
          <div className="flex flex-wrap gap-3">
            <RelevanceChip label="EBITDA" value={initiative.ebitda_relevance} />
            <RelevanceChip label="Multiple" value={initiative.multiple_relevance} />
            <RelevanceChip label="Transferability" value={initiative.transferability_relevance} />
            <RelevanceChip label="Risk" value={initiative.risk_relevance} />
            <RelevanceChip label="Confidence" value={initiative.confidence_relevance} />
          </div>

          {/* Estimated impacts */}
          <div className="grid grid-cols-2 gap-2">
            <div className="cursor-pointer hover:opacity-70 transition-opacity" onClick={openInitEvidence('estimated_ebitda_impact', `${initiative.name} — EBITDA Impact`, initiative.estimated_ebitda_impact)} title="View evidence">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Estimated EBITDA Impact</p>
              <p className="text-xs text-foreground">{initiative.estimated_ebitda_impact || '—'}</p>
            </div>
            <div className="cursor-pointer hover:opacity-70 transition-opacity" onClick={openInitEvidence('estimated_multiple_impact', `${initiative.name} — Multiple Impact`, initiative.estimated_multiple_impact)} title="View evidence">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Estimated Multiple Impact</p>
              <p className="text-xs text-foreground">{initiative.estimated_multiple_impact || '—'}</p>
            </div>
            <div className="col-span-2 cursor-pointer hover:opacity-70 transition-opacity" onClick={openInitEvidence('enterprise_value', `${initiative.name} — EV Impact`, initiative.estimated_ev_impact_label)} title="View evidence">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Estimated Enterprise Value Impact</p>
              <p className="text-xs text-foreground">{initiative.estimated_ev_impact_label}</p>
            </div>
          </div>

          {/* Cost + ROI + Timeline */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Est. Cost</p>
              <p className="text-xs text-foreground">{initiative.estimated_cost != null ? `$${initiative.estimated_cost}` : '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Expected ROI</p>
              <p className="text-xs text-foreground">{initiative.expected_roi || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Timeline</p>
              <p className="text-xs text-foreground">{initiative.timeline || '—'}</p>
            </div>
          </div>

          {/* KPI + Baseline + Target */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">KPI</p>
              <p className="text-xs text-foreground">{initiative.kpi || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Baseline</p>
              <p className="text-xs text-foreground">{initiative.baseline || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Target</p>
              <p className="text-xs text-foreground">{initiative.target || '—'}</p>
            </div>
          </div>

          {/* Dependencies + Verification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Dependencies</p>
              <p className="text-xs text-foreground">{initiative.dependencies?.length ? initiative.dependencies.join(', ') : '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Verification Method</p>
              <p className="text-xs text-foreground">{initiative.verification_method || '—'}</p>
            </div>
          </div>

          {/* Execution readiness + Responsible */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              Execution: <span className="text-foreground font-medium">{initiative.execution_readiness || 'Not Ready'}</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
              Responsible: <span className="text-foreground font-medium">{initiative.responsible_role || '—'}</span>
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {initiative.client_visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {initiative.client_visible ? 'Client Visible' : 'Internal Only'}
            </span>
          </div>

          {/* Notes */}
          {initiative.notes && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
              <p className="text-xs text-muted-foreground">{initiative.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={() => onOpenChain?.(initiative)}
              className="flex items-center gap-1 text-[10px] text-accent hover:underline"
            >
              <Network className="w-3 h-3" />
              Chain of Custody
            </button>
            {canEdit && (
              <button
                onClick={() => onEdit?.(initiative)}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <Edit3 className="w-3 h-3" />
                Edit
              </button>
            )}
            {canEdit && initiative.status === 'candidate' && (
              <button
                onClick={() => onStatusChange?.(initiative, 'advisor_review')}
                className="text-[10px] text-primary hover:underline"
              >
                Send to Review →
              </button>
            )}
            {canEdit && initiative.status === 'advisor_review' && (
              <button
                onClick={() => onStatusChange?.(initiative, 'approved')}
                className="text-[10px] text-accent hover:underline"
              >
                Approve →
              </button>
            )}
            {canEdit && initiative.status === 'approved' && (
              <button
                onClick={() => onStatusChange?.(initiative, 'client_visible')}
                className="text-[10px] text-primary hover:underline"
              >
                Make Client Visible →
              </button>
            )}
            {initiative.link_to_validate && onNavigateToValidate && (
              <button
                onClick={() => onNavigateToValidate()}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
              >
                Open in Validate <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}