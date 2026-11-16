# VISION — PHASE 6D.0a
## SEMANTIC OBSERVATION BRIDGE + BUSINESS-SCOPE GOLDEN PATH

**Status:** RELEASE CANDIDATE — implementation complete, verified offline, **not published**, **no intentional commit**.
**Scope discipline:** automatic classification NOT implemented · `business_facts` / `business_fact_evidence` NOT written · no bulk remediation · no security architecture change · no migration.
**Evidence class:** real shipped modules executed offline (esbuild-compiled, in-memory recording mock) + source-segment/static assertions + 13 mutation tests + read-only production verification.

---

## 1. HEAD re-audit (Phase 0)

Confirmed against HEAD before any edit (not taken on trust from the prior audit):

| Item | Finding |
|---|---|
| Duplicated field-name matchers | **Two**, byte-for-byte the same idea: `buildGalileoContext/entry.ts` (`getAcceptedField`, `['revenue','total_revenue','gross_revenue']` …) and `intelligenceContract/businessIntelligenceContract.ts` (its own private copy). Both used `.includes()` substring matching. |
| Orphaned mapping table | `createSnapshotFromReviewedFields` holds the *correct* tax-return mapping (`gross_receipts→annual_revenue`, `ordinary_business_income→net_profit`, `officer_compensation→owner_compensation`, `wages→payroll`) — invoked from one admin screen only, and it inserts `business_metric_snapshots.data`, **a column that does not exist** (verified: SQL 42703). |
| Metric destinations today | `profitability.{revenue,net_profit,reported_ebitda,recast_ebitda,profit_gap}` in the contract; `gross_profit` was **hardcoded `null`**; `owner_compensation` had **no destination at all**. |
| `dashboard_metrics` schema | `annual_revenue, net_profit, current_ebitda, recast_ebitda, current_business_value, …, ciq_score`, gap JSONB. **No `revenue` column, no `ebitda`, no `data_confidence_score`** — the contract's `dashboard_metrics?.revenue` read is a phantom (silently null). |
| `business_metric_snapshots` schema | Has `annual_revenue, gross_profit, net_profit, ebitda, owner_compensation, payroll, total_expenses, period_label, fiscal_year, snapshot_type, data_source, source_document_id, is_latest, metadata` — and **no `data`**. |
| `extracted_fields` schema | 31 columns incl. `tax_year`, `source_form`, `source_page`, `source_line`, `confidence_score` (text), `metadata` jsonb. **No period columns** — the 6D.0 period block lives in `metadata`. |
| BIS read path | `buildBusinessIntelligenceContract` → consumed by Dashboard, Galileo, Executive Brief, Living Intelligence. `metricRegistry` already declares revenue/net_profit/reported_ebitda's certified owner as *"Canonical Fact resolver (document-derived) … canonical_facts / extracted_fields (accepted)"*. |
| `buildGalileoContext` read path | Fetched `extracted_fields` itself (14-entry parallel batch) and mapped with its own matcher. |
| Business selection path | `authenticateActor` → `resolveActingProfile` → `requireBusinessContext(sb, profile, requestedBusinessId, 'buildGalileoContext')`; all reads business-scoped **after** that. |
| Review regeneration path | `updateExtractedFieldReview` writes only the observation row, then fires `regenerateCiqMetrics` (fire-and-forget). `regenerateCiqMetrics` reads `business_assessments` / `assessment_calculations` and **never reads `extracted_fields`**. |

**Materially different from the audit? No.** Every audit finding reproduced, plus two new ones recorded in §28.

## 2. Duplicate matcher inventory (before → after)

| Location | Before | After |
|---|---|---|
| `base44/functions/buildGalileoContext/entry.ts` | private `getAcceptedField` + `docRevenue/docProfit/docEbitda` | **removed.** Reads `contract.semantic_observations`; issues **no** `extracted_fields` query |
| `base44/shared/intelligenceContract/businessIntelligenceContract.ts` | private `getAcceptedField` | **removed.** Uses `buildObservationLayer()` from the bridge |
| `base44/functions/createSnapshotFromReviewedFields/entry.ts` | hand-written per-doc-type mapping table (orphaned, schema-broken) | untouched this slice — see §28 debt; 6D.1 must retire it, not extend it |

