# V.I.S.I.O.N. — S4 Gate B · Deliverable 7A · **Revision 2**
# PROPOSED SQL PATCH — B14 Population Reconciliation (Design B)

> ## ⚠️ PROPOSED · NOT APPLIED · NOT AUTHORIZED · NOT PART OF D2
>
> This file **supersedes `VISION_S4_GATE_B_07A_B14_PROPOSED_PATCH.md` (Revision 1)**, which is retained unedited as the review history. Nothing in either file has been executed.
>
> It is **not** the migration. It must not be executed standalone, pasted into the SQL editor, appended to D2, or treated as an inventory of S4 objects. `VISION_S4_GATE_B_02_SQL_MIGRATION.md` remains the single authoritative executable migration and is **byte-identical** (MD5 `93caa480de80ec621b4204bcbed898a9`, 71,434 bytes, 1,151 lines) to the version this revision read.
>
> **What Revision 2 adds:** an exact PL/pgSQL V-16 rule with a NULL-predicate-proof predicate (finding 1) · the eligible-versus-contracted distinction, which is why Design B is a *partition* and not a mapping-completeness rule (finding 2) · the caller-side error-mapping hunks B14 needs to be legible (finding 3) · four deterministic concurrency fixtures driven by the function's own advisory lock (finding 4) · a re-validated integration diff with real D2 anchors (finding 5) · a corrected error-code inventory (**26 → 27**, not 24 → 25) (finding 3).
>
> **No transaction-control statement appears below.** The function contributes none; the transaction is the runner's (plan §9.1), and this patch is written to be correct under READ COMMITTED and REPEATABLE READ.

---

## 1. What changes, and what deliberately does not

| | |
|---|---|
| **Replaces** | D6 §0A.3's count comparison (`v_population <> v_contributor_count + coalesce(jsonb_array_length(p_skipped),0)`) — which reads an unassigned variable at its stated insertion point and would never fire (D7 §0) |
| **With** | One **set** reconciliation: eligible ids `EXCEPT` sent ids, and sent ids `EXCEPT` eligible ids, in a **single statement**; plus an overlap refusal; plus V-16 |
| **Signature** | **Unchanged — 11 parameters**, same names, same order, same types, same return shape. No new parameter |
| **New DDL objects** | **None.** One new error code; no table, column, index, policy or grant |
| **Touched tables** | `public.extracted_fields` — **read only**, inside the caller's transaction. `business_metric_snapshots`, `snapshot_submission_audit`, `dashboard_metrics` unchanged |
| **Insertion point** | D2 §3 **step 7A** — after step 7 (line 585) and before step 8 (line 587). *Not* step 1.1: `v_contributor_ids` is first assigned at line 541 and `v_contributor_count` at line 572 |
| **Hash / dedupe** | No new hash input, so identical-content retries keep the same hash. 7A sits **before** step 10's advisory lock and dedupe lookup, or dedupe would bypass it |
| **Supersedes in R1** | R1's V-16 text (it lacked the NULL arm), R1's "24 → 25" inventory figure, R1's four-line declaration block (was three), R1's hand-waved T-910 |

**Guarantee this patch buys, stated exactly:** every eligible accepted/corrected field of the document is either a contributor or a skipped entry, **as judged by the database at one statement's snapshot inside the writing transaction**. It is not a guarantee about the population at `COMMIT`.

---

## 2. The integration diff — exact hunks, real anchors

Line numbers are D2's own (1,151-line file). Each hunk shows the surrounding real text so it can be located without trusting the anchor.

### H1 — declarations · after line 190 (`v_scored_count integer;`)

```sql
  v_contributor_ids   uuid[];          -- line 188
  v_contributor_count integer;         -- line 189
  v_scored_count      integer;         -- line 190
  v_skipped_ids       uuid[];          -- NEW (H1)
  v_unmapped          uuid[];          -- NEW: eligible rows the call never sent
  v_unsent            uuid[];          -- NEW: sent rows that are not eligible rows of this document
  v_confidence        numeric;         -- line 191
```

No `v_population` is declared: Design B does not count, so the variable D6 §0A.3 relied on is not introduced at all.

