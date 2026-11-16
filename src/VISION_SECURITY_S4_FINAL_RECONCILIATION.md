# Phase S4 — Final Gate B Reconciliation
## PROPOSAL ONLY · **Gate B NOT AUTHORIZED** · nothing implemented

**Bases:** Revision 5 (proposal · SQL · tests), Revision 5.1 (corrections), Revision 5.2 (delta). **This report resolves two issues only.**
**Scope:** no code changed · no migration created · no SQL executed against data · no tests run · nothing deployed. Read-only inspection was performed and is cited as evidence.

**Not reopened (all preserved):** dashboard projection disabled at both layers · append-only audit table · required document year · advisor authority disabled · the review-queue `projection` correction · the Revision 5.1 corrections.

---

## 1. Snapshot `created_by` — decision preserved, attribution verified in the audit

### 1.1 What the deployed SQL actually does (read-only verification of `VISION_SECURITY_S4_REVISION_5_SQL.md`)

The omission decision is already implemented correctly. Verified at source:

- **The INSERT does not name `created_by`.** Lines 457–462 — column list: `profile_id, business_id, snapshot_type, snapshot_date, annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation, payroll, total_debt, cash_on_hand, total_assets, metadata, data_source, source_document_id, data_confidence_score, is_latest`. The comment at 455–456 records why: nullable, FK → `profiles(id)`, no default, **0 of 72 existing rows carry it**. The table's own convention is preserved.
- **Actor attribution lives in the audit table**, written at step 12 on **both** paths (insert and dedupe), *after* the branch, so a dedupe is never unrecorded: `snapshot_id, business_id, content_hash, actor_profile_id, actor_base44_user_id, deduplicated, dashboard_updated, is_latest_requested`.
- **The dedupe path never touches the snapshot row.** `metadata.created_by_base44_user_id` is set **only** inside the insert branch (line 481), so a deduplicated submission cannot overwrite the first writer's attribution — which is exactly what D-14 asks to preserve.
- **Attribution is outside the content hash** (comment at 419–420), so dedupe still works across callers.
- **The dedupe assertion is unaffected** (lines 497–503): it compares metadata containment, date and confidence — never `created_by`.

**Conclusion: no SQL correction is required for the omission itself.** The defects were in the *test expectations* written in Revision 5.1 §2.3 and Revision 5.2 §4.2, which required `created_by` to echo the actor. Those are corrected below.

### 1.2 Optional two-line guard (recommended — makes the decision enforced, not merely declared)

The tripwire at 492–503 currently cannot detect a future edit that reintroduces `created_by`. Close that:

```sql
-- declare block
  v_persisted_created_by uuid;
```

```sql
    returning id, created_by into v_snapshot_id, v_persisted_created_by;
```

```sql
    if v_persisted_metadata is null
       or v_persisted_created_by is not null            -- D-13: the column is never written
       or v_persisted_date is distinct from v_snapshot_date
       or v_persisted_confidence is distinct from v_confidence_stored
       or not (v_persisted_metadata @> v_meta_metrics)
       or (v_persisted_metadata->>'content_hash') is distinct from v_content_hash then
      raise exception 'SNAPSHOT_IDENTITY_LOST' using errcode = '22023';
    end if;
```

### 1.3 Corrected tests

| # | Revision 5.2 expectation | **Corrected expectation** |
|---|---|---|
| **T-N46** | Forged actor fields ignored; "the snapshot's `created_by` equals the session-resolved profile" | Forged actor fields ignored, verified **in the audit**: the audit row's `actor_profile_id` = the session-resolved profile and `actor_base44_user_id` = the session user id; **`business_metric_snapshots.created_by IS NULL`**. **Delete** the `created_by`-echo requirement |
| **T-N47b** | Direct RPC claiming the owner; "the snapshot's `created_by` equals the **claimed** profile id" | The call succeeds (expected behaviour, not a defect); **`created_by IS NULL`**; the **audit** row records the claimed `actor_profile_id` and the claimed `actor_base44_user_id` **as passed**; `metadata.created_by_base44_user_id` equals the passed value. The audit row is the record of a **claim**, and the test must say so |
| **T-N19** | `created_by` never written | **Unchanged** — NULL on every new row, matching all 72 existing rows |
| **T-N17 / T-N18** | Audit on the insert path / on the dedupe path | **Unchanged** — these are, correctly, where attribution is verified |

**New tests:**

