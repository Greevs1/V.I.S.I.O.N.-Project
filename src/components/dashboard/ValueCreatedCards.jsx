import React from 'react';
import { DollarSign, PiggyBank, TrendingUp, Landmark, Trophy, Zap, ShieldCheck, BarChart2 } from 'lucide-react';

const fmtMoney = (n) => {
  if (n == null || n === 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
};

const fmtPct = (n) => (n == null ? null : `${Math.round(n)}%`);

/**
 * ValueCreatedCards — shows estimated vs verified impact side-by-side.
 * 
 * Props:
 *   valueCreationSummary  — from getValueCreationSummary (Supabase view)
 *   valueCreationEvents   — raw events array (used for verified/estimated counts)
 */
export default function ValueCreatedCards({ valueCreationSummary, valueCreationEvents = [] }) {
  const vc = valueCreationSummary || {};

  // Aggregate verified values directly from events when available
  const verifiedEvents = valueCreationEvents.filter(e => e.status === 'verified');
  const pendingEvents = valueCreationEvents.filter(e => e.status === 'pending_verification');
  const estimatedEvents = valueCreationEvents.filter(e => e.status !== 'dismissed' && e.status !== 'deferred');

  const verifiedTotal = verifiedEvents.reduce((s, e) => s + (e.verified_value || e.estimated_impact || 0), 0);
  const verifiedTax = verifiedEvents.reduce((s, e) => s + (e.verified_tax_savings || e.estimated_tax_savings || 0), 0);
  const verifiedProfit = verifiedEvents.reduce((s, e) => s + (e.verified_profit_improvement || e.estimated_profit_improvement || 0), 0);
  const verifiedCashFlow = verifiedEvents.reduce((s, e) => s + (e.verified_cash_flow_improvement || e.estimated_cash_flow_improvement || 0), 0);

  const estimatedTotal = estimatedEvents.reduce((s, e) => s + (e.estimated_impact || 0), 0);

  // Summary-sourced values (fallback to events when view not populated)
  const summaryVerifiedTotal = vc.total_value_created || null;
  const summaryEstimatedTotal = vc.total_identified_wins ? null : estimatedTotal;

  const displayVerified = verifiedTotal > 0 ? verifiedTotal : (summaryVerifiedTotal || null);
  const displayEstimated = estimatedTotal > 0 ? estimatedTotal : (summaryEstimatedTotal || null);
  const displayTax = verifiedTax > 0 ? verifiedTax : (vc.total_tax_savings || null);
  const displayProfit = verifiedProfit > 0 ? verifiedProfit : (vc.total_profit_improvement || null);
  const displayCashFlow = verifiedCashFlow > 0 ? verifiedCashFlow : (vc.total_cash_flow_unlocked || null);

  const totalWins = estimatedEvents.length;
  const verifiedWins = verifiedEvents.length;
  const verificationRate = totalWins > 0 ? Math.round((verifiedWins / totalWins) * 100) : null;

  const hasAnyData = displayVerified || displayEstimated || displayTax || displayProfit || displayCashFlow || verifiedWins > 0;

  if (!hasAnyData) {
    return (
      <div className="glass rounded-xl p-6">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-4">Value Created</p>
        <p className="text-sm text-muted-foreground text-center py-4">
          Not enough data yet — complete assessments and sprint tasks to track value created.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Value Created
        </p>
        {verificationRate != null && (
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 font-medium">{verificationRate}% Verified</span>
          </div>
        )}
      </div>

      {/* Primary Metrics Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Estimated Value */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estimated Value</p>
          </div>
          {displayEstimated ? (
            <p className="text-xl font-display font-bold text-foreground">{fmtMoney(displayEstimated)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Not enough data yet</p>
          )}
          {pendingEvents.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">{pendingEvents.length} awaiting verification</p>
          )}
        </div>

        {/* Verified Value */}
        <div className="glass rounded-xl p-4 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified Value</p>
          </div>
          {displayVerified ? (
            <p className="text-xl font-display font-bold text-emerald-400">{fmtMoney(displayVerified)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">None verified yet</p>
          )}
          {verifiedWins > 0 && (
            <p className="text-[10px] text-emerald-400/70 mt-1">{verifiedWins} advisor-verified {verifiedWins === 1 ? 'win' : 'wins'}</p>
          )}
        </div>
      </div>

      {/* Secondary Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <PiggyBank className="w-3 h-3 text-emerald-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tax Savings</p>
          </div>
          <p className={`text-base font-display font-bold ${displayTax ? 'text-emerald-400' : 'text-muted-foreground text-xs font-normal'}`}>
            {fmtMoney(displayTax) || 'No data yet'}
          </p>
        </div>

        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3 h-3 text-cyan-400" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Gain</p>
          </div>
          <p className={`text-base font-display font-bold ${displayProfit ? 'text-cyan-400' : 'text-muted-foreground text-xs font-normal'}`}>
            {fmtMoney(displayProfit) || 'No data yet'}
          </p>
        </div>

        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3 h-3 text-accent" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cash Flow</p>
          </div>
          <p className={`text-base font-display font-bold ${displayCashFlow ? 'text-accent' : 'text-muted-foreground text-xs font-normal'}`}>
            {fmtMoney(displayCashFlow) || 'No data yet'}
          </p>
        </div>
      </div>

      {/* Verification Rate Bar */}
      {totalWins > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Verification Rate</span>
            <span>{verifiedWins}/{totalWins} wins verified</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${verificationRate || 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}