# PHASE 6C — DIGITAL TWIN FACTS + EVIDENCE FOUNDATION
## AUDIT + ARCHITECTURE (REVIEW GATE — NOTHING EXECUTED)

**Status: DESIGN ONLY. Migration prepared, NOT executed. No backfill. No BIS precedence change. No publish. No merge.**
Deliverables: this document + `src/supabase/migrations/phase_6c_digital_twin_facts.sql` (**NOT EXECUTED**).
No UI, no service, no consumer was touched.

---

## 0. THE HEADLINE FINDING

**The canonical fact CONCEPT already exists in this codebase — and only as code.**

`base44/shared/canonicalFact/` (Phase 14.2A, ~2,400 lines) already defines:

| Already exists | Where |
| --- | --- |
| 11-level source authority hierarchy | `canonicalFact/types.ts` → `SOURCE_AUTHORITY` |
| The declarative fact dictionary | `canonicalFact/registry.ts` → `FACT_REGISTRY` — **47 declared fact keys**, of which the first 10 are pilot (the only ones served today) |
| Configurable source preference + applicability (period/effective date, published-snapshot immutability, same-level conflict) | `canonicalFact/sourceHierarchy.ts` |
| The normalized Fact contract (value, source, period, confidence, verification, conflict, evidence[], lineage[], alternatives[]) | `canonicalFact/types.ts` → `CanonicalFact` |
| Conflict object + resolution statuses + shadow-discrepancy vocabulary | `canonicalFact/types.ts` |
| Resolver + candidate loading from the existing tables | `canonicalFact/resolver.ts`, `contextLoader.ts`, `resolverHelpers.ts` |
| A read-only service exposing it (incl. `shadowCompare`) | `base44/functions/canonicalFactService/entry.ts` |
| Explicit statement that facts are **NOT persisted** | `canonicalFact/types.ts` header |

And `src/supabase/migrations/phase_6b1_safe_foundation.sql` states the gate in its own words:

> `-- NO Digital Twin tables are created by this migration.`
> `-- NO business_facts table. NO ingestion pipeline. Phase 6C comes later.`

**Therefore Phase 6C is not "invent a fact model".** It is: *give the existing certified fact model durable, verifiable, provenance-bearing storage underneath BIS* — reusing `SOURCE_AUTHORITY`, the registry, the period model and the conflict vocabulary, so Vision never ends up with two competing definitions of "revenue".

**And no fact table exists anywhere.** Thirteen candidate names were probed directly against production (`business_facts`, `facts`, `canonical_facts`, `business_metrics`, `business_metric_facts`, `observations`, `business_observations`, `evidence`, `fact_evidence`, `business_fact_evidence`, `source_values`, `fact_definitions`, `metric_definitions`): **all HTTP 404.** There is no duplicate concept to collide with and nothing to migrate into.

---

## 1. CURRENT DATA ARCHITECTURE (live, read-only probes)

Column lists below are from live `select * limit 1` probes (service role, read-only), not from migrations.

### 1.1 Sources relevant to facts

| Table | Exists | Key shape (abridged) | Fact-relevant notes |
| --- | --- | --- | --- |
| `extracted_fields` | ✅ | `document_id, business_id, entity_id, tax_year, field_name, field_value, numeric_value, normalized_value, accepted_value, accepted_normalized_value, field_label, field_type, field_category, source_document, source_form, source_line, source_page, source_document_type, confidence_score, review_status, reviewed_by, reviewed_at, notes, metadata, mapped_assessment_area, used_in_assessment, document_analysis_id` | Already an **observation layer with page/form/line provenance**. No `period_start/period_end` — only `tax_year`. |
| `documents` | ✅ | `business_id, document_type, year, tax_year, status, name/file_name, file_url, storage_bucket, storage_path, confidence_score, extracted_data, upload_source, document_scope, bucket, file_scope, uploaded_by` | Evidence anchor. Business-scoped. |
| `document_analysis` | ✅ | `document_id, business_id, document_type, confidence_score, extracted_data, summary, ai_findings, status/analysis_status, missing_fields` | AI analysis output — intelligence-ish, not a fact source on its own. |
| `business_metric_snapshots` | ✅ | `business_id(TEXT), profile_id, snapshot_date, snapshot_type, period_label, fiscal_year, fiscal_quarter, fiscal_month, annual_revenue, monthly_revenue, gross_profit, net_profit, ebitda, owner_compensation, payroll, total_expenses, total_debt, total_assets, cash_on_hand, gross_margin, net_margin, ebitda_margin, current/optimized_business_value, value_gap, valuation_low/high, *_score, *_opportunity` | **The nearest existing analogue to fact history** — but it is a *period-batch snapshot* (one row = a whole period), with no per-fact provenance, verification state, accounting basis or supersession. Treat as historical state, not as the fact layer. |
| `dashboard_metrics` | ✅ | `business_id, profile_id, annual_revenue, net_profit, current_ebitda, recast_ebitda, current_business_value, potential_business_value, profit_gap, tax_gap, value_gap, operations_score, freedom_score, ciq_score, last_calculated_at, latest_snapshot_id, industry, profit_gap_details, value_gap_details, tax_gap_details, operations_gap_details, freedom_gap_details, cash_flow_gap_details, protections_gap_details, wealth_gap_details, recast_ebitda_gap_details` | A **projection / read model** with JSONB gap objects. Never a truth source (Step 25). |
| `business_assessments` | ✅ | `business_id, profile_id, assessment_session_id, assessment_type, status, score, risk_level, opportunity_level, estimated_opportunity_value, summary, owner_friendly_explanation, advisor_summary, missing_data, key_findings, recommendations, next_best_actions, data_confidence_score, completed_at, reviewed_by, reviewed_at` | Assessment *result + interpretation*. Only a few fields are fact-shaped. |
| `assessment_sessions` | ✅ | `profile_id, assessment_type, status, started_at, completed_at, business_id` | Container. |
| `assessment_answers` | ✅ | `session_id, profile_id, assessment_type, question_key, question_label, answer_value, answer_source, extracted_field_id, business_id` | **Semantically explicit inputs** (`question_key`) — the assessment fact path. |
| `assessment_calculations` | ✅ | `session_id, profile_id, assessment_type, calculation_name, input_json, result_json, confidence_score, business_id` | Derived calculations — the certified BIS owner for assessment results. |
| `gap_analyses` | ✅ | `gap_type, score, opportunity_value, severity, summary, findings, recommendations, business_id` | Intelligence (gap interpretation). Never a fact. |
| `profile_financials` | ✅ | **Mixed**: `agi, taxable_income, total_tax_liability, effective_tax_rate, annual_personal_expenses, investable_assets, total_personal_debt, passive_income, desired_lifestyle_adjustment, safe_withdrawal_rate` **+** `annual_revenue, gross_profit, net_income, current_profit_margin, estimated_ebitda, normalized_ebitda, total_add_backs, estimated_enterprise_value, potential_enterprise_value, profit_gap, value_gap, tax_gap_estimate, primary_tax_year` | Household **and** business in one row. Needs explicit classification (Step 27). No period beyond `primary_tax_year`. |
| `roadmap_items` | ✅ | `title, category, priority, impact_score, status, due_date, estimated_value_created, estimated_tax_savings, estimated_profit_improvement, source_assessment_type, value_creation_event_id, completed_at, verified_at, business_id` | Execution plan + **estimates**. Estimates are not facts. |
| `guest_sessions` | ✅ | `guest_session_id, expires_at, promoted_at, promoted_profile_id, state_snapshot, document_queue, assessment_answers, business_snapshot, galileo_events, status` | Pre-identity. Unscoped JSONB bundles. |
| `business_entities` | ✅ | `id, profile_id, entity_name, business_name, ein, entity_type, industry, naics_code, state, website, ownership_percentage, tax_year, assigned_advisor_id, current_stage, data_confidence_score, business_family_type` | **Canonical business.** |
| `businesses` | ✅ | Same columns **minus** `business_family_type` | Near-duplicate / legacy id space. Must not be mixed with the canonical one. |
| `business_intelligence_snapshots`, `business_intelligence_journal` | ❌ **404** | (created by `bie_persistence.sql`) | That migration was **never applied**. BIE is not persisted. Do not build on it. |
| `valuation.*` (schema `valuation`, not `public`) | ✅ | `valuation_financials`: `period_label, period_type, period_start_date, period_end_date, fiscal_year, revenue, cogs, gross_profit, operating_expenses, net_income, reported_ebitda, normalized_ebitda, reported_sde, normalized_sde, owner_compensation, depreciation, amortization, interest_expense, taxes, cash, funded_debt, AR, AP, inventory` · `valuation_versions`: versioned snapshots + `confidence_score` + `is_published` · `valuation_calculations`: `earnings_basis, normalized_earnings, base_multiple, final_multiple_*, equity_value_*, is_approved, approved_by_profile_id, calculation_engine_version` | **The strongest existing period + evidence + versioning model in the platform.** Architectural precedent to reuse, not to migrate (Step 26). |

