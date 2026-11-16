/**
 * meetingIntelligence/duplicateDetection.ts — Phase 15.4
 *
 * Duplicate Detection — checks for existing equivalents before creating.
 *
 * Before creating any approved outcome, check for existing equivalents:
 *   - Existing Growth Plan initiative
 *   - Existing Sprint task
 *   - Existing Verification item
 *   - Existing document request
 *   - Existing Roadmap item
 *   - Existing advisor note
 *
 * If likely duplicate: offer Update Existing / Keep Separate / Dismiss.
 * Never silently create duplicates.
 *
 * Constitution Compliance:
 *   Article III — No Duplicate Intelligence
 *   Article V — Advisor Governance (advisor decides how to handle duplicates)
 */

import type {
  PostMeetingOutcome,
  DuplicateCheckResult,
  PostMeetingSynthesisInput,
} from './postMeetingTypes.ts';

/**
 * Check for existing equivalents for a proposed outcome.
 */
export function checkDuplicate(
  outcome: PostMeetingOutcome,
  input: PostMeetingSynthesisInput,
): DuplicateCheckResult {
  const titleLower = outcome.title.toLowerCase().trim();

  switch (outcome.destination_system) {
    case 'growth_plan':
      return checkGrowthPlanDuplicates(titleLower, input.existing_growth_initiatives || []);
    case 'sprint_tasks':
      return checkSprintTaskDuplicates(titleLower, input.existing_sprint_tasks || []);
    case 'verification_queue':
      return checkVerificationDuplicates(titleLower, input.existing_verification_items || []);
    case 'document_requests':
      return checkDocumentRequestDuplicates(titleLower, input.existing_document_requests || []);
    case 'roadmap':
      return checkRoadmapDuplicates(titleLower, input.existing_roadmap_items || []);
    case 'advisor_notes':
      return checkAdvisorNoteDuplicates(titleLower, input.existing_advisor_notes || []);
    default:
      return {
        has_duplicate: false,
        duplicate_type: 'none',
        existing_item_id: null,
        existing_item_title: null,
        existing_item_status: null,
        recommended_action: 'create_new',
      };
  }
}

function checkGrowthPlanDuplicates(titleLower: string, existing: any[]): DuplicateCheckResult {
  for (const item of existing) {
    const itemTitle = (item.title || item.initiative_name || '').toLowerCase().trim();
    if (itemTitle === titleLower) {
      return {
        has_duplicate: true,
        duplicate_type: 'exact',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title || item.initiative_name,
        existing_item_status: item.status || 'active',
        recommended_action: 'update_existing',
      };
    }
    if (itemTitle && (itemTitle.includes(titleLower) || titleLower.includes(itemTitle)) && titleLower.length > 10) {
      return {
        has_duplicate: true,
        duplicate_type: 'similar',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title || item.initiative_name,
        existing_item_status: item.status || 'active',
        recommended_action: 'update_existing',
      };
    }
  }
  return noDuplicate();
}

function checkSprintTaskDuplicates(titleLower: string, existing: any[]): DuplicateCheckResult {
  for (const item of existing) {
    const itemTitle = (item.title || item.name || '').toLowerCase().trim();
    if (itemTitle === titleLower) {
      return {
        has_duplicate: true,
        duplicate_type: 'exact',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title || item.name,
        existing_item_status: item.status || 'open',
        recommended_action: 'update_existing',
      };
    }
  }
  return noDuplicate();
}

function checkVerificationDuplicates(titleLower: string, existing: any[]): DuplicateCheckResult {
  for (const item of existing) {
    const itemTitle = (item.title || item.field_name || '').toLowerCase().trim();
    if (itemTitle === titleLower) {
      return {
        has_duplicate: true,
        duplicate_type: 'exact',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title || item.field_name,
        existing_item_status: item.status || 'open',
        recommended_action: 'dismiss',
      };
    }
  }
  return noDuplicate();
}

function checkDocumentRequestDuplicates(titleLower: string, existing: any[]): DuplicateCheckResult {
  for (const item of existing) {
    const itemTitle = (item.title || item.field_name || '').toLowerCase().trim();
    if (itemTitle === titleLower && (item.status === 'pending' || item.status === 'open')) {
      return {
        has_duplicate: true,
        duplicate_type: 'exact',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title || item.field_name,
        existing_item_status: item.status,
        recommended_action: 'dismiss',
      };
    }
  }
  return noDuplicate();
}

function checkRoadmapDuplicates(titleLower: string, existing: any[]): DuplicateCheckResult {
  for (const item of existing) {
    const itemTitle = (item.title || item.name || '').toLowerCase().trim();
    if (itemTitle === titleLower) {
      return {
        has_duplicate: true,
        duplicate_type: 'exact',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title || item.name,
        existing_item_status: item.status || 'open',
        recommended_action: 'update_existing',
      };
    }
  }
  return noDuplicate();
}

function checkAdvisorNoteDuplicates(titleLower: string, existing: any[]): DuplicateCheckResult {
  for (const item of existing) {
    const itemTitle = (item.title || '').toLowerCase().trim();
    if (itemTitle === titleLower && item.status === 'active') {
      return {
        has_duplicate: true,
        duplicate_type: 'exact',
        existing_item_id: item.id || item._id,
        existing_item_title: item.title,
        existing_item_status: item.status,
        recommended_action: 'update_existing',
      };
    }
  }
  return noDuplicate();
}

function noDuplicate(): DuplicateCheckResult {
  return {
    has_duplicate: false,
    duplicate_type: 'none',
    existing_item_id: null,
    existing_item_title: null,
    existing_item_status: null,
    recommended_action: 'create_new',
  };
}