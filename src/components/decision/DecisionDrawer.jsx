import React, { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Brain, ShieldAlert, CheckCircle2, FileText, Zap, History, TrendingUp } from 'lucide-react';
import {
  createDecision, getDecision, updateDecision, buildDecisionContext,
  challengeDecision, finalizeDecision, getDecisionLedger,
  DECISION_TYPE_LABELS, DECISION_STATUS_LABELS,
} from '@/lib/decisionIntelligenceService';
import DecisionContextView from './DecisionContextView';
import DecisionOptionsEditor from './DecisionOptionsEditor';
import DecisionChallengeView from './DecisionChallengeView';
import DecisionOutcomeView from './DecisionOutcomeView';

const TABS = [
  { id: 'context', label: 'Context', icon: Brain },
  { id: 'options', label: 'Options', icon: FileText },
  { id: 'challenge', label: 'Challenge', icon: ShieldAlert },
  { id: 'finalize', label: 'Decide', icon: CheckCircle2 },
  { id: 'outcome', label: 'Outcome', icon: TrendingUp },
  { id: 'ledger', label: 'Ledger', icon: History },
];

export default function DecisionDrawer({ open, onOpenChange, businessId, decisionId: initialDecisionId }) {
  const [activeTab, setActiveTab] = useState('context');
  const [decision, setDecision] = useState(null);
  const [context, setContext] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [newDecisionTitle, setNewDecisionTitle] = useState('');
  const [newDecisionType, setNewDecisionType] = useState('strategic');

  const loadDecision = useCallback(async (id) => {
    setLoading(true);
    try {
      const res = await getDecision(id);
      setDecision(res.decision);
      setSelectedOptionId(res.decision?.selected_option_id || null);
      setDecisionReason(res.decision?.decision_reason || '');
    } catch (e) {
      console.error('Failed to load decision:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContext = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await buildDecisionContext(id);
      setContext(res.context);
      setReadiness(res.readiness);
    } catch (e) {
      console.error('Failed to build context:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await getDecisionLedger(businessId);
      setLedger(res.ledger || []);
    } catch (e) {
      console.error('Failed to load ledger:', e);
    }
  }, [businessId]);

  useEffect(() => {
    if (open && initialDecisionId) {
      loadDecision(initialDecisionId);
      loadContext(initialDecisionId);
    } else if (open && !initialDecisionId) {
      loadLedger();
    }
  }, [open, initialDecisionId, loadDecision, loadContext, loadLedger]);

  const handleCreate = async () => {
    if (!newDecisionTitle.trim() || !businessId) return;
    setLoading(true);
    try {
      const res = await createDecision({
        business_id: businessId,
        title: newDecisionTitle,
        decision_type: newDecisionType,
      });
      setDecision(res.decision);
      setActiveTab('context');
      loadContext(res.decision.decision_id);
    } catch (e) {
      console.error('Failed to create decision:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOptions = async (options) => {
    if (!decision) return;
    setDecision({ ...decision, options });
    try {
      await updateDecision(decision.decision_id, { options });
    } catch (e) {
      console.error('Failed to update options:', e);
    }
  };

  const handleChallenge = async () => {
    if (!decision) return;
    setChallengeLoading(true);
    try {
      const res = await challengeDecision(decision.decision_id);
      setChallenge(res.challenge);
    } catch (e) {
      console.error('Failed to challenge decision:', e);
    } finally {
      setChallengeLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!decision || !selectedOptionId || !decisionReason.trim()) return;
    setFinalizing(true);
    try {
      const res = await finalizeDecision(decision.decision_id, selectedOptionId, decisionReason);
      setDecision(res.decision);
      if (res.memory_candidate) {
        // Memory candidate generated — advisor must confirm through Business Memory governance
        console.log('Memory candidate generated:', res.memory_candidate);
      }
      setActiveTab('ledger');
      loadLedger();
    } catch (e) {
      console.error('Failed to finalize decision:', e);
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto bg-background border-l border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Decision Intelligence
          </SheetTitle>
          <SheetDescription className="text-xs">
            AI proposes reasoning. Humans decide. Existing systems execute.
          </SheetDescription>
        </SheetHeader>

        {/* Create new decision form */}
        {!decision && (
          <div className="p-4 space-y-3">
            <div className="glass rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Frame a New Decision</p>
              <input
                type="text"
                value={newDecisionTitle}
                onChange={(e) => setNewDecisionTitle(e.target.value)}
                placeholder="e.g. Raise prices 8% now vs phased increase"
                className="w-full bg-secondary/50 rounded px-3 py-2 text-sm text-foreground border border-border focus:border-primary outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <select
                value={newDecisionType}
                onChange={(e) => setNewDecisionType(e.target.value)}
                className="w-full bg-secondary/50 rounded px-3 py-2 text-sm text-foreground border border-border focus:border-primary outline-none"
              >
                {Object.entries(DECISION_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <Button onClick={handleCreate} disabled={!newDecisionTitle.trim() || loading} className="w-full">
                {loading ? 'Creating...' : 'Create Decision'}
              </Button>
            </div>

            {/* Ledger for existing decisions */}
            {ledger.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">Decision Ledger</p>
                <div className="space-y-1.5">
                  {ledger.map((entry) => (
                    <div key={entry.decision_id} className="glass rounded-lg p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">{entry.title}</p>
                        <span className="text-[10px] text-muted-foreground">{entry.decided_at?.split('T')[0]}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">Selected: {entry.selected_option_label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{DECISION_TYPE_LABELS[entry.decision_type]}</span>
                        {entry.recommendation_matched && (
                          <span className="text-[10px] text-emerald-400">Matched recommendation</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Decision tabs */}
        {decision && (
          <div className="px-4 pb-4">
            {/* Decision header */}
            <div className="glass rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-foreground">{decision.title}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {DECISION_STATUS_LABELS[decision.decision_status]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{DECISION_TYPE_LABELS[decision.decision_type]}</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'context' && (
              <div className="space-y-3">
                <Button onClick={() => loadContext(decision.decision_id)} variant="outline" size="sm" className="w-full">
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  {loading ? 'Building context...' : 'Build Decision Context'}
                </Button>
                <DecisionContextView context={context} readiness={readiness} />
              </div>
            )}

            {activeTab === 'options' && (
              <DecisionOptionsEditor
                options={decision.options}
                onChange={handleUpdateOptions}
                readOnly={decision.decision_status === 'decided'}
              />
            )}

            {activeTab === 'challenge' && (
              <div className="space-y-3">
                <Button onClick={handleChallenge} variant="outline" size="sm" className="w-full" disabled={challengeLoading}>
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                  {challengeLoading ? 'Challenging...' : 'Run Devil\'s Advocate'}
                </Button>
                <DecisionChallengeView challenge={challenge} loading={challengeLoading} />
              </div>
            )}

            {activeTab === 'finalize' && (
              <div className="space-y-3">
                {decision.decision_status === 'decided' ? (
                  <div className="glass rounded-lg p-4 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">Decision Finalized</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Selected: {decision.options.find((o) => o.option_id === decision.selected_option_id)?.label}
                    </p>
                    {decision.decision_reason && (
                      <p className="text-xs text-muted-foreground mt-2 italic">"{decision.decision_reason}"</p>
                    )}
                    {decision.decided_at && (
                      <p className="text-[10px] text-muted-foreground/60 mt-2">{decision.decided_at.split('T')[0]}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Select an option and provide a reason. Only authorized humans can finalize decisions.</p>
                    <div className="space-y-1.5">
                      {decision.options.map((opt, i) => (
                        <button
                          key={opt.option_id}
                          onClick={() => setSelectedOptionId(opt.option_id)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                            selectedOptionId === opt.option_id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/30'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-secondary text-xs font-bold flex items-center justify-center">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="text-sm text-foreground">{opt.label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Why this option? What was the reasoning?"
                      rows={3}
                      className="w-full bg-secondary/50 rounded px-3 py-2 text-sm text-foreground border border-border focus:border-primary outline-none resize-none"
                    />
                    <Button
                      onClick={handleFinalize}
                      disabled={!selectedOptionId || !decisionReason.trim() || finalizing}
                      className="w-full"
                    >
                      {finalizing ? 'Finalizing...' : 'Finalize Decision'}
                    </Button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'outcome' && (
              <DecisionOutcomeView
                decision={decision}
                businessId={businessId}
                onDecisionUpdated={(updated) => setDecision(updated)}
              />
            )}

            {activeTab === 'ledger' && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Decision Ledger</p>
                {ledger.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No finalized decisions yet</p>
                ) : (
                  ledger.map((entry) => (
                    <div key={entry.decision_id} className="glass rounded-lg p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">{entry.title}</p>
                        <span className="text-[10px] text-muted-foreground">{entry.decided_at?.split('T')[0]}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">Selected: {entry.selected_option_label}</p>
                      {entry.decision_reason && (
                        <p className="text-muted-foreground/70 mt-1 italic">"{entry.decision_reason}"</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}