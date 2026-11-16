/**
 * growthPlanEngine — Phase 13.3E.5
 *
 * Pure, deterministic engine for the Growth Plan workspace. Organizes
 * approved value drivers, detractors, risks, opportunities, missing evidence,
 * and candidate initiatives into a structured advisor preparation environment.
 *
 * This is NOT the Phase 13.4 Institutional Decision Engine. It is a
 * preparation layer that:
 *   - Derives candidate initiatives from valuation findings
 *   - Supports advisor-created initiatives
 *   - Provides an Advisor Prioritization Preview (advisor-controlled)
 *   - Preserves the Value Creation Chain of Custody
 *   - Filters client-safe content
 *
 * No Roadmap or 90-Day Sprint records are created automatically.
 * No unsupported impact is fabricated.
 */
import { IMPACT_NOT_QUANTIFIABLE } from './insightsEngine';

// ── Initiative groups ─────────────────────────────────────────────────────
export const INITIATIVE_GROUPS = [
  { key: 'ebitda_growth', label: 'EBITDA Growth', icon: 'TrendingUp' },
  { key: 'multiple_expansion', label: 'Multiple Expansion', icon: 'Expand' },
  { key: 'risk_reduction', label: 'Risk Reduction', icon: 'Shield' },
  { key: 'transferability', label: 'Transferability', icon: 'Users' },
  { key: 'financial_quality', label: 'Financial Quality', icon: 'BarChart3' },
  { key: 'operational_quality', label: 'Operational Quality', icon: 'Settings' },
  { key: 'commercial_quality', label: 'Commercial Quality', icon: 'ShoppingCart' },
  { key: 'leadership', label: 'Leadership', icon: 'UserCheck' },
  { key: 'governance', label: 'Governance', icon: 'Scale' },
  { key: 'confidence_documentation', label: 'Confidence and Documentation', icon: 'FileCheck' },
];

// ── Status model ──────────────────────────────────────────────────────────
export const INITIATIVE_STATUSES = [
  { key: 'candidate', label: 'Candidate', color: '#6B7280', order: 0 },
  { key: 'needs_evidence', label: 'Needs Evidence', color: '#F59E0B', order: 1 },
  { key: 'advisor_review', label: 'Advisor Review', color: '#00D4FF', order: 2 },
  { key: 'approved', label: 'Approved', color: '#D4A853', order: 3 },
  { key: 'client_visible', label: 'Client Visible', color: '#A855F7', order: 4 },
  { key: 'deferred', label: 'Deferred', color: '#6B7280', order: 5 },
  { key: 'ready_for_execution', label: 'Ready for Execution', color: '#22c55e', order: 6 },
  { key: 'sent_to_roadmap', label: 'Sent to Roadmap', color: '#00D4FF', order: 7 },
  { key: 'sent_to_sprint', label: 'Sent to 90-Day Sprint', color: '#00D4FF', order: 8 },
  { key: 'completed', label: 'Completed', color: '#22c55e', order: 9 },
  { key: 'rejected', label: 'Rejected', color: '#EF4444', order: 10 },
];

export const ACTIVE_STATUSES = ['candidate', 'needs_evidence', 'advisor_review', 'approved', 'client_visible', 'ready_for_execution'];
export const CLIENT_VISIBLE_STATUSES = ['client_visible', 'ready_for_execution', 'sent_to_roadmap', 'sent_to_sprint', 'completed'];

// ── Difficulty levels ─────────────────────────────────────────────────────
export const DIFFICULTY_LEVELS = ['Low', 'Medium', 'High', 'Very High'];

