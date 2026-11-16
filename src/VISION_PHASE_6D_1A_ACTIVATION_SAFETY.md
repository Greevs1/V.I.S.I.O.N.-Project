# V.I.S.I.O.N. PHASE 6D.1A — DIGITAL TWIN ACTIVATION SAFETY & EVIDENCE QUALITY

**Date:** 2026-10-05
**Status:** PRODUCTION CERTIFIED + CLOSED — Gate 1 repaired and verified in production (read-only measurement, 2026-10-05).
**Carried debt:** SEC-031 and SEC-032 (broad default ACLs for future objects) are **confirmed** and deliberately **not** remediated in this phase — see §10.
**Guiding rule:** *nothing is promoted, and nothing can be.* Every surface built here is read-only, and the fact freeze is measured on every run rather than assumed.

---

## 1. DELIVERABLES

| Gate | Deliverable | State |
|---|---|---|
| 1 | Digital Twin privilege boundary — `business_facts`, `business_fact_evidence`, `business_fact_conflicts` | **PRODUCTION VERIFIED — PASS** (§2.5) |
| 2 | Read-only Digital Twin **pre-flight contract** + shadow evaluator | Built, tested (47 checks), **run against production** |
| 3 | Semantic corrections: EBIT/EBITDA, Net Income/Taxable Income, Gross Margin, Total Tax | Built, tested, **regression-clean** |
| 4 | Activation containment (no writes on any path) | Built, verified live (`writes_performed: false`, freeze held) |

### Artifacts

| File | Role |
|---|---|
| `base44/shared/digitalTwin/contract.ts` | The promotion-eligibility contract: states, blocker vocabulary, labels |
| `base44/shared/digitalTwin/provenance.ts` | Evidence origin (REAL_SOURCE / SYNTHETIC / …) and source authority |
| `base44/shared/digitalTwin/qualities.ts` | Period quality, accounting basis, multi-period detection |
| `base44/shared/digitalTwin/trust.ts` | Review state and verification (never confidence) |
| `base44/shared/digitalTwin/preflight.ts` | The evaluator: one pure function, `evaluatePromotionPreflight` |
| `base44/functions/digitalTwinPreflight/entry.ts` | Read-only production shadow surface (admin / super_admin) |
| `base44/functions/secureFactConflictView/entry.ts` | Gate 1 runner + probe (returns the SQL and its own limits) |
| `src/supabase/migrations/phase_6d_1a_secure_fact_conflicts.sql` | Gate 1 repair (idempotent) |
| `src/supabase/migrations/phase_6d_1a_secure_fact_conflicts_verification.sql` | Gate 1 verification |
| `scripts/digitalTwinActivationSafety.test.cjs` | Certification harness: 47 checks + 16 mutations |

---

## 2. GATE 1 — THE `business_fact_conflicts` SECURITY REPAIR

### 2.1 What was measured (read-only, live, this session)

| Measurement | Result |
|---|---|
| Engine | PostgreSQL **17.6** (`security_invoker` is supported) |
| `has_table_privilege('anon', …, 'select')` | **TRUE** |
| `information_schema.role_table_grants` | **NO ROW for this view** |
| View owner | `postgres` |
| `reloptions` | `null` (owner-privileged — RLS of the base table does **not** apply to readers of this view) |

**The decisive finding:** the anonymous privilege is **inherited from PUBLIC**, not granted to `anon`. Therefore `REVOKE … FROM anon` **alone would change nothing**. The repair must revoke from PUBLIC first. This is now measured, not assumed.

### 2.2 Current view definition (live, `pg_get_viewdef`)

