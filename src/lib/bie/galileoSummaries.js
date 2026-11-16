/**
 * Galileo Journal Summaries
 *
 * Deterministic, template-based summaries for BIE journal entries.
 * No LLM required — these are generated from the metric ID and change type.
 *
 * Each summary follows the Galileo advisor voice:
 *   - Factual (data-driven, no invention)
 *   - Connects the change to downstream impacts
 *   - Never salesy
 */

const METRIC_LABELS = {
  profit_gap_amount:           { label: 'Profit Gap',           downstream: ['Business Impact Score', '90-Day Sprint priorities'] },
  value_gap_amount:            { label: 'Value Gap',            downstream: ['exit valuation', 'Freedom timeline'] },
  tax_gap_annual:              { label: 'Tax Gap',              downstream: ['10-year cost of inaction', 'Freedom timeline'] },
  operations_score:            { label: 'Operations Health',    downstream: ['owner-dependency risk', 'exit multiple'] },
  freedom_score:               { label: 'Freedom Score',       downstream: ['financial independence timeline'] },
  iq_score:                    { label: 'Impact Quotient',     downstream: ['overall intelligence profile'] },
  recast_add_backs:            { label: 'Recast EBITDA',       downstream: ['normalized earnings', 'exit valuation'] },
  recast_valuation_increase:   { label: 'Recast Valuation',    downstream: ['enterprise value at exit'] },
  revenue:                     { label: 'Revenue',              downstream: ['Profit Gap', 'Value Gap', 'Business Impact Score'] },
  current_value:               { label: 'Current Business Value', downstream: ['Value Gap'] },
  potential_value:             { label: 'Potential Business Value', downstream: ['Value Gap'] },
  monthly_take_home:           { label: 'Monthly Take-Home',    downstream: ['hourly value of time', 'Operations Health'] },
  hours_worked_per_week:       { label: 'Hours Worked',         downstream: ['hourly value of time', 'Operations Health'] },
  hourly_value_of_time_freed:  { label: 'Hourly Value of Time', downstream: ['monthly value freed', 'Operations Health'] },
  monthly_value_of_time_freed: { label: 'Monthly Value Freed',  downstream: ['Operations Health', 'Freedom timeline'] },
  hours_freed_per_week:        { label: 'Hours Freed',          downstream: ['monthly value freed', 'Freedom timeline'] },
  tax_gap_ten_year:            { label: '10-Year Tax Cost',     downstream: ['cost of inaction'] },
  tax_strategy_count:          { label: 'Tax Strategies',       downstream: ['Tax Gap'] },
  profit_score:                { label: 'Profit Score',         downstream: ['Impact Quotient'] },
};

const EVENT_VERBS = {
  metric_updated:      'updated',
  value_increased:     'increased',
  value_decreased:     'decreased',
  metric_appeared:     'now available',
  metric_disappeared:  'no longer available',
  scenario_saved:      'saved',
  documents_accepted:  'accepted',
  advisor_validated:   'validated',
  sprint_completed:    'completed',
  assessment_completed:'completed',
};

const TRIGGER_LABELS = {
  assessment: 'after updating your assessment',
  document:   'after accepting documents',
  scenario:   'after saving a scenario',
  sprint:     'after completing a sprint task',
  advisor:    'after advisor review',
  system:     'during system recalculation',
};

function fmtVal(v) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(v).toLocaleString('en-US')}`;
  }
  return String(v);
}

/**
 * Generate a deterministic Galileo summary for a journal entry.
 *
 * @param {object} entry — journal entry
 * @returns {string} — human-readable summary
 */
export function generateGalileoSummary(entry) {
  if (!entry) return null;

  const meta = METRIC_LABELS[entry.metricId];
  const verb = EVENT_VERBS[entry.eventType] || 'updated';
  const trigger = TRIGGER_LABELS[entry.triggeredBy] || '';

  // Scenario/document/sprint/advisor events — custom phrasing
  if (entry.eventType === 'scenario_saved') {
    return `A new scenario was saved${trigger ? ` ${trigger}` : ''}. This may affect your Freedom timeline and 90-Day Sprint priorities.`;
  }
  if (entry.eventType === 'documents_accepted') {
    return `Documents were accepted${trigger ? ` ${trigger}` : ''}. Extracted data may update your Profit Gap, Value Gap, and Business Impact Score.`;
  }
  if (entry.eventType === 'advisor_validated') {
    return `An advisor validated your metrics${trigger ? ` ${trigger}` : ''}. This increases the confidence of your intelligence profile.`;
  }
  if (entry.eventType === 'sprint_completed') {
    return `A 90-Day Sprint task was completed${trigger ? ` ${trigger}` : ''}. This may update your Value Created and Business Impact Score.`;
  }
  if (entry.eventType === 'assessment_completed') {
    return `An assessment was completed${trigger ? ` ${trigger}` : ''}. New metrics are now available in your intelligence profile.`;
  }

  // Metric change events
  if (!meta) {
    return `A metric was ${verb}${trigger ? ` ${trigger}` : ''}.`;
  }

  const label = meta.label;
  const downstream = meta.downstream || [];

  // Appeared
  if (entry.eventType === 'metric_appeared') {
    return `Your ${label} is ${verb}${trigger ? ` ${trigger}` : ''}. This may affect your ${downstream.join(' and ')}.`;
  }

  // Disappeared
  if (entry.eventType === 'metric_disappeared') {
    return `Your ${label} is ${verb}${trigger ? ` ${trigger}` : ''}. Related metrics may need recalculation.`;
  }

  // Increased / decreased with values
  if (entry.eventType === 'value_increased' || entry.eventType === 'value_decreased') {
    const direction = entry.eventType === 'value_increased' ? 'increased' : 'decreased';
    const from = fmtVal(entry.oldValue);
    const to = fmtVal(entry.newValue);
    return `Your ${label} ${direction} from ${from} to ${to}${trigger ? ` ${trigger}` : ''}. This may affect your ${downstream.join(' and ')}.`;
  }

  // Generic update
  return `Your ${label} was ${verb}${trigger ? ` ${trigger}` : ''}. This may affect your ${downstream.join(' and ')}.`;
}

export default { generateGalileoSummary };