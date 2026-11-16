/**
 * IntelligenceWorkspace — Phase 13.3F.1 (Discover)
 *
 * Apple-style progressive disclosure. Groups intelligence into collapsible
 * categories with accordion behavior. Each category collapses to a summary
 * (field count, conflicts, missing, confidence) and expands to show the
 * full component. The recommended action and overall summary remain visible.
 *
 * No backend, permission, or intelligence logic changed.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getValuationIntelligence, runIntelligenceScan } from '@/lib/valuationIntelligenceService';
import { RefreshCw, Loader2, Search, Building, FileText, ClipboardCheck, Calculator, AlertCircle, BarChart3, Maximize2, Minimize2 } from 'lucide-react';
import IntelligenceSummary from './intelligence/IntelligenceSummary';
import RecommendedAction from './intelligence/RecommendedAction';
import BusinessSnapshot from './intelligence/BusinessSnapshot';
import DocumentIntelligence from './intelligence/DocumentIntelligence';
import AssessmentIntelligence from './intelligence/AssessmentIntelligence';
import AddBackCandidates from './intelligence/AddBackCandidates';
import MissingInformation from './intelligence/MissingInformation';
import CollapsibleSection from './shared/CollapsibleSection';
import { useAccordionState } from '@/hooks/useAccordionState';

const REFRESH_ACTIONS = [
  { key: 'full', label: 'Run Intelligence Scan', detail: 'Gather all sources and prefill high-confidence answers' },
  { key: 'documents', label: 'Refresh from Documents', detail: 'Re-scan uploaded documents' },
  { key: 'assessments', label: 'Refresh from Assessments', detail: 'Re-scan completed assessments' },
];

const CATEGORY_IDS = ['business_snapshot', 'documents', 'assessments', 'add_backs', 'missing_info'];

export default function IntelligenceWorkspace({ valuationId, canEdit, onIntelligenceLoaded, density = 'summary' }) {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const accordionKey = `discover_accordion_${valuationId}`;
  const accordion = useAccordionState(accordionKey, 'business_snapshot');

  const load = useCallback(async () => {
    if (!valuationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getValuationIntelligence(valuationId);
      setIntelligence(res.intelligence);
      if (onIntelligenceLoaded) onIntelligenceLoaded(res.intelligence);
    } catch (err) {
      setError(err.message || 'Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => { load(); }, [load]);

  const handleScan = async (scope) => {
    if (!valuationId || !canEdit || scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await runIntelligenceScan(valuationId, scope);
      setScanResult(res.scan);
      setIntelligence(res.intelligence);
      if (onIntelligenceLoaded) onIntelligenceLoaded(res.intelligence);
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Gathering intelligence…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <button onClick={load} className="text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (!intelligence) return null;

  const candidates = Array.isArray(intelligence.candidates) ? intelligence.candidates : [];
  const conflicts = Array.isArray(intelligence.conflicts) ? intelligence.conflicts : [];
  const filteredCandidates = search
    ? candidates.filter((c) =>
        (c.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.source_name || '').toLowerCase().includes(search.toLowerCase()))
    : candidates;

  const populatedCount = candidates.filter((c) => c.value != null && c.value !== '').length;
  const missingCount = candidates.length - populatedCount;
  const docCount = intelligence.documentIntelligence?.documents?.length || intelligence.documentIntelligence?.length || 0;
  const assessCount = intelligence.assessmentIntelligence?.assessments?.length || intelligence.assessmentIntelligence?.length || 0;
  const addBackCount = Array.isArray(intelligence.addBackCandidates) ? intelligence.addBackCandidates.length : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="mb-2">
        <h2 className="text-lg font-display font-bold text-foreground">Discover</h2>
        <p className="text-xs text-muted-foreground mt-1">
          The platform gathers and organizes everything already known about the business.
        </p>
      </div>

      {/* Refresh actions + search */}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && REFRESH_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => handleScan(a.key)}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)', color: 'hsl(var(--primary))' }}
            title={a.detail}
          >
            {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {a.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="pl-7 pr-3 py-1.5 rounded-lg text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40 sm:w-56"
          />
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className="rounded-lg p-3 flex items-center gap-3 flex-wrap text-xs" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <span className="text-accent font-medium">Scan complete</span>
          <span className="text-muted-foreground">{scanResult.records_reviewed} reviewed</span>
          <span className="text-muted-foreground">{scanResult.questions_answered} answered</span>
          <span className="text-muted-foreground">{scanResult.conflicts_found} conflicts</span>
          <span className="text-muted-foreground">{scanResult.fields_preserved} preserved (advisor lock)</span>
        </div>
      )}

      {/* Recommended action — always visible */}
      <RecommendedAction action={intelligence.recommendedAction} />

      {/* Overall summary — always visible */}
      <IntelligenceSummary summary={intelligence.summary} />

      {/* Expand/Collapse controls */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => accordion.expandAll(CATEGORY_IDS)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
          Expand All
        </button>
        <span className="text-muted-foreground/30">·</span>
        <button
          onClick={accordion.collapseAll}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Minimize2 className="w-3 h-3" />
          Collapse All
        </button>
      </div>

      {/* Collapsible categories — accordion */}
      <div className="space-y-2">
        <CollapsibleSection
          id="business_snapshot"
          icon={Building}
          title="Business Snapshot"
          subtitle="Identity, financials, ownership, commercial quality, operations"
          status={populatedCount > 0 ? 'in_progress' : 'not_started'}
          primaryMetric={{ label: 'Fields', value: `${populatedCount}/${candidates.length}` }}
          confidence={intelligence.summary?.completion_percentage}
          summary={
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{populatedCount} populated</span>
              {conflicts.length > 0 && <span className="text-amber-400">{conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}</span>}
              {missingCount > 0 && <span>{missingCount} missing</span>}
            </div>
          }
          isOpen={accordion.isOpen('business_snapshot')}
          onToggle={() => accordion.toggle('business_snapshot')}
          density={density}
        >
          <BusinessSnapshot candidates={filteredCandidates} />
        </CollapsibleSection>

        <CollapsibleSection
          id="documents"
          icon={FileText}
          title="Documents"
          subtitle="Intelligence extracted from uploaded financial documents"
          status={docCount > 0 ? 'in_progress' : 'not_started'}
          primaryMetric={{ label: 'Documents', value: `${docCount}` }}
          isOpen={accordion.isOpen('documents')}
          onToggle={() => accordion.toggle('documents')}
          density={density}
        >
          <DocumentIntelligence documentIntelligence={intelligence.documentIntelligence} />
        </CollapsibleSection>

        <CollapsibleSection
          id="assessments"
          icon={ClipboardCheck}
          title="Assessments"
          subtitle="Intelligence from completed business assessments"
          status={assessCount > 0 ? 'in_progress' : 'not_started'}
          primaryMetric={{ label: 'Assessments', value: `${assessCount}` }}
          isOpen={accordion.isOpen('assessments')}
          onToggle={() => accordion.toggle('assessments')}
          density={density}
        >
          <AssessmentIntelligence assessmentIntelligence={intelligence.assessmentIntelligence} />
        </CollapsibleSection>

        <CollapsibleSection
          id="add_backs"
          icon={Calculator}
          title="Add-Back Candidates"
          subtitle="Proposed EBITDA add-backs from document and assessment analysis"
          status={addBackCount > 0 ? 'needs_review' : 'not_started'}
          primaryMetric={{ label: 'Candidates', value: `${addBackCount}` }}
          isOpen={accordion.isOpen('add_backs')}
          onToggle={() => accordion.toggle('add_backs')}
          density={density}
        >
          <AddBackCandidates addBackCandidates={intelligence.addBackCandidates} />
        </CollapsibleSection>

        <CollapsibleSection
          id="missing_info"
          icon={AlertCircle}
          title="Missing Information"
          subtitle="Fields without verified evidence — prioritize gathering these"
          status={missingCount > 0 ? 'needs_review' : 'complete'}
          primaryMetric={{ label: 'Missing', value: `${missingCount}` }}
          isOpen={accordion.isOpen('missing_info')}
          onToggle={() => accordion.toggle('missing_info')}
          density={density}
        >
          <MissingInformation candidates={candidates} />
        </CollapsibleSection>
      </div>
    </div>
  );
}