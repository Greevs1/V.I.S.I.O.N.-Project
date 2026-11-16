/**
 * supabaseProfileData — profile, business, onboarding, assessments, advisor notes.
 *
 * Actions:
 *   getProfile, getFullProfile, completeOnboarding,
 *   getBusinessAssessments, getBusinessAssessment,
 *   getGapAnalyses, getAdvisorNotes, createAdvisorNote,
 *   getProfileFinancials, upsertProfileFinancials
 *
 * Can be called directly (user token) or via supabaseUserData router (service role).
 * Phase 6B.4 — authentication is MANDATORY and unconditional. `_router_user_email`
 * and `target_profile_id` are TARGET identifiers only, honoured solely after the
 * authenticated actor is proven authorized for them. Identity never comes from
 * the request body.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data, _router_user_email, target_profile_id } = body;

    // ── Phase 6B.4 — AUTHENTICATION BOUNDARY ─────────────────────────────────
    // Authentication is mandatory and unconditional. The caller's identity is
    // NEVER taken from the request body. `_router_user_email` and
    // `target_profile_id` are TARGET identifiers only: they are honoured solely
    // after the authenticated actor is proven authorized for that target.
    const actor = await authenticateActor(base44, sb);
    const acting = await resolveActingProfile(sb, actor, {
      targetProfileId: target_profile_id || data?.target_profile_id || null,
      targetEmail: _router_user_email,
    });

    const getProfile = async () => acting.profile;

    if (action === 'getProfile') {
      const profile = await getProfile();
      return Response.json({ profile });
    }

    if (action === 'getFullProfile') {
      const profile = await getProfile();
      if (!profile) return Response.json({ profile: null, business: null });
      let business = null;
      if (profile.primary_business_id) {
        const { data: biz } = await sb.from('businesses').select('*').eq('id', profile.primary_business_id).maybeSingle();
        business = biz || null;
      } else {
        const { data: biz } = await sb.from('businesses').select('*').eq('profile_id', profile.id).limit(1);
        business = biz?.[0] || null;
      }
      return Response.json({ profile, business });
    }

    if (action === 'completeOnboarding') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { business_name, industry, annual_revenue_range, primary_goal } = data || {};
      const { error: pErr } = await sb.from('profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
      if (pErr) throw new Error(pErr.message);
      if (business_name || industry) {
        let bizId = profile.primary_business_id;
        if (!bizId) {
          const { data: bizRows } = await sb.from('businesses').select('id').eq('profile_id', profile.id).limit(1);
          bizId = bizRows?.[0]?.id;
        }
        if (bizId) {
          await sb.from('businesses').update({
            ...(business_name ? { name: business_name } : {}),
            ...(industry ? { industry } : {}),
            ...(annual_revenue_range ? { annual_revenue_range } : {}),
            updated_at: new Date().toISOString(),
          }).eq('id', bizId);
        }
      }
      if (primary_goal) {
        const { data: existingFin } = await sb.from('profile_financials').select('id').eq('profile_id', profile.id).maybeSingle();
        const finData = { profile_id: profile.id, primary_goal, updated_at: new Date().toISOString() };
        if (existingFin) {
          await sb.from('profile_financials').update(finData).eq('id', existingFin.id);
        } else {
          await sb.from('profile_financials').insert({ ...finData, created_at: new Date().toISOString() });
        }
      }
      return Response.json({ success: true });
    }

    if (action === 'getBusinessAssessments') {
      const profile = await getProfile();
      if (!profile) return Response.json({ assessments: [] });
      const { data: assessments, error } = await sb
        .from('business_assessments')
        .select('*')
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ assessments: assessments || [] });
    }

    if (action === 'getBusinessAssessment') {
      const profile = await getProfile();
      if (!profile) return Response.json({ assessment: null });
      const assessmentType = body.assessmentType || data?.assessmentType;
      if (!assessmentType) return Response.json({ error: 'assessmentType required' }, { status: 400 });
      const { data: assessment, error } = await sb
        .from('business_assessments')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('assessment_type', assessmentType)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ assessment });
    }

    if (action === 'getGapAnalyses') {
      const profile = await getProfile();
      if (!profile) return Response.json({ gaps: [] });
      const { data: gaps, error } = await sb
        .from('gap_analyses')
        .select('*')
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ gaps: gaps || [] });
    }

    if (action === 'getAdvisorNotes') {
      const profile = await getProfile();
      if (!profile) return Response.json({ notes: [] });
      const { data: notes, error } = await sb
        .from('advisor_notes')
        .select('*')
        .eq('profile_id', profile.id)
        .neq('visibility', 'advisor_only')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ notes: notes || [] });
    }

    if (action === 'updateProfileRole') {
      const { newRole, target_profile_id: bodyTargetId, target_user_email } = data || {};
      if (!newRole) return Response.json({ error: 'newRole required' }, { status: 400 });
      const VALID_ROLES = ['super_admin', 'admin', 'owner', 'team_member', 'expert_advisor', 'user'];
      if (!VALID_ROLES.includes(newRole)) {
        return Response.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
      }

      // ── Phase 6B.4 — THE ACTOR IS DERIVED FROM AUTHENTICATION ONLY ────────
      // The previous implementation read `editorEmail` from the request body and
      // looked the editor's role up FROM IT, so an unauthenticated caller could
      // name a real super-admin's address, satisfy the check, and grant itself
      // super_admin. `editorEmail` is no longer read at all — the permission
      // basis is now the authenticated session, full stop.
      const actorRole = actor.isSuperAdmin ? 'super_admin' : (actor.isAdmin ? 'admin' : null);
      if (!actorRole) {
        return Response.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
      }
      if (actorRole !== 'super_admin' && newRole === 'super_admin') {
        return Response.json({ error: 'Only super admins can assign super_admin role' }, { status: 403 });
      }

      // The target is an authorized RESOURCE, resolved and checked server-side.
      const target = await resolveActingProfile(sb, actor, {
        targetProfileId: bodyTargetId || target_profile_id || null,
        targetEmail: target_user_email,
      });
      const targetProfile = target.profile;

      const oldRole = targetProfile.app_role || 'user';
      const { error: updateErr } = await sb.from('profiles')
        .update({ app_role: newRole, updated_at: new Date().toISOString() })
        .eq('id', targetProfile.id);
      if (updateErr) throw new Error(updateErr.message);

      // Sync Base44 User role — keyed on the SERVER-RESOLVED target email only.
      if (targetProfile.email) {
        try {
          const b44Users = await base44.asServiceRole.entities.User.filter({ email: targetProfile.email }, '', 1);
          if (b44Users && b44Users.length > 0) {
            const roleMap = {
              super_admin: 'super_admin', admin: 'admin', owner: 'user',
              team_member: 'team_member', expert_advisor: 'user', user: 'user'
            };
            await base44.asServiceRole.entities.User.update(b44Users[0].id, { role: roleMap[newRole] || 'user' });
          }
        } catch (b44Err) {
          console.error('[updateProfileRole] Base44 role sync failed (non-fatal):', b44Err?.message);
        }
      }

      return Response.json({ success: true, newRole, oldRole, profileId: targetProfile.id });
    }

    // ── PROFILE FINANCIALS (Phase 2C-A) ──────────────────────────────────────
    // Profile-scoped only. Never filtered by business_id. Never written to dashboard_metrics.

    if (action === 'getProfileFinancials') {
      const profile = await getProfile();
      if (!profile) return Response.json({ financials: null });
      const { data: financials, error } = await sb
        .from('profile_financials')
        .select('annual_personal_expenses, investable_assets, total_personal_debt, passive_income, desired_lifestyle_adjustment, safe_withdrawal_rate')
        .eq('profile_id', profile.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Response.json({ financials: financials || null });
    }

    if (action === 'upsertProfileFinancials') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const ALLOWED_KEYS = [
        'annual_personal_expenses', 'investable_assets', 'total_personal_debt',
        'passive_income', 'desired_lifestyle_adjustment', 'safe_withdrawal_rate',
      ];

      // Whitelist — only the 6 Phase 2C-A fields; never business_id
      const cleanData = {};
      for (const key of ALLOWED_KEYS) {
        if (key in (data || {})) {
          const v = data[key];
          cleanData[key] = (v === null || v === undefined) ? null : Number(v);
        }
      }

      // Enforce safe_withdrawal_rate default and non-negative
      if (cleanData.safe_withdrawal_rate != null && cleanData.safe_withdrawal_rate < 0) {
        return Response.json({ error: 'safe_withdrawal_rate must be non-negative' }, { status: 400 });
      }
      if (!('safe_withdrawal_rate' in cleanData) || cleanData.safe_withdrawal_rate === null) {
        cleanData.safe_withdrawal_rate = 0.04;
      }

      cleanData.updated_at = new Date().toISOString();

      const { data: existing } = await sb
        .from('profile_financials')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (existing) {
        const { error: updateErr } = await sb
          .from('profile_financials')
          .update(cleanData)
          .eq('id', existing.id);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { error: insertErr } = await sb
          .from('profile_financials')
          .insert({ ...cleanData, profile_id: profile.id });
        if (insertErr) throw new Error(insertErr.message);
      }

      return Response.json({ success: true });
    }

    if (action === 'createAdvisorNote') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      const { data: note, error } = await sb
        .from('advisor_notes')
        .insert({ ...data, profile_id: profile.id, visibility: 'client_visible' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return Response.json({ note });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});