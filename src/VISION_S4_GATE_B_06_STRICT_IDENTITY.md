# S4 Gate B · DELIVERABLE 6 — Strict Canonical Identity (B9 / B10 closure proposal)

**Revision 7** — four independent review findings (R7-1…R7-4) and one environment correction. §0A is the register; §9.3 is the change record. Nothing built, nothing run, nothing deployed.

## PROPOSAL — **NOT DEPLOYED · NOT BUILT · NOT EXECUTED** · Gate B NOT AUTHORIZED

**Mode of this turn:** source inspection and proposed code only. No SQL executed, no Supabase project touched, no Base44 function written or deployed, no test run, no claim of runtime validation. The deployed function file is **unmodified**.

**What this deliverable is.** The proposed replacement for the snapshot caller's authentication and authorization layer, plus the consumer inventory and the document reconciliation that the strict policy requires. It closes **B10** by decision and presents the remediation that closes **B9** — but only as text, because closing B9 requires a deployment this turn is not authorized to make.

**Three findings worth reading first:**

| # | Finding | Where |
|---|---|---|
| **F-1** | **D1 and D2 disagreed, and the disagreement was fatal.** D1's proposed caller sends `p_skipped` entries as `{ field_id, reason }`. D2 §3 step 1.1 (V-12) permits **only** `{ field, reason }`. Deployed as written, **every snapshot with at least one unconsumed field** would have failed with `SNAPSHOT_INVALID_SKIPPED`. Found by reading both artifacts against each other; fixed in §4.2 | §4.2, §8 |
| **F-2** | **The shared resolver masks duplicate bindings.** `authenticateActor` resolves the id branch with `.maybeSingle()`; with two rows carrying the same `base44_user_id`, PostgREST answers *multiple rows* as an error with a null body, so the id branch yields nothing and the **email fallback then decides**. A duplicate binding is therefore not merely unhandled — it is hidden, and the profile that wins depends on which row the email pattern matches. This is the strongest single argument for a list read, and it is why this proposal does not reuse the shared resolver | §2.3 |
| **F-3** | The strict helper **admits `profile_status = 'incomplete'`**, not only `'active'` | §3.2 — stated as a decision, with the reason, because it is the one place where the literal wording of the requirement ("exactly one active profile") and the deployed reality (7 of 8 profiles are `incomplete`, and the RPC admits it) diverge |

---

## 0A. Revision 7 — four review findings, answered against source

**Scope.** The §3/§4 text as it stood after Revision 6, re-read against itself and against D2/D3. Two of the four findings are defects that Revision 6 **introduced or left in place while claiming to fix the class**; one is a completeness gap; one is a policy that must be labelled as provisional rather than adopted.

| # | Finding | Status | Smallest correction | Affected tests | Must D2 change? |
|---|---|---|---|---|---|
| **R7-1** | The recency comparator still produces `NaN`, now through subtraction of two `-Infinity` values | **CONFIRMED** — the Revision 6 guard moved the NaN from parsing to arithmetic | §4 comparator → explicit **total order**, relational only | **T-108**, **T-801** | No |
| **R7-2** | 500-row offset paging does not prove completeness: a cap below the page size still truncates silently, and rows can shift between pages | **CONFIRMED** — a short page is still read as "exhausted" | §4 retrieval → **count-closed** read with duplicate detection, re-count and explicit bounds | **T-209**, **T-108** | **Yes, for a strict guarantee** — proposed as **B14**, **NOT applied**, review stops |
| **R7-3** | The RPC result is never validated; a malformed success body becomes `success: true, snapshot_id: null` | **CONFIRMED** — every response field is read with `??` / `=== true` fallbacks | §4 new step 6 → validate, then refuse with documented commit uncertainty | **T-906** (new) | No |
| **R7-4** | `{active, incomplete}` was written as a decision; it is a **provisional** self-service onboarding policy needing owner approval | **CONFIRMED as a labelling defect**, not a functional one | §3.3 → retained, re-labelled **provisional**, explicit-approval gate | **T-110**, **T-111** unchanged | No |

**Environment correction (documentation).** Every reference describing the target as an **isolated** project is wrong and has been corrected: the target is an **existing shared test project** (`xrvahykvkuiuglskmctd`), and the control is a **synthetic-only write boundary** — not isolation. See §0A.5 and D4 §1.

### 0A.1 R7-1 — the comparator: subtraction reintroduced the NaN it removed

**Evidence.** The Revision 6 comparator:

```ts
const recency = (v: any): number => {
  if (typeof v !== 'string' || v.length === 0) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};
const byReview = recency(a.reviewed_at) - recency(b.reviewed_at);
if (byReview !== 0) return byReview;
```

`-Infinity - (-Infinity)` is **`NaN`**, so for **any pair of rows that both lack a usable `reviewed_at`** the comparator returns `NaN`; `Array.prototype.sort` treats a `NaN` result as `+0` ("equal"), and the `created_at` and `id` tie-breaks are **never consulted**. The Revision 6 guard fixed `Date.parse → NaN` and, by funnelling every malformed value into the same sentinel, made the *both-missing* collision **more** likely than before. The `.slice(-1)` that picks a `cardinality: 'one'` value is therefore still order-dependent — the exact property the comment above it claims.

**Smallest correction — applied in §4.** Classification then relational comparison:

- `stamp(v)` returns `{ ok: true, ms }` or `{ ok: false, ms: 0 }` — an unparseable or absent value is **never represented as a number**;
- `compareStamps` compares kinds first (`ok` sorts **later**, so absent/malformed sorts **oldest**), then `ms` by `<` / `>`, returning only `-1`, `0`, `1`;
- `compareIds` is the final tie-break on the unique `id`;
- no subtraction appears anywhere in the comparator chain, so **`NaN` is not constructible** from field data.

Because the `id` tie-break is unique (duplicates are refused during retrieval — §4 step 4c), the order is **total**: two distinct rows can never compare equal, so the winner is a function of the set alone, independent of input order or of `.sort` stability.

### 0A.2 R7-2 — retrieval: paging is not completeness

**Evidence.** Three gaps remain in the Revision 6 loop:

1. **A short page is still read as completion.** `if (pageRows.length < FIELD_PAGE_SIZE) break;` means: if the project's PostgREST `db-max-rows` cap is **below 500**, the first page returns at most the cap and the loop stops after **one partial page**. That is the same silent truncation the paging was introduced to remove, merely moved from "no paging" to "paging with an assumed page size". The cap value is **NOT VERIFIED** for this project, so the assumption is unproven by definition.
2. **Offset windows move.** `.range(from, from + 499)` re-computes an offset over rows that may have been inserted or deleted between pages. An insert ahead of the window duplicates a row; a delete skips one. Neither raises anything.
3. **Nothing independent says how many rows to expect.** Without an expectation, "the read ended" and "the read was cut short" are the same observation.

**Smallest correction — applied in §4 step 4.** A closed read with five properties:

