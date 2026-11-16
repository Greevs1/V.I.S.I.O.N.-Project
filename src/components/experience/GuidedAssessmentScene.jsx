/**
 * GuidedAssessmentScene
 *
 * Manages the assessment sequence in the Enterprise Journey™.
 * Owns: sequence, CompletionBridge, guest save, transitions,
 *       IntelligencePanel, IntelligenceConfidenceMeter, ExtractionStatusCard.
 * Does NOT import assessment forms directly — delegates to JourneyAssessmentRenderer.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';
import { PREFILL_MAP } from '@/lib/assessmentPrefillMap';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import { useAssessment } from '@/lib/AssessmentContext';
import CompletionBridge from './CompletionBridge';
import JourneyAssessmentRenderer from './JourneyAssessmentRenderer';
import IntelligencePanel from './IntelligencePanel';
import IntelligenceConfidenceMeter from './IntelligenceConfidenceMeter';
import ExtractionStatusCard from './ExtractionStatusCard';

const FIRST_BUSINESS_SEQUENCE = [
  'profit_gap',
  'value_gap',
  'recast_ebitda',
  'tax_gap',
  'operations_gap',
  'freedom_assessment',
];

const MULTI_BUSINESS_SEQUENCE = [
  'profit_gap',
  'value_gap',
  'recast_ebitda',
  'operations_gap',
];

const GALILEO_CLOSINGS = {
  profit_gap:         "I already have enough to begin identifying where profit may be leaking. Let's continue.",
  value_gap:          "I've learned enough to estimate your enterprise value. Let's keep going.",
  recast_ebitda:      "Good. I can now normalize your earnings for an accurate valuation. Moving forward.",
  tax_gap:            "I've identified several areas worth exploring in your tax strategy. Let's continue.",
  operations_gap:     "I have a clear picture of your operational efficiency. One section left.",
  freedom_assessment: "Excellent. I've finished building your Enterprise Blueprint.",
};

const BRIDGE_TEXTS = {
  profit_gap:         "Building your value picture...",
  value_gap:          "Refining your earnings...",
  recast_ebitda:      "Scanning your tax strategy...",
  tax_gap:            "Mapping your operations...",
  operations_gap:     "Connecting to your goals...",
  freedom_assessment: "Finalizing your Blueprint...",
};

// Confidence categories per assessment completion
const CONFIDENCE_CATEGORIES = {
  profit_gap:         { label: 'Profitability',     status: 'confirmed' },
  value_gap:          { label: 'Enterprise Value',   status: 'confirmed' },
  recast_ebitda:      { label: 'Earnings',           status: 'confirmed' },
  tax_gap:            { label: 'Tax Position',       status: 'confirmed' },
  operations_gap:     { label: 'Operations',         status: 'confirmed' },
  freedom_assessment: { label: 'Freedom Model',      status: 'confirmed' },
};

const DEFAULT_CATEGORIES = [
  { label: 'Revenue',           status: 'needs_validation' },
  { label: 'Profitability',     status: 'needs_validation' },
  { label: 'Enterprise Value',  status: 'needs_validation' },
  { label: 'Tax Position',      status: 'needs_validation' },
  { label: 'Operations',        status: 'needs_validation' },
  { label: 'Freedom Model',     status: 'needs_validation' },
];

function scrollContainerToTop() {
  requestAnimationFrame(() => {
    // Walk up from document.body to find the ExperienceLayout scroll container
    const el = document.querySelector('[data-journey-scroll]');
    if (el) { el.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    // Fallback: find first overflow-y-auto element
    const all = document.querySelectorAll('*');
    for (const node of all) {
      const ov = window.getComputedStyle(node).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && node !== document.body) {
        node.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

export default function GuidedAssessmentScene({ onComplete, onAssessmentChange, initialAssessmentIndex = null, furthestAssessmentIndex = 0, onAssessmentIndexChange }) {
  const [currentAssessmentIndex, setCurrentAssessmentIndex] = useState(() => {
    // Use initialAssessmentIndex if provided (backward navigation), else 0
    return initialAssessmentIndex != null ? initialAssessmentIndex : 0;
  });
  // Initialize answers from sessionStorage so they survive remounts (backward/forward navigation)
  const [assessmentAnswers, setAssessmentAnswers] = useState(() => {
    try {
      const saved = sessionStorage.getItem('vision_journey_assessments');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [sequence, setSequence] = useState(FIRST_BUSINESS_SEQUENCE);
  const [showBridge, setShowBridge] = useState(false);
  const [bridgeData, setBridgeData] = useState(null);

  // Assessment Context — use the SAME certified save pipeline as normal assessment pages
  const { state: assessmentState, saveAssessmentToDB } = useAssessment();

  // Prefill suggestions for current assessment
  const [suggestions, setSuggestions] = useState({});
  const [prefillLoading, setPrefillLoading] = useState(false);

  // Intelligence meter state
  const [confidenceScore, setConfidenceScore] = useState(15);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [completedAssessments, setCompletedAssessments] = useState([]);

  // Determine sequence from guest session
  useEffect(() => {
    const determineSequence = async () => {
      const guestSessionId = getGuestSessionId();
      try {
        const res = await base44.functions.invoke('guestSessionService', {
          action: 'getGuestSession',
          data: { guest_session_id: guestSessionId },
        });
        const businesses = res.data?.session?.business_snapshot?.businesses || [];
        setSequence(businesses.length >= 2 ? MULTI_BUSINESS_SEQUENCE : FIRST_BUSINESS_SEQUENCE);
      } catch {
        // keep default
      }
    };
    determineSequence();
  }, []);

  // Initialize completed assessments from sessionStorage (survive remounts)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('vision_journey_assessments');
      if (saved) {
        const parsed = JSON.parse(saved);
        const completed = Object.keys(parsed);
        setCompletedAssessments(completed);
        setConfidenceScore(Math.min(95, 15 + completed.length * Math.floor(80 / sequence.length)));
        setCategories(prev => prev.map(cat => {
          for (const key of completed) {
            const match = CONFIDENCE_CATEGORIES[key];
            if (match && cat.label === match.label) return { ...cat, status: 'confirmed' };
          }
          return cat;
        }));
      }
    } catch {}
  }, [sequence.length]);

  // Report index changes to parent (for backward navigation tracking)
  useEffect(() => {
    onAssessmentIndexChange?.(currentAssessmentIndex);
  }, [currentAssessmentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle backward navigation: when parent provides a new initialAssessmentIndex
  // (e.g., clicking on a completed assessment node in the BlueprintBar)
  useEffect(() => {
    if (initialAssessmentIndex != null && initialAssessmentIndex !== currentAssessmentIndex) {
      setCurrentAssessmentIndex(initialAssessmentIndex);
    }
  }, [initialAssessmentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentAssessmentKey = sequence[currentAssessmentIndex];
  const isLastAssessment = currentAssessmentIndex === sequence.length - 1;

  // Load prefill suggestions whenever assessment changes
  useEffect(() => {
    onAssessmentChange?.(currentAssessmentKey);
    loadPrefillSuggestions(currentAssessmentKey);
  }, [currentAssessmentIndex, currentAssessmentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPrefillSuggestions = async (assessmentKey) => {
    const relevantFields = PREFILL_MAP.filter(f => f.assessment_key === assessmentKey);
    if (!relevantFields.length) return;

    setPrefillLoading(true);
    try {
      const guestSessionId = getGuestSessionId();
      const res = await base44.functions.invoke('guestSessionService', {
        action: 'getGuestSession',
        data: { guest_session_id: guestSessionId },
      });
      const snapshot = res.data?.session?.state_snapshot || {};
      const extractedFields = { ...snapshot, ...(snapshot.extracted_fields || {}) };

      // Calculate derived margin
      if (!extractedFields.net_profit_margin && extractedFields.total_revenue > 0) {
        const ni = extractedFields.net_income || extractedFields.ordinary_business_income;
        if (ni) {
          extractedFields.__calculated_margin = parseFloat(((ni / extractedFields.total_revenue) * 100).toFixed(1));
        }
      }

      // Build suggestions
      const result = {};
      const seen = new Set();
      for (const mapping of relevantFields) {
        if (seen.has(mapping.field_key)) continue;
        for (const key of mapping.extracted_keys) {
          const raw = extractedFields[key];
          if (raw == null || raw === '' || raw === 0) continue;
          try {
            const transformed = mapping.transform ? mapping.transform(raw) : raw;
            if (transformed == null) continue;
            result[mapping.field_key] = {
              value: transformed,
              source_label: mapping.source_label,
              label: mapping.label,
            };
            seen.add(mapping.field_key);
            break;
          } catch { /* skip */ }
        }
      }

      setSuggestions(result);
    } catch {
      setSuggestions({});
    } finally {
      setPrefillLoading(false);
    }
  };

  const handleAssessmentComplete = async (answers, results) => {
    const guestSessionId = getGuestSessionId();
    const updatedAnswers = {
      ...assessmentAnswers,
      [currentAssessmentKey]: {
        answers,
        results,
        completed_at: new Date().toISOString(),
      },
    };
    setAssessmentAnswers(updatedAnswers);

    // Update confidence meter (avoid duplicates for backward navigation)
    const newCompleted = completedAssessments.includes(currentAssessmentKey)
      ? completedAssessments
      : [...completedAssessments, currentAssessmentKey];
    setCompletedAssessments(newCompleted);
    const newScore = Math.min(95, 15 + newCompleted.length * Math.floor(80 / sequence.length));
    setConfidenceScore(newScore);
    setCategories(prev => prev.map(cat => {
      const match = CONFIDENCE_CATEGORIES[currentAssessmentKey];
      if (match && cat.label === match.label) return { ...cat, status: 'confirmed' };
      return cat;
    }));

    // Record into Intelligence Graph for provenance tracking (Phase 3)
    recordAssessmentCompletion(currentAssessmentKey, answers, results, SOURCE_TYPES.JOURNEY_ANSWER);

    // Also persist to sessionStorage so JourneySignup can write Base44 Assessment entities after promotion
    try {
      sessionStorage.setItem('vision_journey_assessments', JSON.stringify(updatedAnswers));
    } catch (_) {}

    // Guest save — fire-and-forget
    base44.functions.invoke('guestSessionService', {
      action: 'updateGuestSession',
      data: {
        guest_session_id: guestSessionId,
        updates: { assessment_answers: updatedAnswers },
      },
    }).catch((err) => {
      console.error('[GuidedAssessmentScene] Guest save failed:', err);
    });

    // Authoritative save — if user is authenticated, use the SAME certified
    // saveAssessmentToDB pipeline as normal assessment pages. This ensures
    // Journey vs normal page parity: both write to Base44 Assessment entity +
    // Supabase (assessment_sessions, business_assessments, dashboard_metrics,
    // profile_financials) with the FULL AssessmentContext state, then trigger
    // BIS recalculation. No divergent pipeline.
    base44.auth.isAuthenticated().then((authed) => {
      if (!authed) return;
      // saveAssessmentToDB handles retry, partial-failure detection, and user-facing
      // toast notifications internally. It never throws. Answers are preserved in
      // sessionStorage regardless of persistence outcome.
      saveAssessmentToDB(currentAssessmentKey, answers, results).catch(() => {
        // Safety net — saveAssessmentToDB catches all errors internally
      });
    }).catch(() => { /* not authenticated — guest flow */ });

    setBridgeData({
      closingMessage: GALILEO_CLOSINGS[currentAssessmentKey],
      bridgeText: !isLastAssessment ? BRIDGE_TEXTS[currentAssessmentKey] : null,
      isLast: isLastAssessment,
    });
    setShowBridge(true);
  };

  // Scroll to top whenever the active assessment card changes
  useEffect(() => {
    scrollContainerToTop();
  }, [currentAssessmentIndex, showBridge]);

  const handleBridgeComplete = () => {
    setShowBridge(false);
    setBridgeData(null);
    if (bridgeData?.isLast) {
      onComplete?.();
    } else {
      setCurrentAssessmentIndex((prev) => prev + 1);
    }
  };

  const foundCount = Object.keys(suggestions).length;

  return (
    <div className="w-full flex flex-col">
      {/* Intelligence Confidence Meter — sticky top */}
      <IntelligenceConfidenceMeter
        score={confidenceScore}
        categories={categories}
      />

      {/* Scrollable assessment content */}
      <div className="flex-1 flex flex-col items-center justify-start">
        <AnimatePresence mode="wait">
          {showBridge ? (
            <CompletionBridge
              key="bridge"
              closingMessage={bridgeData?.closingMessage}
              bridgeText={bridgeData?.bridgeText}
              onComplete={handleBridgeComplete}
              duration={bridgeData?.isLast ? 9800 : 9200}
            />
          ) : (
            <motion.div
              key={`assessment-${currentAssessmentIndex}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-4xl space-y-4 pt-4"
            >
              {/* Extraction status + Intelligence panel — always visible, no flash on step change */}
              <ExtractionStatusCard loading={prefillLoading} found={foundCount} />
              <IntelligencePanel
                assessmentKey={currentAssessmentKey}
                suggestions={suggestions}
                loading={prefillLoading}
              />

              {/* Assessment core */}
              <JourneyAssessmentRenderer
                assessmentKey={currentAssessmentKey}
                onComplete={handleAssessmentComplete}
                suggestions={suggestions}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}