// ── Derive candidate initiatives from valuation findings ──────────────────
// Maps Build Value findings + detractors to structured initiative candidates.
// These are CANDIDATES — not approved initiatives. The advisor reviews and
// approves them.
export function deriveCandidateInitiatives({ intelligence, calcSummary, topDetractors, fastestWins }) {
  const candidates = [];

  // From detractors — each detractor can suggest a corrective initiative
  topDetractors.forEach((d) => {
    if (d.source === 'blocker' || d.source === 'conflict') return; // these are validation items, not initiatives
    const group = mapDetractorToGroup(d);
    candidates.push({
      initiative_id: `init_${d.id}`,
      name: deriveInitiativeName(d),
      summary: d.why_it_matters || d.current_issue,
      business_problem: d.current_issue || d.name,
      supporting_value_driver: d.source === 'value_driver' ? d.id : null,
      build_value_dimension: d.dimension_key || null,
      source_finding: d.id,
      evidence: d.evidence,
      ebitda_relevance: d.ebitda_effect || d.ebitda_relevance || '—',
      multiple_relevance: d.multiple_effect || d.multiple_relevance || '—',
      transferability_relevance: d.transferability_effect || d.transferability_relevance || '—',
      risk_relevance: d.risk_effect || 'High',
      confidence_relevance: 'Moderate',
      estimated_ebitda_impact: null,
      estimated_multiple_impact: null,
      estimated_ev_impact: null,
      estimated_ev_impact_label: IMPACT_NOT_QUANTIFIABLE,
      estimated_cost: null,
      expected_roi: null,
      timeline: '3-6 months',
      difficulty: 'Medium',
      confidence: d.confidence || 50,
      dependencies: [],
      responsible_role: 'Advisor',
      kpi: null,
      baseline: null,
      target: null,
      verification_method: null,
      status: 'candidate',
      client_visible: false,
      execution_readiness: 'Not Ready',
      notes: '',
      group,
      source: 'derived',
    });
  });

  // From fastest wins — map to candidate initiatives with short timeline
  fastestWins.forEach((w) => {
    candidates.push({
      initiative_id: `init_${w.id}`,
      name: w.name,
      summary: w.why_fast_win,
      business_problem: w.name,
      supporting_value_driver: null,
      build_value_dimension: null,
      source_finding: w.id,
      evidence: w.required_evidence,
      ebitda_relevance: w.ebitda_relevance || '—',
      multiple_relevance: w.multiple_relevance || '—',
      transferability_relevance: '—',
      risk_relevance: 'Low',
      confidence_relevance: w.confidence_improvement || 'Moderate',
      estimated_ebitda_impact: null,
      estimated_multiple_impact: null,
      estimated_ev_impact: null,
      estimated_ev_impact_label: IMPACT_NOT_QUANTIFIABLE,
      estimated_cost: null,
      expected_roi: null,
      timeline: w.timeline,
      difficulty: w.difficulty,
      confidence: w.confidence,
      dependencies: w.dependencies || [],
      responsible_role: 'Advisor',
      kpi: null,
      baseline: null,
      target: null,
      verification_method: null,
      status: 'candidate',
      client_visible: false,
      execution_readiness: 'Not Ready',
      notes: '',
      group: 'confidence_documentation',
      source: 'fast_win',
      link_to_validate: w.link_to_validate,
    });
  });

  return candidates;
}

function mapDetractorToGroup(d) {
  if (d.dimension_key === 'financial_quality') return 'financial_quality';
  if (d.dimension_key === 'operational_quality') return 'operational_quality';
  if (d.dimension_key === 'commercial_quality') return 'commercial_quality';
  if (d.dimension_key === 'leadership_transferability') return 'transferability';
  if (d.dimension_key === 'risk_governance') return 'risk_reduction';
  if (d.ebitda_effect === 'Primary' || d.ebitda_effect === 'High') return 'ebitda_growth';
  if (d.multiple_effect === 'Primary' || d.multiple_effect === 'High') return 'multiple_expansion';
  return 'confidence_documentation';
}

function deriveInitiativeName(d) {
  const issue = d.name || d.current_issue || '';
  // Generate a corrective action name
  if (issue.toLowerCase().includes('owner depend')) return 'Reduce Owner Dependency';
  if (issue.toLowerCase().includes('customer concentrat')) return 'Diversify Customer Base';
  if (issue.toLowerCase().includes('vendor concentrat')) return 'Diversify Vendor Base';
  if (issue.toLowerCase().includes('margin')) return 'Improve Margin Stability';
  if (issue.toLowerCase().includes('reporting')) return 'Strengthen Financial Reporting';
  if (issue.toLowerCase().includes('contract')) return 'Document Customer Contracts';
  if (issue.toLowerCase().includes('key person') || issue.toLowerCase().includes('key-person')) return 'Reduce Key-Person Risk';
  if (issue.toLowerCase().includes('forecast')) return 'Improve Forecasting Process';
  if (issue.toLowerCase().includes('working capital')) return 'Optimize Working Capital';
  if (issue.toLowerCase().includes('legal')) return 'Resolve Legal Exposure';
  if (issue.toLowerCase().includes('tax')) return 'Resolve Tax Exposure';
  if (issue.toLowerCase().includes('leadership')) return 'Strengthen Leadership Team';
  if (issue.toLowerCase().includes('recurring revenue')) return 'Build Recurring Revenue';
  if (issue.toLowerCase().includes('sop')) return 'Document Standard Operating Procedures';
  return `Address: ${issue}`;
}

