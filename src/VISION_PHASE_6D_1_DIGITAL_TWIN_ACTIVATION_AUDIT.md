# VISION PHASE 6D.1 — DIGITAL TWIN ACTIVATION
## PHASE 0 — READ-ONLY ARCHITECTURE + PROMOTION AUDIT

**Status:** audit complete. **Nothing implemented, written, migrated, or changed.**
**Production verified read-only** through the Supabase connector (`database:read`, `projects:read`) against
project `tfrbswfrhrtgfcgonimb` (`V.I.S.I.O.N Platform`, us-east-2). All reads used the read-only SQL
endpoint (`/database/query/read-only`). No INSERT/UPDATE/DELETE/DDL was issued. No test rows created.

### Evidence classification used throughout
| Tag | Meaning |
| --- | --- |
| **CODE-VERIFIED** | Established by reading the repository source. |
| **PRODUCTION-VERIFIED** | Read from the live production database catalog or rows. |
| **SIMULATED** | Deterministic computation over real production rows; no write performed. |
| **PROPOSED** | A recommendation. Not built. |

### Headline findings
1. **PRODUCTION-VERIFIED — the Digital Twin IS deployed and IS dormant.** `public.business_facts` = **0 rows**,
   `public.business_fact_evidence` = **0 rows**, `business_fact_conflicts` = **0 rows**.
2. **PRODUCTION-VERIFIED — the migration file lies.** `phase_6c_digital_twin_facts.sql` carries
   `NOT EXECUTED / DO NOT RUN`, yet the live schema matches **revision 3 exactly** (constraints, composite FKs,
   indexes, RLS posture, guard trigger, conflict view). Documentation drift, in the *opposite* direction from the
   historical Phase 6C note. Production is authoritative.
3. **PRODUCTION-VERIFIED — a latent cross-tenant read hole exists today.** The
   `business_fact_conflicts` **view** is owned by `postgres`, has **no `security_invoker`**, and is
   **SELECT-granted to `anon` and `authenticated`**. Views cannot carry RLS, and a view runs with its owner's
   privileges, so once facts exist any anonymous client could read conflict aggregates **across all businesses**,
   bypassing the base tables' RLS. It is empty today, so nothing is exposed yet. This is a P0 prerequisite.
4. **PRODUCTION-VERIFIED — no production observation is currently eligible for promotion.**
   Of 130 `extracted_fields` rows: **0 carry an accounting basis**, **104 carry no business-relevance verdict**,
   and the only accepted, period-stated, business-relevant candidate set belongs to a business whose evidence was
   produced by **`mock_extraction`**.
5. **SIMULATED — the revenue/gross_profit dry run produces ZERO promotable candidates.** Not one observation
   satisfies period + basis + provenance + eligibility + review-state together. The pilot cannot certify on
   today's data.

---

## 1. LIVE SCHEMA (PRODUCTION-VERIFIED)

### 1.1 Objects that exist
| Qualified name | Kind | RLS enabled | RLS forced | Owner |
| --- | --- | --- | --- | --- |
| `public.business_facts` | table | **true** | false | postgres |
| `public.business_fact_evidence` | table | **true** | false | postgres |
| `public.business_fact_conflicts` | view | n/a (**false**) | n/a | postgres |

No copy exists in any other schema. No other `%fact%` table or materialized view exists.
Only one fact-lifecycle function exists: `public.business_facts_append_only()`.

### 1.2 `business_facts` — 41 columns (live)
`id uuid PK default gen_random_uuid()` · `business_id uuid NOT NULL` · `fact_key text NOT NULL` ·
`fact_category text NOT NULL` · `value_type text NOT NULL` · `value_numeric numeric` · `value_text text` ·
`value_boolean boolean` · `value_date date` · `value_json jsonb` · `unit text` · `currency text DEFAULT 'USD'` ·
`metric_definition text` · `metric_definition_version text` · `period_type text NOT NULL` · `period_label text` ·
`period_start date` · `period_end date` · `as_of_date date` · `fiscal_year integer` ·
`accounting_basis text NOT NULL DEFAULT 'unknown'` · `source_type text NOT NULL` ·
`source_authority_at_ingestion smallint NOT NULL` · `authority_policy_version text` · `source_table text` ·
`source_id text` · `source_reference jsonb` · `confidence numeric(5,2)` · `confidence_basis text` ·
`verification_status text NOT NULL DEFAULT 'proposed'` · `verification_method text` ·
`reviewed_by_profile_id uuid` · `reviewed_at timestamptz` · `verified_by_profile_id uuid` ·
`verified_by_service text` · `verified_at timestamptz` · `observed_at timestamptz NOT NULL DEFAULT now()` ·
`created_at timestamptz NOT NULL DEFAULT now()` · `created_by_profile_id uuid` · `created_by_service text` ·
`supersedes_fact_id uuid` · `superseded_by_fact_id uuid` · `superseded_at timestamptz` ·
`supersession_reason text` · `source_status text NOT NULL DEFAULT 'present'` ·
`is_derived boolean NOT NULL DEFAULT false` · `lineage jsonb NOT NULL DEFAULT '[]'` ·
`fingerprint text NOT NULL` · `metadata jsonb NOT NULL DEFAULT '{}'`

### 1.3 `business_fact_evidence` — 25 columns (live)
`id uuid PK` · `fact_id uuid NOT NULL` · `business_id uuid NOT NULL` · `evidence_type text NOT NULL` ·
`source_table text` · `source_id text` · `document_id uuid` · `document_analysis_id uuid` ·
`extracted_field_id uuid` · `document_name text` · `document_type text` · `page integer` · `line text` ·
`form text` · `locator jsonb NOT NULL DEFAULT '{}'` · `value_as_stated text` · `confidence numeric(5,2)` ·
`human_reviewed boolean NOT NULL DEFAULT false` · `review_event text` · `reviewed_by_profile_id uuid` ·
`reviewed_at timestamptz` · `observed_at timestamptz` · `source_status text NOT NULL DEFAULT 'present'` ·
`deleted_at timestamptz` · `created_at timestamptz NOT NULL DEFAULT now()`

