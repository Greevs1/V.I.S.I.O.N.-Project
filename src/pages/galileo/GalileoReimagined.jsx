/**
 * GalileoReimagined — the Phase 5.1 Galileo experience.
 *
 * ONE PRODUCT, TWO ENTRY EXPERIENCES:
 *   - Anonymous/new users → Magic Loop (discovery conversation)
 *   - Returning authenticated users → Vision Home (business operating surface)
 *
 * The same shell supports both. This component determines which experience
 * to render based on authentication and business intelligence, and owns the
 * small amount of presentation state that the header and the Home surface
 * must share (which Playbook stage a sprint destination opens on).
 *
 * Phase 5.1: BIS is the authoritative read layer. Loading and error states
 * prevent onboarding flash for returning users.
 *
 * Feature-flagged, chrome-less.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGalileoConversation } from '@/hooks/useGalileoConversation';
import { useGalileoHome } from '@/hooks/useGalileoHome';
import { useVisionIdentity } from '@/hooks/useVisionIdentity';
import { useVisionWorkspace } from '@/hooks/useVisionWorkspace';
import { HomeMode } from '@/lib/galileo/homeContextResolver';

import GalileoShell from '@/components/galileo/shell/GalileoShell';
import ConversationStream from '@/components/galileo/shell/ConversationStream';
import LivingBusinessPulse from '@/components/galileo/shell/LivingBusinessPulse';
import IntelligenceDrawer from '@/components/galileo/shell/IntelligenceDrawer';
import NowSurface from '@/components/galileo/shell/NowSurface';
import UtilityDock from '@/components/galileo/shell/UtilityDock';
import { Link2 } from 'lucide-react';

import GalileoHome from '@/components/galileo/home/GalileoHome';
import GuestHomePreview from '@/components/galileo/home/GuestHomePreview';
import VisionHeader from '@/components/galileo/home/VisionHeader';
import VisionWorkspace from '@/components/vision/workspace/VisionWorkspace';
import GlobalGalileoBar from '@/components/galileo/shell/GlobalGalileoBar';
import VisionArrival from '@/components/galileo/arrival/VisionArrival';
import GalileoOrb from '@/components/galileo/identity/GalileoOrb';
import ScenarioContinuation from '@/components/galileo/vision/ScenarioContinuation';
import { resolveEntrySurface, shouldPlayIntroVideo } from '@/lib/galileo/arrivalContent';
import { useAuth } from '@/lib/AuthContext';

/**
 * What sits UNDER the workspace layer, in words.
 *
 * The layer already names its own levels (a workspace standing behind another),
 * so this only covers the underlay: the Vision surface the layer is open over.
 * Back from a contextual entry — What If → Upload — reads "← What If" instead of
 * a generic "Back", and the destination is the surface the owner actually left.
 */
const VISION_UNDERLAY = {
  whatif: 'What If',
  playbook: 'Playbook',
  opportunity: 'Opportunity',
  implementation: 'Your plan',
  guide: 'Galileo',
  expert: 'Expert',
  connections: 'Connections',
  saved: 'Saved',
};

/**
 * What the persistent Ask Galileo bar says it is looking at, per Vision surface.
 *
 * A LABEL, not context: the exact object behind it (the open document) is read
 * from the URL by the bar itself, because that is the only thing that
 * authoritatively knows it. This map exists so the owner can see which surface
 * Galileo would answer about — never to invent an id.
 */
const VISION_ASK_CONTEXT = {
  home: 'your business',
  domain: 'this part of your business',
  whatif: 'this scenario',
  guide: 'this plan',
  opportunity: 'this opportunity',
  implementation: 'this plan',
  playbook: 'your plan',
  connections: 'your connections',
  saved: 'what you saved',
  expert: 'your expert',
};

