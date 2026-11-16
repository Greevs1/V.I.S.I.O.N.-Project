/**
 * debugSupabaseWrite
 * Emergency debug function — inserts a test row into assessment_sessions.
 * Reports step-by-step what succeeds or fails so we can pinpoint the exact break point.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const log = [];
  const report = (msg, data) => {
    const entry = { msg, ...( data !== undefined ? { data } : {}) };
    console.log('[debugSupabaseWrite]', JSON.stringify(entry));
    log.push(entry);
  };

  try {
    // ── Step 1: Auth ──────────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    report('step1_auth', { ok: !!user, email: user?.email || null, role: user?.role || null });
    if (!user) return Response.json({ success: false, error: 'Unauthorized', log }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ success: false, error: 'Forbidden', log }, { status: 403 });

    // ── Step 2: Supabase config ───────────────────────────────────────────
    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    report('step2_config', {
      url_set: !!SUPABASE_URL,
      url_preview: SUPABASE_URL ? SUPABASE_URL.slice(0, 40) : null,
      service_key_set: !!SERVICE_KEY,
      service_key_preview: SERVICE_KEY ? SERVICE_KEY.slice(0, 20) + '…' : null,
    });
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ success: false, error: 'Supabase not configured', log }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── Step 3: Profile lookup ────────────────────────────────────────────
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();
    report('step3_profile', {
      found: !!profile,
      profile_id: profile?.id || null,
      profile_keys: profile ? Object.keys(profile) : null,
      error: profileErr?.message || null,
    });
    if (!profile) {
      // Check what columns the profiles table actually has, and sample existing rows
      const { data: sampleRows, error: sampleErr } = await sb.from('profiles').select('*').limit(3);
      report('step3b_profiles_sample', {
        row_count: sampleRows?.length ?? 0,
        sample_keys: sampleRows?.[0] ? Object.keys(sampleRows[0]) : null,
        sample_emails: sampleRows?.map(r => r.email || r.user_email || '(no email col)') || [],
        sample_error: sampleErr?.message || null,
      });

      // Attempt to auto-create the profile row so subsequent saves work
      // Uses actual schema columns: first_name, last_name, email, app_role
      // app_role has a check constraint — only allow: super_admin, advisor, owner, team_member
      const nameParts = (user.full_name || '').split(' ');
      const validRoles = ['super_admin', 'advisor', 'owner', 'team_member'];
      const safeRole = validRoles.includes(user.role) ? user.role : 'owner';
      const { data: newProfile, error: createErr } = await sb.from('profiles').insert({
        email: user.email,
        first_name: nameParts[0] || user.email,
        last_name: nameParts.slice(1).join(' ') || '',
        app_role: safeRole,
        profile_status: 'active',
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('*').single();
      report('step3c_profile_create_attempt', {
        created: !!newProfile,
        profile_id: newProfile?.id || null,
        error: createErr?.message || null,
        error_code: createErr?.code || null,
      });

      if (createErr || !newProfile) {
        return Response.json({
          success: false,
          error: `Profile not found and auto-create failed: ${createErr?.message || 'unknown'}`,
          profileError: profileErr?.message || 'No row returned',
          hint: 'The profiles table has no row for this email. Check if profiles are populated via a Supabase trigger or separate onboarding flow.',
          log,
        }, { status: 404 });
      }

      // Use newly created profile
      const profileId = newProfile.id;
      report('step3d_using_new_profile', { profile_id: profileId });

      const insertPayload2 = {
        profile_id: profileId,
        business_id: null,
        assessment_type: 'debug_test',
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
      const { data: session2, error: sessionErr2 } = await sb
        .from('assessment_sessions').insert(insertPayload2).select('id').single();
      report('step5_insert_with_new_profile', {
        success: !sessionErr2,
        session_id: session2?.id || null,
        error: sessionErr2?.message || null,
        error_code: sessionErr2?.code || null,
      });
      if (sessionErr2) {
        return Response.json({ success: false, error: sessionErr2.message, log }, { status: 500 });
      }
      return Response.json({ success: true, session_id: session2.id, profile_id: profileId, profile_was_created: true, log });
    }

    const profileId = profile.id;
    let businessId = null; // profiles.business_id does not exist — always resolve via businesses table

    // ── Step 4: Business resolution (if needed) ───────────────────────────
    if (!businessId) {
      const { data: biz, error: bizErr } = await sb
        .from('businesses')
        .select('id')
        .eq('profile_id', profileId)
        .limit(1);
      report('step4_business_lookup', {
        found: biz && biz.length > 0,
        business_id: biz?.[0]?.id || null,
        error: bizErr?.message || null,
      });
      if (biz && biz.length > 0) {
        businessId = biz[0].id;
      } else {
        report('step4_no_business', 'proceeding without business_id');
      }
    } else {
      report('step4_business_from_profile', { business_id: businessId });
    }

    // ── Step 5: Test insert into assessment_sessions ──────────────────────
    const now = new Date().toISOString();
    const insertPayload = {
      profile_id: profileId,
      business_id: businessId || null,
      assessment_type: 'debug_test',
      status: 'completed',
      started_at: now,
      completed_at: now,
    };
    report('step5_insert_payload', insertPayload);

    const { data: session, error: sessionErr } = await sb
      .from('assessment_sessions')
      .insert(insertPayload)
      .select('id')
      .single();

    report('step5_insert_result', {
      success: !sessionErr,
      session_id: session?.id || null,
      error: sessionErr?.message || null,
      error_code: sessionErr?.code || null,
      error_details: sessionErr?.details || null,
      error_hint: sessionErr?.hint || null,
    });

    if (sessionErr) {
      return Response.json({
        success: false,
        error: sessionErr.message,
        error_code: sessionErr.code,
        error_details: sessionErr.details,
        error_hint: sessionErr.hint,
        log,
      }, { status: 500 });
    }

    // ── Step 6: Verify the row exists ─────────────────────────────────────
    const { data: verify, error: verifyErr } = await sb
      .from('assessment_sessions')
      .select('id, assessment_type, status, created_at')
      .eq('id', session.id)
      .maybeSingle();
    report('step6_verify', {
      found: !!verify,
      row: verify || null,
      error: verifyErr?.message || null,
    });

    return Response.json({
      success: true,
      session_id: session.id,
      profile_id: profileId,
      business_id: businessId,
      verified_row: verify || null,
      log,
    });

  } catch (error) {
    console.error('[debugSupabaseWrite] unhandled error:', error.message);
    return Response.json({ success: false, error: error.message, log }, { status: 500 });
  }
});