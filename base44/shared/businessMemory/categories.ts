/**
 * businessMemory/categories.ts — Phase 15.5
 *
 * Memory Category Definitions.
 *
 * Each category defines what kind of durable executive context it preserves.
 * Categories affect retrieval, retention, and supersession behavior.
 */

import type { MemoryCategory, MemoryImportance, ExpirationBehavior } from './types.ts';

export interface CategoryDefinition {
  category: MemoryCategory;
  display_name: string;
  description: string;
  default_importance: MemoryImportance;
  default_expiration: ExpirationBehavior;
  default_client_visible: boolean;
  typical_relevance_tags: string[];
}

export const MEMORY_CATEGORIES: Record<MemoryCategory, CategoryDefinition> = {
  strategic_decision: {
    category: 'strategic_decision',
    display_name: 'Strategic Decision',
    description: 'A deliberate strategic choice that shapes the direction of the business',
    default_importance: 'strategic',
    default_expiration: 'retain_historically',
    default_client_visible: true,
    typical_relevance_tags: ['strategy', 'direction', 'decision'],
  },
  long_term_objective: {
    category: 'long_term_objective',
    display_name: 'Long-Term Objective',
    description: 'A stated long-term goal the owner or advisor is working toward',
    default_importance: 'critical',
    default_expiration: 'retain_historically',
    default_client_visible: true,
    typical_relevance_tags: ['objective', 'goal', 'exit', 'growth'],
  },
  owner_preference: {
    category: 'owner_preference',
    display_name: 'Owner Preference',
    description: 'A durable preference the owner has expressed about how the business should operate',
    default_importance: 'useful',
    default_expiration: 'review_periodically',
    default_client_visible: true,
    typical_relevance_tags: ['preference', 'owner', 'operations'],
  },
  advisor_decision: {
    category: 'advisor_decision',
    display_name: 'Advisor Decision',
    description: 'A key decision the advisor has made — approved add-backs, selected multiples, confirmed strategies',
    default_importance: 'strategic',
    default_expiration: 'retain_historically',
    default_client_visible: false,
    typical_relevance_tags: ['advisor', 'decision', 'methodology'],
  },
  major_commitment: {
    category: 'major_commitment',
    display_name: 'Major Commitment',
    description: 'A significant commitment made by the owner or advisor that should influence future planning',
    default_importance: 'strategic',
    default_expiration: 'expire_when_superseded',
    default_client_visible: true,
    typical_relevance_tags: ['commitment', 'agreement'],
  },
  material_business_event: {
    category: 'material_business_event',
    display_name: 'Material Business Event',
    description: 'A major event that materially affected the business — acquisition, loss of key customer, pivot',
    default_importance: 'critical',
    default_expiration: 'retain_historically',
    default_client_visible: true,
    typical_relevance_tags: ['event', 'milestone', 'material'],
  },
  leadership_change: {
    category: 'leadership_change',
    display_name: 'Leadership Change',
    description: 'A change in the management team structure or key leadership roles',
    default_importance: 'strategic',
    default_expiration: 'retain_historically',
    default_client_visible: true,
    typical_relevance_tags: ['leadership', 'management', 'team'],
  },
  operating_philosophy: {
    category: 'operating_philosophy',
    display_name: 'Operating Philosophy',
    description: 'A deliberate shift in how the business operates — recurring revenue focus, margin over growth',
    default_importance: 'strategic',
    default_expiration: 'retain_historically',
    default_client_visible: true,
    typical_relevance_tags: ['philosophy', 'operations', 'strategy'],
  },
  transaction_intent: {
    category: 'transaction_intent',
    display_name: 'Transaction Intent',
    description: 'Owner intent regarding a future transaction — sale, acquisition, recapitalization',
    default_importance: 'critical',
    default_expiration: 'expire_when_superseded',
    default_client_visible: true,
    typical_relevance_tags: ['exit', 'transaction', 'sale', 'acquisition'],
  },
  risk_acceptance: {
    category: 'risk_acceptance',
    display_name: 'Risk Acceptance',
    description: 'A risk the owner and advisor have consciously accepted — documented for future context',
    default_importance: 'strategic',
    default_expiration: 'review_periodically',
    default_client_visible: false,
    typical_relevance_tags: ['risk', 'acceptance'],
  },
  capital_allocation_decision: {
    category: 'capital_allocation_decision',
    display_name: 'Capital Allocation Decision',
    description: 'A decision about how capital is allocated — reinvestment, distribution, debt paydown',
    default_importance: 'strategic',
    default_expiration: 'retain_historically',
    default_client_visible: true,
    typical_relevance_tags: ['capital', 'allocation', 'financial'],
  },
  strategic_constraint: {
    category: 'strategic_constraint',
    display_name: 'Strategic Constraint',
    description: 'A constraint that limits strategic options — regulatory, contractual, operational',
    default_importance: 'useful',
    default_expiration: 'review_periodically',
    default_client_visible: false,
    typical_relevance_tags: ['constraint', 'limitation', 'regulatory'],
  },
};

export function getCategoryDefinition(category: MemoryCategory): CategoryDefinition {
  return MEMORY_CATEGORIES[category];
}

export function getCategoryDisplayName(category: MemoryCategory): string {
  return MEMORY_CATEGORIES[category]?.display_name || category;
}

export function getDefaultImportance(category: MemoryCategory): MemoryImportance {
  return MEMORY_CATEGORIES[category]?.default_importance || 'contextual';
}

export function getDefaultExpiration(category: MemoryCategory): ExpirationBehavior {
  return MEMORY_CATEGORIES[category]?.default_expiration || 'retain_historically';
}

export function getDefaultClientVisible(category: MemoryCategory): boolean {
  return MEMORY_CATEGORIES[category]?.default_client_visible ?? false;
}

export function getTypicalRelevanceTags(category: MemoryCategory): string[] {
  return MEMORY_CATEGORIES[category]?.typical_relevance_tags || [];
}