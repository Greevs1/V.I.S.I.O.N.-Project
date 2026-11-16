/**
 * Experience Manager Hook
 * 
 * Centralized state management for the Enterprise Journey™.
 * Uses React state + localStorage for persistence.
 * No external dependencies.
 * 
 * Journey States:
 * - INTRO: Video introduction
 * - WELCOME: Galileo welcome message
 * - CREATE_BUSINESS: Business creation (placeholder)
 * - UPLOAD_DOCUMENTS: Document upload (placeholder)
 * - ASSESSMENTS: Guided assessments (placeholder)
 * - ACCOUNT_PROMOTION: Account creation/login (placeholder)
 * - GENERATING: Generating intelligence (placeholder)
 * - DASHBOARD: Enter IQ Dashboard (redirect)
 */

import { useState, useEffect, useCallback } from 'react';
import { getGuestSessionId, hasGuestSession } from '@/lib/anonymousSession';

const JOURNEY_STATE_KEY = 'vision_enterprise_journey_state';
const INTRO_COMPLETED_KEY = 'vision_intro_completed';
const FURTHEST_STATE_KEY = 'vision_enterprise_journey_furthest_state';
const FURTHEST_ASSESSMENT_INDEX_KEY = 'vision_enterprise_journey_furthest_assessment_idx';

const JOURNEY_STATES = {
  INTRO: 'INTRO',
  WELCOME: 'WELCOME',
  CREATE_BUSINESS: 'CREATE_BUSINESS',
  UPLOAD_DOCUMENTS: 'UPLOAD_DOCUMENTS',
  ASSESSMENTS: 'ASSESSMENTS',
  ACCOUNT_PROMOTION: 'ACCOUNT_PROMOTION',
  GENERATING: 'GENERATING',
  DASHBOARD: 'DASHBOARD',
};

const loadJourneyState = () => {
  if (typeof window === 'undefined') {
    return JOURNEY_STATES.INTRO;
  }
  
  // Check if intro was already completed on previous visit
  const introCompleted = localStorage.getItem(INTRO_COMPLETED_KEY) === 'true';
  if (introCompleted) {
    return JOURNEY_STATES.WELCOME;
  }
  
  const saved = localStorage.getItem(JOURNEY_STATE_KEY);
  if (saved && Object.values(JOURNEY_STATES).includes(saved)) {
    return saved;
  }
  return JOURNEY_STATES.INTRO;
};

const saveJourneyState = (state) => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(JOURNEY_STATE_KEY, state);
};

const markIntroCompleted = () => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(INTRO_COMPLETED_KEY, 'true');
};

export function useExperienceManager() {
  const [currentState, setCurrentState] = useState(() => loadJourneyState());
  const [guestSessionId, setGuestSessionId] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Track furthest reached state + assessment index for backward navigation
  const [furthestState, setFurthestState] = useState(() => {
    try { return localStorage.getItem(FURTHEST_STATE_KEY) || null; } catch { return null; }
  });
  const [furthestAssessmentIndex, setFurthestAssessmentIndex] = useState(() => {
    try {
      const v = localStorage.getItem(FURTHEST_ASSESSMENT_INDEX_KEY);
      return v ? parseInt(v, 10) : 0;
    } catch { return 0; }
  });

  // Initialize guest session on mount
  useEffect(() => {
    const sessionId = getGuestSessionId();
    setGuestSessionId(sessionId);
  }, []);

  // Journey state order for furthest-state tracking
  const STATE_ORDER = [
    JOURNEY_STATES.INTRO,
    JOURNEY_STATES.WELCOME,
    JOURNEY_STATES.CREATE_BUSINESS,
    JOURNEY_STATES.UPLOAD_DOCUMENTS,
    JOURNEY_STATES.ASSESSMENTS,
    JOURNEY_STATES.ACCOUNT_PROMOTION,
    JOURNEY_STATES.DASHBOARD,
  ];

  const navigateToState = useCallback((nextState) => {
    setIsTransitioning(true);

    // Track furthest reached state for backward navigation
    setFurthestState(prev => {
      const prevIdx = prev ? STATE_ORDER.indexOf(prev) : -1;
      const nextIdx = STATE_ORDER.indexOf(nextState);
      const furthest = nextIdx > prevIdx ? nextState : prev;
      try { localStorage.setItem(FURTHEST_STATE_KEY, furthest); } catch {}
      return furthest;
    });

    // Allow transition animation to complete
    setTimeout(() => {
      setCurrentState(nextState);
      saveJourneyState(nextState);
      setIsTransitioning(false);
    }, 600);
  }, []);

  const navigateToAssessment = useCallback((index) => {
    // Navigate to ASSESSMENTS state at a specific assessment index
    setFurthestAssessmentIndex(prev => Math.max(prev, index));
    try { localStorage.setItem(FURTHEST_ASSESSMENT_INDEX_KEY, String(Math.max(furthestAssessmentIndex, index))); } catch {}
    navigateToState(JOURNEY_STATES.ASSESSMENTS);
  }, [navigateToState, furthestAssessmentIndex]);

  const resetJourney = useCallback(() => {
    navigateToState(JOURNEY_STATES.INTRO);
  }, [navigateToState]);

  const skipToIntroComplete = useCallback(() => {
    markIntroCompleted();
    navigateToState(JOURNEY_STATES.WELCOME);
  }, [navigateToState]);

  const onIntroComplete = useCallback(() => {
    markIntroCompleted();
    navigateToState(JOURNEY_STATES.WELCOME);
  }, [navigateToState]);

  const onWelcomeComplete = useCallback(() => {
    // Ensure guest session exists before proceeding
    if (!guestSessionId) {
      const sessionId = getGuestSessionId();
      setGuestSessionId(sessionId);
    }
    navigateToState(JOURNEY_STATES.CREATE_BUSINESS);
  }, [guestSessionId, navigateToState]);

  const onBusinessCreate = useCallback(() => {
    navigateToState(JOURNEY_STATES.UPLOAD_DOCUMENTS);
  }, [navigateToState]);

  const onDocumentUpload = useCallback(() => {
    navigateToState(JOURNEY_STATES.ASSESSMENTS);
  }, [navigateToState]);

  const onAssessmentsComplete = useCallback(() => {
    navigateToState(JOURNEY_STATES.ACCOUNT_PROMOTION);
  }, [navigateToState]);

  const onPromotionComplete = useCallback(() => {
    navigateToState(JOURNEY_STATES.DASHBOARD);
  }, [navigateToState]);

  return {
    currentState,
    isTransitioning,
    guestSessionId,
    furthestState,
    furthestAssessmentIndex,
    navigateToState,
    navigateToAssessment,
    resetJourney,
    skipToIntroComplete,
    onIntroComplete,
    onWelcomeComplete,
    onBusinessCreate,
    onDocumentUpload,
    onAssessmentsComplete,
    onPromotionComplete,
    JOURNEY_STATES,
  };
}

export { JOURNEY_STATES };