# P-S3 — GALILEO CONTEXT ACTOR BINDING — REVIEW PACKAGE

**Slice:** P-S3 · closes **SEC-001** · **Pre-change revision:** `c4795e9` (HEAD at start of slice)
**Product files changed:** **1** · **Harness added:** **1** · **Build:** PASS (exit 0)
**STATUS — corrected at the final pre-commit review:** this platform AUTO-COMMITS file writes. The slice was therefore already committed when the final review began, as **`6add15b` "Fix profile authorization and business context validation flaws"** (files: `base44/functions/buildGalileoContext/entry.ts` +107/−26, `scripts/galileoContextActorBinding.test.cjs` +543, this report). No commit and no publish command was run by me, and the app was not published. §18/§19 below describe the pre-commit working tree as it stood at first write; the **authoritative final surface is §22.13**. The platform's auto-generated subject differs from the recommended subject — **do not rewrite history to correct it.**

---

## 1. SEC-001 ROOT CAUSE — **CONFIRMED**

**Confirmed in the current revision, and demonstrated empirically in the pre-change code (§13 / B1).**

The pre-change authorization prologue was:

```js
// Resolve profile from authenticated user if not provided
if (!profile_id) {
  const { data: prof } = await sb.from('profiles')...eq('email', user.email).maybeSingle();
  if (prof) {
    profile_id = prof.id;
    const { businessId, denial } = await requireBusinessContext(sb, prof, active_business_id || business_id, 'buildGalileoContext');
    if (denial) return denial;
    business_id = businessId;
  }
} else if (!business_id) {
  business_id = active_business_id || business_id;        // ← supplied business accepted verbatim
}

// Access control: owners can only access their own business
const { data: profile } = await sb.from('profiles').select('id, app_role, primary_business_id').eq('id', profile_id).maybeSingle();
const role = profile?.app_role || user.role || 'owner';    // ← Base44 role fallback
const isAdminOrAdvisor = ['super_admin', 'advisor', 'admin'].includes(role);
if (!isAdminOrAdvisor && profile?.primary_business_id !== business_id) return 403;
```

Four independent defects, all in the `profile_id`-present branch:

| # | Defect | Consequence |
|---|---|---|
| D1 | **Identity from the body.** `profile_id` was accepted straight from the request and used as the profile for both scoping and the authorization test. | The caller chose the subject. |
| D2 | **Authorization evaluated the *supplied* profile.** The only test was `supplied_profile.primary_business_id === business_id` — the victim's own primary business trivially equals the victim's own business. | The check was correct and useless: it compared an attacker-chosen profile to an attacker-chosen business. |
| D3 | **Canonical resolution skipped entirely.** `requireBusinessContext` ran **only** in the `!profile_id` branch. | Supplying `profile_id` bypassed the canonical business contract, multi-business ambiguity rule included. |
| D4 | **Base44 `user.role` fallback.** `role = profile?.app_role \|\| user.role \|\| 'owner'`, and `admin`/`super_admin`/`advisor` were treated as authorized for **any** business. | Base44 standing (and, with a null profile, a nonexistent id) became a second, independent route to any tenant's context. |

**Precision worth recording:** the *business-only* path (`profile_id` absent) was **already canonical** — it went through `requireBusinessContext` → `validateBusinessScope`. SEC-001 was reachable **only** by supplying `profile_id`. The exploit is exactly: *authenticated User A → `{ profile_id: <victim's profile id>, business_id: <victim's business> }` → the victim's whole Galileo context returned through the service-role client.*

---

## 2. EXACT PRE-CHANGE AUTHORIZATION PATH

```
req
 └─ base44.auth.me()                                    → 401 if absent
    └─ createClient(SERVICE_ROLE)                        ← privileged client created BEFORE any authorization
       └─ body.profile_id ?  ── YES ──►  NO canonical resolution at all (D3)
       │                              ├─ business_id := body.active_business_id || body.business_id   (accepted verbatim, D3)
       │                              ├─ profile := SELECT * FROM profiles WHERE id = body.profile_id (D1)
       │                              ├─ role := profile.app_role || user.role || 'owner'              (D4)
       │                              └─ ALLOW if role ∈ {super_admin, advisor, admin}
       │                                       OR profile.primary_business_id === business_id        (D2)
       └─ buildBusinessIntelligenceContract(business_id, profile_id)      ← FIRST business read
          └─ 14 parallel business-scoped reads (metrics, snapshots, assessments, opportunities, NBA,
             roadmap, value events, documents, advisor_notes by profile_id, extracted_fields,
             strategy_outcomes, sprint by profile_id) …
             └─ Response.json({ context })
```
Failure mode: the profile/business pair named by the caller *was* the authorization proof. Authorization did not consult the session at all.

---

## 3. EXACT POST-CHANGE AUTHORIZATION PATH

