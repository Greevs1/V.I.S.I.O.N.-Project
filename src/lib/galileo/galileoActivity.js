/**
 * Galileo Activity — "Galileo did this" concept.
 *
 * Producer mode becomes more valuable if Galileo can complete work.
 * In Phase 5, only surface activities that the existing system actually
 * performed. Do not fake autonomous work.
 *
 * Examples:
 *   - Analyzed August financials
 *   - Updated valuation
 *   - Prepared CPA brief
 *   - Compared pricing scenarios
 *   - Drafted action plan
 *
 * NOT a noisy activity feed. Galileo may summarize:
 *   "I completed three things since your last visit."
 *   [Review]
 */

/**
 * getRecentActivities — returns recent Galileo-completed activities.
 *
 * In Phase 5, this derives from real system events:
 *   - Document analysis completions
 *   - Valuation updates
 *   - Opportunity detections
 *   - Sprint progress updates
 *
 * @param {object} ctx — { recentDocuments, recentValuations, recentOpportunities, lastVisitDate }
 * @returns {array} — recent activities, most recent first
 */
export function getRecentActivities(ctx = {}) {
  const {
    recentDocuments = [],
    recentValuations = [],
    recentOpportunities = [],
    recentSprintProgress = [],
    lastVisitDate = null,
  } = ctx;

  const activities = [];
  const since = lastVisitDate ? new Date(lastVisitDate) : new Date(0);

  // Document analysis completions (BIS recent_documents or raw entity)
  for (const doc of recentDocuments) {
    const docStatus = doc.status || doc.upload_status;
    const docTimestamp = doc.completed_at || doc.created_at;
    if (docStatus === 'completed' && docTimestamp) {
      const completedAt = new Date(docTimestamp);
      if (completedAt > since) {
        activities.push({
          id: `doc_${doc.id}`,
          type: 'document_analyzed',
          title: `Analyzed ${doc.name || 'financial document'}`,
          timestamp: docTimestamp,
          actionLabel: 'See what Galileo found',
          actionValue: { type: 'document', id: doc.id },
        });
      }
    }
  }

  // Valuation updates
  for (const val of recentValuations) {
    const valTimestamp = val.updated_date || val.updatedAt;
    if (valTimestamp) {
      const updatedAt = new Date(valTimestamp);
      if (updatedAt > since) {
        activities.push({
          id: `val_${val.id}`,
          type: 'valuation_updated',
          title: 'Updated valuation',
          timestamp: valTimestamp,
          actionLabel: 'See what changed',
          actionValue: { type: 'valuation', id: val.id },
        });
      }
    }
  }

  // New opportunities detected (normalized or raw entity)
  for (const opp of recentOpportunities) {
    const oppTimestamp = opp.created_date || opp.createdAt;
    if (oppTimestamp) {
      const createdAt = new Date(oppTimestamp);
      if (createdAt > since) {
        activities.push({
          id: `opp_${opp.id}`,
          type: 'opportunity_detected',
          title: `Found new opportunity: ${opp.title || 'worth investigating'}`,
          timestamp: oppTimestamp,
          actionLabel: 'Investigate',
          actionValue: { type: 'opportunity', id: opp.id },
        });
      }
    }
  }

  // Sprint progress (normalized play or raw entity)
  for (const sprint of recentSprintProgress) {
    const sprintTimestamp = sprint.last_galileo_update_at || sprint.lastGalileoUpdate || sprint.updatedAt;
    const sprintTitle = sprint.path_title || sprint.title || 'sprint';
    if (sprintTimestamp) {
      const updatedAt = new Date(sprintTimestamp);
      if (updatedAt > since) {
        activities.push({
          id: `sprint_${sprint.id}`,
          type: 'sprint_progress',
          title: `Updated your ${sprintTitle}`,
          timestamp: sprintTimestamp,
          actionLabel: 'Continue',
          actionValue: { type: 'sprint', id: sprint.id },
        });
      }
    }
  }

  // Sort by timestamp descending
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return activities;
}

/**
 * summarizeActivities — returns a brief summary for the home surface.
 * "I completed three things since your last visit."
 */
export function summarizeActivities(activities) {
  if (!activities || activities.length === 0) return null;

  const count = activities.length;
  const recent = activities[0];

  return {
    count,
    message: count === 1
      ? `I completed one thing since your last visit.`
      : `I completed ${count} things since your last visit.`,
    latest: recent,
  };
}

/**
 * getActivityIcon — returns the icon type for an activity.
 */
export function getActivityIcon(activity) {
  switch (activity?.type) {
    case 'document_analyzed': return 'FileText';
    case 'valuation_updated': return 'TrendingUp';
    case 'opportunity_detected': return 'Target';
    case 'sprint_progress': return 'ClipboardList';
    default: return 'Sparkles';
  }
}