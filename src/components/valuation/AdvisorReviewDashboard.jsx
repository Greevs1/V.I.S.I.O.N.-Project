/**
 * AdvisorReviewDashboard — Phase 13.2
 *
 * Displays review items that must be resolved before the valuation can be
 * marked ready to publish. The valuation must not be published while
 * critical review items remain.
 */
import React, { useMemo } from 'react';
import { VALUATION_QUESTIONS, getActiveQuestions } from '@/lib/valuation/questionnaireDefinition';
import { AlertTriangle, CheckCircle2, XCircle, FileWarning, ShieldAlert, TrendingUp, BarChart3, GitMerge, Scale, Award, FileCheck, Eye, ShieldCheck } from 'lucide-react';

export default function AdvisorReviewDashboard({ valuation, answers = {}, financials = [], adjustments = [], sections = [], calculationSummary = null, readiness = null }) {
  const reviewItems = useMemo(() => {
    const items = [];

    // 1. Unanswered required questions
    const activeQuestions = getActiveQuestions(answers);
    const unansweredRequired = activeQuestions.filter(q => q.required && (answers[q.question_key] == null || answers[q.question_key] === ''));
    if (unansweredRequired.length > 0) {
      items.push({
        severity: 'critical',
        category: 'Unanswered Required Questions',
        count: unansweredRequired.length,
        details: unansweredRequired.map(q => q.question_text),
        icon: XCircle,
      });
    }

    // 2. Unverified extracted answers
    const unverifiedExtracted = Object.entries(answers)
      .filter(([key, val]) => {
        const q = VALUATION_QUESTIONS.find(qq => qq.question_key === key);
        return q && val?.source_type && val.source_type !== 'advisor_entry' && val?.advisor_verification_status !== 'verified';
      });
    if (unverifiedExtracted.length > 0) {
      items.push({
        severity: 'warning',
        category: 'Unverified Extracted Answers',
        count: unverifiedExtracted.length,
        details: unverifiedExtracted.map(([key]) => {
          const q = VALUATION_QUESTIONS.find(qq => qq.question_key === key);
          return q?.question_text || key;
        }),
        icon: FileWarning,
      });
    }

    // 3. Conflicting data sources (placeholder — requires reconciliation engine)
    items.push({
      severity: 'info',
      category: 'Conflicting Data Sources',
      count: 0,
      details: ['Reconciliation workflow will detect conflicts when multiple sources provide the same field.'],
      icon: AlertTriangle,
    });

    // 4. Unsupported adjustments (proposed but no evidence)
    const unsupportedAdjustments = adjustments.filter(a => a.advisor_approval_status === 'pending' && !a.evidence_source && !a.explanation);
    if (unsupportedAdjustments.length > 0) {
      items.push({
        severity: 'warning',
        category: 'Unsupported Adjustments',
        count: unsupportedAdjustments.length,
        details: unsupportedAdjustments.map(a => `${a.adjustment_type.replace(/_/g, ' ')} — $${a.proposed_amount || 0}`),
        icon: FileWarning,
      });
    }

    // 5. Unapproved financial periods
    const unapprovedPeriods = financials.filter(f => f.advisor_approval_status === 'pending');
    if (unapprovedPeriods.length > 0) {
      items.push({
        severity: 'warning',
        category: 'Unapproved Financial Periods',
        count: unapprovedPeriods.length,
        details: unapprovedPeriods.map(f => f.period_label),
        icon: FileWarning,
      });
    }

    // 6. Missing evidence (questions with suggested_evidence but no answer)
    const missingEvidence = activeQuestions.filter(q => q.suggested_evidence && !answers[q.question_key]);
    if (missingEvidence.length > 0) {
      items.push({
        severity: 'info',
        category: 'Missing Evidence',
        count: missingEvidence.length,
        details: missingEvidence.map(q => `${q.question_text} (suggested: ${q.suggested_evidence})`),
        icon: AlertTriangle,
      });
    }

    // 7. Methodology decisions requiring rationale
    if (!valuation?.valuation_purpose || !valuation?.standard_of_value || !valuation?.valuation_premise) {
      items.push({
        severity: 'critical',
        category: 'Incomplete Engagement Setup',
        count: 1,
        details: ['Valuation purpose, standard of value, and premise must be configured before publishing.'],
        icon: ShieldAlert,
      });
    }

    // 8. Missing disclosures
    items.push({
      severity: 'info',
      category: 'Missing Disclosures',
      count: 1,
      details: ['Client summary disclosures must be completed before publication.'],
      icon: AlertTriangle,
    });

    // 9. Incomplete client summary sections
    items.push({
      severity: 'info',
      category: 'Incomplete Client Summary',
      count: 1,
      details: ['Client summary sections must be completed and reviewed before sharing.'],
      icon: AlertTriangle,
    });

    return items;
  }, [valuation, answers, financials, adjustments, sections]);

  const criticalCount = reviewItems.filter(i => i.severity === 'critical').length;
  const warningCount = reviewItems.filter(i => i.severity === 'warning').length;
  const canPublish = criticalCount === 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Advisor Review Dashboard</h3>
        <p className="text-xs text-muted-foreground mt-1">
          The valuation cannot be marked ready to publish while critical review items remain.
        </p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-xl p-4 flex items-center gap-3 ${canPublish ? '' : ''}`}
        style={{
          background: canPublish ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${canPublish ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}
      >
        {canPublish ? (
          <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
        ) : (
          <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
        )}
        <div>
          <p className={`text-sm font-semibold ${canPublish ? 'text-accent' : 'text-destructive'}`}>
            {canPublish ? 'Ready for Publication Review' : `${criticalCount} Critical Issue${criticalCount !== 1 ? 's' : ''} Blocking Publication`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {warningCount} warning{warningCount !== 1 ? 's' : ''} · {reviewItems.length} total review item{reviewItems.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Review Items */}
      <div className="space-y-3">
        {reviewItems.map((item, idx) => (
          <ReviewItem key={idx} item={item} />
        ))}
      </div>

      {/* Phase 13.3D: Calculation Review Hierarchy */}
      {calculationSummary && (
        <CalculationReviewHierarchy summary={calculationSummary} readiness={readiness} />
      )}

      {/* Publish Gate */}
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs text-muted-foreground">
          {canPublish
            ? 'All critical review items resolved. Advisor may proceed to publication review.'
            : 'Resolve all critical review items before marking this valuation ready to publish.'}
        </p>
      </div>
    </div>
  );
}

function CalculationReviewHierarchy({ summary, readiness }) {
  const calcs = summary?.calculations || [];
  const blendedRecon = calcs.find(c => c.calculation_type === 'reconciliation' && c.methodology === 'blended' && !c.superseded_by_calculation_id && c.is_approved);
  const equityBridge = calcs.find(c => c.calculation_type === 'reconciliation' && c.methodology === 'equity_bridge' && !c.superseded_by_calculation_id && c.is_approved);
  const overallConfidence = (summary?.confidence_scores || []).find(c => c.is_overall);
  const conclusion = (summary?.conclusions || [])[0];
  const normEarnings = calcs.find(c => c.methodology === 'normalized_earnings' && !c.superseded_by_calculation_id);
  const methodResults = calcs.filter(c => ['ebitda_multiple', 'sde_multiple', 'revenue_multiple', 'dcf', 'capitalization_of_earnings', 'adjusted_net_asset'].includes(c.calculation_type) && !c.superseded_by_calculation_id);

  const steps = [
    { num: 1, label: 'Maintainable Earnings', icon: TrendingUp, status: normEarnings ? 'approved' : 'missing', detail: normEarnings ? `$${Math.round(normEarnings.normalized_earnings || 0).toLocaleString()}` : 'Not calculated' },
    { num: 2, label: 'Method Results', icon: BarChart3, status: methodResults.length > 0 ? 'approved' : 'missing', detail: `${methodResults.length} method(s)` },
    { num: 3, label: 'Blended Enterprise Value', icon: GitMerge, status: blendedRecon ? (blendedRecon.is_approved ? 'approved' : 'pending') : 'missing', detail: blendedRecon ? `$${Math.round(blendedRecon.enterprise_value_mid || 0).toLocaleString()}` : 'Not reconciled' },
    { num: 4, label: 'Equity Bridge', icon: Scale, status: equityBridge ? (equityBridge.is_approved ? 'approved' : 'pending') : 'missing', detail: equityBridge ? `$${Math.round(equityBridge.equity_value_mid || 0).toLocaleString()}` : 'Not bridged' },
    { num: 5, label: 'Confidence', icon: Award, status: overallConfidence ? 'approved' : 'missing', detail: overallConfidence ? `${overallConfidence.score}%` : 'Not scored' },
    { num: 6, label: 'Advisor Conclusion', icon: FileCheck, status: conclusion ? (conclusion.advisor_approved ? 'approved' : 'pending') : 'missing', detail: conclusion ? (conclusion.advisor_approved ? 'Approved' : 'Pending') : 'Not set' },
    { num: 7, label: 'Client-safe Output', icon: Eye, status: 'info', detail: 'Snapshot constructed on publish' },
    { num: 8, label: 'Publication Readiness', icon: ShieldCheck, status: readiness?.ready ? 'approved' : 'blocked', detail: readiness?.ready ? 'Ready' : `${readiness?.critical_blockers?.length || 0} blocker(s)` },
  ];

  const statusColors = {
    approved: { color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)' },
    pending: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
    missing: { color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
    blocked: { color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
    info: { color: '#6B7280', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.15)' },
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Calculation Review Hierarchy</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          The advisor review flow follows this 8-step sequence. Each step must be completed before publication.
        </p>
      </div>
      <div className="space-y-2">
        {steps.map((step) => {
          const sc = statusColors[step.status] || statusColors.info;
          const Icon = step.icon;
          return (
            <div key={step.num} className="rounded-lg p-3 flex items-center gap-3" style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: `${sc.color}20`, color: sc.color, border: `1px solid ${sc.color}40` }}>
                {step.num}
              </div>
              <Icon className="w-4 h-4 shrink-0" style={{ color: sc.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{step.label}</p>
                <p className="text-[10px] text-muted-foreground">{step.detail}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: sc.color }}>
                {step.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewItem({ item }) {
  const { icon: Icon, severity, category, count, details = [] } = item;
  const colors = {
    critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)' },
    warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
    info: { color: '#6B7280', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.15)' },
  };
  const c = colors[severity] || colors.info;
  return (
    <div className="rounded-lg p-4" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-foreground">{category}</p>
            <span className="text-xs font-bold" style={{ color: c.color }}>{count}</span>
          </div>
          {details.length > 0 && details.length <= 5 && (
            <ul className="space-y-0.5">
              {details.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground truncate">• {d}</li>
              ))}
            </ul>
          )}
          {details.length > 5 && (
            <p className="text-xs text-muted-foreground">{details.length} items requiring review</p>
          )}
        </div>
      </div>
    </div>
  );
}