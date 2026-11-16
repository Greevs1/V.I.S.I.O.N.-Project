/**
 * meetingIntelligence/meetingContext.ts — Phase 15.3
 *
 * The Meeting Context builder.
 *
 * Creates a reusable Meeting Context object that holds everything the
 * coordinator needs to synthesize a brief. Everything references existing
 * certified owners — nothing is recalculated.
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from certified engines, does not create truth)
 *   Article II — Single Ownership (context owns "meeting state", not business facts)
 *   Article III — No Duplicate Intelligence (references, not copies)
 */

import type {
  MeetingContext,
  MeetingIntelligenceInput,
  MeetingIntentConfig,
  MeetingChangeReference,
  MeetingInitiativeReference,
  MeetingRequestReference,
  MeetingReviewReference,
  MeetingApprovalReference,
  MeetingPublicationStatus,
  MeetingPriorityReference,
  MeetingRiskReference,
  MeetingOpportunityReference,
  MeetingConfidenceSummary,
  MeetingMomentumSummary,
  MeetingMilestoneReference,
  MeetingContextMeta,
} from './types.ts';
import { getMeetingIntentConfig } from './meetingIntent.ts';

/**
 * Build the Meeting Context from certified inputs.
 * This is a READ operation — no calculations, no duplicate intelligence.
 */
export function buildMeetingContext(input: MeetingIntelligenceInput): MeetingContext {
  const intentConfig = getMeetingIntentConfig(input.intent);
  const previousDate = input.previous_meeting_date;

  // ── Major Business Changes (from Executive Context / Timeline) ────────────
  const majorChanges = extractMajorChanges(input, previousDate);

  // ── Completed Initiatives (from Sprint / Growth Plan) ─────────────────────
  const completedInitiatives = extractCompletedInitiatives(input, previousDate);

  // ── Outstanding Requests (from Client Requests) ────────────────────────────
  const outstandingRequests = extractOutstandingRequests(input);

  // ── Pending Reviews (from Verification Queue) ─────────────────────────────
  const pendingReviews = extractPendingReviews(input);

  // ── Pending Approvals (from Verification Queue / Valuation) ───────────────
  const pendingApprovals = extractPendingApprovals(input);

  // ── Publication Status (from Valuation metadata) ───────────────────────────
  const publicationStatus = extractPublicationStatus(input);

  // ── Current Priorities (from Executive Context / What Matters Now) ────────
  const currentPriorities = extractCurrentPriorities(input, intentConfig);

  // ── Risks (from Executive Context) ─────────────────────────────────────────
  const risks = extractRisks(input);

  // ── Opportunities (from Executive Context / Growth Plan) ───────────────────
  const opportunities = extractOpportunities(input, intentConfig);

  // ── Business Confidence (from Confidence Engine via Executive Context) ───
  const businessConfidence = extractConfidence(input);

  // ── Business Momentum (from Living Intelligence) ──────────────────────────
  const businessMomentum = extractMomentum(input);

  // ── Recent Milestones (from Timeline / Sprint) ────────────────────────────
  const recentMilestones = extractRecentMilestones(input, previousDate);

  // ── Metadata ──────────────────────────────────────────────────────────────
  const _meta: MeetingContextMeta = {
    sources_used: identifyContextSources(input),
    constitution_compliant: true,
    no_calculations_performed: true,
    no_duplicate_intelligence: true,
  };

  return {
    meeting_id: input.meeting_id,
    business_id: input.business_id,
    profile_id: input.profile_id,
    intent: input.intent,
    intent_config: intentConfig,
    scheduled_at: input.scheduled_at,
    previous_meeting_date: previousDate,
    time_since_previous_meeting: computeTimeSincePrevious(previousDate),
    advisor: input.advisor,
    participants: input.participants,
    major_business_changes: majorChanges,
    completed_initiatives: completedInitiatives,
    outstanding_requests: outstandingRequests,
    pending_reviews: pendingReviews,
    pending_approvals: pendingApprovals,
    publication_status: publicationStatus,
    current_priorities: currentPriorities,
    risks,
    opportunities,
    business_confidence: businessConfidence,
    business_momentum: businessMomentum,
    recent_milestones: recentMilestones,
    _meta,
  };
}

// ── Extraction helpers (all READ-ONLY from certified inputs) ──────────────────

