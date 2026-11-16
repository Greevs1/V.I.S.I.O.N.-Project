/**
 * Galileo Capability Framework — Registry
 * Phase 13.4B.1
 *
 * Single registry for all Galileo capabilities. Metadata only —
 * no execution logic lives in the registry.
 *
 * Every capability (including placeholders) registers here. The registry
 * is the single source of truth for what capabilities exist, what context
 * they require, and what permissions they need.
 */
import type {
  CapabilityMetadata,
  CapabilityCategory,
} from './types.ts';

export interface CapabilityCategoryDefinition {
  key: CapabilityCategory;
  label: string;
  description: string;
}

/**
 * The 15 capability categories. Each future V.I.S.I.O.N. domain plugs
 * into one or more categories. Categories are organizational only —
 * they do not affect execution.
 */
export const CAPABILITY_CATEGORIES: CapabilityCategoryDefinition[] = [
  { key: 'valuation', label: 'Valuation', description: 'Business valuation analysis, explanation, and reporting.' },
  { key: 'business_intelligence', label: 'Business Intelligence', description: 'Canonical BIE recommendations and intelligence surfacing.' },
  { key: 'growth', label: 'Growth', description: 'Growth plan initiatives, 90-day plans, and value creation.' },
  { key: 'meetings', label: 'Meetings', description: 'Meeting preparation, agendas, and client/advisor/board interactions.' },
  { key: 'reports', label: 'Reports', description: 'Report generation, deliverable preparation, and publication readiness.' },
  { key: 'operations', label: 'Operations', description: 'Operational analysis, readiness, and process improvement.' },
  { key: 'tax', label: 'Tax', description: 'Tax strategy, gap analysis, and optimization.' },
  { key: 'cash_flow', label: 'Cash Flow', description: 'Cash flow analysis, projections, and optimization.' },
  { key: 'wealth', label: 'Wealth', description: 'Wealth building, preservation, and transfer.' },
  { key: 'protection', label: 'Protection', description: 'Risk protection, insurance, and liability management.' },
  { key: 'owner_experience', label: 'Owner Experience', description: 'Owner journey, freedom, and personal objectives.' },
  { key: 'administration', label: 'Administration', description: 'Administrative workflows, team management, and system operations.' },
  { key: 'education', label: 'Education', description: 'Educational content, explanations, and learning pathways.' },
  { key: 'navigation', label: 'Navigation', description: 'Navigation assistance, page routing, and wayfinding.' },
  { key: 'analysis', label: 'Analysis', description: 'Cross-domain analytical capabilities and comparative analysis.' },
];

/**
 * Singleton registry. One instance per runtime.
 */
class CapabilityRegistryImpl {
  private capabilities = new Map<string, CapabilityMetadata>();

  register(metadata: CapabilityMetadata): void {
    if (this.capabilities.has(metadata.id)) {
      throw new Error(`Capability already registered: ${metadata.id}`);
    }
    this.capabilities.set(metadata.id, metadata);
  }

  get(id: string): CapabilityMetadata | undefined {
    return this.capabilities.get(id);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  list(): CapabilityMetadata[] {
    return Array.from(this.capabilities.values());
  }

  listByCategory(category: CapabilityCategory): CapabilityMetadata[] {
    return this.list().filter((c) => c.category === category);
  }

  listByRole(role: string): CapabilityMetadata[] {
    return this.list().filter((c) => c.supportedRoles.includes(role));
  }

  listByVisibility(visibility: 'internal' | 'client_safe' | 'both'): CapabilityMetadata[] {
    return this.list().filter(
      (c) => c.visibility === visibility || c.visibility === 'both'
    );
  }

  listAvailable(context: { role?: string; hasValuation?: boolean; hasBusiness?: boolean }): CapabilityMetadata[] {
    return this.list().filter((c) => {
      if (c.status === 'deprecated') return false;
      if (context.role && !c.supportedRoles.includes(context.role)) return false;
      return true;
    });
  }

  count(): number {
    return this.capabilities.size;
  }

  clear(): void {
    this.capabilities.clear();
  }
}

export const capabilityRegistry = new CapabilityRegistryImpl();