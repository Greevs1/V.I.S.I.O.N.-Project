import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMembership } from '@/lib/useMembership';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Sparkles, Lock, TrendingUp, AlertTriangle, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const fmt = (n) => {
  if (!n || isNaN(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
};

const confidenceBadge = (level) => {
  const map = { high: 'bg-emerald-500/20 text-emerald-400', medium: 'bg-yellow-500/20 text-yellow-400', low: 'bg-red-500/20 text-red-400' };
  return map[level] || map.low;
};

const severityColor = { high: 'text-red-400', medium: 'text-yellow-400', low: 'text-emerald-400' };

function BlurredPlaceholder({ lines = 2, onUpgrade }) {
  return (
    <div className="relative">
      <div className="space-y-2 blur-sm select-none pointer-events-none opacity-60">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-muted-foreground/20" style={{ width: `${70 + (i % 2) * 20}%` }} />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          onClick={onUpgrade}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-background/80 border border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Lock className="w-3 h-3" /> Upgrade to unlock
        </button>
      </div>
    </div>
  );
}

export default function GalileoAdvisorCard() {
  const { isPaid } = useMembership();
  const { activeContext } = useAuth();
  const navigate = useNavigate();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [hasLoaded, setHasLoaded] = useState(false);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const loadInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('generateGalileoInsights', {
        membership_status: isPaid ? 'paid' : 'free',
        // Phase 6.9 — the selected business must be explicit. The backend refuses
        // an ambiguous request rather than falling back to the primary business.
        ...(activeContext?.businessId ? { active_business_id: activeContext.businessId } : {}),
      });
      if (res.data?.insights) {
        setInsights(res.data);
        setHasLoaded(true);
      } else {
        setError(res.data?.error || 'Failed to generate insights');
      }
    } catch (e) {
      setError(e.message || 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  const ins = insights?.insights;
  const isGated = insights?.is_gated;

  // Empty / unloaded state
  if (!hasLoaded) {
    return (
      <div className="glass rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Galileo Advisor</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full border border-border">AI</span>
          </div>
          <Button size="sm" variant="outline" onClick={loadInsights} disabled={loading} className="text-xs gap-1.5">
            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Analyzing...' : 'Generate Insights'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Galileo analyzes your assessments, verified wins, documents, and sprint progress to generate personalized strategic insights.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Galileo Advisor</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full border border-border">AI</span>
          {ins?.confidence_level && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${confidenceBadge(ins.confidence_level)}`}>
              {ins.confidence_level} confidence
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={loadInsights} disabled={loading} className="text-xs gap-1.5 h-7">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Executive Summary */}
      {ins?.executive_summary && (
        <div className="text-sm text-foreground/80 leading-relaxed border-l-2 border-primary/40 pl-3">
          {ins.executive_summary}
        </div>
      )}

      {/* Value Available */}
      {ins?.estimated_value_available?.total && (
        <div className="glass rounded-lg p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-display font-bold text-primary">{fmt(ins.estimated_value_available.total)}</p>
            <p className="text-[10px] text-muted-foreground uppercase mt-1">Total Opportunity</p>
            <p className="text-[10px] text-muted-foreground/60">{ins.estimated_value_available.source}</p>
          </div>
          <div>
            <p className="text-xl font-display font-bold text-emerald-400">{fmt(ins.estimated_value_available.verified_to_date) || '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase mt-1">Verified</p>
          </div>
          <div>
            <p className="text-xl font-display font-bold">{ins.hidden_opportunities_count > 0 ? `+${ins.hidden_opportunities_count}` : '—'}</p>
            <p className="text-[10px] text-muted-foreground uppercase mt-1">Hidden Opps</p>
          </div>
        </div>
      )}

      {/* Top Priorities */}
      <div className="space-y-2">
        <button onClick={() => toggle('priorities')} className="flex items-center justify-between w-full text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3 h-3" /> Top Priorities
          </p>
          {expanded.priorities ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </button>
        {(expanded.priorities || true) && (
          <div className="space-y-2">
            {(ins?.top_3_priorities || []).map((p, i) => (
              <div key={i} className="glass rounded-lg p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-primary w-4">{p.rank}.</span>
                    <span className="text-sm font-medium">{p.title}</span>
                  </div>
                  {p.estimated_impact && (
                    <span className="text-xs text-emerald-400 font-semibold shrink-0">{fmt(p.estimated_impact)}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground pl-6">{p.rationale}</p>
                {p.action && p.timeframe && (
                  <p className="text-xs text-foreground/60 pl-6">→ {p.action} <span className="text-muted-foreground">({p.timeframe})</span></p>
                )}
              </div>
            ))}
            {isGated && ins?._gated_priorities_count > 0 && (
              <div className="rounded-lg p-3 border border-dashed border-border">
                <BlurredPlaceholder lines={2} onUpgrade={() => navigate('/strategy-call')} />
                <p className="text-[10px] text-muted-foreground text-center mt-2">+{ins._gated_priorities_count} more priorities — upgrade to view</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Biggest Risks */}
      {ins?.biggest_risks?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Key Risks
          </p>
          <div className="space-y-1.5">
            {ins.biggest_risks.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`font-bold uppercase text-[10px] mt-0.5 ${severityColor[r.severity]}`}>{r.severity}</span>
                <div>
                  <span className="text-foreground/80">{r.risk}</span>
                  {r.mitigation && <span className="text-muted-foreground"> — {r.mitigation}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Focus */}
      {ins?.recommended_focus && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Recommended Focus
          </p>
          {isGated && ins._recommended_focus_gated ? (
            <BlurredPlaceholder lines={2} onUpgrade={() => navigate('/strategy-call')} />
          ) : (
            <div className="glass rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{ins.recommended_focus.primary_area}</span>
                {ins.recommended_focus.estimated_return && (
                  <span className="text-xs text-emerald-400">{fmt(ins.recommended_focus.estimated_return)}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{ins.recommended_focus.reason}</p>
            </div>
          )}
        </div>
      )}

      {/* 90-Day Plan */}
      <div className="space-y-2">
        <button onClick={() => toggle('plan')} className="flex items-center justify-between w-full text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">90-Day Plan</p>
          {expanded.plan ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </button>
        {expanded.plan && (
          <div className="space-y-2">
            {(ins?.next_90_day_plan || []).map((item, i) => (
              <div key={i} className="glass rounded-lg p-3 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-primary font-semibold">{item.week_range}</span>
                  <span className="text-[10px] text-muted-foreground">— {item.focus}</span>
                </div>
                <p className="text-xs text-foreground/80">{item.action}</p>
                {item.milestone && <p className="text-[10px] text-muted-foreground">✓ {item.milestone}</p>}
              </div>
            ))}
            {isGated && ins?._gated_plan_count > 0 && (
              <div className="rounded-lg p-3 border border-dashed border-border">
                <BlurredPlaceholder lines={3} onUpgrade={() => navigate('/strategy-call')} />
                <p className="text-[10px] text-muted-foreground text-center mt-2">+{ins._gated_plan_count} more weeks — upgrade for complete plan</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Gaps Warning */}
      {ins?.data_gaps?.length > 0 && (
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          Data gaps: {ins.data_gaps.join(' · ')}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/40">
        Generated {insights?.generated_at ? new Date(insights.generated_at).toLocaleString() : ''}
      </p>
    </div>
  );
}