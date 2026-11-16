import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, Clock, Info, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useBusinessContext } from '@/lib/BusinessContext';

/**
 * Path to Freedom Comparison — 3 Path Model
 * Primary source: BusinessIntelligenceState (works for guests + auth users)
 * Secondary source: calculateFreedomPaths backend (auth only, enhances projections)
 */

function buildLocalPaths(bis) {
  const r = bis?._raw || {};
  // No hardcoded fallbacks — use BIS values or null
  const revenue = r.revenue || null;
  const currentValue = r.current_value || null;
  const monthlyTakeHome = r.monthly_take_home || null;
  const hoursWorked = r.hours_worked_per_week || null;
  const profitGap = r.profit_gap_amount || 0;
  const taxGap = r.tax_gap_annual || 0;
  const valueGap = r.value_gap_amount || 0;

  // Freedom number: 4% rule — requires monthlyTakeHome, no hardcoded fallback
  const targetMonthlyIncome = monthlyTakeHome ? monthlyTakeHome * 1.1 : null;
  const freedomNumber = targetMonthlyIncome ? targetMonthlyIncome * 12 * 25 : null;

  // Baseline net worth growth (savings only, no optimization)
  const annualSavings = monthlyTakeHome ? monthlyTakeHome * 12 * 0.15 : 0;
  const baselineGrowthRate = 0.06;

  // Path A: Current trajectory (no optimization)
  const pathA_annualContrib = annualSavings;
  const pathA_years = freedomNumber > 0
    ? Math.max(5, Math.round(Math.log(1 + (freedomNumber * baselineGrowthRate) / pathA_annualContrib) / Math.log(1 + baselineGrowthRate)))
    : 15;

  // Path B: V.I.S.I.O.N. recommended (close 50% of gaps)
  const pathB_annualBoost = (profitGap * 0.5) + (taxGap * 0.6) + (valueGap * 0.02);
  const pathB_annualContrib = pathA_annualContrib + pathB_annualBoost;
  const pathB_years = freedomNumber > 0 && pathB_annualContrib > 0
    ? Math.max(3, Math.round(Math.log(1 + (freedomNumber * baselineGrowthRate) / pathB_annualContrib) / Math.log(1 + baselineGrowthRate)))
    : Math.max(3, pathA_years - 3);

  // Path C: Fully optimized (close 85% of gaps + business sale)
  const pathC_businessValue = currentValue + (valueGap * 0.85);
  const pathC_annualBoost = (profitGap * 0.85) + (taxGap * 0.9) + (pathC_businessValue * 0.01);
  const pathC_annualContrib = pathA_annualContrib + pathC_annualBoost;
  const pathC_years = freedomNumber > 0 && pathC_annualContrib > 0
    ? Math.max(2, Math.round(Math.log(1 + (freedomNumber * baselineGrowthRate) / pathC_annualContrib) / Math.log(1 + baselineGrowthRate)))
    : Math.max(2, pathA_years - 6);

  const currentYear = new Date().getFullYear();
  const fmt = (yrs) => `${currentYear + yrs}`;

  return {
    A: {
      label: 'Current Trajectory',
      freedomDate: fmt(pathA_years),
      yearsToFreedom: pathA_years,
      yearsRecovered: 0,
      additionalNetWorth: null,
      additionalAnnualCashFlow: null,
      additionalBusinessValue: null,
    },
    B: {
      label: 'V.I.S.I.O.N. Recommended',
      freedomDate: fmt(pathB_years),
      yearsToFreedom: pathB_years,
      yearsRecovered: Math.max(0, pathA_years - pathB_years),
      additionalNetWorth: Math.round(pathB_annualBoost * pathB_years * 1.3),
      additionalAnnualCashFlow: Math.round(pathB_annualBoost),
      additionalBusinessValue: Math.round(valueGap * 0.5),
    },
    C: {
      label: 'Fully Optimized',
      freedomDate: fmt(pathC_years),
      yearsToFreedom: pathC_years,
      yearsRecovered: Math.max(0, pathA_years - pathC_years),
      additionalNetWorth: Math.round(pathC_annualBoost * pathC_years * 1.5 + pathC_businessValue * 0.3),
      additionalAnnualCashFlow: Math.round(pathC_annualBoost),
      additionalBusinessValue: Math.round(valueGap * 0.85),
    },
  };
}

