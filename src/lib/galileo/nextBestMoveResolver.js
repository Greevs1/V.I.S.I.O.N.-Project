/**
 * Next Best Move Resolver — the hero of Galileo Home.
 *
 * For a returning user, Galileo determines the highest-value current focus.
 * This is NOT necessarily the biggest financial number. It's a prioritization
 * recommendation based on multiple inputs.
 *
 * Returns ONE primary focus + alternatives. The user retains control:
 *   "Why this?" → see the reasoning
 *   "Show me something else" → cycle to next alternative
 *
 * Priority factors (not all must be present):
 *   - Active Play blocker (blocks progress) — highest urgency
 *   - Newly detected change (financial change, new document)
 *   - A document assignment waiting on the owner (open, mine, review or action
 *     required) — a real request from a real person, but NOT automatically the
 *     top of the list; see the calibration note in collectCandidates
 *   - Expert response waiting
 *   - Evidence gap blocking an opportunity
 *   - Signal deterioration
 *   - Scenario awaiting decision
 *   - New supported opportunity
 *   - Goal-aligned opportunity
 *   - Unresolved Galileo question
 *
 * Each candidate has: type, title, subtitle, actionLabel, actionValue, reason, impact
 */

export const MoveType = {
  SPRINT_BLOCKER: 'sprint_blocker',
  FINANCIAL_CHANGE: 'financial_change',
  EXPERT_RESPONSE: 'expert_response',
  EVIDENCE_GAP: 'evidence_gap',
  SIGNAL_DETERIORATION: 'signal_deterioration',
  SCENARIO_DECISION: 'scenario_decision',
  NEW_OPPORTUNITY: 'new_opportunity',
  GOAL_ALIGNED: 'goal_aligned',
  GALILEO_QUESTION: 'galileo_question',
  NEW_DOCUMENT: 'new_document',
  DOCUMENT_ASSIGNMENT: 'document_assignment',
  // ── Phase 2 additions ────────────────────────────────────────────────────
  // Each of these maps onto an object that ALREADY exists. Nothing new is
  // modelled: a Play in flight is a Sprint, an explored opportunity is an
  // opportunity record, a knowledge gap is a question the Knowledge Gap Engine
  // already owns, and the preserved discovery is the canonical value gap.
  CONTINUE_PLAY: 'continue_play',
  CONTINUE_OPPORTUNITY: 'continue_opportunity',
  VALUE_GAP_DISCOVERY: 'value_gap_discovery',
  KNOWLEDGE_GAP: 'knowledge_gap',
  CONNECT_SOURCE: 'connect_source',
  // The honest fallback. Never an apology, always an action.
  EXPLORE_GALILEO: 'explore_galileo',
};

/**
 * resolveNextBestMove — evaluates all candidates and returns the single
 * highest-value current focus.
 *
 * @param {object} ctx — business intelligence context
 * @returns {object} — { primary, alternatives, reasoning }
 */
/**
 * actionKey — the STABLE identity of the object an action acts on.
 *
 * Derived, never generated. Two candidates that act on the same object therefore
 * share a key (an opportunity offered once as "new" and once as "goal-aligned" is
 * ONE thing to the owner), which is what makes de-duplication and the
 * handled-move ledger trustworthy across renders.
 */
export function actionKey(actionValue = {}) {
  const target = actionValue.id || actionValue.documentId || actionValue.domain || null;
  // Keyed by the OBJECT, never by the route taken to it. The same opportunity
  // reached as "new" and as "goal-aligned" is ONE thing to the owner — so it is
  // offered once, and engaging it retires both routes. Keying by action type
  // instead let one object appear as two cards and let the hero hand back a move
  // the owner had already opened.
  return target ? `object:${target}` : String(actionValue.type || 'move');
}

function candidateKey(candidate) {
  return actionKey(candidate?.actionValue || {});
}