```sql
SELECT business_id, fact_key, period_type, COALESCE(period_label, ''::text) AS period_label,
       accounting_basis, COALESCE(period_start, '0001-01-01'::date) AS period_start_key,
       COALESCE(period_end, '0001-01-01'::date) AS period_end_key,
       COALESCE(as_of_date, '0001-01-01'::date) AS as_of_date_key,
       count(*) AS candidate_count, min(value_numeric) AS min_value,
       max(value_numeric) AS max_value,
       max(value_numeric) - min(value_numeric) AS absolute_spread,
       CASE WHEN max(value_numeric) <> 0::numeric
            THEN round((max(value_numeric) - min(value_numeric)) / abs(max(value_numeric)) * 100::numeric, 2)
            ELSE NULL::numeric END AS spread_percentage,
       array_agg(id ORDER BY source_authority_at_ingestion, confidence DESC NULLS LAST) AS candidate_fact_ids,
       array_agg(DISTINCT source_type) AS candidate_source_types,
       array_agg(DISTINCT verification_status) AS candidate_verification_states
FROM business_facts a
WHERE superseded_at IS NULL AND verification_status <> 'rejected'::text
  AND (value_type = ANY (ARRAY['currency','percentage','number']))
  AND value_numeric IS NOT NULL
GROUP BY business_id, fact_key, period_type, (COALESCE(period_label, ''::text)), accounting_basis,
         (COALESCE(period_start,'0001-01-01'::date)), (COALESCE(period_end,'0001-01-01'::date)),
         (COALESCE(as_of_date,'0001-01-01'::date))
HAVING count(*) > 1 AND min(value_numeric) <> max(value_numeric);
```

### 2.3 Intended definition and intended grants

The **view definition text does not change**. Only the access posture does:

```sql
begin;
alter view public.business_fact_conflicts set (security_invoker = true);
revoke all on public.business_fact_conflicts from public;   -- the actual hole (PUBLIC-inherited)
revoke all on public.business_fact_conflicts from anon;     -- belt and braces
grant select on public.business_fact_conflicts to authenticated;
commit;
```

| Principal | Now | Intended |
|---|---|---|
| `PUBLIC` | SELECT (inherited) | none |
| `anon` | SELECT (via PUBLIC) | none |
| `authenticated` | SELECT (via PUBLIC) | SELECT (explicit) |
| `security_invoker` | unset (owner-privileged) | `true` |

### 2.4 Verification

```sql
select c.relname, c.reloptions, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'select')          as anon_can_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_can_select
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('business_facts','business_fact_evidence','business_fact_conflicts')
order by c.relname;

select (select count(*) from public.business_facts)         as business_facts_rows,
       (select count(*) from public.business_fact_evidence) as business_fact_evidence_rows;
```

**Accept:** `anon_can_select = false`, `reloptions = {security_invoker=true}`, and `0 / 0` fact rows.

### 2.4b Privilege provenance — what the manual catalog audit proved

The connector-side probe could not inspect the PostgreSQL catalogs. The owner ran the catalog audit **directly in the Supabase SQL Editor** (`pg_class`, `pg_namespace`, `pg_roles`, `aclexplode`) against exactly these three objects. Findings:

1. The Digital Twin objects carried **broad direct ACLs**.
2. Both base tables had **RLS enabled**, FORCE RLS **false**, one authenticated SELECT policy (`can_access_business(business_id)`) and **no write policies**.
3. `business_fact_conflicts` was **owned by `postgres`** with `security_invoker` **not** enabled, so it read `business_facts` in **owner context** — an RLS-bypass risk.
4. **Default privileges were confirmed broad**, for objects created by **both** `postgres` and `supabase_admin` in schema `public`: defaults grant `anon` and `authenticated` **SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN** (plus sequence access and function EXECUTE).
5. Therefore **SEC-031 = CONFIRMED** and **SEC-032 = CONFIRMED** (recorded in §10).

**The decisive consequence:** because the anonymous privilege was inherited from `PUBLIC` (and from broad default ACLs), revoking from `anon` alone would have changed nothing. The repair had to revoke from `PUBLIC` first, per object.

### 2.5 GATE 1 PRODUCTION RESULT — **PRODUCTION VERIFIED — PASS**

**Executed manually by the owner in the Supabase SQL Editor** (application code cannot run DDL here — see §2.6). The repair was applied to **all three** Digital Twin objects, not the conflict view alone, because the provenance audit (§2.4b) proved that broad direct ACLs and broad default privileges affected all of them.

**Measured post-repair posture (production, read-only):**

