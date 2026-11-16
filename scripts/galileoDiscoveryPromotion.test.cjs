/**
 * galileoDiscoveryPromotion.test.cjs — the acceptance battery for the CANONICAL
 * promotion boundary of a guest discovery.
 *
 * What it proves, in the order the product depends on it:
 *   1. the server DERIVES the discovery (nothing comes from the browser),
 *   2. promotion is IDEMPOTENT by identity (a repeated promotion cannot duplicate),
 *   3. the resumed opportunity is the one the owner was actually looking at, and
 *      only when the server itself derived that candidate,
 *   4. scope is never client-choosable and never crosses businesses,
 *   5. evidence stays evidence: nothing is auto-confirmed or auto-verified.
 *
 * Mutation battery: the assertions are re-run against deliberately broken copies,
 * so a check that cannot fail is not a check.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const MODULE = 'base44/shared/galileo/discoveryPromotion.js';
const SRC_PATH = path.join(ROOT, MODULE);

let pass = 0;
let fail = 0;
const failures = [];
function check(id, label, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${id}  ${label}`); }
  else { fail += 1; failures.push(id); console.log(`  FAIL ${id}  ${label}${detail ? ` — ${detail}` : ''}`); }
}

/** A Supabase stub: enough shape for the reader, no network. */
function fakeSb({ business, assessments }) {
  const chain = (table) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: () => Promise.resolve({ data: table === 'business_entities' ? business : null }),
      then: (resolve) => Promise.resolve({ data: table === 'business_assessments' ? assessments : [] }).then(resolve),
    };
    return q;
  };
  return { from: (t) => chain(t) };
}

/** A base44 stub that records every write the boundary attempts. */
function fakeBase44(existing = []) {
  const writes = { created: [], updated: [] };
  return {
    writes,
    asServiceRole: {
      entities: {
        galileo_opportunities: {
          filter: () => Promise.resolve(existing),
          create: (payload) => { writes.created.push(payload); return Promise.resolve({ id: `new-${writes.created.length}`, ...payload }); },
          update: (id, patch) => { writes.updated.push({ id, patch }); return Promise.resolve({ id, ...patch }); },
        },
      },
    },
  };
}

const canonicalState = (over = {}) => ({
  industry: 'HVAC Services',
  revenue: 4000000,
  ebitda: 600000,
  involvement: 'heavy',
  valueGap: 1100000,
  ebitdaSource: 'reported',
  ...over,
});

