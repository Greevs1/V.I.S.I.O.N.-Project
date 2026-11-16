/**
 * valuationEngine/explainabilityEngine.ts — Explainability Graph Engine.
 * Creates a traceable graph from enterprise value back to source evidence.
 * Every material output is traceable through nodes.
 * Pure function: no DB, no React, no SDK. Deterministic.
 */

import { Decimal } from './decimal.ts';
import type {
  ExplainabilityGraph,
  ExplainabilityNode,
  NormalizedEarningsOutput,
  MultipleCalculationOutput,
  MethodReconciliationOutput,
  EquityBridgeOutput,
  ConfidenceOutput,
  ScenarioOutput,
  ValueDriverOutput,
  DCFOutput,
  CapitalizationOutput,
  AssetApproachOutput,
} from './types.ts';

export const ENGINE_VERSION = '13.3.0';
export const METHODOLOGY_VERSION = '1.0.0';

let nodeIdCounter = 0;
function nextNodeId(prefix: string): string {
  nodeIdCounter++;
  return `${prefix}_${nodeIdCounter}`;
}

interface MethodResultEntry {
  method_key: string;
  method_name: string;
  result: MultipleCalculationOutput | DCFOutput | CapitalizationOutput | AssetApproachOutput | null;
}

export function buildExplainabilityGraph(params: {
  reconciliation: MethodReconciliationOutput | null;
  equityBridge: EquityBridgeOutput | null;
  normalizedEarnings: NormalizedEarningsOutput | null;
  methodResults: MethodResultEntry[];
  confidence: ConfidenceOutput | null;
  scenarios: ScenarioOutput[];
  valueDrivers: ValueDriverOutput[];
}): ExplainabilityGraph | null {
  const nodes: ExplainabilityNode[] = [];
  nodeIdCounter = 0;

  if (!params.reconciliation) return null;

  // ── Root: Enterprise Value ────────────────────────────────────────
  const evNodeId = nextNodeId('ev');
  nodes.push({
    node_id: evNodeId,
    node_type: 'enterprise_value',
    label: 'Enterprise Value',
    value: `Low: ${params.reconciliation.weighted_ev_low.formatCurrency()} | Mid: ${params.reconciliation.weighted_ev_mid.formatCurrency()} | High: ${params.reconciliation.weighted_ev_high.formatCurrency()}`,
    parent_node_id: null,
    source_type: 'calculation',
    source_id: null,
    confidence: params.confidence?.overall_confidence || null,
    advisor_approval: false,
    client_visible: true,
    explanation: 'Weighted enterprise value from reconciled methods',
  });

  // ── Method Reconciliation ─────────────────────────────────────────
  const reconNodeId = nextNodeId('recon');
  nodes.push({
    node_id: reconNodeId,
    node_type: 'method_reconciliation',
    label: 'Method Reconciliation',
    value: `${params.reconciliation.included_methods.length} methods, total weight: ${params.reconciliation.total_weight.toNumber() * 100}%`,
    parent_node_id: evNodeId,
    source_type: 'calculation',
    source_id: null,
    confidence: null,
    advisor_approval: false,
    client_visible: false,
    explanation: 'Methods weighted by advisor to produce final EV',
  });

  // ── Method Results ────────────────────────────────────────────────
  for (const mr of params.reconciliation.included_methods) {
    const methodNodeId = nextNodeId('method');
    nodes.push({
      node_id: methodNodeId,
      node_type: 'method_result',
      label: mr.method_name,
      value: `Weight: ${mr.weight.toNumber() * 100}% | EV Mid: ${mr.weighted_ev_mid.formatCurrency()}`,
      parent_node_id: reconNodeId,
      source_type: 'calculation',
      source_id: mr.method_key,
      confidence: null,
      advisor_approval: false,
      client_visible: false,
      explanation: `${mr.method_name} contributed ${mr.weight.toNumber() * 100}% to the final EV`,
    });

    const methodResult = params.methodResults.find(r => r.method_key === mr.method_key);
    if (methodResult?.result && 'multiple_bridge' in methodResult.result) {
      const multiResult = methodResult.result as MultipleCalculationOutput;

      const multNodeId = nextNodeId('mult');
      nodes.push({
        node_id: multNodeId,
        node_type: 'multiple',
        label: 'Final Multiple',
        value: `Low: ${multiResult.final_multiple_low.formatMultiple()} | Mid: ${multiResult.final_multiple_mid.formatMultiple()} | High: ${multiResult.final_multiple_high.formatMultiple()}`,
        parent_node_id: methodNodeId,
        source_type: 'calculation',
        source_id: null,
        confidence: null,
        advisor_approval: false,
        client_visible: false,
        explanation: 'Final multiple after adjustments',
      });

      for (const adj of multiResult.multiple_bridge) {
        const adjNodeId = nextNodeId('adj');
        nodes.push({
          node_id: adjNodeId,
          node_type: 'multiple_adjustment',
          label: adj.adjustment_label,
          value: adj.adjustment_value.formatMultiple(),
          parent_node_id: multNodeId,
          source_type: 'advisor_entry',
          source_id: adj.adjustment_key,
          confidence: null,
          advisor_approval: false,
          client_visible: false,
          explanation: adj.rationale || `${adj.adjustment_label}: ${adj.adjustment_value.formatMultiple()}`,
        });
      }
    }

    if (params.normalizedEarnings && methodResult?.result && 'enterprise_value_mid' in methodResult.result) {
      const earningsNodeId = nextNodeId('earn');
      nodes.push({
        node_id: earningsNodeId,
        node_type: 'normalized_earnings',
        label: 'Normalized EBITDA',
        value: params.normalizedEarnings.normalized_ebitda.formatCurrency(),
        parent_node_id: methodNodeId,
        source_type: 'calculation',
        source_id: null,
        confidence: null,
        advisor_approval: false,
        client_visible: false,
        explanation: 'Normalized EBITDA from approved financials and adjustments',
      });

      const periodNodeId = nextNodeId('period');
      nodes.push({
        node_id: periodNodeId,
        node_type: 'financial_period',
        label: 'Financial Period',
        value: params.normalizedEarnings.reported_ebitda.formatCurrency(),
        parent_node_id: earningsNodeId,
        source_type: 'document',
        source_id: null,
        confidence: null,
        advisor_approval: true,
        client_visible: false,
        explanation: 'Approved financial period data',
      });

      for (const line of params.normalizedEarnings.ebitda_bridge.lines) {
        if (line.line_type === 'adjustment' && line.adjustment_id) {
          const adjNodeId = nextNodeId('adjline');
          nodes.push({
            node_id: adjNodeId,
            node_type: 'adjustment',
            label: line.line_label,
            value: line.amount.formatCurrency(),
            parent_node_id: earningsNodeId,
            source_type: 'approved_adjustment',
            source_id: line.adjustment_id,
            confidence: null,
            advisor_approval: true,
            client_visible: false,
            explanation: 'Approved adjustment to reported EBITDA',
          });
        }
      }
    }
  }

  // ── Equity Value ──────────────────────────────────────────────────
  if (params.equityBridge) {
    const eqNodeId = nextNodeId('eq');
    nodes.push({
      node_id: eqNodeId,
      node_type: 'equity_value',
      label: 'Equity Value',
      value: `Low: ${params.equityBridge.equity_value_low.formatCurrency()} | Mid: ${params.equityBridge.equity_value_mid.formatCurrency()} | High: ${params.equityBridge.equity_value_high.formatCurrency()}`,
      parent_node_id: evNodeId,
      source_type: 'calculation',
      source_id: null,
      confidence: null,
      advisor_approval: false,
      client_visible: true,
      explanation: 'Equity value after bridge adjustments',
    });
  }

  // ── Confidence ────────────────────────────────────────────────────
  if (params.confidence) {
    const confNodeId = nextNodeId('conf');
    nodes.push({
      node_id: confNodeId,
      node_type: 'confidence',
      label: 'Valuation Confidence',
      value: `${params.confidence.overall_confidence}%`,
      parent_node_id: evNodeId,
      source_type: 'calculation',
      source_id: null,
      confidence: params.confidence.overall_confidence,
      advisor_approval: false,
      client_visible: true,
      explanation: 'Overall confidence based on data, earnings, market, and operational factors',
    });
  }

  // ── Scenarios ─────────────────────────────────────────────────────
  for (const sc of params.scenarios) {
    const scNodeId = nextNodeId('scen');
    nodes.push({
      node_id: scNodeId,
      node_type: 'scenario',
      label: sc.scenario_name,
      value: `EV: ${sc.enterprise_value.formatCurrency()} | Confidence: ${sc.confidence_score}%`,
      parent_node_id: evNodeId,
      source_type: 'calculation',
      source_id: sc.scenario_type,
      confidence: sc.confidence_score,
      advisor_approval: false,
      client_visible: sc.scenario_type !== 'strategic',
      explanation: `${sc.scenario_type} scenario with ${sc.assumptions.length} assumptions`,
    });
  }

  // ── Value Drivers ─────────────────────────────────────────────────
  for (const vd of params.valueDrivers) {
    const vdNodeId = nextNodeId('vd');
    nodes.push({
      node_id: vdNodeId,
      node_type: 'value_driver',
      label: vd.driver_name,
      value: vd.estimated_ebitda_impact,
      parent_node_id: evNodeId,
      source_type: 'advisor_entry',
      source_id: vd.driver_key,
      confidence: vd.confidence_score,
      advisor_approval: !vd.advisor_review_required,
      client_visible: vd.client_visible_explanation !== '',
      explanation: vd.client_visible_explanation || vd.current_state,
    });
  }

  return {
    nodes,
    root_node_id: evNodeId,
  };
}

export function getClientSafeGraph(graph: ExplainabilityGraph): ExplainabilityGraph {
  return {
    nodes: graph.nodes.filter(n => n.client_visible),
    root_node_id: graph.root_node_id,
  };
}