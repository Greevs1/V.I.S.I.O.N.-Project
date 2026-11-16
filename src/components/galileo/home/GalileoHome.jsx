/**
 * GalileoHome — the Vision operating surface for returning users.
 *
 * COMPOSITION ONLY. Every value rendered comes from the existing intelligence
 * layer via `useGalileoHome`, and every interaction is routed through ONE hook,
 * `useVisionActions`, so each control's behaviour lives in a single place
 * (contract: src/VISION_INTERACTION_CONTRACT.md).
 *
 * THE LOOP
 *   understand → discover → explore → model → decide → see the plan →
 *   choose how to implement → execute → return
 *
 * Views (one at a time, in place — no route change):
 *   home · domain · whatif · guide · opportunity · implementation ·
 *   playbook · connections · saved · expert
 * Workspaces (Dashboard, Sprint, Data Room, Valuation…) open OVER this surface,
 * so closing one returns the owner to exactly the view they left.
 */

import React, { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ClipboardList, Link2, Users, FileText } from 'lucide-react';

import HomeHero from './HomeHero';
import VisitSummary from './VisitSummary';
import NextBestMove from './NextBestMove';
import HomeBusinessPulse from './HomeBusinessPulse';
import AskGalileoBar from './AskGalileoBar';
import DomainFocus from './DomainFocus';
import PlaybookSurface from './PlaybookSurface';
import HomeGoalBadge from './HomeGoalBadge';
import HomeConnectionsSheet from './HomeConnectionsSheet';
import HomeSavedSheet from './HomeSavedSheet';
import HomeExpertSheet from './HomeExpertSheet';
import WhatIfSurface from './WhatIfSurface';
import WhatIfNextActions from './WhatIfNextActions';
import GuideSession from './GuideSession';
import OpportunityFocus from './OpportunityFocus';
import ImplementationPreview from './ImplementationPreview';
import ImplementationChoice from './ImplementationChoice';
import HomeWorkGrid from './HomeWorkGrid';
import HomeNowItem from './HomeNowItem';
import PulseLens from './PulseLens';
import UtilityDock from '@/components/galileo/shell/UtilityDock';

import { getDomainCommands, getAskSuggestions } from '@/lib/galileo/homeCommandBar';
import { scenarioForOpportunity } from '@/lib/galileo/implementationAccess';
import { buildConnectionsList } from '@/lib/galileo/connectionsList';
import { useVisionActions } from '@/hooks/useVisionActions';