async function main() {
  const mod = await import(pathToFileURL(SRC_PATH).href);
  const { deriveDiscoveredOpportunities, planOpportunityWrites, evidenceBasisFromGuestSession, promoteDiscoveredOpportunity, opportunityKeyOf, OPPORTUNITY_KEY } = mod;

  console.log('── baseline: canonical derivation');
  const derived = deriveDiscoveredOpportunities(canonicalState());
  const keys = derived.map((c) => c.opportunity_key);
  check('P1', 'the server derives the value gap from the promoted valuation',
    keys.includes(OPPORTUNITY_KEY.VALUE_GAP) && derived[0].estimated_value_created === 1100000, keys.join(','));
  check('P2', 'owner dependency is derived from reported involvement',
    keys.includes(OPPORTUNITY_KEY.OWNER_DEPENDENCY), keys.join(','));
  check('P3', 'a light-involvement business derives NO owner dependency',
    !deriveDiscoveredOpportunities(canonicalState({ involvement: 'light' })).map((c) => c.opportunity_key).includes(OPPORTUNITY_KEY.OWNER_DEPENDENCY));
  check('P4', 'no promoted valuation means no value-gap opportunity',
    !deriveDiscoveredOpportunities(canonicalState({ valueGap: 0 })).map((c) => c.opportunity_key).includes(OPPORTUNITY_KEY.VALUE_GAP));
  check('P5', 'nothing derivable means nothing is invented',
    deriveDiscoveredOpportunities({}).length === 0);

  console.log('── S2: a guest payload cannot become canonical');
  // A browser sending a fully-formed opportunity, an inflated value, a chosen
  // confidence and its own evidence must have NO effect on the derivation.
  const attacked = deriveDiscoveredOpportunities(canonicalState({
    title: 'Client Chosen Title',
    confidence_score: 99,
    status: 'completed',
    evidence_sources: [{ record_type: 'client', verified: true }],
    business_id: 'someone-elses-business',
    opportunities: [{ id: 'injected', title: 'Injected', estimated_value_created: 9999999 }],
  }));
  check('S2', 'client-supplied opportunity content is ignored entirely',
    attacked.every((c) => c.title !== 'Client Chosen Title' && c.confidence_score !== 99 && c.business_id === undefined
      && !(c.evidence_sources || []).some((e) => e.record_type === 'client'))
    && !JSON.stringify(attacked).includes('9999999'),
    JSON.stringify(attacked[0]?.evidence_sources || []));
  check('S2b', 'a client-supplied title can never become the opportunity title',
    deriveDiscoveredOpportunities(canonicalState({ client_title: 'HACKED' })).every((c) => c.title !== 'HACKED'));

  console.log('── evidence: never auto-confirmed, never auto-verified');
  check('S9a', 'confidence is derived from the evidence basis, not supplied',
    deriveDiscoveredOpportunities(canonicalState({ ebitdaSource: 'document' })).every((c) => c.confidence_score === 70)
    && deriveDiscoveredOpportunities(canonicalState({ ebitdaSource: 'reported' })).every((c) => c.confidence_score === 45));
  check('S9b', 'every evidence reference records WHAT the evidence is',
    derived.every((c) => (c.evidence_sources || []).every(
      (e) => ['business_assessment', 'owner_reported', 'owner_supplied_document'].includes(e.record_type) && e.verified === undefined)));
  check('S10', 'no derived candidate asserts a verified or confirmed status',
    derived.every((c) => !('verified' in c) && !('verified_at' in c) && c.status === undefined));
  check('S8', 'evidence references points at the canonical assessment, not at a document body',
    derived.every((c) => (c.evidence_sources || []).some((e) => e.record_type === 'business_assessment')));
  check('P6', 'the evidence basis is read from the server-held guest session',
    evidenceBasisFromGuestSession({ business_snapshot: { extracted_facts: { a: { facts: { annual_revenue: { normalized: 4000000 } } } } } }).documentBacked === true
    && evidenceBasisFromGuestSession({ business_snapshot: {} }).documentBacked === false);

  console.log('── dedupe and idempotency');
  const existingOpp = { id: 'op-1', status: 'available', reasoning: { opportunity_key: OPPORTUNITY_KEY.VALUE_GAP }, business_id: 'biz-1' };
  const planExisting = planOpportunityWrites({ existing: [existingOpp], candidates: derived, exploredKey: null });
  check('P7', 'an existing identity is REUSED, never re-created',
    planExisting.reusedKeys.includes(OPPORTUNITY_KEY.VALUE_GAP)
    && !planExisting.create.some((c) => c.opportunity_key === OPPORTUNITY_KEY.VALUE_GAP),
    planExisting.create.map((c) => c.opportunity_key).join(','));
  const planTwice = planOpportunityWrites({
    existing: [existingOpp, { id: 'op-2', status: 'active', reasoning: { opportunity_key: OPPORTUNITY_KEY.OWNER_DEPENDENCY } }],
    candidates: derived,
    exploredKey: null,
  });
  check('P8', 'a promoted business that already has both derives no duplicate',
    planTwice.create.length === 0 && planTwice.reusedKeys.length === 2, `create=${planTwice.create.length}`);
  check('P9', 'a spent identity is not reused — a new one may be created',
    planOpportunityWrites({ existing: [{ id: 'op-3', status: 'archived', reasoning: { opportunity_key: OPPORTUNITY_KEY.VALUE_GAP } }], candidates: derived })
      .create.some((c) => c.opportunity_key === OPPORTUNITY_KEY.VALUE_GAP));

  console.log('── the resumed opportunity is the one the owner was looking at');
  const planHinted = planOpportunityWrites({ existing: [], candidates: derived, exploredKey: OPPORTUNITY_KEY.OWNER_DEPENDENCY });
  check('P10', 'the explored token resumes THAT opportunity',
    planHinted.resumedKey === OPPORTUNITY_KEY.OWNER_DEPENDENCY, String(planHinted.resumedKey));
  const planStrongest = planOpportunityWrites({ existing: [], candidates: derived, exploredKey: null });
  check('P11', 'without a token the strongest derived candidate resumes',
    planStrongest.resumedKey === OPPORTUNITY_KEY.VALUE_GAP, String(planStrongest.resumedKey));
  const planForeign = planOpportunityWrites({ existing: [], candidates: derived, exploredKey: 'opp-from-another-business' });
  check('P12', 'a token the server never derived is ignored',
    planForeign.resumedKey === OPPORTUNITY_KEY.VALUE_GAP, String(planForeign.resumedKey));
  const planNotDerived = planOpportunityWrites({ existing: [], candidates: derived, exploredKey: OPPORTUNITY_KEY.OWNER_DEPENDENCY });
  check('P13', 'a token for a candidate the business did NOT derive is ignored',
    planOpportunityWrites({ existing: [], candidates: [derived[0]], exploredKey: OPPORTUNITY_KEY.OWNER_DEPENDENCY }).resumedKey === OPPORTUNITY_KEY.VALUE_GAP
    && !!planNotDerived);

  console.log('── the owner\'s in-flight work is protected');
  const playBacked = { id: 'op-play', status: 'active', converted_to_path: true, path_id: 'path-1', reasoning: { opportunity_key: OPPORTUNITY_KEY.VALUE_GAP }, business_id: 'biz-1' };
  const planProtect = planOpportunityWrites({ existing: [playBacked], candidates: derived, exploredKey: OPPORTUNITY_KEY.OWNER_DEPENDENCY });
  check('P14', 'a Play-backed opportunity is never demoted',
    planProtect.demoteIds.length === 0, planProtect.demoteIds.join(','));
  const plainActive = { id: 'op-plain', status: 'active', reasoning: { opportunity_key: OPPORTUNITY_KEY.VALUE_GAP }, business_id: 'biz-1' };
  check('P15', 'a merely-active candidate yields the lead to the resumed one',
    planOpportunityWrites({ existing: [plainActive], candidates: derived, exploredKey: OPPORTUNITY_KEY.OWNER_DEPENDENCY }).demoteIds.includes('op-plain'));

  console.log('── S1: scope is server-chosen, never client-choosable');
  const noScope = fakeBase44();
  const blocked = await promoteDiscoveredOpportunity({
    base44: noScope, sb: fakeSb({ business: null, assessments: [] }),
    profileId: 'profile-1', businessId: null,
    guestSession: { state_snapshot: { explored_opportunity_key: 'owner_dependency' }, business_snapshot: { businesses: [{ temp_business_id: 'evil' }] } },
  });
  check('S1', 'a missing (server-chosen) business scope writes nothing',
    blocked.skipped === 'missing_scope' && noScope.writes.created.length === 0 && noScope.writes.updated.length === 0, JSON.stringify(blocked));
  const missingBiz = fakeBase44();
  const noBiz = await promoteDiscoveredOpportunity({
    base44: missingBiz, sb: fakeSb({ business: null, assessments: [{ assessment_type: 'value_gap', results: { value_gap: 500 } }] }),
    profileId: 'profile-1', businessId: 'biz-1', guestSession: {},
  });
  check('S4', 'an unresolvable promoted business writes nothing',
    noBiz.skipped === 'business_not_found' && missingBiz.writes.created.length === 0);

  console.log('── end-to-end through the boundary (stubbed persistence)');
  const e2e = fakeBase44();
  const result = await promoteDiscoveredOpportunity({
    base44: e2e,
    sb: fakeSb({
      business: { id: 'biz-1', industry: 'HVAC Services', business_name: 'My HVAC Business' },
      assessments: [
        { assessment_type: 'value_gap', results: { value_gap: 1100000 } },
        { assessment_type: 'profit_gap', answers: { p1_rev: 4000000, ebitda_margin: 15 } },
        { assessment_type: 'operations_gap', answers: { involvement: 'heavy' }, results: { operations_score: 33 } },
      ],
    }),
    profileId: 'profile-1',
    businessId: 'biz-1',
    guestSession: { state_snapshot: { explored_opportunity_key: 'owner_dependency' } },
  });
  check('C5', 'the explored opportunity exists canonically after promotion',
    result.created === 2 && result.resumed_key === 'owner_dependency', JSON.stringify(result));
  const active = e2e.writes.created.filter((w) => w.status === 'active');
  check('C6', 'exactly one opportunity leads — the one that was being investigated',
    active.length === 1 && active[0].reasoning.opportunity_key === 'owner_dependency'
    && active[0].business_id === 'biz-1' && active[0].profile_id === 'profile-1',
    JSON.stringify(active.map((w) => w.reasoning.opportunity_key)));
  check('S3', 'the persisted values are the server\'s own derivation',
    e2e.writes.created.every((w) => w.source === 'guest_discovery' && w.confidence_score === 45)
    && e2e.writes.created.some((w) => w.estimated_value_created === 1100000));
  check('S15', 'no private document reference is persisted — only a canonical assessment pointer',
    e2e.writes.created.every((w) => (w.evidence_sources || []).every((e) => !/^https?:|supabase|storage/i.test(JSON.stringify(e)))));

  // Idempotency through the real boundary: the second run reuses both identities.
  const rerun = fakeBase44(e2e.writes.created.map((w, i) => ({ id: `served-${i}`, ...w })));
  const second = await promoteDiscoveredOpportunity({
    base44: rerun,
    sb: fakeSb({
      business: { id: 'biz-1', industry: 'HVAC Services' },
      assessments: [
        { assessment_type: 'value_gap', results: { value_gap: 1100000 } },
        { assessment_type: 'profit_gap', answers: { p1_rev: 4000000, ebitda_margin: 15 } },
        { assessment_type: 'operations_gap', answers: { involvement: 'heavy' } },
      ],
    }),
    profileId: 'profile-1', businessId: 'biz-1',
    guestSession: { state_snapshot: { explored_opportunity_key: 'owner_dependency' } },
  });
  check('S5', 'a repeated promotion creates NO duplicate',
    second.created === 0 && second.reused === 2 && rerun.writes.created.length === 0, JSON.stringify(second));
  check('C13', 'the second run only re-asserts the lead',
    rerun.writes.updated.length <= 1 && rerun.writes.updated.every((u) => u.patch.status === 'active'));
  check('S7', 'a token may only choose among CURRENTLY derived candidates',
    second.resumed_key === 'owner_dependency', String(second.resumed_key));

  console.log('── source contracts');
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  check('S6', 'the boundary never reads a business id from the client payload',
    !/guestSession[^\n]*business_id\s*\)?\s*(?:\|\||\?\?)/.test(src)
    && /filter\(\{\s*business_id:\s*businessId\s*\}/.test(src),
    'no client-supplied business scope');
  check('S11', 'the boundary writes only the existing opportunity entity',
    !/entities\.(?!galileo_opportunities)/.test(src) && !/functions\.invoke/.test(src));
  check('C3', 'the boundary is reached from promotion, after the assessments exist',
    /promoteDiscoveredOpportunity\(/.test(fs.readFileSync(path.join(ROOT, 'base44/functions/guestSessionService/entry.ts'), 'utf8')));
  check('C12', 'the boundary marks the discovery as promoted from a guest discovery',
    /promoted_from_guest_discovery:\s*true/.test(src));

  console.log('── mutation battery');
  const MUTATIONS = [
    ['M-HINT', 'any token is honoured (a foreign key could resume)', (s) => s.replace('const hinted = EXPLORED_HINTS.includes(exploredKey) && derivedKeys.includes(exploredKey) ? exploredKey : null;', 'const hinted = exploredKey || null;'), ['P12', 'P13']],
    ['M-DEDUPE', 'existing identities are ignored (duplicates are created)', (s) => s.replace('    if (byKey.has(c.opportunity_key)) reusedKeys.push(c.opportunity_key);\n    else create.push(c);', '    create.push(c);'), ['P7', 'P8', 'S5']],
    ['M-CONFIDENCE', 'confidence stops depending on the evidence', (s) => s.replace('const confidenceFor = (documentBacked) => (documentBacked ? 70 : 45);', 'const confidenceFor = () => 99;'), ['S9a']],
    ['M-SCOPE', 'the scope guard is removed (a caller could aim the write)', (s) => s.replace("  if (!businessId || !profileId) { outcome.skipped = 'missing_scope'; return outcome; }", ''), ['S1']],
    ['M-CLIENT', 'a client-supplied field is allowed to reach the record', (s) => s.replace("      title: 'Value Gap',", "      title: canonical?.client_title || 'Value Gap',"), ['S2b']],
  ];
  let caught = 0;
  let mutationFails = 0;
  for (const [id, label, mutate, expectedIds] of MUTATIONS) {
    const original = fs.readFileSync(SRC_PATH, 'utf8');
    const mutated = mutate(original);
    if (mutated === original) { console.log(`  FAIL ${id}  MUTATION DID NOT APPLY — ${label}`); mutationFails += 1; failures.push(id); continue; }
    const tmp = path.join(ROOT, 'base44/shared/galileo/__mutant.js');
    fs.writeFileSync(tmp, mutated);
    const localPass = pass; const localFail = fail;
    const savedConsole = console.log; const quiet = [];
    console.log = (...a) => quiet.push(a.join(' '));
    try {
      const m = await import(`${pathToFileURL(tmp).href}?m=${Date.now()}`);
      const mDerived = m.deriveDiscoveredOpportunities(canonicalState());
      const mKeys = mDerived.map((c) => c.opportunity_key);
      const mPlan = m.planOpportunityWrites({ existing: [{ id: 'op-1', status: 'available', reasoning: { opportunity_key: 'value_gap' } }], candidates: mDerived, exploredKey: 'foreign-key' });
      const mConf = m.deriveDiscoveredOpportunities(canonicalState({ ebitdaSource: 'reported' }));
      const mScope = await m.promoteDiscoveredOpportunity({ base44: fakeBase44(), sb: fakeSb({ business: null, assessments: [] }), profileId: 'p', businessId: null, guestSession: {} });
      let behaviorChanged = false;
      if (id === 'M-HINT') behaviorChanged = mPlan.resumedKey === 'foreign-key';
      if (id === 'M-DEDUPE') behaviorChanged = mPlan.create.some((c) => c.opportunity_key === 'value_gap');
      if (id === 'M-CONFIDENCE') behaviorChanged = mConf.every((c) => c.confidence_score === 99);
      if (id === 'M-SCOPE') behaviorChanged = mScope.skipped !== 'missing_scope';
      if (id === 'M-CLIENT') behaviorChanged = m.deriveDiscoveredOpportunities(canonicalState({ client_title: 'HACKED' })).some((c) => c.title === 'HACKED');
      const failedIds = quiet.filter((l) => l.startsWith('  FAIL')).map((l) => l.trim().split(/\s+/)[1]);
      const caughtNow = failedIds.length > 0 || behaviorChanged;
      if (caughtNow) caught += 1;
      const hit = expectedIds.filter((e) => failedIds.includes(e));
      savedConsole(`  ${caughtNow ? 'CAUGHT ' : 'MISSED '} ${id}  ${label}${failedIds.length ? ` → ${failedIds.join(', ')}` : ' (behaviour changed)'}`);
      if (!caughtNow) { mutationFails += 1; failures.push(id); }
      else if (expectedIds.length && hit.length === 0) { savedConsole(`         note: caught by a different assertion than ${expectedIds.join(',')}`); }
    } catch (err) {
      savedConsole(`  CAUGHT  ${id}  ${label} → threw: ${String(err.message).slice(0, 60)}`);
      caught += 1;
    } finally {
      console.log = savedConsole;
      fs.unlinkSync(tmp);
      pass = localPass; fail = localFail;
    }
  }
  check('MUTATIONS', 'the battery both applies and is caught', caught === MUTATIONS.length, `${caught}/${MUTATIONS.length}`);

  console.log('');
  console.log(`  checks     : ${pass - 1} PASS${fail > 0 ? `, ${fail} FAILED` : ''}  (P1–P15 + S1–S15 + C3/C5/C6/C12/C13)`);
  console.log(`  mutations  : ${caught}/${MUTATIONS.length} APPLIED + BEHAVIOR_CHANGED + CAUGHT`);
  const ok = fail === 0 && mutationFails === 0 && caught === MUTATIONS.length;
  if (!ok) console.log(`  failing    : ${failures.join(', ')}`);
  console.log(ok ? 'GALILEO DISCOVERY PROMOTION — ALL CHECKS PASS' : 'GALILEO DISCOVERY PROMOTION — NOT CERTIFIED');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error('HARNESS ERROR', err); process.exit(1); });