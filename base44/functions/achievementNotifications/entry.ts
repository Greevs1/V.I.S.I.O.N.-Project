/**
 * achievementNotifications — Tracks and fires one-time achievement notifications
 * 
 * Prevents duplicate achievements by storing milestone state in Supabase.
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

async function getProfile(sb, email) {
  const { data } = await sb.from('profiles').select('id, primary_business_id').eq('email', email).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const profile = await getProfile(sb, user.email);
    const profileId = profile?.id;
    // Phase 6.9B — every action here writes a business-owned achievement /
    // notification, so the business must never be inferred from the actor.
    const { businessId, denial: businessDenial } = await requireBusinessContext(
      sb, profile, data?.active_business_id || data?.business_id, 'achievementNotifications'
    );
    if (businessDenial) return businessDenial;

    // ── TRACK SPRINT PROGRESS MILESTONE ──────────────────────────────────────
    if (action === 'trackSprintProgress') {
      const { sprint_id, progress_percent } = data;
      if (!sprint_id || !progress_percent) {
        return Response.json({ error: 'sprint_id and progress_percent required' }, { status: 400 });
      }

      // Only fire at 25, 50, 75, 100
      const milestones = [25, 50, 75, 100];
      if (!milestones.includes(progress_percent)) {
        return Response.json({ success: true, milestone: false });
      }

      // Check if already fired for this sprint
      const milestoneKey = `sprint_${sprint_id}_${progress_percent}`;
      const { data: existing } = await sb.from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_key', milestoneKey)
        .maybeSingle();

      if (existing) {
        return Response.json({ success: true, milestone: false, already_fired: true });
      }

      // Fire achievement notification
      await base44.asServiceRole.entities.Notification.create({
        recipient_id: user.id,
        recipient_profile_id: profileId,
        business_id: businessId,
        notification_type: 'achievement_sprint_milestone',
        title: `🎯 Sprint ${progress_percent}% Complete!`,
        message: `You've reached ${progress_percent}% completion on your 90-day sprint. Keep going!`,
        action_url: '/advisory/command-center',
        priority: progress_percent === 100 ? 'high' : 'medium',
        metadata: { sprint_progress_percent: progress_percent, sprint_id: sprint_id, milestone_type: 'sprint_progress' },
      });

      // Record achievement
      await sb.from('user_achievements').insert({
        user_id: user.id,
        profile_id: profileId,
        business_id: businessId,
        achievement_key: milestoneKey,
        achievement_type: 'sprint_progress',
        metadata: { sprint_id, progress_percent },
        created_at: new Date().toISOString(),
      }).catch(() => { /* table may not exist yet */ });

      return Response.json({ success: true, milestone: true, progress_percent });
    }

    // ── TRACK ASSESSMENT COMPLETED ───────────────────────────────────────────
    if (action === 'trackAssessmentComplete') {
      const { assessment_type } = data;
      if (!assessment_type) {
        return Response.json({ error: 'assessment_type required' }, { status: 400 });
      }

      const achievementKey = `assessment_${assessment_type}`;
      const { data: existing } = await sb.from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_key', achievementKey)
        .maybeSingle();

      if (existing) {
        return Response.json({ success: true, milestone: false, already_fired: true });
      }

      await base44.asServiceRole.entities.Notification.create({
        recipient_id: user.id,
        recipient_profile_id: profileId,
        business_id: businessId,
        notification_type: 'achievement_assessment_complete',
        title: `✓ ${assessment_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Complete!`,
        message: 'You\'ve completed the assessment. Check your strategic insights for personalized recommendations.',
        action_url: `/assessments/${assessment_type}`,
        priority: 'medium',
        metadata: { assessment_type, milestone_type: 'assessment_complete' },
      });

      await sb.from('user_achievements').insert({
        user_id: user.id,
        profile_id: profileId,
        business_id: businessId,
        achievement_key: achievementKey,
        achievement_type: 'assessment_complete',
        metadata: { assessment_type },
        created_at: new Date().toISOString(),
      }).catch(() => { /* table may not exist yet */ });

      return Response.json({ success: true, milestone: true });
    }

    // ── TRACK OPPORTUNITY MILESTONE ──────────────────────────────────────────
    if (action === 'trackOpportunityMilestone') {
      const { milestone_type, opportunity_id } = data;
      if (!milestone_type || !['first_activated', 'first_completed', 'promoted_to_sprint'].includes(milestone_type)) {
        return Response.json({ error: 'Invalid milestone_type' }, { status: 400 });
      }

      const achievementKey = `opportunity_${milestone_type}`;
      const { data: existing } = await sb.from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_key', achievementKey)
        .maybeSingle();

      if (existing) {
        return Response.json({ success: true, milestone: false, already_fired: true });
      }

      let title, message, url;
      if (milestone_type === 'first_activated') {
        title = '🚀 First Opportunity Activated!';
        message = 'You\'ve activated your first strategic opportunity. Time to execute!';
        url = '/advisory/command-center';
      } else if (milestone_type === 'first_completed') {
        title = '✓ Opportunity Completed!';
        message = 'Congratulations on completing your first opportunity. On to the next!';
        url = '/advisory/command-center';
      } else if (milestone_type === 'promoted_to_sprint') {
        title = '🎯 Opportunity Promoted to Sprint!';
        message = 'Your opportunity has been converted into a 90-day sprint path.';
        url = '/advisory/command-center';
      }

      await base44.functions.invoke('notificationService', {
        action: 'createNotification',
        data: {
          recipient_id: user.id,
          recipient_profile_id: profileId,
          business_id: businessId,
          notification_type: 'achievement_opportunity_milestone',
          title,
          message,
          action_url: url,
          priority: 'high',
          metadata: { opportunity_id, milestone_type },
        },
      });

      await sb.from('user_achievements').insert({
        user_id: user.id,
        profile_id: profileId,
        business_id: businessId,
        achievement_key: achievementKey,
        achievement_type: 'opportunity_milestone',
        metadata: { opportunity_id, milestone_type },
        created_at: new Date().toISOString(),
      }).catch(() => { /* table may not exist yet */ });

      return Response.json({ success: true, milestone: true });
    }

    // ── TRACK SPRINT CREATED ─────────────────────────────────────────────────
    if (action === 'trackSprintCreated') {
      const { sprint_id } = data;
      const achievementKey = 'first_sprint_created';
      
      const { data: existing } = await sb.from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_key', achievementKey)
        .maybeSingle();

      if (existing) {
        return Response.json({ success: true, milestone: false, already_fired: true });
      }

      await base44.functions.invoke('notificationService', {
        action: 'createNotification',
        data: {
          recipient_id: user.id,
          recipient_profile_id: profileId,
          business_id: businessId,
          notification_type: 'achievement_sprint_created',
          title: '🎯 Your First 90-Day Sprint!',
          message: 'You\'ve created your first sprint. Let\'s make these 90 days count!',
          action_url: '/advisory/command-center',
          priority: 'high',
          metadata: { sprint_id, milestone_type: 'sprint_created' },
        },
      });

      await sb.from('user_achievements').insert({
        user_id: user.id,
        profile_id: profileId,
        business_id: businessId,
        achievement_key: achievementKey,
        achievement_type: 'sprint_created',
        metadata: { sprint_id },
        created_at: new Date().toISOString(),
      }).catch(() => { /* table may not exist yet */ });

      return Response.json({ success: true, milestone: true });
    }

    // ── TRACK DOCUMENT MILESTONE ─────────────────────────────────────────────
    if (action === 'trackDocumentMilestone') {
      const { milestone_type, document_id } = data;
      if (!milestone_type || !['analysis_complete', 'extraction_complete'].includes(milestone_type)) {
        return Response.json({ error: 'Invalid milestone_type' }, { status: 400 });
      }

      const achievementKey = `document_${milestone_type}`;
      const { data: existing } = await sb.from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_key', achievementKey)
        .maybeSingle();

      if (existing) {
        return Response.json({ success: true, milestone: false, already_fired: true });
      }

      let title, message;
      if (milestone_type === 'analysis_complete') {
        title = '📄 Document Analysis Complete!';
        message = 'Your document has been analyzed. Check the extracted data in your dashboard.';
      } else if (milestone_type === 'extraction_complete') {
        title = '✓ Data Extraction Complete!';
        message = 'Financial data has been extracted and is ready for review.';
      }

      await base44.functions.invoke('notificationService', {
        action: 'createNotification',
        data: {
          recipient_id: user.id,
          recipient_profile_id: profileId,
          business_id: businessId,
          notification_type: 'achievement_document_milestone',
          title,
          message,
          action_url: '/data-room',
          priority: 'medium',
          metadata: { document_id, milestone_type },
        },
      });

      await sb.from('user_achievements').insert({
        user_id: user.id,
        profile_id: profileId,
        business_id: businessId,
        achievement_key: achievementKey,
        achievement_type: 'document_milestone',
        metadata: { document_id, milestone_type },
        created_at: new Date().toISOString(),
      }).catch(() => { /* table may not exist yet */ });

      return Response.json({ success: true, milestone: true });
    }

    // ── TRACK IQ MILESTONE ───────────────────────────────────────────────────
    if (action === 'trackIQMilestone') {
      const { iq_score, previous_score } = data;
      if (!iq_score) {
        return Response.json({ error: 'iq_score required' }, { status: 400 });
      }

      const increase = previous_score ? iq_score - previous_score : 0;
      if (increase <= 0) {
        return Response.json({ success: true, milestone: false });
      }

      // Check if this is a significant milestone (10+ points)
      const achievementKey = `iq_milestone_${Math.floor(iq_score / 10) * 10}`;
      const { data: existing } = await sb.from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_key', achievementKey)
        .maybeSingle();

      if (existing) {
        return Response.json({ success: true, milestone: false, already_fired: true });
      }

      await base44.functions.invoke('notificationService', {
        action: 'createNotification',
        data: {
          recipient_id: user.id,
          recipient_profile_id: profileId,
          business_id: businessId,
          notification_type: 'achievement_iq_milestone',
          title: `📈 V.I.S.I.O.N. IQ™ Increased!`,
          message: `Your IQ score increased by ${increase} points to ${iq_score}. Major improvement detected!`,
          action_url: '/dashboard',
          priority: 'high',
          metadata: { iq_score, previous_score, iq_score_change: increase, milestone_type: 'iq_increase' },
        },
      });

      await sb.from('user_achievements').insert({
        user_id: user.id,
        profile_id: profileId,
        business_id: businessId,
        achievement_key: achievementKey,
        achievement_type: 'iq_milestone',
        metadata: { iq_score, previous_score, increase },
        created_at: new Date().toISOString(),
      }).catch(() => { /* table may not exist yet */ });

      return Response.json({ success: true, milestone: true });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[achievementNotifications] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});