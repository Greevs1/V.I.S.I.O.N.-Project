/**
 * useGalileoConversation — the Phase 2 conversation-driven state machine.
 *
 * Replaces the stage-based screen-sequence with a living conversation stream.
 * The user never leaves the workspace. Galileo asks, learns, reveals, and
 * helps — all inline.
 *
 * Reuses ALL existing intelligence architecture:
 *   - guestSessionService (anonymous session + promotion)
 *   - buildPreliminaryModel (certified calculations)
 *   - qualifyOpportunityState (intelligence states)
 *   - profitBenchmark (industry benchmark lookup)
 *   - ExtractDataFromUploadedFile (real document extraction)
 *   - magicLoopAnalytics (tracking)
 *   - magicLoopConversation (persistence)
 *
 * Functions are ordered to avoid temporal dead zone issues — dependencies
 * are always defined before they're referenced in useCallback arrays.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';
import { MARGIN_METRIC, PROFIT_POSITION } from '@/lib/profitSemantics';
import { buildPreliminaryModel } from '@/lib/galileo/preliminaryModel';
import { trackMagicLoop, EVENT_NAMES } from '@/lib/galileo/magicLoopAnalytics';
import { persistGuestConversation } from '@/lib/galileo/magicLoopConversation';
import { getNextQuestion, getDiscoveryProgress, shouldAskFollowUp, getWhyItMattered } from '@/lib/galileo/adaptiveQuestions';
import { lookupProfitBenchmark, buildProfitabilityComparison } from '@/lib/galileo/benchmarkLookup';
import { checkEbitdaPlausibility, checkEmployeeRevenueRatio } from '@/lib/galileo/plausibilityChecks';
import { getEstimateFromAnswers } from '@/lib/galileo/estimateHelper';
import { computeModelCompleteness, getCompletenessLabel } from '@/lib/galileo/modelCompleteness';
import { inferExperienceState, inferMode, shouldShowValueBeforeQuestion } from '@/lib/galileo/experienceStateMachine';
import { selectNextGap, KNOWLEDGE_MILESTONES } from '@/lib/galileo/questionPriorityEngine';
import { computeSignalStates, getAwakeningProgress } from '@/lib/galileo/signalAwakening';
import { extractCanvasObjects, shouldShowCanvasObjects } from '@/lib/galileo/canvasObjects';
import { getSavedItems, saveItem, getSavedCount } from '@/lib/galileo/saveManager';
import { selectNowItem } from '@/lib/galileo/nowSurface';
import { interpretAnswer, bridgeToQuestion } from '@/lib/galileo/interpretation';
import { Knowledge, resolveFacts, profitInsightLine } from '@/lib/galileo/factKnowledge';
import { activateScenario, readActiveScenario, markScenarioReturned, scenarioContinuation } from '@/lib/galileo/activeScenario';
import { useBusinessContext } from '@/lib/BusinessContext';

const CONTEXT_OPTIONS = {
  my_business: 'My Business',
  a_client: 'A Client',
};

const INTENT_OPTIONS = {
  find_opportunities: 'Find opportunities',
  improve_cash_flow: 'Improve cash flow',
  lower_taxes: 'Lower taxes',
  increase_profit: 'Increase profit',
  increase_value: 'Increase business value',
  get_ready_to_sell: 'Get ready to sell',
  reduce_dependency: 'Reduce owner dependence',
  already_implementing: "Something I'm already working on",
  not_sure: 'Show me what you see',
};

/**
 * The eight PRIMARY intents, in the order they are offered. `not_sure` is
 * deliberately not one of them: it is a quiet tertiary action, not the ninth
 * identical row. It is still a real intent — it selects the neutral question
 * order — it is simply not presented as a goal.
 */
const PRIMARY_INTENTS = [
  'find_opportunities', 'improve_cash_flow', 'lower_taxes', 'increase_profit',
  'increase_value', 'get_ready_to_sell', 'reduce_dependency', 'already_implementing',
];

/** The intent fork. The question carries its own prompt, so Galileo says it once. */
const intentQuestion = () => ({
  inputType: 'choice',
  prompt: 'What would you most like to uncover?',
  sub: 'This biases what I look at first. It never locks you in.',
  options: PRIMARY_INTENTS.map((value) => ({ value, label: INTENT_OPTIONS[value] })),
  tertiary: { value: 'not_sure', label: INTENT_OPTIONS.not_sure },
});

/**
 * Session progression key. The first-run conversation is preserved for the life
 * of the tab ONLY: session-scoped by construction, and it maps onto the same
 * canonical answer fields — never a parallel business model.
 */
const PROGRESSION_KEY = 'vision_galileo_onboarding_v1';

const CLIENT_ROLES = [
  'CPA / Tax Professional', 'Financial Advisor', 'Wealth Advisor',
  'Attorney', 'CFO / Fractional CFO', 'Consultant',
  'Investor / Acquirer', 'Business Advisor', 'Other',
];

let entryIdCounter = 0;
const nextId = () => `e${++entryIdCounter}`;

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

/**
 * THE FIRST INSIGHT NOW LIVES IN factKnowledge.profitInsightLine.
 *
 * It was moved out of this file because the defect that produced a 0% margin for
 * an UNANSWERED EBITDA was a SEMANTIC one — `Number(null)` is 0 and
 * `Number.isFinite(0)` is true, so a missing fact was read as a verified zero —
 * and a rule that has to hold across the platform cannot live inside one hook.
 * The gate now lives with the fact states themselves (§17: UNKNOWN ≠ ZERO), and
 * this hook simply asks for the line and says it if it exists.
 */

