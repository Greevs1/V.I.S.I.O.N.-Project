/**
 * meetingIntelligence/meetingBrief.ts — Phase 15.3
 *
 * The Meeting Brief model builder.
 *
 * Maximum reading time: two minutes.
 * Sections: Meeting Summary, Since Last Meeting, Celebrate, Discuss,
 *           Decisions Required, Suggested Questions, Open Risks,
 *           Owner Wins, Advisor Notes (internal only), Client-safe version.
 *
 * This builds the CONTRACT — no UI, no text generation beyond synthesis.
 *
 * Constitution Compliance:
 *   Article I — One Truth (brief reads from certified engines, does not create truth)
 *   Article III — No Duplicate Intelligence (brief synthesizes, does not duplicate)
 *   Article IV — Explainability (every section cites certified owner)
 *   Article V — Advisor Governance (brief prepares, does not decide)
 */

import type {
  MeetingBrief,
  MeetingContext,
  MeetingIntelligenceInput,
  MeetingSummary,
  SinceLastMeeting,
  CelebrateSection,
  CelebrateItem,
  DiscussSection,
  DiscussTopic,
  DecisionSection,
  DecisionItem,
  OpenRiskSection,
  OpenRiskItem,
  OwnerWinsSection,
  AdvisorNotesSection,
  AdvisorNote,
  MeetingTimelineSection,
  TimelineEntryRef,
  MeetingBriefMeta,
} from './types.ts';
import { buildSuggestedQuestions } from './suggestedQuestions.ts';
import { identifyDecisionMoments } from './decisionMoments.ts';
import { getIntentDisplayName } from './meetingIntent.ts';

/**
 * Build the Meeting Brief from the Meeting Context and certified inputs.
 * This is a SYNTHESIS operation — no calculations, no duplicate intelligence.
 */
export function buildMeetingBrief(
  context: MeetingContext,
  input: MeetingIntelligenceInput
): MeetingBrief {
  // ── Meeting Summary ────────────────────────────────────────────────────────
  const meetingSummary = buildMeetingSummary(context);

  // ── Since Last Meeting ─────────────────────────────────────────────────────
  const sinceLastMeeting = buildSinceLastMeeting(context);

  // ── Celebrate ───────────────────────────────────────────────────────────────
  const celebrate = buildCelebrateSection(context);

  // ── Discuss ─────────────────────────────────────────────────────────────────
  const discuss = buildDiscussSection(context, input);

  // ── Decisions Required ─────────────────────────────────────────────────────
  const decisionMoments = identifyDecisionMoments(context, input);
  const decisionsRequired = buildDecisionSection(decisionMoments);

  // ── Suggested Questions ─────────────────────────────────────────────────────
  const suggestedQuestions = buildSuggestedQuestions(context, input);

  // ── Open Risks ──────────────────────────────────────────────────────────────
  const openRisks = buildOpenRiskSection(context);

  // ── Owner Wins ─────────────────────────────────────────────────────────────
  const ownerWins = buildOwnerWinsSection(context);

  // ── Advisor Notes (internal only) ──────────────────────────────────────────
  const advisorNotes = buildAdvisorNotes(context);

  // ── Meeting Timeline (reuses Business Timeline) ───────────────────────────
  const meetingTimeline = buildMeetingTimeline(context, input);

  // ── Metadata ───────────────────────────────────────────────────────────────
  const _meta: MeetingBriefMeta = {
    sources_used: context._meta.sources_used,
    reading_time_estimate: '~2 minutes',
    constitution_compliant: true,
    no_calculations_performed: true,
    no_duplicate_intelligence: true,
    no_new_recommendation_engine: true,
    reused_existing_certified_outputs: true,
  };

  return {
    meeting_id: context.meeting_id,
    business_id: context.business_id,
    intent: context.intent,
    generated_at: new Date().toISOString(),
    meeting_summary: meetingSummary,
    since_last_meeting: sinceLastMeeting,
    celebrate,
    discuss,
    decisions_required: decisionsRequired,
    suggested_questions: suggestedQuestions,
    open_risks: openRisks,
    owner_wins: ownerWins,
    advisor_notes: advisorNotes,
    client_safe_brief: {
      meeting_summary: meetingSummary,
      since_last_meeting: sinceLastMeeting,
      celebrate,
      discuss,
      decisions_required: decisionsRequired,
      suggested_questions: suggestedQuestions,
      open_risks: openRisks,
      owner_wins: ownerWins,
      meeting_timeline: meetingTimeline,
      _meta: {
        client_safe: true,
        excluded_internal_items: ['advisor_notes'],
      },
    },
    meeting_timeline: meetingTimeline,
    decision_moments: decisionMoments,
    _meta,
  };
}

