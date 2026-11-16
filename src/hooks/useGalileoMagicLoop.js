/**
 * useGalileoMagicLoop — the state machine for the Phase 1 Magic Loop.
 *
 * Stages:
 *   ENTRY → CONTEXT → (CLIENT_ROLE) → INTENT → DISCOVERY → FIRST_VALUE
 *   → CURIOSITY → CONNECT → LEARNING → MODEL_UPDATED → OPPORTUNITY
 *   → EVIDENCE → STRATEGY → IMPLEMENT → SAVE → DONE
 *
 * Reuses:
 *   - guestSessionService (anonymous session + promotion)
 *   - assessmentCalculations.js (via preliminaryModel)
 *   - magicLoopAnalytics (base44.analytics)
 *   - magicLoopConversation (galileo_events / GalileoConversation)
 *   - AccountPromotionScene promotion flow (via guestSessionService.promoteGuestSession)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';
import { MARGIN_METRIC, PROFIT_POSITION } from '@/lib/profitSemantics';
import { buildPreliminaryModel } from '@/lib/galileo/preliminaryModel';
import { trackMagicLoop, EVENT_NAMES } from '@/lib/galileo/magicLoopAnalytics';
import {
  persistGuestConversation,
  loadGuestConversation,
  migrateConversationOnPromotion,
} from '@/lib/galileo/magicLoopConversation';

export const STAGES = {
  ENTRY: 'ENTRY',
  CONTEXT: 'CONTEXT',
  CLIENT_ROLE: 'CLIENT_ROLE',
  INTENT: 'INTENT',
  DISCOVERY: 'DISCOVERY',
  FIRST_VALUE: 'FIRST_VALUE',
  CURIOSITY: 'CURIOSITY',
  CONNECT: 'CONNECT',
  LEARNING: 'LEARNING',
  MODEL_UPDATED: 'MODEL_UPDATED',
  OPPORTUNITY: 'OPPORTUNITY',
  EVIDENCE: 'EVIDENCE',
  STRATEGY: 'STRATEGY',
  IMPLEMENT: 'IMPLEMENT',
  SAVE: 'SAVE',
  DONE: 'DONE',
};

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
  reduce_dependency: 'Reduce how much the business depends on me',
  already_implementing: "Work on something I'm already implementing",
  not_sure: "I'm not sure — show me what you see",
};

const CLIENT_ROLES = [
  'CPA / Tax Professional',
  'Financial Advisor',
  'Wealth Advisor',
  'Attorney',
  'CFO / Fractional CFO',
  'Consultant',
  'Investor / Acquirer',
  'Business Advisor',
  'Other',
];

export function useGalileoMagicLoop() {
  const [stage, setStage] = useState(STAGES.ENTRY);
  const [context, setContext] = useState(null); // 'my_business' | 'a_client'
  const [clientRole, setClientRole] = useState(null);
  const [intent, setIntent] = useState(null);
  const [answers, setAnswers] = useState({
    industry: null,
    revenue: null,
    ebitda: null,
    employees: null,
    involvement: null,
    goal: null,
  });
  const [verified, setVerified] = useState({}); // { revenue, ebitda } from doc confirmation
  const [extractedFacts, setExtractedFacts] = useState(null); // Phase 1.1: full extraction result
  const [model, setModel] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [implementationChoice, setImplementationChoice] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [guestSessionId, setGuestSessionId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const sessionEnsured = useRef(false);

  // ── Resolve guest session + auth state on mount ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sid = getGuestSessionId();
      if (!cancelled) setGuestSessionId(sid);

      try {
        const authed = await base44.auth.isAuthenticated();
        if (!cancelled) setIsAuthenticated(authed);
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      }

      // Ensure guest session row exists
      if (sid && !sessionEnsured.current) {
        sessionEnsured.current = true;
        try {
          const res = await base44.functions.invoke('guestSessionService', {
            action: 'getGuestSession',
            data: { guest_session_id: sid },
          });
          if (!res.data?.exists) {
            await base44.functions.invoke('guestSessionService', {
              action: 'createGuestSession',
              data: { guest_session_id: sid },
            });
          }
          // Resume any persisted conversation
          const prev = await loadGuestConversation(sid);
          if (!cancelled && prev.length > 0) setConversation(prev);
        } catch {
          // Non-fatal
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Conversation helpers ─────────────────────────────────────────────────────
  const addMessage = useCallback(
    (role, content, stageTag = null) => {
      setConversation((prev) => {
        const next = [
          ...prev,
          { role, content, timestamp: new Date().toISOString(), stage: stageTag },
        ];
        // Best-effort persistence (throttled by stage transitions in practice)
        if (guestSessionId) {
          persistGuestConversation(guestSessionId, next).catch(() => {});
        }
        return next;
      });
    },
    [guestSessionId],
  );

  const goTo = useCallback((nextStage) => {
    setStage(nextStage);
  }, []);

  // ── Stage transitions ───────────────────────────────────────────────────────
  const selectContext = useCallback(
    (ctx) => {
      setContext(ctx);
      // First real interaction = the Magic Loop start
      trackMagicLoop(EVENT_NAMES.GUEST_STARTED, {}, guestSessionId);
      trackMagicLoop(
        EVENT_NAMES.CONTEXT_SELECTED,
        { context: ctx, label: CONTEXT_OPTIONS[ctx] },
        guestSessionId,
      );
      addMessage('assistant', "Let's see what your business is capable of.", STAGES.ENTRY);
      addMessage('user', CONTEXT_OPTIONS[ctx], STAGES.CONTEXT);
      if (ctx === 'a_client') {
        setStage(STAGES.CLIENT_ROLE);
      } else {
        setStage(STAGES.INTENT);
      }
    },
    [guestSessionId, addMessage],
  );

  const selectClientRole = useCallback(
    (role) => {
      setClientRole(role);
      addMessage('user', role, STAGES.CLIENT_ROLE);
      setStage(STAGES.INTENT);
    },
    [addMessage],
  );

  const selectIntent = useCallback(
    (intentKey) => {
      setIntent(intentKey);
      trackMagicLoop(
        EVENT_NAMES.INTENT_SELECTED,
        { intent: intentKey, label: INTENT_OPTIONS[intentKey] },
        guestSessionId,
      );
      addMessage('user', INTENT_OPTIONS[intentKey], STAGES.INTENT);
      addMessage(
        'assistant',
        "Great — let me ask you a few quick questions so I can understand your business before I give you anything useful.",
        STAGES.INTENT,
      );
      setStage(STAGES.DISCOVERY);
    },
    [guestSessionId, addMessage],
  );

  const answerDiscoveryQuestion = useCallback(
    (field, value, displayValue) => {
      setAnswers((prev) => ({ ...prev, [field]: value }));
      addMessage('user', displayValue, STAGES.DISCOVERY);

      if (field === 'industry') {
        trackMagicLoop(EVENT_NAMES.FIRST_QUESTION_ANSWERED, { field }, guestSessionId);
      }
    },
    [guestSessionId, addMessage],
  );

  const completeDiscovery = useCallback(() => {
    const built = buildPreliminaryModel(answers);
    setModel(built);
    trackMagicLoop(
      EVENT_NAMES.PRELIMINARY_MODEL_CREATED,
      { completeness: built.completeness, opportunity_count: built.opportunities.length },
      guestSessionId,
    );
    addMessage(
      'assistant',
      "That's enough for me to start. Let me show you what I see so far.",
      STAGES.FIRST_VALUE,
    );
    setStage(STAGES.FIRST_VALUE);
  }, [answers, guestSessionId, addMessage]);

  const showFirstInsight = useCallback(() => {
    trackMagicLoop(EVENT_NAMES.FIRST_INSIGHT_SHOWN, {}, guestSessionId);
    setStage(STAGES.CURIOSITY);
  }, [guestSessionId]);

  const investigate = useCallback(() => {
    trackMagicLoop(EVENT_NAMES.INVESTIGATE_SELECTED, {}, guestSessionId);
    addMessage('assistant', "Let's make me smarter. I can estimate, or I can learn from how your business actually operates.", STAGES.CURIOSITY);
    trackMagicLoop(EVENT_NAMES.CONNECT_BUSINESS_SHOWN, {}, guestSessionId);
    setStage(STAGES.CONNECT);
  }, [guestSessionId, addMessage]);

  const onDocumentUploaded = useCallback(
    (docMeta) => {
      setUploadedDocs((prev) => [...prev, docMeta]);
      trackMagicLoop(
        EVENT_NAMES.DOCUMENT_UPLOADED,
        { document_type: docMeta.document_type, file_count: uploadedDocs.length + 1 },
        guestSessionId,
      );
    },
    [guestSessionId, uploadedDocs.length],
  );

  const completeLearning = useCallback(
    (extractionResult) => {
      // Phase 1.1: extractionResult = { facts, period, fields_found, document_type, original_filename, success }
      const exFacts = extractionResult?.facts || {};
      const verifiedValues = {
        revenue: exFacts.annual_revenue?.normalized ?? null,
        ebitda: exFacts.reported_ebitda?.normalized ?? exFacts.operating_income?.normalized ?? null,
      };
      setVerified(verifiedValues);
      setExtractedFacts(extractionResult);
      const updated = buildPreliminaryModel(answers, verifiedValues, extractionResult);
      setModel(updated);
      trackMagicLoop(EVENT_NAMES.DOCUMENT_ANALYSIS_COMPLETED, {
        fields_found: extractionResult?.fields_found || 0,
        period: extractionResult?.period || null,
      }, guestSessionId);
      trackMagicLoop(
        EVENT_NAMES.BUSINESS_MODEL_UPDATED,
        { completeness: updated.completeness, value_verified: verifiedValues.ebitda != null, document_supported: true },
        guestSessionId,
      );
      addMessage('assistant', "That changed the picture. Here's what I see now.", STAGES.MODEL_UPDATED);
      setStage(STAGES.MODEL_UPDATED);
    },
    [answers, guestSessionId, addMessage],
  );

  const skipConnection = useCallback(() => {
    // Continue with estimates — never dead-end
    const built = buildPreliminaryModel(answers);
    setModel(built);
    setStage(STAGES.OPPORTUNITY);
  }, [answers]);

  const proceedToOpportunity = useCallback(() => {
    const opp = model?.opportunities?.[0] || null;
    setSelectedOpportunity(opp);
    trackMagicLoop(
      EVENT_NAMES.OPPORTUNITY_SHOWN,
      { opportunity_id: opp?.id, opportunity_title: opp?.title },
      guestSessionId,
    );
    setStage(STAGES.OPPORTUNITY);
  }, [model, guestSessionId]);

  const showEvidence = useCallback(() => {
    trackMagicLoop(EVENT_NAMES.SHOW_ME_WHY_SELECTED, {
      opportunity_id: selectedOpportunity?.id,
    }, guestSessionId);
    setStage(STAGES.EVIDENCE);
  }, [selectedOpportunity, guestSessionId]);

  const exploreStrategies = useCallback(() => {
    trackMagicLoop(EVENT_NAMES.STRATEGY_EXPLORED, {
      opportunity_id: selectedOpportunity?.id,
    }, guestSessionId);
    setStage(STAGES.STRATEGY);
  }, [selectedOpportunity, guestSessionId]);

  const chooseStrategy = useCallback(
    (strategy) => {
      setSelectedStrategy(strategy);
      setStage(STAGES.IMPLEMENT);
    },
    [],
  );

  const chooseImplementation = useCallback(
    (choice) => {
      setImplementationChoice(choice);
      if (choice === 'guide_me') {
        trackMagicLoop(EVENT_NAMES.GUIDE_ME_SELECTED, {
          opportunity_id: selectedOpportunity?.id,
          strategy: selectedStrategy,
        }, guestSessionId);
      } else {
        trackMagicLoop(EVENT_NAMES.EXPERT_SELECTED, {
          opportunity_id: selectedOpportunity?.id,
          strategy: selectedStrategy,
        }, guestSessionId);
      }
      trackMagicLoop(EVENT_NAMES.SAVE_BUSINESS_SHOWN, {}, guestSessionId);
      setStage(STAGES.SAVE);
    },
    [selectedOpportunity, selectedStrategy, guestSessionId],
  );

  const saveBusiness = useCallback(async () => {
    trackMagicLoop(EVENT_NAMES.SAVE_BUSINESS_CLICKED, {}, guestSessionId);
    trackMagicLoop(EVENT_NAMES.ACCOUNT_PROMOTION_STARTED, {}, guestSessionId);

    // Persist the business snapshot + assessment answers to the guest session
    // so promoteGuestSession can create the business + assessments on save.
    try {
      const businessSnapshot = {
        businesses: [
          {
            business_name: answers.industry
              ? `My ${answers.industry} Business`
              : 'My Business',
            industry: answers.industry,
            entity_type: 'unknown',
            business_family_type: 'operating_company',
            ownership_percentage: 100,
            is_primary_owner: true,
          },
        ],
      };
      const assessmentAnswers = buildAssessmentAnswersForPromotion(answers, verified, extractedFacts);

      // Phase 1.2: Merge extracted_facts instead of replacing — preserves
      // multi-document guest intelligence (P&L + Balance Sheet + second period).
      let existingExtractedFacts = {};
      try {
        const sessRes = await base44.functions.invoke('guestSessionService', {
          action: 'getGuestSession',
          data: { guest_session_id: guestSessionId },
        });
        existingExtractedFacts = sessRes.data?.session?.business_snapshot?.extracted_facts || {};
      } catch { /* non-fatal — merge with empty */ }

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
          },
        },
      });
    } catch {
      // Non-fatal — promotion will still attempt with whatever exists.
    }

    // Persist final conversation snapshot
    await persistGuestConversation(guestSessionId, conversation);

    // Trigger the existing account-promotion flow
    sessionStorage.setItem('vision_promote_guest_session', 'true');
    sessionStorage.setItem('vision_guest_session_id', guestSessionId);
    window.location.href = '/journey-signup';
  }, [guestSessionId, answers, verified, extractedFacts, conversation]);

  const completeAfterPromotion = useCallback(async () => {
    // Best-effort: migrate conversation to GalileoConversation entity
    await migrateConversationOnPromotion(conversation);
    trackMagicLoop(EVENT_NAMES.ACCOUNT_CREATED, {}, guestSessionId, null);
    trackMagicLoop(EVENT_NAMES.MAGIC_LOOP_COMPLETED, {}, guestSessionId, null);
    setStage(STAGES.DONE);
  }, [conversation, guestSessionId]);

  return {
    stage,
    context,
    clientRole,
    intent,
    answers,
    verified,
    extractedFacts,
    model,
    uploadedDocs,
    selectedOpportunity,
    selectedStrategy,
    implementationChoice,
    conversation,
    guestSessionId,
    isAuthenticated,
    // actions
    selectContext,
    selectClientRole,
    selectIntent,
    answerDiscoveryQuestion,
    completeDiscovery,
    showFirstInsight,
    investigate,
    onDocumentUploaded,
    completeLearning,
    skipConnection,
    proceedToOpportunity,
    showEvidence,
    exploreStrategies,
    chooseStrategy,
    chooseImplementation,
    saveBusiness,
    completeAfterPromotion,
    goTo,
    addMessage,
    // static
    STAGES,
    CONTEXT_OPTIONS,
    INTENT_OPTIONS,
    CLIENT_ROLES,
  };
}

/**
 * buildAssessmentAnswersForPromotion
 *
 * Maps Magic Loop answers into the assessment_answers shape that
 * promoteGuestSession expects: { [type]: { answers, results, completed_at } }.
 * Only includes assessments whose required inputs are present.
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
    // Phase 6B.1 — the Magic Loop collects EBITDA, not net profit. Stored under
    // its correct name; no profit comparison is fabricated.
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
    out.operations_gap = {
      answers: { involvement: answers.involvement },
      results: { operations_score: opsScore },
      completed_at: now,
    };
    out.freedom_assessment = {
      answers: { involvement: answers.involvement },
      results: { freedom_score: opsScore },
      completed_at: now,
    };
  }

  return out;
}