| # | Scenario | Expected result |
|---|---|---|
| **T-N91** | Dedupe by a **second authorized caller** | The snapshot row is unchanged — `metadata` (including `created_by_base44_user_id`, the **first** writer's), `content_hash`, and `created_by` still NULL; exactly **one additional** audit row with `deduplicated = true`; the second caller sees `deduplicated: true` and the existing `snapshot_id` |
| **T-N92** | Fixture that makes the insert write `created_by` | `SNAPSHOT_IDENTITY_LOST`; zero writes (proves the §1.2 guard fires). Only if the guard is adopted |

---

## 2. Confidence-score validation

### 2.1 The scale, established from evidence (read-only)

| Evidence | Reading |
|---|---|
| `extracted_fields.confidence_score` — **text**, nullable, **no CHECK constraint** | 248 rows: 168 NULL, 80 non-null |
| …its non-null values | **all integers**, `min 76`, `max 96`, sample `76,78,80,82,84,85,87,88,89,90,91,92,93,94,95,96` — **0** non-numeric, **0** above 100, **0** negative, **0** in (0,1) exclusive |
| `business_metric_snapshots.data_confidence_score` — numeric, 72 rows, **0 NULL** | `min 0`, `max 95`, distinct `0,50,60,70,80,90,95` |
| Platform convention in the entity schemas | Document `confidence_score`: "AI confidence score **0-100**"; BusinessMemory / StrategicHypothesis `confidence`: "**0-100** confidence" |

**Canonical scale: 0–100 (percentage), integer-valued in observed practice.** Decimals are permitted but unobserved. This is the one scale the S4 validation will accept — a 0–1 fraction is **not** a valid score, and no fraction exists in the data to reconcile.

**Two consequences worth stating plainly:**

1. Legacy snapshots treat "no confidence" as **0** (0 NULLs in 72 rows, including literal zeros). The S4 rule stores **NULL** for unknown. That divergence is deliberate, consistent with the platform's unknown-not-zero doctrine, and **existing rows are never rewritten**.
2. In practice confidence will be sparse: **168 of 248** field rows carry no score at all, and the all-or-nothing rule (Revision 5.2) means any snapshot with one unscored contributor reports **no confidence**. By decision, not defect — the upstream fix is scoring fields during review.

### 2.2 The validation predicate

```sql
-- declare block, beside the other constants
  v_conf_regex constant text := '^\s*[0-9]{1,3}(\.[0-9]+)?\s*$';
```

**A score is valid ⇔ `confidence_score ~ v_conf_regex AND (confidence_score)::numeric <= 100`.**

| Property | Why it holds |
|---|---|
| **Cannot raise `22P02`** | The regex admits only 1–3 digits with an optional `.<digits>` — no sign, no exponent, no letters, no internal space. The cast is therefore total on every matching value |
| **Cannot be excessively large** | At most **3** integer digits ⇒ ≤ 999 before the bound check, so no overflow is possible; `<= 100` then enforces the scale. `'1000'` never matches the regex at all |
| **Cannot be negative** | No sign is admitted |
| **Boundary** | `'0'` and `'100'` are **valid** (inclusive); `'100.5'` matches the regex but fails the bound ⇒ not valid |
| **Rejected** | `'-5'`, `'1e3'`, `'abc'`, `''`, `'95%'`, `'9,5'`, `'NaN'` |

### 2.3 Exact SQL delta — replaces Revision 5 step 7, lines 404–414

(as revised by 5.1 §C-3 and 5.2 §2.2; this is the consolidated final form)

```sql
  -- ── 7. CONTRIBUTORS + CONFIDENCE — ALL-OR-NOTHING OVER A VALIDATED SCALE ──
  -- The contributor set is exactly the ids the value loop accepted, deduplicated. Provenance
  -- records the same ids per target, so provenance and confidence cannot disagree.
  select array_agg(distinct c::uuid) into v_contributor_ids
    from jsonb_array_elements(v_source_input) e,
         jsonb_array_elements_text(e->'ids') c;

  if v_contributor_ids is null or array_length(v_contributor_ids, 1) is null then
    raise exception 'SNAPSHOT_NO_CONTRIBUTORS' using errcode = '22023';
  end if;

  select count(*) into v_contributor_count
    from public.extracted_fields f
   where f.id = any (v_contributor_ids);

  if v_contributor_count <> array_length(v_contributor_ids, 1) then
    raise exception 'SNAPSHOT_CONTRIBUTOR_DRIFT' using errcode = '42501';
  end if;

  -- VALIDATED SCALE 0–100. The predicate sits in the WHERE clause, so the cast is evaluated
  -- ONLY on rows that already passed the regex and the bound: it can never raise 22P02 and can
  -- never see a value above 100. A score outside the scale is simply NOT a score.
  select count(*), avg((f.confidence_score)::numeric)
    into v_scored_count, v_confidence
    from public.extracted_fields f
   where f.id = any (v_contributor_ids)
     and f.confidence_score ~ v_conf_regex
     and (f.confidence_score)::numeric <= 100;

  -- ALL-OR-NOTHING. A mean over a subset would publish a partial basis as a complete figure.
  if v_scored_count = v_contributor_count then
    v_confidence_stored := round(v_confidence, 2);
  else
    v_confidence_stored := null;   -- unknown: never 0, never a partial mean
  end if;
```

**Declare additions:** `v_conf_regex text` (constant), `v_contributor_ids uuid[]`, `v_contributor_count integer`, `v_scored_count integer`, `v_source_scores jsonb`.

**Not an error, deliberately.** An invalid or out-of-range score yields **NULL**, not a refused snapshot: the financial values are unaffected, provenance records the raw value so the NULL is explainable from the row itself, and a malformed review-time score must not block a legitimate financial write. (The alternative — a controlled `SNAPSHOT_CONFIDENCE_INVALID` refusal — was rejected for that reason; it would also fire on data the reviewer cannot fix from this screen.) No new error codes are introduced.

**Preserved unchanged:** the all-or-nothing rule; `metadata.provenance` carrying each target's `field_ids` **and** the raw `scores` verbatim (Revision 5.2 §2.3); per-field scores in the content hash (D-20); contract-order determinism. An unrelated accepted field still cannot move the hash, the confidence or the provenance.

**Monitoring query** (read-only, informational — currently returns **0**):

```sql
select count(*) as invalid_or_out_of_range
  from public.extracted_fields
 where confidence_score is not null
   and not (confidence_score ~ '^\s*[0-9]{1,3}(\.[0-9]+)?\s*$'
            and confidence_score::numeric <= 100);
```

### 2.4 Adversarial tests

| # | Scenario | Expected result |
|---|---|---|
| **T-N80** | A contributor's score is `'150'` (out of range) | Confidence **NULL**; **no** `22P02`, no 500; provenance records `'150'` raw |
| **T-N81** | Contributor scores `'1000'`, `'1e3'`, `'-5'`, `'abc'`, `''` (one fixture each) | Confidence **NULL** in every case; no cast error; the snapshot still persists |
| **T-N82** | Real-world values `'76'`, `'88'`, `'96'` (observed range) | All valid ⇒ confidence **86.67**; non-NULL |
| **T-N83** | Boundaries — `'0'` and `'100'` | Both **valid** and included; `'100.5'` ⇒ not valid ⇒ NULL |
| **T-N84** | Whitespace-padded `' 88 '` | Valid (the column is text); confidence **88** |
| **T-N85** | One contributor `'88'`, one `'150'` | **NULL** — all-or-nothing over a validated scale |
| **T-N86** | Repeated identical calls with an invalid-score contributor | Identical hash ⇒ `deduplicated: true`; the NULL-confidence hash is stable |
| **T-N87** | Static: the `::numeric` cast appears **only** in statements whose `WHERE` carries the predicate | 0 unbounded casts of `confidence_score` in the function |

---

## 3. Consolidated expectation changes

| # | Superseded by | Final expectation |
|---|---|---|
| T-N46 | this report §1.3 | Audit-verified attribution; `created_by IS NULL` |
| T-N47b | this report §1.3 | Call succeeds; audit records the **claim**; `created_by IS NULL` |
| T-N53 / T-N54 / T-N55 / T-N57 | **unchanged** from 5.2 | NULL unless every contributor is scored; provenance records raw scores |
| T-N80 – T-N87 | this report §2.4 | New — validated 0–100 scale, cast-safe |
| T-N91 / T-N92 | this report §1.3 | New — dedupe attribution; omission guard |

Everything else in Revision 5, 5.1 and 5.2 keeps its stated expectation.

---

## 4. Gate B recommendation (unchanged)

Isolated Gate B remains **ready for a separate authorization** on the conditions already stated — fold 5.1, 5.2 and this reconciliation into the Revision 5 documents, resolve the one unbound profile before enabling the path for it, expect sparse confidence, and verify privileges immediately after applying in the isolated environment.

Two notes from this reconciliation: the `created_by` decision needs **no** SQL change, so it removes work rather than adding it; and the confidence validation is range-bounded and cast-safe, which means the only remaining confidence behaviour to accept is the **NULL-by-design** outcome already approved.

**Gate B is NOT authorized. Nothing in this report has been implemented.**