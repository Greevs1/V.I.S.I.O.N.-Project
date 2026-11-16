/**
 * adminUploadLibraryFile — Admin-only upload to consulting_library_files bucket
 *
 * This is the SEPARATE pipeline for Admin → Files.
 * Files go to consulting_library_files bucket (not documents).
 * Metadata: file_scope=consulting_library, uploaded_from=admin_files.
 *
 * Payload: fileName, fileType, fileSize, documentType, base64File, year (optional)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'consulting_library_files';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTENSIONS = new Set(['pdf','csv','xls','xlsx','doc','docx','png','jpg','jpeg','webp','pptx','ppt','txt','zip']);

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
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { fileName, fileType, fileSize, documentType, base64File, year } = body;

    if (!fileName) return Response.json({ error: 'fileName is required' }, { status: 400 });
    if (!base64File) return Response.json({ error: 'base64File is required' }, { status: 400 });

    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return Response.json({ error: `Unsupported extension: .${ext}` }, { status: 400 });
    }
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: 'File exceeds 50 MB limit' }, { status: 400 });
    }

    const docType = documentType || 'other';

    // Ensure bucket exists
    try {
      await sb.storage.getBucket(BUCKET);
    } catch {
      await sb.storage.createBucket(BUCKET, { public: false });
    }

    // Get admin profile
    const { data: adminProfile } = await sb
      .from('profiles')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    const adminId = adminProfile?.id || null;

    // Upload file
    const base64Data = base64File.includes(',') ? base64File.split(',')[1] : base64File;
    const mimeType = fileType || 'application/octet-stream';
    const blob = await fetch(`data:${mimeType};base64,${base64Data}`).then(r => r.blob());

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `library/${adminId || 'system'}/${Date.now()}_${safeName}`;

    console.log(`[adminUploadLibraryFile] Uploading to ${BUCKET}/${storagePath}`);

    const { data: uploadData, error: uploadErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: mimeType, upsert: false });

    if (uploadErr) {
      console.error('[adminUploadLibraryFile] upload error:', uploadErr.message);
      return Response.json({ error: uploadErr.message }, { status: 500 });
    }

    const actualPath = uploadData.path || storagePath;

    // Signed URL (24h)
    let fileUrl = null;
    const { data: signedData } = await sb.storage.from(BUCKET).createSignedUrl(actualPath, 86400);
    fileUrl = signedData?.signedUrl || null;

    // Insert document row with consulting_library metadata
    const now = new Date().toISOString();
    const docRow = {
      profile_id: adminId,
      business_id: null,
      name: fileName,
      document_type: docType,
      file_path: actualPath,
      file_url: fileUrl,
      file_size: fileSize || blob.size,
      year: year || null,
      status: 'uploaded',
      upload_status: 'completed',
      upload_source: 'admin_files',
      uploaded_by: adminId,
      storage_bucket: BUCKET,
      file_scope: 'consulting_library',
      related_entity_type: null,
      related_entity_id: null,
      created_at: now,
      updated_at: now,
    };

    const { data: doc, error: docErr } = await sb
      .from('documents')
      .insert(docRow)
      .select()
      .single();

    if (docErr) {
      console.error('[adminUploadLibraryFile] insert error:', docErr.message);
      return Response.json({ error: docErr.message }, { status: 500 });
    }

    console.log(`[adminUploadLibraryFile] Created doc ${doc.id} in ${BUCKET}`);

    return Response.json({
      success: true,
      document_id: doc.id,
      document: {
        id: doc.id, name: doc.name, document_type: doc.document_type,
        file_path: doc.file_path, file_url: doc.file_url, file_size: doc.file_size,
        storage_bucket: BUCKET, file_scope: 'consulting_library',
        status: doc.status, created_at: doc.created_at,
      },
    });

  } catch (err) {
    console.error('[adminUploadLibraryFile] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});