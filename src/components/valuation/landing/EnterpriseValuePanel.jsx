/**
 * EnterpriseValuePanel — Phase 13.3F.2
 *
 * The primary value panel. Enterprise Value is the headline.
 * Defensible and Potential Value are secondary.
 * Equity Value is visually distinct.
 * Missing values show workflow states, never $0.
 */
import React from 'react';
import { Shield, Calendar, GitBranch, CheckCircle2, Share2 } from 'lucide-react';
import { fmtCurrency, fmtRange } from '@/lib/valuation/valuationState';
import ExplainWithGalileo from '@/components/galileo/explain/ExplainWithGalileo';

function ValueLabel({ label, children }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">{label}</p>
      {children}
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3 h-3 text-muted-foreground/50" />
      <span className="text-[11px] text-muted-foreground">{label}:</span>
      <span className="text-[11px] text-foreground/90 font-medium">{value}</span>
    </div>
  );
}

export default function EnterpriseValuePanel({ currentValue, valuation, summary, isAdvisor, workflowState }) {
  const ev = currentValue?.enterprise_value;
  const defensible = currentValue?.defensible_value;
  const potential = currentValue?.potential_value;
  const equity = currentValue?.equity_value;
  const confidence = currentValue?.overall_confidence;
  const confidenceMax = currentValue?.confidence_max || 100;
  const hasEV = ev?.mid != null || ev?.low != null;
  const hasEquity = equity?.mid != null || equity?.low != null;

  return (
    <div
      className="rounded-2xl p-6 sm:p-8"
      style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.04) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(212,168,83,0.15)' }}
    >
      {/* Enterprise Value — headline */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary/80 mb-2">
          Estimated{' '}
          <ExplainWithGalileo term="enterprise_value" surface="valuation">
            Enterprise Value
          </ExplainWithGalileo>
        </p>
        {hasEV ? (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-display font-bold text-foreground">
                {fmtCurrency(ev.mid)}
              </span>
              {ev.low != null && ev.high != null && (ev.low !== ev.high) && (
                <span className="text-lg text-muted-foreground font-medium">
                  {fmtRange(ev.low, ev.high)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The indicated Enterprise Value based on approved reconciliation of selected methodologies.
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl sm:text-3xl font-display font-bold text-muted-foreground/60">
              {workflowState || 'Valuation not yet calculated'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Complete the valuation workflow to determine Enterprise Value. Missing values are not shown as zero.
            </p>
          </>
        )}
      </div>

      {/* Secondary values */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
        {/* Defensible Value */}
        <ValueLabel label="Defensible Value">
          {defensible != null ? (
            <p className="text-xl font-display font-semibold text-foreground">{fmtCurrency(defensible)}</p>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">Advisor conclusion pending</p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-1">The conservative, defensible opinion of value.</p>
        </ValueLabel>

        {/* Potential Value */}
        <ValueLabel label="Potential Value">
          {potential != null ? (
            <p className="text-xl font-display font-semibold text-foreground">{fmtCurrency(potential)}</p>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">Pending potential conclusion</p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-1">The upside value with identified improvements.</p>
        </ValueLabel>

        {/* Equity Value — distinct */}
        <ValueLabel label="Equity Value">
          {hasEquity ? (
            <p className="text-xl font-display font-semibold text-accent">{fmtCurrency(equity.mid || equity.low)}</p>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">Equity bridge pending</p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-1">Value to shareholders after the equity bridge.</p>
        </ValueLabel>
      </div>

      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 pt-4 border-t border-white/[0.06]">
        {confidence != null && (
          <MetaItem icon={Shield} label="Confidence" value={`${confidence}/${confidenceMax}`} />
        )}
        {currentValue?.valuation_date && (
          <MetaItem icon={Calendar} label="Date" value={new Date(currentValue.valuation_date).toLocaleDateString()} />
        )}
        {currentValue?.current_version && (
          <MetaItem icon={GitBranch} label="Version" value={currentValue.current_version} />
        )}
        <MetaItem
          icon={CheckCircle2}
          label="Conclusion"
          value={currentValue?.hasApprovedValuation ? 'Approved' : 'Pending'}
        />
        <MetaItem
          icon={Share2}
          label="Sharing"
          value={(valuation?.client_sharing_status || 'not_shared').replace(/_/g, ' ')}
        />
      </div>
    </div>
  );
}