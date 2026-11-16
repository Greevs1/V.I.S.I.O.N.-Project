/**
 * CONNECTED BUSINESS — CB-002.1 CREDENTIAL ROTATION LIFECYCLE CHECKS
 *
 * Extracted from scripts/connectedBusinessFoundation.test.cjs so the harness
 * stays editable; the harness requires this module and calls run() + mutation().
 * Every check is additive — nothing here weakens a CB-001, CB-001.1, CB-001.2,
 * CB-002 or CB-003 check.
 *
 * WHAT THIS PHASE EXISTS TO FIX
 *   The deployed provider_credential_rotate refused a predecessor ONLY when its
 *   status was one of two terminal states. That is a BLACKLIST, and a blacklist
 *   fails OPEN for every state it does not enumerate — including `pending`, which
 *   the column DEFAULT produces, and including any state a future vocabulary
 *   change might add. The rule is now an ALLOWLIST: `active`, and nothing else.
 *
 *   The single most dangerous way this fix can be undone is in the HARNESS: the
 *   original CB-37e asserted the defective membership test as correct, so a
 *   CORRECT deployment would have failed while the defect stayed pinned. CB-86
 *   exists to make that specific regression detectable, and mutation MU21-21
 *   proves CB-86 detects it.
 *
 * WHAT CB-87 EXISTS TO FIX — TEST-STATE CONTAMINATION
 *   The adversarial suite's positive control was held in the same generic scratch
 *   variables every later section reused, so R8 and B1/B2/B3 were written against
 *   the positive pair but, by the time they ran, no longer READ it. R8 could only
 *   ever report FAIL against a correct deployment; B3 compared two unrelated rows;
 *   and B1/B2 passed for the wrong reason, proving nothing about the rotation.
 *
 *   That class of defect is invisible to a positional check — every affected
 *   assertion still NAMED the pair. CB-87 therefore asserts the ISOLATION itself:
 *   the positive identities are dedicated, assigned exactly once, never written
 *   again, and the only identities R8 / B1-B3 / R10 may read. MU21-22 … MU21-26
 *   prove CB-87 catches each way that isolation can be undone.
 *
 * SIGNATURES — ONE ARTIFACT, ONE STRING
 *   Every check takes the SOURCE TEXT of the artifact it judges (a string), so a
 *   mutated source can be handed straight to it by the mutation runner. Only the
 *   presence check reads all four at once.
 *
 * The module is pure: it reads strings, calls the supplied `ok`, and the supplied
 * `collect` for mutation isolation. It writes nothing.
 */