```
req
 └─ base44.auth.me()                                                     (unchanged)
    └─ createClient(SERVICE_ROLE)                                        (unchanged — contained, not removed)
       └─ authenticateActor(base44, sb)                                  ← ACTOR from the session ONLY
       │    · 401 unauthenticated
       │    · canonical profile via profiles.base44_user_id (email fallback)
       │    · 403 if profiles.profile_status = 'suspended'   (S3.0 gate, inherited)
       │    · isAdmin := ADMIN_ROLES.includes(profiles.app_role)   (S3.0.1 — no Base44 role)
       │  └─ body.profile_id  ──►  UNTRUSTED TARGET HINT
       │       · idIsSelf := body.profile_id === actor.profile_id
       │       · if (named && !self && !actor.isAdmin) → 403   ← BEFORE any lookup (no existence oracle)
       │  └─ resolveActingProfile(sb, actor, { targetProfileId: idIsSelf ? null : named })
       │       · self → the actor's own profile
       │       · canonical admin → any subject (SUBJECT, never the actor)
       │       · otherwise ONLY if provably authorized for the target's business
       │         (owner / assigned advisor / team member / ACTIVE expert relationship)
       │       · unresolvable target → 404 (no disclosure) ; unauthorized → 403
       │  └─ requireBusinessContext(sb, actingProfile, requestedBusinessId, 'buildGalileoContext')
       │       · explicit business → validateBusinessScope(subject, business)  [canonical kernel]
       │       · none → unambiguous primary default ; ambiguous multi-business → 400
       │       · denial → 403 normalized to { error: 'Forbidden' } ; 400 contract preserved
       │  └─ errorResponse(err) for every kernel throw (401/403/404, no internals)
       └─ IF AND ONLY IF authorized:
          buildBusinessIntelligenceContract(business_id, profile_id)      ← FIRST business read
          └─ 14 parallel business-scoped reads …  └─ Response.json({ context })   (payload unchanged)
```

**Reused kernel primitives — no second authorization system was created:**
`authenticateActor`, `resolveActingProfile`, `errorResponse` (`base44/shared/authz/actor.ts`); `requireBusinessContext` (`base44/shared/businessScope/activeBusiness.ts`); `validateBusinessScope` and `resolveActiveExpertRelationship`/`isActiveRelationship` transitively (`businessScope/writeGuard.ts`, `businessScope/relationshipAccess.ts`).

---

## 4. FILES CHANGED

| File | Type | Change |
|---|---|---|
| `base44/functions/buildGalileoContext/entry.ts` | product | **+81 / −26** — the authorization prologue replaced; one kernel import line added; header contract corrected |
| `scripts/galileoContextActorBinding.test.cjs` | harness | **new** — 51 assertions (G1–G21, S1–S5, M1–M11, F1–F2, B1–B3) |

**Nothing else. No shared module was edited** (the kernel is imported, not modified). No database, no migration, no RLS, no Storage, no grants, no Auth, no UI, no prompt, no calculation.

---

## 5. PRODUCT DIFF SUMMARY

- **Imports:** `+ import { authenticateActor, resolveActingProfile, errorResponse } from '../../shared/authz/actor.ts';`
- **Body:** `profile_id` is **no longer destructured as an identity variable**; `business_id` is destructured as `requested_business_id` so the resolved business cannot be confused with the requested one.
- **Replaced:** the two-branch `if (!profile_id) / else if` resolution, the `if (!business_id)` guard, and the `profile`/`role`/`isAdminOrAdvisor` access-control block → a single canonical prologue in a `try/catch` that returns `errorResponse(err)`.
- **Added:** the pre-gate 403 for a non-admin naming a foreign target; the `requireBusinessContext` call for the **acting** profile; 403 normalization (no oracle); the `!resolved_business_id` → 400 guard; `const role = profile?.app_role || null` (Base44 fallback removed).
- **Unchanged:** every downstream computation, every read, the `context` object, every response field, `service_role` usage, and the position at which the first business read occurs (it simply now sits after authorization).

---

## 6. CANONICAL ACTOR BINDING — explanation

Identity is derived **only** from the trusted session (`base44.auth.me()` → `profiles.base44_user_id`, email only as a fallback), and standing is derived **only** from `profiles.app_role` (`ADMIN_ROLES = ['admin','super_admin']`). The Base44 `user.role` is no longer consulted anywhere in this function (static assertion S3), so Base44 authentication establishes *who* is calling and never *what they may do*.

`body.profile_id` survives in the request contract as an **untrusted target hint**, exactly as the reviewed routers treat it: it can name a subject, it cannot name the actor, and it is refused *before any lookup* unless the caller is acting on themselves or is a canonical administrator — which is what makes a foreign id and a nonexistent id produce the **same** 403 (G16b).

---

## 7. BUSINESS AUTHORIZATION — explanation

`business_id` is treated as a **requested resource identifier**, never as proof of access. After the subject is resolved, `requireBusinessContext` runs the canonical contract: an explicit business is authorized through `validateBusinessScope` (owner → assigned advisor → team member → ownership record → expert access → super-admin, in that order, identical to `can_access_business()` that RLS uses); with no explicit business an unambiguous single-business account gets its primary, and a multi-business account is refused with **400 BUSINESS_CONTEXT_REQUIRED** rather than silently answered.

`validateBusinessScope` was **not modified**, so the expert step remains the S3.0.2 predicate (`access_status = 'active'` **and** `revoked_at IS NULL`, database filter *plus* application predicate). **`advisor_assignments` was not revived** — it is still reached only by the pre-existing step 5, and in production that table does not exist, so the branch resolves to nothing (G13; and the harness mock reproduces the production 42P01 response rather than pretending the table is present).

---

## 8. OWNER BEHAVIOR

| Case | Result |
|---|---|
| Owner A → Business A (explicit) | **ALLOW**, payload byte-compatible with baseline (G18) |
| Owner A, no business supplied | **ALLOW** — own primary business, unambiguous (G7) |
| Owner A → Business B | **DENY 403** (G3) |
| Owner A supplies Business B owner's `profile_id` | **DENY 403**, no context, no content read (G4) — **baseline: ALLOWED with foreign context (B1)** |
| Owner A supplies their own `profile_id` + Business B | **DENY 403** — self is not an override, the business check refuses (G5) |
| Owner A supplies a random `profile_id` | **DENY 403** (G6) |

