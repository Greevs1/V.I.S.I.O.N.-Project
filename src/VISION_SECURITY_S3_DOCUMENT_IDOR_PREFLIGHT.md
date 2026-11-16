# VISION SECURITY — PHASE S3 DOCUMENT IDOR/BOLA PRE-FLIGHT

**Phase:** S3 — Document Authorization Remediation, Step 1 (pre-implementation trace)
**Endpoint:** `base44/functions/getDocumentsAdmin/entry.ts` (104 lines — read in full)
**Status:** ✅ **TRACE COMPLETE — NOT IMPLEMENTED.** No code, schema, policy, or deployment changed.

> S2 is verified closed: `target_policies_remaining = 0`, `total_storage_object_policies = 0`, all three buckets private. **Storage policies are not touched by S3.**

---

## 1. EXACT VULNERABILITY

`getDocumentsAdmin` authorizes on **role alone** and then acts on a **client-supplied document UUID**, without ever loading the resource's tenant or authorizing the actor against it.

Three distinct holes live in this one function. **Two of them are worse than the one originally reported.**

### V-1 — `delete` : no lookup, no authorization, no tenant (CRITICAL)

```
:42  const { document_id } = body;
:44  await sb.from('documents').delete().eq('id', document_id)
```

The row is **never read before deletion**. There is no ownership check, no business check, no profile check — only the role gate at `:23`. Any actor passing that gate deletes **any** document row by UUID, including rows in `client_documents` buckets belonging to businesses they have no relationship with.

This is the most severe of the three: it is destructive, unconditional, and reachable from the UI (see §6).

### V-2 — `query` : unvalidated `bucket` ⇒ full cross-tenant enumeration (CRITICAL)

```
:65-70  const { bucket = 'consulting_library_files', target_profile_id, target_business_id, limit = 200 } = body;
:80-90  if (bucket === 'consulting_library_files') { ... }
        else if (bucket === 'documents') { ... }
        else { if (target_profile_id) ...; if (target_business_id) ... }   ← NO bucket constraint
:72-73  .select('*').order(...).limit(limit)
```

`bucket` is an **unconstrained free string**. Only two literal values apply a real scope. Any other value falls into the `else` branch, which applies *only* the optional filters — so with no filters supplied, the query returns `select('*')` of up to 200 documents spanning **every bucket and every business**.

```
{ "bucket": "x", "limit": 200 }   →  200 full document rows, all tenants
```

`select('*')` includes `file_path`, `file_url`, `business_id`, `profile_id` — enough to enumerate paths and pivot into V-1 and V-3. **This hole was not in the original finding.**

### V-3 — `getSignedUrl` : 900-second URL for any document (HIGH)

```
:51-54  const { document_id } = body;
        sb.from('documents').select('id, file_path, storage_bucket').eq('id', document_id).maybeSingle()
:57-59  const bucket = doc.storage_bucket || 'consulting_library_files';
        sb.storage.from(bucket).createSignedUrl(doc.file_path, 900)
```

The row **is** loaded — but only `file_path` and `storage_bucket` are selected, and **no authorization of any kind follows**. Any actor passing the role gate receives a working 15-minute download URL for any document in the platform.

**Note on reachability:** this action has **zero callers** (§5). It is dead from the UI but live as a directly invocable endpoint on the published app. Dead code is not a mitigation.

---

## 2. CURRENT CALL GRAPH

```
src/components/admin/AdminFiles.jsx
   │
   ├─ :54  base44.functions.invoke('getDocumentsAdmin', {})
   │        └─→ action: query (default)  bucket='consulting_library_files'  → list consulting library
   │
   └─ :91  base44.functions.invoke('getDocumentsAdmin', { action:'delete', document_id: doc.id })
            └─→ action: delete          document_id = row id from the list above
```

**Total external callers: 2, both in one component.** The `getSignedUrl` action has no caller anywhere in `src/` or `base44/`.

Document **preview** in that same component does **not** use this function — `useDocumentViewer.js:38-42` routes previews to `supabaseUserData.getDocumentSignedUrl`. So the admin Files view reads via `getDocumentsAdmin` and previews via `supabaseUserData`.

---

## 3. CURRENT AUTHORIZATION BEHAVIOR (per action)

| Action | Params from body | Auth call | Actor/role resolution | Resource lookup | Business authz | Assignment authz | Signed URL | Delete |
|---|---|---|---|---|---|---|---|---|
| `delete` | `document_id` | `auth.me()` :20 | `user.role` :23 | **none** | **none** | **none** | — | `documents` row only |
| `getSignedUrl` | `document_id` | `auth.me()` :20 | `user.role` :23 | by id :53 | **none** | **none** | 900 s :59 | — |
| `query` (default) | `bucket`, `target_profile_id`, `target_business_id`, `limit` | `auth.me()` :20 | `user.role` :23 | filters only | **none** | **none** | — | — |

