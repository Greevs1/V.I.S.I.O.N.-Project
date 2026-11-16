/**
 * Pulse Lens — the Business Pulse as Galileo's six LENSES.
 *
 * THE CONTRACT
 * A Pulse click expresses ONE thing: "LOOK AT VALUE". It never sends a value.
 * This module takes the domain token, reads the ALREADY-RESOLVED canonical
 * signal layer (BIS → homeSignals) and returns a lens describing what Galileo
 * can honestly say about that area right now. Nothing is fetched, nothing is
 * persisted, and no figure is ever invented here: if the signal is not
 * supported, the lens says so and names the single piece of evidence that would
 * change that (Part B/D).
 *
 * WHAT THE LENS INFLUENCES
 *   · which area Home is focused on (a navigation intent)
 *   · what Galileo offers to say or do next, derived from existing capabilities
 * It does NOT influence business_id, values, confidence, opportunities or
 * entitlement. Related opportunities are the canonical ones already resolved
 * for the active business, and only their ids are ever named.
 *
 * The browser expresses "look at Value" — the server resolves the business.
 */

import { getDomainCommands } from './homeCommandBar';
import { SignalState } from './signalAwakening';
import { resolveExperienceDepth, nextLayerThread } from './experienceDepth';

const DOMAINS = {
  cash: {
    label: 'Cash',
    area: 'your cash position',
    evidence: { label: 'Upload a cash flow statement', phrase: 'a cash flow statement or recent bank statements' },
  },
  tax: {
    label: 'Tax',
    area: 'your tax position',
    evidence: { label: 'Upload your latest tax return', phrase: 'your latest business tax return' },
  },
  profit: {
    label: 'Profit',
    area: 'your profitability',
    evidence: { label: 'Upload your latest P&L', phrase: 'your latest profit & loss statement' },
    basis: 'Measured as an EBITDA margin.',
  },
  operations: {
    label: 'Operations',
    area: 'how the business runs without you',
    evidence: { label: 'Upload your latest P&L', phrase: 'your latest profit & loss statement' },
  },
  value: {
    label: 'Value',
    area: 'the value of your business',
    evidence: { label: 'Upload your latest P&L', phrase: 'your latest P&L or balance sheet' },
    basis: 'Modeled from earnings.',
  },
  freedom: {
    label: 'Freedom',
    area: 'how free you are from the business',
    evidence: { label: 'Upload your latest P&L', phrase: 'your latest profit & loss statement' },
  },
};

/** Domain matching for related opportunities — the canonical category text only. */
const DOMAIN_MATCH = {
  cash: /cash|flow|liquid/i,
  tax: /tax/i,
  profit: /profit|margin|ebitda/i,
  operations: /operation|owner depend|dependen|management/i,
  value: /value|valuation|exit|multiple/i,
  freedom: /freedom|dependen|time|hours/i,
};

/**
 * resolvePulseLens — build the lens for one Pulse domain.
 *
 * @param {object} input
 * @param {string} input.domain              the Pulse signal the owner selected
 * @param {object} input.signals             canonical signals (buildSignalsFromBIS)
 * @param {object} input.signalStates        computeHomeSignalStates(signals, domain)
 * @param {Array}  input.opportunities       canonical opportunities for THIS business
 * @param {boolean} input.implementationExists  real work already exists
 * @param {boolean} input.advisorConnected   a real expert relationship exists
 * @returns {object|null}
 */
