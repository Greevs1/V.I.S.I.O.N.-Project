'use strict';

/**
 * CB-005B — REAL POSTGRESQL CONCURRENCY TESTS for provider_sync_observation_ingest
 * ===============================================================================
 * Two genuinely concurrent sessions against a real server. This is the ONLY test in
 * the repository that exercises the per-key advisory lock as behaviour rather than
 * as text; every other check is structural or runs an in-process model.
 *
 * SCRATCH DATABASES ONLY. Observations are immutable and append-only, so the rows
 * this test commits can never be removed. It refuses to run unless:
 *   CB005B_SCRATCH_DATABASE_URL   a disposable database with the CB-001 … CB-005B
 *                                 migration chain applied, connected as its owner
 *   CB005B_SCRATCH_CONFIRM=disposable
 *   CB005B_BUSINESS_ID, CB005B_CONNECTION_ID, CB005B_CREDENTIAL_ID
 *                                 an ACTIVE connection + credential in that database
 *   CB005B_PROVIDER               default 'quickbooks'
 *   CB005B_OPERATIONS             two pull operations, default 'transactions.read,accounts.read'
 *   CB005B_OPERATION_CAP          budget-probe operation, default 'balances.read'
 *   CB005B_OPERATION_DEADLINE     expiry-probe operation, default 'sync.start'
 *                                 (both must differ from CB005B_OPERATIONS: the
 *                                 one-live-job-per-scope index makes enqueueing an
 *                                 operation that is already live return THAT job)
 *
 * Without them it reports UNVERIFIED (exit 2) — never PASS.
 *
 * SCENARIOS (each on two DIFFERENT jobs sharing one connection, so the job-row lock
 * cannot be what serializes them):
 *   C-1  conflicting payload: B blocks on the advisory lock, A commits, B is refused
 *        OBSERVATION_CONFLICT, exactly one row with A's payload remains
 *   C-2  identical payload: B blocks, A commits, B's receipt is 0 inserted / 1 duplicate
 *   C-3  first writer rolls back: B blocks, A rolls back, B inserts its own payload
 *   C-4  overlapping key sets in opposite delivery order: no deadlock, B reconciles
 *   C-5  every receipt returned satisfies delivered = inserted + duplicates + conflicts
 *   C-6  the DEPLOYED delete rules, read PER CONSTRAINT from pg_constraint — each key named,
 *        with its target table and its deleting action: both keys into the job RESTRICT, the
 *        key into the connection RESTRICT, the key into the credential SET NULL (with the
 *        column named in the constraint's own definition), no key on provider_observations
 *        cascading — while both checkpoint keys into the job stay CASCADE. The grouped
 *        (child, rule) shape is asserted SEPARATELY, as the summary it is: four observation
 *        keys collapse to two grouped rows whether the table carries four keys or forty, so
 *        a grouped count can never stand in for the matrix
 *   C-7  deleting the job, the connection or the credential is REFUSED while evidence
 *        exists, and the delivered evidence count is unchanged afterwards
 *   C-8  the claim CAPS a 900-second lease request at the attempt's own budget (a live
 *        server, with a 30-second attempt: the grant that comes back is 30 seconds)
 *   C-9  renewal inside the budget succeeds and stays capped at it; renewal AT or after
 *        the deadline returns FALSE and changes nothing
 *   C-10 an attempt past its absolute deadline is refused by authorize (its own
 *        claim_state, before the lease), by complete (its own verdict) and by the
 *        ingest (raising, with the evidence count unchanged) — and is still RECOVERABLE
 *        afterwards, with a new attempt id, by a later claim
 *   C-11 the DEPLOYED constraint refuses a lease that reaches beyond the attempt's
 *        absolute deadline even when that lease is well inside 900 seconds of the claim
 *        instant — the one probe that separates an absolute-deadline bound from a
 *        duration cap — and accepts a lease inside the budget
 *
 * THE LOCK, THE LOSS AND THE RACE (C-12 … C-14). C-1 … C-5 exercise the per-key
 * advisory lock; these three exercise the JOB row lock and the claim itself.
 *   C-12 a renewal that WAITED on the job's row lock is judged AFTER the wait: the
 *        holder moves the deadline into the past and commits, and the waiting renewal
 *        then refuses. A renewal that read the clock BEFORE it locked would have
 *        answered "live" — and would have extended a lease that had already lapsed.
 *   C-13 a lease lost mid-attempt: the former holder can neither renew, nor complete,
 *        nor write evidence (the evidence count is unchanged), the new attempt writes,
 *        and the sweep leaves a job whose lease is LIVE exactly as it is.
 *   C-14 two genuinely concurrent claimers cannot both take one job: exactly one wins,
 *        no job is handed to both, and the attempt is counted once.
 *   C-15 a lease that LAPSES WHILE THE UNIT WAITS for its keys is refused at the mutation
 *        boundary — nothing written, no cursor moved, the job left claimed — and the SAME
 *        unit then ingests normally once its lease is live again. A boundary re-read of the
 *        deadline alone would have admitted it, which makes this the discriminating probe
 *   C-16 an attempt whose absolute deadline passes during that same wait is refused under
 *        its OWN verdict at the boundary, and also writes nothing
 *
 * The deadline scenarios (C-8 … C-11) shape the fixture clock with the OWNER's UPDATE
 * privilege, which is not a privilege the application holds (service_role can only
 * SELECT these tables); the deployed FUNCTIONS and the deployed CONSTRAINT are what the
 * assertions are about.
 *
 * RUN:  node scripts/cb005bConcurrency.pg.test.cjs
 */

const env = (k, d) => (process.env[k] && String(process.env[k]).trim()) || d;
const UNVERIFIED = 2;