### 1.2 Authorization + RLS conventions discovered

* `public.can_access_business(business_id)` is the certified **SECURITY DEFINER** helper (referenced by `galileo_conversations_access_policy`; `phase_6b1` verifies its presence by `proname`; `phase_6b_rls_audit_and_safe_subset.sql` audits it).
* Phase 6B enabled RLS on `business_entities, documents, extracted_fields, dashboard_metrics, business_assessments, assessment_sessions, assessment_calculations, business_opportunities, roadmap_items, value_creation_events, strategy_outcomes, galileo_conversations, advisor_notes, next_best_actions, saved_playbooks, freedom_projections, business_owners, advisor_assignments, expert_advisor_access, profiles`.
* Phase 6B2 enabled **RLS with zero policies** on six more tables, with an explicit written instruction not to "fix" it by adding `profile_id = auth.uid()` policies. **The backend service role is the only gate.** This is the pattern Phase 6C must follow, not invent around.
* Backend services already authenticate/authorize through `base44/shared/authz/actor.ts` (`authenticateActor`, `resolveActingProfile`, `authorizeBusinessAccess`), `base44/shared/businessScope/activeBusiness.ts` (`resolveActiveBusiness`, `assertBusinessAccess`, `requireBusinessContext`) and `base44/shared/businessScope/writeGuard.ts` (`validateBusinessScope`).

### 1.3 The two existing read contracts Phase 6C must sit under

* **BIS contract** — `base44/shared/intelligenceContract/businessIntelligenceContract.ts`: `business_identity, business_iq, business_confidence, valuation{...}, profitability{revenue, net_profit, reported_ebitda, recast_ebitda, total_addbacks, profit_gap, ...}, tax{...}, operations{...}, freedom{...}, assessments{...}`.
* **BIS field registry** — `contractFieldRegistry.ts`: every field declares `field_name` (dotted, e.g. `valuation.current_value`), `domain`, `certified_owner`, `source_type`, `business_scoped`, `historical_or_current`, **`verification_requirement`** (`none | advisor_review | document_review | verified_event`) and `consumer_notes`. This is already a source hierarchy + verification policy declaration.
* **Metric ownership registry** — `intelligenceContract/metricRegistry.ts`: certified owner + derived owner + precedence rules per metric, e.g. `assessment_calculations > dashboard_metrics (for assessment-owned results)`, `dashboard_metrics = derived/cache/read model`, `business_metric_snapshots = historical state`.

**Phase 6C keeps all three exactly as they are.** It adds a fourth layer *underneath* them.

---

## 2. SOURCE CLASSIFICATION (Step 2)

| Source | Stores | Biz-scoped | Period-aware | Metric definition known | Provenance | Verification state | Current BIS use | Safe to promote | Ambiguities |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `extracted_fields` (reviewed) | Observations from documents | ✅ `business_id` | ⚠️ `tax_year` only | ⚠️ `field_name` needs alias mapping (registry already declares `field_names` + `doc_types`) | ✅ form/line/page/document | ✅ `review_status` + `reviewed_by/at` | ✅ via `extracted_fields` source type | ✅ accept/correct only | fiscal vs calendar; basis unknown |
| `extracted_fields` (pending) | Same | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ `pending_review` | ✅ read as candidate | ❌ **never** (Step 13) | — |
| `extracted_fields` (rejected) | Same | ✅ | — | — | ✅ | ✅ `rejected` | filtered out | ❌ never an active fact | — |
| `business_metric_snapshots` | Per-period metric batch | ✅ (`TEXT` id) | ✅ `period_label/fiscal_*` | ✅ column names | ⚠️ document-linked only where created from fields | ❌ none | ✅ (BIS fallback source) | ⚠️ **only as derived/historical**, low authority | may itself be a projection |
| `dashboard_metrics` | Projection/read model | ✅ | ❌ latest only | ✅ column names | ❌ | ❌ | ✅ certified derived owner | ❌ **not as facts** (circular truth) | which values came from stronger sources |
| `assessment_answers` | Owner inputs | ✅ | ⚠️ `assessment_type` + session dates | ⚠️ `question_key` explicit | ✅ `answer_source`, `extracted_field_id` | ❌ none | ✅ | ✅ for explicit keys only | legacy ambiguous "profit" answers |
| `assessment_calculations` | Derived results | ✅ | ⚠️ session-scoped | ✅ `calculation_name` | ⚠️ `input_json` | ⚠️ `confidence_score` | ✅ certified owner | ✅ as **derived facts** with lineage | result_json semantics |
| `business_assessments` | Result + narrative | ✅ | ❌ | ⚠️ score/level | ❌ | ⚠️ `reviewed_by/at` | ✅ | ❌ mostly intelligence | score is not a business fact |
| `gap_analyses` | Gap interpretation | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ **never** | intelligence |
| `profile_financials` | Household **+** business | ⚠️ profile-scoped only | ⚠️ `primary_tax_year` | ⚠️ `current_profit_margin` ambiguous | ❌ | ❌ | ✅ | ⚠️ **business-semantic fields only**, `owner_reported`, period required | household fields; margin semantics |
| `roadmap_items` | Plan + estimates | ✅ | ⚠️ `due_date` | ❌ | ⚠️ `source_assessment_type` | ⚠️ `verified_at` | ✅ | ❌ estimates are not facts | — |
| `documents` | Files | ✅ | ⚠️ `year/tax_year` | — | ✅ storage path | ⚠️ `confidence_score`, `status` | ✅ indirectly | n/a (evidence anchor) | — |
| `document_analysis` | AI analysis | ✅ | ⚠️ | ❌ | ✅ `document_id` | ❌ | ✅ | ❌ | intelligence |
| `valuation.*` | Period financial statements, versions, calculations | ✅ `valuation_id` → business | ✅ **best in platform** | ✅ explicit line items | ✅ `valuation_evidence`, audit log | ✅ `is_approved`, verification queue | ✅ via valuation services | ⚠️ later, mapping-by-mapping (Step 26) | cross-schema; own version model |
| `guest_sessions` | Pre-identity bundles | ❌ (no business yet) | ⚠️ | ❌ | ⚠️ `document_queue` | ❌ | promotion path only | ❌ **this phase** — compatibility path only | temp business ids |
| `business_entities` / `businesses` | Business identity | ✅ | `tax_year` | — | — | `data_confidence_score` | ✅ | n/a (scope anchor) | **two id spaces** |

---

## 3. SEMANTIC MODEL (Step 3) — three things that must never be conflated

| Concept | Definition | Home | Persisted in `business_facts`? |
| --- | --- | --- | --- |
| **FACT** | A sourced statement about the business. `Revenue FY2025 = $5,200,000` | `business_facts` | ✅ yes |
| **METRIC** | A calculated measurement. `EBITDA margin = EBITDA / Revenue` | `assessment_calculations`, `dashboard_metrics` (projection), `metricRegistry` (ownership) | ⚠️ only when the measurement *is* a canonical fact (`gross_margin`), flagged `is_derived = true` with `lineage` |
| **INTELLIGENCE** | Galileo's interpretation. "Your profitability appears stronger than typical operators." | `business_assessments`, `gap_analyses`, `galileo_*`, `StrategicHypothesis`, `business_decisions` | ❌ **never** |

Rule: a fact carries a value and a source. An interpretation carries a judgement and a model version. Writing interpretation into `business_facts` would make Vision's opinions look like measurements — structurally forbidden by this design.

---

## 4. SCHEMA DESIGN (Steps 4–6, 35–39)

Authoritative DDL: `src/supabase/migrations/phase_6c_digital_twin_facts.sql`. Summary of the decisions:

### 4.1 `public.business_facts`
`id, business_id (uuid → business_entities, cascade), fact_key, fact_category, value_type, {value_numeric|value_text|value_boolean|value_date|value_json}, unit, currency, metric_definition, metric_definition_version, period_type, period_label, period_start, period_end, as_of_date, fiscal_year, accounting_basis, source_type, source_authority, source_table, source_id, source_reference, confidence, confidence_basis, verification_status, verification_method, verified_by_profile_id, verified_at, observed_at, created_at, created_by_profile_id, created_by_service, supersedes_fact_id, superseded_by_fact_id, superseded_at, supersession_reason, source_status, is_derived, lineage, fingerprint, metadata`

