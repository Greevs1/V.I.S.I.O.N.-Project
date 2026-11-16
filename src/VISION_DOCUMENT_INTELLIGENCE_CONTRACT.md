# VISION DOCUMENT INTELLIGENCE CONTRACT

**Status:** authoritative reference for how a financial document becomes business
intelligence, and for where it may be used. Written from the running code, not from
intent. Where a capability does not exist, it says so.

**Scope of this contract:** the existing document system — `documents`,
`document_analysis`, `extracted_fields`, the shared extraction engine, the BIS read
layer, Galileo's context, and the Data Room viewer. Phase 6C (canonical
`business_facts`) is **not** part of this contract and is not implemented.

---

## 1. THE CHAIN (verified against code)

```
UPLOAD      src/pages/DocumentUpload.jsx  →  uploadDocumentToSupabase
EXTRACT     runExtraction() inside the upload  (base44/shared/documentExtraction/extractEngine.ts)
CLASSIFY    document_type (upload UI) + document_scope (server, from type)
UNDERSTAND  document_analysis row  (analysis_status, extracted_data, missing_fields)
MAP         extracted_fields rows  (field_name, field_value, numeric_value, confidence, review_status)
POPULATE    getMetricAutoPopulate  (priority 1 = extracted_fields) → assessments
REFRESH     React Query invalidation: ['documents'], ['data-room-documents'], ['business-intelligence-contract']
GALILEO     buildGalileoContext + askGalileo (business-scoped documents; advisor-accepted fields)
EVIDENCE    Data Room viewer, opened by document_id through ONE contract
```

**One uploader.** Every authenticated upload path calls `uploadDocumentToSupabase`:
the Data Room's own Upload action (added by this pass), the `/upload` page, Exit
Readiness, Agreements, and Sprint document attach. The journey/guest pipeline
(`guestSessionService` + `DocumentUploadScene`) is separate by design: a guest has no
business yet, and those files are promoted at account creation.

**One viewer.** `src/components/documents/DocumentViewer.jsx`, mounted by
`src/pages/DataRoom.jsx` and by the legacy document surfaces. Nothing else renders a
document.

**One opening contract.** `src/lib/visionWorkspace/openDocument.js` →
`useOpenDocument()`. Components never hand-roll a Data Room route.

---

## 2. SUPPORTED DOCUMENT TYPES (extraction capability)

`VALID_DOC_TYPES` (upload validation) and the upload UI accept eleven types. The
extraction engine defines schemas for **six**. The other five upload successfully and
are **not** interpreted: `runExtraction` returns
`Extraction not supported for document type: <type>` and the analysis completes without
fields.

| Type | Extraction | Confidence model |
|---|---|---|
| `profit_and_loss` | ✅ full | per-field LLM confidence |
| `balance_sheet` | ✅ full | per-field LLM confidence |
| `business_tax_return` | ✅ full | per-field LLM confidence |
| `personal_tax_return` | ✅ full — **household scope** | per-field LLM confidence |
| `debt_schedule` | ✅ full | per-field LLM confidence |
| `payroll_report` | ✅ full | per-field LLM confidence |
| `insurance_document` | ⛔ uploaded, not interpreted | — |
| `entity_document` | ⛔ uploaded, not interpreted | — |
| `buy_sell_agreement` | ⛔ uploaded, not interpreted | — |
| `estate_document` | ⛔ uploaded, not interpreted | — |
| `other` | ⛔ uploaded, not interpreted | — |

**Not supported at all today:** cash flow statement, bank statement, AR aging, AP
aging, general ledger, trial balance, loan statement, valuation report, financial
projections, K-1, 1099, W-2 as document types. (`ar_report` / `ap_report` /
`recast_ebitda` exist in the server's *scope* sets but have no extraction schema and
are not offered in the upload UI.) Do not claim support for these in product copy.

---

## 3. EXTRACTED FIELDS BY TYPE

Read from `EXTRACTION_SCHEMAS`.

**`profit_and_loss`** — annual_revenue, cogs, gross_profit, operating_expenses,
operating_income, reported_ebitda, interest_expense, taxes, depreciation,
amortization, net_profit, total_expenses, owner_compensation.

**`balance_sheet`** — total_assets, current_assets, total_liabilities, total_equity,
cash_on_hand, total_debt.

