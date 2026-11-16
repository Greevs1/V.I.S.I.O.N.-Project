# Phase S4 — Gate A **Revision 5.2** · Delta
## PROPOSAL ONLY · **Gate B NOT AUTHORIZED** · nothing implemented

**Bases:** Revision 5 (proposal · SQL · tests) and Revision 5.1 (correction report). **Deltas only.**
**Scope:** no SQL executed · no migration created · no application code modified · no tests run · nothing deployed · no data changed · no read-only query issued in this revision.

**Preserved unchanged (not touched by this delta):** dashboard projection disabled at both layers (D-19); append-only audit table (D-15); required document year (D-17); advisor authorization disabled (D-4); the review-queue `projection` correction (D-18); the corrected dashboard partial-index syntax; the Revision 5.1 corrections C-1 (authorization error handling), C-4 (projection) and C-5 (findings).

---

## 1. Identity: exactly one id-bound canonical profile

### 1.1 Rule

For this financial-write path, authorization requires **exactly one** canonical profile bound to the authenticated Base44 session through **`profiles.base44_user_id = user.id`**. The shared resolver's email fallback is **not accepted here**. Fail closed on missing, duplicated or inconsistent binding. The shared resolver is **not** changed; no profile is auto-bound.

### 1.2 Base44 — replace Revision 5.1's `assertCanonicalActorIdentity` in full

```ts
/**
 * assertCanonicalActorIdentity — the S4 identity rule.
 *
 * EXACTLY ONE canonical profile must be bound to the authenticated Base44 session through
 * `profiles.base44_user_id = user.id`. The email fallback the shared resolver offers is
 * DELIBERATELY NOT ACCEPTED on this path: an email address is a mutable, non-unique attribute,
 * and a financial write must rest on the immutable binding.
 *
 * This function performs its OWN strict lookup rather than trusting the resolver's result, and
 * then requires the two to AGREE — so a resolver that fell back to email cannot smuggle a
 * different profile past the check.
 *
 * It cannot be influenced by the request: nothing here derives from the request body.
 */
async function assertCanonicalActorIdentity(sb: any, actor: any) {
  const sessionUserId = actor?.user?.id;
  if (!sessionUserId) throw new HttpError(401, 'Unauthorized');

  // A LIST read, never `.maybeSingle()`: a duplicated binding must be OBSERVED and refused,
  // not collapsed into an error nor silently resolved to one of the two rows.
  const { data: bindings, error } = await sb
    .from('profiles')
    .select('id')
    .eq('base44_user_id', sessionUserId);

  if (error) {
    console.error('[snapshot] identity lookup failed');
    throw new HttpError(500, 'Internal server error');
  }

  // MISSING — no canonical profile is bound to this session.
  if (!Array.isArray(bindings) || bindings.length === 0) {
    console.error('[snapshot] no profile bound to the session identity');
    throw new HttpError(403, 'Forbidden');
  }
  // DUPLICATED — two profiles claim the same session; there is no safe way to choose one.
  if (bindings.length > 1) {
    console.error('[snapshot] duplicate profile binding for the session identity');
    throw new HttpError(403, 'Forbidden');
  }
  // INCONSISTENT — the resolver's profile is not the profile the session actually binds to.
  if (!actor.profile || actor.profile.id !== bindings[0].id || actor.profile_id !== bindings[0].id) {
    console.error('[snapshot] resolved profile does not match the session binding');
    throw new HttpError(403, 'Forbidden');
  }
}
```

Call site is unchanged from Revision 5.1:

```ts
    const actor = await authenticateActor(base44, sb);
    await assertCanonicalActorIdentity(sb, actor);   // exactly one id-bound profile
    assertActiveProfile(actor);                      // status allowlist (unchanged)
```

**Why each failure mode is closed:** missing → 403; duplicated → 403 (no tie-break); inconsistent → 403. A resolver that reached its result by email cannot pass, because the profile it returned cannot be the id-bound row. All three happen before any document read, field read or write.

