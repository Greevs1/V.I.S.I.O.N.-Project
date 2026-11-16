/**
 * Galileo Pulse Lens + Experience Depth — functional and source-level harness.
 *
 * Covers PART L of the final depth slice:
 *   P1–P12  the six lenses focus Galileo; the browser cannot inject values
 *   D1–D12  free value is real, bounded, and never dumps the implementation
 *   S1–S10  no boundary moves: business, opportunity, strategy, Play, expert,
 *           entitlement, evidence
 *   M1–M8   the mobile/structural contracts of the surface that renders it
 *
 * The lens module is evaluated for REAL (no mocks): BIS signals → the canonical
 * signal states → the lens. Nothing here asserts on a hand-written state object
 * that could drift from the production contract.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = {
  lens: 'src/lib/galileo/pulseLens.js',
  depth: 'src/lib/galileo/experienceDepth.js',
  signals: 'src/lib/galileo/homeSignals.js',
  awakening: 'src/lib/galileo/signalAwakening.js',
  bar: 'src/lib/galileo/homeCommandBar.js',
  home: 'src/hooks/useGalileoHome.js',
  homeJsx: 'src/components/galileo/home/GalileoHome.jsx',
  lensJsx: 'src/components/galileo/home/PulseLens.jsx',
  pulse: 'src/components/galileo/home/HomeBusinessPulse.jsx',
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── A tiny ESM→CJS evaluator for the pure modules ────────────────────────────
const exportedNames = (src) =>
  [...new Set([...src.matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]))];

function evaluate(sources) {
  const merged = sources.join('\n');
  const names = exportedNames(merged);
  const shimmed = merged.replace(
    /^\s*import\s*\{([^}]*)\}\s*from\s*'[^']*';\s*$/gm,
    (line, spec) => spec
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [name, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
        return alias ? `const ${alias} = ${name};` : '';
      })
      .filter(Boolean)
      .join('\n'),
  );
  const body = shimmed
    .replace(/^\s*import[^;]*;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { ${names.join(', ')} };`)();
}

// ── Test plumbing ────────────────────────────────────────────────────────────
const failures = [];
function check(id, description, condition, detail) {
  if (condition) console.log(`  ok   ${id}  ${description}`);
  else {
    const line = `  FAIL ${id}  ${description}${detail ? ` — ${detail}` : ''}`;
    console.log(line);
    failures.push(id);
  }
}

/** Canonical signals as the BIS → homeSignals path produces them. */
const BIS_SIGNALS = {
  profit: { margin: 18.4, gap: 250000, source: 'document', provenance: 'DOCUMENT_SUPPORTED' },
  value: { current: 2200000, gap: 1100000, source: 'modeled', provenance: 'MODELED' },
  operations: { score: 38, source: 'assessment', provenance: 'MODELED' },
  freedom: { score: 33, source: 'assessment', provenance: 'MODELED' },
};

function loadStack(sources = {}) {
  const src = {
    depth: sources.depth || read(FILES.depth),
    bar: sources.bar || read(FILES.bar),
    signals: sources.signals || read(FILES.signals),
    awakening: sources.awakening || read(FILES.awakening),
    lens: sources.lens || read(FILES.lens),
  };
  return { src, M: evaluate([src.depth, src.bar, src.awakening, src.signals, src.lens]) };
}