**Role gate (`:23`):** `admin | super_admin | advisor`. No `owner`, no `team_member`, no `expert`.

**Universal observation:** the function never resolves a canonical profile. It authorizes on the **Base44** role only, then performs service-role operations. Per `base44/shared/authz/actor.ts:28`, *"Service role is database capability, NOT authorization."* This function treats the role gate as sufficient authorization for a resource it has not identified the owner of.

**Delete behavior:** deletes the `documents` **database row only**. It does **not** touch Storage and does **not** delete `document_analysis` children — note that `supabaseUserData.deleteDocument:1373` *does* clear children first. So this path orphans analysis rows as well as the storage object.

---

## 4. SAFE-REFERENCE ANALYSIS

### 4.1 `supabaseUserData.getDocumentSignedUrl` (`:1306-1353`) — the reference

| Question | Answer |
|---|---|
| Actor authenticated | `base44.auth.me()` :20, then `getProfile()` :1307 |
| Profile resolved | `profiles.email = resolvedEmail` (`:64-69`) — **email only** |
| Document loaded | `select('id, file_path, profile_id, business_id')` by id :1319 |
| Not found | 404 :1322 |
| Business derived from row | **yes** — `doc.business_id` drives every branch |
| Owner check | `doc.profile_id === profile.id` :1336 |
| Advisor check | `advisor_assignments` row for `doc.business_id` :1327-1330 |
| Team membership | **not directly** — only via the `else` branch's `assertBusinessAccess` |
| Assignment checked | **no** (correctly — assignment grants nothing) |
| Admin | `['admin','super_admin']` short-circuit :1324 |
| `profile_status` | **not checked** |
| Expiry | 900 s |
| Fails closed | **yes** — advisor + null `business_id` → 403 :1331; owner + no ownership + no business → 403 :1342 |
| **Order** | **Authorization at :1323-1342 precedes `createSignedUrl` at :1350 — correct** |

**Verdict: the pattern is sound in structure and must be reused — but it has two real defects (E below).**

**Defect 1 — the advisor branch bypasses the canonical rule.** It queries `advisor_assignments` directly instead of calling `validateBusinessScope`. Consequences:
- it **never checks `status !== 'revoked'`** — `writeGuard.ts:151` does. **A revoked advisor still receives signed URLs.**
- it ignores `business_entities.assigned_advisor_id` (`writeGuard.ts:98`), `business_owners`, `business_team_members`, and `expert_advisor_access`. So it is *narrower* in those cases — it fails closed, which is safe but can deny legitimate people.
- It is a **second, divergent copy** of the authorization rule. That is the exact drift `actor.ts` was written to eliminate.

**Defect 2 — the `else` catch-all.** Every role that is not `admin`/`super_admin`/`advisor` falls into the owner branch: `owner`, `team_member`, `expert`, `user`, empty, or null. Because that branch calls `assertBusinessAccess` it is *correct in effect*, but the fall-through means an unrecognized role is treated as owner rather than denied.

**Defect 3 — email-keyed profile resolution.** `base44/shared/authz/actor.ts:73` resolves `base44_user_id` first and falls back to email, and is the canonical helper. The reference predates it.

### 4.2 The genuinely canonical layer — reuse this, not the reference verbatim

| Helper | File | What it enforces |
|---|---|---|
| `authenticateActor` | `authz/actor.ts:73` | actor from trusted auth only; profile via `base44_user_id`, email fallback; role, `isAdmin`, `isSuperAdmin` |
| `authorizeBusinessAccess(sb, actor, businessId)` | `authz/actor.ts:210` | admin short-circuit, else `validateBusinessScope`; throws `HttpError(403)` |
| `assertBusinessAccess(sb, businessId, profile, {action})` | `businessScope/activeBusiness.ts:173` | **record-derived** business; `primary_business_id` shortcut then `validateBusinessScope`; throws `BUSINESSLESS_RECORD` (409) when the record has no business |
| `validateBusinessScope(sb, business_id, profile_id)` | `businessScope/writeGuard.ts:65` | the seven-rule canonical rule (see §5) |
| `errorResponse(error)` | `authz/actor.ts:226` | status-preserving, non-leaking error mapping |

`assertBusinessAccess` is documented at `activeBusiness.ts:171` as **"authorize the actor against a business_id that came from a RECORD (not from the request)"** — precisely this case.

### 4.3 `documentAssignments` — the architectural precedent to follow

Its header states the intended model explicitly:

