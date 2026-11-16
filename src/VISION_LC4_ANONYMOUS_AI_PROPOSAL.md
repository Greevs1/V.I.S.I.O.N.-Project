# LC-4 — ANONYMOUS AI INQUIRIES (FIVE FREE): TECHNICAL PROPOSAL

**STATUS: NOT IMPLEMENTED — AWAITING APPROVAL.**
Nothing in this document is deployed, and no schema, RPC, secret, or backend surface described
here exists yet. Stage B (the preview) ships with AI inquiries deliberately **off**.

This proposal covers the ten areas requested. It describes the smallest design that can honestly
say "five free inquiries" — meaning the number is **enforced on the server**, survives a new
browser session, and cannot be spent by anyone but the person holding the session.

---

## 0. WHY THIS IS NOT A UI CHANGE

The current architecture cannot enforce a count:

| Fact (verified in code) | Consequence |
|---|---|
| `askGalileo/entry.ts:79-80` calls `base44.auth.me()` → 401 for guests | There is no guest AI path at all; one must be created. |
| `src/lib/anonymousSession.js:36-48` mints a **client-side UUID v4** in `localStorage` | Any counter keyed on it is reset by clearing storage. It is not an identity. |
| `guestSessionService` validates only `exists && status === 'active'` (`:110-172`) | Knowing the id is the whole authorization. Reads **and writes** are open to any holder. |
| `promoteGuestSession` (`:451-511`) accepts any `guest_session_id` from the caller | "Claim" is possession of a bearer string, with no proof of ownership. |
| No usage column exists; `questions_used` is initialized once (`magicLoopConversation.js:134`) and never incremented | There is no accounting to extend. |

Therefore three things must be built before a single inquiry is allowed: a **trusted guest token**,
an **atomic counter**, and an **isolated read path**. The rest of this document is those three.

---

## 1. TRUSTED GUEST IDENTITY AND SESSION OWNERSHIP

**Proposal: a server-signed session token.**

- On `createGuestSession`, the server generates `guest_secret = randomBytes(32)` and returns
  `guest_token = HMAC_SHA256(GUEST_TOKEN_SIGNING_KEY, guest_session_id + ":" + issued_at)`
  alongside the session id. The signing key is a new secret (`GUEST_TOKEN_SIGNING_KEY`).