function handledMovesOf(ctx = {}) {
  return Array.isArray(ctx.handledMoves) ? ctx.handledMoves : [];
}

/**
 * resolveNextBestMove — evaluates all candidates and returns the single
 * highest-value current focus, plus up to three alternatives.
 *
 * Three rules make this a decision engine rather than a suggestion:
 *
 *   DETERMINISTIC (§N14 / §N15)
 *     Identical state produces an identical answer — the tie-break is the
 *     candidate key, never array order, and nothing here reads a clock.
 *
 *   ONE OBJECT, ONE MOVE
 *     The same object can never be offered twice, so the owner never sees two
 *     cards for one opportunity.
 *
 *   ANTI-LOOP (§12 / §N8 / §N9 / §N13)
 *     A move the owner COMPLETED or DISMISSED is not offered again, and one they
 *     merely ENGAGED (opened) keeps its place only among the alternatives —
 *     acting on something must move the focus. A fallback candidate always
 *     exists, so the surface is never left with nothing useful to say.
 */
export function resolveNextBestMove(ctx = {}) {
  const moves = handledMovesOf(ctx);
  const suppressed = new Set(
    moves.filter((m) => m.disposition === 'completed' || m.disposition === 'dismissed').map((m) => m.key),
  );
  const engaged = new Set(moves.filter((m) => m.disposition === 'engaged').map((m) => m.key));

  const scored = collectCandidates(ctx)
    .filter((c) => !suppressed.has(candidateKey(c)))
    .map((c) => ({ ...c, score: scoreCandidate(c, ctx) }))
    .sort((a, b) => b.score - a.score || candidateKey(a).localeCompare(candidateKey(b)));

  const byKey = new Map();
  for (const c of scored) {
    const key = candidateKey(c);
    if (!byKey.has(key)) byKey.set(key, { ...c, key });
  }
  const ranked = [...byKey.values()];

  const primary = ranked.find((c) => !engaged.has(c.key)) || ranked[0] || null;

  return {
    primary,
    alternatives: primary ? ranked.filter((c) => c !== primary).slice(0, 3) : [],
    reasoning: primary?.reason ?? null,
  };
}

