/**
 * moneyFormat — the client-side money formatter for Vision surfaces.
 *
 * Approximate by construction, matching how the scenario engine renders its own
 * figures: a modelled figure is a direction, not a precise number, so it is
 * never displayed with six exact digits.
 */

/** "~$145K" / "~$1.2M" */
export function approxMoney(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return null;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}~$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}~$${Math.round(a / 1_000)}K`;
  return `${sign}~$${Math.round(a).toLocaleString('en-US')}`;
}