**One semantic source remains**: `base44/shared/canonicalFact/registry.ts`. The static check `S5` fails if any alias literal is re-introduced as a mapping key in the bridge, the contract or Galileo (mutation M10 proves it is caught).

## 3. The canonical semantic registry (Phase 1)

`base44/shared/documentObservation/semantics.ts` (new, pure module, 210 lines) **declares no aliases of its own**. Its index is *derived* from `FACT_REGISTRY`: for every fact, every `candidate_sources` entry with `source_type === 'extracted_field'`, every `field_names[]` becomes a mapping, carrying that source's `source_authority` and `doc_types` constraint.

Semantics are therefore *definitional*, not string-alias:
- a mapping is admitted **only** if the canonical definition names the field **and** , where the definition scopes document types, the observation's `source_document_type` agrees;
- ambiguities the mission flagged are resolved by the registry, never by this module;
- `mappedFactKeys()` exposes exactly which canonical meanings are reachable today.

## 4. FACT_REGISTRY compatibility (Phase 2)

| Observation semantic key | = future `business_fact.fact_key`? |
|---|---|
| `revenue`, `gross_profit`, `gross_margin`(derived), `net_income`, `reported_ebitda`, `normalized_ebitda`(derived), `owner_compensation`, `cash`, `debt`, `customer_concentration` | **yes** — pilot facts, identical keys |
| `total_assets`, `total_liabilities`, `total_equity`, `total_payroll`, `employee_count`, `agi`, … | **yes** — registered (non-pilot) facts |
| `total_expenses`, `cogs`, `interest_expense`, `taxes`, `depreciation`, `amortization`, `taxable_income` | **no canonical meaning exists** → preserved as **unmapped observations** (§5), never invented |

Result: 6D.0a publishes into the vocabulary 6D.1 will write, so the promotion gate inherits the semantics rather than replacing them.

## 5. Field mapping matrix (as implemented, real registry)

| Source field | Document type | → canonical key | Basis |
|---|---|---|---|
| `gross_receipts` | `business_tax_return` | **`revenue`** | registry candidate, authority `verified_tax_return` |
| `annual_revenue`, `total_revenue`, `gross_revenue` | `profit_and_loss` | `revenue` | registry candidate |
| `gross_profit`, `gross_income` | `profit_and_loss` | `gross_profit` | registry candidate |
| `net_profit`, `net_income`, `profit` | `profit_and_loss` | `net_income` | registry candidate |
| `ordinary_business_income`, `taxable_income` | `business_tax_return` | `net_income` | **registry-declared candidates** (see §12) |
| `owner_compensation`, `owner_payroll` | `profit_and_loss`, `payroll_report` | `owner_compensation` | registry candidate |
| `officer_compensation` | `business_tax_return` | `owner_compensation` | registry candidate (see §11) |
| `ebitda`, `operating_income` | any | `reported_ebitda` | registry candidate |
| `cash_on_hand`, `cash` | `balance_sheet` | `cash` | registry candidate |
| `total_debt`, `loan_balance` | `balance_sheet`, `debt_schedule` | `debt` | registry candidate |
| `total_payroll`, `employee_count` | `payroll_report` | `total_payroll`, `employee_count` | registry candidates |
| **`revenue` (bare)**, **`reported_ebitda` (literal)**, `total_expenses`, `cogs`, `interest_expense`, `taxes`, `depreciation`, `amortization` | any | **none — refused** | not declared by the registry. Documented gaps (§28), not aliased on a name match |
| anything unknown | — | **none** | refused (`mystery_metric` asserted in P8) |

