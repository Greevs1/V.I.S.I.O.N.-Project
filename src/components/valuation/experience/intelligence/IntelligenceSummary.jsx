/**
 * IntelligenceSummary — top-of-workspace aggregate metrics + completion %.
 * Shows real counts from the intelligence engine. No fabricated values.
 */
import React from 'react';
import { Database, CheckCircle2, ShieldCheck, Users, TrendingUp, AlertTriangle, FileQuestion, Clock, FileText, ClipboardCheck } from 'lucide-react';

export default function IntelligenceSummary({ summary }) {
  if (!summary) return null;
  const metrics = [
    { label: 'Data Points', value: summary.total_data_points, icon: Database, color: '#00D4FF' },
    { label: 'Auto-Populated', value: summary.auto_populated, icon: TrendingUp, color: '#A855F7' },
    { label: 'Advisor Verified', value: summary.advisor_verified, icon: ShieldCheck, color: '#22c55e' },
    { label: 'Client Confirmed', value: summary.client_confirmed, icon: Users, color: '#00D1B2' },
    { label: 'High Confidence', value: summary.high_confidence, icon: CheckCircle2, color: '#22c55e' },
    { label: 'Conflicting', value: summary.conflicting, icon: AlertTriangle, color: '#EF4444' },
    { label: 'Missing', value: summary.missing, icon: FileQuestion, color: '#F59E0B' },
    { label: 'Stale', value: summary.stale, icon: Clock, color: '#6B7280' },
    { label: 'Documents', value: summary.documents_processed, icon: FileText, color: '#00D4FF' },
    { label: 'Assessments', value: summary.assessments_reused, icon: ClipboardCheck, color: '#A855F7' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Intelligence Summary</h3>
          <p className="text-[11px] text-muted-foreground">Everything the platform already knows about this business.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-display font-bold text-gold-gradient">{summary.completion_percentage}%</div>
          <p className="text-[10px] text-muted-foreground">data gathered</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Icon className="w-3.5 h-3.5 mb-1.5" style={{ color: m.color }} />
              <div className="text-lg font-semibold text-foreground">{m.value}</div>
              <div className="text-[10px] text-muted-foreground">{m.label}</div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground italic">
        The system has completed {summary.completion_percentage}% of the valuation data-gathering work. {summary.questions_auto_answered} questions auto-answered from existing data.
      </p>
    </div>
  );
}