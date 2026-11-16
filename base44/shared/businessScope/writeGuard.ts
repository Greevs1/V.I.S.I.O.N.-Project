/**
 * Business Scope Write Guard — canonical write validation for backend functions.
 *
 * ARCHITECTURAL DECISION (Phase 6A):
 *   Every NEW authenticated business-owned record MUST:
 *   1. Have a valid activeBusinessId
 *   2. The activeBusinessId must resolve to business_entities.id
 *   3. The current user must have authorized access
 *   4. business_id must be written explicitly
 *   5. Child records must inherit business_id from their parent when applicable
 *
 * PHASE 6B — AUTHORIZATION MODEL ALIGNMENT:
 *   The Phase 6A version checked business_owners first (3 rows only) and would
 *   have rejected legitimate owners whose ownership is recorded via
 *   business_entities.profile_id. This version mirrors the ACTUAL database
 *   authorization model (the `can_access_business()` SQL function that every
 *   RLS policy already uses), so the guard and RLS agree.
 *
 *   Authoritative sources, in priority order:
 *     1. business_entities.profile_id        — owner (same as RLS)
 *     2. business_entities.assigned_advisor_id — assigned advisor (same as RLS)
 *     3. business_team_members               — team access (same as RLS)
 *     4. business_owners                     — explicit ownership record
 *     5. advisor_assignments                 — advisor assignment table
 *     6. expert_advisor_access               — expert access (ACTIVE relationships only, S3.0.2)
 *     7. profiles.app_role = 'super_admin'   — platform access
 *
 * Frontend code should use src/lib/canonicalBusiness.js instead.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveActiveExpertRelationship } from './relationshipAccess.ts';

const SUPABASE_URL = (Deno.env.get('VITE_SUPABASE_URL') || '').replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function getSupabaseClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Supabase not configured for business scope validation');
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface BusinessScopeContext {
  business_id: string;
  profile_id: string;
  is_authorized: boolean;
  authorization_reason: string;
}

/**
 * validateBusinessScope — validates that a user has authorized access
 * to a business before allowing a write.
 *
 * Authorization mirrors `public.can_access_business(uuid)` — the function that
 * every business-scoped RLS policy already uses. See the module header.
 *
 * @param sb — Supabase client (service role)
 * @param business_id — the business_entities.id to validate
 * @param profile_id — the Supabase profile ID of the user
 * @returns {BusinessScopeContext} — validated scope context
 * @throws {Error} if business_id is invalid or user is not authorized
 */
export async function validateBusinessScope(
  sb: any,
  business_id: string,
  profile_id: string
): Promise<BusinessScopeContext> {
  if (!business_id) {
    throw new Error('Business scope validation failed: business_id is required');
  }
  if (!profile_id) {
    throw new Error('Business scope validation failed: profile_id is required');
  }

  // Verify business_entities record exists and read its ownership columns
  const { data: business, error: bizErr } = await sb
    .from('business_entities')
    .select('id, business_name, profile_id, assigned_advisor_id')
    .eq('id', business_id)
    .maybeSingle();

  if (bizErr) throw new Error(`Business lookup failed: ${bizErr.message}`);
  if (!business) throw new Error(`Business scope validation failed: business_entities.id "${business_id}" not found`);

  // 1. Owner — business_entities.profile_id (identical rule to RLS)
  if (business.profile_id && business.profile_id === profile_id) {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: 'owner (business_entities.profile_id)',
    };
  }

  // 2. Assigned advisor — business_entities.assigned_advisor_id (identical rule to RLS)
  if (business.assigned_advisor_id && business.assigned_advisor_id === profile_id) {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: 'assigned_advisor (business_entities.assigned_advisor_id)',
    };
  }

  // 3. Team member — business_team_members (identical rule to RLS)
  const { data: teamRow } = await sb
    .from('business_team_members')
    .select('id')
    .eq('profile_id', profile_id)
    .eq('business_id', business_id)
    .maybeSingle();

  if (teamRow) {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: 'team_member',
    };
  }

  // 4. Explicit ownership record — business_owners
  const { data: ownerRow } = await sb
    .from('business_owners')
    .select('id, ownership_role')
    .eq('profile_id', profile_id)
    .eq('business_id', business_id)
    .maybeSingle();

  if (ownerRow) {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: `owner (${ownerRow.ownership_role || 'owner'})`,
    };
  }

  // 5. Advisor assignment — advisor_assignments
  const { data: advisorRow } = await sb
    .from('advisor_assignments')
    .select('id, status')
    .eq('advisor_profile_id', profile_id)
    .eq('business_id', business_id)
    .maybeSingle();

  if (advisorRow && advisorRow.status !== 'revoked') {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: `advisor (${advisorRow.status || 'active'})`,
    };
  }

  // 6. Expert access — expert_advisor_access, ACTIVE relationships only (S3.0.2).
  //    Relationship EXISTENCE is not authorization: a revoked relationship, a
  //    populated revoked_at or a non-active status grants nothing. The decision
  //    lives in ONE shared predicate so no consumer restates the rule.
  const expertRelationship = await resolveActiveExpertRelationship(sb, profile_id, business_id);

  if (expertRelationship) {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: 'expert_access',
    };
  }

  // 7. Platform access — super_admin
  const { data: profile } = await sb
    .from('profiles')
    .select('app_role')
    .eq('id', profile_id)
    .maybeSingle();

  if (profile?.app_role === 'super_admin') {
    return {
      business_id,
      profile_id,
      is_authorized: true,
      authorization_reason: 'super_admin',
    };
  }

  throw new Error(`Business scope validation failed: profile ${profile_id} is not authorized for business ${business_id}`);
}

