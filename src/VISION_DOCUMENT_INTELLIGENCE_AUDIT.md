# VISION — DOCUMENT INTELLIGENCE & DATA ROOM INTEGRATION AUDIT

**Pass:** UPLOAD → EXTRACT → POPULATE → GALILEO → EVIDENCE → VIEWER
**Not published. Phase 6C not started.**
**Companion artifact:** `VISION_DOCUMENT_INTELLIGENCE_CONTRACT.md`

Everything below was read from the running code. Where something was not verified at
runtime, it says so. Nothing in this report is inferred from intent.

---

## 1. Existing upload architecture

`uploadDocumentToSupabase` is the one authenticated pipeline:

auth → Supabase profile by email → business resolution → `validateBusinessScope`
(403 fail-closed for non-admins) → storage `documents/{profileId}/{businessId|household|hybrid|profile}/…`
→ `documents` row (`business_id`, `document_scope`, `upload_source`, `upload_status`) →
`document_analysis` row (`queued`) → **`runExtraction()` inline, in the same request**
→ response carries `document_id`, `document_analysis_id`, and the extraction result.

The shared engine (`base44/shared/documentExtraction/extractEngine.ts`) reads the
document, writes normalized `extracted_fields` rows (`document_id`, `field_name`,
`field_value`, `numeric_value`, `confidence`, `review_status`), and sets
`document_analysis`. `retryDocumentAnalysis` (in the `supabaseUserData` router) and the
admin queues route through the same engine. `runDocumentExtraction` /
`createDocumentAnalysis` exist as separate functions but are **not** in the upload path.

## 2. Every reachable upload CTA found

| CTA | Destination before | Verdict |
|---|---|---|
| Data Room — header | **none** | ❌ **the destination every Vision CTA pointed at could not add a document.** Repaired. |
| Data Room — empty state | **none** | ❌ repaired (same action added) |
| Home → Connections → "Add a financial document" | `data-room` workspace | routes correctly but landed on a dead end; **now functional** |
| Playbook → "Add financial data" | `data-room` workspace | same |
| What If → missing governed input → `leaveForSource()` | `data-room` workspace | correct |
| Next Best Move → `evidence_gap` | `data-room` workspace | correct |
| Dashboard → `DataRequirementOverlay` → "Upload Documents" | `/upload` page | reaches the ONE uploader; not routed through the Data Room (deliberate, see §3) |
| Exit Readiness → `ReadinessModal` | `uploadDocumentToSupabase` (`upload_source: exit_readiness`) | correct |
| Agreements → `AgreementEditor` | `uploadDocumentToSupabase` (`upload_source: agreement`) | correct |
| Sprint task → `AttachDocumentModal` | `uploadDocumentToSupabase` | correct |
| Admin → `AdminFileUpload` / `AdminUserProfileContext` | `adminUploadDocument` (explicit `target_business_id`) | correct |
| Journey / guest onboarding → `DocumentUploadScene` | `guestSessionService` (guest signed-URL pipeline) | separate by design: a guest has no business yet |
| Admin activity log row "Uploaded Q4 Financials" | static sample data | informational |
| Onboarding progress step "Upload Financials" | step label | informational |

No duplicate uploader was found, and none was created.

## 3. Upload CTAs repaired

- **The Data Room can now add a document** (header + empty state → the existing
  `/upload` uploader). This was the single highest-impact defect in the chain: every
  "add financials" path in Vision ended at a repository with no way in.
- `DataRequirementOverlay` still goes straight to `/upload`. That is the same uploader,
  so it is not a duplicate; routing it through the Data Room would add a click without
  adding truth. Recorded, not changed.
- Home's document activity rows opened the **Data Room home** when the owner clicked a
  specific document. Now they open **that document** (§20).

## 4. Supported financial document types

**Extracted (6):** `profit_and_loss`, `balance_sheet`, `business_tax_return`,
`personal_tax_return`, `debt_schedule`, `payroll_report`.
**Accepted by the upload UI but not interpreted (5):** `insurance_document`,
`entity_document`, `buy_sell_agreement`, `estate_document`, `other` — they upload,
`runExtraction` returns "Extraction not supported for document type", and no fields are
written.
**Not supported today:** cash flow statement, bank statement, AR aging, AP aging,
general ledger, trial balance, loan statement, valuation report, projections, K-1,
1099, W-2 (`ar_report`, `ap_report`, `recast_ebitda` appear only in the server's scope
sets — no schema, not offered in the UI).