| Object | RLS | FORCE RLS | `anon` | `authenticated` | `service_role` | View mode |
|---|---|---|---|---|---|---|
| `business_facts` | **enabled** | false | **none** | **SELECT only** | SELECT · INSERT · UPDATE | — |
| `business_fact_evidence` | **enabled** | false | **none** | **SELECT only** | SELECT · INSERT · UPDATE | — |
| `business_fact_conflicts` | n/a (view) | — | **none** | **SELECT only** | SELECT only | **`security_invoker = true`** |

* No `authenticated` `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN` on any of the three objects.
* The authenticated SELECT policy `can_access_business(business_id)` on both base tables is **unchanged** — business isolation is preserved exactly as the harness asserts (`S4`, `S6`).
* `business_fact_conflicts` now executes with the **invoker's** privileges, so its reads are subject to `business_facts` RLS rather than the view owner's rights.
* **Every post-repair verification predicate returned `TRUE`.**
* **Fact freeze held:** `business_facts = 0`, `business_fact_evidence = 0`.

**What the repair did NOT do:** it did not alter RLS policies, the append-only trigger, or any default privilege (§10).

### 2.6 Why the probe function still reports `applied: "unknown"`

`secureFactConflictView` **cannot** confirm the repair from inside the app: the anonymous privilege is PUBLIC-inherited, so it has no explicit grantee row to inspect, and PostgREST cannot read `information_schema` on this project at all (`Could not find the table 'public.role_table_grants' in the schema cache`). It therefore returns `applied: "unknown"` and hands back the verification SQL. **The Gate 1 PASS above is established by the owner's direct catalog measurement — not by this function.** The harness asserts this honesty property (`ARCH-9`).

---

## 3. GATE 2 — THE PRE-FLIGHT CONTRACT (READ-ONLY SHADOW)

`evaluatePromotionPreflight` answers exactly one question: *could this observation safely be CONSIDERED by a future promotion engine?* It cannot promote, and has no code path to `business_facts` (asserted by source-level checks in the harness).

**Blockers** (a candidate is ready only with **zero** blockers): `SYNTHETIC_SOURCE`, `BUSINESS_ASSOCIATION_AMBIGUOUS`, `REVIEW_PENDING`, `REVIEW_REJECTED`, `PERIOD_UNKNOWN`, `PERIOD_AMBIGUOUS`, `MULTI_PERIOD_AGGREGATE`, `PROJECTED_VALUE`, `BASIS_UNKNOWN`, `MISSING_PROVENANCE`, `PERSONAL_ONLY`, `SENSITIVE`, `EVIDENCE_ONLY_CONCEPT`, `SEMANTIC_MAPPING_INVALID`.

**Properties verified:** real-source gating (synthetic and unknown-origin evidence can never be ready), basis required only where the fact's own definition makes it meaningful, association proven from the document (never from context), review ≠ verification, conflicts never silently resolved, and determinism (no clock, no randomness: same input, same verdict).

### 3.1 Production shadow — live result

`digitalTwinPreflight` (`pre_flight: 6d.1a.1`), read-only, `writes_performed: false`:

| Measure | Value |
|---|---|
| Evidence rows evaluated | **130** |
| **Promotion-ready** | **0** |
| `business_facts` / `business_fact_evidence` rows | **0 / 0** — freeze **held** |
| Pilot readiness | `revenue` 0/12, `gross_profit` 0/11 |

| Blocker | Rows |
|---|---|
| BUSINESS_ASSOCIATION_AMBIGUOUS | 130 |
| BASIS_UNKNOWN | 130 |
| REVIEW_PENDING | 116 |
| SYNTHETIC_SOURCE | 75 |
| EVIDENCE_ONLY_CONCEPT | 62 |
| PERIOD_UNKNOWN | 35 |
| MULTI_PERIOD_AGGREGATE | 24 |
| SEMANTIC_MAPPING_INVALID | 8 |
| PERSONAL_ONLY | 4 |
| MISSING_PROVENANCE | 2 |
| REVIEW_REJECTED | 1 |

**Read this honestly:** 75 of 130 rows (58%) are **synthetic** test extractions, 116 are unreviewed, and every single row is blocked on association and basis. Readiness 0 is therefore *both correct and not yet informative about real documents*. The pre-flight is measuring a development evidence base; it should be re-run after real client documents flow through ingestion.

