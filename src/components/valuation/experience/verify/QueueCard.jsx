/**
 * QueueCard — Phase 13.3E.3
 * Expandable verification queue item with evidence drawer and actions.
 */
import React, { useState } from 'react';
import {
  ChevronDown, ChevronRight, Check, Edit3, X, Scale, FileText,
  UserPlus, Pause, Eye, MessageSquare, Layers,
} from 'lucide-react';

const PRIORITY_META = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)', label: 'Critical' },
  high: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', label: 'High' },
  medium: { color: '#00D4FF', bg: 'rgba(0,212,255,0.06)', border: 'rgba(0,212,255,0.25)', label: 'Medium' },
  low: { color: '#6B7280', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.25)', label: 'Low' },
};

const TYPE_LABELS = {
  conflicting_value: 'Conflict',
  low_confidence_value: 'Low Confidence',
  missing_required_field: 'Missing',
  missing_document: 'Missing Document',
  proposed_add_back: 'Add-Back',
  proposed_deduction: 'Deduction',
  advisor_judgment: 'Advisor Judgment',
  client_confirmation: 'Client Confirmation',
  methodology_decision: 'Methodology',
  unsupported_assumption: 'Assumption',
  stale_value: 'Stale',
  reconciliation_required: 'Reconciliation',
  document_mapping_review: 'Doc Mapping',
  assessment_conflict: 'Assessment Conflict',
  publication_blocker: 'Publication Blocker',
};

export default function QueueCard({ item, canEdit, onResolve, onResolveConflict, onApproveAddBack, onRejectAddBack, onRequestClient, onAssign, intelligenceWhy }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.suggested_value ?? '');
  const [reason, setReason] = useState('');
  const meta = PRIORITY_META[item.priority] || PRIORITY_META.medium;
  const typeLabel = TYPE_LABELS[item.item_type] || item.item_type;
  const isConflict = item.item_type === 'conflicting_value';
  const isAddBack = item.item_type === 'proposed_add_back';
  const isPubBlocker = item.item_type === 'publication_blocker';

  const handleConfirm = () => onResolve(item.id, 'confirm');
  const handleEdit = () => {
    onResolve(item.id, 'edit', { resolution_value: editValue, resolution_reason: reason || undefined });
    setEditing(false);
  };
  const handleReject = () => onResolve(item.id, 'reject', { resolution_reason: reason || undefined });
  const handleNotApplicable = () => onResolve(item.id, 'not_applicable');
  const handleDefer = () => onResolve(item.id, 'defer', { deferred_until: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] });

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-3.5 text-left"
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ color: meta.color, background: `${meta.color}1a` }}
            >
              {meta.label}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">{typeLabel}</span>
            {item.confidence_score != null && (
              <span className="text-[10px] text-muted-foreground/70">{Math.round(item.confidence_score)}% conf</span>
            )}
            {item.status !== 'open' && (
              <span className="text-[10px] text-muted-foreground/70 capitalize">{item.status.replace(/_/g, ' ')}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
          {intelligenceWhy && (
            <p className="text-[11px] text-primary/55 mt-1 italic leading-relaxed">{intelligenceWhy}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/80">
            {item.source_name && <span className="truncate">Source: {item.source_name}</span>}
            {item.reporting_period && <span>{item.reporting_period}</span>}
            {item.valuation_impact && <span className="capitalize">Impact: {item.valuation_impact.replace(/_/g, ' ')}</span>}
          </div>
        </div>
        {item.suggested_value != null && item.formatted_value && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-foreground">{item.formatted_value}</p>
          </div>
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/40 pt-3">
          {/* Evidence */}
          <EvidenceSection item={item} />

          {/* Conflict comparison */}
          {isConflict && item.alternative_values?.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <SourceBox label={item.source_name || 'Source A'} value={item.formatted_value || String(item.suggested_value ?? '—')} confidence={item.confidence_score} />
              <SourceBox label={item.alternative_values[0].source_name || 'Source B'} value={String(item.alternative_values[0].value ?? '—')} confidence={item.alternative_values[0].confidence} />
            </div>
          )}

          {/* Edit mode */}
          {editing && (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground">Resolved value</label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
              />
              <label className="text-[11px] font-semibold text-muted-foreground">Reason (optional)</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this value..."
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
              />
              <div className="flex gap-2">
                <button onClick={handleEdit} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Save</button>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs">Cancel</button>
              </div>
            </div>
          )}

          {/* Reason input for reject */}
          {!editing && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Resolution note (optional, required for material conflicts)..."
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-xs text-foreground"
            />
          )}

          {/* Actions */}
          {canEdit && !editing && (
            <div className="flex flex-wrap gap-1.5">
              {isConflict ? (
                <ActionBtn icon={Scale} label="Resolve Conflict" color="#A855F7" onClick={() => onResolveConflict(item)} />
              ) : isAddBack ? (
                <>
                  <ActionBtn icon={Check} label="Approve" color="#22c55e" onClick={() => onApproveAddBack(item)} />
                  <ActionBtn icon={Edit3} label="Approve w/ Change" color="#00D4FF" onClick={() => onApproveAddBack(item, true)} />
                  <ActionBtn icon={X} label="Reject" color="#EF4444" onClick={() => onRejectAddBack(item)} />
                </>
              ) : (
                <>
                  <ActionBtn icon={Check} label="Confirm" color="#22c55e" onClick={handleConfirm} />
                  <ActionBtn icon={Edit3} label="Edit" color="#00D4FF" onClick={() => { setEditValue(item.suggested_value ?? ''); setEditing(true); }} />
                  <ActionBtn icon={X} label="Reject" color="#EF4444" onClick={handleReject} />
                </>
              )}
              <ActionBtn icon={UserPlus} label="Request from Client" color="#A855F7" onClick={() => onRequestClient(item)} />
              <ActionBtn icon={Pause} label="Defer" color="#6B7280" onClick={handleDefer} />
              <ActionBtn icon={X} label="N/A" color="#6B7280" onClick={handleNotApplicable} />
              <ActionBtn icon={Eye} label="Evidence" color="#6B7280" onClick={() => {}} />
              <ActionBtn icon={Layers} label="Advanced" color="#6B7280" onClick={() => onAssign?.(item)} />
            </div>
          )}
          {!canEdit && (
            <p className="text-[11px] text-muted-foreground italic">View only — assignment required to resolve.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SourceBox({ label, value, confidence }) {
  return (
    <div className="rounded-lg p-2.5 bg-background/40 border border-border/50">
      <p className="text-[10px] font-semibold text-muted-foreground mb-1 truncate">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
      {confidence != null && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{Math.round(confidence)}% confidence</p>}
    </div>
  );
}

function EvidenceSection({ item }) {
  const rows = [];
  if (item.source_name) rows.push(['Primary source', item.source_name]);
  if (item.reporting_period) rows.push(['Reporting period', item.reporting_period]);
  if (item.confidence_score != null) rows.push(['Confidence', `${Math.round(item.confidence_score)}%`]);
  if (item.valuation_impact) rows.push(['Valuation impact', item.valuation_impact.replace(/_/g, ' ')]);
  if (item.evidence_count > 0) rows.push(['Evidence sources', String(item.evidence_count)]);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg bg-background/30 border border-border/40 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Evidence</p>
      <div className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-foreground font-medium text-right">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{ color, background: `${color}14`, border: `1px solid ${color}33` }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}