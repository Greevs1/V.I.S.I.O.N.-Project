# PHASE 6 CLOSEOUT — EXTRACTION REVIEW + PROMOTION BEHAVIOR

**Not published. Phase 6C not started. No `business_facts`. No new review system, no new
confidence model, no new extraction engine, no rewritten BIS.**

Everything below was read from the running code; live results are marked as such.

---

## 1. The existing `pending_review → accepted / corrected` mechanism

**Written as pending, always.** `extractEngine` inserts every field with
`review_status: 'pending_review'` (`base44/shared/documentExtraction/extractEngine.ts`),
along with `confidence_score: '85'`, `source_page: 1`, and the period in `metadata`
(`fiscal_year`, `period_type`, `period_start/end`).

**Promotion writers — two, both already existed:**

| Writer | Authorization | Side effects |
|---|---|---|
| `supabaseUserData` → action `updateExtractedFieldReview` | owner: `field.profile_id === caller`, or the owning document's `profile_id`. Rejects anything else with 403. | recomputes the document's review state (below); **now also** fires `regenerateCiqMetrics` on accept/correct |
| standalone `updateExtractedFieldReview` function | owner, or an advisor with an `advisor_assignments` row for the field's business | fires `regenerateCiqMetrics` on accept/correct |

Both write `review_status`, `reviewed_by`, `reviewed_at`, and for `accept`
`accepted_value = field_value` / `accepted_normalized_value = normalized_value`; for
`correct` the reviewer's value; for `reject` both are nulled. Valid statuses:
`pending_review · accepted · corrected · rejected · needs_clarification` (notes are
mandatory for clarification, and a corrected value is required for `corrected`).

**Document state is recomputed on every review write:** if every field of the document is
`accepted`/`corrected`/`rejected` and none needs clarification → `document_analysis`
**and** `documents.upload_status` become `completed`; otherwise `needs_review`.

**So the exact path was:** extract → every field `pending_review` → (a review action) →
`accepted`/`corrected` with the reviewer recorded → document flips to `completed` only
when nothing is left pending.

## 2. The existing review UI

`src/components/admin/ExtractedFieldsReviewQueue.jsx` — a full review surface: fields
grouped by document, per-field extracted value, normalized value, confidence, source
page, status badge, notes, save. It calls the router actions
`getExtractedFieldsReviewQueue` and `updateExtractedFieldReview`.

**It was mounted nowhere.** A repository-wide search found no importer of the component.
Its data action also filters to `review_status = 'pending_review'`, which makes the
panel's own Reviewed / Accepted / Corrected / Rejected counters structurally always zero.

**Answer to "does the user currently have an obvious way to review?": no.** The
capability existed; the path did not. That was the defect this pass closed.

## 3. Existing confidence behavior

- Per field: `confidence_score: '85'` is **hardcoded for every field**. It is not
  measured, and every field carries the same number.
- Per document: `finalStatus = avgConfidence >= 80 ? 'completed' : 'needs_review'`. With
  a constant 85, the average is always 85, so a document **always** lands `completed`.
- The review card displays that 85 as a confidence percentage, and the Data Room shows
  it as "85% confidence".

So the code has the *shape* of a confidence threshold but no real confidence signal
behind it. This is the most important finding of the pass and is a precondition for any
honest promotion policy (§18).

## 4. Does auto-accept exist?

**No.** Nothing anywhere sets `review_status` to `accepted` at extraction time. The only
code that reads the `>= 80` threshold is the *document-level* status above, which cannot
promote a field, and whose input is a constant.

No legitimate reviewed/approved auto-accept policy exists, so **none was invented**. Per
the instruction, this is reported for Phase 6C to formalize.

## 5. Review UX changes made

The existing review UI is now reachable from the Data Room and states what it needs to:

- **Data Room → Review tab** (label carries the real pending count, e.g. `Review (76)`;
  also reachable as `?tab=review`). It renders the existing panel — not a second system.
- **`FieldReviewCard`** now shows: field · value · **period** (extraction `fiscal_year` →
  document year → period end; never guessed) · **source document as a link** · confidence,
  plus explicit **Accept / Correct / Reject / Needs clarification** actions instead of a
  status dropdown. Correct reveals value + numeric inputs; notes stay optional except for
  clarification.
- **Header counts are real** (server-computed totals, see §7) instead of counts of the
  loaded page.
- **"Vision updated" confirmation** after a promotion: "I learned N new pieces of
  information about your business" listing only the facts actually confirmed in this
  session. No diff engine, no "See what changed" (it cannot be supported cleanly, so it
  was omitted).
