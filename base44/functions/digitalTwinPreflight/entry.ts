/**
 * digitalTwinPreflight — Phase 6D.1A
 *
 * THE READ-ONLY SHADOW EVALUATOR. It answers, for real production evidence:
 *
 *     "Could this observation safely be CONSIDERED by a future promotion engine?"
 *
 * It does NOT promote, and it CANNOT: this function contains no INSERT, no UPDATE
 * and no DELETE, and no code path reaching `business_facts`. The fact freeze is
 * reported back on every run so a reviewer can see it held.
 *
 * ACCESS: canonical admin / super_admin only. This is an audit surface, not an
 * owner-facing one, and it reuses the platform's existing role gate rather than
 * introducing a second authorization model. It reads through the service role and
 * never accepts an actor-supplied business id as proof of anything — the business
 * scoping in the evidence itself is what the pre-flight evaluates.
 *
 * Actions:
 *   { action: 'shadow' }                    evaluate every business's evidence
 *   { action: 'shadow', businessId: '<id>' } evaluate one business
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  evaluatePromotionPreflight,
  summarizePreflight,
  associationMaterialForDocument,
} from '../../shared/digitalTwin/preflight.ts';
import { PROMOTION_BLOCKERS, BLOCKER_LABELS } from '../../shared/digitalTwin/contract.ts';

/** The pilot concepts this phase measures. No other concept is reported as ready. */
const PILOT_KEYS = ['revenue', 'gross_profit'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const requestedBusinessId = body?.businessId ? String(body.businessId) : null;

    // ── FACT FREEZE, MEASURED (never assumed) ────────────────────────────────
    const facts = await sb.from('business_facts').select('*', { count: 'exact', head: true });
    const evidence = await sb.from('business_fact_evidence').select('*', { count: 'exact', head: true });
    const factFreeze = {
      business_facts_rows: facts.count ?? 0,
      business_fact_evidence_rows: evidence.count ?? 0,
      held: (facts.count ?? 0) === 0 && (evidence.count ?? 0) === 0,
    };

    // ── Evidence, its documents and its analyses (READ ONLY) ────────────────
    let fieldsQuery = sb.from('extracted_fields').select('*');
    if (requestedBusinessId) fieldsQuery = fieldsQuery.eq('business_id', requestedBusinessId);
    const { data: fields, error: fieldsError } = await fieldsQuery;
    if (fieldsError) return Response.json({ error: fieldsError.message }, { status: 500 });
    const rows = fields || [];

    const bizIds = [...new Set(rows.map((r: any) => r.business_id).filter(Boolean))];

    const { data: entities } = await sb.from('business_entities').select('*');
    const entityById: Record<string, any> = {};
    for (const e of entities || []) entityById[String(e.id)] = e;

    const docIds = [...new Set(rows.map((r: any) => r.document_id).filter(Boolean))];
    const { data: documents } = docIds.length
      ? await sb.from('documents').select('*').in('id', docIds)
      : { data: [] };
    const docById: Record<string, any> = {};
    for (const d of documents || []) docById[String(d.id)] = d;

    const { data: analyses } = docIds.length
      ? await sb.from('document_analysis').select('*').in('document_id', docIds)
      : { data: [] };
    const analysisByDoc: Record<string, any> = {};
    for (const a of analyses || []) if (!analysisByDoc[String(a.document_id)]) analysisByDoc[String(a.document_id)] = a;

    // ── Evaluate. Same input → same output; no clock, no randomness. ─────────
    const allResults: any[] = [];
    const perBusiness: any[] = [];

    for (const bizId of bizIds) {
      const bizRows = rows.filter((r: any) => r.business_id === bizId);
      const biz = entityById[bizId] || {};
      const businessName = biz.business_name ?? biz.name ?? null;

      const materialByDoc: Record<string, any> = {};
      for (const docId of [...new Set(bizRows.map((r: any) => r.document_id).filter(Boolean))]) {
        const docRows = bizRows.filter((r: any) => r.document_id === docId);
        materialByDoc[docId] = associationMaterialForDocument(docRows, analysisByDoc[docId] || null);
      }

      const results = bizRows.map((row: any) => evaluatePromotionPreflight({
        observation: row,
        document: docById[row.document_id] || null,
        analysis: analysisByDoc[row.document_id] || null,
        business: { businessId: bizId, businessName },
        association: materialByDoc[row.document_id] || {},
      }));

      allResults.push(...results);
      const summary = summarizePreflight(results);
      perBusiness.push({
        business_id: bizId,
        business_name: businessName,
        evidence_rows: bizRows.length,
        evaluated: summary.evaluated,
        promotion_ready: summary.promotion_ready,
        by_blocker: summary.by_blocker,
        pilot: Object.fromEntries(PILOT_KEYS.map((k) => [k, summary.by_canonical_key[k] || { evaluated: 0, promotion_ready: 0 }])),
      });
    }

    const overall = summarizePreflight(allResults);

    // ── The reviewer's view: every pilot candidate, its verdict and its reasons. ─
    // Values are returned ONLY for a candidate that is promotion_ready — which this
    // phase expects to be none. Everything else reports its state, not its amount.
    const pilotCandidates = allResults
      .filter((r) => PILOT_KEYS.includes(r.canonical_key))
      .slice(0, 60)
      .map((r) => ({
        canonical_key: r.canonical_key,
        evidence_origin: r.evidence_origin,
        business_association: r.business_association,
        period_quality: r.period_quality,
        period_label: r.period?.label ?? null,
        period_raw: r.period?.raw ?? null,
        basis: r.basis,
        basis_required: r.basis_required,
        review_state: r.review_state,
        verification_state: r.verification_state,
        source_authority: r.source_authority,
        promotion_ready: r.promotion_ready,
        blockers: r.blockers,
        blockers_explained: r.blockers.map((b: string) => BLOCKER_LABELS[b] || b),
        value: r.promotion_ready ? r.value : null,
      }));

    return Response.json({
      pre_flight: overall.pre_flight_version,
      writes_performed: false,
      fact_freeze: factFreeze,
      evaluated: overall.evaluated,
      promotion_ready: overall.promotion_ready,
      by_blocker: overall.by_blocker,
      by_canonical_key: overall.by_canonical_key,
      pilot_keys: PILOT_KEYS,
      pilot_ready_counts: Object.fromEntries(PILOT_KEYS.map((k) => [k, overall.by_canonical_key[k]?.promotion_ready ?? 0])),
      businesses: perBusiness,
      pilot_candidates: pilotCandidates,
      /** If this is ever non-empty, STOP and inspect before any promotion work. */
      ready_candidates: overall.ready_candidates,
      blocker_vocabulary: Object.values(PROMOTION_BLOCKERS),
    });
  } catch (error: any) {
    console.error('[digitalTwinPreflight] Error:', error?.message);
    return Response.json({ error: error?.message || 'pre-flight failed' }, { status: 500 });
  }
});