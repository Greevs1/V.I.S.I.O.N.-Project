/**
 * nextStepResolver — turn a Galileo answer into a GROUNDED next action.
 *
 * The rule this file exists to enforce: a CTA is only offered when there is a
 * real place to go, and its LABEL promises exactly what it does.
 *
 * WHY "SEE WHAT THIS COULD LOOK LIKE" USED TO OPEN VALUATION
 * Every WORKSPACE destination shared that one label. An answer categorised
 * `valuation`/`value` mapped to the valuation workspace, and an answer about
 * documents mapped to the Data Room, so a recommendation like "build a
 * management layer" (category: value) promised an implementation picture and
 * delivered the valuation screen. The label described one intent and the route
 * served another.
 *
 * Now:
 *   · when the backend recommends a next step, the PRIMARY action is the
 *     implementation preview — "See what this could look like" means exactly
 *     that, a preview of the plan built by the real 90-Day Sprint generator;
 *   · the category's own destination becomes a SECONDARY action, labelled for
 *     what it actually opens ("Open your valuation", "Open your Data Room").
 *
 * The step TEXT is always the backend's own words. This resolver only decides
 * WHERE the buttons go — it never invents a recommendation.
 */

export const NextStepKind = {
  IMPLEMENTATION: 'implementation',
  WORKSPACE: 'workspace',
  PLAYBOOK: 'playbook',
  SPRINT: 'sprint',
  DOMAIN: 'domain',
  WHATIF: 'whatif',
  FOLLOWUP: 'followup',
  // 6D.0c.2 — a step stated by the factual answer contract (review this figure,
  // choose a period, resolve the conflict). Its text is the contract's own.
  FACT: 'fact',
  NONE: 'none',
};

/**
 * A factual answer's next step comes from the SAME contract as the answer, so a
 * known figure can never be followed by "please provide that figure".
 */
function factualNextStep(step) {
  if (!step || step.kind === 'none' || !step.text) {
    return { kind: NextStepKind.NONE, label: '', target: null, text: null, reason: null, secondary: null };
  }
  if (step.kind === 'provide') {
    return { kind: NextStepKind.WORKSPACE, label: WORKSPACE_LABEL['data-room'], target: 'data-room', text: step.text, reason: null, secondary: null };
  }
  return { kind: NextStepKind.FACT, label: '', target: null, text: step.text, url: step.url || null, urlLabel: step.label || null, reason: null, secondary: null };
}

/**
 * The askGalileo contract returns a `category` for every answer. This is the
 * honest bridge from "what the answer is about" to "where the owner can see
 * it" — every target below is a surface that already exists.
 */
const CATEGORY_TARGET = {
  valuation: { kind: NextStepKind.WORKSPACE, target: 'valuation' },
  value: { kind: NextStepKind.WORKSPACE, target: 'valuation' },
  cash_flow: { kind: NextStepKind.DOMAIN, target: 'cash' },
  tax: { kind: NextStepKind.DOMAIN, target: 'tax' },
  profit: { kind: NextStepKind.DOMAIN, target: 'profit' },
  operations: { kind: NextStepKind.DOMAIN, target: 'operations' },
  protection: { kind: NextStepKind.DOMAIN, target: 'operations' },
  freedom: { kind: NextStepKind.DOMAIN, target: 'freedom' },
  sprint: { kind: NextStepKind.SPRINT },
  documents: { kind: NextStepKind.WORKSPACE, target: 'data-room' },
  outcomes: { kind: NextStepKind.PLAYBOOK },
  roadmap: { kind: NextStepKind.PLAYBOOK },
  wealth: { kind: NextStepKind.PLAYBOOK },
  next_best_action: { kind: NextStepKind.PLAYBOOK },
  general: { kind: NextStepKind.PLAYBOOK },
};

/** Labels that say what the button opens — never a shared generic phrase. */
const WORKSPACE_LABEL = {
  valuation: 'Open your valuation',
  'data-room': 'Open your documents',
  dashboard: 'Open your analytics',
};

