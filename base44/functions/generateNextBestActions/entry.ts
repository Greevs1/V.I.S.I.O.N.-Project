/**
 * generateNextBestActions — Phase 12A.1: True BIE Consumer
 *
 * ARCHITECTURE:
 *   canonical BIE recommendations (from frontend via nbaRecommendations.js)
 *   → NBA selector (this function)
 *   → legacy NBA adapter
 *   → next_best_actions table
 *
 * This function NEVER constructs recommendations from raw metrics.
 * It ONLY:
 *   - authenticates the user
 *   - verifies business ownership / advisor assignment (explicit active_business_id)
 *   - validates the canonical recommendation schema
 *   - rejects cross-business payloads
 *   - ranks using existing metadata only (no new score, no LLM)
 *   - checks dependency blockers (pending clarifications) — only when they
 *     directly block the top recommendation
 *   - adapts to the legacy NBA response shape
 *   - upserts into next_best_actions
 *
 * No LLM calls. No recommendation templates. No raw metric reads.
 * No assessment_summary or dashboard_metrics queries.
 * No business_opportunities table.
 *
 * Transport: Option B — explicit frontend payload.
 *   { business_id, canonical_version, recommendations: [...] }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// ── Validate canonical recommendation schema ─────────────────────────────────
function validateRecommendation(rec, expectedBusinessId) {
  if (!rec || typeof rec !== 'object') return 'invalid: not an object';
  if (!rec.id || typeof rec.id !== 'string') return 'invalid: missing id';
  if (!rec.metricId || typeof rec.metricId !== 'string') return 'invalid: missing metricId';
  if (!rec.title || typeof rec.title !== 'string') return 'invalid: missing title';
  if (!rec.priority || !(rec.priority in PRIORITY_ORDER)) return 'invalid: missing/invalid priority';
  if (rec.estimatedImpact == null || typeof rec.estimatedImpact !== 'number') return 'invalid: missing estimatedImpact';
  if (rec.confidence == null || typeof rec.confidence !== 'number') return 'invalid: missing confidence';
  if (!rec.businessId || typeof rec.businessId !== 'string') return 'invalid: missing businessId';
  if (rec.businessId !== expectedBusinessId) return `invalid: businessId mismatch (${rec.businessId} ≠ ${expectedBusinessId})`;
  if (!Array.isArray(rec.dependencies)) return 'invalid: dependencies must be array';
  if (!rec.status || typeof rec.status !== 'string') return 'invalid: missing status';
  if (rec.canonicalVersion == null || typeof rec.canonicalVersion !== 'number') return 'invalid: missing canonicalVersion';
  return null; // valid
}

// ── Rank using existing metadata only ────────────────────────────────────────
// 1. canonical priority (high > medium > low)
// 2. estimated impact (desc)
// 3. confidence (desc)
// 4. dependency readiness (fewer unmet deps rank higher)
// 5. last updated (most recent first — tie-breaker only)
function rankRecommendations(recs) {
  return [...recs].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 3;
    const pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;

    const ia = a.estimatedImpact || 0;
    const ib = b.estimatedImpact || 0;
    if (ia !== ib) return ib - ia;

    const ca = a.confidence || 0;
    const cb = b.confidence || 0;
    if (ca !== cb) return cb - ca;

    const da = (a.dependencies || []).filter(d => !d.met).length;
    const db = (b.dependencies || []).filter(d => !d.met).length;
    if (da !== db) return da - db;

    return new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime();
  });
}

// ── Adapter: canonical recommendation → legacy NBA shape ─────────────────────
function adaptToLegacyNbaShape(rec) {
  const priorityScore = rec.priority === 'high' ? 90 : rec.priority === 'medium' ? 70 : 50;
  const impactLevel = rec.estimatedImpact >= 100000 ? 'critical' : rec.estimatedImpact >= 25000 ? 'high' : 'medium';
  const difficulty = rec.priority === 'high' ? 'medium' : 'easy';

  return {
    title: rec.title,
    description: rec.summary || rec.title,
    action_type: 'opportunity',
    category: rec.category,
    priority_score: priorityScore,
    estimated_impact: rec.estimatedImpact || null,
    expected_time_days: rec.priority === 'high' ? 14 : 30,
    difficulty_level: difficulty,
    reason: rec.summary || null,
    source: 'bie',
    source_record_id: null,
    status: 'recommended',
    updated_at: rec.lastUpdated || new Date().toISOString(),
    // Canonical fields
    recommendation_id: rec.id,
    metric_id: rec.metricId,
    priority: rec.priority,
    confidence: rec.confidence,
    related_assessment: rec.relatedAssessment || null,
    related_sprint: rec.relatedSprint || null,
    dependencies: rec.dependencies || [],
    canonical_version: rec.canonicalVersion || 1,
    impact_level: impactLevel,
    metadata: {
      recommendation_id: rec.id,
      metric_id: rec.metricId,
      source: 'bie',
      canonical_version: rec.canonicalVersion || 1,
      confidence_score: rec.confidence,
    },
  };
}

// ── Dependency blocker: does a pending clarification block the top rec? ──────
const METRIC_KEYWORDS = {
  profit_gap_amount: ['revenue', 'profit', 'income', 'ebitda', 'margin', 'gross', 'cogs'],
  value_gap_amount: ['value', 'valuation', 'worth', 'balance', 'asset', 'equity'],
  tax_gap_annual: ['tax', 'deduction', 'depreciation', 'amortization'],
  operations_score: ['operations', 'payroll', 'labor', 'overhead', 'expense', 'utilization'],
  freedom_score: ['operations', 'payroll', 'labor', 'time', 'hour'],
  recast_valuation_increase: ['ebitda', 'addback', 'add_back', 'recast', 'profit', 'expense', 'owner_comp'],
};

function isClarificationBlocker(pendingField, topRecMetricId) {
  if (!pendingField || !topRecMetricId) return false;
  const keywords = METRIC_KEYWORDS[topRecMetricId] || [];
  if (keywords.length === 0) return false;
  const haystack = (
    String(pendingField.field_category || '') + ' ' +
    String(pendingField.field_name || '') + ' ' +
    String(pendingField.field_label || '')
  ).toLowerCase();
  return keywords.some(kw => haystack.includes(kw));
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
    const { business_id, canonical_version, recommendations } = body;

    // ── Require explicit active business_id (BLOCKER 3) ──────────────────────
    if (!business_id) {
      return Response.json({ error: 'business_id required (active business from BusinessContext)' }, { status: 400 });
    }

    // ── Authenticate + resolve profile ────────────────────────────────────────
    const { data: profile } = await sb.from('profiles').select('id, app_role, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    // ── Verify business ownership / assignment (BLOCKER 3) ─────────────────────
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isAdvisor = profile.app_role === 'advisor';
    let authorized = false;

    if (isAdmin) {
      authorized = true;
    } else if (isAdvisor) {
      const { data: assignment } = await sb.from('advisor_assignments')
        .select('id').eq('advisor_profile_id', profile.id).eq('business_id', business_id).maybeSingle();
      authorized = !!assignment;
    } else {
      // Owner: check primary_business_id or business_owners table
      if (profile.primary_business_id === business_id) {
        authorized = true;
      } else {
        const { data: ownership } = await sb.from('business_owners')
          .select('id').eq('profile_id', profile.id).eq('business_id', business_id).maybeSingle();
        authorized = !!ownership;
      }
    }

    if (!authorized) {
      return Response.json({ error: 'Forbidden: not authorized for this business' }, { status: 403 });
    }

    // ── Validate + filter canonical recommendations ───────────────────────────
    const rawRecs = Array.isArray(recommendations) ? recommendations : [];
    const validRecs = [];
    const rejected = [];
    for (const rec of rawRecs) {
      const err = validateRecommendation(rec, business_id);
      if (err) { rejected.push({ id: rec?.id || 'unknown', error: err }); continue; }
      // Only actionable: has estimatedImpact or value
      if (rec.estimatedImpact == null && rec.value == null) continue;
      validRecs.push(rec);
    }

    if (rejected.length > 0) {
      console.warn('[generateNextBestActions] Rejected recommendations:', JSON.stringify(rejected));
    }

    if (validRecs.length === 0) {
      return Response.json({
        success: true, primary: null, secondaries: [],
        reason: 'insufficient_verified_intelligence',
        selected_type: null,
      });
    }

    // ── Rank canonical recommendations ────────────────────────────────────────
    const ranked = rankRecommendations(validRecs);
    const topRec = ranked[0];

    // ── Dependency blocker check (BLOCKER 5) ──────────────────────────────────
    // Check pending clarifications. Only surface as blocker if it directly
    // blocks the top recommendation's metric.
    const { data: pendingFields } = await sb.from('extracted_fields')
      .select('id, document_id, field_label, field_name, field_category, review_status')
      .eq('business_id', business_id)
      .eq('review_status', 'needs_clarification')
      .limit(10);

    if (pendingFields && pendingFields.length > 0) {
      const blockingField = pendingFields.find(f => isClarificationBlocker(f, topRec.metricId));
      if (blockingField) {
        const blockerReason = `Pending clarification on "${blockingField.field_label || blockingField.field_name || 'extracted field'}" feeds ${topRec.metricId}`;
        const blockerAction = {
          business_id, profile_id: profile.id,
          title: 'Clarify Extracted Data',
          description: `A field needs clarification before we can confirm your "${topRec.title}" recommendation. This ensures accurate financial analysis.`,
          action_type: 'data_review',
          category: 'data_quality',
          priority_score: 95,
          estimated_impact: null,
          expected_time_days: 1,
          difficulty_level: 'easy',
          reason: `This clarification directly supports your ${topRec.title} recommendation`,
          source: 'document_extraction',
          source_record_id: blockingField.document_id,
          status: 'recommended',
          due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
          metadata: {
            selected_type: 'dependency_blocker',
            blocked_recommendation_id: topRec.id,
            blocked_recommendation_title: topRec.title,
            blocker_reason: blockerReason,
            source: 'bie_blocker',
          },
        };

        // Upsert blocker
        const { data: existingBlocker } = await sb.from('next_best_actions')
          .select('id').eq('business_id', business_id)
          .eq('source_record_id', blockingField.document_id)
          .neq('status', 'dismissed').maybeSingle();

        let finalBlocker, blockerResult;
        if (existingBlocker) {
          const { data: updated } = await sb.from('next_best_actions')
            .update({ description: blockerAction.description, priority_score: 95, reason: blockerAction.reason, metadata: blockerAction.metadata, updated_at: new Date().toISOString() })
            .eq('id', existingBlocker.id).select().maybeSingle();
          finalBlocker = updated || { ...blockerAction, id: existingBlocker.id };
          blockerResult = 'updated';
        } else {
          const { data: inserted, error } = await sb.from('next_best_actions').insert(blockerAction).select().maybeSingle();
          if (error) console.error('[generateNextBestActions] blocker insert error:', error);
          finalBlocker = inserted || blockerAction;
          blockerResult = error ? error.message : 'inserted';
        }

        return Response.json({
          primary: finalBlocker, secondaries: [],
          reason: 'dependency_blocker',
          selected_type: 'dependency_blocker',
          recommendation_id: null,
          blocked_recommendation_id: topRec.id,
          blocker_reason: blockerReason,
          insert_result: blockerResult,
        });
      }
    }

    // ── No blocker: surface the top canonical recommendation ─────────────────
    // Check dismissed actions (advisor/user suppression by recommendation_id)
    const { data: dismissedActions } = await sb.from('next_best_actions')
      .select('title, metadata').eq('business_id', business_id).eq('status', 'dismissed')
      .order('updated_at', { ascending: false }).limit(20);
    const dismissedRecIds = new Set();
    const dismissedTitles = new Set();
    for (const a of (dismissedActions || [])) {
      if (a.metadata?.recommendation_id) dismissedRecIds.add(a.metadata.recommendation_id);
      if (a.title) dismissedTitles.add(a.title);
    }
    const actionable = ranked.filter(r => !dismissedRecIds.has(r.id) && !dismissedTitles.has(r.title));

    if (actionable.length === 0) {
      return Response.json({
        success: true, primary: null, secondaries: [],
        reason: 'all_recommendations_dismissed',
        selected_type: null,
      });
    }

    const primaryRec = actionable[0];
    const secondaryRecs = actionable.slice(1, 4);
    const primary = adaptToLegacyNbaShape(primaryRec);
    const secondaries = secondaryRecs.map(adaptToLegacyNbaShape);

    // Upsert primary into next_best_actions (dedup by recommendation_id in metadata)
    const actionPayload = {
      business_id, profile_id: profile.id,
      title: primary.title, description: primary.description,
      category: primary.category, action_type: primary.action_type,
      priority_score: primary.priority_score, estimated_impact: primary.estimated_impact,
      expected_time_days: primary.expected_time_days, difficulty_level: primary.difficulty_level,
      reason: primary.reason, source: 'bie', source_record_id: null,
      status: 'recommended', updated_at: new Date().toISOString(),
      metadata: primary.metadata,
    };

    const { data: existingByMeta } = await sb.from('next_best_actions')
      .select('id, status, metadata').eq('business_id', business_id).neq('status', 'dismissed')
      .order('updated_at', { ascending: false }).limit(20);
    const existing = (existingByMeta || []).find(a =>
      a.metadata?.recommendation_id === primary.recommendation_id || a.title === primary.title
    );

    let finalAction, insertResult;
    if (existing) {
      const { data: updated, error: updateErr } = await sb.from('next_best_actions')
        .update({
          title: actionPayload.title, description: actionPayload.description,
          priority_score: actionPayload.priority_score, estimated_impact: actionPayload.estimated_impact,
          reason: actionPayload.reason, source: 'bie', metadata: actionPayload.metadata,
          updated_at: actionPayload.updated_at,
        })
        .eq('id', existing.id).select().maybeSingle();
      if (updateErr) { insertResult = 'update_failed: ' + updateErr.message; finalAction = { ...actionPayload, id: existing.id }; }
      else { insertResult = 'updated'; finalAction = updated; }
    } else {
      const { data: inserted, error: insertError } = await sb.from('next_best_actions').insert(actionPayload).select().maybeSingle();
      if (insertError) { insertResult = 'failed: ' + insertError.message; finalAction = primary; }
      else { insertResult = 'inserted'; finalAction = inserted; }
    }

    return Response.json({
      primary: finalAction || primary,
      secondaries,
      total_candidates: actionable.length,
      filtered_dismissed: dismissedRecIds.size + dismissedTitles.size,
      insert_result: insertResult,
      source: 'bie',
      selected_type: 'recommendation',
      recommendation_id: primary.recommendation_id,
      canonical_version: canonical_version || 1,
    });
  } catch (error) {
    console.error('[generateNextBestActions] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});