function runChecks(sources = {}) {
  const before = failures.length;
  const { M } = loadStack(sources);
  const homeSrc = sources.home || read(FILES.home);
  const homeJsx = sources.homeJsx || read(FILES.homeJsx);
  const lensJsx = sources.lensJsx || read(FILES.lensJsx);
  const pulseSrc = read(FILES.pulse);
  const lensSrc = sources.lens || read(FILES.lens);
  const depthSrc = sources.depth || read(FILES.depth);

  if (!M?.resolvePulseLens) {
    check('P0', 'the lens module loaded', false, 'resolvePulseLens missing');
    return failures.slice(before);
  }
  const { resolvePulseLens, ExperienceDepth, nextLayerThread } = M;

  // A mutant must produce FAILURES, never an exception that ends the battery.
  try {
  const EMPTY_STATES = M.computeHomeSignalStates({}, null);
  const BIS_STATES = M.computeHomeSignalStates(BIS_SIGNALS, null);
  const lens = (domain, extra = {}) =>
    resolvePulseLens({
      domain,
      signals: extra.signals || BIS_SIGNALS,
      signalStates: extra.signalStates || BIS_STATES,
      opportunities: extra.opportunities || [],
      implementationExists: !!extra.implementationExists,
      advisorConnected: !!extra.advisorConnected,
    });

  const OPPORTUNITIES = [
    { id: 'opp_value_1', title: 'Owner dependency is limiting enterprise value', category: 'value', impact: 1100000, status: 'active' },
    { id: 'opp_profit_1', title: 'Margin is below the industry range', category: 'profit', impact: 250000, status: 'available' },
    { id: 'opp_tax_1', title: 'Tax structure review', category: 'tax', impact: 48000, status: 'available' },
    { id: 'opp_other_1', title: 'Website refresh', category: 'marketing', impact: null, status: 'available' },
  ];

  // ── P1–P6 · every Pulse domain focuses Galileo ───────────────────────────
  const DOMAIN_LABELS = { cash: 'Cash', tax: 'Tax', profit: 'Profit', operations: 'Operations', value: 'Value', freedom: 'Freedom' };
  ['cash', 'tax', 'profit', 'operations', 'value', 'freedom'].forEach((domain, i) => {
    const l = lens(domain);
    check(`P${i + 1}`, `${DOMAIN_LABELS[domain]} focuses Galileo on ${DOMAIN_LABELS[domain]}`,
      !!l && l.domain === domain && l.label === DOMAIN_LABELS[domain]
      && l.source === 'business_pulse' && typeof l.statement === 'string'
      && l.statement.toLowerCase().includes(DOMAIN_LABELS[domain].toLowerCase().slice(0, 4))
      || (!!l && domain === 'operations' && l.statement.includes('runs without you'))
      || (!!l && domain === 'freedom' && l.statement.includes('free you are')),
      l ? l.statement : 'null');
  });

  // P7 · the browser cannot inject signal values
  const injected = resolvePulseLens({ domain: { domain: 'value', current: 999999999 }, signals: BIS_SIGNALS, signalStates: BIS_STATES });
  const injectedStr = resolvePulseLens({ domain: 'value', signals: BIS_SIGNALS, signalStates: BIS_STATES, current: 999999999, business_id: 'evil' });
  check('P7', 'a browser payload cannot become a signal value',
    injected === null && !Object.keys(injectedStr).includes('business_id')
    && JSON.stringify(injectedStr).indexOf('999999999') === -1,
    JSON.stringify(injectedStr).slice(0, 80));

  // P8 · the lens carries no business identity of its own
  const valueLens = lens('value');
  check('P8', 'the lens never names or overrides a business',
    !('business_id' in valueLens) && !/business_id\s*:/.test(lensSrc) && !/base44\./.test(lensSrc),
    'business_id present');

  // P9 · an unsupported signal fabricates nothing, and says so
  const cash = resolvePulseLens({ domain: 'cash', signals: {}, signalStates: EMPTY_STATES, opportunities: OPPORTUNITIES });
  const taxEmpty = resolvePulseLens({ domain: 'tax', signals: {}, signalStates: EMPTY_STATES, opportunities: OPPORTUNITIES });
  check('P9', 'unsupported areas admit it and offer the evidence instead',
    cash.supported === false && cash.indicator === null
    && /know enough yet/.test(cash.statement)
    && cash.evidence && /cash flow statement/.test(cash.evidence.phrase)
    && taxEmpty.supported === false && /tax return/.test(taxEmpty.evidence.phrase)
    && cash.primary.kind === 'upload',
    cash.indicator ? 'fabricated indicator' : 'ok');

  // P10 · selecting another lens replaces the previous one cleanly
  const profit = lens('profit');
  check('P10', 'a new lens replaces the prior lens without carrying its figures',
    profit.indicator.value === '18.4%' && profit.indicator.label === 'EBITDA margin'
    && JSON.stringify(profit).indexOf('2200000') === -1
    && JSON.stringify(profit).indexOf('$2.2M') === -1,
    profit.indicator.value);

  // P11 · refresh behaves intentionally: the lens is derived, never persisted
  check('P11', 'the lens is derived state, not stored state',
    /const \[lens, setLens\] = useState\(null\)/.test(homeSrc)
    && !/localStorage\.setItem\([^)]*lens/.test(homeSrc)
    && !/sessionStorage\.setItem\([^)]*lens/.test(homeSrc),
    'lens persisted');

  // P12 · switching business clears the lens
  check('P12', 'a business switch clears the lens',
    /setLens\(null\)/.test(homeSrc) && /A lens belongs to the business|S10/.test(homeSrc),
    'no reset');

  // ── D1–D12 · free value, honestly bounded ────────────────────────────────
  check('D1', 'DISCOVER still gives something genuinely useful to do',
    cash.primary.kind === 'upload' && cash.evidence.label.length > 0
    && cash.nextLayer.capability.action === 'upload',
    cash.primary.kind);

  check('D2', 'UNDERSTAND explains why, from canonical material',
    valueLens.supported === true && valueLens.driver
    && valueLens.driver.detail === 'Owner dependency'
    && valueLens.depth === ExperienceDepth.UNDERSTAND,
    JSON.stringify(valueLens.driver));

  const DOC_SIGNALS = { ...BIS_SIGNALS, value: { current: 2200000, source: 'document', provenance: 'DOCUMENT_SUPPORTED' } };
  const docBacked = lens('value', { signals: DOC_SIGNALS, signalStates: M.computeHomeSignalStates(DOC_SIGNALS, null) });
  check('D3', 'the evidence state stays honest',
    valueLens.confidence.label === 'Developing'
    && docBacked.confidence.label === 'Supported by your documents'
    && cash.confidence === null,
    `${valueLens.confidence.label} / ${docBacked.confidence.label}`);

  const withOpps = lens('value', { opportunities: OPPORTUNITIES });
  check('D4', 'the strategy preview is bounded',
    withOpps.related_opportunities.length <= 3
    && /\.slice\(0, 3\)/.test(lensSrc)
    && withOpps.depth === ExperienceDepth.EXPLORE,
    String(withOpps.related_opportunities.length));

  check('D5', 'an unsupported strategy is never shown to fill space',
    withOpps.related_opportunities.every((o) => /value|valuation|exit|multiple/i.test(OPPORTUNITIES.find((x) => x.id === o.id).category + ' ' + o.title))
    && !withOpps.related_opportunity_ids.includes('opp_tax_1')
    && !withOpps.related_opportunity_ids.includes('opp_other_1'),
    withOpps.related_opportunity_ids.join(','));

  check('D6', 'the implementation is never dumped automatically',
    !('plan' in withOpps) && !('tasks' in withOpps) && !('sprints' in withOpps)
    && !/useImplementationPlan|ninetyDaySprint|playbookStore/.test(lensSrc),
    'implementation leaked into the lens');

  check('D7', 'the Galileo path uses the existing commercial authority',
    /access=\{a\.access\}/.test(homeJsx) && /onGalileo=\{a\.startGuide\}/.test(homeJsx)
    && !/isPaid|membership|tier/i.test(lensSrc) && !/isPaid|membership_tier/i.test(lensJsx),
    'authority re-implemented');

  check('D8', 'the Expert path uses the existing relationship authority',
    /onTeam=\{a\.openExpert\}/.test(homeJsx) && /ImplementationChoice/.test(lensJsx)
    && !/assignExpert|grantAccess|inviteUser|advisor_relationships/.test(lensJsx + lensSrc),
    'expert access invented');

  const REAL_CAPABILITIES = ['view_opportunities', 'view_plays', 'whatif', 'connect_financials', 'open_valuation', 'open_sprint', 'expert', 'upload', 'sprint_expert', 'view_documents'];
  check('D9', 'user facts stay reachable through real prompts and actions',
    valueLens.prompts.length > 0
    && valueLens.prompts.every((c) => c.prompt || REAL_CAPABILITIES.includes(c.action)),
    JSON.stringify(valueLens.prompts.map((c) => c.action || 'prompt')));

  const twoMatching = lens('value', { opportunities: OPPORTUNITIES });
  check('D10', 'no opportunity count is ever invented',
    twoMatching.related_opportunities.length === OPPORTUNITIES.filter((o) => /value/i.test(o.category)).length
    && twoMatching.related_opportunities.every((o) => typeof o.id === 'string')
    && !/\d+\s+opportunit/i.test(lensJsx),
    String(twoMatching.related_opportunities.length));

  check('D11', 'nothing pretends Galileo is processing on navigation',
    !/setTimeout|setInterval|analyzing/i.test(lensJsx) && !/setTimeout/.test(lensSrc),
    'fake processing');

  check('D12', 'every next-layer thread names a capability that exists',
    Object.values(ExperienceDepth).every((d) => REAL_CAPABILITIES.includes(nextLayerThread(d).capability.action))
    && nextLayerThread(ExperienceDepth.IMPLEMENT).capability.action === 'open_sprint'
    && /case 'open_sprint'/.test(lensJsx) && /case 'upload'/.test(lensJsx)
    && /case 'expert'/.test(lensJsx),
    'thread without capability');

  // ── S1–S10 · nothing moves ───────────────────────────────────────────────
  check('S1', 'Pulse cannot override business_id',
    !('business_id' in valueLens) && !/business_id\s*:/.test(lensSrc), 'business_id exposed');
  check('S2', 'Pulse cannot submit canonical values',
    resolvePulseLens({ domain: 'value', signals: {}, signalStates: EMPTY_STATES, current: 2200000 })['indicator'] === null,
    'value accepted');
  check('S3', 'Galileo re-resolves the business from the question alone',
    /onAsk\?\.\(cmd\.prompt\)/.test(lensJsx) && !/onAsk\?\.\([^)]*lens\./.test(lensJsx)
    && !/functions\.invoke|base44\./.test(lensSrc),
    'lens payload sent');
  check('S4', 'related opportunities stay business scoped',
    withOpps.related_opportunity_ids.every((id) => OPPORTUNITIES.some((o) => o.id === id)),
    'foreign id');
  check('S5', 'strategy comes from the static catalog, scoped to this business',
    JSON.stringify(valueLens.prompts) === JSON.stringify(M.getDomainCommands('value')),
    'strategy invented');
  check('S6', 'Plays stay business scoped',
    !('plays' in withOpps) && !('sprint' in withOpps) && /implementationExists/.test(lensSrc),
    'play data in lens');
  check('S7', 'clicking the expert door grants nothing',
    !/(assignExpert|advisor_access|grantAccess|relationshipAccess|assignDocumentToUser)/i.test(lensJsx + lensSrc)
    && /onTeam\?\.\(\)|onTeam\(\)/.test(lensJsx),
    'grant on click');
  check('S8', 'entitlement cannot be overridden by client state',
    !/locked\s*[:=]\s*(false|true)/.test(lensJsx) && !/isPaid|isAdvisorOrAdmin/.test(lensJsx)
    && /access=\{a\.access\}/.test(homeJsx),
    'client-side entitlement');
  check('S9', 'private evidence references stay out of the lens',
    !/file_url|signed|storage|bucket|document_id/i.test(JSON.stringify(valueLens))
    && !/file_url|signedUrl/.test(lensSrc),
    'evidence leaked');
  check('S10', 'switching business clears the prior context',
    /prevId === nextId\) return;[\s\S]{0,400}setLens\(null\)/.test(homeSrc),
    'stale lens across businesses');

  // ── M1–M8 · the surface stays coherent on a phone ───────────────────────
  check('M1', 'no fixed-width element can overflow the page', !/min-w-\[/.test(lensJsx), 'min-w-[ found');
  check('M2', 'the orb stays subordinate to the insight',
    homeJsx.indexOf('<HomeHero') < homeJsx.indexOf('<PulseLens')
    && homeJsx.indexOf('<HomeHero') < homeJsx.indexOf('<HomeBusinessPulse'),
    'order changed');
  check('M3', 'the primary action follows the insight, above the Pulse',
    homeJsx.indexOf('<PulseLens') < homeJsx.indexOf('<NextBestMove')
    && homeJsx.indexOf('<NextBestMove') < homeJsx.indexOf('<HomeBusinessPulse'),
    'order changed');
  check('M4', 'the Pulse stays usable rather than six tiny cards',
    /grid-cols-2/.test(pulseSrc) && !/(^|\s)grid-cols-6/.test(pulseSrc),
    'pulse collapsed');
  check('M5', 'the Galileo input remains present on Home', /<AskGalileoBar/.test(homeJsx), 'input missing');
  check('M6', 'the strategy preview rows stay readable', /truncate/.test(lensJsx) && /flex-wrap/.test(lensJsx), 'no truncation');
  check('M7', 'the Galileo / Expert fork is readable and honest',
    /ImplementationChoice/.test(lensJsx) && !/hideLocked/.test(lensJsx), 'fork hidden');
  check('M8', 'navigation stays accessible', /<UtilityDock/.test(homeJsx), 'no dock');

  } catch (err) {
    check('RUN', 'every check completes against the module under test', false, String(err && err.message).slice(0, 60));
  }

  return failures.slice(before);
}

