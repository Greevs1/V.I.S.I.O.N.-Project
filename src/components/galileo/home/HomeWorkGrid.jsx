/**
 * HomeWorkGrid — Active Work beside Recent Activity. A column with no real data
 * is dropped rather than shown empty, and the other takes the full width.
 */

import React from 'react';
import ActiveWorkPanel from './ActiveWorkPanel';
import RecentActivityPanel from './RecentActivityPanel';

export default function HomeWorkGrid({ sprints, opportunities, activities, onOpenSprint, onOpenOpportunities, onOpenActivity }) {
  const hasWork = sprints.length > 0 || opportunities.some((o) => (o.status || 'available') === 'available');
  const hasActivity = activities.length > 0;
  if (!hasWork && !hasActivity) return null;

  return (
    <div className={`grid gap-7 ${hasWork && hasActivity ? 'lg:grid-cols-[1.15fr_1fr]' : 'grid-cols-1'}`}>
      {hasWork && (
        <ActiveWorkPanel
          sprints={sprints}
          opportunities={opportunities}
          onOpenSprint={onOpenSprint}
          onOpenOpportunities={onOpenOpportunities}
        />
      )}
      {hasActivity && <RecentActivityPanel activities={activities} onOpen={onOpenActivity} />}
    </div>
  );
}