### 1.4 Constraints (live, exact)
**Uniqueness — exactly two on `business_facts`:** `business_facts_fingerprint_unique UNIQUE (fingerprint)` and
`business_facts_id_business_unique UNIQUE (id, business_id)`. **No `(business_id, fact_key)` uniqueness exists.**

**Foreign keys — five, all verified live:**
- `business_facts.business_id → business_entities(id) ON DELETE CASCADE`
- `business_fact_evidence.business_id → business_entities(id) ON DELETE CASCADE`
- `business_fact_evidence.(fact_id, business_id) → business_facts(id, business_id) ON DELETE CASCADE`
- `business_facts.(supersedes_fact_id, business_id) → business_facts(id, business_id)` (NO ACTION)
- `business_facts.(superseded_by_fact_id, business_id) → business_facts(id, business_id)` (NO ACTION)

**CHECK constraints on `business_facts` (21 named + 8 inline column checks):** `value_shape`, `value_type`,
`period_type` (closed 9-value vocabulary), `accounting_basis` (cash/accrual/tax/book/unknown), `source_type`
(closed 13-value vocabulary), `confidence`, `verification_status` (proposed/confirmed/verified/rejected/superseded),
`verification_method` (closed 8-value vocabulary), `verified_by_service_vocab`, `verified_fields_scope`,
`verified_method_required`, `verified_requires_attestation`, `verified_human_needs_profile`,
`verified_source_needs_service`, `verified_service_method_alignment`, `verified_provenance_required`,
`legacy_migration_needs_provenance`, `confirmed_needs_review`, `confirmed_method_alignment`,
`rejected_needs_reviewer`, `review_timestamp`, `no_self_supersede`, `no_self_supersedes`,
`superseded_needs_reason`, `superseded_consistent`, `source_status`.

**CHECK constraints on `business_fact_evidence`:** `evidence_type` (closed 16-value vocabulary), `confidence`,
`source_status`, `document_ref_shape`, `deleted_shape`.

### 1.5 Indexes (live — 11 total, exactly as designed)
`business_facts`: `_pkey`, `_fingerprint_unique`, `_id_business_unique`,
`idx_business_facts_resolver (business_id, fact_key, period_type, period_label, accounting_basis) WHERE superseded_at IS NULL`,
`idx_business_facts_verification (business_id, verification_status) WHERE superseded_at IS NULL`,
`idx_business_facts_provenance (source_table, source_id)`, `idx_business_facts_supersedes (supersedes_fact_id)`.
`business_fact_evidence`: `_pkey`, `idx_fact_evidence_fact (fact_id)`, `idx_fact_evidence_source (source_table, source_id)`,
`idx_fact_evidence_document (business_id, document_id)`.

### 1.6 RLS and policies (live, exact)
| Table | RLS | Policies |
| --- | --- | --- |
| `business_facts` | enabled | **1**: `business_facts_read` — `SELECT`, role `authenticated`, qual `can_access_business(business_id)` |
| `business_fact_evidence` | enabled | **1**: `business_fact_evidence_read` — `SELECT`, role `authenticated`, qual `can_access_business(business_id)` |
| `business_fact_conflicts` | **not applicable (view)** | **none** |

**Zero INSERT / UPDATE / DELETE policies exist on either table** — the documented rev3 posture.

### 1.7 Triggers (live)
`business_facts_append_only` — `BEFORE INSERT OR UPDATE ON public.business_facts FOR EACH ROW`,
`tgenabled = 'O'` (enabled). Its live source is byte-equivalent to rev3: (1) refuses an INSERT that is born
`superseded`; (2) refuses any change to the 34 factual columns (append-only); (3) refuses un-superseding and
refuses moving any fact out of `superseded`. **No trigger exists on `business_fact_evidence`.**

### 1.8 Helper function (live)
`public.can_access_business(target_business_id uuid)` — `SECURITY DEFINER`, `search_path = 'public'`, returns true
when the caller is the business `profile_id`, its `assigned_advisor_id`, a `super_admin`, **or** a row in
`business_team_members`. This is the certified Phase 6B helper and it is what both read policies call.

### 1.9 Derived conflict view (live definition)
Groups live facts by `business_id, fact_key, period_type, COALESCE(period_label,''), accounting_basis` **plus**
`COALESCE(period_start,'0001-01-01'), COALESCE(period_end,…), COALESCE(as_of_date,…)`; `HAVING count(*) > 1 AND
min(value_numeric) <> max(value_numeric)`; filters `superseded_at IS NULL`, `verification_status <> 'rejected'`,
numeric value types only. Materiality is deliberately **not** applied in the view.

---

## 2. 6C INVARIANT VERIFICATION (production)

