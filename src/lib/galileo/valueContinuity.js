/**
 * Value Continuity — the discovery VISION already found, re-derived from CANONICAL state.
 *
 * WHY THIS FILE EXISTS
 *   A guest answers "revenue" and "EBITDA", sees a potential value gap, and then
 *   preserves the business. Authenticated Home must never answer that with
 *   "I'm still building my understanding of your business." The same conclusion is
 *   still true — it now has canonical backing — so it must still be said.
 *
 * WHAT IT MAY USE
 *   Only values that already exist server-side after promotion:
 *     · the value gap / current value / potential value the promotion wrote into
 *       the value_gap assessment (surfaced by BIS as `valuation.*`), and
 *     · the operations / freedom score the promotion wrote from the owner's own
 *       involvement answer.
 *   Nothing is carried over from the guest tab, and nothing is invented here.
 *
 * WHY IT IS A DERIVATION, NOT A COPY
 *   The guest's number and this number are the SAME number because they come from
 *   the same inputs. If the canonical value is absent, this returns what is absent
 *   (`valueGap: null`) rather than replaying a tab-scoped memory — that would be
 *   cosmetic continuity, which the product must never fake.
 *
 * WHEN THERE IS NOTHING TO SAY
 *   `deriveDiscoveryContext` returns `null` when the business has neither a value
 *   gap nor a named constraint. Silence is the honest answer for a business whose
 *   numbers are not known yet.
 */

/**
 * A constraint is only named when the canonical score genuinely says the business
 * is constrained. Above the threshold there is no constraint to report, so none is
 * manufactured.
 */
const CONSTRAINT_LABELS = {
  owner_dependency: {
    label: 'Owner dependency',
    why: 'A business that depends on its owner is harder to transfer, and buyers tend to pay a weaker multiple for it.',
  },
  management_depth: {
    label: 'Management depth',
    why: 'Thin management makes growth depend on one person, which both caps scale and weakens the multiple.',
  },
};

const SEVERE_SCORE = 40;
const CONSTRAINED_SCORE = 65;

/**
 * deriveDiscoveryContext — the one honest summary of what is already known.
 *
 * @param {object|null} homeContext — the unified Home context (from buildHomeContext)
 * @returns {object|null} — null when nothing canonical supports a claim
 */
export function deriveDiscoveryContext(homeContext) {
  if (!homeContext) return null;

  const valuation = homeContext.valuation || {};
  const valueGap = numberOrNull(valuation.valueGap);
  const currentValue = numberOrNull(valuation.currentValue);
  const potentialValue = numberOrNull(valuation.potentialValue);

  const constraint = deriveConstraint(homeContext);

  // Nothing canonical to stand on — say nothing rather than something generic.
  if (valueGap == null && !constraint) return null;
  if (valueGap == null && !currentValue && !potentialValue && !constraint) return null;

  return {
    valueGap,
    currentValue,
    potentialValue,
    constraint,
    // Where the numbers came from, in the contract's own vocabulary. Provenance is
    // preserved so a surface can distinguish a document-backed figure from a
    // modeled one instead of presenting both as equally certain.
    provenance: valuation.currentValueSource || null,
    hasFinancials: !!homeContext.hasFinancials,
    basis: homeContext.financials?.ebitdaSource || homeContext.financials?.revenueSource || null,
  };
}

/**
 * The constraint, when the canonical operations/freedom score supports one.
 * The lower of the two scores decides, because both are readings of the same
 * thing: how much the business depends on the owner.
 */
function deriveConstraint(homeContext) {
  const operations = numberOrNull(homeContext.operations?.score);
  const freedom = numberOrNull(homeContext.freedom?.score);

  const candidates = [
    operations != null ? { score: operations, key: 'owner_dependency' } : null,
    freedom != null ? { score: freedom, key: 'owner_dependency' } : null,
  ].filter(Boolean);

  if (candidates.length === 0) return null;

  const lowest = candidates.reduce((a, b) => (b.score < a.score ? b : a));
  if (lowest.score >= CONSTRAINED_SCORE) return null; // no constraint to name

  const key = lowest.score < SEVERE_SCORE ? lowest.key : 'management_depth';
  const meta = CONSTRAINT_LABELS[key];
  return { key, label: meta.label, why: meta.why, score: lowest.score };
}

/**
 * A value gap the product is willing to put a number on: positive, finite.
 */
export function hasReportableValueGap(discovery) {
  return !!discovery && typeof discovery.valueGap === 'number' && discovery.valueGap > 0;
}

function numberOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}