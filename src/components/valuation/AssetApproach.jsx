/**
 * AssetApproach — Phase 13.3
 * Adjusted Net Asset Value and Asset Floor Value from approved asset items.
 */
import React, { useState, useEffect } from 'react';
import { saveAssetItem, getAssetItems, deleteAssetItem, calculateAssetApproach } from '@/lib/valuationCalculationService';
import { Loader2, Calculator, Plus, Trash2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'cash', label: 'Cash' },
  { value: 'accounts_receivable', label: 'Accounts Receivable' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'equipment_machinery', label: 'Equipment & Machinery' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'intangible_assets', label: 'Intangible Assets' },
  { value: 'goodwill', label: 'Goodwill' },
  { value: 'contingent_liabilities', label: 'Contingent Liabilities' },
  { value: 'debt', label: 'Debt' },
  { value: 'other_liabilities', label: 'Other Liabilities' },
  { value: 'other_assets', label: 'Other Assets' },
];

export default function AssetApproach({ valuationId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [newItem, setNewItem] = useState({
    asset_category: 'cash', asset_name: '', book_value: 0, fair_market_value: 0,
    adjustment_reason: '', is_intangible: false, is_goodwill: false, is_liability: false,
    source_documentation: '',
  });

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAssetItems(valuationId);
      setItems(res.assetItems || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!newItem.asset_name) return;
    try {
      await saveAssetItem(valuationId, newItem);
      setNewItem({ ...newItem, asset_name: '', book_value: 0, fair_market_value: 0, adjustment_reason: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteAssetItem(id, valuationId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const res = await calculateAssetApproach(valuationId);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (n) => '$' + Math.round(n || 0).toLocaleString();
  const isLiability = (cat) => ['contingent_liabilities', 'debt', 'other_liabilities'].includes(cat);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Asset Approach</h3>
        <p className="text-xs text-muted-foreground">
          Adjusted Net Asset Value and Asset Floor Value from approved asset items. Do not double-count goodwill.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Add new item */}
      <div className="rounded-lg p-4 bg-secondary/50 border border-border">
        <h4 className="text-xs font-medium mb-3">Add Asset / Liability</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Category</label>
            <select value={newItem.asset_category}
              onChange={(e) => {
                const cat = e.target.value;
                setNewItem({ ...newItem, asset_category: cat, is_liability: isLiability(cat) });
              }}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Name</label>
            <input type="text" value={newItem.asset_name}
              onChange={(e) => setNewItem({ ...newItem, asset_name: e.target.value })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Book Value</label>
            <input type="number" value={newItem.book_value}
              onChange={(e) => setNewItem({ ...newItem, book_value: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Fair Market Value</label>
            <input type="number" value={newItem.fair_market_value}
              onChange={(e) => setNewItem({ ...newItem, fair_market_value: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded text-xs bg-background border border-border font-mono" />
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
          <h4 className="text-xs font-medium mb-3">Asset Items ({items.length})</h4>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex-1">
                  <span className="text-xs font-medium">{item.asset_name}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">({item.asset_category.replace(/_/g, ' ')})</span>
                  {item.is_liability && <span className="text-[10px] text-red-400 ml-2">Liability</span>}
                </div>
                <span className="text-xs font-mono text-muted-foreground mr-3">Book: {formatCurrency(item.book_value)}</span>
                <span className="text-xs font-mono font-semibold mr-3">FMV: {formatCurrency(item.fair_market_value)}</span>
                <button onClick={() => handleDelete(item.id)} className="text-red-400/50 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calculate button */}
      <button onClick={handleCalculate} disabled={calculating || items.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
        Calculate Asset Value
      </button>

      {/* Results */}
      {result && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(16,185,129,0.03)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <h4 className="text-xs font-medium mb-3">Asset Approach Results</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Total Assets</p>
              <p className="text-sm font-mono font-semibold">{formatCurrency(result.total_assets)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Total Liabilities</p>
              <p className="text-sm font-mono font-semibold text-red-400">{formatCurrency(result.total_liabilities)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Adjusted NAV</p>
              <p className="text-sm font-mono font-semibold text-green-500">{formatCurrency(result.adjusted_net_asset_value)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Asset Floor</p>
              <p className="text-sm font-mono font-semibold">{formatCurrency(result.asset_floor_value)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}