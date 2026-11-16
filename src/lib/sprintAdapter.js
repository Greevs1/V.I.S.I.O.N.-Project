/**
 * Sprint Adapter Layer
 *
 * Maps Supabase sprint data (from ninetyDaySprint/getSprint backend)
 * into the UI model shape consumed by sprint components.
 *
 * Supabase tables → UI model:
 *   ninety_day_sprint_paths    → sprint (path card model)
 *   ninety_day_sprint_tasks    → tasks[] (month/week/task/subtask model)
 *   ninety_day_sprint_task_notes → notes[]
 *   ninety_day_sprint_task_documents → docs[]
 *   ninety_day_sprint_reminders → reminders[]
 *
 * galileo_opportunities (via getActivePaths) → paths[] (outcome card model)
 */

/**
 * Normalize a single sprint path from Supabase into UI-friendly shape.
 */
export function normalizeSprint(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    pathKey: raw.path_key,
    pathTitle: raw.path_title || raw.title || '',
    pathGoal: raw.path_goal || '',
    pathSummary: raw.path_summary || raw.description || '',
    expectedOutcome: raw.expected_outcome || '',
    ease: raw.ease_of_implementation || raw.ease || null,
    impact: raw.estimated_impact || raw.impact || null,
    confidence: raw.galileo_confidence || raw.confidence_score || 0,
    status: raw.status || 'active',
    isSelected: raw.is_selected ?? true,
    isActive: raw.is_active ?? true,
    progressPercent: raw.progress_percent || 0,
    startDate: raw.start_date || (raw.created_at ? raw.created_at.split('T')[0] : ''),
    endDate: raw.end_date || computeEndDate(raw.start_date || raw.created_at),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    businessId: raw.business_id,
    profileId: raw.profile_id,
  };
}

/**
 * Normalize a task from Supabase into UI-friendly shape.
 */
export function normalizeTask(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    sprintId: raw.path_id,
    parentTaskId: raw.parent_task_id || null,
    taskType: raw.task_type || 'main_task',
    title: raw.title || '',
    description: raw.description || '',
    monthNumber: raw.month_number || 1,
    weekNumber: raw.week_number || 1,
    dueDate: raw.due_date || null,
    assignedToId: raw.assigned_to_profile_id || null,
    assignedToName: raw.assigned_to_name || null,
    priority: raw.priority || 'medium',
    ease: raw.ease || 'medium',
    impact: raw.impact || 'medium',
    expectedOutcome: raw.expected_outcome || '',
    status: raw.status || 'not_started',
    completedAt: raw.completed_at || null,
    completedBy: raw.completed_by || null,
    sortOrder: raw.sort_order || 0,
    isGalileoGenerated: raw.is_galileo_generated ?? false,
    isUserCreated: raw.is_user_created ?? false,
    locked: raw.locked ?? false,
    isDeleted: raw.is_deleted ?? false,
    estimatedTime: raw.estimated_time || null,
    businessId: raw.business_id,
  };
}

/**
 * Normalize a note from Supabase into UI-friendly shape.
 */
export function normalizeNote(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    taskId: raw.task_id,
    sprintId: raw.sprint_id || raw.path_id,
    noteText: raw.note_text || '',
    createdByName: raw.created_by_name || '',
    isDeleted: raw.is_deleted ?? false,
  };
}

/**
 * Normalize a document attachment from Supabase into UI-friendly shape.
 */
export function normalizeDoc(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    taskId: raw.task_id,
    sprintId: raw.sprint_id || raw.path_id,
    documentId: raw.document_id || '',
    documentName: raw.document_name || '',
    attachedBy: raw.attached_by || '',
  };
}

/**
 * Normalize an opportunity/path card from galileo_opportunities into UI shape.
 */
export function normalizePathCard(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    category: raw.category || '',
    expectedOutcome: raw.expected_outcome || '',
    impactScore: raw.impact_score || 0,
    easeScore: raw.ease_score || 0,
    urgencyScore: raw.urgency_score || 0,
    confidenceScore: raw.confidence_score || 0,
    timeToValueScore: raw.time_to_value_score || 0,
    strategicOpportunityScore: raw.strategic_opportunity_score || 0,
    estimatedValueCreated: raw.estimated_value_created || 0,
    estimatedTaxSavings: raw.estimated_tax_savings || 0,
    estimatedCashFlowImprovement: raw.estimated_cash_flow_improvement || 0,
    estimatedProfitImprovement: raw.estimated_profit_improvement || 0,
    estimatedRiskReduction: raw.estimated_risk_reduction || 0,
    status: raw.status || 'available',
    convertedToPath: raw.converted_to_path ?? false,
    pathId: raw.path_id || null,
    generationId: raw.generation_id || null,
    reasoning: raw.reasoning || {},
    source: raw.source || '',
  };
}

function computeEndDate(startDateStr) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr);
  d.setDate(d.getDate() + 90);
  return d.toISOString().split('T')[0];
}

/**
 * Compute a sprint's display date range from normalized sprint data.
 * Falls back to createdAt if startDate is missing.
 */
export function getSprintDateRange(sprint) {
  const start = sprint.startDate || (sprint.createdAt ? sprint.createdAt.split('T')[0] : '');
  const end = sprint.endDate || computeEndDate(start);
  return { start, end };
}

/**
 * Compute current week number based on sprint start date.
 */
export function getCurrentWeek(sprint) {
  const startStr = sprint.startDate || (sprint.createdAt ? sprint.createdAt.split('T')[0] : null);
  if (!startStr) return 1;
  const start = new Date(startStr);
  const now = new Date();
  const daysElapsed = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.min(Math.max(Math.ceil(daysElapsed / 7), 1), 12);
}

/**
 * Group tasks by month, then by week within each month.
 */
export function groupTasksByMonthWeek(tasks) {
  const mainTasks = tasks.filter(t => t.taskType === 'main_task' && !t.isDeleted);
  const groups = {};

  mainTasks.forEach(task => {
    const m = task.monthNumber || 1;
    const w = task.weekNumber || 1;
    if (!groups[m]) groups[m] = { month: m, tasks: [], weeks: {} };
    groups[m].tasks.push(task);
    if (!groups[m].weeks[w]) groups[m].weeks[w] = [];
    groups[m].weeks[w].push(task);
  });

  return [1, 2, 3].map(m => {
    const g = groups[m] || { month: m, tasks: [], weeks: {} };
    const completed = g.tasks.filter(t => t.status === 'completed').length;
    const total = g.tasks.length;
    return {
      month: m,
      tasks: g.tasks,
      weeks: g.weeks,
      completed,
      total,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });
}

/**
 * Compute overall sprint progress percentage.
 */
export function computeProgress(tasks) {
  const mainTasks = tasks.filter(t => t.taskType === 'main_task' && !t.isDeleted);
  if (mainTasks.length === 0) return 0;
  const completed = mainTasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / mainTasks.length) * 100);
}