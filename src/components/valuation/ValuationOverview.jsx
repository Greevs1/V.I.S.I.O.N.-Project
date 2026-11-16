/**
 * ValuationOverview — Phase 13.2 enhanced overview.
 *
 * Displays engagement info, completion metrics, data readiness, and
 * methodology selections. Does not display calculated valuation values.
 */
import React, { useState, useEffect } from 'react';
import ValuationStatusBadge from './ValuationStatusBadge';
import EnterpriseValueTimeline from './EnterpriseValueTimeline';
import CalculationReadinessPanel from './CalculationReadinessPanel';
import { getDataReadiness } from '@/lib/valuationService';
import { calculateCompletion, VALUATION_QUESTIONS } from '@/lib/valuation/questionnaireDefinition';
import { Calculator, FileCheck, Database, Target, Scale, Calendar, User, CheckCircle2, AlertCircle, Lock } from 'lucide-react';

export default function ValuationOverview({ summary }) {
  const { valuation, business, leadAdvisor, latestVersion, versionCount, assignment } = summary || {};
  const [readiness, setReadiness] = useState(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);

  useEffect(() => {
    if (valuation?.business_id) {
      setLoadingReadiness(true);
      getDataReadiness(valuation.business_id)
        .then(r => setReadiness(r))
        .catch(() => setReadiness(null))
        .finally(() => setLoadingReadiness(false));
    }
  }, [valuation?.business_id]);

  // Calculate questionnaire completion (placeholder — answers not yet loaded)
  const completion = calculateCompletion({});

  return (
    <div className="space-y-6">
      {/* Engagement Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard icon={Calculator} label="Valuation Name" value={valuation?.valuation_name || 'Enterprise Value Analysis'} />
        <InfoCard icon={Calculator} label="Business" value={business?.business_name || '—'} />
        <InfoCard icon={Target} label="Engagement Type" value={valuation?.valuation_type?.replace(/_/g, ' ') || 'initial'} />
        <InfoCard icon={Target} label="Valuation Purpose" value={valuation?.valuation_purpose?.replace(/_/g, ' ') || 'Not set'} />
        <InfoCard icon={Scale} label="Standard of Value" value={valuation?.standard_of_value?.replace(/_/g, ' ') || 'Not set'} />
        <InfoCard icon={Scale} label="Valuation Premise" value={valuation?.valuation_premise?.replace(/_/g, ' ') || 'Not set'} />
        <InfoCard icon={Calendar} label="Valuation Date" value={valuation?.valuation_date || 'Not set'} />
        <InfoCard icon={User} label="Lead Advisor" value={leadAdvisor ? `${leadAdvisor.first_name || ''} ${leadAdvisor.last_name || ''}`.trim() || 'Unassigned' : 'Unassigned'} />
      </div>

      {/* Status & Sharing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Lifecycle Status</p>
          <ValuationStatusBadge status={valuation?.status || 'not_started'} size="lg" />
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Client Sharing</p>
          <p className="text-sm font-medium capitalize">{valuation?.client_sharing_status?.replace(/_/g, ' ') || 'not shared'}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Published Versions</p>
          <p className="text-sm font-medium">{versionCount || 0}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Last Updated</p>
          <p className="text-sm font-medium">{valuation?.updated_at ? new Date(valuation.updated_at).toLocaleDateString() : '—'}</p>
        </div>
      </div>

      {/* Completion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CompletionCard
          icon={FileCheck}
          label="Questionnaire Completion"
          percentage={completion.percentage}
          detail={`${completion.answered} of ${completion.required} required`}
        />
        <CompletionCard
          icon={Database}
          label="Financial Normalization"
          percentage={0}
          detail="No periods approved yet"
        />
        <CompletionCard
          icon={Database}
          label="Data Readiness Score"
          percentage={readiness?.overall?.readiness_score ?? 0}
          detail={loadingReadiness ? 'Loading...' : `${readiness?.overall?.available_count || 0} of ${readiness?.overall?.total_count || 0} sources available`}
        />
      </div>

      {/* Missing Critical Information */}
      {readiness?.categories && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Missing Critical Information</p>
          <div className="space-y-1.5">
            {readiness.categories
              .filter(c => c.status === 'missing' || c.status === 'needs_review')
              .flatMap(c => c.missing_requirements?.map((req, i) => (
                <div key={`${c.key}-${i}`} className="flex items-center gap-2 text-xs p-2 rounded" style={{ background: 'rgba(239,68,68,0.04)' }}>
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  <span className="text-muted-foreground">{c.label}: {req}</span>
                </div>
              )))}
            {readiness.categories.filter(c => c.status === 'missing' || c.status === 'needs_review').length === 0 && (
              <p className="text-xs text-accent flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> All critical data sources available</p>
            )}
          </div>
        </div>
      )}

      {/* Methodology Selections */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Methodology Selections</p>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm text-muted-foreground/60">Methodology selection pending engagement setup.</p>
        </div>
      </div>

      {/* Valuation Conclusion Placeholder */}
      <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-muted-foreground/60" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valuation Conclusion</p>
        </div>
        <p className="text-lg font-display font-bold text-muted-foreground/50">Not yet calculated</p>
        <p className="text-xs text-muted-foreground/50 mt-1">
          Enterprise value will be calculated in Phase 13.3 after financial normalization and methodology selection are complete.
        </p>
      </div>

      {/* Phase 13.3C: Calculation Readiness & Staleness */}
      {valuation?.id && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Calculation Readiness</p>
          <CalculationReadinessPanel valuationId={valuation.id} />
        </div>
      )}

      {/* Enterprise Value Timeline (placeholder) */}
      <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <EnterpriseValueTimeline />
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-muted-foreground/60" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</p>
      </div>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}

function CompletionCard({ icon: Icon, label, percentage, detail }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">{label}</p>
      </div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <p className="text-2xl font-display font-bold text-primary">{percentage}%</p>
      </div>
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mb-1.5">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground/60">{detail}</p>
    </div>
  );
}