/**
 * ExpertClientAssessments — read-only assessment history for expert advisor portal.
 * Fetches assessments + benchmark data (profit/value benchmarks) for the selected client.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

const ASSESSMENT_LABELS = {
  profit_gap: 'Profit Gap',
  value_gap: 'Value Gap',
  tax_gap: 'Tax Gap',
  operations_gap: 'Operations Gap',
  recast_ebitda: 'Recast EBITDA',
  freedom_assessment: 'Freedom Assessment',
  cost_of_inaction: 'Cost of Inaction',
};

const SEVERITY_COLORS = {
  significant: 'text-red-400 bg-red-500/10 border-red-500/20',
  moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  small: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const fmt = (n) => {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
};

const fmtPct = (n) => n != null ? `${n.toFixed(1)}%` : null;

function BenchmarkRow({ label, value, format = 'currency' }) {
  if (value == null) return null;
  const display = format === 'pct' ? fmtPct(value) : fmt(value);
  if (!display) return null;
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-primary">{display}</span>
    </div>
  );
}

function ProfitBenchmarkPanel({ revenue, industry }) {
  const { data: benchmark } = useQuery({
    queryKey: ['profit-benchmark', revenue, industry],
    queryFn: async () => {
      const res = await base44.functions.invoke('profitBenchmark', {
        revenue,
        industry: industry || 'General',
      });
      return res.data || null;
    },
    enabled: !!(revenue && revenue > 0),
    staleTime: 300000,
  });

  if (!benchmark) return null;
  const b = benchmark.benchmarks || benchmark;

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Industry Benchmarks</p>
      <BenchmarkRow label="Average Net Profit Margin" value={b.average_net_profit_margin ?? b.averageNetProfitMargin} format="pct" />
      <BenchmarkRow label="Top Quartile Margin" value={b.top_quartile_margin ?? b.topQuartileMargin} format="pct" />
      <BenchmarkRow label="Best in Class Margin" value={b.best_in_class_margin ?? b.bestInClassMargin} format="pct" />
      <BenchmarkRow label="Average Net Profit ($)" value={b.average_net_profit ?? b.averageNetProfit} />
      <BenchmarkRow label="Top Quartile Profit ($)" value={b.top_quartile_profit ?? b.topQuartileProfit} />
      <BenchmarkRow label="Best in Class Profit ($)" value={b.best_in_class_profit ?? b.bestInClassProfit} />
    </div>
  );
}

function ValueBenchmarkPanel({ revenue, ebitda, industry }) {
  const { data: benchmark } = useQuery({
    queryKey: ['value-benchmark', revenue, ebitda, industry],
    queryFn: async () => {
      const res = await base44.functions.invoke('valueBenchmark', {
        revenue,
        ebitda,
        industry: industry || 'General',
      });
      return res.data || null;
    },
    enabled: !!(revenue && revenue > 0),
    staleTime: 300000,
  });

  if (!benchmark) return null;
  const b = benchmark.benchmarks || benchmark;

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Valuation Benchmarks</p>
      <BenchmarkRow label="Average Multiple" value={b.average_multiple ?? b.averageMultiple} format="pct" />
      <BenchmarkRow label="Top Quartile Multiple" value={b.top_quartile_multiple ?? b.topQuartileMultiple} format="pct" />
      <BenchmarkRow label="Best in Class Multiple" value={b.best_in_class_multiple ?? b.bestInClassMultiple} format="pct" />
      <BenchmarkRow label="Average Business Value" value={b.average_value ?? b.averageValue} />
      <BenchmarkRow label="Top Quartile Value" value={b.top_quartile_value ?? b.topQuartileValue} />
      <BenchmarkRow label="Best in Class Value" value={b.best_in_class_value ?? b.bestInClassValue} />
    </div>
  );
}

export default function ExpertClientAssessments({ clientProfileId }) {
  const [expandedId, setExpandedId] = useState(null);

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['expert-client-assessments', clientProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseProfileData', {
        action: 'getBusinessAssessments',
        target_profile_id: clientProfileId,
      });
      return res.data?.assessments || [];
    },
    enabled: !!clientProfileId,
    staleTime: 60000,
  });

  // Fetch metrics to get revenue/industry for benchmark panels
  const { data: metricsData } = useQuery({
    queryKey: ['expert-assess-metrics', clientProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseDashboardData', {
        action: 'getDashboardMetrics',
        target_profile_id: clientProfileId,
      });
      return res.data?.metrics || null;
    },
    enabled: !!clientProfileId,
    staleTime: 120000,
  });

  const revenue = metricsData?.revenue || null;
  const ebitda = metricsData?.recast_ebitda || metricsData?.net_profit || null;
  const industry = metricsData?.industry || null;

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!assessments.length) {
    return (
      <div className="glass rounded-xl p-10 text-center space-y-2">
        <BarChart3 className="w-7 h-7 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No assessments completed by this client yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Assessments — {assessments.length} completed</p>
        <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">Read-Only</span>
      </div>

      {assessments.map(a => {
        const isExpanded = expandedId === a.id;
        const severityClass = SEVERITY_COLORS[a.opportunity_level || a.risk_level] || 'text-muted-foreground bg-secondary border-border';
        const showProfitBenchmark = a.assessment_type === 'profit_gap' && isExpanded && revenue;
        const showValueBenchmark = a.assessment_type === 'value_gap' && isExpanded && revenue;

        return (
          <div key={a.id} className="glass rounded-xl overflow-hidden">
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/20"
              onClick={() => setExpandedId(isExpanded ? null : a.id)}
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{ASSESSMENT_LABELS[a.assessment_type] || a.assessment_type}</p>
                <p className="text-xs text-muted-foreground">
                  {a.updated_at ? `Updated ${new Date(a.updated_at).toLocaleDateString()}` : '—'}
                </p>
              </div>
              {a.score != null && (
                <span className="text-sm font-bold text-primary shrink-0">{Math.round(a.score)}</span>
              )}
              {(a.opportunity_level || a.risk_level) && (
                <span className={`text-[10px] border rounded-full px-2 py-0.5 shrink-0 ${severityClass}`}>
                  {a.opportunity_level || a.risk_level}
                </span>
              )}
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {isExpanded && (
              <div className="border-t border-border px-4 py-4 space-y-3">
                {a.estimated_opportunity_value != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Estimated Opportunity</span>
                    <span className="text-sm font-semibold text-primary">{fmt(a.estimated_opportunity_value)}</span>
                  </div>
                )}
                {a.summary && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Summary</p>
                    <p className="text-sm leading-relaxed">{a.summary}</p>
                  </div>
                )}
                {a.key_findings?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Key Findings</p>
                    <ul className="space-y-1">
                      {a.key_findings.map((f, i) => (
                        <li key={i} className="text-xs text-foreground/80 flex gap-2">
                          <span className="text-primary shrink-0">·</span>{f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.recommendations?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Recommendations</p>
                    <ul className="space-y-1">
                      {a.recommendations.map((r, i) => (
                        <li key={i} className="text-xs text-foreground/80 flex gap-2">
                          <span className="text-primary shrink-0">·</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Benchmark panels for profit/value gap */}
                {showProfitBenchmark && <ProfitBenchmarkPanel revenue={revenue} industry={industry} />}
                {showValueBenchmark && <ValueBenchmarkPanel revenue={revenue} ebitda={ebitda} industry={industry} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}