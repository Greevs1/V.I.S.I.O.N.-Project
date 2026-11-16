/**
 * JourneyAssessmentRenderer
 *
 * Owns only the mapping from assessmentKey → real assessment core component.
 * Uses a switch statement (not a const object map) to avoid any
 * "cannot access before initialization" TDZ issues with minified variables.
 *
 * All assessment cores receive mode="journey" and an onComplete callback.
 * No DB writes, no navigate() calls happen in journey mode.
 */

import React from 'react';
import ProfitGapAssessmentCore from '@/components/assessments/ProfitGapAssessmentCore';
import ValueGapAssessmentCore from '@/components/assessments/ValueGapAssessmentCore';
import RecastEbitdaAssessmentCore from '@/components/assessments/RecastEbitdaAssessmentCore';
import TaxGapAssessmentCore from '@/components/assessments/TaxGapAssessmentCore';
import OperationsGapAssessmentCore from '@/components/assessments/OperationsGapAssessmentCore';
import FreedomAssessmentCore from '@/components/assessments/FreedomAssessmentCore';

export default function JourneyAssessmentRenderer({ assessmentKey, onComplete, suggestions = {} }) {
  switch (assessmentKey) {
    case 'profit_gap':
      return <ProfitGapAssessmentCore mode="journey" onComplete={onComplete} prefillSuggestions={suggestions} />;
    case 'value_gap':
      return <ValueGapAssessmentCore mode="journey" onComplete={onComplete} prefillSuggestions={suggestions} />;
    case 'recast_ebitda':
      return <RecastEbitdaAssessmentCore mode="journey" onComplete={onComplete} prefillSuggestions={suggestions} />;
    case 'tax_gap':
      return <TaxGapAssessmentCore mode="journey" onComplete={onComplete} prefillSuggestions={suggestions} />;
    case 'operations_gap':
      return <OperationsGapAssessmentCore mode="journey" onComplete={onComplete} prefillSuggestions={suggestions} />;
    case 'freedom_assessment':
      return <FreedomAssessmentCore mode="journey" onComplete={onComplete} prefillSuggestions={suggestions} />;
    default:
      console.warn('[JourneyAssessmentRenderer] Unknown assessment key:', assessmentKey);
      return (
        <div className="w-full text-center py-16 space-y-3">
          <p className="text-white/60 text-sm">
            I need a moment to load this section. Please refresh or continue.
          </p>
          <p className="text-white/25 text-xs font-mono">{assessmentKey}</p>
        </div>
      );
  }
}