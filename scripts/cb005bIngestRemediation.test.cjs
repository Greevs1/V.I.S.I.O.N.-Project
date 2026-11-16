'use strict';

/**
 * CB-005B — INGEST REMEDIATION REGRESSION TESTS
 * =============================================
 * Executable evidence for the four corrections made before deployment:
 *
 *   1. a batch that contradicts ITSELF (one dedup_key delivered with two payload
 *      hashes) is detected explicitly and refused BEFORE any insert;
 *   2. conflicts are classified against rows already STORED, with no dependence on
 *      a data-modifying CTE seeing its own inserts;
 *   3. identical repeats inside a batch stay idempotent and the
 *      inserted/duplicate counts stay correct;
 *   4. the deployed-posture report's textual assertions survive comments and
 *      formatting — most importantly the Digital Twin freeze check.
 *
 * FOUR KINDS OF CHECK, DELIBERATELY SEPARATED
 *
 *   §1 STATIC       assertions about the migration's SQL text: the ordering of
 *                   classification → refusal → insert → advance, the uniqueness of
 *                   the guard, one insert, and one spelling of each fingerprint.
 *   §2 BEHAVIOURAL  a focused executable model of the corrected classification, run
 *                   over the six delivery shapes that matter. This models the
 *                   SEMANTICS the SQL is written to implement; it is not SQL
 *                   execution and it certifies no deployment.
 *   §3 REPORT       the verification report's predicates, exercised against
 *                   comment-bearing and code-bearing fixtures, so a false failure
 *                   or a false pass is demonstrated rather than asserted.
 *   §4 ANCHORS      the exact strings the shipped harness and its mutation suite
 *                   pin, so this rewrite cannot silently break them.
 *
 * §1/§3/§4 read the shipped files and change nothing. Nothing here writes, deploys
 * or executes SQL.
 *
 * RUN:  node scripts/cb005bIngestRemediation.test.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIGRATION = path.join(ROOT, 'src', 'supabase', 'migrations', 'phase_cb_005b_provider_execution_foundation.sql');
const VERIFICATION = path.join(ROOT, 'src', 'supabase', 'migrations', 'phase_cb_005b_provider_execution_foundation_verification.sql');

const read = (file) => fs.readFileSync(file, 'utf8');
const occurrences = (text, needle) => (needle ? text.split(needle).length - 1 : 0);
const at = (text, needle) => text.indexOf(needle);

/** Comments removed, whitespace collapsed — the transformation the report applies in SQL. */
const stripComments = (sql) => String(sql)
  .replace(/\/\*([^*]|\*[^/])*\*\//g, ' ')
  .replace(/(^|[^-])--[^\n]*/gm, '$1');
const asCode = (sql) => stripComments(sql).replace(/\s+/g, ' ');

/** The body of one deployed function, exactly as the report reads it. */
function deployedBody(migration, name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  if (start === -1) return '';
  const end = migration.indexOf('$$;', start);
  return end === -1 ? '' : migration.slice(start, end + 3);
}

const INGEST = 'provider_sync_observation_ingest';

// ══════════════════════════════════════════════════════════════════════════════
// §1 · STATIC — the migration's own structure
// ══════════════════════════════════════════════════════════════════════════════
function staticChecks(migration) {
  const ingest = asCode(deployedBody(migration, INGEST));
  const storedRead = at(ingest, 'left join public.provider_observations');
  const classify = at(ingest, 'into v_conflicts, v_duplicates');
  const guard = at(ingest, 'if v_conflicts > 0 then');
  const refusal = at(ingest, 'OBSERVATION_CONFLICT');
  const insert = at(ingest, 'insert into public.provider_observations');
  const advance = at(ingest, 'set cursor_version = c.cursor_version + 1');

  const checks = [
    ['R-1 classification reads committed rows, then the refusal, then the insert, then the advance',
      storedRead > -1 && classify > -1 && guard > -1 && refusal > -1 && insert > -1 && advance > -1
        && storedRead < classify && classify < guard && guard < refusal
        && refusal < insert && insert < advance,
      `stored_read@${storedRead} classify@${classify} guard@${guard} refusal@${refusal} insert@${insert} advance@${advance}`],

    ['R-2 exactly one conflict guard exists',
      occurrences(ingest, 'if v_conflicts > 0 then') === 1,
      `found ${occurrences(ingest, 'if v_conflicts > 0 then')}`],

    ['R-3 exactly one OBSERVATION_CONFLICT token exists',
      occurrences(ingest, 'OBSERVATION_CONFLICT') === 1,
      `found ${occurrences(ingest, 'OBSERVATION_CONFLICT')}`],

    ['R-4 the within-batch contradiction is detected explicitly',
      ingest.includes('(count(distinct payload_hash) > 1) as contradicts_itself')
        && ingest.includes('filter (where contradicts_itself)'),
      'the explicit predicate "(count(distinct payload_hash) > 1) as contradicts_itself" must be present and used by the refusal count'],

    ['R-5 the conflict/duplicate counts read committed rows, before the insert',
      occurrences(ingest, 'left join public.provider_observations') === 1
        && at(ingest, 'stored_hash = first_hash') > -1
        && at(ingest, 'stored_hash = first_hash') < insert
        && at(ingest, 'stored_hash <> first_hash') < insert
        && classify < insert,
      `left_join=${occurrences(ingest, 'left join public.provider_observations')} dup@${at(ingest, 'stored_hash = first_hash')} con@${at(ingest, 'stored_hash <> first_hash')} insert@${insert}`],

    ['R-6 the classification statement completes before the insert begins',
      ingest.includes('from key_state;') && at(ingest, 'from key_state;') < insert,
      `from_key_state@${at(ingest, 'from key_state;')} insert@${insert}`],

    ['R-7 the canonical key material is spelled once (no two-spelling drift)',
      occurrences(ingest, "v_job.business_id::text || '|' || v_job.provider") === 1,
      `found ${occurrences(ingest, "v_job.business_id::text || '|' || v_job.provider")}`],

    ['R-8 the payload hash is computed once per element and reused by the insert',
      occurrences(ingest, "encode(sha256(convert_to((v_elem->'payload')::text, 'utf8')), 'hex')") === 1
        && ingest.includes("e.elem->'payload', e.hash, e.key"),
      `hash_spellings=${occurrences(ingest, "encode(sha256(convert_to((v_elem->'payload')::text, 'utf8')), 'hex')")} insert_reuses_hash=${ingest.includes("e.elem->'payload', e.hash, e.key")}`],

    ['R-9 the insert writes one row per absent key and carries NO on-conflict clause (a race raises, never discards)',
      ingest.includes('distinct on (e.key)') && ingest.includes('if v_absent_keys > 0 then')
        && occurrences(ingest, 'on conflict (dedup_key)') === 0
        && ingest.includes('where not exists ('),
      `distinct_on=${ingest.includes('distinct on (e.key)')} guarded=${ingest.includes('if v_absent_keys > 0 then')} on_conflict_dedup=${occurrences(ingest, 'on conflict (dedup_key)')}`],

    ['R-11 every writer of a key is serialized across jobs, in lock-id order, before classifying',
      ingest.includes("select distinct hashtextextended('cb005b:provider_observations:dedup_key:' || k, 0) from unnest(v_keys) as k order by 1 loop perform pg_advisory_xact_lock(v_lock_key); end loop;")
        && at(ingest, 'pg_advisory_xact_lock(v_lock_key)') < storedRead,
      `lock@${at(ingest, 'pg_advisory_xact_lock(v_lock_key)')} stored_read@${storedRead}`],

    ['R-12 the receipt counts DELIVERIES and reconciles with the store before the advance',
      ingest.includes('coalesce(sum(delivered_count), 0)::int into v_conflicts, v_duplicates, v_absent_keys, v_delivered_count')
        && ingest.includes('if v_inserted <> v_absent_keys or v_delivered_count <> v_count or v_inserted + v_duplicates + v_conflicts <> v_delivered_count then')
        && at(ingest, 'OBSERVATION_RACE') > insert && at(ingest, 'OBSERVATION_RACE') < advance,
      `race@${at(ingest, 'OBSERVATION_RACE')} insert@${insert} advance@${advance}`],

    ['R-10 the receipt exposes delivered / inserted / duplicates / conflicts',
      ["'delivered', v_delivered_count", "'inserted', v_inserted", "'duplicates', v_duplicates", "'conflicts', v_conflicts"]
        .every((field) => ingest.includes(field)),
      'all four accounting fields must be present'],
  ];

  return { name: '§1 static — migration text', checks };
}

// ══════════════════════════════════════════════════════════════════════════════
// §2 · BEHAVIOURAL — the corrected classification, executably
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The classification, mirroring the deployed statement: counts are derived from the
 * delivered elements plus COMMITTED rows. The insert then writes one row per absent
 * key, first delivery winning.
 */
function classify({ delivered, committed }) {
  const keys = new Map();
  delivered.forEach((d) => {
    const entry = keys.get(d.dedup_key) || { first_hash: d.payload_hash, delivered_count: 0, hashes: new Set() };
    entry.delivered_count += 1;
    entry.hashes.add(d.payload_hash);
    keys.set(d.dedup_key, entry);
  });

  let conflicts = 0;
  let duplicates = 0;
  let absent = 0;
  const plan = [];

  keys.forEach((entry, key) => {
    if (entry.hashes.size > 1) {
      // contradicts another delivery of the same key in this batch
      conflicts += entry.delivered_count - 1;
      return;
    }
    const stored = committed.get(key);
    if (!stored) {
      absent += 1;
      duplicates += entry.delivered_count - 1; // repeats of a key that is new
      plan.push({ dedup_key: key, payload_hash: entry.first_hash });
      return;
    }
    if (stored.payload_hash === entry.first_hash) {
      duplicates += entry.delivered_count; // identical re-delivery of a stored row
      return;
    }
    conflicts += entry.delivered_count; // contradiction against the store
  });

  return { conflicts, duplicates, absent, delivered: delivered.length, plan, refused: conflicts > 0 };
}

/** The unit in its corrected order: classify → refuse → insert → advance. */
function runIngestUnit({ delivered, committed, cursorVersion, expectedVersion, advanceTo }) {
  const verdict = classify({ delivered, committed });
  const written = [];
  let version = cursorVersion;

  if (verdict.refused) {
    return { verdict, written, version, refused: true, code: 'OBSERVATION_CONFLICT' };
  }
  verdict.plan.forEach((p) => written.push(p));
  if (advanceTo !== undefined && advanceTo !== null) {
    if (version !== expectedVersion) {
      return { verdict, written, version, refused: true, code: 'CHECKPOINT_STALE' };
    }
    version += 1;
  }
  return { verdict, written, version, refused: false };
}

const delivery = (key, hash) => ({ dedup_key: key, payload_hash: hash });

function behaviouralChecks() {
  const K = 'key-1';
  const checks = [];

  // B1 · identical repeat inside one batch
  {
    const unit = runIngestUnit({
      delivered: [delivery(K, 'H1'), delivery(K, 'H1')],
      committed: new Map(), cursorVersion: 0, expectedVersion: 0, advanceTo: 100,
    });
    checks.push(['B-1 an identical repeat inside a batch inserts one row and counts one duplicate',
      !unit.refused && unit.written.length === 1 && unit.verdict.absent === 1
        && unit.verdict.duplicates === 1 && unit.verdict.delivered === 2
        && unit.verdict.conflicts === 0 && unit.version === 1,
      `written=${unit.written.length} absent=${unit.verdict.absent} duplicates=${unit.verdict.duplicates} conflicts=${unit.verdict.conflicts}`]);
  }

  // B2 · a batch that contradicts itself
  {
    const unit = runIngestUnit({
      delivered: [delivery(K, 'H1'), delivery(K, 'H2')],
      committed: new Map(), cursorVersion: 0, expectedVersion: 0, advanceTo: 100,
    });
    checks.push(['B-2 a batch whose deliveries disagree is refused, with nothing written and the cursor still',
      unit.refused && unit.code === 'OBSERVATION_CONFLICT'
        && unit.written.length === 0 && unit.version === 0
        && unit.verdict.conflicts === 1,
      `refused=${unit.refused} code=${unit.code} written=${unit.written.length} cursor=${unit.version}`]);

    // B2b · the refusal — not the absence of work — is what protected the store: a
    // naive insert (ON CONFLICT DO NOTHING) would have stored the FIRST delivery and
    // dropped the second in silence.
    const naiveWouldWrite = new Set([delivery(K, 'H1'), delivery(K, 'H2')].map((d) => d.dedup_key)).size;
    checks.push(['B-2b the refused unit had work a naive insert would have written',
      naiveWouldWrite === 1 && unit.written.length === 0 && unit.verdict.delivered === 2,
      `naive_would_write=${naiveWouldWrite} written=${unit.written.length} delivered=${unit.verdict.delivered}`]);
  }

  // B3 · contradiction against an already stored row
  {
    const unit = runIngestUnit({
      delivered: [delivery(K, 'H2')],
      committed: new Map([[K, { payload_hash: 'H1' }]]),
      cursorVersion: 3, expectedVersion: 3, advanceTo: 200,
    });
    checks.push(['B-3 a payload that contradicts a STORED one is refused before the insert',
      unit.refused && unit.code === 'OBSERVATION_CONFLICT'
        && unit.written.length === 0 && unit.version === 3 && unit.verdict.conflicts === 1,
      `refused=${unit.refused} written=${unit.written.length} cursor=${unit.version}`]);
  }

  // B4 · idempotent re-delivery of a stored row
  {
    const unit = runIngestUnit({
      delivered: [delivery(K, 'H1'), delivery(K, 'H1')],
      committed: new Map([[K, { payload_hash: 'H1' }]]),
      cursorVersion: 1, expectedVersion: 1, advanceTo: 200,
    });
    checks.push(['B-4 re-delivering stored rows inserts nothing and counts every delivery as a duplicate',
      !unit.refused && unit.written.length === 0 && unit.verdict.absent === 0
        && unit.verdict.duplicates === 2 && unit.verdict.delivered === 2 && unit.version === 2,
      `written=${unit.written.length} duplicates=${unit.verdict.duplicates} cursor=${unit.version}`]);
  }

  // B5 · two distinct new keys
  {
    const unit = runIngestUnit({
      delivered: [delivery('k-a', 'H1'), delivery('k-b', 'H1')],
      committed: new Map(), cursorVersion: 0, expectedVersion: 0, advanceTo: 100,
    });
    checks.push(['B-5 two distinct new keys insert two rows with no duplicates',
      !unit.refused && unit.written.length === 2 && unit.verdict.duplicates === 0 && unit.verdict.conflicts === 0,
      `written=${unit.written.length} duplicates=${unit.verdict.duplicates}`]);
  }

  // B6 · a genuine version change is a new key, not a duplicate
  {
    const unit = runIngestUnit({
      delivered: [delivery('key-v2', 'H2')],
      committed: new Map([['key-v1', { payload_hash: 'H1' }]]),
      cursorVersion: 0, expectedVersion: 0, advanceTo: 100,
    });
    checks.push(['B-6 a new source version is inserted as a new observation, never collapsed',
      !unit.refused && unit.written.length === 1 && unit.verdict.duplicates === 0 && unit.verdict.conflicts === 0,
      `written=${unit.written.length} duplicates=${unit.verdict.duplicates}`]);
  }

  // B7 · a three-way batch: two identical plus one contradiction
  {
    const unit = runIngestUnit({
      delivered: [delivery(K, 'H1'), delivery(K, 'H1'), delivery(K, 'H2')],
      committed: new Map(), cursorVersion: 0, expectedVersion: 0, advanceTo: 100,
    });
    checks.push(['B-7 a three-way batch with one contradiction is refused whole',
      unit.refused && unit.verdict.conflicts === 2 && unit.written.length === 0 && unit.version === 0,
      `conflicts=${unit.verdict.conflicts} written=${unit.written.length} cursor=${unit.version}`]);
  }

  // B8 · the accounting reconciles in every accepted unit
  {
    const shapes = [
      { delivered: [delivery(K, 'H1'), delivery(K, 'H1')], committed: new Map() },
      { delivered: [delivery(K, 'H1'), delivery(K, 'H1')], committed: new Map([[K, { payload_hash: 'H1' }]]) },
      { delivered: [delivery('a', 'H1'), delivery('b', 'H2')], committed: new Map() },
      { delivered: [delivery('a', 'H1')], committed: new Map([['b', { payload_hash: 'H9' }]]) },
    ];
    const unbalanced = shapes
      .map((shape) => classify(shape))
      .filter((v) => !v.refused && v.delivered !== v.plan.length + v.duplicates + v.conflicts);
    checks.push(['B-8 delivered = inserted + duplicates + conflicts in every accepted unit',
      unbalanced.length === 0,
      `unbalanced: ${JSON.stringify(unbalanced)}`]);
  }

  return { name: '§2 behavioural — classification semantics', checks };
}

// ══════════════════════════════════════════════════════════════════════════════
// §3 · REPORT — the verification report's predicates, exercised
// ══════════════════════════════════════════════════════════════════════════════

const RAW_SINGLE_INSERT = (def) => occurrences(def, 'insert into public.provider_observations') === 1
  && !def.includes('update public.provider_observations');

const CODE_SINGLE_INSERT = (def) => {
  const code = asCode(def);
  return occurrences(code, 'insert into public.provider_observations') === 1
    && !code.includes('update public.provider_observations')
    && !code.includes('delete from public.provider_observations');
};

const RAW_FROZEN_ABSENT = (def) => !/business_fact/i.test(def);
const CODE_FROZEN_ABSENT = (def) => !/business_fact|dashboard_metric/i.test(asCode(def));

const OLD_NETWORK_ABSENT = (def) => !/vault|dblink|pg_net/i.test(def);
const CODE_NETWORK_ABSENT = (def) => !/\b(vault|create_secret|decrypted_secrets|dblink|pg_net|net|http)\b/i.test(asCode(def));

const REFUSAL_BEFORE_INSERT = (def) => {
  const code = asCode(def);
  const refusal = at(code, 'OBSERVATION_CONFLICT');
  const insert = at(code, 'insert into public.provider_observations');
  return refusal > -1 && insert > -1 && refusal < insert;
};

const FIXTURE_PROSE_ONLY = `create or replace function public.f_prose() returns void language plpgsql as $$
begin
  -- This unit must never touch public.business_facts, business_fact_evidence or
  -- dashboard_metrics, and it performs no vault access, no dblink, no net.http_post.
  perform 1;
end;
$$;`;

const FIXTURE_COMMENT_HAZARDS = `create or replace function public.f_hazard() returns void language plpgsql as $$
begin
  -- The only write here is one insert into public.provider_observations — never an
  -- update public.provider_observations and never a delete from public.provider_observations.
  insert into public.provider_observations (dedup_key) values ('k');
end;
$$;`;

const FIXTURE_WRAPPED_INSERT = `create or replace function public.f_wrapped() returns void language plpgsql as $$
begin
  insert into
    public.provider_observations (dedup_key)
  values ('k');
end;
$$;`;

const FIXTURE_TWO_INSERTS = `create or replace function public.f_two() returns void language plpgsql as $$
begin
  insert into public.provider_observations (dedup_key) values ('k');
  insert into public.provider_observations (dedup_key) values ('k2');
end;
$$;`;

const FIXTURE_TWIN_WRITE = `create or replace function public.f_twin() returns void language plpgsql as $$
begin
  insert into public.business_facts (fact_key) values ('revenue');
end;
$$;`;

const FIXTURE_NETWORK_CALL = `create or replace function public.f_net() returns void language plpgsql as $$
begin
  perform net.http_post('https://example.test/hook');
end;
$$;`;

const FIXTURE_REFUSAL_EARLY = `create or replace function public.f_early() returns void language plpgsql as $$
begin
  if v_conflicts > 0 then
    raise exception 'OBSERVATION_CONFLICT';
  end if;
  insert into public.provider_observations (dedup_key) values ('k');
end;
$$;`;

const FIXTURE_REFUSAL_LATE = `create or replace function public.f_late() returns void language plpgsql as $$
begin
  insert into public.provider_observations (dedup_key) values ('k');
  if v_conflicts > 0 then
    raise exception 'OBSERVATION_CONFLICT';
  end if;
end;
$$;`;

/**
 * The AU predicate, transcribed from the shipped report: the constraint definition must
 * name the lease expiry, the attempt's start, and the attempt BUDGET column — and must
 * name neither the claim instant (a duration measured from whenever the attempt was
 * claimed) nor the requested lease seconds (a duration cap that any long request
 * satisfies). A bound stated either of those ways is satisfied by a lease that outlives
 * the attempt, which is the defect the row exists to catch.
 */
const AU_PREDICATE = (def) => !!def
  && def.includes('lease_expires_at')
  && def.includes('attempt_started_at')
  && def.includes('max_attempt_seconds')
  && !def.includes('claimed_at')
  && !def.includes('p_lease_seconds');

/**
 * The AZ predicate, transcribed: the mutation boundary must carry a live wall-clock
 * CONDITION ahead of the statement that writes evidence. The refusal MESSAGE alone is
 * not enough — a guard disabled with `if false then` leaves every message in place.
 */
const AZ_PREDICATE = (code) => {
  const cond = 'if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then';
  const write = code.indexOf('insert into public.provider_observations');
  const at = code.indexOf(cond);
  return code.includes(cond) && code.includes('while the unit waited for its keys')
    && at > -1 && write > -1 && at < write;
};

function reportPredicateChecks(verificationText) {
  const checks = [
    ['S-1 a comment naming the insert no longer fails the single-insert check',
      RAW_SINGLE_INSERT(FIXTURE_COMMENT_HAZARDS) === false && CODE_SINGLE_INSERT(FIXTURE_COMMENT_HAZARDS) === true,
      `raw=${RAW_SINGLE_INSERT(FIXTURE_COMMENT_HAZARDS)} stripped=${CODE_SINGLE_INSERT(FIXTURE_COMMENT_HAZARDS)}`],

    ['S-2 a comment naming a frozen table no longer fails the freeze check',
      RAW_FROZEN_ABSENT(FIXTURE_PROSE_ONLY) === false && CODE_FROZEN_ABSENT(FIXTURE_PROSE_ONLY) === true,
      `raw=${RAW_FROZEN_ABSENT(FIXTURE_PROSE_ONLY)} stripped=${CODE_FROZEN_ABSENT(FIXTURE_PROSE_ONLY)}`],

    ['S-3 a comment naming Vault or the network no longer fails the boundary check',
      OLD_NETWORK_ABSENT(FIXTURE_PROSE_ONLY) === false && CODE_NETWORK_ABSENT(FIXTURE_PROSE_ONLY) === true,
      `raw=${OLD_NETWORK_ABSENT(FIXTURE_PROSE_ONLY)} stripped=${CODE_NETWORK_ABSENT(FIXTURE_PROSE_ONLY)}`],

    ['S-4 a wrapped insert is still counted exactly once',
      occurrences(FIXTURE_WRAPPED_INSERT, 'insert into public.provider_observations') === 0
        && CODE_SINGLE_INSERT(FIXTURE_WRAPPED_INSERT) === true,
      'uncollapsed text would report zero inserts; collapsed text reports one'],

    ['S-5 a genuine second insert is still caught',
      CODE_SINGLE_INSERT(FIXTURE_TWO_INSERTS) === false,
      'stripping must not hide a real violation'],

    ['S-6 a real write to a frozen table is still caught',
      CODE_FROZEN_ABSENT(FIXTURE_TWIN_WRITE) === false,
      'stripping must not hide a real write'],

    ['S-7 the pg_net call surface is caught where the old pattern missed it',
      OLD_NETWORK_ABSENT(FIXTURE_NETWORK_CALL) === true && CODE_NETWORK_ABSENT(FIXTURE_NETWORK_CALL) === false,
      `old_pattern_passed_it=${OLD_NETWORK_ABSENT(FIXTURE_NETWORK_CALL)} new_pattern_fails_it=${!CODE_NETWORK_ABSENT(FIXTURE_NETWORK_CALL)}`],

    ['S-8 the ordering predicate holds early and fails late',
      REFUSAL_BEFORE_INSERT(FIXTURE_REFUSAL_EARLY) === true && REFUSAL_BEFORE_INSERT(FIXTURE_REFUSAL_LATE) === false,
      `early=${REFUSAL_BEFORE_INSERT(FIXTURE_REFUSAL_EARLY)} late=${REFUSAL_BEFORE_INSERT(FIXTURE_REFUSAL_LATE)}`],

    ['S-9 the shipped report asserts on comment-stripped code only',
      verificationText.includes('as def_code') && !/f\.def(?!_code)/.test(verificationText),
      'every textual assertion must read def_code; no assertion may read the raw definition'],

    ['S-10 the shipped report states the row count it actually produces',
      verificationText.includes('EXPECT 61 rows')
        && (verificationText.match(/\bselect '([A-Z]{1,2})'/g) || []).length === 61,
      `rows=${(verificationText.match(/\bselect '([A-Z]{1,2})'/g) || []).length}`],

    // The two DEADLINE rows the report gained (AU, AZ) assert on the constraint
    // definition and on the ingest's boundary guard. Neither can be executed here — no
    // PostgreSQL — so their predicates are transcribed and exercised on fixtures: a row
    // whose predicate passes on the defect it exists to catch is worse than no row.
    ['S-11 the AU predicate separates an ABSOLUTE-deadline bound from a DURATION cap',
      AU_PREDICATE("CHECK ((status <> 'claimed'::text) OR (EXTRACT(epoch FROM (lease_expires_at - attempt_started_at)) <= (max_attempt_seconds)::numeric))") === true
        && AU_PREDICATE("CHECK ((status <> 'claimed'::text) OR (EXTRACT(epoch FROM (lease_expires_at - claimed_at)) <= 900))") === false
        && AU_PREDICATE("CHECK ((status <> 'claimed'::text) OR (lease_expires_at <= claimed_at + make_interval(secs => max_attempt_seconds)))") === false
        && AU_PREDICATE("CHECK ((status <> 'claimed'::text) OR (EXTRACT(epoch FROM (lease_expires_at - attempt_started_at)) <= 900))") === false
        && verificationText.includes("f.lease_within_attempt_def not like '%claimed_at%'") === true,
      'a duration-relative bound — claimed_at + n, or a literal — is satisfied by every late start, so the row that exists to catch it must FAIL on it'],

    ['S-12 the AZ predicate requires a LIVE boundary condition, not the refusal message',
      AZ_PREDICATE("if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then raise exception 'while the unit waited for its keys'; end if; insert into public.provider_observations") === true
        && AZ_PREDICATE("if false then raise exception 'while the unit waited for its keys'; end if; insert into public.provider_observations") === false
        && AZ_PREDICATE("insert into public.provider_observations; if clock_timestamp() >= v_job.attempt_started_at + make_interval(secs => v_job.max_attempt_seconds) then raise exception 'while the unit waited for its keys'; end if") === false
        && verificationText.includes("f.def_code like '%if clock_timestamp() >= v_job.attempt_started_at") === true,
      'a disabled guard leaves its refusal message behind, and a guard read after the write is no guard — only the CONDITION, ordered, distinguishes a live re-read'],
  ];

  return { name: '§3 report — predicate behaviour', checks };
}

// ══════════════════════════════════════════════════════════════════════════════
// §4 · ANCHORS — what the shipped harness and its mutation suite pin
// ══════════════════════════════════════════════════════════════════════════════
function anchorChecks(migration) {
  const anchors = [
    ['A-1 the per-key lock the mutation suite removes', '    perform pg_advisory_xact_lock(v_lock_key);'],
    ['A-1b the insert tail the mutation suite re-adds DO NOTHING into', '       order by e.key, e.ord\n      returning id, dedup_key'],
    ['A-1c the lock ordering the mutation suite removes', '      from unnest(v_keys) as k\n     order by 1\n  loop'],
    ['A-1d the reconciliation the mutation suite disables', '  if v_inserted <> v_absent_keys\n'],
    ['A-1e the delivery count the mutation suite reverts', '    coalesce(sum(delivered_count), 0)::int\n    into v_conflicts'],
    ['A-2 the refusal block the mutation suite relocates',
      "  if v_conflicts > 0 then\n    raise exception 'provider_sync_observation_ingest: OBSERVATION_CONFLICT (% delivered observation(s) carry a different payload for a dedup_key that is already stored; the stored evidence is immutable, so the batch is refused rather than silently skipped)', v_conflicts\n      using errcode = 'P0001';\n  end if;\n\n  "],
    ['A-3 the receipt opening the mutation suite disables',
      "  return jsonb_build_object(\n    'job_id', v_job.id,"],
    ['A-4 the credential comment the mutation suite re-orders',
      '  -- The credential that actually produced this evidence: the CURRENT active'],
    ['A-5 the payload bound the mutation suite removes',
      "if length((v_elem->'payload')::text) > 16384 then"],
    ['A-6 the checkpoint CAS the mutation suite removes', 'and c.cursor_version = v_expected;'],
    ['A-7 the monotonic guard the mutation suite disables',
      'if v_cp.cursor_ordinal is not null and not (v_ordinal > v_cp.cursor_ordinal) then'],
    ['A-8 the advance the ordering check brackets', 'set cursor_version = c.cursor_version + 1'],
    ['A-9 the receipt marker the mutation suite inserts before', '  -- ── 7 · the receipt '],
    ['A-10 the batch bound the atomicity check reads', 'jsonb_array_length(p_observations)'],
    ['A-11 the count bound the atomicity check reads', 'v_count > 500'],
    ['A-12 the byte bound the atomicity check reads', 'length(p_observations::text) > 2097152'],
    ['A-13 the row lock the fence check reads', 'for update;'],
    ['A-14 the opaque-cursor requirement the atomicity check reads',
      'expected_version is REQUIRED for a checkpoint advance'],
    ['A-15 the monotonic refusal the atomicity check reads', 'CHECKPOINT_NOT_MONOTONIC'],
    ['A-18 the JOB key the retention mutation re-cascades',
      'references public.provider_sync_jobs (id, business_id) on delete restrict,'],
    ['A-19 the CONNECTION key the retention mutation re-cascades',
      'references public.business_connections (id, business_id) on delete restrict,'],
    ['A-20 the CREDENTIAL key the retention mutation re-cascades',
      'references public.provider_credentials (id, business_id) on delete set null (credential_id),'],
    ['A-21 the checkpoint rule the retention check reads as INTENTIONAL',
      'references public.provider_sync_jobs (id, business_id) on delete cascade,'],
    ['A-22 the retention rule the deployment reads from the catalogue, asserted on the artifact',
      '  -- ── EVIDENCE RETENTION: RESTRICT here, never CASCADE ─'],
    ['A-23 the post-lock LEASE re-read the mutation suite disables, and the row it re-reads',
      'if v_now >= v_job.lease_expires_at then'],
    ['A-24 the claim the boundary re-asserts from the row, not from the entry fence',
      'where j.id = p_job_id;'],
  ];

  // An anchor counts as present if it survives EITHER reading: the raw bytes (where
  // a comment anchor must live) or the comment-stripped, whitespace-collapsed text
  // (where alignment spaces — `set cursor_version      = ...` — are normalised, which
  // is exactly how the harness and the report read it).
  const flat = asCode(migration);
  const checks = anchors.map(([label, needle]) => [
    label,
    migration.includes(needle) || flat.includes(needle),
    `missing in both raw and collapsed text: ${JSON.stringify(needle.slice(0, 70))}`,
  ]);

  checks.push(['A-16 the ingest contains no exception handler',
    !/exception\s+when/i.test(deployedBody(migration, INGEST)),
    'a swallowed error would commit part of a batch']);
  checks.push(['A-17 the ingest accepts no caller-supplied business or provider',
    !/p_business_id/.test(deployedBody(migration, INGEST)) && !/p_provider\s+(text|:=)/.test(deployedBody(migration, INGEST)),
    'the row remains the only authority']);

  return { name: '§4 anchors — harness and mutation suite', checks };
}

// ══════════════════════════════════════════════════════════════════════════════
// §5 · RETENTION — no upstream deletion may remove observation evidence
// ══════════════════════════════════════════════════════════════════════════════
// A CASCADE into provider_observations is an invisible deletion: it removes evidence
// nobody asked to remove, from a record the operator was never looking at. The rules
// are asserted as a MATRIX, not as "no cascade anywhere" — the checkpoint's cascade is
// intentional, and a sweep that flattened it would pass a weaker design.
function retentionChecks(migration, verification) {
  const tableBody = (name) => {
    const hit = migration.match(new RegExp(`create table if not exists public\\.${name} \\(([\\s\\S]*?)\\n\\);`));
    return hit ? hit[1] : '';
  };
  const rule = (block, name) => {
    const hit = block.match(new RegExp(`constraint ${name}\\s+foreign key \\([^)]*\\)\\s+references public\\.[a-z_]+ \\([^)]*\\)\\s+on delete ([a-z ]+?(?:\\([^)]*\\))?),`));
    return hit ? hit[1].trim() : null;
  };

  const obs = tableBody('provider_observations');
  const cp = tableBody('provider_sync_checkpoints');
  const jobs = tableBody('provider_sync_jobs');
  const fkNames = (obs.match(/constraint ([a-z_]+)\s+foreign key/g) || []).map((s) => s.split(/\s+/)[1]);

  const checks = [
    ['T-1 all four observation keys are accounted for — no unlisted key can reintroduce a cascade',
      fkNames.slice().sort().join(',') === [
        'provider_observations_connection_same_business_fkey',
        'provider_observations_credential_same_business_fkey',
        'provider_observations_job_same_business_fkey',
        'provider_observations_job_same_connection_fkey',
      ].sort().join(','),
      `keys=${JSON.stringify(fkNames)}`],

    ['T-2 the two keys into the JOB are RESTRICT (deleting a job cannot remove evidence)',
      rule(obs, 'provider_observations_job_same_business_fkey') === 'restrict'
        && rule(obs, 'provider_observations_job_same_connection_fkey') === 'restrict'
        && !/on delete cascade/.test(obs),
      `job_business=${rule(obs, 'provider_observations_job_same_business_fkey')} job_connection=${rule(obs, 'provider_observations_job_same_connection_fkey')} cascades=${(obs.match(/on delete cascade/g) || []).length}`],

    ['T-3 the key into the CONNECTION is RESTRICT (disconnect is a status, never a deletion)',
      rule(obs, 'provider_observations_connection_same_business_fkey') === 'restrict',
      `connection=${rule(obs, 'provider_observations_connection_same_business_fkey')}`],

    ['T-4 the key into the CREDENTIAL is SET NULL, so evidence survives with a null attribution',
      rule(obs, 'provider_observations_credential_same_business_fkey') === 'set null (credential_id)',
      `credential=${rule(obs, 'provider_observations_credential_same_business_fkey')}`],

    ['T-5 the tenancy SHAPE is untouched — every observation key is still (id, business_id)-scoped',
      /foreign key \(job_id, business_id\)/.test(obs)
        && /foreign key \(job_id, business_connection_id\)/.test(obs)
        && /foreign key \(business_connection_id, business_id\)/.test(obs)
        && /foreign key \(credential_id, business_id\)/.test(obs),
      'RESTRICT refuses a deletion; it must never have been bought by relaxing same-business integrity'],

    ['T-6 the checkpoint keys stay CASCADE, deliberately (a position is not evidence)',
      rule(cp, 'provider_sync_checkpoints_job_same_business_fkey') === 'cascade'
        && rule(cp, 'provider_sync_checkpoints_job_same_connection_fkey') === 'cascade',
      `checkpoint=${rule(cp, 'provider_sync_checkpoints_job_same_business_fkey')}`],

    ['T-7 the job keys stay CASCADE, so the evidence boundary is what stops the cascade',
      rule(jobs, 'provider_sync_jobs_connection_same_business_fkey') === 'cascade'
        && rule(jobs, 'provider_sync_jobs_credential_same_business_fkey') === 'cascade',
      `job_connection=${rule(jobs, 'provider_sync_jobs_connection_same_business_fkey')} job_credential=${rule(jobs, 'provider_sync_jobs_credential_same_business_fkey')}`],

    ['T-8 the retention doctrine is documented in the migration itself',
      /EVIDENCE RETENTION/.test(migration)
        && /OUTRANKS/.test(migration)
        && /DELETION: ONE MATRIX, ONE RULE/.test(migration),
      'the rule must be readable where it is enforced, not only in a report'],

    ['T-9 the report certifies the deployed rules from the catalogue, never from the text',
      /confdeltype/.test(verification)
        && /from pg_constraint/.test(verification)
        && /public\.provider_sync_jobs'::regclass/.test(verification),
      'a rule is a property of the constraint the server stored, not of the text that asked for it'],

    ['T-10 every retention row asserts an FK COUNT, so an empty set cannot pass vacuously',
      ['f.observation_job_fk_count = 2 and f.observation_job_fk_restrict_count = 2',
        'f.observation_connection_fk_restrict = 1',
        'f.observation_credential_fk_set_null = 1',
        'f.observation_cascading_fks = 0',
        'f.checkpoint_job_fk_count = 2 and f.checkpoint_job_fk_cascade_count = 2',
        'f.job_orchestration_cascade_count = 2'].every((s) => verification.includes(s)),
      'bool_and over zero rows is TRUE — a rule check with no count guard is the false green this suite exists to catch'],
  ];

  return { name: '§5 retention — the deletion matrix', checks };
}

// ══════════════════════════════════════════════════════════════════════════════
// RUNNER
// ══════════════════════════════════════════════════════════════════════════════
function run() {
  const migration = read(MIGRATION);
  const verification = read(VERIFICATION);

  const groups = [
    staticChecks(migration),
    behaviouralChecks(),
    reportPredicateChecks(verification),
    retentionChecks(migration, verification),
    anchorChecks(migration),
  ];

  const failures = [];
  const lines = ['CB-005B INGEST REMEDIATION — REGRESSION RUN', '─'.repeat(64)];

  groups.forEach((group) => {
    const failed = group.checks.filter((check) => !check[1]);
    lines.push(`${group.name}: ${group.checks.length - failed.length}/${group.checks.length} PASS`);
    group.checks.forEach(([label, ok, detail]) => {
      lines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  — ${detail}`}`);
    });
    failed.forEach(([label, , detail]) => failures.push(`${label} — ${detail}`));
  });

  const total = groups.reduce((n, group) => n + group.checks.length, 0);
  lines.push('─'.repeat(64));
  lines.push(`TOTAL ${total - failures.length}/${total} PASS`);

  const report = lines.join('\n');
  if (require.main === module) console.log(report);

  return {
    ok: failures.length === 0,
    total,
    passed: total - failures.length,
    failed: failures.length,
    failures,
    groups: groups.map((group) => ({ name: group.name, checks: group.checks.length })),
    report,
  };
}

module.exports = { run, classify, runIngestUnit, staticChecks, behaviouralChecks, reportPredicateChecks, retentionChecks, anchorChecks };