Document-type discipline is enforced: `gross_receipts` on a `profit_and_loss` is **refused** (P3); `annual_revenue` from a tax return is refused.

## 6. Review eligibility contract (Phase 7)

| `review_status` | Eligible? | Lifecycle (6C vocabulary) | Reason |
|---|---|---|---|
| `accepted` | **yes** | `confirmed` | the owner accepted the extracted value |
| `corrected` | **yes** (corrected value wins over an accepted twin) | `confirmed` | the owner corrected it |
| `pending_review` | no | `proposed` | not reviewed |
| `needs_clarification` | no | `proposed` | awaiting clarification |
| `rejected` | no | `rejected` | rejected |
| unknown | no | `proposed` | — |

`verification_status` is **always `'unverified'`** with `verification_method: null`. Accepted ≠ verified is asserted (G17) and mutation M7 (forcing `'verified'`) is caught. Source-missing observations survive with `provenance.source_available === false` (G19).

## 7. Period contract (Phase 3)

Consumes 6D.0's recorded block **verbatim** (`periodMetadata` field names). Nothing is manufactured — no current year, no TTM, no calendar substitution:

| Situation | `period_origin` | Bounds | Label |
|---|---|---|---|
| `metadata.period_source = model_reported` (document stated it) | `parsed` | as recorded | `FY2025` / `Q3 2026` / `as of …` |
| `metadata.period_source = user_declared_year` | `declared` | derived calendar bounds **+ note** "derived from the year declared at upload, not read from the document" | `FY2024` |
| bounds recorded, no source label (legacy rows) | `inferred` | as recorded | `Q3 2026` etc. |
| `tax_year` only | `declared` | derived + note | `FY2024` |
| nothing | `unknown` | **null** | `period unknown` |

Assertions: P12 (no period ⇒ `unknown`, null bounds, **and the current year never appears**), P13 (declared label + note), P14 (inferred Q3 2026), G6 (parsed FY2025 bounds intact). Mutation M9 (re-introducing a hardcoded calendar year) is caught. A **period request that cannot be satisfied returns `period_mismatch` with the periods actually held** (G18) — this is how "current/TTM" is answered honestly instead of reusing a tax year.

## 8. Business-scope contract (Phase 4)

The bridge is business-scoped by construction: an observation must carry a `business_id`, it must equal the resolving business, and a row without scope is refused (scope is **never** inferred from UI state, primary business, filename, folder or conversation). Foreign rows are counted and dropped.

Proof at two layers: the harness's Business B read result **deliberately contains Business A's own row** (a leaked query), and Business B still resolves **no** revenue (G12/G13); the direct mapper assertions cover a foreign row (P10) and a scoped-less row (P11). Mutations M3 (scope guard) and M8 (foreign guard) are both caught.

## 9. Active-business behaviour (Phase 5)

Resolution order is unchanged and untouched: canonical actor → `resolveActingProfile` → `requireBusinessContext` → business-scoped reads. Nothing in 6D.0a reads a business from anywhere else, so **switching A → B cannot retain A's intelligence**: the contract is rebuilt per requested business and the bridge filters to that business (G13 asserts Business B's serialized contract contains neither A's value nor its formatted form).

## 10. Current read-model decision (Phase 8)

**Decision: the existing certified read model — the Shared Intelligence Contract — is the destination. No new truth store, no persistence, no migration.**

- `dashboard_metrics` **cannot** represent revenue correctly (no `revenue` column) → **not fabricated, not touched**.
- `business_metric_snapshots` *can* represent these values — and remains the contract's last-resort legacy fallback; **nothing is written to it** by this slice.
- The bridge is an **in-code normalized contract**: `extracted_fields (accepted/corrected, business-scoped) → mapObservations → by_key + availability → contract.profitability + contract.semantic_observations → Galileo`. It is isolated behind one resolver contract (`resolveSemanticObservation`, `buildObservationLayer`) that **6D.1 can replace internally without changing any consumer**.