> *AUTHORIZE THE ACTOR → validateBusinessScope() … VERIFY THE RESOURCE → the document must belong to that business … (§12 — assignment grants nothing new)*

It is the only document function that performs the full sequence, and it is the template S3 should match.

---

## 5. INTENDED DOCUMENT ACCESS SEMANTICS (from existing architecture)

`validateBusinessScope` (`writeGuard.ts:65-200`) is the canonical rule and is explicitly documented as mirroring `can_access_business()` — the same predicate every business-scoped RLS policy uses. It grants for:

1. owner — `business_entities.profile_id`
2. assigned advisor — `business_entities.assigned_advisor_id`
3. team member — `business_team_members`
4. owner record — `business_owners`
5. advisor assignment — `advisor_assignments`, **`status !== 'revoked'`**
6. expert access — `expert_advisor_access`
7. super_admin — `profiles.app_role`

### Who may VIEW a business document today

| Actor | May view? | Basis |
|---|---|---|
| **OWNER** | ✅ own business | `business_entities.profile_id`; also owner-of-record by `documents.profile_id` when the doc has no business |
| **TEAM MEMBER** | ✅ own business | `business_team_members` |
| **ASSIGNED ADVISOR** | ✅ assigned business | `assigned_advisor_id` **or** non-revoked `advisor_assignments` |
| **DOCUMENT ASSIGNEE** | ⚠️ **not automatically** | `documentAssignments` §12 — *"assignment grants nothing new."* Access requires an independent business relationship. |
| **EXPERT** | ✅ granted business | `expert_advisor_access` |
| **SUPER ADMIN** | ✅ all | rule 7 / admin short-circuit |
| **ADMIN** | ✅ all | `actor.ts:212` admin short-circuit |
| **UNRELATED ADVISOR** | ❌ **deny** | no relationship to that business |
| **UNRELATED USER** | ❌ **deny** | no relationship to that business |

**Explicitly confirmed as non-granting:** a document assignment; a notification; knowing a UUID; a client-supplied `business_id`.

### The four rules this imposes

1. **The resource owns its tenant.** `business_id` comes from the loaded `documents` row — never from the request.
2. **Assignment ≠ access.** An assignee without a business relationship is denied.
3. **Notification ≠ access.** Deep links resolve to a document only if the recipient independently passes the business rule.
4. **UUID ≠ access.** Identification is not authorization.

---

## 6. CALLER INVENTORY

| # | Caller | Action | Params | Expected actor | Expected relationship | Breaks under patch? |
|---|---|---|---|---|---|---|
| 1 | `AdminFiles.jsx:54` | query (default) | `{}` | admin / super_admin | platform staff, `consulting_library_files` | **No** — admin short-circuit preserves it |
| 2 | `AdminFiles.jsx:91` | delete | `document_id` from list | admin / super_admin | platform staff, library file | **No** for admins. ⚠️ **Yes for advisors** — see below |
| 3 | *(none)* | getSignedUrl | — | — | — | **No caller exists** |

**Reachability note — this matters for the delete hole.** In `AdminView.jsx:28` the `files` tab is declared `superAdminOnly: false`, and the `/admin` route in `src/App.jsx` is guarded only by `ProtectedRoute` (authenticated), not by role. An **advisor** who navigates to `/admin` gets the Files tab rendered, with a working delete button, and passes the function's role gate at `:23`.

**The only workflow that changes behavior:** an advisor using the admin Files view loses delete. Judged against existing semantics this is a **correction, not a regression** — the canonical delete path `supabaseUserData.deleteDocument:1372` grants delete to `admin | super_admin | profile owner` and has **no advisor branch at all**. The header of `getDocumentsAdmin` also describes the surface as *"Admin → Files view."* Advisors deleting platform library files was never an intended capability.

---

## 7. VIEW / DELETE DISTINCTION

They must be authorised separately, and the existing codebase already treats them differently:

| | `supabaseUserData.getDocumentSignedUrl` (VIEW) | `supabaseUserData.deleteDocument` (DELETE) |
|---|---|---|
| admin / super_admin | ✅ | ✅ |
| owner-of-record (`doc.profile_id`) | ✅ | ✅ |
| business relationship (`validateBusinessScope`) | ✅ via `assertBusinessAccess` | ❌ **not granted** |
| advisor | ✅ via `advisor_assignments` | ❌ **not granted** |
| team member / expert | ✅ via the `else` branch | ❌ |

**Established semantics: viewing is broad (anyone with a business relationship); deleting is narrow (owner-of-record or admin).**

`getDocumentsAdmin` currently inverts this — it grants delete to advisors with no check whatsoever while denying view to owners.

### ⚠️ Ambiguity to FAIL CLOSED on

