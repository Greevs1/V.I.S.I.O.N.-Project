# V.I.S.I.O.N. — S4 Gate B · Deliverable 7A
# PROPOSED SQL PATCH — B14 Population Reconciliation (Design B)

> # ⛔ SUPERSEDED — DO NOT IMPLEMENT
>
> **This is Revision 1 of the B14 patch, retained unaltered as historical evidence. It is not the proposal.**
>
> **The current authoritative PROPOSED patch is `VISION_S4_GATE_B_07A_R2_B14_PROPOSED_PATCH.md` (Revision 2, Design B).** Read that file instead. This one is kept only so the review trail remains intact: the defects it contains were found by reading it, and deleting it would delete the evidence.
>
> **Two defects in the text below, recorded here so a reader cannot act on them:**
> 1. **The guard cannot fire.** Its predicate reads `v_contributor_count`, which the function first assigns *after* the insertion point — the comparison evaluates to `NULL`, and `IF NULL` takes the false branch. The check is inert.
> 2. **The guard is bypassable.** Its right-hand side contains a caller-supplied count, so a caller can satisfy it while omitting an eligible field.
>
> **Everything in the body below is left exactly as Revision 1 wrote it, including its V-16 text (no `NULL` arm) and its "24 → 25" inventory figure (two short; the correct arithmetic is 26 → 27).** Those are history. Do not correct them here, and do not read them as current.
>
> **Revision 2 remains NOT AUTHORIZED, NOT APPLIED, and separate from D2.**

> ## ⚠️ PROPOSED · NOT APPLIED · NOT AUTHORIZED · NOT PART OF D2
>
> This file is **not** the migration. It is a proposed patch, written for review only.
> **It must not be executed standalone, pasted into the SQL editor, appended to D2, or treated as an inventory of S4 objects.**
> `VISION_S4_GATE_B_02_SQL_MIGRATION.md` remains the single authoritative executable migration and is **byte-identical** to the version the review read.
> Applying this requires: separate written authorization · D2 edited by its owner · re-authorization of the migration version · the error-code inventory restated (24 → 25) · D4 §6's interface check restated · a decision recorded in the plan's **B14** row.
>
> Companion: `VISION_S4_GATE_B_07_B14_INTEGRITY_REVIEW.md` (the review that produced this patch).
>
> **No transaction-control statement appears below.** The function contributes none; the transaction is the runner's (plan §9.1), and this patch is written to be correct under both READ COMMITTED and REPEATABLE READ.

---

## 1. What changes, and what deliberately does not

| | |
|---|---|
| **Replaces** | D6 §0A.3's count comparison (`v_population <> v_contributor_count + jsonb_array_length(p_skipped)`) — which, at its stated insertion point, reads an unassigned variable and would never raise (review §0) |
| **With** | A single-statement **set** reconciliation: eligible ids `EXCEPT` sent ids, and sent ids `EXCEPT` eligible ids |
| **Signature** | **Unchanged — all 11 parameters, same order, same types, same return shape.** `p_skipped` already carries the ids, so no new parameter is needed and none is proposed |
| **New DDL objects** | **None.** One new error code, no table, column, index, policy or grant |
| **Touched tables** | `public.extracted_fields` — **read only**, inside the caller's transaction. `business_metric_snapshots`, `snapshot_submission_audit`, `dashboard_metrics` unchanged |
| **Financial records** | No DML against any existing row; the insert path and content hash are untouched |
| **CB-005A / CB-005B / provider tables** | Untouched, unread |
| **Insertion point** | **D2 §3, after step 7 (contributor + confidence) and before step 8 (derived fields)** — *not* step 1.1: `v_contributor_ids` is first assigned at step 7 (D2 line 541) and `v_contributor_count` at line 572 |

## 2. Companion validation rule (required — V-16)

The reconciliation casts `p_skipped[].field` to `uuid`. Today **V-12 only requires a non-empty string**, so the cast would be reachable from unvalidated input — the exact defect V-1…V-15 exist to remove.

**Add to D2 §3 step 1.1 / §3.2, beside V-8 (which already does this for `field_ids`):**