---

## 4. GATE 3 — SEMANTIC CORRECTIONS

| Gate | Correction |
|---|---|
| 6A | **Taxable income is not net income.** Removed as a source of `net_income` (registry + valuation mapping) |
| 6B | **EBIT is not EBITDA.** `operating_income` removed as a source of `reported_ebitda` |
| 6C | **A net profit margin is not a gross margin.** The Profit Gap assessment answers (`p1_mymargin`, `net_profit_margin`) removed from `gross_margin` |
| 6D | **Total tax on a personal return is the owner's own liability** — declared `evidence_scope: 'personal_only'`, agreeing with the document policy instead of contradicting it |

### 4.1 The over-correction, and its repair (disclosed in full)

The first implementation of 6A/6B **deleted the concepts**: `taxable_income` and `operating_income` were left with no home at all. The certified suites caught it immediately — `semanticObservationBridge` P7 and `evidenceFirstAnswerEngine` A14/A20/SENT-GEN/LIVE-C went red, all five of them because a real concept had become unreachable.

**The repair is the correct form of the correction:** *separate the concepts, never remove one from the model.*

* `taxable_income` and `ebit` are each declared as their **own canonical fact**.
* Each is declared `evidence_scope: 'evidence_only'` **at the candidate**, so the registry itself states what promotion may do with it — matching the document policy (`fieldDisposition`: both are `EVIDENCE_ONLY`).
* `preflight.ts` now reads that declaration from the registry candidate when the semantic mapping does not carry it. Without this, giving a concept its own home would have quietly made it **promotable** — the exact opposite of the intent.

**Result:** each concept is readable and answerable as what it is, and can never be promoted as what it is not. Live confirmation: `ebit` (5 rows) and `taxable_income` (1 row) now resolve, and **both remain at 0 promotion-ready**; 6 rows moved out of `(unmapped)` into their own homes.

### 4.2 Deliberate expectation updates (disclosed)

| Check | Change | Why |
|---|---|---|
| `semanticObservationBridge` **P7** | `operating_income → reported_ebitda` became `operating_income → ebit`, plus an explicit assertion that the two keys **differ** | The old expectation encoded the conflation 6B removed. The new form asserts the same intent (each measure has its own key, never aliased) and is **stronger**, not weaker |
| `digitalTwinActivationSafety` **Q11 / Q11-MAP** | "taxable income resolves to no fact at all" became "resolves to its own fact, never to net income" | Same reason: the concept keeps a home |

Nothing else was relaxed. No assertion was deleted.

---

## 5. GATE 4 — ACTIVATION CONTAINMENT

* `business_facts`: **0 rows**. `business_fact_evidence`: **0 rows** (measured live, twice: before and after the concept declarations).
* The pre-flight function contains no INSERT/UPDATE/DELETE and no path to `business_facts`; the harness asserts this **at source level**, so a future edit that adds one fails the suite.
* Retry, ingestion, extraction and persistence paths were asserted to write nothing to the fact tables.

---

## 6. VERIFICATION

### 6.1 The phase harness

```
checks: 47 behavioural + 13 wiring
mutations: 16/16 APPLIED + BEHAVIOR_CHANGED + CAUGHT
ALL CHECKS PASS
```

Production build: `vite build` exit 0.

### 6.2 Regression matrix — measured against the pre-phase commit (`cd5c06f`, isolated worktree)

| Suite | Baseline (before 6D.1A) | After 6D.1A | Verdict |
|---|---|---|---|
| `semanticObservationBridge` | 0 failures | 0 failures | **clean** (regressed mid-phase, fixed) |
| `evidenceFirstAnswerEngine` | 0 failures | 0 failures | **clean** (regressed mid-phase, fixed) |
| `taxDocumentIntelligence` | 20 failures (identical IDs) | 20 failures (identical IDs) | **unchanged — pre-existing debt** |
| `adminWorkspaceAccess`, `adminRouteAccess`, `documentAccessAuthorization` | — | 0 failures | **clean** |
| `durableDocumentIngestion`, `documentCanonicalSourceRead`, `documentKnowledgeCompletion` | `FORM_1040_FIELDS is not defined` | identical error | **pre-existing, harness-side** |
| `digitalTwinActivationSafety` | n/a (new) | ALL PASS | **clean** |

