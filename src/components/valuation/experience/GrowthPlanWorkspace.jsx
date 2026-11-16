/**
 * GrowthPlanWorkspace — Phase 13.3E.5
 *
 * Complete Growth Plan workspace. Organizes approved value drivers,
 * detractors, risks, opportunities, missing evidence, and candidate
 * initiatives into a structured advisor preparation environment.
 *
 * This is NOT the Phase 13.4 Institutional Decision Engine. It is a
 * preparation layer:
 *   - Derives candidate initiatives from valuation findings
 *   - Supports advisor-created initiatives
 *   - Provides Advisor Prioritization Preview (advisor-controlled)
 *   - Preserves Value Creation Chain of Custody
 *   - Filters client-safe content
 *
 * No Roadmap or 90-Day Sprint records are created automatically.
 * Send-to-Roadmap and Send-to-Sprint actions are disabled/gated until
 * Phase 13.4 or explicit approval.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Plus, Target, Network, Eye, Layers, Filter } from 'lucide-react';
import { getValueDrivers } from '@/lib/valuationCalculationService';
import { buildExecutiveInsights } from '@/lib/valuation/insightsEngine';
import {
  deriveCandidateInitiatives, buildChainOfCustody, computeGrowthPlanProgress,
  INITIATIVE_GROUPS,
} from '@/lib/valuation/growthPlanEngine';
import InitiativeCard from './growthplan/InitiativeCard';
import InitiativeFormModal from './growthplan/InitiativeFormModal';
import ChainOfCustodyDrawer from './growthplan/ChainOfCustodyDrawer';
import AdvisorPrioritizationPreview from './growthplan/AdvisorPrioritizationPreview';
import ClientGrowthPlanPreview from './growthplan/ClientGrowthPlanPreview';
import CollapsibleSection from './shared/CollapsibleSection';
import { useAccordionState } from '@/hooks/useAccordionState';

export default function GrowthPlanWorkspace({
  valuationId,
  intelligence,
  calcSummary,
  readiness,
  summary,
  canEdit,
  onOpenAdvanced,
  onNavigateToValidate,
  density = 'summary',
}) {
  const [valueDrivers, setValueDrivers] = useState([]);
  const [advisorInitiatives, setAdvisorInitiatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('initiatives');
  const [formModal, setFormModal] = useState(null);
  const [chainDrawer, setChainDrawer] = useState(null);
  const [chainData, setChainData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');

  const accordionKey = `growthplan_accordion_${valuationId}_${summary?.valuation?.business_id || 'unknown'}`;
  const accordion = useAccordionState(accordionKey, null);

  const load = useCallback(async () => {
    if (!valuationId) return;
    setLoading(true);
    try {
      const drivers = await getValueDrivers(valuationId).catch(() => []);
      // Extract array from response object — backend returns { valueDrivers: [...] }
      setValueDrivers(Array.isArray(drivers?.valueDrivers) ? drivers.valueDrivers : (Array.isArray(drivers) ? drivers : []));
    } catch {
      setValueDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => { load(); }, [load]);

  // Derive insights + candidate initiatives from valuation findings
  const insights = useMemo(() => {
    if (!intelligence && !calcSummary) return null;
    return buildExecutiveInsights({
      intelligence,
      calcSummary,
      readiness,
      summary,
      valueDrivers,
      versionDeltas: [],
    });
  }, [intelligence, calcSummary, readiness, summary, valueDrivers]);

  const candidateInitiatives = useMemo(() => {
    if (!insights) return [];
    return deriveCandidateInitiatives({
      intelligence,
      calcSummary,
      topDetractors: insights.topDetractors,
      fastestWins: insights.fastestWins,
    });
  }, [insights, intelligence, calcSummary]);

  // Merge candidate initiatives with advisor-created ones
  const allInitiatives = useMemo(() => {
    const candidateIds = new Set(candidateInitiatives.map((i) => i.initiative_id));
    const custom = advisorInitiatives.filter((i) => !candidateIds.has(i.initiative_id));
    // Override candidates with any advisor modifications
    const modified = candidateInitiatives.map((c) => {
      const override = advisorInitiatives.find((a) => a.initiative_id === c.initiative_id);
      return override ? { ...c, ...override } : c;
    });
    return [...modified, ...custom];
  }, [candidateInitiatives, advisorInitiatives]);

  const progress = useMemo(() => computeGrowthPlanProgress(allInitiatives), [allInitiatives]);

  // Filter by status — default to active (hide deferred/rejected/completed)
  const filteredInitiatives = useMemo(() => {
    if (statusFilter === 'active') {
      return allInitiatives.filter((i) => !['deferred', 'rejected', 'completed'].includes(i.status));
    }
    if (statusFilter === 'all') return allInitiatives;
    return allInitiatives.filter((i) => i.status === statusFilter);
  }, [allInitiatives, statusFilter]);

  const handleSaveInitiative = (initiative) => {
    setAdvisorInitiatives((prev) => {
      const existing = prev.findIndex((i) => i.initiative_id === initiative.initiative_id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = initiative;
        return next;
      }
      return [...prev, { ...initiative, initiative_id: initiative.initiative_id || `custom_${Date.now()}`, status: initiative.status || 'candidate', source: 'advisor' }];
    });
    setFormModal(null);
  };

  const handleStatusChange = (initiative, newStatus) => {
    setAdvisorInitiatives((prev) => {
      const existing = prev.findIndex((i) => i.initiative_id === initiative.initiative_id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], status: newStatus };
        return next;
      }
      return [...prev, { ...initiative, status: newStatus }];
    });
  };

  const handleOpenChain = (initiative) => {
    const chain = buildChainOfCustody(initiative, { topDrivers: insights?.topDrivers, buildValue: insights?.buildValue });
    setChainData(chain);
    setChainDrawer(initiative);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading Growth Plan…</span>
      </div>
    );
  }

  // Empty state — no approved valuation
  const hasApprovedValuation = insights?.currentValue?.hasApprovedValuation;
  if (!hasApprovedValuation && allInitiatives.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Growth Plan</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Prioritize the initiatives expected to improve EBITDA, valuation multiple, transferability, and Enterprise Value.
          </p>
        </div>
        <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <Target className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Review Build Value and Valuation findings before preparing initiatives.</p>
          <p className="text-[10px] text-muted-foreground/70 mt-2">Complete the Valuation stage to unlock approved value insights and candidate initiatives.</p>
        </div>
      </div>
    );
  }

  // Group filtered initiatives by group key
  const grouped = INITIATIVE_GROUPS.map((g) => ({
    ...g,
    initiatives: filteredInitiatives.filter((i) => i.group === g.key),
  })).filter((g) => g.initiatives.length > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Growth Plan</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Prioritize the initiatives expected to improve EBITDA, valuation multiple, transferability, and Enterprise Value.
        </p>
      </div>

      {/* Next action */}
      <div
        className="rounded-xl p-3.5 flex items-center gap-3"
        style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.2)' }}
      >
        <Target className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended Next Action</p>
          <p className="text-xs text-foreground mt-0.5">{progress.next_action}</p>
        </div>
      </div>

      {/* Progress metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Reviewed', value: progress.reviewed, color: '#00D4FF' },
          { label: 'Approved', value: progress.approved, color: '#D4A853' },
          { label: 'Client Visible', value: progress.client_visible, color: '#A855F7' },
          { label: 'With KPI', value: progress.with_kpi, color: '#22c55e' },
          { label: 'Ready', value: progress.ready, color: '#22c55e' },
        ].map((m) => (
          <div key={m.label} className="rounded-lg p-2.5 bg-background/40 border border-border text-center">
            <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { key: 'initiatives', label: 'Initiatives', icon: Layers },
          { key: 'prioritization', label: 'Prioritization Preview', icon: Target },
          { key: 'client_preview', label: 'Client Preview', icon: Eye },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === t.key ? 'bg-background text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
        {canEdit && (
          <button
            onClick={() => setFormModal({})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto"
            style={{ background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.2)', color: 'hsl(var(--primary))' }}
          >
            <Plus className="w-3.5 h-3.5" />
            New Initiative
          </button>
        )}
      </div>

      {/* Status filter — compact */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-3 h-3 text-muted-foreground" />
        {[
          { key: 'active', label: 'Top Priorities' },
          { key: 'all', label: 'All' },
          { key: 'deferred', label: 'Deferred' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'completed', label: 'Completed' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              statusFilter === f.key ? 'bg-background text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'initiatives' && (
        <div className="space-y-2">
          {grouped.length === 0 ? (
            <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-xs text-muted-foreground">No candidate initiatives derived from current findings. Complete Build Value and Valuation to surface opportunities.</p>
            </div>
          ) : (
            grouped.map((g) => {
              const approvedCount = g.initiatives.filter((i) => i.status === 'approved').length;
              const highestPriority = g.initiatives[0]; // already sorted by priority
              return (
                <CollapsibleSection
                  key={g.key}
                  id={`group_${g.key}`}
                  icon={Layers}
                  title={g.label}
                  subtitle={`${g.initiatives.length} initiative${g.initiatives.length !== 1 ? 's' : ''} · ${approvedCount} approved`}
                  status={approvedCount > 0 ? 'in_progress' : 'needs_review'}
                  primaryMetric={{ label: 'Initiatives', value: `${g.initiatives.length}` }}
                  summary={
                    highestPriority && (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="text-foreground/80 font-medium">{highestPriority.title || highestPriority.name}</span>
                        {highestPriority.expected_impact && ` — ${highestPriority.expected_impact}`}
                      </p>
                    )
                  }
                  isOpen={accordion.isOpen(`group_${g.key}`)}
                  onToggle={() => accordion.toggle(`group_${g.key}`)}
                  density={density}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {g.initiatives.map((init) => (
                      <InitiativeCard
                        key={init.initiative_id}
                        initiative={init}
                        canEdit={canEdit}
                        onEdit={(i) => setFormModal(i)}
                        onStatusChange={handleStatusChange}
                        onOpenChain={handleOpenChain}
                        onNavigateToValidate={onNavigateToValidate}
                      />
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'prioritization' && (
        <AdvisorPrioritizationPreview initiatives={allInitiatives} onEdit={(i) => setFormModal(i)} />
      )}

      {activeTab === 'client_preview' && (
        <ClientGrowthPlanPreview initiatives={allInitiatives} />
      )}

      {/* Status banner */}
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Advisor preparation environment</p>
          <p className="text-xs text-muted-foreground mt-1">
            This workspace prepares initiatives for the future Phase 13.4 Institutional Decision Engine.
            No 90-Day Sprint or Roadmap records are created automatically. "Send to Roadmap" and
            "Send to 90-Day Sprint" actions will be enabled with Phase 13.4 or explicit approval.
          </p>
        </div>
        <button
          onClick={() => onOpenAdvanced?.()}
          className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
        >
          <Network className="w-3 h-3" />
          Advanced
        </button>
      </div>

      {/* Modals */}
      {formModal && (
        <InitiativeFormModal
          initiative={formModal.initiative_id ? formModal : null}
          onSave={handleSaveInitiative}
          onClose={() => setFormModal(null)}
        />
      )}
      {chainDrawer && (
        <ChainOfCustodyDrawer
          initiative={chainDrawer}
          chain={chainData}
          onClose={() => { setChainDrawer(null); setChainData(null); }}
        />
      )}
    </div>
  );
}