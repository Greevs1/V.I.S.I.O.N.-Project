/**
 * decisionIntelligence/coordinator.ts — Phase D
 *
 * Decision Intelligence Coordinator.
 *
 * It is NOT a new truth engine.
 * It composes existing certified outputs into a Decision Context.
 *
 * Inputs (all read-only, from certified owners):
 *   - Shared Business Intelligence Contract
 *   - Business Memory
 *   - Business Timeline
 *   - Valuation
 *   - Growth Plan
 *   - Meeting Intelligence
 *
 * It performs:
 *   - synthesis
 *   - comparison
 *   - evidence organization
 *
 * It performs NO authoritative financial calculation.
 */

import type {
  BusinessDecision,
  DecisionContext,
  DecisionContextMeta,
  DecisionType,
  RelevantMetric,
  RelevantRiskRef,
  RelevantCommitmentRef,
  RelevantMemoryRef,
  TimelineEventRef,
  DecisionUnknown,
} from './types.ts';

/**
 * Build a Decision Context from certified outputs.
 *
 * This is a PURE function — it takes all inputs and composes them.
 * The backend function fetches the inputs from Supabase and passes them here.
 */
export function buildDecisionContext(params: {
  decision: BusinessDecision;
  intelligence_contract: Record<string, unknown> | null;
  contract_version: string | null;
  relevant_memories: RelevantMemoryRef[];
  recent_timeline_events: TimelineEventRef[];
  valuation_summary: { valuation_id: string; current_value: number | null; baseline_value: number | null; status: string } | null;
  growth_plan_summary: { total_initiatives: number; active_initiatives: number; progress_percent: number } | null;
  meeting_context: { meeting_id: string; intent: string; scheduled_at: string | null } | null;
}): DecisionContext {
  const {
    decision,
    intelligence_contract,
    contract_version,
    relevant_memories,
    recent_timeline_events,
    valuation_summary,
    growth_plan_summary,
    meeting_context,
  } = params;

  const sourcesUsed: string[] = [];
  if (intelligence_contract) sourcesUsed.push('shared_intelligence_contract');
  if (relevant_memories.length > 0) sourcesUsed.push('business_memory');
  if (recent_timeline_events.length > 0) sourcesUsed.push('business_timeline');
  if (valuation_summary) sourcesUsed.push('valuation');
  if (growth_plan_summary) sourcesUsed.push('growth_plan');
  if (meeting_context) sourcesUsed.push('meeting_intelligence');

  // Extract relevant financial metrics from the contract
  const relevant_financial_metrics = extractFinancialMetrics(intelligence_contract);
  const relevant_valuation_metrics = extractValuationMetrics(intelligence_contract);

  // Extract relevant risks from the contract
  const relevant_risks = extractRisks(intelligence_contract);

  // Extract relevant commitments from growth plan
  const relevant_commitments = extractCommitments(growth_plan_summary);

  // Identify missing information
  const missing_information = identifyMissingInformation(
    decision,
    intelligence_contract,
    relevant_memories,
  );

  const meta: DecisionContextMeta = {
    sources_used: sourcesUsed,
    contract_consumed: !!intelligence_contract,
    no_calculations_performed: true,
    no_duplicate_intelligence: true,
    generated_at: new Date().toISOString(),
  };

  return {
    decision_id: decision.decision_id,
    business_id: decision.business_id,
    intelligence_contract,
    contract_version,
    relevant_memories,
    recent_timeline_events,
    valuation_summary,
    growth_plan_summary,
    meeting_context,
    decision_question: decision.question,
    decision_type: decision.decision_type,
    decision_owner: null, // resolved by backend from decision_owner_profile_id
    time_horizon: decision.target_decision_date,
    relevant_financial_metrics,
    relevant_valuation_metrics,
    relevant_risks,
    relevant_commitments,
    open_dependencies: decision.options.flatMap((o) => o.dependencies).filter(Boolean),
    missing_information,
    _meta: meta,
  };
}

/**
 * Extract relevant financial metrics from the Shared Intelligence Contract.
 * Uses the contract's profitability and tax sections.
 */
