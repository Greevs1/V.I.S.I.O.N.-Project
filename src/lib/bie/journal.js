/**
 * Business Intelligence Journal
 *
 * Every important event in the Business Intelligence Engine creates an entry.
 * Entries store:
 *   - Event type (metric_updated, value_increased, scenario_saved, etc.)
 *   - Old value
 *   - New value
 *   - Affected metrics
 *   - Galileo summary (deterministic, from galileoSummaries.js)
 *   - Triggered by (assessment, document, scenario, advisor, sprint, system)
 *   - Timestamp
 *
 * Storage: localStorage (synchronous, immediate) + Supabase (persistence, cross-device).
 */

import { base44 } from '@/api/base44Client';
import { generateGalileoSummary } from './galileoSummaries';

const STORAGE_PREFIX = 'vision_bie_journal_';
const MAX_ENTRIES = 100;

// Track whether backend persistence is available
let backendAvailable = true;

export const JOURNAL_EVENT_TYPES = {
  METRIC_UPDATED:       'metric_updated',
  VALUE_INCREASED:      'value_increased',
  VALUE_DECREASED:      'value_decreased',
  METRIC_APPEARED:      'metric_appeared',
  METRIC_DISAPPEARED:   'metric_disappeared',
  SCENARIO_SAVED:      'scenario_saved',
  DOCUMENTS_ACCEPTED:  'documents_accepted',
  ADVISOR_VALIDATED:   'advisor_validated',
  SPRINT_COMPLETED:    'sprint_completed',
  ASSESSMENT_COMPLETED:'assessment_completed',
  SNAPSHOT_CREATED:    'snapshot_created',
  ENGINE_REBUILT:      'engine_rebuilt',
};

/**
 * Load journal entries for a business.
 */
export function loadJournal(businessId) {
  if (!businessId) return [];
  try {
    const key = STORAGE_PREFIX + businessId;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save journal entries (trims to MAX_ENTRIES).
 */
export function saveJournal(businessId, entries) {
  if (!businessId) return;
  try {
    const key = STORAGE_PREFIX + businessId;
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* non-fatal */ }
}

/**
 * Create a journal entry with a deterministic Galileo summary.
 */
export function createJournalEntry({ eventType, metricId = null, oldValue = null, newValue = null, affectedMetrics = [], galileoSummary = null, triggeredBy = 'system', metadata = {} }) {
  const entry = {
    id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    metricId,
    oldValue,
    newValue,
    affectedMetrics: affectedMetrics || [],
    galileoSummary: galileoSummary, // will be generated below if null
    triggeredBy,
    metadata,
    timestamp: new Date().toISOString(),
  };
  // Generate deterministic Galileo summary if not provided
  if (!entry.galileoSummary) {
    entry.galileoSummary = generateGalileoSummary(entry);
  }
  return entry;
}

/**
 * Append a journal entry to localStorage and fire-and-forget sync to Supabase.
 */
export function appendJournalEntry(businessId, entry, profileId = null) {
  const entries = loadJournal(businessId);
  entries.push(entry);
  saveJournal(businessId, entries);

  // Background sync to Supabase (fire-and-forget, non-blocking)
  if (backendAvailable && businessId && profileId) {
    syncJournalEntryToBackend(businessId, entry, profileId).catch(() => {});
  }
  return entry;
}

/**
 * Sync a single journal entry to Supabase.
 */
async function syncJournalEntryToBackend(businessId, entry, profileId) {
  try {
    const res = await base44.functions.invoke('biePersistence', {
      action: 'saveJournalEntry',
      data: {
        businessId,
        profileId,
        id: entry.id,
        eventType: entry.eventType,
        metricId: entry.metricId,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        affectedMetrics: entry.affectedMetrics,
        triggeredBy: entry.triggeredBy,
        galileoSummary: entry.galileoSummary,
        metadata: entry.metadata,
        timestamp: entry.timestamp,
      },
    });
    if (res?.data?.tableMissing) backendAvailable = false;
  } catch { /* non-fatal */ }
}

/**
 * Hydrate localStorage from Supabase for a business.
 */
export async function hydrateJournalFromBackend(businessId, profileId) {
  if (!businessId || !profileId) return;
  try {
    const res = await base44.functions.invoke('biePersistence', {
      action: 'getJournal',
      data: { businessId, limit: MAX_ENTRIES },
    });
    if (res?.data?.tableMissing) { backendAvailable = false; return; }
    const remoteEntries = res?.data?.entries || [];
    if (remoteEntries.length === 0) return;

    // Merge: union of local + remote, dedup by entry id
    const local = loadJournal(businessId);
    const byId = new Map();
    for (const e of local) byId.set(e.id, e);
    for (const e of remoteEntries) byId.set(e.id, e); // remote wins
    const merged = [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    saveJournal(businessId, merged.slice(-MAX_ENTRIES));
  } catch { /* non-fatal */ }
}

/**
 * Get journal entries since a given timestamp.
 */
export function getJournalSince(businessId, sinceTimestamp) {
  const entries = loadJournal(businessId);
  if (!sinceTimestamp) return entries;
  return entries.filter(e => e.timestamp > sinceTimestamp);
}

/**
 * Get journal entries for a specific metric.
 */
export function getJournalForMetric(businessId, metricId) {
  const entries = loadJournal(businessId);
  return entries.filter(e => e.metricId === metricId || e.affectedMetrics.includes(metricId));
}

/**
 * Generate journal entries from a snapshot diff.
 * Each entry includes a deterministic Galileo summary.
 */
export function entriesFromSnapshotDiff(snapshot) {
  if (!snapshot?.changedMetrics) return [];
  const entries = [];
  for (const change of snapshot.changedMetrics) {
    const hadValue = change.oldValue != null;
    const hasValue = change.newValue != null;

    let eventType;
    if (!hadValue && hasValue) eventType = JOURNAL_EVENT_TYPES.METRIC_APPEARED;
    else if (hadValue && !hasValue) eventType = JOURNAL_EVENT_TYPES.METRIC_DISAPPEARED;
    else if (hasValue && typeof change.newValue === 'number' && typeof change.oldValue === 'number') {
      eventType = change.newValue > change.oldValue
        ? JOURNAL_EVENT_TYPES.VALUE_INCREASED
        : JOURNAL_EVENT_TYPES.VALUE_DECREASED;
    } else {
      eventType = JOURNAL_EVENT_TYPES.METRIC_UPDATED;
    }

    entries.push(createJournalEntry({
      eventType,
      metricId: change.id,
      oldValue: change.oldValue,
      newValue: change.newValue,
      affectedMetrics: [change.id],
      triggeredBy: snapshot.triggeredBy,
    }));
  }
  return entries;
}

export default { loadJournal, saveJournal, createJournalEntry, appendJournalEntry, getJournalSince, getJournalForMetric, entriesFromSnapshotDiff, hydrateJournalFromBackend, JOURNAL_EVENT_TYPES };