function View({ id, children, className }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function GalileoHome({ home, firstName, playbookStage, openPlaybook, onOpenWorkspace, onReportScroll }) {
  const a = useVisionActions({ home, openPlaybook, onOpenWorkspace });
  const { galileo } = a;
  const view = home.homeView;
  const isHomeView = view === 'home';
  const isDomainView = view === 'domain';

  const documents = home.businessModel?.evidence?.documents || [];
  const recentChanges = home.businessModel?.recentChanges || [];
  const isLensActive = !!home.lens;

  const handleScroll = useCallback((e) => onReportScroll?.(e.currentTarget.scrollTop > 4), [onReportScroll]);

  const suggestions = useMemo(() => {
    // A focused lens IS a domain context: the command bar offers exactly the
    // same real, domain-specific actions it offers in the full domain view.
    if (isDomainView || isLensActive) return getDomainCommands(home.activeDomain) || [];
    return getAskSuggestions({
      hasFinancials: home.businessModel?.hasFinancials,
      hasOpportunities: home.opportunities.length > 0,
      hasActiveSprints: home.sprints.length > 0,
      hasRecentDocument: documents.length > 0,
      signalStates: home.signalStates,
    });
  }, [isDomainView, isLensActive, home.activeDomain, home.businessModel, home.opportunities, home.sprints, home.signalStates, documents.length]);

  const dockItems = useMemo(
    () => [
      { key: 'chat', icon: MessageSquare, label: 'Chat', onSelect: () => a.askInContext(null) },
      { key: 'playbook', icon: ClipboardList, label: 'Playbook', badge: home.playbookSummary?.active || null, onSelect: a.openPlaybookAll },
      // DATA ROOM is the product name for the owner's document/evidence
      // repository. Contextual actions reach it in the right mode, and this is
      // the owner's intentional entry — it opens the Galileo overlay, never a
      // separate legacy application.
      { key: 'documents', icon: FileText, label: 'Data Room', badge: documents.length || null, onSelect: a.openDocuments },
      { key: 'connections', icon: Link2, label: 'Connections', badge: home.businessModel?.hasFinancials ? '✓' : null, onSelect: () => home.setHomeView('connections') },
      { key: 'expert', icon: Users, label: 'Expert', onSelect: a.openExpert },
    ],
    [a, home, documents]
  );

  const dockActiveKey =
    view === 'playbook' || view === 'saved' || view === 'opportunity'
      ? 'playbook'
      : view === 'connections'
        ? 'connections'
        : view === 'expert'
          ? 'expert'
          : 'chat';

  const connections = useMemo(() => buildConnectionsList(home), [home]);

  const askBar = (
    <AskGalileoBar
      suggestions={suggestions}
      onAsk={a.handleAsk}
      onCommand={a.handleCommand}
      loading={galileo.loading}
      answer={galileo.answer}
      error={galileo.error}
      onDismissAnswer={galileo.dismiss}
      onRetry={galileo.retry}
      inputRef={a.askInputRef}
      nextStep={a.nextStep}
      onRunNextStep={a.runNextStep}
      onRunSecondaryStep={a.runSecondaryStep}
      onGuide={a.startGuide}
      onTeam={a.openTeam}
      access={a.access}
    />
  );

  return (
    <div className="relative flex-1 overflow-y-auto min-h-0" onScroll={handleScroll}>
      {/* Top padding clears the overlay header: at rest the surface begins where
          it always did, and on scroll the content passes beneath the glass. */}
      <div className="mx-auto w-full max-w-[1360px] px-4 pb-32 pt-20 md:px-8 md:pt-24">
        <AnimatePresence mode="wait">
          {isHomeView && (
            <View id="home" className="space-y-9 md:space-y-11">
              <HomeHero firstName={firstName} businessName={home.business?.name} />

              {/* The focused Pulse lens unfolds HERE — one Galileo surface, the
                  Pulse still visible as navigation beneath it. */}
              {isLensActive && (
                <PulseLens
                  lens={home.lens}
                  onClose={home.handleLensClose}
                  onAsk={a.askInContext}
                  onCommand={a.handleCommand}
                  onOpenOpportunity={(id) => a.openOpportunityById(id, 'home')}
                  onUpload={a.openUpload}
                  onSprint={a.openSprint}
                  onTeam={a.openExpert}
                  onGalileo={a.startGuide}
                  access={a.access}
                  onDomainDetail={home.openDomainDetail}
                />
              )}

              <div className="flex flex-wrap items-center gap-3">
                <VisitSummary
                  insightCount={recentChanges.length}
                  actionCount={home.activitySummary?.count || 0}
                  onReview={a.openPlaybookAll}
                />
                {home.goalBadge && <HomeGoalBadge goalBadge={home.goalBadge} />}
              </div>

              {home.nowItem && home.nowItem.type !== 'recent_change' && (
                <HomeNowItem
                  item={home.nowItem}
                  onAct={() => {
                    if (home.nowItem.actionValue === 'investigate') a.openPlaybookAll();
                  }}
                />
              )}

              <NextBestMove
                move={home.nextBestMove?.primary}
                showWhy={home.showWhyThis}
                onAction={a.handleMoveAction}
                onWhyThis={home.handleWhyThis}
                onShowAlternative={home.handleShowAlternative}
                onDismiss={home.dismissNextAction}
                whyExplanation={home.explainWhyThis()}
                alternatives={home.nextBestMove?.alternatives || []}
                orbState={home.nextActionOrbState}
                intelligence={home.businessModel?.modelCompleteness || 0}
                sprints={home.sprints}
                opportunities={home.opportunities}
                documents={documents}
              />

              <div ref={a.askSectionRef}>{askBar}</div>

              <HomeBusinessPulse
                model={home.businessModel}
                signalStates={home.signalStates}
                onSignalClick={home.handleDomainClick}
                activeDomain={home.activeDomain}
                onViewDetails={() => onOpenWorkspace?.('dashboard')}
              />

              <HomeWorkGrid
                sprints={home.sprints}
                opportunities={home.opportunities}
                activities={home.recentActivities}
                onOpenSprint={a.openSprint}
                onOpenOpportunities={a.openPlaybookAll}
                onOpenActivity={a.openActivity}
              />
            </View>
          )}

          {isDomainView && (
            <View id="domain">
              <DomainFocus
                focus={home.domainFocus}
                onBack={home.handleDomainClose}
                onCommand={a.handleCommand}
                onOpenObject={(obj) => a.openOpportunityById(obj.id, 'domain')}
              />
            </View>
          )}

          {view === 'whatif' && (
            <View id="whatif" className="space-y-7">
              <WhatIfSurface
                whatIf={a.whatIf}
                onBack={() => home.setHomeView('home')}
                onOpenWorkspace={onOpenWorkspace}
                onAskGalileo={(q) => a.askInContext(q || null)}
              />
              {a.scenario && (
                <div className="mx-auto w-full max-w-[760px] space-y-5">
                  <WhatIfNextActions
                    key={`${a.scenario.scenario_key}-${a.scenario.earnings_delta ?? ''}`}
                    scenario={a.scenario}
                    asks={a.scenarioActions.asks}
                    collectedInputs={a.whatIf.collectedInputs}
                    onSeePlan={a.scenarioActions.seePlan}
                    onAdjust={a.whatIf.adjust}
                    onAskGalileo={a.scenarioActions.ask}
                    onSave={a.scenarioActions.save}
                  />
                  <ImplementationChoice
                    access={a.access}
                    onGalileo={a.scenarioActions.guide}
                    onTeam={a.scenarioActions.team}
                    hideLocked
                  />
                </div>
              )}
            </View>
          )}

          {view === 'guide' && (
            <View id="guide">
              <GuideSession
                context={a.guideContext}
                destination={a.guideDestination}
                onAsk={a.askInContext}
                onOpenDestination={a.runGuideDestination}
                onOpenPlaybook={a.openPlaybookAll}
                onBack={() => home.setHomeView('home')}
              />
            </View>
          )}

          {view === 'opportunity' && (
            <View id="opportunity">
              <OpportunityFocus
                opportunity={a.opportunity.focused}
                access={a.access}
                scenario={scenarioForOpportunity(a.opportunity.focused)}
                onBack={a.opportunity.back}
                onAskGalileo={a.askInContext}
                onSeePlan={a.opportunity.seePlan}
                onWhatIf={a.opportunity.whatIf}
                onGalileo={a.opportunity.guide}
                onTeam={a.opportunity.team}
              />
            </View>
          )}

          {view === 'implementation' && (
            <View id="implementation">
              <ImplementationPreview
                context={a.previewContext}
                plan={a.plan.plan}
                access={a.planAccess}
                onRetry={a.plan.retry}
                onBack={() => home.setHomeView(a.previewContext?.returnView || 'home')}
                onGalileo={a.previewGalileo}
                onTeam={a.previewTeam}
                building={a.plan.building}
                buildError={a.plan.buildError}
              />
            </View>
          )}

          {view === 'playbook' && (
            <View id="playbook">
              <PlaybookSurface
                key={`playbook-${playbookStage || 'all'}`}
                playbook={home.playbook}
                initialStage={playbookStage}
                onBack={() => home.setHomeView('home')}
                onItemAction={a.handlePlaybookItem}
                onAskGalileo={() => a.askInContext('What should I focus on first?')}
                onTryWhatIf={a.openWhatIf}
                onAddFinancials={() => a.openUpload()}
              />
            </View>
          )}

          {view === 'connections' && (
            <View id="connections">
              <HomeConnectionsSheet
                connections={connections}
                onBack={() => home.setHomeView('home')}
                onAddFinancials={() => a.openUpload()}
              />
            </View>
          )}

          {view === 'saved' && (
            <View id="saved">
              <HomeSavedSheet
                savedItems={home.savedItems}
                onBack={() => home.setHomeView('home')}
                onItemClick={a.openSavedItem}
              />
            </View>
          )}

          {view === 'expert' && (
            <View id="expert">
              <HomeExpertSheet
                context={a.handoffContext}
                advisor={a.advisor}
                onBack={() => home.setHomeView('home')}
                onOpenExpertNetwork={() => onOpenWorkspace?.('expert-network')}
              />
            </View>
          )}
        </AnimatePresence>
      </div>

      {/* The command bar, carried into the domain view. */}
      {isDomainView && <div className="mx-auto w-full max-w-[1360px] px-4 pb-32 md:px-8">{askBar}</div>}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-5 md:px-8">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[1360px] justify-center">
          <UtilityDock items={dockItems} activeKey={dockActiveKey} />
        </div>
      </div>
    </div>
  );
}