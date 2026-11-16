/**
 * Phase 6D.0c.2 — Evidence-First Answer Engine certification harness.
 *
 * Offline and non-destructive. Bundles the REAL engine modules (pipeline,
 * envelope, resolver, contract, ontology) and the REAL answer-surface modules
 * (factualAnswerView, nextStepResolver), runs A1–A30 plus the four live-shape
 * production cases (LIVE-A … LIVE-D) against them, then applies adversarial
 * mutations to the real source and requires each one to be CAUGHT.
 *
 *   node scripts/evidenceFirstAnswerEngine.test.cjs
 */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const P = (p) => path.join(ROOT, p);
const PIPELINE = 'base44/shared/galileo/answerEngine/pipeline.ts';
const VIEW = 'src/lib/galileo/factualAnswerView.js';
const NEXT = 'src/lib/galileo/nextStepResolver.js';

async function load(entry, mutation = null) {
  const plugins = [{
    name: 'harness',
    setup(b) {
      b.onResolve({ filter: /^@\// }, (a) => {
        let f = P('src/' + a.path.slice(2));
        for (const ext of ['', '.js', '.jsx', '.ts']) if (fs.existsSync(f + ext) && fs.statSync(f + ext).isFile()) return { path: f + ext };
        return { path: f };
      });
      if (mutation) {
        b.onLoad({ filter: /.*/ }, (a) => {
          if (path.resolve(a.path) !== P(mutation.file)) return undefined;
          const src = fs.readFileSync(a.path, 'utf8');
          if (!src.includes(mutation.find)) throw new Error(`mutation anchor not found in ${mutation.file}: ${mutation.find}`);
          return { contents: src.replace(mutation.find, mutation.replace), loader: a.path.endsWith('.ts') ? 'ts' : 'js' };
        });
      }
    },
  }];
  const out = await esbuild.build({ entryPoints: [P(entry)], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent', plugins, external: ['npm:*', 'jsr:*'] });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

// ── Fixtures: the live shape of "My Business" ───────────────────────────────
const B = 'biz-live';
let seq = 0;
const row = (o) => ({ id: `ef-${++seq}`, business_id: B, metadata: {}, confidence_score: 95, ...o });
const LIVE_ROWS = () => [
  row({ field_name: 'gross_receipts', accepted_normalized_value: 1250000, review_status: 'accepted', source_document_type: 'business_tax_return', document_id: 'd-btr', metadata: { fiscal_year: 2025 } }),
  row({ field_name: 'taxable_income', accepted_normalized_value: 187500, review_status: 'accepted', source_document_type: 'business_tax_return', document_id: 'd-btr', metadata: { fiscal_year: 2025 } }),
  row({ field_name: 'ordinary_business_income', accepted_normalized_value: 187500, review_status: 'accepted', source_document_type: 'business_tax_return', document_id: 'd-btr', metadata: { fiscal_year: 2025 } }),
  row({ field_name: 'annual_revenue', normalized_value: 1250000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-pl24', metadata: { fiscal_year: 2024 } }),
  row({ field_name: 'taxes', normalized_value: 31000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-pl24', metadata: { fiscal_year: 2024 } }),
  row({ field_name: 'taxes', normalized_value: 31000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-pl25', metadata: { fiscal_year: 2025 } }),
  row({ field_name: 'dependent_ssn', accepted_normalized_value: 9999, review_status: 'accepted', source_document_type: 'personal_tax_return', document_id: 'd-1040', metadata: { fiscal_year: 2025 } }),
  row({ business_id: 'biz-OTHER', field_name: 'gross_receipts', accepted_normalized_value: 7777777, review_status: 'accepted', source_document_type: 'business_tax_return', document_id: 'd-foreign', metadata: { fiscal_year: 2025 } }),
];
const RECS = [{ recommendation_key: 'tax_gap_annual', category: 'tax', estimatedImpact: 13245, title: 'Tax strategy' }];
const DOCS = [{ id: 'd-btr', name: '2025 Business Tax Return.pdf' }];
// What the model actually said in production — the prose the contract must police.
const PROD_MODEL = () => ({
  answer: 'Your revenue data is not available. Without this information, we cannot evaluate. You have paid approximately $13,245 in taxes. This figure is verified.',
  recommended_next_step: 'Gather and input your current revenue data',
  missing_data: ['Revenue data'],
});

function makeRun(E) {
  return (q, opts = {}) => {
    const rows = opts.rows || LIVE_ROWS();
    const p = E.prepareEvidenceFirstAnswer({ question: q, businessId: opts.businessId || B, access: opts.access || { businessId: B, granted: true }, fieldRows: rows, recommendations: opts.recs || RECS, documents: DOCS });
    const r = E.finalizeEvidenceFirstAnswer(opts.model ? opts.model() : PROD_MODEL(), p);
    return { p, r, state: p.contract && p.contract.resolution_state, answer: String(r.answer || ''), labels: (r.factual_answer && r.factual_answer.labels) || [], missing: r.missing_data || [], next: r.recommended_next_step || '', sources: r.supporting_sources || [], rows };
  };
}

// ── The assertion matrix (returns a map of named probes → booleans) ─────────
async function evaluate(mutation = null) {
  const E = await load(PIPELINE, mutation);
  const V = await load(VIEW, mutation);
  const N = await load(NEXT, mutation);
  // The defence-in-depth layers are probed DIRECTLY: upstream filtering would
  // otherwise hide a regression in them.
  const R = await load('base44/shared/galileo/answerEngine/resolver.ts', mutation);
  const EN = await load('base44/shared/galileo/answerEngine/envelope.ts', mutation);
  // 6D.0c.2 final cleanup — the sensitive-field predicate is ONE shared module the
  // provisional lane and the focused-document lane both IMPORT, so it is probed
  // here at its single home. (Probed directly: upstream filtering would hide a
  // regression in it.)
  const PE = await load('base44/shared/galileo/sensitiveFields.ts', mutation);
  const run = makeRun(E);
  const res = {};
  const set = (k, v) => { res[k] = !!v; };

  const rev = run('What was my revenue?');
  set('A1', rev.state === 'CONFIRMED' && rev.answer.includes('$1.25 million'));
  set('A2', !/not available|without this information/i.test(rev.answer));
  set('A3', !/gather|input/i.test(rev.next));
  set('A4', !rev.missing.some((m) => /revenue/i.test(m)));
  set('A5', rev.labels.includes('CONFIRMED DATA') && !rev.labels.includes('NO SUPPORTING DATA'));
  set('A6', rev.sources.some((s) => s.includes('2025 Business Tax Return.pdf') && s.includes('gross_receipts')));
  set('A7', !/\bverified\b/i.test(rev.answer));

  const rev24 = run('what was my revenue in 2024');
  set('A8', rev24.state === 'PROVISIONAL' && rev24.labels.includes('DOCUMENT EVIDENCE') && rev24.labels.includes('PENDING REVIEW'));

  const tax = run('What did I pay in tax?');
  set('A9', tax.p.request.concept === 'tax_payments' && tax.state === 'RELATED_ONLY');
  set('A10', !/paid approximately \$13,245/i.test(tax.answer) && /projection/i.test(tax.answer));
  set('A11', tax.missing.some((m) => /tax you actually paid/i.test(m)));
  set('A12', /upload|connect/i.test(tax.next) && tax.labels.includes('RELATED DATA'));
  set('A13', !/without this information/i.test(tax.answer));

  const inc = run('What was my income?');
  const opts = ((inc.p.contract.resolution || {}).options || []).map((o) => o.concept);
  set('A14', inc.state === 'AMBIGUOUS_CONCEPT' && ['revenue', 'net_income', 'taxable_income'].every((c) => opts.includes(c)));
  set('A15', !/not available|unavailable/i.test(inc.answer) && inc.labels.includes('CLARIFICATION NEEDED'));

  const np = run('what was my net profit');
  set('A16', np.p.request.concept === 'net_income' && np.state === 'CONFIRMED');

  // Firewall: no advisory envelope is ever admissible as a factual answer.
  const env = E.prepareEvidenceFirstAnswer({ question: 'What did I pay in tax?', businessId: B, access: { businessId: B, granted: true }, fieldRows: LIVE_ROWS(), recommendations: RECS, documents: DOCS }).envelopes;
  const forgedAdvisory = { lane: 'advisory', basis: 'actual', concepts: ['tax_payments'], evidence_state: 'CONFIRMED', value: 13245, period: { fiscal_year: 2025 }, source: {} };
  set('A17', env.advisory.length > 0 && !env.factual.some((e) => e.lane === 'advisory') && R.resolveConceptEvidence('tax_payments', [forgedAdvisory]).state === 'UNAVAILABLE');
  // Scope + access + PII.
  const foreignObs = { business_id: 'biz-OTHER', lifecycle_state: 'confirmed', canonical_key: 'revenue', value: 7777777, provenance: { source_field: 'gross_receipts' } };
  set('A18', !rev.answer.includes('7.78') && !env.factual.some((e) => e.business_id !== B) && EN.buildEvidenceEnvelopes({ businessId: B, access: { businessId: B, granted: true }, canonicalObservations: [foreignObs] }).factual.length === 0);
  const denied = E.prepareEvidenceFirstAnswer({ question: 'What was my revenue?', businessId: B, access: { businessId: 'biz-OTHER', granted: true }, fieldRows: LIVE_ROWS() });
  set('A19', denied.envelopes.denied === true && denied.envelopes.factual.length === 0);
  set('A20', !env.factual.some((e) => /ssn/i.test(e.source.field_name || '')) && env.factual.some((e) => e.source.field_name === 'taxable_income')
    && PE.isSensitiveFieldName('business_ein') && PE.isSensitiveFieldName('TIN') && PE.isSensitiveFieldName('spouseSsn') && !PE.isSensitiveFieldName('taxable_income'));

  // ── The ONE sensitive-field predicate, positively and negatively ──
  const SENSITIVE_IDS = ['SSN', 'social_security_number', 'social-social-security', 'EIN', 'employer_identification_number', 'taxpayer_identification_number', 'TIN'];
  const ELIGIBLE_FINANCIAL = ['taxable_income', 'net_income', 'ordinary_business_income', 'business_income', 'income_tax', 'tax_expense'];
  const PRESERVED_IDS = ['dependent_ssn', 'spouse_ssn', 'bank_account_number', 'routing_number', 'passport_number', 'driver_license', 'date_of_birth', 'dob', 'itin'];
  set('SENS-POS', SENSITIVE_IDS.every((n) => PE.isSensitiveFieldName(n) === true));
  set('SENS-NEG', ELIGIBLE_FINANCIAL.every((n) => PE.isSensitiveFieldName(n) === false));
  set('SENS-KEEP', PRESERVED_IDS.every((n) => PE.isSensitiveFieldName(n) === true));

  // ── The GENERAL path behavioural proof: a concept and an identifier sentinel
  //    arrive together. The concept becomes evidence; the identifier and its VALUE
  //    appear nowhere in the evidence, the contract or the answer. ──
  const ssnSentinel = row({ field_name: 'ssn', accepted_normalized_value: 219099999, review_status: 'accepted', source_document_type: 'personal_tax_return', document_id: 'd-1040', metadata: { fiscal_year: 2025 } });
  const sent = run('What was my revenue?', { rows: [...LIVE_ROWS(), ssnSentinel] });
  const sentBlob = JSON.stringify({ env: sent.p.envelopes, c: sent.p.contract, a: sent.r });
  set('SENT-GEN', !sentBlob.includes('219099999')
    && !sent.p.envelopes.factual.some((e) => /ssn/i.test(e.source.field_name || ''))
    && sent.p.envelopes.factual.some((e) => e.source.field_name === 'taxable_income'));

  // Resolution rules.
  const conflictRows = [row({ field_name: 'annual_revenue', normalized_value: 900000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-a', metadata: { fiscal_year: 2023 } }), row({ field_name: 'annual_revenue', normalized_value: 950000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-b', metadata: { fiscal_year: 2023 } })];
  set('A21', run('what was my revenue', { rows: conflictRows }).state === 'CONFLICTED');
  const dupRows = [row({ field_name: 'annual_revenue', normalized_value: 900000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-a', metadata: { fiscal_year: 2023 } }), row({ field_name: 'annual_revenue', normalized_value: 900000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-a', metadata: { fiscal_year: 2023 } })];
  const dup = run('what was my revenue', { rows: dupRows });
  set('A22', dup.state === 'PROVISIONAL' && dup.p.contract.primary_evidence.length === 1);
  const twoYears = [row({ field_name: 'annual_revenue', normalized_value: 900000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-a', metadata: { fiscal_year: 2023 } }), row({ field_name: 'annual_revenue', normalized_value: 990000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-b', metadata: { fiscal_year: 2024 } })];
  const amb = run('what was my revenue', { rows: twoYears });
  set('A23', amb.state === 'AMBIGUOUS_PERIOD' && !/not available|unavailable/i.test(amb.answer));
  const noYear = run('what was my revenue in 2019');
  set('A24', noYear.state === 'UNAVAILABLE' && noYear.p.contract.resolution.reason === 'no_evidence_for_period');
  const both = [row({ field_name: 'gross_receipts', accepted_normalized_value: 1250000, review_status: 'accepted', source_document_type: 'business_tax_return', document_id: 'd-btr', metadata: { fiscal_year: 2025 } }), row({ field_name: 'annual_revenue', normalized_value: 1100000, review_status: 'pending_review', source_document_type: 'profit_and_loss', document_id: 'd-pl25', metadata: { fiscal_year: 2025 } })];
  const prec = run('what was my revenue in 2025', { rows: both });
  set('A25', prec.state === 'CONFIRMED' && prec.answer.includes('$1.25 million'));

  // Model prose is policed, never trusted.
  const fab = run('What was my revenue?', { model: () => ({ answer: 'Revenue was $999,999 last year.', missing_data: [] }) });
  set('A26', !fab.answer.includes('999,999'));
  const adv = run('how can I reduce my tax');
  set('A27', !adv.p.contract && !adv.r.factual_answer);
  const none = run('What was my revenue?', { rows: [] });
  set('A28', none.state === 'UNAVAILABLE' && none.labels.includes('NO SUPPORTING DATA'));

  // Surface: labels, missing list and next step come from the contract only.
  const view = V.factualAnswerView({ factual: { ...rev.r.factual_answer, labels: [...rev.labels, 'NO SUPPORTING DATA'], missing: ['revenue figures'] } });
  set('A29', view.active && !view.labels.includes('NO SUPPORTING DATA') && !view.missing.some((m) => /revenue/i.test(m)));
  const step = N.resolveNextStep({ answer: { factual: rev.r.factual_answer, nextStep: 'Gather and input your current revenue data', category: 'profit' } });
  set('A30', step.text === rev.r.factual_answer.next_step.text && !/gather/i.test(step.text));

  // Nothing writes: the rows the engine read are untouched.
  const before = JSON.stringify(rev.rows);
  makeRun(E)('What was my revenue?', { rows: rev.rows });
  set('NO_WRITE', JSON.stringify(rev.rows) === before);

  // ── Live-shape production cases ──
  set('LIVE-A', res.A1 && res.A2 && res.A3 && res.A4);         // revenue said missing beside confirmed revenue
  set('LIVE-B', res.A9 && res.A10 && res.A11);                  // tax paid answered with the $13,245 opportunity
  set('LIVE-C', res.A14 && res.A15);                            // income called unavailable
  set('LIVE-D', res.A29 && res.A30);                            // surface next step contradicting the evidence
  return res;
}

const DESC = {
  A1: 'confirmed revenue answers with the figure', A2: 'confirmed revenue is never called missing', A3: 'next step never asks for a known metric',
  A4: 'missing list excludes the answered metric', A5: 'CONFIRMED DATA label, never NO SUPPORTING DATA', A6: 'sources name document and field',
  A7: 'a confirmed figure is never called verified', A8: 'unreviewed revenue is labelled document evidence, pending review',
  A9: '"pay in tax" resolves to tax_payments → related only', A10: 'the $13,245 opportunity is never presented as tax paid',
  A11: 'tax paid is listed as the missing item', A12: 'tax-paid next step asks for the right document', A13: 'dangling "without this information" is removed',
  A14: '"income" asks which figure, offering revenue / net / taxable', A15: '"income" is never called unavailable',
  A16: '"net profit" resolves to confirmed net income', A17: 'opportunity firewall: advisory never answers a factual question',
  A18: 'another business\u2019s rows never become evidence', A19: 'unauthorized actor gets no evidence at all',
  A20: 'PII excluded; taxable_income is NOT mistaken for an EIN', A21: 'disagreeing figures resolve CONFLICTED',
  'SENS-POS': 'identifiers are excluded (SSN / EIN / employer_identification_number / taxpayer_identification_number)',
  'SENS-NEG': 'legitimate financial concepts stay eligible (taxable/net/ordinary/business income, income tax, tax expense)',
  'SENS-KEEP': 'every previously covered identifier protection is preserved',
  'SENT-GEN': 'general path: the identifier sentinel never reaches evidence, contract or answer, while the concept does',
  A22: 're-extraction of the same value is not a conflict', A23: 'several periods → ask, never "missing"',
  A24: 'a named year with no evidence is unavailable for that period', A25: 'reviewed evidence outranks unreviewed for the same period',
  A26: 'a model-invented figure is dropped', A27: 'advisory questions are not forced through the factual contract',
  A28: 'no evidence at all → NO SUPPORTING DATA', A29: 'surface strips impossible labels / missing items',
  A30: 'surface next step is the contract\u2019s, not the model\u2019s', NO_WRITE: 'the engine writes nothing',
  'LIVE-A': 'production: revenue', 'LIVE-B': 'production: tax paid', 'LIVE-C': 'production: income', 'LIVE-D': 'production: surface next step',
};

const MUTATIONS = [
  { id: 'M1', what: 'opportunity firewall removed', file: 'base44/shared/galileo/answerEngine/resolver.ts', find: "if (e.basis !== def.basis || e.lane === 'advisory') return false;", replace: '', probe: 'A17' },
  { id: 'M2', what: 'canonical tier order inverted (provisional first)', file: 'base44/shared/galileo/answerEngine/resolver.ts', find: "export const EVIDENCE_TIERS = ['VERIFIED', 'CONFIRMED', 'PROVISIONAL'];", replace: "export const EVIDENCE_TIERS = ['PROVISIONAL', 'CONFIRMED', 'VERIFIED'];", probe: 'A25' },
  { id: 'M3', what: 'dedupe disabled (re-extraction becomes conflict)', file: 'base44/shared/galileo/answerEngine/resolver.ts', find: 'if (seen.has(k)) return false;', replace: '', probe: 'A22' },
  { id: 'M4', what: 'period ambiguity collapsed to newest', file: 'base44/shared/galileo/answerEngine/resolver.ts', find: 'if (years.length > 1) {', replace: 'if (false) {', probe: 'A23' },
  { id: 'M5', what: 'business scope filter dropped', file: 'base44/shared/galileo/answerEngine/envelope.ts', find: 'const inScope = (x: any) => x && x.business_id === businessId;', replace: 'const inScope = (x: any) => !!x;', probe: 'A18' },
  { id: 'M6', what: 'access check bypassed', file: 'base44/shared/galileo/answerEngine/envelope.ts', find: 'return !!(access && access.granted === true && businessId && access.businessId === businessId);', replace: 'return true;', probe: 'A19' },
  { id: 'M7', what: 'PII token filter removed', file: 'base44/shared/galileo/sensitiveFields.ts', find: 'if (tokens.some((t) => SENSITIVE_FIELD_TOKENS.includes(t))) return true;', replace: '', probe: 'A20' },
  { id: 'M8', what: 'PII matched as substring again (EIN in taxable income)', file: 'base44/shared/galileo/sensitiveFields.ts', find: 'export const SENSITIVE_FIELD_PHRASES = PII_FIELD_DENYLIST.filter((d) => d.length > 4);', replace: 'export const SENSITIVE_FIELD_PHRASES = PII_FIELD_DENYLIST;', probe: 'A14' },
  { id: 'M15', what: 'employer identification number dropped from the identifier list', file: 'base44/shared/galileo/sensitiveFields.ts', find: "'employeridentificationnumber', 'employerid',\n", replace: '', probe: 'SENS-POS' },
  { id: 'M9', what: 'generic absence sentence kept', file: 'base44/shared/galileo/answerEngine/contract.ts', find: 'if (GENERIC_ABSENT.test(s)) return false;', replace: '', probe: 'A13' },
  { id: 'M10', what: 'model money filter removed', file: 'base44/shared/galileo/answerEngine/contract.ts', find: 'if (moneyValues(s).some((v) => !allowed.some((a: number) => near(v, a)))) return false;', replace: '', probe: 'A10' },
  { id: 'M11', what: 'model next step allowed to win', file: 'base44/shared/galileo/answerEngine/contract.ts', find: 'r.recommended_next_step = c.next_step.text || null;', replace: 'r.recommended_next_step = r.recommended_next_step || c.next_step.text || null;', probe: 'A3' },
  { id: 'M12', what: 'model missing list allowed to win', file: 'base44/shared/galileo/answerEngine/contract.ts', find: 'r.missing_data = [...c.missing];', replace: 'r.missing_data = r.missing_data || [...c.missing];', probe: 'A4' },
  { id: 'M13', what: 'surface keeps NO SUPPORTING DATA beside evidence', file: VIEW, find: "if (hasPrimary) labels = labels.filter((l) => l !== 'NO SUPPORTING DATA');", replace: '', probe: 'A29' },
  { id: 'M14', what: 'surface next step ignores the contract', file: NEXT, find: 'if (answer.factual) return factualNextStep(answer.factual.next_step);', replace: '', probe: 'A30' },
];

(async () => {
  let failures = 0;
  const base = await evaluate();
  for (const [k, v] of Object.entries(base)) {
    if (!v) failures++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${k.padEnd(8)} ${DESC[k] || ''}`);
  }

  // Wiring: prepare runs BEFORE the model, finalize runs LAST.
  const entry = fs.readFileSync(P('base44/functions/askGalileo/entry.ts'), 'utf8');
  const iPrep = entry.indexOf('prepareEvidenceFirstAnswer({');
  const iLLM = entry.indexOf('FACTUAL ANSWER CONTRACT');
  const iFin = entry.indexOf('finalizeEvidenceFirstAnswer(llmResponse');
  const iStore = entry.indexOf('factual_answer: llmResponse.factual_answer');
  const wired = iPrep > 0 && iPrep < iLLM && iLLM < iFin && iFin < iStore;
  if (!wired) failures++;
  console.log(`${wired ? 'PASS' : 'FAIL'}  WIRING   askGalileo resolves evidence before the model and enforces the contract last`);

  for (const m of MUTATIONS) {
    let caught;
    try {
      const r = await evaluate(m);
      caught = r[m.probe] === false;
    } catch (e) {
      caught = false;
      console.log(`      ${m.id} error: ${e.message}`);
    }
    if (!caught) failures++;
    console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${m.id.padEnd(5)} ${m.what} (probe ${m.probe})`);
  }

  console.log(failures ? `\n${failures} failure(s)` : `\nEvidence-first answer engine: all ${Object.keys(base).length + 1} checks pass, ${MUTATIONS.length}/${MUTATIONS.length} mutations caught`);
  process.exit(failures ? 1 : 0);
})();