---

## 9. ADMIN BEHAVIOR

| Case | Result | Notes |
|---|---|---|
| Canonical **super_admin** names a subject (`profile_id`) + that subject's business | **ALLOW** (G8a) | subject resolution + the subject's own business authorization |
| Canonical **super_admin** requests Business B directly | **ALLOW** (G8b) | unchanged from baseline (kernel step 7) |
| Canonical **admin** (non-super) names a subject + that subject's business | **ALLOW** (G8d) | payload byte-compatible with baseline (G19) |
| Canonical **admin** (non-super) requests an *unrelated* business with no subject | **DENY 403** (G8c) | **identical to baseline (B3)** — the canonical platform rule grants `super_admin`, not `admin`; this is unchanged, not narrowed |
| Non-admin supplies `role: 'admin'` in the body | **DENY 403** (G9) |
| Base44 `user.role = admin`, canonical `app_role` is not admin | **DENY 403** (G10) — **baseline: ALLOWED foreign context** |
| Base44 `user.role = admin`, canonical owner, own business | **ALLOW** (G10b) — Base44 role neither elevates nor breaks |

**Admin authority comes only from `profiles.app_role`; the target is a SUBJECT, not the ACTOR; `activeBusinessId` was never made the Admin subject implicitly** — the Admin workspace continues to name its subject explicitly, which is the path this slice authorizes.

---

## 10. EXPERT / ADVISOR BEHAVIOR

| Case | Result |
|---|---|
| Active authorized expert → assigned Business B | **ALLOW** (G11) — via the unchanged canonical expert predicate |
| Revoked expert (`access_status='revoked'`) | **DENY 403** (G12) |
| Drifted row (`access_status='active'` **with** `revoked_at` populated) | **DENY 403** (G12b) — a partial revoke is still a revoke |
| Advisor with no active canonical relationship | **DENY 403** (G13) |
| Expert's profile-scoped reads | scoped to the **expert's own** profile id, never the client's (G21) |

**Documented behavior change (intended, and required by G11):** with `active_business_id` and no `profile_id`, the **baseline refused** an active expert (403) because its predicate compared `primary_business_id` and ignored relationships; the canonical path **authorizes** them (G20: baseline 403 → new 200). The live caller `GalileoPanel.jsx` sends exactly this shape (`targetBusinessId` as `active_business_id`), so expert client-view Galileo was broken before and works now. This is an improvement, not a regression — the alternative (preserving a broken denial) would contradict "preserve legitimate expert/advisor workflows".

**Also documented:** an expert/advisor can no longer fetch a client's context **by naming the client's `profile_id`** — that is an administrative override and is now restricted to canonical admins (403, pre-lookup). Their supported path is the business identifier their client view already sends.

---

## 11. SUSPENDED / REVOKED BEHAVIOR

- **Suspended canonical actor:** 403 at `authenticateActor`, **before** subject resolution, business resolution or any read (G14). Inherited centrally — the harness proves the gate is load-bearing (M11 caught by G14).
- **Revoked relationship:** 403 (G12), **drifted/partial revoke:** 403 (G12b) — both via the untouched S3.0.2 predicate.

---

## 12. AUTHORIZATION-BEFORE-DATA PROOF

**Structural (static, S1):** in the shipped source, the byte offset of `await requireBusinessContext(` precedes both the first business-scoped read (`sb.from('business_entities').select('*')`) and the 14-read `Promise.allSettled` block.

**Dynamic (observed):** every denied scenario is executed against the real function with an instrumented database mock, and the harness asserts that **no content table was touched** and **no Base44 entity was read** (G17a: owner→Business B; G17b: foreign `profile_id`). The only tables read while refusing are the authorization metadata set — `profiles`, `business_entities`, `business_owners`, `business_team_members`, `expert_advisor_access`, `advisor_assignments` — i.e. existence/ownership/relationship metadata, never business content.

**Adversarial (M3):** injecting a single `documents` read before the authorization call is **caught** (G17a fails). The invariant is therefore enforced, not incidental.

---

## 13. G1–G20 RESULTS (plus G1b, G8a–d, G10b, G12b, G16a/b, G17a/b, G21)

All executed against the **real** function and the **real** kernel modules. **23/23 scenario assertions PASS.**

| ID | Scenario | Expected | Observed |
|---|---|---|---|
| G1 | unauthenticated | 401 | **401** ✔ |
| G1b | unauthenticated + `profile_id` supplied | 401 | **401** ✔ |
| G2 | Owner A → Business A | 200 / b-A | **200 b-A** ✔ |
| G3 | Owner A → Business B | 403 | **403, no content read** ✔ |
| G4 | Owner A + Business B owner's `profile_id` | 403 | **403, no context** ✔ |
| G5 | Owner A + own `profile_id` + Business B | 403 | **403** ✔ |
| G6 | Owner A + random `profile_id` | 403 | **403** ✔ |
| G7 | Owner A, no `profile_id`, no business | 200 / b-A | **200 b-A** ✔ |
| G8a | super_admin names subject → subject business | 200 / b-B | **200 b-B** ✔ |
| G8b | super_admin → Business B directly | 200 / b-B | **200 b-B** ✔ |
| G8c | admin (non-super) → unrelated business | 403 | **403** ✔ (unchanged) |
| G8d | admin names subject → subject business | 200 / b-B | **200 b-B** ✔ |
| G9 | non-admin + `role:'admin'` | 403 | **403** ✔ |
| G10 | Base44 `user.role=admin`, canonical not admin | 403 | **403** ✔ |
| G10b | Base44 role + own legitimate access | 200 / b-A | **200 b-A** ✔ |
| G11 | active expert → assigned Business B | 200 / b-B | **200 b-B** ✔ |
| G12 | revoked expert | 403 | **403** ✔ |
| G12b | partial revoke (`active` + `revoked_at`) | 403 | **403** ✔ |
| G13 | advisor, no active relationship | 403 | **403** ✔ |
| G14 | suspended actor | 403 | **403** ✔ |
| G15 | unknown business | 403 | **403** ✔ |
| G16a | foreign vs nonexistent business indistinguishable | identical | **identical body+status** ✔ |
| G16b | foreign vs nonexistent profile id indistinguishable | identical | **identical body+status** ✔ |
| G17a/b | no business-scoped read before authorization | none | **none** ✔ |
| G18 | legitimate owner payload vs baseline | compatible | **deep-equal (modulo timestamp)** ✔ |
| G19 | legitimate admin-subject payload vs baseline | compatible | **deep-equal (modulo timestamp)** ✔ |
| G20 | legitimate expert payload | documented improvement | **baseline 403 → new 200 b-B** ✔ |
| G21 | profile-scoped reads use the acting profile | own id only | **`advisor_notes` filtered by `p-expert`, never `p-ownerB`** ✔ |

