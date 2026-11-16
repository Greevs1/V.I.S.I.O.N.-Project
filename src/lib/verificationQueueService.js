/**
 * verificationQueueService — frontend wrapper for the Phase 13.3E.3
 * Unified Verification Queue backend.
 */

import { base44 } from '@/api/base44Client';

export async function getVerificationQueue(valuationId, opts = {}) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'getVerificationQueue',
    data: {
      valuation_id: valuationId,
      filter: opts.filter || 'all',
      sort: opts.sort || 'priority',
      search: opts.search || '',
      limit: opts.limit || 100,
      offset: opts.offset || 0,
    },
  });
  return res.data;
}

export async function resolveVerificationItem(itemId, resolutionAction, extras = {}) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'resolveVerificationItem',
    data: { item_id: itemId, resolution_action: resolutionAction, ...extras },
  });
  return res.data;
}

export async function resolveConflict(itemId, { chosen_source, reconciled_value, resolution_reason }) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'resolveConflict',
    data: { item_id: itemId, chosen_source, reconciled_value, resolution_reason },
  });
  return res.data;
}

export async function approveAddBack(itemId, { approved_amount, resolution_reason } = {}) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'approveAddBack',
    data: { item_id: itemId, approved_amount, resolution_reason },
  });
  return res.data;
}

export async function rejectAddBack(itemId, { resolution_reason } = {}) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'rejectAddBack',
    data: { item_id: itemId, resolution_reason },
  });
  return res.data;
}

export async function assignVerificationItem(itemId, { assigned_profile_id, due_date, responsible_party } = {}) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'assignVerificationItem',
    data: { item_id: itemId, assigned_profile_id, due_date, responsible_party },
  });
  return res.data;
}

export async function createClientRequest(valuationId, payload) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'createClientRequest',
    data: { valuation_id: valuationId, ...payload },
  });
  return res.data;
}

export async function getClientRequests(valuationId) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'getClientRequests',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getQueueSummary(valuationId) {
  const res = await base44.functions.invoke('verificationQueueService', {
    action: 'getQueueSummary',
    data: { valuation_id: valuationId },
  });
  return res.data;
}