## 5. Extraction architecture

Schema-driven per document type; LLM extraction validated against the schema; values
normalized into `numeric_value`; per-field `confidence`; `review_status` starts
`pending_review` and is resolved through the admin review queue
(`updateExtractedFieldReview`, `ExtractedFieldsReviewQueue`). Extraction failure is
non-fatal to the upload: the document survives and the analysis stays retryable.

## 6. Fields currently extracted, by type

See the contract §3. P&L carries 13 fields, balance sheet 6, business return 6,
personal return 5, debt 5, payroll 4.

## 7. Fields currently stored but not used downstream

**P&L:** cogs, gross_profit, operating_expenses, total_expenses, depreciation,
amortization, interest_expense, taxes. **Balance sheet:** current_assets.
**Business return:** gross_receipts, wages, deductions. **Personal return:** total_tax,
itemized_deductions, qualified_business_income. **Debt:** lender_name, interest_rate,
monthly_payment, maturity_date. **Payroll:** total_payroll, owner_payroll,
employee_count, payroll_tax.

They are extracted and preserved as evidence, but no reader maps them into a metric, so
they currently improve nothing. This is unused capability, not lost data.

## 8. Existing mapping architecture

```
extracted_fields ─┬─ getMetricAutoPopulate (accepted|pending_review) → assessments
                  ├─ businessIntelligenceContract (accepted|corrected) → BIS (lowest tier)
                  ├─ generateOpportunities / generateNextBestActions (accepted|corrected)
                  ├─ ninetyDaySprint (accepted|corrected)
                  ├─ valuationService (as intelligence/evidence)
                  ├─ buildGalileoContext (advisor-reviewed only)
                  └─ canonicalFact/contextLoader (carries document_id)
```
One stored fact, many readers — no per-surface copies of the document values themselves.
The copies that DO exist are derived caches (§26).

## 9. Mappings / propagation repaired in this pass

1. **Source-document identity end to end.** `getMetricAutoPopulate` now selects
   `document_id`, resolves the source documents in one lookup, and returns
   `sources.<metric>_document = { document_id, name, document_type, year }` — only when
   the winning row really carries a document id.
2. **Clickable source in assessments.** `GalileoBadge` becomes a link when a document is
   supplied (Tax Gap AGI, Value Gap EBITDA now pass it), so the owner can go from the
   figure to the document it came from.
3. **One document opening contract** (`useOpenDocument`), used by the badge and by Home
   activity rows.
4. **The Data Room resolves a deep link to the exact document** (§19–21).
5. **Galileo's documents are business-scoped** (§11).
6. **BIS is invalidated after an upload** (§10).

## 10. BIS refresh behaviour

Extraction already runs inside the upload, so the data exists by the time the request
resolves. The client invalidated `['documents']` and `['data-room-documents']` **but not
the BIS contract**, which is the read layer behind Business Pulse, the completeness
figure and Galileo's business context — so a new document did not appear until something
else refreshed. **Repaired:** the upload now invalidates
`['business-intelligence-contract']` as well.

**The honest nuance:** BIS, opportunities, NBA and Sprint read
`review_status IN ('accepted','corrected')`. A fresh extraction is `pending_review`, so
it reaches the owner's assessments immediately but **not** the BIS contract, Business
Pulse, or the completeness figure until a reviewer accepts it. That asymmetry is the
real reason a new document does not always move the BI% number, and it is by design
today — not a bug to paper over.

## 11. Galileo document-data behaviour

`buildGalileoContext` builds `document_summary` (per type, and now with ids available to
the context builder) and `accepted_financial_fields` from advisor-reviewed rows, for the
active business. `askGalileo` loaded its supporting documents with
`.eq('profile_id', profileId)` — **profile-wide**: a multi-business owner's answer could
be informed by another business's paperwork. **Repaired:** business-scoped
(`business_id` when resolved, profile fallback only when there is no business), with
`id` retained so a citation can resolve to a document.

## 12. Galileo provenance behaviour

Available today: accepted fields are labelled `source: 'advisor_review'`; document type
and period travel with the summary; the prompt instructs the model to distinguish
verified from hypothesis and never to call extracted data verified.
**Still missing:** the answer's `sources` array holds prose strings, so the UI cannot
turn a citation into a link to the cited document. The ids are now in the context, but
the structured `{document_id, name}` evidence is not yet returned to the answer panel.
Deferred deliberately: changing the answer schema risks the core Galileo journey, and
guessing ids from prose would be worse than no link.