async function run() {
  const url = env('CB005B_SCRATCH_DATABASE_URL');
  const missing = ['CB005B_SCRATCH_DATABASE_URL', 'CB005B_BUSINESS_ID', 'CB005B_CONNECTION_ID', 'CB005B_CREDENTIAL_ID']
    .filter((k) => !env(k));
  if (missing.length || env('CB005B_SCRATCH_CONFIRM') !== 'disposable') {
    return {
      status: 'UNVERIFIED',
      reason: `no disposable PostgreSQL database configured (missing: ${missing.join(', ') || 'none'}; CB005B_SCRATCH_CONFIRM=${env('CB005B_SCRATCH_CONFIRM', '<unset>')})`,
      results: [],
    };
  }

  const postgres = require('postgres');
  const sql = postgres(url, { max: 4, onnotice: () => {} });
  const results = [];
  const check = (id, cond, detail) => results.push([id, !!cond, detail]);
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const provider = env('CB005B_PROVIDER', 'quickbooks');
  const [opA, opB] = env('CB005B_OPERATIONS', 'transactions.read,accounts.read').split(',').map((s) => s.trim());
  const opCap = env('CB005B_OPERATION_CAP', 'balances.read');
  const opDeadline = env('CB005B_OPERATION_DEADLINE', 'sync.start');

  try {
    const [{ iso }] = await sql`select current_setting('transaction_isolation') as iso`;
    check('C-0 default isolation is READ COMMITTED (the lock relies on per-statement snapshots)',
      iso === 'read committed', `isolation=${iso}`);

    const enqueue = async (op) => (await sql`
      select public.provider_sync_job_enqueue(
        p_business_id => ${env('CB005B_BUSINESS_ID')}::uuid,
        p_business_connection_id => ${env('CB005B_CONNECTION_ID')}::uuid,
        p_credential_id => ${env('CB005B_CREDENTIAL_ID')}::uuid,
        p_provider => ${provider}, p_provider_operation => ${op}) as id`)[0].id;
    const jobIds = [await enqueue(opA), await enqueue(opB)];
    const claimOne = async (worker) => (await sql`
      select id, attempt_id, lease_id, claimed_by from public.provider_sync_job_claim(
        p_worker_id => ${worker}, p_limit => 1, p_lease_seconds => 900)`)[0];
    const ja = await claimOne(`cb005b-conc-A-${runId}`);
    const jb = await claimOne(`cb005b-conc-B-${runId}`);
    check('C-setup two different jobs are claimed by two workers',
      ja && jb && ja.id !== jb.id && jobIds.includes(ja.id) && jobIds.includes(jb.id),
      `claimed=${JSON.stringify([ja && ja.id, jb && jb.id])} enqueued=${JSON.stringify(jobIds)}`);
    if (!ja || !jb || ja.id === jb.id) return { status: 'FAIL', reason: 'fixture claim failed', results };

    const obs = (id, amount) => ({
      object_type: 'transaction', provider_object_id: `cb005b-conc-${runId}-${id}`,
      value_kind: 'amount', source_version: 'v1', payload: { amount, currency: 'USD' },
    });
    const ingest = (conn, j, observations) => conn`
      select public.provider_sync_observation_ingest(
        ${j.id}::uuid, ${j.attempt_id}::uuid, ${j.lease_id}::uuid, ${j.claimed_by},
        ${JSON.stringify(observations)}::jsonb, null::jsonb) as r`.then((rows) => rows[0].r);
    const rowsFor = (id) => sql`
      select payload, job_id from public.provider_observations
       where provider_object_id = ${`cb005b-conc-${runId}-${id}`}`;
    const reconciles = (r) => r && r.inserted + r.duplicates + r.conflicts === r.delivered;
    const waitsOnAdvisory = async (pid) => {
      for (let i = 0; i < 50; i += 1) {
        const [s] = await sql`select wait_event_type, wait_event from pg_stat_activity where pid = ${pid}`;
        if (s && s.wait_event_type === 'Lock' && s.wait_event === 'advisory') return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };

    /** A holds the key uncommitted; B starts and must WAIT; then A finishes. */
    async function race(label, aObs, bObs, finishA) {
      const a = await sql.reserve();
      const b = await sql.reserve();
      try {
        const [{ pid }] = await b`select pg_backend_pid() as pid`;
        await a`begin`;
        const aReceipt = await ingest(a, ja, aObs);
        await b`begin`;
        const bPending = ingest(b, jb, bObs).then((r) => ({ r }), (e) => ({ e }));
        const blocked = await waitsOnAdvisory(pid);
        await (finishA === 'commit' ? a`commit` : a`rollback`);
        const bOut = await bPending;
        await (bOut.e ? b`rollback` : b`commit`);
        return { aReceipt, blocked, bReceipt: bOut.r || null, bError: bOut.e ? String(bOut.e.message) : null };
      } finally {
        a.release();
        b.release();
      }
    }

    const receipts = [];
    const c1 = await race('C-1', [obs('k1', 10)], [obs('k1', 99)], 'commit');
    const r1 = await rowsFor('k1');
    receipts.push(c1.aReceipt);
    check('C-1 a conflicting payload from another job WAITS, then is refused, never discarded',
      c1.blocked && /OBSERVATION_CONFLICT/.test(c1.bError || '') && r1.length === 1 && r1[0].payload.amount === 10,
      `blocked=${c1.blocked} b_error=${c1.bError} rows=${r1.length} stored=${r1[0] && r1[0].payload.amount}`);

    const c2 = await race('C-2', [obs('k2', 20)], [obs('k2', 20)], 'commit');
    const r2 = await rowsFor('k2');
    receipts.push(c2.aReceipt, c2.bReceipt);
    check('C-2 an identical payload from another job WAITS, then is counted as a duplicate',
      c2.blocked && c2.bReceipt && c2.bReceipt.inserted === 0 && c2.bReceipt.duplicates === 1 && r2.length === 1,
      `blocked=${c2.blocked} b=${JSON.stringify(c2.bReceipt)} b_error=${c2.bError} rows=${r2.length}`);

    const c3 = await race('C-3', [obs('k3', 30)], [obs('k3', 33)], 'rollback');
    const r3 = await rowsFor('k3');
    receipts.push(c3.bReceipt);
    check('C-3 when the first writer rolls back, the waiting writer inserts its own payload',
      c3.blocked && c3.bReceipt && c3.bReceipt.inserted === 1 && r3.length === 1
        && r3[0].payload.amount === 33 && r3[0].job_id === jb.id,
      `blocked=${c3.blocked} b=${JSON.stringify(c3.bReceipt)} b_error=${c3.bError} rows=${r3.length}`);

    const c4 = await race('C-4', [obs('k4', 40), obs('k5', 50)], [obs('k5', 50), obs('k4', 40)], 'commit');
    receipts.push(c4.aReceipt, c4.bReceipt);
    check('C-4 overlapping key sets delivered in opposite order cannot deadlock',
      c4.bReceipt && !/deadlock/i.test(c4.bError || '') && c4.bReceipt.duplicates === 2 && c4.bReceipt.inserted === 0,
      `blocked=${c4.blocked} b=${JSON.stringify(c4.bReceipt)} b_error=${c4.bError}`);

    check('C-5 every receipt returned under concurrency reconciles per delivery',
      receipts.length > 0 && receipts.every(reconciles),
      `receipts=${JSON.stringify(receipts)}`);

    // ── C-6 · the DEPLOYED delete rules, read PER CONSTRAINT from the catalogue ──
    // 'r' RESTRICT · 'n' SET NULL · 'c' CASCADE · 'a' NO ACTION · 'd' SET DEFAULT.
    //
    // WHY THE INDIVIDUAL KEYS AND NOT A GROUPED SUMMARY. `group by (child, rule)` collapses
    // three RESTRICT keys and one SET NULL key into TWO rows — the same two rows a table with
    // forty keys would produce — so a grouped count can never establish that a particular key
    // exists, that it targets the table it should, or that it carries the rule it should. The
    // matrix below is therefore read over the individual constraints, each one NAMED, with its
    // target relation and its deleting action taken from pg_constraint; the grouped shape is
    // asserted separately (C-6e), as the summary it is.
    const fkRules = await sql`
      select cl.relname as child, con.conname as name, tgt.relname as target,
             c.confdeltype as rule, pg_get_constraintdef(con.oid) as def
        from pg_constraint c
        join pg_class cl on cl.oid = c.conrelid
        join pg_class tgt on tgt.oid = c.confrelid
       where c.contype = 'f'
         and cl.relname in ('provider_observations', 'provider_sync_checkpoints')
         and c.confrelid in ('public.provider_sync_jobs'::regclass,
                             'public.business_connections'::regclass,
                             'public.provider_credentials'::regclass)
       order by cl.relname, con.conname`;
    const obsFks = fkRules.filter((r) => r.child === 'provider_observations');
    const cpFks = fkRules.filter((r) => r.child === 'provider_sync_checkpoints');
    const rulesOn = (rows, target) => rows.filter((r) => r.target === target).map((r) => r.rule).sort();
    const defsOn = (rows, target) => rows.filter((r) => r.target === target).map((r) => r.def);
    const namedExactly = (rows, target, expected) => rows.filter((r) => r.target === target)
      .map((r) => r.name).sort().join(',') === expected.slice().sort().join(',');
    const jobOnObs = rulesOn(obsFks, 'provider_sync_jobs');
    const connOnObs = rulesOn(obsFks, 'business_connections');
    const credOnObs = rulesOn(obsFks, 'provider_credentials');
    const jobOnCp = rulesOn(cpFks, 'provider_sync_jobs');

    check('C-6a the evidence table carries FOUR keys, each one named, and BOTH keys into the job are RESTRICT',
      obsFks.length === 4
        && namedExactly(obsFks, 'provider_sync_jobs', [
          'provider_observations_job_same_business_fkey',
          'provider_observations_job_same_connection_fkey',
        ])
        && jobOnObs.length === 2 && jobOnObs.every((r) => r === 'r'),
      `observation_fks=${obsFks.length} ${JSON.stringify(obsFks.map((r) => [r.name, r.target, r.rule]))}`);

    check('C-6b the key into the CONNECTION is RESTRICT, and the key into the CREDENTIAL is SET NULL with the column named in the deployed definition',
      connOnObs.join(',') === 'r' && credOnObs.join(',') === 'n'
        && namedExactly(obsFks, 'business_connections', ['provider_observations_connection_same_business_fkey'])
        && namedExactly(obsFks, 'provider_credentials', ['provider_observations_credential_same_business_fkey'])
        && defsOn(obsFks, 'provider_credentials').every((d) => /ON DELETE SET NULL/i.test(d)),
      `connection=${JSON.stringify(connOnObs)} credential=${JSON.stringify(credOnObs)} credential_defs=${JSON.stringify(defsOn(obsFks, 'provider_credentials'))}`);

    check('C-6c BOTH checkpoint keys into the job are CASCADE — a cursor position is not evidence, and that cascade is deliberate',
      cpFks.length === 2 && jobOnCp.every((r) => r === 'c')
        && namedExactly(cpFks, 'provider_sync_jobs', [
          'provider_sync_checkpoints_job_same_business_fkey',
          'provider_sync_checkpoints_job_same_connection_fkey',
        ]),
      `checkpoint_fks=${cpFks.length} ${JSON.stringify(cpFks.map((r) => [r.name, r.target, r.rule]))}`);

    check('C-6d NO key on provider_observations cascades — evidence is never removed by a deletion nobody aimed at it',
      obsFks.length === 4 && obsFks.every((r) => r.rule !== 'c')
        && obsFks.every((r) => !/ON DELETE CASCADE/i.test(r.def)),
      `rules=${JSON.stringify(obsFks.map((r) => [r.name, r.target, r.rule]))}`);

    // THE GROUPED SHAPE, asserted as the summary it is. Four keys — two into the job, one
    // into the connection, one into the credential — collapse to two (child, rule) rows for
    // the observations, and the two checkpoint keys collapse to one. Naming the difference
    // here is the point: neither count may be read as a key count.
    const grouped = await sql`
      select cl.relname as child, c.confdeltype as rule, count(*)::int as n
        from pg_constraint c
        join pg_class cl on cl.oid = c.conrelid
       where c.contype = 'f'
         and cl.relname in ('provider_observations', 'provider_sync_checkpoints')
         and c.confrelid in ('public.provider_sync_jobs'::regclass,
                             'public.business_connections'::regclass,
                             'public.provider_credentials'::regclass)
       group by 1, 2 order by 1, 2`;
    const groupedShape = (child) => grouped.filter((r) => r.child === child)
      .map((r) => `${r.rule}:${r.n}`).join(' ');
    check('C-6e the grouped (child, rule) summary reads TWO rows for the observations and ONE for the checkpoints — a summary that cannot stand in for the matrix above',
      grouped.length === 3
        && groupedShape('provider_observations') === 'n:1 r:3'
        && groupedShape('provider_sync_checkpoints') === 'c:2',
      `grouped=${JSON.stringify(grouped)} observations="${groupedShape('provider_observations')}" checkpoints="${groupedShape('provider_sync_checkpoints')}"`);

    // ── C-7 · a deletion that would remove evidence is REFUSED ──────────────
    // The whole statement aborts, so nothing is half-deleted and the evidence count is
    // exactly what it was — measured before and after, never assumed.
    const evidenceCount = async () => (await sql`
      select count(*)::int as n from public.provider_observations
       where business_id = ${env('CB005B_BUSINESS_ID')}::uuid`)[0].n;
    const before = await evidenceCount();
    const refused = async (q) => {
      try { await q; return false; }
      catch (e) { return /violates foreign key constraint/i.test(String(e && e.message)); }
    };
    const jobRefused = await refused(sql`delete from public.provider_sync_jobs where id = ${ja.id}::uuid`);
    const connRefused = await refused(sql`delete from public.business_connections where id = ${env('CB005B_CONNECTION_ID')}::uuid`);
    const credRefused = await refused(sql`delete from public.provider_credentials where id = ${env('CB005B_CREDENTIAL_ID')}::uuid`);
    const after = await evidenceCount();
    check('C-7 deleting the job, the connection or the credential is refused and no evidence is lost',
      before > 0 && jobRefused && connRefused && credRefused && after === before,
      `evidence ${before} -> ${after}; refused job=${jobRefused} connection=${connRefused} credential=${credRefused}`);

    // ══ THE ATTEMPT'S ABSOLUTE DEADLINE, against the real server ═══════════
    // The checks above are about the LEASE. These are about the BUDGET, which bounds a
    // different thing: the attempt itself. The fixture clock is moved with the OWNER's
    // UPDATE privilege — a privilege this application does not hold (service_role has
    // SELECT only on these tables) — so the deployed FUNCTIONS and the deployed
    // CONSTRAINT remain the objects under test.
    const enqueueWith = async (op, maxSeconds) => (await sql`
      select public.provider_sync_job_enqueue(
        p_business_id => ${env('CB005B_BUSINESS_ID')}::uuid,
        p_business_connection_id => ${env('CB005B_CONNECTION_ID')}::uuid,
        p_credential_id => ${env('CB005B_CREDENTIAL_ID')}::uuid,
        p_provider => ${provider}, p_provider_operation => ${op},
        p_max_attempt_seconds => ${maxSeconds}) as id`)[0].id;
    const claimAll = async (worker) => sql`
      select id, attempt_id, lease_id, claimed_by, status, attempt_count, max_attempts, max_attempt_seconds,
             extract(epoch from (lease_expires_at - attempt_started_at))::int as lease_seconds
        from public.provider_sync_job_claim(
          p_worker_id => ${worker}, p_limit => 5, p_lease_seconds => 900)`;

    // C-8 · a 900-second request against a 30-second attempt comes back as 30.
    const jobCap = await enqueueWith(opCap, 30);
    const claimedCap = (await claimAll(`cb005b-conc-cap-${runId}`)).find((j) => j.id === jobCap) || null;
    check("C-8 the claim caps a 900-second lease request at the attempt's own 30-second budget",
      !!claimedCap && claimedCap.lease_seconds === 30 && claimedCap.max_attempt_seconds === 30
        && claimedCap.status === 'claimed',
      `job=${jobCap} granted=${claimedCap && claimedCap.lease_seconds}s budget=${claimedCap && claimedCap.max_attempt_seconds}s`);

    // A SECOND job with the default budget, claimed while the capped one's lease is still
    // live, so the expiry assertions below cannot disturb the fixtures above.
    const jobExp = await enqueue(opDeadline);
    const claimedExp = (await claimAll(`cb005b-conc-exp-${runId}`)).find((j) => j.id === jobExp) || null;
    check('C-8b an independent second job is claimed without disturbing the first',
      !!claimedExp && !!claimedCap && claimedExp.id !== claimedCap.id && claimedExp.status === 'claimed',
      `expiry job=${claimedExp && claimedExp.id} cap job=${claimedCap && claimedCap.id}`);

    // C-9 · renewal inside the budget (and still capped), then at the deadline (refused,
    // and the row unchanged).
    const shapeClock = (id, startSecondsAgo, leaseSecondsAfterStart) => sql`
      update public.provider_sync_jobs
         set attempt_started_at = clock_timestamp() - make_interval(secs => ${startSecondsAgo}::int),
             lease_expires_at   = clock_timestamp() - make_interval(secs => ${startSecondsAgo}::int)
                                    + make_interval(secs => ${leaseSecondsAfterStart}::int)
       where id = ${id}::uuid`;
    // Connection-parameterised, because C-12 must renew from a session that is HOLDING
    // a transaction while another session owns the job's row.
    const renewOn = (conn, j) => conn`
      select public.provider_sync_job_renew_lease(${j.id}::uuid, ${j.attempt_id}::uuid,
        ${j.lease_id}::uuid, ${j.claimed_by}, p_lease_seconds => 900) as ok`;
    const renew = (j) => renewOn(sql, j);
    const leaseSecondsOf = async (id) => (await sql`
      select extract(epoch from (lease_expires_at - attempt_started_at))::int as s
        from public.provider_sync_jobs where id = ${id}::uuid`)[0].s;

    await shapeClock(jobCap, 25, 30);
    const renewBefore = (await renew(claimedCap))[0].ok;
    const leaseAfterRenew = await leaseSecondsOf(jobCap);
    check('C-9 renewal five seconds before the deadline succeeds and stays capped at it',
      renewBefore === true && leaseAfterRenew === 30,
      `renewed=${renewBefore} lease=${leaseAfterRenew}s of a 30s budget`);

    await shapeClock(jobCap, 30, 30);
    const renewAt = (await renew(claimedCap))[0].ok;
    const leaseAfterRefusal = await leaseSecondsOf(jobCap);
    check('C-9b renewal AT the deadline is refused and changes nothing',
      renewAt === false && leaseAfterRefusal === 30,
      `renewed=${renewAt} lease=${leaseAfterRefusal}s`);

    // C-10 · an attempt past its deadline is refused by all three writers, under their own
    // verdicts, and no evidence is written. 11 minutes ago with a 600-second budget puts
    // the deadline a minute in the past and the capped lease ten minutes in the past.
    const beforeExpired = await evidenceCount();
    await sql`
      update public.provider_sync_jobs
         set attempt_started_at = clock_timestamp() - interval '11 minutes',
             lease_expires_at   = clock_timestamp() - interval '10 minutes'
       where id = ${jobExp}::uuid`;
    const authExpired = (await sql`
      select public.provider_sync_job_authorize(${jobExp}::uuid, ${claimedExp.attempt_id}::uuid,
        ${claimedExp.lease_id}::uuid, ${claimedExp.claimed_by}) as r`)[0].r;
    const completeExpired = (await sql`
      select public.provider_sync_job_complete(${jobExp}::uuid, ${claimedExp.attempt_id}::uuid,
        ${claimedExp.lease_id}::uuid, ${claimedExp.claimed_by}, p_outcome => 'completed') as v`)[0].v;
    let ingestExpired = null;
    try {
      await ingest(sql, claimedExp, [obs('deadline', 1)]);
    } catch (e) { ingestExpired = String(e && e.message); }
    const afterExpired = await evidenceCount();
    const [expiredRow] = await sql`
      select status from public.provider_sync_jobs where id = ${jobExp}::uuid`;
    check('C-10 an expired attempt is refused by authorize (attempt_expired), complete (ATTEMPT_EXPIRED) and the ingest, writing nothing',
      authExpired && authExpired.verified === false && authExpired.claim_state === 'attempt_expired'
        && completeExpired === 'ATTEMPT_EXPIRED'
        && /ATTEMPT_EXPIRED/.test(ingestExpired || '')
        && afterExpired === beforeExpired
        && expiredRow.status === 'claimed',
      `authorize=${authExpired && authExpired.claim_state} complete=${completeExpired} ingest=${ingestExpired} evidence ${beforeExpired} -> ${afterExpired}`);

    // Recovery is unaffected: the expired attempt is reclaimable, with a NEW identity.
    const reclaimed = (await claimAll(`cb005b-conc-recover-${runId}`)).find((j) => j.id === jobExp) || null;
    check('C-10b the expired attempt is RECOVERABLE: a later claim takes it with a new attempt identity',
      !!reclaimed && reclaimed.attempt_id !== claimedExp.attempt_id && reclaimed.attempt_count === 2,
      `reclaimed=${reclaimed && reclaimed.id} attempts=${reclaimed && reclaimed.attempt_count}`);

    // C-11 · THE DISCRIMINATING PROBE. A lease 800 seconds after the CLAIM instant sits
    // inside any duration cap — 900 seconds was requested — but far beyond this attempt's
    // absolute deadline. An implementation that compared the lease against a duration
    // would accept it; only a bound stated against attempt_started_at + the budget
    // refuses it. The control update proves the refusal is about the bound, not about
    // UPDATE being unusable.
    const attemptUpdate = async (q) => {
      try { await q; return null; }
      catch (e) { return String(e && e.message); }
    };
    const beyondDeadline = await attemptUpdate(sql`
      update public.provider_sync_jobs set lease_expires_at = claimed_at + make_interval(secs => 800)
       where id = ${jobCap}::uuid`);
    const insideBudget = await attemptUpdate(sql`
      update public.provider_sync_jobs
         set lease_expires_at = attempt_started_at + make_interval(secs => max_attempt_seconds)
       where id = ${jobCap}::uuid`);
    const [withinRow] = await sql`
      select extract(epoch from (lease_expires_at - attempt_started_at)) <= max_attempt_seconds as ok
        from public.provider_sync_jobs where id = ${jobCap}::uuid`;
    check('C-11 the DEPLOYED constraint refuses a lease beyond the ABSOLUTE deadline but inside 900s of the claim, and accepts one inside the budget',
      /lease_within_attempt/.test(beyondDeadline || '') && insideBudget === null && withinRow.ok === true,
      `beyond_deadline=${beyondDeadline || 'ACCEPTED — the constraint is NOT bound to the absolute deadline'} inside_budget=${insideBudget === null ? 'accepted' : insideBudget}`);

    // ══ THE JOB ROW LOCK, THE LOST LEASE, AND THE CLAIM RACE ═══════════════
    // C-1 … C-5 exercise the per-key ADVISORY lock. These exercise the JOB ROW lock and
    // the claim itself. The fixture clock is moved with the OWNER's UPDATE privilege
    // again — a privilege this application does not hold — so the deployed FUNCTIONS
    // remain the objects under test.

    /** Waits until `pid` is blocked on a lock of any kind (advisory, tuple, transactionid). */
    const waitsForLock = async (pid) => {
      for (let i = 0; i < 60; i += 1) {
        const [s] = await sql`select wait_event_type, wait_event from pg_stat_activity where pid = ${pid}`;
        if (s && s.wait_event_type === 'Lock') return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };

    // ── C-12 · THE RENEWAL THAT WAITED ──────────────────────────────────────
    // The renewal must take the row lock BEFORE it reads the clock: a renewal served
    // after a wait is judged against the instant it holds the row, not the instant it
    // arrived. Session A holds the job's row and moves its deadline into the past;
    // B's renewal blocks, then must refuse. A pre-lock clock read returns TRUE here.
    const claimedRenew = (await claimAll(`cb005b-conc-renew-${runId}`)).find((j) => j.id === jobCap) || null;
    const blockedRenewal = await (async () => {
      const a = await sql.reserve();
      const b = await sql.reserve();
      try {
        const [{ pid }] = await b`select pg_backend_pid() as pid`;
        await a`begin`;
        await a`select id from public.provider_sync_jobs where id = ${jobCap}::uuid for update`;
        await b`begin`;
        const pending = renewOn(b, claimedRenew).then((r) => ({ r: r[0].ok }), (e) => ({ e }));
        const blocked = await waitsForLock(pid);
        // while B waits, A moves the attempt's deadline into the past and commits
        await a`update public.provider_sync_jobs
                   set attempt_started_at = clock_timestamp() - interval '11 minutes',
                       lease_expires_at   = clock_timestamp() - interval '10 minutes'
                 where id = ${jobCap}::uuid`;
        await a`commit`;
        const out = await pending;
        await (out.e ? b`rollback` : b`commit`);
        const [row] = await sql`select lease_expires_at < clock_timestamp() as lapsed
                                  from public.provider_sync_jobs where id = ${jobCap}::uuid`;
        return { blocked, ok: out.r === undefined ? null : out.r, error: out.e ? String(out.e.message) : null, lapsed: row.lapsed };
      } finally {
        a.release();
        b.release();
      }
    })();
    check('C-12 a renewal that WAITED on the job row is judged AFTER the wait, so it refuses a deadline that passed while it waited',
      !!claimedRenew && blockedRenewal.blocked && blockedRenewal.ok === false
        && blockedRenewal.error === null && blockedRenewal.lapsed === true,
      `blocked=${blockedRenewal.blocked} renewed=${blockedRenewal.ok} error=${blockedRenewal.error} lease_lapsed=${blockedRenewal.lapsed}`);

    // ── C-13 · THE LEASE THAT WAS LOST MID-ATTEMPT ──────────────────────────
    // The lease lapses (a stalled worker), the attempt is reclaimed by a second worker
    // with a NEW identity, and the first worker must then be unable to renew, complete
    // or write — while the new attempt writes normally.
    await sql`
      update public.provider_sync_jobs
         set attempt_started_at = clock_timestamp() - interval '20 minutes',
             lease_expires_at   = clock_timestamp() - interval '19 minutes'
       where id = ${jobExp}::uuid`;
    const [displaced] = await sql`
      select id, attempt_id, lease_id, claimed_by, attempt_count
        from public.provider_sync_jobs where id = ${jobExp}::uuid`;
    const newHolder = (await claimAll(`cb005b-conc-lease-2-${runId}`)).find((j) => j.id === jobExp) || null;
    const beforeLoss = await evidenceCount();
    const renewLost = (await renewOn(sql, displaced))[0].ok;
    const completeLost = (await sql`
      select public.provider_sync_job_complete(${jobExp}::uuid, ${displaced.attempt_id}::uuid,
        ${displaced.lease_id}::uuid, ${displaced.claimed_by}, p_outcome => 'completed') as v`)[0].v;
    let ingestLost = null;
    try { await ingest(sql, displaced, [obs('lease-lost', 7)]); }
    catch (e) { ingestLost = String(e && e.message); }
    const afterLoss = await evidenceCount();
    const newHolderWrites = await ingest(sql, newHolder, [obs('lease-winner', 8)])
      .then((r) => r, (e) => ({ error: String(e && e.message) }));
    check('C-13 a worker whose lease was reclaimed can neither renew, nor complete, nor write evidence — and the new attempt can',
      !!displaced && !!newHolder && newHolder.attempt_id !== displaced.attempt_id
        && renewLost === false && completeLost === 'LEASE_FENCED' && /LEASE_FENCED/.test(ingestLost || '')
        && afterLoss === beforeLoss
        && !!newHolderWrites && newHolderWrites.inserted === 1,
      `attempts=${displaced && displaced.attempt_count}->${newHolder && newHolder.attempt_count} renew=${renewLost} complete=${completeLost} ingest=${ingestLost} evidence ${beforeLoss} -> ${afterLoss}`);

    // C-13b · the recovery sweep is not a licence to disturb a live attempt.
    const sweptLive = (await sql`select public.provider_sync_job_sweep(50) as n`)[0].n;
    const [afterSweep] = await sql`
      select status, attempt_id from public.provider_sync_jobs where id = ${jobExp}::uuid`;
    check('C-13b the sweep leaves a job whose lease is LIVE exactly as it is',
      !!newHolder && afterSweep.status === 'claimed' && afterSweep.attempt_id === newHolder.attempt_id,
      `swept=${sweptLive} status=${afterSweep.status} attempt_kept=${afterSweep.attempt_id === (newHolder && newHolder.attempt_id)}`);

    // ── C-14 · TWO CLAIMERS, ONE JOB ────────────────────────────────────────
    // The fixture is released back to the queue as a RETRY (not by an owner write), its
    // clock is restored so the attempt is live again, and two genuinely concurrent
    // sessions claim at once. Exactly one may win it.
    const [raceIdentity] = await sql`
      select id, attempt_id, lease_id, claimed_by, attempt_count
        from public.provider_sync_jobs where id = ${jobCap}::uuid`;
    await sql`
      update public.provider_sync_jobs
         set attempt_started_at = clock_timestamp(),
             lease_expires_at   = clock_timestamp() + make_interval(secs => max_attempt_seconds)
       where id = ${jobCap}::uuid`;
    const completeRetry = (await sql`
      select public.provider_sync_job_complete(${jobCap}::uuid, ${raceIdentity.attempt_id}::uuid,
        ${raceIdentity.lease_id}::uuid, ${raceIdentity.claimed_by},
        p_outcome => 'retryable', p_error_class => 'transient', p_backoff_seconds => 1) as v`)[0].v;
    await new Promise((r) => setTimeout(r, 1500)); // the backoff is one second
    const raceClaim = await (async () => {
      const a = await sql.reserve();
      const b = await sql.reserve();
      try {
        const [ra, rb] = await Promise.all([
          a`select id from public.provider_sync_job_claim(p_worker_id => ${`cb005b-conc-race-A-${runId}`}, p_limit => 5, p_lease_seconds => 900)`,
          b`select id from public.provider_sync_job_claim(p_worker_id => ${`cb005b-conc-race-B-${runId}`}, p_limit => 5, p_lease_seconds => 900)`,
        ]);
        return { a: ra.map((r) => r.id), b: rb.map((r) => r.id) };
      } finally {
        a.release();
        b.release();
      }
    })();
    const wonBy = (raceClaim.a.includes(jobCap) ? 1 : 0) + (raceClaim.b.includes(jobCap) ? 1 : 0);
    const handedToBoth = raceClaim.a.filter((id) => raceClaim.b.includes(id));
    const [raceRow] = await sql`
      select attempt_count, status from public.provider_sync_jobs where id = ${jobCap}::uuid`;
    check('C-14 two concurrent claimers cannot both take one job: exactly one wins, no job is handed to both, the attempt is counted once',
      completeRetry === 'retry_wait' && wonBy === 1 && handedToBoth.length === 0
        && raceRow.attempt_count === raceIdentity.attempt_count + 1 && raceRow.status === 'claimed',
      `retry_verdict=${completeRetry} won_by=${wonBy} handed_to_both=${handedToBoth.length} attempts=${raceIdentity.attempt_count}->${raceRow.attempt_count}`);

    // ══ THE LEASE AND THE DEADLINE, RE-JUDGED AFTER A REAL WAIT ════════════
    // C-1 … C-5 exercise the per-key ADVISORY lock with two sessions. These two hold that
    // lock for LONGER THAN THE WAITING JOB HAS LEFT ON ITS LEASE, so the wait itself is what
    // carries the job out of its lease. The waiting unit passes the entry fence — its lease
    // is live when it arrives — blocks on the key, and must then be refused at the mutation
    // boundary. The fixture clock is moved with the OWNER's UPDATE privilege, which is not a
    // privilege this application holds, so the deployed FUNCTIONS remain the objects under
    // test. The blocker holds the key with a bare transaction-scoped advisory lock taken on
    // the SAME hash the ingest computes, so nothing but the lock is in the way.
    const objectIdOf = (id) => `cb005b-conc-${runId}-${id}`;
    const lockKeyOf = async (objectId) => (await sql`
      select hashtextextended(
               'cb005b:provider_observations:dedup_key:' || encode(sha256(convert_to(
                 ${`${env('CB005B_BUSINESS_ID')}|${provider}|${env('CB005B_CONNECTION_ID')}|transaction|${objectId}|amount|v1`},
                 'utf8')), 'hex'), 0) as k`)[0].k;
    const CHECKPOINT_ADVANCE = { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 };
    const checkpointsFor = async (jobId) => (await sql`
      select count(*)::int as n from public.provider_sync_checkpoints where job_id = ${jobId}::uuid`)[0].n;
    const ingestWithCheckpoint = (conn, j, observations, checkpoint) => conn`
      select public.provider_sync_observation_ingest(
        ${j.id}::uuid, ${j.attempt_id}::uuid, ${j.lease_id}::uuid, ${j.claimed_by},
        ${JSON.stringify(observations)}::jsonb, ${JSON.stringify(checkpoint)}::jsonb) as r`.then((rows) => rows[0].r);
    const leaseShapeOf = async (jobId) => (await sql`
      select (attempt_started_at + make_interval(secs => max_attempt_seconds)) > clock_timestamp() as deadline_live,
             lease_expires_at < clock_timestamp() as lease_lapsed
        from public.provider_sync_jobs where id = ${jobId}::uuid`)[0];

    /**
     * Session A holds the key for `holdMs` while the waiting unit has only
     * `leaseSecondsAhead` left on its lease — never more than the attempt's own budget
     * permits, which is what the constraint requires of the fixture. The unit must WAIT
     * (asserted, never assumed), and is judged against the instant it is then ready to
     * write. A delivers no observation and writes nothing: it only holds the lock.
     */
    const waitedThenJudged = async (job, leaseSecondsAhead, holdMs, objectId) => {
      const a = await sql.reserve();
      const b = await sql.reserve();
      const before = { evidence: await evidenceCount(), checkpoints: await checkpointsFor(job.id) };
      try {
        const lockKey = await lockKeyOf(objectIdOf(objectId));
        await sql`
          update public.provider_sync_jobs
             set lease_expires_at = least(
                   clock_timestamp() + make_interval(secs => ${leaseSecondsAhead}::int),
                   attempt_started_at + make_interval(secs => max_attempt_seconds))
           where id = ${job.id}::uuid`;
        const [{ pid }] = await b`select pg_backend_pid() as pid`;
        await a`begin`;
        await a`select pg_advisory_xact_lock(${lockKey}::bigint)`;
        await b`begin`;
        const pending = ingestWithCheckpoint(b, job, [obs(objectId, 5)], CHECKPOINT_ADVANCE)
          .then((r) => ({ r }), (e) => ({ e }));
        const blocked = await waitsOnAdvisory(pid);
        await new Promise((r) => setTimeout(r, holdMs));
        await a`commit`; // released AFTER the wait has outlasted the lease
        const out = await pending;
        await (out.e ? b`rollback` : b`commit`);
        return {
          blocked,
          receipt: out.r || null,
          error: out.e ? String(out.e.message) : null,
          before,
          after: { evidence: await evidenceCount(), checkpoints: await checkpointsFor(job.id) },
          shape: await leaseShapeOf(job.id),
        };
      } finally {
        a.release();
        b.release();
      }
    };

    // ── C-15 · THE LEASE THAT LAPSED WHILE THE UNIT WAITED FOR ITS KEYS ─────
    // The entry fence read the clock on arrival; the wait for a key is what makes that
    // reading stale. The LEASE is what can lapse during it while the attempt's own deadline
    // is still far away — the grant is capped AT the deadline, never extended to it, so a
    // short lease on a long attempt is the ordinary case, not a contrived one. The
    // pre-correction function re-read only the deadline at the boundary, so it would have
    // ingested this batch: the probe separates the correction from the defect it removes.
    const [waitJob] = await sql`
      select id, attempt_id, lease_id, claimed_by from public.provider_sync_jobs where id = ${jobExp}::uuid`;
    const leaseCase = await waitedThenJudged(waitJob, 4, 6000, 'waited-lease');
    check('C-15 a lease that lapses while the unit waits for its keys is refused AT the boundary — nothing written, no cursor moved, the job left claimed',
      leaseCase.blocked && /LEASE_FENCED/.test(leaseCase.error || '')
        && /lease_expired/.test(leaseCase.error || '')
        && leaseCase.shape.deadline_live === true && leaseCase.shape.lease_lapsed === true
        && leaseCase.receipt === null
        && leaseCase.before.evidence === leaseCase.after.evidence
        && leaseCase.before.checkpoints === 0 && leaseCase.after.checkpoints === 0,
      `blocked=${leaseCase.blocked} error=${leaseCase.error} deadline_live=${leaseCase.shape.deadline_live} lease_lapsed=${leaseCase.shape.lease_lapsed} evidence ${leaseCase.before.evidence}->${leaseCase.after.evidence} checkpoints ${leaseCase.before.checkpoints}->${leaseCase.after.checkpoints}`);

    // ── C-15b · THE SAME UNIT AND THE SAME BATCH, ONCE ITS LEASE IS LIVE ────
    // The control that makes C-15 a verdict about the clock rather than a functional
    // failure: restore the lease — to the attempt's own deadline, the largest the deployed
    // constraint permits — and the identical unit stores its observation and advances its
    // cursor exactly once. The payload refused above is the payload stored here.
    await sql`
      update public.provider_sync_jobs
         set lease_expires_at = attempt_started_at + make_interval(secs => max_attempt_seconds)
       where id = ${waitJob.id}::uuid`;
    const recovered = await ingestWithCheckpoint(sql, waitJob, [obs('waited-lease', 5)], CHECKPOINT_ADVANCE)
      .then((r) => r, (e) => ({ error: String(e && e.message) }));
    const cursorAfter = (await sql`
      select max(cursor_version)::int as v from public.provider_sync_checkpoints where job_id = ${waitJob.id}::uuid`)[0].v;
    check('C-15b the SAME unit ingests normally once its lease is live — one observation inserted, the cursor advanced once, nothing deferred',
      !!recovered && !recovered.error && recovered.inserted === 1 && recovered.delivered === 1
        && recovered.conflicts === 0 && cursorAfter === 1,
      `receipt=${JSON.stringify(recovered)} cursor_version=${cursorAfter}`);

    // ── C-16 · THE DEADLINE THAT PASSED WHILE THE UNIT WAITED ───────────────
    // A lease can never outlive the attempt's deadline (provider_sync_jobs_lease_within_attempt),
    // so once the deadline passes both have lapsed — what this probe pins is the ORDER of the
    // verdicts (the attempt is reported as EXPIRED, not as a superseded claim) and that the
    // boundary refusal writes nothing. Twenty-six seconds into a thirty-second budget leaves
    // the deadline four seconds away: live when the unit arrives, past by the time the wait
    // has finished.
    const [capJob] = await sql`
      select id, attempt_id, lease_id, claimed_by from public.provider_sync_jobs where id = ${jobCap}::uuid`;
    await sql`
      update public.provider_sync_jobs
         set attempt_started_at = clock_timestamp() - make_interval(secs => 26),
             lease_expires_at   = clock_timestamp() - make_interval(secs => 26)
                                    + make_interval(secs => max_attempt_seconds)
       where id = ${jobCap}::uuid`;
    const deadlineCase = await waitedThenJudged(capJob, 900, 6000, 'waited-deadline');
    check('C-16 an attempt whose absolute deadline passes during the wait is refused under its OWN verdict at the boundary, and writes nothing',
      deadlineCase.blocked && /ATTEMPT_EXPIRED/.test(deadlineCase.error || '')
        && deadlineCase.receipt === null
        && deadlineCase.before.evidence === deadlineCase.after.evidence
        && deadlineCase.before.checkpoints === deadlineCase.after.checkpoints,
      `blocked=${deadlineCase.blocked} error=${deadlineCase.error} evidence ${deadlineCase.before.evidence}->${deadlineCase.after.evidence} checkpoints ${deadlineCase.before.checkpoints}->${deadlineCase.after.checkpoints}`);
  } catch (e) {
    check('C-run the concurrency run completed', false, String(e && e.message));
  } finally {
    await sql.end({ timeout: 5 });
  }

  return { status: results.every((r) => r[1]) ? 'PASS' : 'FAIL', results };
}

module.exports = { run };

if (require.main === module) {
  run().then((out) => {
    console.log(`CB-005B CONCURRENCY (real PostgreSQL): ${out.status}${out.reason ? ` — ${out.reason}` : ''}`);
    out.results.forEach(([id, ok, detail]) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}${ok ? '' : `  — ${detail}`}`));
    process.exit(out.status === 'PASS' ? 0 : out.status === 'UNVERIFIED' ? UNVERIFIED : 1);
  });
}