export function resolvePulseLens({
  domain,
  signals = {},
  signalStates = {},
  opportunities = [],
  implementationExists = false,
  advisorConnected = false,
} = {}) {
  const meta = DOMAINS[domain];
  if (!meta) return null;

  const signal = signals[domain] || {};
  const state = signalStates[domain] || { state: SignalState.UNKNOWN, value: null, label: 'Learning…' };
  const supported = state.state !== SignalState.UNKNOWN && state.state !== SignalState.LEARNING;

  const related = (opportunities || [])
    .filter((o) => matchesDomain(domain, o))
    .slice(0, 3)
    .map((o) => ({
      id: o.id,
      title: o.title,
      impact: o.impact ?? null,
      status: o.status || null,
    }));

  const depth = resolveExperienceDepth({
    supported,
    hasOpportunity: related.length > 0,
    hasImplementation: implementationExists && related.length > 0,
    advisorConnected,
  });

  return {
    domain,
    label: meta.label,
    source: 'business_pulse',
    supported,
    statement: supported
      ? `Here's what I currently understand about ${meta.area}.`
      : `I don\u2019t know enough yet to give you a responsible answer about ${meta.area}.`,
    indicator: supported ? buildIndicator(domain, state) : null,
    basis: supported ? meta.basis || null : null,
    driver: buildDriver(domain, related, signalStates),
    confidence: supported ? buildConfidence(state) : null,
    evidence: supported ? null : { label: meta.evidence.label, phrase: meta.evidence.phrase },
    related_opportunities: related,
    related_opportunity_ids: related.map((r) => r.id),
    prompts: getDomainCommands(domain) || [],
    depth,
    nextLayer: nextLayerThread(depth),
    primary: buildPrimary({ related, supported, evidence: meta.evidence }),
  };
}

/**
 * buildIndicator — reuses the canonical DISPLAY contract of the signal layer
 * (state.label / state.secondary). No value is recomputed or reformatted, and
 * no trend is drawn: the intelligence layer exposes no trend series.
 */
function buildIndicator(domain, state) {
  switch (domain) {
    case 'value':
      return { value: state.label, label: 'Estimated value', secondary: state.secondary || null };
    case 'profit':
      return { value: state.label, label: 'EBITDA margin', secondary: state.secondary || null };
    case 'tax':
      return { value: state.label, label: 'Annual tax gap', secondary: state.secondary || null };
    case 'operations':
      return { value: state.label, label: 'Owner involvement', secondary: null };
    case 'freedom':
      return { value: state.label, label: 'Owner freedom', secondary: null };
    default:
      return null;
  }
}

/**
 * buildDriver — the most likely driver of the current state, from canonical
 * material only: the strongest related opportunity, or the owner-dependency
 * constraint the operations/freedom signals actually report.
 */
function buildDriver(domain, related, signalStates) {
  if (related.length > 0) {
    return { label: 'Most likely driver', detail: related[0].title };
  }
  const ops = signalStates.operations;
  if (['value', 'freedom', 'operations'].includes(domain) && ops?.value != null && ops.value < 65) {
    return { label: 'Primary driver', detail: 'Owner dependency' };
  }
  return null;
}

/**
 * buildConfidence — the BASIS of what Galileo currently understands, never a
 * fabricated percentage. This mirrors the provenance labels the signal layer
 * already carries.
 */
function buildConfidence(state) {
  if (state.source === 'document' || state.provenance === 'DOCUMENT_SUPPORTED') {
    return { label: 'Supported by your documents' };
  }
  if (state.provenance === 'CONNECTED_DATA') return { label: 'Supported by connected data' };
  if (state.provenance === 'BENCHMARK') return { label: 'Benchmarked' };
  return { label: 'Developing' };
}

/**
 * buildPrimary — the single next step that is genuinely available here:
 * the canonical opportunity in this area, the existing opportunity surface, or
 * the one piece of evidence that would sharpen the picture.
 */
function buildPrimary({ related, supported, evidence }) {
  if (related.length > 0) {
    return { kind: 'opportunity', id: related[0].id, label: `Investigate ${related[0].title}` };
  }
  if (supported) {
    return { kind: 'command', action: 'view_opportunities', label: 'Explore opportunities' };
  }
  return { kind: 'upload', needs: evidence.phrase, label: evidence.label };
}

function matchesDomain(domain, opp) {
  const pattern = DOMAIN_MATCH[domain];
  if (!pattern) return false;
  const text = [opp.category, opp.title, opp.subtitle, opp.domain].filter(Boolean).join(' ');
  return pattern.test(text);
}