/**
 * activeScenario — MODEL THIS becomes a REAL scenario the main interface continues.
 *
 * WHAT MODEL THIS MEANS, AND WHAT IT DOES NOT
 *
 *   MODEL THIS  → "I want to explore what happens if I pursue this."
 *   BUILD THIS  → "I have decided to implement it."
 *
 * The two are different, so they are different actions. The first ACTIVATES a
 * scenario and enters the main interface with it; it never opens the Scenario
 * Detail side drawer, which is a detail inspector — the right tool for reviewing
 * an existing scenario, the wrong one for a transition this large.
 *
 * NO SECOND SCENARIO SYSTEM
 *
 *   · the scenario KEY comes from the existing canonical mapper
 *     (implementationAccess.scenarioForOpportunity → the What If lever catalog),
 *     so a scenario offered here is one the engine can genuinely model;
 *   · the scenario is PRESERVED in the existing saved-item store, which the
 *     Playbook already reads — so it is a real object available later, not a chat
 *     artefact;
 *   · the handoff record itself is session-scoped UI focus state, exactly like the
 *     saved-item and handled-move ledgers: no new entity, no new server truth.
 *
 * The record carries the CONTEXT FORWARD — the opportunity, the strategy, the
 * facts Galileo actually knows, its evidence and the confidence it qualified —
 * so the arriving surface continues the same thought instead of starting a new one.
 */

import { scenarioForOpportunity } from './implementationAccess';
import { saveItem } from './saveManager';

const ACTIVE_KEY = 'vision_active_scenario_v1';

function storage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * The NEXT MOVE each canonical lever implies, in the lever's own terms.
 * A lever with no entry falls back to the owner's chosen strategy, so the copy is
 * always derived from THIS opportunity — never a generic implementation script.
 */
const LEVER_MOVE = {
  hire_manager:
    'Let\'s see how much of the business currently depends on knowledge that lives only with you or a few key people.',
  raise_prices: 'Let\'s see what your customers would actually pay if you moved prices deliberately.',
  improve_margins: 'Let\'s see where the margin is actually going before anything gets cut.',
  add_revenue: 'Let\'s see what the next layer of revenue would require from the business.',
  hire_salesperson: 'Let\'s see what a dedicated seller would have to bring in to pay for themselves.',
  reduce_owner_involvement: 'Let\'s see which parts of the week only you can do.',
};

function slimOpportunity(opportunity) {
  if (!opportunity) return null;
  return {
    id: opportunity.id || null,
    title: opportunity.title || null,
    summary: opportunity.summary || null,
    confidence: opportunity.confidence || null,
    evidence: Array.isArray(opportunity.evidence) ? opportunity.evidence : [],
    // The opportunity's OWN candidate actions. They are the only grounded next
    // steps available at this point, so they are carried verbatim and never
    // padded with invented ones.
    strategies: Array.isArray(opportunity.strategies) ? opportunity.strategies : [],
  };
}

/**
 * activateScenario — create/activate the canonical scenario and persist the
 * handoff. Returns the record, or null when there is nothing to explore.
 */
