/**
 * businessDNAService — Phase E
 *
 * Backend service for the Business DNA Foundation.
 *
 * All operations are business-scoped and backend-mediated.
 * Supabase is the sole system of record.
 *
 * AI proposes candidate patterns. Deterministic rules qualify them.
 * No candidate may silently become established.
 *
 * Constitution Compliance:
 *   Article I — One Truth (references evidence, never recalculates)
 *   Article V — Advisor Governance (AI proposes, humans confirm high-impact)
 *   Article XVII — Business DNA Authority (derived, never authoritative)
 *   Article XI — Business Isolation (patterns are business-scoped)
 *
 * Supported actions:
 *   getBusinessDNA, getPatterns, getPattern, generateCandidates,
 *   refreshDNA, getEvidence, confirmPattern, contestPattern,
 *   getEvolution, getClientSafeDNA
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { buildBusinessIntelligenceContract } from '../../shared/intelligenceContract/businessIntelligenceContract.ts';
import { resolveAuthCtx } from '../../shared/valuationEngine/valuationAuth.ts';
import {
  buildCandidatePrompt, getCandidateResponseSchema, processCandidateResponse,
  reconcileCandidatePattern, buildBusinessDNA, buildPatternEvolution,
  generatePatternId, deduplicateEvidenceByLineage, buildLineageRoot,
  isOwnerDNASafe, detectContradiction, applyContradiction,
  isPatternClientVisible, filterPatternsForClient, toClientSafePattern,
  DNA_FAMILIES, FAMILY_DEFINITIONS, PATTERN_STATUSES,
} from '../../shared/businessDNA/index.ts';
import type {
  BusinessDNAPattern, DNAEvidenceRef, EvidenceCatalog, AICandidateResponse,
} from '../../shared/businessDNA/index.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Certified identity resolution ────────────────────────────────────
    let ctx;
    try {
      ctx = await resolveAuthCtx(base44);
    } catch (e: any) {
      const status = e?.status || 401;
      return Response.json({ error: e?.message || 'Unauthorized' }, { status });
    }
    const { sb, profile, profileId, isSuperAdmin } = ctx;
    const isAdvisorOrAdmin = ['advisor', 'admin', 'super_admin'].includes(profile.app_role);

    // ── Strict business authorization (matches Decision Intelligence RLS) ──
    const authorizeBusiness = async (businessId: string): Promise<boolean> => {
      if (isSuperAdmin) return true;
      if (!businessId) return false;
      const { data: bo } = await sb
        .from('business_owners')
        .select('business_id, end_date')
        .eq('business_id', businessId)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (bo && (!bo.end_date || new Date(bo.end_date) > new Date())) return true;
      const { data: be } = await sb
        .from('business_entities')
        .select('id')
        .eq('id', businessId)
        .eq('assigned_advisor_id', profileId)
        .maybeSingle();
      if (be) return true;
      return false;
    };

    const body = await req.json().catch(() => ({}));
    const { action, data } = body;

    // ── Map DB row to BusinessDNAPattern ──────────────────────────────────
    function mapRowToPattern(row: any): BusinessDNAPattern {
      return {
        pattern_id: row.pattern_id,
        business_id: row.business_id,
        family: row.family,
        pattern_key: row.pattern_key,
        title: row.title,
        statement: row.statement,
        pattern_type: row.pattern_type,
        status: row.status,
        strength: row.strength,
        confidence: row.confidence,
        evidence_refs: row.evidence_refs || [],
        evidence_count: row.evidence_count || 0,
        independent_source_count: row.independent_source_count || 0,
        first_observed_at: row.first_observed_at,
        last_observed_at: row.last_observed_at,
        freshness: row.freshness,
        direction: row.direction,
        trend: row.trend || '',
        supporting_facts: row.supporting_facts || [],
        contradicting_facts: row.contradicting_facts || [],
        source_domains: row.source_domains || [],
        client_visibility: row.client_visibility,
        advisor_confirmed: row.advisor_confirmed || false,
        advisor_contested: row.advisor_contested || false,
        advisor_confirmed_by: row.advisor_confirmed_by || null,
        advisor_confirmed_at: row.advisor_confirmed_at || null,
        implications: row.implications || [],
        related_pattern_ids: row.related_pattern_ids || [],
        dna_questions: row.dna_questions || [],
        supersedes_pattern_id: row.supersedes_pattern_id || null,
        superseded_by_pattern_id: row.superseded_by_pattern_id || null,
        metadata: row.metadata || {},
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVIDENCE GATHERING (the core of DNA synthesis)
    // ═══════════════════════════════════════════════════════════════════════

    async function gatherEvidenceCatalog(businessId: string): Promise<EvidenceCatalog> {
      const [
        contractResult, memoriesResult, timelineResult, decisionsResult,
        outcomesResult, valuationResult, growthResult, sprintResult, vceResult,
      ] = await Promise.allSettled([
        buildBusinessIntelligenceContract(sb, businessId, profile.id),
        sb.from('business_memories').select('memory_id, category, title, summary, effective_date, importance, memory_status, client_visible')
          .eq('business_id', businessId).in('memory_status', ['confirmed', 'candidate'])
          .order('created_at', { ascending: false }).limit(20),
        sb.from('business_state_events').select('event_id, title, timestamp').eq('business_id', businessId)
          .order('timestamp', { ascending: false }).limit(20),
        sb.from('business_decisions').select('decision_id, title, decision_type, decision_status, decided_at, selected_option_id, options, decision_reason, importance')
          .eq('business_id', businessId).eq('decision_status', 'decided')
          .order('decided_at', { ascending: false }).limit(20),
        sb.from('business_decisions').select('decision_id, title, outcome_status, outcome_notes, decided_at, outcome_reviewed_at, outcome_review_date')
          .eq('business_id', businessId).not('outcome_status', 'is', null)
          .order('outcome_reviewed_at', { ascending: false }).limit(20),
        sb.from('business_valuations').select('id, current_value, baseline_value, status').eq('business_id', businessId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('growth_plan_initiatives').select('id, status, title').eq('business_id', businessId).limit(50),
        sb.from('ninety_day_sprints').select('id, status, progress_percent, path_title').eq('business_id', businessId)
          .order('created_at', { ascending: false }).limit(5),
        sb.from('value_creation_events').select('id, title, verified_tax_savings, verified_profit_improvement, verified_cash_flow_improvement, status, confidence_level, created_at')
          .eq('business_id', businessId).order('created_at', { ascending: false }).limit(20),
      ]);

      const safeVal = (s: any, fallback = null) => {
        if (s.status !== 'fulfilled') return fallback;
        const v = s.value;
        if (v && typeof v === 'object' && 'data' in v && 'error' in v) return v.data ?? fallback;
        return v ?? fallback;
      };

      const contract = safeVal(contractResult);
      const memories = safeVal(memoriesResult, []) || [];
      const timeline = safeVal(timelineResult, []) || [];
      const decisions = safeVal(decisionsResult, []) || [];
      const outcomes = safeVal(outcomesResult, []) || [];
      const valuation = safeVal(valuationResult);
      const growth = safeVal(growthResult, []) || [];
      const sprints = safeVal(sprintResult, []) || [];
      const vces = safeVal(vceResult, []) || [];

      // ── Build evidence refs with lineage roots ──────────────────────────
      const evidenceRefs: DNAEvidenceRef[] = [];
      let evCounter = 0;
      const makeEvId = () => `ev-${businessId.substring(0, 8)}-${evCounter++}`;

      // From Shared Contract (lineage root = underlying assessment source)
      if (contract) {
        if (contract.profitability?.profit_gap != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Profit Gap',
            source_reference: 'assessment_calculations:profit_gap',
            summary: `Profit gap: $${contract.profitability.profit_gap}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('assessment_calculations', 'profit_gap'),
            client_visible: true, advisor_confirmed: false,
          });
        }
        if (contract.tax?.annual_tax_gap != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Tax Gap',
            source_reference: 'assessment_calculations:tax_gap',
            summary: `Annual tax gap: $${contract.tax.annual_tax_gap}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('assessment_calculations', 'tax_gap'),
            client_visible: true, advisor_confirmed: false,
          });
        }
        if (contract.valuation?.current_value != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Current Value',
            source_reference: 'business_valuations:current_value',
            summary: `Current enterprise value: $${contract.valuation.current_value}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('business_valuations', 'current_value'),
            client_visible: true, advisor_confirmed: false,
          });
        }
        if (contract.valuation?.value_gap != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Value Gap',
            source_reference: 'assessment_calculations:value_gap',
            summary: `Value gap: $${contract.valuation.value_gap}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('assessment_calculations', 'value_gap'),
            client_visible: true, advisor_confirmed: false,
          });
        }
        if (contract.operations?.operations_score != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Operations Score',
            source_reference: 'assessment_calculations:operations_gap',
            summary: `Operations score: ${contract.operations.operations_score}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('assessment_calculations', 'operations_gap'),
            client_visible: true, advisor_confirmed: false,
          });
        }
        if (contract.freedom?.freedom_score != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Freedom Score',
            source_reference: 'assessment_calculations:freedom_assessment',
            summary: `Freedom score: ${contract.freedom.freedom_score}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('assessment_calculations', 'freedom_assessment'),
            client_visible: true, advisor_confirmed: false,
          });
        }
        if (contract.profitability?.revenue != null) {
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'shared_contract', source_name: 'Revenue',
            source_reference: 'extracted_fields:revenue',
            summary: `Revenue: $${contract.profitability.revenue}`,
            observed_at: contract.generated_at,
            lineage_root: buildLineageRoot('extracted_fields', 'revenue'),
            client_visible: true, advisor_confirmed: false,
          });
        }
      }

      // From Business Memory (each memory is its own lineage root)
      for (const m of memories) {
        evidenceRefs.push({
          evidence_id: makeEvId(), source_domain: 'business_memory',
          source_name: m.title, source_reference: m.memory_id,
          summary: m.summary, observed_at: m.effective_date || new Date().toISOString(),
          lineage_root: buildLineageRoot('business_memories', m.memory_id),
          client_visible: m.client_visible !== false, advisor_confirmed: m.memory_status === 'confirmed',
        });
      }

      // From Timeline (each event is its own lineage root)
      for (const t of timeline) {
        evidenceRefs.push({
          evidence_id: makeEvId(), source_domain: 'timeline',
          source_name: t.title, source_reference: t.event_id,
          summary: t.title, observed_at: t.timestamp,
          lineage_root: buildLineageRoot('business_state_events', t.event_id),
          client_visible: true, advisor_confirmed: false,
        });
      }

      // From Decisions (each decision is its own lineage root)
      for (const d of decisions) {
        const selectedOption = (d.options || []).find((o: any) => o.option_id === d.selected_option_id);
        evidenceRefs.push({
          evidence_id: makeEvId(), source_domain: 'decision',
          source_name: d.title, source_reference: d.decision_id,
          summary: `Decision: ${d.title} — selected "${selectedOption?.label || 'unknown'}"`,
          observed_at: d.decided_at || new Date().toISOString(),
          lineage_root: buildLineageRoot('business_decisions', d.decision_id),
          client_visible: false, advisor_confirmed: true,
        });
      }

      // From Decision Outcomes (each outcome is its own lineage root — high quality)
      for (const o of outcomes) {
        evidenceRefs.push({
          evidence_id: makeEvId(), source_domain: 'decision_outcome',
          source_name: o.title, source_reference: o.decision_id,
          summary: `Outcome: ${o.outcome_status} — ${o.outcome_notes || ''}`,
          observed_at: o.outcome_reviewed_at || o.decided_at || new Date().toISOString(),
          lineage_root: buildLineageRoot('business_decisions', `${o.decision_id}:outcome`),
          client_visible: false, advisor_confirmed: true,
        });
      }

      // From Value Creation Events (each VCE is its own lineage root)
      for (const v of vces) {
        if (v.status === 'verified' && v.confidence_level === 'verified') {
          const value = (v.verified_tax_savings || 0) + (v.verified_profit_improvement || 0) + (v.verified_cash_flow_improvement || 0);
          evidenceRefs.push({
            evidence_id: makeEvId(), source_domain: 'value_creation_event',
            source_name: v.title, source_reference: v.id,
            summary: `Verified value: $${value} — ${v.title}`,
            observed_at: v.created_at,
            lineage_root: buildLineageRoot('value_creation_events', v.id),
            client_visible: true, advisor_confirmed: true,
          });
        }
      }

      // From Sprints (each sprint is its own lineage root)
      for (const s of sprints) {
        evidenceRefs.push({
          evidence_id: makeEvId(), source_domain: 'sprint',
          source_name: s.path_title || 'Sprint', source_reference: s.id,
          summary: `Sprint: ${s.status}, ${s.progress_percent || 0}% progress`,
          observed_at: new Date().toISOString(),
          lineage_root: buildLineageRoot('ninety_day_sprints', s.id),
          client_visible: true, advisor_confirmed: false,
        });
      }

      // Assessment scores summary
      const assessment_scores = contract ? Object.entries(contract.assessments || {}).map(([type, a]: [string, any]) => ({
        assessment_type: type, completed: a.completed, score: a.score,
        estimated_opportunity_value: a.estimated_opportunity_value,
      })) : [];

      return {
        business_id: businessId,
        contract_summary: contract,
        memories: memories.map((m: any) => ({
          memory_id: m.memory_id, category: m.category, title: m.title, summary: m.summary,
          effective_date: m.effective_date, importance: m.importance, client_visible: m.client_visible !== false,
        })),
        timeline_events: timeline.map((t: any) => ({ event_id: t.event_id, title: t.title, timestamp: t.timestamp })),
        decisions: decisions.map((d: any) => {
          const opt = (d.options || []).find((o: any) => o.option_id === d.selected_option_id);
          return {
            decision_id: d.decision_id, title: d.title, decision_type: d.decision_type,
            decided_at: d.decided_at, selected_option_label: opt?.label || null,
            decision_reason: d.decision_reason || '', importance: d.importance,
          };
        }),
        decision_outcomes: outcomes.map((o: any) => ({
          decision_id: o.decision_id, title: o.title, outcome_status: o.outcome_status,
          outcome_notes: o.outcome_notes || '', decided_at: o.decided_at, outcome_reviewed_at: o.outcome_reviewed_at,
        })),
        valuation_summary: valuation ? {
          current_value: valuation.current_value, baseline_value: valuation.baseline_value,
          value_gap: contract?.valuation?.value_gap || null, status: valuation.status,
        } : null,
        growth_plan_summary: growth ? {
          total_initiatives: growth.length, active_initiatives: growth.filter((g: any) => g.status === 'active' || g.status === 'in_progress').length,
        } : null,
        sprint_evidence: sprints.map((s: any) => ({
          sprint_id: s.id, status: s.status, progress_percent: s.progress_percent || 0, path_title: s.path_title,
        })),
        value_creation_events: vces.filter((v: any) => v.status === 'verified').map((v: any) => ({
          event_id: v.id, title: v.title,
          verified_value: (v.verified_tax_savings || 0) + (v.verified_profit_improvement || 0) + (v.verified_cash_flow_improvement || 0),
          created_at: v.created_at,
        })),
        assessment_scores,
        evidence_refs: evidenceRefs,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════

    // ── refreshDNA (rebuild DNA from evidence) ───────────────────────────
    if (action === 'refreshDNA') {
      const { business_id } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!isAdvisorOrAdmin) return Response.json({ error: 'Forbidden: advisor or admin required' }, { status: 403 });

      // 1. Gather evidence
      const catalog = await gatherEvidenceCatalog(business_id);

      // 2. Load existing patterns
      const { data: existingRows, error: existErr } = await sb.from('business_dna_patterns')
        .select('*').eq('business_id', business_id).neq('status', 'retired');
      if (existErr) throw new Error(existErr.message);
      const existingPatterns = (existingRows || []).map(mapRowToPattern);

      // 3. Quiet state — if insufficient evidence, return sparse DNA
      if (catalog.evidence_refs.length < 2) {
        const dna = buildBusinessDNA(business_id, [], catalog);
        return Response.json({ dna, quiet_state: true, message: 'Insufficient evidence to establish patterns. DNA will become richer as evidence accumulates.' });
      }

      // 4. Call AI for candidate patterns
      const prompt = buildCandidatePrompt(catalog);
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        model: 'claude_sonnet_4_6',
        response_json_schema: getCandidateResponseSchema(),
      });

      const aiResponse = llmResult as unknown as AICandidateResponse;
      const { candidates, contradictions } = processCandidateResponse(aiResponse, catalog);

      // 5. Reconcile candidates with deterministic rules
      const newPatterns: BusinessDNAPattern[] = [];
      const patternsToUpdate: { existing: BusinessDNAPattern; newStatus: string }[] = [];

      for (const candidate of candidates) {
        const patternId = generatePatternId(business_id);
        const pattern = reconcileCandidatePattern(candidate, catalog, existingPatterns, patternId);

        // If contradiction detected, mark existing pattern
        if (pattern.supersedes_pattern_id) {
          const existing = existingPatterns.find((p) => p.pattern_id === pattern.supersedes_pattern_id);
          if (existing) {
            const newStatus = applyContradiction(existing, pattern.metadata?.contradiction_explanation?.includes('established') ? 'mark_weakening' : 'mark_contested');
            patternsToUpdate.push({ existing, newStatus });
          }
        }

        newPatterns.push(pattern);
      }

      // 6. Persist new patterns
      for (const pattern of newPatterns) {
        const insertData = {
          pattern_id: pattern.pattern_id, business_id: pattern.business_id,
          family: pattern.family, pattern_key: pattern.pattern_key,
          title: pattern.title, statement: pattern.statement,
          pattern_type: pattern.pattern_type, status: pattern.status,
          strength: pattern.strength, confidence: pattern.confidence,
          evidence_refs: pattern.evidence_refs, evidence_count: pattern.evidence_count,
          independent_source_count: pattern.independent_source_count,
          first_observed_at: pattern.first_observed_at, last_observed_at: pattern.last_observed_at,
          freshness: pattern.freshness, direction: pattern.direction, trend: pattern.trend,
          supporting_facts: pattern.supporting_facts, contradicting_facts: pattern.contradicting_facts,
          source_domains: pattern.source_domains, client_visibility: pattern.client_visibility,
          advisor_confirmed: pattern.advisor_confirmed, advisor_contested: pattern.advisor_contested,
          advisor_confirmed_by: pattern.advisor_confirmed_by, advisor_confirmed_at: pattern.advisor_confirmed_at,
          implications: pattern.implications, related_pattern_ids: pattern.related_pattern_ids,
          dna_questions: pattern.dna_questions, supersedes_pattern_id: pattern.supersedes_pattern_id,
          superseded_by_pattern_id: pattern.superseded_by_pattern_id, metadata: pattern.metadata,
        };
        await sb.from('business_dna_patterns').insert(insertData);
      }

      // 7. Update contradicted existing patterns
      for (const { existing, newStatus } of patternsToUpdate) {
        await sb.from('business_dna_patterns').update({
          status: newStatus, updated_at: new Date().toISOString(),
        }).eq('pattern_id', existing.pattern_id);
      }

      // 8. Load all patterns (existing + new) and build DNA
      const { data: allRows } = await sb.from('business_dna_patterns')
        .select('*').eq('business_id', business_id).neq('status', 'retired')
        .order('created_at', { ascending: false });
      const allPatterns = (allRows || []).map(mapRowToPattern);

      const dna = buildBusinessDNA(business_id, allPatterns, catalog);
      return Response.json({ dna, quiet_state: false, candidates_generated: newPatterns.length });
    }

    // ── getBusinessDNA ───────────────────────────────────────────────────
    if (action === 'getBusinessDNA') {
      const { business_id } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const { data: rows, error } = await sb.from('business_dna_patterns')
        .select('*').eq('business_id', business_id).neq('status', 'retired')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);

      const patterns = (rows || []).map(mapRowToPattern);

      // Build minimal catalog for evidence summary
      const catalog: EvidenceCatalog = {
        business_id, contract_summary: null, memories: [], timeline_events: [],
        decisions: [], decision_outcomes: [], valuation_summary: null,
        growth_plan_summary: null, sprint_evidence: [], value_creation_events: [],
        assessment_scores: [], evidence_refs: patterns.flatMap((p) => p.evidence_refs),
      };

      const dna = buildBusinessDNA(business_id, patterns, catalog);

      // Client-safe filtering for owners
      if (!isAdvisorOrAdmin) {
        const safePatterns = filterPatternsForClient(patterns);
        return Response.json({ dna: { ...dna, patterns: safePatterns as any }, client_safe: true });
      }

      return Response.json({ dna });
    }

    // ── getPatterns ──────────────────────────────────────────────────────
    if (action === 'getPatterns') {
      const { business_id, family, status } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      let query = sb.from('business_dna_patterns').select('*').eq('business_id', business_id).neq('status', 'retired');
      if (family) query = query.eq('family', family);
      if (status) query = query.eq('status', status);
      query = query.order('created_at', { ascending: false });

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      let patterns = (rows || []).map(mapRowToPattern);
      if (!isAdvisorOrAdmin) {
        patterns = patterns.filter((p) => isPatternClientVisible(p));
      }

      return Response.json({ patterns });
    }

    // ── getPattern ───────────────────────────────────────────────────────
    if (action === 'getPattern') {
      const { pattern_id } = data || {};
      if (!pattern_id) return Response.json({ error: 'pattern_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_dna_patterns')
        .select('*').eq('pattern_id', pattern_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Pattern not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const pattern = mapRowToPattern(row);
      if (!isAdvisorOrAdmin && !isPatternClientVisible(pattern)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      return Response.json({ pattern: isAdvisorOrAdmin ? pattern : toClientSafePattern(pattern) });
    }

    // ── generateCandidates (AI only — no persistence) ───────────────────
    if (action === 'generateCandidates') {
      const { business_id } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!isAdvisorOrAdmin) return Response.json({ error: 'Forbidden: advisor or admin required' }, { status: 403 });

      const catalog = await gatherEvidenceCatalog(business_id);
      if (catalog.evidence_refs.length < 2) {
        return Response.json({ candidates: [], quiet_state: true, message: 'Insufficient evidence for pattern generation.' });
      }

      const prompt = buildCandidatePrompt(catalog);
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt, model: 'claude_sonnet_4_6', response_json_schema: getCandidateResponseSchema(),
      });

      const aiResponse = llmResult as unknown as AICandidateResponse;
      const { candidates } = processCandidateResponse(aiResponse, catalog);

      // Return candidates WITHOUT persisting — advisor must review
      return Response.json({ candidates, evidence_count: catalog.evidence_refs.length });
    }

    // ── confirmPattern (advisor confirms — increases confidence) ───────
    if (action === 'confirmPattern') {
      const { pattern_id } = data || {};
      if (!pattern_id) return Response.json({ error: 'pattern_id required' }, { status: 400 });
      if (!isAdvisorOrAdmin) return Response.json({ error: 'Forbidden: advisor or admin required' }, { status: 403 });

      const { data: row, error } = await sb.from('business_dna_patterns')
        .select('*').eq('pattern_id', pattern_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Pattern not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const now = new Date().toISOString();
      const { data: updated, error: updErr } = await sb.from('business_dna_patterns')
        .update({
          advisor_confirmed: true, advisor_contested: false,
          advisor_confirmed_by: profile.id, advisor_confirmed_at: now,
          updated_at: now,
        }).eq('pattern_id', pattern_id).select('*').single();
      if (updErr) throw new Error(updErr.message);

      return Response.json({ pattern: mapRowToPattern(updated) });
    }

    // ── contestPattern (advisor contests — marks contested) ─────────────
    if (action === 'contestPattern') {
      const { pattern_id, reason } = data || {};
      if (!pattern_id) return Response.json({ error: 'pattern_id required' }, { status: 400 });
      if (!isAdvisorOrAdmin) return Response.json({ error: 'Forbidden: advisor or admin required' }, { status: 403 });

      const { data: row, error } = await sb.from('business_dna_patterns')
        .select('*').eq('pattern_id', pattern_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Pattern not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const now = new Date().toISOString();
      const { data: updated, error: updErr } = await sb.from('business_dna_patterns')
        .update({
          advisor_contested: true, status: 'contested',
          updated_at: now, metadata: { ...row.metadata, contest_reason: reason },
        }).eq('pattern_id', pattern_id).select('*').single();
      if (updErr) throw new Error(updErr.message);

      return Response.json({ pattern: mapRowToPattern(updated) });
    }

    // ── getEvolution (THEN / NOW / DIRECTION) ───────────────────────────
    if (action === 'getEvolution') {
      const { business_id, pattern_id } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const { data: rows, error } = await sb.from('business_dna_patterns')
        .select('*').eq('business_id', business_id).order('created_at', { ascending: true });
      if (error) throw new Error(error.message);

      const patterns = (rows || []).map(mapRowToPattern);

      if (pattern_id) {
        const evolution = buildPatternEvolution(patterns, pattern_id);
        return Response.json({ evolution });
      }

      // Return evolutions for all patterns
      const evolutions = patterns
        .filter((p) => p.status !== 'retired')
        .map((p) => buildPatternEvolution(patterns, p.pattern_id))
        .filter(Boolean);
      return Response.json({ evolutions });
    }

    // ── getClientSafeDNA ────────────────────────────────────────────────
    if (action === 'getClientSafeDNA') {
      const { business_id } = data || {};
      if (!business_id) return Response.json({ error: 'business_id required' }, { status: 400 });
      if (!await authorizeBusiness(business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const { data: rows, error } = await sb.from('business_dna_patterns')
        .select('*').eq('business_id', business_id).neq('status', 'retired')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);

      const patterns = (rows || []).map(mapRowToPattern);
      const safePatterns = filterPatternsForClient(patterns);

      return Response.json({ patterns: safePatterns });
    }

    // ── getEvidence (get evidence for a pattern) ────────────────────────
    if (action === 'getEvidence') {
      const { pattern_id } = data || {};
      if (!pattern_id) return Response.json({ error: 'pattern_id required' }, { status: 400 });

      const { data: row, error } = await sb.from('business_dna_patterns')
        .select('*').eq('pattern_id', pattern_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return Response.json({ error: 'Pattern not found' }, { status: 404 });
      if (!await authorizeBusiness(row.business_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });

      const pattern = mapRowToPattern(row);
      let evidence = pattern.evidence_refs;
      if (!isAdvisorOrAdmin) {
        evidence = evidence.filter((e) => e.client_visible);
      }

      return Response.json({
        evidence,
        evidence_count: pattern.evidence_count,
        independent_source_count: pattern.independent_source_count,
        lineage_groups: deduplicateEvidenceByLineage(pattern.evidence_refs).lineage_groups,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[businessDNAService] Error:', error?.message || error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});