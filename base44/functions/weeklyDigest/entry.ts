/**
 * weeklyDigest — Generates and sends weekly summary notifications every Monday
 * 
 * Includes:
 * - Sprint progress %
 * - Tasks completed
 * - Tasks overdue
 * - New opportunities generated
 * - Opportunities completed
 * - Documents uploaded
 * - Documents analyzed
 * - IQ score changes
 * - Upcoming deadlines
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

function getSupabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    const profileId = profile?.id;

    if (!profileId) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Phase 6.9B — the digest aggregates business-owned data, so the business is
    // resolved canonically rather than taken from the profile's primary.
    const { businessId, denial: businessDenial } = await requireBusinessContext(
      sb, profile, data?.active_business_id || data?.business_id, 'weeklyDigest.generateWeeklyDigest'
    );
    if (businessDenial) return businessDenial;

    // ── GENERATE WEEKLY DIGEST ───────────────────────────────────────────────
    if (action === 'generateWeeklyDigest') {
      const now = new Date();
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);

      // Fetch sprint data
      const { data: sprints } = await sb.from('ninety_day_sprint_paths')
        .select('id, path_title, progress_percent')
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .limit(1);

      const activeSprint = sprints?.[0];
      let sprintProgress = 0;
      let tasksCompleted = 0;
      let tasksOverdue = 0;

      if (activeSprint) {
        sprintProgress = activeSprint.progress_percent || 0;
        const { data: tasks } = await sb.from('ninety_day_sprint_tasks')
          .select('status, due_date')
          .eq('path_id', activeSprint.id)
          .neq('is_deleted', true);
        
        tasksCompleted = (tasks || []).filter(t => t.status === 'completed').length;
        tasksOverdue = (tasks || []).filter(t => t.status !== 'completed' && new Date(t.due_date) < now).length;
      }

      // Fetch opportunities
      const opportunities = await base44.asServiceRole.entities.galileo_opportunities.filter(
        { profile_id: profileId, business_id: businessId },
        '-created_date',
        100
      );
      const newOpportunities = (opportunities || []).filter(o => new Date(o.created_date) >= lastWeek).length;
      const completedOpportunities = (opportunities || []).filter(o => o.status === 'completed').length;

      // Fetch documents
      const { data: docs } = await sb.from('documents')
        .select('status, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });
      
      const documentsUploaded = (docs || []).filter(d => new Date(d.created_at) >= lastWeek).length;
      const documentsAnalyzed = (docs || []).filter(d => d.status === 'completed' && new Date(d.created_at) >= lastWeek).length;

      // Fetch IQ score changes
      const { data: metrics } = await sb.from('dashboard_metrics')
        .select('ciq_score, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(2);
      
      let iqScoreChange = 0;
      if (metrics && metrics.length >= 2) {
        const current = metrics[0].ciq_score || 0;
        const previous = metrics[1].ciq_score || 0;
        iqScoreChange = current - previous;
      } else if (metrics && metrics.length === 1) {
        iqScoreChange = metrics[0].ciq_score || 0;
      }

      // Fetch upcoming deadlines
      const { data: upcomingTasks } = await sb.from('ninety_day_sprint_tasks')
        .select('title, due_date')
        .eq('path_id', activeSprint?.id || '')
        .neq('status', 'completed')
        .neq('is_deleted', true)
        .gte('due_date', now.toISOString().split('T')[0])
        .lte('due_date', new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('due_date', { ascending: true })
        .limit(5);

      // Build digest message
      const digestLines = [
        `📊 Weekly Progress Report`,
        ``,
        `🎯 Sprint Progress: ${sprintProgress}%`,
        `✓ Tasks Completed: ${tasksCompleted}`,
        `⚠️ Tasks Overdue: ${tasksOverdue}`,
        ``,
        `💡 New Opportunities: ${newOpportunities}`,
        `✓ Opportunities Completed: ${completedOpportunities}`,
        ``,
        `📄 Documents Uploaded: ${documentsUploaded}`,
        `📄 Documents Analyzed: ${documentsAnalyzed}`,
        ``,
        `📈 IQ Score Change: ${iqScoreChange > 0 ? '+' : ''}${iqScoreChange}`,
      ];

      if (upcomingTasks && upcomingTasks.length > 0) {
        digestLines.push(``, `📅 Upcoming Deadlines:`);
        upcomingTasks.forEach(t => {
          const dueDate = new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          digestLines.push(`  • ${t.title} (${dueDate})`);
        });
      }

      const message = digestLines.join('\n');

      // Create notification
      await base44.functions.invoke('notificationService', {
        action: 'createNotification',
        data: {
          recipient_id: user.id,
          recipient_profile_id: profileId,
          business_id: businessId,
          notification_type: 'weekly_digest',
          title: '📊 Your Weekly V.I.S.I.O.N. Digest',
          message,
          action_url: '/dashboard',
          priority: 'low',
          metadata: {
            sprint_progress_percent: sprintProgress,
            tasks_completed: tasksCompleted,
            tasks_overdue: tasksOverdue,
            new_opportunities: newOpportunities,
            completed_opportunities: completedOpportunities,
            documents_uploaded: documentsUploaded,
            documents_analyzed: documentsAnalyzed,
            iq_score_change: iqScoreChange,
          },
        },
      });

      return Response.json({
        success: true,
        digest: {
          sprint_progress: sprintProgress,
          tasks_completed: tasksCompleted,
          tasks_overdue: tasksOverdue,
          new_opportunities: newOpportunities,
          completed_opportunities: completedOpportunities,
          documents_uploaded: documentsUploaded,
          documents_analyzed: documentsAnalyzed,
          iq_score_change: iqScoreChange,
          upcoming_deadlines: upcomingTasks?.length || 0,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[weeklyDigest] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});