| # | Mechanism | What it proves |
|---|---|---|
| 4a | `count: 'exact', head: true` over the **identical predicate**, as an integer | The expected population, without transferring rows |
| 4b | Pages sized from that expectation (`want = min(PAGE, expected − offset)`); a page whose length ≠ `want` **refuses** | Truncation by any cap, and deletion mid-read, both surface as a short page — **never** as exhaustion |
| 4c | Duplicate-`id` detection across pages | An offset that shifted, and the uniqueness the comparator's final tie-break relies on |
| 4d | A **second** count after the read, which must equal the first, and `fields.length` must equal it | Rows appearing or disappearing during the read |
| 4e | Explicit bounds: `MAX_FIELDS` (4,000) and `MAX_SKIPPED` (1,000, D2 V-10's own limit), each refused **in words** | The upper bound the design previously left implicit in a page count |

Every deviation returns **409 "The reviewed fields changed while this snapshot was being prepared. Reload and try again."** before the RPC — so no partial contributor set can ever be published as a complete figure.

**Residual, stated rather than papered over.** A **net-zero** concurrent change between the two counts — one accepted row inserted while another is deleted — leaves `count` and `fields.length` equal while the set differs. That cannot be detected from outside the transaction. **This is why R7-2 is not fully closable in the caller**, and why D2 needs a change for a strict guarantee (see below).

### 0A.3 Does D2 need to change? — **for a strict guarantee, yes. Proposal only; not applied; review stops here.**

**What the caller alone can guarantee:** every row the RPC is told about is real, the set it was told about was the full population **as of two count statements**, and any change that alters the count refuses. That is strictly better than Revision 6 and still not a proof.

**What only the transaction can guarantee:** that the population counted is the population committed against. D2 already re-reads every contributor inside the transaction (values, status, document and business binding), so a *contributor that disappeared* is caught (`SNAPSHOT_FIELD_NOT_CONTRACTED`). What D2 cannot see is a row that was **never sent** — an omission. One closure comparison closes it, and it must sit inside the same function to be atomic.

> **⚠️ SUPERSEDED BY REVISION 2 OF THE PATCH (Revision 8, documentation only).** The block below is retained as review history and is **not** the proposal. It cannot fire: `v_contributor_count` is first assigned at D2 line 572, after the insertion point it names, so its predicate is `NULL` and `IF NULL` takes the false branch. It is also bypassable — the right-hand side contains a caller-supplied count. The authorized proposal is now **Design B** (exact eligible-ID set reconciliation, one statement, plus the overlap rule and V-16) in `VISION_S4_GATE_B_07A_R2_B14_PROPOSED_PATCH.md`. **Nothing below has been applied.**

**Exact proposed D2 change — DELIVERABLE 2, **NOT APPLIED**, awaiting separate authorization (recorded as **B14**, §10) — superseded, see above:**

```sql
-- Proposed insertion point: after the existing p_field_map / p_skipped validation block
-- (D2 §3 step 1.1, V-1…V-15) and BEFORE the contributor value loop. Nothing else changes.

select count(*) into v_population
  from public.extracted_fields ef
 where ef.document_id    = p_source_document_id
   and ef.business_id    = p_business_id
   and ef.review_status in ('accepted','corrected');

if v_population <> v_contributor_count + coalesce(jsonb_array_length(p_skipped), 0) then
  raise exception 'SNAPSHOT_POPULATION_INCOMPLETE';
end if;
```

Why it is correct, and what it costs:

| Aspect | Detail |
|---|---|
| **Why the equality holds for a complete call** | Every accepted/corrected row of this document and business is either a contributor (`v_contributor_count`, already de-duplicated by `SNAPSHOT_DUPLICATE_FIELD`) or a skipped entry (`p_skipped`, already de-duplicated by V-15). The caller's selection partitions that population exactly (§4 steps 4–5) |
| **What it rejects** | Any caller that sends a truncated or filtered subset — the residual in §0A.2 becomes impossible to hide, for this caller **and every future one** |
| **Cost** | One `count(*)` on an already-indexed predicate, inside an existing transaction. One new error code, one new `RPC_ERROR_STATUS` entry (409), and the error-code inventory moves **26 → 27** — the earlier "24 → 25" was two short, because it predated Revision 4's two step-1.1 codes — which restates D4 §6 "interface check" |
| **Why it is not applied here** | It changes D2, and D2 is out of bounds without separate authorization. It also changes the *accepted-input contract*: a caller that legitimately sends a partial set today would begin to fail — which is the point, but it is a decision, not an edit |

**Therefore: review stops here for D2.** The caller as proposed in §4 is complete **relative to the counts it takes**; the closure guard is what makes it complete **relative to the transaction**. Both statements are true, and the difference is B14, not a defect in the caller.

### 0A.4 R7-3 — the RPC result is never validated

**Evidence.** Revision 6 read the result defensively but never **refused** it:

```ts
snapshot_id: result?.snapshot_id ?? null,
is_latest: result?.is_latest === true,
const skippedApplied = Array.isArray(result?.skipped) ? result.skipped : skipped;   // ← the REQUEST
```

A `200` with a null or partial body therefore produced **`success: true, snapshot_id: null`** — a success claim built from nothing — and a malformed `skipped` silently reported the **request** back to the caller as if it were the database's echo. Neither outcome is recoverable by the caller: it has been told a financial snapshot was created and given no identifier for it.

**Smallest correction — applied in §4 step 6.** Validate before any success is constructed: `result` is a non-array object; `snapshot_id` is a **uuid**; `snapshot_type` is a non-empty string; `deduplicated`, `dashboard_metrics_updated`, `promoted_over_newer`, `is_latest` are **booleans**; `applied` is a **non-empty object**; `skipped` is an array of `{ field: string, reason: string|null }`; `confidence_score` is `null` or a finite number in `0…100`; `dashboard_skipped_reason` is `null` or a string. Any failure → generic **500**.

**Two deliberate non-rules, each with a reason:**

- **`snapshot_type` is NOT checked against `SNAPSHOT_TYPES`.** On the dedupe path D2 echoes the **existing** row's type (`coalesce(v_existing_type, v_snapshot_type)`), and a pre-existing row may legitimately carry any value the column's own `CHECK` permits — `current`, `prior`, `quarter`. Validating it against the request subset would break a legitimate retry.
- **`applied` being empty is a fault, not an empty success.** V-1 refuses an empty field map and V-14 refuses a contributor set that yields nothing, so an empty `applied` contradicts the inputs that were accepted.

**⚠ Commit uncertainty — documented, and it is the honest answer.** `create_reviewed_fields_snapshot` writes the snapshot, the audit row and (when enabled) the dashboard row inside **one transaction that commits before it returns**. A malformed result therefore does **not** mean nothing was written: **the transaction may already have committed, and this endpoint cannot tell.** The response is a generic 500 carrying no snapshot id, and **a blind retry is not safe** — it must first be reconciled against `snapshot_submission_audit` (an identical-content retry is idempotent through dedupe; a *different* content retry is a second snapshot). This is stated in the code comment, in §11.3, and in the new test T-906.

### 0A.5 Environment correction — **shared, not isolated**

The target is **not** an isolated project and no document may describe it as one. It is the **existing shared test project** (`xrvahykvkuiuglskmctd`) that already hosts this workspace's evidence surface, and the control that makes S4 safe there is a **synthetic-only write boundary**: every S4 write lands on synthetic rows created by the execution safety plan, or on the three objects the migration itself creates. Nothing else is written.

| Where | Was | Is |
|---|---|---|
| **D3 header** | "an isolated Supabase project, confirmed separately" | "the **existing shared test project**, **not** isolated; synthetic-only write boundary" |
| **D4 §1** | "S4 isolation has NOT been confirmed" | "The target is a shared test project. Isolation is **not** claimed and must not be assumed. The boundary is synthetic-only writes" |
| **§4 code comment** | cap "NOT VERIFIED for the isolated project" | cap "**NOT VERIFIED** for this project" |
| **§10 / §11** | "isolated project authorization" | "project authorization, with the shared-project boundary acknowledged in writing" |
| **Plan §12 / S12 / D4 §3–§4** | "isolated" / "the isolation rule is broken" | "shared test project" / "the synthetic-only write boundary was broken" |

The distinction is not cosmetic: in an isolated project a mistake is contained by the environment; in a shared one it is contained **only** by the write boundary and the pre/post baselines, which is why C5/C7 and the per-table baselines are load-bearing rather than belt-and-braces.

### 0A.6 R7-4 — the status allowlist is **provisional**, and needs owner approval

> **OWNER DECISION — OD-6 (recorded 2026-10-22, documentation only). The allowlist is now APPROVED as owner policy, with conditions, and the value does not move.** The analysis below is **retained verbatim as the reasoning that preceded the decision**; it is not rewritten to look as though it always concluded this. The recorded decision text is §10 **B12**. **Approval authorizes nothing executable** — no source edit, no SQL, no deployment.

Retained exactly as proposed: `{active, incomplete}` admitted; `invited`, `suspended` and any unobserved value **denied**. What changes is its **status as a policy**:

> **This is a provisional self-service onboarding policy. It is neither security-derived nor owner-approved.** It exists because `incomplete` is the column DEFAULT and the state of 7 of 8 live profiles, so a literal `active`-only rule would refuse nearly every real owner on day one. **Explicit owner approval is required before this endpoint is enabled**, and until that approval is recorded, B12 stays **OPEN** rather than "decided".

No D2 edit, no allowlist edit, no test restatement. `v_active_statuses` and `CANONICAL_ACTIVE_STATUSES` remain identical to each other, and both remain unchanged.

---

## 0. Revision 6 — seven review findings, answered against source

**Scope of the review.** The §3/§4 text below, read against **D2** (the migration), **D3** (the test plan), the **deployed** `base44/functions/createSnapshotFromReviewedFields/entry.ts`, `base44/shared/authz/actor.ts`, the installed **`@base44/sdk`** (`dist/utils/axios-client.js`, `dist/utils/auth-utils.js`, `dist/modules/auth.js`), the repo's `extracted_fields` readers, and the previously verified `business_owners` schema record (**V-8**, `VISION_SECURITY_S4_STEP171_VERIFICATION.md:25`).

> **This is a static reading.** Nothing below is runtime validation. Every property that depends on the live server — the PostgREST row cap, the database clock, the platform's error bodies — is marked **NOT VERIFIED**, and each correction is written so that its correctness **does not rest on the unverified value**.

| # | Finding | Status | Smallest correction | Affected tests | Must D2 change? |
|---|---|---|---|---|---|
| **1** | Canonical identity response validation | **CONFIRMED** — the equality *filter* is present, but the *returned* binding is never re-checked, and a malformed body is converted into "no binding" (403) | §3 steps 2a–2b | **T-106** (extended), **T-905** (clause) | No |
| **2** | Business-owner authority | **CONFIRMED** — two defects (`.maybeSingle()` on a three-column-unique table; UTC-vs-`current_date` clock). Schema matches D2 otherwise | §4 `assertBusinessAuthority` | **T-202…T-206** | No |
| **3** | `extracted_fields` pagination | **CONFIRMED** — the read is unbounded and completeness is unprovable; **D2's drift guard does not cover truncation**. Cap value itself **NOT VERIFIED** | §4 step 4 bounded paging | **T-108** (clause) | No (one optional hardening flagged, not required) |
| **4** | T-904's "0 occurrences of `is_latest`" | **CONFIRMED impossible** — §4 necessarily contains `p_is_latest:` and `is_latest:` | §8.1 and **D3 T-904** | **T-904** | No |
| **5** | Authentication error classification | **CONFIRMED** — every `auth.me()` rejection collapses to 401, so an infrastructure fault is reported as an authentication verdict | §3 step 1 | **T-109** (amended) | No |
| **6** | B12 profile status | **CONFIRMED** observed semantics; **the policy decision is undecided and is not taken here** | §3.3 — retained and documented | **T-110**, **T-111** | Only if the decision changes |
| **7** | Deterministic field ordering | **CONFIRMED** — an unparseable timestamp yields `NaN`, which a comparator treats as "equal", discarding both tie-breaks | §4 `recency` guard | **T-108** (clause), **T-801** (variant) | No |

### 0.1 Finding 1 — canonical identity response validation: **CONFIRMED**

**Evidence.** §3 step 2 reads the binding with `.eq('base44_user_id', sessionUserId)` and then does exactly two things with the response:

```ts
const rows = Array.isArray(bindings) ? bindings : [];   // ← non-array ⇒ "no rows"
if (rows.length === 0) { … 403 … }
```

Three gaps follow from that pair alone: **(a)** a non-array body (a proxy object, a null payload, a future SDK shape change) becomes `[]`, so a **fault** is reported as **403 Forbidden** — the same status as a genuinely unbound session, which is precisely the conflation D-1 forbids elsewhere in the plan ("a failed lookup is 500, never a fall-through"); **(b)** `profile.id` is never checked, so a structurally valid row with a null/absent id yields `actor.profile_id === undefined`, which travels into `p_actor_profile_id` and fails at the database as `SNAPSHOT_ACTOR_UNKNOWN` (403) — a data-shape fault attributed to the caller; **(c)** the returned `base44_user_id` is never compared to the session id, so the resolver never proves the property it is named for. The equality exists in the *query*, which is not the same as an assertion about the *result*.

**Smallest correction — applied in §3 steps 2a–2b.** Non-array response → **500**; missing/empty `id` → **500**; returned `base44_user_id !== sessionUserId` → **500**, logged without echoing either value. Rationale for 500 on the mismatch: a correct `eq` filter cannot return a non-matching row, so its presence means this was not the read it claims to be. It is still fail-closed (nothing runs after it); the status differs only in what the caller is told. **If a reviewer prefers 403 for "inconsistent binding", it is a one-line change with no security consequence** — recorded here so the choice is visible rather than implicit. The approved "inconsistent fails closed" clause is satisfied either way; **no email path is reintroduced.**

### 0.2 Finding 2 — business-owner authority: **CONFIRMED** (schema parity) + **two defects**

**Evidence: the table.** `VISION_SECURITY_S4_STEP171_VERIFICATION.md:25` (V-8), read from `information_schema.columns` and `pg_constraint`: `end_date` is a **nullable `date`**; **0 rows are ended**; `ownership_role` defaults to `'owner'`; **UNIQUE `(profile_id, business_id, ownership_type)`**; FKs to `profiles` and `business_entities`; and **no writer in the repo sets `end_date`**. No `status` column and no `start_date` column is evidenced anywhere in the verified record — `end_date` is the only temporal column enumerated. **CONDITIONAL:** absence of `status`/`start_date` is "not evidenced", not "proved absent"; nothing in the proposal reads either, so the correction is independent of the answer.

**Evidence: the predicate.** D2 (`_02_SQL_MIGRATION.md:403–406`):

```sql
from public.business_owners bo
 where bo.business_id = p_business_id
   and bo.profile_id = p_actor_profile_id
   and (bo.end_date is null or bo.end_date >= current_date)
 limit 1;
```

D6 as written selects `id, end_date`, applies the same `end_date` predicate, and adds `.maybeSingle()`. **Parity with D2 is otherwise exact**, including `business_entities.profile_id` as the owner-of-record branch.

**Defect 2a — `.maybeSingle()` is wrong for this table, and it is a real 500.** The deployed constraint is **UNIQUE `(profile_id, business_id, ownership_type)`** — three columns. An owner holding two ownership types in one business (say `direct_individual` **and** `indirect_entity`) has **two rows**. `.maybeSingle()` answers a two-row result with an error and a null body, so the proposal throws **500** for a caller who is unambiguously authorized, while D2's `limit 1` succeeds. **CONFIRMED by source + constraint, not by execution.** Correction: read a **list** with `.limit(1)` and test `length > 0`.

**Defect 2b — the two layers use different clocks.** D6 builds its boundary from `new Date().toISOString().slice(0, 10)` (**UTC**) while D2 compares against `current_date` (**database session timezone**). Around midnight the two can name different days, so one layer can refuse an ownership row the other accepts. **Direction matters and is benign for security:** D2 is authoritative and runs inside the transaction, so a looser endpoint can only produce a `SNAPSHOT_FORBIDDEN` → 404 at the RPC, and a stricter endpoint refuses earlier. **Neither grants access.** The residual is a possible spurious denial near midnight — an availability nit, not a hole. Correction: say so in the code, and keep the endpoint's predicate as a **pre-check that may refuse, never permit**.

**Policy ambiguity — flagged, not resolved.** (i) Because **no writer sets `end_date`**, an ended ownership keeps access forever (V-8's own finding). (ii) The predicate does **not** filter `ownership_role`, so any ownership row counts — a trustee or a 1%-holder. (iii) D6 admits `business_entities.profile_id` **or** any such row, which is the approved policy and is preserved. **No new rule is invented.** If the product intends role-scoped or percentage-scoped ownership authority, that is a **D2 + D6** change requiring its own authorization.

### 0.3 Finding 3 — `extracted_fields` pagination: **CONFIRMED** (with one **NOT VERIFIED** input)

**Evidence.** §4 step 4 issues a single `.select(...)` with `.eq/.eq/.in/.order/.order` and **no `.limit()` and no `.range()`**. `supabase-js` performs no client-side pagination; PostgREST applies the project's `db-max-rows` cap to an unbounded `select`. The Supabase default is 1000, **but that value is not in this repository and is NOT VERIFIED for this project.** What *is* established without knowing the number: **the client cannot prove it received every row**, so the contributor set it forwards is unproven whenever a cap smaller than the document's field count applies.

**Evidence: D2 does not catch it.** The drift guard is two comparisons, both of them "what I sent is real":

```sql
if coalesce(v_found, 0) <> v_requested then            -- per target, sent ⊆ real
  raise exception 'SNAPSHOT_FIELD_NOT_CONTRACTED' …
if v_contributor_count <> array_length(v_contributor_ids, 1) then   -- sent rows exist
  raise exception 'SNAPSHOT_CONTRIBUTOR_DRIFT' …
```

Neither compares the **document's** accepted-field population against what arrived. A truncated read therefore produces a snapshot that is **silently partial** — not a 409, not a 500 — which is the one failure mode this design exists to prevent. The only backstop is incidental: `p_skipped` is capped at **1000** entries (D2 V-10), so a truncation that leaves >1000 unconsumed rows is refused (mapped 500). A truncation that leaves *few* unconsumed rows passes.

**Smallest correction — applied in §4 step 4: bounded, deterministic paging.** 500-row pages via `.range()`, an explicit page ceiling, a hard **refusal** when the ceiling is reached rather than a silent truncation, and a stable total order (`created_at`, then unique `id`) so page boundaries cannot overlap or skip. **D2 need not change**: the endpoint now proves completeness by exhausting the read. **Optional hardening, flagged and NOT adopted:** D2 could add a closure check — `count(accepted/corrected rows of the document) = distinct contributors + p_skipped` — which would make truncation impossible to hide even for a future caller; it changes the RPC's accepted-input contract, so it needs its own authorization. **Revision 7 (R7-2): this is now B14** — the only mechanism that closes the residual a count-closure read cannot reach. It is written out in §0A.3 and is **not applied**; review stops there for D2.

### 0.4 Finding 4 — T-904's zero-`is_latest` requirement: **CONFIRMED impossible**

**Evidence.** D3 T-904(a) requires **0** occurrences of `is_latest` in the entry file. The §4 file must contain at least `p_is_latest: isLatest` (the RPC argument, which is the whole point) and `is_latest: result?.is_latest === true` (the T-806 response key). The clause cannot pass against **any** correct implementation — it is a test that forbids its own subject.

**Smallest correction — §8.1 and D3 T-904.** Replace the token count with clauses that forbid the *write* and permit the *parameter* and the *response property*: **0** handles to `business_metric_snapshots`/`dashboard_metrics`; **0** `.insert(`/`.update(`/`.upsert(`/`.delete(` on any table; **0** `.neq(` (the demotion shape); **exactly 1** RPC call; `p_is_latest` passed once from the validated boolean, which is the file's **only** latest-flag path; and the positive form — **every `sb.from(` in the file is a read**, i.e. `.select(` count ≥ `sb.from(` count. Direct latest-flag mutation is thereby forbidden **structurally**, not lexically.

### 0.5 Finding 5 — authentication error classification: **CONFIRMED**

**Evidence — the SDK's actual behaviour.** `dist/utils/axios-client.js:191–193` converts **every** rejection into `Base44Error(message, error.response?.status, …)`. Consequences: **`.status` is the HTTP status when a response arrived, and `undefined` when none did** (DNS, timeout, socket). `dist/modules/auth.js:106–110` implements `me()` as `axios.get('/apps/{appId}/entities/User/me')` with a `.catch` that clears a stored token on 401 and **re-throws**. There is no local "no token" throw: with no token the SDK simply omits `Authorization`, so **a 401 is a server verdict about the session**, not a client guess.

**The defect.** §3 catches everything and returns **401** — so a transport failure, a 502 from a proxy, or a 500 from the platform is reported to the caller as "you are not authenticated". That is an authentication verdict for an infrastructure fact.

**Smallest correction — applied in §3 step 1: three-way, fail-closed.** `status === 401` → **401** (confirmed unauthenticated); any other delivered 4xx → **403** (refused; not a confirmed session, not an infrastructure claim); `undefined` status, 5xx, or a non-`Base44Error` → **500**. Nothing continues on any branch.

**Documented uncertainty, deliberately not resolved by guessing:** (i) the platform's exact body for an **expired** token is not established here — if it answers 403 rather than 401, the caller receives 403 instead of 401, **still refused**; (ii) a 200 response carrying a non-user body is not distinguishable from a real user at the transport layer, and is handled by the `user.id` check that follows (→ 401); (iii) whether a proxy in front of the project can rewrite a 5xx into a 4xx is unknowable from source — if it does, an infrastructure fault would be reported as 403, **still refused**. In every branch the request stops with zero writes.

### 0.6 Finding 6 — B12 profile status: **CONFIRMED observations, decision NOT taken**

**Evidence.** `profiles.profile_status` is the column carrying the gate (`_02_SQL_MIGRATION.md:375`, `select p.app_role, p.profile_status into …`). D2 sets `v_active_statuses constant text[] := array['active','incomplete']` (line 143) and refuses everything else (lines 381–383). The live population recorded in the plan's §3.3 is **8 profiles, 1 `active`, 7 `incomplete`** — `incomplete` being the **column DEFAULT**, i.e. the state of every profile between creation and first advancement. `invited` and `suspended` are refused by both layers.

**Security implication, stated plainly.** Admitting `incomplete` means a **never-vetted** profile can hold snapshot authority — but only if it **also** satisfies the relationship test (§4: platform admin, owner-of-record, or a non-ended `business_owners` row). The relationship is the grant; status only removes eligibility. For a **self-serve** owner who creates a business during onboarding, that is the intended product behaviour and refusing it would break the primary flow. For a **vetted-tenant** posture, where an advisor must approve an owner before that owner's financials become snapshots, admitting the default is a real gap. **Both readings are defensible; the documents do not currently state which product this is.** That is B12.

**Smallest correction — applied as §3.3: no change to the allowlist.** It is retained exactly as proposed. What changes is that the security implication, the 7-of-8 factual consequence of narrowing it, and the two-place edit required to narrow it are now written down. **A narrowing to `{active}` would require D2 and D6 to move together** and would refuse 7 of 8 live profiles until they are advanced. **T-110 and T-111 keep their current expectations**; if the decision changes, both are restated, not quietly reinterpreted.

### 0.7 Finding 7 — deterministic field ordering: **CONFIRMED**

**Evidence.** §4's comparator:

```ts
const recency = (v: any) => (v ? Date.parse(v) : Number.NEGATIVE_INFINITY);
const byReview = recency(a.reviewed_at) - recency(b.reviewed_at);
if (byReview !== 0) return byReview;
```

`Date.parse` returns **`NaN`** for a malformed value, and `NaN` is **truthy-path** here: a non-empty but unparseable string reaches `NaN`, not `-Infinity`. `NaN - NaN` is `NaN`; `NaN !== 0` is **true**, so the comparator **returns `NaN`** — and per `Array.prototype.sort`, a comparator result of `NaN` is treated as **`+0`**, i.e. "equal". The `created_at` and `id` tie-breaks are then **never consulted** for that pair, leaving the winner dependent on input order. The `.slice(-1)` that picks a `cardinality: 'one'` value is therefore **not deterministic** when a timestamp is malformed — exactly the property the comment above it claims.

**Smallest correction — applied in §4: a guarded total order.** `recency` returns a **finite number** for every input: absent, empty or unparseable → `Number.NEGATIVE_INFINITY`. **Intended ordering is unchanged and now stated as authoritative:** `reviewed_at` **NULL/unparseable first (oldest)** → `created_at` → `id`, so `.slice(-1)` is the latest-reviewed row and a row with a real review timestamp always beats one without. Alignment: **T-108** gains a static clause (a `Date.parse` result is never used unguarded), and **T-801** gains a variant that pins the winner across repeated runs with a malformed timestamp present. **No D2 change** — ordering never reaches the database; for `sum`/`mean` it is irrelevant, and for `cardinality: 'one'` the database validates the id it is given.

---

## 1. The B10 decision, recorded

> **Chosen: (b) — the snapshot caller requires strict canonical `base44_user_id` identity itself, and refuses an email-only match. The shared `authenticateActor` is not changed.**

| Option | Blast radius | Verdict |
|---|---|---|
| (a) Correct T-102 to admit the library's id-then-email resolution | One test row; **weakens the binding the requirement states** for a financial write | **Rejected** |
| **(b) The snapshot caller enforces id-equality itself** | **One endpoint + one new helper file.** 20 existing call sites untouched | **CHOSEN** |
| (c) Remove the email fallback from `authenticateActor` | **20 call sites in 20 files** (§7). Needs a per-consumer compatibility assessment that this turn can inventory but not complete | **Rejected for now** — not because it is wrong, but because it cannot be justified without the per-consumer read §7 shows is still outstanding |

**Consequence for the documents.** T-102 stands as written: an email-only match is **403**. D2 stands unchanged. The plan's B10 moves from *OPEN — OWNER DECISION* to **RESOLVED (policy)**, with its implementation gated on the deployment in §4.

---

## 2. Why a separate helper, not a strict mode on the existing one

### 2.1 The two contracts differ in more than strictness

| | `authenticateActor` (existing) | required for this endpoint |
|---|---|---|
| Missing session | throws 401 | 401 — **same** |
| Profile lookup | `.eq('base44_user_id')` via **`maybeSingle`** | **list** read, so a duplicate is observed |
| No id match | **falls back to `ilike('email')`** | **refuses (403)** |
| Duplicate binding | not detected — masked by the above (F-2) | **refuses (403)** |
| Status gate | refuses `suspended` only | refuses everything except `active` / `incomplete` |
| Standing source | `profiles.app_role` | `profiles.app_role` — **same** |

Only two of six rows can be expressed as a flag; three change the *read* (`maybeSingle` → list) and the *fallback*. A `{ strict: true }` option would therefore have to branch inside a function whose current behaviour every one of 20 consumers depends on.

### 2.2 The instruction was explicit

> *"Do not modify the shared helper's existing behavior for other consumers without separate approval."*

A new module changes **nothing** for anyone. `base44/shared/authz/actor.ts` is not edited in this proposal — not one line — and `import { ADMIN_ROLES, HttpError }` re-uses its single role list rather than declaring a second one.

### 2.3 F-2 — why the list read is not pedantry

```ts
// actor.ts, current behaviour
const { data } = await sb.from('profiles').select('*')
  .eq('base44_user_id', user.id).maybeSingle();   // 2 rows ⇒ error, data = null
profile = data || null;                           // profile stays null …
if (!profile && user.email) { … ilike('email') … } // … and EMAIL decides
```

With a duplicated binding the lookup does not fail loudly — it returns nothing, and control passes to the branch the requirement forbids. The caller then acts as whichever profile the email pattern matched. A list read sees `length > 1` and refuses. That difference is the whole point of T-104.

### 2.4 Trade-off accepted

`authenticateActor` also **throws before** any write and is already correct for 20 consumers. The cost of a second resolver is a second place where "who is calling" is decided. That cost is bounded by making the new module **narrow and total**: 4 statements, no fallback, no body input, no `ilike`, and a static fingerprint (T-905) that fails if either property regresses.

---

## 3. Proposed new file — `base44/shared/authz/canonicalActor.ts`

New file. Self-contained. Nothing imports it today, so adding it changes no deployed behaviour.

```ts
/**
 * Phase S4 Gate B — CANONICAL ACTOR RESOLUTION (strict).
 *
 * WHY THIS IS NOT authenticateActor():
 *
 *   `shared/authz/actor.ts` resolves the caller by `profiles.base44_user_id`
 *   equality and then FALLS BACK to an `ilike('email')` match when that column is
 *   empty. Two consequences follow, both deliberate there and unacceptable here:
 *
 *     1. An email address is mutable and non-unique, so that fallback binds a
 *        session to a profile by an attribute the user can change and that a second
 *        account can share. For an ordinary read that is a defensible trade-off. For
 *        a financial write it is not the binding the S4 requirement states.
 *     2. The id branch uses `.maybeSingle()`. Given TWO rows carrying the same
 *        `base44_user_id`, PostgREST answers "multiple rows" as an ERROR with a null
 *        body, so the id branch yields nothing and the EMAIL branch then decides — a
 *        duplicate binding is not merely unhandled, it is MASKED, and which profile
 *        wins depends on which row the email pattern happens to match.
 *
 *   This resolver therefore performs its OWN read, as a LIST, and never consults
 *   email at all. That is also why it is a separate module rather than an option on
 *   the shared one: authenticateActor has 20 call sites across 20 files, and
 *   changing its behaviour for one endpoint would move the identity rule under every
 *   one of them. This file changes nothing for anybody else.
 *
 * THE RULE:
 *
 *   An authenticated session is the ONLY source of identity.
 *   Exactly ONE profile may be bound to it, by `profiles.base44_user_id` equality.
 *   No email match. No body field. No fallback of any kind.
 *
 * Service role is database capability, NOT identity: this runs before any write, and
 * a failure here aborts the request without one.
 */
import { ADMIN_ROLES, HttpError } from './actor.ts';

/**
 * The statuses that may hold snapshot authority. Mirrors the RPC's
 * `v_active_statuses` constant exactly (D2 §3), so the two layers cannot disagree.
 *
 * `incomplete` is admitted deliberately: it is the column DEFAULT and the state the
 * production rows are actually in (7 of 8 profiles). It means "never advanced", not
 * "revoked" — the RELATIONSHIP is the grant and status only removes eligibility.
 * `invited`, `suspended` and any unobserved value are refused.
 */
export const CANONICAL_ACTIVE_STATUSES = ['active', 'incomplete'];

export interface CanonicalActor {
  user: { id: string; email: string | null };
  profile: any;
  profile_id: string;
  role: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export async function resolveCanonicalActor(base44: any, sb: any): Promise<CanonicalActor> {
  // ── 1. SESSION — CLASSIFIED, not merely caught (Revision 6, finding 5) ─────
  // The SDK converts EVERY rejection into a Base44Error whose `.status` is
  // `error.response?.status` — so `.status` is the HTTP status when a response
  // arrived and `undefined` when none did (DNS, timeout, socket). `me()` is a GET on
  // User/me with a catch that re-throws; there is no local "no token" throw, so a
  // 401 is a SERVER verdict about the session, not a client guess.
  //
  // Three outcomes, all fail-closed, none continuing:
  //   401                    → confirmed unauthenticated            → 401
  //   any other delivered 4xx → refused; session not confirmed and
  //                             not an infrastructure verdict       → 403
  //   no status, 5xx, other   → infrastructure fault                → 500
  //
  // Reporting every rejection as 401 would state an authentication fact on the
  // strength of a transport failure. Nothing below this line runs on any branch.
  let user: any = null;
  try {
    user = await base44.auth.me();
  } catch (err: any) {
    const status = Number(err?.status);
    if (status === 401) {
      console.error('[authz] no authenticated session');
      throw new HttpError(401, 'Unauthorized');
    }
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      console.error('[authz] session could not be confirmed (' + status + ')');
      throw new HttpError(403, 'Forbidden');
    }
    console.error('[authz] session resolution failed (infrastructure)');
    throw new HttpError(500, 'Internal server error');
  }
  // A resolved response still has to carry an id; a 200 with an empty body is not a
  // session. Non-string ids are stringified rather than refused, so this check cannot
  // reject a legitimate caller over a type the platform may change.
  if (!user || user.id === null || user.id === undefined || String(user.id).length === 0) {
    console.error('[authz] session resolved without an identity');
    throw new HttpError(401, 'Unauthorized');
  }

  const sessionUserId = String(user.id);

  // ── 2. CANONICAL BINDING — a LIST read, so a duplicate is OBSERVED ──────────
  // Not `.maybeSingle()`: that collapses "two rows" into an error with a null body,
  // which is how a duplicate binding would become invisible (see the header).
  const { data: bindings, error } = await sb
    .from('profiles')
    .select('id, app_role, profile_status, base44_user_id')
    .eq('base44_user_id', sessionUserId);

  if (error) {
    console.error('[authz] canonical binding lookup failed');
    throw new HttpError(500, 'Internal server error');
  }

  // ── 2a. SHAPE — a malformed response is a FAULT, never "no binding" ────────
  // (Revision 6, finding 1.) A successful PostgREST read of a `select` returns an
  // ARRAY. A non-array body means this was not the read it claims to be, and
  // answering 403 would present an infrastructure fault as a policy verdict — the
  // caller could not tell a broken resolver from an unbound session. 500 instead.
  if (!Array.isArray(bindings)) {
    console.error('[authz] canonical binding response is not an array');
    throw new HttpError(500, 'Internal server error');
  }
  const rows = bindings;

  if (rows.length === 0) {
    // NO EMAIL FALLBACK. A profile reachable only by email is NOT this session's
    // identity. Counts are logged; no address is compared, stored or echoed, so the
    // file contains no email predicate a future reader could mistake for a fallback.
    console.error('[authz] no canonical profile bound to the session identity (bindings=0)');
    throw new HttpError(403, 'Forbidden');
  }
  if (rows.length > 1) {
    console.error('[authz] duplicate canonical profile binding (bindings=' + rows.length + ')');
    throw new HttpError(403, 'Forbidden');
  }

  const profile = rows[0];

  // ── 2b. STRUCTURE — the row must be USABLE, and must be THIS session's ─────
  // (Revision 6, finding 1.) The filter restricts to equality, which is not the same
  // as an assertion about the RESULT. Two checks, both faults rather than verdicts:
  //   · no usable id → `actor.profile_id` would be undefined, travel into
  //     `p_actor_profile_id` and return SNAPSHOT_ACTOR_UNKNOWN (403) — a data-shape
  //     fault misattributed to the caller;
  //   · `base44_user_id` not equal to the session id → unreachable through a correct
  //     `eq`, so its presence means the filter did not apply. Logged without echoing
  //     either value. Still fail-closed; 500 chosen because a 403 would assert a
  //     policy fact this read cannot establish. (403 here would be equally safe — a
  //     one-line change, recorded so the choice is visible.)
  if (typeof profile?.id !== 'string' || profile.id.length === 0) {
    console.error('[authz] canonical binding row carries no usable profile id');
    throw new HttpError(500, 'Internal server error');
  }
  if (String(profile.base44_user_id) !== sessionUserId) {
    console.error('[authz] canonical binding row does not carry the session identity');
    throw new HttpError(500, 'Internal server error');
  }

  // ── 3. STATUS — fail closed on anything not explicitly eligible ────────────
  if (!CANONICAL_ACTIVE_STATUSES.includes(String(profile?.profile_status))) {
    console.error('[authz] canonical profile status is not eligible');
    throw new HttpError(403, 'Forbidden');
  }

  // ── 4. STANDING — canonical `app_role` ONLY ────────────────────────────────
  // The Base44 `user.role` is deliberately never read, so no Base44 administrative
  // standing can elevate a VISION authorization.
  const appRole = profile?.app_role || null;

  return {
    user: { id: sessionUserId, email: user.email ?? null },
    profile,
    profile_id: profile.id,
    role: appRole || 'user',
    isAdmin: ADMIN_ROLES.includes(appRole),
    isSuperAdmin: appRole === 'super_admin',
  };
}
```

### 3.1 Properties this file is written to have

| # | Property | How it is guaranteed |
|---|---|---|
| P-1 | Identity comes only from the session | One `auth.me()` read; no argument other than `base44` / `sb` is accepted; the module cannot see a request body |
| P-2 | Exactly one binding, or refuse | List read; `length === 0` → 403; `length > 1` → 403; no tie-break, no ordering preference |
| P-3 | No email resolution anywhere | The file contains **zero** `ilike`, **zero** `email` predicate, **zero** profile write. `user.email` is carried for logging/attribution only and is never used to select a row |
| P-4 | Standing is canonical | `ADMIN_ROLES` imported from the shared module — one role list for the platform |
| P-5 | Status fails closed | Allowlist constant, `String()`-wrapped so a `null`/`undefined` status cannot pass by coercion |
| P-6 | Nothing is written | Three reads, no `insert`/`update`/`upsert` |
| P-7 | A malformed response is never a policy verdict | Non-array body → **500** (step 2a); unusable `id` → **500**; returned binding ≠ session id → **500** (step 2b). Only `length 0` and `length > 1` produce **403** |
| P-8 | The binding is proved on the **result**, not only in the filter | `String(profile.base44_user_id) !== sessionUserId` is an explicit refusal (step 2b), so the equality the module is named for is asserted where a reader can see it |
| P-9 | Authentication faults are classified, not flattened | 401 → 401 · other 4xx → 403 · no status / 5xx → 500 (step 1). No branch continues |

### 3.2 F-3 — "exactly one **active** profile": the one wording that needed interpreting

The decision text says *"must resolve to exactly one **active** profiles row."* Read literally as `profile_status = 'active'`, this endpoint would refuse **7 of the 8** deployed profiles, because `incomplete` is the column default and the state production actually uses for owners and admins. The RPC already permits both (`v_active_statuses := array['active','incomplete']`, D2 §3).

**Adopted:** eligible = `{active, incomplete}`; `invited`, `suspended` and any unobserved value are refused. The two layers therefore agree, and no legitimate owner is locked out by a column default.

**If the owner wants literal `active` only**, it is a **two-line** change — the constant here *and* D2's `v_active_statuses` — and it is a migration change with its own re-authorization. Stated here so the choice is visible rather than buried in a constant.

### 3.3 B12 — the status allowlist is RETAINED, and the decision is still open

Revision 6 finding 6 asked for the observed semantics, the security implication, and an explicit refusal to decide. All three, in one place.

| Question | Answer | Evidence |
|---|---|---|
| What does `incomplete` mean? | **Never advanced** — the value a profile holds between creation and first advancement | It is the **column DEFAULT**; 7 of the 8 deployed profiles carry it |
| What does `active` mean? | **Advanced / vetted** | 1 of 8 carries it; nothing in the proposal distinguishes it further |
| What do the two layers do? | Both admit `{active, incomplete}`, refuse `invited`, `suspended`, and anything unobserved | D6 `CANONICAL_ACTIVE_STATUSES`; D2 `v_active_statuses := array['active','incomplete']` |
| Is status the grant? | **No.** The **relationship** is the grant (§4: admin · owner-of-record · non-ended `business_owners` row). Status only removes eligibility | §4 `assertBusinessAuthority` |

**Security implication, stated without euphemism.** Admitting `incomplete` lets a profile that has never been vetted hold snapshot authority **for a business it already owns or is recorded as owning**. For a self-serve product — an owner onboarding their own company — that is correct and narrowing it would break the primary flow. For a vetted-tenant product — an advisor approves an owner before that owner's financials may become snapshots — admitting the default is a **gap**, because the default is applied to every new profile before any vetting.

**APPROVED AS OWNER POLICY — OD-6, 2026-10-22.** Revision 7's labelling was correct when it was written: until OD-6 the allowlist **was** provisional and required explicit owner approval before the endpoint is enabled (§0A.6). Approval is **of the existing value**, subject to the conditions recorded in §10 **B12**, and it changes **no constant, no code and no test**. The allowlist does not move. What moves is that the implication above, the **7-of-8 operational consequence** of narrowing it, and the requirement that **D2 and D6 change together** are now written down instead of implied. Narrowing to `{active}` is a **product decision with a migration re-authorization**, not a documentation edit. **T-110 and T-111 keep their current expectations**; a changed decision restates both rather than reinterpreting them, and `D4 §3` probe 5a already carries B12 as open.

---

## 4. Proposed replacement — `base44/functions/createSnapshotFromReviewedFields/entry.ts`

**This section supersedes D1 §3 in full.** D1 §4 (the one-line UI selector) and D1 §5 (invariants) remain valid.

### 4.1 What changed against D1 §3, and why

| # | Change | Reason |
|---|---|---|
| C-1 | `authenticateActor` → **`resolveCanonicalActor`**; `assertCanonicalActorIdentity` and `assertActiveProfile` are **deleted** | Their work now happens once, before the handler body, in the strict helper. Two implementations of one rule is how the rule drifts |
| C-2 | **No `try/catch` around the authority check** | D1 caught it to convert 403 → 404, which also converted a 500 into a 404. The authority helper now throws 404 itself for both absence and denial, so the catch is unnecessary and its removal eliminates a reclassification path |
| C-3 | `p_skipped` entries are **`{ field: <field_id>, reason }`** (F-1) | D2 V-12 permits only `field` / `reason`. The response still reports `field_id`, so the API is unchanged |
| C-4 | New 400 when **no accepted field maps to any target** | `p_field_map` would be `[]`, which D2 V-1 refuses; the endpoint says so first, in words |
| C-5 | `p_actor_base44_user_id: actor.user.id` — no `?? null` | The helper guarantees a non-null `user.id`; a nullable expression would suggest a session-less path exists |
| C-6 | Response `fields_skipped` maps back from `{field, reason}` to `{field_id, reason}` | Preserves D3's T-806/T-811/T-414 expectations exactly |
| C-7 | `RPC_ERROR_STATUS` gains the two validation codes, mapped to **500** | The endpoint constructs the payload, so V-1…V-15 are unreachable from caller input. A hit is an internal defect and must not be reported as a client error |
| C-8 | `business_owners` read is a **list with `.limit(1)`**, not `.maybeSingle()` | The deployed uniqueness is `(profile_id, business_id, ownership_type)`; an owner with two ownership types has two rows and `.maybeSingle()` throws **500** at an authorized caller (Revision 6, finding 2a) |
| C-9 | The `end_date` predicate is documented as a **pre-check** using the UTC date while D2 uses `current_date` | The two clocks can differ across midnight. D2 is authoritative and runs in the transaction, so the pre-check can only over-refuse, never over-permit (finding 2b) |
| C-10 | The `extracted_fields` read is **bounded paging** (500 × 20) that **refuses** at the ceiling | An unbounded read is capped server-side and truncates silently; D2 cannot detect a short read (finding 3) |
| C-11 | `recency` returns a **finite** number for every input; unparseable sorts oldest | `Date.parse` → `NaN` → comparator treated as "equal" → tie-breaks skipped → nondeterministic winner (finding 7) |
| C-12 | A non-array response body from **either** list read is a **500** | A malformed body must never be reported as "no rows", i.e. as a policy verdict (finding 1) |
| C-13 | The recency comparator is a **total order over `{ok, ms}` classifications** — relational `<`/`>`, **no subtraction** | `-Infinity − (-Infinity)` is `NaN`, which `sort` reads as "equal" and which skipped both tie-breaks — the R7-1 defect (§0A.1) |
| C-14 | The `extracted_fields` read is **closed by a count**, not by a short page: exact count first, pages sized from it, duplicate-id detection, second count after, explicit `MAX_FIELDS`/`MAX_SKIPPED` | A cap below the page size, and rows shifting between offsets, both hid truncation (R7-2, §0A.2) |
| C-15 | The RPC result is **validated before any success is constructed**; a malformed body is a generic 500 | `success: true, snapshot_id: null` is a success claim built from nothing (R7-3, §0A.4) |
| C-16 | `skipped` is taken **only** from the validated echo; the request is no longer substituted for a malformed response | Reporting the request back as the database's echo is an unverified statement dressed as a result (R7-3) |
| C-17 | `UUID_PATTERN` named constant; `snapshot_type` validated as a **non-empty string**, never against `SNAPSHOT_TYPES` | A dedupe echoes the **existing** row's type, which may legitimately sit outside the request subset (§0A.4) |

### 4.2 The file

```ts
/**
 * createSnapshotFromReviewedFields — Phase S4 Gate B (strict canonical identity).
 *
 * WHAT WAS WRONG (audit, five defects A-1…A-5 in `…_EXECUTION_SAFETY_PLAN.md` §5.5):
 *   1. `auth.me()` failures were swallowed into `user = null` and execution continued.
 *   2. The authorization gate was skipped entirely when `user` was null.
 *   3. The role check read the DOCUMENT OWNER's app_role, not the caller's.
 *   4. `created_by` fell back to the document owner when there was no session.
 *   5. The snapshot was written directly, bypassing the RPC, with `is_latest` demoted
 *      in a SEPARATE statement.
 *
 * TRUST BOUNDARY — read before changing anything here:
 *   The RPC is invoked with the service-role key. Service role is database capability,
 *   NOT identity: `p_actor_profile_id` is a CLAIM by whoever holds that key and does not
 *   prove who called. THIS FILE is the authentication boundary. It derives the actor
 *   from the trusted Base44 session through resolveCanonicalActor(), which binds the
 *   caller to exactly ONE profile by `profiles.base44_user_id` EQUALITY and refuses every
 *   other case — no email match, no body field, no fallback. The RPC then independently
 *   re-validates the CLAIMED profile, its STATUS and its authorized RELATIONSHIP to the
 *   business, and pins the tenant to the document. A leaked service key still permits
 *   asserting any authorized profile's identity; key custody is the control that matters.
 *
 *   ATTRIBUTION lives in the append-only submission audit (one row per accepted
 *   submission) and in `metadata.created_by_base44_user_id`. It records who was CLAIMED.
 *   `business_metric_snapshots.created_by` is never written.
 *
 * SOURCE INTEGRITY — no financial VALUE is sent from here. This file decides which
 * accepted fields feed which targets (the mirror below); the database reads the numbers
 * from extracted_fields inside the transaction and refuses any field that is not an
 * accepted or corrected field of THIS document AND this business AND this target's
 * declared source field.
 *
 * PERSISTENCE — exactly one writer: `sb.rpc('create_reviewed_fields_snapshot')`. This
 * file contains no insert, no update and no delete against any table.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, HttpError } from '../../shared/authz/actor.ts';
import { resolveCanonicalActor } from '../../shared/authz/canonicalActor.ts';

/** The mapping contract version. Any change to FIELD_CONTRACT requires a new version string. */
const MAPPING_VERSION = 's4.mapping.v1';

/**
 * The DEPLOYED snapshot_type vocabulary is ('current','prior','historical','before_strategy',
 * 'after_strategy','projection','tax_year','quarter','month'). This is the strict subset the
 * review path may request. 'projection' — NOT 'projected'
 * (business_metric_snapshots_snapshot_type_check).
 */
const SNAPSHOT_TYPES = ['historical', 'tax_year', 'projection'];

/**
 * D-19 — DASHBOARD PROJECTION DISABLED.
 *
 * `dashboard_metrics` is written by ten application paths with no arbitration, so projecting
 * a snapshot into it would mix snapshot-sourced and assessment-sourced values in one row with
 * no way to tell them apart. Snapshot persistence and promotion are UNAFFECTED. The RPC
 * re-checks its own copy of this constant, so a direct RPC call cannot write the dashboard
 * either. Flipping BOTH constants in one change-set is the only change needed to enable it.
 */
const DASHBOARD_PROJECTION_ENABLED = false;

/** A snapshot must be dated by its document's reporting period, never by the day it was created. */
const MIN_REPORTING_YEAR = 1900;
const MAX_REPORTING_YEAR = 2100;

/**
 * A snapshot identifier, as the database returns it (`uuid`). Revision 7, R7-3: the response is
 * only built when the RPC actually gave us one — never defaulted to `null`.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Controlled SQL outcomes → safe HTTP outcomes. Unknown codes are logged and returned as a
 * generic 500; no database message ever reaches the caller.
 */
const RPC_ERROR_STATUS: Record<string, number> = {
  SNAPSHOT_FIELD_NOT_CONTRACTED: 409,            // reviewed fields changed under the request
  SNAPSHOT_CONTRIBUTOR_DRIFT: 409,               // the same, for the contributor set
  SNAPSHOT_YEAR_REQUIRED: 409,
  SNAPSHOT_YEAR_IMPLAUSIBLE: 409,
  SNAPSHOT_MAPPING_VERSION_UNSUPPORTED: 400,
  SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED: 400,
  SNAPSHOT_BASIS_MISMATCH: 400,
  SNAPSHOT_DUPLICATE_TARGET: 400,
  SNAPSHOT_DUPLICATE_FIELD: 400,
  SNAPSHOT_TARGET_NOT_IN_CONTRACT: 400,
  SNAPSHOT_RESERVED_METADATA_KEY: 400,
  SNAPSHOT_INVALID_TARGET: 400,
  SNAPSHOT_INVALID_TYPE: 400,
  SNAPSHOT_INVALID_INPUT: 400,
  SNAPSHOT_OP_MISMATCH: 400,
  SNAPSHOT_CARDINALITY_VIOLATION: 400,
  SNAPSHOT_FIELD_VALUE_MISSING: 400,
  SNAPSHOT_NO_CONTRIBUTORS: 400,
  // PAYLOAD-SHAPE CODES (D2 §3 step 1.1). This file BUILDS the payload, so no caller can
  // reach these; a hit is an internal defect and is reported as such, never as a 400.
  SNAPSHOT_INVALID_FIELD_MAP: 500,
  SNAPSHOT_INVALID_SKIPPED: 500,
  SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH: 404,     // non-disclosure (D-1)
  SNAPSHOT_FORBIDDEN: 404,                      // non-disclosure (D-1)
  SNAPSHOT_ACTOR_UNKNOWN: 403,
  SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE: 403,
  SNAPSHOT_DEDUPE_TYPE_MISMATCH: 500,           // internal invariant breach
  SNAPSHOT_IDENTITY_LOST: 500,                  // internal invariant breach
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  SNAPSHOT_YEAR_REQUIRED:
    'This document has no reporting year, so it cannot be dated. Set the document year and try again.',
  SNAPSHOT_YEAR_IMPLAUSIBLE:
    'This document reporting year falls outside the supported range.',
  SNAPSHOT_FIELD_NOT_CONTRACTED:
    'The reviewed fields changed while this snapshot was being created. Reload and try again.',
  SNAPSHOT_CONTRIBUTOR_DRIFT:
    'The reviewed fields changed while this snapshot was being created. Reload and try again.',
};

function mapRpcError(error: any): HttpError {
  const text = String(error?.message || '');
  const code = Object.keys(RPC_ERROR_STATUS).find((k) => text.includes(k));
  if (!code) {
    console.error('[snapshot] unmapped RPC failure');
    return new HttpError(500, 'Internal server error');
  }
  const status = RPC_ERROR_STATUS[code];
  if (status >= 500) {
    console.error('[snapshot] RPC invariant failure: ' + code);
    return new HttpError(500, 'Internal server error');
  }
  return new HttpError(status, RPC_ERROR_MESSAGES[code] || 'Request rejected');
}

/**
 * FIELD_CONTRACT — a MIRROR of the authoritative contract, which lives in the database
 * (`public.s4_mapping_contract(version)`). This copy exists only to build the selection.
 * The database re-validates every entry against its own copy and refuses anything that does
 * not match, so a drift between the two FAILS CLOSED — it can never produce a wrong value.
 * Parity is asserted by T-301.
 *
 * `from`        the ONLY extracted_fields.field_name permitted to feed this target
 * `op`          direct (exactly one row) | sum | mean (one or more rows)
 * `cardinality` one | many — enforced server-side
 */
type TargetSpec = { target: string; op: 'direct' | 'sum' | 'mean'; from: string; cardinality: 'one' | 'many' };

const FIELD_CONTRACT: Record<string, { basis: string; targets: TargetSpec[] }> = {
  profit_and_loss: {
    basis: 'book',
    targets: [
      { target: 'annual_revenue', op: 'direct', from: 'annual_revenue', cardinality: 'one' },
      { target: 'gross_profit', op: 'direct', from: 'gross_profit', cardinality: 'one' },
      { target: 'net_profit', op: 'direct', from: 'net_profit', cardinality: 'one' },
      { target: 'total_expenses', op: 'direct', from: 'total_expenses', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'owner_compensation', cardinality: 'one' },
    ],
  },
  balance_sheet: {
    basis: 'book',
    targets: [
      { target: 'total_assets', op: 'direct', from: 'total_assets', cardinality: 'one' },
      { target: 'cash_on_hand', op: 'direct', from: 'cash_on_hand', cardinality: 'one' },
      { target: 'total_debt', op: 'direct', from: 'total_debt', cardinality: 'one' },
      { target: 'metadata.total_equity', op: 'direct', from: 'total_equity', cardinality: 'one' },
      // No column exists for total_liabilities; it persists in metadata under this exact key.
      { target: 'metadata.total_liabilities', op: 'direct', from: 'total_liabilities', cardinality: 'one' },
    ],
  },
  business_tax_return: {
    basis: 'tax',
    targets: [
      { target: 'annual_revenue', op: 'direct', from: 'gross_receipts', cardinality: 'one' },
      { target: 'net_profit', op: 'direct', from: 'ordinary_business_income', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'officer_compensation', cardinality: 'one' },
      { target: 'payroll', op: 'direct', from: 'wages', cardinality: 'one' },
      { target: 'total_expenses', op: 'direct', from: 'deductions', cardinality: 'one' },
      { target: 'metadata.taxable_income', op: 'direct', from: 'taxable_income', cardinality: 'one' },
    ],
  },
  debt_schedule: {
    basis: 'schedule',
    targets: [
      { target: 'total_debt', op: 'sum', from: 'loan_balance', cardinality: 'many' },
      { target: 'metadata.monthly_debt_payment', op: 'sum', from: 'monthly_payment', cardinality: 'many' },
      { target: 'metadata.mean_interest_rate', op: 'mean', from: 'interest_rate', cardinality: 'many' },
    ],
  },
  payroll_report: {
    basis: 'payroll',
    targets: [
      { target: 'payroll', op: 'direct', from: 'total_payroll', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'owner_payroll', cardinality: 'one' },
      { target: 'metadata.employee_count', op: 'direct', from: 'employee_count', cardinality: 'one' },
      { target: 'metadata.payroll_tax', op: 'direct', from: 'payroll_tax', cardinality: 'one' },
    ],
  },
};

/**
 * assertBusinessAuthority — the EXACT approved policy. No label matching, no borrowed rule,
 * and no use of the document owner's role.
 *   platform admin : the CALLER's canonical `app_role` is admin | super_admin
 *   business owner : business_entities.profile_id  OR a non-ended business_owners row
 *   everything else: denied — including advisors (D-4 disabled), team members and experts (D-2)
 *
 * A DENIAL and an ABSENT BUSINESS are the same 404, so a caller cannot use the response to
 * learn that a tenant exists. A failed QUERY is a 500: it is an infrastructure failure and is
 * never disguised as a policy verdict. Neither outcome writes anything.
 */
async function assertBusinessAuthority(sb: any, actor: any, businessId: string): Promise<string> {
  const { data: entity, error: entityError } = await sb
    .from('business_entities')
    .select('id, profile_id, assigned_advisor_id')
    .eq('id', businessId)
    .maybeSingle();

  if (entityError) {
    console.error('[snapshot] authority lookup failed (business_entities)');
    throw new HttpError(500, 'Internal server error');
  }
  if (!entity) throw new HttpError(404, 'Not found');

  if (actor.isAdmin) return 'platform_admin';

  if (entity.profile_id && entity.profile_id === actor.profile_id) return 'business_owner';

  // A LIST read with limit(1), NOT `.maybeSingle()` (Revision 6, finding 2a).
  // The deployed constraint is UNIQUE (profile_id, business_id, ownership_type) —
  // three columns — so one owner holding two ownership types in one business has TWO
  // rows. `.maybeSingle()` answers a two-row result with an error and a null body and
  // would throw 500 for an unambiguously authorized caller; D2's `limit 1` succeeds.
  //
  // The end_date predicate is D2's (`bo.end_date is null or bo.end_date >=
  // current_date`), reproduced here as a PRE-CHECK. Two deliberate limitations:
  //   · it uses the UTC date while D2 uses the database's `current_date`, so near
  //     midnight the two can name different days. D2 is authoritative and runs inside
  //     the transaction, so a looser endpoint can only produce SNAPSHOT_FORBIDDEN →
  //     404 at the RPC. This pre-check may REFUSE a caller D2 would have allowed; it
  //     can never PERMIT one D2 refuses.
  //   · it does not filter `ownership_role`, so any ownership row counts (V-8). That
  //     is the approved policy; role- or percentage-scoped ownership authority would
  //     be a D2 + D6 change with its own authorization.
  const { data: ownerRows, error: ownerError } = await sb
    .from('business_owners')
    .select('id, end_date')
    .eq('business_id', businessId)
    .eq('profile_id', actor.profile_id)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString().slice(0, 10))
    .limit(1);

  if (ownerError) {
    console.error('[snapshot] authority lookup failed (business_owners)');
    throw new HttpError(500, 'Internal server error');
  }
  if (!Array.isArray(ownerRows)) {
    console.error('[snapshot] authority response is not an array (business_owners)');
    throw new HttpError(500, 'Internal server error');
  }
  if (ownerRows.length > 0) return 'business_owner_record';

  // D-4 — advisor authority is disabled in both layers; a bare advisor role reaches here.
  throw new HttpError(404, 'Not found');
}