### H2 — V-16 · inside `if p_skipped is not null then`, **after** the V-15 statement, before `end if;` (D2 lines 345–349)

```sql
    if (select count(*) from jsonb_array_elements(p_skipped) s) <>          -- V-15, line 345
       (select count(distinct s->>'field') from jsonb_array_elements(p_skipped) s) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: duplicate field entry' using errcode = '22023';
    end if;                                                                 -- line 348

    -- ── V-16 (PROPOSED, B14 companion) — CANONICAL UUID FORMAT ──────────────
    -- Same pattern V-8 already enforces for `field_ids`, applied to p_skipped[].field so the
    -- cast at step 7A is never reachable from unvalidated input. V-13 has already proved every
    -- `field` is a non-empty string of length 1..128; this refuses the 36-character non-uuid
    -- that V-13 admits.
    --
    -- THE `is null` ARM IS NOT DECORATION. `s->>'field'` yields SQL NULL for an absent or
    -- non-string value, and `length(NULL) <> 36` / `NULL !~ pattern` are NULL, so a row with
    -- such a value would not be returned and this guard would pass in silence — the
    -- NULL-predicate class D7 §0 found in the count proposal. V-13 makes the arm unreachable
    -- today; it makes V-16 incapable of a silent pass if a later edit moves it above V-13.
    -- (V-8 has the same latent NULL, masked there by V-7. V-16 is written so it needs no mask.)
    if exists (
      select 1 from jsonb_array_elements(p_skipped) s
       where s->>'field' is null
          or length(s->>'field') <> 36
          or (s->>'field') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) then
      raise exception 'SNAPSHOT_INVALID_SKIPPED: field is not a canonical uuid'
        using errcode = '22023';
    end if;
  end if;                                                                   -- line 349
```

**Why last, not between V-13 and V-14:** V-16 depends only on V-13, so any position after V-13 is behaviourally identical for a well-formed caller. Placing it last leaves **every existing rule's number, statement order and verdict unchanged**, which matters because D4 §6 counts the rule set and T-315 enumerates the p_skipped cases by shape. Stated precedence: a payload that is simultaneously duplicate-named and malformed returns the **V-15** verdict — consistent with D2 §3.2's existing "precedence shift, stated rather than hidden" convention.

**Error choice:** reuses the already-inventoried `SNAPSHOT_INVALID_SKIPPED`, so V-16 adds **no** code and **no** mapping entry. A separate `SNAPSHOT_INVALID_SKIPPED_UUID` is defensible for test legibility and was rejected for the same reason R1 rejected a separate overlap code: one inventory entry, one `RPC_ERROR_STATUS` row, one thing to keep in parity.

### H3 — step 7A · between line 585 (`end if;` closing step 7) and line 587 (`-- ── 8. DERIVED FIELDS`)

