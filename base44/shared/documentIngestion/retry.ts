/**
 * Phase 6D.0c.3 — RETRY (durable, and structurally unable to extract).
 *
 * PRODUCT POLICY THIS MODULE BELONGS TO (it replaced the scope-confirmation gate):
 *
 *   VISION automatically extracts uploaded documents and automatically uses the
 *   evidence that is legitimately relevant to the active business. Document identity
 *   and evidence eligibility remain separate, and NO user confirmation is required
 *   merely because a personal document was uploaded in business context.
 *
 * So "Retry" is now only ever one thing: ENQUEUE THE DURABLE PIPELINE FROM THE
 * DOCUMENT'S CURRENT STATE. There is no decision to satisfy first, and therefore no
 * gate a retry could skip:
 *
 *   · this module owns NO extraction and imports no extraction engine — by
 *     construction, no user-reachable Retry can run a reader inline;
 *   · it hands off to the ONE durable resume (resumeIngestion → the canonical
 *     worker), which owns claiming, leasing, bounded retry and idempotency;
 *   · a state that owes no work at all (already completed) is reported honestly
 *     instead of being silently re-run.
 *
 * AUTHORIZATION. The tenant comes from the PERSISTED document row, never from the
 * request, and the caller injects the SAME shared document-authorization decision
 * used by document viewing. A denied actor gets one opaque answer and nothing runs.
 */

export async function retryDocumentIngestion({
  sb, documentId, authorizeDocument, resume, now = new Date().toISOString(),
}: any) {
  if (!documentId) return { ok: false, code: 'document_id_required' };

  const { data: doc, error: docErr } = await sb.from('documents')
    .select('id, name, document_type, document_scope, business_id, upload_status')
    .eq('id', documentId).maybeSingle();
  if (docErr) throw new Error(docErr.message);
  if (!doc) return { ok: false, code: 'not_found' };

  const verdict = await authorizeDocument(doc);
  if (!verdict?.authorized) return { ok: false, code: 'not_found' };

  if (typeof resume !== 'function') return { ok: false, code: 'resume_unavailable' };

  const outcome = await resume(documentId);
  if (outcome && outcome.ok === false) {
    // Nothing was enqueued, and why is the durable layer's own reason — reported,
    // never dressed up as success.
    return { ok: false, code: 'not_resumable', reason: outcome.reason || null, outcome: outcome.outcome || null };
  }

  // THE JOB ID IS RETURNED WITH THE ACCEPTANCE. `queued` is only ever a claim that
  // durable work exists, and a caller that cannot see WHICH ledger entry it just
  // accepted cannot prove that claim. The id is the durable layer's own — never
  // minted here.
  return {
    ok: true,
    resumed: true,
    enqueued_at: now,
    outcome: outcome?.outcome || 'resumed',
    job_id: outcome?.job_id ?? null,
  };
}