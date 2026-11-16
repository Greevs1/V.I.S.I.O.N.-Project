/**
 * createSampleExtractedFields
 * 
 * Creates sample extracted_fields rows for the most recently uploaded document.
 * Used for testing the review queue without AI extraction.
 * 
 * Sample fields for profit_and_loss:
 * - annual_revenue
 * - gross_profit
 * - net_profit
 * - total_expenses
 * - owner_compensation
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get user's profile
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr) throw new Error(profileErr.message);
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const profileId = profile.id;
    // Phase 6.9B — canonical resolution. Was `profile.primary_business_id`.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, null, 'createSampleExtractedFields'
    );
    if (bizDenial) return bizDenial;

    // Get most recent profit_and_loss document
    const { data: recentDoc, error: docErr } = await sb
      .from('documents')
      .select('id, document_type, name')
      .eq('profile_id', profileId)
      .eq('document_type', 'profit_and_loss')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (docErr) throw new Error(docErr.message);
    if (!recentDoc) {
      return Response.json({ 
        error: 'No profit_and_loss document found. Please upload one first.',
        created: false 
      }, { status: 404 });
    }

    // Get or create document_analysis row
    const { data: analysis, error: analysisErr } = await sb
      .from('document_analysis')
      .select('id')
      .eq('document_id', recentDoc.id)
      .maybeSingle();

    let analysisId = analysis?.id;
    if (!analysisId) {
      const { data: newAnalysis, error: createAnalysisErr } = await sb
        .from('document_analysis')
        .insert({
          document_id: recentDoc.id,
          profile_id: profileId,
          business_id: businessId,
          document_type: recentDoc.document_type,
          analysis_status: 'completed',
          status: 'completed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (createAnalysisErr) throw new Error(createAnalysisErr.message);
      analysisId = newAnalysis.id;
    }

    // Sample extracted fields for profit_and_loss
    const sampleFields = [
      {
        field_name: 'annual_revenue',
        field_label: 'Annual Revenue',
        field_value: '$1,250,000',
        normalized_value: 1250000,
        field_type: 'currency',
        source_document_type: 'profit_and_loss',
        source_page: 1,
        confidence_score: 95,
        review_status: 'pending_review',
        notes: null,
      },
      {
        field_name: 'gross_profit',
        field_label: 'Gross Profit',
        field_value: '$625,000',
        normalized_value: 625000,
        field_type: 'currency',
        source_document_type: 'profit_and_loss',
        source_page: 1,
        confidence_score: 92,
        review_status: 'pending_review',
        notes: null,
      },
      {
        field_name: 'net_profit',
        field_label: 'Net Profit',
        field_value: '$187,500',
        normalized_value: 187500,
        field_type: 'currency',
        source_document_type: 'profit_and_loss',
        source_page: 1,
        confidence_score: 88,
        review_status: 'pending_review',
        notes: null,
      },
      {
        field_name: 'total_expenses',
        field_label: 'Total Expenses',
        field_value: '$1,062,500',
        normalized_value: 1062500,
        field_type: 'currency',
        source_document_type: 'profit_and_loss',
        source_page: 1,
        confidence_score: 90,
        review_status: 'pending_review',
        notes: null,
      },
      {
        field_name: 'owner_compensation',
        field_label: 'Owner Compensation',
        field_value: '$150,000',
        normalized_value: 150000,
        field_type: 'currency',
        source_document_type: 'profit_and_loss',
        source_page: 1,
        confidence_score: 85,
        review_status: 'pending_review',
        notes: null,
      },
    ];

    // Insert sample extracted fields
    const extractedFieldsToInsert = sampleFields.map(field => ({
      ...field,
      document_id: recentDoc.id,
      document_analysis_id: analysisId,
      profile_id: profileId,
      business_id: businessId,
      metadata: { created_by: 'sample_data_generator', created_for: 'testing' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data: insertedFields, error: insertErr } = await sb
      .from('extracted_fields')
      .insert(extractedFieldsToInsert)
      .select();

    if (insertErr) throw new Error(insertErr.message);

    return Response.json({
      success: true,
      created: true,
      count: insertedFields?.length || 0,
      document: {
        id: recentDoc.id,
        name: recentDoc.name,
        type: recentDoc.document_type,
      },
      analysis_id: analysisId,
      fields: insertedFields?.map(f => ({
        field_name: f.field_name,
        field_label: f.field_label,
        field_value: f.field_value,
        normalized_value: f.normalized_value,
        confidence_score: f.confidence_score,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message, created: false }, { status: 500 });
  }
});