// ── Baseline ─────────────────────────────────────────────────────────────────
console.log('\nGALILEO PULSE LENS + EXPERIENCE DEPTH — CERTIFICATION\n');
console.log('── baseline ───────────────────────────────────────────────');
const TOTAL_CHECKS = 42; // P1–P12 + D1–D12 + S1–S10 + M1–M8
const baseline = runChecks();
const pass = TOTAL_CHECKS - baseline.length;

// ── Mutation battery ─────────────────────────────────────────────────────────
const MUTATIONS = [
  {
    id: 'M-HONEST',
    label: 'an unsupported area is given a value anyway',
    file: 'lens',
    find: 'indicator: supported ? buildIndicator(domain, state) : null,',
    replace: 'indicator: buildIndicator(domain, state),',
  },
  {
    id: 'M-EVIDENCE',
    label: 'the evidence ask is dropped (the honest next step disappears)',
    file: 'lens',
    find: 'evidence: supported ? null : { label: meta.evidence.label, phrase: meta.evidence.phrase },',
    replace: 'evidence: null,',
  },
  {
    id: 'M-LIMIT',
    label: 'the strategy preview stops being bounded',
    file: 'lens',
    find: '.slice(0, 3)',
    replace: '.slice(0, 30)',
  },
  {
    id: 'M-SCOPE',
    label: 'a caller could aim the lens at another business',
    file: 'lens',
    find: '  return {\n    domain,\n    label: meta.label,',
    replace: '  return {\n    domain,\n    business_id: arguments[0]?.business_id || null,\n    label: meta.label,',
  },
  {
    id: 'M-TEASER',
    label: 'a thread points at a capability that does not exist',
    file: 'depth',
    find: "capability: { action: 'view_opportunities' },",
    replace: "capability: { action: 'nonexistent_capability' },",
  },
  {
    id: 'M-RESET',
    label: 'a business switch keeps the previous lens',
    file: 'home',
    find: "setLens(null);\n    setHomeView('home');\n  }, [activeBusinessId]);",
    replace: "setHomeView('home');\n  }, [activeBusinessId]);",
  },
];

