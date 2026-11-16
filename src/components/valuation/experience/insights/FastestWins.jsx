/**
 * FastestWins — Phase 13.3E.5
 *
 * Displays candidate fast wins supported by current evidence. Each candidate
 * is labeled "Candidate Opportunity" until advisor-reviewed. Shows why it's
 * a fast win, estimated timeline, difficulty, required evidence, and expected
 * relevance across EBITDA/multiple/confidence/EV.
 *
 * These are NOT approved initiatives. They are candidates for advisor review.
 */
import React from 'react';
import { Zap, Clock, BarChart3, ArrowRight } from 'lucide-react';

const DIFFICULTY_COLORS = {
  Low: '#22c55e',
  Medium: '#F59E0B',
  High: '#EF4444',
};

export default function FastestWins({ wins, onNavigateToValidate }) {
  if (!wins || wins.length === 0) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs text-muted-foreground">No fast wins identified from current evidence. Resolve verification items to surface opportunities.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {wins.map((win) => {
        const diffColor = DIFFICULTY_COLORS[win.difficulty] || '#6B7280';
        return (
          <div
            key={win.id}
            className="rounded-xl p-3.5"
            style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.12)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-accent shrink-0" />
                  <p className="text-sm font-semibold text-foreground">{win.name}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{win.why_fast_win}</p>
              </div>
              <span className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 text-accent bg-accent/10">
                Candidate Opportunity
              </span>
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-3 mt-2.5 flex-wrap text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                {win.timeline}
              </span>
              <span className="flex items-center gap-1" style={{ color: diffColor }}>
                <BarChart3 className="w-3 h-3" />
                {win.difficulty}
              </span>
              <span className="text-muted-foreground">EBITDA: {win.ebitda_relevance}</span>
              <span className="text-muted-foreground">Multiple: {win.multiple_relevance}</span>
              <span className="text-muted-foreground">Confidence: {win.confidence_improvement}</span>
              <span className="text-muted-foreground">EV: {win.ev_relevance}</span>
            </div>

            {/* Required evidence + dependencies */}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
              <span>Evidence needed: {win.required_evidence}</span>
              {win.dependencies?.length > 0 && <span>· Depends: {win.dependencies.join(', ')}</span>}
            </div>

            {/* Validate link */}
            {win.link_to_validate && onNavigateToValidate && (
              <button
                onClick={() => onNavigateToValidate()}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-2"
              >
                Open in Validate
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}