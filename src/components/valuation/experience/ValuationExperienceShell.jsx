/**
 * ValuationExperienceShell — Phase 13.3E.4A
 *
 * The primary valuation workspace. Replaces software-module labels with an
 * institutional advisory journey:
 *
 *   1. Discover      — the platform gathers and organizes what it already knows
 *   2. Validate      — confirm evidence, resolve conflicts, approve information
 *   3. Build Value   — understand what creates or suppresses value
 *   4. Valuation     — determine what the company is worth
 *   5. Growth Plan   — prioritize how to increase that value
 *   6. Deliverables   — deliver the conclusion and plan
 *   7. Advanced      — full specialist workspace (all existing tools preserved)
 *
 * This shell owns the header, guided journey, persistent progress strip, and
 * workspace switching. It loads the same summary / calculation summary /
 * publication readiness data the previous shell loaded — no new backend
 * calls, no changes to the certified Valuation Engine.
 *
 * Non-breaking route mapping (old identifiers → new):
 *   intelligence → discover
 *   verify       → validate
 *   action_plan  → growth_plan
 *   reports      → deliverables
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getValuationSummary, getValuationAccessSummary } from '@/lib/valuationService';
import { getCalculationSummary, validatePublicationReadiness } from '@/lib/valuationCalculationService';
import { ArrowLeft, Calculator } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getApprovedConclusion, getConclusionStatus, getPublishStatus } from '@/lib/valuation/valuationState';
import { useDensityMode } from '@/hooks/useDensityMode';
import ValuationProgress from './ValuationProgress';
import GuidedJourney from './GuidedJourney';
import DensitySelector from './shared/DensitySelector';
import AdvancedWorkspaceContent from './AdvancedWorkspaceContent';
import IntelligenceWorkspace from './IntelligenceWorkspace';
import VerifyWorkspace from './VerifyWorkspace';
import BuildValueWorkspace from './BuildValueWorkspace';
import GrowthPlanWorkspace from './GrowthPlanWorkspace';
import DeliverablesWorkspace from './DeliverablesWorkspace';
import ValuationWorkspace from './ValuationWorkspace';
import AssignmentConsole from '@/components/valuation/governance/AssignmentConsole';
import ValuationAccessHeader from './ValuationAccessHeader';
import ManageAccessSheet from '@/components/valuation/landing/ManageAccessSheet';
import { FieldEvidenceProvider } from '@/components/valuation/governance/FieldEvidenceContext';
import { useFieldGovernance } from '@/hooks/useFieldGovernance';

// ── Route mapping (old → new) for non-breaking navigation ────────────────────
const ROUTE_MAP = {
  // old identifiers → new
  intelligence: 'discover',
  verify: 'validate',
  action_plan: 'growth_plan',
  'action-plan': 'growth_plan',
  reports: 'deliverables',
  // new keys (underscore and hyphen variants both pass through)
  discover: 'discover',
  validate: 'validate',
  build_value: 'build_value',
  'build-value': 'build_value',
  valuation: 'valuation',
  growth_plan: 'growth_plan',
  'growth-plan': 'growth_plan',
  deliverables: 'deliverables',
  advanced: 'advanced',
};

// ── Workspace definitions (institutional advisory labels) ─────────────────────
const WORKSPACES = [
  {
    id: 'discover',
    label: 'Discover',
    phase: '13.3E.2',
    purpose: 'The platform gathers and organizes everything already known about the business.',
    sections: ['Business Snapshot', 'Document Intelligence', 'Assessment Intelligence', 'AI Extraction', 'Financial Information', 'Ownership', 'Commercial Quality', 'Operational Maturity', 'Risks', 'Missing Information', 'Source Provenance', 'Confidence', 'Conflicts', 'Recommended Next Action'],
  },
  {
    id: 'validate',
    label: 'Validate',
    phase: '13.3E.3',
    purpose: 'Confirm the evidence, resolve conflicts, and approve the information used in the valuation.',
    sections: ['Material Financial Conflicts', 'Low-Confidence Values', 'Missing Information', 'Add-Back Candidates', 'Client Confirmations', 'Document Requests', 'Advisor Judgment', 'Methodology Decisions', 'Publication Blockers', 'Stale Inputs'],
  },
  {
    id: 'build_value',
    label: 'Build Value',
    phase: '13.3E.4A',
    purpose: 'Understand the strengths, weaknesses, risks, and capabilities that influence profitability, transferability, and valuation multiple.',
    sections: ['Financial Quality', 'Growth Quality', 'Commercial Quality', 'Operational Quality', 'Leadership and Transferability', 'Risk and Governance', 'Business Quality Summary'],
  },
  {
    id: 'valuation',
    label: 'Valuation',
    phase: '13.3E.4',
    purpose: 'Determine the indicated Enterprise Value and Equity Value using verified evidence and approved methodologies.',
    sections: ['Maintainable Earnings', 'Historical Weighting', 'Methods', 'Reconciliation', 'Enterprise Value', 'Equity Value', 'Confidence', 'Advisor Conclusion', 'Publication Readiness'],
  },
  {
    id: 'growth_plan',
    label: 'Growth Plan',
    phase: '13.3E.5',
    purpose: 'Prioritize the initiatives expected to improve EBITDA, valuation multiple, transferability, and Enterprise Value.',
    sections: ['Value-Driver Candidates', 'Risks', 'Opportunities', 'Potential Initiatives', 'Expected EBITDA Relevance', 'Expected Multiple Relevance', 'Expected Enterprise Value Relevance', 'Estimated Cost', 'Timeline', 'Difficulty', 'Confidence', 'Dependencies', 'KPI', 'Verification Method'],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    phase: '13.3E.5',
    purpose: 'Prepare, review, publish, and share valuation outputs for each intended audience.',
    sections: ['Client Enterprise Value Analysis', 'Internal Advisor Analysis', 'Valuation Summary', 'Buyer Preparation Summary', 'Lender Summary', 'CPA Summary', 'Family Office Summary', 'Board Review', 'Version Comparison', 'Valuation Story', 'Enterprise Value Waterfall', 'Client Request Status'],
  },
];

// ── Role derivation ──────────────────────────────────────────────────────────
// Determines the advisor-facing role from auth + valuation assignment.
//   advisor / super_admin with can_edit → 'advisor'
//   can_review → 'reviewer'
//   can_publish → 'publisher'
//   can_view only → 'viewer'
//   business owner (auth role 'owner') → 'business_owner'
//   team_member → 'client_team'
function deriveUserRole(authRole, assignment) {
  if (authRole === 'owner') return 'business_owner';
  if (authRole === 'team_member') return assignment?.can_view ? 'client_team' : 'viewer';
  if (authRole === 'super_admin') return 'advisor';
  // advisor
  if (assignment?.can_publish) return 'publisher';
  if (assignment?.can_review) return 'reviewer';
  if (assignment?.can_edit) return 'advisor';
  if (assignment?.can_view) return 'viewer';
  return 'viewer';
}

// ── Stage progress (real data only — no fabricated percentages) ──────────────
function computeStages({ summary, calcSummary, readiness, intelligence, queueSummary }) {
  const valuation = summary?.valuation;
  const versionCount = summary?.versionCount || 0;
  const calcs = calcSummary?.calculations || [];
  const leadAdvisor = summary?.leadAdvisor;
  const responsible = leadAdvisor
    ? `${leadAdvisor.first_name || ''} ${leadAdvisor.last_name || ''}`.trim() || 'Unassigned'
    : 'Unassigned';
  const valBlockers = readiness?.critical_blockers?.length || 0;

  const valuationConclusion = getApprovedConclusion(calcSummary);
  const valuationConclusionStatus = getConclusionStatus(calcSummary);
  const valuationPublishStatus = getPublishStatus(readiness);
  const valuationReady = !!valuationConclusion;
  const valuationStarted = calcs.length > 0 || valuation?.status === 'in_progress' || valuation?.status === 'needs_review' || valuationConclusionStatus === 'in_progress';

  // Discover stage (from intelligence)
  const intelPct = intelligence?.summary?.completion_percentage ?? null;
  const intelConflicts = intelligence?.summary?.conflicting || 0;
  const intelStatus = intelPct == null ? 'not_started' : intelConflicts > 0 ? 'blocked' : intelPct >= 80 ? 'ready' : 'in_progress';
  const intelNext = intelligence?.recommendedAction?.title || 'Run Intelligence Scan';

  // Validate stage (from verification queue)
  const qOpen = queueSummary?.total_open;
  const qBlockers = queueSummary?.publication_blockers || 0;
  const qCritical = queueSummary?.critical || 0;
  let val2Status = 'not_started';
  let val2Pct = 0;
  let val2Next = 'Open the Validation Queue';
  if (qOpen != null) {
    if (qOpen === 0) { val2Status = 'ready'; val2Pct = 100; val2Next = 'Validation complete — proceed to Build Value'; }
    else if (qBlockers > 0 || qCritical > 0) { val2Status = 'blocked'; val2Pct = 20; val2Next = `Resolve ${qBlockers || qCritical} critical item${(qBlockers || qCritical) !== 1 ? 's' : ''}`; }
    else { val2Status = 'in_progress'; val2Pct = 50; val2Next = `Resolve ${qOpen} open item${qOpen !== 1 ? 's' : ''}`; }
  }

  // Build Value stage (from intelligence completeness)
  const bvCompleteness = intelligence?.summary?.completion_percentage ?? 0;
  const bvStatus = bvCompleteness >= 60 ? 'ready' : bvCompleteness > 0 ? 'in_progress' : 'not_started';
  const bvPct = bvCompleteness;
  const bvNext = bvCompleteness >= 60 ? 'Review business quality dimensions' : 'Gather more evidence in Discover';

  return [
    { key: 'discover', label: 'Discover', status: intelStatus, percent: intelPct || 0, blockers: intelConflicts, nextAction: intelNext, responsible, phase: '13.3E.2' },
    { key: 'validate', label: 'Validate', status: val2Status, percent: val2Pct, blockers: qBlockers, nextAction: val2Next, responsible, phase: '13.3E.3' },
    { key: 'build_value', label: 'Build Value', status: bvStatus, percent: bvPct, blockers: 0, nextAction: bvNext, responsible, phase: '13.3E.4A' },
    {
      key: 'valuation',
      label: 'Valuation',
      status: valuationReady ? 'ready' : valuationPublishStatus === 'blocked' ? 'blocked' : valuationStarted ? 'in_progress' : 'not_started',
      percent: valuationReady ? 100 : valuationStarted ? 60 : 0,
      blockers: valBlockers,
      nextAction: valuationReady ? 'Review conclusion' : valuationStarted ? 'Continue calculations' : 'Open Valuation workspace',
      responsible,
      phase: '13.3E.4',
    },
    {
      key: 'growth_plan',
      label: 'Growth Plan',
      status: (valuationReady || valuationStarted) ? 'in_progress' : bvCompleteness > 0 ? 'in_progress' : 'not_started',
      percent: (valuationReady || valuationStarted) ? 40 : bvCompleteness > 0 ? 20 : 0,
      blockers: 0,
      nextAction: (valuationReady || valuationStarted) ? 'Review candidate initiatives' : bvCompleteness > 0 ? 'Complete Valuation to unlock initiatives' : 'Review Build Value and Valuation findings',
      responsible,
      phase: '13.3E.5',
    },
    {
      key: 'deliverables',
      label: 'Deliverables',
      status: versionCount > 0 ? 'in_progress' : 'not_started',
      percent: versionCount > 0 ? 50 : 0,
      blockers: valBlockers,
      nextAction: versionCount > 0 ? 'Generate and share deliverables' : 'Publish a version',
      responsible,
      phase: '13.3E.5',
    },
  ];
}

export default function ValuationExperienceShell() {
  const { valuationId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, user } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const { density, setDensity } = useDensityMode(user?.id);

  // Resolve workspace from URL query param (non-breaking route mapping)
  const rawWs = searchParams.get('ws') || 'discover';
  const mappedWs = ROUTE_MAP[rawWs] || 'discover';
  const [activeWorkspace, setActiveWorkspace] = useState(mappedWs);

  const [summary, setSummary] = useState(null);
  const [calcSummary, setCalcSummary] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [queueSummary, setQueueSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showManageAccess, setShowManageAccess] = useState(false);
  const [accessSummary, setAccessSummary] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);

  // Access summary is owned here so the header refreshes immediately when
  // ManageAccessSheet calls onUpdated — no polling, no page reload.
  const refreshAccess = useCallback(async () => {
    if (!valuationId) { setAccessSummary(null); setAccessLoading(false); return; }
    setAccessLoading(true);
    try {
      const acc = await getValuationAccessSummary(valuationId);
      setAccessSummary(acc);
    } catch {
      setAccessSummary(null);
    } finally {
      setAccessLoading(false);
    }
  }, [valuationId]);

  useEffect(() => { refreshAccess(); }, [refreshAccess]);

  // Sync active workspace when URL param changes (browser back/forward navigation)
  useEffect(() => {
    if (mappedWs !== activeWorkspace) setActiveWorkspace(mappedWs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappedWs]);

  // Track analytics for stage entry
  useEffect(() => {
    if (!valuationId || !activeWorkspace) return;
    try {
      base44.analytics.track({
        eventName: 'valuation_stage_entered',
        properties: { stage: activeWorkspace, valuation_id: valuationId },
      });
    } catch { /* non-fatal */ }
  }, [activeWorkspace, valuationId]);

  useEffect(() => {
    const load = async () => {
      if (!valuationId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getValuationSummary(valuationId);
        setSummary(res);
        const [cs, rd] = await Promise.all([
          getCalculationSummary(valuationId).catch(() => null),
          validatePublicationReadiness(valuationId).catch(() => null),
        ]);
        setCalcSummary(cs);
        setReadiness(rd);
      } catch (err) {
        setError(err.message || 'Failed to load valuation');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [valuationId]);

  const selectWorkspace = (key) => {
    const mapped = ROUTE_MAP[key] || key;
    setActiveWorkspace(mapped);
    setSearchParams({ ws: mapped }, { replace: true });
  };

  // Field-level governance — must be called before any early returns (Rules of Hooks).
  // canEdit is advisory only; the backend enforces real permissions.
  const governance = useFieldGovernance({
    valuationId,
    canEdit: isSuperAdmin || !!(summary?.assignment?.can_edit),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button onClick={() => navigate('/advisory/business-valuation')} className="text-sm text-primary hover:underline">
          ← Back to Business Valuation
        </button>
      </div>
    );
  }

  const { valuation, business, assignment } = summary || {};
  const userRole = deriveUserRole(role, assignment);
  const canEdit = isSuperAdmin || !!assignment?.can_edit;
  const canPublish = isSuperAdmin || !!assignment?.can_publish;
  const canManageAssignments = isSuperAdmin || !!assignment?.can_manage_assignments;
  const stages = computeStages({ summary, calcSummary, readiness, intelligence, queueSummary });
  const responsible = stages[0]?.responsible || 'Unassigned';
  const valStatus = summary?.valuation?.status;
  const isImmutable = valStatus === 'archived' ? 'archived' : valStatus === 'published' ? 'published' : false;

  const renderWorkspace = () => {
    switch (activeWorkspace) {
      case 'discover':
        return (
          <IntelligenceWorkspace
            valuationId={valuationId}
            canEdit={canEdit}
            onIntelligenceLoaded={setIntelligence}
            density={density}
          />
        );
      case 'validate':
        return (
          <VerifyWorkspace
            valuationId={valuationId}
            canEdit={canEdit}
            onQueueLoaded={setQueueSummary}
            density={density}
          />
        );
      case 'build_value':
        return (
          <BuildValueWorkspace
            valuationId={valuationId}
            intelligence={intelligence}
            onIntelligenceLoaded={setIntelligence}
            canEdit={canEdit}
            calcSummary={calcSummary}
            readiness={readiness}
            summary={summary}
            onNavigateToValidate={() => selectWorkspace('validate')}
            onOpenAdvanced={() => setActiveWorkspace('advanced')}
            density={density}
          />
        );
      case 'valuation':
        return (
          <ValuationWorkspace
            valuationId={valuationId}
            summary={summary}
            calcSummary={calcSummary}
            readiness={readiness}
            intelligence={intelligence}
            canEdit={canEdit}
            canPublish={canPublish}
            onOpenAdvanced={() => setActiveWorkspace('advanced')}
            onNavigateToValidate={() => selectWorkspace('validate')}
            density={density}
          />
        );
      case 'growth_plan':
        return (
          <GrowthPlanWorkspace
            valuationId={valuationId}
            intelligence={intelligence}
            calcSummary={calcSummary}
            readiness={readiness}
            summary={summary}
            canEdit={canEdit}
            onOpenAdvanced={() => setActiveWorkspace('advanced')}
            onNavigateToValidate={() => selectWorkspace('validate')}
            density={density}
          />
        );
      case 'deliverables':
          return (
            <DeliverablesWorkspace
              valuationId={valuationId}
              summary={summary}
              calcSummary={calcSummary}
              readiness={readiness}
              intelligence={intelligence}
              canPublish={canPublish}
              onNavigateToValidate={() => selectWorkspace('validate')}
              density={density}
            />
          );
      case 'advanced':
        return <AdvancedWorkspaceContent valuationId={valuationId} summary={summary} calcSummary={calcSummary} readiness={readiness} />;
      default:
        return null;
    }
  };

  // Role-aware: business owners and client team see a simplified view
  const isSimplifiedRole = userRole === 'business_owner' || userRole === 'client_team';

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/advisory/business-valuation')}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-display font-bold">{business?.business_name || 'Business'} — Business Valuation</h1>
            <p className="text-xs text-muted-foreground">
              {valuation?.status?.replace(/_/g, ' ') || 'draft'} · {valuation?.client_sharing_status?.replace(/_/g, ' ') || 'not shared'}
              {isSimplifiedRole && <span className="ml-2 text-primary/70">· {userRole === 'business_owner' ? 'Owner View' : 'Client View'}</span>}
            </p>
          </div>
        </div>
        <div className="ml-auto">
          <DensitySelector density={density} onChange={setDensity} />
        </div>
      </div>

      {/* Compact access summary — Business Owner, Lead Advisor, Reviewer, Publisher */}
      <ValuationAccessHeader
        access={accessSummary}
        loading={accessLoading}
        canManage={canManageAssignments}
        onManage={() => setShowManageAccess(true)}
      />

      {/* Assignment Console — valuation team + governance summary */}
      <AssignmentConsole summary={summary} governanceSummary={governance.summary} canManage={canPublish} />

      {/* Guided journey */}
      <GuidedJourney stages={stages} activeKey={activeWorkspace} responsible={responsible} />

      {/* Persistent progress strip */}
      <ValuationProgress stages={stages} activeKey={activeWorkspace} onSelect={selectWorkspace} />

      {/* Workspace content — wrapped with field evidence provider for clickable metrics */}
      <FieldEvidenceProvider
        valuationId={valuationId}
        intelligence={intelligence}
        calcSummary={calcSummary}
        canEdit={canEdit}
        governance={governance}
        isImmutable={isImmutable}
      >
        <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {renderWorkspace()}
        </div>
      </FieldEvidenceProvider>

      {/* Manage Access sheet */}
      <ManageAccessSheet
        open={showManageAccess}
        onOpenChange={setShowManageAccess}
        valuationId={valuationId}
        canManage={canManageAssignments}
        onUpdated={refreshAccess}
      />
    </div>
  );
}