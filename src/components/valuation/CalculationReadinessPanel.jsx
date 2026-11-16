/**
 * CalculationReadinessPanel — Phase 13.3C
 * Shows calculation readiness, staleness count, approved count,
 * engine version, publication readiness, and critical blockers.
 */
import React, { useState, useEffect } from 'react';
import { getCalculationSummary, validatePublicationReadiness, getStaleCalculations } from '@/lib/valuationCalculationService';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, FileWarning, ShieldCheck } from 'lucide-react';

export default function CalculationReadinessPanel({ valuationId }) {
  const [summary, setSummary] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [stale, setStale] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!valuationId) return;
    setLoading(true);
    Promise.all([
      getCalculationSummary(valuationId).catch(() => null),
      validatePublicationReadiness(valuationId).catch(() => null),
      getStaleCalculations(valuationId).catch(() => null),
    ]).then(([s, r, st]) => {
      setSummary(s);
      setReadiness(r);
      setStale(st);
    }).finally(() => setLoading(false));
  }, [valuationId]);

  if (loading) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Checking calculation readiness...</p>
        </div>
      </div>
    );
  }

  const calcs = summary?.calculations || [];
  const staleCount = stale?.stale_count || 0;
  const approvedCount = calcs.filter(c => c.is_approved).length;
  const latestCalc = calcs[0];
  const engineVersion = latestCalc?.calculation_engine_version || '13.3.0';
  const methodologyVersion = latestCalc?.methodology_version || '1.0.0';
  const isReady = readiness?.ready || false;

  // Extract key calculation results for display
  const blendedRecon = calcs.find(c => c.calculation_type === 'reconciliation' && c.methodology === 'blended' && !c.superseded_by_calculation_id && c.is_approved);
  const equityBridge = calcs.find(c => c.calculation_type === 'reconciliation' && c.methodology === 'equity_bridge' && !c.superseded_by_calculation_id && c.is_approved);
  const overallConfidence = (summary?.confidence_scores || []).find(c => c.is_overall);
  const conclusion = (summary?.conclusions || [])[0];
  const confidenceCategories = (summary?.confidence_scores || []).filter(c => !c.is_overall);

  return (
    <div className="space-y-3">
      {/* Readiness Status Banner */}
      <div
        className="rounded-xl p-4"
        style={{
          background: isReady ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
          border: `1px solid ${isReady ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {isReady ? (
            <ShieldCheck className="w-4 h-4 text-green-500" />
          ) : (
            <FileWarning className="w-4 h-4 text-destructive" />
          )}
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: isReady ? '#22c55e' : '#ef4444' }}>
            {isReady ? 'Ready for Publication' : 'Publication Blocked'}
          </p>
        </div>
        {readiness?.critical_blockers?.length > 0 && (
          <div className="space-y-1 mt-2">
            {readiness.critical_blockers.slice(0, 5).map((blocker, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{blocker}</span>
              </div>
            ))}
            {readiness.critical_blockers.length > 5 && (
              <p className="text-[10px] text-muted-foreground ml-4">+ {readiness.critical_blockers.length - 5} more blockers</p>
            )}
          </div>
        )}
      </div>

      {/* Enterprise Value & Equity Value Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Enterprise Value (Blended)</p>
          {blendedRecon ? (
            <div>
              <p className="text-lg font-display font-bold text-primary">
                ${Math.round(blendedRecon.enterprise_value_mid || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Range: ${(Math.round(blendedRecon.enterprise_value_low || 0)).toLocaleString()} – ${(Math.round(blendedRecon.enterprise_value_high || 0)).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No approved blended reconciliation</p>
          )}
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)' }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Equity Value (Bridge)</p>
          {equityBridge ? (
            <div>
              <p className="text-lg font-display font-bold" style={{ color: '#00D4FF' }}>
                ${Math.round(equityBridge.equity_value_mid || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Range: ${(Math.round(equityBridge.equity_value_low || 0)).toLocaleString()} – ${(Math.round(equityBridge.equity_value_high || 0)).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No approved equity bridge</p>
          )}
        </div>
      </div>

      {/* Confidence Summary */}
      <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Overall Confidence</p>
          <p className="text-lg font-display font-bold" style={{ color: (overallConfidence?.score || 0) >= 60 ? '#22c55e' : (overallConfidence?.score || 0) >= 40 ? '#F59E0B' : '#ef4444' }}>
            {overallConfidence ? `${overallConfidence.score}%` : '—'}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {['data', 'earnings', 'market', 'operational', 'forecast'].map(cat => {
            const catScore = confidenceCategories.find(c => c.category === cat && !c.is_not_applicable);
            const isNA = confidenceCategories.find(c => c.category === cat && c.is_not_applicable);
            return (
              <div key={cat} className="text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">{cat}</p>
                <p className="text-xs font-semibold" style={{ color: isNA ? '#6B7280' : (catScore?.score || 0) >= 60 ? '#22c55e' : (catScore?.score || 0) >= 40 ? '#F59E0B' : '#ef4444' }}>
                  {isNA ? 'N/A' : catScore ? `${catScore.score}%` : '—'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advisor Conclusion Summary */}
      {conclusion && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.12)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Advisor Conclusion</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${conclusion.advisor_approved ? 'bg-green-500/15 text-green-500' : 'bg-yellow-500/15 text-yellow-500'}`}>
              {conclusion.advisor_approved ? 'Approved' : 'Pending'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {conclusion.primary_method ? `Primary: ${conclusion.primary_method}` : 'No primary method set'}
            {conclusion.confidence_score ? ` · Confidence: ${conclusion.confidence_score}%` : ''}
          </p>
        </div>
      )}

      {/* Calculation Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Clock}
          label="Stale Calculations"
          value={staleCount}
          color={staleCount > 0 ? '#ef4444' : '#22c55e'}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Approved Calculations"
          value={approvedCount}
          color="#22c55e"
        />
        <MetricCard
          icon={RefreshCw}
          label="Engine Version"
          value={engineVersion}
          color="#00D4FF"
          isText
        />
        <MetricCard
          icon={ShieldCheck}
          label="Methodology Version"
          value={methodologyVersion}
          color="#D4A853"
          isText
        />
      </div>

      {/* Warnings */}
      {readiness?.warnings?.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-600 mb-1.5">Warnings</p>
          <div className="space-y-1">
            {readiness.warnings.map((w, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-yellow-600" />
                {w}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Stale Items Detail */}
      {staleCount > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-1.5">Stale Calculation Details</p>
          <div className="space-y-1">
            {(stale?.stale_items || []).map((item, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                <Clock className="w-3 h-3 text-destructive" />
                <span className="font-mono">{item.calculation_type || item.table}</span>
                <span className="text-destructive/70">— {item.reason}</span>
                {item.marked_at && (
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {new Date(item.marked_at).toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color, isText }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3" style={{ color }} />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</p>
      </div>
      <p className="text-lg font-display font-bold" style={{ color }}>
        {isText ? value : value}
      </p>
    </div>
  );
}