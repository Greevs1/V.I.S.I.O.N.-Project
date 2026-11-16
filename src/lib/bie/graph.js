/**
 * Intelligence Graph
 *
 * Formalizes relationships between business metrics.
 * Each metric knows its parents (what it depends on) and children (what depends on it).
 *
 * Example chain:
 *   Revenue → Margin → EBITDA → Business Value → IQ Score → Business Impact
 *
 * The graph is static (defined at module load) — it describes the structural
 * relationships between metric IDs. The engine populates actual values at runtime.
 */

// ── Graph edges (parent → child) ──────────────────────────────────────────────
// Each entry: { from, to, relationship }
// "from" is the parent (dependency), "to" is the child (dependent)

const EDGES = [
  // Revenue feeds into multiple metrics
  { from: 'revenue',                to: 'profit_gap_amount',        relationship: 'informs' },
  { from: 'revenue',                to: 'value_gap_amount',         relationship: 'informs' },
  { from: 'revenue',                to: 'current_value',            relationship: 'informs' },

  // Profit chain
  { from: 'profit_gap_amount',      to: 'business_impact_score',    relationship: 'contributes' },
  { from: 'profit_score',           to: 'iq_score',                 relationship: 'contributes' },

  // Value chain
  { from: 'value_gap_amount',       to: 'business_impact_score',    relationship: 'contributes' },
  { from: 'current_value',          to: 'potential_value',          relationship: 'baseline' },
  { from: 'potential_value',        to: 'value_gap_amount',         relationship: 'target' },

  // Tax chain
  { from: 'tax_gap_annual',         to: 'tax_gap_ten_year',         relationship: 'compounds' },
  { from: 'tax_gap_annual',         to: 'business_impact_score',    relationship: 'contributes' },
  { from: 'tax_strategy_count',     to: 'tax_gap_annual',          relationship: 'informs' },

  // Operations chain
  { from: 'operations_score',       to: 'business_impact_score',    relationship: 'contributes' },
  { from: 'monthly_take_home',      to: 'hourly_value_of_time_freed', relationship: 'derives' },
  { from: 'hours_worked_per_week',  to: 'hourly_value_of_time_freed', relationship: 'derives' },
  { from: 'hourly_value_of_time_freed', to: 'monthly_value_of_time_freed', relationship: 'derives' },
  { from: 'hours_freed_per_week',   to: 'monthly_value_of_time_freed', relationship: 'derives' },

  // Recast EBITDA chain
  { from: 'recast_add_backs',       to: 'recast_valuation_increase', relationship: 'derives' },
  { from: 'recast_valuation_increase', to: 'potential_value',       relationship: 'contributes' },

  // Freedom chain
  { from: 'freedom_score',          to: 'business_impact_score',    relationship: 'contributes' },

  // Intelligence aggregation
  { from: 'profit_gap_amount',      to: 'iq_score',                 relationship: 'contributes' },
  { from: 'value_gap_amount',       to: 'iq_score',                 relationship: 'contributes' },
  { from: 'tax_gap_annual',         to: 'iq_score',                 relationship: 'contributes' },
  { from: 'operations_score',       to: 'iq_score',                 relationship: 'contributes' },
  { from: 'freedom_score',          to: 'iq_score',                 relationship: 'contributes' },
  { from: 'iq_score',               to: 'business_impact_score',   relationship: 'contributes' },
];

// ── Build adjacency maps ──────────────────────────────────────────────────────

const childrenMap = {};  // id → [child ids]
const parentsMap  = {};  // id → [parent ids]

for (const edge of EDGES) {
  if (!childrenMap[edge.from]) childrenMap[edge.from] = [];
  if (!parentsMap[edge.to])   parentsMap[edge.to]   = [];
  childrenMap[edge.from].push(edge.to);
  parentsMap[edge.to].push(edge.from);
}

// ── Systems that consume metrics ──────────────────────────────────────────────

const SYSTEM_CONSUMERS = {
  profit_gap_amount:        ['dashboard', 'executive_briefing', 'scenario_builder', 'sprint', 'galileo'],
  value_gap_amount:         ['dashboard', 'executive_briefing', 'scenario_builder', 'sprint', 'galileo'],
  tax_gap_annual:           ['dashboard', 'executive_briefing', 'scenario_builder', 'sprint', 'galileo'],
  tax_gap_ten_year:         ['dashboard', 'executive_briefing', 'cost_of_inaction'],
  operations_score:         ['dashboard', 'executive_briefing', 'sprint', 'galileo'],
  monthly_take_home:        ['dashboard', 'scenario_builder'],
  hours_worked_per_week:    ['dashboard', 'scenario_builder'],
  hourly_value_of_time_freed: ['dashboard', 'executive_briefing', 'sprint'],
  monthly_value_of_time_freed: ['dashboard', 'executive_briefing', 'sprint'],
  hours_freed_per_week:     ['dashboard', 'scenario_builder', 'sprint'],
  recast_add_backs:         ['dashboard', 'executive_briefing', 'advisor_workspace'],
  recast_valuation_increase: ['dashboard', 'executive_briefing', 'scenario_builder'],
  freedom_score:            ['dashboard', 'executive_briefing', 'sprint', 'galileo'],
  iq_score:                 ['dashboard', 'executive_briefing', 'galileo'],
  business_impact_score:    ['dashboard', 'executive_briefing'],
  revenue:                  ['dashboard', 'scenario_builder', 'galileo'],
  current_value:            ['dashboard', 'scenario_builder', 'advisor_workspace'],
  potential_value:          ['dashboard', 'scenario_builder', 'advisor_workspace'],
  profit_score:             ['dashboard'],
  tax_strategy_count:       ['dashboard', 'sprint'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * IntelligenceGraph — static relationship structure.
 */
export const IntelligenceGraph = {
  edges: EDGES,

  getParents(metricId) {
    return parentsMap[metricId] || [];
  },

  getChildren(metricId) {
    return childrenMap[metricId] || [];
  },

  getDependents(metricId) {
    // Same as children — metrics that depend on this one
    return childrenMap[metricId] || [];
  },

  getDependencies(metricId) {
    // Same as parents — metrics this one depends on
    return parentsMap[metricId] || [];
  },

  getConsumers(metricId) {
    return SYSTEM_CONSUMERS[metricId] || [];
  },

  /**
   * Walk the graph upward from a metric to find all ancestors.
   */
  getAncestors(metricId, visited = new Set()) {
    if (visited.has(metricId)) return [];
    visited.add(metricId);
    const parents = parentsMap[metricId] || [];
    let ancestors = [...parents];
    for (const p of parents) {
      ancestors = ancestors.concat(this.getAncestors(p, visited));
    }
    return [...new Set(ancestors)];
  },

  /**
   * Walk the graph downward to find all descendants.
   */
  getDescendants(metricId, visited = new Set()) {
    if (visited.has(metricId)) return [];
    visited.add(metricId);
    const children = childrenMap[metricId] || [];
    let descendants = [...children];
    for (const c of children) {
      descendants = descendants.concat(this.getDescendants(c, visited));
    }
    return [...new Set(descendants)];
  },

  /**
   * Returns the full chain from revenue to business impact.
   */
  getImpactChain() {
    return ['revenue', 'profit_gap_amount', 'ebitda', 'current_value', 'iq_score', 'business_impact_score'];
  },

  /**
   * All metric IDs in the graph.
   */
  getAllMetricIds() {
    return [...new Set([...Object.keys(childrenMap), ...Object.keys(parentsMap)])];
  },
};

export default IntelligenceGraph;