Two questions are genuinely ambiguous and must **not** be resolved by broadening:

1. **May an assigned advisor delete a client document?** The canonical delete path says no. `getDocumentsAdmin`'s role gate says yes. **Resolve as NO** — matching the canonical path. Broadening to preserve an accident is exactly what the brief forbids.
2. **May a business owner delete their own documents?** The canonical path says **yes** (`doc.profile_id === profile.id`). `getDocumentsAdmin` cannot express this at all, because owners are excluded by its role gate. **Resolve as YES** — this is an existing, explicit semantic.

---

## 8. CROSS-BUSINESS ATTACK TRACE

**Scenario:** Advisor A is legitimately assigned to Business A. Document X belongs to Business B. Advisor A knows Document X's UUID.

### 8.1 VIEW / SIGNED URL — `{ action: 'getSignedUrl', document_id: X }`

| | Result |
|---|---|
| **CURRENT** | `:53` loads X, `:59` mints a **900-second signed URL**, `:61` returns it. Advisor A downloads Business B's document. **The role gate at `:23` is the only check, and it passes.** |
| **REQUIRED** | **DENY.** `authenticateActor` → load X → `business_id = X.business_id` (= Business B) → `assertBusinessAccess(actor, Business B)` → Advisor A has no relationship ⇒ **403**. Return **404** if the application's convention is non-disclosure; `:55` already returns 404 for a missing document, so 404 is consistent. |

### 8.2 DELETE — `{ action: 'delete', document_id: X }`

| | Result |
|---|---|
| **CURRENT** | `:44` deletes row X. **The row is never read, so no tenant is ever derived.** Business B's document row is gone; its `document_analysis` children and storage object are orphaned. Returns `{success:true}`. |
| **REQUIRED** | **DENY.** Load X first → derive Business B → authorize DELETE (owner-of-record or admin) → Advisor A is neither ⇒ **403/404**. Nothing deleted. |

### 8.3 Cross-tenant enumeration — `{ bucket: 'x' }`

| | Result |
|---|---|
| **CURRENT** | Returns up to 200 full rows across every bucket and business, including `file_path` and `business_id`. |
| **REQUIRED** | **DENY** — reject an unrecognized `bucket` with **400**, and scope any non-admin query to the actor's own authorized businesses. |

---

## 9. CLIENT-SUPPLIED IDENTIFIER CLASSIFICATION

| Identifier | Accepted by | Classification | Rule |
|---|---|---|---|
| `document_id` | `delete`, `getSignedUrl` | **IDENTIFIER ONLY** | May name the resource. Must never prove authorization. |
| `bucket` | `query` | **UNSAFE AUTHORIZATION INPUT** | Currently selects the entire scope. Must be whitelisted; never a free string. |
| `target_profile_id` | `query` | **AUTHORIZATION INPUT → currently unsafe** | Must not widen scope beyond the actor's own reach. |
| `target_business_id` | `query` | **UNSAFE AUTHORIZATION INPUT** | Must **never** override a document-derived business. Must be *validated against the actor*, not trusted. |
| `limit` | `query` | IDENTIFIER ONLY (bounded) | Cap server-side. |
| `action` | all | IDENTIFIER ONLY | Routes behavior. Not authorization. |

**Target architecture (per brief):** `document_id` identifies; `business_id` supplied by the client must never override `doc.business_id`; `profile_id`/`user_id` must never define the actor. `getDocumentsAdmin` **never resolves a profile from the body today — but it also never resolves the actor's profile at all.** Both halves must be fixed.

---

## 10. SIBLING VULNERABILITIES (report only — do NOT fix in S3)

Scanned every function touching `sb.from('documents')` (33 functions). Two genuine siblings found.

### S-1 — `checkDocumentAnalysisById` — naked IDOR (HIGH)

```
:11  base44.auth.me()                     ← the ONLY check
:32  const { documentAnalysisId } = body;
:34  sb.from('document_analysis').select('*').eq('id', documentAnalysisId).maybeSingle()
:40  return Response.json({ analysis })
```

Any authenticated user — no role gate, no ownership check, no business check — supplies an analysis UUID and receives the **entire row**, including `extracted_data`, `summary`, `ai_findings`, `business_id`, and `profile_id`. This is financial document intelligence belonging to an arbitrary business. **Structurally identical to V-3, with a wider payload.**

### S-2 — `createDocumentAnalysis` — identity-from-body + tenant injection (HIGH)

```
:38  const { document_id, profile_id, business_id, document_type } = body;
:56  if (doc.profile_id !== profile_id)   ← authorizes against the BODY's profile_id
:65  business_id: business_id || doc.business_id || null   ← BODY overrides the document's tenant
```

