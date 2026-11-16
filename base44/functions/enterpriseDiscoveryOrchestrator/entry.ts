/**
 * enterpriseDiscoveryOrchestrator
 * 
 * Orchestrates the Enterprise Discovery™ workflow:
 * 1. Creates business entity
 * 2. Triggers document analysis
 * 3. Prefills assessment answers from extracted data
 * 4. Manages assessment routing
 * 
 * Reuses existing extraction and analysis infrastructure.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

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
    const { action, data } = body;

    // Resolve profile
    const { data: profile } = await sb.from('profiles').select('id, primary_business_id').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
    const profileId = profile.id;

    // ── ACTION: createBusiness ───────────────────────────────────────────────
    if (action === 'createBusiness') {
      const { business_name, ownership_percentage, entity_type } = data || {};

      if (!business_name) {
        return Response.json({ error: 'business_name required' }, { status: 400 });
      }

      // Create business entity
      const { data: business, error: bizErr } = await sb.from('business_entities')
        .insert({
          business_name,
          industry: data?.industry || null,
          created_by: profileId,
        })
        .select()
        .single();

      if (bizErr) throw bizErr;

      // Create ownership record
      const { error: ownerErr } = await sb.from('business_owners')
        .insert({
          profile_id: profileId,
          business_id: business.id,
          ownership_percentage: ownership_percentage || 100,
          ownership_type: entity_type || 'direct_individual',
          is_primary_owner: true,
        });

      if (ownerErr) throw ownerErr;

      return Response.json({
        success: true,
        business,
        message: 'Business created successfully',
      });
    }

    // ── ACTION: analyzeDocuments ─────────────────────────────────────────────
    if (action === 'analyzeDocuments') {
      const { business_id } = data || {};
      // Phase 6.9B — canonical resolution. Was `business_id || profile.primary_business_id`.
      const { businessId: targetBusinessId, denial: bizDenial } = await requireBusinessContext(
        sb, profile, business_id, 'enterpriseDiscoveryOrchestrator.analyzeDocuments'
      );
      if (bizDenial) return bizDenial;

      if (!targetBusinessId) {
        return Response.json({ error: 'No business available' }, { status: 400 });
      }

      // Fetch uploaded documents for this business
      const { data: documents } = await sb.from('documents')
        .select('id, document_type, upload_status, file_url')
        .eq('profile_id', profileId)
        .eq('business_id', targetBusinessId)
        .eq('upload_status', 'completed');

      if (!documents || documents.length === 0) {
        return Response.json({
          success: true,
          documentsFound: 0,
          message: 'No documents uploaded yet',
          prefillData: null,
        });
      }

      // Trigger document analysis for each document
      const analysisPromises = documents.map(async (doc) => {
        try {
          await base44.functions.invoke('runDocumentExtraction', {
            document_id: doc.id,
            document_type: doc.document_type,
          });
          return { document_id: doc.id, status: 'analysis_triggered' };
        } catch (err) {
          return { document_id: doc.id, status: 'analysis_failed', error: err.message };
        }
      });

      const results = await Promise.allSettled(analysisPromises);

      // Wait a moment for extraction to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Fetch extracted fields
      const { data: extractedFields } = await sb.from('extracted_fields')
        .select('field_name, field_value, confidence_score, document_id')
        .in('document_id', documents.map(d => d.id))
        .in('review_status', ['accepted', 'corrected', 'pending']);

      // Build prefill data from extracted fields
      const prefillData = buildPrefillData(extractedFields || []);

      return Response.json({
        success: true,
        documentsFound: documents.length,
        analysisResults: results,
        prefillData,
        message: `Analyzed ${documents.length} documents`,
      });
    }

    // ── ACTION: getAssessmentRoute ───────────────────────────────────────────
    if (action === 'getAssessmentRoute') {
      const { business_id, completed_assessments } = data || {};
      // Phase 6.9B — canonical resolution. Was `business_id || profile.primary_business_id`.
      const { businessId: targetBusinessId, denial: bizDenial } = await requireBusinessContext(
        sb, profile, business_id, 'enterpriseDiscoveryOrchestrator.getAssessmentRoute'
      );
      if (bizDenial) return bizDenial;

      // Count total businesses
      const { data: ownershipRecords } = await sb.from('business_owners')
        .select('business_id')
        .eq('profile_id', profileId);

      const businessCount = ownershipRecords?.length || 0;
      const isFirstBusiness = businessCount <= 1;

      // Determine assessment path
      const assessmentPath = isFirstBusiness
        ? ['profit_gap', 'value_gap', 'recast_ebitda', 'tax_gap', 'operations_gap', 'freedom_assessment']
        : ['profit_gap', 'value_gap', 'recast_ebitda', 'operations_gap'];

      // Filter out completed assessments
      const completed = completed_assessments || [];
      const remaining = assessmentPath.filter(a => !completed.includes(a));
      const nextAssessment = remaining[0] || null;
      const isComplete = remaining.length === 0;

      return Response.json({
        businessCount,
        isFirstBusiness,
        assessmentPath,
        completed,
        remaining,
        nextAssessment,
        isComplete,
      });
    }

    // ── ACTION: getPrefilledAssessment ───────────────────────────────────────
    if (action === 'getPrefilledAssessment') {
      const { assessment_type, business_id } = data || {};
      // Phase 6.9B — canonical resolution. Was `business_id || profile.primary_business_id`.
      const { businessId: targetBusinessId, denial: bizDenial } = await requireBusinessContext(
        sb, profile, business_id, 'enterpriseDiscoveryOrchestrator.getPrefilledAssessment'
      );
      if (bizDenial) return bizDenial;

      if (!assessment_type) {
        return Response.json({ error: 'assessment_type required' }, { status: 400 });
      }

      // Fetch extracted fields
      const { data: extractedFields } = await sb.from('extracted_fields')
        .select('field_name, field_value, confidence_score, document_type')
        .eq('profile_id', profileId)
        .eq('business_id', targetBusinessId)
        .in('review_status', ['accepted', 'corrected']);

      const prefillData = buildPrefillData(extractedFields || [], assessment_type);

      return Response.json({
        assessment_type,
        prefillData,
        hasData: Object.keys(prefillData).length > 0,
      });
    }

    // ── ACTION: detectAdditionalEntities ─────────────────────────────────────
    if (action === 'detectAdditionalEntities') {
      const { data: extractedFields } = await sb.from('extracted_fields')
        .select('field_name, field_value, document_type')
        .eq('profile_id', profileId)
        .in('field_name', ['business_name', 'ein', 'entity_name']);

      const detectedEntities = [];
      const processedNames = new Set();

      extractedFields?.forEach(field => {
        const value = field.field_value;
        if (value && typeof value === 'string' && !processedNames.has(value)) {
          processedNames.add(value);
          detectedEntities.push({
            detected_name: value,
            source_document_type: field.document_type,
            confidence: 'potential',
          });
        }
      });

      return Response.json({
        detectedEntities,
        count: detectedEntities.length,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildPrefillData(extractedFields, assessmentType = null) {
  const prefill = {};
  const fieldMap = {
    'annual_revenue': 'p1_rev',
    'gross_profit': 'p1_gross_profit',
    'net_profit': 'p1_net_profit',
    'profit_margin': 'p1_mymargin',
    'enterprise_value': 'v2_ev',
    'ebitda': 'v2_ebitda',
    'recast_ebitda': 'v2_recast',
    'agi': 't3_agi',
    'entity_type': 't3_entity',
    'has_real_estate': 't3_prop',
    'has_retirement_plan': 't3_ret',
    'employee_count': 'o4_employees',
    'owner_hours_per_week': 'o4_hours',
  };

  extractedFields.forEach(field => {
    const mappedField = fieldMap[field.field_name];
    if (mappedField) {
      if (!assessmentType || assessmentTypeMatchesField(assessmentType, field.field_name)) {
        prefill[mappedField] = convertValue(field.field_value, mappedField);
      }
    }
  });

  return prefill;
}

function assessmentTypeMatchesField(assessmentType, fieldName) {
  const mapping = {
    'profit_gap': ['annual_revenue', 'gross_profit', 'net_profit', 'profit_margin'],
    'value_gap': ['enterprise_value', 'ebitda', 'recast_ebitda'],
    'tax_gap': ['agi', 'entity_type', 'has_real_estate', 'has_retirement_plan'],
    'operations_gap': ['employee_count', 'owner_hours_per_week'],
  };
  return mapping[assessmentType]?.includes(fieldName) || false;
}

function convertValue(value, targetField) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num)) return num;
    if (value.toLowerCase() === 'yes') return 'yes';
    if (value.toLowerCase() === 'no') return 'no';
  }
  return value;
}