export function useGalileoConversation({ autoStart = true } = {}) {
  // ── Canonical active business ──────────────────────────────────────────────
  // Null for guests, so the guest Magic Loop keeps its session-scoped store.
  // Authenticated saves must carry an explicit business_id.
  const { context: bizContext } = useBusinessContext();
  const activeBusinessId = bizContext?.active_business_id || null;

  // ── State ──────────────────────────────────────────────────────────────────
  const [conversation, setConversation] = useState([]);
  const [context, setContext] = useState(null);
  const [clientRole, setClientRole] = useState(null);
  const [intent, setIntent] = useState(null);
  const [answers, setAnswers] = useState({
    industry: null, revenue: null, ebitda: null,
    employees: null, involvement: null, goal: null,
  });
  const [verified, setVerified] = useState({});
  const [extractedFacts, setExtractedFacts] = useState(null);
  /**
   * WHICH FACTS CAME FROM THE MODELLED ESTIMATOR — epistemic provenance, not a
   * value. An estimated EBITDA is usable, but it is ESTIMATED: never reported as
   * measured, and never allowed to stand in for a fact nobody supplied (§4).
   */
  const [estimated, setEstimated] = useState({});

  // ── THE MODEL THIS TRANSITION ────────────────────────────────────────────────
  // An explicit, recoverable state machine instead of an implicit content swap:
  //   idle → resolving → ready | error (retryable)
  // The action id is what makes the transition idempotent, and the payload ref is
  // what lets a retry re-run the SAME inputs instead of re-asking anything.
  const [implementationActionId, setImplementationActionId] = useState(null);
  const [implementationPhase, setImplementationPhase] = useState('idle');
  const [implementationError, setImplementationError] = useState(null);
  const implementationRetryRef = useRef(null);
  const lastModelThisActionRef = useRef(null);
  /**
   * THE ACTIVE SCENARIO — what MODEL THIS created. It carries the opportunity,
   * the strategy, the known facts and the evidence forward into the main surface,
   * so the arriving interface continues the same thought instead of starting one.
   */
  const [activeScenario, setActiveScenario] = useState(null);
  const [model, setModel] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [implementationChoice, setImplementationChoice] = useState(null);
  const [mode, setMode] = useState('create');
  const [activePulseDomain, setActivePulseDomain] = useState(null);
  const [drawerState, setDrawerState] = useState({ open: false, type: null, data: null });
  const [savePromptState, setSavePromptState] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState(null);
  const [flowState, setFlowState] = useState('welcoming');
  const [isThinking, setIsThinking] = useState(false);
  const [confirmedAnomalies, setConfirmedAnomalies] = useState({});
  const [modelCompleteness, setModelCompleteness] = useState(0);
  const [plausibilityCheck, setPlausibilityCheck] = useState(null);
  const [estimateData, setEstimateData] = useState(null);
  const [savedItems, setSavedItems] = useState([]);
  const [nowItem, setNowItem] = useState(null);
  const [valueProvidedRecently, setValueProvidedRecently] = useState(false);
  const sessionEnsured = useRef(false);
  const startedRef = useRef(false);
  const valueShownRef = useRef(false);
  /** Destinations already offered — each is entered at most once (see advanceExperience). */
  const phasesRef = useRef(new Set());
  /**
   * Forward references. The controller is deliberately ordered and two of its
   * functions must call each other (a continuation consults the gap engine; a
   * finished discovery advances the experience). Refs break that cycle without
   * reordering the file or introducing a second state machine.
   */
  const askNextRef = useRef(null);
  const advanceRef = useRef(null);

  /**
   * THE KNOWLEDGE GAP STATE — the ONLY first-run progression state.
   *   answered_question_ids  every question a human has answered OR skipped, so
   *                          a skip is never asked again and a continuation can
   *                          never re-emit a question already dealt with
   *   question_id            the question currently on screen
   *   milestone              M0…M7 — how far Galileo has actually got
   *   last_transition        why the last move happened
   */
  const [gap, setGap] = useState({ answered_question_ids: [], question_id: null, milestone: 'M0', last_transition: null });
  const gapRef = useRef(gap);
  gapRef.current = gap;

  // ── Basic helpers (no forward deps) ────────────────────────────────────────
  const addEntry = useCallback((entry) => {
    // Returns the id so an ACTION can be identified after it is rendered: the
    // Model This transition is keyed to the action that produced it.
    const id = nextId();
    setConversation((prev) => [...prev, { id, timestamp: new Date().toISOString(), ...entry }]);
    return id;
  }, []);

  const addMessage = useCallback((role, content, field = null) => {
    addEntry({ type: 'message', role, content, ...(field ? { field } : {}) });
  }, [addEntry]);

  const persistConversation = useCallback((conv) => {
    if (guestSessionId) {
      persistGuestConversation(guestSessionId, conv).catch(() => {});
    }
  }, [guestSessionId]);

  // ── Model + benchmark helpers ──────────────────────────────────────────────
  const rebuildModel = useCallback((ans, ver, exFacts, bench) => {
    const built = buildPreliminaryModel(ans, ver, exFacts);
    if (bench && built.signals.profit) {
      const comparison = buildProfitabilityComparison(built.signals.profit.margin, bench);
      if (comparison) {
        built.signals.profit.benchmark = comparison;
        if (comparison.potentialGap != null && built.signals.profit.margin != null) {
          const revenue = exFacts?.facts?.annual_revenue?.normalized ?? ver.revenue ?? ans.revenue;
          if (revenue > 0) {
            built.signals.profit.gap = Math.round(revenue * (comparison.potentialGap / 100));
          }
        }
      }
    }
    setModel(built);
    return built;
  }, []);

  const fetchBenchmark = useCallback(async (industry) => {
    if (!industry || benchmarkLoading) return;
    setBenchmarkLoading(true);
    try {
      const bench = await lookupProfitBenchmark(industry);
      setBenchmark(bench);
      return bench;
    } catch {
      return null;
    } finally {
      setBenchmarkLoading(false);
    }
  }, [benchmarkLoading]);

  // ── proceedToOpportunity (no forward deps beyond model/addMessage) ────────
  const proceedToOpportunity = useCallback((modelOverride) => {
    const currentModel = modelOverride || model;
    const opp = currentModel?.opportunities?.[0] || null;
    if (!opp) {
      // NO OPPORTUNITY YET. Galileo continues the Knowledge Gap sequence — the
      // highest-value unanswered question — and only advances the experience when
      // the engine has nothing left to ask. Re-entering THIS branch with the same
      // model is what produced the reported "Keep Going" loop, so it is no longer
      // reachable from any continuation action.
      // This function has no `currentAnswers` in scope — the conversation's own
      // `answers` state is the current answer set, so it is read directly.
      const remaining = selectNextGap({
        answers,
        intent,
        extractedFacts,
        model: currentModel,
        benchmark,
        answeredQuestionIds: gapRef.current.answered_question_ids || [],
        currentQuestionId: gapRef.current.question_id || null,
        insightShown: valueShownRef.current,
      });
      if (remaining?.question) {
        askNextRef.current?.(answers, null, gapRef.current);
        return;
      }
      advanceRef.current?.(currentModel, answers);
      return;
    }
    setSelectedOpportunity(opp);
    trackMagicLoop(EVENT_NAMES.OPPORTUNITY_SHOWN, { opportunity_id: opp?.id, opportunity_title: opp?.title }, guestSessionId);
    setFlowState('opportunity');
    setTimeout(() => {
      addMessage('assistant', "I found something worth looking at.");
      addEntry({ type: 'insight', variant: 'opportunity', data: { opportunity: opp } });
      addEntry({
        type: 'action', variant: 'opportunity_actions',
        options: [
          { value: 'investigate', label: 'Investigate', desc: 'See what this could mean' },
          { value: 'why', label: 'Why Galileo Thinks This', desc: 'Show the evidence' },
          { value: 'save', label: 'Save This', desc: 'Come back to this later' },
        ],
      });
    }, 600);
  }, [model, answers, guestSessionId, intent, extractedFacts, benchmark, addMessage, addEntry]);

  // ── advanceExperience ──────────────────────────────────────────────────────
  // WHERE THE FIRST-RUN SEQUENCE GOES WHEN THERE IS NO QUESTION LEFT TO ASK.
  //
  // Each destination is entered AT MOST ONCE (the phase set), in the order the
  // product intends: the opportunity Galileo actually found → preservation, and
  // ONLY when a responsible insight was really shown → the data accelerator. That
  // is what makes "no dead end" and "no duplicate Save prompt" structural rather
  // than hoped for. When everything has been offered, the only action left is the
  // source of record, so a click there cannot loop.
  const advanceExperience = useCallback((currentModel, currentAnswers) => {
    const opp = currentModel?.opportunities?.[0] || null;

    if (opp && !phasesRef.current.has('opportunity')) {
      phasesRef.current.add('opportunity');
      proceedToOpportunity(currentModel);
      return;
    }

    if (valueShownRef.current && !phasesRef.current.has('preservation')) {
      phasesRef.current.add('preservation');
      setSavePromptState('model');
      // ACCOUNT CREATION = PRESERVATION (§6). The moment is framed as keeping
      // something that now EXISTS, and it names what that is: the value gap the
      // model actually produced, and how many areas it actually found. Both come
      // from the real model, so an empty discovery cannot produce a claim, and the
      // number of areas is never padded to sound more impressive (§F13).
      const valueSignal = currentModel?.signals?.value || null;
      const areas = (currentModel?.opportunities || []).length;
      const kept = [
        valueSignal?.gap ? `${fmt(valueSignal.gap)} potential value gap` : null,
        areas > 0 ? `${areas} ${areas === 1 ? 'area' : 'areas'} worth investigating` : null,
      ].filter(Boolean).join(' · ');
      addMessage('assistant', "I've found enough that this is worth keeping.");
      addEntry({
        type: 'action', variant: 'save_model',
        options: [{
          value: 'save',
          label: 'Save What Galileo Found',
          desc: kept || 'Keep what I have learned so far',
        }],
      });
      setFlowState('saving');
      return;
    }

    if (!phasesRef.current.has('accelerator')) {
      phasesRef.current.add('accelerator');
      addMessage('assistant', "I can keep estimating from what you've told me, or I can learn from how your business actually operates.");
      addEntry({
        type: 'action', variant: 'connect',
        options: [
          { value: 'share_financials', label: 'Connect accounting or upload financials', desc: 'A P&L, balance sheet, or tax return' },
          { value: 'keep_exploring', label: 'Keep exploring with my estimates', desc: 'Ask me something else about the business' },
        ],
      });
      setFlowState('awaiting_upload');
      return;
    }

    addMessage('assistant', 'Sharing a financial statement is the fastest way for me to go further.');
    addEntry({
      type: 'action', variant: 'connect',
      options: [{ value: 'share_financials', label: 'Connect accounting or upload financials', desc: 'A P&L, balance sheet, or tax return' }],
    });
    setFlowState('awaiting_upload');
  }, [proceedToOpportunity, addMessage, addEntry]);
  advanceRef.current = advanceExperience;

  // ── showStrategies ─────────────────────────────────────────────────────────
  const showStrategies = useCallback(() => {
    setFlowState('strategy');
    const opp = selectedOpportunity || model?.opportunities?.[0];
    if (!opp) return;
    trackMagicLoop(EVENT_NAMES.STRATEGY_EXPLORED, { opportunity_id: opp?.id }, guestSessionId);
    addMessage('assistant', "Here are some things I'd investigate. Each one could move the number.");
    addEntry({ type: 'insight', variant: 'strategies', data: { opportunity: opp } });
  }, [selectedOpportunity, model, guestSessionId, addMessage, addEntry]);

  // ── completeDiscovery (depends on proceedToOpportunity) ────────────────────
  const completeDiscovery = useCallback((currentAnswers) => {
    // The reveal happens ONCE. A second "discovery complete" is not a new
    // discovery, and re-revealing it is exactly the duplicate Galileo response
    // this phase removes.
    if (phasesRef.current.has('complete')) return;
    phasesRef.current.add('complete');
    const built = rebuildModel(currentAnswers, {}, extractedFacts, benchmark);
    trackMagicLoop(EVENT_NAMES.PRELIMINARY_MODEL_CREATED, {
      completeness: built.completeness, opportunity_count: built.opportunities.length,
    }, guestSessionId);
    // ── THE SIGNATURE MOMENT ───────────────────────────────────────────────
    // The compute above is real and deterministic. The orb enters ANALYSIS for
    // exactly that window, and it is the only window in which processing language
    // is allowed to appear. Nothing waits here merely to look busy.
    setFlowState('analyzing');
    setIsThinking(true);
    setTimeout(() => {
      addMessage('assistant', "That's enough for me to start. Let me show you what I see so far.");
      setFlowState('revealing');
      if (built.signals.profit?.benchmark) {
        addEntry({ type: 'insight', variant: 'profitability', data: { signal: built.signals.profit, model: built } });
      }
      setTimeout(() => {
        // The discovery lands as a statement first, then the number. The presence
        // stage pulses ONCE on entering discovery; the reveal is not decorated
        // further, so the figure itself carries the moment.
        addMessage('assistant', 'I found something worth looking at.');
        if (built.signals.value) {
          addEntry({ type: 'insight', variant: 'value', data: { signal: built.signals.value, model: built } });
        }
        // Said ONLY while the EBITDA genuinely IS an estimate — the uncertainty is
        // stated as productive context rather than hidden. The language has to
        // match the knowledge (§4): a figure the owner supplied is not "modeled",
        // and a figure nobody supplied cannot make this claim at all.
        const discoveryFacts = resolveFacts({ answers: currentAnswers, verified, extractedFacts, estimated });
        if (built.signals.value && discoveryFacts.ebitda.state === Knowledge.ESTIMATED) {
          addMessage('assistant', "Your EBITDA is still an estimate and I'm using a modeled valuation range. There's enough here that I'd investigate it.");
        }
        setTimeout(() => {
          // Discovery is finished: hand the experience to the ONE advance path, so
          // the accelerator is offered once and preservation is never requested
          // before something worth preserving exists.
          advanceRef.current?.(built, currentAnswers);
          setIsThinking(false);
        }, 700);
      }, 650);
    }, 350);
  }, [extractedFacts, benchmark, guestSessionId, addMessage, addEntry, rebuildModel, verified, estimated]);

  // ── askNextDiscoveryQuestion (depends on completeDiscovery) ────────────────
  // Phase 4: Uses the Question Priority Engine with VALUE → QUESTION rhythm.
  // Before asking, checks if Galileo should provide value first.
  const askNextDiscoveryQuestion = useCallback((currentAnswers, lastField = null, gapState = null) => {
    const state = gapState || gapRef.current;

    const emitGap = () => {
      // ── THE KNOWLEDGE GAP ENGINE ──────────────────────────────────────────
      // known state + intent + already-answered questions + available evidence +
      // completeness → the highest-value UNANSWERED question, with an explicit
      // refusal when that question has already been dealt with and an explicit
      // ADVANCE when nothing eligible remains. This is the single progression
      // decision; nothing here re-renders a state it has already produced.
      const next = selectNextGap({
        answers: currentAnswers,
        intent,
        extractedFacts,
        model,
        benchmark,
        lastFieldAnswered: lastField,
        hasProvidedValueRecently: valueProvidedRecently,
        answeredQuestionIds: state.answered_question_ids || [],
        currentQuestionId: state.question_id || null,
        insightShown: valueShownRef.current,
      });

      // Questions the available EVIDENCE already answered are recorded as dealt
      // with — never asked (§O16) and never asked again after a skip (§O8).
      const nextGap = {
        answered_question_ids: Array.from(new Set([...(state.answered_question_ids || []), ...(next?.skipped || [])])),
        question_id: null,
        milestone: next?.milestone || state.milestone || 'M0',
        last_transition: next?.reason || null,
      };

      if (!next?.question) {
        nextGap.last_transition = next?.reason || 'advance:no_eligible_gap';
        setGap(nextGap);
        advanceRef.current?.(model, currentAnswers);
        return;
      }

      const q = next.question;
      nextGap.question_id = q.field;
      setGap(nextGap);
      // ONE line of reason for the question that is about to arrive — and only
      // when nothing was just interpreted, so Galileo never speaks twice in a row
      // merely to fill space.
      const bridge = lastField ? null : bridgeToQuestion(q.field, currentAnswers);
      if (bridge) addMessage('assistant', bridge);
      addEntry({
        type: 'question', field: q.field, inputType: q.inputType,
        prompt: q.prompt, sub: q.sub, placeholder: q.placeholder,
        prefix: q.prefix, options: q.options, allowSkip: q.allowSkip,
        tertiary: q.tertiary || null,
      });
      setValueProvidedRecently(false);
    };

    // VALUE → QUESTION rhythm: say something useful first when the answers now
    // support it, then ask. It never terminates discovery — the question still
    // follows, which is the difference between a rhythm and a wall.
    const valueCheck = shouldShowValueBeforeQuestion({
      answers: currentAnswers, model, lastFieldAnswered: lastField, benchmark,
      facts: resolveFacts({ answers: currentAnswers, verified, extractedFacts, estimated }),
    });
    if (valueCheck.shouldShow && valueCheck.message && !valueShownRef.current) {
      valueShownRef.current = true;
      addMessage('assistant', valueCheck.message);
      setValueProvidedRecently(true);
      setTimeout(emitGap, 1200);
      return;
    }

    emitGap();
  }, [intent, extractedFacts, model, benchmark, valueProvidedRecently, addMessage, addEntry]);
  askNextRef.current = askNextDiscoveryQuestion;

  // ── answerDiscoveryQuestion (depends on askNextDiscoveryQuestion) ──────────
  const answerDiscoveryQuestion = useCallback((field, value, displayValue) => {
    const actualField = field.startsWith('_') ? field.replace('_', '') : field;

    // ONE PASS, OUTSIDE THE STATE UPDATER. Messages, timers and benchmark fetches
    // used to run INSIDE setAnswers' updater callback, which React may invoke more
    // than once — that is how a single answer could produce duplicate Galileo
    // responses and duplicate questions. State is updated purely; every effect
    // happens beside it, exactly once.
    const updated = { ...answers };
    if (field === '_industry_clarify') updated.industry = `${answers.industry} (${value})`;
    else updated[actualField] = value;

    setAnswers(updated);
    addMessage('user', displayValue, actualField);

    // A REAL EBITDA clears the modelled flag: once the owner supplies the figure,
    // it is knowledge, not an estimate.
    if (actualField === 'ebitda' && value != null) setEstimated((e) => ({ ...e, ebitda: false }));

    // The question is ANSWERED (or deliberately skipped) — recorded once, so the
    // gap engine can never select it again and a skip is never re-asked.
    const answeredIds = Array.from(new Set([...(gap.answered_question_ids || []), actualField]));
    setGap((g) => ({ ...g, answered_question_ids: answeredIds, question_id: null, last_transition: `answered:${actualField}` }));
    setModelCompleteness(computeModelCompleteness(updated, extractedFacts));

    // Industry follow-up — a clarification, not a new field.
    if (field === 'industry') {
      trackMagicLoop(EVENT_NAMES.FIRST_QUESTION_ANSWERED, { field }, guestSessionId);
      const followUp = shouldAskFollowUp(field, value);
      if (followUp) {
        addEntry({
          type: 'question', field: followUp.field, inputType: followUp.inputType,
          prompt: followUp.prompt, sub: followUp.sub, options: followUp.options,
        });
        return;
      }
      fetchBenchmark(value);
    }

    // EBITDA: plausibility check + estimate offer — never a dead end.
    if (field === 'ebitda') {
      if (value == null) {
        addMessage('assistant', "No problem. Let me help you estimate it with a couple of easier questions.");
        addEntry({ type: 'estimate', data: { revenue: updated.revenue, benchmark } });
        setFlowState('estimating');
        return;
      }
      const check = checkEbitdaPlausibility(updated.revenue, value, benchmark);
      if (!check.ok && !confirmedAnomalies.ebitda) {
        setPlausibilityCheck({ ...check, field: 'ebitda', value });
        addEntry({ type: 'plausibility', data: { check, field: 'ebitda', value } });
        setFlowState('plausibility_check');
        return;
      }
    }

    if (field === 'employees' && value != null && updated.revenue != null) {
      const check = checkEmployeeRevenueRatio(value, updated.revenue);
      if (!check.ok && !confirmedAnomalies.employees) {
        setPlausibilityCheck({ ...check, field: 'employees', value });
        addEntry({ type: 'plausibility', data: { check, field: 'employees', value } });
        setFlowState('plausibility_check');
        return;
      }
    }

    // INTERPRET BEFORE ASKING (Part 6). A line is only said when it is derivable
    // from what the owner just told us. When nothing is derivable Galileo stays
    // quiet and simply progresses, which is what keeps the rhythm from sounding
    // scripted (Part 7). The question engine itself is untouched.
    const facts = resolveFacts({ answers: updated, verified, extractedFacts, estimated });
    const whyMessage = interpretAnswer(actualField, updated, facts)
      || getWhyItMattered(actualField, value, updated);
    if (whyMessage) addMessage('assistant', whyMessage);

    const progress = getDiscoveryProgress(updated);
    if (progress.hasEnoughForModel) rebuildModel(updated, {}, extractedFacts, benchmark);

    // ── THE FIRST RESPONSIBLE INSIGHT, GATED ON FACT KNOWLEDGE ───────────
    // The insight is built by the CONCLUSION READINESS GATE: it returns null
    // unless revenue AND EBITDA are both real, so answering "revenue" alone can
    // never produce a profitability statement. When a fact the conclusion needs
    // is missing, the sequence simply asks for it next — which is the whole point
    // of asking before interpreting. Shown once; never invented.
    const firstInsight = valueShownRef.current ? null : profitInsightLine(facts);
    if (firstInsight) {
      valueShownRef.current = true;
      setTimeout(() => addMessage('assistant', firstInsight), whyMessage ? 700 : 250);
    }

    const delay = firstInsight ? 1900 : whyMessage ? 1000 : 400;
    setTimeout(
      () => askNextDiscoveryQuestion(updated, actualField, { ...gap, answered_question_ids: answeredIds }),
      delay,
    );
  }, [answers, gap, guestSessionId, addMessage, addEntry, askNextDiscoveryQuestion, fetchBenchmark, benchmark, rebuildModel, confirmedAnomalies, extractedFacts]);

  // ── selectContext ───────────────────────────────────────────────────────────
  const selectContext = useCallback((ctx) => {
    setContext(ctx);
    trackMagicLoop(EVENT_NAMES.GUEST_STARTED, {}, guestSessionId);
    trackMagicLoop(EVENT_NAMES.CONTEXT_SELECTED, { context: ctx, label: CONTEXT_OPTIONS[ctx] }, guestSessionId);
    addMessage('user', CONTEXT_OPTIONS[ctx]);
    if (ctx === 'a_client') {
      addEntry({
        type: 'question', field: 'client_role', inputType: 'choice',
        prompt: "What's your role?",
        options: CLIENT_ROLES.map((r) => ({ value: r, label: r })),
      });
      setFlowState('client_role');
    } else {
      addEntry({ type: 'question', field: 'intent', ...intentQuestion() });
      setFlowState('intent');
    }
  }, [guestSessionId, addMessage, addEntry]);

  // ── selectClientRole ──────────────────────────────────────────────────────
  const selectClientRole = useCallback((role) => {
    setClientRole(role);
    addMessage('user', role);
    addEntry({ type: 'question', field: 'intent', ...intentQuestion() });
    setFlowState('intent');
  }, [addMessage, addEntry]);

  // ── selectIntent (depends on askNextDiscoveryQuestion) ─────────────────────
  const selectIntent = useCallback((intentKey) => {
    setIntent(intentKey);
    trackMagicLoop(EVENT_NAMES.INTENT_SELECTED, { intent: intentKey, label: INTENT_OPTIONS[intentKey] }, guestSessionId);
    addMessage('user', INTENT_OPTIONS[intentKey]);
    addMessage('assistant', "Great. Tell me a little about the business and I'll start seeing what's there.");
    setFlowState('discovering');
    askNextDiscoveryQuestion({});
  }, [guestSessionId, addMessage, askNextDiscoveryQuestion]);

  // ── handleConnectAction (depends on proceedToOpportunity) ──────────────────
  const handleConnectAction = useCallback((value) => {
    addMessage('user', value === 'share_financials' ? 'Share Financials' : 'Keep Exploring');
    if (value === 'share_financials') {
      trackMagicLoop(EVENT_NAMES.CONNECT_BUSINESS_SHOWN, {}, guestSessionId);
      addEntry({ type: 'action', variant: 'document_upload' });
      setFlowState('awaiting_upload');
    } else {
      // KEEP EXPLORING — a real continuation of the Knowledge Gap sequence. It
      // must never re-enter the prompt that produced it (that was the dead end).
      askNextRef.current?.(answers, null, gapRef.current);
    }
  }, [guestSessionId, addMessage, addEntry, answers]);

  // ── onDocumentUploaded ──────────────────────────────────────────────────────
  const onDocumentUploaded = useCallback((docMeta) => {
    setUploadedDocs((prev) => [...prev, docMeta]);
    trackMagicLoop(EVENT_NAMES.DOCUMENT_UPLOADED, {
      document_type: docMeta.document_type, file_count: uploadedDocs.length + 1,
    }, guestSessionId);
  }, [guestSessionId, uploadedDocs.length]);

  // ── startExtraction ────────────────────────────────────────────────────────
  const startExtraction = useCallback(() => {
    if (uploadedDocs.length === 0) return;
    setFlowState('learning');
    addEntry({ type: 'event', variant: 'extraction_start', data: { docCount: uploadedDocs.length } });
  }, [uploadedDocs, addEntry]);

  // ── completeLearning (depends on proceedToOpportunity) ─────────────────────
  const completeLearning = useCallback((extractionResult) => {
    const exFacts = extractionResult?.facts || {};
    const verifiedValues = {
      revenue: exFacts.annual_revenue?.normalized ?? null,
      ebitda: exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized ?? null,
    };
    setVerified(verifiedValues);
    setExtractedFacts(extractionResult);
    const updated = rebuildModel(answers, verifiedValues, extractionResult, benchmark);
    trackMagicLoop(EVENT_NAMES.DOCUMENT_ANALYSIS_COMPLETED, {
      fields_found: extractionResult?.fields_found || 0, period: extractionResult?.period || null,
    }, guestSessionId);
    trackMagicLoop(EVENT_NAMES.BUSINESS_MODEL_UPDATED, {
      completeness: updated.completeness, value_verified: verifiedValues.ebitda != null, document_supported: true,
    }, guestSessionId);
    addEntry({ type: 'event', variant: 'extraction_complete', data: { result: extractionResult } });
    setTimeout(() => {
      addMessage('assistant', "That changed the picture. Here's what I see now.");
      if (updated.signals.value) {
        addEntry({ type: 'insight', variant: 'value', data: { signal: updated.signals.value, model: updated, updated: true } });
      }
      if (updated.signals.profit?.benchmark) {
        addEntry({ type: 'insight', variant: 'profitability', data: { signal: updated.signals.profit, model: updated, updated: true } });
      }
      proceedToOpportunity(updated);
    }, 1000);
  }, [answers, benchmark, guestSessionId, addMessage, addEntry, rebuildModel, proceedToOpportunity]);

  // ── handleOpportunityAction (depends on showStrategies) ────────────────────
  const handleOpportunityAction = useCallback((value) => {
    addMessage('user', value === 'investigate' ? 'Investigate' : value === 'why' ? 'Why Galileo Thinks This' : 'Save This');
    if (value === 'investigate') {
      trackMagicLoop(EVENT_NAMES.INVESTIGATE_SELECTED, {}, guestSessionId);
      showStrategies();
    } else if (value === 'why') {
      trackMagicLoop(EVENT_NAMES.SHOW_ME_WHY_SELECTED, { opportunity_id: selectedOpportunity?.id }, guestSessionId);
      setDrawerState({ open: true, type: 'evidence', data: { opportunity: selectedOpportunity, extractedFacts } });
    } else if (value === 'save') {
      setSavePromptState('opportunity');
      addEntry({ type: 'action', variant: 'save_prompt', data: { type: 'opportunity', opportunity: selectedOpportunity } });
    }
  }, [guestSessionId, selectedOpportunity, extractedFacts, addMessage, addEntry, showStrategies]);

  // ── chooseStrategy ──────────────────────────────────────────────────────────
  const chooseStrategy = useCallback((strategy) => {
    setSelectedStrategy(strategy);
    addMessage('user', strategy);
    setMode('produce');
    addMessage('assistant', "Want to see what this could look like?");
    addEntry({ type: 'insight', variant: 'scenario', data: { strategy, opportunity: selectedOpportunity, model } });
    const implementActionId = addEntry({
      type: 'action', variant: 'implement',
      options: [
        { value: 'model', label: 'Model This', desc: 'See the potential impact' },
        { value: 'do_it', label: "Let's Do This", desc: 'Turn it into a plan' },
      ],
    });
    // A new fork is a NEW transition: the previous card's identity and state must
    // not leak into this one.
    setImplementationActionId(implementActionId);
    setImplementationPhase('idle');
    setImplementationError(null);
    implementationRetryRef.current = null;
    lastModelThisActionRef.current = null;
    setFlowState('implementing');
  }, [selectedOpportunity, model, addMessage, addEntry]);

  // ── handleImplementationAction ─────────────────────────────────────────────
  // MODEL THIS IS A TRANSITION, NOT AN INSPECTOR (§7, §13).
  //
  // Before: it opened the Scenario Detail SIDE DRAWER — a shallow detail view for
  // a moment that is not shallow at all. The owner had gone from discovery to
  // "I want to see what I could actually do about this", and a drawer treats that
  // as a footnote.
  //
  // Now: it creates/activates the canonical Scenario (the existing lever mapping,
  // preserved in the existing saved store) and hands the owner into the main
  // surface with the context carried forward — opportunity, strategy, known facts
  // with their epistemic states, evidence, confidence, and the answers already
  // given. The drawer is untouched and still opens for reviewing an existing
  // scenario, which is what it is actually good at.
  const handleImplementationAction = useCallback((value, isRetry = false) => {
    if (!isRetry) addMessage('user', value === 'model' ? 'Model This' : "Let's Do This");
    if (value === 'model') {
      // IDEMPOTENT: the same action can only ever produce ONE transition, however
      // many times it is clicked. The scenario store enforces this too, so a
      // duplicate can never create a second saved scenario.
      if (!isRetry && implementationActionId && lastModelThisActionRef.current === implementationActionId) return;
      lastModelThisActionRef.current = implementationActionId;

      setImplementationPhase('resolving');
      setImplementationError(null);

      // The attempt's OWN inputs, kept so a retry re-runs this exact transition —
      // the answers and the resolved financial facts are never re-derived or
      // re-asked on the way back.
      implementationRetryRef.current = {
        opportunity: selectedOpportunity,
        strategy: selectedStrategy,
        model,
        answers,
        intent,
        facts: resolveFacts({ answers, verified, extractedFacts, estimated }),
        guestSessionId,
        businessId: activeBusinessId,
        sourceActionId: implementationActionId,
      };

      let record = null;
      try {
        record = activateScenario({ ...implementationRetryRef.current });
      } catch (error) {
        // A failed transition is a STATE the surface can show — never a silent
        // fall-through that looks like a different feature.
        setImplementationPhase('error');
        setImplementationError('Galileo could not model this scenario. Your answers are safe.');
        return;
      }
      if (record) {
        trackMagicLoop(EVENT_NAMES.INVESTIGATE_SELECTED, {
          opportunity_id: selectedOpportunity?.id, scenario_key: record.scenario?.key || null,
        }, guestSessionId);
        setActiveScenario(record);
        setFlowState('exploring');
        setImplementationPhase('ready');
        return;
      }
      // Nothing to explore (no opportunity/strategy) — fall through to the plan
      // path rather than dead-ending the click.
      setImplementationPhase('idle');
    }
    addMessage('assistant', "Perfect. Let's turn it into a plan.");
    addMessage('assistant', "How involved do you want to be?");
    addEntry({
      type: 'action', variant: 'guide_choice',
      options: [
        { value: 'guide_me', label: 'Do It With Galileo', desc: 'Give me the plan, tools and guidance' },
        { value: 'expert', label: 'Work With An Expert', desc: 'Bring in the right professional' },
        { value: 'not_yet', label: 'Not Yet', desc: 'Save this for later' },
      ],
    });
  }, [selectedStrategy, selectedOpportunity, model, answers, intent, verified, extractedFacts, estimated, guestSessionId, activeBusinessId, addMessage, addEntry, implementationActionId]);

  // ── retryImplementation ────────────────────────────────────────────────────
  // The retry re-runs the SAME payload the failed attempt used: same answers,
  // same resolved facts, same source action. Nothing already given is asked again.
  const retryImplementation = useCallback(() => {
    handleImplementationAction('model', true);
  }, [handleImplementationAction]);

  // ── handleGuideChoice ──────────────────────────────────────────────────────
  const handleGuideChoice = useCallback((choice) => {
    setImplementationChoice(choice);
    addMessage('user', choice === 'guide_me' ? 'Do It With Galileo' : choice === 'expert' ? 'Work With An Expert' : 'Not Yet');
    if (choice === 'guide_me') {
      trackMagicLoop(EVENT_NAMES.GUIDE_ME_SELECTED, { opportunity_id: selectedOpportunity?.id, strategy: selectedStrategy }, guestSessionId);
      addMessage('assistant', "Great. I'll turn this into a 90-day plan with milestones, actions, and progress tracking.");
      addEntry({ type: 'insight', variant: 'sprint_preview', data: { opportunity: selectedOpportunity, strategy: selectedStrategy } });
    } else if (choice === 'expert') {
      trackMagicLoop(EVENT_NAMES.EXPERT_SELECTED, { opportunity_id: selectedOpportunity?.id, strategy: selectedStrategy }, guestSessionId);
      addMessage('assistant', "I'll prepare the context so your expert doesn't have to start from scratch — your business model, the opportunity, the evidence, and the strategy.");
      addEntry({ type: 'insight', variant: 'expert_preview', data: { opportunity: selectedOpportunity, strategy: selectedStrategy } });
    }
    setTimeout(() => {
      trackMagicLoop(EVENT_NAMES.SAVE_BUSINESS_SHOWN, {}, guestSessionId);
      addEntry({ type: 'insight', variant: 'preservation', data: { model, opportunity: selectedOpportunity } });
      setFlowState('saving');
    }, 1000);
  }, [selectedOpportunity, selectedStrategy, model, guestSessionId, addMessage, addEntry]);

  // ── saveBusiness ────────────────────────────────────────────────────────────
  const saveBusiness = useCallback(async () => {
    trackMagicLoop(EVENT_NAMES.SAVE_BUSINESS_CLICKED, {}, guestSessionId);
    trackMagicLoop(EVENT_NAMES.ACCOUNT_PROMOTION_STARTED, {}, guestSessionId);
    try {
      const businessSnapshot = {
        businesses: [{
          business_name: answers.industry ? `My ${answers.industry} Business` : 'My Business',
          industry: answers.industry, entity_type: 'unknown',
          business_family_type: 'operating_company', ownership_percentage: 100, is_primary_owner: true,
        }],
      };
      const assessmentAnswers = buildAssessmentAnswersForPromotion(answers, verified, extractedFacts);
      let existingExtractedFacts = {};
      try {
        const sessRes = await base44.functions.invoke('guestSessionService', {
          action: 'getGuestSession', data: { guest_session_id: guestSessionId },
        });
        existingExtractedFacts = sessRes.data?.session?.business_snapshot?.extracted_facts || {};
      } catch { /* non-fatal */ }
      const mergedExtractedFacts = { ...existingExtractedFacts };
      if (extractedFacts) {
        const key = extractedFacts.original_filename || extractedFacts.temp_document_id || 'latest_doc';
        mergedExtractedFacts[key] = extractedFacts;
      }
      await base44.functions.invoke('guestSessionService', {
        action: 'updateGuestSession',
        data: {
          guest_session_id: guestSessionId,
          updates: {
            business_snapshot: { ...businessSnapshot, extracted_facts: mergedExtractedFacts },
            assessment_answers: assessmentAnswers,
            // WHICH discovery the guest was actually looking at — a token, not
            // content. Promotion re-derives every opportunity server-side and uses
            // this only to choose which of ITS OWN candidates to resume. Nothing
            // here can invent an opportunity, a value or a confidence.
            state_snapshot: { explored_opportunity_key: selectedOpportunity?.id || null },
          },
        },
      });
    } catch { /* non-fatal */ }
    await persistGuestConversation(guestSessionId, conversation);
    sessionStorage.setItem('vision_promote_guest_session', 'true');
    sessionStorage.setItem('vision_guest_session_id', guestSessionId);
    window.location.href = '/journey-signup';
  }, [guestSessionId, answers, verified, extractedFacts, conversation]);

  // ── Pulse + drawer ──────────────────────────────────────────────────────────
  const onPulseClick = useCallback((domain) => {
    setActivePulseDomain(domain);
    setDrawerState({ open: true, type: 'pulse_domain', data: { domain, model } });
  }, [model]);

  const closeDrawer = useCallback(() => {
    setDrawerState({ open: false, type: null, data: null });
    setActivePulseDomain(null);
  }, []);

  // ── handleSavePrompt ────────────────────────────────────────────────────────
  const handleSavePrompt = useCallback((action) => {
    if (action === 'save') {
      saveBusiness();
    } else {
      // CONTINUE — asks the next highest-value question. It never re-renders the
      // state that produced this prompt: that re-entry WAS the reported loop.
      setSavePromptState(null);
      askNextRef.current?.(answers, null, gapRef.current);
    }
  }, [saveBusiness, answers]);

  // ── handlePlausibilityResponse ─────────────────────────────────────────────
  const handlePlausibilityResponse = useCallback((response) => {
    const check = plausibilityCheck;
    if (!check) return;
    const labelMap = { confirm: "Yes, that's right", estimate: 'Help me estimate it', re_enter: 'I meant something else', use_doc: 'Use the document', use_user: 'Use my number' };
    addMessage('user', labelMap[response] || response);

    if (response === 'confirm') {
      setConfirmedAnomalies((prev) => ({ ...prev, [check.field]: true }));
      setPlausibilityCheck(null);
      const whyMessage = getWhyItMattered(check.field, check.value, answers);
      if (whyMessage) addMessage('assistant', whyMessage);
      setTimeout(() => askNextDiscoveryQuestion(answers, check.field), whyMessage ? 1000 : 400);
    } else if (response === 'estimate') {
      setPlausibilityCheck(null);
      addMessage('assistant', "Let me help you estimate it.");
      addEntry({ type: 'estimate', data: { revenue: answers.revenue, benchmark } });
      setFlowState('estimating');
    } else if (response === 're_enter') {
      setPlausibilityCheck(null);
      const q = getNextQuestion(answers, intent);
      if (q && q.field === check.field) {
        addEntry({
          type: 'question', field: q.field, inputType: q.inputType,
          prompt: q.prompt, sub: q.sub, placeholder: q.placeholder,
          prefix: q.prefix, options: q.options, allowSkip: q.allowSkip,
        });
      }
    }
  }, [plausibilityCheck, answers, benchmark, intent, addMessage, addEntry, askNextDiscoveryQuestion]);

  // ── handleEstimateComplete ──────────────────────────────────────────────────
  const handleEstimateComplete = useCallback((estimateAnswers) => {
    const estimate = getEstimateFromAnswers(answers.revenue, estimateAnswers, benchmark);
    setEstimateData(null);
    if (estimate && estimate.ebitda != null) {
      // ONE PASS, OUTSIDE THE UPDATER — the same repair as answerDiscoveryQuestion.
      // An effect that runs inside a state updater can run twice, which is exactly
      // how one estimate produced duplicate Galileo responses.
      const updated = { ...answers, ebitda: estimate.ebitda };
      setAnswers(updated);
      // MODELLED, and recorded as such. It can support a conclusion, but the
      // conclusion will say it is an estimate — it is never knowledge.
      setEstimated((e) => ({ ...e, ebitda: true }));
      const answeredIds = Array.from(new Set([...(gap.answered_question_ids || []), 'ebitda']));
      setGap((g) => ({ ...g, answered_question_ids: answeredIds, question_id: null, last_transition: 'answered:ebitda' }));
      addMessage('assistant', `Based on what you told me, I'd estimate your EBITDA at about ${fmt(estimate.ebitda)}. That's a modeled estimate — sharing financials would make this much more precise.`);
      setModelCompleteness(computeModelCompleteness(updated, extractedFacts));
      rebuildModel(updated, {}, extractedFacts, benchmark);
      // A modelled EBITDA is enough for the same first insight — stated once, and
      // stated as modelled. Still gated: the line exists only because the metric
      // is now genuinely computable.
      const estimateFacts = resolveFacts({ answers: updated, verified, extractedFacts, estimated: { ebitda: true } });
      const firstInsight = valueShownRef.current ? null : profitInsightLine(estimateFacts);
      if (firstInsight) {
        valueShownRef.current = true;
        setTimeout(() => addMessage('assistant', firstInsight), 900);
      }
      const whyMessage = getWhyItMattered('ebitda', estimate.ebitda, updated);
      if (whyMessage) setTimeout(() => addMessage('assistant', whyMessage), 600);
      setTimeout(() => askNextDiscoveryQuestion(updated, 'ebitda', { ...gap, answered_question_ids: answeredIds }), 1500);
      return;
    }
    addMessage('assistant', "That's okay — I'll work with what I have. You can share financials later to refine.");
    setTimeout(() => askNextDiscoveryQuestion(answers, null, gapRef.current), 600);
  }, [answers, gap, benchmark, extractedFacts, addMessage, addEntry, rebuildModel, askNextDiscoveryQuestion]);

  // ── handleEstimateCancel ────────────────────────────────────────────────────
  const handleEstimateCancel = useCallback(() => {
    setEstimateData(null);
    addMessage('user', 'Go back');
    addMessage('assistant', "No problem — let's keep going with what we have.");
    setTimeout(() => askNextDiscoveryQuestion(answers), 400);
  }, [answers, addMessage, addEntry, askNextDiscoveryQuestion]);

  // ── onImproveConfidence ────────────────────────────────────────────────────
  const onImproveConfidence = useCallback(() => {
    addMessage('user', 'Improve confidence');
    addMessage('assistant', "The fastest way is to share a financial statement. I'll read it and update everything.");
    addEntry({ type: 'action', variant: 'document_upload' });
    setFlowState('awaiting_upload');
  }, [addMessage, addEntry]);

  // ── respond (routes to the right handler) ──────────────────────────────────
  const respond = useCallback((field, value, displayValue) => {
    switch (field) {
      case 'context': selectContext(value); break;
      case 'client_role': selectClientRole(value); break;
      case 'intent': selectIntent(value); break;
      case '_industry_clarify':
      case 'industry':
      case 'revenue':
      case 'ebitda':
      case 'employees':
      case 'involvement':
      case 'goal':
        answerDiscoveryQuestion(field, value, displayValue); break;
      default: break;
    }
  }, [selectContext, selectClientRole, selectIntent, answerDiscoveryQuestion]);

  // ── handleConversationAction (routes plausibility/estimate/improve responses) ──
  const handleConversationAction = useCallback((type, value) => {
    switch (type) {
      case 'plausibility': handlePlausibilityResponse(value); break;
      case 'estimate_complete': handleEstimateComplete(value); break;
      case 'estimate_cancel': handleEstimateCancel(); break;
      case 'improve_confidence': onImproveConfidence(); break;
      default: break;
    }
  }, [handlePlausibilityResponse, handleEstimateComplete, handleEstimateCancel, onImproveConfidence]);

  // ── Guest session + auth init ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sid = getGuestSessionId();
      if (!cancelled) setGuestSessionId(sid);
      try {
        const authed = await base44.auth.isAuthenticated();
        if (!cancelled) setIsAuthenticated(authed);
      } catch { if (!cancelled) setIsAuthenticated(false); }
      if (sid && !sessionEnsured.current) {
        sessionEnsured.current = true;
        try {
          const res = await base44.functions.invoke('guestSessionService', {
            action: 'getGuestSession', data: { guest_session_id: sid },
          });
          if (!res.data?.exists) {
            await base44.functions.invoke('guestSessionService', {
              action: 'createGuestSession', data: { guest_session_id: sid },
            });
          }
        } catch { /* non-fatal */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── RESUME, do not restart (§O15 / §O19) ───────────────────────────────────
  // The first-run conversation is preserved for the life of the tab, so a refresh
  // RESUMES the same subject, intent, answers and gap state instead of replaying
  // M0. It is session-scoped by construction and maps onto the canonical answer
  // fields — no parallel business model, nothing written server-side before the
  // owner chooses to preserve anything.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PROGRESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.started) return;
      startedRef.current = true;
      const restored = Array.isArray(saved.conversation) ? saved.conversation : [];
      // Continue the entry id sequence past the restored ids so React keys stay
      // unique across a resume (a collision would silently drop a message).
      entryIdCounter = restored.reduce((max, e) => {
        const n = Number(String(e?.id || '').replace(/[^0-9]/g, ''));
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, entryIdCounter);
      setConversation(restored);
      setContext(saved.context ?? null);
      setIntent(saved.intent ?? null);
      setClientRole(saved.clientRole ?? null);
      setAnswers((prev) => ({ ...prev, ...(saved.answers || {}) }));
      setGap(saved.gap || { answered_question_ids: [], question_id: null, milestone: 'M0', last_transition: 'resumed' });
      valueShownRef.current = !!saved.valueShown;
      setFlowState(saved.flowState || 'discovering');
      // A refresh must not lose the exploration: the active scenario is restored
      // from its own session record, so the main surface resumes ON the scenario
      // it was handed (§16 — back/refresh/resume never corrupts the state).
      setActiveScenario(readActiveScenario());
    } catch {
      // A corrupt snapshot must never block the conversation — M0 simply starts.
    }
  }, []);

  // ── Persist session progression (best-effort, tab-scoped) ──────────────────
  useEffect(() => {
    if (!startedRef.current) return;
    try {
      sessionStorage.setItem(PROGRESSION_KEY, JSON.stringify({
        started: true, context, intent, clientRole, answers, gap, flowState,
        valueShown: valueShownRef.current, conversation: conversation.slice(-24),
      }));
    } catch { /* best-effort */ }
  }, [context, intent, clientRole, answers, gap, flowState, conversation]);

  // ── Start the conversation ──────────────────────────────────────────────────
  // `autoStart` is false while the Vision arrival owns the screen, so the subject
  // question is never asked twice: the arrival asks it, and the choice it returns
  // flows into the SAME `selectContext` path this start would have led to. Every
  // other case — authenticated onboarding, a resumed session, any surface that is
  // not the arrival — starts exactly as it always has.
  const startConversation = useCallback(() => {
    if (startedRef.current || conversation.length > 0 || flowState !== 'welcoming') return;
    startedRef.current = true;
    addMessage('assistant', "Let's see what your business is capable of.");
    addEntry({
      type: 'question', field: 'context', inputType: 'choice',
      options: [
        { value: 'my_business', label: 'My Business', desc: 'I run it' },
        { value: 'a_client', label: 'A Client', desc: 'I advise one' },
      ],
    });
  }, [conversation.length, flowState, addMessage, addEntry]);

  useEffect(() => {
    if (!autoStart) return;
    startConversation();
  }, [autoStart, startConversation]);

  // ── Initialize saved items, scoped to the active business ───────────────────
  // Guests (no business) keep the unscoped session store; authenticated saves
  // belong to the active business. The business is a dependency rather than a
  // mount-time capture because this hook also runs on the /galileo route, which
  // is outside the layout remount boundary.
  useEffect(() => {
    setSavedItems(getSavedItems(activeBusinessId));
  }, [activeBusinessId]);

  // ── Phase 4: Save handler ────────────────────────────────────────────────────
  const handleSave = useCallback((type, title, data) => {
    const result = saveItem({ type, title, data }, activeBusinessId);
    setSavedItems(result.items);
    return result;
  }, [activeBusinessId]);

  // ── Phase 4: NOW surface action handler ──────────────────────────────────────
  const handleNowAction = useCallback((actionValue) => {
    if (actionValue === 'investigate') {
      handleOpportunityAction('investigate');
    } else if (actionValue === 'view_benchmark') {
      onPulseClick('profit');
    } else if (actionValue === 'view_results') {
      closeDrawer();
    } else if (actionValue === 'view_plays') {
      // Navigate to plays — future enhancement
    }
    setNowItem(null);
  }, [handleOpportunityAction, onPulseClick, closeDrawer]);

  // ── Phase 4: Canvas object click handler ─────────────────────────────────────
  const handleCanvasObjectClick = useCallback((obj) => {
    if (obj.type === 'opportunity') {
      setDrawerState({ open: true, type: 'evidence', data: { opportunity: obj.data, extractedFacts } });
    } else if (obj.type === 'value_estimate') {
      onPulseClick('value');
    } else if (obj.type === 'benchmark') {
      onPulseClick('profit');
    }
  }, [extractedFacts, onPulseClick]);

  // ── THE MODEL THIS HANDOFF ───────────────────────────────────────────────────
  // The active scenario is read from the SAME record the arriving surface
  // continues, so what the owner sees on arrival is what they were actually
  // exploring — not a reconstruction. Session-scoped and refresh-safe; returning
  // to the conversation marks it returned so the continuation is never pushed at
  // the owner twice.
  // A failed or in-flight transition is ALSO a surface state: without this the
  // error would fall back to the conversation and look like nothing happened.
  const showContinuation = (!!activeScenario && !activeScenario.returned)
    || implementationPhase === 'error'
    || implementationPhase === 'resolving';
  const continuation = showContinuation ? scenarioContinuation(activeScenario) : null;

  // Closing the continuation because ANOTHER path was chosen (a plan, an expert)
  // only marks it returned: the flow being entered says what happens next, so a
  // completion line here would be noise.
  const closeContinuation = useCallback(() => {
    setActiveScenario(markScenarioReturned());
    setImplementationPhase('idle');
    setImplementationError(null);
  }, []);

  // ── RETURNING MOVES FORWARD, NEVER BACK INTO THE SAME FORK ───────────────────
  // The outcome is appended to the conversation, so the Model This card is no
  // longer the latest entry and recedes instead of re-offering the exact choice
  // that produced this screen. That re-entry WAS the dead end.
  const returnToConversation = useCallback(() => {
    const explored = activeScenario?.strategy || selectedStrategy;
    closeContinuation();
    addMessage(
      'assistant',
      explored
        ? `I've kept this exploration of ${explored} with your saved items. We can keep going from here.`
        : "I've kept that exploration with your saved items. We can keep going from here.",
    );
  }, [activeScenario, closeContinuation, addMessage, selectedStrategy]);

  // ── Phase 4: Computed experience state ───────────────────────────────────────
  const experienceState = inferExperienceState({
    flowState, answers, model, selectedOpportunity, selectedStrategy,
    implementationChoice, isAuthenticated, isReturningUser: false,
    uploadedDocs, hasSavedItems: savedItems.length > 0, activeSprints: 0,
  });

  const inferredMode = inferMode({
    state: experienceState.state,
    implementationChoice,
    activeSprints: 0,
  });

  // ── Phase 4: Computed signal awakening states ────────────────────────────────
  const signalStates = computeSignalStates(model, answers, extractedFacts, activePulseDomain);

  // ONE reading of the financial facts, with provenance — the same call the Model
  // This transition makes, so the preview can never describe a fact differently
  // from the transition that handed over to it.
  const financialFacts = resolveFacts({ answers, verified, extractedFacts, estimated });
  const awakeningProgress = getAwakeningProgress(signalStates);

  // ── Phase 4: Computed canvas objects (persistent intelligence) ───────────────
  const canvasObjects = extractCanvasObjects(conversation);
  const showCanvasObjects = shouldShowCanvasObjects(flowState, canvasObjects);

  // ── Phase 4: Computed NOW surface item ───────────────────────────────────────
  useEffect(() => {
    const item = selectNowItem({
      model, answers, extractedFacts, flowState,
      savedCount: savedItems.length, isAuthenticated,
      isReturningUser: false, activeSprints: 0,
    });
    setNowItem(item);
  }, [model, answers, extractedFacts, flowState, savedItems, isAuthenticated]);

  return {
    conversation, context, clientRole, intent, answers, verified, extractedFacts,
    model, benchmark, benchmarkLoading, uploadedDocs, selectedOpportunity,
    selectedStrategy, implementationChoice, mode: inferredMode, activePulseDomain,
    drawerState, savePromptState, isAuthenticated, guestSessionId, flowState, isThinking,
    // The arrival owns the opening; it hands off to this start when it does not.
    startConversation,
    confirmedAnomalies, modelCompleteness, plausibilityCheck, estimateData,
    // ── Onboarding progression (the single knowledge-gap state) ──────────────
    // Exposed for the shell and for the O-series regression harness: the question
    // currently on screen, everything already answered or skipped, the milestone
    // reached, and why the last transition happened.
    gap,
    milestone: gap.milestone,
    knowledgeMilestones: KNOWLEDGE_MILESTONES,
    answeredQuestionIds: gap.answered_question_ids,
    currentQuestionId: gap.question_id,
    lastTransition: gap.last_transition,
    // Phase 4 additions
    experienceState: experienceState.state,
    signalStates, awakeningProgress,
    canvasObjects, showCanvasObjects,
    nowItem, savedItems,
    // The MODEL THIS handoff — the canonical scenario the main surface continues
    activeScenario, showContinuation, continuation, returnToConversation, closeContinuation,
    // The transition's explicit state: resolving → ready, or error with a retry
    // that reuses the attempt's own inputs.
    implementationPhase, implementationError, retryImplementation,
    // The canonical fact reading (with provenance) the preview renders.
    financialFacts,
    // Handlers
    respond, handleConnectAction, onDocumentUploaded, startExtraction, completeLearning,
    handleOpportunityAction, chooseStrategy, handleImplementationAction, handleGuideChoice,
    handleSavePrompt, saveBusiness, onPulseClick, closeDrawer,
    handlePlausibilityResponse, handleEstimateComplete, handleEstimateCancel,
    onImproveConfidence, handleConversationAction,
    handleSave, handleNowAction, handleCanvasObjectClick,
    CONTEXT_OPTIONS, INTENT_OPTIONS, CLIENT_ROLES,
  };
}