**`business_tax_return`** — gross_receipts, ordinary_business_income,
officer_compensation, wages, deductions, taxable_income.

**`personal_tax_return`** — adjusted_gross_income, taxable_income, total_tax,
itemized_deductions, qualified_business_income.

**`debt_schedule`** — lender_name, loan_balance, interest_rate, monthly_payment,
maturity_date.

**`payroll_report`** — total_payroll, owner_payroll, employee_count, payroll_tax.

### Semantic rules that are NOT interchangeable
Revenue ≠ cash received. Net income ≠ EBITDA. Gross margin ≠ net margin. Business
revenue ≠ household income. TTM revenue ≠ prior fiscal-year revenue. Projected ≠
actual. `reported_ebitda` is the document's own EBITDA; the app's recast EBITDA is a
different metric and is never taken from it unless the document states it.

### Extracted but currently unused downstream
COGS, gross_profit, operating_expenses, total_expenses, depreciation, amortization,
interest_expense, taxes (P&L); current_assets (balance sheet); wages, deductions,
gross_receipts (business return); total_tax, itemized_deductions,
qualified_business_income (personal return); lender_name, interest_rate,
monthly_payment, maturity_date (debt); total_payroll, owner_payroll, employee_count,
payroll_tax (payroll). They are stored on `extracted_fields` and **are not mapped into
any metric today**. Nothing asks the owner to re-type them, but nothing consumes them
either — see the audit report's deferred list.

---

## 4. PER-TYPE DOWNSTREAM TABLE

| Destination | P&L | Balance sheet | Business return | Personal return | Debt | Payroll |
|---|---|---|---|---|---|---|
| `extracted_fields` (evidence) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assessment auto-populate (`getMetricAutoPopulate`) | revenue, net_profit, ebitda, monthly_take_home | — | — | agi | — | owner_compensation → monthly_take_home |
| Galileo context (`buildGalileoContext`) | accepted fields only | accepted only | accepted only | accepted only | accepted only | accepted only |
| Galileo answers (`askGalileo`) | via BIS + document list | same | same | same | same | same |
| Data Room viewer deep-link | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Business Pulse | via the BIS contract only — it reads no documents directly | — | — | — | — | — |
| BIS contract (`businessIntelligenceContract`) | ✅ **lowest tier**, business-scoped: assessment_calculations > dashboard_metrics > extracted_fields; **accepted/corrected only** | — | — | — | — | — |
| Dashboard confidence / quality (`supabaseDashboardData`) | ✅ document presence + extracted fields feed the confidence engines — currently read **profile-scoped** (recorded debt) | — | — | — | — | — |
| Opportunities (`generateOpportunities`) | ✅ accepted/corrected fields, business-scoped, as engine inputs | — | — | — | — | — |
| Next Best Move (`generateNextBestActions`) | ✅ accepted/corrected fields, business-scoped | — | — | — | — | — |
| 90-Day Sprint (`ninetyDaySprint`) | ✅ accepted/corrected fields, business-scoped | — | — | — | — | — |
| Valuation (`valuationService`) | ✅ extracted fields + document analyses read as **intelligence and evidence**; advisor-governed inputs are never overwritten | — | — | — | — | — |
| What If baseline | through the governed BIS baseline, never straight from a document | — | — | — | — | — |

**Household documents never populate business intelligence.** `personal_tax_return`
and the other household types are stored with `business_id = null`; the business
scoped readers (`getMetricAutoPopulate`, `buildGalileoContext`, `askGalileo`) therefore
cannot see them. The one exception to review: `getMetricAutoPopulate` maps
`adjusted_gross_income`, which is a household figure, into the **Tax Gap** assessment —
that assessment is the owner's personal tax position, so the mapping is intentional and
must stay on that surface only.

---

## 5. ACCEPTANCE, CONFIDENCE, AND WHAT MAY BE USED

- Every extracted value lands as an `extracted_fields` row with `review_status`
  (`pending_review` → `accepted`/`rejected` via the admin review queue),
  `confidence`, `field_value` (as read) and `numeric_value` (normalized).
- `getMetricAutoPopulate` reads `review_status IN ('accepted','pending_review')` and
  prefers `numeric_value`, taking the most recent row per field name.
