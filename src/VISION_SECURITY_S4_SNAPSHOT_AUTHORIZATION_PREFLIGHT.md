# Phase S4 — Financial Snapshot Authorization Hardening
## Gate A Packet · **Revision 2** (PROPOSAL — NOT APPLIED)

**Target:** `base44/functions/createSnapshotFromReviewedFields/entry.ts`
**Status:** Gate A revision for review. **Nothing written, migrated, deployed or executed.** Gate B is **not** authorized.
**Supersedes:** Revision 1 of this packet. Revision 1's `authorization_reason` prefix matching is **withdrawn** (see §3).

---

## 0. Scope discipline

| Constraint | State |
|---|---|
| Base44 code edited | **NO** — proposed file in §8, unapplied |
| Supabase changed / migration created | **NO** — SQL proposed in §9; no file created |
| SQL executed · tests run · anything deployed | **NO** |
| Providers connected · financial records written | **NO** |
| CB-005A / CB-005B / Digital Twin touched | **NO** |

Evidence was gathered **read-only**: the API's exposed schema and column types (`GET /rest/v1/` OpenAPI), plus authored table definitions in the repository's own migration files. **No rows were read, no writes, no secret values emitted.**

---

## 1. What this revision changes — mapped to your seven issues

| Issue | Correction in this revision | Section |
|---|---|---|
| 1 Authorization | Prefix matching **removed**. Exact, enumerated permission checks with an explicit advisor role + assignment test and an active-profile requirement. | §3 |
| 2 Trust boundary | A dedicated section stating what the service-role RPC does and does **not** prove. Explicit "do not claim" list. | §4 |
| 3 Financial mapping | Full field-by-field audit; `total_liabilities` identified as unpersisted; `weighted_interest_rate` corrected; revenue/net-profit/margin semantics verified per basis. | §5 |
| 4 Source integrity | Callers **stop sending financial values entirely**. The database derives every number from accepted/corrected fields under a versioned contract, with provenance and a content hash. | §6 |
| 5 Concurrency | Transaction-scoped advisory lock, content-hash idempotency, ordered `is_latest` switch, dashboard upsert that cannot duplicate. Optional DB constraints separated. | §7 |
| 6 Database compatibility | Verified facts vs assumptions separated, with the exact read-only Gate B verification queries. | §2, §9.6 |
| 7 Test coverage | Adversarial suite added: forged actor ids, suspended advisors, role mismatches, manipulated values, concurrent requests, duplicate retries, rollback. | §12 |

**Per-issue Base44 / Supabase split:** §10.

---

## 2. Evidence — verified facts vs assumptions (issue 6)

### 2.1 VERIFIED (Gate A, read-only)

**Column types (exposed schema):**

| Column | Type | Bearing on the design |
|---|---|---|
| `business_metric_snapshots.metadata` | **jsonb** | Provenance, contract version and content hash can be recorded here — no schema change needed |
| `business_metric_snapshots.{annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation, payroll, total_debt, cash_on_hand, total_assets}` | **numeric** | Typed destinations exist for every mapped P&L / tax / balance-sheet metric |
| `business_metric_snapshots.created_by` | **uuid** | **Cannot receive a Base44 user id** (24-hex, not a UUID) — see **F-6** |
| `business_metric_snapshots.{snapshot_date: date, snapshot_type: text, is_latest: boolean, data_source: text, source_document_id: uuid, profile_id: uuid, business_id: uuid}` | as shown | Matches the proposed writes |
| `extracted_fields.accepted_normalized_value` | **numeric** | The value source is DB-typed numeric; the database itself rejects non-numeric values |
| `extracted_fields.confidence_score` | **text** | Must be parsed before averaging (the current code already does this) |
| `dashboard_metrics.{annual_revenue, net_profit}` | **numeric** | The two persistable dashboard metrics |
| `dashboard_metrics.created_at`, `updated_at` | **timestamptz** | `clock_timestamp()` is type-compatible |
| `business_owners.end_date` | **date** | Active-ownership test can use it (semantics assumed — §2.2) |
| `profiles.base44_user_id` | **text** | Consistent with the 24-hex Base44 id form |

**Columns present / absent (exposed schema):**

