/**
 * BusinessValuation — Phase 13.3F.2
 *
 * Redesigned landing page. An Enterprise Value Dashboard that immediately
 * answers the questions a business owner and advisor care about most.
 *
 * Hierarchy:
 *   1. Next Best Action (one primary action)
 *   2. Advisor Metrics Bar (advisor-only, secondary)
 *   3. Enterprise Value Panel (headline)
 *   4. Owner KPI Cards (four compact cards)
 *   5. Value Insights (strength, risk, opportunity, next action)
 *   6. Valuation Progress (six-stage journey)
 *   7. Value Change Summary (version delta)
 *   8. Valuation History (archived, expandable)
 *   9. Valuation Details (drawer, administrative)
 *
 * No valuation calculations, engine logic, publication, versioning, sharing,
 * permissions, staleness, audit, or business scoping logic is changed.
 * This phase changes presentation, hierarchy, and interaction only.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useOpenDocuments } from '@/lib/visionWorkspace/openDocument';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useBusinessContext } from '@/lib/BusinessContext';
import { getValuationByBusiness, getVersionDeltas, restoreArchivedValuation, getValuationAccessSummary } from '@/lib/valuationService';
import { getCalculationSummary, validatePublicationReadiness, getValueDrivers } from '@/lib/valuationCalculationService';
import { getValuationIntelligence } from '@/lib/valuationIntelligenceService';
import { deriveLandingState } from '@/lib/valuation/landingPageEngine';
import { getMyRequests } from '@/lib/valuationRequestService';
import { Plus, ArrowRight, Settings, Sparkles, Calculator, Archive, Lock, RotateCcw, FileText } from 'lucide-react';

import EnterpriseValuePanel from '@/components/valuation/landing/EnterpriseValuePanel';
import OwnerKPICards from '@/components/valuation/landing/OwnerKPICards';
import ValueInsights from '@/components/valuation/landing/ValueInsights';
import LandingProgress from '@/components/valuation/landing/LandingProgress';
import ValueChangeSummary from '@/components/valuation/landing/ValueChangeSummary';
import ValuationEmptyState from '@/components/valuation/landing/ValuationEmptyState';
import ValuationHistory from '@/components/valuation/landing/ValuationHistory';
import ValuationDetailsDrawer from '@/components/valuation/landing/ValuationDetailsDrawer';
import AdvisorMetricsBar from '@/components/valuation/landing/AdvisorMetricsBar';
import StartValuationModal from '@/components/valuation/landing/StartValuationModal';
import ValuationAccessCard from '@/components/valuation/landing/ValuationAccessCard';
import ManageAccessSheet from '@/components/valuation/landing/ManageAccessSheet';
import LifecycleOverflow from '@/components/valuation/landing/LifecycleOverflow';
import RequestValuationSheet from '@/components/valuation/request/RequestValuationSheet';
import OwnerRequestCard from '@/components/valuation/request/OwnerRequestCard';

export default function BusinessValuation() {
  const navigate = useNavigate();
  // Valuation asks for evidence too — in Vision that opens the Galileo document
  // overlay rather than a standalone upload page.
  const openDocs = useOpenDocuments();
  const { supabaseProfile, role } = useAuth();
  const { context: bizCtx } = useBusinessContext();
  const businessId = bizCtx.active_business_id;

  const [summary, setSummary] = useState(null);
  const [calcSummary, setCalcSummary] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [versionDeltas, setVersionDeltas] = useState(null);
  const [valueDrivers, setValueDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showManageAccess, setShowManageAccess] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [accessSummary, setAccessSummary] = useState(null);
  const [ownerRequests, setOwnerRequests] = useState([]);
  const [showRequestSheet, setShowRequestSheet] = useState(false);

  const isAdvisor = role === 'advisor' || role === 'super_admin';

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getValuationByBusiness(businessId).catch(() => null);
      if (res?.valuation) {
        setSummary(res);
        const valuationId = res.valuation.id;
        const [cs, rd, intel, vd, drivers, acc] = await Promise.all([
          getCalculationSummary(valuationId).catch(() => null),
          validatePublicationReadiness(valuationId).catch(() => null),
          getValuationIntelligence(valuationId).catch(() => null),
          getVersionDeltas(valuationId).catch(() => null),
          getValueDrivers(valuationId).catch(() => []),
          getValuationAccessSummary(valuationId).catch(() => null),
        ]);
        setCalcSummary(cs);
        setReadiness(rd);
        setIntelligence(intel?.intelligence || intel);
        setVersionDeltas(vd?.deltas || vd);
        setValueDrivers(Array.isArray(drivers?.valueDrivers) ? drivers.valueDrivers : (Array.isArray(drivers) ? drivers : []));
        setAccessSummary(acc);
      } else {
        setSummary(null);
        setAccessSummary(null);
      }
      // Owner request state — only for business owners (advisors use the admin page)
      if (!isAdvisor && businessId) {
        const reqRes = await getMyRequests(businessId).catch(() => null);
        setOwnerRequests(reqRes?.requests || []);
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, [businessId, isAdvisor]);

  useEffect(() => { load(); }, [load]);

  const valuation = summary?.valuation;

  const landing = deriveLandingState({
    summary, calcSummary, readiness, intelligence, versionDeltas, valueDrivers,
    role, accessSummary,
  });

  const { permissions } = landing;
  const canEdit = permissions.canEdit;
  const canPublish = permissions.canPublish;

  // ── Owner request state (Phase 13.3G.4) ──────────────────────────────────
  // Owners request valuations; admins create them. Determine the owner's
  // request state to drive the CTA, status card, and primary next action.
  const CLOSED_STATUSES = ['withdrawn', 'declined', 'closed', 'converted_to_valuation'];
  const activeRequest = ownerRequests.find(r => !CLOSED_STATUSES.includes(r.status));
  const approvedUnconverted = ownerRequests.find(r => r.status === 'approved');
  const convertedRequest = ownerRequests.find(r => r.status === 'converted_to_valuation');
  const waitingOnOwner = ownerRequests.find(r => r.status === 'waiting_on_owner');
  const hasOwnerRequest = !!activeRequest || !!approvedUnconverted;

  // Owner-specific primary next action (overrides advisor-focused engine output)
  const ownerNextAction = (() => {
    if (isAdvisor) return landing.nextAction;
    if (waitingOnOwner) return { label: 'Respond to Valuation Team', why: 'The valuation team needs information from you.', unlocks: 'Continued progress', owner: 'Owner', link: 'owner_request' };
    if (convertedRequest && valuation?.id) return { label: 'Continue Valuation', why: 'Your valuation has been created.', unlocks: 'Enterprise Value analysis', owner: 'Advisor', link: 'valuation' };
    if (valuation && valuation.status !== 'archived') return { label: 'Continue Valuation', why: 'Your valuation is in progress.', unlocks: 'Enterprise Value analysis', owner: 'Advisor', link: 'valuation' };
    if (activeRequest) return { label: 'View Valuation Request', why: 'Your request is being reviewed.', unlocks: 'Valuation setup', owner: 'Advisor', link: 'owner_request' };
    if (approvedUnconverted) return { label: 'View Valuation Request', why: 'Your request has been approved and is awaiting valuation setup.', unlocks: 'Valuation setup', owner: 'Advisor', link: 'owner_request' };
    if (!valuation) return { label: 'Request a Valuation', why: 'Request an advisor-led enterprise value analysis.', unlocks: 'The advisory journey', owner: 'Owner', link: 'request_valuation', isRequest: true };
    if (valuation?.status === 'archived') return { label: 'Request a New Valuation', why: 'The current valuation is archived.', unlocks: 'A fresh valuation cycle', owner: 'Owner', link: 'request_valuation', isRequest: true };
    if (valuation?.client_sharing_status === 'shared') return { label: 'View Results', why: 'Your valuation results have been shared.', unlocks: 'Client-facing deliverables', owner: 'Advisor', link: 'deliverables' };
    return landing.nextAction;
  })();

  const handleOwnerNavigate = (link) => {
    if (link === 'request_valuation') { setShowRequestSheet(true); return; }
    if (link === 'owner_request') { /* OwnerRequestCard handles inline */ return; }
    handleNavigate(link);
  };

  const handleStart = () => {
    setShowStartModal(true);
  };

  const handleCreated = (newVal) => {
    if (newVal?.id) navigate(`/advisory/valuation/${newVal.id}`);
  };

  const handleRestore = async () => {
    if (!valuation?.id) return;
    setRestoring(true);
    try {
      await restoreArchivedValuation(valuation.id);
      await load();
    } catch (err) {
      console.error('Failed to restore:', err);
    } finally {
      setRestoring(false);
    }
  };

  const handleNavigate = (link) => {
    if (!link) return;
    if (link === 'start') { handleStart(); return; }
    if (link === 'restore') { handleRestore(); return; }
    if (link === 'upload') { openDocs({ mode: 'upload' }); return; }
    if (link === 'history') { setDetailsOpen(false); return; }
    if (link === 'manage_access') { setShowManageAccess(true); return; }
    if (valuation?.id) navigate(`/advisory/valuation/${valuation.id}?ws=${link}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const businessName = summary?.business?.business_name || 'Your Business';
  const { viewMode } = landing;

  // ── No valuation state ──────────────────────────────────────────────────
  if (viewMode.noValuation) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-16">
        <Header businessName={businessName} isAdvisor={isAdvisor} onOpenDetails={() => setDetailsOpen(true)} />
        {isAdvisor ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.06) 0%, rgba(0,212,255,0.03) 100%)', border: '1px solid rgba(212,168,83,0.15)' }}
          >
            <Calculator className="w-8 h-8 text-primary/50 mx-auto mb-3" />
            <h2 className="text-xl font-display font-semibold text-foreground mb-2">No Business Valuation Yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {permissions.canCreate
                ? 'Begin a structured, advisor-led enterprise value analysis. The system will inspect your existing platform data to establish a readiness baseline.'
                : 'Your advisor will initiate the valuation process. Enterprise Value analysis will appear here once started.'}
            </p>
            {permissions.canCreate ? (
              <button
                onClick={handleStart}
                className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
                style={{ background: '#D4A853', color: '#08080C' }}
              >
                <Plus className="w-4 h-4" /> Start New Valuation
              </button>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground/70 flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3" /> You need an advisor assignment to start a valuation.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Owner: request flow — duplicate prevention */}
            {hasOwnerRequest ? (
              <OwnerRequestCard
                businessId={businessId}
                requests={ownerRequests}
                onReload={load}
                onConverted={load}
                onRequestValuation={() => openDocs({ mode: 'upload' })}
              />
            ) : (
              <div
                className="rounded-2xl p-8 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.06) 0%, rgba(0,212,255,0.03) 100%)', border: '1px solid rgba(212,168,83,0.15)' }}
              >
                <FileText className="w-8 h-8 text-primary/50 mx-auto mb-3" />
                <h2 className="text-xl font-display font-semibold text-foreground mb-2">Request a Valuation</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Request an advisor-led enterprise value analysis. An administrator will review your request and assign the right advisor for your business.
                </p>
                <button
                  onClick={() => setShowRequestSheet(true)}
                  className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
                  style={{ background: '#D4A853', color: '#08080C' }}
                >
                  <Plus className="w-4 h-4" /> Request a Valuation
                </button>
              </div>
            )}
          </>
        )}
        <StartValuationModal
          open={showStartModal}
          onClose={() => setShowStartModal(false)}
          businessId={businessId}
          onCreated={handleCreated}
          defaultLeadProfileId={supabaseProfile?.id}
        />
        <RequestValuationSheet
          open={showRequestSheet}
          onOpenChange={setShowRequestSheet}
          businessId={businessId}
          businessName={summary?.business?.business_name || 'Your Business'}
          onSubmitted={() => load()}
        />
      </div>
    );
  }

  // ── Archived state ──────────────────────────────────────────────────────
  if (viewMode.showArchivedState) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-16">
        <Header
          businessName={businessName}
          isAdvisor={isAdvisor}
          onOpenDetails={() => setDetailsOpen(true)}
          lifecycleOverflow={
            <LifecycleOverflow
              valuationId={valuation?.id}
              canArchive={false}
              canRestore={permissions.canRestore}
              isArchived={true}
              onRestored={handleRestore}
            />
          }
        />
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Archive className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">No Active Valuation</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {permissions.canRestore
              ? 'This valuation is archived and read-only. Restore it to continue working, or start a new valuation.'
              : permissions.canCreate
              ? 'The current valuation is archived. Start a new valuation or view the historical record.'
              : 'This valuation is archived and read-only.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-5">
            {permissions.canRestore && (
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
                style={{ background: '#D4A853', color: '#08080C' }}
              >
                {restoring ? 'Restoring…' : <><ArrowRight className="w-4 h-4" /> Restore Valuation</>}
              </button>
            )}
            {permissions.canCreate && (
              <button
                onClick={handleStart}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85 ${permissions.canRestore ? 'bg-secondary text-muted-foreground hover:text-foreground' : ''}`}
                style={permissions.canRestore ? {} : { background: '#D4A853', color: '#08080C' }}
              >
                <Plus className="w-4 h-4" /> Start New Valuation
              </button>
            )}
            {!isAdvisor && !hasOwnerRequest && (
              <button
                onClick={() => setShowRequestSheet(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
                style={{ background: '#D4A853', color: '#08080C' }}
              >
                <Plus className="w-4 h-4" /> Request a New Valuation
              </button>
            )}
            <button
              onClick={() => navigate(`/advisory/valuation/${valuation.id}`)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Archive className="w-4 h-4" />
              View Historical Valuation
            </button>
          </div>
          {!permissions.canRestore && !permissions.canCreate && !(!isAdvisor && !hasOwnerRequest) && (
            <p className="mt-4 text-xs text-muted-foreground/70 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" /> This valuation is archived and read-only.
            </p>
          )}
        </div>
        {!isAdvisor && hasOwnerRequest && (
          <OwnerRequestCard
            businessId={businessId}
            requests={ownerRequests}
            onReload={load}
            onConverted={load}
            onRequestValuation={() => openDocs({ mode: 'upload' })}
          />
        )}
        <ValuationAccessCard
          valuationId={valuation?.id}
          canManage={permissions.canManageAssignments}
          onManage={() => setShowManageAccess(true)}
          access={accessSummary}
        />
        <ValuationHistory currentArchived={valuation} onViewHistory={() => navigate(`/advisory/valuation/${valuation.id}`)} canEdit={canEdit} />
        <ValuationDetailsDrawer open={detailsOpen} onClose={() => setDetailsOpen(false)} summary={summary} calcSummary={calcSummary} />
        <StartValuationModal
          open={showStartModal}
          onClose={() => setShowStartModal(false)}
          businessId={businessId}
          onCreated={handleCreated}
          defaultLeadProfileId={supabaseProfile?.id}
        />
        <RequestValuationSheet
          open={showRequestSheet}
          onOpenChange={setShowRequestSheet}
          businessId={businessId}
          businessName={summary?.business?.business_name || 'Your Business'}
          onSubmitted={() => load()}
        />
        <ManageAccessSheet
          open={showManageAccess}
          onOpenChange={setShowManageAccess}
          valuationId={valuation?.id}
          canManage={permissions.canManageAssignments}
          onUpdated={load}
        />
      </div>
    );
  }

  // ── Empty state (valuation exists, no conclusion) ──────────────────────
  if (viewMode.showEmptyState) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-16">
        <Header
          businessName={businessName}
          isAdvisor={isAdvisor}
          onOpenDetails={() => setDetailsOpen(true)}
          lifecycleOverflow={
            <LifecycleOverflow
              valuationId={valuation?.id}
              canArchive={permissions.canArchive}
              canRestore={false}
              isArchived={false}
              onArchived={load}
            />
          }
        />
        <NextActionBar nextAction={ownerNextAction} onNavigate={handleOwnerNavigate} creating={creating} />
        {isAdvisor && <AdvisorMetricsBar metrics={landing.advisorMetrics} />}
        <ValuationEmptyState
          emptyState={landing.emptyState}
          valuationId={valuation?.id}
          onNavigate={handleNavigate}
          onUpload={() => openDocs({ mode: 'upload' })}
          canEdit={canEdit}
        />
        <ValuationAccessCard
          valuationId={valuation?.id}
          canManage={permissions.canManageAssignments}
          onManage={() => setShowManageAccess(true)}
          access={accessSummary}
        />
        <LandingProgress stages={landing.stages} onNavigate={handleNavigate} />
        <ValuationDetailsDrawer open={detailsOpen} onClose={() => setDetailsOpen(false)} summary={summary} calcSummary={calcSummary} />
        <ManageAccessSheet
          open={showManageAccess}
          onOpenChange={setShowManageAccess}
          valuationId={valuation?.id}
          canManage={permissions.canManageAssignments}
          onUpdated={load}
        />
      </div>
    );
  }

  // ── Full dashboard (approved conclusion exists) ─────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <Header
        businessName={businessName}
        isAdvisor={isAdvisor}
        onOpenDetails={() => setDetailsOpen(true)}
        lifecycleOverflow={
          <LifecycleOverflow
            valuationId={valuation?.id}
            canArchive={permissions.canArchive}
            canRestore={false}
            isArchived={false}
            onArchived={load}
          />
        }
      />

      {/* Primary next action */}
      <NextActionBar nextAction={ownerNextAction} onNavigate={handleOwnerNavigate} creating={creating} />

      {/* Advisor-only metrics (secondary) */}
      {isAdvisor && <AdvisorMetricsBar metrics={landing.advisorMetrics} />}

      {/* Enterprise Value — headline */}
      <EnterpriseValuePanel
        currentValue={landing.insights?.currentValue}
        valuation={valuation}
        summary={summary}
        isAdvisor={isAdvisor}
        workflowState={landing.workflowState}
      />

      {/* KPI cards */}
      <OwnerKPICards cards={landing.kpiCards} onNavigate={handleNavigate} />

      {/* Value insights */}
      <ValueInsights topInsights={landing.topInsights} onNavigate={handleNavigate} />

      {/* Valuation Access */}
      <ValuationAccessCard
        valuationId={valuation?.id}
        canManage={permissions.canManageAssignments}
        onManage={() => setShowManageAccess(true)}
        access={accessSummary}
      />

      {/* Progress */}
      <LandingProgress stages={landing.stages} onNavigate={handleNavigate} />

      {/* Value change */}
      <ValueChangeSummary versionChange={landing.versionChange} onNavigate={handleNavigate} />

      {/* Valuation history (archived) */}
      <ValuationHistory
        currentArchived={valuation?.status === 'archived' ? valuation : null}
        onViewHistory={(entry) => entry?.id && navigate(`/advisory/valuation/${entry.id}`)}
        canEdit={canEdit}
      />

      {/* Administrative details drawer */}
      <ValuationDetailsDrawer open={detailsOpen} onClose={() => setDetailsOpen(false)} summary={summary} calcSummary={calcSummary} />

      {/* Manage Access sheet */}
      <ManageAccessSheet
        open={showManageAccess}
        onOpenChange={setShowManageAccess}
        valuationId={valuation?.id}
        canManage={permissions.canManageAssignments}
        onUpdated={load}
      />
    </div>
  );
  }

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ businessName, isAdvisor, onOpenDetails, lifecycleOverflow }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-5 h-5 text-primary" />
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">Enterprise Value</p>
        </div>
        <h1 className="text-2xl font-display font-bold">{businessName}</h1>
      </div>
      <div className="flex items-center gap-2">
        {lifecycleOverflow}
        {isAdvisor && (
          <button
            onClick={onOpenDetails}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs hover:text-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Details
          </button>
        )}
      </div>
    </div>
  );
}

