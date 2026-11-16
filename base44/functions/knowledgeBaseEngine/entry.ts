/**
 * knowledgeBaseEngine — Knowledge Base Learning Engine
 *
 * Ingests documents, assessments, advisor notes, and Galileo insights
 * to build a structured knowledge base that enriches AI context.
 *
 * Actions:
 *   ingestFromDocuments — analyze uploaded documents & extract knowledge entries
 *   ingestFromInsights — convert Galileo opportunities/insights to KB entries
 *   search              — full-text search across knowledge base
 *   getContext          — return KB context for Galileo enrichment
 *   deleteEntry         — soft-delete a KB entry
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';
import { loadBusinessAssessmentSummaries } from '../../shared/intelligenceContract/assessmentLoader.ts';

function getSupabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getProfile(sb, email) {
  const { data } = await sb.from('profiles').select('id, primary_business_id, app_role').eq('email', email).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const profile = await getProfile(sb, user.email);
    const profileId = profile?.id;
    // Phase 6.9B — knowledge base entries are business-owned. Was
    // `profile.primary_business_id`, so a multi-business account always wrote and
    // read its PRIMARY business's knowledge regardless of the active selection.
    const { businessId, denial: businessDenial } = await requireBusinessContext(
      sb, profile, data?.active_business_id || data?.business_id, 'knowledgeBaseEngine'
    );
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    // ── INGEST FROM DOCUMENTS ───────────────────────────────────────────────
    if (action === 'ingestFromDocuments') {
      if (businessDenial) return businessDenial;
      if (!businessId) return Response.json({ error: 'No business found' }, { status: 400 });

      // Fetch completed documents with extracted data
      const { data: docs } = await sb.from('documents')
        .select('id, name, document_type, year')
        .eq('profile_id', profileId)
        .eq('upload_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!docs || docs.length === 0) {
        return Response.json({ ingested: 0, message: 'No completed documents found to ingest' });
      }

      const docIds = docs.map(d => d.id);

      // Fetch extracted/accepted fields for these docs
      const { data: fields } = await sb.from('extracted_fields')
        .select('field_name, accepted_value, accepted_normalized_value, field_category, source_document_type, document_id')
        .in('document_id', docIds)
        .in('review_status', ['accepted', 'corrected']);

      // Fetch existing KB entries to avoid duplicates
      const existingEntries = await base44.entities.KnowledgeBaseEntry.filter(
        { business_id: businessId, source_type: 'document' }, 'created_date', 200
      );
      const existingSourceIds = new Set((existingEntries || []).map(e => e.source_id));

      const entries = [];
      const docMap = {};
      docs.forEach(d => { docMap[d.id] = d; });

      for (const field of (fields || [])) {
        const value = field.accepted_normalized_value || field.accepted_value;
        if (!value || String(value).length < 2) continue;

        const sourceKey = `${field.document_id}:${field.field_name}`;
        if (existingSourceIds.has(sourceKey)) continue;

        const doc = docMap[field.document_id];
        const title = `${field.field_name.replace(/_/g, ' ')} — ${doc?.name || 'Document'}`;
        const content = `**Value**: ${value}\n**Category**: ${field.field_category || 'financial'}\n**Source**: ${doc?.name || 'Document'} (${doc?.document_type || 'other'}, ${doc?.year || 'unknown year'})`;

        entries.push({
          title,
          content,
          category: field.field_category || 'financial',
          source_type: 'document',
          source_id: sourceKey,
          source_name: doc?.name || 'Document',
          confidence_score: 85,
          business_id: businessId,
          tags: [field.field_name, doc?.document_type || 'financial'].filter(Boolean),
          status: 'published',
        });
        existingSourceIds.add(sourceKey);
      }

      if (entries.length > 0) {
        await base44.entities.KnowledgeBaseEntry.bulkCreate(entries);
      }

      return Response.json({
        ingested: entries.length,
        total_fields_reviewed: (fields || []).length,
        documents_processed: docs.length,
      });
    }

    // ── INGEST FROM INSIGHTS ────────────────────────────────────────────────
    if (action === 'ingestFromInsights') {
      if (businessDenial) return businessDenial;
      if (!businessId) return Response.json({ error: 'No business found' }, { status: 400 });

      // Fetch opportunities
      const opportunities = await base44.asServiceRole.entities.galileo_opportunities.filter(
        { business_id: businessId, status: { $ne: 'archived' } }, '-created_date', 30
      );

      // Fetch assessments (Supabase — Phase C.1: Base44 Assessment retired)
      const assessments = await loadBusinessAssessmentSummaries(sb, businessId);

      const existingEntries = await base44.entities.KnowledgeBaseEntry.filter(
        { business_id: businessId, source_type: { $in: ['galileo_insight', 'opportunity', 'assessment'] } },
        'created_date', 200
      );
      const existingSourceIds = new Set((existingEntries || []).map(e => e.source_id));

      const entries = [];

      // From opportunities
      for (const opp of (opportunities || [])) {
        if (existingSourceIds.has(`opp:${opp.id}`)) continue;
        entries.push({
          title: `Opportunity: ${opp.title}`,
          content: `**Description**: ${opp.description || ''}\n**Expected Outcome**: ${opp.expected_outcome || ''}\n**Score**: ${opp.strategic_opportunity_score || 'N/A'}\n**Category**: ${opp.category || 'general'}\n**Impact**: ${opp.impact_score || 'N/A'}\n**Ease**: ${opp.ease_score || 'N/A'}`,
          category: opp.category || 'strategy',
          source_type: 'opportunity',
          source_id: `opp:${opp.id}`,
          source_name: opp.title,
          confidence_score: opp.confidence_score || 70,
          business_id: businessId,
          tags: [opp.category, 'opportunity'].filter(Boolean),
          status: 'published',
        });
        existingSourceIds.add(`opp:${opp.id}`);
      }

      // From assessments
      for (const a of (assessments || [])) {
        if (existingSourceIds.has(`assessment:${a.id}`)) continue;
        const findings = (a.key_findings || a.summary || '')
          .split('\n').filter(Boolean).slice(0, 3).join('\n');
        if (!findings) continue;

        entries.push({
          title: `Assessment: ${a.assessment_type?.replace(/_/g, ' ') || 'Insight'}`,
          content: findings,
          category: 'strategy',
          source_type: 'assessment',
          source_id: `assessment:${a.id}`,
          source_name: a.assessment_type || 'Assessment',
          confidence_score: 75,
          business_id: businessId,
          tags: [a.assessment_type, 'assessment'].filter(Boolean),
          status: 'published',
        });
        existingSourceIds.add(`assessment:${a.id}`);
      }

      if (entries.length > 0) {
        await base44.entities.KnowledgeBaseEntry.bulkCreate(entries);
      }

      return Response.json({
        ingested: entries.length,
        opportunities_processed: (opportunities || []).length,
        assessments_processed: (assessments || []).length,
      });
    }

    // ── SEARCH ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      if (businessDenial) return businessDenial;
      const { query, category, limit } = data;
      if (!query) return Response.json({ entries: [] });

      let filter = { business_id: businessId, status: 'published' };
      if (category) filter.category = category;

      const all = await base44.entities.KnowledgeBaseEntry.filter(filter, '-created_date', limit || 50);
      const q = query.toLowerCase();

      const matched = (all || []).filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.content || '').toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      );

      return Response.json({ entries: matched, total: (all || []).length });
    }

    // ── GET CONTEXT (for Galileo enrichment) ────────────────────────────────
    if (action === 'getContext') {
      if (businessDenial) return businessDenial;
      if (!businessId) return Response.json({ entries: [] });

      const entries = await base44.entities.KnowledgeBaseEntry.filter(
        { business_id: businessId, status: 'published' }, '-created_date', 50
      );

      const byCategory = {};
      for (const e of (entries || [])) {
        const cat = e.category || 'general';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({
          title: e.title,
          content: e.content?.slice(0, 500),
          source: e.source_name,
          confidence: e.confidence_score,
          tags: e.tags,
        });
      }

      return Response.json({
        count: (entries || []).length,
        by_category: byCategory,
        top_tags: getTopTags(entries || []),
      });
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (action === 'deleteEntry') {
      if (businessDenial) return businessDenial;
      const { entry_id } = data;
      const entries = await base44.entities.KnowledgeBaseEntry.filter({ id: entry_id });
      if (!entries?.[0]) return Response.json({ error: 'Entry not found' }, { status: 404 });

      if (entries[0].business_id !== businessId && !isAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      await base44.entities.KnowledgeBaseEntry.update(entry_id, { status: 'archived' });
      return Response.json({ success: true });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[knowledgeBaseEngine] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getTopTags(entries, limit = 10) {
  const counts = {};
  for (const e of entries) {
    for (const t of (e.tags || [])) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}