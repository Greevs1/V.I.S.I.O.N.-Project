/**
 * valuationRequestService — frontend wrapper for the valuation request backend.
 * All calls go through base44.functions.invoke('valuationRequestService', { action, data }).
 */

import { base44 } from '@/api/base44Client';

export async function createRequest(payload) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'createRequest',
    data: payload,
  });
  return res.data;
}

export async function getMyRequests(businessId = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'getMyRequests',
    data: { business_id: businessId },
  });
  return res.data;
}

export async function getRequest(requestId) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'getRequest',
    data: { request_id: requestId },
  });
  return res.data;
}

export async function getAdminRequests(filters = {}) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'getAdminRequests',
    data: filters,
  });
  return res.data;
}

export async function getAdminSummary() {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'getAdminSummary',
    data: {},
  });
  return res.data;
}

export async function getAdminBusinesses() {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'getAdminBusinesses',
    data: {},
  });
  return res.data;
}

export async function assignAdminToRequest(requestId) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'assignAdminToRequest',
    data: { request_id: requestId },
  });
  return res.data;
}

export async function markRequestViewed(requestId) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'markRequestViewed',
    data: { request_id: requestId },
  });
  return res.data;
}

export async function requestMoreInformation(requestId, informationRequests, adminNotes = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'requestMoreInformation',
    data: { request_id: requestId, information_requests: informationRequests, admin_notes: adminNotes },
  });
  return res.data;
}

export async function ownerRespond(requestId, responses, notes = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'ownerRespond',
    data: { request_id: requestId, responses, notes },
  });
  return res.data;
}

export async function withdrawRequest(requestId, reason = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'withdrawRequest',
    data: { request_id: requestId, reason },
  });
  return res.data;
}

export async function approveRequest(requestId, adminNotes = null, leadAdvisorId = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'approveRequest',
    data: { request_id: requestId, admin_notes: adminNotes, assigned_lead_advisor_id: leadAdvisorId },
  });
  return res.data;
}

export async function declineRequest(requestId, reason, adminNotes = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'declineRequest',
    data: { request_id: requestId, reason, admin_notes: adminNotes },
  });
  return res.data;
}

export async function closeAsDuplicate(requestId, reason, duplicateOfId = null) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'closeAsDuplicate',
    data: { request_id: requestId, reason, duplicate_of_request_id: duplicateOfId },
  });
  return res.data;
}

export async function convertToValuation(requestId, config) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'convertToValuation',
    data: { request_id: requestId, ...config },
  });
  return res.data;
}

export async function getRequestEvents(requestId) {
  const res = await base44.functions.invoke('valuationRequestService', {
    action: 'getRequestEvents',
    data: { request_id: requestId },
  });
  return res.data;
}