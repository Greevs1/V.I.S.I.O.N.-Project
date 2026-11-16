/**
 * Expert specialty vocabulary — the ONE canonical list.
 *
 * These values were already the filter list inside
 * `components/expert-network/FindAnExpert.jsx`, and it matches
 * `expert_profiles.specialties` entries. It lives here so the Sprint expert
 * path reuses the SAME taxonomy instead of creating a second one (Part 17).
 */

export const EXPERT_SPECIALTIES = [
  'Tax Strategy', 'CPA', 'Wealth Management', 'Insurance', 'Estate Planning',
  'Asset Protection', 'Exit Planning', 'EOS', 'Operations', 'HR',
  'Payroll', 'Financing', 'M&A', 'Legal',
];

/**
 * Match a Sprint task's recommended expert role against the canonical taxonomy.
 *
 * Returns the taxonomy value, or null when the role is not one of them.
 *
 * null means DO NOT FILTER — never "closest guess". Sprint roles are
 * AI-generated and specific to task + industry ("Fractional CFO", "Corporate
 * Attorney"), so most of them are not taxonomy values. Narrowing the directory
 * to a guessed category would fabricate a match; the caller instead shows the
 * requested expertise as context and renders the full experience beneath it.
 */
export function matchSpecialty(role) {
  if (!role) return null;
  const needle = String(role).trim().toLowerCase();
  return EXPERT_SPECIALTIES.find((s) => s.toLowerCase() === needle) || null;
}