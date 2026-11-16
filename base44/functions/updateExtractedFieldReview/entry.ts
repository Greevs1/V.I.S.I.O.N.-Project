/**
 * updateExtractedFieldReview
 * 
 * Updates the review status of an extracted field.
 * Supports: accept, correct, reject, needs_clarification
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { fieldId, action, acceptedValue, acceptedNormalizedValue, notes } = body;

    if (!fieldId || !action) {
      return Response.json({ error: 'fieldId and action are required' }, { status: 400 });
    }

    const validActions = ['accept', 'correct', 'reject', 'needs_clarification'];
    if (!validActions.includes(action)) {
      return Response.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, { status: 400 });
    }

    // Get user's profile
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, app_role')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr) throw new Error(profileErr.message);
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const profileId = profile.id;
    const role = profile.app_role || user.role;

    // Get the extracted field
    const { data: field, error: fieldErr } = await sb
      .from('extracted_fields')
      .select('*')
      .eq('id', fieldId)
      .maybeSingle();

    if (fieldErr) throw new Error(fieldErr.message);
    if (!field) return Response.json({ error: 'Extracted field not found' }, { status: 404 });

    // Check authorization (owner or advisor)
    const isOwner = field.profile_id === profileId;
    let isAdvisor = false;

    if (!isOwner && role === 'advisor') {
      const { data: assignment } = await sb
        .from('advisor_assignments')
        .select('id')
        .eq('advisor_profile_id', profileId)
        .eq('business_id', field.business_id)
        .maybeSingle();
      isAdvisor = !!assignment;
    }

    if (!isOwner && !isAdvisor) {
      return Response.json({ error: 'Unauthorized to review this field' }, { status: 403 });
    }

    // Map action to review_status
    const statusMap = {
      accept: 'accepted',
      correct: 'corrected',
      reject: 'rejected',
      needs_clarification: 'needs_clarification',
    };

    const reviewStatus = statusMap[action];

    // Build update payload
    const updateData = {
      review_status: reviewStatus,
      reviewed_by: profileId,
      reviewed_at: new Date().toISOString(),
      notes: notes || field.notes,
      updated_at: new Date().toISOString(),
    };

    // Add accepted values for accept/correct actions
    if (action === 'accept') {
      updateData.accepted_value = field.field_value;
      updateData.accepted_normalized_value = field.normalized_value;
    } else if (action === 'correct') {
      updateData.accepted_value = acceptedValue || field.field_value;
      updateData.accepted_normalized_value = acceptedNormalizedValue !== undefined ? acceptedNormalizedValue : field.normalized_value;
    }

    // Update the field
    const { data: updatedField, error: updateErr } = await sb
      .from('extracted_fields')
      .update(updateData)
      .eq('id', fieldId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    // After accept/correct — kick off CIQ recalculation for the business (non-blocking)
    if ((action === 'accept' || action === 'correct') && field.business_id) {
      base44.functions.invoke('regenerateCiqMetrics', {
        businessId: field.business_id,
      }).catch(() => {}); // non-fatal, fire-and-forget
    }

    return Response.json({
      success: true,
      field: updatedField,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});