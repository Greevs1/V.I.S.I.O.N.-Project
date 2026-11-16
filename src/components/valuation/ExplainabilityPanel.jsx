/**
 * ExplainabilityPanel — Phase 13.3A
 * Allows the advisor to inspect why the value was calculated,
 * which methods contributed, which assumptions mattered most,
 * which adjustments had the largest effect, and which risks reduced confidence.
 * Client version receives a simplified explanation only.
 */
import React, { useState, useEffect } from 'react';
import { getCalculationSummary } from '@/lib/valuationCalculationService';
import { Loader2, ChevronRight, ChevronDown, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function ExplainabilityPanel({ valuationId, clientView = false }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCalculationSummary(valuationId);
      setSummary(res);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  // Build explainability tree from calculation summary
  const calculations = summary?.calculations || [];
  const methodSelections = summary?.method_selections || [];
  const confidenceScores = summary?.confidence_scores || [];
  const valueDrivers = summary?.value_drivers || [];
  const scenarios = summary?.scenarios || [];

  // Find reconciliation calculation
  const reconciliation = calculations.find(c => c.calculation_type === 'reconciliation' && c.methodology === 'blended');
  const equityBridge = calculations.find(c => c.calculation_type === 'equity_bridge');
  const overallConfidence = confidenceScores.find(s => s.is_overall);

  if (!reconciliation && !equityBridge) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground">
        No calculation results yet. Run calculations to build the explainability graph.
      </div>
    );
  }

  const formatCurrency = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + Math.round(n).toLocaleString();
  };

  // Build tree structure
  const rootNode = {
    id: 'root',
    label: 'Enterprise Value',
    value: reconciliation ? `Low: ${formatCurrency(reconciliation.enterprise_value_low)} | Mid: ${formatCurrency(reconciliation.enterprise_value_mid)} | High: ${formatCurrency(reconciliation.enterprise_value_high)}` : '—',
    type: 'enterprise_value',
    children: [],
  };

  // Add reconciliation node
  if (reconciliation) {
    const reconNode = {
      id: 'recon',
      label: 'Method Reconciliation',
      value: `${methodSelections.filter(m => m.selection_role !== 'excluded').length} methods`,
      type: 'method_reconciliation',
      children: methodSelections.filter(m => m.selection_role !== 'excluded').map(m => ({
        id: `method_${m.method_key}`,
        label: m.method_name,
        value: `${m.selection_role}`,
        type: 'method_result',
        children: [],
      })),
    };
    rootNode.children.push(reconNode);
  }

  // Add equity bridge node
  if (equityBridge) {
    rootNode.children.push({
      id: 'equity',
      label: 'Equity Value',
      value: `Mid: ${formatCurrency(equityBridge.equity_value_mid)}`,
      type: 'equity_value',
      children: [],
    });
  }

  // Add confidence node
  if (overallConfidence) {
    rootNode.children.push({
      id: 'confidence',
      label: 'Valuation Confidence',
      value: `${overallConfidence.score || 0}%`,
      type: 'confidence',
      children: [],
    });
  }

  // Add scenarios
  if (scenarios.length > 0) {
    rootNode.children.push({
      id: 'scenarios',
      label: 'Scenarios',
      value: `${scenarios.length} scenarios`,
      type: 'scenario',
      children: scenarios.slice(0, 4).map(s => ({
        id: `scen_${s.scenario_type}`,
        label: s.scenario_name || s.scenario_type,
        value: `EV: ${formatCurrency(s.enterprise_value)}`,
        type: 'scenario',
        children: [],
      })),
    });
  }

  // Add value drivers
  if (valueDrivers.length > 0) {
    rootNode.children.push({
      id: 'value_drivers',
      label: 'Value Drivers',
      value: `${valueDrivers.length} drivers`,
      type: 'value_driver',
      children: valueDrivers.slice(0, 5).map(vd => ({
        id: `vd_${vd.driver_key}`,
        label: vd.driver_name,
        value: vd.estimated_ebitda_impact || 'Not quantified',
        type: 'value_driver',
        children: [],
      })),
    });
  }

  // Filter for client view
  const filterClientVisible = (node) => {
    if (clientView) {
      const clientVisibleTypes = ['enterprise_value', 'equity_value', 'confidence', 'scenario'];
      if (!clientVisibleTypes.includes(node.type)) return null;
    }
    return {
      ...node,
      children: (node.children || []).map(filterClientVisible).filter(Boolean),
    };
  };

  const displayRoot = clientView ? filterClientVisible(rootNode) : rootNode;

  const renderNode = (node, depth = 0) => {
    if (!node) return null;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);

    const typeColors = {
      enterprise_value: '#D4A853',
      method_reconciliation: '#00D4FF',
      method_result: '#10B981',
      equity_value: '#00D4FF',
      confidence: '#F59E0B',
      scenario: '#8B5CF6',
      value_driver: '#EF4444',
    };
    const color = typeColors[node.type] || '#6B7280';

    return (
      <div key={node.id} style={{ marginLeft: depth * 16 }}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 cursor-pointer"
          onClick={() => hasChildren && toggleNode(node.id)}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <div className="w-3.5" />
          )}
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-xs font-medium flex-1">{node.label}</span>
          <span className="text-[11px] text-muted-foreground font-mono">{node.value}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="border-l border-border/30 ml-4">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold mb-1">Explainability Graph</h3>
          <p className="text-xs text-muted-foreground">
            {clientView
              ? 'Simplified explanation of your business valuation.'
              : 'Trace every value back to its source evidence. Inspect which methods, assumptions, and adjustments had the largest effect.'}
          </p>
        </div>
        {clientView && <Eye className="w-4 h-4 text-muted-foreground" />}
        {!clientView && <EyeOff className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Key insights */}
      {!clientView && overallConfidence && overallConfidence.score < 50 && (
        <div className="rounded-lg p-3 bg-amber-500/5 border border-amber-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-400">
            <p className="font-medium">Defensibility Warning</p>
            <p className="text-[11px] mt-0.5">Overall confidence is {overallConfidence.score}%. The full indicated value may not yet be defensible without additional documentation.</p>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="rounded-lg p-3 bg-secondary/30 border border-border">
        {renderNode(displayRoot)}
      </div>

      {/* Missing evidence */}
      {!clientView && overallConfidence?.missing_evidence && overallConfidence.missing_evidence.length > 0 && (
        <div className="rounded-lg p-3 bg-secondary/30 border border-border">
          <h4 className="text-xs font-medium mb-2">Missing Evidence</h4>
          <ul className="space-y-1">
            {overallConfidence.missing_evidence.map((e, idx) => (
              <li key={idx} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-amber-500" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}