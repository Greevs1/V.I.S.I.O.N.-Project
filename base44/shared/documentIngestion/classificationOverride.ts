/**
 * Phase 6D.0c.3 — CLASSIFICATION OVERRIDE (the admin/expert correction path).
 *
 * Extracted from the request router so BOTH human decision paths live in the same
 * shared family and both hand off to the SAME durable resume:
 *
 *   owner confirmation  → confirmation.ts        → resumeIngestion
 *   admin override       → classificationOverride.ts → resumeIngestion
 *
 * It persists a decision and enqueues durable work. It never extracts.
 */

import { resumeIngestion } from './resume.ts';

const ALLOWED_OVERRIDE_ROLES = ['admin', 'super_admin', 'expert_advisor'];
const VALID_SCOPES = ['household', 'business', 'hybrid'];

export async function overrideDocumentClassification({ sb, base44, profile, user, data }: any) {
  if (!profile) return { status: 404, body: { error: 'Profile not found' } };

  const profileRole = profile.app_role || user?.role || 'owner';
  if (!ALLOWED_OVERRIDE_ROLES.includes(profileRole)) {
    return { status: 403, body: { error: 'Forbidden: admin or expert_advisor required' } };
  }

  const {
    documentId, documentName,
    newScope, newBusinessId, newDocumentType,
    previousScope, previousBusinessId, previousDocumentType,
  } = data || {};

  if (!documentId) return { status: 400, body: { error: 'documentId required' } };
  if (!newScope) return { status: 400, body: { error: 'newScope required' } };
  if (newScope === 'business' && !newBusinessId) {
    return { status: 400, body: { error: 'businessId is required when scope is "business"' } };
  }
  if (!VALID_SCOPES.includes(newScope)) {
    return { status: 400, body: { error: `Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}` } };
  }

  const now = new Date().toISOString();
  // Enforce safety rule: household → business_id must be null
  const safeBusinessId = newScope === 'household' ? null : (newBusinessId || null);

  // 1. Update documents table
  const docPatch: any = { document_scope: newScope, business_id: safeBusinessId, updated_at: now };
  if (newDocumentType && newDocumentType !== previousDocumentType) {
    docPatch.document_type = newDocumentType;
  }
  const { error: docUpdateErr } = await sb.from('documents').update(docPatch).eq('id', documentId);
  if (docUpdateErr) {
    console.error('[overrideDocumentClassification] documents update error:', docUpdateErr.message);
    return { status: 500, body: { error: docUpdateErr.message } };
  }

  // 2. Update DocumentClassification record (audit state machine) — Base44 entity
  const classificationPatch = {
    classification_status: 'overridden',
    classification_source: 'admin_manual',
    reviewed_by_id: profile.id,
    reviewed_by_name: user?.full_name || user?.email,
    reviewed_by_role: profileRole,
    reviewed_at: now,
  };

  try {
    const existingClassifications = await base44.asServiceRole.entities.DocumentClassification.filter(
      { document_id: documentId }, '-created_date', 1,
    );
    if (existingClassifications?.length > 0) {
      await base44.asServiceRole.entities.DocumentClassification.update(
        existingClassifications[0].id, classificationPatch,
      );
    } else {
      await base44.asServiceRole.entities.DocumentClassification.create({
        document_id: documentId,
        document_name: documentName || documentId,
        profile_id: profile.id,
        ...classificationPatch,
        original_folder: 'inbox',
      });
    }
  } catch (classErr: any) {
    console.warn('[overrideDocumentClassification] DocumentClassification update skipped (non-fatal):', classErr.message);
  }

  // 3. Create ClientNote audit record
  const scopeChanged = newScope !== previousScope;
  const bizChanged = safeBusinessId !== (previousBusinessId || null);
  const typeChanged = newDocumentType && newDocumentType !== previousDocumentType;

  const changeParts: string[] = [];
  if (scopeChanged) changeParts.push(`Scope: "${previousScope || 'unset'}" → "${newScope}"`);
  if (bizChanged) changeParts.push(`Business ID: "${previousBusinessId || 'none'}" → "${safeBusinessId || 'none'}"`);
  if (typeChanged) changeParts.push(`Document Type: "${previousDocumentType || 'unset'}" → "${newDocumentType}"`);

  const noteContent = [
    'Document Classification Override',
    `Document: ${documentName || documentId}`,
    `Overridden by: ${user?.full_name || user?.email} (${profileRole})`,
    `Timestamp: ${now}`,
    '',
    'Changes:',
    ...changeParts.map((c) => `  • ${c}`),
  ].join('\n');

  const { data: docOwner } = await sb.from('documents').select('profile_id').eq('id', documentId).maybeSingle();
  const ownerProfileId = docOwner?.profile_id || profile.id;

  await base44.asServiceRole.entities.ClientNote.create({
    profile_id: ownerProfileId,
    business_id: safeBusinessId || null,
    created_by_profile_id: profile.id,
    created_by_name: user?.full_name || user?.email,
    note_type: 'document_review_note',
    title: `Classification Override: ${documentName || documentId}`,
    content_html: `<pre>${noteContent}</pre>`,
    plain_text: noteContent,
    visibility: 'internal_only',
    status: 'active',
    related_source_type: 'document',
    related_source_id: documentId,
  });

  console.log(`[overrideDocumentClassification] Document ${documentId} reclassified by ${user?.email} (${profileRole}). Changes: ${changeParts.join('; ')}`);

  // ── RESUME THE SAME DURABLE PIPELINE (6D.0c §5/§6) ──────────────────────
  // A human decision is the event the pipeline was WAITING for. This handler does
  // not extract, and the browser does not extract: it persists the decision
  // (above), synchronizes the applied type, transitions the canonical analysis out
  // of its settled state and enqueues durable work. The canonical worker
  // (processDocumentIngestionJob) owns every attempt that follows.
  //
  // Best-effort by design: a resume that cannot be enqueued must never fail the
  // confirmation the human just made — the decision is already persisted.
  let ingestion = null;
  try {
    ingestion = await resumeIngestion({ sb, base44, documentId, now });
  } catch (resumeErr: any) {
    console.error('[overrideDocumentClassification] resume failed:', resumeErr?.message || resumeErr);
  }

  return {
    status: 200,
    body: {
      success: true,
      documentId,
      newScope,
      newBusinessId: safeBusinessId,
      newDocumentType: docPatch.document_type || previousDocumentType,
      changes: changeParts,
      ingestion: ingestion
        ? { outcome: ingestion.outcome, job_id: ingestion.job_id || null, type_synchronized: !!ingestion.type_synchronized }
        : null,
    },
  };
}