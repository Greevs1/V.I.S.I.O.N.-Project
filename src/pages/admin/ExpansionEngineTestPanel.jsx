/**
 * Expansion Engine Test Panel — super_admin only
 * Runs expandStrategyOpportunities for any client and shows full debug output.
 * Not linked in navigation — accessed directly or from AdminView developer tab.
 */
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { resolveStrategiesForBusiness } from '@/lib/strategyResolution';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Clock, Zap, Shield, TrendingUp, GitMerge } from 'lucide-react';

const ELIGIBILITY_COLORS = {
  ELIGIBLE: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'ELIGIBLE' },
  POTENTIAL: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: 'POTENTIAL' },
  INELIGIBLE: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: 'INELIGIBLE' },
};

function ExpansionCard({ expansion, index }) {
  const [open, setOpen] = useState(index === 0);
  const [sprintOpen, setSprintOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const elig = ELIGIBILITY_COLORS[expansion.eligibility?.status] || ELIGIBILITY_COLORS.POTENTIAL;

  const fmt = (n) => {
    if (!n) return null;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  };

  return (
    <div className={`rounded-xl border ${elig.border} ${elig.bg} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-5">#{index + 1}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{expansion.expansion_name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${elig.border} ${elig.text}`}>
                {elig.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Primary: {expansion.primary_gap} • Gaps: {(expansion.affected_gaps || []).join(', ')} • Confidence: {expansion.confidence_score}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Quality scores mini */}
          <div className="hidden md:flex gap-2 text-[10px]">
            <span className="text-muted-foreground">Elig: <strong className={elig.text}>{expansion.quality_scores?.eligibility_score}</strong></span>
            <span className="text-muted-foreground">Compound: <strong className="text-primary">{expansion.quality_scores?.compounding_score}</strong></span>
            <span className="text-muted-foreground">Composite: <strong className="text-foreground">{expansion.quality_scores?.composite_score}</strong></span>
          </div>
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5">

          {/* Eligibility Detail */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Eligibility Intelligence</p>
            <div className={`rounded-lg p-3 ${elig.bg} border ${elig.border}`}>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--tw-prose-body)' }}>{expansion.eligibility?.reason}</p>
              {expansion.eligibility?.hard_blocks_missing?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-red-400 mb-1">⚠ Requires Confirmation:</p>
                  {expansion.eligibility.hard_blocks_missing.map((b, i) => (
                    <p key={i} className="text-[10px] text-red-300 ml-2">• {b}</p>
                  ))}
                </div>
              )}
              {expansion.eligibility?.data_to_collect_next?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-amber-400 mb-1">📋 Data to Collect Next:</p>
                  {expansion.eligibility.data_to_collect_next.map((d, i) => (
                    <p key={i} className="text-[10px] text-amber-300 ml-2">• {d}</p>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2 italic">{expansion.eligibility?.confidence_impact}</p>
            </div>
          </div>

          {/* Projected Impact */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Projected Financial Impact</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Tax Savings', value: fmt(expansion.projected_impact?.tax_savings), color: 'text-emerald-400' },
                { label: 'Profit Improvement', value: fmt(expansion.projected_impact?.profit_improvement), color: 'text-blue-400' },
                { label: 'Value Increase', value: fmt(expansion.projected_impact?.value_increase), color: 'text-purple-400' },
                { label: 'Cash Flow/mo', value: fmt(expansion.projected_impact?.cash_flow_monthly), color: 'text-cyan-400' },
                { label: 'Freedom Acceleration', value: expansion.projected_impact?.freedom_acceleration_months ? `${expansion.projected_impact.freedom_acceleration_months} mo` : null, color: 'text-primary' },
              ].filter(m => m.value).map((m, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-2 text-center">
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[9px] text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Implementation Sequence */}
          {expansion.implementation_sequence?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Implementation Sequence</p>
              <div className="space-y-1.5">
                {expansion.implementation_sequence.map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-[10px] font-mono text-primary w-4 mt-0.5 shrink-0">{step.step}.</span>
                    <div className="flex-1">
                      <p className="text-xs text-foreground">{step.action}</p>
                      <p className="text-[10px] text-muted-foreground">{step.owner} • {step.timeframe}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outcomes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: '1st Order', items: expansion.first_order_outcomes, color: 'text-blue-400' },
              { label: '2nd Order', items: expansion.second_order_outcomes, color: 'text-purple-400' },
              { label: '3rd Order', items: expansion.third_order_outcomes, color: 'text-primary' },
            ].map((tier, ti) => (
              <div key={ti} className="bg-white/5 rounded-lg p-3">
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${tier.color}`}>{tier.label} Effects</p>
                <ul className="space-y-1">
                  {(tier.items || []).map((item, ii) => (
                    <li key={ii} className="text-[11px] text-muted-foreground flex gap-1.5">
                      <span className={`${tier.color} shrink-0`}>›</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Compliance */}
          {expansion.compliance_explanation && (
            <div className="rounded-lg p-3 bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Why This Is Above Board</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{expansion.compliance_explanation}</p>
            </div>
          )}

          {/* Quality Scores */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Stack Quality Scores</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Eligibility', value: expansion.quality_scores?.eligibility_score },
                { label: 'Compounding', value: expansion.quality_scores?.compounding_score },
                { label: 'Readiness', value: expansion.quality_scores?.implementation_readiness_score },
                { label: 'Documentation', value: expansion.quality_scores?.documentation_score },
                { label: 'Composite', value: expansion.quality_scores?.composite_score },
              ].map((s, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-2 text-center">
                  <p className={`text-sm font-bold ${s.value >= 80 ? 'text-emerald-400' : s.value >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{s.value}</p>
                  <p className="text-[9px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Expert Review Priority: {expansion.quality_scores?.expert_review_priority === 1 ? '🔴 Urgent' : expansion.quality_scores?.expert_review_priority === 2 ? '🟡 High' : '🟢 Standard'}</p>
          </div>

          {/* 30-day Sprint */}
          {expansion.sprint_handoff && (
            <div className="border border-primary/20 rounded-lg overflow-hidden">
              <button
                onClick={() => setSprintOpen(!sprintOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-primary/5 text-left"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-semibold text-primary">30-Day Sprint: {expansion.sprint_handoff.sprint_title}</p>
                </div>
                {sprintOpen ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-primary" />}
              </button>
              {sprintOpen && (
                <div className="p-3 space-y-3">
                  <p className="text-[11px] text-muted-foreground"><strong className="text-foreground">Objective:</strong> {expansion.sprint_handoff.sprint_objective}</p>
                  {['week_1_tasks', 'week_2_tasks', 'week_3_tasks', 'week_4_tasks'].map((wk, wi) => (
                    <div key={wk}>
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Week {wi + 1}</p>
                      <ul className="space-y-0.5">
                        {(expansion.sprint_handoff[wk] || []).map((t, ti) => (
                          <li key={ti} className="text-[11px] text-muted-foreground flex gap-1.5">
                            <span className="text-primary shrink-0">›</span><span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-400 mb-1">✓ Success Metric</p>
                      <p className="text-[11px] text-muted-foreground">{expansion.sprint_handoff.success_metric}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-blue-400 mb-1">Expert Roles Needed</p>
                      <p className="text-[11px] text-muted-foreground">{(expansion.sprint_handoff.expert_roles_needed || []).join(', ')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Raw debug */}
          <div>
            <button onClick={() => setDebugOpen(!debugOpen)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              {debugOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Raw JSON
            </button>
            {debugOpen && (
              <pre className="text-[9px] text-muted-foreground bg-black/40 rounded p-3 overflow-auto max-h-48 mt-1">
                {JSON.stringify(expansion, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineStatusBar({ status }) {
  if (!status) return null;

  const stages = [
    { key: 'strategy_scores', label: 'Strategy Scores', count: status.scores_created },
    { key: 'expansions', label: 'Expansions', count: status.expansions_created },
    { key: 'freedom_projections', label: 'Freedom Projections', count: status.projections_created },
  ];

  const stageColor = (s) => {
    if (s === 'success') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (s === 'failed') return 'text-red-400 border-red-500/30 bg-red-500/10';
    return 'text-muted-foreground border-border bg-white/5';
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitMerge className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold">Pipeline Status</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {stages.map((s, i) => (
          <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${stageColor(status[s.key])}`}>
            {status[s.key] === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
             status[s.key] === 'failed' ? <AlertCircle className="w-3.5 h-3.5" /> :
             <Clock className="w-3.5 h-3.5" />}
            <span className="text-xs font-medium">{s.label}</span>
            {s.count > 0 && <span className="text-[10px] font-bold">({s.count})</span>}
            <span className="text-[10px] uppercase">{status[s.key]}</span>
          </div>
        ))}
      </div>
      {status.warnings?.length > 0 && (
        <div className="space-y-1">
          {status.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-400">⚠ {w}</p>
          ))}
        </div>
      )}
      {status.errors?.length > 0 && (
        <div className="space-y-1">
          {status.errors.map((e, i) => (
            <p key={i} className="text-[11px] text-red-400">✕ {e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExpansionEngineTestPanel({ businessId, profileId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customBizId, setCustomBizId] = useState(businessId || '');
  const [customProfId, setCustomProfId] = useState(profileId || '');

  // Run the full pipeline via canonical BIE transport → selectStrategiesForClient adapter
  const runFullPipeline = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await resolveStrategiesForBusiness(customBizId || undefined, { persist: true });
      setResult({ type: 'pipeline', data });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Run only expansion test (dry run, no persist)
  const runExpansionTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('expandStrategyOpportunities', {
        action: 'testHarness',
        business_id: customBizId || undefined,
        profile_id: customProfId || undefined,
        persist: false,
      });
      setResult({ type: 'expansion', data: res.data });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const expansions = result?.type === 'expansion'
    ? (result.data?.expansions || [])
    : [];

  const pipelineStatus = result?.type === 'pipeline'
    ? result.data?.pipeline_status
    : null;

  const pipelineStrategies = result?.type === 'pipeline'
    ? (result.data?.strategies || []).slice(0, 10)
    : [];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Galileo Intelligence Pipeline</h3>
          <Badge variant="outline" className="text-[10px]">super_admin only</Badge>
        </div>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Business ID (optional override)</label>
            <input
              value={customBizId}
              onChange={e => setCustomBizId(e.target.value)}
              placeholder="Leave blank for current user"
              className="text-xs px-2 py-1.5 rounded border border-border bg-background w-64 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Profile ID (optional override)</label>
            <input
              value={customProfId}
              onChange={e => setCustomProfId(e.target.value)}
              placeholder="Leave blank for current user"
              className="text-xs px-2 py-1.5 rounded border border-border bg-background w-64 focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={runFullPipeline} disabled={loading}>
              {loading ? 'Running...' : '▶ Run Full Pipeline'}
            </Button>
            <Button size="sm" variant="outline" onClick={runExpansionTest} disabled={loading}>
              Expansion Test Only
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Full Pipeline: BIE Recommendations → selectStrategiesForClient (adapter) → resolveStrategyMappings → expandStrategyOpportunities → bulkProjectFromExpansions
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive font-medium">Error: {error}</p>
        </div>
      )}

      {/* Full pipeline result */}
      {result?.type === 'pipeline' && (
        <div className="space-y-4">
          <PipelineStatusBar status={pipelineStatus} />

          {/* Top strategies summary */}
          {pipelineStrategies.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Top Scored Strategies</p>
              <div className="space-y-2">
                {pipelineStrategies.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground w-5">#{s.priority_rank}</span>
                      <span className="text-xs text-foreground">{s.strategy_name}</span>
                      <span className="text-[10px] text-muted-foreground">({s.category})</span>
                    </div>
                    <span className={`text-xs font-bold ${s.opportunity_score >= 80 ? 'text-emerald-400' : s.opportunity_score >= 60 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {s.opportunity_score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw pipeline output toggle */}
          <details className="rounded-lg border border-border bg-card p-3">
            <summary className="text-[10px] text-muted-foreground cursor-pointer">Raw Pipeline JSON</summary>
            <pre className="text-[9px] text-muted-foreground bg-black/40 rounded p-3 overflow-auto max-h-64 mt-2">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Expansion-only test result */}
      {result?.type === 'expansion' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Expansions', value: result.data?.total_expansions, color: 'text-foreground' },
              { label: 'Eligible', value: result.data?.eligible_count, color: 'text-emerald-400' },
              { label: 'Potential', value: result.data?.potential_count, color: 'text-amber-400' },
              { label: 'Tax Gap', value: result.data?.client_signals_used?.tax_gap_confirmed ? '✓ Confirmed' : '✗ Not detected', color: result.data?.client_signals_used?.tax_gap_confirmed ? 'text-emerald-400' : 'text-muted-foreground' },
            ].map((s, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Client Signals Detected</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.data?.client_signals_used || {}).map(([k, v]) => (
                <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full border ${v === true || (typeof v === 'string' && v.includes('confirmed')) ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground bg-white/5'}`}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {expansions.map((exp, i) => (
              <ExpansionCard key={i} expansion={exp} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}