/**
 * OwnerRequestCard — Phase 13.3G.4
 *
 * Compact status card shown on the Business Valuation landing page when an
 * owner has an active valuation request. Shows status, submitted date,
 * next step, and owner actions (View, Add Info, Withdraw, Respond).
 *
 * Does not expose internal admin notes or advisor discussions.
 */
import React, { useState, useEffect } from 'react';
import { Clock, Eye, MessageSquare, Upload, X, FileText, ChevronRight } from 'lucide-react';
import { getMyRequests, withdrawRequest, ownerRespond } from '@/lib/valuationRequestService';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const STATUS_META = {
  draft: { label: 'Draft', color: '#6B7280' },
  submitted: { label: 'Submitted', color: '#3B82F6' },
  received: { label: 'Received', color: '#3B82F6' },
  under_review: { label: 'Under Review', color: '#F59E0B' },
  waiting_on_owner: { label: 'Information Needed', color: '#EF4444' },
  approved: { label: 'Approved', color: '#22C55E' },
  declined: { label: 'Declined', color: '#EF4444' },
  converted_to_valuation: { label: 'Valuation Created', color: '#22C55E' },
  withdrawn: { label: 'Withdrawn', color: '#6B7280' },
  closed: { label: 'Closed', color: '#6B7280' },
};

const NEXT_STEP = {
  submitted: 'The valuation team is reviewing your request.',
  received: 'An administrator will review your request shortly.',
  under_review: 'An administrator is reviewing your request.',
  waiting_on_owner: 'The valuation team needs more information from you.',
  approved: 'Your valuation is being prepared. An advisor will be assigned.',
  declined: 'Your request was declined. Contact your advisor for details.',
  converted_to_valuation: 'Your valuation has been created.',
  withdrawn: 'This request was withdrawn.',
  closed: 'This request was closed.',
};