- **Honest empty state:** "Everything Vision found is confirmed — N confirmed facts are in
  use across Business Intelligence."
- **Scope:** the queue and the summary are resolved against the business the Data Room is
  showing (plus the caller's own household rows), so a multi-business owner no longer sees
  every business's unreviewed facts in one list.

## 6. Batch acceptance capability

**It does not exist**, in any form: no bulk action, no multi-select, no "accept all".
`createSnapshotFromReviewedFields` is snapshot promotion for one document's
*already-reviewed* fields — not batch acceptance of pending ones.

Per the instruction it was **not invented**. With per-field confidence currently a
constant (§3), bulk promotion would be exactly the "low-confidence extraction bulk-promoted
for convenience" the instruction forbids. Recommendation for 6C: define per-field
eligibility (measured confidence + field type) first, then a batch action on top of it.

## 7. Assessment `pending_review` decision — documented, not changed

**Decision:** assessments keep reading `accepted` **and** `pending_review`. This is
intentional: an assessment pre-populates an editable field the owner then confirms by
submitting the assessment, so pending data is used as a starting point, not as published
truth. Changing it would force review before an owner can fill in a form they already
answer by hand.

**But it is now visibly distinguished**, as required:

- `getMetricAutoPopulate` returns the winning row's `review_status` alongside the source
  document.
- `GalileoBadge` renders **amber** and states "Extracted, not yet confirmed — review it in
  the Data Room" when the figure behind an auto-populated value is still pending; governed
  values keep the champagne treatment. Still clickable in both cases — the document is
  where it gets confirmed.
- Wired into Tax Gap (AGI), Value Gap (EBITDA) and **Operations Gap (monthly take-home)**,
  which could previously take an extracted `owner_compensation` with no indication at all.

**Recorded, not changed:** the winning row is still "newest row wins", so a newer *pending*
row can outrank an older *governed* row for assessment prefill. BIS is unaffected (it reads
governed only). Precedence belongs to 6C (§18).

## 8. Downstream invalidation after acceptance

Promotion now runs the existing paths, and nothing new was built:

- **Client:** on a successful accept/correct the panel invalidates
  `['extractedFieldsReview']`, `['extraction-review-summary']`, `['data-room-documents']`,
  `['documents']`, and the BIS contract key `['business-intelligence-contract']`.
- **Server:** the router now fires the **same** `regenerateCiqMetrics` call the standalone
  advisor review already fired, for accepted/corrected fields with a business —
  fire-and-forget, so a failed recalculation can never fail the owner's review.

No browser refresh is required: the Data Room banner, row hints, tab count and the BIS
read layer all re-read on those invalidations.

## 9. BIS result

**Unchanged and deliberate.** `businessIntelligenceContract` continues to read
`review_status IN ('accepted','corrected')` — `pending_review` was **not** admitted. What
changed is that the evidence is now promotable through a visible path, so BIS can actually
receive it. After promotion BIS re-reads via the invalidated contract key.

## 10. Galileo result

`buildGalileoContext` uses advisor-reviewed fields (`reviewed_at`) as
`accepted_financial_fields`; promotion sets `reviewed_by`/`reviewed_at`, so a promoted
value is available to Galileo for the active business on the next context build (which the
invalidation triggers). Document provenance travels with the fact (`document_id`).
The structured citation *link* in the answer panel remains the open 6C item recorded in
the previous pass.

## 11. What If result

The governed baseline is read from the BIS layer, so once a value is accepted/corrected and
BIS re-reads, What If resolves that governed figure instead of asking. **Verified by code
path only** — see §17 for why the write loop was not driven at runtime.

## 12. Business Intelligence completeness result

Computed from the contract; it moves when facts become governed and does **not** move while
they are pending — unchanged, and now explained in the UI: the banner states that pending
facts "cannot be used throughout Business Intelligence until you confirm them". The
completeness figure was not faked or bumped, and the review-status asymmetry is now visible
where the owner can act on it.

## 13. Document status behavior

The processing architecture is untouched (`uploaded · processing · needs_review ·
completed · failed`). Presentation was clarified, not redesigned:

- A document showing **Ready** that still has unreviewed facts now carries an amber
  "N facts need review" line under its badge.
- The **"Financials analyzed"** panel states the real totals: "Vision found 80 financial
  facts. 3 ready · 76 need your review", with `Review extracted information →` when
  anything is outstanding, and the all-pending wording when nothing is confirmed yet.

Noted for honesty: because extraction always ends at `completed` (§3), **Ready means
"extraction finished"**, not "everything confirmed" — which is exactly the ambiguity these
two additions remove without touching status writes.

## 14. Source → exact document behavior

The review card's **source is the document name as a link**, opening through
`useOpenDocument()` — the one document opening contract (`?workspace=data-room&id=<id>`
inside Vision, `/data-room?document=<id>` elsewhere) into the existing viewer. Fail-closed:
an id that is not in the active Data Room is refused, never a viewer.

## 15. Files changed

**Created**
- `src/components/dataroom/LearnConfirmation.jsx` — the lightweight post-promotion confirmation.
- `src/PHASE_6_EXTRACTION_REVIEW_PROMOTION_CLOSEOUT.md` — this report.

**Edited**
- `base44/functions/supabaseUserData/entry.ts` — new read-only action
  `getExtractionReviewSummary` (server-computed, business-scoped); review queue scoped to
  the business in view and enriched with the document's `year`; `updateExtractedFieldReview`
  now fires the existing `regenerateCiqMetrics` on accept/correct.
- `src/components/admin/ExtractedFieldsReviewQueue.jsx` — period + clickable source +
  Accept/Correct/Reject/clarification actions; real header counts via a `summary` prop;
  downstream invalidation; "Vision updated" confirmation; honest empty state.
- `src/pages/DataRoom.jsx` — Review tab (real pending count, `?tab=review`), "Financials
  analyzed" banner with real counts, per-row "N facts need review".
- `base44/functions/getMetricAutoPopulate/entry.ts` — source object now carries
  `review_status` (governed vs pending).
- `src/components/galileo/GalileoBadge.jsx` — amber "not yet confirmed" state.
- `src/components/assessments/OperationsGapAssessmentCore.jsx` — pass the source document
  for auto-populated take-home.

**Untouched, on purpose:** BIS read layer, extraction engine, review writers'
authorization, document status writes, `business_facts`, Data Room structure.

## 16. Build / lint

- `npx vite build` → **exit 0**.
- `npx eslint` on all changed files → **0 errors**. Pre-existing warnings only (unused
  `eslint-disable` directives; one unused state variable in the review panel).

## 17. Runtime validation performed

**Performed (read-only / fail-closed, no writes):**
- `getMetricAutoPopulate` → executed, **403 `BUSINESS_CONTEXT_DENIED`** on a non-existent
  business id. The tenant guard holds and the edits parse and run.
- `getExtractionReviewSummary` → executed against the live database and returned **real
  counts**: 80 extracted facts across 7 documents — 3 governed (2 accepted, 1 corrected),
  75 pending, 1 needing clarification, 1 rejected. This validates the counting half of the
  loop end to end on real data.

**Not performed, and why:** the *write* half (accept a field, then observe BIS → Galileo →
What If) was not driven at runtime. Accepting a field would modify live customer financial
records — the 80 facts above are the account's own — which the instruction forbids; and
fabricating an "isolated" test business, document and field set would write fake rows into
the live production database, where they would surface in the owner's business selector,
Data Room and intelligence runs. I will not pollute a live app to prove a loop.

**Validation the owner should run in the app (one document, one field):**
1. Upload a P&L. → Data Room shows "Vision found N financial facts · X ready · Y need your review".
2. Open **Review**: confirm each row states field, value, period, source, confidence.
3. Click the source → the exact document opens in the viewer.
4. **Accept** one field (e.g. Revenue). → "Vision updated · I learned 1 new piece…", toast,
   the row leaves the queue, the tab count and banner decrement without a refresh.
5. Ask Galileo "What is my revenue?" → the confirmed value with document provenance, no
   re-asking.
6. Run What If → it uses the governed baseline without asking for revenue.
7. Check the completeness figure moves once the value is governed (not before).
8. **Correct** one field to a different number and confirm BIS follows the corrected value.

## 18. Deferred specifically to Phase 6C

1. **A real promotion policy** — the central item: is `pending_review` ever auto-promotable,
   by what rule, for which field types, and with what audit trail.
2. **Measured per-field confidence** — today it is a constant `85`, so no threshold can be
   trusted. This must precede any auto-accept.
3. **Batch acceptance** — deliberately not invented; needs eligibility rules and an explicit
   confirmation step first.
4. **Precedence rule** — governed should outrank pending for assessment/What If prefill once
   several rows exist for the same field, instead of "newest row wins".
5. **Structured Galileo citations** — returning `{document_id, name}` evidence to the answer
   panel (carried over from the previous pass).
6. **`supabaseUserData` size** — the router is 2,221 lines and above the platform guideline.
   It should be split into the focused sub-functions described in its own header. Not done
   here: it is the app's main data path and unrelated to this closeout.