**Static checks to add (T-N48):** `grep -c "profileEmail\|sessionEmail" …/entry.ts` → **0**; `grep -c "ilike('email'\|\.ilike(" …/entry.ts` → **0**; `resolveActingProfile` → **0**; `p_actor_profile_id` sourced from `actor.profile_id` exactly once.

### 1.3 Consequence to record before enabling — a real data precondition

Revision 5.1 evidence: **1 of 8 profiles has `base44_user_id` NULL** (it does have an email). Under this rule that profile is **denied snapshot authority** — deliberately, and the denial is correct. Nothing in this packet auto-binds it.

**Required preflight (read-only, run before enabling the path for that user):**

```sql
-- Identify the unbound profile and what the denial would cost. No PII returned: role, status
-- and whether it owns or advises a business are what decide the impact.
select p.app_role, p.profile_status,
       exists (select 1 from public.business_entities b where b.profile_id = p.id)      as owns_business,
       exists (select 1 from public.business_entities b where b.assigned_advisor_id = p.id) as advises_business
  from public.profiles p
 where p.base44_user_id is null;
```

If that profile is an owner or an admin who needs this path, it must be **bound by the owner's own process** (`base44_user_id` set to the session id) before the path is enabled for them; otherwise the denial stands. This is a configuration action, **not** a code change, and it is **not** authorized here.

---

## 2. Confidence: all-or-nothing over the contributing set

### 2.1 Rule

The aggregate confidence is **NULL unless every unique contributing extracted field carries a valid numeric confidence score**. When all contributors are scored, it is their mean. Individual source scores are preserved in provenance. Confidence and content hashing stay deterministic.

### 2.2 SQL — replace Revision 5.1's confidence block

```sql
  -- ── 7. CONTRIBUTORS + CONFIDENCE — ALL-OR-NOTHING ─────────────────────────
  select array_agg(distinct c::uuid) into v_contributor_ids
    from jsonb_array_elements(v_source_input) e,
         jsonb_array_elements_text(e->'ids') c;

  if v_contributor_ids is null or array_length(v_contributor_ids, 1) is null then
    raise exception 'SNAPSHOT_NO_CONTRIBUTORS' using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where f.confidence_score ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$')
    into v_contributor_count, v_scored_count
    from public.extracted_fields f
   where f.id = any (v_contributor_ids);

  if v_contributor_count <> array_length(v_contributor_ids, 1) then
    raise exception 'SNAPSHOT_CONTRIBUTOR_DRIFT' using errcode = '42501';
  end if;

  -- The regex is a CAST GUARD, not a filter of convenience: confidence_score is TEXT, and an
  -- unparseable value cast to numeric would raise 22P02 — an infrastructure-shaped failure for
  -- what is really a data-quality fact.
  select avg((f.confidence_score)::numeric) into v_confidence
    from public.extracted_fields f
   where f.id = any (v_contributor_ids)
     and f.confidence_score ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$';

  -- ALL-OR-NOTHING. A mean over a subset would publish a partial basis as a complete figure.
  -- If ANY unique contributing field lacks a valid numeric score, the aggregate is UNKNOWN.
  if v_scored_count = v_contributor_count then
    v_confidence_stored := round(v_confidence, 2);
  else
    v_confidence_stored := null;   -- unknown: never 0, never a partial mean
  end if;
```

`SNAPSHOT_CONFIDENCE_UNAVAILABLE` remains withdrawn (Revision 5.1); this delta adds **no new error codes**.

### 2.3 SQL — preserve individual source scores in provenance

Extend the per-target validation read (already the single read for that target) to return the raw scores in `f.id` order, so they are positionally aligned with `field_ids`:

```sql
    select count(*), count(f.accepted_normalized_value), sum(f.accepted_normalized_value),
           jsonb_agg(jsonb_build_object('field_id', f.id, 'score', f.confidence_score)
                     order by f.id)
      into v_found, v_nonnull, v_total, v_source_scores
      from public.extracted_fields f
     where f.id = any (v_ids)
       and f.document_id = p_source_document_id
       and f.business_id = p_business_id
       and f.review_status in ('accepted','corrected')
       and f.field_name = v_spec->>'from';
```

