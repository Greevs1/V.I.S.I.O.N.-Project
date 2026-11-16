/**
 * Intelligence Snapshots
 *
 * Formalizes snapshots of the Business Intelligence Engine state.
 * Every time intelligence changes, a snapshot is created with metadata:
 *   - Version
 *   - Timestamp
 *   - Changed metrics
 *   - Reason
 *   - Triggered by (assessment, document, scenario, advisor, sprint)
 *
 * Storage: localStorage (synchronous, immediate) + Supabase (persistence, cross-device).
 * localStorage is the primary store; Supabase is synced in the background.
 */

import { base44 } from '@/api/base44Client';
import { isMaterialChange } from './materialityPolicy';

const STORAGE_PREFIX = 'vision_bie_snapshots_';
const MAX_SNAPSHOTS = 50;

// Track whether backend persistence is available (set false if tables missing)
let backendAvailable = true;

/**
 * Load snapshots for a business from localStorage.
 */
export function loadSnapshots(businessId) {
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
 * Save snapshots to localStorage (trims to MAX_SNAPSHOTS).
 */
export function saveSnapshots(businessId, snapshots) {
  if (!businessId) return;
  try {
    const key = STORAGE_PREFIX + businessId;
    const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* non-fatal */ }
}

/**
 * Get the latest snapshot for a business.
 */
export function getLatestSnapshot(businessId) {
  const snapshots = loadSnapshots(businessId);
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

/**
 * Create a snapshot from the current engine state.
 */
export function createSnapshot({ businessId, metrics, previousSnapshot = null, reason = 'engine_rebuild', triggeredBy = 'system' }) {
  const now = new Date().toISOString();
  const version = (previousSnapshot?.version || 0) + 1;

  const prevMetricValues = previousSnapshot?.metricValues || {};
  const changedMetrics = [];

  for (const [id, metric] of Object.entries(metrics)) {
    const prevValue = prevMetricValues[id];
    const currValue = metric.value;
    // Materiality policy: immaterial numeric drift (rounding/recalculation noise)
    // is absorbed silently — value updates in metricValues but no change event is
    // emitted. First snapshot (no previous) records all metrics as changed.
    // See materialityPolicy.js for the single certified thresholds.
    const changed = !previousSnapshot || isMaterialChange(id, prevValue, currValue);
    if (changed) {
      changedMetrics.push({
        id,
        oldValue: prevValue ?? null,
        newValue: currValue,
        formatted: metric.formatted,
      });
    }
  }

  const metricValues = {};
  for (const [id, metric] of Object.entries(metrics)) {
    metricValues[id] = metric.value;
  }

  return {
    version,
    timestamp: now,
    changedMetrics,
    reason,
    triggeredBy,
    metricValues,
  };
}

/**
 * Append a snapshot to localStorage and fire-and-forget sync to Supabase.
 */
export function appendSnapshot(businessId, snapshot, profileId = null) {
  const snapshots = loadSnapshots(businessId);
  snapshots.push(snapshot);
  saveSnapshots(businessId, snapshots);

  // Background sync to Supabase (fire-and-forget, non-blocking)
  if (backendAvailable && businessId && profileId) {
    syncSnapshotToBackend(businessId, snapshot, profileId).catch(() => {});
  }
  return snapshot;
}

/**
 * Sync a single snapshot to Supabase.
 */
async function syncSnapshotToBackend(businessId, snapshot, profileId) {
  try {
    const res = await base44.functions.invoke('biePersistence', {
      action: 'saveSnapshot',
      data: {
        businessId,
        profileId,
        version: snapshot.version,
        changedMetrics: snapshot.changedMetrics,
        triggeredBy: snapshot.triggeredBy,
        reason: snapshot.reason,
        metricValues: snapshot.metricValues,
        timestamp: snapshot.timestamp,
      },
    });
    // If table is missing, disable backend sync for the session
    if (res?.data?.tableMissing) backendAvailable = false;
  } catch { /* non-fatal — localStorage is the fallback */ }
}

/**
 * Hydrate localStorage from Supabase for a business.
 * Called on app load / business switch to pull persisted snapshots.
 */
export async function hydrateSnapshotsFromBackend(businessId, profileId) {
  if (!businessId || !profileId) return;
  try {
    const res = await base44.functions.invoke('biePersistence', {
      action: 'getSnapshots',
      data: { businessId, limit: MAX_SNAPSHOTS },
    });
    if (res?.data?.tableMissing) { backendAvailable = false; return; }
    const remoteSnapshots = res?.data?.snapshots || [];
    if (remoteSnapshots.length === 0) return;

    // Merge: keep the union of local + remote, dedup by version, sort by version
    const local = loadSnapshots(businessId);
    const byVersion = new Map();
    for (const s of local) byVersion.set(s.version, s);
    for (const s of remoteSnapshots) byVersion.set(s.version, s); // remote wins
    const merged = [...byVersion.values()].sort((a, b) => a.version - b.version);
    saveSnapshots(businessId, merged.slice(-MAX_SNAPSHOTS));
  } catch { /* non-fatal */ }
}

/**
 * Get snapshots since a given version.
 */
export function getSnapshotsSince(businessId, sinceVersion) {
  const snapshots = loadSnapshots(businessId);
  return snapshots.filter(s => s.version > sinceVersion);
}

/**
 * Get all changed metric IDs since a given version.
 */
export function getChangedMetricIdsSince(businessId, sinceVersion) {
  const snapshots = getSnapshotsSince(businessId, sinceVersion);
  const changedIds = new Set();
  for (const snap of snapshots) {
    for (const cm of snap.changedMetrics) {
      changedIds.add(cm.id);
    }
  }
  return [...changedIds];
}

export default { loadSnapshots, saveSnapshots, getLatestSnapshot, createSnapshot, appendSnapshot, getSnapshotsSince, getChangedMetricIdsSince, hydrateSnapshotsFromBackend };