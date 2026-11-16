/**
 * Home Command Bar — contextual suggested commands.
 *
 * Not a giant command palette. Just a few suggested actions beneath the
 * Galileo input that change based on context.
 *
 * EVERY entry here executes. A chip is either a real backend question
 * (`prompt` → Ask Galileo) or a real handler in GalileoHome's handleCommand
 * (`action` → a workspace or an in-shell surface). Nothing is offered that has
 * no implementation behind it.
 */

/**
 * getDomainCommands — contextual commands inside a Business Pulse domain focus.
 *
 * Part 9: a Pulse domain resolves INLINE first (DomainFocus), and the actions
 * inside it are what promote the user into a workspace — "See valuation" opens
 * the valuation workspace, "Explore opportunities" opens the Playbook, and the
 * ask chips are answered by the canonical intelligence service.
 */
export function getDomainCommands(domain) {
  const explore = { label: 'Explore opportunities', action: 'view_opportunities' };
  const seeValuation = { label: 'See valuation', action: 'open_valuation' };
  // Part 23 — every domain offers the possibility engine, because "what would
  // this mean for my business" is the question behind every one of them.
  const whatIf = { label: 'What if?', action: 'whatif', icon: 'diamond' };

  const commands = {
    profit: [
      explore,
      whatIf,
      seeValuation,
      { label: 'Ask Galileo about profitability', prompt: 'How do I improve my profit margin?' },
    ],
    value: [
      seeValuation,
      whatIf,
      explore,
      { label: 'Ask Galileo about enterprise value', prompt: 'What is driving my business valuation?' },
    ],
    operations: [
      explore,
      whatIf,
      seeValuation,
      { label: 'Ask Galileo about operations', prompt: 'What is slowing down my operations?' },
    ],
    freedom: [
      whatIf,
      explore,
      { label: 'Ask Galileo about owner freedom', prompt: 'How can I reduce dependence on myself in the business?' },
    ],
    cash: [
      { label: 'Connect financials', action: 'connect_financials' },
      whatIf,
      { label: 'Ask Galileo about cash flow', prompt: 'How can I improve my cash flow?' },
    ],
    tax: [
      { label: 'Connect tax data', action: 'connect_financials' },
      explore,
      whatIf,
      { label: 'Ask Galileo about tax exposure', prompt: 'How can I reduce my tax gap?' },
    ],
  };

  return commands[domain] || [];
}

export function getSprintCommands() {
  return [
    { label: "What's blocking us?", action: 'sprint_blockers' },
    { label: 'What can Galileo do?', action: 'sprint_galileo_help' },
    { label: 'Bring in an expert', action: 'sprint_expert' },
  ];
}

export function getPlaybookCommands() {
  return [
    { label: 'Show active plays', action: 'playbook_active' },
    { label: 'Show discovered', action: 'playbook_discovered' },
    { label: 'Show completed', action: 'playbook_completed' },
  ];
}

/**
 * getAskSuggestions — suggested prompts for the Vision command bar.
 *
 * Each suggestion is a question the canonical intelligence service can
 * genuinely answer from verified business data, chosen from what is ACTUALLY
 * known about this business. Nothing is offered that the service would have
 * to invent an answer for.
 *
 * @param {object} ctx — { hasFinancials, hasOpportunities, hasActiveSprints,
 *                         hasRecentDocument, signalStates }
 * @returns {array} — up to 4 { label, prompt } suggestions
 */
export function getAskSuggestions(ctx = {}) {
  const {
    hasFinancials = false,
    hasOpportunities = false,
    hasActiveSprints = false,
    hasRecentDocument = false,
    signalStates = null,
  } = ctx;

  const suggestions = [];

  if (hasRecentDocument) {
    suggestions.push({
      label: 'What did Galileo find in my latest document?',
      prompt: 'What did Galileo find in my latest document?',
    });
    // A contextual Documents action (Global Rule #1): the library lives inside
    // the Galileo document overlay, so this is a real action, not a question.
    suggestions.push({ label: 'Show me my documents', action: 'view_documents' });
  }

  if (hasOpportunities) {
    suggestions.push({
      label: 'What is my highest-value opportunity?',
      prompt: 'What is my highest-value opportunity?',
    });
  }

  const taxGap = signalStates?.tax?.value;
  if (taxGap != null && taxGap > 0) {
    suggestions.push({
      label: 'How can I reduce my tax gap?',
      prompt: 'How can I reduce my tax gap?',
    });
  } else if (hasFinancials) {
    suggestions.push({
      label: 'How do I improve my profit margin?',
      prompt: 'How do I improve my profit margin?',
    });
  }

  if (hasActiveSprints) {
    suggestions.push({
      label: 'What is blocking my 90-Day Sprint?',
      prompt: 'What is blocking my 90-Day Sprint?',
    });
  }

  // Only ever add the generic prompt when context gave us too few real ones.
  if (suggestions.length < 3) {
    suggestions.push({
      label: 'What should I focus on first?',
      prompt: 'What should I focus on first?',
    });
  }

  // ── WHAT IF is a signature Galileo capability, so it is ALWAYS offered ──
  // It is an action chip, not a question: the canonical engine does the
  // modelling, not the question-answering service. Capped at four chips total
  // so the command bar never becomes a menu.
  return [...suggestions.slice(0, 3), WHAT_IF_CHIP];
}

/**
 * The What If chip. Carries `icon` so the command bar can render the diamond
 * and `hover: true` so it can show its explanatory preview. It is never
 * emitted from a context that cannot honour it — the caller wires the handler.
 */
export const WHAT_IF_CHIP = {
  label: 'What if?',
  action: 'whatif',
  icon: 'diamond',
  hover: true,
};