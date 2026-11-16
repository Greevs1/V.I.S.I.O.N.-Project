/**
 * businessDNA/families.ts — Phase E
 *
 * Six Business DNA Families — Taxonomy and Definitions.
 *
 * The top-level taxonomy is FIXED at six families. Do not casually expand.
 * Each family has a set of pattern_type keys that describe the kinds of
 * durable patterns within that family.
 *
 * Owner DNA Safety Rule:
 *   Owner DNA describes the RELATIONSHIP between the owner and the business.
 *   It is NOT a psychological profile. No personality disorders, traits,
 *   motives, or private personal attributes. Only observable business
 *   dependency patterns.
 */

import type { DNAFamily } from './types.ts';

export interface FamilyDefinition {
  key: DNAFamily;
  label: string;
  description: string;
  pattern_types: string[];
  client_safe_default: boolean;
}

export const FAMILY_DEFINITIONS: Record<DNAFamily, FamilyDefinition> = {
  economic: {
    key: 'economic',
    label: 'Economic DNA',
    description: 'How the business economically behaves — revenue model, margin behavior, cash conversion, concentration, capital intensity.',
    pattern_types: [
      'revenue_model', 'revenue_quality', 'margin_behavior', 'gross_margin_consistency',
      'ebitda_behavior', 'cash_conversion', 'working_capital', 'recurring_vs_transactional',
      'customer_economics', 'pricing_power', 'capital_intensity', 'seasonality',
      'revenue_concentration', 'customer_concentration', 'supplier_concentration',
      'cost_structure', 'operating_leverage', 'earnings_quality',
    ],
    client_safe_default: true,
  },
  value: {
    key: 'value',
    label: 'Value DNA',
    description: 'What creates or destroys transferable enterprise value — owner independence, transferability, defensibility, multiple sensitivity.',
    pattern_types: [
      'owner_independence', 'transferability', 'recurring_revenue_quality',
      'customer_concentration_value', 'management_depth', 'process_maturity',
      'financial_quality', 'defensibility', 'multiple_sensitivity',
      'growth_durability', 'earnings_quality_value', 'risk_adjusted_value',
      'value_driver_strength', 'value_gap_persistence', 'value_creation_history',
    ],
    client_safe_default: true,
  },
  operating: {
    key: 'operating',
    label: 'Operating DNA',
    description: 'How the organization executes — process maturity, management leverage, team capacity, delegation, scalability.',
    pattern_types: [
      'execution_consistency', 'process_maturity', 'operational_bottlenecks',
      'management_leverage', 'team_capacity', 'delegation', 'accountability',
      'sales_execution', 'delivery_capacity', 'scalability', 'systems_maturity',
      'organizational_dependency', 'execution_velocity', 'implementation_reliability',
    ],
    client_safe_default: true,
  },
  decision: {
    key: 'decision',
    label: 'Decision DNA',
    description: 'Durable patterns across decisions and outcomes — decision speed, quality, assumption accuracy, capital allocation behavior.',
    pattern_types: [
      'decision_speed', 'decision_quality', 'assumption_accuracy',
      'capital_allocation_behavior', 'successful_decision_categories',
      'failed_decision_categories', 'recurring_decision_bottlenecks',
      'evidence_quality_at_decision_time', 'implementation_follow_through',
      'bias_patterns', 'risk_tolerance', 'course_correction_behavior',
    ],
    client_safe_default: false,
  },
  owner: {
    key: 'owner',
    label: 'Owner DNA',
    description: 'The relationship between the owner and the business — operating dependency, sales dependency, decision dependency, delegation, transferability. NOT a psychological profile.',
    pattern_types: [
      'owner_operating_dependency', 'owner_sales_dependency',
      'owner_relationship_dependency', 'owner_decision_dependency',
      'owner_knowledge_concentration', 'delegation', 'time_leverage',
      'strategic_vs_operational', 'transferability_owner', 'leadership_leverage',
      'succession_readiness', 'freedom_trajectory',
    ],
    client_safe_default: true,
  },
  risk_resilience: {
    key: 'risk_resilience',
    label: 'Risk & Resilience DNA',
    description: 'Structural fragility and demonstrated resilience — concentration, key-person dependency, cash vulnerability, recovery behavior.',
    pattern_types: [
      'customer_concentration_risk', 'key_person_dependency',
      'supplier_concentration_risk', 'legal_exposure', 'tax_exposure',
      'insurance_protection_gaps', 'cash_vulnerability', 'debt_sensitivity',
      'economic_sensitivity', 'operational_fragility', 'technology_dependency',
      'recovery_behavior', 'risk_mitigation_history', 'resilience_under_stress',
    ],
    client_safe_default: true,
  },
};

export function getFamilyDefinition(family: DNAFamily): FamilyDefinition {
  return FAMILY_DEFINITIONS[family];
}

export function getFamilyLabel(family: DNAFamily): string {
  return FAMILY_DEFINITIONS[family]?.label || family;
}

export function isValidPatternType(family: DNAFamily, patternType: string): boolean {
  const def = FAMILY_DEFINITIONS[family];
  return def ? def.pattern_types.includes(patternType) : false;
}

export function getDefaultClientVisibility(family: DNAFamily): boolean {
  return FAMILY_DEFINITIONS[family]?.client_safe_default ?? true;
}

// ── Owner DNA Safety Guard ────────────────────────────────────────────────────
/**
 * Forbidden phrases in Owner DNA statements. If any appear, the pattern
 * is rejected — Owner DNA must describe observable business dependency,
 * NOT psychological traits.
 */
export const OWNER_DNA_FORBIDDEN_TERMS = [
  'narcissist', 'anxiety', 'depression', 'paranoid', 'bipolar',
  'personality disorder', 'controlling personality', 'insecure',
  'ego', 'narcissistic', 'psychological', 'mental health',
  'emotional instability', 'trust issues', 'micromanager personality',
];

export function isOwnerDNASafe(statement: string): boolean {
  const lower = statement.toLowerCase();
  return !OWNER_DNA_FORBIDDEN_TERMS.some((term) => lower.includes(term));
}