| Rule | Condition | Error | Errclass |
|---|---|---|---|
| **V-16** | every `p_skipped[].field` matches the canonical uuid pattern V-8 already enforces for `field_ids` | `SNAPSHOT_INVALID_SKIPPED: field is not a canonical uuid` | `22023` |

This is a **validation-rule addition, not a contract change**: no legitimate caller can currently rely on sending a non-uuid `field`, because nothing downstream ever resolved it against a table.

## 3. The patch

### 3.1 Declarations — add to the `declare` block (D2 lines 170–197)

```sql
  v_skipped_ids       uuid[];
  v_unmapped          uuid[];   -- eligible rows the call never sent
  v_unsent            uuid[];   -- sent rows that are not eligible rows of this document
```

### 3.2 The reconciliation — insert as **step 7A**, after step 7, before step 8

```sql
  -- ── 7A. POPULATION RECONCILIATION — PROPOSED (B14, Design B). NOT APPLIED. ──
  -- Every eligible accepted/corrected field of THIS document and business must appear in
  -- exactly one role: a contributor (already verified at step 6) or a skipped entry.
  -- Nothing here trusts a caller-supplied COUNT: the caller's claims are checked AGAINST the
  -- database population, never added to it.
  --
  -- ONE statement ⇒ one snapshot ⇒ the two sides are the same population even under
  -- READ COMMITTED, where every other read in this function sees a different one.

  select coalesce(array_agg((s->>'field')::uuid), '{}'::uuid[])
    into v_skipped_ids
    from jsonb_array_elements(coalesce(p_skipped, '[]'::jsonb)) s;
    -- cast is safe: V-16 proved every element canonical, V-15 proved them distinct

  -- An id that is both mapped and skipped is contradictory, and a set union would hide it.
  if v_skipped_ids && v_contributor_ids then
    raise exception 'SNAPSHOT_POPULATION_INCOMPLETE: a field is both mapped and skipped'
      using errcode = '22023';
  end if;

  with eligible as (
    select f.id
      from public.extracted_fields f
     where f.document_id = p_source_document_id
       and f.business_id = p_business_id
       and f.review_status in ('accepted', 'corrected')
  ), sent as (
    select unnest(v_contributor_ids || v_skipped_ids) as id
  ), difference as (
    select 'unmapped' as kind, id from (select id from eligible except select id from sent)  m
    union all
    select 'unsent'   as kind, id from (select id from sent     except select id from eligible) s
  )
  select array_agg(id) filter (where kind = 'unmapped'),
         array_agg(id) filter (where kind = 'unsent')
    into v_unmapped, v_unsent
    from difference;

  if v_unmapped is not null or v_unsent is not null then
    -- Fail closed, name the shape of the failure, never the caller's framing of it.
    raise exception
      'SNAPSHOT_POPULATION_INCOMPLETE: % eligible field(s) not mapped or skipped, % field(s) named that are not eligible',
      coalesce(cardinality(v_unmapped), 0), coalesce(cardinality(v_unsent), 0)
      using errcode = '22023';
  end if;
```

### 3.3 Why this placement, and what must stay where it is

| Constraint | Reason |
|---|---|
| **After step 7** | `v_contributor_ids` (line 541) and `v_contributor_count` (line 572) do not exist earlier. D6 §0A.3's placement would have compared against `NULL` and never fired |
| **Before step 8** | The reconciliation must be able to refuse *before* any hash is computed, so a refused call leaves no partial artefact and no hash is ever derived from an incomplete population |
| **Before step 10** (advisory lock + dedupe lookup) | Dedupe must never bypass the guard. A repeat submission is still reconciled; identical content then dedupes as today |
| **Inside the same transaction** | Otherwise the population is read outside the write and the guarantee collapses to the caller's claim |
| **No `FOR UPDATE` / `FOR SHARE`, no isolation statement** | Deliberate. Row locks on `extracted_fields` would contend with every application review flow; isolation is the runner's and cannot be set from inside the function. The residual is **named** (§5), not papered over |

## 4. Behaviour changes this patch would introduce

