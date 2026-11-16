/**
 * factualAnswerView — what the answer surface shows for a FACTUAL answer, read
 * only from the server's answer contract (6D.0c.2). Labels come from the
 * resolution state, the missing list from the contract, and the source drawer
 * from the exact evidence envelopes — never from the model's own prose, and
 * never from unrelated assessment context.
 */

const STATES_WITH_EVIDENCE = ['VERIFIED', 'CONFIRMED', 'PROVISIONAL', 'CONFLICTED', 'AMBIGUOUS_PERIOD'];

export function factualAnswerView(answer) {
  const f = answer?.factual;
  if (!f) return { active: false };
  const hasPrimary = (f.primary_count || 0) > 0 || STATES_WITH_EVIDENCE.includes(f.resolution_state);
  const label = String(f.requested_label || '').toLowerCase();
  let labels = Array.isArray(f.labels) ? f.labels : [];
  // Two impossibilities, guarded on the surface too: NO SUPPORTING DATA beside
  // primary evidence, and "Missing: <metric>" for the metric being answered.
  if (hasPrimary) labels = labels.filter((l) => l !== 'NO SUPPORTING DATA');
  const missing = (f.missing || []).filter((m) => !(hasPrimary && label && String(m).toLowerCase().includes(label)));
  const sources = (f.sources || []).map((s) => ({
    key: `${s.role}-${s.document_id || 'doc'}-${s.field || ''}-${s.period || ''}-${s.value}`,
    role: s.role,
    document: s.document_name,
    documentId: s.document_id,
    period: s.period || 'Period not stated',
    field: s.field || 'unnamed field',
    reviewState: s.review_state,
  }));
  return { active: true, state: f.resolution_state, labels, missing, sources, nextStep: f.next_step || null, hasPrimary };
}