Two defects in the exact class `actor.ts:1-37` was written to eliminate:
1. **The authorization reference comes from the request body.** The caller supplies the `profile_id` being checked against. Anyone who knows a `document_id` and its owning `profile_id` passes the check.
2. **A client-supplied `business_id` overrides the document's own tenant** when the analysis row is written — cross-tenant data injection into `document_analysis`.

Low *severity* today only because its normal caller is server-to-server from `uploadDocumentToSupabase`. The endpoint remains directly invocable.

### Reviewed and judged LOWER risk (admin-gated, deferred)

| Function | Gate | Note |
|---|---|---|
| `updateDocumentAnalysisStatus` | admin/super_admin only (`:23`) | acts on client `document_id`, no business scoping — admin-trusted |
| `resetDocumentAnalysisStatus` | admin/super_admin only (`:13`) | same |
| `auditAssignmentAccessControl` | admin/super_admin only (`:15`) | diagnostic surface |
| `runDocumentExtraction` | has role logic (`:77-85`) | needs a dedicated read before judging |
| `getMetricAutoPopulate` | `auth.me()` present (`:23`) | joins documents via extracted-field `document_id`; scope unclear — needs a read |

### Verified CLEAN (reference implementations — do not touch)

| Function | Why clean |
|---|---|
| `documentAssignments` | full sequence: authenticate → resolve → `validateBusinessScope` → verify document belongs to that business; §12 assignment grants nothing |
| `supabaseDocumentData.getDocumentAnalysisQueue` | advisor scoped to `advisor_assignments`; non-advisor scoped to `profile_id`; empty rather than unscoped when no assignments |
| `worksheetResponses` | inline `ownsDoc` / `isAssigned` / `isAdvisorAssigned` checks before minting |
| `uploadDocumentToSupabase` | profile from auth, `validateBusinessScope` (scope_check=2) |

**S3 scope: `getDocumentsAdmin` only.** S-1 and S-2 are recorded for S4.

---

## 11. PROPOSED MINIMAL PATCH

**Constraint honoured: reuse the existing authorization architecture — no second one, no Security Kernel.**

### Imports (add)

```ts
import {
  authenticateActor, authorizeBusinessAccess, errorResponse, HttpError,
} from '../../shared/authz/actor.ts';
import { assertBusinessAccess } from '../../shared/businessScope/activeBusiness.ts';
```

### One private helper — the single chokepoint

```ts
// Load the document and authorize the actor against the tenant derived FROM THE ROW.
// Never trusts a body-supplied business_id. Fails closed. 404 when not disclosable.
async function loadAuthorizedDocument(sb, actor, documentId, mode /* 'view' | 'delete' */) {
  if (!documentId) throw new HttpError(400, 'document_id required');

  const { data: doc } = await sb.from('documents')
    .select('id, profile_id, business_id, storage_bucket, file_path')
    .eq('id', documentId).maybeSingle();

  if (!doc) throw new HttpError(404, 'Not found');

  // Platform staff — unchanged from today's behavior.
  if (actor.isAdmin) return doc;

  // DELETE is narrower than VIEW (see §7): owner-of-record only.
  if (mode === 'delete') {
    if (doc.profile_id && doc.profile_id === actor.profile_id) return doc;
    throw new HttpError(404, 'Not found');
  }

  // VIEW — owner-of-record, or any actor with a relationship to the DOCUMENT'S business.
  if (doc.profile_id && doc.profile_id === actor.profile_id) return doc;
  if (doc.business_id && actor.profile) {
    try {
      await assertBusinessAccess(sb, doc.business_id, actor.profile, { action: 'viewDocument' });
      return doc;
    } catch { /* fall through to denial */ }
  }
  throw new HttpError(404, 'Not found');   // businessless + non-owner ⇒ fail closed
}
```

### `delete` action (replaces `:41-47`)

```ts
if (body.action === 'delete') {
  const actor = await authenticateActor(base44, sb);
  const doc = await loadAuthorizedDocument(sb, actor, body.document_id, 'delete');
  await sb.from('document_analysis').delete().eq('document_id', doc.id);   // match the canonical order
  const { error } = await sb.from('documents').delete().eq('id', doc.id);
  if (error) throw new Error(error.message);
  return Response.json({ success: true });
}
```

### `getSignedUrl` action (replaces `:50-62`)

Identical shape — authorize **before** minting:

```ts
const actor = await authenticateActor(base44, sb);
const doc = await loadAuthorizedDocument(sb, actor, body.document_id, 'view');
if (!doc.file_path) return Response.json({ error: 'No file_path' }, { status: 400 });
const { data: signed, error } = await sb.storage
  .from(doc.storage_bucket || 'consulting_library_files')
  .createSignedUrl(doc.file_path, 900);          // lifetime preserved — later slice
if (error) throw new Error(error.message);
return Response.json({ signedUrl: signed.signedUrl });
```