export default function GalileoReimagined() {
  // The conversation does not start itself here: the arrival owns the opening, so
  // the start is deferred by one decision (below) instead of being guessed at
  // mount time, before auth and restoration are known.
  const loop = useGalileoConversation({ autoStart: false });
  const home = useGalileoHome();
  const { firstName } = useVisionIdentity();
  // The workspace layer is URL-owned, so Back / refresh / deep links work.
  // Hook order matters: this must run before the early returns below.
  const workspace = useVisionWorkspace();

  // ── THE ARRIVAL (anonymous first-run entrance) ───────────────────────────
  // The cinematic introduction is the entrance to the PRODUCT, not a step in
  // onboarding. It asks the subject question ONCE and hands the answer to the
  // existing `selectContext`, so the conversation that follows is exactly the one
  // that already existed. No route change, no reload: the arrival unmounts in
  // place and the shell mounts with the first real question already in the stream.
  //
  // ROOT CAUSE OF THE MISSING ARRIVAL: it was gated on "anonymous" only, so every
  // signed-in visitor without a business (the builder preview is ALWAYS signed
  // in) skipped it and got the legacy in-stream opener. The decision is now "is
  // this a fresh Magic Loop start?", resolved once by `resolveEntrySurface`, and
  // it waits for auth so an established owner never sees a flash of the arrival.
  const auth = useAuth();
  const [arrivalVideo] = useState(shouldPlayIntroVideo);
  const [handedOff, setHandedOff] = useState(false);
  const isHomeMode = home.homeMode?.mode === HomeMode.GALILEO_HOME;
  const surface = resolveEntrySurface({
    authLoading: auth.isLoadingAuth || (auth.isAuthenticated && !home.isAuthenticated),
    homeResolving: home.isResolving,
    isHomeMode,
    conversationStarted: loop.conversation.length > 0,
    handedOff,
  });

  const handleArrivalEnter = useCallback((contextValue) => {
    setHandedOff(true);
    // The EXISTING canonical subject path — values unchanged.
    loop.respond('context', contextValue);
  }, [loop]);

  // The legacy in-stream opener runs only when the arrival did NOT open the
  // conversation (a restored session) — after a handoff it is a no-op.
  useEffect(() => {
    if (surface !== 'loop' || handedOff) return;
    loop.startConversation();
  }, [surface, handedOff, loop]);

  // Playbook stage a destination asked for (null = all stages).
  const [playbookStage, setPlaybookStage] = useState(null);

  // The guest/free business home — the Model This destination. In place, inside
  // the same shell: no route change, no member surface, no entitlement path.
  const [guestPreview, setGuestPreview] = useState(false);

  // Whether the Home surface is scrolled beneath the sticky header. The header
  // is rendered by the shell, so only the Home scroll container knows this;
  // the surface reports it up and the header changes appearance accordingly.
  const [scrolled, setScrolled] = useState(false);

  // ── The persistent Ask Galileo surface (Part 1) ──────────────────────────
  // ONE bar, present on every owner-facing surface. Its label names where the
  // owner is standing — the open workspace when there is one, otherwise the
  // Vision surface they are in — so it can never keep a surface's context after
  // they have left it (§9). The focused object is read from the URL by the bar.
  const askSurface = workspace.def
    ? { key: workspace.def.id, label: workspace.def.askContext || 'this workspace' }
    : { key: `vision_${home.homeView}`, label: VISION_ASK_CONTEXT[home.homeView] || 'your business' };

  // Closing a workspace re-reads what Home is working from. Completing or
  // removing a document assignment inside the Data Room therefore cannot leave
  // a stale Next Best Move behind on the surface the owner returns to (§28).
  const workspaceWasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = workspaceWasOpenRef.current;
    workspaceWasOpenRef.current = workspace.isOpen;
    if (wasOpen && !workspace.isOpen) home.reloadWork?.();
  }, [workspace.isOpen, home]);

  const openPlaybook = useCallback(
    (stage = null) => {
      setPlaybookStage(stage);
      home.setHomeView('playbook');
    },
    [home]
  );

  // ── Magic Loop callbacks (hooks must run before any early return) ─────
  const handlePulseAction = React.useCallback((action) => {
    loop.closeDrawer();
    if (action === 'share_financials') {
      loop.handleConnectAction('share_financials');
    }
  }, [loop]);

  const handleNowAction = React.useCallback((actionValue) => {
    loop.handleNowAction?.(actionValue);
  }, [loop]);

  // The Magic Loop dock carries only controls the guest session can honour.
  const handleUtilityAction = React.useCallback((utility) => {
    if (utility === 'connections') {
      loop.handleConnectAction('share_financials');
    }
  }, [loop]);

  const magicLoopDockItems = React.useMemo(
    () => [
      {
        key: 'connections',
        icon: Link2,
        label: 'Connections',
        onSelect: () => handleUtilityAction('connections'),
      },
    ],
    [handleUtilityAction]
  );

  // ── Loading state: BIS still resolving ────────────────────────────────
  if (surface === 'resolving') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
        <GalileoOrb state="thinking" size="presence" decorative />
        <span className="text-[13px] text-white/40 mt-3">Resolving your business…</span>
      </div>
    );
  }

  // ── Error state: BIS failed to load ───────────────────────────────────
  if (home.bisError) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black px-6">
        <GalileoOrb state="degraded" size="presence" decorative />
        <p className="text-[14px] text-white/60 mt-4 text-center max-w-[400px]">
          Galileo is having trouble loading your business.
        </p>
        <button
          onClick={home.handleRetryBis}
          className="mt-5 px-5 py-2.5 rounded-full bg-[#D4A853] text-black text-[13px] font-medium hover:bg-[#D4A853]/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── The anonymous entrance owns the screen whole ────────────────────────
  // No shell chrome around it, no blank frame inside it: the film, the brand and
  // the choice are one surface, and the transition out of it is a state change.
  if (surface === 'arrival') {
    return (
      <VisionArrival
        showVideo={arrivalVideo}
        showNoAccount={!home.isAuthenticated}
        onEnter={handleArrivalEnter}
      />
    );
  }

  // ── Magic Loop experience (new/anonymous users) ──
  const hasModel = !!loop.model;
  const showPulse = hasModel && loop.flowState !== 'welcoming' && loop.flowState !== 'intent' && loop.flowState !== 'client_role';

  // ── Shared shell props ──
  const shellContext = isHomeMode ? (home.business ? 'my_business' : null) : loop.context;
  const shellClientRole = isHomeMode ? null : loop.clientRole;
  const shellMode = isHomeMode ? home.inferredMode : loop.mode;
  const shellHasModel = isHomeMode ? !!home.businessModel : hasModel;
  const shellModelCompleteness = isHomeMode
    ? home.businessModel?.modelCompleteness || 0
    : loop.modelCompleteness;

  return (
    <>
    <GalileoShell
      cinematic={isHomeMode}
      dimmed={isHomeMode && workspace.isOpen}
      header={
        isHomeMode ? (
          <VisionHeader
            business={home.business}
            biPercent={home.businessModel?.modelCompleteness || null}
            mode={home.inferredMode}
            showMode={!!home.businessModel}
            scrolled={scrolled}
            workspaceOpen={workspace.isOpen}
            onOpenSprint={() => openPlaybook('active')}
            onOpenWorkspace={workspace.open}
          />
        ) : null
      }
      context={shellContext}
      clientRole={shellClientRole}
      mode={shellMode}
      isAuthenticated={isHomeMode ? home.isAuthenticated : loop.isAuthenticated}
      hasModel={shellHasModel}
      modelCompleteness={shellModelCompleteness}
      nowSurface={
        isHomeMode ? null : <NowSurface item={loop.nowItem} onAction={handleNowAction} />
      }
      utilityDock={
        isHomeMode
          ? null
          : showPulse
            ? <UtilityDock items={magicLoopDockItems} />
            : null
      }
      pulseBar={
        isHomeMode
          ? null
          : showPulse
            ? (
              <LivingBusinessPulse
                model={loop.model}
                signalStates={loop.signalStates}
                onSignalClick={loop.onPulseClick}
                activeDomain={loop.activePulseDomain}
              />
            )
            : null
      }
      galileoBar={
        isHomeMode ? (
          <GlobalGalileoBar surfaceKey={askSurface.key} contextLabel={askSurface.label} />
        ) : null
      }
    >
      {isHomeMode ? (
        <GalileoHome
          home={home}
          firstName={firstName}
          playbookStage={playbookStage}
          openPlaybook={openPlaybook}
          onOpenWorkspace={workspace.open}
          onReportScroll={setScrolled}
        />
      ) : guestPreview ? (
        /* ── THE DESTINATION THAT WAS MISSING ──────────────────────────────
           Model This no longer ends in a terminal card: it ends in a home about
           THIS business, built only from what the guest has shared. The drawer is
           mounted alongside it so a domain tile opens the existing intelligence,
           exactly as it does in the conversation. ── */
        <>
          <GuestHomePreview
            answers={loop.answers}
            model={loop.model}
            facts={loop.financialFacts}
            signalStates={loop.signalStates}
            activeDomain={loop.activePulseDomain}
            onSignalClick={loop.onPulseClick}
            opportunity={loop.selectedOpportunity}
            strategy={loop.selectedStrategy}
            onBack={() => { loop.returnToConversation(); setGuestPreview(false); }}
          />
          <IntelligenceDrawer
            drawerState={loop.drawerState}
            onClose={loop.closeDrawer}
            onPulseAction={handlePulseAction}
          />
        </>
      ) : loop.showContinuation ? (
        /* ── MODEL THIS LANDED HERE ────────────────────────────────────────
           Discovery opened a door; this is the room behind it. Same shell, same
           Galileo, same known facts. The conversation is still mounted beneath, so
           "Continue With Galileo" — or choosing how to carry it further — returns
           to it with nothing restarted and nothing already answered re-asked. ── */
        <ScenarioContinuation
          continuation={loop.continuation}
          phase={loop.implementationPhase}
          error={loop.implementationError}
          onRetry={loop.retryImplementation}
          onContinue={loop.returnToConversation}
          onHome={() => setGuestPreview(true)}
          onGuide={() => { loop.handleGuideChoice('guide_me'); loop.closeContinuation(); }}
          onExpert={() => { loop.handleGuideChoice('expert'); loop.closeContinuation(); }}
        />
      ) : (
        <>
          <ConversationStream
            conversation={loop.conversation}
            isThinking={loop.isThinking}
            flowState={loop.flowState}
            guestSessionId={loop.guestSessionId}
            uploadedDocs={loop.uploadedDocs}
            answers={loop.answers}
            benchmark={loop.benchmark}
            intelligence={shellModelCompleteness}
            canvasObjects={loop.canvasObjects}
            showCanvasObjects={loop.showCanvasObjects}
            onCanvasObjectClick={loop.handleCanvasObjectClick}
            onSave={loop.handleSave}
            onRespond={loop.respond}
            onConnectAction={loop.handleConnectAction}
            onDocumentUploaded={loop.onDocumentUploaded}
            onStartExtraction={loop.startExtraction}
            onCompleteLearning={loop.completeLearning}
            onOpportunityAction={loop.handleOpportunityAction}
            onChooseStrategy={loop.chooseStrategy}
            onImplementationAction={loop.handleImplementationAction}
            onGuideChoice={loop.handleGuideChoice}
            onSavePrompt={loop.handleSavePrompt}
            onImproveConfidence={loop.onImproveConfidence}
            handleConversationAction={loop.handleConversationAction}
          />

          <IntelligenceDrawer
            drawerState={loop.drawerState}
            onClose={loop.closeDrawer}
            onPulseAction={handlePulseAction}
          />
        </>
      )}
    </GalileoShell>

    {/* ── THE SINGLE WORKSPACE LAYER ────────────────────────────────────────
        Mounted only for the authenticated Vision Home. It never stacks: a
        nested transition swaps this surface's content and pushes history. ── */}
    {isHomeMode && (
      <AnimatePresence>
        {workspace.def && (
          <VisionWorkspace
            key="vision-workspace"
            def={workspace.def}
            payload={workspace.payload}
            businessName={home.business?.name}
            breadcrumb={workspace.breadcrumb}
            canGoBack={workspace.canGoBack}
            backLabel={workspace.backLabel || VISION_UNDERLAY[home.homeView] || 'Vision'}
            onBack={workspace.back}
            onClose={workspace.close}
            onOpen={workspace.open}
            onReplace={workspace.replace}
          />
        )}
      </AnimatePresence>
    )}
    </>
  );
}