**Deliberate choices**
* **Typed value columns, not one JSON blob** — with a `business_facts_value_shape` CHECK enforcing that exactly the column matching `value_type` is populated. Conflict math and period ordering must be honest, not parsed at read time.
* **`metric_definition` + `metric_definition_version`** — the fact records *which definition* it was ingested against, so a future registry change can never silently re-interpret history.
* **`source_authority_at_ingestion smallint` + `authority_policy_version text`** — a *snapshot* of the rank and policy in force when the fact was ingested (audit/explainability). The resolver ranks with the **current** certified policy and treats the snapshot only as a flagged fallback (§6A.5). A future authority change never rewrites history and never silently re-ranks it.
* **`reviewed_by_profile_id/_at`** (last review decision) and **`verified_by_profile_id/_at`** (last attestation) are separate pairs with separate meanings (§6A.6). Verification vocabulary: `proposed | confirmed | verified | rejected | superseded` (§6A.2).
* **`fingerprint text unique`** — the only uniqueness in the table.

### 4.2 NO uniqueness on `business_id + fact_key` (Step 5)
`FY2024, FY2025, TTM, current-month, tax-basis, book-basis` and two conflicting FY2025 sources must all coexist. Enforced structurally: the only unique constraint is `(fingerprint)`.

### 4.3 Append-oriented history + a structural guard (Step 6, 37)
Correcting a value **never rewrites** the old row. `supersedes_fact_id / superseded_by_fact_id / superseded_at / supersession_reason` record the lineage, and a `BEFORE UPDATE` trigger (`business_facts_append_only`) **refuses** any change to factual content (value, period, basis, source, fingerprint…) with `restrict_violation`, and freezes superseded facts. Only lifecycle columns may change. The database — not merely the service — enforces business history.

### 4.4 `public.business_fact_evidence` (Step 12)
One row per observation: `fact_id, business_id, evidence_type, source_table, source_id, document_id, document_analysis_id, extracted_field_id, document_name, document_type, page, line, form, locator(jsonb), value_as_stated, confidence, human_reviewed, review_event, observed_at, source_status, deleted_at`.
`locator` is deliberately flexible (sheet/cell/section/url) because future connected sources expose different shapes; the document case uses page/form/line — columns that already exist on `extracted_fields`, so nothing new is needed there.

