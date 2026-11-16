/**
 * EquityValueBridge — Phase 13.3
 * Enterprise Value → Equity Value bridge with approved adjustments.
 */
import React, { useState, useEffect } from 'react';
import { getEquityBridge, saveEquityBridgeItem, calculateEquityValue } from '@/lib/valuationCalculationService';
import { Loader2, Calculator, Plus, Trash2 } from 'lucide-react';

const BRIDGE_TYPES = [
  { value: 'excess_cash', label: 'Excess Cash', direction: 'add' },
  { value: 'non_operating_asset', label: 'Non-Operating Asset', direction: 'add' },
  { value: 'funded_debt', label: 'Funded Debt', direction: 'subtract' },
  { value: 'debt_like_liability', label: 'Debt-Like Liability', direction: 'subtract' },
  { value: 'working_capital_adjustment', label: 'Working Capital Adjustment', direction: 'add' },
  { value: 'other_adjustment', label: 'Other Adjustment', direction: 'add' },
];

export default function EquityValueBridge({ valuationId, enterpriseValue = { low: 0, mid: 0, high: 0 } }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [newItem, setNewItem] = useState({ bridge_item_type: 'excess_cash', label: '', amount: 0, direction: 'add', classification_rationale: '' });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getEquityBridge(valuationId);
      setItems(res.equityBridgeItems || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!newItem.label) return;
    try {
      await saveEquityBridgeItem(valuationId, newItem);
      setNewItem({ ...newItem, label: '', amount: 0, classification_rationale: '' });
      await load();
    } catch (err) { setError(err.message); }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const res = await calculateEquityValue(valuationId, enterpriseValue.low, enterpriseValue.mid, enterpriseValue.high);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Equity Value Bridge</h3>
        <p className="text-xs text-muted-foreground">
          Enterprise Value + Excess Cash + Non-Operating Assets − Funded Debt − Debt-Like Liabilities ± Adjustments = Equity Value
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Enterprise Value input display */}
      <div className="rounded-lg p-3 bg-secondary/30 border border-border">
        <p className="text-[11px] text-muted-foreground mb-1">Enterprise Value (from reconciliation)</p>
        <div className="grid grid-cols-3 gap-3">
          <div><span className="text-xs text-muted-foreground">Low: </span><span className="text-xs font-mono">{formatCurrency(enterpriseValue.low)}</span></div>
          <div><span className="text-xs text-muted-foreground">Mid: </span><span className="text-xs font-mono font-semibold">{formatCurrency(enterpriseValue.mid)}</span></div>
          <div><span className="text-xs text-muted-foreground">High: </span><span className="text-xs font-mono">{formatCurrency(enterpriseValue.high)}</span></div>
        </div>
      </div>

      {/* Add bridge item */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border">
        <h4 className="text-xs font-medium mb-3">Add Bridge Item</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Type</label>
            <select value={newItem.bridge_item_type}
              onChange={(e) => {
                const bt = BRIDGE_TYPES.find(b => b.value === e.target.value);
                setNewItem({ ...newItem, bridge_item_type: e.target.value, direction: bt?.direction || 'add' });
              }}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
              {BRIDGE_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Label</label>
            <input type="text" value={newItem.label}
              onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Amount</label>
            <input type="number" value={newItem.amount}
              onChange={(e) => setNewItem({ ...newItem, amount: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Direction</label>
            <select value={newItem.direction}
              onChange={(e) => setNewItem({ ...newItem, direction: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
              <option value="add">Add (+)</option>
              <option value="subtract">Subtract (−)</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
        </div>
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div className="rounded-lg p-4 bg-secondary/50 border border-border">
          <h4 className="text-xs font-medium mb-3">Bridge Items ({items.length})</h4>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex-1">
                  <span className="text-xs font-medium">{item.label}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">({item.bridge_item_type.replace(/_/g, ' ')})</span>
                </div>
                <span className={`text-xs font-mono font-semibold mr-3 ${item.direction === 'add' ? 'text-green-500' : 'text-red-400'}`}>
                  {item.direction === 'add' ? '+' : '−'}{formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calculate */}
      <button onClick={handleCalculate} disabled={calculating}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
        {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
        Calculate Equity Value
      </button>

      {/* Results */}
      {result && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.15)' }}>
          <h4 className="text-xs font-medium mb-3">Equity Value Results</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Equity Value Low</p>
              <p className="text-sm font-mono font-semibold">{formatCurrency(result.equity_value_low)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Equity Value Mid</p>
              <p className="text-sm font-mono font-semibold text-accent">{formatCurrency(result.equity_value_mid)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Equity Value High</p>
              <p className="text-sm font-mono font-semibold">{formatCurrency(result.equity_value_high)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}