```sql
    v_confidence_stored := null;
  end if;                                                                   -- line 585

  -- ── 7A. POPULATION RECONCILIATION — PROPOSED (B14, Design B). NOT APPLIED. ──
  -- Every ELIGIBLE accepted/corrected field of THIS document and business must appear in
  -- exactly one role: a contributor (already verified at step 6) or a skipped entry.
  -- Nothing here trusts a caller-supplied COUNT — the claims are checked AGAINST the
  -- database population, never added to it.
  --
  -- ONE statement below produces both differences, so both sides come from the same
  -- snapshot even under READ COMMITTED, where every other read in this function sees a
  -- different one. The two preparatory statements each read ONE source only.

  -- (a) The skip ids, cast once. Safe: V-13 proved every `field` a non-empty string,
  --     V-16 proved every one canonical, V-15 proved them distinct.
  select coalesce(array_agg((s->>'field')::uuid), '{}'::uuid[])
    into v_skipped_ids
    from jsonb_array_elements(coalesce(p_skipped, '[]'::jsonb)) s;

  -- (b) An id that is both mapped and skipped is contradictory, and a set union would
  --     silently absorb it (D7 S3). Both operands are non-null by construction:
  --     v_skipped_ids is coalesced to '{}' and v_contributor_ids was proved non-empty at
  --     line 545, so `&&` is two-valued and cannot pass by NULL.
  if v_skipped_ids && v_contributor_ids then
    raise exception 'SNAPSHOT_POPULATION_INCOMPLETE: a field is both mapped and skipped'
      using errcode = '22023';
  end if;

  -- (c) THE RECONCILIATION — one statement, one snapshot.
  with eligible as (
    select f.id
      from public.extracted_fields f
     where f.document_id = p_source_document_id
       and f.business_id = p_business_id
       and f.review_status in ('accepted','corrected')
  ), sent as (
    select unnest(v_contributor_ids || v_skipped_ids) as id
  ), difference as (
    select 'unmapped' as kind, d.id
      from (select id from eligible except select id from sent) d
     union all
    select 'unsent'   as kind, d.id
      from (select id from sent     except select id from eligible) d
  )
  select array_agg(id) filter (where kind = 'unmapped'),
         array_agg(id) filter (where kind = 'unsent')
    into v_unmapped, v_unsent
    from difference;

  if v_unmapped is not null or v_unsent is not null then
    -- Fail closed, name the SHAPE of the failure, never the caller's framing of it.
    raise exception
      'SNAPSHOT_POPULATION_INCOMPLETE: % eligible field(s) not mapped or skipped, % field(s) named that are not eligible',
      coalesce(cardinality(v_unmapped), 0), coalesce(cardinality(v_unsent), 0)
      using errcode = '22023';
  end if;

  -- ── 8. DERIVED FIELDS — resolved BEFORE hashing, because they are part of it ──
  v_snapshot_date := make_date(v_doc_year, 12, 31);            -- line 588
```

### H4 — function comment · D2 line 797

The comment is prose that enumerates the guards; leaving it silent about 7A would be a control described everywhere except where the function describes itself.

```sql
p_field_map and p_skipped are validated fail-closed before any financial processing (object type,
allowed keys only, uuid formatting, array structure, op vocabulary); no cast is reachable from
unvalidated input. Every eligible accepted/corrected field of the document must be accounted for as
a contributor or as a skipped entry, reconciled in one statement inside this transaction.
```

### H5 — §3.2 rule table · after the V-15 row (D2 line 970)

| # | Check | Rule | Error | Statement order |
|---|---|---|---|---|
| **V-16** | `p_skipped[].field` is a **canonical uuid** | 36 chars, same pattern as V-8, `is null` arm included | `SNAPSHOT_INVALID_SKIPPED` | 15 |

### H6 — §3.2 prose · D2 line 975

> These are fourteen separate statements …

becomes

> These are **fifteen** separate statements …

### H7 — nothing else in D2

No change to V-1…V-15, step 5's duplicate checks, step 6's contributor verification, step 7's drift guard, the hash, the insert, the promotion path, step 12, step 13, the ACL block or the transaction guard.

---

## 3. Validation of the diff against the surrounding SQL

