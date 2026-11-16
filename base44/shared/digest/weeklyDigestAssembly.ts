/**
 * weeklyDigestAssembly — THE single calculation path for the weekly V.I.S.I.O.N. digest.
 *
 * WHY THIS MODULE EXISTS (P0 repair, 2026-11-02)
 *   The scheduled digest previously assembled its numbers with PROFILE-scoped reads.
 *   For a multi-business account with 3 businesses that is not a scoping nicety: the
 *   audited live data showed documents counting 67 rows (53 business + 7 other-business
 *   + 7 NULL-business) and the ONLY dashboard_metrics row belonging to a DIFFERENT
 *   business, whose IQ score was presented as this business's.
 *
 * THE CONTRACT
 *   Every read below is filtered by the AUTHORIZED business_id. No read uses profile_id
 *   as a substitute for business identity, no read accepts a NULL-business row, and no
 *   value is fabricated when a business has no data:
 *
 *     · sprint paths   → business_id
 *     · sprint tasks   → path_id AND business_id (the task's own, not the parent's)
 *     · documents      → business_id
 *     · metrics        → business_id
 *     · opportunities  → business_id (already correct; kept)
 *
 *   NULL-business legacy rows and other-business rows are therefore EXCLUDED by
 *   construction. `assembleWeeklyDigest` additionally proofs its own output: every row
 *   it actually used is recorded, and the digest reports `scope_verified: false` if a
 *   single row's business_id is not the authorized one. That is what the dry-run checks
 *   — the complete scope of the query pipeline, not merely that resolution succeeded.
 *
 *   IQ SCORE: when the business has no metrics rows, the digest says
 *   "Not yet available." — never 0, never another business's score, never a change.
 *   (`iq_score_change` is `null` in that case, deliberately, so a consumer cannot
 *   mistake "no data" for "no movement".)
 *
 * The caller supplies the AUTHORIZED business_id. This module never resolves, defaults,
 * or infers one.
 */

export const IQ_NOT_YET_AVAILABLE = 'Not yet available.';

export interface DigestScopeReport {
  documents_considered: number;
  metrics_rows_considered: number;
  sprints_considered: number;
  sprint_tasks_considered: number;
  upcoming_tasks_considered: number;
  opportunities_considered: number;
  distinct_business_ids: string[];
  null_business_rows: number;
  violations: string[];
  scope_verified: boolean;
}

export interface WeeklyDigestResult {
  business_id: string;
  digest: {
    sprint_progress: number;
    tasks_completed: number;
    tasks_overdue: number;
    new_opportunities: number;
    completed_opportunities: number;
    documents_uploaded: number;
    documents_analyzed: number;
    iq_score_available: boolean;
    iq_score_change: number | null;
    iq_score_display: string;
    upcoming_deadlines: number;
  };
  active_sprint: { id: string; business_id: string } | null;
  message: string;
  scope: DigestScopeReport;
}

interface AssembleArgs {
  sb: any;
  base44: any;
  profileId: string;
  businessId: string;
  now?: Date;
}

/** Records the business_id of every row the digest actually used. */
function createScopeTracker(businessId: string) {
  const ids = new Set<string>();
  let nulls = 0;
  const violations: string[] = [];
  return {
    record(source: string, rows: any[] | null | undefined) {
      for (const r of rows || []) {
        const bid = r?.business_id;
        if (!bid) nulls += 1;
        else ids.add(bid);
        if (bid !== businessId) violations.push(`${source}:${bid || 'null'}`);
      }
    },
    report(): Omit<DigestScopeReport, 'documents_considered' | 'metrics_rows_considered' | 'sprints_considered' | 'sprint_tasks_considered' | 'upcoming_tasks_considered' | 'opportunities_considered'> {
      return {
        distinct_business_ids: [...ids],
        null_business_rows: nulls,
        violations,
        scope_verified: violations.length === 0,
      };
    },
  };
}

export function buildDigestMessage(digest: WeeklyDigestResult['digest'], upcomingTasks: any[]): string {
  const iqLine = digest.iq_score_available
    ? `📈 IQ Score Change: ${(digest.iq_score_change ?? 0) > 0 ? '+' : ''}${digest.iq_score_change ?? 0}`
    : `📈 IQ Score Change: ${IQ_NOT_YET_AVAILABLE}`;

  const lines = [
    `📊 Weekly Progress Report`,
    ``,
    `🎯 Sprint Progress: ${digest.sprint_progress}%`,
    `✓ Tasks Completed: ${digest.tasks_completed}`,
    `⚠️ Tasks Overdue: ${digest.tasks_overdue}`,
    ``,
    `💡 New Opportunities: ${digest.new_opportunities}`,
    `✓ Opportunities Completed: ${digest.completed_opportunities}`,
    ``,
    `📄 Documents Uploaded: ${digest.documents_uploaded}`,
    `📄 Documents Analyzed: ${digest.documents_analyzed}`,
    ``,
    iqLine,
  ];

  if (upcomingTasks && upcomingTasks.length > 0) {
    lines.push(``, `📅 Upcoming Deadlines:`);
    upcomingTasks.forEach((t: any) => {
      const dueDate = new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      lines.push(`  • ${t.title} (${dueDate})`);
    });
  }

  return lines.join('\n');
}

