/**
 * Playbook Store — unified surface for all business work.
 *
 * Organizes meaningful business work conceptually:
 *   DISCOVERED  — things worth considering
 *   EXPLORING   — Opportunities / Strategies / Scenarios being investigated
 *   ACTIVE      — things the user decided to implement
 *   COMPLETED   — implemented / measured items
 *
 * Everything Galileo discovers does not disappear into chat history.
 * It can become persistent business intelligence.
 *
 * Reuses existing entities:
 *   - galileo_opportunities (Discovered/Exploring)
 *   - NinetyDaySprint (Active)
 *   - Strategy outcomes (Completed)
 *
 * This is a UX layer, NOT a new database architecture.
 */

export const PlaybookStage = {
  DISCOVERED: 'discovered',
  EXPLORING: 'exploring',
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

export const PlaybookItemType = {
  OPPORTUNITY: 'opportunity',
  STRATEGY: 'strategy',
  SCENARIO: 'scenario',
  PLAY: 'play',
  SAVED: 'saved',
  SAVED_PLAYBOOK: 'saved_playbook',
};

/**
 * loadPlaybook — loads all playbook items from existing entities.
 * Returns items categorized by stage.
 *
 * @param {object} ctx — { businessId, opportunities, sprints, savedItems }
 * @returns {object} — { discovered, exploring, active, completed, all }
 */
export async function loadPlaybook(ctx = {}) {
  const { opportunities = [], sprints = [], savedItems = [], savedPlaybooks = [] } = ctx;

  const discovered = [];
  const exploring = [];
  const active = [];
  const completed = [];

  // Opportunities → stage based on persisted status + converted_to_path
  for (const opp of opportunities) {
    const stage = resolveOpportunityStage(opp);
    if (!stage) continue; // null = excluded (superseded)
    const item = mapOpportunityToItem(opp, stage);
    if (stage === PlaybookStage.DISCOVERED) discovered.push(item);
    else if (stage === PlaybookStage.EXPLORING) exploring.push(item);
    else if (stage === PlaybookStage.ACTIVE) active.push(item);
    else if (stage === PlaybookStage.COMPLETED) completed.push(item);
  }

  // Sprints → active or completed based on status
  for (const sprint of sprints) {
    if (sprint.status === 'completed' || sprint.status === 'archived') {
      completed.push(mapSprintToItem(sprint, PlaybookStage.COMPLETED));
    } else if (sprint.status === 'active') {
      active.push(mapSprintToItem(sprint, PlaybookStage.ACTIVE));
    }
  }

  // Saved items → discovered (things worth considering)
  for (const saved of savedItems) {
    discovered.push(mapSavedToItem(saved));
  }

  // saved_playbooks (persisted, business-scoped) → EXPLORING. These are things
  // the owner deliberately kept to keep working on: a strategy, a scenario.
  for (const row of savedPlaybooks) {
    exploring.push(mapSavedPlaybookToItem(row));
  }

  return {
    discovered,
    exploring,
    active,
    completed,
    all: [...discovered, ...exploring, ...active, ...completed],
  };
}

function resolveOpportunityStage(opp) {
  // Phase 5.1: Use real persisted state from entity fields.
  // galileo_opportunities.status: available | active | completed | archived | superseded
  // galileo_opportunities.converted_to_path: boolean (linked to a sprint)
  // BIS opportunities.status: similar values from business_opportunities table

  const status = opp.status || 'available';

  // Superseded → exclude entirely
  if (status === 'superseded') return null;

  // Completed or archived → COMPLETED
  if (status === 'completed' || status === 'archived') {
    return PlaybookStage.COMPLETED;
  }

  // Active → ACTIVE (user is working on it)
  if (status === 'active') {
    return PlaybookStage.ACTIVE;
  }

  // Available + converted_to_path → ACTIVE (linked to a sprint/play)
  if (status === 'available' && opp.convertedToPath) {
    return PlaybookStage.ACTIVE;
  }

  // Available + not converted → DISCOVERED
  // NOTE: There is no persisted "exploring" state in the current schema.
  // A user may be investigating an opportunity without having converted it,
  // but that investigation state is not persisted. EXPLORING cannot be
  // determined from the current entity schema — documented as a schema limitation.
  return PlaybookStage.DISCOVERED;
}

function mapOpportunityToItem(opp, stage) {
  const stageLabel = {
    [PlaybookStage.DISCOVERED]: 'Discovered',
    [PlaybookStage.EXPLORING]: 'Exploring',
    [PlaybookStage.ACTIVE]: 'Active',
    [PlaybookStage.COMPLETED]: 'Completed',
  }[stage] || 'Discovered';

  return {
    id: opp.id || `opp_${opp.title}`,
    type: PlaybookItemType.OPPORTUNITY,
    stage,
    title: opp.title || 'Opportunity',
    subtitle: opp.subtitle || opp.summary || null,
    statusLabel: stageLabel,
    impact: opp.impact || opp.potentialValueImpact || opp.modeledImpact || null,
    next: stage === PlaybookStage.ACTIVE ? 'Continue' : stage === PlaybookStage.COMPLETED ? 'Review outcomes' : 'Investigate',
    nextAction: { type: 'opportunity', id: opp.id },
    confidence: opp.confidenceScore || opp.confidence || null,
    domain: opp.category || opp.domain || null,
  };
}

function mapSprintToItem(sprint, stage) {
  // Accepts both the raw Sprint row and the normalized `plays` shape that
  // HomeContext produces (title/goal/progress), which is what Home passes in.
  return {
    id: sprint.id,
    type: PlaybookItemType.PLAY,
    stage,
    title: sprint.path_title || sprint.title || sprint.business_name || '90-Day Sprint',
    subtitle: sprint.path_goal || sprint.goal || sprint.path_summary || sprint.summary || null,
    statusLabel: stage === PlaybookStage.ACTIVE ? 'Active Sprint' : 'Completed',
    impact: null,
    progress: sprint.progress_percent ?? sprint.progress ?? 0,
    next: stage === PlaybookStage.ACTIVE ? 'Continue sprint' : 'Review outcomes',
    nextAction: { type: 'sprint', id: sprint.id },
    domain: sprint.selected_path || null,
  };
}

function mapSavedToItem(saved) {
  return {
    id: saved.id,
    type: PlaybookItemType.SAVED,
    stage: PlaybookStage.DISCOVERED,
    title: saved.title || 'Saved item',
    subtitle: saved.data?.summary || null,
    statusLabel: 'Saved',
    impact: null,
    next: 'Revisit',
    nextAction: { type: 'saved', id: saved.id },
  };
}

/** Parse a saved_playbooks `content` column, which may be JSON or plain text. */
export function parseSavedContent(content) {
  if (!content || typeof content !== 'string') return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function mapSavedPlaybookToItem(row) {
  const parsed = parseSavedContent(row.content);
  const isScenario = parsed?.kind === 'what_if_scenario';
  return {
    id: row.id,
    type: PlaybookItemType.SAVED_PLAYBOOK,
    stage: PlaybookStage.EXPLORING,
    title: row.title || 'Saved strategy',
    subtitle: parsed?.result_summary || (parsed ? null : row.content?.slice(0, 160)) || null,
    statusLabel: isScenario ? 'Saved scenario' : 'Saved strategy',
    impact: null,
    next: isScenario ? 'Reopen scenario' : 'Continue exploring',
    nextAction: { type: 'saved_playbook', id: row.id },
    savedContent: parsed,
    rawContent: row.content || null,
  };
}

/**
 * progressItem — moves an item from one stage to the next.
 * This is a conceptual transition, not a database write.
 * The actual entity update happens through existing services.
 */
export function progressItem(item, toStage) {
  return {
    ...item,
    stage: toStage,
    statusLabel: stageLabel(toStage),
    next: nextForStage(toStage),
  };
}

function stageLabel(stage) {
  return {
    [PlaybookStage.DISCOVERED]: 'Discovered',
    [PlaybookStage.EXPLORING]: 'Exploring',
    [PlaybookStage.ACTIVE]: 'Active',
    [PlaybookStage.COMPLETED]: 'Completed',
  }[stage] || stage;
}

function nextForStage(stage) {
  return {
    [PlaybookStage.DISCOVERED]: 'Investigate',
    [PlaybookStage.EXPLORING]: 'Choose strategy',
    [PlaybookStage.ACTIVE]: 'Continue',
    [PlaybookStage.COMPLETED]: 'Review outcomes',
  }[stage] || null;
}

/**
 * getPlaybookSummary — returns a short summary for the utility dock badge.
 */
export function getPlaybookSummary(playbook) {
  if (!playbook) return { active: 0, total: 0 };
  return {
    active: playbook.active?.length || 0,
    exploring: playbook.exploring?.length || 0,
    discovered: playbook.discovered?.length || 0,
    completed: playbook.completed?.length || 0,
    total: playbook.all?.length || 0,
  };
}