| Check | Result |
|---|---|
| **`v_contributor_ids` is initialised before 7A** | Yes — line 541 `select array_agg(distinct c::uuid) into v_contributor_ids …`; line 545 refuses `null` / empty as `SNAPSHOT_NO_CONTRIBUTORS`. At 7A it is a non-empty `uuid[]`, so `\|\|` and `&&` are two-valued |
| **Existing duplicate-id checks are not weakened** | **`SNAPSHOT_DUPLICATE_FIELD`** (line 444) still adjudicates a field id on two targets, and **V-15** (line 345) a repeated `field`. 7A's `sent` therefore receives distinct ids from both sides, so `EXCEPT` cannot be confused by an internal duplicate; the overlap rule is the only cross-role collision, and it is explicit |
| **`EXCEPT` semantics** | Both `EXCEPT` arms are duplicate-eliminating and operate on unique-by-construction inputs. `array_agg(...) filter (...)` returns SQL NULL for a kind with no rows, which is exactly what the `is not null` test reads — no empty-array-vs-NULL ambiguity |
| **NULL-predicate discipline (D7 §0)** | Every predicate in 7A and V-16 is written so it cannot evaluate to NULL: `is null` arm in V-16; `coalesce(..., '{}')` in (a); `&&` over two proven non-null arrays in (b); `is not null` (not `<>`) in (c) |
| **Does 7A's `unsent` direction duplicate step 6?** | Mostly, and that must be said rather than sold. Step 6 already proves every **contributor** is an eligible row of this document/business. So `sent except eligible` can only be non-empty because (i) a `p_skipped` id is not eligible here, or (ii) **a contributor's status or tenant changed between step 6 and 7A**. It is a safety net for contributors, not new provenance verification — and it is the only mechanism that catches the skip list |
| **Consequence for concurrency, stated plainly** | A status flip that lands **before** 7A is now refused (it was previously invisible). A flip **after** 7A remains the named residual. B14 narrows the window; it does not close it |
| **Worked example — T-811 (5 mapped + 1 uncontracted skipped)** | eligible = 6, contributors = 5, skipped = 1, disjoint, union = 6 ⇒ **passes** |
| **Worked example — T-801 Variant B (3 `annual_revenue` rows, latest mapped)** | eligible = 3, contributors = 1, skipped = 2 (the superseded rows), disjoint, union = 3 ⇒ **passes**. **This is the case a mapping-completeness rule would break** — see D7B P-1 |
| **Dedupe / hash** | 7A precedes step 9's hash and step 10's lookup; it can only raise. A refused call derives no hash and writes nothing. An identical repeat still reconciles first, then dedupes as today |
| **Isolation** | No `SET TRANSACTION`, no `FOR UPDATE`, no `FOR SHARE`. Correct under READ COMMITTED (one statement) and REPEATABLE READ (already consistent) |
| **Signature / ACL** | Unchanged, so D2 §3's `revoke`/`grant`, the ACL guard's six function expectations and the `regprocedure` literals are all untouched |

---

## 4. Companion caller changes — proposed, **not applied** (D6 §4)

These are the only edits outside D2 that B14 needs in order to be legible to a caller. They are supplied as hunks; **D6 is not edited by this revision.**

### C-1 · `RPC_ERROR_STATUS` — one entry

```ts
  SNAPSHOT_NO_CONTRIBUTORS: 400,
  // POPULATION CLOSURE (B14). A data condition, not a code fault and not a caller-shape
  // fault: the eligible population moved, or the skip list named rows that are not
  // eligible. Recoverable by reloading, exactly like FIELD_NOT_CONTRACTED.
  SNAPSHOT_POPULATION_INCOMPLETE: 409,
```

### C-2 · `RPC_ERROR_MESSAGES` — one entry (required, not optional)

`mapRpcError` returns `RPC_ERROR_MESSAGES[code] || 'Request rejected'` for any status < 500. Without this entry the new 409 would reach the user as the literal string **"Request rejected"**.

```ts
  SNAPSHOT_POPULATION_INCOMPLETE:
    'The reviewed fields changed while this snapshot was being prepared. Reload and try again.',
```

### C-3 · matcher safety note — no code change

`mapRpcError` finds a code with `Object.keys(RPC_ERROR_STATUS).find(k => text.includes(k))`, i.e. **substring** matching in **key order**. Verified against all 27 names: no existing key is a substring of another, and the new name contains no existing name, so the matcher is unambiguous today. The latent hazard is future-facing and must be written down where the map is declared: **a new code name must not contain an existing code name**, or the older key wins and the response is mis-mapped.

### C-4 · what does **not** need to change

- `resultFault`'s `skipped` validation (`typeof entry.field === 'string'`) — the echo is the request echoed back, and the request has passed V-16, so it is a uuid; tightening this to `UUID_PATTERN` is a cosmetic improvement, not a requirement, and is **not** proposed here.
- `MAX_SKIPPED = 1000` and the 4a–4e count-closure read — unchanged and still necessary; B14 is the transaction-side guarantee, not a replacement for caller-side completeness.
- The V-1…V-15 payload-shape mapping (`500`) — V-16 joins that class, for the same reason: the endpoint builds the payload, so a hit is an internal defect.

---

## 5. Behaviour changes this patch would introduce