- The client stores the token in `sessionStorage` **and** memory; it is sent with every guest call.
- The server verifies, in this order: signature (constant-time compare), `issued_at` age (30 days,
  matching the session's own expiry), row status `active`, and
  `token_fingerprint = SHA256(guest_token)` equal to the stored fingerprint.
- Rotation: rotating the fingerprint invalidates every previously issued token for that session
  without deleting the session (used on suspicion, and at promotion).

**Ownership rule that replaces "knows the id":** possessing the session id is no longer sufficient
for any read, write, upload, signed-URL, or claim. The token is the proof, and it is bound to one
row. A leaked id alone grants nothing.

**Guest → account claim:** `promoteGuestSession` requires **both** a valid token for that session
**and** an authenticated user. This closes today's bearer-only claim.

---

## 2. PROTECTION AGAINST UNAUTHORIZED READ / WRITE / CLAIM

| Surface | Today | Proposed |
|---|---|---|
| `getGuestSession` / `updateGuestSession` | id only | token + fingerprint match |
| `createGuestUploadUrl` / `confirmGuestUpload` / `createGuestReadUrl` | id only; path prefix check | token **and** path prefix check (both) |
| `removeGuestUpload` | id only | token |
| `promoteGuestSession` | id + authenticated user | token + authenticated user + `status='active'` |
| Every new AI call | n/a | token + quota reservation |
| Direct table access | RLS/permissions unreviewed; `guest_sessions` is not in the repo's migrations | deny-all to `anon` and `authenticated` on the new tables; `service_role` only, with **REVOKE before GRANT** (SEC-031 / SEC-032) |

`updateGuestSession` additionally gets a **provenance guard**: the AI path may never write
`business_snapshot`, `assessment_answers`, or `document_queue`; those remain writable only by the
paths that own them.

---

## 3. ATOMIC CREDIT RESERVATION AND CONSUMPTION

**Model: reserve → settle, never read-modify-write from the function.**

```
guest_ai_reservations(
  id uuid pk,
  guest_session_id text not null,
  request_id text not null,          -- client idempotency key
  state text not null,               -- 'reserved' | 'succeeded' | 'released'
  reserved_at timestamptz not null,
  expires_at timestamptz not null,   -- reserved_at + 15 min
  profile_id uuid null,              -- set on guest→account promotion
  unique (guest_session_id, request_id)
)

guest_ai_quota(
  guest_session_id text pk,
  allowance int not null default 5,
  used int not null default 0,
  check (used >= 0 and used <= allowance)
)
```

`reserve_guest_inquiry(p_session_id, p_request_id)` — one statement, one lock:

```sql
with bump as (
  update guest_ai_quota
     set used = used + 1
   where guest_session_id = p_session_id and used < allowance
  returning used, allowance
)
insert into guest_ai_reservations (...) select ... from bump
returning id, used, allowance;
```

Zero rows returned means **denied** — the function does not call the model, and the UI says how many
remain. `used` is incremented at **reservation**, so two concurrent requests can never both see
`used = 4`.

Consumption is therefore already recorded; a failed generation **releases** it (§5). This is
deliberately not "increment on success", which is not atomic and can over-spend under concurrency.

---

## 4. CONCURRENT REQUESTS AND IDEMPOTENT RETRIES

- **Same request, twice:** `unique (guest_session_id, request_id)` + `insert … on conflict do nothing`
  makes a retry return the existing reservation rather than spending a second credit. The stored
  response (or its state) is returned instead of regenerating.
- **Different requests, simultaneously:** the quota `update … where used < allowance` serializes on
  the row; exactly five succeed. A `statement_timeout` and a bounded retry (2, with jitter) prevent
  a pile-up.
- **Double submit from the UI:** the composer disables on submit and reuses one `request_id` for that
  message, so a double click is the same request.
- **Ordering:** reservation → generation → settle. Never settle before reserving, never generate
  outside a reservation.

---

## 5. FAILED OR INTERRUPTED AI RESPONSES

```
reserved ──success──────────────▶ succeeded
   │
   ├──classified provider failure▶ released   (5xx, timeout, quota of the provider)
   ├──policy refusal─────────────▶ succeeded  (a refusal is an answer; it is shown and counts)
   └──client gone / crash────────▶ expires_at reached ▶ swept to released
```

- **Release is explicit and narrow:** only failures that occurred **before any content was
  produced**. A partial answer that reached the user counts (it was delivered), and is labelled as
  partial.
- **Interrupted by the client:** the row stays `reserved` and is swept by
  `settle_expired_reservations()` (a scheduled function, hourly) to `released`. A browser close
  therefore cannot burn a credit.
- **No automatic retry that re-charges:** a retry with a **new** `request_id` is a new inquiry and is
  shown as such before it is sent.
- **UI states** already exist in Stage B's transition machine and extend to asks:
  resolving · answered · released-with-reason · allowance-exhausted.

---

## 6. GUEST-TO-ACCOUNT USAGE CONTINUITY

- On `promoteGuestSession`, in the same transaction: `guest_ai_reservations.profile_id` is set for
  every row of that session, and `used` is carried into the account's own allowance ledger
  (`profile_ai_usage(profile_id, allowance, used, period)`), so the account opens with
  `5 − used` remaining rather than a fresh five.
- The guest surface **stops working** at promotion (`status='promoted'`), so the same five cannot be
  spent twice on one account through a stale tab.
- Clearing storage does not restore anything after promotion: the counter now belongs to the
  account row, not the session.
- Only the promoting session contributes. Reservations from other sessions never attach to that
  account.

---

## 7. RATE LIMITING AND ABUSE PREVENTION

The allowance is per-session by design, and sessions are cheap, so the allowance alone is not a cost
bound. Layered limits, all server-side:

1. **Per session:** 5 inquiries (the product promise).
2. **Per IP + coarse UA:** token bucket in `guest_rate_limits(key, window_start, count)` —
   `createGuestSession` 10/hour; inquiries 10/hour and 40/day.
3. **Per network:** a daily ceiling on total anonymous inquiries, and a global spend ceiling with a
   circuit breaker that turns the feature off (returning a stated reason) instead of degrading cost
   control.
4. **Session creation integrity:** a bot check on `createGuestSession` and an anomaly rule
   (N sessions per IP/hour) that blocks creation rather than allowing spends.
5. **No PII in keys:** IPs are hashed with a rotating salt; the bucket row holds a hash.

Every limit is enforced before the model is invoked and is observable in a counter the builder can
read.

---

## 8. FINANCIAL DATA ISOLATION

- **No business, no profile:** the guest AI path receives only the verified
  `guest_session_id`. It never accepts a `business_id` or `profile_id` from the client, and it never
  touches `dashboard_metrics`, `business_assessments`, `documents`, or any canonical fact table.
- **Whitelisted context:** the prompt is assembled from an explicit field list of
  `business_snapshot`, `assessment_answers`, and `extracted_facts` for **that** session. A field not
  on the list cannot reach the model, and unknown facts are described as unknown.
- **Documents:** a referenced upload is resolved server-side from the session's own
  `document_queue`; the model receives a short-lived signed URL (60 s), never a path from the client.
  Anything not in that queue is unreachable.
- **Responses:** the model is instructed to answer only about the supplied session context, and the
  response passes through a refusal to echo other identifiers; the server never joins in other
  sessions' data.
- **Logging:** no financial values and no signed URLs in logs; correlation by session hash only.
- **After promotion:** the guest path is closed, so all further asks run through the authenticated
  `askGalileo` contract with its existing business scoping.

---

## 9. REQUIRED DDL, RLS, RPCs AND BACKEND CHANGES

**Schema (additive):**
- `guest_sessions`: `guest_token_fingerprint text`, `guest_token_issued_at timestamptz`,
  `inquiry_count int not null default 0` (denormalised mirror for display only)
- new: `guest_ai_quota`, `guest_ai_reservations`, `guest_rate_limits`, `profile_ai_usage`
- indexes: `guest_ai_reservations (guest_session_id, state, expires_at)`,
  `unique (guest_session_id, request_id)`

**RPCs (security definer, `service_role` execute only):**
`reserve_guest_inquiry` · `release_guest_inquiry` · `settle_expired_reservations` ·
`rate_limit_hit` · `carry_guest_usage_to_profile`

**RLS / privileges:**
- all five objects: **no** grants to `anon` or `authenticated`; `REVOKE ALL` first, then
  `GRANT EXECUTE … TO service_role` — in that order (SEC-031, SEC-032)
- `ALTER DEFAULT PRIVILEGES` is not used; each object is explicitly closed
- verification script asserts: no `anon`/`authenticated` DML, no `TRUNCATE`, no default ACL leak

**Backend:**
- `base44/shared/authz/guestToken.ts` — issue/verify/rotate (the only place the HMAC is touched)
- `guestSessionService` — every action requires the token; `promoteGuestSession` requires token + auth
- **new** `guestGalileoInquiry` — verification → reservation → isolated context build → model call →
  settle → response; the only guest path that can spend
- `settleExpiredReservations` — scheduled (hourly)
- `askGalileo` — **unchanged**; it stays authenticated-only

**Frontend:**
- the Ask input in the guest preview becomes enabled behind a flag, showing `remaining` before send
- exhausted / released / partial states rendered (the transition state machine already has the shape)
- no counter is trusted from the client; the number always comes from the server response

**Secrets:** `GUEST_TOKEN_SIGNING_KEY` (new), plus the existing provider key.

---

## 10. MIGRATION AND ROLLBACK

**Migration**
1. Ship schema + RPCs + RLS with the feature flag **off** (`GUEST_AI_ENABLED=false`); nothing calls
   them yet. Verify privileges with the existing certification scripts.
2. Deploy backend with the flag off; run token issuance in **observe** mode
   (verify-only, no enforcement) and confirm no legitimate guest call would be rejected.
3. Enable token enforcement for guest `read/write/upload` — the moment the id alone stops working.
4. Enable inquiries for internal accounts; then raise the flag for all after the adversarial suite
   (double submit, parallel requests, cleared storage, stolen id, cross-session read, promotion
   carry-over) passes.
5. Each step is independently reversible and leaves the previous state working.

**Rollback**
- Feature: set `GUEST_AI_ENABLED=false` — the input reverts to Stage B's stated limitation, and no
  spend can occur. No schema change needed.
- Token enforcement: keep verification in a "log-only" mode for one release, so a rollback does not
  lock guests out of their own session.
- Schema: drop in reverse dependency order (`guest_ai_reservations` →
  `guest_ai_quota` → `guest_rate_limits` → `profile_ai_usage` → columns). Nothing in the
  authenticated path reads these objects, so a rollback cannot affect members.
- Data: reservations are operational records, retained 30 days, then deleted by job (no PII).

---

## ACCEPTANCE CRITERIA (BEFORE THE FLAG GOES ON)

1. Six concurrent requests on one session: exactly five succeed, one is denied, `used = 5`.
2. A retried request with the same `request_id` charges once and returns the same answer.
3. Clearing `localStorage`/`sessionStorage` does not restore an inquiry.
4. A stolen session id without the token reads, writes, uploads and claims **nothing**.
5. A provider timeout releases the credit; a delivered partial answer does not.
6. Promotion carries `used` into the account and closes the guest path.
7. Cross-session isolation: an answer for session A never contains session B's fields (adversarial
   fixture, values distinct).
8. IP buckets deny session creation and inquiries past their thresholds.
9. No `anon`/`authenticated` grant exists on any new object; `TRUNCATE` is revoked everywhere.
10. `askGalileo` behaviour is byte-identical for authenticated users.

**Approval needed for:** the DDL and RPCs (§9), the new secret, the new backend function, and the
policy decisions in §6 (carry-over arithmetic) and §7 (per-IP thresholds).