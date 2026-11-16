/**
 * ReportPreviewDrawer — Phase 13.3E.5
 *
 * Full-screen preview drawer for a deliverable. Shows report sections,
 * current version, data sources, missing content, stale warnings, internal
 * or client-safe badge, and advisor approval status.
 *
 * Allows advisor to add commentary, choose visible drivers/risks/opportunities,
 * add disclosures, hide optional sections, save draft, approve, and generate.
 *
 * Does not allow clients to edit advisor conclusions.
 */
import React, { useState } from 'react';
import { X, FileText, ShieldCheck, Lock, AlertTriangle, Save, CheckCircle, Download } from 'lucide-react';

export default function ReportPreviewDrawer({ deliverable, valuationData, onClose, onApprove, onGenerate }) {
  const [commentary, setCommentary] = useState('');
  const [showDrivers, setShowDrivers] = useState(true);
  const [showRisks, setShowRisks] = useState(true);
  const [showOpportunities, setShowOpportunities] = useState(true);
  const [disclosures, setDisclosures] = useState('');
  const [hideOptionalSections, setHideOptionalSections] = useState(false);

  if (!deliverable) return null;

  const isClientSafe = deliverable.client_safe;

  // Build report sections from valuation data
  const sections = buildReportSections(deliverable, valuationData, {
    showDrivers, showRisks, showOpportunities, commentary, disclosures, hideOptionalSections,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl h-full overflow-y-auto"
        style={{ background: 'hsl(var(--card))', borderLeft: '1px solid hsl(var(--border))' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 p-4 border-b border-border" style={{ background: 'hsl(var(--card))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">{deliverable.label}</h3>
                <p className="text-[10px] text-muted-foreground">{deliverable.audience} · {deliverable.current_version || 'Draft'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isClientSafe ? (
                <span className="flex items-center gap-1 text-[9px] text-accent px-2 py-0.5 rounded bg-accent/10">
                  <ShieldCheck className="w-3 h-3" />
                  Client-Safe
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground px-2 py-0.5 rounded bg-muted/20">
                  <Lock className="w-3 h-3" />
                  Internal
                </span>
              )}
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Stale warning */}
          {deliverable.stale_warning && (
            <div className="flex items-center gap-2 rounded-lg p-3 text-xs text-destructive" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Source data has changed since this report was generated. Regenerate to update.
            </div>
          )}

          {/* Data sources */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Data Sources</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded bg-background border border-border text-muted-foreground">
                Published Version {deliverable.source_version || '—'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-background border border-border text-muted-foreground">
                {isClientSafe ? 'Client-Safe Snapshot' : 'Internal Snapshot'}
              </span>
            </div>
          </div>

          {/* Report sections */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Report Sections</p>
            <div className="space-y-2">
              {sections.map((section, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-xs font-semibold text-foreground">{section.title}</p>
                  {section.content ? (
                    <p className="text-[11px] text-muted-foreground mt-1">{section.content}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 mt-1 italic">No data available for this section.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Missing content */}
          {sections.some((s) => !s.content) && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Missing Content</p>
              <div className="rounded-lg p-3 text-xs text-muted-foreground" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}>
                {sections.filter((s) => !s.content).map((s) => s.title).join(', ')}
              </div>
            </div>
          )}

          {/* Advisor controls (only for internal or when editing) */}
          {!isClientSafe && (
            <div className="space-y-3 pt-3 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Advisor Controls</p>

              {/* Commentary */}
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Advisor Commentary</label>
                <textarea
                  className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  value={commentary}
                  onChange={(e) => setCommentary(e.target.value)}
                  placeholder="Add advisor commentary for this report…"
                />
              </div>

              {/* Visibility toggles */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showDrivers} onChange={(e) => setShowDrivers(e.target.checked)} className="rounded" />
                  Show Value Drivers
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showRisks} onChange={(e) => setShowRisks(e.target.checked)} className="rounded" />
                  Show Risks
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showOpportunities} onChange={(e) => setShowOpportunities(e.target.checked)} className="rounded" />
                  Show Opportunities
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={hideOptionalSections} onChange={(e) => setHideOptionalSections(e.target.checked)} className="rounded" />
                  Hide Optional Sections
                </label>
              </div>

              {/* Disclosures */}
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Disclosures</label>
                <textarea
                  className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2}
                  value={disclosures}
                  onChange={(e) => setDisclosures(e.target.value)}
                  placeholder="Add disclosures for this report…"
                />
              </div>
            </div>
          )}

          {/* Approval status */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Approval:</span>
            <span className="text-foreground font-medium">{deliverable.review_status || 'Pending'}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 p-4 border-t border-border flex items-center justify-end gap-2" style={{ background: 'hsl(var(--card))' }}>
          {!isClientSafe && (
            <button
              onClick={() => onApprove?.(deliverable)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-foreground px-3 py-1.5 rounded-md"
              style={{ background: 'hsl(var(--primary))' }}
            >
              <Save className="w-3 h-3" />
              Save Draft
            </button>
          )}
          <button
            onClick={() => onApprove?.(deliverable)}
            className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground px-3 py-1.5 rounded-md"
            style={{ background: 'hsl(var(--accent))' }}
          >
            <CheckCircle className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onGenerate?.(deliverable)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-foreground px-3 py-1.5 rounded-md"
            style={{ background: 'hsl(var(--primary))' }}
          >
            <Download className="w-3 h-3" />
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Build report sections from valuation data ────────────────────────────
function buildReportSections(deliverable, valuationData, opts) {
  const { showDrivers, showRisks, showOpportunities, commentary, disclosures, hideOptionalSections } = opts;
  const cv = valuationData?.currentValue;
  const drivers = valuationData?.topDrivers || [];
  const detractors = valuationData?.topDetractors || [];
  const wins = valuationData?.fastestWins || [];
  const isClientSafe = deliverable.client_safe;

  const sections = [];

  // Executive Summary
  sections.push({
    title: 'Executive Summary',
    content: cv?.hasApprovedValuation
      ? `The indicated Enterprise Value is ${cv.enterprise_value.range}. The Equity Value is ${cv.equity_value.range}. Overall confidence is ${cv.overall_confidence}/${cv.confidence_max}.`
      : 'Valuation not yet approved.',
  });

  // Enterprise Value
  sections.push({
    title: 'Enterprise Value',
    content: cv?.enterprise_value?.mid != null
      ? `Indicated Enterprise Value: ${cv.enterprise_value.mid}. Range: ${cv.enterprise_value.range}.`
      : null,
  });

  // Equity Value
  sections.push({
    title: 'Equity Value',
    content: cv?.equity_value?.mid != null
      ? `Indicated Equity Value: ${cv.equity_value.mid}. Range: ${cv.equity_value.range}.`
      : null,
  });

  // Value Drivers (if visible)
  if (showDrivers && !hideOptionalSections) {
    const visibleDrivers = isClientSafe ? drivers.filter((d) => d.client_visible) : drivers;
    sections.push({
      title: 'Value Drivers',
      content: visibleDrivers.length > 0
        ? visibleDrivers.slice(0, 5).map((d) => `• ${d.name}: ${d.current_state}`).join('\n')
        : null,
    });
  }

  // Risks (if visible)
  if (showRisks && !hideOptionalSections) {
    const visibleRisks = isClientSafe ? detractors.filter((d) => d.client_visible && d.source !== 'blocker') : detractors.filter((d) => d.source !== 'blocker');
    sections.push({
      title: 'Risks',
      content: visibleRisks.length > 0
        ? visibleRisks.slice(0, 5).map((d) => `• ${d.name}: ${d.current_issue}`).join('\n')
        : null,
    });
  }

  // Opportunities (if visible)
  if (showOpportunities && !hideOptionalSections) {
    sections.push({
      title: 'Opportunities',
      content: wins.length > 0
        ? wins.slice(0, 5).map((w) => `• ${w.name}: ${w.why_fast_win}`).join('\n')
        : null,
    });
  }

  // Advisor Commentary
  if (commentary) {
    sections.push({ title: 'Advisor Commentary', content: commentary });
  }

  // Disclosures
  if (disclosures) {
    sections.push({ title: 'Disclosures', content: disclosures });
  }

  // Methodology note
  sections.push({
    title: 'Methodology',
    content: 'This valuation was prepared in accordance with the standards of value and premise of value selected for this engagement.',
  });

  return sections;
}