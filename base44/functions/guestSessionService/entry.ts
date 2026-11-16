/**
 * guestSessionService
 *
 * Manages guest session lifecycle and protected guest file uploads.
 *
 * Actions:
 *   createGuestSession     – Initialize new guest session (idempotent upsert)
 *   getGuestSession        – Retrieve guest session state
 *   updateGuestSession     – Update guest session data
 *   promoteGuestSession    – Convert guest session to authenticated user data (auth required)
 *   createGuestUploadUrl   – Create a signed storage upload URL for a guest file
 *   confirmGuestUpload     – Confirm upload success and append to document_queue
 *   removeGuestUpload      – Remove a document from document_queue (and storage if possible)
 *
 * Storage path: guest/{guest_session_id}/{timestamp}_{filename}
 * All guest_sessions table access goes through this function.
 * Frontend must never query guest_sessions directly.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
// The canonical promotion boundary for a guest discovery. Guest state is not
// canonical truth: this module re-derives the opportunity from the canonical rows
// promotion just wrote, and persists only what the server itself computed.
import { promoteDiscoveredOpportunity } from '../../shared/galileo/discoveryPromotion.js';
import { buildExtractionSchema, normalizeExtraction } from '../../shared/documentExtraction/extractEngine.ts';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_GUEST_FILES = 10;
const MAX_FILE_SIZE   = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xls', 'xlsx'];
const GUEST_STORAGE_BUCKET = 'documents'; // same bucket, scoped path

function getExtension(filename) {
  return (filename || '').split('.').pop()?.toLowerCase() || '';
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action, data } = body;

    // Environment setup
    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!rawUrl || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── ACTION: createGuestSession ───────────────────────────────────────────
    if (action === 'createGuestSession') {
      const { guest_session_id } = data || {};
      if (!guest_session_id) {
        return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: session, error } = await sb.from('guest_sessions')
        .upsert({
          guest_session_id,
          created_at: now,
          updated_at: now,
          expires_at: expiresAt,
          status: 'active',
          state_snapshot: {},
          document_queue: [],
          assessment_answers: {},
          business_snapshot: {},
          galileo_events: [],
        }, { onConflict: 'guest_session_id', ignoreDuplicates: false })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return Response.json({
        success: true,
        session: {
          guest_session_id: session.guest_session_id,
          created_at: session.created_at,
          expires_at: session.expires_at,
        },
      });
    }

    // ── ACTION: getGuestSession ──────────────────────────────────────────────
    if (action === 'getGuestSession') {
      const { guest_session_id } = data || {};
      if (!guest_session_id) {
        return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      }

      const { data: session, error } = await sb.from('guest_sessions')
        .select('*')
        .eq('guest_session_id', guest_session_id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!session) return Response.json({ session: null, exists: false });

      if (session.status === 'expired') {
        return Response.json({ session: null, exists: true, expired: true, message: 'Session expired. Please start over.' });
      }

      if (session.status === 'promoted') {
        return Response.json({ session: null, exists: true, promoted: true, promoted_profile_id: session.promoted_profile_id, message: 'Session already promoted. Please log in.' });
      }

      return Response.json({
        session: {
          guest_session_id: session.guest_session_id,
          state_snapshot: session.state_snapshot || {},
          document_queue: session.document_queue || [],
          assessment_answers: session.assessment_answers || {},
          business_snapshot: session.business_snapshot || {},
          galileo_events: session.galileo_events || [],
          created_at: session.created_at,
          updated_at: session.updated_at,
          expires_at: session.expires_at,
        },
        exists: true,
      });
    }

    // ── ACTION: updateGuestSession ───────────────────────────────────────────
    if (action === 'updateGuestSession') {
      const { guest_session_id, updates } = data || {};
      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      if (!updates || typeof updates !== 'object') return Response.json({ error: 'updates object required' }, { status: 400 });

      const now = new Date().toISOString();
      const updateData = { updated_at: now };
      const validKeys = ['state_snapshot', 'document_queue', 'assessment_answers', 'business_snapshot', 'galileo_events'];
      for (const key of validKeys) {
        if (updates[key] !== undefined) updateData[key] = updates[key];
      }

      const { data: session, error } = await sb.from('guest_sessions')
        .update(updateData)
        .eq('guest_session_id', guest_session_id)
        .eq('status', 'active')
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!session) return Response.json({ error: 'Session not found or not active' }, { status: 404 });

      return Response.json({ success: true, session: { guest_session_id: session.guest_session_id, updated_at: session.updated_at } });
    }

    // ── ACTION: createGuestUploadUrl ─────────────────────────────────────────
    if (action === 'createGuestUploadUrl') {
      const { guest_session_id, original_filename, file_size, mime_type, document_type, document_scope, temp_business_id } = data || {};

      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      if (!original_filename) return Response.json({ error: 'original_filename required' }, { status: 400 });
      if (!mime_type) return Response.json({ error: 'mime_type required' }, { status: 400 });

      // Validate file type
      const ext = getExtension(original_filename);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return Response.json({ error: `File type .${ext} is not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 });
      }
      if (!ALLOWED_MIME_TYPES.includes(mime_type) && !mime_type.startsWith('image/')) {
        return Response.json({ error: `MIME type ${mime_type} is not allowed.` }, { status: 400 });
      }

      // Validate file size
      if (file_size && file_size > MAX_FILE_SIZE) {
        return Response.json({ error: `File exceeds 25 MB limit (${(file_size / 1024 / 1024).toFixed(1)} MB)` }, { status: 400 });
      }

      // Validate guest session exists and is active
      const { data: session, error: sessErr } = await sb.from('guest_sessions')
        .select('guest_session_id, status, document_queue')
        .eq('guest_session_id', guest_session_id)
        .maybeSingle();

      if (sessErr) throw new Error(sessErr.message);
      if (!session) return Response.json({ error: 'Guest session not found' }, { status: 404 });
      if (session.status !== 'active') return Response.json({ error: `Session is ${session.status}, cannot upload` }, { status: 400 });

      // Enforce max files per guest session
      const existingQueue = (session.document_queue || []).filter(d => d.status === 'uploaded_guest');
      if (existingQueue.length >= MAX_GUEST_FILES) {
        return Response.json({ error: `Maximum ${MAX_GUEST_FILES} files per guest session` }, { status: 400 });
      }

      // Build protected storage path: guest/{guest_session_id}/{timestamp}_{sanitized_filename}
      const timestamp = Date.now();
      const safeName = sanitizeFilename(original_filename);
      const file_path = `guest/${guest_session_id}/${timestamp}_${safeName}`;

      // Create a signed upload URL (5 minute expiry) — no public access
      const { data: signedUpload, error: signedErr } = await sb.storage
        .from(GUEST_STORAGE_BUCKET)
        .createSignedUploadUrl(file_path);

      if (signedErr) throw new Error(`Failed to create upload URL: ${signedErr.message}`);

      const temp_document_id = crypto.randomUUID();

      return Response.json({
        success: true,
        temp_document_id,
        file_path,
        signed_upload_url: signedUpload.signedUrl,
        token: signedUpload.token,
        expires_in: 300,
      });
    }

    // ── ACTION: confirmGuestUpload ───────────────────────────────────────────
    if (action === 'confirmGuestUpload') {
      const { guest_session_id, temp_document_id, file_path, original_filename, document_type, document_scope, temp_business_id, file_size, mime_type } = data || {};

      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      if (!temp_document_id) return Response.json({ error: 'temp_document_id required' }, { status: 400 });
      if (!file_path) return Response.json({ error: 'file_path required' }, { status: 400 });
      if (!original_filename) return Response.json({ error: 'original_filename required' }, { status: 400 });

      // Security: file_path must be scoped to this guest session
      const expectedPrefix = `guest/${guest_session_id}/`;
      if (!file_path.startsWith(expectedPrefix)) {
        return Response.json({ error: 'file_path does not match guest session scope' }, { status: 403 });
      }

      // Validate session
      const { data: session, error: sessErr } = await sb.from('guest_sessions')
        .select('guest_session_id, status, document_queue')
        .eq('guest_session_id', guest_session_id)
        .maybeSingle();

      if (sessErr) throw new Error(sessErr.message);
      if (!session) return Response.json({ error: 'Guest session not found' }, { status: 404 });
      if (session.status !== 'active') return Response.json({ error: `Session is ${session.status}` }, { status: 400 });

      const existingQueue = session.document_queue || [];

      // Prevent duplicate temp_document_id
      if (existingQueue.some(d => d.temp_document_id === temp_document_id)) {
        return Response.json({ success: true, already_confirmed: true });
      }

      const newEntry = {
        temp_document_id,
        temp_business_id: temp_business_id || null,
        original_filename,
        document_type: document_type || 'other',
        document_scope: document_scope || 'business',
        file_path,
        file_size: file_size || null,
        mime_type: mime_type || null,
        uploaded_at: new Date().toISOString(),
        status: 'uploaded_guest',
      };

      const updatedQueue = [...existingQueue, newEntry];

      const { error: updateErr } = await sb.from('guest_sessions')
        .update({ document_queue: updatedQueue, updated_at: new Date().toISOString() })
        .eq('guest_session_id', guest_session_id)
        .eq('status', 'active');

      if (updateErr) throw new Error(updateErr.message);

      return Response.json({ success: true, temp_document_id, entry: newEntry });
    }

    // ── ACTION: removeGuestUpload ────────────────────────────────────────────
    if (action === 'removeGuestUpload') {
      const { guest_session_id, temp_document_id } = data || {};

      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      if (!temp_document_id) return Response.json({ error: 'temp_document_id required' }, { status: 400 });

      const { data: session, error: sessErr } = await sb.from('guest_sessions')
        .select('guest_session_id, status, document_queue')
        .eq('guest_session_id', guest_session_id)
        .maybeSingle();

      if (sessErr) throw new Error(sessErr.message);
      if (!session) return Response.json({ error: 'Guest session not found' }, { status: 404 });

      const existingQueue = session.document_queue || [];
      const entry = existingQueue.find(d => d.temp_document_id === temp_document_id);

      if (!entry) return Response.json({ success: true, not_found: true });

      // Security: verify path scope before storage delete
      const expectedPrefix = `guest/${guest_session_id}/`;
      if (entry.file_path && entry.file_path.startsWith(expectedPrefix)) {
        try {
          await sb.storage.from(GUEST_STORAGE_BUCKET).remove([entry.file_path]);
        } catch (storageErr) {
          console.warn('[removeGuestUpload] Storage delete failed (non-fatal):', storageErr.message);
        }
      }

      const updatedQueue = existingQueue.filter(d => d.temp_document_id !== temp_document_id);

      const { error: updateErr } = await sb.from('guest_sessions')
        .update({ document_queue: updatedQueue, updated_at: new Date().toISOString() })
        .eq('guest_session_id', guest_session_id);

      if (updateErr) throw new Error(updateErr.message);

      return Response.json({ success: true, removed: temp_document_id });
    }

    // ── ACTION: createGuestReadUrl ───────────────────────────────────────────
    // Phase 1.1: Creates a short-lived signed read URL for guest document extraction.
    // Validates guest_session_id ownership and file_path scope before returning.
    if (action === 'createGuestReadUrl') {
      const { guest_session_id, temp_document_id } = data || {};
      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      if (!temp_document_id) return Response.json({ error: 'temp_document_id required' }, { status: 400 });

      // Validate session exists and is active
      const { data: session, error: sessErr } = await sb.from('guest_sessions')
        .select('guest_session_id, status, document_queue')
        .eq('guest_session_id', guest_session_id)
        .maybeSingle();

      if (sessErr) throw new Error(sessErr.message);
      if (!session) return Response.json({ error: 'Guest session not found' }, { status: 404 });
      if (session.status !== 'active') return Response.json({ error: `Session is ${session.status}` }, { status: 400 });

      // Find document in queue (ownership validation)
      const entry = (session.document_queue || []).find(d => d.temp_document_id === temp_document_id);
      if (!entry) return Response.json({ error: 'Document not found in session' }, { status: 404 });

      // Security: file_path must be scoped to this guest session
      const expectedPrefix = `guest/${guest_session_id}/`;
      if (!entry.file_path || !entry.file_path.startsWith(expectedPrefix)) {
        return Response.json({ error: 'File path does not match guest session scope' }, { status: 403 });
      }

      // Create short-lived signed read URL (60 seconds — just enough for extraction)
      const { data: signedData, error: signedErr } = await sb.storage
        .from(GUEST_STORAGE_BUCKET)
        .createSignedUrl(entry.file_path, 60);

      if (signedErr) throw new Error(`Failed to create read URL: ${signedErr.message}`);

      // Build extraction schema from shared engine
      const documentType = entry.document_type || 'profit_and_loss';
      const schema = buildExtractionSchema(documentType);
      if (!schema) {
        return Response.json({ error: `Extraction not supported for document type: ${documentType}` }, { status: 400 });
      }

      return Response.json({
        success: true,
        signed_url: signedData.signedUrl,
        schema,
        document_type: documentType,
        original_filename: entry.original_filename,
      });
    }

    // ── ACTION: storeGuestExtraction ────────────────────────────────────────
    // Phase 1.1: Normalizes raw extraction output via shared engine and stores
    // extracted facts in the guest session (temporary, not permanent).
    if (action === 'storeGuestExtraction') {
      const { guest_session_id, temp_document_id, raw_output, document_type } = data || {};
      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });
      if (!temp_document_id) return Response.json({ error: 'temp_document_id required' }, { status: 400 });

      // Validate session
      const { data: session, error: sessErr } = await sb.from('guest_sessions')
        .select('guest_session_id, status, document_queue, business_snapshot')
        .eq('guest_session_id', guest_session_id)
        .maybeSingle();

      if (sessErr) throw new Error(sessErr.message);
      if (!session) return Response.json({ error: 'Guest session not found' }, { status: 404 });
      if (session.status !== 'active') return Response.json({ error: `Session is ${session.status}` }, { status: 400 });

      // Find document in queue (ownership validation)
      const entry = (session.document_queue || []).find(d => d.temp_document_id === temp_document_id);
      if (!entry) return Response.json({ error: 'Document not found in session' }, { status: 404 });

      // Normalize using shared engine
      const docType = document_type || entry.document_type || 'profit_and_loss';
      const result = normalizeExtraction(docType, raw_output);

      if (!result.success) {
        return Response.json({ success: false, error: result.error, fields_found: 0 });
      }

      // Store extracted facts in business_snapshot.extracted_facts (temporary)
      const businessSnapshot = session.business_snapshot || {};
      const extractedFacts = businessSnapshot.extracted_facts || {};
      extractedFacts[temp_document_id] = {
        document_type: docType,
        original_filename: entry.original_filename,
        period: result.period,
        facts: result.facts,
        fields_found: result.fieldsFound,
        extracted_at: new Date().toISOString(),
      };

      // Update document_queue entry status
      const updatedQueue = (session.document_queue || []).map(d =>
        d.temp_document_id === temp_document_id
          ? { ...d, status: 'extracted', extracted_facts: result.facts, period: result.period }
          : d
      );

      await sb.from('guest_sessions').update({
        business_snapshot: { ...businessSnapshot, extracted_facts: extractedFacts },
        document_queue: updatedQueue,
        updated_at: new Date().toISOString(),
      }).eq('guest_session_id', guest_session_id).eq('status', 'active');

      return Response.json({
        success: true,
        period: result.period,
        facts: result.facts,
        fields_found: result.fieldsFound,
        document_type: docType,
        original_filename: entry.original_filename,
      });
    }

    // ── ACTION: promoteGuestSession ──────────────────────────────────────────
    if (action === 'promoteGuestSession') {
      // Must be authenticated
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized: must be logged in to promote session' }, { status: 401 });

      const { guest_session_id } = data || {};
      if (!guest_session_id) return Response.json({ error: 'guest_session_id required' }, { status: 400 });

      const now = new Date().toISOString();
      const promotionSummary = {
        success: false,
        guest_session_id,
        profile_id: null,
        business_ids: [],
        assessment_ids: [],
        document_ids: [],
        warnings: [],
        // Phase 6B.2 — staged outcome. Account/business creation and assessment
        // promotion are distinct from metrics synchronization, so a metrics
        // failure is visible and retryable without implying the whole promotion
        // failed. dashboard_metrics_written is gone: it was set to `true`
        // unconditionally, even when the write below was rejected.
        stages: {
          ACCOUNT_CREATED: false,
          BUSINESS_CREATED: false,
          ASSESSMENT_PROMOTED: false,
          OPPORTUNITY_PROMOTED: false,
          METRICS_SYNCED: false,
        },
        opportunities: null,
        metrics_synced: false,
        metrics_error: null,
      };

      try {
        // 1. Resolve profile_id from authenticated user
        const { data: profile, error: profileErr } = await sb.from('profiles')
          .select('id, email')
          .eq('email', user.email)
          .maybeSingle();

        if (profileErr) throw new Error(profileErr.message);
        if (!profile) throw new Error('Profile not found for authenticated user');

        // 2. Validate guest session
        const { data: guestSession, error: fetchErr } = await sb.from('guest_sessions')
          .select('*')
          .eq('guest_session_id', guest_session_id)
          .maybeSingle();

        if (fetchErr) throw new Error(fetchErr.message);
        if (!guestSession) return Response.json({ error: 'Guest session not found' }, { status: 404 });

        // 3. Prevent double promotion
        if (guestSession.status === 'promoted') {
          return Response.json({ success: true, already_promoted: true, promoted_profile_id: guestSession.promoted_profile_id, message: 'Session already promoted' });
        }

        if (guestSession.status !== 'active') {
          return Response.json({ error: `Session status is ${guestSession.status}, cannot promote` }, { status: 400 });
        }

        // 4. Create business records from business_snapshot
        const businesses = (guestSession.business_snapshot?.businesses) || [];
        const tempToRealBizId = {}; // map temp_business_id → real business_id

        for (const biz of businesses) {
          if (!biz.business_name) { promotionSummary.warnings.push('Skipped business: missing business_name'); continue; }

          const { data: bizData, error: bizErr } = await sb.from('business_entities')
            .upsert({ business_name: biz.business_name, industry: biz.industry || null, entity_type: biz.entity_type || 'unknown', business_family_type: biz.business_family_type || 'operating_company', created_by: profile.id, updated_at: now }, { onConflict: 'business_name,created_by' })
            .select().single();

          if (bizErr) { promotionSummary.warnings.push(`Business "${biz.business_name}" upsert failed: ${bizErr.message}`); continue; }

          promotionSummary.business_ids.push(bizData.id);
          if (biz.temp_business_id) tempToRealBizId[biz.temp_business_id] = bizData.id;

          await sb.from('business_owners').upsert({ profile_id: profile.id, business_id: bizData.id, ownership_percentage: biz.ownership_percentage || 100, ownership_type: biz.ownership_type || 'direct_individual', ownership_role: biz.ownership_role || 'owner', is_primary_owner: biz.is_primary_owner || true }, { onConflict: 'profile_id,business_id' });
        }

        // 5. Create assessment records from assessment_answers
        const assessmentAnswers = guestSession.assessment_answers || {};
        for (const assessmentType of Object.keys(assessmentAnswers)) {
          const assessmentData = assessmentAnswers[assessmentType];
          if (!assessmentData?.answers) { promotionSummary.warnings.push(`Skipped assessment ${assessmentType}: missing answers`); continue; }

          const targetBusinessId = promotionSummary.business_ids[0] || null;
          const { data: assessResult, error: assessErr } = await sb.from('business_assessments')
            .upsert({ profile_id: profile.id, business_id: targetBusinessId, assessment_type: assessmentType, score: assessmentData.results?.score || null, answers: assessmentData.answers, results: assessmentData.results || {}, completed_at: assessmentData.completed_at || now, updated_at: now }, { onConflict: 'profile_id,assessment_type' })
            .select().single();

          if (assessErr) { promotionSummary.warnings.push(`Assessment ${assessmentType} upsert failed: ${assessErr.message}`); continue; }
          promotionSummary.assessment_ids.push(assessResult.id);
        }

        // 5c. CANONICAL OPPORTUNITY PROMOTION — the discovery boundary.
        // The guest explored a SPECIFIC opportunity and preserved the business.
        // Re-derive that discovery from the canonical rows written above and
        // persist it through the existing galileo_opportunities path, so Home
        // resumes the same thread instead of reconstructing a generic value gap.
        // The only client influence is the explored-key token; every value,
        // confidence and evidence reference is computed here.
        try {
          const targetBusinessId = promotionSummary.business_ids[0] || null;
          if (!targetBusinessId) {
            promotionSummary.warnings.push('No business created — discovery opportunity not promoted');
          } else {
            promotionSummary.opportunities = await promoteDiscoveredOpportunity({
              base44,
              sb,
              profileId: profile.id,
              businessId: targetBusinessId,
              guestSession,
            });
            promotionSummary.stages.OPPORTUNITY_PROMOTED = promotionSummary.opportunities.created > 0
              || promotionSummary.opportunities.reused > 0;
          }
        } catch (oppErr) {
          // A discovery write failure must never fail the promotion itself — the
          // account, the business and the assessments are already canonical, and
          // Home still resolves the preserved value gap.
          promotionSummary.warnings.push(`Opportunity promotion failed: ${oppErr.message}`);
        }

        // 6. Promote documents from document_queue (only uploaded_guest entries with file_path)
        const documentQueue = guestSession.document_queue || [];

        for (const doc of documentQueue) {
          // Only promote real uploads (status = uploaded_guest with a file_path)
          if (doc.status !== 'uploaded_guest' || !doc.file_path || !doc.original_filename) {
            if (doc.status !== 'uploaded_guest') {
              promotionSummary.warnings.push(`Skipped document "${doc.original_filename}": status is ${doc.status}, not uploaded_guest`);
            } else {
              promotionSummary.warnings.push(`Skipped document: missing file_path or original_filename`);
            }
            continue;
          }

          // Resolve real business_id from temp_business_id mapping
          const realBusinessId = (doc.temp_business_id && tempToRealBizId[doc.temp_business_id])
            ? tempToRealBizId[doc.temp_business_id]
            : (promotionSummary.business_ids[0] || null);

          const { data: docData, error: docErr } = await sb.from('documents')
            .upsert({
              profile_id: profile.id,
              business_id: realBusinessId,
              name: doc.original_filename,
              file_path: doc.file_path,
              file_url: null, // No public URL — access via signed URL only
              document_type: doc.document_type || 'other',
              document_scope: doc.document_scope || 'business',
              upload_status: 'uploaded',
              storage_bucket: 'documents',
              file_scope: 'client_document',
              file_size: doc.file_size || null,
              source: 'guest_promotion',
              updated_at: now,
            }, { onConflict: 'profile_id,file_path' })
            .select().single();

          if (docErr) { promotionSummary.warnings.push(`Document "${doc.original_filename}" upsert failed: ${docErr.message}`); continue; }
          promotionSummary.document_ids.push(docData.id);

          // Phase 1.1: Create document_analysis row (queued) so the authenticated
          // extraction pipeline can process the promoted document. The extracted
          // facts from the guest session flow through assessment_answers into
          // dashboard_metrics — no duplicate permanent facts. This row lets the
          // authenticated pipeline re-extract and create extracted_fields rows.
          try {
            await sb.from('document_analysis').upsert({
              document_id: docData.id,
              profile_id: profile.id,
              business_id: realBusinessId,
              document_type: doc.document_type || 'other',
              analysis_status: 'queued',
              status: 'queued',
              extracted_data: {},
              missing_fields: [],
              created_at: now,
              updated_at: now,
            }, { onConflict: 'document_id' });
          } catch (analysisErr) {
            promotionSummary.warnings.push(`document_analysis for "${doc.original_filename}" failed: ${analysisErr.message}`);
          }
        }

        // 7. Write Base44 Assessment entity records (so getAssessmentSummary can read b44ByType)
        for (const assessmentType of Object.keys(assessmentAnswers)) {
          const assessmentData = assessmentAnswers[assessmentType];
          if (!assessmentData?.answers) continue;
          try {
            const { data: existingAssessments } = await sb.from('base44_entities')
              .select('id').eq('entity_name', 'Assessment')
              .eq('data->>assessment_type', assessmentType)
              .eq('data->>created_by_id', user.id)
              .limit(1)
              .maybeSingle()
              .catch(() => ({ data: null }));
            // We can't directly write Base44 entities from here — we store promotion flags
            // and let the frontend trigger a metrics recalculation via forceUpdateDashboardMetrics.
            // Instead, write assessment results into dashboard_metrics directly for immediate visibility.
          } catch (_) {}
        }

        // 7b. Build dashboard_metrics from assessment_answers for immediate dashboard population
        try {
          const aa = assessmentAnswers;
          const pg = aa['profit_gap']?.results || aa['profit_gap']?.answers || {};
          const vg = aa['value_gap']?.results || aa['value_gap']?.answers || {};
          const tg = aa['tax_gap']?.results || aa['tax_gap']?.answers || {};
          const og = aa['operations_gap']?.results || aa['operations_gap']?.answers || {};
          const re = aa['recast_ebitda']?.results || aa['recast_ebitda']?.answers || {};
          const fa = aa['freedom_assessment']?.results || aa['freedom_assessment']?.answers || {};

          const targetBusinessId = promotionSummary.business_ids[0] || null;

          // Build a SCHEMA-VALID dashboard_metrics payload.
          //
          // Phase 6B.2 — this is the guest→member metrics defect.
          // dashboard_metrics keeps NUMERIC columns for scalar gap amounts and
          // JSONB *_details columns for the supporting detail object (see
          // migrations 002_dashboard_metrics_gap_details / add_gap_details_columns).
          // Passing the detail OBJECT into the numeric column made PostgREST
          // reject the whole statement, and the error was never read — so
          // promotion stored no metrics at all. Objects now go to *_details;
          // only numbers reach numeric columns.
          //
          // Fabricated scores (55 / 60 / 50 / 45 / 70) are removed: an unknown
          // score is absent, never invented. `??` is used throughout because `||`
          // discards a legitimate 0.
          const sev = (gap) => {
            if (gap == null) return null;
            if (gap > 500000) return 'significant';
            if (gap > 100000) return 'moderate';
            return 'small';
          };

          const profitGapAmount = pg.profit_gap ?? pg.gapToBest ?? pg.gap_to_best ?? null;
          const profitGapToAvg = pg.profit_gap_to_avg ?? pg.gapToAvg ?? pg.gap_to_avg ?? null;
          const currentMargin = pg.current_margin ?? pg.currentMargin ?? pg.p1_mymargin ?? null;

          const valueGapAmount = vg.value_gap ?? vg.valueGap ?? null;
          const currentValue = vg.current_value ?? vg.currentValue ?? null;
          const potentialValue = vg.potential_value ?? vg.potentialValue ?? null;

          const taxAnnual = tg.t3_annual_gap ?? tg.totalAnnualSavings ?? null;

          const opsScore = og.operations_score ?? og.operationsScore ?? null;
          const monthlyValueFreed = og.monthly_value_of_time_freed ?? og.monthly_value_freed ?? og.monthlyValueFreed ?? null;
          const hourlyValue = og.hourly_value_of_time_freed ?? og.hourly_value ?? og.hourly_value_freed ?? null;
          const hoursFreed = og.hours_freed_per_week ?? og.freed_hours_per_week ?? null;

          const recastAddBacks = re.total_addbacks ?? re.totalAddBacks ?? re.total_add_backs ?? null;
          const recastEbitdaVal = re.recast_ebitda ?? re.recastEbitda ?? null;
          const recastIncrease = re.recast_value_impact ?? re.valuationIncrease ?? re.valuation_increase ?? null;

          const freedomScore = fa.freedom_score ?? fa.freedomScore ?? null;
          const freedomDate = fa.freedom_date ?? fa.freedomDate ?? null;

          // IQ composite — only real scores contribute. No placeholder constants.
          const scoreInputs = [];
          if (pg.profit_score != null) scoreInputs.push(pg.profit_score);
          if (opsScore != null) scoreInputs.push(opsScore);
          if (freedomScore != null) scoreInputs.push(freedomScore);
          const ciqScore = scoreInputs.length > 0
            ? Math.round(scoreInputs.reduce((a, b) => a + b, 0) / scoreInputs.length)
            : null;

          const metricsPayload = {
            profile_id: profile.id,
            business_id: targetBusinessId,
            updated_at: now,
          };

          // ── NUMERIC columns — scalars only ─────────────────────────────────
          if (profitGapAmount != null) metricsPayload.profit_gap = profitGapAmount;
          if (valueGapAmount != null) metricsPayload.value_gap = valueGapAmount;
          if (taxAnnual != null) metricsPayload.tax_gap = taxAnnual;
          if (opsScore != null) metricsPayload.operations_gap = opsScore;
          if (recastEbitdaVal != null) metricsPayload.recast_ebitda = recastEbitdaVal;
          if (currentValue != null) metricsPayload.enterprise_value = currentValue;
          if (freedomScore != null) metricsPayload.freedom_score = freedomScore;
          if (ciqScore != null) metricsPayload.ciq_score = ciqScore;

          const revenue = aa['profit_gap']?.answers?.p1_rev ?? pg.revenue ?? null;
          if (revenue != null) metricsPayload.revenue = revenue;

          // ── JSONB *_details columns — metadata belongs here, not in numerics ─
          if (profitGapAmount != null) {
            metricsPayload.profit_gap_details = {
              gap_to_average: profitGapToAvg,
              gap_to_best: profitGapAmount,
              current_margin: currentMargin,
              severity: sev(profitGapAmount),
            };
          }
          if (valueGapAmount != null) {
            metricsPayload.value_gap_details = {
              current_value: currentValue,
              potential_value: potentialValue,
              gap_amount: valueGapAmount,
              severity: sev(valueGapAmount),
            };
          }
          if (taxAnnual != null) {
            metricsPayload.tax_gap_details = {
              annual_overpayment: taxAnnual,
              ten_year_cost: taxAnnual * 10,
              severity: sev(taxAnnual),
            };
          }
          if (opsScore != null) {
            metricsPayload.operations_gap_details = {
              score: opsScore,
              monthly_value_of_time_freed: monthlyValueFreed,
              hourly_value_of_time_freed: hourlyValue,
              hours_freed_per_week: hoursFreed,
              severity: opsScore < 45 ? 'significant' : opsScore < 75 ? 'moderate' : 'small',
            };
          }
          if (recastAddBacks != null || recastIncrease != null) {
            metricsPayload.recast_ebitda_gap_details = {
              add_backs: recastAddBacks,
              valuation_increase: recastIncrease,
            };
          }
          if (freedomScore != null || freedomDate != null) {
            metricsPayload.freedom_gap_details = { score: freedomScore, freedom_date: freedomDate };
          }

          // Upsert dashboard_metrics — profile_id, business_id, updated_at are baseline.
          if (Object.keys(metricsPayload).length > 3) {
            const { data: existingMetrics } = await sb.from('dashboard_metrics')
              .select('id').eq('profile_id', profile.id)
              .order('updated_at', { ascending: false }).limit(1).maybeSingle();

            const { error: metricsWriteErr } = existingMetrics
              ? await sb.from('dashboard_metrics').update(metricsPayload).eq('id', existingMetrics.id)
              : await sb.from('dashboard_metrics').insert({ ...metricsPayload, created_at: now });

            if (metricsWriteErr) {
              // Phase 6B.2 — surface the failure instead of claiming success.
              // The account, business and assessment promotions above DID succeed,
              // so the promotion is not rolled back; the metrics step is reported
              // as failed with enough context to retry it on its own.
              promotionSummary.metrics_synced = false;
              promotionSummary.metrics_error = metricsWriteErr.message;
              promotionSummary.warnings.push(`METRICS_SYNC_FAILED: dashboard_metrics write rejected — ${metricsWriteErr.message}`);
              console.error('[promoteGuestSession] dashboard_metrics write REJECTED — metrics NOT synced:', metricsWriteErr.message);
            } else {
              promotionSummary.metrics_synced = true;
              promotionSummary.stages.METRICS_SYNCED = true;
            }
          } else {
            promotionSummary.metrics_synced = false;
            promotionSummary.metrics_error = 'no_assessment_metrics_resolved';
            promotionSummary.warnings.push('METRICS_SYNC_FAILED: no assessment metrics could be resolved from the guest session');
          }
        } catch (metricsErr) {
          promotionSummary.metrics_synced = false;
          promotionSummary.metrics_error = metricsErr.message;
          promotionSummary.warnings.push(`METRICS_SYNC_FAILED: ${metricsErr.message}`);
          console.error('[promoteGuestSession] dashboard_metrics build FAILED:', metricsErr.message);
        }

        // 8. Mark guest session as promoted
        const { error: promoteErr } = await sb.from('guest_sessions')
          .update({ status: 'promoted', promoted_at: now, promoted_profile_id: profile.id, updated_at: now })
          .eq('guest_session_id', guest_session_id);

        if (promoteErr) throw new Error(promoteErr.message);

        promotionSummary.success = true;
        promotionSummary.profile_id = profile.id;
        promotionSummary.promoted_profile_id = profile.id;
        promotionSummary.stages.ACCOUNT_CREATED = true;
        promotionSummary.stages.BUSINESS_CREATED = promotionSummary.business_ids.length > 0;
        promotionSummary.stages.ASSESSMENT_PROMOTED = promotionSummary.assessment_ids.length > 0;

        return Response.json({ promotion_summary: promotionSummary });

      } catch (error) {
        return Response.json({ success: false, error: error.message, stage: 'promotion', partial_records_created: promotionSummary }, { status: 500 });
      }
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});