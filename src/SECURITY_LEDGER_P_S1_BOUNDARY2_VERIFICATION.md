# P-S1 — PRODUCTION BOUNDARY 2 VERIFICATION PACKET

**Project:** `tfrbswfrhrtgfcgonimb` (production Supabase)
**Executed:** 2026-10-04 · **Read-only:** every query ran against `POST /v1/projects/{ref}/database/query/read-only` as **`supabase_read_only_user`** (verified in the session probe). **No writes, no DDL, no policy changes, no active access tests.**
**Permissions used:** the Supabase connector already authorized for this app (`projects:read`, `secrets:read`, `database:read`). **No new OAuth scopes were requested**, and the `database:write`-gated endpoint was never called. `service_role` was never used for any of this.
**Product code:** untouched. **Ledger:** NOT rewritten — only the Boundary-2-dependent findings are re-ranked (§RE-RANK).

> **The repository was right to be distrusted, and the ledger was wrong on the decisive point.** The ledger inferred "Boundary 2 does not exist" from migration-file metadata. Production shows the opposite: **RLS is enabled on 100% of tables in all three schemas, Storage has zero object policies, and all three buckets are private.** The ledger's SEC-002 must be closed, and S2 must be recorded as executed. Details, and the *real* residual risk that replaces SEC-002, below.

---

## 0. METHOD AND EXECUTION PROOF

| Item | Value |
|---|---|
| Endpoint | `/v1/projects/tfrbswfrhrtgfcgonimb/database/query/read-only` |
| Session role (probe) | **`supabase_read_only_user`** |
| Database | `postgres` |
| Roles present | `anon` ✓, `authenticated` ✓ |
| Statements executed | 24 read-only `SELECT`s over `pg_class`, `pg_namespace`, `pg_policies`, `pg_default_acl`, `aclexplode()`, `pg_proc`, `storage.buckets`, `information_schema` |
| Statements blocked by guard | 3 (false positives on the word "grantee" — re-run with a corrected guard) |
| Writes performed | **0** |

**Safety controls applied:** every statement passed a write-keyword rejector before dispatch; the endpoint itself is a read-only variant; the session role is a read-only role; no `SET ROLE`, no `service_role`, no data modification, no cross-tenant read attempt. The active-exploit tests the brief defers are in §PHASE 2 and were **NOT executed**.

---

## 1. CHECK 1 — STORAGE BUCKETS → **A**

| id | name | public | file_size_limit | allowed_mime_types |
|---|---|---|---|---|
| `client-documents` | client-documents | **false** | `null` | `null` |
| `consulting_library_files` | consulting_library_files | **false** | `null` | `null` |
| `documents` | documents | **false** | `null` | `null` |

**All three buckets are private.** No public (`/object/public/...`) URL path exists for any of them.
**Side finding (SEC-017 confirmed):** `file_size_limit` and `allowed_mime_types` are **unset at the bucket level** — there is no MIME or size ceiling anywhere in the stack.

---

## 2. CHECK 2 — STORAGE POLICIES → **B**

| Metric | Value |
|---|---|
| `pg_policies` rows for `storage.objects` | **0** |
| `storage.objects` RLS enabled | **true** (`relrowsecurity = true`) |
| `authenticated_read_documents` | **ABSENT** |
| `authenticated_update_documents` | **ABSENT** |
| `authenticated_upload_documents` | **ABSENT** |

Storage tables (8, all RLS-enabled): `buckets`, `buckets_analytics`, `buckets_vectors`, `migrations`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `vector_indexes`. **Zero policies in the entire `storage` schema.**

**Effect:** RLS enabled + zero policies = **deny-all**. No `anon`, `authenticated` or `public` policy grants direct SELECT/INSERT/UPDATE/DELETE on any Storage object.
**Historical policies: removed.** → S2 storage containment is **CONFIRMED EXECUTED** (§S2 VERDICT).

---

## 3. CHECK 3 — TABLE RLS STATUS → **C**

| Schema | Tables | RLS enabled | FORCE RLS |
|---|---|---|---|
| `public` | 65 | **65** | 1 (`business_decisions`) |
| `storage` | 8 | **8** | 0 |
| `valuation` | 29 | **29** | **27** |

**Every table in every schema has RLS enabled.** Read from `pg_class`/`pg_namespace`, not inferred from migrations.

Sensitive-table detail (all requested tables; `missing = true` means the table **does not exist** in production):

