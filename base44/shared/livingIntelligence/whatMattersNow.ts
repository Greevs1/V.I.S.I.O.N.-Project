/**
 * livingIntelligence/whatMattersNow.ts — Phase 15.0
 *
 * The "What Matters Now" Model — dynamic prioritization.
 *
 * Ranks:
 *   • Opportunities
 *   • Risks
 *   • Advisor Tasks
 *   • Owner Tasks
 *   • Upcoming Events
 *   • Business Changes
 *   • Verification Items
 *   • Growth Opportunities
 *
 * Priority is determined by business context.
 *
 * Reuses:
 *   • BIE (business intelligence engine)
 *   • Growth Plan (growth plan engine)
 *   • Executive Brief (executive narrative engine)
 *   • Valuation (valuation calculation engine)
 *   • Assessment Results (assessment engine)
 *
 * Constitution Compliance:
 *   Article I — One Truth (reads from certified engines, does not create truth)
 *   Article II — Single Ownership (each item references its certified owner)
 *   Article III — No Duplicate Intelligence (prioritizes, does not recalculate)
 *   Article IV — Explainability (every priority is explainable)
 */

import type { WhatMattersNowItem, WhatMattersCategory, LivingIntelligenceInput, ConfidenceSource } from './types.ts';

/**
 * Build "What Matters Now" items from certified engine outputs.
 *
 * This function PRIORITIZES existing intelligence — it does NOT calculate
 * new metrics or create new recommendations.
 */
export function buildWhatMattersNow(input: LivingIntelligenceInput): WhatMattersNowItem[] {
  const items: WhatMattersNowItem[] = [];

  // ── Opportunities (from Growth Plan + BIE) ────────────────────────────────
  addOpportunities(items, input);

  // ── Risks (from BIE + Verification Queue) ────────────────────────────────
  addRisks(items, input);

  // ── Advisor Tasks (from Verification Queue + Field Governance) ───────────
  addAdvisorTasks(items, input);

  // ── Owner Tasks (from Sprint + NBA) ──────────────────────────────────────
  addOwnerTasks(items, input);

  // ── Upcoming Events (from Calendar + Sprint + Agreements) ────────────────
  addUpcomingEvents(items, input);

  // ── Business Changes (from What Changed) ────────────────────────────────
  addBusinessChanges(items, input);

  // ── Verification Items (from Verification Queue) ──────────────────────────
  addVerificationItems(items, input);

  // ── Growth Opportunities (from Growth Plan) ──────────────────────────────
  addGrowthOpportunities(items, input);

  // Sort by priority (1 = highest)
  items.sort((a, b) => a.priority - b.priority);

  // Limit to top 15 items — clarity over completeness
  return items.slice(0, 15);
}

// ── Opportunities ─────────────────────────────────────────────────────────────
function addOpportunities(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const bis = input.bis;
  if (!bis) return;

  // Read from BIE sprint-ready recommendations (NOT recalculated)
  const recommendations = bis._sprintReadyRecommendations || [];
  for (const rec of recommendations.slice(0, 3)) {
    items.push({
      id: `opportunity_${rec.metricId || rec.id || items.length}`,
      title: rec.title || rec.recommendation || 'Growth opportunity identified',
      description: rec.description || rec.rationale || '',
      category: 'opportunity' as WhatMattersCategory,
      priority: rec.priority || 5,
      confidence_source: 'business_intelligence_synthesis' as ConfidenceSource,
      certified_owner: 'business_intelligence_engine',
      recommended_action: rec.action || 'Review this opportunity with your advisor',
      action_url: null,
    });
  }
}

// ── Risks ─────────────────────────────────────────────────────────────────────
function addRisks(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const bis = input.bis;
  if (!bis) return;

  // Read from BIE health assessment (NOT recalculated)
  const health = bis._health;
  if (health && health.atRiskMetrics) {
    for (const metric of health.atRiskMetrics.slice(0, 3)) {
      items.push({
        id: `risk_${metric.id || items.length}`,
        title: `${metric.displayName || metric.name || 'Metric'} at risk`,
        description: metric.reason || metric.warning || 'This metric needs attention',
        category: 'risk' as WhatMattersCategory,
        priority: 3,
        confidence_source: 'certified_engine_output' as ConfidenceSource,
        certified_owner: 'business_intelligence_engine',
        recommended_action: 'Review the underlying data and consider corrective action',
        action_url: null,
      });
    }
  }

  // Read from confidence scores (low confidence = risk)
  const confidence = input.confidence_scores;
  if (confidence && confidence.overall_confidence != null && confidence.overall_confidence < 60) {
    items.push({
      id: `risk_low_confidence`,
      title: 'Business intelligence confidence is low',
      description: `Overall confidence is ${Math.round(confidence.overall_confidence)}/100. Completing assessments and uploading documents will improve confidence.`,
      category: 'risk' as WhatMattersCategory,
      priority: 4,
      confidence_source: 'certified_engine_output' as ConfidenceSource,
      certified_owner: 'confidence_engine',
      recommended_action: 'Complete outstanding assessments or upload financial documents',
      action_url: '/upload',
    });
  }
}