module.exports = function createCb21Checks({ ok, stripComments, collect }) {
  const TARGET = 'provider_credential_rotate';
  const ACL_SIG = 'uuid, text, timestamptz, jsonb';
  const SEARCH_PATH = 'set search_path = pg_catalog, vault, public';
  const NAMESPACE = '00000000-0000-0000-0000-0000000c21';
  const SECRET_MARKER = 'vision_test_secret_cb0021_';

  /** Exactly what the migration must contain, quoted verbatim for the mutations. */
  const GATE_BLOCK = `  if v_pred_status <> 'active' then
    raise exception 'provider_credential_rotate: predecessor credential is not active and cannot be rotated'
      using errcode = '42501';
  end if;`;
  const VAULT_LINE = `  v_vault_id := vault.create_secret(p_secret, 'vision-provider-credential:' || v_successor_id::text);`;

  const GRID_IDS = ['CB21-U0',
    'CB21-R0', 'CB21-R1', 'CB21-R2', 'CB21-R3', 'CB21-R4', 'CB21-R5', 'CB21-R6',
    'CB21-R7', 'CB21-R8', 'CB21-R9', 'CB21-R10',
    'CB21-B1', 'CB21-B2', 'CB21-B3',
    'CB21-S1', 'CB21-S2', 'CB21-S3',
    'CB21-A1', 'CB21-A2', 'CB21-A3', 'CB21-A4',
    'CB21-V1', 'CB21-V2',
    'CB21-N1', 'CB21-N2', 'CB21-F1', 'CB21-C1'];
  const CERT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'AA', 'AB', 'AC', 'AD'];
  const ADMITTED_BINDINGS = [
    ["''plaid_access''\\s+then\\s+''plaid''", 'plaid_access -> plaid'],
    ["''quickbooks_access''\\s+then\\s+''quickbooks''", 'quickbooks_access -> quickbooks'],
    ["''quickbooks_refresh''\\s+then\\s+''quickbooks''", 'quickbooks_refresh -> quickbooks'],
  ];

  /** The full definition of a function, from CREATE through its closing $$; */
  function fnBlock(src, name) {
    const start = src.indexOf(`create or replace function public.${name}(`);
    if (start < 0) return null;
    const end = src.indexOf('$$;', start);
    return end < 0 ? null : src.slice(start, end + 3);
  }

  /** Just the body of a function — everything between `as $$` and `$$;`. */
  function bodyOf(src, name) {
    const block = fnBlock(src, name);
    if (!block) return '';
    const open = block.indexOf('as $$');
    const close = block.lastIndexOf('$$;');
    return open < 0 || close < 0 ? '' : block.slice(open + 5, close);
  }

  /** The EXECUTABLE body: `--` comments removed, so a prose mention of a rule or
   *  a call can never be mistaken for the rule or the call. */
  function execBodyOf(src, name) {
    return stripComments(bodyOf(src, name));
  }

  /** The header of a function — everything before its body. */
  function headerOf(src, name) {
    const block = fnBlock(src, name);
    return block ? block.slice(0, block.indexOf('as $$')) : '';
  }

  /** Deploy-time statements only: every dollar-quoted body replaced. */
  function deployTimeSql(src) {
    return src.replace(/\$\$[\s\S]*?\$\$/g, '$$BODY$$');
  }

  // ── CB-71 · presence ──────────────────────────────────────────────────────
  function checkPresence(src) {
    ok('CB-71a', [src.mig, src.cert, src.adv, src.res].every((s) => s && s.length > 0),
      'all four CB-002.1 artifacts must exist');
    ok('CB-71b', Boolean(src.cb2Module && src.cb2Module.length > 0),
      'the CB-002 module source must be supplied, so the superseded predecessor check can be verified rather than assumed');
  }

  // ── CB-72 · the phase is surgical: exactly one function, nothing else ─────
  function checkMigrationScope(migSrc) {
    const live = stripComments(migSrc);
    const deploy = deployTimeSql(live);

    const created = [...deploy.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
    ok('CB-72a', created.length === 1 && created[0] === TARGET,
      `exactly one function may be replaced, and it must be ${TARGET}; found ${JSON.stringify(created)}`);

    const otherDdl = [
      /alter\s+table/i, /create\s+table/i, /create\s+(unique\s+)?index/i,
      /create\s+(materialized\s+)?view/i, /create\s+policy/i, /create\s+trigger/i,
      /create\s+sequence/i, /create\s+schema/i, /create\s+type/i, /create\s+extension/i,
      /alter\s+default\s+privileges/i, /^\s*drop\b/im,
    ].filter((re) => re.test(deploy));
    ok('CB-72b', otherDdl.length === 0,
      `CB-002.1 must create or alter NO other object — no table, index, view, policy, trigger, sequence, schema, type, extension or default privilege: found ${otherDdl.map(String).join(' ')}`);

    const stmts = deploy.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const grants = stmts.filter((s) => /^(grant|revoke)\b/i.test(s));
    ok('CB-72c', grants.length === 5,
      `exactly five privilege statements must appear (four REVOKEs + one GRANT): found ${grants.length}`);
    const strayGrants = grants.filter((s) => !/on function public\.provider_credential_rotate\(/i.test(s));
    ok('CB-72d', strayGrants.length === 0,
      `every GRANT/REVOKE must target the rotate function alone — found: ${strayGrants.join(' | ') || '<none>'}`);
    ok('CB-72e', !/on\s+table/i.test(deploy),
      'no table privilege may be granted or revoked in this phase — the ACL tightening is a separate, separately-certified concern');

    const begins = (deploy.match(/\bbegin\s*;/gi) || []).length;
    const commits = (deploy.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-72f', begins === 1 && commits === 1,
      `CB-002.1 must be one committing transaction (begins=${begins}, commits=${commits})`);

    // Judged on executable SQL with string literals removed, so a prose mention
    // cannot fail the build while a real write cannot hide behind one.
    const code = deploy.replace(/'([^']|'')*'/g, "''");
    const facts = ['business_facts', 'business_fact_evidence', 'business_fact_conflicts']
      .filter((t) => code.toLowerCase().includes(t));
    ok('CB-72g', facts.length === 0,
      `CB-002.1 must reference no Digital Twin fact table — found ${facts.join(', ')}`);
    ok('CB-72h', !/\b(dblink|pg_net|fetch)\b/i.test(code),
      'CB-002.1 must call no provider and no network');

    // Judged on the RAW source: on this path even a COMMENT naming the shared
    // connector is a violation, which is the CB-002/CB-003 rule.
    ok('CB-72i', !/asServiceRole\.connectors|getConnection\s*\(\s*['"]supabase['"]/i.test(migSrc),
      'the Base44 shared Supabase connector must never appear on the CB-002.1 path');
  }

  // ── CB-73 · the signature is unchanged ───────────────────────────────────
  function checkSignature(migSrc) {
    const header = headerOf(migSrc, TARGET);
    ok('CB-73a', Boolean(header), `${TARGET} must be defined by this migration`);
    ok('CB-73b', /p_predecessor_credential_id\s+uuid/.test(header)
      && /p_secret\s+text/.test(header)
      && /p_expires_at\s+timestamptz default null/.test(header)
      && /p_rotation_metadata_safe\s+jsonb\s+default '\{\}'::jsonb/.test(header),
      'the parameter list must be exactly as certified — no parameter added, removed or retyped');
    ok('CB-73c', /returns\s+uuid/i.test(header), 'the return type must remain uuid');
    ok('CB-73d', /language\s+plpgsql/i.test(header), 'the language must remain plpgsql');
  }

  // ── CB-74 · hardening ────────────────────────────────────────────────────
  function checkHardening(migSrc) {
    const header = headerOf(migSrc, TARGET);
    ok('CB-74a', /security\s+definer/i.test(header),
      'SECURITY DEFINER is required: the gate must be evaluated as the owner, not as the caller');
    ok('CB-74b', header.includes(SEARCH_PATH),
      `the search_path must be pinned exactly: \`${SEARCH_PATH}\``);
    ok('CB-74c', !/security\s+invoker/i.test(stripComments(migSrc)),
      'no SECURITY INVOKER substitution may appear anywhere in this phase');
  }

  // ── CB-75 · ownership ────────────────────────────────────────────────────
  function checkOwner(migSrc) {
    const live = stripComments(migSrc);
    ok('CB-75', new RegExp(`alter function public\\.${TARGET}\\(uuid, text, timestamptz, jsonb\\) owner to postgres;`).test(live),
      'the owner must be re-pinned to postgres — a SECURITY DEFINER function runs as its OWNER');
  }

  // ── CB-76 · the gate is the ACTIVE-ONLY allowlist ─────────────────────────
  function checkActiveOnlyGate(migSrc) {
    const body = execBodyOf(migSrc, TARGET);
    const forms = [...body.matchAll(/v_pred_status\s*(?:<>|is\s+distinct\s+from)\s*'active'/gi)].length;
    ok('CB-76a', forms === 1,
      `the predecessor rule must be exactly ONE allowlist comparison against 'active' — found ${forms}`);

    const at = body.search(/v_pred_status\s*(?:<>|is\s+distinct\s+from)\s*'active'/i);
    const tail = at >= 0 ? body.slice(at, at + 400) : '';
    ok('CB-76b', /raise\s+exception/i.test(tail) && /errcode\s*=\s*'42501'/i.test(tail),
      'the gate must RAISE on every non-active predecessor, preserving the SQLSTATE 42501 class');

    const other = [...body.matchAll(/v_pred_status\s*(?:=|<>)\s*'(?!active')[a-z_]+'/gi)].length;
    ok('CB-76c', other === 0,
      `no comparison of the predecessor status may target any other value — found ${other}`);
  }

  // ── CB-77 · no membership test can decide the rule ───────────────────────
  function checkNoBlacklist(migSrc) {
    const body = execBodyOf(migSrc, TARGET);
    const membership = [...body.matchAll(/\bv_pred_status\b[^;\n]{0,60}?\b(?:not\s+)?in\s*\(/gi)].length;
    ok('CB-77a', membership === 0,
      `the predecessor rule must NEVER be a membership test — a blacklist fails OPEN for every state it does not enumerate — found ${membership}`);
    ok('CB-77b', !/in\s*\(\s*'revoked'\s*,\s*'superseded'\s*\)/i.test(body),
      'the previous terminal-state membership test must not reappear as the rule');
  }

  // ── CB-78 · ORDER IS A SECURITY PROPERTY ─────────────────────────────────
  function checkGateOrder(migSrc) {
    const body = execBodyOf(migSrc, TARGET);
    const gate = body.search(/v_pred_status\s*(?:<>|is\s+distinct\s+from)\s*'active'/i);
    const vault = body.search(/vault\.create_secret/i);
    ok('CB-78', gate > -1 && vault > -1 && gate < vault,
      `the status gate MUST precede vault.create_secret, so a refused rotation creates ZERO Vault material (gate@${gate}, vault@${vault})`);
  }

  // ── CB-79 · the successor inherits the unit ───────────────────────────────
  function checkInheritance(migSrc) {
    const body = bodyOf(migSrc, TARGET);
    const header = headerOf(migSrc, TARGET);
    ok('CB-79a', !/p_business_connection_id|p_credential_type/.test(header),
      'rotate must NOT accept a connection or a credential_type — both are inherited from the predecessor, so a cross-unit successor is unrepresentable');
    ok('CB-79b', /v_pred_conn/.test(body) && /v_pred_bus/.test(body) && /v_pred_type/.test(body),
      "the successor must be built from the predecessor's connection, business and type");
    ok('CB-79c', /values\s*\(\s*v_successor_id,\s*v_pred_conn,\s*v_pred_bus,\s*v_pred_type/.test(body),
      'the successor INSERT must place the inherited unit values in that exact order');
  }

  // ── CB-80 · the rotation ordering ────────────────────────────────────────
  function checkOrdering(migSrc) {
    const body = bodyOf(migSrc, TARGET);
    const atInsert = body.indexOf("'pending'");
    const atSupersede = body.indexOf("set status = 'superseded'");
    const atPromote = body.indexOf("set status = 'active'");
    ok('CB-80a', atInsert > -1 && atSupersede > atInsert && atPromote > atSupersede,
      `rotation order must be: insert the successor as pending -> retire the predecessor with the pointer -> promote the successor to active (insert@${atInsert}, supersede@${atSupersede}, promote@${atPromote})`);
    ok('CB-80b', /superseded_by_credential_id = v_successor_id/.test(body),
      'the predecessor must record the successor pointer in the same UPDATE that retires it');
    ok('CB-80c', /return v_successor_id;/.test(body), 'the successor id must still be returned');
  }

  // ── CB-81 · rotation destroys no predecessor material ────────────────────
  function checkNoMaterialDestruction(migSrc) {
    ok('CB-81', !/delete\s+from\s+vault\.secrets/i.test(execBodyOf(migSrc, TARGET)),
      "rotate must NOT destroy the predecessor's Vault material — retirement is an explicit revoke, never an implied side effect of rotation");
  }

  // ── CB-82 · the EXECUTE lockdown, exactly ────────────────────────────────
  function checkAcl(migSrc) {
    const live = stripComments(migSrc);

    const missing = ['PUBLIC', 'anon', 'authenticated', 'service_role'].filter((r) => !new RegExp(
      `revoke all on function public\\.${TARGET}\\(uuid, text, timestamptz, jsonb\\) from ${r};`).test(live));
    ok('CB-82a', missing.length === 0,
      `every role must be explicitly revoked — defaults are never relied on — missing: ${missing.join(', ')}`);

    const grant = `grant execute on function public.${TARGET}(${ACL_SIG}) to service_role;`;
    ok('CB-82b', live.includes(grant), 'service_role must receive EXECUTE — the capability, not an authorization');

    const grants = [...live.matchAll(/grant\s+[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, ' ').trim());
    ok('CB-82c', grants.length === 1 && /^grant execute on function public\.provider_credential_rotate\(uuid, text, timestamptz, jsonb\) to service_role;$/i.test(grants[0] || ''),
      `exactly one GRANT may appear, and it must be the service_role EXECUTE — found ${JSON.stringify(grants)}`);

    const revokes = (live.match(/revoke\s+[^;]*;/gi) || []).length;
    ok('CB-82d', revokes === 4,
      `exactly four REVOKEs must appear (PUBLIC, anon, authenticated, service_role) — found ${revokes}`);

    ok('CB-82e', !/grant\s+[^;]*\bto\s+(PUBLIC|anon|authenticated)\b/i.test(live),
      'no browser role may ever be granted EXECUTE');

    const lastRevoke = live.lastIndexOf(`revoke all on function public.${TARGET}`);
    const grantAt = live.indexOf(grant);
    ok('CB-82f', lastRevoke > -1 && grantAt > lastRevoke,
      'REVOKE-then-GRANT is a correctness property — the reverse lands on nothing and locks every caller out');
  }

  // ── CB-83 · the certification proves integrity STRUCTURALLY ──────────────
  function checkCertificationStructure(certSrc) {
    const live = stripComments(certSrc);
    ok('CB-83a', /array\['superseded_by_credential_id','business_id'\]/.test(live)
      && /array\['id','business_id'\]/.test(live),
      'the certification must identify the same-business supersession FK structurally, by its ORDERED column arrays');
    ok('CB-83b', /array\['superseded_by_credential_id','business_connection_id','credential_type'\]/.test(live)
      && /array\['id','business_connection_id','credential_type'\]/.test(live),
      'the certification must identify the rotation-unit FK structurally, by its ORDERED column arrays');
    ok('CB-83c', /array\['business_connection_id','credential_type'\]/.test(live)
      && /pg_get_expr\(i\.indpred/.test(live) && /indkey::int2\[\]/.test(live),
      'the one-active index must be identified by its key columns AND its predicate, not by its name');
    ok('CB-83d', /conname::text/.test(live) && !/conname\s*=\s*'/.test(live),
      'constraint names must be compared as TEXT against the catalog value, never by an implicit name-typed comparison');
    ok('CB-83e', /unnest\(c\.conkey\) with ordinality/.test(live),
      'key columns must be read IN ORDER, so a reordered constraint cannot pass');
  }

  // ── CB-83f–i · the certification grid, and what it must NOT say ──────────
  function checkCertificationGrid(certSrc) {
    const ids = [...certSrc.matchAll(/union all select \d+, '([A-Z]{1,2})'/g)].map((m) => m[1]);
    const first = (certSrc.match(/select 1 as ord, '([A-Z]{1,2})' as id/) || [])[1];
    const all = first ? [first, ...ids] : ids;
    ok('CB-83f', all.length === CERT_IDS.length && new Set(all).size === all.length
      && CERT_IDS.every((id) => all.includes(id)),
      `certification grid drift: found ${all.length} row(s) ${JSON.stringify(all)}; expected ${CERT_IDS.length}`);

    const writes = stripComments(certSrc).match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/gim) || [];
    ok('CB-83g', writes.length === 0, `the certification must be READ-ONLY — found: ${writes.join(', ')}`);
    ok('CB-83h', /'BLOCKER'/.test(certSrc) && /REAL-CREDENTIAL USE/.test(certSrc),
      'the real-credential gate must be an explicitly reported BLOCKER row — a verdict SQL cannot close');
    ok('CB-83i', !/root key|root-key|custody/i.test(certSrc),
      'Supabase-managed root-key custody is CLOSED externally: no stale custody language may be resurrected as an open blocker');
  }

  // ── CB-84 · provider bindings unchanged, siblings untouched ──────────────
  function checkProviderBindings(certSrc, migSrc) {
    const live = stripComments(certSrc);
    const absent = ADMITTED_BINDINGS.filter(([frag]) => !certSrc.includes(frag)).map(([, label]) => label);
    ok('CB-84a', absent.length === 0,
      `the certification must assert the three admitted bindings exactly as deployed — missing: ${absent.join(', ')}`);
    ok('CB-84b', /f\.put_pairs = 9/.test(live),
      'all nine bindings must be counted, so a binding silently dropped from the CASE is caught');
    ok('CB-84c', !/create\s+or\s+replace\s+function\s+public\.provider_credential_(put|resolve|revoke)/i.test(stripComments(migSrc)),
      'CB-002.1 must not redefine put, resolve or revoke');
    ok('CB-84d', !/when\s+'[a-z_]+'\s+then/i.test(stripComments(migSrc)),
      'the migration must contain no provider-binding CASE of its own — the pair set is untouched by this phase');
  }

  // ── CB-85 · the resolve contract is intact and still exact ───────────────
  function checkResolveContract(certSrc, migSrc) {
    const live = stripComments(certSrc);
    const required = [
      "status = ''active''",
      "superseded_by_credential_id is null",
      "expires_at is null or c.expires_at > clock_timestamp()",
      "bc.status not in",
      'p_credential_id',
      "'uuid, uuid, text'",
    ];
    const missing = required.filter((frag) => !live.includes(frag));
    ok('CB-85a', missing.length === 0,
      `the certification must assert every resolve predicate — missing: ${missing.join(' | ')}`);
    ok('CB-85b', /resolve_ok/.test(live), 'the resolve predicates must feed a single verdict');
    ok('CB-85c', !/create\s+or\s+replace\s+function\s+public\.provider_credential_resolve/i.test(stripComments(migSrc)),
      'the resolve function must not be redefined by this phase');
  }

  // ── CB-86 · the harness revision, and the artifact structure ─────────────
  function checkHarnessRevision(advSrc, resSrc, cb2ModuleSrc) {
    const mod = cb2ModuleSrc || '';

    ok('CB-86a', !/v_pred_status in \\\(/.test(mod),
      'the CB-002 module must no longer pin the terminal-state membership test as the predecessor rule — a harness that asserts the defect makes a CORRECT deployment fail');
    ok('CB-86b', !/in \\\('revoked', 'superseded'\\\)/.test(mod),
      'the superseded membership test must not be asserted anywhere in the CB-002 module');
    ok('CB-86c', /CB-002\.1/.test(mod),
      'the revised predecessor check must name the phase that supersedes it, so the revision is visible where it matters');

    // ── the adversarial artifact ────────────────────────────────────────────
    const live = stripComments(advSrc);
    const stmts = live.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const last = stmts[stmts.length - 1];
    const rowReturning = stmts.filter((s) => /^select\b/i.test(s));
    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const rollbacks = (live.match(/\brollback\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;

    ok('CB-86d', begins === 1 && rollbacks === 1 && commits === 0 && /^rollback$/i.test(last),
      `the adversarial suite must be ONE rollback-only transaction whose final executable statement is ROLLBACK (begins=${begins}, rollbacks=${rollbacks}, commits=${commits})`);
    ok('CB-86e', /cb0021_adversarial_results/.test(rowReturning[rowReturning.length - 1] || '')
      && !/cb001_adversarial_results|cb002_adversarial_results/.test(advSrc),
      'the verdict grid must be the last row-returning statement, and no earlier phase ledger may be reused');

    const realShapes = [
      /eyJ[A-Za-z0-9_-]{10,}/, /access-sandbox-/, /sandbox\.plaid\.com|production\.plaid\.com/,
      /quickbooks\.api\.intuit\.com/, /access_token\s*[=:]/, /refresh_token\s*[=:]/, /client_secret\s*[=:]/,
    ].filter((re) => re.test(advSrc));
    ok('CB-86f', advSrc.includes(SECRET_MARKER) && realShapes.length === 0,
      `every payload must be the synthetic marker ${SECRET_MARKER} and no real credential shape may appear — found ${realShapes.map(String).join(' ')}`);
    ok('CB-86g', advSrc.includes(NAMESPACE),
      `the suite must use the reserved CB-002.1 namespace ${NAMESPACE}xx`);

    const missingIds = GRID_IDS.filter((id) => !advSrc.includes(`'${id}'`));
    ok('CB-86h', missingIds.length === 0,
      `adversarial grid incomplete — missing ${missingIds.join(', ')}`);

    // ── the residue companion ───────────────────────────────────────────────
    const res = stripComments(resSrc);
    ok('CB-86i', !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|begin|commit|rollback|do)\b/i.test(res),
      'the residue companion must be READ-ONLY: no write, no DDL, no transaction, nothing to clean up');
    ok('CB-86j', /as residual_connections/.test(resSrc) && /as residual_credentials/.test(resSrc)
      && /as residual_vault_secrets/.test(resSrc) && /as residual_attempts/.test(resSrc)
      && /as cleanup_verdict/.test(resSrc),
      'the residue companion must report all four counters and a verdict');
    ok('CB-86k', /then 'PASS'/.test(resSrc) && /else 'FAIL'/.test(resSrc),
      'the cleanup verdict must be PASS only when every residue counter is zero');
  }

  // ── CB-87 · the positive-control identities are ISOLATED ─────────────────
  // Test-state contamination is invisible to a positional check: the first version
  // of the adversarial suite still NAMED the positive pair in R8 and B1/B2/B3
  // while READING a variable later sections had overwritten. So this asserts the
  // isolation itself — dedicated variables, assigned exactly once, never written
  // again, and the only identities those assertions and the R10 proof may read.
  function checkPositiveIsolation(advSrc) {
    const POSITIVE = ['v_positive_pred', 'v_positive_succ'];
    const SCRATCH = ['v_negative_pred', 'v_negative_target', 'v_struct_pred',
      'v_struct_target', 'v_auth_pred', 'v_auth_succ'];
    const LEGACY = ['v_pred', 'v_succ', 'v_target'];

    const code = stripComments(advSrc);
    const flat = code.replace(/\s+/g, ' ');
    const count = (fragment) => flat.split(fragment).length - 1;
    const decl = (code.match(/declare([\s\S]*?)\nbegin\b/i) || [])[1] || '';

    ok('CB-87a', new RegExp(`\\b${POSITIVE[0]}\\s+uuid`).test(decl)
      && new RegExp(`\\b${POSITIVE[1]}\\s+uuid`).test(decl),
      'the positive control must hold DEDICATED identities — a shared scratch variable is exactly what let a later section overwrite the pair R8 and B1/B2/B3 assert about');

    const legacyDeclared = LEGACY.filter((v) => new RegExp(`\\b${v}\\s+uuid`).test(decl));
    ok('CB-87b', legacyDeclared.length === 0,
      `no generic identity variable may be declared — every surviving identity must be test-scoped: found ${legacyDeclared.join(', ') || '<none>'}`);

    const missingScratch = SCRATCH.filter((v) => !new RegExp(`\\b${v}\\s+uuid`).test(decl));
    ok('CB-87c', missingScratch.length === 0,
      `every scratch section must own a declared variable: missing ${missingScratch.join(', ') || '<none>'}`);

    ok('CB-87d', count('v_positive_pred := public.provider_credential_put(') === 1
      && count('v_positive_succ := public.provider_credential_rotate(v_positive_pred,') === 1,
      'the positive identities must be assigned exactly once, and only by the positive control');

    const rewritten = [...code.matchAll(/\binto\s+(v_positive_pred|v_positive_succ)\b/g)].map((m) => m[1]);
    ok('CB-87e', rewritten.length === 0,
      `no statement after the positive control may WRITE a positive identity — that is the contamination itself: found ${rewritten.join(', ') || '<none>'}`);

    // Both R8 reads are pinned as COMPLETE phrases. A bare `where id = …` fragment
    // is also produced by the positive control's own status read, so it cannot tell
    // whether R8 still reads the pair at all — the blind spot that let a
    // wrongly-targeted MU21-26 pass as "undetected" instead of reporting itself.
    ok('CB-87f', flat.includes('select count(*) into v_n from public.provider_credentials c join vault.secrets s on s.id = c.vault_secret_id where c.id = v_positive_pred or c.id = v_positive_succ;')
      && flat.includes('select (vault_secret_id is not null) into v_ok from public.provider_credentials where id = v_positive_pred;'),
      'CB21-R8 must examine exactly the positive-control predecessor and successor, in BOTH of its reads');

    ok('CB-87g', flat.includes('join public.provider_credentials p on p.id = v_positive_pred')
      && flat.includes('where c.id = v_positive_succ;'),
      'CB21-B1/B2/B3 must compare the successor against the positive-control predecessor — a scratch row would make B1/B2 pass vacuously and B3 compare two unrelated credentials');

    const mixed = code.split(';').filter((s) => POSITIVE.some((p) => s.includes(p))
      && SCRATCH.some((v) => s.includes(v)));
    ok('CB-87h', mixed.length === 0,
      `a positive identity and a scratch identity may never appear in the same statement — the assertion would then be about a different row than the one it names (found ${mixed.length})`);

    const legacyUsed = LEGACY.filter((v) => new RegExp(`\\b${v}\\b`).test(code));
    ok('CB-87i', legacyUsed.length === 0,
      `the generic identity names must be gone from the executable suite: found ${legacyUsed.join(', ') || '<none>'}`);

    // R10's two reads are pinned as COMPLETE phrases as well: `where c.id =
    // v_positive_succ;` also occurs in the B1-B3 section, so a fragment could not
    // prove that the isolation proof itself still reads the pair.
    ok('CB-87j', flat.includes("'CB21-R10'")
      && flat.includes('into v_pos_pred_status, v_pos_pred_business, v_pos_pred_connection, v_pos_pred_type, v_pos_pred_material from public.provider_credentials c where c.id = v_positive_pred;')
      && flat.includes('into v_pos_succ_status, v_pos_succ_business, v_pos_succ_connection, v_pos_succ_type from public.provider_credentials c where c.id = v_positive_succ;'),
      'CB21-R10 must re-read BOTH positive identities after every scratch section, so contamination is MEASURED rather than assumed');
  }

  // ==========================================================================
  // MU21-series — every way this phase can be undone must turn the harness RED.
  // Mutations are applied IN MEMORY ONLY: no artifact on disk is ever written.
  // ==========================================================================
  function mutationCb21(src) {
    const undetected = [];
    const isCb21 = (f) => /^CB-(7[1-9]|8\d)/.test(f);
    // `red` is a mutable binding ON PURPOSE: every case invokes it at call time, so
    // the loop below can install a spy that records WHICH check fired — or whether
    // none did. A mutation reported only as "not detected" is useless to debug.
    let red = (fn, ...args) => collect(() => fn(...args)).some(isCb21);
    const realRed = red;

    // A mutation that silently fails to APPLY is indistinguishable from a mutation
    // the harness failed to detect — MU21-26 exposed exactly that, when a plain
    // `String.replace` matched the first of TWO occurrences and mutated the
    // positive control instead of the assertion under test. Every case added for
    // the isolation check goes through this helper, which throws when the target
    // is absent, so the runner reports "THREW(mutation target not found)" rather
    // than a misleading "not detected".
    const apply = (source, from, to) => {
      const out = source.replace(from, to);
      if (out === source) throw new Error(`mutation target not found: ${String(from).slice(0, 70)}`);
      return out;
    };

    const cases = [
      // ── the allowlist itself ───────────────────────────────────────────────
      ['MU21-1', 'a PENDING predecessor is accepted (the allowlist becomes a membership test that admits pending)',
        () => red(checkActiveOnlyGate, src.mig.replace(
          "if v_pred_status <> 'active' then", "if v_pred_status not in ('active', 'pending') then"))],
      ['MU21-2', 'an ERROR predecessor is accepted',
        () => red(checkActiveOnlyGate, src.mig.replace(
          "if v_pred_status <> 'active' then", "if v_pred_status not in ('active', 'error') then"))],
      ['MU21-3', 'the status gate is removed entirely',
        () => red(checkActiveOnlyGate, src.mig.replace(GATE_BLOCK, ''))],
      ['MU21-4', 'the BLACKLIST regression: the terminal-state membership test is restored as the rule',
        () => red(checkNoBlacklist, src.mig.replace(GATE_BLOCK, `  if v_pred_status in ('revoked', 'superseded') then
    raise exception 'provider_credential_rotate: credential is already terminal and cannot be rotated'
      using errcode = '42501';
  end if;`))],
      ['MU21-19', 'the gate is moved AFTER vault.create_secret (a refusal would mint Vault material)',
        () => red(checkGateOrder, src.mig.replace(GATE_BLOCK, '').replace(VAULT_LINE, `${VAULT_LINE}\n\n${GATE_BLOCK}`))],

      // ── executable capability ─────────────────────────────────────────────
      ['MU21-5', 'PUBLIC EXECUTE is restored',
        () => red(checkAcl, src.mig + `\ngrant execute on function public.${TARGET}(${ACL_SIG}) to PUBLIC;\n`)],
      ['MU21-6', 'anon EXECUTE is restored',
        () => red(checkAcl, src.mig + `\ngrant execute on function public.${TARGET}(${ACL_SIG}) to anon;\n`)],
      ['MU21-7', 'authenticated EXECUTE is restored',
        () => red(checkAcl, src.mig + `\ngrant execute on function public.${TARGET}(${ACL_SIG}) to authenticated;\n`)],

      // ── hardening and ownership ───────────────────────────────────────────
      ['MU21-8', 'the pinned search_path is changed',
        () => red(checkHardening, src.mig.replace(SEARCH_PATH, 'set search_path = public, pg_catalog'))],
      ['MU21-9', 'SECURITY DEFINER is removed',
        () => red(checkHardening, src.mig.replace('language plpgsql\nsecurity definer', 'language plpgsql\nsecurity invoker'))],
      ['MU21-10', 'the owner is changed away from postgres',
        () => red(checkOwner, src.mig.replace('owner to postgres;', 'owner to service_role;'))],

      // ── the rotation-unit integrity the certification must keep proving ───
      ['MU21-11', 'the same-business supersession proof is weakened in the certification',
        () => red(checkCertificationStructure, src.cert.replace(
          "array['superseded_by_credential_id','business_id']", "array['superseded_by_credential_id']"))],
      ['MU21-12', 'the same-connection proof is weakened in the certification',
        () => red(checkCertificationStructure, src.cert.replace(
          "array['superseded_by_credential_id','business_connection_id','credential_type']",
          "array['superseded_by_credential_id','credential_type']"))],
      ['MU21-13', 'the same-TYPE proof is weakened everywhere it appears in the certification',
        () => red(checkCertificationStructure, src.cert.replaceAll(
          "array['id','business_connection_id','credential_type']",
          "array['id','business_connection_id']"))],

      // ── the sibling contracts ─────────────────────────────────────────────
      ['MU21-14', 'the provider binding drifts in the certification',
        () => red(checkProviderBindings,
          src.cert.replace("''plaid_access''\\s+then\\s+''plaid''", "''plaid_access''\\s+then\\s+''quickbooks''"), src.mig)],
      ['MU21-15', 'resolve is allowed to admit a SUPERSEDED credential',
        () => red(checkResolveContract,
          src.cert.replace("position('superseded_by_credential_id is null' in r.prosrc) > 0", 'true'), src.mig)],
      ['MU21-16', 'resolve is allowed to admit an EXPIRED credential',
        () => red(checkResolveContract,
          src.cert.replace("position('expires_at is null or c.expires_at > clock_timestamp()' in r.prosrc) > 0", 'true'), src.mig)],
      ['MU21-20', 'rotation starts destroying the predecessor Vault material',
        () => red(checkNoMaterialDestruction,
          src.mig.replace(VAULT_LINE, `  delete from vault.secrets where false;\n${VAULT_LINE}`))],

      // ── scope discipline ─────────────────────────────────────────────────
      ['MU21-17', 'a Digital Twin fact write is introduced',
        () => red(checkMigrationScope,
          src.mig + '\ninsert into public.business_facts (id) values (gen_random_uuid());\n')],
      ['MU21-18', 'the Base44 shared Supabase connector is introduced on the CB-002.1 path',
        () => red(checkMigrationScope,
          src.mig + "\n-- base44.asServiceRole.connectors.getConnection('supabase')\n")],

      // ── the harness itself ───────────────────────────────────────────────
      ['MU21-21', 'CB-37e is reverted to the defective membership-test assertion',
        () => red(checkHarnessRevision, src.adv, src.res,
          `${src.cb2Module || ''}\nok('CB-37e', /v_pred_status in \\(/);\n`)],

      // ── the positive-control identity isolation (CB-87) ───────────────────
      ['MU21-22', 'CB21-R8 is made to count Vault rows for a NEGATIVE scratch predecessor instead of the positive-control pair',
        () => red(checkPositiveIsolation, src.adv.replace(
          'where c.id = v_positive_pred or c.id = v_positive_succ;',
          'where c.id = v_negative_pred or c.id = v_positive_succ;'))],
      ['MU21-23', 'CB21-B1/B2/B3 are made to join on a NEGATIVE scratch predecessor instead of the positive-control pair',
        () => red(checkPositiveIsolation, apply(src.adv,
          'join public.provider_credentials p on p.id = v_positive_pred',
          'join public.provider_credentials p on p.id = v_negative_pred'))],
      ['MU21-26', 'CB21-R8 is made to re-read the predecessor material from a NEGATIVE scratch predecessor',
        () => red(checkPositiveIsolation, apply(src.adv,
          /select \(vault_secret_id is not null\) into v_ok\s+from public\.provider_credentials where id = v_positive_pred;/,
          'select (vault_secret_id is not null) into v_ok from public.provider_credentials where id = v_negative_pred;'))],
      ['MU21-24', 'a scratch section is allowed to WRITE a positive-control identity (re-assignment)',
        () => red(checkPositiveIsolation, apply(src.adv,
          'returning id into v_struct_pred;',
          'returning id into v_positive_pred;'))],
      ['MU21-25', 'the CB21-R10 isolation proof is hollowed out: it stops reading the positive-control predecessor',
        () => red(checkPositiveIsolation, apply(src.adv,
          /where c\.id = v_positive_pred;/,
          'where c.id = v_negative_pred;'))],
      ['MU21-27', 'the CB21-R10 isolation proof row is removed from the grid',
        () => red(checkPositiveIsolation, apply(src.adv, /'CB21-R10'/g, "'CB21-R10-removed'"))],
    ];

    for (const [id, why, detect] of cases) {
      const seen = [];
      red = (fn, ...args) => {
        const out = collect(() => fn(...args));
        seen.push(...out);
        return out.some(isCb21);
      };
      let detected = false;
      let thrown = '';
      try { detected = detect(); } catch (e) { thrown = ` THREW(${(e && e.message) || e})`; }
      red = realRed;
      if (!detected) {
        const caught = seen.length ? seen.map((s) => s.split(' ')[0]).join(', ') : 'NO failure collected';
        undetected.push(`${id}${thrown} [${caught}] (${why})`);
      }
    }
    ok('MU21', undetected.length === 0, `CB-002.1 mutations NOT detected: ${undetected.join('; ')}`);
  }

  function run(vocab, src) {
    checkPresence(src);
    checkMigrationScope(src.mig);
    checkSignature(src.mig);
    checkHardening(src.mig);
    checkOwner(src.mig);
    checkActiveOnlyGate(src.mig);
    checkNoBlacklist(src.mig);
    checkGateOrder(src.mig);
    checkInheritance(src.mig);
    checkOrdering(src.mig);
    checkNoMaterialDestruction(src.mig);
    checkAcl(src.mig);
    checkCertificationStructure(src.cert);
    checkCertificationGrid(src.cert);
    checkProviderBindings(src.cert, src.mig);
    checkResolveContract(src.cert, src.mig);
    checkHarnessRevision(src.adv, src.res, src.cb2Module);
    checkPositiveIsolation(src.adv);
  }

  function mutation(vocab, src) {
    mutationCb21(src);
  }

  return { run, mutation };
};