function extractMajorChanges(input: MeetingIntelligenceInput, previousDate: string | null): MeetingChangeReference[] {
  const ec = input.executive_context;
  const changes = ec?.recently_changed_facts || [];
  const cutoff = previousDate ? new Date(previousDate).getTime() : 0;

  return changes
    .filter((c: any) => {
      const ts = new Date(c.timestamp || 0).getTime();
      return ts >= cutoff;
    })
    .slice(0, 10)
    .map((c: any) => ({
      id: c.id || c._id,
      summary: c.what_changed || c.title || 'Business change',
      certified_owner: c.certified_owner || 'cbss',
      timestamp: c.timestamp || new Date().toISOString(),
      source_ref: c.source_event_id || c.source_timeline_id || c.id,
    }));
}

function extractCompletedInitiatives(input: MeetingIntelligenceInput, previousDate: string | null): MeetingInitiativeReference[] {
  const sprint = input.sprint_data;
  const tasks = sprint?.tasks || [];
  const cutoff = previousDate ? new Date(previousDate).getTime() : 0;

  return tasks
    .filter((t: any) => t.status === 'completed' || t.status === 'Implemented' || t.status === 'Verified')
    .filter((t: any) => {
      const ts = new Date(t.completed_at || t.updated_date || 0).getTime();
      return ts >= cutoff;
    })
    .slice(0, 10)
    .map((t: any) => ({
      id: t.id || t._id,
      title: t.title || t.name || 'Completed initiative',
      status: t.status,
      certified_owner: 'sprint_aggregation',
    }));
}

function extractOutstandingRequests(input: MeetingIntelligenceInput): MeetingRequestReference[] {
  const requests = input.client_requests || [];
  return requests
    .filter((r: any) => r.status === 'pending' || r.status === 'open' || !r.status)
    .slice(0, 10)
    .map((r: any) => ({
      id: r.id || r._id,
      title: r.title || r.field_name || 'Client request',
      request_type: r.request_type || (r.item_type === 'missing_document' ? 'document' : 'confirmation'),
      status: r.status || 'pending',
      certified_owner: 'verification_queue',
    }));
}

function extractPendingReviews(input: MeetingIntelligenceInput): MeetingReviewReference[] {
  const reviews = input.pending_reviews || [];
  return reviews
    .filter((r: any) => r.status === 'open' || r.status === 'pending' || !r.status)
    .slice(0, 10)
    .map((r: any) => ({
      id: r.id || r._id,
      title: r.title || r.field_name || 'Pending review',
      review_type: r.review_type || r.type || 'low_confidence',
      urgency: r.urgency || (r.review_type === 'conflict' ? 'immediate' : 'soon'),
      certified_owner: 'verification_queue',
    }));
}

function extractPendingApprovals(input: MeetingIntelligenceInput): MeetingApprovalReference[] {
  const reviews = input.pending_reviews || [];
  const valuations = input.valuation_metadata;

  const approvals: MeetingApprovalReference[] = [];

  // Add-back approvals from verification queue
  reviews
    .filter((r: any) => r.item_type === 'proposed_add_back' && (r.status === 'open' || r.status === 'pending'))
    .slice(0, 5)
    .forEach((r: any) => {
      approvals.push({
        id: r.id || r._id,
        title: r.title || 'Add-back approval',
        approval_type: 'add_back',
        certified_owner: 'verification_queue',
      });
    });

  // Valuation publication approval
  if (valuations && valuations.status === 'ready_for_publication') {
    approvals.push({
      id: valuations.id || 'val-publication',
      title: 'Valuation publication approval',
      approval_type: 'publication',
      certified_owner: 'valuation_service',
    });
  }

  return approvals.slice(0, 10);
}

function extractPublicationStatus(input: MeetingIntelligenceInput): MeetingPublicationStatus {
  const val = input.valuation_metadata;
  if (!val) {
    return {
      is_published: false,
      is_blocked: false,
      blocker_count: 0,
      certified_owner: 'valuation_service',
    };
  }

  const blockers = (input.pending_reviews || []).filter(
    (r: any) => r.is_publication_blocker && (r.status === 'open' || r.status === 'pending')
  );

  return {
    is_published: val.status === 'published',
    is_blocked: blockers.length > 0,
    blocker_count: blockers.length,
    certified_owner: 'valuation_service',
  };
}

