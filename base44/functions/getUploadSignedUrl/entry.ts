/**
 * getUploadSignedUrl - Generate Signed Upload URL for Direct Storage Upload
 * 
 * Returns a time-limited signed URL that allows direct upload to Supabase Storage.
 * Frontend uses this URL to upload files directly (bypassing backend payload limits).
 * 
 * Payload:
 * - fileName: string
 * - fileType: string
 * - fileSize: number (optional, for validation)
 * 
 * Response:
 * - signedUrl: string (upload URL)
 * - storagePath: string (where file will be stored)
 * - expiresAt: number (URL expiry timestamp)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const URL_EXPIRY_SECONDS = 300; // 5 minutes

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

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { fileName, fileType, fileSize } = body;

    // Validate required fields
    if (!fileName) return Response.json({ error: 'fileName is required' }, { status: 400 });
    if (!fileType) return Response.json({ error: 'fileType is required' }, { status: 400 });

    // Validate file size
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return Response.json({ 
        error: `File size ${fileSize} bytes exceeds maximum limit of ${MAX_FILE_SIZE} bytes (50MB)` 
      }, { status: 400 });
    }

    if (fileSize && fileSize < 1) {
      return Response.json({ error: 'fileSize must be greater than 0' }, { status: 400 });
    }

    // Resolve profile
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr || !profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileId = profile.id;
    let businessId = profile.primary_business_id || null;

    // Auto-create business if missing
    if (!businessId) {
      const { data: newBiz } = await sb
        .from('business_entities')
        .insert({
          profile_id: profileId,
          business_name: 'My Business',
          current_stage: 'onboarding',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      businessId = newBiz?.id || 'no-business';
      await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
    }

    // Generate storage path — DEPRECATED function, bucket fixed to documents
    const bucketName = 'documents';
    const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = `${profileId}/${businessId}/${safeFileName}`;

    console.log('[getUploadSignedUrl] Generating upload URL for:', { bucket: bucketName, path: storagePath, size: fileSize });

    // Generate signed upload URL
    const { data: signedUrlData, error: urlError } = await sb.storage
      .from(bucketName)
      .createSignedUploadUrl(storagePath, {
        expirySeconds: URL_EXPIRY_SECONDS,
        upsert: false,
      });

    if (urlError) {
      console.error('[getUploadSignedUrl] Signed URL generation failed:', urlError.message);
      throw new Error(`Failed to generate upload URL: ${urlError.message}`);
    }

    // Note: Supabase JS SDK v2 returns { url, path, token } for createSignedUploadUrl
    // The frontend should PUT the file to the returned URL
    const uploadUrl = signedUrlData.url;

    console.log('[getUploadSignedUrl] Upload URL generated successfully');

    return Response.json({
      success: true,
      uploadUrl,
      storagePath,
      bucket: bucketName,
      expiresAt: Date.now() + (URL_EXPIRY_SECONDS * 1000),
      expiresIn: URL_EXPIRY_SECONDS,
    });

  } catch (error) {
    console.error('[getUploadSignedUrl] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});