`profitability` gains, beside each value: `*_period_label`, `*_period_type`, `*_provenance`, `*_lifecycle_state`; `gross_profit` and `owner_compensation` gain destinations; the contract also exposes `semantic_observations`, `unmapped_observations` and `observation_period_availability`.

## 11. `gross_receipts` golden path (Phase 10)

Executed end-to-end against the real modules: a `business_tax_return` observation `gross_receipts = $1,250,000`, `accepted`, FY2025 →
`canonical_key = revenue` → contract `profitability.revenue = 1250000`, `revenue_period_label = 'FY2025'`, `revenue_lifecycle_state = 'confirmed'`, `revenue_provenance = "business tax return · FY2025"`, source document id + field + page preserved, and Business B resolves none of it.

Galileo's context therefore lets the model answer *"your reviewed 2025 S-Corp return reports $1.25M of gross receipts"* (period + source field + document type all present), and a current/TTM question is answered by period availability, not by relabelling.

## 12. `owner_compensation` semantics (Phase 9)

- `officer_compensation` (tax return) and `owner_compensation`/`owner_payroll` (P&L, payroll report) → **`owner_compensation`** — the registry declares all three as candidates for that one fact, so they are *canonically* the same concept. The observation keeps `provenance.source_field` so Galileo says *which* one it used.
- The contract now has a destination: `profitability.owner_compensation` (+ period + provenance), and `current_metrics.owner_compensation` in Galileo's context.
- Distinctions the registry does **not** authorize (salary vs. distributions vs. reasonable compensation vs. total owner economic benefit) are **not** asserted: the observation is exposed as *"recorded as owner compensation from your reviewed …"*, and any further distinction is asked for, not assumed.

## 13. `gross_profit` behaviour (Phase 11)

The hardcoded `null` is removed **only after** proving all four: definition (registry fact `gross_profit` with candidates `gross_profit`/`gross_income`), business (observation is business-scoped), review state (accepted/corrected), period (carried, and when the source recorded none, explicitly `period unknown` — never implied precision). Assertion A8/P4 covers it; a missing period yields a value labelled *"period unknown"*, not a silent one.

## 14. `ordinary_business_income` decision (Phase 12)

**Mapped to `net_income` — because the canonical definition declares it, and for no other reason.** `FACT_REGISTRY.net_income.candidate_sources` names `ordinary_business_income` and `taxable_income` (authority `verified_tax_return`), exactly as it names `net_profit` for P&L. The bridge cannot make that choice on its own: the harness asserts the registry declaration (P6), and mutation M2 **removes the registry declaration** to prove the mapping then disappears. The observation retains `source_field`, so Galileo reports *"ordinary business income"*, never a bare "net profit". `taxable_income` is unmapped **in practice** only where it is not an accepted observation; the capability is registry-driven, not hardcoded.

## 15. Galileo integration (Phase 13)

- Galileo's private matcher and its own `extracted_fields` query are **gone** (`S1`, `S2`); it reads `contract.semantic_observations` (`S3`).
- `current_metrics.{revenue,net_profit,ebitda,owner_compensation,gross_profit}` now carry `period`, `period_type`, `provenance`, `lifecycle`.
- `accepted_financial_fields` is built from the **semantic** observations (canonical key, period origin, provenance, review + lifecycle + verification state).
- `missing_data` is precise: when no current value exists but reviewed observations do, it states the periods held (`"…reviewed observations exist for: annual"`) instead of the generic *"provide your revenue data"*.
- The canonical-fact overlay (pilot facts) still takes precedence unchanged — the bridge sits *below* it.
- No ad-hoc fallback chain was added; mutation M11 (re-introducing a direct `extracted_fields` query in Galileo) is caught.

## 16. Provenance behaviour (Phase 14)

