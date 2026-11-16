/**
 * getDocumentsAdmin — Admin document retrieval with bucket scoping.
 *
 * By default returns ALL consulting_library_files for Admin → Files view.
 * Can also query documents bucket with target_profile_id/target_business_id.
 *
 * Payload (optional):
 *   - bucket: an APPROVED document bucket (default 'consulting_library_files').
 *             The vocabulary is shared — see shared/documents/buckets.ts (S3.1).
 *   - target_profile_id: filter by profile
 *   - target_business_id: filter by business (REQUIRED for non-admins)
 *   - limit: max results (default 200, capped at 200)
 *
 * AUTHORIZATION — Phase S3
 *   Every action derives the actor from the authenticated session
 *   (authenticateActor) and the tenant from the RESOURCE — never from the
 *   request body. Knowing a document UUID grants no access.
 *   DELETE is STRICTER than VIEW: admin/super_admin or owner-of-record only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticateActor,
  authorizeBusinessAccess,
  errorResponse,
  HttpError,
} from '../../shared/authz/actor.ts';
import { assertBusinessAccess } from '../../shared/businessScope/activeBusiness.ts';
import { authorizeDocumentAccess } from '../../shared/authz/documentAccess.ts';
import { isApprovedDocumentBucket } from '../../shared/documents/buckets.ts';

/**
 * loadAuthorizedDocument — the single authorization chokepoint for this function.
 *
 * Establishes AUTHORIZATION ONLY: it mints no URLs and deletes nothing.
 *
 *   1. validate the identifier
 *   2. load the document server-side (service role)
 *   3. not-found semantics when it does not exist
 *   4. derive business_id FROM THE DOCUMENT ROW
 *   5. never accept a caller-supplied business_id as proof
 *   6. authorize for the requested operation
 *   7. return the document only after authorization succeeds
 *
 * DELETE is stricter than VIEW (owner-of-record or admin only). An unauthorized
 * caller cannot distinguish "exists but is not yours" from "does not exist".
 */
async function loadAuthorizedDocument(sb: any, actor: any, documentId: any, operation: string) {
  if (!documentId || typeof documentId !== 'string') {
    throw new HttpError(400, 'document_id required');
  }

  const { data: doc, error } = await sb
    .from('documents')
    .select('id, name, profile_id, business_id, storage_bucket, file_path')
    .eq('id', documentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!doc) throw new HttpError(404, 'Not found');

  // The decision itself lives in ONE shared place. Relationship lifecycle —
  // including a revoked advisor — is decided by assertBusinessAccess →
  // validateBusinessScope, the canonical rule, never re-implemented here.
  const verdict = await authorizeDocumentAccess({
    doc,
    actor: {
      profile_id: actor?.profile_id ?? null,
      isAdmin: !!actor?.isAdmin,
      hasProfile: !!actor?.profile,
    },
    operation: operation === 'delete' ? 'delete' : 'view',
    checkBusinessAccess: (businessId: any) =>
      assertBusinessAccess(sb, businessId, actor.profile, { action: `${operation}Document` }),
  });

  // Unauthorized and nonexistent are indistinguishable to the caller.
  if (!verdict.authorized) throw new HttpError(404, 'Not found');

  return doc;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The actor comes from the authenticated session ONLY (Base44 user.id →
    // canonical profiles row). No request-body identifier — profile_id, user_id,
    // business_id, bucket — ever establishes who is calling. Fails closed (401).
    const actor = await authenticateActor(base44, sb);

    const body = await req.json().catch(() => ({}));

    // ── DELETE action ─────────────────────────────────────────────────────────
    if (body.action === 'delete') {
      // Load the resource, derive its tenant, authorize — then delete.
      const doc = await loadAuthorizedDocument(sb, actor, body.document_id, 'delete');

      // Deletion mechanics unchanged: the authorized document row only.
      const { error: delErr } = await sb.from('documents').delete().eq('id', doc.id);
      if (delErr) throw new Error(delErr.message);
      return Response.json({ success: true });
    }

    // ── SIGNED URL action ─────────────────────────────────────────────────────
    if (body.action === 'getSignedUrl') {
      // Authorization happens BEFORE any URL is minted, and the storage path is
      // taken from the authorized document row — never from the caller.
      const doc = await loadAuthorizedDocument(sb, actor, body.document_id, 'view');

      if (!doc.file_path) return Response.json({ error: 'No file_path' }, { status: 400 });
      const bucket = doc.storage_bucket || 'consulting_library_files';
      const { data: signedData, error: signedErr } = await sb.storage
        .from(bucket).createSignedUrl(doc.file_path, 900);
      if (signedErr) throw new Error(signedErr.message);
      return Response.json({ signedUrl: signedData.signedUrl });
    }

    // ── QUERY action (default) ────────────────────────────────────────────────
    const {
      bucket = 'consulting_library_files',
      target_profile_id,
      target_business_id,
      limit = 200,
    } = body;

    // The bucket is an ALLOWLIST, never a free string: an unrecognized value must
    // not fall through into an unscoped query. S3.1 — the vocabulary is the ONE
    // shared approved-bucket policy (documents, client-documents,
    // consulting_library_files). This function no longer declares its own list,
    // so an approved bucket cannot be accepted by one path and refused by another.
    if (!isApprovedDocumentBucket(bucket)) {
      return Response.json({ error: 'Invalid bucket' }, { status: 400 });
    }

    // A non-admin may only read a business the actor is AUTHORIZED for, validated
    // against the actor — never trusted from the request. No business supplied, or
    // none authorized, is a refusal. There is no fallback to a broader listing.
    if (!actor.isAdmin) {
      if (!target_business_id) {
        return Response.json({ error: 'An authorized business is required' }, { status: 403 });
      }
      await authorizeBusinessAccess(sb, actor, target_business_id);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 200);

    let query = sb.from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    console.log('[getDocumentsAdmin] Query:', {
      bucket, target_profile_id, target_business_id, limit: safeLimit, role: actor.role,
    });

    // Bucket scoping — both allowlisted values are handled explicitly. There is
    // deliberately NO fallback branch: an unknown bucket was refused above, so it
    // can never become an unrestricted document query.
    if (bucket === 'consulting_library_files') {
      query = query.eq('storage_bucket', 'consulting_library_files').eq('file_scope', 'consulting_library');
    } else {
      // The approved bucket the caller requested IS the persisted bucket — the
      // shared policy validated it above. No fallback and no implicit default:
      // 'documents' behaves exactly as it always did, and a request naming
      // another approved bucket is scoped to THAT bucket instead of silently
      // being served the documents bucket.
      query = query.eq('storage_bucket', bucket);
    }

    if (target_profile_id) query = query.eq('profile_id', target_profile_id);

    // The authorized business is a HARD constraint for non-admins. Client-supplied
    // filters can narrow it; they can never broaden it.
    if (actor.isAdmin) {
      if (bucket === 'documents' && target_business_id) {
        query = query.eq('business_id', target_business_id);
      }
    } else {
      query = query.eq('business_id', target_business_id);
    }

    const { data: documents, error } = await query;

    console.log('[getDocumentsAdmin] Results:', { count: documents?.length, error: error?.message });

    if (error) throw new Error(error.message);

    return Response.json({ documents: documents || [] });

  } catch (error) {
    console.error('[getDocumentsAdmin] error:', error?.message || error);
    // Status-preserving and non-leaking: 401/403/404/409 survive, 500s stay opaque.
    return errorResponse(error);
  }
});