/**
 * EvidenceDrawer — provenance view for a single valuation field.
 *
 * Opens when a metric is clicked (via FieldEvidenceContext). Shows:
 *   1. Field Governance — owner, lock status, last modified, source of truth,
 *      confidence, change reason
 *   2. Source Documents — from intelligence documents
 *   3. AI Extraction History — from intelligence candidates matching field_key
 *   4. Advisor Decisions — from audit log entries matching field_key
 *   5. Change History — from audit log
 *   6. Change Requests — pending requests for this field
 *   7. Supporting Calculations — from calcSummary if available
 *
 * Read-only users see a "Request Change" action instead of lock/unlock controls.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Lock, Unlock, Shield, FileText, Sparkles, History, MessageSquare,
  Calculator, User, Clock, CheckCircle, AlertCircle, Send, Archive, FileLock,
} from 'lucide-react';
import { getValuationAuditLog } from '@/lib/valuationService';
import { reviewChangeRequest } from '@/lib/fieldGovernanceService';
import { getMetricDefinition, isDerivedMetric, getSourceEditDestination } from '@/lib/valuation/metricEvidenceRegistry';

function Section({ icon: Icon, title, children, count }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h4>
        {count != null && count > 0 && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{count}</span>
        )}
      </div>
      <div className="space-y-1.5 pl-1">{children}</div>
    </div>
  );
}

function EmptyHint({ text }) {
  return <p className="text-[11px] text-muted-foreground/50 italic pl-1">{text}</p>;
}

export default function EvidenceDrawer({
  fieldKey, displayName, category, currentValue,
  valuationId, intelligence, calcSummary, governance, canEdit, isImmutable, onClose,
}) {
  const [auditLog, setAuditLog] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewAction, setReviewAction] = useState(null); // { id, decision }

  const record = governance?.getField?.(fieldKey);
  const pendingRequests = governance?.pendingRequestsForField?.(fieldKey) || [];
  const def = getMetricDefinition(fieldKey);
  const derived = isDerivedMetric(fieldKey);
  const editDestination = getSourceEditDestination(fieldKey);
  // Immutable (published/archived) — no editing or unlocking, ever.
  // Derived values — no direct edit; route to source inputs instead.
  const canEditField = canEdit && !isImmutable && !derived && def.editable;

  const loadAudit = useCallback(async () => {
    if (!valuationId) return;
    setLoadingAudit(true);
    try {
      const res = await getValuationAuditLog(valuationId);
      const logs = res?.logs || [];
      // Filter entries that mention this field_key in action_details
      const filtered = logs.filter((l) => {
        const detailStr = JSON.stringify(l.action_details || {});
        return detailStr.includes(fieldKey);
      });
      setAuditLog(filtered);
    } catch {
      setAuditLog([]);
    } finally {
      setLoadingAudit(false);
    }
  }, [valuationId, fieldKey]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  // Intelligence candidates matching this field
  const candidates = (intelligence?.candidates || []).filter(
    (c) => c.field_key === fieldKey || c.questionnaire_key === fieldKey
  );
  const conflicts = (intelligence?.conflicts || []).filter(
    (c) => c.field_key === fieldKey
  );
  const documents = (intelligence?.documents || []).slice(0, 5);

  const handleRequestChange = async () => {
    if (!requestReason.trim()) return;
    setSubmitting(true);
    try {
      await governance?.requestChange(fieldKey, {
        field_display_name: displayName,
        current_value_summary: currentValue,
        reason: requestReason,
      });
      setRequestReason('');
      setShowRequestForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (requestId, decision) => {
    setSubmitting(true);
    try {
      await reviewChangeRequest(requestId, decision);
      await governance?.reload();
      setReviewAction(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockToggle = async () => {
    if (!record) return;
    if (record.is_locked) {
      await governance?.unlockField(fieldKey, 'Unlocked via Evidence Drawer');
    } else {
      await governance?.lockField(fieldKey, 'Locked via Evidence Drawer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md h-full overflow-y-auto border-l border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{category || 'Field'}</p>
            <h3 className="text-sm font-semibold text-foreground truncate">{displayName || fieldKey}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Immutable banner — published or archived */}
          {isImmutable && (
            <div className="rounded-lg p-2.5 flex items-center gap-2 text-xs" style={{ background: isImmutable === 'archived' ? 'rgba(107,114,128,0.06)' : 'rgba(212,168,83,0.06)', border: `1px solid ${isImmutable === 'archived' ? 'rgba(107,114,128,0.15)' : 'rgba(212,168,83,0.15)'}` }}>
              {isImmutable === 'archived' ? <Archive className="w-3.5 h-3.5 text-muted-foreground" /> : <FileLock className="w-3.5 h-3.5 text-primary" />}
              <span className="text-muted-foreground">
                {isImmutable === 'archived'
                  ? 'This valuation is archived. Evidence and history remain available, but no editing is permitted until restored.'
                  : 'This value belongs to an immutable published version. Create or edit the working valuation instead.'}
              </span>
            </div>
          )}

          {/* Current Value */}
          {currentValue != null && (
            <div className="rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.12)' }}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Current Value</p>
              <p className="text-lg font-display font-bold text-foreground">{currentValue}</p>
            </div>
          )}

          {/* Field Governance */}
          <Section icon={Shield} title="Field Governance">
            {record ? (
              <div className="space-y-2 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(212,168,83,0.1)', color: '#D4A853' }}>
                    {(record.current_owner_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{record.current_owner_name || 'Unassigned'}</p>
                    <p className="text-[10px] text-muted-foreground">Field Owner</p>
                  </div>
                  <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${record.is_locked ? 'text-primary' : 'text-muted-foreground'}`} style={{ background: record.is_locked ? 'rgba(212,168,83,0.08)' : 'rgba(255,255,255,0.03)' }}>
                    {record.is_locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                    {record.is_locked ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Source of Truth</p>
                    <p className="text-[11px] text-foreground/90 capitalize">{(record.source_of_truth || '—').replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Confidence</p>
                    <p className="text-[11px] text-foreground/90">{record.confidence_score != null ? `${record.confidence_score}%` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Last Modified By</p>
                    <p className="text-[11px] text-foreground/90">{record.last_modified_by_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Last Modified At</p>
                    <p className="text-[11px] text-foreground/90">{record.last_modified_at ? new Date(record.last_modified_at).toLocaleDateString() : '—'}</p>
                  </div>
                </div>
                {record.change_reason && (
                  <div className="pt-1">
                    <p className="text-[10px] text-muted-foreground">Reason for Change</p>
                    <p className="text-[11px] text-foreground/80">{record.change_reason}</p>
                  </div>
                )}
                {record.ai_recommendation_status === 'pending' && (
                  <div className="flex items-center gap-1.5 pt-1 text-amber-400/80">
                    <Sparkles className="w-3 h-3" />
                    <p className="text-[10px]">AI recommendation pending advisor approval</p>
                  </div>
                )}
                {/* Actions */}
                {isImmutable ? (
                  <div className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <FileLock className="w-3 h-3" />
                    {isImmutable === 'archived' ? 'Archived — Read Only' : 'Published — Read Only'}
                  </div>
                ) : derived ? (
                  <div className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }} title={editDestination ? `Edit in ${editDestination}` : undefined}>
                    <Calculator className="w-3 h-3" />
                    Edit Source Inputs{editDestination ? ` (${editDestination})` : ''}
                  </div>
                ) : canEditField ? (
                  <button
                    onClick={handleLockToggle}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: record.is_locked ? 'rgba(255,255,255,0.03)' : 'rgba(212,168,83,0.08)', color: record.is_locked ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))', border: `1px solid ${record.is_locked ? 'rgba(255,255,255,0.05)' : 'rgba(212,168,83,0.15)'}` }}
                  >
                    {record.is_locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {record.is_locked ? 'Unlock Field' : 'Lock Field'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowRequestForm(!showRequestForm)}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400/90 transition-colors"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
                  >
                    <Send className="w-3 h-3" />
                    Request Change
                  </button>
                )}
              </div>
            ) : (
              <EmptyHint text={canEdit
                ? "No governance record yet. This field is not individually tracked — edit it at the source."
                : "No governance record yet. You can request a correction, but only the assigned valuation team may change the valuation record."} />
            )}
          </Section>

          {/* Request Change Form (read-only users) */}
          {showRequestForm && !canEdit && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)' }}>
              <p className="text-[10px] uppercase tracking-wider text-amber-400/80">Request a Change</p>
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Explain why this value should change..."
                className="w-full text-xs bg-background/50 border border-border rounded-lg p-2 text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={3}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRequestChange}
                  disabled={!requestReason.trim() || submitting}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-amber-400/90 disabled:opacity-40"
                  style={{ background: 'rgba(245,158,11,0.1)' }}
                >
                  <Send className="w-3 h-3" />
                  Submit
                </button>
                <button onClick={() => setShowRequestForm(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Change Requests */}
          {pendingRequests.length > 0 && (
            <Section icon={MessageSquare} title="Change Requests" count={pendingRequests.length}>
              {pendingRequests.map((cr) => (
                <div key={cr.id} className="rounded-lg p-2.5 space-y-1.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-muted-foreground/60" />
                    <p className="text-[11px] font-medium text-foreground">{cr.requestor_name}</p>
                    <span className="text-[10px] text-muted-foreground ml-auto capitalize">{cr.requestor_role}</span>
                  </div>
                  <p className="text-[11px] text-foreground/80">{cr.reason}</p>
                  {cr.proposed_value_summary && <p className="text-[10px] text-muted-foreground">Proposed: {cr.proposed_value_summary}</p>}
                  {canEdit && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => handleReview(cr.id, 'approved')}
                        disabled={submitting}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-emerald-400/90"
                        style={{ background: 'rgba(34,197,94,0.08)' }}
                      >
                        <CheckCircle className="w-2.5 h-2.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(cr.id, 'rejected')}
                        disabled={submitting}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-red-400/90"
                        style={{ background: 'rgba(239,68,68,0.08)' }}
                      >
                        <X className="w-2.5 h-2.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* AI Extraction History */}
          <Section icon={Sparkles} title="AI Extraction History" count={candidates.length}>
            {candidates.length > 0 ? (
              candidates.slice(0, 5).map((c, i) => (
                <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-accent/60" />
                    <p className="text-[11px] font-medium text-foreground">{c.source_name || c.source_type || 'AI Extraction'}</p>
                    {c.confidence_score != null && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{c.confidence_score}% confidence</span>
                    )}
                  </div>
                  {c.suggested_value != null && <p className="text-[11px] text-foreground/80 mt-1">Suggested: {String(c.suggested_value)}</p>}
                  {c.advisor_verification_status && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">Status: {c.advisor_verification_status.replace(/_/g, ' ')}</p>
                  )}
                </div>
              ))
            ) : (
              <EmptyHint text="No AI extraction history for this field." />
            )}
          </Section>

          {/* Source Documents */}
          <Section icon={FileText} title="Source Documents" count={documents.length}>
            {documents.length > 0 ? (
              documents.map((doc, i) => (
                <div key={doc.id || i} className="flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <FileText className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground/90 truncate">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">{doc.document_type || 'document'}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyHint text="No source documents linked." />
            )}
          </Section>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <Section icon={AlertCircle} title="Material Conflicts" count={conflicts.length}>
              {conflicts.map((c, i) => (
                <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                  <p className="text-[11px] text-foreground/90">{c.source_a_name}: {String(c.source_a_value)}</p>
                  <p className="text-[11px] text-foreground/90">{c.source_b_name}: {String(c.source_b_value)}</p>
                  {c.recommended_action && <p className="text-[10px] text-amber-400/70 mt-1">{c.recommended_action}</p>}
                </div>
              ))}
            </Section>
          )}

          {/* Change History (Audit Log) */}
          <Section icon={History} title="Change History" count={auditLog.length}>
            {loadingAudit ? (
              <EmptyHint text="Loading…" />
            ) : auditLog.length > 0 ? (
              auditLog.slice(0, 10).map((log, i) => (
                <div key={log.id || i} className="flex items-start gap-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <Clock className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground/90 capitalize">{(log.action || 'change').replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {log.acted_at ? new Date(log.acted_at).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyHint text="No change history for this field." />
            )}
          </Section>

          {/* Supporting Calculations */}
          {calcSummary && (
            <Section icon={Calculator} title="Supporting Calculations">
              <EmptyHint text="Calculation inputs are derived from the certified Valuation Engine. See the Valuation workspace for methodology details." />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}