// ── Advisor Tasks ─────────────────────────────────────────────────────────────
function addAdvisorTasks(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const pendingReviews = input.pending_reviews || [];
  for (const review of pendingReviews.slice(0, 5)) {
    items.push({
      id: `advisor_task_${review.id || items.length}`,
      title: review.title || 'Pending advisor review',
      description: review.description || review.reason || 'Requires advisor attention',
      category: 'advisor_task' as WhatMattersCategory,
      priority: 2,
      confidence_source: 'advisor_reviewed_conclusion' as ConfidenceSource,
      certified_owner: 'verification_queue',
      recommended_action: 'Review in the Verification Queue',
      action_url: '/advisory/valuation',
    });
  }
}

// ── Owner Tasks ───────────────────────────────────────────────────────────────
function addOwnerTasks(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const sprint = input.sprint_data;
  if (sprint && sprint.status === 'active') {
    // Read from sprint tasks (NOT recalculated)
    const tasks = sprint.tasks || [];
    const pendingTasks = tasks.filter((t: any) => t.status !== 'completed').slice(0, 3);
    for (const task of pendingTasks) {
      items.push({
        id: `owner_task_${task.id || items.length}`,
        title: task.title || 'Sprint task pending',
        description: task.description || '',
        category: 'owner_task' as WhatMattersCategory,
        priority: 5,
        confidence_source: 'certified_engine_output' as ConfidenceSource,
        certified_owner: 'sprint_aggregation',
        recommended_action: 'Complete this sprint task',
        action_url: '/dashboard',
      });
    }
  }
}

// ── Upcoming Events ───────────────────────────────────────────────────────────
function addUpcomingEvents(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const deadlines = input.upcoming_deadlines || [];
  const now = Date.now();

  for (const deadline of deadlines.slice(0, 5)) {
    const dueDate = new Date(deadline.due_date || deadline.booking_date || deadline.end_date).getTime();
    const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) continue; // Skip past deadlines

    let priority = 6;
    if (daysUntil <= 3) priority = 2;
    else if (daysUntil <= 7) priority = 3;
    else if (daysUntil <= 14) priority = 4;

    items.push({
      id: `event_${deadline.id || items.length}`,
      title: deadline.title || 'Upcoming deadline',
      description: `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
      category: 'upcoming_event' as WhatMattersCategory,
      priority,
      confidence_source: 'certified_engine_output' as ConfidenceSource,
      certified_owner: deadline.certified_owner || 'calendar_sync',
      recommended_action: 'Prepare for this deadline',
      action_url: deadline.action_url || null,
    });
  }
}

// ── Business Changes ─────────────────────────────────────────────────────────
function addBusinessChanges(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const events = input.recent_events || [];
  const significantEvents = events.filter((e: any) =>
    e.conflict_status === 'conflicting' ||
    (e.new_confidence != null && e.new_confidence < 65) ||
    e.governance_classification === 'verification_required'
  ).slice(0, 3);

  for (const event of significantEvents) {
    items.push({
      id: `change_${event.id || items.length}`,
      title: `Business change: ${event.fact_key || 'unknown'} ${event.conflict_status === 'conflicting' ? 'conflict' : 'low confidence'}`,
      description: event.reason || 'A business fact change requires attention',
      category: 'business_change' as WhatMattersCategory,
      priority: 3,
      confidence_source: 'business_intelligence_synthesis' as ConfidenceSource,
      certified_owner: 'cbss',
      recommended_action: 'Review the change and resolve any conflicts',
      action_url: null,
    });
  }
}

// ── Verification Items ───────────────────────────────────────────────────────
function addVerificationItems(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const pendingReviews = input.pending_reviews || [];
  const conflicts = pendingReviews.filter((r: any) =>
    r.review_type === 'conflict' || r.type === 'conflict'
  ).slice(0, 3);

  for (const conflict of conflicts) {
    items.push({
      id: `verify_${conflict.id || items.length}`,
      title: conflict.title || 'Verification needed',
      description: conflict.description || 'A conflict requires advisor resolution',
      category: 'verification_item' as WhatMattersCategory,
      priority: 1, // Highest priority — conflicts block propagation
      confidence_source: 'advisor_reviewed_conclusion' as ConfidenceSource,
      certified_owner: 'verification_queue',
      recommended_action: 'Resolve in the Verification Queue',
      action_url: '/advisory/valuation',
    });
  }
}

// ── Growth Opportunities ────────────────────────────────────────────────────
function addGrowthOpportunities(items: WhatMattersNowItem[], input: LivingIntelligenceInput): void {
  const initiatives = input.growth_initiatives || [];
  const approvedInitiatives = initiatives.filter((i: any) =>
    i.status === 'approved' || i.status === 'candidate'
  ).slice(0, 3);

  for (const initiative of approvedInitiatives) {
    items.push({
      id: `growth_${initiative.id || items.length}`,
      title: initiative.title || initiative.name || 'Growth initiative',
      description: initiative.description || initiative.rationale || '',
      category: 'growth_opportunity' as WhatMattersCategory,
      priority: 6,
      confidence_source: 'certified_engine_output' as ConfidenceSource,
      certified_owner: 'growth_plan_engine',
      recommended_action: 'Review with your advisor and consider for next sprint',
      action_url: '/advisory/business-valuation',
    });
  }
}