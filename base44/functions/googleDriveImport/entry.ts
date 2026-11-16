/**
 * googleDriveImport — Google Drive file import for V.I.S.I.O.N. Platform.
 *
 * Connector: "V.I.S.I.O.N. Platform™" (googledrive, id: 6a332849a6a82e82cbdf3ab2)
 * Scope: https://www.googleapis.com/auth/drive.file
 *
 * Actions:
 *   getToken   — returns the current app user's OAuth access token (for Google Picker)
 *   importFile — downloads a selected file from Drive and uploads it to Supabase
 *
 * Imported file metadata:
 *   storage_bucket: 'documents'
 *   file_scope: 'client_document'
 *   uploaded_from: 'google_drive'
 *   original_source: 'google_drive'
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

const CONNECTOR_ID = '6a332849a6a82e82cbdf3ab2';

// Normalized exactly like every other Supabase-backed function: VITE_SUPABASE_URL
// carries a /rest/v1/ suffix, and passing it through raw makes every request malformed.
const SUPABASE_URL = (Deno.env.get('VITE_SUPABASE_URL') || '')
  .replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '')
  .replace(/\/$/, '');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars not set');
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function sanitizeFileName(name) {
  return (name || 'untitled').replace(/[^a-zA-Z0-9._-]/g, '_');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── getToken — return access token for Google Picker ──────────────────
    if (action === 'getToken') {
      try {
        const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
        return Response.json({ accessToken });
      } catch (e) {
        return Response.json({ error: 'not_connected' }, { status: 200 });
      }
    }

    // ── importFile — download from Drive, upload to Supabase ──────────────
    if (action === 'importFile') {
      const { fileId, fileName, fileType } = (body.data || {});
      if (!fileId) return Response.json({ error: 'fileId required' }, { status: 400 });

      let accessToken;
      try {
        const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
        accessToken = conn.accessToken;
      } catch {
        return Response.json({ error: 'Google Drive not connected' }, { status: 401 });
      }

      // 1. Download file from Google Drive
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!driveRes.ok) {
        const errText = await driveRes.text();
        return Response.json({ error: `Drive download failed: ${driveRes.status}`, details: errText.slice(0, 200) }, { status: 500 });
      }

      const arrayBuffer = await driveRes.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // 2. Upload to Supabase Storage
      const supabase = getSupabase();
      const safeName = `${Date.now()}_${sanitizeFileName(fileName)}`;
      const storagePath = `${user.id}/${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, uint8, {
          contentType: fileType || 'application/octet-stream',
          upsert: false,
        });

      if (uploadErr) {
        return Response.json({ error: 'Storage upload failed', step: 'upload', details: uploadErr.message }, { status: 500 });
      }

      // 3. Generate signed URL
      const { data: signedData, error: signedErr } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 3600);

      if (signedErr) {
        return Response.json({ error: 'Signed URL generation failed', step: 'sign', details: signedErr.message }, { status: 500 });
      }

      const fileUrl = signedData.signedUrl;

      // 4. Resolve the acting profile + the explicitly selected business.
      // Phase 6.9B — was `profile.primary_business_id`, so an import performed while
      // a NON-primary business was active was filed under the primary one.
      const { data: actorProfile } = await supabase
        .from('profiles')
        .select('id, primary_business_id')
        .eq('email', user.email)
        .maybeSingle();
      if (!actorProfile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const { businessId, denial } = await requireBusinessContext(
        supabase, actorProfile, body.data?.active_business_id || body.data?.business_id,
        'googleDriveImport.importFile'
      );
      if (denial) return denial;
      const profileId = actorProfile.id;

      // 5. Insert document record into Supabase
      const { data: docRow, error: insertErr } = await supabase
        .from('documents')
        .insert({
          profile_id: profileId,
          business_id: businessId,
          name: fileName || 'Google Drive Import',
          file_path: storagePath,
          file_url: fileUrl,
          file_size: arrayBuffer.byteLength,
          mime_type: fileType || 'application/octet-stream',
          document_type: 'other',
          upload_source: 'user_upload',
          upload_status: 'uploaded',
          storage_bucket: 'documents',
          file_scope: 'client_document',
          uploaded_from: 'google_drive',
          original_source: 'google_drive',
        })
        .select('*')
        .single();

      if (insertErr) {
        return Response.json({ error: 'Document record insert failed', step: 'insert', details: insertErr.message }, { status: 500 });
      }

      // 6. Trigger document analysis pipeline
      try {
        await supabase.from('document_analysis_queue').insert({
          document_id: docRow.id,
          status: 'queued',
        });
      } catch { /* non-critical */ }

      return Response.json({ success: true, document: docRow });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});