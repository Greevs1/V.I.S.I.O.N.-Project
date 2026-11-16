/**
 * discoveryPromotion — the CANONICAL PROMOTION BOUNDARY for a guest discovery.
 *
 * THE DEFECT IT CLOSES
 *   A guest explores a SPECIFIC opportunity (owner dependency, or the value gap)
 *   and preserves the business. Promotion carried the answers and the assessments
 *   but not the discovery, so the authenticated surface reconstructed a GENERIC
 *   value gap. The thread the owner was pulling disappeared at the exact moment
 *   they signed up — an experience cliff, not a feature gap.
 *
 * THE PRINCIPLE
 *   Guest state is NOT canonical truth. Nothing here copies an opportunity, a
 *   value, a confidence or a piece of evidence out of the browser. Promotion
 *   RE-DERIVES the discovery from the canonical rows that were just written
 *   (`business_entities`, `business_assessments`) and persists only what the
 *   server itself computed, through the EXISTING `galileo_opportunities` writer
 *   and its existing lifecycle (status enum, scores, reasoning, evidence_sources).
 *   No guest-specific opportunity object exists.
 *
 * WHAT THE CLIENT MAY INFLUENCE
 *   Exactly one thing, and it is a TOKEN, never content: which of the server's OWN
 *   candidates the guest was looking at. An absent, unknown or non-derived token is
 *   ignored, and the strongest derived candidate resumes. A token cannot create an
 *   opportunity, cannot set a value, and cannot bring a second business into scope.
 *
 * IDEMPOTENT BY CONSTRUCTION
 *   A promoted opportunity is identified by `reasoning.opportunity_key`. A key that
 *   already exists canonically is REUSED — never re-created — so a repeated
 *   promotion, a retried verification callback or a refresh mid-handoff cannot
 *   duplicate. Identity is scoped by `business_id`, so no other business inherits it.
 */

/** The canonical opportunity keys this boundary can derive. */
export const OPPORTUNITY_KEY = {
  VALUE_GAP: 'value_gap',
  OWNER_DEPENDENCY: 'owner_dependency',
};

/**
 * Owner involvement → operations health. Mirrors the discovery engine's mapping
 * EXACTLY, so the opportunity the owner resumes is the same one they saw.
 */
const INVOLVEMENT_TO_OPS = { light: 75, moderate: 58, heavy: 33 };

/** The ONLY tokens a caller may send. This is an allowlist, not a parser. */
const EXPLORED_HINTS = [OPPORTUNITY_KEY.VALUE_GAP, OPPORTUNITY_KEY.OWNER_DEPENDENCY];

/** Deterministic ranking, in one place, so the resumed opportunity is explainable. */
const STRATEGIC_SCORE = {
  [OPPORTUNITY_KEY.VALUE_GAP]: 70,
  [OPPORTUNITY_KEY.OWNER_DEPENDENCY]: { heavy: 68, moderate: 62 },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v) => Math.round(v);

/**
 * confidenceFor — confidence is a function of WHAT THE EVIDENCE IS.
 * It is never supplied by a caller and never exceeds what a modeled figure earns.
 */
const confidenceFor = (documentBacked) => (documentBacked ? 70 : 45);

/**
 * evidenceBasisFromGuestSession — is the discovery resting on a document the owner
 * actually supplied, or on figures they reported? Read from the server-held guest
 * session row (never from a request body).
 */
export function evidenceBasisFromGuestSession(guestSession) {
  const facts = guestSession?.business_snapshot?.extracted_facts || null;
  if (!facts || typeof facts !== 'object') return { documentBacked: false };
  for (const value of Object.values(facts)) {
    const f = value?.facts || value;
    if (!f || typeof f !== 'object') continue;
    const documented = f.reported_ebitda?.normalized ?? f.operating_income?.normalized ?? f.annual_revenue?.normalized;
    if (num(documented) != null) return { documentBacked: true };
  }
  return { documentBacked: false };
}

/**
 * deriveDiscoveredOpportunities — the SERVER's own discovery.
 *
 * @param {object} canonical — read from canonical rows only:
 *   { industry, revenue, ebitda, involvement, valueGap, ebitdaSource }
 * @returns {Array<object>} candidates, each carrying its canonical key
 */
