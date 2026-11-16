/**
 * RuntimeDiagnosticPanel — TEMPORARY dev-only diagnostic overlay.
 *
 * Shows the exact data at every layer of the Dashboard pipeline so we can
 * see where values disappear between backend → BIS → UI.
 *
 * Gated behind URL param ?diag=1 or localStorage flag vision_diag=1.
 * Remove before production.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const fmt = (n) => {
  if (n == null || isNaN(n)) return 'NULL';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

function StatusDot({ value }) {
  if (value == null) return <XCircle className="w-3 h-3 text-red-400 shrink-0" />;
  return <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />;
}

function Row({ label, value, display, expected }) {
  const isNull = value == null;
  const isWrong = expected != null && value != null && value !== expected;
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[10px] border-b border-white/5">
      <StatusDot value={value} />
      <span className="text-white/40 w-40 shrink-0">{label}</span>
      <span className={`flex-1 font-mono ${isNull ? 'text-red-400' : isWrong ? 'text-yellow-400' : 'text-green-400'}`}>
        {display || (isNull ? 'NULL' : String(value))}
      </span>
      {expected != null && (
        <span className="text-white/30 text-[9px]">exp: {expected}</span>
      )}
    </div>
  );
}

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span className="text-[11px] font-semibold tracking-wide uppercase text-white/70">{title}</span>
      </button>
      {open && <div className="bg-black/60">{children}</div>}
    </div>
  );
}

export default function RuntimeDiagnosticPanel({
  activeBusinessId,
  isAuthenticated,
  assessmentSummary,
  dashboardMetrics,
  guestSession,
  bis,
  bisVersion,
}) {
  const r = bis?._raw || {};
  const as = assessmentSummary || {};
  const m = dashboardMetrics || {};

  return (
    <div className="layer-inspector fixed bottom-2 right-2 w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-yellow-500/30 bg-black/95 backdrop-blur-xl shadow-2xl text-white/90">
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400" />
          <span className="text-[11px] font-bold tracking-wide uppercase text-yellow-400">Runtime Diagnostic</span>
        </div>
        <span className="text-[9px] text-white/40">bisVersion: {bisVersion}</span>
      </div>

      <div className="p-2 space-y-2">
        {/* Context */}
        <Section title="Context" defaultOpen>
          <Row label="isAuthenticated" value={isAuthenticated} display={String(isAuthenticated)} />
          <Row label="activeBusinessId" value={activeBusinessId} display={activeBusinessId || 'NULL'} />
          <Row label="bisVersion" value={bisVersion} display={String(bisVersion)} />
          <Row label="guestSession" value={guestSession} display={guestSession ? 'loaded' : 'NULL'} />
        </Section>

        {/* Assessment Summary (from backend) */}
        <Section title="Assessment Summary (backend)" defaultOpen>
          <Row label="profit_gap_amount" value={as.profit_gap_amount} display={fmt(as.profit_gap_amount)} expected={2000000} />
          <Row label="value_gap_amount" value={as.value_gap_amount} display={fmt(as.value_gap_amount)} expected={4940000} />
          <Row label="current_business_value" value={as.current_business_value} display={fmt(as.current_business_value)} expected={760000} />
          <Row label="potential_value" value={as.value_gap_details?.potential_value} display={fmt(as.value_gap_details?.potential_value)} expected={5700000} />
          <Row label="tax_gap_annual" value={as.tax_gap_annual} display={fmt(as.tax_gap_annual)} expected={25000} />
          <Row label="operations_score" value={as.operations_score} display={as.operations_score ?? 'NULL'} expected={67} />
          <Row label="monthly_value_of_time_freed" value={as.monthly_value_of_time_freed} display={fmt(as.monthly_value_of_time_freed)} expected={5568} />
          <Row label="recast_ebitda_details.add_backs" value={as.recast_ebitda_details?.add_backs} display={fmt(as.recast_ebitda_details?.add_backs)} expected={93000} />
          <Row label="derived_iq_score" value={as.derived_iq_score} display={as.derived_iq_score ?? 'NULL'} />
        </Section>

        {/* Dashboard Metrics (from backend) */}
        <Section title="Dashboard Metrics (backend)">
          <Row label="ciq_score" value={m.ciq_score} display={m.ciq_score ?? 'NULL'} />
          <Row label="profit_gap (column)" value={m.profit_gap} display={fmt(m.profit_gap)} />
          <Row label="value_gap (column)" value={m.value_gap} display={fmt(m.value_gap)} />
          <Row label="operations_score (column)" value={m.operations_score} display={m.operations_score ?? 'NULL'} />
          <Row label="profit_gap_details.gap_to_best" value={m.profit_gap_details?.gap_to_best} display={fmt(m.profit_gap_details?.gap_to_best)} />
          <Row label="value_gap_details.current_value" value={m.value_gap_details?.current_value} display={fmt(m.value_gap_details?.current_value)} />
          <Row label="value_gap_details.potential_value" value={m.value_gap_details?.potential_value} display={fmt(m.value_gap_details?.potential_value)} />
        </Section>

        {/* BIS._raw (what UI reads) */}
        <Section title="BIS._raw (UI source)" defaultOpen>
          <Row label="iq_score" value={r.iq_score} display={r.iq_score ?? 'NULL'} />
          <Row label="current_value" value={r.current_value} display={fmt(r.current_value)} expected={760000} />
          <Row label="potential_value" value={r.potential_value} display={fmt(r.potential_value)} expected={5700000} />
          <Row label="operations_score" value={r.operations_score} display={r.operations_score ?? 'NULL'} expected={67} />
          <Row label="monthly_value_of_time_freed" value={r.monthly_value_of_time_freed} display={fmt(r.monthly_value_of_time_freed)} expected={5568} />
          <Row label="profit_gap_amount" value={r.profit_gap_amount} display={fmt(r.profit_gap_amount)} expected={2000000} />
          <Row label="value_gap_amount" value={r.value_gap_amount} display={fmt(r.value_gap_amount)} expected={4940000} />
          <Row label="tax_gap_annual" value={r.tax_gap_annual} display={fmt(r.tax_gap_annual)} expected={25000} />
          <Row label="recast_add_backs" value={r.recast_add_backs} display={fmt(r.recast_add_backs)} expected={93000} />
          <Row label="freedom_score" value={r.freedom_score} display={r.freedom_score ?? 'NULL'} />
          <Row label="revenue" value={r.revenue} display={fmt(r.revenue)} />
        </Section>

        {/* BIS flags */}
        <Section title="BIS Flags">
          <Row label="hasData" value={bis?.hasData} display={String(bis?.hasData)} />
          <Row label="hasAssessmentData" value={bis?.hasAssessmentData} display={String(bis?.hasAssessmentData)} />
          <Row label="isGuest" value={bis?.isGuest} display={String(bis?.isGuest)} />
          <Row label="completedTypes" value={bis?.onboarding?.completedAssessmentTypes} display={(bis?.onboarding?.completedAssessmentTypes || []).join(', ') || 'none'} />
        </Section>

        {/* WhereYouStand would display */}
        <Section title="WhereYouStand Display" defaultOpen>
          <Row label="Business IQ" value={r.iq_score} display={r.iq_score != null ? `${Math.round(r.iq_score)}/100` : '—'} />
          <Row label="Current Value" value={r.current_value} display={r.current_value != null ? fmt(r.current_value) : '—'} expected={760000} />
          <Row label="Potential Value" value={r.potential_value} display={r.potential_value != null ? fmt(r.potential_value) : '—'} expected={5700000} />
          <Row label="Operations Health" value={r.operations_score} display={r.operations_score != null ? `${Math.round(r.operations_score)}/100` : '—'} expected={67} />
          <Row label="Time Value Freed" value={r.monthly_value_of_time_freed} display={r.monthly_value_of_time_freed != null ? `${fmt(r.monthly_value_of_time_freed)}/mo` : '—'} expected={5568} />
        </Section>
      </div>
    </div>
  );
}