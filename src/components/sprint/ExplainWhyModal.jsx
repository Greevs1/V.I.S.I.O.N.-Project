import React, { useState, useEffect } from 'react';
import { X, Loader2, Sparkles, Shield, Target, AlertCircle, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export default function ExplainWhyModal({ opportunity, onClose }) {
  // Phase 6.9 — the reasoning chain (canonical recommendations, strategy context,
  // advisor overrides, supporting evidence) is business-scoped, so it must be
  // loaded against the ACTIVE business.
  const { activeContext } = useAuth();
  const activeBusinessId = activeContext?.businessId || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!opportunity) return;
    setLoading(true);
    base44.functions.invoke('galileoOpportunityEngine', {
      action: 'getExplainWhy',
      data: { opportunity_id: opportunity.id, active_business_id: activeBusinessId },
    }).then(res => {
      setData(res.data || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [opportunity?.id, activeBusinessId]);

  if (!opportunity) return null;

  const { scores, reasoning, generation_summary, canonical_recommendation, strategy_context, advisor_override, supporting_evidence, recommendation_key } = data || {};
  const o = opportunity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#141418' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold">Why This Was Recommended</h3>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Opportunity title */}
            <div>
              <p className="text-sm font-semibold">{o.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{o.description}</p>
              {recommendation_key && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[9px] uppercase tracking-wider text-primary/60">Canonical BIE Key:</span>
                  <code className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{recommendation_key}</code>
                </div>
              )}
            </div>

            {/* BIE Priority & Confidence */}
            {canonical_recommendation && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">BIE Recommendation</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-secondary rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Target className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-muted-foreground">Priority</span>
                    </div>
                    <p className="text-sm font-bold text-primary capitalize">{canonical_recommendation.priority}</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="w-3 h-3 text-blue-400" />
                      <span className="text-[10px] text-muted-foreground">Confidence</span>
                    </div>
                    <p className="text-sm font-bold text-blue-400">{canonical_recommendation.confidence}%</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-muted-foreground">Impact</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-400">{canonical_recommendation.formatted}</p>
                  </div>
                </div>
                {scores?.note && (
                  <p className="text-[9px] text-muted-foreground mt-1.5">{scores.note}</p>
                )}
              </div>
            )}

            {/* Strategy Context (approved strategies) */}
            {strategy_context && strategy_context.strategy_options?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Approved Strategy Options</p>
                <div className="space-y-1.5">
                  {strategy_context.strategy_options.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-start gap-2 bg-secondary/50 rounded-lg p-2">
                      {s.match_status === 'confirmed' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <span className="text-primary mt-0.5 text-[10px]">•</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{s.strategy_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.implementation_difficulty} · {s.implementation_days}d
                          {s.match_status === 'confirmed' && ' · Confirmed by advisor'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {strategy_context.user_access_level && (
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Access level: {strategy_context.user_access_level}
                    {strategy_context.user_access_level === 'free' && ' — upgrade for full strategy details'}
                  </p>
                )}
              </div>
            )}

            {/* Advisor Override */}
            {advisor_override && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] font-medium text-amber-400">Advisor Override Active</span>
                </div>
                <p className="text-[10px] text-amber-300/80">
                  {advisor_override.override_type === 'defer' && 'Your advisor has deferred this recommendation.'}
                  {advisor_override.override_type === 'suppress_recommendation' && 'Your advisor has suppressed this recommendation.'}
                  {advisor_override.override_type === 'change_priority' && 'Your advisor has adjusted the priority of this recommendation.'}
                  {advisor_override.override_type === 'replace_strategy' && 'Your advisor has selected an alternative strategy.'}
                  {advisor_override.override_type === 'confirm_strategy' && 'Your advisor has confirmed the recommended strategy.'}
                  {advisor_override.reason && ` ${advisor_override.reason}`}
                </p>
              </div>
            )}

            {/* Supporting Evidence */}
            {supporting_evidence && supporting_evidence.metrics?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Supporting Evidence</p>
                <div className="space-y-1">
                  {supporting_evidence.metrics.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{m.field}</span>
                      <span className="text-foreground font-medium">{String(m.value)}</span>
                    </div>
                  ))}
                </div>
                {supporting_evidence.missingInformation?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground/60">Missing: {supporting_evidence.missingInformation.join(' · ')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Reasoning (legacy compatibility) */}
            {reasoning?.why_recommended && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Reasoning</p>
                <p className="text-xs text-muted-foreground">{reasoning.why_recommended}</p>
                {reasoning.key_drivers?.length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {reasoning.key_drivers.map((d, i) => (
                      <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                        <span className="text-primary mt-0.5">•</span> {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Generation context */}
            {generation_summary && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Generation Context</p>
                <p className="text-[10px] text-muted-foreground">{generation_summary}</p>
              </div>
            )}

            <p className="text-[9px] text-muted-foreground text-center">
              Source: Business Intelligence Engine (BIE) · Scores derive from BIE priority
            </p>
          </div>
        )}
      </div>
    </div>
  );
}