// ── Next Action Bar ───────────────────────────────────────────────────────────
function NextActionBar({ nextAction, onNavigate, creating }) {
  if (!nextAction) return null;
  return (
    <div
      className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.2)' }}
    >
      <div className="flex items-start gap-3 flex-1">
        <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended Next Action</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{nextAction.label}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
            {nextAction.why && <p className="text-[11px] text-muted-foreground">{nextAction.why}</p>}
            {nextAction.unlocks && <p className="text-[11px] text-primary/70">Unlocks: {nextAction.unlocks}</p>}
            {nextAction.owner && <p className="text-[11px] text-muted-foreground/70">Owner: {nextAction.owner}</p>}
          </div>
        </div>
      </div>
      {nextAction.link && (
        <button
          onClick={() => onNavigate(nextAction.link)}
          disabled={creating && nextAction.isStart}
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
          style={{ background: '#D4A853', color: '#08080C' }}
        >
          {creating && nextAction.isStart ? 'Starting…' : (
            <>
              {nextAction.isStart && <Plus className="w-4 h-4" />}
              {nextAction.isRestore && <RotateCcw className="w-4 h-4" />}
              {nextAction.label}
              {!nextAction.isStart && !nextAction.isRestore && <ArrowRight className="w-4 h-4" />}
            </>
          )}
        </button>
      )}
    </div>
  );
}