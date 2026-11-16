# V.I.S.I.O.N. SECURITY LEDGER — POST-P5 CHECKPOINT

**Repository revision inspected:** `2e93066` — "Simplify document resolution logic to require only identity"
**Working tree at inspection:** clean (`git status --porcelain` empty; `main` == `origin/main`, 0/0 divergence)
**Method:** static inspection of the current repository only. No code was modified, no migration created, nothing committed, nothing published. Read-only (`grep` / `sed` / `read_file`) plus the offline test harnesses already in the repo.
**Date:** 2026-10-04

> **Honesty statement.** Everything below is derived from the repository. Where the repository cannot answer a question, the item is marked **UNKNOWN** and listed in §20 with the exact runtime evidence required. No runtime database, Storage bucket, RLS policy state or production row was inspected. P5 production smoke-test results are recorded as **user-reported**, not independently verified by me.

---

## 1. EXECUTIVE SECURITY POSTURE

**Overall: ORANGE — strong, coherent application-layer kernel on a small number of domains; no independent database boundary; two exploitable holes remain open, one of them cross-tenant.**

What is genuinely strong: the reviewed slices (S3 / S3.0 / S3.0.1 / S3.0.2 / S3.1 / P3 / P5) are real, verified in the shipped code, and they share ONE authorization kernel (`actor.ts` → `writeGuard.ts` → `documentAccess.ts` / `relationshipAccess.ts`). Canonical identity cannot be forged from a request body, suspension is enforced centrally, Base44 role no longer elevates VISION standing, relationship revocation is a real predicate, and the document signed-URL path is row-derived, bucket-validated, 404-equivalent and 900-second. Those are the right shapes and they are held in place by mutation-tested harnesses.

What is not: that kernel covers **14 of 138 backend functions**. **122 functions create a Supabase service-role client; 106 of them authenticate only to `base44.auth.me()`** and then perform business/resource authorization ad hoc, partially, or not at all. Service-role is therefore an unrestricted data plane behind inconsistent function-level authorization — the exact structural condition the user suspected. Two concrete gaps are already confirmed in code: an unauthenticated-service-role writer pair (§SEC-012), and **one cross-tenant read of the Galileo context by supplying `profile_id` in the body (§SEC-001)**.

The database boundary does not exist. `auth.uid()` is not resolvable on the Base44 identity model, no live request resolves to the `authenticated` role, and — decisively — the core tenant tables (`documents`, `profiles`, `business_entities`, `extracted_fields`, `document_analysis`, `dashboard_metrics`, `advisor_notes`) are **not RLS-enabled in any migration**. What protects them is the anon key's grant set, which is a project-level default I cannot see from the repository. That single question (§SEC-002 / §20) determines whether the posture is ORANGE or RED.

**Top three, in order:** SEC-001 (cross-tenant Galileo read, tiny fix), SEC-002 (verify the anon grant set — one query), SEC-003 (notification forgery + platform-branded email relay).

---

## 2. VERIFIED COMPLETED CONTROLS

Verified against the repository, not taken on trust. "Verified" = the shipped code contains the control and, where noted, the existing offline harnesses exercise it.

| Claim | Verdict | Evidence |
|---|---|---|
| **S0** Base44 session → `createClientFromRequest` → `base44.auth.me()` → `profiles.base44_user_id` → `profiles.id`; Supabase Auth is NOT the identity provider | **CONFIRMED** | `authz/actor.ts` L90–112 resolves by `base44_user_id` equality, email only as fallback. `valuationService/entry.ts` L48–50 states `profiles.auth_user_id is null for all current profiles`. No `supabase.auth` usage in any backend function. |
| **S0-B** canonical Base44 mapping; no duplicate Base44 IDs; unbound profile carries no business authority | **PARTIAL / UNKNOWN** | Mapping code confirmed (`base44_user_id` first, email fallback). Duplicate-ID audit is a runtime data fact — **not reproducible offline** (§20-Q2). "Unbound profile carries no authority" holds for the kernel (`resolveActingProfile` → 404 when no profile; `authenticateActor` → role `'user'`, `isAdmin:false`), but NOT for every legacy path (SEC-009, SEC-010). |
| **S2** private buckets, direct authenticated Storage policies removed, access brokered by backend | **NOT COMPLETE — PREPARED ONLY** | `phase_s2_storage_containment.sql` L4 carries the banner `PREPARED, NOT EXECUTED. RUN MANUALLY`. The three `authenticated_*_documents` policies are still merely scheduled for `drop policy` (L124–126). Bucket privacy is therefore **UNVERIFIED** (§20-Q3). All 17 live Storage operations do use service-role (confirmed by grep). |
| **S3** `getDocumentsAdmin` hardened: row-derived tenant, delete separated from view, explicit bucket | **CONFIRMED** | `getDocumentsAdmin/entry.ts` — `authenticateActor`, `loadAuthorizedDocument(sb, actor, body.document_id, 'delete'|'view')`, `isApprovedDocumentBucket`, `createSignedUrl(..., 900)`. Pinned by `src/scripts/getDocumentsAdmin.s3.mock.test.cjs` (50/50) and the S6/S10 invariants in `adminCanonicalActor.test.cjs`. |
| **P1/P2** Admin subject independent of `activeBusinessId`; workspace-level Admin authorization | **CONFIRMED** | `AdminWorkspaceHost.jsx` + `RequireAdminRole` + `AdminView` subject model; no `activeBusinessId` write in the Admin document path (`adminDocumentViewer.test.cjs` P7/P8). |
| **P3** canonical Admin actor resolution; client-supplied profile scope normalized | **CONFIRMED** | `supabaseUserData/entry.ts` L169–191: one `authenticateActor`, one `resolveActingProfile`, `getProfile = async () => override.profile`, `isCanonicalAdmin` from `actor.profile.app_role`. `adminCanonicalActor.test.cjs` (125 checks, matrix A–R). |
| **S3.0** suspension gate, centrally | **CONFIRMED** | `actor.ts` L122–124, before role derivation. Harness cases ST6–ST11 incl. suspended + Base44 admin. |
| **S3.0.1** Base44 `user.role` removed from VISION Admin authority | **CONFIRMED in the kernel** | `actor.ts` L126–139 uses `appRole` only; `isAdmin: ADMIN_ROLES.includes(appRole)`. Harness CA4–CA9, CA14. **But** two privileged functions still authorize on the Base44 role (SEC-013). |
| **S3.0.2** relationship revocation: `access_status='active'` AND `revoked_at IS NULL` | **CONFIRMED** | `relationshipAccess.ts` — DB filter (`.eq access_status .is revoked_at null .limit(1)`) **plus** the predicate on the returned row. `writeGuard` step 6 delegates to it. Harness 78/78 incl. drift cases R20/R20b. |
| **S3.1** unified document signed-URL authorization | **CONFIRMED** | `supabaseUserData/entry.ts` L1428–1486: row loaded first, `authorizeDocumentAccess`, `assertBusinessAccess` injected, approved-bucket-only with no fallback, 900s, deny ≡ nonexistent ≡ 404. No `advisor_assignments` in this action. 103-case harness. |
| **P5** Admin exact-document viewer | **CONFIRMED** (code) / user-reported (production) | `AdminUserProfileContext.jsx` L104 `if (!doc?.id) return;` + `file_url: null` normalization; `canOpen = Boolean(doc?.id)`. 56/56 harness incl. P19–P24 and mutations M4/M13/M15–M17. Production smoke tests A–E reported passed by the user; not independently reproduced by me. |

**Correction to the supplied "known completed" list:** S2 cannot be counted as complete. Everything else in the list survives verification, with the S0-B duplicate check downgraded to UNKNOWN.

---

## 3. SECURITY LEDGER

Column split for readability only — every requested column appears across the two tables.

### 3a. Findings

