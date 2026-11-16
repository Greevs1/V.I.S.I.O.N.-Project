/**
 * Benchmark Lookup — wraps the existing profitBenchmark backend function.
 *
 * The profitBenchmark function uses AI (Claude) to find industry-specific
 * profit margin benchmarks from reliable sources (BLS, Census, SBA, IRS, etc.).
 * It returns: average_net_profit_margin, top_quartile_net_profit_margin,
 * best_in_class_net_profit_margin, plus source attribution.
 *
 * This module caches results per industry to avoid redundant AI calls within
 * a session, and exposes a clean interface for the conversation layer.
 */

import { base44 } from '@/api/base44Client';

const cache = new Map();
const MAX_CACHE = 20;

/**
 * lookupProfitBenchmark — fetches industry profit margin benchmarks.
 *
 * @param {string} industryInput — the user's industry description
 * @returns {Promise<object|null>} — benchmark data or null if unavailable
 *   {
 *     normalized_industry: string,
 *     average_net_profit_margin: number,    // typical range midpoint
 *     top_quartile_net_profit_margin: number,
 *     best_in_class_net_profit_margin: number,
 *     benchmark_sources: string,
 *     confidence_level: 'high'|'medium'|'low',
 *     date_range: string,
 *     benchmark_notes: string,
 *   }
 */
export async function lookupProfitBenchmark(industryInput) {
  if (!industryInput || typeof industryInput !== 'string') return null;

  const key = industryInput.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);

  try {
    const res = await base44.functions.invoke('profitBenchmark', {
      industry_input: industryInput,
    });

    if (res.data?.error) {
      cache.set(key, null);
      return null;
    }

    const data = res.data;
    if (!data || data.insufficient_data) {
      cache.set(key, null);
      return null;
    }

    // Cache the result
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(key, data);

    return data;
  } catch {
    return null;
  }
}

/**
 * formatBenchmarkRange — formats a benchmark margin as a readable range.
 * @returns {string} e.g. "7–11%"
 */
export function formatBenchmarkRange(avg, topQuartile) {
  if (avg == null || topQuartile == null) return null;
  const low = Math.round(avg * 10) / 10;
  const high = Math.round(topQuartile * 10) / 10;
  return `${low}–${high}%`;
}

/**
 * buildProfitabilityComparison — builds the profitability comparison object
 * for the inline profitability card.
 *
 * @param {number} currentMargin — the user's current profit margin (%)
 * @param {object} benchmark — from lookupProfitBenchmark
 * @returns {object} — { current, typicalRange, bestInClass, potentialGap, sources, confidence }
 */
export function buildProfitabilityComparison(currentMargin, benchmark) {
  if (!benchmark) return null;

  const avg = benchmark.average_net_profit_margin;
  const topQ = benchmark.top_quartile_net_profit_margin;
  const best = benchmark.best_in_class_net_profit_margin;

  return {
    current: currentMargin != null ? Math.round(currentMargin * 10) / 10 : null,
    typicalRange: formatBenchmarkRange(avg, topQ),
    typicalLow: avg != null ? Math.round(avg * 10) / 10 : null,
    typicalHigh: topQ != null ? Math.round(topQ * 10) / 10 : null,
    bestInClass: best != null ? Math.round(best * 10) / 10 : null,
    // Potential improvement = best_in_class - current (in margin points)
    potentialGap: currentMargin != null && best != null
      ? Math.round((best - currentMargin) * 10) / 10
      : null,
    sources: benchmark.benchmark_sources || 'Industry benchmark data',
    confidence: benchmark.confidence_level || 'medium',
    notes: benchmark.benchmark_notes || '',
    normalizedIndustry: benchmark.normalized_industry || '',
  };
}