// ── Chain of Custody ──────────────────────────────────────────────────────
// Preserves the beginning of the approved chain:
// Initiative → Value Driver → Build Value Dimension → Business Capability →
// Operational Lever → Financial Impact → Valuation Method Impact →
// Expected EV Relevance → KPI → Verification Method
export function buildChainOfCustody(initiative, { topDrivers, buildValue }) {
  const chain = [];

  // 1. Initiative
  chain.push({ label: 'Initiative', value: initiative.name, level: 0 });

  // 2. Supporting Value Driver
  if (initiative.supporting_value_driver) {
    const driver = topDrivers?.find((d) => d.id === initiative.supporting_value_driver);
    chain.push({ label: 'Value Driver', value: driver?.name || initiative.supporting_value_driver, level: 1 });
  } else {
    chain.push({ label: 'Value Driver', value: '—', level: 1 });
  }

  // 3. Build Value Dimension
  if (initiative.build_value_dimension) {
    const dim = buildValue?.scorecards?.find((s) => s.key === initiative.build_value_dimension);
    chain.push({ label: 'Build Value Dimension', value: dim?.label || initiative.build_value_dimension, level: 2 });
  } else {
    chain.push({ label: 'Build Value Dimension', value: '—', level: 2 });
  }

  // 4. Business Capability
  chain.push({ label: 'Business Capability', value: initiative.group ? INITIATIVE_GROUPS.find((g) => g.key === initiative.group)?.label : '—', level: 3 });

  // 5. Operational Lever
  chain.push({ label: 'Operational Lever', value: initiative.business_problem || '—', level: 4 });

  // 6. Financial Impact
  chain.push({
    label: 'Financial Impact',
    value: initiative.estimated_ebitda_impact != null
      ? `EBITDA: ${initiative.estimated_ebitda_impact}`
      : initiative.estimated_ev_impact_label || IMPACT_NOT_QUANTIFIABLE,
    level: 5,
  });

  // 7. Valuation Method Impact
  chain.push({
    label: 'Valuation Method Impact',
    value: initiative.multiple_relevance !== '—' ? `Multiple: ${initiative.multiple_relevance}` : '—',
    level: 6,
  });

  // 8. Expected EV Relevance
  chain.push({ label: 'Expected EV Relevance', value: initiative.estimated_ev_impact_label || IMPACT_NOT_QUANTIFIABLE, level: 7 });

  // 9. KPI
  chain.push({ label: 'KPI', value: initiative.kpi || '—', level: 8 });

  // 10. Verification Method
  chain.push({ label: 'Verification Method', value: initiative.verification_method || '—', level: 9 });

  return chain;
}

// ── Prioritization ────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { key: 'ev_relevance', label: 'Enterprise Value Relevance' },
  { key: 'ebitda_relevance', label: 'EBITDA Relevance' },
  { key: 'multiple_relevance', label: 'Multiple Relevance' },
  { key: 'risk_reduction', label: 'Risk Reduction' },
  { key: 'time_to_value', label: 'Time to Value' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'estimated_cost', label: 'Estimated Cost' },
  { key: 'dependencies', label: 'Dependency Count' },
  { key: 'execution_readiness', label: 'Execution Readiness' },
];

const RELEVANCE_ORDER = { Primary: 0, High: 1, Moderate: 2, Low: 3, '—': 4 };
const DIFFICULTY_ORDER = { Low: 0, Medium: 1, High: 2, 'Very High': 3 };
const READINESS_ORDER = { Ready: 0, 'Nearly Ready': 1, 'Not Ready': 2 };

