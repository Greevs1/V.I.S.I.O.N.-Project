/**
 * WeeklyDigestCard
 * Displays the client's weekly business progress digest.
 * Used in: Client Dashboard, Admin Overview, Expert Advisor Portal.
 *
 * Props:
 *   profileId, businessId, userEmail — used to fetch/generate
 *   isSuperAdmin — enables "Regenerate" button
 *   readOnly — hides regenerate controls
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Loader2, TrendingUp, ArrowUpRight, ArrowDownRight, CheckCircle2,
  Zap, Target, RefreshCw, ChevronDown, ChevronUp, ArrowRight,
  Calendar, DollarSign, BarChart2, Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const fmt = (n) => {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
};

const SECTION_ICONS = {
  sprint:       { icon: Target,      color: '#D4A853' },
  documents:    { icon: BarChart2,   color: '#00D4FF' },
  assessments:  { icon: CheckCircle2, color: '#10B981' },
  opportunities:{ icon: Zap,         color: '#A855F7' },
  outcomes:     { icon: Star,        color: '#D4A853' },
  default:      { icon: CheckCircle2, color: '#10B981' },
};

function WinIcon({ category }) {
  const cfg = SECTION_ICONS[category] || SECTION_ICONS.default;
  const Icon = cfg.icon;
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
      style={{ background: `${cfg.color}20` }}>
      <Icon className="w-3 h-3" style={{ color: cfg.color }} />
    </div>
  );
}

function ProgressRow({ item }) {
  const isUp = item.direction === 'up';
  const ArrowIcon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <p className="text-xs text-muted-foreground">{item.label}</p>
      <div className="flex items-center gap-1.5">
        {item.from !== '—' && <span className="text-xs text-muted-foreground/60">{item.from}</span>}
        {item.from !== '—' && <ArrowRight className="w-3 h-3 text-muted-foreground/40" />}
        <span className="text-xs font-bold" style={{ color: isUp ? '#10B981' : '#EF4444' }}>{item.to}</span>
        <ArrowIcon className="w-3 h-3" style={{ color: isUp ? '#10B981' : '#EF4444' }} />
      </div>
    </div>
  );
}

const EMPTY_MESSAGE = "No significant changes were recorded this week. Complete assessments, upload documents, work through your sprint, or review opportunities to generate progress updates.";

export default function WeeklyDigestCard({ profileId, businessId, userEmail, isSuperAdmin, readOnly }) {
  const [expanded, setExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = ['weekly-digest', profileId];

  const { data: digest, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await base44.functions.invoke('generateWeeklyDigest', {
        profile_id: profileId,
        business_id: businessId,
        user_email: userEmail,
      });
      return res.data?.digest || null;
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await base44.functions.invoke('generateWeeklyDigest', {
        profile_id: profileId,
        business_id: businessId,
        user_email: userEmail,
        force_regenerate: true,
      });
      queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      // silent
    }
    setRegenerating(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 p-6 flex items-center justify-center gap-2"
        style={{ background: 'rgba(212,168,83,0.03)' }}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Generating your weekly digest…</p>
      </div>
    );
  }

  const isEmpty = !digest || (
    (!digest.wins || digest.wins.length === 0) &&
    (!digest.progress || digest.progress.length === 0) &&
    (!digest.value_created || digest.value_created.length === 0) &&
    (!digest.opportunities_discovered || digest.opportunities_discovered.length === 0)
  );

  const totalValue = (digest?.value_created || []).reduce((s, v) => s + (v.amount || 0), 0);
  const endDateStr = digest?.digest_end_date
    ? new Date(digest.digest_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="rounded-xl overflow-hidden border"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.05) 0%, rgba(0,212,255,0.03) 100%)',
        borderColor: 'rgba(212,168,83,0.2)',
      }}>

      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(212,168,83,0.15)' }}>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weekly Digest</p>
              {endDateStr && <span className="text-[10px] text-muted-foreground/60">· Week of {endDateStr}</span>}
            </div>
            <p className="text-sm font-bold">{digest?.headline || 'Weekly Summary'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && !readOnly && (
            <button onClick={handleRegenerate} disabled={regenerating}
              className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded"
              title="Regenerate digest">
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors">
            {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Hide</> : <><ChevronDown className="w-3.5 h-3.5" />View</>}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-5 pb-4 flex items-center gap-4 flex-wrap">
        {totalValue > 0 && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">{fmt(totalValue)} identified</span>
          </div>
        )}
        {(digest?.wins || []).length > 0 && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400">{digest.wins.length} win{digest.wins.length > 1 ? 's' : ''}</span>
          </div>
        )}
        {(digest?.opportunities_discovered || []).length > 0 && (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-purple-400">{digest.opportunities_discovered.length} opportunit{digest.opportunities_discovered.length > 1 ? 'ies' : 'y'}</span>
          </div>
        )}
        {isEmpty && (
          <p className="text-xs text-muted-foreground">{EMPTY_MESSAGE}</p>
        )}
      </div>

      {/* Expanded content */}
      {expanded && !isEmpty && (
        <div className="border-t border-border/30 px-5 py-5 space-y-5">

          {/* Wins */}
          {(digest.wins || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Wins This Week</p>
              <div className="space-y-2">
                {digest.wins.map((win, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <WinIcon category={win.category} />
                    <p className="text-sm">{win.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {(digest.progress || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Progress</p>
              <div className="rounded-lg border border-border/40 px-4 py-1 divide-y divide-border/20">
                {digest.progress.map((item, i) => <ProgressRow key={i} item={item} />)}
              </div>
            </div>
          )}

          {/* Value Created */}
          {(digest.value_created || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Value Created</p>
              <div className="space-y-2">
                {digest.value_created.map((v, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-lg"
                    style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.15)' }}>
                    <p className="text-xs font-medium">{v.label}</p>
                    <p className="text-sm font-bold text-primary">{fmt(v.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunities */}
          {(digest.opportunities_discovered || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Opportunities Surfaced</p>
              <div className="space-y-2">
                {digest.opportunities_discovered.map((opp, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 rounded-lg border border-border/30"
                    style={{ background: 'rgba(168,85,247,0.04)' }}>
                    <div>
                      <p className="text-xs font-medium">{opp.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        opp.priority === 'high' ? 'bg-red-500/10 text-red-400' :
                        opp.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-muted text-muted-foreground'
                      }`}>{opp.priority}</span>
                    </div>
                    {opp.impact_estimate > 0 && (
                      <p className="text-sm font-bold text-purple-400 shrink-0">{fmt(opp.impact_estimate)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outcomes */}
          {(digest.outcomes_verified || []).filter(o => o.status === 'verified').length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Outcomes Verified</p>
              <div className="space-y-2">
                {digest.outcomes_verified.filter(o => o.status === 'verified').map((o, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-emerald-500/20"
                    style={{ background: 'rgba(16,185,129,0.04)' }}>
                    <p className="text-xs font-medium">{o.title}</p>
                    <div className="text-right">
                      {o.actual_impact > 0 && <p className="text-sm font-bold text-emerald-400">{fmt(o.actual_impact)}</p>}
                      <p className="text-[10px] text-muted-foreground">Verified</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Freedom changes */}
          {digest.freedom_changes && (digest.freedom_changes.freedom_score_before || digest.freedom_changes.freedom_date_before) && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Freedom Progress</p>
              <div className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border/30">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                {digest.freedom_changes.freedom_score_before != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Freedom Score</p>
                    <p className="text-sm font-bold">
                      {Math.round(digest.freedom_changes.freedom_score_before)} → {Math.round(digest.freedom_changes.freedom_score_after)}
                    </p>
                  </div>
                )}
                {digest.freedom_changes.freedom_date_before && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Freedom Date</p>
                    <p className="text-sm font-bold">{digest.freedom_changes.freedom_date_after}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Next Best Actions */}
          {(digest.next_best_actions || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Next Best Actions</p>
              <div className="space-y-2">
                {digest.next_best_actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 rounded-lg border border-border/30"
                    style={{ background: 'rgba(0,212,255,0.03)' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'rgba(0,212,255,0.12)' }}>
                      <span className="text-[10px] font-bold text-cyan-400">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{action.title}</p>
                      {action.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{action.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advisor Notes */}
          {digest.advisor_notes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Advisor Notes</p>
              <div className="px-4 py-3 rounded-lg border border-border/30 text-sm text-foreground/80">
                {digest.advisor_notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}