/**
 * AdvisorCommandCenter
 * Mission-control dashboard for Super Admin, Admin, and Expert Advisors.
 * Consumes generateAdvisorCommandCenter function — no new calculations.
 */
import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import {
  Users, AlertTriangle, TrendingUp, CheckCircle, DollarSign,
  Search, Filter, Loader2, RefreshCw, ChevronRight, Activity,
  AlertCircle, Zap, Target, FileText, Trophy, Clock, Building
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExpertVerificationQueue from '@/components/sprint/ExpertVerificationQueue';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  on_track:        { label: 'On Track',        color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',   icon: CheckCircle },
  needs_attention: { label: 'Needs Attention', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  icon: AlertTriangle },
  stalled:         { label: 'Stalled',         color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',   icon: AlertCircle },
  high_opportunity:{ label: 'High Opportunity',color: '#D4A853', bg: 'rgba(212,168,83,0.1)',  border: 'rgba(212,168,83,0.25)',  icon: TrendingUp },
  missing_data:    { label: 'Missing Data',    color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)', icon: FileText },
  no_data:         { label: 'No Data',         color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.25)', icon: Activity },
};

const FLAG_CONFIG = {
  on_track:        { label: 'On Track',         color: '#22c55e' },
  needs_attention: { label: 'Needs Attention',  color: '#f59e0b' },
  stalled:         { label: 'Stalled',          color: '#ef4444' },
  high_opportunity:{ label: 'High Opportunity', color: '#D4A853' },
  missing_data:    { label: 'Missing Data',     color: '#a78bfa' },
};

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${active ? 'ring-2 ring-primary/50' : ''}`}
      style={{ background: active ? `${color}18` : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </button>
  );
}

// ── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({ summary, onClick }) {
  const statusCfg = STATUS_CONFIG[summary.primary_status] || STATUS_CONFIG.no_data;
  const StatusIcon = statusCfg.icon;

  return (
    <button
      onClick={() => onClick(summary)}
      className="w-full rounded-xl p-5 text-left transition-all hover:scale-[1.005] hover:shadow-lg"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
          style={{ background: `${statusCfg.color}20`, color: statusCfg.color }}>
          {(summary.client_name || '?')[0].toUpperCase()}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{summary.client_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Building className="w-3 h-3 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{summary.business_name}</p>
                {summary.industry && summary.industry !== '—' && (
                  <span className="text-[10px] text-muted-foreground/60">· {summary.industry}</span>
                )}
              </div>
            </div>
            {/* Status badge */}
            <div className="flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1"
              style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.border}` }}>
              <StatusIcon className="w-3 h-3" style={{ color: statusCfg.color }} />
              <span className="text-[10px] font-semibold" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
            </div>
          </div>

          {/* Digest headline */}
          {summary.digest_headline && (
            <p className="text-xs text-muted-foreground mt-2 italic truncate">"{summary.digest_headline}"</p>
          )}

          {/* Metrics row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            {summary.iq_score != null && (
              <span className="text-xs font-medium" style={{ color: '#D4A853' }}>IQ {Math.round(summary.iq_score)}</span>
            )}
            {summary.sprint_progress != null && summary.sprint_status && (
              <span className="text-xs text-muted-foreground">Sprint {summary.sprint_progress}%</span>
            )}
            {summary.open_opportunity_count > 0 && (
              <span className="text-xs text-muted-foreground">{summary.open_opportunity_count} opportunities</span>
            )}
            {summary.total_opportunity_value > 0 && (
              <span className="text-xs font-medium text-emerald-400">{fmt(summary.total_opportunity_value)} potential</span>
            )}
            {summary.verified_outcome_count > 0 && (
              <span className="text-xs text-emerald-400">{summary.verified_outcome_count} verified</span>
            )}
            {summary.missing_doc_count > 0 && (
              <span className="text-xs text-amber-400">{summary.missing_doc_count} docs needed</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{timeAgo(summary.last_activity)}</span>
          </div>

          {/* Top action */}
          {summary.top_action && (
            <div className="mt-2.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Target className="w-3 h-3 text-primary shrink-0" />
              <p className="text-[11px] text-foreground/80 truncate">{summary.top_action}</p>
            </div>
          )}

          {/* Extra flags */}
          {summary.flags.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {summary.flags.filter(f => f !== summary.primary_status).map(flag => {
                const fc = FLAG_CONFIG[flag];
                if (!fc) return null;
                return (
                  <span key={flag} className="text-[10px] rounded-full px-2 py-0.5"
                    style={{ color: fc.color, background: `${fc.color}15`, border: `1px solid ${fc.color}30` }}>
                    {fc.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Compact Queue Row ─────────────────────────────────────────────────────────
function QueueRow({ summary, onClick, showValue }) {
  const statusCfg = STATUS_CONFIG[summary.primary_status] || STATUS_CONFIG.no_data;
  return (
    <button
      onClick={() => onClick(summary)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary/60 transition-all text-left"
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
        style={{ background: `${statusCfg.color}20`, color: statusCfg.color }}>
        {(summary.client_name || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{summary.client_name}</p>
        <p className="text-xs text-muted-foreground truncate">{summary.business_name} · {summary.top_action || 'No pending action'}</p>
      </div>
      {showValue && summary.total_opportunity_value > 0 && (
        <span className="text-sm font-semibold text-emerald-400 shrink-0">{fmt(summary.total_opportunity_value)}</span>
      )}
      {!showValue && (
        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(summary.last_activity)}</span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdvisorCommandCenter({ onSelectClient, expertProfileId }) {
  const { supabaseProfile } = useAuth();
  const appRole = supabaseProfile?.app_role;
  const isSuperAdmin = appRole === 'super_admin';
  const isAdminLevel = appRole === 'super_admin' || appRole === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['advisor-command-center', appRole, expertProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('generateAdvisorCommandCenter', {
        role: appRole,
        expert_profile_id: expertProfileId || null,
      });
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    enabled: !!appRole,
  });

  const summaries = data?.summaries || [];
  const meta = data?.meta || {};

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = summaries;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.client_name?.toLowerCase().includes(q) ||
        s.business_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(s => s.primary_status === statusFilter || s.flags.includes(statusFilter));
    }
    return list;
  }, [summaries, search, statusFilter]);

  // ── Queue sections ─────────────────────────────────────────────────────────
  const attentionQueue = useMemo(() =>
    summaries
      .filter(s => s.flags.includes('needs_attention') || s.flags.includes('stalled') || s.flags.includes('missing_data'))
      .slice(0, 8),
    [summaries]
  );

  const highOppQueue = useMemo(() =>
    summaries
      .filter(s => s.total_opportunity_value > 0)
      .sort((a, b) => b.total_opportunity_value - a.total_opportunity_value)
      .slice(0, 8),
    [summaries]
  );

  const recentWins = useMemo(() => {
    const wins = [];
    summaries.forEach(s => {
      if (s.verified_outcome_count > 0) {
        wins.push({ client_name: s.client_name, text: `${s.verified_outcome_count} verified outcome${s.verified_outcome_count > 1 ? 's' : ''}`, type: 'outcome', value: null });
      }
      (s.recent_wins || []).forEach(w => {
        wins.push({ client_name: s.client_name, text: w.text, type: w.category || 'win', value: null });
      });
    });
    return wins.slice(0, 6);
  }, [summaries]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading command center…</span>
      </div>
    );
  }

  // Expert advisors see their assigned verification queue first
  const isExpertAdvisor = appRole === 'expert_advisor';

  return (
    <div className="space-y-6 pb-12">
      {/* Expert Advisor: Verification Queue */}
      {isExpertAdvisor && (
        <ExpertVerificationQueue onReviewSprint={onSelectClient} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Advisor Command Center</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdminLevel ? 'All clients across the platform' : 'Your assigned clients'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ── Top Row Stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total Clients" value={meta.total || 0}
          icon={Users} color="#D4A853"
          onClick={() => setStatusFilter('all')} active={statusFilter === 'all'}
        />
        <StatCard
          label="Needs Attention" value={meta.needs_attention || 0}
          icon={AlertTriangle} color="#f59e0b"
          onClick={() => setStatusFilter(statusFilter === 'needs_attention' ? 'all' : 'needs_attention')}
          active={statusFilter === 'needs_attention'}
        />
        <StatCard
          label="High Opportunity" value={meta.high_opportunity || 0}
          icon={TrendingUp} color="#D4A853"
          onClick={() => setStatusFilter(statusFilter === 'high_opportunity' ? 'all' : 'high_opportunity')}
          active={statusFilter === 'high_opportunity'}
        />
        <StatCard
          label="On Track" value={meta.on_track || 0}
          icon={CheckCircle} color="#22c55e"
          onClick={() => setStatusFilter(statusFilter === 'on_track' ? 'all' : 'on_track')}
          active={statusFilter === 'on_track'}
        />
        <StatCard
          label="Verified Outcomes" value={meta.verified_outcomes_this_week || 0}
          icon={Trophy} color="#a78bfa"
        />
      </div>

      {/* ── Attention Queue + High Opportunity (side-by-side on desktop) ───── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Needs Attention This Week */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.03)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold">Needs Attention This Week</p>
            <span className="ml-auto text-xs text-muted-foreground">{attentionQueue.length}</span>
          </div>
          {attentionQueue.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">All clients are progressing well.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {attentionQueue.map(s => (
                <QueueRow key={s.email} summary={s} onClick={onSelectClient} showValue={false} />
              ))}
            </div>
          )}
        </div>

        {/* Highest Opportunity */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.03)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(34,197,94,0.15)' }}>
            <Zap className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-semibold">Highest Opportunity Clients</p>
            <span className="ml-auto text-xs text-muted-foreground">{fmt(meta.total_opportunity_value || 0)} total</span>
          </div>
          {highOppQueue.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No opportunity data yet.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {highOppQueue.map(s => (
                <QueueRow key={s.email} summary={s} onClick={onSelectClient} showValue={true} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Wins ────────────────────────────────────────────────────── */}
      {recentWins.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(167,139,250,0.2)', background: 'rgba(167,139,250,0.03)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(167,139,250,0.15)' }}>
            <Trophy className="w-4 h-4" style={{ color: '#a78bfa' }} />
            <p className="text-sm font-semibold">Recent Wins</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {recentWins.map((w, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold">{w.client_name}</p>
                  <p className="text-xs text-muted-foreground">{w.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Search + Filter + Client Grid ──────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, businesses, email…"
              className="w-full h-9 bg-secondary border border-border rounded-lg pl-9 pr-3 text-sm outline-none focus:border-primary/40"
            />
          </div>
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-secondary">
            {[
              { id: 'all', label: 'All' },
              { id: 'needs_attention', label: 'Attention' },
              { id: 'stalled', label: 'Stalled' },
              { id: 'high_opportunity', label: 'Opportunity' },
              { id: 'on_track', label: 'On Track' },
              { id: 'missing_data', label: 'Missing' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  statusFilter === f.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{f.label}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center space-y-2">
            <Users className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search || statusFilter !== 'all' ? 'No clients match this filter.' : 'No clients found.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(s => (
              <ClientCard key={s.email} summary={s} onClick={onSelectClient} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}