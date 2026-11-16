'use strict';

/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — HARDENING CHECKS
 * ==========================
 * The checks a review must be able to run BEFORE installation, and that the existing
 * three groups in cb005bProviderExecutionChecks.cjs do not cover:
 *
 *   · LOCK DOCTRINE      can any writer be SERVED on time it no longer has? The renewal
 *                        defect this phase corrects is a reading captured before the row
 *                        lock: a call that arrived inside its lease, waited, and was
 *                        served after the lease lapsed would still extend it. CB5B-131
 *                        asserts the corrected order; CB5B-140/141 prove it as a
 *                        DIFFERENTIAL — the same call granted when served on arrival and
 *                        refused when served after the wait, so the pair distinguishes
 *                        the correction from the defect rather than asserting it.
 *   · INSTALL POSTURE    can the migration be applied twice, or repaired in place? It is
 *                        single-use and fail-closed, and the preflight that precedes it
 *                        must change nothing at all. CB5B-132/133/134.
 *   · AUTHZ BOUNDARY     can authorization be mistaken for permission? authorize locks
 *                        nothing and writes nothing (CB5B-135), every mutation goes
 *                        through a fenced function (CB5B-136), a refusal ends the
 *                        execution (CB5B-137), the certified kernel gate is always called
 *                        before any mutation (CB5B-138) — and CB5B-142 proves the
 *                        behavioural half: an ALLOW that has since lapsed permits nothing.
 *   · REPORT CONTRACT    is every claim the report makes checkable, and labelled as the
 *                        KIND of evidence it is? CB5B-139.
 *
 * TWO KINDS OF EVIDENCE, DELIBERATELY SEPARATED
 *   createHardeningChecks   reads the shipped migration, worker and report as TEXT, and
 *                           the report also through the deployed function bodies it
 *                           asserts on. Static.
 *   hardeningBehaviouralTests  runs the SHIPPED executor/repository modules against the
 *                           in-process model of the SQL contracts, so the refusals are
 *                           executed behaviour rather than prose. Simulated — real
 *                           PostgreSQL evidence lives only in
 *                           scripts/cb005bConcurrency.pg.test.cjs.
 */

/**
 * The static half. `ok`, `live`, `bodyOf` are supplied by the harness so these checks
 * read the same sources, with the same comment stripping, as every other group.
 */
