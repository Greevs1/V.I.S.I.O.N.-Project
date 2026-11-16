/**
 * digitalTwinShadowPromotion — Phase 6D.1B
 *
 * THE PRODUCTION SHADOW REPORT. Read-only, admin-only, structurally incapable of
 * writing: it contains no INSERT, no UPDATE, no DELETE, no UPSERT and no RPC, and the
 * fact freeze is measured BEFORE and AFTER the evaluation so a reviewer can see, per
 * run, that nothing changed.
 *
 * It answers, for real production evidence: "What canonical Digital Twin fact WOULD
 * this evidence create?" — and it answers without creating anything.
 *
 * Actions:
 *   { action: 'shadow' }                     evaluate every business's evidence
 *   { action: 'shadow', businessId: '<id>' } evaluate one business
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { associationMaterialForDocument } from '../../shared/digitalTwin/preflight.ts';
import {
  evaluateShadowPromotion,
  summarizeShadow,
  SHADOW_PILOT_KEYS,
} from '../../shared/digitalTwin/shadowPromotion.ts';
import { SHADOW_VERSION, WARNING_LABELS } from '../../shared/digitalTwin/shadowContract.ts';
import { BLOCKER_LABELS } from '../../shared/digitalTwin/contract.ts';

const FACT_COLUMNS = 'id,business_id,fact_key,period_type,period_label,period_start,period_end,accounting_basis,fingerprint,superseded_at,supersedes_fact_id,value_numeric,verification_status';

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

    const freeze = async () => {
      const facts = await sb.from('business_facts').select('*', { count: 'exact', head: true });
      const evidence = await sb.from('business_fact_evidence').select('*', { count: 'exact', head: true });
      return {
        business_facts_rows: facts.count ?? 0,
        business_fact_evidence_rows: evidence.count ?? 0,
      };
    };

    // ── FACT FREEZE — BEFORE ────────────────────────────────────────────────
    const freezeBefore = await freeze();

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

    // Existing facts feed duplicate / correction / supersession SIMULATION only.
    // They are read, never written. Today this is expected to be empty (the freeze).
    const { data: existingFacts } = await sb.from('business_facts').select(FACT_COLUMNS);

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

      const observations = [...bizRows]
        .sort((a: any, b: any) => (String(a.id) < String(b.id) ? -1 : 1))
        .map((row: any) => ({
          observation: row,
          document: docById[row.document_id] || null,
          analysis: analysisByDoc[row.document_id] || null,
          association: materialByDoc[row.document_id] || {},
        }));

      const results = evaluateShadowPromotion({
        business: { businessId: bizId, businessName },
        observations,
        existingFacts: (existingFacts || []).filter((f: any) => String(f.business_id) === String(bizId)),
      });
      allResults.push(...results);

      const summary = summarizeShadow(results);
      perBusiness.push({
        business_id: bizId,
        business_name: businessName,
        observations_evaluated: results.length,
        by_decision: summary.by_decision,
        pilot_candidates: summary.pilot_candidates,
        by_blocker: summary.by_blocker,
        would_write_facts: summary.would_write_facts,
      });
    }

    const overall = summarizeShadow(allResults);

    // ── The reviewer's view: every pilot candidate, its decision and its reasons. ─
    const pilotCandidates = allResults
      .filter((r) => r.in_pilot || SHADOW_PILOT_KEYS.includes(String(r.fact_key)))
      .slice(0, 80)
      .map((r) => ({
        business_id: r.business_id,
        fact_key: r.fact_key,
        decision: r.decision,
        candidate_value: r.candidate_value,
        currency: r.currency,
        period_type: r.period_type,
        period_label: r.period_label,
        period_quality: r.period_quality,
        accounting_basis: r.accounting_basis,
        basis_required: r.basis_required,
        provenance_class: r.provenance_class,
        business_association: r.business_association,
        human_confirmation_state: r.human_confirmation_state,
        verification_state: r.verification_state,
        source_authority: r.source_authority,
        evidence_count: r.evidence_ids.length,
        fingerprint_outcome: r.fingerprint_outcome,
        blockers: r.blockers,
        blockers_explained: r.blockers.map((b: string) => BLOCKER_LABELS[b] || b),
        warnings: r.warnings,
        warnings_explained: r.warnings.map((w: string) => WARNING_LABELS[w] || w),
        resolver_trace: r.resolver_trace,
      }));

    // ── FACT FREEZE — AFTER (the certification the phase exists to make) ─────
    const freezeAfter = await freeze();
    const held = freezeBefore.business_facts_rows === freezeAfter.business_facts_rows
      && freezeBefore.business_fact_evidence_rows === freezeAfter.business_fact_evidence_rows
      && freezeAfter.business_facts_rows === 0
      && freezeAfter.business_fact_evidence_rows === 0;

    return Response.json({
      shadow_version: SHADOW_VERSION,
      writes_performed: false,
      pilot_keys: SHADOW_PILOT_KEYS,
      fact_freeze_before: freezeBefore,
      fact_freeze_after: freezeAfter,
      fact_freeze_held: held,
      observations_evaluated: overall.observations_evaluated,
      by_decision: overall.by_decision,
      pilot_candidates_summary: overall.pilot_candidates,
      by_blocker: overall.by_blocker,
      by_provenance: overall.by_provenance,
      by_period_quality: overall.by_period_quality,
      by_association: overall.by_association,
      by_verification_state: overall.by_verification_state,
      would_write_facts: overall.would_write_facts,
      would_write_evidence_rows: overall.would_write_evidence_rows,
      businesses: perBusiness,
      pilot_candidates: pilotCandidates,
    });
  } catch (error: any) {
    console.error('[digitalTwinShadowPromotion] Error:', error?.message);
    return Response.json({ error: error?.message || 'shadow evaluation failed' }, { status: 500 });
  }
});