/**
 * Shared currency formatters — V.I.S.I.O.N. Platform™
 *
 * formatCurrencyRounded  — $1,234,567 (full rounded, no suffix)
 * formatCurrencyCompact  — $1.2M / $234K (compact suffix)
 * formatCurrencyPerMonth — $9,200/mo
 * formatCurrencyPerHour  — $115/hr
 */

export function formatCurrencyRounded(value) {
  if (value == null || isNaN(value)) return '—';
  const n = Math.round(Number(value));
  return '$' + n.toLocaleString('en-US');
}

export function formatCurrencyCompact(value) {
  if (value == null || isNaN(value)) return '—';
  const n = Number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function formatCurrencyPerMonth(value) {
  if (value == null || isNaN(value) || value === 0) return null;
  return formatCurrencyRounded(value) + '/mo';
}

export function formatCurrencyPerHour(value) {
  if (value == null || isNaN(value) || value === 0) return null;
  return formatCurrencyRounded(value) + '/hr';
}

/**
 * Smart formatter: uses compact for very large numbers (>=1M), rounded otherwise.
 * Good for dashboard cards where space matters.
 */
export function formatCurrencySmart(value, { perMonth = false, perHour = false, perYear = false } = {}) {
  if (value == null || isNaN(value)) return '—';
  const n = Number(value);
  let str;
  if (n >= 1_000_000) {
    str = `$${(n / 1_000_000).toFixed(1)}M`;
  } else {
    str = '$' + Math.round(n).toLocaleString('en-US');
  }
  if (perMonth) str += '/mo';
  if (perHour) str += '/hr';
  if (perYear) str += '/yr';
  return str;
}