The tax suite's 20 failures and its 4 uncatchable mutations (`M8`, `M9`, `M18`, `M20`) are **byte-identical before and after this phase**. They are baseline debt, not a 6D.1A regression — and they deserve their own reconciliation phase, because two of them matter: `CONT-1..3` and `T18` say that a W-2 whose employer is not provably this business is reported as *"I haven't extracted its figures yet"* while its figures **are** on file. The certified intent is to show them as unverified **document** evidence with the ambiguity stated.

### 6.3 Change-surface guards

`adminCanonicalActor`, `relationshipRevocationAccess`, `galileoContextActorBinding`, `documentSignedUrlAuthorization`, `adminDocumentViewer` flag the change surface. Inspected line by line: they enumerate **this phase's new files** (`base44/shared/digitalTwin/*`, the two new functions, the two migrations, the harness) plus files from earlier phases their baseline predates. That is the expected behaviour of a review-pinning guard at a new phase boundary — it requires re-review of the slice, not a functional fix. No guard flagged an unexpected *modification* of a product file.

### 6.4 Known red, unrelated to this phase

* `businessContextContract` — red on `ownershipConcentrationEngine/entry.ts` importing the business-scope guard (recorded baseline debt).
* `certify-intelligence-contract` — `NOT CERTIFIED` (recorded baseline debt).
* `architectureGuard.cjs` and `getDocumentsAdmin.s3.mock.test.cjs` produce no output when invoked programmatically in this environment (the tracked builder-environment limitation).

---

## 7. WHAT THIS PHASE DOES NOT DO

* It does **not** promote anything, and cannot.
* It does **not** unblock activation. The pre-flight is a *gate for a future promotion engine*, and its exit criterion — 0 promotion-ready — is currently met for reasons that include 58% synthetic evidence. That criterion must be re-measured on real documents before activation is reconsidered.
* Its Gate 1 security repair **is applied and verified in production** (§2.5). It did **not** remediate default ACLs (SEC-031 / SEC-032), and it changes neither BIS precedence nor Galileo precedence.

---

## 8. EXIT CRITERIA

| Criterion | State |
|---|---|
| Gate 1 SQL authored and idempotent | ✅ |
| Gate 1 pre-state measured (anon yes, PUBLIC-inherited, owner-privileged) | ✅ |
| Gate 1 applied and verified in production | ✅ **PRODUCTION VERIFIED — PASS** |
| Final posture measured (anon none · authenticated SELECT · service_role backend-only · `security_invoker` true) | ✅ |
| Gate 1 applied without altering RLS policies, the append-only trigger, or default privileges | ✅ |
| SEC-031 / SEC-032 confirmed, recorded as separate debt, not remediated here | ✅ |
| Pre-flight contract exists, is pure, and cannot write | ✅ |
| Pre-flight run against production: readiness 0, freeze held | ✅ |
| Semantic corrections 6A–6D implemented, concepts retain their own homes | ✅ |
| No regression in the certified document suites | ✅ (proven against the pre-phase commit) |
| Fact freeze measured, never assumed | ✅ |

---

## 9. RECOMMENDED NEXT STEPS

1. **Reconcile the 6D.0c.3 suite debt** (20 checks) as its own phase — starting with the W-2 document-evidence gap (`T18`, `CONT-1..3`), which is a real product gap, not a harness artefact.
2. **Re-baseline the change-surface guards** for the 6D.1A slice so they pin the new surface.
3. **Open the default-privilege hardening phase (P-S1.5 / SEC-031 · SEC-032)** — audit application-wide compatibility for `anon`, `authenticated`, sequences and functions **before** changing any default. Do **not** fold this into Digital Twin activation (§10).
4. **Re-run the production pre-flight after real documents flow**, and only then begin 6D.1B promotion design.

---

## 10. CARRIED SECURITY DEBT — DEFAULT ACLs (NOT REMEDIATED HERE)

