/**
 * supabaseDocumentData — documents, document analysis queue, extracted fields review.
 *
 * Actions:
 *   getDocuments, upsertDocument, uploadDocument,
 *   getDocumentAnalysisQueue, getExtractedFieldsReviewQueue, updateExtractedFieldReview
 *
 * Can be called directly (user token) or via supabaseUserData router (service role).
 * Phase 6B.4 — authentication is MANDATORY and unconditional. `_router_user_email`
 * and `target_profile_id` are TARGET identifiers only, honoured solely after the
 * authenticated actor is proven authorized for them. Identity never comes from
 * the request body.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';
import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';

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
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, data, _router_user_email, target_profile_id } = body;

    // ── Phase 6B.4 — AUTHENTICATION BOUNDARY ─────────────────────────────────
    // Authentication is mandatory and unconditional. The caller's identity is
    // NEVER taken from the request body. `_router_user_email` and
    // `target_profile_id` are TARGET identifiers only: they are honoured solely
    // after the authenticated actor is proven authorized for that target.
    //
    // Previously `auth.me()` was skipped entirely whenever either field was
    // present, so `getProfile()` returned whichever profile the caller named —
    // making the Phase 6B.2 business-scope check below authorize an attacker.
    const actor = await authenticateActor(base44, sb);
    const acting = await resolveActingProfile(sb, actor, {
      targetProfileId: target_profile_id,
      targetEmail: _router_user_email,
    });

    const getProfile = async () => acting.profile;

    if (action === 'getDocuments') {
      const profile = await getProfile();
      if (!profile) return Response.json({ documents: [] });
      const { data: documents, error } = await sb
        .from('documents')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return Response.json({ documents: documents || [] });
    }

    if (action === 'upsertDocument') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });
      // ── Phase 6B.2 — business_id must never be taken from the request body ──
      // CROSS-TENANT HOLE (fixed here): `business_id` passed straight through to
      // the documents row, so any authenticated user could attach a document to a
      // business they had no relationship with. It is now removed from the
      // passthrough and re-added only after verifying access.
      const { profile_id: _ignored, business_id: requestedBusinessId, ...safeData } = data || {};
      const docData = { ...safeData, profile_id: profile.id };

      if (requestedBusinessId) {
        try {
          await validateBusinessScope(sb, requestedBusinessId, profile.id);
          docData.business_id = requestedBusinessId;
        } catch (scopeErr) {
          console.error('[supabaseDocumentData] business scope denied:', scopeErr.message);
          return Response.json({ error: 'Forbidden: no access to that business' }, { status: 403 });
        }
      }
      if (data.id) {
        const { data: existing } = await sb.from('documents').select('id, profile_id').eq('id', data.id).maybeSingle();
        if (!existing) return Response.json({ error: 'Document not found' }, { status: 404 });
        if (existing.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const { data: doc, error } = await sb.from('documents').update(docData).eq('id', data.id).select().single();
        if (error) throw new Error(error.message);
        return Response.json({ document: doc });
      }
      const { data: doc, error } = await sb.from('documents').insert(docData).select().single();
      if (error) throw new Error(error.message);
      return Response.json({ document: doc });
    }

    if (action === 'uploadDocument') {
      const uploadRes = await fetch(new URL('/functions/uploadDocumentToSupabase', req.url), {
        method: 'POST',
        // Phase 6B.4 — forward the caller's credential so the callee
        // re-authenticates the real user instead of trusting the payload.
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.get('Authorization') || '',
        },
        body: JSON.stringify(data || {}),
      });
      const result = await uploadRes.json();
      if (!uploadRes.ok) {
        return Response.json({ error: result.error || 'Upload failed' }, { status: uploadRes.status });
      }
      return Response.json({ document: result.document, storage: result.storage });
    }

    if (action === 'getDocumentAnalysisQueue') {
      const profile = await getProfile();
      if (!profile) return Response.json({ documents: [] });

      const role = profile.app_role;

      let docQuery = sb.from('documents')
        .select('id, name, document_type, upload_status, created_at, profile_id, business_id')
        .eq('storage_bucket', 'documents')
        .eq('file_scope', 'client_document')
        .in('upload_status', ['pending_analysis', 'queued', 'analyzing', 'needs_review', 'failed'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { docQuery = docQuery.in('business_id', bizIds); }
        else { return Response.json({ documents: [] }); }
      } else {
        // ── Phase 6B.4 — scope the queue to the AUTHORIZED acting profile ────
        // Previously unscoped for every non-advisor role: an ordinary owner
        // received up to 100 queued documents belonging to every other user.
        docQuery = docQuery.eq('profile_id', profile.id);
      }

      const { data: documents, error } = await docQuery;
      if (error) throw new Error(error.message);

      const enriched = await Promise.all((documents || []).map(async (doc) => {
        let business_name = 'My Business';
        let analysis_status = doc.upload_status;
        let analysis_id = null;

        if (doc.business_id) {
          const { data: biz } = await sb.from('business_entities').select('business_name').eq('id', doc.business_id).maybeSingle();
          business_name = biz?.business_name || 'My Business';
        }

        const { data: analysis } = await sb.from('document_analysis').select('id, analysis_status, status').eq('document_id', doc.id).maybeSingle();
        if (analysis) {
          analysis_status = analysis.analysis_status || analysis.status || doc.upload_status;
          analysis_id = analysis.id;
        }

        return { ...doc, business_name, analysis_status, analysis_id };
      }));

      return Response.json({ documents: enriched || [] });
    }

    if (action === 'getExtractedFieldsReviewQueue') {
      const profile = await getProfile();
      if (!profile) return Response.json({ fields: [] });

      const role = profile.app_role;
      const profileId = profile.id;

      let fieldQuery = sb.from('extracted_fields')
        .select('*')
        .eq('review_status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(100);

      if (role === 'advisor') {
        const { data: assignments } = await sb.from('advisor_assignments').select('business_id').eq('advisor_profile_id', profile.id);
        const bizIds = (assignments || []).map(a => a.business_id).filter(Boolean);
        if (bizIds.length > 0) { fieldQuery = fieldQuery.in('business_id', bizIds); }
        else { return Response.json({ fields: [] }); }
      } else {
        fieldQuery = fieldQuery.eq('profile_id', profileId);
      }

      const { data: fields, error } = await fieldQuery;
      if (error) throw new Error(error.message);

      const enriched = await Promise.all((fields || []).map(async (field) => {
        let business_name = 'My Business';
        let document_name = 'Unknown';
        let document_type = field.source_document_type;

        if (field.document_id) {
          const { data: doc } = await sb.from('documents').select('name, document_type').eq('id', field.document_id).maybeSingle();
          document_name = doc?.name || 'Unknown';
          document_type = doc?.document_type || field.source_document_type;
        }

        if (field.business_id) {
          const { data: biz } = await sb.from('business_entities').select('business_name').eq('id', field.business_id).maybeSingle();
          business_name = biz?.business_name || 'My Business';
        }

        return { ...field, business_name, document_name, document_type };
      }));

      return Response.json({ fields: enriched || [] });
    }

    if (action === 'updateExtractedFieldReview') {
      const profile = await getProfile();
      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const profileId = profile.id;
      const { fieldId, reviewStatus, acceptedValue, acceptedNormalizedValue, notes } = body;

      if (!fieldId || !reviewStatus) {
        return Response.json({ error: 'fieldId and reviewStatus required' }, { status: 400 });
      }

      const validStatuses = ['pending_review', 'accepted', 'corrected', 'rejected', 'needs_clarification'];
      if (!validStatuses.includes(reviewStatus)) {
        return Response.json({ error: `Invalid reviewStatus. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      }

      if (reviewStatus === 'needs_clarification' && (!notes || notes.trim() === '')) {
        return Response.json({ error: 'Notes are required when marking as needs clarification' }, { status: 400 });
      }

      const { data: field, error: fieldErr } = await sb.from('extracted_fields').select('*').eq('id', fieldId).maybeSingle();
      if (fieldErr) throw new Error(fieldErr.message);
      if (!field) return Response.json({ error: 'Field not found' }, { status: 404 });

      // ── Phase 6B.4 — the mutated object must establish its own ownership ──
      // The field is never authorized by an identifier supplied alongside the
      // mutation. Ownership is resolved from the field row itself (falling back
      // to its parent document) and checked against the authorized profile.
      if (field.profile_id && field.profile_id !== profileId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!field.profile_id && field.document_id) {
        const { data: ownerDoc } = await sb.from('documents').select('profile_id').eq('id', field.document_id).maybeSingle();
        if (ownerDoc?.profile_id && ownerDoc.profile_id !== profileId) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      const updateData = {
        review_status: reviewStatus,
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (reviewStatus === 'accepted') {
        updateData.accepted_value = acceptedValue !== undefined ? acceptedValue : field.field_value;
        updateData.accepted_normalized_value = acceptedNormalizedValue !== undefined ? acceptedNormalizedValue : field.normalized_value;
      } else if (reviewStatus === 'corrected') {
        if (acceptedValue === undefined || acceptedValue === '') return Response.json({ error: 'Corrected value is required' }, { status: 400 });
        updateData.accepted_value = acceptedValue;
        updateData.accepted_normalized_value = acceptedNormalizedValue !== undefined ? acceptedNormalizedValue : null;
      } else if (reviewStatus === 'rejected') {
        updateData.accepted_value = null;
        updateData.accepted_normalized_value = null;
      }

      if (notes !== undefined) updateData.notes = notes;

      const { data: updated, error: updateError } = await sb.from('extracted_fields').update(updateData).eq('id', fieldId).select().single();
      if (updateError) throw new Error(updateError.message);

      const { data: allFields } = await sb.from('extracted_fields').select('review_status').eq('document_id', field.document_id);

      if (allFields && allFields.length > 0) {
        const allReviewed = allFields.every(f => ['accepted', 'corrected', 'rejected'].includes(f.review_status));
        const hasClarification = allFields.some(f => f.review_status === 'needs_clarification');
        const newAnalysisStatus = allReviewed && !hasClarification ? 'completed' : 'needs_review';

        await sb.from('document_analysis')
          .update({ analysis_status: newAnalysisStatus, status: newAnalysisStatus, updated_at: new Date().toISOString() })
          .eq('document_id', field.document_id);

        await sb.from('documents')
          .update({ upload_status: allReviewed && !hasClarification ? 'completed' : 'needs_review', updated_at: new Date().toISOString() })
          .eq('id', field.document_id);
      }

      return Response.json({ field: updated });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
});