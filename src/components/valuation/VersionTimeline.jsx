/**
 * VersionTimeline — reads from valuation_audit_log (never hardcoded).
 * Displays every valuation event in reverse chronological order.
 */
import React, { useEffect, useState } from 'react';
import { getValuationAuditLog } from '@/lib/valuationService';
import { RefreshCw } from 'lucide-react';

const ACTION_LABELS = {
  valuation_created: { label: 'Valuation Created', color: '#D4A853' },
  status_changed: { label: 'Status Updated', color: '#6B7280' },
  advisor_assigned: { label: 'Advisor Assigned', color: '#3B82F6' },
  assignment_updated: { label: 'Assignment Updated', color: '#6B7280' },
  advisor_removed: { label: 'Advisor Removed', color: '#EF4444' },
  answer_saved: { label: 'Question Answered', color: '#8B5CF6' },
  financial_saved: { label: 'Financials Imported', color: '#10B981' },
  adjustment_saved: { label: 'Adjustment Added', color: '#F59E0B' },
  multiple_factor_saved: { label: 'Multiple Factor Set', color: '#06B6D4' },
  scenario_saved: { label: 'Scenario Created', color: '#8B5CF6' },
  version_published: { label: 'Version Published', color: '#D4A853' },
  valuation_shared: { label: 'Shared with Client', color: '#10B981' },
  access_revoked: { label: 'Access Revoked', color: '#EF4444' },
  valuation_archived: { label: 'Archived', color: '#6B7280' },
  valuation_restored: { label: 'Restored', color: '#10B981' },
};

export default function VersionTimeline({ valuationId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!valuationId) return;
    setLoading(true);
    try {
      const res = await getValuationAuditLog(valuationId);
      setLogs(res.logs || []);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [valuationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No activity yet. Events will appear here as the valuation progresses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">Activity Timeline</p>
        <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="relative pl-6" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        {logs.map((log) => {
          const cfg = ACTION_LABELS[log.action_type] || { label: log.action_type, color: '#6B7280' };
          return (
            <div key={log.id} className="relative pb-5">
              <span
                className="absolute -left-[27px] top-1 w-2.5 h-2.5 rounded-full ring-4"
                style={{ background: cfg.color, boxShadow: `0 0 0 4px rgba(8,9,11,1)` }}
              />
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium" style={{ color: cfg.color }}>{cfg.label}</p>
                <span className="text-[11px] text-muted-foreground/50">·</span>
                <p className="text-[11px] text-muted-foreground/60">
                  {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              {log.actor?.full_name && (
                <p className="text-[11px] text-muted-foreground/50">by {log.actor.full_name}</p>
              )}
              {log.new_value && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {JSON.stringify(log.new_value).slice(0, 120)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}