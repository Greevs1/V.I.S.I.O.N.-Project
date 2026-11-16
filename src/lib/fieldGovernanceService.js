/**
 * fieldGovernanceService — frontend wrapper for the field-level governance
 * backend function. All calls go through base44.functions.invoke.
 *
 * The backend function enforces all permissions; this wrapper is a thin pass-through.
 */
import { base44 } from '@/api/base44Client';

export async function getFieldGovernance(valuationId) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'getFieldGovernance',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function upsertFieldGovernance(valuationId, fieldKey, fields) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'upsertFieldGovernance',
    data: { valuation_id: valuationId, field_key: fieldKey, ...fields },
  });
  return res.data;
}

export async function lockField(valuationId, fieldKey, reason) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'lockField',
    data: { valuation_id: valuationId, field_key: fieldKey, reason },
  });
  return res.data;
}

export async function unlockField(valuationId, fieldKey, reason) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'unlockField',
    data: { valuation_id: valuationId, field_key: fieldKey, reason },
  });
  return res.data;
}

export async function requestChange(valuationId, fieldKey, details) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'requestChange',
    data: { valuation_id: valuationId, field_key: fieldKey, ...details },
  });
  return res.data;
}

export async function getChangeRequests(valuationId) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'getChangeRequests',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function reviewChangeRequest(requestId, decision, reviewNotes) {
  const res = await base44.functions.invoke('fieldGovernanceService', {
    action: 'reviewChangeRequest',
    data: { request_id: requestId, decision, review_notes: reviewNotes },
  });
  return res.data;
}