function collectCandidates(ctx = {}) {
  const {
    activeSprints = [],
    sprintBlockers = [],
    recentChanges = [],
    opportunities = [],
    goals = [],
    // Document assignments waiting on the owner — the real records from the
    // `documentAssignments` contract for THIS business (§30: never another
    // business's assignments, never another person's).
    documentAssignments = [],
    // The following sources are NOT yet wired to real data in Phase 5.1.
    // They are documented as inactive — do NOT fake them.
    financialChanges = [],   // INACTIVE: no financial period comparison in BIS yet
    expertResponses = [],     // INACTIVE: no expert collaboration infrastructure wired
    evidenceGaps = [],        // INACTIVE: no evidence-gap detection in BIS yet
    signalDeterioration = [], // INACTIVE: no historical signal comparison in BIS yet
    pendingScenarios = [],    // INACTIVE: no scenario persistence in BIS yet
    galileoQuestions = [],    // INACTIVE: no Galileo conversation engine on Home yet

    // ── Phase 2 sources, all of them REAL state ──────────────────────────
    // businessId     the scope every candidate is checked against (§N12)
    // discoveries    the canonical value gap + constraint the promotion
    //                preserved (see valueContinuity.js). This is what lets the
    //                hero acknowledge what was found instead of announcing that
    //                it is "still building" (§8), and it is RE-DERIVED from
    //                canonical records — never carried over from a guest tab.
    // hasFinancials  real state. Decides whether a financials gap is worth
    //                raising at all (§N6, and no fake urgency).
    // handledMoves   the anti-loop ledger (§12, §N8, §N9)
    // knowledgeGaps  INACTIVE until a caller supplies real gaps. The Knowledge
    //                Gap Engine (questionPriorityEngine) is the provider; Home
    //                does not load conversation answers yet, so no question is
    //                invented here.
    businessId = null,
    discoveries = null,
    hasFinancials = true,
    handledMoves = [],
    knowledgeGaps = [],
  } = ctx;

  const candidates = [];

  // Active Play blockers — highest urgency (ACTIVE)
  for (const blocker of sprintBlockers) {
    candidates.push({
      type: MoveType.SPRINT_BLOCKER,
      title: blocker.title || 'Unblock your active Play',
      subtitle: blocker.subtitle || 'A decision is blocking progress',
      actionLabel: blocker.actionLabel || 'Review decision',
      actionValue: { type: 'sprint_blocker', id: blocker.id },
      reason: blocker.reason || 'This blocks an active Play from progressing',
      impact: blocker.impact || null,
      urgency: 95,
      provenance: 'CONNECTED_DATA',
    });
  }

  // Recent changes (new documents) — from BIS recent_documents (ACTIVE)
  for (const change of recentChanges) {
    candidates.push({
      type: MoveType.NEW_DOCUMENT,
      title: change.title || 'New document analyzed',
      subtitle: change.subtitle || 'Galileo finished analyzing a document',
      actionLabel: 'See what Galileo found',
      actionValue: { type: 'new_document', id: change.documentId || change.id },
      reason: change.reason || 'A newly analyzed document updated what Galileo knows.',
      impact: change.impact || null,
      urgency: 80,
      provenance: 'DOCUMENT_SUPPORTED',
    });
  }

  // Document assignments waiting on the owner (ACTIVE — document_assignments).
  // ELIGIBILITY is about responsibility, not enthusiasm: the assignment must be
  // OPEN, it must be MINE, and it must be work. FYI is reference material with no
  // completion state, so it is never a move; completed and removed assignments
  // are no longer waiting on anyone. (Mine-ness and business scope are proven by
  // the contract that supplied these rows — this only applies the status/type
  // half.)
  //
  // CALIBRATION. Being assigned something does not make it urgent, high-impact or
  // financially important, and this system holds no deadline for a document
  // request — so none of those is invented: impact stays null and no goal,
  // maturity or financial signal is attached. Its urgency is a deliberate
  // mid-tier constant: an explicit request from a person sits ABOVE a
  // model-discovered opportunity (55) and BELOW a decision the owner has already
  // started (60), a newly analyzed document (80) and a blocker that halts
  // execution (95). Review and Action Required score identically, because the
  // architecture holds no real signal that one outranks the other — hardcoding
  // that precedence would be fabrication rather than prioritization.
  //
  // The practical consequence is the required one: the assignment competes on the
  // same terms as every other candidate, and does not automatically win.
  for (const assignment of documentAssignments) {
    if (!inBusinessScope(assignment, ctx)) continue;
    if (assignment?.status !== 'open') continue;
    if (assignment.assignment_type !== 'review' && assignment.assignment_type !== 'action_required') continue;
    candidates.push({
      type: MoveType.DOCUMENT_ASSIGNMENT,
      title: assignmentTitle(assignment),
      subtitle: assignmentSubtitle(assignment),
      actionLabel: 'Review Document',
      actionValue: {
        type: 'document_assignment',
        id: assignment.id,
        // The exact document, by id — so the action opens THE document through
        // the existing document contract rather than the Data Room at large.
        documentId: assignment.document_id,
      },
      reason: assignmentReason(assignment),
      impact: null,
      urgency: 58,
      provenance: 'CONNECTED_DATA',
    });
  }

  // Expert responses waiting (INACTIVE — no data)
  for (const resp of expertResponses) {
    candidates.push({
      type: MoveType.EXPERT_RESPONSE,
      title: resp.title || 'Your expert responded',
      subtitle: resp.subtitle || 'A collaboration partner sent a response',
      actionLabel: 'Read response',
      actionValue: { type: 'expert_response', id: resp.id },
      reason: resp.reason || 'An expert you involved has responded',
      impact: resp.impact || null,
      urgency: 78,
      provenance: 'CONNECTED_DATA',
    });
  }

  // Signal deterioration (INACTIVE — no data)
  for (const sig of signalDeterioration) {
    candidates.push({
      type: MoveType.SIGNAL_DETERIORATION,
      title: sig.title || `${sig.domain} is declining`,
      subtitle: sig.subtitle || 'A business signal deteriorated',
      actionLabel: 'Investigate',
      actionValue: { type: 'signal_deterioration', domain: sig.domain },
      reason: sig.reason || 'A business signal changed for the worse',
      impact: sig.impact || null,
      urgency: 72,
      provenance: 'DERIVED',
    });
  }

  // Evidence gaps (INACTIVE — no data)
  for (const gap of evidenceGaps) {
    candidates.push({
      type: MoveType.EVIDENCE_GAP,
      title: gap.title || 'Evidence gap found',
      subtitle: gap.subtitle || 'An opportunity needs more evidence',
      actionLabel: 'Strengthen this',
      actionValue: { type: 'evidence_gap', id: gap.id },
      reason: gap.reason || 'More evidence would unlock a higher-confidence opportunity',
      impact: gap.impact || null,
      urgency: 65,
      provenance: 'DERIVED',
    });
  }

  // Scenarios awaiting decision (INACTIVE — no data)
  for (const scenario of pendingScenarios) {
    candidates.push({
      type: MoveType.SCENARIO_DECISION,
      title: scenario.title || 'A scenario awaits your decision',
      subtitle: scenario.subtitle || 'You started exploring a strategy',
      actionLabel: 'Continue',
      actionValue: { type: 'scenario_decision', id: scenario.id },
      reason: scenario.reason || 'You were exploring a scenario that could move the number',
      impact: scenario.impact || null,
      urgency: 60,
      provenance: 'MODELED',
    });
  }

  // Opportunities — from BIS + galileo_opportunities (ACTIVE)
  //
  // AN OPPORTUNITY FROM ANOTHER BUSINESS IS NEVER A CANDIDATE (§N12). The rows
  // arrive business-scoped, and this re-checks the record's OWN business_id where
  // it carries one: a scope mistake upstream must not become a cross-tenant
  // recommendation here.
  //
  // CONTINUE vs INVESTIGATE is decided by the record's own status — never
  // inferred. Something already in progress is continued; something available is
  // investigated. Neither is invented.
  for (const opp of opportunities) {
    if (!inBusinessScope(opp, ctx)) continue;

    if (opp.status === 'active') {
      candidates.push({
        type: MoveType.CONTINUE_OPPORTUNITY,
        title: opp.title || 'Continue this opportunity',
        subtitle: opp.category ? `${opp.category} · already in progress` : 'Already in progress',
        actionLabel: 'Continue',
        actionValue: { type: 'opportunity', id: opp.id },
        reason: opp.reason || 'You already started exploring this one. Continuing keeps the thread.',
        impact: opp.impact || null,
        urgency: 65,
        provenance: opp.origin === 'bis' ? 'DERIVED' : 'MODELED',
      });
      continue;
    }

    if (opp.status === 'available') {
      candidates.push({
        type: MoveType.NEW_OPPORTUNITY,
        title: opp.title || 'Opportunity available',
        subtitle: opp.category ? `${opp.category}` : 'Evidence supports this opportunity',
        actionLabel: 'Investigate',
        actionValue: { type: 'opportunity', id: opp.id },
        reason: opp.reason || 'This opportunity is worth investigating.',
        impact: opp.impact || null,
        urgency: 55,
        provenance: opp.origin === 'bis' ? 'DERIVED' : 'MODELED',
      });
    }
  }

  // Goal-aligned opportunities (ACTIVE)
  if (goals.length > 0 && opportunities.length > 0) {
    const primaryGoal = goals[0];
    for (const opp of opportunities) {
      if (opp.status === 'available' || opp.status === 'active') {
        candidates.push({
          type: MoveType.GOAL_ALIGNED,
          title: opp.title || 'Aligned with your goal',
          subtitle: `Supports: ${primaryGoal.label}`,
          actionLabel: 'Explore',
          actionValue: { type: 'goal_aligned', id: opp.id },
          reason: `This aligns with your goal: ${primaryGoal.label}`,
          impact: opp.impact || null,
          urgency: 50,
          provenance: 'MODELED',
        });
      }
    }
  }

  // Unresolved Galileo questions (INACTIVE — no data)
  for (const q of galileoQuestions) {
    candidates.push({
      type: MoveType.GALILEO_QUESTION,
      title: q.title || 'Galileo has a question',
      subtitle: q.subtitle || 'Galileo needs one more answer',
      actionLabel: 'Answer',
      actionValue: { type: 'galileo_question', id: q.id },
      reason: q.reason || 'Galileo needs this to complete an analysis',
      impact: null,
      urgency: 40,
      provenance: 'DERIVED',
    });
  }

  // ── A Play actually in flight (ACTIVE) ─────────────────────────────────
  // Execution already under way is the most useful thing to continue — but it is
  // NOT urgent, so a blocker that genuinely halts it (95) still outranks it (§N1),
  // and it sits above every model-discovered idea.
  for (const play of activeSprints) {
    candidates.push({
      type: MoveType.CONTINUE_PLAY,
      title: play.title || 'Continue your 90-Day Sprint',
      subtitle: play.progress ? `${play.progress}% complete` : 'Work already in flight',
      actionLabel: 'Continue Play',
      actionValue: { type: 'sprint', id: play.id },
      reason: 'You have a Play running. Finishing what you started is worth more than starting something new.',
      impact: null,
      urgency: 85,
      provenance: 'CONNECTED_DATA',
    });
  }

  // ── THE PRESERVED DISCOVERY (ACTIVE, DERIVED) ──────────────────────────
  // The value gap the owner already saw — now standing on the canonical
  // assessment the promotion wrote. This candidate exists to end the experience
  // cliff (§8): after preserving a business, the hero says what was found instead
  // of announcing that it is still building an understanding of it.
  //
  // It is derived, and it says so: the number is the canonical value gap, and the
  // constraint is named ONLY when the canonical score actually shows one.
  const valueGap = typeof discoveries?.valueGap === 'number' ? discoveries.valueGap : null;
  if (valueGap != null && valueGap > 0) {
    const constraint = discoveries?.constraint || null;
    candidates.push({
      type: MoveType.VALUE_GAP_DISCOVERY,
      title: constraint ? `Investigate ${constraint.label.toLowerCase()}` : 'Look into your potential value gap',
      subtitle: constraint
        ? constraint.why
        : 'Your own numbers point at more value than the business is currently showing.',
      actionLabel: constraint ? `Investigate ${constraint.label}` : 'Investigate',
      actionValue: { type: 'value_gap', domain: 'value' },
      reason: constraint
        ? `${constraint.label} is the constraint your own answers point to, which makes it the fastest place to look.`
        : 'This is what the numbers you gave already support.',
      impact: valueGap,
      // The impact is a GAP, not a modeled improvement — the label must say so.
      impactKind: 'value_gap',
      urgency: 62,
      provenance: 'MODELED',
    });
  }

  // ── A knowledge gap, when one genuinely exists (INACTIVE provider) ─────
  for (const kGap of knowledgeGaps) {
    candidates.push({
      type: MoveType.KNOWLEDGE_GAP,
      title: kGap.prompt || kGap.title || 'One answer would sharpen my view',
      subtitle: kGap.sub || null,
      actionLabel: 'Answer Galileo',
      actionValue: { type: 'knowledge_gap', id: kGap.field || kGap.id || null },
      reason: 'One answer would make the picture of the business materially sharper.',
      impact: null,
      urgency: 45,
      provenance: 'DERIVED',
    });
  }

  // ── A financials gap that really does limit what can be said (ACTIVE) ──
  // `hasFinancials === false` is REAL state, not encouragement: Galileo can
  // estimate profitability, but it cannot separate signal from guesswork without
  // the owner's own numbers. It never outranks real work, and it is never the
  // automatic primary (§N6 — Connections does not get promoted to the hero).
  if (!hasFinancials) {
    candidates.push({
      type: MoveType.CONNECT_SOURCE,
      title: 'Your actual P&L would sharpen this',
      subtitle: 'I can estimate profitability now. Your own numbers would let me separate signal from guesswork.',
      actionLabel: 'Upload P&L',
      actionValue: { type: 'connect_source' },
      reason: 'Everything here is built from what you told me. Your own financials would make it precise.',
      impact: null,
      urgency: 35,
      provenance: 'DERIVED',
    });
  }

  // ── The honest fallback (ALWAYS present) ───────────────────────────────
  // Galileo can always be asked something. This exists so the surface can never
  // answer a real business with "I'm still building my understanding of your
  // business" — the fallback is an ACTION, not an apology (§N7).
  candidates.push({
    type: MoveType.EXPLORE_GALILEO,
    title: 'Ask me anything about the business',
    subtitle: 'I will tell you what I actually know, and what I would need in order to know it better.',
    actionLabel: 'Ask Galileo',
    actionValue: { type: 'explore' },
    reason: 'Nothing clearly outranks learning a little more, so the most useful thing is to ask.',
    impact: null,
    urgency: 10,
    provenance: 'DERIVED',
  });

  return candidates;
}