| Invariant | Classification | Production evidence |
| --- | --- | --- |
| Append-only core fact fields | **LIVE + ENFORCED** | Trigger enabled (`O`) and its live body compares all 34 factual columns with `IS DISTINCT FROM`. |
| Allowed lifecycle updates only | **LIVE + ENFORCED** | `verification_*`, `reviewed_*`, `verified_*`, supersession, `source_status`, `metadata` are the only mutable columns; everything else raises `restrict_violation`. |
| Verified-state requirements | **LIVE + ENFORCED** | 9 declarative CHECKs present live: method vocabulary, attestation identity (human **or** system), human-for-advisor/expert, service-for-connected/authoritative, service↔method alignment, provenance, legacy-migration provenance, attestation-field scope. They apply on INSERT **and** UPDATE. |
| Confirmed / rejected requirements | **LIVE + ENFORCED** | `confirmed_needs_review`, `confirmed_method_alignment` (advisor/expert review can never produce `confirmed`), `rejected_needs_reviewer`, `review_timestamp`. |
| Supersession terminality | **LIVE + ENFORCED** | Trigger refuses un-superseding and refuses leaving `superseded`; `superseded_needs_reason`; `superseded_consistent`; plus the trigger's ban on a fact born superseded. |
| Fingerprint / idempotency | **LIVE + ENFORCED** | `business_facts_fingerprint_unique` is the only identity uniqueness; the value is *inside* the fingerprint, so a corrected value is structurally a new fact. |
| Business isolation (facts) | **LIVE + ENFORCED** | `business_facts.business_id → business_entities(id)` FK; single `authenticated` read policy via `can_access_business(business_id)`. |
| Fact↔evidence lineage integrity | **LIVE + ENFORCED** | Composite FK `(fact_id, business_id) → business_facts(id, business_id)` makes it structurally impossible for evidence to belong to another tenant's fact. |
| Same-business supersession lineage | **LIVE + ENFORCED** | Both composite self-FKs present live. |
| Evidence append/tombstone shape | **LIVE + ENFORCED** | `document_ref_shape`, `deleted_shape`, closed `source_status`/`evidence_type` vocabularies. |
| Client write prevention | **LIVE, DEPENDS ON RLS** | `anon` and `authenticated` **hold** INSERT/UPDATE/DELETE grants (verified live); denial rests entirely on RLS having zero write policies. No `FORCE ROW LEVEL SECURITY`. |
| Conflict view tenant isolation | **ABSENT** | See §13.1 — the view has no `security_invoker`, is owned by `postgres`, and is SELECT-granted to `anon`. |
| `business_fact_evidence` append-only | **NOT APPLICABLE** | Evidence is intentionally mutable (review events, tombstones); no guard trigger was designed for it. |

**Conclusion:** every invariant the 6C design claims for the *tables* is genuinely deployed and enforced by the
database, not merely documented. The single gap is the **conflict view's security posture**, which is a view-level
concern the rev3 file does not address.

---

## 3. LIVE FACT ROW STATE (PRODUCTION-VERIFIED)

```
business_facts             = 0
business_fact_evidence     = 0
business_fact_conflicts    = 0
```

**Both fact tables remain empty.** There is therefore no grouped state (business / fact key / state) to report and
**no promotion has ever occurred**. No test rows were created to change this.

Context for scale: `business_entities` = 9, `documents` = 73, `document_analysis` = 62,
`extracted_fields` = 130, distinct businesses holding documents = 6, distinct businesses holding extracted fields = 3.

---

## 4. LIVE EVIDENCE INVENTORY (PRODUCTION-VERIFIED)

### 4.1 `extracted_fields` — 130 rows
Review state: `pending_review` **115** · `accepted` **12** · `corrected` **1** · `rejected` **1** ·
`needs_clarification` **1**.

By source document type:

| Document type | Rows | Rows carrying an eligibility verdict | BUSINESS_RELEVANT | PERSONAL_ONLY | AMBIGUOUS | SENSITIVE |
| --- | --- | --- | --- | --- | --- | --- |
| `profit_and_loss` | 93 | **0** | 0 | 0 | 0 | 0 |
| `personal_tax_return` | 26 | **26** | **0** | 12 | 14 | 0 |
| `business_tax_return` | 6 | **0** | 0 | 0 | 0 | 0 |
| `balance_sheet` | 5 | **0** | 0 | 0 | 0 | 0 |

**Finding E1 (PRODUCTION-VERIFIED).** The 6D.0c.3 eligibility verdict exists **only on personal-return rows** —
i.e. on the rows the policy was written to *exclude*. **Every business-relevant document (P&L, business return,
balance sheet = 104 rows) predates the policy and carries no verdict at all.** The business-evidence gate cannot be
executed for the entire corpus of business evidence; it currently falls back to legacy rules (business scoping,
sensitive-name predicate, document-type admission).

**Finding E2 (PRODUCTION-VERIFIED).** **No row carries an accounting basis.** `accounting_basis` is absent from
`metadata` on **130 of 130** rows. Basis is not merely inconsistent — it does not exist in production evidence.

**Finding E3 (PRODUCTION-VERIFIED).** Association evidence is absent. No `business_name`, `entity_name`,
`employer_name` or equivalent field exists in any of the 130 rows. The 6D.0c.3 association test
(document-stated name matching, or a document-derived classifier suggestion) has **no material to work with** in
today's data.

**Finding E4 (PRODUCTION-VERIFIED).** Only **13 reviewed** rows exist in the whole platform (12 accepted + 1
corrected), across 3 businesses, of which **8 accepted rows belong to the mock-extraction business**.

### 4.2 Field census (rows / businesses)
`total_expenses` 15/3 · `net_profit` 13/3 · `gross_profit` 11/3 · `annual_revenue` 11/3 ·
`owner_compensation` 10/2 · `amortization` 5/3 · `interest_expense` 5/3 · `operating_expenses` 5/3 ·
`operating_income` 5/3 · `cogs` 5/3 · `taxes` 5/3 · `depreciation` 5/3 · `reported_ebitda` 4/2 ·
`gross_receipts` 3/2 · `taxable_income` 3/2 · `adjusted_gross_income` 2/1 · `federal_income_tax_withheld` 2/1 ·
`itemized_deductions` 2/1 · `net_rental_income` 2/1 · `qualified_business_income` 2/1 · `refund` 2/1 ·
`rental_income` 2/1 · `total_tax` 2/1 · `officer_compensation` 1/1 · `deductions` 1/1 · `total_assets` 1/1 ·
`total_debt` 1/1 · `total_equity` 1/1 · `cash_on_hand` 1/1 · `total_liabilities` 1/1 · `wages` 1/1 ·
`ordinary_business_income` 1/1.

**`gross_margin` does not exist as an extracted field anywhere in production (0 rows).**

### 4.3 Provenance — which evidence is real (PRODUCTION-VERIFIED, decisive)

| Business (prefix) | Documents with extraction | `extraction_method` | Test/sample-named docs | Accepted rows |
| --- | --- | --- | --- | --- |
| `42f42075` | 7 | **`mock_extraction`** (5 analyses; 2 analyses carry no method and are still `queued`) | **yes** | **8** |
| `b3e5ceb3` | 1 | `ai_extraction` | no | 5 |
| `e507bf87` | 3 | `ai_extraction` | no | **0** |

