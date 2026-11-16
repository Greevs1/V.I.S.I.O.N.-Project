/**
 * valuationAuth.ts — Phase 13.3E.3
 *
 * Shared identity resolution + authorization helpers for valuation backend
 * functions. Extracted so new functions (e.g. verificationQueueService) can
 * reuse the exact same access model as valuationService without copying.
 *
 * Base44 Auth is authoritative. Identity: base44.auth.me() → base44_user_id
 * (preferred) or normalized email → profiles.id. Never accept a profile ID
 * from the frontend. Service-role bypasses RLS; every action must explicitly
 * authorize. Business ownership grants discovery only; internal valuation
 * access requires explicit valuation_assignments.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

export interface AuthCtx {
  sb: any;
  vsb: any;
  profile: any;
  profileId: string;
  isSuperAdmin: boolean;
  user: any;
}

export async function resolveAuthCtx(base44: any): Promise<AuthCtx> {
  const user = await base44.auth.me();
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!rawUrl || !SERVICE_KEY) {
    throw Object.assign(new Error('Supabase not configured'), { status: 500 });
  }
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const vsb = sb.schema('valuation');

  let profileRow: any = null;

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
    if (byEmail.length > 1) throw Object.assign(new Error('AMBIGUOUS_PROFILE_MATCH'), { status: 403 });
    if (byEmail.length === 1) profileRow = byEmail[0];
  }

  if (!profileRow) throw Object.assign(new Error('PROFILE_NOT_FOUND'), { status: 403 });

  return {
    sb,
    vsb,
    profile: profileRow,
    profileId: profileRow.id,
    isSuperAdmin: profileRow.app_role === 'super_admin',
    user,
  };
}

export async function requireBusinessAccess(ctx: AuthCtx, businessId: string): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const { data: bo } = await ctx.sb
    .from('business_owners')
    .select('business_id')
    .eq('business_id', businessId)
    .eq('profile_id', ctx.profileId)
    .maybeSingle();
  if (bo) return true;
  const { data: be } = await ctx.sb
    .from('business_entities')
    .select('id')
    .eq('id', businessId)
    .eq('assigned_advisor_id', ctx.profileId)
    .maybeSingle();
  if (be) return true;
  if (ctx.profile.primary_business_id === businessId) return true;
  return false;
}

export async function loadValuationContext(ctx: AuthCtx, valuationId: string) {
  const { data: val, error: valErr } = await ctx.vsb
    .from('business_valuations')
    .select('id, business_id, status, client_sharing_status')
    .eq('id', valuationId)
    .maybeSingle();
  if (valErr) throw new Error(valErr.message);
  if (!val) throw Object.assign(new Error('VALUATION_NOT_FOUND'), { status: 404 });
  const { data: asg, error: asgErr } = await ctx.vsb
    .from('valuation_assignments')
    .select('can_view, can_edit, can_review, can_publish, can_create_valuation, can_restore_valuation, can_archive_valuation, can_manage_assignments, assignment_role')
    .eq('valuation_id', valuationId)
    .eq('assigned_profile_id', ctx.profileId)
    .is('removed_at', null)
    .maybeSingle();
  if (asgErr) throw new Error(asgErr.message);
  return { valuation: val, assignment: asg || null };
}

export async function requireValuationView(ctx: AuthCtx, valuationId: string) {
  const ctxVal = await loadValuationContext(ctx, valuationId);
  if (ctx.isSuperAdmin) return ctxVal;
  if (!ctxVal.assignment || !ctxVal.assignment.can_view) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctxVal;
}

export async function requireValuationEdit(ctx: AuthCtx, valuationId: string) {
  const ctxVal = await loadValuationContext(ctx, valuationId);
  if (ctx.isSuperAdmin) return ctxVal;
  if (ctxVal.valuation.status === 'archived') {
    throw Object.assign(new Error('VALUATION_ARCHIVED'), { status: 400 });
  }
  if (!ctxVal.assignment || !ctxVal.assignment.can_edit) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctxVal;
}

/**
 * Phase 13.3G.2 — Lifecycle + assignment management helpers.
 * These extend the existing assignment model. Super admins always pass.
 * Otherwise the specific permission flag on the active assignment is required.
 */

export async function requireValuationCreate(ctx: AuthCtx, businessId: string): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const hasBusiness = await requireBusinessAccess(ctx, businessId);
  if (!hasBusiness) throw Object.assign(new Error('BUSINESS_ACCESS_DENIED'), { status: 403 });
  // First valuation for this business — any advisor with business access may create
  const { data: existing } = await ctx.vsb
    .from('business_valuations')
    .select('id')
    .eq('business_id', businessId)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle();
  if (!existing) return true;
  // Existing valuation — require can_create_valuation on active assignment
  const { data: asg } = await ctx.vsb
    .from('valuation_assignments')
    .select('can_create_valuation')
    .eq('valuation_id', existing.id)
    .eq('assigned_profile_id', ctx.profileId)
    .is('removed_at', null)
    .maybeSingle();
  if (!asg || !asg.can_create_valuation) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return true;
}

export async function requireValuationRestore(ctx: AuthCtx, valuationId: string) {
  const ctxVal = await loadValuationContext(ctx, valuationId);
  if (ctx.isSuperAdmin) return ctxVal;
  if (!ctxVal.assignment || !ctxVal.assignment.can_restore_valuation) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctxVal;
}

export async function requireValuationArchive(ctx: AuthCtx, valuationId: string) {
  const ctxVal = await loadValuationContext(ctx, valuationId);
  if (ctx.isSuperAdmin) return ctxVal;
  if (!ctxVal.assignment || !ctxVal.assignment.can_archive_valuation) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctxVal;
}

export async function requireAssignmentManagement(ctx: AuthCtx, valuationId: string) {
  const ctxVal = await loadValuationContext(ctx, valuationId);
  if (ctx.isSuperAdmin) return ctxVal;
  if (!ctxVal.assignment || !ctxVal.assignment.can_manage_assignments) {
    throw Object.assign(new Error('PERMISSION_DENIED'), { status: 403 });
  }
  return ctxVal;
}

export async function appendAudit(
  ctx: AuthCtx,
  valuationId: string,
  actionType: string,
  oldVal: any,
  newVal: any,
  meta: any,
) {
  await ctx.vsb.from('valuation_audit_log').insert({
    valuation_id: valuationId,
    actor_profile_id: ctx.profileId,
    action: actionType,
    action_details: { old: oldVal || null, new: newVal || null, meta: meta || null },
  });
}