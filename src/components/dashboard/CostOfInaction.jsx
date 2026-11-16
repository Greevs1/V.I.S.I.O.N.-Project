import React from 'react';
import { Clock } from 'lucide-react';

/**
 * Cost of Inaction Section
 * Reference: 1 Year / 5 Years / 10 Years display
 * Shows compounded opportunity cost over time
 */
export default function CostOfInaction({ annualGap, opportunityValue }) {
  const formatCurrency = (n) => {
    if (!n || isNaN(n)) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(n / 1000)}K`;
  };

  // Compounded costs — single calculation path (formula documented, no duplicate in parent)
  const coi1 = annualGap > 0 ? Math.round(annualGap) : null;
  const coi5 = coi1 ? Math.round(coi1 * ((Math.pow(1.06, 5) - 1) / 0.06)) : null;
  const coi10 = coi1 ? Math.round(coi1 * ((Math.pow(1.06, 10) - 1) / 0.06)) : null;

  if (!coi1 && !opportunityValue) return null;

  return (
    <div className="rounded-2xl p-6 md:p-8" style={{ background: '#0D0D10', border: '1px solid #24242A' }}>
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-4 h-4 text-orange-500" />
        <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Cost of Inaction Over Time
        </p>
      </div>

      {/* Time-based Cost Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div 
          className="rounded-xl p-6 text-center"
          style={{ 
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">1 Year</p>
          <p className="text-3xl font-display font-bold" style={{ color: '#F5F5F5' }}>
            {formatCurrency(coi1)}
          </p>
        </div>

        <div 
          className="rounded-xl p-6 text-center"
          style={{ 
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">5 Years</p>
          <p className="text-3xl font-display font-bold" style={{ color: '#F5F5F5' }}>
            {formatCurrency(coi5)}
          </p>
        </div>

        <div 
          className="rounded-xl p-6 text-center"
          style={{ 
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">10 Years</p>
          <p className="text-3xl font-display font-bold" style={{ color: '#F5F5F5' }}>
            {formatCurrency(coi10)}
          </p>
        </div>
      </div>

      {/* Current Opportunity Value */}
      {opportunityValue > 0 && (
        <div 
          className="rounded-xl p-5"
          style={{ 
            background: 'rgba(212,168,83,0.05)',
            border: '1px solid rgba(212,168,83,0.25)'
          }}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Current Opportunity Value
          </p>
          <p className="text-2xl font-display font-bold" style={{ color: '#D4A853' }}>
            {formatCurrency(opportunityValue)}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-4">
        Assumes 6% annual compounding on unrealized savings and missed value creation.
      </p>
    </div>
  );
}