import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { business_id: requestedBusinessId, force_regenerate } = body;

    const supabase = createClient(
      Deno.env.get('VITE_SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // ── Phase 6B.2 — identity is never taken from the request body ────────────
    // CROSS-TENANT HOLE (fixed here): `profile_id` arrived from the client and
    // then scoped EVERY read below — notifications, documents, assessments,
    // value_creation_events, business_snapshots, dashboard_metrics and
    // galileo_opportunities — as well as the WeeklyDigest create and delete. Any
    // authenticated user could therefore read another user's digest inputs and
    // create or delete their digest. The profile now comes from the authenticated
    // session, and the business is verified against the same ownership rule RLS
    // enforces.
    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (!ownProfile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const profile_id = ownProfile.id;
    // Phase 6.9B — canonical resolution. Was `requestedBusinessId || ownProfile.primary_business_id`.
    const { businessId: business_id, denial: bizDenial } = await requireBusinessContext(
      supabase, ownProfile, requestedBusinessId, 'generateWeeklyDigest'
    );
    if (bizDenial) return bizDenial;

    if (business_id) {
      try {
        await validateBusinessScope(supabase, business_id, profile_id);
      } catch (scopeErr) {
        console.error('[generateWeeklyDigest] business scope denied:', scopeErr.message);
        return Response.json({ error: scopeErr.message, reason: 'business_scope_denied' }, { status: 403 });
      }
    }

    // Date range — last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    const startIso = startDate.toISOString().split('T')[0];
    const endIso = endDate.toISOString().split('T')[0];

    // Check for existing digest in this window (avoid regenerating)
    if (!force_regenerate) {
      const existing = await base44.asServiceRole.entities.WeeklyDigest.filter({
        profile_id,
        digest_start_date: startIso,
      });
      if (existing && existing.length > 0) {
        return Response.json({ digest: existing[0], cached: true });
      }
    }

    // ── Gather data from existing systems ──────────────────────────────────

    // 1. Notifications (activity proxy)
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_profile_id', profile_id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    // 2. Dashboard metrics
    const { data: metricsRows } = await supabase
      .from('dashboard_metrics')
      .select('*')
      .eq('profile_id', profile_id)
      .order('updated_at', { ascending: false })
      .limit(2);
    const latestMetrics = metricsRows?.[0] || null;
    const prevMetrics = metricsRows?.[1] || null;

    // 3. Sprint tasks completed this week
    const { data: sprintTasks } = await supabase
      .from('sprint_tasks')
      .select('id, title, status, completed_at, sprint_id')
      .eq('business_id', business_id || '')
      .eq('status', 'completed')
      .gte('completed_at', startDate.toISOString())
      .limit(20);

    // 4. Documents uploaded this week
    const { data: documents } = await supabase
      .from('documents')
      .select('id, name, document_type, created_at, status')
      .eq('profile_id', profile_id)
      .gte('created_at', startDate.toISOString())
      .limit(20);

    // 5. Opportunities discovered this week
    const recentOpps = await base44.asServiceRole.entities.galileo_opportunities.filter({
      profile_id,
    }, '-created_date', 5);
    const newOpps = (recentOpps || []).filter(o => {
      const d = new Date(o.created_date || 0);
      return d >= startDate;
    });

    // 6. Value creation events
    const { data: vceRows } = await supabase
      .from('value_creation_events')
      .select('*')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false })
      .limit(10);
    const recentVce = (vceRows || []).filter(e => new Date(e.created_at) >= startDate);

    // 7. Assessments completed this week
    const { data: assessmentRows } = await supabase
      .from('assessments')
      .select('id, assessment_type, status, completed_at, score')
      .eq('profile_id', profile_id)
      .eq('status', 'completed')
      .gte('completed_at', startDate.toISOString())
      .limit(10);

    // 8. Business snapshots for freedom / IQ movement
    const { data: snapshots } = await supabase
      .from('business_snapshots')
      .select('*')
      .eq('profile_id', profile_id)
      .order('snapshot_date', { ascending: false })
      .limit(2);
    const latestSnap = snapshots?.[0] || null;
    const prevSnap = snapshots?.[1] || null;

    // ── Build digest sections ───────────────────────────────────────────────

    // WINS
    const wins = [];
    if ((sprintTasks || []).length > 0) {
      wins.push({ text: `Completed ${sprintTasks.length} sprint task${sprintTasks.length > 1 ? 's' : ''}`, category: 'sprint' });
    }
    if ((documents || []).length > 0) {
      wins.push({ text: `Uploaded ${documents.length} document${documents.length > 1 ? 's' : ''}`, category: 'documents' });
    }
    if ((assessmentRows || []).length > 0) {
      wins.push({ text: `Completed ${assessmentRows.length} assessment${assessmentRows.length > 1 ? 's' : ''}`, category: 'assessments' });
    }
    if (newOpps.length > 0) {
      wins.push({ text: `${newOpps.length} new opportunit${newOpps.length > 1 ? 'ies' : 'y'} identified by Galileo`, category: 'opportunities' });
    }
    const verifiedVce = recentVce.filter(e => e.status === 'verified');
    if (verifiedVce.length > 0) {
      wins.push({ text: `${verifiedVce.length} outcome${verifiedVce.length > 1 ? 's' : ''} verified this week`, category: 'outcomes' });
    }

    // PROGRESS
    const progress = [];
    const prevIq = prevMetrics?.ciq_score || prevMetrics?.overall_impact_score || prevSnap?.overall_impact_score || null;
    const currIq = latestMetrics?.ciq_score || latestMetrics?.overall_impact_score || latestSnap?.overall_impact_score || null;
    if (prevIq && currIq && Math.abs(currIq - prevIq) >= 1) {
      progress.push({
        label: 'V.I.S.I.O.N. IQ Score',
        from: String(Math.round(prevIq)),
        to: String(Math.round(currIq)),
        direction: currIq > prevIq ? 'up' : 'down',
      });
    }
    if ((assessmentRows || []).length > 0) {
      progress.push({
        label: 'Assessments Completed',
        from: '—',
        to: String(assessmentRows.length),
        direction: 'up',
      });
    }
    if ((documents || []).length > 0) {
      progress.push({
        label: 'Documents Added',
        from: '—',
        to: String(documents.length),
        direction: 'up',
      });
    }
    if ((sprintTasks || []).length > 0) {
      progress.push({
        label: 'Sprint Tasks Completed',
        from: '—',
        to: String(sprintTasks.length),
        direction: 'up',
      });
    }

    // VALUE CREATED
    const valueCreated = [];
    const totalVerifiedValue = verifiedVce.reduce((s, e) => s + (e.verified_value || e.estimated_impact || 0), 0);
    if (totalVerifiedValue > 0) {
      valueCreated.push({ label: 'Verified Value Created', amount: totalVerifiedValue, source: 'outcome_tracking' });
    }
    const totalEstimatedOppValue = newOpps.reduce((s, o) => s + (o.estimated_value_created || 0), 0);
    if (totalEstimatedOppValue > 0) {
      valueCreated.push({ label: 'New Opportunities Identified', amount: totalEstimatedOppValue, source: 'opportunities' });
    }

    // OPPORTUNITIES
    const topOpps = await base44.asServiceRole.entities.galileo_opportunities.filter(
      { profile_id, status: 'available' }, '-impact_score', 3
    );
    const opportunities_discovered = (topOpps || []).slice(0, 3).map(o => ({
      title: o.title,
      impact_estimate: o.estimated_value_created || 0,
      priority: o.impact_score >= 75 ? 'high' : o.impact_score >= 50 ? 'medium' : 'low',
    }));

    // OUTCOMES
    const outcomes_verified = (vceRows || []).slice(0, 5).map(e => ({
      title: e.title || e.event_type || 'Value Event',
      projected_impact: e.estimated_impact || 0,
      actual_impact: e.verified_value || 0,
      variance: (e.verified_value || 0) - (e.estimated_impact || 0),
      status: e.status || 'pending',
    }));

    // FREEDOM CHANGES
    const freedomChanges = {};
    if (latestMetrics?.freedom_gap?.freedom_date && prevMetrics?.freedom_gap?.freedom_date) {
      freedomChanges.freedom_date_before = prevMetrics.freedom_gap.freedom_date;
      freedomChanges.freedom_date_after = latestMetrics.freedom_gap.freedom_date;
    }
    if (latestMetrics?.freedom_gap?.score != null && prevMetrics?.freedom_gap?.score != null) {
      freedomChanges.freedom_score_before = prevMetrics.freedom_gap.score;
      freedomChanges.freedom_score_after = latestMetrics.freedom_gap.score;
    }

    // NEXT BEST ACTIONS — pull open sprint tasks, missing assessments, open opps
    const { data: openTasks } = await supabase
      .from('sprint_tasks')
      .select('id, title, priority, due_date')
      .eq('business_id', business_id || '')
      .eq('status', 'not_started')
      .order('priority', { ascending: false })
      .limit(5);

    const next_best_actions = [];
    if ((openTasks || []).length > 0) {
      next_best_actions.push({
        title: `Complete: ${openTasks[0].title}`,
        reason: 'Next open sprint task',
        priority: openTasks[0].priority || 'medium',
        source: 'sprint',
      });
    }
    if ((documents || []).length === 0) {
      next_best_actions.push({
        title: 'Upload financial documents',
        reason: 'Documents improve Galileo accuracy and IQ score',
        priority: 'high',
        source: 'documents',
      });
    }
    if (opportunities_discovered.length > 0) {
      next_best_actions.push({
        title: `Review opportunity: ${opportunities_discovered[0].title}`,
        reason: 'Highest-impact open opportunity',
        priority: opportunities_discovered[0].priority || 'high',
        source: 'opportunities',
      });
    }

    // HEADLINE
    const totalWinWeight = wins.length + (currIq > prevIq ? 2 : 0) + valueCreated.length;
    let headline = 'No Significant Changes This Week';
    if (totalWinWeight >= 5) headline = 'Strong Momentum This Week';
    else if (newOpps.length >= 3) headline = 'Three High-Impact Opportunities Identified';
    else if (freedomChanges.months_accelerated > 0) headline = 'Freedom Date Improved';
    else if ((sprintTasks || []).length >= 3) headline = 'Execution Progress Accelerated';
    else if (wins.length > 0) headline = 'Strategic Progress Building';

    // SUMMARY
    const parts = [];
    if (wins.length > 0) parts.push(`${wins.length} win${wins.length > 1 ? 's' : ''} recorded`);
    if (valueCreated.length > 0) {
      const total = valueCreated.reduce((s, v) => s + v.amount, 0);
      parts.push(`$${total >= 1_000_000 ? (total / 1_000_000).toFixed(1) + 'M' : Math.round(total / 1000) + 'K'} in value identified`);
    }
    if (opportunities_discovered.length > 0) parts.push(`${opportunities_discovered.length} opportunit${opportunities_discovered.length > 1 ? 'ies' : 'y'} surfaced`);
    const summary = parts.length > 0 ? parts.join(' · ') : 'Complete assessments and sprint tasks to generate progress updates.';

    const digestPayload = {
      profile_id,
      business_id: business_id || null,
      digest_start_date: startIso,
      digest_end_date: endIso,
      headline,
      summary,
      wins: wins.slice(0, 5),
      progress,
      value_created: valueCreated,
      opportunities_discovered,
      outcomes_verified,
      freedom_changes: Object.keys(freedomChanges).length > 0 ? freedomChanges : null,
      next_best_actions: next_best_actions.slice(0, 3),
      advisor_notes: '',
      digest_data: {
        notification_count: (notifications || []).length,
        sprint_tasks_completed: (sprintTasks || []).length,
        documents_uploaded: (documents || []).length,
        assessments_completed: (assessmentRows || []).length,
      },
      generated_at: new Date().toISOString(),
    };

    // Delete old digest for same week if force-regenerating
    if (force_regenerate) {
      const old = await base44.asServiceRole.entities.WeeklyDigest.filter({ profile_id, digest_start_date: startIso });
      for (const rec of (old || [])) {
        await base44.asServiceRole.entities.WeeklyDigest.delete(rec.id);
      }
    }

    const newDigest = await base44.asServiceRole.entities.WeeklyDigest.create(digestPayload);
    return Response.json({ digest: newDigest, cached: false });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});