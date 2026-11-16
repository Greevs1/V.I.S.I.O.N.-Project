/**
 * useFieldGovernance — loads field-level governance records and change
 * requests for a valuation, and provides permission-aware helpers.
 *
 * The backend function is the sole enforcement point; these helpers are
 * advisory for the UI (showing/hiding edit controls, lock badges, etc.).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getFieldGovernance, getChangeRequests,
  lockField, unlockField, requestChange,
} from '@/lib/fieldGovernanceService';

export function useFieldGovernance({ valuationId, canEdit }) {
  const [records, setRecords] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!valuationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [gov, cr] = await Promise.all([
        getFieldGovernance(valuationId).catch(() => ({ records: [] })),
        getChangeRequests(valuationId).catch(() => ({ records: [] })),
      ]);
      setRecords(gov?.records || []);
      setChangeRequests(cr?.records || []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [valuationId]);

  useEffect(() => { load(); }, [load]);

  const byField = useMemo(() => {
    const map = {};
    (records || []).forEach((r) => { map[r.field_key] = r; });
    return map;
  }, [records]);

  const getField = useCallback((fieldKey) => byField[fieldKey] || null, [byField]);

  const isLocked = useCallback((fieldKey) => {
    const r = byField[fieldKey];
    return r ? !!r.is_locked : false;
  }, [byField]);

  // Advisory: can the current user edit this field?
  // Backend enforces the real check; this is for UI display only.
  const canEditField = useCallback((fieldKey) => {
    if (!canEdit) return false;
    const r = byField[fieldKey];
    if (!r) return true; // no governance record = editable by assigned advisor
    return true; // locked or not, the backend decides; UI shows lock badge
  }, [canEdit, byField]);

  const pendingRequestsForField = useCallback((fieldKey) =>
    (changeRequests || []).filter((cr) => cr.field_key === fieldKey && cr.status === 'pending'),
    [changeRequests]);

  const handleLock = useCallback(async (fieldKey, reason) => {
    await lockField(valuationId, fieldKey, reason);
    await load();
  }, [valuationId, load]);

  const handleUnlock = useCallback(async (fieldKey, reason) => {
    await unlockField(valuationId, fieldKey, reason);
    await load();
  }, [valuationId, load]);

  const handleRequestChange = useCallback(async (fieldKey, details) => {
    await requestChange(valuationId, fieldKey, details);
    await load();
  }, [valuationId, load]);

  const summary = useMemo(() => ({
    total: records.length,
    locked: (records || []).filter((r) => r.is_locked).length,
    pendingRequests: (changeRequests || []).filter((cr) => cr.status === 'pending').length,
    aiPending: (records || []).filter((r) => r.ai_recommendation_status === 'pending').length,
  }), [records, changeRequests]);

  return {
    records, changeRequests, loading, summary,
    byField, getField, isLocked, canEditField, pendingRequestsForField,
    lockField: handleLock, unlockField: handleUnlock, requestChange: handleRequestChange,
    reload: load,
  };
}