/**
 * NeedsMappingReview — Admin queue for unmapped strategies
 *
 * Displays strategies that have no active recommendation_strategy_mappings.
 * Admins can assign a BIE recommendation_key to each strategy, creating a
 * mapping with match_status = 'suggested' (admin can then confirm).
 *
 * Categories cash_flow, protection, and wealth start here unmapped.
 */
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Link2, AlertCircle } from 'lucide-react';

const CATEGORY_COLORS = {
  tax: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  profit: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  operations: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  value: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  cash_flow: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  protection: 'bg-red-500/15 text-red-400 border-red-500/30',
  wealth: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  freedom: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const RECOMMENDATION_KEYS = [
  { key: 'profit_gap_amount', label: 'Profit Gap Amount', category: 'financial' },
  { key: 'value_gap_amount', label: 'Value Gap Amount', category: 'valuation' },
  { key: 'tax_gap_annual', label: 'Tax Gap (Annual)', category: 'tax' },
  { key: 'operations_score', label: 'Operations Score', category: 'operations' },
  { key: 'freedom_score', label: 'Freedom Score', category: 'freedom' },
  { key: 'recast_valuation_increase', label: 'Recast Valuation Increase', category: 'valuation' },
];

export default function NeedsMappingReview() {
  const [unmapped, setUnmapped] = useState([]);
  const [byCategory, setByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState({});
  const [message, setMessage] = useState('');

  async function loadUnmapped() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('resolveStrategyMappings', { action: 'getUnmappedStrategies' });
      setUnmapped(res?.data?.unmapped || []);
      setByCategory(res?.data?.by_category || {});
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  }

  useEffect(() => { loadUnmapped(); }, []);

  async function handleCreateMapping(strategyId, strategyName) {
    const recKey = selectedKeys[strategyId];
    if (!recKey) return;
    setCreating(strategyId);
    try {
      await base44.functions.invoke('resolveStrategyMappings', {
        action: 'createMapping',
        recommendation_key: recKey,
        strategy_id: strategyId,
        mapping_scope: 'metric',
        match_status: 'suggested',
        applicability_notes: `Admin mapped ${strategyName} to ${recKey}`,
      });
      setMessage(`Mapped "${strategyName}" to ${recKey}`);
      await loadUnmapped();
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    }
    setCreating(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unmapped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-8 h-8 text-emerald-400 mb-3" />
        <p className="text-sm text-muted-foreground">All strategies have active mappings.</p>
      </div>
    );
  }

  const categoryNames = Object.keys(byCategory).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <p className="text-sm text-muted-foreground">
            {unmapped.length} strategies need mapping review
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadUnmapped}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {message && (
        <div className="text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg p-2">
          {message}
        </div>
      )}

      {categoryNames.map(cat => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={CATEGORY_COLORS[cat] || 'bg-muted text-muted-foreground border-border'}>
              {cat}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {byCategory[cat].length} unmapped
            </span>
          </div>

          <div className="space-y-2">
            {byCategory[cat].map(strategy => (
              <div
                key={strategy.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-secondary/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{strategy.strategy_name}</p>
                  {strategy.strategy_family && (
                    <p className="text-xs text-muted-foreground mt-0.5">{strategy.strategy_family}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedKeys[strategy.id] || ''}
                    onChange={e => setSelectedKeys(prev => ({ ...prev, [strategy.id]: e.target.value }))}
                    className="text-xs bg-background border border-border rounded-md px-2 py-1.5 text-foreground"
                  >
                    <option value="">Select recommendation...</option>
                    {RECOMMENDATION_KEYS.map(r => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedKeys[strategy.id] || creating === strategy.id}
                    onClick={() => handleCreateMapping(strategy.id, strategy.strategy_name)}
                    className="text-xs"
                  >
                    <Link2 className="w-3 h-3 mr-1" />
                    {creating === strategy.id ? 'Mapping...' : 'Map'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}