// ── Section builders ─────────────────────────────────────────────────────────

function buildMeetingSummary(context: MeetingContext): MeetingSummary {
  const intentLabel = getIntentDisplayName(context.intent);
  const momentum = context.business_momentum;
  const momentumLine = momentum?.direction && momentum.direction !== 'unknown'
    ? `Momentum is ${momentum.direction}.`
    : '';

  const oneLineContext = [
    context.time_since_previous_meeting ? `Last meeting: ${context.time_since_previous_meeting} ago.` : '',
    context.publication_status.is_blocked ? `${context.publication_status.blocker_count} publication blocker(s).` : '',
    momentumLine,
  ].filter(Boolean).join(' ') || 'Business status available.';

  const headline = context.current_priorities[0]?.title || `${intentLabel} preparation`;

  return {
    headline,
    one_line_context: oneLineContext,
    meeting_intent_label: intentLabel,
    time_since_previous: context.time_since_previous_meeting,
  };
}

function buildSinceLastMeeting(context: MeetingContext): SinceLastMeeting {
  return {
    completed_items: context.completed_initiatives.map(i => i.title),
    changed_facts: context.major_business_changes.map(c => c.summary),
    new_items: context.pending_reviews.map(r => r.title).slice(0, 5),
    blocked_items: context.outstanding_requests.map(r => r.title),
  };
}

function buildCelebrateSection(context: MeetingContext): CelebrateSection {
  const wins: CelebrateItem[] = [];

  // Completed initiatives
  for (const init of context.completed_initiatives.slice(0, 3)) {
    wins.push({
      headline: init.title,
      why_it_matters: 'Completed since the last meeting',
      certified_owner: init.certified_owner,
    });
  }

  // Recent milestones
  for (const milestone of context.recent_milestones.slice(0, 2)) {
    wins.push({
      headline: milestone.title,
      why_it_matters: 'Milestone achieved',
      certified_owner: milestone.certified_owner,
    });
  }

  // Positive momentum
  if (context.business_momentum.direction === 'improving') {
    wins.push({
      headline: 'Business momentum is improving',
      why_it_matters: context.business_momentum.summary,
      certified_owner: 'living_intelligence',
    });
  }

  return { wins: wins.slice(0, 5) }; // Maximum 5 — silence is valid
}

function buildDiscussSection(context: MeetingContext, input: MeetingIntelligenceInput): DiscussSection {
  const topics: DiscussTopic[] = [];

  // Major changes
  for (const change of context.major_business_changes.slice(0, 3)) {
    topics.push({
      id: `discuss-change-${change.id}`,
      headline: change.summary,
      why_it_deserves_discussion: 'Business change since last meeting',
      supporting_evidence: `Source: ${change.certified_owner}`,
      certified_owner: change.certified_owner,
      priority: 1,
    });
  }

  // Top opportunities
  for (const opp of context.opportunities.slice(0, 2)) {
    topics.push({
      id: `discuss-opp-${opp.id}`,
      headline: opp.headline,
      why_it_deserves_discussion: opp.potential_impact,
      supporting_evidence: `Source: ${opp.certified_owner}`,
      certified_owner: opp.certified_owner,
      priority: 2,
    });
  }

  // Pending reviews (if relevant to intent)
  if (context.intent === 'valuation_review' || context.intent === 'internal_advisor_review') {
    for (const review of context.pending_reviews.slice(0, 2)) {
      topics.push({
        id: `discuss-review-${review.id}`,
        headline: review.title,
        why_it_deserves_discussion: `Pending ${review.review_type} — ${review.urgency} urgency`,
        supporting_evidence: `Source: ${review.certified_owner}`,
        certified_owner: review.certified_owner,
        priority: review.urgency === 'immediate' ? 1 : 3,
      });
    }
  }

  // Sort by priority and limit to 5
  topics.sort((a, b) => a.priority - b.priority);
  return { topics: topics.slice(0, 5) };
}

function buildDecisionSection(decisionMoments: any[]): DecisionSection {
  const decisions: DecisionItem[] = decisionMoments.map(d => ({
    id: d.id,
    title: d.title,
    decision_type: d.decision_type,
    context: d.description,
    certified_owner: d.certified_owner,
    action_url: d.action_url,
  }));

  return { decisions };
}