*(This action has no caller. Authorizing it is the minimal correct change; deleting it is a legitimate alternative for a later cleanup slice. Either is safe.)*

### `query` action (replaces `:64-98`)

Two fixes, both required:

```ts
// 1. Whitelist the bucket — an unrecognized value is a 400, never a global query.
const ALLOWED_BUCKETS = ['consulting_library_files', 'documents'];
if (!ALLOWED_BUCKETS.includes(bucket)) {
  return Response.json({ error: 'Invalid bucket' }, { status: 400 });
}

// 2. Non-admins may only read businesses they are authorized for.
//    target_business_id is VALIDATED against the actor, never trusted.
if (!actor.isAdmin) {
  if (!target_business_id) {
    return Response.json({ error: 'An authorized business is required' }, { status: 403 });
  }
  await authorizeBusinessAccess(sb, actor, target_business_id);  // throws 403 if unauthorized
}
```

Then the existing bucket-scoping block runs unchanged.

### Wrap the handler in `errorResponse`

Replaces the generic 500 catch at `:100-103` so 403/404/409 survive and internals never leak.

### What the patch deliberately does NOT do

Not touching: storage policies · schema · Supabase Auth · signed-URL lifetimes · `file_url` · object paths · orphan cleanup · MIME/size limits · `client-documents` · `consulting_library_files` · S-1 · S-2 · the Security Kernel.

**Net diff: ~3 imports, 1 helper (~20 lines), 3 action bodies. No new authorization architecture.**

---

## 12. REGRESSION RISKS

| # | Risk | Assessment | Mitigation |
|---|---|---|---|
| R1 | Advisor loses delete on the admin Files view | **Accepted — intended correction.** Canonical delete path never granted advisors delete. | Confirm with product; document in the change note |
| R2 | `authenticateActor` resolves via `base44_user_id` where this function previously used `user.role` only | **Low.** `actor.ts:97-109` falls back to `base44Role`, so an unmapped profile still yields the correct role and correct `isAdmin` | Verify an admin with no `base44_user_id` mapping still passes |
| R3 | Admin library delete stops working if `profiles` lookup fails | Admins short-circuit at `actor.isAdmin` before any profile need — but `isAdmin` depends on role resolution | Test: admin deletes a library file |
| R4 | `assertBusinessAccess` throws `BUSINESSLESS_RECORD` (409) on a null `business_id` | Caught inside the helper, converted to 404 | Test: businessless document + non-owner → denied |
| R5 | Query now requires `target_business_id` for non-admins | AdminFiles always sends `{}` (defaults to `consulting_library_files`) and its caller is admin ⇒ short-circuited | Test: admin query with `{}` still returns the library |
| R6 | Owner-of-record view newly allowed (owners were previously excluded by the role gate) | **Expansion of VIEW to owners — but only to documents they already own.** Matches `supabaseUserData` semantics exactly | Covered by the patch's own intent; confirm no owner-side caller regresses |
| R7 | `errorResponse` changes error bodies | Status codes become *more* precise, never less | Verify the UI's `res.data?.error` reads still render |

---

## 13. ADVERSARIAL TEST MATRIX

**No test may use a real customer document destructively.** Deletion tests must run against a disposable document created for the test in a non-production project. View/URL tests may use test objects only.

### VIEW / SIGNED URL

| # | Actor | Target | Expected |
|---|---|---|---|
| 1 | OWNER | own business document | **ALLOW** |
| 2 | OWNER | other business document | **DENY** |
| 3 | ASSIGNED ADVISOR | assigned business document | **ALLOW** (per §5 rules 2 & 5) |
| 4 | ASSIGNED ADVISOR | unassigned business document | **DENY** |
| 5 | TEAM MEMBER | own team business document | **ALLOW** (rule 3) |
| 6 | DOCUMENT ASSIGNEE **without** business access | assigned document | **DENY** (§5 — assignment grants nothing) |
| 7 | UNRELATED USER | known document UUID | **DENY** |
| 8 | UNRELATED ADVISOR | known document UUID | **DENY** |
| 9 | SUPER ADMIN | any document | **ALLOW** |
| 10 | any | invalid UUID | **DENY safely** (400/404, no stack) |
| 11 | any | nonexistent UUID | **DENY safely** (404) |
| 12 | any | document with `business_id = null`, actor is not owner | **DENY** (fail closed) |
| 13 | any | document with `business_id = null`, actor IS owner-of-record | **ALLOW** |
| 14 | any | client `business_id` ≠ `doc.business_id` | **document row wins; DENY** on the real tenant |
| 15 | REVOKED ADVISOR | previously-assigned business document | **DENY** ← *currently ALLOWED by the reference's advisor branch* |