| Table | Exists | RLS | Notes |
|---|---|---|---|
| `profiles` | ✓ | **true** | 3 policies |
| `business_entities` | ✓ | **true** | 3 policies |
| `business_team_members` | ✓ | **true** | 2 policies |
| `business_owners` | ✓ | **true** | **0 policies → deny-all** |
| `expert_advisor_access` | ✓ | **true** | **0 policies → deny-all** |
| `documents` | ✓ | **true** | 1 policy |
| `document_analysis` | ✓ | **true** | 1 policy |
| `extracted_fields` | ✓ | **true** | 1 policy |
| `business_facts` | ✓ | **true** | 1 policy (SELECT, `authenticated`) |
| `business_fact_evidence` | ✓ | **true** | 1 policy (SELECT, `authenticated`) |
| `advisor_notes` | ✓ | **true** | 1 policy |
| `dashboard_metrics` | ✓ | **true** | 1 policy |
| `assessment_calculations` | ✓ | **true** | 1 policy |
| `assessment_sessions` / `assessment_answers` | ✓ | **true** | 1 policy each |
| `business_assessments` | ✓ | **true** | 1 policy |
| `business_opportunities` | ✓ | **true** | 1 policy |
| `roadmap_items` | ✓ | **true** | **0 policies → deny-all** |
| `saved_playbooks` | ✓ | **true** | **0 policies → deny-all** |
| `galileo_conversations` | ✓ | **true** | 1 policy |
| `profile_financials` | ✓ | **true** | 3 policies |
| `valuation_*` (29 tables) | ✓ | **true** | policies `TO authenticated` only |
| **`advisor_assignments`** | **✗ MISSING** | — | **table does not exist** → §RE-RANK SEC-009 |
| `notifications` | ✗ MISSING | — | Base44 entity, not a Supabase table |
| `opportunities` | ✗ MISSING | — | real name is `business_opportunities` |
| `gap_analysis` | ✗ MISSING | — | real name is `gap_analyses` |

**40 of 65 public tables carry RLS with ZERO policies** (deny-all, backend-only): `business_owners`, `business_strategy_workspaces`, `client_strategy_expansions`, `client_strategy_scores`, `expert_advisor_access`, `freedom_projections`, `galileo_business_snapshots`, `galileo_context_logs`, `galileo_fallback_logs`, `galileo_generations`, `galileo_opportunities`, `galileo_opportunity_score_history`, `gap_analyses`, `ghl_sync_log`, `guest_sessions`, `knowledge_article_relationships`, `knowledge_articles`, `knowledge_base_articles`, `knowledge_categories`, `knowledge_chunks`, `knowledge_retrieval_logs`, `ninety_day_sprint_paths`, `ninety_day_sprint_reminders`, `ninety_day_sprint_task_documents`, `ninety_day_sprint_task_notes`, `ninety_day_sprint_tasks`, `recommendation_overrides`, `recommendation_strategy_mappings`, `resource_assignments`, `resource_file_assignments`, `roadmap_items`, `saved_playbooks`, `strategy_expansion_map`, `strategy_learning_summary`, `strategy_library`, `strategy_library_backup_20260723`, `strategy_outcomes`, `team_invites`, `worksheet_assignments`, `worksheet_responses`.

---

## 4. CHECK 4 — TABLE POLICIES → **D**

**39 policies in `public`.** **Not one** uses `USING (true)` or any identity-free predicate. Every single one resolves through `auth.uid()` — directly, or via `can_access_business()`, `is_super_admin()`, or the `valuation.*` helpers.

| Pattern | Tables | `roles` | `cmd` | Predicate family |
|---|---|---|---|---|
| Business-scoped ALL | `documents`, `document_analysis`, `extracted_fields`, `dashboard_metrics`, `advisor_notes`, `galileo_conversations`, `next_best_actions`, `value_creation_events`, `business_opportunities`, `business_assessments`, `reports`, `chat_history`, `assessment_sessions`, `assessment_answers`, `assessment_calculations` (15) | `public` | ALL | `can_access_business(business_id)` |
| Business-scoped R/W split | `business_metric_snapshots` (3) | `public` | SELECT/INSERT/UPDATE | `can_access_business(business_id)` |
| Identity-scoped | `profiles` (3), `profile_financials` (3), `extraction_reports` (1) | `public` | SELECT/INSERT/UPDATE | `id/profile_id = auth.uid() OR is_super_admin()` |
| Business + team/advisor | `business_entities` (3), `business_team_members` (2) | `public` | SELECT/INSERT/UPDATE/ALL | `auth.uid()` vs `profile_id` / `assigned_advisor_id` / team EXISTS |
| Hardened (`authenticated` only, Phase 6C) | `business_facts` (1), `business_fact_evidence` (1) | `authenticated` | **SELECT only** | `can_access_business(business_id)` |
| Assignments | `document_assignments` (3) | `authenticated` | SELECT/INSERT/UPDATE | `can_access_business` + `can_assign_document_to_profile` |
| Decisions | `business_decisions` (4) | `authenticated` | SELECT/INSERT/UPDATE/DELETE | `valuation.*` helpers |
| `valuation.*` (24 tables) | — | `authenticated` | — | `valuation.can_view/edit/publish_valuation`, `has_business_access` |

**Classification for the sensitive set:** **RLS / READ+WRITE** for the 25 tables that have policies; **RLS / NO POLICIES** for the 40 in §3; **NO RLS** for **zero** tables.

**The decisive property:** with `auth.uid()` NULL — which holds for **every** possible request, proven in §11 — `can_access_business(...)` → `false`, `id = auth.uid()` → `NULL` (not true), `is_super_admin()` → `false`. **Therefore all 39 policies evaluate FALSE and grant nothing.**

---

## 5. CHECK 5 — GRANTS → **E**

