/**
 * FinancialNormalization — Phase 13.2
 *
 * Advisor-led financial normalization workspace. Supports 3-5 historical
 * years, TTM, YTD, budget, and forecast periods.
 *
 * Every material adjustment requires advisor approval. Extracted add-backs
 * are never automatically approved.
 */
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, CheckCircle2, XCircle, AlertCircle, FileText } from 'lucide-react';

const PERIOD_TYPES = [
  { value: 'historical', label: 'Historical' },
  { value: 'trailing_twelve_months', label: 'Trailing Twelve Months' },
  { value: 'year_to_date', label: 'Year-to-Date' },
  { value: 'budget', label: 'Budget' },
  { value: 'forecast', label: 'Forecast' },
];

const ADJUSTMENT_TYPES = [
  { value: 'owner_compensation', label: 'Owner Compensation' },
  { value: 'owner_perks', label: 'Owner Perks' },
  { value: 'rent_adjustment', label: 'Rent Adjustment' },
  { value: 'one_time_expense', label: 'One-Time Expense' },
  { value: 'non_recurring', label: 'Non-Recurring' },
  { value: 'related_party', label: 'Related Party' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'amortization', label: 'Amortization' },
  { value: 'interest', label: 'Interest' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'other', label: 'Other' },
];

const SOURCE_TYPES = [
  { value: 'document', label: 'Document' },
  { value: 'extracted_field', label: 'Extracted Field' },
  { value: 'advisor_entry', label: 'Advisor Entry' },
  { value: 'client_confirmation', label: 'Client Confirmation' },
  { value: 'assessment_calculation', label: 'Assessment Calculation' },
  { value: 'dashboard_metric', label: 'Dashboard Metric' },
];