function extractFinancialMetrics(
  contract: Record<string, unknown> | null,
): RelevantMetric[] {
  if (!contract) return [];
  const metrics: RelevantMetric[] = [];

  const profitability = contract.profitability as Record<string, unknown> | undefined;
  if (profitability) {
    if (profitability.revenue != null) {
      metrics.push({
        key: 'revenue',
        label: 'Revenue',
        value: profitability.revenue as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
    if (profitability.net_profit != null) {
      metrics.push({
        key: 'net_profit',
        label: 'Net Profit',
        value: profitability.net_profit as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
    if (profitability.profit_gap != null) {
      metrics.push({
        key: 'profit_gap',
        label: 'Profit Gap',
        value: profitability.profit_gap as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
    if (profitability.recast_ebitda != null) {
      metrics.push({
        key: 'recast_ebitda',
        label: 'Recast EBITDA',
        value: profitability.recast_ebitda as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
  }

  const tax = contract.tax as Record<string, unknown> | undefined;
  if (tax) {
    if (tax.annual_tax_gap != null) {
      metrics.push({
        key: 'annual_tax_gap',
        label: 'Annual Tax Gap',
        value: tax.annual_tax_gap as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
  }

  return metrics;
}

/**
 * Extract valuation metrics from the contract.
 */
function extractValuationMetrics(
  contract: Record<string, unknown> | null,
): RelevantMetric[] {
  if (!contract) return [];
  const metrics: RelevantMetric[] = [];
  const valuation = contract.valuation as Record<string, unknown> | undefined;
  if (valuation) {
    if (valuation.current_value != null) {
      metrics.push({
        key: 'current_value',
        label: 'Current Business Value',
        value: valuation.current_value as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
    if (valuation.potential_value != null) {
      metrics.push({
        key: 'potential_value',
        label: 'Potential Business Value',
        value: valuation.potential_value as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
    if (valuation.value_gap != null) {
      metrics.push({
        key: 'value_gap',
        label: 'Value Gap',
        value: valuation.value_gap as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
    if (valuation.baseline_value != null) {
      metrics.push({
        key: 'baseline_value',
        label: 'Baseline Business Value',
        value: valuation.baseline_value as number,
        source: 'shared_intelligence_contract',
        material: true,
      });
    }
  }
  return metrics;
}

/**
 * Extract risks from the contract.
 */
function extractRisks(contract: Record<string, unknown> | null): RelevantRiskRef[] {
  if (!contract) return [];
  const risks = contract.risks as unknown[] | undefined;
  if (!risks || !Array.isArray(risks)) return [];
  return (risks as Record<string, unknown>[]).map((r, i) => ({
    risk_id: (r.risk as string) || `contract-risk-${i}`,
    description: (r.risk as string) || (r.description as string) || '',
    severity: (r.severity as string) || 'medium',
    certified_owner: 'shared_intelligence_contract',
  }));
}

/**
 * Extract commitments from growth plan summary.
 */
function extractCommitments(
  growthPlan: { total_initiatives: number; active_initiatives: number; progress_percent: number } | null,
): RelevantCommitmentRef[] {
  if (!growthPlan) return [];
  return [
    {
      commitment_id: 'growth_plan',
      title: `${growthPlan.active_initiatives} active growth initiatives`,
      status: 'active',
      certified_owner: 'growth_plan',
    },
  ];
}

/**
 * Identify missing information that blocks the decision.
 */
function identifyMissingInformation(
  decision: BusinessDecision,
  contract: Record<string, unknown> | null,
  memories: RelevantMemoryRef[],
): DecisionUnknown[] {
  const unknowns: DecisionUnknown[] = [...decision.unknowns];

  // If no contract, that's a critical unknown
  if (!contract) {
    unknowns.push({
      unknown_id: `unknown-no-contract-${Date.now()}`,
      what_is_missing: 'Shared Business Intelligence Contract',
      why_it_matters: 'Current business metrics are needed to evaluate this decision',
      how_to_resolve: 'Complete assessments to build the intelligence contract',
      destination: 'assessment',
      blocks_decision: true,
    });
  }

  // If no relevant memories, note that
  if (memories.length === 0) {
    unknowns.push({
      unknown_id: `unknown-no-memory-${Date.now()}`,
      what_is_missing: 'Historical business context',
      why_it_matters: 'Prior decisions and context may be relevant to this decision',
      how_to_resolve: 'No action needed — this may be the first major decision',
      destination: 'none',
      blocks_decision: false,
    });
  }

  return unknowns;
}

/**
 * Determine decision readiness based on context completeness.
 */
export function assessDecisionReadiness(context: DecisionContext): {
  readiness: 'insufficient_information' | 'partially_informed' | 'decision_ready' | 'needs_advisor_review' | 'blocked';
  reason: string;
} {
  const blockingUnknowns = context.missing_information.filter((u) => u.blocks_decision);

  if (blockingUnknowns.length > 0) {
    return {
      readiness: 'blocked',
      reason: `${blockingUnknowns.length} blocking unknown(s): ${blockingUnknowns.map((u) => u.what_is_missing).join(', ')}`,
    };
  }

  if (!context.intelligence_contract) {
    return {
      readiness: 'insufficient_information',
      reason: 'No Shared Intelligence Contract available',
    };
  }

  const evidenceCount = context.relevant_financial_metrics.length + context.relevant_valuation_metrics.length;
  if (evidenceCount < 2) {
    return {
      readiness: 'insufficient_information',
      reason: 'Insufficient financial metrics in the contract',
    };
  }

  if (context.missing_information.length > 3) {
    return {
      readiness: 'partially_informed',
      reason: `${context.missing_information.length} unknowns remain`,
    };
  }

  return {
    readiness: 'decision_ready',
    reason: 'Sufficient evidence and context available',
  };
}