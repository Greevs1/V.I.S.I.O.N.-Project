/**
 * AssessmentIntelligence — reuse summary for each assessment type.
 */
import React from 'react';
import { CheckCircle2, Clock, Circle, AlertTriangle } from 'lucide-react';

const STATUS_CFG = {
  completed: { color: '#22c55e', icon: CheckCircle2, label: 'Completed' },
  in_progress: { color: '#F59E0B', icon: Clock, label: 'In Progress' },
  not_started: { color: '#6B7280', icon: Circle, label: 'Not Started' },
};

export default function AssessmentIntelligence({ assessmentIntelligence }) {
  const assessments = assessmentIntelligence || [];
  const reused = assessments.filter((a) => a.completion_status === 'completed').length;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Assessment Intelligence</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{reused} completed assessment(s) reused. Valid answers are not re-asked in the valuation.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {assessments.map((a) => {
          const cfg = STATUS_CFG[a.completion_status] || STATUS_CFG.not_started;
          const Icon = cfg.icon;
          return (
            <div key={a.key} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
                <p className="text-xs font-medium text-foreground flex-1">{a.label}</p>
                {a.stale && <AlertTriangle className="w-3 h-3 text-muted-foreground" />}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{cfg.label}</span>
                {a.completion_status === 'completed' && <span>{a.fields_reused} fields reused</span>}
              </div>
              {a.date && <p className="text-[10px] text-muted-foreground mt-1">{new Date(a.date).toLocaleDateString()}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}