export async function assembleWeeklyDigest({ sb, base44, profileId, businessId, now = new Date() }: AssembleArgs): Promise<WeeklyDigestResult> {
  if (!businessId) throw new Error('assembleWeeklyDigest requires an authorized business_id');

  const tracker = createScopeTracker(businessId);

  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);

  // ── Active sprint: business-scoped, deterministic selection ────────────────
  const { data: sprints } = await sb
    .from('ninety_day_sprint_paths')
    .select('id, path_title, progress_percent, business_id')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(1);

  tracker.record('ninety_day_sprint_paths', sprints);

  const activeSprint = sprints?.[0];
  let sprintProgress = 0;
  let tasksCompleted = 0;
  let tasksOverdue = 0;
  let sprintTasks: any[] = [];

  if (activeSprint) {
    sprintProgress = activeSprint.progress_percent || 0;
    const { data: tasks } = await sb
      .from('ninety_day_sprint_tasks')
      .select('status, due_date, business_id')
      .eq('path_id', activeSprint.id)
      .eq('business_id', businessId)
      .neq('is_deleted', true);

    sprintTasks = tasks || [];
    tracker.record('ninety_day_sprint_tasks', sprintTasks);

    tasksCompleted = sprintTasks.filter((t: any) => t.status === 'completed').length;
    tasksOverdue = sprintTasks.filter((t: any) => t.status !== 'completed' && new Date(t.due_date) < now).length;
  }

  // ── Opportunities: already business-scoped, kept as-is ─────────────────────
  const opportunities = await base44.asServiceRole.entities.galileo_opportunities.filter(
    { profile_id: profileId, business_id: businessId },
    '-created_date',
    100
  );
  tracker.record('galileo_opportunities', opportunities);

  const newOpportunities = (opportunities || []).filter((o: any) => new Date(o.created_date) >= lastWeek).length;
  const completedOpportunities = (opportunities || []).filter((o: any) => o.status === 'completed').length;

  // ── Documents: business-scoped (NULL-business legacy rows excluded) ────────
  const { data: docs } = await sb
    .from('documents')
    .select('status, created_at, business_id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  tracker.record('documents', docs);

  const documentRows = docs || [];
  const documentsUploaded = documentRows.filter((d: any) => new Date(d.created_at) >= lastWeek).length;
  const documentsAnalyzed = documentRows.filter((d: any) => d.status === 'completed' && new Date(d.created_at) >= lastWeek).length;

  // ── IQ metrics: business-scoped; honest "unavailable" when absent ──────────
  const { data: metrics } = await sb
    .from('dashboard_metrics')
    .select('ciq_score, created_at, business_id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(2);

  tracker.record('dashboard_metrics', metrics);

  const metricRows = metrics || [];
  let iqScoreAvailable = false;
  let iqScoreChange: number | null = null;

  if (metricRows.length >= 2) {
    iqScoreAvailable = true;
    iqScoreChange = (metricRows[0].ciq_score || 0) - (metricRows[1].ciq_score || 0);
  } else if (metricRows.length === 1) {
    iqScoreAvailable = true;
    iqScoreChange = metricRows[0].ciq_score || 0;
  }

  // ── Upcoming deadlines for the ACTIVE business sprint only ─────────────────
  let upcomingTasks: any[] = [];
  if (activeSprint) {
    const { data: upcoming } = await sb
      .from('ninety_day_sprint_tasks')
      .select('title, due_date, business_id')
      .eq('path_id', activeSprint.id)
      .eq('business_id', businessId)
      .neq('status', 'completed')
      .neq('is_deleted', true)
      .gte('due_date', now.toISOString().split('T')[0])
      .lte('due_date', new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('due_date', { ascending: true })
      .limit(5);
    upcomingTasks = upcoming || [];
    tracker.record('ninety_day_sprint_tasks.upcoming', upcomingTasks);
  }

  const digest: WeeklyDigestResult['digest'] = {
    sprint_progress: sprintProgress,
    tasks_completed: tasksCompleted,
    tasks_overdue: tasksOverdue,
    new_opportunities: newOpportunities,
    completed_opportunities: completedOpportunities,
    documents_uploaded: documentsUploaded,
    documents_analyzed: documentsAnalyzed,
    iq_score_available: iqScoreAvailable,
    iq_score_change: iqScoreChange,
    iq_score_display: iqScoreAvailable ? String(iqScoreChange) : IQ_NOT_YET_AVAILABLE,
    upcoming_deadlines: upcomingTasks.length,
  };

  const scope: DigestScopeReport = {
    documents_considered: documentRows.length,
    metrics_rows_considered: metricRows.length,
    sprints_considered: (sprints || []).length,
    sprint_tasks_considered: sprintTasks.length,
    upcoming_tasks_considered: upcomingTasks.length,
    opportunities_considered: (opportunities || []).length,
    ...tracker.report(),
  };

  return {
    business_id: businessId,
    digest,
    active_sprint: activeSprint ? { id: activeSprint.id, business_id: activeSprint.business_id } : null,
    message: buildDigestMessage(digest, upcomingTasks),
    scope,
  };
}