## 13. Assessment pre-population behaviour

Already present and business-scoped (`getMetricAutoPopulate` with
`requireBusinessContext`): AGI → Tax Gap, EBITDA → Value Gap, revenue/net profit →
Profit Gap. Owners were already spared re-typing. **Repaired:** the source now names a
real document and opens it.

## 14. Valuation behaviour

`valuationService` reads `extracted_fields` (business-scoped) and `document_analysis`
as intelligence/evidence. Advisor-governed inputs and versioning were **not** touched:
documents inform the valuation, they do not overwrite an advisor's assumption. No
change made in this pass.

## 15. What If behaviour

The governed-precedence recovery flow already exists, and a missing governed input
routes the owner to the Data Room (`leaveForSource`). No change made. **Requires the
runtime test in §32** to confirm a document-derived baseline is picked up over an earlier
owner-reported figure.

## 16. Dashboard / Pulse behaviour

Business Pulse reads the BIS contract only — nothing to change. `supabaseDashboardData`
reads `extracted_fields` **profile-scoped** for its confidence/quality engines: another
business's documents can influence a multi-business owner's confidence scores.
Recorded as debt (§26).

## 17. Opportunity recalculation behaviour

`generateOpportunities` reads accepted/corrected document fields as engine inputs, so a
document does improve the next run. Recalculation is **not** event-driven: a new document
does not itself trigger a regeneration, and no duplicate-opportunity logic was found. Not
changed.

## 18. Business Intelligence completeness behaviour

The completeness figure is computed from the real contract. It responds to document data
through the BIS tier — which requires accepted/corrected rows (§10). Nothing was faked or
bumped.

## 19. Document deep-link architecture

New: `src/lib/visionWorkspace/openDocument.js`. Inside Vision the workspace layer owns
navigation (`?workspace=data-room&id=<documentId>`, trail preserved so Back returns to
the originating surface); anywhere else the real route
(`/data-room?document=<documentId>`). `?needs=<label>` renders the contextual
"Vision needs more information" header above the existing upload flow.

## 20. Document-reference surfaces repaired

| Surface | Before | Now |
|---|---|---|
| Home → Recent activity → "Analyzed <file>" | opened the Data Room home | opens **that document** |
| Assessment source badge (Tax Gap AGI, Value Gap EBITDA) | icon + tooltip only | clickable when a document backs the value |
| Data Room header / empty state | no way to add a document | existing uploader |
| Data Room deep link | ignored | resolves the exact document, fail-closed |

Unchanged and intentionally non-clickable: the admin activity log sample rows, the
journey document scene (guest), readiness step labels, and prose source labels with no
document behind them.

## 21. Exact viewer opening behaviour

`requestedDocumentId` is resolved **against the active business's own document list**.
In the list → the existing `DocumentViewer` opens on that document (signed URL through
`supabaseUserData.getDocumentSignedUrl`, which itself asserts business access). Not in
the list → no viewer, an explicit "That document is not in this Data Room", and the
request is cleared from the URL. Closing the viewer clears the request too.

## 22. Processing / error behaviour

`pending_analysis → analyzing → completed | needs_review | failed`, surfaced as per-row
status plus Uploaded / Completed / Needs Review / Pending counts, with Retry and
Mark-for-review actions. Unsupported types complete without fields rather than appearing
understood. No silent "ready" state was found or introduced.

## 23. Conflict behaviour

Unchanged and still naive: for the same field, the most recent row wins. Different
periods (2024 return vs 2025 P&L) are correctly independent; two contradictory figures
for the same period resolve by upload recency. Reported for Phase 6C (§27).

## 24. Personal-vs-business safeguards

Verified in the upload path: household types (`personal_tax_return`, `1040`, `w2`,
`1099`, `personal_bank_statement`, estate/wealth types) are stored with
`business_id = null`; hybrid types require explicit context and never fall back to a
primary business; business types resolve admin target → active business → primary →
auto-create. One intentional cross-scope mapping: `adjusted_gross_income` (household)
pre-populates the **Tax Gap** assessment, which is the owner's personal tax position.
Keep it there and nowhere else.
**Flagged:** for business documents, a missing `active_business_id` still falls back to
`primary_business_id`. The uploader passes the active business when it has one, so this
only bites callers that do not — worth closing in 6C.

## 25. Business isolation results

