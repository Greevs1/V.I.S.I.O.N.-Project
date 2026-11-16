/**
 * Goal Intelligence — quiet goal-driven prioritization.
 *
 * Galileo should know what the user is trying to accomplish. Goals should
 * NOT be a giant module — they're a subtle badge that informs prioritization.
 *
 * Examples:
 *   "$10M Exit · 2029"
 *   "Work 20 hrs/week"
 *   "Increase owner income"
 *   "Reduce taxes"
 *   "Transfer to children"
 *   "Acquire competitors"
 *   "Build recurring revenue"
 *
 * The user can edit goals conversationally:
 *   "My goal is to sell for $8M in three years."
 *   Galileo parses and updates.
 */

const STORAGE_KEY_PREFIX = 'vision_galileo_goals';

function getStorageKey(businessId) {
  // Business-scoped key prevents cross-business goal leakage on switch.
  // For anonymous/guest users (no businessId), use the legacy unscoped key.
  return businessId ? `${STORAGE_KEY_PREFIX}:${businessId}` : STORAGE_KEY_PREFIX;
}

export const GoalType = {
  EXIT: 'exit',
  FREEDOM: 'freedom',
  INCOME: 'income',
  TAX: 'tax',
  TRANSFER: 'transfer',
  ACQUISITION: 'acquisition',
  RECURRING_REVENUE: 'recurring_revenue',
  CUSTOM: 'custom',
};

const GOAL_LABELS = {
  [GoalType.EXIT]: 'Exit',
  [GoalType.FREEDOM]: 'Freedom',
  [GoalType.INCOME]: 'Owner Income',
  [GoalType.TAX]: 'Tax Reduction',
  [GoalType.TRANSFER]: 'Succession',
  [GoalType.ACQUISITION]: 'Acquisition',
  [GoalType.RECURRING_REVENUE]: 'Recurring Revenue',
  [GoalType.CUSTOM]: 'Custom',
};

/**
 * getGoals — retrieves stored goals.
 * Goals are persisted in localStorage for now; future: Supabase.
 */