export default function OwnerRequestCard({ businessId, onConverted, onRequestValuation, requests: propRequests, onReload }) {
  const [requests, setRequests] = useState(propRequests || []);
  const [loading, setLoading] = useState(!propRequests);
  const [viewRequest, setViewRequest] = useState(null);
  const [responding, setResponding] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    // If a parent reload callback is provided, defer to it (single fetch source).
    if (onReload) { await onReload(); return; }
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getMyRequests(businessId);
      setRequests(res?.requests || []);
    } catch { setRequests([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (propRequests) { setRequests(propRequests); setLoading(false); }
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, propRequests]);

  const active = requests.filter(r => !['withdrawn', 'declined', 'closed', 'converted_to_valuation'].includes(r.status));
  const hasConverted = requests.find(r => r.status === 'converted_to_valuation');

  if (loading) return null;
  if (hasConverted) return null; // valuation exists, landing shows it

  if (active.length === 0) {
    // No active request — show Request CTA (handled by parent)
    return null;
  }

  const req = active[0];
  const meta = STATUS_META[req.status] || STATUS_META.draft;
  const needsResponse = req.status === 'waiting_on_owner';

  const handleWithdraw = async () => {
    setBusy(true);
    try {
      await withdrawRequest(withdrawTarget.id);
      setWithdrawTarget(null);
      await load();
    } catch { /* non-fatal */ }
    finally { setBusy(false); }
  };

  const handleRespond = async (responses) => {
    setBusy(true);
    try {
      await ownerRespond(responding.id, responses);
      setResponding(null);
      await load();
    } catch { /* non-fatal */ }
    finally { setBusy(false); }
  };

  return (
    <>
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: needsResponse ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.015)',
          border: `1px solid ${needsResponse ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Valuation Request</p>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ color: meta.color, background: `${meta.color}15` }}>
                {meta.label}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Submitted {req.submitted_at ? new Date(req.submitted_at).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>

        <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Next step</p>
          <p className="text-xs text-foreground">{NEXT_STEP[req.status] || 'In progress.'}</p>
        </div>

        {req.valuation_purpose && (
          <p className="text-[11px] text-muted-foreground">
            <span className="text-foreground/70">Purpose:</span> {req.valuation_purpose}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <button onClick={() => setViewRequest(req)} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Eye className="w-3 h-3" /> View Request
          </button>
          {needsResponse && (
            <button onClick={() => setResponding(req)} className="flex items-center gap-1 text-[11px] text-destructive hover:underline font-medium">
              <MessageSquare className="w-3 h-3" /> Respond
            </button>
          )}
          <button onClick={() => onRequestValuation?.()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <Upload className="w-3 h-3" /> Add Document
          </button>
          {!['converted_to_valuation', 'approved'].includes(req.status) && (
            <button onClick={() => setWithdrawTarget(req)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive ml-auto">
              <X className="w-3 h-3" /> Withdraw
            </button>
          )}
        </div>
      </div>

      {/* View request detail */}
      <Sheet open={!!viewRequest} onOpenChange={(o) => !o && setViewRequest(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">Valuation Request</SheetTitle>
            <SheetDescription>Submitted {viewRequest?.submitted_at ? new Date(viewRequest.submitted_at).toLocaleDateString() : '—'}</SheetDescription>
          </SheetHeader>
          {viewRequest && (
            <div className="px-4 pb-8 space-y-4 text-sm">
              <DetailRow label="Status" value={STATUS_META[viewRequest.status]?.label || viewRequest.status} />
              <DetailRow label="Business" value={viewRequest.business_name || '—'} />
              <DetailRow label="Purpose" value={viewRequest.valuation_purpose || '—'} />
              <DetailRow label="Timing" value={viewRequest.desired_timeline || viewRequest.urgency?.replace(/_/g, ' ') || '—'} />
              {viewRequest.target_event_date && <DetailRow label="Target date" value={new Date(viewRequest.target_event_date).toLocaleDateString()} />}
              {viewRequest.request_reason && <DetailRow label="Explanation" value={viewRequest.request_reason} />}
              {viewRequest.transaction_context && <DetailRow label="Context" value={viewRequest.transaction_context} />}
              {viewRequest.notes && <DetailRow label="Notes" value={viewRequest.notes} />}

              {Array.isArray(viewRequest.additional_information_requested) && viewRequest.additional_information_requested.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Information Requested by Admin</p>
                  <div className="space-y-2">
                    {viewRequest.additional_information_requested.map((item) => (
                      <div key={item.id} className="rounded-lg p-2.5 bg-muted/20 border border-border/40">
                        <p className="text-xs font-medium text-foreground">{item.label}</p>
                        {item.detail && <p className="text-[11px] text-muted-foreground mt-0.5">{item.detail}</p>}
                        {item.responded ? (
                          <p className="text-[10px] text-emerald-400 mt-1">✓ Responded</p>
                        ) : (
                          <p className="text-[10px] text-amber-400 mt-1">Awaiting your response</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Respond sheet */}
      <RespondSheet request={responding} onClose={() => setResponding(null)} onSubmit={handleRespond} busy={busy} />

      {/* Withdraw confirm */}
      <Sheet open={!!withdrawTarget} onOpenChange={(o) => !o && setWithdrawTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle className="font-display">Withdraw Request?</SheetTitle>
            <SheetDescription>This will cancel your valuation request. This action cannot be undone.</SheetDescription>
          </SheetHeader>
          <SheetFooter className="mt-6 flex-row gap-2">
            <Button variant="outline" onClick={() => setWithdrawTarget(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={handleWithdraw} disabled={busy}>
              {busy ? 'Withdrawing…' : 'Withdraw Request'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function RespondSheet({ request, onClose, onSubmit, busy }) {
  const [responses, setResponses] = useState({});

  useEffect(() => {
    if (request) {
      const init = {};
      (request.additional_information_requested || []).forEach((item) => { init[item.id] = ''; });
      setResponses(init);
    }
  }, [request]);

  if (!request) return null;
  const items = (request.additional_information_requested || []).filter(i => !i.responded);

  return (
    <Sheet open={!!request} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Respond to Information Request</SheetTitle>
          <SheetDescription>Provide the requested information for your valuation request.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8 space-y-4">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">All items have been responded to.</p>
          )}
          {items.map((item) => (
            <div key={item.id}>
              <label className="text-xs font-medium text-foreground mb-1 block">{item.label}</label>
              {item.detail && <p className="text-[11px] text-muted-foreground mb-1.5">{item.detail}</p>}
              <textarea
                value={responses[item.id] || ''}
                onChange={(e) => setResponses((r) => ({ ...r, [item.id]: e.target.value }))}
                placeholder="Your response…"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={3}
              />
            </div>
          ))}
        </div>
        <SheetFooter className="border-t border-border/40 pt-3 flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit(items.map(i => ({ id: i.id, response: responses[i.id] || '' })).filter(r => r.response))} disabled={busy || items.length === 0} className="flex-1">
            {busy ? 'Sending…' : 'Send Responses'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}