function buildOpenRiskSection(context: MeetingContext): OpenRiskSection {
  const risks: OpenRiskItem[] = context.risks.map(r => ({
    id: r.id,
    headline: r.headline,
    severity: r.severity,
    certified_owner: r.certified_owner,
  }));

  return { risks: risks.slice(0, 3) }; // Maximum 3
}

function buildOwnerWinsSection(context: MeetingContext): OwnerWinsSection {
  const wins: string[] = [];

  for (const init of context.completed_initiatives.slice(0, 3)) {
    wins.push(init.title);
  }

  for (const milestone of context.recent_milestones.slice(0, 2)) {
    wins.push(milestone.title);
  }

  if (context.business_momentum.direction === 'improving') {
    wins.push('Business momentum is trending positive');
  }

  return { wins: wins.slice(0, 5) };
}

function buildAdvisorNotes(context: MeetingContext): AdvisorNotesSection {
  const notes: AdvisorNote[] = [];

  // Publication blockers
  if (context.publication_status.is_blocked) {
    notes.push({
      id: `note-pub-${context.meeting_id}`,
      note: `${context.publication_status.blocker_count} item(s) blocking valuation publication`,
      category: 'risk',
      certified_owner: 'valuation_service',
    });
  }

  // High-urgency reviews
  const urgent = context.pending_reviews.filter(r => r.urgency === 'immediate');
  for (const review of urgent.slice(0, 2)) {
    notes.push({
      id: `note-review-${review.id}`,
      note: `Immediate review required: ${review.title}`,
      category: 'preparation',
      certified_owner: review.certified_owner,
    });
  }

  // Low confidence
  if (context.business_confidence.overall_confidence != null && context.business_confidence.overall_confidence < 65) {
    notes.push({
      id: `note-conf-${context.meeting_id}`,
      note: `Overall confidence is ${Math.round(context.business_confidence.overall_confidence)}/100 — consider additional verification`,
      category: 'risk',
      certified_owner: 'confidence_engine',
    });
  }

  return { notes: notes.slice(0, 5) };
}

function buildMeetingTimeline(context: MeetingContext, input: MeetingIntelligenceInput): MeetingTimelineSection {
  const timeline = input.timeline || [];
  const cutoff = context.previous_meeting_date
    ? new Date(context.previous_meeting_date).getTime()
    : 0;

  const completedSinceLast: TimelineEntryRef[] = [];
  const started: TimelineEntryRef[] = [];
  const blocked: TimelineEntryRef[] = [];
  const waitingOnOwner: TimelineEntryRef[] = [];
  const waitingOnAdvisor: TimelineEntryRef[] = [];
  const waitingOnDocuments: TimelineEntryRef[] = [];
  const waitingOnVerification: TimelineEntryRef[] = [];
  const waitingOnPublication: TimelineEntryRef[] = [];

  for (const t of timeline) {
    const ts = new Date(t.timestamp || t.created_date || 0).getTime();
    const ref: TimelineEntryRef = {
      id: t.id || t._id,
      title: t.title || t.summary || 'Timeline event',
      status: t.status || 'unknown',
      timestamp: t.timestamp || t.created_date || new Date().toISOString(),
      certified_owner: t.certified_owner || 'timeline',
    };

    if (ts >= cutoff && (t.status === 'completed' || t.type === 'completion')) {
      completedSinceLast.push(ref);
    } else if (t.status === 'started' || t.type === 'start') {
      started.push(ref);
    } else if (t.status === 'blocked') {
      blocked.push(ref);
    }

    if (t.waiting_on === 'owner') waitingOnOwner.push(ref);
    if (t.waiting_on === 'advisor') waitingOnAdvisor.push(ref);
    if (t.waiting_on === 'documents' || t.type === 'document_request') waitingOnDocuments.push(ref);
    if (t.waiting_on === 'verification' || t.type === 'verification') waitingOnVerification.push(ref);
    if (t.waiting_on === 'publication' || t.type === 'publication') waitingOnPublication.push(ref);
  }

  return {
    completed_since_last: completedSinceLast.slice(0, 10),
    started: started.slice(0, 5),
    blocked: blocked.slice(0, 5),
    waiting_on_owner: waitingOnOwner.slice(0, 5),
    waiting_on_advisor: waitingOnAdvisor.slice(0, 5),
    waiting_on_documents: waitingOnDocuments.slice(0, 5),
    waiting_on_verification: waitingOnVerification.slice(0, 5),
    waiting_on_publication: waitingOnPublication.slice(0, 5),
  };
}