export default function FinancialNormalization({ valuationId, financials = [], adjustments = [], onSave }) {
  const [periods, setPeriods] = useState(financials);
  const [activeAdjustments, setActiveAdjustments] = useState(adjustments);
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ period_label: '', period_type: 'historical', fiscal_year: null });

  const addPeriod = () => {
    if (!newPeriod.period_label) return;
    const period = {
      id: `temp-${Date.now()}`,
      valuation_id: valuationId,
      period_label: newPeriod.period_label,
      period_type: newPeriod.period_type,
      fiscal_year: newPeriod.fiscal_year,
      revenue: 0, cogs: 0, gross_profit: 0, operating_expenses: 0, net_income: 0,
      reported_ebitda: 0, normalized_ebitda: 0, reported_sde: 0, normalized_sde: 0,
      owner_compensation: 0, depreciation: 0, amortization: 0, interest_expense: 0, taxes: 0,
      cash: 0, funded_debt: 0, accounts_receivable: 0, accounts_payable: 0,
      inventory: 0, working_capital: 0, capital_expenditures: 0,
      add_backs_total: 0, deductions_total: 0, recast_ebitda: 0,
      source_type: 'advisor_entry', verification_status: 'pending', advisor_approval_status: 'pending',
    };
    setPeriods(prev => [...prev, period]);
    setNewPeriod({ period_label: '', period_type: 'historical', fiscal_year: null });
    setShowAddPeriod(false);
  };

  const updateField = (periodId, field, value) => {
    setPeriods(prev => prev.map(p => p.id === periodId ? { ...p, [field]: value } : p));
  };

  const addAdjustment = (periodId) => {
    const adj = {
      id: `temp-adj-${Date.now()}`,
      valuation_id: valuationId,
      financial_id: periodId,
      adjustment_type: 'other',
      adjustment_direction: 'add_back',
      is_recurring: false,
      proposed_amount: 0,
      approved_amount: 0,
      advisor_approval_status: 'pending',
      explanation: '',
      evidence_source: '',
    };
    setActiveAdjustments(prev => [...prev, adj]);
  };

  const updateAdjustment = (adjId, field, value) => {
    setActiveAdjustments(prev => prev.map(a => a.id === adjId ? { ...a, [field]: value } : a));
  };

  const approveAdjustment = (adjId) => {
    setActiveAdjustments(prev => prev.map(a => {
      if (a.id !== adjId) return a;
      const approved = a.advisor_approval_status !== 'approved';
      return {
        ...a,
        advisor_approval_status: approved ? 'approved' : 'pending',
        approved_amount: approved ? a.proposed_amount : 0,
      };
    }));
  };

  const removeAdjustment = (adjId) => {
    setActiveAdjustments(prev => prev.filter(a => a.id !== adjId));
  };

  // Calculate normalized EBITDA per period
  const calculateNormalized = (period) => {
    const periodAdjustments = activeAdjustments.filter(a => a.financial_id === period.id && a.advisor_approval_status === 'approved');
    const addBacks = periodAdjustments.filter(a => a.adjustment_direction === 'add_back').reduce((s, a) => s + (a.approved_amount || 0), 0);
    const deductions = periodAdjustments.filter(a => a.adjustment_direction === 'deduction').reduce((s, a) => s + (a.approved_amount || 0), 0);
    const normalized = (period.reported_ebitda || 0) + addBacks - deductions;
    return { addBacks, deductions, normalized };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Financial Normalization</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Reported earnings → Normalized earnings through advisor-approved adjustments</p>
        </div>
        <Button size="sm" onClick={() => setShowAddPeriod(!showAddPeriod)} variant="outline">
          <Plus className="w-3.5 h-3.5" /> Add Period
        </Button>
      </div>

      {/* Add Period Form */}
      {showAddPeriod && (
        <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Period Label</label>
              <input
                type="text"
                placeholder="e.g., FY2024, TTM, Q3 2024"
                value={newPeriod.period_label}
                onChange={e => setNewPeriod(p => ({ ...p, period_label: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Period Type</label>
              <select
                value={newPeriod.period_type}
                onChange={e => setNewPeriod(p => ({ ...p, period_type: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border"
              >
                {PERIOD_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fiscal Year</label>
              <input
                type="number"
                placeholder="2024"
                value={newPeriod.fiscal_year || ''}
                onChange={e => setNewPeriod(p => ({ ...p, fiscal_year: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addPeriod}>Create Period</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddPeriod(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Period Cards */}
      {periods.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No financial periods yet. Add a period to begin normalization.</p>
        </div>
      )}

      {periods.map(period => {
        const calc = calculateNormalized(period);
        const periodAdjustments = activeAdjustments.filter(a => a.financial_id === period.id);
        return (
          <div key={period.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Period Header */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div>
                <p className="text-sm font-semibold text-foreground">{period.period_label}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{period.period_type}</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Reported EBITDA: </span>
                  <span className="font-semibold text-foreground">${(period.reported_ebitda || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Normalized EBITDA: </span>
                  <span className="font-semibold text-primary">${calc.normalized.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Financial Fields */}
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <FinancialField label="Revenue" value={period.revenue} onChange={v => updateField(period.id, 'revenue', v)} />
              <FinancialField label="COGS" value={period.cogs} onChange={v => updateField(period.id, 'cogs', v)} />
              <FinancialField label="Gross Profit" value={period.gross_profit} onChange={v => updateField(period.id, 'gross_profit', v)} />
              <FinancialField label="Operating Expenses" value={period.operating_expenses} onChange={v => updateField(period.id, 'operating_expenses', v)} />
              <FinancialField label="Reported EBITDA" value={period.reported_ebitda} onChange={v => updateField(period.id, 'reported_ebitda', v)} />
              <FinancialField label="Reported SDE" value={period.reported_sde} onChange={v => updateField(period.id, 'reported_sde', v)} />
              <FinancialField label="Owner Compensation" value={period.owner_compensation} onChange={v => updateField(period.id, 'owner_compensation', v)} />
              <FinancialField label="Depreciation" value={period.depreciation} onChange={v => updateField(period.id, 'depreciation', v)} />
              <FinancialField label="Amortization" value={period.amortization} onChange={v => updateField(period.id, 'amortization', v)} />
              <FinancialField label="Interest Expense" value={period.interest_expense} onChange={v => updateField(period.id, 'interest_expense', v)} />
              <FinancialField label="Taxes" value={period.taxes} onChange={v => updateField(period.id, 'taxes', v)} />
              <FinancialField label="Net Income" value={period.net_income} onChange={v => updateField(period.id, 'net_income', v)} />
              <FinancialField label="Cash" value={period.cash} onChange={v => updateField(period.id, 'cash', v)} />
              <FinancialField label="Funded Debt" value={period.funded_debt} onChange={v => updateField(period.id, 'funded_debt', v)} />
              <FinancialField label="Accounts Receivable" value={period.accounts_receivable} onChange={v => updateField(period.id, 'accounts_receivable', v)} />
              <FinancialField label="Accounts Payable" value={period.accounts_payable} onChange={v => updateField(period.id, 'accounts_payable', v)} />
              <FinancialField label="Inventory" value={period.inventory} onChange={v => updateField(period.id, 'inventory', v)} />
              <FinancialField label="Working Capital" value={period.working_capital} onChange={v => updateField(period.id, 'working_capital', v)} />
              <FinancialField label="Capital Expenditures" value={period.capital_expenditures} onChange={v => updateField(period.id, 'capital_expenditures', v)} />
            </div>

            {/* Adjustments */}
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recast Adjustments</p>
                <Button size="sm" variant="ghost" onClick={() => addAdjustment(period.id)}>
                  <Plus className="w-3 h-3" /> Add Adjustment
                </Button>
              </div>
              {periodAdjustments.length === 0 && (
                <p className="text-xs text-muted-foreground/60 py-2">No adjustments for this period.</p>
              )}
              {periodAdjustments.map(adj => (
                <div key={adj.id} className="rounded-lg p-3 mb-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                    <select
                      value={adj.adjustment_type}
                      onChange={e => updateAdjustment(adj.id, 'adjustment_type', e.target.value)}
                      className="px-2 py-1.5 rounded bg-secondary text-xs text-foreground border border-border"
                    >
                      {ADJUSTMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select
                      value={adj.adjustment_direction}
                      onChange={e => updateAdjustment(adj.id, 'adjustment_direction', e.target.value)}
                      className="px-2 py-1.5 rounded bg-secondary text-xs text-foreground border border-border"
                    >
                      <option value="add_back">Add-Back</option>
                      <option value="deduction">Deduction</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={adj.proposed_amount || ''}
                      onChange={e => updateAdjustment(adj.id, 'proposed_amount', parseFloat(e.target.value) || 0)}
                      className="px-2 py-1.5 rounded bg-secondary text-xs text-foreground border border-border"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => approveAdjustment(adj.id)}
                        className={`p-1.5 rounded ${adj.advisor_approval_status === 'approved' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
                        title={adj.advisor_approval_status === 'approved' ? 'Approved' : 'Approve'}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeAdjustment(adj.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Explanation"
                      value={adj.explanation || ''}
                      onChange={e => updateAdjustment(adj.id, 'explanation', e.target.value)}
                      className="px-2 py-1.5 rounded bg-secondary text-xs text-foreground border border-border"
                    />
                  </div>
                  {adj.advisor_approval_status === 'approved' && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-accent">
                      <CheckCircle2 className="w-3 h-3" /> Advisor approved: ${(adj.approved_amount || 0).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
              {/* Normalized Summary */}
              {periodAdjustments.length > 0 && (
                <div className="mt-3 p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.15)' }}>
                  <span className="text-xs text-muted-foreground">Normalized EBITDA</span>
                  <span className="text-sm font-bold text-primary">
                    ${(period.reported_ebitda || 0).toLocaleString()} + ${calc.addBacks.toLocaleString()} - ${calc.deductions.toLocaleString()} = ${calc.normalized.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Save Button */}
      {periods.length > 0 && (
        <div className="pt-2">
          <Button onClick={() => onSave?.(periods, activeAdjustments)} className="bg-primary text-primary-foreground">
            Save Financial Normalization
          </Button>
        </div>
      )}
    </div>
  );
}

function FinancialField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>
      <input
        type="number"
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2.5 py-1.5 rounded bg-secondary text-xs text-foreground border border-border focus:border-primary focus:outline-none"
      />
    </div>
  );
}