/**
 * expertTaskBrief — builds the Sprint → Expert handoff, the task brief, the
 * relevant intelligence, and the preparation view.
 *
 * RULES OBSERVED HERE
 *  - Only fields that actually exist are assembled. Nothing is invented, and no
 *    new canonical entity is created: this is an in-memory package.
 *  - "What Vision knows" is read from the existing canonical contract
 *    (getBusinessIntelligenceContract) and only for the metric families the
 *    recommended role actually relates to. A missing figure is simply absent.
 *  - The preparation checklist marks something ✓ ONLY when Vision can verify the
 *    underlying fact. Everything else stays ○ Needed.
 */

import { approxMoney } from '@/lib/galileo/moneyFormat';

// Coarse keyword mapping from a role string to the intelligence families that
// matter for it. This is retrieval scoping, not a second taxonomy.
const ROLE_FAMILIES = {
  finance: ['cfo', 'cpa', 'accountant', 'accounting', 'financial', 'finance', 'controller', 'bookkeep', 'advisor'],
  tax: ['tax', 'cpa', 'irs'],
  legal: ['attorney', 'legal', 'lawyer', 'counsel', 'estate', 'patent', 'contract'],
  operations: ['operations', 'process', 'coo', 'eos', 'integrator', 'hr', 'payroll', 'people', 'staff'],
  value: ['exit', 'valuation', 'm&a', 'merger', 'acquisition', 'wealth', 'investment', 'bank', 'financing', 'capital'],
  risk: ['insurance', 'risk', 'protection', 'cyber', 'security'],
};

