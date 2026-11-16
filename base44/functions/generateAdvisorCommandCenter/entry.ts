/**
 * generateAdvisorCommandCenter
 * Aggregates existing platform data into per-client summaries for the Advisor Command Center.
 * Reads from: WeeklyDigest, DashboardMetrics, galileo_opportunities, NinetyDaySprint,
 *             SprintTask, Assessment, DocumentRequest, expert_advisor_access
 * No new calculations — only re-packages stored data.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = base44.asServiceRole;

    // ── AUTHORIZATION IS DERIVED FROM THE SESSION — NEVER FROM THE BODY ──────
    // Phase 6B.5/6 remediation. Previously `role` and `expert_profile_id` were
    // read from the request body, so ANY authenticated caller could post
    // { role: 'super_admin' } and receive every other client's summary, or name
    // an arbitrary `expert_profile_id` and read that advisor's client list.
    // The acting role and the expert identity now come only from the verified
    // Base44 -> Supabase identity bridge, exactly as `shared/authz/actor.ts` requires.
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('VITE_SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('id, app_role')
      .eq('base44_user_id', user.id)
      .maybeSingle();

    const sessionRole = callerProfile?.app_role || user.role || null;
    const expertProfileId = callerProfile?.id || null;

    // ── 1. Determine which client emails/profiles to include ─────────────────
    let clientEmails = [];
    let accessMap = {}; // email -> access_record
    let assessmentsByBusinessId = {}; // business_id -> assessment rows

    const isAdminLevel = sessionRole === 'super_admin' || sessionRole === 'admin';

    if (isAdminLevel) {
      // All registered users (non-admin roles)
      const users = await sb.entities.User.list('-created_date', 200);
      const nonAdmins = users.filter(u => !['super_admin', 'admin'].includes(u.role));
      clientEmails = nonAdmins.map(u => u.email).filter(Boolean);
      nonAdmins.forEach(u => { accessMap[u.email] = { client_name: u.full_name, client_email: u.email, permissions: {} }; });
    } else {
      // expert_advisor: only the clients the SESSION's own profile is assigned.
      // `expertProfileId` is the authenticated caller's own profile — a body value
      // can no longer name a different advisor.
      if (!expertProfileId) return Response.json({ summaries: [], meta: { total: 0 } });

      const { data: accessRows } = await supabase
        .from('expert_advisor_access')
        .select('client_email, client_name, client_profile_id, business_id, permissions')
        .eq('expert_profile_id', expertProfileId)
        .eq('access_status', 'active');

      if (!accessRows || accessRows.length === 0) return Response.json({ summaries: [], meta: { total: 0 } });

      clientEmails = accessRows.map(r => r.client_email).filter(Boolean);
      accessRows.forEach(r => { accessMap[r.client_email] = r; });
    }

    if (clientEmails.length === 0) return Response.json({ summaries: [], meta: { total: 0 } });

    // ── 2. Bulk-fetch all needed data ────────────────────────────────────────

    // Weekly Digests (most recent per profile)
    const weeklyDigests = await sb.entities.WeeklyDigest.list('-created_date', 500);

    // Dashboard Metrics
    const allMetrics = await sb.entities.DashboardMetrics.list('-created_date', 500);

    // Opportunities
    const allOpps = await sb.entities.galileo_opportunities.filter({ status: 'available' }, '-impact_score', 500);

    // Sprint data
    const allSprints = await sb.entities.NinetyDaySprint.list('-created_date', 200);
    const allSprintTasks = await sb.entities.SprintTask.filter({ is_deleted: false }, '-created_date', 1000);

    // Document requests
    const allDocRequests = await sb.entities.DocumentRequest.filter({ status: 'pending' }, '-created_date', 500);

    // Supabase: profiles + businesses for email->profile mapping
    // (the client is created once, above, for the session-derived authorization)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, company')
      .in('email', clientEmails);

    const profileByEmail = {};
    const profileIdToEmail = {};
    (profiles || []).forEach(p => {
      profileByEmail[p.email] = p;
      profileIdToEmail[p.id] = p.email;
    });

    // Get businesses for profiles
    const profileIds = (profiles || []).map(p => p.id);
    let businessByProfileId = {};
    if (profileIds.length > 0) {
      const { data: memberships } = await supabase
        .from('business_members')
        .select('profile_id, business_id')
        .in('profile_id', profileIds);

      if (memberships && memberships.length > 0) {
        const bizIds = [...new Set(memberships.map(m => m.business_id))];
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id, name, industry, revenue')
          .in('id', bizIds);

        const bizById = {};
        (businesses || []).forEach(b => { bizById[b.id] = b; });
        memberships.forEach(m => {
          if (!businessByProfileId[m.profile_id]) {
            businessByProfileId[m.profile_id] = bizById[m.business_id] || null;
          }
        });

        // ── Assessments from Supabase (Phase C.1: Base44 Assessment retired) ──
        // business_assessments is business-scoped; fetch all for the relevant businesses.
        const { data: supabaseAssessments } = await supabase
          .from('business_assessments')
          .select('business_id, assessment_type, score')
          .in('business_id', bizIds);
        assessmentsByBusinessId = {};
        (supabaseAssessments || []).forEach(a => {
          if (!assessmentsByBusinessId[a.business_id]) assessmentsByBusinessId[a.business_id] = [];
          assessmentsByBusinessId[a.business_id].push(a);
        });
      }
    }

    // ── 3. Build per-client summary ──────────────────────────────────────────
    const summaries = [];

    for (const email of clientEmails) {
      const profile = profileByEmail[email];
      const profileId = profile?.id;
      const business = profileId ? businessByProfileId[profileId] : null;
      const accessRec = accessMap[email] || {};

      // Latest weekly digest
      const digest = weeklyDigests.find(d => d.profile_id === profileId);

      // Dashboard metrics (most recent for this profile)
      const metrics = allMetrics.find(m => m.created_by_id === profile?.base44_id) || null;

      // Opportunities for this profile
      const clientOpps = allOpps.filter(o => o.profile_id === profileId);
      const topOpp = clientOpps[0] || null;
      const totalOppValue = clientOpps.reduce((s, o) => s + (o.estimated_value_created || 0), 0);

      // Active sprint
      const clientSprints = allSprints.filter(s => s.business_id === business?.id);
      const activeSprint = clientSprints.find(s => s.status === 'active') || clientSprints[0] || null;

      // Check if sprint needs expert review
      const sprintNeedsReview = activeSprint?.needs_expert_review === true;

      // Sprint tasks for active sprint
      const sprintTasks = activeSprint
        ? allSprintTasks.filter(t => t.sprint_id === activeSprint.id)
        : [];
      const completedTasks = sprintTasks.filter(t => t.status === 'completed').length;
      const totalTasks = sprintTasks.length;
      const sprintProgress = activeSprint?.progress_percent ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);

      // Open sprint tasks (not completed)
      const openTasks = sprintTasks.filter(t => t.status !== 'completed' && t.status !== 'blocked');
      const topSprintAction = openTasks[0]?.title || null;

      // Missing document count
      const missingDocs = allDocRequests.filter(d =>
        d.requested_for_profile_id === profileId || d.requested_for_email === email
      ).length;

      // Assessments (Supabase — completion inferred from score presence)
      const clientAssessments = business?.id ? (assessmentsByBusinessId[business.id] || []) : [];
      const ASSESSMENT_TYPES = ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'freedom_assessment'];
      const completedTypes = new Set(clientAssessments.filter(a => a.score != null).map(a => a.assessment_type));
      const incompleteAssessments = ASSESSMENT_TYPES.filter(t => !completedTypes.has(t)).length;

      // IQ Score from digest or metrics
      const iqScore = digest?.freedom_changes?.freedom_score_after
        || metrics?.ciq_score
        || metrics?.overall_impact_score
        || null;

      // Freedom status from digest
      const freedomDate = digest?.freedom_changes?.freedom_date_after || null;

      // Last activity: most recent digest or notification timestamp
      const lastActivity = digest?.generated_at || digest?.created_date || null;

      // Verified outcomes count from digest
      const verifiedOutcomes = (digest?.outcomes_verified || []).filter(o => o.status === 'verified').length;

      // ── Status Engine ──────────────────────────────────────────────────────
      const flags = [];
      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
        : 999;

      // Missing Data
      if (missingDocs > 0 || incompleteAssessments >= 4) flags.push('missing_data');

      // Stalled
      if (daysSinceActivity > 30 && sprintProgress < 10) flags.push('stalled');

      // High Opportunity
      if (totalOppValue > 50000 || clientOpps.length >= 3) flags.push('high_opportunity');

      // Needs Attention
      if (
        (daysSinceActivity > 14 && sprintProgress < 30) ||
        (missingDocs > 0 && incompleteAssessments > 0) ||
        (clientOpps.length > 0 && sprintProgress < 20) ||
        sprintNeedsReview
      ) flags.push('needs_attention');

      // On Track (no bad flags, progressing)
      if (!flags.includes('stalled') && !flags.includes('needs_attention') && sprintProgress >= 30) {
        flags.push('on_track');
      }

      // Primary status (priority order)
      const primaryStatus = flags.includes('stalled') ? 'stalled'
        : flags.includes('missing_data') ? 'missing_data'
        : flags.includes('needs_attention') ? 'needs_attention'
        : flags.includes('high_opportunity') ? 'high_opportunity'
        : flags.includes('on_track') ? 'on_track'
        : 'no_data';

      // ── Top Priority Action ────────────────────────────────────────────────
      let topAction = null;
      if (sprintNeedsReview) topAction = 'Expert verification needed for 90-Day Sprint';
      else if (missingDocs > 0) topAction = `Upload ${missingDocs} requested document${missingDocs > 1 ? 's' : ''}`;
      else if (incompleteAssessments > 0) topAction = `Complete ${incompleteAssessments} pending assessment${incompleteAssessments > 1 ? 's' : ''}`;
      else if (topSprintAction) topAction = topSprintAction;
      else if (topOpp) topAction = `Review: ${topOpp.title}`;
      else if (digest?.next_best_actions?.[0]) topAction = digest.next_best_actions[0].title;

      // ── Attention Score (higher = needs more attention) ───────────────────
      let attentionScore = 0;
      if (flags.includes('stalled')) attentionScore += 40;
      if (flags.includes('missing_data')) attentionScore += 30;
      if (flags.includes('needs_attention')) attentionScore += 20;
      if (totalOppValue > 100000) attentionScore += 15;
      if (daysSinceActivity > 7) attentionScore += Math.min(daysSinceActivity, 15);

      summaries.push({
        email,
        profile_id: profileId || null,
        business_id: business?.id || null,
        client_name: profile?.full_name || accessRec.client_name || email,
        business_name: business?.name || profile?.company || '—',
        industry: business?.industry || '—',
        iq_score: iqScore,
        freedom_date: freedomDate,
        digest_headline: digest?.headline || null,
        sprint_progress: sprintProgress,
        sprint_status: activeSprint?.status || null,
        last_activity: lastActivity,
        days_since_activity: daysSinceActivity,
        top_opportunity: topOpp ? { title: topOpp.title, value: topOpp.estimated_value_created || 0 } : null,
        open_opportunity_count: clientOpps.length,
        total_opportunity_value: totalOppValue,
        verified_outcome_count: verifiedOutcomes,
        missing_doc_count: missingDocs,
        incomplete_assessment_count: incompleteAssessments,
        assigned_advisors: [], // populated from access records if needed
        flags,
        primary_status: primaryStatus,
        attention_score: attentionScore,
        top_action: topAction,
        recent_wins: (digest?.wins || []).slice(0, 2),
        digest_id: digest?.id || null,
      });
    }

    // Sort by attention score descending
    summaries.sort((a, b) => b.attention_score - a.attention_score);

    // ── Meta stats ────────────────────────────────────────────────────────────
    const meta = {
      total: summaries.length,
      needs_attention: summaries.filter(s => s.flags.includes('needs_attention') || s.flags.includes('stalled')).length,
      high_opportunity: summaries.filter(s => s.flags.includes('high_opportunity')).length,
      on_track: summaries.filter(s => s.flags.includes('on_track')).length,
      missing_data: summaries.filter(s => s.flags.includes('missing_data')).length,
      verified_outcomes_this_week: summaries.reduce((sum, s) => sum + (s.verified_outcome_count || 0), 0),
      total_opportunity_value: summaries.reduce((sum, s) => sum + (s.total_opportunity_value || 0), 0),
    };

    return Response.json({ summaries, meta });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});