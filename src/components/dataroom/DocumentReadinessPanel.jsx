/**
 * DocumentReadinessPanel
 * ========================
 * Reusable readiness score widget.
 * Consumed by: DataRoom, AdminView, ExpertAdvisorPortal, IQ Dashboard.
 *
 * Pass `documents` (array from Data Room query) — panel computes everything internally
 * using the shared calculateReadiness engine.
 */
import React, { useState } from 'react';
import { calculateReadiness } from '@/lib/documentReadiness';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';

function ScoreRing({ score, size = 56 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#D4A853' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        fontSize={size < 48 ? "10" : "13"} fontWeight="600" fill={color}>{score}%</text>
    </svg>
  );
}

function CategoryBar({ cat }) {
  const [open, setOpen] = useState(false);
  const color = cat.score >= 80 ? 'bg-emerald-500' : cat.score >= 60 ? 'bg-primary' : cat.score >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 py-2 hover:bg-secondary/30 rounded-lg px-2 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium truncate">{cat.label}</span>
            <span className="text-xs font-bold ml-2 shrink-0" style={{ color: cat.score >= 80 ? '#22c55e' : cat.score >= 60 ? '#D4A853' : '#ef4444' }}>
              {cat.score}%
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${cat.score}%` }} />
          </div>
        </div>
        <span className="text-muted-foreground shrink-0">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && cat.missing.length > 0 && (
        <div className="ml-4 mt-1 mb-2 space-y-1">
          {cat.missing.map(m => (
            <div key={m.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Missing: {m.label}</span>
            </div>
          ))}
          {cat.fulfilled.length > 0 && (
            <div className="text-[10px] text-emerald-400/70 mt-1">
              {cat.completed} of {cat.total} documents present
            </div>
          )}
        </div>
      )}
      {open && cat.missing.length === 0 && (
        <div className="ml-4 mt-1 mb-2 flex items-center gap-1.5 text-[11px] text-emerald-400">
          <CheckCircle className="w-3 h-3" /> All required documents present
        </div>
      )}
    </div>
  );
}

export default function DocumentReadinessPanel({ documents = [], compact = false }) {
  const report = calculateReadiness(documents);
  const [expanded, setExpanded] = useState(!compact);

  const [collapsed, setCollapsed] = useState(true);

  if (compact) {
    return (
      <div className="glass rounded-xl p-4">
        <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ScoreRing score={report.overallScore} size={44} />
            <div>
              <p className="text-xs font-semibold">Documentation Readiness</p>
              <p className="text-[10px] text-muted-foreground">{report.totalMissing} missing · {report.totalCompleted}/{report.totalRequired} complete</p>
            </div>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expanded && (
          <div className="mt-4 space-y-0.5">
            {report.categories.map(cat => <CategoryBar key={cat.id} cat={cat} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      {/* Header row — always visible, click to collapse */}
      <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScoreRing score={report.overallScore} size={48} />
          <div className="text-left">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documentation Readiness</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {report.totalCompleted} of {report.totalRequired} required documents present
              {report.criticalMissing.length > 0 && <span className="text-amber-400 ml-2">· {report.criticalMissing.length} missing</span>}
            </p>
          </div>
        </div>
        {collapsed
          ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {!collapsed && <>
        {/* Category scores grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {report.categories.map(cat => {
            const color = cat.score >= 80 ? '#22c55e' : cat.score >= 60 ? '#D4A853' : cat.score >= 40 ? '#f59e0b' : '#ef4444';
            return (
              <div key={cat.id} className="bg-secondary/50 rounded-lg p-2.5 text-center">
                <p className="text-base font-bold" style={{ color }}>{cat.score}%</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{cat.label.replace(' Documentation', '')}</p>
              </div>
            );
          })}
        </div>

        {/* Category breakdown */}
        <div className="space-y-0.5 border-t border-border pt-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Category Breakdown</p>
          {report.categories.map(cat => <CategoryBar key={cat.id} cat={cat} />)}
        </div>

        {/* Critical missing */}
        {report.criticalMissing.length > 0 && (
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {report.criticalMissing.length} Critical Documents Missing
            </p>
            {report.criticalMissing.slice(0, 5).map(m => (
              <p key={m.key} className="text-[11px] text-muted-foreground">
                • <span className="text-foreground/80">{m.label}</span> <span className="text-muted-foreground/60">({m.categoryLabel})</span>
              </p>
            ))}
            {report.criticalMissing.length > 5 && (
              <p className="text-[10px] text-muted-foreground">…and {report.criticalMissing.length - 5} more</p>
            )}
          </div>
        )}
      </>}
    </div>
  );
}