export function deriveDiscoveredOpportunities(canonical = {}) {
  const documentBacked = canonical.ebitdaSource === 'document';
  const confidence = confidenceFor(documentBacked);
  const evidenceBasis = documentBacked ? 'owner_supplied_document' : 'owner_reported';
  const industry = canonical.industry ?? null;
  const revenue = num(canonical.revenue);
  const ebitda = num(canonical.ebitda);
  const valueGap = num(canonical.valueGap);
  const involvement = canonical.involvement ?? null;
  // Owner dependency is a candidate only when the owner actually reported real
  // involvement — the same gate the discovery engine uses. Light involvement is not
  // a constraint on value, so it must not become one after promotion.
  const dependencyApplies = involvement === 'heavy' || involvement === 'moderate';
  const opsScore = dependencyApplies ? INVOLVEMENT_TO_OPS[involvement] : null;

  const candidates = [];

  // ── VALUE GAP — only when the promoted valuation actually produced one ─────
  if (valueGap != null && valueGap > 0) {
    candidates.push({
      opportunity_key: OPPORTUNITY_KEY.VALUE_GAP,
      title: 'Value Gap',
      description:
        'Your business may be worth meaningfully more than its current trajectory suggests. Closing the gap between your current and potential valuation is one of the highest-leverage moves available to you.',
      category: 'value',
      expected_outcome: 'Close the gap between current and potential business value.',
      estimated_value_created: round(valueGap),
      strategic_opportunity_score: STRATEGIC_SCORE[OPPORTUNITY_KEY.VALUE_GAP],
      confidence_score: confidence,
      evidence_basis: evidenceBasis,
      why: revenue != null
        ? 'Derived from the valuation your own figures support after promotion.'
        : 'Derived from the valuation your figures support after promotion.',
      derived_from: ['business_assessments:value_gap'],
      evidence_sources: [
        { record_type: 'business_assessment', record_key: 'value_gap', label: 'Promoted value gap assessment' },
        { record_type: evidenceBasis, label: documentBacked ? 'Financial statement supplied by the owner' : 'Figures reported by the owner' },
      ],
      strategies: [
        'Reduce owner dependency (improves multiple)',
        'Strengthen recurring revenue',
        'Document systems & processes',
        'Improve margin consistency',
      ],
    });
  }

  // ── OWNER DEPENDENCY — only when the owner reported real involvement ────────
  if (opsScore != null) {
    // The same rule the discovery engine uses: the lower the operations health,
    // the more of the value a transfer would give away.
    const multipleUplift = Math.max(0, (75 - opsScore) / 75) * 1.5;
    const dependencyImpact = ebitda != null && ebitda > 0 ? round(ebitda * multipleUplift) : null;
    candidates.push({
      opportunity_key: OPPORTUNITY_KEY.OWNER_DEPENDENCY,
      title: 'Owner Dependency',
      description:
        'How much the business depends on you day-to-day is likely affecting both your freedom and what a buyer would pay. Reducing owner dependency is one of the few moves that improves value, operations, and freedom at the same time.',
      category: 'operations',
      expected_outcome: 'Run the business with less of you in it, and keep more of its value on a transfer.',
      estimated_value_created: dependencyImpact ?? undefined,
      impact_score: dependencyImpact ?? undefined,
      strategic_opportunity_score: STRATEGIC_SCORE[OPPORTUNITY_KEY.OWNER_DEPENDENCY][involvement] ?? 60,
      confidence_score: confidence,
      evidence_basis: evidenceBasis,
      why: `Estimated operations health ${opsScore}/100 from the involvement you reported.`,
      derived_from: ['business_assessments:operations_gap'],
      evidence_sources: [
        { record_type: 'business_assessment', record_key: 'operations_gap', label: 'Promoted operations assessment' },
        { record_type: evidenceBasis, label: documentBacked ? 'Financial statement supplied by the owner' : 'Figures reported by the owner' },
      ],
      strategies: [
        'Document your key processes',
        'Delegate one operational area',
        'Build a management layer',
        'Reduce hours worked per week',
      ],
    });
  }

  return candidates;
}

/** opportunityKeyOf — the canonical identity of a promoted opportunity. */
export function opportunityKeyOf(record) {
  return record?.reasoning?.opportunity_key || null;
}

/** Lifecycle states that mean "this identity is already spent". */
const SPENT_STATUSES = ['archived', 'superseded'];

/**
 * planOpportunityWrites — decides, without writing, what promotion should do.
 *
 * Idempotent by identity: an existing key is reused, never re-created. The owner's
 * ACTIVE work is protected: an opportunity that already became a Play
 * (`converted_to_path` / `path_id`) is never demoted.
 *
 * @returns {{ create: Array, activateExistingId: string|null, demoteIds: Array, reusedKeys: Array }}
 */
export function planOpportunityWrites({ existing = [], candidates = [], exploredKey = null } = {}) {
  const live = existing.filter((r) => !SPENT_STATUSES.includes(r?.status));
  const byKey = new Map();
  for (const r of live) {
    const key = opportunityKeyOf(r);
    if (key && !byKey.has(key)) byKey.set(key, r);
  }

  const create = [];
  const reusedKeys = [];
  for (const c of candidates) {
    if (byKey.has(c.opportunity_key)) reusedKeys.push(c.opportunity_key);
    else create.push(c);
  }

  // Which one resumes? The token, but ONLY if the server derived that candidate.
  const derivedKeys = candidates.map((c) => c.opportunity_key);
  const hinted = EXPLORED_HINTS.includes(exploredKey) && derivedKeys.includes(exploredKey) ? exploredKey : null;
  const strongest = [...candidates].sort(
    (a, b) => (b.strategic_opportunity_score || 0) - (a.strategic_opportunity_score || 0)
  )[0];
  const resumedKey = hinted || strongest?.opportunity_key || null;

  const activeExisting = live.find((r) => r?.status === 'active') || null;
  const demoteIds = activeExisting && opportunityKeyOf(activeExisting) !== resumedKey
    && !activeExisting.converted_to_path && !activeExisting.path_id
      ? [activeExisting.id]
      : [];

  const activateExistingId = resumedKey && byKey.has(resumedKey) ? byKey.get(resumedKey).id : null;

  return { create, activateExistingId, demoteIds, reusedKeys, resumedKey };
}