const KIND_LABEL = {
  [NextStepKind.IMPLEMENTATION]: 'See what this could look like',
  [NextStepKind.PLAYBOOK]: 'Open your Playbook',
  [NextStepKind.SPRINT]: 'Open your 90-Day Sprint',
  [NextStepKind.DOMAIN]: 'Show me the detail',
  [NextStepKind.WHATIF]: 'Explore this scenario',
  [NextStepKind.FOLLOWUP]: 'Go deeper with Galileo',
};

function labelFor(kind, target) {
  if (kind === NextStepKind.WORKSPACE) return WORKSPACE_LABEL[target] || 'Open it';
  return KIND_LABEL[kind] || '';
}

function destination(mapped) {
  if (!mapped) return null;
  return { kind: mapped.kind, target: mapped.target || null, label: labelFor(mapped.kind, mapped.target) };
}

/**
 * @returns {{kind, label, target, text, reason, secondary}}
 *   secondary — an optional { kind, target, label } for the category's own
 *               destination, offered beside the primary action.
 */
export function resolveNextStep({ answer = null, home = null, hasWhatIf = false } = {}) {
  const none = { kind: NextStepKind.NONE, label: '', target: null, text: null, reason: null, secondary: null };
  if (!answer) return none;
  if (answer.factual) return factualNextStep(answer.factual.next_step);

  const mapped = CATEGORY_TARGET[answer.category] || null;

  // ── 1. The backend recommended a concrete step → preview its implementation
  const backendStep = (answer.nextStep || '').trim();
  if (backendStep) {
    const secondary = destination(mapped);
    return {
      kind: NextStepKind.IMPLEMENTATION,
      label: KIND_LABEL[NextStepKind.IMPLEMENTATION],
      target: null,
      text: backendStep,
      reason: 'Vision can show you what implementing this would involve.',
      // The Playbook as a secondary is noise next to an implementation preview.
      secondary: secondary && secondary.kind !== NextStepKind.PLAYBOOK ? secondary : null,
    };
  }

  // ── 2. An existing Opportunity ──────────────────────────────────────────
  const opportunity = (home?.opportunities || []).find(
    (o) => (o.status || 'available') === 'available'
  );
  if (opportunity) {
    return {
      kind: NextStepKind.PLAYBOOK,
      label: KIND_LABEL[NextStepKind.PLAYBOOK],
      target: null,
      text: opportunity.title,
      reason: 'You already have this in your Playbook.',
      secondary: null,
    };
  }

  // ── 3. Work already in flight ──────────────────────────────────────────
  if ((home?.sprints || []).length > 0) {
    return {
      kind: NextStepKind.SPRINT,
      label: KIND_LABEL[NextStepKind.SPRINT],
      target: null,
      text: 'Keep your current Sprint moving before starting something new.',
      reason: 'You have execution in flight.',
      secondary: null,
    };
  }

  // ── 4. The domain the answer is about ──────────────────────────────────
  if (mapped) {
    return {
      kind: mapped.kind,
      label: labelFor(mapped.kind, mapped.target),
      target: mapped.target || null,
      text: null,
      reason: null,
      secondary: null,
    };
  }

  // ── 5. Contextual follow-up, or nothing ────────────────────────────────
  if (hasWhatIf) {
    return {
      kind: NextStepKind.WHATIF,
      label: KIND_LABEL[NextStepKind.WHATIF],
      target: null,
      text: null,
      reason: null,
      secondary: null,
    };
  }

  return none;
}

/**
 * A follow-up question that Galileo can genuinely answer from the same
 * business context. Used only for the FOLLOWUP kind.
 */
export function buildFollowUpQuestion(answer) {
  if (!answer?.question) return null;
  const category = answer.category;
  if (category && category !== 'general') {
    return `What would have to change for ${category.replace(/_/g, ' ')} to improve?`;
  }
  return 'What should I look at first to move this forward?';
}