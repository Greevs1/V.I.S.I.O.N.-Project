/**
 * adminUploadDocument - Admin-scoped document upload
 * 
 * Allows admins to upload documents on behalf of any user/business.
 * Files are stored under admin-scoped paths and linked to target user's profile.
 * 
 * Required payload:
 * - target_profile_id: The profile ID of the user this document is for
 * - target_business_id: The business ID this document belongs to
 * - file_name, file_type, file_size, document_type, year, base64File
 * 
 * Document types include admin-specific types:
 * - agreement, client_agreement, engagement_letter, verification_document
 * - Plus all standard financial document types
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VALID_DOCUMENT_TYPES = [
  // Admin-specific
  'agreement',
  'client_agreement',
  'engagement_letter',
  'verification_document',
  // Standard financial
  'business_tax_return',
  'personal_tax_return',
  'profit_and_loss',
  'balance_sheet',
  'debt_schedule',
  'payroll_report',
  'insurance_document',
  'entity_document',
  'buy_sell_agreement',
  'estate_document',
  'other'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin/advisor access
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { 
      target_profile_id, 
      target_business_id,
      file_name, 
      file_type, 
      file_size, 
      document_type, 
      year, 
      base64_file 
    } = body;

    // Validate required fields
    if (!target_profile_id) {
      return Response.json({ error: 'target_profile_id is required' }, { status: 400 });
    }
    if (!file_name) {
      return Response.json({ error: 'file_name is required' }, { status: 400 });
    }
    if (!file_type) {
      return Response.json({ error: 'file_type is required' }, { status: 400 });
    }
    if (!base64_file) {
      return Response.json({ error: 'file content is required' }, { status: 400 });
    }

    // Validate document type
    const docType = document_type || 'other';
    if (!VALID_DOCUMENT_TYPES.includes(docType)) {
      return Response.json({ 
        error: `Invalid document_type. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` 
      }, { status: 400 });
    }

    // Get admin's profile
    const { data: adminProfile, error: adminProfileErr } = await sb
      .from('profiles')
      .select('id, email')
      .eq('email', user.email)
      .maybeSingle();

    if (adminProfileErr || !adminProfile) {
      return Response.json({ error: 'Admin profile not found' }, { status: 404 });
    }

    // Verify target profile exists
    const { data: targetProfile, error: targetProfileErr } = await sb
      .from('profiles')
      .select('id, email, app_role')
      .eq('id', target_profile_id)
      .maybeSingle();

    if (targetProfileErr || !targetProfile) {
      return Response.json({ error: 'Target profile not found' }, { status: 404 });
    }

    // Upload to Supabase Storage under admin-scoped path
    const bucketName = 'documents';
    const fileExt = file_name.split('.').pop() || 'pdf';
    const safeFileName = `${Date.now()}_${file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = `admin/${adminProfile.id}/${target_profile_id}/${target_business_id || 'no-business'}/${safeFileName}`;

    // Convert base64 to blob
    const base64Data = base64_file.split(',')[1] || base64_file;
    const blob = await fetch(`data:${file_type};base64,${base64Data}`).then(r => r.blob());

    let actualStoragePath = null;
    let actualBucket = null;
    
    try {
      const { data: uploadData, error: uploadError } = await sb.storage
        .from(bucketName)
        .upload(storagePath, blob, {
          contentType: file_type,
          upsert: false,
          duplex: 'half'
        });

      if (uploadError) {
        console.warn('[adminUploadDocument] Storage upload failed:', uploadError.message);
      } else {
        actualStoragePath = uploadData.path;
        actualBucket = bucketName;
      }
    } catch (storageErr) {
      console.warn('[adminUploadDocument] Storage upload exception:', storageErr.message);
    }

    // Get signed URL for private file
    let fileUrl = null;
    if (actualStoragePath && actualBucket) {
      const { data: signedUrlData } = await sb.storage
        .from(actualBucket)
        .createSignedUrl(actualStoragePath, 86400); // 24 hours
      fileUrl = signedUrlData?.signedUrl || null;
    }

    // Create documents row with admin metadata
    const docData = {
      profile_id: target_profile_id,
      business_id: target_business_id || null,
      name: file_name,
      document_type: docType,
      file_path: actualStoragePath || null,
      file_url: fileUrl || null,
      file_size: file_size || null,
      year: year || null,
      status: 'uploaded',
      upload_status: actualStoragePath ? 'pending_analysis' : 'uploaded',
      uploaded_by: adminProfile.id,
      upload_source: 'admin',
      storage_bucket: 'documents',
      file_scope: 'client_document',
      uploaded_from: 'admin_client_workspace',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Insert documents row
    const { data: document, error: docError } = await sb
      .from('documents')
      .insert(docData)
      .select()
      .single();

    if (docError) {
      throw new Error(`Document insert failed: ${docError.message}`);
    }

    // Create document_analysis row
    const analysisData = {
      document_id: document.id,
      profile_id: target_profile_id,
      business_id: target_business_id || null,
      document_type: docType,
      analysis_status: 'queued',
      status: 'queued',
      confidence_score: null,
      extracted_summary: null,
      extracted_data: {},
      missing_fields: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: analysis, error: analysisError } = await sb
      .from('document_analysis')
      .insert(analysisData)
      .select('id')
      .single();

    if (analysisError) {
      console.error('[adminUploadDocument] document_analysis insert failed:', analysisError.message);
    }

    return Response.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        document_type: document.document_type,
        file_path: document.file_path,
        file_url: document.file_url,
        file_size: document.file_size,
        uploaded_by: document.uploaded_by,
        upload_source: document.upload_source,
        status: document.status,
        upload_status: document.upload_status,
        created_at: document.created_at,
      },
      analysis: analysis ? { id: analysis.id, status: 'queued' } : null,
      storage: actualStoragePath ? {
        bucket: actualBucket,
        path: actualStoragePath,
      } : { status: 'pending', note: 'Storage upload failed' }
    });

  } catch (error) {
    console.error('[adminUploadDocument] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});