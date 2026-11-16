import React from 'react';
import GapValidationBreakdown from '@/components/dashboard/GapValidationBreakdown';
import GalileoCardInsight from '@/components/dashboard/GalileoCardInsight';

/**
 * Impact Quotient™ Hero Section — BIS-driven, universal.
 * Same rendering for guest, member, advisor, admin.
 */
export default function IQHeroSection({ iqScore, bis }) {
  const r = bis?._raw || {};
  const as = bis?._sources?.assessmentSummary || {};

  const profitGap = r.profit_gap_amount || 0;
  const taxGap = r.tax_gap_annual || 0;
  const valueGap = r.value_gap_amount || 0;
  const opsGap = r.monthly_value_of_time_freed || 0;
  const totalUncaptured = profitGap + taxGap + valueGap + opsGap;

  const formatCurrency = (n, suffix = '') => {
    if (!n || n === 0) return '$0' + suffix;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M${suffix}`;
    return `$${Math.round(n).toLocaleString('en-US')}${suffix}`;
  };

  const getIQDescription = (score) => {
    if (score >= 75) return 'Strong Strategic Foundation';
    if (score >= 50) return 'Targeted Improvements Available';
    if (score > 0)   return 'Significant Opportunity Identified';
    return 'Profile Building In Progress';
  };

  const getDynamicSummary = () => {
    const gaps = [];
    if (profitGap > 0) gaps.push(`${formatCurrency(profitGap)} in uncaptured profit`);
    if (valueGap > 0) gaps.push(`${formatCurrency(valueGap)} in transferable value`);
    if (taxGap > 0) gaps.push(`${formatCurrency(taxGap)} in unnecessary taxes`);
    if (opsGap > 0) gaps.push(`${formatCurrency(opsGap)}/mo in owner time value`);

    if (gaps.length === 0) {
      if (r.operations_score != null || as?.derived_iq_score > 0) {
        return 'Your business intelligence profile is ready. Review your gap analysis below.';
      }
      return 'Complete your assessments to uncover hidden value.';
    }

    return `We found ${formatCurrency(totalUncaptured)} across ${gaps.length} measurable, closeable gap${gaps.length !== 1 ? 's' : ''}.`;
  };

  const score = iqScore || 0;
  const description = getIQDescription(score);
  const summary = getDynamicSummary();

  return (
    <div
      className="relative rounded-2xl overflow-hidden p-8 md:p-10"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,212,255,0.06) 100%)',
        border: '1px solid rgba(212,168,83,0.25)'
      }}>

      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-2">
          Your Assessment Results
        </p>
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-3" style={{ color: '#F5F5F5' }}>
          Here's what we found<br />across your business.
        </h1>
      </div>

      {/* IQ Score Display */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative mb-4">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(
                ${score >= 75 ? '#10B981' : score >= 50 ? '#3B82F6' : score > 0 ? '#EF4444' : '#374151'} ${score}%,
                rgba(255,255,255,0.1) ${score}%
              )`
            }}>
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center"
              style={{ background: '#0D0D10' }}>
              <div className="text-center">
                <p className="text-4xl font-display font-bold" style={{ color: '#D4A853' }}>
                  {Math.round(score)}
                </p>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                  IQ Score
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-lg font-medium" style={{ color: '#F5F5F5' }}>
          {description}
        </p>
        <div className="mt-2">
          <GalileoCardInsight cardType="iq_score" bis={bis} iqScore={score} />
        </div>
      </div>

      {/* Dynamic Summary */}
      <div
        className="rounded-xl p-6 mb-2"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
        <div className="flex items-center justify-center gap-3">
          <p className="text-base leading-relaxed text-center" style={{ color: '#F5F5F5' }}>
            {summary}
          </p>
          {totalUncaptured > 0 && (
            <GalileoCardInsight cardType="targeted_improvements" bis={bis} />
          )}
        </div>

        {/* Gap breakdown — universal, always visible when any data exists */}
        <GapValidationBreakdown bis={bis} />
      </div>
    </div>
  );
}