Each observation carries: source document id, document type, source field, source form, source page/line, period origin + raw + bounds, review state, lifecycle state, confidence (+ basis), and `source_available` (tri-state: recorded available / recorded missing / **not recorded — never claimed**). Internal ids stay in the context payload for reasoning; the user-facing phrase is human (`humanSourceLabel()`), e.g. *"your reviewed business tax return covering FY2025"*.

## 17. Knowledge Gap behaviour (Phase 16)

The generic question is suppressed and the specific one is asked: with an FY2025 observation held, `observation_period_availability.revenue = ['annual']` reaches Galileo, so the honest answer is *"I have $1.25M of gross receipts from your reviewed 2025 tax return; for this analysis I need current TTM revenue"* — G11 asserts the generic "no verified revenue" risk is gone; G18 asserts the period mismatch is a precise, structured result.

---

## 18. G1–G21 results (golden path)

| # | Assertion | Result |
|---|---|---|
| G1 | document belongs to Business A | PASS |
| G2 | document type = `business_tax_return` | PASS |
| G3 | `gross_receipts` = 1,250,000 | PASS |
| G4 | review = accepted | PASS |
| G5 | canonical key resolves to `revenue` | PASS |
| G6 | period preserved (parsed FY2025, bounds intact) | PASS |
| G7 | `business_id` preserved | PASS |
| G8 | available through the approved read path (contract) | PASS |
| G9 | Business A contract carries revenue + period label + confirmed | PASS |
| G10 | attribution: document id, source field, page, type | PASS |
| G11 | generic revenue knowledge gap suppressed | PASS |
| G12 | Business B does **not** contain Business A revenue (with a leaked row present) | PASS |
| G13 | switching A → B removes A intelligence | PASS |
| G14 | rejected observation unavailable | PASS |
| G15 | pending observation unavailable | PASS |
| G16 | corrected observation uses the corrected value | PASS |
| G17 | accepted ≠ verified (confirmed / unverified / no method) | PASS |
| G18 | period mismatch returns a precise result (+ periods held) | PASS |
| G19 | source-missing provenance honest; value survives | PASS |
| G20 | zero `business_facts` writes | PASS |
| G21 | zero `business_fact_evidence` writes | PASS |

## 19. Mapping-contract results (Phase 18)

P1 (`annual_revenue`/`total_revenue`/`gross_revenue` → revenue) · **P1b** (bare `revenue` refused — registry gap, never invented) · P2 (`gross_receipts` → revenue) · P3 (wrong document type refused) · P4 (`gross_profit`/`gross_income` → gross_profit) · P5 (`owner_compensation` + `officer_compensation` → owner_compensation) · P6 (`ordinary_business_income` → net_income **only** with the registry declaration) · P7 (`ebitda`/`operating_income` → reported_ebitda, `normalized_ebitda` never aliased, literal `reported_ebitda` refused) · P8 (unknown → no fabricated mapping) · P9 (exactly one canonical meaning for `gross_receipts`) · P10/P11 (foreign / unscoped dropped) · P12–P14 (period honesty) · P15 (version + reachable keys) — **all PASS**.

## 20. M1–M13 mutation results (Phase 19)

| Mutation | Caught by |
|---|---|
| M1 `gross_receipts` mapping removed | G5 |
| M2 `ordinary_business_income → net_income` without registry authorization | P6 |
| M3 business-scope guard removed | P11 |
| M4 period bounds dropped from the observation | G6 |
| M5 pending becomes eligible | G15 |
| M6 rejected becomes eligible | G14 |
| M7 accepted becomes verified | G17 |
| M8 Business A observation leaks into Business B | G12 + P10 |
| M9 hardcoded calendar year reintroduced | P12 |
| M10 duplicate alias table reintroduced | S5 |
| M11 Galileo directly queries `extracted_fields` again | S2 |
| M12 `business_facts` write introduced | S6 |
| M13 `business_fact_evidence` write introduced | S6 |

All 13 **caught** (a mutation that is *not* detected fails the harness by construction).

## 21. Security regressions (Phase 20)