export function roleFamilies(role) {
  const needle = String(role || '').toLowerCase();
  return Object.entries(ROLE_FAMILIES)
    .filter(([, words]) => words.some((w) => needle.includes(w)))
    .map(([family]) => family);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Each entry reads a REAL contract field. `families` decides relevance.
const FACT_REGISTRY = [
  { label: 'Revenue', families: ['finance', 'tax', 'value'], get: (c) => c?.profitability?.revenue, source: (c) => c?.profitability?.revenue_source, money: true },
  { label: 'Net profit', families: ['finance', 'tax'], get: (c) => c?.profitability?.net_profit, source: (c) => c?.profitability?.net_profit_source, money: true },
  { label: 'Recast EBITDA', families: ['finance', 'value'], get: (c) => c?.profitability?.recast_ebitda, source: (c) => c?.profitability?.recast_ebitda_source, money: true },
  { label: 'Reported EBITDA', families: ['finance', 'value'], get: (c) => c?.profitability?.reported_ebitda, source: (c) => c?.profitability?.reported_ebitda_source, money: true },
  { label: 'Profit gap', families: ['finance'], get: (c) => c?.profitability?.profit_gap, source: (c) => c?.profitability?.profit_gap_source, money: true },
  { label: 'Annual tax gap', families: ['tax'], get: (c) => c?.tax?.annual_tax_gap, source: (c) => c?.tax?.annual_tax_gap_source, money: true },
  { label: 'Operations score', families: ['operations'], get: (c) => c?.operations?.operations_score, source: (c) => c?.operations?.operations_score_source },
  { label: 'Hours freed per week', families: ['operations'], get: (c) => c?.operations?.hours_freed_per_week, source: (c) => c?.operations?.hours_freed_per_week_source },
  { label: 'Current value', families: ['value'], get: (c) => c?.valuation?.current_value, source: (c) => c?.valuation?.current_value_source, money: true },
  { label: 'Potential value', families: ['value'], get: (c) => c?.valuation?.potential_value, source: (c) => c?.valuation?.potential_value_source, money: true },
  { label: 'Value gap', families: ['value'], get: (c) => c?.valuation?.value_gap, source: (c) => c?.valuation?.value_gap_source, money: true },
  { label: 'Entity type', families: ['legal', 'tax'], get: (c) => c?.business_identity?.entity_type },
  { label: 'Industry', families: ['legal', 'operations', 'risk'], get: (c) => c?.business_identity?.industry },
  { label: 'Documents on file', families: ['finance', 'tax', 'legal', 'value', 'risk', 'general'], get: (c) => (c?.document_readiness?.total_documents ? `${c.document_readiness.total_documents}` : null) },
];

/**
 * Only the facts relevant to this role that Vision actually holds.
 * An unrecognised role falls back to the 'general' family (documents, industry)
 * rather than guessing what a "Fractional CFO" would care about.
 */
export function relevantFacts(contract, role) {
  if (!contract) return [];
  const families = roleFamilies(role);
  const scope = families.length ? families : ['general'];

  return FACT_REGISTRY.filter((f) => f.families.some((fam) => scope.includes(fam)))
    .map((f) => {
      const raw = f.get(contract);
      const has = f.money ? isNum(raw) : raw != null && raw !== '';
      if (!has) return null;
      return {
        label: f.label,
        value: f.label === 'Documents on file' ? `${raw} on file` : f.money ? approxMoney(raw) : String(raw),
        source: f.source ? f.source(contract) || null : null,
      };
    })
    .filter(Boolean);
}

/**
 * What the owner should have ready. ✓ only when Vision can verify it, using the
 * canonical contract and the Data Room readiness block. No checklist engine is
 * created: this is a derived view, and the per-task answer comes from Galileo.
 */
export function buildPrepChecklist(contract) {
  const c = contract || null;
  const dr = c?.document_readiness;
  const p = c?.profitability;

  return [
    {
      label: 'Financial documents Vision can see',
      ready: isNum(dr?.total_documents) && dr.total_documents > 0,
      evidence: dr?.latest_financial_period ? `latest period ${dr.latest_financial_period}` : null,
      needed: 'Upload statements to the Data Room',
    },
    {
      label: 'Revenue figures Vision can verify',
      ready: isNum(p?.revenue),
      evidence: p?.revenue_source ? `source: ${p.revenue_source}` : null,
      needed: 'Add verified revenue',
    },
    {
      label: 'Profitability (reported or recast EBITDA)',
      ready: isNum(p?.reported_ebitda) || isNum(p?.recast_ebitda),
      evidence: null,
      needed: 'Complete Recast EBITDA',
    },
    {
      label: 'Valuation baseline',
      ready: c?.valuation?.baseline_status === 'ESTABLISHED' || isNum(c?.valuation?.baseline_value),
      evidence: null,
      needed: 'Establish a baseline valuation',
    },
    {
      label: 'Tax position',
      ready: isNum(c?.tax?.annual_tax_gap),
      evidence: null,
      needed: 'Complete the Tax Gap assessment',
    },
    {
      label: 'Operating metrics',
      ready: isNum(c?.operations?.operations_score),
      evidence: null,
      needed: 'Complete the Operations Gap assessment',
    },
  ];
}

/**
 * The in-memory Expert handoff for entitled owners. Every key is a field that
 * exists on the Sprint task row or the sprint path row — nothing fabricated,
 * no new entity. (Sprint tasks carry no opportunity/strategy id, so none is
 * claimed: the opportunity link lives on the sprint path row.)
 */
export function buildExpertHandoff({ task, sprint, requestedRole, advisor, businessId }) {
  const advisorRow = advisor?.advisor || null;

  return {
    business_id: businessId || sprint?.business_id || task?.business_id || null,
    source: 'ninety_day_sprint',
    sprint_id: task?.sprint_id || sprint?.id || null,
    sprint_task_id: task?.id || null,
    task: {
      title: task?.title || null,
      description: task?.description || null,
      due_date: task?.due_date || null,
      priority: task?.priority || null,
      ease: task?.ease || null,
      impact: task?.impact || null,
      status: task?.status || null,
      estimated_time: task?.estimated_time || null,
      expected_outcome: task?.expected_outcome || null,
    },
    recommended_expert_role: requestedRole || null,
    galileo_reasoning: task?.expert_reason || null,
    expert_priority: task?.expert_priority || null,
    sprint_objective: sprint?.path_goal || sprint?.path_summary || null,
    sprint_expected_outcome: sprint?.expected_outcome || null,
    opportunity_id: sprint?.opportunity_id || null,
    galileo_confidence: isNum(sprint?.galileo_confidence) ? sprint.galileo_confidence : null,
    verification_status: sprint?.verification_status || null,
    business_name: sprint?.business_name || null,
    advisor: advisorRow
      ? {
          profile_id: advisorRow.profile_id || null,
          name: advisorRow.name || null,
          role: advisorRow.role || null,
        }
      : null,
  };
}

/**
 * The context prefix carried into Galileo so it already understands the task.
 * Only real values are included.
 */
export function taskContextText({ task, requestedRole, sprintTitle, businessName }) {
  const bits = [];
  if (businessName) bits.push(`Business: ${businessName}.`);
  if (sprintTitle) bits.push(`90-Day Sprint: "${sprintTitle}".`);
  if (task?.title) bits.push(`Sprint task: "${task.title}".`);
  if (task?.description) bits.push(`Task detail: ${task.description}`);
  if (requestedRole) bits.push(`Galileo recommends a ${requestedRole} for it.`);
  if (task?.expert_reason) bits.push(`Galileo's reason: ${task.expert_reason}`);
  if (task?.expected_outcome) bits.push(`Desired outcome: ${task.expected_outcome}.`);
  return bits.join(' ');
}

/** Best-effort comparison so the surface never claims an advisor IS the requested role. */
export function sameExpertise(a, b) {
  const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}