---

## 14. M1–M10 RESULTS — **all CAUGHT**

| Mutation | Exact edit | **CAUGHT BY** |
|---|---|---|
| **M1** body `profile_id` trusted as the subject (pre-change path restored) | gate neutralised + resolver replaced by a body-named lookup | **G4** (foreign context returned) |
| **M2** authorization by the supplied profile's `primary_business_id` (legacy judgment) | `requireBusinessContext` → legacy primary comparison | **G11** (authorized expert refused) |
| **M2b** requested `business_id` trusted as proof of access | authorization call → `businessId = requestedBusinessId` | **G3** (foreign context returned) |
| **M3** business-scoped read before authorization | a `documents` read injected before the kernel call | **G17a** (content read while refusing) |
| **M4** Base44 `user.role` grants canonical Admin standing | `actor.isAdmin = true` when `actor.user.role ∈ {admin,super_admin}` | **G10** (foreign context returned) |
| **M5** body `role='admin'` grants standing | `actor.isAdmin = true` when `body.role === 'admin'` | **G9** |
| **M6** `revoked_at` ignored (partial revoke treated as live) | `revoked_at` dropped from query **and** predicate | **G12b** |
| **M7** relationship EXISTENCE authorizes (the `advisor_assignments` shape) | status/revocation filters dropped; predicate → `Boolean(row)` | **G12** |
| **M8** canonical actor resolution skipped when `profile_id` present | actor derived from the body-named profile | **G4** |
| **M9** business authority from the subject's primary only | kernel call → `profile.primary_business_id !== business_id` | **G11** |
| **M10** the authorization refusal is no longer returned | the `if (denial)` block deleted | **G3** |
| **M11** *(extra)* canonical suspension gate removed | `if (false)` in `actor.ts` | **G14** |

**Two mutation findings worth recording (defence in depth, not defects):**
1. **M1 in its narrow form was inert.** Mutating *only* the resolver does not change any outcome, because the pre-gate independently refuses every foreign `profile_id` for a non-admin before the resolver is reached. M1 therefore restores the defect **end-to-end** (gate + resolver). The same applies to M4 when expressed as the *gate* only — mutating canonical standing at the actor is what is observable. Two independent refusals guard this path; the harness proves both are needed to reproduce SEC-001.
2. **M7 is only catchable as a query+predicate mutation.** Because `resolveActiveExpertRelationship` filters `access_status='active'` AND `revoked_at IS NULL` in the database *and* re-judges the returned row, mutating either half alone is inert. This is evidence the S3.0.2 two-layer design works as documented.

---

## 15. REGRESSION RESULTS

| Suite | Exit | Result |
|---|---|---|
| **P-S3 (new)** | **0** | **PASS — 51/51 assertions** |
| `documentAccessAuthorization` | 0 | PASS — all assertions |
| `adminRouteAccess` | 0 | PASS — all assertions |
| `adminWorkspaceAccess` | 0 | PASS — all assertions |
| `getDocumentsAdmin.s3.mock` | 0 | PASS — 50/50 |
| `architectureGuard` | 0 | PASS — 766 files checked |
| `adminCanonicalActor` | 1 | **F-series change-surface only** (F2, F3) — no behavioral assertion fails |
| `relationshipRevocationAccess` | 1 | **F-series change-surface only** (F1, F5) |
| `documentSignedUrlAuthorization` | 1 | **F-series change-surface only** (F1, F3) |
| `adminDocumentViewer` | 1 | **F-series change-surface only** (F1b) |
| `certify-intelligence-contract` | 1 | **baseline-identical** (§17) |
| `businessContextContract` | 1 | **known baseline debt** (§17) |

**No behavioral assertion in any existing suite fails.** The four F-series failures are *allowlist* assertions that enumerate the file set of a previously reviewed slice; they must be re-based for this slice, exactly as the P5 slice re-based them (their own comments document that convention). **They have not been modified in this slice** — updating them would enlarge the change surface beyond "1 function + 1 harness", and the brief requires review first.

---

## 16. BUILD RESULT

`npm run build` → **exit 0**, `vite build` completed (only a `browserslist` caniuse-lite age notice). No compile errors from the new import, the TS annotations in the prologue, or the harness.

---

## 17. BASELINE-IDENTICAL FAILURES (reported separately, not touched)