### DELETE (separate, disposable objects)

| # | Actor | Target | Expected |
|---|---|---|---|
| 16 | OWNER | own document | **ALLOW** |
| 17 | OWNER | other business document | **DENY** |
| 18 | ASSIGNED ADVISOR | assigned business document | **DENY** (§7 ambiguity 1 — fail closed) |
| 19 | TEAM MEMBER | team business document | **DENY** (not owner-of-record) |
| 20 | SUPER ADMIN | any document | **ALLOW** |
| 21 | UNRELATED USER | known document UUID | **DENY**, and **verify the row still exists** |
| 22 | UNRELATED ADVISOR | known document UUID | **DENY**, and **verify the row still exists** |
| 23 | any | invalid / nonexistent UUID | **DENY safely** |
| 24 | any | document with `business_id = null`, not owner | **DENY** |

### ENUMERATION / QUERY

| # | Request | Actor | Expected |
|---|---|---|---|
| 25 | `{ bucket: 'x' }` | advisor | **400 Invalid bucket** ← *currently returns all tenants* |
| 26 | `{ bucket: '', limit: 200 }` | advisor | **400** |
| 27 | `{ bucket: 'documents', target_business_id: B_unauthorized }` | advisor | **403** |
| 28 | `{ bucket: 'documents', target_business_id: B_authorized }` | advisor | **ALLOW**, scoped to B only |
| 29 | `{}` (default) | admin | **ALLOW** — library list unchanged |
| 30 | `{ target_profile_id: P_other }` | advisor | **no widening** beyond actor's authorized businesses |

### Ordering / hygiene

| # | Assertion | Expected |
|---|---|---|
| 31 | Authorization runs before `createSignedUrl` | verified in code path |
| 32 | No `createSignedUrl` call is reachable without a preceding authorization | verified |
| 33 | Denial responses do not disclose resource existence | 404 shape identical for "not found" and "not yours" |
| 34 | Delete clears `document_analysis` children before the `documents` row | verified |

---

## 14. GO / NO-GO

**GO.**

The vulnerability is confirmed, live, and worse than originally scoped. The remediation reuses the existing canonical helpers (`authenticateActor`, `assertBusinessAccess`, `authorizeBusinessAccess`, `errorResponse`) — no new architecture, no schema change, no policy change, no Storage change. There are exactly two callers, both admin-only in intent, and the only behavioral change is that advisors lose a delete capability they were never granted by the canonical path.

**Scope discipline:** S3 fixes `getDocumentsAdmin` only. S-1 (`checkDocumentAnalysisById`) and S-2 (`createDocumentAnalysis`) are recorded for S4.

---

## FINAL DECISION

**A. Is `getDocumentsAdmin` currently vulnerable to cross-business document access?**
**YES — by two independent routes, and one is worse than reported.** (1) `getSignedUrl` (`:50-62`) loads any document by UUID with no authorization and returns a 900-second signed URL — any advisor can download any business's document. (2) The `query` action (`:64-98`) accepts an unvalidated free-string `bucket`; any value other than the two literals falls through to a branch with only optional filters, so `{ bucket: 'x', limit: 200 }` dumps 200 full rows across every bucket and business, including `file_path` and `business_id`. The reported signed-URL hole has **zero callers** in the UI but remains directly invocable.

**B. Is its delete action vulnerable to cross-business deletion?**
**YES — the most severe finding.** `:41-47` never reads the row before deleting. There is no ownership check, no business check, no profile check. Any actor passing the `:23` role gate (`admin | super_admin | advisor`) deletes any document row by UUID. It is UI-reachable by advisors because `AdminView.jsx:28` marks the `files` tab `superAdminOnly: false` and the `/admin` route has no role guard.

**C. What exact missing authorization check causes it?**
The function never performs **load resource → derive tenant from the row → authorize actor against that tenant**. Delete skips even the load (`:44`). `getSignedUrl` loads the row but selects only `file_path`/`storage_bucket` and authorizes nothing. The query action validates neither the `bucket` parameter nor the actor's reach. Underneath all three: **the function never resolves a canonical profile at all** — it treats the Base44 role gate as sufficient authorization for a resource whose owner it has not identified.

**D. Can the existing `getDocumentSignedUrl` authorization pattern be reused?**
**YES — its *structure* is exactly right:** authorization at `:1323-1342` precedes `createSignedUrl` at `:1350`, the tenant is derived from `doc.business_id`, it fails closed on a businessless document, and it reuses `assertBusinessAccess`. Reuse the shape and the helpers.

