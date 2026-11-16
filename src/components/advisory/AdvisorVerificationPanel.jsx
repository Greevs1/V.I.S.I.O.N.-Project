import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ChevronDown, ChevronUp, DollarSign, CheckCircle2, Clock } from 'lucide-react';

const fmtMoney = (n) => {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
};

function VerifyForm({ item, type, onVerified }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [verifiedValue, setVerifiedValue] = useState('');
  const [verifiedTax, setVerifiedTax] = useState('');
  const [verifiedProfit, setVerifiedProfit] = useState('');
  const [verifiedCashFlow, setVerifiedCashFlow] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const estTotal = type === 'roadmap'
    ? (item.estimated_value_created || item.estimated_tax_savings || item.estimated_profit_improvement || item.estimated_cash_flow_improvement)
    : (item.estimated_impact);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    const action = type === 'roadmap' ? 'verifyRoadmapItem' : 'verifyValueCreationEvent';
    const payload = type === 'roadmap'
      ? {
          roadmap_item_id: item.id,
          verification_notes: notes || null,
          verified_value_created: verifiedValue ? Number(verifiedValue) : null,
          verified_tax_savings: verifiedTax ? Number(verifiedTax) : null,
          verified_profit_improvement: verifiedProfit ? Number(verifiedProfit) : null,
          verified_cash_flow_improvement: verifiedCashFlow ? Number(verifiedCashFlow) : null,
        }
      : {
          event_id: item.id,
          verification_notes: notes || null,
          verified_value: verifiedValue ? Number(verifiedValue) : null,
          verified_tax_savings: verifiedTax ? Number(verifiedTax) : null,
          verified_profit_improvement: verifiedProfit ? Number(verifiedProfit) : null,
          verified_cash_flow_improvement: verifiedCashFlow ? Number(verifiedCashFlow) : null,
        };
    const res = await base44.functions.invoke('supabaseUserData', { action, data: payload });
    if (res.data?.success) {
      onVerified(item.id);
    } else {
      setError(res.data?.error || 'Verification failed');
    }
    setLoading(false);
  };

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{item.title}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {item.category && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">{item.category}</Badge>
            )}
            {item.priority && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/20">{item.priority}</Badge>
            )}
            {item.source_assessment_type && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">{item.source_assessment_type.replace(/_/g, ' ')}</Badge>
            )}
          </div>
          {/* Estimated Impact Summary */}
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
            {(type === 'roadmap' ? item.estimated_value_created : item.estimated_impact) && (
              <span>Total Est: <strong className="text-foreground">{fmtMoney(type === 'roadmap' ? item.estimated_value_created : item.estimated_impact)}</strong></span>
            )}
            {item.estimated_tax_savings && (
              <span>Tax: <strong className="text-emerald-400">{fmtMoney(item.estimated_tax_savings)}</strong></span>
            )}
            {item.estimated_profit_improvement && (
              <span>Profit: <strong className="text-cyan-400">{fmtMoney(item.estimated_profit_improvement)}</strong></span>
            )}
            {item.estimated_cash_flow_improvement && (
              <span>Cash Flow: <strong className="text-accent">{fmtMoney(item.estimated_cash_flow_improvement)}</strong></span>
            )}
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="shrink-0 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Verify
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {open && (
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Enter verified dollar amounts (leave blank to copy estimated)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Total Value Created</label>
              <input
                type="number"
                placeholder={estTotal ? String(estTotal) : '0'}
                value={verifiedValue}
                onChange={e => setVerifiedValue(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Tax Savings</label>
              <input
                type="number"
                placeholder={item.estimated_tax_savings ? String(item.estimated_tax_savings) : '0'}
                value={verifiedTax}
                onChange={e => setVerifiedTax(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Profit Improvement</label>
              <input
                type="number"
                placeholder={item.estimated_profit_improvement ? String(item.estimated_profit_improvement) : '0'}
                value={verifiedProfit}
                onChange={e => setVerifiedProfit(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Cash Flow Improvement</label>
              <input
                type="number"
                placeholder={item.estimated_cash_flow_improvement ? String(item.estimated_cash_flow_improvement) : '0'}
                value={verifiedCashFlow}
                onChange={e => setVerifiedCashFlow(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
              Verification Notes (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Add context, evidence, or supporting details..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-secondary border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs gap-1.5" onClick={handleVerify} disabled={loading}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {loading ? 'Verifying...' : 'Confirm Verified'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdvisorVerificationPanel() {
  const queryClient = useQueryClient();
  const [verified, setVerified] = useState(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['verificationQueue'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { action: 'getVerificationQueue' });
      return res.data || { roadmap_items: [], value_creation_events: [] };
    },
    initialData: { roadmap_items: [], value_creation_events: [] },
  });

  const handleVerified = (id) => {
    setVerified(prev => new Set([...prev, id]));
    queryClient.invalidateQueries({ queryKey: ['verificationQueue'] });
    queryClient.invalidateQueries({ queryKey: ['valueCreationSummary'] });
    queryClient.invalidateQueries({ queryKey: ['valueCreationEvents'] });
  };

  const roadmapItems = (data.roadmap_items || []).filter(i => !verified.has(i.id));
  const vceItems = (data.value_creation_events || []).filter(i => !verified.has(i.id));
  const totalPending = roadmapItems.length + vceItems.length;

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-6 text-center">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="text-xs text-muted-foreground mt-2">Loading verification queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-xl p-6 text-center">
        <p className="text-xs text-destructive">Unable to load verification queue. You may not have advisor access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Verification Queue</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Completed sprint items awaiting advisor verification of actual impact
          </p>
        </div>
        {totalPending > 0 && (
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
            {totalPending} pending
          </Badge>
        )}
      </div>

      {totalPending === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-medium">All caught up</p>
          <p className="text-xs text-muted-foreground mt-1">No items are awaiting verification right now.</p>
        </div>
      )}

      {roadmapItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              Completed Sprint Items ({roadmapItems.length})
            </p>
          </div>
          {roadmapItems.map(item => (
            <VerifyForm key={item.id} item={item} type="roadmap" onVerified={handleVerified} />
          ))}
        </div>
      )}

      {vceItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              Value Creation Events ({vceItems.length})
            </p>
          </div>
          {vceItems.map(item => (
            <VerifyForm key={item.id} item={item} type="vce" onVerified={handleVerified} />
          ))}
        </div>
      )}
    </div>
  );
}