import React from 'react';
import { TrendingUp, Award, DollarSign } from 'lucide-react';

/**
 * V.I.S.I.O.N. ROI Score™ Component
 * Shows measurable return on investment from implementing recommendations
 */
export default function VisionROIScore({ totalInvestment, totalVerifiedValue }) {
  const roiMultiple = totalInvestment > 0 ? (totalVerifiedValue / totalInvestment) : 0;

  const formatCurrency = (n) => {
    if (!n) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  };

  const hasInsufficientData = !totalInvestment || totalInvestment === 0 || totalInvestment == null;

  if (hasInsufficientData) {
    return (
      <div 
        className="rounded-2xl p-8"
        style={{ background: '#0D0D10', border: '1px solid #24242A' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5" style={{ color: '#D4A853' }} />
          <h3 className="text-lg font-display font-bold" style={{ color: '#D4A853' }}>
            V.I.S.I.O.N. ROI SCORE™
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Insufficient billing history to calculate ROI
        </p>
      </div>
    );
  }

  return (
    <div 
      className="rounded-2xl p-8"
      style={{ 
        background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,212,255,0.06) 100%)',
        border: '1px solid rgba(212,168,83,0.25)'
      }}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-5 h-5" style={{ color: '#D4A853' }} />
          <h3 className="text-lg font-display font-bold" style={{ color: '#D4A853' }}>
            V.I.S.I.O.N. ROI SCORE™
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Measures your return on investment — compares platform investment to verified value captured.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Your Investment
          </p>
          <p className="text-3xl font-display font-bold" style={{ color: '#F5F5F5' }}>
            {formatCurrency(totalInvestment)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Total amount paid
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Verified Value Created
          </p>
          <p className="text-3xl font-display font-bold" style={{ color: '#10B981' }}>
            {formatCurrency(totalVerifiedValue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Measurable results
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            ROI
          </p>
          <p className={`text-3xl font-display font-bold ${
            roiMultiple >= 3 ? 'text-emerald-400' : 
            roiMultiple >= 1 ? 'text-primary' : 'text-amber-400'
          }`}>
            {roiMultiple.toFixed(2)}x
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Return on investment
          </p>
        </div>
      </div>
    </div>
  );
}