**E. Does that existing pattern itself need correction before reuse?**
**YES — three defects.** (1) Its **advisor branch bypasses `validateBusinessScope`** and queries `advisor_assignments` directly, so it **never checks `status !== 'revoked'`** — a revoked advisor still receives URLs — and it misses `business_entities.assigned_advisor_id`, `business_owners`, `business_team_members`, and `expert_advisor_access`; it is a divergent second copy of the authorization rule. (2) Its `else` catch-all treats every non-admin/non-advisor role (including unknown or null) as an owner rather than denying. (3) It resolves the profile by **email only**, predating `authenticateActor`'s `base44_user_id`-first resolution. **(Corollary finding: `supabaseUserData.getDocumentSignedUrl` — the live viewer path — currently grants a revoked advisor access and should itself be corrected in S4.)**

**F. Who should be able to VIEW a document today?**
Admin and super_admin. Otherwise anyone `validateBusinessScope` authorizes for the **document's own `business_id`**: owner (`business_entities.profile_id`), assigned advisor (`assigned_advisor_id` *or* non-revoked `advisor_assignments`), team member, `business_owners` record, expert (`expert_advisor_access`). Plus the **owner-of-record** (`documents.profile_id`) when the document carries no business. **Not** a document assignee without a business relationship, **not** a notification recipient, **not** a UUID holder, **not** a client-supplied `business_id`.

**G. Who should be able to DELETE a document today?**
**Admin / super_admin, or the owner-of-record** (`documents.profile_id === actor.profile_id`). Viewing is broad; deleting is narrow — the existing codebase already separates them (`deleteDocument:1372` has no advisor branch). **Two ambiguities, both resolved by failing closed:** (1) an assigned advisor may **not** delete — the canonical path never granted it, and `getDocumentsAdmin`'s current grant is an accident, not a semantic; (2) an owner **may** delete their own documents — an existing explicit semantic this function currently cannot express.

**H. Will the proposed patch break any legitimate current caller?**
**One narrow change, no breakage.** The admin query (`AdminFiles.jsx:54`) is short-circuited by `actor.isAdmin` and is unaffected. The admin delete (`:91`) is unaffected for admins. The **only** behavior change is that **advisors lose delete** on the admin Files view — a correction matching `deleteDocument`, not a regression. The `getSignedUrl` action has no caller, so authorizing it breaks nothing. Risk R2/R3 (admins without a `base44_user_id` mapping) are covered by `actor.ts:97-109`'s Base44-role fallback and must be tested.

**I. Are there sibling endpoints with the same vulnerability?**
**YES — two, both recorded for S4, neither fixed in S3.**
1. **`checkDocumentAnalysisById`** — `auth.me()` is the *only* check; any authenticated user supplying an analysis UUID receives `select('*')`, including `extracted_data`, `summary`, `ai_findings`, `business_id`, and `profile_id`. Structurally identical to `getSignedUrl` with a wider payload.
2. **`createDocumentAnalysis`** — takes `profile_id` and `business_id` from the body; `:56` authorizes against the **body's** `profile_id` (`doc.profile_id !== profile_id`), and `:65` lets a body-supplied `business_id` **override the document's own tenant**. This is precisely the identity-from-body class `actor.ts:1-37` exists to eliminate, plus cross-tenant injection.
Lower-risk, admin-gated, deferred: `updateDocumentAnalysisStatus`, `resetDocumentAnalysisStatus`, `auditAssignmentAccessControl`. Needs a read before judging: `runDocumentExtraction`, `getMetricAutoPopulate`. Verified clean: `documentAssignments`, `supabaseDocumentData.getDocumentAnalysisQueue`, `worksheetResponses`, `uploadDocumentToSupabase`.

**J. What is the smallest safe patch?**
Add `authenticateActor` / `assertBusinessAccess` / `errorResponse` imports and **one private `loadAuthorizedDocument(sb, actor, documentId, mode)` helper** that loads the row, 404s when absent, short-circuits admins, applies **owner-of-record only** for `delete`, and applies **owner-of-record or record-derived business access** for `view`. Route all three actions through it, **authorizing before `createSignedUrl`**. Additionally: **whitelist `bucket`** (unrecognized → 400) and **validate `target_business_id` against the actor** for non-admins. Net diff ≈ 3 imports, ~20 helper lines, 3 action bodies. No new authorization architecture, no Security Kernel, no schema, no policy, no Storage change, no `getDocumentsAdmin` sibling fixes.

**K. GO or NO-GO to implement that patch?**
**GO.**

---

*Trace complete. Nothing was modified. No credentials or tokens were accessed or reproduced. No customer document was read, minted, or deleted.*