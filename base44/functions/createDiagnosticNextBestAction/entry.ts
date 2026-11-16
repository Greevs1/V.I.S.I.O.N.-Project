/**
 * createDiagnosticNextBestAction — Emergency diagnostic function.
 * Inserts exactly one next_best_actions row from the highest priority business_opportunity.
 * Returns COMPLETE visibility into insert operation for debugging RLS/constraints.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  const result = {
    success: false,
    activeBusinessId: null,
    profileId: null,
    opportunitiesFound: 0,
    selectedOpportunity: null,
    insertPayload: null,
    insertData: null,
    insertError: null,
    finalNextBestActionsCount: 0,
    rlsCheck: null,
    serviceRoleUsed: false,
    columnCheck: null,
    constraintCheck: null,
  };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      result.insertError = { message: 'Unauthorized', code: 'AUTH_REQUIRED' };
      return Response.json(result, { status: 401 });
    }
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      result.insertError = { message: 'Forbidden', code: 'ADMIN_REQUIRED' };
      return Response.json(result, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[DIAGNOSTIC] SUPABASE_URL:', SUPABASE_URL);
    console.log('[DIAGNOSTIC] SERVICE_KEY present:', !!SERVICE_KEY);
    console.log('[DIAGNOSTIC] SERVICE_KEY length:', SERVICE_KEY?.length);
    console.log('[DIAGNOSTIC] SERVICE_KEY starts with eyJ:', SERVICE_KEY?.startsWith('eyJ'));

    result.serviceRoleUsed = !!SERVICE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      result.insertError = { 
        message: 'Supabase not configured', 
        details: { SUPABASE_URL: !!SUPABASE_URL, SERVICE_KEY: !!SERVICE_KEY } 
      };
      return Response.json(result, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Step 1: Resolve profile
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id, app_role, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileError) {
      result.insertError = { message: 'Profile query failed', details: profileError };
      return Response.json(result, { status: 500 });
    }

    if (!profile) {
      result.insertError = { message: 'Profile not found', email: user.email };
      return Response.json(result, { status: 404 });
    }

    result.profileId = profile.id;
    // Phase 6.9B — canonical resolution. Was `profile.primary_business_id`.
    const { businessId: activeBusinessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, null, 'createDiagnosticNextBestAction'
    );
    if (bizDenial) {
      result.insertError = {
        message: 'Business context required',
        details: 'This account owns multiple businesses — an explicit business context is required.',
      };
      return Response.json(result, { status: 400 });
    }
    result.activeBusinessId = activeBusinessId;

    console.log('[DIAGNOSTIC] profile.id:', profile.id);
    console.log('[DIAGNOSTIC] activeBusinessId:', activeBusinessId);

    if (!activeBusinessId) {
      result.insertError = { 
        message: 'primary_business_id is null', 
        details: 'User profile has no linked business' 
      };
      return Response.json(result, { status: 400 });
    }

    // Step 2: Query opportunities
    const { data: opportunities, error: oppError } = await sb
      .from('business_opportunities')
      .select('id, title, description, category, priority_score, estimated_impact, effort_level, opportunity_type')
      .eq('business_id', profile.primary_business_id)
      .neq('priority_score', null)
      .order('priority_score', { ascending: false })
      .limit(1);

    if (oppError) {
      result.insertError = { message: 'Opportunity query failed', details: oppError };
      return Response.json(result, { status: 500 });
    }

    result.opportunitiesFound = opportunities?.length || 0;
    console.log('[DIAGNOSTIC] opportunities found:', result.opportunitiesFound);

    if (!opportunities || opportunities.length === 0) {
      result.insertError = { 
        message: 'No opportunities found', 
        details: `business_id=${profile.primary_business_id} has 0 opportunities` 
      };
      return Response.json(result, { status: 404 });
    }

    result.selectedOpportunity = {
      id: opportunities[0].id,
      title: opportunities[0].title,
      category: opportunities[0].category,
      priority_score: opportunities[0].priority_score,
    };

    // Step 3: Build insert payload
    const insertPayload = {
      business_id: profile.primary_business_id,
      profile_id: profile.id,
      title: opportunities[0].title,
      description: opportunities[0].description || `Priority opportunity: ${opportunities[0].category || 'business improvement'}`,
      category: opportunities[0].category || 'general',
      action_type: opportunities[0].opportunity_type || 'opportunity',
      priority_score: opportunities[0].priority_score,
      estimated_impact: opportunities[0].estimated_impact,
      expected_time_days: opportunities[0].effort_level === 'low' ? 7 : opportunities[0].effort_level === 'high' ? 60 : 30,
      difficulty_level: opportunities[0].effort_level === 'low' ? 'easy' : opportunities[0].effort_level === 'high' ? 'hard' : 'medium',
      reason: 'Diagnostic insert from highest priority business opportunity',
      source: 'diagnostic_business_opportunity',
      source_record_id: opportunities[0].id,
      status: 'recommended',
    };

    result.insertPayload = insertPayload;
    console.log('[DIAGNOSTIC] insertPayload:', JSON.stringify(insertPayload, null, 2));

    // Step 4: Check RLS status on next_best_actions table
    try {
      const { data: rlsData, error: rlsError } = await sb
        .from('next_best_actions')
        .select('table_name, row_security_enabled')
        .eq('table_name', 'next_best_actions')
        .maybeSingle();
      
      if (!rlsError) {
        result.rlsCheck = rlsData;
        console.log('[DIAGNOSTIC] RLS check:', rlsData);
      }
    } catch (rlsErr) {
      console.log('[DIAGNOSTIC] RLS check failed (expected):', rlsErr.message);
    }

    // Step 5: Attempt INSERT
    console.log('[DIAGNOSTIC] Attempting INSERT with service role...');
    const { data: inserted, error: insertError } = await sb
      .from('next_best_actions')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error('[DIAGNOSTIC] INSERT FAILED:', insertError);
      console.error('[DIAGNOSTIC] Error details:', JSON.stringify(insertError, null, 2));
      
      result.insertError = {
        message: insertError.message || 'Unknown insert error',
        details: insertError.details || null,
        hint: insertError.hint || null,
        code: insertError.code || null,
        full_error: insertError,
      };

      // Check for common constraint violations
      if (insertError.message?.includes('violates check constraint')) {
        result.constraintCheck = {
          violated: true,
          constraint: insertError.constraint || 'unknown',
          message: insertError.message,
        };
      }

      if (insertError.message?.includes('violates foreign key')) {
        result.constraintCheck = {
          violated: true,
          type: 'foreign_key',
          message: insertError.message,
        };
      }

      if (insertError.message?.includes('column') && insertError.message?.includes('does not exist')) {
        result.columnCheck = {
          missing_column: true,
          message: insertError.message,
        };
      }

      return Response.json(result, { status: 500 });
    }

    result.insertData = inserted;
    console.log('[DIAGNOSTIC] INSERT SUCCESS:', inserted);

    // Step 6: Verify insert with count
    const { count, error: countError } = await sb
      .from('next_best_actions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', profile.primary_business_id);

    if (countError) {
      console.error('[DIAGNOSTIC] Count query failed:', countError);
    }

    result.finalNextBestActionsCount = count || 0;
    console.log('[DIAGNOSTIC] final count:', result.finalNextBestActionsCount);

    // Step 7: Fetch the actual row to confirm it exists
    const { data: verifyRow } = await sb
      .from('next_best_actions')
      .select('*')
      .eq('business_id', profile.primary_business_id)
      .eq('source_record_id', opportunities[0].id)
      .order('created_at', { ascending: false })
      .limit(1);

    console.log('[DIAGNOSTIC] verifyRow:', verifyRow);

    result.success = result.finalNextBestActionsCount > 0;

    return Response.json(result);

  } catch (error) {
    console.error('[DIAGNOSTIC] Unexpected error:', error);
    result.insertError = {
      message: error.message || 'Unexpected error',
      details: error.toString(),
    };
    return Response.json(result, { status: 500 });
  }
});