```sql
    v_provenance := jsonb_set(v_provenance, array[v_target],
      jsonb_build_object('op', v_spec->>'op', 'from', v_spec->>'from',
                         'field_ids', to_jsonb(v_ids),
                         'scores', coalesce(v_source_scores, '[]'::jsonb)), true);
```

Raw `confidence_score` text is stored **verbatim** — the source record stays the authority, and no normalisation is invented here.

**Declare additions:** `v_source_scores jsonb;` (alongside `v_contributor_ids`, `v_contributor_count`, `v_scored_count` from Revision 5.1).

### 2.4 SQL — include the per-field scores in the content hash

```sql
    v_hash_input := v_hash_input || jsonb_build_array(
      jsonb_build_object('t', v_target, 'v', v_value,
                         's', coalesce(v_source_scores, '[]'::jsonb)));
```

**Decision (D-20):** per-field scores **are** hashed. Rationale: provenance is persisted on the row, so a hash that ignored the scores could dedupe two submissions whose stored provenance differs — *"identical hash ⇒ identical row"* would stop being true. The alternative (values + aggregate confidence only) is acceptable only if provenance is treated as first-write-only. Everything persisted is hashed; that is the invariant worth keeping.

**Determinism, restated for the new rule:**
- per-target `field_ids` — `array_agg(… order by x)`; scores — `jsonb_agg(… order by f.id)`; targets — iterated in **contract order** ⇒ provenance and hash input are fully ordered, independent of caller order.
- `confidence` enters the hash as JSON `null` in the unknown case, which is stable ⇒ two identical unscored submissions dedupe correctly.
- Hash inputs remain: `business`, `document`, `profile`, `mapping_version`, `document_type`, `snapshot_type`, `basis`, `values`, `sources`, `confidence`, and now the per-field `scores`. An unrelated accepted field remains **absent from every one of them**.

---

## 3. Trust boundary at the RPC: what a service-role caller can and cannot prove

### 3.1 Accuracy statement (replaces any stronger wording)

`p_actor_profile_id` is a **claim** by whoever holds the service-role key. The RPC **verifies the claimed profile's existence, status and business relationship**; it **cannot** independently prove **which Base44 user initiated the call**, and no wording in the migration, the function comment, the audit table or the code may suggest otherwise.

| Layer | Proves | Cannot prove |
|---|---|---|
| Base44 endpoint (`authenticateActor` + `assertCanonicalActorIdentity`) | **Which user is calling** — the only identity boundary, on a unique immutable binding | — |
| Base44 authorization (§Revision 5 seven-row policy) | The actor may act on this business | — |
| RPC relationship + status recheck | The **claimed** profile is real, active and related to this business; the tenant matches the document | That the caller **is** that profile |

**Residual risk, stated honestly:** a leaked service-role key permits asserting *any* authorized profile's identity, and every write would be recorded under that claimed profile. The RPC's checks confine the damage to profiles holding a legitimate relationship to a real business — **damage limitation, not authentication**. Key custody is the control. This is why §1 matters: the endpoint's strict, id-bound identity is what makes the claim trustworthy in normal operation.

### 3.2 Optional hardening (recommended; naming only, no behaviour change)

Name the claim what it is, in all four places — the RPC parameter, its REVOKE/GRANT signature, the audit column, and the Base44 argument:

- `p_actor_profile_id` → **`p_claimed_actor_profile_id`**
- audit column `actor_profile_id` → **`claimed_actor_profile_id`**
- `comment on function …` and the audit table comment: state "a claim by a service-role caller, validated as a **relationship**; never proof of caller identity".

If signature churn is unwanted, keep the current names and rely on the comments — the tests in §4 hold either way.

---

## 4. Reconciled tests

