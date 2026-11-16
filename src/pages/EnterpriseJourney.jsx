/**
 * Enterprise Journey Page
 * 
 * Single entry point for the Enterprise Journey™ experience.
 * Orchestrates all scenes through ExperienceManager.
 * 
 * Journey Flow:
 * INTRO → WELCOME → CREATE_BUSINESS → UPLOAD_DOCUMENTS → ASSESSMENTS → ACCOUNT_PROMOTION → DASHBOARD
 */

import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import ExperienceLayout from '@/components/experience/ExperienceLayout';
import { useExperienceManager, JOURNEY_STATES } from '@/components/experience/ExperienceManager';
import ExperienceTransition from '@/components/experience/ExperienceTransition';
import IntroExperience from '@/components/experience/IntroExperience';
import GalileoWelcome from '@/components/experience/GalileoWelcome';
import BusinessCreationScene from '@/components/experience/BusinessCreationScene';
import DocumentUploadScene from '@/components/experience/DocumentUploadScene';
import GuidedAssessmentScene from '@/components/experience/GuidedAssessmentScene';
import AccountPromotionScene from '@/components/experience/AccountPromotionScene';
import EnterpriseBlueprintBar, { JOURNEY_STATE_TO_NODE } from '@/components/experience/EnterpriseBlueprintBar';
import JourneyErrorBoundary from '@/components/experience/JourneyErrorBoundary';
import GalileoTimeline from '@/components/experience/GalileoTimeline';
import DashboardHandoff from '@/components/experience/DashboardHandoff';

