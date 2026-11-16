import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Search, Sparkles, ChevronDown, ChevronUp, Info,
  Loader2, ArrowUpCircle, Zap, RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EvidenceSection from '@/components/sprint/EvidenceSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

const STATUS_CONFIG = {
  available:  { label: 'Available',    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  active:     { label: 'Active Path',  color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  completed:  { label: 'Completed',    color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  archived:   { label: 'Archived',     color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  superseded: { label: 'Superseded',   color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};

const MAX_REGENERATIONS_PER_MONTH = 5;

function formatCurrency(val) {
  if (!val) return '—';
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${Math.round(val / 1000)}K`;
  return `$${val}`;
}

export default function OpportunityVault({ onExplainWhy, onPromote, onSelectAsPath }) {
  // Phase 6.9 — opportunities belong to a business. Without the active business in
  // both the request AND the cache key, this list showed whichever business was
  // primary (or nothing at all) regardless of which business was selected.
  const { activeContext } = useAuth();
  const activeBusinessId = activeContext?.businessId || null;
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: opportunities = [], isLoading } = useQuery({
    queryKey: ['galileo-opportunities', activeBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'getOpportunities',
        data: { active_business_id: activeBusinessId },
      });
      return res.data?.opportunities || [];
    },
    staleTime: 30000,
  });

  // Fetch generation history to count this month's regenerations
  const { data: generationData } = useQuery({
    queryKey: ['galileo-generation-history', activeBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'getGenerationHistory',
        data: { active_business_id: activeBusinessId },
      });
      return res.data?.generations || [];
    },
    staleTime: 60000,
  });

  const thisMonthCount = (generationData || []).filter(g => {
    const d = new Date(g.created_date || g.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const remainingRegens = Math.max(0, MAX_REGENERATIONS_PER_MONTH - thisMonthCount);
  const canRegenerate = remainingRegens > 0;

  const handleRegenerate = async () => {
    if (!canRegenerate) {
      toast.error(`You've reached the limit of ${MAX_REGENERATIONS_PER_MONTH} regenerations this month.`);
      return;
    }
    setRegenerating(true);
    try {
      await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'generateOpportunities',
        data: { generation_type: 'manual_regeneration', trigger_source: 'manual_refresh', active_business_id: activeBusinessId },
      });
      queryClient.invalidateQueries({ queryKey: ['galileo-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['galileo-generation-history'] });
      toast.success('Galileo generated fresh opportunities!');
    } catch (e) {
      toast.error('Failed to regenerate: ' + (e?.response?.data?.error || e.message));
    }
    setRegenerating(false);
  };

  const industryLens = opportunities.find(o => o.industry_context)?.industry_context || null;

  const filtered = opportunities.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.title || '').toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q) ||
      (o.category || '').toLowerCase().includes(q)
    );
  });

  const statusCounts = opportunities.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, { all: 0 });

  return (
    <div className="space-y-4">
      {/* Regenerate bar */}
      <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ backgroundColor: '#141418' }}>
        <div>
          <p className="text-xs text-muted-foreground">
            {canRegenerate
              ? `${remainingRegens} regeneration${remainingRegens !== 1 ? 's' : ''} remaining this month`
              : 'Monthly regeneration limit reached'}
          </p>
        </div>
        <Button
          size="sm"
          variant={canRegenerate ? 'default' : 'outline'}
          disabled={!canRegenerate || regenerating}
          onClick={handleRegenerate}
          className="h-8 text-xs gap-1.5"
        >
          {regenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {regenerating ? 'Generating...' : 'Regenerate Opportunities'}
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Opportunity Vault</h3>
          <p className="text-xs text-muted-foreground">
            Galileo's complete strategic opportunity portfolio ({opportunities.length} total)
            {industryLens && <span className="ml-2 text-muted-foreground/60">· Industry lens: {industryLens}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{statusCounts.active || 0} active</span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{statusCounts.available || 0} available</span>
          <span className="px-2 py-0.5 rounded bg-slate-500/10 text-slate-400">{statusCounts.completed || 0} completed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search opportunities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-secondary border-border"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs bg-secondary border-border">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({statusCounts.all || 0})</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([v, cfg]) => (
              <SelectItem key={v} value={v}>{cfg.label} ({statusCounts[v] || 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Opportunities list */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No opportunities match your filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(o => {
            const isExpanded = expanded === o.id;
            const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.available;
            return (
              <div
                key={o.id}
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: '#141418' }}
              >
                <div
                  className="p-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : o.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">{o.title}</span>
                      <span className={`text-[9px] font-medium border rounded-full px-1.5 py-0.5 shrink-0 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{o.category}</span>
                      <span>Impact: {o.impact_score}</span>
                      <span>Ease: {o.ease_score}</span>
                      <span className="text-primary font-medium">Score: {o.strategic_opportunity_score}</span>
                      {o.estimated_value_created > 0 && (
                        <span>{formatCurrency(o.estimated_value_created)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {o.status === 'available' && onPromote && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onPromote(o.id); }}
                        className="p-1 text-muted-foreground hover:text-emerald-400 transition-colors"
                        title="Promote to Active"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onExplainWhy && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onExplainWhy(o); }}
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                        title="Why recommended?"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border space-y-2">
                    {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                    {o.expected_outcome && (
                      <p className="text-xs text-muted-foreground"><strong>Expected Outcome:</strong> {o.expected_outcome}</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div className="bg-secondary/30 rounded p-2">
                        <span className="text-muted-foreground">Impact</span>
                        <p className="font-semibold">{o.impact_score}</p>
                      </div>
                      <div className="bg-secondary/30 rounded p-2">
                        <span className="text-muted-foreground">Ease</span>
                        <p className="font-semibold">{o.ease_score}</p>
                      </div>
                      <div className="bg-secondary/30 rounded p-2">
                        <span className="text-muted-foreground">Confidence</span>
                        <p className="font-semibold">{o.confidence_score}%</p>
                      </div>
                      <div className="bg-secondary/30 rounded p-2">
                        <span className="text-muted-foreground">Time to Value</span>
                        <p className="font-semibold">{o.time_to_value_score}</p>
                      </div>
                    </div>
                    {o.recommendation_reason ? (
                      <EvidenceSection
                        reason={o.recommendation_reason}
                        evidence={o.evidence_sources}
                        impact={o.expected_impact}
                        confidence={o.confidence_score}
                      />
                    ) : o.reasoning?.why_recommended ? (
                      <div className="bg-primary/5 rounded p-2 text-[10px]">
                        <span className="text-primary font-medium">Why recommended:</span>{' '}
                        <span className="text-muted-foreground">{o.reasoning.why_recommended}</span>
                      </div>
                    ) : null}
                    {o.reasoning?.key_drivers?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {o.reasoning.key_drivers.map((d, i) => (
                          <span key={i} className="text-[9px] bg-primary/10 text-primary rounded-full px-2 py-0.5">{d}</span>
                        ))}
                      </div>
                    )}
                    {onSelectAsPath && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectAsPath(o); }}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1 pt-1 border-t border-border w-full"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Set as Active 90-Day Sprint
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}