**Renumbering note (fixes a Revision 5.1 collision):** the identity test previously labelled **T-N44** (email differing in case) is superseded by **T-N61**; the post-apply privilege assertion previously labelled **T-N44g** becomes **T-N70**.

### 4.1 The seven named expectations

| # | Revision 5.1 expected | **Revision 5.2 expected** | Why |
|---|---|---|---|
| **T-N43** | Unbound profile, session email matches exactly → **allowed** (logged) | **403; zero writes.** | Email-only authorization is removed. No `base44_user_id` ⇒ no binding ⇒ denied |
| **T-N44** | *(identity, email differs in case)* → **allowed** | **Renumbered T-N61 — 403.** Email is no longer consulted at all, case-insensitively or otherwise | Same rule |
| **T-N47** | Direct RPC with forged `p_actor_profile_id` → `SNAPSHOT_FORBIDDEN` *(stated as a blanket rejection — inaccurate)* | **Split into two tests** (below): an **unauthorized claim is refused**; an **authorized-looking claim is accepted and recorded as a claim** | A service-role caller *can* assert an actor identity; the RPC validates the relationship, not the caller |
| **T-N53** | All contributors unscored → confidence **NULL** | **Unchanged — NULL**, and now also assert provenance records `score: null` for every contributor and that the hash is stable ⇒ a repeat dedupes | Consistent with all-or-nothing |
| **T-N54** | Two contributors, one scored 60, one NULL → stored **60** | **NULL** | Not every contributor is scored ⇒ unknown. The subset mean is withdrawn |
| **T-N55** | Denominator equals the **scored** contributor count | **Redefined:** assert confidence is **NULL whenever any contributor is unscored**, equals the **mean of all contributors** when all are scored, and **equals the contributor count's mean only in that case**; assert coverage — provenance lists every contributing id with its **raw** score, so a NULL aggregate is explainable from the row itself | All-or-nothing + provenance preservation |
| **T-N57** | Contributor holds a non-numeric score → **excluded** from the mean; mean of the rest | **NULL** — a non-numeric value is not a valid numeric score, so the all-or-nothing condition fails. (Unchanged when it is the only contributor.) Defensive: **0 non-numeric values exist today** | Valid numeric is the bar |

### 4.2 Corrected and new tests — trust boundary (replaces T-N47)

| # | Scenario | Expected result |
|---|---|---|
| **T-N47a** | Direct service-role RPC call claiming a profile that has **no** ownership/assignment relationship to the business | `SNAPSHOT_FORBIDDEN`; **zero writes**. The RPC does reject an **unauthorized claim** |
| **T-N47b** | Direct service-role RPC call claiming the **business owner** — an authorized-looking profile — from outside any session | **Call succeeds. This is expected behaviour, not a defect.** Assert: (1) the write succeeds; (2) the snapshot's `created_by` equals the **claimed** profile id; (3) the audit row records the **claimed** actor. The test exists to encode the boundary, so no future reader mistakes the success for a bug |
| **T-N46** *(strengthened)* | Full request through the **Base44 endpoint** carrying forged actor fields (`profile_id`, `actor_profile_id`, `_router_user_email`, `target_profile_id`) alongside a valid `documentId` | The endpoint **cannot** impersonate: the forged fields are ignored; the audit row's claimed actor and the snapshot's `created_by` both equal the **session-resolved** profile; the write succeeds or is denied **on the session actor's own authority**, never the forged one |
| **T-N48** *(extended)* | Static checks | As Revision 5.1 **plus**: no email comparison remains (`profileEmail`/`sessionEmail`/`.ilike(` → 0 matches) |

### 4.3 New identity tests (§1)