- Upload: `validateBusinessScope` → 403 for a business the caller has no relationship
  with (verified in code; smoke-tested indirectly, §31).
- Reads: `extracted_fields` and `documents` are business-scoped in
  `getMetricAutoPopulate`, `buildGalileoContext`, `generateOpportunities`,
  `ninetyDaySprint`, the BIS contract and `valuationService`.
- Fixed in this pass: `askGalileo` (was profile-wide).
- Still profile-level by design or debt: `supabaseDashboardData` (confidence),
  `profile_financials` / `galileo_opportunities` reads in `ninetyDaySprint`, and the
  `business_assessments` / `ninety_day_sprint_paths` reads in `askGalileo`.
- The deep-link path cannot cross businesses: the id is only matched against the active
  business's list, and signed-URL issuance re-asserts access.

## 26. Duplicate financial storage discovered

Single source of truth for the document itself: `documents` + `extracted_fields`.
Derived copies of the same numbers live in `dashboard_metrics`, `business_metric_snapshots`,
`profile_financials`, `assessment_answers`/`assessment_calculations`, `galileo_opportunities`
and the BIS snapshot tables, each with its own writer and its own readers. Risk: the same
figure can drift between them, and Phase 6.9 already had to repair business identity in
`dashboard_metrics`. No schema rewrite attempted here (per the pass rules) — recorded for
6C.

## 27. Gaps intentionally deferred to Phase 6C

Fact-level provenance and reconciliation (same-period conflicts, multiple documents
behind one value); canonical `business_facts`; cash-flow/bank/GL/trial-balance/AR-AP
extraction; mapping the unused extracted fields; structured Galileo citations;
event-driven recalculation; removing the primary-business fallback; profile-scoped
readers in the dashboard/confidence path.

## 28. VISION DOCUMENT INTELLIGENCE CONTRACT

Created: `src/VISION_DOCUMENT_INTELLIGENCE_CONTRACT.md` — per type: extraction
capability, extracted fields, semantic definitions, period support, downstream
destinations, BIS mapping, Galileo availability, assessment/valuation/What If/opportunity
use, viewer deep link, processing and confidence rules, known limitations.

## 29. Files changed

**Created:** `src/lib/visionWorkspace/openDocument.js`,
`src/VISION_DOCUMENT_INTELLIGENCE_CONTRACT.md`,
`src/VISION_DOCUMENT_INTELLIGENCE_AUDIT.md`.
**Edited:** `src/pages/DataRoom.jsx` (upload action ×2, deep link + fail-closed open,
`needs` header, close clears the request, import cleanup),
`src/hooks/useVisionActions.js` (document activity → exact document),
`src/pages/DocumentUpload.jsx` (BIS invalidation after upload),
`base44/functions/askGalileo/entry.ts` (business-scoped documents),
`base44/functions/getMetricAutoPopulate/entry.ts` (source document identity),
`src/components/galileo/GalileoBadge.jsx` (clickable source when a document exists),
`src/components/assessments/TaxGapAssessmentCore.jsx` and
`src/components/assessments/ValueGapAssessmentCore.jsx` (carry and pass the source
document).

## 30. Build / lint results

- `npx vite build` → **exit 0**, no unresolved imports.
- `npx eslint` on every changed file → **0 errors**. Pre-existing warnings elsewhere in
  those files (unused `eslint-disable` directives, one unused helper in
  `DocumentUpload.jsx`) were left untouched.

## 31. Runtime tests completed

- Both edited backend functions were executed: `getMetricAutoPopulate` (515 ms) and
  `askGalileo` (335 ms) deployed, parsed and ran, and both **failed closed** with
  `BUSINESS_CONTEXT_DENIED` on a deliberately invalid business id — the tenant guard
  works and the edits did not break function startup.
- **No end-to-end upload was run.** Extraction, mapping, BIS refresh and the deep link
  were verified by reading the code paths, not by driving a real document through them.

## 32. Manual tests still required

TEST A CTA → existing uploader · B upload P&L → `documents.business_id` correct ·
C processing → `extracted_fields` populated · D extracted revenue → BIS sees it
(remember `review_status`) · E Galileo revenue question uses it · F assessment
pre-populates + source opens · G What If uses the governed value · H valuation
intelligence shows it · I Pulse/Dashboard update · J–L document references open the
exact document from Galileo / Recent Activity / assessment sources · M business A
document invisible under business B · N two periods, no naive overwrite · O failed
extraction shows no false "ready" · P completeness moves only after acceptance.