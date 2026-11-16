import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Save, Info, AlertTriangle, CheckCircle, Target, DollarSign, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useBusinessContext } from '@/lib/BusinessContext';

/**
 * Freedom Scenario Builder™
 * Interactive strategic planning engine for modeling "what-if" scenarios
 */
export default function DynamicScenarioBuilder({ metricsData, assessmentSummary, membershipStatus, bis }) {
  const { context: bizCtx } = useBusinessContext();
  const m = metricsData || {};
  const as = assessmentSummary || {};
  const r = bis?._raw || {};

  // Load baseline from Freedom Engine for auth users (non-fatal, BIS is fallback)
  const [engineBaseline, setEngineBaseline] = useState(null);
  useEffect(() => {
    if (bis?.isGuest) return; // guests skip backend call
    base44.functions.invoke('calculateFreedomPaths', {
      businessId: bizCtx.active_business_id,
    }).then(res => {
      if (res.data?.inputData) setEngineBaseline(res.data.inputData);
    }).catch(() => {});
  }, [bizCtx.active_business_id, bis?.isGuest]); // eslint-disable-line react-hooks/exhaustive-deps

  // BIS is canonical source; engine baseline enhances when available
  // No hardcoded fallbacks — null when data is missing
  const currentRevenue = engineBaseline?.revenue?.value || r.revenue || m.revenue || as?.revenue || null;
  const currentNetProfit = m.net_profit || as?.net_profit || null;
  const currentEBITDAMargin = m.net_profit_margin || as?.net_profit_margin || null;
  const currentBusinessValue = engineBaseline?.currentBusinessValue?.value || r.current_value || m.enterprise_value || as?.current_business_value || null;
  const currentSavingsRate = as?.annual_savings || (r.monthly_take_home ? r.monthly_take_home * 12 * 0.15 : null);

  // Gap data — BIS first (canonical), then engine baseline, then raw props
  const profitGap = r.profit_gap_amount || engineBaseline?.profitImprovements?.value || as?.profit_gap_amount || m.profit_gap?.gap_to_best || 0;
  const taxGap = r.tax_gap_annual || engineBaseline?.taxSavings?.value || as?.tax_gap_annual || m.tax_gap?.annual_overpayment || 0;
  const valueGap = r.value_gap_amount || engineBaseline?.exitValueImprovements?.value || as?.value_gap_amount || m.value_gap?.gap_amount || 0;

  const [inputs, setInputs] = useState({
    exitTimeline: 7,
    retirementIncome: 15000,
    businessMultiple: 4.5,
    savingsContribution: currentSavingsRate,
    revenueGrowthRate: 15,
    ebitdaImprovement: 5,
    taxSavingsCaptured: 50,
    valueGapClosure: 30,
    profitGapClosure: 25,
    showAssumptions: false
  });

  const [savedScenarios, setSavedScenarios] = useState([]);
  const [confidenceLevel, setConfidenceLevel] = useState('MEDIUM');

  // Calculate confidence based on data completeness
  useEffect(() => {
    let score = 0;
    if (m.revenue) score += 20;
    if (m.net_profit) score += 20;
    if (m.enterprise_value) score += 15;
    if (as?.profit_gap_amount) score += 15;
    if (as?.tax_gap_annual) score += 15;
    if (as?.operations_score) score += 15;

    if (score >= 80) setConfidenceLevel('HIGH');else
    if (score >= 50) setConfidenceLevel('MEDIUM');else
    setConfidenceLevel('LOW');
  }, [m, as]);

  // Calculate outcomes based on user-adjusted assumptions
  const outcomes = useMemo(() => {
    const {
      exitTimeline,
      retirementIncome,
      businessMultiple,
      savingsContribution,
      revenueGrowthRate,
      ebitdaImprovement,
      taxSavingsCaptured,
      valueGapClosure,
      profitGapClosure
    } = inputs;

    // Freedom Number (4% rule)
    const freedomNumber = retirementIncome * 12 * 25;

    // Revenue projection with growth
    const futureRevenue = currentRevenue * Math.pow(1 + revenueGrowthRate / 100, exitTimeline);

    // EBITDA margin improvement
    const improvedEBITDAMargin = currentEBITDAMargin + ebitdaImprovement;
    const futureEBITDA = futureRevenue * (improvedEBITDAMargin / 100);

    // Business value with multiple expansion
    const futureBusinessValue = futureRevenue * businessMultiple;

    // Profit gap closure impact
    const profitImprovement = profitGap * (profitGapClosure / 100);

    // Tax savings captured
    const annualTaxSavings = taxGap * (taxSavingsCaptured / 100);

    // Value gap closure
    const valueCreated = valueGap * (valueGapClosure / 100);

    // Total wealth at exit
    const totalSavingsGrowth = (savingsContribution + annualTaxSavings + profitImprovement) * exitTimeline * Math.pow(1.06, exitTimeline);
    const projectedNetWorth = futureBusinessValue + totalSavingsGrowth + valueCreated;

    // Monthly Freedom Income (4% withdrawal)
    const monthlyFreedomIncome = projectedNetWorth * 0.04 / 12;

    // Freedom Readiness %
    const freedomReadiness = projectedNetWorth / freedomNumber * 100;

    // V.I.S.I.O.N. ROI — engagement cost from billing data, not hardcoded
    const totalValueCreated = valueCreated + profitImprovement + annualTaxSavings * exitTimeline;
    const engagementCost = null; // No hardcoded cost — ROI shows "—" until billing integration
    const visionROIScore = engagementCost > 0 ? totalValueCreated / engagementCost : null;

    // Additional value created vs. baseline
    const baselineNetWorth = currentBusinessValue + currentSavingsRate * exitTimeline;
    const additionalValueCreated = projectedNetWorth - baselineNetWorth;

    return {
      freedomNumber,
      futureRevenue,
      futureEBITDA,
      futureBusinessValue,
      projectedNetWorth,
      monthlyFreedomIncome,
      freedomReadiness,
      visionROIScore,
      totalValueCreated,
      additionalValueCreated,
      profitImprovement,
      annualTaxSavings,
      valueCreated
    };
  }, [inputs, currentRevenue, currentEBITDAMargin, currentBusinessValue, currentSavingsRate, profitGap, taxGap, valueGap]);

  const formatCurrency = (n) => {
    if (!n || isNaN(n)) return '$0';
    const absN = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (absN >= 1_000_000) return `${sign}$${(absN / 1_000_000).toFixed(1)}M`;
    if (absN >= 1000) return `${sign}$${Math.round(absN / 1000).toLocaleString()}K`;
    return `${sign}$${Math.round(absN).toLocaleString()}`;
  };

  const formatPercent = (n) => `${n.toFixed(1)}%`;

  const getReadinessColor = (readiness) => {
    if (readiness >= 100) return { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', text: '#10B981' };
    if (readiness >= 75) return { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#3B82F6' };
    if (readiness >= 50) return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#F59E0B' };
    return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#EF4444' };
  };

  const getConfidenceColor = (level) => {
    if (level === 'HIGH') return { bg: 'rgba(16,185,129,0.15)', text: '#10B981' };
    if (level === 'MEDIUM') return { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' };
    return { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' };
  };

  const handleSliderChange = (field, value) => {
    setInputs((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleInputChange = (field, value) => {
    const numericValue = parseFloat(value.replace(/,/g, '')) || 0;
    setInputs((prev) => ({ ...prev, [field]: numericValue }));
  };

  const handleSaveScenario = () => {
    const scenario = {
      id: Date.now(),
      name: `Scenario ${savedScenarios.length + 1}`,
      inputs: { ...inputs },
      outcomes: { ...outcomes },
      savedAt: new Date()
    };
    setSavedScenarios((prev) => [...prev, scenario]);
  };

  const readinessColor = getReadinessColor(outcomes.freedomReadiness);

  return (
    <div
      className="rounded-2xl p-6 md:p-8"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.05) 0%, rgba(0,212,255,0.03) 100%)',
        border: '1px solid rgba(212,168,83,0.2)'
      }}>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,168,83,0.15)' }}>
            <TrendingUp className="w-5 h-5" style={{ color: '#D4A853' }} />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold" style={{ color: '#F5F5F5' }}>
              Freedom Scenario Builder™
            </h3>
            <p className="text-xs" style={{ color: '#9CA3AF' }}>
              Model different strategic scenarios and see their impact on your freedom timeline
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          

          
          <button
            onClick={handleSaveScenario}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors hover:bg-primary/10"
            style={{ borderColor: 'rgba(212,168,83,0.3)', color: '#D4A853', background: 'transparent' }}>
            
            <Save className="w-4 h-4" />
            Save Scenario
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Strategic Levers */}
        <div className="space-y-5">
          {/* Exit Timeline */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Exit Timeline</label>
              <div className="flex items-center gap-2">
                <input type="text" value={inputs.exitTimeline} onChange={(e) => handleInputChange('exitTimeline', e.target.value)} className="w-14 px-2 py-1 text-right text-sm font-semibold rounded bg-white/5 border border-white/10 focus:border-primary focus:outline-none" style={{ color: '#D4A853' }} />
                <span className="text-xs text-muted-foreground">Years</span>
              </div>
            </div>
            <input type="range" min="1" max="20" step="1" value={inputs.exitTimeline} onChange={(e) => handleSliderChange('exitTimeline', e.target.value)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #D4A853 0%, #D4A853 ${(inputs.exitTimeline - 1) / 19 * 100}%, #1F1F1F ${(inputs.exitTimeline - 1) / 19 * 100}%, #1F1F1F 100%)` }} />
          </div>

          {/* Target Retirement Income */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Target Retirement Income</label>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#D4A853' }}>$</span>
                <input type="text" value={inputs.retirementIncome.toLocaleString()} onChange={(e) => handleInputChange('retirementIncome', e.target.value)} className="w-24 px-2 py-1 text-right text-sm font-semibold rounded bg-white/5 border border-white/10 focus:border-primary focus:outline-none" style={{ color: '#D4A853' }} />
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>
            </div>
            <input type="range" min="5000" max="100000" step="1000" value={inputs.retirementIncome} onChange={(e) => handleSliderChange('retirementIncome', e.target.value)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #D4A853 0%, #D4A853 ${(inputs.retirementIncome - 5000) / 95000 * 100}%, #1F1F1F ${(inputs.retirementIncome - 5000) / 95000 * 100}%, #1F1F1F 100%)` }} />
          </div>

          {/* Expected Business Multiple */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Expected Business Multiple</label>
              <div className="flex items-center gap-2">
                <input type="text" value={inputs.businessMultiple.toFixed(1)} onChange={(e) => handleInputChange('businessMultiple', e.target.value)} className="w-14 px-2 py-1 text-right text-sm font-semibold rounded bg-white/5 border border-white/10 focus:border-primary focus:outline-none" style={{ color: '#D4A853' }} />
                <span className="text-xs text-muted-foreground">x</span>
              </div>
            </div>
            <input type="range" min="1" max="12" step="0.1" value={inputs.businessMultiple} onChange={(e) => handleSliderChange('businessMultiple', e.target.value)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #D4A853 0%, #D4A853 ${(inputs.businessMultiple - 1) / 11 * 100}%, #1F1F1F ${(inputs.businessMultiple - 1) / 11 * 100}%, #1F1F1F 100%)` }} />
          </div>

          {/* Revenue Growth Rate */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Annual Revenue Growth</label>
              <div className="flex items-center gap-2">
                <input type="text" value={inputs.revenueGrowthRate.toFixed(1)} onChange={(e) => handleInputChange('revenueGrowthRate', e.target.value)} className="w-14 px-2 py-1 text-right text-sm font-semibold rounded bg-white/5 border border-white/10 focus:border-primary focus:outline-none" style={{ color: '#D4A853' }} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <input type="range" min="0" max="50" step="1" value={inputs.revenueGrowthRate} onChange={(e) => handleSliderChange('revenueGrowthRate', e.target.value)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #D4A853 0%, #D4A853 ${inputs.revenueGrowthRate / 50 * 100}%, #1F1F1F ${inputs.revenueGrowthRate / 50 * 100}%, #1F1F1F 100%)` }} />
          </div>

          {/* EBITDA Margin Improvement */}
          








          

          {/* Profit Gap Closure */}
          








          

          {/* Tax Savings Captured */}
          








          

          {/* Assumptions Toggle */}
          <button onClick={() => setInputs((prev) => ({ ...prev, showAssumptions: !prev.showAssumptions }))} className="flex items-center gap-2 text-xs font-medium transition-colors" style={{ color: '#9CA3AF' }}>
            <Info className="w-3.5 h-3.5" />
            {inputs.showAssumptions ? 'Hide' : 'Show'} Scenario Assumptions
          </button>

          {inputs.showAssumptions &&
          <div className="rounded-xl p-4 text-xs space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Current Revenue</span><span style={{ color: '#F5F5F5' }}>{formatCurrency(currentRevenue)}</span></div>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Current Business Value</span><span style={{ color: '#F5F5F5' }}>{formatCurrency(currentBusinessValue)}</span></div>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Profit Gap</span><span style={{ color: '#F5F5F5' }}>{formatCurrency(profitGap)}</span></div>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Tax Gap</span><span style={{ color: '#F5F5F5' }}>{formatCurrency(taxGap)}/yr</span></div>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Value Gap</span><span style={{ color: '#F5F5F5' }}>{formatCurrency(valueGap)}</span></div>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Growth Rate</span><span style={{ color: '#F5F5F5' }}>6% annually</span></div>
              <div className="flex justify-between"><span style={{ color: '#9CA3AF' }}>Withdrawal Rate</span><span style={{ color: '#F5F5F5' }}>4% rule</span></div>
            </div>
          }
        </div>

        {/* Right: Outcomes */}
        <div className="space-y-4">
          {/* Freedom Readiness Card */}
          <div className="rounded-xl p-6 border" style={{ background: readinessColor.bg, borderColor: readinessColor.border }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5" style={{ color: readinessColor.text }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: readinessColor.text }}>Freedom Readiness</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: readinessColor.border, color: readinessColor.text }}>
                {outcomes.freedomReadiness >= 100 ? <CheckCircle className="w-3 h-3" /> : outcomes.freedomReadiness >= 75 ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {outcomes.freedomReadiness >= 100 ? 'READY' : outcomes.freedomReadiness >= 75 ? 'ON TRACK' : outcomes.freedomReadiness >= 50 ? 'PROGRESS' : 'NEEDS WORK'}
              </div>
            </div>
            <p className="text-5xl font-display font-bold mb-2" style={{ color: readinessColor.text }}>
              {outcomes.freedomReadiness.toFixed(0)}%
            </p>
            <p className="text-sm mb-4" style={{ color: readinessColor.text }}>
              Projected Net Worth: <span className="font-bold">{formatCurrency(outcomes.projectedNetWorth)}</span>
            </p>
            <div className="border-t pt-4" style={{ borderColor: readinessColor.border }}>
              <p className="text-xs text-center" style={{ color: readinessColor.text }}>
                {outcomes.freedomReadiness >= 100 ? 'You are projected to exceed your freedom goal' : outcomes.freedomReadiness >= 75 ? 'You are on track to reach financial freedom' : 'Adjust your strategy to accelerate your freedom timeline'}
              </p>
            </div>
          </div>

          {/* Key Outcomes Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Monthly Freedom Income */}
            <div className="rounded-xl p-4 border" style={{ background: '#0D0D10', borderColor: '#24242A' }}>
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-3.5 h-3.5" style={{ color: '#D4A853' }} />
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Monthly Freedom Income</p>
              </div>
              <p className="text-2xl font-display font-bold" style={{ color: '#D4A853' }}>{formatCurrency(outcomes.monthlyFreedomIncome)}/mo</p>
            </div>

            {/* Additional Value Created */}
            <div className="rounded-xl p-4 border" style={{ background: '#0D0D10', borderColor: '#24242A' }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: '#3B82F6' }} />
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Additional Value Created</p>
              </div>
              <p className="text-2xl font-display font-bold" style={{ color: '#3B82F6' }}>{formatCurrency(outcomes.additionalValueCreated)}</p>
            </div>

            {/* Future Business Value */}
            <div className="rounded-xl p-4 border" style={{ background: '#0D0D10', borderColor: '#24242A' }}>
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Future Business Value</p>
              </div>
              <p className="text-2xl font-display font-bold" style={{ color: '#10B981' }}>{formatCurrency(outcomes.futureBusinessValue)}</p>
            </div>

            {/* V.I.S.I.O.N. ROI Score */}
            <div className="rounded-xl p-4 border" style={{ background: '#0D0D10', borderColor: '#24242A' }}>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5" style={{ color: '#8B5CF6' }} />
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>V.I.S.I.O.N. ROI Score™</p>
              </div>
              <p className="text-2xl font-display font-bold" style={{ color: '#8B5CF6' }}>{outcomes.visionROIScore != null ? `${outcomes.visionROIScore.toFixed(1)}x` : '—'}</p>
            </div>
          </div>

          {/* Value Breakdown */}
          
























          
        </div>
      </div>
    </div>);

}