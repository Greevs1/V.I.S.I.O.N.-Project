/**
 * VerifyWorkspace — Phase 13.3E.4A (Validate)
 *
 * The unified Validation Queue. One place where advisors resolve everything
 * requiring human judgment. Surfaces only the exceptions: conflicts,
 * low-confidence values, missing critical fields, proposed add-backs,
 * advisor judgments, client confirmations, and publication blockers.
 * Review only the exceptions.
 *
 * Flow: AI gathers → AI proposes → System prioritizes → Advisor verifies →
 *       Client supplies only what is necessary → Approved info flows in.
 *
 * Reuses the certified Valuation Engine via write-through to existing
 * valuation_answers / valuation_adjustments + staleness propagation.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Sparkles, ListChecks, FileText, CheckCircle2 } from 'lucide-react';
import QueueSummary from './verify/QueueSummary';
import QueueCard from './verify/QueueCard';
import ConflictResolutionModal from './verify/ConflictResolutionModal';
import AddBackReviewModal from './verify/AddBackReviewModal';
import ClientRequestModal from './verify/ClientRequestModal';
import {
  getVerificationQueue, resolveVerificationItem, resolveConflict,
  approveAddBack, rejectAddBack, createClientRequest, getClientRequests,
} from '@/lib/verificationQueueService';
import { useValidateIntelligence } from '@/hooks/useValidateIntelligence';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'low_confidence', label: 'Low Confidence' },
  { id: 'documents', label: 'Documents' },
  { id: 'adjustments', label: 'Adjustments' },
  { id: 'client_input', label: 'Client Input' },
  { id: 'advisor_judgment', label: 'Advisor Judgment' },
  { id: 'publication_blockers', label: 'Pub Blockers' },
  { id: 'resolved', label: 'Resolved' },
];

const SORTS = [
  { id: 'priority', label: 'Priority' },
  { id: 'valuation_impact', label: 'Valuation Impact' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
];

export default function VerifyWorkspace({ valuationId, canEdit, onQueueLoaded, density = 'summary' }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('priority');
  const [search, setSearch] = useState('');
  const [clientRequests, setClientRequests] = useState([]);
  const [conflictItem, setConflictItem] = useState(null);
  const [addBackItem, setAddBackItem] = useState(null);
  const [clientRequestItem, setClientRequestItem] = useState(null);
  const [showRequests, setShowRequests] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [showLowPriority, setShowLowPriority] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVerificationQueue(valuationId, { filter, sort, search });
      setItems(res.items || []);
      setSummary(res.summary || null);
      setRecommended(res.recommendedAction || null);
      onQueueLoaded?.(res.summary);
      const cr = await getClientRequests(valuationId).catch(() => ({ requests: [] }));
      setClientRequests(cr.requests || []);
    } catch (err) {
      // Table may not be migrated yet — surface a clear message
      setItems([]);
      setSummary(null);
      setRecommended(null);
      onQueueLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [valuationId, filter, sort, search, onQueueLoaded]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => load();

  const handleResolve = async (itemId, action, extras = {}) => {
    setActing(true);
    try {
      await resolveVerificationItem(itemId, action, extras);
      await load();
    } catch (err) {
      console.error('Resolve failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleResolveConflict = (item) => setConflictItem(item);

  const handleConflictSubmit = async (payload) => {
    setActing(true);
    try {
      await resolveConflict(conflictItem.id, payload);
      setConflictItem(null);
      await load();
    } catch (err) {
      console.error('Conflict resolve failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleApproveAddBack = (item, withChange = false) => setAddBackItem(item);

  const handleAddBackApprove = async ({ approved_amount, resolution_reason }) => {
    setActing(true);
    try {
      await approveAddBack(addBackItem.id, { approved_amount, resolution_reason });
      setAddBackItem(null);
      await load();
    } catch (err) {
      console.error('AddBack approve failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleAddBackReject = async ({ resolution_reason }) => {
    setActing(true);
    try {
      await rejectAddBack(addBackItem.id, { resolution_reason });
      setAddBackItem(null);
      await load();
    } catch (err) {
      console.error('AddBack reject failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleRequestClient = (item) => setClientRequestItem(item);

  const handleClientRequestSubmit = async (payload) => {
    setActing(true);
    try {
      await createClientRequest(valuationId, payload);
      setClientRequestItem(null);
      await load();
    } catch (err) {
      console.error('Client request failed:', err);
    } finally {
      setActing(false);
    }
  };

  // ── Phase 15.2: Living Intelligence enrichment (non-blocking) ──────────────
  const { data: validateIntel } = useValidateIntelligence({
    valuationId,
    verificationItems: items,
    recommendedAction: recommended,
    queueSummary: summary,
  });

  const RESOLVED_STATUSES = ['resolved', 'rejected', 'not_applicable', 'closed'];
  const openItems = items.filter((i) => !RESOLVED_STATUSES.includes(i.status));
  const resolvedItems = items.filter((i) => RESOLVED_STATUSES.includes(i.status));

  // Focus mode: separate by priority
  const criticalItems = openItems.filter((i) => i.priority === 'critical' || i.severity === 'critical');
  const highItems = openItems.filter((i) => i.priority === 'high' || i.severity === 'high');
  const waitingItems = openItems.filter((i) => i.status === 'waiting_for_client' || i.requires_client_input);
  const blockerItems = openItems.filter((i) => i.is_publication_blocker);
  const lowPriorityItems = openItems.filter((i) => !['critical', 'high'].includes(i.priority || i.severity));
  const focusItems = openItems.filter((i) => ['critical', 'high'].includes(i.priority || i.severity) || i.is_publication_blocker);

  // Items to render: focus items by default, + low priority if toggled, + resolved if toggled
  const visibleItems = [
    ...(showLowPriority ? lowPriorityItems : []),
    ...focusItems.filter((i) => !lowPriorityItems.includes(i)),
  ];
  const sortedVisible = visibleItems.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority || a.severity] ?? 4) - (order[b.priority || b.severity] ?? 4);
  });

  // ── Intelligence Budget: only primary + secondary items get enrichment ──────
  const enrichmentMap = {};
  if (validateIntel?.primary_attention_item) {
    enrichmentMap[validateIntel.primary_attention_item.item_id] = validateIntel.primary_attention_item.why_now;
  }
  (validateIntel?.secondary_attention_items || []).forEach((s) => {
    enrichmentMap[s.item_id] = s.why_now;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Validate</h2>
          <p className="text-xs text-muted-foreground mt-1">Confirm the evidence, resolve conflicts, and approve the information used in the valuation. Review only the exceptions.</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Focus mode summary — calm, spacious */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Recommended next issue — enriched by Living Intelligence when available */}
        {validateIntel?.quiet_state ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">All Clear</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">Nothing requires immediate review.</p>
              <p className="text-xs text-muted-foreground mt-0.5">The queue is clear — proceed to the Valuation workspace.</p>
            </div>
          </div>
        ) : validateIntel?.primary_attention_item ? (
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Recommended Next Issue</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{validateIntel.primary_attention_item.headline}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{validateIntel.primary_attention_item.why_now}</p>
              {validateIntel.primary_attention_item.what_unlocks && (
                <p className="text-[11px] text-primary/60 mt-1 leading-relaxed">
                  {validateIntel.primary_attention_item.what_unlocks}
                </p>
              )}
              {validateIntel.publication_impact?.is_blocked && (
                <p className="text-[10px] uppercase tracking-wider text-red-400/70 mt-1.5">
                  Blocks publication
                </p>
              )}
            </div>
          </div>
        ) : recommended && recommended.action_type !== 'proceed' && (
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Recommended Next Issue</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{recommended.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{recommended.detail}</p>
            </div>
          </div>
        )}

        {/* Count row — critical, high, waiting, blockers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-white/[0.04]">
          <FocusCount label="Critical" count={criticalItems.length} tone="critical" />
          <FocusCount label="High Priority" count={highItems.length} tone="warning" />
          <FocusCount label="Waiting on Client" count={waitingItems.length} tone="info" />
          <FocusCount label="Pub Blockers" count={blockerItems.length} tone="critical" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full rounded-lg bg-background border border-border pl-9 pr-3 py-2 text-sm text-foreground"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
        >
          {SORTS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setShowRequests((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground"
        >
          <FileText className="w-3.5 h-3.5" />
          Client Requests ({clientRequests.length})
        </button>
      </div>

      {/* Queue list — focus mode */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <ListChecks className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {summary?.total_open === 0 ? 'All clear — no open verification items.' : 'No items match the current filter.'}
          </p>
          {summary?.total_open === 0 && recommended?.action_type === 'proceed' && (
            <p className="text-xs text-muted-foreground/70 mt-1">Proceed to the Valuation workspace.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Focus items (critical + high + blockers) */}
          {sortedVisible.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              canEdit={canEdit && !acting}
              onResolve={handleResolve}
              onResolveConflict={handleResolveConflict}
              onApproveAddBack={handleApproveAddBack}
              onRejectAddBack={(it) => { setAddBackItem(it); }}
              onRequestClient={handleRequestClient}
              intelligenceWhy={enrichmentMap[item.id]}
            />
          ))}

          {/* Show lower-priority items toggle */}
          {lowPriorityItems.length > 0 && !showLowPriority && (
            <button
              onClick={() => setShowLowPriority(true)}
              className="w-full text-center py-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-colors"
            >
              Show {lowPriorityItems.length} lower-priority item{lowPriorityItems.length !== 1 ? 's' : ''}
            </button>
          )}

          {/* Resolved items — collapsed by default */}
          {resolvedItems.length > 0 && (
            <>
              {showResolved ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-3 pb-1">Resolved ({resolvedItems.length})</p>
                  {resolvedItems.map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      canEdit={canEdit && !acting}
                      onResolve={handleResolve}
                      onResolveConflict={handleResolveConflict}
                      onApproveAddBack={handleApproveAddBack}
                      onRejectAddBack={(it) => { setAddBackItem(it); }}
                      onRequestClient={handleRequestClient}
                    />
                  )).filter(Boolean)}
                  <button
                    onClick={() => setShowResolved(false)}
                    className="w-full text-center py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Hide resolved
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowResolved(true)}
                  className="w-full text-center py-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-colors"
                >
                  Show {resolvedItems.length} resolved item{resolvedItems.length !== 1 ? 's' : ''}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Client requests panel */}
      {showRequests && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.18)' }}>
          <p className="text-sm font-semibold text-foreground mb-3">Client Requests</p>
          {clientRequests.length === 0 ? (
            <p className="text-xs text-muted-foreground">No client requests yet. Use "Request from Client" on any item.</p>
          ) : (
            <div className="space-y-2">
              {clientRequests.map((r) => (
                <div key={r.id} className="rounded-lg p-2.5 bg-background/40 border border-border/40">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{r.title}</p>
                    <span className="text-[10px] text-muted-foreground capitalize">{r.status.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.request_type} · due {r.due_date || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {conflictItem && (
        <ConflictResolutionModal item={conflictItem} onClose={() => setConflictItem(null)} onResolve={handleConflictSubmit} />
      )}
      {addBackItem && (
        <AddBackReviewModal
          item={addBackItem}
          onClose={() => setAddBackItem(null)}
          onApprove={handleAddBackApprove}
          onReject={handleAddBackReject}
          onRequestClient={(it) => { setAddBackItem(null); setClientRequestItem(it); }}
        />
      )}
      {clientRequestItem && (
        <ClientRequestModal
          item={clientRequestItem}
          valuationId={valuationId}
          onClose={() => setClientRequestItem(null)}
          onSubmit={handleClientRequestSubmit}
        />
      )}
    </div>
  );
}

// ── Focus mode count helper ─────────────────────────────────────────────────
function FocusCount({ label, count, tone }) {
  const colors = {
    critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.06)' },
    warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)' },
    info: { color: '#00D4FF', bg: 'rgba(0,212,255,0.06)' },
  };
  const c = colors[tone] || { color: '#6B7280', bg: 'rgba(107,114,128,0.06)' };
  return (
    <div className="rounded-lg p-3" style={{ background: count > 0 ? c.bg : 'rgba(255,255,255,0.01)' }}>
      <p className="text-2xl font-display font-bold" style={{ color: count > 0 ? c.color : '#6B7280' }}>{count}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}