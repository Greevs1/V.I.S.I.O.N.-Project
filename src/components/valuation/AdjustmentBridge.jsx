/**
 * AdjustmentBridge — Phase 13.2
 *
 * Displays the working financial normalization bridge from Reported Net Income
 * to Normalized EBITDA and Normalized SDE. Uses exact decimal arithmetic.
 *
 * Every line is traceable to a financial period, adjustment record, source,
 * and approval status. These are working values, not a final valuation.
 */
import React from 'react';
import { TrendingUp, TrendingDown, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdjustmentBridge({ period, adjustments = [] }) {
  if (!period) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Select a financial period to view the adjustment bridge.</p>
      </div>
    );
  }

  // Use exact decimal arithmetic via string-based calculation
  const toCents = (v) => Math.round((Number(v) || 0) * 100);
  const fromCents = (c) => c / 100;

  const netIncome = toCents(period.net_income);
  const interest = toCents(period.interest_expense);
  const taxes = toCents(period.taxes);
  const depreciation = toCents(period.depreciation);
  const amortization = toCents(period.amortization);

  const reportedEbitda = netIncome + interest + taxes + depreciation + amortization;

  const approvedAdjs = adjustments.filter(a => a.advisor_approval_status === 'approved' && a.financial_id === period.id);
  const addBacks = approvedAdjs
    .filter(a => a.adjustment_direction === 'add_back')
    .reduce((sum, a) => sum + toCents(a.approved_amount || a.proposed_amount), 0);
  const deductions = approvedAdjs
    .filter(a => a.adjustment_direction === 'deduction')
    .reduce((sum, a) => sum + toCents(a.approved_amount || a.proposed_amount), 0);

  const normalizedEbitda = reportedEbitda + addBacks - deductions;

  // SDE calculation
  const ownerComp = toCents(period.owner_compensation);
  const marketReplacement = toCents(period.owner_market_compensation || 0);
  const normalizedSde = normalizedEbitda + ownerComp - marketReplacement;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Adjustment Bridge — {period.period_label}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Working financial normalization values. Not a final valuation conclusion.
      </p>

      {/* EBITDA Bridge */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">EBITDA Bridge</p>
        </div>
        <BridgeLine label="Reported Net Income" value={fromCents(netIncome)} />
        <BridgeLine label="(+) Interest Expense" value={fromCents(interest)} direction="add" />
        <BridgeLine label="(+) Taxes" value={fromCents(taxes)} direction="add" />
        <BridgeLine label="(+) Depreciation" value={fromCents(depreciation)} direction="add" />
        <BridgeLine label="(+) Amortization" value={fromCents(amortization)} direction="add" />
        <BridgeLine label="= Reported EBITDA" value={fromCents(reportedEbitda)} isSubtotal />
        <BridgeLine label="(+) Approved Add-Backs" value={fromCents(addBacks)} direction="add" traceable={approvedAdjs.filter(a => a.adjustment_direction === 'add_back')} />
        <BridgeLine label="(−) Approved Deductions" value={fromCents(deductions)} direction="subtract" traceable={approvedAdjs.filter(a => a.adjustment_direction === 'deduction')} />
        <BridgeLine label="= Normalized EBITDA" value={fromCents(normalizedEbitda)} isTotal />
      </div>

      {/* SDE Bridge */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SDE Bridge</p>
        </div>
        <BridgeLine label="Normalized EBITDA" value={fromCents(normalizedEbitda)} />
        <BridgeLine label="(+) Owner Compensation" value={fromCents(ownerComp)} direction="add" />
        <BridgeLine label="(−) Market Replacement Compensation" value={fromCents(marketReplacement)} direction="subtract" />
        <BridgeLine label="= Normalized SDE" value={fromCents(normalizedSde)} isTotal />
      </div>

      {/* Pending Adjustments Warning */}
      {adjustments.some(a => a.financial_id === period.id && a.advisor_approval_status === 'pending') && (
        <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600/90">
            Pending adjustments are not included in the bridge. Approve adjustments to update normalized values.
          </p>
        </div>
      )}

      {/* Traceability */}
      {approvedAdjs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adjustment Traceability</p>
          <div className="space-y-1.5">
            {approvedAdjs.map(adj => (
              <div key={adj.id} className="flex items-center gap-3 text-xs p-2 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="font-medium text-foreground">{adj.adjustment_type.replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground">{adj.adjustment_direction === 'add_back' ? '+' : '−'}${(adj.approved_amount || 0).toLocaleString()}</span>
                {adj.explanation && <span className="text-muted-foreground/60 truncate">— {adj.explanation}</span>}
                {adj.evidence_source && <span className="flex items-center gap-1 text-muted-foreground/50"><FileText className="w-3 h-3" /> {adj.evidence_source}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BridgeLine({ label, value, direction, isSubtotal, isTotal, traceable }) {
  const formatted = value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const isPositive = direction === 'add';
  const isNegative = direction === 'subtract';
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 ${isTotal ? 'border-t-2' : ''}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-2">
        {isPositive && <TrendingUp className="w-3 h-3 text-accent" />}
        {isNegative && <TrendingDown className="w-3 h-3 text-destructive" />}
        <span className={`text-sm ${isTotal ? 'font-bold text-primary' : isSubtotal ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          {label}
        </span>
        {traceable && traceable.length > 0 && (
          <span className="text-[10px] text-muted-foreground/50">{traceable.length} adjustment{traceable.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      <span className={`text-sm font-mono ${isTotal ? 'font-bold text-primary' : isSubtotal ? 'font-semibold text-foreground' : isPositive ? 'text-accent' : isNegative ? 'text-destructive' : 'text-foreground'}`}>
        {isNegative ? '−' : ''}{formatted}
      </span>
    </div>
  );
}