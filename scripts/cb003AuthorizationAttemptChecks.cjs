/**
 * CONNECTED BUSINESS — CB-003 AUTHORIZATION-ATTEMPT CHECKS
 *
 * Extracted from scripts/connectedBusinessFoundation.test.cjs so the harness stays
 * editable; the harness requires this module and calls run() + mutation(). Every
 * check is additive — nothing here weakens a CB-001, CB-001.1, CB-001.2 or CB-002
 * check.
 *
 * WHAT THIS IS FOR
 *   CB-003 is the boundary every future provider authorization starts from. Its
 *   security rests on properties that are easy to lose in a later edit and hard to
 *   notice: a raw state becoming storable, the ten-minute invariant drifting, the
 *   return_target rules weakening, the composite same-business FK being narrowed,
 *   the consuming UPDATE losing its status predicate, the consuming function
 *   starting to raise (an oracle), DELETE being granted, or the rollback
 *   disappearing from the adversarial suite. Each of those is a mutation below and
 *   must turn the harness RED.
 *
 * The module is pure: it reads strings, calls the supplied `ok`, and the supplied
 * `collect` for mutation isolation. It writes nothing.
 */
module.exports = function createCb3Checks({ ok, stripComments, collect }) {
  const T = 'public.provider_authorization_attempts';
  const FUNCTIONS = [
    { name: 'provider_authorization_attempt_create', sig: 'text, text, uuid, uuid, text, text',
      params: ['p_provider', 'p_connection_category', 'p_business_id', 'p_initiated_by_profile_id', 'p_state_hash', 'p_return_target'] },
    { name: 'provider_authorization_attempt_consume', sig: 'text, text',
      params: ['p_provider', 'p_state_hash'] },
    { name: 'provider_authorization_attempt_cancel', sig: 'uuid, uuid',
      params: ['p_attempt_id', 'p_business_id'] },
    { name: 'provider_authorization_attempt_fail', sig: 'uuid, uuid, text',
      params: ['p_attempt_id', 'p_business_id', 'p_failure_class'] },
  ];
  const COLUMNS = ['id', 'provider', 'connection_category', 'business_id', 'initiated_by_profile_id',
    'state_hash', 'status', 'return_target', 'created_at', 'expires_at', 'used_at',
    'result_connection_id', 'failure_class', 'attempt_nonce'];
  const CHECKS = ['provider_authorization_attempts_provider_check',
    'provider_authorization_attempts_category_check',
    'provider_authorization_attempts_status_check',
    'provider_authorization_attempts_state_hash_format',
    'provider_authorization_attempts_return_target_check',
    'provider_authorization_attempts_expiry_shape',
    'provider_authorization_attempts_failure_class_shape',
    'provider_authorization_attempts_lifecycle_shape'];
  const INDEXES = ['provider_authorization_attempts_business_status_idx',
    'provider_authorization_attempts_profile_idx',
    'provider_authorization_attempts_expiry_idx'];
  const RETURN_TARGET_RULES = [
    "return_target like '/%'",
    "return_target not like '//%'",
    'length(return_target) between 1 and 512',
    "position(':' in return_target) = 0",
    'position(chr(92) in return_target) = 0',
    "position('%' in return_target) = 0",
    "position('..' in return_target) = 0",
    "return_target !~ '[[:cntrl:]]'",
  ];
  const STATUS_DOMAIN = "check (status in ('pending', 'used', 'expired', 'failed', 'cancelled'))";
  const EXPIRY_INVARIANT = "check (expires_at = created_at + interval '10 minutes')";
  const EXPIRY_DEFAULT = "timestamptz not null default (now() + interval '10 minutes')";
  const SEARCH_PATH = 'set search_path = pg_catalog, public';
  // Raw-state / credential column names that must never be DECLARED here.
  const BANNED_COLUMNS = ['access_token', 'refresh_token', 'public_token', 'link_token',
    'authorization_code', 'client_secret', 'password', 'credential_value', 'plaintext_secret',
    'decrypted_secret', 'token_value', 'secret_value', 'state', 'raw_state', 'state_value',
    'state_token', 'oauth_state'];
  const SYNTHETIC_MARKER = 'vision_test_state_cb003_';
  const RESERVED_NAMESPACE = '00000000-0000-0000-0000-0000000c03';
  const SYNTHETIC_HASH_PATTERN = '\\1{31}';
  const CB3_GRID_IDS = ['CB3-U0',
    ...Array.from({ length: 28 }, (_, i) => `CB3-${String(i + 1).padStart(2, '0')}`),
    'CB3-C1'];
  const CB3_CERT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'];

  /** The full definition of one function, from CREATE through its closing $$; */
  function fnBlock(src, name) {
    const start = src.indexOf(`create or replace function public.${name}(`);
    if (start < 0) return null;
    const end = src.indexOf('$$;', start);
    return end < 0 ? null : src.slice(start, end + 3);
  }

  /** The declared parameter names of one function, from its own header. */
  function fnParams(src, name) {
    const start = src.indexOf(`create or replace function public.${name}(`);
    if (start < 0) return null;
    const open = src.indexOf('(', start);
    const close = src.indexOf('\n)', open);
    if (open < 0 || close < 0) return null;
    return [...src.slice(open, close).matchAll(/\bp_[a-z_]+\b/g)].map((m) => m[0]);
  }

  // ── CB-47 · presence ───────────────────────────────────────────────────────
  function checkPresence(src) {
    ok('CB-47', [src.mig, src.cert, src.adv, src.res].every((s) => s && s.length > 0),
      'all four CB-003 artifacts must exist');
  }

  // ── CB-48 · exactly one relation, and nothing else ────────────────────────
  function checkScopeOfCreation(migSrc) {
    const live = stripComments(migSrc);

    const tables = [...live.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
    ok('CB-48a', tables.length === 1 && tables[0] === 'provider_authorization_attempts',
      `exactly one table may be created, and it must be provider_authorization_attempts; found ${JSON.stringify(tables)}`);

    // No other relation, and no default-privilege change. The ONE permitted ALTER
    // TABLE is the explicit RLS enable — everything else about this table is fixed at
    // creation time. ALTER FUNCTION ... OWNER is separately REQUIRED (CB-56d).
    const otherRelations = [
      /\bcreate\s+(view|materialized\s+view|sequence|schema|type|trigger|policy|extension)\b/i,
      /\balter\s+default\s+privileges\b/i,
      /\bcreate\s+unique\s+index\b/i,
    ].filter((re) => re.test(live));
    ok('CB-48b', otherRelations.length === 0,
      `CB-003 must create no view, sequence, schema, type, trigger, policy, extension, implicit unique index or default privilege — found ${otherRelations.map(String).join(' ')}`);

    const alterTables = (live.match(/^\s*alter table\b[^;]*;/gim) || []).map((s) => s.replace(/\s+/g, ' ').trim());
    const badAlters = alterTables.filter((s) => s !== `alter table ${T} enable row level security;`);
    ok('CB-48d', badAlters.length === 0,
      `the only permitted ALTER TABLE is the explicit RLS enable — found: ${badAlters.join(' | ') || '<none>'}`);

    const idx = [...live.matchAll(/create index if not exists (provider_authorization_attempts_[a-z_]+_idx)/g)]
      .map((m) => m[1]);
    ok('CB-48c', idx.length === 3 && INDEXES.every((i) => idx.includes(i)),
      `exactly the three intended explicit indexes may be created (the two unique constraints index themselves); found ${JSON.stringify(idx)}`);
  }

  // ── CB-49 · the exact column set ──────────────────────────────────────────
  function checkColumns(migSrc) {
    const missing = COLUMNS.filter((c) => !new RegExp(`^\\s+${c}\\s`, 'm').test(migSrc));
    ok('CB-49a', missing.length === 0, `missing column(s): ${missing.join(', ')}`);

    // Nothing raw-state or credential-shaped may be declared as a column.
    const body = migSrc.slice(migSrc.indexOf(`create table if not exists ${T}`));
    const declared = BANNED_COLUMNS.filter((c) => new RegExp(`^\\s+${c}\\s+(text|uuid|jsonb|varchar)`, 'm').test(body));
    ok('CB-49b', declared.length === 0,
      `CB-003 must declare no raw-state or credential-shaped column — found ${declared.join(', ')}`);

    ok('CB-49c', /state_hash\s+text not null/.test(migSrc) && /attempt_nonce\s+uuid not null default gen_random_uuid\(\)/.test(migSrc),
      'state_hash must be a required text digest and attempt_nonce a generated uuid');
  }

  // ── CB-50 · the exact CHECK inventory ────────────────────────────────────
  function checkConstraintInventory(migSrc) {
    const missing = CHECKS.filter((c) => !new RegExp(`constraint ${c}\\b`).test(migSrc));
    ok('CB-50a', missing.length === 0, `missing constraint(s): ${missing.join(', ')}`);

    const total = (stripComments(migSrc).match(/constraint\s+provider_authorization_attempts_[a-z_]+/g) || []).length;
    ok('CB-50b', total === 10,
      `exactly 10 named constraints must be declared (8 CHECKs + the state_hash unique + the composite same-business FK); found ${total}`);

    const checkType = (stripComments(migSrc)
      .match(/constraint\s+provider_authorization_attempts_[a-z_]+\s*\n?\s*check/g) || []).length;
    ok('CB-50d', checkType === 8,
      `exactly 8 of those must be CHECK constraints — an extra CHECK is an unproven rule and a missing one is a lost invariant; found ${checkType}`);

    const live = stripComments(migSrc);
    const fks = (live.match(/constraint\s+provider_authorization_attempts_result_connection_same_business_fkey/g) || []).length;
    ok('CB-50c', fks === 1, 'the composite same-business FK must be declared exactly once');
  }

  // ── CB-51 · the ten-minute invariant, in BOTH places ─────────────────────
  function checkExpiryInvariant(migSrc) {
    ok('CB-51a', migSrc.includes(EXPIRY_INVARIANT),
      `the expiry invariant must be exactly \`${EXPIRY_INVARIANT}\``);
    ok('CB-51b', migSrc.includes(EXPIRY_DEFAULT),
      `expires_at must default to \`${EXPIRY_DEFAULT}\``);
    ok('CB-51c', !/created_at\s+timestamptz not null default clock_timestamp\(\)/.test(migSrc),
      'created_at must default to now(), not clock_timestamp() — the ten-minute invariant is computed by difference, and two non-stable timestamps would break it');
    ok('CB-51d', /constraint provider_authorization_attempts_expiry_shape\s+check/.test(migSrc),
      'the expiry-shape CHECK must be a real CHECK constraint, not a comment');
  }

  // ── CB-52 · the status domain ────────────────────────────────────────────
  function checkStatusDomain(migSrc) {
    ok('CB-52a', migSrc.includes(STATUS_DOMAIN),
      `the status domain must be exactly \`${STATUS_DOMAIN}\``);

    const domain = (migSrc.match(/check \(status in \(([^)]*)\)\)/) || [])[1] || '';
    const values = (domain.match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''));
    ok('CB-52b', values.length === 5 && new Set(values).size === 5,
      `the status domain must contain exactly 5 distinct values; found ${JSON.stringify(values)}`);
  }

  // ── CB-53 · the return_target invariant ─────────────────────────────────
  function checkReturnTargetInvariant(migSrc) {
    const missing = RETURN_TARGET_RULES.filter((r) => !migSrc.includes(r));
    ok('CB-53a', missing.length === 0,
      `the return_target invariant is missing rule(s): ${missing.join(' | ')}`);

    // The scheme rule is what removes every URL scheme at once. If it is relaxed to
    // a scheme blacklist, new schemes become reachable; the invariant must stay total.
    ok('CB-53b', !/return_target\s+(not\s+)?(i?like|~)\s*'%?(https?|javascript|data):/i.test(migSrc),
      'the return_target rule must exclude SCHEMES TOTALLY (no colon anywhere), never by blacklisting named schemes');
    ok('CB-53c', !/return_target[^;]*\bor\s+'\//i.test(migSrc),
      'the return_target rule must not be relaxed with an alternative branch');
  }

  // ── CB-54 · the foreign keys, exactly ───────────────────────────────────
  function checkForeignKeys(migSrc) {
    const live = stripComments(migSrc);

    ok('CB-54a', /business_id\s+uuid not null references public\.business_entities\(id\) on delete cascade/.test(live),
      'business_id must reference business_entities(id) ON DELETE CASCADE');

    ok('CB-54b', /initiated_by_profile_id\s+uuid null references public\.profiles\(id\) on delete set null/.test(live),
      'initiated_by_profile_id must use the canonical profiles.id identity, ON DELETE SET NULL — actor deletion must never delete attempt history');

    ok('CB-54c', /foreign key \(result_connection_id, business_id\)\s+references public\.business_connections \(id, business_id\) on delete cascade/.test(live),
      'the same-business FK must carry BOTH columns into business_connections (id, business_id) with cascade');

    ok('CB-54d', !/foreign key \(result_connection_id\)/.test(live),
      'the same-business FK must never be narrowed to result_connection_id alone — business_id is what makes it a same-business guarantee');

    ok('CB-54e', /constraint provider_authorization_attempts_state_hash_unique\s+unique \(state_hash\)/.test(live),
      'state_hash must be UNIQUE — replay prevention layer 1');

    ok('CB-54f', !/references public\.business_connections \(id\)(?!\s*,)/.test(live),
      'a single-column reference into business_connections(id) would not carry the business binding');
  }

  // ── CB-55 · the table ACL ───────────────────────────────────────────────
  function checkTableAcl(migSrc) {
    const live = stripComments(migSrc);

    ok('CB-55a', new RegExp(`alter table ${T} enable row level security;`).test(live),
      'RLS must be enabled EXPLICITLY, not left to the rls_auto_enable event trigger');

    const missing = ['public', 'anon', 'authenticated', 'service_role']
      .filter((r) => !new RegExp(`revoke all on table ${T} from ${r};`).test(live));
    ok('CB-55b', missing.length === 0,
      `the table must be REVOKEd from PUBLIC, anon, authenticated AND service_role explicitly — missing: ${missing.join(', ')}`);

    ok('CB-55c', new RegExp(`grant select, insert, update on table ${T} to service_role;`).test(live),
      'service_role must receive exactly SELECT/INSERT/UPDATE');

    const rev = live.indexOf(`revoke all on table ${T} from service_role;`);
    const gr = live.indexOf(`grant select, insert, update on table ${T} to service_role;`);
    ok('CB-55d', rev !== -1 && gr !== -1 && rev < gr,
      `REVOKE-then-GRANT is a correctness property — the reverse lands on nothing and locks every writer out (revoke@${rev}, grant@${gr})`);

    ok('CB-55e', !/grant[^;]*\bdelete\b[^;]*\bon table\b/i.test(live),
      'DELETE must never be granted on the attempts table — attempts are provenance and are retired by status');

    ok('CB-55f', !/delete\s+from\s+public\.provider_authorization_attempts/i.test(live),
      'the migration itself must never delete an attempt row');

    const grants = (live.match(/^\s*grant\b[^;]*;/gim) || [])
      .filter((l) => /on table/i.test(l));
    ok('CB-55g', grants.length === 1,
      `exactly one table GRANT may appear — found: ${grants.map((s) => s.trim()).join(' | ')}`);
  }

  // ── CB-56 · function hardening ──────────────────────────────────────────
  function checkFunctionHardening(migSrc) {
    const missing = FUNCTIONS.filter((f) => !fnBlock(migSrc, f.name));
    ok('CB-56a', missing.length === 0, `function(s) not defined: ${missing.map((f) => f.name).join(', ')}`);

    const blocks = FUNCTIONS.map((f) => ({ f, body: fnBlock(migSrc, f.name) || '' }));

    const notDefiner = blocks.filter((b) => !/\bsecurity definer\b/.test(b.body)).map((b) => b.f.name);
    ok('CB-56b', notDefiner.length === 0,
      `SECURITY DEFINER is required on every function: ${notDefiner.join(', ')}`);

    const notPinned = blocks.filter((b) => !b.body.includes(SEARCH_PATH)).map((b) => b.f.name);
    ok('CB-56c', notPinned.length === 0,
      `every function must pin exactly \`${SEARCH_PATH}\`: ${notPinned.join(', ')}`);

    const unpinnedOwner = FUNCTIONS.filter((f) => !new RegExp(
      `alter function public\\.${f.name}\\(${f.sig.replace(/[(),]/g, '\\$&')}\\) owner to postgres;`).test(migSrc))
      .map((f) => f.name);
    ok('CB-56d', unpinnedOwner.length === 0,
      `every function's owner must be PINNED to postgres — a SECURITY DEFINER function runs as its OWNER: ${unpinnedOwner.join(', ')}`);

    ok('CB-56e', !/security invoker/i.test(stripComments(migSrc)),
      'no SECURITY INVOKER function may exist on this boundary');
  }

  // ── CB-57 · function ACL ────────────────────────────────────────────────
  function checkFunctionAcl(migSrc) {
    const badRevoke = [];
    const badGrant = [];
    const badOrder = [];
    for (const f of FUNCTIONS) {
      const esc = f.sig.replace(/[(),]/g, '\\$&');
      const positions = {};
      for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
        positions[role] = migSrc.search(new RegExp(`revoke all on function public\\.${f.name}\\(${esc}\\) from ${role};`));
        if (positions[role] < 0) badRevoke.push(`${f.name}:${role}`);
      }
      const grantAt = migSrc.search(new RegExp(`grant execute on function public\\.${f.name}\\(${esc}\\) to service_role;`));
      if (grantAt < 0) badGrant.push(f.name);
      if (positions.service_role < 0 || grantAt < 0 || positions.service_role > grantAt) badOrder.push(f.name);
    }
    ok('CB-57a', badRevoke.length === 0,
      `every function must be REVOKEd from PUBLIC, anon, authenticated AND service_role — missing: ${badRevoke.join(', ')}`);
    ok('CB-57b', badGrant.length === 0, `every function must be granted to service_role — missing: ${badGrant.join(', ')}`);
    ok('CB-57c', badOrder.length === 0,
      `REVOKE-then-GRANT is a correctness property: ${badOrder.join(', ')}`);

    const browserGrants = (migSrc.match(/grant\s+execute\b[^;]*\bto\s+(PUBLIC|anon|authenticated)\b/gi) || []);
    ok('CB-57d', browserGrants.length === 0,
      `no function may ever be granted to PUBLIC, anon or authenticated — found ${browserGrants.join(' ')}`);
  }

  // ── CB-58 · function signatures and parameter surface ──────────────────
  function checkFunctionSignatures(migSrc) {
    for (const f of FUNCTIONS) {
      const params = fnParams(migSrc, f.name);
      const same = Array.isArray(params) && params.length === f.params.length
        && f.params.every((p) => params.includes(p));
      ok(`CB-58:${f.name}`, same,
        `${f.name} must take exactly {${f.params.join(', ')}}; found ${JSON.stringify(params)}`);
    }

    // The nonce must never become an input: it is an audit identity, not a key.
    const withNonce = FUNCTIONS.filter((f) => (fnParams(migSrc, f.name) || [])
      .some((p) => /nonce|raw|^p_state$/.test(p))).map((f) => f.name);
    ok('CB-58b', withNonce.length === 0,
      `no function may accept a nonce or a raw-state parameter — the digest is the only lookup key: ${withNonce.join(', ')}`);
  }

  // ── CB-59 · the consuming boundary is single-statement, silent, and total ─
  function checkConsumeSemantics(migSrc) {
    const body = fnBlock(migSrc, 'provider_authorization_attempt_consume') || '';

    const updates = (body.match(/update\s+public\.provider_authorization_attempts/g) || []).length;
    ok('CB-59a', updates === 1,
      `consumption must be exactly ONE UPDATE — multi-statement consumption cannot be race-safe; found ${updates}`);

    const predicates = [
      /a\.provider = p_provider/,
      /a\.state_hash = p_state_hash/,
      /a\.status = 'pending'/,
      /a\.expires_at > clock_timestamp\(\)/,
    ];
    const missing = predicates.filter((re) => !re.test(body));
    ok('CB-59b', missing.length === 0,
      `consumption is missing predicate(s): ${missing.map(String).join(' | ')} — status='pending' is replay prevention layer 2 and the expiry predicate is layer 3`);

    ok('CB-59c', /returning\s+a\.id,\s*a\.business_id,\s*a\.initiated_by_profile_id/.test(body),
      'consumption must RETURN the bound identity (id, business_id, initiated_by_profile_id) — that is what the callback re-authorizes');

    ok('CB-59d', !/raise\s+exception/i.test(body) && !/\braise\s+(notice|info|warning|log|debug)\b/i.test(body),
      'consumption must NEVER raise or log — a distinguishable outcome would be an oracle for an unauthenticated callback');

    ok('CB-59e', !/\binsert\s+into\b/i.test(body) && !/delete\s+from/i.test(body),
      'consumption must write nothing but status/used_at');

    // The other two transitions are the mirror image: they are called by an
    // already-authorized actor and must speak.
    for (const name of ['provider_authorization_attempt_cancel', 'provider_authorization_attempt_fail']) {
      const b = fnBlock(migSrc, name) || '';
      ok(`CB-59f:${name}`, /status = 'pending'/.test(b) && /raise\s+exception/i.test(b) && /business_id = p_business_id/.test(b),
        `${name} must be business-bound, must only act on a pending attempt, and must raise when nothing was actionable`);
    }
  }

  // ── CB-60 · creation cannot invent authority ────────────────────────────
  function checkCreateSemantics(migSrc) {
    const body = fnBlock(migSrc, 'provider_authorization_attempt_create') || '';

    ok('CB-60a', /v_now\s+timestamptz := now\(\)/.test(body) && /v_now \+ interval '10 minutes'/.test(body),
      'creation must compute created_at and expires_at from ONE stable timestamp, so the ten-minute invariant holds exactly');

    ok('CB-60b', !/coalesce\(p_business_id/.test(body) && !/p_business_id\s+is not null and/i.test(body),
      'creation must not substitute a fallback business — a null binding must be refused, never defaulted');

    ok('CB-60c', /'pending'/.test(body),
      'creation must produce a pending attempt');

    ok('CB-60d', !/vault\.|business_facts|business_fact_evidence|business_fact_conflicts/i.test(stripComments(migSrc)),
      'CB-003 must reference no Vault object and no Digital Twin fact table');

    // Judged with STRING LITERALS REMOVED as well: the migration legitimately NAMES
    // the schemes it refuses inside its own `comment on column ...` text, and a naive
    // scan cannot tell a description of a rejected scheme from a call to one.
    const code = stripComments(migSrc).replace(/'([^']|'')*'/g, "''");
    ok('CB-60e', !/\b(dblink|pg_net|http|https|fetch)\b/i.test(code),
      'CB-003 must call no provider and no network (outside its own description of the schemes it refuses)');
  }

  // ── CB-61 · scope discipline and atomicity ──────────────────────────────
  function checkScopeAndAtomicity(migSrc) {
    const live = stripComments(migSrc);

    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-61a', begins === 1 && commits === 1,
      `CB-003 must be one committing transaction (begins=${begins}, commits=${commits})`);

    ok('CB-61b', !/alter\s+table\s+public\.(business_connections|provider_credentials)/i.test(live),
      'CB-003 must not alter the certified CB-001 tables');

    ok('CB-61c', !/asServiceRole\.connectors|getConnection\s*\(\s*['"]supabase['"]/i.test(migSrc),
      'the Base44 shared Supabase connector must never appear on the CB-003 path');

    const deny = ['business_facts', 'business_fact_evidence', 'business_fact_conflicts',
      'shadow', 'canonicalfact', 'resolvefact', 'revenue', 'ebitda', 'profit', 'margin'];
    const hit = deny.filter((d) => live.toLowerCase().includes(d));
    ok('CB-61d', hit.length === 0,
      `CB-003 must touch no Digital Twin object and compute no financial metric (UNKNOWN != ZERO stays untouched) — found ${hit.join(', ')}`);
  }

  // ── CB-62 · the certification must agree with itself and the migration ──
  function checkCertification(certSrc) {
    const live = stripComments(certSrc);
    const declared = Number((certSrc.match(/returns ONE report: (\d+) rows/) || [])[1]);
    const firstRow = (certSrc.match(/select '([A-Z]{1,2})' id,/) || [])[1];
    const rest = [...certSrc.matchAll(/union all select '([A-Z]{1,2})'/g)].map((m) => m[1]);
    const all = firstRow ? [firstRow, ...rest] : rest;
    ok('CB-62a', declared === CB3_CERT_IDS.length && all.length === CB3_CERT_IDS.length
      && new Set(all).size === all.length && CB3_CERT_IDS.every((id) => all.includes(id)),
      `certification row count/documentation drift: declared=${declared}, actual=${all.length}, expected=${CB3_CERT_IDS.length}`);

    const writes = live.match(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/gim) || [];
    ok('CB-62b', writes.length === 0, `the certification must be READ-ONLY — found: ${writes.join(', ')}`);

    ok('CB-62c', /ROOT KEY \/ REAL-CREDENTIAL-USE BLOCKER/.test(certSrc) && /'BLOCKER' from facts f/.test(certSrc),
      'the real-credential-use blocker must be an explicitly reported row — a BLOCKER verdict that SQL cannot close');

    const sigs = FUNCTIONS.filter((f) => !certSrc.includes(`'${f.name}'`)).map((f) => f.name);
    ok('CB-62d', sigs.length === 0, `certification must assert: ${sigs.join(', ')}`);

    // The certification must re-prove the artifacts it depends on and the freeze.
    ok('CB-62e', /provider_credentials_superseded_same_rotation_unit_fkey/.test(certSrc)
      && /business_connections_id_business_unique/.test(certSrc),
      'the certification must re-prove the CB-001 anchor and the CB-001.2 FK it depends on');
    ok('CB-62f', /business_facts/.test(certSrc) && /business_fact_evidence/.test(certSrc)
      && /business_fact_conflicts/.test(certSrc),
      'the certification must re-prove the Digital Twin fact freeze (facts, evidence, conflicts)');
    ok('CB-62g', /provider_credential_put/.test(certSrc) && /provider_credential_revoke/.test(certSrc),
      'the certification must re-prove the CB-002 wrapper surface is intact');
  }

  // ── CB-63 · adversarial structure ───────────────────────────────────────
  function checkAdversarial(advSrc) {
    const live = stripComments(advSrc);
    const stmts = live.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const last = stmts[stmts.length - 1];
    const rowReturning = stmts.filter((s) => /^select\b/i.test(s));

    const begins = (live.match(/\bbegin\s*;/gi) || []).length;
    const rollbacks = (live.match(/\brollback\s*;/gi) || []).length;
    const commits = (live.match(/\bcommit\s*;/gi) || []).length;
    ok('CB-63a', begins === 1 && rollbacks === 1 && commits === 0 && /^rollback$/i.test(last),
      `the adversarial suite must be ONE rollback-only transaction whose final executable statement is ROLLBACK (begins=${begins}, rollbacks=${rollbacks}, commits=${commits})`);

    ok('CB-63b', /cb003_adversarial_results/.test(rowReturning[rowReturning.length - 1] || '')
      && !/cb001_adversarial_results|cb002_adversarial_results/.test(advSrc),
      'the verdict grid must be the last row-returning statement, and no earlier phase ledger may be reused');

    const realShapes = [
      /eyJ[A-Za-z0-9_-]{10,}/, /access-sandbox-/, /sandbox\.plaid\.com|production\.plaid\.com/,
      /quickbooks\.api\.intuit\.com/, /access_token\s*[=:]/, /refresh_token\s*[=:]/, /client_secret\s*[=:]/,
    ].filter((re) => re.test(advSrc));
    ok('CB-63c', advSrc.includes(SYNTHETIC_MARKER) && realShapes.length === 0,
      `every test state must be the synthetic marker ${SYNTHETIC_MARKER} and no real credential shape may appear — found ${realShapes.map(String).join(' ')}`);

    ok('CB-63d', advSrc.includes(RESERVED_NAMESPACE),
      `the suite must use the reserved CB-003 namespace ${RESERVED_NAMESPACE}xx`);

    ok('CB-63e', /set local role anon;/.test(advSrc) && /set local role authenticated;/.test(advSrc)
      && /set local role service_role;/.test(advSrc) && /'SKIPPED'/.test(advSrc),
      "the suite must test EXECUTE denial by switching role, record service_role's positive capability, and report SKIPPED rather than a false PASS when a role cannot be assumed");

    ok('CB-63f', /provider_authorization_attempts_result_connection_same_business_fkey/.test(advSrc)
      && /get stacked diagnostics v_constraint = constraint_name/.test(advSrc),
      'the database backstop must be proven by naming the constraint that fired');

    const missing = CB3_GRID_IDS.filter((id) => !advSrc.includes(`'${id}'`));
    ok('CB-63g', missing.length === 0,
      `adversarial grid incomplete — missing ${missing.join(', ')}`);

    // The expiry test must keep the invariant intact rather than corrupting a row.
    ok('CB-63h', /- interval '11 minutes'/.test(advSrc) && /v_past \+ interval '10 minutes'/.test(advSrc),
      "the expired-attempt test must backdate created_at and keep expires_at = created_at + 10 minutes, so expiry is proven WITHOUT violating the invariant");
  }

  // ── CB-64 · residue companion ───────────────────────────────────────────
  function checkResidue(resSrc) {
    const live = stripComments(resSrc);

    ok('CB-64a', (live.match(/\bselect\b/gi) || []).length >= 1
      && !/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|begin|commit|rollback|do)\b/i.test(live),
      'the residue check must be READ-ONLY: no write, no DDL, no transaction, nothing to clean up');

    ok('CB-64b', resSrc.includes(SYNTHETIC_HASH_PATTERN) && resSrc.includes('0c03%'),
      'the residue check must key on BOTH residue shapes: the repeating byte-pair digest pattern AND the reserved connection namespace');

    ok('CB-64c', /as residual_attempts/.test(resSrc) && /as residual_connections/.test(resSrc)
      && /as cleanup_verdict/.test(resSrc),
      'the residue check must report residual_attempts, residual_connections and a cleanup_verdict');

    ok('CB-64d', /then 'PASS'/.test(resSrc) && /else 'FAIL'/.test(resSrc),
      'the cleanup verdict must be PASS only when both residue counts are zero');
  }

  // ── CB-65 · the digest key is a repeating byte-pair, provably synthetic ──
  function checkSyntheticDigestKey(advSrc, resSrc) {
    const advHashes = [...advSrc.matchAll(/repeat\('([0-9a-f]{2})',\s*32\)/g)].map((m) => m[1]);
    ok('CB-65a', advHashes.length >= 8,
      `the suite must build every digest as repeat('XX', 32) — found ${advHashes.length}`);

    const tampered = /repeat\('([0-9a-f]{2})',\s*31\)\s*\|\|\s*'([0-9a-f]{2})'/.test(advSrc);
    ok('CB-65b', tampered,
      'the suite must include a tampered digest of the SAME shape (31 pairs plus a different pair) so the tamper test cannot be satisfied by a length rejection');

    ok('CB-65c', !/repeat\('zz'[^)]*\)\s*--/.test(resSrc),
      'the residue check must not be weakened by excluding the synthetic pattern');
  }

  // ── CB-67 · the frozen RAW STATE / DIGEST encoding contract ─────────────
  // The representation contract lives in the migration's COMMENTS, because a
  // comment is what a future call site reads before deciding what to hash. This
  // check therefore reads the RAW source on purpose: here the comments ARE the
  // contract under test, while the executable statement is separately pinned by
  // CB-67g.
  //
  // WHAT IT PROTECTS (the correction): the database proves a digest
  // REPRESENTATION, never that the backend hashed anything — no shape test can
  // prove provenance. Freezing raw-state generation to 43-character unpadded
  // base64url is what makes VISION's canonical raw state unable to satisfy the
  // 64-lowercase-hex column, and the claim must stay exactly that narrow.
  const RAW_CONTRACT = {
    '32 CSPRNG bytes': /32 cryptographically secure random bytes/i,
    'base64url without padding': /base64url without padding/i,
    '43 characters': /exactly 43 characters/i,
    'SHA-256 over UTF-8': /SHA-256 over the UTF-8 bytes/i,
    'lowercase hexadecimal': /lowercase hexadecimal/i,
    '64 characters': /exactly 64 characters/i,
  };
  const OVERCLAIM = [
    /unstorable/i,
    /no raw token has this shape/i,
    /mathematically impossible/i,
    /physically cannot hold a raw state/i,
    /can never be written/i,
  ];
  function checkEncodingContract(migSrc, certSrc, advSrc) {
    const missing = Object.entries(RAW_CONTRACT).filter(([, re]) => !re.test(migSrc)).map(([k]) => k);
    ok('CB-67a', missing.length === 0,
      `the migration must freeze the encoding contract — raw: 32 CSPRNG bytes -> base64url WITHOUT PADDING -> 43 characters; stored: SHA-256 over the UTF-8 bytes -> lowercase hexadecimal -> 64 characters. Missing: ${missing.join(', ')}`);

    ok('CB-67b', /DISJOINT BY CONSTRUCTION/.test(migSrc) && /cannot satisfy/i.test(migSrc),
      'the contract must state that the two canonical representations are disjoint by construction and that the raw state cannot satisfy the digest constraint');

    ok('CB-67c', /REPRESENTATIONAL, NOT CRYPTOGRAPHIC/.test(migSrc)
      && /does NOT prove that the backend/i.test(migSrc)
      && /BACKEND BOUNDARY remains/i.test(migSrc),
      'the migration must state exactly what the constraint proves — the digest REPRESENTATION, never that the backend computed SHA-256');

    ok('CB-67d', /REPRESENTATION, not provenance/i.test(advSrc) && /remains the backend's duty/i.test(advSrc),
      'the adversarial suite must carry the same claim-scope correction');

    const claims = [migSrc, certSrc, advSrc]
      .flatMap((s, i) => OVERCLAIM.filter((re) => re.test(s)).map((re) => `source[${i}]:${re}`));
    ok('CB-67e', claims.length === 0,
      `no artifact may claim that a raw token is impossible by shape, or that the database proves a digest cryptographically — found ${claims.join(' | ')}`);

    const live = stripComments(migSrc);
    const mechanical = [
      /^\s*(raw_state|state|state_value|state_token|oauth_state)\s+(text|uuid|bytea|varchar)/im,
      /\bp_raw_state\b/i,
      /\bpgcrypto\b/i,
      /\bgen_random_bytes\s*\(/i,
      /\bdigest\s*\(/i,
      /\bcrypt\s*\(/i,
      /\bencode\s*\(/i,
    ].filter((re) => re.test(live));
    ok('CB-67f', mechanical.length === 0,
      `the correction is a DOCUMENTED encoding contract — no raw-state column, no raw-state parameter, no pgcrypto and no hashing inside Postgres: found ${mechanical.map(String).join(' ')}`);

    ok('CB-67g', /constraint provider_authorization_attempts_state_hash_format\s+check \(state_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(live),
      'the digest constraint must remain EXACTLY ^[0-9a-f]{64}$ — this correction is wording, never a widened predicate');
  }

  // ── CB-68 · the certification must prove argument TYPES structurally ───────
  // A live run exposed a CERTIFICATION defect, not a deployment defect: the live
  // side came from pg_get_function_identity_arguments(), which returns NAMES +
  // types ('p_attempt_id uuid, p_business_id uuid'), so it could never equal a
  // types-only expected string and row P reported 0 of 4 against four healthy
  // functions. The fix reads the ORDERED ARGUMENT TYPE OIDs from the catalog.
  // CB-68c is behavioural rather than textual: the certification's expected
  // signatures are compared against the ordered TYPES parsed from the MIGRATION
  // itself, so the two artifacts can never drift.
  const WRAPPER_NAMES = [
    'provider_authorization_attempt_create',
    'provider_authorization_attempt_consume',
    'provider_authorization_attempt_cancel',
    'provider_authorization_attempt_fail',
  ];

  /** Ordered argument TYPE list, taken from the MIGRATION's own function header.
   *  Only the type token of each parameter is kept — the NAME is deliberately
   *  discarded, because a name is exactly what PostgreSQL adds to the identity
   *  arguments and what must never reach an expectation. */
  function migrationArgTypes(migSrc, name) {
    const start = migSrc.indexOf(`create or replace function public.${name}(`);
    if (start < 0) return null;
    const open = migSrc.indexOf('(', start);
    const close = migSrc.indexOf('\n)', open);
    if (open < 0 || close < 0) return null;
    const types = [];
    for (const raw of migSrc.slice(open + 1, close).split(',')) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^[a-z_][a-z0-9_ ]*\s+([a-z_][a-z0-9_ ]*)$/i);
      if (m) types.push(m[1].trim().replace(/\s+/g, ' '));
    }
    return types.join(', ');
  }

  /** The certification's expected wrapper TYPE signatures, in declaration order. */
  function certExpectedSignatures(certSrc) {
    const block = certSrc.match(/expected_wrappers\(name, type_signature\) as \(\s*values([\s\S]*?)\n\)/);
    if (!block) return null;
    return [...block[1].matchAll(/\('([a-z_]+)',\s*'([^']*)'\)/g)].map((m) => [m[1], m[2]]);
  }

  /** PostgreSQL type names this surface may legitimately declare. A parameter NAME
   *  is not one, so an expectation containing one fails here. */
  const KNOWN_TYPE_TOKENS = new Set(['text', 'uuid', 'integer', 'int', 'bigint', 'smallint',
    'boolean', 'bool', 'jsonb', 'json', 'timestamptz', 'timestamp', 'date', 'numeric',
    'decimal', 'double precision', 'real', 'character varying', 'varchar', 'void', 'interval']);

  function checkStructuralSignatureProof(certSrc, migSrc) {
    // CB-68a — derived from the ordered type OIDs, canonically rendered.
    ok('CB-68a', /p\.proargtypes::oid\[\]/.test(certSrc)
      && /string_agg\(format_type\(/.test(certSrc)
      && /with ordinality/.test(certSrc)
      && /order by u\.ord/.test(certSrc),
      'the live argument signature must be derived STRUCTURALLY from p.proargtypes (ordered type OIDs) rendered by format_type(), never from a name-bearing printed list');

    // CB-68b — the truth comparison uses that structural signature.
    ok('CB-68b', /join expected_wrappers e on e\.name = f\.proname and e\.type_signature = f\.type_signature/.test(certSrc),
      'the wrapper comparison must join the expected TYPE signature to the structural one');

    // CB-68b2 — the name-bearing rendering may be shown, never compared.
    ok('CB-68b2', /as identity_args/.test(certSrc)
      && !/e\.(signature|identity_args)\s*=\s*f\.identity_args/.test(certSrc)
      && !/identity_args\s*=/.test(certSrc)
      && !/= f\.identity_args/.test(certSrc),
      'pg_get_function_identity_arguments() may appear for observability but must never be the compared value');

    // CB-68c — cross-artifact: the expectations equal the migration's ordered types.
    const expected = certExpectedSignatures(certSrc);
    ok('CB-68c0', Array.isArray(expected) && expected.length === WRAPPER_NAMES.length,
      `the certification must declare exactly ${WRAPPER_NAMES.length} expected wrappers; found ${JSON.stringify(expected)}`);
    const drift = [];
    for (const name of WRAPPER_NAMES) {
      const fromMig = migrationArgTypes(migSrc, name);
      const fromCert = ((expected || []).find(([n]) => n === name) || [])[1];
      if (!fromMig || fromCert !== fromMig) {
        drift.push(`${name}: cert=${JSON.stringify(fromCert)} migration=${JSON.stringify(fromMig)}`);
      }
    }
    ok('CB-68c', drift.length === 0,
      `the certification's expected argument types must equal the migration's ordered argument types: ${drift.join(' | ')}`);

    // CB-68c2 — no parameter NAME can enter an expectation.
    const badTokens = [];
    for (const [n, sig] of (expected || [])) {
      for (const t of sig.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!KNOWN_TYPE_TOKENS.has(t)) badTokens.push(`${n}: ${JSON.stringify(t)}`);
      }
    }
    ok('CB-68c2', (expected || []).length > 0 && badTokens.length === 0,
      `expected signatures must be TYPES ONLY — a parameter name in them is what produced the false 0 of 4 (found ${badTokens.join(', ')})`);

    // CB-68d — exactly four functions, so an extra overload cannot hide.
    ok('CB-68d', /as fn_count/.test(certSrc) && /f\.fn_count\s*=\s*4/.test(certSrc),
      'row P must also require the TOTAL function count to be 4, so an extra overload of a known name cannot hide behind the four matches');
  }

  // ── CB-69 · the certification must prove the ten-minute default SEMANTICALLY ─
  // The same live run exposed the second defect: PostgreSQL canonicalises the
  // stored interval, so the DEFAULT deparses as (now() + '00:10:00'::interval) and
  // the previous comparison of the printed text reported a false FAIL against a
  // correct deployment. The rule is now: reduce the DURATION to SECONDS and compare
  // the NUMBER (600) — for the DEFAULT and for the expiry-shape CHECK — while still
  // requiring the CHECK to exist, the basis to be now(), and an uninterpretable
  // rendering to FAIL rather than silently pass.
  const Z_SHAPE_OK = "CHECK ((expires_at = (created_at + '00:10:00'::interval)))";
  const Z_CANONICAL = [
    { label: "the LIVE rendering '00:10:00'", expr: "(now() + '00:10:00'::interval)", want: true },
    { label: "variable-width hour '0:10:00'", expr: "(now() + '0:10:00'::interval)", want: true },
    { label: "standard form interval '00:10:00'", expr: "(now() + interval '00:10:00')", want: true },
  ];
  const Z_WRONG = [
    { label: '5 minutes', expr: "(now() + '00:05:00'::interval)", want: false },
    { label: '15 minutes', expr: "(now() + '00:15:00'::interval)", want: false },
    { label: '9 minutes 59 seconds', expr: "(now() + '00:09:59'::interval)", want: false },
    { label: 'wrong generation basis (clock_timestamp)', expr: "(clock_timestamp() + '00:10:00'::interval)", want: false },
    { label: 'no default at all', expr: '<none>', want: false },
    { label: 'non-time rendering', expr: "(now() + '1 day'::interval)", want: false },
    { label: 'expiry-shape CHECK missing', expr: "(now() + '00:10:00'::interval)", present: 0, want: false },
    { label: 'the CHECK itself drifts to 5 minutes', expr: "(now() + '00:10:00'::interval)",
      shape: "CHECK ((expires_at = (created_at + '00:05:00'::interval)))", want: false },
  ];
  const INTERVAL_TIME_FORM = /^[0-9]{1,4}:[0-9]{2}:[0-9]{2}$/;

  function extractIntervalLiteral(text) {
    if (typeof text !== 'string') return null;
    const cast = text.match(/'([^']+)'::interval/);
    if (cast) return cast[1];
    const standard = text.match(/interval\s+'([^']+)'/);
    return standard ? standard[1] : null;
  }

  function intervalSeconds(text) {
    const literal = extractIntervalLiteral(text);
    if (literal === null || !INTERVAL_TIME_FORM.test(literal)) return null;
    const [h, m, s] = literal.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }

  /** Mirrors the artifact's Z verdict, with the frozen 600-second requirement. */
  const zVerdict = ({ expr, shape = Z_SHAPE_OK, present = 1 }) =>
    present === 1
    && /now\(\)/i.test(String(expr))
    && intervalSeconds(expr) === 600
    && intervalSeconds(shape) === 600;

  function checkExpirySemanticProof(certSrc) {
    // CB-69a — the pretty-printed comparison is gone; the semantic inputs remain.
    ok('CB-69a', !/expires_default\s+like\s+'%10 minutes%'/.test(certSrc)
      && /expires_default_uses_now/.test(certSrc),
      'the ten-minute proof must not depend on PostgreSQL pretty-printing the interval, and must still read the generation basis');

    // CB-69b — the requirement is the NUMBER of seconds, 600, for BOTH halves.
    ok('CB-69b', (certSrc.match(/= 600/g) || []).length >= 2
      && /as default_interval_seconds/.test(certSrc)
      && /as shape_interval_seconds/.test(certSrc),
      'the semantic requirement must be 600 seconds, applied to BOTH the default duration and the expiry-shape duration');

    // CB-69c — the canonical time form is interpreted explicitly, nothing looser.
    ok('CB-69c', /\^\[0-9\]\{1,4\}:\[0-9\]\{2\}:\[0-9\]\{2\}\$/.test(certSrc),
      "the duration must be derived from PostgreSQL's canonical HH:MM:SS interval form, so an uninterpretable rendering cannot be silently accepted");

    // CB-69d — the VERDICT must still require the CHECK and the now() basis, as one
    // conjunction. Asserting on the verdict chain rather than on any mention of the
    // fact is what makes "drop the CHECK requirement" detectable: the same fact is
    // also referenced in the observed text, where it REPORTS but does not DECIDE.
    const verdictChain = /case when f\.expiry_shape_present = 1\s+and f\.expires_default_uses_now\s+and f\.default_interval_seconds = 600\s+and f\.shape_interval_seconds = 600\s+then 'PASS' else 'FAIL' end/;
    ok('CB-69d', verdictChain.test(certSrc),
      'row Z must still require the expiry-shape CHECK to be present and the default basis to be now(), together with BOTH 600-second durations, inside the verdict itself');

    // CB-69e — BEHAVIOURAL. The mirror above reimplements the artifact's verdict on
    // purpose: it is only meaningful because CB-69a..d pin the SQL to the same rule
    // (600 seconds for both halves, canonical form, CHECK present, basis now()).
    const results = [
      ...Z_CANONICAL.map((c) => ({ label: c.label, got: zVerdict(c), want: true })),
      ...Z_WRONG.map((c) => ({ label: c.label, got: zVerdict(c), want: false })),
    ];
    const wrong = results.filter((r) => r.got !== r.want)
      .map((r) => `${r.label}: ${r.got} (want ${r.want})`);
    ok('CB-69e', wrong.length === 0,
      `the ten-minute proof must ACCEPT PostgreSQL's canonical 00:10:00 rendering and FAIL 5 or 15 minutes, a wrong basis, a missing CHECK and an uninterpretable rendering: ${wrong.join(' | ')}`);
  }

  // ── CB-70 · the certified same-business constraint IDENTITY, consistently ───
  // A live adversarial run exposed a third certification-class defect, and the
  // subtlest of the three. The same-business FK is DECLARED as a 68-character
  // name, and PostgreSQL truncates EVERY identifier to NAMEDATALEN-1 = 63 BYTES.
  // The deployed catalog therefore holds the 63-byte prefix, and GET STACKED
  // DIAGNOSTICS returns that stored name — CONSTRAINT_NAME is TEXT, so the
  // comparison is a true text comparison.
  // The two CATALOG rows passed anyway, and that is the trap: `conname` is of type
  // `name`, so comparing it to a long literal truncates the LITERAL to 63 bytes too
  // and the comparison succeeds. Only the TEXT comparison failed. An expectation
  // that was wrong about the stored name was therefore invisible to every
  // name-typed check, and visible only in the one behavioural row that reads the
  // diagnostics. These assertions close that class: the identity must be DERIVED
  // (declared name -> stored name -> catalog-derived name) and compared EXPLICITLY,
  // on the behavioural side and on the catalog side, in every artifact.
  const FK_DECLARED = 'provider_authorization_attempts_result_connection_same_business_fkey';
  const NAME_BYTES = 63;

  function checkConstraintIdentityConsistency(migSrc, certSrc, advSrc) {
    const adv = stripComments(advSrc);
    const cert = stripComments(certSrc);
    const mig = stripComments(migSrc);

    // CB-70a — the diagnostics value is TEXT. Comparing it to a stored-identifier
    // literal longer than 63 bytes can never succeed, because PostgreSQL stored the
    // truncated name. This is EXACTLY what made CB3-21 report a stale expectation.
    const tooLong = [...adv.matchAll(/v_constraint\s*=\s*'([^']*)'/g)]
      .map((m) => m[1]).filter((s) => s.length > NAME_BYTES);
    ok('CB-70a', tooLong.length === 0,
      `no constraint_name comparison may use an identifier literal longer than ${NAME_BYTES} bytes — PostgreSQL stores at most that many; found ${JSON.stringify(tooLong)}`);

    // CB-70b — the compared value must be the CATALOG-derived name, read
    // structurally and deterministically, not a second opinion about the name.
    ok('CB-70b', /select c\.conname::text into v_fk_name/.test(adv)
      && /order by c\.conname::text/.test(adv)
      && /limit 1/.test(adv)
      && /c\.conname::text = v_fk_expected/.test(adv)
      && /v_constraint = v_fk_name/.test(adv)
      && !/c\.conname\s*=\s*'/.test(adv),
      'the same-business FK identity must be DERIVED from the catalog (conname::text, structurally selected, deterministic order) and compared against that derived name; no implicit name-typed comparison may remain');

    // CB-70c — one spelling, one truncation: the declared name is held ONCE and the
    // stored form is DERIVED from it, never written out a second time.
    const spellings = (adv.match(new RegExp(FK_DECLARED, 'g')) || []).length;
    ok('CB-70c', /v_fk_declared text := 'provider_authorization_attempts_result_connection_same_business_fkey'/.test(adv)
      && /v_fk_expected text := left\(v_fk_declared, 63\)/.test(adv)
      && spellings === 1,
      `the declared name must be held ONCE and the stored name derived with left(<declared>, 63) — found ${spellings} spelling(s)`);

    // CB-70d — the CERTIFICATION must identify the same constraint the same way.
    ok('CB-70d', new RegExp(`c\\.conname::text = left\\('${FK_DECLARED}', 63\\)`).test(cert)
      && !new RegExp(`c\\.conname = '${FK_DECLARED}'`).test(cert),
      'the certification must compare the same-business FK name EXPLICITLY as text against the stored 63-byte form — an implicit name-typed comparison passes while a wrong expectation stays invisible');

    // CB-70e — the artifact's expectation must be the MIGRATION's own declared
    // spelling, so it cannot drift from the object it identifies.
    const migName = (mig.match(/constraint\s+(provider_authorization_attempts_result_connection_same_business[a-z_]*)/) || [])[1];
    ok('CB-70e', migName === FK_DECLARED,
      `the adversarial expectation must carry the MIGRATION's declared constraint name: migration=${JSON.stringify(migName)} artifact=${JSON.stringify(FK_DECLARED)}`);
  }

  // ==========================================================================
  // MU3-series — every CB-003 check must actually FAIL on the way it can break.
  // Mutations are applied IN MEMORY ONLY: no artifact on disk is ever written, so
  // restoring the canonical artifacts is guaranteed by construction.
  // ==========================================================================
  function mutationCb3(src) {
    const undetected = [];
    const red = (fn, mutated) =>
      collect(() => fn(mutated)).some((f) => /^CB-(4[7-9]|5\d|6\d|7\d)/.test(f));

    const PUT_REVOKE = `revoke all on function public.provider_authorization_attempt_create(text, text, uuid, uuid, text, text) from PUBLIC;`;
    const TBL_REVOKE = `revoke all on table ${T} from service_role;`;
    const TBL_GRANT = `grant select, insert, update on table ${T} to service_role;`;
    const CONSUME_REVOKE = `revoke all on function public.provider_authorization_attempt_consume(text, text) from service_role;`;
    const CONSUME_GRANT = `grant execute on function public.provider_authorization_attempt_consume(text, text) to service_role;`;

    const cases = [
      // ── the same-business constraint IDENTITY (the CB3-21 correction) ───────
      ['MU3-39', 'CB3-21 regresses to comparing the TEXT diagnostics value against the 68-char declared name',
        () => red((a) => checkConstraintIdentityConsistency(src.mig, src.cert, a),
          src.adv.replace('case when v_constraint = v_fk_name then',
            "case when v_constraint = 'provider_authorization_attempts_result_connection_same_business_fkey' then"))],
      ['MU3-40', 'CB3-21 compares against the expected constant instead of the catalog-derived identity',
        () => red((a) => checkConstraintIdentityConsistency(src.mig, src.cert, a),
          src.adv.replace('v_constraint = v_fk_name', 'v_constraint = v_fk_expected'))],
      ['MU3-41', 'the catalog derivation loses its deterministic ordering',
        () => red((a) => checkConstraintIdentityConsistency(src.mig, src.cert, a),
          src.adv.replace('  order by c.conname::text\n  limit 1;', '  limit 1;'))],
      ['MU3-42', 'the stored name is written out a second time as a hardcoded literal',
        () => red((a) => checkConstraintIdentityConsistency(src.mig, src.cert, a),
          src.adv.replace('v_fk_expected text := left(v_fk_declared, 63);',
            "v_fk_expected text := 'provider_authorization_attempts_result_connection_same_business';"))],
      ['MU3-43', 'the certification regresses to the implicit name-typed comparison',
        () => red((c) => checkConstraintIdentityConsistency(src.mig, c, src.adv),
          src.cert.replace("c.conname::text = left('provider_authorization_attempts_result_connection_same_business_fkey', 63)",
            "c.conname = 'provider_authorization_attempts_result_connection_same_business_fkey'"))],
      // ── the P and Z CERTIFICATION defects found by the live run ─────────────
      ['MU3-31', 'the live signature regresses to the name-bearing identity arguments',
        () => red((c) => checkStructuralSignatureProof(c, src.mig),
          src.cert.replace('e.type_signature = f.type_signature', 'e.type_signature = f.identity_args'))],
      ['MU3-32', "the expected signature for cancel drifts ('uuid, uuid' -> 'text, text')",
        () => red((c) => checkStructuralSignatureProof(c, src.mig),
          src.cert.replace("('provider_authorization_attempt_cancel',  'uuid, uuid')",
            "('provider_authorization_attempt_cancel',  'text, text')"))],
      ['MU3-33', 'row P stops requiring the total function count to be four, so an extra overload could hide',
        () => red((c) => checkStructuralSignatureProof(c, src.mig),
          src.cert.replace('and f.fn_count = 4 ', ''))],
      ['MU3-34', 'a parameter NAME is put back into an expected signature',
        () => red((c) => checkStructuralSignatureProof(c, src.mig),
          src.cert.replace("('provider_authorization_attempt_cancel',  'uuid, uuid')",
            "('provider_authorization_attempt_cancel',  'p_attempt_id uuid, p_business_id uuid')"))],
      ['MU3-35', 'the interval proof regresses to the pretty-printed text comparison',
        () => red(checkExpirySemanticProof,
          src.cert.replace('f.default_interval_seconds = 600', "f.expires_default like '%10 minutes%'"))],
      ['MU3-36', 'the required duration drifts from 600 to 300 seconds',
        () => red(checkExpirySemanticProof,
          src.cert.replace('f.default_interval_seconds = 600', 'f.default_interval_seconds = 300'))],
      ['MU3-37', 'the expiry-shape CHECK requirement is dropped from row Z (the observed text still mentions it)',
        () => red(checkExpirySemanticProof,
          src.cert.replace(/case when f\.expiry_shape_present = 1\s+and f\.expires_default_uses_now/,
            'case when f.expires_default_uses_now'))],
      ['MU3-38', 'the canonical time-form guard is removed, so an uninterpretable default could pass',
        () => red(checkExpirySemanticProof,
          src.cert.replace("'^[0-9]{1,4}:[0-9]{2}:[0-9]{2}$'", "'%'"))],
      // ── the raw-state / digest ENCODING CONTRACT (the CB-003 correction) ───
      ['MU3-23', 'the frozen 43-character contract is dropped from the migration header',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace(/exactly 43 characters/g, 'a certain number of characters'))],
      ['MU3-24', 'the padding requirement is inverted (base64url WITH padding)',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace(/BASE64URL WITHOUT PADDING/, 'BASE64URL WITH PADDING'))],
      ['MU3-25', 'the UTF-8 preimage is dropped from the hash contract',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace(/SHA-256 over the UTF-8 bytes/g, 'SHA-256'))],
      ['MU3-26', 'the disjointness statement is removed',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace(/DISJOINT BY CONSTRUCTION/g, 'RELATED'))],
      ['MU3-27', 'the claim-scope correction is removed from the migration',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace(/REPRESENTATIONAL, NOT CRYPTOGRAPHIC/g, 'CRYPTOGRAPHIC'))],
      ['MU3-28', 'the overclaim is reintroduced — a raw token declared UNSTORABLE by shape',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          `${src.mig}\n-- no raw token has this shape, so a raw token is UNSTORABLE\n`)],
      ['MU3-29', 'the digest constraint is widened to also accept the canonical raw-state shape',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace("check (state_hash ~ '^[0-9a-f]{64}$')",
            "check (state_hash ~ '^[0-9a-f]{64}$' or state_hash ~ '^[A-Za-z0-9_-]{43}$')"))],
      ['MU3-30', 'a raw_state column is added to the table',
        () => red((m) => checkEncodingContract(m, src.cert, src.adv),
          src.mig.replace('  state_hash                text not null,',
            '  state_hash                text not null,\n  raw_state                 text null,'))],

      ['MU3-1', 'a PUBLIC revoke is removed from one function',
        () => red(checkFunctionAcl, src.mig.replace(PUT_REVOKE, ''))],
      ['MU3-2', 'the table service_role revoke is removed (inherited arwdDxtm survives)',
        () => red(checkTableAcl, src.mig.replace(TBL_REVOKE, ''))],
      ['MU3-3', 'DELETE is granted on the attempts table',
        () => red(checkTableAcl, src.mig + `\ngrant delete on table ${T} to service_role;\n`)],
      ['MU3-4', 'the table GRANT is placed BEFORE the REVOKE (the lockout order)',
        () => red(checkTableAcl, src.mig
          .replace(TBL_REVOKE, '')
          .replace(TBL_GRANT, `${TBL_GRANT}\n${TBL_REVOKE}`))],
      ['MU3-5', 'SECURITY INVOKER substituted on a function',
        () => red(checkFunctionHardening, src.mig.replace(
          'language plpgsql\nsecurity definer\nset search_path = pg_catalog, public',
          'language plpgsql\nsecurity invoker\nset search_path = pg_catalog, public'))],
      ['MU3-6', 'the pinned search_path is removed from one function',
        () => red(checkFunctionHardening, src.mig.replace(`\n${SEARCH_PATH}`, ''))],
      ['MU3-7', "the status domain gains 'consumed'",
        () => red(checkStatusDomain, src.mig.replace(
          "check (status in ('pending', 'used', 'expired', 'failed', 'cancelled'))",
          "check (status in ('pending', 'used', 'consumed', 'expired', 'failed', 'cancelled'))"))],
      ['MU3-8', 'the ten-minute invariant drifts to nine minutes',
        () => red(checkExpiryInvariant, src.mig.replace(/interval '10 minutes'/g, "interval '9 minutes'"))],
      ['MU3-9', 'the protocol-relative rule is dropped from return_target',
        () => red(checkReturnTargetInvariant, src.mig.replace("      and return_target not like '//%'\n", ''))],
      ['MU3-10', 'a raw-state column is introduced',
        () => red(checkColumns, src.mig.replace(
          '  attempt_nonce             uuid not null default gen_random_uuid(),',
          '  attempt_nonce             uuid not null default gen_random_uuid(),\n  raw_state                 text not null,'))],
      ['MU3-11', 'the same-business FK is narrowed to one column',
        () => red(checkForeignKeys, src.mig.replace(
          'foreign key (result_connection_id, business_id)\n    references public.business_connections (id, business_id) on delete cascade',
          'foreign key (result_connection_id)\n    references public.business_connections (id) on delete cascade'))],
      ['MU3-12', 'the consuming UPDATE loses its status = pending predicate (replay becomes possible)',
        () => red(checkConsumeSemantics, src.mig.replace("     and a.status = 'pending'\n", ''))],
      ['MU3-13', 'the consuming function starts raising (becomes an oracle)',
        () => red(checkConsumeSemantics, src.mig.replace(
          '  if p_provider is null or p_state_hash is null then\n    return;\n  end if;',
          "  if p_provider is null or p_state_hash is null then\n    raise exception 'consume: missing input';\n  end if;"))],
      ['MU3-14', 'the consuming function gains a second write',
        () => red(checkConsumeSemantics, src.mig.replace(
          'end;\n$$;\n\nalter function public.provider_authorization_attempt_consume',
          "  delete from public.provider_authorization_attempts where status = 'expired';\nend;\n$$;\n\nalter function public.provider_authorization_attempt_consume"))],
      ['MU3-15', 'the synthetic-cleanup rollback is removed from the adversarial suite',
        () => red(checkAdversarial, src.adv.replace(/^rollback;$/m, ''))],
      ['MU3-16', 'an adversarial grid id is removed',
        () => red(checkAdversarial, src.adv.replace(/'CB3-11'/g, "'CB3-XX'"))],
      ['MU3-17', 'a Digital Twin write is introduced',
        () => red(checkScopeAndAtomicity,
          src.mig + '\ninsert into public.business_facts (id) values (gen_random_uuid());\n')],
      ['MU3-18', 'the Base44 shared Supabase connector is introduced on the CB-003 path',
        () => red(checkScopeAndAtomicity,
          src.mig + "\n-- base44.asServiceRole.connectors.getConnection('supabase')\n")],
      ['MU3-19', 'the return_target rules are replaced by a named-scheme blacklist',
        () => red(checkReturnTargetInvariant, src.mig.replace(
          "      and position(':' in return_target) = 0\n",
          "      and return_target not ilike 'https://%'\n"))],
      ['MU3-20', 'the certification drops the real-credential BLOCKER row',
        () => red(checkCertification, src.cert.replace(/'BLOCKER' from facts f/, "'PASS' from facts f"))],
      ['MU3-21', 'the residue check is hollowed out into a constant PASS',
        () => red(checkResidue, src.res.replace(/where a\.state_hash ~ '[^']*'/g,
          "where false"))],
      ['MU3-22', 'a function ACL GRANT is placed before its REVOKE (the lockout order)',
        () => red(checkFunctionAcl, src.mig
          .replace(CONSUME_REVOKE, '')
          .replace(CONSUME_GRANT, `${CONSUME_GRANT}\n${CONSUME_REVOKE}`))],
    ];

    for (const [id, why, detect] of cases) {
      let detected = false;
      try { detected = detect(); } catch (e) { detected = false; }
      if (!detected) undetected.push(`${id} (${why})`);
    }
    ok('MU3', undetected.length === 0, `CB-003 mutations NOT detected: ${undetected.join('; ')}`);
  }

  function run(vocab, src) {
    checkPresence(src);
    checkScopeOfCreation(src.mig);
    checkColumns(src.mig);
    checkConstraintInventory(src.mig);
    checkExpiryInvariant(src.mig);
    checkStatusDomain(src.mig);
    checkReturnTargetInvariant(src.mig);
    checkForeignKeys(src.mig);
    checkTableAcl(src.mig);
    checkFunctionHardening(src.mig);
    checkFunctionAcl(src.mig);
    checkFunctionSignatures(src.mig);
    checkConsumeSemantics(src.mig);
    checkCreateSemantics(src.mig);
    checkScopeAndAtomicity(src.mig);
    checkCertification(src.cert);
    checkAdversarial(src.adv);
    checkResidue(src.res);
    checkSyntheticDigestKey(src.adv, src.res);
    checkEncodingContract(src.mig, src.cert, src.adv);
    checkStructuralSignatureProof(src.cert, src.mig);
    checkExpirySemanticProof(src.cert);
    checkConstraintIdentityConsistency(src.mig, src.cert, src.adv);

    // The vocabulary must agree with the shipped module — the same drift rule CB-001
    // established, now applied to the attempt table's own allowlists.
    const providers = [...src.mig.matchAll(/check \(provider in \(([^)]*)\)\)/g)]
      .map((m) => (m[1].match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')))[0] || [];
    ok('CB-66a', providers.length === vocab.PROVIDERS.length
      && vocab.PROVIDERS.every((p) => providers.includes(p)),
      `attempt provider vocabulary must equal PROVIDERS: sql=${JSON.stringify(providers)} module=${JSON.stringify(vocab.PROVIDERS)}`);

    const categories = [...src.mig.matchAll(/check \(connection_category in \(([^)]*)\)\)/g)]
      .map((m) => (m[1].match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')))[0] || [];
    ok('CB-66b', categories.length === vocab.CONNECTION_CATEGORIES.length
      && vocab.CONNECTION_CATEGORIES.every((c) => categories.includes(c)),
      `attempt category vocabulary must equal CONNECTION_CATEGORIES: sql=${JSON.stringify(categories)} module=${JSON.stringify(vocab.CONNECTION_CATEGORIES)}`);
  }

  function mutation(vocab, src) {
    mutationCb3(src);
  }

  return { run, mutation };
};