Actual `relacl` from `pg_class` (production catalog, not migration files):

| Role | Privileges granted on public tables | Tables |
|---|---|---|
| `anon` | SELECT, INSERT, UPDATE, DELETE, **TRUNCATE**, REFERENCES, TRIGGER, **MAINTAIN** | **63 of 65** |
| `authenticated` | SELECT, INSERT, UPDATE, DELETE, **TRUNCATE**, REFERENCES, TRIGGER, **MAINTAIN** | 63 (SELECT on 65) |
| `service_role` | all, on all | 65 |
| `postgres` | all, on all | 65 |

Direct probes (`has_table_privilege`) confirm `anon` and `authenticated` hold **SELECT+INSERT+UPDATE+DELETE = true** on every sensitive table checked — including `documents`, `profiles`, `business_entities`, `extracted_fields`, `business_facts`, `business_fact_evidence`, `advisor_notes`, `dashboard_metrics`, `profile_financials`, `galileo_conversations`, `next_best_actions`, `value_creation_events`, `business_owners`, `business_team_members`, `expert_advisor_access`, `document_analysis`, `roadmap_items`, `saved_playbooks`, `strategy_outcomes`, `business_metric_snapshots`, `assessment_calculations`.

**Storage:** `anon` and `authenticated` hold **SELECT, INSERT, UPDATE, DELETE** on `storage.objects` **and `storage.buckets`** (probe: all `true`).

