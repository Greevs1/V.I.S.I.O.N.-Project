import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp, Zap, CheckCircle2, AlertCircle, Clock, FileText, ArrowRight } from 'lucide-react';
import {
  buildOutcomeContext, analyzeOutcome, confirmOutcome, createFollowUpDecision,
} from '@/lib/decisionIntelligenceService';
import DecisionOutcomeEditor from './DecisionOutcomeEditor';

const OUTCOME_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'partially_succeeded', label: 'Partially Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'inconclusive', label: 'Inconclusive' },
];

const COMPARISON_STATUS_COLORS = {
  ACHIEVED: 'text-emerald-400',
  PARTIALLY_ACHIEVED: 'text-amber-400',
  NOT_ACHIEVED: 'text-red-400',
  TOO_EARLY: 'text-blue-400',
  UNKNOWN: 'text-muted-foreground',
  NOT_MEASURABLE: 'text-muted-foreground',
};

const REVIEW_STATE_LABELS = {
  NOT_SCHEDULED: { label: 'No Review Scheduled', color: 'text-muted-foreground' },
  SCHEDULED: { label: 'Review Scheduled', color: 'text-blue-400' },
  DUE: { label: 'Review Due', color: 'text-amber-400' },
  OVERDUE: { label: 'Review Overdue', color: 'text-red-400' },
  IN_REVIEW: { label: 'In Review', color: 'text-primary' },
  REVIEWED: { label: 'Reviewed', color: 'text-emerald-400' },
};