function createHardeningChecks({ ok, live, bodyOf }) {
  const asCode = (t) => String(t || '')
    .replace(/\/\*([^*]|\*[^/])*\*\//g, ' ')
    .replace(/(^|[^-])--[^\n]*/gm, '$1');

  function checkLockDoctrineAndPosture(src) {
    const renew = bodyOf(src.mig, 'provider_sync_job_renew_lease');
    const authorize = bodyOf(src.mig, 'provider_sync_job_authorize');
    const mig = live(src.mig);

    // 1 · THE RENEWAL CANNOT BE SERVED ON STALE TIME. The lock is taken first, the clock
    // is read after it, and no pre-lock instant is declared at all — while the identity
    // fence, the live-lease test, the deadline test and the 100-renewal budget survive
    // as its predicate, so the correction did not buy freshness by dropping a refusal.
    ok('CB5B-131', /for update;/.test(renew)
      && renew.indexOf('v_now := clock_timestamp();') > renew.indexOf('for update;')
      && /v_now timestamptz;/.test(renew) && !/v_now timestamptz\s*:=/.test(renew)
      && /j\.lease_expires_at > v_now/.test(renew)
      && /v_now < j\.attempt_started_at \+ make_interval\(secs => j\.max_attempt_seconds\)/.test(renew)
      && /j\.lease_renewal_count < 100/.test(renew)
      && /j\.attempt_id = p_attempt_id/.test(renew) && /j\.lease_id = p_lease_id/.test(renew)
      && /j\.claimed_by = p_worker_id/.test(renew),
      'the renewal must TAKE THE ROW LOCK FIRST, read the wall clock only after it, and declare no pre-lock instant — while keeping the identity fence, the live-lease test, the absolute-deadline test and the 100-renewal budget as its predicate');

    // 2 · THE INSTALL POSTURE IS SINGLE-USE AND FAIL-CLOSED.
    const guard = mig.indexOf('SINGLE-USE MIGRATION REFUSED');
    const firstDdl = mig.indexOf('create table if not exists public.provider_sync_jobs');
    ok('CB5B-132', guard > -1 && firstDdl > -1 && guard < firstDdl
      && /if v_existing is not null then/.test(mig)
      && mig.indexOf('do $$') > -1 && mig.indexOf('do $$') < firstDdl,
      `the migration must REFUSE a non-pristine schema with an exception BEFORE its first DDL (guard@${guard}, first_ddl@${firstDdl}) — a second run must fail closed, never meet an existing shape in silence`);

    ok('CB5B-133', !/drop\s+(table|policy|function|index|schema|trigger|type)\b|\btruncate\b/i.test(mig),
      'no destructive statement may exist anywhere in the migration: repeatability is not bought with DROP, and a policy is never re-created over the one it replaces');

    // 3 · THE PREFLIGHT CHANGES NOTHING, and names all three postures. The keyword test
    // deliberately excludes a bare "do": the word occurs in the verdict TEXT this file
    // prints ("do not install"), and flagging prose would make the check about wording
    // rather than about writes. A plpgsql DO block is matched as the construct it is.
    const preflight = String(src.preflight || '');
    ok('CB5B-134', preflight.length > 0
      && !/\b(insert|update|delete|grant|revoke|alter|drop|create|truncate|call)\b/i.test(asCode(preflight))
      && !/\bdo\s+\$/i.test(preflight)
      && preflight.indexOf('PRISTINE') > -1
      && preflight.indexOf('PARTIALLY_INSTALLED') > -1
      && preflight.indexOf('ALREADY_INSTALLED') > -1
      && /pg_attribute/.test(preflight) && /pg_constraint/.test(preflight) && /pg_proc/.test(preflight),
      'the preflight must exist, must change nothing at all (no DDL, no DML, no grant, no function call), and must name all three postures so an operator never has to infer them');

    // 4 · THE AUTHORIZATION BOUNDARY. authorize is a VERIFICATION: it locks nothing and
    // writes nothing, so it can never be the thing that grants execution — and every
    // refusal it can reach is named, so a stale ALLOW is legible rather than silent.
    ok('CB5B-135', !/\bfor update\b|\binsert into\b|\bupdate public\b|\bdelete from\b/i.test(asCode(authorize))
      && authorize.indexOf("'job_not_found'") > -1
      && authorize.indexOf("'claim_mismatch'") > -1
      && authorize.indexOf("'attempt_expired'") > -1
      && authorize.indexOf("'lease_expired'") > -1,
      'authorization must stay READ-ONLY (no lock, no write), so a previous success can never become standing permission, and it must name every refusal it can reach');

    // 5 · EVERY MUTATION THE WORKER MAKES GOES THROUGH A FENCED FUNCTION. The service
    // role holds SELECT only, so this is also a privilege fact — but the code must not
    // even try: no direct table write exists in the executor or the repository.
    const writePattern = /\.from\('(provider_sync_jobs|provider_sync_checkpoints|provider_observations)'\)\s*\.\s*(insert|update|delete|upsert)/;
    const rpcNames = ['provider_sync_job_claim', 'provider_sync_job_renew_lease', 'provider_sync_job_complete', 'provider_sync_observation_ingest'];
    ok('CB5B-136', !writePattern.test(src.executor) && !writePattern.test(src.repository)
      && rpcNames.every((name) => src.repository.indexOf(`callRpc(sb, '${name}'`) > -1)
      && !/\bsb\.rpc\(|\.from\(/.test(src.executor),
      'the worker must mutate ONLY through the fenced RPCs (claim · renew · complete · ingest): neither the executor nor the repository may write a table directly');

    // 6 · A LOST LEASE AND AN EXPIRED ATTEMPT ARE BOTH STOPS.
    ok('CB5B-137', /isLeaseFence\(code\) \|\| code === ATTEMPT_EXPIRED/.test(src.executor)
      && /verdict === 'LEASE_FENCED' \|\| verdict === 'ATTEMPT_EXPIRED'/.test(src.executor)
      && /if \(leaseLost \|\| deferred\) break;/.test(src.executor),
      'the executor must STOP on a lost lease AND on an expired attempt — at the page boundary and at completion — so a refusal ends the execution instead of being retried past');

    // 7 · THE CERTIFIED KERNEL GATE IS ALWAYS CALLED, AND BEFORE ANY MUTATION.
    const kernelCall = src.executor.indexOf('await authorizeProviderOperation({');
    const mutationCalls = ['renewLease(', 'ingestBatch(', 'completeJob(']
      .map((call) => src.executor.indexOf(call))
      .filter((at) => at > -1);
    ok('CB5B-138', kernelCall > -1 && mutationCalls.length === 3 && kernelCall < Math.min(...mutationCalls)
      && (src.executor.match(/await authorizeProviderOperation\(\{/g) || []).length === 1
      && /decision\.executable !== true/.test(src.executor)
      && /operation: 'sync\.execute'/.test(src.executor),
      `the certified CB-004/CB-004.2 kernel gate must be called UNCONDITIONALLY and BEFORE the first mutation (kernel@${kernelCall}, first_mutation@${mutationCalls.length ? Math.min(...mutationCalls) : 'none'}) — an allow that is never audited is not authorization`);

    // 8 · THE REPORT'S OWN CONTRACT. Every row carries its class, all three kinds of
    // evidence are present, and the EXECUTABLE rows really CALL the deployed functions:
    // a report that claimed to execute what it only described would be the failure this
    // whole file exists to prevent.
    ok('CB5B-139', /row_class\(id, class\) as \(/.test(src.verify)
      && /coalesce\(rc\.class, 'STATIC'\) as class/.test(src.verify)
      && /left join row_class rc on rc\.id = report\.id/.test(src.verify)
      && /'CATALOG'/.test(src.verify) && /'EXECUTABLE'/.test(src.verify) && /'STATIC'/.test(src.verify)
      && (src.verify.split('public.provider_sync_job_authorize(').length - 1) >= 1
      && (src.verify.split('public.provider_sync_job_renew_lease(').length - 1) >= 1
      && (src.verify.split('public.provider_sync_job_complete(').length - 1) >= 1
      && (src.verify.split('public.provider_sync_job_claim(').length - 1) >= 1
      && (src.verify.split('cb005b-verification-probe').length - 1) >= 3,
      'the report must label every row (CATALOG · EXECUTABLE · STATIC) and its EXECUTABLE rows must actually CALL the deployed functions, rather than assert text about them');
  }

  return { checkLockDoctrineAndPosture };
}

/**
 * The behavioural half: the SHIPPED repository and executor against the model.
 * `R`, `build`, `t` and `draft` are supplied by runBehavioural, so these tests run
 * against exactly the fixtures and the state predicate every other block uses.
 */
async function hardeningBehaviouralTests({ R, build, t, draft }) {
  // ── A RENEWAL OUTLIVED BY ITS OWN WAIT (the stale-time defect) ───────────
  // The two worlds below differ in exactly ONE thing: whether the call was SERVED when
  // it arrived, or after a wait during which its lease lapsed. The pair therefore
  // distinguishes the correction from the defect it removes rather than asserting it:
  // a pre-lock reading would grant the second renewal, which IS the defect.
  const claimThirtySeconds = async () => {
    const w = build({ maxAttemptSeconds: 600 });
    const granted = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 30 }))[0];
    return { w, granted };
  };
  const renewOf = (world) => R.repository.renewLease(world.w.sb, {
    jobId: world.granted.id,
    attemptId: world.granted.attempt_id,
    leaseId: world.granted.lease_id,
    workerId: 'worker-A',
    leaseSeconds: 180,
  });

  {
    // SERVED ON ARRIVAL — the control. The lease is live, so the renewal is granted.
    const onArrival = await claimThirtySeconds();
    const grantedNow = await renewOf(onArrival);
    t('CB5B-140', grantedNow === true,
      `a renewal SERVED while its lease is live must be granted (got ${grantedNow}) — the control for the differential below`);

    // SERVED AFTER A WAIT — the correction. Identical in every other respect.
    const afterWait = await claimThirtySeconds();
    const renewalsBefore = afterWait.w.job().lease_renewal_count;
    const leaseBefore = afterWait.w.job().lease_expires_at;
    afterWait.w.tick(31000);
    const grantedLate = await renewOf(afterWait);
    t('CB5B-141', grantedLate === false
      && afterWait.w.job().lease_renewal_count === renewalsBefore
      && afterWait.w.job().lease_expires_at === leaseBefore,
      `a renewal SERVED after its lease lapsed must be REFUSED and change nothing (renewed=${grantedLate}, renewals=${afterWait.w.job().lease_renewal_count}, lease=${afterWait.w.job().lease_expires_at === leaseBefore ? 'unchanged' : 'MODIFIED'}) — the same call is granted above, so only the POST-WAIT reading refuses it`);
  }

  // ── A PREVIOUS ALLOW IS NOT PERMISSION ───────────────────────────────────
  // Authorization that verified a LIVE claim must permit nothing once the lease lapses:
  // every mutation fences again, independently, and the job is left exactly as it was.
  {
    const w = build({ maxAttemptSeconds: 600 });
    const granted = (await R.repository.claimJobs(w.sb, { workerId: 'worker-A', limit: 5, leaseSeconds: 30 }))[0];
    const live = await R.repository.authorizeClaim(w.sb, {
      jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A',
    });
    w.tick(31000);
    const afterLoss = await R.repository.authorizeClaim(w.sb, {
      jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A',
    });
    const renewed = await R.repository.renewLease(w.sb, {
      jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A', leaseSeconds: 180,
    });
    let ingestCode = null;
    try {
      await R.repository.ingestBatch(w.sb, {
        jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A',
        observations: [draft(1)],
        checkpoint: { scope: 'transactions', cursor_kind: 'ordered', expected_version: 0, cursor_ordinal: 100 },
      });
    } catch (e) { ingestCode = e.code; }
    const verdict = await R.repository.completeJob(w.sb, {
      jobId: granted.id, attemptId: granted.attempt_id, leaseId: granted.lease_id, workerId: 'worker-A', outcome: 'completed',
    });
    t('CB5B-142', live.verified === true && afterLoss.verified === false && afterLoss.claim_state === 'lease_expired'
      && renewed === false && ingestCode === 'LEASE_FENCED' && verdict === 'LEASE_FENCED'
      && w.job().status === 'claimed',
      `a verified claim must not survive its lease: live=${live.verified}, after=${afterLoss.claim_state}, renew=${renewed}, ingest=${ingestCode}, complete=${verdict}, status=${w.job().status}`);
  }
}

module.exports = { createHardeningChecks, hardeningBehaviouralTests };