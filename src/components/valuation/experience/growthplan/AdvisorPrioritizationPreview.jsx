/**
 * AdvisorPrioritizationPreview — Phase 13.3E.5
 *
 * A preliminary advisor-controlled prioritization view. Allows sorting and
 * filtering initiatives by estimated EV relevance, EBITDA relevance, multiple
 * relevance, risk reduction, time to value, difficulty, confidence, estimated
 * cost, dependency count, and execution readiness.
 *
 * This is NOT the final Institutional Decision Engine. The advisor makes the
 * priority decision.
 */
import React, { useState, useMemo } from 'react';
import { ArrowUpDown, Filter } from 'lucide-react';
import { SORT_OPTIONS, sortInitiatives, filterInitiatives, INITIATIVE_STATUSES, INITIATIVE_GROUPS } from '@/lib/valuation/growthPlanEngine';

export default function AdvisorPrioritizationPreview({ initiatives, onEdit }) {
  const [sortBy, setSortBy] = useState('ev_relevance');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  const filtered = useMemo(() => {
    let result = filterInitiatives(initiatives, { status: filterStatus || null, group: filterGroup || null });
    result = sortInitiatives(result, sortBy);
    return result;
  }, [initiatives, sortBy, filterStatus, filterGroup]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Advisor Prioritization Preview</h3>
          <p className="text-[10px] text-muted-foreground">Advisor-controlled sorting and filtering. Not the final Institutional Decision Engine.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-[11px] bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-[11px] bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            {INITIATIVE_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="text-[11px] bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Groups</option>
            {INITIATIVE_GROUPS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} initiative{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Ranked list */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs text-muted-foreground">No initiatives match the current filters.</p>
          </div>
        ) : (
          filtered.map((init, i) => {
            const statusMeta = INITIATIVE_STATUSES.find((s) => s.key === init.status) || INITIATIVE_STATUSES[0];
            return (
              <div
                key={init.initiative_id}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: i < 3 ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.05)', color: i < 3 ? '#D4A853' : '#6B7280' }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{init.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-muted-foreground">EBITDA: {init.ebitda_relevance}</span>
                    <span className="text-[9px] text-muted-foreground">Multiple: {init.multiple_relevance}</span>
                    <span className="text-[9px] text-muted-foreground">Difficulty: {init.difficulty}</span>
                  </div>
                </div>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{ color: statusMeta.color, background: `${statusMeta.color}15` }}
                >
                  {statusMeta.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}