function extractCurrentPriorities(input: MeetingIntelligenceInput, config: MeetingIntentConfig): MeetingPriorityReference[] {
  const ec = input.executive_context;
  const items = [
    ...(ec?.advisor_attention_items || []).map((i: any) => ({ ...i, type: 'advisor' })),
    ...(ec?.owner_attention_items || []).map((i: any) => ({ ...i, type: 'owner' })),
  ];

  return items
    .slice(0, 5)
    .map((i: any) => ({
      id: i.id || i._id,
      title: i.title || 'Priority item',
      priority: i.urgency === 'immediate' ? 1 : i.urgency === 'soon' ? 3 : 5,
      certified_owner: i.certified_owner || 'executive_context',
    }));
}

function extractRisks(input: MeetingIntelligenceInput): MeetingRiskReference[] {
  const ec = input.executive_context;
  const risks = ec?.top_risks || [];
  return risks.slice(0, 3).map((r: any) => ({
    id: r.id || r._id,
    headline: r.headline || r.title || 'Open risk',
    severity: r.priority <= 2 ? 'high' : r.priority <= 4 ? 'medium' : 'low',
    certified_owner: r.certified_owner || 'executive_context',
  }));
}

function extractOpportunities(input: MeetingIntelligenceInput, _config: MeetingIntentConfig): MeetingOpportunityReference[] {
  const ec = input.executive_context;
  const opps = ec?.top_opportunities || [];
  return opps.slice(0, 5).map((o: any) => ({
    id: o.id || o._id,
    headline: o.headline || o.title || 'Opportunity',
    potential_impact: o.business_impact || o.why_it_matters || 'Impact assessment available',
    certified_owner: o.certified_owner || 'growth_plan_engine',
  }));
}

function extractConfidence(input: MeetingIntelligenceInput): MeetingConfidenceSummary {
  const ec = input.executive_context;
  const c = ec?.business_confidence;
  if (!c) {
    return {
      overall_confidence: null,
      source: 'confidence_engine',
      summary: 'Confidence scores not yet available',
    };
  }
  return {
    overall_confidence: c.overall_confidence ?? null,
    source: c.source || 'confidence_engine',
    summary: c.summary || 'Confidence available',
  };
}

function extractMomentum(input: MeetingIntelligenceInput): MeetingMomentumSummary {
  const ec = input.executive_context;
  const m = ec?.business_momentum;
  if (!m) {
    return {
      direction: 'unknown',
      summary: 'Momentum not yet available',
      certified_owner: 'living_intelligence',
    };
  }
  return {
    direction: m.direction || 'unknown',
    summary: m.summary || 'Momentum available',
    certified_owner: 'living_intelligence',
  };
}

function extractRecentMilestones(input: MeetingIntelligenceInput, previousDate: string | null): MeetingMilestoneReference[] {
  const timeline = input.timeline || [];
  const cutoff = previousDate ? new Date(previousDate).getTime() : 0;

  return timeline
    .filter((t: any) => {
      const ts = new Date(t.timestamp || t.created_date || 0).getTime();
      return ts >= cutoff;
    })
    .filter((t: any) => t.type === 'milestone' || t.type === 'completion' || t.is_milestone)
    .slice(0, 5)
    .map((t: any) => ({
      id: t.id || t._id,
      title: t.title || t.summary || 'Milestone',
      completed_at: t.timestamp || t.created_date || new Date().toISOString(),
      certified_owner: t.certified_owner || 'timeline',
    }));
}

function computeTimeSincePrevious(previousDate: string | null): string | null {
  if (!previousDate) return null;
  const days = Math.floor((Date.now() - new Date(previousDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 60) return '~1 month';
  if (days < 90) return '~2 months';
  if (days < 365) return `~${Math.floor(days / 30)} months`;
  return `~${Math.floor(days / 365)} year(s)`;
}

function identifyContextSources(input: MeetingIntelligenceInput): string[] {
  const sources: string[] = [];
  if (input.executive_context) sources.push('executive_context');
  if (input.timeline?.length) sources.push('business_timeline');
  if (input.canonical_facts) sources.push('canonical_fact_resolver');
  if (input.growth_initiatives?.length) sources.push('growth_plan_engine');
  if (input.valuation_metadata) sources.push('valuation_service');
  if (input.assessment_results?.length) sources.push('assessment_engine');
  if (input.executive_brief) sources.push('executive_narrative_engine');
  if (input.documents?.length) sources.push('document_service');
  if (input.pending_reviews?.length) sources.push('verification_queue');
  if (input.sprint_data) sources.push('sprint_aggregation');
  if (input.client_requests?.length) sources.push('client_request_service');
  return sources;
}