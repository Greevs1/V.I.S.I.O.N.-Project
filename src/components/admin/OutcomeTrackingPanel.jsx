/**
 * OutcomeTrackingPanel — Phase 4: Admin Outcome Review UI
 * super_admin / advisor only — shown in AdminView under a new tab.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, Clock, XCircle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Edit2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const STATUS_COLORS = {
  verified: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed_pending_actuals: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  in_progress: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  projected: 'bg-secondary text-muted-foreground border-border',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  archived: 'bg-secondary/50 text-muted-foreground border-border',
};

const SOURCE_LABELS = {
  sprint_item: 'Sprint Item',
  sprint: 'Sprint',
  strategy_expansion: 'Strategy Stack',
  strategy: 'Strategy',
  manual_outcome: 'Manual',
  roadmap_item: 'Legacy (Sprint)',
};

function fmt(val) {
  if (val == null) return '—';
  return `$${Math.round(val).toLocaleString()}`;
}

function fmtVariance(val) {
  if (val == null) return { label: '—', color: 'text-muted-foreground' };
  const color = val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-muted-foreground';
  const label = val > 0 ? `+${fmt(val)}` : fmt(val);
  return { label, color };
}

export default function OutcomeTrackingPanel({ targetProfileId, targetBusinessId, clientName, clientEmail, isSuperAdmin }) {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSourceType, setFilterSourceType] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: outcomesData = { outcomes: [] }, isLoading, refetch } = useQuery({
    queryKey: ['admin-outcomes', targetBusinessId, targetProfileId, filterStatus, filterCategory, filterSourceType],
    queryFn: async () => {
      const res = await base44.functions.invoke('recordStrategyOutcome', {
        action: 'list',
        business_id: targetBusinessId,
        profile_id: targetProfileId,
        target_profile_id: targetProfileId,
        filter_status: filterStatus || undefined,
        filter_category: filterCategory || undefined,
        filter_source_type: filterSourceType || undefined,
      });
      return res.data || { outcomes: [] };
    },
    enabled: !!(targetProfileId || targetBusinessId),
    staleTime: 0,
  });

  const outcomes = outcomesData.outcomes || [];

  const openEdit = (outcome) => {
    setEditingId(outcome.id);
    setEditForm({
      actual_profit_impact: outcome.actual_profit_impact ?? '',
      actual_tax_impact: outcome.actual_tax_impact ?? '',
      actual_value_impact: outcome.actual_value_impact ?? '',
      actual_cash_flow_impact: outcome.actual_cash_flow_impact ?? '',
      actual_wealth_impact: outcome.actual_wealth_impact ?? '',
      actual_protection_impact: outcome.actual_protection_impact ?? '',
      actual_freedom_acceleration_months: outcome.actual_freedom_acceleration_months ?? '',
      evidence_notes: outcome.evidence_notes || '',
      should_include_in_learning: outcome.should_include_in_learning !== false,
      implementation_start_date: outcome.implementation_start_date || '',
      implementation_completed_date: outcome.implementation_completed_date || '',
    });
  };

  const handleSaveActuals = async (outcomeId) => {
    setSaving(true);
    const numField = (v) => v === '' || v == null ? undefined : parseFloat(v);
    try {
      const res = await base44.functions.invoke('recordStrategyOutcome', {
        action: 'update',
        outcome_id: outcomeId,
        actual_profit_impact: numField(editForm.actual_profit_impact),
        actual_tax_impact: numField(editForm.actual_tax_impact),
        actual_value_impact: numField(editForm.actual_value_impact),
        actual_cash_flow_impact: numField(editForm.actual_cash_flow_impact),
        actual_wealth_impact: numField(editForm.actual_wealth_impact),
        actual_protection_impact: numField(editForm.actual_protection_impact),
        actual_freedom_acceleration_months: numField(editForm.actual_freedom_acceleration_months),
        evidence_notes: editForm.evidence_notes || undefined,
        should_include_in_learning: editForm.should_include_in_learning,
        implementation_start_date: editForm.implementation_start_date || undefined,
        implementation_completed_date: editForm.implementation_completed_date || undefined,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Actuals saved');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-outcomes'] });
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (outcomeId) => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke('recordStrategyOutcome', {
        action: 'verify',
        outcome_id: outcomeId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Outcome verified');
      queryClient.invalidateQueries({ queryKey: ['admin-outcomes'] });
    } catch (err) {
      toast.error(err.message || 'Verify failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (outcomeId) => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke('recordStrategyOutcome', {
        action: 'reject',
        outcome_id: outcomeId,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Outcome rejected');
      queryClient.invalidateQueries({ queryKey: ['admin-outcomes'] });
    } catch (err) {
      toast.error(err.message || 'Reject failed');
    } finally {
      setSaving(false);
    }
  };

  // Summary stats
  const verified = outcomes.filter(o => o.status === 'verified');
  const pending = outcomes.filter(o => o.status === 'completed_pending_actuals');
  const totalActual = verified.reduce((s, o) => s + (o.total_actual_impact || 0), 0);
  const totalProjected = outcomes.reduce((s, o) => s + (o.total_projected_impact || 0), 0);
  const avgAccuracy = verified.filter(o => o.accuracy_percentage).length > 0
    ? Math.round(verified.filter(o => o.accuracy_percentage).reduce((s, o) => s + o.accuracy_percentage, 0) / verified.filter(o => o.accuracy_percentage).length)
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold">
          Outcome Tracking{clientName ? ` for ${clientName}` : ''}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Projected vs actual results from this client's completed 90-Day Sprint items.
        </p>
        {isSuperAdmin && (targetProfileId || targetBusinessId) && (
          <p className="text-[10px] text-muted-foreground mt-1 font-mono">
            {targetProfileId && <>profile_id: {targetProfileId}</>}
            {targetProfileId && targetBusinessId && ' · '}
            {targetBusinessId && <>business_id: {targetBusinessId}</>}
          </p>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Outcomes', value: outcomes.length, sub: null },
          { label: 'Verified', value: verified.length, sub: 'with actual results' },
          { label: 'Total Actual Impact', value: totalActual > 0 ? fmt(totalActual) : '—', sub: 'verified only' },
          { label: 'Avg Accuracy', value: avgAccuracy != null ? `${avgAccuracy}%` : '—', sub: 'actual / projected' },
        ].map(stat => (
          <div key={stat.label} className="glass rounded-xl p-4 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
            <p className="text-xl font-bold">{stat.value}</p>
            {stat.sub && <p className="text-[10px] text-muted-foreground">{stat.sub}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
          <option value="">All Statuses</option>
          {['projected', 'in_progress', 'completed_pending_actuals', 'completed', 'verified', 'rejected'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
          <option value="">All Categories</option>
          {['tax', 'profit', 'value', 'operations', 'cash_flow', 'wealth', 'protection', 'freedom'].map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select value={filterSourceType} onChange={e => setFilterSourceType(e.target.value)}
          className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
          <option value="">All Sources</option>
          <option value="sprint_item">Sprint Item</option>
          <option value="sprint">Sprint</option>
          <option value="strategy_expansion">Strategy Stack</option>
          <option value="strategy">Strategy</option>
          <option value="manual_outcome">Manual</option>
          <option value="roadmap_item">Legacy (Sprint)</option>
        </select>
        <button onClick={() => refetch()} className="h-8 w-8 flex items-center justify-center bg-secondary border border-border rounded-lg text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Outcomes List */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && outcomes.length === 0 && (
        <div className="glass rounded-xl p-10 text-center space-y-2">
          <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No outcomes yet for this client.</p>
          <p className="text-xs text-muted-foreground">Outcomes are created when this client's 90-Day Sprint items are completed.</p>
        </div>
      )}

      {!isLoading && outcomes.map(outcome => {
        const isExpanded = expandedId === outcome.id;
        const isEditing = editingId === outcome.id;
        const variance = fmtVariance(outcome.total_variance);

        return (
          <div key={outcome.id} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header Row */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30"
              onClick={() => setExpandedId(isExpanded ? null : outcome.id)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{outcome.source_name || 'Unnamed Outcome'}</span>
                  <span className={`text-[10px] border rounded-full px-2 py-0.5 ${STATUS_COLORS[outcome.status] || STATUS_COLORS.projected}`}>
                    {outcome.status?.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5">
                    {SOURCE_LABELS[outcome.source_type] || outcome.source_type}
                  </span>
                  {outcome.category && (
                    <span className="text-[10px] text-muted-foreground">{outcome.category.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>

              {/* Quick metrics */}
              <div className="hidden md:flex items-center gap-4 text-xs shrink-0">
                <div className="text-right">
                  <p className="text-muted-foreground text-[10px]">Projected</p>
                  <p className="font-medium">{fmt(outcome.total_projected_impact)}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-[10px]">Actual</p>
                  <p className="font-medium">{outcome.total_actual_impact != null ? fmt(outcome.total_actual_impact) : <span className="text-muted-foreground text-[10px]">pending</span>}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-[10px]">Variance</p>
                  <p className={`font-medium ${variance.color}`}>{variance.label}</p>
                </div>
                {outcome.accuracy_percentage != null && (
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px]">Accuracy</p>
                    <p className={`font-medium ${outcome.accuracy_percentage >= 90 ? 'text-emerald-400' : outcome.accuracy_percentage >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                      {Math.round(outcome.accuracy_percentage)}%
                    </p>
                  </div>
                )}
              </div>

              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Expanded Detail */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-4 space-y-4">
                {/* Projected vs Actual grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Profit Impact', proj: outcome.projected_profit_impact, actual: outcome.actual_profit_impact },
                    { label: 'Tax Impact', proj: outcome.projected_tax_impact, actual: outcome.actual_tax_impact },
                    { label: 'Value Impact', proj: outcome.projected_value_impact, actual: outcome.actual_value_impact },
                    { label: 'Cash Flow', proj: outcome.projected_cash_flow_impact, actual: outcome.actual_cash_flow_impact },
                  ].map(row => (
                    <div key={row.label} className="bg-secondary/40 rounded-lg p-3 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground">{row.label}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Proj:</span>
                        <span>{fmt(row.proj)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Actual:</span>
                        <span className={row.actual != null ? 'font-medium' : 'text-muted-foreground text-[10px]'}>
                          {row.actual != null ? fmt(row.actual) : 'pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Freedom acceleration */}
                {(outcome.projected_freedom_acceleration_months || outcome.actual_freedom_acceleration_months) && (
                  <div className="flex items-center gap-4 text-xs bg-secondary/30 rounded-lg px-4 py-2.5">
                    <span className="text-muted-foreground">Freedom Acceleration:</span>
                    <span>Projected: {outcome.projected_freedom_acceleration_months != null ? `${outcome.projected_freedom_acceleration_months} mo` : '—'}</span>
                    <span>Actual: {outcome.actual_freedom_acceleration_months != null ? <strong>{outcome.actual_freedom_acceleration_months} mo</strong> : <span className="text-muted-foreground">pending</span>}</span>
                  </div>
                )}

                {/* Evidence notes */}
                {outcome.evidence_notes && (
                  <div className="bg-secondary/30 rounded-lg px-3 py-2.5 text-xs text-muted-foreground">
                    <strong className="text-foreground">Evidence: </strong>{outcome.evidence_notes}
                  </div>
                )}

                {/* Edit Actuals Form */}
                {isEditing ? (
                  <div className="bg-secondary/50 rounded-xl p-4 space-y-4">
                    <p className="text-xs font-semibold">Enter Actual Impact</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { key: 'actual_profit_impact', label: 'Profit Impact ($)' },
                        { key: 'actual_tax_impact', label: 'Tax Impact ($)' },
                        { key: 'actual_value_impact', label: 'Value Impact ($)' },
                        { key: 'actual_cash_flow_impact', label: 'Cash Flow ($)' },
                        { key: 'actual_wealth_impact', label: 'Wealth Impact ($)' },
                        { key: 'actual_freedom_acceleration_months', label: 'Freedom Accel (months)' },
                      ].map(f => (
                        <div key={f.key} className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">{f.label}</label>
                          <input
                            type="number"
                            value={editForm[f.key]}
                            onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder="0"
                            className="w-full h-8 bg-background border border-border rounded-lg px-3 text-xs outline-none focus:border-primary/50"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">Start Date</label>
                        <input type="date" value={editForm.implementation_start_date}
                          onChange={e => setEditForm(p => ({ ...p, implementation_start_date: e.target.value }))}
                          className="w-full h-8 bg-background border border-border rounded-lg px-3 text-xs outline-none focus:border-primary/50" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">Completion Date</label>
                        <input type="date" value={editForm.implementation_completed_date}
                          onChange={e => setEditForm(p => ({ ...p, implementation_completed_date: e.target.value }))}
                          className="w-full h-8 bg-background border border-border rounded-lg px-3 text-xs outline-none focus:border-primary/50" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Evidence Notes</label>
                      <textarea value={editForm.evidence_notes}
                        onChange={e => setEditForm(p => ({ ...p, evidence_notes: e.target.value }))}
                        rows={2}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50 resize-none"
                        placeholder="How was this verified? What documents support it?" />
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={editForm.should_include_in_learning}
                        onChange={e => setEditForm(p => ({ ...p, should_include_in_learning: e.target.checked }))}
                        className="w-3.5 h-3.5 accent-primary" />
                      Include in learning data
                    </label>
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="h-8 text-xs bg-primary text-primary-foreground" onClick={() => handleSaveActuals(outcome.id)} disabled={saving}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Actuals'}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => openEdit(outcome)}>
                      <Edit2 className="w-3 h-3" /> Enter Actuals
                    </Button>
                    {outcome.status !== 'verified' && outcome.total_actual_impact != null && (
                      <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleVerify(outcome.id)} disabled={saving}>
                        <CheckCircle className="w-3 h-3" /> Verify
                      </Button>
                    )}
                    {!['verified', 'rejected'].includes(outcome.status) && (
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => handleReject(outcome.id)} disabled={saving}>
                        <XCircle className="w-3 h-3" /> Reject
                      </Button>
                    )}
                    {outcome.verified_at && (
                      <span className="text-[10px] text-muted-foreground">Verified {new Date(outcome.verified_at).toLocaleDateString()}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}