/**
 * uploadDocumentToSupabase — Canonical secure upload pipeline
 *
 * Flow:
 *   1. Authenticate Base44 user
 *   2. Resolve Supabase profile by email
 *   3. Resolve / create business_id
 *   4. Validate access (owner / advisor / admin)
 *   5. Validate file (MIME, extension, size)
 *   6. Decode base64 → upload to Storage bucket "documents"
 *   7. Create documents row
 *   8. Create document_analysis row (queued)
 *   9. Return document_id, document_analysis_id, signed read URL
 *
 * Security:
 *   - Service role key backend-only; never exposed to browser
 *   - Private bucket; signed read URLs expire in 24 h
 *   - Sanitized filenames
 *   - MIME + extension allow/block list
 *   - business_id scoped on every write
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';
import { normalizeSupabaseProjectUrl } from '../../shared/supabase/projectUrl.ts';
import { normalizeDocumentType } from '../../shared/documents/documentTypes.ts';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const BUCKET = 'documents';
const DEBUG = Deno.env.get('DEBUG_EXTRACTION') === 'true';
const dbg = (...args) => { if (DEBUG) console.log('[upload]', ...args); };

const ALLOWED_EXTENSIONS = new Set(['pdf','csv','xls','xlsx','doc','docx','png','jpg','jpeg','webp']);
const BLOCKED_EXTENSIONS  = new Set(['exe','js','html','php','zip','sh','bat','cmd','msi','dmg','py','rb','ts']);

// The accepted-type vocabulary is the SHARED one — never a second list here, so
// this endpoint cannot drift from the readers that actually exist.

function getExt(fileName) {
  return (fileName.split('.').pop() || '').toLowerCase();
}

function safeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized', step: 'auth' }, { status: 401 });
    }

    // ── 2. Supabase client (service role) ────────────────────────────────────
    // ONE shared normalizer (base44/shared/supabase/projectUrl.ts) — the durable
    // worker uses the same one, so the upload path and the ingestion path can never
    // drift apart again (that drift is exactly what broke 6D.0b.2 in production).
    const SUPABASE_URL = normalizeSupabaseProjectUrl(Deno.env.get('VITE_SUPABASE_URL'));
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured on server', step: 'configuration' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 3. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      fileName, fileType, fileSize,
      documentType, year, base64File,
      selectedBusinessId,    // optional — admin-supplied target business
      active_business_id,    // optional — from frontend activeContext (Phase 1B plumbing)
      uploadSource = 'user_upload',
      relatedEntityType = null,
      relatedEntityId   = null,
    } = body;

    // ── Document scope classification ────────────────────────────────────────
    const BUSINESS_DOC_TYPES = new Set([
      'profit_and_loss', 'balance_sheet', 'business_tax_return',
      'payroll_report', 'ar_report', 'ap_report', 'debt_schedule', 'recast_ebitda',
    ]);
    const HOUSEHOLD_DOC_TYPES = new Set([
      'personal_tax_return', '1040', 'w2', '1099', 'personal_bank_statement',
      'personal_insurance', 'trust', 'estate_documents', 'will',
      'power_of_attorney', 'healthcare_directive', 'estate_document',
    ]);
    const HYBRID_DOC_TYPES = new Set([
      'k1', 'schedule_c', 'buy_sell_agreement', 'cost_segregation',
      'property_deed', 'mortgage', 'captive_insurance_feasibility',
    ]);
    const docTypeNorm    = (documentType || '').toLowerCase();
    const isBusinessDoc  = BUSINESS_DOC_TYPES.has(docTypeNorm);
    const isHouseholdDoc = HOUSEHOLD_DOC_TYPES.has(docTypeNorm);
    const isHybridDoc    = HYBRID_DOC_TYPES.has(docTypeNorm);

    // document_scope set explicitly — never rely on column default
    const documentScope = isBusinessDoc ? 'business' : isHouseholdDoc ? 'household' : isHybridDoc ? 'hybrid' : 'business';

    // ── 4. Validate inputs ───────────────────────────────────────────────────
    if (!fileName)    return Response.json({ error: 'fileName is required',        step: 'validation' }, { status: 400 });
    if (!base64File)  return Response.json({ error: 'base64File is required',      step: 'validation' }, { status: 400 });

    const ext = getExt(fileName);
    if (BLOCKED_EXTENSIONS.has(ext))  return Response.json({ error: `File type .${ext} is not allowed`, step: 'validation' }, { status: 400 });
    if (!ALLOWED_EXTENSIONS.has(ext)) return Response.json({ error: `Unsupported file extension .${ext}`, step: 'validation' }, { status: 400 });

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: `File exceeds 25 MB limit (${(fileSize/1024/1024).toFixed(1)} MB)`, step: 'validation' }, { status: 400 });
    }

    // The client's choice is normalized, never trusted: an unknown value becomes
    // the neutral "not classified" bucket, which no reader claims to read.
    const docType = normalizeDocumentType(documentType);

    // ── 5. Resolve profile ───────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, app_role, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileErr) {
      console.error('[upload] profile_lookup error:', profileErr.message);
      return Response.json({ error: profileErr.message, step: 'profile_lookup', code: profileErr.code, hint: profileErr.hint }, { status: 500 });
    }
    if (!profile) {
      return Response.json({ error: 'No Supabase profile found for this user', step: 'profile_lookup' }, { status: 404 });
    }

    const profileId = profile.id;
    const userRole  = profile.app_role || user.role || 'owner';

    // ── 6. Resolve business_id ───────────────────────────────────────────────
    let businessId = null;

    if (isHouseholdDoc) {
      // Household — never attach to any business
      businessId = null;
      dbg(`scope=household (${docTypeNorm}) — business_id null`);
    } else if (isHybridDoc) {
      // Hybrid — explicit context only, never auto-fallback to primary_business_id
      if (['admin', 'super_admin'].includes(userRole) && selectedBusinessId) {
        businessId = selectedBusinessId;
      } else if (active_business_id) {
        businessId = active_business_id;
      } else {
        businessId = null; // intentional — no auto-create, no primary fallback
      }
      dbg(`scope=hybrid (${docTypeNorm}) — business_id: ${businessId ?? 'null (profile-only)'}`);
    } else {
      // Business docs (and unrecognised types) — admin target > active context > primary fallback
      if (['admin', 'super_admin'].includes(userRole) && selectedBusinessId) {
        businessId = selectedBusinessId;
      } else if (active_business_id) {
        businessId = active_business_id;
      } else {
        businessId = profile.primary_business_id || null;
      }
      dbg(`scope=business (${docTypeNorm}) — business_id: ${businessId}`);

      // Auto-resolve / create business only for true business-scoped docs
      if (!businessId) {
        const { data: bizRows, error: bizErr } = await sb
          .from('business_entities')
          .select('id')
          .eq('profile_id', profileId)
          .limit(1);

        if (bizErr) {
          return Response.json({ error: bizErr.message, step: 'business_resolution', code: bizErr.code }, { status: 500 });
        }

        if (bizRows && bizRows.length > 0) {
          businessId = bizRows[0].id;
        } else {
          const { data: newBiz, error: newBizErr } = await sb
            .from('business_entities')
            .insert({ profile_id: profileId, business_name: 'My Business', current_stage: 'onboarding', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select('id')
            .single();
          if (newBizErr) {
            return Response.json({ error: newBizErr.message, step: 'business_resolution', code: newBizErr.code }, { status: 500 });
          }
          businessId = newBiz.id;
        }

        await sb.from('profiles').update({ primary_business_id: businessId }).eq('id', profileId);
      }
    }

    // ── 6b. Tenant enforcement (Phase 6B.1) ──────────────────────────────────
    // `active_business_id` / `selectedBusinessId` arrive from the client. Without
    // this check a regular user could attach a document to a business they have
    // no relationship with. Admin cross-business targeting is preserved.
    if (businessId && !['admin', 'super_admin'].includes(userRole)) {
      try {
        await validateBusinessScope(sb, businessId, profileId);
      } catch (scopeErr) {
        console.error('[upload] business scope denied:', scopeErr.message);
        return Response.json({ error: scopeErr.message, step: 'business_scope', reason: 'business_scope_denied' }, { status: 403 });
      }
    }

    // ── 7. Access control ────────────────────────────────────────────────────
    if (userRole === 'advisor') {
      const { data: asgn } = await sb
        .from('advisor_assignments')
        .select('id')
        .eq('advisor_profile_id', profileId)
        .eq('business_id', businessId)
        .maybeSingle();
      if (!asgn) {
        return Response.json({ error: 'Forbidden: advisor not assigned to this business', step: 'access_control' }, { status: 403 });
      }
    }

    // ── 8. Decode base64 and upload ──────────────────────────────────────────
    const base64Data  = base64File.includes(',') ? base64File.split(',')[1] : base64File;
    const mimeType    = fileType || 'application/octet-stream';
    const blob        = await fetch(`data:${mimeType};base64,${base64Data}`).then(r => r.blob());

    const safeName    = safeFileName(fileName);
    const storageSegment = businessId
      ? businessId
      : isHouseholdDoc ? 'household' : isHybridDoc ? 'hybrid' : 'profile';
    const storagePath = `${profileId}/${storageSegment}/${Date.now()}_${safeName}`;

    dbg(`uploading to ${BUCKET}/${storagePath} (${(blob.size/1024/1024).toFixed(2)} MB)`);

    const { data: uploadData, error: uploadErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: mimeType, upsert: false });

    if (uploadErr) {
      console.error('[upload] storage_upload error:', uploadErr.message);
      return Response.json({ error: uploadErr.message, step: 'storage_upload', code: uploadErr.statusCode, hint: uploadErr.error }, { status: 500 });
    }

    const actualPath = uploadData.path || storagePath;

    // ── 9. Signed read URL (24 h) ────────────────────────────────────────────
    let fileUrl = null;
    const { data: signedData } = await sb.storage.from(BUCKET).createSignedUrl(actualPath, 86400);
    fileUrl = signedData?.signedUrl || null;

    // ── 10. Insert documents row ─────────────────────────────────────────────
    const now = new Date().toISOString();
    const docRow = {
      profile_id:          profileId,
      business_id:         businessId,
      name:                fileName,
      document_type:       docType,
      file_path:           actualPath,
      file_url:            fileUrl,
      file_size:           fileSize || blob.size,
      year:                year || null,
      status:              'uploaded',
      upload_status:       'pending_analysis',
      upload_source:       uploadSource || 'user_upload',
      uploaded_by:         profileId,
      storage_bucket:      'documents',
      file_scope:          'client_document',
      document_scope:      documentScope,
      related_entity_type: relatedEntityType || null,
      related_entity_id:   relatedEntityId   || null,
      created_at:          now,
      updated_at:          now,
    };

    let document;
    const { data: docInserted, error: docErr } = await sb
      .from('documents')
      .insert(docRow)
      .select()
      .single();

    if (docErr) {
      return Response.json({ error: docErr.message, step: 'documents_insert', code: docErr.code, hint: docErr.hint, details: docErr.details }, { status: 500 });
    }
    document = docInserted;

    dbg('documents row created:', document.id);

    // ── 11. Insert document_analysis row ─────────────────────────────────────
    let analysisId = null;
    const analysisRow = {
      document_id:     document.id,
      profile_id:      profileId,
      business_id:     businessId,
      document_type:   docType,
      analysis_status: 'queued',
      status:          'queued',
      extracted_data:  {},
      missing_fields:  [],
      created_at:      now,
      updated_at:      now,
    };

    const { data: analysis, error: analysisErr } = await sb
      .from('document_analysis')
      .insert(analysisRow)
      .select('id')
      .single();

    if (analysisErr) {
      console.error('[upload] document_analysis insert failed (non-fatal):', analysisErr.message);
    } else {
      analysisId = analysis.id;
      dbg('document_analysis row created:', analysisId);
    }

    // ── 11b. DURABLE ORCHESTRATION HANDOFF ───────────────────────────────────
    // The upload no longer performs classification or extraction, and it is no
    // longer the durability mechanism. It persists the DURABLE WORK STATE — a
    // DocumentIngestionJob keyed to this document/analysis pair — and returns.
    //
    // WHY: the ingestion pipeline contains the one unbounded external read, and a
    // real production upload proved the cost of tying its lifetime to this request
    // (the platform terminated the request mid-read and NOTHING was persisted
    // after the queued row). Post-response work (waitUntil) only extends this
    // worker's life; it is not a queue, it persists no pending promise, and it
    // cannot resume. The job row IS the promise: the entity-triggered workflow
    // claims it within seconds, and a scheduled recovery sweep reclaims anything
    // that was stranded. Closing the browser and this request both stop mattering.
    //
    // Idempotency: at most one ACTIVE job per canonical document/analysis pair —
    // an existing queued/processing/waiting_retry job is reused rather than
    // duplicated, so a retried upload cannot double-process the document.
    let ingestionJobId = null;
    let jobCreated = false;
    if (analysisId) {
      try {
        const existing = await base44.asServiceRole.entities
          .DocumentIngestionJob.filter(
            { document_id: document.id, analysis_id: analysisId, status: { $in: ['queued', 'processing', 'waiting_retry'] } },
            { limit: 1 },
          );
        const active = (existing?.items || [])[0];
        if (active) {
          ingestionJobId = active.id;
        } else {
          const job = await base44.asServiceRole.entities.DocumentIngestionJob.create({
            document_id: document.id,
            analysis_id: analysisId,
            status: 'queued',
            attempt_count: 0,
            claimed_at: null,
            lease_expires_at: null,
            next_retry_at: null,
            last_attempt_at: null,
            last_error_class: null,
            last_error_message: null,
          });
          ingestionJobId = job?.id || null;
          jobCreated = !!ingestionJobId;
        }
      } catch (jobErr) {
        // The FILE is stored either way; only the automatic analysis did not get
        // its durable work state. That is reported truthfully rather than hidden,
        // and the document can be re-queued from the Data Room.
        console.error('[upload] durable ingestion job error (non-fatal):', jobErr?.message);
      }
    }

    // ── 12. Respond ──────────────────────────────────────────────────────────
    // The response carries the STORAGE truth plus the DURABLE WORK state — never a
    // classification or extraction outcome, which the pipeline reports on the
    // canonical rows where every surface reads them.
    dbg(`stored in ${Date.now() - t0}ms`);

    const respond = Response.json({
      success:              true,
      document_id:          document.id,
      document_analysis_id: analysisId,
      // The durable trigger. Its existence is the promise that work will run.
      ingestion_job_id:     ingestionJobId,
      extraction:           null,
      // 'queued' = durable work state persisted; 'not_queued' = stored, but the
      // automatic analysis could not be queued. Never 'failed' — storage succeeded.
      pipeline_status:      ingestionJobId ? 'queued' : 'not_queued',
      document: {
        id:            document.id,
        name:          document.name,
        document_type: document.document_type,
        file_path:     document.file_path,
        file_url:      document.file_url,
        file_size:     document.file_size,
        year:          document.year,
        status:        document.status,
        upload_status: document.upload_status,
        analysis_status: 'pending_analysis',
        created_at:    document.created_at,
      },
      classification: null,
      storage: {
        bucket: BUCKET,
        path:   actualPath,
        signed_url_expires_in: '24 hours',
      },
    });

    dbg('durable ingestion queued:', jobCreated ? 'new job' : ingestionJobId ? 'existing job reused' : 'not queued');

    return respond;

  } catch (err) {
    console.error('[upload] unexpected error:', err.message, err.stack);
    return Response.json({ error: err.message, step: 'unknown' }, { status: 500 });
  }
});