/**
 * promoteDiscoveredOpportunity — persist the re-derived discovery canonically.
 *
 * Reads ONLY canonical rows (plus the server-held guest session row to know
 * whether the figures came from a supplied document). Uses the service role the
 * existing opportunity engine uses, and the existing entity — no parallel writer.
 */
export async function promoteDiscoveredOpportunity({ base44, sb, profileId, businessId, guestSession }) {
  const outcome = { created: 0, reused: 0, activated: null, demoted: 0, resumed_key: null, skipped: null };
  if (!businessId || !profileId) { outcome.skipped = 'missing_scope'; return outcome; }

  // 1. CANONICAL READS — the only inputs this boundary trusts.
  const { data: biz } = await sb.from('business_entities')
    .select('id, industry, business_name')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz) { outcome.skipped = 'business_not_found'; return outcome; }

  const { data: assessments } = await sb.from('business_assessments')
    .select('id, assessment_type, answers, results')
    .eq('profile_id', profileId)
    .eq('business_id', businessId);

  const byType = {};
  for (const a of assessments || []) byType[a.assessment_type] = a;

  const valueGap = num(byType.value_gap?.results?.value_gap);
  const revenue = num(byType.profit_gap?.answers?.p1_rev);
  const margin = num(byType.profit_gap?.answers?.ebitda_margin);
  const involvement = byType.operations_gap?.answers?.involvement ?? null;
  // EBITDA itself is re-derived from the promoted revenue and margin — no figure
  // arrives from a request body.
  const ebitda = revenue != null && margin != null ? (revenue * margin) / 100 : null;

  const { documentBacked } = evidenceBasisFromGuestSession(guestSession);
  const candidates = deriveDiscoveredOpportunities({
    industry: biz.industry,
    revenue,
    ebitda,
    involvement,
    valueGap,
    ebitdaSource: documentBacked ? 'document' : 'reported',
  });
  if (candidates.length === 0) { outcome.skipped = 'nothing_derived'; return outcome; }

  // 2. EXISTING CANONICAL STATE — scoped to THIS business.
  const existingRes = await base44.asServiceRole.entities.galileo_opportunities
    .filter({ business_id: businessId }, { limit: 100 });
  const existing = Array.isArray(existingRes) ? existingRes : (existingRes?.items || []);

  const plan = planOpportunityWrites({
    existing,
    candidates,
    exploredKey: guestSession?.state_snapshot?.explored_opportunity_key || null,
  });
  outcome.reused = plan.reusedKeys.length;
  outcome.resumed_key = plan.resumedKey;

  // 3. PROTECT the owner's in-flight work before changing what leads Home.
  for (const id of plan.demoteIds) {
    await base44.asServiceRole.entities.galileo_opportunities.update(id, { status: 'available' });
    outcome.demoted += 1;
  }

  // 4. CREATE only what the server derived and the business does not already have.
  for (const c of plan.create) {
    const created = await base44.asServiceRole.entities.galileo_opportunities.create({
      profile_id: profileId,
      business_id: businessId,
      title: c.title,
      description: c.description,
      category: c.category,
      source: 'guest_discovery',
      expected_outcome: c.expected_outcome,
      estimated_value_created: c.estimated_value_created,
      impact_score: c.impact_score,
      strategic_opportunity_score: c.strategic_opportunity_score,
      confidence_score: c.confidence_score,
      status: c.opportunity_key === plan.resumedKey ? 'active' : 'available',
      industry_context: biz.industry || null,
      recommendation_reason: c.why,
      // Identity + provenance. `evidence_basis` records what the evidence IS; it
      // never asserts that anything was verified.
      reasoning: {
        opportunity_key: c.opportunity_key,
        why: c.why,
        derived_from: c.derived_from,
        evidence_basis: c.evidence_basis,
        strategies: c.strategies,
        promoted_from_guest_discovery: true,
      },
      evidence_sources: c.evidence_sources,
    });
    outcome.created += 1;
    if (c.opportunity_key === plan.resumedKey) outcome.activated = created?.id || null;
  }

  // 5. A reused identity already carrying the right status needs no write; one
  //    that is merely 'available' is promoted to the lead, because the owner was
  //    already investigating it.
  if (!outcome.activated && plan.activateExistingId) {
    await base44.asServiceRole.entities.galileo_opportunities.update(plan.activateExistingId, { status: 'active' });
    outcome.activated = plan.activateExistingId;
  }

  return outcome;
}