| # | Scenario | Expected result |
|---|---|---|
| **T-N60** | Bound profile resolves normally (the happy path) | Allowed; `p_claimed_actor_profile_id` = that profile |
| **T-N61** | Unbound profile; session email matches exactly / differs only in case / differs entirely (three fixtures) | **403** in all three — one rule, no email consultation |
| **T-N62** | Duplicate binding (two profiles with the same `base44_user_id`), the resolved actor being one of them | **403** — no tie-break, fail closed, logged |
| **T-N63** | Resolver returned profile A by email while profile B is the id-bound row | **403** inconsistent |
| **T-N64** | Session id present, `profiles.base44_user_id` lookup errors | **500**, generic body; zero writes |
| **T-N65** | Static: `grep` for email comparison in the entry file | **0 matches** |

### 4.4 New confidence tests (§2)

| # | Scenario | Expected result |
|---|---|---|
| **T-N66** | Contributors all scored: 60, 80, 100 | Stored confidence **80**; provenance lists each id with its raw score |
| **T-N67** | Two contributors, one scored 60, one NULL | **NULL** (supersedes T-N54's old expectation); provenance shows the NULL score — the aggregate is explainable from the row |
| **T-N68** | Contributor scoring edited only (value untouched) | **New hash** ⇒ new snapshot: confidence and provenance genuinely changed (keeps T-N51 valid) |
| **T-N69** | Two submissions whose per-field scores differ but whose aggregate mean is identical | **New hash** ⇒ two snapshots, each with its own persisted provenance (D-20) |
| **T-N70** | Post-apply privileges (was T-N44g) | `anon` false, `authenticated` false, `service_role` true on both new functions |
| **T-N71** | Unrelated accepted field added, contributors untouched | Hash, confidence **and provenance unchanged** ⇒ dedupes |

All other Revision 5 and 5.1 tests keep their expectations — including T-N36–T-N39 (authorization error handling), T-N25–T-N30 (projection disabled), T-N40–T-N42 (missing/duplicate/unbound), T-N45, T-N46, T-N49, T-N50, T-N52, T-N56, T-N58, T-N21/T-N22, and the whole positive set.

---

## 5. Final isolated Gate B readiness recommendation

**Recommendation: isolated Gate B is READY for a separate authorization, subject to the three conditions below.**

- **Identity is now unambiguous and immutable.** After §1 the actor must be the single profile bound by `base44_user_id`, and the resolver's profile must be exactly that row — with missing, duplicated and inconsistent bindings all failing closed. No body field can reach it, and the email path cannot smuggle a second identity in. That is what makes the endpoint's claim to the RPC trustworthy.
- **The confidence aggregate is now honest.** All-or-nothing removes a figure computed over a subset while presenting itself as complete, and provenance now carries every contributing source score verbatim.
- **The trust boundary is stated at its true strength.** The corrected tests encode what the RPC actually guarantees — it validates a claimed relationship, it does not authenticate — so the residual risk (service-key custody) is written down instead of implied away.
- **The dangerous pieces stay off.** Dashboard projection is disabled at both layers, so this change cannot move a dashboard; advisor authority stays disabled; the write is additive, business-scoped and reversible by dropping two functions and one table.

**Conditions:**

1. **Fold this delta into the Revision 5 documents** (TS, SQL, tests) so the applied text is the corrected text, and apply the renumbering in §4.
2. **Resolve the one unbound profile first** — run the §1.3 preflight. If that profile is an owner or admin who needs this path, bind it through your own process before enabling; otherwise accept that it is denied. No auto-binding, no code change.
3. **Expect sparse confidence, deliberately.** With today's data **5 of 13** accepted/corrected fields carry no score, so a snapshot whose contributors include any unscored row will report **no confidence at all** — by decision, not by defect. If a populated confidence is wanted, the fix is upstream (score those fields during review), never a relaxation here.

Then: isolated environment only; run **T-N70** and **T-N21/T-N22** (privileges) immediately after the migration, before any functional test; then the full suite including the split **T-N47a/T-N47b**. Production, dashboard projection, the existing RLS policies, the ten dashboard writers, CB-005A, CB-005B, provider sync, Galileo and the Digital Twin remain untouched.

**Gate B is NOT authorized. Nothing in this delta has been implemented.**