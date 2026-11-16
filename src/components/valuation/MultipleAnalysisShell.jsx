/**
 * MultipleAnalysisShell — Phase 13.2
 *
 * Structured shell for multiple analysis. Does not populate external
 * benchmarks or final multiples yet.
 */
import React from 'react';
import { BarChart3, Lock } from 'lucide-react';

const ADJUSTMENT_FACTORS = [
  { key: 'industry_baseline', label: 'Industry Baseline Multiple', type: 'baseline', editable: false },
  { key: 'size_adjustment', label: 'Size Adjustment', type: 'adjustment' },
  { key: 'growth_adjustment', label: 'Growth Adjustment', type: 'adjustment' },
  { key: 'revenue_quality_adjustment', label: 'Revenue Quality Adjustment', type: 'adjustment' },
  { key: 'customer_concentration_adjustment', label: 'Customer Concentration Adjustment', type: 'adjustment' },
  { key: 'owner_dependency_adjustment', label: 'Owner Dependency Adjustment', type: 'adjustment' },
  { key: 'management_depth_adjustment', label: 'Management Depth Adjustment', type: 'adjustment' },
  { key: 'financial_reporting_adjustment', label: 'Financial Reporting Quality Adjustment', type: 'adjustment' },
  { key: 'transferability_adjustment', label: 'Transferability Adjustment', type: 'adjustment' },
  { key: 'operational_maturity_adjustment', label: 'Operational Maturity Adjustment', type: 'adjustment' },
  { key: 'risk_adjustment', label: 'Risk Adjustment', type: 'adjustment' },
  { key: 'strategic_premium', label: 'Strategic Premium Consideration', type: 'premium' },
];

export default function MultipleAnalysisShell() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Multiple Analysis</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Market multiples and factor adjustments. Benchmarks and final multiples require the Phase 13.3 calculation engine.
      </p>

      {/* Locked Banner */}
      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Lock className="w-5 h-5 text-muted-foreground/60" />
        <div>
          <p className="text-sm font-semibold text-foreground">Pending benchmark and calculation engine</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            External benchmark data and final multiple calculations will be available in Phase 13.3.
          </p>
        </div>
      </div>

      {/* Factor Structure */}
      <div className="space-y-2">
        {ADJUSTMENT_FACTORS.map(factor => (
          <div key={factor.key} className="rounded-lg p-4 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div>
              <p className="text-sm font-medium text-foreground">{factor.label}</p>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-0.5">{factor.type}</p>
            </div>
            <div className="text-right">
              {factor.editable === false ? (
                <span className="text-xs text-muted-foreground/50">Pending benchmark</span>
              ) : (
                <span className="text-xs text-muted-foreground/50">Pending calculation</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Final Multiple */}
      <div className="rounded-xl p-5" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Final Multiple Range</p>
            <p className="text-xs text-muted-foreground mt-1">Low · Mid · High</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-muted-foreground/50">Pending calculation engine</p>
          </div>
        </div>
      </div>
    </div>
  );
}