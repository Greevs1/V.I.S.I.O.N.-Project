/**
 * AdminRequestReviewSheet — Phase 13.3G.4
 *
 * Right-side review sheet for an admin to review an owner-submitted
 * valuation request. Shows request summary, existing data, and admin
 * decision actions: Approve & Create, Request More Info, Decline, Close Duplicate.
 *
 * Does not modify the certified Valuation Engine.
 */
import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Check, X, AlertCircle, FileText, MessageSquare, Copy, ChevronRight, Clock } from 'lucide-react';
import { getRequest, approveRequest, declineRequest, closeAsDuplicate, requestMoreInformation, assignAdminToRequest, markRequestViewed, getRequestEvents } from '@/lib/valuationRequestService';
import CreateValuationSheet from './CreateValuationSheet';

const URGENCY_LABELS = {
  no_immediate: 'No immediate deadline',
  within_90_days: 'Within 90 days',
  within_30_days: 'Within 30 days',
  urgent: 'Urgent',
  target_date: 'Target event date',
};

const INFO_PRESETS = [
  'Upload current P&L',
  'Upload balance sheet',
  'Confirm ownership',
  'Clarify sale timing',
  'Confirm valuation purpose',
  'Provide customer concentration report',
];

export default function AdminRequestReviewSheet({ open, onOpenChange, requestId, onReviewComplete }) {
  const [request, setRequest] = useState(null);
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // 'info' | 'decline' | 'duplicate'
  const [infoItems, setInfoItems] = useState([{ label: '', detail: '' }]);
  const [declineReason, setDeclineReason] = useState('');
  const [duplicateReason, setDuplicateReason] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    if (!requestId) return;
    setLoading(true); setError(null);
    try {
      const [reqRes, evtRes] = await Promise.all([
        getRequest(requestId),
        getRequestEvents(requestId).catch(() => null),
      ]);
      if (reqRes?.error) throw new Error(reqRes.error);
      setRequest(reqRes.request);
      setEvents(evtRes?.events || []);
      // Auto-assign + mark viewed
      if (reqRes.request && !reqRes.request.assigned_admin_profile_id) {
        await assignAdminToRequest(requestId).catch(() => {});
      } else if (reqRes.request && !reqRes.request.viewed_at) {
        await markRequestViewed(requestId).catch(() => {});
      }
    } catch (e) {
      setError(e.message || 'Failed to load request');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && requestId) load(); }, [open, requestId]);

  const handleApprove = async () => {
    setBusy(true); setError(null);
    try {
      const res = await approveRequest(requestId);
      if (res?.error) throw new Error(res.error);
      setRequest(res.request);
      setShowCreate(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleRequestInfo = async () => {
    const valid = infoItems.filter(i => i.label.trim());
    if (!valid.length) { setError('Add at least one information request'); return; }
    setBusy(true); setError(null);
    try {
      const res = await requestMoreInformation(requestId, valid.map(i => ({ label: i.label, detail: i.detail || null })));
      if (res?.error) throw new Error(res.error);
      setRequest(res.request);
      setMode(null);
      onReviewComplete?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) { setError('A reason is required to decline'); return; }
    setBusy(true); setError(null);
    try {
      const res = await declineRequest(requestId, declineReason);
      if (res?.error) throw new Error(res.error);
      setRequest(res.request);
      setMode(null);
      onReviewComplete?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleDuplicate = async () => {
    if (!duplicateReason.trim()) { setError('A reason is required to close as duplicate'); return; }
    setBusy(true); setError(null);
    try {
      const res = await closeAsDuplicate(requestId, duplicateReason);
      if (res?.error) throw new Error(res.error);
      setRequest(res.request);
      setMode(null);
      onReviewComplete?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleCreated = (res) => {
    setShowCreate(false);
    onReviewComplete?.(res?.valuation);
    onOpenChange(false);
  };

  if (!open) return null;

  const status = request?.status;
  const isApproved = status === 'approved';
  const isConverted = status === 'converted_to_valuation';
  const isClosed = ['declined', 'closed', 'withdrawn'].includes(status);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">
              {request ? `Request #${request.request_number}` : 'Review Request'}
            </SheetTitle>
            <SheetDescription>
              {request ? `${request.business_name || '—'} · ${URGENCY_LABELS[request.urgency] || request.urgency}` : 'Loading…'}
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : request ? (
            <div className="px-4 pb-8 space-y-5">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <StatusBadge status={status} />
                {request.urgency === 'urgent' && <span className="text-[10px] font-bold uppercase text-destructive">Urgent</span>}
              </div>

              {/* Request Summary */}
              <Section title="Request Summary" icon={FileText}>
                <Row label="Business" value={request.business_name || '—'} />
                <Row label="Owner" value={request.requester ? `${request.requester.first_name} ${request.requester.last_name}` : '—'} />
                <Row label="Purpose" value={request.valuation_purpose || '—'} />
                <Row label="Timing" value={URGENCY_LABELS[request.urgency] || '—'} />
                {request.target_event_date && <Row label="Target date" value={new Date(request.target_event_date).toLocaleDateString()} />}
                {request.request_reason && <Row label="Explanation" value={request.request_reason} />}
                {request.transaction_context && <Row label="Context" value={request.transaction_context} />}
                {request.notes && <Row label="Notes" value={request.notes} />}
                <Row label="Submitted" value={request.submitted_at ? new Date(request.submitted_at).toLocaleString() : '—'} />
              </Section>

              {/* Information requested (if any) */}
              {Array.isArray(request.additional_information_requested) && request.additional_information_requested.length > 0 && (
                <Section title="Information Requests" icon={MessageSquare}>
                  <div className="space-y-2">
                    {request.additional_information_requested.map((item) => (
                      <div key={item.id} className="rounded-lg p-2.5 bg-muted/20 border border-border/40">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">{item.label}</p>
                          {item.responded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        {item.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{item.detail}</p>}
                        {item.responded && item.response && <p className="text-[11px] text-foreground mt-1.5 p-1.5 rounded bg-muted/30">↳ {item.response}</p>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Admin Decision */}
              {!isClosed && !isConverted && (
                <Section title="Admin Decision" icon={Check}>
                  {mode === null && (
                    <div className="grid grid-cols-1 gap-2">
                      {isApproved ? (
                        <Button onClick={() => setShowCreate(true)} className="w-full">
                          <Check className="w-4 h-4" /> Create Valuation
                        </Button>
                      ) : (
                        <>
                          <Button onClick={handleApprove} disabled={busy} className="w-full">
                            <Check className="w-4 h-4" /> Approve & Create Valuation
                          </Button>
                          <Button variant="outline" onClick={() => setMode('info')} disabled={busy} className="w-full">
                            <MessageSquare className="w-4 h-4" /> Request More Information
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setMode('decline')} disabled={busy} className="flex-1 text-destructive">
                              <X className="w-4 h-4" /> Decline
                            </Button>
                            <Button variant="outline" onClick={() => setMode('duplicate')} disabled={busy} className="flex-1">
                              <Copy className="w-4 h-4" /> Duplicate
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {mode === 'info' && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {INFO_PRESETS.map((p) => (
                          <button key={p} onClick={() => setInfoItems([...infoItems, { label: p, detail: '' }])}
                            className="text-[10px] px-2 py-1 rounded-full bg-muted/30 border border-border hover:bg-muted/50">
                            + {p}
                          </button>
                        ))}
                      </div>
                      {infoItems.map((item, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={item.label} onChange={(e) => setInfoItems(infoItems.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                            placeholder="What do you need?"
                            className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-xs" />
                          <button onClick={() => setInfoItems(infoItems.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setInfoItems([...infoItems, { label: '', detail: '' }])}
                        className="text-[11px] text-primary hover:underline">+ Add item</button>
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" onClick={() => setMode(null)} disabled={busy} className="flex-1">Cancel</Button>
                        <Button onClick={handleRequestInfo} disabled={busy} className="flex-1">
                          {busy ? 'Sending…' : 'Send Request'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {mode === 'decline' && (
                    <div className="space-y-3">
                      <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Reason for declining (required)…"
                        className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={3} />
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setMode(null)} disabled={busy} className="flex-1">Cancel</Button>
                        <Button variant="destructive" onClick={handleDecline} disabled={busy} className="flex-1">
                          {busy ? 'Declining…' : 'Decline Request'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {mode === 'duplicate' && (
                    <div className="space-y-3">
                      <textarea value={duplicateReason} onChange={(e) => setDuplicateReason(e.target.value)}
                        placeholder="Reason / reference to existing (required)…"
                        className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={3} />
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setMode(null)} disabled={busy} className="flex-1">Cancel</Button>
                        <Button variant="outline" onClick={handleDuplicate} disabled={busy} className="flex-1">
                          {busy ? 'Closing…' : 'Close as Duplicate'}
                        </Button>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {isConverted && request.converted_valuation_id && (
                <div className="rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Converted to valuation
                  </p>
                </div>
              )}

              {/* Audit timeline */}
              {events && events.length > 0 && (
                <Section title="Audit Trail" icon={FileText}>
                  <div className="space-y-1.5">
                    {events.map((e, i) => (
                      <div key={e.id} className="flex items-start gap-2 text-[11px]">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                        <div>
                          <span className="text-foreground">{e.event_type?.replace(/_/g, ' ')}</span>
                          <span className="text-muted-foreground"> · {e.actor_name}</span>
                          {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                          <span className="text-muted-foreground/60"> · {new Date(e.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {error && (
                <div className="rounded-lg p-3 bg-destructive/10 border border-destructive/20 text-xs text-destructive">{error}</div>
              )}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{error || 'Request not found'}</div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create valuation from approved request */}
      <CreateValuationSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        business={request ? { id: request.business_id, business_name: request.business_name } : null}
        owners={request?.requester ? [request.requester] : []}
        requestId={requestId}
        onCreated={handleCreated}
      />
    </>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</p>
      </div>
      <div className="rounded-lg bg-muted/10 border border-border/40 p-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span className="text-foreground text-xs text-right whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    submitted: '#3B82F6', received: '#3B82F6', under_review: '#F59E0B',
    waiting_on_owner: '#EF4444', approved: '#22C55E', declined: '#EF4444',
    converted_to_valuation: '#22C55E', withdrawn: '#6B7280', closed: '#6B7280',
  };
  const color = colors[status] || '#6B7280';
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ color, background: `${color}15` }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}