**Finding E5 (PRODUCTION-VERIFIED).** The business holding the most reviewed evidence (`42f42075`) was extractied by
**`mock_extraction`**, its documents are test/sample-named, and its values are *exactly* the engine's
`MOCK_EXTRACTIONS` fixtures (`1,250,000` revenue; `625,000` cogs and gross profit; `187,500` net profit /
operating income / ordinary business income / taxable income; `245,000` reported EBITDA; `425,000` wages;
`150,000` owner compensation; `31,000` taxes). **Humans accepted mock-derived figures as recently as 2026-10-04.**
Promotion from this business would write fixture data into the Digital Twin as confirmed facts.

**Finding E6 (PRODUCTION-VERIFIED).** Two businesses read the **same** multi-year P&L: `b3e5ceb3` holds it
accepted (`annual_revenue` 2,963,916.96, `gross_profit` 2,775,409.10, `operating_income` 428,539.71), while
`e507bf87` holds the same values pending. Because `business_id` differs, the fingerprint differs, so **promotion
would durably replicate one document's figures into two separate businesses' Digital Twins.**

**Finding E7 (PRODUCTION-VERIFIED).** Those figures come from a report whose stated period is
**`"All Dates (2021-2025)"`** — a five-year aggregate — recorded with `period_source = 'unresolved'`, no
`period_type`, no `fiscal_year`, no bounds. Two documents also sit with **no `extraction_method` at all** while
still carrying 13 and 15 extracted fields, so their provenance is unestablished.

---

## 5. PRODUCTION PROMOTION DRY RUN — revenue, gross_profit (SIMULATED, NO WRITES)

Gate order applied (all must pass): **business scope → numeric value → review state (accepted/corrected) →
mapping (field name + document type) → business eligibility → period resolvable → basis determinable →
provenance trustworthy**.

### 5.1 `revenue` (canonical ← `annual_revenue` [P&L], `gross_receipts` [business return])
| Business | Field | Value | Period | Basis | Source | Review | Eligibility | Provenance | Promote? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `b3e5ceb3` | annual_revenue | 2,963,916.96 | **unresolved** ("All Dates (2021-2025)") | **unknown/absent** | P&L (`ai_extraction`) | accepted | **no verdict** | real | **NO** | Period cannot be stated from evidence; basis absent. |
| `e507bf87` | annual_revenue | 2,963,916.96 | unresolved ("All Dates") | absent | P&L (`ai_extraction`) | pending | no verdict | real | **NO** | Not reviewed + period + basis. |
| `42f42075` | gross_receipts | 1,250,000 | FY2025 (annual metadata) | absent | business return | **accepted** | no verdict | **mock** | **NO** | Provenance untrustworthy; basis absent. |
| `42f42075` | annual_revenue ×9 | 1,250,000 | mixed: FY2024 / FY2025 / none | absent | P&L | pending | no verdict | **mock** | **NO** | Not reviewed; mock; basis; period inconsistent. |
| `e507bf87` | gross_receipts | personal-return amounts (withheld) | FY2023 / FY2024 | absent | personal 1040 | pending | **AMBIGUOUS** | real | **NO** | Not business evidence; not reviewed. |

**Result: 0 of 16 revenue observations eligible.** Hypothetical fact observation that would be created: **none.**

### 5.2 `gross_profit` (canonical ← `gross_profit`, `gross_income` [P&L])
| Business | Value | Period | Basis | Review | Eligibility | Provenance | Promote? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `b3e5ceb3` | 2,775,409.10 | unresolved (5-year aggregate) | absent | accepted | no verdict | real | **NO** | Period + basis. |
| `e507bf87` | 2,775,409.10 | unresolved | absent | pending | no verdict | real (duplicate tenant) | **NO** | Period + basis + review. |
| `42f42075` | 625,000 | FY2024 / FY2025 / none | absent | 1 accepted, rest pending | no verdict | **mock** | **NO** | Provenance + basis + period inconsistency. |

**Result: 0 of 11 gross_profit observations eligible.** Hypothetical fact: **none.**

### 5.3 Why this is a *result*, not a failure to measure
Every refusal above is one of the audit's own defined gates, decided from production rows. The dry run is complete
and its outcome is determinate: **the Digital Twin would remain empty after promotion.**

---

## 6. NEGATIVE CONTROLS — concepts that must NOT be promoted (PRODUCTION-VERIFIED + CODE-VERIFIED)