export function activateScenario({
  opportunity = null,
  strategy = null,
  model = null,
  answers = {},
  intent = null,
  facts = null,
  guestSessionId = null,
  businessId = null,
  sourceActionId = null,
} = {}) {
  if (!opportunity && !strategy) return null;

  // ── IDEMPOTENT ──────────────────────────────────────────────────────────────
  // The ACTION that produced this transition is its identity. Activating the same
  // action twice — a double click, a re-render, a resumed stream — returns the
  // record that already exists instead of creating a second scenario and a second
  // saved item for one decision.
  //
  // An activation WITHOUT a source action id keeps the previous behaviour exactly:
  // two deliberate explorations are two scenarios (the handoff suite depends on
  // this), so only a re-run of the SAME action is collapsed.
  const already = readActiveScenario();
  if (sourceActionId && already && already.sourceActionId === sourceActionId) {
    return already;
  }
  const opp = slimOpportunity(opportunity);
  const lever = scenarioForOpportunity(opportunity || {});
  const record = {
    // Unique even inside one millisecond: two deliberate explorations must never
    // share an identity just because they happened back to back.
    id: `scenario_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    activatedAt: new Date().toISOString(),
    returned: false,
    // The action this transition belongs to — the idempotency key above.
    sourceActionId,
    opportunity: opp,
    strategy: strategy || null,
    scenario: lever ? { key: lever.key, title: lever.title, prompt: lever.prompt } : null,
    // The FACTS Galileo knows (with their epistemic states) — carried so the
    // arriving surface can state what is known, estimated or unknown, and can
    // never re-derive a conclusion the evidence does not support.
    facts: facts || null,
    signals: model?.signals || null,
    answers: { ...answers },
    intent: intent || null,
    guestSessionId: guestSessionId || null,
  };

  const store = storage();
  if (store) {
    try {
      store.setItem(ACTIVE_KEY, JSON.stringify(record));
    } catch { /* best-effort */ }
  }

  // The CANONICAL store: the same saved-item store the Playbook reads, so the
  // scenario survives as an object the owner can return to.
  try {
    saveItem(
      {
        type: 'scenario',
        title: record.strategy || opp?.title || 'Scenario',
        data: {
          scenarioKey: record.scenario?.key || null,
          strategy: record.strategy || null,
          opportunityId: opp?.id || null,
          opportunityTitle: opp?.title || null,
          // An EXPLORING scenario, not a decided one: the lifecycle stage is
          // carried explicitly so nothing downstream can mistake it for a Play.
          stage: 'exploring',
          activatedAt: record.activatedAt,
        },
      },
      businessId,
    );
  } catch { /* best-effort */ }

  return record;
}

/** readActiveScenario — the handoff, or null. Survives a refresh within the session. */
export function readActiveScenario() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** markScenarioReturned — the owner went back to the conversation; do not re-open it. */
export function markScenarioReturned() {
  const record = readActiveScenario();
  if (!record) return null;
  const updated = { ...record, returned: true };
  const store = storage();
  if (store) {
    try {
      store.setItem(ACTIVE_KEY, JSON.stringify(updated));
    } catch { /* best-effort */ }
  }
  return updated;
}

/** clearActiveScenario — the scenario is no longer the active focus. */
export function clearActiveScenario() {
  const store = storage();
  if (store) {
    try {
      store.removeItem(ACTIVE_KEY);
    } catch { /* best-effort */ }
  }
  return null;
}

/**
 * scenarioContinuation — WHAT THE ARRIVING SURFACE SAYS.
 *
 * Every line is derived from the record: the opportunity's own title and summary,
 * the lever's own next move (falling back to the owner's chosen strategy), and the
 * opportunity's own candidate actions. Nothing here is a global script — a pricing
 * opportunity and an owner-dependency opportunity produce different copy.
 */
export function scenarioContinuation(record) {
  if (!record) return null;
  const opp = record.opportunity || null;
  const strategies = Array.isArray(opp?.strategies) ? opp.strategies : [];
  const chosen = record.strategy || strategies[0] || null;

  const moveText = (record.scenario?.key && LEVER_MOVE[record.scenario.key])
    || (chosen ? `Let's see what ${String(chosen).replace(/^./, (c) => c.toLowerCase())} would actually take.` : null);

  // The opportunity's OWN actions, the chosen one first, and never more than
  // three: enough to act on, not an implementation checklist (§9).
  const steps = Array.from(new Set([chosen, ...strategies].filter(Boolean))).slice(0, 3);

  return {
    focusTitle: chosen || opp?.title || null,
    focusSummary: opp?.summary || null,
    opportunityTitle: opp?.title || null,
    confidence: opp?.confidence || null,
    evidence: opp?.evidence || [],
    nextMove: moveText ? { text: moveText, actionLabel: 'Continue With Galileo' } : null,
    steps,
    fork: {
      galileo: { label: 'Do It With Galileo', desc: 'Turn this into a plan, tasks and milestones' },
      expert: { label: 'Work With An Expert', desc: 'Bring in the right professional' },
    },
  };
}