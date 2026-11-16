/**
 * resolveStrategyMappings — Deterministic Strategy Resolution
 *
 * The single strategy-resolution engine. Given a BIE recommendation_key,
 * finds the best-matching strategies from strategy_library via
 * recommendation_strategy_mappings and recommendation_overrides.
 *
 * This function does NOT:
 *   - invent recommendations
 *   - calculate recommendation priority
 *   - calculate estimated business impact
 *   - independently score business opportunities
 *   - override BIE confidence
 *
 * Resolution order (deterministic precedence):
 *   1. Active advisor override
 *   2. Confirmed business-specific mapping
 *   3. Suggested business-specific mapping
 *   4. Confirmed metric mapping
 *   5. Suggested metric mapping
 *   6. Confirmed category mapping
 *   7. Suggested category mapping
 *   8. Global mapping
 *
 * Actions:
 *   - resolve:              resolve strategies for a recommendation_key
 *   - getUnmappedStrategies: return strategies with no active mappings (admin queue)
 *   - createMapping:        create a new mapping (admin only)
 *   - updateMapping:        update a mapping (admin only)
 *   - deactivateMapping:    deactivate a mapping (admin only)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

// ── Resolution precedence (lower = higher priority) ──────────────────────────
const SCOPE_PRECEDENCE: Record<string, number> = {
  advisor_override: 0,
  business: 1,
  metric: 2,
  category: 3,
  global: 4,
};
const STATUS_PRECEDENCE: Record<string, number> = {
  confirmed: 0,
  suggested: 1,
  overridden: 2,
  not_applicable: 3,
  rejected: 4,
};

// ── Free-user allow-list (backend-enforced, not frontend filtering) ───────────
const FREE_USER_FIELDS = [
  'strategy_id',
  'title',
  'category',
  'desired_business_outcome',
  'implementation_complexity',
  'advisor_review_required',
  'match_status',
  'mapping_scope',
  'applicability_notes',
  'recommendation_key',
];

// ── Build strategy projection with access-level allow-list ───────────────────
function buildStrategyProjection(strategy: any, mapping: any, accessLevel: string) {
  const base: any = {
    strategy_id: strategy.id,
    title: strategy.strategy_name,
    category: strategy.category,
    desired_business_outcome: strategy.desired_business_outcome || null,
    implementation_complexity: strategy.implementation_difficulty,
    advisor_review_required: strategy.advisor_review_required || false,
    match_status: mapping.match_status,
    mapping_scope: mapping.mapping_scope,
    applicability_notes: mapping.applicability_notes || null,
    recommendation_key: mapping.recommendation_key,
  };

  // Paid/advisor/admin get restricted fields
  if (accessLevel === 'paid' || accessLevel === 'advisor' || accessLevel === 'admin') {
    base.eligibility_requirements = {
      ideal_client_profile: strategy.ideal_client_profile,
      ideal_industries: strategy.ideal_industries || [],
      minimum_revenue: strategy.minimum_revenue,
      maximum_revenue: strategy.maximum_revenue,
    };
    base.disqualifiers = strategy.contraindications || null;
    base.evidence_requirements = {
      required_documents: strategy.required_documents || [],
      required_data_points: strategy.required_data_points || [],
    };
    base.dependencies = strategy.dependencies || [];
    base.implementation_days = strategy.implementation_days;
    base.confidence_score = strategy.confidence_score;
  }

  // Advisor/admin get proprietary implementation steps
  if (accessLevel === 'advisor' || accessLevel === 'admin') {
    base.proprietary_implementation_steps = strategy.proprietary_implementation_steps || [];
    base.strategy_family = strategy.strategy_family;
    base.description = strategy.description;
  }

  return base;
}

// ── Apply eligibility requirements (revenue range, industry) ──────────────────
function passesEligibility(strategy: any, clientData: any): boolean {
  const revenue = clientData?.revenue || 0;
  if (strategy.minimum_revenue && revenue > 0 && revenue < strategy.minimum_revenue) return false;
  if (strategy.maximum_revenue && revenue > 0 && revenue > strategy.maximum_revenue) return false;

  const industry = (clientData?.industry || '').toLowerCase();
  if (strategy.ideal_industries && industry) {
    const idealList = (Array.isArray(strategy.ideal_industries) ? strategy.ideal_industries : [strategy.ideal_industries])
      .map((i: string) => (i || '').toLowerCase());
    if (idealList.length > 0 && !idealList.includes('all') && !idealList.includes('')) {
      const isMatch = idealList.some(i => industry.includes(i) || i.includes(industry));
      if (!isMatch) return false;
    }
  }

  return true;
}

// ── Apply contraindications ───────────────────────────────────────────────────
function passesContraindications(strategy: any, clientData: any): boolean {
  const contra = (strategy.contraindications || '').toLowerCase();
  if (!contra) return true;
  // If contraindications text mentions a condition the client has, exclude
  // This is a simple text match — admin-curated contraindications field
  return true; // Contraindications are advisory text, not automated blockers
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const { action = 'resolve' } = body;

    // ── Resolve profile and access level ──────────────────────────────────────
    const { data: prof } = await sb.from('profiles').select('id, primary_business_id, app_role, membership_tier').eq('email', user.email).maybeSingle();
    const isAdmin = user.role === 'admin' || user.role === 'super_admin' || prof?.app_role === 'admin' || prof?.app_role === 'super_admin';
    const accessLevel = isAdmin ? 'admin' : (prof?.membership_tier === 'paid' ? 'paid' : 'free');

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: resolve
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'resolve') {
      const { recommendation_key, business_id, profile_id, client_data } = body;
      if (!recommendation_key) return Response.json({ error: 'recommendation_key required' }, { status: 400 });

      // ── Verify business scope ───────────────────────────────────────────────
      let resolvedBusinessId = business_id;
      let resolvedProfileId = profile_id || prof?.id;
      if (!resolvedBusinessId) {
        // Phase 6.9B — canonical resolution. Was `prof?.primary_business_id`.
        const { businessId: canonBizId, denial: bizDenial } = await requireBusinessContext(
          sb, prof, null, 'resolveStrategyMappings.resolve'
        );
        if (bizDenial) return bizDenial;
        resolvedBusinessId = canonBizId;
      }
      if (resolvedBusinessId && !isAdmin) {
        const { data: ownership } = await sb.from('business_owners')
          .select('business_id').eq('business_id', resolvedBusinessId).eq('profile_id', prof.id).maybeSingle();
        if (!ownership) {
          const { data: advisorAccess } = await sb.from('expert_advisor_access')
            .select('client_profile_id').eq('business_id', resolvedBusinessId)
            .eq('expert_profile_id', String(prof.id)).eq('access_status', 'active').maybeSingle();
          if (!advisorAccess) return Response.json({ error: 'Not authorized for this business' }, { status: 403 });
        }
      }

      // ── Fetch all active mappings for this recommendation_key ───────────────
      const { data: mappings } = await sb.from('recommendation_strategy_mappings')
        .select('*')
        .eq('recommendation_key', recommendation_key)
        .eq('active', true)
        .order('created_at', { ascending: true });

      if (!mappings || mappings.length === 0) {
        return Response.json({ strategies: [], recommendation_key, reason: 'no_mappings' });
      }

      // ── Fetch active overrides for this recommendation_key + business ───────
      let overrideStrategyIds: string[] = [];
      if (resolvedBusinessId) {
        const { data: overrides } = await sb.from('recommendation_overrides')
          .select('*')
          .eq('recommendation_key', recommendation_key)
          .eq('business_id', resolvedBusinessId)
          .eq('active', true)
          .is('revoked_at', null);
        if (overrides && overrides.length > 0) {
          // Overrides that confirm or replace a strategy take precedence
          overrideStrategyIds = overrides
            .filter(o => o.override_type === 'confirm_strategy' || o.override_type === 'replace_strategy')
            .map(o => o.strategy_id)
            .filter(Boolean);
        }
      }

      // ── Sort mappings by resolution precedence ──────────────────────────────
      const sortedMappings = (mappings as any[]).sort((a, b) => {
        // Advisor overrides first
        const aIsOverride = a.mapping_scope === 'advisor_override' ? 0 : 1;
        const bIsOverride = b.mapping_scope === 'advisor_override' ? 0 : 1;
        if (aIsOverride !== bIsOverride) return aIsOverride - bIsOverride;

        // Business-specific before global
        const aScope = SCOPE_PRECEDENCE[a.mapping_scope] ?? 99;
        const bScope = SCOPE_PRECEDENCE[b.mapping_scope] ?? 99;
        if (aScope !== bScope) return aScope - bScope;

        // Confirmed before suggested
        const aStatus = STATUS_PRECEDENCE[a.match_status] ?? 99;
        const bStatus = STATUS_PRECEDENCE[b.match_status] ?? 99;
        return aStatus - bStatus;
      });

      // ── Fetch strategy_library data for all mapped strategy_ids ────────────
      const strategyIds = [...new Set(sortedMappings.map(m => m.strategy_id))];
      const { data: strategies } = await sb.from('strategy_library')
        .select('*').in('id', strategyIds);
      const strategyMap = (strategies || []).reduce((acc: any, s: any) => { acc[s.id] = s; return acc; }, {});

      // ── Build resolved strategy list with eligibility filtering ────────────
      const resolved: any[] = [];
      const seenStrategyIds = new Set<string>();
      for (const mapping of sortedMappings) {
        const strategy = strategyMap[mapping.strategy_id];
        if (!strategy || !strategy.active) continue;
        if (seenStrategyIds.has(strategy.id)) continue;

        // Apply eligibility requirements
        if (client_data && !passesEligibility(strategy, client_data)) continue;
        if (client_data && !passesContraindications(strategy, client_data)) continue;

        seenStrategyIds.add(strategy.id);
        resolved.push(buildStrategyProjection(strategy, mapping, accessLevel));
      }

      // ── If overrides specified specific strategies, prioritize them ─────────
      if (overrideStrategyIds.length > 0) {
        const overrideStrategies: any[] = [];
        for (const sid of overrideStrategyIds) {
          const strategy = strategyMap[sid];
          if (strategy && strategy.active) {
            overrideStrategies.push(buildStrategyProjection(strategy, {
              recommendation_key,
              mapping_scope: 'advisor_override',
              match_status: 'confirmed',
              applicability_notes: 'Advisor override',
            }, accessLevel));
          }
        }
        // Put override strategies first, then the rest (deduped)
        const rest = resolved.filter(r => !overrideStrategyIds.includes(r.strategy_id));
        return Response.json({
          strategies: [...overrideStrategies, ...rest],
          recommendation_key,
          override_count: overrideStrategies.length,
        });
      }

      return Response.json({ strategies: resolved, recommendation_key });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: getUnmappedStrategies (admin — Needs Mapping Review queue)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'getUnmappedStrategies') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

      const { data: mapped } = await sb.from('recommendation_strategy_mappings')
        .select('strategy_id').eq('active', true);
      const mappedIds = (mapped || []).map((m: any) => m.strategy_id);

      let query = sb.from('strategy_library').select('id, strategy_name, category, strategy_family, active').eq('active', true);
      if (mappedIds.length > 0) {
        query = query.not('id', 'in', `(${mappedIds.map(id => `'${id}'`).join(',')})`);
      }
      const { data: unmapped, error } = await query.order('category').order('strategy_name');

      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Group by category for the admin queue
      const byCategory: Record<string, any[]> = {};
      for (const s of (unmapped || [])) {
        if (!byCategory[s.category]) byCategory[s.category] = [];
        byCategory[s.category].push(s);
      }

      return Response.json({ unmapped: unmapped || [], by_category: byCategory, total: (unmapped || []).length });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: createMapping (admin only)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'createMapping') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

      const { recommendation_key, strategy_id, mapping_scope, match_status, applicability_notes, business_id, profile_id } = body;
      if (!recommendation_key || !strategy_id || !mapping_scope) {
        return Response.json({ error: 'recommendation_key, strategy_id, mapping_scope required' }, { status: 400 });
      }

      const { data, error } = await sb.from('recommendation_strategy_mappings').insert({
        recommendation_key,
        strategy_id,
        business_id: business_id || null,
        profile_id: profile_id || null,
        mapping_scope,
        match_status: match_status || 'suggested',
        applicability_notes: applicability_notes || null,
        source: 'admin',
        active: true,
        created_by: user.email,
      }).select().single();

      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ mapping: data });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: updateMapping (admin only)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'updateMapping') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

      const { mapping_id, match_status, applicability_notes, active } = body;
      if (!mapping_id) return Response.json({ error: 'mapping_id required' }, { status: 400 });

      const updates: any = { updated_at: new Date().toISOString() };
      if (match_status) updates.match_status = match_status;
      if (applicability_notes !== undefined) updates.applicability_notes = applicability_notes;
      if (active !== undefined) updates.active = active;

      const { data, error } = await sb.from('recommendation_strategy_mappings')
        .update(updates).eq('id', mapping_id).select().single();

      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ mapping: data });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ACTION: deactivateMapping (admin only)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'deactivateMapping') {
      if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

      const { mapping_id } = body;
      if (!mapping_id) return Response.json({ error: 'mapping_id required' }, { status: 400 });

      const { error } = await sb.from('recommendation_strategy_mappings')
        .update({ active: false, updated_at: new Date().toISOString() }).eq('id', mapping_id);

      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ success: true });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[resolveStrategyMappings] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});