| Concept | What production actually holds | Current mapping (CODE-VERIFIED) | Why promotion is unsafe | Decision required before activation |
| --- | --- | --- | --- | --- |
| `gross_margin` | **No extracted field exists (0 rows).** | Only a `system_derived` derive_fn, plus an assessment candidate literally named `net_profit_margin`. | It is a *derived* measure with **no** extraction source; promoting it would present a computed ratio as document evidence, and the only non-derived candidate is a **net** margin wearing a gross-margin key. | Either declare it permanently derived (never promoted from extraction) or fix the assessment candidate's semantics. |
| `net_income` | `net_profit` (P&L), `ordinary_business_income` and `taxable_income` (business return), and `taxable_income` from **personal** returns. | `net_income` accepts extracted `ordinary_business_income` **and** `taxable_income`. | Three different measures feed one key: book net profit, business taxable income, **and a personal tax measure**. Production proves the collision: one business holds accepted `ordinary_business_income` *and* accepted `taxable_income` at the same value; another holds personal `taxable_income` already verdict-ed **PERSONAL_ONLY**. | Choose which measures may map to `net_income`, and split the rest into their own keys. |
| `taxable_income` | 3 rows: 2 personal (PERSONAL_ONLY), 1 business return (accepted). | No standalone canonical key — it is a *candidate source* of `net_income`. | The registry treats a personal tax measure as net income while the document policy marks it **not business-relevant**. The two authorities contradict each other; whichever wins, the other silently loses. | Declare a business-taxable-income fact **separately**, or remove the personal candidate from `net_income`. |
| `reported_ebitda` | `reported_ebitda` (4 rows) **and** `operating_income` (5 rows) coexist, including both for the same periods in one business. | `reported_ebitda` accepts `['ebitda','operating_income']`. | EBITDA ≠ EBIT. Promoting both under one key yields either a silent substitution (EBIT presented as EBITDA) or a **false material conflict** between two genuinely different measures. | Give EBIT/operating income its own key, or remove it from `reported_ebitda`. |
| `operating_income` | 5 rows, one accepted (428,539.71) with an unresolved period. | Folds into `reported_ebitda` (see above). | Same collision; also currently unreviewed/aggregate in most rows. | Same as above. |
| `total_tax` | **2 rows, both from personal returns, both already verdict-ed PERSONAL_ONLY.** | Registry declares `total_tax` from `personal_tax_return` at authority **1** (highest); the phrase table aliases **"tax paid"** to it. | Direct contradiction with 6D.0c.3: the document policy says this is *not* business evidence, the registry says it is the highest-authority source. It is also a **liability**, never cash paid, while its alias invites a "cash paid" reading. | Re-scope `total_tax` to business filings only, and remove the "tax paid" alias or define a separate cash-paid concept. |
| `gross_receipts` → `revenue` | Business-return row (accepted, FY2025, mock provenance) **and** personal-1040 rows (AMBIGUOUS). | `revenue` accepts `gross_receipts` for `business_tax_return` only. | The doc-type gate is load-bearing: without it a Schedule-C personal receipt would become company revenue. It works today — this is the one mapping whose guard is verified by production. | Keep the doc-type gate; make it explicit in the promotion contract. |
| `owner_compensation` | Accepted `150,000` from a P&L **and** accepted `officer_compensation 150,000` from a business return, same business. | `owner_compensation` accepts both. | Same value represented by two source rows: not a conflict, but a duplicate-observation risk (two facts, two evidences, one economic fact). | Define precedence/dedup: officer compensation on a filed return outranks a P&L line for the same period. |

---

## 7. PERIOD + BASIS REALITY (PRODUCTION-VERIFIED)

### 7.1 Period metadata as actually stored (130 rows)
| `period_source` | `period_type` | Rows |
| --- | --- | --- |
| *(absent)* | `annual` | **45** |
| *(absent)* | *(absent)* | **35** |
| `model_reported` | `annual` | **26** |
| `unresolved` | *(absent)* | **24** |

- **80 of 130 rows (61.5%) carry no trustworthy period.** 45 rows have an `annual` type with *no* provenance for
  it (legacy, pre-6D.0); 35 have no period information at all.
- **24 rows are explicitly `unresolved`** — including the only accepted revenue/gross-profit observations outside
  the mock business.
- The only clean periods in production belong to **personal tax returns** (FY2023/FY2024, `model_reported`), i.e.
  to evidence that is correctly **excluded** from business intelligence.
- One report states **"All Dates (2021-2025)"** — a five-year aggregate. There is no `period_type` in the fact
  vocabulary for "five fiscal years summed"; the closed vocabulary offers `custom_period`, which would
  **misrepresent an aggregation artifact as a real period.**

### 7.2 Basis
**0 of 130 rows carry `accounting_basis`; 0 carry any basis-like metadata key.** Cash vs accrual is
**not determinable from production evidence for any row**.

The audit does **not** infer accrual for a P&L or tax basis for a return. Per the hard-stop rule, basis is recorded
here as **UNVERIFIED for 100% of production evidence.** `business_facts.accounting_basis` is `NOT NULL DEFAULT
'unknown'`, so promotion would write `unknown` for every row — which is *permitted* but collapses basis out of the
conflict grouping, making basis-based coexistence untestable in the pilot.

### 7.3 Period/basis conclusion
**The production evidence base cannot currently satisfy a period-and-basis-aware promotion gate.** This is the
second hard blocker, independent of provenance.

---

## 8. CONFLICT SIMULATION — revenue / gross_profit (SIMULATED)

| Grouping | Where it occurs in production | Result |
| --- | --- | --- |
| Only one observation for business+key+period | `42f42075` gross_receipts FY2025 (accepted) — the only period-stated revenue observation for that business | single candidate (still ineligible on provenance/basis) |
| Same-value duplicates | `42f42075` annual_revenue ×9 same value; `b3e5ceb3`/`e507bf87` duplicate 5-year P&L values | duplicates — **not** conflicts; they would create duplicate facts unless fingerprint/dedup collapses them |
| Minor differences | **none found** | — |
| Material differences | **none found** | — |
| **Comparison impossible** | `b3e5ceb3`, `e507bf87`, and most of `42f42075`: period unresolved or absent; basis absent everywhere | **the dominant case** |

**Finding C1 (SIMULATED).** **Zero conflict groups are achievable from current production data.** Every candidate
pair either differs by business (a tenant duplication, not a conflict), is a same-value duplicate, or lacks the
period identity that conflict grouping *requires*. The `business_fact_conflicts` view would return 0 rows even if
every eligible observation were promoted — because no two comparable observations exist.

**Finding C2 (PRODUCTION-VERIFIED).** No material conflict can be demonstrated or refuted on today's evidence.
Therefore **the conflict machinery cannot be certified from production data**, and any pilot claim about conflict
handling would be untested.

---

## 9. SOURCE AUTHORITY REALITY CHECK (PRODUCTION-VERIFIED vs CODE-VERIFIED)

Production source classes actually present: `document_extraction` from AI reading of real PDFs, and
`document_extraction` from **mock fixtures** (which has no defined authority rank at all).

Two authority systems must be reconciled, and neither currently knows about the other:

| Code registry (`SOURCE_AUTHORITY`, 11 ranks) | Live fact-table `source_type` vocabulary (13 values) |
| --- | --- |
| `verified_tax_return(1)`, `reviewed_financials(2)`, `advisor_entry_verified(3)`, `uploaded_financials(4)`, `extracted_field(5)`, `assessment_answer(6)`, `advisor_entry_unverified(7)`, `owner_estimate(8)`, `system_derived(9)`, `benchmark(10)`, `prior_published_version(11)` | `document_extraction`, `owner_reported`, `assessment`, `connected_accounting`, `connected_bank`, `connected_payroll`, `expert_verified`, `manual_entry`, `derived_calculation`, `system_migration`, `advisor_entry`, `benchmark`, `valuation_engine` |

**Mismatch M1 (CODE-VERIFIED).** The registry's `candidate_sources` are written in **CBIL read-time source types**
(`extracted_field`, `financial_normalization`, `dashboard_metric`, `profile_record`, …) which are **not** the
fact-table's `source_type` vocabulary. A promotion contract must bridge the two explicitly; today no mapping exists.

**Mismatch M2 (PRODUCTION-VERIFIED + CODE-VERIFIED).** The registry declares `total_tax` at **authority 1** from a
personal return. Production holds `total_tax` **only** from personal returns, all verdict-ed `PERSONAL_ONLY`. The
authority model's top-ranked tax source is a source the evidence policy forbids.

**Mismatch M3 (PRODUCTION-VERIFIED).** `source_authority_at_ingestion` is `NOT NULL` and the resolver falls back to
it. Production evidence provides no authority value, so the promoting service must compute it — and for
mock-derived rows there is **no correct value** in either hierarchy.

**Mismatch M4 (CODE-VERIFIED).** `isVerifiedSource()` in `sourceHierarchy.ts` treats `client_confirmation` as a
verified source at confidence ≥ 85. That conflates owner confirmation with verification, contradicting the
approved rule that **confirmation is not verification**. The fact layer's own CHECK constraints are stricter than
the read-time resolver — the two must be reconciled before the resolver is used to rank promoted facts.

**No redesign of the hierarchy is proposed in this phase.**

---

## 10. SHADOW RESOLVER SIMULATION — revenue, gross_profit (SIMULATED, DETERMINISTIC)

Deterministic gate order, applied per observation with **no model involvement**:

```
1 definition gate   (fact exists in registry)            → PASS
2 scope gate        (business_id = active business)      → PASS
3 review-state gate (accepted | corrected)               → blocks 115 pending rows
4 semantic gate     (field name + document type admitted)→ PASS for annual_revenue/gross_profit/gross_receipts
5 eligibility gate  (business-relevant verdict)          → NO VERDICT on 104 business rows (legacy fallback)
6 period gate       (period_type + bounds determinable)  → blocks every non-mock candidate
7 basis gate        (basis determinable)                 → blocks 130/130 rows
8 provenance gate   (not mock/test)                      → blocks the entire mock business
9 rank              (authority → verification → confidence → evidence → recency)
```

| Business | Concept | Eligible candidates | Rejected (reason) | Conflict | Hypothetical winner |
| --- | --- | --- | --- | --- | --- |
| `b3e5ceb3` | revenue | **0** | 1 accepted — *period unresolvable, basis absent* | none | **none — no resolved fact** |
| `b3e5ceb3` | gross_profit | **0** | 1 accepted — *period unresolvable, basis absent* | none | **none** |
| `42f42075` | revenue | **0** | 1 accepted — *provenance = mock_extraction, basis absent*; 9 pending | none | **none** |
| `42f42075` | gross_profit | **0** | 1 accepted — *provenance = mock*, rest pending | none | **none** |
| `e507bf87` | revenue | **0** | 1 pending; 2 AMBIGUOUS personal rows | none | **none** |
| `e507bf87` | gross_profit | **0** | 1 pending — *period + review* | none | **none** |

**Result (SIMULATED):** for both pilot concepts, the resolver returns **`resolution_status = 'missing'` for every
business**, with a recorded reason per candidate. No winner exists, so **no ranking, confidence, verification state
or staleness outcome can be produced**. Confidence/verification/staleness behaviour therefore remains
**UNVERIFIED — untestable on current data.**

---

## 11. BIS SHADOW IMPACT (SIMULATED over PRODUCTION-VERIFIED inputs)

Current BIS revenue/gross-profit resolution (CODE-VERIFIED order: reviewed semantic observation → `dashboard_metrics`
→ latest `business_metric_snapshots`) versus the hypothetical Digital Twin result:

| Business | Concept | Current BIS result | Source behind it | Hypothetical DT result | Classification |
| --- | --- | --- | --- | --- | --- |
| `b3e5ceb3` | revenue | **2,963,916.96**, period label `period unknown` | accepted extracted observation (`ai_extraction`) | none | **NO DIGITAL TWIN CANDIDATE** |
| `b3e5ceb3` | gross_profit | **2,775,409.10** | accepted extracted observation | none | **NO DIGITAL TWIN CANDIDATE** |
| `42f42075` | revenue | **1,250,000** | accepted `gross_receipts` (business return, mock extraction) | none | **NO DIGITAL TWIN CANDIDATE** (and the current value is fixture data) |
| `42f42075` | gross_profit | **625,000** | accepted `gross_profit` (mock extraction) | none | **NO DIGITAL TWIN CANDIDATE** (fixture data) |
| `e507bf87` | revenue | **null** (`dashboard_metrics` absent; no accepted observation) | — | none | **NO DIGITAL TWIN CANDIDATE** |
| `e507bf87` | gross_profit | **null** | — | none | **NO DIGITAL TWIN CANDIDATE** |

Production inputs: `dashboard_metrics` exists for **one** of the three businesses (`b3e5ceb3`) and holds
`annual_revenue = null` (`recast_ebitda = 467,000`); the latest `business_metric_snapshots` rows for all three
businesses hold **null** revenue/gross profit. So BIS's revenue/gross-profit answers today come **entirely** from
the semantic observation layer.

**Conclusions.**
1. **Shadow mode would be trivially safe today — because nothing can be promoted.** Every comparison is
   "no Digital Twin candidate". No MISMATCH is possible.
2. **But shadow mode would also validate nothing.** With zero comparable candidates there is no parity evidence to
   certify, so a "shadow phase" that runs today produces an empty dataset, not a safety signal.
