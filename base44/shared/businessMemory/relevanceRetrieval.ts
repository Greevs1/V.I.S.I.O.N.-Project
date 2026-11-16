/**
 * businessMemory/relevanceRetrieval.ts — Phase 15.5
 *
 * Relevance Retrieval.
 *
 * Future systems should not load every memory.
 * Retrieve only relevant confirmed memories based on:
 *   - business
 *   - topic / category
 *   - meeting intent
 *   - importance
 *   - date range
 *   - client-safe scope
 *
 * Deterministic and structured — no vector search.
 */

import type {
  BusinessMemoryRecord,
  MemoryRetrievalQuery,
  MemoryRetrievalResult,
  MemoryCategory,
  MemoryImportance,
} from './types.ts';

// ── Meeting Intent → Relevance Tags Mapping ───────────────────────────────────
// Maps meeting intents to relevance tags so the right memories are retrieved
// for the right context.
const INTENT_TAG_MAP: Record<string, string[]> = {
  quarterly_review: ['strategy', 'direction', 'objective', 'milestone'],
  valuation_review: ['exit', 'transaction', 'valuation', 'financial', 'methodology'],
  growth_planning: ['growth', 'strategy', 'objective', 'execution'],
  tax_planning: ['tax', 'financial', 'constraint'],
  exit_planning: ['exit', 'transaction', 'sale', 'objective'],
  acquisition_review: ['acquisition', 'transaction', 'growth'],
  operations_review: ['operations', 'philosophy', 'leadership', 'team'],
  financial_review: ['financial', 'capital', 'allocation'],
  strategic_planning: ['strategy', 'direction', 'objective', 'constraint'],
  annual_review: ['strategy', 'objective', 'milestone', 'event', 'leadership'],
  initial_consultation: ['objective', 'preference', 'constraint'],
  follow_up: ['commitment', 'agreement', 'execution'],
  emergency_review: ['risk', 'event', 'material'],
  compliance_review: ['regulatory', 'constraint', 'compliance'],
  internal_advisor: ['advisor', 'methodology', 'decision'],
  custom: [],
};

export function retrieveRelevantMemories(
  allMemories: BusinessMemoryRecord[],
  query: MemoryRetrievalQuery
): MemoryRetrievalResult {
  let filtered = allMemories;

  // 1. Business isolation — P0
  filtered = filtered.filter((m) => m.business_id === query.business_id);

  // 2. Only confirmed memories (not candidates, rejected, or expired)
  filtered = filtered.filter((m) => m.memory_status === 'confirmed');

  // 3. Exclude superseded memories unless include_historical is true
  if (!query.include_historical) {
    filtered = filtered.filter((m) => !m.superseded_by && m.current_relevance === 'current');
  } else {
    // Even with historical, don't include superseded as "current"
    filtered = filtered.filter((m) => !m.superseded_by);
  }

  // 4. Client-safe filtering — enforced BEFORE retrieval
  let filteredForClientSafe = 0;
  if (query.client_safe_only) {
    const beforeCount = filtered.length;
    filtered = filtered.filter((m) => m.client_visible === true);
    filteredForClientSafe = beforeCount - filtered.length;
  }

  // 5. Category filter
  if (query.category && query.category.length > 0) {
    filtered = filtered.filter((m) => query.category!.includes(m.category));
  }

  // 6. Importance filter
  if (query.importance && query.importance.length > 0) {
    filtered = filtered.filter((m) => query.importance!.includes(m.importance));
  }

  // 7. Relevance tags filter (OR logic — match any tag)
  if (query.relevance_tags && query.relevance_tags.length > 0) {
    filtered = filtered.filter((m) =>
      m.relevance_tags?.some((tag) => query.relevance_tags!.includes(tag))
    );
  }

  // 8. Meeting intent → relevance tags
  if (query.meeting_intent) {
    const intentTags = INTENT_TAG_MAP[query.meeting_intent] || [];
    if (intentTags.length > 0) {
      // Don't filter out memories that don't match — just prioritize those that do
      // But if we also have explicit relevance_tags, intersect
      if (query.relevance_tags && query.relevance_tags.length > 0) {
        // Already filtered by relevance_tags above
      } else {
        // Sort by tag match (matching memories first), but don't exclude non-matching
        filtered = filtered.sort((a, b) => {
          const aMatch = (a.relevance_tags || []).filter((t) => intentTags.includes(t)).length;
          const bMatch = (b.relevance_tags || []).filter((t) => intentTags.includes(t)).length;
          return bMatch - aMatch;
        });
      }
    }
  }

  // 9. Date range filter
  if (query.date_range) {
    filtered = filtered.filter((m) => {
      if (!m.effective_date) return false;
      return m.effective_date >= query.date_range!.start && m.effective_date <= query.date_range!.end;
    });
  }

  // 10. Sort by importance (critical first), then by effective date (newest first)
  const importanceOrder: Record<MemoryImportance, number> = {
    critical: 0,
    strategic: 1,
    useful: 2,
    contextual: 3,
  };
  filtered = filtered.sort((a, b) => {
    const impDiff = (importanceOrder[a.importance] || 3) - (importanceOrder[b.importance] || 3);
    if (impDiff !== 0) return impDiff;
    return (b.effective_date || '').localeCompare(a.effective_date || '');
  });

  // 11. Limit
  const limited = filtered.slice(0, query.limit || 20);

  return {
    memories: limited,
    total: filtered.length,
    filtered_for_client_safe: filteredForClientSafe,
    query,
  };
}

export function getRelevanceTagsForIntent(intent: string): string[] {
  return INTENT_TAG_MAP[intent] || [];
}

export function buildRetrievalQuery(params: {
  business_id: string;
  meeting_intent?: string;
  category?: MemoryCategory[];
  importance?: MemoryImportance[];
  relevance_tags?: string[];
  client_safe_only?: boolean;
  include_historical?: boolean;
  limit?: number;
}): MemoryRetrievalQuery {
  return {
    business_id: params.business_id,
    category: params.category,
    importance: params.importance,
    relevance_tags: params.relevance_tags,
    meeting_intent: params.meeting_intent,
    date_range: undefined,
    client_safe_only: params.client_safe_only ?? false,
    include_historical: params.include_historical ?? false,
    limit: params.limit ?? 20,
  };
}