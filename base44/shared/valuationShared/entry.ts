/**
 * valuationShared — shared helpers for valuation backend functions.
 *
 * Extracted from valuationService to avoid duplication between
 * valuationService and valuationCalculationEngine.
 *
 * Exports:
 *   createSupabaseClient() — service-role Supabase client
 *   resolveCurrentProfile(sb, user) — identity resolution
 *   requireBusinessAccess(sb, profile, businessId) — business-level access
 *   loadValuationContext(vsb, profileId, valuationId) — load valuation + assignment
 *   requireValuationView(vsb, sb, profile, valuationId) — view permission
 *   requireValuationEdit(vsb, sb, profile, valuationId) — edit permission
 *   appendAudit(vsb, valuationId, profileId, actionType, oldVal, newVal, meta)
 *   round4(n) — decimal precision helper
 *   VALID_STATUSES, VALID_TRANSITIONS, validateStatusTransition
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

export function createSupabaseClient() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!rawUrl || !SERVICE_KEY) {
    throw Object.assign(new Error('Supabase not configured'), { status: 500 });
  }
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function resolveCurrentProfile(sb, user) {
  let profileRow = null;

  if (user.id) {
    const { data: byB44, error: b44Err } = await sb
      .from('profiles')
      .select('id, app_role, email, primary_business_id, base44_user_id, first_name, last_name')
      .eq('base44_user_id', user.id)
      .maybeSingle();
    if (b44Err) throw new Error(b44Err.message);
    if (byB44) profileRow = byB44;
  }

  if (!profileRow && user.email) {
    const normalizedEmail = user.email.toLowerCase().trim();
    const { data: byEmail, error: emailErr } = await sb
      .from('profiles')
      .select('id, app_role, email, primary_business_id, base44_user_id, first_name, last_name')
      .ilike('email', normalizedEmail);
    if (emailErr) throw new Error(emailErr.message);
    if (byEmail.length > 1) {
      throw Object.assign(new Error('AMBIGUOUS_PROFILE_MATCH'), { status: 403 });
    }
    if (byEmail.length === 1) profileRow = byEmail[0];
  }

  if (!profileRow) {
    throw Object.assign(new Error('PROFILE_NOT_FOUND'), { status: 403 });
  }

  return profileRow;
}

export async function requireBusinessAccess(sb, profile, businessId) {
  if (profile.app_role === 'super_admin') return true;
  const { data: bo } = await sb
    .from('business_owners')
    .select('business_id')
    .eq('business_id', businessId)
    .eq('profile_id', profile.id)
    .maybeSingle();
  if (bo) return true;
  const { data: be } = await sb
    .from('business_entities')
    .select('id')
    .eq('id', businessId)
    .eq('assigned_advisor_id', profile.id)
    .maybeSingle();
  if (be) return true;
  if (profile.primary_business_id === businessId) return true;
  return false;
}

export async function loadValuationContext(vsb, profileId, valuationId) {
  const { data: val, error: valErr } = await vsb.from('business_valuations')
    .select('id, business_id, status, client_sharing_status')
    .eq('id', valuationId)
    .maybeSingle();
  if (valErr) throw new Error(valErr.message);
  if (!val) {
    throw Object.assign(new Error('VALUATION_NOT_FOUND'), { status: 404 });
  }
  const { data: asg, error: asgErr } = await vsb
    .from('valuation_assignments')
    .select('can_view, can_edit, can_review, can_publish, assignment_role')
    .eq('valuation_id', valuationId)
    .eq('assigned_profile_id', profileId)
    .is('removed_at', null)
    .maybeSingle();
  if (asgErr) throw new Error(asgErr.message);
  return { valuation: val, assignment: asg || null };
}

export async function requireValuationView(vsb, sb, profile, valuationId) {
  const ctx = await loadValuationContext(vsb, profile.id, valuationId);
  if (profile.app_role === 'super_admin') return ctx;
  if (!ctx.assignment || !ctx.assignment.can_view) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctx;
}

export async function requireValuationEdit(vsb, sb, profile, valuationId) {
  const ctx = await loadValuationContext(vsb, profile.id, valuationId);
  if (profile.app_role === 'super_admin') return ctx;
  if (ctx.valuation.status === 'archived') {
    throw Object.assign(new Error('VALUATION_ARCHIVED'), { status: 400 });
  }
  if (!ctx.assignment || !ctx.assignment.can_edit) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctx;
}

export async function appendAudit(vsb, valuationId, profileId, actionType, oldVal, newVal, meta) {
  await vsb.from('valuation_audit_log').insert({
    valuation_id: valuationId,
    actor_profile_id: profileId,
    action: actionType,
    action_details: { old: oldVal || null, new: newVal || null, meta: meta || null },
  });
}

export const VALID_STATUSES = ['not_started', 'in_progress', 'needs_review', 'advisor_approved', 'published', 'archived'];

export const VALID_TRANSITIONS = {
  not_started: ['in_progress'],
  in_progress: ['needs_review'],
  needs_review: ['advisor_approved', 'in_progress'],
  advisor_approved: ['needs_review'],
  published: [],
  archived: [],
};

export function validateStatusTransition(currentStatus, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw Object.assign(new Error(`INVALID_STATUS: ${newStatus}`), { status: 400 });
  }
  if (currentStatus === newStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw Object.assign(new Error(`INVALID_TRANSITION: ${currentStatus} → ${newStatus}`), { status: 400 });
  }
  return true;
}

/**
 * Round to 4 decimal places for NUMERIC(19,4) storage.
 * Avoids floating-point drift in intermediate calculations.
 */
export function round4(n) {
  if (n == null || isNaN(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

/**
 * Round to 2 decimal places for percentage fields.
 */
export function round2(n) {
  if (n == null || isNaN(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Round to 6 decimal places for rate fields (discount rate, growth rate).
 */
export function round6(n) {
  if (n == null || isNaN(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 1000000) / 1000000;
}