export default function EnterpriseJourney() {
  const {
    currentState,
    skipToIntroComplete,
    onIntroComplete,
    onWelcomeComplete,
    onBusinessCreate,
    onDocumentUpload,
    onAssessmentsComplete,
    onPromotionComplete,
    navigateToState,
    navigateToAssessment,
    furthestAssessmentIndex,
    JOURNEY_STATES,
  } = useExperienceManager();

  // Track which blueprint nodes are completed and which is active
  const [completedNodes, setCompletedNodes] = useState([]);
  const [currentAssessmentType, setCurrentAssessmentType] = useState(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [targetAssessmentIndex, setTargetAssessmentIndex] = useState(null);

  // Handle backward navigation: click on a completed blueprint node
  const handleNodeClick = (nodeId) => {
    if (!completedNodes.includes(nodeId)) return;
    // Map node IDs to Journey states
    const NODE_TO_STATE = {
      business:    JOURNEY_STATES.CREATE_BUSINESS,
      documents:   JOURNEY_STATES.UPLOAD_DOCUMENTS,
      intelligence: JOURNEY_STATES.ACCOUNT_PROMOTION,
    };
    // Assessment node IDs map to assessment indices
    const ASSESSMENT_SEQUENCE = ['profit', 'value', 'earnings', 'tax', 'operations', 'freedom'];
    const assessIdx = ASSESSMENT_SEQUENCE.indexOf(nodeId);
    if (assessIdx >= 0) {
      setTargetAssessmentIndex(assessIdx);
      navigateToState(JOURNEY_STATES.ASSESSMENTS);
    } else if (NODE_TO_STATE[nodeId]) {
      navigateToState(NODE_TO_STATE[nodeId]);
    }
  };

  // Journey complete — hand off to Galileo, the primary owner experience.
  // JOURNEY_STATES.DASHBOARD is the terminal journey state; its destination is
  // now the Galileo surface, which resolves Magic Loop vs Galileo Home itself.
  if (currentState === JOURNEY_STATES.DASHBOARD) {
    return <Navigate to="/galileo" replace />;
  }

  // Determine active blueprint node
  const getBlueprintNode = () => {
    if (currentState === JOURNEY_STATES.ASSESSMENTS && currentAssessmentType) {
      return JOURNEY_STATE_TO_NODE[currentAssessmentType] || null;
    }
    return JOURNEY_STATE_TO_NODE[currentState] || null;
  };

  const activeNode = getBlueprintNode();

  // Show blueprint bar from CREATE_BUSINESS onward (not during intro/welcome)
  const showBlueprint = ![JOURNEY_STATES.INTRO, JOURNEY_STATES.WELCOME].includes(currentState);

  // When a state completes, mark the corresponding node done
  const markNodeComplete = (nodeId) => {
    if (nodeId && !completedNodes.includes(nodeId)) {
      setCompletedNodes((prev) => [...prev, nodeId]);
    }
  };

  const handleBusinessCreate = () => {
    markNodeComplete('business');
    onBusinessCreate();
  };

  const handleDocumentUpload = () => {
    markNodeComplete('documents');
    onDocumentUpload();
  };

  const handleAssessmentChange = (assessmentType) => {
    // Mark the previous assessment node as complete when moving to next
    if (currentAssessmentType && currentAssessmentType !== assessmentType) {
      const prevNode = JOURNEY_STATE_TO_NODE[currentAssessmentType];
      markNodeComplete(prevNode);
    }
    setCurrentAssessmentType(assessmentType);
  };

  const handleAssessmentsComplete = () => {
    if (currentAssessmentType) {
      markNodeComplete(JOURNEY_STATE_TO_NODE[currentAssessmentType]);
    }
    onAssessmentsComplete();
  };

  const handlePromotionComplete = () => {
    setShowHandoff(true);
  };

  return (
    <ExperienceLayout
      journeyState={currentState}
      assessmentKey={currentAssessmentType}
      blueprintBar={
        showBlueprint ? (
          <EnterpriseBlueprintBar
            currentNode={activeNode}
            completedNodes={completedNodes}
            onNodeClick={handleNodeClick}
          />
        ) : null
      }
    >
      <div className="relative w-full h-full">
        <AnimatePresence mode="wait">
          {/* INTRO Scene */}
          {currentState === JOURNEY_STATES.INTRO && (
            <ExperienceTransition key="intro" isActive={true}>
              <IntroExperience onComplete={onIntroComplete} onSkip={skipToIntroComplete} />
            </ExperienceTransition>
          )}

          {/* WELCOME Scene */}
          {currentState === JOURNEY_STATES.WELCOME && (
            <ExperienceTransition key="welcome" isActive={true}>
              <GalileoWelcome onBegin={onWelcomeComplete} />
            </ExperienceTransition>
          )}

          {/* CREATE_BUSINESS Scene */}
          {currentState === JOURNEY_STATES.CREATE_BUSINESS && (
            <ExperienceTransition key="create" isActive={true}>
              <BusinessCreationScene
                onNext={handleBusinessCreate}
                onSkip={() => {
                  markNodeComplete('business');
                  navigateToState(JOURNEY_STATES.UPLOAD_DOCUMENTS);
                }}
              />
            </ExperienceTransition>
          )}

          {/* UPLOAD_DOCUMENTS Scene */}
          {currentState === JOURNEY_STATES.UPLOAD_DOCUMENTS && (
            <ExperienceTransition key="upload" isActive={true}>
              <DocumentUploadScene
                onNext={handleDocumentUpload}
                onSkip={() => {
                  markNodeComplete('documents');
                  navigateToState(JOURNEY_STATES.ASSESSMENTS);
                }}
              />
            </ExperienceTransition>
          )}

          {/* ASSESSMENTS Scene */}
          {currentState === JOURNEY_STATES.ASSESSMENTS && (
            <ExperienceTransition key="assessments" isActive={true}>
              <JourneyErrorBoundary>
                <GuidedAssessmentScene
                  onComplete={handleAssessmentsComplete}
                  onAssessmentChange={handleAssessmentChange}
                  initialAssessmentIndex={targetAssessmentIndex}
                  furthestAssessmentIndex={furthestAssessmentIndex}
                  onAssessmentIndexChange={(idx) => setTargetAssessmentIndex(null)}
                />
              </JourneyErrorBoundary>
            </ExperienceTransition>
          )}

          {/* ACCOUNT_PROMOTION Scene */}
          {currentState === JOURNEY_STATES.ACCOUNT_PROMOTION && (
            <ExperienceTransition key="promotion" isActive={true}>
              <AccountPromotionScene
                onComplete={handlePromotionComplete}
                onSkip={() => navigateToState(JOURNEY_STATES.DASHBOARD)}
              />
            </ExperienceTransition>
          )}
        </AnimatePresence>

        {/* Dashboard Handoff */}
        {showHandoff && (
          <DashboardHandoff onComplete={() => navigateToState(JOURNEY_STATES.DASHBOARD)} />
        )}
      </div>
    </ExperienceLayout>
  );
}