- **Absent:** `business_metric_snapshots.data`; `dashboard_metrics.revenue`, `.net_profit_margin`, `.metadata`; `business_metric_snapshots.total_liabilities`; `dashboard_metrics.total_liabilities`.
- **Present:** all columns named in §9's SQL.
- `advisor_assignments`: **not exposed** — unusable from the backend (pre-existing; `writeGuard`'s advisor branch is unreachable).

**Authored (not deployed) definitions in this repository:**

- `src/supabase/migrations/phase_6_9_dashboard_metrics_business_identity.sql:187` — `CREATE UNIQUE INDEX IF NOT EXISTS ux_dashboard_metrics_business_id` (and it drops a legacy profile-only unique constraint at `:143`).

> A migration file states **intent**. It is evidence that the unique index was *authored*, not that it is *deployed*. §9.6 verifies it.

### 2.2 ASSUMED — must be verified at Gate B before the migration is finalized

| # | Assumption | Verification (§9.6) |
|---|---|---|
| A-1 | `ux_dashboard_metrics_business_id` is deployed and unique | `pg_indexes` |
| A-2 | At most one `is_latest` row per business | grouped count |
| A-3 | At most one `dashboard_metrics` row per business | grouped count |
| A-4 | No function named `create_reviewed_fields_snapshot` exists | `pg_proc` |
| A-5 | `business_owners.end_date IS NULL`/future means active | count of non-null `end_date`, sample semantics |
| A-6 | `business_entities.assigned_advisor_id` is nulled when an advisory relationship ends (no revocation column exists) | inspect assignment writers (`businessDNAService`, admin tools) |
| A-7 | `business_metric_snapshots.net_margin` stores a ratio (0–1) rather than a percentage | sample existing values |
| A-8 | `service_role` holds the table privileges needed by the RPC | `information_schema.role_table_grants` |
| A-9 | `created_by` is intended to hold a canonical profile UUID | sample existing values |

**Gate A cannot settle these**, and the packet does not claim otherwise.

---

## 3. Issue 1 — Authorization: exact checks replace prefix matching

### 3.1 Withdrawn

Revision 1 narrowed the approved policy by matching `validateBusinessScope().authorization_reason` prefixes (`startsWith('owner')`, `startsWith('advisor')`, …). **Withdrawn.** Reason strings are presentation labels, not a permission interface: they can be reworded without warning, `startsWith('advisor')` cannot distinguish an `advisor` app role from an advisory *relationship*, and the underlying check is intentionally broader than the approved policy. Correctness must not rest on string shape.

`validateBusinessScope` is therefore **no longer used for this decision**. `authenticateActor` (canonical identity + the central suspension gate) **is** retained.

### 3.2 The exact decision table

Decided once in the Base44 function and **independently re-checked** inside the RPC (§9).

| # | Test | Exact check | Outcome |
|---|---|---|---|
| 1 | Profile resolved | `profiles.id = :actor` exists (`authenticateActor`) | else **404** (fail closed) |
| 2 | Profile active | `profiles.profile_status` is not `suspended` (`authenticateActor` throws 403) | else **403** |
| 3 | Platform authority | `profiles.app_role IN ('admin','super_admin')` | **allow** — `platform_admin` |
| 4 | Business owner (canonical) | `EXISTS business_entities WHERE id = :business AND profile_id = :actor` | **allow** — `business_owner` |
| 5 | Business owner (explicit) | `EXISTS business_owners WHERE business_id = :business AND profile_id = :actor AND (end_date IS NULL OR end_date >= CURRENT_DATE)` | **allow** — `business_owner_record` |
| 6 | Assigned advisor | `profiles.app_role = 'advisor'` **AND** `EXISTS business_entities WHERE id = :business AND assigned_advisor_id = :actor` | **allow** — `assigned_advisor` |
| 7 | Anything else | — | **deny** |

Notes that make this exact rather than approximate:

- **The advisor rule requires both halves.** An `advisor` app role with no assignment to *this* business is denied; an assignment column pointing at a profile whose canonical role is not `advisor` is denied. (Test 6 is the only place a role gates access at all — ownership stands on ownership records, which is what "verified business owner" means.)
- **Suspended profiles are refused centrally**, before any of the above: `authenticateActor` throws on `profile_status = 'suspended'`, and the RPC re-tests the same column.
- **Revocation** is expressed by the absence of an assignment value. There is no revocation column on `business_entities`; assumption **A-6** covers whether that value is reliably cleared.
- **`team_member` and expert-access relationships are denied deliberately** — they are business *access*, not snapshot *authority*, per the approved policy.

### 3.3 Smallest safe correction

Base44: replace the helper body with the seven-row table above (≈20 lines, three indexed lookups). Supabase: the same table re-expressed inside the RPC as defence in depth. **Both.**

---

## 4. Issue 2 — Trust boundary (stated explicitly)

### 4.1 What the RPC's parameters prove — and what they do not

**`p_actor_profile_id` does not prove end-user identity.** A parameter is a claim by whoever holds the credential. Any holder of the service-role key could pass any profile id. This must not be described as authentication at any layer, in code comments, in the migration `comment`, or in review documents.

- `service_role` is **database capability, not authorization** — the doctrine the platform's own `shared/authz/actor.ts` header states for the whole codebase.
- Only the Base44 backend holds that key, and it derives `p_actor_profile_id` from `authenticateActor()` — i.e. from the **trusted session**, never from the request body. The function additionally rejects authority-shaped body keys for the resource decisions it makes.
- The RPC **validates a relationship**, not an identity. It answers: *"does the profile named here exist, is it not suspended, and does it hold the required relationship to this business?"* It cannot answer *"is the caller that profile?"* — and **no wording in this design claims it does.**

### 4.2 Where the boundary actually sits

| Layer | Proves | Cannot prove |
|---|---|---|
| Base44 session / `authenticateActor` | **Who the end user is** (the real boundary) | — |
| Base44 authorization (exact checks, §3) | The actor may act on this business | — |
| RPC relationship re-check | The named profile is real, active, and related to this business; the tenant matches the document; the values are canonical | That the caller *is* the named profile |

**Residual risk, stated honestly:** if the service-role key leaked, the RPC's checks would still confine writes to profiles holding a legitimate relationship to a real business — but that is damage limitation, **not** end-user authentication. The key's custody remains the control that matters.

### 4.3 `created_by` is attribution, not identity

`p_actor_base44_user_id` is an unverified text claim by the trusted backend. Even at best it records *who the backend said was acting*. It must never be used for authorization, and it must never be presented to users as verified authorship. `business_metric_snapshots.created_by` is a **uuid** column, so the Base44 user id cannot live there at all (**F-6**, §5.4).

### 4.4 Smallest safe correction

Documentation only — a header block in the function and a `comment on function …` in the migration, both using the wording above. No behavioural change. **Both files (comment), no new mechanism.**

---

## 5. Issue 3 — Financial mapping audit

### 5.1 Every accepted field, and where it goes

Contract version proposed: **`s4.mapping.v1`**. "Persisted" means a value that can survive a round trip; the current implementation's `data` blob cannot (no such column, **F-1**).

| Document type | Accepted field | Target | Persisted today? | Semantic verdict |
|---|---|---|---|---|
| profit_and_loss | `annual_revenue` | `annual_revenue` | ✗ (blob target absent) | ✓ book revenue |
| | `gross_profit` | `gross_profit` | ✗ | ✓ |
| | `net_profit` | `net_profit` | ✗ | ✓ book net profit |
| | `total_expenses` | `total_expenses` | ✗ | ✓ |
| | `owner_compensation` | `owner_compensation` | ✗ | ✓ |
| balance_sheet | `total_assets` | `total_assets` | ✗ | ✓ |
| | **`total_liabilities`** | `total_liabilities` | ✗ | **no destination column — see F-3** |
| | `cash_on_hand` | `cash_on_hand` | ✗ | ✓ |
| | `total_equity` | `metadata.total_equity` | ✗ | ✓ |
| | `total_debt` | `total_debt` | ✗ | ✓ |
| business_tax_return | `gross_receipts` | `annual_revenue` | ✗ | ⚠ tax gross receipts ≠ book revenue |
| | `ordinary_business_income` | `net_profit` | ✗ | ⚠ tax ordinary income ≠ book net profit |
| | `officer_compensation` | `owner_compensation` | ✗ | ⚠ S-corp approximation |
| | `wages` | `payroll` | ✗ | ⚠ wages ⊂ total payroll |
| | `deductions` | `total_expenses` | ✗ | ⚠ tax deductions ≠ book expenses |
| | `taxable_income` | `metadata.taxable_income` | ✗ | ✓ (labelled) |
| personal_tax_return | **all fields** | — | ✗ | rejected by design (400) |
| debt_schedule | `loan_balance` (per loan) | `total_debt` (Σ) | ✗ | ✓ — but **0 written when unknown — F-2** |
| | `monthly_payment` (per loan) | `metadata.monthly_debt_payment` (Σ) | ✗ | ✓ — same F-2 |
| | `interest_rate` (per loan) | `metadata.weighted_interest_rate` | ✗ | **✗ mathematically wrong naming — F-5** |
| payroll_report | `total_payroll` | `payroll` | ✗ | ✓ |
| | `owner_payroll` | `owner_compensation` | ✗ | ✓ |
| | `employee_count` | `metadata.employee_count` | ✗ | ✓ |
| | `payroll_tax` | `metadata.payroll_tax` | ✗ | ✓ |

**Every accepted financial field not persisted:** `total_liabilities` (balance sheet) — plus all `personal_tax_return` fields, which are rejected by design, and any accepted field name absent from the contract, which is reported in the response as skipped.

### 5.2 Findings

| # | Finding | Smallest safe correction |
|---|---|---|
| **F-2** | `debt_schedule` writes `total_debt = 0` and `metadata.monthly_debt_payment = 0` when **no** contributing field was accepted — an unknown is recorded as a confident zero. (The repository already carries `scripts/unknownNotZero.test.cjs`, so this is the platform's own doctrine, not a preference.) | An aggregate with **no contributing field is omitted entirely**, never written as `0`. Applied in the contract (§6.1) and enforced in SQL. |
| **F-3** | `total_liabilities` has no destination on `business_metric_snapshots` (nor on `dashboard_metrics`). | Persist to `metadata.total_liabilities` — no schema change, no longer silently dropped. A first-class column is proposed separately as a follow-up, **not** part of this patch. |
| **F-5** | The arithmetic **mean** of loan rates is stored under the name `weighted_interest_rate`. A mean is not a weighted average. | Two options, both honest: **(a) default** — emit `metadata.mean_interest_rate` (same numbers, correct name), and never emit the misleading key again; **(b) when per-loan pairing is available** (balance and rate rows share a stable identifier such as `source_line`/`entity_id`), compute the correct balance-weighted mean `Σ(bᵢ·rᵢ)/Σ(bᵢ)` and emit it as `weighted_interest_rate` with `metadata.interest_weighting = 'balance_weighted'` plus the pairs used. If `Σbᵢ = 0`, fall back to (a). **No existing snapshot row is rewritten, and no existing value is silently changed** — historical rows keep the old key and value. |
| **F-6** | `created_by` is a **uuid** column, but the current code passes the Base44 user id (`user?.id`), which is 24-hex and not a UUID. Any authenticated call would fail on that field alone. | `created_by` = the actor's **canonical profile UUID** (`actor.profile_id`); the Base44 id is recorded as `metadata.created_by_base44_user_id` (text). Attribution is preserved and honestly labelled (§4.3). |
| **F-7** | Tax-return values are being labelled with book-basis names (`annual_revenue`, `net_profit`, `total_expenses`, `payroll`, `owner_compensation`). A consumer cannot tell a tax figure from a book figure. | Record the basis on the snapshot: `metadata.basis = 'book' \| 'tax' \| 'payroll' \| 'schedule'`, and per-value provenance (§6.2). Values are unchanged; the **meaning** becomes explicit. |

### 5.3 Net profit, margin and revenue — verified meanings

- **Revenue.** From P&L it is book revenue (✓). From a tax return it is *gross receipts* (⚠ different basis, F-7). Both are legitimate inputs to a snapshot; they are not interchangeable, so the basis travels with the value.
- **Net profit.** From P&L it is book net profit (✓). From a tax return it is ordinary business income (⚠, F-7).
- **Profit margin.** `dashboard_metrics` has **no** margin column, so the previously computed `net_profit_margin` could never persist. `business_metric_snapshots` **does** expose `net_margin`, `gross_margin` and `ebitda_margin` — so a margin is persistable, but **only from same-basis inputs**. Proposal: compute `net_margin` only when revenue and net profit come from the **same document type** (i.e. the same basis); never mix a tax revenue with a book profit. Record the formula and basis in `metadata`, and verify the stored unit (ratio vs percentage, **A-7**) before the first write. Until A-7 is settled, `net_margin` is **not** written — the snapshot still carries revenue and net profit.

### 5.4 Smallest safe correction summary

Base44: the corrected contract (F-2, F-3, F-5, F-7) and the attribution split (F-6). Supabase: typed column destinations, `metadata` provenance, and the same aggregate rules — **including F-2 and F-5, which live in the computation**. **Both.**

---

## 6. Issue 4 — Source integrity: authoritative, versioned, DB-derived

### 6.1 The principle

**No financial value crosses from the caller into a snapshot.** The Base44 layer decides *which* accepted field feeds *which* target (a mapping decision); the database reads the *numbers* itself, inside the transaction, from `extracted_fields` under a strict predicate. A manipulated body, a stale browser value, or a compromised caller cannot produce a snapshot value — it can only propose a selection, and the selection is validated.

### 6.2 The versioned contract

- `mapping_version` is a **string constant** (`s4.mapping.v1`) carried on every write and recorded in `metadata.mapping_contract`.
- The caller sends a **selection**, not values:
  `p_field_map = [{ target, op: 'direct'|'sum'|'mean', field_ids: [uuid, …] }, …]`
- The database **re-reads** each referenced field with this predicate:
  `id = ANY(field_ids) AND document_id = :document AND business_id = :business AND review_status IN ('accepted','corrected')`.
  Any requested id that does not satisfy it ⇒ `field_ids` count mismatch ⇒ **`SNAPSHOT_FIELD_NOT_ACCEPTED`**, whole transaction refused. A field from another business, another document, or a not-yet-reviewed row can never contribute.
- Targets are whitelisted: `metadata.*` keys, or one of the nine metric columns. An unlisted target aborts.
- `op` is a closed set (`direct`, `sum`, `mean`); no expression is ever built from caller text, so no dynamic SQL exists.
- Recorded per snapshot: `metadata.mapping_contract`, `metadata.basis`, `metadata.provenance = { target: { op, field_ids } }`, and `metadata.content_hash`.
- **Derived server-side, so the caller cannot influence them:** every metric value, `snapshot_date` (from `documents.year`), the `snapshot_type` default, and `data_confidence_score` (mean of `confidence_score` over the document's accepted/corrected fields).

### 6.3 Verification against the extracted fields

Three independent confirmations, all inside the transaction:

1. **Predicate + count match** — every referenced field is an accepted/corrected field of *this* document *and* this business (§6.2).
2. **Content hash** — `md5` over `document | mapping_version | ordered target=value pairs`. Stored in `metadata.content_hash`; identical content produces an identical hash.
3. **Provenance block** — the exact field ids behind each target, so any value in a snapshot can be traced back to the rows that produced it, after the fact, without re-deriving.

### 6.4 Smallest safe correction

Base44: stop sending values; send the selection and the version. Supabase: derive and verify. **Both.** No new table, no new column.

---

## 7. Issue 5 — Concurrency

| Hazard | Safeguard | Where |
|---|---|---|
| Two requests create two snapshots for identical content (double-click, retry) | **Content-hash idempotency.** The RPC computes the hash inside the lock; if a snapshot with the same `business_id` + `metadata.content_hash` exists, it returns that row with `deduplicated: true` and writes nothing. | Supabase |
| Conflicting `is_latest` — two concurrent snapshots both ending up latest | **Transaction-scoped advisory lock**, keyed on the business: `pg_advisory_xact_lock(hashtextextended('s4:snapshot:' || business_id))`, taken **before any read**. All snapshot creation for a business is serialized; the lock releases at commit/rollback. | Supabase |
| The `is_latest` switch itself | Ordered **inside** one transaction: insert with `is_latest = false` → demote the others (`business_id = ? AND id <> new AND is_latest`) → promote the new row. No window with two `true` rows is ever visible, and the safe order also survives a partial unique index (§9.5). | Supabase |
| Concurrent dashboard upserts / duplicate `dashboard_metrics` rows | Serialized by the same per-business lock, then `UPDATE … WHERE business_id = ?` and, only when it matched nothing, `INSERT`. Correct **without** depending on a unique index. `ON CONFLICT (business_id)` is the alternative once A-1 confirms the unique index. | Supabase |
| Cross-business interference | The lock key includes the business; the demotion, the dashboard write and the content-hash lookup are all filtered by `p_business_id`. | Supabase |
| Partial writes on any failure | The whole function is one transaction: snapshot, demotion and dashboard commit together or not at all. | Supabase |

**Deliberate semantic change requiring sign-off:** identical re-submission now returns the existing snapshot instead of creating a duplicate (**D-9**). If the existing row is not the latest and the request asks for `is_latest = true`, the dedupe branch promotes it inside the same transaction, so the request still has its intended effect.

**Optional database constraints** (separate approval, §9.5): a partial unique index enforcing one `is_latest` row per business, and an expression index on the content hash. Correctness does not depend on either — the lock and the ordered switch provide it — so they are hardening and performance, not requirements. Both need a preflight violation count (A-2) before they can be created.

**Smallest safe correction:** Supabase only. No caller-side idempotency key is introduced, which keeps the trust surface unchanged.

---

## 8. Proposed Base44 change

**One file modified, replaced in full.** No other Base44 file changes; no shared-module changes; no new function.

### 8.1 Reused helpers

| Helper | Module | Role |
|---|---|---|
| `authenticateActor` | `shared/authz/actor.ts` | Canonical identity, Base44→profile bridge, **central suspension gate**, canonical `app_role`. Fails closed. |
| `HttpError` / `errorResponse` | `shared/authz/actor.ts` | Safe status mapping; ≥500 becomes generic |
| Precedent mirrored | `functions/getDocumentsAdmin/entry.ts` | "Unauthorized and nonexistent are indistinguishable" |

`validateBusinessScope` and `authorizeDocumentAccess` are **no longer used** here (§3.1).

### 8.2 Proposed file

```ts
/**
 * createSnapshotFromReviewedFields — Phase S4 SECURITY HARDENING (Gate A revision 2)
 *
 * WHAT WAS WRONG (Step 162 audit):
 *   1. `auth.me()` failures were swallowed into `user = null` and execution continued.
 *   2. The role check read the DOCUMENT OWNER's app_role, not the authenticated caller's.
 *   3. No authorization against the document's business; any documentId reached the write path.
 *
 * TRUST BOUNDARY — read this before changing anything here:
 *   The RPC this function calls is invoked with the service-role key. Its parameters do NOT
 *   prove end-user identity: any holder of that key could pass any profile id. THIS FUNCTION
 *   is the authentication boundary — it derives the actor from the trusted Base44 session via
 *   authenticateActor(). The RPC independently validates the actor's PROFILE and its authorized
 *   RELATIONSHIP to the business, and pins the tenant to the document. It does not, and must
 *   never be described as, authenticating the end user. `created_by` is attribution, never
 *   authorization.
 *
 * SOURCE INTEGRITY — no financial VALUE is sent from here. This file decides which accepted
 * fields feed which targets (the mapping contract, below); the database reads the numbers from
 * extracted_fields inside the transaction and refuses any field that is not an accepted or
 * corrected field of this document and business.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, errorResponse, HttpError } from '../../shared/authz/actor.ts';

/** The mapping contract version. Any change to FIELD_CONTRACT requires a new version string. */
const MAPPING_VERSION = 's4.mapping.v1';

const SNAPSHOT_TYPES = ['historical', 'tax_year', 'projected'];

/**
 * FIELD_CONTRACT — the versioned mapping. `columns`/`metadata` map a TARGET to the accepted
 * field name that fills it (last accepted row of that name wins, as before). `aggregations`
 * combine every matching row. An aggregation with no contributing row is OMITTED, never 0.
 *
 * total_liabilities has no column on business_metric_snapshots, so it is persisted in metadata
 * rather than dropped. The debt-schedule rate is a MEAN, so it is named honestly as a mean.
 */
const FIELD_CONTRACT: Record<string, any> = {
  profit_and_loss: {
    columns: {
      annual_revenue: 'annual_revenue',
      gross_profit: 'gross_profit',
      net_profit: 'net_profit',
      total_expenses: 'total_expenses',
      owner_compensation: 'owner_compensation',
    },
    metadata: {},
    aggregations: [],
    basis: 'book',
  },
  balance_sheet: {
    columns: { total_assets: 'total_assets', cash_on_hand: 'cash_on_hand', total_debt: 'total_debt' },
    metadata: { total_equity: 'total_equity', total_liabilities: 'total_liabilities' },
    aggregations: [],
    basis: 'book',
  },
  business_tax_return: {
    columns: {
      annual_revenue: 'gross_receipts',
      net_profit: 'ordinary_business_income',
      owner_compensation: 'officer_compensation',
      payroll: 'wages',
      total_expenses: 'deductions',
    },
    metadata: { taxable_income: 'taxable_income' },
    aggregations: [],
    basis: 'tax',
  },
  debt_schedule: {
    columns: {},
    metadata: {},
    aggregations: [
      { target: 'total_debt', op: 'sum', field_name: 'loan_balance' },
      { target: 'metadata.monthly_debt_payment', op: 'sum', field_name: 'monthly_payment' },
      { target: 'metadata.mean_interest_rate', op: 'mean', field_name: 'interest_rate' },
    ],
    basis: 'schedule',
  },
  payroll_report: {
    columns: { payroll: 'total_payroll', owner_compensation: 'owner_payroll' },
    metadata: { employee_count: 'employee_count', payroll_tax: 'payroll_tax' },
    aggregations: [],
    basis: 'payroll',
  },
};

/** The nine metric columns a target may name. Mirrors the database whitelist. */
const METRIC_COLUMNS = [
  'annual_revenue', 'gross_profit', 'net_profit', 'total_expenses', 'owner_compensation',
  'payroll', 'total_debt', 'cash_on_hand', 'total_assets',
];

/**
 * assertSnapshotAuthority — the EXACT approved policy. No label matching, no borrowed rule.
 *   3 platform  : app_role admin | super_admin
 *   4/5 owner   : business_entities.profile_id  OR active business_owners row
 *   6 advisor   : app_role = 'advisor' AND business_entities.assigned_advisor_id
 *   otherwise   : denied
 */
async function assertSnapshotAuthority(sb: any, actor: any, businessId: string): Promise<string> {
  if (!actor.profile_id) throw new HttpError(403, 'Forbidden');
  if (actor.isAdmin) return 'platform_admin';

  const { data: entity } = await sb
    .from('business_entities')
    .select('id, profile_id, assigned_advisor_id')
    .eq('id', businessId)
    .maybeSingle();
  if (!entity) throw new HttpError(403, 'Forbidden');

  if (entity.profile_id && entity.profile_id === actor.profile_id) return 'business_owner';
  if (actor.role === 'advisor' && entity.assigned_advisor_id === actor.profile_id) return 'assigned_advisor';

  const { data: ownerRow } = await sb
    .from('business_owners')
    .select('id, end_date')
    .eq('business_id', businessId)
    .eq('profile_id', actor.profile_id)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (ownerRow) return 'business_owner_record';

  throw new HttpError(403, 'Forbidden');
}

/**
 * loadAuthorizedDocument — the single chokepoint. The tenant comes from the DOCUMENT ROW;
 * the caller comes from the SESSION. Denials are indistinguishable from absence.
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
  if (!doc.business_id) throw new HttpError(409, 'This document is not attached to a business');
  if (!doc.profile_id) throw new HttpError(409, 'This document is not attached to an owner');

  try {
    await assertSnapshotAuthority(sb, actor, doc.business_id);
  } catch {
    throw new HttpError(404, 'Not found');
  }
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

    // ── 1. AUTHENTICATE — the real boundary: session, suspension, canonical profile. ──
    const actor = await authenticateActor(base44, sb);

    // ── 2. REQUEST BODY — may describe WHAT is requested, never WHO may act, and never a VALUE. ──
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
      throw new HttpError(400, 'snapshotType must be one of historical, tax_year, projected');
    }
    if (typeof isLatest !== 'boolean' || typeof updateDashboard !== 'boolean') {
      throw new HttpError(400, 'isLatest and updateDashboard must be booleans');
    }

    // ── 3. AUTHORIZE — document row → tenant → exact approved policy. ──
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

    // ── 4. RESOLVE — accepted/corrected fields, tenant-pinned. No values leave this function. ──
    const { data: fields, error: fieldsError } = await sb
      .from('extracted_fields')
      .select('id, field_name')
      .eq('document_id', documentId)
      .eq('business_id', businessId)
      .in('review_status', ['accepted', 'corrected']);

    if (fieldsError) {
      console.error('[snapshot] field read failed');
      throw new HttpError(500, 'Internal server error');
    }
    if (!fields || fields.length === 0) {
      return Response.json({
        error: 'No accepted or corrected fields found for this document',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    const idsByName = new Map<string, string[]>();
    for (const field of fields) {
      const list = idsByName.get(field.field_name) || [];
      list.push(field.id);
      idsByName.set(field.field_name, list);
    }

    // ── SELECTION ONLY: targets and the field ids that fill them. ──
    const fieldMap: any[] = [];
    const used = new Set<string>();

    for (const [target, fieldName] of Object.entries(contract.columns)) {
      const ids = (idsByName.get(fieldName as string) || []).slice(-1); // last accepted row wins
      if (ids.length) {
        fieldMap.push({ target, op: 'direct', field_ids: ids });
        used.add(ids[0]);
      }
    }
    for (const [key, fieldName] of Object.entries(contract.metadata)) {
      const ids = (idsByName.get(fieldName as string) || []).slice(-1);
      if (ids.length) {
        fieldMap.push({ target: `metadata.${key}`, op: 'direct', field_ids: ids });
        used.add(ids[0]);
      }
    }
    for (const agg of contract.aggregations) {
      const ids = idsByName.get(agg.field_name) || [];
      // No contributing field ⇒ the aggregate is OMITTED, never written as 0.
      if (ids.length) {
        fieldMap.push({ target: agg.target, op: agg.op, field_ids: ids });
        ids.forEach((id: string) => used.add(id));
      }
    }

    const skipped = fields
      .filter((f: any) => !used.has(f.id))
      .map((f: any) => ({ field_id: f.id, reason: `No destination in contract ${MAPPING_VERSION}` }));

    // ── 5. WRITE — one atomic, idempotent, serialized RPC. Values are read inside it. ──
    const { data: result, error: rpcError } = await sb.rpc('create_reviewed_fields_snapshot', {
      p_business_id: businessId,
      p_source_document_id: documentId,
      p_actor_profile_id: actor.profile_id,
      p_actor_base44_user_id: actor.user?.id ?? null,   // attribution only — never authorization
      p_mapping_version: MAPPING_VERSION,
      p_basis: contract.basis,
      p_snapshot_type: snapshotType,                    // null ⇒ default applied in the database
      p_field_map: fieldMap,
      p_skipped: skipped,
      p_is_latest: isLatest,
      p_update_dashboard: updateDashboard,
    });

    if (rpcError) {
      console.error('[snapshot] atomic write failed');
      throw new HttpError(500, 'Internal server error');
    }

    const mapped = Array.isArray(result?.applied) ? result.applied : [];
    const skippedApplied = Array.isArray(result?.skipped) ? result.skipped : skipped;

    return Response.json({
      success: true,
      snapshot_id: result?.snapshot_id ?? null,
      snapshot_type: result?.snapshot_type ?? null,
      fields_mapped: mapped.map((m: any) => ({ field: m.target, mapped_to: m.target })),
      fields_skipped: skippedApplied.map((s: any) => ({ field: s.reason, reason: s.reason })),
      dashboard_metrics_updated: result?.dashboard_metrics_updated === true,
      deduplicated: result?.deduplicated === true,
      confidence_score: result?.confidence_score ?? null,
      message: skippedApplied.length > 0
        ? `Snapshot created with ${mapped.length} fields. ${skippedApplied.length} fields skipped (partial snapshot).`
        : `Snapshot created successfully with ${mapped.length} fields.`,
    });

  } catch (error) {
    // HttpError carries an explicit safe status; anything else is logged and returned as a
    // generic 500. No database message ever reaches the caller.
    return errorResponse(error);
  }
});
```

### 8.3 Preservation (requirement 8)

| Behaviour | Status |
|---|---|
| Contract mapping per document type | **Preserved in meaning**, expressed as a versioned contract (§5.1) |
| Last-accepted-row-wins for a repeated field name | **Preserved** (`.slice(-1)`) |
| Default snapshot type (`tax_year` for tax returns, else `historical`) | **Preserved**, now applied in the database |
| Debt-schedule and payroll aggregation | **Preserved**; two defects corrected (F-2, F-5) and both are flagged |
| `data_source = 'advisor_review'`, `profile_id` = document owner, `snapshot_date` = year-12-31 else today | **Preserved** |
| `data_confidence_score` = mean confidence (2dp) | **Preserved**, computed in the database |
| Response shape | **Preserved**; `deduplicated` added |
| `is_latest` from the request | **Preserved** |
| Dashboard update only for mapped fields | **Preserved**; column names corrected to `annual_revenue`/`net_profit` |
| Duplicate submission | **Deliberately changed** — idempotent (D-9) |

---

## 9. Proposed Supabase change (separate from Base44 — NOT created, NOT applied)

**Deliverable at Gate B:** one new file, `src/supabase/migrations/phase_s4_reviewed_fields_snapshot_atomic.sql`, containing **one function** (+ optional indexes in a clearly separated section). **No tables, columns, policies, data or CB-005A/CB-005B objects.**

### 9.1 Design notes carried into the SQL

`security invoker` (no privilege elevation; the only caller already holds the service-role key); `search_path` pinned; `REVOKE` before `GRANT`; the actor's relationship re-validated **as a relationship, not as identity**; the tenant re-derived from `documents`; every metric value read from `extracted_fields` under the accepted/corrected predicate; all three effects in one transaction.

### 9.2 Proposed SQL

```sql
-- ============================================================================
-- Phase S4 — Atomic, idempotent, serialized reviewed-fields snapshot persistence
-- Additive: ONE function (+ optional indexes in §9.5, created separately).
--
-- TRUST BOUNDARY: p_actor_profile_id is a CLAIM by the service-role caller. It does not
-- prove end-user identity. This function validates the actor's PROFILE and its authorized
-- RELATIONSHIP to the business, and pins the tenant to the document. End-user
-- authentication happens in the Base44 function that calls this one.
--
-- SOURCE INTEGRITY: no financial VALUE is accepted. Values are read here, inside the
-- transaction, from extracted_fields rows that are accepted/corrected AND belong to this
-- document AND this business.
-- ============================================================================

create or replace function public.create_reviewed_fields_snapshot(
  p_business_id           uuid,
  p_source_document_id    uuid,
  p_actor_profile_id      uuid,
  p_actor_base44_user_id  text,
  p_mapping_version       text,
  p_basis                 text,
  p_snapshot_type         text,
  p_field_map             jsonb,
  p_skipped               jsonb,
  p_is_latest             boolean,
  p_update_dashboard      boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_metric_columns constant text[] := array[
    'annual_revenue','gross_profit','net_profit','total_expenses','owner_compensation',
    'payroll','total_debt','cash_on_hand','total_assets'];
  v_doc_business   uuid;
  v_doc_profile    uuid;
  v_doc_type       text;
  v_doc_year       integer;
  v_role           text;
  v_status         text;
  v_is_admin       boolean;
  v_authorized     boolean := false;
  v_entity         record;
  v_entry          jsonb;
  v_target         text;
  v_op             text;
  v_ids            uuid[];
  v_requested      integer;
  v_found          integer;
  v_total          numeric;
  v_value          numeric;
  v_metrics        jsonb := '{}'::jsonb;
  v_meta_metrics   jsonb := '{}'::jsonb;
  v_provenance     jsonb := '{}'::jsonb;
  v_fingerprint    text := '';
  v_content_hash   text;
  v_existing       uuid;
  v_existing_latest boolean;
  v_snapshot_date  date;
  v_snapshot_type  text;
  v_confidence     numeric;
  v_snapshot_id    uuid;
  v_dashboard_done boolean := false;
begin
  -- ── 1. INPUT SHAPE ────────────────────────────────────────────────────────
  if p_business_id is null or p_source_document_id is null
     or p_actor_profile_id is null or p_mapping_version is null then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  if jsonb_typeof(p_field_map) <> 'array' or p_field_map = '[]'::jsonb then
    raise exception 'SNAPSHOT_INVALID_INPUT' using errcode = '22023';
  end if;
  if p_snapshot_type is not null
     and p_snapshot_type not in ('historical','tax_year','projected') then
    raise exception 'SNAPSHOT_INVALID_TYPE' using errcode = '22023';
  end if;

  -- ── 2. SERIALIZE ALL SNAPSHOT WRITES FOR THIS BUSINESS ────────────────────
  -- Taken before any read, so is_latest switching, the dashboard upsert and the
  -- content-hash lookup cannot interleave. Released at commit/rollback.
  perform pg_advisory_xact_lock(
    hashtextextended('s4:snapshot:' || p_business_id::text, 0));

  -- ── 3. TENANT RE-DERIVED FROM PERSISTED ROWS ──────────────────────────────
  select d.business_id, d.profile_id, d.document_type, d.year
    into v_doc_business, v_doc_profile, v_doc_type, v_doc_year
    from public.documents d
   where d.id = p_source_document_id;

  if v_doc_business is null or v_doc_business <> p_business_id then
    raise exception 'SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH' using errcode = '42501';
  end if;

  -- ── 4. ACTOR PROFILE + AUTHORIZED RELATIONSHIP (relationship, NOT identity) ─
  select p.app_role, p.profile_status
    into v_role, v_status
    from public.profiles p
   where p.id = p_actor_profile_id;

  if v_role is null then
    raise exception 'SNAPSHOT_ACTOR_UNKNOWN' using errcode = '42501';
  end if;
  if v_status = 'suspended' then
    raise exception 'SNAPSHOT_ACTOR_SUSPENDED' using errcode = '42501';
  end if;

  v_is_admin := v_role in ('admin','super_admin');

  if not v_is_admin then
    select be.profile_id, be.assigned_advisor_id into v_entity
      from public.business_entities be
     where be.id = p_business_id;

    if v_entity.profile_id is not null and v_entity.profile_id = p_actor_profile_id then
      v_authorized := true;                                   -- verified business owner
    elsif v_role = 'advisor'
          and v_entity.assigned_advisor_id is not null
          and v_entity.assigned_advisor_id = p_actor_profile_id then
      v_authorized := true;                                   -- assigned advisor (role + assignment)
    else
      select true into v_authorized
        from public.business_owners bo
       where bo.business_id = p_business_id
         and bo.profile_id = p_actor_profile_id
         and (bo.end_date is null or bo.end_date >= current_date)
       limit 1;
      v_authorized := coalesce(v_authorized, false);           -- explicit ownership record
    end if;
  end if;

  if not v_authorized and not v_is_admin then
    raise exception 'SNAPSHOT_FORBIDDEN' using errcode = '42501';
  end if;

  -- ── 5. VALUES — READ HERE, FROM CANONICAL ROWS. NO CALLER VALUE IS TRUSTED. ─
  for v_entry in select * from jsonb_array_elements(p_field_map) loop
    v_target := v_entry->>'target';
    v_op     := coalesce(v_entry->>'op', 'direct');

    if v_target is null or v_op not in ('direct','sum','mean') then
      raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
    end if;
    if left(v_target, 9) <> 'metadata.'
       and not (v_target = any (v_metric_columns)) then
      raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
    end if;

    select array_agg(x::uuid) into v_ids
      from jsonb_array_elements_text(v_entry->'field_ids') x;
    if v_ids is null or array_length(v_ids, 1) is null then
      raise exception 'SNAPSHOT_INVALID_TARGET' using errcode = '22023';
    end if;
    v_requested := array_length(v_ids, 1);

    -- Provenance + count: EVERY referenced row must be an accepted/corrected field of
    -- THIS document AND THIS business. A foreign or unreviewed field cannot contribute.
    select count(*), sum(f.accepted_normalized_value)
      into v_found, v_total
      from public.extracted_fields f
     where f.id = any (v_ids)
       and f.document_id = p_source_document_id
       and f.business_id = p_business_id
       and f.review_status in ('accepted','corrected');

    if coalesce(v_found, 0) <> v_requested then
      raise exception 'SNAPSHOT_FIELD_NOT_ACCEPTED' using errcode = '42501';
    end if;

    if v_op = 'direct' then
      select f.accepted_normalized_value into v_value
        from public.extracted_fields f where f.id = v_ids[1];
    elsif v_op = 'sum' then
      v_value := coalesce(v_total, 0);            -- every contributing row exists (count matched)
    else
      v_value := round(v_total / v_requested, 6);
    end if;

    if v_value is null then
      raise exception 'SNAPSHOT_FIELD_VALUE_MISSING' using errcode = '22023';
    end if;

    if left(v_target, 9) = 'metadata.' then
      v_meta_metrics := jsonb_set(v_meta_metrics, array[right(v_target, -9)],
                                  to_jsonb(v_value), true);
    else
      v_metrics := jsonb_set(v_metrics, array[v_target], to_jsonb(v_value), true);
    end if;

    v_provenance := jsonb_set(v_provenance, array[v_target],
                              jsonb_build_object('op', v_op, 'field_ids', to_jsonb(v_ids)), true);
    v_fingerprint := v_fingerprint || '|' || v_target || '=' || v_value::text;
  end loop;

  v_content_hash := md5(p_source_document_id::text || '|' || p_mapping_version || v_fingerprint);

  -- ── 6. IDEMPOTENCY — identical content returns the existing snapshot ──────
  select id, is_latest into v_existing, v_existing_latest
    from public.business_metric_snapshots
   where business_id = p_business_id
     and metadata->>'content_hash' = v_content_hash
   limit 1;

  if v_existing is not null then
    if coalesce(p_is_latest, false) and v_existing_latest is not true then
      update public.business_metric_snapshots
         set is_latest = false
       where business_id = p_business_id and id <> v_existing and is_latest = true;
      update public.business_metric_snapshots
         set is_latest = true
       where id = v_existing;
    end if;
    return jsonb_build_object(
      'snapshot_id', v_existing,
      'deduplicated', true,
      'dashboard_metrics_updated', false,
      'snapshot_type', null,
      'applied', '[]'::jsonb,
      'skipped', coalesce(p_skipped, '[]'::jsonb),
      'confidence_score', null
    );
  end if;

  -- ── 7. DERIVED FIELDS — never supplied by the caller ──────────────────────
  v_snapshot_date := case when v_doc_year is not null
                          then make_date(v_doc_year, 12, 31)
                          else current_date end;
  v_snapshot_type := coalesce(
    p_snapshot_type,
    case when v_doc_type in ('business_tax_return','personal_tax_return')
         then 'tax_year' else 'historical' end);

  select avg(f.confidence_score::numeric) into v_confidence
    from public.extracted_fields f
   where f.document_id = p_source_document_id
     and f.business_id = p_business_id
     and f.review_status in ('accepted','corrected');

  -- ── 8. SNAPSHOT — typed columns, is_latest starts false ──────────────────
  -- NOTE: `data` does not exist on this table; values go to their canonical columns.
  -- NOTE: created_by is uuid — a Base44 user id cannot go here (see F-6). The canonical
  --       profile id is recorded, and the Base44 id is kept as labelled attribution.
  insert into public.business_metric_snapshots (
    profile_id, business_id, snapshot_type, snapshot_date,
    annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation,
    payroll, total_debt, cash_on_hand, total_assets,
    metadata, data_source, source_document_id, data_confidence_score, is_latest, created_by
  )
  values (
    v_doc_profile, p_business_id, v_snapshot_type, v_snapshot_date,
    (v_metrics->>'annual_revenue')::numeric,
    (v_metrics->>'gross_profit')::numeric,
    (v_metrics->>'net_profit')::numeric,
    (v_metrics->>'total_expenses')::numeric,
    (v_metrics->>'owner_compensation')::numeric,
    (v_metrics->>'payroll')::numeric,
    (v_metrics->>'total_debt')::numeric,
    (v_metrics->>'cash_on_hand')::numeric,
    (v_metrics->>'total_assets')::numeric,
    v_meta_metrics
      || jsonb_build_object(
           'mapping_contract', jsonb_build_object('version', p_mapping_version,
                                                  'document_type', v_doc_type),
           'basis', p_basis,
           'content_hash', v_content_hash,
           'provenance', v_provenance,
           'created_by_base44_user_id', p_actor_base44_user_id
         ),
    'advisor_review', p_source_document_id,
    round(v_confidence, 2),
    false,
    p_actor_profile_id
  )
  returning id into v_snapshot_id;

  -- ── 9. is_latest — demote first, then promote; exactly one true row results ─
  if coalesce(p_is_latest, false) then
    update public.business_metric_snapshots
       set is_latest = false
     where business_id = p_business_id and id <> v_snapshot_id and is_latest = true;
    update public.business_metric_snapshots
       set is_latest = true
     where id = v_snapshot_id;
  end if;

  -- ── 10. DASHBOARD — corrected columns, no duplicate insert ────────────────
  if coalesce(p_update_dashboard, false)
     and (v_metrics ? 'annual_revenue' or v_metrics ? 'net_profit')
  then
    update public.dashboard_metrics
       set annual_revenue = coalesce((v_metrics->>'annual_revenue')::numeric, annual_revenue),
           net_profit     = coalesce((v_metrics->>'net_profit')::numeric, net_profit),
           updated_at     = clock_timestamp()
     where business_id = p_business_id;

    if not found then
      insert into public.dashboard_metrics
        (business_id, annual_revenue, net_profit, created_at, updated_at)
      values (p_business_id,
              (v_metrics->>'annual_revenue')::numeric,
              (v_metrics->>'net_profit')::numeric,
              clock_timestamp(), clock_timestamp());
    end if;

    v_dashboard_done := true;
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'deduplicated', false,
    'dashboard_metrics_updated', v_dashboard_done,
    'snapshot_type', v_snapshot_type,
    'applied', v_metrics || v_meta_metrics,
    'skipped', coalesce(p_skipped, '[]'::jsonb),
    'confidence_score', round(v_confidence, 2)
  );
end;
$$;

-- ── 11. ACCESS CONTROL — REVOKE first, then GRANT (CB-001.1 precedent) ──────
revoke all on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) from public;
revoke all on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) from anon, authenticated;
grant execute on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) to service_role;

comment on function public.create_reviewed_fields_snapshot(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, boolean) is
'Phase S4: atomic, idempotent persistence of an advisor-reviewed snapshot. service_role ONLY.
p_actor_profile_id is a claim, NOT end-user authentication: this function validates the actor
PROFILE and its authorized RELATIONSHIP to the business. Values are read here from accepted or
corrected extracted_fields of this document and business; no caller-supplied value is trusted.
Serialized per business by a transaction-scoped advisory lock; identical content is deduplicated.';
```

### 9.3 Why `security invoker`

The only caller already holds the service-role key and bypasses RLS, so `security definer` buys nothing while adding an owner-privileged surface. `security invoker` keeps effective privileges equal to the caller's; `search_path` is pinned to prevent object shadowing.

### 9.4 Constraints the function relies on internally

| Reliance | Type |
|---|---|
| `documents.id`, `profiles.id`, `business_entities.id`, `extracted_fields.id` are uuid PKs | **assumed** (A-4 family; verify §9.6) |
| `extracted_fields.review_status` values include `accepted`/`corrected` | **assumed** (used today) |
| No unique constraint blocks a snapshot insert | **assumed** |
| `dashboard_metrics` upsert correctness | **does not depend on a unique index** — the advisory lock plus update-then-insert is sufficient |

### 9.5 OPTIONAL hardening (separate approval — not required for correctness)

```sql
-- Requires: A-2 confirms no business has more than one is_latest row.
create unique index if not exists ux_bms_one_latest_per_business
  on public.business_metric_snapshots (business_id) where is_latest;

-- Performance only: makes the idempotency lookup an index scan.
create index if not exists ix_bms_content_hash
  on public.business_metric_snapshots (business_id, (metadata->>'content_hash'));
```

### 9.6 Gate B verification queries (READ-ONLY — to be run before the migration is finalized)

```sql
-- Column types, nullability, defaults (authoritative)
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('business_metric_snapshots','dashboard_metrics','extracted_fields',
                      'documents','business_entities','business_owners','profiles')
 order by table_name, ordinal_position;

-- Indexes and unique constraints (A-1)
select tablename, indexname, indexdef from pg_indexes
 where schemaname = 'public'
   and tablename in ('business_metric_snapshots','dashboard_metrics');

select conrelid::regclass as tbl, conname, contype, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid in ('public.business_metric_snapshots'::regclass,
                    'public.dashboard_metrics'::regclass);

-- Prior-art checks
select proname from pg_proc where proname = 'create_reviewed_fields_snapshot';      -- A-4
select grantee, privilege_type from information_schema.role_table_grants            -- A-8
 where table_schema='public'
   and table_name in ('business_metric_snapshots','dashboard_metrics','extracted_fields')
   and grantee = 'service_role';

-- Data integrity preflight (A-2, A-3, A-5)
select business_id, count(*) from public.business_metric_snapshots
 where is_latest group by business_id having count(*) > 1;
select business_id, count(*) from public.dashboard_metrics
 group by business_id having count(*) > 1;
select count(*) from public.business_owners where end_date is not null;
select count(*) from public.documents where business_id is null or profile_id is null;
select count(*) from public.business_metric_snapshots;   -- 0 would confirm this path never worked

-- Unit check for the margin column (A-7)
select net_margin from public.business_metric_snapshots
 where net_margin is not null limit 20;
```

The authorized Supabase connector carries `database:read`, which appears sufficient for these reads — to be confirmed before Gate B.

---

## 10. Per-issue correction summary (Base44 / Supabase / both)

| Issue | Smallest safe correction | Base44 | Supabase |
|---|---|---|---|
| 1 Authorization | Seven-row exact decision table (remove prefix matching) | ✔ | ✔ (mirrored) |
| 2 Trust boundary | Header + `comment on function` using the §4 wording | ✔ | ✔ |
| 3 Financial mapping | Contract v1: `total_liabilities`→metadata; `mean_interest_rate`; omit-never-zero; basis + provenance; `created_by` = profile uuid | ✔ | ✔ |
| 4 Source integrity | Selection not values; DB-derived values; predicate + count match; content hash; provenance; `mapping_contract` | ✔ | ✔ |
| 5 Concurrency | Advisory lock; content-hash idempotency; demote-then-promote; lock-safe dashboard upsert | — | ✔ |
| 6 Database compatibility | Verified-vs-assumed split + read-only verification set | ✔ | ✔ |
| 7 Test coverage | Adversarial suite (§12) — test artifacts only | ✔ | ✔ |
| Optional hardening | Partial unique index; content-hash index | — | ✔ (separate approval) |

---

## 11. Decisions requiring your sign-off

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| **D-1** | Status for authenticated-but-unauthorized and cross-business ids | **404** — indistinguishable from absent (matches `getDocumentsAdmin`) | 403 (confirms the document exists) |
| **D-2** | Team-member / expert-access authority | **Denied** — access ≠ authority, per the approved policy | Widen (contradicts the policy) |
| **D-3** | Snapshot writes typed columns (no `data` column exists) | **Correct it** | Keep the broken target — the function stays non-functional |
| **D-4** | Advisor rule source | `business_entities.assigned_advisor_id` + `app_role='advisor'`; `advisor_assignments` is not usable | Expose that table (out of scope) |
| **D-5** | *(withdrawn)* — label matching | Replaced by the exact table in §3 | — |
| **D-6** | Timestamps | Server-side `clock_timestamp()` | Pass a JS timestamp |
| **D-7** | Documents with no business/owner | **409 fail-closed** | Skip authorization (rejected) |
| **D-8** | `total_liabilities` destination | **`metadata.total_liabilities`** now; column later | Add a column now (bigger change) |
| **D-9** | **Idempotency** — identical content returns the existing snapshot | **Adopt** (`deduplicated: true`) | Keep duplicates; caller-supplied key (extra trust surface) |
| **D-10** | Interest rate | Emit `metadata.mean_interest_rate`; weighted only when pairing is provable | Keep the misleading key (not recommended) |
| **D-11** | `net_margin` | **Do not write** until A-7 confirms the unit; then same-basis only | Write immediately (risks a wrong unit) |
| **D-12** | Optional DB indexes (§9.5) | Defer to a separate approval after preflight | Include now |
| **D-13** | `created_by` = canonical profile uuid (Base44 id moves to metadata) | **Adopt** (F-6) | — |

---

## 12. Issue 7 — Test plan (Gate B; nothing executed now)

Assertion counts before/after on `business_metric_snapshots` and `dashboard_metrics`. No live providers, no Digital Twin paths.

### 12.1 Adversarial — identity and authority

| # | Scenario | Expected |
|---|---|---|
| **ADV-1** | **Forged actor id in the body** (`profile_id`, `actor_profile_id`, `business_id`, `created_by`) | Ignored; decision and attribution unchanged; no snapshot written by the forged identity |
| **ADV-2** | **Direct RPC call with a forged `p_actor_profile_id`** (service-role key, wrong profile) | `SNAPSHOT_FORBIDDEN`; zero writes — the relationship check holds even when identity is unproven |
| **ADV-3** | **Suspended profile** calls the function | 403 at the auth gate; zero writes |
| **ADV-4** | **Suspended advisor who is assigned** to the business | Refused — suspension outranks assignment (RPC raises `SNAPSHOT_ACTOR_SUSPENDED`) |
| **ADV-5** | **Role mismatch:** `advisor` app role, no assignment | 404; zero writes |
| **ADV-6** | **Role mismatch:** assignment column set to a profile whose role is not `advisor` | RPC refuses via the relationship path; zero writes |
| **ADV-7** | `team_member` of the business | Denied (D-2) |
| **ADV-8** | Expert-access relationship only | Denied (D-2) |
| **ADV-9** | Owner of business A names a document of business B | 404; zero writes |
| **ADV-10** | Owner via `business_owners` whose `end_date` has passed | Denied |
| **ADV-11** | No session / `auth.me()` throws | 401; zero writes |

### 12.2 Adversarial — value manipulation and source integrity

| # | Scenario | Expected |
|---|---|---|
| **ADV-12** | **Manipulated financial value in the body** (e.g. `annual_revenue: 999999999`) | No effect: values are not accepted from the caller. Snapshot carries the field row's value |
| **ADV-13** | `p_field_map` references a field id from **another business** | `SNAPSHOT_FIELD_NOT_ACCEPTED`; zero writes |
| **ADV-14** | `p_field_map` references a field id from **another document** | Same refusal |
| **ADV-15** | `p_field_map` references a field whose `review_status` is `pending_review`/`rejected` | Same refusal |
| **ADV-16** | Target outside the whitelist (`data`, `revenue`, `total_liabilities` as a column, arbitrary key) | `SNAPSHOT_INVALID_TARGET`; zero writes |
| **ADV-17** | `op` outside `direct`/`sum`/`mean`, or an expression-shaped target | Refused; **no dynamic SQL exists** |
| **ADV-18** | Accepted field mutated between the caller's read and the RPC | The **committed** row's value is what lands (values are read inside the transaction) |
| **ADV-19** | `accepted_normalized_value` is NULL for a referenced field | `SNAPSHOT_FIELD_VALUE_MISSING`; zero writes — never a zero or a guess |
| **ADV-20** | Debt schedule with **no** `loan_balance` accepted | `total_debt` **absent** from the snapshot, not `0` (F-2) |
| **ADV-21** | Debt schedule with several loans | `total_debt` = Σ balances; `mean_interest_rate` = arithmetic mean; **no** key named `weighted_interest_rate` |
| **ADV-22** | Tax-return document | `metadata.basis = 'tax'`; provenance lists the tax-basis field names; values untouched |
| **ADV-23** | `created_by` | Equals the canonical profile uuid; `metadata.created_by_base44_user_id` holds the Base44 id (F-6) |

### 12.3 Concurrency, idempotency and rollback

| # | Scenario | Expected |
|---|---|---|
| **ADV-24** | Two genuinely concurrent identical requests | Exactly one snapshot; the second returns `deduplicated: true`; the advisory lock serializes them |
| **ADV-25** | Two concurrent requests with **different** content, both `isLatest=true` | Exactly one `is_latest` row for the business afterwards; no lost update |
| **ADV-26** | Duplicate retry of a successful call | Same `content_hash` ⇒ same `snapshot_id`; no second row |
| **ADV-27** | Retry with `isLatest=true` after the first snapshot was demoted | The existing row is promoted; still one `is_latest` row |
| **ADV-28** | Concurrent dashboard writes for one business | One `dashboard_metrics` row; no duplicate insert |
| **ADV-29** | **Transaction rollback** — forced failure after the snapshot insert (e.g. inject a failure before the dashboard step) | Zero snapshot rows, zero dashboard change, zero demotion |
| **ADV-30** | Rollback leaves no lock | A subsequent call acquires the advisory lock without blocking |
| **ADV-31** | Cross-business demotion | Another business's `is_latest` rows untouched |
| **ADV-32** | `anon`/`authenticated` calls the RPC directly | `permission denied for function` |

### 12.4 Positive and regression

| # | Scenario | Expected |
|---|---|---|
| P-1 | Owner / canonical admin / assigned advisor each on a valid document | 200; snapshot with correct `business_id`, `profile_id`, `source_document_id`, `data_source`, `snapshot_date`, `data_confidence_score` |
| P-2 | Mapping parity, all six document types | Same mapped/skipped sets as §5.1; every target resolves |
| P-3 | `updateDashboard` true/false, and with no dashboard-mappable field | `dashboard_metrics_updated` correct; dashboard untouched when nothing is mappable |
| P-4 | `is_latest` false | No demotion |
| P-5 | Response body | Previous keys intact; `deduplicated` added |
| P-6 | Pre-existing snapshots | Untouched — no backfill, no rewrite (relevant to F-5/F-6) |

### 12.5 Structural checks

- `EXECUTE` on the RPC held by `service_role` only.
- The migration contains no `CREATE TABLE` / `ALTER TABLE` / `CREATE POLICY` and touches no CB-005A/CB-005B object.
- Static check: the Base44 function contains no `user = null` fallback and no read of the **document owner's** `app_role`.

---

## 13. Rollback

| Layer | Rollback | Order |
|---|---|---|
| Base44 | Revert `createSnapshotFromReviewedFields/entry.ts` via deploy history | **First** |
| Supabase | `drop function public.create_reviewed_fields_snapshot(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,boolean,boolean);` | **Second**, only after the caller is reverted |

**Deploy order:** migration first (additive; nothing calls it until the code ships), then the Base44 function. Rollback is the reverse — dropping the function while the new caller is live would break snapshot creation.

**No data rollback:** snapshots written through the RPC use the same table and columns as any other snapshot. Nothing needs migrating forward or back. Stated plainly: the pre-patch revision is itself non-functional (F-1, F-6), so a rollback restores a broken state rather than a working one. Existing snapshot rows are never rewritten by this patch.

---

## 14. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **D-3 makes the path functional for the first time** — snapshots that never landed may now write, changing dashboards | **High** | Explicit approval of D-3; isolated Gate B; `select count(*)` on `business_metric_snapshots` first (§9.6) to establish whether any historical rows exist at all |
| Idempotency (D-9) changes duplicate behaviour | Medium | Approved explicitly; `deduplicated: true` is visible in the response; promoting on `isLatest` keeps the request's intent |
| Per-business advisory lock serializes snapshot writes | Low | Writes are rare and short; the lock is per business, so unrelated businesses never contend |
| Correcting `created_by` semantics (F-6) changes attribution data | Low | Existing rows untouched; the Base44 id is preserved in metadata |
| Denying team-member / expert access (D-2) | Medium | Intentional; confirm the review queue is not used by team members before deploy |
| Documents with null business/owner refused (D-7) | Medium | Pre-deploy count (§9.6) and report the number |
| Assumptions A-1…A-9 unverified | Medium | §9.6 read-only verification before the migration is written; the design avoids depending on A-1 (no `ON CONFLICT`) |
| Margin deferred pending A-7 (D-11) | Low | Revenue and net profit still persisted; margin is simply not claimed |
| Tax-basis values labelled with book-basis names (F-7) | Low | Basis recorded on every snapshot; renaming book-basis targets is a separate, larger change |
| `total_liabilities` in metadata rather than a column (D-8) | Low | No longer dropped; a column is a follow-up |

---

## 15. Gate status

- **Gate A (this packet):** review §3 (exact authorization), §4 (trust boundary wording), §5 (financial audit), §6 (source integrity), §7 (concurrency), §8.2 (Base44 file), §9.2 (SQL), §11 (D-1…D-13), §12 (tests). **Nothing applied.**
- **Gate B (only on your explicit approval):** run §9.6 read-only verification → create the migration → apply to an isolated environment → implement the file → run §12 → report. Production remains a separate decision.

**Awaiting:** approval of §8.2 and §9.2, and your rulings on **D-1…D-13**.