/**
 * loadAuthorizedDocument — the single chokepoint. The tenant comes from the DOCUMENT ROW;
 * the caller comes from the SESSION; the body only names which document.
 *
 * THREE INDEPENDENT CHECKS, not one derived from another:
 *   (a) the document exists                       → 404 (indistinguishable from denial)
 *   (b) the document has an owner of record       → 409
 *   (c) the document has a business association   → 409
 *   (d) that business exists AND is reachable by this caller → 404 / 500
 * Each fails on its own, so a document that is missing an owner cannot borrow authority
 * from a valid business, and a valid business cannot supply a tenant to an orphan document.
 */
async function loadAuthorizedDocument(sb: any, actor: any, documentId: any) {
  if (!documentId || typeof documentId !== 'string') throw new HttpError(400, 'documentId required');

  const { data: doc, error } = await sb
    .from('documents')
    .select('id, name, document_type, year, business_id, profile_id')
    .eq('id', documentId)
    .maybeSingle();

  if (error) {
    console.error('[snapshot] document lookup failed');
    throw new HttpError(500, 'Internal server error');
  }
  if (!doc) throw new HttpError(404, 'Not found');

  if (!doc.profile_id) throw new HttpError(409, 'This document is not attached to an owner');
  if (!doc.business_id) throw new HttpError(409, 'This document is not attached to a business');

  // No try/catch: assertBusinessAuthority already throws the correct status, and catching
  // it is how a 500 would get reclassified as a 404.
  await assertBusinessAuthority(sb, actor, doc.business_id);

  return doc;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[snapshot] supabase not configured');
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. IDENTITY — the real boundary, before the body is even parsed. ──────
    // 401 no session · 403 no binding / duplicate binding / ineligible status · 500 lookup fault.
    // Everything below is unreachable without a single verified canonical actor.
    const actor = await resolveCanonicalActor(base44, sb);

    // ── 2. REQUEST BODY — may describe WHAT is requested, never WHO may act, never a VALUE. ──
    // `profile_id`, `actor_profile_id`, `target_profile_id`, `_router_user_email`, `role`,
    // `email`, `created_by`, `business_id` are neither read nor needed: identity and tenant are
    // established above and below from persisted rows. They are inert, not rejected, so an
    // unused key cannot break a legitimate caller.
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const {
      documentId,
      snapshotType = null,
      isLatest = false,
      updateDashboard = false,
    } = body || {};

    if (snapshotType !== null && snapshotType !== undefined && !SNAPSHOT_TYPES.includes(snapshotType)) {
      throw new HttpError(400, 'snapshotType must be one of historical, tax_year, projection');
    }
    if (typeof isLatest !== 'boolean' || typeof updateDashboard !== 'boolean') {
      throw new HttpError(400, 'isLatest and updateDashboard must be booleans');
    }

    // ── 3. AUTHORIZE — document row → tenant → exact approved policy. ─────────
    const document = await loadAuthorizedDocument(sb, actor, documentId);
    const businessId = document.business_id;
    const documentType = document.document_type;

    if (documentType === 'personal_tax_return') {
      return Response.json({
        error: 'Personal tax returns are not yet supported for snapshot creation',
        message: 'This will be available in a later phase for profile_financials',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    const contract = FIELD_CONTRACT[documentType];
    if (!contract) {
      return Response.json({
        error: `Unsupported document type: ${documentType}`,
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    // ── 3b. REPORTING YEAR — REQUIRED. The snapshot is dated by its document's own period. ──
    // A friendly pre-check; the RPC enforces the same rule authoritatively.
    const year = Number(document.year);
    if (!document.year || !Number.isInteger(year)) {
      throw new HttpError(409, 'This document has no reporting year, so it cannot be dated. Set the document year and try again.');
    }
    if (year < MIN_REPORTING_YEAR || year > MAX_REPORTING_YEAR) {
      throw new HttpError(409, 'This document reporting year falls outside the supported range.');
    }

    // ── 4. RESOLVE — accepted/corrected fields, read COMPLETELY or not at all ──
    // (Revision 7, finding R7-2.) Revision 6 paged this read to remove one silent-truncation
    // path and left two others open:
    //   · a page SHORTER than requested was read as "exhausted". If the project's PostgREST
    //     `db-max-rows` cap (Supabase default 1000 — NOT VERIFIED for this project) is below
    //     the page size, the first page comes back short and the loop stops after ONE partial
    //     page: exactly the failure the paging was added to prevent;
    //   · offset windows (`range(from, to)`) shift when rows are inserted or deleted between
    //     pages, so a row can be read twice or skipped entirely.
    // D2 catches neither: both of its guards prove "what I sent is real"
    // (SNAPSHOT_FIELD_NOT_CONTRACTED, SNAPSHOT_CONTRIBUTOR_DRIFT), never "I sent everything".
    //
    // The read is therefore CLOSED BY AN EXPECTATION, not by a short page:
    //   4a. an exact server-side COUNT over the same predicate (no rows returned);
    //   4b. exactly the pages that expectation implies, each required to return its own
    //       expected length — short or long is a REFUSAL, never exhaustion;
    //   4c. duplicate-id detection across pages — a shifted offset shows up as a repeat;
    //   4d. a second COUNT after the read that must equal the first;
    //   4e. hard ceilings on the population and on the skipped list.
    // Any deviation refuses (409) before the RPC, so no partial basis can be published as a
    // complete figure.
    //
    // RESIDUAL, stated rather than papered over: a NET-ZERO concurrent change between the two
    // counts (one accepted row inserted, another deleted) is invisible to this method.
    // Eliminating it requires the population to be counted inside the RPC's transaction —
    // proposed as B14 (§10), NOT adopted here, because it changes D2.
    const FIELD_PAGE_SIZE = 200;
    const MAX_FIELD_PAGES = 20;                         // 4,000 rows
    const MAX_FIELDS = FIELD_PAGE_SIZE * MAX_FIELD_PAGES;
    const MAX_SKIPPED = 1000;                           // D2 V-10's own limit on p_skipped

    const countReviewedFields = async (): Promise<number> => {
      const { count, error } = await sb
        .from('extracted_fields')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .eq('business_id', businessId)
        .in('review_status', ['accepted', 'corrected']);

      if (error) {
        console.error('[snapshot] reviewed-field count failed');
        throw new HttpError(500, 'Internal server error');
      }
      // A count we could not read is NOT a zero. Refuse rather than page against a guess.
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        console.error('[snapshot] reviewed-field count is not a usable integer');
        throw new HttpError(500, 'Internal server error');
      }
      return count;
    };

    const expected = await countReviewedFields();

    if (expected === 0) {
      return Response.json({
        error: 'No accepted or corrected fields found for this document',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }
    if (expected > MAX_FIELDS) {
      // The ceiling is stated, not discovered. Above it the set cannot be read and proven in
      // one request, and a partial contributor set is exactly what must not be published.
      console.error('[snapshot] reviewed-field population above the supported ceiling');
      throw new HttpError(409, 'This document has too many reviewed fields to snapshot in one request');
    }

    const fields: any[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < MAX_FIELD_PAGES; page++) {
      const offset = page * FIELD_PAGE_SIZE;
      const want = Math.min(FIELD_PAGE_SIZE, expected - offset);
      if (want <= 0) break;

      const { data: pageRows, error: fieldsError } = await sb
        .from('extracted_fields')
        .select('id, field_name, reviewed_at, created_at')
        .eq('document_id', documentId)
        .eq('business_id', businessId)
        .in('review_status', ['accepted', 'corrected'])
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + want - 1);

      if (fieldsError) {
        console.error('[snapshot] field read failed');
        throw new HttpError(500, 'Internal server error');
      }
      if (!Array.isArray(pageRows)) {
        console.error('[snapshot] field response is not an array');
        throw new HttpError(500, 'Internal server error');
      }
      if (pageRows.length !== want) {
        // Short ⇒ truncated by a cap, or rows deleted mid-read. Long ⇒ rows inserted ahead of
        // the window. Either way the population is not proven, and a partial snapshot is worse
        // than a refusal.
        console.error('[snapshot] reviewed-field page does not match the expected population');
        throw new HttpError(409, 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.');
      }

      for (const row of pageRows as any[]) {
        if (typeof row?.id !== 'string' || row.id.length === 0) {
          console.error('[snapshot] reviewed-field row carries no usable id');
          throw new HttpError(500, 'Internal server error');
        }
        if (seenIds.has(row.id)) {
          // The same row on two pages: the offset window moved under the read. Also the
          // property the comparator's final tie-break depends on — ids must be unique.
          console.error('[snapshot] duplicate reviewed-field id across pages');
          throw new HttpError(409, 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.');
        }
        seenIds.add(row.id);
        fields.push(row);
      }
    }

    // 4d. CLOSE THE SET — a second independent count over the same predicate.
    const expectedAfter = await countReviewedFields();
    if (expectedAfter !== expected || fields.length !== expected) {
      console.error('[snapshot] reviewed-field population moved during the read');
      throw new HttpError(409, 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.');
    }

    /**
     * TOTAL ORDER over (reviewed_at, created_at, id) — relational comparisons only.
     *
     * (Revision 7, finding R7-1.) Revision 6 mapped every absent or malformed timestamp to
     * `Number.NEGATIVE_INFINITY` and then compared with SUBTRACTION:
     *     recency(a) - recency(b)  →  -Infinity - (-Infinity)  →  NaN
     * `NaN !== 0` is true, so the comparator returned NaN; `Array.prototype.sort` treats a
     * NaN result as +0 ("equal"), so the `created_at` and `id` tie-breaks were NEVER
     * consulted — the same nondeterministic-winner defect the guard was written to remove,
     * reintroduced through arithmetic instead of parsing. It fires whenever two rows each
     * lack a usable `reviewed_at`, which after the guard is every malformed value.
     *
     * The fix removes arithmetic from the comparison, not merely the NaN:
     *   · a timestamp is CLASSIFIED first — `{ ok: true, ms }` or `{ ok: false }` — so an
     *     unparseable or absent value is never represented as a number at all;
     *   · every comparison is `<` / `>` / kind-equality, returning only -1, 0 or 1;
     *   · absent and malformed are the SAME kind and sort OLDEST, so a row with a real
     *     review timestamp always beats one without;
     *   · the last tie-break is the unique `id` (uniqueness is enforced in step 4c), which
     *     makes the order TOTAL: two distinct rows can never compare equal, so the winner is
     *     a function of the set alone — independent of input order and of sort stability.
     */
    type Stamp = { ok: boolean; ms: number };

    const stamp = (v: any): Stamp => {
      if (typeof v !== 'string' || v.length === 0) return { ok: false, ms: 0 };
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? { ok: true, ms } : { ok: false, ms: 0 };
    };

    const compareStamps = (a: Stamp, b: Stamp): number => {
      if (a.ok !== b.ok) return a.ok ? 1 : -1;   // a real timestamp sorts LATER than none
      if (!a.ok) return 0;                       // both absent/malformed: equal at THIS key
      if (a.ms < b.ms) return -1;
      if (a.ms > b.ms) return 1;
      return 0;
    };

    const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

    const orderedFields = fields
      .map((field: any) => ({
        field,
        review: stamp(field.reviewed_at),
        created: stamp(field.created_at),
      }))
      .sort((x: any, y: any) => {
        const byReview = compareStamps(x.review, y.review);
        if (byReview !== 0) return byReview;
        const byCreated = compareStamps(x.created, y.created);
        if (byCreated !== 0) return byCreated;
        return compareIds(String(x.field.id), String(y.field.id));
      })
      .map((entry: any) => entry.field);

    // Built from the ORDERED list, so `.slice(-1)` is the latest-reviewed row of that name.
    const idsByName = new Map<string, string[]>();
    for (const field of orderedFields as any[]) {
      const list = idsByName.get(field.field_name) || [];
      list.push(field.id);
      idsByName.set(field.field_name, list);
    }

    // ── SELECTION ONLY: targets and the field ids that fill them, in CONTRACT order. ──
    const fieldMap: any[] = [];
    const used = new Set<string>();

    for (const spec of contract.targets) {
      const all = idsByName.get(spec.from) || [];
      const selected = spec.cardinality === 'one' ? all.slice(-1) : all;
      // A target with no contributing row is OMITTED — never written as 0.
      if (!selected.length) continue;
      fieldMap.push({ target: spec.target, op: spec.op, field_ids: selected });
      selected.forEach((id: string) => used.add(id));
    }

    /**
     * A skipped entry is `{ field, reason }` — the KEY SET D2 V-12 permits. The `field` value
     * is the field's ID, not its name, because V-15 refuses two entries naming the same
     * `field`, and a NAME can legitimately repeat: a `cardinality: 'one'` target consumes only
     * the latest-reviewed row of its name, leaving earlier same-name rows unconsumed. An id is
     * unique by construction, so this can never trip V-15.
     */
    const skipped = (orderedFields as any[])
      .filter((f: any) => !used.has(f.id))
      // The reason must be TRUE for every cause of a skip, not only the uncontracted one: a
      // superseded duplicate CAN have a destination it was simply not selected for, so
      // "no destination in contract" would misstate it (D7B P-5). The reason is
      // caller-declared metadata — never adjudicated by D2, and no test asserts its text.
      .map((f: any) => ({ field: f.id, reason: `Not selected for mapping (${MAPPING_VERSION})` }));

    // D2 V-1 refuses an empty `p_field_map`; say so in words rather than letting the RPC say it.
    if (fieldMap.length === 0) {
      return Response.json({
        error: 'No accepted or corrected field maps to a snapshot target',
        skipped_fields: skipped.map((s: any) => ({ field_id: s.field, reason: s.reason })),
        mapped_fields: [],
      }, { status: 400 });
    }

    // 4e. SKIPPED BOUND — D2 V-10 refuses more than 1,000 entries, which would otherwise
    // surface as an opaque 500 ("SNAPSHOT_INVALID_SKIPPED" → internal defect). Refuse in
    // words instead, before the write. Revision 7, R7-2: the bound is stated, not implicit.
    if (skipped.length > MAX_SKIPPED) {
      console.error('[snapshot] skipped-field list above the contract limit');
      throw new HttpError(409, 'This document has too many reviewed fields that map to no snapshot target');
    }

    // ── 5. WRITE — one atomic, idempotent, serialized RPC. Values are read inside it. ──
    // The ONLY persistence in this file. No insert, no update, no is_latest demotion here.
    const { data: result, error: rpcError } = await sb.rpc('create_reviewed_fields_snapshot', {
      p_business_id: businessId,
      p_source_document_id: documentId,
      p_actor_profile_id: actor.profile_id,            // verified session identity — never the body
      p_actor_base44_user_id: actor.user.id,           // verified session identity — attribution only
      p_mapping_version: MAPPING_VERSION,
      p_basis: contract.basis,
      p_snapshot_type: snapshotType,                   // null ⇒ default applied in the database
      p_field_map: fieldMap,
      p_skipped: skipped,
      p_is_latest: isLatest,
      // The request may ASK; the constant decides. The RPC re-checks its own copy, so a direct
      // RPC call cannot bypass this either.
      p_update_dashboard: updateDashboard === true && DASHBOARD_PROJECTION_ENABLED,
    });

    if (rpcError) {
      console.error('[snapshot] atomic write failed:', rpcError.message);
      throw mapRpcError(rpcError);
    }

    // ── 6. VALIDATE THE RESULT — before any success is claimed ────────────────
    // (Revision 7, finding R7-3.) A 200 from PostgREST with no `error` says the RPC RETURNED.
    // It says nothing about WHAT it returned. The Revision 6 code read every field with
    // `?? null` / `=== true` fallbacks, so a null or partial body produced
    // `success: true, snapshot_id: null` — a success claim built from nothing — and a
    // malformed `skipped` silently reported the REQUEST back as if it were the echo.
    //
    // ⚠ COMMIT UNCERTAINTY — read this before retrying. `create_reviewed_fields_snapshot`
    // writes the snapshot, the audit row and (when enabled) the dashboard row inside ONE
    // transaction that COMMITS BEFORE IT RETURNS. A malformed result therefore does NOT mean
    // nothing was written: the transaction may already have committed, and this endpoint
    // cannot tell. The safe answer is a generic 500 carrying no snapshot id — and a retry is
    // NOT automatically safe: it must first be reconciled against snapshot_submission_audit.
    // (An identical-content retry is idempotent through dedupe; different content is a second
    // snapshot.)
    const resultFault = (why: string): HttpError => {
      console.error('[snapshot] RPC result is unusable: ' + why);
      return new HttpError(500, 'Internal server error');
    };

    if (!result || typeof result !== 'object' || Array.isArray(result)) throw resultFault('not an object');
    const rpcResult = result as Record<string, any>;

    // A snapshot identifier is the one thing a caller cannot work without.
    const snapshotId = rpcResult.snapshot_id;
    if (typeof snapshotId !== 'string' || !UUID_PATTERN.test(snapshotId)) throw resultFault('snapshot_id');

    // NOT validated against SNAPSHOT_TYPES: on the dedupe path D2 echoes the EXISTING row's
    // type (`coalesce(v_existing_type, v_snapshot_type)`), and a pre-existing row may carry
    // any value the column's own CHECK permits (`current`, `prior`, `quarter`). Refusing it
    // would break a legitimate retry.
    if (typeof rpcResult.snapshot_type !== 'string' || rpcResult.snapshot_type.length === 0) {
      throw resultFault('snapshot_type');
    }

    for (const key of ['deduplicated', 'dashboard_metrics_updated', 'promoted_over_newer', 'is_latest']) {
      if (typeof rpcResult[key] !== 'boolean') throw resultFault(key);
    }

    // `applied` is a JSON OBJECT from the database (`v_metrics || v_meta_metrics`), never an
    // array — and never empty, because V-1 refuses an empty field map and V-14 refuses a
    // contributor set that yields no value. An empty object here contradicts accepted inputs.
    const appliedRaw = rpcResult.applied;
    if (!appliedRaw || typeof appliedRaw !== 'object' || Array.isArray(appliedRaw)) throw resultFault('applied');
    const applied = appliedRaw as Record<string, unknown>;
    if (Object.keys(applied).length === 0) throw resultFault('applied is empty');

    // The SQL echoes `{ field, reason }`; the API reports `{ field_id, reason }` (T-806/T-811).
    // Taken ONLY from the validated echo — the request is never substituted for a result.
    const echoedRaw = rpcResult.skipped;
    if (!Array.isArray(echoedRaw)) throw resultFault('skipped');
    const skippedApplied: Array<{ field: string; reason: string | null }> = [];
    for (const entry of echoedRaw as any[]) {
      if (!entry || typeof entry !== 'object' || typeof entry.field !== 'string') throw resultFault('skipped entry');
      skippedApplied.push({ field: entry.field, reason: typeof entry.reason === 'string' ? entry.reason : null });
    }

    const confidence = rpcResult.confidence_score;
    if (confidence !== null && confidence !== undefined) {
      if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
        throw resultFault('confidence_score');
      }
    }

    const dashboardReason = rpcResult.dashboard_skipped_reason;
    if (dashboardReason !== null && dashboardReason !== undefined && typeof dashboardReason !== 'string') {
      throw resultFault('dashboard_skipped_reason');
    }

    // The database merges the metric columns and the metadata targets into ONE flat object, so a
    // metadata target arrives as its BARE key (`total_equity`, not `metadata.total_equity`).
    const metadataTargets = new Set(
      contract.targets
        .filter((t) => t.target.startsWith('metadata.'))
        .map((t) => t.target.slice('metadata.'.length)),
    );

    const mapped = Object.keys(applied).map((k) => ({
      field: k,
      mapped_to: metadataTargets.has(k) ? `metadata.${k}` : k,
    }));

    const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const message = rpcResult.deduplicated === true
      ? `Snapshot already existed with ${plural(mapped.length, 'field')}; this submission was recorded.`
      : skippedApplied.length > 0
        ? `Snapshot created with ${plural(mapped.length, 'field')}. ${plural(skippedApplied.length, 'field')} skipped (partial snapshot).`
        : `Snapshot created successfully with ${plural(mapped.length, 'field')}.`;

    return Response.json({
      success: true,
      snapshot_id: snapshotId,
      snapshot_type: rpcResult.snapshot_type,
      is_latest: rpcResult.is_latest,
      fields_mapped: mapped,
      fields_skipped: skippedApplied.map((s) => ({
        field_id: s.field,
        reason: s.reason,
      })),
      dashboard_metrics_updated: rpcResult.dashboard_metrics_updated,   // always false while disabled
      dashboard_skipped_reason: dashboardReason
        ?? (updateDashboard === true && !DASHBOARD_PROJECTION_ENABLED ? 'projection_disabled' : null),
      promoted_over_newer: rpcResult.promoted_over_newer,
      deduplicated: rpcResult.deduplicated,
      confidence_score: confidence ?? null,
      message,
    });

  } catch (error) {
    // HttpError carries an explicit safe status; anything else is logged and returned as a
    // generic 500. No database message ever reaches the caller.
    return errorResponse(error);
  }
});
```

---

## 5. Authentication and authorization flow — ordered, with the failure that stops it

Nothing below writes until step 16, and step 16 is a single RPC.

| # | Step | Source of truth | Failure | Writes? |
|---|---|---|---|---|
| 1 | `createClientFromRequest(req)` | request | — | no |
| 2 | Configuration present | environment | 500 | no |
| 3 | `base44.auth.me()` — **classified** | **session only** | **401** on status 401 · **403** on any other delivered 4xx · **500** on no response / 5xx | no |
| 4 | `user.id` present | **session only** | **401** | no |
| 5 | Profile list read by `base44_user_id` equality | `profiles` | **500** on query error **or a non-array body** | no |
| 6 | Exactly one row, structurally usable, carrying **this** session id | `profiles` | **403** on 0 or >1 — no email fallback, no tie-break · **500** if the single row has no usable `id` or a different `base44_user_id` | no |
| 7 | Status ∈ `{active, incomplete}` | `profiles.profile_status` | **403** | no |
| 8 | Standing from `profiles.app_role` | canonical row | — (denial happens at 10) | no |
| 9 | Parse body: `documentId`, `snapshotType`, `isLatest`, `updateDashboard` | request | 400 | no |
| 10 | Document read → `business_id`, `profile_id` | `documents` row | **404** absent · **409** no owner · **409** no business | no |
| 11 | Business exists | `business_entities` | **404** · **500** on query error | no |
| 12 | Authority: admin **or** owner-of-record **or** a non-ended `business_owners` row — `end_date is null or end_date >= <UTC today>`, exactly D2's predicate (**list read, `limit 1`** — never `maybeSingle`, which a two-ownership owner would turn into a 500) | persisted relationship | **404** (denial = absence) · **500** on query error or a non-array body | no |
| 13 | Year present and in range | `documents.year` | 409 | no |
| 14 | Accepted/corrected fields, tenant-pinned, **count-closed read** — exact count → pages sized from it → duplicate-id check → second count | `extracted_fields` | 500 on read failure, non-array page, unusable count or unusable row id · **409** on any closure mismatch (short/long page, duplicate id, count moved, population or skipped above its ceiling) · 400 when empty | no |
| 15 | Selection built; non-empty; skipped list within **1,000** | contract mirror | 400 · **409** above the skipped bound | no |
| 16 | `create_reviewed_fields_snapshot(...)` | **the only writer** | mapped code | **yes — one transaction** |
| 16a | **RPC result validated** before any success is built | response body | **500**, generic, **no snapshot id** — and the transaction **may already have committed**, so a retry requires reconciliation against the audit table first | **already committed** |

**Four properties this ordering buys, each testable:**

1. **No write is reachable before step 16.** Steps 3–15 are reads. A failure in any of them aborts with nothing persisted (T-109, T-110, T-903, T-904).
2. **The body cannot name the actor.** `p_actor_profile_id` and `p_actor_base44_user_id` are assigned exactly once each, from `actor`, which only steps 3–8 can produce (T-107, T-108, T-905).
3. **The caller's role is the only role consulted.** No `document.profile_id → profiles.app_role` read exists anywhere in the file (A-3 eliminated) (T-210b).
4. **The tenant is the document's.** `businessId` is assigned from `document.business_id` and never from `body.business_id` (T-206).

---

## 6. What this proposal deliberately does **not** do

| # | Not done | Why |
|---|---|---|
| N-1 | **`base44/shared/authz/actor.ts` is not edited** | Explicitly out of bounds without separate approval. Not one line, including its header |
| N-2 | **Nothing is deployed, and the deployed file is unmodified** | This turn is source inspection and proposal only. B9 therefore **stays open** (§10) |
| N-3 | **Authority-shaped body keys are ignored, not rejected** | T-107 and T-903 already assert *ignored*; the UI sends only the four supported keys. Rejecting would change the caller contract for no security gain — an unread key cannot override a value that was never read from it. The considered alternative is recorded rather than silently dropped |
| N-4 | **Advisor authority stays disabled (D-4)** | No assignment writer or revocation evidence exists. Flipping it is a separate decision, mirrored in the RPC |
| N-5 | **Dashboard projection stays disabled (D-19)** | Both layers re-check; enabling is a two-constant change-set |
| N-6 | **`created_by` stays unwritten (D-13)** | The RPC omits the column and asserts it NULL. The endpoint passes no such parameter |
| N-7 | **The mapping contract, dedup, audit and year rules are untouched** | FIELD_CONTRACT is copied verbatim from D1; the RPC owns the rest |

---

## 7. Shared-helper consumer inventory — risk from a future global removal of the email fallback

`authenticateActor` is **imported and called in 20 files** (18 functions, 2 shared modules). It is *referenced in comments* by `base44/shared/businessScope/relationshipAccess.ts` but **not called** there, so that file is not a consumer.

| # | File | Call site | What the actor decides | If the email fallback were removed globally |
|---|---|---|---|---|
| 1 | `buildGalileoContext/entry.ts` | 78 | acts-for-self vs admin override | **MEDIUM** — an unbound caller's Galileo context becomes 403 instead of resolving by email |
| 2 | `businessMemoryService/entry.ts` | 66 | passed into a shared module | **MEDIUM** |
| 3 | `documentAssignments/entry.ts` | 176 | `isAdmin`, `profile_id`, manage-capability | **HIGH** — the Data Room's write contract; an unbound manager loses the ability to assign |
| 4 | `getDocumentsAdmin/entry.ts` | 102 | `isAdmin` gate + `role` echo | **HIGH** — an unbound admin loses the entire Files view |
| 5 | `liveSyncOrchestrator/entry.ts` | 136 | control-plane `isAdmin` | **MEDIUM** — control plane refuses rather than mis-authorizes |
| 6 | `livingIntelligence/entry.ts` | 45 | passed into a shared module | **MEDIUM** |
| 7 | `meetingIntelligence/entry.ts` | 39 | passed into a shared module | **MEDIUM** |
| 8 | `ninetyDaySprint/entry.ts` | 146 | passed into a shared module | **MEDIUM** |
| 9 | `postMeetingIntelligence/entry.ts` | 53 | passed into a shared module | **MEDIUM** |
| 10 | `providerSyncWorker/entry.ts` | 100 | worker identity + `isAdmin` | **MEDIUM–HIGH** — a worker derives its id from the actor; a refusal could stall a sync loop rather than mis-authorize. **Must be assessed before any global change** |
| 11 | `runDocumentExtraction/entry.ts` | 92 | `profile_id`, `isAdmin`, `hasProfile` | **HIGH** — `hasProfile` already 404s; losing the fallback turns a working extraction into a 404 |
| 12 | `supabaseDashboardData/entry.ts` | 48 | passed into a shared module | **HIGH** — client dashboard data plane |
| 13 | `supabaseDocumentData/entry.ts` | 48 | passed into a shared module | **HIGH** |
| 14 | `supabaseOpportunityData/entry.ts` | 48 | passed into a shared module | **HIGH** |
| 15 | `supabaseProfileData/entry.ts` | 45 | `isSuperAdmin` / `isAdmin` for admin actions | **HIGH** — includes `updateProfileRole`, the historic privilege-escalation path |
| 16 | `supabaseRoadmapData/entry.ts` | 40 | passed into a shared module | **HIGH** |
| 17 | `supabaseUserData/entry.ts` | 176 | `isAdmin` at 1472/1567 | **HIGH** |
| 18 | `supabaseVerificationData/entry.ts` | 41 | passed into a shared module | **HIGH** |
| 19 | `shared/businessStateSync/liveSyncAuthorization.ts` | 434 | actor for live-sync decisions | **MEDIUM** — shared path, so it propagates outward |
| 20 | `shared/providers/authorization.ts` | 516 | actor for provider authorization | **MEDIUM–HIGH** — CB-005A/005B surface; a refusal here changes provider behaviour |

### 7.1 What the inventory can and cannot say

**Can say:** removal is technically contained (one function, one branch, 20 call sites), and the *blast radius is entirely "unbound user loses access"* rather than "wrong user gains access" — the fallback uses the **session's** verified email, never a body field, so it is not a forgery vector.

**Cannot say, and must not be assumed:** how many of the 8 deployed profiles are unbound. D4 probe 5 expects *1 unbound, 0 duplicates* but is **[PLAN-PROBE]**, not verified (B7), and the preflight measured only the active/incomplete split (1 active, 7 incomplete). **The size of the population that would break is unknown.** Any global change must therefore be preceded by:

| # | Precondition for a global removal |
|---|---|
| G-1 | A read-only count of `profiles` where `base44_user_id IS NULL`, per role — the exact population at risk |
| G-2 | A read-only count of duplicate `base44_user_id` values — which today is silently resolved by email and would become a hard 403 |
| G-3 | Per-consumer confirmation that none of the 20 relies on the fallback *deliberately* (the workers are the ones to check, not the read paths) |
| G-4 | A backfill decision using the existing `backfillBase44UsersToProfiles` / `syncBase44UserToSupabaseProfile` functions, **before** the fallback is removed — not after |
| G-5 | Separate authorization. This deliverable does not grant it |

**B10's implementation does not need any of that**, because it touches one endpoint. That is the whole reason option (b) was chosen over (c).

---

## 8. Test IDs — new, amended, and one withdrawn expectation

Register: **97 → 100** (Revision 5) → **101** (Revision 7 adds **T-906**). No other ID was added, removed or reclassified, and no expectation was moved between IDs.

### 8.1 New

| ID | Scenario | Expected | Mode |
|---|---|---|---|
| **T-111** | **Strict identity, owner path, `profile_status = 'incomplete'`.** A session bound to exactly one profile whose status is the column default | **Allowed**; snapshot created; audit `actor_profile_id` is that profile. Proves §3.2 — the allowlist admits the production default, so the strict rule does not lock out legitimate owners | Live session |
| **T-904** | **Direct-write bypass regression.** (a) *Static, comments stripped first* — **0** `from('business_metric_snapshots')` · **0** `from('dashboard_metrics')` · **0** `.insert(` / `.update(` / `.upsert(` / `.delete(` on **any** table · **0** `.neq(` (the demotion shape) · **exactly 1** `sb.rpc('create_reviewed_fields_snapshot'` · `p_is_latest:` present **exactly once**, bound to the validated request boolean, and the file's **only** latest-flag path · **every** `sb.from(` in the file is a read (`.select(` count ≥ `sb.from(` count). `p_is_latest` (**an RPC parameter**) and `is_latest` (**a response property**) are explicitly **permitted** — the token count this row used to require was impossible to satisfy. (b) *Behavioural:* a call refused at the RPC (no reporting year) leaves snapshot, dashboard and audit counts unchanged — proving no fallback write path exists | **PASS** only when every clause holds; against the current deployed file (a) **fails** at `from('business_metric_snapshots')` — recorded `DB-FAIL` as B9 evidence | Static + DB |
| **T-906** | **RPC result validation (Revision 7, R7-3).** *(a) Static, comments stripped:* before the `Response.json({ success: true` construction the file validates `result` (non-array object), `snapshot_id` against `UUID_PATTERN`, `snapshot_type` as a **non-empty string** (never against `SNAPSHOT_TYPES`), the four booleans (`deduplicated`, `dashboard_metrics_updated`, `promoted_over_newer`, `is_latest`), `applied` as a **non-empty object**, `skipped` as an array of `{field, reason}`, `confidence_score` as `null` or `0…100`, and `dashboard_skipped_reason` as `null`-or-string; **no** `result?.` optional-chaining fallback reaches the success object; **0** occurrences of `Array.isArray(result?.skipped) ? result.skipped : skipped`. *(b) Behavioural — needs an injection point that makes the RPC return a malformed body without erroring; no such mechanism is authorized (same class as T-411's B2), so this half is `NOT RUN` until one is.* **Documented expectation, not a test:** a malformed result returns a generic **500 with no snapshot id** and the transaction **may have committed**; the operator reconciles against `snapshot_submission_audit` before any retry | **PASS** only when every static clause holds; behavioural half `NOT RUN` | Static (+ deferred behavioural) |
| **T-905** | **Strict-helper fingerprint.** In `shared/authz/canonicalActor.ts`: `.ilike(` = **0** · `email` appears **only** as a carried field, never in a predicate · `.eq('base44_user_id'` = **1** · `.maybeSingle()` = **0** · `.single()` = **0** · the read is a **list** · `ADMIN_ROLES` is **imported**, not re-declared · no `insert`/`update`/`upsert`. And in the endpoint: `resolveCanonicalActor` is **imported** and called **once**; `authenticateActor` is **not** imported | **PASS** only when every clause holds | Static |

### 8.2 Amended

| ID | Amendment |
|---|---|
| **T-102** | Unchanged verdict (**403**, zero writes, email never consulted). Adds: the refusal is produced by `resolveCanonicalActor`, and the file contains **no email predicate at all** (T-905) — so the pass cannot be accidental |
| **T-105** | **Restated, not withdrawn.** Old text assumed a resolver could return profile A by email while B was id-bound. Under the strict resolver no email resolution exists. New meaning: **A has the `base44_user_id` binding and B matches the session email.** A succeeds; the session resolves to A; **B is unreachable** — the audit row names A, never B. Zero ambiguity, zero email consultation |
| **T-108** | Static list updated: `authenticateActor` **0** occurrences · `resolveCanonicalActor` imported and called exactly once · `resolveActingProfile` **0** · `.ilike(` **0** · `p_actor_profile_id` sourced from `actor.profile_id` exactly once · `p_actor_base44_user_id` from `actor.user.id` exactly once · no `document.profile_id → app_role` read · **Revision 6:** the `extracted_fields` read is **paged** (`.range(` present, page size and ceiling are named constants) and no unbounded `.select(` on that table remains · **Revision 7 (R7-1):** the comparator chain contains **no subtraction** — `+`/`-` between two timestamp values appears **0** times; every comparison returns only `-1`/`0`/`1`; absent and malformed are the **same** classified kind (`{ ok: false }`), never a numeric sentinel · **Revision 7 (R7-2):** a `count: 'exact', head: true` read exists over the same predicate, the page loop is driven by that count (`want`), a duplicate-id `Set` rejects a repeat, a **second** count runs after the read, and both `MAX_FIELDS` and `MAX_SKIPPED` are named constants · **Revision 7 (R7-3):** `UUID_PATTERN` is validated against `snapshot_id` and no `result?.` fallback reaches the success object (T-906) |
| **T-209** | **The field read is not provably complete (Revision 7, R7-2).** Five fixtures, each applied to a document whose population is known: **(a)** a page shorter than the expected length (simulating a `db-max-rows` cap below the page size) · **(b)** a page longer than expected · **(c)** the same row returned on two consecutive pages · **(d)** one accepted row deleted between the first count and the read · **(e)** one accepted row inserted during the read so the second count disagrees | **409 "The reviewed fields changed while this snapshot was being prepared. Reload and try again."** in (a)–(e), with **zero** snapshot, dashboard and audit rows. **Never** a snapshot built from the partial set, and never a 500 (a cap is not an internal defect). A sixth fixture — population above `MAX_FIELDS` — returns the population **409**, and a skipped list above 1,000 returns the skipped **409**; both before the RPC |
| **T-109** | **Amended (Revision 6, finding 5).** A thrown `auth.me()` is **classified by `.status`**, not flattened: `status === 401` → **401** · any other delivered 4xx → **403** · **no status** (transport failure) or 5xx → **500**. `auth.me()` **returning null** → **401**. In every branch **no profile read is attempted** (asserted from the statement log, or the absence of any query effect). The old wording — "a thrown error is converted to 401, never propagated as a 500" — is **withdrawn**: it required an infrastructure fault to be reported as an authentication verdict |
| **T-110** | Extended beyond `suspended`: `invited`, `suspended`, and an unobserved status value are each **403**; `active` and `incomplete` are each **allowed** (the positive half is T-111) |
| **T-903b** | Clauses updated to the new file: `canonicalActor` imported and `resolveCanonicalActor` called · `authenticateActor` **not** imported · `auth.me()` not swallowed into a nullable user that continues · no gate conditioned on `if (user && …)` · `p_actor_profile_id` from `actor.profile_id` once · `p_actor_base44_user_id` from `actor.user.id` once · `created_by` absent · `business_metric_snapshots` absent · the RPC called. Against the **deployed** file it still **fails** — B9 remains open until deployment |
| **T-806 / T-811 / T-414** | **Expectations unchanged** (`fields_skipped` carries `field_id` and `reason`). They now also assert the C-3 mapping: the RPC's `skipped` echoes `{field, reason}` and the response renames `field` → `field_id` |
| **T-301** | Unchanged, but now also covers the **`p_skipped` key-set** parity: V-12's `{field, reason}` is what the caller emits (C-3), and the caller's `{field_id, reason}` in D1 §3 would have failed it — recorded as **F-1** |

### 8.3 New expectation that is **not** a new ID

| Where | Assertion |
|---|---|
| **T-810 (extended)** | A document whose accepted fields **all** feed no target now returns **400 "No accepted or corrected field maps to a snapshot target"** *before* the RPC (C-4). Previously this reached the RPC and produced `SNAPSHOT_INVALID_INPUT`. Same status, different message, one fewer round trip — asserted inside T-810 rather than given a new ID |
| **T-801 (variants added)** | **Variant A — deterministic selection (Revision 6, finding 7).** A P&L document carrying **two accepted `annual_revenue` rows** plus **one with a malformed `reviewed_at`**: the later-reviewed row wins, the malformed row never wins over a valid one, and **three consecutive runs select the same `field_ids`**. **Variant B — the case Revision 6 could not decide (Revision 7, R7-1).** The same target fed by **three** `annual_revenue` rows, **two of them with missing-or-malformed `reviewed_at`** (`null` and `"not-a-date"`), the third with a valid one — the valid row wins. Then **all three** missing-or-malformed, with **distinct `created_at`** — the later `created_at` wins. Then **all three** missing-or-malformed with **identical `created_at`** — the **lexicographically greatest `id`** wins, and **three consecutive runs select the same `field_ids`** in each of the three fixtures. Without Variant B the previous form returned `NaN` for every pair of undated rows, which `sort` reads as "equal" and which skips both tie-breaks. Asserted inside T-801 rather than given new IDs — the register moves only by **T-906** |

---

## 9. Reconciliation of D1–D4 and the execution safety plan

| Doc | Change | Why |
|---|---|---|
| **D1** | §3 marked **WITHDRAWN as the authoritative caller text** and repointed to §4 here; §5's identity invariants updated to name `resolveCanonicalActor` | Two copies of a 500-line file would drift; a reviewer must not deploy the superseded one |
| **D2** | **Unchanged.** No SQL edit, no signature change, no guard edit | The migration was never the problem, and F-1 is fixed in the **caller**, not by loosening V-12 |
| **D3** | Header → Revision 5; T-111 / T-904 / T-905 added; T-102, T-105, T-108, T-109, T-110, T-903b, T-806/811/414, T-301 amended; register **100**. **Revision 6:** T-904's clause set **replaced**, T-109 **restated**, T-108 gains the paging and comparator clauses, T-801 gains a deterministic-selection variant, T-106 extended to the malformed-response case — **register unchanged at 100**. **Revision 7:** T-108 gains the no-subtraction and count-closure clauses, T-209 gains five completeness fixtures, T-801 gains **Variant B** (two or more undated rows), **T-906 added** — register **101** | The tests must assert the policy actually chosen, and must be **satisfiable by a correct implementation** |
| **D4** | Header note: identity probes are now governed by §7's G-1/G-2. **Revision 7:** §1 rewritten — the target is a **shared** test project with a **synthetic-only write boundary**, not an isolated one; §6's stale claims about the caller corrected (no `try/catch`, no advisor constant); §8 gains B13/B14 and the 101-ID register | Probe 5's population question became load-bearing once option (b) was chosen for one endpoint and (c) deferred, and the shared environment makes the write boundary the control rather than the surroundings |
| **Plan** | Header → Revision 5; §0.1 reference/count table; §5.2 (78) / §5.3 (21) / total 100; §5.5 gains the remediation pointer; **B9 → remediation proposed, not deployed**; **B10 → RESOLVED (policy)**; §12 verdict text. **Revision 7:** counts → **79 / 21 / 1 = 101**; every "isolated project" reference corrected to **shared test project**; S12 restated as the **synthetic-only write boundary** | The plan's verdict rests on those two blockers, and on a boundary that the environment does not supply by itself |

### 9.1 Revision 6 change record

This pass corrected **this document only** (plus the D3 rows listed below). No code, SQL, test, fixture, build or project was touched.

| Section | Change | Finding |
|---|---|---|
| **§0 (new)** | Seven-finding register: evidence, status, smallest correction, affected test IDs, and whether D2 must change | — |
| **§0.1–§0.7** | Each finding answered against the source that governs it; `NOT VERIFIED` recorded wherever no project has been contacted | 1–7 |
| **§3 §4** | Identity response validated (array, exactly one row, this session's id, usable `id`) · `business_owners` read as a **list** with `.limit(1)` and D2's `end_date` predicate, not `maybeSingle` · `extracted_fields` read **paged** with a hard ceiling · `auth.me()` failure **classified** by status · `recency` comparator made **total** and NaN-free | 1, 2, 3, 5, 7 |
| **§5 (rows 5, 6, 12, 14)** | The ordered flow's failure column now matches that code — non-array body → 500, unusable single row → 500, ownership list → 404/500, paging ceiling → 409 | 1–3 |
| **§8.1 / §8.2 / §8.3** | T-904 clauses replaced · T-109 restated · T-108 extended · T-801 and T-810 variants folded into existing IDs | 4 |
| **§3.3, §10 (B12)** | Status allowlist **retained unchanged**; the product-policy question recorded as open rather than decided | 6 |
| **§9, §10, §11** | Reconciliation, blocker table, four separate verdicts, readiness assessment | — |
| **D3 (T-106, T-108, T-109, T-801, T-904)** | Amended to match; **no ID added, none removed, none reclassified** | 1–5 |

**Not changed, deliberately:** D1's withdrawal and repointing (still correct) · D2 in every byte · D4's probe set · the `{active, incomplete}` policy · B10's resolution.

### 9.3 Revision 7 change record

Corrects **this document, D3, D4 and the plan's counts and environment wording**. No code, SQL, function, test, fixture, build or project was touched. **No D2 byte was edited.**

| Section | Change | Finding |
|---|---|---|
| **§0A (new)** | Four-finding register, each answered against the source that governs it, plus the environment correction | R7-1…R7-4 |
| **§4 comparator** | `recency` + subtraction → `stamp` / `compareStamps` / `compareIds`: a classified **total order**, no arithmetic, `-1`/`0`/`1` only | R7-1 |
| **§4 retrieval** | Short-page-means-done → **count-closed** read: exact count, expectation-driven pages, duplicate-id detection, post-read re-count, `MAX_FIELDS` / `MAX_SKIPPED` | R7-2 |
| **§4 step 6 (new)** | RPC result validated before success; `skipped` no longer falls back to the request; commit-uncertainty documented in code, §0A.4, §5 row 16a, §11.3 and T-906 | R7-3 |
| **§3.3, §10 B12** | `{active, incomplete}` re-labelled a **provisional self-service onboarding policy requiring explicit owner approval**; unchanged in value | R7-4 |
| **§5** | Rows 14/15 restated for closure and the skipped bound; **row 16a** added for result validation and commit uncertainty | R7-2, R7-3 |
| **§8.1 / §8.2 / §8.3** | **T-906 added**; T-108 and T-209 amended; T-801 **Variant B** added; register **100 → 101** | R7-1…R7-3 |
| **§2, §3.2, §3.3, §4, §9, §10, §11, §12** | Every "isolated project" reference corrected to the **shared test project**; the control named as the **synthetic-only write boundary** | Documentation |
| **§10** | **B13** (shared environment, not isolated) and **B14** (D2 closure guard, proposed not applied) recorded; **R7-1…R7-4** row added | R7-2, environment |
| **§11** | Four verdicts restated: documentation GO · implementation NO-GO · **database execution NO-GO** · deployment NO-GO | — |
| **D3** | Header → Revision 7, environment corrected, register **101**; T-108, T-209, T-801 amended; **T-906** added to Group I | R7-1…R7-3 |
| **D4** | §1 rewritten (shared project, synthetic-only boundary); §2/§3/§4 wording; §6 rows 3/4/18a corrected; §7 risk 1; §8 blockers and register | Documentation |
| **Plan** | Counts **79 / 21 / 1 = 101**; environment wording in the header, §2, §12, S12 and Appendix C | Documentation |

**Deliberately not changed:** the identity policy (B10 option b) · the status allowlist's **value** (only its label) · D2 in every byte · the shared `authenticateActor` · every test ID other than the single addition · T-904's replaced clause set · the 20-consumer inventory.

### 9.2 Final read-only comparison — does the revised caller still agree with D2?

Compared line by line after the Revision 6 corrections. **No D2 edit is required**, and none was made.

| Contract point | D6 caller | D2 | Agree? |
|---|---|---|---|
| RPC name | `create_reviewed_fields_snapshot` | same | ✅ |
| Parameter set | 11 **named** arguments | 11 parameters, identical names | ✅ |
| `p_actor_profile_id` / `p_actor_base44_user_id` | from `actor`, exactly once each, never the body | accepted as a **claim**, re-validated as a relationship | ✅ |
| `p_mapping_version` | `'s4.mapping.v1'` | the one version `s4_mapping_contract` recognises; anything else → `SNAPSHOT_MAPPING_VERSION_UNSUPPORTED` | ✅ |
| Contract mirror | `FIELD_CONTRACT` — 5 types, identical document-type keys, `basis`, `target`, `from`, `op`, `cardinality` | `s4_mapping_contract` — read and compared target by target, all five types | ✅ **exact** |
| `p_basis` | `contract.basis` | must equal `v_type_spec->>'basis'` → `SNAPSHOT_BASIS_MISMATCH` | ✅ |
| `p_snapshot_type` | `⊆ {historical, tax_year, projection}` | same three, `not in ('historical','tax_year','projection')` refused | ✅ |
| `p_field_map` | `{target, op, field_ids}`, one entry per target, `op ∈ {direct,sum,mean}`, uuids | V-3…V-8 permit exactly that key set and vocabulary | ✅ |
| `p_skipped` | `{field, reason}`, `field` = field **id** (unique by construction) | V-12 permits `field`/`reason`; V-15 refuses duplicate `field` | ✅ (F-1 resolved in the caller) |
| `p_is_latest` | once, from the validated boolean | boolean; governs the demote-then-promote path | ✅ |
| `p_update_dashboard` | `=== true && DASHBOARD_PROJECTION_ENABLED` (**false**) | `v_dashboard_projection_enabled` (**false**) — belt and braces | ✅ |
| Status allowlist | `CANONICAL_ACTIVE_STATUSES = ['active','incomplete']` | `v_active_statuses := array['active','incomplete']` | ✅ identical |
| Authority | admin · `business_entities.profile_id` · `business_owners` with `end_date is null or >= UTC today` (pre-check, may refuse only) | admin · `business_entities.profile_id` · `business_owners` with `end_date is null or >= current_date` · advisor branch disabled by constant | ✅ predicate parity; the clock difference is one-directional (finding 2b) |
| Reporting year | present and `1900…2100` before the RPC → 409 | `v_min_year 1900` / `v_max_year 2100` → refused | ✅ same bounds, caller refuses first |
| Empty field map | 400 in words before the RPC (C-4) | V-1 refuses `[]` | ✅ caller explains what D2 would refuse opaquely |
| Confidence | 0–100, guarded conversion | same guard at the ingestion boundary | ✅ |

**Two residuals, neither an error:**

1. **The contract is written twice** — `FIELD_CONTRACT` in the caller mirrors `s4_mapping_contract` in the database. They agree today *by inspection*; nothing enforces it. Drift is a future risk, and the only structural fix is to have the caller read the contract from the database (a new endpoint surface) — **flagged, not proposed**.
2. **`p_update_dashboard` and the advisor branch are disabled in both layers by separate constants.** Two places to flip, by design (D-4/D-19), so no single edit can enable projection.

---

## 10. Remaining blockers

| # | Item | Status |
|---|---|---|
| **B9** | The deployed endpoint does not implement the authenticated actor boundary | **OPEN — REMEDIATION PROPOSED, NOT DEPLOYED.** The five defects (A-1…A-5) are addressed *in text* by §4. Until that text is deployed and T-903b/T-904 pass against the **deployed** file, **no endpoint ID may be recorded as passed**, and this blockage does not block P3–P6 of the migration |
| **B10** | Strict `base44_user_id` binding vs the shared resolver's email fallback | **RESOLVED (policy) — option (b).** Implementation is the endpoint change in §4, which is part of the deployed artifact B9 already blocks. **No change to the shared helper was made or is proposed** |
| **B11 (new, observation — not a blocker for this package)** | The shared resolver's id branch uses `.maybeSingle()`, so a duplicated `base44_user_id` is **masked** and resolved by email (F-2). Every one of the 20 consumers inherits this | **OPEN — out of scope.** Not fixed here: it is the behaviour §1 declined to change without approval. It is the **first** thing a future option-(c) change-set should fix |
| **B7** | D4 probes 4/5/6 remain production-derived; the unbound-profile count is unverified | **OPEN until P2**, and now also a prerequisite (G-1) for any global fallback removal |
| **B12** | **Profile-status eligibility is a product decision, not a security constant.** The allowlist `{active, incomplete}` is **retained unchanged**. `incomplete` is the column DEFAULT and is the status of **7 of 8** live profiles, so admitting it lets a never-vetted profile hold snapshot authority — but only over a business it already owns, and the RPC re-checks business relationship independently. Defensible for a self-serve product; a gap for a vetted-tenant product | **CLOSED — APPROVED AS OWNER POLICY (OD-6, 2026-10-22). No code, constant or test changes; the approved value is the value already in D2 line 143.** Recorded decision: the allowlist `{active, incomplete}` is **approved** for reviewed-field snapshot creation, **subject to strict identity resolution and verified business authorization**; `invited`, `suspended`, `missing` and `unknown` statuses are **denied**. Conditions attached to the approval, each already satisfied in the proposed text and each a property to preserve rather than to build: **(a)** strict Base44 user ID matching; **(b)** **no** email fallback; **(c)** **no** client-supplied actor identity; **(d)** **no** inferred business ownership — the RPC reads `business_entities` / `business_owners` independently and raises `SNAPSHOT_FORBIDDEN`; **(e)** **no** relaxation of RLS or service-role boundaries. `incomplete` remains admitted because it is the column DEFAULT and the state of **7 of 8** live profiles; the 7-of-8 consequence of narrowing, and the requirement that **D2 and D6 change together** if it is ever narrowed, stand as recorded. **T-110 and T-111 keep their current expectations** — they already assert exactly this behaviour. What the decision does **not** do: it does not authorize source edits, SQL, deployment or a test run |
| **B13 (new, environment)** | **The target is a SHARED test project, not an isolated one.** Isolation was assumed in earlier wording of D3, D4 and the plan; it does not exist. The control that stands in its place is a **synthetic-only write boundary** — every S4 write lands on synthetic rows created by the execution safety plan, or on the three objects the migration creates | **OPEN — documentation corrected (§0A.5); the boundary must be acknowledged in writing before P3.** It does not block review or implementation, and it **does** raise the weight of the pre/post baselines (C5, C7, P-1…P-11): in a shared project a mistake is contained by the boundary and the baselines, not by the surroundings |
| **B14 (new, D2 change — proposed, NOT applied)** | **A strict completeness guarantee requires one closure comparison inside the RPC.** The caller can prove the population it read was unchanged between two counts; it cannot prove the transaction committed against the same population (a net-zero concurrent change is undetectable outside the transaction) | **DESIGN DIRECTION APPROVED (OD-7, 2026-10-22) — B14 REMAINS AN OPEN IMPLEMENTATION AND EXECUTION BLOCKER. Review still stops here for D2.** Approval is of **Design B as the intended approach**, carrying six properties that must be preserved: exact eligible-field-ID reconciliation · contributor/skipped disjointness · V-16 canonical UUID validation · single-statement population comparison · explicitly documented concurrency limitations · the existing **11-parameter** RPC signature. Approval authorizes **no** edit to D2, no SQL and no deployment. **The exact proposed change is Design B in `VISION_S4_GATE_B_07A_R2_B14_PROPOSED_PATCH.md` (Revision 2) — not the count comparison quoted in §0A.3, which is superseded because it cannot fire (`v_contributor_count` is assigned after its insertion point) and is bypassable (its right-hand side is caller-supplied).** Design B is one set reconciliation at §3 step 7A: eligible ids `EXCEPT` sent ids, and sent ids `EXCEPT` eligible ids, in a **single statement**; plus the mapped-and-skipped overlap rule; plus **V-16** (`p_skipped[].field` must be a canonical uuid, reusing the existing code). One new error code — `SNAPSHOT_POPULATION_INCOMPLETE` → **409** — with a **required** `RPC_ERROR_MESSAGES` entry. Cost: one indexed count, one new error code, the inventory moves **26 → 27**, and D4 §6's interface check is restated (Revision 8: the count is corrected, and the **design is now Design B** in `VISION_S4_GATE_B_07A_R2_B14_PROPOSED_PATCH.md` — set reconciliation in one statement plus V-16, not the count comparison quoted in this row). **Not applied.** The caller in §4 is complete relative to its own counts; this is what makes it complete relative to the transaction |
| **R7-1…R7-4** | The four Revision 7 review findings | **RESOLVED IN TEXT (§0A).** Three change the proposed code (R7-1 comparator, R7-2 retrieval, R7-3 result validation), one changes a label (R7-4). **None is validated at runtime** — each remains a property of undeployed text, and R7-2's residual is carried as **B14** rather than claimed closed |
| **R6-1…R6-7** | The seven Revision 6 review findings | **RESOLVED IN TEXT (§0).** Five change the proposed code (1, 2, 3, 5, 7), one changes a test (4), one is a retained decision (6). **None is validated at runtime** — each remains a property of undeployed text |
| **B2–B6, B8** | T-411 injection point · T-204 expert half · redacted credential baseline · T-301 deployed parity · T-706 deferred · post-commit remedy | **Unchanged** from Revision 4 |
| **F-1** | D1's `p_skipped` key set contradicted D2 V-12 | **RESOLVED in the proposal (C-3).** Listed because it is a defect in a document that was reviewed as final, found only by reading two artifacts against each other |

---

## 11. GO / NO-GO

### 11.0 Four verdicts, stated separately

The four questions are different questions, and the answers are not the same. Collapsing them into one "GO" is how an unreviewed proposal becomes a deployment.

| Question | Verdict | Because | What would change it |
|---|---|---|---|
| **1. Is this ready for independent review?** | **GO** | The four Revision 7 findings are answered against source, every correction is written into §3/§4, the tests were reconciled to match (D3), and **D2's one required change is identified and stopped for review rather than applied** (B14). The document states what is evidenced, what is asserted, and what is only proposed. §11.3 | Nothing — review is the next step, not a risk |
| **2. Is this ready for code implementation?** | **GO — AUTH-1 GRANTED AND EXERCISED** (OD-6, OD-7 recorded; implementation record and evidence in **D10 §12A**) | Implementation **is** the proposed text, and that text has never been compiled, type-checked, linted or run. Eleven items in §4.1 now change control flow or the response contract; **none of those paths has executed once.** Revision 7 added a count-closure read, a response validator and a new comparator — three of them after the previous pass declared the class fixed, which is itself evidence that static "fixes" need a runtime gate | Independent review closed (**1**), then a **separate authorization** for the shared helper + endpoint change-set + one-line UI selector, with a build/type-check gate before any deploy |
| **3. Is this ready for database execution (P3–P6)?** | **NO-GO** | **C1–C9 remain unrecorded**, D2 is unedited, and **the target is a shared test project whose only containment is the synthetic-only write boundary (B13)** — which must be acknowledged in writing before P3. Applying D2 now would also be applying a version that **B14 says is one guard short of a strict guarantee**, so a later B14 adoption would mean a second DDL pass over the same objects | The plan's own preconditions, unchanged and now explicit: **project authorization with the shared-project boundary acknowledged**, pre-apply probes, C1–C9 recorded — **and a decision on B14 before P3, or a recorded decision to accept its residual** |
| **4. Is this ready for endpoint deployment?** | **NO-GO** — **B12 is no longer the constraint (closed by OD-6)**; B9, AUTH-2 and P3–P6 are (**D10 §12**) | B9 remains open: the deployed file still carries A-1…A-5, and T-903b/T-904 **fail against it today**. §4 is text, not a deployment. **B12 still requires explicit owner approval** of the provisional status policy, and T-906's behavioural half has no authorized injection point | Deploy the §4 replacement under separate authorization, then pass T-903b, T-904 and **T-906 (static)**, then T-101…T-111, T-903c (live). Only then may any endpoint ID be recorded as passed |

**The dependency order is 1 → 2 → 4, with 3 independent of all three.**

### 11.1 Endpoint deployment — **NO-GO**

| Gate | State |
|---|---|
| Proposed code exists | **yes** — §3 and §4 |
| Deployed | **no** — this turn is proposal-only by instruction |
| Built or type-checked | **no** — not attempted |
| Tested | **no** — and **no runtime validation of any kind is claimed** |
| T-903b / T-904 pass against the deployed file | **no** — they fail today, which is the B9 finding |
| T-101…T-111, T-207…T-210b, T-806, T-811, T-811b, T-903, T-903c | **NOT RUN** — all need live sessions |

Deploying this text requires a **separate authorization** covering: the new shared helper, the endpoint change-set, the one-line UI selector (D1 §4), and the application-phase test window with its identity fixtures.

### 11.2 Migration P3–P6 — **unchanged, NO-GO**, on its own preconditions

Nothing in this deliverable moves the migration: C1–C9 remain unrecorded, D2 is unedited, and the RPC's correctness never depended on the caller. The plan's §12 holds verbatim.

### 11.3 Documentation for independent review — **GO**

D1–D4 and the plan now agree on one identity policy, the one contradiction that could not be resolved by editing a test (B10) is resolved by decision, and the defect that *would* have shipped (F-1) is fixed in the proposal rather than in production. **Revision 7 adds the one thing a review of this package has never had: an explicit statement of what the caller cannot prove, and where the fix would have to live (B14).** The environment is also stated honestly — a shared test project, not an isolated one (B13).

**Readiness assessment — what is established, and what is only asserted.**

| Established (by reading source) | Only asserted (not executed) |
|---|---|
| The deployed endpoint carries A-1…A-5 — read line by line (§4.1) | That the §3/§4 replacement compiles or type-checks — **never built** |
| D2's `business_owners` predicate is `end_date is null or end_date >= current_date`, over a table whose verified columns include `end_date` and **no** evidenced `status`/`active` column (V-8) — so the caller's predicate is parity, not invention | That `resolveCanonicalActor` returns what §3.1 claims — **never executed** |
| `auth.me()` has no internal try/catch and therefore throws — so classification is the caller's job (§0.5) | That the SDK error objects actually carry `.status` on **this** deployment (§0.5, **NOT VERIFIED**) |
| D1's `p_skipped` key set contradicted D2 V-12 (F-1) | That the count-closed read returns the same population a single transaction would see (§0A.2 — **NOT closable in the caller**; that is B14) |
| D3's T-904 requirement was logically unsatisfiable (F-4) | That the comparator's **total order** selects a stable row across runs (§0A.1 — proven by construction from the source, **not** by fixture) |
| Revision 6's comparator produced `NaN` for any two undated rows, and its paging read a short page as exhaustion (§0A.1, §0A.2) | That the RPC returns a body matching §4 step 6's validator — **D2 unchanged and unrun** |
| B9's status: five defects, none deployed-fixed | That the RPC accepts the parameter set §4 sends |
| The register is **101** unique IDs — 100 carried forward plus **T-906** — with no ID removed or reclassified (D3 §10 mapping, plan §5.2) | That any single test passes |
| The `-Infinity − (-Infinity)` defect is arithmetic, not configuration: it is provable from the source without a database | That the 409 refusals in T-209 fire against a real PostgREST cap — **the cap value is still NOT VERIFIED** |

Five properties are therefore **conditionally** correct: the SDK error shape, the count-closure's exposure to a net-zero concurrent change (B14), the ordering stability, the response-shape tolerance, and the `db-max-rows` cap being unknown (which the closure detects but cannot bound). Each is written defensively enough to hold under its stated assumption, and each names the assumption rather than assuming it silently.

**Two consecutive passes declared the comparator and the retrieval fixed, and both were wrong** — Revision 6 removed a `Date.parse` NaN and reintroduced the same nondeterminism through `-Infinity` subtraction, and it paged a read that still could not prove completeness. Revision 7 does not claim to have ended that pattern; it claims only that both defects are now **statically checkable** (T-108's no-subtraction and count-closure clauses) and that the remaining gap is named as a D2 change rather than absorbed into the caller.

**One remaining contradiction, carried openly.** D3's T-904 previously asserted a token count (`is_latest` = 0 in the entry file) that the required RPC call makes impossible — an earlier revision of this package contained a test no correct implementation could pass. That is now corrected in both documents, and **no runtime claim replaces it**. It is recorded here rather than quietly fixed because it shows the test register was reviewed as final while containing an unsatisfiable expectation.

### 11.4 The one sentence a reviewer should carry

> The database half was already correct; this deliverable fixes the layer above it in text, and **nothing is proven until that text is deployed and a live session is refused for the right reason** — and even then, completeness against the committed population rests on **B14**, not on the caller.

---

## 12. What was not done in this turn

No SQL executed or prepared for execution. No Supabase project contacted. No table, policy, grant or row read or written. No Base44 function created, edited or deployed — `createSnapshotFromReviewedFields/entry.ts` is **byte-identical** to what was inspected. No shared module modified — `base44/shared/authz/actor.ts` is untouched, and `canonicalActor.ts` still does not exist. No test, harness or fixture run. No build or type-check attempted. **No D2 byte edited**; B14 is a proposal in this document only.

**Revision 7 specifically:** no code was written to disk, no migration drafted outside this document, no environment described as isolated, and no claim of certification or runtime proof is made anywhere in this deliverable. D2 is **not certified** and has never executed; the caller in §4 has never been compiled. Production, CB-005A, CB-005B, provider sync, Galileo and the Digital Twin untouched.