### 4.5 Derived conflict view (Step 15/16)
`business_fact_conflicts`: groups live facts by `business_id + fact_key + period_type + period_label + accounting_basis`, **requiring identical `period_start`, `period_end` and `as_of_date`** as well, with `count(*) > 1` and differing numeric values. The date-equality guard makes the grouping stricter, so it can only under-report a conflict, never over-report one — and the resolver always sees every candidate. No threshold is applied here (that is the resolver's job, §6A.4). Because period and basis participate in the **grouping**, `FY2024 vs FY2025`, `revenue vs TTM`, `EBITDA vs net income` and `cash vs accrual` cannot appear as conflicts — they differ in a grouping column. Conflicts are **derived, never stored**, so conflict state cannot drift.

### 4.6 RLS / write authority (Steps 35–37)
* RLS **enabled** on both tables.
* **Read**: one `authenticated` policy per table using `public.can_access_business(business_id)` — the certified helper, resolved by argument type at apply time (text vs uuid), with a hard STOP if it is missing. Defence in depth, matched to the `galileo_conversations` precedent.
* **Write**: **no INSERT/UPDATE/DELETE policies at all.** Clients cannot write facts. The service role (backend only) is the single writer, and that path authenticates the actor + authorizes the business before writing.
* No `profile_id = auth.uid()` shortcut anywhere — the documented Phase 6B lesson.

### 4.7 Indexes (Step 39) — from the resolver's real access pattern
1. `(business_id, fact_key, period_type, period_label, accounting_basis)` where `superseded_at is null` — the resolver's filter.
2. `(business_id, verification_status)` where `superseded_at is null` — verification queues.
3. `(source_table, source_id)` — provenance reverse lookup ("which facts came from this document?").
4. `(supersedes_fact_id)` — lineage chain.
5. Evidence: `(fact_id)`, `(source_table, source_id)`, `(business_id, document_id)`.
Nothing else is indexed.

---

## 5. FACT TAXONOMY + DICTIONARY (Steps 7–8)

### 5.1 The dictionary already exists — Phase 6C adopts it, it does not fork it
`canonicalFact/registry.ts` declares each fact with: `fact_key, category, display_name, description, business_meaning, value_type, unit, candidate_sources[] (source_type + source_authority + field_names + doc_types + valuation_question_key + dashboard_metric_key + profile_financial_key + assessment_type/field_names), required_verification_level, allow_fallback, conflict_materiality_threshold, conflict_tolerance, applicable_periods, default_period, lineage_requirements, is_derived, registered_consumers, is_pilot`.

**47 fact keys are declared today** (`FACT_REGISTRY`) — counted from the array itself, not from call sites. Composition: 23 literal `financialFact(...)` entries + 10 literal object entries (business profile / growth / document) + 6 generated business-quality dimensions + 8 generated intelligence facts. **The first 10 entries are pilot** (`is_pilot: true`), and pilot is the set actually served today (`canonicalFactService` and `consumerAdapter` both gate every action on `PILOT_FACT_KEYS`; `buildGalileoContext` passes `PILOT_FACT_KEYS`). The other 37 are declared but not yet served.

`PILOT_FACT_KEYS` (10): `revenue, gross_profit, gross_margin, net_income, reported_ebitda, normalized_ebitda, owner_compensation, cash, debt, customer_concentration`. **ACTUAL SUPPORTED CANONICAL FACT KEYS = 47; ACTUAL SERVED SET = 10.**
~~

*Pilot (10):* `revenue, gross_profit, gross_margin, net_income, reported_ebitda, normalized_ebitda, owner_compensation, cash, debt` (+ the 10th pilot key in the same block).
*Registered, non-pilot (13):* `total_assets, total_liabilities, total_equity, agi, monthly_take_home, employee_count, total_payroll, add_backs, historical_growth_rate, annual_capex, enterprise_value, equity_value, valuation_multiple, discount_rate`.

Categories: `financial, valuation, business_quality, business_profile, intelligence_assessment, growth_execution, document_verification`.

**Where "50" came from (resolved):** `src/CANONICAL_BUSINESS_INTELLIGENCE_LAYER.md` §1.8 is a **design-phase inventory of concepts found duplicated across the existing tables** — Financial 17 + Valuation 7 + Business Quality 6 + Business Profile 5 + Intelligence & Assessment 8 + Growth & Execution 3 + Document & Verification 4 = **TOTAL 50**, with the finding "the average business fact is stored in 2.4 tables". That blueprint number was copied into the registry's own header ("The 50-fact Canonical Fact Registry", "THE 50 CANONICAL FACTS") and propagated into `VISION_PLATFORM_ARCHITECTURE_CONTRACT.md`, `VISION_OWNERSHIP_MATRIX.md`, `DERIVED_FACT_FRAMEWORK.md`, `CANONICAL_FACT_RESOLUTION_REPORT.md` and `VALUATION_FUNCTIONALITY_AUDIT.md`. **It was an inventory, never an implemented registry.** The header has been corrected (comment only, no logic change) and now states the implemented count.

**Designed-but-absent concepts (3):** `valuation_version` (V7), `sprint_tasks` (GE2), `conflict_status` (DV4) are in the blueprint and are **not declared under any name**. Two further blueprint names exist under different keys: `revenue_growth_rate → historical_growth_rate`, `field_confidence → confidence_score`. Conversely the registry carries several financial facts the blueprint did not enumerate (`gross_profit`, `gross_margin`, `owner_compensation`, `add_backs`, `annual_capex`, `total_payroll`, `employee_count`, `monthly_take_home`), so 50 and 47 are overlapping lists, not a 3-item shortfall. **Nothing at runtime requests a missing concept:** a repo-wide scan found no literal non-pilot/undeclared `factKey` request, `canonicalFactService` refuses non-pilot keys and returns the pilot list, and `consumerAdapter` filters to pilot. The gap is documentation-vs-implementation drift, not a broken consumer. **No facts are added to make numbers match** — the three concepts are recorded as backlog for the phase that needs them.

**One authoritative registry:** `base44/shared/canonicalFact/registry.ts` (via `canonicalFact/index.ts`), consumed by `resolver.ts`, `consumerAdapter.ts`, `canonicalFactService` and `buildGalileoContext`. `intelligenceMapping.FIELD_REGISTRY` (29 business-snapshot fields), BIS `CONTRACT_FIELD_REGISTRY` (26 field names) and `METRIC_REGISTRY` (16 metrics) are **different registries** — BIS field/metric ownership, not fact keys — and must not be conflated with the fact dictionary.

### 5.2 Namespacing (Step 7) without a breaking rename
The registry uses **flat canonical keys** (`revenue`), while BIS's field registry already uses **dotted field names** (`valuation.current_value`). Phase 6C:

* persists `fact_key` exactly as the registry declares it — **no rename, no second vocabulary**;
* adds a **dotted display namespace** as a derived alias map in the dictionary layer (`financial.revenue ≡ revenue`, `operations.employee_count ≡ employee_count`, `business.entity_type ≡ business_entities.entity_type`), so no surface ever shows a bare ambiguous word;
* adds **source alias mapping**, which the registry already declares (`annual_revenue | total_revenue | gross_revenue → revenue` for `profit_and_loss`; `gross_receipts → revenue` for `business_tax_return`). This is the piece that prevents the semantic bugs Vision already suffered.

### 5.3 What the taxonomy structurally prevents (Step 7/16)
* Verified live: **there is no generic `profit` key, and no bare `margin` key** — only `gross_margin`, with `net_income` and `reported_ebitda` as separate facts.
* Precedent already in production: `regenerateCiqMetrics` refuses to compare an EBITDA-derived or ambiguously-sourced margin against the net-profit benchmark (`p1_mymargin_type` / `p1_mymargin_provenance`, values `ambiguous_legacy`, `derived_from_ebitda`, `estimated_from_net_profit`). Phase 6C's dictionary encodes that same rule as data rather than as a single function's guard.
* `EBITDA` and `net income` are different `fact_key`s → they can never be "substituted" or "conflict" (Step 16 D/E) structurally.

---

## 6. PERIOD / BASIS / SOURCE / EVIDENCE / VERIFICATION / CONFIDENCE MODELS (Steps 9–14)

**Period (Step 9).** `period_type ∈ {point_in_time, month, quarter, fiscal_year, calendar_year, year_to_date, trailing_twelve_months, custom_period, valuation_date}` + `period_label` + `period_start/end` + `as_of_date` + `fiscal_year`. Facts from different periods coexist by construction; `TTM` is a `period_type`, not a bigger fiscal year, so it can never conflict with one.

**Accounting basis (Step 10).** `cash | accrual | tax | book | unknown`, default `unknown`, **never guessed**. Basis participates in the conflict grouping, so different bases are never silently compared or overwritten. (The valuation schema already carries an `earnings_basis` concept — same vocabulary, reused.)

**Source (Step 11).** `document_extraction, owner_reported, assessment, connected_accounting, connected_bank, connected_payroll, expert_verified, manual_entry, derived_calculation, system_migration, advisor_entry, benchmark, valuation_engine` — extensible, not PDF-shaped. `source_authority` is derived from the certified 11-level `SOURCE_AUTHORITY`:
`verified_tax_return(1) → reviewed_financials(2) → advisor_entry_verified(3) → uploaded_financials(4) → extracted_field(5) → assessment_answer(6) → advisor_entry_unverified(7) → owner_estimate(8) → system_derived(9) → benchmark(10) → prior_published_version(11)`.

**Evidence (Step 12).** One row per observation, linking fact → `extracted_field` → `document` (page/form/line), or → `assessment_answers(question_key)`, or → valuation rows, or → the owner-confirmation event. This is what lets Galileo answer *"where did you get that number?"* without reverse-engineering the database — the current resolver builds `evidence[]` in memory on every read and then discards it.

**Verification (Step 13).** Lifecycle: `proposed → confirmed → verified`, plus `rejected` and `superseded`. The definition of `verified`, why the ambiguous `unverified` state is replaced by `confirmed`, and the exact answers for Accept and Correct are in **§6A**. `verified_by_profile_id` is mandatory for `verified` (CHECK **and** trigger). A `pending_review` extracted field **cannot become a fact at all**. Existing document governance (extract → review → accept/correct → promote) is untouched and stays authoritative.

*Vocabulary bridge (no drift):* CBIL's read-time `verification_status` is **derived**, and maps as: `verified ← verification_status='verified'`; `suggested ← 'unverified' + confidence ≥ 85`; `needs_review ← 'unverified' + 60–84 or 'proposed'`; `conflicting ← conflict detected`; `missing ← no candidates`. Documented so a future reader cannot mistake one for the other.

**Confidence (Step 14)** is a separate column with a `confidence_basis` (`extraction_confidence | human_review | calculated | source_reported`). A 95%-confidence extraction that no human has reviewed is `confidence=95, verification_status='unverified'`. A 60%-confidence value a human corrected and an advisor verified is `confidence=60…100, verification_status='verified'`. Verified and confident are **not** interchangeable, and the schema cannot express them as one thing.

---

## 6A. SEMANTIC RESOLUTION (the review pass — answers to the two open questions)

### 6A.1 What "verified" means in Vision — ONE definition
> **verified = the value has been validated beyond human review of the observation: either an authorized verifier the fact's definition requires has attested it (advisor / expert), or the value was read from a source that is itself a system of record for that value (connected accounting / bank / payroll actual, or an authoritative filing recorded as such).**
>
> The *identity* of that validation is explicit and differs by method: a **human** (`verified_by_profile_id`) for advisor/expert attestation, a **system** (`verified_by_service`) for connected/authoritative sources. A service is never represented by a synthetic human profile — see §6B.2.

Being looked at is not verification (§14 of the brief). Accepting a machine extraction is not verification. This definition is enforced **structurally**, not by documentation: the trigger refuses `→ verified` unless a verifier identity, a timestamp and one of the attestation methods are present.

### 6A.2 State vocabulary — `unverified` is replaced by `confirmed`
`proposed | confirmed | verified | rejected | superseded` — five states, one meaning each:

| State | Means | Produced by |
| --- | --- | --- |
| `proposed` | a machine/system observation, no human review yet | AI extraction, derived calculation, benchmark, guest import, migration |
| `confirmed` | an authorized human owns the value: accepted as-is, corrected, or stated | Accept, Correct, owner entry |
| `verified` | independently attested, or read from a system of record | advisor/expert attestation, connected source |
| `rejected` | reviewed and refused (never active) | Reject |
| `superseded` | replaced by a newer fact (terminal) | supersession |

**Why `confirmed` and not `unverified`:** `unverified` cannot distinguish "nobody has looked at this" from "a human reviewed and confirmed it" — the exact distinction the review raised. Vision already draws this line elsewhere: `ValuationFieldGovernance.ai_recommendation_status` is `pending | approved | rejected | modified` (AI proposed → human approved/modified), and `NinetyDaySprint.verification_status` separates `galileo_verified_pending_expert` from `galileo_and_expert_verified`. `confirmed` aligns the fact layer with the vocabulary the platform already uses; keeping `unverified` would have collapsed *pending* and *approved* into one word. This is the simplest model that preserves the distinction: it adds no state beyond the one that carries real meaning, and removes one that carried none.

### 6A.3 The answers to A and B
**A. Accept** → `verification_status = 'confirmed'`, `verification_method = 'document_review_accept'`, `reviewed_by_profile_id` + `reviewed_at` set. `confidence` is **unchanged** (immutable column; the machine's 88% stays 88%).
**B. Correct** → `verification_status = 'confirmed'`, `verification_method = 'document_review_correction'`. The fact carries the **corrected** value; `source_reference` records `{correction_event:'corrected', original_value, extracted_field_id}`; the evidence row records `review_event='corrected'`, `value_as_stated` = what the source said, `human_reviewed=true`. The AI never appears to have extracted the corrected number, and the original extraction row is untouched.
Neither is `verified` (§6A.1). An advisor **attesting** a fact — the field-governance approval, the valuation approval, the sprint expert verification — is what produces `verified`, with `advisor_review` / `expert_review`.

### 6A.4 Materiality classifies; it never discards
The registry threshold (**already declared per fact**: `0.05` for financial facts, `0.1` for quality/profile facts) is applied by the **resolver only**, to label a difference `minor` vs `material` in conflict metadata. It appears in no constraint and in no view filter. $5,200,000 vs $5,210,000 → two facts stored, both listed as alternatives, labelled *minor*. Below threshold never means discard, overwrite, merge or average: **evidence always survives**.

### 6A.5 Source authority — snapshot for history, current policy for ranking
`source_authority_at_ingestion` + `authority_policy_version` record the rank and the policy in force **when the fact was ingested** (explainability/audit). The resolver ranks using the **current** certified policy (`sourceHierarchy` → `SOURCE_AUTHORITY`), and uses the snapshot only as a **flagged** fallback when the current policy has no mapping for that `source_type`. A future authority change therefore neither rewrites historical facts nor silently re-ranks them.

### 6A.6 Four separate concepts — never collapsed into one score
| Concept | Column(s) | Changed by |
| --- | --- | --- |
| machine confidence | `confidence`, `confidence_basis` | ingestion only — **immutable** |
| human confirmation | `verification_status='confirmed'`, `verification_method`, `reviewed_by/at`, evidence `review_event` | review actions |
| source authority | `source_authority_at_ingestion` (snapshot) → current policy at read time | the policy, not this row |
| fact verification | `verification_status='verified'`, `verified_by/at` | attestation only |
The **derived** read-time tier (CBIL `confidence_level`, `confidenceEngine`) may legitimately rise because a human reviewed a fact — that is a derived label, not a stored merge, and `confidenceEngine` already treats reviewed fields as evidence.

### 6A.7 Vocabulary bridges (one meaning per word)
| Persisted (this layer) | CBIL read-time (derived) | Registry `required_verification_level` | BIS `verification_requirement` |
| --- | --- | --- | --- |
| `proposed` | `suggested` (≥85) / `needs_review` (60–84) | `any` / `needs_review` | `none` |
| `confirmed` | `suggested` (≥85) | `suggested` | `document_review` |
| `verified` | `verified` | `verified` | `advisor_review` / `verified_event` |
| `rejected` / `superseded` | excluded | — | — |

Minimum-status gate: required `verified` → only `verified` satisfies; `suggested` → `proposed` (reported as suggested) or higher; `needs_review`/`any` → `proposed`. Deliberate consequence: **owner confirmation alone does not satisfy a fact whose definition requires `verified`** — that is the governance Vision already applies to valuation-grade facts. Ranking and gating are different: a `confirmed` fact from a filed return (authority 1) still outranks a `verified` fact from an owner estimate (authority 8) on *ranking*, while the *gate* is about the required level.

### 6A.8 Immutability + legal transitions (final trigger review)
**Immutable:** scope + `fact_key`, value, period, basis, source identity, authority snapshot, confidence, observed/created, lineage, fingerprint. **Mutable through controlled transitions only:** `verification_*`, `reviewed_*`, `verified_*`, supersession fields, `source_status`, `metadata`. **Legal transitions:** any of `proposed`/`confirmed`/`verified`/`rejected` → any other, because a review decision can be revised and the existing review UI allows re-review (the identity is the *observation*, so a re-review must not collide with its own fingerprint); `→ superseded` is **terminal**. A **value/period/basis/source** change is refused outright — append a new fact.

**Revision 3 change — declarative-first, so INSERT and UPDATE cannot diverge (§6B.3):** every requirement that *can* be a CHECK constraint now is one, which PostgreSQL evaluates identically on INSERT and UPDATE. The guard trigger carries only what constraints cannot express: factual immutability, one-way/terminal supersession, and the ban on creating a fact already superseded. Requirements: `→ verified` needs an attestation identity (human **or** system, per the method) + timestamp + method (§6B.2); `→ confirmed` needs a review method + reviewer + `reviewed_at`; `→ rejected` needs a reviewer + `reviewed_at`; `→ superseded` needs `superseded_at` + a non-empty `supersession_reason`.

### 6A.9 Conflict grouping verified — it cannot misfire — superseded by §6B.4
Grouping = `business_id + fact_key + period_type + period_label + accounting_basis` **plus identical `period_start`/`period_end`/`as_of_date`**. By construction these can never group: FY2024 vs FY2025 (label), FY2025 vs TTM (type), EBITDA vs net income (key), reported vs normalized EBITDA (key), cash vs accrual (basis), Business A vs B (`business_id`). It **does** group the material case: same business, FY2025, accrual, reviewed P&L $5.2M vs owner-reported $5.8M → one conflict row, `candidate_count = 2`, both retained. The date guard can only under-report, never over-report.

### 6A.10 Migration preconditions — all hard-stops, before any DDL
P1 `business_entities` exists and is a table · P2 `business_entities.id` is `uuid` · P3 `profiles` exists (audit identities are meaningful; no FK by design so history survives profile deletion) · P4 `can_access_business` exists, argument type read and bound into the read policies · P5 `gen_random_uuid()` available · P6 no unrecognised object already owns `business_facts` / `business_fact_evidence` / `business_fact_conflicts` (a prior Phase 6C run is recognised by its `fingerprint` column) · P7 the guard-function name, if taken, is ours. The whole file is **one transaction**: a failed prerequisite leaves the database byte-identical — Phase 6C can never be half-installed.

---

## 6B. REVISION 3 — OWNER-DIRECTED INTEGRITY CORRECTIONS

Found by the owner's own review of the SQL rather than the report. All four are fixed in **revision 3**. §6A.9 and §4.5's grouping sentence are **superseded by §6B.4**; everything else in §6A stands unchanged.

### 6B.1 Evidence can no longer disagree with its fact (ISSUE 1)
**Root cause.** `business_fact_evidence.business_id` was an independent claim. RLS authorized the evidence row on that column, but nothing tied it to the referenced fact's business — so a privileged/service-role write could file Business A's evidence under Business B, and Business B's actor would be evaluated against (and served) a row belonging to Business A's fact.
**Fix, declarative.** A composite foreign key `(fact_id, business_id) → business_facts (id, business_id)`, using `business_facts_id_business_unique` as its referenced key, plus `business_id → business_entities (id)`. The evidence row's business **is** its fact's business by construction, so the existing read policy can only ever evaluate the fact's tenant. `ON DELETE CASCADE`, so evidence cannot outlive its fact, and the unique constraint expresses no business rule of its own (id is already unique) — it exists solely as the referenced key.

### 6B.2 Verification identity: human vs system (ISSUE 2)
**Root cause.** `verified` required `verified_by_profile_id`. That is right for advisor/expert attestation but wrong for a connected accounting/bank/payroll actual or an authoritative filing: those are verified by the **source**, and forcing a profile would mean inventing a fake human to satisfy a constraint.
| Method | Attestation identity required | Human profile |
| --- | --- | --- |
| `advisor_review`, `expert_review` | `verified_by_profile_id` | **required** |
| `connected_source` | `verified_by_service` ∈ {`connected_accounting`, `connected_bank`, `connected_payroll`} | not required |
| `authoritative_source` | `verified_by_service` = `authoritative_filing` | not required |
| `legacy_migration` | `verified_by_service` = `legacy_migration` **and** provenance naming the legacy record (`source_reference` or `source_id`) | not required |
| `document_review_accept`, `document_review_correction`, `owner_confirmation` | — | these produce **confirmed**, never verified |

`verified_at` is always required. Source-based verification must also name the source (`source_table` / `source_id` / `source_reference`), not just the category. The system vocabulary is closed and the identity must match the method that produced it. Attestation fields may exist only while the fact is `verified` or was verified before being `superseded`; demoting a fact requires clearing them explicitly, so a stale attestation can never linger.

### 6B.3 Every verification rule now holds on INSERT and UPDATE alike (ISSUE 2)
**Root cause.** The revision-2 trigger checked only *transitions*, so a privileged INSERT could create `verified` + `document_review_accept` (it satisfied the weaker INSERT-time CHECK).
**Fix.** Move every rule that can be declarative into CHECK constraints — PostgreSQL evaluates those identically on INSERT and UPDATE. The guard trigger now carries only what constraints cannot express: factual immutability, one-way/terminal supersession, and the ban on creating a fact already superseded. INSERT and UPDATE can no longer drift apart, and the same rules bind the future ingestion service.

### 6B.4 Conflict identity includes normalized period bounds (ISSUE 4)
**Root cause.** Grouping by label and *then* demanding date equality in `HAVING` let one observation suppress another pair's conflict: with A and B sharing bounds and C sharing the label but not the bounds, `min(...) = max(...)` failed for the whole group and A/B's genuine conflict vanished.
**Fix.** Normalize the bounds **into the grouping key**: `business_id, fact_key, period_type, normalized period_label, accounting_basis, normalized period_start, normalized period_end, normalized as_of_date`. Each exact identity is evaluated on its own. C is neither discarded nor conflated — it stays stored as its own identity. Materiality is still the resolver's classification only and never removes an observation.

### 6B.5 Supersession lineage is same-business (ISSUE 3)
**Root cause.** The lineage columns could reference any business's fact, so canonical lineage could cross tenants.
**Fix.** Composite foreign keys `(supersedes_fact_id, business_id)` and `(superseded_by_fact_id, business_id)` → `business_facts (id, business_id)`, `ON DELETE NO ACTION` — chosen over `RESTRICT` so a business cascading away with all its facts in one statement is not blocked by its own lineage. A fact may only replace, and only be replaced by, a fact of the same business. Append-oriented corrections, one-way supersession, terminal superseded state and historical retention are all preserved.

### 6B.6 Initial-superseded INSERT policy (decision)
**A fact cannot be created already superseded**, enforced by the guard trigger because a CHECK cannot distinguish INSERT from UPDATE. *Rationale:* a brand-new row asserted as superseded has no lineage meaning and would let a caller create facts outside the lifecycle; there is no legitimate Phase 6C use case for it. Historical promotion imports facts with their real statuses and links lineage when the successor is ingested. Superseded rows must carry `superseded_at` **and** a non-empty `supersession_reason`, so INSERT and UPDATE agree.

### 6B.7 Object + business mismatch audit — every Phase 6C relationship
| Relationship | Structural protection |
| --- | --- |
| evidence `fact_id` + `business_id` | **composite FK** — cannot differ (§6B.1) |
| fact supersession refs + `business_id` | **composite FK** — same business only (§6B.5) |
| evidence `business_id` on its own | FK → `business_entities (id)`, canonical |
| fact `business_id` | FK → `business_entities (id)`, canonical |
| evidence `document_id` + `business_id` | **deliberately not** FK-coupled to the legacy `documents` table. It is *provenance, not authority*: it is never consulted for authorization, and the row's tenant scope is fixed by the composite FK — so a wrong citation can never widen access. Shape is constrained instead: `document_id` is refused on non-document evidence types |
| fact `source_table` / `source_id` | provenance only; no FK to heterogeneous source systems (`extracted_fields`, assessments, valuations, connected systems). Not used for authorization |
| evidence `document_analysis_id` / `extracted_field_id` | provenance pointers into legacy tables, same reasoning |

**Conclusion:** no Phase 6C row can claim Business B while structurally authorizing against a canonical Business A object. The single relationship that cannot be declaratively proven same-business is documented here rather than faked with a fragile legacy FK — and it is explicitly flagged for the (not yet built) ingestion service to write citations correctly.

### 6B.8 RLS — unchanged
No policy was added, relaxed or removed. One `authenticated` read policy per table via `can_access_business (business_id)`; zero write policies. Revision 3 makes `business_fact_evidence.business_id` follow its fact, so the evidence read policy evaluates exactly the tenant the fact belongs to — the existing policy is now provably correct rather than merely intended.

### 6B.9 Corrections to the verification section (§V)
* **V2** expected "7 indexes" in revision 2 while the query lists *all* indexes — the two unique-constraint indexes were omitted from the count. Revision 3 states the correct **9** and names them.
* **V6** now expects **two** unique constraints (`fingerprint`, and `(id, business_id)` for composite-FK support) and still asserts the absence of `(business_id, fact_key)`.
* **V7** enumerates the CHECK constraints rather than a single one — **26** on `business_facts` (18 named + 8 inline column checks) and **5** on `business_fact_evidence` (2 named + 3 inline).
* **V8** (new) lists the five foreign keys that prove same-business coupling; **V9** (new) shows the closed verification vocabularies.
* **New tests:** E1/E2/E3 (evidence business coupling, document-reference shape), T1 (tombstone shape), Q6–Q14 (verification identity on INSERT, initial-superseded ban, supersession reason), S1–S4 (same-business lineage, terminality), C3/C4 (conflict identity).

---

## 7. CONFLICT MODEL + RESOLVER (Steps 15–19)

### 7.1 Conflict definition (Step 15)
A conflict exists **only** when all of these match: `business_id + fact_key + period_type + period_label + accounting_basis + value_type`, there are ≥ 2 live (non-superseded, non-rejected) candidates, and the numeric spread exceeds the registry's `conflict_materiality_threshold` for that fact (e.g. 5%). Below the threshold it is `minor`; at/above it is `material`. **The threshold classifies only** — it lives in the resolver, appears in no constraint and in no filter, and never removes, hides, merges or averages an observation (§6A.4). Both facts are always retained — never averaged, never latest-wins, never overwritten.

Non-conflicts (Step 16): different `period_label` (FY2024 vs FY2025), different `period_type` (FY2025 vs TTM), different `fact_key` (revenue vs EBITDA vs net income), different `accounting_basis` (cash vs accrual), and different `value_type`. All four are excluded structurally by the grouping columns, not by a rule someone must remember.

### 7.2 Resolver algorithm (Step 17) — no `ORDER BY created_at DESC LIMIT 1`
Input: `{ businessId, factKey, period?, basis?, asOfDate?, visibilityScope? }`.

1. **Definition gate** — resolve `factKey` through `FACT_REGISTRY`. Unknown key → refuse (never guess semantics). Read `value_type`, `applicable_periods`, `required_verification_level`, `conflict_materiality_threshold`, `is_derived`.
2. **Scope gate** — `business_id` equal to the canonical active business (server-resolved). No profile-wide fallback.
3. **Applicability** — keep facts whose period is applicable to the request (reusing `sourceHierarchy.isSourceApplicable` semantics: exact period > overlapping > as-of; published snapshots are historical evidence only, never current truth).
4. **Basis gate** — if a basis is requested, require it; if none is requested, never merge different bases into one value.
5. **Conflict scan** — apply the definition above. If a material conflict exists, set `conflict_status = 'material'`, keep every candidate, and pick a **preferred** value by policy while exposing the alternatives.
6. **Rank** — `authorityRank(source_authority)` → `verification_status` (verified > unverified > proposed) → `confidence` → evidence presence (`has evidence` > none) → recency **only as a final tie-break**.
7. **Verification gate** — if the winner is below the registry's `required_verification_level` (or BIS's per-field `verification_requirement`), the result is returned as `needs_review`/`unverified`, **not** presented as verified.
8. **Estimate handling (Step 19)** — `system_derived`/`benchmark`/`derived_calculation` never outrank a verified actual for the same key + period; an estimate is only the answer when nothing better exists, and is marked as estimated. The estimate is retained historically when the actual arrives.
9. **Staleness** — the existing CBIL rule (>18 months) sets `is_stale`.
10. **Answer** — `value + source + as_of + period + basis + confidence + verification + conflict + evidence[] + alternatives[] + lineage[]`.

### 7.3 Source preference reasoning (Step 18)
There is deliberately **no single global priority list**. Authority is only one of six factors and can be outweighed: a verified tax return for **FY2024** must not beat a reviewed FY2025 P&L for a FY2025 question (period applicability), a verified accrual figure must not be silently used for a cash question (basis), a verified `net_income` can never answer an `EBITDA` question (semantics), and an unverified owner figure must never be presented as verified (verification). Source *category* is the tie-breaker among semantically, temporally and basis-compatible candidates — not the decision.

---

## 8. INGESTION ARCHITECTURE (Steps 20–21)

**One service, every source.** Proposed (NOT built in this phase):

```
base44/functions/factIngestionService/entry.ts
  actions: ingestFact | ingestFromExtractedField | ingestFromAssessmentAnswer
           verifyFact | rejectFact | supersedeFact | resolveFact | getFactEvidence
base44/shared/facts/factSemantics.ts   definition lookup, dotted namespace, source-alias mapping, registry version
base44/shared/facts/fingerprint.ts     deterministic fingerprint
base44/shared/facts/factResolver.ts    persistence-backed resolver (composes canonicalFact/sourceHierarchy + resolverHelpers)
base44/shared/facts/evidence.ts        evidence row construction + source-lifecycle marking
```

`ingestFact({ businessId, factKey, value, period, basis, source, evidence[], confidence, confidenceBasis, verification })` responsibilities, in order:

1. Authenticate the actor (`authenticateActor`) — service-role path only, never a client-supplied identity.
2. Authorize the business (`resolveActiveBusiness` / `authorizeBusinessAccess`) when the call is actor-initiated; for system promotion, the business comes from the source record and is re-validated.
3. Resolve the definition in `FACT_REGISTRY` (unknown key → refuse).
4. Validate `value_type` against the definition and the typed column.
5. Validate `period_type ∈ applicable_periods` and period coherence (start ≤ end; label matches dates).
6. Validate `accounting_basis` (or store `unknown` — never guess).
7. Validate semantic compatibility against the declared source aliases (e.g. a `profit_and_loss` `annual_revenue` maps to `revenue`; an ambiguous legacy `profit` value maps to **nothing** and is refused).
8. Compute `source_authority` from the certified hierarchy.
9. Build `fingerprint`; then: same fingerprint + identical value → **no-op** (idempotent); same fingerprint + different value → **new fact that supersedes** the previous one (append, both retained).
10. Insert the fact + its evidence rows in one transaction; never overwrite conflicting evidence; never silently drop an alternative.

**Fingerprint (Step 21):**
`sha256(business_id | fact_key | period_type | period_label | period_start | period_end | accounting_basis | source_type | source_table | source_id | canonical_value)`
Because the **value is inside the fingerprint**, reprocessing an unchanged document is a no-op, while a corrected value is *structurally* a new fact rather than an edit. This is the mechanism behind Tests H and I.

---

## 9. DOCUMENT PROMOTION INTEGRATION (Steps 22–23)

**Current path (unchanged):** `document → extracted_fields(pending_review) → accept/correct/reject (updateExtractedFieldReview) → regenerateCiqMetrics (fire-and-forget)`, plus optional `createSnapshotFromReviewedFields → business_metric_snapshots (+ narrow dashboard_metrics upsert)`.

**Target path (proposed, additive):**

```
document → extracted_fields → Accept/Correct   → fact ingestion → business_facts → (BIS dual-read) 
                            → Reject          → no fact, ever
                            → pending_review  → no fact, ever
```

* The call site is the **existing** `updateExtractedFieldReview`, immediately after a successful `accept`/`correct` (the only two actions that already write `accepted_value` / `accepted_normalized_value`). No review UI changes. No new queue.
* Resulting fact: `source_type='document_extraction'`, `source_authority=2` (reviewed financials) or per doc type (`business_tax_return → verified_tax_return` when the document is a filed return and an advisor verified it), `verification_status='unverified'` with `verification_method='document_review'`; the evidence row records `review_event='accepted'|'corrected'`, `human_reviewed=true`.
* Corrections (Step 23) ingest the **corrected** value with `source_reference` recording `{correction_event:'corrected', original_value, extracted_field_id}` — the AI never appears to have extracted the corrected number, and the original extraction row remains untouched as evidence.
* Nothing is auto-promoted; `pending_review` and `rejected` produce no facts.

---

## 10. PROMOTION CANDIDATES + WHAT IS NOT SAFE (Steps 24–27, 32)

**Safe (staged, still not executed this phase):**
1. `extracted_fields` with `review_status ∈ {accepted, corrected}` — business-scoped, document evidence, period from `tax_year` (⚠️ see risks), basis `unknown` unless the document type proves otherwise.
2. `assessment_answers` with explicit `question_key` + `answer_value` (`assessment` source, `assessment_answer` authority).
3. `assessment_calculations` results that **are** canonical facts (e.g. a normalized EBITDA), ingested as `is_derived = true` with lineage to the input facts.
4. `business_metric_snapshots` — only as **derived/historical** context with low authority (they are period batches, possibly projections).
5. Valuation `valuation_financials` rows — **deferred**: they are the strongest period-aware model, but the valuation schema has its own versioning and lives in a separate Postgres schema; each mapping must be reviewed individually (Step 26).

**Explicitly NOT safe to promote:**
* `dashboard_metrics` (projection/read model — would create circular truth, Step 25).
* `gap_analyses`, `business_assessments.score/risk_level/opportunity_level/summary`, `document_analysis.ai_findings`, `galileo_*`, `business_decisions` (intelligence, not measurement).
* `roadmap_items` estimates (`estimated_value_created`, `estimated_tax_savings`, …).
* `profile_financials` household fields (`agi`, `taxable_income`, `annual_personal_expenses`, `investable_assets`, `total_personal_debt`, `passive_income`, `safe_withdrawal_rate`) — **household, not business** (Step 27).
* `profile_financials.current_profit_margin` — semantically ambiguous (net or EBITDA?); refused until provenance is explicit, mirroring the existing `ambiguous_legacy` guard.
* Any legacy field whose name is generic (`profit`, `income`, `margin`, `value`) without a source mapping in the registry.
* `guest_sessions` raw JSONB — this phase (see §11).
* `businesses` (legacy id space) — never a fact scope anchor.

---

## 11. GUEST → MEMBER COMPATIBILITY (Step 33)

Guest sessions are pre-identity: `guest_sessions.state_snapshot / business_snapshot / assessment_answers` are unscoped JSONB bundles, promotion is per-profile (`promoteGuestSession` maps `temp_business_id → real business_id`). **Phase 6C does not ingest guest data.** The compatibility path (deferred, designed):

* guest facts are never written to `business_facts` before a business exists — no invented ownership (the rule the platform already follows: no business → `business_context_required`).
* on promotion, the same `factIngestionService` is used, with `source_type='system_migration'` and `source_reference={ from:'guest_session', guest_session_id, promoted_profile_id }`, **only** for values that are semantically explicit, and idempotently (fingerprint based on the guest session id + fact key + period) so a promotion retry cannot duplicate.
* the existing promotion flow is untouched in this phase; nothing in Phase 6C can break it.

---

## 12. SOURCE DELETION (Step 34)

A source disappearing must never rewrite business history.

* Facts are **append-only** and their `source_reference` snapshot stays.
* On source deletion, the **evidence** row is marked: `source_status='deleted'`, `deleted_at = now()`; the fact keeps `source_status` at fact level mirroring its primary evidence (`present → deleted`), and the fact **remains** usable (it was true when observed, and it was true that it came from that document).
* Documents: only the linkage is affected — the file may be gone, the metadata and the fact survive. No file content is retained anywhere new.
* A `tombstoned` state exists for sources removed under a retention obligation where even the reference must be minimised.
* Policy statement for review: **source deletion never deletes a fact; it marks provenance as no-longer-retrievable.** Hard deletion of facts happens only via business deletion (FK cascade).

---

## 13. BIS INTEGRATION + DUAL-READ (Steps 28–31)

**Architecture (non-negotiable):**
```
SOURCES → OBSERVATIONS/EVIDENCE → business_facts → BIS RESOLUTION → Galileo / Home / Pulse / Opportunities / What If / Valuation / Sprint
```
Components keep asking **BIS**. No component is rewritten to query `business_facts` directly. No existing BIS output changes shape.

**Dual-read transition (Step 29), staged:**
1. **Shadow only (start state)** — BIS resolves exactly as today. In parallel (feature-flagged, off by default), the fact resolver resolves the same fields from `business_facts`. Both values are compared with the machinery that already exists: `canonicalFactService.shadowCompare` and `DiscrepancyType` (`match | expected_difference | period_difference | source_authority_difference | conflict | current_consumer_bug | canonical_resolver_bug | unknown`).
2. **Report differences** — mismatches are logged/reported with value, definition, period, basis and source, and are not allowed to change any output.
3. **Per-field flip** — precedence moves to `business_facts` for one field at a time, only after its shadow comparison shows parity (or an explained, accepted difference). The allowlist starts **empty** and lives in code, not in the database.
4. **BIS continues to own the contract**: it decides what the application sees, including how conflicts are surfaced.

**Additive metadata (Step 30).** The eventual BIS payload gains an *optional* per-field block: `{ resolved_value, source, as_of, period, accounting_basis, confidence, verification, conflict: {status, alternatives, materiality} }` — additive only, so consumers that expect today's shape keep working. Consumers that ignore it behave exactly as before.

**Intelligence vs confidence (Step 31).** `business_iq` / `business_confidence` describe **how much Vision understands**. Fact `confidence` / `verification_status` describe **how strongly one statement is supported**. They are never merged, and the fact layer never writes to the IQ/confidence fields.

---

## 14. HISTORICAL MIGRATION STRATEGY (Step 38/44)

**This phase: none.** No INSERT, no UPDATE, no backfill, no precedence change. Applying the migration leaves both tables empty and every existing behaviour identical (Test O). Historical promotion is a later, separately-approved phase with this sequence: (1) dry-run mapping report per candidate source, (2) per-field shadow comparison, (3) idempotent ingestion keyed by fingerprint, (4) conflict report before anything is preferred, (5) rollback plan. Every promotion must be business-scoped, semantic, period-aware where possible, source-linked and idempotent.

---

## 15. TESTING STRATEGY (Step 40)

**Runnable now (non-destructive, inside `BEGIN … ROLLBACK`)** — in the migration's `SECTION T`:
idempotency (H), correction append (I), no unique(business,fact_key) (M), append-only guard (P), verification transition (Q), period/basis coexistence (A/B), conflict retention (C), no-conflict across facts/periods/bases (D/E/F), empty-table state (V4), conflict view empty (V5), RLS policy shape (V1).

**Designed, executable once the ingestion service exists:**
* **G** estimated EBITDA vs verified actual → actual preferred, estimate retained.
* **J/K** pending and rejected fields produce **no** facts (asserted at the ingestion boundary).
* **N** source deleted → fact retained, evidence marked, resolver still returns the fact with `source_status='deleted'`.
* **O** BIS with zero facts → byte-identical output to today (shadow comparison must report only `expected_difference: none`).
* **P2** BIS with an equivalent fact → same output value (parity).
* **Q2** BIS with a conflict → deterministic preferred value + conflict metadata; no averaging, no latest-wins.
* **R** guest promotion unchanged (run the existing promotion path, assert guest flow + no facts written).
* **L/M2** cross-business invisibility, executed by a human with two real accounts (the build tools hold read-only access and cannot switch client roles).

---

## 16. FILES CHANGED IN THIS PHASE

| File | Status |
| --- | --- |
| `src/PHASE_6C_DIGITAL_TWIN_FACTS_ARCHITECTURE.md` | new (this document) |
| `src/supabase/migrations/phase_6c_digital_twin_facts.sql` | new, **revision 3** — **NOT EXECUTED** (revision 2 was approved but never executed; there is no deployed earlier state) |
| `src/PHASE_6C_DIGITAL_TWIN_FACTS_ARCHITECTURE.md` | amended with §6A (semantic resolution) and §6B (revision 3 integrity corrections) |
| `base44/shared/canonicalFact/registry.ts` | **comment-only** correction of the stale "50-fact" header (no logic, no keys, no behaviour changed) |

No application code, no backend function, no BIS path, no UI, no existing table was modified. No package was installed. Nothing was published or merged.

---

## 17. RISKS DISCOVERED (Step 39 of the report)

1. **Two business id spaces** — `business_entities` (canonical, has `business_family_type`) and `businesses` (near-duplicate). `business_metric_snapshots.business_id` is `TEXT`, not `uuid`. **Nothing may be ingested until the id space used by each candidate source is proven** (the migration's preflight query reports it). Wrong assumption here would cross businesses.
2. **`bie_persistence.sql` was never applied** (`business_intelligence_snapshots/_journal` → 404). BIE persistence is not available to build on; do not assume those tables exist.
3. **Valuation lives in the `valuation` schema**, so no cross-schema FK is possible to `valuation_financials`; facts must reference valuation rows by `source_table + source_id (+ source_reference)`. This also means valuation promotion needs its own mapping review.
4. **`extracted_fields` has no period, only `tax_year`,** and no accounting basis. Deriving `fiscal_year` from `tax_year` may be wrong (a tax return's tax year is not automatically the fiscal period the figures describe). Basis must be stored `unknown` unless documented — never inferred from "it's a tax return".
5. **`business_metric_snapshots` overlaps the fact space** (period financials). Risk of double truth: it is treated as historical/derived context only, and never reverse-ingested from `dashboard_metrics`.
6. **`profile_financials` mixes household and business** in one row; a naive promotion would put a household figure into the Digital Twin.
7. **Margin semantics** already caused real bugs (`current_profit_margin` is ambiguous; the profit-gap engine needs `p1_mymargin_type`/`p1_mymargin_provenance` to avoid a flattering wrong gap). The dictionary must encode this, not rely on each consumer remembering it.
8. **`source_authority` denormalization** could drift from the hierarchy module if the hierarchy changes; mitigated by storing `metric_definition_version` and documenting the hierarchy as the single source of the mapping.
9. **Registry count corrected (was mis-reported as 23):** the registry declares **47** facts, of which only the **10 pilot** keys are served today (`canonicalFactService`/`consumerAdapter` gate on `PILOT_FACT_KEYS`). The blueprint's 50 was a design inventory. Three designed concepts are declared nowhere (`valuation_version`, `sprint_tasks`, `conflict_status`) and 37 declared facts are not yet served — a coverage backlog, not a runtime break (nothing requests them).
10. **Review-reversal semantics:** because a fact's identity is the *observation* (not the review state), a re-review (reject → accept) is a legal lifecycle transition on the same fact rather than a new fact. This is deliberate (the fingerprint must not collide with itself), and it means the review *decision* history for a document field lives in `extracted_fields` / the evidence `review_event`, while the fact records the current decision.
11. **Evidence cannot disagree with its fact (rev3, ISSUE 1)** — `business_fact_evidence.business_id` is no longer an independent claim; a composite FK binds it to the fact's business, so it can never widen or shift tenant scope.
12. **Attestation identity is explicit (rev3, ISSUE 2)** — a human profile for advisor/expert review, a system identity for connected/authoritative sources; no synthetic profile may represent a service.
13. **Verification is declarative (rev3, ISSUE 2)** — CHECK constraints apply on INSERT and UPDATE alike, closing the INSERT loophole that allowed `verified` + `document_review_accept`.
14. **Conflict identity includes normalization (rev3, ISSUE 4)** — see §6B.4.
15. **Supersession lineage is same-business (rev3, ISSUE 3)** — see §6B.5.
16. **A fact is never born superseded (rev3)** — supersession is reached, not asserted; superseded rows carry a reason (§6B.6).
17. **Provenance pointers are not authority (rev3, §6B.7)** — `document_id` / `source_id` are deliberately not FK-coupled to legacy source tables: they are never consulted for authorization, and the row's tenant scope is fixed by the composite FK. One relationship is therefore *documented* rather than declaratively proven; the ingestion service must still cite correctly.

---

## 18. DECISIONS — APPROVED + RESOLVED IN REVISION 2

**Status: the 22 architectural decisions were APPROVED by the owner.** Items 1–10 below are retained as the record of what was decided, with the semantic pass folded in (§6A) and implemented in migration revision 2. Items 11–16 are the resolutions produced by the review pass.

**⚑ One item changes what was approved and is flagged for explicit confirmation:** the verification vocabulary replaces `unverified` with `confirmed` (§6A.2). If you prefer to keep `unverified` as a literal value, that is a one-line CHECK change in the migration — say so and it is adjusted before execution. Everything else in revision 2 is additive or clarificatory.

11. **`verified` means independent validation** — attestation by the required verifier, or a system-of-record source. It never means "a human clicked Accept" (§6A.1); enforced by the trigger.
12. **`confirmed` is the human-review state** for Accept / Correct / owner statement, aligned with the existing field-governance `pending | approved | modified` vocabulary (§6A.2/§6A.7).
13. **Materiality classifies, never discards** — the registry threshold is applied by the resolver for severity labelling only; no constraint and no view filter uses it (§6A.4).
14. **Source authority is a snapshot for history; the resolver ranks on current policy** (`source_authority_at_ingestion` + `authority_policy_version`) (§6A.5).
15. **Conflict grouping additionally requires identical period bounds**, so it can only under-report (§6A.9).
16. **Migration preconditions are hard-stops inside one transaction** — no partial install is possible (§6A.10).

**Revision 3 (owner-directed integrity corrections — not a new architecture decision):** the four corrections below change no approved semantic; they make the approved semantics structural. Revision 2 was approved but never executed, so no deployed state exists and nothing is migrated between them.

11. Evidence business scope **is** the fact's business, enforced by composite foreign key (§6B.1).
12. `verified` is attested by a human profile **or** a system identity — never a synthetic profile (§6B.2).
13. All verification rules are declarative, so INSERT and UPDATE cannot diverge (§6B.3).
14. Conflict identity includes normalized period bounds; observations never suppress one another (§6B.4).
15. Supersession lineage is same-business by composite foreign key (§6B.5).
16. A fact cannot be created already superseded; supersession requires `superseded_at` + reason (§6B.6).
17. Object + business mismatch audit across every Phase 6C relationship, with the one documented exception stated plainly (§6B.7).
18. RLS is unchanged — no policy added, relaxed or removed (§6B.8).

### Historical record — the original decision list (all approved)

1. **Canonical scope**: `business_facts.business_id` = `business_entities.id` (uuid, FK, cascade). Confirm — and confirm that older `TEXT` ids in snapshots never become fact scopes.
2. **Append-only**: corrections supersede; factual content is immutable in the database (trigger). Confirm this is acceptable for every consumer (it means "fix a typo in a value" always produces a new fact, never an edit).
3. **No client writes at all** (RLS enabled, read policy via `can_access_business`, zero write policies; service role is the only writer). Confirm this over "restricted client writes".
4. **Conflict materiality** comes from the registry's per-fact thresholds (5% for revenue, etc.). Confirm the thresholds, or accept the registry as-is.
5. **Two tables** (`business_facts` + `business_fact_evidence`) rather than evidence columns only on the fact. Confirm — the evidence table is what makes "where did you get that number?" answerable.
6. **Nothing is backfilled in this phase.** Confirm that the value of Phase 6C lands with the layer wired but empty, with promotion as a follow-up.
7. **`metric_definition_version`**: approve adding a registry version token (e.g. `FACT_REGISTRY_VERSION = 'cbil-1.0.0'`) to the existing registry so facts can record which definition they conformed to.
8. **Fact-key namespacing**: keep the registry's flat keys as `fact_key` and derive the dotted display namespace (no rename). Confirm, or explicitly request a rename with a compatibility plan.
9. **Source-deletion policy**: facts survive source deletion with marked provenance. Confirm this matches retention requirements.
10. **Service naming**: `factIngestionService` + `base44/shared/facts/*`.

---

## 19. DEFERRED (and why)

* **Ingestion service implementation** — waiting on the decisions above (§18); nothing should write facts before the scope and immutability rules are approved.
* **Promotion wiring** (`updateExtractedFieldReview` calling ingestion) — deliberately after approval; the review UI and CIQ recalculation are untouched today.
* **BIS dual-read activation / precedence flip** — shadow first, per-field, allowlist starts empty (Step 29). Not this phase.
* **Historical backfill** — no bulk promotion; staged per source with a mapping report (Step 32).
* **Guest facts** — compatibility path designed, execution deferred until business ownership exists at promotion time (Step 33).
* **Valuation → facts migration** — highest-quality source, but requires per-mapping review (Step 26).
* **Metric/definition coverage** — growing `FACT_REGISTRY` from 47 declared keys (10 served) toward the concepts BIS already exposes, and declaring the three designed-but-absent concepts (`valuation_version`, `sprint_tasks`, `conflict_status`) when a phase actually needs them (`net_profit` vs `reported_ebitda` vs `recast_ebitda` mapping, `employee_count` from assessments, etc.).
* **Source-deletion hooks** in the document delete paths — policy approved first, then the marking calls.
* **All UI** — no Fact Manager, no conflict dashboard, no provenance screens, no new Data Room surfaces (Step 41). Provenance and conflicts will surface through Galileo when the foundation is certified.