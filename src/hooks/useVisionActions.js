/**
 * useVisionActions — the ONE place Vision Home's interactions are routed.
 *
 * Every control on Home resolves through a handler here, so a label and its
 * behaviour can be checked in one file (see src/VISION_INTERACTION_CONTRACT.md).
 *
 * CONTINUITY
 * The owner's current intent travels between surfaces as plain in-memory
 * context — the guide context, the team handoff, the implementation preview
 * context and the focused opportunity. Nothing new is persisted. All of it is
 * dropped on a move from one real business to another.
 *
 * Nothing here computes business data. It only decides where an action goes
 * and what context goes with it, using the existing engines underneath.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAskGalileo } from '@/hooks/useAskGalileo';
import { useWhatIf } from '@/hooks/useWhatIf';
import { useMembership } from '@/lib/useMembership';
import { useAdvisorRelationship } from '@/hooks/useAdvisorRelationship';
import { useImplementationPlan } from '@/hooks/useImplementationPlan';
import { resolveImplementationAccess } from '@/lib/galileo/implementationAccess';
import { resolveNextStep, NextStepKind, buildFollowUpQuestion } from '@/lib/galileo/nextStepResolver';
import { opportunityPlanContext, opportunityRecord } from '@/lib/galileo/opportunityContext';
import { registerGalileoBridge } from '@/lib/galileo/explainGalileo';

const BUSINESS_BOUND_VIEWS = ['guide', 'expert', 'implementation', 'opportunity'];

// "Show me my documents" is a request about a real surface, not a question to be
// answered in prose: it opens the document overlay.
const DOCUMENT_LIST_INTENT =
  /^\s*(show|see|open|list|view|where are|find|pull up)\b[^?]*\b(documents?|files?|uploads?)\b/i;

// "See what Galileo found" is a promise of an ANSWER. It asks about THE document
// that was just understood — the exact document travels as the canonical focused
// record (focused_record_type / focused_record_id), which the server re-resolves
// for itself inside the authorized business. A generic prompt with no document
// context would be a different, weaker question, and the label would be a lie.
const DOCUMENT_FINDINGS_QUESTION = 'Tell me what you found in this document.';

export function useVisionActions({ home, openPlaybook, onOpenWorkspace }) {
  const askInputRef = useRef(null);
  const askSectionRef = useRef(null);
  const galileo = useAskGalileo();
  const { ask, answer, error } = galileo;
  const whatIf = useWhatIf();
  const membership = useMembership();
  const businessId = home.business?.id || null;
  const advisor = useAdvisorRelationship(businessId);
  const plan = useImplementationPlan(businessId);

  const [focusedOpportunity, setFocusedOpportunity] = useState(null);
  const [opportunityReturn, setOpportunityReturn] = useState('playbook');
  const [guideContext, setGuideContext] = useState(null);
  const [handoffContext, setHandoffContext] = useState(null);
  const [previewContext, setPreviewContext] = useState(null);

  const setView = home.setHomeView;
  const homeViewRef = useRef(home.homeView);
  homeViewRef.current = home.homeView;

  const hasActiveSprint = (home.sprints?.length || 0) > 0;

  // ── Access, resolved once ────────────────────────────────────────────────
  const access = useMemo(
    () =>
      resolveImplementationAccess({
        membership,
        advisor,
        context: {
          implementationExists:
            hasActiveSprint || (home.opportunities || []).some((o) => o.status === 'active'),
        },
      }),
    [membership, advisor, hasActiveSprint, home.opportunities]
  );
  const planAccess = useMemo(
    () =>
      resolveImplementationAccess({
        membership,
        advisor,
        context: { mode: 'plan', implementationExists: hasActiveSprint },
      }),
    [membership, advisor, hasActiveSprint]
  );

  // ── Business-switch isolation ────────────────────────────────────────────
  const prevBusinessRef = useRef(null);
  useEffect(() => {
    const nextId = businessId;
    const prevId = prevBusinessRef.current;
    prevBusinessRef.current = nextId;
    if (!nextId || !prevId || prevId === nextId) return;
    setGuideContext(null);
    setHandoffContext(null);
    setFocusedOpportunity(null);
    setPreviewContext(null);
    if (BUSINESS_BOUND_VIEWS.includes(homeViewRef.current)) setView('home');
  }, [businessId, setView]);

  // ── Documents (Global Rule #1) ───────────────────────────────────────────
  // Documents live INSIDE the Galileo experience: these two actions open the
  // document overlay, never a separate file-management destination.
  //   openDocuments → the owner's library (and "show me my documents")
  //   openUpload    → the existing uploader, carrying the need in words
  const openDocuments = useCallback(
    () => onOpenWorkspace?.('data-room', null, { mode: null, needs: null }),
    [onOpenWorkspace]
  );
  const openUpload = useCallback(
    (needs = null) => onOpenWorkspace?.('data-room', null, { mode: 'upload', needs: needs || null }),
    [onOpenWorkspace]
  );

  // ── Galileo ──────────────────────────────────────────────────────────────
  const handleAsk = useCallback(
    (question, options = {}) => {
      if (!question) return;
      if (DOCUMENT_LIST_INTENT.test(question)) {
        openDocuments();
        return;
      }
      home.handleGoalInput(question);
      ask(question, options);
    },
    [home, ask, openDocuments]
  );

  /**
   * Ask from ANY surface: return to where answers render, then ask.
   * `options.focus` is the object this control speaks FOR (see useAskGalileo) —
   * one mechanism for context, never a second description of it.
   */
  const askInContext = useCallback(
    (question, options = {}) => {
      setView('home');
      if (question) handleAsk(question, options);
      else requestAnimationFrame(() => askInputRef.current?.focus());
    },
    [setView, handleAsk]
  );

  useEffect(() => {
    if (answer || error) askSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [answer, error]);

  // ── Explain-with-Galileo bridge (Global Rule #2) ─────────────────────────
  // An explanation affordance anywhere on Vision hands its question to THIS ask
  // bar. One assistant, not two — the same useAskGalileo underneath.
  useEffect(() => registerGalileoBridge(({ question }) => askInContext(question)), [askInContext]);

  // A question carried in from a surface that had no live ask bar (?ask=…) is
  // asked here and cleared from the URL, so a refresh cannot re-ask it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const carried = params.get('ask');
    if (!carried) return;
    params.delete('ask');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    askInContext(carried);
  }, []);

  // ── Simple destinations ──────────────────────────────────────────────────
  const openPlaybookAll = useCallback(() => openPlaybook(null), [openPlaybook]);
  const openWhatIf = useCallback(() => setView('whatif'), [setView]);
  const openExpert = useCallback(() => setView('expert'), [setView]);
  const openSprint = useCallback(() => onOpenWorkspace?.('sprint'), [onOpenWorkspace]);

  // ── Implementation preview ───────────────────────────────────────────────
  const openPreview = useCallback(
    (ctx) => {
      if (!ctx?.title) return;
      setPreviewContext({ ...ctx, returnView: ctx.returnView || homeViewRef.current });
      plan.preview({ title: ctx.title, goal: ctx.goal });
      setView('implementation');
    },
    [plan, setView]
  );

  const previewGalileo = useCallback(async () => {
    // One active Sprint at a time: an existing one is continued, never replaced
    // silently. Replacing stays inside the Sprint workspace, which confirms it.
    if (hasActiveSprint) {
      openSprint();
      return;
    }
    const ctx = previewContext;
    if (!ctx) return;
    const sprint = await plan.build({
      title: ctx.title,
      goal: ctx.goal,
      summary: ctx.summary,
      opportunityId: ctx.opportunityId,
      tasks: plan.plan.tasks,
    });
    if (sprint) {
      home.reloadWork?.();
      openSprint();
    }
  }, [hasActiveSprint, openSprint, previewContext, plan, home]);

  const handOff = useCallback(
    (ctx) => {
      setHandoffContext({ businessName: home.business?.name || null, assumptions: [], ...ctx });
      setView('expert');
    },
    [home.business, setView]
  );

  const guide = useCallback(
    (ctx) => {
      setGuideContext({ assumptions: [], ...ctx });
      setView('guide');
    },
    [setView]
  );

  const previewTeam = useCallback(() => {
    const c = previewContext;
    handOff({ question: c?.question || c?.title || null, answerText: c?.goal || null, nextStep: c?.title || null });
  }, [previewContext, handOff]);

  // ── Galileo answer → next step ───────────────────────────────────────────
  const nextStep = useMemo(() => resolveNextStep({ answer, home, hasWhatIf: true }), [answer, home]);

  const runDestination = useCallback(
    (step) => {
      if (!step) return;
      switch (step.kind) {
        case NextStepKind.WORKSPACE:
          if (step.target) onOpenWorkspace?.(step.target);
          break;
        case NextStepKind.PLAYBOOK:
          openPlaybookAll();
          break;
        case NextStepKind.SPRINT:
          openSprint();
          break;
        case NextStepKind.DOMAIN:
          if (step.target) home.handleDomainClick(step.target);
          break;
        case NextStepKind.WHATIF:
          openWhatIf();
          break;
        case NextStepKind.FOLLOWUP:
          handleAsk(buildFollowUpQuestion(answer));
          break;
        default:
          break;
      }
    },
    [onOpenWorkspace, openPlaybookAll, openSprint, home, openWhatIf, handleAsk, answer]
  );

  const answerContext = useCallback(
    () => ({
      question: answer?.question || null,
      answerText: answer?.text || null,
      nextStep: nextStep.text || answer?.nextStep || null,
    }),
    [answer, nextStep]
  );

  const runNextStep = useCallback(() => {
    if (nextStep.kind !== NextStepKind.IMPLEMENTATION) {
      runDestination(nextStep);
      return;
    }
    openPreview({
      source: 'answer',
      returnView: 'home',
      title: nextStep.text,
      goal: nextStep.text,
      summary: (answer?.text || '').slice(0, 600) || null,
      question: answer?.question || null,
      expectedResult: [],
    });
  }, [nextStep, runDestination, openPreview, answer]);

  const runSecondaryStep = useCallback(() => runDestination(nextStep.secondary), [runDestination, nextStep]);
  const startGuide = useCallback(() => guide(answerContext()), [guide, answerContext]);
  const openTeam = useCallback(() => handOff(answerContext()), [handOff, answerContext]);

  // ── Opportunity ──────────────────────────────────────────────────────────
  const openOpportunityById = useCallback(
    (id, returnView) => {
      const opp = (home.opportunities || []).find((o) => o.id === id);
      if (!opp) return false;
      setFocusedOpportunity(opp);
      setOpportunityReturn(returnView || homeViewRef.current || 'playbook');
      setView('opportunity');
      return true;
    },
    [home.opportunities, setView]
  );

  const opportunityHandoffContext = useCallback(() => {
    const o = opportunityRecord(focusedOpportunity);
    return {
      question: o.title ? `Opportunity: ${o.title}` : null,
      answerText: o.expected_outcome || o.description || null,
      nextStep: null,
    };
  }, [focusedOpportunity]);

  const opportunity = {
    focused: focusedOpportunity,
    back: () => setView(opportunityReturn),
    seePlan: () => openPreview({ ...opportunityPlanContext(focusedOpportunity), returnView: 'opportunity' }),
    whatIf: (lever) => {
      if (!lever) return;
      whatIf.start(lever.key, lever.prompt);
      setView('whatif');
    },
    guide: () => guide(opportunityHandoffContext()),
    team: () => handOff(opportunityHandoffContext()),
  };

  // ── What If ──────────────────────────────────────────────────────────────
  const scenario = whatIf.scenario?.status === 'computed' ? whatIf.scenario : null;

  const scenarioContext = useCallback(
    () =>
      scenario
        ? {
            question: scenario.question,
            answerText: scenario.galileo_read || null,
            nextStep: null,
            scenarioTitle: scenario.scenario_title,
            scenarioRead: scenario.galileo_read || null,
            assumptions: scenario.assumed || [],
          }
        : null,
    [scenario]
  );

  const scenarioActions = {
    asks: (whatIf.supportedScenarios || []).find((s) => s.key === scenario?.scenario_key)?.asks || [],
    guide: () => scenario && guide(scenarioContext()),
    team: () => scenario && handOff(scenarioContext()),
    seePlan: () =>
      scenario &&
      openPreview({
        source: 'whatif',
        returnView: 'whatif',
        title: scenario.scenario_title,
        goal: scenario.galileo_read || scenario.question || scenario.scenario_title,
        summary: scenario.question || null,
        expectedResult: (scenario.comparison || [])
          .filter((r) => r.now || r.what_if)
          .map((r) => ({ label: r.metric, value: `${r.now ?? '—'} → ${r.what_if ?? '—'}` })),
      }),
    ask: () =>
      scenario &&
      askInContext(
        `About my What If scenario "${scenario.scenario_title}"${scenario.question ? ` ("${scenario.question}")` : ''}: ` +
          `${scenario.galileo_read || ''} What would you do next, and what am I not seeing?`
      ),
    save: async () => {
      if (!scenario || !businessId) return false;
      try {
        const res = await base44.functions.invoke('savedPlaybookData', {
          action: 'savePlaybookItem',
          data: {
            active_business_id: businessId,
            title: `What if: ${scenario.scenario_title}`,
            category: 'scenario',
            saved_from: 'vision_whatif',
            // Hypothetical by construction. Never read as a business fact.
            content: JSON.stringify({
              kind: 'what_if_scenario',
              hypothetical: true,
              scenario_key: scenario.scenario_key,
              question: scenario.question || whatIf.question || null,
              inputs: whatIf.collectedInputs || {},
              assumptions: (scenario.assumed || []).map((a) => ({ label: a.label, value: a.value, basis: a.basis })),
              comparison: scenario.comparison || [],
              result_summary: scenario.galileo_read || null,
              saved_at: new Date().toISOString(),
            }),
          },
        });
        if (res?.data?.playbook) {
          home.reloadWork?.();
          return true;
        }
        return false;
      } catch (err) {
        console.error('[useVisionActions] save scenario failed:', err?.message || err);
        return false;
      }
    },
  };

  // ── Domain commands ──────────────────────────────────────────────────────
  const handleCommand = useCallback(
    (command) => {
      const action = typeof command === 'string' ? command : command?.action;
      const prompt = typeof command === 'object' ? command?.prompt : null;
      if (prompt) return handleAsk(prompt);
      switch (action) {
        case 'connect_financials': setView('connections'); break;
        case 'view_opportunities':
        case 'view_plays': openPlaybookAll(); break;
        case 'playbook_active': openPlaybook('active'); break;
        case 'playbook_completed': openPlaybook('completed'); break;
        case 'playbook_discovered': openPlaybook('discovered'); break;
        case 'open_valuation': onOpenWorkspace?.('valuation'); break;
        case 'view_documents': openDocuments(); break;
        case 'upload_document': openUpload(); break;
        case 'sprint_blockers': openSprint(); break;
        case 'sprint_expert': openExpert(); break;
        case 'sprint_galileo_help': askInContext('What should I focus on next in my 90-Day Sprint?'); break;
        case 'whatif': openWhatIf(); break;
        default: break;
      }
    },
    [handleAsk, setView, openPlaybookAll, openPlaybook, onOpenWorkspace, openSprint, openExpert, askInContext, openWhatIf, openDocuments, openUpload]
  );

  // ── Recent activity → the object that caused it ──────────────────────────
  const openActivity = useCallback(
    (activity) => {
      const { type, id } = activity?.actionValue || {};
      // A document row opens THE DOCUMENT (the workspace layer receives the id as
      // its payload), not the Data Room home. One contract, never a bare route:
      // see @/lib/visionWorkspace/openDocument.
      if (type === 'document') onOpenWorkspace?.('data-room', id);
      else if (type === 'valuation') onOpenWorkspace?.('valuation');
      else if (type === 'sprint') openSprint();
      else if (type === 'opportunity') {
        if (!openOpportunityById(id, 'home')) openPlaybookAll();
      } else openPlaybookAll();
    },
    [onOpenWorkspace, openSprint, openOpportunityById, openPlaybookAll]
  );

  // ── Next Best Move → its real destination, for every move type ───────────
  const handleMoveAction = useCallback(
    (av) => {
      // Acting on a move is recorded ONCE, in the same ledger the resolver reads,
      // so the hero advances instead of handing the same move back (§12).
      home.markMoveHandled?.(av);
      switch (av?.type) {
        case 'opportunity':
        case 'goal_aligned':
          if (!openOpportunityById(av.id, 'home')) openPlaybookAll();
          break;
        case 'sprint':
        case 'sprint_blocker': openSprint(); break;
        case 'signal_deterioration':
          if (av.domain) home.handleDomainClick(av.domain);
          else openPlaybookAll();
          break;
        // An evidence gap asks the owner for a document: the overlay opens on the
        // existing uploader rather than on the library.
        case 'evidence_gap': openUpload(); break;
        case 'scenario_decision': openWhatIf(); break;
        case 'expert_response': openExpert(); break;
        // A document assignment opens THE document, by id, through the existing
        // document contract — never the Data Room at large (§27).
        case 'document_assignment':
          if (av.documentId) onOpenWorkspace?.('data-room', av.documentId);
          break;
        case 'galileo_question':
        case 'knowledge_gap':
          askInContext(home.nextBestMove?.primary?.title || null); break;
        // The canonical value gap the promotion preserved opens the existing value
        // domain — a real destination, not a new surface.
        case 'value_gap':
          home.handleDomainClick(av.domain || 'value');
          break;
        // "Upload P&L" opens the uploader, because that is exactly what the label
        // promises. Connections stays its own destination.
        case 'connect_source': openUpload('Your P&L, balance sheet, or tax return'); break;
        // The honest fallback focuses the ask bar rather than pretending there is
        // one correct next move.
        case 'explore': askInContext(null); break;
        // "See what Galileo found" ASKS ABOUT THE DOCUMENT. It used to change the
        // view and stop there, so the label promised an answer that never came.
        // The document travels by id; the server re-resolves it inside the
        // authorized business, so a document outside the active business resolves
        // to nothing rather than to someone else's record.
        case 'new_document':
        case 'document': {
          const documentId = av.id || av.documentId || null;
          if (!documentId) { openDocuments(); break; }
          askInContext(DOCUMENT_FINDINGS_QUESTION, { focus: { type: 'document', id: documentId } });
          break;
        }
        default: home.handleMoveAction(av);
      }
    },
    [openOpportunityById, openPlaybookAll, openSprint, home, onOpenWorkspace, openWhatIf, openExpert, askInContext, openUpload]
  );

  // ── Playbook rows → the destination that exists for the type ─────────────
  const handlePlaybookItem = useCallback(
    (item) => {
      const action = item?.nextAction;
      if (!action) return;
      if (action.type === 'saved') setView('saved');
      else if (action.type === 'sprint') openSprint();
      else if (action.type === 'opportunity') openOpportunityById(action.id, 'playbook');
      else if (action.type === 'saved_playbook') {
        const c = item.savedContent;
        if (c?.kind === 'what_if_scenario' && c.scenario_key) {
          whatIf.restore({ scenarioKey: c.scenario_key, question: c.question, inputs: c.inputs || {} });
          setView('whatif');
        } else {
          askInContext(
            `Let's continue exploring what I saved: "${item.title}". ${item.subtitle || ''} What should I do next with it?`
          );
        }
      }
    },
    [setView, openSprint, openOpportunityById, whatIf, askInContext]
  );

  const openSavedItem = useCallback(
    (item) =>
      askInContext(
        `Let's pick up what I saved: "${item.title}". ${item.data?.summary || ''} What should I do next with it?`
      ),
    [askInContext]
  );

  // ── Guide session's "get the numbers" destination ────────────────────────
  const guideDestination = useMemo(() => {
    if (scenario) {
      return { label: 'See the implementation plan', detail: 'What putting this scenario into practice would involve.', kind: 'scenario_plan' };
    }
    if (nextStep.secondary?.target) {
      return { label: nextStep.secondary.label, detail: null, kind: nextStep.secondary.kind, target: nextStep.secondary.target };
    }
    return null;
  }, [scenario, nextStep]);

  const runGuideDestination = useCallback(() => {
    if (!guideDestination) return;
    if (guideDestination.kind === 'scenario_plan') scenarioActions.seePlan();
    else runDestination(guideDestination);
  }, [guideDestination, scenarioActions, runDestination]);

  return {
    askInputRef,
    askSectionRef,
    galileo,
    whatIf,
    advisor,
    access,
    planAccess,
    plan,
    nextStep,
    previewContext,
    guideContext,
    handoffContext,
    hasActiveSprint,
    scenario,
    scenarioActions,
    opportunity,
    openOpportunityById,
    guideDestination,
    handleAsk,
    askInContext,
    openPlaybookAll,
    openWhatIf,
    openExpert,
    openSprint,
    runNextStep,
    runSecondaryStep,
    startGuide,
    openTeam,
    previewGalileo,
    previewTeam,
    handleCommand,
    openActivity,
    handleMoveAction,
    handlePlaybookItem,
    openSavedItem,
    runGuideDestination,
    openDocuments,
    openUpload,
  };
}