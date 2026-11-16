/**
 * AdminBusinessValuations — Phase 13.3G.4
 *
 * Admin entry point for the Business Valuation management workflow.
 *
 *   Admin → Business Valuations
 *
 * Tabs:
 *   Requests         — owner-submitted valuation requests
 *   Active Valuations — current working valuations
 *   Businesses       — all manageable businesses + valuation availability
 *   History          — published and archived valuations
 *
 * Does not modify the certified Valuation Engine.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { ArrowLeft, Calculator, Plus, Inbox, Building2, History, FileText, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getAdminSummary, getAdminRequests, getAdminBusinesses,
} from '@/lib/valuationRequestService';
import AdminRequestReviewSheet from '@/components/valuation/request/AdminRequestReviewSheet';
import CreateValuationSheet from '@/components/valuation/request/CreateValuationSheet';

const TABS = [
  { id: 'requests', label: 'Requests', icon: Inbox },
  { id: 'active', label: 'Active Valuations', icon: Calculator },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'history', label: 'History', icon: History },
];

const STATUS_FILTERS = [
  { key: 'new', label: 'New', statuses: ['submitted', 'received'] },
  { key: 'review', label: 'Under Review', statuses: ['under_review'] },
  { key: 'waiting', label: 'Waiting on Owner', statuses: ['waiting_on_owner'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'converted', label: 'Converted', statuses: ['converted_to_valuation'] },
  { key: 'declined', label: 'Declined', statuses: ['declined'] },
];

const URGENCY_COLOR = { urgent: '#EF4444', within_30_days: '#F59E0B', within_90_days: '#3B82F6', no_immediate: '#6B7280', target_date: '#A855F7' };

export default function AdminBusinessValuations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { supabaseProfile } = useAuth();
  const isSuperAdmin = supabaseProfile?.app_role === 'super_admin';

  const [tab, setTab] = useState(searchParams.get('tab') || 'requests');
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [reviewRequestId, setReviewRequestId] = useState(searchParams.get('request') || null);
  const [showCreate, setShowCreate] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await getAdminSummary();
      setSummary(res?.summary || null);
      setBusinesses(res?.businesses_without_valuations || []);
    } catch { /* non-fatal */ }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const filters = statusFilter ? { status_filter: statusFilter.statuses } : {};
      const res = await getAdminRequests(filters);
      setRequests(res?.requests || []);
    } catch { setRequests([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminBusinesses();
      setBusinesses(res?.businesses || []);
    } catch { setBusinesses([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (tab === 'requests') loadRequests();
    else if (tab === 'businesses') loadBusinesses();
    else if (tab === 'active' || tab === 'history') loadBusinesses();
    setSearchParams({ tab }, { replace: true });
  }, [tab, statusFilter]);

  // Open review sheet from URL param
  useEffect(() => {
    const reqId = searchParams.get('request');
    if (reqId) setReviewRequestId(reqId);
  }, [searchParams]);

  const handleReviewComplete = (valuation) => {
    loadSummary();
    loadRequests();
    if (valuation) {
      navigate(`/advisory/valuation/${valuation.id}`);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">You need administrator access to view this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin')} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Calculator className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-display font-bold">Business Valuations</h1>
          <p className="text-xs text-muted-foreground">Review valuation requests, create valuations, assign advisors, and monitor progress.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTab('requests')}>
            <Inbox className="w-3.5 h-3.5" /> Review Requests
            {summary?.open_requests > 0 && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">{summary.open_requests}</span>
            )}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> New Business Valuation
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard label="Open Requests" value={summary.open_requests} color="#3B82F6" onClick={() => setTab('requests')} />
          <SummaryCard label="Waiting on Owner" value={summary.waiting_on_owner} color="#EF4444" onClick={() => { setStatusFilter(STATUS_FILTERS[2]); setTab('requests'); }} />
          <SummaryCard label="Businesses w/o Valuation" value={summary.businesses_without_valuations} color="#F59E0B" onClick={() => setTab('businesses')} />
          <SummaryCard label="Active Valuations" value={summary.active_valuations} color="#22C55E" onClick={() => setTab('active')} />
          <SummaryCard label="Needing Advisor" value={summary.valuations_needing_advisor} color="#A855F7" onClick={() => setTab('active')} />
          <SummaryCard label="Needing Review" value={summary.valuations_needing_review} color="#F59E0B" onClick={() => setTab('active')} />
          <SummaryCard label="Ready to Publish" value={summary.ready_to_publish} color="#22C55E" onClick={() => setTab('active')} />
          <SummaryCard label="Recently Published" value={summary.recently_published} color="#6B7280" onClick={() => setTab('history')} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 ${tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'requests' && (
        <RequestsTab
          requests={requests} loading={loading} statusFilter={statusFilter}
          setStatusFilter={setStatusFilter} onReview={(id) => setReviewRequestId(id)}
        />
      )}

      {tab === 'active' && (
        <ValuationsTab businesses={businesses} loading={loading} filter="active" onOpenValuation={(id) => navigate(`/advisory/valuation/${id}`)} />
      )}

      {tab === 'businesses' && (
        <BusinessesTab businesses={businesses} loading={loading} onOpenValuation={(id) => navigate(`/advisory/valuation/${id}`)} onCreateFor={(biz) => { setShowCreate(true); }} />
      )}

      {tab === 'history' && (
        <ValuationsTab businesses={businesses} loading={loading} filter="history" onOpenValuation={(id) => navigate(`/advisory/valuation/${id}`)} />
      )}

      {/* Review sheet */}
      <AdminRequestReviewSheet
        open={!!reviewRequestId}
        onOpenChange={(o) => { if (!o) { setReviewRequestId(null); setSearchParams({ tab }, { replace: true }); } }}
        requestId={reviewRequestId}
        onReviewComplete={handleReviewComplete}
      />

      {/* Direct create sheet */}
      <CreateValuationSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        business={null}
        owners={[]}
        onCreated={(res) => { setShowCreate(false); loadSummary(); if (res?.valuation) navigate(`/advisory/valuation/${res.valuation.id}`); }}
      />
    </div>
  );
}

// ── Requests Tab ─────────────────────────────────────────────────────────────
function RequestsTab({ requests, loading, statusFilter, setStatusFilter, onReview }) {
  if (loading) return <LoadingSpinner />;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setStatusFilter(null)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${!statusFilter ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground'}`}>
          All
        </button>
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setStatusFilter(f)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${statusFilter?.key === f.key ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState icon={Inbox} title="No valuation requests" subtitle="Owner-submitted requests will appear here." />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} onReview={() => onReview(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({ request, onReview }) {
  const urgencyColor = URGENCY_COLOR[request.urgency] || '#6B7280';
  return (
    <button onClick={onReview}
      className="w-full text-left rounded-xl p-3.5 transition-all hover:bg-muted/20"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{request.business_name}</p>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: urgencyColor, background: `${urgencyColor}15` }}>
              {request.urgency?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {request.requester_name} · {request.valuation_purpose || '—'} · Submitted {new Date(request.submitted_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={request.status} />
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      {(request.assigned_admin_name || request.assigned_lead_name) && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          {request.assigned_admin_name && <span>Admin: {request.assigned_admin_name}</span>}
          {request.assigned_lead_name && <span>Lead: {request.assigned_lead_name}</span>}
        </div>
      )}
    </button>
  );
}

// ── Valuations Tab (active / history) ────────────────────────────────────────
function ValuationsTab({ businesses, loading, filter, onOpenValuation }) {
  if (loading) return <LoadingSpinner />;
  const allVals = businesses.flatMap(b => (b.valuations || []).map(v => ({ ...v, business_name: b.business_name, business_id: b.id })));
  const filtered = filter === 'active'
    ? allVals.filter(v => ['not_started', 'in_progress', 'needs_review', 'advisor_approved'].includes(v.status))
    : allVals.filter(v => ['published', 'archived'].includes(v.status));

  if (filtered.length === 0) return <EmptyState icon={Calculator} title="No valuations" subtitle={filter === 'active' ? 'Active valuations will appear here.' : 'Published and archived valuations will appear here.'} />;

  return (
    <div className="space-y-2">
      {filtered.map((v) => (
        <button key={v.id} onClick={() => onOpenValuation(v.id)}
          className="w-full text-left rounded-xl p-3.5 transition-all hover:bg-muted/20"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{v.valuation_name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{v.business_name} · Created {new Date(v.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill status={v.status} />
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Businesses Tab ────────────────────────────────────────────────────────────
function BusinessesTab({ businesses, loading, onOpenValuation, onCreateFor }) {
  const [localBusinesses, setLocalBusinesses] = useState(businesses);
  useEffect(() => { setLocalBusinesses(businesses); }, [businesses]);
  if (loading) return <LoadingSpinner />;
  if (localBusinesses.length === 0) return <EmptyState icon={Building2} title="No businesses" subtitle="Businesses will appear here once created." />;

  return (
    <div className="space-y-2">
      {localBusinesses.map((b) => (
        <div key={b.id} className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{b.business_name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {b.owners?.length || 0} owner(s) · {b.valuations?.length || 0} valuation(s)
                {b.advisor && ` · Advisor: ${b.advisor.first_name} ${b.advisor.last_name}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {b.has_active_valuation ? (
                <Button variant="outline" size="sm" onClick={() => onOpenValuation(b.valuations.find(v => v.status !== 'archived')?.id)}>
                  Open <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => onCreateFor(b)}>
                  <Plus className="w-3.5 h-3.5" /> Create
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, color, onClick }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl p-3 transition-all hover:bg-muted/20" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color }}>{value}</p>
    </button>
  );
}

function StatusPill({ status }) {
  const colors = {
    submitted: '#3B82F6', received: '#3B82F6', under_review: '#F59E0B',
    waiting_on_owner: '#EF4444', approved: '#22C55E', declined: '#EF4444',
    converted_to_valuation: '#22C55E', withdrawn: '#6B7280', closed: '#6B7280',
    not_started: '#6B7280', in_progress: '#3B82F6', needs_review: '#F59E0B',
    advisor_approved: '#22C55E', published: '#22C55E', archived: '#6B7280',
  };
  const color = colors[status] || '#6B7280';
  return <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ color, background: `${color}15` }}>{status?.replace(/_/g, ' ')}</span>;
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center py-16">
      <Icon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}