**Interpretation:** the *privelege* layer is wide open (Supabase's default template). **RLS is the only thing closing it**, and RLS currently closes it — see §11.

---

## 6. CHECK 6 — SEQUENCE PRIVILEGES → **F**

| Scope | Result |
|---|---|
| Existing `public` sequences — anon/authenticated ACL entries | **none** (query returned 0 rows) |
| Future (default ACL) sequences in `public` | anon + authenticated granted **USAGE, SELECT, UPDATE** |
| `storage` schema sequences | anon + authenticated granted **USAGE, SELECT, UPDATE** |

**Verdict:** existing sequences are clean; *future* sequences will be granted automatically (§10).

---

## 7. CHECK 7 — FUNCTION / RPC EXPOSURE → **G**

**The entire `public` schema contains only 10 functions** (6 SECURITY DEFINER). Nothing data-returning is reachable by anon.

| Function | Args | SECDEF | SECDEF owner | `search_path` | anon EXEC | auth EXEC | RPC-reachable? | Effect with NULL identity |
|---|---|---|---|---|---|---|---|---|
| `can_access_business` | `uuid` | **yes** | postgres | `public` | **yes** | yes | **yes** | returns `false` (proven) |
| `current_app_role` | — | **yes** | postgres | `public` | **yes** | yes | **yes** | returns `NULL` (proven) |
| `is_super_admin` | — | **yes** | postgres | `public` | **yes** | yes | **yes** | returns `false` (proven) |
| `can_assign_document_to_profile` | `uuid,uuid,uuid` | **yes** | postgres | `public` | **no** | yes | authenticated only | — |
| `handle_new_user` | — | **yes** | postgres | `public` | yes | yes | **no** (trigger fn) | not invocable directly |
| `rls_auto_enable` | — | **yes** | postgres | `pg_catalog` | yes | yes | **no** (event-trigger fn) | not invocable directly |
| `business_facts_append_only` | — | no | — | not set | yes | yes | **no** (trigger fn) | not invocable directly |
| `update_business_decisions_updated_at` | — | no | — | not set | yes | yes | **no** (trigger fn) | not invocable directly |
| `match_knowledge_chunks` | (vector search) | no | — | not set | yes | yes | yes | SECURITY **INVOKER** → underlying `knowledge_*` tables are RLS deny-all → **0 rows** |
| `search_knowledge_articles` | — | no | — | not set | yes | yes | yes | as above → **0 rows** |

`valuation` schema (14 functions, all SECURITY DEFINER, `search_path = valuation, public`):

| Function | anon EXEC | auth EXEC |
|---|---|---|
| `can_view_valuation`, `can_edit_valuation`, `can_publish_valuation`, `current_profile_id`, `has_business_access`, `is_advisor_or_admin`, `getsharedclientsummary`, `protect_published_version`, `update_updated_at` | **false** | true |
| `can_create_valuation`, `can_archive_valuation`, `can_restore_valuation`, `can_manage_assignments` | **true** | true |
| **`publishvaluation`** | **false** | **false** (service_role only) |

**Unreachable in practice:** `anon` has **no USAGE on the `valuation` schema** (§9), so PostgREST cannot call any `valuation.*` function as anon regardless of EXECUTE.

**Verdict:** **no anon-reachable, RLS-bypassing, data-returning RPC exists.** The three anon-executable SECURITY DEFINER helpers in `public` return only a boolean/NULL about a NULL identity; two knowledge functions are SECURITY **INVOKER** and therefore RLS-blocked; four are trigger/event-trigger functions that Postgres refuses to invoke via RPC. **Flagged for hygiene (not exploit):** trigger functions should not carry the default `PUBLIC EXECUTE` (no REVOKE was applied), and four `valuation.*` helpers are needlessly anon-executable.

---

## 8. CHECK 8 — SECURITY DEFINER INVENTORY → **H**

| Schema | Function | Owner | `search_path` | anon EXEC | notes |
|---|---|---|---|---|---|
| public | `can_access_business` | postgres | **`public` (pinned ✓)** | yes | the single authorization primitive behind 21 policies; **auth.uid()-based** |
| public | `current_app_role` | postgres | `public` ✓ | yes | `select app_role from profiles where id = auth.uid()` |
| public | `is_super_admin` | postgres | `public` ✓ | yes | wraps `current_app_role()` |
| public | `can_assign_document_to_profile` | postgres | `public` ✓ | **no** | document-assignment guard |
| public | `handle_new_user` | postgres | `public` ✓ | yes | **trigger**: creates `profiles` (+ business) on Supabase signup |
| public | `rls_auto_enable` | postgres | `pg_catalog` ✓ | yes | **event trigger**: auto-enables RLS on new tables |
| valuation | `can_view/edit/publish_valuation`, `current_profile_id`, `has_business_access`, `is_advisor_or_admin`, `getsharedclientsummary`, `protect_published_version`, `update_updated_at`, `can_create/archive/restore_valuation`, `can_manage_assignments`, `publishvaluation` (14 total) | postgres | **`valuation, public` ✓** | mostly **no** (4 yes) | all pin `search_path` correctly |

**All 20 SECURITY DEFINER functions pin `search_path`** — the classic `SECURITY DEFINER` hijack vector is **closed**.
**Every one of them derives authorization from `auth.uid()`**, i.e. from an identity that does not exist in this architecture (§11). None of them bypasses RLS to return business data to an anonymous caller.

---

## 9. CHECK 9 — SCHEMA PRIVILEGES → **I**

| Schema | anon | authenticated | Notes |
|---|---|---|---|
| `public` | **USAGE** | **USAGE** | `USAGE` also granted to `PUBLIC`. **No `CREATE`** for either (CREATE only for `pg_database_owner`/`postgres`) |
| `storage` | **USAGE** | **USAGE** | CREATE only for `dashboard_user`/`supabase_admin`/`supabase_storage_admin` |
| `valuation` | **none** | **USAGE** | → `valuation.*` is **unreachable by anon entirely** |

**Consequence:** `public` and `storage` **are** reachable through PostgREST/Storage API as `anon` — the route exists; **RLS is the gate**. `valuation` is doubly protected (no schema USAGE + auth-only policies).

---

## 10. CHECK 10 — DEFAULT PRIVILEGES → **I** (this is the real forward-looking risk)

`pg_default_acl` shows **existing** default-privilege templates that will apply to **every future object**:

| Schema | Object type | Grantee | Privileges auto-granted |
|---|---|---|---|
| `public` | relation (`r`) | **anon** | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, **TRUNCATE**, UPDATE |
| `public` | relation (`r`) | **authenticated** | same |
| `public` | function (`f`) | **anon**, **authenticated** | **EXECUTE** |
| `public` | sequence (`S`) | **anon**, **authenticated** | USAGE, SELECT, UPDATE |
| `storage` | relation (`r`) | **anon**, **authenticated** | DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, **TRUNCATE**, UPDATE |
| `storage` | function (`f`) | **anon**, **authenticated** | EXECUTE |
| `storage` | sequence (`S`) | **anon**, **authenticated** | USAGE, SELECT, UPDATE |

Each privilege appears **twice**, i.e. two default-ACL entries (two owner templates) apply the same grant.

**Verdict:** **YES — newly created objects in `public` and `storage` automatically receive full anon/authenticated access.**
The reason this does not reopen the boundary today is the **`rls_auto_enable` event trigger**, which automatically turns RLS **on** for every newly created table — and RLS-deny-all beats a wide grant. So new tables land in the same state as the existing ones: **wide grants + RLS on + no policies = deny-all**.
**But the safety of every future table now depends on that one event trigger continuing to exist and fire.** If it is ever dropped, disabled, or bypassed (e.g. a table created while the trigger is disabled, `CREATE TABLE ... AS` edge cases, or a restored/pg_dump-created table), the new table is **instantly world-readable/writable with the public anon key** — with no application-layer signal. This is the single most important structural fragility in the boundary.

---

## 11. CHECK 11 — DIRECT BROWSER CLIENT → **J** (repository only, as instructed)

| Question | Answer |
|---|---|
| Files importing `@supabase/supabase-js` in `src/` | **none** |
| Files calling `.rpc(` | **0** |
| Files calling `.from(` | 16 matches — **every one is `Array.from(...)`** (verified individually) |
| Files touching `.storage` | 1 match — `useDocumentViewer.js:84` reads the **property** `document.storage_bucket` (**not** the Storage API) |
| `createClient(...)` in `src/` | only `@base44/sdk` (`src/api/base44Client.js`) |
| `src/lib/supabaseClient.js` importers | **NO IMPORTERS** (also exports `SUPABASE_URL`, `SUPABASE_ANON_KEY`, sign-in/out, and anon write helpers — dead code) |
| `src/api/base44Client.js` → Supabase references | none |

**Verdict:** **no live browser code issues direct Supabase `.from()`, `.rpc()` or `.storage` calls.** The browser's only data path is the Base44 SDK (27 files use `base44.entities.*`) and Base44 backend functions.
**Consequence for the ledger:** the "direct PostgREST path" is **not exercised by the product at all**. It is a latent surface only, reachable solely by someone who extracts the publishable key from the bundle and hand-crafts REST calls — and RLS then denies them.
**Residual UNKNOWN:** the **deployed bundle was not string-scanned** for an embedded `service_role` key in this phase (source contains none; no `createClient` exists in `src/`). This is the one remaining way a direct path could bypass the kernel, and it requires a bundle scan (§UNKNOWN).

---

## 12. CHECK 12 — BUSINESS_FACTS BOUNDARY → **K**

| Expected (Phase 6C) | Production | Verdict |
|---|---|---|
| RLS enabled | **true** (`business_facts`, `business_fact_evidence`) | **MATCH** |
| `authenticated` SELECT via `can_access_business` | exactly 1 policy each: role `authenticated`, cmd **SELECT**, `using = can_access_business(business_id)` | **MATCH** |
| Zero `authenticated` write policies | **0 INSERT / 0 UPDATE / 0 DELETE policies** | **MATCH** |
| Append-only structural guard | `public.business_facts_append_only` (trigger fn) present | **MATCH** |
| Current rows | `business_facts` = **0 rows** | nothing to leak today |

**What these policies actually do in the current architecture — precisely:**
The predicate is `can_access_business(business_id)`, which resolves `auth.uid()` against `business_entities.profile_id` / `assigned_advisor_id`. Live requests arrive as **`anon`** (browser) or **`service_role`** (backend functions) — the `authenticated` role is **never assumed**, because there is no Supabase Auth session to mint a JWT. Therefore:
1. For the **browser (anon)** the policy is **not even evaluated** — the policy's `TO authenticated` role list excludes `anon`, so access is denied before the predicate runs.
2. For the **backend (`service_role`)** RLS is bypassed by design — the backend reaches these tables without policies, which is the intended path.
3. If a request somehow arrived as `authenticated`, the predicate would evaluate `false` anyway (`auth.uid()` is NULL; `auth.users` is empty).
**Conclusion:** the Phase 6C control is **correctly designed, correctly installed, and currently inert** — it protects nothing at runtime, and it fails *closed* in all three cases. It becomes meaningful only if Supabase Auth is ever activated, at which point its identity semantics (**profiles**-vs-**auth.users** id) would need review (§SEC-033).

---

## 13. CHECK 13 — DOCUMENTS BOUNDARY → **L**

| Resource | anon READ | anon WRITE/UPDATE/DELETE | authenticated READ | authenticated WRITE/UPDATE/DELETE | Derivation |
|---|---|---|---|---|---|
| `public.documents` | **NO** | **NO** | **NO** (in practice) | **NO** | grants: wide ✓ · RLS: **on** · policy: `can_access_business` → false under NULL identity |
| `storage.objects` where `bucket_id='documents'` | **NO** | **NO** | **NO** | **NO** | RLS on, **0 policies = deny-all**; bucket `public=false` |
| `storage.objects` where `bucket_id='client-documents'` | **NO** | **NO** | **NO** | **NO** | same |
| `storage.objects` where `bucket_id='consulting_library_files'` | **NO** | **NO** | **NO** | **NO** | same |

**No direct read/write/delete path exists for either role.** Document bytes are reachable **only** through a backend-minted signed URL (S3.1 path, 900 s) or a previously persisted signed URL — which is exactly what makes **SEC-011 the highest-priority document finding** (§RE-RANK).
**Not tested actively** (deferred by instruction): no REST/Storage request was sent; this is derived from privileges + RLS + policies + bucket privacy, as the brief requires.

---

## 14. CHECK 14 — PROFILES / BUSINESS_ENTITIES BOUNDARY → **M**

| Resource | anon R/U/D | authenticated R/U/D | Gate |
|---|---|---|---|
| `public.profiles` | **NO** | **NO** | 3 policies, all `id = auth.uid() OR is_super_admin()` → false |
| `public.business_entities` | **NO** | **NO** | 3 policies, all `profile_id/assigned_advisor_id = auth.uid() OR is_super_admin() OR team EXISTS` → false |

Both tables hold identity and tenant relationships, and both are **denied to every role that can actually connect**, while remaining fully available to the backend via `service_role`.
**Data at risk if this ever opened:** 8 `profiles` + 9 `business_entities` today (§15). Small volume, total significance.

---

## 15. CHECK 15 — POSTGREST EXPOSURE CLASSIFICATION

| Resource | Classification |
|---|---|
| `public` tables **with** policies (25, incl. `documents`, `profiles`, `business_entities`, `extracted_fields`, `document_analysis`, `advisor_notes`, `dashboard_metrics`, `galileo_conversations`, `profile_financials`) | **DIRECTLY ACCESSIBLE BUT RLS PROTECTED** (policy set evaluates deny-all for every reachable identity) |
| `public` tables **without** policies (40, incl. `business_owners`, `expert_advisor_access`, `roadmap_items`, `saved_playbooks`, `strategy_outcomes`, `team_invites`, `niney_day_sprint_*`, `knowledge_*`) | **DIRECTLY ACCESSIBLE BUT RLS PROTECTED** (RLS on + no policies = deny-all) |
| `business_facts`, `business_fact_evidence`, `document_assignments`, `business_decisions` | **DIRECTLY ACCESSIBLE BUT RLS PROTECTED** (policies `TO authenticated`; `authenticated` is unreachable) |
| `storage.objects` / `storage.buckets` (all 3 buckets) | **DIRECTLY INACCESSIBLE** (RLS on + 0 policies + buckets private) |
| `valuation.*` (29 tables) | **DIRECTLY INACCESSIBLE to anon** (no schema USAGE); RLS-protected to `authenticated` |
| `public` RPC surface (10 functions) | **DIRECTLY ACCESSIBLE BUT INERT** (boolean/NULL results only; no data-returning anon-executable function; trigger functions not invocable) |
| Application-level paths (Base44 functions) | governed by the Security Kernel — see the ledger (unaffected by Boundary 2) |

**"DIRECTLY ACCESSIBLE AND INSUFFICIENTLY PROTECTED": zero resources.**

**Blast radius if the boundary ever opened** (current row counts): `profiles` 8 · `business_entities` 9 · `documents` 67 · `extracted_fields` 80 · `business_facts` 0 · `advisor_notes` 0.

---

## 16. BOUNDARY 2 VERDICT

# **CLOSED**

**Catalog-derived, with the derivation stated:**
1. **Route reachable?** Yes — `anon`/`authenticated` hold `USAGE` on `public` and `storage`, plus full table privileges (`SELECT/INSERT/UPDATE/DELETE/TRUNCATE/…`) on 63–65 tables and on `storage.objects`/`storage.buckets`. The endpoints are open.
2. **Gate?** RLS is **enabled on 65/65 public, 8/8 storage, 29/29 valuation** tables. `storage.objects` has **zero** policies. Every one of the 39 public policies depends on a **non-null `auth.uid()`**.
3. **Can any request satisfy a policy?** **No, provably.** `auth.users` contains **0 rows**, and **0 of 8** `profiles` carry a Supabase `auth_user_id`. No agent can obtain a Supabase identity, so `auth.uid()` is NULL for every possible request → every predicate is false/NULL → **deny-all**. Evaluated directly in-session with a NULL identity: `can_access_business(<any>)` → **false**, `is_super_admin()` → **false**, `current_app_role()` → **NULL**.
4. **Buckets:** all three **private**; no public URL path.
5. **RPC:** no anon-reachable, RLS-bypassing, data-returning function.
6. **Product doesn't even use it:** no browser code performs direct Supabase calls; `src/lib/supabaseClient.js` is dead code.

**Qualifier (why this is not "CLOSED by design"):** the boundary is closed because **no identity exists**, not because access was designed to be denied. It is a *deny-by-default with a permanently dead predicate set* — and it stands on two fragile pillars: (a) an **event trigger** (`rls_auto_enable`) that must keep firing to protect every **future** table, and (b) **default ACLs** that auto-grant full anon/authenticated privileges to every future object. One dropped trigger, or one "make the policies work" change to `can_access_business`, flips the entire surface at once. Hence **SEC-031/032/033** below, which replace SEC-002.

---

## 17. S2 STORAGE VERDICT

# **CONFIRMED EXECUTED**

Independent production evidence, matching the reported manual post-check exactly:

| Reported post-check | Independently measured (catalog) |
|---|---|
| `target_policies_remaining = 0` | **0 policies** in the entire `storage` schema |
| `documents_authenticated_policies_remaining = 0` | `authenticated_read_documents`, `authenticated_update_documents`, `authenticated_upload_documents` — **all ABSENT** |
| `total_storage_object_policies = 0` | `pg_policies` for `storage.objects` = **0** |
| — | `storage.objects` **RLS enabled = true** |
| — | all three buckets `public = false` |

**The repository's `PREPARED, NOT EXECUTED` banner is stale metadata and must not be read as production state.** The ledger's SEC-025 is **resolved and closed**. (Recommendation: annotate the migration file/comments so the banner does not mislead a future reviewer — documentation only, no SQL change.)

---

## 18. RE-RANK — only findings whose severity depends on Boundary 2

| ID | Ledger severity | New severity | Why |
|---|---|---|---|
| **SEC-002** (core tables have no RLS / anon may read them) | **P0 (conditional)** | **CLOSED → P3 (fragility only)** | Falsified. 65/65 tables have RLS; deny-all is proven. Retained only as the *documented assumption* it was. |
| **SEC-025** (S2 unexecuted, bucket posture unverified) | P2 | **CLOSED** | Confirmed executed: 0 object policies, 3/3 buckets private. |
| **SEC-009** (`advisor_assignments` lineage, revocation bypass) | **P1** | **P3 (dormant)** | **The table does not exist in production.** All ~15 code paths (incl. `writeGuard` step 5 and the advisor-scoped queries) fail closed today. Becomes P1 again the moment that table is created. |
| **SEC-014** (no Storage object deletion; orphan objects) | P2 | **P3** | Buckets are private and Storage is deny-all → orphan objects are **not** externally reachable. Now a retention/hygiene cost, not disclosure. |
| **SEC-029** (predictable object paths) | P3 | **P3 (lower)** | Enumeration is pointless without any Storage read path. |
| **SEC-017** (no MIME/size limits) | P2 (UNKNOWN) | **P2 (CONFIRMED)** | `file_size_limit = null`, `allowed_mime_types = null` on all three buckets — no ceiling anywhere. |
| **SEC-011** (persisted 24 h signed URLs + client fallback) | P1 | **P1 — now the #1 document finding** | With direct Storage closed, the signed URL is the **only** path to document bytes. Its 24 h persistence and the viewer's `catch`-fallback are therefore the sole remaining document-confidentiality exposure. Unchanged severity, **raised priority**. |
| **SEC-022** (Galileo/fact scoping app-only) | P2 | **P2 (reduced)** | `business_facts` (0 rows) sits behind `authenticated`-only SELECT policies; `galileo_conversations` is RLS-protected. App-only scoping remains, but no direct amplification. |
| **SEC-027** (inert policies misread as a control) | P3 | **merged into SEC-033** | Same root cause, now evidenced. |
| **SEC-001, 003, 004, 005, 006, 007, 008, 010, 012, 013, 015, 016, 018, 019, 020, 021, 023, 024, 026, 028, 030** | unchanged | **unchanged** | Application-layer findings. Boundary 2 is irrelevant to all of them — and none is affected by this verification. |

### New findings created by this verification

| ID | Severity | Finding |
|---|---|---|
| **SEC-031** | **P2 (latent P0 blast radius)** | Boundary 2 is closed by the *absence of an identity*, not by design. Every future table's safety depends on the `rls_auto_enable` event trigger continuing to fire, while `pg_default_acl` **automatically grants anon/authenticated full DML on every new table**. A single dropped trigger, disabled trigger, or restored table (bypassing the trigger) yields immediate, world-readable/writable tables with the public anon key — with no application-layer signal. |
| **SEC-032** | **P2 (latent P0 blast radius)** | `anon`/`authenticated` hold **TRUNCATE** (plus MAINTAIN/REFERENCES/TRIGGER) on 63 tables and on `storage.objects`. **`TRUNCATE` is not governed by RLS** — it is a pure table-privilege operation. It is not reachable through PostgREST today (no TRUNCATE verb) and no anon-executable function truncates, so it is **NOT currently exploitable** — but it is one function away from total data destruction, and it is entirely unnecessary. |
| **SEC-033** | **P2** | 39 table policies + 20 SECURITY DEFINER helpers + all RLS machinery express an authorization model that **never evaluates for any live request**. This is a control-misstatement risk (auditors and future engineers will read the schema as "protected"), and it carries **activation semantics risk**: if Supabase Auth is ever enabled, `handle_new_user` creates `profiles` rows keyed to `auth.users.id`, at which point these policies would grant **direct PostgREST access on Supabase identity alone — bypassing the entire Base44 Security Kernel** (which resolves identity via `profiles.base44_user_id`). The two identity models would silently disagree. |

### The user's specific question, answered

> *"Does any issue become P0 because direct anon/authenticated PostgREST or Storage access bypasses the application Security Kernel?"*

**NO. Nothing becomes P0 — the opposite occurred.** SEC-002 was the only finding that *would* have become P0, and production evidence **closes** it. There is **no reachable direct path**: the product issues no direct Supabase calls, `anon` access is deny-all under RLS, Storage has zero object policies with private buckets, and no data-returning RPC is anon-executable. The application Security Kernel remains the **only** effective boundary — which is precisely why the kernel findings (SEC-001, SEC-003, SEC-006/007/008) keep their full severity and remain the priority.

---

## 19. NEXT-STEP DECISION

| Option | Verdict |
|---|---|
| **A. Emergency Boundary 2 containment** | **DECLINED — not warranted.** No reachable bypass exists: RLS deny-all proven, 0 Storage policies, private buckets, no browser client, no data-returning anon RPC. There is nothing to contain urgently. |
| **C. Something else outranks both** | **NO.** The boundary verification did not surface a finding more severe than the existing application-layer P0/P1s. SEC-031/032/033 are latent (P2) and *cheaper to fix later* than the live kernel holes. |
| **B. P-S3 — Galileo Context Actor Binding** | **CHOSEN.** SEC-001 remains the only **proven, currently reachable, cross-tenant** issue (a P0 at the application layer), and it is the smallest slice available: one function + one offline harness, no schema, no migration. |

**Deferred (not chosen, ranked immediately after P-S3):** **P-S1.5 — boundary hygiene (SEC-031/032/033).** Because *no live code uses the anon key or the direct PostgREST path*, removing `anon`/`authenticated` table grants, the `TRUNCATE`/`MAINTAIN`/`REFERENCES`/`TRIGGER` privileges, and the future-object default ACLs is a **zero-blast-radius** change that eliminates the entire latent exposure class at once. It does not outrank P-S3 — the kernel hole is live and cross-tenant; this one is latent and unreachable — but it is the cheapest risk-removal available and should be scheduled right after. Recommended shape: **revoke to a minimum (SELECT-only where a policy could ever apply, nothing where none does), remove the unnecessary default ACLs, keep `rls_auto_enable`, and decide explicitly whether the dead policy set is retired or documented as inert.** No code, no product change, no behavior change.

**Not implemented. STOP FOR REVIEW.**

---

## 20. UNKNOWN (honest residuals)

| # | Unknown | Exact check |
|---|---|---|
| U1 | The **deployed bundle was not string-scanned** for an embedded `service_role` key. Source has none and `src/` contains no `createClient`, but the built artifact was not inspected. This is the only remaining path by which a direct client could bypass the kernel. | `curl -s https://the-v-i-s-i-o-n-platform.base44.app/assets/*.js \| grep -Eo "eyJ[A-Za-z0-9_-]{20,}"` and grep the bundle for `service_role`; confirm only the publishable (`anon`) key appears. |
| U2 | PostgREST `db-schemas` config not readable from the catalog (`pgrst.db_schemas` returned `null` for the read-only role). Exposure of `public` is confirmed *indirectly* (schema USAGE + table grants), which is the standard Supabase default. | Supabase dashboard → API settings → "Exposed schemas" (expect `public`, `storage`). |
| U3 | No active HTTP request was sent (deferred by instruction), so "deny-all" is a **catalog-derived** verdict rather than an observed 401/empty response. | §PHASE 2 (below) — to be run only on explicit approval. |
| U4 | Whether any process outside this app connects to this database with the service-role key or a direct Postgres connection (e.g. n8n, GHL, a cron host) — out of scope for both the catalog and the repository. | Inventory integration credentials; rotate if unknown. |

---

## 21. PHASE 2 — DEFERRED ACTIVE BOUNDARY TESTS (⚠ NOT RUN — DO NOT RUN IN THIS PHASE)

Provided for a later, explicitly approved phase. All are non-destructive, external, and require no writes. **These were deliberately NOT executed** — this phase is catalog verification only.

```bash
# 2.1 anon cannot read documents (expect: [] with HTTP 200, or 401/403 — never rows)
curl -s "https://tfrbswfrhrtgfcgonimb.supabase.co/rest/v1/documents?select=id&limit=1" \
  -H "apikey: <PUBLISHABLE_ANON_KEY>" -H "Authorization: Bearer <PUBLISHABLE_ANON_KEY>"

# 2.2 anon cannot read profiles (expect: [])
curl -s "https://tfrbswfrhrtgfcgonimb.supabase.co/rest/v1/profiles?select=id,email&limit=1" \
  -H "apikey: <PUBLISHABLE_ANON_KEY>" -H "Authorization: Bearer <PUBLISHABLE_ANON_KEY>"

# 2.3 anon cannot list storage objects (expect: [])
curl -s "https://tfrbswfrhrtgfcgonimb.supabase.co/storage/v1/object/list/documents" \
  -X POST -H "apikey: <PUBLISHABLE_ANON_KEY>" -H "Authorization: Bearer <PUBLISHABLE_ANON_KEY>" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":1}'

# 2.4 public bucket URL must fail (expect: 400/404, never the file)
curl -s -o /dev/null -w "%{http_code}" \
  "https://tfrbswfrhrtgfcgonimb.supabase.co/storage/v1/object/public/documents/<any_known_path>"
```
**Pass criteria:** 2.1/2.2 return `[]` or an auth error, never rows; 2.3 returns `[]`; 2.4 returns a non-200 with no body. **Any other result = Boundary 2 is OPEN, escalate immediately.**

---

## 22. COMPLIANCE NOTE — CONTROL-STATEMENT CORRECTION

The ledger's Boundary-2 section and SOC 2 "Data protection" line must be corrected before any external use:
- **Was:** "Boundary 2 does not exist… RLS policies are inert; the core tenant tables are not RLS-enabled."
- **Is:** "Boundary 2 **exists and is enforced by deny-all RLS** across all three schemas, with zero Storage object policies and private buckets. It is **closed by the absence of a Supabase identity**, not by design: all 39 public policies are `auth.uid()`-dependent and can never evaluate true, while `anon`/`authenticated` retain full table privileges (including `TRUNCATE`, which RLS does not cover) and default ACLs auto-grant those privileges to every future object."
- **Net effect on the SOC 2 readiness table:** *Least privilege* stays **RED** (wide grants, auto-granting defaults, unnecessary TRUNCATE); *Data protection* improves from ORANGE to **YELLOW** (private buckets + deny-all Storage + deny-all RLS, but closed by accident and undefended against future objects). Nothing else changes — the application-layer ratings stand.

---

**STATUS: P-S1 COMPLETE — READ-ONLY. No product code modified, no migration created, no database change, no permission requested, nothing published. Production catalog evidence obtained via the already-authorized `database:read` scope. STOP FOR REVIEW.**