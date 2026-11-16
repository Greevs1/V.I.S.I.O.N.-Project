/**
 * Business Intelligence Engine — Public API
 *
 * This is the public interface for the BIE.
 * All platform systems should import from here.
 *
 * Architecture:
 *
 *   Business Intelligence Engine (BIE)
 *   ↓
 *   Business Intelligence State (BIS) — projection
 *   ↓
 *   Dashboard / Executive Briefing / Scenario Builder / Sprints / Advisor / Galileo
 */

// Engine
export { buildBusinessIntelligenceEngine, markBriefingShown } from './engine';

// Metric types
export { createMetric, withRecommendation, withSprintReadiness, confidenceLabel, CONFIDENCE_LEVELS, METRIC_CATEGORIES, METRIC_STATUS } from './metricTypes';

// Graph
export { default as IntelligenceGraph } from './graph';

// Health
export { default as calculateBusinessIntelligenceHealth } from './health';

// Snapshots
export { getLatestSnapshot, getChangedMetricIdsSince, getSnapshotsSince, hydrateSnapshotsFromBackend } from './snapshots';

// Journal
export { loadJournal, getJournalSince, getJournalForMetric, JOURNAL_EVENT_TYPES, hydrateJournalFromBackend } from './journal';

// Galileo summaries
export { generateGalileoSummary } from './galileoSummaries';

// Hydration (convenience)
export { hydrateBieFromBackend } from './engine';