/**
 * ExpertClientOpportunities — read-only Opportunity Vault for expert advisor portal.
 * Fetches galileo_opportunities scoped to the selected client's business_id.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, Zap, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const STATUS_CONFIG = {
  available:  { label: 'Available',   color: 'text-blue-300 bg-blue-500/15 border-blue-500/30' },
  active:     { label: 'Active Path', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
  completed:  { label: 'Completed',   color: 'text-slate-300 bg-slate-500/15 border-slate-500/30' },
  archived:   { label: 'Archived',    color: 'text-zinc-400 bg-zinc-500/15 border-zinc-500/30' },
  superseded: { label: 'Superseded',  color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
};

const fmt = (val) => {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${Math.round(val / 1000)}K`;
  return `$${val}`;
};

export default function ExpertClientOpportunities({ clientProfileId, clientBusinessId, clientEmail }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  // Use exact same source as Admin → Users & Clients → Opportunities tab:
  // supabaseOpportunityData / getBusinessOpportunities with _router_user_email
  const { data: opportunities = [], isLoading, error: queryError } = useQuery({
    queryKey: ['expert-client-opportunities', clientEmail],
    queryFn: async () => {
      if (!clientEmail) return [];
      const res = await base44.functions.invoke('supabaseOpportunityData', {
        action: 'getBusinessOpportunities',
        _router_user_email: clientEmail,
      });
      return res.data?.opportunities || [];
    },
    enabled: !!clientEmail,
    staleTime: 60000,
  });

  const filtered = opportunities.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (o.title || '').toLowerCase().includes(q) || (o.category || '').toLowerCase().includes(q);
  });

  const statusCounts = opportunities.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!opportunities.length) {
    return (
      <div className="space-y-2">
        <div className="glass rounded-xl p-10 text-center space-y-2">
          <Zap className="w-7 h-7 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No opportunities generated for this client yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Opportunity Vault</p>
          <p className="text-xs text-muted-foreground">{opportunities.length} total opportunities</p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{statusCounts.active || 0} active</span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{statusCounts.available || 0} available</span>
          <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5 ml-1">Read-Only</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search opportunities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-8 text-xs bg-secondary border-border"
        />
      </div>

      {/* Opportunity list */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">No opportunities match your search.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(o => {
            const isExpanded = expanded === o.id;
            const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.available;
            return (
              <div key={o.id} className="glass rounded-xl overflow-hidden">
                <div
                  className="p-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : o.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium">{o.title}</span>
                      <span className={`text-[9px] font-medium border rounded-full px-1.5 py-0.5 shrink-0 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{o.category}</span>
                      {o.impact_score != null && <span>Impact: {o.impact_score}</span>}
                      {o.ease_score != null && <span>Ease: {o.ease_score}</span>}
                      {o.strategic_opportunity_score != null && (
                        <span className="text-primary font-medium">Score: {o.strategic_opportunity_score}</span>
                      )}
                      {o.estimated_value_created > 0 && <span>{fmt(o.estimated_value_created)}</span>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border space-y-2">
                    {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                    {o.expected_outcome && (
                      <p className="text-xs text-muted-foreground"><strong>Expected Outcome:</strong> {o.expected_outcome}</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      {o.impact_score != null && (
                        <div className="bg-secondary/30 rounded p-2"><span className="text-muted-foreground">Impact</span><p className="font-semibold">{o.impact_score}</p></div>
                      )}
                      {o.ease_score != null && (
                        <div className="bg-secondary/30 rounded p-2"><span className="text-muted-foreground">Ease</span><p className="font-semibold">{o.ease_score}</p></div>
                      )}
                      {o.confidence_score != null && (
                        <div className="bg-secondary/30 rounded p-2"><span className="text-muted-foreground">Confidence</span><p className="font-semibold">{o.confidence_score}%</p></div>
                      )}
                      {o.time_to_value_score != null && (
                        <div className="bg-secondary/30 rounded p-2"><span className="text-muted-foreground">Time to Value</span><p className="font-semibold">{o.time_to_value_score}</p></div>
                      )}
                    </div>
                    {o.recommendation_reason && (
                      <div className="bg-primary/5 rounded p-2 text-[10px]">
                        <span className="text-primary font-medium">Why recommended: </span>
                        <span className="text-muted-foreground">{o.recommendation_reason}</span>
                      </div>
                    )}
                    {o.estimated_tax_savings > 0 && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Est. Tax Savings</span>
                        <span className="font-medium text-emerald-400">{fmt(o.estimated_tax_savings)}</span>
                      </div>
                    )}
                    {o.estimated_cash_flow_improvement > 0 && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Cash Flow Improvement</span>
                        <span className="font-medium text-emerald-400">{fmt(o.estimated_cash_flow_improvement)}</span>
                      </div>
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