1. **`scripts/certify-intelligence-contract.cjs` — "SHARED INTELLIGENCE CONTRACT ENFORCEMENT NOT CERTIFIED".**
   The single failing check is an **unrelated frontend cache key**: `src/pages/DocumentUpload.jsx:265 — key: 'business-intelligence-contract'` missing `business_id`. Every other check passes (architecture guard, field registry, Base44 assessment/document migration, consumer registration). **Verified pre-existing**: the script does not reference `buildGalileoContext` at all, so this slice cannot have produced it.
2. **`scripts/businessContextContract.test.cjs` — "ownershipConcentrationEngine imports the business-scope guard — no canonical import".**
   Known baseline debt, explicitly excluded from P-S3 by the brief. Confirmed unchanged.
3. **The four F-series failures are *also* provably pre-existing.** Both ledger reports (`SECURITY_LEDGER_POST_P5.md`, `src/SECURITY_LEDGER_P_S1_BOUNDARY2_VERIFICATION.md`) are **already committed** (`git ls-files` lists them) and are **not** in those suites' expected surface lists — so those assertions were red before this slice began. The only *incremental* element this slice introduces is its own two files.

---

## 18. `git diff --name-only` (vs HEAD at slice start)

```
base44/functions/buildGalileoContext/entry.ts
```

## 19. `git status --porcelain`

```
 M base44/functions/buildGalileoContext/entry.ts
?? scripts/galileoContextActorBinding.test.cjs
```

Diffstat: `1 file changed, 81 insertions(+), 26 deletions(-)`. (This report adds one further untracked file.)

---

## 20. SECURITY ASSESSMENT — **SEC-001: CLOSED**

**Closed at the entry point, and closed structurally rather than by adding a check:** actor identity can no longer be supplied by the client (the body field is refused pre-lookup for non-admins, and resolves only through the canonical kernel for admins); the business is authorized for the acting profile before any business-scoped read; the Base44 role no longer confers standing; a suspended actor is refused centrally; a revoked or partially-revoked relationship is refused by the unchanged S3.0.2 predicate; and a failure to authorize produces a uniform refusal with no tenant-existence signal.