3. **`SEMANTICALLY INCOMPARABLE` is nonetheless the real condition** for `b3e5ceb3`: BIS currently reports a
   five-year aggregate as "revenue" with a `period unknown` label. Any Digital Twin fact built from that same row
   would have to invent a period — so the correct shadow verdict there is *not* parity, it is
   **"current BIS value is itself period-unresolvable."**

**Finding B1 (PRODUCTION-VERIFIED, materially important).** BIS already surfaces two businesses' figures that are
**not fact-grade**: one 5-year aggregate labelled period-unknown, and one accepted set of **mock fixture** values.
This is pre-existing behaviour, unchanged by this audit, and it is the reason the pilot cannot simply mirror BIS.

---

## 12. GALILEO SHADOW IMPACT (SIMULATED over PRODUCTION-VERIFIED inputs)

Galileo's current path (CODE-VERIFIED): evidence-first pipeline → canonical observation lane → provisional evidence
lane → `unavailable`, with the 6D.0c rule **UNKNOWN ≠ UNVERIFIED** preserved.

| Representative question | Current evidence-first source | State | Hypothetical resolved DT fact | Comparison |
| --- | --- | --- | --- | --- |
| "What is my revenue?" (`b3e5ceb3`) | canonical observation, 2,963,916.96 | period unknown | none | **provisional-only / no comparable fact** — Galileo keeps current behaviour |
| "What is my revenue?" (`e507bf87`) | provisional (unreviewed P&L), 2,963,916.96 | pending review | none | **provisional-only** — unchanged |
| "What is my revenue?" (`42f42075`) | provisional (pending) + accepted observation | mixed | none | **no comparable fact** |
| "What is my gross profit?" (`b3e5ceb3`) | canonical observation, 2,775,409.10 | period unknown | none | **no comparable fact** |
| "What was my tax in 2023?" (`e507bf87`) | personal-return evidence, PERSONAL_ONLY | personal, excluded from business intelligence | none | **no comparable fact** |

**Result:** **0 same-value, 0 different-value, 0 different-period, 0 different-evidence-state comparisons are
possible.** Every case resolves to *provisional-only* or *no comparable fact*. Galileo's behaviour is therefore
unaffected by 6D.1 today, and — critically — **the resolved-fact lane cannot be certified as an improvement on
current answers, because there is nothing to compare.**

**Finding G1 (SIMULATED).** A Digital Twin that resolved faster than the evidence lane would, on today's data,
resolve to **nothing**, while Galileo's existing provisional lane answers with a real (if unreviewed) figure. Any
future precedence rule must therefore state explicitly that **an absent resolved fact falls through to provisional
evidence** — exactly as 6D.0c established — or the pilot would make Galileo *less* able to answer than it is today.

---

## 13. SECURITY (PRODUCTION-VERIFIED)

### 13.1 The conflict view is not tenant-isolated — **P0**
```
public.business_fact_conflicts | kind=v | owner=postgres | reloptions=null (no security_invoker)
authenticated SELECT = true | anon SELECT = true | relrowsecurity = false (views cannot carry RLS)
```
A PostgreSQL view executes with its **owner's** privileges unless declared `security_invoker`. This view is owned by
`postgres`, has no `security_invoker` option, and grants SELECT to `authenticated` **and** `anon`. The base tables'
RLS therefore **does not** protect it: once facts exist, an unauthenticated client could read conflict aggregates
spanning **every business**, including `candidate_fact_ids`, `candidate_source_types` and
`candidate_verification_states`.

Today the exposure is **zero rows** (both fact tables are empty) — this is a latent hole, discovered before any fact
was written. It is the single highest-priority item in this audit.

**PROPOSED remediations (all unimplemented; owner decision required):**
1. `ALTER VIEW public.business_fact_conflicts SET (security_invoker = true);` (PostgreSQL 15+), **and**
2. `REVOKE ALL ON public.business_fact_conflicts FROM anon;` (and consider revoking from `authenticated`, exposing
   conflicts only through the backend service), **and**
3. as belt-and-braces, add `WHERE can_access_business(business_id)` into the view definition itself.

### 13.2 Write posture
Both tables: `anon` **and** `authenticated` hold `INSERT`, `UPDATE`, `DELETE` **grants**; no write policy exists, so
RLS denies all client writes today. `relforcerowsecurity = false` (owner bypasses RLS — intended, since the backend
connects as service role). **The posture is correct but depends wholly on RLS staying policy-free.** PROPOSED
defence-in-depth: explicitly `REVOKE INSERT/UPDATE/DELETE` from `anon` and `authenticated` so a future stray policy
cannot open a write path.

### 13.3 Where promotion must run (PROPOSED)
- **Service-role backend only.** The backend functions already construct a service-role Supabase client from
  `SUPABASE_SERVICE_ROLE_KEY` (CODE-VERIFIED in `updateExtractedFieldReview`, `createSnapshotFromReviewedFields`,
  `askGalileo`, `supabaseUserData`). No client may ever write.
- **Human-triggered operations** (accept/correct-driven promotion) must resolve the **canonical actor** and prove
  business authorization before writing.
- **System ingestion** (post-extraction, retries, connected sources) must derive the business **from the source
  row** and re-validate it — never from a request payload.
- The fact tables' own constraints already force attestation identity and provenance; the service must supply them
  truthfully rather than synthesising a human profile for a system attestation.
- **No security change is proposed to be executed in this phase.**

### 13.4 Id-space verification (PRODUCTION-VERIFIED)
All 6 business ids appearing in `documents`/`extracted_fields` exist in **both** `public.business_entities` (9 rows)
and legacy `public.businesses` (9 rows) — the two tables currently mirror each other 1:1. `business_facts` FKs point
at **`business_entities`**, so promotion of current evidence will satisfy the FK. The dual id space remains a risk
for *other* sources (`business_metric_snapshots.business_id` is `TEXT`), but it is not a blocker for the document
bridge.

---

## 14. COMPLETION OF THIS REPORT