| Harness | Result |
|---|---|
| `adminCanonicalActor` | **PASS** (125) |
| `documentSignedUrlAuthorization` | **PASS** (103) |
| `documentAccessAuthorization` | **PASS** (45) |
| `adminRouteAccess` / `adminWorkspaceAccess` | **PASS** (41 / 66) |
| `galileoContextActorBinding` | **PASS** (52) |
| `relationshipRevocationAccess` | **PASS** (78) |
| `adminDocumentViewer` | **PASS** (56) |
| `businessContextContract` | **PRE-EXISTING FAILURE** — proven red at the published commit `0cab0df` in a temporary worktree, unrelated (`ownershipConcentrationEngine` business-scope import). Not caused, not touched, reported as baseline debt |

No authorization assertion, matrix, mutation check or immutable-file proof was altered. The only edits to those harnesses are **allowlist lines** naming this slice's reviewed surface (commented as such in each file), the pattern the earlier slices established. Security architecture itself — canonical actor, S3.1, P5, bucket authority, RLS, relationship authorization, suspended-user denial — is **unmodified**; the bridge is a pure content module with no `sb`, no `Deno`, no writes (S7).

## 22. Classification / extraction regressions (Phase 21)

| Harness | Result |
|---|---|
| `documentUploadClassification` | **PASS** (42) — supported vs unsupported semantics, "Not sure" truthfulness, historical resolver, W-2/`other` unsupported behaviour and the Digital-Twin freeze all intact |
| `extractionIntegrity` | **PASS** (70) — extraction outcomes, source-missing behaviour, review preservation, viewer state, zero Digital-Twin writes |

## 23. Build (Phase 22)

`npm run build` (`vite build`) → **exit 0**.

## 24. Fact-freeze proof (Phase 7/20)

Runtime: the recording mock captured **zero** writes of any kind from the bridge, the contract or the mapper in every executed scenario (all reads). Static: no `business_facts` / `business_fact_evidence` write appears in the bridge, the contract or `buildGalileoContext` (S6, G20, G21, M12, M13). Production read-only verification: `business_facts = 0`, `business_fact_evidence = 0`, `business_fact_conflicts = 0` — unchanged.

## 25. Production untouched proof (Phase 23)

| Measure | Value |
|---|---|
| `extracted_fields` review distribution | `pending_review 71 · accepted 6 · corrected 1 · rejected 1 · needs_clarification 1` — **identical to the audit baseline** |
| Latest review timestamp | `2026-10-04 18:00:47Z` (unchanged) |
| `documents` total | 71 (unchanged) |
| `business_facts` / `business_fact_evidence` / `business_fact_conflicts` | 0 / 0 / 0 |

Rows created/updated in the window (`4` documents, `4` analyses, `2` snapshots, `2` field updates) are **the owner's own smoke-test activity**, independently characterised: the documents are `user_upload` at 17:31–17:59 (`2024_TaxReturn (3) (1).pdf`, `Garrick W-2.pdf`, type `other`), the two field updates are the `accepted` reviews of `wages` and `ordinary_business_income` at 18:00:33/18:00:47, and the two snapshots are the pre-existing `regenerateCiqMetrics` reaction to those accepts. **This slice wrote nothing to production**; its only database access was the read-only query endpoint.

## 26. Files changed

Product (3): `base44/shared/documentObservation/semantics.ts` (**new** — the bridge) · `base44/shared/intelligenceContract/businessIntelligenceContract.ts` (reads the bridge; period/provenance/owner-compensation/gross-profit destinations; semantic sections) · `base44/functions/buildGalileoContext/entry.ts` (consumer wiring; private matcher and field query removed; precise missing-data phrasing; `pending_review_count` defect fixed).
Test/verification (8): `scripts/semanticObservationBridge.test.cjs` (**new** — 57 checks: G1–G21, P1–P15, S1–S7, M1–M13) plus allowlist-only rebases in `adminCanonicalActor`, `adminDocumentViewer`, `documentSignedUrlAuthorization`, `documentUploadClassification`, `extractionIntegrity`, `galileoContextActorBinding`, `relationshipRevocationAccess`.
Reports (2): `VISION_DOCUMENT_UNDERSTANDING_AND_GALILEO_INTELLIGENCE_AUDIT.md` (prior audit, repository root) and `src/VISION_PHASE_6D_0A_SEMANTIC_OBSERVATION_BRIDGE.md` (this report).
**No migration, no SQL, no RLS, no security file, no entity schema, no frontend change.**

