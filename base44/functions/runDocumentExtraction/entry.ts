/**
 * runDocumentExtraction - Phase B.1 Extraction Processor
 *
 * Manual/admin trigger for document extraction. The core extraction logic
 * lives in the shared extractEngine module, which is also called automatically
 * by uploadDocumentToSupabase after upload.
 *
 * This function handles:
 *   - User authentication (for manual/admin invocations)
 *   - Document ownership validation
 *   - Delegation to the shared extraction engine
 *
 * The shared engine handles:
 *   - Status transitions (queued → analyzing → completed/needs_review/failed)
 *   - Field extraction and normalization
 *   - Retry logic for transient failures
 *   - Period extraction
 *
 * Security (Phase 6D.0-K): the actor comes from the trusted session and standing
 * from the canonical profile (shared kernel). Authorization for the document is the
 * ONE shared document decision (S3.1 authorizeDocumentAccess): platform admin →
 * owner-of-record → a LIVE canonical business relationship. Base44 `user.role`
 * grants nothing here, and `advisor_assignments` — which does not exist in
 * production — is never consulted.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runExtraction } from '../../shared/documentExtraction/extractEngine.ts';
import { authenticateActor, errorResponse } from '../../shared/authz/actor.ts';
import { authorizeDocumentAccess } from '../../shared/authz/documentAccess.ts';
import { assertBusinessAccess } from '../../shared/businessScope/activeBusiness.ts';

Deno.serve(async (req) => {
  try {
    // ── STEP 1: Authenticate ─────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const documentAnalysisId = body.documentAnalysisId;

    if (!documentAnalysisId) {
      return Response.json({ error: 'documentAnalysisId required' }, { status: 400 });
    }

    // ── STEP 2: Fetch document_analysis row ──────────────────────────────────
    const { data: analysis, error: analysisErr } = await sb
      .from('document_analysis')
      .select('*')
      .eq('id', documentAnalysisId)
      .maybeSingle();

    // Identical body to every other refusal on this path: an analysis id that does
    // not exist must be indistinguishable from one the caller may not reach.
    if (analysisErr || !analysis) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // ── STEP 3: Fetch document and enforce ownership ─────────────────────────
    const { data: document, error: docErr } = await sb
      .from('documents')
      .select('id, name, file_path, document_type, profile_id, business_id, year')
      .eq('id', analysis.document_id)
      .maybeSingle();

    if (docErr || !document) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Authorization: canonical actor + the ONE shared document decision ────
    // The tenant is derived from the PERSISTED document row, never from the
    // request. Business scope is delegated to the hardened shared layer, which is
    // where relationship lifecycle (including "a revoked expert relationship
    // grants nothing") already lives — nothing about advisor or expert status is
    // restated here.
    const actor = await authenticateActor(base44, sb);

    const verdict = await authorizeDocumentAccess({
      doc: document,
      actor: {
        profile_id: actor.profile_id,
        isAdmin: actor.isAdmin,
        hasProfile: Boolean(actor.profile_id),
      },
      operation: 'view',
      checkBusinessAccess: (businessId: any) =>
        assertBusinessAccess(sb, businessId, actor.profile, { action: 'runDocumentExtraction' }),
    });

    // Unauthorized, unauthenticated-for-this-record and nonexistent are the SAME
    // external response, so this endpoint is not an existence oracle.
    if (!verdict.authorized) return Response.json({ error: 'Not found' }, { status: 404 });
    if (!actor.profile_id) return Response.json({ error: 'Not found' }, { status: 404 });

    // ── STEP 4: Delegate to shared extraction engine ─────────────────────────
    const result = await runExtraction(sb, {
      documentAnalysisId,
      documentId: document.id,
      documentType: document.document_type,
      profileId: document.profile_id,
      businessId: document.business_id,
      year: document.year || null,
    }, { base44 });

    if (!result.success) {
      return Response.json({ error: result.error || 'Extraction failed' }, { status: 400 });
    }

    return Response.json({
      success: true,
      documentAnalysisId: result.documentAnalysisId,
      documentId: result.documentId,
      documentType: result.documentType,
      extractedFieldsCount: result.extractedFieldsCount,
      averageConfidence: result.averageConfidence,
      finalStatus: result.finalStatus,
    });

  } catch (error) {
    // Kernel refusals keep their status; anything else becomes an opaque 500.
    // No internal error string is ever returned to the caller.
    console.error('[runDocumentExtraction] Error:', error?.message || error);
    return errorResponse(error);
  }
});