This file is the Phase 0 deliverable:
`VISION_PHASE_6D_1_DIGITAL_TWIN_ACTIVATION_AUDIT.md`.

Categories are kept separate throughout: §1–§4 and §7.1/§13 are **PRODUCTION-VERIFIED**; §5, §8, §10, §11, §12 are
**SIMULATED** over production rows; the semantic findings in §6 and §9 are **CODE-VERIFIED** and, where marked,
proven against production rows; §15 and every remediation above are **PROPOSED**.

**Hard-stop conditions encountered (each honoured by refusing to infer):**
- basis cannot be established → **recorded as UNVERIFIED for 130/130 rows; no basis was inferred**;
- period semantics cannot be established for the only reviewed business evidence → **no period was invented**;
- provenance of the most-reviewed business is mock/test → **excluded from promotion, not silently accepted**;
- business association evidence is absent → **recorded as absent, no association was assumed**;
- resolver result would have required guessing → **the resolver returned "missing", not a guess**.

---

## 15. RECOMMENDED 6D.1 IMPLEMENTATION SLICES (PROPOSED — NONE IMPLEMENTED)

The audit does **not** support the originally sketched 6D.1A→6D.1F sequence as written. The binding constraint is
**input quality**, so a remediation slice must precede any write slice.

**6D.1-0 — Containment (prerequisite, no facts involved)**
Fix the conflict-view exposure (§13.1) before any fact can exist. Smallest possible change; independently reviewable.

**6D.1A — Promotion contract + shadow evaluator (no writes)**
One shared module owning the nine gates in §10, a deterministic fingerprint (already specified), the CBIL-lexicon →
fact-`source_type` bridge (§9 M1), a **mock/test provenance gate**, and a period/basis resolvability gate that
returns *not eligible* rather than guessing. Runs read-only over production and emits an eligibility report.

**6D.1B — Evidence-quality remediation (data/behaviour, not promotion)**
Required before any write slice can have eligible input:
period provenance for the 45 legacy `annual` rows and the 24 `unresolved` rows; business-association evidence for
business documents (the 104 rows with no verdict); a basis capture decision (record `unknown` deliberately, or
capture basis at extraction). **Nothing about this slice is a fact write.**

**6D.1C — Pilot writes behind an explicit feature gate**
`revenue` and `gross_profit` **only**, per business, only candidates that pass all nine gates, feature-flagged off by
default, with the eligibility report (§6D.1A) attached to every activation.

**6D.1D — Resolver + conflict handling (shadow)**
The deterministic resolver contract, exercised against promoted facts. **Cannot be certified until at least two
comparable observations exist** for one business/period/basis — see §8 Finding C1.

**6D.1E — BIS shadow read**
Precedence allowlist **starts empty**; comparison only. Note §11 Finding B1: BIS's current values for the two real
businesses are period-unresolvable and fixture-data respectively, so parity must be measured against a *corrected*
baseline, not the current one.

**6D.1F — Galileo resolved-fact lane**
Only after BIS parity, and only with the explicit fall-through rule from §12 Finding G1 (absent resolved fact →
provisional evidence, never "unavailable").

**6D.1G — Certification.**

### Pilot recommendation
**Keep `revenue` and `gross_profit` as the *intended* pilot — but record that the pilot cannot activate on today's
production evidence.** Explicitly **NOT approved**: `gross_margin`, `net_income`, `taxable_income`,
`reported_ebitda`, `operating_income`, `total_tax`, `wages`, `cogs`, `operating_expenses`, and every other
non-pilot key. Each blocked concept carries a **named semantic decision** in §6 that must be made before it may
even be evaluated.

---

## 16. RISKS (consolidated)

| # | Risk | Severity | Status |
| --- | --- | --- | --- |
| R1 | Conflict view readable by `anon`/`authenticated` across tenants once facts exist | **Critical** | Latent (0 rows). Mitigation proposed, not applied. |
| R2 | Promotion would ingest `mock_extraction` fixture values as confirmed facts for one production business | **Critical** | Confirmed by provenance. Gate proposed. |
| R3 | Basis absent from 100% of evidence → basis-aware conflict/resolution untestable | **High** | Confirmed. |
| R4 | No business-relevance verdict on any business document (104 rows) → eligibility gate falls back to legacy rules | **High** | Confirmed. |
| R5 | One document's figures would be promoted into two businesses' Digital Twins | **High** | Confirmed by duplicated values. |
| R6 | 5-year aggregate ("All Dates (2021-2025)") at risk of being stored as an annual period | **High** | Confirmed. |
| R7 | Personal tax measures mapped to `net_income`; personal-return `total_tax` ranked authority 1 | **High** | Code + production. |
| R8 | `operating_income` folded into `reported_ebitda` (EBIT ≠ EBITDA) | **High** | Code + production. |
| R9 | `client_confirmation` counted as a verified source at confidence ≥ 85 by the read-time resolver | **Medium** | Code. Conflicts with the fact table's own CHECKs. |
| R10 | Registry source lexicon ≠ fact-table `source_type` vocabulary | **Medium** | Code. Bridge required. |
| R11 | 61.5% of evidence has no trustworthy period | **Medium** | Confirmed. |
| R12 | `anon`/`authenticated` retain INSERT/UPDATE/DELETE grants (denied only by the absence of policies) | **Low–Medium** | Confirmed. |
| R13 | Two documents carry 13–15 extracted fields with no `extraction_method` recorded | **Low** | Confirmed. |

---

## 17. FINAL STATUS

Live production verification **and** the dry-run simulation were both **actually completed**, read-only, with no
write of any kind. No fact is promotable today, and the reasons are recorded per candidate (§5, §10).
Three conditions must be repaired before any fact write is authorized: the conflict-view exposure (§13.1),
the basis gap (§7.2), and business-document eligibility coverage (§4.1) — plus the mock-provenance gate (§4.3).

**6D.1 DIGITAL TWIN ACTIVATION**
**PHASE 0 AUDIT COMPLETE — STOP FOR REVIEW**