export default function DecisionOutcomeView({ decision, businessId, onDecisionUpdated }) {
  const [context, setContext] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [reviewState, setReviewState] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [memoryCandidates, setMemoryCandidates] = useState([]);
  const [showEditor, setShowEditor] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState('');

  const loadContext = useCallback(async () => {
    if (!decision?.decision_id) return;
    setLoading(true);
    try {
      const res = await buildOutcomeContext(decision.decision_id);
      setContext(res.context);
      setReadiness(res.readiness);
      setReviewState(res.review_state);
      if (res.client_safe) {
        setContext(null);
        setReviewState(res.client_safe.outcome_review_state);
      }
    } catch (e) {
      console.error('Failed to load outcome context:', e);
    } finally {
      setLoading(false);
    }
  }, [decision?.decision_id]);

  useEffect(() => {
    if (decision?.decision_status === 'decided') {
      loadContext();
      setSelectedStatus(decision.outcome_status || '');
      setOutcomeNotes(decision.outcome_notes || '');
    }
  }, [decision?.decision_id, decision?.decision_status]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await analyzeOutcome(decision.decision_id);
      setAnalysis(res.analysis);
      if (res.analysis?.suggested_outcome_status) {
        setSelectedStatus(res.analysis.suggested_outcome_status);
      }
    } catch (e) {
      console.error('Failed to analyze outcome:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedStatus) return;
    setConfirming(true);
    try {
      const res = await confirmOutcome(decision.decision_id, selectedStatus, outcomeNotes, []);
      setMemoryCandidates(res.memory_candidates || []);
      if (onDecisionUpdated) onDecisionUpdated(res.decision);
      setReviewState('REVIEWED');
    } catch (e) {
      console.error('Failed to confirm outcome:', e);
    } finally {
      setConfirming(false);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!followUpTitle.trim()) return;
    try {
      const res = await createFollowUpDecision(decision.decision_id, {
        title: followUpTitle,
        decision_type: decision.decision_type,
      });
      if (onDecisionUpdated) onDecisionUpdated(res.decision);
      setShowFollowUp(false);
      setFollowUpTitle('');
    } catch (e) {
      console.error('Failed to create follow-up decision:', e);
    }
  };

  if (!decision || decision.decision_status !== 'decided') {
    return (
      <div className="glass rounded-lg p-4 text-center">
        <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Outcome review available after the decision is finalized.</p>
      </div>
    );
  }

  const isReviewed = reviewState === 'REVIEWED' || decision.outcome_reviewed_at;
  const hasExpectedOutcomes = (decision.expected_outcomes || []).length > 0;

  return (
    <div className="space-y-4">
      {/* Review State Badge */}
      {reviewState && (
        <div className="flex items-center justify-between glass rounded-lg px-3 py-2">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Review Status</span>
          <span className={`text-xs font-medium ${REVIEW_STATE_LABELS[reviewState]?.color || ''}`}>
            {REVIEW_STATE_LABELS[reviewState]?.label || reviewState}
          </span>
        </div>
      )}

      {/* Expected Outcomes Editor (if none defined) */}
      {!hasExpectedOutcomes && !isReviewed && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Define expected outcomes before the review date.</p>
            <Button variant="outline" size="sm" onClick={() => setShowEditor(!showEditor)}>
              {showEditor ? 'Cancel' : 'Define Outcomes'}
            </Button>
          </div>
          {showEditor && (
            <DecisionOutcomeEditor
              decision={decision}
              onSaved={(updated) => {
                if (onDecisionUpdated) onDecisionUpdated(updated);
                setShowEditor(false);
                loadContext();
              }}
            />
          )}
        </div>
      )}

      {/* Expected Outcomes Display */}
      {hasExpectedOutcomes && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">What We Expected</p>
          {decision.expected_outcomes.map((eo, i) => (
            <div key={eo.outcome_id || i} className="glass rounded-lg p-3">
              <p className="text-xs text-foreground font-medium">{eo.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                {eo.target_value != null && eo.baseline_value != null && (
                  <span>{eo.baseline_value} → {eo.target_value}</span>
                )}
                {eo.time_horizon && <span>• {eo.time_horizon}</span>}
                {eo.metric_key && <span>• Metric: {eo.metric_key}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current Evidence */}
      {context && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Current Evidence</p>
          <div className="glass rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Days Elapsed</span>
              <span className="text-foreground">{context.elapsed_days} days</span>
            </div>
            {context.growth_plan_summary && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Growth Plan</span>
                <span className="text-foreground">{context.growth_plan_summary.active_initiatives} active</span>
              </div>
            )}
            {context.sprint_summary && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Sprint</span>
                <span className="text-foreground">{context.sprint_summary.progress_percent}%</span>
              </div>
            )}
            {context.timeline_events_since_decision?.length > 0 && (
              <div className="pt-1.5 border-t border-border">
                <p className="text-[10px] text-muted-foreground mb-1">Timeline Events</p>
                {context.timeline_events_since_decision.slice(0, 5).map((e) => (
                  <div key={e.event_id} className="text-[10px] text-foreground/70">
                    {e.timestamp?.split('T')[0]}: {e.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Readiness / Too Early */}
      {readiness && !isReviewed && (
        <div className="glass rounded-lg p-3">
          {readiness.too_early ? (
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{readiness.reason}</p>
            </div>
          ) : !readiness.ready ? (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{readiness.reason}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* AI Analysis */}
      {!isReviewed && (
        <div className="space-y-2">
          <Button onClick={handleAnalyze} variant="outline" size="sm" className="w-full" disabled={analyzing}>
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {analyzing ? 'Analyzing...' : 'Run AI Outcome Analysis'}
          </Button>
          {analysis && (
            <div className="glass rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">AI Analysis (Advisory)</p>
              <p className="text-xs text-foreground/80">{analysis.summary}</p>
              {analysis.suggested_outcome_status && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>Suggested status:</span>
                  <span className="text-primary font-medium">{analysis.suggested_outcome_status}</span>
                </div>
              )}
              {analysis.what_improved?.length > 0 && (
                <div>
                  <p className="text-[10px] text-emerald-400 mb-0.5">Improved</p>
                  {analysis.what_improved.map((w, i) => <p key={i} className="text-[10px] text-foreground/70">• {w}</p>)}
                </div>
              )}
              {analysis.what_did_not?.length > 0 && (
                <div>
                  <p className="text-[10px] text-amber-400 mb-0.5">Did Not Meet Expectations</p>
                  {analysis.what_did_not.map((w, i) => <p key={i} className="text-[10px] text-foreground/70">• {w}</p>)}
                </div>
              )}
              {analysis.possible_lessons?.length > 0 && (
                <div>
                  <p className="text-[10px] text-primary mb-0.5">Possible Lessons</p>
                  {analysis.possible_lessons.map((l, i) => <p key={i} className="text-[10px] text-foreground/70">• {l}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Human Confirmation */}
      {!isReviewed && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Confirm Outcome (Human Only)</p>
          <select
            value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
          >
            <option value="">Select outcome status...</option>
            {OUTCOME_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <textarea
            value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)}
            placeholder="Outcome notes — what happened, what was learned..."
            rows={3}
            className="w-full bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none resize-none"
          />
          <Button onClick={handleConfirm} disabled={!selectedStatus || confirming} className="w-full" size="sm">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            {confirming ? 'Confirming...' : 'Confirm Outcome'}
          </Button>
        </div>
      )}

      {/* Confirmed Outcome */}
      {isReviewed && (
        <div className="glass rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-xs font-medium text-foreground">Outcome Confirmed: {decision.outcome_status}</p>
          </div>
          {decision.outcome_notes && (
            <p className="text-xs text-muted-foreground italic">"{decision.outcome_notes}"</p>
          )}
          {decision.outcome_reviewed_at && (
            <p className="text-[10px] text-muted-foreground/60">Reviewed: {decision.outcome_reviewed_at.split('T')[0]}</p>
          )}
        </div>
      )}

      {/* Memory Candidates */}
      {memoryCandidates.length > 0 && (
        <div className="glass rounded-lg p-3 space-y-1.5">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Memory Candidates (Require Confirmation)</p>
          {memoryCandidates.map((mc, i) => (
            <div key={i} className="text-[10px] text-foreground/70">
              <span className="text-primary">{mc.category}:</span> {mc.summary}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/50 mt-1">These are candidates — confirm through Business Memory governance.</p>
        </div>
      )}

      {/* Follow-up Decision */}
      {isReviewed && (
        <div className="space-y-2">
          {!showFollowUp ? (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowFollowUp(true)}>
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
              Create Follow-Up Decision
            </Button>
          ) : (
            <div className="space-y-2">
              <input
                type="text" value={followUpTitle} onChange={(e) => setFollowUpTitle(e.target.value)}
                placeholder="e.g. Roll back pricing 3% and hold?"
                className="w-full bg-secondary/50 rounded px-2.5 py-1.5 text-xs text-foreground border border-border focus:border-primary outline-none"
              />
              <Button onClick={handleCreateFollowUp} disabled={!followUpTitle.trim()} size="sm" className="w-full">
                Create Follow-Up Decision
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}