| Case | Today | With this patch |
|---|---|---|
| Complete call (D6 §4's caller) | succeeds | **succeeds, unchanged** — `p_skipped` already carries every unconsumed row, including uncontracted names and superseded duplicates |
| Caller truncates its read and does not pad `p_skipped` | silently partial snapshot | **refused**, `SNAPSHOT_POPULATION_INCOMPLETE`, 409 |
| Caller truncates and pads `p_skipped` with foreign / pending / nonexistent / duplicate-role ids | accepted | **refused** — padded ids are not eligible rows, or overlap a contributor |
| Caller omits an eligible row and forgets it in `p_skipped` | accepted | **refused** — the intended tightening, and a behavioural change for any caller that sends partial sets by design |
| A contributor's status flips **between step 6 and 7A** | accepted, snapshot silently stale | **refused** (409) — new, and correct; the flip is now visible |
| A contributor's status flips **after 7A, before `COMMIT`** | accepted | **unchanged** — named residual (§6) |
| `p_skipped[].field` is `"not-a-uuid"` | PostgreSQL `22P02` from the step-7A cast — unnamed, unmapped, generic 500 | **refused by name**, `SNAPSHOT_INVALID_SKIPPED`, mapped 500 |
| A field is both a contributor and a skipped entry | accepted | **refused** (409), distinct message |

---

## 6. Named residual, and four deterministic fixtures

### 6.1 What is still not guaranteed

| Residual | Why it cannot close here | Recorded |
|---|---|---|
| Status change **after** 7A's statement, **before** `COMMIT` | Needs row locks on `extracted_fields` **and** a defence against phantom inserts (statement-level lock or `SERIALIZABLE`) — a locking-policy change on a table the review flows own | D7 S4/S5, T-910(a) |
| Row **inserted** after 7A's statement | Same; a predicate lock would serialize application writes | D7 S5, T-910(b) |
| The **reason** on a skipped entry | Declared metadata, not an adjudicated fact. Membership of skips is now database-verified; the *why* is not | D7 S7/S9 |

**Permitted claim after adoption:** every eligible accepted/corrected field of the document is either mapped into the contracted provenance or explicitly skipped, as judged by the database at one statement's snapshot inside the writing transaction.
**Forbidden claim:** the population is guaranteed complete at commit time.

### 6.2 How to make the concurrency window deterministic

The window is **not** attacked with sleeps or luck. It is opened deliberately by exploiting the function's own ordering: 7A runs at step 7A, and the **first** lock the function takes is `pg_advisory_xact_lock(hashtextextended('s4:snapshot:' || p_business_id::text, 0))` at **step 10**. A second session that holds the **session-level** `pg_advisory_lock` on the same key therefore pins the call in exactly the post-reconciliation, pre-write window. Session-level and transaction-level requests for the same lock id conflict, so the barrier is total.

Fixture preconditions, all runs: `set statement_timeout` and `set lock_timeout` on the calling session so a mis-sequenced run **fails loudly instead of hanging**; a synthetic business and document from the plan's registry; pre/post counts on `business_metric_snapshots`, `dashboard_metrics`, `snapshot_submission_audit`.

| Fixture | Sequence | Deterministic expectation |
|---|---|---|
| **T-910(a) — status flip in the window** | B: `select pg_advisory_lock(hashtextextended('s4:snapshot:'\|\|$biz::text,0));` · A: call the RPC with the complete mapping for population *N* · **assert from `pg_locks` that A is waiting on that advisory lock** (proves the ordering rather than hoping for it) · B: `update extracted_fields set review_status='pending' where id=$f1;` then `commit;` then `select pg_advisory_unlock(...)` · A: resumes, commits | A **succeeds** (7A saw the pre-flip population — the residual, now demonstrated rather than asserted) · the committed `metadata.provenance` still names `$f1` · a **new** call that maps `$f1` is refused `SNAPSHOT_FIELD_NOT_CONTRACTED` (409), proving the population did move and the staleness is visible on the next attempt |
| **T-910(b) — phantom insert in the window** | Same barrier · B: insert a new accepted row for the document, `commit`, unlock · A: commits | A **succeeds**; the committed provenance ids do **not** contain the new id · a subsequent call that maps only the original set is refused **`SNAPSHOT_POPULATION_INCOMPLETE`** (409) — *this last assertion is the one that proves B14 bites; without it the fixture only shows the residual* |
| **T-910(c) — insert between caller read and RPC (no concurrency needed)** | Sequential: population *N*; the caller reads and builds its map; insert row *N+1*; let the caller send the map that was complete at read time | **409 `SNAPSHOT_POPULATION_INCOMPLETE`**, zero snapshot, dashboard and audit rows. No second session, no timing: the same input gives the same verdict every run |
| **T-910(d) — net-zero change (the case D6 §0A.2 said the caller cannot close)** | Sequential: population *N*; caller count #1; **delete one accepted row and insert another**; caller count #2 — the two counts agree and `fields.length` agrees, so the caller's closure read **passes** | the RPC is **refused** (409) because the *set* differs. Deterministic, and it is the direct evidence that B14 closes what the caller's counts cannot |

**One honest caveat about T-910(a)/(b):** they depend on step 10's lock being where D2 says it is. If the lock ever moved earlier, the barrier would stop pinning the right window and the fixture would pass for the wrong reason. The `pg_locks` assertion in (a) is therefore part of the test, not a convenience.

---

## 7. Error-code inventory — corrected

**Verified by counting, not by memory:** D2 raises **26** distinct `SNAPSHOT_*` codes and D6's `RPC_ERROR_STATUS` maps **26** — the sets are identical, which is what D4 §6's row actually claims.

**D4 §6, D6 §0A.3, D6 §10 and D7A R1 all state "24 codes … becomes 25". That figure is wrong by two.** The correct arithmetic is **26 → 27**, and the one new code is `SNAPSHOT_POPULATION_INCOMPLETE`. This is a documentation correction only — no code or test depends on the number, but the number is quoted in three places as if it had been counted.

| Code | Status | Mapped |
|---|---|---|
| `SNAPSHOT_POPULATION_INCOMPLETE` | **new** — covers both the unmapped/unsent difference and the overlap, via distinct messages | **409** (C-1) |
| `SNAPSHOT_INVALID_SKIPPED` | existing; V-16 reuses it | 500 (already) |

No second new code. The overlap case deliberately shares `SNAPSHOT_POPULATION_INCOMPLETE`.

---

## 8. Non-goals — explicitly out of this patch

- **Not Design C.** 7A does not select fields, resolve `cardinality`, choose "latest reviewed per name", order ties, or decide `op`. That stays in the caller and in `s4_mapping_contract`. Re-implementing it in SQL would create a second mapping engine beside the one Revision 7 stabilised.
- **Not a mapping-completeness rule.** See D7B P-1: contract-mappable fields are *legitimately* skipped (superseded duplicates, optional targets). Enforcing that every contracted name is a contributor would break T-801 and T-811 and is a product change, not a closure.
- **Not a hash change, not a lock change, not a signature change, not an index.**
- **Not applied, not merged, not executed.** Nothing in this file has been run against any database.

---

## 9. Adoption checklist (for whoever is authorized later — not this revision)

1. Written authorization for a **second** D2 revision.
2. D2 edited in place: H1 (declare), H2 (V-16), H3 (step 7A), H4 (function comment), H5 (§3.2 row), H6 ("fifteen").
3. D6 §4 edited: C-1, C-2, and the C-3 note where the map is declared.
4. D4 §6 restated: **26 → 27**, and the stale "in D1" reference corrected to D6 (D1 §3 is withdrawn).
5. D6 §0A.3 rewritten to point at this patch and withdraw the never-firing count comparison; D6 §10's B14 row updated with the corrected inventory figure.
6. D3: register arithmetic decided (D7B P-2), then written once, in one place.
7. C1–C9 recorded, pre-apply probes re-run, B13 boundary acknowledged in writing.
8. Apply in **one** DDL pass — a patch applied after objects already exist is a second pass over live objects.

---

**Nothing here is executed, certified, or authorized. D2 is unedited. No project was contacted.**