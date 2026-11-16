/**
 * galileoOpportunityEngine — Phase 12C: BIE-Consumer
 *
 * CONSUMES canonical BIE recommendations. Does NOT independently generate,
 * score, rank, or invent business recommendations.
 *
 * Flow:
 *   canonical BIE recommendation
 *   → resolved Strategy Library context
 *   → supporting evidence
 *   → Galileo opportunity record
 *   → conversational response
 *
 * Actions:
 *   generateOpportunities  — consume BIE recommendations, create opportunity records
 *   getOpportunities       — list by status/business (presentation)
 *   getActivePaths         — top 3 active opportunities (presentation)
 *   promoteOpportunity     — promote to active (presentation)
 *   completeOpportunity    — mark completed + trigger replacement (presentation)
 *   archiveOpportunity     — archive (presentation)
 *   getGenerationHistory   — all generations for a business (presentation)
 *   getStrategicTimeline   — chronological history of all events (presentation)
 *   getExplainWhy          — explain a specific opportunity using BIE context
 *   getDriftAnalysis       — compare two generations (presentation)
 *   getBusinessSnapshot    — latest snapshot (presentation)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  fetchCanonicalRecommendations,
  resolveStrategyContext,
  checkAdvisorOverride,
  buildSupportingEvidence,
  resolveProfileAndBusiness,
} from '../../shared/galileoBieConsumer/entry.ts';
import {
  resolveActiveBusiness,
  businessContextError,
} from '../../shared/businessScope/activeBusiness.ts';

// Priority-based score (NOT independent scoring — derives from BIE priority)
const PRIORITY_SCORE: Record<string, number> = { high: 85, medium: 65, low: 40 };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { action, data } = body;

    // profileId + membershipStatus only. The legacy resolver's businessId is
    // deliberately NOT used — see the Phase 6.9 business resolution below.
    const { profileId, membershipStatus } = await resolveProfileAndBusiness(sb, user, data);
    const userRole = user.role || 'owner';

    // ── PHASE 6.9 — BUSINESS SCOPE CONTRACT ───────────────────────────────────
    // AUDIT: every action in this engine reads or writes ONE business's
    // opportunity graph (galileo_opportunities / galileo_generations /
    // galileo_business_snapshots). There is no ACCOUNT/GLOBAL action here, so the
    // explicit-business requirement applies to all of them.
    //
    // `resolveProfileAndBusiness` silently substituted profile.primary_business_id
    // whenever the caller omitted the business, so a multi-business account was
    // answered with whichever business happened to be primary. Business is now
    // resolved through the canonical contract, which REFUSES an ambiguous request
    // (400 BUSINESS_CONTEXT_REQUIRED) instead of guessing.
    //
    // primary_business_id survives ONLY as the unambiguous default for an account
    // that owns exactly one business — deliberate initial selection, never a
    // substitute for a missing business on a multi-business account.
    const { data: actorProfile } = await sb
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    let businessId: string | null = null;
    try {
      ({ business_id: businessId } = await resolveActiveBusiness(
        sb,
        actorProfile,
        data?.active_business_id || data?.business_id,
        { action }
      ));
    } catch (bizErr) {
      return businessContextError(bizErr);
    }

    // A record addressed by id must belong to the resolved business. Without this,
    // an explicitly authorized business would still let an actor reach another
    // tenant's opportunity simply by supplying its id.
    const assertRecordInBusiness = (record: any, what: string) =>
      record?.business_id === businessId
        ? null
        : Response.json(
            { error: `${what} does not belong to the active business`, code: 'BUSINESS_SCOPE_MISMATCH' },
            { status: 403 }
          );

    // ── GENERATE OPPORTUNITIES (BIE-Consumer) ─────────────────────────────────
    if (action === 'generateOpportunities') {
      if (!businessId) return Response.json({ error: 'No business found' }, { status: 400 });

      // 1. Fetch canonical BIE recommendations
      const { recommendations, raw } = await fetchCanonicalRecommendations(sb, profileId, businessId);

      if (!recommendations || recommendations.length === 0) {
        return Response.json({
          opportunities: [],
          active_paths: [],
          generation: { confidence_score: 0 },
          message: 'There is not enough verified intelligence yet to generate opportunities. Complete assessments to unlock recommendations.',
          source: 'bie',
        });
      }

      // 2. Get existing opportunities to avoid duplicates
      const existingOps = await base44.asServiceRole.entities.galileo_opportunities.filter(
        { business_id: businessId, status: { $ne: 'archived' } }
      );
      const existingKeys = new Set((existingOps || []).map((o: any) => o.reasoning?.recommendation_key).filter(Boolean));

      // 3. Create generation record
      const genPayload = {
        profile_id: profileId,
        business_id: businessId,
        generation_type: data?.generation_type || 'initial_generation',
        trigger_source: data?.trigger_source || 'bie_consumer',
        generated_by: user.id,
        generated_opportunity_count: recommendations.length,
        selected_opportunity_ids: [],
        previous_top_3: data?.previous_top_3 || [],
        new_top_3: [],
        summary: `Generated ${recommendations.length} canonical BIE opportunities`,
        confidence_score: Math.round(recommendations.reduce((s: number, r: any) => s + r.confidence, 0) / Math.max(recommendations.length, 1)),
        created_at: new Date().toISOString(),
      };
      const generation = await base44.asServiceRole.entities.galileo_generations.create(genPayload);

      // 4. Create business snapshot
      const latestSnap = raw ? null : null; // raw already has snapshot data
      const snapPayload = {
        profile_id: profileId,
        business_id: businessId,
        generation_id: generation.id,
        snapshot_date: new Date().toISOString().split('T')[0],
        iq_score: raw?.iq_score || null,
        profit_gap: raw?.profit_gap_amount || null,
        value_gap: raw?.value_gap_amount || null,
        tax_gap: raw?.tax_gap_annual || null,
        operations_gap: raw?.operations_score || null,
        revenue: raw?.revenue || null,
        opportunity_count: recommendations.length,
        active_paths: 0,
        completed_paths: 0,
        completed_tasks: 0,
        snapshotted_at: new Date().toISOString(),
      };
      await base44.asServiceRole.entities.galileo_business_snapshots.create(snapPayload);

      // 5. Create opportunity records from canonical recommendations
      const created = [];
      for (const rec of recommendations) {
        // Skip if already exists (same recommendation_key)
        if (existingKeys.has(rec.recommendation_key)) continue;

        // Resolve strategy context for this recommendation
        const strategyContext = await resolveStrategyContext(sb, rec.recommendation_key, businessId, profileId, userRole, membershipStatus);

        // Check for advisor override
        const override = await checkAdvisorOverride(sb, rec.recommendation_key, businessId);

        // Skip suppressed recommendations
        if (override?.override_type === 'suppress_recommendation') continue;

        // Build supporting evidence
        const evidence = await buildSupportingEvidence(sb, profileId, businessId, rec.recommendation_key, raw);

        // Derive score from BIE priority (NOT independent scoring)
        const strategicScore = PRIORITY_SCORE[rec.priority] || 50;

        // Map recommendation to opportunity fields
        const categoryMap: Record<string, string> = {
          profit: 'profit', value: 'value', tax: 'tax',
          operations: 'operations', freedom: 'freedom',
        };

        const op = await base44.asServiceRole.entities.galileo_opportunities.create({
          profile_id: profileId,
          business_id: businessId,
          title: rec.title,
          description: rec.summary || `${rec.title} — estimated impact: $${Math.round(rec.estimatedImpact).toLocaleString()}`,
          category: categoryMap[rec.category] || rec.category,
          source: 'bie',
          expected_outcome: rec.relatedSprint?.label || rec.title,
          estimated_value_created: rec.estimatedImpact || 0,
          estimated_tax_savings: rec.category === 'tax' ? rec.estimatedImpact : 0,
          estimated_profit_improvement: rec.category === 'profit' ? rec.estimatedImpact : 0,
          impact_score: strategicScore,
          ease_score: 50, // Default — not independently scored
          urgency_score: rec.priority === 'high' ? 80 : 60,
          confidence_score: rec.confidence,
          time_to_value_score: 50, // Default — not independently scored
          strategic_opportunity_score: strategicScore,
          freedom_acceleration_score: rec.category === 'freedom' ? 80 : 50,
          status: 'available',
          converted_to_path: false,
          generation_id: generation.id,
          reasoning: {
            recommendation_key: rec.recommendation_key,
            bie_priority: rec.priority,
            bie_confidence: rec.confidence,
            bie_category: rec.category,
            strategy_options: strategyContext.strategy_options?.length || 0,
            confirmed_strategy: strategyContext.confirmed_strategy?.strategy_name || null,
            override_status: override?.override_type || null,
            source: 'bie',
          },
          industry_context: null,
          recommendation_reason: `Based on your ${rec.category} assessment data, this is a canonical BIE recommendation with ${rec.confidence}% confidence.`,
          evidence_sources: evidence.metrics.map((m: any) => ({ source: m.source, field: m.field, value: String(m.value) })),
          expected_impact: rec.formatted || `$${Math.round(rec.estimatedImpact).toLocaleString()}`,
        });
        created.push(op);
      }

      // 6. Auto-promote top 3 to active (by BIE priority)
      const sorted = [...created].sort((a, b) => (b.strategic_opportunity_score || 0) - (a.strategic_opportunity_score || 0));
      const top3 = sorted.slice(0, 3);
      for (const op of top3) {
        await base44.asServiceRole.entities.galileo_opportunities.update(op.id, { status: 'active' });
      }

      // 7. Update generation with top 3
      await base44.asServiceRole.entities.galileo_generations.update(generation.id, {
        selected_opportunity_ids: created.map(o => o.id),
        new_top_3: top3.map(o => o.id),
      });

      // 8. Re-fetch all opportunities to return sorted
      const allOpps = await base44.asServiceRole.entities.galileo_opportunities.filter(
        { business_id: businessId },
        '-strategic_opportunity_score',
        50
      );

      return Response.json({
        opportunities: allOpps || [],
        active_paths: top3,
        generation: { id: generation.id, confidence_score: genPayload.confidence_score },
        source: 'bie',
        canonical_count: recommendations.length,
      });
    }

    // ── GET OPPORTUNITIES (presentation — unchanged) ──────────────────────────
    if (action === 'getOpportunities') {
      if (!businessId) return Response.json({ opportunities: [] });
      const { status, limit } = data || {};
      const query: any = { business_id: businessId };
      if (status) query.status = status;
      const opps = await base44.asServiceRole.entities.galileo_opportunities.filter(query, '-strategic_opportunity_score', limit || 50);
      return Response.json({ opportunities: opps || [], source: 'bie' });
    }

    // ── GET ACTIVE PATHS (presentation — unchanged) ──────────────────────────
    if (action === 'getActivePaths') {
      if (!businessId) return Response.json({ active_paths: [] });
      const active = await base44.asServiceRole.entities.galileo_opportunities.filter({ business_id: businessId, status: 'active' }, '-strategic_opportunity_score', 3);
      return Response.json({ active_paths: active || [], source: 'bie' });
    }

    // ── PROMOTE OPPORTUNITY (presentation — unchanged) ─────────────────────────
    if (action === 'promoteOpportunity' || action === 'promoteToActive') {
      const { opportunityId, replacePathId } = data || {};
      const oppId = opportunityId || data?.opportunity_id;
      if (!oppId) return Response.json({ error: 'opportunityId required' }, { status: 400 });

      const opp = await base44.asServiceRole.entities.galileo_opportunities.get(oppId);
      if (!opp) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
      const oppMismatch = assertRecordInBusiness(opp, 'Opportunity');
      if (oppMismatch) return oppMismatch;

      if (replacePathId) {
        const replaced = await base44.asServiceRole.entities.galileo_opportunities.get(replacePathId).catch(() => null);
        const replaceMismatch = assertRecordInBusiness(replaced, 'Path being replaced');
        if (replaceMismatch) return replaceMismatch;
        await base44.asServiceRole.entities.galileo_opportunities.update(replacePathId, { status: 'archived' });
      }

      const activePaths = await base44.asServiceRole.entities.galileo_opportunities.filter({ business_id: businessId, status: 'active' }, '-strategic_opportunity_score', 10);
      if (activePaths && activePaths.length >= 3) {
        const lowest = activePaths[activePaths.length - 1];
        if (lowest && lowest.strategic_opportunity_score < (opp.strategic_opportunity_score || 0)) {
          await base44.asServiceRole.entities.galileo_opportunities.update(lowest.id, { status: 'available' });
        }
      }

      await base44.asServiceRole.entities.galileo_opportunities.update(oppId, { status: 'active' });
      const updated = await base44.asServiceRole.entities.galileo_opportunities.filter({ business_id: businessId, status: 'active' }, '-strategic_opportunity_score', 3);
      return Response.json({ active_paths: updated || [], sprint: opp, source: 'bie' });
    }

    // ── COMPLETE OPPORTUNITY (presentation — unchanged) ───────────────────────
    if (action === 'completeOpportunity') {
      const { opportunity_id } = data || {};
      if (!opportunity_id) return Response.json({ error: 'opportunity_id required' }, { status: 400 });
      const opp = await base44.asServiceRole.entities.galileo_opportunities.get(opportunity_id);
      if (!opp) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
      const mismatch = assertRecordInBusiness(opp, 'Opportunity');
      if (mismatch) return mismatch;
      await base44.asServiceRole.entities.galileo_opportunities.update(opportunity_id, { status: 'completed' });

      const available = await base44.asServiceRole.entities.galileo_opportunities.filter({ business_id: businessId, status: 'available' }, '-strategic_opportunity_score', 1);
      let promoted = null;
      if (available && available.length > 0) {
        await base44.asServiceRole.entities.galileo_opportunities.update(available[0].id, { status: 'active' });
        promoted = available[0];
      }

      const active = await base44.asServiceRole.entities.galileo_opportunities.filter({ business_id: businessId, status: 'active' }, '-strategic_opportunity_score', 3);
      return Response.json({ completed: opp, promoted, active_paths: active || [], replaced: !!promoted, source: 'bie' });
    }

    // ── ARCHIVE (presentation — unchanged) ────────────────────────────────────
    if (action === 'archiveOpportunity') {
      const { opportunity_id } = data || {};
      if (!opportunity_id) return Response.json({ error: 'opportunity_id required' }, { status: 400 });
      const opp = await base44.asServiceRole.entities.galileo_opportunities.get(opportunity_id);
      if (!opp) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
      const mismatch = assertRecordInBusiness(opp, 'Opportunity');
      if (mismatch) return mismatch;
      await base44.asServiceRole.entities.galileo_opportunities.update(opportunity_id, { status: 'archived' });
      return Response.json({ success: true, source: 'bie' });
    }

    // ── GET GENERATION HISTORY (presentation — unchanged) ──────────────────────
    if (action === 'getGenerationHistory') {
      if (!businessId) return Response.json({ generations: [] });
      const gens = await base44.asServiceRole.entities.galileo_generations.filter({ business_id: businessId }, '-created_at', 20);
      return Response.json({ generations: gens || [] });
    }

    // ── GET STRATEGIC TIMELINE (presentation — unchanged) ──────────────────────
    if (action === 'getStrategicTimeline') {
      if (!businessId) return Response.json({ timeline: [] });
      const opps = await base44.asServiceRole.entities.galileo_opportunities.filter({ business_id: businessId }, '-updated_date', 100);
      const timeline = (opps || []).map(o => ({
        id: o.id,
        date: o.updated_date || o.created_date,
        event: o.status === 'completed' ? 'Path Completed' : o.status === 'active' ? (o.converted_to_path ? 'Sprint Generated' : 'Opportunity Promoted') : o.status === 'available' ? 'Opportunity Generated' : o.status === 'archived' ? 'Opportunity Archived' : 'Status Changed',
        title: o.title,
        category: o.category,
        impact: o.estimated_value_created,
        confidence: o.confidence_score,
        strategic_score: o.strategic_opportunity_score,
        status: o.status,
        recommendation_key: o.reasoning?.recommendation_key || null,
      }));
      return Response.json({ timeline });
    }

    // ── EXPLAIN WHY (BIE-Consumer — uses canonical context) ────────────────────
    if (action === 'getExplainWhy') {
      const { opportunity_id } = data || {};
      if (!opportunity_id) return Response.json({ error: 'opportunity_id required' }, { status: 400 });

      const opp = await base44.asServiceRole.entities.galileo_opportunities.get(opportunity_id);
      if (!opp) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
      const mismatch = assertRecordInBusiness(opp, 'Opportunity');
      if (mismatch) return mismatch;

      const recommendationKey = opp.reasoning?.recommendation_key;
      let generation = null;
      if (opp.generation_id) {
        try { generation = await base44.asServiceRole.entities.galileo_generations.get(opp.generation_id); } catch { /* ignore */ }
      }

      // If we have a recommendation_key, resolve full BIE context
      let strategyContext = null;
      let override = null;
      let evidence = null;
      let canonicalRec = null;

      if (recommendationKey) {
        const { recommendations, raw } = await fetchCanonicalRecommendations(sb, profileId, businessId);
        canonicalRec = recommendations.find(r => r.recommendation_key === recommendationKey);
        strategyContext = await resolveStrategyContext(sb, recommendationKey, businessId, profileId, userRole, membershipStatus);
        override = await checkAdvisorOverride(sb, recommendationKey, businessId);
        evidence = await buildSupportingEvidence(sb, profileId, businessId, recommendationKey, raw);
      }

      return Response.json({
        opportunity: opp,
        recommendation_key: recommendationKey,
        canonical_recommendation: canonicalRec ? {
          id: canonicalRec.id,
          title: canonicalRec.title,
          priority: canonicalRec.priority,
          estimatedImpact: canonicalRec.estimatedImpact,
          confidence: canonicalRec.confidence,
          category: canonicalRec.category,
          formatted: canonicalRec.formatted,
        } : null,
        reasoning: opp.reasoning || {},
        recommendation_reason: opp.recommendation_reason || '',
        evidence_sources: opp.evidence_sources || [],
        expected_impact: opp.expected_impact || '',
        strategy_context: strategyContext,
        advisor_override: override,
        supporting_evidence: evidence,
        scores: {
          strategic: opp.strategic_opportunity_score,
          confidence: opp.confidence_score,
          note: 'Scores derive from BIE priority — not independently generated.',
        },
        generation_summary: generation?.summary || null,
        source: 'bie',
      });
    }

    // ── DRIFT ANALYSIS (presentation — unchanged) ──────────────────────────────
    if (action === 'getDriftAnalysis') {
      if (!businessId) return Response.json({ error: 'No business' }, { status: 400 });
      const gens = await base44.asServiceRole.entities.galileo_generations.filter({ business_id: businessId }, '-created_at', 2);
      if (!gens || gens.length < 2) return Response.json({ drift: null, message: 'Need at least 2 generations for drift analysis' });
      const [latest, previous] = gens;
      return Response.json({
        drift: {
          previous_generation: { id: previous.id, date: previous.created_date, top_3: previous.new_top_3 || [], summary: previous.summary },
          current_generation: { id: latest.id, date: latest.created_date, top_3: latest.new_top_3 || [], summary: latest.summary },
          changed: (latest.new_top_3 || []).some(id => !(previous.new_top_3 || []).includes(id)),
        },
      });
    }

    // ── GET BUSINESS SNAPSHOT (presentation — unchanged) ───────────────────────
    if (action === 'getBusinessSnapshot') {
      if (!businessId) return Response.json({ snapshot: null });
      const snaps = await base44.asServiceRole.entities.galileo_business_snapshots.filter({ business_id: businessId }, '-created_date', 1);
      return Response.json({ snapshot: snaps?.[0] || null });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});