/**
 * inBusinessScope — a record belonging to a DIFFERENT business is dropped.
 *
 * The caller already loads business-scoped rows; this is the second check, at the
 * point of use, because a cross-tenant recommendation is the one failure that must
 * not depend on an upstream filter being correct. A record that carries no
 * business_id cannot contradict the active one and is therefore allowed through.
 */
function inBusinessScope(record, ctx = {}) {
  const target = ctx.businessId || null;
  if (!target) return true;
  const own = record?.business_id ?? record?.raw?.business_id ?? null;
  return !own || own === target;
}

function scoreCandidate(candidate, ctx = {}) {
  const { goals = [], maturity = 'mature' } = ctx;
  let score = candidate.urgency || 50;

  // Goal alignment boost
  if (candidate.type === MoveType.GOAL_ALIGNED && goals.length > 0) {
    score += 15;
  }

  // Impact boost (if candidate has modeled impact)
  if (candidate.impact && candidate.impact > 0) {
    const impactScore = Math.min(20, Math.log10(candidate.impact + 1) * 4);
    score += impactScore;
  }

  // Maturity bias
  if (maturity === 'implementing' && candidate.type === MoveType.SPRINT_BLOCKER) {
    score += 20; // Blockers matter most when implementing
  }
  if (maturity === 'exit_prep' && candidate.type === MoveType.SIGNAL_DETERIORATION) {
    score += 15; // Risks matter most in exit prep
  }
  if (maturity === 'early' && candidate.type === MoveType.GALILEO_QUESTION) {
    score += 15; // Learning matters most early
  }

  return Math.round(score);
}