## 27. Git state

`git status` clean; repository HEAD is the platform's own checkpoint (`…"File changes"`, authored by `base44-builder[bot]`). **No commit was created by this slice** — the platform takes automatic checkpoint commits as it syncs files (a behaviour the repository's own harnesses document), which is why the work appears in HEAD rather than as pending changes. Nothing was published. Changed-file set since the published hotfix `0cab0df` = the 12 files in §26.

## 28. Remaining debt (disclosed, not fixed here)

1. **Registry gaps** — a bare `revenue` extracted field and the engine's literal `reported_ebitda` are not declared candidates; the bridge refuses rather than aliases. One-line registry expansions, 6D.1.
2. **`createSnapshotFromReviewedFields`** — still orphaned and still schema-incompatible (`business_metric_snapshots.data` absent). 6D.1 must retire it in favour of the promotion gate.
3. **`dashboard_metrics` read-key mismatch** — `profitability.revenue`'s legacy fallback reads a column that does not exist; left untouched (out of scope, no fabrication), now preceded by the semantic layer.
4. **Observation-layer duplicates** — the same field is stored up to 3× per document by repeated extraction (71 rows pending). Not remediated (Phase 23); the mapper collapses exact duplicates at read time.
5. **71 unreviewed observations** — the review queue backlog the audit identified; unchanged by design.
6. **`ClassificationMemory`** remains orphaned; classification is 6D.0b.
7. **Pre-existing batteries** — `businessContextContract` red at the baseline commit (unrelated).

## 29. Exact handoff to 6D.0b (automatic document understanding)

Consume — do not re-derive — these: (a) the canonical **document type vocabulary** the bridge already keys on (`EXTRACTION_SCHEMAS` + `documentTypes`); (b) this slice's `semantic_observations` as the reviewed-data contract the classification engine must keep satisfying; (c) the period contract in §7 (a classifier that detects a period must emit the same recorded block the bridge consumes, including `period_source`); (d) `provenance.source_document_type` discipline — a mapping is admitted only for the document types the canonical definition declares. 6D.0b owns: content-based classification, `DocumentClassification` records, auto-filing, reader routing, correction provenance, and the honest reader-gap language. It must not change this bridge's semantics or write facts.

## 30. Exact handoff to 6D.1 (fact promotion gate)

The promotion gate writes `business_facts` + `business_fact_evidence` **from this bridge's observations**, using: `canonical_key` as `fact_key`; `value`/`value_type`/`unit`; `period.*` → `period_type/period_label/period_start/period_end/as_of_date/fiscal_year`; `provenance.*` → `source_type/source_table/source_id/source_reference`; `lifecycle_state` → `verification_status` semantics (**`confirmed` stays below `verified`**; Phase 6C requirements govern any promotion to `verified`); `confidence` + `confidence_basis`; and `source_available` for evidence honesty. It must: resolve conflicts through the existing `canonicalFact` resolver (never overwrite), keep `business_fact_conflicts` as the conflict surface, retire `createSnapshotFromReviewedFields`, close the registry gaps in §28, and keep the mapper's refusals (unknown field, wrong document type, ineligible review state, foreign business) as hard gates. Consumers must not change: the contract stays the single read path, so Galileo needs no edit when the bridge's internals are replaced.

---

**Nothing was published. No intentional commit. No production row written by this slice.**
**STOP FOR REVIEW.**