| ID | Severity | Domain | Finding | Live status | Current control | Missing control | Confidence |
|---|---|---|---|---|---|---|---|
| SEC-001 | **P0** | Galileo / IDOR | `buildGalileoContext` accepts `profile_id` **and** `business_id` from the request body. When `profile_id` is supplied, the session is never used to resolve the actor; the owner check becomes `profile.primary_business_id === business_id` using the *supplied* profile. | LIVE / REACHABLE | `auth.me()` presence only; `requireBusinessContext` runs **only** on the no-`profile_id` branch | Actor from session; authorize the supplied profile/business through `resolveActingProfile` + `requireBusinessContext` | HIGH (code) |
| SEC-002 | **P0 (conditional)** | DB / RLS boundary | Core tenant tables (`documents`, `profiles`, `business_entities`, `extracted_fields`, `document_analysis`, `dashboard_metrics`, `advisor_notes`) are **not RLS-enabled in any migration**; no `GRANT … TO anon` appears anywhere. Exposure then depends entirely on the project's default anon grants, and the anon key ships in the browser bundle. | UNKNOWN (runtime) | Boundary 1 only | Boundary 2 (RLS) or a verified anon deny | MEDIUM-HIGH (one query decides) |
| SEC-003 | **P1** | Notifications / email | `notificationService.createNotification` performs **no sender authorization** and no recipient-relationship check. Any authenticated user can write a notification for any `recipient_id`, with arbitrary `title`/`message`/`action_url`/`metadata`, and can trigger `SendEmail` to an arbitrary `data.recipient_email` whose HTML interpolates those values unescaped. | LIVE / REACHABLE | Recipient *preferences* only (suppression, not authorization) | Sender authority; recipient relationship; server-owned templates; escaping; no client-chosen email target | HIGH |
| SEC-004 | **P1** | Service-role containment | **122 of 138 functions create a service-role client; 106 authenticate only via `auth.me()` with no canonical actor/business/resource primitive** (~70 of them have no scope primitive at all). Service-role therefore behaves as an unrestricted data plane behind inconsistent function-level authorization. | LIVE / REACHABLE | Per-function, ad-hoc (`user.role`, ad-hoc joins) | One kernel: `authenticateActor` → `resolveActingProfile` → `authorizeBusinessAccess` → resource load → op | HIGH |
| SEC-005 | **P1** | Privileged operations | **33 diagnostic / backfill / migration-family functions** are callable by any authenticated session with no canonical admin gate: `debugSupabaseWrite`, `probeProfileFinancials`, `rawSchemaCheck`, `schemaAudit(S)/detailedSchemaAudit`, `diagSprint*`, `worksheetDataAudit`, `valuationSchemaProbe`, `fixWorksheetAssignmentsSchema`, `addSystemFolderColumn`, `createStrategyIntelligenceTables`, `runStrategyNormalizationMigration`, `resetDocumentAnalysisStatus`, 5× `backfill*`, `test*`. Several perform DDL/DML or schema migration. | LIVE / REACHABLE | `auth.me()` only in most | `ADMIN_ROLES.includes(actor.profile.app_role)` + super-admin for DDL | HIGH (classification), MEDIUM (per-function impact) |
| SEC-006 | **P1** | Documents / analysis | `checkDocumentAnalysisById` performs **no authorization at all**: `select('*')` on `document_analysis` by client-supplied id using service-role. | LIVE / REACHABLE | none | Load row → derive tenant → authorize actor | HIGH |
| SEC-007 | **P1** | Documents / IDOR | `createDocumentAnalysis` takes `profile_id` from the body and compares it to `doc.profile_id` (client-supplied identity), and `business_id: business_id \|\| doc.business_id` lets the body **override the document's tenant** on the new analysis row; it also mutates `documents.upload_status`. | LIVE / REACHABLE | `doc.profile_id !== profile_id` only (both client-supplied) | Actor-derived identity; tenant from the document row only | HIGH |
| SEC-008 | **P1** | Documents / integrity | `updateDocumentAnalysisStatus` verifies only that the document exists, then updates `document_analysis.status` for any `document_id` supplied. No ownership, no business scope. | LIVE / REACHABLE | existence check | Ownership/business authorization | HIGH |
| SEC-009 | **P1** | Business access | The `advisor_assignments` lineage is still an authorization input in ~15 live places: `writeGuard` step 5 grants on **row existence with only `status !== 'revoked'`** (no `revoked_at`, no `access_status='active'` requirement), and 8 functions (`supabaseUserData` ×7, `supabaseDocumentData` ×2, `supabaseVerificationData` ×4, `supabaseOpportunityData` ×2, `generateNextBestActions`, `worksheetResponses`, `updateExtractedFieldReview`, `uploadDocumentToSupabase`, `runDocumentExtraction`) scope reads by `advisor_profile_id` with **no revocation filter**. | LIVE / REACHABLE (conditional on the table existing — see below) | row existence / tenant filter | The S3.0.2 predicate (active AND not revoked) or retirement of the table | MEDIUM |
| SEC-010 | **P1** | Business access | `profiles.primary_business_id` is used as **authorization authority**, not just default selection, in 4 live paths: `activeBusiness.resolveActiveBusiness` L88 skips `validateBusinessScope` when the requested business equals it; `assertBusinessAccess` L187 returns immediately; `valuationShared.requireBusinessAccess` L82 and `valuationEngine/valuationAuth.requireBusinessAccess` L92 return `true`; `buildGalileoContext` L73 makes it the whole owner rule. | LIVE / REACHABLE | value equality | Ownership/relationship re-check whenever the value is used as authority | HIGH (code) / UNKNOWN (clearing behaviour) |
| SEC-011 | **P1** | Documents / revocation | `documents.file_url` persists a **24-hour signed Storage URL** (`uploadDocumentToSupabase` 86400, `adminUploadDocument` 86400, `adminUploadLibraryFile` 86400; `googleDriveImport` 3600; `extractEngine` 300). The shared viewer falls back to it — `useDocumentViewer` L25 (`file_url && !file_path`) and, critically, **L53 in the `catch` block returns `document.file_url` after a failed/denied call**; `DocumentViewer.jsx` L56 and `AssignedResourceCard.jsx` L39 (`res.data?.signedUrl \|\| resource.file_url`) do the same. | LIVE / REACHABLE (Admin path neutralized by P5) | P5 passes `file_url: null` at the Admin call site only | Server-only resolution; no client URL fallback; never persist signed URLs | HIGH |
| SEC-012 | **P1** | Service-role / auth | Two service-role writers accept invocation **without any authentication**: `onSprintItemCompleted`, `onRoadmapItemCompleted` (no `auth.me()`, no token check). Both re-read the authoritative record (the cross-tenant scope hole was deliberately closed), so the residual impact is forged derived writes / forced state transitions by an unauthenticated caller. | LIVE / REACHABLE | server-side re-read of the record | authentication (or a workflow-only shared secret) | HIGH (code), MEDIUM (impact) |
| SEC-013 | **P2** | Privileged ops | Authorization still derived from the **Base44** `user.role` in privileged functions: `notificationService` (`isAdmin = user.role === 'admin' \|\| 'super_admin'` → cross-user read/modify of any notification) and `teamInvites.createInvite` (`user.role !== 'admin' && !== 'super_admin' && !== 'owner'`; the body's `role` is passed to `base44.users.inviteUser`). Diverges from S3.0.1. | LIVE / REACHABLE | Base44 role | `actor.isAdmin` / `actor.isSuperAdmin` from `profiles.app_role`; server-owned invite role policy | HIGH |
| SEC-014 | **P2** | Retention / Storage | `deleteDocument` deletes `document_analysis` rows then the `documents` row, with **no Storage object removal** — the only `.storage …remove()` in the codebase is in `guestSessionService`. Deleted documents leave readable objects in the bucket. | LIVE / REACHABLE | none | Storage delete on document delete; orphan sweep | HIGH |
| SEC-015 | **P2** | Audit / evidence | No audit trail exists for document view/download/delete/assign, role change, admin action, export, notification mutation or fact verification. Only valuation paths audit (`valuation_audit_log`, `valuation_request_events`); BIE/meeting/business-memory have internal trails; `LiveSyncAction` records sync decisions. | LIVE | valuation-only | Security event log keyed by actor/session/resource/action | HIGH |
| SEC-016 | **P2** | Operational security | Raw error text returned to callers in 12+ functions, and `runStrategyNormalizationMigration` returns `stack` as well. | LIVE | none | Opaque client errors; server-side logging | HIGH |
| SEC-017 | **P2** | Document integrity | No MIME allowlist, size cap or malware scan is visible in the upload functions; bucket `allowed_mime_types` / `file_size_limit` cannot be read from the repo. `upsert:false` is set (no overwrite). | LIVE | `safeFileName`; scope checks | MIME/size limits at bucket + function; scanning; quarantine | MEDIUM |
| SEC-018 | **P2** | Valuation | **Three parallel authorization implementations** for the same domain: `shared/valuationEngine/valuationAuth.ts`, `shared/valuationShared/entry.ts` (`requireBusinessAccess`), and `valuationService` inline (`requireValuation*`). Drift risk; two of the three contain the `primary_business_id` short-circuit. | LIVE | each its own | one valuation authorization module | HIGH |
| SEC-019 | **P2** | Admin surface | Backend admin gates exist where they were reviewed (`supabaseProfileData.updateProfileRole` L173–182, `getDocumentsAdmin`, `supabaseUserData` ×2 `isCanonicalAdmin`), but most privileged functions rely on Base44 roles or ad-hoc flags. UI hiding is still load-bearing in places. | LIVE | mixed | uniform canonical admin gate on every privileged action | HIGH |
| SEC-020 | **P2** | User data | `searchAssignableUsers` has no scope primitive (enumeration of app users by query). `notifyAdminsNewUser`, `teamInvites.listInvites` similar. | LIVE | auth only | scope + minimal projection | MEDIUM |
| SEC-021 | **P2** | Expert access | `expertAdvisorAccess` (grant/revoke) uses `auth.me()` + scope + an admin-ish flag rather than `authenticateActor`; its revocation semantics are sound at the writer, but the *consumers* (SEC-009) are not uniform. | LIVE | writer-correct, consumer-inconsistent | kernel adoption | MEDIUM |
| SEC-022 | **P2** | Galileo | `galileo_conversations` is RLS-enabled in a migration, but boundary 2 is inert (SEC-002); Galileo conversation scoping is therefore application-only. `buildGalileoContext` also reads `advisor_notes` by the supplied `profile_id` (follows SEC-001). | LIVE | app-layer | Boundary 2 or actor binding | HIGH |
| SEC-023 | **P2** | Integrations / engines | Functions with a body-supplied `business_id` and no canonical scope primitive: `liveSyncOrchestrator`, `whatIfEngine`, `freedomEngine`, `galileoOpportunityEngine`, `generateGalileoInsights`, `valuationRequestService`, `protectionGapEngine` (has scope), `reportingQualityEngine` (has scope) — per-function verdicts UNKNOWN pending a dedicated read. | LIVE / UNKNOWN | mixed | kernel adoption per function | LOW-MEDIUM |
| SEC-024 | **P2** | Business access | `getUploadSignedUrl` auto-creates a `business_entities` row named "My Business" and **writes `profiles.primary_business_id`** when the profile has none — a self-service path that sets the very value SEC-010 treats as authority. | LIVE | auth only | keep `primary_business_id` identity-only | MEDIUM |
| SEC-025 | **P2** | Storage | The S2 containment migration is unexecuted, so the three `authenticated` Storage policies on `documents` still exist, and bucket privacy/`allowed_mime_types` are unverified. | UNKNOWN (runtime) | service-role only (by luck of role resolution) | execute + verify S2 | MEDIUM |
| SEC-026 | **P3** | Dead code | `src/lib/supabaseClient.js` has **no importers** (only a self-referencing `TEST_PROFILE_ID = 'test-profile-001'`), yet contains anon-key write helpers for `assessment_sessions`, `assessment_answers`, `assessment_calculations`, `gap_analysis`, `profile_financials`. Dead today; a P1 anon-write vector if revived. | DEAD / UNREFERENCED | — | delete or re-home behind a backend function | HIGH |
| SEC-027 | **P3** | RLS hygiene | Policies keyed on `auth.uid()` (e.g. `bie_persistence.sql`, `business_valuation.sql` `valuation.current_profile_id()`) can never match under the Base44 identity model. They are misleading control surface. | LIVE but inert | — | document as inert or replace with a service-role-only model | HIGH |
| SEC-028 | **P3** | Verification debt | `phase_s2_storage_containment_verification.sql` and the migration's own precondition guard are pending; `sprint_verification_columns` / `ninety_day_sprint_paths` column drift (5 columns) remains. | OPEN | — | run the read-only verifier | MEDIUM |
| SEC-029 | **P3** | Document paths | Object paths are `<profile_id>/<business_id|household|hybrid|profile>/<timestamp>_<name>` — tenant-prefixed (good) but predictable and non-opaque. | LIVE | prefix = tenant | opaque ids if enumeration becomes possible | MEDIUM |
| SEC-030 | **P3** | Known debt | `businessContextContract` fails on `ownershipConcentrationEngine` (no canonical import). Pre-existing; explicitly retained, not to be fixed in this phase. | KNOWN | — | later slice | HIGH |

### 3b. Risk attributes

| ID | Attack path | Affected resources | Likelihood | Impact | Blast radius | Remediation | Dependencies | Suggested phase |
|---|---|---|---|---|---|---|---|---|
| SEC-001 | Auth'd user → `functions.invoke('buildGalileoContext', {profile_id: <victim>, business_id: <victim biz>})` → owner rule compares victim's primary business to the supplied business → full context returned | `business_entities`, `dashboard_metrics`, `business_metric_snapshots`, `business_assessments`, `business_opportunities`, `next_best_actions`, `roadmap_items`, `value_creation_events`, `documents` (metadata), `advisor_notes`, `extracted_fields` | Medium (needs two UUIDs) | Very high (confidential financials + notes) | Any single business | Bind actor via `authenticateActor` + `resolveActingProfile`; authorize business via `requireBusinessContext`/`validateBusinessScope` | none | **NEXT SLICE** |
| SEC-002 | Anyone with the public bundle's anon key → PostgREST → core tables (no RLS in migrations) → read/write per project defaults | profiles, documents, business_entities, extracted_fields, document_analysis, dashboard_metrics, advisor_notes | UNKNOWN | Very high | Whole tenant base | Verify grants; enable RLS or revoke anon table privileges; keep service-role-only access | runtime evidence | **P-S1 (verify first)** |
| SEC-003 | Auth'd user → `notificationService createNotification` with victim `recipient_id` **and/or** arbitrary `recipient_email` + `title`/`message`/`action_url` → forged notification + platform-branded email with attacker link | Notification rows, outbound email, recipient trust | High | High (phishing; forged system messages) | Any app user (+ arbitrary external addresses if allowed) | Require sender authority + recipient relationship; server-owned templates; escape; never accept client email targets | none | P-S3 |
| SEC-004 | Any auth'd user → any of ~70 loosely-gated service-role functions → data plane per function's own (missing) checks | every Supabase table/bucket | High (systemic) | High | Whole tenant base | Kernel adoption per domain, prioritised by data class | SEC-001..SEC-008 | P-S3…P-S7 |
| SEC-005 | Auth'd user → `functions.invoke('backfillBase44UsersToProfiles' / 'fixWorksheetAssignmentsSchema' / 'runStrategyNormalizationMigration')` → data/DDL mutation | many tables; schema | High | High | Whole tenant base | Canonical super-admin gate; retire or move to a runbook | none | P-S4 |
| SEC-006 | Auth'd user with an analysis id → read extraction data (`select *`) | `document_analysis` | Medium | High | Any business's documents | row-derived authorization | none | P-S2 |
| SEC-007 | Auth'd user with `document_id` (+owner `profile_id`) → analysis row written with attacker-chosen `business_id`; victim document state flipped | `document_analysis`, `documents.upload_status` | Medium | High | Any business | actor-derived identity; tenant from row | none | P-S2 |
| SEC-008 | Auth'd user → arbitrary `document_id` → status mutated | `document_analysis` | Medium | Medium (integrity/availability) | Any business | ownership/business check | none | P-S2 |
| SEC-009 | Revoked/stale advisor (or anyone holding a row) → advisor-scoped queries without a revocation filter → documents/facts/roadmap of that business | documents, extracted_fields, roadmap_items, value_creation_events, next_best_actions | Medium | High | Advisors' client set | S3.0.2 predicate everywhere, or retire the table | table existence (§20-Q4) | P-S3 |
| SEC-010 | Former owner (ownership moved/removed, `primary_business_id` unchanged) → short-circuits every guard → read/write that business | all business-scoped tables (valuation included) | Medium | High | Specific business | re-check ownership whenever the value is used as authority | §20-Q5 | P-S3 |
| SEC-011 | User whose access was revoked keeps a ≤24h signed URL (or one captured earlier) → Storage read with no backend authorization | Storage `documents` objects | Medium | High | Business documents | remove client fallbacks; stop persisting signed URLs | none | P-S5 |
| SEC-012 | Unauthenticated caller → `onSprintItemCompleted`/`onRoadmapItemCompleted` → derived writes/state transitions | strategy_outcomes, value_creation_events | Medium | Medium | Any record by id | require authentication or a workflow secret | none | P-S6 |
| SEC-013 | Base44-admin-flagged (non-canonical) user → notification read/modify any user; invite creation with arbitrary `role` | Notification rows; team_invites; invites | Medium | Medium | Whole tenant base | canonical authority | none | P-S6 |
| SEC-014 | Deleted document → object remains readable while a URL exists | Storage objects | High | Medium (retention) | Business documents | storage delete + sweep | SEC-011 | P-S6 |
| SEC-015 | No actor-resolved trail for document/role/admin actions | — | Certain | High (audit failure) | Whole platform | security event log | kernel | P-S7 |
| SEC-016 | Auth'd user → error text/stack | schema internals | High | Low-Medium | — | opaque errors | none | P-S6 |
| SEC-017 | Upload of arbitrary MIME/size; no scanning | Storage, downstream parsers | Medium | Medium | Business documents | bucket + function limits | S2 | P-S6 |
| SEC-018 | Drift between three valuation auth models (one of which has the primary-business short-circuit) | valuation.* | Medium | High | Valuation data | single module | — | P-S4 |
| SEC-019 | Privileged function authorised by Base44 role/flag | admin surfaces | Medium | High | Whole platform | canonical gate everywhere | actor kernel | P-S4 |
| SEC-020 | User enumeration via `searchAssignableUsers` | profile identity | Medium | Low-Medium | All users | scope + projection | — | P-S6 |
| SEC-021 | Consumer/ writer mismatch on expert access | expert access | Low-Medium | High | Expert-reachable businesses | kernel adoption | SEC-009 | P-S3 |
| SEC-022 | Conversation/fact scoping is app-only; inert RLS | galileo_conversations, facts | Medium | Medium | Tenant data | Boundary 2 or app-only acceptance | SEC-002 | P-S7 |
| SEC-023 | Unknown per-function authorization on engines consuming body `business_id` | various | UNKNOWN | UNKNOWN | Business scoped | per-function review | — | P-S5 |
| SEC-024 | Self-service profile write sets `primary_business_id` → later treated as authority | profiles, business_entities | Medium | Medium | Own business today, escalates with SEC-010 | keep identity-only | — | P-S3 |
| SEC-025 | Unexecuted containment; bucket posture unverified | Storage | UNKNOWN | High | Documents | execute + verify | runtime | P-S1 |
| SEC-026 | Dead anon-write client revived | assessments, profile_financials | Low | High | Tenant data | delete | — | P-S8 |
| SEC-027 | Inert policies misread as a control | — | Certain | Low | — | document | — | P-S8 |
| SEC-028 | Verification scripts pending | — | Medium | Low | — | run them | — | P-S1 |
| SEC-029 | Predictable object paths assist enumeration if a listing gap appears | Storage objects | Low | Medium | Documents | opaque ids | SEC-002 | P-S8 |
| SEC-030 | Contract failure | — | Certain | Low | — | later | — | retained |

---

## 4. TOP 10 REALISTIC ATTACK PATHS

Only paths supported by current code are listed; each names its precondition.

1. **Cross-tenant Galileo read (P0, SEC-001).** Auth'd owner → `buildGalileoContext` with a victim `profile_id` + that profile's `primary_business_id` → the owner branch compares the *victim's* primary business to the *supplied* business and passes → the full intelligence context (financials, snapshots, assessments, opportunities, NBA, roadmap, value events, document metadata, advisor notes, extracted fields) for another business is returned. Precondition: two UUIDs (profile ids appear in notification/assignment payloads and rosters).
2. **Anon-key direct table access (P0-conditional, SEC-002).** Holder of the published bundle → anon key → PostgREST on a core table with no RLS and (if default grants apply) no policy gate → read/write tenant data. Precondition: project grants anon on `public` tables — one query resolves it.
3. **Forged notification + branded phishing email (P1, SEC-003).** Auth'd user → `createNotification` naming any `recipient_id` and supplying `recipient_email`, `title`, `message`, `action_url` → victim's bell shows a system-styled message and the victim receives an email from the platform's brand containing the attacker's link.
4. **Document analysis read/write chain (P1, SEC-006/007/008).** Auth'd user → `checkDocumentAnalysisById` with an analysis id → extraction data; or `createDocumentAnalysis` with `document_id` + owner `profile_id` + chosen `business_id` → an analysis row is written against a tenant they have no relationship with and the victim's `upload_status` is flipped; or `updateDocumentAnalysisStatus` mutates any document's status.
5. **Revoked advisor retains business scope (P1, SEC-009).** Advisor with a revoked/legacy `advisor_assignments` row → advisor-scoped queries in 8 functions filter only by `advisor_profile_id` → documents, extracted fields, roadmap items, value events and NBA of that business remain visible. Precondition: the table exists and holds the row (UNKNOWN).
6. **Former owner retains `primary_business_id` authority (P1, SEC-010).** After ownership transfer, the old owner's `profiles.primary_business_id` still short-circuits `resolveActiveBusiness` / `assertBusinessAccess` / `requireBusinessAccess` → continued business and valuation access, including writes.
7. **Post-revocation document access via persisted signed URL (P1, SEC-011).** User revoked (or whose backend call is denied) → viewer's `catch` returns the previously persisted 24h `file_url` → the object still renders with no authorization for up to 24 h; also `AssignedResourceCard` prefers `resource.file_url`.
8. **Unauthenticated derived-write (P1, SEC-012).** Anyone → `onSprintItemCompleted` / `onRoadmapItemCompleted` with a record id → derived outcome/event rows and state transitions without a session.
9. **Backfill/migration execution by any authenticated user (P1, SEC-005).** Auth'd user → `backfillBase44UsersToProfiles`, `fixWorksheetAssignmentsSchema`, `runStrategyNormalizationMigration`, `addSystemFolderColumn`, `createStrategyIntelligenceTables` → bulk data/DDL mutation, plus schema disclosure via `rawSchemaCheck`/`schemaAudit`.
10. **Base44-role privilege within a VISION tenant (P2, SEC-013).** A user whose Base44 record carries `admin`/`super_admin` but whose canonical `profiles.app_role` does not → `notificationService` treats them as admin (read/modify any user's notifications, analytics) and `teamInvites` lets them create invites with a chosen role.

Not listed because unsupported by the code as read: cross-bucket document retrieval (S3.1 rejects unapproved buckets with no fallback); forging VISION admin authority through the request body in the reviewed router (P3/S3.0.1 hold); relationship revocation bypass in `expert_advisor_access` (S3.0.2 holds).

---

## 5. SECURITY KERNEL ADOPTION MATRIX

`FULL` = `authenticateActor` → (`resolveActingProfile`) → `validateBusinessScope`/`assertBusinessAccess` → resource load → operation. `PARTIAL` = some primitives. `LEGACY` = its own identity/role/authorization model. `NONE` = no authorization beyond authentication.

| Domain | Class | Evidence |
|---|---|---|
| **Documents (view/delete/signed URL)** | **FULL** | `supabaseUserData.getDocumentSignedUrl`/`deleteDocument`, `getDocumentsAdmin` |
| **Documents (analysis write/status)** | **NONE** | `createDocumentAnalysis`, `updateDocumentAnalysisStatus`, `checkDocumentAnalysisById` |
| **Documents (upload)** | **PARTIAL** | `uploadDocumentToSupabase` (scope + advisor row), `adminUploadDocument`, `adminUploadLibraryFile` (no scope), `getUploadSignedUrl` (auth only) |
| **Documents (assign/review/verify)** | **PARTIAL** | `documentAssignments` FULL; `worksheetResponses`, `updateExtractedFieldReview`, `runDocumentExtraction` use the advisor row |
| **Facts / extracted fields** | **PARTIAL** | business-scoped reads, advisor-row scoping, no actor kernel in the engines |
| **Valuation** | **LEGACY (substantive)** | three parallel models (SEC-018); `valuation_assignments` gates internal ops; `primary_business_id` short-circuit |
| **Dashboard** | **PARTIAL** | `supabaseDashboardData` FULL; `regenerateCiqMetrics`, `forceUpdateDashboardMetrics`, `hydrateDashboardFromJourney` scope-or-auth only |
| **Assessments** | **PARTIAL** | `saveAssessmentToSupabase` (scope); assessment engines mostly read body `business_id` |
| **Opportunities** | **PARTIAL** | `supabaseOpportunityData` FULL; `galileoOpportunityEngine`, `generateOpportunities` auth+scope |
| **Playbooks** | **PARTIAL** | `savedPlaybookData` FULL |
| **Sprints** | **PARTIAL** | `ninetyDaySprint` uses actor+acting-profile; `assignSprintVerifier`, `getSprintVerificationQueue`, `onSprint*` do not |
| **Advisor notes** | **PARTIAL** | written through `supabaseProfileData` (kernel); read by `buildGalileoContext` (SEC-001) |
| **Team** | **LEGACY** | `teamInvites` (Base44 role), `searchAssignableUsers` (auth only) |
| **Expert access** | **PARTIAL** | writer sound; consumers inconsistent (SEC-009/021) |
| **Integrations** | **LEGACY** | `googleDriveImport` (scope), `integrateGoHighLevel`, `liveSyncOrchestrator`, `calendarService` |
| **Galileo** | **PARTIAL** | `askGalileo` scope; `buildGalileoContext` **broken** (SEC-001) |
| **Notifications** | **LEGACY** | `notificationService` (Base44 role, no sender authority) |
| **Reports / digests** | **PARTIAL** | `generateWeeklyDigest`, `weeklyDigest` scope |
| **Admin** | **PARTIAL** | `supabaseProfileData`, `supabaseUserData` (2 gates), `getDocumentsAdmin` canonical; 33 diag/backfill functions not |
| **Uploads** | **PARTIAL** | see Documents (upload) |

Adoption summary: **FULL 6 · PARTIAL 11 · LEGACY 5 · NONE 1** (by domain). By function: **14 of 122 service-role functions use the canonical actor** (11.5%).

---

## 6. DATABASE / RLS BOUNDARY MAP

**Boundary 1** = application security kernel (backend authorization). **Boundary 2** = independent database enforcement.

| Domain | Boundary 1 | Boundary 2 | Verdict |
|---|---|---|---|
| `valuation.*` (38 tables) | substantive (`valuation_assignments`, `requireValuation*`) | RLS enabled + `SECURITY DEFINER` helpers + `GRANT EXECUTE … TO authenticated` | **BOTH (2 inert)** |
| `business_decisions`, `business_dna_patterns`, `business_intelligence_*`, `galileo_conversations`, `next_best_actions`, `document_assignments`, `recommendation_*` | partial | RLS enabled | **BOTH (2 inert)** |
| `documents`, `profiles`, `business_entities`, `extracted_fields`, `document_analysis`, `dashboard_metrics`, `advisor_notes`, `business_owners`, `business_team_members`, `expert_advisor_access`, `advisor_assignments` | partial, inconsistent | **none found** | **BOUNDARY 1 ONLY** |
| Storage `documents` bucket | service-role brokered | 3 `authenticated` policies still present (S2 unexecuted) | **BOUNDARY 1 ONLY** |
| Frontend anon client (`src/lib/supabaseClient.js`) | n/a | would depend on anon grants | **NEITHER (dead code today)** |

**Why Boundary 2 is inert.** The S2 preflight states it plainly: *"No live request resolves to role `authenticated` (Supabase Auth is unused). The browser uses the anon key → role `anon` → already ungranted."* `valuationService` states *"profiles.auth_user_id is null for all current profiles."* So:
- Policies written against `auth.uid()` can never match → they change no outcome.
- `SECURITY DEFINER` helpers (`valuation.can_view_valuation` etc.) are unreachable from any live client.

**No `GRANT … TO anon` exists in any migration.** The residual exposure therefore depends on project-level default privileges that the repository cannot show. If `anon` holds table privileges and the table has no RLS, the public anon key reads/writes it — this is the single highest-leverage runtime check (§20-Q1).

**Do not activate Supabase Auth.** Nothing in this inspection supports it: identity is anchored in `profiles.base44_user_id`, the Base44→Supabase link is deliberate, and the reviewed slices solve authorization at Boundary 1. Activating a second identity provider would create a second authority without closing any finding above. The correct Boundary 2 move is *deny anon, keep service-role* (and enable RLS only where a verifiable predicate exists).

---

## 7. DOCUMENT LIFECYCLE ASSESSMENT

| Stage | Control | Gap |
|---|---|---|
| **Upload** | `uploadDocumentToSupabase` (actor + `validateBusinessScope` + advisor row), `adminUploadDocument`/`adminUploadLibraryFile` (auth only), `getSignedUploadUrl` (auth, direct-to-storage) | no MIME allowlist/size cap/scan in code (SEC-017); admin/library uploads have no scope check; `upsert:false` ✔ |
| **List** | `supabaseUserData.getDocuments`/`getDataRoomDocuments` (`assertBusinessAccess`), `getDocumentsAdmin` (row-derived) | advisor-row scoping without revocation filter (SEC-009) |
| **View** | S3.1 verified: row loaded → `authorizeDocumentAccess` → approved bucket → 900 s → 404-equivalent | P5 neutralized the Admin fallback; **other call sites still fall back to `file_url`** (SEC-011) |
| **Download** | same URL as view (`downloadDocument` reuses the signed URL) | no separate authorization; a copied URL is a bearer token for its lifetime |
| **Assign** | `documentAssignments` (kernel) | assignments are not an authorization input elsewhere ✔ |
| **Review / verify** | `updateExtractedFieldReview`, `worksheetResponses` (advisor row) | no revocation filter (SEC-009) |
| **Replace** | not implemented as replacement; new uploads create new objects (`upsert:false`) | old object + old row persist |
| **Delete (DB)** | admin or owner-of-record (S3.1 `deleteDocument`) | ownership rule does not consult business relationships ✔ (by design) |
| **Delete (Storage)** | **absent** | orphan objects (SEC-014) |
| **Signed URL persistence** | `documents.file_url` = 24 h URL | bearer token at rest (SEC-011) |

- **CONFIDENTIALITY:** SEC-002 (boundary), SEC-011 (revocation window / bearer at rest), SEC-009 (revoked advisor), SEC-001 (context read).
- **INTEGRITY:** SEC-007/008 (analysis rows/status writable cross-tenant), SEC-017 (no type/size validation), SEC-014 (delete leaves bytes).
- **AVAILABILITY:** SEC-008 (status can be forced), SEC-005 (backfill/DDL), SEC-012.
- **RETENTION:** no retention policy in code; delete is DB-only; `ReadinessModal.jsx` explicitly warns attached files "will remain in …".

---

## 8. GALILEO SECURITY ASSESSMENT

Retrieval is treated as a data-access system, as requested.

- **Actor:** `buildGalileoContext` uses `auth.me()` only — the request body's `profile_id` replaces actor resolution entirely (SEC-001). `askGalileo` does resolve canonically and calls `validateBusinessScope`.
- **Business:** `buildGalileoContext` resolves through `requireBusinessContext` **only** when no `profile_id` is supplied; with one, the business is taken from the body and "authorized" by equality against the *supplied* profile's primary business.
- **Scope of retrieval:** all reads (`business_entities`, `dashboard_metrics`, `business_metric_snapshots`, `business_assessments`, `business_opportunities`, `next_best_actions`, `roadmap_items`, `value_creation_events`, `documents`, `extracted_fields`, `strategy_outcomes`, `sprints`) are keyed on the resolved `business_id`; `advisor_notes` is keyed on `profile_id`. **So the scope is exactly as strong as the actor binding — which is the hole.**
- **Documents:** metadata only from this path (name/type/status/year); content still requires S3.1.
- **Facts:** read through the shared intelligence contract (`buildBusinessIntelligenceContract`) — good single-truth design, but it consumes the same resolved business.
- **Conversations:** `GalileoConversation.business_id` exists and `galileo_conversations` is RLS-enabled — but Boundary 2 is inert, so scoping is application-only. `GalileoPanel` persistence remains an open item.
- **Cross-business retrieval:** **possible** today via SEC-001.
- **Can Galileo retrieve what the UI could not?** Yes — the same read set in one response, including `advisor_notes` and `extracted_fields`, with no per-item authorization. That is the amplification: one call, whole-business intelligence.

Verdict: **Galileo is the highest-value read surface in the platform and currently has the weakest actor binding.**

---

## 9. NOTIFICATION ASSESSMENT

- **Creation:** no sender authority, no recipient relationship, arbitrary `recipient_id`, arbitrary `metadata` (including `related_entity_id`/`action_url` which the destination resolver consumes) — SEC-003.
- **Email side effect:** `SendEmail` triggered per call with attacker-supplied `recipient_email`, `title`, `message`, `action_url`, interpolated **unescaped** into HTML. Registered recipients always reachable; external addresses subject to platform screening. This is the strongest phishing primitive in the codebase.
- **Preference suppression:** preferences gate *delivery*, never *authorization* — a suppressed notification is not a safe outcome.
- **Read/mark/delete:** ownership enforced for non-admins; admin standing comes from the **Base44** role (SEC-013).
- **Deep links:** `notificationDestination.js` resolves ids from metadata; a forged `action_url`/metadata can point anywhere the SPA routes (no cross-tenant consequence on its own, because destinations re-authorize — but the *message content* is attacker-controlled).
- **`trackNotificationEvent` / `getNotificationAnalytics`:** ownership/admin checks present.

---

## 10. ADMIN / PRIVILEGED-OPERATION ASSESSMENT

- **Route gate:** `RequireAdminRole` (+ `adminAccess.js` predicate) on `/admin` and `/dev/supabase-status`; workspace host `AdminWorkspaceHost.jsx`. UI-only, as always.
- **Backend gates:** canonical (`isCanonicalAdmin`, `actor.isSuperAdmin`) exists in `supabaseUserData` (2), `supabaseProfileData.updateProfileRole` (target via `resolveActingProfile`, editor = actor), `getDocumentsAdmin`, `documentAssignments`.
- **Everything else privileged is ad-hoc:** Base44 role (`notificationService`, `teamInvites`, `syncRoadmapToCalendar`), or `isAdmin/ADMIN_ROLES` string checks in `generateAdvisorCommandCenter`, `generateNextBestActions`, `recalculateStrategyLearningSummary`, `recommendationOverrides`, `runDocumentExtraction`, `getSprintVerificationQueue`, `assignSprintVerifier`, `selectStrategiesForClient`, `recordStrategyOutcome`, `knowledgeBaseEngine`, `resolveStrategyMappings`, `expertAdvisorAccess`, `buildGalileoContext`.
- **Destructive / bulk:** 33 backfill/diag/migration functions with no canonical gate (SEC-005).
- **Role mutation:** `updateProfileRole` is properly guarded (canonical actor + resolved target + super-admin-only for privileged roles) — verified by the P3 harness.
- **User suspension:** the *effect* is central (`actor.ts`), but no admin action sets `profile_status='suspended'` was found in the inspected admin surface → **UNKNOWN** (suspension may be a manual DB edit). That is a governance gap worth naming.
- **Impersonation:** no mechanism found. **Exports:** none found beyond list reads.
- **Verdict:** admin authorization is *good where reviewed, absent where not*; the 33-function family is the exposure.

---

## 11. AUDIT / EVIDENCE ASSESSMENT

Can VISION answer these today? (actor-resolved, retrievable evidence)

| Question | Answer |
|---|---|
| Who viewed a document? | **No** |
| Who downloaded it? | **No** |
| Who deleted it? | **No** |
| Who changed access / role? | **No** (role change mutates the profile row; no actor record) |
| Who assigned / revoked an expert? | **Partly** — `expert_advisor_access` carries grant/revoke stamps and actor fields; no unified trail |
| Who changed / verified a fact? | **Partly** — `extracted_fields` review status; no actor trail |
| Who ran an Admin action? | **No** (except valuation actions) |
| Who exported information? | **No** |
| When, and from what actor/session? | **Only for valuation** (`valuation_audit_log`, `valuation_request_events`, `actor_profile_id`) |

Existing tables that could carry evidence: `valuation_audit_log`, `valuation_request_events`, `LiveSyncAction` (+ BIE journal, business-memory audit trail, meeting-intelligence audit trail — all domain-internal, not security events).

**SOC 2-style verdict:** an auditor could not rely on application logs for access evidence. Missing: a security event log with `actor_profile_id`, `session/user id`, `resource_type`, `resource_id`, `action`, `outcome`, `reason`, `timestamp`, `request_id`, plus retention and tamper-resistance. Also missing: alerting, and evidence that suspension/role changes are reviewed.

---

## 12. DATA CLASSIFICATION

| Data | Class | Current control match? |
|---|---|---|
| Identity / profile (name, email, `app_role`, `base44_user_id`) | CONFIDENTIAL | Partial — Boundary 1 only, user enumeration via SEC-020 |
| Business financials (`dashboard_metrics`, `business_metric_snapshots`, `business_assessments`) | HIGHLY CONFIDENTIAL | **Mismatch** — SEC-001/SEC-002 |
| Tax information (`extracted_fields`, tax returns) | HIGHLY CONFIDENTIAL | **Mismatch** — SEC-001 (context read), SEC-009 |
| Uploaded documents (Storage + `documents`) | HIGHLY CONFIDENTIAL | Partial — S3.1 strong; SEC-011/014/017/025 |
| Bank / accounting connections | HIGHLY CONFIDENTIAL | Not evidenced in this repo slice — UNKNOWN |
| Valuation (`valuation.*`) | HIGHLY CONFIDENTIAL | Good (assignment model) + SEC-010/SEC-018; Boundary 2 inert |
| Advisor notes | HIGHLY CONFIDENTIAL | **Mismatch** — read via SEC-001 path |
| Galileo conversations | CONFIDENTIAL | App-only; Boundary 2 inert |
| Facts / evidence (`extracted_fields`, canonical facts) | HIGHLY CONFIDENTIAL | Partial — SEC-001/009 |
| Household / personal financial info | HIGHLY CONFIDENTIAL | Same paths as documents (household storage segment) — UNKNOWN depth |
| Notifications | INTERNAL | **Mismatch** — forgeable (SEC-003) |
| Audit logs | CONFIDENTIAL (integrity-critical) | **Absent** (SEC-015) |
| Business metadata (`business_entities`) | INTERNAL/CONFIDENTIAL | Boundary 1 only |

Principle violated in practice: *HIGHLY CONFIDENTIAL* data sits behind controls that are application-only, inconsistently applied, and not independently verifiable.

---

## 13. TENANT-ISOLATION MATRIX

Question: can User A cause **READ / WRITE / UPDATE / DELETE / EXECUTE** against Business B without a valid relationship?

| Domain | R | W | U | D | EXEC | Verdict |
|---|---|---|---|---|---|---|
| Business financials / snapshots | SEC-001, SEC-002 | — | SEC-010 | — | — | **PROVEN VULNERABLE (read)** |
| Documents (view) | safe via S3.1; SEC-011 fallback | safe (S3.1) | SEC-007 (status) | admin/owner only ✔ | — | **PARTIALLY PROVEN SAFE / VULNERABLE (revocation window, status)** |
| Document analysis | SEC-006 | SEC-007 | SEC-008 | — | — | **PROVEN VULNERABLE** |
| Extracted fields / facts | SEC-001, SEC-009 | — | SEC-009 | — | — | **PROVEN VULNERABLE (read)** |
| Valuation | SEC-010 | SEC-010 | SEC-010 | — | — | **LIKELY VULNERABLE** (conditional on stale `primary_business_id`) |
| Advisor notes | SEC-001 | — | — | — | — | **PROVEN VULNERABLE (read)** |
| Roadmap / value events | SEC-009 | — | — | — | SEC-012 | **VULNERABLE** |
| Next best actions | SEC-009 | — | — | — | — | **VULNERABLE (read)** |
| Sprints / tasks | — | — | — | — | SEC-012 | **UNKNOWN** |
| Notifications | — | SEC-003 | SEC-003/SEC-013 | SEC-013 | — | **PROVEN VULNERABLE (write/forge)** |
| Team / invites | SEC-020 | SEC-013 | — | — | SEC-013 | **VULNERABLE (invite with role)** |
| Expert access | SEC-009 | — | — | — | SEC-021 | **VULNERABLE (consumer side)** |
| Galileo conversations | — | — | — | — | — | **LIKELY SAFE (app-scoped) / UNKNOWN** |
| Engine outputs (`whatIf`, `freedom`, opportunities) | — | — | — | — | SEC-023 | **UNKNOWN** |
| Admin surface | — | SEC-005 | SEC-005 | SEC-005 | SEC-005 | **VULNERABLE (to any authenticated user)** |

Nothing is called safe merely because the UI does not expose it; every "safe" above rests on a code path that re-derives the tenant from the row and re-checks the actor (S3.1) or on an admin/owner rule that does not consult the relationship at all (delete).

---

## 14. SOC 2 TECHNICAL READINESS

Not a compliance claim — a readiness classification.

| Area | Rating | What prevents an auditor from relying on the control |
|---|---|---|
| Access control | **ORANGE** | Excellent kernel, 11.5% adoption; privileged functions on Base44 roles; SEC-001 open |
| Least privilege | **RED** | 122 service-role functions; 33 diag/backfill callable by any authenticated user; service-role is ambient |
| Tenant isolation | **ORANGE** | Strong on documents; broken on Galileo context, analysis, advisor_assignments lineage, primary-business authority |
| Auditability | **RED** | No security event log; no view/download/delete/role/admin evidence (SEC-015) |
| Change control | **YELLOW** | Offline harnesses + mutation tests are genuinely strong; but commits are platform-authored, commit-subject workflow is not controllable, and there is no approval record |
| Secrets | **GREEN-YELLOW** | No service key or key-shaped literal in frontend; secrets are platform-managed. Yellow: debug/backfill endpoints, secret-handling instructions rendered in the UI |
| Data protection | **ORANGE** | Private-by-intent Storage + 900 s URLs, undermined by persisted 24 h URLs and the absent DB boundary |
| Incident evidence | **RED** | No actor-attributable trail; no alerting |
| Availability safeguards | **YELLOW** | No rate limiting, no abuse controls on the 33 admin-family functions; orphan storage growth |
| Retention / deletion | **RED** | DB-only delete, no retention policy, no Storage cleanup (SEC-014) |
| Secure SDLC | **YELLOW** | Strong harness discipline; no dependency scanning, no vulnerability management, no pre-commit gate enforced repo-wide |

**Single sentence for an auditor:** technical controls are enforced in application code on a minority of paths, with no independent database enforcement and no actor-attributable audit trail — evidence cannot be produced for access to the most sensitive data.

---

## 15. NON-CODE SOC 2 REQUIREMENTS (to be produced later — not to be implemented now)

Policies (information security, access control, change management, incident response, data classification/retention, vendor management) · periodic access reviews (with evidence) · employee onboarding/offboarding checklists · incident response runbooks + post-incident reviews · vendor/subprocessor management (Base44, Supabase, Google, GHL, OpenRouter) · backup/restore evidence and restore drills · vulnerability management (scanning, triage SLAs) · change-approval records · security awareness training · device/endpoint controls · annual risk assessment · evidence retention schedule (log retention ≥ policy period) · customer-facing security commitments/DPA · data-subject request procedures.

---

## 16. PRIORITIZED SECURITY ROADMAP

Small auditable slices; each closes a named risk; none is a rewrite.

**P-S1 — Verify the database and storage boundary (read-only, no code).**
*Objective:* answer §20-Q1/Q3/Q4. *Risk closed:* determines whether SEC-002/SEC-025 are P0 or closed. *Change surface:* none (SQL run in the Supabase dashboard; results captured as a doc). *Dependencies:* none. *Test:* the queries return the expected grants/policy set. *Rollback:* n/a (read-only). *Why now:* it re-ranks the entire ledger.

**P-S2 — Close the document-analysis IDOR chain (SEC-006/007/008).**
*Objective:* actor-derived identity, row-derived tenant, ownership check on status. *Change surface:* 3 functions + 1 new offline harness. *Dependencies:* none. *Test:* harness with cross-tenant adversarial cases + mutations. *Rollback:* single commit revert. *Why now:* proven cross-tenant writes with a tiny, self-contained fix.

**P-S3 — Bind the Galileo context to the canonical actor (SEC-001) — *see §17*.**

**P-S4 — Retire the 33-function privileged family (SEC-005/019).**
*Objective:* canonical super-admin gate, then archive what is no longer needed. *Change surface:* function-by-function; start with the 5 `backfill*` + 3 schema/DDL + 4 `diagSprint*`. *Dependencies:* P-S3 pattern established. *Test:* per-function harness asserting 403 for non-admin. *Rollback:* per-function revert. *Why:* the largest count of unrestricted privileged operations.

**P-S5 — Unify business authority: `primary_business_id` (SEC-010/024) and the `advisor_assignments` lineage (SEC-009).**
*Objective:* re-check ownership whenever `primary_business_id` is used as authority; apply the S3.0.2 predicate to the advisor table or retire it. *Change surface:* `activeBusiness.ts`, `actor.ts` (`resolveTargetBusinessId`), `valuationShared`, `valuationAuth`, `buildGalileoContext`, 8 scoping call sites. *Dependencies:* P-S1 (does the table exist?). *Test:* revocation/stale-authority matrices. *Rollback:* slice the two halves separately. *Why:* closes the second family of cross-tenant reads without a schema change.

**P-S6 — Notification authority + email containment (SEC-003/013); unauthenticated writers (SEC-012); error leakage (SEC-016).**
*Objective:* sender authority, recipient relationship, server-owned templates, canonical admin standing, authentication on the two writers. *Change surface:* `notificationService`, `teamInvites`, `onSprint*Completed`, ~12 error handlers. *Dependencies:* P-S3 kernel imports. *Test:* forgery harness (attacker-supplied recipient/email/link must 403). *Rollback:* per-function revert. *Why:* highest-likelihood abuse path with external blast radius.

**P-S7 — Security event log (SEC-015).**
*Objective:* one append-only table + kernel emit points (actor, action, resource, outcome, reason, request id). *Change surface:* shared module + call sites; one migration. *Dependencies:* kernel adoption (P-S3–P-S6) so emit points are central. *Test:* assert an event per protected action, incl. denials. *Rollback:* table retained, emit disabled. *Why:* nothing else becomes *evidenced* without it.

**P-S8 — Service-role containment for the engines (SEC-004/023) + hygiene (SEC-014/017/026/027/028/029).**
*Objective:* domain-by-domain kernel adoption for the remaining ~70 functions; Storage delete; MIME/size limits; delete the dead anon client. *Change surface:* broad, but sliced per domain. *Dependencies:* all above. *Test:* per-domain matrices. *Rollback:* per-domain. *Why:* last, because it is the largest surface and benefits from the patterns established earlier.

---

## 17. NEXT IMPLEMENTATION SLICE (one, recommended — DO NOT IMPLEMENT YET)

**NAME: P-S3 — Galileo Context Actor Binding (close SEC-001).**

**WHY IT WINS.** Highest severity per unit of change: one function, no schema, no migration, no cross-cutting refactor. It closes a **proven cross-tenant read of the most confidential data in the product** (financials, snapshots, assessments, opportunities, NBA, roadmap, value events, document metadata, advisor notes, extracted fields) reached by *choosing a body parameter*. The fix reuses primitives that already exist and are already mutation-tested (`authenticateActor`, `resolveActingProfile`, `requireBusinessContext`), so it adds no new authorization concept. It is also the smallest slice that makes the Galileo read surface as strong as the document surface — and Galileo is the feature most exposed to users.

**FILES / FUNCTIONS EXPECTED.**
- `base44/functions/buildGalileoContext/entry.ts` — replace the two actor/business branches with: `authenticateActor(base44, sb)` → `resolveActingProfile(sb, actor, { targetProfileId, targetEmail })` → `requireBusinessContext(sb, actingProfile, body.active_business_id || body.business_id, 'buildGalileoContext')`. The `profile_id` field becomes a *target* hint resolved and authorized by the shared resolver, never an identity.
- `scripts/galileoContextActorBinding.test.cjs` (new) — offline harness, same style as `adminCanonicalActor.test.cjs`: real `actor.ts` compiled in a sandbox, a stub Supabase client, adversarial matrix (self, admin target override, unrelated owner, revoked expert, supplied-vs-session mismatch, missing business, ambiguous multi-business), plus mutations that re-break the binding.

**WHAT MUST NOT CHANGE.**
- The **shape and content** of the Galileo context response (the intelligence contract, every key, every ordering) — this is an authorization slice, not a retrieval redesign.
- `askGalileo`, the capability/permission pipeline, the global shell, `PersistentGalileo`, conversation persistence, notification → document navigation.
- Any other function, any schema, any migration, any frontend file.

**PRECONDITIONS.**
1. P-S1 is *not* required to start, but the harness must cover the legitimate admin/expert client-view path (`profile_id` supplied by the Admin workspace) so it keeps working through `resolveActingProfile`'s admin branch.
2. Confirm the current callers of `buildGalileoContext` and which of them legitimately pass `profile_id` (grep `buildGalileoContext` in `src/`), so the target path is exercised rather than assumed.
3. `profiles.primary_business_id` behaviour (SEC-010) is *not* changed by this slice; the owner check must move to `requireBusinessContext` (ownership/relationship), while leaving `primary_business_id` semantics untouched elsewhere.

**STOP CONDITIONS.**
- Any change to the response contract, or to any file outside the two named.
- Any need for a migration or schema change.
- The harness cannot express a legitimate admin target override through the shared resolver (means the primitive is insufficient → stop and report rather than adding a bespoke branch).
- Any observed behavioural difference for a legitimate owner on their own single business.

**SUCCESS CRITERIA.**
- Adversarial matrix: supplying another profile's `profile_id` with that profile's business → **403**, no intelligence returned; canonical admin targeting a client → allowed exactly as today; owner on own business → byte-identical response; multi-business owner with no explicit business → existing 400 `BUSINESS_CONTEXT_REQUIRED`; suspended actor → 403 at the actor stage; revoked expert → 403.
- Mutations re-breaking the binding (e.g. restoring `profile.primary_business_id === business_id` as the owner rule) are caught by the harness.
- Existing suites unchanged and green; `npm run build` green; change surface = exactly 2 files.

---

## 18. KNOWN PRE-EXISTING DEBT (retained, NOT to be fixed)

- `scripts/businessContextContract.test.cjs` **fails** on `base44/functions/ownershipConcentrationEngine/entry.ts` — "imports the business-scope guard — no canonical import". Classification retains as **PRE-EXISTING DEBT**. No current evidence changes that classification; SEC-030 records it so it is not mistaken for a regression.
- Related but distinct: the `ninety_day_sprint_paths` missing-columns drift and `questions_used` never incremented remain open items; unchanged by this checkpoint.

---

## 19. EXACT FILES / FUNCTIONS INSPECTED

**Shared authorization (full read):** `base44/shared/authz/actor.ts`, `base44/shared/authz/documentAccess.ts`, `base44/shared/businessScope/writeGuard.ts`, `base44/shared/businessScope/relationshipAccess.ts`, `base44/shared/businessScope/activeBusiness.ts`, `base44/shared/valuationEngine/valuationAuth.ts`, `base44/shared/valuationShared/entry.ts` (auth block), `base44/shared/canonicalFact/consumerAdapter.ts` (classification), `base44/shared/documents/buckets.ts` (referenced).

**Backend functions (read or targeted):** `buildGalileoContext`, `askGalileo`, `notificationService`, `teamInvites`, `createDocumentAnalysis`, `checkDocumentAnalysisById`, `updateDocumentAnalysisStatus`, `uploadDocumentToSupabase`, `adminUploadDocument`, `getUploadSignedUrl`, `getSignedUploadUrl`, `uploadDocumentDirect`, `valuationService` (auth entry), `liveSyncOrchestrator` (partial), `onSprintItemCompleted`, `onRoadmapItemCompleted`, `supabaseUserData` (auth block, document/analysis/scope actions, `getDocumentSignedUrl`, `deleteDocument`, `retryDocumentAnalysis`), `supabaseDocumentData` (actions + advisor scoping), `supabaseVerificationData`, `supabaseOpportunityData`, `supabaseProfileData` (auth + role update), `getDocumentsAdmin`, `expertAdvisorAccess`, `documentAssignments`, `generateNextBestActions`, `generateAdvisorCommandCenter` (flags), `recalculateStrategyLearningSummary`, `recommendationOverrides`, `runDocumentExtraction`, `worksheetResponses`, `updateExtractedFieldReview`, `worksheetDataAudit`, plus the full 138-function auth/scope flag matrix.

**Frontend:** `src/hooks/useDocumentViewer.js`, `src/components/documents/DocumentViewer.jsx`, `src/components/admin/AdminUserProfileContext.jsx`, `src/components/resources/AssignedResourceCard.jsx`, `src/pages/DataRoom.jsx` (consumers), `src/lib/supabaseClient.js`, `src/components/exit-readiness/ReadinessModal.jsx`, `src/pages/SupabaseStatus.jsx`.

**Migrations:** all files in `src/supabase/migrations/` inspected for `ENABLE ROW LEVEL SECURITY` (37 statements), `CREATE POLICY`, `SECURITY DEFINER`, `GRANT`, `auth.uid()`, and Storage policy drops — notably `phase_s2_storage_containment.sql`, `phase_s2_storage_containment_verification.sql`, `phase_6b1_safe_foundation.sql`, `phase_6b_rls_audit_and_safe_subset.sql`, `business_valuation.sql`, `business_decisions.sql`, `business_dna_patterns.sql`, `bie_persistence.sql`, `next_best_actions.sql`, `document_assignments.sql`, `strategy_library_normalization.sql`.

**Harnesses relied on (not modified):** `adminDocumentViewer` (56/56), `documentSignedUrlAuthorization` (103), `documentAccessAuthorization` (45), `relationshipRevocationAccess` (78), `adminCanonicalActor` (125), `getDocumentsAdmin.s3.mock` (50/50), `adminRouteAccess` (41), `adminWorkspaceAccess` (66), `architectureGuard` (pass), `businessContextContract` (pre-existing failure).

**Measured facts:** 138 functions · 122 create a service-role client · 14 use the canonical actor · 106 authenticate only with `auth.me()` · 2 with neither · 33 diag/backfill/migration-class functions · 37 RLS-enabled statements, none for the core tenant tables · no `GRANT … TO anon` anywhere.

---

## 20. UNKNOWN ITEMS REQUIRING RUNTIME / PRODUCTION EVIDENCE

Run read-only; capture raw output as evidence.

- **Q1 (decides SEC-002, highest priority).** In the Supabase SQL editor: `select n.nspname, c.relname, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','valuation') and c.relkind='r' order by 3,1,2;` then `select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where grantee in ('anon','authenticated') order by 1,2,3;` **and** `select has_table_privilege('anon','public.documents','SELECT') as anon_read_documents, has_table_privilege('anon','public.profiles','SELECT') as anon_read_profiles;` — also confirm `select auth.uid();` returns NULL and whether `profiles.auth_user_id` is populated.
- **Q2 (SEC-S0-B).** Duplicate mapping check: `select base44_user_id, count(*) from profiles where base44_user_id is not null group by 1 having count(*)>1;` and the email-duplicate equivalent.
- **Q3 (SEC-025 / S2).** Storage state: `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;` and `select policyname, roles, cmd, qual from pg_policies where schemaname='storage' and tablename='objects';` — confirm whether the three `authenticated_*_documents` policies still exist and whether `documents` is private.
- **Q4 (SEC-009).** `select to_regclass('public.advisor_assignments') is not null as table_exists;` and, if it exists, `select count(*), count(*) filter (where access_status='active') , count(*) filter (where revoked_at is not null) from advisor_assignments;` (or the actual column set if different — the table appears in no migration, so its shape is itself unverified).
- **Q5 (SEC-010).** `select count(*) from profiles p join business_entities b on b.id = p.primary_business_id where b.profile_id is distinct from p.id;` — profiles whose primary business they do **not** own (the stale-authority population).
- **Q6 (SEC-014).** `select count(*) from documents d where d.file_path is not null and not exists (select 1 from storage.objects o where o.name = d.file_path);` — DB rows without objects (and the inverse, orphan objects).
- **Q7 (SEC-017).** Bucket `allowed_mime_types` / `file_size_limit` from Q3; plus real-world document types ingested.
- **Q8 (SEC-013 / §10).** Whether any code path sets `profiles.profile_status='suspended'` (suspend action) — grep found none; confirm operationally how suspension is applied today.
- **Q9 (SEC-011).** Row-level fact: how many `documents.file_url` values are currently non-null and unexpired (`select count(*) from documents where file_url is not null;`) — quantifies the persisted-URL population.
- **Q10 (SEC-002 secondary).** Whether the published bundle contains `VITE_SUPABASE_URL` + publishable key only (it does per `src/lib/supabaseClient.js`), and whether any other anon-reachable surface (RPC) exists: `select proname, prosecdef from pg_proc where pronamespace='public'::regnamespace;`

---

**STATUS: CHECKPOINT COMPLETE — read-only. No product code modified, no migration created, nothing committed, nothing published. STOP FOR REVIEW.**