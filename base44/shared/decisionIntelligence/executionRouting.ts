/**
 * decisionIntelligence/executionRouting.ts — Phase D
 *
 * Maps confirmed decisions to existing execution systems.
 *
 * Decision Intelligence owns decision context.
 * Existing systems own execution.
 *
 * Routes:
 *   pricing       → growth_plan / sprint
 *   talent        → growth_plan / roadmap
 *   growth        → growth_plan / sprint
 *   acquisition   → exit_workflow / valuation
 *   exit          → exit_workflow / valuation
 *   capital_allocation → growth_plan / sprint
 *   tax           → tax_workflow
 *   ownership     → exit_workflow / valuation
 *   financial     → growth_plan / sprint
 *   operating     → sprint / roadmap
 *   risk          → roadmap
 *   technology    → growth_plan / sprint
 *   strategic     → growth_plan
 */

import type {
  BusinessDecision,
  ExecutionRoute,
  ExecutionRouteType,
  DecisionType,
} from './types.ts';

const ROUTE_MAP: Record<DecisionType, ExecutionRouteType[]> = {
  strategic: ['growth_plan', 'sprint'],
  financial: ['growth_plan', 'sprint'],
  operating: ['sprint', 'roadmap'],
  talent: ['growth_plan', 'roadmap'],
  capital_allocation: ['growth_plan', 'sprint'],
  acquisition: ['exit_workflow', 'valuation'],
  exit: ['exit_workflow', 'valuation'],
  pricing: ['growth_plan', 'sprint'],
  growth: ['growth_plan', 'sprint'],
  risk: ['roadmap'],
  ownership: ['exit_workflow', 'valuation'],
  tax: ['tax_workflow'],
  technology: ['growth_plan', 'sprint'],
  other: ['growth_plan'],
};

const ROUTE_LABELS: Record<ExecutionRouteType, string> = {
  growth_plan: 'Growth Plan',
  sprint: '90-Day Sprint',
  roadmap: 'Roadmap',
  document_request: 'Document Request',
  verification_queue: 'Verification Queue',
  valuation: 'Valuation',
  exit_workflow: 'Exit Workflow',
  tax_workflow: 'Tax Workflow',
  none: 'No Route',
};

const ROUTE_URLS: Record<ExecutionRouteType, string> = {
  growth_plan: '/advisory/business-valuation',
  sprint: '/dashboard',
  roadmap: '/dashboard',
  document_request: '/document-requests',
  verification_queue: '/advisory/command-center',
  valuation: '/advisory/business-valuation',
  exit_workflow: '/advisory/exit-readiness',
  tax_workflow: '/assessments/tax-gap',
  none: null,
};

/**
 * Determine execution routes for a confirmed decision.
 */
export function determineExecutionRoutes(
  decision: BusinessDecision,
): ExecutionRoute[] {
  const routeTypes = ROUTE_MAP[decision.decision_type] || ['growth_plan'];

  return routeTypes.map((routeType) => ({
    route_type: routeType,
    description: `Route to ${ROUTE_LABELS[routeType]} for execution`,
    action_url: ROUTE_URLS[routeType],
    routed_at: null,
    routed_by: null,
  }));
}

/**
 * Mark routes as routed (after the decision is confirmed).
 */
export function markRoutesRouted(
  routes: ExecutionRoute[],
  routedBy: string,
): ExecutionRoute[] {
  const now = new Date().toISOString();
  return routes.map((route) => ({
    ...route,
    routed_at: route.routed_at || now,
    routed_by: route.routed_by || routedBy,
  }));
}

/**
 * Get the primary route for a decision (first route).
 */
export function getPrimaryRoute(routes: ExecutionRoute[]): ExecutionRoute | null {
  return routes[0] || null;
}

/**
 * Get route label for display.
 */
export function getRouteLabel(routeType: ExecutionRouteType): string {
  return ROUTE_LABELS[routeType];
}