/**
 * ValueInsights — Phase 13.3F.2
 *
 * "What Is Driving Your Value" section.
 * Four high-level cards: Biggest Strength, Biggest Risk,
 * Fastest Opportunity, Highest-Priority Next Action.
 * Each includes plain-language title, why it matters, EBITDA/multiple/EV
 * relevance, confidence, and a direct action.
 */
import React from 'react';
import { TrendingUp, AlertTriangle, Zap, ArrowRight, Star } from 'lucide-react';
// Terminology on this surface is engine prose plus three accounting labels.
// ExplainableText is session-aware: the term is taught once, then rendered plain
// — so four insight cards never become twelve affordances.
import ExplainableText from '@/components/galileo/explain/ExplainableText';

const IMPACT_NOT_QUANTIFIABLE = 'Impact not yet quantifiable';

function InsightCard({ icon: Icon, tone, title, whyItMatters, ebitda, multiple, ev, confidence, action, link, onNavigate }) {
  const toneColor = tone === 'positive' ? '#22c55e' : tone === 'warning' ? '#F59E0B' : tone === 'opportunity' ? '#00D4FF' : '#A855F7';
  return (
    <div
      className="rounded-xl p-4 flex flex-col"
      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${toneColor}15` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: toneColor }} />
        </div>
        {confidence != null && (
          <span className="text-[10px] text-muted-foreground/70 ml-auto">{Math.round(confidence)}% confidence</span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 flex-1">
        <ExplainableText text={whyItMatters} surface="valuation_insight" />
      </p>
      <div className="space-y-0.5 mb-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground/60">
            <ExplainableText text="EBITDA" surface="valuation_kpi" />
          </span>
          <span className="text-muted-foreground">{ebitda}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground/60">Multiple</span>
          <span className="text-muted-foreground">{multiple}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground/60">EV Impact</span>
          <span className="text-muted-foreground">{ev}</span>
        </div>
      </div>
      {action && link && (
        <button
          onClick={() => onNavigate?.(link)}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline mt-auto"
        >
          {action}
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function EmptyInsight({ icon: Icon, label }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col items-center justify-center text-center min-h-[160px]"
      style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <Icon className="w-5 h-5 text-muted-foreground/30 mb-2" />
      <p className="text-xs text-muted-foreground/60">{label}</p>
      <p className="text-[10px] text-muted-foreground/40 mt-1">Complete more of the journey to surface this insight.</p>
    </div>
  );
}

export default function ValueInsights({ topInsights, onNavigate }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">What Is Driving Your Value</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {topInsights?.biggestStrength ? (
          <InsightCard
            icon={TrendingUp}
            tone="positive"
            title={topInsights.biggestStrength.title}
            whyItMatters={topInsights.biggestStrength.whyItMatters}
            ebitda={topInsights.biggestStrength.ebitdaRelevance}
            multiple={topInsights.biggestStrength.multipleRelevance}
            ev={topInsights.biggestStrength.evRelevance}
            confidence={topInsights.biggestStrength.confidence}
            action={topInsights.biggestStrength.action}
            link={topInsights.biggestStrength.link}
            onNavigate={onNavigate}
          />
        ) : (
          <EmptyInsight icon={Star} label="Biggest Value Strength" />
        )}
        {topInsights?.biggestRisk ? (
          <InsightCard
            icon={AlertTriangle}
            tone="warning"
            title={topInsights.biggestRisk.title}
            whyItMatters={topInsights.biggestRisk.whyItMatters}
            ebitda={topInsights.biggestRisk.ebitdaRelevance}
            multiple={topInsights.biggestRisk.multipleRelevance}
            ev={topInsights.biggestRisk.evRelevance}
            confidence={topInsights.biggestRisk.confidence}
            action={topInsights.biggestRisk.action}
            link={topInsights.biggestRisk.link}
            onNavigate={onNavigate}
          />
        ) : (
          <EmptyInsight icon={AlertTriangle} label="Biggest Value Risk" />
        )}
        {topInsights?.fastestOpportunity ? (
          <InsightCard
            icon={Zap}
            tone="opportunity"
            title={topInsights.fastestOpportunity.title}
            whyItMatters={topInsights.fastestOpportunity.whyItMatters}
            ebitda={topInsights.fastestOpportunity.ebitdaRelevance}
            multiple={topInsights.fastestOpportunity.multipleRelevance}
            ev={topInsights.fastestOpportunity.evRelevance}
            confidence={topInsights.fastestOpportunity.confidence}
            action={topInsights.fastestOpportunity.action}
            link={topInsights.fastestOpportunity.link}
            onNavigate={onNavigate}
          />
        ) : (
          <EmptyInsight icon={Zap} label="Fastest Value Opportunity" />
        )}
        {topInsights?.nextAction ? (
          <InsightCard
            icon={ArrowRight}
            tone="action"
            title={topInsights.nextAction.title}
            whyItMatters={topInsights.nextAction.whyItMatters}
            ebitda={topInsights.nextAction.ebitdaRelevance}
            multiple={topInsights.nextAction.multipleRelevance}
            ev={topInsights.nextAction.evRelevance}
            confidence={topInsights.nextAction.confidence}
            action={topInsights.nextAction.action}
            link={topInsights.nextAction.link}
            onNavigate={onNavigate}
          />
        ) : (
          <EmptyInsight icon={ArrowRight} label="Highest-Priority Next Action" />
        )}
      </div>
    </div>
  );
}