/**
 * assertChildBusinessId — validates that a child record's business_id
 * matches its parent's business_id. Prevents cross-business parent/child
 * relationships.
 *
 * @param parentBusinessId — the parent record's business_id
 * @param childBusinessId — the child record's business_id (may be null)
 * @param label — human-readable label for error messages
 * @returns the validated business_id
 * @throws if business_ids don't match
 */
export function assertChildBusinessId(
  parentBusinessId: string,
  childBusinessId: string | null,
  label = 'Child record'
): string {
  if (!parentBusinessId) {
    throw new Error(`${label}: parent business_id is null — cannot validate child scope`);
  }
  if (!childBusinessId) {
    // Child has no business_id — inherit from parent (caller must set it)
    return parentBusinessId;
  }
  if (childBusinessId !== parentBusinessId) {
    throw new Error(
      `${label}: business_id mismatch — parent has "${parentBusinessId}" but child has "${childBusinessId}". ` +
      `Cross-business parent/child relationships are not allowed.`
    );
  }
  return childBusinessId;
}

/**
 * resolveBusinessIdFromSession — for assessment_calculations and other
 * child records that should inherit business_id from their parent session.
 *
 * @param sb — Supabase client
 * @param sessionId — the parent session ID
 * @returns the business_id from the parent session, or null
 */
export async function resolveBusinessIdFromSession(
  sb: any,
  sessionId: string
): Promise<string | null> {
  if (!sessionId) return null;
  const { data: session } = await sb
    .from('assessment_sessions')
    .select('business_id')
    .eq('id', sessionId)
    .maybeSingle();
  return session?.business_id || null;
}

/**
 * resolveProfileIdByIdentity — the VERIFIED Base44 → Supabase identity bridge.
 *
 * Phase 6B verified that `profiles.base44_user_id` holds the Base44 user ID
 * verbatim, making the mapping a deterministic ID equality (NOT an email guess).
 * Email is used only as a fallback when base44_user_id is not populated.
 *
 * Do NOT use this for historical backfill decisions unless the returned
 * `match_method` is `base44_user_id` (VERIFIED).
 *
 * @param sb — Supabase client
 * @param identity — { base44UserId?, email? }
 * @returns { profile_id, match_method, confidence } — profile_id null when unresolved
 */
export async function resolveProfileIdByIdentity(
  sb: any,
  identity: { base44UserId?: string | null; email?: string | null }
): Promise<{ profile_id: string | null; match_method: string; confidence: string }> {
  if (identity?.base44UserId) {
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('base44_user_id', identity.base44UserId)
      .maybeSingle();
    if (data?.id) {
      return { profile_id: data.id, match_method: 'base44_user_id', confidence: 'VERIFIED' };
    }
  }

  if (identity?.email) {
    const normalized = identity.email.trim().toLowerCase();
    const { data } = await sb
      .from('profiles')
      .select('id')
      .ilike('email', normalized)
      .maybeSingle();
    if (data?.id) {
      return { profile_id: data.id, match_method: 'email', confidence: 'FALLBACK' };
    }
  }

  return { profile_id: null, match_method: 'none', confidence: 'UNRESOLVED' };
}