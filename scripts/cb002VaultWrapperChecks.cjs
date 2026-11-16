/**
 * CONNECTED BUSINESS — CB-002 VAULT CREDENTIAL WRAPPER CHECKS
 *
 * Extracted from scripts/connectedBusinessFoundation.test.cjs so the harness stays
 * editable; the harness requires this module and calls run() + mutation(). Every
 * check is additive — nothing here weakens a CB-001 or CB-001.2 check.
 *
 * WHAT THIS IS FOR
 *   The wrapper surface is the ONE place outside Vault where credential plaintext
 *   moves. These checks make every way of widening that surface fail the harness
 *   instead of a review: a missing REVOKE, a browser grant, the lockout ordering,
 *   a missing SECURITY DEFINER, an unpinned owner or search_path, a plaintext
 *   column, a wrapper returning more than it should, a missing status or binding
 *   guard, a secret name carrying identity, a Digital Twin write, a connector
 *   import, a stale root-key blocker, and — CB-46 — a live preflight whose
 *   extension identity drifts from the deployed `supabase_vault`.
 *
 * The module is pure: it reads strings, calls the supplied `ok`, and the supplied
 * `collect` for mutation isolation. It writes nothing.
 */
module.exports = function createCb2Checks({ ok, stripComments, collect }) {
  const CB2_WRAPPERS = [
    { name: 'provider_credential_put', sig: 'uuid, uuid, text, text, timestamptz, jsonb', identity: 'uuid, uuid, text, text, timestamp with time zone, jsonb' },
    { name: 'provider_credential_rotate', sig: 'uuid, text, timestamptz, jsonb', identity: 'uuid, text, timestamp with time zone, jsonb' },
    { name: 'provider_credential_resolve', sig: 'uuid, uuid, text', identity: 'uuid, uuid, text' },
    { name: 'provider_credential_revoke', sig: 'uuid, uuid, uuid', identity: 'uuid, uuid, uuid' },
  ];
  const CB2_SEARCH_PATH = 'set search_path = pg_catalog, vault, public';
  const CB2_SECRET_NAME_PREFIX = "'vision-provider-credential:' || ";
  const CB2_SYNTHETIC_MARKER = 'vision_test_secret_cb002_';
  const CB2_GRID_IDS = ['CB2-U0', 'CB2-U1', 'CB2-U2', 'CB2-U3', 'CB2-U4',
    'CB2-P1', 'CB2-P2', 'CB2-P3',
    'CB2-R1', 'CB2-R2', 'CB2-R3', 'CB2-R4', 'CB2-R5', 'CB2-R6', 'CB2-R7',
    'CB2-X1', 'CB2-X2', 'CB2-X3', 'CB2-V1', 'CB2-V2', 'CB2-C1'];
  const CB2_CERT_ROW_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];

  /** The full definition of one wrapper, from CREATE through its closing $$; */
  function cb2FunctionBlock(src, name) {
    const start = src.indexOf(`create or replace function public.${name}(`);
    if (start < 0) return null;
    const end = src.indexOf('$$;', start);
    return end < 0 ? null : src.slice(start, end + 3);
  }

  /** The migration's deploy-time statements: everything OUTSIDE the function bodies. */
  function cb2DeployTimeSql(src) {
    return src.replace(/\$\$[\s\S]*?\$\$/g, '$$BODY$$');
  }

  /** All when 'x' then 'y' pairs — the credential-type CASE, and nothing else. */
  function cb2TypeProviderPairs(src) {
    return [...src.matchAll(/when\s+'([a-z_]+)'\s+then\s+'([a-z_]+)'/g)].map((m) => `${m[1]}=${m[2]}`);
  }

  // ── CB-34 · surface minimality and no-touch discipline ────────────────────
  function checkCb2Surface(migSrc, certSrc, advSrc, resSrc) {
    ok('CB-34:present', migSrc.length > 0 && certSrc.length > 0 && advSrc.length > 0 && resSrc.length > 0,
      'all four CB-002 artifacts must exist');

    const live = stripComments(migSrc);
    const deployTime = cb2DeployTimeSql(live);

    const created = [...live.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
    ok('CB-34a', created.length === 4 && CB2_WRAPPERS.every((w) => created.includes(w.name)),
      `the migration must create exactly the four wrappers; found ${JSON.stringify(created)}`);

    // No relation is created, so the SEC-031 pg_default_acl TABLE trap is not re-armed.
    const relationDdl = [
      /\bcreate\s+(table|view|materialized\s+view|index|sequence|schema|type|trigger|policy)\b/i,
      /\balter\s+(table|default\s+privileges)\b/i,
      /\bdrop\s+(table|view|function|trigger|policy|index)\b/i,
    ].filter((re) => re.test(live));
    ok('CB-34b', relationDdl.length === 0,
      `CB-002 must not create or alter any relation or default privilege — found ${relationDdl.map(String).join(' ')}`);

    // Deploy-time writes: none. (Writes INSIDE the wrapper bodies are the feature.)
    const deployWrites = (deployTime.match(/\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/gi) || []);
    ok('CB-34c', deployWrites.length === 0,
      `deploy-time statements must write no rows — found ${deployWrites.join(', ')}`);

    // No table privilege is granted or revoked: the wrappers need EXECUTE only.
    const tableAcl = (deployTime.match(/\b(grant|revoke)\b[^;]*\bon\s+table\b/gi) || []);
    ok('CB-34d', tableAcl.length === 0,
      `CB-002 must not touch table privileges — the CB-001 ACL posture must stay unchanged; found ${tableAcl.join(' ')}`);

    ok('CB-34e', !/delete\s+from\s+public\.provider_credentials/i.test(live),
      'provider_credentials history must never be deleted — revoke retires state, it does not destroy the row');

    // Every Vault reference is schema-qualified. pg_temp or a caller-influenced
    // schema must not be able to shadow anything the wrappers touch.
    const bareCreate = /\bcreate_secret\s*\(/.test(live.replace(/vault\.create_secret\s*\(/g, ''));
    const bareDecrypted = /(?<!vault\.)\bdecrypted_secrets\b/.test(live.replace(/vault\.decrypted_secrets/g, ''));
    ok('CB-34f', !bareCreate && !bareDecrypted
      && /vault\.create_secret\s*\(/.test(live)
      && /vault\.decrypted_secrets/.test(live)
      && /delete\s+from\s+vault\.secrets/i.test(live),
      'every Vault reference must be schema-qualified (vault.create_secret / vault.decrypted_secrets / delete from vault.secrets)');

    // No Digital Twin write of any kind. The fact freeze is not CB-002's to touch.
    const twin = ['business_facts', 'business_fact_evidence', 'business_fact_conflicts']
      .filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(live));
    ok('CB-34g', twin.length === 0, `CB-002 must not reference the Digital Twin — found ${twin.join(', ')}`);

    const net = [...live.matchAll(/\b(dblink|pg_net|http|https:\/\/|fetch)\b/gi)].map((m) => m[1]);
    ok('CB-34h', net.length === 0, `CB-002 must call no provider and no network — found ${net.join(', ')}`);

    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-34i', begins === 1 && commits === 1,
      `CB-002 must be one committing transaction (begins=${begins}, commits=${commits})`);
  }

  // ── CB-35 · per-function hardening ─────────────────────────────────────────
  function checkCb2Functions(migSrc) {
    const missing = CB2_WRAPPERS.filter((w) => !cb2FunctionBlock(migSrc, w.name));
    ok('CB-35:defined', missing.length === 0, `wrapper(s) not defined: ${missing.map((w) => w.name).join(', ')}`);

    const blocks = CB2_WRAPPERS.map((w) => ({ w, body: cb2FunctionBlock(migSrc, w.name) || '' }));

    const notDefiner = blocks.filter((b) => !/\bsecurity definer\b/.test(b.body)).map((b) => b.w.name);
    ok('CB-35a', notDefiner.length === 0,
      `SECURITY DEFINER is required on every wrapper — a SECURITY INVOKER wrapper cannot reach Vault: ${notDefiner.join(', ')}`);

    const notPinned = blocks.filter((b) => !b.body.includes(CB2_SEARCH_PATH)).map((b) => b.w.name);
    ok('CB-35b', notPinned.length === 0,
      `every wrapper must pin exactly \`${CB2_SEARCH_PATH}\`: ${notPinned.join(', ')}`);

    const unpinnedOwner = CB2_WRAPPERS.filter((w) => !new RegExp(
      `alter function public\\.${w.name}\\(${w.sig.replace(/[(),]/g, '\\$&')}\\) owner to postgres;`).test(migSrc))
      .map((w) => w.name);
    ok('CB-35c', unpinnedOwner.length === 0,
      `every wrapper's owner must be PINNED to postgres — a SECURITY DEFINER function runs as its OWNER: ${unpinnedOwner.join(', ')}`);

    const badRevoke = [];
    const badGrant = [];
    const badOrder = [];
    for (const w of CB2_WRAPPERS) {
      const esc = w.sig.replace(/[(),]/g, '\\$&');
      const positions = {};
      for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
        const re = new RegExp(`revoke all on function public\\.${w.name}\\(${esc}\\) from ${role};`);
        positions[role] = migSrc.search(re);
        if (positions[role] < 0) badRevoke.push(`${w.name}:${role}`);
      }
      const grantRe = new RegExp(`grant execute on function public\\.${w.name}\\(${esc}\\) to service_role;`);
      const grantAt = migSrc.search(grantRe);
      if (grantAt < 0) badGrant.push(w.name);
      if (positions.service_role < 0 || grantAt < 0 || positions.service_role > grantAt) badOrder.push(w.name);
    }
    ok('CB-35d', badRevoke.length === 0,
      `every wrapper must be REVOKEd from PUBLIC, anon, authenticated AND service_role explicitly — missing: ${badRevoke.join(', ')}`);
    ok('CB-35e', badGrant.length === 0,
      `every wrapper must be granted to service_role — missing: ${badGrant.join(', ')}`);
    ok('CB-35f', badOrder.length === 0,
      `REVOKE-then-GRANT is a correctness property — the reverse locks every backend caller out: ${badOrder.join(', ')}`);

    const browserGrants = (migSrc.match(/grant\s+execute\b[^;]*\bto\s+(PUBLIC|anon|authenticated)\b/gi) || []);
    ok('CB-35g', browserGrants.length === 0,
      `no wrapper may ever be granted to PUBLIC, anon or authenticated — found ${browserGrants.join(' ')}`);

    const grantLines = (stripComments(migSrc).match(/^\s*grant\b[^;]*;/gim) || []);
    const badGrants = grantLines.filter((l) =>
      !/^grant execute on function public\.provider_credential_\w+\([\w, ]+\) to service_role;$/i.test(l.trim()));
    ok('CB-35h', badGrants.length === 0,
      `only the four exact EXECUTE grants may appear — found: ${badGrants.join(' | ')}`);
  }

  // ── CB-36 · put contract ───────────────────────────────────────────────────
  function checkCb2PutContract(migSrc) {
    const body = cb2FunctionBlock(migSrc, 'provider_credential_put') || '';

    const returns = [...body.matchAll(/return\s+([a-z_]+)\s*;/gi)].map((m) => m[1]);
    ok('CB-36a', returns.length === 1 && returns[0] === 'v_credential_id'
      && !/return\s+v_vault_id/i.test(body) && !/return\s+p_secret/i.test(body),
      `put must return the credential id only, never the secret or the Vault id; returns=${JSON.stringify(returns)}`);

    ok('CB-36b', /'active'/.test(body) && /\bexpires_at\b/.test(body),
      'put must create the credential ACTIVE, so the one-active-per-unit index governs the unit, and must record its expiry');

    const guards = {
      binding: /where bc\.id = p_business_connection_id\s+and bc\.business_id = p_business_id/.test(body),
      dead_connection: /v_conn_status in \('disconnected', 'revoked'\)/.test(body),
      blank_secret: /p_secret is null or length\(p_secret\) = 0/.test(body),
      unknown_type: /v_expected is null/.test(body),
      type_provider: /v_expected <> v_provider/.test(body),
    };
    const missing = Object.entries(guards).filter(([, v]) => !v).map(([k]) => k);
    ok('CB-36c', missing.length === 0, `put is missing guard(s): ${missing.join(', ')}`);

    // Scoped to the raise STATEMENT — [^;]* stops at its semicolon — so the guard
    // cannot be tripped by the NEXT statement merely mentioning the parameter.
    ok('CB-36d', !/\braise\b[^;]*\bp_secret\b/i.test(body)
      && !/\braise\b[^;]*(v_vault_id|decrypted_secret)/i.test(body),
      'put must never echo the secret into an error message');

    ok('CB-36e', body.includes(CB2_SECRET_NAME_PREFIX) && !/'vision-provider-credential:'\s*\|\|[^;]*\|\|/i.test(body),
      'the Vault secret name must be exactly vision-provider-credential:{credential_uuid} — nothing else may be concatenated into it');
  }

  // ── CB-37 · rotate contract ───────────────────────────────────────────────
  function checkCb2RotateContract(migSrc) {
    const body = cb2FunctionBlock(migSrc, 'provider_credential_rotate') || '';
    const header = body.slice(0, body.indexOf('as $$'));

    const takesConnection = /p_business_connection_id|p_credential_type/.test(header);
    ok('CB-37a', !takesConnection,
      'rotate must NOT accept a connection or a credential_type — both are inherited from the predecessor, so a cross-unit successor is unrepresentable');

    ok('CB-37b', /v_pred_conn/.test(body) && /v_pred_type/.test(body)
      && /values\s*\(v_successor_id, v_pred_conn, v_pred_bus, v_pred_type/.test(body),
      "rotate must build the successor from the predecessor's business_connection_id, business_id and credential_type");

    const atInsert = body.indexOf("'pending'");
    const atSupersede = body.indexOf("set status = 'superseded'");
    const atPromote = body.indexOf("set status = 'active'");
    ok('CB-37c', atInsert > -1 && atSupersede > atInsert && atPromote > atSupersede
      && /superseded_by_credential_id = v_successor_id/.test(body),
      `rotation order must be: insert pending -> mark predecessor superseded with the pointer -> promote successor to active (insert@${atInsert}, supersede@${atSupersede}, promote@${atPromote})`);

    ok('CB-37d', !/delete\s+from\s+vault\.secrets/i.test(body),
      "rotate must NOT destroy the predecessor's Vault material — retirement is an explicit revoke, not an implied side effect of rotation");

    // ── CB-37e · the predecessor gate (REVISED by CB-002.1) ─────────────────
    // This artifact is the historical CB-002 contract, and its predecessor rule
    // was a terminal-state membership test. A membership test fails OPEN for every
    // state it does not enumerate — including the state the column DEFAULT
    // produces — so the COMPLETE rule is now ACTIVE-ONLY and is asserted against
    // the SUPERSEDING artifact (CB-002.1: checks CB-76 / CB-77), never here.
    //
    // Pinning the membership test in THIS file is what allowed the defect to be
    // certified as correct, and would have made a CORRECT deployment fail the
    // harness. That specific regression is itself detected: CB-86a / CB-86b, proved
    // by mutation MU21-21.
    //
    // What remains true of CB-002 and is asserted here: the gate reads the
    // predecessor's OWN status, is evaluated BEFORE any Vault call, and it raises.
    const gateAt = body.search(/if\s+v_pred_status\b/i);
    const vaultAt = body.search(/vault\.create_secret/i);
    ok('CB-37e', gateAt > -1 && vaultAt > -1 && gateAt < vaultAt
      && /'revoked'/.test(body) && /'superseded'/.test(body),
      'rotate must gate on the predecessor status BEFORE touching Vault and refuse terminal states; the COMPLETE predecessor rule is ACTIVE-ONLY and is asserted by the superseding CB-002.1 artifact');
  }

  // ── CB-38 · resolve contract ──────────────────────────────────────────────
  function checkCb2ResolveContract(migSrc) {
    const body = cb2FunctionBlock(migSrc, 'provider_credential_resolve') || '';
    const header = body.slice(0, body.indexOf('as $$'));

    ok('CB-38a', !/p_credential_id|credential_id/.test(header) && /p_business_connection_id/.test(header),
      'resolve must be addressed by rotation unit (business, connection, type) and must NEVER accept a credential id');

    // Every guard is word-boundary exact. Without \b, `c.business_id` also matches
    // inside `bc.business_id`, so a body whose OWN binding had been removed would
    // still report that the guard was present — a false green on the one guard
    // that stops cross-business resolution.
    const guards = {
      active_only: /\bc\.status = 'active'/.test(body),
      no_supersession_pointer: /\bc\.superseded_by_credential_id is null/.test(body),
      has_reference: /\bc\.vault_secret_id is not null/.test(body),
      expiry_at_call_time: /\bc\.expires_at is null or c\.expires_at > clock_timestamp\(\)/.test(body),
      business_binding: /\bc\.business_id = p_business_id/.test(body),
      connection_binding: /\bc\.business_connection_id = p_business_connection_id/.test(body),
      connection_alive: /\bbc\.status not in \('disconnected', 'revoked'\)/.test(body),
    };
    const missing = Object.entries(guards).filter(([, v]) => !v).map(([k]) => k);
    ok('CB-38b', missing.length === 0, `resolve is missing guard(s): ${missing.join(', ')}`);

    ok('CB-38c', /return\s+null;/.test(body) && !/raise\s+exception/i.test(body),
      'resolve must return NULL and never raise — an error message would be an oracle');

    // A logging CALL is the leak vector, not the substring "log": `pg_catalog`
    // appears in the pinned search_path and must never trip this check.
    ok('CB-38d', !/\braise\s+(notice|info|warning|log|debug)\b/i.test(body)
      && !/\binsert\s+into\b/i.test(body),
      'resolve must not log — plaintext-adjacent diagnostics are exactly what must not be written down');
  }

  // ── CB-39 · revoke contract ───────────────────────────────────────────────
  function checkCb2RevokeContract(migSrc) {
    const body = cb2FunctionBlock(migSrc, 'provider_credential_revoke') || '';

    const binding = /where c\.id = p_credential_id\s+and c\.business_id = p_business_id\s+and c\.business_connection_id = p_business_connection_id/.test(body);
    ok('CB-39a', binding, 'revoke must bind credential AND business AND connection — knowing an id must not be enough');

    const dest = body.indexOf('delete from vault.secrets');
    const nullRef = body.indexOf('set vault_secret_id = null');
    ok('CB-39b', dest > -1 && nullRef > dest,
      'revoke must destroy the Vault material and THEN clear the reference, so a row can never point at destroyed material');

    ok('CB-39c', !/delete\s+from\s+public\.provider_credentials/i.test(body),
      'revoke must NEVER delete the credential row — the ledger is provenance and no role holds DELETE on it');

    const atSupersededReturn = body.indexOf("if v_status = 'superseded' then");
    const atStatusUpdate = body.indexOf("set status = 'revoked'");
    ok('CB-39d', atSupersededReturn > -1 && atStatusUpdate > atSupersededReturn
      && /coalesce\(revoked_at, clock_timestamp\(\)\)/.test(body),
      'revoking a superseded credential must retire its material while PRESERVING status and pointer — a repeat revoke keeps the first revoked_at');
  }

  // ── CB-40 · the certification must agree with the migration it certifies ──
  function checkCb2Certification(certSrc) {
    const live = stripComments(certSrc);
    const declared = Number((certSrc.match(/returns ONE report: (\d+) rows/) || [])[1]);
    const firstRow = (certSrc.match(/select '([A-Z])' id,/) || [])[1];
    const rest = [...certSrc.matchAll(/union all select '([A-Z])'/g)].map((m) => m[1]);
    const all = firstRow ? [firstRow, ...rest] : rest;
    ok('CB-40a', declared === CB2_CERT_ROW_IDS.length && all.length === CB2_CERT_ROW_IDS.length
      && new Set(all).size === all.length && CB2_CERT_ROW_IDS.every((id) => all.includes(id)),
      `certification row count/documentation drift: declared=${declared}, actual=${all.length}, expected=${CB2_CERT_ROW_IDS.length}`);

    ok('CB-40b', /ROOT KEY \/ PRODUCTION BLOCKER/.test(certSrc) && /'BLOCKER' from facts f/.test(certSrc),
      'the Vault root-key production blocker must be an explicitly reported row — a BLOCKER verdict that SQL cannot close');

    const writes = live.match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/gim) || [];
    ok('CB-40c', writes.length === 0, `the certification must be READ-ONLY — found: ${writes.join(', ')}`);

    const sigs = CB2_WRAPPERS.filter((w) => !certSrc.includes(`'${w.name}(${w.identity})'`)).map((w) => w.name);
    ok('CB-40d', sigs.length === 0, `certification must assert the exact identity signature of: ${sigs.join(', ')}`);

    ok('CB-40e', /rotation_fk_intact/.test(certSrc) && /provider_credentials_superseded_same_rotation_unit_fkey/.test(certSrc)
      && /with ordinality/.test(certSrc),
      'the certification must re-prove the CB-001.2 supersession FK by its exact ordered column mapping');
    ok('CB-40f', /business_facts'\) is null then -1/.test(certSrc) && /business_fact_evidence/.test(certSrc)
      && /business_fact_conflicts/.test(certSrc),
      'the certification must re-prove the Digital Twin fact freeze (facts, evidence, conflicts)');
    ok('CB-40g', /service_role_unchanged/.test(certSrc) && /anon_unchanged/.test(certSrc),
      'the certification must re-prove the CB-001 table ACL posture is unchanged');
  }

  // ── CB-41 · adversarial structure ─────────────────────────────────────────
  function checkCb2Adversarial(advSrc) {
    const live = stripComments(advSrc);
    const stmts = live.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const last = stmts[stmts.length - 1];
    const rowReturning = stmts.filter((s) => /^select\b/i.test(s));

    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const rollbacks = (live.match(/\brollback\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-41a', begins === 1 && rollbacks === 1 && commits === 0 && /^rollback$/i.test(last),
      `the adversarial suite must be ONE rollback-only transaction whose final executable statement is ROLLBACK (begins=${begins}, rollbacks=${rollbacks}, commits=${commits})`);

    ok('CB-41b', /cb002_adversarial_results/.test(rowReturning[rowReturning.length - 1] || '')
      && !/cb001_adversarial_results/.test(advSrc),
      "the verdict grid must be the last row-returning statement, and CB-001's ledger must not be reused");

    const realShapes = [
      /eyJ[A-Za-z0-9_-]{10,}/, /sandbox\.plaid\.com|production\.plaid\.com/,
      /quickbooks\.api\.intuit\.com/, /access_token\s*[=:]/, /refresh_token\s*[=:]/, /client_secret\s*[=:]/,
    ].filter((re) => re.test(advSrc));
    ok('CB-41c', advSrc.includes(CB2_SYNTHETIC_MARKER) && realShapes.length === 0,
      `every test secret must be the synthetic marker ${CB2_SYNTHETIC_MARKER} and no real credential shape may appear — found ${realShapes.map(String).join(' ')}`);

    ok('CB-41d', /set local role anon;/.test(advSrc) && /set local role authenticated;/.test(advSrc)
      && /set local role service_role;/.test(advSrc) && /'SKIPPED'/.test(advSrc),
      "the suite must test EXECUTE denial by switching role, record service_role's positive capability, and report SKIPPED rather than a false PASS when a role cannot be assumed");

    ok('CB-41e', /provider_credentials_superseded_same_rotation_unit_fkey/.test(advSrc)
      && /get stacked diagnostics v_constraint = constraint_name/.test(advSrc),
      'the database backstop must be proven by naming the constraint that fired');

    const missing = CB2_GRID_IDS.filter((id) => !advSrc.includes(`'${id}'`));
    ok('CB-41f', missing.length === 0,
      `adversarial grid incomplete — missing ${missing.join(', ')}`);
  }

  // ── CB-42 · residue companion ────────────────────────────────────────────
  function checkCb2Residue(resSrc) {
    const live = stripComments(resSrc);
    ok('CB-42a', (live.match(/\bselect\b/gi) || []).length >= 1
      && !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|begin|commit|rollback|do)\b/i.test(live),
      'the residue check must be READ-ONLY: no write, no DDL, no transaction, nothing to clean up');

    ok('CB-42b', /as residual_connections/.test(resSrc) && /as residual_credentials/.test(resSrc)
      && /as residual_vault_secrets/.test(resSrc),
      'the residue check must report exactly residual_connections, residual_credentials and residual_vault_secrets');

    ok('CB-42c', /as cleanup_verdict/.test(resSrc) && /00000000-0000-0000-0000-0000000c02/.test(resSrc)
      && /not exists/.test(resSrc),
      'the verdict must be PASS only at 0/0/0, keyed on the CB-002 namespace AND on orphaned Vault material — a partial rollback loses the row, not the secret');
  }

  // ── CB-43 · secret-name opacity, and type/provider drift ─────────────────
  function checkCb2NamingAndVocabulary(migSrc, vocab) {
    const nameExprs = [...migSrc.matchAll(/'vision-provider-credential:'\s*\|\|\s*([^;,)]+)/g)].map((m) => m[1].trim());
    ok('CB-43a', nameExprs.length === 2 && nameExprs.every((e) => /^v_(credential|successor)_id::text$/.test(e)),
      `the Vault secret name must be built from the credential uuid alone in BOTH put and rotate; found ${JSON.stringify(nameExprs)}`);

    const identifying = ['business_id', 'provider_organization_id', 'realm', 'email', 'account', 'plaid', 'quickbooks', 'xero', 'wave']
      .filter((t) => new RegExp(`'vision-provider-credential:'\\s*\\|\\|[^;]*${t}`, 'i').test(migSrc));
    ok('CB-43b', identifying.length === 0,
      `nothing identifying may be encoded in a Vault secret name — found ${identifying.join(', ')}`);

    const pairs = cb2TypeProviderPairs(migSrc).sort();
    const expected = Object.entries(vocab.CREDENTIAL_TYPE_PROVIDER).map(([t, p]) => `${t}=${p}`).sort();
    ok('CB-43c', pairs.length === expected.length && expected.every((p) => pairs.includes(p)),
      `the put() type->provider binding must equal CREDENTIAL_TYPE_PROVIDER — drift would let one provider's credential attach to another's connection (sql=${JSON.stringify(pairs)}, module=${JSON.stringify(expected)})`);
  }

  // ── CB-44 · the Base44 shared Supabase connector is PROHIBITED ───────────
  function checkCb2ConnectorProhibition(...sources) {
    const patterns = [
      /asServiceRole\.connectors\s*\.\s*getConnection/i,
      /connectors\s*\.\s*getConnection\s*\(\s*['"]supabase['"]/i,
    ];
    const hits = [];
    sources.forEach((src, i) => patterns.forEach((re) => { if (re.test(src)) hits.push(`source[${i}]:${re}`); }));
    ok('CB-44', hits.length === 0,
      `the Base44 shared Supabase connector must never be used on the CB-002 path — found ${hits.join(' | ')}`);
  }

  // ── CB-45 · no plaintext credential column may be introduced anywhere ────
  function checkCb2PlaintextColumns(migSrc, certSrc) {
    const deny = [
      'access_token', 'refresh_token', 'public_token', 'link_token', 'authorization_code',
      'client_secret', 'credential_value', 'plaintext_secret', 'decrypted_secret',
      'token_value', 'secret_value', 'password',
    ];
    // A column DECLARATION is `name type` at the start of a line — never a mention
    // inside a deny-list, which is how the defense would otherwise flag itself.
    const declaration = deny.find((c) => new RegExp(`^\\s*${c}\\s+(text|uuid|jsonb|varchar)`, 'im').test(migSrc));
    ok('CB-45a', !declaration, `CB-002 must declare no plaintext credential column — found ${declaration || '<none>'}`);

    const altered = /alter\s+table\s+public\.provider_credentials/i.test(stripComments(migSrc));
    ok('CB-45b', !altered, 'CB-002 must not alter the credential table at all');

    const certDeny = deny.filter((c) => certSrc.includes(`('${c}')`)).length;
    ok('CB-45c', certDeny >= 11, `the certification must carry the credential deny-list forward (found ${certDeny} of 12)`);
  }

  // ── CB-46 · the live preflight identifies the extension EXACTLY ───────────
  // The first release of the preflight tested `pg_extension.extname = 'vault'`.
  // The deployed extension is named `supabase_vault` (confirmed live: 0.3.1,
  // schema vault), so a correct production installation was reported ABSENT.
  //
  // The extension NAME and the SCHEMA are different things, and these checks keep
  // them apart: presence is anchored on the exact name, the schema expectation
  // stays `vault`, and a loose pattern may never reach a verdict.
  function checkCb2Preflight(preSrc) {
    const live = stripComments(preSrc);
    ok('CB-46:present', preSrc.length > 0, 'the live preflight artifact must exist');

    // Anchored on the EXACT documented extension name.
    ok('CB-46a', /where\s+e\.extname\s*=\s*'supabase_vault'/.test(live),
      'the preflight must anchor extension presence on the exact name supabase_vault');

    // The original defect, verbatim.
    ok('CB-46b', !/extname\s*=\s*'vault'/.test(live),
      "the preflight must never test extname = 'vault' again — the deployed extension is supabase_vault");

    // The schema expectation is `vault`, and must STAY `vault` whatever the
    // extension is called. "Fixing" this to supabase_vault would be a new defect:
    // it is the schema, not the name, that CB-002 qualifies through.
    ok('CB-46c', /\(select extension_schema from vault_ext\)\s*=\s*'vault'/.test(live),
      'the extension must be required to resolve in schema `vault` — the schema is not the extension name');

    // The loose pattern exists for DIAGNOSTICS only: exactly one occurrence,
    // inside vault_other_ext, never in a verdict expression.
    const ilikeCount = (preSrc.match(/ilike\s+'%vault%'/gi) || []).length;
    const otherAt = preSrc.indexOf('vault_other_ext as (');
    const ilikeAt = preSrc.search(/ilike\s+'%vault%'/i);
    ok('CB-46d', ilikeCount === 1 && otherAt > -1 && ilikeAt > otherAt,
      `the broad vault-name pattern must appear exactly once, inside the diagnostic CTE only (count=${ilikeCount})`);

    // The presence verdict is derived from the exact-name CTE, so the diagnostic
    // can never satisfy it.
    ok('CB-46e', /case when \(select count\(\*\) from vault_ext\) = 1 then 'PASS' else 'FAIL' end/.test(preSrc),
      'the extension presence verdict must be derived from vault_ext (exact name), never from the diagnostic CTE');

    // The preflight stays READ-ONLY.
    const writes = live.match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|call)\b/gim) || [];
    ok('CB-46f', writes.length === 0,
      `the preflight must stay read-only — found statement(s): ${writes.join(', ')}`);

    // It also never INVOKES Vault, and touches no vault relation directly — every
    // fact comes from system catalogs. Asserted on the source with STRING LITERALS
    // REMOVED: the preflight legitimately NAMES vault.create_secret inside quoted
    // text (it documents the call CB-002 makes), and a naive scan cannot tell a
    // literal from a call. After literals are stripped, no `vault.` reference may
    // remain at all.
    const code = live.replace(/'([^']|'')*'/g, "''");
    ok('CB-46g', !/vault\s*\.\s*(create_secret|update_secret|secrets|decrypted_secrets)/.test(code)
      && !/\bcreate\s+temp\b/i.test(code) && !/\bdo\s+\$\$/i.test(code),
      'outside string literals the preflight must reference no vault.* object, invoke no Vault function and create nothing');
  }

  // ==========================================================================
  // MU2-series — every CB-002 check must actually FAIL on the way it can break.
  // Mutations are applied IN MEMORY ONLY: no artifact on disk is ever written, so
  // restoring the canonical artifacts is guaranteed by construction.
  // ==========================================================================
  function mutationCb2(migSrc, certSrc, advSrc, resSrc, vocab, preSrc) {
    const undetected = [];
    const red = (fn, mutated, ...rest) =>
      collect(() => fn(mutated, ...rest)).some((f) => /^CB-3\d|^CB-4\d/.test(f));

    const PUT_SIG = 'uuid, uuid, text, text, timestamptz, jsonb';

    const cases = [
      ['MU2-1', 'PUBLIC revoke removed from one wrapper',
        () => red(checkCb2Functions, migSrc.replace(
          `revoke all on function public.provider_credential_put(${PUT_SIG}) from PUBLIC;`, ''))],
      ['MU2-2', 'anon revoke removed from one wrapper',
        () => red(checkCb2Functions, migSrc.replace(
          `revoke all on function public.provider_credential_put(${PUT_SIG}) from anon;`, ''))],
      ['MU2-3', 'authenticated revoke removed from one wrapper',
        () => red(checkCb2Functions, migSrc.replace(
          `revoke all on function public.provider_credential_put(${PUT_SIG}) from authenticated;`, ''))],
      ['MU2-4', 'a browser role is granted EXECUTE',
        () => red(checkCb2Functions, migSrc
          + '\ngrant execute on function public.provider_credential_resolve(uuid, uuid, text) to authenticated;\n')],
      ['MU2-5', 'GRANT placed BEFORE the REVOKE (the lockout order)',
        () => red(checkCb2Functions, migSrc
          .replace('revoke all on function public.provider_credential_resolve(uuid, uuid, text) from service_role;', '')
          .replace('grant execute on function public.provider_credential_resolve(uuid, uuid, text) to service_role;',
            'grant execute on function public.provider_credential_resolve(uuid, uuid, text) to service_role;\n'
            + 'revoke all on function public.provider_credential_resolve(uuid, uuid, text) from service_role;'))],
      ['MU2-6', 'SECURITY INVOKER substituted on a wrapper',
        () => red(checkCb2Functions, migSrc.replace(
          'language plpgsql\nsecurity definer\nset search_path = pg_catalog, vault, public',
          'language plpgsql\nsecurity invoker\nset search_path = pg_catalog, vault, public'))],
      ['MU2-7', 'pinned search_path removed',
        () => red(checkCb2Functions, migSrc.replace(`\n${CB2_SEARCH_PATH}`, ''))],
      ['MU2-8', 'search_path weakened to a caller-influenced order',
        () => red(checkCb2Functions, migSrc.replace(CB2_SEARCH_PATH, 'set search_path = public, pg_catalog'))],
      ['MU2-9', 'a plaintext credential column is introduced',
        () => red(checkCb2PlaintextColumns,
          migSrc + '\nalter table public.provider_credentials add column access_token text;\n', certSrc)],
      ['MU2-10', 'a wrapper starts returning the raw secret',
        () => red(checkCb2PutContract, migSrc.replace('return v_credential_id;', 'return p_secret;'))],
      ['MU2-11', 'the resolve status guard is dropped (revoked/superseded become resolvable)',
        () => red(checkCb2ResolveContract, migSrc.replace("and c.status = 'active'", ''))],
      ['MU2-12', 'the resolve business binding is dropped (cross-business resolution)',
        () => red(checkCb2ResolveContract, migSrc.replace(
          'where c.business_id = p_business_id', 'where c.business_id is not null'))],
      ['MU2-21', 'the revoke business/connection binding is dropped',
        () => red(checkCb2RevokeContract, migSrc.replace(
          'where c.id = p_credential_id', 'where true and p_credential_id is not null'))],
      ['MU2-13', 'the synthetic-cleanup rollback is removed from the adversarial suite',
        () => red(checkCb2Adversarial, advSrc.replace(/^rollback;$/m, ''))],
      ['MU2-14', 'identifying metadata smuggled into the Vault secret name',
        () => red(checkCb2NamingAndVocabulary, migSrc.replace(
          CB2_SECRET_NAME_PREFIX + 'v_credential_id::text',
          CB2_SECRET_NAME_PREFIX + "v_credential_id::text || '-plaid-' || p_business_id::text"), vocab)],
      ['MU2-15', 'a Digital Twin write is introduced',
        () => red(checkCb2Surface,
          migSrc + '\ninsert into public.business_facts (id) values (gen_random_uuid());\n', certSrc, advSrc, resSrc)],
      ['MU2-16', 'the Base44 shared Supabase connector is introduced on the CB-002 path',
        () => red(checkCb2ConnectorProhibition, migSrc + "\n-- base44.asServiceRole.connectors.getConnection('supabase')\n")],
      ['MU2-17', 'the root-key blocker row is deleted from the certification',
        () => red(checkCb2Certification, certSrc.replace(/'BLOCKER' from facts f/, "'PASS' from facts f"))],
      ['MU2-18', 'the type->provider binding drifts from the shipped vocabulary',
        () => red(checkCb2NamingAndVocabulary, migSrc.replace(
          "when 'plaid_access'       then 'plaid'", "when 'plaid_access'       then 'quickbooks'"), vocab)],
      ['MU2-19', 'resolve starts emitting diagnostics',
        () => red(checkCb2ResolveContract, migSrc.replace(
          '    return null;\n  end if;', "    raise notice 'resolve: no input';\n    return null;\n  end if;"))],
      ['MU2-20', 'a put error message interpolates the secret',
        () => red(checkCb2PutContract, migSrc.replace(
          "raise exception 'provider_credential_put: secret is required'",
          "raise exception 'provider_credential_put: secret is required: ' || p_secret"))],

      // ── the extension-identity defect, and every way the fix can be undone ──
      ['MU2-22', "the expected extension name regresses from supabase_vault to the incorrect 'vault'",
        () => red(checkCb2Preflight, preSrc.replace(
          "e.extname = 'supabase_vault'", "e.extname = 'vault'"))],
      ['MU2-23', 'the exact extension-name anchor is broadened into a pattern',
        () => red(checkCb2Preflight, preSrc.replace(
          "e.extname = 'supabase_vault'", "e.extname ilike '%vault%'"))],
      ['MU2-24', 'the SCHEMA expectation is corrupted into the extension NAME',
        () => red(checkCb2Preflight, preSrc.replace(
          "extension_schema from vault_ext) = 'vault'",
          "extension_schema from vault_ext) = 'supabase_vault'"))],
      ['MU2-25', 'the diagnostic loose match is promoted into the presence verdict',
        () => red(checkCb2Preflight, preSrc.replace(
          /from vault_ext\) = 1/g, 'from vault_other_ext) = 1'))],
      ['MU2-26', 'a write statement is introduced into the read-only preflight',
        () => red(checkCb2Preflight,
          preSrc + '\nalter table public.provider_credentials add column access_token text;\n')],
      ['MU2-27', 'the preflight starts INVOKING Vault instead of inspecting catalogs',
        () => red(checkCb2Preflight, preSrc + "\nselect vault.create_secret('x', 'y');\n")],
    ];

    for (const [id, why, detect] of cases) {
      let detected = false;
      try { detected = detect(); } catch (e) { detected = false; }
      if (!detected) undetected.push(`${id} (${why})`);
    }
    ok('MU2', undetected.length === 0, `CB-002 mutations NOT detected: ${undetected.join('; ')}`);
  }

  function run(vocab, src) {
    checkCb2Surface(src.mig, src.cert, src.adv, src.res);
    checkCb2Functions(src.mig);
    checkCb2PutContract(src.mig);
    checkCb2RotateContract(src.mig);
    checkCb2ResolveContract(src.mig);
    checkCb2RevokeContract(src.mig);
    checkCb2Certification(src.cert);
    checkCb2Adversarial(src.adv);
    checkCb2Residue(src.res);
    checkCb2NamingAndVocabulary(src.mig, vocab);
    checkCb2ConnectorProhibition(src.mig, src.cert, src.adv, src.res);
    checkCb2PlaintextColumns(src.mig, src.cert);
    checkCb2Preflight(src.pre);
  }

  function mutation(vocab, src) {
    mutationCb2(src.mig, src.cert, src.adv, src.res, vocab, src.pre);
  }

  return { run, mutation };
};