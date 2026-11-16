/**
 * valuationService — frontend wrapper for the Business Valuation backend.
 * All calls go through base44.functions.invoke('valuationService', { action, data }).
 */

import { base44 } from '@/api/base44Client';

export async function createValuation(businessId, leadAdvisorProfileId = null, options = {}) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'createValuation',
    data: {
      business_id: businessId,
      lead_advisor_profile_id: leadAdvisorProfileId,
      valuation_name: options.valuation_name,
      valuation_type: options.valuation_type,
      valuation_purpose: options.valuation_purpose,
      standard_of_value: options.standard_of_value,
      valuation_premise: options.valuation_premise,
      valuation_date: options.valuation_date,
      engagement_date: options.engagement_date,
      is_primary: options.is_primary,
      reuse_verified_data: options.reuse_verified_data,
    },
  });
  return res.data;
}

export async function updateValuation(valuationId, updates) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'updateValuation',
    data: { valuation_id: valuationId, ...updates },
  });
  return res.data;
}

export async function updateValuationStatus(valuationId, newStatus) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'updateValuationStatus',
    data: { valuation_id: valuationId, new_status: newStatus },
  });
  return res.data;
}

export async function assignValuationAdvisor(valuationId, advisorProfileId, role, perms) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'assignValuationAdvisor',
    data: {
      valuation_id: valuationId,
      advisor_profile_id: advisorProfileId,
      assignment_role: role,
      can_view: perms?.can_view ?? true,
      can_edit: perms?.can_edit ?? false,
      can_review: perms?.can_review ?? false,
      can_publish: perms?.can_publish ?? false,
      can_create_valuation: perms?.can_create_valuation ?? false,
      can_restore_valuation: perms?.can_restore_valuation ?? false,
      can_archive_valuation: perms?.can_archive_valuation ?? false,
      can_manage_assignments: perms?.can_manage_assignments ?? false,
    },
  });
  return res.data;
}

export async function updateValuationAssignment(assignmentId, updates) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'updateValuationAssignment',
    data: { assignment_id: assignmentId, ...updates },
  });
  return res.data;
}

export async function removeValuationAdvisor(assignmentId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'removeValuationAdvisor',
    data: { assignment_id: assignmentId },
  });
  return res.data;
}

export async function saveValuationAnswer(valuationId, questionId, answerValue, extras = {}) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'saveValuationAnswer',
    data: { valuation_id: valuationId, question_id: questionId, answer_value: answerValue, ...extras },
  });
  return res.data;
}

export async function saveValuationFinancial(valuationId, financialData) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'saveValuationFinancial',
    data: { valuation_id: valuationId, ...financialData },
  });
  return res.data;
}

export async function saveValuationAdjustment(valuationId, adjustmentData) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'saveValuationAdjustment',
    data: { valuation_id: valuationId, ...adjustmentData },
  });
  return res.data;
}

export async function saveValuationMultipleFactor(valuationId, factorData) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'saveValuationMultipleFactor',
    data: { valuation_id: valuationId, ...factorData },
  });
  return res.data;
}

export async function saveValuationScenario(valuationId, scenarioData) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'saveValuationScenario',
    data: { valuation_id: valuationId, ...scenarioData },
  });
  return res.data;
}

export async function publishValuation(valuationId, publicationOptions = {}) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'publishValuation',
    data: { valuation_id: valuationId, publication_options: publicationOptions },
  });
  return res.data;
}

export async function shareValuation(valuationId, versionId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'shareValuation',
    data: { valuation_id: valuationId, version_id: versionId },
  });
  return res.data;
}

export async function revokeClientAccess(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'revokeClientAccess',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getSharedClientSummary(businessId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getSharedClientSummary',
    data: { business_id: businessId },
  });
  return res.data;
}

export async function archiveValuation(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'archiveValuation',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function restoreArchivedValuation(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'restoreArchivedValuation',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function appendValuationAuditEvent(valuationId, actionType, oldVal, newVal, meta) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'appendValuationAuditEvent',
    data: { valuation_id: valuationId, action_type: actionType, old_value: oldVal, new_value: newVal, metadata: meta },
  });
  return res.data;
}

// ── Read actions ────────────────────────────────────────────────────────────
export async function getValuationByBusiness(businessId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationByBusiness',
    data: { business_id: businessId },
  });
  return res.data;
}

export async function getValuation(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuation',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getValuationSummary(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationSummary',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getValuationVersions(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationVersions',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getValuationAuditLog(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationAuditLog',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getValuationAssignments(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationAssignments',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function getSharedValuationAvailability(businessId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getSharedValuationAvailability',
    data: { business_id: businessId },
  });
  return res.data;
}

export async function getDataReadiness(businessId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getDataReadiness',
    data: { business_id: businessId },
  });
  return res.data;
}

// ── Phase 13.3G.3: Valuation Access Management ──────────────────────────────

export async function getValuationAccessSummary(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationAccessSummary',
    data: { valuation_id: valuationId },
  });
  return res.access;
}

export async function getBusinessOwners(businessId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getBusinessOwners',
    data: { business_id: businessId },
  });
  return res.owners;
}

export async function getEligibleBusinessOwners(businessId, searchTerm = '') {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getEligibleBusinessOwners',
    data: { business_id: businessId, search_term: searchTerm },
  });
  return res.eligible_owners;
}

export async function assignBusinessOwner(valuationId, profileId, options = {}) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'assignBusinessOwner',
    data: {
      valuation_id: valuationId,
      profile_id: profileId,
      ownership_percentage: options.ownership_percentage,
      is_primary_owner: options.is_primary_owner,
      is_control_person: options.is_control_person,
      owner_role: options.owner_role,
      confirm_client_access: options.confirm_client_access,
    },
  });
  return res;
}

export async function updateBusinessOwner(valuationId, profileId, updates) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'updateBusinessOwner',
    data: { valuation_id: valuationId, profile_id: profileId, ...updates },
  });
  return res;
}

export async function setPrimaryBusinessOwner(valuationId, profileId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'setPrimaryBusinessOwner',
    data: { valuation_id: valuationId, profile_id: profileId },
  });
  return res;
}

export async function setLeadAdvisor(valuationId, advisorProfileId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'setLeadAdvisor',
    data: { valuation_id: valuationId, advisor_profile_id: advisorProfileId },
  });
  return res;
}

export async function getEligibleAdvisors(valuationId, searchTerm = '') {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getEligibleAdvisors',
    data: { valuation_id: valuationId, search_term: searchTerm },
  });
  return res.eligible_advisors;
}

// ── Phase 13.3D: Version Delta Intelligence ────────────────────────────────

export async function getVersionDelta(valuationId, currentVersionId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getVersionDelta',
    data: { valuation_id: valuationId, current_version_id: currentVersionId },
  });
  return res.data;
}

export async function getVersionDeltas(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getVersionDeltas',
    data: { valuation_id: valuationId },
  });
  return res.data;
}