export function sortInitiatives(initiatives, sortBy) {
  const sorted = [...initiatives];
  switch (sortBy) {
    case 'ev_relevance':
      sorted.sort((a, b) => (RELEVANCE_ORDER[a.ebitda_relevance] ?? 9) - (RELEVANCE_ORDER[b.ebitda_relevance] ?? 9));
      break;
    case 'ebitda_relevance':
      sorted.sort((a, b) => (RELEVANCE_ORDER[a.ebitda_relevance] ?? 9) - (RELEVANCE_ORDER[b.ebitda_relevance] ?? 9));
      break;
    case 'multiple_relevance':
      sorted.sort((a, b) => (RELEVANCE_ORDER[a.multiple_relevance] ?? 9) - (RELEVANCE_ORDER[b.multiple_relevance] ?? 9));
      break;
    case 'risk_reduction':
      sorted.sort((a, b) => (RELEVANCE_ORDER[a.risk_relevance] ?? 9) - (RELEVANCE_ORDER[b.risk_relevance] ?? 9));
      break;
    case 'time_to_value':
      sorted.sort((a, b) => (a.timeline || 'zzz').localeCompare(b.timeline || 'zzz'));
      break;
    case 'difficulty':
      sorted.sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 9) - (DIFFICULTY_ORDER[b.difficulty] ?? 9));
      break;
    case 'confidence':
      sorted.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      break;
    case 'estimated_cost':
      sorted.sort((a, b) => (a.estimated_cost || Infinity) - (b.estimated_cost || Infinity));
      break;
    case 'dependencies':
      sorted.sort((a, b) => (a.dependencies?.length || 0) - (b.dependencies?.length || 0));
      break;
    case 'execution_readiness':
      sorted.sort((a, b) => (READINESS_ORDER[a.execution_readiness] ?? 9) - (READINESS_ORDER[b.execution_readiness] ?? 9));
      break;
    default:
      break;
  }
  return sorted;
}

export function filterInitiatives(initiatives, filters) {
  return initiatives.filter((init) => {
    if (filters.status && init.status !== filters.status) return false;
    if (filters.group && init.group !== filters.group) return false;
    if (filters.client_visible_only && !CLIENT_VISIBLE_STATUSES.includes(init.status)) return false;
    return true;
  });
}

// ── Client-safe filtering ─────────────────────────────────────────────────
export function toClientSafeInitiatives(initiatives) {
  return initiatives
    .filter((init) => CLIENT_VISIBLE_STATUSES.includes(init.status))
    .map((init) => ({
      initiative_id: init.initiative_id,
      name: init.name,
      summary: init.summary,
      why_it_matters: init.why_it_matters || init.summary,
      expected_outcome: init.expected_outcome || init.target || '—',
      timeline: init.timeline || '—',
      responsible_party: init.responsible_role || '—',
      kpi: init.kpi || '—',
      status: init.status,
      next_milestone: init.next_milestone || init.verification_method || '—',
    }));
}

// ── Growth Plan progress ──────────────────────────────────────────────────
export function computeGrowthPlanProgress(initiatives) {
  if (!initiatives || initiatives.length === 0) {
    return { percent: 0, status: 'not_started', reviewed: 0, approved: 0, client_visible: 0, with_kpi: 0, ready: 0, next_action: 'Review Build Value and Valuation findings before preparing initiatives' };
  }
  const reviewed = initiatives.filter((i) => i.status !== 'candidate').length;
  const approved = initiatives.filter((i) => ['approved', 'client_visible', 'ready_for_execution', 'sent_to_roadmap', 'sent_to_sprint', 'completed'].includes(i.status)).length;
  const clientVisible = initiatives.filter((i) => CLIENT_VISIBLE_STATUSES.includes(i.status)).length;
  const withKpi = initiatives.filter((i) => i.kpi && i.baseline && i.target).length;
  const ready = initiatives.filter((i) => i.execution_readiness === 'Ready').length;

  const total = initiatives.length;
  const percent = Math.round(((reviewed + approved + clientVisible + withKpi + ready) / (total * 5)) * 100);

  let status = 'in_progress';
  let nextAction = 'Review candidate initiatives';
  if (approved === 0 && reviewed > 0) nextAction = 'Approve reviewed initiatives';
  else if (approved > 0 && withKpi < approved) nextAction = 'Add KPI targets to approved initiatives';
  else if (clientVisible === 0 && approved > 0) nextAction = 'Confirm client-visible priorities';
  else if (ready > 0) nextAction = `${ready} initiative${ready !== 1 ? 's' : ''} ready for execution`;
  else if (approved > 0 && clientVisible > 0 && withKpi >= approved) { status = 'ready'; nextAction = 'Growth Plan ready — proceed to Deliverables'; }

  return { percent: Math.min(percent, 100), status, reviewed, approved, client_visible: clientVisible, with_kpi: withKpi, ready, next_action: nextAction };
}