The Gate 1 audit proved that **default privileges are broad** for objects created by `postgres` and `supabase_admin` in schema `public`: new objects are auto-granted to `anon` and `authenticated` with SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN (plus sequence access and function EXECUTE). 6D.1A repaired **only** the three Digital Twin objects. Changing default ACLs has an application-wide blast radius and needs its own compatibility audit, so it is **recorded, not fixed**:

| ID | Finding | Status | Disposition |
|---|---|---|---|
| **SEC-031** | Broad default privileges remain configured for **future** objects in `public`. | **CONFIRMED** | Deferred to a dedicated hardening phase |
| **SEC-032** | Default table privileges include **TRUNCATE**. | **CONFIRMED** | Deferred to the same phase |

**Required follow-up — P-S1.5 / DEFAULT PRIVILEGE HARDENING.** It must audit application-wide compatibility for `anon`, `authenticated`, sequences and functions **before** changing any default, and must **not** be folded into Digital Twin activation. Gate 1 deliberately leaves schema-level and default grants untouched.

---

## 11. FINAL CERTIFICATION

Every line below is a **measured** result, with its provenance stated. Nothing is asserted that was not measured.

| # | Item | Result | Provenance |
|---|---|---|---|
| 1 | Gate 1 production security repair | **PASS** | owner-measured in production, §2.5 |
| 2 | Synthetic / mock evidence permanently non-promotable | **PASS** | `Q2`, `Q3` + `M1`, `M2` (§3) |
| 3 | Business-association pre-flight implemented | **PASS** | `Q4`, `Q5`, `Q17` + `M13`, `M14` (§3) |
| 4 | Basis semantics implemented | **PASS** | `Q6`, `BASIS-NA` + `M3` (§3) |
| 5 | Period-quality semantics implemented | **PASS** | `Q7`, `Q8` + `M4` (§3) |
| 6 | Semantic contradictions corrected (6A–6D) | **PASS** | `Q11`, `Q11-MAP`, `Q12`, `Q13`, `Q14` (§4) |
| 7 | Trust semantics: `CONFIDENCE ≠ VERIFICATION` | **PASS** | `Q10` + `M5`, `M6` (§3) |
| 8 | Pre-flight evaluator complete | **PASS** | 47 checks green (§6.1) |
| 9 | Production shadow evaluation complete | **PASS** | `digitalTwinPreflight`, `writes_performed: false` (§3.1) |
| 10 | Production observations evaluated | **130** | production shadow run (§3.1) |
| 11 | Promotion-ready | **0** | production shadow run (§3.1) |
| 12 | `business_facts` rows | **0** | owner-measured in production (§2.5) |
| 13 | `business_fact_evidence` rows | **0** | owner-measured in production (§2.5) |
| 14 | Phase checks | **47 / 47 PASS** | harness (§6.1) |
| 15 | Adversarial mutations caught | **16 / 16** | harness (§6.1) |
| 16 | Document bridge regression | **clean** — 0 failures | §6.2 |
| 17 | Evidence-first regression | **clean** — 0 failures | §6.2 |
| 18 | Tax-suite baseline debt | **unchanged** — 20 failures, identical IDs, pre-existing | §6.2 |
| 19 | Build | **exit 0** — `vite build` (re-measured this pass) | fresh measurement, 2026-10-05 |
| 20 | Working tree / release revision | HEAD `dee3ff4` "Implement 6D.1A activation safety and ontology refinements"; working tree **clean** at measurement. This documentation update adds one modified file (the report itself) | fresh measurement, 2026-10-05 |

**Honest scope of this pass.** This is a **documentation-only** update: no code, schema, RLS, grant, migration or default privilege was changed, and nothing was written to `business_facts` / `business_fact_evidence`. Items **19** (build) and **20** (release revision) were re-measured fresh this pass. The phase harness (items 14–15) and the regression matrix (items 16–18) are carried forward **from the certification run** with their provenance; they were **not** re-executed in this pass — the builder environment cannot execute the harness (recorded limitation). No product file changed between that run and this update, so their results stand as certified.

---

## FINAL STATUS

All previously certified engineering gates remain green, and the production Gate 1 result is incorporated:

```
6D.1A DIGITAL TWIN ACTIVATION SAFETY
PRODUCTION CERTIFIED + CLOSED
``