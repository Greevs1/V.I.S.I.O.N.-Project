/**
 * DeliverablesWorkspace — Phase 13.3E.5
 *
 * Complete Deliverables workspace. Organizes valuation outputs by audience
 * (Client, Advisor, Transaction and Capital Partners). Each deliverable
 * shows full metadata with permission-aware actions.
 *
 * Reports are generated from approved records. Internal reports may use
 * internal snapshots; client-safe reports use only the client-safe snapshot.
 * No client report is generated from mutable working records without clear
 * draft labeling. Shared outputs remain historical and unchanged.
 *
 * Stale detection: a report becomes stale when its source valuation version
 * or approved visible content changes. Regeneration creates a new report
 * version or replaces only an unshared draft.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Target, FileText, Users, Building } from 'lucide-react';
import { getValuationVersions, shareValuation, revokeClientAccess } from '@/lib/valuationService';
import { buildDeliverables, groupByAudience, computeDeliverablesProgress } from '@/lib/valuation/deliverablesEngine';
import { buildExecutiveInsights } from '@/lib/valuation/insightsEngine';
import DeliverableCard from './deliverables/DeliverableCard';
import ReportPreviewDrawer from './deliverables/ReportPreviewDrawer';
import CollapsibleSection from './shared/CollapsibleSection';
import { useAccordionState } from '@/hooks/useAccordionState';

const AUDIENCE_ICONS = {
  Client: Users,
  Advisor: FileText,
  Transaction: Building,
};

export default function DeliverablesWorkspace({ valuationId, summary, calcSummary, readiness, intelligence, canPublish, onNavigateToValidate, density = 'summary' }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDeliverable, setPreviewDeliverable] = useState(null);
  const [acting, setActing] = useState(null);

  const accordionKey = `deliverables_accordion_${valuationId}_${summary?.valuation?.business_id || 'unknown'}`;
  const accordion = useAccordionState(accordionKey, null);

  const load = useCallback(async () => {
    if (!valuationId) return;
    setLoading(true);
    try {
      const res = await getValuationVersions(valuationId);
      setVersions(res.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => { load(); }, [load]);

  // Build insights data for report previews
  const insights = useMemo(() => {
    if (!intelligence && !calcSummary) return null;
    return buildExecutiveInsights({
      intelligence,
      calcSummary,
      readiness,
      summary,
      valueDrivers: [],
      versionDeltas: [],
    });
  }, [intelligence, calcSummary, readiness, summary]);

  const deliverables = useMemo(
    () => buildDeliverables({ summary, versions, readiness }),
    [summary, versions, readiness]
  );

  const grouped = useMemo(() => groupByAudience(deliverables), [deliverables]);
  const progress = useMemo(() => computeDeliverablesProgress(deliverables, { summary, readiness }), [deliverables, summary, readiness]);

  const handleShare = async (deliverable) => {
    if (!canPublish || acting) return;
    setActing(deliverable.key);
    try {
      const currentVersion = versions[0];
      if (currentVersion) {
        await shareValuation(valuationId, currentVersion.id);
        await load();
      }
    } catch {
      // non-fatal
    } finally {
      setActing(null);
    }
  };

  const handleRevoke = async (deliverable) => {
    if (!canPublish || acting) return;
    setActing(deliverable.key);
    try {
      await revokeClientAccess(valuationId);
      await load();
    } catch {
      // non-fatal
    } finally {
      setActing(null);
    }
  };

  const handleGenerate = async (deliverable) => {
    // For this phase, generation opens the preview drawer
    setPreviewDeliverable(deliverable);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading deliverables…</span>
      </div>
    );
  }

  // Empty state — no published version
  const hasVersion = (summary?.versionCount || 0) > 0;
  if (!hasVersion) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Deliverables</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Prepare, review, publish, and share valuation outputs for each intended audience.
          </p>
        </div>
        <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Publish a valuation version before generating final client deliverables.</p>
          <p className="text-[10px] text-muted-foreground/70 mt-2">Complete the Valuation stage and publish to unlock deliverable generation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Deliverables</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Prepare, review, publish, and share valuation outputs for each intended audience.
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg p-2.5 bg-background/40 border border-border text-center">
          <p className="text-lg font-bold text-accent">{progress.generated}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Generated</p>
        </div>
        <div className="rounded-lg p-2.5 bg-background/40 border border-border text-center">
          <p className="text-lg font-bold text-accent">{progress.shared}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Shared</p>
        </div>
        <div className="rounded-lg p-2.5 bg-background/40 border border-border text-center">
          <p className="text-lg font-bold text-destructive">{progress.needs_attention}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Needs Attention</p>
        </div>
        <div className="rounded-lg p-2.5 bg-background/40 border border-border text-center">
          <p className="text-lg font-bold text-primary">{progress.ready}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Ready</p>
        </div>
      </div>

      {/* Version + sharing status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Current Version</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {versions[0] ? `v${versions[0].version_number}` : 'Not published'}
          </p>
        </div>
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sharing Status</p>
          <p className="text-sm font-semibold text-foreground mt-0.5 capitalize">
            {summary?.valuation?.client_sharing_status?.replace(/_/g, ' ') || 'not shared'}
          </p>
        </div>
        <div className="rounded-lg p-3 bg-background/40 border border-border">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Versions</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{versions.length}</p>
        </div>
      </div>

      {/* Deliverables by audience — collapsible groups */}
      {grouped.map((group) => {
        const Icon = AUDIENCE_ICONS[group.key] || FileText;
        const readyCount = group.deliverables.filter((d) => d.status === 'ready' || d.status === 'generated').length;
        const staleCount = group.deliverables.filter((d) => d.is_stale).length;
        const sharedCount = group.deliverables.filter((d) => d.is_shared).length;
        return (
          <CollapsibleSection
            key={group.key}
            id={`audience_${group.key}`}
            icon={Icon}
            title={group.label}
            subtitle={`${group.deliverables.length} report${group.deliverables.length !== 1 ? 's' : ''}`}
            status={readyCount > 0 ? 'in_progress' : 'not_started'}
            primaryMetric={{ label: 'Reports', value: `${group.deliverables.length}` }}
            summary={
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{readyCount} ready</span>
                {staleCount > 0 && <span className="text-amber-400">{staleCount} stale</span>}
                {sharedCount > 0 && <span className="text-accent">{sharedCount} shared</span>}
              </div>
            }
            isOpen={accordion.isOpen(`audience_${group.key}`)}
            onToggle={() => accordion.toggle(`audience_${group.key}`)}
            density={density}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {group.deliverables.map((d) => (
                <DeliverableCard
                  key={d.key}
                  deliverable={d}
                  canPublish={canPublish}
                  onPreview={(dd) => setPreviewDeliverable(dd)}
                  onGenerate={handleGenerate}
                  onShare={handleShare}
                  onRevoke={handleRevoke}
                />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}

      {/* Version history */}
      {versions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Published Versions</p>
          <div className="space-y-1.5">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 text-xs p-2.5 rounded-lg bg-background/40 border border-border">
                <span className="font-semibold text-foreground">v{v.version_number}</span>
                {v.version_label && <span className="text-muted-foreground">· {v.version_label}</span>}
                <span className="text-muted-foreground ml-auto">
                  {v.published_at ? new Date(v.published_at).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footnote */}
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Client-safe deliverables display only the server-constructed client snapshot — never internal confidence,
        evidence, or calculation detail. Internal deliverables are advisor-facing only. Shared outputs remain
        historical and unchanged; regeneration creates a new report version or replaces only an unshared draft.
      </p>

      {/* Preview drawer */}
      {previewDeliverable && (
        <ReportPreviewDrawer
          deliverable={previewDeliverable}
          valuationData={insights}
          onClose={() => setPreviewDeliverable(null)}
          onApprove={() => setPreviewDeliverable(null)}
          onGenerate={() => setPreviewDeliverable(null)}
        />
      )}
    </div>
  );
}