export function getGoals(businessId = null) {
  try {
    const key = getStorageKey(businessId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * getPrimaryGoal — returns the first (primary) goal, or null.
 */
export function getPrimaryGoal(businessId = null) {
  const goals = getGoals(businessId);
  return goals[0] || null;
}

/**
 * saveGoal — adds or updates a goal.
 */
export function saveGoal(goal, businessId = null) {
  const goals = getGoals(businessId);
  const existing = goals.find((g) => g.id === goal.id);
  if (existing) {
    Object.assign(existing, goal);
  } else {
    goals.push({
      id: goal.id || `goal_${Date.now()}`,
      type: goal.type || GoalType.CUSTOM,
      label: goal.label || 'Custom goal',
      detail: goal.detail || null,
      targetDate: goal.targetDate || null,
      targetValue: goal.targetValue || null,
      createdAt: new Date().toISOString(),
    });
  }
  try {
    localStorage.setItem(getStorageKey(businessId), JSON.stringify(goals));
  } catch { /* non-fatal */ }
  return goals;
}

/**
 * removeGoal — removes a goal by id.
 */
export function removeGoal(goalId, businessId = null) {
  const goals = getGoals(businessId).filter((g) => g.id !== goalId);
  try {
    localStorage.setItem(getStorageKey(businessId), JSON.stringify(goals));
  } catch { /* non-fatal */ }
  return goals;
}

/**
 * formatGoalBadge — returns a short badge string for subtle display.
 * Example: "$10M Exit · 2029"
 */
export function formatGoalBadge(goal) {
  if (!goal) return null;
  const parts = [];
  if (goal.targetValue) parts.push(goal.targetValue);
  parts.push(GOAL_LABELS[goal.type] || goal.label);
  if (goal.targetDate) parts.push(goal.targetDate);
  return parts.join(' · ');
}

/**
 * parseGoalFromText — attempts to parse a goal from conversational text.
 * Returns a goal object or null.
 *
 * Examples:
 *   "I want to sell for $10M in five years" → { type: exit, targetValue: $10M, targetDate: ~2031 }
 *   "Work 20 hours a week" → { type: freedom, detail: '20 hrs/week' }
 *   "Reduce my taxes" → { type: tax }
 */
export function parseGoalFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Exit / sell
  if (lower.match(/sell|exit|acquir|buyout|sell the business/)) {
    const valueMatch = text.match(/\$?(\d+(?:\.\d+)?)\s*([mMkK])?/);
    const dateMatch = text.match(/(\d+)\s*year/i) || text.match(/20\d{2}/);
    return {
      type: GoalType.EXIT,
      label: 'Exit',
      targetValue: valueMatch ? formatTargetValue(valueMatch) : null,
      targetDate: dateMatch ? resolveTargetDate(dateMatch) : null,
      detail: text,
    };
  }

  // Freedom / hours
  if (lower.match(/freedom|hours.*week|work.*less|step.*back|less.*involved/)) {
    const hoursMatch = text.match(/(\d+)\s*hour/i);
    return {
      type: GoalType.FREEDOM,
      label: 'Freedom',
      detail: hoursMatch ? `${hoursMatch[1]} hrs/week` : 'Reduce owner involvement',
      targetValue: hoursMatch ? `${hoursMatch[1]} hrs/week` : null,
    };
  }

  // Tax
  if (lower.match(/tax|taxes|tax.*reduc/)) {
    return {
      type: GoalType.TAX,
      label: 'Tax Reduction',
      detail: text,
    };
  }

  // Income
  if (lower.match(/income|profit.*owner|owner.*pay|salary.*increase/)) {
    return {
      type: GoalType.INCOME,
      label: 'Owner Income',
      detail: text,
    };
  }

  // Transfer / succession
  if (lower.match(/transfer|succession|children|family|hand.*off|next.*gen/)) {
    return {
      type: GoalType.TRANSFER,
      label: 'Succession',
      detail: text,
    };
  }

  // Acquisition
  if (lower.match(/acquire|acquisition|buy.*business|roll.*up|competitor/)) {
    return {
      type: GoalType.ACQUISITION,
      label: 'Acquisition',
      detail: text,
    };
  }

  // Recurring revenue
  if (lower.match(/recurring|subscription|retainer|contract.*revenue/)) {
    return {
      type: GoalType.RECURRING_REVENUE,
      label: 'Recurring Revenue',
      detail: text,
    };
  }

  return null;
}

function formatTargetValue(match) {
  const num = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase();
  if (unit === 'm') return `$${num}M`;
  if (unit === 'k') return `$${num}K`;
  return `$${num}`;
}

function resolveTargetDate(dateMatch) {
  if (dateMatch[0]?.match(/20\d{2}/)) return dateMatch[0];
  const years = parseInt(dateMatch[1], 10);
  if (years > 0) return String(new Date().getFullYear() + years);
  return null;
}

/**
 * goalAffectsPriority — returns how much a goal should boost a candidate's priority.
 */
export function goalAffectsPriority(goal, candidate) {
  if (!goal || !candidate) return 0;
  const goalTypeMap = {
    [GoalType.EXIT]: ['value', 'freedom', 'operations'],
    [GoalType.FREEDOM]: ['freedom', 'operations'],
    [GoalType.INCOME]: ['profit', 'value'],
    [GoalType.TAX]: ['tax'],
    [GoalType.TRANSFER]: ['operations', 'freedom'],
    [GoalType.ACQUISITION]: ['value', 'cash'],
    [GoalType.RECURRING_REVENUE]: ['profit', 'value'],
  };
  const alignedDomains = goalTypeMap[goal.type] || [];
  if (candidate.domain && alignedDomains.includes(candidate.domain)) return 15;
  return 0;
}