console.log('\n── mutation battery ───────────────────────────────────────');
let caught = 0;
let missed = 0;
for (const m of MUTATIONS) {
  const sources = {};
  const original = read(FILES[m.file]);
  if (!original.includes(m.find)) {
    console.log(`  FAIL ${m.id}  MUTATION DID NOT APPLY — ${m.label}`);
    missed += 1;
    continue;
  }
  sources[m.file] = original.replace(m.find, m.replace);
  const before = failures.length;
  const local = runChecks(sources);
  failures.length = before;
  const caughtNow = local.length > 0;
  if (caughtNow) caught += 1;
  else missed += 1;
  console.log(`  ${caughtNow ? 'CAUGHT' : 'MISSED'}  ${m.id}  ${m.label}${caughtNow ? `  (${local.slice(0, 3).join(', ')})` : ''}`);
}

check('MUTATIONS', 'the battery both applies and is caught', caught === MUTATIONS.length, `${caught}/${MUTATIONS.length}`);

console.log('');
console.log(`  checks     : ${pass} PASS${baseline.length ? `, ${baseline.length} FAILED` : ''}  (P1–P12 + D1–D12 + S1–S10 + M1–M8)`);
console.log(`  mutations  : ${caught}/${MUTATIONS.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
const ok = baseline.length === 0 && missed === 0 && caught === MUTATIONS.length;
if (!ok) console.log(`  failing    : ${[...baseline, ...failures].join(', ')}`);
console.log('');
console.log(ok
  ? 'GALILEO PULSE LENS + EXPERIENCE DEPTH — ALL CHECKS PASS'
  : 'GALILEO PULSE LENS + EXPERIENCE DEPTH — NOT CERTIFIED');
process.exit(ok ? 0 : 1);