/**
 * explainWhyThis — returns the reasoning for why a move was selected.
 * The user can ask "Why this?" and get a clear explanation.
 */
export function explainWhyThis(move) {
  if (!move) return null;
  const reasons = {
    [MoveType.SPRINT_BLOCKER]: 'This blocks an active Play from progressing. Unblocking it lets your team continue.',
    [MoveType.FINANCIAL_CHANGE]: 'New financial data changed the model. Reviewing this ensures your numbers are current.',
    [MoveType.NEW_DOCUMENT]: 'A newly analyzed document updated what Galileo knows. Seeing what changed keeps you informed.',
    [MoveType.DOCUMENT_ASSIGNMENT]:
      'Someone on your team asked you to look at this document, so it is waiting on you. Finishing it clears the request.',
    [MoveType.EXPERT_RESPONSE]: 'An expert you involved has responded. Reading it keeps the collaboration moving.',
    [MoveType.EVIDENCE_GAP]: 'More evidence would unlock a higher-confidence opportunity. Strengthening it improves accuracy.',
    [MoveType.SIGNAL_DETERIORATION]: 'A business signal changed for the worse. Investigating early prevents bigger issues.',
    [MoveType.SCENARIO_DECISION]: 'You were exploring a scenario that could move the number. Continuing keeps momentum.',
    [MoveType.NEW_OPPORTUNITY]: 'This opportunity has enough evidence to act on. Investigating could unlock value.',
    [MoveType.GOAL_ALIGNED]: 'This aligns with your stated goal. Pursuing it moves you toward what you want.',
    [MoveType.GALILEO_QUESTION]: 'Galileo needs this answer to complete an analysis. Providing it unlocks insight.',
    [MoveType.CONTINUE_PLAY]: 'You have a Play in flight. Finishing what you started is worth more than starting something new.',
    [MoveType.CONTINUE_OPPORTUNITY]: 'You already started exploring this, so continuing keeps the thread instead of restarting it.',
    [MoveType.VALUE_GAP_DISCOVERY]: 'This comes from the numbers you already gave: the distance between what the business is worth today and what it could be worth.',
    [MoveType.KNOWLEDGE_GAP]: 'One answer would sharpen what Galileo can say about the business. It is the most valuable thing still unknown.',
    [MoveType.CONNECT_SOURCE]: 'Everything so far is built from your own estimates. Your own numbers would replace estimates with facts.',
    [MoveType.EXPLORE_GALILEO]: 'No single move clearly outranks the others, so the most useful thing is to ask.',
  };
  return reasons[move.type] || move.reason || 'This is the highest-value focus right now.';
}

