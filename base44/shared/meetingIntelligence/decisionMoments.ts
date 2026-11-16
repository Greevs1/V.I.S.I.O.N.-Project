/**
 * meetingIntelligence/decisionMoments.ts — Phase 15.3
 *
 * Decision Moments identification.
 *
 * Decision Moments are METADATA ONLY — no workflow changes.
 * They identify what decisions are relevant for this meeting.
 *
 * Constitution Compliance:
 *   Article I — One Truth (decisions reference existing systems, do not create truth)
 *   Article V — Advisor Governance (decisions are identified, not made)
 */

import type {
  DecisionMoment,
  DecisionMomentType,
  MeetingContext,
  MeetingIntelligenceInput,
} from './types.ts';

/**
 * Identify Decision Moments from the Meeting Context.
 * Metadata only — no workflow changes, no decisions made.
 */
export function identifyDecisionMoments(
  context: MeetingContext,
  input: MeetingIntelligenceInput
): DecisionMoment[] {
  const moments: DecisionMoment[] = [];
  const intent = context.intent;

  // ── From Pending Approvals ─────────────────────────────────────────────────
  for (const approval of context.pending_approvals) {
    if (approval.approval_type === 'add_back') {
      moments.push({
        id: `dm-${approval.id}`,
        decision_type: 'finalize_add_back',
        title: approval.title,
        description: 'Review and finalize the proposed add-back',
        certified_owner: approval.certified_owner,
        action_url: null,
      });
    }
    if (approval.approval_type === 'publication') {
      moments.push({
        id: `dm-${approval.id}`,
        decision_type: 'approve_publication',
        title: approval.title,
        description: 'Approve valuation for publication',
        certified_owner: approval.certified_owner,
        action_url: null,
      });
    }
  }

  // ── From Pending Reviews (conflict resolution) ─────────────────────────────
  for (const review of context.pending_reviews) {
    if (review.review_type === 'conflict') {
      moments.push({
        id: `dm-${review.id}`,
        decision_type: 'resolve_conflict',
        title: review.title,
        description: 'Resolve conflicting values from different sources',
        certified_owner: review.certified_owner,
        action_url: null,
      });
    }
  }

  // ── From Outstanding Requests (document requests) ──────────────────────────
  for (const req of context.outstanding_requests) {
    if (req.request_type === 'document') {
      moments.push({
        id: `dm-${req.id}`,
        decision_type: 'request_documents',
        title: req.title,
        description: 'Follow up on outstanding document request',
        certified_owner: req.certified_owner,
        action_url: null,
      });
    }
  }

  // ── Intent-specific Decision Moments ────────────────────────────────────────
  if (intent === 'tax_planning') {
    moments.push({
      id: `dm-tax-${context.meeting_id}`,
      decision_type: 'review_tax_strategy',
      title: 'Review Tax Strategy',
      description: 'Assess current tax gap and finalize strategy',
      certified_owner: 'assessment_engine',
      action_url: null,
    });
  }

  if (intent === 'growth_planning' || intent === 'annual_planning') {
    const initiatives = input.growth_initiatives || [];
    if (initiatives.length > 0) {
      moments.push({
        id: `dm-growth-${context.meeting_id}`,
        decision_type: 'prioritize_growth_plan',
        title: 'Prioritize Growth Plan',
        description: 'Review and prioritize growth initiatives',
        certified_owner: 'growth_plan_engine',
        action_url: null,
      });
    }
  }

  if (intent === 'valuation_review' || intent === 'exit_planning') {
    if (context.publication_status.is_blocked) {
      moments.push({
        id: `dm-verify-${context.meeting_id}`,
        decision_type: 'complete_verification',
        title: 'Complete Verification',
        description: `${context.publication_status.blocker_count} item(s) blocking publication`,
        certified_owner: 'verification_queue',
        action_url: null,
      });
    }
  }

  if (intent === 'internal_advisor_review') {
    const assignments = input.advisor_assignments || [];
    if (assignments.length > 0) {
      moments.push({
        id: `dm-assign-${context.meeting_id}`,
        decision_type: 'assign_advisor',
        title: 'Review Advisor Assignments',
        description: 'Review and adjust advisor task assignments',
        certified_owner: 'advisor_assignment_service',
        action_url: null,
      });
    }
  }

  // ── Assessment review (if assessments completed since last meeting) ───────
  const assessments = input.assessment_results || [];
  const previousDate = context.previous_meeting_date;
  const recentAssessments = previousDate
    ? assessments.filter((a: any) => {
        const ts = new Date(a.completed_at || a.updated_date || 0).getTime();
        return ts >= new Date(previousDate).getTime();
      })
    : assessments;

  if (recentAssessments.length > 0) {
    moments.push({
      id: `dm-assess-${context.meeting_id}`,
      decision_type: 'review_assessment',
      title: 'Review Recent Assessments',
      description: `${recentAssessments.length} assessment(s) completed since last meeting`,
      certified_owner: 'assessment_engine',
      action_url: null,
    });
  }

  return moments.slice(0, 8); // Maximum 8 — clarity over completeness
}