| Case | Today | With this patch |
|---|---|---|
| Complete call (D6 §4's caller) | succeeds | **succeeds, unchanged** — `p_skipped` already carries every unconsumed row, including uncontracted names |
| Caller truncates its read and does not pad `p_skipped` | **silently partial snapshot** | refused, `SNAPSHOT_POPULATION_INCOMPLETE`, 409 |
| Caller truncates and pads `p_skipped` with foreign / pending / nonexistent / duplicate-role ids | accepted (count matched) | **refused** — the padding ids are not eligible rows, or overlap a contributor |
| Legitimate caller that omits an eligible field and forgets it in `p_skipped` | accepted | **refused** — this is the intended tightening; it is a behavioural change for any caller that sends partial sets by design |
| >1000 uncontracted accepted fields | 500 (`V-10` cap) | unchanged — still a hard ceiling, fail-closed |

**Error-code inventory:** **one** new code, `SNAPSHOT_POPULATION_INCOMPLETE` (mapped to **409**), covering both the unmapped/unsent difference and the overlap case via a distinct message. Inventory moves **24 → 25**, exactly as D6 §0A.3 estimated — the overlap rule does **not** add a second code. *(A separate `SNAPSHOT_SKIPPED_OVERLAP` code is defensible for test legibility but would cost a second interface entry and a second `RPC_ERROR_STATUS` mapping; not recommended.)*

## 5. What this patch does NOT guarantee — named residual

| Residual | Why it cannot be closed here | Where it is recorded |
|---|---|---|
| A field whose `review_status` changes **after** the reconciliation statement but **before** `COMMIT` | Closing it needs row locks on `extracted_fields` **and** a defence against phantom inserts (statement-level lock or `SERIALIZABLE`). Both are locking-policy changes on a shared table | review **S4/S5**, proposed test **T-910** |
| A field **inserted** after the reconciliation statement | Same; a predicate lock would serialize application writes to a table the review flows own | review **S5** |
| The **reason** on a skipped entry | Reasons are declared metadata, not an adjudicated fact. The *membership* of skips is now database-verified; the *why* is not and must never be presented as such | review **S7/S9** |
| `review_status` mutated by a **trigger** on an unrelated write | **NOT VERIFIED** — no trigger inventory exists in this package (review assumption 3) | review §5 |

**Permitted claim after adoption:** *every eligible accepted/corrected field of the document is either mapped into the contracted provenance or explicitly skipped, as judged by the database at one statement's snapshot inside the writing transaction.*
**Forbidden claim:** *the population is guaranteed complete at commit time.* That requires Design C plus locking.

## 6. Non-goals — explicitly out of this patch

- **Not Design C.** The RPC does not select fields, resolve `cardinality`, choose "latest reviewed per name", order ties, or decide `op`. That logic stays in the caller and in `s4_mapping_contract`. Re-implementing it in SQL would create a second mapping engine beside the one Revision 7 just stabilised.
- **Not a hash change.** `v_content_hash`'s inputs are untouched; no population digest is added (flagged optional in review S10, not recommended).
- **Not a lock change.** No `FOR UPDATE`, `FOR SHARE`, or isolation statement.
- **Not a signature change.** 11 parameters in, same shape out.
- **Not an index.** No new object, so plan §5.1/P5 expectations for columns, indexes, RLS, policies and grants are unchanged by adoption — only the function body and the error inventory move.
- **Not applied, not merged, not executed.** Nothing in this file has been run against any database.

## 7. Adoption checklist (for whoever is authorized later — not this review)

1. Written authorization for a **second** D2 revision.
2. D2 edited in place by its owner: declare block, step 7A, V-16, §3.2 rule table, §3.3 error inventory.
3. D4 §6 interface check restated at **25**.
4. D3: **T-907…T-911** registered and the counts reconciled (101 → 106; 79 → 84 executable) — *not done by this review*.
5. D6 §0A.3 rewritten to point at this patch and to withdraw the never-firing count comparison.
6. Plan **B14** row updated from *"awaiting authorization"* to *"adopted as Design B"*; **B13** acknowledgement still required independently.
7. Re-run the pre-apply probes; **C-1…C-9** recorded **before** P3.
8. Apply in **one** DDL pass. A patch applied after objects already exist is a second pass over live objects — the reason the plan refuses to split migration versions.

---

**Nothing here is executed, certified, or authorized. D2 is unedited. No project was contacted.**