**Verified closed by:** 23 scenario assertions (including the required G1–G20), 12/12 mutations caught, 5 static invariants, and a **demonstration of the vulnerability in the pre-change revision** (B1: the same harness, the same payload, returned Business B's context in the baseline).

**Residuals — explicitly out of scope, unchanged, and recorded:**
- **SEC-010 (`primary_business_id` as authority) is NOT fixed by this slice.** `resolveActiveBusiness` still treats `requested === profile.primary_business_id` as definitionally authorized. What changed is *who* supplies that profile: it is now always a canonical profile (the actor's own, or a subject the actor is canonically entitled to act for). The comparison can no longer be attacker-chosen, so it can no longer *independently* grant access to a business the canonical profile was not already bound to. The pre-existing stale-primary concern remains exactly as the ledger records it.
- `service_role` is **contained, not removed** — deliberately, per the brief: the privileged client still exists, but every business-scoped read it performs now happens after the kernel has established actor + subject + authority.
- Behavior change to note for the failure contract: a registered Base44 user with **no canonical profile** now receives **404 `Profile not found`** (the shared kernel's contract) where the legacy code returned 403. This matches `supabaseUserData` and leaks nothing.

---

## 21. NEWLY DISCOVERED ISSUES

1. **The pre-change function was *already* canonical on the business-only path** (§1). This narrows SEC-001's true reach to the `profile_id` path and means the exploit required an explicit body field — consistent with every ledger treatment.
2. **Galileo's expert/advisor client view was broken before this slice** (baseline 403 for an active expert sending `active_business_id`, G20). The legacy predicate ignored relationships entirely. This slice restores it; it is the one *functional* behavior change and it is an intended, required improvement (G11).
3. **A tenant-existence oracle existed in the refusal *message*.** `requireBusinessContext` maps a missing business to a different message than an unauthorized one (both 403). This slice normalizes 403 denials in this function to its own existing generic `{ error: 'Forbidden' }`, which is also exactly what the pre-change code returned for a denied business — so contract compatibility is preserved and the oracle is removed (G16a).
4. **Defence in depth confirmed empirically:** the override gate and the canonical resolver are two independent refusals (M1), and the relationship query and predicate are two independent layers (M7). Either alone would be sufficient on this path.
5. **Not a defect, recorded for the next slice:** `admin` (non-super) still cannot request an unrelated business directly (G8c) — unchanged from baseline, and a candidate for an explicit product decision (SEC-019 territory) rather than a security fix.

---

**STOP FOR REVIEW — NOT COMMITTED, NOT PUBLISHED.**
No database change, no migration, no RLS/Storage/grant/Auth change, no UI change, no prompt or calculation change, no other backend function touched.

---

# §22 — FINAL PRE-COMMIT ADVERSARIAL REVIEW (second pass)

## 22.1 Product diff, block by block (`entry.ts`, +81 / −26)

| Block | Verdict |
|---|---|
| Kernel import `authenticateActor, resolveActingProfile, errorResponse` | **REQUIRED SECURITY CHANGE** — the controls are imported, not re-implemented |
| `business_id` destructured as `requested_business_id`; `profile_id` NO LONGER an identity binding | **REQUIRED SECURITY CHANGE** — the resource and the identity can no longer be confused |
| `try { actor → pre-gate 403 → resolveActingProfile → requireBusinessContext } catch { errorResponse(err) }` | **REQUIRED SECURITY CHANGE** — canonical binding + fail-closed error mapping (kernel throws → 401/403/404 instead of the old uncaught 500) |
| Pre-gate 403 for a non-admin naming a foreign `profile_id` | **REQUIRED SECURITY CHANGE** — and required for **G16b**: without it the resolver distinguishes foreign (403) from nonexistent (404), i.e. an existence oracle |
| 403 normalization to `{ error: 'Forbidden' }` | **REQUIRED SECURITY CHANGE** — removes the target-existence/tenant-existence signal; byte-identical to the pre-change denial body, so no contract loss |
| `const role = profile?.app_role \|\| null` (Base44 `user.role` fallback removed) | **REQUIRED SECURITY CHANGE** — the D4 route to standing; also stops `isSuperAdmin` (fed to the canonical-fact adapter, `consumerAdapter.ts:105-106`) from being inflatable by Base44 standing |
| `active_business_id \|\| business_id` precedence; existing 400 message; `if (denial) return denial` | **REQUIRED COMPATIBILITY CHANGE** — request contract, 400 ambiguity contract and payload shape preserved |
| `resolved_business_id` indirection; `profile_id` declared `let` | **TESTABILITY SUPPORT** — resolution must happen inside the guarded block and survive it; not semantic |
| P-S3 header block, inline rationale, header-contract rewrite (~40 lines of the 81) | **COMMENT / DOCUMENTATION** |
| — | **UNNECESSARY: none found.** |

**Can it be smaller?** No — without weakening one of the nine protected properties. Each removal candidate is falsified by a mutation:
- keep `profile_id` as identity → **M8/M1 caught by G4**;
- drop the pre-gate → **G16b** (oracle), and the gate's independent refusal is lost, so reproducing SEC-001 would take one edit instead of two;
- keep `|| user.role` → **M4 caught by G10**;
- call the resolver without the business contract → **M2b caught by G3**;
- drop the 403 normalization → the target-existence oracle returns (`requireBusinessContext` distinguishes not-found from unauthorized in its message).
The **executable** delta is ~35 lines; the remainder is documentation and the fail-closed wrapper.

## 22.2 Kernel duplication — orchestration only (verified, not asserted)

`grep "sb.from(" entry.ts` returns **only content reads** (lines 158–171 and 743). The function contains **zero** authorization queries of its own: no `profiles`, ownership, `business_owners`, `business_team_members`, `expert_advisor_access` or `advisor_assignments` read — **zero** role lists, **zero** relationship predicates, **zero** suspension checks. All of those live in `actor.ts` / `activeBusiness.ts` / `writeGuard.ts` / `relationshipAccess.ts` and are reached through the four imported primitives.

Downstream authority derivation (this function's callees): `consumerAdapter.ts:105-106` (`ctx.isSuperAdmin`, `ctx.profile?.app_role`) and `valuationContext.ts:129/154-167` (`profile.app_role`) — both read the **kernel-resolved profile**, and `user.role` appears in neither (grep: zero hits). Verdict: **necessary orchestration, no drift risk**; the residual risk it carried *before* P-S3 (`isSuperAdmin` obtainable from the Base44 role) is closed by the fallback removal.

## 22.3 Identity-field contract

| Body field | Final behavior |
|---|---|
| `profile_id` | **USED AS NON-AUTHORITY SUBJECT** — an untrusted *target hint*: self → own profile; canonical admin → subject; anyone else → 403 pre-lookup. Never the actor, never a role, never business authority. |
| `business_id` / `active_business_id` | **REQUESTED RESOURCE** (see 22.4) |
| `profileId`, `user_id`, `userId`, `email`, `role` | **NOT ACCEPTED BY CONTRACT / IGNORED** — never destructured or read anywhere in the function. M5 fabricated a `body.role` read and was caught by G9, proving the shipped code has none; identity email is read only inside the kernel, from the session. |

**Owner A + Business B + Business B owner's `profile_id`:** refused **before actor resolution or any lookup** (G4: 403, no context, no content read; G16b: indistinguishable from a nonexistent id). M1/M8 restore the pre-change path and are **caught by G4**, so the field cannot affect actor resolution or authorization.

## 22.4 Business-resource contract

Selector: `active_business_id || business_id`. Authorization call, in full:

```ts
const { businessId, denial } = await requireBusinessContext(sb, profile, requestedBusinessId, 'buildGalileoContext');
```
— line 107, strictly **before** `buildBusinessIntelligenceContract` (136), before the 14-way `Promise.allSettled` content block (157–172) and before the Base44 entity reads (177, 229). Static (S1 offsets), dynamic (G17a/G17b: no content table touched while refusing) and adversarial (**M3**: a read injected before the gate is caught).

## 22.5 Admin subject contract

ACTOR = canonical profile (`authenticateActor`; standing = `profiles.app_role` ∈ ADMIN_ROLES) · SUBJECT = `resolveActingProfile(target)` · BUSINESS = authorized for the **subject**. The Admin never becomes the client's owner: G8a/G8d payloads are **deep-equal to the baseline** (G19), the subject's own business is what gets authorized, and `activeBusinessId` is never mutated (the function reads and returns only). No client-supplied id can impersonate the subject: G16b, plus M4/M5 (fabricated standing) and M1/M8 (body-named subject) all caught.

## 22.6 Expert contract — aggressive verification

| Property | Evidence |
|---|---|
| active relationship → allowed | **G11** (200, b-B) |
| revoked relationship → denied | **G12**; existence-only authorization **M7 caught by G12** |
| `access_status != active` → denied | G13 + `relationshipRevocationAccess` R-series (`pending`, `revoked` variants; R18) |
| `revoked_at != null` → denied (partial revoke) | **G12b**; **M6 caught by G12b** |
| row existence alone → denied | M7 (caught) and R18 (a `revoked` row with NULL `revoked_at` still does not grant) |
| `advisor_assignments` | consulted **only** as the pre-existing canonical step 5 of `validateBusinessScope`; **the table does not exist in production** (established in P-S1; the harness mock reproduces the production `42P01` response — harness lines 75 / 166-167), so that branch can grant nothing. The expert grant comes from `expert_advisor_access` alone: not a new dependency, not reachable as a grant. |
| `primary_business_id` does not independently grant expert access | **M9** (authority from the subject's primary only) → **caught by G11** |
| foreign unrelated business → denied | G3 (owner form) / G13 (relationship-less actor) |
| expert cannot pivot via `profile_id` | **G22 (NEW, added this review)**: an expert *authorized for b-B* who names the client's `profile_id` is denied 403 with zero content reads — business access is not identity access |

## 22.7 Authorization-before-data — every read enumerated

**Identity/authorization metadata only** (all inside the kernel, before the gate): `profiles`, `business_entities` ownership columns, `business_owners`, `business_team_members`, `expert_advisor_access`, `advisor_assignments` (`42P01`).

**Business-content reads — every one after the gate:** `business_entities`(158, `select('*')` profile row), `dashboard_metrics`(159), `business_metric_snapshots`(160), `business_assessments`(161), `business_opportunities`(162), `next_best_actions`(163), `roadmap_items`(164), `value_creation_events`(165), `documents`(166), `advisor_notes`(167), `ninety_day_sprint_paths`(169), `extracted_fields`(170), `strategy_outcomes`(171), `ninety_day_sprint_tasks`(743); plus Base44 `ReadinessItem`(177) and `GalileoConversation`(229), and the four post-gate calls `buildBusinessIntelligenceContract`(136), `loadCanonicalFactsForConsumer`(351), `fetchCanonicalRecommendations`(907), `buildGalileoValuationContext`(919). `KnowledgeBaseEntry`(168) is global published content, not tenant data.

**`service_role` containment:** it remains, but every business-scoped read it performs is now downstream of the kernel decision — G17a/G17b/M3 prove the ordering, so privileged reads cannot precede authorization.

**Profile-scoped reads follow the ACTING subject** (G21: `advisor_notes` filtered by `p-expert`, never the client's id). Consequence, stated plainly: an expert's Galileo context carries the *expert's own* notes/sprint/readiness/conversation blocks alongside the client's **business-scoped** blocks. This is **not a functional regression** — the live caller (`GalileoPanel.jsx`, which sends `active_business_id` and no `profile_id`) already resolved to the actor's own profile pre-change; what disappears is the illegitimate `profile_id` variant that returned the client's profile-scoped private blocks to a third party. Least-data direction; it must not be "restored" through the body field.

## 22.8 Failure contract (no change to the shared kernel)

| Condition | Response | Signals exposed |
|---|---|---|
| unauthenticated | 401 `{ error: 'Unauthorized' }` | nothing |
| suspended | 403 (kernel) | nothing |
| **no canonical profile** | **404 `{ error: 'Profile not found' }`** | the caller's own account state |
| unauthorized business | 403 `{ error: 'Forbidden' }` | **identical** to nonexistent business (G16a) |
| nonexistent business | 403 `{ error: 'Forbidden' }` | identical |
| revoked / partially revoked expert | 403 `{ error: 'Forbidden' }` | no relationship state revealed |
| ambiguous multi-business, no context | 400 `BUSINESS_CONTEXT_REQUIRED` | caller-actionable by design |

**Oracles checked:** profile existence (G16b — identical), business existence (G16a — identical), tenant identity (no id/name in any refusal), relationship state (generic 403, no reason), document existence (the refusal path never queries `documents`; G17a proves the table is untouched). **Remaining, flagged:** the 400 body names the ambiguity contract (intended), and the 404 discloses only that the caller has no canonical profile.

**Classification of the 404 change: ACCEPTABLE FOR THIS SLICE.** (1) It is the shared kernel's contract, identical to `supabaseUserData`'s, so platform behaviour is consistent; (2) it reveals the caller's own account condition, never a third party's; (3) it cannot be produced by a foreign id — those are refused earlier by a single 403 (G16b); (4) changing it would mean editing `actor.ts`, which this slice is forbidden to touch. **Not** a reason to block the commit.

## 22.9 Baseline exploit proof — actual git source, pinned

The harness executes **both** revisions through the same esbuild+vm pipeline and the same instrumented mock — never a reimplementation. The pre-change source is resolved as the parent of the commit that added the harness, and this review **verified** that:

- `self_commit = 6add15b`, `pinned_rev = 6add15b^` → **the pinned source CONTAINS the defect** (`let { … profile_id }` and the `user.role` fallback present);
- `HEAD` → **does NOT contain the defect** (HEAD is the fix).

That pinning was **required by this review**: after the auto-commit, reading `HEAD` alone would have silently stopped being the vulnerable revision and B1/B2/B3/G20/S5 would have gone vacuous or spurious. S5 asserts the defect's presence in the baseline source statically; B1 shows the attacker request returning **200 + Business B's context** in the baseline and **403 + zero content reads** in the new source.

## 22.10–22.11 F-series allowlists — analysis and permitted rebase

All four failures were **change-surface metadata only**; no behavioral or security assertion failed in any suite. Each was already red before P-S3, because the *committed* ledger reports appear in the surface it computes and were not in its allowlist.

| Suite | Failing assertion | Offending entries (before) | Minimal rebase applied |
|---|---|---|---|
| `adminCanonicalActor.test.cjs` | F2 (frontend), F3 (backend) | `src/SECURITY_LEDGER_P_S1_BOUNDARY2_VERIFICATION.md`; `base44/functions/buildGalileoContext/entry.ts` | explicit `APPROVED_REPORTS` list (3 named reports) applied to F2; `P_S3_BACKEND` (1 function) added to F3 |
| `relationshipRevocationAccess.test.cjs` | F1 (exact surface), F5 (frontend) | the two root reports, the P-S3 entry, the P-S3 harness, the `src` ledger report | `P_S3_FILES` (3) + `APPROVED_REPORTS` (2) added to `ALLOWED`; F5 exempts the named reports |
| `documentSignedUrlAuthorization.test.cjs` | F1 (exact surface), F3 (frontend) | as above | the same two constants added to F1's expected set; F3 exempts the named reports |
| `adminDocumentViewer.test.cjs` | F1b (working surface since P5) | the two root reports, the P-S3 entry, the P-S3 harness, the `src` ledger report | `EXPECTED_WORKING` extended with `P_S3_FILES` + the three rebased harnesses |
| `galileoContextActorBinding.test.cjs` (this slice's own) | F1/F2 | written for the *uncommitted* state (`git diff HEAD` + untracked) | surface unioned from `SELF_COMMIT^` + working tree + untracked (reads identically before and after the commit); **baseline pinned** to `SELF_COMMIT^` |

**Proof that no behavioral or security assertion was touched** (machine-checked): removed lines across the five harnesses were scanned for behavioral markers (`check('W…/R…/M…/E…/O…/S…/G…/P…/H…/N…/C…/T…`, `CASES =`, `MUTATIONS =`, `ACTIVE_*`, `IMMUTABLE`) → **0 matches**. Only allowlist constants, the F-assertions' own predicates and their comments changed. Net behavioural delta this review: **+1 assertion (G22), 0 removed, 0 weakened.**

## 22.12 Final verification (post-rebase)

| Suite | Exit | Assertions |
|---|---|---|
| `galileoContextActorBinding` (P-S3) | **0** | **52 PASS** (51 + G22) |
| `adminCanonicalActor` | **0** | 125 PASS — *was red (F2/F3)* |
| `relationshipRevocationAccess` | **0** | 78 PASS — *was red (F1/F5)* |
| `documentSignedUrlAuthorization` | **0** | 103 PASS — *was red (F1/F3)* |
| `adminDocumentViewer` | **0** | 56 PASS — *was red (F1b)* |
| `documentAccessAuthorization` | **0** | 45 PASS |
| `adminRouteAccess` | **0** | 41 PASS |
| `adminWorkspaceAccess` | **0** | 66 PASS |
| `getDocumentsAdmin.s3.mock` | **0** | 50/50 |
| `architectureGuard` | **0** | 766 files checked |
| `businessContextContract` | 1 | **pre-existing debt** (`ownershipConcentrationEngine` canonical import) — untouched, by instruction |
| `certify-intelligence-contract` | 1 | **baseline-identical** — sole failing check is an unrelated frontend cache key (`src/pages/DocumentUpload.jsx:265`, key `'business-intelligence-contract'` missing `business_id`); the script does not reference `buildGalileoContext` |

**Build: exit 0** (`vite build`). Ten of twelve suites green; the two reds are documented pre-existing debt, unrelated to this slice.

## 22.13 Final git surface (authoritative)

```
git diff --name-only HEAD
SECURITY_P_S3_GALILEO_ACTOR_BINDING_REPORT.md
scripts/adminCanonicalActor.test.cjs
scripts/adminDocumentViewer.test.cjs
scripts/documentSignedUrlAuthorization.test.cjs
scripts/galileoContextActorBinding.test.cjs
scripts/relationshipRevocationAccess.test.cjs

git status --porcelain
 M SECURITY_P_S3_GALILEO_ACTOR_BINDING_REPORT.md
 M scripts/adminCanonicalActor.test.cjs
 M scripts/adminDocumentViewer.test.cjs
 M scripts/documentSignedUrlAuthorization.test.cjs
 M scripts/galileoContextActorBinding.test.cjs
 M scripts/relationshipRevocationAccess.test.cjs
```

Already committed by the platform as `6add15b`: **PRODUCT** (`base44/functions/buildGalileoContext/entry.ts`), **P-S3 SECURITY HARNESS** (`scripts/galileoContextActorBinding.test.cjs`), **REPORT** (this file). Pending above: **ALLOWLIST-ONLY HARNESS MAINTENANCE** (5 files) and this report's §22. **No unexplained file.**

## 22.14 Recommendation

**APPROVE COMMIT** — for the pending delta only (the five harness files + this report). Recommended file list: exactly those paths. Recommended subject:

```
Rebase change-surface allowlists for the P-S3 security slice
```

The product commit already exists as `6add15b` with a platform-generated subject. The recommended product subject — `Close SEC-001 Galileo cross-tenant context authorization` — differs from it; **recommendation: do not rewrite history**; the corrected framing lives in this report.

**SEC-001: CLOSED.** Residuals unchanged and out of scope: SEC-010 (`primary_business_id` semantics, now reachable only with a canonical profile) and `service_role` containment.

**Remaining related debt:** the four change-surface allowlists remain exact-equality lists that must be re-based at every legitimate slice (structural fragility of the harness convention, not a security weakness — flagged for a future test-infrastructure slice); `certify-intelligence-contract` cache-key debt; `ownershipConcentrationEngine` canonical-import debt.