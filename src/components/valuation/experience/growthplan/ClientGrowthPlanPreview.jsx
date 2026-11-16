/**
 * ClientGrowthPlanPreview — Phase 13.3E.5
 *
 * Client-safe Growth Plan preview. Shows only advisor-approved and
 * client-visible initiatives. Displays initiative, why it matters, expected
 * business outcome, timeline, responsible party, KPI, status, and next
 * milestone.
 *
 * Does NOT show: internal impact formulas, internal confidence calculations,
 * internal advisor debate, unsupported estimates, internal evidence IDs,
 * hidden risks, or internal notes.
 */
import React from 'react';
import { Eye, Clock, User, Target, CheckCircle } from 'lucide-react';
import { INITIATIVE_STATUSES } from '@/lib/valuation/growthPlanEngine';

export default function ClientGrowthPlanPreview({ initiatives }) {
  const clientInitiatives = initiatives.filter((i) =>
    ['client_visible', 'ready_for_execution', 'sent_to_roadmap', 'sent_to_sprint', 'completed'].includes(i.status)
  );

  if (clientInitiatives.length === 0) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs text-muted-foreground">No client-visible initiatives yet. The advisor will approve initiatives for client review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-accent" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Client Growth Plan Preview</h3>
          <p className="text-[10px] text-muted-foreground">What the client sees — advisor-approved, client-visible initiatives only.</p>
        </div>
      </div>

      {/* Client-safe cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {clientInitiatives.map((init) => {
          const statusMeta = INITIATIVE_STATUSES.find((s) => s.key === init.status) || INITIATIVE_STATUSES[0];
          return (
            <div
              key={init.initiative_id}
              className="rounded-xl p-3.5"
              style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.12)' }}
            >
              <p className="text-sm font-semibold text-foreground">{init.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{init.summary || init.why_it_matters}</p>

              {/* Expected outcome */}
              <div className="mt-2.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Expected Outcome</p>
                <p className="text-xs text-foreground mt-0.5">{init.expected_outcome || init.target || '—'}</p>
              </div>

              {/* Timeline + Responsible */}
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {init.timeline || '—'}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {init.responsible_party || init.responsible_role || '—'}
                </span>
              </div>

              {/* KPI */}
              {init.kpi && (
                <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                  <Target className="w-3 h-3" />
                  KPI: <span className="text-foreground">{init.kpi}</span>
                </div>
              )}

              {/* Status + Next milestone */}
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/30">
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: statusMeta.color, background: `${statusMeta.color}15` }}
                >
                  {statusMeta.label}
                </span>
                {init.next_milestone && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {init.next_milestone}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Boundary note */}
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        This preview shows only advisor-approved, client-visible initiatives. Internal impact formulas,
        confidence calculations, evidence IDs, and advisor notes are not shared with the client.
      </p>
    </div>
  );
}