/**
 * buildAssessmentAnswersForPromotion — maps conversation answers into
 * the assessment_answers shape that promoteGuestSession expects.
 * (Preserved from useGalileoMagicLoop — same promotion logic.)
 */
function buildAssessmentAnswersForPromotion(answers, verified, extractedFacts) {
  const now = new Date().toISOString();
  const exFacts = extractedFacts?.facts || {};
  const revenue = exFacts.annual_revenue?.normalized ?? verified.revenue ?? answers.revenue;
  const ebitda = exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized ?? verified.ebitda ?? answers.ebitda;
  const out = {};
  if (revenue > 0 && ebitda != null) {
    const margin = (ebitda / revenue) * 100;
    out.value_gap = {
      answers: { v2_ebitda: ebitda, v2_mult: 4, v2_mult_top: 9.5, v2_strat: 40 },
      results: {
        current_value: ebitda * 4,
        potential_value: ebitda * (4 + (9.5 - 4) * 0.4),
        value_gap: Math.max(0, ebitda * (4 + (9.5 - 4) * 0.4) - ebitda * 4),
      },
      completed_at: now,
    };
    // Phase 6B.1 — the Magic Loop collects EBITDA, NOT net profit. Writing that
    // number into `p1_mymargin` (a field the Profit Gap question defines as a NET
    // PROFIT margin) is exactly the conflation this phase exists to close.
    // The value is stored under its correct name, and no profit comparison is
    // fabricated: the previous hardcoded zeroes presented invented precision.
    out.profit_gap = {
      answers: {
        p1_rev: revenue,
        ebitda_margin: Math.round(margin * 10) / 10,
        margin_semantics: MARGIN_METRIC.EBITDA_MARGIN,
      },
      results: {
        profit_score: null,
        profit_gap: null,
        profit_gap_to_avg: null,
        position: PROFIT_POSITION.NEEDS_VERIFICATION,
        semantics_note: 'Collected as an EBITDA margin. A net profit margin is required before any benchmark comparison.',
      },
      completed_at: now,
    };
  }
  if (answers.involvement) {
    const scoreMap = { light: 75, moderate: 58, heavy: 33 };
    const opsScore = scoreMap[answers.involvement] || 50;
    out.operations_gap = { answers: { involvement: answers.involvement }, results: { operations_score: opsScore }, completed_at: now };
    out.freedom_assessment = { answers: { involvement: answers.involvement }, results: { freedom_score: opsScore }, completed_at: now };
  }
  return out;
}