- The BIS contract, opportunities, NBA and Sprint read
  `review_status IN ('accepted','corrected')` only. A freshly extracted value is
  therefore usable in assessments before it is usable in BIS — deliberately, and it is
  the main reason the completeness figure lags a new upload.
- `buildGalileoContext` uses **advisor-reviewed fields only** (`reviewed_at`) as
  `accepted_financial_fields`, and labels them `source: 'advisor_review'`.
- A low-confidence value is therefore admissible into assessment *pre-population*
  (where the owner can correct it) but is not presented to Galileo as reviewed fact.
- Sources are never invented: a source document is reported only when the winning row
  really carries a `document_id` (`getMetricAutoPopulate` → `sources.<metric>_document`).

---

## 6. PERIODS, CONFLICTS, AND SCOPE

- Period comes from the document type + the `year` captured at upload (P&L: fiscal
  year; balance sheet: as-of; tax return: tax year).
- **Conflicts are not reconciled.** Two documents covering the same metric and the same
  period are both stored; `getMetricAutoPopulate` takes the most recent row. A 2024
  return and a 2025 P&L are different periods and are not in conflict; two 2025 figures
  that disagree are, and today the newer upload silently wins. This is the highest
  value problem Phase 6C's fact layer is meant to solve.
- Scope classification is server-side and explicit: household → no business, hybrid →
  explicit context only (never a primary-business fallback), business → admin target →
  active business → primary → auto-create.

---

## 7. THE VIEWER DEEP LINK (one contract)

```js
const openDocument = useOpenDocument(onOpenWorkspace);
openDocument(documentId, { needs: 'Annual revenue' });
```

- Inside Vision → `?workspace=data-room&id=<documentId>` (the workspace layer owns the
  trail, so Back returns to the surface that opened it).
- Elsewhere → `/data-room?document=<documentId>`.
- The Data Room resolves the id **against the active business's own document list**.
  Not in the list → no viewer, request cleared, "That document is not in this Data
  Room". A document id from another business cannot be opened, because it is never in
  the list, and `getDocumentSignedUrl` asserts business access server-side as well.
- Closing the viewer clears the request, so Back/refresh do not reopen it.
- `?needs=<label>` renders the contextual "Vision needs more information" header above
  the existing upload flow, with the supported types named and an Upload action.

---

## 8. PROCESSING STATES (what the owner sees, and what is true)

`upload_status`: `pending_analysis` → `analyzing` → `completed` | `needs_review` |
`failed`. `analysis_status` mirrors it on `document_analysis`.

- The Data Room shows Uploaded / Completed / Needs Review / Pending counts, per-row
  status badges, a Retry action for `failed`/`needs_review`/`pending_analysis`, and a
  Mark-needs-review action.
- Extraction runs inside the upload request, so a document that returns successfully is
  already analyzed. A failure inside extraction is non-fatal: the document exists and
  the analysis stays queued, retryable.
- Unsupported types complete without fields rather than pretending to be understood.

---

## 9. KNOWN LIMITATIONS (carried into Phase 6C)

1. No cash-flow / bank / GL / trial-balance / AR-AP / valuation-report extraction.
2. Nine P&L fields, twelve balance-sheet-adjacent and payroll fields are extracted and
   unused downstream.
3. Same-period conflicts are resolved by recency, not by reconciliation.
4. No fact-level provenance: a value's source is a *category* ("uploaded documents")
   plus, where the row carries it, one document id. Multiple documents behind one value
   are not represented.
5. Galileo cites documents as prose strings; the structured `{document_id, name}`
   evidence behind an answer is not yet returned to the answer panel.
6. Valuation takes no **inputs** from documents: `valuationService` reads them as
   intelligence/evidence, and advisor-governed values are never overwritten.
7. Nothing is event-driven. Extraction changes data; every other system sees it on its
   next read. Opportunities and Sprints are generated on demand, so a document improves
   them the next time they run, not the moment it is processed.
8. **The review-status asymmetry is the reason a new document does not always move the
   BI% number.** Assessments pre-populate from `pending_review` values; the BIS contract
   (and therefore Business Pulse and completeness) requires `accepted`/`corrected`. A
   fresh extraction is visible to the owner's assessments immediately and to BIS only
   after review.

---

*Companion: `VISION_DOCUMENT_INTELLIGENCE_AUDIT.md` (findings, repairs, and the
validation matrix still to run).*