/**
 * A document assignment in the owner's words: what the document is, who is
 * waiting, and what they are waiting for. Every value is a REAL field of the
 * assignment or its document — the document's own name, the assigner's name.
 * Nothing is inferred, and nothing is invented.
 */
function assignmentTitle(assignment) {
  const document = assignment.document_name || 'a document';
  return assignment.assignment_type === 'action_required'
    ? `Action needed on ${document}`
    : `Review ${document}`;
}

function assignmentSubtitle(assignment) {
  const who = assignment.assigned_by_name || 'Someone on your team';
  const purpose = assignment.assignment_type === 'action_required' ? 'take action on this' : 'review this';
  return `${who} asked you to ${purpose}.`;
}

function assignmentReason(assignment) {
  return `${assignment.assigned_by_name || 'Someone on your team'} is waiting on you for this document.`;
}

/**
 * orbStateForMove — the Galileo orb's state for the current move, from reality.
 *
 * DISCOVERY IS AN EVENT; OPPORTUNITY EXISTENCE IS STATE (§14). Home therefore
 * NEVER replays "I found something" — the discovery pulse belongs to the one
 * moment in the conversation where an insight genuinely arrived. On Home the orb
 * is calm ('idle') for the standing picture of the business, wakes to 'learning'
 * only when new evidence was actually incorporated, and to 'attention' only when
 * a person left something meaningful.
 */
const ORB_STATE_BY_MOVE = {
  [MoveType.NEW_DOCUMENT]: 'learning',
  [MoveType.EXPERT_RESPONSE]: 'attention',
};

export function orbStateForMove(move) {
  if (!move) return 'idle';
  return ORB_STATE_BY_MOVE[move.type] || 'idle';
}