export default function PathToFreedom({ metricsData, assessmentSummary, bis }) {
  const { context: bizCtx } = useBusinessContext();
  const [paths, setPaths] = useState(null);
  const [inputData, setInputData] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [isLocalFallback, setIsLocalFallback] = useState(false);

  useEffect(() => {
    const calculatePaths = async () => {
      try {
        setLoading(true);

        // Guests: skip backend call entirely, use BIS local calculation
        if (bis?.isGuest) {
          const localPaths = buildLocalPaths(bis);
          setPaths(localPaths);
          setIsLocalFallback(true);
          return;
        }

        // Authenticated: try backend first
        try {
          const res = await base44.functions.invoke('calculateFreedomPaths', {
            businessId: bizCtx.active_business_id,
          });
          const data = res.data;
          if (data?.paths?.A && data?.paths?.B && data?.paths?.C) {
            setPaths(data.paths);
            setInputData(data.inputData);
            setConfidence(data.confidence);
            return;
          }
        } catch {
          // fall through to BIS fallback
        }

        // Authenticated but backend returned empty — fall back to BIS
        if (bis?._raw) {
          const localPaths = buildLocalPaths(bis);
          setPaths(localPaths);
          setIsLocalFallback(true);
        }
      } catch (error) {
        console.error('[PathToFreedom] Calculation failed:', error);
        // Last resort: try BIS
        if (bis?._raw) {
          const localPaths = buildLocalPaths(bis);
          setPaths(localPaths);
          setIsLocalFallback(true);
        }
      } finally {
        setLoading(false);
      }
    };

    calculatePaths();
  }, [bizCtx.active_business_id, bis?.isGuest]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '—';
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const getPathColor = (pathKey) => {
    if (pathKey === 'A') return { text: '#9CA3AF', bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)' };
    if (pathKey === 'B') return { text: '#D4A853', bg: 'rgba(212,168,83,0.15)', border: 'rgba(212,168,83,0.3)' };
    if (pathKey === 'C') return { text: '#00D4FF', bg: 'rgba(0,212,255,0.15)', border: 'rgba(0,212,255,0.3)' };
    return { text: '#F5F5F5', bg: 'rgba(255,255,255,0.15)', border: 'rgba(255,255,255,0.3)' };
  };

  // No data at all even after load
  const hasMeaningfulData = bis?._raw?.profit_gap_amount > 0 || bis?._raw?.tax_gap_annual > 0
    || bis?._raw?.monthly_take_home > 0 || bis?._raw?.current_value > 0;

  if (loading) {
    return (
      <div className="rounded-2xl p-6 md:p-8" style={{ background: '#0D0D10', border: '1px solid #24242A' }}>
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Partial data state — show helpful message instead of blank
  if (!paths || (!paths.A && !paths.B && !paths.C)) {
    return (
      <div className="rounded-2xl p-6 md:p-8" style={{ background: '#0D0D10', border: '1px solid #24242A' }}>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-primary" />
          <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
            Path to Freedom Comparison
          </p>
        </div>
        <div className="rounded-xl p-5 text-center space-y-2" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <Sparkles className="w-5 h-5 text-primary/50 mx-auto" />
          <p className="text-sm font-medium text-foreground/70">Complete your assessments to unlock your freedom timeline.</p>
          <p className="text-xs text-muted-foreground">Profit Gap, Tax Gap, and Operations assessments give Galileo enough to project your path to financial independence.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 md:p-8" style={{ background: '#0D0D10', border: '1px solid #24242A' }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
            Path to Freedom Comparison
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLocalFallback && (
            <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,168,83,0.1)', color: '#D4A853' }}>
              Estimated projection
            </span>
          )}
          {confidence && confidence.overall < 0.7 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAssumptions(!showAssumptions)}
              className="h-7 px-3 text-xs"
            >
              <Info className="w-3 h-3 mr-1" />
              {Math.round(confidence.overall * 100)}% Data Confidence
            </Button>
          )}
        </div>
      </div>

      {/* Local fallback notice */}
      {isLocalFallback && (
        <div className="mb-5 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.15)', color: '#D4A853' }}>
          <Sparkles className="w-3 h-3 shrink-0" />
          <span>This projection is estimated from your assessment answers. Complete the Freedom Assessment to refine your timeline.</span>
        </div>
      )}

      {/* Assumptions Panel */}
      {showAssumptions && inputData && (
        <div className="mb-6 p-4 rounded-lg border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#D4A853' }}>Data Sources & Assumptions</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {Object.entries(inputData).map(([key, data]) => (
              <div key={key} className="flex justify-between">
                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <span className={data.confidence === 'high' ? 'text-green-400' : 'text-yellow-400'}>
                  {formatCurrency(data.value)} {data.confidence === 'low' && data.assumption ? `(${data.assumption})` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Path Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['A', 'B', 'C'].map((pathKey) => {
          const path = paths[pathKey];
          if (!path) return null;
          const colors = getPathColor(pathKey);

          return (
            <div
              key={pathKey}
              className="rounded-xl p-6"
              style={{
                background: pathKey === 'B'
                  ? 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,212,255,0.06) 100%)'
                  : pathKey === 'C'
                  ? 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(0,255,212,0.06) 100%)'
                  : 'rgba(255,255,255,0.02)',
                border: `1px solid ${pathKey === 'A' ? 'rgba(255,255,255,0.08)' : colors.border}`
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: colors.bg }}>
                  {pathKey === 'A' ? <Clock className="w-5 h-5" style={{ color: colors.text }} /> : <TrendingUp className="w-5 h-5" style={{ color: colors.text }} />}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.text }}>Path {pathKey}</p>
                  <p className="text-xs text-muted-foreground">{path.label}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Freedom Year</p>
                  <p className="text-2xl font-display font-bold" style={{ color: pathKey === 'A' ? '#F5F5F5' : colors.text }}>
                    {path.freedomDate}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Years to Freedom</p>
                  <p className="text-2xl font-display font-bold" style={{ color: pathKey === 'A' ? '#F5F5F5' : colors.text }}>
                    {path.yearsToFreedom} yrs
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Years Recovered</p>
                  <p className="text-2xl font-display font-bold" style={{ color: pathKey === 'A' ? '#F5F5F5' : colors.text }}>
                    {path.yearsRecovered > 0 ? `+${path.yearsRecovered}` : '—'}
                  </p>
                </div>

                {pathKey !== 'A' && (
                  <>
                    {path.additionalNetWorth != null && (
                      <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Additional Net Worth</p>
                        <p className="text-lg font-display font-bold" style={{ color: colors.text }}>
                          {formatCurrency(path.additionalNetWorth)}
                        </p>
                      </div>
                    )}
                    {path.additionalAnnualCashFlow != null && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Additional Cash Flow</p>
                        <p className="text-lg font-display font-bold" style={{ color: colors.text }}>
                          {formatCurrency(path.additionalAnnualCashFlow)}/yr
                        </p>
                      </div>
                    )}
                    {path.additionalBusinessValue != null && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Business Value Impact</p>
                        <p className="text-lg font-display font-bold" style={{ color: colors.text }}>
                          {formatCurrency(path.additionalBusinessValue)}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}